# Email and chat notifications

## Email

Every email is a row in the database outbox (`enqueueOutbox` in `lib/outbox.ts`), queued in the same
transaction as the change it reports, so a rolled-back change never sends anything. The BullMQ worker delivers
rows one at a time and retries failures with backoff; PostgreSQL decides when a row is due again. Rows that
carry a bearer link or code (sign-in links and codes, password resets, email verification, invites) are deleted
once sent, and the short-lived ones are dropped rather than sent after they expire.

| Kind (`lib/outboxKinds.ts`) | When | Sent through |
|---|---|---|
| `password-reset` | someone asks to reset a password | platform |
| `email-verification` | a new account signs up, or asks for the link again | platform |
| `magic-link` | someone asks for an emailed sign-in link (15 minutes, single use) | platform |
| `login-code` | an account without an authenticator signs in with a password from a new browser | platform |
| `login-alert` | the first sign-in from a new device | platform |
| `space-notice` | a space's application is received, approved, sent back for changes, rejected, suspended, reactivated or created by the super admin (to its machine managers) | platform |
| `space-application-alert` | a space applies or resubmits (to super admins) | platform |
| `owner-invite` | the super admin invites a space's first machine manager | platform |
| `member-notice` | a maker is invited, or their request to join is approved or declined | the space's own SMTP when set up and on; otherwise the platform's, in the space's name |
| `chat-notice` | a chat alert (see below); not an email, but delivered through the same outbox | the chat provider |

Later phases add job, payment and maintenance emails as new kinds in `lib/outboxKinds.ts`.

**The platform's email** is set in Super admin → Settings (sender, SMTP service or host, port, login), which
overrides the `EMAIL_FROM` and `SMTP_*` variables. Account emails always use it and never pass a `spaceId`.

**A space's own email** lives in Space settings → Email (machine managers): sender name and address, reply-to,
SMTP host, port (587 or 2525 STARTTLS, 465 TLS, 25 STARTTLS), login and password. The password is stored
encrypted (`PAYMENT_SECRETS_KEY`, a key derived for email and bound to the space). **Send test email** sends to
the person testing and records when it last went through. In production TLS is required and the host must
resolve to public addresses.

Without its own settings a space's maker emails come from the platform address but in the space's name
(`"Tinkerspace" <noreply@platform>`), with replies going to its contact email.

Code: `sendBrandedEmail({ spaceId, … })` in `lib/email/message.ts` picks the route through
`spaceEmailTransport` (`lib/email/spaceTransport.ts`); emails without `spaceId` use the platform.

## Chat alerts

Space settings → Notifications (machine managers) holds up to ten chat channels per space. Each picks its
alerts from `CHAT_EVENTS` in `lib/chat/events.ts`:

| Alert | Event | When |
|---|---|---|
| A maker asked to join | `join-request` | a maker asks to join a space whose join policy is Approval |
| A maker joined | `member-joined` | a maker joins an Open space, or a machine manager approves their request |
| A maker left | `member-left` | an active maker leaves from their account |

Later phases add job, payment and maintenance alerts to the same list.

Alerts are staff-only and short: the space, what happened, and a link to the dashboard's Team page. Makers'
names appear only when the channel turns on **Show member names**; otherwise the alert says "A maker". The queue holds
only ids: the text is built when the alert is sent, and dropped if the record has gone. Alerts are queued with
`queueChatAlerts` in the same transaction as the event and delivered by the worker with retries. A channel the
provider no longer accepts (deleted webhook, removed bot, revoked token) is switched off and its error shown.

### Setting up each service

- **Slack:** add the *Incoming Webhooks* app to a channel and paste its URL (`https://hooks.slack.com/services/…`).
- **Discord:** channel settings → Integrations → Webhooks → New webhook → *Copy webhook URL*
  (`https://discord.com/api/webhooks/…`). Mentions are disabled in every alert.
- **Mattermost:** Integrations → Incoming webhooks → Add, then paste the URL (`https://your-server/hooks/…`).
  The server must be reachable over HTTPS at a public address.
- **Telegram:** create a bot with @BotFather, add it to your group or channel, and use the bot token and the
  chat's numeric ID (or `@channelname` for a public channel).
- **WhatsApp:** uses the WhatsApp Business Cloud API (Meta). In WhatsApp Manager create a *Utility* template
  named `team_alert`, language English (`en`), whose body is exactly `{{1}}`, and get it approved. Then enter the
  phone number ID, a permanent access token (a system user token), and up to five recipient numbers with the
  country code. Business-started WhatsApp messages can only use approved templates; each alert is sent as that
  template's one parameter, on a single line.

Destinations are stored encrypted (`PAYMENT_SECRETS_KEY`, a key derived for chat and bound to the space).
Slack, Discord, Telegram and WhatsApp only ever post to their own provider's address; nothing follows
redirects.

Code: `lib/chat/*` (`events.ts`, `config.ts`, `send.ts`, `message.ts`, `notify.ts`); `queueChatAlerts` is called
where each event happens.
