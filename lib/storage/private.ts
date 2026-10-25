import "server-only";

import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";

/*
 * Private generated files (bulk card exports; receipt ZIPs can follow): never served by
 * /api/uploads, only by routes that check who is asking. Keys are
 * spaces/<id>/exports/<uuid>.<pdf|zip>. Same bucket as public derivatives (S3/Silo/R2), with
 * no public caching; without object storage (development only) the bytes live in the Asset table.
 */

const PRIVATE_KEY = /^spaces\/([A-Za-z0-9_-]{1,128})\/exports\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|zip)$/;
const CONTENT_TYPES = { pdf: "application/pdf", zip: "application/zip" } as const;

export function isPrivateExportKey(key: string) {
  return PRIVATE_KEY.test(key);
}

export function privateExportKey(spaceId: string, extension: keyof typeof CONTENT_TYPES) {
  return `spaces/${spaceId}/exports/${crypto.randomUUID()}.${extension}`;
}

function configured() {
  return Boolean(process.env.S3_BUCKET && process.env.S3_REGION);
}

function client() {
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  return new S3Client({
    region: process.env.S3_REGION!,
    ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  });
}

export async function uploadPrivateExport(key: string, body: Uint8Array, spaceId: string) {
  const match = PRIVATE_KEY.exec(key);
  if (!match || match[1] !== spaceId) throw new Error("Invalid private export key.");
  const contentType = CONTENT_TYPES[match[2] as keyof typeof CONTENT_TYPES];
  const bytes = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (configured()) {
    await client().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, Body: bytes, ContentType: contentType, CacheControl: "private, no-store" }));
    await prisma.asset.upsert({
      where: { key },
      create: { key, contentType, byteSize: BigInt(bytes.length), provider: "s3", spaceId },
      update: { contentType, byteSize: BigInt(bytes.length), provider: "s3", fileData: null, spaceId },
    });
    return;
  }
  if (process.env.NODE_ENV === "production") throw new Error("Private object storage is not configured.");
  await prisma.asset.upsert({
    where: { key },
    create: { key, contentType, byteSize: BigInt(bytes.length), provider: "database", fileData: new Uint8Array(bytes), spaceId },
    update: { contentType, byteSize: BigInt(bytes.length), provider: "database", fileData: new Uint8Array(bytes), spaceId },
  });
}

export async function downloadPrivateExport(key: string): Promise<{ body: Uint8Array; contentType: string } | null> {
  if (!isPrivateExportKey(key)) return null;
  const asset = await prisma.asset.findUnique({ where: { key }, select: { provider: true, fileData: true, contentType: true } });
  if (!asset?.contentType) return null;
  if (asset.provider === "s3") {
    if (!configured()) throw new Error("Private object storage is not configured.");
    const object = await client().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }));
    return object.Body ? { body: await object.Body.transformToByteArray(), contentType: asset.contentType } : null;
  }
  return asset.fileData ? { body: asset.fileData, contentType: asset.contentType } : null;
}

export async function deletePrivateExports(keys: string[]) {
  const valid = [...new Set(keys.filter(isPrivateExportKey))];
  if (valid.length === 0) return;
  const stored = await prisma.asset.findMany({ where: { key: { in: valid }, provider: "s3" }, select: { key: true } });
  if (stored.length > 0 && configured()) {
    await client().send(new DeleteObjectsCommand({ Bucket: process.env.S3_BUCKET!, Delete: { Objects: stored.map(({ key }) => ({ Key: key })), Quiet: true } }));
  }
  await prisma.asset.deleteMany({ where: { key: { in: valid } } });
}
