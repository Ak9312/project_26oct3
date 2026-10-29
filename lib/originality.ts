// Flags article sentences that closely match a source (shared 8-word sequences).
// Pure function: runs in the browser and on the server.

export interface Flagged {
  sentence: string;
  overlap: number; // 0–1 share of the sentence's 8-word sequences found in a source
  source: number; // source position
}

const N = 8;
const norm = (s: string) =>
  s.toLowerCase().replace(/\[\d+\]/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

function shingles(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + N <= words.length; i++) out.push(words.slice(i, i + N).join(" "));
  return out;
}

export function checkOriginality(article: string, sources: { position: number; text: string }[], threshold = 0.4) {
  const index = new Map<string, number>();
  for (const s of sources) for (const sh of shingles(norm(s.text))) if (!index.has(sh)) index.set(sh, s.position);

  const sentences = article
    .split(/\n+/)
    .filter((l) => !/^\s*(#|meta description:)/i.test(l))
    .flatMap((l) => l.split(/(?<=[.!?])\s+/))
    .map((s) => s.replace(/^[\s*\-\d.]+/, "").trim())
    .filter((s) => norm(s).length >= 12);

  const flagged: Flagged[] = [];
  let checked = 0;
  for (const sentence of sentences) {
    const sh = shingles(norm(sentence));
    if (sh.length === 0) continue;
    checked++;
    const hits = new Map<number, number>();
    let matched = 0;
    for (const x of sh) {
      const src = index.get(x);
      if (src !== undefined) {
        matched++;
        hits.set(src, (hits.get(src) || 0) + 1);
      }
    }
    const overlap = matched / sh.length;
    if (overlap >= threshold) {
      const source = [...hits.entries()].sort((a, b) => b[1] - a[1])[0][0];
      flagged.push({ sentence, overlap, source });
    }
  }
  return { checked, flagged };
}
