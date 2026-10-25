import { KeyRound, Mail } from "lucide-react";
import { Chip } from "@/components/ui/display";
import { AccountCard } from "@/components/account/AccountCard";

/** Ways this account can sign in. Receives only booleans. */
export function SignInMethodsCard({ hasPassword, superAdmin }: { hasPassword: boolean; superAdmin: boolean }) {
  return (
    <AccountCard id="sign-in-methods" title="Sign-in methods" description="The ways you can sign in to this account.">
      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
        <li className="flex items-center gap-3 px-4 py-3">
          <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-ink-secondary [&_svg]:size-4"><KeyRound /></span>
          <div className="min-w-0 flex-1">
            <p className="text-label text-ink">Email and password</p>
            <p className="text-caption text-ink-muted">{hasPassword ? "You can sign in with your email address and password." : "No password set. Add one in the Password section above."}</p>
          </div>
          {hasPassword ? <Chip size="sm" tone="success">Set</Chip> : <Chip size="sm" tone="neutral">Not set</Chip>}
        </li>
        <li className="flex items-center gap-3 px-4 py-3">
          <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-ink-secondary [&_svg]:size-4"><Mail /></span>
          <div className="min-w-0 flex-1">
            <p className="text-label text-ink">Emailed sign-in link</p>
            <p className="text-caption text-ink-muted">{superAdmin ? "Not available: super-admin accounts sign in with their password only." : "Ask for a one-time link on the sign-in page. It works once, for 15 minutes."}</p>
          </div>
          {superAdmin ? <Chip size="sm" tone="neutral">Off</Chip> : <Chip size="sm" tone="success">On</Chip>}
        </li>
      </ul>
    </AccountCard>
  );
}
