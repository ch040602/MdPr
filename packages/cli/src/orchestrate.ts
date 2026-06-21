import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config, Diagnostic, OutputFormat, ParserMode, PresentationIR, SlideIR } from "@mdpresent/core";
import { defaultConfig, parseMarkdown, parseMarkdownWithPandoc, planPresentation } from "@mdpresent/core";
import { resolveDesignTokens } from "@mdpresent/core";
import type { LayoutIR } from "@mdpresent/layout";
import { planLayout, validateLayoutOverflow } from "@mdpresent/layout";
import { renderHtml } from "@mdpresent/render-html";
import { renderPdf } from "@mdpresent/render-pdf";
import type { DesignPresetName } from "@mdpresent/render-pptx";
import { renderPptx } from "@mdpresent/render-pptx";
import { applyOverrides, diffLayout, type LayoutDiff, type OverrideManifest } from "@mdpresent/override";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";

export type ConfigSource =
  | { kind: "default" }
  | { kind: "config-file"; path: string }
  | { kind: "cli-args"; values: DeepPartial<Config> };

export type OverrideSource = {
  path: string;
};

export type OrchestrationOptions = {
  configPath?: string;
  overridePath?: string;
  cliConfig?: DeepPartial<Config>;
  parser?: ParserMode;
  visualValidation?: boolean;
  coherenceValidation?: boolean;
};

export type DeckPlan = {
  config: Config;
  configSources: ConfigSource[];
  overrideSource?: OverrideSource;
  presentation: PresentationIR;
  layout: LayoutIR;
  overrideDiff?: LayoutDiff[];
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
  const config = resolveEffectiveConfig(options, configDiagnostics);
  const markdown = readFileSync(inputPath, "utf-8");
  const doc = options.parser === "pandoc"
    ? parseMarkdownWithPandoc(markdown, { sourcePath: inputPath })
    : parseMarkdown(markdown, inputPath);
  const presentation = planPresentation(doc, config);
  const initialLayout = resolveLayoutTextOverflow(planLayout(presentation, config), presentation);
  const overrideManifest = options.overridePath ? readOverrideFile(options.overridePath, configDiagnostics) : undefined;
  const layout = overrideManifest ? applyOverrides(initialLayout, overrideManifest, presentation) : initialLayout;
  const overrideDiff = overrideManifest ? diffLayout(initialLayout, layout) : undefined;
  const diagnostics: Diagnostic[] = [
    ...presentation.diagnostics,
    ...layout.diagnostics,
    ...configDiagnostics,
  ];

  return {
    config,
    configSources: [
      { kind: "default" },
      ...(options.configPath ? [{ kind: "config-file" as const, path: options.configPath }] : []),
      ...(options.cliConfig ? [{ kind: "cli-args" as const, values: options.cliConfig }] : []),
    ],
    overrideSource: options.overridePath ? { path: options.overridePath } : undefined,
    presentation,
    layout,
    overrideDiff,
    diagnostics,
  };
}

export function inspectDeck(inputPath: string, options: OrchestrationOptions = {}): SlideIR[] {
  return createDeckPlan(inputPath, options).presentation.slides;
}

export function planDeck(inputPath: string, options: OrchestrationOptions = {}): DeckPlan {
  return createDeckPlan(inputPath, options);
}

export async function buildDeck(inputPath: string, options: BuildOptions = {}): Promise<BuildResult> {
  const deck = createDeckPlan(inputPath, options);
  const formats = options.formats ?? ["html"];
  const outDir = options.outDir ?? "dist";
  const renderJobs: Promise<string>[] = [];
  let pptxJob: Promise<string> | undefined;

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
      await renderPptx(
        { presentation: deck.presentation, layout: deck.layout },
        {
          outPath,
          templatePath: options.templatePath ?? deck.config.pptx.template,
          designPreset: options.designPreset,
          themeGalleryPresets: options.themeGalleryPresets,
          lockBackgroundToMaster: deck.config.pptx.lockBackgroundToMaster,
        },
      );
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
  const designLockPath = options.designLockPath ?? join(outDir, "mdpresent-design-lock.json");
  const designLock = createDesignLock(deck);
  enforceOrWriteDesignLock(designLockPath, designLock, Boolean(options.updateDesignLock));
  const manifestPath = join(outDir, "mdpresent-manifest.json");
  const manifest = createBuildManifest(inputPath, deck, writtenFiles, designLockPath, options.visualValidation);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  return { ...deck, writtenFiles: [...writtenFiles, manifestPath, designLockPath], manifestPath, designLockPath };
}

export function validateDeck(inputPath: string, options: OrchestrationOptions = {}): ValidationResult {
  const deck = createDeckPlan(inputPath, options);
  const contentByBlockId = createContentIndex(deck.presentation);
  const overflowDiagnostics = validateLayoutOverflow(deck.layout, contentByBlockId);
  const diagnostics = [...deck.diagnostics, ...overflowDiagnostics];
  if (options.visualValidation) {
    diagnostics.push(...visualValidationDiagnostics(deck.layout));
  }
  if (options.coherenceValidation) {
    diagnostics.push(...coherenceValidationDiagnostics(deck.presentation, deck.layout));
  }

  return {
    ...deck,
    diagnostics,
    valid: diagnostics.every((diagnostic) => diagnostic.level !== "error"),
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
) {
  const source = readFileSync(inputPath, "utf-8");
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
    presentationMode: deck.config.deck.presentationMode ?? "normal",
    slideCount: deck.presentation.slides.length,
    outputs: writtenFiles,
    artifacts: writtenFiles.map(createArtifactContract),
    designLock: designLockPath,
    diagnostics: deck.diagnostics,
    validation: {
      layoutOverflow: validateLayoutOverflow(deck.layout, createContentIndex(deck.presentation)).map((diagnostic) => ({
        level: diagnostic.level,
        code: diagnostic.code,
        message: diagnostic.message,
        slideId: diagnostic.slideId,
      })),
      visual: visualValidation ? createVisualValidationSummary(deck.layout) : null,
      coherence: createCoherenceValidationSummary(deck.presentation, deck.layout),
    },
  };
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

function createVisualValidationSummary(layout: LayoutIR) {
  const diagnostics = visualValidationDiagnostics(layout);
  return {
    checked: true,
    slideCount: layout.slides.length,
    thresholds: {
      minimumTextContrastRatio: 4.5,
      maximumSameLayerOverlapRatio: 0.08,
      minimumReadableFontSize: 8,
      imageAspectRatioRange: [0.25, 4.0],
      minimumDiagramConnectorSpace: { width: 2.0, height: 1.0 },
    },
    checks: {
      nonBlankSlides: layout.slides.every((slide) => slide.regions.some((region) => region.blockIds.length || region.role === "title")),
      regionBounds: diagnostics.every((diagnostic) => diagnostic.code !== "VISUAL_REGION_BOUNDS"),
      minimumTextSize: diagnostics.every((diagnostic) => diagnostic.code !== "VISUAL_FONT_FLOOR"),
      textContrast: diagnostics.every((diagnostic) => diagnostic.code !== "VISUAL_CONTRAST"),
      sameLayerOverlap: diagnostics.every((diagnostic) => diagnostic.code !== "VISUAL_REGION_OVERLAP"),
      imageAspectRatio: diagnostics.every((diagnostic) => diagnostic.code !== "VISUAL_IMAGE_ASPECT_RATIO"),
      connectorClearance: diagnostics.every((diagnostic) => diagnostic.code !== "VISUAL_CONNECTOR_CLEARANCE"),
      backgroundContentOverlap: diagnostics.every((diagnostic) => !["VISUAL_BACKGROUND_OVERLAP", "VISUAL_REGION_OVERLAP"].includes(diagnostic.code ?? "")),
    },
    diagnostics,
  };
}

function visualValidationDiagnostics(layout: LayoutIR): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const contrast = contrastRatio(layout.theme.textColor, layout.theme.backgroundColor);
  if (contrast !== undefined && contrast < 4.5) {
    diagnostics.push({
      level: "error",
      code: "VISUAL_CONTRAST",
      message: `Theme text/background contrast ratio ${contrast.toFixed(2)} is below the 4.5 readable threshold.`,
    });
  }

  for (const slide of layout.slides) {
    for (const region of slide.regions) {
      if (region.x < 0 || region.y < 0 || region.x + region.w > layout.slideSize.width || region.y + region.h > layout.slideSize.height) {
        diagnostics.push({
          level: "error",
          code: "VISUAL_REGION_BOUNDS",
          slideId: slide.sourceSlideId,
          message: `Region ${region.id} is outside the slide bounds.`,
        });
      }
      const minFontSize = region.typography?.minFontSize ?? layout.theme.minFontSize;
      const fontSize = region.typography?.fontSize ?? layout.theme.bodyFontSize;
      if (region.role !== "image" && Math.min(fontSize, minFontSize) < 8) {
        diagnostics.push({
          level: "error",
          code: "VISUAL_FONT_FLOOR",
          slideId: slide.sourceSlideId,
          message: `Region ${region.id} falls below the 8pt visual readability floor.`,
        });
      }
      if (region.role === "image") {
        const ratio = region.w / Math.max(0.0001, region.h);
        if (ratio < 0.25 || ratio > 4.0) {
          diagnostics.push({
            level: "error",
            code: "VISUAL_IMAGE_ASPECT_RATIO",
            slideId: slide.sourceSlideId,
            message: `Image region ${region.id} has an extreme frame aspect ratio (${ratio.toFixed(2)}).`,
          });
        }
      }
      if (region.role === "diagram" && (region.w < 2.0 || region.h < 1.0)) {
        diagnostics.push({
          level: "error",
          code: "VISUAL_CONNECTOR_CLEARANCE",
          slideId: slide.sourceSlideId,
          message: `Diagram region ${region.id} is too small for readable connector routing.`,
        });
      }
    }

    const contentRegions = slide.regions.filter(isContentRegion);
    for (let leftIndex = 0; leftIndex < contentRegions.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < contentRegions.length; rightIndex++) {
        const left = contentRegions[leftIndex]!;
        const right = contentRegions[rightIndex]!;
        if (left.zIndex !== right.zIndex) continue;
        const overlapRatio = regionOverlapRatio(left, right);
        if (overlapRatio <= 0.08) continue;
        diagnostics.push({
          level: "error",
          code: "VISUAL_REGION_OVERLAP",
          slideId: slide.sourceSlideId,
          message: `Regions ${left.id} and ${right.id} overlap on the same z-index layer (${overlapRatio.toFixed(2)} area ratio).`,
        });
      }
    }
  }
  return diagnostics;
}

function createCoherenceValidationSummary(presentation: PresentationIR, layout: LayoutIR) {
  const diagnostics = coherenceValidationDiagnostics(presentation, layout);
  const claimlessSlides = diagnostics.filter((diagnostic) => diagnostic.code === "CLAIMLESS_EVIDENCE_SLIDE").length;
  const captionDetached = diagnostics.filter((diagnostic) => diagnostic.code === "DETACHED_CAPTION").length;
  const orphanTables = diagnostics.filter((diagnostic) => diagnostic.code === "ORPHAN_TABLE").length;
  const lowObjectCoverage = diagnostics.filter((diagnostic) => diagnostic.code === "LOW_OBJECT_COVERAGE").length;
  const evidenceGroups = presentation.coherenceGroups.filter((group) => group.role === "evidence-pack").length;
  const groupedEvidence = presentation.coherenceGroups.filter((group) => group.role === "evidence-pack" && group.supportingBlockIds.length > 0).length;

  return {
    checked: true,
    thresholds: {
      minimumMixedObjectGroupingScore: 0.75,
      minimumObjectCoverageRatio: 0.2,
    },
    orphanEvidenceBlocks: orphanTables,
    captionDetached,
    claimlessSlides,
    sectionMotifDrift: 0,
    continuationTitleQuality: diagnostics.some((diagnostic) => diagnostic.code === "DENSE_CONTINUATION_WITHOUT_TITLE") ? "needs-review" : "ok",
    mixedObjectGroupingScore: evidenceGroups ? Number((groupedEvidence / evidenceGroups).toFixed(2)) : 1,
    checks: {
      claimlessEvidenceSlides: claimlessSlides === 0,
      detachedCaptions: captionDetached === 0,
      orphanTables: orphanTables === 0,
      lowObjectCoverage: lowObjectCoverage === 0,
    },
    diagnostics,
  };
}

function coherenceValidationDiagnostics(presentation: PresentationIR, layout: LayoutIR): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const layoutBySlideId = new Map(layout.slides.map((slide) => [slide.sourceSlideId, slide]));

  for (const slide of presentation.slides) {
    if (slide.role !== "content") continue;
    const group = presentation.coherenceGroups.find((candidate) => candidate.slideId === slide.id);
    const blockRoles = group?.blockRoles ?? {};
    const blockTypes = new Set(slide.blocks.map((block) => block.type));
    const hasEvidenceObject = ["table", "chart", "image", "diagram"].some((type) => blockTypes.has(type as never));
    const hasClaim = Object.values(blockRoles).includes("claim") || slide.blocks.some((block) => block.type === "paragraph" && isClaimLikeText(block.text ?? block.sentences?.join(" ") ?? ""));
    const hasEvidenceRole = Object.values(blockRoles).some((role) => role === "evidence" || role === "metric");

    if (hasEvidenceObject && !hasClaim) {
      diagnostics.push({
        level: "warning",
        code: "CLAIMLESS_EVIDENCE_SLIDE",
        slideId: slide.id,
        message: `Slide "${slide.title ?? slide.id}" contains evidence objects without a claim-like explanatory block.`,
      });
    }

    const firstMeaningfulBlock = slide.blocks.find((block) => block.type !== "heading");
    if (firstMeaningfulBlock?.type === "table" && !hasClaim) {
      diagnostics.push({
        level: "warning",
        code: "ORPHAN_TABLE",
        slideId: slide.id,
        message: `Slide "${slide.title ?? slide.id}" starts with a table that is not attached to an explanatory paragraph.`,
      });
    }

    const imageBlocks = slide.blocks.filter((block) => block.type === "image");
    for (const image of imageBlocks) {
      const imageIndex = slide.blocks.indexOf(image);
      const nextBlock = slide.blocks[imageIndex + 1];
      const hasCaption = nextBlock?.type === "paragraph" && isCaptionLikeText(nextBlock.text ?? nextBlock.sentences?.join(" ") ?? "");
      if (!hasCaption && image.alt && image.alt.length > 0 && slide.blocks.length > 2) {
        diagnostics.push({
          level: "warning",
          code: "DETACHED_CAPTION",
          slideId: slide.id,
          message: `Image "${image.alt}" has no adjacent short caption paragraph.`,
        });
      }
    }

    const layoutSlide = layoutBySlideId.get(slide.id);
    if (layoutSlide && hasEvidenceRole) {
      const coveredBlockIds = new Set(layoutSlide.regions.flatMap((region) => region.blockIds.map((blockId) => blockId.split("#")[0])));
      const contentBlockIds = slide.blocks.filter((block) => block.type !== "heading").map((block) => block.id);
      const coverage = contentBlockIds.length ? contentBlockIds.filter((blockId) => coveredBlockIds.has(blockId)).length / contentBlockIds.length : 1;
      if (coverage < 0.2) {
        diagnostics.push({
          level: "warning",
          code: "LOW_OBJECT_COVERAGE",
          slideId: slide.id,
          message: `Slide "${slide.title ?? slide.id}" maps only ${(coverage * 100).toFixed(0)}% of source blocks to visible layout regions.`,
        });
      }
    }
  }

  return diagnostics;
}

function isClaimLikeText(text: string): boolean {
  return /\b(should|must|because|therefore|shows|means|indicates|suggests|result|impact|why|goal|purpose|objective)\b/i.test(text) ||
    /목적|이유|결과|의미|따라서|때문|필요|개선/.test(text);
}

function isCaptionLikeText(text: string): boolean {
  const normalized = text.trim();
  return normalized.length > 0 && normalized.length <= 120 && /^(figure|fig\.|image|source|caption|그림|출처)[:\s]/i.test(normalized);
}

function isContentRegion(region: LayoutIR["slides"][number]["regions"][number]): boolean {
  if (["icon", "footer", "pageNumber"].includes(region.role)) return false;
  return region.role === "title" || region.blockIds.length > 0;
}

function regionOverlapRatio(left: LayoutIR["slides"][number]["regions"][number], right: LayoutIR["slides"][number]["regions"][number]): number {
  const x = Math.max(0, Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x));
  const y = Math.max(0, Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y));
  const overlap = x * y;
  if (overlap <= 0) return 0;
  const smallerArea = Math.max(0.0001, Math.min(left.w * left.h, right.w * right.h));
  return overlap / smallerArea;
}

function contrastRatio(foreground: string, background: string): number | undefined {
  const fg = parseHexColor(foreground);
  const bg = parseHexColor(background);
  if (!fg || !bg) return undefined;
  const lighter = Math.max(relativeLuminance(fg), relativeLuminance(bg));
  const darker = Math.min(relativeLuminance(fg), relativeLuminance(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

function parseHexColor(value: string): [number, number, number] | undefined {
  const normalized = value.trim().replace(/^#/, "");
  const full = /^[0-9a-fA-F]{3}$/.test(normalized)
    ? normalized.split("").map((part) => `${part}${part}`).join("")
    : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return undefined;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
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

function mergeConfig(base: Config, override?: DeepPartial<Config>): Config {
  if (!override) return structuredClone(base);
  return mergeObjects(structuredClone(base), override) as Config;
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

function resolveLayoutTextOverflow(layout: LayoutIR, presentation: PresentationIR): LayoutIR {
  const contentByBlockId = createContentIndex(presentation);
  const resolved = structuredClone(layout);

  for (let iteration = 0; iteration < 12; iteration++) {
    const diagnostics = validateLayoutOverflow(resolved, contentByBlockId).filter((diagnostic) => diagnostic.code === "TEXT_OVERFLOW");
    if (!diagnostics.length) break;

    let changed = false;
    for (const diagnostic of diagnostics) {
      const slide = resolved.slides.find((candidate) => candidate.sourceSlideId === diagnostic.slideId);
      if (!slide || slide.overflowPolicy.action === "fail" || slide.overflowPolicy.action === "warn") continue;

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
        changed = true;
        continue;
      }

      const maxHeight = Math.max(region.h, resolved.slideSize.height - region.y - 0.35);
      if (region.h < maxHeight) {
        region.h = Math.min(maxHeight, Number((region.h + 0.18).toFixed(2)));
        changed = true;
      }
    }

    if (!changed) break;
  }

  return resolved;
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
