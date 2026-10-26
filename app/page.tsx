"use client";
import { useEffect, useState } from "react";
import Connections from "@/components/Connections";
import { useStatus } from "@/components/useStatus";
import { api, store } from "@/lib/client";
import type { Brief } from "@/lib/brief";

const COUNTRIES = [
  ["in", "India"], ["us", "United States"], ["uk", "United Kingdom"], ["ca", "Canada"],
  ["au", "Australia"], ["ae", "UAE"], ["sg", "Singapore"], ["de", "Germany"], ["fr", "France"],
];
const TYPES = ["Blog post", "Landing page", "Comparison", "How-to guide", "Product page"];
const RECENT_KEY = "briefradar.recent";

export default function BriefPage() {
  const status = useStatus();
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("in");
  const [contentType, setContentType] = useState("Blog post");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [recent, setRecent] = useState<Brief[]>([]);

  useEffect(() => {
    try { setRecent(JSON.parse(store(RECENT_KEY) || "[]")); } catch { /* ignore */ }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) { setError("Enter a keyword first."); return; }
    setLoading(true); setError("");
    try {
      const b = await api<Brief>("/api/brief", {
        method: "POST",
        body: JSON.stringify({ keyword, country, contentType }),
      });
      setBrief(b);
      const next = [b, ...recent.filter((r) => r.keyword !== b.keyword)].slice(0, 8);
      setRecent(next);
      store(RECENT_KEY, JSON.stringify(next));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="main">
      <section className="stack">
        <p className="eyebrow">Keyword in, content brief out</p>
        <h1 className="title">Generate an SEO content brief</h1>
        <p className="lede">
          Real Google questions and related searches come from SerpApi. The LLM turns them into intent,
          headings and FAQs{status?.sheets ? ", and the brief is saved to your Google Sheet" : ""}.
        </p>
      </section>

      <form className="card form" onSubmit={submit} noValidate>
        <div className="field" style={{ flex: "3 1 320px" }}>
          <label htmlFor="kw">Target keyword</label>
          <input id="kw" type="text" value={keyword} placeholder="best crm for small business"
            onChange={(e) => { setKeyword(e.target.value); setError(""); }} maxLength={120} />
        </div>
        <div className="field" style={{ flex: "1 1 160px" }}>
          <label htmlFor="country">Google country</label>
          <select id="country" value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: "1 1 160px" }}>
          <label htmlFor="type">Content type</label>
          <select id="type" value={contentType} onChange={(e) => setContentType(e.target.value)}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Generating…" : "Generate brief"}
        </button>
      </form>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="layout">
        <div className="layout-main">
          {brief ? <BriefView b={brief} /> : (
            <div className="card empty">
              <h2 className="h">Start with a keyword</h2>
              <p className="note">Your brief appears here, with intent, a heading outline, questions to answer and related keywords.</p>
            </div>
          )}
        </div>
        <aside className="layout-side" aria-label="Connections and recent briefs">
          <Connections status={status} />
          {recent.length > 0 && (
            <div className="card stack" style={{ gap: 6 }}>
              <h2 className="h" style={{ fontSize: 16 }}>Recent briefs</h2>
              {recent.map((r) => (
                <button key={r.createdAt} type="button" className="btn" style={{ textAlign: "left", height: "auto", padding: "10px 12px", whiteSpace: "normal" }}
                  onClick={() => setBrief(r)}>
                  {r.keyword} <span className="mono">· {r.country}</span>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function BriefView({ b }: { b: Brief }) {
  const copy = () => {
    const md = [
      `# ${b.h1 || b.keyword}`,
      `Intent: ${b.intent}${b.intentReason ? ` — ${b.intentReason}` : ""}`,
      b.suggestedWordCount ? `Suggested length: ~${b.suggestedWordCount} words` : "",
      "", "## Outline", ...b.outline.map((o) => `${o.level === "H3" ? "  " : ""}- ${o.level}: ${o.text}`),
      "", "## Questions to answer", ...b.faqs.map((f) => `- ${f.question}${f.answerHint ? ` (${f.answerHint})` : ""}`),
      "", "## Related keywords", b.relatedKeywords.join(", "),
    ].join("\n");
    navigator.clipboard?.writeText(md).catch(() => {});
  };

  return (
    <section aria-label="Content brief" className="card stack" style={{ gap: 22, padding: 24 }}>
      <div className="row-between">
        <div className="stack" style={{ gap: 4 }}>
          <p className="note">Brief for · {b.country.toUpperCase()} · {b.contentType}</p>
          <h2 className="h" style={{ fontSize: 22 }}>{b.keyword}</h2>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {b.savedToSheet && <span className="pill pill-ok">Saved to Sheets</span>}
          <button type="button" className="btn" onClick={copy} style={{ height: 36, fontSize: 13 }}>Copy as Markdown</button>
        </div>
      </div>

      <div className="metrics">
        <div className="metric"><span className="metric-label">Search intent</span><span className="metric-value">{b.intent}</span></div>
        <div className="metric"><span className="metric-label">Suggested length</span><span className="metric-value">{b.suggestedWordCount ? `~${b.suggestedWordCount.toLocaleString()} words` : "—"}</span></div>
        <div className="metric"><span className="metric-label">Monthly volume</span><span className="metric-value na">Not in free plan</span></div>
        <div className="metric"><span className="metric-label">Keyword difficulty</span><span className="metric-value na">Not in free plan</span></div>
      </div>
      {b.intentReason && <p className="note">{b.intentReason}</p>}

      <div className="stack" style={{ gap: 10 }}>
        <h3 className="h">Heading outline</h3>
        <ol className="outline">
          {b.h1 && <li><span className="lvl">H1</span><span>{b.h1}</span></li>}
          {b.outline.map((o, i) => (
            <li key={i} className={o.level === "H3" ? "h3" : ""}><span className="lvl">{o.level}</span><span>{o.text}</span></li>
          ))}
        </ol>
      </div>

      <div className="stack" style={{ gap: 10 }}>
        <h3 className="h">Questions to answer</h3>
        <ul className="faqs">
          {b.faqs.map((f, i) => <li key={i}>{f.question}{f.answerHint && <span>{f.answerHint}</span>}</li>)}
        </ul>
        <p className="note">
          Based on {b.serp.questions.length} People Also Ask questions and {b.serp.autocomplete.length} autocomplete suggestions from Google.
        </p>
      </div>

      <div className="stack" style={{ gap: 10 }}>
        <h3 className="h">Related keywords to cover</h3>
        <div className="chips">{b.relatedKeywords.map((k) => <span key={k} className="chip">{k}</span>)}</div>
      </div>

      {(b.serp.questions.length > 0 || b.serp.relatedSearches.length > 0) && (
        <details>
          <summary className="note" style={{ cursor: "pointer" }}>Raw Google data used</summary>
          <div className="stack" style={{ gap: 8, marginTop: 10, fontSize: 14 }}>
            <div><strong>People Also Ask:</strong> {b.serp.questions.join(" · ") || "none"}</div>
            <div><strong>Autocomplete:</strong> {b.serp.autocomplete.join(" · ") || "none"}</div>
            <div><strong>Related searches:</strong> {b.serp.relatedSearches.join(" · ") || "none"}</div>
          </div>
        </details>
      )}
    </section>
  );
}
