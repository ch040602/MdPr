import test from "node:test";
import assert from "node:assert/strict";
import { applyOverrides } from "../dist/index.js";

test("post-layout overrides report setSplit as a pre-layout operation", () => {
  const layout = createLayout();
  const next = applyOverrides(layout, {
    version: "1.0",
    operations: [
      {
        op: "setSplit",
        target: { slideId: "slide-1" },
        value: { forceSingleSlide: true },
      },
    ],
  });

  assert.equal(next.slides.length, 1);
  assert.equal(next.slides[0].layout.preset, "title-body");
  assert.deepEqual(next.diagnostics, [
    {
      level: "warning",
      code: "OVERRIDE_REQUIRES_PRE_LAYOUT_PHASE",
      message: "setSplit must be applied before presentation planning and layout generation.",
      slideId: "slide-1",
    },
  ]);
});

test("patch-style split overrides normalize to the same pre-layout diagnostic", () => {
  const next = applyOverrides(createLayout(), {
    version: "1.0",
    overrides: [
      {
        id: "force-single-slide",
        target: { slideId: "slide-1" },
        patch: {
          split: { forceSingleSlide: true },
        },
      },
    ],
  });

  assert.equal(next.diagnostics[0].code, "OVERRIDE_REQUIRES_PRE_LAYOUT_PHASE");
});

test("slideId target can set layout and typography", () => {
  const next = applyOverrides(createLayout(), {
    version: "1.0",
    operations: [
      {
        op: "setLayout",
        target: { slideId: "slide-1" },
        value: { preset: "grid", columns: 2, rows: 2 },
      },
      {
        op: "setTypography",
        target: { slideId: "slide-1" },
        value: { fontSize: 24, minFontSize: 18 },
      },
    ],
  });

  assert.deepEqual(next.slides[0].layout, { preset: "grid", columns: 2, rows: 2 });
  assert.equal(next.slides[0].regions[0].typography.fontSize, 24);
  assert.equal(next.slides[0].regions[0].typography.minFontSize, 18);
});

test("title target resolves through Presentation IR when provided", () => {
  const next = applyOverrides(createLayout(), {
    version: "1.0",
    operations: [
      {
        op: "setLayout",
        target: { title: "Main Features" },
        value: { preset: "grid", columns: 2, rows: 2 },
      },
    ],
  }, {
    version: "1.0",
    meta: { title: "Demo" },
    outline: [],
    assets: [],
    diagnostics: [],
    slides: [
      {
        id: "slide-1",
        index: 1,
        role: "content",
        title: "Main Features",
        headingPath: ["Demo", "Main Features"],
        source: {},
        blocks: [],
        intent: "grid",
        tags: [],
      },
    ],
  });

  assert.deepEqual(next.slides[0].layout, { preset: "grid", columns: 2, rows: 2 });
  assert.deepEqual(next.diagnostics, []);
});

test("unresolved targets produce diagnostics", () => {
  const next = applyOverrides(createLayout(), {
    version: "1.0",
    operations: [
      {
        op: "setLayout",
        target: { slideId: "missing-slide" },
        value: { preset: "grid" },
      },
    ],
  });

  assert.deepEqual(next.diagnostics, [
    {
      level: "warning",
      code: "OVERRIDE_TARGET_NOT_FOUND",
      message: 'Override target not found: {"slideId":"missing-slide"}',
    },
  ]);
});

test("post-layout block overrides move hide and pin region block ids", () => {
  const next = applyOverrides(createLayout(), {
    version: "1.0",
    operations: [
      {
        op: "moveBlock",
        target: { slideId: "slide-1", blockId: "block-2" },
        value: { slot: "sidebar" },
      },
      {
        op: "pinBlock",
        target: { slideId: "slide-1", blockId: "block-3" },
        value: { slot: "sidebar" },
      },
      {
        op: "hideBlock",
        target: { slideId: "slide-1", blockId: "block-4" },
        value: {},
      },
    ],
  });
  const body = next.slides[0].regions.find((region) => region.id === "body");
  const sidebar = next.slides[0].regions.find((region) => region.id === "sidebar");

  assert.deepEqual(body.blockIds, ["block-1"]);
  assert.deepEqual(sidebar.blockIds, ["block-3", "block-2"]);
  assert.equal(sidebar.zIndex > body.zIndex, true);
  assert.deepEqual(next.diagnostics, []);
});

test("post-layout block overrides report missing block and slot targets", () => {
  const next = applyOverrides(createLayout(), {
    version: "1.0",
    operations: [
      {
        op: "moveBlock",
        target: { slideId: "slide-1", blockId: "missing-block" },
        value: { slot: "sidebar" },
      },
      {
        op: "pinBlock",
        target: { slideId: "slide-1", blockId: "block-1" },
        value: { slot: "missing-slot" },
      },
    ],
  });

  assert.deepEqual(next.diagnostics.map((diagnostic) => diagnostic.code), [
    "OVERRIDE_BLOCK_NOT_FOUND",
    "OVERRIDE_SLOT_NOT_FOUND",
  ]);
});

function createLayout() {
  return {
    version: "1.0",
    slideSize: { width: 13.333, height: 7.5, unit: "in" },
    theme: {
      fontFamily: "Arial",
      backgroundColor: "#fff",
      textColor: "#111",
      primaryColor: "#2563eb",
      titleFontSize: 34,
      bodyFontSize: 22,
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
        background: { color: "#fff", useTemplateBackground: true },
        regions: [
          {
            id: "body",
            role: "body",
            blockIds: ["block-1", "block-2", "block-3", "block-4"],
            x: 1,
            y: 1,
            w: 4,
            h: 3,
            zIndex: 10,
            typography: { fontSize: 20, minFontSize: 16, lineHeight: 1.2 },
          },
          {
            id: "sidebar",
            role: "body",
            blockIds: [],
            x: 6,
            y: 1,
            w: 3,
            h: 3,
            zIndex: 8,
            typography: { fontSize: 18, minFontSize: 16, lineHeight: 1.2 },
          },
        ],
        overflowPolicy: { action: "split", minFontSize: 18, maxShrinkSteps: 2 },
      },
    ],
    diagnostics: [],
  };
}
