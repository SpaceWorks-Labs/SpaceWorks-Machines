import "server-only";

import type { Prisma } from "@prisma/client";
import { sendPasswordResetEmail } from "@/lib/email/passwordReset";
import { sendEmailVerificationEmail } from "@/lib/email/emailVerification";
import { asAdminPayload, asInvitePayload, asNoticePayload, deliverAdminApplicationAlert, deliverSpaceNotice, deliverOwnerInvite } from "@/lib/email/space";
import { asChatPayload, deliverChatNotice } from "@/lib/chat/notify";
import { asMagicLinkPayload, deliverMagicLink } from "@/lib/email/magicLink";
import { asMemberNoticePayload, deliverMemberNotice } from "@/lib/email/members";
import { asLowStockPayload, deliverLowStockAlert } from "@/lib/email/consumables";
import { asJobEmailPayload, deliverJobEmail } from "@/lib/email/jobs";
import { asUpkeepEmailPayload, deliverUpkeepEmail } from "@/lib/email/upkeep";
import { asEndpointPayload, deliverEndpointDisabled } from "@/lib/email/integrations";
import { asRepairRequestPayload, deliverRepairRequestChat, deliverRepairRequestEmail } from "@/lib/email/repairs";
import { asLoginAlertPayload, asLoginCodePayload, deliverLoginAlert, deliverLoginCode } from "@/lib/email/loginSecurity";

/** What a handler reports after a delivery attempt. Throw to retry; throw PermanentOutboxError to give up. */
export type DeliveryOutcome = "sent" | "dropped";

export type OutboxKindHandler = {
  /** Payload carries a bearer link (reset, verification, invite): delete the row after sending. */
  capability: boolean;
  /** One-hour links: retry within their lifetime. */
  shortLived?: boolean;
  deliver(payload: Prisma.JsonValue, messageId: string): Promise<DeliveryOutcome>;
};

export { asRecord, isBoundedString, isEmail, isIsoDate, isSafeMessageUrl, isExpired, PermanentOutboxError } from "@/lib/outboxPayload";
import { asRecord, isEmail, isIsoDate, isSafeMessageUrl, isExpired, PermanentOutboxError } from "@/lib/outboxPayload";

// ---------- kinds ----------

const passwordReset: OutboxKindHandler = {
  capability: true,
  shortLived: true,
  async deliver(value, messageId) {
    const p = asRecord(value);
    if (!p || !isEmail(p.to) || !isSafeMessageUrl(p.resetUrl) || !isIsoDate(p.expiresAt)) throw new PermanentOutboxError();
    if (isExpired(p.expiresAt as string)) return "dropped";
    await sendPasswordResetEmail({ to: p.to as string, resetUrl: p.resetUrl as string, messageId });
    return "sent";
  },
};

const emailVerification: OutboxKindHandler = {
  capability: true,
  shortLived: true,
  async deliver(value, messageId) {
    const p = asRecord(value);
    if (!p || !isEmail(p.to) || !isSafeMessageUrl(p.verificationUrl) || !isIsoDate(p.expiresAt)) throw new PermanentOutboxError();
    if (isExpired(p.expiresAt as string)) return "dropped";
    await sendEmailVerificationEmail({ to: p.to as string, verificationUrl: p.verificationUrl as string, messageId });
    return "sent";
  },
};

const spaceNotice: OutboxKindHandler = {
  capability: false,
  async deliver(value, messageId) {
    const payload = asNoticePayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverSpaceNotice(payload, messageId);
  },
};

const spaceApplicationAlert: OutboxKindHandler = {
  capability: false,
  async deliver(value, messageId) {
    const payload = asAdminPayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverAdminApplicationAlert(payload, messageId);
  },
};

const ownerInvite: OutboxKindHandler = {
  capability: true,
  async deliver(value, messageId) {
    const payload = asInvitePayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverOwnerInvite(payload, messageId);
  },
};

const loginCode: OutboxKindHandler = {
  // The code is a sign-in capability: the row is deleted after sending and retried only while it lasts.
  capability: true,
  shortLived: true,
  async deliver(value, messageId) {
    const payload = asLoginCodePayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverLoginCode(payload, messageId);
  },
};

const magicLink: OutboxKindHandler = {
  // The link signs the person in: the row is deleted after sending and retried only while it lasts.
  capability: true,
  shortLived: true,
  async deliver(value, messageId) {
    const payload = asMagicLinkPayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverMagicLink(payload, messageId);
  },
};

const memberNotice: OutboxKindHandler = {
  // Invites carry a join link that works on its own, so the row goes once it is sent.
  capability: true,
  async deliver(value, messageId) {
    const payload = asMemberNoticePayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverMemberNotice(payload, messageId);
  },
};

const loginAlert: OutboxKindHandler = {
  capability: false,
  async deliver(value, messageId) {
    const payload = asLoginAlertPayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverLoginAlert(payload, messageId);
  },
};

const chatNotice: OutboxKindHandler = {
  capability: false,
  async deliver(value) {
    const payload = asChatPayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverChatNotice(payload);
  },
};

const consumableLowStock: OutboxKindHandler = {
  capability: false,
  async deliver(value, messageId) {
    const payload = asLowStockPayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverLowStockAlert(payload, messageId);
  },
};

function jobEmail(staff: boolean): OutboxKindHandler {
  return { capability: false, async deliver(value, messageId) {
    const payload = asJobEmailPayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverJobEmail(payload, messageId, staff);
  } };
}

const upkeepStaff: OutboxKindHandler = {
  capability: false,
  async deliver(value, messageId) {
    const payload = asUpkeepEmailPayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverUpkeepEmail(payload, messageId);
  },
};

const webhookDisabled: OutboxKindHandler = {
  capability: false,
  async deliver(value, messageId) {
    const payload = asEndpointPayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverEndpointDisabled(payload, messageId);
  },
};

/** Repair requests carry an outside technician's link: the row is deleted once sent. */
const repairRequest: OutboxKindHandler = {
  capability: true,
  async deliver(value, messageId) {
    const payload = asRepairRequestPayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverRepairRequestEmail(payload, messageId);
  },
};

const repairRequestChat: OutboxKindHandler = {
  capability: true,
  async deliver(value) {
    const payload = asRepairRequestPayload(value, true);
    if (!payload) throw new PermanentOutboxError();
    return deliverRepairRequestChat(payload);
  },
};

/** Every email the platform can send. Add a kind here when a feature needs a new message. */
export const OUTBOX_KINDS = {
  "password-reset": passwordReset,
  "email-verification": emailVerification,
  "space-notice": spaceNotice,
  "space-application-alert": spaceApplicationAlert,
  "owner-invite": ownerInvite,
  "member-notice": memberNotice,
  "chat-notice": chatNotice,
  "login-code": loginCode,
  "login-alert": loginAlert,
  "magic-link": magicLink,
  "consumable-low-stock": consumableLowStock,
  "job-requester": jobEmail(false),
  "job-staff": jobEmail(true),
  "upkeep-staff": upkeepStaff,
  "webhook-disabled": webhookDisabled,
  "repair-request": repairRequest,
  "repair-request-chat": repairRequestChat,
} satisfies Record<string, OutboxKindHandler>;

export type OutboxKind = keyof typeof OUTBOX_KINDS;
