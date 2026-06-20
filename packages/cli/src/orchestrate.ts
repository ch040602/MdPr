import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import type { Config, Diagnostic, OutputFormat, ParserMode, PresentationIR, SlideIR } from "@mdpresent/core";
import { defaultConfig, parseMarkdown, parseMarkdownWithPandoc, planPresentation } from "@mdpresent/core";
import { resolveDesignTokens } from "@mdpresent/core";
import type { LayoutIR } from "@mdpresent/layout";
import { planLayout, validateLayoutOverflow } from "@mdpresent/layout";
import { renderHtml } from "@mdpresent/render-html";
import type { DesignPresetName } from "@mdpresent/render-pptx";
import { renderPptx } from "@mdpresent/render-pptx";
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
};

export type DeckPlan = {
  config: Config;
  configSources: ConfigSource[];
  overrideSource?: OverrideSource;
  presentation: PresentationIR;
  layout: LayoutIR;
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
  const layout = resolveLayoutTextOverflow(planLayout(presentation, config), presentation);
  const diagnostics: Diagnostic[] = [
    ...presentation.diagnostics,
    ...layout.diagnostics,
    ...configDiagnostics,
  ];

  if (options.overridePath) {
    diagnostics.push({
      level: "warning",
      code: "OVERRIDE_FILE_NOT_IMPLEMENTED",
      message: `Override loading is not implemented yet: ${options.overridePath}`,
    });
  }

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

  if (formats.includes("pdf")) {
    deck.diagnostics.push({ level: "warning", code: "PDF_RENDERER_NOT_IMPLEMENTED", message: "PDF renderer is TODO in scaffold." });
  }
  if (formats.includes("pptx")) {
    const outPath = join(outDir, "deck.pptx");
    renderJobs.push((async () => {
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
    slideCount: deck.presentation.slides.length,
    outputs: writtenFiles,
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
    },
  };
}

function createVisualValidationSummary(layout: LayoutIR) {
  const diagnostics = visualValidationDiagnostics(layout);
  return {
    checked: true,
    slideCount: layout.slides.length,
    checks: {
      nonBlankSlides: layout.slides.every((slide) => slide.regions.some((region) => region.blockIds.length || region.role === "title")),
      regionBounds: diagnostics.every((diagnostic) => diagnostic.code !== "VISUAL_REGION_BOUNDS"),
      minimumTextSize: diagnostics.every((diagnostic) => diagnostic.code !== "VISUAL_FONT_FLOOR"),
      backgroundContentOverlap: diagnostics.every((diagnostic) => diagnostic.code !== "VISUAL_BACKGROUND_OVERLAP"),
    },
    diagnostics,
  };
}

function visualValidationDiagnostics(layout: LayoutIR): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
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
    }
  }
  return diagnostics;
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

function sha256(value: string): string {
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

function createContentIndex(presentation: PresentationIR): Map<string, string> {
  const index = new Map<string, string>();

  for (const slide of presentation.slides) {
    if (slide.title) index.set(titleBlockId(slide.id), slide.title);
    for (const block of slide.blocks) {
      if (block.text) index.set(block.id, blockTextForValidation(block));
      if (block.items?.length || block.listItems?.length) {
        const items = block.items?.length ? block.items : block.listItems?.map((item) => item.text) ?? [];
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
  return block.text ?? "";
}

function titleBlockId(slideId: string): string {
  return `__title:${slideId}`;
}
