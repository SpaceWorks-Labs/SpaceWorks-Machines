import { cn } from "@/lib/cn";
import { Patch } from "@/components/brand/Patch";

/** Maker Teal, Workshop Orange and an ink dot (cream in dark mode), hopping left to right in turn. */
const DOTS = [
  { className: "bg-primary", delay: 0 },
  { className: "bg-highlight", delay: 160 },
  { className: "bg-ink", delay: 320 },
] as const;

/**
 * Loading indicator: three brand dots that hop one after the other. `size`
 * is the overall width in px. Still under reduced motion. Announces `label`
 * politely to assistive technology.
 */
export function BrandLoader({ size = 48, label = "Loading", className }: { size?: number; label?: string; className?: string }) {
  const dot = size / 4.2;
  return (
    <span role="status" className={cn("inline-flex flex-col items-center", className)}>
      <span aria-hidden="true" className="flex items-end" style={{ gap: dot * 0.6, height: dot * 1.8 }}>
        {DOTS.map((item, index) => (
          <span
            key={index}
            className={cn("sw-dot-loader-jump block shrink-0 rounded-full", item.className)}
            style={{ width: dot, height: dot, animationDelay: `${item.delay}ms` }}
          />
        ))}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * Route-level loading state, fixed in the centre of the viewport: Patch trots in place while the brand
 * dots hop beneath like footsteps. Both rest under reduced motion.
 */
export function BrandPageLoader({ label }: { label?: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center">
      {/* Patch's dark outline needs a light surface in dark mode (SpaceWorks-Design: Warm Cream works). */}
      <span className="rounded-full dark:bg-sw-cream">
        <Patch pose="walk" size={112} />
      </span>
      <BrandLoader size={36} label={label} />
    </div>
  );
}
