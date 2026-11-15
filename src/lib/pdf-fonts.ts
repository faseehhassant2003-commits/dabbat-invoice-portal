import { readFileSync } from "node:fs";
import path from "node:path";

// Read the Unicode cmap from the bundled static TrueType files. Reject missing
// glyphs before issuing an invoice rather than silently dropping customer text.
function hasGlyph(font: Buffer, code: number): boolean {
  let cmap = 0;
  for (let index = 0; index < font.readUInt16BE(4); index++) {
    const at = 12 + index * 16;
    if (font.toString("ascii", at, at + 4) === "cmap") cmap = font.readUInt32BE(at + 8);
  }
  if (!cmap) return false;
  for (let index = 0; index < font.readUInt16BE(cmap + 2); index++) {
    const at = cmap + font.readUInt32BE(cmap + 8 + index * 8);
    const format = font.readUInt16BE(at);
    if (format === 12) {
      for (let group = 0; group < font.readUInt32BE(at + 12); group++) {
        const start = font.readUInt32BE(at + 16 + group * 12);
        const end = font.readUInt32BE(at + 20 + group * 12);
        if (code >= start && code <= end && font.readUInt32BE(at + 24 + group * 12) + code - start !== 0) return true;
      }
    } else if (format === 4 && code <= 0xffff) {
      const count = font.readUInt16BE(at + 6) / 2;
      for (let segment = 0; segment < count; segment++) {
        const end = font.readUInt16BE(at + 14 + 2 * segment);
        const start = font.readUInt16BE(at + 16 + 2 * count + 2 * segment);
        if (code < start || code > end) continue;
        const delta = font.readInt16BE(at + 16 + 4 * count + 2 * segment);
        const rangeAt = at + 16 + 6 * count + 2 * segment;
        const range = font.readUInt16BE(rangeAt);
        const glyph = range ? font.readUInt16BE(rangeAt + range + 2 * (code - start)) : code;
        if (glyph !== 0 && ((glyph + delta) & 0xffff) !== 0) return true;
      }
    }
  }
  return false;
}

const cached = new Map<number, string | null>();
let fonts: { family: string; regular: Buffer; bold: Buffer }[] | undefined;
export function pdfFontForCharacter(character: string): string {
  const code = character.codePointAt(0)!;
  if ([9, 10, 13, 0x200c, 0x200d].includes(code)) return "Noto Sans";
  if (!cached.has(code)) {
    fonts ??= ["NotoSans", "NotoSansDevanagari"].map((name) => ({ family: name === "NotoSans" ? "Noto Sans" : "Noto Devanagari", regular: readFileSync(path.join(process.cwd(), "public", "fonts", `${name}-Regular.ttf`)), bold: readFileSync(path.join(process.cwd(), "public", "fonts", `${name}-Bold.ttf`)) }));
    cached.set(code, fonts.find((font) => hasGlyph(font.regular, code) && hasGlyph(font.bold, code))?.family || null);
  }
  const family = cached.get(code);
  if (!family) throw new Error("This order has text in a script the PDF fonts do not support. Add an appropriate font before generating its invoice.");
  return family;
}

export function assertPdfTextValues(value: unknown): void {
  if (typeof value === "string") for (const character of value) pdfFontForCharacter(character);
  else if (value && typeof value === "object") Object.values(value).forEach(assertPdfTextValues);
}
