"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { ToastProvider } from "@/components/feedback/ToastProvider";
import { TooltipProvider } from "@/components/ui/menu";
import { COLOR_MODE_COOKIE, type ColorMode } from "@/lib/colorMode";
import { REVEAL_TIMING, revealOrigin, revealRadius, revealStrategy } from "@/lib/themeReveal";

const CHANGE_EVENT = "swm:theme-change";

function readMode(): ColorMode {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(CHANGE_EVENT, onStoreChange);
}

type ColorModeOrigin = { x: number; y: number };

const ColorModeContext = createContext<{
  mode: ColorMode;
  /** Pass the click point to reveal the new mode from there. */
  toggleColorMode: (origin?: ColorModeOrigin) => void;
  setColorMode: (next: ColorMode, origin?: ColorModeOrigin) => void;
} | null>(null);

function applyColorMode(next: ColorMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", next === "dark");
  root.style.colorScheme = next;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The feathered edge animates a registered custom property (see globals.css). */
function supportsFeatheredReveal() {
  return typeof CSS !== "undefined" && typeof CSS.registerProperty === "function" && CSS.supports("mask-image", "radial-gradient(circle, #000, transparent)");
}

/**
 * Switch modes in a single frame, then animate: a soft-edged circle grows from
 * the toggle where View Transitions are supported, otherwise a gentle colour
 * cross-fade. Reduced-motion users get an instant switch.
 */
function transitionColorMode(commit: () => void, origin?: ColorModeOrigin) {
  const root = document.documentElement;
  type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void | Promise<void>) => { ready: Promise<void>; finished: Promise<void> } };
  const doc = document as ViewTransitionDocument;
  const strategy = revealStrategy({ reducedMotion: prefersReducedMotion(), viewTransitions: typeof doc.startViewTransition === "function", featheredMask: supportsFeatheredReveal() });
  if (strategy === "instant" || !doc.startViewTransition) {
    commit();
    return;
  }
  if (strategy === "fade") {
    root.classList.add("sw-theme-fade");
    commit();
    window.setTimeout(() => root.classList.remove("sw-theme-fade"), 460);
    return;
  }
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const { x, y } = revealOrigin(origin, viewport);
  const radius = revealRadius({ x, y }, viewport);
  const feathered = strategy === "reveal-soft";
  root.style.setProperty("--sw-reveal-x", `${x}px`);
  root.style.setProperty("--sw-reveal-y", `${y}px`);
  root.classList.add(feathered ? "sw-theme-reveal-soft" : "sw-theme-reveal");
  const cleanUp = () => {
    root.classList.remove("sw-theme-reveal", "sw-theme-reveal-soft", "sw-theme-switching");
    root.style.removeProperty("--sw-reveal-x");
    root.style.removeProperty("--sw-reveal-y");
  };
  const transition = doc.startViewTransition(() => {
    // Colour transitions would otherwise run inside the live new view, so the revealed circle looks half-switched.
    // Switched off here, in the update, after the old mode was captured: added before the capture (as it was), the
    // production build snapshots a blank old view and the circle grows over an empty page.
    root.classList.add("sw-theme-switching");
    commit();
  });
  // Hold the final frame: without fill the mask snaps back to 0 for a frame
  // before the transition tears down, flashing the old mode.
  const timing: KeyframeAnimationOptions = { ...REVEAL_TIMING, pseudoElement: "::view-transition-new(root)" };
  transition.ready
    .then(() => {
      root.animate(
        feathered
          ? { "--sw-reveal": ["0px", `${radius}px`] }
          : { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        timing,
      );
    })
    .catch(cleanUp);
  transition.finished.finally(cleanUp);
}

export function useAppColorMode() {
  const context = useContext(ColorModeContext);
  if (!context) throw new Error("useAppColorMode must be used inside Providers.");
  return context;
}

/**
 * Light unless the person picks dark. The choice lives in the swm.theme cookie, which the root layout
 * reads to render the right class on <html>; there is no operating-system fallback.
 */
export function Providers({ children, initialColorMode, session }: { children: React.ReactNode; initialColorMode: ColorMode; session?: Session | null }) {
  const mode = useSyncExternalStore<ColorMode>(subscribe, readMode, () => initialColorMode);

  const colorMode = useMemo(() => {
    const setColorMode = (next: ColorMode, origin?: ColorModeOrigin) => {
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${COLOR_MODE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
      const commit = () => {
        // Tokens and React state (icons, labels) change in the same frame.
        applyColorMode(next);
        flushSync(() => window.dispatchEvent(new Event(CHANGE_EVENT)));
      };
      if (next === mode) commit();
      else transitionColorMode(commit, origin);
    };
    return {
      mode,
      setColorMode,
      toggleColorMode: (origin?: ColorModeOrigin) => setColorMode(mode === "dark" ? "light" : "dark", origin),
    };
  }, [mode]);

  return (
    <SessionProvider session={session}>
      <ColorModeContext.Provider value={colorMode}>
        <TooltipProvider delayDuration={300}>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </ColorModeContext.Provider>
    </SessionProvider>
  );
}
