// Research step: top 20 Google results via SerpApi, then read each page's main text.
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";

export interface Source {
  position: number;
  url: string;
  title: string;
  domain: string;
  ok: boolean;
  reason?: string;
  wordCount: number;
  headings: string[];
  text: string;
}

export interface Research {
  keyword: string;
  country: string;
  questions: string[];
  relatedSearches: string[];
  sources: Source[];
}

const UA = "Mozilla/5.0 (compatible; BriefRadarBot/1.0; +https://project-26oct3.vercel.app)";
const MAX_HTML = 2_500_000;
const MAX_WORDS_PER_SOURCE = 2500;
const SKIP_HOSTS = /(^|\.)(youtube\.com|youtu\.be|facebook\.com|instagram\.com|x\.com|twitter\.com|tiktok\.com|linkedin\.com)$/i;

async function serpPage(keyword: string, country: string, start: number): Promise<any> {
  const key = process.env.SERPAPI_KEY;
  if (!key) throw new Error("SERPAPI_KEY is not set");
  const qs = new URLSearchParams({ engine: "google", q: keyword, gl: country, hl: "en", start: String(start), api_key: key });
  let res: Response;
  try {
    res = await fetch(`https://serpapi.com/search.json?${qs}`, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
  } catch {
    throw new Error("Couldn't reach SerpApi. Try again in a moment.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`SerpApi: ${data.error || `HTTP ${res.status}`}`);
  return data;
}

/** Top organic results (2 SerpApi searches: positions 1–10 and 11–20). */
export async function topResults(keyword: string, country: string, limit = 20) {
  const [p1, p2] = await Promise.allSettled([serpPage(keyword, country, 0), serpPage(keyword, country, 10)]);
  if (p1.status === "rejected") throw p1.reason;
  const pages = [p1.value, p2.status === "fulfilled" ? p2.value : {}];
  const seen = new Set<string>();
  const results: { position: number; url: string; title: string }[] = [];
  for (const page of pages) {
    for (const r of page.organic_results || []) {
      const url = String(r.link || "");
      if (!/^https?:\/\//.test(url) || seen.has(url)) continue;
      seen.add(url);
      results.push({ position: results.length + 1, url, title: String(r.title || "") });
    }
  }
  const uniq = (xs: string[]) => [...new Set(xs.map((s) => s.trim()).filter(Boolean))];
  return {
    results: results.slice(0, limit),
    questions: uniq((p1.value.related_questions || []).map((q: any) => q.question || "")).slice(0, 10),
    relatedSearches: uniq((p1.value.related_searches || []).map((q: any) => q.query || "")).slice(0, 10),
  };
}

// --- robots.txt (minimal: honours Disallow for * and our bot name) ---
async function allowedByRobots(url: URL): Promise<boolean> {
  try {
    const res = await fetch(`${url.origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return true;
    const lines = (await res.text()).slice(0, 200_000).split(/\r?\n/);
    let applies = false;
    let groupHasRules = false;
    const disallow: string[] = [];
    for (const raw of lines) {
      const line = raw.replace(/#.*/, "").trim();
      const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
      if (!m) continue;
      const field = m[1].toLowerCase();
      const value = m[2].trim();
      if (field === "user-agent") {
        if (groupHasRules) { applies = false; groupHasRules = false; }
        const ua = value.toLowerCase();
        if (ua === "*" || ua.includes("briefradarbot")) applies = true;
      } else if (field === "disallow" || field === "allow") {
        groupHasRules = true;
        if (applies && field === "disallow" && value) disallow.push(value);
      }
    }
    const path = url.pathname + url.search;
    return !disallow.some((rule) => {
      const re = new RegExp("^" + rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
      return re.test(path);
    });
  } catch {
    return true;
  }
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const clip = (s: string, n: number) => {
  const w = words(s);
  return w.length > n ? w.slice(0, n).join(" ") + " …" : w.join(" ");
};

async function readPage(r: { position: number; url: string; title: string }): Promise<Source> {
  const u = new URL(r.url);
  const base: Source = { ...r, domain: u.hostname.replace(/^www\./, ""), ok: false, wordCount: 0, headings: [], text: "" };
  if (SKIP_HOSTS.test(u.hostname)) return { ...base, reason: "Video or social page" };
  if (!(await allowedByRobots(u))) return { ...base, reason: "Blocked by robots.txt" };
  try {
    const res = await fetch(r.url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en" },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
      cache: "no-store",
    });
    if (!res.ok) return { ...base, reason: `Site returned ${res.status}` };
    const type = res.headers.get("content-type") || "";
    if (!type.includes("html")) return { ...base, reason: "Not a web page" };
    const html = (await res.text()).slice(0, MAX_HTML);
    const { document } = parseHTML(html);
    const article = new Readability(document as unknown as Document, { charThreshold: 300 }).parse();
    const text = (article?.textContent || "").replace(/\s+/g, " ").trim();
    const wc = words(text).length;
    if (wc < 150) return { ...base, reason: "Too little readable text" };
    const { document: doc } = parseHTML(`<div>${article?.content || ""}</div>`);
    const headings = [...doc.querySelectorAll("h1,h2,h3")]
      .map((h: any) => `${h.tagName.toUpperCase()}: ${String(h.textContent || "").replace(/\s+/g, " ").trim()}`)
      .filter((h) => h.length > 4)
      .slice(0, 40);
    return { ...base, ok: true, wordCount: wc, headings, text: clip(text, MAX_WORDS_PER_SOURCE) };
  } catch (e) {
    const timeout = e instanceof Error && e.name === "TimeoutError";
    return { ...base, reason: timeout ? "Took too long" : "Couldn't be read" };
  }
}

export async function research(keyword: string, country: string): Promise<Research> {
  const top = await topResults(keyword, country);
  if (top.results.length === 0) throw new Error("Google returned no results for this keyword.");
  const sources = await Promise.all(top.results.map(readPage));
  return { keyword, country, questions: top.questions, relatedSearches: top.relatedSearches, sources };
}
