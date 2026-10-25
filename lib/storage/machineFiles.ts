import "server-only";

import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";

/*
 * Machine photos and documents: private objects, served only by /api/uploads after an access check
 * (lib/machines/fileAccess.ts). Keys are spaces/<spaceId>/machines/<machineId>/<kind>/<uuid>.<ext>; maintenance,
 * warranty and fault files are staff-only.
 * Same bucket as the other files; without object storage (development only) the bytes live in the Asset table.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const MACHINE_FILE_KEY = new RegExp(`^spaces/([A-Za-z0-9_-]{1,128})/machines/([A-Za-z0-9_-]{1,128})/(photos|documents|maintenance|warranty|faults)/${UUID}\\.(webp|pdf|txt)$`);

export const MACHINE_FILE_TYPES = { webp: "image/webp", pdf: "application/pdf", txt: "text/plain; charset=utf-8" } as const;
export type MachineFileExtension = keyof typeof MACHINE_FILE_TYPES;

export type MachineFileKind = "photos" | "documents" | "maintenance" | "warranty" | "faults";

export function parseMachineFileKey(key: string) {
  const match = MACHINE_FILE_KEY.exec(key);
  return match ? { spaceId: match[1]!, machineId: match[2]!, kind: match[3] as MachineFileKind, extension: match[4] as MachineFileExtension } : null;
}

export function isMachineFileKey(key: string) {
  return MACHINE_FILE_KEY.test(key);
}

export function machineFileKey(spaceId: string, machineId: string, kind: MachineFileKind, extension: MachineFileExtension) {
  return `spaces/${spaceId}/machines/${machineId}/${kind}/${crypto.randomUUID()}.${extension}`;
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

export async function uploadMachineFile(key: string, body: Uint8Array) {
  const parsed = parseMachineFileKey(key);
  if (!parsed) throw new Error("Invalid machine file key.");
  const contentType = MACHINE_FILE_TYPES[parsed.extension];
  const bytes = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (configured()) {
    await client().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, Body: bytes, ContentType: contentType, CacheControl: "private, no-store" }));
    await prisma.asset.upsert({
      where: { key },
      create: { key, contentType, byteSize: BigInt(bytes.length), provider: "s3", spaceId: parsed.spaceId },
      update: { contentType, byteSize: BigInt(bytes.length), provider: "s3", fileData: null, spaceId: parsed.spaceId },
    });
    return;
  }
  if (process.env.NODE_ENV === "production") throw new Error("Private object storage is not configured.");
  await prisma.asset.upsert({
    where: { key },
    create: { key, contentType, byteSize: BigInt(bytes.length), provider: "database", fileData: new Uint8Array(bytes), spaceId: parsed.spaceId },
    update: { contentType, byteSize: BigInt(bytes.length), provider: "database", fileData: new Uint8Array(bytes), spaceId: parsed.spaceId },
  });
}

export async function downloadMachineFile(key: string): Promise<{ body: Uint8Array; contentType: string } | null> {
  if (!isMachineFileKey(key)) return null;
  const asset = await prisma.asset.findUnique({ where: { key }, select: { provider: true, fileData: true, contentType: true } });
  if (!asset?.contentType) return null;
  if (asset.provider === "s3") {
    if (!configured()) throw new Error("Private object storage is not configured.");
    const object = await client().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }));
    return object.Body ? { body: await object.Body.transformToByteArray(), contentType: asset.contentType } : null;
  }
  return asset.fileData ? { body: asset.fileData, contentType: asset.contentType } : null;
}

/** Best effort: the database row that pointed at the file is already gone. */
export async function deleteMachineFiles(keys: string[]) {
  const valid = [...new Set(keys.filter(isMachineFileKey))];
  if (valid.length === 0) return;
  const stored = await prisma.asset.findMany({ where: { key: { in: valid }, provider: "s3" }, select: { key: true } });
  if (stored.length > 0 && configured()) {
    await client().send(new DeleteObjectsCommand({ Bucket: process.env.S3_BUCKET!, Delete: { Objects: stored.map(({ key }) => ({ Key: key })), Quiet: true } }));
  }
  await prisma.asset.deleteMany({ where: { key: { in: valid } } });
}
