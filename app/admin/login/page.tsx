import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import LoginForm from "@/components/admin/LoginForm";
import { adminEnabled } from "@/lib/auth";
import { isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin sign in · BriefRadar", robots: { index: false } };

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin/visibility");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
      <Logo />
      <LoginForm enabled={adminEnabled()} />
      <Link href="/" className="inline-flex items-center gap-1.5 p-2.5 text-sm text-zinc-600 hover:text-zinc-950">
        <ChevronLeft className="size-3.5" aria-hidden="true" />
        Back to the brief generator
      </Link>
    </div>
  );
}
