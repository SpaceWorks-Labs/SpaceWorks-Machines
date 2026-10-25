/** Signatures are checked independently of the supplied MIME type. */
export function sniff(bytes: Uint8Array): string | null {
  const b = Buffer.from(bytes);
  if (b.subarray(0, 5).toString() === "%PDF-") return "pdf";
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "jpg";
  if (b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return "webp";
  if (/^GIF8[79]a/.test(b.subarray(0, 6).toString())) return "gif";
  if (b.subarray(0, 2).toString() === "BM") return "bmp";
  if (["49492a00", "4d4d002a"].includes(b.subarray(0, 4).toString("hex"))) return "tiff";
  return null;
}

export function decodeText(bytes: Uint8Array): string {
  if (bytes.some((b) => b === 0 || (b < 32 && ![9, 10, 12, 13].includes(b)))) throw new Error("The file must be text.");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("The file must be UTF-8 text."); }
}
