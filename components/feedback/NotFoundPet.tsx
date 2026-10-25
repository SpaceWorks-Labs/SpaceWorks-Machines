"use client";

import { useCallback, useEffect, useRef } from "react";
import { PAW_STRIDE, PET_EDGE, SLEEP_AFTER_MS, WANDER_AFTER_MS, petMaxX, petStart, petStride, petTarget, type PetFacing, type PetState } from "@/lib/patch/pet";

/**
 * Patch, the Space Works mascot, trotting along the bottom of the 404 page (ported from
 * SpaceWorks-Events). Patch runs toward the pointer (or a tap on touch screens), leaves fading paw
 * prints, wanders and naps when ignored, and closes its eyes happily and sends up hearts when patted.
 *
 * The artwork is the design system's walk cycle, eight frames per direction in one sprite sheet each
 * under `public/brand/patch/`. Patch is never flipped or redrawn here: heading left uses the approved
 * left-facing sheet. Purely decorative: hidden from assistive tech and click-through (it never blocks
 * page controls), and it sits still for reduced-motion users.
 */
export function NotFoundPet() {
  const layerRef = useRef<HTMLDivElement>(null);
  const petRef = useRef<HTMLDivElement>(null);

  const pat = useCallback(() => {
    const pet = petRef.current;
    if (!pet || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    pet.dataset.happy = "true";
    for (let i = 0; i < 3; i++) {
      const heart = document.createElement("span");
      heart.className = "sw-pet-heart";
      heart.style.left = `${30 + i * 14}%`;
      heart.style.animationDelay = `${i * 120}ms`;
      pet.appendChild(heart);
      window.setTimeout(() => heart.remove(), 1400);
    }
    window.setTimeout(() => {
      if (petRef.current) delete petRef.current.dataset.happy;
    }, 1400);
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    const pet = petRef.current;
    if (!layer || !pet) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const petWidth = () => pet.offsetWidth || 88;
    const maxX = () => petMaxX(window.innerWidth, petWidth());
    const start = petStart(reduceMotion, window.innerWidth, petWidth());
    let x = start.x;
    let target = x;
    let state: PetState = start.state;
    let lastInput = performance.now();
    let nextWander = 0;
    let hop = 0; // 0..1 progress of a hop arc
    let hopping = false;
    let stepDistance = 0;
    let frame = 0;

    const setState = (next: PetState) => {
      if (state === next) return;
      state = next;
      pet.dataset.state = next;
    };
    const face = (direction: PetFacing) => {
      if (pet.dataset.facing !== direction) pet.dataset.facing = direction;
    };

    const render = () => {
      const lift = hopping ? Math.sin(hop * Math.PI) * 46 : 0;
      pet.style.transform = `translate3d(${x}px, ${-lift}px, 0)`;
    };

    const dropPaw = () => {
      const paw = document.createElement("span");
      paw.className = "sw-pet-paw";
      paw.style.left = `${x + petWidth() / 2 + (Math.random() * 10 - 5)}px`;
      paw.style.transform = `rotate(${pet.dataset.facing === "left" ? -90 : 90}deg)`;
      layer.appendChild(paw);
      window.setTimeout(() => paw.remove(), 1800);
    };

    const goTo = (clientX: number, withHop = false) => {
      lastInput = performance.now();
      target = petTarget(clientX, window.innerWidth, petWidth());
      if (withHop && !hopping) {
        hopping = true;
        hop = 0;
      }
      if (state === "sleep") setState("sit");
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || event.buttons > 0) goTo(event.clientX);
      else lastInput = performance.now();
    };
    const onPointerDown = (event: PointerEvent) => {
      // The layer is click-through, so detect a pat by position instead of a click handler.
      const bounds = pet.getBoundingClientRect();
      if (event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top - 8 && event.clientY <= bounds.bottom) {
        lastInput = performance.now();
        if (state === "sleep") setState("sit");
        pat();
        return;
      }
      goTo(event.clientX, true);
    };
    const onResize = () => {
      x = Math.min(x, maxX());
      target = Math.min(target, maxX());
      render();
    };

    pet.dataset.state = state;
    face(start.facing);
    render();
    window.addEventListener("resize", onResize);
    if (reduceMotion) return () => window.removeEventListener("resize", onResize);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });

    let previous = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(48, now - previous) / 16.67; // frames at 60fps
      previous = now;
      const idleFor = now - lastInput;

      if (idleFor > SLEEP_AFTER_MS && Math.abs(target - x) < 2) {
        setState("sleep");
      } else if (idleFor > WANDER_AFTER_MS && now > nextWander && state !== "sleep") {
        target = PET_EDGE + Math.random() * (maxX() - PET_EDGE);
        nextWander = now + 3_000 + Math.random() * 3_500;
      }

      const dx = target - x;
      if (state !== "sleep") {
        const stride = petStride(dx, dt);
        x += stride.move;
        if (stride.move) face(dx > 0 ? "right" : "left");
        setState(stride.state);
        stepDistance += Math.abs(stride.move);
        if (stepDistance > PAW_STRIDE) {
          stepDistance = 0;
          dropPaw();
        }
      }

      if (hopping) {
        hop += 0.045 * dt;
        if (hop >= 1) {
          hopping = false;
          hop = 0;
        }
      }
      render();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [pat]);

  return (
    <div ref={layerRef} aria-hidden className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      <div ref={petRef} className="sw-pet absolute bottom-1 left-0 w-[88px] select-none sm:bottom-2 sm:w-[104px]">
        <span className="sw-pet-zzz">z</span>
        <span className="sw-pet-zzz">z</span>
        <div className="sw-pet-sprite" />
      </div>
    </div>
  );
}
