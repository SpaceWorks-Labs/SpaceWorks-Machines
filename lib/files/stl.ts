import { decodeText } from "./sniff";

/** Binary STL headers may also start with 'solid'; exact binary size takes precedence. */
export function parseStl(bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  const count = b.length >= 84 ? b.readUInt32LE(80) : -1;
  const binary = count >= 0 && b.length === 84 + 50 * count;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let vertices = 0;
  function vertex(values: number[]) {
    if (values.length !== 3 || values.some((v) => !Number.isFinite(v))) throw new Error("Invalid STL vertex.");
    values.forEach((v, axis) => { min[axis] = Math.min(min[axis], v); max[axis] = Math.max(max[axis], v); });
    vertices++;
  }
  if (binary) {
    for (let i = 0; i < count; i++) for (let j = 0; j < 3; j++) {
      const offset = 84 + i * 50 + 12 + j * 12;
      vertex([b.readFloatLE(offset), b.readFloatLE(offset + 4), b.readFloatLE(offset + 8)]);
    }
  } else {
    const text = decodeText(bytes);
    if (!/^solid(?:\s|$)/i.test(text.trimStart())) throw new Error("Invalid STL file.");
    for (const match of text.matchAll(/^\s*vertex\s+([^\r\n]+)/gim)) vertex(match[1].trim().split(/\s+/).map(Number));
    const facets = [...text.matchAll(/^\s*facet\s+normal\s/gim)].length;
    if (!/\bendsolid\b/i.test(text) || vertices % 3 || facets * 3 !== vertices) throw new Error("Invalid ASCII STL file.");
  }
  return { format: binary ? "binary" : "ascii", triangleCount: vertices / 3,
    boundingBox: vertices ? { min, max, size: max.map((value, axis) => value - min[axis]) } : null };
}
