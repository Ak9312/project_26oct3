import {
  adminCookie,
  adminEnabled,
  checkAdminPassword,
  loginBlocked,
  makeAdminToken,
  recordLoginFailure,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!adminEnabled()) {
    return Response.json(
      { error: "Admin isn't set up yet. Add APP_PASSWORD in Vercel → Settings → Environment Variables, then redeploy." },
      { status: 503 },
    );
  }
  if (loginBlocked(req)) {
    return Response.json({ error: "Too many wrong tries. Wait 15 minutes and try again." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const password = String(body.password || "");
  if (!checkAdminPassword(password)) {
    recordLoginFailure(req);
    await new Promise((r) => setTimeout(r, 600));
    return Response.json({ error: "That password isn't right." }, { status: 401 });
  }
  return Response.json({ ok: true }, { headers: { "Set-Cookie": adminCookie(makeAdminToken()) } });
}
