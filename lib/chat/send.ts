import "server-only";

import { postPublicJson } from "@/lib/net/postJson";
import type { ChatConfig } from "./config";
import type { ChatKind } from "./events";

/** The destination no longer exists or no longer accepts us (webhook deleted, bot removed, token revoked). */
export class ChatGoneError extends Error {
  override name = "ChatGoneError";
}

/** A send that failed for now; retryable failures are tried again by the queue. */
export class ChatSendError extends Error {
  override name = "ChatSendError";
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

async function post(url: string, body: unknown, headers: Record<string, string> = {}, goneStatuses = [401, 403, 404, 410], customHost = false) {
  let status: number;
  try {
    // Never follow redirects: a destination must not bounce us somewhere else.
    if (customHost) status = await postPublicJson(new URL(url), JSON.stringify(body), headers);
    else {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(10_000), cache: "no-store" });
      status = response.status;
      await response.body?.cancel().catch(() => undefined);
    }
  } catch {
    throw new ChatSendError("The chat service could not be reached.", true);
  }
  if (status >= 200 && status < 300) return;
  if (goneStatuses.includes(status)) throw new ChatGoneError(`The chat service refused the message (${status}). Check the channel's settings.`);
  throw new ChatSendError(`The chat service answered ${status}.`, status === 429 || status >= 500);
}

/** WhatsApp template parameters may not contain line breaks, tabs or runs of spaces. */
export function whatsappParameter(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 1000);
}

/** Post one plain-text message to a channel. */
export async function sendChatMessage(kind: ChatKind, config: ChatConfig[ChatKind], text: string) {
  switch (kind) {
    case "SLACK": {
      const { webhookUrl } = config as ChatConfig["SLACK"];
      return post(webhookUrl, { text, unfurl_links: false, unfurl_media: false });
    }
    case "DISCORD": {
      const { webhookUrl } = config as ChatConfig["DISCORD"];
      return post(webhookUrl, { content: text.slice(0, 2000), allowed_mentions: { parse: [] } });
    }
    case "MATTERMOST": {
      const { webhookUrl } = config as ChatConfig["MATTERMOST"];
      return post(webhookUrl, { text }, {}, [401, 403, 404, 410], true);
    }
    case "TELEGRAM": {
      const { botToken, chatId } = config as ChatConfig["TELEGRAM"];
      return post(`https://api.telegram.org/bot${botToken}/sendMessage`, { chat_id: chatId, text: text.slice(0, 4096), disable_web_page_preview: true }, {}, [400, 401, 403, 404]);
    }
    case "WHATSAPP": {
      const { phoneNumberId, accessToken, recipients, templateName, language } = config as ChatConfig["WHATSAPP"];
      for (const to of recipients) {
        await post(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
          messaging_product: "whatsapp",
          to: to.replace(/^\+/, ""),
          type: "template",
          template: { name: templateName, language: { code: language }, components: [{ type: "body", parameters: [{ type: "text", text: whatsappParameter(text) }] }] },
        }, { authorization: `Bearer ${accessToken}` }, [401, 403, 404]);
      }
    }
  }
}
