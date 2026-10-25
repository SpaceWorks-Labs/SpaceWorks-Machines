import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { prisma } from "@/lib/db";
import { authenticateApiKey, type ApiCaller } from "@/lib/apiKeys";
import type { ApiScope } from "@/lib/apiScopes";
import { can, isStaffRole, type Capability } from "@/lib/permissionRoles";
import { JobGuardError, JobNotFoundError } from "@/lib/jobs";
import { UpkeepError, UpkeepNotFoundError } from "@/lib/upkeep/context";
import { MachineInputError, MachineNotFoundError } from "@/lib/machines/machines";
import { PoolNotFoundError } from "@/lib/consumables/ledger";
import { InsufficientStockError } from "@/lib/consumables/math";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Writes act as the key's creator, who must still be active staff of the space with the capability (and an authenticator). */
async function assertActorCan(caller: ApiCaller, capability: Capability) {
  const member = caller.actorId ? await prisma.spaceMember.findUnique({ where: { userId_spaceId: { userId: caller.actorId, spaceId: caller.spaceId } },
    select: { status: true, role: true, user: { select: { mfaEnabledAt: true } } } }) : null;
  // Keys act space-wide, so a creator who is now a machine type manager (scoped to some types) can't write through one.
  if (!member || member.status !== "ACTIVE" || !isStaffRole(member.role) || member.role === "TYPE_MANAGER" || !member.user.mfaEnabledAt || !can(member.role, capability)) {
    throw new ApiError(403, "The person who created this key can no longer do this. Create a new key.");
  }
  return caller.actorId!;
}

export type ApiContext<P> = { caller: ApiCaller; actorId: string | null; params: P; query: URLSearchParams; body: <T>(schema: ZodType<T>) => Promise<T> };

/** One `/api/v1` route: key, scope and (for writes) the creator's capability, then JSON in and out with stable errors. */
export function apiRoute<P = Record<string, string>>(scope: ApiScope, options: { write?: boolean; capability?: Capability }, run: (context: ApiContext<P>) => Promise<unknown>) {
  return async (request: Request, context: { params: Promise<P> }) => {
    try {
      const caller = await authenticateApiKey(request.headers.get("authorization"), scope, options.write ?? false);
      if ("error" in caller) return json({ error: caller.error }, caller.status);
      const actorId = options.capability ? await assertActorCan(caller, options.capability) : caller.actorId;
      const body = async <T,>(schema: ZodType<T>) => {
        let raw: unknown;
        try { raw = await request.json(); } catch { throw new ApiError(400, "Send a JSON body."); }
        return schema.parse(raw);
      };
      const result = await run({ caller, actorId, params: await context.params, query: new URL(request.url).searchParams, body });
      return json(result, request.method === "POST" ? 201 : 200);
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.message }, error.status);
      if (error instanceof ZodError) return json({ error: "Check the request body.", issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) }, 400);
      if (error instanceof JobNotFoundError || error instanceof UpkeepNotFoundError || error instanceof MachineNotFoundError) return json({ error: "Not found." }, 404);
      if (error instanceof JobGuardError || error instanceof UpkeepError) return json({ error: error.message }, 409);
      if (error instanceof MachineInputError) return json({ error: Object.values(error.fieldErrors)[0]?.[0] ?? error.message }, 400);
      if (error instanceof PoolNotFoundError) return json({ error: "Not found." }, 404);
      if (error instanceof InsufficientStockError) return json({ error: error.message }, 409);
      console.error("[api] request failed");
      return json({ error: "The request failed. Try again." }, 500);
    }
  };
}

/** Cursor pagination over ids: `?limit=` (1–100, default 50) and `?cursor=` (the previous page's nextCursor). */
export function page(query: URLSearchParams) {
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.get("limit") ?? "50", 10) || 50));
  const cursor = query.get("cursor");
  return { take: limit + 1, orderBy: { id: "asc" as const }, ...(cursor ? { cursor: { id: cursor.slice(0, 64) }, skip: 1 } : {}) };
}

export function paged<T extends { id: string }>(rows: T[], query: URLSearchParams) {
  const limit = page(query).take - 1;
  const items = rows.slice(0, limit);
  return { data: items, nextCursor: rows.length > limit ? items.at(-1)!.id : null };
}
