import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config, Diagnostic, OutputFormat, ParserMode, PresentationIR, SlideIR } from "@mdpresent/core";
import { defaultConfig, parseMarkdown, parseMarkdownWithPandoc, planPresentation } from "@mdpresent/core";
import { resolveDesignTokens } from "@mdpresent/core";
import { applyAgentHintsToPresentation, type AcceptedAgentHint } from "@mdpresent/core";
import type { LayoutIR } from "@mdpresent/layout";
import { planLayout, planSlideLayoutWithSpec, rankLayoutCandidates, validateLayoutOverflow } from "@mdpresent/layout";
import { renderHtml } from "@mdpresent/render-html";
import { renderPdf } from "@mdpresent/render-pdf";
import type { DesignPresetName, FontEmbeddingResult, PptxObjectMapEntry } from "@mdpresent/render-pptx";
import { renderPptx } from "@mdpresent/render-pptx";
import { applyOverrides, diffLayout, type LayoutDiff, type OverrideManifest, type OverrideOperation } from "@mdpresent/override";
import { themeConfigFromPack, validateMdprPack, type MdprPack, type PackValidationResult } from "@mdpresent/pack";
import { coherenceValidationDiagnostics, createCoherenceValidationSummary, createPolishQualitySummary, createVisualValidationSummary, polishQualityDiagnostics, visualValidationDiagnostics } from "@mdpresent/validation";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";
import { completeFontEmbeddingSummary, inspectFontEnvironment, probeInstalledFontEnvironment, type FontEnvironmentCatalog, type FontEnvironmentSummary } from "./fontEnvironment.js";

export type ConfigSource =
  | { kind: "default" }
  | { kind: "config-file"; path: string }
  | { kind: "cli-args"; values: DeepPartial<Config> };

export type OverrideSource = {
  path: string;
};

export type AgentHintSource = {
  path: string;
};

export type PackSource = {
  path: string;
  validation: PackValidationResult;
};

export type AgentHintSummary = {
  enabled: boolean;
  source?: AgentHintSource;
  sourceSha256?: string;
  acceptedHints: AcceptedAgentHint[];
  accepted: number;
  rejected: number;
  ignoredBecauseStale: number;
  forbiddenFieldCount: number;
  diagnostics: Diagnostic[];
};

export type OrchestrationOptions = {
  configPath?: string;
  overridePath?: string;
  hintPath?: string;
  cliConfig?: DeepPartial<Config>;
  parser?: ParserMode;
  visualValidation?: boolean;
  coherenceValidation?: boolean;
  strict?: boolean;
  packPath?: string;
  requireFontInstalled?: boolean;
  embedFontPaths?: string[];
  requireFontEmbedded?: boolean;
  fontLicenseEvidencePath?: string;
  requireFontLicenseEvidence?: boolean;
  fontEnvironment?: FontEnvironmentCatalog;
};

export type DeckPlan = {
  config: Config;
  configSources: ConfigSource[];
  overrideSource?: OverrideSource;
  presentation: PresentationIR;
  layout: LayoutIR;
  overrideDiff?: LayoutDiff[];
  pack?: PackSource;
  agentHints: AgentHintSummary;
  fontEnvironment: FontEnvironmentSummary;
  diagnostics: Diagnostic[];
};

export type BuildOptions = OrchestrationOptions & {
  formats?: OutputFormat[];
  outDir?: string;
  templatePath?: string | null;
  designPreset?: DesignPresetName;
  themeGalleryPresets?: DesignPresetName[];
  designLockPath?: string | null;
  updateDesignLock?: boolean;
};

export type BuildResult = DeckPlan & {
  writtenFiles: string[];
  manifestPath?: string;
  designLockPath?: string;
};

export type ValidationResult = DeckPlan & {
  valid: boolean;
};

export function createDeckPlan(inputPath: string, options: OrchestrationOptions = {}): DeckPlan {
  const configDiagnostics: Diagnostic[] = [];
  const pack = readPackFile(options.packPath, configDiagnostics);
  const config = resolveEffectiveConfig({
    ...options,
    cliConfig: mergeConfigPatch(options.cliConfig, pack?.pack ? { theme: themeConfigFromPack(pack.pack) } : undefined),
  }, configDiagnostics);
  const markdown = readFileSync(inputPath, "utf-8");
  const sourceSha256 = sha256(markdown);
  const agentHints = readAgentHints(options.hintPath, sourceSha256, Boolean(options.strict));
  const overrideManifest = options.overridePath ? readOverrideFile(options.overridePath, configDiagnostics) : undefined;
  const planConfig = overrideManifest ? applyPreLayoutSplitOverrides(config, overrideManifest) : config;
  const doc = options.parser === "pandoc"
    ? parseMarkdownWithPandoc(markdown, { sourcePath: inputPath })
    : parseMarkdown(markdown, inputPath);
  const presentation = applyAgentHintsToPresentation(planPresentation(doc, planConfig), agentHints.acceptedHints);
  const postLayoutOverrideManifest = overrideManifest ? withoutPreLayoutSplitOverrides(overrideManifest) : undefined;
  const initialLayout = resolveLayoutTextOverflow(planLayout(presentation, planConfig), presentation, planConfig, {
    allowCandidateReflow: !overrideManifest,
  });
  const layout = postLayoutOverrideManifest ? applyOverrides(initialLayout, postLayoutOverrideManifest, presentation) : initialLayout;
  const overrideDiff = overrideManifest ? diffLayout(initialLayout, layout) : undefined;
  const fontEnvironment = inspectFontEnvironment(
    layout,
    options.fontEnvironment ?? probeInstalledFontEnvironment(),
    Boolean(options.requireFontInstalled),
    {
      fontPaths: options.embedFontPaths,
      requireComplete: options.requireFontEmbedded,
      licenseEvidencePath: options.fontLicenseEvidencePath,
      requireLicenseEvidence: options.requireFontLicenseEvidence,
    },
    presentation,
  );
  const diagnostics = dedupeDiagnostics([
    ...presentation.diagnostics,
    ...layout.diagnostics,
    ...configDiagnostics,
    ...agentHints.diagnostics,
    ...fontEnvironment.diagnostics,
  ]);

  return {
    config: planConfig,
    configSources: [
      { kind: "default" },
      ...(options.configPath ? [{ kind: "config-file" as const, path: options.configPath }] : []),
      ...(options.cliConfig ? [{ kind: "cli-args" as const, values: options.cliConfig }] : []),
    ],
    overrideSource: options.overridePath ? { path: options.overridePath } : undefined,
    pack: pack ? { path: pack.path, validation: pack.validation } : undefined,
    presentation,
    layout,
    overrideDiff,
    agentHints,
    fontEnvironment: fontEnvironment.summary,
    diagnostics,
  };
}

function applyPreLayoutSplitOverrides(config: Config, manifest: OverrideManifest): Config {
  const splitOperations = normalizeOverrideOperations(manifest)
    .filter((operation) => operation.op === "setSplit")
    .filter((operation) => operation.target.title || operation.target.headingPath);
  if (splitOperations.length === 0) return config;
  const next = structuredClone(config);
  next.split.overrides = [
    ...(next.split.overrides ?? []),
    ...splitOperations.map((operation) => ({
      target: {
        ...(operation.target.title ? { title: operation.target.title } : {}),
        ...(operation.target.headingPath ? { headingPath: operation.target.headingPath } : {}),
      },
      ...(typeof operation.value.forceSingleSlide === "boolean" ? { forceSingleSlide: operation.value.forceSingleSlide } : {}),
      ...(typeof operation.value.splitBy === "string" ? { splitBy: operation.value.splitBy as NonNullable<Config["split"]["overrides"]>[number]["splitBy"] } : {}),
      ...(typeof operation.value.maxDensity === "number" ? { maxDensity: operation.value.maxDensity } : {}),
    })),
  ];
  return next;
}

function withoutPreLayoutSplitOverrides(manifest: OverrideManifest): OverrideManifest | undefined {
  if (manifest.operations) {
    const operations = manifest.operations.filter((operation) => operation.op !== "setSplit");
    return operations.length > 0 ? { ...manifest, operations } : undefined;
  }
  if (manifest.overrides) {
    const overrides = manifest.overrides
      .map((entry) => ({ ...entry, patch: { ...entry.patch, split: undefined } }))
      .filter((entry) => Object.values(entry.patch).some((value) => value !== undefined));
    return overrides.length > 0 ? { ...manifest, overrides } : undefined;
  }
  return manifest;
}

function normalizeOverrideOperations(manifest: OverrideManifest): OverrideOperation[] {
  if (manifest.operations) return manifest.operations;
  return (manifest.overrides ?? []).flatMap((entry) => {
    const operations: OverrideOperation[] = [];
    if (entry.patch.layout) operations.push({ op: "setLayout", target: entry.target, value: entry.patch.layout, reason: entry.reason });
    if (entry.patch.typography) operations.push({ op: "setTypography", target: entry.target, value: entry.patch.typography, reason: entry.reason });
    if (entry.patch.background) operations.push({ op: "setBackground", target: entry.target, value: entry.patch.background, reason: entry.reason });
    if (entry.patch.split) operations.push({ op: "setSplit", target: entry.target, value: entry.patch.split, reason: entry.reason });
    if (entry.patch.overflow) operations.push({ op: "setOverflow", target: entry.target, value: entry.patch.overflow, reason: entry.reason });
    if (entry.patch.slots) {
      for (const [slot, value] of Object.entries(entry.patch.slots)) {
        operations.push({ op: "setSlot", target: { ...entry.target, slot }, value, reason: entry.reason });
      }
    }
    return operations;
  });
}

export function inspectDeck(inputPath: string, options: OrchestrationOptions = {}): SlideIR[] {
  return createDeckPlan(inputPath, options).presentation.slides;
}

export function planDeck(inputPath: string, options: OrchestrationOptions = {}): DeckPlan {
  return createDeckPlan(inputPath, options);
}

export async function buildDeck(inputPath: string, options: BuildOptions = {}): Promise<BuildResult> {
  const buildStartedAt = Date.now();
  const deck = createDeckPlan(inputPath, options);
  assertBuildCanRender(deck, options);
  const formats = options.formats ?? ["html"];
  if ((options.embedFontPaths?.length ?? 0) > 0 && !formats.some((format) => format === "pptx" || format === "pdf")) {
    throw new Error("FONT_EMBEDDING_OUTPUT_UNSUPPORTED: --embed-font requires PPTX or PDF output.");
  }
  const outDir = options.outDir ?? "dist";
  const renderJobs: Promise<string>[] = [];
  let pptxJob: Promise<string> | undefined;
  let pptxObjects: PptxObjectMapEntry[] = [];
  let pptxFontEmbedding: FontEmbeddingResult | undefined;

  mkdirSync(outDir, { recursive: true });

  if (formats.includes("html")) {
    const outPath = join(outDir, "deck.html");
    renderJobs.push(Promise.resolve().then(() => {
      const html = renderHtml(
        { presentation: deck.presentation, layout: deck.layout },
        {
          title: deck.presentation.meta.title,
          designPreset: options.designPreset,
        },
      );
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, html, "utf-8");
      return outPath;
    }));
  }

  if (formats.includes("pptx") || formats.includes("pdf")) {
    const outPath = formats.includes("pptx") ? join(outDir, "deck.pptx") : join(outDir, ".mdpresent-pdf", "deck.pptx");
    pptxJob = (async () => {
      mkdirSync(dirname(outPath), { recursive: true });
      const result = await renderPptx(
        { presentation: deck.presentation, layout: deck.layout },
        {
          outPath,
          templatePath: options.templatePath ?? deck.config.pptx.template,
          designPreset: options.designPreset,
          themeGalleryPresets: options.themeGalleryPresets,
          lockBackgroundToMaster: deck.config.pptx.lockBackgroundToMaster,
          embeddedFontPaths: options.embedFontPaths,
        },
      );
      pptxObjects = result.objectMap;
      pptxFontEmbedding = result.fontEmbedding;
      if (options.requireFontLicenseEvidence) {
        const embedding = completeFontEmbeddingSummary(deck.fontEnvironment.embedding, result.fontEmbedding);
        if (!embedding.licenseEvidence.complete) {
          rmSync(outPath, { force: true });
          throw new Error(
            "FONT_LICENSE_EVIDENCE_POST_BUILD_MISMATCH: rendered PPTX font hashes do not match the required license evidence.",
          );
        }
      }
      return outPath;
    })();
    if (formats.includes("pptx")) renderJobs.push(pptxJob);
  }

  if (formats.includes("pdf")) {
    const outPath = join(outDir, "deck.pdf");
    renderJobs.push((async () => {
      const pptxPath = await pptxJob;
      if (!pptxPath) throw new Error("PDF output requires a generated PPTX source.");
      await renderPdf({ pptxPath, outPath });
      return outPath;
    })());
  }

  const writtenFiles = await Promise.all(renderJobs);
  if (pptxFontEmbedding) {
    const embedding = completeFontEmbeddingSummary(deck.fontEnvironment.embedding, pptxFontEmbedding);
    deck.fontEnvironment = {
      ...deck.fontEnvironment,
      embedding,
    };
  }
  const designLockPath = options.designLockPath ?? join(outDir, "mdpresent-design-lock.json");
  const designLock = createDesignLock(deck);
  enforceOrWriteDesignLock(designLockPath, designLock, Boolean(options.updateDesignLock));
  const manifestPath = join(outDir, "mdpresent-manifest.json");
  const manifest = createBuildManifest(inputPath, deck, writtenFiles, designLockPath, options.visualValidation, {
    buildMs: Date.now() - buildStartedAt,
    pptxObjects,
    themeGalleryPresets: options.themeGalleryPresets ?? [],
  });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  return { ...deck, writtenFiles: [...writtenFiles, manifestPath, designLockPath], manifestPath, designLockPath };
}

function assertBuildCanRender(deck: DeckPlan, options: BuildOptions): void {
  const diagnostics = [
    ...deck.diagnostics,
    ...validateLayoutOverflow(deck.layout, createContentIndex(deck.presentation)),
    ...(options.visualValidation ? visualValidationDiagnostics(deck.layout) : []),
    ...(options.visualValidation ? polishQualityDiagnostics(deck.presentation, deck.layout, { comparisonPresets: options.themeGalleryPresets ?? [] }) : []),
    ...(options.coherenceValidation ? coherenceValidationDiagnostics(deck.presentation, deck.layout) : []),
  ];
  const errors = diagnostics.filter((diagnostic) => diagnostic.level === "error");
  if (!errors.length) return;

  const summary = errors
    .map((diagnostic) => `${diagnostic.code ?? "ERROR"}: ${diagnostic.message}`)
    .join("; ");
  throw new Error(`Build validation failed: ${summary}`);
}

export function validateDeck(inputPath: string, options: OrchestrationOptions = {}): ValidationResult {
  const deck = createDeckPlan(inputPath, options);
  const contentByBlockId = createContentIndex(deck.presentation);
  const overflowDiagnostics = validateLayoutOverflow(deck.layout, contentByBlockId);
  const diagnostics = [...deck.diagnostics, ...overflowDiagnostics];
  if (options.visualValidation) {
    diagnostics.push(...visualValidationDiagnostics(deck.layout));
    diagnostics.push(...polishQualityDiagnostics(deck.presentation, deck.layout));
  }
  if (options.coherenceValidation) {
    diagnostics.push(...coherenceValidationDiagnostics(deck.presentation, deck.layout));
  }

  const uniqueDiagnostics = dedupeDiagnostics(diagnostics);
  return {
    ...deck,
    diagnostics: uniqueDiagnostics,
    valid: uniqueDiagnostics.every((diagnostic) => diagnostic.level !== "error"),
  };
}

function createDesignLock(deck: DeckPlan) {
  const tokens = resolveDesignTokens(deck.layout.theme.decorationStyle ?? deck.layout.theme.designPreset, deck.layout.theme);
  return {
    schemaVersion: 1,
    engine: "mdpresent",
    decorationStyle: tokens.decorationStyle,
    colorSeed: deck.layout.theme.colorSeed ?? deck.layout.theme.primaryColor,
    colorCombination: tokens.colorCombination,
    paletteSeed: tokens.paletteSeed,
    surfacePolicy: tokens.surfacePolicy,
    themeColors: tokens.themeColors,
    typography: {
      fontFamily: deck.layout.theme.fontFamily,
      titleFontSize: deck.layout.theme.titleFontSize,
      bodyFontSize: deck.layout.theme.bodyFontSize,
      minFontSize: deck.layout.theme.minFontSize,
    },
  };
}

function enforceOrWriteDesignLock(lockPath: string, current: ReturnType<typeof createDesignLock>, update: boolean): void {
  mkdirSync(dirname(lockPath), { recursive: true });
  const serialized = JSON.stringify(current, null, 2);
  if (!existsSync(lockPath) || update) {
    writeFileSync(lockPath, serialized, "utf-8");
    return;
  }

  const existing = JSON.parse(readFileSync(lockPath, "utf-8")) as unknown;
  if (stableJson(existing) !== stableJson(current)) {
    throw new Error(`Design lock drift detected: ${lockPath}. Re-run with --update-design-lock to accept the new style/color contract.`);
  }
}

function createBuildManifest(
  inputPath: string,
  deck: DeckPlan,
  writtenFiles: string[],
  designLockPath: string,
  visualValidation: boolean | undefined,
  runtime: { buildMs: number; pptxObjects: PptxObjectMapEntry[]; themeGalleryPresets?: DesignPresetName[] } = { buildMs: 0, pptxObjects: [] },
) {
  const source = readFileSync(inputPath, "utf-8");
  const artifacts = writtenFiles.map(createArtifactContract);
  const layoutOverflow = validateLayoutOverflow(deck.layout, createContentIndex(deck.presentation)).map((diagnostic) => ({
    level: diagnostic.level,
    code: diagnostic.code,
    message: diagnostic.message,
    slideId: diagnostic.slideId,
  }));
  const visual = visualValidation ? createVisualValidationSummary(deck.layout) : null;
  const coherence = createCoherenceValidationSummary(deck.presentation, deck.layout);
  const polish = createPolishQualitySummary(deck.presentation, deck.layout, {
    comparisonPresets: runtime.themeGalleryPresets ?? [],
  });
  return {
    schemaVersion: 1,
    engine: "mdpresent",
    source: {
      path: inputPath,
      sha256: sha256(source),
    },
    config: {
      sha256: sha256(stableJson(deck.config)),
      sources: deck.configSources,
    },
    override: deck.overrideSource ? {
      source: deck.overrideSource,
      diff: deck.overrideDiff ?? [],
    } : null,
    pack: deck.pack ? {
      source: { path: deck.pack.path },
      validation: deck.pack.validation,
    } : null,
    agentHints: {
      enabled: deck.agentHints.enabled,
      source: deck.agentHints.source ?? null,
      sourceSha256: deck.agentHints.sourceSha256 ?? null,
      accepted: deck.agentHints.accepted,
      rejected: deck.agentHints.rejected,
      ignoredBecauseStale: deck.agentHints.ignoredBecauseStale,
      forbiddenFieldCount: deck.agentHints.forbiddenFieldCount,
    },
    presentationMode: deck.config.deck.presentationMode ?? "normal",
    slideCount: deck.presentation.slides.length,
    outputs: writtenFiles,
    artifacts,
    designLock: designLockPath,
    pptxObjects: runtime.pptxObjects,
    diagnostics: deck.diagnostics,
    validation: {
      fontEnvironment: deck.fontEnvironment,
      layoutOverflow,
      visual,
      coherence,
      polish,
      overflowResolution: createOverflowResolutionSummary(deck.presentation, deck.layout),
    },
    metrics: createBuildMetrics(deck, artifacts, layoutOverflow, visual, coherence, polish, runtime.buildMs),
  };
}

function createBuildMetrics(
  deck: DeckPlan,
  artifacts: Array<ReturnType<typeof createArtifactContract>>,
  layoutOverflow: Array<{ level: string; code?: string }>,
  visual: ReturnType<typeof createVisualValidationSummary> | null,
  coherence: ReturnType<typeof createCoherenceValidationSummary>,
  polish: ReturnType<typeof createPolishQualitySummary>,
  buildMs: number,
) {
  const outputBytes: Record<string, number> = {};
  for (const artifact of artifacts) {
    outputBytes[artifact.format] = (outputBytes[artifact.format] ?? 0) + artifact.bytes;
  }
  const visualDiagnostics = visual?.diagnostics ?? [];
  const coherenceDiagnostics = coherence.diagnostics ?? [];
  return {
    slideCount: deck.presentation.slides.length,
    overflowCount: layoutOverflow.filter((diagnostic) => diagnostic.level === "error").length,
    coherenceWarningCount: coherenceDiagnostics.filter((diagnostic) => diagnostic.level === "warning").length,
    coherenceErrorCount: coherenceDiagnostics.filter((diagnostic) => diagnostic.level === "error").length,
    visualWarningCount: visualDiagnostics.filter((diagnostic) => diagnostic.level === "warning").length,
    visualErrorCount: visualDiagnostics.filter((diagnostic) => diagnostic.level === "error").length,
    polishWarningCount: polish.requiredFailureCount,
    minFontPt: minimumFontPt(deck.layout),
    textClipRiskCount: layoutOverflow.filter(isTextFitDiagnostic).length,
    contrastFailures: visualDiagnostics.filter((diagnostic) => diagnostic.code === "VISUAL_CONTRAST").length,
    connectorWarnings: visualDiagnostics.filter((diagnostic) => diagnostic.code === "VISUAL_CONNECTOR_CLEARANCE").length,
    buildMs,
    outputBytes,
  };
}

function minimumFontPt(layout: LayoutIR): number {
  const values = layout.slides
    .flatMap((slide) => slide.regions.flatMap((region) => [region.typography?.fontSize, region.typography?.minFontSize]))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length ? Math.min(...values) : layout.theme.minFontSize;
}

function createArtifactContract(path: string) {
  const exists = existsSync(path);
  const content = exists ? readFileSync(path) : Buffer.from("");
  return {
    path,
    format: inferOutputFormat(path),
    exists,
    bytes: exists ? statSync(path).size : 0,
    sha256: sha256(content),
  };
}

function inferOutputFormat(path: string): OutputFormat | "unknown" {
  if (path.endsWith(".pptx")) return "pptx";
  if (path.endsWith(".html")) return "html";
  if (path.endsWith(".pdf")) return "pdf";
  return "unknown";
}

type AgentHintManifest = {
  schemaVersion: "mdpr-agent-hint-v1";
  sourceSha256: string;
  hints: unknown[];
};

const forbiddenAgentHintFields = new Set([
  "recipeId",
  "variantId",
  "box",
  "x",
  "y",
  "w",
  "h",
  "color",
  "fontSize",
  "fontFamily",
  "typography",
  "zOrder",
  "radius",
  "shadow",
  "effect",
  "arrow",
  "component",
  "style",
  "iconAsset",
  "iconPath",
  "iconName",
  "imagePath",
  "cropRect",
  "finalImagePath",
  "finalImageAsset",
  "masterId",
  "layoutId",
  "rendererObject",
  "coordinates",
  "geometry",
  "rendererObjectId",
]);

function readAgentHints(hintPath: string | undefined, sourceSha256: string, strict: boolean): AgentHintSummary {
  const summary: AgentHintSummary = {
    enabled: Boolean(hintPath),
    source: hintPath ? { path: hintPath } : undefined,
    acceptedHints: [],
    accepted: 0,
    rejected: 0,
    ignoredBecauseStale: 0,
    forbiddenFieldCount: 0,
    diagnostics: [],
  };

  if (!hintPath) return summary;

  if (!existsSync(hintPath)) {
    summary.diagnostics.push({
      level: strict ? "error" : "warning",
      code: "AGENT_HINT_FILE_NOT_FOUND",
      message: `Agent hint file was requested but not found: ${hintPath}`,
    });
    return summary;
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(hintPath, "utf-8"));
  } catch (error) {
    summary.diagnostics.push({
      level: strict ? "error" : "warning",
      code: "AGENT_HINT_FILE_INVALID",
      message: `Agent hint file could not be parsed: ${hintPath}. ${error instanceof Error ? error.message : String(error)}`,
    });
    return summary;
  }

  const forbiddenPaths = collectForbiddenAgentHintFields(manifest);
  summary.forbiddenFieldCount = forbiddenPaths.length;
  if (forbiddenPaths.length) {
    summary.rejected = countAgentHintItems(manifest);
    summary.diagnostics.push({
      level: "error",
      code: "AGENT_HINT_FORBIDDEN_FIELD",
      message: `Agent hint file contains final design fields that MDPR will not accept: ${forbiddenPaths.join(", ")}`,
    });
    return summary;
  }

  const validate = getAgentHintSchemaValidator();
  if (!validate(manifest)) {
    summary.rejected = countAgentHintItems(manifest);
    summary.diagnostics.push({
      level: strict ? "error" : "warning",
      code: "AGENT_HINT_FILE_INVALID",
      message: `Agent hint file is invalid: ${hintPath}. ${formatSchemaErrors(validate.errors)}`,
    });
    return summary;
  }

  const typed = manifest as AgentHintManifest;
  summary.sourceSha256 = typed.sourceSha256;
  if (typed.sourceSha256 !== sourceSha256) {
    summary.ignoredBecauseStale = 1;
    summary.diagnostics.push({
      level: strict ? "error" : "warning",
      code: "AGENT_HINT_STALE",
      message: `Agent hint file source hash does not match the Markdown source: ${hintPath}`,
    });
    return summary;
  }

  summary.accepted = typed.hints.length;
  summary.acceptedHints = typed.hints as AcceptedAgentHint[];
  return summary;
}

function collectForbiddenAgentHintFields(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectForbiddenAgentHintFields(entry, `${path}[${index}]`));
  }
  if (!isPlainObject(value)) return [];

  const matches: string[] = [];
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (forbiddenAgentHintFields.has(key)) matches.push(nextPath);
    matches.push(...collectForbiddenAgentHintFields(nested, nextPath));
  }
  return matches;
}

function countAgentHintItems(value: unknown): number {
  if (!isPlainObject(value) || !Array.isArray(value.hints)) return 0;
  return value.hints.length;
}

function readOverrideFile(overridePath: string, diagnostics: Diagnostic[]): OverrideManifest | undefined {
  if (!existsSync(overridePath)) {
    diagnostics.push({
      level: "warning",
      code: "OVERRIDE_FILE_NOT_FOUND",
      message: `Override file was requested but not found: ${overridePath}`,
    });
    return undefined;
  }

  try {
    const raw = readFileSync(overridePath, "utf-8");
    const manifest = overridePath.endsWith(".json") ? JSON.parse(raw) as OverrideManifest : parseYaml(raw) as OverrideManifest;
    const validation = validateOverrideManifest(manifest);
    if (validation) {
      diagnostics.push({
        level: "error",
        code: "OVERRIDE_FILE_INVALID",
        message: `Override file is invalid: ${overridePath}. ${validation}`,
      });
      return undefined;
    }
    return manifest;
  } catch (error) {
    diagnostics.push({
      level: "error",
      code: "OVERRIDE_FILE_INVALID",
      message: `Override file could not be parsed: ${overridePath}. ${error instanceof Error ? error.message : String(error)}`,
    });
    return undefined;
  }
}

function readPackFile(packPath: string | undefined, diagnostics: Diagnostic[]): { path: string; pack?: MdprPack; validation: PackValidationResult } | undefined {
  if (!packPath) return undefined;
  if (!existsSync(packPath)) {
    const validation: PackValidationResult = {
      valid: false,
      diagnostics: [{
        level: "error",
        code: "PACK_FILE_NOT_FOUND",
        message: `Pack file was requested but not found: ${packPath}`,
      }],
    };
    diagnostics.push(...validation.diagnostics);
    return { path: packPath, validation };
  }
  try {
    const pack = JSON.parse(readFileSync(packPath, "utf-8")) as MdprPack;
    const validation = validateMdprPack(pack);
    diagnostics.push(...validation.diagnostics.map((diagnostic) => ({
      level: diagnostic.level,
      code: diagnostic.code,
      message: diagnostic.message,
    })));
    return { path: packPath, pack: validation.valid ? pack : undefined, validation };
  } catch (error) {
    const validation: PackValidationResult = {
      valid: false,
      diagnostics: [{
        level: "error",
        code: "PACK_FILE_INVALID",
        message: `Pack file could not be parsed: ${packPath}. ${error instanceof Error ? error.message : String(error)}`,
      }],
    };
    diagnostics.push(...validation.diagnostics);
    return { path: packPath, validation };
  }
}

function validateOverrideManifest(manifest: OverrideManifest): string | null {
  if (!manifest || manifest.version !== "1.0") return "version must be \"1.0\".";
  const hasOperations = Array.isArray(manifest.operations);
  const hasOverrides = Array.isArray(manifest.overrides);
  if (hasOperations === hasOverrides) return "provide exactly one of operations or overrides.";
  const operations = manifest.operations ?? [];
  for (const [index, operation] of operations.entries()) {
    if (!operation.op || !operation.target || !operation.value) return `operations[${index}] must include op, target, and value.`;
  }
  return null;
}

function createOverflowResolutionSummary(presentation: PresentationIR, layout: LayoutIR) {
  const continuationGroups = continuationGroupsFor(presentation);
  const continuationReasons = { list: 0, table: 0, code: 0, paragraph: 0, mixed: 0, toc: 0 };
  let graphOrDiagramBlocksSplit = false;

  for (const group of continuationGroups) {
    const reason = continuationReasonFor(group);
    continuationReasons[reason] += 1;
    graphOrDiagramBlocksSplit = graphOrDiagramBlocksSplit || group.some((slide) => slide.blocks.some((block) => block.type === "diagram" || block.type === "chart"));
  }

  const fontShrinkRegions = layout.slides.flatMap((slide) => slide.regions)
    .filter((region) => {
      const fontSize = region.typography?.fontSize;
      if (!fontSize || region.role === "title") return false;
      return fontSize < layout.theme.bodyFontSize;
    }).length;

  return {
    checked: true,
    strategyCounts: {
      preSplit: continuationGroups.length,
      candidateReflow: layout.overflowResolution?.candidateReflow ?? 0,
      regionExpansion: layout.overflowResolution?.regionExpansion ?? 0,
      fontShrink: layout.overflowResolution?.fontShrink ?? fontShrinkRegions,
    },
    continuationSlides: continuationGroups.reduce((sum, group) => sum + group.length, 0),
    continuationGroups: continuationGroups.length,
    continuationReasons,
    graphOrDiagramBlocksSplit,
  };
}

function continuationGroupsFor(presentation: PresentationIR): SlideIR[][] {
  const grouped = new Map<string, SlideIR[]>();
  for (const slide of presentation.slides) {
    if (slide.role !== "content") continue;
    const key = slide.headingPath.join("\u0000") || (slide.title ?? slide.id);
    const slides = grouped.get(key) ?? [];
    slides.push(slide);
    grouped.set(key, slides);
  }
  return Array.from(grouped.values()).filter((slides) => slides.length > 1);
}

function continuationReasonFor(slides: SlideIR[]): "list" | "table" | "code" | "paragraph" | "mixed" | "toc" {
  if (slides.every((slide) => slide.tags.includes("auto-toc") || slide.tags.includes("auto-toc-continuation"))) return "toc";
  const blockTypes = new Set(slides.flatMap((slide) => slide.blocks.map((block) => block.type)));
  if (blockTypes.has("bulletList") || blockTypes.has("listItem")) return "list";
  if (blockTypes.has("table")) return "table";
  if (blockTypes.has("code")) return "code";
  if (blockTypes.size === 1 && blockTypes.has("paragraph")) return "paragraph";
  return "mixed";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function dedupeDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = stableJson(diagnostic);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function resolveEffectiveConfig(options: OrchestrationOptions = {}, diagnostics: Diagnostic[] = []): Config {
  const fileConfig = options.configPath ? readConfigFile(options.configPath, diagnostics) : undefined;
  return mergeConfig(mergeConfig(defaultConfig, fileConfig), options.cliConfig);
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<U>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

let configSchemaValidator: ValidateFunction | undefined;
let agentHintSchemaValidator: ValidateFunction | undefined;

function mergeConfig(base: Config, override?: DeepPartial<Config>): Config {
  if (!override) return structuredClone(base);
  return mergeObjects(structuredClone(base), override) as Config;
}

function mergeConfigPatch<T extends Record<string, unknown>>(base?: T, patch?: T): T | undefined {
  if (!base && !patch) return undefined;
  if (!base) return patch;
  if (!patch) return base;
  return mergeObjects(structuredClone(base), patch) as T;
}

function mergeObjects(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      target[key] = mergeObjects(target[key] as Record<string, unknown>, value);
    } else if (value !== undefined) {
      target[key] = value;
    }
  }
  return target;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readConfigFile(configPath: string, diagnostics: Diagnostic[]): Partial<Config> | undefined {
  if (!existsSync(configPath)) {
    diagnostics.push({
      level: "warning",
      code: "CONFIG_FILE_NOT_FOUND",
      message: `Config file was requested but not found: ${configPath}`,
    });
    return undefined;
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const config = configPath.endsWith(".json") ? JSON.parse(raw) as Partial<Config> : parseYaml(raw) as Partial<Config>;
    const validate = getConfigSchemaValidator();
    if (!validate(config)) {
      diagnostics.push({
        level: "error",
        code: "CONFIG_FILE_INVALID",
        message: `Config file is invalid: ${configPath}. ${formatSchemaErrors(validate.errors)}`,
      });
      return undefined;
    }
    if (config.pptx?.template && !isAbsolute(config.pptx.template)) {
      config.pptx.template = join(dirname(configPath), config.pptx.template);
    }
    return config;
  } catch (error) {
    diagnostics.push({
      level: "error",
      code: "CONFIG_FILE_INVALID",
      message: `Config file could not be parsed: ${configPath}. ${error instanceof Error ? error.message : String(error)}`,
    });
    return undefined;
  }
}

function getConfigSchemaValidator(): ValidateFunction {
  if (configSchemaValidator) return configSchemaValidator;
  const schemaPath = resolveSchemaPath("config.schema.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf-8")) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  configSchemaValidator = ajv.compile(schema);
  return configSchemaValidator;
}

function getAgentHintSchemaValidator(): ValidateFunction {
  if (agentHintSchemaValidator) return agentHintSchemaValidator;
  const schemaPath = resolveSchemaPath("agent-hint.schema.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf-8")) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  agentHintSchemaValidator = ajv.compile(schema);
  return agentHintSchemaValidator;
}

function resolveSchemaPath(fileName: string): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), "schemas", fileName),
    join(moduleDir, "schemas", fileName),
    join(moduleDir, "../../../schemas", fileName),
    join(moduleDir, "../schemas", fileName),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Unable to locate schema file: ${fileName}`);
  return found;
}

function formatSchemaErrors(errors: ValidateFunction["errors"]): string {
  return (errors ?? [])
    .map((error) => {
      const path = schemaErrorPath(error.instancePath);
      if (error.keyword === "additionalProperties" && "additionalProperty" in error.params) {
        return `${path}.${String(error.params.additionalProperty)} is not allowed`;
      }
      return `${path} ${error.message ?? "is invalid"}`;
    })
    .join("; ");
}

function schemaErrorPath(instancePath: string): string {
  const path = instancePath.replace(/^\//, "").replace(/\//g, ".");
  return path || "$";
}

function createContentIndex(presentation: PresentationIR): Map<string, string> {
  const index = new Map<string, string>();

  for (const slide of presentation.slides) {
    if (slide.title) index.set(titleBlockId(slide.id), slide.title);
    for (const block of slide.blocks) {
      const validationText = blockTextForValidation(block);
      if (validationText) index.set(block.id, validationText);
      if (block.items?.length || block.listItems?.length) {
        const items = block.items?.length
          ? block.items
          : block.listItems?.map((item) => [item.label, item.description, item.text].filter(Boolean).join(" ")) ?? [];
        index.set(block.id, items.join("\n"));
        for (const [itemIndex, item] of items.entries()) {
          index.set(`${block.id}#${itemIndex}`, item);
        }
      }
    }
  }

  return index;
}

function resolveLayoutTextOverflow(
  layout: LayoutIR,
  presentation: PresentationIR,
  config: Config,
  options: { allowCandidateReflow: boolean },
): LayoutIR {
  const contentByBlockId = createContentIndex(presentation);
  const resolved = structuredClone(layout);
  resolved.overflowResolution = {
    candidateReflow: layout.overflowResolution?.candidateReflow ?? 0,
    regionExpansion: layout.overflowResolution?.regionExpansion ?? 0,
    fontShrink: layout.overflowResolution?.fontShrink ?? 0,
  };

  for (let iteration = 0; iteration < 12; iteration++) {
    const diagnostics = validateLayoutOverflow(resolved, contentByBlockId).filter(isTextFitDiagnostic);
    if (!diagnostics.length) break;

    let changed = false;
    const reflowedSlideIds = new Set<string>();
    for (const diagnostic of diagnostics) {
      const slide = resolved.slides.find((candidate) => candidate.sourceSlideId === diagnostic.slideId);
      if (!slide || slide.overflowPolicy.action === "fail" || slide.overflowPolicy.action === "warn") continue;

      if (options.allowCandidateReflow && iteration === 0 && !reflowedSlideIds.has(slide.sourceSlideId)) {
        const reflowed = tryCandidateReflow(resolved, presentation, config, slide.sourceSlideId, contentByBlockId);
        if (reflowed) {
          reflowedSlideIds.add(slide.sourceSlideId);
          changed = true;
          continue;
        }
      }

      const region = slide.regions.find((candidate) => candidate.id === diagnostic.regionId);
      if (!region) continue;

      region.typography ??= {};
      const fontSize = region.typography.fontSize ?? resolved.theme.bodyFontSize;
      const minFontSize = Math.max(
        readableMinimumFontSize(region.id),
        region.typography.minFontSize ?? slide.overflowPolicy.minFontSize ?? resolved.theme.minFontSize,
      );
      region.typography.minFontSize = minFontSize;

      if (fontSize > minFontSize) {
        region.typography.fontSize = Math.max(minFontSize, fontSize - 1);
        resolved.overflowResolution.fontShrink += 1;
        changed = true;
        continue;
      }

      const maxHeight = Math.max(region.h, resolved.slideSize.height - region.y - 0.35);
      if (region.h < maxHeight) {
        region.h = Math.min(maxHeight, Number((region.h + 0.18).toFixed(2)));
        resolved.overflowResolution.regionExpansion += 1;
        changed = true;
      }
    }

    if (!changed) break;
  }

  return resolved;
}

function tryCandidateReflow(
  layout: LayoutIR,
  presentation: PresentationIR,
  config: Config,
  sourceSlideId: string,
  contentByBlockId: ReadonlyMap<string, string>,
): boolean {
  const layoutSlideIndex = layout.slides.findIndex((slide) => slide.sourceSlideId === sourceSlideId);
  const currentSlide = layout.slides[layoutSlideIndex];
  const sourceSlide = presentation.slides.find((slide) => slide.id === sourceSlideId);
  if (layoutSlideIndex < 0 || !currentSlide || !sourceSlide) return false;
  if (sourceSlide.role !== "content") return false;
  if (sourceSlide.blocks.some((block) => block.type === "chart" || block.type === "diagram")) return false;

  const currentOverflowCount = countSlideTextOverflow(layout, sourceSlideId, contentByBlockId);
  if (!currentOverflowCount) return false;

  for (const candidate of rankLayoutCandidates(sourceSlide, config)) {
    if (sameLayoutSpec(candidate.layout, currentSlide.layout)) continue;
    const candidateSlide = planSlideLayoutWithSpec(sourceSlide, config, candidate.layout);
    const candidateLayout = {
      ...layout,
      slides: layout.slides.map((slide, index) => index === layoutSlideIndex ? candidateSlide : slide),
    };
    const candidateDiagnostics = validateLayoutOverflow(candidateLayout, contentByBlockId)
      .filter((diagnostic) => diagnostic.slideId === sourceSlideId);
    const candidateOverflowCount = candidateDiagnostics.filter(isTextFitDiagnostic).length;
    const hasBoundsError = candidateDiagnostics.some((diagnostic) => diagnostic.code === "LAYOUT_REGION_OUT_OF_BOUNDS");
    const hasMinFontError = candidateDiagnostics.some((diagnostic) => diagnostic.code === "LAYOUT_MIN_FONT_SIZE_VIOLATION");
    if (!hasBoundsError && !hasMinFontError && candidateOverflowCount < currentOverflowCount) {
      layout.slides[layoutSlideIndex] = candidateSlide;
      layout.overflowResolution ??= { candidateReflow: 0, regionExpansion: 0, fontShrink: 0 };
      layout.overflowResolution.candidateReflow += 1;
      return true;
    }
  }

  return false;
}

function countSlideTextOverflow(
  layout: LayoutIR,
  sourceSlideId: string,
  contentByBlockId: ReadonlyMap<string, string>,
): number {
  return validateLayoutOverflow(layout, contentByBlockId)
    .filter((diagnostic) => diagnostic.slideId === sourceSlideId && isTextFitDiagnostic(diagnostic))
    .length;
}

function isTextFitDiagnostic(diagnostic: { code?: string }): boolean {
  return diagnostic.code === "TEXT_OVERFLOW" || diagnostic.code === "DENSE_TEXT_FIT_RISK";
}

function sameLayoutSpec(left: object, right: object): boolean {
  return stableJson(left) === stableJson(right);
}

function readableMinimumFontSize(regionId: string): number {
  if (regionId === "title") return 22;
  if (regionId === "code") return 11;
  if (regionId === "diagram") return 13;
  return 16;
}

function blockTextForValidation(block: PresentationIR["slides"][number]["blocks"][number]): string {
  if (block.type === "paragraph") {
    if (block.sentences?.length) return block.sentences.join("\n");
    if (block.lines?.length) return block.lines.join("\n");
  }
  if (block.type === "table" && block.rows?.length) {
    return block.rows.map((row) => row.join(" ")).join("\n");
  }
  if (block.type === "chart" && block.chart) {
    const labels = block.chart.labels.join("\n");
    const series = block.chart.series.map((item) => `${item.name} ${item.values.join(" ")}`).join("\n");
    return [labels, series].filter(Boolean).join("\n");
  }
  if (block.type === "image") return block.alt ?? "";
  return block.text ?? "";
}

function titleBlockId(slideId: string): string {
  return `__title:${slideId}`;
}
