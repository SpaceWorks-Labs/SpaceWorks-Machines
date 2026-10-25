"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowUpRight, ChevronsUpDown, Home, LogOut, Menu as MenuIcon, Moon, Plus, Sun, UserRound, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ShellSpace, ShellUser } from "@/lib/appShell";
import { can, spaceAllows, ROLE_LABELS } from "@/lib/permissionRoles";
import { SpaceWorksProductLogo } from "@/components/brand/SpaceWorksLogo";
import { useAppColorMode } from "@/components/providers";
import { Avatar, SpaceLogo } from "@/components/ui/display";
import { IconButton } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { NavGroup, SPACE_NAV_GROUPS, type NavEntry } from "./spaceNav";
import { BrandHomeLink } from "./SiteHeader";

function NavItem({ href, children, active, onNavigate, badge }: { href: string; children: string; active: boolean; onNavigate?: () => void; badge?: ReactNode }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        // Text-only navigation (brand D9); 44px targets; pills (owner decision J1).
        "relative flex min-h-11 items-center gap-2.5 rounded-control px-4 text-[15px] text-ink transition-colors duration-[120ms] hover:bg-sidebar-hover",
        active && "bg-sidebar-active font-semibold text-on-sidebar-active hover:bg-sidebar-active",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge}
    </Link>
  );
}

function currentSpaceSlug(pathname: string | null) {
  const match = /^\/dashboard\/([^/]+)/.exec(pathname ?? "");
  if (!match || match[1] === "space" || match[1] === "security") return null;
  return decodeURIComponent(match[1]!);
}

/** The person's menu: account, light/dark mode and sign out. */
function AccountMenu({ user, onNavigate }: { user: ShellUser; onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  const { mode, toggleColorMode } = useAppColorMode();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const byPointer = useRef(false);
  const name = user.name ?? user.email ?? "Account";
  return (
    <Menu>
      <MenuTrigger
        ref={triggerRef}
        className={cn(
          "flex min-h-12 w-full items-center gap-2.5 rounded-xl border border-line bg-panel p-2 text-left transition-colors hover:bg-surface data-[state=open]:bg-surface",
          pathname.startsWith("/account") && "ring-1 ring-line-strong",
        )}
      >
        <Avatar name={user.name ?? user.email} src={user.image} size="sm" className="size-8 text-[11px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{name}</span>
          {user.email && user.name ? <span className="block truncate text-caption text-ink-muted">{user.email}</span> : null}
        </span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-ink-muted" />
      </MenuTrigger>
      <MenuContent
        side="top"
        align="start"
        className="min-w-[232px]"
        onPointerDown={() => { byPointer.current = true; }}
        onKeyDown={() => { byPointer.current = false; }}
        // Keyboard users get focus back on the trigger; a pointer choice doesn't light up a focus ring in the middle
        // of the colour switch.
        onCloseAutoFocus={(event) => { if (byPointer.current) event.preventDefault(); byPointer.current = false; }}
      >
        <MenuLabel>{name}</MenuLabel>
        <MenuItem asChild icon={<UserRound />}>
          <Link href="/account" onClick={onNavigate}>Account settings</Link>
        </MenuItem>
        <MenuItem
          icon={mode === "dark" ? <Sun /> : <Moon />}
          onSelect={() => {
            // Let the menu close first: the reveal snapshots the page as it is, and an open menu would linger in
            // the old snapshot as a ghost. The circle grows from the account button, which stays on screen.
            const rect = triggerRef.current?.getBoundingClientRect();
            const origin = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined;
            requestAnimationFrame(() => requestAnimationFrame(() => toggleColorMode(origin)));
          }}
        >
          {mode === "dark" ? "Light mode" : "Dark mode"}
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<LogOut />} onSelect={() => void signOut({ callbackUrl: "/" })}>
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function SpaceSwitcher({ current, spaces, onNavigate }: { current: ShellSpace; spaces: ShellSpace[]; onNavigate?: () => void }) {
  return (
    <Menu>
      <MenuTrigger className="group w-full overflow-hidden rounded-xl border border-line bg-panel text-left transition-colors hover:border-line-strong">
        <span className="flex min-h-[58px] items-center gap-2.5 px-2.5 py-2">
          <SpaceLogo name={current.name} src={current.logoUrl} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-ink">{current.name}</span>
            <span className="block text-caption text-ink-muted">{ROLE_LABELS[current.role]}</span>
          </span>
          <ChevronsUpDown aria-hidden className="mt-1 size-4 shrink-0 text-ink-muted" />
          <span className="sr-only">Switch space</span>
        </span>
      </MenuTrigger>
      <MenuContent align="start" side="bottom" className="min-w-[240px]">
        <MenuLabel>Spaces</MenuLabel>
        {spaces.map((space) => (
          <MenuItem key={space.slug} asChild>
            <Link href={`/dashboard/${space.slug}`} onClick={onNavigate}>
              <span className="flex items-center gap-2.5">
                <SpaceLogo name={space.name} src={space.logoUrl} size="sm" />
                <span className="min-w-0 truncate">{space.name}</span>
              </span>
            </Link>
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem asChild icon={<Home />}>
          <Link href="/dashboard" onClick={onNavigate}>All spaces</Link>
        </MenuItem>
        <MenuItem asChild icon={<Plus />}>
          <Link href="/start" onClick={onNavigate}>Apply for a new space</Link>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function SidebarContents({ user, spaces, onNavigate }: { user: ShellUser; spaces: ShellSpace[]; onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  const slug = currentSpaceSlug(pathname);
  const current = slug ? spaces.find((space) => space.slug === slug) ?? null : null;
  const base = current ? `/dashboard/${current.slug}` : "";
  const active = current?.status === "ACTIVE";

  return (
    <div className="flex h-full flex-col gap-4 px-3 py-3.5">
      <div className="pl-2 pt-1">
        <BrandHomeLink href="/dashboard" stacked />
      </div>

      {current ? (
        <>
          <SpaceSwitcher current={current} spaces={spaces} onNavigate={onNavigate} />
          <nav aria-label="Space" className="flex flex-col gap-1">
            {SPACE_NAV_GROUPS.map((group) => {
              const items = group.items.filter((item) => item.capabilities.some((capability) => spaceAllows(current.status, capability) && can(current.role, capability)));
              if (!items.length) return null;
              const isActive = (item: NavEntry) => {
                const href = `${base}${item.path}`;
                return item.exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
              };
              const links = items.map((item) => (
                <NavItem key={item.path} href={`${base}${item.path}`} active={isActive(item)} onNavigate={onNavigate}>
                  {item.label}
                </NavItem>
              ));
              return group.label
                ? <NavGroup key={group.key} groupKey={group.key} label={group.label} current={items.some(isActive)}>{links}</NavGroup>
                : <div key={group.key} className="flex flex-col gap-1">{links}</div>;
            })}
            {active ? null : (
              // Under review, declined, suspended or archived: the status page explains what is open.
              <NavItem href={`${base}/application`} active={pathname.startsWith(`${base}/application`)} onNavigate={onNavigate}>
                {current.status === "SUSPENDED" || current.status === "ARCHIVED" ? "Status" : "Application"}
              </NavItem>
            )}
          </nav>
        </>
      ) : (
        <nav aria-label="Workspace" className="flex flex-col gap-1">
          <NavItem href="/dashboard" active={pathname === "/dashboard"} onNavigate={onNavigate}>Home</NavItem>
          <p className="mt-4 px-4 pb-0.5 text-overline text-ink-muted">Spaces</p>
          {spaces.map((space) => (
            <Link
              key={space.slug}
              href={`/dashboard/${space.slug}`}
              onClick={onNavigate}
              className="relative flex min-h-11 items-center gap-2.5 rounded-control px-4 text-[15px] text-ink transition-colors hover:bg-sidebar-hover"
            >
              <SpaceLogo name={space.name} src={space.logoUrl} size="sm" className="size-6 rounded-[7px] text-[10px]" />
              <span className="min-w-0 flex-1 truncate">{space.name}</span>
            </Link>
          ))}
          <NavItem href="/start" active={pathname === "/start"} onNavigate={onNavigate}>Apply for a space</NavItem>
        </nav>
      )}

      <div className="mt-auto flex flex-col gap-2">
        {current && active ? (
          <Link
            href={`/s/${current.slug}`}
            onClick={onNavigate}
            className="inline-flex min-h-11 items-center gap-1 rounded-control px-4 text-sm font-medium text-ink underline-offset-4 hover:underline"
          >
            View public page
            <ArrowUpRight aria-hidden className="size-4" />
          </Link>
        ) : null}
        <AccountMenu user={user} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

/**
 * Dashboard app shell (docs/DESIGN.md): a 256px Citron sidebar with text-only navigation from 1024px,
 * and a top bar with a menu sheet below it. There is no icon rail: the navigation is words only.
 */
export function AppShell({ user, spaces, children }: { user: ShellUser; spaces: ShellSpace[]; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="sticky top-0 hidden h-dvh w-[256px] shrink-0 overflow-y-auto overflow-x-hidden border-r border-line bg-sidebar lg:block">
        <SidebarContents user={user} spaces={spaces} />
      </aside>

      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-canvas px-4 lg:hidden">
        <Link href="/dashboard" aria-label="Space Works Machines home" className="inline-flex shrink-0 items-center rounded-md">
          <SpaceWorksProductLogo height={30} label={null} />
        </Link>
        <DialogPrimitive.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DialogPrimitive.Trigger asChild>
            <IconButton label="Open navigation menu">
              <MenuIcon />
            </IconButton>
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(var(--sw-color-ink)/0.48)] dark:bg-[rgb(0_0_0/0.48)]" />
            <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-[min(280px,86vw)] overflow-y-auto border-r border-line bg-sidebar shadow-float focus:outline-none">
              <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">Dashboard navigation</DialogPrimitive.Description>
              <DialogPrimitive.Close asChild>
                <IconButton label="Close navigation menu" size="sm" className="absolute right-3 top-3 z-10">
                  <X />
                </IconButton>
              </DialogPrimitive.Close>
              <SidebarContents user={user} spaces={spaces} onNavigate={() => setMenuOpen(false)} />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </div>

      <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-9 lg:py-9">
        <div className="mx-auto w-full max-w-[1120px]">{children}</div>
      </main>
    </div>
  );
}
