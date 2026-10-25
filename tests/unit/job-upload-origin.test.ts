import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "@/lib/net/sameOrigin";

describe("job upload origins behind Next's listening host", () => {
  it("accepts the actual browser host when Next uses an internal hostname", () => {
    expect(isSameOriginRequest(new Request("http://localhost:3030/api/upload", { headers: { host: "127.0.0.1:3030", origin: "http://127.0.0.1:3030" } }))).toBe(true);
  });
  it("rejects unrelated origins and malformed Host headers", () => {
    for (const host of ["127.0.0.1:3030", "unrelated.test@127.0.0.1:3030", "127.0.0.1:3030/path"]) {
      expect(isSameOriginRequest(new Request("http://localhost:3030/api/upload", { headers: { host, origin: "https://unrelated.test" } }))).toBe(false);
    }
  });
});
