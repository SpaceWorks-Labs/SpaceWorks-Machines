import { describe, expect, it } from "vitest";
import { cn } from "@/lib/cn";

describe("cn", () => {
  it("keeps V1 type-scale classes alongside text colours", () => {
    expect(cn("text-overline", "text-ink-muted")).toBe("text-overline text-ink-muted");
    expect(cn("text-h3 text-ink", "text-on-accent")).toBe("text-h3 text-on-accent");
  });

  it("lets a later type-scale class replace an earlier size", () => {
    expect(cn("text-sm", "text-caption")).toBe("text-caption");
  });
});
