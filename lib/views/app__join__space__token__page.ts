import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function loadJoinSpaceView({ params }: { params: Promise<{ token: string; }>; }) {

  const { token } = await params;
  const session = await auth();
  const joinUrl = `/join/space/${encodeURIComponent(token)}`;
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(joinUrl)}`);
  const invite = await prisma.spaceInvite.findUnique({
    where: { token },
    select: { usedAt: true, expiresAt: true, role: true, space: { select: { name: true, logoUrl: true } } },
  });

  return { token, session, invite };
}
