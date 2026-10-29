import { afterEach, describe, expect, it, vi } from "vitest";
import { isSafeMessageUrl } from "@/lib/outboxPayload";

afterEach(() => vi.unstubAllEnvs());

describe("email capability URLs", () => {
  function production() {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://makerspace.local");
    vi.stubEnv("ALLOW_PLAIN_HTTP", "0");
    vi.stubEnv("CI", "false");
    vi.stubEnv("ALLOW_INSECURE_PRODUCTION_TESTS", "0");
  }

  it("retains HTTPS and refuses unsafe protocols and embedded credentials", () => {
    production();
    expect(isSafeMessageUrl("https://makerspace.example/verify-email?token=fixture")).toBe(true);
    expect(isSafeMessageUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeMessageUrl("https://user:password@makerspace.example/")).toBe(false);
  });

  it("delivers links for explicitly supported HTTP installations only on their configured origin", () => {
    production();
    expect(isSafeMessageUrl("http://makerspace.local/reset-password?token=fixture")).toBe(false);
    vi.stubEnv("ALLOW_PLAIN_HTTP", "1");
    for (const path of ["verify-email", "reset-password", "api/auth/callback/nodemailer"]) {
      expect(isSafeMessageUrl(`http://makerspace.local/${path}?token=fixture`)).toBe(true);
    }
    expect(isSafeMessageUrl("http://foreign.example/verify-email?token=fixture")).toBe(false);
    expect(isSafeMessageUrl("http://makerspace.local:8000/verify-email")).toBe(false);
    expect(isSafeMessageUrl("http://user:password@makerspace.local/verify-email")).toBe(false);
  });

  it("requires both CI opt-ins and still restricts HTTP links to the configured origin", () => {
    production();
    vi.stubEnv("ALLOW_INSECURE_PRODUCTION_TESTS", "1");
    expect(isSafeMessageUrl("http://makerspace.local/verify-email")).toBe(false);
    vi.stubEnv("CI", "true");
    expect(isSafeMessageUrl("http://makerspace.local/verify-email")).toBe(true);
    expect(isSafeMessageUrl("http://foreign.example/verify-email")).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "invalid");
    expect(isSafeMessageUrl("http://makerspace.local/verify-email")).toBe(false);
  });
});
