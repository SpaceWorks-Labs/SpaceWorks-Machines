-- CreateEnum
CREATE TYPE "FaultPhotoStage" AS ENUM ('REPORT', 'FIX');

-- CreateEnum
CREATE TYPE "TechnicianKind" AS ENUM ('STAFF', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "TechnicianChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "RepairRequestStatus" AS ENUM ('SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('UNPAID', 'PARTLY_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'UPI', 'OTHER');

-- CreateEnum
CREATE TYPE "ToBuyKind" AS ENUM ('PART', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "ToBuyStatus" AS ENUM ('REQUESTED', 'APPROVED', 'BOUGHT', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinanceDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "FinanceCategory" AS ENUM ('JOB_PAYMENT', 'JOB_REFUND', 'REPAIR_PAYOUT', 'MAINTENANCE', 'PARTS', 'CONSUMABLES', 'OTHER_INCOME', 'OTHER_EXPENSE', 'REVERSAL');

-- CreateEnum
CREATE TYPE "FinanceMethod" AS ENUM ('GATEWAY_RAZORPAY', 'GATEWAY_STRIPE', 'CASH', 'BANK_TRANSFER', 'UPI', 'OTHER');

-- AlterEnum
ALTER TYPE "FaultStatus" ADD VALUE 'FIXED';

-- AlterTable
ALTER TABLE "SpaceJobSettings" ADD COLUMN     "repairRequestExpiryDays" INTEGER NOT NULL DEFAULT 14;

-- AlterTable
ALTER TABLE "MaintenanceLog" ADD COLUMN     "costMethod" "PayoutMethod";

-- AlterTable
ALTER TABLE "FaultReport" ADD COLUMN     "amountAsked" INTEGER,
ADD COLUMN     "amountChangeReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "approvedAmount" INTEGER,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "fixParts" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "fixRemarks" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "fixedAt" TIMESTAMP(3),
ADD COLUMN     "paidAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "payoutStatus" "PayoutStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "reopenReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "technicianId" TEXT,
ADD COLUMN     "verifiedById" TEXT;

-- AlterTable
ALTER TABLE "FaultPhoto" ADD COLUMN     "stage" "FaultPhotoStage" NOT NULL DEFAULT 'REPORT';

-- CreateTable
CREATE TABLE "Technician" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "kind" "TechnicianKind" NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "whatsapp" TEXT NOT NULL DEFAULT '',
    "telegramChatId" TEXT NOT NULL DEFAULT '',
    "skills" TEXT[],
    "preferredChannel" "TechnicianChannel" NOT NULL DEFAULT 'EMAIL',
    "notes" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Technician_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairRequest" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "faultId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "status" "RepairRequestStatus" NOT NULL DEFAULT 'SENT',
    "channels" TEXT[],
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentById" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "closedReason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "RepairRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairPayout" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "faultId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "method" "PayoutMethod" NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "paidAt" TIMESTAMP(3) NOT NULL,
    "paidById" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToBuyItem" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" "ToBuyKind" NOT NULL DEFAULT 'PART',
    "title" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "machineId" TEXT,
    "poolId" TEXT,
    "faultId" TEXT,
    "maintenanceLogId" TEXT,
    "status" "ToBuyStatus" NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT NOT NULL DEFAULT '',
    "amount" INTEGER,
    "currency" TEXT,
    "method" "PayoutMethod",
    "reference" TEXT NOT NULL DEFAULT '',
    "supplier" TEXT NOT NULL DEFAULT '',
    "requestedById" TEXT,
    "approvedById" TEXT,
    "boughtById" TEXT,
    "boughtAt" TIMESTAMP(3),
    "receivedById" TEXT,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToBuyItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceEntry" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "direction" "FinanceDirection" NOT NULL,
    "category" "FinanceCategory" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "method" "FinanceMethod" NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "actorId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "machineId" TEXT,
    "typeId" TEXT,
    "technicianId" TEXT,
    "supplier" TEXT NOT NULL DEFAULT '',
    "reversesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Technician_spaceId_isActive_idx" ON "Technician"("spaceId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Technician_spaceId_id_key" ON "Technician"("spaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Technician_spaceId_userId_key" ON "Technician"("spaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RepairRequest_tokenHash_key" ON "RepairRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "RepairRequest_spaceId_faultId_idx" ON "RepairRequest"("spaceId", "faultId");

-- CreateIndex
CREATE INDEX "RepairRequest_spaceId_technicianId_status_idx" ON "RepairRequest"("spaceId", "technicianId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RepairRequest_spaceId_id_key" ON "RepairRequest"("spaceId", "id");

-- CreateIndex
CREATE INDEX "RepairPayout_spaceId_faultId_idx" ON "RepairPayout"("spaceId", "faultId");

-- CreateIndex
CREATE UNIQUE INDEX "RepairPayout_spaceId_id_key" ON "RepairPayout"("spaceId", "id");

-- CreateIndex
CREATE INDEX "ToBuyItem_spaceId_status_idx" ON "ToBuyItem"("spaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ToBuyItem_spaceId_number_key" ON "ToBuyItem"("spaceId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ToBuyItem_spaceId_id_key" ON "ToBuyItem"("spaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceEntry_reversesId_key" ON "FinanceEntry"("reversesId");

-- CreateIndex
CREATE INDEX "FinanceEntry_spaceId_occurredAt_idx" ON "FinanceEntry"("spaceId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinanceEntry_spaceId_machineId_idx" ON "FinanceEntry"("spaceId", "machineId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceEntry_sourceType_sourceId_key" ON "FinanceEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceEntry_spaceId_id_key" ON "FinanceEntry"("spaceId", "id");

-- AddForeignKey
ALTER TABLE "FaultReport" ADD CONSTRAINT "FaultReport_spaceId_technicianId_fkey" FOREIGN KEY ("spaceId", "technicianId") REFERENCES "Technician"("spaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Technician" ADD CONSTRAINT "Technician_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRequest" ADD CONSTRAINT "RepairRequest_spaceId_faultId_fkey" FOREIGN KEY ("spaceId", "faultId") REFERENCES "FaultReport"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRequest" ADD CONSTRAINT "RepairRequest_spaceId_technicianId_fkey" FOREIGN KEY ("spaceId", "technicianId") REFERENCES "Technician"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairPayout" ADD CONSTRAINT "RepairPayout_spaceId_faultId_fkey" FOREIGN KEY ("spaceId", "faultId") REFERENCES "FaultReport"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairPayout" ADD CONSTRAINT "RepairPayout_spaceId_technicianId_fkey" FOREIGN KEY ("spaceId", "technicianId") REFERENCES "Technician"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToBuyItem" ADD CONSTRAINT "ToBuyItem_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToBuyItem" ADD CONSTRAINT "ToBuyItem_spaceId_machineId_fkey" FOREIGN KEY ("spaceId", "machineId") REFERENCES "Machine"("spaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToBuyItem" ADD CONSTRAINT "ToBuyItem_spaceId_poolId_fkey" FOREIGN KEY ("spaceId", "poolId") REFERENCES "ConsumablePool"("spaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToBuyItem" ADD CONSTRAINT "ToBuyItem_spaceId_faultId_fkey" FOREIGN KEY ("spaceId", "faultId") REFERENCES "FaultReport"("spaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Money rules the database enforces as well.
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_amount_positive" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "FinanceEntry_currency" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "RepairPayout" ADD CONSTRAINT "RepairPayout_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "FaultReport" ADD CONSTRAINT "FaultReport_repair_amounts" CHECK (("amountAsked" IS NULL OR "amountAsked" >= 0) AND ("approvedAmount" IS NULL OR "approvedAmount" >= 0)
  AND "paidAmount" >= 0 AND ("approvedAmount" IS NULL OR "paidAmount" <= "approvedAmount"));
ALTER TABLE "ToBuyItem" ADD CONSTRAINT "ToBuyItem_amounts" CHECK ("quantity" > 0 AND ("amount" IS NULL OR "amount" > 0));
ALTER TABLE "SpaceJobSettings" ADD CONSTRAINT "SpaceJobSettings_repair_expiry" CHECK ("repairRequestExpiryDays" BETWEEN 1 AND 90);

-- The payout ledger and the finance ledger are append-only, like the other ledgers (see 0002).
CREATE TRIGGER "RepairPayout_append_only" BEFORE UPDATE OR DELETE ON "RepairPayout" FOR EACH ROW EXECUTE FUNCTION "swm_append_only"();
CREATE TRIGGER "FinanceEntry_append_only" BEFORE UPDATE OR DELETE ON "FinanceEntry" FOR EACH ROW EXECUTE FUNCTION "swm_append_only"();

-- Backfill: money that moved before the ledger existed, so history appears in Finance.
INSERT INTO "FinanceEntry" ("id", "spaceId", "direction", "category", "amountMinor", "currency", "method", "reference", "occurredAt", "sourceType", "sourceId",
  "actorId", "note", "machineId", "typeId", "createdAt")
SELECT 'bf-payment-' || p."id", p."spaceId", 'IN', 'JOB_PAYMENT', p."amount", p."currency",
  (CASE p."method" WHEN 'RAZORPAY' THEN 'GATEWAY_RAZORPAY' WHEN 'STRIPE' THEN 'GATEWAY_STRIPE' WHEN 'CASH' THEN 'CASH' WHEN 'BANK_TRANSFER' THEN 'BANK_TRANSFER'
    WHEN 'UPI' THEN 'UPI' ELSE 'OTHER' END)::"FinanceMethod",
  LEFT(p."reference", 200), COALESCE(p."paidAt", p."updatedAt"), 'Payment', p."id", p."recordedById", 'Job ' || j."number", COALESCE(j."assignedMachineId", j."machineId"), j."typeId", CURRENT_TIMESTAMP
FROM "Payment" p JOIN "Job" j ON j."id" = p."jobId" AND j."spaceId" = p."spaceId"
WHERE p."status" = 'PAID' AND p."amount" > 0 AND p."currency" ~ '^[A-Z]{3}$';

INSERT INTO "FinanceEntry" ("id", "spaceId", "direction", "category", "amountMinor", "currency", "method", "reference", "occurredAt", "sourceType", "sourceId",
  "actorId", "note", "machineId", "typeId", "createdAt")
SELECT 'bf-refund-' || r."id", r."spaceId", 'OUT', 'JOB_REFUND', r."amount", p."currency",
  (CASE p."method" WHEN 'RAZORPAY' THEN 'GATEWAY_RAZORPAY' WHEN 'STRIPE' THEN 'GATEWAY_STRIPE' WHEN 'CASH' THEN 'CASH' WHEN 'BANK_TRANSFER' THEN 'BANK_TRANSFER'
    WHEN 'UPI' THEN 'UPI' ELSE 'OTHER' END)::"FinanceMethod",
  COALESCE(r."providerRefundId", ''), COALESCE(r."processedAt", r."createdAt"), 'Refund', r."id", r."createdById", 'Job ' || j."number", COALESCE(j."assignedMachineId", j."machineId"), j."typeId", CURRENT_TIMESTAMP
FROM "Refund" r JOIN "Payment" p ON p."id" = r."paymentId" AND p."spaceId" = r."spaceId" JOIN "Job" j ON j."id" = p."jobId" AND j."spaceId" = p."spaceId"
WHERE r."status" = 'SUCCEEDED' AND r."amount" > 0 AND p."currency" ~ '^[A-Z]{3}$';

INSERT INTO "FinanceEntry" ("id", "spaceId", "direction", "category", "amountMinor", "currency", "method", "reference", "occurredAt", "sourceType", "sourceId",
  "actorId", "note", "machineId", "typeId", "supplier", "createdAt")
SELECT 'bf-maintenance-' || l."id", l."spaceId", 'OUT', 'MAINTENANCE', l."cost", s."currency", 'OTHER', '', l."performedAt", 'MaintenanceLog', l."id",
  l."performedById", LEFT(l."summary", 500), l."machineId", m."typeId", LEFT(l."vendor", 200), CURRENT_TIMESTAMP
FROM "MaintenanceLog" l JOIN "Space" s ON s."id" = l."spaceId" JOIN "Machine" m ON m."id" = l."machineId" AND m."spaceId" = l."spaceId"
WHERE l."cost" > 0 AND s."currency" ~ '^[A-Z]{3}$';
