import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpaceRole } from "@prisma/client";
const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: identity.id } }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));

import { prisma } from "@/lib/db";
import { jobsFixture, type JobsFixture } from "../helpers/jobs-db";
import { submitJobAction, createJobOnBehalfAction, transitionJobAction } from "@/app/actions/jobs";
import { jobPaymentAction, payNowAction } from "@/app/actions/job-payments";
import { saveJobSettingsAction, saveJobMoneySettingsAction, savePricingRuleAction, deletePricingRuleAction } from "@/app/actions/job-settings";
import { JOB_DEFAULTS } from "@/lib/jobs/settingsDefaults";
import { jobSettingsSchema, moneySettingsSchema } from "@/lib/jobs/settingsSchemas";

let f: JobsFixture;
beforeAll(async () => { f = await jobsFixture(); });
afterAll(async () => { await f?.cleanup(); });
const role = async (role: SpaceRole) => prisma.spaceMember.updateMany({ where: { spaceId: f.home.space.id, userId: f.home.user.id }, data: { role } });
beforeEach(async () => { identity.id = f.home.user.id; await role("MACHINE_MANAGER"); });
const settings = () => ({ spaceSlug: f.home.space.slug, values: jobSettingsSchema.parse({ ...JOB_DEFAULTS, maxOpenJobsPerRequester: 100 }) });
const pricing = () => ({ spaceSlug: f.home.space.slug, typeId: null, machineId: null, audience: "MEMBER", mode: "FLAT", flatFee: 1000, timeRatePerHour: 0, materialRate: "0", setupFee: 0, minimumCharge: 0, timeIncrementMinutes: 1, depositMode: "NONE", depositValue: 0, paymentTiming: null });

describe.sequential("job actions enforce capabilities and tenant scope in PostgreSQL", () => {
  it("submits as a maker, rejects foreign types and prevents on-behalf impersonation", async () => {
    identity.id = f.maker.id;
    const input = { spaceSlug: f.home.space.slug, typeId: f.home.type.id, title: "Maker action" };
    expect(await submitJobAction(input)).toMatchObject({ ok: true });
    expect(await submitJobAction({ ...input, typeId: f.away.type.id })).toEqual({ ok: false, error: "Space not found." });
    expect(await submitJobAction({ ...input, requesterEmail: f.outsider.email })).toMatchObject({ ok: false });
    expect(await createJobOnBehalfAction({ ...input, requesterEmail: f.outsider.email })).toMatchObject({ ok: false });
  });
  it.each(["approve", "reject", "start", "pause", "resume", "complete", "fail", "collect", "reprint", "priority", "reassign", "note"])("denies viewer command %s before any mutation", async (kind) => {
    const { job } = await f.submit();
    await role("VIEWER");
    const command = { kind, reason: "Reason", actualMinutes: 1, percent: 10, priority: 1, machineId: null, body: "Internal", internal: true };
    expect(await transitionJobAction({ spaceSlug: f.home.space.slug, jobId: job.id, command })).toMatchObject({ ok: false });
    expect((await f.readJob(job.id)).status).toBe("SUBMITTED");
  });
  it("requires a staff authenticator and does not let another space's staff address a job", async () => {
    const { job } = await f.submit();
    const input = { spaceSlug: f.home.space.slug, jobId: job.id, command: { kind: "approve" } };
    await prisma.user.update({ where: { id: identity.id }, data: { mfaEnabledAt: null } });
    expect(await transitionJobAction(input)).toMatchObject({ ok: false, error: expect.stringMatching(/authenticator/) });
    await prisma.user.update({ where: { id: identity.id }, data: { mfaEnabledAt: new Date() } });
    expect(await transitionJobAction({ ...input, spaceSlug: f.away.space.slug })).toEqual({ ok: false, error: "Space not found." });
    expect(await transitionJobAction({ ...input, jobId: f.away.machine.id })).toEqual({ ok: false, error: "Space not found." });
  });
  it("allows requester cancellation only on their own job", async () => {
    const { job } = await f.submit();
    identity.id = f.outsider.id;
    expect(await transitionJobAction({ spaceSlug: f.home.space.slug, jobId: job.id, command: { kind: "cancel" } })).toMatchObject({ ok: false });
    identity.id = f.maker.id;
    expect(await transitionJobAction({ spaceSlug: f.home.space.slug, jobId: job.id, command: { kind: "cancel" } })).toMatchObject({ ok: true });
    expect((await f.readJob(job.id)).status).toBe("CANCELLED");
  });
  it("allows operators to review and run a free job through collection", async () => {
    const { job } = await f.submit();
    await role("OPERATOR");
    for (const command of [{ kind: "approve", estimatedMinutes: 2 }, { kind: "start" }, { kind: "pause" }, { kind: "resume" }, { kind: "complete", actualMinutes: 2 }, { kind: "collect" }]) {
      expect(await transitionJobAction({ spaceSlug: f.home.space.slug, jobId: job.id, command })).toMatchObject({ ok: true });
    }
    expect((await f.readJob(job.id)).status).toBe("COLLECTED");
  });
  it("gates settings separately from money switches and audits field names only", async () => {
    await role("TYPE_MANAGER");
    expect(await saveJobSettingsAction(settings())).toMatchObject({ ok: false });
    expect(await saveJobMoneySettingsAction({ spaceSlug: f.home.space.slug, values: moneySettingsSchema.parse(JOB_DEFAULTS) })).toMatchObject({ ok: false });
    expect(await savePricingRuleAction(pricing())).toMatchObject({ ok: false });
    await role("MACHINE_MANAGER");
    expect(await saveJobSettingsAction(settings())).toEqual({ ok: true });
    expect(await savePricingRuleAction(pricing())).toEqual({ ok: true });
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { spaceId: f.home.space.id, action: "SPACE_SETTINGS_CHANGED", metadata: { path: ["area"], equals: "machine.jobs" } } });
    expect(audit.metadata).toMatchObject({ area: "machine.jobs" });
    expect(audit.metadata).not.toHaveProperty("changes");
    await role("VIEWER");
    expect(await saveJobSettingsAction(settings())).toMatchObject({ ok: false });
    expect(await savePricingRuleAction(pricing())).toMatchObject({ ok: false });
  });
  it("rejects duplicate default pricing scopes and foreign type, machine and rule ids", async () => {
    const existing = await prisma.pricingRule.findFirstOrThrow({ where: { spaceId: f.home.space.id } });
    expect(await savePricingRuleAction(pricing())).toMatchObject({ ok: false, error: expect.stringMatching(/already exists/) });
    expect(await savePricingRuleAction({ ...pricing(), typeId: f.away.type.id })).toEqual({ ok: false, error: "Space not found." });
    expect(await savePricingRuleAction({ ...pricing(), machineId: f.away.machine.id })).toEqual({ ok: false, error: "Space not found." });
    expect(await savePricingRuleAction({ ...pricing(), ruleId: "foreign-rule" })).toEqual({ ok: false, error: "Space not found." });
    expect(await deletePricingRuleAction({ spaceSlug: f.away.space.slug, ruleId: existing.id })).toEqual({ ok: false, error: "Space not found." });
    expect(await deletePricingRuleAction({ spaceSlug: f.home.space.slug, ruleId: existing.id })).toEqual({ ok: true });
  });
  it("permits money settings only to machine managers and prevents staff payment impersonation", async () => {
    const input = { spaceSlug: f.home.space.slug, values: { ...moneySettingsSchema.parse(JOB_DEFAULTS), paymentsEnabled: true } };
    expect(await saveJobMoneySettingsAction(input)).toEqual({ ok: true });
    const { job } = await f.submit();
    await f.act(job.id, { kind: "approve", priceOverride: 1000, reason: "Quote" });
    const payment = await prisma.payment.create({ data: { spaceId: f.home.space.id, jobId: job.id, amount: 1000, currency: "INR" } });
    const record = { spaceSlug: f.home.space.slug, paymentId: payment.id, command: { kind: "record", method: "CASH", reference: "Receipt" } };
    await role("OPERATOR");
    expect(await jobPaymentAction(record)).toMatchObject({ ok: false });
    expect(await payNowAction({ spaceSlug: f.home.space.slug, paymentId: payment.id })).toEqual({ ok: false, error: "Space not found." });
    await role("MACHINE_MANAGER");
    expect(await jobPaymentAction({ ...record, spaceSlug: f.away.space.slug })).toEqual({ ok: false, error: "Space not found." });
    expect(await jobPaymentAction(record)).toEqual({ ok: true });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("PAID");
  });
  it("supports pricing scopes and audiences, while rejecting mixed scopes", async () => {
    const base = pricing();
    for (const scope of [{ typeId: f.home.type.id, machineId: null }, { typeId: null, machineId: f.home.machine.id }]) {
      for (const audience of ["MEMBER", "PUBLIC"]) expect(await savePricingRuleAction({ ...base, ...scope, audience })).toEqual({ ok: true });
    }
    expect(await savePricingRuleAction({ ...base, typeId: f.home.type.id, machineId: f.home.machine.id })).toMatchObject({ ok: false });
    await prisma.pricingRule.deleteMany({ where: { spaceId: f.home.space.id } });
  });
  it("keeps payment gate overrides behind payments.manage and records the reason", async () => {
    await f.type({ consumableUnit: null });
    await f.settings({ paymentsEnabled: true });
    const rule = await prisma.pricingRule.create({ data: { spaceId: f.home.space.id, mode: "FLAT", flatFee: 1000, paymentTiming: "UPFRONT" } });
    const { job } = await f.submit();
    await f.act(job.id, { kind: "approve" });
    const input = { spaceSlug: f.home.space.slug, jobId: job.id, command: { kind: "start", paymentOverrideReason: "Agreed exception" } };
    await role("OPERATOR");
    expect(await transitionJobAction(input)).toMatchObject({ ok: false, error: "Payment overrides require payments.manage." });
    await role("MACHINE_MANAGER");
    expect(await transitionJobAction(input)).toMatchObject({ ok: true });
    expect(await prisma.jobEvent.findFirst({ where: { spaceId: f.home.space.id, jobId: job.id, kind: "started" } })).toMatchObject({ note: "Agreed exception", data: { paymentOverride: true } });
    await f.act(job.id, { kind: "complete", actualMinutes: 1 });
    await prisma.pricingRule.delete({ where: { id: rule.id } });
  });
});
