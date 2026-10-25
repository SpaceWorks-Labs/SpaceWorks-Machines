import {
  Axe, Box, Boxes, Brush, Cable, CircuitBoard, Cog, Cpu, Cuboid, Drill, Droplets, Factory, Fan, Flame, FlaskConical, Gauge, Hammer,
  Layers, Lightbulb, Magnet, Microchip, Package, PencilRuler, PenTool, Printer, Ruler, Scissors, Shapes, Shirt, Sparkles, SprayCan,
  Thermometer, ToyBrick, Wrench, Zap, type LucideIcon,
} from "lucide-react";

/**
 * The icons a machine type may use: a machine-flavoured subset of lucide, stored by name on
 * `MachineType.icon`. Anything else falls back to the wrench. Client-safe.
 */
export const MACHINE_ICONS = {
  printer: { icon: Printer, label: "Printer" },
  layers: { icon: Layers, label: "Layers" },
  droplets: { icon: Droplets, label: "Resin" },
  zap: { icon: Zap, label: "Laser" },
  flame: { icon: Flame, label: "Heat" },
  drill: { icon: Drill, label: "Drill" },
  cog: { icon: Cog, label: "Cog" },
  scissors: { icon: Scissors, label: "Cutter" },
  "circuit-board": { icon: CircuitBoard, label: "Circuit board" },
  microchip: { icon: Microchip, label: "Chip" },
  cpu: { icon: Cpu, label: "Electronics" },
  cable: { icon: Cable, label: "Cable" },
  thermometer: { icon: Thermometer, label: "Thermometer" },
  wrench: { icon: Wrench, label: "Wrench" },
  hammer: { icon: Hammer, label: "Hammer" },
  axe: { icon: Axe, label: "Woodwork" },
  ruler: { icon: Ruler, label: "Ruler" },
  "pencil-ruler": { icon: PencilRuler, label: "Drafting" },
  "pen-tool": { icon: PenTool, label: "Plotter" },
  brush: { icon: Brush, label: "Finishing" },
  "spray-can": { icon: SprayCan, label: "Spray" },
  shirt: { icon: Shirt, label: "Textiles" },
  fan: { icon: Fan, label: "Extraction" },
  gauge: { icon: Gauge, label: "Gauge" },
  magnet: { icon: Magnet, label: "Magnet" },
  "flask-conical": { icon: FlaskConical, label: "Lab" },
  lightbulb: { icon: Lightbulb, label: "Lighting" },
  box: { icon: Box, label: "Box" },
  boxes: { icon: Boxes, label: "Boxes" },
  cuboid: { icon: Cuboid, label: "Block" },
  shapes: { icon: Shapes, label: "Shapes" },
  "toy-brick": { icon: ToyBrick, label: "Moulding" },
  package: { icon: Package, label: "Package" },
  factory: { icon: Factory, label: "Factory" },
  sparkles: { icon: Sparkles, label: "Other" },
} as const satisfies Record<string, { icon: LucideIcon; label: string }>;

export type MachineIconName = keyof typeof MACHINE_ICONS;
export const MACHINE_ICON_NAMES = Object.keys(MACHINE_ICONS) as MachineIconName[];
export const DEFAULT_MACHINE_ICON: MachineIconName = "wrench";

export function isMachineIconName(value: unknown): value is MachineIconName {
  return typeof value === "string" && Object.hasOwn(MACHINE_ICONS, value);
}

export function machineIcon(name: string | null | undefined): LucideIcon {
  return isMachineIconName(name) ? MACHINE_ICONS[name].icon : MACHINE_ICONS[DEFAULT_MACHINE_ICON].icon;
}
