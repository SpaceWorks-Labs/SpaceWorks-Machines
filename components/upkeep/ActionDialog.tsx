"use client";

import { useState, type ReactNode } from "react";
import type { ActionResult } from "@/app/actions/space";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { useMachineMutation } from "@/components/machines/useMachineMutation";

/**
 * One dialog for form actions: the server page renders the fields, this collects them. Checkboxes listed in
 * `booleans` become true/false, names in `arrays` become every checked value; every other field is sent as typed,
 * merged with `fixed` (ids, slug). With `reveal`, a value the action returns (a new key or secret) is shown once.
 */
export function ActionDialog({ action, fixed, booleans = [], arrays = [], reveal, trigger, triggerVariant = "secondary", title, description, submitLabel, submitVariant = "primary", success, children }: {
  action: (input: unknown) => Promise<ActionResult<unknown>>; fixed: Record<string, string>; booleans?: string[]; arrays?: string[];
  reveal?: { key: string; title: string; note: string };
  trigger: ReactNode; triggerVariant?: "primary" | "secondary" | "danger"; title: string; description?: string; submitLabel: string;
  /** `dangerSolid` for a destructive final step (revoke, delete). */
  submitVariant?: "primary" | "dangerSolid"; success: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const mutation = useMachineMutation();
  const [revealed, setRevealed] = useState<string | null>(null);
  const close = () => { setOpen(false); setRevealed(null); };
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!mutation.pending) { if (next) setOpen(true); else close(); } }}>
      <DialogTrigger asChild><Button size="sm" variant={triggerVariant}>{trigger}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader title={revealed && reveal ? reveal.title : title} description={revealed && reveal ? reveal.note : description} />
        {revealed ? <>
          <DialogBody><Input readOnly value={revealed} aria-label={reveal?.title} className="font-mono" onFocus={(event) => event.currentTarget.select()} /></DialogBody>
          <DialogFooter><Button type="button" variant="primary" onClick={close}>Done</Button></DialogFooter>
        </> : <form className="flex min-h-0 flex-col" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const values: Record<string, unknown> = { ...fixed };
          for (const [key, value] of form.entries()) if (typeof value === "string" && !booleans.includes(key) && !arrays.includes(key)) values[key] = value;
          for (const key of arrays) values[key] = form.getAll(key).filter((value) => typeof value === "string" && value !== "" && value !== "on");
          for (const key of booleans) values[key] = form.get(key) === "on" || form.get(key) === "true";
          mutation.run(() => action(values), success, (data) => {
            const value = reveal && data && typeof data === "object" ? (data as Record<string, unknown>)[reveal.key] : null;
            if (typeof value === "string") setRevealed(value); else close();
          });
        }}>
          <DialogBody>
            <fieldset disabled={mutation.pending} className="flex flex-col gap-4">
              {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
              {Object.keys(mutation.fieldErrors).length ? <ul className="text-caption text-danger-fg" role="alert">
                {Object.entries(mutation.fieldErrors).map(([field, errors]) => <li key={field}>{errors[0]}</li>)}</ul> : null}
              {children}
            </fieldset>
          </DialogBody>
          <DialogFooter><Button variant="secondary" type="button" disabled={mutation.pending} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant={submitVariant} loading={mutation.pending}>{submitLabel}</Button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
  );
}
