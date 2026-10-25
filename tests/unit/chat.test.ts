import { afterEach, describe, expect, it, vi } from "vitest";
import { CHAT_CONFIG_SCHEMAS, describeTarget } from "@/lib/chat/config";
import { ChatGoneError, ChatSendError, sendChatMessage, whatsappParameter } from "@/lib/chat/send";

const slackUrl = "https://hooks.slack.com/services/T0000000/B0000000/abcdefghijklmnopqrstuvwx";
const discordUrl = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_ABCDEFGH";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(status === 204 ? null : "ok", { status }); }));
  return calls;
}

describe("chat channel settings", () => {
  it("pins each provider to its own address", () => {
    expect(CHAT_CONFIG_SCHEMAS.SLACK.safeParse({ webhookUrl: slackUrl }).success).toBe(true);
    expect(CHAT_CONFIG_SCHEMAS.SLACK.safeParse({ webhookUrl: "https://hooks.slack.com.evil.example/services/T0/B0/xyzxyzxyzxyz" }).success).toBe(false);
    expect(CHAT_CONFIG_SCHEMAS.SLACK.safeParse({ webhookUrl: "http://hooks.slack.com/services/T0000000/B0000000/abcdefghij" }).success).toBe(false);
    expect(CHAT_CONFIG_SCHEMAS.DISCORD.safeParse({ webhookUrl: discordUrl }).success).toBe(true);
    expect(CHAT_CONFIG_SCHEMAS.DISCORD.safeParse({ webhookUrl: "https://discord.com.evil.example/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz" }).success).toBe(false);
    expect(CHAT_CONFIG_SCHEMAS.MATTERMOST.safeParse({ webhookUrl: "https://chat.example.org/hooks/abcdefghij1234567890" }).success).toBe(true);
    expect(CHAT_CONFIG_SCHEMAS.MATTERMOST.safeParse({ webhookUrl: "https://chat.example.org/api/v4/users" }).success).toBe(false);
    expect(CHAT_CONFIG_SCHEMAS.TELEGRAM.safeParse({ botToken: "123456789:AAEhBOweik6ad9r_QXMENQjcrGbqCr4K-ab", chatId: "-1001234567890" }).success).toBe(true);
    expect(CHAT_CONFIG_SCHEMAS.WHATSAPP.safeParse({ phoneNumberId: "1234567890", accessToken: "x".repeat(40), recipients: ["+919876543210"] }).data).toMatchObject({ templateName: "team_alert", language: "en" });
    expect(CHAT_CONFIG_SCHEMAS.WHATSAPP.safeParse({ phoneNumberId: "1234567890", accessToken: "x".repeat(40), recipients: Array(6).fill("+919876543210") }).success).toBe(false);
  });

  it("describes where a channel posts without revealing the secret", () => {
    expect(describeTarget("SLACK", { webhookUrl: slackUrl })).toBe("Slack webhook ••••uvwx");
    expect(describeTarget("TELEGRAM", { botToken: "123456789:secret", chatId: "@ourteam" })).toBe("Telegram chat @ourteam");
    expect(describeTarget("WHATSAPP", { phoneNumberId: "1", accessToken: "t", recipients: ["+919876543210", "+919876543211"], templateName: "team_alert", language: "en" })).toBe("WhatsApp ••••3210 and 1 more");
  });
});

describe("sending chat alerts", () => {
  it("posts plain text in each provider's shape, never following redirects", async () => {
    const calls = stubFetch();
    await sendChatMessage("SLACK", { webhookUrl: slackUrl }, "Hello");
    await sendChatMessage("DISCORD", { webhookUrl: discordUrl }, "Hello");
    await sendChatMessage("TELEGRAM", { botToken: "123456789:token", chatId: "-100123" }, "Hello");
    expect(calls.map((call) => call.url)).toEqual([slackUrl, discordUrl, "https://api.telegram.org/bot123456789:token/sendMessage"]);
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ text: "Hello" });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ content: "Hello", allowed_mentions: { parse: [] } });
    expect(JSON.parse(String(calls[2].init.body))).toMatchObject({ chat_id: "-100123", text: "Hello" });
    expect(calls.every((call) => call.init.redirect === "error")).toBe(true);
  });

  it("sends WhatsApp through the approved template, once per number, on one line", async () => {
    const calls = stubFetch();
    await sendChatMessage("WHATSAPP", { phoneNumberId: "555", accessToken: "token", recipients: ["+919876543210", "919876543211"], templateName: "team_alert", language: "en" }, "New application\nReview it:   https://x");
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://graph.facebook.com/v21.0/555/messages");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer token");
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ to: "919876543210", type: "template", template: { name: "team_alert", components: [{ parameters: [{ text: "New application Review it: https://x" }] }] } });
    expect(whatsappParameter("a\tb\n\nc     d")).toBe("a b c d");
  });

  it("tells a removed destination apart from a passing outage", async () => {
    stubFetch(404);
    await expect(sendChatMessage("SLACK", { webhookUrl: slackUrl }, "x")).rejects.toBeInstanceOf(ChatGoneError);
    stubFetch(503);
    await expect(sendChatMessage("SLACK", { webhookUrl: slackUrl }, "x")).rejects.toMatchObject({ retryable: true });
    stubFetch(400);
    await expect(sendChatMessage("DISCORD", { webhookUrl: discordUrl }, "x")).rejects.toBeInstanceOf(ChatSendError);
    await expect(sendChatMessage("TELEGRAM", { botToken: "1:t", chatId: "1" }, "x")).rejects.toBeInstanceOf(ChatGoneError);
  });
});
