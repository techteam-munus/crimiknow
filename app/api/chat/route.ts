export const runtime = "edge";

import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const maxDuration = 60;

const aiGateway = createOpenAICompatible({
  name: "ai-gateway",
  baseURL: "https://ai-gateway.vercel.sh/v1",
  headers: {
    Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}`,
  },
});

// Admin client to bypass RLS for saving chat history
const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Azure AI Search Agentic Retrieval API
 *
 * Required environment variables:
 * - AZURE_SEARCH_ENDPOINT: Your Azure AI Search endpoint (e.g., https://your-service.search.windows.net)
 * - AZURE_SEARCH_API_KEY: Your Azure AI Search admin or query API key
 * - AZURE_AI_SYSTEM_PROMPT: (Optional) Fallback system prompt; primary source is app_settings DB table
 *
 * Uses the crimiknow-knowledge agent with answer synthesis to generate
 * complete answers directly from the knowledge base.
 */
const getAzureSearchConfig = () => {
  const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
  const apiKey = process.env.AZURE_SEARCH_API_KEY;
  const agentName = "crimiknow-knowledge";

  if (!endpoint || !apiKey) {
    return null;
  }

  const baseUrl = endpoint.replace(/\/$/, "");
  return { baseUrl, apiKey, agentName };
};

// Fetch system prompt from app_settings DB table, fallback to env var, then hardcoded default
const getSystemPrompt = async (): Promise<string> => {
  try {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "system_prompt")
      .maybeSingle();
    if (data?.value) return data.value;
  } catch {
    /* DB read failed, fall through */
  }
  return (
    process.env.AZURE_AI_SYSTEM_PROMPT ||
    "You are CrimiKnow, an AI-powered criminal law library for Philippine criminal law. Provide comprehensive, detailed answers with legal citations referencing the Revised Penal Code, special penal laws, and relevant jurisprudence."
  );
};

interface ChatMessage {
  role: string;
  content: string;
}

export async function POST(req: Request) {
  let supabase;
  let user;

  try {
    supabase = await createClient();

    // Check if user is authenticated
    const { data, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error("Auth error:", authError.message);
      return Response.json(
        {
          error: "Authentication failed",
          message: "Please try again or refresh the page.",
        },
        { status: 401 },
      );
    }

    if (!data.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    user = data.user;
  } catch (error) {
    console.error("Supabase connection error:", error);
    return Response.json(
      {
        error: "Connection error",
        message:
          "Unable to connect to authentication service. Please try again.",
      },
      { status: 503 },
    );
  }

  // Check maintenance mode (admins bypass)
  const [{ data: maintSetting }, { data: profile }] = await Promise.all([
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "maintenance_enabled")
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (maintSetting?.value === "true" && !profile?.is_admin) {
    // Check time window
    const [{ data: startSetting }, { data: endSetting }, { data: msgSetting }] =
      await Promise.all([
        supabase
          .from("app_settings")
          .select("value")
          .eq("key", "maintenance_start")
          .maybeSingle(),
        supabase
          .from("app_settings")
          .select("value")
          .eq("key", "maintenance_end")
          .maybeSingle(),
        supabase
          .from("app_settings")
          .select("value")
          .eq("key", "maintenance_message")
          .maybeSingle(),
      ]);
    const startTime = startSetting?.value || "";
    const endTime = endSetting?.value || "";
    const now = Date.now();
    const hasStart = startTime.length > 0;
    const hasEnd = endTime.length > 0;
    const startMs = hasStart ? new Date(startTime).getTime() : 0;
    const endMs = hasEnd ? new Date(endTime).getTime() : Infinity;

    const isActive = (!hasStart && !hasEnd) || (now >= startMs && now <= endMs);
    if (isActive) {
      return Response.json(
        {
          error: "System maintenance",
          message:
            msgSetting?.value ||
            "CrimiKnow is currently undergoing scheduled maintenance. Please try again later.",
          code: "MAINTENANCE",
        },
        { status: 503 },
      );
    }
  }

  // Fetch subscription first
  const { data: subscription } = await supabase
    .from("user_subscriptions")
    .select("*, subscription_tiers(*)")
    .eq("user_id", user.id)
    .maybeSingle();

  const tier = subscription?.subscription_tiers;
  const isFreeTier = tier?.name?.toLowerCase() === "free";

  // --- CHECK 1: Subscription period expiry ---
  // If 1 month is up, block the user even if they have queries left.
  // They must subscribe again (paid plans) or they're done (free trial).
  if (subscription?.current_period_end) {
    const periodEnd = new Date(subscription.current_period_end);
    if (new Date() > periodEnd) {
      // Mark subscription as expired
      await supabaseAdmin
        .from("user_subscriptions")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", subscription.id);

      if (isFreeTier) {
        // Free trial period ended -- mark as used so they can't re-subscribe to free
        await supabaseAdmin
          .from("profiles")
          .update({ has_used_free_trial: true })
          .eq("id", user.id);

        return Response.json(
          {
            error: "Free trial expired",
            message:
              "Your free trial period has expired. Please subscribe to a paid plan to continue using CrimiKnow.",
            code: "FREE_TRIAL_EXPIRED",
          },
          { status: 403 },
        );
      }

      return Response.json(
        {
          error: "Subscription expired",
          message:
            "Your monthly subscription has expired. Please renew your plan to continue using CrimiKnow.",
          code: "SUBSCRIPTION_EXPIRED",
        },
        { status: 403 },
      );
    }
  }

  // --- CHECK 2: Query limit within current period ---
  // Fetch usage tied to the subscription period (not calendar month)
  const periodStart =
    subscription?.current_period_start ||
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const { data: usage } = await supabase
    .from("usage_tracking")
    .select("*")
    .eq("user_id", user.id)
    .gte("period_start", periodStart)
    .order("period_start", { ascending: false })
    .limit(1)
    .single();

  const queriesLimit = tier?.queries_per_month || 5;
  const queriesUsed = usage?.query_count || 0;

  if (queriesLimit !== -1 && queriesUsed >= queriesLimit) {
    if (isFreeTier) {
      // Free tier queries exhausted -- mark trial as used, block permanently from free
      await supabaseAdmin
        .from("profiles")
        .update({ has_used_free_trial: true })
        .eq("id", user.id);

      return Response.json(
        {
          error: "Free trial exhausted",
          message:
            "You have used all your free trial questions. Please subscribe to a paid plan to continue using CrimiKnow.",
          code: "FREE_TRIAL_EXHAUSTED",
        },
        { status: 403 },
      );
    }

    return Response.json(
      {
        error: "Query limit reached",
        message:
          "You have used all your queries for this billing period. Please renew or upgrade your plan to continue.",
        code: "USAGE_LIMIT_REACHED",
      },
      { status: 429 },
    );
  }

  const body = await req.json();
  const messages: ChatMessage[] = body.messages || [];
  let sessionId: string | null = null;

  // Always create a new session for each question (each Q&A = 1 sidebar entry)
  const lastUserMsg = messages[messages.length - 1];
  const title = (
    lastUserMsg?.role === "user" ? lastUserMsg.content : "New Chat"
  ).substring(0, 100);

  const { data: newSession, error: sessionError } = await supabaseAdmin
    .from("chat_sessions")
    .insert({ user_id: user.id, title })
    .select("id")
    .single();

  if (sessionError) {
    console.error("Failed to create chat session:", sessionError);
  }

  if (newSession) {
    sessionId = newSession.id;
  }

  const lastUserMessage = messages[messages.length - 1];
  let userMessageId: string | null = null;

  // Enforce max 10 sessions per user - delete oldest beyond limit
  const { data: allSessions } = await supabaseAdmin
    .from("chat_sessions")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (allSessions && allSessions.length > 10) {
    const sessionsToDelete = allSessions.slice(10).map((s) => s.id);
    await supabaseAdmin
      .from("chat_messages")
      .delete()
      .in("session_id", sessionsToDelete);
    await supabaseAdmin
      .from("chat_sessions")
      .delete()
      .in("id", sessionsToDelete);
  }

  // Save user message to database
  if (sessionId && lastUserMessage?.role === "user") {
    const { data: savedUserMsg, error: msgError } = await supabaseAdmin
      .from("chat_messages")
      .insert({
        session_id: sessionId,
        user_id: user.id,
        role: "user",
        content: lastUserMessage.content,
      })
      .select("id")
      .single();

    if (msgError) {
      console.error("[v0] Failed to save user message:", msgError);
    }

    if (savedUserMsg) {
      userMessageId = savedUserMsg.id;
    }
  }

  // Check curated answers first - look for approved (thumbs up) answers
  // that match the user's question before calling Azure AI
  if (lastUserMessage?.role === "user") {
    const userQuestion = lastUserMessage.content.trim().toLowerCase();

    // Search for matching curated answers with rating_status = 'thumbs_up' (approved)
    const { data: curatedMatches } = await supabase
      .from("curated_answers")
      .select("*")
      .eq("rating_status", "thumbs_up")
      .eq("is_active", true);

    if (curatedMatches && curatedMatches.length > 0) {
      // Normalize: remove punctuation, lowercase, collapse spaces
      const normalize = (s: string) =>
        s
          .toLowerCase()
          .replace(/[?!.,;:'"()\-]/g, "")
          .replace(/\s+/g, " ")
          .trim();
      // Get sorted word set for order-independent comparison
      const getWordSet = (s: string) =>
        normalize(s).split(" ").filter(Boolean).sort().join(" ");

      const normalizedUser = normalize(userQuestion);
      const userWordSet = getWordSet(userQuestion);

      // Find a match using multiple strategies
      const matchedAnswer = curatedMatches.find((ca) => {
        const curatedQuestion = ca.question.trim().toLowerCase();
        const normalizedCurated = normalize(curatedQuestion);
        const curatedWordSet = getWordSet(curatedQuestion);

        // 1. Exact match
        if (curatedQuestion === userQuestion) return true;
        // 2. Normalized exact match (ignore punctuation/spacing)
        if (normalizedCurated === normalizedUser) return true;
        // 3. Word-set match (same words in any order)
        if (curatedWordSet === userWordSet) return true;
        // 4. One contains the other
        if (
          normalizedCurated.includes(normalizedUser) ||
          normalizedUser.includes(normalizedCurated)
        )
          return true;
        // 5. Word-set containment (all key words from curated exist in user query or vice versa)
        const curatedWords = new Set(
          normalizedCurated.split(" ").filter((w) => w.length > 2),
        );
        const userWords = new Set(
          normalizedUser.split(" ").filter((w) => w.length > 2),
        );
        if (curatedWords.size > 0 && userWords.size > 0) {
          const curatedInUser = [...curatedWords].every((w) =>
            userWords.has(w),
          );
          const userInCurated = [...userWords].every((w) =>
            curatedWords.has(w),
          );
          if (curatedInUser && userInCurated) return true;
        }
        return false;
      });

      if (matchedAnswer) {
        // Save assistant message from curated answer
        let assistantMessageId: string | null = null;
        if (sessionId) {
          const { data: savedAssistantMsg, error: curatedSaveError } =
            await supabaseAdmin
              .from("chat_messages")
              .insert({
                session_id: sessionId,
                user_id: user.id,
                role: "assistant",
                content: matchedAnswer.answer,
              })
              .select("id")
              .single();

          if (curatedSaveError) {
            console.error(
              "[v0] Failed to save curated answer message:",
              curatedSaveError,
            );
          }

          if (savedAssistantMsg) {
            assistantMessageId = savedAssistantMsg.id;
          }
        }

        // Increment usage count for curated answers too
        if (usage) {
          await supabaseAdmin
            .from("usage_tracking")
            .update({
              query_count: queriesUsed + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", usage.id);
        } else {
          const subStart =
            subscription?.current_period_start ||
            new Date(
              new Date().getFullYear(),
              new Date().getMonth(),
              1,
            ).toISOString();
          const subEnd =
            subscription?.current_period_end ||
            new Date(
              new Date().getFullYear(),
              new Date().getMonth() + 1,
              0,
            ).toISOString();
          await supabaseAdmin.from("usage_tracking").insert({
            user_id: user.id,
            query_count: 1,
            period_start: subStart,
            period_end: subEnd,
          });
        }

        return Response.json(
          {
            content: matchedAnswer.answer,
            provider: "curated-answer",
            sessionId,
            userMessageId,
            assistantMessageId,
          },
          {
            headers: {
              "X-AI-Provider": "curated-answer",
            },
          },
        );
      }
    }
  }

  // Increment usage count
  if (usage) {
    await supabaseAdmin
      .from("usage_tracking")
      .update({
        query_count: queriesUsed + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", usage.id);
  } else {
    const subStart =
      subscription?.current_period_start ||
      new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      ).toISOString();
    const subEnd =
      subscription?.current_period_end ||
      new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        0,
      ).toISOString();
    await supabaseAdmin.from("usage_tracking").insert({
      user_id: user.id,
      query_count: 1,
      period_start: subStart,
      period_end: subEnd,
    });
  }

  // Azure AI Search Agentic Retrieval with Answer Synthesis
  const searchConfig = getAzureSearchConfig();

  if (!searchConfig) {
    return Response.json(
      {
        error: "Configuration error",
        message:
          "Azure AI Search is not configured. Please set AZURE_SEARCH_ENDPOINT and AZURE_SEARCH_API_KEY.",
      },
      { status: 500 },
    );
  }

  const { baseUrl, apiKey, agentName } = searchConfig;
  const apiVersion = "2025-11-01-preview";
  const url = `${baseUrl}/knowledgebases/${agentName}/retrieve?api-version=${apiVersion}`;

  // Build messages for the agentic retrieval API
  // Format: content must be array of { type: "text", text: string }
  // Load system prompt from DB (admin-editable), falling back to env var or hardcoded default
  const sysPrompt = await getSystemPrompt();

  const agentMessages: Array<{
    role: string;
    content: Array<{ type: string; text: string }>;
  }> = [];

  // Add system context as assistant message with academic framing
  agentMessages.push({
    role: "assistant",
    content: [
      {
        type: "text",
        text:
          sysPrompt +
          "\n\nThis is an academic legal education platform for Philippine bar exam review. All content is for educational purposes.",
      },
    ],
  });

  // Add conversation messages with academic framing on user messages
  for (const m of messages) {
    agentMessages.push({
      role: m.role === "user" ? "user" : "assistant",
      content: [
        {
          type: "text",
          text:
            m.role === "user"
              ? `[Academic legal study question]: ${m.content}`
              : m.content,
        },
      ],
    });
  }

  // Helper to extract docs from agentic retrieval response
  const extractDocs = (result: Record<string, unknown>): string[] => {
    const docs: string[] = [];
    const extractFromRefs = (refs: Array<Record<string, unknown>>) => {
      for (const ref of refs) {
        if (ref.sourceData)
          docs.push(
            typeof ref.sourceData === "string"
              ? ref.sourceData
              : JSON.stringify(ref.sourceData),
          );
        if (ref.content)
          docs.push(
            typeof ref.content === "string"
              ? ref.content
              : JSON.stringify(ref.content),
          );
      }
    };
    if (result.response && Array.isArray(result.response)) {
      for (const msg of result.response as Array<Record<string, unknown>>) {
        if (msg.content && Array.isArray(msg.content)) {
          for (const c of msg.content as Array<Record<string, unknown>>) {
            if (c.type === "text" && c.text) docs.push(c.text as string);
          }
        }
        if (msg.references && Array.isArray(msg.references))
          extractFromRefs(msg.references as Array<Record<string, unknown>>);
      }
    }
    if (result.references && Array.isArray(result.references))
      extractFromRefs(result.references as Array<Record<string, unknown>>);
    return docs;
  };

  // --- Extract keyword-only search terms from user question ---
  // Strips natural language, keeps only legal citations/terms to bypass content filter
  const extractLegalKeywords = (question: string): string => {
    const keywords: string[] = [];

    // Articles
    const arts = question.match(/Art(?:icle)?\.?\s*\d+/gi);
    if (arts) keywords.push(...arts);

    // G.R. Numbers
    const grs = question.match(/G\.R\.\s*No[s]?\.\s*(?:L-)?\d+[-\d]*/gi);
    if (grs) keywords.push(...grs);

    // Laws: R.A., P.D., B.P., E.O., A.M.
    const laws = question.match(
      /(?:R\.A\.|RA|Republic Act|P\.D\.|PD|Presidential Decree|B\.P\.|BP|Batas Pambansa|E\.O\.|EO|Executive Order|A\.M\.|AM|Administrative Matter|Act No\.)\s*(?:No\.?\s*)?\d+/gi,
    );
    if (laws) keywords.push(...laws);

    // Case names: "X v. Y" / "X vs. Y"
    const cases = question.match(
      /[A-Za-zÀ-ÿñÑ]+(?:\s+[A-Za-zÀ-ÿñÑ]+)*\s+v[s]?\.\s+[A-Za-zÀ-ÿñÑ]+(?:\s+[A-Za-zÀ-ÿñÑ]+)*/gi,
    );
    if (cases) keywords.push(...cases);

    // Named laws
    const named = question.match(
      /(?:Revised Penal Code|Dangerous Drugs Act|Cybercrime Prevention Act|Anti-[A-Za-z\s]+(?:Act|Law)|Data Privacy Act|Special Protection of Children|Anti-Trafficking|Anti-Graft|Human Security Act|Comprehensive Firearms|Anti-Money Laundering|Anti-Violence Against Women|Anti-Hazing|Plunder Law|Anti-Fencing Law|Bouncing Checks Law|Anti-Sexual Harassment)/gi,
    );
    if (named) keywords.push(...named);

    // Bar exam references
    const barExam = question.match(/(?:19|20)\d{2}\s+Bar\s+Examination[s]?/gi);
    if (barExam) keywords.push(...barExam);

    // Legal concepts (nouns from the question, stripped of stop words)
    const stopWords = new Set([
      "the",
      "a",
      "an",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "shall",
      "should",
      "may",
      "might",
      "can",
      "could",
      "of",
      "in",
      "to",
      "for",
      "with",
      "on",
      "at",
      "by",
      "from",
      "as",
      "into",
      "through",
      "during",
      "before",
      "after",
      "above",
      "below",
      "between",
      "under",
      "about",
      "against",
      "this",
      "that",
      "these",
      "those",
      "what",
      "which",
      "who",
      "whom",
      "how",
      "when",
      "where",
      "why",
      "if",
      "then",
      "than",
      "but",
      "and",
      "or",
      "not",
      "no",
      "nor",
      "so",
      "very",
      "just",
      "also",
      "i",
      "me",
      "my",
      "we",
      "our",
      "you",
      "your",
      "he",
      "she",
      "it",
      "they",
      "them",
      "their",
    ]);
    const words = question
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopWords.has(w.toLowerCase()));
    // Take up to 5 significant words if no legal citations found
    if (keywords.length === 0 && words.length > 0) {
      keywords.push(...words.slice(0, 5));
    }

    return [...new Set(keywords)].join(" ");
  };

  // Helper: plain Azure AI Search (no LLM, no content filter) -- searches all 4 indexes in PARALLEL
  const searchIndexes = [
    "crimiknowindex-rag-indexer",
    "crimiknow-rag",
    "crimiknow2-rag",
    "crimiknowbarexam",
  ];
  const plainSearchFallback = async (
    query: string,
  ): Promise<{ docs: string[]; docNames: string[] }> => {
    const searchApiVersion = "2024-07-01";

    // Search all indexes in parallel
    const results = await Promise.allSettled(
      searchIndexes.map(async (indexName) => {
        const searchUrl = `${baseUrl}/indexes/${indexName}/docs/search?api-version=${searchApiVersion}`;
        const searchResponse = await fetch(searchUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "api-key": apiKey },
          body: JSON.stringify({
            search: query,
            queryType: "simple",
            top: 5,
            select: "*",
          }),
        });
        if (!searchResponse.ok)
          return { contents: [] as string[], names: [] as string[] };
        const searchResult = await searchResponse.json();
        if (!searchResult.value || !Array.isArray(searchResult.value))
          return { contents: [] as string[], names: [] as string[] };
        const contents: string[] = [];
        const names: string[] = [];
        for (const doc of searchResult.value) {
          const content =
            doc.content ||
            doc.chunk ||
            doc.text ||
            doc.page_content ||
            doc.merged_content ||
            "";
          if (content)
            contents.push(
              typeof content === "string" ? content : JSON.stringify(content),
            );
          // Extract parent document name from metadata_storage_path or parent_id
          const pathField = doc.metadata_storage_path || doc.parent_id || "";
          if (pathField) {
            try {
              let decoded = pathField;
              if (typeof decoded === "string" && decoded.startsWith("aHR0")) {
                let padded = decoded;
                while (padded.length % 4 !== 0) padded += "=";
                decoded = Buffer.from(padded, "base64").toString("utf-8");
              }
              decoded = decoded.replace(/[\x00-\x1f]/g, "");
              const filename = decodeURIComponent(
                decoded.split("/").pop() || "",
              ).replace(/\.(pdf|docx?|xlsx?|pptx?|txt)\d*$/i, "");
              if (filename) names.push(filename);
            } catch {
              /* skip */
            }
          }
          // Also try title field
          const title = doc.title || doc.metadata_storage_name || "";
          if (title && typeof title === "string") {
            names.push(title.replace(/\.(pdf|docx?|xlsx?|pptx?|txt)$/i, ""));
          }
        }
        return { contents, names };
      }),
    );

    const docs: string[] = [];
    const docNames: string[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") {
        docs.push(...r.value.contents);
        docNames.push(...r.value.names);
      }
    }
    return { docs, docNames: [...new Set(docNames)] };
  };

  // --- STEP 1: RETRIEVE DOCUMENTS via plain index search (parallel across all indexes) ---
  // Agentic Retrieval disabled: Azure content filter + 503 errors make it unreliable
  // Plain search hits the same 4 indexes in parallel and is fast + reliable
  let retrievedDocs = "";
  let retrievedDocNames: string[] = [];
  {
    const userQuestion =
      messages.filter((m) => m.role === "user").pop()?.content || "";
    const { docs, docNames } = await plainSearchFallback(userQuestion);
    retrievedDocs = docs.join("\n\n---\n\n");
    retrievedDocNames = docNames;
  }

  if (!retrievedDocs) {
    return Response.json(
      {
        error: "No documents found",
        message:
          "No relevant documents found in the knowledge base. Please try rephrasing your question.",
      },
      { status: 404 },
    );
  }

  // --- STEP 2: GENERATE ANSWER USING AI SDK (no Azure content filter) ---
  // Read active model from DB (admin-configurable), fall back to env, then default
  let activeModel = process.env.AI_MODEL || "google/gemini-3-flash";

  try {
    const { data: modelSetting } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "ai_model")
      .maybeSingle();
    if (modelSetting?.value) activeModel = modelSetting.value;
  } catch {
    /* use default */
  }

  try {
    const { streamText } = await import("ai");

    const userQuestion =
      messages.filter((m) => m.role === "user").pop()?.content || "";

    const result = streamText({
      model: aiGateway(activeModel),
      system:
        sysPrompt +
        `\n\nCRITICAL RULES FOR CITATIONS AND SOURCES:
1. You may ONLY reference information that appears in the RETRIEVED DOCUMENTS below. Do NOT use your training data or general knowledge to add cases, G.R. numbers, dates, or legal citations that are not explicitly present in the retrieved documents.
2. When a case name (e.g., "People v. Bariquit") is merely MENTIONED or CITED within a document about a DIFFERENT case, you must NOT present it as if you have the full text of that case. Instead, say something like "as cited in [Document Name]" to make it clear the information comes secondhand.
3. Only create citation links for cases/laws where the retrieved document IS the actual document for that case/law (i.e., the document title/filename matches the case name). Do NOT create citation links for cases that are only mentioned within other documents, as those links will not resolve to the correct PDF.
4. If the user asks about a specific case and that case's own document is NOT in the retrieved results, clearly state: "The specific document for [case name] was not found in the knowledge base, but it is referenced in [other document name]."
5. Never invent or fabricate G.R. numbers, dates, or case details. If a detail is not in the retrieved documents, do not include it.

--- RETRIEVED DOCUMENTS ---
${retrievedDocs}
--- END DOCUMENTS ---`,
      messages: messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      maxOutputTokens: 16000,
      temperature: 0.3,
    });

    // Helper to add citation links to final content
    // Only links jurisprudence/laws that match an actual retrieved document filename
    const addCitationLinks = (
      text: string,
      knownDocNames: string[] = [],
    ): string => {
      // Build a set of lowercase doc name fragments for matching
      const knownNamesLower = knownDocNames.map((n) => n.toLowerCase());

      // Check if a citation matches a known retrieved document
      const matchesKnownDoc = (citation: string): boolean => {
        const citLower = citation.toLowerCase();
        // Direct match
        if (
          knownNamesLower.some(
            (n) => n.includes(citLower) || citLower.includes(n),
          )
        )
          return true;
        // Extract surname from case name and check
        const surnameMatch = citLower.match(/v[s]?\.\s+([a-zà-ÿñ]+)/i);
        if (surnameMatch) {
          const surname = surnameMatch[1];
          if (
            surname.length > 2 &&
            knownNamesLower.some((n) => n.includes(surname))
          )
            return true;
        }
        // Extract G.R. number and check
        const grMatch = citLower.match(
          /g\.?r\.?\s*no[s]?\.?\s*((?:l-)?[\d-]+)/i,
        );
        if (grMatch) {
          const grNum = grMatch[1];
          if (knownNamesLower.some((n) => n.includes(grNum))) return true;
        }
        return false;
      };

      text = text
        .replace(/crimiknowindex/gi, "CI")
        .replace(/crimiknowacademe2/gi, "C2")
        .replace(/crimiknowacademe/gi, "C1")
        .replace(/crimiknowbarexam/gi, "CB");

      const getSearchUrl = (query: string, source?: string): string =>
        `/api/documents?search=${encodeURIComponent(query)}${source ? `&source=${source}` : ""}`;
      const getRpcUrl = (param: string): string =>
        `/api/documents?type=rpc&q=${encodeURIComponent(param)}`;

      // Track already-linked text per line to avoid double-linking
      const isAlreadyLinked = (line: string, text: string): boolean =>
        line.includes(`[${text}](`) ||
        line.includes(`[${text.replace(/\*{2,}/g, "")}](`);

      return text
        .split("\n")
        .map((line) => {
          // Skip lines that are already fully linked
          if (/\]\(\/api\/documents/.test(line)) return line;

          // --- 1) RPC Article references (Art. 248, Article 249 of the RPC, etc.) ---
          line = line.replace(
            /\*{0,2}((?:Art(?:icle)?\.?\s*\d+)(?:\s*(?:of\s+(?:the\s+)?|,\s*|-\s*)(?:Revised Penal Code|RPC|Act No\.\s*\d+))?)\*{0,2}/gi,
            (match, citation) => {
              const cleaned = citation.replace(/\*{2,}/g, "").trim();
              if (cleaned.length < 5) return match;
              if (isAlreadyLinked(line, cleaned)) return match;
              const artNum = cleaned.match(/Art(?:icle)?\.?\s*(\d+)/i);
              const searchTerm = artNum ? `Article ${artNum[1]}` : cleaned;
              return `[${cleaned}](${getRpcUrl(searchTerm)})`;
            },
          );

          // --- 2) "Revised Penal Code" standalone ---
          if (!/\[[^\]]*Revised Penal Code[^\]]*\]\(/.test(line)) {
            line = line.replace(
              /\*{0,2}(Revised Penal Code)\*{0,2}/gi,
              (match, citation) => {
                const cleaned = citation.replace(/\*{2,}/g, "").trim();
                return `[${cleaned}](${getRpcUrl("Revised Penal Code")})`;
              },
            );
          }

          // --- 3) Jurisprudence: G.R. No. references (only if doc exists in retrieved results) ---
          line = line.replace(
            /\*{0,2}(G\.R\.?\s*No[s]?\.?\s*(?:L-)?[\d-]+(?:\s*,\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4})?)\*{0,2}/gi,
            (match, citation) => {
              const cleaned = citation.replace(/\*{2,}/g, "").trim();
              if (isAlreadyLinked(line, cleaned)) return match;
              if (!matchesKnownDoc(cleaned)) return match; // not a retrieved document, don't link
              return `[${cleaned}](${getSearchUrl(cleaned)})`;
            },
          );

          // --- 4) Jurisprudence: Case names (only link if the actual case document was retrieved) ---
          line = line.replace(
            /\*{0,2}((?:People|Republic|State|Commissioner|Director|Secretary|City|Province|Municipality|Heirs)\s+(?:of\s+(?:the\s+)?(?:Philippines?\s+)?)?v[s]?\.\s+[A-Z][A-Za-zÀ-ÿñÑ]+(?:\s+(?:et\s+al\.?|Jr\.|Sr\.|III|IV))?)\*{0,2}/gi,
            (match, citation) => {
              const cleaned = citation.replace(/\*{2,}/g, "").trim();
              if (isAlreadyLinked(line, cleaned)) return match;
              if (!matchesKnownDoc(cleaned)) return `**${cleaned}**`; // bold but don't link
              return `[${cleaned}](${getSearchUrl(cleaned)})`;
            },
          );
          // Reverse pattern: Surname v. People/Republic/State
          line = line.replace(
            /\*{0,2}([A-Z][A-Za-zÀ-ÿñÑ]+(?:\s+(?:Jr\.|Sr\.|III|IV))?\s+v[s]?\.\s+(?:People|Republic|State|Court of Appeals|Sandiganbayan|Commission)(?:\s+of\s+the\s+Philippines)?)\*{0,2}/gi,
            (match, citation) => {
              const cleaned = citation.replace(/\*{2,}/g, "").trim();
              if (isAlreadyLinked(line, cleaned)) return match;
              if (!matchesKnownDoc(cleaned)) return `**${cleaned}**`; // bold but don't link
              return `[${cleaned}](${getSearchUrl(cleaned)})`;
            },
          );

          // --- 5) Special laws: R.A. No. 1234, P.D. No. 1234, B.P. Blg. 22, Act No. 3815, etc. ---
          line = line.replace(
            /\*{0,2}((?:R\.A\.|RA|Republic Act|P\.D\.|PD|Presidential Decree|B\.P\.|BP|Batas Pambansa|E\.O\.|EO|Executive Order|A\.M\.|AM|Administrative Matter|Act)\s*(?:No\.?|Blg\.?)?\s*\d+(?:-?\d+)?)\*{0,2}/gi,
            (match, citation) => {
              const cleaned = citation.replace(/\*{2,}/g, "").trim();
              if (cleaned.length < 5) return match;
              if (isAlreadyLinked(line, cleaned)) return match;
              // Don't re-link if it's part of an RPC reference already linked
              if (/Act No\.\s*3815/i.test(cleaned)) {
                return `[${cleaned}](${getRpcUrl("Revised Penal Code")})`;
              }
              return `[${cleaned}](${getSearchUrl(cleaned)})`;
            },
          );

          // --- 6) Named laws (common Philippine special penal laws) ---
          const namedLaws = [
            "Comprehensive Dangerous Drugs Act",
            "Dangerous Drugs Act",
            "Anti-Trafficking in Persons Act",
            "Anti-Violence Against Women",
            "Anti-Fencing Law",
            "Anti-Graft and Corrupt Practices Act",
            "Anti-Plunder Act",
            "Anti-Money Laundering Act",
            "Anti-Hazing Act",
            "Anti-Photo and Video Voyeurism Act",
            "Anti-Child Pornography Act",
            "Anti-Torture Act",
            "Anti-Enforced or Involuntary Disappearance Act",
            "Cybercrime Prevention Act",
            "Data Privacy Act",
            "Human Security Act",
            "Anti-Terrorism Act",
            "Juvenile Justice and Welfare Act",
            "Indeterminate Sentence Law",
            "Probation Law",
            "Special Protection of Children Against Abuse",
            "Child Abuse Act",
            "Bouncing Checks Law",
            "Anti-Carnapping Act",
            "Illegal Possession of Firearms",
            "Comprehensive Firearms and Ammunition Regulation Act",
          ];
          for (const lawName of namedLaws) {
            const escapedName = lawName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(`\\*{0,2}(${escapedName})\\*{0,2}`, "gi");
            line = line.replace(regex, (match, citation) => {
              const cleaned = citation.replace(/\*{2,}/g, "").trim();
              if (isAlreadyLinked(line, cleaned)) return match;
              return `[${cleaned}](${getSearchUrl(cleaned)})`;
            });
          }

          // --- 7) Bar exam: only "YYYY Bar Examination(s)" or "Bar Examination(s) YYYY" -> source=barexam ---
          line = line.replace(
            /\*{0,2}((?:19|20)\d{2}\s+Bar\s+Examination[s]?)\*{0,2}/gi,
            (match, citation) => {
              const cleaned = citation.replace(/\*{2,}/g, "").trim();
              if (isAlreadyLinked(line, cleaned)) return match;
              return `[${cleaned}](${getSearchUrl(cleaned, "barexam")})`;
            },
          );
          line = line.replace(
            /\*{0,2}(Bar\s+Examination[s]?\s+(?:19|20)\d{2})\*{0,2}/gi,
            (match, citation) => {
              const cleaned = citation.replace(/\*{2,}/g, "").trim();
              if (isAlreadyLinked(line, cleaned)) return match;
              return `[${cleaned}](${getSearchUrl(cleaned, "barexam")})`;
            },
          );

          return line;
        })
        .join("\n");
    };

    // Stream using TransformStream with pipeThrough for proper streaming
    // This avoids blocking in start() which causes AWS Gateway timeouts
    const encoder = new TextEncoder();
    let fullContent = "";

    const transform = new TransformStream<string, Uint8Array>({
      transform(chunk, controller) {
        fullContent += chunk;
        controller.enqueue(encoder.encode(chunk));
      },
      async flush(controller) {
        try {
          // Post-process citations
          const processedContent = addCitationLinks(
            fullContent,
            retrievedDocNames,
          );

          // Save assistant message to DB
          let assistantMessageId: string | null = null;
          if (sessionId) {
            const { data: saved } = await supabaseAdmin
              .from("chat_messages")
              .insert({
                session_id: sessionId,
                user_id: user.id,
                role: "assistant",
                content: processedContent,
              })
              .select("id")
              .single();
            if (saved) assistantMessageId = saved.id;
          }

          // Send metadata delimiter
          const meta = JSON.stringify({
            __meta: true,
            content: processedContent,
            sessionId,
            userMessageId,
            assistantMessageId,
            provider: "azure-search-gemini",
            truncated: false,
          });
          controller.enqueue(
            encoder.encode(`\n\n__CRIMIKNOW_STREAM_END__\n${meta}`),
          );
        } catch (err) {
          console.error("[AI SDK Stream Flush Error]", err);
        }
      },
    });

    // Pipe the AI SDK stream through our transform - chunks flow immediately
    const readable = result.textStream.pipeThrough(transform);

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-AI-Provider": "azure-search-gemini",
      },
    });
  } catch (error) {
    console.error("[AI SDK Error]", error);
    return Response.json(
      {
        error: "Request failed",
        message: "Failed to generate answer. Please try again.",
      },
      { status: 502 },
    );
  }
}
