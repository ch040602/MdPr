import test from "node:test";
import assert from "node:assert/strict";
import { defaultConfig, parseMarkdown, planPresentation } from "@mdpresent/core";
import { measureText, planLayout, validateLayoutOverflow } from "../dist/index.js";

test("comparison slides use title, left, and right regions", () => {
  const layout = layoutFor([
    "# Demo",
    "",
    "## Before and After",
    "",
    "- Before",
    "- After",
  ]);

  const slide = layout.slides.find((candidate) => candidate.layout.preset === "comparison");

  assert.ok(slide);
  assert.deepEqual(slide.regions.map((region) => region.id), ["title", "left", "right"]);
  assert.deepEqual(slide.regions.find((region) => region.id === "left").blockIds, ["block-3#0"]);
  assert.deepEqual(slide.regions.find((region) => region.id === "right").blockIds, ["block-3#1"]);
});

test("four primary items use a 2x2 grid with stable item regions", () => {
  const layout = layoutFor([
    "# Demo",
    "",
    "## Capabilities",
    "",
    "- Parse",
    "- Plan",
    "- Render",
    "- Override",
  ]);

  const slide = layout.slides.find((candidate) => candidate.sourceSlideId !== layout.slides[0].sourceSlideId && candidate.layout.preset === "grid");

  assert.equal(slide.layout.columns, 2);
  assert.equal(slide.layout.rows, 2);
  assert.deepEqual(slide.regions.map((region) => region.id), ["title", "item-1", "item-2", "item-3", "item-4"]);
});

test("six primary items use a compact 3x2 grid with stable item regions", () => {
  const layout = layoutFor([
    "# Demo",
    "",
    "## Object Families",
    "",
    "- Text",
    "- Cards",
    "- Tables",
    "- Charts",
    "- Images",
    "- Decoration",
  ]);

  const slide = layout.slides.find((candidate) => candidate.sourceSlideId !== layout.slides[0].sourceSlideId && candidate.layout.preset === "grid");

  assert.equal(slide.layout.columns, 3);
  assert.equal(slide.layout.rows, 2);
  assert.deepEqual(slide.regions.map((region) => region.id), ["title", "item-1", "item-2", "item-3", "item-4", "item-5", "item-6"]);
  assert.equal(slide.regions.find((region) => region.id === "item-1").w < slide.regions.find((region) => region.id === "item-1").h * 2.2, true);
});

test("five primary items use pentagon regions", () => {
  const layout = layoutFor([
    "# Demo",
    "",
    "## Methods",
    "",
    "- One",
    "- Two",
    "- Three",
    "- Four",
    "- Five",
  ]);

  const slide = layout.slides.find((candidate) => candidate.layout.preset === "pentagon");

  assert.ok(slide);
  assert.deepEqual(slide.regions.map((region) => region.id), ["title", "item-1", "item-2", "item-3", "item-4", "item-5"]);
});

test("toc slides allocate each entry as a numbered item region", () => {
  const presentation = planPresentation(parseMarkdown([
    "# Demo",
    "",
    "## First",
    "",
    "Body.",
    "",
    "## Second",
    "",
    "Body.",
    "",
    "## Third",
    "",
    "Body.",
    "",
    "## Fourth",
    "",
    "Body.",
    "",
    "## Fifth",
    "",
    "Body.",
    "",
    "## Sixth",
    "",
    "Body.",
    "",
    "## Seventh",
    "",
    "Body.",
  ].join("\n")), defaultConfig);
  const layout = planLayout(presentation, defaultConfig);
  const toc = layout.slides.find((candidate) => candidate.layout.preset === "toc");
  const items = toc.regions.filter((region) => region.role === "item");

  assert.ok(toc);
  assert.equal(items.length, 7);
  assert.equal(new Set(items.map((region) => region.x.toFixed(2))).size, 2);
  assert.deepEqual(items.map((region) => region.id), [
    "toc-item-1",
    "toc-item-2",
    "toc-item-3",
    "toc-item-4",
    "toc-item-5",
    "toc-item-6",
    "toc-item-7",
  ]);
  assert.equal(items.every((region) => region.typography.fontSize >= defaultConfig.typography.minFontSize), true);
});

test("large generated toc decks split before any toc region leaves slide bounds", () => {
  const lines = ["# Demo", ""];
  for (let index = 1; index <= 23; index++) {
    lines.push(`## Topic ${index}`, "", "Body.", "");
  }
  const presentation = planPresentation(parseMarkdown(lines.join("\n")), defaultConfig);
  const layout = planLayout(presentation, defaultConfig);
  const tocLayouts = layout.slides.filter((slide) => slide.layout.preset === "toc");
  const overflow = validateLayoutOverflow(layout, new Map());

  assert.equal(tocLayouts.length, 2);
  assert.deepEqual(tocLayouts.map((slide) => slide.regions.filter((region) => region.role === "item").length), [14, 9]);
  assert.equal(overflow.some((diagnostic) => diagnostic.code === "LAYOUT_REGION_OUT_OF_BOUNDS"), false);
});

test("dense vertical lists keep all items and distribute them across columns", () => {
  const layout = planLayout({
    version: "1.0",
    meta: { title: "Demo" },
    outline: [],
    assets: [],
    diagnostics: [],
    slides: [
      {
        id: "review-checklist",
        index: 1,
        role: "content",
        title: "Review Checklist",
        headingPath: ["Review Checklist"],
        intent: "list",
        tags: [],
        primaryItemCount: 7,
        density: 7,
        source: { startLine: 1 },
        blocks: [
          {
            id: "block-1",
            type: "bulletList",
            items: [
              "Source parsing",
              "Slide splitting",
              "Layout planning",
              "Theme grammar",
              "Chart pairing",
              "Icon slotting",
              "Overflow checks",
            ],
          },
        ],
      },
    ],
  }, defaultConfig);
  const slide = layout.slides.find((candidate) => candidate.layout.preset === "vertical-list");
  const items = slide.regions.filter((region) => region.role === "item");

  assert.ok(slide);
  assert.equal(items.length, 7);
  assert.equal(new Set(items.map((region) => region.x.toFixed(2))).size, 2);
  assert.deepEqual(items.map((region) => region.blockIds[0]), [
    "block-1#0",
    "block-1#1",
    "block-1#2",
    "block-1#3",
    "block-1#4",
    "block-1#5",
    "block-1#6",
  ]);
});

test("cover slides only allocate a title region", () => {
  const layout = layoutFor([
    "# Demo",
    "",
    "## Topic",
    "",
    "Body text.",
  ]);

  const cover = layout.slides.find((candidate) => candidate.layout.preset === "cover");

  assert.ok(cover);
  assert.deepEqual(cover.regions.map((region) => region.id), ["title"]);
  assert.equal(cover.regions[0].role, "title");
});

test("item layouts use primary list items when prose precedes the list", () => {
  const layout = layoutFor([
    "# Demo",
    "",
    "## Semantic Blocks",
    "",
    "The parser preserves presentation-relevant Markdown structure.",
    "",
    "- Lists: ordered and unordered lists keep numbering.",
    "- Cleanup: decorative empty bullet lines are removed.",
    "- Emphasis: **bold** and *italic* are preserved.",
    "- Line breaks: paragraph units are kept.",
  ]);

  const slide = layout.slides.find((candidate) => candidate.layout.preset === "grid");

  assert.ok(slide);
  assert.deepEqual(slide.regions.filter((region) => region.role === "item").map((region) => region.blockIds[0]), [
    "block-4#0",
    "block-4#1",
    "block-4#2",
    "block-4#3",
  ]);
});

test("pipeline diagram slides use a dedicated diagram region", () => {
  const layout = layoutFor([
    "# Demo",
    "",
    "## Pipeline",
    "",
    "Draft => Review => Render => Validate",
  ]);

  const slide = layout.slides.find((candidate) => candidate.layout.preset === "pipeline");

  assert.ok(slide);
  assert.deepEqual(slide.regions.map((region) => region.id), ["title", "diagram"]);
  assert.deepEqual(slide.regions.find((region) => region.id === "diagram").blockIds, ["block-3"]);
});

test("pipeline diagram regions use most of the slide body area", () => {
  const layout = layoutFor([
    "# Demo",
    "",
    "## Pipeline",
    "",
    "Draft => Review => Render => Validate",
  ]);

  const slide = layout.slides.find((candidate) => candidate.layout.preset === "pipeline");
  const diagram = slide.regions.find((region) => region.id === "diagram");

  assert.ok(diagram);
  assert.equal(diagram.y <= 1.45, true);
  assert.equal(diagram.h >= 5.2, true);
  assert.equal(diagram.w >= 11.6, true);
});

test("graph detail content stays with the diagram when it fits on one slide", () => {
  const presentation = planPresentation(parseMarkdown([
    "# Demo",
    "",
    "## Pipeline",
    "",
    "Draft => Review => Render => Validate",
    "",
    "- Draft: Source notes",
    "- Review: Check quality",
  ].join("\n")), defaultConfig);
  const layout = planLayout(presentation, defaultConfig);
  const contentSlides = presentation.slides.filter((slide) => slide.role === "content");
  const graphLayout = layout.slides.find((slide) => slide.sourceSlideId === contentSlides[0].id);

  assert.deepEqual(contentSlides.map((slide) => slide.blocks.map((block) => block.type)), [["diagram", "bulletList"]]);
  assert.equal(graphLayout.layout.preset, "pipeline");
  assert.equal(contentSlides.length, 1);
});

test("paragraph-heavy continuation chunks use open two-column structure", () => {
  const presentation = planPresentation(parseMarkdown([
    "# Demo",
    "",
    "## Design Presets",
    "",
    "`--design` and `theme.designPreset` use one shared catalog across PPTX and HTML. Current presets include plain, clean, executive, editorial, technical, dark, nord, solarized, dracula, tableau, gruvbox, monokai, material, and tokyo-night.",
    "",
    "For visual QA, `--theme-gallery executive,nord,dracula,solarized` repeats the planned slides under multiple design presets in one PPTX.",
    "",
    "Separated key messages, ordered item cards, and label/detail list items inherit the active preset's accent colors. PPTX output keeps these as editable text, shapes, one-sided accent lines, and number badges rather than flattened images.",
    "",
    "Cover/title slides use preset-specific editable templates. Theme-gallery output shows multiple title candidates, while `--design <preset>` renders only that preset's title treatment.",
  ].join("\n")), defaultConfig);
  const layout = planLayout(presentation, defaultConfig);
  const designSlides = presentation.slides.filter((slide) => slide.title.startsWith("Design Presets"));
  const designLayouts = layout.slides.filter((slide) => designSlides.some((sourceSlide) => sourceSlide.id === slide.sourceSlideId));

  assert.deepEqual(designLayouts.map((slide) => slide.layout.preset), ["comparison", "comparison"]);
  assert.deepEqual(designLayouts[0].regions.map((region) => region.id), ["title", "left", "right"]);
  assert.deepEqual(designLayouts[0].regions.filter((region) => region.role === "body").map((region) => region.blockIds.length), [1, 1]);
});

test("quoted key sentences are separated from supporting body text", () => {
  const layout = layoutFor([
    "# Demo",
    "",
    "## Decision",
    "",
    "> Keep the Markdown source authoritative.",
    "",
    "Supporting detail stays below the key sentence.",
  ]);

  const slide = layout.slides.find((candidate) => candidate.layout.preset === "key-message");

  assert.ok(slide);
  assert.deepEqual(slide.regions.map((region) => region.id), ["title", "key-message", "body"]);
  assert.equal(slide.regions.find((region) => region.id === "key-message").typography.fontWeight, "bold");
  assert.equal(slide.regions.find((region) => region.id === "key-message").y < slide.regions.find((region) => region.id === "body").y, true);
});

test("code-focus slides use a dedicated code region with compact typography", () => {
  const layout = layoutFor([
    "# Demo",
    "",
    "## Quick Usage",
    "",
    "```bash",
    "mdpresent inspect examples/basic/deck.md --json > deck.plan.json",
    "mdpresent validate examples/basic/deck.md --override examples/basic/deck.override.yaml",
    "```",
  ]);

  const slide = layout.slides.find((candidate) => candidate.layout.preset === "code-focus");
  const code = slide.regions.find((region) => region.id === "code");

  assert.ok(code);
  assert.equal(code.role, "code");
  assert.equal(code.typography.fontSize <= layout.theme.captionFontSize, true);
});

test("mixed text and image slides use separate body and image regions", () => {
  const layout = layoutFor([
    "# Demo",
    "",
    "## Illustrated Point",
    "",
    "- Finding: Important detail",
    "- Evidence: Visual support",
    "",
    "![Architecture](examples/basic/architecture.png)",
  ]);

  const slide = layout.slides.find((candidate) => candidate.sourceSlideId !== layout.slides[0].sourceSlideId && candidate.layout.preset === "image-focus");

  assert.ok(slide);
  assert.deepEqual(slide.regions.map((region) => region.id), ["title", "body", "image-1"]);
  assert.equal(slide.regions.find((region) => region.id === "body").role, "body");
  assert.equal(slide.regions.find((region) => region.id === "image-1").role, "image");
  assert.equal(slide.regions.find((region) => region.id === "body").x < slide.regions.find((region) => region.id === "image-1").x, true);
});

test("chart-table slides reserve enough width for native tables beside charts", () => {
  const layout = layoutFor([
    "# Demo",
    "",
    "## Chart And Table",
    "",
    "```chart",
    "labels: Core, Layout, PPTX",
    "Rules: 18, 14, 22",
    "```",
    "",
    "| Area | MDPR-owned behavior | Skill-owned behavior |",
    "| --- | --- | --- |",
    "| Theme | Adobe-style color combination | Suggest emphasis only |",
  ]);
  const slide = layout.slides.find((candidate) => candidate.layout.preset === "chart-table");
  const chart = slide.regions.find((region) => region.id === "chart");
  const table = slide.regions.find((region) => region.id === "table");

  assert.ok(chart);
  assert.ok(table);
  assert.equal(table.w > chart.w, true);
  assert.equal(table.w >= 6, true);
  assert.equal(table.x > chart.x + chart.w, true);
});

test("table-focus slides expose a table role region for native table rendering and decoration", () => {
  const layout = layoutFor([
    "# Demo",
    "",
    "## Table Coherence",
    "",
    "| Object | Signal |",
    "| --- | --- |",
    "| Text box | bounded |",
    "| Table | padded |",
  ]);
  const slide = layout.slides.find((candidate) => candidate.layout.preset === "table-focus");
  const table = slide.regions.find((region) => region.role === "table");

  assert.ok(table);
  assert.equal(table.id, "table");
  assert.equal(table.blockIds.length, 1);
  assert.match(table.blockIds[0], /^block-\d+$/);
  assert.equal(table.w >= 10.8, true);
  assert.equal(table.h >= 4.5, true);
});

test("chart slides with prose keep the graph and explanation in parallel", () => {
  const layout = layoutFor([
    "# Demo",
    "",
    "## Numeric Signal",
    "",
    "The score improved after layout constraints were applied. The prose should remain beside the graph so the numeric evidence and interpretation are read together.",
    "",
    "```chart",
    "labels: Parser, Layout, PPTX",
    "Score: 72, 84, 91",
    "```",
  ]);
  const slide = layout.slides.find((candidate) => candidate.layout.preset === "chart-table");
  const body = slide.regions.find((region) => region.id === "body");
  const chart = slide.regions.find((region) => region.id === "chart");

  assert.ok(body);
  assert.ok(chart);
  assert.equal(body.x < chart.x, true);
  assert.equal(chart.x > body.x + body.w, true);
  assert.equal(Math.abs(body.y - chart.y) <= 0.25, true);
  assert.equal(body.h >= 3.9, true);
  assert.equal(chart.w > body.w, true);
});

test("text-only relief slides use a body panel and separate icon aside", () => {
  const layout = layoutFor([
    "# Demo",
    "",
    "## Text Only Relief",
    "",
    "Long text-only slides should not become plain prose walls. MDPR can add a restrained black or white icon aside, keep it secondary, and preserve enough breathing room around the copy.",
  ]);
  const slide = layout.slides.find((candidate) => candidate.layout.preset === "text-icon-aside");
  const body = slide.regions.find((region) => region.id === "body-panel");
  const icon = slide.regions.find((region) => region.id === "icon-aside");

  assert.ok(body);
  assert.ok(icon);
  assert.equal(body.w > icon.w, true);
  assert.equal(icon.x > body.x + body.w, true);
  assert.equal(body.typography.fontSize >= defaultConfig.typography.bodyFontSize, true);
});

test("overflow validation emits errors when policy is fail", () => {
  const diagnostics = validateLayoutOverflow({
    version: "1.0",
    slideSize: { width: 10, height: 5, unit: "in" },
    theme: {
      fontFamily: "Arial",
      backgroundColor: "#fff",
      textColor: "#111",
      primaryColor: "#2563eb",
      titleFontSize: 34,
      bodyFontSize: 30,
      captionFontSize: 14,
      minFontSize: 18,
      lineHeight: 1.2,
    },
    slides: [
      {
        id: "layout-slide-1",
        sourceSlideId: "slide-1",
        index: 1,
        layout: { preset: "title-body" },
        background: { color: "#fff" },
        regions: [
          {
            id: "body",
            role: "body",
            blockIds: ["block-1"],
            x: 9,
            y: 4.8,
            w: 2,
            h: 0.2,
            zIndex: 1,
            typography: { fontSize: 12, minFontSize: 18, lineHeight: 1.2 },
          },
        ],
        overflowPolicy: { action: "fail", minFontSize: 18, maxShrinkSteps: 0 },
      },
    ],
    diagnostics: [],
  }, new Map([
    ["block-1", "This is a long line of text that cannot fit inside a very short region."],
  ]));

  assert.deepEqual(diagnostics.map((diagnostic) => [diagnostic.level, diagnostic.code]), [
    ["error", "LAYOUT_REGION_OUT_OF_BOUNDS"],
    ["error", "LAYOUT_MIN_FONT_SIZE_VIOLATION"],
    ["error", "TEXT_OVERFLOW"],
  ]);
});

test("measureText treats CJK text as wider than ASCII for wrapping estimates", () => {
  const common = { fontFamily: "Arial", fontSize: 20, fontWeight: "normal", width: 1, lineHeight: 1.2 };
  const ascii = measureText({ ...common, text: "a".repeat(20) }, 10);
  const cjk = measureText({ ...common, text: "가".repeat(20) }, 10);

  assert.equal(cjk.lines > ascii.lines, true);
});

function layoutFor(lines) {
  const presentation = planPresentation(parseMarkdown(lines.join("\n")), defaultConfig);
  return planLayout(presentation, defaultConfig);
}
