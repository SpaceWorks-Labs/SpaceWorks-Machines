import { loadAccountSecurityView } from "@/lib/views/app__account__security__page";
import type { Metadata } from "next";
import { AccountSecurityClient } from "@/components/security/AccountSecurityClient";
import { AccountPasswordForm } from "@/components/account/AccountPasswordForm";
import { SignInMethodsCard } from "@/components/security/SignInMethodsCard";
import { SecurityActivityCard } from "@/components/security/SecurityActivityCard";
import { SignOutEverywhereCard } from "@/components/security/SignOutEverywhereCard";
import { securityActivityLabel } from "@/lib/accountSecurity";
import Link from "next/link";
import { Callout, Card, CardHeader } from "@/components/ui/display";

export const metadata: Metadata = { title: "Account security" };

export default async function AccountSecurityPage() {
  const { hasPassword, superAdmin, authenticatorRequired, isStaff, user, activity } = await loadAccountSecurityView();
  return (
    <div className="flex flex-col gap-6">
      {authenticatorRequired ? (
        <Callout tone="warning" title="Set up an authenticator app to open the dashboard">
          You&apos;re on a space&apos;s team, so your account needs an authenticator app (such as Google Authenticator, Microsoft Authenticator or 1Password). Turn on two-step sign-in below. Makers&apos; accounts don&apos;t need one.
        </Callout>
      ) : isStaff && user.mfaEnabledAt ? (
        <Callout tone="success">Your authenticator app is on. <Link href="/dashboard" className="font-semibold underline underline-offset-4">Go to the dashboard</Link>.</Callout>
      ) : null}
      {superAdmin ? (
        <Card as="section" className="rounded-xl">
          <CardHeader title="Password" description="This is a super-admin account, so its password is set on the server, never here or by email." />
          <p className="text-body-ui text-ink-secondary">On the server, run <code className="break-all rounded bg-subtle px-1.5 py-0.5 text-sm">scripts/spaceworks-compose.sh bundled run --rm ops admin set-password --email {"<your email>"}</code>.</p>
        </Card>
      ) : <AccountPasswordForm hasPassword={hasPassword} />}
      <AccountSecurityClient mfaEnabled={Boolean(user.mfaEnabledAt)} />
      <SignInMethodsCard hasPassword={hasPassword} superAdmin={superAdmin} />
      <SecurityActivityCard
        items={activity.map((event) => ({ id: event.id, label: securityActivityLabel(event.action), at: event.createdAt.toISOString() }))}
      />
      <SignOutEverywhereCard />
    </div>
  );
}
