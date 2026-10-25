import "server-only";

import sharp from "sharp";
import { createSafeWebpDerivative, validateImageBytes } from "@/lib/imageValidation";
import type { MachineFileExtension } from "@/lib/storage/machineFiles";

/** Limits for machine photos and documents (domain-behaviour §1). */
export const MAX_MACHINE_PHOTOS = 8;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const DOCUMENT_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "webp", "txt"] as const;

export type PreparedFile = { body: Uint8Array; extension: MachineFileExtension; width: number | null; height: number | null; filename: string; sizeBytes: number };

function extensionOf(name: string) {
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(name);
  return match ? match[1]!.toLowerCase() : "";
}

/** A display filename: no paths, no control characters, at most 120 characters. */
export function cleanFilename(name: string, extension?: string) {
  const base = name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f"<>|*?:]+/g, "").trim() || "file";
  const withoutExt = base.replace(/\.[A-Za-z0-9]{1,10}$/, "").slice(0, 100) || "file";
  return extension ? `${withoutExt}.${extension}` : base.slice(0, 120);
}

/** Re-encode a photo (metadata stripped, at most 2000 px a side) after checking its signature and size. */
export async function preparePhoto(file: File): Promise<PreparedFile | { error: string }> {
  if (file.size === 0 || file.size > MAX_PHOTO_BYTES) return { error: "Photos must be 10 MB or smaller." };
  const derivative = await createSafeWebpDerivative(file, { width: 2000, height: 2000, fit: "inside" });
  if ("error" in derivative) return derivative;
  const meta = await sharp(derivative.body).metadata();
  return { body: derivative.body, extension: "webp", width: meta.width ?? null, height: meta.height ?? null, filename: cleanFilename(file.name, "webp"), sizeBytes: derivative.body.length };
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

function startsWith(bytes: Uint8Array, magic: number[]) {
  return magic.every((value, index) => bytes[index] === value);
}

/**
 * A manual, SOP, safety sheet or datasheet. PDFs must be PDFs, images are re-encoded to WebP (metadata
 * stripped), text must be UTF-8 text. A file that sniffs as a PDF or an image under another extension is refused.
 */
export async function prepareDocument(file: File): Promise<PreparedFile | { error: string }> {
  if (file.size === 0 || file.size > MAX_DOCUMENT_BYTES) return { error: "Documents must be 20 MB or smaller." };
  const extension = extensionOf(file.name);
  if (!(DOCUMENT_EXTENSIONS as readonly string[]).includes(extension)) return { error: "Upload a PDF, PNG, JPEG, WebP or text file." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = startsWith(bytes, PDF_MAGIC);
  const image = validateImageBytes(bytes);
  const isImage = !("error" in image);
  if (extension === "pdf") {
    if (!isPdf) return { error: "That file isn't a valid PDF." };
    return { body: bytes, extension: "pdf", width: null, height: null, filename: cleanFilename(file.name, "pdf"), sizeBytes: bytes.length };
  }
  if (extension === "txt") {
    if (isPdf || isImage || bytes.includes(0)) return { error: "That file isn't plain text." };
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return { error: "Text files must be UTF-8." };
    }
    return { body: bytes, extension: "txt", width: null, height: null, filename: cleanFilename(file.name, "txt"), sizeBytes: bytes.length };
  }
  if (!isImage || isPdf) return { error: "That file isn't a valid image." };
  const derivative = await createSafeWebpDerivative(file, { width: 4000, height: 4000, fit: "inside" });
  if ("error" in derivative) return derivative;
  return { body: derivative.body, extension: "webp", width: null, height: null, filename: cleanFilename(file.name, "webp"), sizeBytes: derivative.body.length };
}
