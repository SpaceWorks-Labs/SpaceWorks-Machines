import { cn } from "@/lib/cn";

/** A small coloured fact beside a timeline step: the evidence that the step happened. */
export function Proof({ tone, children }: { tone: "panel" | "citron" | "sky" | "yellow" | "teal"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-block max-w-full rounded-xl px-3.5 py-1.5 text-caption font-semibold sm:rounded-full",
        tone === "panel" && "border border-line bg-panel text-ink",
        tone === "citron" && "bg-sw-citron text-sw-ink",
        tone === "sky" && "bg-sw-sky text-sw-ink",
        tone === "yellow" && "bg-sw-yellow text-sw-ink",
        tone === "teal" && "bg-sw-teal text-sw-cream",
      )}
    >
      {children}
    </span>
  );
}

