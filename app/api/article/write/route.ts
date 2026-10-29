import { isAdminRequest, useTicket } from "@/lib/auth";
import type { Source } from "@/lib/sources";
import { writeArticle, type WriteInput } from "@/lib/writer";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LENGTHS = new Set([1000, 1500, 2500]);
const str = (v: unknown, n: number) => String(v ?? "").slice(0, n);

function cleanSources(raw: unknown): Source[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).map((s: any, i: number) => ({
    position: Number(s?.position) || i + 1,
    url: str(s?.url, 500),
    title: str(s?.title, 200),
    domain: str(s?.domain, 120),
    ok: !!s?.ok,
    wordCount: Number(s?.wordCount) || 0,
    headings: (Array.isArray(s?.headings) ? s.headings : []).slice(0, 40).map((h: unknown) => str(h, 200)),
    text: str(s?.text, 20_000),
  }));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const keyword = str(body.keyword, 120).trim();
  if (!keyword) return Response.json({ error: "Enter a keyword." }, { status: 400 });
  if (!isAdminRequest(req) && !useTicket(str(body.ticket, 200), keyword)) {
    return Response.json({ error: "This research has expired. Start again." }, { status: 403 });
  }

  const input: WriteInput = {
    keyword,
    country: str(body.country, 4) || "in",
    contentType: str(body.contentType, 40) || "Blog post",
    length: LENGTHS.has(Number(body.length)) ? Number(body.length) : 1500,
    questions: (Array.isArray(body.questions) ? body.questions : []).slice(0, 10).map((q: unknown) => str(q, 200)),
    relatedSearches: (Array.isArray(body.relatedSearches) ? body.relatedSearches : []).slice(0, 10).map((q: unknown) => str(q, 200)),
    sources: cleanSources(body.sources),
  };
  if (!input.sources.some((s) => s.ok)) return Response.json({ error: "No readable sources were sent." }, { status: 400 });

  // Stop a little before Vercel's 300 s limit so the client gets a clean ending.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 285_000);
  req.signal.addEventListener("abort", () => controller.abort());

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (ev: unknown) => ctrl.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      send({ t: "status", msg: "Writing" });
      const heartbeat = setInterval(() => send({ t: "ping" }), 10_000);
      try {
        for await (const ev of writeArticle(input, controller.signal)) send(ev);
      } catch (e) {
        send({ t: "error", msg: e instanceof Error ? e.message : "Writing failed." });
      } finally {
        clearInterval(heartbeat);
        clearTimeout(timer);
        ctrl.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
