import "server-only";
import { randomUUID } from "node:crypto";
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";

const KEY = /^spaces\/([A-Za-z0-9_-]{1,128})\/jobs\/([A-Za-z0-9_-]{1,128})\/([0-9a-f-]{36})\.([a-z0-9]{1,10})$/;
export function parseJobFileKey(key: string) {
  const match = KEY.exec(key);
  return match ? { spaceId: match[1], jobId: match[2] } : null;
}
export function jobFileKey(spaceId: string, jobId: string, extension: string) {
  const key = `spaces/${spaceId}/jobs/${jobId}/${randomUUID()}.${extension}`;
  if (!parseJobFileKey(key)) throw new Error("Invalid job file key.");
  return key;
}
const configured = () => Boolean(process.env.S3_BUCKET && process.env.S3_REGION);
function client() {
  return new S3Client({ region: process.env.S3_REGION!, endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
    ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY ? {
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } } : {}) });
}

/** Private, non-cacheable objects. No public upload handler recognises these keys. */
export async function uploadJobFile(key: string, body: Uint8Array, contentType: string) {
  const parsed = parseJobFileKey(key);
  if (!parsed) throw new Error("Invalid job file key.");
  if (configured()) {
    await client().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, Body: body,
      ContentType: contentType, CacheControl: "private, no-store" }));
  } else if (process.env.NODE_ENV === "production") throw new Error("Private object storage is not configured.");
  await prisma.asset.create({ data: { key, spaceId: parsed.spaceId, contentType, byteSize: BigInt(body.length),
    provider: configured() ? "s3" : "database", ...(configured() ? {} : { fileData: new Uint8Array(body) }) } });
}

/** Internal storage API; callers must authorise using lib/jobs/files.ts first. */
export async function downloadJobFile(key: string) {
  const parsed = parseJobFileKey(key);
  if (!parsed) return null;
  const asset = await prisma.asset.findFirst({ where: { key, spaceId: parsed.spaceId } });
  if (!asset?.contentType) return null;
  if (asset.provider === "s3") {
    if (!configured()) throw new Error("Private object storage is not configured.");
    const object = await client().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }));
    return object.Body ? { body: await object.Body.transformToByteArray(), contentType: asset.contentType } : null;
  }
  return asset.fileData ? { body: asset.fileData, contentType: asset.contentType } : null;
}

/** Submission rollback cleanup also deletes objects whose Asset insert failed. */
export async function deleteJobFiles(keys: string[]) {
  const valid = [...new Set(keys.filter((key) => parseJobFileKey(key)))];
  if (!valid.length) return;
  if (configured()) await client().send(new DeleteObjectsCommand({ Bucket: process.env.S3_BUCKET!,
    Delete: { Objects: valid.map((Key) => ({ Key })), Quiet: true } }));
  await prisma.asset.deleteMany({ where: { key: { in: valid } } });
}
