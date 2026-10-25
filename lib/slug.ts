const slugRegex = /[^a-z0-9]+/g;

export function slugifyTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(slugRegex, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "space";
}

export function withSlugSuffix(base: string, suffix: number): string {
  return suffix === 0 ? base : `${base}-${suffix}`;
}

/** Top-level routes a space slug would shadow (`/<spaceSlug>`). */
export const RESERVED_SPACE_SLUGS: ReadonlySet<string> = new Set([
  "about",
  "account",
  "api",
  "assets",
  "brand",
  "dashboard",
  "features",
  "join",
  "login",
  "members",
  "new",
  "o",
  "space",
  "pay",
  "plans",
  "privacy",
  "public",
  "receipts",
  "reset-password",
  "settings",
  "start",
  "static",
  "super-admin",
  "super-admin-mfa",
  "terms",
  "verify",
  "verify-email",
]);

/** Routes under `/s/<spaceSlug>/` a plan slug would shadow. */
export const RESERVED_PLAN_SLUGS: ReadonlySet<string> = new Set(["join", "plans", "verify"]);

export function isReservedSpaceSlug(slug: string) {
  return RESERVED_SPACE_SLUGS.has(slug.trim().toLowerCase());
}

export function isReservedPlanSlug(slug: string) {
  return RESERVED_PLAN_SLUGS.has(slug.trim().toLowerCase());
}
