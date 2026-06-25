import test from "node:test";
import assert from "node:assert/strict";
import {
  diagramTypes,
  routeDiagramEdges,
  scoreDiagramTaste,
  validateDiagramIR,
} from "../dist/index.js";

test("diagramTypes exposes the deterministic MDPR diagram grammar registry", () => {
  assert.ok(diagramTypes.length >= 15);
  assert.ok(diagramTypes.includes("architecture"));
  assert.ok(diagramTypes.includes("flowchart"));
  assert.ok(diagramTypes.includes("funnel"));
});

test("validateDiagramIR accepts editable node and connector diagrams", () => {
  const result = validateDiagramIR({
    schemaVersion: "mdpr-diagram-ir-v1",
    id: "diagram-1",
    type: "flowchart",
    title: "Runtime",
    nodes: [
      { id: "a", label: "Markdown", kind: "input" },
      { id: "b", label: "Layout", kind: "process", focal: true },
      { id: "c", label: "PPTX", kind: "output" },
    ],
    edges: [
      { from: "a", to: "b", label: "parse" },
      { from: "b", to: "c", label: "render" },
    ],
    tokens: {
      surface: "paper",
      accent: "accent",
      rule: "rule",
    },
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.diagnostics, []);
});

test("scoreDiagramTaste flags excessive complexity and accent overuse", () => {
  const nodes = Array.from({ length: 12 }, (_, index) => ({
    id: `n${index}`,
    label: `Node ${index}`,
    kind: "process",
    focal: index < 5,
  }));
  const edges = nodes.slice(1).map((node, index) => ({ from: nodes[index].id, to: node.id }));
  const result = scoreDiagramTaste({
    schemaVersion: "mdpr-diagram-ir-v1",
    id: "dense",
    type: "architecture",
    nodes,
    edges,
  });

  assert.equal(result.status, "warning");
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "DIAGRAM_COMPLEXITY_BUDGET_EXCEEDED"));
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "DIAGRAM_ACCENT_BUDGET_EXCEEDED"));
});

test("routeDiagramEdges keeps connector roles consistent unless flow groups differ", () => {
  const routed = routeDiagramEdges({
    schemaVersion: "mdpr-diagram-ir-v1",
    id: "routes",
    type: "flowchart",
    nodes: [
      { id: "start", label: "Start" },
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
    edges: [
      { from: "start", to: "a", role: "primary" },
      { from: "a", to: "b", role: "primary" },
    ],
  });

  assert.equal(routed[0].connector, routed[1].connector);
  assert.equal(routed[0].lineToken, routed[1].lineToken);
});
