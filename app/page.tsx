import Link from "next/link";
import { cookies } from "next/headers";
import { Logo } from "@/components/Logo";
import BriefGenerator from "@/components/BriefGenerator";
import { buttonVariants } from "@/components/ui/button";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PublicPage() {
  const isAdmin = verifyAdminToken((await cookies()).get(ADMIN_COOKIE)?.value);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Main" className="flex items-center gap-1">
            <a href="#how" className="rounded-lg px-3 py-2.5 text-sm text-zinc-600 hover:text-zinc-950">
              How it works
            </a>
            <Link href={isAdmin ? "/admin" : "/admin/login"} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {isAdmin ? "Open admin" : "Admin sign in"}
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-12 sm:px-6 sm:pt-14">
        <BriefGenerator mode="public" />
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 py-5 text-[13px] text-zinc-500 sm:px-6">
          <span>BriefRadar</span>
          <span>Briefs are a starting point. Check facts before you publish.</span>
        </div>
      </footer>
    </div>
  );
}
