/** REST API key scopes (docs/API.md). Client-safe: the key dialog lists them. */
export const API_SCOPES = [
  "machines:read", "machines:write", "jobs:read", "jobs:write", "consumables:read", "consumables:write",
  "maintenance:read", "maintenance:write", "payments:read", "reports:read",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const API_SCOPE_LABELS: Record<ApiScope, string> = {
  "machines:read": "Read machines and types", "machines:write": "Set machine status",
  "jobs:read": "Read jobs", "jobs:write": "Create jobs and move them through their lifecycle",
  "consumables:read": "Read consumable pools", "consumables:write": "Adjust consumable stock",
  "maintenance:read": "Read maintenance and faults", "maintenance:write": "Log maintenance, usage and faults",
  "payments:read": "Read payments", "reports:read": "Read reports",
};
