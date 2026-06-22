import assert from "node:assert/strict";
import test from "node:test";
import { coherenceValidationDiagnostics, createCoherenceValidationSummary, visualValidationDiagnostics } from "../dist/index.js";

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
});
