import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => dns);
import { postPublicJson } from "@/lib/net/postJson";

afterEach(() => { vi.unstubAllEnvs(); dns.lookup.mockReset(); });

it("delivers to the pinned development address with the original Host and never follows redirects", async () => {
  vi.stubEnv("NODE_ENV", "test");
  dns.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
  const received: { host?: string; body?: string; signature?: string }[] = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    received.push({ host: request.headers.host, body, signature: request.headers["x-signature"] as string });
    response.writeHead(302, { location: "http://127.0.0.1:1/internal" }).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    expect(await postPublicJson(new URL(`http://webhook.example.test:${port}/event`), '{"ok":true}', { "x-signature": "signed" })).toBe(302);
    expect(received).toEqual([{ host: `webhook.example.test:${port}`, body: '{"ok":true}', signature: "signed" }]);
    expect(dns.lookup).toHaveBeenCalledOnce();
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

it("rejects private production targets before opening a connection", async () => {
  vi.stubEnv("NODE_ENV", "production");
  dns.lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
  await expect(postPublicJson(new URL("https://metadata.example.test/"), "{}")).rejects.toThrow("private or internal");
  await expect(postPublicJson(new URL("http://public.example.test/"), "{}")).rejects.toThrow("HTTPS");
});
