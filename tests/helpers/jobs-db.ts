import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { restockPool } from "@/lib/consumables/pools";
import { submitJob, transitionJob, type JobCommand, type JobDependencies, type SubmitJobInput } from "@/lib/jobs";
import { machinesFixture, transaction } from "./machines-db";

export async function jobsFixture() {
  const fixture = await machinesFixture();
  const h = fixture.home;
  const suffix = randomUUID();
  const maker = await prisma.user.create({ data: { email: `maker-${suffix}@example.test`, emailVerified: new Date() } });
  const outsider = await prisma.user.create({ data: { email: `outside-${suffix}@example.test`, emailVerified: new Date() } });
  await prisma.spaceMember.create({ data: { userId: maker.id, spaceId: h.space.id, role: "MEMBER" } });
  await prisma.spaceMember.updateMany({ where: { spaceId: h.space.id, userId: h.user.id }, data: { role: "MACHINE_MANAGER" } });
  await prisma.machineType.update({ where: { id: h.type.id }, data: { allocationPolicy: "FIRST_IDLE", consumableUnit: "GRAMS", requesterPicksMachine: true } });
  await prisma.spaceJobSettings.create({ data: { spaceId: h.space.id, maxOpenJobsPerRequester: 100 } });
  await transaction((tx) => restockPool(tx, { spaceId: h.space.id, poolId: h.pool.id, actorId: h.user.id, quantity: "100" }));
  const submit = (data: Partial<SubmitJobInput> = {}, deps?: JobDependencies) => submitJob({ spaceId: h.space.id, actorId: maker.id, typeId: h.type.id, title: "Test part", ...data }, deps);
  const act = (jobId: string, command: JobCommand, deps?: JobDependencies, actorId = h.user.id) => transitionJob({ spaceId: h.space.id, actorId, jobId }, command, deps);
  const approve = async (deps?: JobDependencies) => {
    const { job } = await submit({}, deps);
    return (await act(job.id, { kind: "approve", estimatedMinutes: 60, estimatedQuantity: "10" }, deps)).job;
  };
  const running = async (deps?: JobDependencies) => {
    const job = await approve(deps);
    return (await act(job.id, { kind: "start", poolId: h.pool.id }, deps)).job;
  };
  return { ...fixture, maker, outsider, submit, act, approve, running,
    settings: (data: Prisma.SpaceJobSettingsUpdateInput) => prisma.spaceJobSettings.update({ where: { spaceId: h.space.id }, data }),
    type: (data: Prisma.MachineTypeUpdateInput) => prisma.machineType.update({ where: { id: h.type.id }, data }),
    readJob: (id: string) => prisma.job.findUniqueOrThrow({ where: { id } }),
    machine: () => prisma.machine.findUniqueOrThrow({ where: { id: h.machine.id } }),
    pool: () => prisma.consumablePool.findUniqueOrThrow({ where: { id: h.pool.id } }),
    async cleanup() {
      await fixture.cleanup();
      await prisma.user.deleteMany({ where: { id: { in: [maker.id, outsider.id] } } });
      await prisma.$disconnect();
    } };
}
export type JobsFixture = Awaited<ReturnType<typeof jobsFixture>>;
