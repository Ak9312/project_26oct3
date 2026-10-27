"use client";
import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import { api, ENGINE_LABELS, type Status } from "@/lib/client";

const PROVIDER: Record<string, string> = { groq: "Groq", anthropic: "Claude", openai: "OpenAI", gemini: "Gemini" };

export default function SettingsView() {
  const [status, setStatus] = useState<Status | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    api<Status>("/api/status").then(setStatus).catch(() => {});
  }, []);

  const engines = ENGINE_LABELS.map(([id, label, env]) => ({ label, env, on: !!status?.engines?.[id] }));

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-semibold tracking-[-0.025em]">Settings and links</h1>
        <p className="text-sm text-zinc-600">Share the public link with anyone. Keep the admin link for yourself.</p>
      </div>

      <section aria-label="Share links" className="grid gap-4 md:grid-cols-2">
        <LinkCard title="Public link" badge={<Badge tone="success">Anyone can open</Badge>} url={origin ? `${origin}/` : ""}
          note={`Brief generator only. Each visitor gets ${status?.dailyLimit ?? 5} free briefs a day.`} />
        <LinkCard title="Admin link" badge={<Badge>Password required</Badge>} url={origin ? `${origin}/admin` : ""}
          note="Unlimited briefs, AI visibility and settings." />
      </section>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-100 px-5 py-4">
          <CardTitle>Connections</CardTitle>
          <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[13px] text-brand hover:text-brand-hover">
            Manage keys in Vercel <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </div>
        {!status ? (
          <p className="px-5 py-4 text-sm text-zinc-600">Checking…</p>
        ) : (
          <ul>
            <Row name="SerpApi" desc="Google data for briefs · free plan, 250 searches a month" on={!!status.serpapi} envHint="SERPAPI_KEY" />
            <Row
              name={status.briefLlm ? PROVIDER[status.briefLlm] || status.briefLlm : "Brief writer"}
              desc={status.briefModel ? `Writes the briefs · ${status.briefModel}` : "Writes the briefs"}
              on={!!status.briefLlm}
              envHint="GROQ_API_KEY"
            />
            {engines.map((e) => (
              <Row key={e.label} name={e.label} desc="AI visibility engine" on={e.on} envHint={e.env} offLabel="Not set" />
            ))}
            <Row name="Google Sheets" desc="Saves every brief and visibility run, and keeps weekly history" on={!!status.sheets} envHint="GOOGLE_SHEET_ID" offLabel="Optional" />
          </ul>
        )}
      </Card>

      <section aria-label="Limits and schedule" className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-2 p-5">
          <CardTitle>Public limit</CardTitle>
          <p className="font-mono text-[26px] font-semibold">
            {status?.dailyLimit ?? 5} <span className="font-sans text-sm font-normal text-zinc-600">briefs per visitor per day</span>
          </p>
          <p className="text-[13px] text-zinc-600">Change it with PUBLIC_DAILY_LIMIT in Vercel. Admins have no limit.</p>
        </Card>
        <Card className="flex flex-col gap-2 p-5">
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Weekly check</CardTitle>
            {status?.cron?.promptsSet && status.cron.brand ? <Badge tone="success">On</Badge> : <Badge tone="warning">Not set up</Badge>}
          </div>
          <p className="text-[15px] font-medium">Mondays, 08:30 IST</p>
          <p className="text-[13px] text-zinc-600">
            {status?.cron?.promptsSet && status.cron.brand
              ? `Tracking ${status.cron.brand}. Results are saved to Google Sheets when it's connected.`
              : "Add TRACK_BRAND and TRACK_PROMPTS in Vercel to turn it on."}
          </p>
        </Card>
      </section>
    </div>
  );
}

function LinkCard({ title, badge, url, note }: { title: string; badge: React.ReactNode; url: string; note: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-2"><CardTitle>{title}</CardTitle>{badge}</div>
      <div className="flex gap-2">
        <span className="flex h-10 min-w-0 flex-1 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-zinc-200 bg-zinc-50 px-3 font-mono text-[13px]">
          {url.replace(/^https?:\/\//, "") || "…"}
        </span>
        <Button variant="outline" onClick={copy} disabled={!url} aria-live="polite">
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-[13px] text-zinc-600">{note}</p>
    </Card>
  );
}

function Row({ name, desc, on, envHint, offLabel = "Not set" }: { name: string; desc: string; on: boolean; envHint: string; offLabel?: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-5 py-3.5 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">{name}</span>
        <span className="text-[13px] text-zinc-600">{on ? desc : `${desc} · add ${envHint}`}</span>
      </div>
      {on ? <Badge tone="success">Connected</Badge> : <Badge>{offLabel}</Badge>}
    </li>
  );
}
