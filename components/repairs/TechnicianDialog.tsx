"use client";

import { useState } from "react";
import { importTechniciansAction, saveTechnicianAction } from "@/app/actions/technicians";
import { useMachineMutation } from "@/components/machines/useMachineMutation";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from "@/components/ui/dialog";
import { Dropdown, Field, Input, Textarea } from "@/components/ui/field";

type Technician = { id: string; kind: "STAFF" | "EXTERNAL"; name: string; email: string; phone: string; whatsapp: string; telegramChatId: string;
  skills: string[]; preferredChannel: string; notes: string; isActive: boolean };

/** Add or edit a technician. Staff technicians come from the team (TECHNICIAN role); outside ones need a way to reach them. */
export function TechnicianDialog({ spaceSlug, staff, technician }: { spaceSlug: string; staff: { userId: string; name: string }[]; technician?: Technician }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"STAFF" | "EXTERNAL">(technician?.kind ?? "EXTERNAL");
  const [active, setActive] = useState(technician?.isActive ?? true);
  const mutation = useMachineMutation();
  const label = technician ? `Edit ${technician.name}` : "Add a technician";
  return <Dialog open={open} onOpenChange={(next) => { if (!mutation.pending) setOpen(next); }}>
    <DialogTrigger asChild><Button size={technician ? "sm" : "md"} variant={technician ? "secondary" : "primary"}>{technician ? <>Edit<span className="sr-only"> {technician.name}</span></> : label}</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader title={label} description="Skills help you pick the right people when you ask for a repair." />
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const text = (key: string) => String(data.get(key) ?? "");
        mutation.run(() => saveTechnicianAction({ spaceSlug, technicianId: technician?.id, kind, userId: kind === "STAFF" ? text("userId") || null : null,
          name: text("name"), email: text("email"), phone: text("phone"), whatsapp: text("whatsapp"), telegramChatId: text("telegramChatId"),
          skills: text("skills").split(","), preferredChannel: text("preferredChannel") || "EMAIL", notes: text("notes"), isActive: active }), "Technician saved", () => setOpen(false));
      }}>
        <DialogBody><fieldset disabled={mutation.pending} className="flex flex-col gap-4">
          {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
          {!technician ? <Field label="Kind"><Dropdown value={kind} onChange={(event) => setKind(event.target.value as "STAFF" | "EXTERNAL")}>
            <option value="EXTERNAL">Outside technician</option><option value="STAFF">Staff technician</option></Dropdown></Field> : null}
          {kind === "STAFF" && !technician ? <Field label="Team member" helperText={staff.length ? undefined : "Give someone the Technician role on the Team page first."}>
            <Dropdown name="userId" required>{staff.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</Dropdown></Field> : null}
          <Field label="Name" optional={kind === "STAFF"}><Input name="name" maxLength={120} defaultValue={technician?.name} required={kind === "EXTERNAL"} /></Field>
          {kind === "EXTERNAL" ? <>
            <Field label="Email" optional><Input name="email" type="email" maxLength={320} defaultValue={technician?.email} /></Field>
            <Field label="Phone" optional><Input name="phone" maxLength={30} defaultValue={technician?.phone} /></Field>
          </> : null}
          <Field label="WhatsApp number" optional helperText="With the country code, like +919876543210."><Input name="whatsapp" maxLength={20} defaultValue={technician?.whatsapp} /></Field>
          <Field label="Telegram chat ID" optional helperText="They message your bot first; its numeric chat ID goes here."><Input name="telegramChatId" maxLength={40} defaultValue={technician?.telegramChatId} /></Field>
          <Field label="Skills" optional helperText="Separate with commas: electrical, 3D printers, laser, AC."><Input name="skills" maxLength={500} defaultValue={technician?.skills.join(", ")} /></Field>
          <Field label="Preferred channel"><Dropdown name="preferredChannel" defaultValue={technician?.preferredChannel ?? "EMAIL"}>
            <option value="EMAIL">Email</option><option value="WHATSAPP">WhatsApp</option><option value="TELEGRAM">Telegram</option></Dropdown></Field>
          <Field label="Notes" optional><Textarea name="notes" rows={2} maxLength={1000} defaultValue={technician?.notes} /></Field>
          {technician ? <CheckboxField label="Active" description="Inactive technicians can't be asked for repairs." checked={active} onCheckedChange={(value) => setActive(value === true)} /> : null}
        </fieldset></DialogBody>
        <DialogFooter><Button type="button" variant="secondary" disabled={mutation.pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={mutation.pending}>Save technician</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

/** Paste several outside technicians at once, one per line. */
export function TechnicianImportDialog({ spaceSlug }: { spaceSlug: string }) {
  const [open, setOpen] = useState(false);
  const mutation = useMachineMutation();
  return <Dialog open={open} onOpenChange={(next) => { if (!mutation.pending) setOpen(next); }}>
    <DialogTrigger asChild><Button variant="secondary">Import CSV</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader title="Import technicians" description="One per line: name, email, phone, WhatsApp, Telegram chat ID, skills separated by semicolons, notes." />
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => {
        event.preventDefault();
        const csv = String(new FormData(event.currentTarget).get("csv") ?? "");
        mutation.run(() => importTechniciansAction({ spaceSlug, csv }), "Technicians imported", () => setOpen(false));
      }}>
        <DialogBody><fieldset disabled={mutation.pending} className="flex flex-col gap-4">
          {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
          <Field label="CSV lines"><Textarea name="csv" rows={8} required maxLength={50_000} placeholder="Ravi Kumar,ravi@example.com,,+919876543210,,electrical;ac,Weekends only" /></Field>
        </fieldset></DialogBody>
        <DialogFooter><Button type="button" variant="secondary" disabled={mutation.pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={mutation.pending}>Import</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
