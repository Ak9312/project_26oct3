// Admin sessions (signed cookie) and the public daily brief limit.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "br_admin";
const QUOTA_COOKIE = "br_quota";
const SESSION_DAYS = 14;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function secret(): string {
  // Derived from server-only values; never sent to the browser.
  const base =
    process.env.SESSION_SECRET || process.env.APP_PASSWORD || process.env.SERPAPI_KEY || process.env.GROQ_API_KEY || "briefradar";
  return sha(`briefradar-session:${base}`);
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// ---------- Admin ----------

export const adminEnabled = () => !!process.env.APP_PASSWORD;

export function checkAdminPassword(pw: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return safeEqual(sha(pw), sha(expected));
}

// Tied to the current password: changing APP_PASSWORD signs everyone out.
const passwordTag = () => sha(process.env.APP_PASSWORD || "").slice(0, 16);

export function makeAdminToken(): string {
  const payload = `${Date.now() + SESSION_DAYS * 86_400_000}.${passwordTag()}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminToken(token: string | null | undefined): boolean {
  if (!token || !adminEnabled()) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [exp, tag, sig] = parts;
  if (!safeEqual(sig, sign(`${exp}.${tag}`))) return false;
  return Number(exp) > Date.now() && tag === passwordTag();
}

export const isAdminRequest = (req: Request) => verifyAdminToken(readCookie(req, ADMIN_COOKIE));

export function adminCookie(token: string | null): string {
  const base = `${ADMIN_COOKIE}=${token ?? ""}; Path=/; HttpOnly; Secure; SameSite=Lax`;
  return token ? `${base}; Max-Age=${SESSION_DAYS * 86_400}` : `${base}; Max-Age=0`;
}

// Slows down password guessing: 10 failed tries per IP per 15 minutes.
const loginFails = new Map<string, { count: number; until: number }>();
export function loginBlocked(req: Request): boolean {
  const f = loginFails.get(clientIp(req));
  return !!f && f.until > Date.now() && f.count >= 10;
}
export function recordLoginFailure(req: Request): void {
  const ip = clientIp(req);
  const now = Date.now();
  const f = loginFails.get(ip);
  if (!f || f.until < now) loginFails.set(ip, { count: 1, until: now + 15 * 60_000 });
  else f.count += 1;
}

// ---------- Public daily limit ----------
// Soft limit: a signed cookie plus a per-IP count kept in server memory.
// It stops casual overuse; the hard ceiling is still your free SerpApi/Groq quota.

export type Bucket = "brief" | "article";

export function publicDailyLimit(bucket: Bucket = "brief"): number {
  const raw = bucket === "article" ? process.env.ARTICLE_DAILY_LIMIT ?? 2 : process.env.PUBLIC_DAILY_LIMIT ?? 5;
  const fallback = bucket === "article" ? 2 : 5;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

const today = () => new Date().toISOString().slice(0, 10);

export function clientIp(req: Request): string {
  return (
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown"
  );
}

const usage = new Map<string, number>();
const cookieName = (bucket: Bucket) => (bucket === "article" ? `${QUOTA_COOKIE}_article` : QUOTA_COOKIE);

function cookieCount(req: Request, bucket: Bucket): number {
  const v = readCookie(req, cookieName(bucket));
  if (!v) return 0;
  const parts = v.split(".");
  if (parts.length !== 3) return 0;
  const [day, count, sig] = parts;
  if (day !== today() || !safeEqual(sig, sign(`${bucket}.${day}.${count}`))) return 0;
  return Number(count) || 0;
}

export function publicUsage(req: Request, bucket: Bucket = "brief") {
  const key = `${bucket}:${today()}:${clientIp(req)}`;
  const used = Math.max(usage.get(key) || 0, cookieCount(req, bucket));
  const limit = publicDailyLimit(bucket);
  return { key, used, limit, remaining: Math.max(0, limit - used) };
}

/** Reserves one use before the slow work starts, so parallel clicks can't skip the limit. */
export function reservePublicUse(req: Request, bucket: Bucket = "brief"): { key: string; used: number } {
  const u = publicUsage(req, bucket);
  if (usage.size > 5000) {
    const day = today();
    for (const k of usage.keys()) if (!k.includes(`:${day}:`)) usage.delete(k);
  }
  usage.set(u.key, u.used + 1);
  return { key: u.key, used: u.used + 1 };
}

export function releasePublicUse(key: string): void {
  const n = usage.get(key) || 0;
  if (n > 0) usage.set(key, n - 1);
}

export function quotaCookie(used: number, bucket: Bucket = "brief"): string {
  const day = today();
  return `${cookieName(bucket)}=${day}.${used}.${sign(`${bucket}.${day}.${used}`)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=172800`;
}

// ---------- Article tickets ----------
// The research step issues a short-lived signed ticket; the writing step requires it,
// so the expensive model call can't be triggered without a counted research run.

const usedTickets = new Map<string, number>();

export function makeTicket(keyword: string): string {
  const exp = Date.now() + 20 * 60_000;
  const nonce = Math.random().toString(36).slice(2, 10);
  const payload = `${exp}.${nonce}.${sha(keyword.trim().toLowerCase()).slice(0, 16)}`;
  return `${payload}.${sign(`ticket.${payload}`)}`;
}

export function useTicket(ticket: string, keyword: string): boolean {
  const parts = String(ticket || "").split(".");
  if (parts.length !== 4) return false;
  const [exp, nonce, kw, sig] = parts;
  const payload = `${exp}.${nonce}.${kw}`;
  if (!safeEqual(sig, sign(`ticket.${payload}`))) return false;
  if (Number(exp) < Date.now()) return false;
  if (kw !== sha(keyword.trim().toLowerCase()).slice(0, 16)) return false;
  // Best effort single use (per server instance).
  const uses = usedTickets.get(nonce) || 0;
  if (uses >= 2) return false;
  usedTickets.set(nonce, uses + 1);
  if (usedTickets.size > 5000) usedTickets.clear();
  return true;
}
