import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";
import { can, spaceAllows } from "@/lib/permissionRoles";
import { machineFileUrl } from "@/lib/machines/fileAccess";
import { readFields, validateSpecs } from "@/lib/machines/fields";
import { isCurrencyCode, toInputValue } from "@/lib/money/currencies";
import { typeWhere } from "@/lib/typeScope";

/** Resolve by both space and slug; foreign, unknown and (for a type manager) out-of-scope machines share the same 404. */
export async function loadMachineView({ params }: { params: Promise<{ spaceSlug: string; machineSlug: string }> }) {
  const { spaceSlug, machineSlug } = await params;
  const { space, membership, typeScope } = await requireSpaceCapability(spaceSlug, "machines.view");
  const row = await prisma.machine.findFirst({ where: { spaceId: space.id, slug: machineSlug, ...typeWhere(typeScope) },
    include: {
      type: { select: { id: true, name: true, icon: true, archivedAt: true, specFields: true, materials: true, colours: true } },
      photos: { where: { spaceId: space.id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      documents: { where: { spaceId: space.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    } });
  if (!row) notFound();
  const profile = await prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true, currency: true } });
  const specFields = readFields(row.type.specFields);
  const stored = row.specs && typeof row.specs === "object" && !Array.isArray(row.specs) ? row.specs : {};
  // Only defined keys reach the UI. The update domain preserves unknown stored keys itself.
  const specs = Object.fromEntries(specFields.filter((field) => Object.hasOwn(stored, field.key)).map((field) => [field.key, stored[field.key]]));
  return {
    space: { ...space, ...profile },
    canManage: can(membership.role, "machines.manage") && spaceAllows(space.status, "machines.manage"),
    canChangeStatus: can(membership.role, "machines.status") && spaceAllows(space.status, "machines.status"),
    canPrinters: can(membership.role, "printers.manage") && spaceAllows(space.status, "printers.manage"),
    canFinance: can(membership.role, "finance.view"),
    type: { id: row.type.id, name: row.type.name, icon: row.type.icon, archived: row.type.archivedAt !== null,
      specFields, materials: row.type.materials, colours: row.type.colours },
    machine: {
      id: row.id, slug: row.slug, name: row.name, status: row.status, statusNote: row.statusNote, retired: row.retiredAt !== null,
      isPublic: row.isPublic, acceptsJobs: row.acceptsJobs,
    },
    details: {
      name: row.name, manufacturer: row.manufacturer, model: row.model, serialNumber: row.serialNumber, location: row.location,
      description: row.description, notes: row.notes, firmwareVersion: row.firmwareVersion,
      acquiredOn: row.acquiredOn?.toISOString().slice(0, 10) ?? null,
      purchaseCost: can(membership.role, "finance.view") && row.purchaseCost !== null && isCurrencyCode(profile.currency) ? toInputValue(row.purchaseCost, profile.currency) : "", specs,
    },
    missingSpecs: validateSpecs(specFields, specs).missing,
    photos: row.photos.map((photo) => ({ id: photo.id, url: machineFileUrl(photo.storageKey), alt: photo.alt })),
    documents: row.documents.map((document) => ({ id: document.id, url: machineFileUrl(document.storageKey), title: document.title,
      kind: document.kind, isPublic: document.isPublic, filename: document.filename, sizeBytes: document.sizeBytes })),
  };
}
