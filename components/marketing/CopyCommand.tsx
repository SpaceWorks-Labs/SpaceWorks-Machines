"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copy the install command, saying so in words as well as the icon. */
export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(command);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-sw-cream/25 px-3.5 text-caption font-semibold text-sw-cream transition-colors hover:bg-sw-cream/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sw-citron"
    >
      {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
      <span aria-live="polite">{copied ? "Copied" : "Copy command"}</span>
    </button>
  );
}
