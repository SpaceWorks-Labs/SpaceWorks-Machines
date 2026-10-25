import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { getAppShellData } from "@/lib/appShell";

export async function loadAccountShell() {
  const session = await requireAuth();
  const [{ user, spaces }, account] = await Promise.all([
    getAppShellData(session.user.id),
    // Header facts only: booleans and a date, never secrets.
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { emailVerified: true, mfaEnabledAt: true, createdAt: true },
    }),
  ]);
  return { user, spaces, account };
}
