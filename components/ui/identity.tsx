import { cn } from "@/lib/cn";
import { getAccentTokens } from "@/lib/theme/accent";
import { AvatarImage } from "./avatar-image";

/* ---------- Avatar & space logo ---------- */

export function initials(name: string | null | undefined, fallback = "?") {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return fallback;
  return (words.length === 1 ? words[0]!.slice(0, 2) : `${words[0]![0]}${words[words.length - 1]![0]}`).toUpperCase();
}

const avatarSizes = { xs: "size-6 text-[10px]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg", xl: "size-20 text-2xl" } as const;
type AvatarSize = keyof typeof avatarSizes;

/** Photo if present, else 1–2 initials on a tint (docs/DESIGN.md §3). */
export function Avatar({ name, src, size = "md", tone = "neutral", className }: { name?: string | null; src?: string | null; size?: AvatarSize; tone?: "neutral" | "accent" | "success" | "warning" | "ink"; className?: string }) {
  const toneClass = {
    neutral: "bg-emphasis text-ink-secondary",
    accent: "bg-accent-soft text-accent-text",
    success: "bg-success-bg text-success-fg",
    warning: "bg-warning-bg text-warning-fg",
    ink: "bg-primary text-on-primary",
  }[tone];
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold", avatarSizes[size], toneClass, className)}>
      {src ? (
        <AvatarImage src={src} fallback={<span aria-hidden>{initials(name)}</span>} />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
      {name ? <span className="sr-only">{name}</span> : null}
    </span>
  );
}

const logoSizes = { sm: "size-8 rounded-[9px] text-xs", md: "size-10 rounded-[10px] text-sm", lg: "size-14 rounded-[14px] text-lg", xl: "size-24 rounded-[24px] text-3xl" } as const;

/** Square space logo; falls back to initials on ink. */
export function SpaceLogo({ name, src, size = "md", className }: { name: string; src?: string | null; size?: keyof typeof logoSizes; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden border border-line font-semibold", logoSizes[size], src ? "bg-panel" : "bg-primary text-on-primary", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- space logos are served by the app's own upload route
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}

/* ---------- Date block (docs/DESIGN.md §4.6) ---------- */

export function DateBlock({ month, day, tone = "accent", color, size = "md", className }: { month: string; day: string; tone?: "accent" | "draft" | "ink"; /** Explicit header colour (validated hex), e.g. a space accent. */ color?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const header = color ? undefined : tone === "accent" ? "bg-accent text-on-accent" : tone === "draft" ? "bg-emphasis text-ink-secondary" : "bg-primary text-on-primary";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 flex-col overflow-hidden rounded-md border border-line bg-panel text-center",
        size === "sm" && "w-[50px]",
        size === "md" && "w-14",
        size === "lg" && "w-[68px]",
        className,
      )}
    >
      <span className={cn("block py-0.5 text-[11px] font-semibold tracking-[0.08em]", size === "lg" && "text-xs", header)} style={color ? { backgroundColor: color, color: getAccentTokens(color, "light")["--sw-on-accent"] } : undefined}>{month}</span>
      <span
        className={cn(
          "flex items-center justify-center font-display font-semibold tabular-nums leading-none text-ink",
          size === "sm" && "h-8 text-xl",
          size === "md" && "h-10 text-2xl",
          size === "lg" && "h-12 text-[30px]",
        )}
      >
        {day}
      </span>
    </span>
  );
}

