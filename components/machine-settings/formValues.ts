import { MB } from "@/lib/machines/filePolicy";

export type SimpleSection = "details" | "catalogue" | "filePolicy" | "queue";
export const text = (data: FormData, key: string) => String(data.get(key) ?? "");
export const lines = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
const optionalNumber = (value: string) => value.trim() === "" ? null : Number(value);

/** Keep blank overrides distinct from zero; the section schemas decide what is valid. */
export function readTypeSection(section: SimpleSection, data: FormData) {
  switch (section) {
    case "details": return { name: text(data, "name"), icon: text(data, "icon"), description: text(data, "description") };
    case "catalogue": return { materials: lines(text(data, "materials")), colours: lines(text(data, "colours")),
      meteringUnit: text(data, "meteringUnit"), consumableUnit: text(data, "consumableUnit") || null };
    case "filePolicy": return { filePolicy: { extensions: text(data, "extensions").split(/[\s,]+/).filter(Boolean),
      maxBytes: Math.round(Number(text(data, "maxMB")) * MB), maxFiles: Number(text(data, "maxFiles")), required: data.has("required") } };
    case "queue": return { acceptsJobs: data.has("acceptsJobs"), requiresApproval: data.has("requiresApproval"),
      allocationPolicy: text(data, "allocationPolicy"), maxConcurrentJobs: optionalNumber(text(data, "maxConcurrentJobs")),
      requesterPicksMachine: data.has("requesterPicksMachine"), maxOpenJobsPerRequester: optionalNumber(text(data, "maxOpenJobsPerRequester")) };
  }
}

export function sectionError(errors: Record<string, string[]>, key: string) {
  const path = `values.${key}`;
  return Object.entries(errors).filter(([name]) => name === path || name.startsWith(`${path}.`)).flatMap(([, messages]) => messages).join(" ");
}
