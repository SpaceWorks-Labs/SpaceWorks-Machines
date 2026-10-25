import { z } from "zod";
import { requestFieldsSchema, specFieldsSchema } from "./fields";
import { filePolicySchema } from "./filePolicy";
import { MACHINE_ICON_NAMES } from "./icons";
import { PRESET_KEYS } from "./presets";

/** Inputs for machine types, machines and consumable pools, shared by forms and server actions. Client-safe. */

export const METERING_UNITS = ["MINUTES", "GRAMS", "MILLILITERS", "MILLIMETERS", "SQUARE_CM", "SHEETS", "COUNT"] as const;
export const MACHINE_STATUSES = ["IDLE", "RUNNING", "PAUSED", "RESERVED", "MAINTENANCE", "OFFLINE"] as const;
/** Statuses staff set by hand; RUNNING and PAUSED follow jobs (Phase 3) and printer connections (Phase 5). */
export const MANUAL_MACHINE_STATUSES = ["IDLE", "RESERVED", "MAINTENANCE", "OFFLINE"] as const;
export const DOCUMENT_KINDS = ["MANUAL", "SOP", "SAFETY", "DATASHEET", "OTHER"] as const;

const id = z.string().trim().min(1).max(64);
const shortText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`).default("");
const listItem = z.string().trim().min(1).max(60, "Keep each entry under 60 characters");
const uniqueList = z.array(listItem).max(50, "At most 50 entries").transform((items) => [...new Map(items.map((item) => [item.toLowerCase(), item])).values()]);
const optionalPositiveInt = z.number().int().min(1, "Use 1 or more, or leave it empty").max(10_000).nullable();

export const typeDetailsSchema = z.object({
  name: z.string().trim().min(2, "Name the machine type").max(60, "Keep the name under 60 characters"),
  icon: z.enum(MACHINE_ICON_NAMES as [string, ...string[]]),
  description: shortText(500),
});

export const typeCatalogueSchema = z.object({
  materials: uniqueList,
  colours: uniqueList,
  meteringUnit: z.enum(METERING_UNITS),
  consumableUnit: z.enum(METERING_UNITS).nullable(),
});

export const queueRulesSchema = z.object({
  acceptsJobs: z.boolean(),
  requiresApproval: z.boolean(),
  allocationPolicy: z.enum(["FIRST_IDLE", "STAFF_SELECT"]),
  maxConcurrentJobs: optionalPositiveInt,
  requesterPicksMachine: z.boolean(),
  maxOpenJobsPerRequester: optionalPositiveInt,
});

/** One section of a type is saved at a time; each save is audited with its own before and after. */
export const typeSectionSchema = z.discriminatedUnion("section", [
  z.object({ section: z.literal("details"), values: typeDetailsSchema }),
  z.object({ section: z.literal("specFields"), values: z.object({ specFields: specFieldsSchema }) }),
  z.object({ section: z.literal("requestFields"), values: z.object({ requestFields: requestFieldsSchema }) }),
  z.object({ section: z.literal("filePolicy"), values: z.object({ filePolicy: filePolicySchema }) }),
  z.object({ section: z.literal("catalogue"), values: typeCatalogueSchema }),
  z.object({ section: z.literal("queue"), values: queueRulesSchema }),
]);
export type TypeSection = z.infer<typeof typeSectionSchema>;

export const createTypeSchema = z.object({
  name: typeDetailsSchema.shape.name,
  from: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("blank") }),
    z.object({ kind: z.literal("preset"), presetKey: z.enum(PRESET_KEYS) }),
    z.object({ kind: z.literal("type"), typeId: id }),
  ]),
});

const dateOnly = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a full date").nullable();

export const machineDetailsSchema = z.object({
  name: z.string().trim().min(1, "Name the machine").max(80, "Keep the name under 80 characters"),
  manufacturer: shortText(80),
  model: shortText(80),
  serialNumber: shortText(80),
  location: shortText(120),
  description: shortText(2000),
  notes: shortText(2000),
  firmwareVersion: shortText(60),
  acquiredOn: dateOnly.default(null),
  /** In the space's major units as typed ("1,25,000.50"); converted to minor units on the server. */
  purchaseCost: z.string().trim().max(24).default(""),
  specs: z.record(z.string(), z.unknown()).default({}),
});

export const createMachineSchema = machineDetailsSchema.extend({
  typeId: id,
  isPublic: z.boolean().default(false),
  acceptsJobs: z.boolean().default(true),
});

export const machineStatusSchema = z.object({
  status: z.enum(MANUAL_MACHINE_STATUSES),
  note: shortText(280),
});

const quantity = z.string().trim().regex(/^\d{1,11}(\.\d{1,3})?$/, "Enter a quantity with up to three decimals");
const signedQuantity = z.string().trim().regex(/^-?\d{1,11}(\.\d{1,3})?$/, "Enter a quantity, with a minus sign to take stock out");
const hex = z.string().trim().regex(/^(#[0-9A-Fa-f]{6})?$/, "Pick a colour or leave it empty").transform((value) => value.toUpperCase());

export const poolDetailsSchema = z.object({
  material: z.string().trim().min(1, "Name the material").max(60),
  colour: shortText(40),
  colourHex: hex.default(""),
  brand: shortText(60),
  lotCode: shortText(60),
  lowThreshold: quantity.nullable().default(null),
  /** Major units per unit of stock, for reports. */
  costPerUnit: z.string().trim().max(24).default(""),
  isPublic: z.boolean().default(true),
});

export const createPoolSchema = poolDetailsSchema.extend({
  unit: z.enum(METERING_UNITS),
  initialQuantity: quantity,
  binding: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("machine"), machineId: id }),
    z.object({ kind: z.literal("type"), typeId: id }),
    z.object({ kind: z.literal("shared") }),
  ]),
});

export const restockSchema = z.object({ quantity, reason: shortText(200), lotCode: shortText(60), amount: shortText(32),
  method: z.enum(["CASH", "BANK_TRANSFER", "UPI", "OTHER"]).default("OTHER"), reference: shortText(200), supplier: shortText(200) });
export const correctionSchema = z.object({ delta: signedQuantity, reason: z.string().trim().min(3, "Say why the count changed").max(200) });
export const retirePoolSchema = z.object({ reason: z.string().trim().min(3, "Say why the pool is retired").max(200) });

export const photoMetaSchema = z.object({ alt: shortText(200) });
export const documentMetaSchema = z.object({
  title: z.string().trim().min(1, "Give the document a title").max(120),
  kind: z.enum(DOCUMENT_KINDS),
  isPublic: z.boolean().default(false),
});
