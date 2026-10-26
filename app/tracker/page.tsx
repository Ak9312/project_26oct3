"use client";
import { useEffect, useState } from "react";
import Connections from "@/components/Connections";
import { useStatus } from "@/components/useStatus";
import { api, store } from "@/lib/client";
import type { TrackRow } from "@/lib/track";

const ENGINES = [
  { id: "chatgpt", label: "ChatGPT", env: "OPENAI_API_KEY" },
  { id: "perplexity", label: "Perplexity", env: "PERPLEXITY_API_KEY" },
  { id: "gemini", label: "Gemini", env: "GEMINI_API_KEY" },
  { id: "claude", label: "Claude", env: "ANTHROPIC_API_KEY" },
];
const CFG_KEY = "briefradar.tracker";
const MAX_PROMPTS = 10;

interface Week { week: string; mentioned: number; total: number }

export default function TrackerPage() {
  const status = useStatus();
  const [brand, setBrand] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [prompts, setPrompts] = useState("");
  const [engines, setEngines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<TrackRow[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<Week[]>([]);

  useEffect(() => {
    try {
      const c = JSON.parse(store(CFG_KEY) || "{}");
      if (c.brand) setBrand(c.brand);
      if (c.competitors) setCompetitors(c.competitors);
      if (c.prompts) setPrompts(c.prompts);
      if (Array.isArray(c.engines)) setEngines(c.engines);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!status) return;
    setEngines((cur) => (cur.length ? cur.filter((e) => status.engines[e]) : ENGINES.map((e) => e.id).filter((e) => status.engines[e])));
    if (status.sheets) loadHistory(brand || status.cron.brand || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function loadHistory(b: string) {
    try {
      const r = await api<{ history: Week[] }>(`/api/track?brand=${encodeURIComponent(b)}`);
      setHistory(r.history || []);
    } catch { /* optional */ }
  }

  const promptList = prompts.split("\n").map((p) => p.trim()).filter(Boolean);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!brand.trim()) { setError("Enter your brand name."); return; }
    if (promptList.length === 0) { setError("Add at least one prompt, one per line."); return; }
    if (engines.length === 0) { setError("Pick at least one AI engine that has a key set."); return; }
    setError(""); setLoading(true);
    store(CFG_KEY, JSON.stringify({ brand, competitors, prompts, engines }));
    try {
      const r = await api<{ rows: TrackRow[]; savedToSheet: boolean }>("/api/track", {
        method: "POST",
        body: JSON.stringify({ brand, competitors, prompts: promptList, engines }),
      });
      setRows(r.rows); setSaved(r.savedToSheet);
      if (r.savedToSheet) loadHistory(brand);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const ok = rows?.filter((r) => !r.error) || [];
  const rate = ok.length ? Math.round((ok.filter((r) => r.mentioned).length / ok.length) * 100) : null;
  const compCounts = new Map<string, number>();
  ok.forEach((r) => r.competitorsNamed.forEach((c) => compCounts.set(c, (compCounts.get(c) || 0) + 1)));
  const topComp = [...compCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const prevWeek = history.length >= 2 ? history[history.length - 2] : null;
  const lastWeek = history.length >= 1 ? history[history.length - 1] : null;
  const delta = prevWeek && lastWeek && prevWeek.total && lastWeek.total
    ? Math.round((lastWeek.mentioned / lastWeek.total - prevWeek.mentioned / prevWeek.total) * 100)
    : null;

  return (
    <main className="main">
      <section className="stack">
        <p className="eyebrow">
          {status?.cron.promptsSet ? "Weekly check runs Mondays 08:30 IST" : "Weekly check: set TRACK_BRAND and TRACK_PROMPTS to turn it on"}
        </p>
        <h1 className="title">Is your brand in AI answers?</h1>
        <p className="lede">
          Each prompt is sent to every AI engine through its API, and the answer is checked for your brand and competitors.
          API answers are a close proxy for the consumer apps, not an exact copy, so read this as a trend.
        </p>
      </section>

      <form className="card stack" style={{ gap: 16 }} onSubmit={run} noValidate>
        <div className="form">
          <div className="field" style={{ flex: "1 1 220px" }}>
            <label htmlFor="brand">Your brand</label>
            <input id="brand" type="text" value={brand} placeholder="Acme CRM" maxLength={80}
              onChange={(e) => { setBrand(e.target.value); setError(""); }} />
          </div>
          <div className="field" style={{ flex: "2 1 300px" }}>
            <label htmlFor="comp">Competitors, comma separated</label>
            <input id="comp" type="text" value={competitors} placeholder="HubSpot, Zoho, Pipedrive"
              onChange={(e) => setCompetitors(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="prompts">Prompts to check, one per line (up to {MAX_PROMPTS})</label>
          <textarea id="prompts" value={prompts}
            placeholder={"best crm for small business in india\nsimple crm for freelancers"}
            onChange={(e) => { setPrompts(e.target.value); setError(""); }} />
          {promptList.length > MAX_PROMPTS && <p className="note">Only the first {MAX_PROMPTS} will run.</p>}
        </div>
        <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
          <legend className="legend" style={{ marginBottom: 8 }}>AI engines</legend>
          <div className="checks">
            {ENGINES.map((e) => {
              const on = !!status?.engines[e.id];
              return (
                <label key={e.id} className={`check${on ? "" : " off"}`} title={on ? "" : `Set ${e.env} to enable`}>
                  <input type="checkbox" disabled={!on} checked={engines.includes(e.id)}
                    onChange={(ev) => setEngines((cur) => ev.target.checked ? [...cur, e.id] : cur.filter((x) => x !== e.id))} />
                  {e.label}{!on && <span className="mono">no key</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div><button className="btn btn-primary" type="submit" disabled={loading}>{loading ? "Asking the engines…" : "Run check now"}</button></div>
      </form>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="layout">
        <div className="layout-main">
          <section aria-label="This run" className="metrics">
            <div className="card stack"><span className="metric-label">Mention rate</span><span className="metric-value big">{rate === null ? "—" : `${rate}%`}</span></div>
            <div className="card stack"><span className="metric-label">Change vs last week</span><span className="metric-value big">{delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta} pts`}</span></div>
            <div className="card stack"><span className="metric-label">Answers checked</span><span className="metric-value big">{rows ? ok.length : "—"}</span></div>
            <div className="card stack"><span className="metric-label">Top competitor named</span><span className="metric-value" style={{ fontSize: 20, paddingTop: 6 }}>{topComp ? topComp[0] : "—"}</span></div>
          </section>

          {history.length > 0 && (
            <section className="card stack" aria-label="Weekly mention rate" style={{ gap: 10 }}>
              <h2 className="h">Weekly mention rate</h2>
              <div className="bars">
                {history.slice(-12).map((w) => {
                  const pct = w.total ? Math.round((w.mentioned / w.total) * 100) : 0;
                  return (
                    <div className="bar" key={w.week} title={`${w.week}: ${w.mentioned} of ${w.total}`}>
                      <span className="bar-val">{pct}%</span>
                      <div className="bar-fill" style={{ height: `${Math.max(pct, 2)}%` }} />
                      <span className="bar-label">{w.week.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="card stack" aria-label="Results" style={{ gap: 14 }}>
            <div className="row-between">
              <h2 className="h">Results</h2>
              {saved && <span className="pill pill-ok">Saved to Sheets</span>}
            </div>
            {!rows ? (
              <p className="note">Run a check to see which answers mention your brand.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Prompt</th><th>Engine</th><th>Mentioned</th><th>Position</th><th>Competitors named</th><th>Cited URLs</th></tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td>{r.prompt}</td>
                        <td>{r.engine}</td>
                        <td>
                          {r.error ? <span className="pill pill-warn" title={r.error}>Error</span>
                            : r.mentioned ? <span className="pill pill-ok">Yes</span>
                            : <span className="pill pill-bad">No</span>}
                        </td>
                        <td className="num">{r.position || "—"}</td>
                        <td>{r.error ? <span className="note">{r.error}</span> : r.competitorsNamed.join(", ") || "—"}</td>
                        <td className="cites">
                          {r.citations.length ? r.citations.map((c) => <a key={c} href={c} target="_blank" rel="noreferrer noopener">{c.replace(/^https?:\/\//, "")}</a>) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="note">Position is your brand&apos;s order among the tracked names that appear in the answer.</p>
          </section>
        </div>
        <aside className="layout-side"><Connections status={status} /></aside>
      </div>
    </main>
  );
}
