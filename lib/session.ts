// Server-component helper: is the current visitor a signed-in admin?
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminToken } from "./auth";

export async function isAdmin(): Promise<boolean> {
  return verifyAdminToken((await cookies()).get(ADMIN_COOKIE)?.value);
}
