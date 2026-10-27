import { ENGINES, briefModel, briefProvider } from "@/lib/llm";
import { sheetsConfigured } from "@/lib/sheets";
import { adminEnabled, isAdminRequest, publicUsage } from "@/lib/auth";
import { splitList } from "@/lib/mentions";

export const dynamic = "force-dynamic";

// Admins see which integrations have keys set (never the keys). Public visitors only see their daily allowance.
export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    const u = publicUsage(req);
    return Response.json({ admin: false, adminEnabled: adminEnabled(), dailyLimit: u.limit, remaining: u.remaining });
  }
  return Response.json({
    admin: true,
    adminEnabled: true,
    serpapi: !!process.env.SERPAPI_KEY,
    briefLlm: briefProvider(),
    briefModel: briefModel(),
    engines: Object.fromEntries(ENGINES.map((e) => [e.id, !!process.env[e.envKey]])),
    sheets: sheetsConfigured(),
    dailyLimit: publicUsage(req).limit,
    cron: {
      brand: process.env.TRACK_BRAND || null,
      promptsSet: !!process.env.TRACK_PROMPTS,
    },
    trackDefaults: {
      brand: process.env.TRACK_BRAND || "",
      competitors: splitList(process.env.TRACK_COMPETITORS).join(", "),
      prompts: splitList(process.env.TRACK_PROMPTS?.replace(/\|/g, "\n")),
      engines: splitList(process.env.TRACK_ENGINES),
    },
  });
}
