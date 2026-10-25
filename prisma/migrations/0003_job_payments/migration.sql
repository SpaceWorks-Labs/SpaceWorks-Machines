ALTER TABLE "Payment" ADD COLUMN "checkoutKey" TEXT, ADD COLUMN "checkoutStartedAt" TIMESTAMP(3);
ALTER TABLE "Refund" ADD COLUMN "gatewayAttemptedAt" TIMESTAMP(3);
ALTER TABLE "SpaceJobSettings" ADD COLUMN "refundOnRejectPercent" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "SpaceJobSettings" ADD CONSTRAINT "refund_reject_percent" CHECK ("refundOnRejectPercent" BETWEEN 0 AND 100);
