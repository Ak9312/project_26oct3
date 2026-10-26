// Thin, dependency-free clients for each LLM provider.
// Model IDs are read from env vars so they can be changed without a code edit.

export type EngineId = "chatgpt" | "perplexity" | "gemini" | "claude";
export type BriefProvider = "anthropic" | "openai" | "gemini";

export interface LlmResult {
  text: string;
  citations: string[];
}

const TIMEOUT_MS = 45_000;

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const raw = await res.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || data?.raw || `HTTP ${res.status}`;
    throw new Error(`${new URL(url).host}: ${String(msg).slice(0, 300)}`);
  }
  return data;
}

export async function callAnthropic(prompt: string, system?: string): Promise<LlmResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const data = await postJson(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": key, "anthropic-version": "2023-06-01" },
    {
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 2500,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: prompt }],
    },
  );
  const text = (data.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
  return { text, citations: [] };
}

export async function callOpenAI(prompt: string, system?: string): Promise<LlmResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const messages = [
    ...(system ? [{ role: "system", content: system }] : []),
    { role: "user", content: prompt },
  ];
  const data = await postJson(
    "https://api.openai.com/v1/chat/completions",
    { Authorization: `Bearer ${key}` },
    { model: process.env.OPENAI_MODEL || "gpt-5.4-mini", messages },
  );
  return { text: data.choices?.[0]?.message?.content ?? "", citations: [] };
}

export async function callGemini(prompt: string, system?: string): Promise<LlmResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { "x-goog-api-key": key },
    {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    },
  );
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p: any) => p.text || "").join("");
  const chunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const citations = chunks.map((c: any) => c?.web?.uri).filter(Boolean);
  return { text, citations };
}

export async function callPerplexity(prompt: string): Promise<LlmResult> {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) throw new Error("PERPLEXITY_API_KEY is not set");
  const data = await postJson(
    process.env.PERPLEXITY_URL || "https://api.perplexity.ai/v1/sonar",
    { Authorization: `Bearer ${key}` },
    {
      model: process.env.PERPLEXITY_MODEL || "sonar",
      messages: [{ role: "user", content: prompt }],
    },
  );
  const text = data.choices?.[0]?.message?.content ?? data.output_text ?? "";
  const citations: string[] = Array.isArray(data.citations)
    ? data.citations
    : (data.search_results || []).map((r: any) => r.url).filter(Boolean);
  return { text, citations };
}

export const ENGINES: { id: EngineId; label: string; envKey: string }[] = [
  { id: "chatgpt", label: "ChatGPT", envKey: "OPENAI_API_KEY" },
  { id: "perplexity", label: "Perplexity", envKey: "PERPLEXITY_API_KEY" },
  { id: "gemini", label: "Gemini", envKey: "GEMINI_API_KEY" },
  { id: "claude", label: "Claude", envKey: "ANTHROPIC_API_KEY" },
];

export function engineConfigured(id: EngineId): boolean {
  const e = ENGINES.find((x) => x.id === id);
  return !!(e && process.env[e.envKey]);
}

export async function askEngine(id: EngineId, prompt: string): Promise<LlmResult> {
  switch (id) {
    case "chatgpt":
      return callOpenAI(prompt);
    case "perplexity":
      return callPerplexity(prompt);
    case "gemini":
      return callGemini(prompt);
    case "claude":
      return callAnthropic(prompt);
  }
}

/** Picks the LLM that writes briefs: BRIEF_LLM if set, else the first provider with a key. */
export function briefProvider(): BriefProvider | null {
  const forced = process.env.BRIEF_LLM as BriefProvider | undefined;
  if (forced && ["anthropic", "openai", "gemini"].includes(forced)) return forced;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

export async function callBriefLlm(prompt: string, system: string): Promise<LlmResult> {
  const p = briefProvider();
  if (p === "anthropic") return callAnthropic(prompt, system);
  if (p === "openai") return callOpenAI(prompt, system);
  if (p === "gemini") return callGemini(prompt, system);
  throw new Error("No LLM key set. Add ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY.");
}
