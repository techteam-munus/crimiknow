export async function GET() {
  return Response.json({
    hasKey: !!process.env.AI_GATEWAY_API_KEY,
    keyPrefix: process.env.AI_GATEWAY_API_KEY
      ? process.env.AI_GATEWAY_API_KEY.slice(0, 4)
      : "NONE",
    nodeEnv: process.env.NODE_ENV,
  });
}
