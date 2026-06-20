import test from "node:test";
import assert from "node:assert/strict";
import { defaultConfig, parseMarkdown, planPresentation } from "@mdpresent/core";
import { planLayout } from "@mdpresent/layout";
import { renderHtml } from "../dist/index.js";

test("renderHtml renders actual Markdown content when given presentation and layout", () => {
  const doc = parseMarkdown([
    "# Demo Deck",
    "",
    "## Capabilities",
    "",
    "- Parse Markdown",
    "- Plan Layout",
    "- Render HTML",
    "- Apply Overrides",
  ].join("\n"));
  const presentation = planPresentation(doc, defaultConfig);
  const layout = planLayout(presentation, defaultConfig);

  const html = renderHtml({ presentation, layout });

  assert.match(html, /Demo Deck/);
  assert.match(html, /Capabilities/);
  assert.match(html, /Parse Markdown/);
  assert.match(html, /Render HTML/);
  assert.doesNotMatch(html, />item-1</);
});

test("renderHtml keeps LayoutIR-only rendering backward compatible", () => {
  const doc = parseMarkdown("# Demo\n\n## One\n\nBody text");
  const presentation = planPresentation(doc, defaultConfig);
  const layout = planLayout(presentation, defaultConfig);

  const html = renderHtml(layout);

  assert.match(html, /data-layout=/);
  assert.match(html, />title</);
});

test("renderHtml preserves ordered list numbering, nesting, and inline emphasis", () => {
  const doc = parseMarkdown([
    "# Demo Deck",
    "",
    "## Workflow",
    "",
    "1. Prepare **source**",
    "2. Render *deck*",
    "   - Validate output",
  ].join("\n"));
  const presentation = planPresentation(doc, defaultConfig);
  const layout = planLayout(presentation, defaultConfig);

  const html = renderHtml({ presentation, layout });

  assert.match(html, /<ol class="structured-list">/);
  assert.match(html, /class="item-number">1<\/span>/);
  assert.match(html, /Prepare <strong>source<\/strong>/);
  assert.match(html, /Render <em>deck<\/em>/);
  assert.match(html, /class="level-1"/);
});

test("renderHtml renders item regions from structured listItems-only blocks", () => {
  const deck = {
    presentation: {
      version: "1.0",
      meta: { title: "Structured HTML", language: "en" },
      outline: [],
      assets: [],
      diagnostics: [],
      slides: [
        {
          id: "slide-1",
          index: 0,
          role: "content",
          title: "Structured Items",
          headingPath: ["Structured Items"],
          source: {},
          intent: "list",
          tags: [],
          blocks: [
            {
              id: "list-1",
              type: "bulletList",
              listItems: [
                { text: "Structured HTML alpha", level: 0, ordered: false },
                { text: "Structured HTML beta", level: 0, ordered: false },
              ],
              listKind: "unordered",
            },
          ],
        },
      ],
    },
    layout: {
      version: "1.0",
      slideSize: { width: 13.333, height: 7.5, unit: "in" },
      theme: defaultConfig.theme,
      diagnostics: [],
      slides: [
        {
          id: "layout-slide-1",
          sourceSlideId: "slide-1",
          index: 0,
          layout: { preset: "grid" },
          background: { color: "#FFFFFF" },
          overflowPolicy: { action: "shrink", minFontSize: 14, maxShrinkSteps: 3 },
          regions: [
            { id: "title", role: "title", blockIds: [], x: 0.8, y: 0.45, w: 11.7, h: 0.8, zIndex: 10 },
            { id: "item-1", role: "item", blockIds: ["list-1#0"], x: 0.9, y: 1.6, w: 5.5, h: 1.7, zIndex: 10 },
            { id: "item-2", role: "item", blockIds: ["list-1#1"], x: 6.9, y: 1.6, w: 5.5, h: 1.7, zIndex: 10 },
          ],
        },
      ],
    },
  };

  const html = renderHtml(deck);

  assert.match(html, /Structured HTML alpha/);
  assert.match(html, /Structured HTML beta/);
  assert.doesNotMatch(html, />list-1#0</);
});

test("renderHtml separates block quotes as key-message regions with accent styling", () => {
  const doc = parseMarkdown([
    "# Demo Deck",
    "",
    "## Decision",
    "",
    "> Keep the Markdown source authoritative.",
    "",
    "Supporting detail stays below.",
  ].join("\n"));
  const presentation = planPresentation(doc, defaultConfig);
  const layout = planLayout(presentation, defaultConfig);

  const html = renderHtml({ presentation, layout });

  assert.match(html, /data-layout="key-message"/);
  assert.match(html, /class="region body surface two-corner-left key-message"/);
  assert.match(html, /<blockquote>Keep the Markdown source authoritative\.<\/blockquote>/);
  assert.match(html, /\.surface\.two-corner-left/);
});

test("renderHtml marks pipeline diagrams with selected graph arrangements", () => {
  const vertical = renderHtmlForMarkdown([
    "# Demo Deck",
    "",
    "## Long Pipeline",
    "",
    "Deep Markdown semantic extraction => Presentation intermediate representation normalization => Editable renderer output",
  ].join("\n"));
  const reverseU = renderHtmlForMarkdown([
    "# Demo Deck",
    "",
    "## Many Steps",
    "",
    "A => B => C => D => E => F => G => H",
  ].join("\n"));
  const cycle = renderHtmlForMarkdown([
    "# Demo Deck",
    "",
    "## Loop",
    "",
    "Plan => Render => Review => Plan",
  ].join("\n"));

  assert.match(vertical, /data-arrangement="vertical"/);
  assert.match(reverseU, /data-arrangement="reverse-u"/);
  assert.match(cycle, /data-arrangement="cycle"/);
  assert.match(reverseU, /class="pipeline-connectors"/);
  assert.equal((reverseU.match(/class="pipeline-connector"/g) ?? []).length >= 7, true);
  assert.match(reverseU, /marker-end="url\(#pipeline-arrow-/);
  assert.doesNotMatch(reverseU, /NaN|Infinity/);
  assert.match(reverseU, /points="[0-9.,\s]+"/);
  assert.doesNotMatch(reverseU, /class="pipeline-edge"/);
});

test("renderHtml applies shared design preset tokens from LayoutIR", () => {
  const config = structuredClone(defaultConfig);
  config.theme.designPreset = "nord";
  const doc = parseMarkdown("# Demo Deck\n\n## Theme\n\nBody text");
  const presentation = planPresentation(doc, config);
  const layout = planLayout(presentation, config);

  const html = renderHtml({ presentation, layout });

  assert.match(html, /--bg: #2E3440;/);
  assert.match(html, /--text: #ECEFF4;/);
  assert.match(html, /--primary: #88C0D0;/);
  assert.match(html, /--surface: #3B4252;/);
});

test("renderHtml separates decoration style from theme color seed", () => {
  const config = structuredClone(defaultConfig);
  config.theme.decorationStyle = "glass";
  config.theme.colorSeed = "#8A4FFF";
  config.theme.colorCombination = "analogous";
  const doc = parseMarkdown("# Demo Deck\n\n## Theme\n\n- Body text");
  const presentation = planPresentation(doc, config);
  const layout = planLayout(presentation, config);

  const html = renderHtml({ presentation, layout });

  assert.equal(layout.theme.decorationStyle, "glass");
  assert.equal(layout.theme.colorSeed, "#8A4FFF");
  assert.match(html, /--primary: #8A4FFF;/);
  assert.match(html, /--surface: #10182C;/);
  assert.match(html, /-webkit-backdrop-filter: blur\(18px\) saturate\(140%\)/);
  assert.match(html, /backdrop-filter: blur\(18px\) saturate\(140%\)/);
  assert.match(html, /linear-gradient\(135deg, rgba\(255,255,255,.2\)/);
});

test("renderHtml renders table blocks as bounded HTML tables", () => {
  const html = renderHtmlForMarkdown([
    "# Demo Deck",
    "",
    "## Table",
    "",
    "| Stage | Coverage | Defects |",
    "| --- | ---: | ---: |",
    "| Parser | 92 | 3 |",
    "| Layout | 88 | 5 |",
  ].join("\n"));

  assert.match(html, /<table class="mdpr-table">/);
  assert.match(html, /class="region body surface ticket/);
  assert.match(html, /<th>Coverage<\/th>/);
  assert.match(html, /<td class="numeric">92<\/td>/);
  assert.match(html, /vertical-align: middle/);
  assert.doesNotMatch(html, /Stage \| Coverage \| Defects/);
});

test("renderHtml applies theme surface grammar in Actions previews", () => {
  const config = structuredClone(defaultConfig);
  config.theme.decorationStyle = "magazine";
  const doc = parseMarkdown("# Demo Deck\n\n## Cards\n\n- Alpha\n- Beta\n- Gamma\n- Delta");
  const presentation = planPresentation(doc, config);
  const layout = planLayout(presentation, config);

  const html = renderHtml({ presentation, layout });

  assert.match(html, /body data-theme-style="magazine"/);
  assert.match(html, /class="region item surface flag-drop/);
  assert.match(html, /class="region item surface two-corner-right/);
  assert.match(html, /class="region item surface notched-corner/);
  assert.match(html, /body\[data-theme-style="magazine"\] \.slide::before/);
  assert.doesNotMatch(html, /circle-vine/);
});

test("renderHtml exposes composition classes for stronger Actions previews", () => {
  const html = renderHtmlForMarkdown([
    "# Demo Deck",
    "",
    "## Evidence",
    "",
    "Chart slides keep numeric proof visible beside a compact table.",
    "",
    "```chart",
    "labels: Parser, Layout, PPTX",
    "Coverage: 92, 88, 95",
    "```",
    "",
    "| Stage | Coverage |",
    "| --- | ---: |",
    "| Parser | 92 |",
    "| Layout | 88 |",
  ].join("\n"));

  assert.match(html, /class="slide composition composition-chart-table"/);
  assert.match(html, /data-composition="chart-table"/);
  assert.match(html, /\.composition-chart-table \.chart/);
  assert.match(html, /\.composition-cover \.title/);
});

test("renderHtml renders proof object chart variants instead of text fallbacks", () => {
  const html = renderHtmlForMarkdown([
    "# Demo Deck",
    "",
    "## Proof Objects",
    "",
    "```arc-ring",
    "labels: Validated, Remaining",
    "Coverage: 84, 16",
    "```",
    "",
    "```gauge",
    "labels: Readiness",
    "Score: 91",
    "```",
    "",
    "```connected-strip",
    "Parse, 30",
    "Plan, 62",
    "Render, 86",
    "Review, 94",
    "```",
  ].join("\n"));

  assert.match(html, /class="proof-object proof-arc-ring"/);
  assert.match(html, /class="proof-object proof-gauge"/);
  assert.match(html, /class="proof-object proof-connected-strip"/);
  assert.match(html, /data-proof-kind="arc-ring"/);
  assert.doesNotMatch(html, /Coverage: 84, 16/);
  assert.doesNotMatch(html, /Value: 30, 62, 86, 94/);
});

function renderHtmlForMarkdown(markdown) {
  const presentation = planPresentation(parseMarkdown(markdown), defaultConfig);
  const layout = planLayout(presentation, defaultConfig);
  return renderHtml({ presentation, layout });
}
