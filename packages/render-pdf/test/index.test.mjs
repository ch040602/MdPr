import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { exportPptxToPdf, inspectPdfExporterEnvironment } from "../dist/index.js";

test("exportPptxToPdf uses an injected exporter command with PPTX and PDF paths", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mdpresent-render-pdf-"));
  const pptxPath = join(dir, "deck.pptx");
  const pdfPath = join(dir, "deck.pdf");
  const exporterPath = join(dir, "fake-exporter.mjs");
  const originalExporter = process.env.MDPRESENT_PDF_EXPORT_COMMAND;

  try {
    writeFileSync(pptxPath, "pptx fixture");
    writeFileSync(exporterPath, [
      "import { existsSync, writeFileSync } from 'node:fs';",
      "const [pptxPath, pdfPath] = process.argv.slice(2);",
      "if (!existsSync(pptxPath)) process.exit(12);",
      "writeFileSync(pdfPath, `%PDF-1.4\\nsource=${pptxPath}\\n%%EOF\\n`);",
    ].join("\n"));
    process.env.MDPRESENT_PDF_EXPORT_COMMAND = JSON.stringify([process.execPath, exporterPath, "{pptx}", "{pdf}"]);

    await exportPptxToPdf(pptxPath, pdfPath);

    assert.equal(existsSync(pdfPath), true);
    assert.match(readFileSync(pdfPath, "utf-8"), /^%PDF-1\.4/);
    assert.match(readFileSync(pdfPath, "utf-8"), /deck\.pptx/);
  } finally {
    if (originalExporter === undefined) delete process.env.MDPRESENT_PDF_EXPORT_COMMAND;
    else process.env.MDPRESENT_PDF_EXPORT_COMMAND = originalExporter;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("exportPptxToPdf rejects a missing PPTX source", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mdpresent-render-pdf-missing-"));
  try {
    await assert.rejects(
      () => exportPptxToPdf(join(dir, "missing.pptx"), join(dir, "deck.pdf")),
      /PDF export source PPTX does not exist/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("inspectPdfExporterEnvironment reports injected exporter commands", async () => {
  const result = await inspectPdfExporterEnvironment({
    env: {
      MDPRESENT_PDF_EXPORT_COMMAND: JSON.stringify(["node", "exporter.mjs", "{pptx}", "{pdf}"]),
    },
    platform: "linux",
  });

  assert.equal(result.available, true);
  assert.equal(result.preferred, "injected");
  assert.equal(result.candidates[0].label, "MDPRESENT_PDF_EXPORT_COMMAND");
  assert.equal(result.candidates[0].found, true);
});

test("inspectPdfExporterEnvironment probes default LibreOffice commands", async () => {
  const seen = [];
  const result = await inspectPdfExporterEnvironment({
    env: {},
    platform: "linux",
    commandProbe: async (executable, args) => {
      seen.push([executable, args]);
      return executable === "libreoffice"
        ? { found: true, version: "LibreOffice 25.2" }
        : { found: false };
    },
  });

  assert.deepEqual(seen.map(([executable]) => executable), ["soffice", "libreoffice"]);
  assert.equal(result.available, true);
  assert.equal(result.preferred, "libreoffice");
  assert.equal(result.candidates.find((candidate) => candidate.executable === "libreoffice").version, "LibreOffice 25.2");
});
