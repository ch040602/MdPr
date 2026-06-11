import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import PptxGenJSExport from "pptxgenjs";
import JSZip from "jszip";
import { renderPptx } from "../dist/index.js";

const PptxGenJS = typeof PptxGenJSExport === "function" ? PptxGenJSExport : PptxGenJSExport.default;

async function patchTemplateTheme(templatePath, colors) {
  const zip = await JSZip.loadAsync(readFileSync(templatePath));
  const themePath = Object.keys(zip.files).find((path) => /^ppt\/theme\/theme\d+\.xml$/.test(path));
  assert.ok(themePath);

  const themeFile = zip.file(themePath);
  assert.ok(themeFile);
  let xml = await themeFile.async("string");
  for (const [name, color] of Object.entries(colors)) {
    xml = xml.replace(new RegExp(`<a:${name}>[\\s\\S]*?<\\/a:${name}>`), `<a:${name}><a:srgbClr val="${color}"/></a:${name}>`);
  }
  zip.file(themePath, xml);
  writeFileSync(templatePath, await zip.generateAsync({ type: "nodebuffer" }));
}

const sampleDeck = {
  presentation: {
    version: "1.0",
    meta: { title: "Korean README", language: "ko" },
    outline: [],
    assets: [],
    diagnostics: [],
    slides: [
      {
        id: "slide-1",
        index: 0,
        role: "content",
        title: "핵심 철학",
        headingPath: ["mdpresent", "핵심 철학"],
        source: {},
        intent: "list",
        tags: [],
        blocks: [
          {
            id: "list-1",
            type: "bulletList",
            items: [
              "Markdown은 원본 문서다.",
              "분할은 heading + density로 한다.",
              "레이아웃은 intent + item count로 고른다.",
              "본문 배치는 CLI가 새로 계산한다.",
            ],
          },
        ],
      },
    ],
  },
  layout: {
    version: "1.0",
    slideSize: { width: 13.333, height: 7.5, unit: "in" },
    theme: {
      fontFamily: "Arial",
      backgroundColor: "#FFFFFF",
      textColor: "#111827",
      primaryColor: "#2563EB",
      titleFontSize: 30,
      bodyFontSize: 20,
      captionFontSize: 12,
      minFontSize: 14,
      lineHeight: 1.2,
    },
    diagnostics: [],
    slides: [
      {
        id: "layout-slide-1",
        sourceSlideId: "slide-1",
        index: 0,
        layout: { preset: "grid", columns: 2, rows: 2 },
        background: { color: "#FFFFFF" },
        overflowPolicy: { action: "shrink", minFontSize: 14, maxShrinkSteps: 3 },
        regions: [
          {
            id: "title",
            role: "title",
            blockIds: [],
            x: 0.8,
            y: 0.45,
            w: 11.7,
            h: 0.8,
            zIndex: 10,
            typography: { fontFamily: "Arial", fontSize: 30, fontWeight: "bold", lineHeight: 1.2, minFontSize: 14 },
          },
          {
            id: "item-1",
            role: "item",
            blockIds: ["list-1#0"],
            x: 0.9,
            y: 1.6,
            w: 5.5,
            h: 1.7,
            zIndex: 10,
            typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
          },
          {
            id: "item-2",
            role: "item",
            blockIds: ["list-1#1"],
            x: 6.9,
            y: 1.6,
            w: 5.5,
            h: 1.7,
            zIndex: 10,
            typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
          },
        ],
      },
    ],
  },
};

test("renderPptx writes editable text boxes with stable coordinates and centered titles", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-"));
  const outPath = join(outDir, "deck.pptx");

  try {
    await renderPptx(sampleDeck, { outPath });

    assert.equal(existsSync(outPath), true);
    assert.ok(readFileSync(outPath).length > 0);

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /핵심 철학/);
    assert.match(xml, /Markdown은 원본 문서다\./);
    assert.equal((xml.match(/txBox="1"/g) ?? []).length, 3);
    assert.match(xml, /<a:off x="731520" y="411480"\/><a:ext cx="10698480" cy="731520"\/>/);
    assert.match(xml, /<a:off x="822960" y="1463040"\/><a:ext cx="5029200" cy="1554480"\/>/);
    assert.match(xml, /<a:bodyPr[^>]*wrap="square"/);
    assert.match(xml, /<a:pPr[^>]*algn="ctr"/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx renders item text when a bullet list only contains structured listItems", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-listitems-only-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].blocks = [
    {
      id: "list-1",
      type: "bulletList",
      listItems: [
        { text: "Structured item alpha", level: 0, ordered: false },
        { text: "Structured item beta", level: 0, ordered: false },
      ],
      listKind: "unordered",
    },
  ];

  try {
    await renderPptx(deck, { outPath });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /Structured item alpha/);
    assert.match(xml, /Structured item beta/);
    assert.equal((xml.match(/Structured item/g) ?? []).length, 2);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("design presets add visual background accents and card surfaces without changing content coordinates", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-design-"));
  const outPath = join(outDir, "deck.pptx");

  try {
    await renderPptx(sampleDeck, { outPath, designPreset: "executive" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /val="F8FAFC"/);
    assert.match(xml, /val="1D4ED8"/);
    assert.equal((xml.match(/<p:sp>/g) ?? []).length >= 6, true);
    assert.match(xml, /<a:off x="822960" y="1463040"\/><a:ext cx="5029200" cy="1554480"\/>/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("ordinary body prose can render without a visible filled surface", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-open-body-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].title = "Design Presets";
  deck.presentation.slides[0].intent = "standard";
  deck.presentation.slides[0].blocks = [
    {
      id: "paragraph-1",
      type: "paragraph",
      text: "Shared presets apply across PPTX and HTML.",
      lines: ["Shared presets apply across PPTX and HTML."],
      sentences: ["Shared presets apply across PPTX and HTML."],
    },
    {
      id: "paragraph-2",
      type: "paragraph",
      text: "Theme galleries repeat the planned slides for visual QA.",
      lines: ["Theme galleries repeat the planned slides for visual QA."],
      sentences: ["Theme galleries repeat the planned slides for visual QA."],
    },
  ];
  deck.layout.slides[0].layout = { preset: "title-body" };
  deck.layout.slides[0].regions = [
    {
      id: "title",
      role: "title",
      blockIds: [],
      x: 0.8,
      y: 0.5,
      w: 11.7,
      h: 0.8,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 30, fontWeight: "bold", lineHeight: 1.2, minFontSize: 14 },
    },
    {
      id: "body",
      role: "body",
      blockIds: ["paragraph-1", "paragraph-2"],
      x: 1.0,
      y: 1.6,
      w: 11.2,
      h: 4.9,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "executive" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /Shared presets apply across PPTX and HTML/);
    assert.match(xml, /Theme galleries repeat the planned slides/);
    assert.doesNotMatch(xml, /<a:off x="914400" y="1463040"\/><a:ext cx="10241280" cy="4480560"\/>[\s\S]{0,240}<a:prstGeom prst="roundRect"/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("shared presentation palettes can be selected for PPTX output", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-palette-"));
  const outPath = join(outDir, "deck.pptx");

  try {
    await renderPptx(sampleDeck, { outPath, designPreset: "nord" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /val="2E3440"/);
    assert.match(xml, /val="ECEFF4"/);
    assert.match(xml, /val="88C0D0"/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx does not duplicate cover titles through empty body regions", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-cover-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].role = "cover";
  deck.presentation.slides[0].title = "mdpresent";
  deck.presentation.slides[0].blocks = [];
  deck.layout.slides[0].layout = { preset: "cover" };
  deck.layout.slides[0].regions = [
    {
      id: "title",
      role: "title",
      blockIds: ["__title:slide-1"],
      x: 1.0,
      y: 2.25,
      w: 11.3,
      h: 1.25,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 44, fontWeight: "bold", lineHeight: 1.2, minFontSize: 14 },
    },
    {
      id: "body",
      role: "body",
      blockIds: [],
      x: 0.9,
      y: 1.6,
      w: 11.5,
      h: 4.9,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "executive" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.equal((xml.match(/mdpresent/g) ?? []).length, 1);
    assert.match(xml, /val="1D4ED8"/);
    assert.doesNotMatch(xml, /<a:off x="822960" y="1463040"\/><a:ext cx="10515600" cy="4480560"\/>/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx can emit one multi-theme gallery PPTX for visual comparison", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-theme-gallery-"));
  const outPath = join(outDir, "theme-gallery.pptx");

  try {
    await renderPptx(sampleDeck, { outPath, themeGalleryPresets: ["executive", "nord"] });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const slideCount = Number(execFileSync("powershell", ["-NoProfile", "-Command", `(Get-ChildItem -LiteralPath '${join(expanded, "ppt", "slides")}' -Filter 'slide*.xml' | Measure-Object).Count`], { encoding: "utf-8" }).trim());
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide2.xml"), "utf-8");

    assert.equal(slideCount, sampleDeck.layout.slides.length * 2);
    assert.match(xml, /val="2E3440"/);
    assert.match(xml, /Theme: nord/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("template import reuses positioned image assets from a PPTX template", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-template-"));
  const templatePath = join(outDir, "template.pptx");
  const logoPath = join(outDir, "logo.png");
  const outPath = join(outDir, "deck.pptx");

  try {
    writeFileSync(logoPath, Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFElEQVR42mP8z8AARLJgwiM3FQAAp5kT+dqQB7EAAAAASUVORK5CYII=",
      "base64",
    ));

    const template = new PptxGenJS();
    template.layout = "LAYOUT_WIDE";
    const slide = template.addSlide();
    slide.addImage({ path: logoPath, x: 0.25, y: 0.2, w: 0.5, h: 0.5 });
    await template.writeFile({ fileName: templatePath });

    await renderPptx(sampleDeck, { outPath, templatePath });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");
    const mediaFiles = execFileSync("powershell", ["-NoProfile", "-Command", `(Get-ChildItem -LiteralPath '${join(expanded, "ppt", "media")}' | Measure-Object).Count`], { encoding: "utf-8" });

    assert.match(xml, /<p:pic>/);
    assert.match(xml, /<a:off x="228600" y="182880"\/>\s*<a:ext cx="457200" cy="457200"\/>/);
    assert.equal(Number(mediaFiles.trim()) > 0, true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("template import reuses decorative shapes for matching layout types and preserves theme colors", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-template-style-"));
  const templatePath = join(outDir, "template.pptx");
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].intent = "comparison";
  deck.layout.slides[0].layout = { preset: "comparison", columns: 2, direction: "horizontal" };
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    {
      id: "left",
      role: "body",
      blockIds: ["list-1#0"],
      x: 0.9,
      y: 1.7,
      w: 5.4,
      h: 4.8,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
    {
      id: "right",
      role: "body",
      blockIds: ["list-1#1"],
      x: 7.0,
      y: 1.7,
      w: 5.4,
      h: 4.8,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    const template = new PptxGenJS();
    template.layout = "LAYOUT_WIDE";
    const slide = template.addSlide();
    slide.addText("Left example", { x: 0.8, y: 1.5, w: 4.5, h: 0.5 });
    slide.addText("Right example", { x: 7.0, y: 1.5, w: 4.5, h: 0.5 });
    slide.addShape("rect", {
      x: 11.8,
      y: 0,
      w: 0.4,
      h: 7.5,
      fill: { color: "0B5563" },
      line: { color: "0B5563" },
    });
    await template.writeFile({ fileName: templatePath });
    await patchTemplateTheme(templatePath, {
      lt1: "FFF8E7",
      dk1: "1A1A1A",
      accent1: "0B5563",
      accent2: "D97706",
    });

    await renderPptx(deck, { outPath, templatePath, designPreset: "executive" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /val="FFF8E7"/);
    assert.match(xml, /val="0B5563"/);
    assert.match(xml, /val="D97706"/);
    assert.match(xml, /<a:off x="10789920" y="0"\/>\s*<a:ext cx="365760" cy="6858000"\/>[\s\S]{0,420}<a:prstGeom prst="rect"/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("paragraph rendering preserves markdown lines and sentence units as readable line breaks", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-lines-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].blocks = [
    {
      id: "paragraph-1",
      type: "paragraph",
      text: "첫 문장입니다. 둘째 문장입니다. Third sentence.",
      lines: ["첫 문장입니다. 둘째 문장입니다.", "Third sentence."],
      sentences: ["첫 문장입니다.", "둘째 문장입니다.", "Third sentence."],
    },
  ];
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    {
      id: "body",
      role: "body",
      blockIds: ["paragraph-1"],
      x: 0.9,
      y: 1.6,
      w: 5.5,
      h: 3.2,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "plain" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /첫 문장입니다\./);
    assert.match(xml, /둘째 문장입니다\./);
    assert.match(xml, /Third sentence\./);
    assert.equal((xml.match(/<a:br\/>|<a:p\b/g) ?? []).length >= 2, true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx preserves paragraph emphasis while keeping markdown line breaks", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-rich-paragraph-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].blocks = [
    {
      id: "paragraph-1",
      type: "paragraph",
      text: "First bold line. Second italic line.",
      lines: ["First **bold** line.", "Second *italic* line."],
      sentences: ["First bold line.", "Second italic line."],
      inlineRuns: [
        { text: "First " },
        { text: "bold", bold: true },
        { text: " line.\nSecond " },
        { text: "italic", italic: true },
        { text: " line." },
      ],
    },
  ];
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    {
      id: "body",
      role: "body",
      blockIds: ["paragraph-1"],
      x: 0.9,
      y: 1.6,
      w: 5.5,
      h: 3.2,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "plain" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /First/);
    assert.match(xml, /Second/);
    assert.match(xml, /<a:rPr[^>]*b="1"/);
    assert.match(xml, /<a:rPr[^>]*i="1"/);
    assert.equal((xml.match(/<a:br\/>|<a:p\b/g) ?? []).length >= 2, true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx preserves ordered list numbering and inline emphasis in editable text", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-structure-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].blocks = [
    {
      id: "list-1",
      type: "bulletList",
      items: ["Prepare source", "Render deck", "Validate output"],
      listItems: [
        { text: "Prepare source\nUse Markdown", label: "Prepare source", description: "Use Markdown", descriptionRuns: [{ text: "Use Markdown" }], ordered: true, number: 1, level: 0, runs: [{ text: "Prepare " }, { text: "source", bold: true }, { text: "\nUse Markdown" }] },
        { text: "Render deck", ordered: true, number: 2, level: 0, runs: [{ text: "Render " }, { text: "deck", italic: true }] },
        { text: "Validate output", ordered: false, level: 1, runs: [{ text: "Validate output" }] },
      ],
    },
  ];
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    {
      id: "body",
      role: "body",
      blockIds: ["list-1"],
      x: 0.9,
      y: 1.6,
      w: 5.5,
      h: 3.2,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "plain" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /1\. Prepare/);
    assert.match(xml, /Use Markdown/);
    assert.match(xml, /2\. Render/);
    assert.match(xml, /Validate output/);
    assert.doesNotMatch(xml, /•/);
    assert.match(xml, /<a:rPr[^>]*b="1"/);
    assert.match(xml, /<a:rPr[^>]*i="1"/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx adds editable number badges and accent-colored key text for item cards", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-item-badges-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].title = "Workflow";
  deck.presentation.slides[0].blocks = [
    {
      id: "list-1",
      type: "bulletList",
      items: ["Prepare source", "Render deck"],
      listItems: [
        { text: "Prepare source", ordered: true, number: 1, level: 0, runs: [{ text: "Prepare " }, { text: "source", bold: true }] },
        { text: "Render deck", ordered: true, number: 2, level: 0, runs: [{ text: "Render " }, { text: "deck", bold: true }] },
      ],
    },
  ];
  deck.layout.slides[0].layout = { preset: "grid", columns: 2, rows: 1 };
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    { id: "item-1", role: "item", blockIds: ["list-1#0"], x: 0.9, y: 1.7, w: 5.5, h: 1.7, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 } },
    { id: "item-2", role: "item", blockIds: ["list-1#1"], x: 6.9, y: 1.7, w: 5.5, h: 1.7, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 } },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "executive" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, />1</);
    assert.match(xml, />2</);
    assert.match(xml, /Prepare/);
    assert.match(xml, /Render/);
    assert.match(xml, /val="1D4ED8"/);
    assert.equal((xml.match(/prst="ellipse"|prst="roundRect"/g) ?? []).length >= 2, true);
    assert.doesNotMatch(xml, /1\. Prepare/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx normalizes same-role text to one font size per slide", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-role-fonts-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].blocks = [
    {
      id: "list-1",
      type: "bulletList",
      items: ["Alpha item", "Beta item"],
      listItems: [
        { text: "Alpha item", ordered: false, level: 0, runs: [{ text: "Alpha item" }] },
        { text: "Beta item", ordered: false, level: 0, runs: [{ text: "Beta item" }] },
      ],
    },
  ];
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    { id: "item-1", role: "item", blockIds: ["list-1#0"], x: 0.9, y: 1.7, w: 5.5, h: 1.7, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 24, lineHeight: 1.2, minFontSize: 16 } },
    { id: "item-2", role: "item", blockIds: ["list-1#1"], x: 6.9, y: 1.7, w: 5.5, h: 1.7, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 18, lineHeight: 1.2, minFontSize: 16 } },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "plain" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /Alpha item/);
    assert.match(xml, /Beta item/);
    assert.equal((xml.match(/sz="1800"/g) ?? []).length >= 2, true);
    assert.doesNotMatch(xml, /sz="2400"/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx separates key quote text into a surfaced region with a one-sided accent", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-key-message-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].title = "Decision";
  deck.presentation.slides[0].intent = "quote";
  deck.presentation.slides[0].blocks = [
    { id: "quote-1", type: "quote", text: "Keep the Markdown source authoritative.", inlineRuns: [{ text: "Keep the Markdown source " }, { text: "authoritative", bold: true }, { text: "." }] },
    { id: "paragraph-1", type: "paragraph", text: "Supporting detail stays below." },
  ];
  deck.layout.slides[0].layout = { preset: "key-message" };
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    { id: "key-message", role: "body", blockIds: ["quote-1"], x: 1.0, y: 1.55, w: 11.2, h: 1.45, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 26, fontWeight: "bold", lineHeight: 1.2, minFontSize: 14 } },
    { id: "body", role: "body", blockIds: ["paragraph-1"], x: 1.0, y: 3.35, w: 11.2, h: 2.95, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 } },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "executive" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /Keep the Markdown source/);
    assert.match(xml, /authoritative/);
    assert.match(xml, /Supporting detail stays below/);
    assert.match(xml, /<a:off x="914400" y="1417320"\/><a:ext cx="10241280" cy="1325880"\/>/);
    assert.match(xml, /<a:ext cx="91440" cy="1325880"\/>/);
    assert.match(xml, /val="1D4ED8"/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx renders pipeline diagrams as editable nodes and connectors", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-diagram-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].title = "Pipeline";
  deck.presentation.slides[0].intent = "diagram";
  deck.presentation.slides[0].blocks = [
    {
      id: "diagram-1",
      type: "diagram",
      diagram: {
        kind: "pipeline",
        nodes: [
          { id: "node-1", label: "Draft" },
          { id: "node-2", label: "Review" },
          { id: "node-3", label: "Render" },
        ],
        edges: [
          { from: "node-1", to: "node-2" },
          { from: "node-2", to: "node-3" },
        ],
      },
    },
  ];
  deck.layout.slides[0].layout = { preset: "pipeline", direction: "horizontal" };
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    {
      id: "diagram",
      role: "diagram",
      blockIds: ["diagram-1"],
      x: 1.0,
      y: 2.5,
      w: 11.2,
      h: 1.5,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 18, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "nord" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /Draft/);
    assert.match(xml, /Review/);
    assert.match(xml, /Render/);
    assert.match(xml, />1</);
    assert.match(xml, />2</);
    assert.match(xml, />3</);
    assert.equal((xml.match(/prst="roundRect"/g) ?? []).length >= 3, true);
    assert.equal((xml.match(/prst="ellipse"/g) ?? []).length >= 3, true);
    assert.equal((xml.match(/<a:ln/g) ?? []).length >= 2, true);
    assert.doesNotMatch(xml, /<a:off x="914400" y="2286000"\/>\s*<a:ext cx="10241280" cy="1371600"\/>[\s\S]{0,420}<a:prstGeom prst="roundRect"/);
    assert.doesNotMatch(xml, /<a:off x="914400" y="2286000"\/>\s*<a:ext cx="10241280" cy="73152"\/>[\s\S]{0,420}<a:prstGeom prst="rect"/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx selects vertical, U, reverse-U, and cycle-like graph arrangements for diagrams", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-diagram-arrangements-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = makeDiagramDeck([
    {
      title: "Vertical",
      labels: [
        "Deep Markdown semantic extraction",
        "Presentation intermediate representation normalization",
        "Editable renderer output",
      ],
    },
    {
      title: "U Shape",
      labels: ["Draft", "Parse", "Outline", "Split", "Layout", "Render"],
    },
    {
      title: "Reverse U Shape",
      labels: ["A", "B", "C", "D", "E", "F", "G", "H"],
    },
    {
      title: "Cycle",
      labels: ["Plan", "Render", "Review", "Revise"],
      cycle: true,
    },
  ]);

  try {
    await renderPptx(deck, { outPath, designPreset: "executive" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const verticalXml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");
    const uXml = readFileSync(join(expanded, "ppt", "slides", "slide2.xml"), "utf-8");
    const reverseUXml = readFileSync(join(expanded, "ppt", "slides", "slide3.xml"), "utf-8");
    const cycleXml = readFileSync(join(expanded, "ppt", "slides", "slide4.xml"), "utf-8");

    const diagramXml = [verticalXml, uXml, reverseUXml, cycleXml].join("\n");
    const lineExtents = [
      ...diagramXml.matchAll(/<a:xfrm>[\s\S]{0,320}<a:ext cx="(-?\d+)" cy="(-?\d+)"\/>[\s\S]{0,360}<a:prstGeom prst="line"/g),
    ];

    assert.match(verticalXml, /Presentation intermediate representation normalization/);
    assert.match(verticalXml, /<a:ext cx="\d+" cy="[1-9]\d+"\/>[\s\S]{0,700}prst="line"/);
    assert.match(uXml, /Split/);
    assert.match(uXml, /<a:ext cx="\d+" cy="[1-9]\d+"\/>[\s\S]{0,700}prst="line"/);
    assert.match(reverseUXml, /H/);
    assert.match(reverseUXml, /<a:ext cx="\d+" cy="[1-9]\d+"\/>[\s\S]{0,700}prst="line"/);
    assert.match(cycleXml, /Revise/);
    assert.equal((cycleXml.match(/prst="line"/g) ?? []).length >= 4, true);
    assert.equal(lineExtents.length > 0, true);
    assert.equal(lineExtents.every((match) => Number(match[1]) >= 0 && Number(match[2]) >= 0), true);
    assert.equal(lineExtents.every((match) => Number(match[1]) > 0 || Number(match[2]) > 0), true);
    assert.equal((cycleXml.match(/prst="rect"/g) ?? []).length >= 4, true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx decorates pentagon layouts with editable edge accents behind item boxes", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-pentagon-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.layout.slides[0].layout = { preset: "pentagon", direction: "radial" };
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    { id: "item-1", role: "item", blockIds: ["list-1#0"], x: 5.1, y: 1.4, w: 3.0, h: 1.2, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 18, lineHeight: 1.2, minFontSize: 14 } },
    { id: "item-2", role: "item", blockIds: ["list-1#1"], x: 8.4, y: 2.8, w: 3.0, h: 1.2, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 18, lineHeight: 1.2, minFontSize: 14 } },
    { id: "item-3", role: "item", blockIds: ["list-1#2"], x: 7.1, y: 5.0, w: 3.0, h: 1.2, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 18, lineHeight: 1.2, minFontSize: 14 } },
    { id: "item-4", role: "item", blockIds: ["list-1#3"], x: 3.2, y: 5.0, w: 3.0, h: 1.2, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 18, lineHeight: 1.2, minFontSize: 14 } },
    { id: "item-5", role: "item", blockIds: ["list-1#0"], x: 1.9, y: 2.8, w: 3.0, h: 1.2, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 18, lineHeight: 1.2, minFontSize: 14 } },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "technical" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.equal((xml.match(/val="A7F3D0"/g) ?? []).length >= 5, true);
    assert.equal((xml.match(/prst="line"/g) ?? []).length >= 5, true);
    const lineExtents = [
      ...xml.matchAll(/<a:xfrm>[\s\S]{0,320}<a:ext cx="(-?\d+)" cy="(-?\d+)"\/>[\s\S]{0,360}<a:prstGeom prst="line"/g),
    ];
    assert.equal(lineExtents.length >= 5, true);
    assert.equal(lineExtents.every((match) => Number(match[1]) >= 0 && Number(match[2]) >= 0), true);
    assert.equal(lineExtents.every((match) => Number(match[1]) > 0 || Number(match[2]) > 0), true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

function makeDiagramDeck(slides) {
  return {
    presentation: {
      version: "1.0",
      meta: { title: "Diagram Arrangements", language: "en" },
      outline: [],
      assets: [],
      diagnostics: [],
      slides: slides.map((slide, index) => ({
        id: `slide-${index + 1}`,
        index,
        role: "content",
        title: slide.title,
        headingPath: [slide.title],
        source: {},
        intent: "diagram",
        tags: [],
        blocks: [
          {
            id: `diagram-${index + 1}`,
            type: "diagram",
            text: slide.labels.join(" => "),
            diagram: makePipelineDiagram(slide.labels, slide.cycle),
          },
        ],
      })),
    },
    layout: {
      version: "1.0",
      slideSize: sampleDeck.layout.slideSize,
      theme: sampleDeck.layout.theme,
      diagnostics: [],
      slides: slides.map((slide, index) => ({
        id: `layout-slide-${index + 1}`,
        sourceSlideId: `slide-${index + 1}`,
        index,
        layout: { preset: "pipeline", direction: "horizontal" },
        background: { color: "#FFFFFF" },
        overflowPolicy: { action: "shrink", minFontSize: 14, maxShrinkSteps: 3 },
        regions: [
          {
            id: "title",
            role: "title",
            blockIds: [`__title:slide-${index + 1}`],
            x: 0.8,
            y: 0.45,
            w: 11.7,
            h: 0.8,
            zIndex: 10,
            typography: { fontFamily: "Arial", fontSize: 30, fontWeight: "bold", lineHeight: 1.2, minFontSize: 14 },
          },
          {
            id: "diagram",
            role: "diagram",
            blockIds: [`diagram-${index + 1}`],
            x: 1.0,
            y: 1.65,
            w: 11.2,
            h: 4.9,
            zIndex: 10,
            typography: { fontFamily: "Arial", fontSize: 18, lineHeight: 1.2, minFontSize: 14 },
          },
        ],
      })),
    },
  };
}

function makePipelineDiagram(labels, cycle = false) {
  const nodes = labels.map((label, index) => ({ id: `node-${index + 1}`, label }));
  const edges = nodes.slice(0, -1).map((node, index) => ({ from: node.id, to: nodes[index + 1].id }));
  if (cycle && nodes.length > 2) edges.push({ from: nodes[nodes.length - 1].id, to: nodes[0].id });
  return { kind: "pipeline", nodes, edges };
}
