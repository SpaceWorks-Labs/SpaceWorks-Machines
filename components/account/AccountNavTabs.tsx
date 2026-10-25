"use client";

import { usePathname } from "next/navigation";
import { NavTabs } from "@/components/ui/tabs";
import { ACCOUNT_TABS, isAccountTabActive } from "@/components/account/accountTabs";

export function AccountNavTabs() {
  const pathname = usePathname();
  return (
    <NavTabs
      label="Account settings"
      items={ACCOUNT_TABS.map((tab) => ({ href: tab.href, label: tab.label, active: isAccountTabActive(pathname, tab.href) }))}
    />
  );
}
