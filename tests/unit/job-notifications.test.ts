import { beforeEach, describe, expect, it, vi } from "vitest";
import { asJobEmailPayload, deliverJobEmail } from "@/lib/email/jobs";
import { OUTBOX_KINDS } from "@/lib/outboxKinds";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { job: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/email/message", () => ({ sendBrandedEmail: mocks.send, absoluteUrl: (path: string) => `http://localhost:3000${path}` }));
const payload = { to: "maker@example.test", spaceId: "space", jobId: "job", event: "approved" as const };

describe("job notifications", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("validates payloads and registers both durable outbox kinds", async () => {
    expect(asJobEmailPayload(payload)).toEqual(payload);
    for (const invalid of [null, {}, { ...payload, to: "bad" }, { ...payload, jobId: "" }, { ...payload, spaceId: "a".repeat(129) }, { ...payload, event: "unknown" }]) {
      expect(asJobEmailPayload(invalid)).toBeNull();
      await expect(OUTBOX_KINDS["job-requester"].deliver(invalid, "message-id")).rejects.toThrow();
    }
    expect(OUTBOX_KINDS["job-requester"].capability).toBe(false);
    expect(OUTBOX_KINDS["job-staff"].capability).toBe(false);
  });
  it("uses space branding, currency exponents, quote and requester payment link", async () => {
    mocks.findFirst.mockResolvedValue({ number: 42, title: "Part", currency: "JPY", quotedAmount: 123, amountPaid: 0,
      space: { name: "Workshop", slug: "workshop", locale: "en-GB" } });
    await deliverJobEmail(payload, "stable-message-id", false);
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { spaceId: "space", id: "job" } }));
    const email = mocks.send.mock.calls[0][0];
    expect(email).toMatchObject({ to: payload.to, spaceId: "space", messageId: "stable-message-id",
      action: { url: "http://localhost:3000/s/workshop/jobs/42" } });
    expect(email.paragraphs.join(" ")).toContain("123");
    expect(email.paragraphs.join(" ")).not.toContain("1.23");
    expect(email.paragraphs.join(" ")).toContain("Payment is due");
  });
  it("shows completion and amount due, and sends staff to the staff detail", async () => {
    mocks.findFirst.mockResolvedValue({ id: "job", number: 42, title: "Part", currency: "INR", finalAmount: 500, amountPaid: 500,
      space: { name: "Workshop", slug: "workshop", locale: null } });
    await deliverJobEmail({ ...payload, event: "completed" }, "id", true);
    const email = mocks.send.mock.calls[0][0];
    expect(email).toMatchObject({ heading: "Ready to collect", action: { url: "http://localhost:3000/dashboard/workshop/jobs/42" } });
    expect(email.paragraphs.join(" ")).not.toContain("Payment is due");
    mocks.findFirst.mockResolvedValue(null);
    expect(await deliverJobEmail(payload, "id", false)).toBe("dropped");
  });
});
