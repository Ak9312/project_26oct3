import { isAdminRequest, useTicket } from "@/lib/auth";
import { rewriteSentences } from "@/lib/writer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const keyword = String(body.keyword || "").slice(0, 120).trim();
  const sentences = (Array.isArray(body.sentences) ? body.sentences : [])
    .slice(0, 15)
    .map((s: unknown) => String(s ?? "").slice(0, 600))
    .filter(Boolean);
  if (!keyword || sentences.length === 0) return Response.json({ error: "Nothing to rewrite." }, { status: 400 });
  if (!isAdminRequest(req) && !useTicket(String(body.ticket || ""), keyword)) {
    return Response.json({ error: "This article session has expired." }, { status: 403 });
  }
  try {
    return Response.json({ rewrites: await rewriteSentences(sentences) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Rewrite failed." }, { status: 502 });
  }
}
