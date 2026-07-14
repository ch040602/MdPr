import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { completeFontEmbeddingSummary, inspectFontEnvironment } from "../dist/fontEnvironment.js";
import { buildDeck } from "../dist/orchestrate.js";

test("require-font-embedded reports exact missing family/style coverage", () => {
  const result = inspectFontEnvironment(sampleLayout(), { source: "test", installedFamilies: ["MDPR Test Sans"] }, false, {
    requireComplete: true,
  });

  assert.equal(result.summary.embedding.performed, false);
  assert.equal(result.summary.embedding.reason, "font-embedding-pending-build");
  assert.deepEqual(result.summary.embedding.coverage.requiredFaces, [{
    family: "MDPR Test Sans",
    styles: ["regular", "bold"],
  }]);
  assert.deepEqual(result.summary.embedding.coverage.missingFaces, [{
    family: "MDPR Test Sans",
    styles: ["regular", "bold"],
  }]);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), ["FONT_EMBEDDING_FACE_MISSING"]);
});

test("missing embedding inputs are errors and are never reported as performed", () => {
  const result = inspectFontEnvironment(sampleLayout(), { source: "test", installedFamilies: [] }, false, {
    fontPaths: ["does-not-exist.ttf"],
  });

  assert.equal(result.summary.embedding.performed, false);
  assert.equal(result.summary.embedding.reason, "font-embedding-pending-build");
  assert.equal(result.summary.embedding.fonts.length, 0);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "FONT_EMBEDDING_FILE_MISSING"));
});

test("required font license evidence fails closed when it is absent", () => {
  const result = inspectFontEnvironment(sampleLayout(), { source: "test", installedFamilies: [] }, false, {
    requireLicenseEvidence: true,
  });

  assert.equal(result.summary.embedding.licenseEvidence.supplied, false);
  assert.equal(result.summary.embedding.licenseEvidence.complete, false);
  assert.equal(result.summary.embedding.licenseEvidence.legalDetermination, "external");
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    "FONT_LICENSE_EVIDENCE_REQUIRED",
  ]);
});

test("font license evidence is bound to exact bytes and explicit distribution authorization", () => {
  const root = mkdtempSync(join(tmpdir(), "mdpresent-font-license-"));
  try {
    const fontPath = join(root, "regular.ttf");
    const evidencePath = join(root, "font-license-evidence.json");
    writeFileSync(fontPath, syntheticFont("Regular", 400));
    writeFileSync(evidencePath, JSON.stringify({
      schemaVersion: "mdpr-font-license-evidence-v1",
      fonts: [{
        fontSha256: "0".repeat(64),
        licenseId: "OFL-1.1",
        licenseSource: "https://openfontlicense.org/",
        pptxEmbeddingAllowed: true,
        redistributionAllowed: false,
        attestedBy: "release-owner@example.test",
        attestedAt: "2026-07-14T00:00:00Z",
      }],
    }));

    const result = inspectFontEnvironment(sampleLayout(), { source: "test", installedFamilies: [] }, false, {
      fontPaths: [fontPath],
      licenseEvidencePath: evidencePath,
      requireLicenseEvidence: true,
    });

    assert.equal(result.summary.embedding.licenseEvidence.complete, false);
    assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
      "FONT_LICENSE_EVIDENCE_AUTHORIZATION_REQUIRED",
      "FONT_LICENSE_EVIDENCE_FONT_MISSING",
      "FONT_LICENSE_EVIDENCE_UNUSED_RECORD",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("required font license evidence cannot pass without an embedded font input", () => {
  const root = mkdtempSync(join(tmpdir(), "mdpresent-empty-font-license-"));
  try {
    const evidencePath = join(root, "font-license-evidence.json");
    writeFileSync(evidencePath, JSON.stringify({
      schemaVersion: "mdpr-font-license-evidence-v1",
      fonts: [],
    }));

    const result = inspectFontEnvironment(sampleLayout(), { source: "test", installedFamilies: [] }, false, {
      licenseEvidencePath: evidencePath,
      requireLicenseEvidence: true,
    });

    assert.equal(result.summary.embedding.licenseEvidence.complete, false);
    assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
      "FONT_LICENSE_EVIDENCE_EMBEDDED_FONT_REQUIRED",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("embedding coverage includes inline style faces that the renderer will emit", () => {
  const layout = sampleLayout();
  layout.slides[0].regions = [{ role: "body", typography: {}, blockIds: ["block-1"] }];
  const presentation = {
    slides: [{ blocks: [{ id: "block-1", type: "paragraph", inlineRuns: [{ text: "proof", bold: true, italic: true }] }] }],
  };
  const result = inspectFontEnvironment(layout, { source: "test", installedFamilies: [] }, false, {
    requireComplete: true,
  }, presentation);

  assert.deepEqual(result.summary.embedding.coverage.requiredFaces, [{
    family: "MDPR Test Sans",
    styles: ["regular", "boldItalic"],
  }]);
});

test("completed package evidence preserves preflight coverage", () => {
  const coverage = {
    requiredFaces: [{ family: "MDPR Test Sans", styles: ["regular"] }],
    suppliedFaces: [{ family: "MDPR Test Sans", styles: ["regular"] }],
    missingFaces: [],
    complete: true,
  };
  const completed = completeFontEmbeddingSummary({
    performed: false,
    reason: "font-embedding-pending-build",
    requestedFiles: ["regular.ttf"],
    fonts: [],
    coverage,
  }, {
    performed: true,
    format: "eot-uncompressed",
    fonts: [],
  });

  assert.equal(completed.performed, true);
  assert.equal(completed.format, "eot-uncompressed");
  assert.deepEqual(completed.coverage, coverage);
});

test("completed package evidence rebinds license records to post-mutation font hashes", () => {
  const completed = completeFontEmbeddingSummary({
    performed: false,
    reason: "font-embedding-pending-build",
    requestedFiles: ["regular.ttf"],
    fonts: [],
    coverage: { requiredFaces: [], suppliedFaces: [], missingFaces: [], complete: true },
    licenseEvidence: {
      supplied: true,
      required: true,
      evidencePath: "font-license-evidence.json",
      schemaVersion: "mdpr-font-license-evidence-v1",
      records: [{
        fontSha256: "1".repeat(64),
        licenseId: "OFL-1.1",
        licenseSource: "https://openfontlicense.org/",
        pptxEmbeddingAllowed: true,
        redistributionAllowed: true,
        attestedBy: "release-owner@example.test",
        attestedAt: "2026-07-14T00:00:00Z",
      }],
      missingFontSha256: [],
      unusedFontSha256: [],
      complete: true,
      legalDetermination: "external",
    },
  }, {
    performed: true,
    format: "eot-uncompressed",
    fonts: [{ sha256: "2".repeat(64) }],
  });

  assert.equal(completed.licenseEvidence.complete, false);
  assert.deepEqual(completed.licenseEvidence.missingFontSha256, ["2".repeat(64)]);
  assert.deepEqual(completed.licenseEvidence.unusedFontSha256, ["1".repeat(64)]);
});

test("build records performed font embedding only after PPTX package mutation", async () => {
  const root = mkdtempSync(join(tmpdir(), "mdpresent-font-build-"));
  try {
    const deckPath = join(root, "deck.md");
    const regularPath = join(root, "regular.ttf");
    const boldPath = join(root, "bold.ttf");
    const outDir = join(root, "dist");
    writeFileSync(deckPath, "# Font proof\n\nPortable body text.");
    writeFileSync(regularPath, syntheticFont("Regular", 400));
    writeFileSync(boldPath, syntheticFont("Bold", 700));

    const result = await buildDeck(deckPath, {
      formats: ["pptx"],
      outDir,
      cliConfig: { typography: { fontFamily: "MDPR Test Sans" } },
      embedFontPaths: [regularPath, boldPath],
      requireFontEmbedded: true,
      fontEnvironment: { source: "test", installedFamilies: ["MDPR Test Sans"] },
    });

    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8"));
    assert.equal(manifest.validation.fontEnvironment.embedding.performed, true);
    assert.equal(manifest.validation.fontEnvironment.embedding.coverage.complete, true);
    assert.deepEqual(manifest.validation.fontEnvironment.embedding.fonts.map((font) => font.style), ["regular", "bold"]);
    assert.match(manifest.validation.fontEnvironment.embedding.fonts[0].partPath, /^ppt\/fonts\/font\d+\.fntdata$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("build manifest records hash-bound font license evidence without claiming legal adjudication", async () => {
  const root = mkdtempSync(join(tmpdir(), "mdpresent-font-license-build-"));
  try {
    const deckPath = join(root, "deck.md");
    const regularPath = join(root, "regular.ttf");
    const boldPath = join(root, "bold.ttf");
    const evidencePath = join(root, "font-license-evidence.json");
    const outDir = join(root, "dist");
    writeFileSync(deckPath, "# Font proof\n\nPortable body text.");
    writeFileSync(regularPath, syntheticFont("Regular", 400));
    writeFileSync(boldPath, syntheticFont("Bold", 700));
    const record = (fontPath) => ({
      fontSha256: sha256(readFileSync(fontPath)),
      licenseId: "OFL-1.1",
      licenseSource: "https://openfontlicense.org/",
      pptxEmbeddingAllowed: true,
      redistributionAllowed: true,
      attestedBy: "release-owner@example.test",
      attestedAt: "2026-07-14T00:00:00Z",
    });
    writeFileSync(evidencePath, JSON.stringify({
      schemaVersion: "mdpr-font-license-evidence-v1",
      fonts: [record(regularPath), record(boldPath)],
    }));

    const result = await buildDeck(deckPath, {
      formats: ["pptx"],
      outDir,
      cliConfig: { typography: { fontFamily: "MDPR Test Sans" } },
      embedFontPaths: [regularPath, boldPath],
      requireFontEmbedded: true,
      fontLicenseEvidencePath: evidencePath,
      requireFontLicenseEvidence: true,
      fontEnvironment: { source: "test", installedFamilies: ["MDPR Test Sans"] },
    });

    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8"));
    const evidence = manifest.validation.fontEnvironment.embedding.licenseEvidence;
    assert.equal(evidence.complete, true);
    assert.equal(evidence.legalDetermination, "external");
    assert.deepEqual(evidence.records.map((entry) => entry.fontSha256), [
      sha256(readFileSync(regularPath)),
      sha256(readFileSync(boldPath)),
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function sampleLayout() {
  return {
    theme: {
      fontFamily: "MDPR Test Sans",
      bodyFontSize: 20,
      minFontSize: 12,
    },
    slides: [{
      regions: [
        { role: "title", typography: {} },
        { role: "body", typography: {} },
      ],
    }],
  };
}

function syntheticFont(subfamily, weight) {
  const os2 = Buffer.alloc(96);
  os2.writeUInt16BE(4, 0);
  os2.writeUInt16BE(weight, 4);
  os2.writeUInt16BE(5, 6);
  Buffer.from([2, 11, 6, 4, 2, 2, 2, 2, 2, 4]).copy(os2, 32);
  os2.writeUInt32BE(1, 42);
  os2.writeUInt16BE(weight >= 700 ? 1 << 5 : 0, 62);
  os2.writeUInt32BE(1, 78);
  const head = Buffer.alloc(12);
  const names = [[1, "MDPR Test Sans"], [2, subfamily], [4, `MDPR Test Sans ${subfamily}`], [5, "Version 1.0"]];
  const strings = names.map(([, value]) => utf16be(value));
  const name = Buffer.alloc(6 + names.length * 12 + strings.reduce((sum, value) => sum + value.length, 0));
  name.writeUInt16BE(names.length, 2);
  name.writeUInt16BE(6 + names.length * 12, 4);
  let stringOffset = 0;
  names.forEach(([nameId], index) => {
    const record = 6 + index * 12;
    name.writeUInt16BE(3, record);
    name.writeUInt16BE(1, record + 2);
    name.writeUInt16BE(0x0409, record + 4);
    name.writeUInt16BE(nameId, record + 6);
    name.writeUInt16BE(strings[index].length, record + 8);
    name.writeUInt16BE(stringOffset, record + 10);
    strings[index].copy(name, 6 + names.length * 12 + stringOffset);
    stringOffset += strings[index].length;
  });
  const tables = [["OS/2", os2], ["head", head], ["name", name]];
  let dataOffset = 12 + tables.length * 16;
  const out = Buffer.alloc(dataOffset + tables.reduce((sum, [, data]) => sum + Math.ceil(data.length / 4) * 4, 0));
  out.writeUInt32BE(0x00010000, 0);
  out.writeUInt16BE(tables.length, 4);
  tables.forEach(([tag, data], index) => {
    const entry = 12 + index * 16;
    out.write(tag, entry, 4, "ascii");
    out.writeUInt32BE(dataOffset, entry + 8);
    out.writeUInt32BE(data.length, entry + 12);
    data.copy(out, dataOffset);
    dataOffset += Math.ceil(data.length / 4) * 4;
  });
  return out;
}

function utf16be(value) {
  const bytes = Buffer.from(value, "utf16le");
  for (let index = 0; index < bytes.length; index += 2) [bytes[index], bytes[index + 1]] = [bytes[index + 1], bytes[index]];
  return bytes;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
