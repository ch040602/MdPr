import { Buffer } from "node:buffer";

export type EmbeddedFontStyle = "regular" | "bold" | "italic" | "boldItalic";

export type OpenTypeFontInspection = {
  family: string;
  subfamily: string;
  fullName: string;
  versionName: string;
  style: EmbeddedFontStyle;
  weight: number;
  italic: boolean;
  fsType: number;
  embeddingPermission: "installable" | "editable" | "preview-print" | "restricted" | "invalid";
  editableEmbeddingAllowed: boolean;
  noSubsetting: boolean;
  bitmapOnly: boolean;
};

type SfntTable = { offset: number; length: number };

type ParsedOpenTypeFont = OpenTypeFontInspection & {
  panose: Buffer;
  unicodeRanges: number[];
  codePageRanges: number[];
  checksumAdjustment: number;
};

export function inspectOpenTypeFont(input: Uint8Array): OpenTypeFontInspection {
  const parsed = parseOpenTypeFont(input);
  const {
    panose: _panose,
    unicodeRanges: _unicodeRanges,
    codePageRanges: _codePageRanges,
    checksumAdjustment: _checksumAdjustment,
    ...inspection
  } = parsed;
  return inspection;
}

export function createEotFromOpenType(input: Uint8Array): Buffer {
  const font = Buffer.from(input);
  const parsed = parseOpenTypeFont(font);
  if (!parsed.editableEmbeddingAllowed) {
    const reason = parsed.bitmapOnly ? "bitmap-only" : parsed.embeddingPermission;
    throw new Error(`FONT_EMBEDDING_NOT_EDITABLE: ${parsed.family} is ${reason} (fsType=0x${parsed.fsType.toString(16).padStart(4, "0")}).`);
  }

  const fixed = Buffer.alloc(82);
  fixed.writeUInt32LE(0, 0);
  fixed.writeUInt32LE(font.length, 4);
  fixed.writeUInt32LE(0x00010000, 8);
  fixed.writeUInt32LE(0, 12);
  parsed.panose.copy(fixed, 16);
  fixed.writeUInt8(1, 26);
  fixed.writeUInt8(parsed.italic ? 1 : 0, 27);
  fixed.writeUInt32LE(parsed.weight, 28);
  fixed.writeUInt16LE(parsed.fsType, 32);
  fixed.writeUInt16LE(0x504c, 34);
  parsed.unicodeRanges.forEach((value, index) => fixed.writeUInt32LE(value, 36 + index * 4));
  parsed.codePageRanges.forEach((value, index) => fixed.writeUInt32LE(value, 52 + index * 4));
  fixed.writeUInt32LE(parsed.checksumAdjustment, 60);
  // Reserved1..4 and Padding1 are already zero-filled at bytes 64..81.

  const eot = Buffer.concat([
    fixed,
    sizedUtf16Le(parsed.family),
    Buffer.alloc(2),
    sizedUtf16Le(parsed.subfamily),
    Buffer.alloc(2),
    sizedUtf16Le(parsed.versionName),
    Buffer.alloc(2),
    sizedUtf16Le(parsed.fullName),
    font,
  ]);
  eot.writeUInt32LE(eot.length, 0);
  return eot;
}

function parseOpenTypeFont(input: Uint8Array): ParsedOpenTypeFont {
  const font = Buffer.from(input);
  if (font.length < 12) invalidFont("sfnt header is truncated");
  const signature = font.subarray(0, 4).toString("latin1");
  if (font.readUInt32BE(0) !== 0x00010000 && !["OTTO", "true", "typ1"].includes(signature)) {
    invalidFont("unsupported sfnt signature; TTC/OTC and web-font containers are not accepted");
  }
  const numTables = font.readUInt16BE(4);
  if (numTables === 0 || numTables > 4096 || 12 + numTables * 16 > font.length) invalidFont("table directory is invalid");

  const tables = new Map<string, SfntTable>();
  for (let index = 0; index < numTables; index += 1) {
    const entryOffset = 12 + index * 16;
    const tag = font.subarray(entryOffset, entryOffset + 4).toString("ascii");
    const offset = font.readUInt32BE(entryOffset + 8);
    const length = font.readUInt32BE(entryOffset + 12);
    if (offset > font.length || length > font.length - offset) invalidFont(`table ${tag} points outside the file`);
    tables.set(tag, { offset, length });
  }

  const os2 = requiredTable(tables, "OS/2", 64);
  const name = requiredTable(tables, "name", 6);
  const head = requiredTable(tables, "head", 12);
  const os2Version = font.readUInt16BE(os2.offset);
  const weight = font.readUInt16BE(os2.offset + 4);
  const fsType = font.readUInt16BE(os2.offset + 8);
  const italic = (font.readUInt16BE(os2.offset + 62) & 1) !== 0;
  const names = readNames(font, name);
  const family = names.get(1)?.trim();
  if (!family) invalidFont("English family name (name ID 1) is missing");
  const subfamily = names.get(2)?.trim() || "Regular";
  const fullName = names.get(4)?.trim() || `${family} ${subfamily}`;
  const versionName = names.get(5)?.trim() || "Version 1.0";
  const bold = weight >= 700 || /\b(?:bold|semibold|demibold|black)\b/i.test(subfamily);
  const slanted = italic || /\b(?:italic|oblique)\b/i.test(subfamily);
  const embeddingPermission = resolveEmbeddingPermission(fsType, os2Version);
  const bitmapOnly = (fsType & 0x0200) !== 0;

  return {
    family,
    subfamily,
    fullName,
    versionName,
    style: bold && slanted ? "boldItalic" : bold ? "bold" : slanted ? "italic" : "regular",
    weight,
    italic: slanted,
    fsType,
    embeddingPermission,
    editableEmbeddingAllowed: !bitmapOnly && (embeddingPermission === "installable" || embeddingPermission === "editable"),
    noSubsetting: (fsType & 0x0100) !== 0,
    bitmapOnly,
    panose: Buffer.from(font.subarray(os2.offset + 32, os2.offset + 42)),
    unicodeRanges: [42, 46, 50, 54].map((offset) => font.readUInt32BE(os2.offset + offset)),
    codePageRanges: os2.length >= 86
      ? [font.readUInt32BE(os2.offset + 78), font.readUInt32BE(os2.offset + 82)]
      : [0, 0],
    checksumAdjustment: font.readUInt32BE(head.offset + 8),
  };
}

function requiredTable(tables: Map<string, SfntTable>, tag: string, minimumLength: number): SfntTable {
  const table = tables.get(tag);
  if (!table || table.length < minimumLength) invalidFont(`${tag} table is missing or truncated`);
  return table;
}

function readNames(font: Buffer, table: SfntTable): Map<number, string> {
  const count = font.readUInt16BE(table.offset + 2);
  const stringStorage = font.readUInt16BE(table.offset + 4);
  if (6 + count * 12 > table.length || stringStorage > table.length) invalidFont("name table directory is invalid");
  const candidates = new Map<number, Array<{ score: number; value: string }>>();
  for (let index = 0; index < count; index += 1) {
    const record = table.offset + 6 + index * 12;
    const platform = font.readUInt16BE(record);
    const language = font.readUInt16BE(record + 4);
    const nameId = font.readUInt16BE(record + 6);
    if (![1, 2, 4, 5].includes(nameId)) continue;
    const length = font.readUInt16BE(record + 8);
    const relativeOffset = font.readUInt16BE(record + 10);
    const start = table.offset + stringStorage + relativeOffset;
    if (start > table.offset + table.length || length > table.offset + table.length - start) invalidFont("name string points outside the table");
    const raw = font.subarray(start, start + length);
    const value = platform === 0 || platform === 3 ? decodeUtf16Be(raw) : raw.toString("latin1");
    const score = platform === 3 && language === 0x0409 ? 4 : platform === 3 ? 3 : platform === 0 ? 2 : 1;
    const values = candidates.get(nameId) ?? [];
    values.push({ score, value });
    candidates.set(nameId, values);
  }
  const names = new Map<number, string>();
  for (const [nameId, values] of candidates) {
    values.sort((left, right) => right.score - left.score);
    if (values[0]?.value) names.set(nameId, values[0].value);
  }
  return names;
}

function decodeUtf16Be(raw: Buffer): string {
  if (raw.length % 2 !== 0) invalidFont("UTF-16BE name string has an odd byte length");
  const littleEndian = Buffer.alloc(raw.length);
  for (let index = 0; index < raw.length; index += 2) {
    littleEndian[index] = raw[index + 1]!;
    littleEndian[index + 1] = raw[index]!;
  }
  return littleEndian.toString("utf16le");
}

function resolveEmbeddingPermission(fsType: number, os2Version: number): OpenTypeFontInspection["embeddingPermission"] {
  const usage = fsType & 0x000f;
  if (usage === 0) return "installable";
  if ((usage & 0x0001) !== 0) return "invalid";
  const selected = [0x0002, 0x0004, 0x0008].filter((bit) => (usage & bit) !== 0);
  if (selected.length !== 1 && os2Version >= 3) return "invalid";
  if ((usage & 0x0008) !== 0) return "editable";
  if ((usage & 0x0004) !== 0) return "preview-print";
  if ((usage & 0x0002) !== 0) return "restricted";
  return "invalid";
}

function sizedUtf16Le(value: string): Buffer {
  const encoded = Buffer.from(value, "utf16le");
  if (encoded.length > 0xffff) invalidFont("EOT name string is too long");
  const size = Buffer.alloc(2);
  size.writeUInt16LE(encoded.length, 0);
  return Buffer.concat([size, encoded]);
}

function invalidFont(message: string): never {
  throw new Error(`FONT_FILE_INVALID: ${message}.`);
}
