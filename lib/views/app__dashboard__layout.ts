import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAppShellData } from "@/lib/appShell";

export async function loadDashboardShell() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return getAppShellData(session.user.id);
}
