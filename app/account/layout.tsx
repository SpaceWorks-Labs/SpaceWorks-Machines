import { loadAccountShell } from "@/lib/views/app__account__layout";
import { AppShell } from "@/components/chrome/AppShell";
import { AccountSettingsLayout } from "@/components/account/AccountSettingsLayout";
import { formatMemberSince } from "@/lib/accountSecurity";

export default async function AccountLayout({ children }: { children: React.ReactNode; }) {
  const { user, spaces, account } = await loadAccountShell();
  return (
    <AppShell user={user} spaces={spaces}>
      <AccountSettingsLayout
        account={{
          name: user.name,
          email: user.email,
          image: user.image,
          emailVerified: Boolean(account.emailVerified),
          mfaEnabled: Boolean(account.mfaEnabledAt),
          memberSinceLabel: formatMemberSince(account.createdAt),
        }}
      >
        {children}
      </AccountSettingsLayout>
    </AppShell>
  );
}
