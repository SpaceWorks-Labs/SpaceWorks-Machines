export type ColorMode = "light" | "dark";

/**
 * The person's choice, kept in a cookie so the server renders the right mode without a flash.
 * Light is the default and there is no "System" option (ui-brand-spec D11).
 */
export const COLOR_MODE_COOKIE = "swm.theme";

export function isColorMode(value: string | undefined): value is ColorMode {
  return value === "light" || value === "dark";
}

/** The mode to render: the saved choice, or light. */
export function resolveColorMode(saved: string | undefined): ColorMode {
  return isColorMode(saved) ? saved : "light";
}
