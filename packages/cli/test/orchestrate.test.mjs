import test from "node:test";
import assert from "node:assert/strict";
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
    assert.match(html, /AI 업무 자동화 제안서/);
    assert.match(html, /회의록 자동 요약/);
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

test("buildDeck applies CLI design preset to HTML output", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-cli-theme-"));

  try {
    const result = await buildDeck(basicDeck, { formats: ["html"], outDir, designPreset: "nord" });
    const htmlPath = result.writtenFiles.find((file) => file.endsWith("deck.html"));
    assert.ok(htmlPath);
    const html = readFileSync(htmlPath, "utf-8");

    assert.match(html, /--bg: #2E3440;/);
    assert.match(html, /--text: #ECEFF4;/);
    assert.match(html, /--primary: #88C0D0;/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("buildDeck writes design lock and output manifest with visual validation summary", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-cli-manifest-"));

  try {
    const result = await buildDeck(basicDeck, {
      formats: ["html"],
      outDir,
      visualValidation: true,
      cliConfig: {
        theme: {
          decorationStyle: "glass",
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
    assert.equal(designLock.decorationStyle, "glass");
    assert.equal(designLock.colorSeed, "#8A4FFF");
    assert.equal(designLock.paletteSeed.base, "8A4FFF");
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
      "glass",
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
    assert.match(xml, /val="0B1020"/);
    assert.match(xml, /outerShdw/);
    assert.match(xml, /glow/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("CLI accepts minimalism and newmorphism decoration styles", () => {
  const cliPath = join(repoRoot, "packages/cli/dist/index.js");
  const cases = [
    ["minimalism", "#111827", "monochromatic"],
    ["newmorphism", "#4F6F8F", "analogous"],
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
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});


test("createDeckPlan reports config and override paths as requested but unapplied scaffold hooks", () => {
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
    ["CONFIG_FILE_NOT_FOUND", "OVERRIDE_FILE_NOT_IMPLEMENTED"],
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
      "pptx:",
      "  template: company-master.pptx",
      "  designPreset: executive",
    ].join("\n"));

    const deck = planDeck(basicDeck, { configPath });

    assert.equal(deck.config.deck.language, "en");
    assert.equal(deck.config.pptx.template, join(outDir, "company-master.pptx"));
    assert.equal(deck.config.pptx.designPreset, "executive");
    assert.equal(deck.diagnostics.some((diagnostic) => diagnostic.code === "CONFIG_FILE_NOT_IMPLEMENTED"), false);
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
  assert.ok(slides.some((slide) => slide.title === "주요 기능"));

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
    assert.match(html, /회의록 자동 요약/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("validateDeck returns structured diagnostics and validity", () => {
  const result = validateDeck(basicDeck, { overridePath: "examples/basic/deck.override.yaml" });

  assert.equal(result.valid, true);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "OVERRIDE_FILE_NOT_IMPLEMENTED"));
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
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "OVERRIDE_FILE_NOT_IMPLEMENTED"));
});
