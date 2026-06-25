export const diagramTypes = [
  "architecture",
  "flowchart",
  "sequence",
  "state-machine",
  "er",
  "timeline",
  "swimlane",
  "quadrant",
  "nested",
  "tree",
  "org-chart",
  "layer-stack",
  "venn",
  "pyramid",
  "funnel",
  "consultant-2x2",
] as const;

export type MdprDiagramType = typeof diagramTypes[number];

export type DiagramDiagnostic = {
  level: "info" | "warning" | "error";
  code: string;
  message: string;
};

export type DiagramNodeIR = {
  id: string;
  label: string;
  kind?: "input" | "process" | "decision" | "data" | "output" | "actor" | "system" | "annotation";
  focal?: boolean;
  group?: string;
};

export type DiagramEdgeIR = {
  from: string;
  to: string;
  label?: string;
  role?: "primary" | "secondary" | "exception" | "feedback";
  flowGroup?: string;
};

export type DiagramIR = {
  schemaVersion: "mdpr-diagram-ir-v1";
  id: string;
  type: MdprDiagramType;
  title?: string;
  nodes: DiagramNodeIR[];
  edges: DiagramEdgeIR[];
  tokens?: {
    surface?: string;
    accent?: string;
    rule?: string;
    text?: string;
  };
};

export type DiagramValidationResult = {
  valid: boolean;
  diagnostics: DiagramDiagnostic[];
};

export type DiagramTasteResult = {
  status: "pass" | "warning" | "fail";
  diagnostics: DiagramDiagnostic[];
  metrics: {
    nodeCount: number;
    edgeCount: number;
    focalCount: number;
    maxNodes: number;
    maxEdges: number;
  };
};

export type RoutedDiagramEdge = DiagramEdgeIR & {
  connector: "straight" | "elbow" | "curved";
  lineToken: "link.primary" | "link.secondary" | "link.exception" | "link.feedback";
};

export function validateDiagramIR(value: unknown): DiagramValidationResult {
  const diagnostics: DiagramDiagnostic[] = [];
  const diagram = asRecord(value);
  if (!diagram) return { valid: false, diagnostics: [error("DIAGRAM_INVALID", "Diagram IR must be an object.")] };
  if (diagram.schemaVersion !== "mdpr-diagram-ir-v1") diagnostics.push(error("DIAGRAM_SCHEMA_VERSION", "schemaVersion must be mdpr-diagram-ir-v1."));
  if (!diagramTypes.includes(diagram.type as MdprDiagramType)) diagnostics.push(error("DIAGRAM_TYPE_INVALID", "Diagram type is not registered."));
  const nodes = asArray(diagram.nodes);
  const edges = asArray(diagram.edges);
  if (!Array.isArray(diagram.nodes) || nodes.length === 0) diagnostics.push(error("DIAGRAM_NODES_INVALID", "nodes must be a non-empty array."));
  if (!Array.isArray(diagram.edges)) diagnostics.push(error("DIAGRAM_EDGES_INVALID", "edges must be an array."));

  const nodeIds = new Set<string>();
  nodes.forEach((node, index) => {
    const record = asRecord(node);
    if (!record || typeof record.id !== "string" || typeof record.label !== "string") {
      diagnostics.push(error("DIAGRAM_NODE_INVALID", `nodes[${index}] must include string id and label.`));
      return;
    }
    if (nodeIds.has(record.id)) diagnostics.push(error("DIAGRAM_NODE_DUPLICATE", `Duplicate node id: ${record.id}.`));
    nodeIds.add(record.id);
  });

  edges.forEach((edge, index) => {
    const record = asRecord(edge);
    if (!record || typeof record.from !== "string" || typeof record.to !== "string") {
      diagnostics.push(error("DIAGRAM_EDGE_INVALID", `edges[${index}] must include string from and to.`));
      return;
    }
    if (!nodeIds.has(record.from) || !nodeIds.has(record.to)) {
      diagnostics.push(error("DIAGRAM_EDGE_TARGET_INVALID", `edges[${index}] references an unknown node.`));
    }
  });

  return { valid: diagnostics.every((diagnostic) => diagnostic.level !== "error"), diagnostics };
}

export function scoreDiagramTaste(diagram: DiagramIR): DiagramTasteResult {
  const diagnostics = validateDiagramIR(diagram).diagnostics;
  const maxNodes = diagram.type === "sequence" || diagram.type === "timeline" ? 12 : 9;
  const maxEdges = diagram.type === "sequence" || diagram.type === "timeline" ? 14 : 12;
  const focalCount = diagram.nodes.filter((node) => node.focal).length;
  if (diagram.nodes.length > maxNodes || diagram.edges.length > maxEdges) {
    diagnostics.push(warning("DIAGRAM_COMPLEXITY_BUDGET_EXCEEDED", `Diagram has ${diagram.nodes.length} nodes and ${diagram.edges.length} edges; split overview/detail when possible.`));
  }
  if (focalCount > 2) {
    diagnostics.push(warning("DIAGRAM_ACCENT_BUDGET_EXCEEDED", `Diagram has ${focalCount} focal nodes; keep accent to one or two focal elements.`));
  }
  const hasError = diagnostics.some((diagnostic) => diagnostic.level === "error");
  const hasWarning = diagnostics.some((diagnostic) => diagnostic.level === "warning");
  return {
    status: hasError ? "fail" : hasWarning ? "warning" : "pass",
    diagnostics,
    metrics: {
      nodeCount: diagram.nodes.length,
      edgeCount: diagram.edges.length,
      focalCount,
      maxNodes,
      maxEdges,
    },
  };
}

export function routeDiagramEdges(diagram: DiagramIR): RoutedDiagramEdge[] {
  return diagram.edges.map((edge) => ({
    ...edge,
    connector: edge.role === "feedback" ? "curved" : edge.flowGroup ? "elbow" : "straight",
    lineToken: edge.role === "exception"
      ? "link.exception"
      : edge.role === "feedback"
        ? "link.feedback"
        : edge.role === "secondary"
          ? "link.secondary"
          : "link.primary",
  }));
}

function error(code: string, message: string): DiagramDiagnostic {
  return { level: "error", code, message };
}

function warning(code: string, message: string): DiagramDiagnostic {
  return { level: "warning", code, message };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
