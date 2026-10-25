import { z } from "zod";

/**
 * Field definitions for machine types (spec fields on machines, request fields on jobs) and the validation of
 * the values stored against them. Pure and client-safe: the type editor, the machine form and the server all
 * use these. Changing a type's fields never invalidates stored values: unknown keys are kept but hidden, and a
 * missing required spec only warns.
 */

export const FIELD_KINDS = ["number", "text", "select", "multiselect", "boolean", "dimensions", "material", "colour"] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];
/** Kinds a machine spec may use; material and colour only make sense on a job request. */
export const SPEC_FIELD_KINDS = ["number", "text", "select", "multiselect", "boolean", "dimensions"] as const satisfies readonly FieldKind[];

export const FIELD_KIND_LABELS: Record<FieldKind, string> = {
  number: "Number",
  text: "Text",
  select: "Choose one",
  multiselect: "Choose several",
  boolean: "Yes or no",
  dimensions: "Dimensions",
  material: "Material",
  colour: "Colour",
};

export const MAX_FIELDS = 40;
const FIELD_KEY = /^[a-z][a-z0-9_]{0,39}$/;

const optionSchema = z.string().trim().min(1, "Options can't be empty").max(60, "Keep options under 60 characters");

export const fieldDefinitionSchema = z
  .object({
    key: z.string().trim().regex(FIELD_KEY, "Use lowercase letters, digits and underscores, starting with a letter"),
    label: z.string().trim().min(1, "Give the field a label").max(60, "Keep labels under 60 characters"),
    kind: z.enum(FIELD_KINDS),
    unit: z.string().trim().max(16, "Keep units short").optional(),
    help: z.string().trim().max(160, "Keep help text under 160 characters").optional(),
    options: z.array(optionSchema).max(50, "At most 50 options").optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    required: z.boolean().optional(),
    /** Shown on public machine pages (spec fields only). */
    public: z.boolean().optional(),
  })
  .superRefine((field, ctx) => {
    const needsOptions = field.kind === "select" || field.kind === "multiselect";
    if (needsOptions && !field.options?.length) ctx.addIssue({ code: "custom", path: ["options"], message: "Add at least one option" });
    if (field.options && new Set(field.options.map((o) => o.toLowerCase())).size !== field.options.length) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Options must be different" });
    }
    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
      ctx.addIssue({ code: "custom", path: ["max"], message: "The maximum must be at least the minimum" });
    }
  });

export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;

function fieldListSchema(kinds: readonly FieldKind[]) {
  return z
    .array(fieldDefinitionSchema)
    .max(MAX_FIELDS, `At most ${MAX_FIELDS} fields`)
    .superRefine((fields, ctx) => {
      const seen = new Set<string>();
      fields.forEach((field, index) => {
        if (!kinds.includes(field.kind)) ctx.addIssue({ code: "custom", path: [index, "kind"], message: `${FIELD_KIND_LABELS[field.kind]} fields belong on job requests` });
        if (seen.has(field.key)) ctx.addIssue({ code: "custom", path: [index, "key"], message: "Each field needs its own key" });
        seen.add(field.key);
      });
    });
}

export const specFieldsSchema = fieldListSchema(SPEC_FIELD_KINDS);
export const requestFieldsSchema = fieldListSchema(FIELD_KINDS);

/** Read stored field JSON leniently: anything that doesn't parse is dropped rather than breaking a page. */
export function readFields(value: unknown): FieldDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = fieldDefinitionSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** A label turned into a field key: "Max bed temperature" → "max_bed_temperature". */
export function fieldKeyFromLabel(label: string) {
  const key = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return /^[a-z]/.test(key) ? key : `field_${key}`.slice(0, 40).replace(/_+$/, "");
}

export type Dimensions = { x: number; y: number; z?: number };
export type FieldValue = string | number | boolean | string[] | Dimensions;
export type FieldValues = Record<string, FieldValue>;
/** Materials and colours a request may pick from (the type's lists). */
export type FieldContext = { materials?: readonly string[]; colours?: readonly string[] };

const isBlank = (value: unknown) => value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "" && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value.trim());
  return null;
}

function oneOf(value: string, options: readonly string[]) {
  return options.find((option) => option.toLowerCase() === value.trim().toLowerCase()) ?? null;
}

/** One value checked against its field. Returns the clean value or an error message. */
export function coerceFieldValue(field: FieldDefinition, raw: unknown, context: FieldContext = {}): { value: FieldValue } | { error: string } {
  switch (field.kind) {
    case "number": {
      const value = toNumber(raw);
      if (value === null) return { error: "Enter a number" };
      if (field.min !== undefined && value < field.min) return { error: `Enter at least ${field.min}` };
      if (field.max !== undefined && value > field.max) return { error: `Enter at most ${field.max}` };
      return { value };
    }
    case "text": {
      if (typeof raw !== "string") return { error: "Enter some text" };
      const value = raw.trim();
      return value.length > 500 ? { error: "Keep this under 500 characters" } : { value };
    }
    case "boolean": {
      if (typeof raw === "boolean") return { value: raw };
      if (raw === "true" || raw === "on") return { value: true };
      if (raw === "false" || raw === "off") return { value: false };
      return { error: "Choose yes or no" };
    }
    case "select":
    case "material":
    case "colour": {
      const options = field.kind === "select" ? field.options ?? [] : field.kind === "material" ? context.materials ?? [] : context.colours ?? [];
      if (typeof raw !== "string") return { error: "Choose an option" };
      if (field.kind !== "select" && raw.trim().toLowerCase() === "no preference") return { value: "No preference" };
      // Requests may say "no preference" when the type offers no list.
      if (field.kind !== "select" && options.length === 0) return { value: raw.trim().slice(0, 60) };
      const match = oneOf(raw, options);
      return match ? { value: match } : { error: "Choose one of the listed options" };
    }
    case "multiselect": {
      const items = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : null;
      if (!items || items.some((item) => typeof item !== "string")) return { error: "Choose from the listed options" };
      const matches = (items as string[]).map((item) => oneOf(item, field.options ?? []));
      if (matches.some((item) => item === null)) return { error: "Choose from the listed options" };
      return { value: [...new Set(matches as string[])] };
    }
    case "dimensions": {
      const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
      const x = toNumber(record?.x);
      const y = toNumber(record?.y);
      const z = isBlank(record?.z) ? undefined : toNumber(record?.z);
      if (x === null || y === null || z === null || x <= 0 || y <= 0 || (z !== undefined && z <= 0)) return { error: "Enter positive sizes for each side" };
      return { value: z === undefined ? { x, y } : { x, y, z } };
    }
  }
}

export type ValuesResult = {
  ok: boolean;
  values: FieldValues;
  errors: Record<string, string>;
  /** Required fields left empty; specs save anyway, requests do not. */
  missing: string[];
};

/**
 * Check submitted values against a field list. Blank optional values are dropped. `keep` carries stored keys
 * the fields no longer define (they stay, hidden). With `requireAll`, a missing required field is an error.
 */
export function validateFieldValues(fields: readonly FieldDefinition[], input: unknown, options: FieldContext & { keep?: Record<string, unknown>; requireAll?: boolean } = {}): ValuesResult {
  const data = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const values: FieldValues = {};
  const errors: Record<string, string> = {};
  const missing: string[] = [];
  const known = new Set(fields.map((field) => field.key));
  for (const [key, value] of Object.entries(options.keep ?? {})) {
    if (!known.has(key) && FIELD_KEY.test(key)) values[key] = value as FieldValue;
  }
  for (const field of fields) {
    const raw = data[field.key];
    if (isBlank(raw) || (field.kind === "dimensions" && isBlank((raw as Dimensions | undefined)?.x) && isBlank((raw as Dimensions | undefined)?.y))) {
      if (field.required) {
        missing.push(field.key);
        if (options.requireAll) errors[field.key] = `${field.label} is required`;
      }
      continue;
    }
    const result = coerceFieldValue(field, raw, options);
    if ("error" in result) errors[field.key] = result.error;
    else values[field.key] = result.value;
  }
  return { ok: Object.keys(errors).length === 0, values, errors, missing };
}

/** Stored machine specs against the type's spec fields: specs save with warnings for missing required ones. */
export function validateSpecs(fields: readonly FieldDefinition[], input: unknown, stored: Record<string, unknown> = {}) {
  return validateFieldValues(fields, input, { keep: stored });
}

/** A job's request data against the type's request fields: every required field must be filled. */
export function validateRequestData(fields: readonly FieldDefinition[], input: unknown, context: FieldContext) {
  return validateFieldValues(fields, input, { ...context, requireAll: true });
}

function trimNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

/** Human text for a stored value, e.g. "220 × 220 × 250 mm", "0.4, 0.6 mm", "Yes". */
export function formatFieldValue(field: Pick<FieldDefinition, "kind" | "unit">, value: unknown): string {
  const unit = field.unit ? ` ${field.unit}` : "";
  if (value === undefined || value === null || value === "") return "";
  if (field.kind === "boolean") return value === true ? "Yes" : value === false ? "No" : "";
  if (field.kind === "number" && typeof value === "number") return `${trimNumber(value)}${unit}`;
  if (field.kind === "multiselect" && Array.isArray(value)) return value.length ? `${value.join(", ")}${unit}` : "";
  if (field.kind === "dimensions" && value && typeof value === "object") {
    const d = value as Dimensions;
    return [d.x, d.y, d.z].filter((n): n is number => typeof n === "number").map(trimNumber).join(" × ") + unit;
  }
  return typeof value === "string" ? `${value}${field.kind === "select" ? unit : ""}` : "";
}

/** The spec rows a page shows: defined fields with a value, in field order; `publicOnly` for public pages. */
export function specRows(fields: readonly FieldDefinition[], specs: unknown, publicOnly = false) {
  const values = specs && typeof specs === "object" && !Array.isArray(specs) ? (specs as Record<string, unknown>) : {};
  return fields
    .filter((field) => !publicOnly || field.public)
    .map((field) => ({ key: field.key, label: field.label, value: formatFieldValue(field, values[field.key]) }))
    .filter((row) => row.value !== "");
}
