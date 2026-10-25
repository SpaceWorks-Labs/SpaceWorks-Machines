-- CreateEnum
CREATE TYPE "MeteringUnit" AS ENUM ('MINUTES', 'GRAMS', 'MILLILITERS', 'MILLIMETERS', 'SQUARE_CM', 'SHEETS', 'COUNT');

-- CreateEnum
CREATE TYPE "MachineStatus" AS ENUM ('IDLE', 'RUNNING', 'PAUSED', 'RESERVED', 'MAINTENANCE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "AllocationPolicy" AS ENUM ('FIRST_IDLE', 'STAFF_SELECT');

-- CreateEnum
CREATE TYPE "MachineDocumentKind" AS ENUM ('MANUAL', 'SOP', 'SAFETY', 'DATASHEET', 'OTHER');

-- CreateEnum
CREATE TYPE "ConsumableAdjustmentKind" AS ENUM ('RESERVE', 'RECONCILE', 'RELEASE', 'MANUAL', 'CORRECTION', 'RESTOCK', 'RETIRE');

-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('FREE', 'FLAT', 'TIME', 'MATERIAL', 'TIME_AND_MATERIAL');

-- CreateEnum
CREATE TYPE "PricingAudience" AS ENUM ('MEMBER', 'PUBLIC');

-- CreateEnum
CREATE TYPE "PaymentTiming" AS ENUM ('UPFRONT', 'ON_COMPLETION', 'PAY_LATER');

-- CreateEnum
CREATE TYPE "DepositMode" AS ENUM ('NONE', 'FIXED', 'PERCENT');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'RUNNING', 'PAUSED', 'COMPLETED', 'COLLECTED', 'REJECTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobPaymentState" AS ENUM ('NOT_REQUIRED', 'QUOTED', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'WAIVED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "JobFileKind" AS ENUM ('MODEL', 'ATTACHMENT', 'PREVIEW', 'RESULT');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('DEPOSIT', 'CHARGE', 'BALANCE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('RAZORPAY', 'STRIPE', 'CASH', 'BANK_TRANSFER', 'UPI', 'CARD_TERMINAL', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'WAIVED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('JOB_FAILED', 'JOB_CANCELLED', 'JOB_REJECTED', 'OVERPAYMENT', 'DUPLICATE', 'GOODWILL', 'OTHER');

-- CreateEnum
CREATE TYPE "JobEligibility" AS ENUM ('ANYONE', 'MEMBERS_ONLY', 'STAFF_ONLY');

-- CreateEnum
CREATE TYPE "RefundRule" AS ENUM ('FULL', 'PERCENT', 'NONE', 'MANUAL');

-- CreateEnum
CREATE TYPE "UsageSource" AS ENUM ('JOB', 'MANUAL', 'ADAPTER');

-- CreateEnum
CREATE TYPE "MaintenanceTrigger" AS ENUM ('TIME', 'USAGE_HOURS', 'JOB_COUNT');

-- CreateEnum
CREATE TYPE "MaintenanceKind" AS ENUM ('PREVENTIVE', 'CORRECTIVE', 'INSPECTION', 'CALIBRATION', 'WARRANTY_REPAIR');

-- CreateEnum
CREATE TYPE "DowntimeReason" AS ENUM ('PLANNED_MAINTENANCE', 'FAULT', 'REPAIR', 'WAITING_PARTS', 'OTHER');

-- CreateEnum
CREATE TYPE "FaultSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FaultStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'WONT_FIX');

-- CreateEnum
CREATE TYPE "PrinterAdapterKind" AS ENUM ('MANUAL', 'SIMULATED', 'OCTOPRINT', 'MOONRAKER', 'BAMBU', 'PRUSALINK');

-- CreateEnum
CREATE TYPE "PrinterConnectionState" AS ENUM ('UNCONFIGURED', 'CONNECTED', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "MachineType" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'wrench',
    "description" TEXT NOT NULL DEFAULT '',
    "presetKey" TEXT,
    "specFields" JSONB NOT NULL DEFAULT '[]',
    "requestFields" JSONB NOT NULL DEFAULT '[]',
    "filePolicy" JSONB NOT NULL,
    "materials" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "colours" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "meteringUnit" "MeteringUnit" NOT NULL DEFAULT 'MINUTES',
    "consumableUnit" "MeteringUnit",
    "acceptsJobs" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "allocationPolicy" "AllocationPolicy" NOT NULL DEFAULT 'STAFF_SELECT',
    "maxConcurrentJobs" INTEGER,
    "requesterPicksMachine" BOOLEAN NOT NULL DEFAULT false,
    "maxOpenJobsPerRequester" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MachineType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "serialNumber" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "MachineStatus" NOT NULL DEFAULT 'IDLE',
    "statusNote" TEXT NOT NULL DEFAULT '',
    "specs" JSONB NOT NULL DEFAULT '{}',
    "firmwareVersion" TEXT NOT NULL DEFAULT '',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "acceptsJobs" BOOLEAN NOT NULL DEFAULT true,
    "acquiredOn" DATE,
    "purchaseCost" INTEGER,
    "meterMinutes" INTEGER NOT NULL DEFAULT 0,
    "meterJobs" INTEGER NOT NULL DEFAULT 0,
    "retiredAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachinePhoto" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',
    "width" INTEGER,
    "height" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MachinePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineDocument" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "kind" "MachineDocumentKind" NOT NULL DEFAULT 'MANUAL',
    "title" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MachineDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumablePool" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "machineId" TEXT,
    "typeId" TEXT,
    "material" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT '',
    "colourHex" TEXT NOT NULL DEFAULT '',
    "brand" TEXT NOT NULL DEFAULT '',
    "lotCode" TEXT NOT NULL DEFAULT '',
    "unit" "MeteringUnit" NOT NULL,
    "initialQuantity" DECIMAL(14,3) NOT NULL,
    "remainingQuantity" DECIMAL(14,3) NOT NULL,
    "lowThreshold" DECIMAL(14,3),
    "costPerUnit" INTEGER,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lowAlertedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsumablePool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumableAdjustment" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "kind" "ConsumableAdjustmentKind" NOT NULL,
    "delta" DECIMAL(14,3) NOT NULL,
    "balanceAfter" DECIMAL(14,3) NOT NULL,
    "jobId" TEXT,
    "usageLogId" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumableAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "typeId" TEXT,
    "machineId" TEXT,
    "audience" "PricingAudience" NOT NULL DEFAULT 'MEMBER',
    "mode" "PricingMode" NOT NULL DEFAULT 'FREE',
    "flatFee" INTEGER NOT NULL DEFAULT 0,
    "timeRatePerHour" INTEGER NOT NULL DEFAULT 0,
    "materialRate" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "setupFee" INTEGER NOT NULL DEFAULT 0,
    "minimumCharge" INTEGER NOT NULL DEFAULT 0,
    "timeIncrementMinutes" INTEGER NOT NULL DEFAULT 1,
    "depositMode" "DepositMode" NOT NULL DEFAULT 'NONE',
    "depositValue" INTEGER NOT NULL DEFAULT 0,
    "paymentTiming" "PaymentTiming",
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "requesterId" TEXT NOT NULL,
    "audience" "PricingAudience" NOT NULL,
    "typeId" TEXT NOT NULL,
    "machineId" TEXT,
    "assignedMachineId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sourceLink" TEXT NOT NULL DEFAULT '',
    "requestData" JSONB NOT NULL DEFAULT '{}',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "JobStatus" NOT NULL DEFAULT 'SUBMITTED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "statusReason" TEXT NOT NULL DEFAULT '',
    "estimatedMinutes" INTEGER,
    "estimatedQuantity" DECIMAL(14,3),
    "actualMinutes" INTEGER,
    "actualQuantity" DECIMAL(14,3),
    "failPercent" INTEGER,
    "poolId" TEXT,
    "reservedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "runSnapshot" JSONB,
    "progressPercent" INTEGER,
    "currency" TEXT NOT NULL,
    "quotedAmount" INTEGER,
    "finalAmount" INTEGER,
    "depositAmount" INTEGER NOT NULL DEFAULT 0,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "amountRefunded" INTEGER NOT NULL DEFAULT 0,
    "paymentTiming" "PaymentTiming",
    "paymentState" "JobPaymentState" NOT NULL DEFAULT 'NOT_REQUIRED',
    "pricingSnapshot" JSONB,
    "priceOverrideReason" TEXT NOT NULL DEFAULT '',
    "statusToken" TEXT NOT NULL,
    "reprintOfId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "startedAt" TIMESTAMP(3),
    "startedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "failedAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3),
    "collectedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobFile" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "kind" "JobFileKind" NOT NULL DEFAULT 'MODEL',
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "metadata" JSONB,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobEvent" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fromStatus" "JobStatus",
    "toStatus" "JobStatus",
    "actorId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobNote" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "authorId" TEXT,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceCounter" (
    "spaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SpaceCounter_pkey" PRIMARY KEY ("spaceId","key")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL DEFAULT 'CHARGE',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "method" "PaymentMethod",
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "checkoutUrl" TEXT,
    "checkoutExpiresAt" TIMESTAMP(3),
    "reference" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "paidAt" TIMESTAMP(3),
    "recordedById" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "amountRefunded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "RefundReason" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "viaGateway" BOOLEAN NOT NULL DEFAULT false,
    "providerRefundId" TEXT,
    "failureReason" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceJobSettings" (
    "spaceId" TEXT NOT NULL,
    "jobsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "eligibility" "JobEligibility" NOT NULL DEFAULT 'MEMBERS_ONLY',
    "publicUsesMemberRates" BOOLEAN NOT NULL DEFAULT false,
    "maxOpenJobsPerRequester" INTEGER NOT NULL DEFAULT 5,
    "allowRequesterCancel" BOOLEAN NOT NULL DEFAULT true,
    "paymentsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultPaymentTiming" "PaymentTiming" NOT NULL DEFAULT 'ON_COMPLETION',
    "allowPayLater" BOOLEAN NOT NULL DEFAULT true,
    "requirePaymentBeforeCollection" BOOLEAN NOT NULL DEFAULT true,
    "onlineMethods" "PaymentMethod"[] DEFAULT ARRAY[]::"PaymentMethod"[],
    "offlineMethods" "PaymentMethod"[] DEFAULT ARRAY['CASH', 'UPI', 'BANK_TRANSFER']::"PaymentMethod"[],
    "taxRateBps" INTEGER NOT NULL DEFAULT 0,
    "taxInclusive" BOOLEAN NOT NULL DEFAULT true,
    "taxLabel" TEXT NOT NULL DEFAULT 'GST',
    "refundOnFailure" "RefundRule" NOT NULL DEFAULT 'FULL',
    "refundOnFailurePercent" INTEGER NOT NULL DEFAULT 100,
    "refundOnCancel" "RefundRule" NOT NULL DEFAULT 'FULL',
    "refundOnCancelPercent" INTEGER NOT NULL DEFAULT 100,
    "refundOnReject" "RefundRule" NOT NULL DEFAULT 'FULL',
    "requesterEmails" JSONB NOT NULL DEFAULT '{}',
    "staffAlerts" JSONB NOT NULL DEFAULT '{}',
    "lowStockAlerts" BOOLEAN NOT NULL DEFAULT true,
    "maintenanceReminderDays" INTEGER NOT NULL DEFAULT 3,
    "warrantyReminderDays" INTEGER NOT NULL DEFAULT 30,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaceJobSettings_pkey" PRIMARY KEY ("spaceId")
);

-- CreateTable
CREATE TABLE "UsageLog" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "source" "UsageSource" NOT NULL,
    "jobId" TEXT,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "quantity" DECIMAL(14,3),
    "unit" "MeteringUnit",
    "poolId" TEXT,
    "succeeded" BOOLEAN NOT NULL DEFAULT true,
    "percentComplete" INTEGER NOT NULL DEFAULT 100,
    "note" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "loggedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceSchedule" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "checklist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "trigger" "MaintenanceTrigger" NOT NULL DEFAULT 'TIME',
    "intervalDays" INTEGER,
    "intervalHours" INTEGER,
    "intervalJobs" INTEGER,
    "nextDueAt" TIMESTAMP(3),
    "lastDoneAt" TIMESTAMP(3),
    "meterMinutesAtLast" INTEGER NOT NULL DEFAULT 0,
    "meterJobsAtLast" INTEGER NOT NULL DEFAULT 0,
    "blockWhenOverdue" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastNotifiedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceLog" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "faultId" TEXT,
    "kind" "MaintenanceKind" NOT NULL DEFAULT 'PREVENTIVE',
    "summary" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "partsNote" TEXT NOT NULL DEFAULT '',
    "cost" INTEGER,
    "vendor" TEXT NOT NULL DEFAULT '',
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedById" TEXT,
    "meterMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceAttachment" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "logId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Downtime" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "reason" "DowntimeReason" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "faultId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "startedById" TEXT,
    "endedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Downtime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaultReport" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "reportedById" TEXT,
    "jobId" TEXT,
    "severity" "FaultSeverity" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "FaultStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "resolution" TEXT NOT NULL DEFAULT '',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaultReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaultPhoto" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "faultId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaultPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warranty" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL DEFAULT '',
    "vendorContact" TEXT NOT NULL DEFAULT '',
    "vendorEmail" TEXT NOT NULL DEFAULT '',
    "vendorPhone" TEXT NOT NULL DEFAULT '',
    "contractNumber" TEXT NOT NULL DEFAULT '',
    "coverage" TEXT NOT NULL DEFAULT '',
    "purchasedOn" DATE,
    "startsOn" DATE,
    "expiresOn" DATE,
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warranty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyDocument" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "warrantyId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarrantyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrinterConnection" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "adapter" "PrinterAdapterKind" NOT NULL DEFAULT 'MANUAL',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "baseUrl" TEXT NOT NULL DEFAULT '',
    "deviceId" TEXT NOT NULL DEFAULT '',
    "secretEncrypted" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "state" "PrinterConnectionState" NOT NULL DEFAULT 'UNCONFIGURED',
    "lastSeenAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "telemetry" JSONB,
    "simState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrinterConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrinterCommandLog" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "jobId" TEXT,
    "ok" BOOLEAN NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrinterCommandLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "createdById" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "events" TEXT[],
    "secretEncrypted" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "disabledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "responseStatus" INTEGER,
    "lastError" TEXT NOT NULL DEFAULT '',
    "nextAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MachineType_spaceId_archivedAt_sortOrder_idx" ON "MachineType"("spaceId", "archivedAt", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MachineType_spaceId_slug_key" ON "MachineType"("spaceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "MachineType_spaceId_id_key" ON "MachineType"("spaceId", "id");

-- CreateIndex
CREATE INDEX "Machine_spaceId_typeId_retiredAt_idx" ON "Machine"("spaceId", "typeId", "retiredAt");

-- CreateIndex
CREATE INDEX "Machine_spaceId_status_idx" ON "Machine"("spaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_spaceId_slug_key" ON "Machine"("spaceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_spaceId_id_key" ON "Machine"("spaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MachinePhoto_storageKey_key" ON "MachinePhoto"("storageKey");

-- CreateIndex
CREATE INDEX "MachinePhoto_spaceId_machineId_sortOrder_idx" ON "MachinePhoto"("spaceId", "machineId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MachineDocument_storageKey_key" ON "MachineDocument"("storageKey");

-- CreateIndex
CREATE INDEX "MachineDocument_spaceId_machineId_idx" ON "MachineDocument"("spaceId", "machineId");

-- CreateIndex
CREATE INDEX "ConsumablePool_spaceId_isActive_idx" ON "ConsumablePool"("spaceId", "isActive");

-- CreateIndex
CREATE INDEX "ConsumablePool_spaceId_machineId_idx" ON "ConsumablePool"("spaceId", "machineId");

-- CreateIndex
CREATE INDEX "ConsumablePool_spaceId_typeId_idx" ON "ConsumablePool"("spaceId", "typeId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumablePool_spaceId_id_key" ON "ConsumablePool"("spaceId", "id");

-- CreateIndex
CREATE INDEX "ConsumableAdjustment_spaceId_poolId_createdAt_idx" ON "ConsumableAdjustment"("spaceId", "poolId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsumableAdjustment_jobId_idx" ON "ConsumableAdjustment"("jobId");

-- CreateIndex
CREATE INDEX "PricingRule_spaceId_idx" ON "PricingRule"("spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_spaceId_typeId_machineId_audience_key" ON "PricingRule"("spaceId", "typeId", "machineId", "audience");

-- CreateIndex
CREATE UNIQUE INDEX "Job_statusToken_key" ON "Job"("statusToken");

-- CreateIndex
CREATE INDEX "Job_spaceId_status_priority_submittedAt_idx" ON "Job"("spaceId", "status", "priority", "submittedAt");

-- CreateIndex
CREATE INDEX "Job_spaceId_typeId_status_idx" ON "Job"("spaceId", "typeId", "status");

-- CreateIndex
CREATE INDEX "Job_spaceId_assignedMachineId_status_idx" ON "Job"("spaceId", "assignedMachineId", "status");

-- CreateIndex
CREATE INDEX "Job_requesterId_createdAt_idx" ON "Job"("requesterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_spaceId_number_key" ON "Job"("spaceId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Job_spaceId_id_key" ON "Job"("spaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "JobFile_storageKey_key" ON "JobFile"("storageKey");

-- CreateIndex
CREATE INDEX "JobFile_spaceId_jobId_idx" ON "JobFile"("spaceId", "jobId");

-- CreateIndex
CREATE INDEX "JobEvent_spaceId_jobId_createdAt_idx" ON "JobEvent"("spaceId", "jobId", "createdAt");

-- CreateIndex
CREATE INDEX "JobNote_spaceId_jobId_createdAt_idx" ON "JobNote"("spaceId", "jobId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_spaceId_status_createdAt_idx" ON "Payment"("spaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_spaceId_jobId_idx" ON "Payment"("spaceId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_spaceId_id_key" ON "Payment"("spaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_method_providerOrderId_key" ON "Payment"("method", "providerOrderId");

-- CreateIndex
CREATE INDEX "Refund_spaceId_status_createdAt_idx" ON "Refund"("spaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "UsageLog_spaceId_machineId_createdAt_idx" ON "UsageLog"("spaceId", "machineId", "createdAt");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_spaceId_isActive_nextDueAt_idx" ON "MaintenanceSchedule"("spaceId", "isActive", "nextDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceSchedule_spaceId_id_key" ON "MaintenanceSchedule"("spaceId", "id");

-- CreateIndex
CREATE INDEX "MaintenanceLog_spaceId_machineId_performedAt_idx" ON "MaintenanceLog"("spaceId", "machineId", "performedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceLog_spaceId_id_key" ON "MaintenanceLog"("spaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceAttachment_storageKey_key" ON "MaintenanceAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "Downtime_spaceId_machineId_startedAt_idx" ON "Downtime"("spaceId", "machineId", "startedAt");

-- CreateIndex
CREATE INDEX "Downtime_spaceId_endedAt_idx" ON "Downtime"("spaceId", "endedAt");

-- CreateIndex
CREATE INDEX "FaultReport_spaceId_status_severity_idx" ON "FaultReport"("spaceId", "status", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "FaultReport_spaceId_number_key" ON "FaultReport"("spaceId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "FaultReport_spaceId_id_key" ON "FaultReport"("spaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FaultPhoto_storageKey_key" ON "FaultPhoto"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "Warranty_machineId_key" ON "Warranty"("machineId");

-- CreateIndex
CREATE INDEX "Warranty_spaceId_expiresOn_idx" ON "Warranty"("spaceId", "expiresOn");

-- CreateIndex
CREATE UNIQUE INDEX "Warranty_spaceId_id_key" ON "Warranty"("spaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Warranty_spaceId_machineId_key" ON "Warranty"("spaceId", "machineId");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyDocument_storageKey_key" ON "WarrantyDocument"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "PrinterConnection_machineId_key" ON "PrinterConnection"("machineId");

-- CreateIndex
CREATE UNIQUE INDEX "PrinterConnection_spaceId_id_key" ON "PrinterConnection"("spaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PrinterConnection_spaceId_machineId_key" ON "PrinterConnection"("spaceId", "machineId");

-- CreateIndex
CREATE INDEX "PrinterCommandLog_spaceId_connectionId_createdAt_idx" ON "PrinterCommandLog"("spaceId", "connectionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");

-- CreateIndex
CREATE INDEX "ApiKey_spaceId_revokedAt_idx" ON "ApiKey"("spaceId", "revokedAt");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_spaceId_isActive_idx" ON "WebhookEndpoint"("spaceId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEndpoint_spaceId_id_key" ON "WebhookEndpoint"("spaceId", "id");

-- CreateIndex
CREATE INDEX "WebhookDelivery_spaceId_endpointId_createdAt_idx" ON "WebhookDelivery"("spaceId", "endpointId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "MachineType" ADD CONSTRAINT "MachineType_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_spaceId_typeId_fkey" FOREIGN KEY ("spaceId", "typeId") REFERENCES "MachineType"("spaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachinePhoto" ADD CONSTRAINT "MachinePhoto_spaceId_machineId_fkey" FOREIGN KEY ("spaceId", "machineId") REFERENCES "Machine"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineDocument" ADD CONSTRAINT "MachineDocument_spaceId_machineId_fkey" FOREIGN KEY ("spaceId", "machineId") REFERENCES "Machine"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumablePool" ADD CONSTRAINT "ConsumablePool_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumablePool" ADD CONSTRAINT "ConsumablePool_spaceId_machineId_fkey" FOREIGN KEY ("spaceId", "machineId") REFERENCES "Machine"("spaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumablePool" ADD CONSTRAINT "ConsumablePool_spaceId_typeId_fkey" FOREIGN KEY ("spaceId", "typeId") REFERENCES "MachineType"("spaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumableAdjustment" ADD CONSTRAINT "ConsumableAdjustment_spaceId_poolId_fkey" FOREIGN KEY ("spaceId", "poolId") REFERENCES "ConsumablePool"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_spaceId_typeId_fkey" FOREIGN KEY ("spaceId", "typeId") REFERENCES "MachineType"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_spaceId_machineId_fkey" FOREIGN KEY ("spaceId", "machineId") REFERENCES "Machine"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_spaceId_typeId_fkey" FOREIGN KEY ("spaceId", "typeId") REFERENCES "MachineType"("spaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_spaceId_machineId_fkey" FOREIGN KEY ("spaceId", "machineId") REFERENCES "Machine"("spaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_spaceId_assignedMachineId_fkey" FOREIGN KEY ("spaceId", "assignedMachineId") REFERENCES "Machine"("spaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_spaceId_poolId_fkey" FOREIGN KEY ("spaceId", "poolId") REFERENCES "ConsumablePool"("spaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_reprintOfId_fkey" FOREIGN KEY ("reprintOfId") REFERENCES "Job"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobFile" ADD CONSTRAINT "JobFile_spaceId_jobId_fkey" FOREIGN KEY ("spaceId", "jobId") REFERENCES "Job"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobEvent" ADD CONSTRAINT "JobEvent_spaceId_jobId_fkey" FOREIGN KEY ("spaceId", "jobId") REFERENCES "Job"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobNote" ADD CONSTRAINT "JobNote_spaceId_jobId_fkey" FOREIGN KEY ("spaceId", "jobId") REFERENCES "Job"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceCounter" ADD CONSTRAINT "SpaceCounter_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_spaceId_jobId_fkey" FOREIGN KEY ("spaceId", "jobId") REFERENCES "Job"("spaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_spaceId_paymentId_fkey" FOREIGN KEY ("spaceId", "paymentId") REFERENCES "Payment"("spaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceJobSettings" ADD CONSTRAINT "SpaceJobSettings_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_spaceId_machineId_fkey" FOREIGN KEY ("spaceId", "machineId") REFERENCES "Machine"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_spaceId_jobId_fkey" FOREIGN KEY ("spaceId", "jobId") REFERENCES "Job"("spaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_spaceId_machineId_fkey" FOREIGN KEY ("spaceId", "machineId") REFERENCES "Machine"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_spaceId_machineId_fkey" FOREIGN KEY ("spaceId", "machineId") REFERENCES "Machine"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_spaceId_scheduleId_fkey" FOREIGN KEY ("spaceId", "scheduleId") REFERENCES "MaintenanceSchedule"("spaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceAttachment" ADD CONSTRAINT "MaintenanceAttachment_spaceId_logId_fkey" FOREIGN KEY ("spaceId", "logId") REFERENCES "MaintenanceLog"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Downtime" ADD CONSTRAINT "Downtime_spaceId_machineId_fkey" FOREIGN KEY ("spaceId", "machineId") REFERENCES "Machine"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaultReport" ADD CONSTRAINT "FaultReport_spaceId_machineId_fkey" FOREIGN KEY ("spaceId", "machineId") REFERENCES "Machine"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaultPhoto" ADD CONSTRAINT "FaultPhoto_spaceId_faultId_fkey" FOREIGN KEY ("spaceId", "faultId") REFERENCES "FaultReport"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_spaceId_machineId_fkey" FOREIGN KEY ("spaceId", "machineId") REFERENCES "Machine"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyDocument" ADD CONSTRAINT "WarrantyDocument_spaceId_warrantyId_fkey" FOREIGN KEY ("spaceId", "warrantyId") REFERENCES "Warranty"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrinterConnection" ADD CONSTRAINT "PrinterConnection_spaceId_machineId_fkey" FOREIGN KEY ("spaceId", "machineId") REFERENCES "Machine"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrinterCommandLog" ADD CONSTRAINT "PrinterCommandLog_spaceId_connectionId_fkey" FOREIGN KEY ("spaceId", "connectionId") REFERENCES "PrinterConnection"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_spaceId_endpointId_fkey" FOREIGN KEY ("spaceId", "endpointId") REFERENCES "WebhookEndpoint"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Hand-written rules Prisma cannot express ───────────────────────────────

-- One pricing rule per scope and audience. NULL typeId/machineId (the space default, a type rule) must
-- still collide, so the unique index treats NULLs as equal (PostgreSQL 15+).
DROP INDEX "PricingRule_spaceId_typeId_machineId_audience_key";
CREATE UNIQUE INDEX "PricingRule_spaceId_typeId_machineId_audience_key" ON "PricingRule"("spaceId", "typeId", "machineId", "audience") NULLS NOT DISTINCT;

ALTER TABLE "MachineType"
  ADD CONSTRAINT "MachineType_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "MachineType_limits" CHECK (("maxConcurrentJobs" IS NULL OR "maxConcurrentJobs" > 0) AND ("maxOpenJobsPerRequester" IS NULL OR "maxOpenJobsPerRequester" > 0));

ALTER TABLE "Machine"
  ADD CONSTRAINT "Machine_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "Machine_amounts" CHECK (("purchaseCost" IS NULL OR "purchaseCost" >= 0) AND "meterMinutes" >= 0 AND "meterJobs" >= 0);

-- A pool serves one machine, every machine of one type, or the whole space (both NULL); never both.
ALTER TABLE "ConsumablePool"
  ADD CONSTRAINT "ConsumablePool_binding" CHECK ("machineId" IS NULL OR "typeId" IS NULL),
  ADD CONSTRAINT "ConsumablePool_remaining_nonnegative" CHECK ("remainingQuantity" >= 0),
  ADD CONSTRAINT "ConsumablePool_quantities" CHECK ("initialQuantity" >= 0 AND ("lowThreshold" IS NULL OR "lowThreshold" >= 0) AND ("costPerUnit" IS NULL OR "costPerUnit" >= 0)),
  ADD CONSTRAINT "ConsumablePool_colour_hex" CHECK ("colourHex" = '' OR "colourHex" ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE "ConsumableAdjustment"
  ADD CONSTRAINT "ConsumableAdjustment_delta_nonzero" CHECK ("delta" <> 0),
  ADD CONSTRAINT "ConsumableAdjustment_balance_nonnegative" CHECK ("balanceAfter" >= 0);

ALTER TABLE "PricingRule"
  ADD CONSTRAINT "PricingRule_single_scope" CHECK ("typeId" IS NULL OR "machineId" IS NULL),
  ADD CONSTRAINT "PricingRule_amounts" CHECK (
    "flatFee" >= 0 AND "timeRatePerHour" >= 0 AND "materialRate" >= 0 AND "setupFee" >= 0
    AND "minimumCharge" >= 0 AND "depositValue" >= 0 AND "timeIncrementMinutes" >= 1
  ),
  ADD CONSTRAINT "PricingRule_deposit_percent" CHECK ("depositMode" <> 'PERCENT' OR "depositValue" <= 10000);

ALTER TABLE "Job"
  ADD CONSTRAINT "Job_percentages" CHECK (("failPercent" IS NULL OR "failPercent" BETWEEN 0 AND 100) AND ("progressPercent" IS NULL OR "progressPercent" BETWEEN 0 AND 100)),
  ADD CONSTRAINT "Job_amounts" CHECK (
    ("quotedAmount" IS NULL OR "quotedAmount" >= 0) AND ("finalAmount" IS NULL OR "finalAmount" >= 0)
    AND "depositAmount" >= 0 AND "amountPaid" >= 0 AND "amountRefunded" >= 0
  ),
  ADD CONSTRAINT "Job_quantities" CHECK ("quantity" >= 1 AND "reservedQuantity" >= 0 AND ("estimatedMinutes" IS NULL OR "estimatedMinutes" >= 0) AND ("actualMinutes" IS NULL OR "actualMinutes" >= 0)),
  ADD CONSTRAINT "Job_currency_code" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "Payment_refunded_range" CHECK ("amountRefunded" >= 0 AND "amountRefunded" <= "amount"),
  ADD CONSTRAINT "Payment_currency_code" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "SpaceJobSettings"
  ADD CONSTRAINT "SpaceJobSettings_ranges" CHECK (
    "taxRateBps" BETWEEN 0 AND 10000 AND "refundOnFailurePercent" BETWEEN 0 AND 100
    AND "refundOnCancelPercent" BETWEEN 0 AND 100 AND "maxOpenJobsPerRequester" >= 1
    AND "maintenanceReminderDays" >= 0 AND "warrantyReminderDays" >= 0
  );

ALTER TABLE "MaintenanceLog"
  ADD CONSTRAINT "MaintenanceLog_cost_nonnegative" CHECK ("cost" IS NULL OR "cost" >= 0);

ALTER TABLE "UsageLog"
  ADD CONSTRAINT "UsageLog_ranges" CHECK ("minutes" >= 0 AND "percentComplete" BETWEEN 0 AND 100);

-- Ledgers and timelines are append-only. The only way a row leaves is with its whole space: by the time a
-- space deletion cascades down to these rows the Space row is already gone, which is what the check sees.
CREATE FUNCTION "swm_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM "Space" WHERE "id" = OLD."spaceId") THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER "ConsumableAdjustment_append_only" BEFORE UPDATE OR DELETE ON "ConsumableAdjustment" FOR EACH ROW EXECUTE FUNCTION "swm_append_only"();
CREATE TRIGGER "JobEvent_append_only" BEFORE UPDATE OR DELETE ON "JobEvent" FOR EACH ROW EXECUTE FUNCTION "swm_append_only"();
CREATE TRIGGER "UsageLog_append_only" BEFORE UPDATE OR DELETE ON "UsageLog" FOR EACH ROW EXECUTE FUNCTION "swm_append_only"();
CREATE TRIGGER "MaintenanceLog_append_only" BEFORE UPDATE OR DELETE ON "MaintenanceLog" FOR EACH ROW EXECUTE FUNCTION "swm_append_only"();
