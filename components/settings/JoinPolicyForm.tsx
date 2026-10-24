"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JoinPolicy } from "@prisma/client";
import { setJoinPolicy } from "@/app/actions/space";
import { useToast } from "@/components/feedback/ToastProvider";
import { Card, CardHeader } from "@/components/ui/display";
import { Radio, RadioGroup } from "@/components/ui/choice";

const OPTIONS: Array<{ value: JoinPolicy; label: string; description: string }> = [
  { value: "OPEN", label: "Anyone can join", description: "Makers with a verified email join straight away." },
  { value: "APPROVAL", label: "Ask to join", description: "Makers ask; a machine manager approves them on the Team page." },
  { value: "INVITE_ONLY", label: "Invite only", description: "Only people you invite from the Team page can join." },
];

/** Who may join the space as a maker. Saved as soon as it changes. */
export function JoinPolicyForm({ spaceSlug, initial }: { spaceSlug: string; initial: JoinPolicy }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  return (
    <Card as="section" className="rounded-xl">
      <CardHeader title="Joining" description="How makers become part of the space." />
      <RadioGroup
        aria-label="How makers join"
        value={value}
        disabled={pending}
        onValueChange={(next) => {
          const previous = value;
          setValue(next as JoinPolicy);
          startTransition(async () => {
            const result = await setJoinPolicy({ spaceSlug, joinPolicy: next });
            if (!result.ok) {
              setValue(previous);
              showToast(result.error, "error");
              return;
            }
            showToast("Joining updated", "success");
            router.refresh();
          });
        }}
      >
        {OPTIONS.map((option) => <Radio key={option.value} value={option.value} label={option.label} description={option.description} />)}
      </RadioGroup>
    </Card>
  );
}
