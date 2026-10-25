/**
 * A small RFC 4180 CSV reader and writer. Handles quoted fields, escaped quotes, commas and newlines
 * inside quotes, CRLF line endings and a UTF-8 byte-order mark. Client-safe.
 */

export const MAX_CSV_BYTES = 2 * 1024 * 1024;

export function parseCsv(input: string, maxRows = 10_000): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === "") quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      if (rows.length > maxRows) throw new Error(`The file has more than ${maxRows} rows.`);
    } else field += char;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  if (rows.length > maxRows) throw new Error(`The file has more than ${maxRows} rows.`);
  return rows;
}

/** Neutralise spreadsheet formulas so an exported cell can never run as one when opened. */
function safeCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const numeric = typeof value === "number" || /^-?\d+(\.\d+)?$/.test(text);
  const guarded = !numeric && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCsvRow(values: unknown[]): string {
  return values.map(safeCell).join(",");
}
