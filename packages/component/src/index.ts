export const componentKinds = [
  "card",
  "stat-card",
  "badge",
  "callout",
  "button-pill",
  "segmented-control",
  "progress-bar",
  "progress-indicator",
  "stepper",
  "timeline",
  "quote-card",
  "avatar-label",
  "breadcrumb",
  "separator",
  "tabs-strip",
  "tree-view",
  "hero-block",
  "toast-note",
  "table-card",
] as const;

export type MdprComponentKind = typeof componentKinds[number];

export type ComponentDiagnostic = {
  level: "info" | "warning" | "error";
  code: string;
  message: string;
};

export type ComponentSlot = {
  text?: string;
  blockIds?: string[];
  role?: "label" | "value" | "body" | "caption" | "icon";
};

export type ComponentIR = {
  schemaVersion: "mdpr-component-ir-v1";
  id: string;
  kind: MdprComponentKind;
  semanticRole?: "claim" | "evidence" | "metric" | "risk" | "action" | "caption";
  slots: Record<string, ComponentSlot>;
  tokenRefs: {
    fill?: string;
    stroke?: string;
    text?: string;
    accent?: string;
    radius?: string;
    shadow?: string;
    typography?: string;
    spacing?: string;
  };
  editable: true;
};

export type ComponentValidationResult = {
  valid: boolean;
  diagnostics: ComponentDiagnostic[];
};

export function validateComponentIR(value: unknown): ComponentValidationResult {
  const diagnostics: ComponentDiagnostic[] = [];
  const component = asRecord(value);
  if (!component) return { valid: false, diagnostics: [error("COMPONENT_INVALID", "Component IR must be an object.")] };
  if (component.schemaVersion !== "mdpr-component-ir-v1") diagnostics.push(error("COMPONENT_SCHEMA_VERSION", "schemaVersion must be mdpr-component-ir-v1."));
  if (!componentKinds.includes(component.kind as MdprComponentKind)) diagnostics.push(error("COMPONENT_KIND_INVALID", "Component kind is not registered."));
  if (component.editable !== true) diagnostics.push(error("COMPONENT_NOT_EDITABLE", "Primary slide components must remain editable."));
  if (!asRecord(component.slots) || Object.keys(asRecord(component.slots) ?? {}).length === 0) diagnostics.push(error("COMPONENT_SLOTS_INVALID", "slots must be a non-empty object."));
  const tokenRefs = asRecord(component.tokenRefs);
  if (!tokenRefs) diagnostics.push(error("COMPONENT_TOKEN_REFS_INVALID", "tokenRefs must be an object."));
  else {
    for (const [key, value] of Object.entries(tokenRefs)) {
      if (typeof value !== "string") diagnostics.push(error("COMPONENT_TOKEN_REF_INVALID", `tokenRefs.${key} must be a token string.`));
      if (typeof value === "string" && /^#|rgba?\(/i.test(value)) diagnostics.push(error("COMPONENT_RAW_TOKEN", `tokenRefs.${key} must reference a token, not a raw color.`));
    }
  }
  for (const key of ["x", "y", "w", "h", "box", "color", "fontSize", "zOrder", "recipeId", "variantId", "rendererObjectId"]) {
    if (Object.prototype.hasOwnProperty.call(component, key)) {
      diagnostics.push(error("COMPONENT_FORBIDDEN_FIELD", `${key} is a final decision field and cannot be stored in ComponentIR.`));
    }
  }
  return { valid: diagnostics.every((diagnostic) => diagnostic.level !== "error"), diagnostics };
}

export function summarizeComponentRegistry(): {
  static: MdprComponentKind[];
  data: MdprComponentKind[];
  process: MdprComponentKind[];
  text: MdprComponentKind[];
} {
  return {
    static: ["card", "badge", "callout", "button-pill", "segmented-control", "separator", "toast-note"],
    data: ["stat-card", "progress-bar", "table-card"],
    process: ["progress-indicator", "stepper", "timeline", "breadcrumb", "tree-view", "tabs-strip"],
    text: ["quote-card", "avatar-label", "hero-block"],
  };
}

function error(code: string, message: string): ComponentDiagnostic {
  return { level: "error", code, message };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
