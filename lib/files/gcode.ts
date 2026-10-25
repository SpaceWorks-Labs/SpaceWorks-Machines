import { decodeText } from "./sniff";

function duration(text: string) {
  let seconds = 0;
  let found = false;
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*([dhms])/gi)) {
    found = true;
    seconds += Number(match[1]) * ({ d: 86400, h: 3600, m: 60, s: 1 }[match[2].toLowerCase()] ?? 0);
  }
  return found && Number.isFinite(seconds) ? seconds : undefined;
}

/** Header comments from PrusaSlicer, Cura and Bambu/Orca. Unknown estimates stay absent. */
export function parseGcode(bytes: Uint8Array) {
  const text = decodeText(bytes);
  const metadata: Record<string, string | number> = {};
  const slicer = /PrusaSlicer|Cura(?:_SteamEngine)?|BambuStudio|Bambu Studio|OrcaSlicer/i.exec(text);
  if (slicer) metadata.slicer = slicer[0];
  const time = /(?:^|;)\s*total estimated time\s*[=:]\s*([^;\r\n]+)/im.exec(text) ??
    /;\s*(?:estimated printing time(?:\s*\([^\r\n]*?\))?|model printing time)\s*[=:]\s*([^;\r\n]+)/i.exec(text);
  const seconds = time ? duration(time[1]) : undefined;
  const cura = /^;\s*TIME\s*:\s*(\d+(?:\.\d+)?)/im.exec(text);
  const minutes = (seconds ?? (cura ? Number(cura[1]) : NaN)) / 60;
  if (Number.isFinite(minutes)) metadata.estimatedMinutes = minutes;
  const grams = /;\s*(?:(?:total )?filament used\s*\[g\]|total filament weight\s*\[g\])\s*[=:]\s*([\d., ]+)/i.exec(text);
  const length = /;\s*(?:filament used\s*\[mm\]|total filament length\s*\[mm\])\s*[=:]\s*([\d., ]+)/i.exec(text);
  const sum = (value: string) => value.split(",").reduce((total, n) => /^\d+(?:\.\d+)?$/.test(n.trim()) ? total + Number(n.trim()) : NaN, 0);
  if (grams && Number.isFinite(sum(grams[1]))) metadata.filamentGrams = sum(grams[1]);
  if (length && Number.isFinite(sum(length[1]))) metadata.filamentLengthMm = sum(length[1]);
  const curaLength = /;\s*Filament used:\s*([\d.]+)\s*(mm|m)\b/i.exec(text);
  const curaMm = curaLength ? Number(curaLength[1]) * (curaLength[2] === "m" ? 1000 : 1) : NaN;
  if (Number.isFinite(curaMm)) metadata.filamentLengthMm = curaMm;
  return metadata;
}
