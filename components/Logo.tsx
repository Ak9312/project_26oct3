import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={cn("size-7", className)} aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="#09090B" />
      <path d="M8 18a7 7 0 0 1 12 0" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M11 18a3.5 3.5 0 0 1 6 0" stroke="#A5B4FC" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="14" cy="18" r="1.4" fill="#fff" />
    </svg>
  );
}

export function Logo({ href = "/", badge }: { href?: string; badge?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 text-zinc-950">
      <LogoMark />
      <span className="text-base font-semibold tracking-tight">BriefRadar</span>
      {badge && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600">{badge}</span>}
    </Link>
  );
}
