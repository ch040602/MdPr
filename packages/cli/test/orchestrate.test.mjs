import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { buildDeck, inspectDeck, planDeck, validateDeck } from "../dist/orchestrate.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const basicDeck = join(repoRoot, "examples/basic/deck.md");

test("inspectDeck and planDeck expose a reusable orchestration boundary", () => {
  const slides = inspectDeck(basicDeck);
  const deck = planDeck(basicDeck);

  assert.ok(slides.length > 0);
  assert.equal(deck.presentation.slides.length, slides.length);
  assert.equal(deck.layout.slides.length, slides.length);
  assert.deepEqual(deck.configSources, [{ kind: "default" }]);
});

test("buildDeck delegates rendering through the orchestration boundary", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-cli-"));

  try {
    const result = await buildDeck(basicDeck, { formats: ["html"], outDir });
    const htmlPath = result.writtenFiles.find((file) => file.endsWith("deck.html"));
    assert.ok(htmlPath);
    const html = readFileSync(htmlPath, "utf-8");

    assert.equal(result.writtenFiles.some((file) => file.endsWith("mdpresent-manifest.json")), true);
    assert.equal(result.writtenFiles.some((file) => file.endsWith("mdpresent-design-lock.json")), true);
    assert.match(html, /AI Workflow Automation Proposal/);
    assert.match(html, /Automatic meeting summary/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("buildDeck writes PPTX output through the renderer boundary", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-cli-pptx-"));

  try {
    const result = await buildDeck(basicDeck, { formats: ["pptx"], outDir });

    assert.equal(result.writtenFiles.some((file) => file.endsWith("deck.pptx")), true);
    assert.equal(existsSync(join(outDir, "deck.pptx")), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "PPTX_RENDERER_NOT_IMPLEMENTED"), false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("buildDeck writes PDF output by exporting a generated PPTX", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-cli-pdf-"));
  const exporterPath = join(outDir, "fake-pdf-exporter.mjs");
  const originalExporter = process.env.MDPRESENT_PDF_EXPORT_COMMAND;

  try {
    writeFileSync(exporterPath, [
      "import { existsSync, writeFileSync } from 'node:fs';",
      "const [pptxPath, pdfPath] = process.argv.slice(2);",
      "if (!existsSync(pptxPath)) process.exit(12);",
      "writeFileSync(pdfPath, `%PDF-1.4\\nsource=${pptxPath}\\n%%EOF\\n`);",
    ].join("\n"));
    process.env.MDPRESENT_PDF_EXPORT_COMMAND = JSON.stringify([process.execPath, exporterPath, "{pptx}", "{pdf}"]);

    const result = await buildDeck(basicDeck, { formats: ["pdf"], outDir });
    const pdfPath = result.writtenFiles.find((file) => file.endsWith("deck.pdf"));

    assert.ok(pdfPath);
    assert.equal(existsSync(join(outDir, "deck.pdf")), true);
    assert.match(readFileSync(join(outDir, "deck.pdf"), "utf-8"), /^%PDF-1\.4/);
    assert.match(readFileSync(join(outDir, "deck.pdf"), "utf-8"), /\.pptx/);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "PDF_RENDERER_NOT_IMPLEMENTED"), false);
  } finally {
    if (originalExporter === undefined) delete process.env.MDPRESENT_PDF_EXPORT_COMMAND;
    else process.env.MDPRESENT_PDF_EXPORT_COMMAND = originalExporter;
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("buildDeck applies CLI design preset to HTML output", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-cli-theme-"));

  try {
    const result = await buildDeck(basicDeck, { formats: ["html"], outDir, designPreset: "nord" });
    const htmlPath = result.writtenFiles.find((file) => file.endsWith("deck.html"));
    assert.ok(htmlPath);
    const html = readFileSync(htmlPath, "utf-8");

    assert.match(html, /--bg: #2E3440;/);
    assert.match(html, /--text: #F8F8F8;/);
    assert.match(html, /--primary: #88C0D0;/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("buildDeck applies an approved MDPR pack to theme config", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-cli-pack-"));
  const packPath = join(outDir, "mdpr.pack.json");

  try {
    writeFileSync(packPath, JSON.stringify({
      schemaVersion: "mdpr-pack-v1",
      kind: "theme-component-pack",
      source: {
        kind: "design-md",
        sourceSha256: "a".repeat(64),
        generatedBy: "mdpr-skill",
        approved: true,
      },
      themeTokens: {
        colors: {
          background: "#111827",
          text: "#F9FAFB",
          accent: "#F97316",
        },
      },
      componentTokens: {},
      diagramTokens: {},
      components: [],
      pptEffectMappings: [],
      constraints: {
        editablePrimaryContent: true,
        allowRasterBackgroundOnly: true,
        maxAccentRatio: 0.18,
      },
    }, null, 2));

    const result = await buildDeck(basicDeck, { formats: ["html"], outDir, packPath });
    const html = readFileSync(join(outDir, "deck.html"), "utf-8");
    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf-8"));

    assert.match(html, /--bg: #111827;/);
    assert.match(html, /--text: #F8F8F8;/);
    assert.match(html, /--primary: #F97316;/);
    assert.equal(manifest.pack.source.path, packPath);
    assert.equal(manifest.pack.validation.valid, true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("CLI pack commands import approved theme candidates and feed build --pack", () => {
  const cliPath = join(repoRoot, "packages/cli/dist/index.js");
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-cli-pack-command-"));
  const candidatePath = join(outDir, "theme-candidate.json");
  const packPath = join(outDir, "mdpr.pack.json");
  const sourceSha256 = createHash("sha256").update("theme candidate source").digest("hex");

  try {
    writeFileSync(candidatePath, JSON.stringify({
      schemaVersion: "mdpr-theme-candidate-v1",
      source: {
        kind: "design-md",
        sourceSha256,
        generatedBy: "mdpr-skill",
        approved: true,
      },
      tokens: {
        colors: {
          background: "#101828",
          text: "#F8FAFC",
          accent: "#22C55E",
          rule: "#344054",
        },
      },
    }, null, 2));

    assert.throws(() => execFileSync(process.execPath, [
      cliPath,
      "pack",
      "import",
      candidatePath,
      "--out",
      packPath,
    ], {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }), /Command failed/);

    execFileSync(process.execPath, [
      cliPath,
      "pack",
      "import",
      candidatePath,
      "--approved",
      "--out",
      packPath,
    ], {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const validation = execFileSync(process.execPath, [
      cliPath,
      "pack",
      "validate",
      packPath,
      "--json",
    ], {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.equal(JSON.parse(validation).valid, true);

    const preview = JSON.parse(execFileSync(process.execPath, [
      cliPath,
      "pack",
      "preview",
      packPath,
    ], {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }));
    assert.equal(preview.colorCount, 4);
    assert.equal(preview.approved, true);

    const listed = JSON.parse(execFileSync(process.execPath, [
      cliPath,
      "pack",
      "list",
    ], {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }));
    assert.equal(listed.some((pack) => pack.id === "clean-foundation"), true);

    execFileSync(process.execPath, [
      cliPath,
      "build",
      basicDeck,
      "--to",
      "html",
      "--out",
      outDir,
      "--pack",
      packPath,
    ], {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const html = readFileSync(join(outDir, "deck.html"), "utf-8");
    assert.match(html, /--bg: #101828;/);
    assert.match(html, /--text: #F8F8F8;/);
    assert.match(html, /--primary: #22C55E;/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("CLI pack validate reports invalid JSON without a stack trace", () => {
  const cliPath = join(repoRoot, "packages/cli/dist/index.js");
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-cli-pack-invalid-"));
  const packPath = join(outDir, "broken.pack.json");

  try {
    writeFileSync(packPath, "{not-json", "utf-8");
    assert.throws(() => execFileSync(process.execPath, [
      cliPath,
      "pack",
      "validate",
      packPath,
      "--json",
    ], {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }), (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stdout, /PACK_FILE_INVALID/);
      assert.doesNotMatch(error.stderr, /SyntaxError|at JSON\.parse/);
      return true;
    });
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("buildDeck writes design lock and output manifest with visual validation summary", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-cli-manifest-"));

  try {
    const result = await buildDeck(basicDeck, {
      formats: ["pptx", "html"],
      outDir,
      visualValidation: true,
      cliConfig: {
        theme: {
          decorationStyle: "glassmorphism",
          colorSeed: "#8A4FFF",
          primaryColor: "#8A4FFF",
          colorCombination: "analogous",
        },
      },
    });
    assert.ok(result.manifestPath);
    assert.ok(result.designLockPath);

    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf-8"));
    const designLock = JSON.parse(readFileSync(result.designLockPath, "utf-8"));

    assert.equal(manifest.engine, "mdpresent");
    assert.equal(manifest.validation.visual.checked, true);
    assert.equal(manifest.validation.visual.checks.regionBounds, true);
    assert.equal(manifest.validation.coherence.checked, true);
    assert.equal(typeof manifest.validation.coherence.intraSlideSpacingCoverage.checkedSlides, "number");
    assert.equal(typeof manifest.validation.coherence.intraSlideSpacingCoverage.skippedSlides, "number");
    assert.equal(typeof manifest.validation.coherence.intraSlideSpacingCoverage.notApplicableSlides, "number");
    assert.equal(manifest.validation.polish.checked, true);
    assert.equal(manifest.validation.polish.source.videoId, "GX0Fn-5YqKE");
    assert.equal(manifest.validation.polish.chapters.fontHierarchy.passed, true);
    assert.equal(manifest.validation.polish.chapters.detailPolish.passed, true);
    assert.equal(typeof manifest.validation.coherence.textBackgroundLuminanceDrift, "number");
    assert.equal(typeof manifest.validation.coherence.checks.textBackgroundLuminance, "boolean");
    assert.equal(typeof manifest.validation.coherence.mixedObjectGroupingScore, "number");
    assert.equal(typeof manifest.metrics.buildMs, "number");
    assert.equal(manifest.metrics.slideCount, manifest.slideCount);
    assert.equal(typeof manifest.metrics.overflowCount, "number");
    assert.equal(typeof manifest.metrics.coherenceWarningCount, "number");
    assert.equal(typeof manifest.metrics.visualErrorCount, "number");
    assert.equal(typeof manifest.metrics.polishWarningCount, "number");
    assert.equal(typeof manifest.metrics.minFontPt, "number");
    assert.ok(manifest.metrics.outputBytes.pptx > 0);
    assert.ok(Array.isArray(manifest.pptxObjects));
    assert.ok(manifest.pptxObjects.some((entry) => entry.shapeName.startsWith("mdpr:")));
    assert.ok(manifest.pptxObjects.some((entry) => entry.objectKind === "native-text" && entry.editable === true));
    assert.equal(designLock.decorationStyle, "glassmorphism");
    assert.equal(designLock.colorSeed, "#8A4FFF");
    assert.equal(designLock.paletteSeed.base, "8A4FFF");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("buildDeck records generated PPTX HTML and PDF artifact contracts in the manifest", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-cli-artifacts-"));
  const exporterPath = join(outDir, "fake-pdf-exporter.mjs");
  const originalExporter = process.env.MDPRESENT_PDF_EXPORT_COMMAND;

  try {
    writeFileSync(exporterPath, [
      "import { writeFileSync } from 'node:fs';",
      "const [, pdfPath] = process.argv.slice(2);",
      "writeFileSync(pdfPath, '%PDF-1.4\\n%%EOF\\n');",
    ].join("\n"));
    process.env.MDPRESENT_PDF_EXPORT_COMMAND = JSON.stringify([process.execPath, exporterPath, "{pptx}", "{pdf}"]);

    const result = await buildDeck(basicDeck, { formats: ["pptx", "html", "pdf"], outDir });
    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf-8"));
    const artifacts = manifest.artifacts;

    assert.equal(Array.isArray(artifacts), true);
    assert.deepEqual(artifacts.map((artifact) => artifact.format).sort(), ["html", "pdf", "pptx"]);
    for (const artifact of artifacts) {
      assert.equal(existsSync(artifact.path), true);
      assert.equal(artifact.bytes > 0, true);
      assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
    }
  } finally {
    if (originalExporter === undefined) delete process.env.MDPRESENT_PDF_EXPORT_COMMAND;
    else process.env.MDPRESENT_PDF_EXPORT_COMMAND = originalExporter;
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("buildDeck accepts schema-valid agent hints as weak metadata only", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-agent-hints-"));
  const deckPath = join(outDir, "deck.md");
  const hintPath = join(outDir, "deck.mdpr-hints.json");
  const markdown = [
    "# Demo",
    "",
    "## Adoption Funnel",
    "",
    "Activation evidence should keep the table and claim together.",
    "",
    "| Stage | Users |",
    "|---|---:|",
    "| Awareness | 8000 |",
    "| Activation | 4000 |",
  ].join("\n");

  try {
    writeFileSync(deckPath, markdown);
    writeFileSync(hintPath, JSON.stringify({
      schemaVersion: "mdpr-agent-hint-v1",
      sourceSha256: sha256(markdown),
      generatedBy: "mdpr-skill",
      hints: [
        {
          slideId: "slide-adoption-funnel",
          intentCandidate: "evidence",
          confidence: 0.86,
          groupCandidates: [
            {
              elementIds: ["b2", "b3"],
              role: "evidence-pack",
              confidence: 0.8,
            },
          ],
          importanceCandidates: [
            {
              elementId: "b2",
              importance: "primary",
              confidence: 0.82,
            },
          ],
          iconKeywordCandidates: ["funnel", "activation"],
          rationale: "Human review note only.",
        },
      ],
    }, null, 2));

    const result = await buildDeck(deckPath, { formats: ["html"], outDir, hintPath });
    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf-8"));

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code?.startsWith("AGENT_HINT")), false);
    assert.equal(manifest.agentHints.enabled, true);
    assert.equal(manifest.agentHints.accepted, 1);
    assert.equal(manifest.agentHints.rejected, 0);
    assert.equal(manifest.agentHints.ignoredBecauseStale, 0);
    assert.equal(manifest.agentHints.forbiddenFieldCount, 0);
    assert.equal(manifest.agentHints.sourceSha256, sha256(markdown));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("buildDeck applies accepted agent hints to coherence metadata only", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-agent-hints-coherence-"));
  const deckPath = join(outDir, "deck.md");
  const hintPath = join(outDir, "deck.mdpr-hints.json");
  const markdown = [
    "# Demo",
    "",
    "## Release Decision",
    "",
    "The runtime keeps Markdown authoritative.",
    "",
    "Validation evidence should stay attached.",
  ].join("\n");

  try {
    writeFileSync(deckPath, markdown);
    const baseline = planDeck(deckPath);
    const slide = baseline.presentation.slides.find((candidate) => candidate.title === "Release Decision");
    const claim = slide.blocks[0];
    const evidence = slide.blocks[1];

    writeFileSync(hintPath, JSON.stringify({
      schemaVersion: "mdpr-agent-hint-v1",
      sourceSha256: sha256(markdown),
      generatedBy: "mdpr-skill",
      hints: [
        {
          slideId: slide.id,
          intentCandidate: "evidence",
          confidence: 0.9,
          groupCandidates: [
            {
              elementIds: [claim.id, evidence.id],
              role: "evidence-pack",
              confidence: 0.88,
            },
          ],
          importanceCandidates: [
            {
              elementId: evidence.id,
              importance: "primary",
              confidence: 0.87,
            },
          ],
          iconKeywordCandidates: ["validation", "evidence"],
        },
      ],
    }, null, 2));

    const result = await buildDeck(deckPath, { formats: ["html"], outDir, hintPath });
    const hintedSlide = result.presentation.slides.find((candidate) => candidate.id === slide.id);
    const group = result.presentation.coherenceGroups.find((candidate) => candidate.slideId === slide.id);

    assert.equal(result.agentHints.accepted, 1);
    assert.equal(hintedSlide.intent, slide.intent);
    assert.deepEqual(hintedSlide.blocks, slide.blocks);
    assert.equal(hintedSlide.secondaryIntents.includes("evidence"), true);
    assert.equal(group.role, "evidence-pack");
    assert.equal(group.primaryBlockId, evidence.id);
    assert.equal(group.supportingBlockIds.includes(claim.id), true);
    assert.equal(group.blockRoles[evidence.id], "evidence");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("validateDeck rejects forbidden final-decision fields in agent hints", () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-agent-hints-forbidden-"));
  const deckPath = join(outDir, "deck.md");
  const hintPath = join(outDir, "deck.mdpr-hints.json");
  const markdown = "# Demo\n\n## Slide\n\nBody";

  try {
    writeFileSync(deckPath, markdown);
    writeFileSync(hintPath, JSON.stringify({
      schemaVersion: "mdpr-agent-hint-v1",
      sourceSha256: sha256(markdown),
      hints: [
        {
          slideId: "slide-slide",
          confidence: 0.9,
          color: "#FF0000",
          box: { x: 1, y: 1, w: 4, h: 3 },
        },
      ],
    }, null, 2));

    const result = validateDeck(deckPath, { hintPath });

    assert.equal(result.valid, false);
    assert.ok(result.agentHints);
    assert.equal(result.agentHints.forbiddenFieldCount >= 2, true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "AGENT_HINT_FORBIDDEN_FIELD"), true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("stale agent hints are ignored unless strict mode is enabled", () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-agent-hints-stale-"));
  const deckPath = join(outDir, "deck.md");
  const hintPath = join(outDir, "deck.mdpr-hints.json");
  const markdown = "# Demo\n\n## Slide\n\nBody";

  try {
    writeFileSync(deckPath, markdown);
    writeFileSync(hintPath, JSON.stringify({
      schemaVersion: "mdpr-agent-hint-v1",
      sourceSha256: sha256("old source"),
      hints: [
        {
          slideId: "slide-slide",
          confidence: 0.8,
          intentCandidate: "summary",
        },
      ],
    }, null, 2));

    const ignored = validateDeck(deckPath, { hintPath });
    const strict = validateDeck(deckPath, { hintPath, strict: true });

    assert.equal(ignored.valid, true);
    assert.equal(ignored.agentHints?.ignoredBecauseStale, 1);
    assert.equal(ignored.diagnostics.some((diagnostic) => diagnostic.code === "AGENT_HINT_STALE"), true);
    assert.equal(strict.valid, false);
    assert.equal(strict.diagnostics.some((diagnostic) => diagnostic.level === "error" && diagnostic.code === "AGENT_HINT_STALE"), true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("pipeline-one-page mode renders a multi-section teaser as one slide", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pipeline-one-page-"));
  const deckPath = join(outDir, "teaser.md");

  try {
    writeFileSync(deckPath, [
      "# MDPR Teaser",
      "",
      "## Theme Families",
      "",
      "- skeuomorphism, neomorphism, glassmorphism, claymorphism, brutalism",
      "- main color seed derives harmony, contrast, and chart slots",
      "",
      "## Object Coverage",
      "",
      "| Family | Examples |",
      "| --- | --- |",
      "| Diagrams | pipeline, timeline, proof object |",
      "| Evidence | table, chart, metric dots |",
      "",
      "## Runtime Pipeline",
      "",
      "```mermaid",
      "graph LR",
      "  A[Markdown] --> B[Semantic split]",
      "  B --> C[Layout grammar]",
      "  C --> D[Editable PPTX]",
      "```",
    ].join("\n"));

    const result = await buildDeck(deckPath, {
      formats: ["html"],
      outDir,
      cliConfig: {
        deck: { presentationMode: "pipeline-one-page" },
      },
    });
    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf-8"));

    assert.equal(result.presentation.slides.length, 1);
    assert.equal(result.layout.slides.length, 1);
    assert.equal(result.presentation.slides[0].title, "MDPR Teaser");
    assert.equal(result.presentation.slides[0].tags.includes("pipeline-one-page"), true);
    assert.equal(manifest.slideCount, 1);
    assert.equal(manifest.presentationMode, "pipeline-one-page");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("pipeline-one-page layout separates pipeline, feature text, chart, and table regions", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pipeline-one-page-layout-"));
  const deckPath = join(outDir, "teaser.md");

  try {
    writeFileSync(deckPath, [
      "# MDPR Teaser",
      "",
      "## Runtime Pipeline",
      "",
      "Markdown => Semantic IR => Layout Grammar => Editable PPTX",
      "",
      "## Feature Coverage",
      "",
      "- Themes: eight distinct style families.",
      "- Objects: tables, charts, diagrams, image frames, icon slots.",
      "- Decorations: card, rail, flag, ticket, notch, proof, and grid patterns.",
      "- Validation: overflow, readable text, graph bounds, and table coherence.",
      "",
      "## Coverage Signal",
      "",
      "```chart",
      "labels: Themes, Objects, Decorations, Checks",
      "Current: 8, 12, 36, 9",
      "```",
      "",
      "## Ownership",
      "",
      "| Layer | MDPR owns | Skill hints |",
      "| --- | --- | --- |",
      "| Content | parsing | semantic grouping |",
      "| Output | editable PPTX | review notes |",
    ].join("\n"));

    const result = await buildDeck(deckPath, {
      formats: ["html"],
      outDir,
      cliConfig: { deck: { presentationMode: "pipeline-one-page" } },
    });
    const regions = result.layout.slides[0].regions;
    const diagram = regions.find((region) => region.role === "diagram");
    const features = regions.find((region) => region.id === "feature-summary");
    const chart = regions.find((region) => region.role === "chart");
    const table = regions.find((region) => region.role === "table");

    assert.ok(diagram);
    assert.ok(features);
    assert.ok(chart);
    assert.ok(table);
    assert.equal(features.y > diagram.y + diagram.h, true);
    assert.equal(features.x, diagram.x);
    assert.equal(features.w, diagram.w);
    assert.equal(chart.x > diagram.x + diagram.w, true);
    assert.equal(table.x, chart.x);
    assert.equal(table.y > chart.y + chart.h, true);
    assert.equal(
      Number((features.y - (diagram.y + diagram.h)).toFixed(2)),
      Number((table.y - (chart.y + chart.h)).toFixed(2)),
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("pipeline-one-page mode keeps h1-only body content instead of creating a blank slide", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pipeline-one-page-h1-"));
  const deckPath = join(outDir, "one-page.md");

  try {
    writeFileSync(deckPath, [
      "# Single Page Note",
      "",
      "Markdown => Layout => PPTX",
      "",
      "- Themes: deterministic style selection.",
      "- Objects: diagrams and lists remain editable.",
    ].join("\n"));

    const result = await buildDeck(deckPath, {
      formats: ["html"],
      outDir,
      cliConfig: { deck: { presentationMode: "pipeline-one-page" } },
    });

    assert.equal(result.presentation.slides.length, 1);
    assert.ok(result.presentation.slides[0].blocks.length >= 2);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "VISUAL_BACKGROUND_OVERLAP"), false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("buildDeck rejects design lock drift unless explicitly updated", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-cli-lock-drift-"));
  const lockPath = join(outDir, "lock.json");

  try {
    await buildDeck(basicDeck, {
      formats: ["html"],
      outDir,
      designLockPath: lockPath,
      cliConfig: { theme: { colorSeed: "#2563EB", primaryColor: "#2563EB" } },
    });

    await assert.rejects(
      () => buildDeck(basicDeck, {
        formats: ["html"],
        outDir,
        designLockPath: lockPath,
        cliConfig: { theme: { colorSeed: "#8A4FFF", primaryColor: "#8A4FFF", colorCombination: "analogous" } },
      }),
      /Design lock drift detected/,
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("buildDeck fails before rendering when config diagnostics contain errors", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-build-invalid-config-"));
  const configPath = join(outDir, "mdpresent.config.yaml");

  try {
    writeFileSync(configPath, [
      'version: "1.0"',
      "deck:",
      "  ratio: 1:1",
    ].join("\n"));

    await assert.rejects(
      () => buildDeck(basicDeck, { formats: ["html"], outDir, configPath }),
      /Build validation failed: CONFIG_FILE_INVALID/,
    );
    assert.equal(existsSync(join(outDir, "deck.html")), false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("buildDeck fails visual builds when visual validation reports errors", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-build-visual-error-"));
  const deckPath = join(outDir, "deck.md");
  const overridePath = join(outDir, "deck.override.yaml");

  try {
    writeFileSync(deckPath, [
      "# Demo",
      "",
      "## Items",
      "",
      "- Alpha",
      "- Beta",
    ].join("\n"));
    writeFileSync(overridePath, [
      'version: "1.0"',
      "operations:",
      "  - op: setSlot",
      "    target:",
      "      title: Items",
      "      slot: right",
      "    value:",
      "      x: 0.9",
      "      y: 1.7",
      "      w: 5.4",
      "      h: 4.8",
    ].join("\n"));

    await assert.rejects(
      () => buildDeck(deckPath, {
        formats: ["html"],
        outDir,
        overridePath,
        visualValidation: true,
      }),
      /Build validation failed: VISUAL_REGION_OVERLAP/,
    );
    assert.equal(existsSync(join(outDir, "deck.html")), false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("CLI theme style and color seed stay independently selectable", () => {
  const cliPath = join(repoRoot, "packages/cli/dist/index.js");
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-cli-style-color-"));
  try {
    execFileSync(process.execPath, [
      cliPath,
      "build",
      basicDeck,
      "--to",
      "html,pptx",
      "--out",
      outDir,
      "--theme-style",
      "glassmorphism",
      "--theme-color",
      "#8A4FFF",
      "--theme-harmony",
      "analogous",
    ], {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const html = readFileSync(join(outDir, "deck.html"), "utf-8");
    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${join(outDir, "deck.pptx")}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(html, /--primary: #8A4FFF;/);
    assert.match(html, /--surface: #10182C;/);
    assert.match(xml, /val="10182C"/);
    assert.match(xml, /outerShdw/);
    assert.match(xml, /glow/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("CLI accepts redesigned decoration styles", () => {
  const cliPath = join(repoRoot, "packages/cli/dist/index.js");
  const cases = [
    ["skeuomorphism", "#6B7280", "monochromatic"],
    ["neomorphism", "#5D7FA4", "analogous"],
    ["glassmorphism", "#8A4FFF", "analogous"],
    ["claymorphism", "#F43F5E", "split-complementary"],
    ["minimalism", "#111827", "monochromatic"],
    ["newmorphism", "#4F6F8F", "analogous"],
    ["brutalism", "#111111", "complementary"],
    ["liquid-glass", "#7DD3FC", "analogous"],
    ["bentogrid", "#0F766E", "split-complementary"],
  ];

  for (const [style, color, harmony] of cases) {
    const outDir = mkdtempSync(join(tmpdir(), `mdpresent-cli-${style}-`));
    try {
      execFileSync(process.execPath, [
        cliPath,
        "build",
        basicDeck,
        "--to",
        "html,pptx",
        "--out",
        outDir,
        "--theme-style",
        style,
        "--theme-color",
        color,
        "--theme-harmony",
        harmony,
      ], {
        cwd: repoRoot,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      const designLock = JSON.parse(readFileSync(join(outDir, "mdpresent-design-lock.json"), "utf-8"));
      assert.equal(designLock.decorationStyle, style);
      assert.equal(designLock.colorSeed, color);
      assert.equal(existsSync(join(outDir, "deck.pptx")), true);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }
});

test("CLI rejects retired decoration styles as public theme-style options", () => {
  const cliPath = join(repoRoot, "packages/cli/dist/index.js");
  for (const style of ["clean", "glass", "data", "plain", "nord"]) {
    const outDir = mkdtempSync(join(tmpdir(), `mdpresent-cli-retired-${style}-`));
    try {
      assert.throws(() => execFileSync(process.execPath, [
        cliPath,
        "build",
        basicDeck,
        "--to",
        "html",
        "--out",
        outDir,
        "--theme-style",
        style,
      ], {
        cwd: repoRoot,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      }), new RegExp(`Unknown theme decoration style: ${style}`));
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }
});

test("buildDeck passes theme-gallery presets to PPTX output", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-cli-theme-gallery-"));

  try {
    const result = await buildDeck(basicDeck, { formats: ["pptx"], outDir, themeGalleryPresets: ["executive", "nord"] });
    const outPath = result.writtenFiles.find((file) => file.endsWith("deck.pptx"));
    assert.ok(outPath);
    const expanded = join(outDir, "expanded");

    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const slideCount = Number(execFileSync("powershell", ["-NoProfile", "-Command", `(Get-ChildItem -LiteralPath '${join(expanded, "ppt", "slides")}' -Filter 'slide*.xml' | Measure-Object).Count`], { encoding: "utf-8" }).trim());
    const xml = execFileSync("powershell", ["-NoProfile", "-Command", `Get-ChildItem -LiteralPath '${join(expanded, "ppt", "slides")}' -Filter 'slide*.xml' | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }`], { encoding: "utf-8" });

    assert.equal(slideCount, result.presentation.slides.length * 2);
    assert.match(xml, /Theme: nord/);
    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf-8"));
    assert.equal(manifest.validation.polish.chapters.beforeAfterComparison.passed, true);
    assert.deepEqual(manifest.validation.polish.chapters.beforeAfterComparison.presets, ["executive", "nord"]);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});


test("createDeckPlan reports missing config and override files as diagnostics", () => {
  const deck = planDeck(basicDeck, {
    configPath: "mdpresent.config.yaml",
    overridePath: "deck.override.yaml",
  });

  assert.deepEqual(deck.configSources, [
    { kind: "default" },
    { kind: "config-file", path: "mdpresent.config.yaml" },
  ]);
  assert.deepEqual(deck.overrideSource, { path: "deck.override.yaml" });
  assert.deepEqual(
    deck.diagnostics.map((diagnostic) => diagnostic.code),
    ["CONFIG_FILE_NOT_FOUND", "OVERRIDE_FILE_NOT_FOUND"],
  );
});

test("createDeckPlan applies config file values including PPTX template settings", () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-config-"));
  const configPath = join(outDir, "mdpresent.config.yaml");

  try {
    writeFileSync(configPath, [
      'version: "1.0"',
      "deck:",
      "  language: en",
      "  presentationMode: pipeline-one-page",
      "pptx:",
      "  template: company-master.pptx",
      "  designPreset: executive",
    ].join("\n"));

    const deck = planDeck(basicDeck, { configPath });

    assert.equal(deck.config.deck.language, "en");
    assert.equal(deck.config.deck.presentationMode, "pipeline-one-page");
    assert.equal(deck.config.pptx.template, join(outDir, "company-master.pptx"));
    assert.equal(deck.config.pptx.designPreset, "executive");
    assert.equal(deck.diagnostics.some((diagnostic) => diagnostic.code === "CONFIG_FILE_NOT_IMPLEMENTED"), false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("createDeckPlan rejects config files that violate the JSON schema", () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-invalid-config-"));
  const configPath = join(outDir, "mdpresent.config.yaml");

  try {
    writeFileSync(configPath, [
      'version: "1.0"',
      "deck:",
      "  ratio: 1:1",
      "theme:",
      "  accentBlob: true",
      "typography:",
      "  minFontSize: -2",
    ].join("\n"));

    const deck = planDeck(basicDeck, { configPath });
    const diagnostic = deck.diagnostics.find((item) => item.code === "CONFIG_FILE_INVALID");

    assert.ok(diagnostic);
    assert.equal(diagnostic.level, "error");
    assert.match(diagnostic.message, /deck\.ratio/);
    assert.match(diagnostic.message, /theme/);
    assert.match(diagnostic.message, /typography\.minFontSize/);
    assert.equal(deck.config.deck.ratio, "16:9");
    assert.equal("accentBlob" in deck.config.theme, false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("createDeckPlan applies override files to title-targeted slides", () => {
  const result = planDeck(basicDeck, { overridePath: join(repoRoot, "examples/basic/deck.override.yaml") });
  const sourceSlide = result.presentation.slides.find((slide) => slide.title === "Key Features");
  assert.ok(sourceSlide);
  const layoutSlide = result.layout.slides.find((slide) => slide.sourceSlideId === sourceSlide.id);
  assert.ok(layoutSlide);

  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "OVERRIDE_FILE_NOT_IMPLEMENTED"), false);
  assert.equal(layoutSlide.layout.preset, "grid");
  assert.equal(layoutSlide.layout.columns, 2);
  assert.equal(layoutSlide.layout.rows, 2);
  assert.equal(layoutSlide.regions.some((region) => region.typography?.fontSize === 21), true);
  assert.equal(result.overrideDiff?.some((diff) => diff.path.endsWith("typography.fontSize") && diff.after === 21), true);
});

test("createDeckPlan applies setSplit before presentation planning", () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-split-override-"));
  const deckPath = join(outDir, "deck.md");
  const overridePath = join(outDir, "deck.override.yaml");
  const items = Array.from({ length: 12 }, (_, index) => `- Evidence item ${index + 1} with enough detail to add density`).join("\n");
  const markdown = [
    "# Demo",
    "",
    "## Dense Evidence",
    "",
    items,
  ].join("\n");

  try {
    writeFileSync(deckPath, markdown);
    writeFileSync(overridePath, [
      "version: '1.0'",
      "operations:",
      "  - op: setSplit",
      "    target:",
      "      title: Dense Evidence",
      "    value:",
      "      forceSingleSlide: true",
    ].join("\n"));

    const baseline = planDeck(deckPath, {
      cliConfig: { split: { autosplit: { enabled: true, maxDensity: 4 } } },
    });
    const overridden = planDeck(deckPath, {
      cliConfig: { split: { autosplit: { enabled: true, maxDensity: 4 } } },
      overridePath,
    });

    assert.equal(baseline.presentation.slides.filter((slide) => slide.title.startsWith("Dense Evidence")).length > 1, true);
    assert.equal(overridden.presentation.slides.filter((slide) => slide.title.startsWith("Dense Evidence")).length, 1);
    assert.equal(overridden.layout.diagnostics.some((diagnostic) => diagnostic.code === "OVERRIDE_REQUIRES_PRE_LAYOUT_PHASE"), false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("createDeckPlan applies heading-level splitBy overrides before presentation planning", () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-splitby-override-"));
  const deckPath = join(outDir, "deck.md");
  const overridePath = join(outDir, "deck.override.yaml");
  const markdown = [
    "# Demo",
    "",
    "## Research Findings",
    "",
    "This section should split by its child headings when requested.",
    "",
    "### Signal A",
    "",
    "First finding.",
    "",
    "### Signal B",
    "",
    "Second finding.",
  ].join("\n");

  try {
    writeFileSync(deckPath, markdown);
    writeFileSync(overridePath, [
      "version: '1.0'",
      "operations:",
      "  - op: setSplit",
      "    target:",
      "      title: Research Findings",
      "    value:",
      "      splitBy: h3",
    ].join("\n"));

    const baseline = planDeck(deckPath, {
      cliConfig: { split: { autosplit: { enabled: true, maxDensity: 99 } } },
    });
    const overridden = planDeck(deckPath, {
      cliConfig: { split: { autosplit: { enabled: true, maxDensity: 99 } } },
      overridePath,
    });

    assert.deepEqual(
      baseline.presentation.slides.filter((slide) => slide.title.includes("Signal")).map((slide) => slide.title),
      [],
    );
    assert.deepEqual(
      overridden.presentation.slides.filter((slide) => slide.headingPath.includes("Research Findings")).map((slide) => slide.title),
      ["Research Findings — Signal A", "Research Findings — Signal B"],
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("CLI entrypoint delegates inspect and build commands through the shared path", () => {
  const cliPath = join(repoRoot, "packages/cli/dist/index.js");
  const inspectOutput = execFileSync(process.execPath, [cliPath, "inspect", basicDeck, "--json"], {
    cwd: repoRoot,
    encoding: "utf-8",
  });
  const slides = JSON.parse(inspectOutput);
  assert.ok(slides.some((slide) => slide.title === "Key Features"));

  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-cli-entry-"));
  try {
    const buildOutput = execFileSync(process.execPath, [
      cliPath,
      "build",
      basicDeck,
      "--to",
      "html",
      "--out",
      outDir,
      "--config",
      "mdpresent.config.yaml",
      "--override",
      "deck.override.yaml",
    ], {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const html = readFileSync(join(outDir, "deck.html"), "utf-8");

    assert.match(buildOutput, /Wrote/);
    assert.match(html, /Automatic meeting summary/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("CLI doctor reports PDF exporter status", () => {
  const cliPath = join(repoRoot, "packages/cli/dist/index.js");
  const output = execFileSync(process.execPath, [
    cliPath,
    "doctor",
    "--pdf",
  ], {
    cwd: repoRoot,
    encoding: "utf-8",
    env: {
      ...process.env,
      MDPRESENT_PDF_EXPORT_COMMAND: JSON.stringify([process.execPath, "fake-exporter.mjs", "{pptx}", "{pdf}"]),
    },
  });

  assert.match(output, /PDF exporter:/);
  assert.match(output, /preferred: injected/);
  assert.match(output, /MDPRESENT_PDF_EXPORT_COMMAND/);
});

test("CLI build rejects unknown output formats", () => {
  const cliPath = join(repoRoot, "packages/cli/dist/index.js");
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-cli-bad-format-"));

  try {
    assert.throws(
      () => execFileSync(process.execPath, [
        cliPath,
        "build",
        basicDeck,
        "--to",
        "html,docx",
        "--out",
        outDir,
      ], {
        cwd: repoRoot,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
      (error) => {
        assert.equal(error.status, 1);
        assert.match(error.stderr, /Unknown output format: docx/);
        assert.match(error.stderr, /Allowed formats: pptx, html, pdf/);
        return true;
      },
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("CLI build wires --hints into the manifest", () => {
  const cliPath = join(repoRoot, "packages/cli/dist/index.js");
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-cli-hints-"));
  const deckPath = join(outDir, "deck.md");
  const hintPath = join(outDir, "deck.mdpr-hints.json");
  const markdown = "# Demo\n\n## Slide\n\nBody";

  try {
    writeFileSync(deckPath, markdown);
    writeFileSync(hintPath, JSON.stringify({
      schemaVersion: "mdpr-agent-hint-v1",
      sourceSha256: sha256(markdown),
      hints: [{ slideId: "slide-slide", confidence: 0.75, intentCandidate: "summary" }],
    }));

    execFileSync(process.execPath, [
      cliPath,
      "build",
      deckPath,
      "--to",
      "html",
      "--out",
      outDir,
      "--hints",
      hintPath,
    ], {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const manifest = JSON.parse(readFileSync(join(outDir, "mdpresent-manifest.json"), "utf-8"));

    assert.equal(manifest.agentHints.enabled, true);
    assert.equal(manifest.agentHints.accepted, 1);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("CLI build accepts equals-style option values", () => {
  const cliPath = join(repoRoot, "packages/cli/dist/index.js");
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-cli-equals-options-"));

  try {
    const output = execFileSync(process.execPath, [
      cliPath,
      "build",
      basicDeck,
      "--to=pptx,html",
      `--out=${outDir}`,
    ], {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    assert.match(output, /deck\.pptx/);
    assert.match(output, /deck\.html/);
    assert.equal(existsSync(join(outDir, "deck.pptx")), true);
    assert.equal(existsSync(join(outDir, "deck.html")), true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("validateDeck returns structured diagnostics and validity", () => {
  const result = validateDeck(basicDeck, { overridePath: "examples/basic/deck.override.yaml" });

  assert.equal(result.valid, true);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "OVERRIDE_FILE_NOT_IMPLEMENTED"), false);
});

test("validateDeck includes title text in overflow diagnostics", () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-title-overflow-"));
  const deckPath = join(outDir, "deck.md");

  try {
    writeFileSync(deckPath, [
      "# Demo",
      "",
      "## This is an intentionally very long slide title that should overflow the title region when validation uses a large title font size",
      "",
      "Short body.",
    ].join("\n"));

    const result = validateDeck(deckPath, {
      cliConfig: {
        layout: { overflow: { defaultAction: "fail" } },
        typography: { titleFontSize: 72, minFontSize: 18 },
      },
    });

    assert.equal(result.valid, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TEXT_OVERFLOW" && diagnostic.message.includes("title")));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("validateDeck visual validation adjusts theme text contrast and still reports same-layer region overlap", () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-visual-validation-"));
  const deckPath = join(outDir, "deck.md");
  const overridePath = join(outDir, "deck.override.yaml");

  try {
    writeFileSync(deckPath, [
      "# Demo",
      "",
      "## Items",
      "",
      "- Alpha",
      "- Beta",
    ].join("\n"));
    writeFileSync(overridePath, [
      'version: "1.0"',
      "operations:",
      "  - op: setSlot",
      "    target:",
      "      title: Items",
      "      slot: right",
      "    value:",
      "      x: 0.9",
      "      y: 1.7",
      "      w: 5.4",
      "      h: 4.8",
    ].join("\n"));

    const result = validateDeck(deckPath, {
      overridePath,
      visualValidation: true,
      cliConfig: {
        theme: {
          backgroundColor: "#FFFFFF",
          textColor: "#FFFFFF",
        },
      },
    });
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);

    assert.equal(result.valid, false);
    assert.equal(codes.includes("VISUAL_CONTRAST"), false);
    assert.equal(codes.includes("VISUAL_REGION_OVERLAP"), true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("validateDeck visual validation reports image aspect and connector clearance risks", () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-visual-validation-media-"));
  const deckPath = join(outDir, "deck.md");
  const overridePath = join(outDir, "deck.override.yaml");

  try {
    writeFileSync(deckPath, [
      "# Demo",
      "",
      "## Evidence Image",
      "",
      "![Evidence](evidence.png)",
      "",
      "## Flow",
      "",
      "Draft => Review => Render",
    ].join("\n"));
    writeFileSync(overridePath, [
      'version: "1.0"',
      "operations:",
      "  - op: setSlot",
      "    target:",
      "      title: Evidence Image",
      "      slot: image-1",
      "    value:",
      "      x: 1.0",
      "      y: 1.6",
      "      w: 0.55",
      "      h: 4.8",
      "  - op: setSlot",
      "    target:",
      "      title: Flow",
      "      slot: diagram",
      "    value:",
      "      x: 1.0",
      "      y: 1.7",
      "      w: 1.0",
      "      h: 0.5",
    ].join("\n"));

    const result = validateDeck(deckPath, { overridePath, visualValidation: true });
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);

    assert.equal(result.valid, false);
    assert.equal(codes.includes("VISUAL_IMAGE_ASPECT_RATIO"), true);
    assert.equal(codes.includes("VISUAL_CONNECTOR_CLEARANCE"), true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("validateDeck coherence validation reports claimless evidence and orphan tables", () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-coherence-validation-"));
  const deckPath = join(outDir, "deck.md");

  try {
    writeFileSync(deckPath, [
      "# Demo",
      "",
      "## Evidence",
      "",
      "| Stage | Users |",
      "|---|---:|",
      "| Awareness | 8000 |",
      "| Activation | 4000 |",
      "",
      "![Funnel](funnel.png)",
    ].join("\n"));

    const result = validateDeck(deckPath, { coherenceValidation: true });
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);

    assert.equal(codes.includes("CLAIMLESS_EVIDENCE_SLIDE"), true);
    assert.equal(codes.includes("ORPHAN_TABLE"), true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("validateDeck coherence validation reports section style drift", () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-coherence-style-drift-"));
  const deckPath = join(outDir, "deck.md");
  const overridePath = join(outDir, "deck.override.yaml");

  try {
    writeFileSync(deckPath, [
      "# Demo",
      "",
      "## Product",
      "",
      "This section introduces multiple evidence styles that should still keep a coherent section motif.",
      "",
      "### Claim",
      "",
      "The product keeps Markdown structure editable.",
      "",
      "### Evidence",
      "",
      "| Feature | Result |",
      "|---|---|",
      "| Native table | Editable |",
      "",
      "### Flow",
      "",
      "Markdown => Layout => PPTX",
    ].join("\n"));
    writeFileSync(overridePath, [
      'version: "1.0"',
      "operations:",
      "  - op: setLayout",
      "    target:",
      "      title: Product — Claim",
      "    value:",
      "      preset: title-body",
      "  - op: setLayout",
      "    target:",
      "      title: Product — Evidence",
      "    value:",
      "      preset: table-focus",
      "  - op: setLayout",
      "    target:",
      "      title: Product — Flow",
      "    value:",
      "      preset: pipeline",
    ].join("\n"));

    const result = validateDeck(deckPath, {
      overridePath,
      coherenceValidation: true,
      cliConfig: { split: { autosplit: { enabled: true, maxDensity: 0.5 } } },
    });
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);

    assert.equal(codes.includes("SECTION_STYLE_DRIFT"), true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("validateDeck resolves default text overflow before reporting diagnostics", () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-resolve-overflow-"));
  const deckPath = join(outDir, "deck.md");

  try {
    writeFileSync(deckPath, [
      "# Demo",
      "",
      "## Markdown",
      "",
      "- Markdown은 원본 문서이며 발표자료 구조를 잃지 않도록 충분히 긴 한국어 문장을 포함합니다.",
      "- 분할은 heading과 density를 함께 사용하며 renderer text box 밖으로 흘러나가면 안 됩니다.",
      "- 레이아웃은 intent와 item count를 기준으로 선택하되, 글자 영역은 반드시 완전히 포함해야 합니다.",
      "- 예외는 override manifest로 통제하지만 기본 출력은 별도 수작업 없이 안전해야 합니다.",
      "- 본문 배치는 CLI가 다시 계산하며 PPTX와 HTML 모두 같은 containment 기준을 따라야 합니다.",
    ].join("\n"));

    const result = validateDeck(deckPath);

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TEXT_OVERFLOW"), false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("planDeck splits very long four-item lists before unreadable grid overflow", () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-long-list-continuation-"));
  const deckPath = join(outDir, "deck.md");
  const sentence = "This item carries a deliberately long explanation with several clauses, enough words to make compact card layouts uncomfortable while a full-width continuation row can remain readable.";

  try {
    writeFileSync(deckPath, [
      "# Demo",
      "",
      "## Dense Items",
      "",
      ...Array.from({ length: 4 }, (_, index) => `- Item ${index + 1}: ${Array(4).fill(sentence).join(" ")}`),
    ].join("\n"));

    const plan = planDeck(deckPath);
    const contentSlides = plan.presentation.slides.filter((slide) => slide.title?.startsWith("Dense Items"));
    const result = validateDeck(deckPath);

    assert.equal(contentSlides.length > 1, true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TEXT_OVERFLOW"), false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("buildDeck manifest records pre-split overflow continuation strategy", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-overflow-strategy-"));
  const deckPath = join(outDir, "deck.md");
  const sentence = "This item carries a deliberately long explanation with several clauses, enough words to make compact card layouts uncomfortable while a full-width continuation row can remain readable.";

  try {
    writeFileSync(deckPath, [
      "# Demo",
      "",
      "## Dense Items",
      "",
      ...Array.from({ length: 4 }, (_, index) => `- Item ${index + 1}: ${Array(4).fill(sentence).join(" ")}`),
    ].join("\n"));

    const result = await buildDeck(deckPath, { formats: ["html"], outDir });
    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf-8"));

    assert.equal(manifest.validation.overflowResolution.checked, true);
    assert.equal(manifest.validation.overflowResolution.strategyCounts.preSplit > 0, true);
    assert.equal(manifest.validation.overflowResolution.continuationReasons.list > 0, true);
    assert.equal(manifest.validation.overflowResolution.graphOrDiagramBlocksSplit, false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("buildDeck manifest records code continuation reasons", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-code-continuation-strategy-"));
  const deckPath = join(outDir, "deck.md");

  try {
    writeFileSync(deckPath, [
      "# Demo",
      "",
      "## Commands",
      "",
      "```bash",
      "mdpresent inspect deck.md --json",
      "mdpresent plan deck.md --json",
      "mdpresent validate deck.md --coherence",
      "mdpresent build deck.md --to pptx,html --out dist",
      "mdpresent build deck.md --to pdf --out dist",
      "mdpresent validate deck.md --visual --coherence",
      "```",
    ].join("\n"));

    const result = await buildDeck(deckPath, { formats: ["html"], outDir });
    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf-8"));

    assert.equal(manifest.validation.overflowResolution.strategyCounts.preSplit > 0, true);
    assert.equal(manifest.validation.overflowResolution.continuationReasons.code > 0, true);
    assert.equal(manifest.validation.overflowResolution.graphOrDiagramBlocksSplit, false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("buildDeck retries an overflowing automatic layout candidate before font shrink", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-candidate-reflow-"));
  const deckPath = join(outDir, "deck.md");
  const phrase = "deterministic layout planning preserves readable markdown semantics and avoids panel overflow through candidate reflow ";

  try {
    writeFileSync(deckPath, [
      "# Demo",
      "",
      "## Dense Insight",
      "",
      phrase.repeat(9).trim(),
    ].join("\n"));

    const result = await buildDeck(deckPath, { formats: ["html"], outDir });
    const contentSlide = result.layout.slides.find((slide) => slide.layout.preset !== "cover" && slide.layout.preset !== "toc");
    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf-8"));

    assert.equal(contentSlide?.layout.preset, "title-body");
    assert.equal(manifest.validation.overflowResolution.strategyCounts.candidateReflow > 0, true);
    assert.equal(contentSlide.regions.some((region) => region.typography?.fontSize === 18 && region.role === "body"), false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("buildDeck preserves explicit override layouts when candidate retry could fit better", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-candidate-reflow-override-"));
  const deckPath = join(outDir, "deck.md");
  const overridePath = join(outDir, "deck.override.yaml");
  const phrase = "deterministic layout planning preserves readable markdown semantics and avoids panel overflow through candidate reflow ";

  try {
    writeFileSync(deckPath, [
      "# Demo",
      "",
      "## Dense Insight",
      "",
      phrase.repeat(9).trim(),
    ].join("\n"));
    writeFileSync(overridePath, [
      'version: "1.0"',
      "operations:",
      "  - op: setLayout",
      "    target:",
      "      title: Dense Insight",
      "    value:",
      "      preset: text-icon-aside",
    ].join("\n"));

    const result = await buildDeck(deckPath, { formats: ["html"], outDir, overridePath });
    const contentSlide = result.layout.slides.find((slide) => slide.layout.preset !== "cover" && slide.layout.preset !== "toc");
    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf-8"));

    assert.equal(contentSlide?.layout.preset, "text-icon-aside");
    assert.equal(manifest.validation.overflowResolution.strategyCounts.candidateReflow, 0);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("planDeck keeps auto-resolved body text above the readable font floor", () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-readable-font-floor-"));
  const deckPath = join(outDir, "deck.md");

  try {
    writeFileSync(deckPath, [
      "# Demo",
      "",
      "## Dense Notes",
      "",
      "- First: This intentionally long sentence should force the resolver to manage the region without shrinking below a readable body font size.",
      "- Second: Another long explanatory sentence keeps pressure on the text region while still requiring professional slide readability.",
      "- Third: The slide should split or expand before it allows tiny text that varies too much from page to page.",
      "- Fourth: The generated layout must preserve a stable readable minimum for body and item text.",
    ].join("\n"));

    const result = planDeck(deckPath, {
      cliConfig: {
        typography: { bodyFontSize: 20, minFontSize: 12 },
      },
    });
    const contentLayouts = result.layout.slides.filter((slide) => slide.layout.preset !== "cover" && slide.layout.preset !== "toc");
    const contentRegions = contentLayouts.flatMap((slide) => slide.regions.filter((region) => ["body", "item"].includes(region.role)));

    assert.ok(contentRegions.length > 0);
    assert.equal(contentRegions.every((region) => (region.typography?.fontSize ?? result.layout.theme.bodyFontSize) >= 16), true);
    assert.equal(contentRegions.every((region) => (region.typography?.minFontSize ?? 0) >= 16), true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});


test("CLI validate exposes a user-facing acceptance path", () => {
  const cliPath = join(repoRoot, "packages/cli/dist/index.js");
  const output = execFileSync(process.execPath, [
    cliPath,
    "validate",
    basicDeck,
    "--override",
    "examples/basic/deck.override.yaml",
    "--json",
  ], {
    cwd: repoRoot,
    encoding: "utf-8",
  });
  const result = JSON.parse(output);

  assert.equal(result.valid, true);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "OVERRIDE_FILE_NOT_IMPLEMENTED"), false);
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
