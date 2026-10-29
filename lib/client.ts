"use client";
// Browser helpers: API calls and small localStorage wrappers.

export function store(key: string, value?: string): string {
  try {
    if (value === undefined) return localStorage.getItem(key) || "";
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode etc.) */
  }
  return value || "";
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      signal: AbortSignal.timeout(75_000),
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new Error("This took too long and was stopped. Try again in a moment.");
    }
    throw new Error("Couldn't reach the server. Check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 504) throw new Error("The server timed out. Try again in a moment.");
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface Status {
  admin: boolean;
  adminEnabled: boolean;
  dailyLimit: number;
  remaining?: number;
  serpapi?: boolean;
  briefLlm?: string | null;
  briefModel?: string | null;
  engines?: Record<string, boolean>;
  sheets?: boolean;
  cron?: { brand: string | null; promptsSet: boolean };
  trackDefaults?: { brand: string; competitors: string; prompts: string[]; engines: string[] };
  article?: { available: boolean; model: string | null; dailyLimit: number; remaining: number };
}

export const COUNTRIES: [string, string][] = [
  ["in", "India"], ["us", "United States"], ["uk", "United Kingdom"], ["ca", "Canada"],
  ["au", "Australia"], ["ae", "UAE"], ["sg", "Singapore"], ["de", "Germany"], ["fr", "France"],
];
export const countryName = (code: string) => COUNTRIES.find(([c]) => c === code)?.[1] || code.toUpperCase();

export const ENGINE_LABELS: [string, string, string][] = [
  ["chatgpt", "ChatGPT", "OPENAI_API_KEY"],
  ["perplexity", "Perplexity", "PERPLEXITY_API_KEY"],
  ["gemini", "Gemini", "GEMINI_API_KEY"],
  ["claude", "Claude", "ANTHROPIC_API_KEY"],
];
