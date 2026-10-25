import { createHash } from "node:crypto";
import { filePolicySchema, type FilePolicy } from "@/lib/machines/filePolicy";
import { decodeText, sniff } from "./sniff";
import { parseStl } from "./stl";
import { parseGcode } from "./gcode";

export type JobUpload = { filename: string; body: Uint8Array };
const mime: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  webp: "image/webp", gif: "image/gif", bmp: "image/bmp", tiff: "image/tiff", zip: "application/zip", "3mf": "model/3mf",
  stl: "model/stl", step: "model/step", stp: "model/step", gcode: "text/plain", gco: "text/plain" };

export function validateJobFiles(uploads: readonly JobUpload[], policy: FilePolicy) {
  const checked = filePolicySchema.parse(policy);
  if (uploads.length > checked.maxFiles) throw new Error("Too many files for this machine type.");
  if (checked.required && !uploads.length) throw new Error("This machine type requires a file.");
  return uploads.map((upload) => {
    const extension = /\.([a-z0-9]{1,10})$/i.exec(upload.filename)?.[1].toLowerCase() ?? "";
    if (!checked.extensions.includes(extension)) throw new Error("This file extension is not allowed.");
    const bytes = Buffer.from(upload.body);
    if (!bytes.length || bytes.length > checked.maxBytes) throw new Error("The file is empty or exceeds the size limit.");
    const signature = sniff(bytes);
    const normalised = extension === "jpeg" ? "jpg" : extension;
    if (signature && signature !== normalised) throw new Error("The file signature does not match its extension.");
    if ((extension === "pdf" || mime[extension]?.startsWith("image/")) && !signature) throw new Error("Invalid file signature.");
    if (["3mf", "zip"].includes(extension) && !bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))) throw new Error("Invalid ZIP signature.");
    if (["step", "stp"].includes(extension) && !decodeText(bytes).includes("ISO-10303")) throw new Error("Invalid STEP file.");
    const metadata = extension === "stl" ? parseStl(bytes) : ["gcode", "gco", "bgcode", "nc", "tap"].includes(extension) ? parseGcode(bytes) : {};
    const filename = upload.filename.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f"<>|*?:]/g, "").slice(-120);
    return { filename, body: bytes, extension, contentType: mime[extension] ?? "application/octet-stream",
      sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), metadata };
  });
}
