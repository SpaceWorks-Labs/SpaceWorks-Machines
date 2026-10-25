import { afterEach, describe, expect, it, vi } from "vitest";
import { getClientIpFromHeaders } from "@/lib/rateLimit";

const forwarded = (value: string) => new Headers({ "x-forwarded-for": value });

describe("client IP from X-Forwarded-For", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the left-most entry when the edge overwrites the header", () => {
    vi.stubEnv("TRUSTED_PROXY_IP_HEADER", "x-forwarded-for");
    vi.stubEnv("TRUSTED_PROXY_HOPS", "");
    expect(getClientIpFromHeaders(forwarded("203.0.113.7"))).toBe("203.0.113.7");
  });

  it("ignores client-chosen entries when one trusted proxy appends", () => {
    vi.stubEnv("TRUSTED_PROXY_IP_HEADER", "x-forwarded-for");
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    expect(getClientIpFromHeaders(forwarded("1.2.3.4, 9.9.9.9, 203.0.113.7"))).toBe("203.0.113.7");
    expect(getClientIpFromHeaders(forwarded("203.0.113.7"))).toBe("203.0.113.7");
  });

  it("counts several trusted proxies from the right and never reads past the start", () => {
    vi.stubEnv("TRUSTED_PROXY_IP_HEADER", "x-forwarded-for");
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    expect(getClientIpFromHeaders(forwarded("1.2.3.4, 203.0.113.7, 10.0.0.2"))).toBe("203.0.113.7");
    expect(getClientIpFromHeaders(forwarded("203.0.113.7"))).toBe("203.0.113.7");
  });

  it("does not apply hops to single-value headers", () => {
    vi.stubEnv("TRUSTED_PROXY_IP_HEADER", "cf-connecting-ip");
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    expect(getClientIpFromHeaders(new Headers({ "cf-connecting-ip": "203.0.113.7" }))).toBe("203.0.113.7");
  });
});
