import type { MachineDocumentKind } from "@prisma/client";
import type { FieldDefinition } from "@/lib/machines/fields";

export type MachineTypeOption = {
  id: string; name: string; icon: string; archived: boolean; specFields: FieldDefinition[]; materials: string[]; colours: string[];
};
export type MachineDetailsInput = {
  name: string; manufacturer: string; model: string; serialNumber: string; location: string; description: string;
  notes: string; firmwareVersion: string; acquiredOn: string | null; purchaseCost: string; specs: Record<string, unknown>;
};
export type MachinePhotoRow = { id: string; url: string; alt: string };
export type MachineDocumentRow = {
  id: string; url: string; title: string; kind: MachineDocumentKind; isPublic: boolean; filename: string; sizeBytes: number;
};
export type MachineFileContext = { spaceSlug: string; machineId: string; canManage: boolean };
