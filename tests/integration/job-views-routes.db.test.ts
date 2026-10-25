import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => identity.id ? { user: { id: identity.id } } : null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));

import { prisma } from "@/lib/db";
import { jobsFixture, type JobsFixture } from "../helpers/jobs-db";
import { loadRequesterJobView } from "@/lib/views/app__s__spaceSlug__jobs__number__page";
import { loadStaffJobView } from "@/lib/views/app__dashboard__spaceSlug__jobs__number__page";
import { loadJobsView } from "@/lib/views/app__dashboard__spaceSlug__jobs__page";
import { loadAccountJobsView } from "@/lib/views/app__account__jobs__page";
import { loadPublicJobView } from "@/lib/views/app__j__token__page";
import { loadPaymentsView } from "@/lib/views/app__dashboard__spaceSlug__payments__page";
import { loadPublicSpaceLayout } from "@/lib/views/app__s__spaceSlug__layout";
import { canRequestMachine } from "@/lib/jobs/intake";
import { POST } from "@/app/api/spaces/[spaceSlug]/jobs/files/route";
import { GET } from "@/app/api/uploads/jobs/[spaceSlug]/[jobId]/[fileId]/route";
import { GET as exportPayments } from "@/app/api/spaces/[spaceSlug]/payments/export/route";

let f: JobsFixture;
let job: Awaited<ReturnType<JobsFixture["approve"]>>;
let fileId: string;
beforeAll(async () => {
  f = await jobsFixture();
  const submitted = await f.submit({ files: [{ filename: "instructions.pdf", body: Buffer.from("%PDF-1.7 private") }], description: "PRIVATE-DESCRIPTION" });
  job = submitted.job;
  fileId = (await prisma.jobFile.findFirstOrThrow({ where: { jobId: job.id } })).id;
  await f.act(job.id, { kind: "note", body: "INTERNAL-NOTE", internal: true });
  await f.act(job.id, { kind: "note", body: "Visible note" });
});
afterAll(async () => { await f?.cleanup(); });
const props = () => ({ params: Promise.resolve({ spaceSlug: f.home.space.slug, number: String(job.number) }) });
const fileParams = (spaceSlug = f.home.space.slug) => ({ params: Promise.resolve({ spaceSlug, jobId: job.id, fileId }) });

describe.sequential("job route and view isolation", () => {
  it("returns only the public status allowlist, without requester, files, notes or money", async () => {
    identity.id = "";
    const result = await loadPublicJobView({ params: Promise.resolve({ token: job.statusToken }) });
    expect(Object.keys(result).sort()).toEqual(["title", "status", "queue", "timestamps"].sort());
    const payload = JSON.stringify(result);
    for (const secret of [job.requesterId, f.maker.email!, "PRIVATE-DESCRIPTION", "INTERNAL-NOTE", "Visible note", "instructions.pdf", "currency", "Amount"]) expect(payload).not.toContain(secret);
    await expect(loadPublicJobView({ params: Promise.resolve({ token: "0".repeat(64) }) })).rejects.toThrow(/404/);
  });
  it("restricts the requester detail and account list to the signed-in person", async () => {
    identity.id = f.maker.id;
    const result = await loadRequesterJobView(props());
    expect(result.job.notes.map((n) => n.body)).toEqual(["Visible note"]);
    expect(result.job.events.filter((e) => e.kind === "noted")).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("INTERNAL-NOTE");
    expect((await loadAccountJobsView()).jobs.map((j) => j.id)).toEqual([job.id]);
    identity.id = f.outsider.id;
    await expect(loadRequesterJobView(props())).rejects.toThrow(/404/);
    expect((await loadAccountJobsView()).jobs).toEqual([]);
  });
  it("keeps archived job history readable only by its requester", async () => {
    await prisma.space.update({ where: { id: f.home.space.id }, data: { status: "ARCHIVED" } });
    try {
      identity.id = f.maker.id;
      expect((await loadPublicSpaceLayout(props())).space.id).toBe(f.home.space.id);
      expect((await loadRequesterJobView(props())).canCancel).toBe(false);
      identity.id = f.outsider.id;
      await expect(loadPublicSpaceLayout(props())).rejects.toThrow(/404/);
      await expect(loadRequesterJobView(props())).rejects.toThrow(/404/);
    } finally { await prisma.space.update({ where: { id: f.home.space.id }, data: { status: "ACTIVE" } }); }
  });
  it("scopes staff detail, board filters and money pages to capabilities and tenancy", async () => {
    identity.id = f.home.user.id;
    expect((await loadStaffJobView(props())).job.notes).toHaveLength(2);
    const params = Promise.resolve({ spaceSlug: f.home.space.slug });
    expect((await loadJobsView({ params, searchParams: Promise.resolve({ type: f.away.type.id }) })).jobs).toEqual([]);
    expect((await loadPaymentsView({ params, searchParams: Promise.resolve({}) })).payments).toEqual([]);
    identity.id = f.away.user.id;
    await expect(loadStaffJobView(props())).rejects.toThrow(/404/);
    await expect(loadPaymentsView({ params, searchParams: Promise.resolve({}) })).rejects.toThrow(/404/);
  });
  it("allows file downloads for the requester and jobs.view staff, but denies anonymous, unrelated and cross-space callers", async () => {
    for (const userId of [f.maker.id, f.home.user.id]) {
      identity.id = userId;
      const response = await GET(new Request("http://localhost/api/uploads/jobs/file"), fileParams());
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.text()).toBe("%PDF-1.7 private");
    }
    for (const userId of ["", f.outsider.id, f.away.user.id]) {
      identity.id = userId;
      expect((await GET(new Request("http://localhost/api/uploads/jobs/file"), fileParams())).status).toBe(404);
    }
    identity.id = f.home.user.id;
    expect((await GET(new Request("http://localhost/api/uploads/jobs/file"), fileParams(f.away.space.slug))).status).toBe(404);
  });
  it("enforces same-origin multipart uploads, file policy and foreign type isolation", async () => {
    identity.id = f.maker.id;
    const upload = (typeId: string, filename = "part.pdf", content = "%PDF-1.7 test", origin = "http://localhost") => {
      const form = new FormData(); form.set("values", JSON.stringify({ typeId, title: "Uploaded request" }));
      form.append("files", new File([content], filename));
      return POST(new Request(`http://localhost/api/spaces/test/jobs/files?typeId=${typeId}`, { method: "POST", headers: { origin }, body: form }), { params: Promise.resolve({ spaceSlug: f.home.space.slug }) });
    };
    expect((await upload(f.home.type.id, "part.pdf", "%PDF-1.7", "https://unrelated.test")).status).toBe(404);
    expect((await upload(f.away.type.id)).status).toBe(404);
    expect((await upload(f.home.type.id, "part.pdf", "Not a PDF")).status).toBe(400);
    const response = await upload(f.home.type.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });
  it("hides request buttons when disabled, blocked or public pricing is unavailable", async () => {
    identity.id = f.maker.id;
    expect(await canRequestMachine(f.home.space.id, f.home.type.id, f.home.machine.id)).toBe(true);
    await f.settings({ jobsEnabled: false });
    expect(await canRequestMachine(f.home.space.id, f.home.type.id, f.home.machine.id)).toBe(false);
    await f.settings({ jobsEnabled: true, eligibility: "ANYONE", paymentsEnabled: true });
    await prisma.pricingRule.create({ data: { spaceId: f.home.space.id, mode: "FLAT", flatFee: 1000 } });
    identity.id = f.outsider.id;
    expect(await canRequestMachine(f.home.space.id, f.home.type.id, f.home.machine.id)).toBe(false);
  });
  it("exports payments only with payments.view and quotes hostile CSV values", async () => {
    const payment = await prisma.payment.create({ data: { spaceId: f.home.space.id, jobId: job.id, amount: 1250, currency: "INR", reference: "=danger" } });
    identity.id = f.home.user.id;
    const params = Promise.resolve({ spaceSlug: f.home.space.slug });
    const response = await exportPayments(new Request("http://localhost/api/export?status=PENDING"), { params });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"12.50","INR","PENDING","","\'=danger"');
    identity.id = f.maker.id;
    expect((await exportPayments(new Request("http://localhost/api/export"), { params })).status).toBe(404);
    await prisma.payment.delete({ where: { id: payment.id } });
  });
});
