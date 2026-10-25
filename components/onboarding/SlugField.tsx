"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { checkSpaceSlug } from "@/app/actions/space-application";
import { Field, PrefixInput } from "@/components/ui/field";

/** Host and path shown before the address. Inlined at build time, so server and client agree. */
const PUBLIC_PREFIX = `${(process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "")}/s/`;

type State = { status: "idle" | "checking" | "available" | "taken"; reason?: string };

/** Lowercase letters, digits and single hyphens, as people type. */
export function cleanSlug(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-").slice(0, 64);
}

/** Suggest an address from a name: "Kochi Makers' Lab" → "kochi-makers-lab". */
export function slugFromName(name: string) {
  return cleanSlug(name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").replace(/[^a-zA-Z0-9]+/g, "-")).replace(/^-+|-+$/g, "");
}

/** The space's public web address, checked as the person types. */
export function SlugField({ value, onChange, serverError, disabled }: { value: string; onChange: (slug: string) => void; serverError?: string; disabled?: boolean }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [checked, setChecked] = useState("");

  useEffect(() => {
    const slug = value.replace(/-+$/, "");
    if (slug.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await checkSpaceSlug(slug);
        if (cancelled) return;
        setChecked(slug);
        if (!result.ok) setState({ status: "idle" });
        else setState(result.data?.available ? { status: "available" } : { status: "taken", reason: result.data?.reason });
      } catch {
        if (!cancelled) setState({ status: "idle" });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  const current = value.replace(/-+$/, "");
  const fresh = checked === current;
  const status = current.length < 2 ? "idle" : fresh ? state.status : "checking";
  const error = serverError ?? (status === "taken" ? state.reason ?? "That web address can't be used" : undefined);
  const helper =
    status === "checking" ? "Checking…"
      : status === "available" ? (
        <span className="inline-flex items-center gap-1 font-semibold text-success-fg">
          <Check aria-hidden className="size-3.5" />
          Available
        </span>
      )
        : "Your public page and join link. Lowercase letters, numbers and hyphens.";

  return (
    <Field label="Web address" required error={error ? <span className="inline-flex items-center gap-1"><X aria-hidden className="size-3.5" />{error}</span> : undefined} helperText={helper}>
      <PrefixInput
        prefix={PUBLIC_PREFIX}
        name="slug"
        value={value}
        onChange={(event) => onChange(cleanSlug(event.target.value))}
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        minLength={2}
        maxLength={64}
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
        disabled={disabled}
        aria-live="off"
      />
    </Field>
  );
}

