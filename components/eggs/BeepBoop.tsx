"use client";

import { useEffect, useState } from "react";
import { BEEP_MS, cameBackInService, statusKey } from "@/lib/patch/eggs";

/**
 * Easter egg: when a machine you were looking at comes back from maintenance or offline, a tiny "beep boop"
 * pops up beside its status for a moment. Remembers the last status seen in this tab only. Decorative.
 */
export function BeepBoop({ machineId, status }: { machineId: string; status: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let previous: string | null = null;
    try {
      previous = sessionStorage.getItem(statusKey(machineId));
      sessionStorage.setItem(statusKey(machineId), status);
    } catch { /* storage unavailable: no egg */ }
    if (!cameBackInService(previous, status)) return;
    const appear = window.setTimeout(() => setShow(true), 0);
    const timer = window.setTimeout(() => setShow(false), BEEP_MS);
    return () => { window.clearTimeout(appear); window.clearTimeout(timer); };
  }, [machineId, status]);
  if (!show) return null;
  return <span aria-hidden data-egg="beep-boop" className="pointer-events-none rounded-full border border-line bg-panel px-3 py-1 text-caption text-ink-secondary animate-[sw-fade-in_200ms_ease-out]">beep boop</span>;
}
