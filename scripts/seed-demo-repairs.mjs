// Demo repairs, technicians, to-buy and finance for Tinkerspace (called from seed-demo.mjs). Idempotent.
import crypto from "node:crypto";

const DAY = 86_400_000;

/** Ledger rows the app would have posted for what the demo seed creates directly. */
async function entry(prisma, data) {
  await prisma.financeEntry.upsert({ where: { sourceType_sourceId: { sourceType: data.sourceType, sourceId: data.sourceId } }, create: { id: crypto.randomUUID(), ...data }, update: {} });
}

export async function seedRepairs(prisma, { space, manager, technicianUser }) {
  const spaceId = space.id;
  const currency = space.currency;
  await prisma.spaceMember.upsert({ where: { userId_spaceId: { userId: technicianUser.id, spaceId } }, create: { userId: technicianUser.id, spaceId, role: "TECHNICIAN" }, update: { role: "TECHNICIAN", status: "ACTIVE" } });
  const technician = async (key, data) => (await prisma.technician.findFirst({ where: { spaceId, ...key } }))
    ?? prisma.technician.create({ data: { spaceId, createdById: manager.id, ...key, ...data } });
  const staff = await technician({ userId: technicianUser.id }, { kind: "STAFF", name: technicianUser.name, email: technicianUser.email, skills: ["3d printers", "electrical"] });
  const laserService = await technician({ name: "Kochi Laser Services" }, { kind: "EXTERNAL", email: "service@kochi-laser.demo.test", phone: "+91 484 400 1200",
    whatsapp: "+914844001200", skills: ["laser", "electrical"], preferredChannel: "WHATSAPP", notes: "Glowforge certified. Weekdays only." });
  await technician({ name: "Joseph Varghese" }, { kind: "EXTERNAL", email: "joseph@electrician.demo.test", skills: ["electrical", "ac"], notes: "Wiring and power supplies." });

  const glowforge = await prisma.machine.findFirst({ where: { spaceId, slug: "glowforge-pro" } });
  const mk4 = await prisma.machine.findFirst({ where: { spaceId, slug: "prusa-mk4" } });
  // The workshop seed's lid-sensor fault becomes a repair in progress with an outside technician.
  const fault = glowforge ? await prisma.faultReport.findFirst({ where: { spaceId, machineId: glowforge.id, technicianId: null, status: { in: ["OPEN", "ACKNOWLEDGED"] } } }) : null;
  if (fault) {
    await prisma.faultReport.update({ where: { id: fault.id }, data: { status: "IN_PROGRESS", technicianId: laserService.id,
      fixRemarks: "Replaced the lid sensor; waiting for the part to settle before a test cut.", fixParts: "Lid reed sensor", amountAsked: 450000 } });
    await prisma.repairRequest.createMany({ data: [
      { spaceId, faultId: fault.id, technicianId: laserService.id, status: "ACCEPTED", channels: ["email", "whatsapp"], expiresAt: new Date(Date.now() + 12 * DAY), sentById: manager.id,
        sentAt: new Date(Date.now() - 2 * DAY), respondedAt: new Date(Date.now() - 2 * DAY + 3_600_000) },
      { spaceId, faultId: fault.id, technicianId: staff.id, status: "CLOSED", channels: ["email", "inbox"], expiresAt: new Date(Date.now() + 12 * DAY), sentById: manager.id,
        sentAt: new Date(Date.now() - 2 * DAY), closedReason: "Another technician took it." },
    ] });
    if (!await prisma.toBuyItem.findFirst({ where: { spaceId, number: 1 } })) {
      await prisma.toBuyItem.create({ data: { spaceId, number: 1, kind: "PART", title: "Spare lid reed sensor", quantity: "2", unit: "pieces", machineId: glowforge.id, faultId: fault.id,
        status: "APPROVED", requestedById: technicianUser.id, approvedById: manager.id, note: "Keep one on the shelf." } });
    }
  }
  const petg = await prisma.consumablePool.findFirst({ where: { spaceId, material: "PETG" } });
  if (petg && !await prisma.toBuyItem.findFirst({ where: { spaceId, number: 2 } })) {
    await prisma.toBuyItem.create({ data: { spaceId, number: 2, kind: "CONSUMABLE", title: "Prusament PETG Clear, 1 kg", quantity: "2000", unit: "grams", poolId: petg.id,
      status: "REQUESTED", requestedById: technicianUser.id } });
  }

  // The maintenance record the workshop seed creates with a cost, and a month of other spending.
  const nozzle = mk4 ? await prisma.maintenanceLog.findFirst({ where: { spaceId, machineId: mk4.id, cost: { gt: 0 } } }) : null;
  if (nozzle) await entry(prisma, { spaceId, direction: "OUT", category: "MAINTENANCE", amountMinor: nozzle.cost, currency, method: "OTHER", occurredAt: nozzle.performedAt,
    sourceType: "MaintenanceLog", sourceId: nozzle.id, actorId: nozzle.performedById, note: nozzle.summary, machineId: nozzle.machineId, typeId: mk4.typeId, supplier: nozzle.vendor });
  await entry(prisma, { spaceId, direction: "OUT", category: "OTHER_EXPENSE", amountMinor: 2500000, currency, method: "BANK_TRANSFER", reference: "NEFT-RENT-OCT",
    occurredAt: new Date(Date.now() - 5 * DAY), sourceType: "Manual", sourceId: "demo-rent", actorId: manager.id, note: "Workshop rent", supplier: "Kadavanthra Estates" });
  await entry(prisma, { spaceId, direction: "IN", category: "OTHER_INCOME", amountMinor: 1500000, currency, method: "BANK_TRANSFER", reference: "GRANT-2026",
    occurredAt: new Date(Date.now() - 9 * DAY), sourceType: "Manual", sourceId: "demo-grant", actorId: manager.id, note: "Community makerspace grant" });
}
