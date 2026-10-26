import { callBriefLlm, briefProvider } from "./llm";
import { getSerpData, type SerpData } from "./serp";
import { appendRows, sheetsConfigured, TABS } from "./sheets";

export interface Brief {
  keyword: string;
  country: string;
  contentType: string;
  intent: string;
  intentReason: string;
  h1: string;
  outline: { level: "H2" | "H3"; text: string }[];
  faqs: { question: string; answerHint: string }[];
  relatedKeywords: string[];
  suggestedWordCount: number | null;
  serp: SerpData;
  provider: string;
  savedToSheet: boolean;
  createdAt: string;
}

const SYSTEM = `You are a senior SEO content strategist. You write briefs a writer can follow without further research.
Rules:
- Base questions and related keywords on the real Google data provided. You may rephrase or merge, but do not invent search volumes, difficulty scores or statistics.
- Return ONLY a JSON object, no markdown fences, matching this TypeScript type:
{"intent":"Informational"|"Commercial"|"Transactional"|"Navigational","intentReason":string,"h1":string,"outline":{"level":"H2"|"H3","text":string}[],"faqs":{"question":string,"answerHint":string}[],"relatedKeywords":string[],"suggestedWordCount":number}
- outline: 5-9 headings in reading order. faqs: 4-8 items. relatedKeywords: 5-12 items.`;

function extractJson(text: string): any {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The LLM did not return JSON.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function generateBrief(keyword: string, country: string, contentType: string): Promise<Brief> {
  const serp = await getSerpData(keyword, country);
  const prompt = `Target keyword: "${keyword}"
Country (Google gl): ${country}
Content type: ${contentType}

Real Google data from SerpApi:
- Autocomplete suggestions: ${JSON.stringify(serp.autocomplete)}
- People Also Ask questions: ${JSON.stringify(serp.questions)}
- Related searches: ${JSON.stringify(serp.relatedSearches)}

Write the content brief JSON.`;

  const { text } = await callBriefLlm(prompt, SYSTEM);
  const j = extractJson(text);

  const brief: Brief = {
    keyword,
    country,
    contentType,
    intent: str(j.intent) || "Unclear",
    intentReason: str(j.intentReason),
    h1: str(j.h1),
    outline: (Array.isArray(j.outline) ? j.outline : [])
      .map((o: any) => ({ level: o?.level === "H3" ? "H3" : "H2", text: str(o?.text) }))
      .filter((o: any) => o.text),
    faqs: (Array.isArray(j.faqs) ? j.faqs : [])
      .map((f: any) => ({ question: str(f?.question), answerHint: str(f?.answerHint) }))
      .filter((f: any) => f.question),
    relatedKeywords: (Array.isArray(j.relatedKeywords) ? j.relatedKeywords : []).map(str).filter(Boolean),
    suggestedWordCount: Number.isFinite(Number(j.suggestedWordCount)) ? Math.round(Number(j.suggestedWordCount)) : null,
    serp,
    provider: briefProvider() || "none",
    savedToSheet: false,
    createdAt: new Date().toISOString(),
  };

  if (sheetsConfigured()) {
    try {
      await appendRows(TABS.briefs, [
        [
          brief.createdAt,
          brief.keyword,
          brief.country,
          brief.contentType,
          brief.intent,
          brief.h1,
          brief.outline.map((o) => `${o.level}: ${o.text}`).join("\n"),
          brief.faqs.map((f) => f.question).join("\n"),
          brief.relatedKeywords.join(", "),
          brief.suggestedWordCount ?? "",
        ],
      ]);
      brief.savedToSheet = true;
    } catch (e) {
      console.error("Sheets append failed", e);
    }
  }
  return brief;
}
