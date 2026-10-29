// Temporary diagnostics. Returns 404 unless SELFTEST_SECRET is set and matches.
import { timingSafeEqual } from "node:crypto";
import { research } from "@/lib/sources";
import { rewriteSentences, writeArticle } from "@/lib/writer";
import { checkOriginality } from "@/lib/originality";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.SELFTEST_SECRET || "";
  const url = new URL(req.url);
  const got = url.searchParams.get("secret") || "";
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
    return new Response("Not found", { status: 404 });
  }
  const keyword = url.searchParams.get("q") || "best crm for small business";
  const out: Record<string, unknown> = {};

  let t = Date.now();
  try {
    const r = await research(keyword, "in");
    out.research = {
      ms: Date.now() - t,
      found: r.sources.length,
      read: r.sources.filter((s) => s.ok).length,
      failed: r.sources.filter((s) => !s.ok).map((s) => `${s.position} ${s.domain}: ${s.reason}`),
      avgWords: Math.round(r.sources.filter((s) => s.ok).reduce((a, s) => a + s.wordCount, 0) / Math.max(1, r.sources.filter((s) => s.ok).length)),
      questions: r.questions.length,
    };

    if (url.searchParams.get("write") === "1") {
      t = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 280_000);
      let text = "";
      let firstTextMs = 0;
      const events: string[] = [];
      for await (const ev of writeArticle(
        { keyword, country: "in", contentType: "Blog post", length: Number(url.searchParams.get("len") || 1000), questions: r.questions, relatedSearches: r.relatedSearches, sources: r.sources },
        controller.signal,
      )) {
        if (ev.t === "d") {
          if (!firstTextMs) firstTextMs = Date.now() - t;
          text += ev.v;
        } else if (ev.t !== "thinking") events.push(JSON.stringify(ev));
      }
      clearTimeout(timer);
      const orig = checkOriginality(text, r.sources.filter((s) => s.ok));
      if (orig.flagged.length) {
        const t2 = Date.now();
        try {
          const sentences = orig.flagged.slice(0, 15).map((f) => f.sentence);
          const rewrites = await rewriteSentences(sentences);
          let fixedText = text;
          sentences.forEach((s, i) => { fixedText = fixedText.replace(s, rewrites[i]); });
          const after = checkOriginality(fixedText, r.sources.filter((s) => s.ok));
          out.rewrite = { ms: Date.now() - t2, before: orig.flagged.length, after: after.flagged.length, example: { from: sentences[0], to: rewrites[0] } };
        } catch (e) {
          out.rewrite = { error: e instanceof Error ? e.message : String(e) };
        }
      }
      out.write = {
        ms: Date.now() - t,
        firstTextMs,
        words: text.split(/\s+/).filter(Boolean).length,
        events,
        flagged: orig.flagged.length,
        checked: orig.checked,
        flaggedSample: orig.flagged.slice(0, 3),
        preview: text.slice(0, 1500),
      };
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  return Response.json(out);
}
