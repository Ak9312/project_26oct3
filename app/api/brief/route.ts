import { generateBrief } from "@/lib/brief";
import { isAdminRequest, publicUsage, quotaCookie, releasePublicUse, reservePublicUse } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COUNTRIES = new Set(["in", "us", "uk", "gb", "ca", "au", "ae", "sg", "de", "fr"]);

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const keyword = String(body.keyword || "").trim().slice(0, 120);
  let country = String(body.country || "in").toLowerCase();
  if (country === "gb") country = "uk";
  const contentType = String(body.contentType || "Blog post").slice(0, 40);

  if (!keyword) return Response.json({ error: "Enter a keyword." }, { status: 400 });
  if (!COUNTRIES.has(country)) return Response.json({ error: "Unsupported country." }, { status: 400 });

  const admin = isAdminRequest(req);
  let reservation: { key: string; used: number } | null = null;
  if (!admin) {
    const u = publicUsage(req);
    if (u.remaining <= 0) {
      return Response.json(
        { error: `You've used today's ${u.limit} free briefs. Come back tomorrow.`, remaining: 0 },
        { status: 429 },
      );
    }
    reservation = reservePublicUse(req);
  }

  try {
    const brief = await generateBrief(keyword, country, contentType);
    if (!reservation) return Response.json(brief);
    const remaining = Math.max(0, publicUsage(req).limit - reservation.used);
    return Response.json({ ...brief, remaining }, { headers: { "Set-Cookie": quotaCookie(reservation.used) } });
  } catch (e) {
    if (reservation) releasePublicUse(reservation.key); // failed briefs don't count
    const message = e instanceof Error ? e.message : "Something went wrong.";
    return Response.json({ error: message }, { status: 502 });
  }
}
