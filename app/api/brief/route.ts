import { generateBrief } from "@/lib/brief";
import { checkPassword } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COUNTRIES = new Set(["in", "us", "uk", "gb", "ca", "au", "ae", "sg", "de", "fr"]);

export async function POST(req: Request) {
  const denied = checkPassword(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const keyword = String(body.keyword || "").trim().slice(0, 120);
  let country = String(body.country || "in").toLowerCase();
  if (country === "gb") country = "uk";
  const contentType = String(body.contentType || "Blog post").slice(0, 40);

  if (!keyword) return Response.json({ error: "Enter a keyword." }, { status: 400 });
  if (!COUNTRIES.has(country)) return Response.json({ error: "Unsupported country." }, { status: 400 });

  try {
    const brief = await generateBrief(keyword, country, contentType);
    return Response.json(brief);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Something went wrong.";
    return Response.json({ error: message }, { status: 502 });
  }
}
