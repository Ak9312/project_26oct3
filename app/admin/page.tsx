import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminIndex() {
  redirect((await isAdmin()) ? "/admin/visibility" : "/admin/login");
}
