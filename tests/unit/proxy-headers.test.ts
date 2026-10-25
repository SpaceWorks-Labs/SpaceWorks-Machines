import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));

vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: mocks.checkRateLimit }));

import { proxy } from "@/proxy";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkRateLimit.mockResolvedValue(true);
});

const buckets = () => mocks.checkRateLimit.mock.calls.map((call) => call[1]);

describe("proxy response headers", () => {
  it("denies framing on every page and API response", async () => {
    const page = await proxy(new NextRequest("https://machines.example.test/s/acme"));
    expect(page.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(page.headers.get("x-frame-options")).toBe("DENY");
    expect(page.headers.get("cache-control")).toContain("no-transform");

    const api = await proxy(new NextRequest("https://machines.example.test/api/health/db"));
    expect(api.headers.get("x-frame-options")).toBe("DENY");
  });
});

describe("proxy rate limits", () => {
  it("gives payment webhooks their own bucket and skips the global limit", async () => {
    await proxy(new NextRequest("https://machines.example.test/api/webhooks/razorpay", { method: "POST" }));
    expect(buckets()).toEqual(["webhook"]);
  });

  it("refuses a webhook flood with 429", async () => {
    mocks.checkRateLimit.mockResolvedValue(false);
    const response = await proxy(new NextRequest("https://machines.example.test/api/webhooks/stripe", { method: "POST" }));
    expect(response.status).toBe(429);
  });

  it("keeps liveness independent of the limiter", async () => {
    await proxy(new NextRequest("https://machines.example.test/api/health"));
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });

  it("applies the action ceiling to server action posts", async () => {
    await proxy(new NextRequest("https://machines.example.test/dashboard/acme", { method: "POST", headers: { "next-action": "abc" } }));
    expect(buckets()).toContain("action");
  });
});
