import "server-only";

import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { BlockList, isIP, type LookupFunction } from "node:net";

/**
 * Hosts that makerspaces type in (their SMTP relay, a self-hosted Mattermost) must be public, so these
 * settings can't be used to reach services on the server's own network. Checked when saving and again when
 * connecting, because DNS can change in between.
 */
const PRIVATE = new BlockList();
for (const [network, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) PRIVATE.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) PRIVATE.addSubnet(network, prefix, "ipv6");
const GLOBAL_V6 = new BlockList();
GLOBAL_V6.addSubnet("2000::", 3, "ipv6");
const MAPPED_V4 = new BlockList();
MAPPED_V4.addSubnet("::ffff:0:0", 96, "ipv6");

export class PrivateHostError extends Error {
  override name = "PrivateHostError";
  constructor() {
    super("That host points at a private or internal address. Use a public host name.");
  }
}

export function isPrivateAddress(address: string) {
  const family = isIP(address);
  if (family === 0) return true;
  if (family === 4) return PRIVATE.check(address, "ipv4");
  // BlockList also applies IPv4 subnets to mapped IPv6, including expanded and hexadecimal spellings.
  if (MAPPED_V4.check(address, "ipv6")) return PRIVATE.check(address, "ipv6");
  return !GLOBAL_V6.check(address, "ipv6") || PRIVATE.check(address, "ipv6");
}

/** Resolve once, then give the vetted addresses to the transport. Development permits local fixtures. */
export async function resolvePublicHost(host: string): Promise<LookupAddress[]> {
  const hostname = host.replace(/^\[|\]$/g, "");
  const family = isIP(hostname);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let addresses: LookupAddress[];
  try {
    addresses = family ? [{ address: hostname, family }] : await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new PrivateHostError()), 5000); }),
    ]);
  } catch { throw new PrivateHostError(); }
  finally { clearTimeout(timer); }
  if (!addresses.length || (process.env.NODE_ENV === "production" && addresses.some((entry) => isPrivateAddress(entry.address)))) throw new PrivateHostError();
  return addresses;
}

/** Settings validation. Delivery must use resolvePublicHost and connect to its answers without resolving again. */
export async function assertPublicHost(host: string) {
  if (process.env.NODE_ENV === "production") await resolvePublicHost(host);
}

/** Supports both ordinary socket lookup and Node's all:true connection attempts. Never performs DNS. */
export function pinnedLookup(addresses: LookupAddress[]): LookupFunction {
  if (!addresses.length) throw new PrivateHostError();
  const pinned: LookupFunction = (_hostname, options, callback) => {
    const family = typeof options === "number" ? options : options.family;
    const matches = family === 4 || family === 6 ? addresses.filter((entry) => entry.family === family) : addresses;
    if (!matches.length) { callback(new PrivateHostError(), "", 0); return; }
    if (typeof options === "object" && "all" in options && options.all) {
      (callback as unknown as (error: null, values: LookupAddress[]) => void)(null, matches);
    } else callback(null, matches[0].address, matches[0].family);
  };
  return pinned;
}
