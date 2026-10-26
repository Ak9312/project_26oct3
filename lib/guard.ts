// Optional password so strangers can't spend your API quota.
import { timingSafeEqual } from "node:crypto";

export function checkPassword(req: Request): Response | null {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return null;
  const got = req.headers.get("x-app-password") || "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length === b.length && timingSafeEqual(a, b)) return null;
  return Response.json({ error: "Wrong or missing app password." }, { status: 401 });
}
