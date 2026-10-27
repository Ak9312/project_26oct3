"use client";
// Browser helpers: API calls with the optional app password, plus small localStorage wrappers.

const PW_KEY = "briefradar.password";

export function store(key: string, value?: string): string {
  try {
    if (value === undefined) return localStorage.getItem(key) || "";
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
  return value || "";
}

export const getPassword = () => store(PW_KEY);
export const setPassword = (v: string) => store(PW_KEY, v);

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      signal: AbortSignal.timeout(75_000),
      headers: {
        "Content-Type": "application/json",
        "x-app-password": getPassword(),
        ...(init?.headers || {}),
      },
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
  serpapi: boolean;
  briefLlm: string | null;
  briefModel: string | null;
  engines: Record<string, boolean>;
  sheets: boolean;
  passwordRequired: boolean;
  cron: { brand: string | null; promptsSet: boolean };
}
