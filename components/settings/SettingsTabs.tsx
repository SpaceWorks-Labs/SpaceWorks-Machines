"use client";

import { usePathname } from "next/navigation";
import { NavTabs } from "@/components/ui/tabs";

/** Space settings sections (machine managers). Machine settings have their own page, shared with machine type managers. */
export function SettingsTabs({ slug }: { slug: string }) {
  const pathname = usePathname() ?? "";
  const base = `/dashboard/${slug}/settings`;
  const items = [
    { href: base, label: "Profile" },
    { href: `${base}/payments`, label: "Payments" },
    { href: `${base}/email`, label: "Email" },
    { href: `${base}/notifications`, label: "Notifications" },
  ];
  return <NavTabs label="Settings sections" items={items.map((item) => ({ ...item, active: item.href === base ? pathname === base : pathname.startsWith(item.href) }))} />;
}
