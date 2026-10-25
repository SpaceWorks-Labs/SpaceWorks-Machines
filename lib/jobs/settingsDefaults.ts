export const JOB_DEFAULTS = {
  jobsEnabled: true, eligibility: "MEMBERS_ONLY" as const, publicUsesMemberRates: false,
  maxOpenJobsPerRequester: 5, allowRequesterCancel: true, paymentsEnabled: false,
  defaultPaymentTiming: "ON_COMPLETION" as const, allowPayLater: true, requirePaymentBeforeCollection: true,
  onlineMethods: [], offlineMethods: ["CASH", "UPI", "BANK_TRANSFER"] as ("CASH" | "UPI" | "BANK_TRANSFER" | "CARD_TERMINAL" | "OTHER")[],
  taxRateBps: 0, taxInclusive: true, taxLabel: "GST", refundOnFailure: "FULL" as const, refundOnFailurePercent: 100,
  refundOnCancel: "FULL" as const, refundOnCancelPercent: 100, refundOnReject: "FULL" as const,
  refundOnRejectPercent: 100, requesterEmails: {}, staffAlerts: {},
};
