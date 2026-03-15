export const runtime = "edge";

import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText } from "ai";

export const maxDuration = 120;

const aiGateway = createOpenAICompatible({
  name: "ai-gateway",
  baseURL: "https://ai-gateway.vercel.sh/v1",
  headers: {
    Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}`,
  },
});

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const getAzureSearchConfig = () => {
  const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
  const apiKey = process.env.AZURE_SEARCH_API_KEY;
  if (!endpoint || !apiKey) return null;
  return { baseUrl: endpoint.replace(/\/$/, ""), apiKey };
};

interface ChatMessage {
  role: string;
  content: string;
}

export async function POST(req: Request) {
  const encoder = new TextEncoder();

  // Parse request body BEFORE creating stream (can't access req.json() inside stream)
  const body = await req.json();
  const messages: ChatMessage[] = body.messages || [];
  const lastUserMessage = messages[messages.length - 1];
  const userQuestion =
    lastUserMessage?.role === "user" ? lastUserMessage.content : "";

  // Return streaming response IMMEDIATELY to prevent AWS Gateway timeout
  // All work happens inside the stream to keep the connection alive
  const stream = new ReadableStream({
    async start(controller) {
      // Send immediate heartbeat (space character) to prevent AWS Gateway timeout
      // This is trimmed on the client side
      controller.enqueue(encoder.encode(" "));

      try {
        // Auth check
        let supabase;
        let user;
        try {
          supabase = await createClient();
          const { data, error: authError } = await supabase.auth.getUser();
          if (authError || !data.user) {
            controller.enqueue(
              encoder.encode(
                `__CRIMIKNOW_ERROR__${JSON.stringify({ error: "Authentication failed", message: "Please try again or refresh the page." })}`,
              ),
            );
            controller.close();
            return;
          }
          user = data.user;
        } catch {
          controller.enqueue(
            encoder.encode(
              `__CRIMIKNOW_ERROR__${JSON.stringify({ error: "Connection error", message: "Unable to connect to authentication service." })}`,
            ),
          );
          controller.close();
          return;
        }

        const searchConfig = getAzureSearchConfig();
        if (!searchConfig) {
          controller.enqueue(
            encoder.encode(
              `__CRIMIKNOW_ERROR__${JSON.stringify({ error: "Configuration error", message: "Azure AI Search is not configured." })}`,
            ),
          );
          controller.close();
          return;
        }

        const { baseUrl, apiKey } = searchConfig;
        const searchApiVersion = "2024-07-01";
        const searchIndexes = [
          "crimiknowindex-rag-indexer",
          "crimiknow-rag",
          "crimiknow2-rag",
          "crimiknowbarexam",
        ];

        // Run all pre-stream operations in parallel
        const [
          maintAndProfile,
          subscriptionResult,
          curatedResult,
          systemPromptResult,
          modelSettingResult,
          ...searchResults
        ] = await Promise.all([
          Promise.all([
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
          ]),
          supabase
            .from("user_subscriptions")
            .select("*, subscription_tiers(*)")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("curated_answers")
            .select("*")
            .eq("rating_status", "thumbs_up")
            .eq("is_active", true),
          supabaseAdmin
            .from("app_settings")
            .select("value")
            .eq("key", "system_prompt")
            .maybeSingle(),
          supabaseAdmin
            .from("app_settings")
            .select("value")
            .eq("key", "ai_model")
            .maybeSingle(),
          ...searchIndexes.map(async (indexName) => {
            try {
              const searchUrl = `${baseUrl}/indexes/${indexName}/docs/search?api-version=${searchApiVersion}`;
              const searchResponse = await fetch(searchUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "api-key": apiKey,
                },
                body: JSON.stringify({
                  search: userQuestion,
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
                    typeof content === "string"
                      ? content
                      : JSON.stringify(content),
                  );
                const pathField =
                  doc.metadata_storage_path || doc.parent_id || "";
                if (pathField) {
                  try {
                    let decoded = pathField;
                    if (
                      typeof decoded === "string" &&
                      decoded.startsWith("aHR0")
                    ) {
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
                const title = doc.title || doc.metadata_storage_name || "";
                if (title && typeof title === "string")
                  names.push(
                    title.replace(/\.(pdf|docx?|xlsx?|pptx?|txt)$/i, ""),
                  );
              }
              return { contents, names };
            } catch {
              return { contents: [] as string[], names: [] as string[] };
            }
          }),
        ]);

        // Process maintenance check
        const [{ data: maintSetting }, { data: profile }] = maintAndProfile;
        if (maintSetting?.value === "true" && !profile?.is_admin) {
          const [
            { data: startSetting },
            { data: endSetting },
            { data: msgSetting },
          ] = await Promise.all([
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
          const isActive =
            (!hasStart && !hasEnd) || (now >= startMs && now <= endMs);
          if (isActive) {
            controller.enqueue(
              encoder.encode(
                `__CRIMIKNOW_ERROR__${JSON.stringify({ error: "System maintenance", message: msgSetting?.value || "CrimiKnow is currently undergoing scheduled maintenance.", code: "MAINTENANCE" })}`,
              ),
            );
            controller.close();
            return;
          }
        }

        // Process subscription check
        const subscription = subscriptionResult.data;
        const tier = subscription?.subscription_tiers;
        const isFreeTier = tier?.name?.toLowerCase() === "free";

        if (subscription?.current_period_end) {
          const periodEnd = new Date(subscription.current_period_end);
          if (new Date() > periodEnd) {
            supabaseAdmin
              .from("user_subscriptions")
              .update({
                status: "expired",
                updated_at: new Date().toISOString(),
              })
              .eq("id", subscription.id);
            if (isFreeTier) {
              supabaseAdmin
                .from("profiles")
                .update({ has_used_free_trial: true })
                .eq("id", user.id);
              controller.enqueue(
                encoder.encode(
                  `__CRIMIKNOW_ERROR__${JSON.stringify({ error: "Free trial expired", message: "Your free trial period has expired. Please subscribe to a paid plan.", code: "FREE_TRIAL_EXPIRED" })}`,
                ),
              );
              controller.close();
              return;
            }
            controller.enqueue(
              encoder.encode(
                `__CRIMIKNOW_ERROR__${JSON.stringify({ error: "Subscription expired", message: "Your monthly subscription has expired. Please renew your plan.", code: "SUBSCRIPTION_EXPIRED" })}`,
              ),
            );
            controller.close();
            return;
          }
        }

        // Usage check
        const periodStart =
          subscription?.current_period_start ||
          new Date(
            new Date().getFullYear(),
            new Date().getMonth(),
            1,
          ).toISOString();
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
            supabaseAdmin
              .from("profiles")
              .update({ has_used_free_trial: true })
              .eq("id", user.id);
            controller.enqueue(
              encoder.encode(
                `__CRIMIKNOW_ERROR__${JSON.stringify({ error: "Free trial exhausted", message: "You have used all your free trial questions.", code: "FREE_TRIAL_EXHAUSTED" })}`,
              ),
            );
            controller.close();
            return;
          }
          controller.enqueue(
            encoder.encode(
              `__CRIMIKNOW_ERROR__${JSON.stringify({ error: "Query limit reached", message: "You have used all your queries for this billing period.", code: "USAGE_LIMIT_REACHED" })}`,
            ),
          );
          controller.close();
          return;
        }

        // Check curated answers
        const curatedMatches = curatedResult.data;
        if (
          lastUserMessage?.role === "user" &&
          curatedMatches &&
          curatedMatches.length > 0
        ) {
          const userQuestionLower = lastUserMessage.content
            .trim()
            .toLowerCase();
          const normalize = (s: string) =>
            s
              .toLowerCase()
              .replace(/[?!.,;:'"()\-]/g, "")
              .replace(/\s+/g, " ")
              .trim();
          const getWordSet = (s: string) =>
            normalize(s).split(" ").filter(Boolean).sort().join(" ");
          const normalizedUser = normalize(userQuestionLower);
          const userWordSet = getWordSet(userQuestionLower);

          const matchedAnswer = curatedMatches.find((ca) => {
            const curatedQuestion = ca.question.trim().toLowerCase();
            const normalizedCurated = normalize(curatedQuestion);
            const curatedWordSet = getWordSet(curatedQuestion);
            if (curatedQuestion === userQuestionLower) return true;
            if (normalizedCurated === normalizedUser) return true;
            if (curatedWordSet === userWordSet) return true;
            if (
              normalizedCurated.includes(normalizedUser) ||
              normalizedUser.includes(normalizedCurated)
            )
              return true;
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
            // Stream the curated answer
            controller.enqueue(encoder.encode(matchedAnswer.answer));

            // Save session and messages in background
            const title = lastUserMessage.content.substring(0, 100);
            supabaseAdmin
              .from("chat_sessions")
              .insert({ user_id: user.id, title })
              .select("id")
              .single()
              .then(async ({ data: newSession }) => {
                if (newSession) {
                  await supabaseAdmin.from("chat_messages").insert([
                    {
                      session_id: newSession.id,
                      user_id: user.id,
                      role: "user",
                      content: lastUserMessage.content,
                    },
                    {
                      session_id: newSession.id,
                      user_id: user.id,
                      role: "assistant",
                      content: matchedAnswer.answer,
                    },
                  ]);
                }
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
              });

            controller.enqueue(
              encoder.encode(
                `\n\n__CRIMIKNOW_STREAM_END__\n${JSON.stringify({ __meta: true, content: matchedAnswer.answer, provider: "curated-answer" })}`,
              ),
            );
            controller.close();
            return;
          }
        }

        // Process search results
        const retrievedDocs: string[] = [];
        const retrievedDocNames: string[] = [];
        for (const result of searchResults) {
          if (result && typeof result === "object" && "contents" in result) {
            retrievedDocs.push(...result.contents);
            retrievedDocNames.push(...result.names);
          }
        }
        const uniqueDocNames = [...new Set(retrievedDocNames)];
        const docsText = retrievedDocs.join("\n\n---\n\n");

        if (!docsText) {
          controller.enqueue(
            encoder.encode(
              `__CRIMIKNOW_ERROR__${JSON.stringify({ error: "No documents found", message: "No relevant documents found. Please try rephrasing your question." })}`,
            ),
          );
          controller.close();
          return;
        }

        // Get system prompt and model
        const sysPrompt =
          systemPromptResult?.data?.value ||
          process.env.AZURE_AI_SYSTEM_PROMPT ||
          "You are CrimiKnow, an AI-powered criminal law library for Philippine criminal law.";
        const activeModel =
          modelSettingResult?.data?.value ||
          process.env.AI_MODEL ||
          "google/gemini-3-flash";

        // Create session in background
        const title = (
          lastUserMessage?.role === "user"
            ? lastUserMessage.content
            : "New Chat"
        ).substring(0, 100);
        const sessionPromise = supabaseAdmin
          .from("chat_sessions")
          .insert({ user_id: user.id, title })
          .select("id")
          .single();

        // Increment usage in background
        if (usage) {
          supabaseAdmin
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
          supabaseAdmin.from("usage_tracking").insert({
            user_id: user.id,
            query_count: 1,
            period_start: subStart,
            period_end: subEnd,
          });
        }

        // Generate AI response

        const result = streamText({
          model: aiGateway(activeModel),
          system:
            sysPrompt +
            `\n\nCRITICAL RULES FOR CITATIONS AND SOURCES:
1. You may ONLY reference information that appears in the RETRIEVED DOCUMENTS below. Do NOT use your training data or general knowledge to add cases, G.R. numbers, dates, or legal citations that are not explicitly present in the retrieved documents.
2. When a case name is merely MENTIONED or CITED within a document about a DIFFERENT case, say "as cited in [Document Name]" to make it clear the information comes secondhand.
3. Only create citation links for cases/laws where the retrieved document IS the actual document for that case/law.
4. If the user asks about a specific case and that case's own document is NOT in the retrieved results, clearly state: "The specific document for [case name] was not found in the knowledge base."
5. Never invent or fabricate G.R. numbers, dates, or case details.

--- RETRIEVED DOCUMENTS ---
${docsText}
--- END DOCUMENTS ---`,
          messages: messages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          maxOutputTokens: 16000,
          temperature: 0.3,
        });

        // Stream AI response
        let fullContent = "";
        for await (const chunk of result.textStream) {
          fullContent += chunk;
          controller.enqueue(encoder.encode(chunk));
        }

        // Post-process citations
        const processedContent = addCitationLinks(fullContent, uniqueDocNames);

        // Save messages
        const { data: newSession } = await sessionPromise;
        let finalSessionId: string | null = newSession?.id || null;
        let finalUserMessageId: string | null = null;
        let assistantMessageId: string | null = null;

        if (finalSessionId && lastUserMessage?.role === "user") {
          const [userMsgResult, assistantMsgResult] = await Promise.all([
            supabaseAdmin
              .from("chat_messages")
              .insert({
                session_id: finalSessionId,
                user_id: user.id,
                role: "user",
                content: lastUserMessage.content,
              })
              .select("id")
              .single(),
            supabaseAdmin
              .from("chat_messages")
              .insert({
                session_id: finalSessionId,
                user_id: user.id,
                role: "assistant",
                content: processedContent,
              })
              .select("id")
              .single(),
          ]);
          finalUserMessageId = userMsgResult.data?.id || null;
          assistantMessageId = assistantMsgResult.data?.id || null;
        }

        // Clean up old sessions
        supabaseAdmin
          .from("chat_sessions")
          .select("id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .then(async ({ data: allSessions }) => {
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
          });

        const meta = JSON.stringify({
          __meta: true,
          content: processedContent,
          sessionId: finalSessionId,
          userMessageId: finalUserMessageId,
          assistantMessageId,
          provider: "azure-search-gemini",
          truncated: false,
        });
        controller.enqueue(
          encoder.encode(`\n\n__CRIMIKNOW_STREAM_END__\n${meta}`),
        );
        controller.close();
      } catch (err) {
        console.error("[Stream Error]", err);
        controller.enqueue(
          encoder.encode(
            `__CRIMIKNOW_ERROR__${JSON.stringify({ error: "Request failed", message: "Failed to generate answer. Please try again." })}`,
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-AI-Provider": "azure-search-gemini",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// Helper to add citation links
function addCitationLinks(text: string, knownDocNames: string[] = []): string {
  const knownNamesLower = knownDocNames.map((n) => n.toLowerCase());
  const matchesKnownDoc = (citation: string): boolean => {
    const citLower = citation.toLowerCase();
    if (
      knownNamesLower.some((n) => n.includes(citLower) || citLower.includes(n))
    )
      return true;
    const surnameMatch = citLower.match(/v[s]?\.\s+([a-zà-ÿñ]+)/i);
    if (surnameMatch) {
      const surname = surnameMatch[1];
      if (
        surname.length > 2 &&
        knownNamesLower.some((n) => n.includes(surname))
      )
        return true;
    }
    const grMatch = citLower.match(/g\.?r\.?\s*no[s]?\.?\s*((?:l-)?[\d-]+)/i);
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
  const isAlreadyLinked = (line: string, t: string): boolean =>
    line.includes(`[${t}](`) || line.includes(`[${t.replace(/\*{2,}/g, "")}](`);

  return text
    .split("\n")
    .map((line) => {
      if (/\]\(\/api\/documents/.test(line)) return line;
      line = line.replace(
        /\*{0,2}((?:Art(?:icle)?\.?\s*\d+)(?:\s*(?:of\s+(?:the\s+)?|,\s*|-\s*)(?:Revised Penal Code|RPC|Act No\.\s*\d+))?)\*{0,2}/gi,
        (match, citation) => {
          const cleaned = citation.replace(/\*{2,}/g, "").trim();
          if (cleaned.length < 5 || isAlreadyLinked(line, cleaned))
            return match;
          const artNum = cleaned.match(/Art(?:icle)?\.?\s*(\d+)/i);
          return `[${cleaned}](${getRpcUrl(artNum ? `Article ${artNum[1]}` : cleaned)})`;
        },
      );
      if (!/\[[^\]]*Revised Penal Code[^\]]*\]\(/.test(line)) {
        line = line.replace(
          /\*{0,2}(Revised Penal Code)\*{0,2}/gi,
          (_, citation) =>
            `[${citation.replace(/\*{2,}/g, "").trim()}](${getRpcUrl("Revised Penal Code")})`,
        );
      }
      line = line.replace(
        /\*{0,2}(G\.R\.?\s*No[s]?\.?\s*(?:L-)?[\d-]+(?:\s*,\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4})?)\*{0,2}/gi,
        (match, citation) => {
          const cleaned = citation.replace(/\*{2,}/g, "").trim();
          if (isAlreadyLinked(line, cleaned) || !matchesKnownDoc(cleaned))
            return match;
          return `[${cleaned}](${getSearchUrl(cleaned)})`;
        },
      );
      line = line.replace(
        /\*{0,2}((?:People|Republic|State|Commissioner|Director|Secretary|City|Province|Municipality|Heirs)\s+(?:of\s+(?:the\s+)?(?:Philippines?\s+)?)?v[s]?\.\s+[A-Z][A-Za-zÀ-ÿñÑ]+(?:\s+(?:et\s+al\.?|Jr\.|Sr\.|III|IV))?)\*{0,2}/gi,
        (match, citation) => {
          const cleaned = citation.replace(/\*{2,}/g, "").trim();
          if (isAlreadyLinked(line, cleaned)) return match;
          return matchesKnownDoc(cleaned)
            ? `[${cleaned}](${getSearchUrl(cleaned)})`
            : `**${cleaned}**`;
        },
      );
      line = line.replace(
        /\*{0,2}([A-Z][A-Za-zÀ-ÿñÑ]+(?:\s+(?:Jr\.|Sr\.|III|IV))?\s+v[s]?\.\s+(?:People|Republic|State|Court of Appeals|Sandiganbayan|Commission)(?:\s+of\s+the\s+Philippines)?)\*{0,2}/gi,
        (match, citation) => {
          const cleaned = citation.replace(/\*{2,}/g, "").trim();
          if (isAlreadyLinked(line, cleaned)) return match;
          return matchesKnownDoc(cleaned)
            ? `[${cleaned}](${getSearchUrl(cleaned)})`
            : `**${cleaned}**`;
        },
      );
      line = line.replace(
        /\*{0,2}((?:R\.A\.|RA|Republic Act|P\.D\.|PD|Presidential Decree|B\.P\.|BP|Batas Pambansa|E\.O\.|EO|Executive Order|A\.M\.|AM|Administrative Matter|Act)\s*(?:No\.?|Blg\.?)?\s*\d+(?:-?\d+)?)\*{0,2}/gi,
        (match, citation) => {
          const cleaned = citation.replace(/\*{2,}/g, "").trim();
          if (cleaned.length < 5 || isAlreadyLinked(line, cleaned))
            return match;
          return /Act No\.\s*3815/i.test(cleaned)
            ? `[${cleaned}](${getRpcUrl("Revised Penal Code")})`
            : `[${cleaned}](${getSearchUrl(cleaned)})`;
        },
      );
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
        const regex = new RegExp(
          `\\*{0,2}(${lawName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\*{0,2}`,
          "gi",
        );
        line = line.replace(regex, (match, citation) => {
          const cleaned = citation.replace(/\*{2,}/g, "").trim();
          return isAlreadyLinked(line, cleaned)
            ? match
            : `[${cleaned}](${getSearchUrl(cleaned)})`;
        });
      }
      line = line.replace(
        /\*{0,2}((?:19|20)\d{2}\s+Bar\s+Examination[s]?)\*{0,2}/gi,
        (match, citation) => {
          const cleaned = citation.replace(/\*{2,}/g, "").trim();
          return isAlreadyLinked(line, cleaned)
            ? match
            : `[${cleaned}](${getSearchUrl(cleaned, "barexam")})`;
        },
      );
      line = line.replace(
        /\*{0,2}(Bar\s+Examination[s]?\s+(?:19|20)\d{2})\*{0,2}/gi,
        (match, citation) => {
          const cleaned = citation.replace(/\*{2,}/g, "").trim();
          return isAlreadyLinked(line, cleaned)
            ? match
            : `[${cleaned}](${getSearchUrl(cleaned, "barexam")})`;
        },
      );
      return line;
    })
    .join("\n");
}
