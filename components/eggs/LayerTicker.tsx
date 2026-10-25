"use client";

import { useEffect, useState } from "react";
import { Patch } from "@/components/brand/Patch";
import { layersFor, TICKER_LAYERS } from "@/lib/patch/eggs";

/**
 * Easter egg: on a finished job, Patch watches the print build up one layer at a time. Decorative only
 * (aria-hidden, never in the way of a control); under reduced motion the stack is simply complete.
 */
export function LayerTicker() {
  const [layers, setLayers] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const done = window.setTimeout(() => setLayers(TICKER_LAYERS), 0);
      return () => window.clearTimeout(done);
    }
    let step = 0;
    const timer = window.setInterval(() => {
      step += 1;
      setLayers(layersFor((step / TICKER_LAYERS) * 100));
      if (step >= TICKER_LAYERS) window.clearInterval(timer);
    }, 160);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div aria-hidden className="pointer-events-none flex items-end gap-3" data-egg="layer-ticker">
      <Patch pose="idle" size={64} />
      <div className="flex w-16 flex-col-reverse gap-[2px] pb-3">
        {Array.from({ length: TICKER_LAYERS }, (_, index) => (
          <span key={index} className={`h-[3px] rounded-full transition-opacity duration-150 ${index < layers ? "bg-primary opacity-100" : "bg-line opacity-60"}`}
            style={{ marginInline: `${Math.abs(index - TICKER_LAYERS / 2) * 0.6}px` }} />
        ))}
      </div>
    </div>
  );
}
