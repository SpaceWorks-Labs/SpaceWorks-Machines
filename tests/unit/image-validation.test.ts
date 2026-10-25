import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { createSafeWebpDerivative, validateEventCoverImage } from "@/lib/imageValidation";

describe("image validation", () => {
  it("uses binary content, decodes under a pixel limit, and re-encodes a metadata-free WebP", async () => {
    const png = await sharp({
      create: { width: 32, height: 24, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 1 } },
    }).png().toBuffer();
    const polyglotTail = Buffer.from("<script>alert(1)</script>");
    const file = new File([png, polyglotTail], "misleading.jpg", { type: "image/jpeg" });

    await expect(validateEventCoverImage(file)).resolves.toMatchObject({ contentType: "image/png", width: 32, height: 24 });
    const result = await createSafeWebpDerivative(file, { width: 16, height: 16, fit: "inside" });
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    const metadata = await sharp(result.body).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 16, height: 12 });
    expect(result.body.includes(polyglotTail)).toBe(false);
  });

  it("rejects a signature-only image advertising more than 25 megapixels", async () => {
    const bytes = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
    bytes.writeUInt32BE(6000, 16);
    bytes.writeUInt32BE(5000, 20);
    const result = await validateEventCoverImage(new File([bytes], "bomb.png", { type: "image/png" }));
    expect(result).toHaveProperty("error");
  });

  it("reads real sizes from lossy and lossless WebP, like a browser-exported cover", async () => {
    const lossy = await sharp({ create: { width: 1680, height: 735, channels: 3, background: "#e5484d" } }).webp({ quality: 90 }).toBuffer();
    const lossless = await sharp({ create: { width: 1200, height: 1200, channels: 3, background: "#4f46e5" } }).webp({ lossless: true }).toBuffer();
    expect(lossy.subarray(12, 16).toString()).toBe("VP8 ");
    expect(lossless.subarray(12, 16).toString()).toBe("VP8L");

    await expect(validateEventCoverImage(new File([lossy], "cover.webp", { type: "image/webp" }))).resolves.toMatchObject({ contentType: "image/webp", width: 1680, height: 735 });
    await expect(validateEventCoverImage(new File([lossless], "cover.webp", { type: "image/webp" }))).resolves.toMatchObject({ width: 1200, height: 1200 });
    const derivative = await createSafeWebpDerivative(new File([lossy], "cover.webp", { type: "image/webp" }), { width: 2400, height: 2400, fit: "inside" });
    expect(derivative).not.toHaveProperty("error");
  });
});
