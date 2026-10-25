import { loadDashboardShell } from "@/lib/views/app__dashboard__layout";
import { AppShell } from "@/components/chrome/AppShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, spaces } = await loadDashboardShell();
  return (
    <AppShell user={user} spaces={spaces}>
      {children}
    </AppShell>
  );
}
