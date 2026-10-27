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

export function publicDailyLimit(): number {
  const n = Number(process.env.PUBLIC_DAILY_LIMIT ?? 5);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 5;
}

const today = () => new Date().toISOString().slice(0, 10);

export function clientIp(req: Request): string {
  return (
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown"
  );
}

const usage = new Map<string, number>();

function cookieCount(req: Request): number {
  const v = readCookie(req, QUOTA_COOKIE);
  if (!v) return 0;
  const parts = v.split(".");
  if (parts.length !== 3) return 0;
  const [day, count, sig] = parts;
  if (day !== today() || !safeEqual(sig, sign(`${day}.${count}`))) return 0;
  return Number(count) || 0;
}

export function publicUsage(req: Request) {
  const key = `${today()}:${clientIp(req)}`;
  const used = Math.max(usage.get(key) || 0, cookieCount(req));
  const limit = publicDailyLimit();
  return { key, used, limit, remaining: Math.max(0, limit - used) };
}

/** Reserves one brief before the slow work starts, so parallel clicks can't skip the limit. */
export function reservePublicUse(req: Request): { key: string; used: number } {
  const u = publicUsage(req);
  if (usage.size > 5000) {
    const prefix = `${today()}:`;
    for (const k of usage.keys()) if (!k.startsWith(prefix)) usage.delete(k);
  }
  usage.set(u.key, u.used + 1);
  return { key: u.key, used: u.used + 1 };
}

export function releasePublicUse(key: string): void {
  const n = usage.get(key) || 0;
  if (n > 0) usage.set(key, n - 1);
}

export function quotaCookie(used: number): string {
  const payload = `${today()}.${used}`;
  return `${QUOTA_COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=172800`;
}
