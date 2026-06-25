import test from "node:test";
import assert from "node:assert/strict";
import {
  componentKinds,
  summarizeComponentRegistry,
  validateComponentIR,
} from "../dist/index.js";

test("componentKinds exposes slide-native component taxonomy", () => {
  assert.ok(componentKinds.length >= 18);
  assert.ok(componentKinds.includes("card"));
  assert.ok(componentKinds.includes("stat-card"));
  assert.ok(componentKinds.includes("timeline"));
  assert.ok(componentKinds.includes("hero-block"));
});

test("validateComponentIR accepts tokenized editable slide components", () => {
  const result = validateComponentIR({
    schemaVersion: "mdpr-component-ir-v1",
    id: "metric-1",
    kind: "stat-card",
    semanticRole: "metric",
    slots: {
      label: { text: "Activation" },
      value: { text: "42%" },
      detail: { text: "No rasterized primary content" },
    },
    tokenRefs: {
      fill: "surface.subtle",
      stroke: "line.muted",
      accent: "accent.primary",
      radius: "radius.md",
      typography: "type.metric",
    },
    editable: true,
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.diagnostics, []);
});

test("validateComponentIR rejects raw final style fields and non-editable primary content", () => {
  const result = validateComponentIR({
    schemaVersion: "mdpr-component-ir-v1",
    id: "bad-card",
    kind: "card",
    slots: { body: { text: "Raster card" } },
    tokenRefs: { fill: "#FFFFFF" },
    editable: false,
    x: 10,
  });

  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "COMPONENT_NOT_EDITABLE"));
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "COMPONENT_FORBIDDEN_FIELD"));
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "COMPONENT_RAW_TOKEN"));
});

test("summarizeComponentRegistry groups component families for rule-based selection", () => {
  const summary = summarizeComponentRegistry();
  assert.ok(summary.static.includes("card"));
  assert.ok(summary.data.includes("stat-card"));
  assert.ok(summary.process.includes("stepper"));
  assert.ok(summary.text.includes("quote-card"));
});
