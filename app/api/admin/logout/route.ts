import { adminCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": adminCookie(null) } });
}
