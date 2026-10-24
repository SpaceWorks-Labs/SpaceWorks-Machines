import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";
import { ADAPTERS } from "@/lib/printers/adapters";
import { readPrinterSettings } from "@/lib/printers/connections";
import { simTelemetry, readSimState } from "@/lib/printers/simulated";
import { EMPTY_TELEMETRY, type Telemetry } from "@/lib/printers/types";
import { typeWhere } from "@/lib/typeScope";

/** A machine's printer connection: adapter choice, settings (never the secret), live telemetry and the command log. */
export async function loadMachinePrinterView({ params }: { params: Promise<{ spaceSlug: string; machineSlug: string }> }) {
  const { spaceSlug, machineSlug } = await params;
  const { space, typeScope } = await requireSpaceCapability(spaceSlug, "printers.manage");
  const machine = await prisma.machine.findFirst({ where: { spaceId: space.id, slug: machineSlug, ...typeWhere(typeScope) }, select: { id: true, slug: true, name: true, status: true } });
  if (!machine) notFound();
  const [profile, connection] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true, timezone: true } }),
    prisma.printerConnection.findUnique({ where: { spaceId_machineId: { spaceId: space.id, machineId: machine.id } },
      include: { commands: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, command: true, ok: true, message: true, createdAt: true } } } }),
  ]);
  // The simulator's telemetry is computed for "now", so the page is live between polls.
  const telemetry: Telemetry | null = !connection ? null : connection.adapter === "SIMULATED"
    ? simTelemetry(readSimState(connection.simState), Date.now()) : (connection.telemetry as Telemetry | null) ?? EMPTY_TELEMETRY;
  return {
    space: { ...space, ...profile }, machine,
    adapters: ADAPTERS.map((adapter) => ({ kind: adapter.kind, label: adapter.label, description: adapter.description, available: adapter.available })),
    connection: connection ? { id: connection.id, adapter: connection.adapter, enabled: connection.enabled, baseUrl: connection.baseUrl, deviceId: connection.deviceId,
      hasSecret: Boolean(connection.secretEncrypted), state: connection.state, lastSeenAt: connection.lastSeenAt?.toISOString() ?? null, lastError: connection.lastError,
      settings: readPrinterSettings(connection.settings),
      commands: connection.commands.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) } : null,
    telemetry,
  };
}
