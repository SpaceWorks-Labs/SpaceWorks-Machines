"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { setSpaceLimits } from "@/app/actions/super-admin-spaces";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";

/** Caps on makers and staff. Empty means no cap. */
export function SpaceLimitsForm({ spaceId, memberLimit, staffLimit }: { spaceId: string; memberLimit: number | null; staffLimit: number | null }) {
  const router = useRouter();
  const [members, setMembers] = useState(memberLimit?.toString() ?? "");
  const [managers, setManagers] = useState(staffLimit?.toString() ?? "");
  const [message, setMessage] = useState<{ tone: "danger" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await setSpaceLimits({ spaceId, memberLimit: members.trim(), staffLimit: managers.trim() });
      setMessage(result.ok ? { tone: "success", text: "Limits saved." } : { tone: "danger", text: result.error });
      if (result.ok) router.refresh();
    });
  };

  return (
    <Card as="section" className="rounded-xl">
      <CardHeader title="Limits" description="Leave empty for no cap." />
      <form className="flex flex-col gap-4" onSubmit={submit}>
        {message ? <Callout tone={message.tone} role={message.tone === "danger" ? "alert" : "status"}>{message.text}</Callout> : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Makers" optional>
            <Input value={members} onChange={(event) => setMembers(event.target.value.replace(/\D/g, ""))} inputMode="numeric" disabled={pending} />
          </Field>
          <Field label="Staff" optional>
            <Input value={managers} onChange={(event) => setManagers(event.target.value.replace(/\D/g, ""))} inputMode="numeric" disabled={pending} />
          </Field>
        </div>
        <div>
          <Button type="submit" variant="secondary" loading={pending}>Save limits</Button>
        </div>
      </form>
    </Card>
  );
}
