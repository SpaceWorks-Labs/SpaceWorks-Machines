/** Audit log areas for the filter. Client-safe. */
export const AUDIT_AREAS = { machine: "Machines", job: "Jobs", payment: "Payments", consumable: "Consumables", maintenance: "Maintenance", fault: "Faults",
  downtime: "Downtime", warranty: "Warranty", usage: "Usage", settings: "Settings" } as const;
export type AuditArea = keyof typeof AUDIT_AREAS;
