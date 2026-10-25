/** Tabs under the Account header. Add an entry here to add a tab. */
export type AccountTab = { href: string; label: string };

export const ACCOUNT_ROOT_HREF = "/account";

export const ACCOUNT_TABS: ReadonlyArray<AccountTab> = [
  { href: ACCOUNT_ROOT_HREF, label: "Spaces" },
  { href: "/account/jobs", label: "Jobs" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/security", label: "Security" },
  { href: "/account/privacy", label: "Data and privacy" },
];

/** The root tab (your spaces) matches /account itself; every other tab also matches its nested paths. */
export function isAccountTabActive(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (href === ACCOUNT_ROOT_HREF) return path === ACCOUNT_ROOT_HREF;
  return path === href || path.startsWith(`${href}/`);
}
