import assert from "node:assert/strict";
import test from "node:test";
import { coherenceValidationDiagnostics, createCoherenceValidationSummary, createPolishQualitySummary, visualValidationDiagnostics } from "../dist/index.js";

const theme = {
  fontFamily: "Aptos",
  backgroundColor: "#ffffff",
  textColor: "#111111",
  primaryColor: "#2563eb",
  titleFontSize: 32,
  bodyFontSize: 16,
  captionFontSize: 11,
  minFontSize: 8,
  lineHeight: 1.2,
};

test("visual validation flags out-of-bounds regions", () => {
  const diagnostics = visualValidationDiagnostics({
    version: "1.0",
    slideSize: { width: 13.333, height: 7.5, unit: "in" },
    theme,
    slides: [{
      id: "layout-1",
      sourceSlideId: "slide-1",
      index: 0,
      layout: { preset: "title-body" },
      background: {},
      overflowPolicy: { action: "reflow", minFontSize: 8, maxShrinkSteps: 4 },
      regions: [{ id: "bad", role: "body", x: 12.8, y: 1, w: 1, h: 1, zIndex: 1, blockIds: ["b1"] }],
    }],
    diagnostics: [],
  });
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "VISUAL_REGION_BOUNDS"), true);
});

test("coherence validation reports detached captions from presentation/layout IR", () => {
  const presentation = {
    version: "1.0",
    meta: { title: "Deck" },
    outline: [],
    slides: [{
      id: "slide-1",
      index: 0,
      role: "content",
      title: "Evidence",
      headingPath: ["Evidence"],
      source: {},
      blocks: [
        { id: "b1", type: "paragraph", text: "The result shows a measurable improvement." },
        { id: "b2", type: "image", alt: "Result chart", src: "chart.png" },
        { id: "b3", type: "paragraph", text: "A long follow-up paragraph that is not written as a figure caption." },
      ],
      intent: "image",
      tags: [],
    }],
    coherenceGroups: [{
      id: "cg-1",
      slideId: "slide-1",
      headingPath: ["Evidence"],
      primaryBlockId: "b1",
      supportingBlockIds: ["b2", "b3"],
      role: "evidence-pack",
      keepTogether: true,
      splitPriority: 1,
      blockRoles: { b1: "claim", b2: "evidence", b3: "evidence" },
    }],
    assets: [],
    diagnostics: [],
  };
  const layout = {
    version: "1.0",
    slideSize: { width: 13.333, height: 7.5, unit: "in" },
    theme,
    slides: [{
      id: "layout-1",
      sourceSlideId: "slide-1",
      index: 0,
      layout: { preset: "image-focus" },
      background: {},
      overflowPolicy: { action: "reflow", minFontSize: 8, maxShrinkSteps: 4 },
      regions: [{ id: "body", role: "body", x: 1, y: 1, w: 5, h: 4, zIndex: 1, blockIds: ["b1", "b2", "b3"] }],
    }],
    diagnostics: [],
  };
  const diagnostics = coherenceValidationDiagnostics(presentation, layout);
  const summary = createCoherenceValidationSummary(presentation, layout);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "DETACHED_CAPTION"), true);
  assert.equal(summary.captionDetached, 1);
  assert.equal(summary.intraSlideSpacingCoverage.notApplicableSlides, 1);
  assert.equal(summary.intraSlideSpacingCoverage.notApplicable[0].slideId, "slide-1");
});

test("coherence validation reports inconsistent intra-slide content spacing", () => {
  const presentation = {
    version: "1.0",
    meta: { title: "Deck" },
    outline: [],
    slides: [{
      id: "slide-1",
      index: 0,
      role: "content",
      title: "Spacing",
      headingPath: ["Spacing"],
      source: {},
      blocks: [
        { id: "b1", type: "paragraph", text: "Left claim." },
        { id: "b2", type: "paragraph", text: "Middle evidence." },
        { id: "b3", type: "image", alt: "Right proof", src: "proof.png" },
      ],
      intent: "evidence",
      tags: [],
    }],
    coherenceGroups: [{
      id: "cg-1",
      slideId: "slide-1",
      headingPath: ["Spacing"],
      primaryBlockId: "b1",
      supportingBlockIds: ["b2", "b3"],
      role: "evidence-pack",
      keepTogether: true,
      splitPriority: 1,
      blockRoles: { b1: "claim", b2: "evidence", b3: "evidence" },
    }],
    assets: [],
    diagnostics: [],
  };
  const layout = {
    version: "1.0",
    slideSize: { width: 1280, height: 720, unit: "px" },
    theme,
    slides: [{
      id: "layout-1",
      sourceSlideId: "slide-1",
      index: 0,
      layout: { preset: "chart-table" },
      background: {},
      overflowPolicy: { action: "reflow", minFontSize: 8, maxShrinkSteps: 4 },
      regions: [
        { id: "title", role: "title", x: 80, y: 40, w: 1120, h: 60, zIndex: 1, blockIds: ["__title:slide-1"] },
        { id: "left", role: "body", x: 80, y: 160, w: 260, h: 320, zIndex: 1, blockIds: ["b1"] },
        { id: "middle", role: "body", x: 380, y: 160, w: 260, h: 320, zIndex: 1, blockIds: ["b2"] },
        { id: "right", role: "image", x: 720, y: 160, w: 260, h: 320, zIndex: 1, blockIds: ["b3"] },
      ],
    }],
    diagnostics: [],
  };

  const diagnostics = coherenceValidationDiagnostics(presentation, layout);
  const summary = createCoherenceValidationSummary(presentation, layout);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "INCONSISTENT_INTRA_SLIDE_SPACING"), true);
  assert.equal(summary.intraSlideSpacingDrift, 1);
  assert.equal(summary.intraSlideSpacingCoverage.checkedSlides, 1);
  assert.equal(summary.intraSlideSpacingCoverage.skippedSlides, 0);
  assert.equal(summary.intraSlideSpacingCoverage.notApplicableSlides, 0);
  assert.equal(summary.intraSlideSpacingCoverage.checkedGroups > 0, true);
  assert.equal(summary.checks.intraSlideSpacing, false);
});

test("coherence validation compares matching column gaps within a slide", () => {
  const presentation = {
    version: "1.0",
    meta: { title: "Deck" },
    outline: [],
    slides: [{
      id: "slide-1",
      index: 0,
      role: "content",
      title: "Columns",
      headingPath: ["Columns"],
      source: {},
      blocks: [
        { id: "b1", type: "diagram", nodes: [], edges: [] },
        { id: "b2", type: "paragraph", text: "Feature summary." },
        { id: "b3", type: "chart", data: { labels: [], series: [] } },
        { id: "b4", type: "table", rows: [] },
      ],
      intent: "diagram",
      tags: [],
    }],
    coherenceGroups: [],
    assets: [],
    diagnostics: [],
  };
  const layout = {
    version: "1.0",
    slideSize: { width: 1280, height: 720, unit: "px" },
    theme,
    slides: [{
      id: "layout-1",
      sourceSlideId: "slide-1",
      index: 0,
      layout: { preset: "pipeline-one-page" },
      background: {},
      overflowPolicy: { action: "reflow", minFontSize: 8, maxShrinkSteps: 4 },
      regions: [
        { id: "diagram", role: "diagram", x: 70, y: 110, w: 660, h: 200, zIndex: 1, blockIds: ["b1"] },
        { id: "features", role: "body", x: 70, y: 330, w: 660, h: 300, zIndex: 1, blockIds: ["b2"] },
        { id: "chart", role: "chart", x: 770, y: 110, w: 440, h: 210, zIndex: 1, blockIds: ["b3"] },
        { id: "table", role: "table", x: 770, y: 355, w: 440, h: 260, zIndex: 1, blockIds: ["b4"] },
      ],
    }],
    diagnostics: [],
  };

  const diagnostics = coherenceValidationDiagnostics(presentation, layout);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "INCONSISTENT_INTRA_SLIDE_SPACING"), true);
});

test("coherence validation ignores radial layouts for linear spacing checks", () => {
  const presentation = {
    version: "1.0",
    meta: { title: "Deck" },
    outline: [],
    slides: [{
      id: "slide-1",
      index: 0,
      role: "content",
      title: "Radial",
      headingPath: ["Radial"],
      source: {},
      blocks: [],
      intent: "list",
      tags: [],
    }],
    coherenceGroups: [],
    assets: [],
    diagnostics: [],
  };
  const layout = {
    version: "1.0",
    slideSize: { width: 13.333, height: 7.5, unit: "in" },
    theme,
    slides: [{
      id: "layout-1",
      sourceSlideId: "slide-1",
      index: 0,
      layout: { preset: "pentagon", direction: "radial" },
      background: {},
      overflowPolicy: { action: "reflow", minFontSize: 8, maxShrinkSteps: 4 },
      regions: [
        { id: "item-1", role: "item", x: 5.1, y: 1.4, w: 3.0, h: 1.2, zIndex: 1, blockIds: ["b1"] },
        { id: "item-2", role: "item", x: 8.4, y: 2.8, w: 3.0, h: 1.2, zIndex: 1, blockIds: ["b2"] },
        { id: "item-3", role: "item", x: 7.1, y: 5.0, w: 3.0, h: 1.2, zIndex: 1, blockIds: ["b3"] },
        { id: "item-4", role: "item", x: 3.2, y: 5.0, w: 3.0, h: 1.2, zIndex: 1, blockIds: ["b4"] },
        { id: "item-5", role: "item", x: 1.9, y: 2.8, w: 3.0, h: 1.2, zIndex: 1, blockIds: ["b5"] },
      ],
    }],
    diagnostics: [],
  };

  const diagnostics = coherenceValidationDiagnostics(presentation, layout);
  const summary = createCoherenceValidationSummary(presentation, layout);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "INCONSISTENT_INTRA_SLIDE_SPACING"), false);
  assert.equal(summary.intraSlideSpacingCoverage.checkedSlides, 0);
  assert.equal(summary.intraSlideSpacingCoverage.skippedSlides, 1);
  assert.equal(summary.intraSlideSpacingCoverage.skipped[0].reason.includes("radial"), true);

  const pentagonWithoutDirection = structuredClone(layout);
  delete pentagonWithoutDirection.slides[0].layout.direction;
  const pentagonSummary = createCoherenceValidationSummary(presentation, pentagonWithoutDirection);
  assert.equal(pentagonSummary.intraSlideSpacingCoverage.skippedSlides, 1);
});

test("coherence validation reports text colors that are not grayscale brightness adjustments", () => {
  const presentation = {
    version: "1.0",
    meta: { title: "Deck" },
    outline: [],
    slides: [{
      id: "slide-1",
      index: 0,
      role: "content",
      title: "Color",
      headingPath: ["Color"],
      source: {},
      blocks: [{ id: "b1", type: "paragraph", text: "Readable body text." }],
      intent: "standard",
      tags: [],
    }],
    coherenceGroups: [],
    assets: [],
    diagnostics: [],
  };
  const layout = {
    version: "1.0",
    slideSize: { width: 13.333, height: 7.5, unit: "in" },
    theme: { ...theme, backgroundColor: "#ffffff", textColor: "#2563eb" },
    slides: [{
      id: "layout-1",
      sourceSlideId: "slide-1",
      index: 0,
      layout: { preset: "title-body" },
      background: {},
      overflowPolicy: { action: "reflow", minFontSize: 8, maxShrinkSteps: 4 },
      regions: [{ id: "body", role: "body", x: 1, y: 1, w: 5, h: 4, zIndex: 1, blockIds: ["b1"] }],
    }],
    diagnostics: [],
  };

  const diagnostics = coherenceValidationDiagnostics(presentation, layout);
  const summary = createCoherenceValidationSummary(presentation, layout);

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TEXT_BACKGROUND_LUMINANCE_MISMATCH"), true);
  assert.equal(summary.textBackgroundLuminanceDrift, 1);
  assert.equal(summary.checks.textBackgroundLuminance, false);
});

test("polish quality summary maps AI PPT polish chapters to deterministic checks", () => {
  const presentation = {
    version: "1.0",
    meta: { title: "Deck" },
    outline: [],
    slides: [
      {
        id: "slide-cover",
        index: 0,
        role: "cover",
        title: "Polished Deck",
        headingPath: ["Polished Deck"],
        source: {},
        blocks: [],
        intent: "title",
        tags: [],
      },
      {
        id: "slide-quote",
        index: 1,
        role: "content",
        title: "Key Message",
        headingPath: ["Polished Deck", "Key Message"],
        source: {},
        blocks: [{ id: "quote-1", type: "quote", text: "One strong point should be highlighted." }],
        intent: "quote",
        tags: [],
      },
    ],
    coherenceGroups: [],
    assets: [],
    diagnostics: [],
  };
  const layout = {
    version: "1.0",
    slideSize: { width: 13.333, height: 7.5, unit: "in" },
    theme: { ...theme, titleFontSize: 34, bodyFontSize: 19, minFontSize: 16 },
    slides: [
      {
        id: "layout-cover",
        sourceSlideId: "slide-cover",
        index: 0,
        layout: { preset: "cover" },
        background: {},
        overflowPolicy: { action: "reflow", minFontSize: 16, maxShrinkSteps: 4 },
        regions: [
          { id: "title", role: "title", x: 0.8, y: 1, w: 11, h: 1, zIndex: 1, blockIds: ["__title:slide-cover"], typography: { fontSize: 34, minFontSize: 24 } },
        ],
      },
      {
        id: "layout-quote",
        sourceSlideId: "slide-quote",
        index: 1,
        layout: { preset: "key-message" },
        background: {},
        overflowPolicy: { action: "reflow", minFontSize: 16, maxShrinkSteps: 4 },
        regions: [
          { id: "title", role: "title", x: 0.8, y: 0.5, w: 11, h: 0.7, zIndex: 1, blockIds: ["__title:slide-quote"], typography: { fontSize: 32, minFontSize: 24 } },
          { id: "key-message", role: "body", x: 1, y: 1.6, w: 10.8, h: 1.4, zIndex: 1, blockIds: ["quote-1"], typography: { fontSize: 24, minFontSize: 16 } },
        ],
      },
    ],
    diagnostics: [],
  };

  const summary = createPolishQualitySummary(presentation, layout, {
    comparisonPresets: ["plain", "executive"],
  });

  assert.equal(summary.checked, true);
  assert.equal(summary.source.videoId, "GX0Fn-5YqKE");
  assert.equal(summary.chapters.fontHierarchy.passed, true);
  assert.equal(summary.chapters.layoutComposition.passed, true);
  assert.equal(summary.chapters.highlightPage.passed, true);
  assert.equal(summary.chapters.coverPage.passed, true);
  assert.equal(summary.chapters.detailPolish.passed, true);
  assert.equal(summary.chapters.beforeAfterComparison.passed, true);
  assert.deepEqual(summary.chapters.beforeAfterComparison.presets, ["plain", "executive"]);
});
