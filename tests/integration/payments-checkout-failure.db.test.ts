import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createJobCheckout, recordOfflinePayment, waivePayment } from "@/lib/payments/jobs";
import { paymentsFixture, type PaymentsFixture } from "../helpers/payments-db";

vi.mock("@/lib/webhooks/emit", async (original) => ({ ...await original<object>(), enqueueWebhookDeliveries: vi.fn() }));
let f: PaymentsFixture;
beforeEach(async () => { f = await paymentsFixture(); await f.configure("UPFRONT"); await f.gateway("STRIPE"); });
afterEach(async () => { await f?.cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("checkout creation failures", () => {
  it.each([
    ["local validation", "offline"], ["local validation", "waiver"],
    ["provider rejection", "offline"], ["provider rejection", "waiver"],
  ])("releases intent after %s to allow %s", async (failure, method) => {
    if (failure === "local validation") {
      await prisma.space.update({ where: { id: f.spaceId }, data: { currency: "KWD" } });
      await f.configure("UPFRONT", { flatFee: 1001 });
    }
    const job = await f.approve();
    const [payment] = await f.payments(job);
    const context = f.context(payment.id);
    if (failure === "provider rejection") f.network.failNext();
    await expect(createJobCheckout(context)).rejects.toThrow(failure === "local validation" ? "multiples of 10" : "Provider rejected request");
    expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toMatchObject({ checkoutKey: null, checkoutStartedAt: null, checkoutUrl: null });
    expect(f.network.sessions.size).toBe(0);
    if (failure === "local validation") expect(f.network.http).not.toHaveBeenCalled();
    const result = method === "offline" ? await recordOfflinePayment(context, { method: "CASH", reference: "Receipt" }) : await waivePayment(context, "Courtesy");
    expect(result.status).toBe(method === "offline" ? "PAID" : "WAIVED");
  });

  it.each(["lost response", "server error", "malformed response", "request timeout", "idempotency conflict"])("retains intent after %s", async (failure) => {
    const job = await f.approve();
    const [payment] = await f.payments(job);
    const context = f.context(payment.id);
    if (failure === "lost response") f.network.loseNext();
    else {
      const status = failure === "server error" ? 500 : failure === "request timeout" ? 408 : failure === "idempotency conflict" ? 409 : 200;
      f.network.http.mockImplementationOnce(async () => new Response("{}", { status }));
    }
    await expect(createJobCheckout(context)).rejects.toThrow();
    const before = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(before.checkoutKey).toBeTruthy();
    await expect(recordOfflinePayment(context, { method: "CASH", reference: "Receipt" })).rejects.toThrow("checkout");
    await expect(waivePayment(context, "Courtesy")).rejects.toThrow("checkout");
    const recovered = await createJobCheckout(context);
    expect(recovered.checkoutKey).toBe(before.checkoutKey);
    expect(f.network.sessions.size).toBe(1);
  });
});
