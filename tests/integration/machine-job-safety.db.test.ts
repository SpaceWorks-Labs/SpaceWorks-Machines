import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { changeMachineStatus, MachineInputError, setMachineRetired } from "@/lib/machines/machines";
import { endDowntime, startDowntime } from "@/lib/upkeep/downtime";
import { jobsFixture, type JobsFixture } from "../helpers/jobs-db";
import { transaction } from "../helpers/machines-db";

let f: JobsFixture;
beforeEach(async () => { f = await jobsFixture(); });
afterEach(async () => { await f?.cleanup(); });
const actor = () => ({ spaceId: f.home.space.id, actorId: f.home.user.id, machineId: f.home.machine.id });

describe("machine and job safety boundaries", () => {
  it.each(["RUNNING", "PAUSED"] as const)("blocks manual status changes and retirement for a %s job", async (status) => {
    const job = await f.running();
    if (status === "PAUSED") await f.act(job.id, { kind: "pause" });
    const before = await prisma.auditEvent.count({ where: { spaceId: f.home.space.id } });
    for (const target of ["IDLE", "RESERVED", "MAINTENANCE", "OFFLINE"] as const) {
      await expect(transaction((tx) => changeMachineStatus(tx, { ...actor(), status: target, note: "Manual edit" })))
        .rejects.toBeInstanceOf(MachineInputError);
    }
    await expect(transaction((tx) => setMachineRetired(tx, { ...actor(), retired: true })))
      .rejects.toBeInstanceOf(MachineInputError);
    expect(await f.machine()).toMatchObject({ status, retiredAt: null });
    expect((await f.readJob(job.id)).status).toBe(status);
    expect(await prisma.auditEvent.count({ where: { spaceId: f.home.space.id } })).toBe(before);
    if (status === "PAUSED") await f.act(job.id, { kind: "resume" });
    await f.act(job.id, { kind: "complete", actualMinutes: 3 });
    expect((await f.machine()).status).toBe("IDLE");
    await transaction((tx) => setMachineRetired(tx, { ...actor(), retired: true }));
    expect((await f.machine()).retiredAt).not.toBeNull();
  });

  it("allows cancellation to release the paused job's own machine and consumables", async () => {
    const job = await f.running();
    await f.act(job.id, { kind: "pause" });
    await f.act(job.id, { kind: "cancel", reason: "Stopped safely" });
    expect((await f.machine()).status).toBe("IDLE");
    expect((await f.pool()).remainingQuantity.toString()).toBe("100");
  });

  it("blocks returning a machine to service while its downtime remains open", async () => {
    await transaction((tx) => startDowntime(tx, actor(), { machineId: f.home.machine.id, reason: "PLANNED_MAINTENANCE" }));
    for (const status of ["IDLE", "RESERVED", "RUNNING", "PAUSED"] as const) {
      await expect(transaction((tx) => changeMachineStatus(tx, { ...actor(), status, note: "Bypass downtime" })))
        .rejects.toBeInstanceOf(MachineInputError);
    }
    await transaction((tx) => setMachineRetired(tx, { ...actor(), retired: true }));
    await expect(transaction((tx) => setMachineRetired(tx, { ...actor(), retired: false })))
      .rejects.toBeInstanceOf(MachineInputError);
    await transaction((tx) => endDowntime(tx, actor(), { machineId: f.home.machine.id }));
    await transaction((tx) => setMachineRetired(tx, { ...actor(), retired: false }));
    expect((await f.machine()).status).toBe("IDLE");
  });

  it("serialises a job start racing a manual offline change without stranding the job", async () => {
    const job = await f.approve();
    const results = await Promise.allSettled([
      f.act(job.id, { kind: "start", poolId: f.home.pool.id }),
      transaction((tx) => changeMachineStatus(tx, { ...actor(), status: "OFFLINE", note: "Safety check" })),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const current = await f.readJob(job.id);
    expect((await f.machine()).status).toBe(current.status === "RUNNING" ? "RUNNING" : "OFFLINE");
  });
});
