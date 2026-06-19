import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculateDensity,
  defaultConfig,
  detectSlideIntent,
  DESIGN_PRESET_NAMES,
  parseMarkdown,
  parsePandocJson,
  planPresentation,
  resolveDesignTokens,
} from "../dist/index.js";

test("parseMarkdown extracts headings, bullet lists, and fenced code blocks", () => {
  const markdown = [
    "# Deck Title",
    "",
    "## Main Features",
    "",
    "- Fast planning",
    "- Stable layout",
    "",
    "```ts",
    "const value = 1;",
    "```",
  ].join("\n");

  const doc = parseMarkdown(markdown, "deck.md");

  assert.equal(doc.title, "Deck Title");
  assert.deepEqual(
    doc.headings.map((heading) => [heading.level, heading.text]),
    [
      [1, "Deck Title"],
      [2, "Main Features"],
    ],
  );
  assert.deepEqual(doc.blocks.find((block) => block.type === "bulletList")?.items, [
    "Fast planning",
    "Stable layout",
  ]);
  assert.equal(doc.blocks.find((block) => block.type === "code")?.language, "ts");
});

test("parseMarkdown preserves markdown paragraph lines and sentence units", () => {
  const doc = parseMarkdown([
    "# Deck",
    "",
    "## Narrative",
    "",
    "첫 문장입니다. 둘째 문장입니다.",
    "Third sentence stays on the next markdown line. Fourth sentence follows.",
  ].join("\n"), "deck.md");

  const paragraph = doc.blocks.find((block) => block.type === "paragraph");

  assert.deepEqual(paragraph.lines, [
    "첫 문장입니다. 둘째 문장입니다.",
    "Third sentence stays on the next markdown line. Fourth sentence follows.",
  ]);
  assert.deepEqual(paragraph.sentences, [
    "첫 문장입니다.",
    "둘째 문장입니다.",
    "Third sentence stays on the next markdown line.",
    "Fourth sentence follows.",
  ]);
});

test("parseMarkdown extracts tables, block quotes, and explicit slide breaks", () => {
  const doc = parseMarkdown([
    "# Deck",
    "",
    "## Evidence",
    "",
    "> A sourced quote.",
    "",
    "| Metric | Value |",
    "|---|---:|",
    "| Speed | 2x |",
    "",
    "---",
    "",
    "## Next",
  ].join("\n"));

  assert.equal(doc.blocks.some((block) => block.type === "slideBreak"), true);
  assert.deepEqual(doc.blocks.find((block) => block.type === "quote")?.text, "A sourced quote.");
  assert.deepEqual(doc.blocks.find((block) => block.type === "table")?.rows, [
    ["Metric", "Value"],
    ["Speed", "2x"],
  ]);
});

test("parseMarkdown preserves ordered and nested list structure while removing decorative bullets", () => {
  const doc = parseMarkdown([
    "# Deck",
    "",
    "## Structured Steps",
    "",
    "1. First step",
    "2. Second step",
    "   - Nested detail",
    "-",
    "·",
    "- Final unordered item",
  ].join("\n"));

  const list = doc.blocks.find((block) => block.type === "bulletList");

  assert.deepEqual(list.items, [
    "First step",
    "Second step",
    "Nested detail",
    "Final unordered item",
  ]);
  assert.deepEqual(list.listItems.map((item) => [item.text, item.ordered, item.level, item.number]), [
    ["First step", true, 0, 1],
    ["Second step", true, 0, 2],
    ["Nested detail", false, 1, undefined],
    ["Final unordered item", false, 0, undefined],
  ]);
});

test("parseMarkdown keeps bullet glyph items and indented descriptions as structured list content", () => {
  const doc = parseMarkdown([
    "# Deck",
    "",
    "## Details",
    "",
    "• Goal: Keep source readable",
    "  Render the description on a separate indented line.",
    "- **Output**: Preserve emphasis",
  ].join("\n"));

  const list = doc.blocks.find((block) => block.type === "bulletList");

  assert.deepEqual(list.items, [
    "Goal: Keep source readable\nRender the description on a separate indented line.",
    "Output: Preserve emphasis",
  ]);
  assert.deepEqual(list.listItems.map((item) => [item.label, item.description]), [
    ["Goal: Keep source readable", "Render the description on a separate indented line."],
    ["Output", "Preserve emphasis"],
  ]);
});

test("parseMarkdown keeps inline arrow examples inside normal lists", () => {
  const doc = parseMarkdown([
    "# Deck",
    "",
    "## Markdown Semantics",
    "",
    "- Lists: ordered and unordered lists keep numbering.",
    "- Diagrams: pipeline lines such as `Draft => Review => Render` become semantic diagram blocks.",
    "- Emphasis: **bold** and *italic* are preserved.",
  ].join("\n"));

  const list = doc.blocks.find((block) => block.type === "bulletList");

  assert.ok(list);
  assert.equal(doc.blocks.some((block) => block.type === "diagram"), false);
  assert.equal(list.items.length, 3);
  assert.match(list.items[1], /Draft => Review => Render/);
});


test("parseMarkdown exposes inline emphasis runs for paragraphs and list items", () => {
  const doc = parseMarkdown([
    "# Deck",
    "",
    "## Emphasis",
    "",
    "Plain **bold** and *italic* text.",
    "",
    "- Keep **strong** item",
  ].join("\n"));

  const paragraph = doc.blocks.find((block) => block.type === "paragraph");
  const list = doc.blocks.find((block) => block.type === "bulletList");

  assert.deepEqual(paragraph.inlineRuns, [
    { text: "Plain " },
    { text: "bold", bold: true },
    { text: " and " },
    { text: "italic", italic: true },
    { text: " text." },
  ]);
  assert.deepEqual(list.listItems[0].runs, [
    { text: "Keep " },
    { text: "strong", bold: true },
    { text: " item" },
  ]);
});

test("parseMarkdown converts arrow pipelines into diagram blocks", () => {
  const doc = parseMarkdown([
    "# Deck",
    "",
    "## Pipeline",
    "",
    "Draft => Review => Render => Validate",
  ].join("\n"));

  const diagram = doc.blocks.find((block) => block.type === "diagram");

  assert.equal(diagram.diagram.kind, "pipeline");
  assert.deepEqual(diagram.diagram.nodes.map((node) => node.label), ["Draft", "Review", "Render", "Validate"]);
  assert.deepEqual(diagram.diagram.edges.map((edge) => [edge.from, edge.to]), [
    ["node-1", "node-2"],
    ["node-2", "node-3"],
    ["node-3", "node-4"],
  ]);
});

test("parsePandocJson normalizes Pandoc AST blocks into MDPR semantic blocks", () => {
  const doc = parsePandocJson({
    "pandoc-api-version": [1, 23, 1],
    meta: {},
    blocks: [
      { t: "Header", c: [1, ["deck", ["title"], []], [{ t: "Str", c: "Deck" }, { t: "Space" }, { t: "Str", c: "Title" }]] },
      { t: "Header", c: [2, ["workflow", [], []], [{ t: "Str", c: "Workflow" }]] },
      {
        t: "Para",
        c: [
          { t: "Str", c: "Use" },
          { t: "Space" },
          { t: "Strong", c: [{ t: "Str", c: "Pandoc" }] },
          { t: "Space" },
          { t: "Emph", c: [{ t: "Str", c: "AST" }] },
          { t: "Str", c: "." },
        ],
      },
      { t: "BulletList", c: [[{ t: "Plain", c: [{ t: "Str", c: "Parse" }] }], [{ t: "Plain", c: [{ t: "Str", c: "Split" }] }]] },
      { t: "OrderedList", c: [[1, { t: "Decimal" }, { t: "Period" }], [[{ t: "Plain", c: [{ t: "Str", c: "Render" }] }]]] },
      { t: "Para", c: [{ t: "Image", c: [["diagram", ["wide"], [["role", "teaser"]]], [{ t: "Str", c: "Diagram" }], ["assets/diagram.png", ""]] }] },
      { t: "CodeBlock", c: [["example", ["ts"], []], "const slide = true;"] },
      { t: "HorizontalRule" },
    ],
  }, "deck.md");

  assert.equal(doc.parser, "pandoc");
  assert.equal(doc.title, "Deck Title");
  assert.deepEqual(doc.headings.map((heading) => [heading.level, heading.text, heading.pandocAttr?.identifier]), [
    [1, "Deck Title", "deck"],
    [2, "Workflow", "workflow"],
  ]);
  assert.deepEqual(doc.blocks.find((block) => block.type === "paragraph")?.inlineRuns, [
    { text: "Use " },
    { text: "Pandoc", bold: true },
    { text: " " },
    { text: "AST", italic: true },
    { text: "." },
  ]);
  assert.deepEqual(doc.blocks.find((block) => block.listKind === "unordered")?.items, ["Parse", "Split"]);
  assert.deepEqual(doc.blocks.find((block) => block.listKind === "ordered")?.listItems?.map((item) => [item.text, item.ordered, item.number]), [
    ["Render", true, 1],
  ]);
  assert.equal(doc.blocks.find((block) => block.type === "image")?.src, "assets/diagram.png");
  assert.equal(doc.blocks.find((block) => block.type === "code")?.language, "ts");
  assert.equal(doc.blocks.some((block) => block.type === "slideBreak"), true);
});

test("planPresentation consumes Pandoc-normalized documents through the existing split pipeline", () => {
  const doc = parsePandocJson({
    blocks: [
      { t: "Header", c: [1, ["deck", [], []], [{ t: "Str", c: "Deck" }]] },
      { t: "Header", c: [2, ["capabilities", [], []], [{ t: "Str", c: "Capabilities" }]] },
      {
        t: "BulletList",
        c: [
          [{ t: "Plain", c: [{ t: "Str", c: "Parse" }] }],
          [{ t: "Plain", c: [{ t: "Str", c: "Plan" }] }],
          [{ t: "Plain", c: [{ t: "Str", c: "Render" }] }],
        ],
      },
    ],
  });

  const presentation = planPresentation(doc, defaultConfig);

  assert.deepEqual(
    presentation.slides.map((slide) => [slide.role, slide.title, slide.intent]),
    [
      ["cover", "Deck", "title"],
      ["toc", "목차", "list"],
      ["content", "Capabilities", "list"],
    ],
  );
});

test("parseMarkdown treats pipelines returning to the first label as cycle edges", () => {
  const doc = parseMarkdown([
    "# Deck",
    "",
    "## Review Loop",
    "",
    "Plan => Render => Review => Plan",
  ].join("\n"));

  const diagram = doc.blocks.find((block) => block.type === "diagram");

  assert.deepEqual(diagram.diagram.nodes.map((node) => node.label), ["Plan", "Render", "Review"]);
  assert.deepEqual(diagram.diagram.edges.map((edge) => [edge.from, edge.to]), [
    ["node-1", "node-2"],
    ["node-2", "node-3"],
    ["node-3", "node-1"],
  ]);
});

test("parseMarkdown promotes arrow-bearing list items into pipeline diagrams", () => {
  const doc = parseMarkdown([
    "# Deck",
    "",
    "## Pipeline",
    "",
    "- Draft => Review",
    "- Review => Render",
    "- Render => Validate",
  ].join("\n"));

  const diagram = doc.blocks.find((block) => block.type === "diagram");

  assert.equal(doc.blocks.some((block) => block.type === "bulletList"), false);
  assert.deepEqual(diagram.diagram.nodes.map((node) => node.label), ["Draft", "Review", "Render", "Validate"]);
  assert.deepEqual(diagram.diagram.edges.map((edge) => [edge.from, edge.to]), [
    ["node-1", "node-2"],
    ["node-2", "node-3"],
    ["node-3", "node-4"],
  ]);
});

test("parseMarkdown promotes fenced text arrow flows into pipeline diagrams", () => {
  const doc = parseMarkdown([
    "# Deck",
    "",
    "## Pipeline",
    "",
    "```text",
    "Markdown",
    "  -> Outline Tree",
    "  -> Presentation IR",
    "  -> Renderer",
    "```",
  ].join("\n"));

  const diagram = doc.blocks.find((block) => block.type === "diagram");

  assert.equal(doc.blocks.some((block) => block.type === "code"), false);
  assert.deepEqual(diagram.diagram.nodes.map((node) => node.label), [
    "Markdown",
    "Outline Tree",
    "Presentation IR",
    "Renderer",
  ]);
});

test("parseMarkdown promotes fenced Unicode arrow flows into pipeline diagrams", () => {
  const doc = parseMarkdown([
    "# Deck",
    "",
    "## 파이프라인",
    "",
    "```text",
    "마크다운",
    "  → 구조 분석",
    "  → 슬라이드 분할",
    "  → 렌더링",
    "```",
  ].join("\n"));

  const diagram = doc.blocks.find((block) => block.type === "diagram");

  assert.equal(doc.blocks.some((block) => block.type === "code"), false);
  assert.deepEqual(diagram.diagram.nodes.map((node) => node.label), [
    "마크다운",
    "구조 분석",
    "슬라이드 분할",
    "렌더링",
  ]);
});

test("parseMarkdown promotes fenced flow with renderer output branches into one pipeline diagram", () => {
  const doc = parseMarkdown([
    "# Deck",
    "",
    "## Pipeline",
    "",
    "```text",
    "Markdown",
    "  -> Markdown AST / Simple AST",
    "  -> Outline Tree",
    "  -> Renderer",
    "      ├─ PPTX",
    "      ├─ PDF",
    "      └─ HTML",
    "```",
  ].join("\n"));

  const diagram = doc.blocks.find((block) => block.type === "diagram");

  assert.equal(doc.blocks.some((block) => block.type === "code"), false);
  assert.deepEqual(diagram.diagram.nodes.map((node) => node.label), [
    "Markdown",
    "Markdown AST / Simple AST",
    "Outline Tree",
    "Renderer\nPPTX / PDF / HTML",
  ]);
});

test("planPresentation creates cover, toc, and h2 content slides", () => {
  const doc = parseMarkdown([
    "# Product",
    "",
    "## Why it matters",
    "",
    "A short explanation.",
    "",
    "## Capabilities",
    "",
    "- Parse",
    "- Plan",
    "- Render",
    "- Override",
  ].join("\n"));

  const presentation = planPresentation(doc, defaultConfig);

  assert.equal(presentation.meta.title, "Product");
  assert.deepEqual(
    presentation.slides.map((slide) => [slide.role, slide.title, slide.intent]),
    [
      ["cover", "Product", "title"],
      ["toc", "목차", "list"],
      ["content", "Why it matters", "standard"],
      ["content", "Capabilities", "grid"],
    ],
  );
});

test("planPresentation autosplits dense h2 content by h3 subsections", () => {
  const denseItems = Array.from({ length: 10 }, (_, index) => `- Item ${index + 1}`).join("\n");
  const doc = parseMarkdown([
    "# Product",
    "",
    "## Dense Section",
    "",
    denseItems,
    "",
    "### First Part",
    "",
    "- A",
    "- B",
    "",
    "### Second Part",
    "",
    "- C",
    "- D",
  ].join("\n"));

  const presentation = planPresentation(doc, defaultConfig);
  const contentTitles = presentation.slides
    .filter((slide) => slide.role === "content")
    .map((slide) => slide.title);

  assert.deepEqual(contentTitles, [
    "Dense Section — First Part",
    "Dense Section — Second Part",
  ]);
});

test("planPresentation autosplits dense paragraphs by sentence chunks when no h3 exists", () => {
  const config = structuredClone(defaultConfig);
  config.split.autosplit.maxDensity = 3;
  const doc = parseMarkdown([
    "# Product",
    "",
    "## Long Narrative",
    "",
    "첫 문장입니다. 둘째 문장입니다. 셋째 문장입니다. 넷째 문장입니다. Fifth sentence. Sixth sentence. Seventh sentence.",
  ].join("\n"));

  const presentation = planPresentation(doc, config);
  const contentSlides = presentation.slides.filter((slide) => slide.role === "content");

  assert.equal(contentSlides.length > 1, true);
  assert.deepEqual(contentSlides.map((slide) => slide.title), [
    "Long Narrative",
    "Long Narrative (Cont. 2/3)",
    "Long Narrative (Cont. 3/3)",
  ]);
  assert.deepEqual(contentSlides.map((slide) => slide.blocks.flatMap((block) => block.sentences ?? [block.text]).length), [3, 3, 1]);
});

test("planPresentation forces paragraph-heavy sections into continuation slides before they become prose walls", () => {
  const doc = parseMarkdown([
    "# Product",
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
  ].join("\n"));

  const presentation = planPresentation(doc, defaultConfig);
  const contentSlides = presentation.slides.filter((slide) => slide.role === "content");

  assert.deepEqual(contentSlides.map((slide) => slide.title), [
    "Design Presets",
    "Design Presets (Cont. 2/2)",
  ]);
  assert.deepEqual(contentSlides.map((slide) => slide.blocks.length), [2, 2]);
});

test("README Design Presets section is split instead of staying as one prose-filled slide", () => {
  const markdown = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../README.md"), "utf-8");
  const presentation = planPresentation(parseMarkdown(markdown, "README.md"), defaultConfig);
  const designSlides = presentation.slides.filter((slide) => slide.title.startsWith("Design Presets"));

  assert.equal(designSlides.length >= 2, true);
  assert.equal(designSlides.every((slide) => slide.blocks.length <= 2), true);
});

test("planPresentation splits long ordered lists into continuation slides", () => {
  const doc = parseMarkdown([
    "# Product",
    "",
    "## Implementation Priorities",
    "",
    "1. Schemas: Stabilize JSON schemas.",
    "2. Core: Build Markdown parsing.",
    "3. Layout: Build layout planning.",
    "4. Override: Apply manifests.",
    "5. HTML: Render preview output.",
    "6. PDF: Start from HTML.",
    "7. PPTX: Render editable objects.",
  ].join("\n"));

  const presentation = planPresentation(doc, defaultConfig);
  const contentSlides = presentation.slides.filter((slide) => slide.role === "content");

  assert.deepEqual(contentSlides.map((slide) => slide.title), [
    "Implementation Priorities",
    "Implementation Priorities (Cont. 2/2)",
  ]);
  assert.deepEqual(contentSlides.map((slide) => slide.blocks[0].items.length), [4, 3]);
});

test("planPresentation preserves text when splitting structured listItems-only blocks", () => {
  const listItems = Array.from({ length: 7 }, (_, index) => ({
    text: `Structured item ${index + 1}`,
    level: 0,
    ordered: false,
  }));
  const doc = {
    title: "Product",
    sourcePath: "structured.md",
    headings: [
      { id: "h1", type: "heading", level: 1, text: "Product" },
      { id: "h2", type: "heading", level: 2, text: "Structured List" },
    ],
    blocks: [
      { id: "h1", type: "heading", level: 1, text: "Product" },
      { id: "h2", type: "heading", level: 2, text: "Structured List" },
      { id: "list-1", type: "bulletList", listItems, listKind: "unordered" },
    ],
  };

  const presentation = planPresentation(doc, defaultConfig);
  const contentSlides = presentation.slides.filter((slide) => slide.role === "content");

  assert.deepEqual(contentSlides.map((slide) => slide.title), [
    "Structured List",
    "Structured List (Cont. 2/2)",
  ]);
  assert.deepEqual(contentSlides.map((slide) => slide.primaryItemCount), [4, 3]);
  assert.deepEqual(contentSlides.flatMap((slide) => slide.blocks[0].items), listItems.map((item) => item.text));
});

test("planPresentation splits long structured five-item lists before cramped diagram layouts", () => {
  const doc = parseMarkdown([
    "# Product",
    "",
    "## Markdown Semantics",
    "",
    "The parser preserves presentation-relevant Markdown structure.",
    "",
    "- Headings: Title and section hierarchy drive cover, table of contents, and slide boundaries.",
    "- Lists: Ordered and unordered lists keep numbering, indentation, and explanatory continuation lines.",
    "- Cleanup: Decorative empty bullet lines are removed before layout, so the deck does not show stray glyphs.",
    "- Emphasis: Bold and italic inline markdown becomes editable text styling in the generated deck.",
    "- Diagrams: Standalone pipeline arrows become semantic diagram blocks with separate nodes and connectors.",
  ].join("\n"));

  const presentation = planPresentation(doc, defaultConfig);
  const contentSlides = presentation.slides.filter((slide) => slide.role === "content");

  assert.deepEqual(contentSlides.map((slide) => slide.title), [
    "Markdown Semantics",
    "Markdown Semantics (Cont. 2/2)",
  ]);
  assert.deepEqual(contentSlides.map((slide) => slide.blocks.find((block) => block.type === "bulletList")?.items.length), [3, 2]);
});

test("planPresentation splits long shell code blocks into continuation slides", () => {
  const doc = parseMarkdown([
    "# Product",
    "",
    "## Quick Usage",
    "",
    "```bash",
    "mdpresent inspect examples/basic/deck.md --json > deck.plan.json",
    "mdpresent plan examples/basic/deck.md --json > layout.plan.json",
    "mdpresent validate examples/basic/deck.md --override examples/basic/deck.override.yaml",
    "mdpresent build examples/basic/deck.md --to pptx,pdf,html --out dist --design executive",
    "mdpresent build examples/basic/deck.md --to pptx --out dist --template company-master.pptx",
    "mdpresent build examples/basic/deck.md --to html,pptx --config examples/themes/nord.config.yaml --out dist",
    "```",
  ].join("\n"));

  const presentation = planPresentation(doc, defaultConfig);
  const contentSlides = presentation.slides.filter((slide) => slide.role === "content");

  assert.deepEqual(contentSlides.map((slide) => slide.title), [
    "Quick Usage",
    "Quick Usage (Cont. 2/2)",
  ]);
  assert.deepEqual(contentSlides.map((slide) => slide.blocks[0].text.split(/\r?\n/).length), [4, 2]);
});

test("planPresentation separates graph slides from supporting detail content", () => {
  const doc = parseMarkdown([
    "# Product",
    "",
    "## Pipeline",
    "",
    "Draft => Review => Render => Validate",
    "",
    "- Draft: Collect source notes.",
    "- Review: Check correctness.",
    "- Render: Produce editable output.",
  ].join("\n"));

  const presentation = planPresentation(doc, defaultConfig);
  const contentSlides = presentation.slides.filter((slide) => slide.role === "content");

  assert.deepEqual(contentSlides.map((slide) => slide.title), [
    "Pipeline",
    "Pipeline (Cont. 2/2)",
  ]);
  assert.deepEqual(contentSlides[0].blocks.map((block) => block.type), ["diagram"]);
  assert.deepEqual(contentSlides[1].blocks.map((block) => block.type), ["bulletList"]);
});

test("planPresentation treats horizontal rules as explicit slide separators", () => {
  const config = structuredClone(defaultConfig);
  config.toc.enabled = false;
  const doc = parseMarkdown([
    "# Product",
    "",
    "## First",
    "",
    "One sentence.",
    "",
    "---",
    "",
    "## Second",
    "",
    "Two sentence.",
  ].join("\n"));

  const presentation = planPresentation(doc, config);
  const contentSlides = presentation.slides.filter((slide) => slide.role === "content");

  assert.deepEqual(contentSlides.map((slide) => slide.title), ["First", "Second"]);
  assert.deepEqual(contentSlides.map((slide) => slide.blocks.map((block) => block.text)), [
    ["One sentence."],
    ["Two sentence."],
  ]);
});

test("planPresentation splits content inside the same heading on horizontal rules", () => {
  const config = structuredClone(defaultConfig);
  config.toc.enabled = false;
  const doc = parseMarkdown([
    "# Product",
    "",
    "## Walkthrough",
    "",
    "First part.",
    "",
    "---",
    "",
    "Second part without another heading.",
  ].join("\n"));

  const presentation = planPresentation(doc, config);
  const contentSlides = presentation.slides.filter((slide) => slide.role === "content");

  assert.deepEqual(contentSlides.map((slide) => slide.title), ["Walkthrough", "Walkthrough (Cont. 2/2)"]);
  assert.deepEqual(contentSlides.map((slide) => slide.blocks.map((block) => block.text)), [
    ["First part."],
    ["Second part without another heading."],
  ]);
});

test("calculateDensity and detectSlideIntent follow documented MVP rules", () => {
  const slide = {
    id: "slide-1",
    index: 1,
    role: "content",
    title: "Before and After",
    headingPath: ["Before and After"],
    source: {},
    blocks: [
      { id: "list-1", type: "bulletList", items: ["A", "B", "C", "D", "E"] },
      { id: "code-1", type: "code", text: "const a = 1;" },
    ],
    primaryItemCount: 5,
    density: 10,
  };

  assert.equal(calculateDensity(slide.blocks).total, 10);
  assert.equal(detectSlideIntent(slide), "comparison");
});

test("detectSlideIntent routes diagram blocks to diagram intent", () => {
  const slide = {
    id: "slide-diagram",
    index: 1,
    role: "content",
    title: "Pipeline",
    headingPath: ["Pipeline"],
    source: {},
    blocks: [
      {
        id: "diagram-1",
        type: "diagram",
        diagram: {
          kind: "pipeline",
          nodes: [
            { id: "node-1", label: "Draft" },
            { id: "node-2", label: "Review" },
          ],
          edges: [{ from: "node-1", to: "node-2", label: "" }],
        },
      },
    ],
    primaryItemCount: 0,
    density: 2,
  };

  assert.equal(detectSlideIntent(slide), "diagram");
});

test("detectSlideIntent routes block quotes to quote intent for key-message layouts", () => {
  const slide = {
    id: "slide-quote",
    index: 1,
    role: "content",
    title: "Decision",
    headingPath: ["Decision"],
    source: {},
    blocks: [
      { id: "quote-1", type: "quote", text: "Keep the Markdown source authoritative." },
      { id: "paragraph-1", type: "paragraph", text: "Supporting detail follows." },
    ],
    primaryItemCount: 0,
    density: 2,
  };

  assert.equal(detectSlideIntent(slide), "quote");
});

test("planPresentation output conforms to the Presentation IR schema contract", () => {
  const schemaPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../schemas/presentation-ir.schema.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
  const doc = parseMarkdown([
    "# Product",
    "",
    "## Capabilities",
    "",
    "- Parse",
    "- Plan",
    "- Render",
    "- Override",
  ].join("\n"), "deck.md");

  const presentation = JSON.parse(JSON.stringify(planPresentation(doc, defaultConfig)));
  const errors = validateJsonSchemaSubset(schema, presentation, schema);

  assert.deepEqual(errors, []);
});

test("content slide ids survive inserting body content above an existing section", () => {
  const before = planPresentation(parseMarkdown([
    "# Product",
    "",
    "## Problem",
    "",
    "Original problem text.",
    "",
    "## Capabilities",
    "",
    "- Parse",
    "- Plan",
  ].join("\n")), defaultConfig);

  const after = planPresentation(parseMarkdown([
    "# Product",
    "",
    "Introductory paragraph inserted above sections.",
    "",
    "## Problem",
    "",
    "Original problem text.",
    "",
    "## Capabilities",
    "",
    "- Parse",
    "- Plan",
  ].join("\n")), defaultConfig);

  const beforeIds = contentSlideIdsByTitle(before);
  const afterIds = contentSlideIdsByTitle(after);

  assert.equal(afterIds.get("Problem"), beforeIds.get("Problem"));
  assert.equal(afterIds.get("Capabilities"), beforeIds.get("Capabilities"));
});

test("design preset catalog exposes named presentation palettes as shared tokens", () => {
  assert.ok(DESIGN_PRESET_NAMES.includes("nord"));
  assert.ok(DESIGN_PRESET_NAMES.includes("solarized"));
  assert.ok(DESIGN_PRESET_NAMES.includes("dracula"));
  assert.ok(DESIGN_PRESET_NAMES.includes("tableau"));

  const nord = resolveDesignTokens("nord", defaultConfig.theme);

  assert.equal(nord.backgroundColor, "2E3440");
  assert.equal(nord.textColor, "ECEFF4");
  assert.equal(nord.primaryColor, "88C0D0");
  assert.equal(nord.surfaceFill, "3B4252");
  assert.equal(nord.ruleColor, "81A1C1");
});

function contentSlideIdsByTitle(presentation) {
  return new Map(
    presentation.slides
      .filter((slide) => slide.role === "content")
      .map((slide) => [slide.title, slide.id]),
  );
}

function validateJsonSchemaSubset(schema, value, root, path = "$") {
  if (schema.$ref) {
    return validateJsonSchemaSubset(resolveRef(root, schema.$ref), value, root, path);
  }

  const errors = [];

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path} must equal ${JSON.stringify(schema.const)}`);
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of ${schema.enum.join(", ")}`);
  }

  if (schema.type && !matchesType(schema.type, value)) {
    errors.push(`${path} must be ${schema.type}`);
    return errors;
  }

  if (schema.type === "integer" && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${path} must be >= ${schema.minimum}`);
  }

  if (schema.type === "integer" && schema.maximum !== undefined && value > schema.maximum) {
    errors.push(`${path} must be <= ${schema.maximum}`);
  }

  if (schema.type === "array") {
    for (const [index, item] of value.entries()) {
      errors.push(...validateJsonSchemaSubset(schema.items ?? {}, item, root, `${path}[${index}]`));
    }
  }

  if (schema.type === "object") {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) errors.push(`${path}.${key} is required`);
    }

    const properties = schema.properties ?? {};
    for (const [key, item] of Object.entries(value)) {
      if (properties[key]) {
        errors.push(...validateJsonSchemaSubset(properties[key], item, root, `${path}.${key}`));
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}.${key} is not allowed`);
      }
    }
  }

  return errors;
}

function resolveRef(root, ref) {
  assert.ok(ref.startsWith("#/"), `Only local refs are supported in tests: ${ref}`);
  return ref.slice(2).split("/").reduce((node, part) => node[part], root);
}

function matchesType(type, value) {
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number";
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  return typeof value === type;
}
