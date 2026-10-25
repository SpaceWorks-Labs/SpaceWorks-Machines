import { describe, expect, it } from "vitest";
import {
  spaceRoleSchema,
  createSpaceInviteSchema,
  spaceSlugSchema,
  updateSpaceSchema,
  updateSpaceRoleSchema,
} from "@/lib/validators";

describe("space web address", () => {
  it("accepts lowercase words joined by single hyphens", () => {
    expect(spaceSlugSchema.safeParse("kochi-runners").success).toBe(true);
    expect(spaceSlugSchema.parse("  rotary-club-2  ")).toBe("rotary-club-2");
  });

  it("rejects capitals, double or edge hyphens, and very short addresses", () => {
    for (const slug of ["Kochi", "kochi--runners", "-kochi", "kochi-", "k", "kochi runners", "kochi_runners"]) {
      expect(spaceSlugSchema.safeParse(slug).success, slug).toBe(false);
    }
  });

  it("refuses reserved addresses that would shadow app routes", () => {
    for (const slug of ["dashboard", "super-admin", "api", "verify", "start", "login"]) {
      expect(spaceSlugSchema.safeParse(slug).success, slug).toBe(false);
    }
  });
});

describe("team roles", () => {
  it("accepts only the known roles; who may hand out which is checked by assignableRoles", () => {
    expect(spaceRoleSchema.safeParse("ADMIN").success).toBe(false);
    expect(spaceRoleSchema.safeParse("MACHINE_MANAGER").success).toBe(true);
    expect(updateSpaceRoleSchema.safeParse({ spaceSlug: "acme", targetUserId: "u", role: "TREASURER" }).success).toBe(false);
    expect(updateSpaceRoleSchema.safeParse({ spaceSlug: "acme", targetUserId: "u", role: "OPERATOR" }).success).toBe(true);
  });

  it("defaults invites to a maker and binds an optional email", () => {
    expect(createSpaceInviteSchema.parse({ spaceSlug: "acme" })).toMatchObject({ role: "MEMBER", email: null });
    expect(createSpaceInviteSchema.parse({ spaceSlug: "acme", role: "OPERATOR", email: " Op@Example.test " }).email).toBe("op@example.test");
    expect(createSpaceInviteSchema.safeParse({ spaceSlug: "acme", email: "not-an-email" }).success).toBe(false);
  });
});

describe("space settings", () => {
  const base = { spaceSlug: "demo", name: "Demo" };

  it("allows uploaded managed logos only", () => {
    expect(updateSpaceSchema.safeParse({ ...base, logoUrl: "/api/uploads/spaces/space_1/space-logos/image.webp" }).success).toBe(true);
    expect(updateSpaceSchema.safeParse({ ...base, logoUrl: "" }).success).toBe(true);
    expect(updateSpaceSchema.safeParse({ ...base, logoUrl: "https://images.example.test/logo.png" }).success).toBe(false);
    expect(updateSpaceSchema.safeParse({ ...base, logoUrl: "data:text/html,unsafe" }).success).toBe(false);
  });

  it("requires a name", () => {
    expect(updateSpaceSchema.safeParse({ ...base, name: "   ", logoUrl: "" }).success).toBe(false);
  });
});
