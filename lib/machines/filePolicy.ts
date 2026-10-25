import { z } from "zod";

/**
 * A machine type's file policy: which files a job request may carry. Phase 3 validates the files themselves
 * (extension, size, count, magic bytes); this module owns the policy's shape and its defaults. Client-safe.
 */

export const MB = 1024 * 1024;
/** Hard ceiling on any one job file, whatever a type says. */
export const MAX_POLICY_BYTES = 500 * MB;
export const MAX_POLICY_FILES = 50;

const extensionSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^\./, ""))
  .pipe(z.string().regex(/^[a-z0-9]{1,10}$/, "Extensions are letters and digits, like stl or 3mf"));

export const filePolicySchema = z
  .object({
    extensions: z.array(extensionSchema).max(40, "At most 40 file types"),
    maxBytes: z.number().int().min(1024, "Allow at least 1 KB").max(MAX_POLICY_BYTES, "At most 500 MB per file"),
    maxFiles: z.number().int().min(0).max(MAX_POLICY_FILES, `At most ${MAX_POLICY_FILES} files`),
    required: z.boolean(),
  })
  .superRefine((policy, ctx) => {
    if (policy.required && (policy.maxFiles < 1 || policy.extensions.length === 0)) {
      ctx.addIssue({ code: "custom", path: ["required"], message: "A required file needs at least one file type and one file" });
    }
  })
  .transform((policy) => ({ ...policy, extensions: [...new Set(policy.extensions)] }));

export type FilePolicy = z.infer<typeof filePolicySchema>;

export const DEFAULT_FILE_POLICY: FilePolicy = { extensions: ["pdf", "png", "jpg", "jpeg", "webp", "txt"], maxBytes: 20 * MB, maxFiles: 5, required: false };

/** Stored policy JSON, falling back to the documents policy when it is missing or malformed. */
export function readFilePolicy(value: unknown): FilePolicy {
  const parsed = filePolicySchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_FILE_POLICY;
}

/** "stl, 3mf, obj · up to 100 MB each · up to 10 files · required" */
export function describeFilePolicy(policy: FilePolicy) {
  if (policy.maxFiles === 0 || policy.extensions.length === 0) return "No files";
  const size = policy.maxBytes >= MB ? `${Math.round(policy.maxBytes / MB)} MB` : `${Math.round(policy.maxBytes / 1024)} KB`;
  return [policy.extensions.join(", "), `up to ${size} each`, `up to ${policy.maxFiles} file${policy.maxFiles === 1 ? "" : "s"}`, policy.required ? "required" : "optional"].join(" · ");
}
