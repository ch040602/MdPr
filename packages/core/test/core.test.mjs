import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculateDensity,
  defaultConfig,
  DECORATION_STYLE_NAMES,
  detectSlideIntent,
  detectSlideIntentProfile,
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

test("parseMarkdown follows CommonMark/GFM AST semantics for links, escaped table cells, and HTML blocks", () => {
  const doc = parseMarkdown([
    "# Deck",
    "",
    "## Semantics",
    "",
    "See [API docs](https://example.test) and `inline code`.",
    "",
    "| Name | Meaning |",
    "| --- | --- |",
    "| A\\|B | Escaped pipe |",
    "",
    "<div class=\"note\">",
    "HTML content",
    "</div>",
  ].join("\n"), "deck.md");

  const paragraph = doc.blocks.find((block) => block.type === "paragraph");
  const table = doc.blocks.find((block) => block.type === "table");
  const html = doc.blocks.find((block) => block.type === "html");

  assert.equal(paragraph.text, "See API docs and inline code.");
  assert.deepEqual(table.rows, [
    ["Name", "Meaning"],
    ["A|B", "Escaped pipe"],
  ]);
  assert.equal(html.text, "<div class=\"note\">\nHTML content\n</div>");
});

test("parseMarkdown canonicalizes long spaces before validation and rendering", () => {
  const doc = parseMarkdown([
    "# Deck",
    "",
    "## Spacing",
    "",
    "Alpha     beta\t\tgamma.",
    "Text with **Bold    phrase** and plain     text.",
    "",
    "| Metric | Long     Value |",
    "|---|---:|",
    "| Speed\t\tScore | 2x      faster |",
  ].join("\n"));

  const paragraph = doc.blocks.find((block) => block.type === "paragraph");
  const table = doc.blocks.find((block) => block.type === "table");

  assert.equal(paragraph.text, "Alpha beta gamma. Text with Bold phrase and plain text.");
  assert.deepEqual(paragraph.lines, [
    "Alpha beta gamma.",
    "Text with **Bold phrase** and plain text.",
  ]);
  assert.deepEqual(paragraph.inlineRuns, [
    { text: "Alpha beta gamma.\nText with " },
    { text: "Bold phrase", bold: true },
    { text: " and plain text." },
  ]);
  assert.deepEqual(table.rows, [
    ["Metric", "Long Value"],
    ["Speed Score", "2x faster"],
  ]);
  assert.equal(table.text, "Metric | Long Value\nSpeed Score | 2x faster");
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
    "## Semantic Blocks",
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

test("parseMarkdown converts fenced chart data into chart blocks", () => {
  const doc = parseMarkdown([
    "# Deck",
    "",
    "## Source Shape Summary",
    "",
    "```chart",
    "labels: Docs, Examples, Root",
    "Headings: 192, 28, 7",
    "Tables: 12, 3, 1",
    "```",
  ].join("\n"));

  const chart = doc.blocks.find((block) => block.type === "chart");

  assert.deepEqual(chart.chart, {
    kind: "bar",
    labels: ["Docs", "Examples", "Root"],
    series: [
      { name: "Headings", values: [192, 28, 7] },
      { name: "Tables", values: [12, 3, 1] },
    ],
  });
  assert.equal(chart.text, "Headings: 192, 28, 7\nTables: 12, 3, 1");
});

test("parseMarkdown supports editable chart proof object variants", () => {
  const doc = parseMarkdown([
    "# Deck",
    "",
    "## Proof Objects",
    "",
    "```arc-ring",
    "labels: Validated, Remaining",
    "Coverage: 72, 28",
    "```",
    "",
    "```chart",
    "kind: gauge",
    "labels: Readiness",
    "Score: 83",
    "```",
    "",
    "```connected-strip",
    "Draft, 20",
    "Render, 68",
    "Validate, 92",
    "```",
  ].join("\n"));

  const charts = doc.blocks.filter((block) => block.type === "chart").map((block) => block.chart);

  assert.deepEqual(charts.map((chart) => chart.kind), ["arc-ring", "gauge", "connected-strip"]);
  assert.deepEqual(charts[0], {
    kind: "arc-ring",
    labels: ["Validated", "Remaining"],
    series: [{ name: "Coverage", values: [72, 28] }],
  });
  assert.deepEqual(charts[1], {
    kind: "gauge",
    labels: ["Readiness"],
    series: [{ name: "Score", values: [83] }],
  });
  assert.deepEqual(charts[2], {
    kind: "connected-strip",
    labels: ["Draft", "Render", "Validate"],
    series: [{ name: "Value", values: [20, 68, 92] }],
  });
});

test("parseMarkdown supports additional editable chart object variants", () => {
  const doc = parseMarkdown([
    "# Demo",
    "",
    "```ranked-bars",
    "Parser, 91",
    "Layout, 87",
    "Renderer, 94",
    "```",
    "",
    "```metric-dots",
    "Draft, 20",
    "Review, 68",
    "Ship, 92",
    "```",
  ].join("\n"));

  const charts = doc.blocks.filter((block) => block.type === "chart").map((block) => block.chart);

  assert.deepEqual(charts.map((chart) => chart.kind), ["ranked-bars", "metric-dots"]);
  assert.deepEqual(charts[0].labels, ["Parser", "Layout", "Renderer"]);
  assert.deepEqual(charts[1].series[0].values, [20, 68, 92]);
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

test("parsePandocJson adapts Pandoc AST into MDPR diagram, chart, and structured list semantics", () => {
  const doc = parsePandocJson({
    "pandoc-api-version": [1, 23, 1],
    meta: {},
    blocks: [
      { t: "Header", c: [1, ["deck", [], []], [{ t: "Str", c: "Deck" }]] },
      {
        t: "Para",
        c: [
          { t: "Str", c: "Draft" },
          { t: "Space" },
          { t: "Str", c: "=>" },
          { t: "Space" },
          { t: "Str", c: "Review" },
          { t: "Space" },
          { t: "Str", c: "=>" },
          { t: "Space" },
          { t: "Str", c: "Render" },
        ],
      },
      {
        t: "BulletList",
        c: [
          [
            { t: "Plain", c: [{ t: "Strong", c: [{ t: "Str", c: "Parser" }] }, { t: "Str", c: ":" }, { t: "Space" }, { t: "Str", c: "AST" }] },
            { t: "BulletList", c: [[{ t: "Plain", c: [{ t: "Str", c: "Preserve" }, { t: "Space" }, { t: "Str", c: "tables" }] }]] },
          ],
        ],
      },
      {
        t: "CodeBlock",
        c: [["metrics", ["ranked-bars"], []], "Parser, 91\nLayout, 87\nRenderer, 94"],
      },
      {
        t: "Div",
        c: [["proof", ["callout"], [["role", "evidence"]]], [
          { t: "Para", c: [{ t: "Str", c: "Validated" }] },
        ]],
      },
    ],
  }, "deck.md");

  const diagram = doc.blocks.find((block) => block.type === "diagram");
  assert.deepEqual(diagram?.diagram.nodes.map((node) => node.label), ["Draft", "Review", "Render"]);

  const list = doc.blocks.find((block) => block.type === "bulletList");
  assert.deepEqual(list?.listItems.map((item) => [item.text, item.level, item.label, item.description]), [
    ["Parser: AST", 0, "Parser", "AST"],
    ["Preserve tables", 1, undefined, undefined],
  ]);
  assert.equal(list?.listItems[0].runs.some((run) => run.bold), true);

  const chart = doc.blocks.find((block) => block.type === "chart");
  assert.equal(chart?.chart.kind, "ranked-bars");
  assert.deepEqual(chart?.chart.labels, ["Parser", "Layout", "Renderer"]);

  const divParagraph = doc.blocks.find((block) => block.text === "Validated");
  assert.deepEqual(divParagraph?.pandocAttr, { identifier: "proof", classes: ["callout"], attributes: { role: "evidence" } });
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

test("planPresentation localizes the generated toc slide from deck language", () => {
  const doc = parseMarkdown([
    "# Product",
    "",
    "## Why it matters",
    "",
    "A short explanation.",
  ].join("\n"));
  const config = structuredClone(defaultConfig);
  config.deck.language = "en";

  const presentation = planPresentation(doc, config);
  const toc = presentation.slides.find((slide) => slide.role === "toc");

  assert.equal(toc?.title, "Agenda");
  assert.deepEqual(toc?.headingPath, ["Agenda"]);
});

test("planPresentation splits large generated toc slides into bounded continuation slides", () => {
  const lines = ["# Demo", ""];
  for (let index = 1; index <= 23; index++) {
    lines.push(`## Topic ${index}`, "", "Body.", "");
  }

  const config = structuredClone(defaultConfig);
  config.deck.language = "en";
  const presentation = planPresentation(parseMarkdown(lines.join("\n")), config);
  const tocSlides = presentation.slides.filter((slide) => slide.role === "toc");

  assert.equal(tocSlides.length, 2);
  assert.deepEqual(tocSlides.map((slide) => slide.blocks.length), [14, 9]);
  assert.deepEqual(tocSlides.map((slide) => slide.title), ["Agenda", "Agenda (Cont. 2/2)"]);
  assert.equal(tocSlides.every((slide) => slide.primaryItemCount <= 14), true);
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

test("README Semantics and Design section stays compact after moving detail docs out", () => {
  const markdown = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../README.md"), "utf-8");
  const presentation = planPresentation(parseMarkdown(markdown, "README.md"), defaultConfig);
  const designSlides = presentation.slides.filter((slide) => slide.title.startsWith("Semantics and Design"));

  assert.equal(designSlides.length <= 3, true);
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

test("planPresentation keeps six short list items together for 3x2 grid layouts", () => {
  const doc = parseMarkdown([
    "# Product",
    "",
    "## Compact Grid",
    "",
    "- Title body",
    "- Quote card",
    "- Table focus",
    "- Chart proof",
    "- Image focus",
    "- Code focus",
  ].join("\n"));

  const presentation = planPresentation(doc, defaultConfig);
  const contentSlides = presentation.slides.filter((slide) => slide.role === "content");

  assert.equal(contentSlides.length, 1);
  assert.equal(contentSlides[0].primaryItemCount, 6);
  assert.equal(contentSlides[0].intent, "grid");
  assert.equal(contentSlides[0].blocks[0].items.length, 6);
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
    "## Semantic Blocks",
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
    "Semantic Blocks",
    "Semantic Blocks (Cont. 2/2)",
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

test("planPresentation keeps one diagram and its supporting content on the same slide", () => {
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

  assert.deepEqual(contentSlides.map((slide) => slide.title), ["Pipeline"]);
  assert.deepEqual(contentSlides[0].blocks.map((block) => block.type), ["diagram", "bulletList"]);
});

test("planPresentation keeps compact chart table image evidence bundles on one slide", () => {
  const doc = parseMarkdown([
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
  ].join("\n"));

  const presentation = planPresentation(doc, defaultConfig);
  const contentSlides = presentation.slides.filter((slide) => slide.role === "content");
  const mixedSlides = contentSlides.filter((slide) => slide.title.startsWith("Mixed Evidence"));

  assert.equal(mixedSlides.length, 1);
  assert.deepEqual(mixedSlides[0].blocks.map((block) => block.type), ["bulletList", "chart", "table", "image"]);
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

test("detectSlideIntentProfile exposes primary and secondary scores for mixed evidence slides", () => {
  const doc = parseMarkdown([
    "# Demo",
    "",
    "## Adoption Funnel",
    "",
    "- Awareness: 80%",
    "- Activation: 40%",
    "- Retention: 18%",
    "",
    "| Stage | Users |",
    "| --- | ---: |",
    "| Awareness | 8000 |",
    "| Activation | 4000 |",
    "",
    "![funnel](funnel.png)",
  ].join("\n"));
  const presentation = planPresentation(doc, defaultConfig);
  const slide = presentation.slides.find((candidate) => candidate.title === "Adoption Funnel");
  const profile = detectSlideIntentProfile(slide);

  assert.equal(profile.primaryIntent, "evidence");
  assert.deepEqual(profile.secondaryIntents.slice(0, 3), ["metric", "table", "image"]);
  assert.equal(profile.scores.metric > 0, true);
  assert.equal(profile.scores.table > 0, true);
  assert.equal(profile.scores.image > 0, true);
  assert.equal(slide.intent, "evidence");
  assert.deepEqual(slide.secondaryIntents.slice(0, 3), ["metric", "table", "image"]);
});

test("planPresentation emits coherence groups for compact evidence packs", () => {
  const presentation = planPresentation(parseMarkdown([
    "# Demo",
    "",
    "## Adoption Funnel",
    "",
    "The funnel narrowed after activation.",
    "",
    "- Awareness: 80%",
    "- Activation: 40%",
    "- Retention: 18%",
    "",
    "| Stage | Users |",
    "| --- | ---: |",
    "| Awareness | 8000 |",
    "| Activation | 4000 |",
    "",
    "![funnel](funnel.png)",
  ].join("\n")), defaultConfig);
  const slide = presentation.slides.find((candidate) => candidate.title === "Adoption Funnel");
  const group = presentation.coherenceGroups.find((candidate) => candidate.slideId === slide.id);

  assert.equal(group.role, "evidence-pack");
  assert.equal(group.keepTogether, true);
  assert.equal(group.splitPriority <= 2, true);
  assert.equal(group.primaryBlockId, slide.blocks.find((block) => block.type === "paragraph").id);
  assert.deepEqual(group.supportingBlockIds.map((id) => slide.blocks.find((block) => block.id === id)?.type), ["bulletList", "table", "image"]);
});

test("coherence groups classify Korean purpose usage condition reason and improvement cues", () => {
  const presentation = planPresentation(parseMarkdown([
    "# Demo",
    "",
    "## 설계 조건",
    "",
    "목적: 텍스트 넘침을 줄인다.",
    "",
    "- 용도: 발표 자료 자동 생성",
    "- 조건: agent 없이 동작",
    "- 이유: PPTX 출력 품질 유지",
    "- 개선: 성능 저하 탐지",
  ].join("\n")), defaultConfig);
  const slide = presentation.slides.find((candidate) => candidate.title === "설계 조건");
  const group = presentation.coherenceGroups.find((candidate) => candidate.slideId === slide.id);

  assert.equal(group.role, "argument");
  assert.equal(group.semanticSignals.includes("claim"), true);
  assert.equal(group.semanticSignals.includes("action"), true);
  assert.equal(group.semanticSignals.includes("risk"), true);
  assert.equal(group.semanticSignals.includes("decision"), true);
  assert.equal(group.semanticSignals.includes("metric"), true);
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

test("design tokens can derive Adobe-style color combinations for PPT and charts", () => {
  const tokens = resolveDesignTokens("clean", {
    ...defaultConfig.theme,
    primaryColor: "#2563EB",
    colorCombination: "complementary",
  });

  assert.equal(tokens.colorCombination, "complementary");
  assert.equal(tokens.themeColors.accent1, "2563EB");
  assert.equal(tokens.themeColors.accent2, "F0AA11");
  assert.deepEqual(tokens.chartColors.slice(0, 3), ["2563EB", "F0AA11", "31B5EA"]);
  assert.equal(tokens.surfaceLine, "D3DDF0");
});

test("design tokens register a full contrast-aware harmony palette in PPT theme slots", () => {
  const tokens = resolveDesignTokens("clean", {
    ...defaultConfig.theme,
    primaryColor: "#2563EB",
    colorCombination: "split-complementary",
  });
  const accents = [
    tokens.themeColors.accent1,
    tokens.themeColors.accent2,
    tokens.themeColors.accent3,
    tokens.themeColors.accent4,
    tokens.themeColors.accent5,
    tokens.themeColors.accent6,
  ];

  assert.equal(tokens.themeColors.accent1, "2563EB");
  assert.equal(new Set(accents).size >= 5, true);
  assert.equal(tokens.chartColors.slice(0, 6).every((color) => accents.includes(color)), true);
  assert.notEqual(tokens.themeColors.accent5, tokens.surfaceFill);
  assert.notEqual(tokens.themeColors.accent6, tokens.surfaceLine);
  assert.equal(contrastRatio(tokens.themeColors.accent6, tokens.backgroundColor) >= 3, true);
  assert.equal(tokens.paletteSeed.sourceModel, "adobe-color-wheel");
  assert.equal(tokens.paletteSeed.harmony, "split-complementary");
  assert.equal(tokens.paletteSeed.usage.sequence, "brightness-variation");
  assert.equal(tokens.paletteSeed.usage.contrast, "hue-opposition");
  assert.deepEqual(tokens.paletteSeed.chart, tokens.chartColors);
  assert.equal(tokens.paletteSeed.sequence.includes(tokens.themeColors.accent1), true);
  assert.equal(tokens.paletteSeed.contrast.every((color) => accents.includes(color)), true);
});

test("design tokens separate decoration style from main color seed", () => {
  const tokens = resolveDesignTokens("glass", {
    ...defaultConfig.theme,
    primaryColor: "#8A4FFF",
    colorSeed: "#8A4FFF",
    colorCombination: "analogous",
  });

  assert.equal(tokens.name, "glass");
  assert.equal(tokens.decorationStyle, "glass");
  assert.equal(tokens.primaryColor, "8A4FFF");
  assert.equal(tokens.paletteSeed.base, "8A4FFF");
  assert.equal(tokens.colorCombination, "analogous");
  assert.equal(tokens.cards, true);
  assert.equal(tokens.surfacePolicy.shapeSource, "svg");
  assert.equal(tokens.surfacePolicy.cornerScale, "fixed");
});

test("design tokens expose grid data and magazine decoration styles", () => {
  const grid = resolveDesignTokens("grid", {
    ...defaultConfig.theme,
    colorSeed: "#DC2626",
    colorCombination: "complementary",
  });
  const data = resolveDesignTokens("data", {
    ...defaultConfig.theme,
    colorSeed: "#F59E0B",
    colorCombination: "monochromatic",
  });
  const magazine = resolveDesignTokens("magazine", {
    ...defaultConfig.theme,
    colorSeed: "#C2410C",
    colorCombination: "triadic",
  });

  assert.equal(grid.decorationStyle, "grid");
  assert.equal(data.decorationStyle, "data");
  assert.equal(magazine.decorationStyle, "magazine");
  assert.equal(grid.surfacePolicy.shadow, "none");
  assert.equal(data.surfacePolicy.shadow, "none");
  assert.equal(magazine.surfacePolicy.cornerScale, "fixed");
  assert.equal(grid.primaryColor, "DC2626");
  assert.equal(data.paletteSeed.base, "F59E0B");
  assert.equal(magazine.colorCombination, "triadic");
});

test("design tokens expose minimalism and newmorphism decoration styles", () => {
  const minimalism = resolveDesignTokens("minimalism", {
    ...defaultConfig.theme,
    colorSeed: "#111827",
    colorCombination: "monochromatic",
  });
  const newmorphism = resolveDesignTokens("newmorphism", {
    ...defaultConfig.theme,
    colorSeed: "#4F6F8F",
    colorCombination: "analogous",
  });

  assert.equal(minimalism.decorationStyle, "minimalism");
  assert.equal(minimalism.surfacePolicy.shadow, "none");
  assert.equal(minimalism.surfacePolicy.shapeSource, "svg");
  assert.equal(newmorphism.decorationStyle, "newmorphism");
  assert.equal(newmorphism.surfacePolicy.shadow, "newmorphic");
  assert.equal(newmorphism.surfaceFill, "E9EEF5");
  assert.equal(newmorphism.paletteSeed.base, "4F6F8F");
});

test("decoration style catalog omits legacy color-only design presets", () => {
  assert.deepEqual(DECORATION_STYLE_NAMES, [
    "clean",
    "executive",
    "editorial",
    "technical",
    "minimalism",
    "newmorphism",
    "glass",
    "grid",
    "data",
    "magazine",
  ]);
  assert.equal(DECORATION_STYLE_NAMES.includes("plain"), false);
  assert.equal(DECORATION_STYLE_NAMES.includes("simple"), false);
  assert.equal(DESIGN_PRESET_NAMES.includes("nord"), true);
  assert.equal(DECORATION_STYLE_NAMES.includes("nord"), false);
  assert.equal(resolveDesignTokens("nord", defaultConfig.theme).decorationStyle, "nord");
});

function contentSlideIdsByTitle(presentation) {
  return new Map(
    presentation.slides
      .filter((slide) => slide.role === "content")
      .map((slide) => [slide.title, slide.id]),
  );
}

function contrastRatio(left, right) {
  const l1 = relativeLuminance(hexToRgb(left));
  const l2 = relativeLuminance(hexToRgb(right));
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

function relativeLuminance(rgb) {
  const channels = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function hexToRgb(hex) {
  const normalized = hex.replace(/^#/, "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
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
