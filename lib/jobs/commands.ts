export type JobCommand =
  | { kind: "approve"; estimatedMinutes?: number; estimatedQuantity?: string; note?: string; priceOverride?: number; reason?: string }
  | { kind: "reject"; reason: string }
  | { kind: "cancel"; reason?: string }
  | { kind: "start"; machineId?: string; poolId?: string; plannedQuantity?: string; paymentOverrideReason?: string }
  | { kind: "pause" | "resume" }
  | { kind: "complete"; actualMinutes: number; actualQuantity?: string }
  | { kind: "fail"; reason: string; percent: number; actualMinutes: number; actualQuantity?: string }
  | { kind: "collect"; paymentOverrideReason?: string }
  | { kind: "reprint" }
  | { kind: "priority"; priority: number }
  | { kind: "reassign"; machineId: string | null }
  | { kind: "note"; body: string; internal?: boolean };
