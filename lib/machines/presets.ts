import type { AllocationPolicy, MeteringUnit } from "@prisma/client";
import type { FieldDefinition } from "./fields";
import { DEFAULT_FILE_POLICY, MB, type FilePolicy } from "./filePolicy";
import type { MachineIconName } from "./icons";

/**
 * Built-in machine types. Every new space gets a copy of each (lib/machines/provision.ts), which machine
 * managers then edit freely; a preset is only a starting point. Client-safe: the type editor offers
 * "Start from a preset" from this list.
 */

export const PRESET_KEYS = ["fdm_printer", "resin_printer", "laser_cutter", "cnc_router", "cnc_mill", "vinyl_cutter", "pcb_mill", "soldering_station", "other"] as const;
export type PresetKey = (typeof PRESET_KEYS)[number];

export type QueueRules = {
  acceptsJobs: boolean;
  requiresApproval: boolean;
  allocationPolicy: AllocationPolicy;
  maxConcurrentJobs: number | null;
  requesterPicksMachine: boolean;
  maxOpenJobsPerRequester: number | null;
};

export type MachineTypePreset = {
  key: PresetKey;
  slug: string;
  name: string;
  icon: MachineIconName;
  description: string;
  meteringUnit: MeteringUnit;
  /** Null: the type uses no consumable pools. */
  consumableUnit: MeteringUnit | null;
  specFields: FieldDefinition[];
  requestFields: FieldDefinition[];
  filePolicy: FilePolicy;
  materials: string[];
  colours: string[];
  queue: QueueRules;
};

export const DEFAULT_QUEUE_RULES: QueueRules = {
  acceptsJobs: true,
  requiresApproval: true,
  allocationPolicy: "STAFF_SELECT",
  maxConcurrentJobs: null,
  requesterPicksMachine: false,
  maxOpenJobsPerRequester: null,
};

type Extra = Partial<Pick<FieldDefinition, "unit" | "help" | "min" | "max" | "required" | "public">>;
const num = (key: string, label: string, extra: Extra = {}): FieldDefinition => ({ key, label, kind: "number", min: 0, ...extra });
const text = (key: string, label: string, extra: Extra = {}): FieldDefinition => ({ key, label, kind: "text", ...extra });
const yesNo = (key: string, label: string, extra: Extra = {}): FieldDefinition => ({ key, label, kind: "boolean", ...extra });
const dims = (key: string, label: string, extra: Extra = {}): FieldDefinition => ({ key, label, kind: "dimensions", unit: "mm", ...extra });
const pick = (key: string, label: string, options: string[], extra: Extra = {}): FieldDefinition => ({ key, label, kind: "select", options, ...extra });
const many = (key: string, label: string, options: string[], extra: Extra = {}): FieldDefinition => ({ key, label, kind: "multiselect", options, ...extra });
const material = (required = true): FieldDefinition => ({ key: "material", label: "Material", kind: "material", required });
const colour = (): FieldDefinition => ({ key: "colour", label: "Colour", kind: "colour" });
const files = (extensions: string[], megabytes: number, maxFiles: number, required: boolean): FilePolicy => ({ extensions, maxBytes: megabytes * MB, maxFiles, required });
const shown = { public: true } as const;

const BASIC_COLOURS = ["Black", "White", "Grey", "Red", "Blue", "Green", "Yellow", "Orange", "Clear"];
const CNC_FILES = ["dxf", "svg", "step", "stp", "stl", "nc", "gcode", "tap", "crv"];
const cncSpecs = (axes: string[]) => [
  dims("work_area", "Work area", { required: true, ...shown }),
  num("spindle_power", "Spindle power", { unit: "W", ...shown }),
  num("max_rpm", "Maximum spindle speed", { unit: "RPM", ...shown }),
  pick("axes", "Axes", axes, shown),
  many("collet_sizes", "Collet sizes", ["3.175 mm", "6 mm", "6.35 mm", "8 mm", "12 mm"]),
];

export const MACHINE_TYPE_PRESETS: readonly MachineTypePreset[] = [
  {
    key: "fdm_printer", slug: "fdm-printer", name: "3D printer (FDM)", icon: "layers",
    description: "Prints parts layer by layer from plastic filament.",
    meteringUnit: "MINUTES", consumableUnit: "GRAMS",
    specFields: [
      dims("build_volume", "Build volume", { required: true, ...shown }),
      many("nozzle_sizes", "Nozzle sizes", ["0.2", "0.4", "0.6", "0.8"], { unit: "mm", ...shown }),
      num("max_nozzle_temp", "Maximum nozzle temperature", { unit: "°C", ...shown }),
      num("max_bed_temp", "Maximum bed temperature", { unit: "°C", ...shown }),
      yesNo("heated_bed", "Heated bed", shown),
      yesNo("enclosure", "Enclosure", shown),
      num("multi_material_units", "Multi-material units", { help: "Extra spools the printer can switch between, like an AMS or MMU." }),
      pick("firmware", "Firmware", ["Marlin", "Klipper", "Bambu", "Prusa", "Other"]),
    ],
    requestFields: [
      material(),
      colour(),
      pick("layer_height", "Layer height", ["0.1 mm", "0.15 mm", "0.2 mm", "0.28 mm"], { help: "Thinner layers look smoother and take longer." }),
      num("infill", "Infill", { unit: "%", min: 0, max: 100 }),
      yesNo("supports", "Supports"),
    ],
    filePolicy: files(["stl", "3mf", "obj", "step", "stp", "gcode", "gco", "bgcode"], 100, 10, true),
    materials: ["PLA", "PETG", "ABS", "ASA", "TPU", "Nylon"],
    colours: BASIC_COLOURS,
    queue: DEFAULT_QUEUE_RULES,
  },
  {
    key: "resin_printer", slug: "resin-printer", name: "3D printer (resin)", icon: "droplets",
    description: "Cures liquid resin into fine, detailed parts.",
    meteringUnit: "MINUTES", consumableUnit: "MILLILITERS",
    specFields: [
      dims("build_volume", "Build volume", { required: true, ...shown }),
      num("xy_resolution", "XY resolution", { unit: "µm", ...shown }),
      num("min_layer_height", "Thinnest layer", { unit: "µm", ...shown }),
      num("max_layer_height", "Thickest layer", { unit: "µm", ...shown }),
    ],
    requestFields: [
      material(),
      colour(),
      pick("layer_height", "Layer height", ["25 µm", "50 µm", "100 µm"]),
      yesNo("supports", "Supports"),
      yesNo("hollow", "Hollow the model"),
    ],
    filePolicy: files(["stl", "3mf", "obj", "ctb", "sl1", "sl1s"], 100, 10, true),
    materials: ["Standard", "Tough", "Flexible", "Castable", "Water-washable"],
    colours: ["Grey", "Black", "White", "Clear", "Beige"],
    queue: DEFAULT_QUEUE_RULES,
  },
  {
    key: "laser_cutter", slug: "laser-cutter", name: "Laser cutter", icon: "zap",
    description: "Cuts and engraves sheet materials with a laser.",
    meteringUnit: "MINUTES", consumableUnit: "SHEETS",
    specFields: [
      dims("bed_size", "Bed size", { required: true, ...shown }),
      num("power", "Laser power", { unit: "W", ...shown }),
      pick("laser_kind", "Laser kind", ["CO2", "Diode", "Fibre"], shown),
      num("max_thickness", "Thickest material it cuts", { unit: "mm", ...shown }),
      yesNo("rotary", "Rotary attachment", shown),
      yesNo("air_assist", "Air assist"),
    ],
    requestFields: [
      material(),
      num("thickness", "Material thickness", { unit: "mm", required: true }),
      many("operation", "Operation", ["Cut", "Engrave", "Score"], { required: true }),
    ],
    filePolicy: files(["svg", "dxf", "pdf", "ai", "eps", "png", "jpg", "lbrn", "lbrn2"], 50, 10, true),
    materials: ["Plywood", "MDF", "Acrylic", "Cardboard", "Leather", "Paper", "Fabric"],
    colours: [],
    queue: DEFAULT_QUEUE_RULES,
  },
  {
    key: "cnc_router", slug: "cnc-router", name: "CNC router", icon: "drill",
    description: "Carves wood, plastics and soft metals from large sheets.",
    meteringUnit: "MINUTES", consumableUnit: "SHEETS",
    specFields: cncSpecs(["3", "4", "5"]),
    requestFields: [material(), num("thickness", "Material thickness", { unit: "mm" }), many("operation", "Operation", ["Cut out", "Pocket", "Engrave", "Drill", "3D carve"])],
    filePolicy: files(CNC_FILES, 100, 10, true),
    materials: ["Plywood", "MDF", "Hardwood", "Acrylic", "HDPE", "Aluminium"],
    colours: [],
    queue: DEFAULT_QUEUE_RULES,
  },
  {
    key: "cnc_mill", slug: "cnc-mill", name: "CNC mill", icon: "cog",
    description: "Machines precise parts from metal and engineering plastics.",
    meteringUnit: "MINUTES", consumableUnit: "SHEETS",
    specFields: cncSpecs(["3", "4", "5"]),
    requestFields: [material(), many("operation", "Operation", ["Face", "Pocket", "Contour", "Drill", "3D surface"])],
    filePolicy: files(CNC_FILES, 100, 10, true),
    materials: ["Aluminium", "Brass", "Mild steel", "Delrin", "HDPE", "Machining wax"],
    colours: [],
    queue: DEFAULT_QUEUE_RULES,
  },
  {
    key: "vinyl_cutter", slug: "vinyl-cutter", name: "Vinyl cutter", icon: "scissors",
    description: "Cuts stickers, stencils and heat-transfer designs from rolls.",
    meteringUnit: "MINUTES", consumableUnit: "MILLIMETERS",
    specFields: [num("cutting_width", "Cutting width", { unit: "mm", required: true, ...shown }), num("max_force", "Maximum cutting force", { unit: "g", ...shown })],
    requestFields: [material(), colour(), num("length", "Length of material", { unit: "mm" })],
    filePolicy: files(["svg", "dxf", "pdf", "eps", "studio3"], 50, 10, true),
    materials: ["Vinyl", "Heat transfer vinyl", "Paper", "Stencil film"],
    colours: ["Black", "White", "Red", "Blue", "Green", "Yellow", "Gold", "Silver"],
    queue: DEFAULT_QUEUE_RULES,
  },
  {
    key: "pcb_mill", slug: "pcb-mill", name: "PCB mill", icon: "circuit-board",
    description: "Mills circuit boards straight from Gerber files.",
    meteringUnit: "MINUTES", consumableUnit: "SHEETS",
    specFields: [
      dims("work_area", "Work area", { required: true, ...shown }),
      num("min_trace_width", "Finest trace", { unit: "mm", ...shown }),
      many("tool_sizes", "Tool sizes", ["0.1 mm V-bit", "0.2 mm V-bit", "0.8 mm end mill", "1.0 mm drill", "1.5 mm end mill"]),
    ],
    requestFields: [material(), pick("sides", "Sides", ["Single-sided", "Double-sided"], { required: true })],
    filePolicy: files(["gbr", "gerber", "drl", "zip", "nc", "gcode"], 50, 20, true),
    materials: ["FR1", "FR4 single-sided", "FR4 double-sided"],
    colours: [],
    queue: DEFAULT_QUEUE_RULES,
  },
  {
    key: "soldering_station", slug: "soldering-station", name: "Soldering station", icon: "thermometer",
    description: "Irons, hot air and reflow for electronics work.",
    meteringUnit: "MINUTES", consumableUnit: null,
    specFields: [
      num("min_temp", "Lowest temperature", { unit: "°C", ...shown }),
      num("max_temp", "Highest temperature", { unit: "°C", ...shown }),
      num("power", "Power", { unit: "W", ...shown }),
      pick("station_kind", "Station kind", ["Iron", "Hot air", "Rework", "Reflow oven"], { required: true, ...shown }),
    ],
    requestFields: [],
    filePolicy: files(["pdf", "png", "jpg"], 20, 5, false),
    materials: [],
    colours: [],
    // Usually walk-up benches, so job requests start switched off.
    queue: { ...DEFAULT_QUEUE_RULES, acceptsJobs: false },
  },
  {
    key: "other", slug: "other", name: "Other", icon: "wrench",
    description: "Anything else in the space.",
    meteringUnit: "MINUTES", consumableUnit: null,
    specFields: [],
    requestFields: [],
    filePolicy: DEFAULT_FILE_POLICY,
    materials: [],
    colours: [],
    queue: DEFAULT_QUEUE_RULES,
  },
];

export function presetByKey(key: string | null | undefined): MachineTypePreset | null {
  return MACHINE_TYPE_PRESETS.find((preset) => preset.key === key) ?? null;
}

export const METERING_UNIT_LABELS: Record<MeteringUnit, { label: string; short: string }> = {
  MINUTES: { label: "Minutes", short: "min" },
  GRAMS: { label: "Grams", short: "g" },
  MILLILITERS: { label: "Millilitres", short: "ml" },
  MILLIMETERS: { label: "Millimetres", short: "mm" },
  SQUARE_CM: { label: "Square centimetres", short: "cm²" },
  SHEETS: { label: "Sheets", short: "sheets" },
  COUNT: { label: "Pieces", short: "pcs" },
};
