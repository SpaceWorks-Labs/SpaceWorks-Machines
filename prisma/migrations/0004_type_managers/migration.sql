-- Owner decisions 2026-10-24: no Owner and no Space manager role. The Machine manager is the top role and holds
-- every capability both had; every OWNER and MANAGER becomes a MACHINE_MANAGER. TYPE_MANAGER manages only the
-- machine types assigned to them.
UPDATE "SpaceMember" SET "role" = 'MACHINE_MANAGER' WHERE "role" IN ('OWNER', 'MANAGER');
UPDATE "SpaceInvite" SET "role" = 'MACHINE_MANAGER' WHERE "role" IN ('OWNER', 'MANAGER');

-- Postgres can't drop an enum value: recreate the type and move the columns (and what depends on them) over.
ALTER TABLE "SpaceMember" DROP CONSTRAINT "SpaceMember_staff_active";
DROP INDEX "SpaceMember_spaceId_role_status_idx";
ALTER TYPE "SpaceRole" RENAME TO "SpaceRole_old";
CREATE TYPE "SpaceRole" AS ENUM ('MACHINE_MANAGER', 'TYPE_MANAGER', 'OPERATOR', 'TECHNICIAN', 'VIEWER', 'MEMBER');
ALTER TABLE "SpaceMember" ALTER COLUMN "role" TYPE "SpaceRole" USING ("role"::text::"SpaceRole");
ALTER TABLE "SpaceInvite" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "SpaceInvite" ALTER COLUMN "role" TYPE "SpaceRole" USING ("role"::text::"SpaceRole");
ALTER TABLE "SpaceInvite" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
DROP TYPE "SpaceRole_old";
CREATE INDEX "SpaceMember_spaceId_role_status_idx" ON "SpaceMember"("spaceId", "role", "status");
ALTER TABLE "SpaceMember" ADD CONSTRAINT "SpaceMember_staff_active" CHECK ("role" = 'MEMBER' OR "status" = 'ACTIVE');

-- CreateTable
CREATE TABLE "TypeManagerAssignment" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "machineTypeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TypeManagerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TypeManagerAssignment_spaceId_userId_idx" ON "TypeManagerAssignment"("spaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TypeManagerAssignment_spaceId_machineTypeId_userId_key" ON "TypeManagerAssignment"("spaceId", "machineTypeId", "userId");

-- AddForeignKey
ALTER TABLE "TypeManagerAssignment" ADD CONSTRAINT "TypeManagerAssignment_spaceId_machineTypeId_fkey" FOREIGN KEY ("spaceId", "machineTypeId") REFERENCES "MachineType"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TypeManagerAssignment" ADD CONSTRAINT "TypeManagerAssignment_userId_spaceId_fkey" FOREIGN KEY ("userId", "spaceId") REFERENCES "SpaceMember"("userId", "spaceId") ON DELETE CASCADE ON UPDATE CASCADE;
