import { afterEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => dns);
import { isPrivateAddress, pinnedLookup, resolvePublicHost } from "@/lib/net/publicHost";

afterEach(() => { vi.unstubAllEnvs(); dns.lookup.mockReset(); });

describe("outbound connection targets", () => {
  it.each([
    "::ffff:7f00:1", "0:0:0:0:0:ffff:7f00:1", "0:0:0:0:0:0:0:1", "::127.0.0.1",
    "64:ff9b::a9fe:a9fe", "2002:7f00:1::", "2001:db8::1", "192.0.2.1", "203.0.113.1",
  ])("rejects reserved and alternate address representation %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it("allows real public IPv4, mapped IPv4 and global IPv6", () => {
    for (const address of ["8.8.8.8", "::ffff:808:808", "0:0:0:0:0:ffff:808:808", "2606:4700:4700::1111"]) {
      expect(isPrivateAddress(address)).toBe(false);
    }
  });

  it("fails closed if any DNS answer is private, or resolution fails", async () => {
    vi.stubEnv("NODE_ENV", "production");
    dns.lookup.mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }]);
    await expect(resolvePublicHost("mixed.example.test")).rejects.toThrow("private or internal");
    dns.lookup.mockRejectedValueOnce(new Error("not found"));
    await expect(resolvePublicHost("missing.example.test")).rejects.toThrow("private or internal");
    await expect(resolvePublicHost("[::1]")).rejects.toThrow("private or internal");
  });

  it("pins the resolved answers for socket lookup without a second DNS query", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const addresses = [{ address: "8.8.8.8", family: 4 }, { address: "2606:4700:4700::1111", family: 6 }];
    dns.lookup.mockResolvedValueOnce(addresses);
    const lookup = pinnedLookup(await resolvePublicHost("rebind.example.test"));
    dns.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const ordinary = vi.fn();
    lookup("rebind.example.test", {}, ordinary);
    expect(ordinary).toHaveBeenCalledWith(null, "8.8.8.8", 4);
    const all = vi.fn();
    lookup("rebind.example.test", { all: true, family: 6 } as never, all);
    expect(all).toHaveBeenCalledWith(null, [addresses[1]]);
    expect(dns.lookup).toHaveBeenCalledOnce();
  });
});
