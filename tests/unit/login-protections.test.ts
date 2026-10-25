import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isBreachedPassword } from "@/lib/breachedPassword";
import { isPrivateAddress } from "@/lib/net/publicHost";
import { deviceLabel, justVerified } from "@/lib/loginSecurity";
import { senderAddress } from "@/lib/email/spaceTransport";

beforeAll(() => {
  process.env.AUTH_SECRET ??= "unit-test-secret-unit-test-secret-1234";
});

beforeEach(() => {
  delete process.env.PWNED_PASSWORDS_CHECK;
});

afterEach(() => {
  process.env.PWNED_PASSWORDS_CHECK = "0";
});

describe("breached passwords", () => {
  // SHA-1 of "password" is 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8.
  const fetcher = (body: string, status = 200) => vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;

  it("sends only the hash prefix and refuses a listed password", async () => {
    const call = fetcher("1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493\r\nABCDEF0123456789ABCDEF0123456789ABC:0");
    expect(await isBreachedPassword("password", call)).toBe(true);
    expect(vi.mocked(call).mock.calls[0][0]).toBe("https://api.pwnedpasswords.com/range/5BAA6");
  });

  it("ignores padding rows and allows the password when the service fails or the check is off", async () => {
    expect(await isBreachedPassword("password", fetcher("1E4C9B93F3F0682250B6CF8331B7EE68FD8:0"))).toBe(false);
    expect(await isBreachedPassword("password", fetcher("", 503))).toBe(false);
    expect(await isBreachedPassword("password", vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toBe(false);
    process.env.PWNED_PASSWORDS_CHECK = "0";
    expect(await isBreachedPassword("password", fetcher("1E4C9B93F3F0682250B6CF8331B7EE68FD8:9"))).toBe(false);
  });
});


describe("private addresses", () => {
  it("refuses loopback, private, link-local and mapped addresses but allows public ones", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "172.20.0.5", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "0.0.0.0", "not-an-ip"]) expect(isPrivateAddress(address)).toBe(true);
    for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) expect(isPrivateAddress(address)).toBe(false);
  });
});

describe("new sign-ins", () => {
  it("names the device from the user agent without keeping it", () => {
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36")).toBe("Chrome on Windows");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari on iOS");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0) Chrome/141.0 Safari/537.36 Edg/141.0")).toBe("Edge on Windows");
    expect(deviceLabel(null)).toBe("A browser");
  });

  it("skips the emailed code only within an hour of verifying the email", () => {
    const now = Date.UTC(2026, 9, 21, 12);
    expect(justVerified(new Date(now - 30 * 60_000), now)).toBe(true);
    expect(justVerified(new Date(now - 2 * 60 * 60_000), now)).toBe(false);
    expect(justVerified(null, now)).toBe(false);
  });

  it("reads the bare sender address the platform sends from", () => {
    expect(senderAddress("Space Works Machines <noreply@example.org>")).toBe("noreply@example.org");
    expect(senderAddress("noreply@example.org")).toBe("noreply@example.org");
  });
});
