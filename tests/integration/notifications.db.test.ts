import { createHmac, randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.PAYMENT_SECRETS_KEY ??= randomBytes(32).toString("base64");

const { prisma } = await import("@/lib/db");
const { encryptSpaceSecret } = await import("@/lib/spaceSecrets");
const { deliverChatNotice, asChatPayload } = await import("@/lib/chat/notify");
const { spaceEmailTransport } = await import("@/lib/email/spaceTransport");
const { joinAsMaker } = await import("@/lib/spaceMembers");
const { savePaymentKeys, ensurePaymentSettings } = await import("@/lib/payments/config");
const { handleWebhook } = await import("@/lib/payments/webhooks");
const { consumeMagicLink, issueMagicLink, peekMagicLink } = await import("@/lib/magicLink");
const { spaceFixtures } = await import("../helpers/spaceFixtures");

const f = spaceFixtures("notify");
let space: Awaited<ReturnType<typeof f.space>>;
let maker: Awaited<ReturnType<typeof f.person>>;
const webhookUrl = "https://hooks.slack.com/services/T0000000/B0000000/abcdefghijklmnopqrstuvwx";

async function slackChannel(events: string[], includeNames = false) {
  return prisma.chatChannel.create({ data: { spaceId: space.id, kind: "SLACK", name: "Desk", events, includeNames, target: "Slack webhook", configEncrypted: encryptSpaceSecret(JSON.stringify({ webhookUrl }), space.id, "chat") } });
}

beforeAll(async () => {
  space = await f.space({ name: "Kochi Makers", joinPolicy: "APPROVAL", contactEmail: "office@kochi-makers.example" });
  maker = await f.person("Navya");
});

afterEach(() => vi.unstubAllGlobals());

afterAll(async () => {
  await f.cleanup();
  await prisma.$disconnect();
});

describe.sequential("chat alerts", () => {
  it("queue a join request for channels that asked for it, and post it without the maker's name", async () => {
    const channel = await slackChannel(["join-request"]);
    const quiet = await slackChannel(["member-left"]);
    expect(await prisma.$transaction((tx) => joinAsMaker(tx, maker.id, space.id))).toBe("requested");
    const queued = await prisma.outboxMessage.findMany({ where: { kind: "chat-notice", payload: { path: ["spaceId"], equals: space.id } } });
    expect(queued.map((row) => (row.payload as { channelId: string }).channelId)).toEqual([channel.id]);
    expect(queued.some((row) => (row.payload as { channelId: string }).channelId === quiet.id)).toBe(false);

    const posts: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => { posts.push(String(init.body)); return new Response("ok"); }));
    expect(await deliverChatNotice(asChatPayload(queued[0].payload)!)).toBe("sent");
    const text = JSON.parse(posts[0]).text as string;
    expect(text).toContain("Kochi Makers: A maker asked to join");
    expect(text).not.toContain("Navya");
    expect(text).toContain(`/dashboard/${space.slug}/team`);
    expect((await prisma.chatChannel.findUniqueOrThrow({ where: { id: channel.id } })).lastDeliveredAt).not.toBeNull();
  });

  it("switch a channel off when the provider says it is gone", async () => {
    const channel = await slackChannel(["join-request"]);
    const member = await prisma.spaceMember.findUniqueOrThrow({ where: { userId_spaceId: { userId: maker.id, spaceId: space.id } } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no_service", { status: 404 })));
    expect(await deliverChatNotice({ channelId: channel.id, spaceId: space.id, event: "join-request", refs: { memberId: member.id } })).toBe("dropped");
    expect(await prisma.chatChannel.findUniqueOrThrow({ where: { id: channel.id } })).toMatchObject({ enabled: false, failures: 1 });
  });
});

describe.sequential("space email", () => {
  it("falls back to the platform sender in the space's name, with replies to its contact address", async () => {
    const transport = await spaceEmailTransport(space.id);
    expect(transport.from).toMatchObject({ name: "Kochi Makers" });
    expect(transport.replyTo).toBe("office@kochi-makers.example");
  });

  it("uses the space's own sender once its SMTP is set up and on", async () => {
    await prisma.spaceEmailSettings.create({ data: { spaceId: space.id, enabled: true, fromName: "Kochi Makers desk", fromAddress: "hello@kochi-makers.example", replyTo: "desk@kochi-makers.example", smtpHost: "localhost", smtpPort: 587, smtpUser: "relay", smtpPasswordEncrypted: encryptSpaceSecret("relay-pass", space.id, "email") } });
    const transport = await spaceEmailTransport(space.id);
    expect(transport.from).toEqual({ name: "Kochi Makers desk", address: "hello@kochi-makers.example" });
    expect(transport.replyTo).toBe("desk@kochi-makers.example");
    expect(transport.transporter).not.toBeNull();
  });
});

describe.sequential("payment webhooks", () => {
  it("accept only signed events for the space's own secret, and apply each event once", async () => {
    await savePaymentKeys(space.id, { provider: "RAZORPAY", keyId: "rzp_test_abc", secret: "secret_key", webhookSecret: "whook", testMode: true });
    const { webhookPublicCode } = await ensurePaymentSettings(space.id);
    const body = JSON.stringify({ event: "payment.captured", created_at: Math.floor(Date.now() / 1000), payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 12600, currency: "INR", method: "upi", notes: {} } } } });
    const signed = new Headers({ "x-razorpay-signature": createHmac("sha256", "whook").update(body).digest("hex") });
    expect(await handleWebhook("RAZORPAY", webhookPublicCode, body, new Headers({ "x-razorpay-signature": "0".repeat(64) }))).toEqual({ status: 401, body: "Invalid signature" });
    expect(await handleWebhook("STRIPE", webhookPublicCode, body, signed)).toEqual({ status: 404, body: "Not found" });
    expect(await handleWebhook("RAZORPAY", webhookPublicCode, body, signed)).toEqual({ status: 200, body: "OK" });
    expect(await handleWebhook("RAZORPAY", webhookPublicCode, body, signed)).toEqual({ status: 200, body: "Duplicate" });
    expect(await prisma.processedWebhookEvent.count({ where: { spaceId: space.id } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { spaceId: space.id, action: "PAYMENT_WEBHOOK_UNMATCHED" } })).toBe(1);
  });
});

describe.sequential("magic links", () => {
  it("issue a hashed, emailed link that signs in once", async () => {
    expect(await issueMagicLink(maker.email!)).toBe(true);
    const [message] = await prisma.outboxMessage.findMany({ where: { kind: "magic-link", payload: { path: ["to"], equals: maker.email! } } });
    const token = new URL((message.payload as { url: string }).url).searchParams.get("token")!;
    expect(await prisma.verificationToken.count({ where: { token } })).toBe(0);
    expect(await peekMagicLink(token)).toBe(maker.id);
    expect(await consumeMagicLink(token, maker.id)).toBe(true);
    expect(await consumeMagicLink(token, maker.id)).toBe(false);
    expect(await peekMagicLink(token)).toBeNull();
    await prisma.outboxMessage.delete({ where: { id: message.id } });
  });

  it("replace an older link when a new one is asked for", async () => {
    await issueMagicLink(maker.email!);
    await issueMagicLink(maker.email!);
    expect(await prisma.verificationToken.count({ where: { identifier: `magic-link:${maker.id}` } })).toBe(1);
    await prisma.outboxMessage.deleteMany({ where: { kind: "magic-link", payload: { path: ["to"], equals: maker.email! } } });
  });
});
