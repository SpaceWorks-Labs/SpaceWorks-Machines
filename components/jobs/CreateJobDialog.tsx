"use client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogBody } from "@/components/ui/dialog";
import { RequestForm, type Intake } from "./RequestForm";

export function CreateJobDialog({ space, intake }: { space: { id: string; slug: string; currency: string }; intake: Intake }) {
  return <Dialog><DialogTrigger asChild><Button variant="primary">Create on behalf</Button></DialogTrigger><DialogContent size="lg"><DialogHeader title="Create a job on behalf" description="Use the requester's email. Their membership determines the price." /><DialogBody><RequestForm space={space} intake={intake} onBehalf /></DialogBody></DialogContent></Dialog>;
}
