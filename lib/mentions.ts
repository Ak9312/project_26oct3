// Plain text matching — deterministic, no extra LLM cost.

export interface MentionResult {
  mentioned: boolean;
  /** Brand's order among tracked names that appear, e.g. "2 of 3". Null if not mentioned. */
  position: string | null;
  competitorsNamed: string[];
}

function firstIndex(text: string, name: string): number {
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return -1;
  const m = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").exec(text);
  return m ? m.index + m[1].length : -1;
}

export function analyzeMentions(text: string, brand: string, competitors: string[]): MentionResult {
  const brandIdx = firstIndex(text, brand);
  const found = competitors
    .map((c) => ({ name: c, idx: firstIndex(text, c) }))
    .filter((c) => c.idx >= 0);
  const all = [...found, ...(brandIdx >= 0 ? [{ name: brand, idx: brandIdx }] : [])].sort(
    (a, b) => a.idx - b.idx,
  );
  const pos = all.findIndex((x) => x.name === brand && x.idx === brandIdx);
  return {
    mentioned: brandIdx >= 0,
    position: brandIdx >= 0 ? `${pos + 1} of ${all.length}` : null,
    competitorsNamed: found.sort((a, b) => a.idx - b.idx).map((c) => c.name),
  };
}

export function splitList(s: string | undefined | null): string[] {
  return (s || "")
    .split(/[\n,|]/)
    .map((x) => x.trim())
    .filter(Boolean);
}
