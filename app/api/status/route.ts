import { ENGINES, briefProvider } from "@/lib/llm";
import { sheetsConfigured } from "@/lib/sheets";

export const dynamic = "force-dynamic";

// Reports which integrations have keys set. Never returns the keys themselves.
export async function GET() {
  return Response.json({
    serpapi: !!process.env.SERPAPI_KEY,
    briefLlm: briefProvider(),
    engines: Object.fromEntries(ENGINES.map((e) => [e.id, !!process.env[e.envKey]])),
    sheets: sheetsConfigured(),
    passwordRequired: !!process.env.APP_PASSWORD,
    cron: {
      brand: process.env.TRACK_BRAND || null,
      promptsSet: !!process.env.TRACK_PROMPTS,
    },
  });
}
