"use client";

import { useRef } from "react";
import { Moon, Sun } from "lucide-react";
import { SegmentedControl } from "@/components/ui/choice";
import { useAppColorMode } from "@/components/providers";
import { AccountCard } from "@/components/account/AccountCard";
import type { ColorMode } from "@/lib/colorMode";
import { centreOf } from "@/lib/themeReveal";

const OPTIONS = [
  { value: "light", label: "Light", icon: <Sun aria-hidden /> },
  { value: "dark", label: "Dark", icon: <Moon aria-hidden /> },
] as const satisfies ReadonlyArray<{ value: ColorMode; label: string; icon: React.ReactNode }>;

/** Colour mode for this browser: light or dark (there is no System option). */
export function AccountAppearanceCard() {
  const { mode, setColorMode } = useAppColorMode();
  // The reveal grows from where the person clicked, or from the focused option when they used the keyboard.
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const origin = () => {
    const clicked = pointer.current;
    pointer.current = null;
    return clicked ?? (document.activeElement ? centreOf(document.activeElement.getBoundingClientRect()) : undefined);
  };
  return (
    <AccountCard id="account-appearance" title="Appearance" description="Choose how Space Works Machines looks in this browser.">
      <div className="flex flex-col gap-2" onPointerDownCapture={(event) => { pointer.current = { x: event.clientX, y: event.clientY }; }}>
        <SegmentedControl<ColorMode>
          ariaLabel="Colour mode"
          value={mode}
          onValueChange={(next) => setColorMode(next, origin())}
          options={OPTIONS}
          className="self-start"
        />
        <p className="text-caption text-ink-muted">Saved in this browser only.</p>
      </div>
    </AccountCard>
  );
}
