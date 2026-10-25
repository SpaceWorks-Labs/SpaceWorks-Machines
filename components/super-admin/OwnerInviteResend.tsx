"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { resendOwnerInvite } from "@/app/actions/super-admin-spaces";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";

/** Shown while a space set up by a platform admin has no machine manager yet. */
export function OwnerInviteResend({ spaceId, defaultEmail }: { spaceId: string; defaultEmail: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [message, setMessage] = useState<{ tone: "danger" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await resendOwnerInvite({ spaceId, ownerEmail: email });
      setMessage(result.ok ? { tone: "success", text: `A new invite is on its way to ${email}. The previous link no longer works.` } : { tone: "danger", text: result.error });
      if (result.ok) router.refresh();
    });
  };

  return (
    <Card as="section" className="rounded-xl">
      <CardHeader title="No machine manager yet" description="The machine manager joins by accepting the invite emailed to them. Send a new one if it expired or went to the wrong address." />
      <form className="flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={submit}>
        <Field label="Machine manager's email" required className="flex-1">
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} autoComplete="off" />
        </Field>
        <Button type="submit" variant="secondary" loading={pending}>Send new invite</Button>
      </form>
      {message ? <Callout tone={message.tone} role={message.tone === "danger" ? "alert" : "status"} className="mt-4">{message.text}</Callout> : null}
    </Card>
  );
}
