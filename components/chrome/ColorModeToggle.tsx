"use client";

import { Moon, Sun } from "lucide-react";
import { useAppColorMode } from "@/components/providers";
import { IconButton } from "@/components/ui/button";
import { centreOf } from "@/lib/themeReveal";

export function ColorModeToggle({ variant = "quiet", size = "md" }: { variant?: "quiet" | "secondary"; size?: "sm" | "md" }) {
  const { mode, toggleColorMode } = useAppColorMode();
  const label = `Switch to ${mode === "dark" ? "light" : "dark"} mode`;
  return (
    <IconButton
      label={label}
      variant={variant}
      size={size}
      onClick={(event) => {
        toggleColorMode(centreOf(event.currentTarget.getBoundingClientRect()));
      }}
    >
      {/* Both icons stay mounted and cross-rotate, so the swap reads as one motion. */}
      <span aria-hidden className="relative inline-flex size-[18px]">
        <Sun className={`sw-mode-icon absolute inset-0 ${mode === "dark" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"}`} />
        <Moon className={`sw-mode-icon absolute inset-0 ${mode === "dark" ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100"}`} />
      </span>
    </IconButton>
  );
}
