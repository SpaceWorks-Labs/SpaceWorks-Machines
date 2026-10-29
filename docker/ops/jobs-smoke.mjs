// Real SQL -> Redis/BullMQ -> authenticated STARTTLS delivery, fixture deployment only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";

assert.equal(process.env.SWM_RECOVERY_SMOKE, "1", "Explicit disposable deployment required");
const db = new PrismaClient();
const recipients = ["verify", "reset", "magic"].map((kind) => `${kind}-${randomUUID()}@example.test`);
const expiresAt = new Date(Date.now() + 600_000).toISOString();
const base = process.env.NEXT_PUBLIC_BASE_URL;
const ids = [];
async function relay() {
  const result = await fetch("http://backend:3000/api/internal/outbox", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(10_000),
  });
  await result.body?.cancel();
  assert.ok(result.ok, "The real internal relay must accept its secret");
}
async function captured() {
  const response = await fetch("http://mailpit:8025/api/v1/messages", { signal: AbortSignal.timeout(3_000) });
  assert.ok(response.ok);
  const body = await response.json();
  return recipients.map((recipient) => body.messages.filter((message) => message.To?.some((to) => to.Address === recipient)).length);
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { await captured(); ready = true; break; } catch { await delay(200); }
  }
  assert.ok(ready, "SMTP capture must be ready");
  const payloads = [
    { kind: "email-verification", payload: { to: recipients[0], verificationUrl: `${base}/verify-email?token=fixture`, expiresAt } },
    { kind: "password-reset", payload: { to: recipients[1], resetUrl: `${base}/reset-password?token=fixture`, expiresAt } },
    { kind: "magic-link", payload: { to: recipients[2], url: `${base}/api/auth/callback/nodemailer?token=fixture`, expiresAt } },
  ];
  for (const data of payloads) ids.push((await db.outboxMessage.create({ data })).id);
  await relay();
  let delivered = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    if ((await captured()).every((count) => count === 1) && await db.outboxMessage.count({ where: { id: { in: ids } } }) === 0) {
      delivered = true; break;
    }
    await delay(300);
  }
  assert.ok(delivered, "Real workers must capture all three messages and delete their bearer payloads");
  await relay();
  await delay(500);
  assert.deepEqual(await captured(), [1, 1, 1], "A repeated relay must not resend delivered capabilities");
  console.log("Verification, reset and magic-link mail delivered once over authenticated STARTTLS by real BullMQ workers; bearer payloads deleted.");
} catch {
  console.error("Disposable worker delivery failed; credentials and message contents suppressed.");
  process.exitCode = 1;
} finally {
  if (ids.length) await db.outboxMessage.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await db.$disconnect();
}
