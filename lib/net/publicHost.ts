import "server-only";

import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * Hosts that spaces type in (their SMTP relay, a self-hosted Mattermost) must be public, so these
 * settings can't be used to reach services on the server's own network. Checked when saving and again when
 * connecting, because DNS can change in between.
 */
const PRIVATE = new BlockList();
for (const [network, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) PRIVATE.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96]] as const) PRIVATE.addSubnet(network, prefix, "ipv6");

export class PrivateHostError extends Error {
  override name = "PrivateHostError";
  constructor() {
    super("That host points at a private or internal address. Use a public host name.");
  }
}

export function isPrivateAddress(address: string) {
  const family = isIP(address);
  if (family === 0) return true;
  if (family === 6 && address.toLowerCase().startsWith("::ffff:")) return isPrivateAddress(address.slice(7));
  return PRIVATE.check(address, family === 4 ? "ipv4" : "ipv6");
}

/** Resolve a host name and refuse it unless every address it resolves to is public. Development allows local hosts. */
export async function assertPublicHost(host: string) {
  if (process.env.NODE_ENV !== "production") return;
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) throw new PrivateHostError();
}
