"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { printerCommandAction } from "@/app/actions/integrations";
import { Button } from "@/components/ui/button";
import { useMachineMutation } from "@/components/machines/useMachineMutation";

type Command = "test" | "start" | "pause" | "resume" | "cancel" | "fail";
const LABELS: Record<Command, string> = { test: "Test connection", start: "Start a test print", pause: "Pause", resume: "Resume", cancel: "Cancel print", fail: "Simulate a failure" };

/** Command buttons for one connection. "Simulate a failure" is the simulator's error injection. */
export function PrinterControls({ spaceSlug, connectionId, commands }: { spaceSlug: string; connectionId: string; commands: Command[] }) {
  const mutation = useMachineMutation();
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Printer commands">
      {commands.map((command) => <Button key={command} size="sm" variant={command === "start" ? "primary" : "secondary"} disabled={mutation.pending}
        onClick={() => mutation.run(() => printerCommandAction({ spaceSlug, connectionId, command }), `${LABELS[command]}: done`)}>{LABELS[command]}</Button>)}
      {mutation.error ? <p role="alert" className="w-full text-caption text-danger-fg">{mutation.error}</p> : null}
    </div>
  );
}

/** Re-render the server page every few seconds, so telemetry stays live while the page is open. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    return () => window.clearInterval(timer);
  }, [router, seconds]);
  return null;
}
