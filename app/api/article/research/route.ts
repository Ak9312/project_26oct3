import { isAdminRequest, makeTicket, publicUsage, quotaCookie, releasePublicUse, reservePublicUse } from "@/lib/auth";
import { research } from "@/lib/sources";
import { writerAvailable } from "@/lib/writer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COUNTRIES = new Set(["in", "us", "uk", "ca", "au", "ae", "sg", "de", "fr"]);

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const keyword = String(body.keyword || "").trim().slice(0, 120);
  const country = String(body.country || "in").toLowerCase().replace("gb", "uk");
  if (!keyword) return Response.json({ error: "Enter a keyword." }, { status: 400 });
  if (!COUNTRIES.has(country)) return Response.json({ error: "Unsupported country." }, { status: 400 });
  if (!writerAvailable()) return Response.json({ error: "The article writer isn't set up yet." }, { status: 503 });

  const admin = isAdminRequest(req);
  let reservation: { key: string; used: number } | null = null;
  if (!admin) {
    const u = publicUsage(req, "article");
    if (u.remaining <= 0) {
      return Response.json({ error: `You've used today's ${u.limit} free articles. Come back tomorrow.`, remaining: 0 }, { status: 429 });
    }
    reservation = reservePublicUse(req, "article");
  }

  try {
    const r = await research(keyword, country);
    if (!r.sources.some((s) => s.ok)) {
      throw new Error("None of the top pages could be read for this keyword. Try a different keyword.");
    }
    const payload = { ...r, ticket: makeTicket(keyword) } as Record<string, unknown>;
    if (!reservation) return Response.json(payload);
    payload.remaining = Math.max(0, publicUsage(req, "article").limit - reservation.used);
    return Response.json(payload, { headers: { "Set-Cookie": quotaCookie(reservation.used, "article") } });
  } catch (e) {
    if (reservation) releasePublicUse(reservation.key);
    return Response.json({ error: e instanceof Error ? e.message : "Research failed." }, { status: 502 });
  }
}
