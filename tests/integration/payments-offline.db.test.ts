import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { recordOfflinePayment, confirmOfflinePayment, waivePayment } from "@/lib/payments/jobs";
import { paymentsFixture, timings, type PaymentsFixture } from "../helpers/payments-db";

vi.mock("@/lib/webhooks/emit", async (original) => ({ ...await original<object>(), enqueueWebhookDeliveries: vi.fn() }));
let f: PaymentsFixture;
beforeEach(async () => { f = await paymentsFixture(); });
afterEach(async () => { await f?.cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("offline payment controls and gates", () => {
  it("honours requester and staff payment notification preferences", async () => {
    await f.configure("UPFRONT"); await f.settings({ requesterEmails: { payment: false }, staffAlerts: { payment: false } });
    const job = await f.approve(); const [p] = await f.payments(job); await f.pay(p, "CASH");
    const outbox = await prisma.outboxMessage.findMany({ where: { kind: { in: ["job-requester", "job-staff"] } } });
    expect(outbox.some((row) => {
      const payload = row.payload as { jobId?: string; event?: string };
      return payload.jobId === job.id && payload.event === "payment";
    })).toBe(false);
  });
  it.each(timings)("%s maker-checker holds money and gates until another manager confirms", async (timing) => {
    await f.configure(timing);
    await prisma.space.update({ where: { id: f.spaceId }, data: { offlineConfirmationRequired: true } });
    const job = await f.approve(); const [p] = await f.payments(job);
    const context = f.context(p.id);
    const recorded = await recordOfflinePayment(context, { method: "UPI", reference: "UTR123" });
    expect(recorded).toMatchObject({ status: "PENDING", recordedById: context.actorId, confirmedById: null });
    expect((await f.readJob(job.id)).amountPaid).toBe(0);
    await expect(f.act(job.id, { kind: "start" })).rejects.toThrow("not paid");
    await expect(confirmOfflinePayment(context)).rejects.toThrow("different person");
    await expect(confirmOfflinePayment({ ...context, actorId: f.maker.id })).rejects.toThrow("Space not found");
    await prisma.spaceMember.create({ data: { spaceId: f.spaceId, userId: f.outsider.id, role: "MACHINE_MANAGER" } });
    await prisma.user.update({ where: { id: f.outsider.id }, data: { mfaEnabledAt: new Date() } });
    expect(await confirmOfflinePayment({ ...context, actorId: f.outsider.id })).toMatchObject({ status: "PAID", confirmedById: f.outsider.id });
    await expect(confirmOfflinePayment({ ...context, actorId: f.outsider.id })).rejects.toThrow("not awaiting");
    await f.act(job.id, { kind: "start" });
    expect((await f.readJob(job.id)).amountPaid).toBe(p.amount);
  });
  it.each(timings)("%s waive records a reason and clears the required gate", async (timing) => {
    await f.configure(timing);
    const job = await f.approve(); const [p] = await f.payments(job);
    await expect(waivePayment(f.context(p.id), " ")).rejects.toThrow("reason");
    await expect(waivePayment(f.context(p.id, f.maker.id), "Waive")).rejects.toThrow("Space not found");
    await waivePayment(f.context(p.id), "Sponsored part");
    await f.act(job.id, { kind: "start" });
    await f.act(job.id, { kind: "complete", actualMinutes: 1 });
    const balance = (await f.payments(job)).find((payment) => payment.kind === "BALANCE");
    if (balance) await waivePayment(f.context(balance.id), "Sponsored balance");
    await f.act(job.id, { kind: "collect" });
    expect(await f.readJob(job.id)).toMatchObject({ paymentState: "WAIVED", amountPaid: 0 });
    expect(await prisma.jobEvent.findFirst({ where: { jobId: job.id, kind: "payment_waived" } })).toMatchObject({ note: "Sponsored part" });
  });
  it("enforces reference, method allowlist, MFA and active payments.manage", async () => {
    await f.configure("UPFRONT"); const job = await f.approve(); const [p] = await f.payments(job);
    const context = f.context(p.id);
    await expect(recordOfflinePayment(context, { method: "OTHER", reference: "" })).rejects.toThrow("reason");
    await f.settings({ offlineMethods: ["CASH"] });
    await expect(recordOfflinePayment(context, { method: "OTHER", reference: "R" })).rejects.toThrow("not enabled");
    await expect(recordOfflinePayment({ ...context, spaceId: f.away.space.id }, { method: "CASH", reference: "R" })).rejects.toThrow("Space not found");
    await prisma.user.update({ where: { id: f.home.user.id }, data: { mfaEnabledAt: null } });
    await expect(recordOfflinePayment(context, { method: "CASH", reference: "R" })).rejects.toThrow("authenticator");
    await prisma.user.update({ where: { id: f.home.user.id }, data: { mfaEnabledAt: new Date() } });
    await prisma.spaceMember.updateMany({ where: { spaceId: f.spaceId, userId: f.home.user.id }, data: { role: "OPERATOR" } });
    await expect(recordOfflinePayment(context, { method: "CASH", reference: "R" })).rejects.toThrow("Space not found");
  });
  it("serialises concurrent offline records so one receives money", async () => {
    await f.configure("UPFRONT"); const job = await f.approve(); const [p] = await f.payments(job);
    const results = await Promise.allSettled([1, 2].map(() => recordOfflinePayment(f.context(p.id), { method: "CASH", reference: "R" })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await f.readJob(job.id)).amountPaid).toBe(1000);
    await expect(waivePayment(f.context(p.id), "Reason")).rejects.toThrow("unpaid");
  });
  it("lets suspended spaces confirm previously received money but rejects new receipts", async () => {
    await f.configure("UPFRONT");
    await prisma.space.update({ where: { id: f.spaceId }, data: { offlineConfirmationRequired: true } });
    const job = await f.approve(); const [p] = await f.payments(job);
    await recordOfflinePayment(f.context(p.id), { method: "CASH", reference: "R" });
    await prisma.spaceMember.create({ data: { spaceId: f.spaceId, userId: f.outsider.id, role: "MACHINE_MANAGER" } });
    await prisma.user.update({ where: { id: f.outsider.id }, data: { mfaEnabledAt: new Date() } });
    await prisma.space.update({ where: { id: f.spaceId }, data: { status: "SUSPENDED" } });
    await expect(recordOfflinePayment(f.context(p.id), { method: "CASH", reference: "R" })).rejects.toThrow("new payments");
    await confirmOfflinePayment(f.context(p.id, f.outsider.id));
    expect((await f.readJob(job.id)).amountPaid).toBe(1000);
  });
  it("honours fixed deposits, snapshots changes, and pay-later enablement", async () => {
    await f.configure("ON_COMPLETION", { depositMode: "FIXED", depositValue: 300 });
    const job = await f.approve(); expect(job.depositAmount).toBe(300);
    await prisma.pricingRule.update({ where: { id: f.rule.id }, data: { depositValue: 999 } });
    expect((await f.payments(job))[0].amount).toBe(300);
    await f.configure("PAY_LATER"); await f.settings({ allowPayLater: false });
    const submitted = await f.submit();
    await expect(f.act(submitted.job.id, { kind: "approve" })).rejects.toThrow("Pay later");
  });
  it("audits manager start and collection overrides and enforces operator restrictions", async () => {
    await f.configure("UPFRONT"); const job = await f.approve();
    await f.act(job.id, { kind: "start", paymentOverrideReason: "Invoice on account" });
    await f.act(job.id, { kind: "complete", actualMinutes: 1 });
    await prisma.spaceMember.updateMany({ where: { spaceId: f.spaceId, userId: f.home.user.id }, data: { role: "OPERATOR" } });
    await expect(f.act(job.id, { kind: "collect", paymentOverrideReason: "Release" })).rejects.toThrow("payments.manage");
    await prisma.spaceMember.updateMany({ where: { spaceId: f.spaceId, userId: f.home.user.id }, data: { role: "MACHINE_MANAGER" } });
    await expect(f.act(job.id, { kind: "collect", paymentOverrideReason: "" })).rejects.toThrow("reason");
    await f.act(job.id, { kind: "collect", paymentOverrideReason: "Approved handover" });
    const audits = await prisma.auditEvent.findMany({ where: { targetId: job.id, action: { in: ["job.started", "job.collected"] } } });
    expect(audits).toHaveLength(2);
    expect(audits.every((row) => (row.metadata as { paymentOverride?: boolean }).paymentOverride)).toBe(true);
  });
});
