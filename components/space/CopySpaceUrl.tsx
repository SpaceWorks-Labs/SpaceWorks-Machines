"use client";

import { Copy } from "lucide-react";
import { useToast } from "@/components/feedback/ToastProvider";

async function copyToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.focus();
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
}

export function CopySpaceUrl(props: { slug: string }) {
  const { slug } = props;
  const { showToast } = useToast();

  return (
    <button
      type="button"
      aria-label="Copy link to the public page"
      onClick={async () => {
        try {
          await copyToClipboard(`${window.location.origin}/s/${slug}`);
          showToast("Space URL copied", "success", null, 2500);
        } catch {
          showToast("Could not copy space URL", "error");
        }
      }}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-line bg-panel px-3.5 text-sm font-semibold text-ink transition-colors hover:bg-muted"
    >
      <Copy aria-hidden className="size-4" />
      Copy link
    </button>
  );
}
