import { API_SCOPES } from "@/lib/apiScopes";

/** The OpenAPI 3.1 description of /api/v1. Keep in step with app/api/v1 and docs/API.md. */
type Op = { summary: string; scope: string; body?: Record<string, unknown>; params?: string[]; query?: string[] };

const list = (summary: string, scope: string, query: string[] = []): Op => ({ summary, scope, query: [...query, "cursor", "limit"] });
const PATHS: Record<string, Partial<Record<"get" | "post", Op>>> = {
  "/machines": { get: list("List machines", "machines:read", ["typeId", "status"]) },
  "/machines/{id}": { get: { summary: "Get a machine", scope: "machines:read", params: ["id"] } },
  "/machines/{id}/status": { post: { summary: "Set a machine's status (idle, reserved, maintenance, offline)", scope: "machines:write", params: ["id"],
    body: { type: "object", required: ["status"], properties: { status: { enum: ["IDLE", "RESERVED", "MAINTENANCE", "OFFLINE"] }, note: { type: "string", maxLength: 280 } } } } },
  "/types": { get: list("List machine types", "machines:read") },
  "/jobs": { get: list("List jobs", "jobs:read", ["status"]), post: { summary: "Create a job on behalf of an account", scope: "jobs:write",
    body: { type: "object", required: ["typeId", "title", "requesterEmail"], properties: { typeId: { type: "string" }, machineId: { type: "string" }, requesterEmail: { type: "string", format: "email" },
      title: { type: "string" }, description: { type: "string" }, sourceLink: { type: "string", format: "uri" }, requestData: { type: "object" }, quantity: { type: "integer", minimum: 1 } } } } },
  "/jobs/{id}": { get: { summary: "Get a job", scope: "jobs:read", params: ["id"] } },
  "/jobs/{id}/transitions": { post: { summary: "Move a job through its lifecycle", scope: "jobs:write", params: ["id"],
    body: { type: "object", required: ["kind"], properties: { kind: { enum: ["approve", "reject", "cancel", "start", "pause", "resume", "complete", "fail", "collect", "reprint", "priority", "reassign", "note"] } },
      description: "Each kind takes the fields the staff console asks for (reason, estimatedMinutes, actualMinutes, percent, machineId, …)." } } },
  "/consumables": { get: list("List consumable pools", "consumables:read") },
  "/consumables/{id}/adjustments": { post: { summary: "Restock or correct a pool", scope: "consumables:write", params: ["id"],
    body: { type: "object", required: ["kind", "quantity"], properties: { kind: { enum: ["restock", "correction"] }, quantity: { type: "string", pattern: "^-?\\d{1,11}(\\.\\d{1,3})?$" }, reason: { type: "string" } } } } },
  "/usage": { post: { summary: "Log a machine run outside the queue", scope: "maintenance:write",
    body: { type: "object", required: ["machineId", "minutes"], properties: { machineId: { type: "string" }, minutes: { type: "integer", minimum: 0 }, succeeded: { type: "boolean" }, note: { type: "string" } } } } },
  "/maintenance/schedules": { get: list("List maintenance schedules", "maintenance:read", ["machineId"]) },
  "/maintenance/logs": { get: list("List maintenance records", "maintenance:read", ["machineId"]), post: { summary: "Log maintenance", scope: "maintenance:write",
    body: { type: "object", required: ["machineId", "summary"], properties: { machineId: { type: "string" }, scheduleId: { type: "string" }, faultId: { type: "string" },
      kind: { enum: ["PREVENTIVE", "CORRECTIVE", "INSPECTION", "CALIBRATION", "WARRANTY_REPAIR"] }, summary: { type: "string" }, details: { type: "string" },
      cost: { type: "integer", minimum: 0, description: "Minor units of the space currency" }, vendor: { type: "string" }, restoreIdle: { type: "boolean" } } } } },
  "/faults": { get: list("List faults", "maintenance:read", ["status"]), post: { summary: "Report a fault", scope: "maintenance:write",
    body: { type: "object", required: ["machineId", "title"], properties: { machineId: { type: "string" }, severity: { enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] }, title: { type: "string" }, description: { type: "string" } } } } },
  "/payments": { get: list("List payments", "payments:read", ["status"]) },
};

const errors = { "400": { description: "The request was invalid." }, "401": { description: "Missing, unknown, revoked or expired key." },
  "403": { description: "The key lacks the scope, or its creator lacks the permission." }, "404": { description: "Not found in this space." },
  "409": { description: "Refused by the business rules (the message says why)." }, "429": { description: "Too many requests for this key." } };

export function openApiDocument(serverUrl: string) {
  const paths = Object.fromEntries(Object.entries(PATHS).map(([path, ops]) => [path, Object.fromEntries(Object.entries(ops).map(([method, op]) => [method, {
    summary: op.summary, security: [{ apiKey: [op.scope] }], "x-scope": op.scope,
    parameters: [...(op.params ?? []).map((name) => ({ name, in: "path", required: true, schema: { type: "string" } })),
      ...(op.query ?? []).map((name) => ({ name, in: "query", required: false, schema: { type: name === "limit" ? "integer" : "string" } }))],
    ...(op.body ? { requestBody: { required: true, content: { "application/json": { schema: op.body } } } } : {}),
    responses: { [method === "post" ? "201" : "200"]: { description: "OK. Lists return { data, nextCursor }; single items { data }." }, ...errors },
  }])) ]));
  return {
    openapi: "3.1.0",
    info: { title: "Space Works Machines API", version: "1", description: "One space per key. Send `Authorization: Bearer swm_…`." },
    servers: [{ url: `${serverUrl.replace(/\/$/, "")}/api/v1` }],
    components: { securitySchemes: { apiKey: { type: "http", scheme: "bearer", description: `Scopes: ${API_SCOPES.join(", ")}` } } },
    paths,
  };
}
