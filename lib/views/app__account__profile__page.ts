import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";

export async function loadAccountProfileView() {
  const session = await requireAuth();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { name: true, email: true, image: true, profileImageUrl: true, emailVerified: true, passwordHash: true },
  });
  return { user: { name: user.name, email: user.email, image: user.image, profileImageUrl: user.profileImageUrl, emailVerified: user.emailVerified, hasPassword: Boolean(user.passwordHash) } };
}
