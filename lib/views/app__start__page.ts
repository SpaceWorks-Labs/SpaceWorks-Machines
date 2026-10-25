import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isSpaceApplicationsEnabled } from "@/lib/instanceSettings";

/** The application form: who is applying, and whether they can apply right now. */
export async function loadStartView() {
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent("/start")}`);
  const [user, applicationsOpen, openApplications] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true, emailVerified: true } }),
    isSpaceApplicationsEnabled(),
    prisma.spaceMember.findMany({
      where: { userId: session.user.id, role: "MACHINE_MANAGER", space: { status: { in: ["PENDING_REVIEW", "CHANGES_REQUESTED"] } } },
      select: { space: { select: { name: true, slug: true, status: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);
  if (!user) redirect("/login");
  return {
    applicantName: user.name,
    applicantEmail: user.email ?? "",
    emailVerified: Boolean(user.emailVerified),
    applicationsOpen,
    openApplications: openApplications.map((row) => row.space),
  };
}
