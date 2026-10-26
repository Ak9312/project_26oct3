import { ENGINES, engineConfigured } from "@/lib/llm";
import { splitList } from "@/lib/mentions";
import { runTracker } from "@/lib/track";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called weekly by Vercel Cron (see vercel.json). Config comes from env vars.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const brand = process.env.TRACK_BRAND || "";
  const prompts = splitList(process.env.TRACK_PROMPTS?.replace(/\|/g, "\n"));
  const wanted = splitList(process.env.TRACK_ENGINES);
  const engines = ENGINES.map((e) => e.id).filter(
    (id) => engineConfigured(id) && (wanted.length === 0 || wanted.includes(id)),
  );

  try {
    const { rows, savedToSheet } = await runTracker({
      brand,
      competitors: splitList(process.env.TRACK_COMPETITORS),
      prompts,
      engines,
    });
    const ok = rows.filter((r) => !r.error);
    return Response.json({
      ran: rows.length,
      mentioned: ok.filter((r) => r.mentioned).length,
      errors: rows.length - ok.length,
      savedToSheet,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
