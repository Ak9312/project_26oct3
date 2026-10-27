import { redirect } from "next/navigation";
import Sidebar from "@/components/admin/Sidebar";
import { isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect("/admin/login");

  return (
    <div className="flex min-h-screen flex-wrap items-stretch md:flex-nowrap">
      <Sidebar />
      <main className="min-w-0 flex-[999_1_640px] px-4 pb-14 pt-8 sm:px-8">{children}</main>
    </div>
  );
}
