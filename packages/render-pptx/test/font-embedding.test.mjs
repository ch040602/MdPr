import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import JSZip from "jszip";

import { createEotFromOpenType, embedOpenTypeFontsInPptx, inspectOpenTypeFont } from "../dist/index.js";

test("inspects an installable OpenType font and wraps it as uncompressed EOT", () => {
  const font = syntheticOpenTypeFont({
    family: "MDPR Test Sans",
    subfamily: "Regular",
    fullName: "MDPR Test Sans Regular",
    fsType: 0,
  });

  const inspected = inspectOpenTypeFont(font);
  assert.equal(inspected.family, "MDPR Test Sans");
  assert.equal(inspected.style, "regular");
  assert.equal(inspected.embeddingPermission, "installable");
  assert.equal(inspected.editableEmbeddingAllowed, true);

  const eot = createEotFromOpenType(font);
  assert.equal(eot.readUInt32LE(0), eot.length);
  assert.equal(eot.readUInt32LE(4), font.length);
  assert.equal(eot.readUInt32LE(8), 0x00010000);
  assert.equal(eot.readUInt32LE(12), 0);
  assert.equal(eot.readUInt16LE(34), 0x504c);
  assert.deepEqual(eot.subarray(eot.length - font.length), font);
});

test("allows editable embedding and identifies bold italic style", () => {
  const font = syntheticOpenTypeFont({
    family: "MDPR Test Sans",
    subfamily: "Bold Italic",
    fullName: "MDPR Test Sans Bold Italic",
    fsType: 0x0008,
    weight: 700,
    italic: true,
  });

  const inspected = inspectOpenTypeFont(font);
  assert.equal(inspected.style, "boldItalic");
  assert.equal(inspected.embeddingPermission, "editable");
  assert.equal(inspected.editableEmbeddingAllowed, true);
  assert.doesNotThrow(() => createEotFromOpenType(font));
});

test("blocks font permissions that cannot be used in an editable presentation", () => {
  for (const [fsType, expected] of [
    [0x0002, "restricted"],
    [0x0004, "preview-print"],
    [0x0200, "bitmap-only"],
  ]) {
    const font = syntheticOpenTypeFont({ fsType });
    const inspected = inspectOpenTypeFont(font);
    assert.equal(inspected.editableEmbeddingAllowed, false);
    assert.throws(
      () => createEotFromOpenType(font),
      new RegExp(`FONT_EMBEDDING_NOT_EDITABLE.*${expected}`),
    );
  }
});

test("rejects malformed sfnt offsets instead of reading outside the font", () => {
  const font = syntheticOpenTypeFont({});
  font.writeUInt32BE(0xfffffff0, 12 + 8);
  assert.throws(() => inspectOpenTypeFont(font), /FONT_FILE_INVALID/);
});

test("adds grouped EOT font parts, relationships, and PresentationML declarations", async () => {
  const root = mkdtempSync(join(tmpdir(), "mdpresent-font-embed-"));
  try {
    const pptxPath = join(root, "deck.pptx");
    const regularPath = join(root, "regular.ttf");
    const boldPath = join(root, "bold.ttf");
    writeFileSync(regularPath, syntheticOpenTypeFont({ family: "MDPR Test Sans" }));
    writeFileSync(boldPath, syntheticOpenTypeFont({
      family: "MDPR Test Sans",
      subfamily: "Bold",
      fullName: "MDPR Test Sans Bold",
      weight: 700,
      fsType: 0x0008,
    }));
    writeFileSync(pptxPath, await minimalPptxPackage());

    const result = await embedOpenTypeFontsInPptx(pptxPath, [regularPath, boldPath]);

    assert.equal(result.performed, true);
    assert.equal(result.fonts.length, 2);
    assert.deepEqual(result.fonts.map((font) => font.style), ["regular", "bold"]);
    assert.match(result.fonts[0].sha256, /^[a-f0-9]{64}$/);
    const zip = await JSZip.loadAsync(readFileSync(pptxPath));
    const presentation = await zip.file("ppt/presentation.xml").async("string");
    const relationships = await zip.file("ppt/_rels/presentation.xml.rels").async("string");
    const contentTypes = await zip.file("[Content_Types].xml").async("string");
    assert.match(presentation, /<p:embeddedFontLst>/);
    assert.match(presentation, /<p:font typeface="MDPR Test Sans"\/>/);
    assert.match(presentation, /<p:regular r:id="rId2"\/>/);
    assert.match(presentation, /<p:bold r:id="rId3"\/>/);
    assert.match(relationships, /Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/font" Target="fonts\/font1\.fntdata"/);
    assert.match(contentTypes, /Extension="fntdata" ContentType="application\/x-fontdata"/);
    const eot = await zip.file("ppt/fonts/font1.fntdata").async("nodebuffer");
    assert.equal(eot.readUInt16LE(34), 0x504c);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects duplicate family/style inputs before changing the PPTX", async () => {
  const root = mkdtempSync(join(tmpdir(), "mdpresent-font-embed-"));
  try {
    const pptxPath = join(root, "deck.pptx");
    const firstPath = join(root, "first.ttf");
    const secondPath = join(root, "second.ttf");
    writeFileSync(firstPath, syntheticOpenTypeFont({}));
    writeFileSync(secondPath, syntheticOpenTypeFont({}));
    const original = await minimalPptxPackage();
    writeFileSync(pptxPath, original);
    await assert.rejects(
      embedOpenTypeFontsInPptx(pptxPath, [firstPath, secondPath]),
      /FONT_EMBEDDING_DUPLICATE_STYLE/,
    );
    assert.deepEqual(readFileSync(pptxPath), original);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function syntheticOpenTypeFont({
  family = "MDPR Test Sans",
  subfamily = "Regular",
  fullName = `${family} ${subfamily}`,
  version = "Version 1.0",
  fsType = 0,
  weight = 400,
  italic = false,
} = {}) {
  const os2 = Buffer.alloc(96);
  os2.writeUInt16BE(4, 0);
  os2.writeUInt16BE(weight, 4);
  os2.writeUInt16BE(5, 6);
  os2.writeUInt16BE(fsType, 8);
  Buffer.from([2, 11, 6, 4, 2, 2, 2, 2, 2, 4]).copy(os2, 32);
  os2.writeUInt32BE(1, 42);
  os2.writeUInt16BE((italic ? 1 : 0) | (weight >= 700 ? 1 << 5 : 0), 62);
  os2.writeUInt32BE(1, 78);

  const head = Buffer.alloc(12);
  head.writeUInt32BE(0x12345678, 8);

  const name = nameTable([
    [1, family],
    [2, subfamily],
    [4, fullName],
    [5, version],
  ]);
  return sfnt({ "OS/2": os2, head, name });
}

function nameTable(entries) {
  const encoded = entries.map(([nameId, value]) => [nameId, utf16be(value)]);
  const recordsSize = encoded.length * 12;
  const out = Buffer.alloc(6 + recordsSize + encoded.reduce((sum, [, value]) => sum + value.length, 0));
  out.writeUInt16BE(0, 0);
  out.writeUInt16BE(encoded.length, 2);
  out.writeUInt16BE(6 + recordsSize, 4);
  let stringOffset = 0;
  encoded.forEach(([nameId, value], index) => {
    const offset = 6 + index * 12;
    out.writeUInt16BE(3, offset);
    out.writeUInt16BE(1, offset + 2);
    out.writeUInt16BE(0x0409, offset + 4);
    out.writeUInt16BE(nameId, offset + 6);
    out.writeUInt16BE(value.length, offset + 8);
    out.writeUInt16BE(stringOffset, offset + 10);
    value.copy(out, 6 + recordsSize + stringOffset);
    stringOffset += value.length;
  });
  return out;
}

function utf16be(value) {
  const le = Buffer.from(value, "utf16le");
  for (let index = 0; index < le.length; index += 2) {
    [le[index], le[index + 1]] = [le[index + 1], le[index]];
  }
  return le;
}

function sfnt(tables) {
  const entries = Object.entries(tables);
  const directorySize = 12 + entries.length * 16;
  let dataOffset = directorySize;
  const tableEntries = entries.map(([tag, data]) => {
    const entry = { tag, data, offset: dataOffset };
    dataOffset += Math.ceil(data.length / 4) * 4;
    return entry;
  });
  const out = Buffer.alloc(dataOffset);
  out.writeUInt32BE(0x00010000, 0);
  out.writeUInt16BE(entries.length, 4);
  tableEntries.forEach((entry, index) => {
    const offset = 12 + index * 16;
    out.write(entry.tag, offset, 4, "ascii");
    out.writeUInt32BE(entry.offset, offset + 8);
    out.writeUInt32BE(entry.data.length, offset + 12);
    entry.data.copy(out, entry.offset);
  });
  return out;
}

async function minimalPptxPackage() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"xml\" ContentType=\"application/xml\"/></Types>");
  zip.file("ppt/presentation.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><p:presentation xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><p:sldIdLst/><p:sldSz cx=\"12192000\" cy=\"6858000\"/><p:notesSz cx=\"6858000\" cy=\"9144000\"/><p:defaultTextStyle/></p:presentation>");
  zip.file("ppt/_rels/presentation.xml.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide\" Target=\"slides/slide1.xml\"/></Relationships>");
  return zip.generateAsync({ type: "nodebuffer" });
}
