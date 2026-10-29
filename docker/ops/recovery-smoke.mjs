// Opt-in destructive fixture for the isolated fresh-host recovery acceptance run.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { encryptMfaSecret, decryptMfaSecret } from "../../lib/mfaCrypto.mjs";

if (process.env.SWM_RECOVERY_SMOKE !== "1") throw new Error("Explicit isolated recovery fixture required.");
const phase = process.argv[2];
if (!["seed", "verify"].includes(phase)) throw new Error("Expected seed or verify.");
const id = "acceptance_restore_space";
const userId = "acceptance_restore_user";
const secret = "JBSWY3DPEHPK3PXP";
const original = "Original production restore sentinel";
const objectKey = "acceptance/object-proof.txt";
const db = new PrismaClient();
const storage = new S3Client({
  region: process.env.S3_REGION, endpoint: process.env.S3_ENDPOINT, forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
});
try {
  if (phase === "seed") {
    await db.$transaction(async (tx) => {
      await tx.space.create({ data: { id, slug: "acceptance-restore-space", name: original } });
      await tx.user.create({ data: { id: userId, email: "restore-proof@example.test", mfaEnabledAt: new Date(), mfaSecretEncrypted: encryptMfaSecret(secret) } });
      await tx.spaceMember.create({ data: { userId, spaceId: id, role: "MACHINE_MANAGER" } });
    });
    await storage.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey, Body: original, ContentType: "text/plain" }));
    console.log("Recovery relational record, application-encrypted MFA seed, and private object seeded.");
  } else {
    const space = await db.space.findUniqueOrThrow({ where: { id }, include: { members: { include: { user: true } } } });
    const member = space.members.find((row) => row.userId === userId);
    assert.equal(space.name, original);
    assert.equal(member?.role, "MACHINE_MANAGER");
    assert.equal(decryptMfaSecret(member.user.mfaSecretEncrypted), secret);
    const object = await storage.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: objectKey }));
    const content = await object.Body.transformToString();
    assert.equal(content, original);
    const unauthenticated = await fetch(`${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${objectKey}`);
    await unauthenticated.body?.cancel();
    assert.equal(unauthenticated.status, 403);
    console.log(JSON.stringify({ relationalDataRestored: true, applicationMfaKeyUsable: true, privateObjectRestored: true, anonymousObjectDenied: true, objectSha256: createHash("sha256").update(content).digest("hex") }));
  }
} finally {
  storage.destroy();
  await db.$disconnect();
}
