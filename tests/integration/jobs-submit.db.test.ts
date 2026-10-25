import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { downloadAuthorisedJobFile, submitJob } from "@/lib/jobs";
import { isPublicDerivativeKey } from "@/lib/storage";
import { jobsFixture, type JobsFixture } from "../helpers/jobs-db";

vi.mock("@/lib/webhooks/emit", async (original) => ({ ...await original<object>(), enqueueWebhookDeliveries: vi.fn() }));
let f: JobsFixture;
beforeEach(async () => { f = await jobsFixture(); });
afterEach(async () => { await f?.cleanup(); });

describe("job submission in PostgreSQL", () => {
  it("snapshots audience, currency, private file metadata, and per-space numbers", async () => {
    const first = await f.submit({ files: [{ filename: "instructions.pdf", body: Buffer.from("%PDF-1.7 test") }] });
    const second = await f.submit();
    expect(first.job).toMatchObject({ status: "SUBMITTED", audience: "MEMBER", currency: "INR", number: 1 });
    expect(second.job.number).toBe(2);
    expect(first.job.statusToken).toMatch(/^[a-f0-9]{64}$/);
    expect(second.job.statusToken).not.toBe(first.job.statusToken);
    const files = await prisma.jobFile.findMany({ where: { jobId: first.job.id } });
    expect(files[0]).toMatchObject({ sha256: expect.stringMatching(/^[a-f0-9]{64}$/), contentType: "application/pdf", uploadedById: f.maker.id });
    expect(files[0].storageKey).toMatch(new RegExp(`^spaces/${f.home.space.id}/jobs/${first.job.id}/`));
    expect(isPublicDerivativeKey(files[0].storageKey)).toBe(false);
    expect(await downloadAuthorisedJobFile(f.home.space.id, first.job.id, files[0].id, f.maker.id)).toMatchObject({ contentType: "application/pdf" });
    await expect(downloadAuthorisedJobFile(f.home.space.id, first.job.id, files[0].id, f.outsider.id)).rejects.toThrow("Space not found");
    await expect(downloadAuthorisedJobFile(f.away.space.id, first.job.id, files[0].id, f.away.user.id)).rejects.toThrow("Space not found");
    const events = await prisma.jobEvent.findMany({ where: { jobId: first.job.id } });
    expect(events.map((e) => e.kind)).toEqual(["submitted"]);
    expect(await prisma.auditEvent.count({ where: { targetId: first.job.id, action: "job.submitted" } })).toBe(1);
  });
  it("allows public requests only under ANYONE, preserves the audience after membership changes", async () => {
    await expect(f.submit({ actorId: f.outsider.id })).rejects.toThrow("active members");
    await f.settings({ eligibility: "ANYONE" });
    const { job } = await f.submit({ actorId: f.outsider.id });
    expect(job.audience).toBe("PUBLIC");
    await prisma.spaceMember.create({ data: { spaceId: f.home.space.id, userId: f.outsider.id, role: "MEMBER" } });
    expect((await f.readJob(job.id)).audience).toBe("PUBLIC");
    await prisma.spaceMember.updateMany({ where: { userId: f.outsider.id }, data: { status: "BLOCKED" } });
    await expect(f.submit({ actorId: f.outsider.id })).rejects.toThrow("blocked");
  });
  it("STAFF_ONLY lets staff create on behalf by email and rejects makers", async () => {
    await f.settings({ eligibility: "STAFF_ONLY" });
    await expect(f.submit()).rejects.toThrow("on your behalf");
    const { job } = await f.submit({ actorId: f.home.user.id, requesterEmail: f.outsider.email! });
    expect(job).toMatchObject({ requesterId: f.outsider.id, audience: "PUBLIC" });
    await expect(f.submit({ requesterEmail: f.outsider.email! })).rejects.toThrow();
  });
  it("enforces space, type, machine intake, machine selection, status and tenancy guards", async () => {
    await f.settings({ jobsEnabled: false }); await expect(f.submit()).rejects.toThrow("disabled");
    await f.settings({ jobsEnabled: true });
    await f.type({ acceptsJobs: false }); await expect(f.submit()).rejects.toThrow("not accepting");
    await f.type({ acceptsJobs: true, requesterPicksMachine: false });
    await expect(f.submit({ machineId: f.home.machine.id })).rejects.toThrow("allocate");
    await f.type({ requesterPicksMachine: true });
    await expect(f.submit({ typeId: f.away.type.id })).rejects.toThrow("Space not found");
    await expect(f.submit({ machineId: f.away.machine.id })).rejects.toThrow("Space not found");
    await prisma.machine.update({ where: { id: f.home.machine.id }, data: { acceptsJobs: false } });
    await expect(f.submit({ machineId: f.home.machine.id })).rejects.toThrow("not accepting");
    await prisma.space.update({ where: { id: f.home.space.id }, data: { status: "SUSPENDED" } });
    await expect(f.submit()).rejects.toThrow("not accepting");
  });
  it("serialises simultaneous submissions at the space/type requester limit", async () => {
    await f.settings({ maxOpenJobsPerRequester: 1 });
    const results = await Promise.allSettled([f.submit(), f.submit()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await f.type({ maxOpenJobsPerRequester: 2 });
    await f.submit();
    await expect(f.submit()).rejects.toThrow("open job limit");
    expect(await prisma.job.count({ where: { spaceId: f.home.space.id } })).toBe(2);
  });
  it("validates required request fields and file policies, and cleans uploaded bytes after a rolled back submit", async () => {
    await f.type({ requestFields: [{ key: "material", kind: "material", label: "Material", required: true }], materials: ["PLA"] });
    const input = { files: [{ filename: "manual.pdf", body: Buffer.from("%PDF-1.7 test") }] };
    await expect(f.submit(input)).rejects.toThrow("Material is required");
    expect(await prisma.asset.count({ where: { spaceId: f.home.space.id } })).toBe(0);
    expect(await prisma.job.count({ where: { spaceId: f.home.space.id } })).toBe(0);
    await f.submit({ ...input, requestData: { material: "PLA" } });
    await f.type({ filePolicy: { extensions: ["pdf"], maxBytes: 1024, maxFiles: 1, required: true } });
    await expect(f.submit({ requestData: { material: "PLA" } })).rejects.toThrow("requires a file");
  });
  it("auto-approves FREE/FLAT only, and refuses public submission without an offered price", async () => {
    await f.type({ requiresApproval: false });
    expect((await f.submit()).job).toMatchObject({ status: "APPROVED", quotedAmount: 0, paymentState: "NOT_REQUIRED", reviewedById: null });
    await f.settings({ paymentsEnabled: true, eligibility: "ANYONE" });
    const rule = await prisma.pricingRule.create({ data: { spaceId: f.home.space.id, mode: "FLAT", flatFee: 100 } });
    await expect(f.submit({ actorId: f.outsider.id })).rejects.toThrow("not offered to the public");
    expect((await f.submit()).job).toMatchObject({ status: "APPROVED", quotedAmount: 100, paymentState: "QUOTED" });
    await prisma.pricingRule.update({ where: { id: rule.id }, data: { mode: "TIME" } });
    expect((await f.submit()).job.status).toBe("SUBMITTED");
    await f.settings({ paymentsEnabled: false });
    expect((await f.submit({ actorId: f.outsider.id })).job).toMatchObject({ status: "APPROVED", quotedAmount: 0 });
  });
  it("writes notification preferences and webhooks atomically with submission", async () => {
    await prisma.webhookEndpoint.create({ data: { spaceId: f.home.space.id, url: "https://example.test/hook", secretEncrypted: "unused", events: ["job.submitted", "job.approved"] } });
    await prisma.chatChannel.create({ data: { spaceId: f.home.space.id, kind: "SLACK", name: "Jobs", configEncrypted: "unused", events: ["job-submitted"] } });
    const { job } = await f.submit();
    expect(await prisma.webhookDelivery.count({ where: { spaceId: f.home.space.id, event: "job.submitted" } })).toBe(1);
    const outbox = await prisma.outboxMessage.findMany({ where: { payload: { path: ["jobId"], equals: job.id } } });
    expect(outbox.map((m) => m.kind).sort()).toEqual(["job-requester", "job-staff"]);
    expect(await prisma.outboxMessage.count({ where: { kind: "chat-notice", payload: { path: ["spaceId"], equals: f.home.space.id } } })).toBe(1);
    await f.settings({ requesterEmails: { submitted: false }, staffAlerts: { submitted: false } });
    const muted = await f.submit();
    expect(await prisma.outboxMessage.count({ where: { payload: { path: ["jobId"], equals: muted.job.id } } })).toBe(0);
    expect(await prisma.webhookDelivery.count({ where: { spaceId: f.home.space.id, event: "job.submitted" } })).toBe(2);
  });
  it("rejects identity and malformed inputs before creating a job", async () => {
    await expect(submitJob({ spaceId: f.home.space.id, actorId: "missing", typeId: f.home.type.id, title: "part" })).rejects.toThrow("Space not found");
    await expect(f.submit({ title: " " })).rejects.toThrow("title");
    await expect(f.submit({ quantity: 0 })).rejects.toThrow("at least one");
    await expect(f.submit({ sourceLink: "javascript:alert(1)" })).rejects.toThrow("HTTP");
  });
  it("re-encodes images, strips metadata and hashes the stored bytes", async () => {
    const body = await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } }).png().withMetadata().toBuffer();
    const { job } = await f.submit({ files: [{ filename: "reference.png", body }] });
    const file = await prisma.jobFile.findFirstOrThrow({ where: { jobId: job.id } });
    const asset = await downloadAuthorisedJobFile(f.home.space.id, job.id, file.id, f.maker.id);
    expect(file).toMatchObject({ filename: "reference.webp", contentType: "image/webp" });
    expect(file.sha256).toBe(createHash("sha256").update(asset!.body).digest("hex"));
    const meta = await sharp(asset!.body).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    await expect(f.submit({ files: [{ filename: "broken.png", body: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) }] })).rejects.toThrow("valid");
  });
  it("accepts no preference on material and colour fields even when the type has choices", async () => {
    await f.type({ requestFields: [{ key: "material", kind: "material", label: "Material" }, { key: "colour", kind: "colour", label: "Colour" }], materials: ["PLA"], colours: ["Blue"] });
    const { job } = await f.submit({ requestData: { material: "no preference", colour: "No preference" } });
    expect(job.requestData).toEqual({ material: "No preference", colour: "No preference" });
  });
});
