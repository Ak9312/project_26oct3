import { askEngine, engineConfigured, ENGINES, type EngineId } from "./llm";
import { analyzeMentions } from "./mentions";
import { appendRows, readRows, sheetsConfigured, TABS } from "./sheets";

export interface TrackRow {
  runAt: string;
  week: string;
  prompt: string;
  engine: string;
  mentioned: boolean;
  position: string | null;
  competitorsNamed: string[];
  citations: string[];
  error?: string;
}

export interface TrackInput {
  brand: string;
  competitors: string[];
  prompts: string[];
  engines: EngineId[];
}

export const MAX_PROMPTS = 10;

import { isoWeek } from "./week";
export { isoWeek };

export async function runTracker(input: TrackInput): Promise<{ rows: TrackRow[]; savedToSheet: boolean }> {
  const engines = input.engines.filter(engineConfigured);
  if (!input.brand.trim()) throw new Error("Add your brand name.");
  if (input.prompts.length === 0) throw new Error("Add at least one prompt.");
  if (engines.length === 0) throw new Error("No AI engine has an API key set.");

  const runAt = new Date().toISOString();
  const week = isoWeek();
  const prompts = input.prompts.slice(0, MAX_PROMPTS);
  const jobs = prompts.flatMap((p) => engines.map((e) => ({ p, e })));

  const rows = await Promise.all(
    jobs.map(async ({ p, e }): Promise<TrackRow> => {
      const label = ENGINES.find((x) => x.id === e)?.label || e;
      try {
        const res = await askEngine(e, p);
        const m = analyzeMentions(res.text, input.brand, input.competitors);
        return { runAt, week, prompt: p, engine: label, ...m, citations: res.citations.slice(0, 5) };
      } catch (err) {
        return {
          runAt, week, prompt: p, engine: label,
          mentioned: false, position: null, competitorsNamed: [], citations: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  let savedToSheet = false;
  if (sheetsConfigured()) {
    try {
      await appendRows(
        TABS.tracker,
        rows.map((r) => [
          r.runAt, r.week, input.brand, r.prompt, r.engine,
          r.error ? "ERROR" : r.mentioned ? "Yes" : "No",
          r.position || "", r.competitorsNamed.join(", "), r.citations.join(" "), r.error || "",
        ]),
      );
      savedToSheet = true;
    } catch (e) {
      console.error("Sheets append failed", e);
    }
  }
  return { rows, savedToSheet };
}

/** Weekly mention rate from the Tracker tab: [{week, rate, total}] */
export async function trackerHistory(brand: string): Promise<{ week: string; mentioned: number; total: number }[]> {
  if (!sheetsConfigured()) return [];
  const rows = await readRows(TABS.tracker);
  const byWeek = new Map<string, { mentioned: number; total: number }>();
  for (const r of rows) {
    const [, week, b, , , status] = r;
    if (!week || !/^\d{4}-W\d{2}$/.test(week)) continue;
    if (brand && (b || "").toLowerCase() !== brand.toLowerCase()) continue;
    if (status !== "Yes" && status !== "No") continue;
    const w = byWeek.get(week) || { mentioned: 0, total: 0 };
    w.total += 1;
    if (status === "Yes") w.mentioned += 1;
    byWeek.set(week, w);
  }
  return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, v]) => ({ week, ...v }));
}
