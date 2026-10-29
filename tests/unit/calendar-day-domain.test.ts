import { afterEach, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { financialDay } from "@/lib/calendarDay";
import { postManualEntry } from "@/lib/finance/post";

afterEach(() => vi.useRealTimers());

it("the real finance domain rejects tomorrow instead of silently posting it today", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-29T20:34:00Z"));
  const tx = { space: { findUniqueOrThrow: vi.fn().mockResolvedValue({ currency: "INR" }) } } as unknown as Prisma.TransactionClient;
  await expect(postManualEntry(tx, { spaceId: "space", actorId: "staff" }, {
    category: "OTHER_INCOME", amountMinor: 100, method: "CASH", note: "Gift",
    occurredAt: financialDay("2026-10-31", "Asia/Kolkata")!,
  })).rejects.toThrow("The date can't be in the future.");
});
