// SerpApi: Google autocomplete + People Also Ask + related searches.
// Free plan: 250 searches/month. One brief uses 2 searches.

export interface SerpData {
  autocomplete: string[];
  questions: string[];
  relatedSearches: string[];
}

async function serp(params: Record<string, string>): Promise<any> {
  const key = process.env.SERPAPI_KEY;
  if (!key) throw new Error("SERPAPI_KEY is not set");
  const qs = new URLSearchParams({ ...params, api_key: key });
  let res: Response;
  try {
    res = await fetch(`https://serpapi.com/search.json?${qs}`, {
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") throw new Error("SerpApi took too long to answer. Try again.");
    throw new Error("Couldn't reach SerpApi. Try again in a moment.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`SerpApi: ${data.error || `HTTP ${res.status}`}`);
  }
  return data;
}

export async function getSerpData(keyword: string, country: string, lang = "en"): Promise<SerpData> {
  const [a, g] = await Promise.allSettled([
    serp({ engine: "google_autocomplete", q: keyword, gl: country, hl: lang }),
    serp({ engine: "google", q: keyword, gl: country, hl: lang }),
  ]);
  // One failed call still leaves enough data for a brief; both failing is an error.
  if (a.status === "rejected" && g.status === "rejected") throw g.reason;
  const auto = a.status === "fulfilled" ? a.value : {};
  const google = g.status === "fulfilled" ? g.value : {};
  const uniq = (xs: string[]) => [...new Set(xs.map((s) => s.trim()).filter(Boolean))];
  return {
    autocomplete: uniq((auto.suggestions || []).map((s: any) => s.value || "")).slice(0, 10),
    questions: uniq((google.related_questions || []).map((q: any) => q.question || "")).slice(0, 10),
    relatedSearches: uniq((google.related_searches || []).map((r: any) => r.query || "")).slice(0, 10),
  };
}
