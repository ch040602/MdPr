import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultConfig, parseMarkdown, planPresentation } from "@mdpresent/core";
import { geometrySignatureForSpec, layoutPresets, measureText, planLayout, rankLayoutCandidates, validateLayoutOverflow, visibleGeometrySignature } from "../dist/index.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");

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

test("layout preset schemas stay aligned with runtime presets", () => {
  const schemaPaths = [
    "schemas/config.schema.json",
    "schemas/override.schema.json",
    "schemas/layout-ir.schema.json",
  ];

  for (const schemaPath of schemaPaths) {
    const schema = JSON.parse(readFileSync(resolve(repoRoot, schemaPath), "utf-8"));
    assert.deepEqual([...schema.$defs.layoutPreset.enum].sort(), [...layoutPresets].sort(), schemaPath);
  }
});

test("four equal grid-intent items retain a stable 2x2 default", () => {
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

test("repeated 2x2 history selects an equal-weight horizontal quartet", () => {
  const presentation = planPresentation(parseMarkdown([
    "# Demo",
    "",
    "## Four choices",
    "",
    "- Alpha",
    "- Beta",
    "- Gamma",
    "- Delta",
  ].join("\n")), defaultConfig);
  const slide = presentation.slides.find((candidate) => candidate.title === "Four choices");
  assert.equal(slide.intent, "grid");
  const ranked = rankLayoutCandidates(slide, defaultConfig, undefined, undefined, ["card-grid-2x2", "card-grid-2x2"]);

  assert.equal(ranked[0].layout.preset, "grid");
  assert.equal(ranked[0].layout.columns, 4);
  assert.equal(ranked[0].layout.rows, 1);
  assert.equal(ranked[0].layout.variant, "horizontal-quartet");
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
  assert.deepEqual(tocLayouts.map((slide) => slide.regions.filter((region) => region.role === "item").length), [12, 11]);
  assert.equal(tocLayouts.every((slide) => slide.regions.every((region) => region.typography.fontSize >= 16 && region.typography.minFontSize >= 16)), true);
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

test("pipeline-one-page uses a CHI-style hero diagram with overview and evidence rail", () => {
  const config = structuredClone(defaultConfig);
  config.deck.presentationMode = "pipeline-one-page";
  const presentation = planPresentation(parseMarkdown([
    "# Research System",
    "",
    "## Runtime Pipeline",
    "",
    "Collect => Model => Explain => Deploy",
    "",
    "## Contribution",
    "",
    "- Human-guided modeling for ambiguous design evidence.",
    "- Deterministic output checks for generated artifacts.",
    "",
    "## Evaluation",
    "",
    "```chart",
    "labels: Accuracy, Coverage, Trust",
    "Score: 81, 88, 76",
    "```",
    "",
    "## Boundary",
    "",
    "| Layer | Owned by runtime |",
    "| --- | --- |",
    "| Layout | coordinates and regions |",
  ].join("\n")), config);
  const layout = planLayout(presentation, config);
  const slide = layout.slides[0];
  const diagram = slide.regions.find((region) => region.id === "diagram");
  const overview = slide.regions.find((region) => region.id === "feature-summary");
  const chart = slide.regions.find((region) => region.id === "chart");
  const table = slide.regions.find((region) => region.id === "table");

  assert.deepEqual(slide.regions.map((region) => region.id), ["title", "diagram", "feature-summary", "chart", "table"]);
  assert.ok(diagram);
  assert.ok(overview);
  assert.ok(chart);
  assert.ok(table);
  assert.equal(diagram.w >= 7.2, true);
  assert.equal(diagram.h >= 2.3, true);
  assert.equal(overview.y > diagram.y + diagram.h, true);
  assert.equal(overview.blockIds[0].endsWith("-teaser-overview"), true);
  assert.equal(overview.typography.fontSize >= 16, true);
  assert.equal(overview.typography.minFontSize >= 16, true);
  assert.equal(chart.x > diagram.x + diagram.w, true);
  assert.equal(table.x, chart.x);
  assert.equal(table.y > chart.y + chart.h, true);
  assert.equal(table.typography.fontSize >= 16, true);
  assert.equal(table.typography.minFontSize >= 16, true);
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
    "`--design` and `theme.designPreset` use one shared catalog across PPTX and HTML. Current presets include plain, clean, executive, technical, dark, nord, solarized, dracula, tableau, gruvbox, monokai, material, and tokyo-night.",
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

test("code-focus slides use a dedicated code region without a sub-16pt exception", () => {
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
  assert.equal(code.h < 2.5, true, `sparse code should not occupy a ${code.h}in fixed-height panel`);
  assert.equal(code.y > 2.4, true, `sparse code should be vertically balanced, got y=${code.y}`);
  assert.equal(code.typography.fontSize >= 16, true);
  assert.equal(code.typography.minFontSize >= 16, true);
  assert.equal(layout.theme.captionFontSize >= 16, true);
});

test("code-focus slides keep dense code inside the bounded full-height region", () => {
  const denseCode = Array.from({ length: 30 }, (_, index) => `const value${index} = ${index};`).join("\n");
  const layout = layoutFor([
    "# Demo",
    "",
    "## Dense Usage",
    "",
    "```js",
    denseCode,
    "```",
  ]);

  const slide = layout.slides.find((candidate) => candidate.layout.preset === "code-focus");
  const code = slide.regions.find((region) => region.id === "code");

  assert.ok(code);
  assert.equal(code.y, 1.55);
  assert.equal(code.h, 5.25);
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

test("chart-table slides with images keep chart table body and image in separate bounded regions", () => {
  const layout = layoutFor([
    "# Demo",
    "",
    "## Mixed Evidence",
    "",
    "- Reading order: chart and table first",
    "- Image role: bounded visual evidence",
    "",
    "```chart",
    "labels: Parse, Plan, Render",
    "Score: 78, 86, 93",
    "```",
    "",
    "| Object | Signal |",
    "| --- | --- |",
    "| Chart | trend |",
    "| Image | bounded |",
    "",
    "![Safe frame diagram](examples/theme-preview-en/assets/safe-frame.svg)",
  ]);
  const slide = layout.slides.find((candidate) => candidate.layout.preset === "chart-table");
  const chart = slide.regions.find((region) => region.id === "chart");
  const table = slide.regions.find((region) => region.id === "table");
  const body = slide.regions.find((region) => region.id === "body");
  const image = slide.regions.find((region) => region.id === "image-1");

  assert.ok(chart);
  assert.ok(table);
  assert.ok(body);
  assert.ok(image);
  assert.equal(image.role, "image");
  assert.equal(image.blockIds.length, 1);
  assert.equal(body.blockIds.every((blockId) => !image.blockIds.includes(blockId)), true);
  assert.equal(image.x > body.x + body.w, true);
  assert.equal(image.y > table.y + table.h, true);
});

test("layout candidate scoring ranks mixed evidence coverage above single-object focus", () => {
  const presentation = planPresentation(parseMarkdown([
    "# Demo",
    "",
    "## Mixed Evidence",
    "",
    "- Awareness: 80%",
    "- Activation: 40%",
    "",
    "```chart",
    "labels: Awareness, Activation",
    "Users: 8000, 4000",
    "```",
    "",
    "| Stage | Users |",
    "| --- | ---: |",
    "| Awareness | 8000 |",
    "| Activation | 4000 |",
    "",
    "![funnel](funnel.png)",
  ].join("\n")), defaultConfig);
  const slide = presentation.slides.find((candidate) => candidate.title === "Mixed Evidence");
  const ranked = rankLayoutCandidates(slide, defaultConfig);

  assert.equal(ranked.length >= 3, true);
  assert.equal(ranked[0].layout.preset, "chart-table");
  assert.equal(ranked[0].score.objectCoveragePenalty, 0);
  assert.equal(ranked[0].score.total < ranked.find((candidate) => candidate.layout.preset === "table-focus").score.total, true);
});

test("layout candidate scoring uses coherence group semantics and section continuity", () => {
  const config = structuredClone(defaultConfig);
  config.toc.enabled = false;
  const presentation = planPresentation(parseMarkdown([
    "# Demo",
    "",
    "## Figure Evidence",
    "",
    "The preview shows bounded output.",
    "",
    "![Preview](preview.png)",
    "",
    "Figure: generated slide preview.",
  ].join("\n")), config);
  const slide = presentation.slides.find((candidate) => candidate.title === "Figure Evidence");
  const group = presentation.coherenceGroups.find((candidate) => candidate.slideId === slide.id);
  const ranked = rankLayoutCandidates(slide, config, group, "table-focus");
  const imageFocus = ranked.find((candidate) => candidate.layout.preset === "image-focus");
  const verticalList = ranked.find((candidate) => candidate.layout.preset === "vertical-list");

  assert.ok(imageFocus);
  assert.ok(verticalList);
  assert.equal(verticalList.score.semanticGroupPenalty > 0, true);
  assert.equal(imageFocus.score.semanticGroupPenalty, 0);
  assert.equal(imageFocus.score.sectionConsistencyPenalty > 0, true);
  assert.equal(ranked[0].layout.preset, "image-focus");
});

test("section continuity prefers same-family alternation over exact preset repetition", () => {
  const presentation = planPresentation(parseMarkdown([
    "# Demo",
    "",
    "## Four related choices",
    "",
    "- Alpha",
    "- Beta",
    "- Gamma",
    "- Delta",
  ].join("\n")), defaultConfig);
  const slide = presentation.slides.find((candidate) => candidate.title === "Four related choices");
  const ranked = rankLayoutCandidates(slide, defaultConfig, undefined, "grid");
  const repeatedGrid = ranked.find((candidate) => candidate.layout.preset === "grid");
  const sameFamilyAlternative = ranked.find((candidate) => candidate.layout.preset === "vertical-list");

  assert.ok(repeatedGrid);
  assert.ok(sameFamilyAlternative);
  assert.equal(repeatedGrid.score.sectionConsistencyPenalty > sameFamilyAlternative.score.sectionConsistencyPenalty, true);
});

test("deck-wide geometry history breaks 2x2 grid saturation across section resets", () => {
  const presentation = {
    version: "1.0",
    meta: { title: "Geometry diversity" },
    outline: [],
    assets: [],
    diagnostics: [],
    coherenceGroups: [],
    slides: Array.from({ length: 10 }, (_, index) => ({
      id: `slide-${index + 1}`,
      index,
      role: "content",
      title: `Section ${index + 1}`,
      section: `section-${index + 1}`,
      headingPath: [`Section ${index + 1}`],
      source: {},
      intent: "standard",
      tags: [],
      primaryItemCount: 4,
      blocks: [{
        id: `list-${index + 1}`,
        type: "bulletList",
        items: ["Alpha", "Beta", "Gamma", "Delta"],
      }],
    })),
  };

  const layout = planLayout(presentation, defaultConfig);
  const geometries = layout.slides.map((slide) => {
    if (slide.layout.preset === "grid" && slide.layout.columns === 2 && slide.layout.rows === 2) return "card-grid-2x2";
    if (slide.layout.preset === "vertical-list") return "vertical-stack";
    return slide.layout.preset;
  });
  const dominantCount = Math.max(...[...new Set(geometries)].map((geometry) => geometries.filter((candidate) => candidate === geometry).length));
  const maxSameInFive = Math.max(...geometries.slice(4).map((_, endOffset) => {
    const window = geometries.slice(endOffset, endOffset + 5);
    return Math.max(...[...new Set(window)].map((geometry) => window.filter((candidate) => candidate === geometry).length));
  }));

  assert.equal(dominantCount / geometries.length <= 0.6, true);
  assert.equal(maxSameInFive <= 3, true);
});

test("three-item slides alternate horizontal triptychs with vertical stacks", () => {
  const presentation = {
    version: "1.0",
    meta: { title: "Three-item geometry diversity" },
    outline: [],
    assets: [],
    diagnostics: [],
    coherenceGroups: [],
    slides: Array.from({ length: 8 }, (_, index) => ({
      id: `triptych-${index + 1}`,
      index,
      role: "content",
      title: `Three choices ${index + 1}`,
      section: `section-${index + 1}`,
      headingPath: [`Three choices ${index + 1}`],
      source: {},
      intent: "standard",
      tags: [],
      primaryItemCount: 3,
      blocks: [{ id: `list-${index + 1}`, type: "bulletList", items: ["Alpha", "Beta", "Gamma"] }],
    })),
  };

  const layout = planLayout(presentation, defaultConfig);
  const signatures = layout.slides.map(visibleGeometrySignature);

  assert.equal(signatures[0], "card-row-3");
  assert.equal(signatures.includes("card-row-3"), true);
  assert.equal(signatures.includes("vertical-stack"), true);
  for (const slide of layout.slides) {
    const itemRegions = slide.regions.filter((region) => region.role === "item");
    if (!itemRegions.length) continue;
    assert.deepEqual(itemRegions.flatMap((region) => region.blockIds), ["list-" + (slide.index + 1) + "#0", "list-" + (slide.index + 1) + "#1", "list-" + (slide.index + 1) + "#2"]);
    assert.equal(itemRegions.every((region) => region.typography.minFontSize >= 16), true);
  }
});

test("horizontal triptych and quartet specs expose named visible geometry", () => {
  assert.equal(geometrySignatureForSpec({ preset: "vertical-list", variant: "horizontal-triptych", columns: 3, rows: 1, direction: "horizontal" }), "card-row-3");
  assert.equal(geometrySignatureForSpec({ preset: "grid", variant: "horizontal-quartet", columns: 4, rows: 1, direction: "horizontal" }), "card-row-4");
});

test("deck-wide geometry diversity never displaces specialized object layouts", () => {
  const objectSlides = [
    { intent: "table", block: { id: "table", type: "table", rows: [["A"], ["B"]] }, preset: "table-focus" },
    { intent: "image", block: { id: "image", type: "image", src: "figure.png", alt: "Figure" }, preset: "image-focus" },
    { intent: "code", block: { id: "code", type: "code", text: "const value = 1;", language: "js" }, preset: "code-focus" },
    { intent: "diagram", block: { id: "diagram", type: "diagram", text: "A -> B" }, preset: "pipeline" },
  ];
  const presentation = {
    version: "1.0",
    meta: { title: "Specialized objects" },
    outline: [],
    assets: [],
    diagnostics: [],
    coherenceGroups: [],
    slides: objectSlides.flatMap((entry, pair) => [0, 1].map((copy) => ({
      id: `${entry.intent}-${copy}`,
      index: pair * 2 + copy,
      role: "content",
      title: `${entry.intent} ${copy}`,
      section: `${entry.intent}-${copy}`,
      headingPath: [`${entry.intent} ${copy}`],
      source: {},
      intent: entry.intent,
      tags: [],
      primaryItemCount: 0,
      blocks: [{ ...entry.block, id: `${entry.block.id}-${copy}` }],
    }))),
  };

  const layout = planLayout(presentation, defaultConfig);
  assert.deepEqual(layout.slides.map((slide) => slide.layout.preset), objectSlides.flatMap((entry) => [entry.preset, entry.preset]));
});

test("neutral inventory keywords use split geometry without semantic comparison chrome", () => {
  const neutralSlide = {
    id: "example-inventory",
    index: 0,
    role: "content",
    title: "Example decks from MDPR",
    headingPath: ["Example decks from MDPR"],
    source: {},
    intent: "comparison",
    tags: [],
    primaryItemCount: 5,
    blocks: [{
      id: "inventory-list",
      type: "bulletList",
      items: [
        "basic/deck.md covers core flow and expected effects.",
        "comparison/deck.md exercises before/after content.",
        "pipeline/deck.md exercises diagram conversion.",
        "diagram-arrangements/deck.md exercises multiple diagram structures.",
        "theme-preview decks exercise preset variety.",
      ],
    }],
  };
  const layout = planLayout({
    version: "1.0",
    meta: { title: "Neutral inventory" },
    outline: [],
    assets: [],
    diagnostics: [],
    coherenceGroups: [],
    slides: [neutralSlide],
  }, defaultConfig).slides[0];

  assert.equal(layout.layout.preset, "comparison");
  assert.equal(layout.layout.variant, "neutral-split");
  const columns = layout.regions.filter((region) => region.role === "body");
  assert.equal(columns.length, 2);
  assert.equal(columns[0].y, columns[1].y);
  assert.equal(columns[0].y <= 1.5, true);
  assert.deepEqual(columns.flatMap((region) => region.blockIds), [
    "inventory-list#0",
    "inventory-list#1",
    "inventory-list#2",
    "inventory-list#3",
    "inventory-list#4",
  ]);

  const explicit = structuredClone(neutralSlide);
  explicit.id = "explicit-comparison";
  explicit.title = "Before and After";
  explicit.blocks[0].id = "comparison-list";
  explicit.blocks[0].items = ["Before: manual notes", "After: automated drafts"];
  explicit.primaryItemCount = 2;
  const explicitLayout = planLayout({
    version: "1.0",
    meta: { title: "Explicit comparison" },
    outline: [],
    assets: [],
    diagnostics: [],
    coherenceGroups: [],
    slides: [explicit],
  }, defaultConfig).slides[0];
  assert.equal(explicitLayout.layout.preset, "comparison");
  assert.notEqual(explicitLayout.layout.variant, "neutral-split");
});

test("conference profile scoring gives dense technical prose split-text relief", () => {
  const denseText = "Long standards prose should remain readable through hierarchy, line breaks, and separated argument columns. ".repeat(10);
  const slide = {
    id: "slide-dense",
    index: 1,
    role: "content",
    title: "Dense Technical Notes",
    headingPath: ["Dense Technical Notes"],
    source: {},
    intent: "standard",
    tags: [],
    primaryItemCount: 0,
    blocks: [{
      id: "paragraph-1",
      type: "paragraph",
      text: denseText,
      lines: ["Main claim", "Supporting detail", "Nested caveat"],
      lineIndents: [0, 1, 2],
    }],
  };
  const ranked = rankLayoutCandidates(slide, defaultConfig);
  const comparison = ranked.find((candidate) => candidate.layout.preset === "comparison");

  assert.equal(ranked[0].layout.preset, "text-icon-aside");
  assert.ok(comparison);
  assert.equal(comparison.score.conferenceProfilePenalty >= 3, true);
  assert.equal(ranked[0].score.conferenceProfilePenalty, 0);
});

test("indented dense prose uses full-width compact body relief instead of half-width columns", () => {
  const layout = layoutFor([
    "# Demo",
    "",
    "## Scope and assumptions",
    "",
    "The top-level claim describes the decision boundary and must remain readable even when the prose is long enough to resemble standards notes.",
    "  The parser should keep this supporting line as a second visual level rather than squeezing it into a narrow column.",
    "    The deepest caveat should survive as a nested prose line without overprinting the previous line.",
  ]);
  const slide = layout.slides.find((candidate) => candidate.layout.preset === "text-icon-aside");
  const body = slide.regions.find((region) => region.id === "body-panel");

  assert.ok(body);
  assert.equal(body.w >= 11, true);
  assert.equal(body.h >= 5, true);
  assert.equal(body.typography.fontSize <= 18, true);
  assert.equal(slide.regions.some((region) => region.role === "icon"), false);
});

test("neutral claim slides promote source claim text to key-message layout", () => {
  const layout = layoutFor([
    "# Demo",
    "",
    "## Motivation",
    "",
    "Claim: Dense technical decks should show the main message before supporting prose.",
  ]);
  const slide = layout.slides.find((candidate) => candidate.layout.preset === "key-message");
  const message = slide.regions.find((region) => region.id === "key-message");

  assert.ok(slide);
  assert.ok(message);
  assert.equal(message.blockIds.length, 1);
  assert.equal(message.typography.fontWeight, "bold");
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

test("table-focus slides reserve a visible message band for source claims", () => {
  const layout = layoutFor([
    "# Demo",
    "",
    "## Results",
    "",
    "Claim: Table evidence should lead with the source claim before the detailed rows.",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    "| Coverage | 94 |",
    "| Warnings | 0 |",
  ]);
  const slide = layout.slides.find((candidate) => candidate.layout.preset === "table-focus");
  const message = slide.regions.find((region) => region.id === "key-message");
  const table = slide.regions.find((region) => region.role === "table");

  assert.ok(message);
  assert.ok(table);
  assert.equal(message.blockIds.length, 1);
  assert.equal(message.typography.fontWeight, "bold");
  assert.equal(message.y < table.y, true);
  assert.equal(table.h >= 4, true);
});

test("every mixed marker fixture block is routed to a layout region", () => {
  const markdown = readFileSync(resolve(repoRoot, "tests/fixtures/bridge-paragraph-marker-edge.md"), "utf-8");
  const presentation = planPresentation(parseMarkdown(markdown), defaultConfig);
  const layout = planLayout(presentation, defaultConfig);

  for (const sourceSlide of presentation.slides) {
    const layoutSlide = layout.slides.find((candidate) => candidate.sourceSlideId === sourceSlide.id);
    assert.ok(layoutSlide, `missing layout for ${sourceSlide.id}`);

    const expectedBlockIds = sourceSlide.blocks
      .filter((block) => block.type !== "slideBreak")
      .map((block) => block.id)
      .sort();
    const routedBlockIds = new Set(layoutSlide.regions
      .flatMap((region) => region.blockIds)
      .map((blockId) => blockId.replace(/#\d+$/, "")));
    const missingBlockIds = expectedBlockIds.filter((blockId) => !routedBlockIds.has(blockId));

    assert.deepEqual(missingBlockIds, [], `${sourceSlide.title} contains unrouted source blocks`);
  }
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

test("text-only relief slides use a wide body panel without source-neutral icons", () => {
  const layout = layoutFor([
    "# Demo",
    "",
    "## Text Only Relief",
    "",
    "Long technical notes often contain context, definitions, constraints, and caveats in one compact section. The layout uses a broad body panel with steady line length and calm spacing for repeated reading.",
  ]);
  const slide = layout.slides.find((candidate) => candidate.layout.preset === "text-icon-aside");
  const body = slide.regions.find((region) => region.id === "body-panel");
  const icon = slide.regions.find((region) => region.id === "icon-aside");

  assert.ok(body);
  assert.equal(icon, undefined);
  assert.equal(body.w >= 10.8, true);
  assert.equal(body.typography.fontSize >= defaultConfig.typography.bodyFontSize, true);
});

test("text-only relief slides keep an icon aside only with explicit source evidence", () => {
  const layout = layoutFor([
    "# Demo",
    "",
    "## Text Only Relief",
    "",
    "Icon: shield. Long technical notes contain context, definitions, constraints, and caveats in one compact section. The explicit icon marker reserves a secondary icon slot.",
  ]);
  const slide = layout.slides.find((candidate) => candidate.layout.preset === "text-icon-aside");
  const body = slide.regions.find((region) => region.id === "body-panel");
  const icon = slide.regions.find((region) => region.id === "icon-aside");

  assert.ok(body);
  assert.ok(icon);
  assert.equal(body.w < 10, true);
  assert.equal(icon.x > body.x + body.w, true);
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

test("overflow validation flags dense text that fits only without readable breathing room", () => {
  const diagnostics = validateLayoutOverflow({
    version: "1.0",
    slideSize: { width: 13.333, height: 7.5, unit: "in" },
    theme: {
      fontFamily: "Pretendard",
      backgroundColor: "#fff",
      textColor: "#111",
      primaryColor: "#2563eb",
      titleFontSize: 34,
      bodyFontSize: 20,
      captionFontSize: 14,
      minFontSize: 16,
      lineHeight: 1.2,
    },
    slides: [
      {
        id: "layout-slide-dense-fit",
        sourceSlideId: "slide-dense-fit",
        index: 1,
        layout: { preset: "comparison" },
        background: { color: "#fff" },
        regions: [
          {
            id: "left",
            role: "body",
            blockIds: ["block-1"],
            x: 0.9,
            y: 1.7,
            w: 5.4,
            h: 2.02,
            zIndex: 1,
            typography: { fontSize: 20, minFontSize: 16, lineHeight: 1.2 },
          },
        ],
        overflowPolicy: { action: "warn", minFontSize: 16, maxShrinkSteps: 3 },
      },
    ],
    diagnostics: [],
  }, new Map([
    ["block-1", [
      "Main claim line.",
      "Supporting detail line.",
      "Nested caveat line.",
      "Second claim line.",
      "Second supporting line.",
      "Second nested caveat.",
    ].join("\n")],
  ]));

  const risk = diagnostics.find((diagnostic) => diagnostic.code === "DENSE_TEXT_FIT_RISK");

  assert.ok(risk);
  assert.equal(risk.level, "warning");
  assert.equal(risk.details.fitRatio > 0.95, true);
  assert.equal(risk.details.sourcePreserved, true);
  assert.equal(risk.details.rewriteApplied, false);
});

test("overflow validation preserves CJK source evidence without rewrite decisions", () => {
  const text = "한국어문장과日本語文章그리고中文句子를공백없이혼합해도원문을줄이거나삭제하지않고측정근거로남긴다".repeat(2);
  const diagnostics = validateLayoutOverflow({
    version: "1.0",
    slideSize: { width: 10, height: 5, unit: "in" },
    theme: {
      fontFamily: "Pretendard",
      backgroundColor: "#fff",
      textColor: "#111",
      primaryColor: "#2563eb",
      titleFontSize: 34,
      bodyFontSize: 18,
      captionFontSize: 14,
      minFontSize: 10,
      lineHeight: 1.2,
    },
    slides: [
      {
        id: "layout-cjk",
        sourceSlideId: "slide-cjk",
        index: 0,
        layout: { preset: "title-body" },
        background: { color: "#fff" },
        regions: [
          {
            id: "body",
            role: "body",
            blockIds: ["block-cjk"],
            x: 0.8,
            y: 1,
            w: 1.4,
            h: 0.3,
            zIndex: 1,
            typography: { fontSize: 18, minFontSize: 10, lineHeight: 1.2 },
          },
        ],
        overflowPolicy: { action: "fail", minFontSize: 10, maxShrinkSteps: 0 },
      },
    ],
    diagnostics: [],
  }, new Map([["block-cjk", text]]));
  const overflow = diagnostics.find((diagnostic) => diagnostic.code === "TEXT_OVERFLOW");

  assert.ok(overflow);
  assert.equal(overflow.details.sourcePreserved, true);
  assert.equal(overflow.details.rewriteApplied, false);
  assert.equal(overflow.details.summarizationApplied, false);
  assert.equal(overflow.details.textDeletionApplied, false);
  assert.equal(overflow.details.textLength, text.length);
  assert.equal(overflow.details.textExcerpt, text.slice(0, 160));
  assert.equal(overflow.details.lineCount > 1, true);
});

test("measureText treats CJK text as wider than ASCII for wrapping estimates", () => {
  const common = { fontFamily: "Arial", fontSize: 20, fontWeight: "normal", width: 1, lineHeight: 1.2 };
  const ascii = measureText({ ...common, text: "a".repeat(20) }, 10);
  const cjk = measureText({ ...common, text: "가".repeat(20) }, 10);

  assert.equal(cjk.lines > ascii.lines, true);
});

test("measureText handles CJK and mixed-language punctuation fixtures without unbreakable overflow", () => {
  const samples = [
    "가나다라마바사아자차카타파하".repeat(3),
    "東京都心部再開発計画の進捗確認と品質検証".repeat(2),
    "数据可视化质量验证流程持续追踪".repeat(3),
    "MDPR검증Pipeline2026상태追跡데이터品質검사",
    "요약:검증、배포、운영。품질;추적!다음결정?",
  ];

  for (const text of samples) {
    const result = measureText({
      text,
      fontFamily: "Noto Sans CJK",
      fontSize: 18,
      width: 1.8,
      lineHeight: 1.2,
    }, 4);

    assert.equal(result.overflowX, false, text);
    assert.equal(result.lineCount > 1, true, text);
    assert.equal(result.usedHeightIn > 0, true, text);
  }
});

test("measureText accepts rich text runs and reports role-aware confidence and bounds", () => {
  const base = {
    box: { widthIn: 1.85, heightIn: 0.56 },
    fontFamily: "Arial",
    fontSize: 18,
    lineHeight: 1.18,
  };
  const body = measureText({
    ...base,
    role: "body",
    runs: [
      { text: "ABC 123 ", bold: true },
      { text: "가나다" },
      { text: " const value = 10;", code: true },
    ],
  });
  const code = measureText({
    ...base,
    role: "code",
    fontFamily: "Consolas",
    runs: [{ text: "const WideName = value + 100;" }],
  });

  assert.equal(body.confidence, "font-metric");
  assert.equal(body.lineCount >= 2, true);
  assert.equal(body.usedHeightIn > 0, true);
  assert.equal(body.overflowY, true);
  assert.equal(code.lineCount >= body.lineCount, true);
  assert.equal(code.usedWidthIn >= body.usedWidthIn, true);
});

test("measureText wraps CJK prose instead of treating the whole run as horizontal overflow", () => {
  const result = measureText({
    text: "Markdown은 원본 문서이며 발표자료 구조를 잃지 않도록 충분히 긴 한국어 문장을 포함합니다.",
    fontFamily: "Pretendard",
    fontSize: 18,
    width: 3,
    lineHeight: 1.2,
  }, 2.64);

  assert.equal(result.overflowX, false);
  assert.equal(result.overflow, false);
  assert.equal(result.lineCount > 1, true);
});

function layoutFor(lines) {
  const presentation = planPresentation(parseMarkdown(lines.join("\n")), defaultConfig);
  return planLayout(presentation, defaultConfig);
}
