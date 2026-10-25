// Demo workshop for Tinkerspace: machine types, machines, consumable pools, jobs in every lane, a fault, a
// service record and a warranty, so the dashboards and README screenshots have something real to show.
// Idempotent (keyed by slugs and titles); called from scripts/seed-demo.mjs. Demo data only: it writes rows
// directly, which the app itself never does (jobs, meters and ledgers go through their domain services there).
import crypto from "node:crypto";

const DAY = 86_400_000;
const FDM_FIELDS = [
  { key: "build_volume", label: "Build volume", kind: "text", unit: "mm", public: true },
  { key: "nozzle", label: "Nozzle", kind: "select", options: ["0.4 mm", "0.6 mm"], public: true },
  { key: "enclosure", label: "Enclosure", kind: "boolean", public: true },
];
const LASER_FIELDS = [
  { key: "bed", label: "Bed size", kind: "text", unit: "mm", public: true },
  { key: "power", label: "Power", kind: "number", unit: "W", public: true },
];

async function type(prisma, spaceId, slug, data) {
  return prisma.machineType.upsert({ where: { spaceId_slug: { spaceId, slug } }, create: { spaceId, slug, ...data }, update: { archivedAt: null } });
}

async function machine(prisma, spaceId, slug, data) {
  return prisma.machine.upsert({ where: { spaceId_slug: { spaceId, slug } }, create: { spaceId, slug, ...data }, update: { retiredAt: null } });
}

async function counter(prisma, spaceId, key) {
  return (await prisma.spaceCounter.upsert({ where: { spaceId_key: { spaceId, key } }, create: { spaceId, key, value: 1 }, update: { value: { increment: 1 } } })).value;
}

export async function seedWorkshop(prisma, { space, staff, maker }) {
  const spaceId = space.id;
  const fdm = await type(prisma, spaceId, "fdm-printer", { name: "3D printer (FDM)", icon: "printer", meteringUnit: "MINUTES", consumableUnit: "GRAMS",
    specFields: FDM_FIELDS, materials: ["PLA", "PETG", "TPU"], colours: ["Black", "White", "Orange"], acceptsJobs: true,
    filePolicy: { extensions: ["stl", "3mf", "gcode"], maxBytes: 100 * 1024 * 1024, maxFiles: 10, required: false } });
  const laser = await type(prisma, spaceId, "laser-cutter", { name: "Laser cutter", icon: "zap", meteringUnit: "MINUTES", consumableUnit: "SHEETS",
    specFields: LASER_FIELDS, materials: ["Plywood", "Acrylic", "MDF"], acceptsJobs: true,
    filePolicy: { extensions: ["svg", "dxf", "pdf"], maxBytes: 50 * 1024 * 1024, maxFiles: 5, required: false } });
  const mk4 = await machine(prisma, spaceId, "prusa-mk4", { typeId: fdm.id, name: "Prusa MK4", manufacturer: "Prusa Research", model: "MK4", location: "Print bay",
    isPublic: true, acceptsJobs: true, description: "Our workhorse for PLA and PETG parts.", specs: { build_volume: "250 × 210 × 220", nozzle: "0.4 mm", enclosure: false } });
  const p1s = await machine(prisma, spaceId, "bambu-p1s", { typeId: fdm.id, name: "Bambu Lab P1S", manufacturer: "Bambu Lab", model: "P1S", location: "Print bay",
    isPublic: true, acceptsJobs: true, description: "Enclosed and fast, good for ABS and multi-colour prints.", specs: { build_volume: "256 × 256 × 256", nozzle: "0.4 mm", enclosure: true } });
  const glowforge = await machine(prisma, spaceId, "glowforge-pro", { typeId: laser.id, name: "Glowforge Pro", manufacturer: "Glowforge", model: "Pro", location: "Laser room",
    isPublic: true, acceptsJobs: true, status: "MAINTENANCE", statusNote: "Lid sensor being replaced.", specs: { bed: "495 × 279", power: 45 } });

  for (const pool of [
    { material: "PLA", colour: "Black", colourHex: "#1F2422", brand: "Prusament", unit: "GRAMS", initialQuantity: "1000", remainingQuantity: "640", lowThreshold: "200", costPerUnit: 250, typeId: fdm.id },
    { material: "PETG", colour: "Clear", colourHex: "#DCEAF0", brand: "Prusament", unit: "GRAMS", initialQuantity: "1000", remainingQuantity: "150", lowThreshold: "200", costPerUnit: 280, typeId: fdm.id, lowAlertedAt: new Date() },
    { material: "Plywood", colour: "Natural", colourHex: "#D9B98B", brand: "", unit: "SHEETS", initialQuantity: "20", remainingQuantity: "12", lowThreshold: "4", costPerUnit: 18000, typeId: laser.id },
  ]) {
    if (!await prisma.consumablePool.findFirst({ where: { spaceId, material: pool.material, colour: pool.colour } })) await prisma.consumablePool.create({ data: { spaceId, isPublic: true, ...pool } });
  }

  if (!await prisma.job.findFirst({ where: { spaceId, title: "Phone stand" } })) {
    const now = Date.now();
    const jobs = [
      { title: "Drone frame arms", status: "SUBMITTED", typeId: fdm.id, submittedAt: new Date(now - 2 * 3_600_000) },
      { title: "Enclosure hinge", status: "APPROVED", typeId: fdm.id, quotedAmount: 12000, estimatedMinutes: 95, submittedAt: new Date(now - DAY) },
      { title: "Phone stand", status: "RUNNING", typeId: fdm.id, assignedMachineId: mk4.id, quotedAmount: 8000, estimatedMinutes: 70, progressPercent: 45, submittedAt: new Date(now - DAY), startedAt: new Date(now - 30 * 60_000), startedById: staff.id },
      { title: "Name plate", status: "COMPLETED", typeId: laser.id, assignedMachineId: glowforge.id, quotedAmount: 5000, finalAmount: 5000, actualMinutes: 12, submittedAt: new Date(now - 3 * DAY), startedAt: new Date(now - 2 * DAY), completedAt: new Date(now - 2 * DAY + 20 * 60_000) },
      { title: "Gear set", status: "COLLECTED", typeId: fdm.id, assignedMachineId: p1s.id, quotedAmount: 15000, finalAmount: 14000, actualMinutes: 160, submittedAt: new Date(now - 6 * DAY), startedAt: new Date(now - 5 * DAY), completedAt: new Date(now - 5 * DAY + 3 * 3_600_000), collectedAt: new Date(now - 4 * DAY) },
    ];
    for (const job of jobs) {
      await prisma.job.create({ data: { spaceId, number: await counter(prisma, spaceId, "job"), requesterId: maker.id, audience: "MEMBER", currency: "INR",
        statusToken: crypto.randomBytes(32).toString("hex"), paymentState: job.quotedAmount ? "PENDING" : "NOT_REQUIRED", ...job } });
    }
    await prisma.machine.update({ where: { id: mk4.id }, data: { status: "RUNNING" } });
  }

  if (!await prisma.faultReport.findFirst({ where: { spaceId, machineId: glowforge.id } })) {
    await prisma.faultReport.create({ data: { spaceId, machineId: glowforge.id, number: await counter(prisma, spaceId, "fault"), reportedById: maker.id,
      severity: "HIGH", title: "Lid sensor trips mid-cut", description: "The cut stops with a lid-open error even when the lid is closed." } });
    await prisma.downtime.create({ data: { spaceId, machineId: glowforge.id, reason: "REPAIR", note: "Waiting for the replacement sensor.", startedById: staff.id } });
  }
  if (!await prisma.maintenanceLog.findFirst({ where: { spaceId, machineId: mk4.id } })) {
    await prisma.maintenanceLog.create({ data: { spaceId, machineId: mk4.id, kind: "PREVENTIVE", summary: "Replaced the nozzle and cleaned the bed", cost: 90000,
      vendor: "Prusa Research", performedAt: new Date(Date.now() - 9 * DAY), performedById: staff.id } });
    await prisma.maintenanceSchedule.create({ data: { spaceId, machineId: mk4.id, title: "Lubricate the rails", trigger: "TIME", intervalDays: 30,
      nextDueAt: new Date(Date.now() + 2 * DAY), createdById: staff.id } });
  }
  await prisma.warranty.upsert({ where: { spaceId_machineId: { spaceId, machineId: mk4.id } },
    create: { spaceId, machineId: mk4.id, vendorName: "Prusa Research", contractNumber: "PR-24-1187", coverage: "Parts and labour, two years.",
      startsOn: new Date(Date.now() - 700 * DAY), expiresOn: new Date(Date.now() + 20 * DAY) }, update: {} });
}
