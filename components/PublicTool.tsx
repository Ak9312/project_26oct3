"use client";
import { useEffect, useState } from "react";
import { FileText, PenLine } from "lucide-react";
import BriefGenerator from "@/components/BriefGenerator";
import ArticleWriter from "@/components/ArticleWriter";
import { api, store, type Status } from "@/lib/client";
import { cn } from "@/lib/utils";

type Tab = "brief" | "article";
const TAB_KEY = "briefradar.tab";

export default function PublicTool() {
  const [tab, setTab] = useState<Tab>("brief");
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    const saved = store(TAB_KEY);
    if (saved === "article" || saved === "brief") setTab(saved);
    api<Status>("/api/status").then(setStatus).catch(() => {});
  }, []);

  const choose = (t: Tab) => {
    setTab(t);
    store(TAB_KEY, t);
  };

  const briefs = status?.dailyLimit ?? 5;
  const articles = status?.article?.dailyLimit ?? 2;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col items-center gap-4 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-brand-soft px-3 py-1 text-[13px] font-medium text-brand-ink">
          <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
          Free to use · {briefs} briefs and {articles} articles a day
        </span>
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.035em] sm:text-5xl">
          {tab === "brief" ? "Turn a keyword into a content brief" : "Turn a keyword into an original article"}
        </h1>
        <p className="max-w-xl text-lg text-zinc-600">
          {tab === "brief"
            ? "Search intent, a heading outline and the questions people actually ask Google, ready in seconds."
            : "Researched from the pages ranking on Google right now, written in new words, with every source cited."}
        </p>
      </section>

      <div role="tablist" aria-label="What to create" className="mx-auto inline-flex rounded-xl border border-zinc-200 bg-white p-1">
        {([
          ["brief", "Content brief", FileText],
          ["article", "Full article", PenLine],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => choose(id)}
            className={cn(
              "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors",
              tab === id ? "bg-zinc-950 text-white" : "text-zinc-600 hover:text-zinc-950",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "brief" ? <BriefGenerator mode="public" embedded /> : <ArticleWriter status={status} />}
      </div>
    </div>
  );
}
