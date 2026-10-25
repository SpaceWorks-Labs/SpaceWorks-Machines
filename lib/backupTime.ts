/**
 * The server fills the backup field with the stored UTC time, so the value is
 * read back as UTC too. Parsing it in the browser's zone would move the stored
 * time by the UTC offset on every save.
 */
export function backupInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
