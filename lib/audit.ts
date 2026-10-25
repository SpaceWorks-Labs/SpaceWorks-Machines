import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Write a deliberately minimal audit record. Callers must not pass PII,
 * passwords, reset links, check-in tokens, or registration answers in metadata.
 */
export async function recordAuditEvent(params: {
  action: string;
  actorUserId?: string | null;
  spaceId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, string | number | boolean | null>;
  client?: Prisma.TransactionClient;
}) {
  const client = params.client ?? prisma;
  return client.auditEvent.create({
    data: {
      action: params.action,
      actorUserId: params.actorUserId ?? null,
      spaceId: params.spaceId ?? null,
      targetType: params.targetType ?? null,
      targetId: params.targetId ?? null,
      metadata: params.metadata ?? undefined,
    },
  });
}

/**
 * For autosaving editors: record the event unless the same actor already has
 * one for the same action and target within `windowMs`.
 */
export async function recordThrottledAuditEvent(params: Parameters<typeof recordAuditEvent>[0] & { windowMs: number }) {
  const { windowMs, ...event } = params;
  const recent = await (event.client ?? prisma).auditEvent.findFirst({
    where: {
      action: event.action,
      actorUserId: event.actorUserId ?? null,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      createdAt: { gt: new Date(Date.now() - windowMs) },
    },
    select: { id: true },
  });
  if (recent) return null;
  return recordAuditEvent(event);
}

/** Field names whose values differ between two settings snapshots (JSON equality, so arrays and objects compare by value). */
export function changedSettingFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null));
}

const MAX_CHANGES_LENGTH = 4000;

/**
 * Every settings change in a space writes one of these, inside the change's transaction when there is one.
 * `area` names the settings page ("space.profile", "space.payments", "machine.queue"...). Pass either `fields`
 * (the names that changed, for areas holding secrets) or `before` and `after` snapshots of non-secret values:
 * then only the changed fields are recorded, each with its old and new value, and nothing is written when
 * nothing changed. Never put secrets or personal data in a snapshot.
 */
export async function recordSettingsChange(params: {
  spaceId: string;
  actorUserId: string;
  area: string;
  fields?: readonly string[];
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  targetType?: string;
  targetId?: string;
  client?: Prisma.TransactionClient;
}) {
  let fields = params.fields ?? [];
  let changes: string | undefined;
  if (params.before && params.after) {
    fields = changedSettingFields(params.before, params.after);
    if (fields.length === 0) return null;
    const diff = Object.fromEntries(fields.map((field) => [field, { before: params.before![field] ?? null, after: params.after![field] ?? null }]));
    changes = JSON.stringify(diff);
    if (changes.length > MAX_CHANGES_LENGTH) changes = JSON.stringify({ truncated: true, fields });
  }
  return recordAuditEvent({
    action: "SPACE_SETTINGS_CHANGED",
    actorUserId: params.actorUserId,
    spaceId: params.spaceId,
    targetType: params.targetType ?? "Space",
    targetId: params.targetId ?? params.spaceId,
    metadata: { area: params.area, ...(fields.length ? { fields: fields.slice(0, 20).join(",") } : {}), ...(changes ? { changes } : {}) },
    client: params.client,
  });
}
