-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SpaceStatus" AS ENUM ('PENDING_REVIEW', 'CHANGES_REQUESTED', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SpaceSource" AS ENUM ('SELF_SIGNUP', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "SpaceVisibility" AS ENUM ('UNLISTED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "JoinPolicy" AS ENUM ('OPEN', 'APPROVAL', 'INVITE_ONLY');

-- CreateEnum
CREATE TYPE "SpaceReviewAction" AS ENUM ('SUBMITTED', 'RESUBMITTED', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'SUSPENDED', 'REACTIVATED', 'ARCHIVED', 'CREATED');

-- CreateEnum
CREATE TYPE "SpaceRole" AS ENUM ('OWNER', 'MANAGER', 'MACHINE_MANAGER', 'OPERATOR', 'TECHNICIAN', 'VIEWER', 'MEMBER');

-- CreateEnum
CREATE TYPE "SpaceMemberStatus" AS ENUM ('ACTIVE', 'PENDING', 'BLOCKED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "GatewayProvider" AS ENUM ('NONE', 'RAZORPAY', 'STRIPE');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('RAZORPAY', 'STRIPE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "ChatChannelKind" AS ENUM ('SLACK', 'DISCORD', 'MATTERMOST', 'TELEGRAM', 'WHATSAPP');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "profileImageUrl" TEXT,
    "passwordHash" TEXT,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "mfaSecretEncrypted" TEXT,
    "mfaEnabledAt" TIMESTAMP(3),
    "recoveryCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "KnownDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "lastIp" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnownDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Space" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "logoUrl" TEXT,
    "accentColor" TEXT,
    "status" "SpaceStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "source" "SpaceSource" NOT NULL DEFAULT 'SELF_SIGNUP',
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "website" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "locale" TEXT,
    "visibility" "SpaceVisibility" NOT NULL DEFAULT 'UNLISTED',
    "joinPolicy" "JoinPolicy" NOT NULL DEFAULT 'APPROVAL',
    "memberLimit" INTEGER,
    "staffLimit" INTEGER,
    "offlineConfirmationRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceReview" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "action" "SpaceReviewAction" NOT NULL,
    "actorUserId" TEXT,
    "reason" TEXT,
    "applicationSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "role" "SpaceRole" NOT NULL,
    "status" "SpaceMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceInvite" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" "SpaceRole" NOT NULL DEFAULT 'MEMBER',
    "createdByUserId" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "usedByUserId" TEXT,

    CONSTRAINT "SpaceInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "spaceId" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalHeartbeat" (
    "key" TEXT NOT NULL,
    "lastStartedAt" TIMESTAMP(3),
    "lastSucceededAt" TIMESTAMP(3),
    "lastSent" INTEGER NOT NULL DEFAULT 0,
    "lastFailed" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalHeartbeat_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "InstanceSetting" (
    "id" TEXT NOT NULL,
    "allowNewUserSignups" BOOLEAN NOT NULL DEFAULT true,
    "allowSpaceApplications" BOOLEAN NOT NULL DEFAULT true,
    "emailFrom" TEXT,
    "smtpService" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "smtpUser" TEXT,
    "smtpPasswordEncrypted" TEXT,
    "smtpAllowUnauthenticated" BOOLEAN NOT NULL DEFAULT false,
    "backupProvider" TEXT,
    "backupLastSuccessAt" TIMESTAMP(3),
    "backupRetentionDays" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstanceSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT,
    "key" TEXT NOT NULL,
    "publicUrl" TEXT,
    "contentType" TEXT,
    "byteSize" BIGINT,
    "provider" TEXT NOT NULL DEFAULT 'unknown',
    "fileData" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpacePaymentSettings" (
    "spaceId" TEXT NOT NULL,
    "provider" "GatewayProvider" NOT NULL DEFAULT 'NONE',
    "keyId" TEXT,
    "secretEncrypted" TEXT,
    "webhookSecretEncrypted" TEXT,
    "webhookPublicCode" TEXT NOT NULL,
    "testMode" BOOLEAN NOT NULL DEFAULT true,
    "verifiedAt" TIMESTAMP(3),
    "upiVpa" TEXT,
    "upiPayeeName" TEXT,
    "offlineInstructions" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpacePaymentSettings_pkey" PRIMARY KEY ("spaceId")
);

-- CreateTable
CREATE TABLE "ProcessedWebhookEvent" (
    "provider" "PaymentProvider" NOT NULL,
    "eventId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("provider","eventId")
);

-- CreateTable
CREATE TABLE "SpaceEmailSettings" (
    "spaceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "fromName" TEXT NOT NULL DEFAULT '',
    "fromAddress" TEXT,
    "replyTo" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "smtpUser" TEXT,
    "smtpPasswordEncrypted" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaceEmailSettings_pkey" PRIMARY KEY ("spaceId")
);

-- CreateTable
CREATE TABLE "ChatChannel" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "kind" "ChatChannelKind" NOT NULL,
    "name" TEXT NOT NULL,
    "configEncrypted" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT '',
    "events" TEXT[],
    "includeNames" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastDeliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE INDEX "VerificationToken_identifier_idx" ON "VerificationToken"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "KnownDevice_tokenHash_key" ON "KnownDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "KnownDevice_userId_lastSeenAt_idx" ON "KnownDevice"("userId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "Space_slug_key" ON "Space"("slug");

-- CreateIndex
CREATE INDEX "Space_status_createdAt_idx" ON "Space"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Space_visibility_status_idx" ON "Space"("visibility", "status");

-- CreateIndex
CREATE INDEX "SpaceReview_spaceId_createdAt_idx" ON "SpaceReview"("spaceId", "createdAt");

-- CreateIndex
CREATE INDEX "SpaceReview_action_createdAt_idx" ON "SpaceReview"("action", "createdAt");

-- CreateIndex
CREATE INDEX "SpaceMember_spaceId_role_status_idx" ON "SpaceMember"("spaceId", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SpaceMember_userId_spaceId_key" ON "SpaceMember"("userId", "spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SpaceMember_spaceId_id_key" ON "SpaceMember"("spaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SpaceInvite_token_key" ON "SpaceInvite"("token");

-- CreateIndex
CREATE INDEX "SpaceInvite_spaceId_createdAt_idx" ON "SpaceInvite"("spaceId", "createdAt");

-- CreateIndex
CREATE INDEX "SpaceInvite_usedAt_idx" ON "SpaceInvite"("usedAt");

-- CreateIndex
CREATE INDEX "AuditEvent_spaceId_createdAt_idx" ON "AuditEvent"("spaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_availableAt_idx" ON "OutboxMessage"("status", "availableAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_createdAt_idx" ON "OutboxMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_key_key" ON "Asset"("key");

-- CreateIndex
CREATE INDEX "Asset_spaceId_idx" ON "Asset"("spaceId");

-- CreateIndex
CREATE INDEX "Asset_createdAt_idx" ON "Asset"("createdAt");

-- CreateIndex
CREATE INDEX "Asset_provider_idx" ON "Asset"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "SpacePaymentSettings_webhookPublicCode_key" ON "SpacePaymentSettings"("webhookPublicCode");

-- CreateIndex
CREATE INDEX "ProcessedWebhookEvent_spaceId_receivedAt_idx" ON "ProcessedWebhookEvent"("spaceId", "receivedAt");

-- CreateIndex
CREATE INDEX "ChatChannel_spaceId_idx" ON "ChatChannel"("spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannel_spaceId_id_key" ON "ChatChannel"("spaceId", "id");

-- AddForeignKey
ALTER TABLE "KnownDevice" ADD CONSTRAINT "KnownDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceReview" ADD CONSTRAINT "SpaceReview_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceReview" ADD CONSTRAINT "SpaceReview_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceMember" ADD CONSTRAINT "SpaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceMember" ADD CONSTRAINT "SpaceMember_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceInvite" ADD CONSTRAINT "SpaceInvite_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceInvite" ADD CONSTRAINT "SpaceInvite_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceInvite" ADD CONSTRAINT "SpaceInvite_usedByUserId_fkey" FOREIGN KEY ("usedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpacePaymentSettings" ADD CONSTRAINT "SpacePaymentSettings_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceEmailSettings" ADD CONSTRAINT "SpaceEmailSettings_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Integrity rules Prisma cannot express. Application code enforces them too; these stop a bug or a
-- manual edit from storing an impossible row.
ALTER TABLE "OutboxMessage"
  ADD CONSTRAINT "OutboxMessage_attempts_nonnegative" CHECK ("attempts" >= 0),
  ADD CONSTRAINT "OutboxMessage_state_shape" CHECK (
    ("status" = 'PROCESSING' AND "lockedAt" IS NOT NULL AND "sentAt" IS NULL)
    OR ("status" = 'SENT' AND "lockedAt" IS NULL AND "sentAt" IS NOT NULL)
    OR ("status" IN ('PENDING', 'FAILED') AND "lockedAt" IS NULL AND "sentAt" IS NULL)
  );

ALTER TABLE "SpaceInvite"
  ADD CONSTRAINT "SpaceInvite_usage_pair" CHECK ("usedByUserId" IS NULL OR "usedAt" IS NOT NULL);

ALTER TABLE "Space"
  ADD CONSTRAINT "Space_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "Space_positive_limits" CHECK (("memberLimit" IS NULL OR "memberLimit" > 0) AND ("staffLimit" IS NULL OR "staffLimit" > 0)),
  ADD CONSTRAINT "Space_currency_code" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "Space_country_code" CHECK ("country" ~ '^[A-Z]{2}$');

-- The applicant is always told why: a refusal or a change request carries a note.
ALTER TABLE "SpaceReview"
  ADD CONSTRAINT "SpaceReview_reason_required" CHECK (
    "action" NOT IN ('REJECTED', 'CHANGES_REQUESTED') OR length(btrim(coalesce("reason", ''))) > 0
  );

-- Only makers wait for approval or get blocked; staff rows are always active.
ALTER TABLE "SpaceMember"
  ADD CONSTRAINT "SpaceMember_staff_active" CHECK ("role" = 'MEMBER' OR "status" = 'ACTIVE');

ALTER TABLE "SpaceEmailSettings"
  ADD CONSTRAINT "SpaceEmailSettings_port" CHECK ("smtpPort" IN (25, 465, 587, 2525)),
  ADD CONSTRAINT "SpaceEmailSettings_enabled_complete" CHECK (NOT "enabled" OR ("fromAddress" IS NOT NULL AND "smtpHost" IS NOT NULL)),
  ADD CONSTRAINT "SpaceEmailSettings_from_name_length" CHECK (char_length("fromName") <= 120);

ALTER TABLE "ChatChannel"
  ADD CONSTRAINT "ChatChannel_name_length" CHECK (char_length("name") BETWEEN 1 AND 80);
