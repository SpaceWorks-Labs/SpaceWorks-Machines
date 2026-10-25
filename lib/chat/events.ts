/** Staff alerts a chat channel can receive. Client-safe.  */
export const CHAT_EVENTS = ["join-request", "member-joined", "member-left", "consumable-low-stock", "job-submitted", "job-cancelled", "job-failed", "job-payment", "maintenance-due", "fault-reported", "fault-assigned", "fault-resolved", "repair-payment", "warranty-expiring"] as const;
export type ChatEvent = (typeof CHAT_EVENTS)[number];

export const CHAT_EVENT_LABELS: Record<ChatEvent, string> = {
  "join-request": "A maker asked to join",
  "member-joined": "A maker joined",
  "member-left": "A maker left",
  "consumable-low-stock": "A consumable is running low",
  "job-submitted": "A job was submitted",
  "job-cancelled": "A job was cancelled",
  "job-failed": "A job failed",
  "job-payment": "A payment was received",
  "maintenance-due": "Maintenance is due or overdue",
  "fault-reported": "A fault was reported",
  "fault-assigned": "A technician took a repair",
  "fault-resolved": "A repair was checked and closed",
  "repair-payment": "A technician was paid for a repair",
  "warranty-expiring": "A warranty is expiring",
};

export const CHAT_KINDS = ["SLACK", "DISCORD", "MATTERMOST", "TELEGRAM", "WHATSAPP"] as const;
export type ChatKind = (typeof CHAT_KINDS)[number];

export const CHAT_KIND_LABELS: Record<ChatKind, string> = {
  SLACK: "Slack",
  DISCORD: "Discord",
  MATTERMOST: "Mattermost",
  TELEGRAM: "Telegram",
  WHATSAPP: "WhatsApp",
};

/** The WhatsApp message template spaces create and get approved in Meta's WhatsApp Manager. */
export const WHATSAPP_TEMPLATE = { name: "team_alert", language: "en", body: "{{1}}" } as const;
