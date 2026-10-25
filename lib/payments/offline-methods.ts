/** Ways money arrives outside the gateway. Client-safe. */
export const OFFLINE_METHODS = ["cash", "upi", "bank_transfer", "cheque", "card_terminal", "other"] as const;
export type OfflineMethod = (typeof OFFLINE_METHODS)[number];

export const OFFLINE_METHOD_LABELS: Record<OfflineMethod, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  card_terminal: "Card machine",
  other: "Other",
};
