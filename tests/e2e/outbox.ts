import { PrismaClient } from "@prisma/client";

/**
 * The e2e server never delivers email (no worker runs and JOBS_INPROCESS is off), so queued messages stay in
 * the outbox table, where the tests read sign-in links, verification links and invites. Point DATABASE_URL at
 * the same disposable database the server uses.
 */
export const db = new PrismaClient();

export async function latestPayload(kind: string, to: string): Promise<Record<string, string>> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const [row] = await db.$queryRaw<Array<{ payload: Record<string, string> }>>`
      SELECT "payload" FROM "OutboxMessage" WHERE "kind" = ${kind} AND "payload"->>'to' = ${to} ORDER BY "createdAt" DESC LIMIT 1`;
    if (row) return row.payload;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No ${kind} email for ${to}.`);
}

/** The path and query of an absolute link from an email, so it opens on the test server's own origin. */
export function localPath(url: string) {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}
