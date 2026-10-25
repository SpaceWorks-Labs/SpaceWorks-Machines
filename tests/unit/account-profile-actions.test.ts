import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  rateLimit: vi.fn(),
  userUpdate: vi.fn(),
  profileAudit: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/reauth", () => ({ hasRecentAuthentication: vi.fn() }));
vi.mock("@/lib/actionRateLimit", () => ({
  isActionRateLimited: mocks.rateLimit,
}));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.profileAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { update: mocks.userUpdate, findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { updateAccountProfile } from "@/app/actions/account";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue({ user: { id: "user_1" } });
  mocks.rateLimit.mockResolvedValue(false);
});

describe("account profile actions", () => {
  it("stores a validated uploaded custom profile image URL", async () => {
    await expect(
      updateAccountProfile({
        name: "Person",
        profileImageUrl: "/api/uploads/users/user_1/profile-images/person.webp",
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        name: "Person",
        profileImageUrl: "/api/uploads/users/user_1/profile-images/person.webp",
      },
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: {
        name: "Person",
        profileImageUrl: "/api/uploads/users/user_1/profile-images/person.webp",
      },
    });
  });

  it("rejects external image URLs", async () => {
    await expect(
      updateAccountProfile({
        name: "Person",
        profileImageUrl: "https://images.example.com/person.png",
      }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: { profileImageUrl: ["Choose an uploaded profile image"] },
    });
  });
});
