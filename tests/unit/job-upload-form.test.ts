import { describe, expect, it } from "vitest";
import { readJobMultipart } from "@/lib/files/multipart";

describe("bounded job multipart reads", () => {
  it("preserves repeated files and values", async () => {
    const f = new FormData(); f.set("values", '{"title":"Part"}');
    f.append("files", new File(["first"], "first.txt")); f.append("files", new File(["second"], "second.txt"));
    const result = await readJobMultipart(new Request("http://localhost/upload", { method: "POST", body: f }), 1024, 2);
    expect(result.get("values")).toBe('{"title":"Part"}');
    expect(result.getAll("files").map((f) => (f as File).name)).toEqual(["first.txt", "second.txt"]);
  });
  it("rejects oversized Content-Length before reading the body", async () => {
    const request = new Request("http://localhost/upload", { method: "POST", headers: { "content-length": "1000000" }, body: "body" });
    await expect(readJobMultipart(request, 1024, 1)).rejects.toThrow(/upload limit/);
    expect(request.bodyUsed).toBe(false);
  });
  it("also bounds chunked bodies without a length header", async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(140000)); controller.close(); } });
    const init: RequestInit & { duplex: "half" } = { method: "POST", headers: { "content-type": "multipart/form-data; boundary=test" }, body, duplex: "half" };
    await expect(readJobMultipart(new Request("http://localhost/upload", init), 1024, 1)).rejects.toThrow();
  });
});
