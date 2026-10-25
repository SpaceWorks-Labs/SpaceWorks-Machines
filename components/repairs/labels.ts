/** Labels for repairs, technicians and to-buy. Client-safe. */
export const PAYOUT_STATUS_LABELS: Record<string, string> = { UNPAID: "Not paid yet", PARTLY_PAID: "Partly paid", PAID: "Paid" };
export const REQUEST_STATUS_LABELS: Record<string, string> = { SENT: "Waiting", ACCEPTED: "Accepted", DECLINED: "Declined", EXPIRED: "Expired", CLOSED: "Closed" };
export const PAYOUT_METHOD_LABELS: Record<string, string> = { CASH: "Cash", BANK_TRANSFER: "Bank transfer", UPI: "UPI", OTHER: "Other" };
export const TO_BUY_STATUS_LABELS: Record<string, string> = { REQUESTED: "Requested", APPROVED: "Approved", BOUGHT: "Bought", RECEIVED: "Received", CANCELLED: "Cancelled" };
export const CHANNEL_LABELS: Record<string, string> = { email: "Email", inbox: "Inbox", whatsapp: "WhatsApp", telegram: "Telegram" };
export const toBuyNumber = (number: number) => `TB-${String(number).padStart(4, "0")}`;
