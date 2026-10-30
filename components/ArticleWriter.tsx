"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bell, BellRing, Check, CircleAlert, Copy, Download, ExternalLink, History, LoaderCircle, PenLine, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardTitle } from "@/components/ui/primitives";
import { api, COUNTRIES, countryName, store, type Status } from "@/lib/client";
import { checkOriginality } from "@/lib/originality";
import { cn } from "@/lib/utils";
import type { Research, Source } from "@/lib/sources";

const TYPES = ["Blog post", "Comparison", "How-to guide", "Landing page"];
const LENGTHS = [1000, 1500, 2500];
type Phase = "idle" | "research" | "writing" | "done" | "error";
type ResearchResponse = Research & { ticket: string; remaining?: number };

// Finished articles are kept in this browser so a refresh or closed tab doesn't lose them.
const RECENT_KEY = "briefradar.articles";
const NOTIFY_KEY = "briefradar.notify";
const MAX_RECENT = 6;
interface SavedArticle {
  id: string;
  keyword: string;
  country: string;
  contentType: string;
  createdAt: string;
  text: string;
  model: string;
  truncated: boolean;
  fixed: number;
  flagged: number;
  checked: number;
  sources: Source[]; // stored without page text, to save space
}

function loadRecent(): SavedArticle[] {
  try {
    const v = JSON.parse(store(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function saveRecent(list: SavedArticle[]) {
  // localStorage can be full; drop the oldest until it fits.
  for (let n = list.length; n > 0; n--) {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, n)));
      return list.slice(0, n);
    } catch {
      /* try with fewer */
    }
  }
  return [];
}

export default function ArticleWriter({ status }: { status: Status | null }) {
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("in");
  const [contentType, setContentType] = useState("Blog post");
  const [length, setLength] = useState(1500);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [research, setResearch] = useState<ResearchResponse | null>(null);
  const [text, setText] = useState("");
  const [model, setModel] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [usage, setUsage] = useState<{ limit: number; remaining: number } | null>(null);
  const [fixing, setFixing] = useState(false);
  const [fixed, setFixed] = useState(0);
  const [recent, setRecent] = useState<SavedArticle[]>([]);
  const [restored, setRestored] = useState<{ flagged: number; checked: number } | null>(null);
  const [notify, setNotify] = useState(false);
  const [notifyBlocked, setNotifyBlocked] = useState(false);
  const baseTitle = useRef("");
  const abortRef = useRef<AbortController | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status?.article) setUsage({ limit: status.article.dailyLimit, remaining: status.article.remaining });
  }, [status]);

  useEffect(() => {
    if (phase !== "research" && phase !== "writing") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    setRecent(loadRecent());
    const canNotify = "Notification" in window;
    setNotify(canNotify && store(NOTIFY_KEY) === "1" && Notification.permission === "granted");
    setNotifyBlocked(canNotify && Notification.permission === "denied");
  }, []);

  // Show progress in the browser tab title, so it's visible from other tabs.
  useEffect(() => {
    if (!baseTitle.current) baseTitle.current = document.title;
    const words = text.split(/\s+/).filter(Boolean).length;
    const titles: Record<Phase, string> = {
      idle: baseTitle.current,
      research: "Researching… · BriefRadar",
      writing: words ? `Writing… ${words.toLocaleString()} words · BriefRadar` : "Writing… · BriefRadar",
      done: "✓ Article ready · BriefRadar",
      error: "⚠ Article failed · BriefRadar",
    };
    document.title = titles[phase];
  }, [phase, text]);

  // Once you've come back and seen the result, put the normal title back.
  useEffect(() => {
    if (phase !== "done" && phase !== "error") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const restore = () => {
      if (document.visibilityState === "visible") timer = setTimeout(() => (document.title = baseTitle.current), 4000);
    };
    restore();
    document.addEventListener("visibilitychange", restore);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", restore);
    };
  }, [phase]);

  // Ask before closing or refreshing while an article is being written.
  useEffect(() => {
    if (phase !== "research" && phase !== "writing" && !fixing) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase, fixing]);

  async function toggleNotify() {
    if (!("Notification" in window)) return;
    if (notify) {
      setNotify(false);
      store(NOTIFY_KEY, "0");
      return;
    }
    const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    setNotifyBlocked(perm === "denied");
    if (perm === "granted") {
      setNotify(true);
      store(NOTIFY_KEY, "1");
    }
  }

  function announce(title: string, body: string) {
    if (!notify || !("Notification" in window) || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;
    try {
      const n = new Notification(title, { body, icon: "/apple-icon.png", tag: "briefradar-article" });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      /* some browsers only allow notifications from a service worker */
    }
  }

  function remember(finalText: string, r: ResearchResponse, usedModel: string, wasTruncated: boolean, fixedCount: number) {
    const final = checkOriginality(finalText, r.sources.filter((s) => s.ok));
    const entry: SavedArticle = {
      id: Date.now().toString(36),
      keyword,
      country,
      contentType,
      createdAt: new Date().toISOString(),
      text: finalText,
      model: usedModel,
      truncated: wasTruncated,
      fixed: fixedCount,
      flagged: final.flagged.length,
      checked: final.checked,
      sources: r.sources.map((s) => ({ ...s, text: "" })),
    };
    setRecent(saveRecent([entry, ...loadRecent()].slice(0, MAX_RECENT)));
  }

  function openSaved(a: SavedArticle) {
    abortRef.current?.abort();
    setKeyword(a.keyword);
    setCountry(a.country);
    setContentType(a.contentType);
    setResearch({ keyword: a.keyword, country: a.country, questions: [], relatedSearches: [], sources: a.sources, ticket: "" });
    setText(a.text);
    setModel(a.model);
    setTruncated(a.truncated);
    setFixed(a.fixed);
    setFixing(false);
    setRestored({ flagged: a.flagged, checked: a.checked });
    setError("");
    setNote("");
    setStartedAt(0);
    setPhase("done");
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const busy = phase === "research" || phase === "writing";
  const unavailable = status?.article && !status.article.available;
  const outOf = !status?.admin && usage?.remaining === 0;

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return setError("Enter a keyword first.");
    setError("");
    setNote("");
    setText("");
    setTruncated(false);
    setFixed(0);
    setFixing(false);
    setRestored(null);
    setResearch(null);
    setModel("");
    setStartedAt(Date.now());
    setNow(Date.now());
    setPhase("research");
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));

    let r: ResearchResponse;
    try {
      r = await api<ResearchResponse>("/api/article/research", {
        method: "POST",
        body: JSON.stringify({ keyword, country }),
      });
      setResearch(r);
      if (typeof r.remaining === "number" && usage) setUsage({ ...usage, remaining: r.remaining });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Research failed.";
      setError(msg);
      if (/free articles/.test(msg) && usage) setUsage({ ...usage, remaining: 0 });
      setPhase("error");
      return;
    }

    setPhase("writing");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let got = "";
    let usedModel = "";
    let wasTruncated = false;
    try {
      const res = await fetch("/api/article/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          keyword,
          country,
          contentType,
          length,
          ticket: r.ticket,
          questions: r.questions,
          relatedSearches: r.relatedSearches,
          sources: r.sources.filter((s) => s.ok),
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Writing failed (${res.status}).`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finished = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          let ev: any;
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.t === "d") {
            got += ev.v;
            setText(got);
          } else if (ev.t === "model") {
            usedModel = ev.provider === "OpenRouter" ? niceModel(ev.name) : `${niceModel(ev.name)} (backup)`;
            setModel(usedModel);
          }
          else if (ev.t === "status" && ev.msg !== "Writing") setNote(ev.msg);
          else if (ev.t === "done") {
            finished = true;
            if (ev.truncated) {
              wasTruncated = true;
              setTruncated(true);
            }
          } else if (ev.t === "error") throw new Error(ev.msg);
        }
      }
      if (!got) throw new Error("The writer returned no text. Try again in a minute.");
      if (!finished) {
        wasTruncated = true;
        setTruncated(true);
      }
      setPhase("done");

      // Automatically rewrite any sentence that is too close to a source, then re-check.
      let finalText = got;
      let fixedCount = 0;
      const first = checkOriginality(got, r.sources.filter((s) => s.ok));
      if (first.flagged.length > 0) {
        setFixing(true);
        try {
          const sentences = first.flagged.slice(0, 15).map((f) => f.sentence);
          const { rewrites } = await api<{ rewrites: string[] }>("/api/article/rewrite", {
            method: "POST",
            body: JSON.stringify({ keyword, ticket: r.ticket, sentences }),
          });
          let fixedText = got;
          let n = 0;
          sentences.forEach((s, i) => {
            if (rewrites[i] && rewrites[i] !== s && fixedText.includes(s)) {
              fixedText = fixedText.replace(s, rewrites[i]);
              n++;
            }
          });
          setText(fixedText);
          setFixed(n);
          finalText = fixedText;
          fixedCount = n;
        } catch {
          /* keep the flags visible so they can be fixed by hand */
        } finally {
          setFixing(false);
        }
      }
      remember(finalText, r, usedModel, wasTruncated, fixedCount);
      announce("Your article is ready", `"${keyword}" · ${finalText.split(/\s+/).filter(Boolean).length.toLocaleString()} words`);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Writing failed.");
      announce("Article stopped", err instanceof Error ? err.message : "Writing failed.");
      setPhase(got ? "done" : "error");
      if (got) setTruncated(true);
    }
  }

  const okSources = research?.sources.filter((s) => s.ok) || [];
  const originality = useMemo(
    () => (phase === "done" && text && !fixing && !restored ? checkOriginality(text, okSources) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, text, research],
  );
  const elapsed = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
  const words = text.split(/\s+/).filter(Boolean).length;

  return (
    <div className="flex flex-col gap-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
        <form onSubmit={start} noValidate className="flex flex-wrap items-stretch gap-2 rounded-2xl border border-zinc-200 bg-white p-2.5 shadow-[0_1px_2px_rgba(9,9,11,0.04),0_8px_24px_rgba(9,9,11,0.04)]">
          <div className="flex min-h-13 flex-[3_1_280px] items-center gap-2.5 rounded-xl border border-zinc-100 bg-zinc-50 px-3.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
            <Search className="size-[18px] shrink-0 text-zinc-500" aria-hidden="true" />
            <label htmlFor="akw" className="sr-only">Target keyword</label>
            <input
              id="akw"
              value={keyword}
              onChange={(e) => { setKeyword(e.target.value); setError(""); }}
              placeholder="Please enter keywords"
              maxLength={120}
              autoComplete="off"
              className="h-12 min-w-0 flex-1 bg-transparent text-base text-zinc-950 placeholder:text-zinc-400 focus:outline-none"
            />
          </div>
          <Field id="acountry" label="Google country" value={country} onChange={setCountry}>
            {COUNTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Field>
          <Field id="atype" label="Content type" value={contentType} onChange={setContentType}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </Field>
          <Field id="alen" label="Length" value={String(length)} onChange={(v) => setLength(Number(v))}>
            {LENGTHS.map((l) => <option key={l} value={l}>~{l.toLocaleString()} words</option>)}
          </Field>
          <Button type="submit" size="lg" disabled={busy || outOf || !!unavailable} className="min-h-13 flex-[0_1_auto] rounded-xl">
            <PenLine aria-hidden="true" />
            {busy ? "Working…" : "Write article"}
          </Button>
        </form>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-zinc-600">
          <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-emerald-700" aria-hidden="true" />Researches the top 20 Google results</span>
          <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-emerald-700" aria-hidden="true" />Original writing, checked for copying</span>
          {usage && !status?.admin && (
            <span>{usage.remaining > 0 ? `${usage.remaining} of ${usage.limit} free articles left today` : "No free articles left today"}</span>
          )}
          <button
            type="button"
            onClick={toggleNotify}
            aria-pressed={notify}
            title={notifyBlocked ? "Notifications are blocked for this site in your browser settings" : undefined}
            className={cn("inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 hover:bg-zinc-100", notify ? "font-medium text-brand-ink" : "text-zinc-600")}
          >
            {notify ? <BellRing className="size-3.5" aria-hidden="true" /> : <Bell className="size-3.5" aria-hidden="true" />}
            {notify ? "Notifying you when ready" : notifyBlocked ? "Notifications blocked" : "Notify me when ready"}
          </button>
        </div>
        {unavailable && <Alert tone="warning">The article writer isn&apos;t set up yet.</Alert>}
        {error && <Alert>{error}</Alert>}
      </div>

      <div ref={topRef} className="flex scroll-mt-24 flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-4">
          {phase === "idle" || (phase === "error" && !research) ? (
            <EmptyState />
          ) : (
            <>
              <Progress phase={phase} research={research} elapsed={elapsed} model={model} note={note} words={words} />
              {text && (
                <ArticleView
                  keyword={keyword}
                  text={text}
                  sources={okSources}
                  writing={phase === "writing"}
                  truncated={truncated}
                  originality={originality}
                  fixing={fixing}
                  fixed={fixed}
                  restored={restored}
                />
              )}
            </>
          )}
        </div>
        <aside aria-label="Sources" className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          {research ? <SourcesPanel sources={research.sources} /> : <HowArticlesWork />}
          {recent.length > 0 && <RecentArticles items={recent} onOpen={openSaved} busy={busy} />}
        </aside>
      </div>
    </div>
  );
}

const niceModel = (id: string) =>
  id.includes("nemotron-3-ultra") ? "Nemotron 3 Ultra" : id.replace(/^.*\//, "").replace(/:free$/, "");

function Field(props: { id: string; label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-[1_1_140px] flex-col justify-center gap-0.5 rounded-xl border border-zinc-200 px-3 py-1.5 focus-within:border-brand">
      <label htmlFor={props.id} className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{props.label}</label>
      <select id={props.id} value={props.value} onChange={(e) => props.onChange(e.target.value)} className="cursor-pointer bg-transparent text-[15px] text-zinc-950 focus:outline-none">
        {props.children}
      </select>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600"><PenLine className="size-5" aria-hidden="true" /></span>
      <h2 className="text-base font-semibold">Your article appears here</h2>
      <p className="max-w-sm text-sm text-zinc-600">We read the pages ranking on Google for your keyword, then write a new, original article that covers the topic better.</p>
    </Card>
  );
}

function Progress({ phase, research, elapsed, model, note, words }: { phase: Phase; research: Research | null; elapsed: number; model: string; note: string; words: number }) {
  const read = research?.sources.filter((s) => s.ok).length ?? 0;
  const found = research?.sources.length ?? 0;
  const steps = [
    { label: "Find the top 20 Google results", state: research ? "done" : phase === "research" ? "active" : "idle", detail: research ? `${found} found` : "" },
    { label: "Read the ranking pages", state: research ? "done" : phase === "research" ? "active" : "idle", detail: research ? `${read} read` : "" },
    {
      label: "Write an original article",
      state: phase === "done" ? "done" : phase === "writing" ? "active" : phase === "error" ? "error" : "idle",
      detail: phase === "writing" ? (words ? `${words.toLocaleString()} words so far` : model ? `${model} is reading the sources…` : "") : phase === "done" ? `${words.toLocaleString()} words` : "",
    },
  ];
  return (
    <Card className="flex flex-col gap-3 p-5" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <CardTitle>{phase === "done" ? "Article ready" : phase === "error" ? "Something went wrong" : "Working on your article"}</CardTitle>
        {elapsed > 0 && <span className="font-mono text-xs text-zinc-500">{elapsed}s</span>}
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3 text-sm">
            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full", s.state === "done" ? "bg-emerald-50 text-emerald-700" : s.state === "active" ? "text-brand" : s.state === "error" ? "bg-red-50 text-red-700" : "bg-zinc-100 text-zinc-400")}>
              {s.state === "done" ? <Check className="size-3.5" aria-hidden="true" /> : s.state === "active" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : s.state === "error" ? <CircleAlert className="size-3.5" aria-hidden="true" /> : <span className="size-1.5 rounded-full bg-zinc-300" />}
            </span>
            <span className={cn(s.state === "idle" ? "text-zinc-500" : "text-zinc-900")}>{s.label}</span>
            {s.detail && <span className="text-zinc-500">· {s.detail}</span>}
          </li>
        ))}
      </ol>
      {(phase === "research" || phase === "writing") && (
        <p className="text-[13px] text-zinc-500">
          Usually 1–3 minutes. You can switch to other tabs or apps; just don&apos;t close or refresh this one. The tab title shows when it&apos;s ready.
        </p>
      )}
      {note && <p className="text-[13px] text-amber-800">{note}</p>}
    </Card>
  );
}

function linkCitations(md: string) {
  return md.replace(/\[(\d{1,2})\](?!\()/g, "[[$1]](#src-$1)");
}

function splitMeta(md: string) {
  const m = md.match(/^\s*meta description:\s*(.+)$/im);
  return { meta: m?.[1]?.trim() || "", body: m ? md.replace(m[0], "").replace(/\n{3,}/g, "\n\n") : md };
}

function ArticleView({ keyword, text, sources, writing, truncated, originality, fixing, fixed, restored }: {
  keyword: string; text: string; sources: Source[]; writing: boolean; truncated: boolean;
  originality: ReturnType<typeof checkOriginality> | null; fixing: boolean; fixed: number;
  restored: { flagged: number; checked: number } | null;
}) {
  const [copied, setCopied] = useState(false);
  const { meta, body } = splitMeta(text);
  const sourcesMd = sources.length ? `\n\n## Sources\n\n${sources.map((s) => `${s.position}. [${s.title || s.domain}](${s.url})`).join("\n")}\n` : "";
  const full = text.trim() + sourcesMd;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* blocked */ }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([full], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `article-${keyword.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-6 py-4 sm:px-8">
        <div className="flex flex-wrap items-center gap-2">
          {writing ? <Badge tone="brand"><LoaderCircle className="size-3 animate-spin" aria-hidden="true" />Writing</Badge> : <Badge tone="success">Draft ready</Badge>}
          {fixing && <Badge tone="brand"><LoaderCircle className="size-3 animate-spin" aria-hidden="true" />Rewriting sentences too close to a source</Badge>}
          {fixed > 0 && !fixing && <Badge>Rewrote {fixed} sentence{fixed === 1 ? "" : "s"} for originality</Badge>}
          {restored && (restored.flagged === 0
            ? <Badge tone="success"><ShieldCheck className="size-3" aria-hidden="true" />Original: no copied sentences</Badge>
            : <Badge tone="warning">{restored.flagged} sentence{restored.flagged === 1 ? "" : "s"} too close to a source</Badge>)}
          {originality && (originality.flagged.length === 0
            ? <Badge tone="success"><ShieldCheck className="size-3" aria-hidden="true" />Original: no copied sentences</Badge>
            : <Badge tone="warning">{originality.flagged.length} sentence{originality.flagged.length === 1 ? "" : "s"} too close to a source</Badge>)}
        </div>
        {!writing && !fixing && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copy}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "Copied" : "Copy"}</Button>
            <Button variant="outline" size="sm" onClick={download}><Download aria-hidden="true" />Download .md</Button>
          </div>
        )}
      </div>

      {meta && (
        <div className="border-b border-zinc-100 bg-zinc-50 px-6 py-3 text-sm sm:px-8">
          <span className="font-medium text-zinc-900">Meta description </span>
          <span className="text-zinc-600">{meta}</span>
          <span className="ml-2 font-mono text-xs text-zinc-500">{meta.length}/155</span>
        </div>
      )}

      <article className="px-6 py-7 sm:px-8">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{linkCitations(body)}</ReactMarkdown>
        {writing && <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-brand align-middle" aria-hidden="true" />}
      </article>

      {truncated && !writing && (
        <div className="border-t border-zinc-100 px-6 py-3 sm:px-8"><Alert tone="warning">The writer stopped before finishing. You can use this draft or try again with a shorter length.</Alert></div>
      )}

      {originality && originality.flagged.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-zinc-100 px-6 py-5 sm:px-8">
          <h3 className="text-[15px] font-semibold">Rewrite these before publishing</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {originality.flagged.map((f, i) => (
              <li key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                &ldquo;{f.sentence}&rdquo; <span className="whitespace-nowrap text-amber-800">· {Math.round(f.overlap * 100)}% match with source [{f.source}]</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="border-t border-zinc-100 px-6 py-4 text-[13px] text-zinc-500 sm:px-8">
        AI draft based on the pages listed under Sources. Check facts, prices and claims against the cited sources before you publish.
      </p>
    </Card>
  );
}

const MD: Parameters<typeof ReactMarkdown>[0]["components"] = {
  h1: (p) => <h1 className="mb-5 text-[28px] font-semibold leading-tight tracking-[-0.02em]" {...p} />,
  h2: (p) => <h2 className="mb-3 mt-9 text-[21px] font-semibold tracking-[-0.015em]" {...p} />,
  h3: (p) => <h3 className="mb-2 mt-6 text-[17px] font-semibold" {...p} />,
  p: (p) => <p className="mb-4 leading-[1.75] text-zinc-800" {...p} />,
  ul: (p) => <ul className="mb-4 flex list-disc flex-col gap-1.5 pl-6 text-zinc-800" {...p} />,
  ol: (p) => <ol className="mb-4 flex list-decimal flex-col gap-1.5 pl-6 text-zinc-800" {...p} />,
  li: (p) => <li className="leading-[1.7]" {...p} />,
  strong: (p) => <strong className="font-semibold text-zinc-950" {...p} />,
  blockquote: (p) => <blockquote className="mb-4 border-l-2 border-zinc-200 pl-4 text-zinc-600" {...p} />,
  table: (p) => <div className="mb-5 overflow-x-auto"><table className="w-full min-w-[480px] border-collapse text-sm" {...p} /></div>,
  th: (p) => <th className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-left font-medium" {...p} />,
  td: (p) => <td className="border-b border-zinc-100 px-3 py-2 align-top" {...p} />,
  a: ({ href, children, ...p }) =>
    href?.startsWith("#src-") ? (
      <a href={href} className="mx-0.5 rounded bg-brand-soft px-1 font-mono text-[11px] font-medium text-brand-ink no-underline hover:bg-brand-line" {...p}>{String(children).replace(/[[\]]/g, "")}</a>
    ) : (
      <a href={href} target="_blank" rel="noreferrer noopener" className="text-brand underline underline-offset-2" {...p}>{children}</a>
    ),
};

function RecentArticles({ items, onOpen, busy }: { items: SavedArticle[]; onOpen: (a: SavedArticle) => void; busy: boolean }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <CardTitle className="inline-flex items-center gap-2"><History className="size-4 text-zinc-500" aria-hidden="true" />Your recent articles</CardTitle>
        <span className="text-xs text-zinc-500">Saved in this browser</span>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onOpen(a)}
              className="flex w-full cursor-pointer flex-col items-start rounded-lg px-2.5 py-2 text-left hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="line-clamp-1 text-sm font-medium">{a.keyword}</span>
              <span className="text-xs text-zinc-500">
                {new Date(a.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · {a.text.split(/\s+/).filter(Boolean).length.toLocaleString()} words
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SourcesPanel({ sources }: { sources: Source[] }) {
  const ok = sources.filter((s) => s.ok);
  const avg = ok.length ? Math.round(ok.reduce((a, s) => a + s.wordCount, 0) / ok.length) : 0;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <CardTitle>Sources</CardTitle>
        <span className="text-xs text-zinc-500">{ok.length} of {sources.length} read</span>
      </div>
      {avg > 0 && (
        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-[13px] text-zinc-600">
          Top pages average <span className="font-mono font-semibold text-zinc-900">{avg.toLocaleString()}</span> words.
        </p>
      )}
      <ol className="flex flex-col gap-2.5">
        {sources.map((s) => (
          <li key={s.position} id={`src-${s.position}`} className="flex scroll-mt-24 gap-2.5 text-sm target:rounded-md target:bg-brand-soft">
            <span className="w-5 shrink-0 pt-0.5 text-right font-mono text-xs text-zinc-500">{s.position}</span>
            <div className="flex min-w-0 flex-col">
              <a href={s.url} target="_blank" rel="noreferrer noopener" className={cn("inline-flex items-center gap-1 truncate font-medium hover:text-brand", !s.ok && "text-zinc-500")}>
                <span className="truncate">{s.domain}</span>
                <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
              </a>
              <span className="text-xs text-zinc-500">{s.ok ? `${s.wordCount.toLocaleString()} words · ${s.headings.length} headings` : `Skipped: ${s.reason}`}</span>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function HowArticlesWork() {
  const steps = [
    "We find the top 20 Google results for your keyword.",
    "We read each ranking page and collect its main points and headings.",
    "An AI model writes a new, original article that covers the topic better, citing its sources.",
    "We check every sentence against the sources and flag anything too close.",
  ];
  return (
    <Card id="how" className="flex scroll-mt-24 flex-col gap-3.5 p-5">
      <CardTitle>How articles work</CardTitle>
      {steps.map((s, i) => (
        <div key={i} className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold">{i + 1}</span>
          <p className="text-sm text-zinc-700">{s}</p>
        </div>
      ))}
      <p className="border-t border-zinc-100 pt-3 text-xs text-zinc-500">Some sites block automated reading and are skipped. Always check facts before publishing.</p>
    </Card>
  );
}
