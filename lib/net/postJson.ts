import "server-only";

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { pinnedLookup, resolvePublicHost } from "./publicHost";

/** Tenant-selected destination: validate DNS once and pin the connection, retaining hostname TLS checks. */
export async function postPublicJson(url: URL, body: string, headers: Record<string, string> = {}): Promise<number> {
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid destination.");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("Use HTTPS.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await resolvePublicHost(hostname);
  return new Promise<number>((resolve, reject) => {
    const request = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = request(url, {
      agent: false,
      lookup: pinnedLookup(addresses),
      ...(url.protocol === "https:" && !isIP(hostname) ? { servername: hostname } : {}),
      method: "POST",
      headers: { ...headers, "content-type": "application/json", "content-length": Buffer.byteLength(body) },
      signal: AbortSignal.timeout(10_000),
    }, (response) => {
      const status = response.statusCode ?? 0;
      response.destroy();
      resolve(status);
    });
    req.on("error", reject);
    req.end(body);
  });
}
