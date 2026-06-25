export type PackDiagnostic = {
  level: "info" | "warning" | "error";
  code: string;
  message: string;
};

export type MdprPack = {
  schemaVersion: "mdpr-pack-v1";
  kind: "theme-component-pack" | "style-pack" | "component-pack" | "diagram-pack";
  source: {
    kind: "design-md" | "html-analysis" | "mdpr-ppt" | "manual";
    sourceSha256: string;
    generatedBy?: "mdpr-skill" | "mdpr-ppt" | "mdpresent" | "user";
    approved: boolean;
  };
  themeTokens: Record<string, unknown>;
  componentTokens: Record<string, unknown>;
  diagramTokens: Record<string, unknown>;
  components: Array<Record<string, unknown>>;
  pptEffectMappings: Array<Record<string, unknown>>;
  constraints: {
    editablePrimaryContent: boolean;
    allowRasterBackgroundOnly: boolean;
    maxAccentRatio: number;
  };
};

export type PackValidationResult = {
  valid: boolean;
  diagnostics: PackDiagnostic[];
};

export type ImportPackCandidateInput = {
  candidate: unknown;
  approved: boolean;
};

export type ImportPackCandidateResult = {
  pack: MdprPack;
  diagnostics: PackDiagnostic[];
};

export type PackPreview = {
  kind: MdprPack["kind"];
  sourceKind: MdprPack["source"]["kind"];
  approved: boolean;
  colorCount: number;
  themeColorCount: number;
  componentCount: number;
  nativeEditableEffectCount: number;
  rasterRiskEffectCount: number;
  unsupportedEffectCount: number;
};

export function validateMdprPack(value: unknown): PackValidationResult {
  const diagnostics: PackDiagnostic[] = [];
  const pack = asRecord(value);
  if (!pack) {
    return { valid: false, diagnostics: [error("PACK_INVALID", "Pack must be an object.")] };
  }

  if (pack.schemaVersion !== "mdpr-pack-v1") diagnostics.push(error("PACK_SCHEMA_VERSION", "schemaVersion must be mdpr-pack-v1."));
  if (!["theme-component-pack", "style-pack", "component-pack", "diagram-pack"].includes(String(pack.kind))) {
    diagnostics.push(error("PACK_KIND_INVALID", "kind must be a supported MDPR pack kind."));
  }

  const source = asRecord(pack.source);
  if (!source) {
    diagnostics.push(error("PACK_SOURCE_INVALID", "source must be an object."));
  } else {
    if (!["design-md", "html-analysis", "mdpr-ppt", "manual"].includes(String(source.kind))) {
      diagnostics.push(error("PACK_SOURCE_KIND_INVALID", "source.kind is not supported."));
    }
    if (typeof source.sourceSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(source.sourceSha256)) {
      diagnostics.push(error("PACK_SOURCE_SHA_INVALID", "source.sourceSha256 must be a 64-character sha256 hex string."));
    }
    if (source.approved !== true) diagnostics.push(error("PACK_APPROVAL_REQUIRED", "Pack source must be explicitly approved before runtime use."));
  }

  if (!asRecord(pack.themeTokens)) diagnostics.push(error("PACK_THEME_TOKENS_INVALID", "themeTokens must be an object."));
  if (!asRecord(pack.componentTokens)) diagnostics.push(error("PACK_COMPONENT_TOKENS_INVALID", "componentTokens must be an object."));
  if (!asRecord(pack.diagramTokens)) diagnostics.push(error("PACK_DIAGRAM_TOKENS_INVALID", "diagramTokens must be an object."));
  const components = asArray(pack.components);
  if (!Array.isArray(pack.components)) diagnostics.push(error("PACK_COMPONENTS_INVALID", "components must be an array."));
  if (!Array.isArray(pack.pptEffectMappings)) diagnostics.push(error("PACK_EFFECTS_INVALID", "pptEffectMappings must be an array."));

  const constraints = asRecord(pack.constraints);
  if (!constraints) {
    diagnostics.push(error("PACK_CONSTRAINTS_INVALID", "constraints must be an object."));
  } else {
    if (constraints.editablePrimaryContent !== true) {
      diagnostics.push(error("PACK_PRIMARY_CONTENT_NOT_EDITABLE", "constraints.editablePrimaryContent must be true."));
    }
    if (typeof constraints.maxAccentRatio !== "number" || constraints.maxAccentRatio > 0.25) {
      diagnostics.push(error("PACK_ACCENT_RATIO_TOO_HIGH", "constraints.maxAccentRatio must be at most 0.25."));
    }
  }

  for (const [index, component] of components.entries()) {
    if (containsExternalAsset(component)) {
      diagnostics.push(error("PACK_EXTERNAL_ASSET", `components[${index}] contains an external asset reference.`));
    }
  }

  return { valid: diagnostics.every((diagnostic) => diagnostic.level !== "error"), diagnostics };
}

export function importPackCandidate(input: ImportPackCandidateInput): ImportPackCandidateResult {
  const candidate = asRecord(input.candidate);
  if (!candidate) {
    const pack = emptyPack("manual", "0".repeat(64), input.approved);
    return { pack, diagnostics: [error("PACK_CANDIDATE_INVALID", "Candidate must be an object.")] };
  }

  if (candidate.schemaVersion === "mdpr-pack-v1") {
    const pack = {
      ...candidate,
      source: {
        ...asRecord(candidate.source),
        approved: input.approved,
      },
    } as MdprPack;
    return { pack, diagnostics: validateMdprPack(pack).diagnostics };
  }

  if (candidate.schemaVersion === "mdpr-theme-candidate-v1") {
    const source = asRecord(candidate.source) ?? {};
    const tokens = asRecord(candidate.tokens) ?? {};
    const pack: MdprPack = {
      schemaVersion: "mdpr-pack-v1",
      kind: "theme-component-pack",
      source: {
        kind: "design-md",
        sourceSha256: typeof source.sourceSha256 === "string" ? source.sourceSha256 : "0".repeat(64),
        generatedBy: "mdpr-skill",
        approved: input.approved,
      },
      themeTokens: tokens,
      componentTokens: {},
      diagramTokens: {},
      components: [],
      pptEffectMappings: [],
      constraints: {
        editablePrimaryContent: true,
        allowRasterBackgroundOnly: true,
        maxAccentRatio: 0.18,
      },
    };
    return { pack, diagnostics: validateMdprPack(pack).diagnostics };
  }

  const pack = emptyPack("manual", "0".repeat(64), input.approved);
  return { pack, diagnostics: [error("PACK_CANDIDATE_UNSUPPORTED", "Candidate schemaVersion is not supported.")] };
}

export function previewPack(pack: MdprPack): PackPreview {
  const colors = asRecord(asRecord(pack.themeTokens)?.colors) ?? asRecord(pack.themeTokens);
  const effects = asArray(pack.pptEffectMappings).map((effect) => asRecord(effect) ?? {});
  const colorCount = Object.keys(colors ?? {}).length;
  return {
    kind: pack.kind,
    sourceKind: pack.source.kind,
    approved: pack.source.approved,
    colorCount,
    themeColorCount: colorCount,
    componentCount: asArray(pack.components).length,
    nativeEditableEffectCount: effects.filter((effect) => effect.feasibility === "native-editable").length,
    rasterRiskEffectCount: effects.filter((effect) => effect.feasibility === "raster-risk").length,
    unsupportedEffectCount: effects.filter((effect) => effect.feasibility === "unsupported").length,
  };
}

export function listBuiltInPacks(): Array<{ id: string; description: string }> {
  return [
    {
      id: "clean-foundation",
      description: "Editable primary content, tokenized theme colors, and bounded accent usage.",
    },
    {
      id: "default-editable",
      description: "Compatibility alias for the default editable MDPR pack guardrails.",
    },
  ];
}

export function themeConfigFromPack(pack: MdprPack): {
  backgroundColor?: string;
  textColor?: string;
  primaryColor?: string;
  colorSeed?: string;
  useProvidedColors?: boolean;
} {
  const colors = asRecord(asRecord(pack.themeTokens)?.colors) ?? {};
  const primary = stringValue(colors.primary) ?? stringValue(colors.accent);
  const hasProvidedColors = Boolean(stringValue(colors.background) || stringValue(colors.text) || primary);
  if (!hasProvidedColors) return {};
  return {
    ...(stringValue(colors.background) ? { backgroundColor: stringValue(colors.background) } : {}),
    ...(stringValue(colors.text) ? { textColor: stringValue(colors.text) } : {}),
    ...(primary ? { primaryColor: primary, colorSeed: primary } : {}),
    useProvidedColors: true,
  };
}

function emptyPack(kind: MdprPack["source"]["kind"], sourceSha256: string, approved: boolean): MdprPack {
  return {
    schemaVersion: "mdpr-pack-v1",
    kind: "theme-component-pack",
    source: { kind, sourceSha256, approved },
    themeTokens: {},
    componentTokens: {},
    diagramTokens: {},
    components: [],
    pptEffectMappings: [],
    constraints: {
      editablePrimaryContent: true,
      allowRasterBackgroundOnly: true,
      maxAccentRatio: 0.18,
    },
  };
}

function containsExternalAsset(value: unknown): boolean {
  if (typeof value === "string") return /^https?:\/\//i.test(value);
  if (Array.isArray(value)) return value.some(containsExternalAsset);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) =>
    /asset|url|href|src/i.test(key) && containsExternalAsset(child)
      ? true
      : containsExternalAsset(child)
  );
}

function error(code: string, message: string): PackDiagnostic {
  return { level: "error", code, message };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
