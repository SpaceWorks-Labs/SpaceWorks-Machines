import "server-only";

import crypto from "crypto";

/**
 * Refuse passwords that appear in known data breaches, using the Have I Been Pwned "Pwned Passwords" range
 * API with k-anonymity: only the first five characters of the password's SHA-1 hash leave the server, and the
 * response is padded so its size reveals nothing. If the service can't be reached the password is allowed
 * (the length rules still apply). PWNED_PASSWORDS_CHECK=0 turns the check off for offline installs.
 */
export const BREACHED_PASSWORD_MESSAGE = "That password has appeared in a data breach, so it's easy to guess. Choose a different one.";

export async function isBreachedPassword(password: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (process.env.PWNED_PASSWORDS_CHECK === "0") return false;
  const hash = crypto.createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const response = await fetcher(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "SpaceWorks-Machines" },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) return false;
    for (const line of (await response.text()).split("\n")) {
      const [candidate, count] = line.trim().split(":");
      // Padding rows carry a count of 0.
      if (candidate === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch {
    console.warn("[passwords] breach check unavailable; allowing the password");
    return false;
  }
}
