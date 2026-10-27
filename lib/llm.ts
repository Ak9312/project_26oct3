// Thin, dependency-free clients for each LLM provider.
// Model IDs are read from env vars so they can be changed without a code edit.

export type EngineId = "chatgpt" | "perplexity" | "gemini" | "claude";
export type BriefProvider = "groq" | "anthropic" | "openai" | "gemini";

export interface LlmResult {
  text: string;
  citations: string[];
}

const TIMEOUT_MS = 40_000;

const HOST_NAMES: Record<string, string> = {
  "api.groq.com": "Groq",
  "api.anthropic.com": "Claude",
  "api.openai.com": "OpenAI",
  "generativelanguage.googleapis.com": "Gemini",
  "api.perplexity.ai": "Perplexity",
};

export class HttpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  const name = HOST_NAMES[new URL(url).host] || new URL(url).host;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new HttpError(`${name} took too long to answer. Try again.`, 504);
    }
    throw e;
  }
  const raw = await res.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }
  if (!res.ok) {
    const msg = String(data?.error?.message || data?.message || data?.raw || `HTTP ${res.status}`).slice(0, 300);
    if (res.status === 429) {
      throw new HttpError(`${name} limit reached: ${msg}`, 429);
    }
    if (res.status === 401 || res.status === 403) {
      throw new HttpError(`${name} rejected the API key. Check it in Vercel. (${msg})`, res.status);
    }
    throw new HttpError(`${name}: ${msg}`, res.status);
  }
  return data;
}

// Groq: OpenAI-compatible. Llama left Groq's free tier on 2026-08-16; gpt-oss-120b is the recommended free model.
export async function callGroq(prompt: string, system?: string, json = false): Promise<LlmResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const base = {
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      { role: "user", content: prompt },
    ],
    max_tokens: 4000,
  };
  const extras = {
    reasoning_effort: process.env.GROQ_REASONING_EFFORT || "low",
    ...(json ? { response_format: { type: "json_object" } } : {}),
  };
  let data: any;
  try {
    data = await postJson(url, { Authorization: `Bearer ${key}` }, { ...base, ...extras });
  } catch (e) {
    // Some models don't accept reasoning_effort / JSON mode: retry once with the plain request.
    if (e instanceof HttpError && e.status === 400) {
      data = await postJson(url, { Authorization: `Bearer ${key}` }, base);
    } else {
      throw e;
    }
  }
  return { text: data.choices?.[0]?.message?.content ?? "", citations: [] };
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

/** Picks the LLM that writes briefs: BRIEF_LLM if set, else Groq first, then the first other provider with a key. */
export function briefProvider(): BriefProvider | null {
  const forced = (process.env.BRIEF_LLM || "").trim().toLowerCase() as BriefProvider;
  const hasKey: Record<BriefProvider, boolean> = {
    groq: !!process.env.GROQ_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
  };
  if (forced && forced in hasKey && hasKey[forced]) return forced;
  return (["groq", "anthropic", "openai", "gemini"] as BriefProvider[]).find((p) => hasKey[p]) || null;
}

export function briefModel(): string | null {
  switch (briefProvider()) {
    case "groq": return process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    case "anthropic": return process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
    case "openai": return process.env.OPENAI_MODEL || "gpt-5.4-mini";
    case "gemini": return process.env.GEMINI_MODEL || "gemini-3.8-flash";
    default: return null;
  }
}

export async function callBriefLlm(prompt: string, system: string): Promise<LlmResult> {
  const p = briefProvider();
  if (p === "groq") return callGroq(prompt, system, true);
  if (p === "anthropic") return callAnthropic(prompt, system);
  if (p === "openai") return callOpenAI(prompt, system);
  if (p === "gemini") return callGemini(prompt, system);
  throw new Error("No LLM key set. Add GROQ_API_KEY in Vercel → Settings → Environment Variables, then redeploy.");
}
