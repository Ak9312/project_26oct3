"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardTitle } from "@/components/ui/primitives";
import { api, COUNTRIES, countryName, type Status } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { Brief } from "@/lib/brief";

const TYPES = ["Blog post", "Landing page", "Comparison", "How-to guide", "Product page"];
type BriefResponse = Brief & { remaining?: number };

export default function BriefGenerator({ mode }: { mode: "public" | "admin" }) {
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("in");
  const [contentType, setContentType] = useState("Blog post");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [usage, setUsage] = useState<{ limit: number; remaining: number } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode !== "public") return;
    api<Status>("/api/status")
      .then((s) => !s.admin && setUsage({ limit: s.dailyLimit, remaining: s.remaining ?? s.dailyLimit }))
      .catch(() => {});
  }, [mode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) {
      setError("Enter a keyword first.");
      return;
    }
    setError("");
    setLoading(true);
    setStage("Reading Google results…");
    const t = setTimeout(() => setStage("Writing your brief…"), 3500);
    try {
      const b = await api<BriefResponse>("/api/brief", {
        method: "POST",
        body: JSON.stringify({ keyword, country, contentType }),
      });
      setBrief(b);
      if (typeof b.remaining === "number" && usage) setUsage({ ...usage, remaining: b.remaining });
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(msg);
      if (/free briefs/.test(msg) && usage) setUsage({ ...usage, remaining: 0 });
    } finally {
      clearTimeout(t);
      setLoading(false);
    }
  }

  const outOfBriefs = mode === "public" && usage?.remaining === 0;

  return (
    <div className="flex flex-col gap-10">
      {mode === "public" ? (
        <section className="flex flex-col items-center gap-4 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-brand-soft px-3 py-1 text-[13px] font-medium text-brand-ink">
            <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
            Free to use · {usage?.limit ?? 5} briefs a day
          </span>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.035em] sm:text-5xl">
            Turn a keyword into a content brief
          </h1>
          <p className="max-w-xl text-lg text-zinc-600">
            Search intent, a heading outline and the questions people actually ask Google, ready in seconds.
          </p>
        </section>
      ) : (
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-semibold tracking-[-0.025em]">Briefs</h1>
          <p className="text-sm text-zinc-600">Unlimited for admins. Same tool your visitors use.</p>
        </div>
      )}

      <div className={cn("flex w-full flex-col gap-3", mode === "public" && "mx-auto max-w-4xl")}>
        <form
          onSubmit={submit}
          noValidate
          className="flex flex-wrap items-stretch gap-2 rounded-2xl border border-zinc-200 bg-white p-2.5 shadow-[0_1px_2px_rgba(9,9,11,0.04),0_8px_24px_rgba(9,9,11,0.04)]"
        >
          <div className="flex min-h-13 flex-[3_1_280px] items-center gap-2.5 rounded-xl border border-zinc-100 bg-zinc-50 px-3.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
            <Search className="size-[18px] shrink-0 text-zinc-500" aria-hidden="true" />
            <label htmlFor="kw" className="sr-only">Target keyword</label>
            <input
              id="kw"
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setError("");
              }}
              placeholder="Please enter keywords"
              maxLength={120}
              autoComplete="off"
              className="h-12 min-w-0 flex-1 bg-transparent text-base text-zinc-950 placeholder:text-zinc-400 focus:outline-none"
            />
          </div>
          <SelectField id="country" label="Google country" value={country} onChange={setCountry}>
            {COUNTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </SelectField>
          <SelectField id="ctype" label="Content type" value={contentType} onChange={setContentType}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </SelectField>
          <Button type="submit" size="lg" disabled={loading || outOfBriefs} className="min-h-13 flex-[0_1_auto] rounded-xl">
            {loading ? "Generating…" : "Generate brief"}
          </Button>
        </form>

        {mode === "public" && (
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-zinc-600">
            <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-emerald-700" aria-hidden="true" />Live Google data via SerpApi</span>
            <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-emerald-700" aria-hidden="true" />Written by AI</span>
            {usage && <UsageMeter limit={usage.limit} remaining={usage.remaining} />}
          </div>
        )}
        {error && <Alert>{error}</Alert>}
      </div>

      <div ref={resultRef} className="flex scroll-mt-24 flex-wrap items-start gap-6">
        <div className="min-w-0 flex-[999_1_600px]">
          {loading ? <BriefSkeleton stage={stage} /> : brief ? <BriefView b={brief} /> : <EmptyBrief />}
        </div>
        <aside aria-label="Google signals and how it works" className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          {brief && !loading && <Signals b={brief} />}
          <HowItWorks />
        </aside>
      </div>
    </div>
  );
}

function SelectField(props: { id: string; label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-[1_1_150px] flex-col justify-center gap-0.5 rounded-xl border border-zinc-200 px-3 py-1.5 focus-within:border-brand">
      <label htmlFor={props.id} className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{props.label}</label>
      <select
        id={props.id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="cursor-pointer bg-transparent text-[15px] text-zinc-950 focus:outline-none"
      >
        {props.children}
      </select>
    </div>
  );
}

function UsageMeter({ limit, remaining }: { limit: number; remaining: number }) {
  const used = Math.max(0, limit - remaining);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex gap-[3px]" aria-hidden="true">
        {Array.from({ length: limit }, (_, i) => (
          <span key={i} className={cn("h-1 w-3.5 rounded-full", i < used ? "bg-brand" : "bg-zinc-200")} />
        ))}
      </span>
      {remaining > 0 ? `${remaining} of ${limit} free briefs left today` : "No free briefs left today"}
    </span>
  );
}

function EmptyBrief() {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
        <FileText className="size-5" aria-hidden="true" />
      </span>
      <h2 className="text-base font-semibold">Your brief appears here</h2>
      <p className="max-w-sm text-sm text-zinc-600">
        Search intent, a heading outline, the questions to answer and related keywords to cover.
      </p>
    </Card>
  );
}

function BriefSkeleton({ stage }: { stage: string }) {
  return (
    <Card className="overflow-hidden" aria-busy="true">
      <div className="flex flex-col gap-3 border-b border-zinc-100 p-6 sm:px-7">
        <p className="text-sm font-medium text-brand-ink" role="status">{stage}</p>
        <div className="h-6 w-2/3 animate-pulse rounded bg-zinc-100" />
      </div>
      <div className="flex flex-col gap-3 p-6 sm:px-7">
        {[90, 75, 82, 60, 70].map((w, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-zinc-100" style={{ width: `${w}%` }} />
        ))}
      </div>
    </Card>
  );
}

function toMarkdown(b: Brief): string {
  return [
    `# ${b.h1 || b.keyword}`,
    "",
    `- Target keyword: ${b.keyword}`,
    `- Country: ${countryName(b.country)}`,
    `- Content type: ${b.contentType}`,
    `- Search intent: ${b.intent}${b.intentReason ? ` — ${b.intentReason}` : ""}`,
    b.suggestedWordCount ? `- Suggested length: ~${b.suggestedWordCount} words` : "",
    "",
    "## Outline",
    ...b.outline.map((o) => `${o.level === "H3" ? "  " : ""}- ${o.level}: ${o.text}`),
    "",
    "## Questions to answer",
    ...b.faqs.map((f) => `- ${f.question}${f.answerHint ? `\n  - ${f.answerHint}` : ""}`),
    "",
    "## Related keywords",
    b.relatedKeywords.join(", "),
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function BriefView({ b }: { b: Brief }) {
  const [copied, setCopied] = useState(false);
  const md = toMarkdown(b);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `brief-${b.keyword.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = [
    { label: "Search intent", value: b.intent, mono: false },
    { label: "Suggested length", value: b.suggestedWordCount ? `~${b.suggestedWordCount.toLocaleString()} words` : "—", mono: true },
    { label: "Google questions", value: String(b.serp.questions.length), mono: true },
    { label: "Related terms", value: String(b.relatedKeywords.length), mono: true },
  ];

  return (
    <Card className="overflow-hidden">
      <article aria-label="Content brief">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-100 p-6 sm:px-7">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              <Badge>{countryName(b.country)}</Badge>
              <Badge>{b.contentType}</Badge>
              {b.savedToSheet && <Badge tone="success">Saved to Sheets</Badge>}
            </div>
            <h2 className="text-2xl font-semibold leading-tight tracking-[-0.02em]">{b.keyword}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={copy} aria-live="polite">
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="outline" size="sm" onClick={download}>
              <Download aria-hidden="true" />
              Download .md
            </Button>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px border-b border-zinc-100 bg-zinc-100 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-1 bg-white px-6 py-4 sm:px-7">
              <dt className="text-xs text-zinc-500">{s.label}</dt>
              <dd className={cn("text-lg font-semibold", s.mono && "font-mono")}>{s.value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col gap-7 p-6 sm:px-7">
          {b.intentReason && (
            <p className="rounded-lg border border-zinc-100 bg-zinc-50 px-3.5 py-3 text-sm text-zinc-600">{b.intentReason}</p>
          )}

          <section className="flex flex-col gap-3">
            <h3 className="text-[15px] font-semibold">Heading outline</h3>
            <ol className="overflow-hidden rounded-lg border border-zinc-100">
              {b.h1 && (
                <li className="flex items-baseline gap-3.5 bg-zinc-50 px-3.5 py-2.5">
                  <LevelTag level="H1" />
                  <span className="font-medium">{b.h1}</span>
                </li>
              )}
              {b.outline.map((o, i) => (
                <li key={i} className={cn("flex items-baseline gap-3.5 border-t border-zinc-100 px-3.5 py-2.5 first:border-t-0", o.level === "H3" && "pl-10 text-zinc-700")}>
                  <LevelTag level={o.level} />
                  <span>{o.text}</span>
                </li>
              ))}
            </ol>
          </section>

          {b.faqs.length > 0 && (
            <section className="flex flex-col gap-3">
              <h3 className="text-[15px] font-semibold">Questions to answer</h3>
              <ul className="flex flex-col gap-2">
                {b.faqs.map((f, i) => (
                  <li key={i} className="rounded-lg border border-zinc-100 px-3.5 py-3">
                    <p className="font-medium">{f.question}</p>
                    {f.answerHint && <p className="mt-1 text-sm text-zinc-600">{f.answerHint}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {b.relatedKeywords.length > 0 && (
            <section className="flex flex-col gap-3">
              <h3 className="text-[15px] font-semibold">Related keywords to cover</h3>
              <div className="flex flex-wrap gap-2">
                {b.relatedKeywords.map((k) => (
                  <span key={k} className="rounded-full border border-brand-line bg-brand-soft px-3 py-1.5 text-[13px] text-brand-ink">{k}</span>
                ))}
              </div>
            </section>
          )}
        </div>
      </article>
    </Card>
  );
}

function LevelTag({ level }: { level: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-medium",
        level === "H1" ? "bg-brand-soft text-brand-ink" : level === "H2" ? "bg-zinc-100 text-zinc-600" : "text-zinc-500",
      )}
    >
      {level}
    </span>
  );
}

function Signals({ b }: { b: Brief }) {
  const groups = [
    { title: "People also ask", items: b.serp.questions },
    { title: "Autocomplete", items: b.serp.autocomplete },
    { title: "Related searches", items: b.serp.relatedSearches },
  ].filter((g) => g.items.length > 0);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <CardTitle>Google signals</CardTitle>
        <span className="text-xs text-zinc-500">Raw data used</span>
      </div>
      {groups.length === 0 && <p className="text-sm text-zinc-600">Google returned no extra signals for this keyword.</p>}
      {groups.map((g, i) => (
        <div key={g.title} className={cn("flex flex-col gap-2", i > 0 && "border-t border-zinc-100 pt-4")}>
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">{g.title}</span>
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm text-zinc-700">
            {g.items.slice(0, 6).map((it) => <li key={it}>{it}</li>)}
          </ul>
        </div>
      ))}
    </Card>
  );
}

function HowItWorks() {
  const steps = [
    "We pull live Google autocomplete, People Also Ask and related searches.",
    "An AI model reads them and works out intent, headings and FAQs.",
    "You copy the brief or download it as Markdown.",
  ];
  return (
    <Card id="how" className="flex scroll-mt-24 flex-col gap-3.5 p-5">
      <CardTitle>How it works</CardTitle>
      {steps.map((s, i) => (
        <div key={i} className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold">{i + 1}</span>
          <p className="text-sm text-zinc-700">{s}</p>
        </div>
      ))}
      <p className="border-t border-zinc-100 pt-3 text-xs text-zinc-500">Search volume and keyword difficulty aren&apos;t included.</p>
    </Card>
  );
}
