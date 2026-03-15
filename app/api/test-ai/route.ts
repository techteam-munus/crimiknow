// app/api/test-ai/route.ts
export async function GET() {
  const ACTUAL_URL = "https://ai-gateway.vercel.sh/v1/responses";

  try {
    const response = await fetch(ACTUAL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // 1. Ensure provider is included
        model: "openai/gpt-3.5-turbo",
        // 2. Use 'input' instead of 'messages'
        input: [{ role: "user", content: "Say hello" }],
      }),
    });

    const text = await response.text();
    return Response.json(JSON.parse(text));
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
