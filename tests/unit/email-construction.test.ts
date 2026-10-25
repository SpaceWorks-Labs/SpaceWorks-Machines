import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendMail: vi.fn(), spaceFindUnique: vi.fn() }));
vi.mock("@/lib/email/transporter", () => ({
  getEmailTransport: vi.fn().mockResolvedValue({
    transporter: { sendMail: mocks.sendMail },
    from: "Space Works Machines <noreply@example.test>",
  }),
  assertEmailAccepted: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: { space: { findUnique: mocks.spaceFindUnique } } }));

import { sendBrandedEmail } from "@/lib/email/message";
import { deliverAdminApplicationAlert, deliverSpaceNotice, deliverOwnerInvite } from "@/lib/email/space";

const lastMessage = () => mocks.sendMail.mock.calls.at(-1)?.[0];

describe("branded email construction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.spaceFindUnique.mockResolvedValue({ name: "Kochi Runners", slug: "kochi-runners" });
  });

  it("escapes HTML fields and strips control characters from subjects", async () => {
    await sendBrandedEmail({
      to: "person@example.test",
      subject: "Planning\r\nBcc: victim@example.test",
      heading: "Planning</title><script>alert(1)</script>",
      paragraphs: ["<b>bold</b>"],
      messageId: "<stable@outbox.invalid>",
    });
    const message = lastMessage();
    expect(message.messageId).toBe("<stable@outbox.invalid>");
    expect(message.subject).toBe("Planning Bcc: victim@example.test");
    expect(message.html).not.toContain("</title><script>");
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("wears the Space Works brand: hosted lockup, pill teal buttons with cream labels, Space Works footer", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://members.test/");
    await sendBrandedEmail({ to: "person@example.test", subject: "Hi", heading: "Hi", paragraphs: ["Hello"], action: { label: "Open", url: "https://members.test/dashboard" } });
    vi.unstubAllEnvs();
    const message = lastMessage();
    expect(message.html).toContain('<img src="https://members.test/brand/logo/lockup-horizontal.png" width="180" height="29" alt="Space Works"');
    expect(message.html).toContain("background-color: #006E63; color: #FFF4E8;");
    expect(message.html).toContain("border-radius: 9999px");
    expect(message.html).toContain("This email was sent by Space Works Machines.");
    expect(message.html).toMatch(/&copy; \d{4} Space Works\s*<\/div>/);
    expect(message.text).toContain("Open: https://members.test/dashboard");
    // Workshop Orange is never text, and nothing of the Events product leaks in.
    expect(message.html).not.toMatch(/color: #FF7447/i);
    expect(`${message.html}${message.text}`).not.toMatch(/Space Works Events/i);
  });

  it("leaves the hosted lockup out instead of linking localhost when no public address is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "");
    await sendBrandedEmail({ to: "person@example.test", subject: "Hi", heading: "Hi", paragraphs: [] });
    vi.unstubAllEnvs();
    const message = lastMessage();
    expect(message.html).not.toContain("<img");
    expect(message.html).not.toContain("localhost");
    expect(message.html).toContain(">Space Works</span>");
  });

  it("HTML-escapes capability URLs in links", async () => {
    await sendBrandedEmail({ to: "person@example.test", subject: "Join", heading: "Join", paragraphs: [], action: { label: "Join", url: "https://members.test/join/token?one=1&two=2" } });
    const message = lastMessage();
    expect(message.html).toContain("one=1&amp;two=2");
    expect(message.html).not.toContain('href="https://members.test/join/token?one=1&two=2"');
  });
});

describe("space lifecycle emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://members.test");
    mocks.spaceFindUnique.mockResolvedValue({ name: "Kochi Runners", slug: "kochi-runners" });
  });

  it("links an approved space to its dashboard", async () => {
    await expect(deliverSpaceNotice({ to: "owner@example.test", spaceId: "space_1", notice: "approved" }, "<m@x>")).resolves.toBe("sent");
    const message = lastMessage();
    expect(message.subject).toBe("Kochi Runners is approved");
    expect(message.text).toContain("https://members.test/dashboard/kochi-runners");
  });

  it("includes the reviewer note when changes are requested", async () => {
    await deliverSpaceNotice({ to: "owner@example.test", spaceId: "space_1", notice: "changes-requested", reason: "Add your <registration> number" }, "<m@x>");
    const message = lastMessage();
    expect(message.text).toContain("Note from the platform team: Add your <registration> number");
    expect(message.html).toContain("Add your &lt;registration&gt; number");
    expect(message.text).toContain("https://members.test/dashboard/kochi-runners/application");
  });

  it("drops a notice for a space that no longer exists", async () => {
    mocks.spaceFindUnique.mockResolvedValue(null);
    await expect(deliverSpaceNotice({ to: "owner@example.test", spaceId: "gone", notice: "received" }, "<m@x>")).resolves.toBe("dropped");
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("points platform admins at the review page", async () => {
    await deliverAdminApplicationAlert({ to: "admin@example.test", spaceId: "space_1", resubmitted: true }, "<m@x>");
    const message = lastMessage();
    expect(message.subject).toBe("Updated application: Kochi Runners");
    expect(message.text).toContain("https://members.test/super-admin/spaces/space_1");
  });

  it("sends an owner invite with its join link and drops an expired one", async () => {
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    await expect(deliverOwnerInvite({ to: "new-owner@example.test", spaceId: "space_1", token: "tok_abc", expiresAt }, "<m@x>")).resolves.toBe("sent");
    expect(lastMessage().text).toContain("https://members.test/join/space/tok_abc");
    mocks.sendMail.mockClear();
    const expired = new Date(Date.now() - 1000).toISOString();
    await expect(deliverOwnerInvite({ to: "new-owner@example.test", spaceId: "space_1", token: "tok_abc", expiresAt: expired }, "<m@x>")).resolves.toBe("dropped");
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});
