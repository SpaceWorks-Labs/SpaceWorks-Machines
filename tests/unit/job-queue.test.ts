import { describe, expect, it } from "vitest";
import { queuePosition, type QueueJob } from "@/lib/jobs/queue";

const now = new Date("2026-01-01T12:00:00Z");
const job = (id: string, data: Partial<QueueJob> = {}): QueueJob => ({ id, spaceId: "space", typeId: "type", machineId: null,
  status: "SUBMITTED", priority: 0, submittedAt: new Date("2026-01-01T10:00:00Z"), estimatedMinutes: 30, ...data });
const machines = ["m1", "m2"].map((id) => ({ id, spaceId: "space", typeId: "type" }));

describe("job queue", () => {
  it("orders priority, approval, submittedAt, then id without mutating input", () => {
    const target = job("z"); const rows = [target, job("a"), job("late-approved", { status: "APPROVED", submittedAt: now }),
      job("priority", { priority: 1 }), job("early", { submittedAt: new Date("2026-01-01T09:00Z") })];
    expect(queuePosition(target, rows, machines, now)).toEqual({ position: 5, approvedAhead: 1, awaitingReviewAhead: 3, etaMinutes: 60 });
    expect(rows[0]).toBe(target);
  });
  it("reports awaiting review ahead only to submitted jobs", () => {
    const target = job("target", { status: "APPROVED" });
    expect(queuePosition(target, [job("bump", { priority: 2 }), target], machines, now)).toMatchObject({ position: 2, approvedAhead: 0, awaitingReviewAhead: 0 });
  });
  it("adds non-negative running remainders and divides by available machines", () => {
    const target = job("z");
    const rows = [target, job("approved", { status: "APPROVED", estimatedMinutes: 40 }),
      job("running", { status: "RUNNING", estimatedMinutes: 100, startedAt: new Date("2026-01-01T11:00Z") }),
      job("overrun", { status: "RUNNING", estimatedMinutes: 10, startedAt: new Date("2026-01-01T11:00Z") })];
    expect(queuePosition(target, rows, machines, now)?.etaMinutes).toBe(40);
  });
  it("isolates tenants and types; scoped machines use their own queue", () => {
    const target = job("z", { machineId: "m1" });
    const rows = [target, job("other-machine", { machineId: "m2", status: "APPROVED" }), job("pooled", { status: "APPROVED" }),
      job("foreign", { spaceId: "away", machineId: "m1" }), job("type", { typeId: "other", machineId: "m1" }),
      job("ahead", { machineId: "m1", status: "APPROVED" })];
    expect(queuePosition(target, rows, machines, now)).toMatchObject({ position: 2, approvedAhead: 1, etaMinutes: 15 });
  });
  it("handles no estimate, no active machines, absent jobs and finished jobs", () => {
    const target = job("z");
    expect(queuePosition(target, [job("a", { estimatedMinutes: null }), target], [], now)?.etaMinutes).toBeNull();
    expect(queuePosition(target, [], machines, now)).toBeNull();
    expect(queuePosition(job("done", { status: "COMPLETED" }), [], machines, now)).toBeNull();
  });
});
