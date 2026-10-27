import { isAdminRequest } from "@/lib/auth";
import { ENGINES, type EngineId } from "@/lib/llm";
import { splitList } from "@/lib/mentions";
import { runTracker, trackerHistory } from "@/lib/track";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID = new Set(ENGINES.map((e) => e.id));
const adminOnly = () => Response.json({ error: "Admin only. Sign in at /admin." }, { status: 401 });

export async function POST(req: Request) {
  if (!isAdminRequest(req)) return adminOnly();

  const body = await req.json().catch(() => ({}));
  const engines = (Array.isArray(body.engines) ? body.engines : []).filter((e: string) =>
    VALID.has(e as EngineId),
  ) as EngineId[];

  try {
    const result = await runTracker({
      brand: String(body.brand || "").slice(0, 80),
      competitors: splitList(body.competitors).slice(0, 15),
      prompts: (Array.isArray(body.prompts) ? body.prompts : splitList(body.prompts))
        .map((p: string) => String(p).trim().slice(0, 300))
        .filter(Boolean),
      engines,
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Something went wrong." }, { status: 400 });
  }
}

export async function GET(req: Request) {
  if (!isAdminRequest(req)) return adminOnly();
  const brand = new URL(req.url).searchParams.get("brand") || process.env.TRACK_BRAND || "";
  try {
    return Response.json({ history: await trackerHistory(brand) });
  } catch (e) {
    return Response.json({ history: [], error: e instanceof Error ? e.message : "Couldn't read the sheet." });
  }
}
