"use client";
import { useEffect, useMemo, useState } from "react";
import { Eye, Pencil, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardTitle, Input, Label, Textarea } from "@/components/ui/primitives";
import { api, ENGINE_LABELS, store, type Status } from "@/lib/client";
import { isoWeek } from "@/lib/week";
import { cn } from "@/lib/utils";
import type { TrackRow } from "@/lib/track";

const CFG_KEY = "briefradar.trackerConfig";
const RUN_KEY = "briefradar.lastRun";
const HIST_KEY = "briefradar.history";
const MAX_PROMPTS = 10;

interface Config { brand: string; competitors: string; prompts: string; engines: string[] }
interface Run { runAt: string; brand: string; competitors: string[]; prompts: string[]; engines: string[]; rows: TrackRow[]; savedToSheet: boolean }
interface Week { week: string; mentioned: number; total: number }

const splitComma = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const splitLines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = store(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function VisibilityDashboard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [config, setConfig] = useState<Config>({ brand: "", competitors: "", prompts: "", engines: [] });
  const [editing, setEditing] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [history, setHistory] = useState<Week[]>([]);
  const [historySource, setHistorySource] = useState<"sheets" | "browser">("browser");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setRun(readJson<Run | null>(RUN_KEY, null));
    api<Status>("/api/status")
      .then((s) => {
        setStatus(s);
        const saved = readJson<Config | null>(CFG_KEY, null);
        const d = s.trackDefaults;
        const available = ENGINE_LABELS.map(([id]) => id).filter((id) => s.engines?.[id]);
        const cfg: Config = saved ?? {
          brand: d?.brand || "",
          competitors: d?.competitors || "",
          prompts: (d?.prompts || []).join("\n"),
          engines: d?.engines?.length ? d.engines : available,
        };
        cfg.engines = cfg.engines.filter((id) => s.engines?.[id]);
        if (cfg.engines.length === 0) cfg.engines = available;
        setConfig(cfg);
        if (!cfg.brand || !cfg.prompts.trim()) setEditing(true);
        loadHistory(cfg.brand, !!s.sheets);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load settings."));
  }, []);

  async function loadHistory(brand: string, sheets: boolean) {
    const local = readJson<Record<string, Record<string, Week>>>(HIST_KEY, {})[brand.toLowerCase()] || {};
    const localWeeks = Object.values(local).sort((a, b) => a.week.localeCompare(b.week));
    if (sheets && brand) {
      try {
        const r = await api<{ history: Week[] }>(`/api/track?brand=${encodeURIComponent(brand)}`);
        if (r.history?.length) {
          setHistory(r.history);
          setHistorySource("sheets");
          return;
        }
      } catch {
        /* fall back to this browser's history */
      }
    }
    setHistory(localWeeks);
    setHistorySource("browser");
  }

  function saveConfig(next: Config) {
    setConfig(next);
    store(CFG_KEY, JSON.stringify(next));
  }

  async function runCheck() {
    const prompts = splitLines(config.prompts).slice(0, MAX_PROMPTS);
    if (!config.brand.trim()) return fail("Add your brand name.");
    if (prompts.length === 0) return fail("Add at least one prompt, one per line.");
    if (config.engines.length === 0) return fail("Pick at least one AI engine.");
    setError("");
    setRunning(true);
    saveConfig(config);
    try {
      const r = await api<{ rows: TrackRow[]; savedToSheet: boolean }>("/api/track", {
        method: "POST",
        body: JSON.stringify({ brand: config.brand, competitors: config.competitors, prompts, engines: config.engines }),
      });
      const next: Run = {
        runAt: new Date().toISOString(),
        brand: config.brand.trim(),
        competitors: splitComma(config.competitors),
        prompts,
        engines: config.engines.map((id) => ENGINE_LABELS.find(([e]) => e === id)?.[1] || id),
        rows: r.rows,
        savedToSheet: r.savedToSheet,
      };
      setRun(next);
      store(RUN_KEY, JSON.stringify(next));
      const ok = r.rows.filter((x) => !x.error);
      if (ok.length) {
        const all = readJson<Record<string, Record<string, Week>>>(HIST_KEY, {});
        const key = next.brand.toLowerCase();
        const week = isoWeek();
        all[key] = { ...(all[key] || {}), [week]: { week, mentioned: ok.filter((x) => x.mentioned).length, total: ok.length } };
        store(HIST_KEY, JSON.stringify(all));
      }
      setEditing(false);
      loadHistory(next.brand, !!status?.sheets);
    } catch (e) {
      fail(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setRunning(false);
    }
  }

  function fail(msg: string) {
    setError(msg);
    setEditing(true);
  }

  const stats = useMemo(() => (run ? computeStats(run) : null), [run]);
  const enginesAvailable = ENGINE_LABELS.filter(([id]) => status?.engines?.[id]);
  const promptCount = splitLines(config.prompts).length;

  if (!status && !error) {
    return <div className="flex flex-col gap-4" aria-busy="true">{[60, 120, 240].map((h) => <div key={h} className="animate-pulse rounded-xl bg-zinc-100" style={{ height: h }} />)}</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-semibold tracking-[-0.025em]">AI visibility</h1>
          <p className="text-sm text-zinc-600">
            How often AI answers name {config.brand || "your brand"}.
            {run && ` Last run ${new Date(run.runAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.`}
            {status?.cron?.promptsSet ? " Also runs automatically every Monday at 08:30 IST." : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditing((v) => !v)}>
            <Pencil aria-hidden="true" />
            {editing ? "Close setup" : "Edit setup"}
          </Button>
          <Button onClick={runCheck} disabled={running}>
            <Play aria-hidden="true" />
            {running ? "Asking the engines…" : "Run check now"}
          </Button>
        </div>
      </div>

      {enginesAvailable.length === 0 && status && (
        <Alert tone="warning">No AI engine has an API key yet. Add OPENAI_API_KEY, PERPLEXITY_API_KEY, GEMINI_API_KEY or ANTHROPIC_API_KEY in Vercel, then redeploy.</Alert>
      )}
      {error && <Alert>{error}</Alert>}

      {editing ? (
        <Card className="flex flex-col gap-5 p-5">
          <div className="flex flex-wrap gap-4">
            <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5">
              <Label htmlFor="brand">Your brand</Label>
              <Input id="brand" value={config.brand} placeholder="Acme CRM" maxLength={80} onChange={(e) => setConfig({ ...config, brand: e.target.value })} />
            </div>
            <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-1.5">
              <Label htmlFor="comp">Competitors, comma separated</Label>
              <Input id="comp" value={config.competitors} placeholder="HubSpot, Zoho, Pipedrive" onChange={(e) => setConfig({ ...config, competitors: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prompts">Prompts to check, one per line (up to {MAX_PROMPTS})</Label>
            <Textarea
              id="prompts"
              value={config.prompts}
              placeholder={"best crm for small business in india\nsimple crm for freelancers"}
              onChange={(e) => setConfig({ ...config, prompts: e.target.value })}
            />
            {promptCount > MAX_PROMPTS && <p className="text-[13px] text-zinc-600">Only the first {MAX_PROMPTS} will run.</p>}
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">AI engines</legend>
            <div className="flex flex-wrap gap-2">
              {ENGINE_LABELS.map(([id, label, env]) => {
                const on = !!status?.engines?.[id];
                return (
                  <label key={id} title={on ? undefined : `Add ${env} in Vercel to enable`} className={cn("flex min-h-11 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3.5 text-sm", on ? "cursor-pointer" : "text-zinc-500")}>
                    <input
                      type="checkbox"
                      className="size-4 accent-[#4338ca]"
                      disabled={!on}
                      checked={config.engines.includes(id)}
                      onChange={(e) => setConfig({ ...config, engines: e.target.checked ? [...config.engines, id] : config.engines.filter((x) => x !== id) })}
                    />
                    {label}
                    {!on && <span className="font-mono text-xs">no key</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button onClick={runCheck} disabled={running}>{running ? "Asking the engines…" : "Save and run check"}</Button>
            <Button variant="ghost" onClick={() => { saveConfig(config); setEditing(false); }}>Save</Button>
          </div>
        </Card>
      ) : (
        <Card className="flex flex-wrap items-center gap-x-7 gap-y-3 px-5 py-3.5 text-sm">
          <span className="flex items-center gap-2"><span className="text-zinc-500">Brand</span><span className="font-semibold">{config.brand}</span></span>
          {splitComma(config.competitors).length > 0 && (
            <span className="flex flex-wrap items-center gap-2"><span className="text-zinc-500">Competitors</span>{splitComma(config.competitors).map((c) => <Badge key={c}>{c}</Badge>)}</span>
          )}
          <span className="flex items-center gap-2"><span className="text-zinc-500">Engines</span><span className="font-medium">{config.engines.map((id) => ENGINE_LABELS.find(([e]) => e === id)?.[1]).join(" · ") || "None"}</span></span>
          <span className="flex items-center gap-2"><span className="text-zinc-500">Prompts</span><span className="font-mono font-medium">{Math.min(promptCount, MAX_PROMPTS)}</span></span>
        </Card>
      )}

      {running && <Alert tone="info">Asking {config.engines.length} engine{config.engines.length === 1 ? "" : "s"} {Math.min(promptCount, MAX_PROMPTS)} prompt{promptCount === 1 ? "" : "s"} each. This takes up to a minute.</Alert>}

      {!run || !stats ? (
        !editing && (
          <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600"><Eye className="size-5" aria-hidden="true" /></span>
            <h2 className="text-base font-semibold">Run your first check</h2>
            <p className="max-w-md text-sm text-zinc-600">Each prompt goes to every engine you picked, and the answers are checked for your brand and competitors.</p>
          </Card>
        )
      ) : (
        <Results run={run} stats={stats} history={history} historySource={historySource} sheets={!!status?.sheets} />
      )}

      <p className="text-[13px] text-zinc-500">
        Answers come from each engine&apos;s API, a close proxy for the consumer apps rather than an exact copy. Read week-over-week trends, not single runs.
      </p>
    </div>
  );
}

function computeStats(run: Run) {
  const ok = run.rows.filter((r) => !r.error);
  const named = ok.filter((r) => r.mentioned);
  const comp = new Map<string, number>(run.competitors.map((c) => [c, 0]));
  ok.forEach((r) => r.competitorsNamed.forEach((c) => comp.set(c, (comp.get(c) || 0) + 1)));
  const totalMentions = named.length + [...comp.values()].reduce((a, b) => a + b, 0);
  const positions = named.map((r) => parseInt(r.position || "", 10)).filter((n) => Number.isFinite(n));
  const domains = new Map<string, number>();
  run.rows.forEach((r) =>
    r.citations.forEach((u) => {
      try {
        const h = new URL(u).hostname.replace(/^www\./, "");
        domains.set(h, (domains.get(h) || 0) + 1);
      } catch {
        /* skip bad URL */
      }
    }),
  );
  return {
    ok,
    errors: run.rows.filter((r) => r.error),
    mentionRate: ok.length ? pct(named.length, ok.length) : null,
    named: named.length,
    shareOfVoice: totalMentions ? pct(named.length, totalMentions) : null,
    voice: [
      { name: run.brand, count: named.length, you: true },
      ...[...comp.entries()].map(([name, count]) => ({ name, count, you: false })).sort((a, b) => b.count - a.count),
    ].map((v) => ({ ...v, share: pct(v.count, totalMentions) })),
    avgPosition: positions.length ? (positions.reduce((a, b) => a + b, 0) / positions.length).toFixed(1) : null,
    byEngine: run.engines.map((label) => {
      const rows = ok.filter((r) => r.engine === label);
      return { label, named: rows.filter((r) => r.mentioned).length, total: rows.length };
    }),
    domains: [...domains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
  };
}

type Stats = ReturnType<typeof computeStats>;
const VOICE_COLORS = ["bg-brand", "bg-zinc-400", "bg-zinc-300", "bg-zinc-200", "bg-zinc-100"];

function Results({ run, stats, history, historySource, sheets }: { run: Run; stats: Stats; history: Week[]; historySource: string; sheets: boolean }) {
  const last = history.at(-1);
  const prev = history.at(-2);
  const delta = last && prev && last.total && prev.total ? pct(last.mentioned, last.total) - pct(prev.mentioned, prev.total) : null;

  return (
    <>
      {stats.errors.length > 0 && (
        <Alert tone="warning">
          {stats.errors.length} of {run.rows.length} answers failed and aren&apos;t counted. First error: {stats.errors[0].engine} · {stats.errors[0].error}
        </Alert>
      )}

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Mention rate" value={stats.mentionRate === null ? "—" : `${stats.mentionRate}%`}
          note={delta === null ? `${stats.named} of ${stats.ok.length} answers` : `${delta > 0 ? "+" : ""}${delta} pts vs last week`}
          tone={delta === null ? undefined : delta > 0 ? "up" : delta < 0 ? "down" : undefined} />
        <Kpi label="Share of voice" value={stats.shareOfVoice === null ? "—" : `${stats.shareOfVoice}%`} note="of all tracked brand mentions" />
        <Kpi label="Average position" value={stats.avgPosition ?? "—"} note="when you're named" />
        <Kpi label="Answers checked" value={String(stats.ok.length)} note={`${run.prompts.length} prompts × ${run.engines.length} engines`} />
      </section>

      <div className="flex flex-wrap items-stretch gap-4">
        <Card className="flex min-w-0 flex-[3_1_420px] flex-col gap-4 p-5">
          <div className="flex items-baseline justify-between gap-2">
            <CardTitle>Mention rate by week</CardTitle>
            <span className="text-[13px] text-zinc-500">{historySource === "sheets" ? "From Google Sheets" : "Saved in this browser"}</span>
          </div>
          {history.length < 2 ? (
            <p className="text-sm text-zinc-600">
              The trend appears after checks in two different weeks.{" "}
              {!sheets && "Connect Google Sheets to keep history across devices and from the weekly automatic run."}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex h-44 items-end gap-3 border-b border-zinc-200 px-1">
                {history.slice(-8).map((w, i, arr) => {
                  const v = pct(w.mentioned, w.total);
                  const current = i === arr.length - 1;
                  return (
                    <div key={w.week} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${w.week}: ${w.mentioned} of ${w.total}`}>
                      <span className={cn("font-mono text-xs", current ? "font-semibold text-zinc-950" : "text-zinc-500")}>{v}%</span>
                      <div className={cn("w-full max-w-11 rounded-t", current ? "bg-brand" : "bg-indigo-200")} style={{ height: `${Math.max(v, 2) * 1.2}px` }} />
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3 px-1">
                {history.slice(-8).map((w) => <span key={w.week} className="flex-1 text-center font-mono text-xs text-zinc-500">{w.week.slice(5)}</span>)}
              </div>
            </div>
          )}
        </Card>

        <Card className="flex min-w-0 flex-[2_1_300px] flex-col gap-4 p-5">
          <CardTitle>By engine</CardTitle>
          {stats.byEngine.map((e) => (
            <div key={e.label} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-sm"><span>{e.label}</span><span className="font-mono">{e.named} of {e.total} · {pct(e.named, e.total)}%</span></div>
              <div className="h-2 rounded-full bg-zinc-100"><div className="h-2 rounded-full bg-brand" style={{ width: `${pct(e.named, e.total)}%` }} /></div>
            </div>
          ))}
        </Card>
      </div>

      <Card className="flex flex-col gap-3.5 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle>Prompt by engine</CardTitle>
          <span className="text-[13px] text-zinc-500">Position is your order among the brands named</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-zinc-200 px-3 py-2.5 text-left text-xs font-medium text-zinc-500">Prompt</th>
                {run.engines.map((e) => <th key={e} className="border-b border-zinc-200 px-3 py-2.5 text-center text-xs font-medium text-zinc-500">{e}</th>)}
              </tr>
            </thead>
            <tbody>
              {run.prompts.map((p) => (
                <tr key={p} className="border-b border-zinc-100 last:border-b-0">
                  <td className="px-3 py-3">{p}</td>
                  {run.engines.map((e) => {
                    const r = run.rows.find((x) => x.prompt === p && x.engine === e);
                    return (
                      <td key={e} className="px-2 py-2 text-center">
                        {!r ? "—" : r.error ? (
                          <Badge tone="warning" title={r.error}>Error</Badge>
                        ) : r.mentioned ? (
                          <Badge tone="success" className="min-w-16 justify-center">#{r.position}</Badge>
                        ) : (
                          <Badge tone="danger" className="min-w-16 justify-center">Not named</Badge>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex flex-wrap items-stretch gap-4">
        <Card className="flex min-w-0 flex-[1_1_340px] flex-col gap-3.5 p-5">
          <CardTitle>Share of voice</CardTitle>
          {stats.voice.every((v) => v.count === 0) ? (
            <p className="text-sm text-zinc-600">No tracked brands were named in this run.</p>
          ) : (
            <>
              <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                {stats.voice.filter((v) => v.count > 0).map((v, i) => <div key={v.name} className={VOICE_COLORS[Math.min(i, 4)]} style={{ width: `${v.share}%` }} />)}
              </div>
              <ul className="flex flex-col gap-2 text-sm">
                {stats.voice.map((v, i) => (
                  <li key={v.name} className="flex justify-between gap-3">
                    <span className={cn("flex items-center gap-2", v.you && "font-semibold")}>
                      <span className={cn("size-2.5 rounded-sm", VOICE_COLORS[Math.min(i, 4)])} aria-hidden="true" />
                      {v.name}{v.you && " (you)"}
                    </span>
                    <span className="font-mono">{v.count} · {v.share}%</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card className="flex min-w-0 flex-[1_1_340px] flex-col gap-3.5 p-5">
          <div className="flex items-baseline justify-between gap-2"><CardTitle>Most cited sources</CardTitle><span className="text-[13px] text-zinc-500">From engines that return sources</span></div>
          {stats.domains.length === 0 ? (
            <p className="text-sm text-zinc-600">No sources in this run. Perplexity returns the pages it cites; add PERPLEXITY_API_KEY to see them.</p>
          ) : (
            <ul className="flex flex-col text-sm">
              {stats.domains.map(([d, n]) => (
                <li key={d} className="flex justify-between border-b border-zinc-100 py-2 last:border-b-0"><span>{d}</span><span className="font-mono text-zinc-600">{n}</span></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "up" | "down" }) {
  return (
    <Card className="flex flex-col gap-2 p-4.5">
      <span className="text-[13px] text-zinc-600">{label}</span>
      <span className="font-mono text-3xl font-semibold tracking-tight">{value}</span>
      <span className={cn("text-[13px]", tone === "up" ? "font-medium text-emerald-700" : tone === "down" ? "font-medium text-red-700" : "text-zinc-500")}>{note}</span>
    </Card>
  );
}
