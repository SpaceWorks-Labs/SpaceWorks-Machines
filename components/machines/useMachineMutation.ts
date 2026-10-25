"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/app/actions/space";
import { useToast } from "@/components/feedback/ToastProvider";

/** Shared pending, inline validation and refresh behaviour for machine mutations and uploads. */
export function useMachineMutation() {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  function run<T>(work: () => Promise<ActionResult<T>>, message: string, onSuccess?: (data: T | undefined) => void) {
    setError("");
    setFieldErrors({});
    startTransition(async () => {
      try {
        const result = await work();
        if (!result.ok) {
          setError(result.error);
          setFieldErrors(result.fieldErrors ?? {});
          showToast(result.error, "error");
          return;
        }
        showToast(message, "success");
        onSuccess?.(result.data);
        router.refresh();
      } catch {
        const message = "Couldn't save the change. Try again.";
        setError(message);
        showToast(message, "error");
      }
    });
  }
  return { pending, error, fieldErrors, run };
}
