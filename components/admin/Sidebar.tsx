"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, Eye, FileText, SlidersHorizontal } from "lucide-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin/briefs", label: "Briefs", icon: FileText },
  { href: "/admin/visibility", label: "AI visibility", icon: Eye },
  { href: "/admin/settings", label: "Settings and links", icon: SlidersHorizontal },
];

export default function Sidebar() {
  const path = usePathname();

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/admin/login";
  }

  return (
    <aside
      aria-label="Admin navigation"
      className="flex flex-[1_1_220px] flex-col gap-6 border-b border-zinc-200 bg-white px-3.5 py-5 md:sticky md:top-0 md:h-screen md:max-w-64 md:border-b-0 md:border-r"
    >
      <div className="px-2">
        <Logo href="/admin/visibility" badge="Admin" />
      </div>
      <nav className="flex flex-row flex-wrap gap-0.5 md:flex-col">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = path === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm",
                active ? "bg-zinc-100 font-medium text-zinc-950" : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
        <Link href="/" className="flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950">
          <ExternalLink className="size-4" aria-hidden="true" />
          View public site
        </Link>
      </nav>
      <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-2 pt-3.5 md:mt-auto">
        <span className="text-[13px] text-zinc-600">Admin</span>
        <button type="button" onClick={signOut} className="cursor-pointer whitespace-nowrap rounded-md p-2 text-[13px] font-medium text-zinc-950 hover:bg-zinc-100">
          Sign out
        </button>
      </div>
    </aside>
  );
}
