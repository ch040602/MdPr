import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import type { Config, Diagnostic, OutputFormat, PresentationIR, SlideIR } from "@mdpresent/core";
import { defaultConfig, parseMarkdown, planPresentation } from "@mdpresent/core";
import type { LayoutIR } from "@mdpresent/layout";
import { planLayout, validateLayoutOverflow } from "@mdpresent/layout";
import { renderHtml } from "@mdpresent/render-html";
import type { DesignPresetName } from "@mdpresent/render-pptx";
import { renderPptx } from "@mdpresent/render-pptx";
import { parse as parseYaml } from "yaml";

export type ConfigSource =
  | { kind: "default" }
  | { kind: "config-file"; path: string }
  | { kind: "cli-args"; values: Partial<Config> };

export type OverrideSource = {
  path: string;
};

export type OrchestrationOptions = {
  configPath?: string;
  overridePath?: string;
  cliConfig?: Partial<Config>;
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
};

export type BuildResult = DeckPlan & {
  writtenFiles: string[];
};

export type ValidationResult = DeckPlan & {
  valid: boolean;
};

export function createDeckPlan(inputPath: string, options: OrchestrationOptions = {}): DeckPlan {
  const configDiagnostics: Diagnostic[] = [];
  const config = resolveEffectiveConfig(options, configDiagnostics);
  const markdown = readFileSync(inputPath, "utf-8");
  const doc = parseMarkdown(markdown, inputPath);
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
  const writtenFiles: string[] = [];

  mkdirSync(outDir, { recursive: true });

  if (formats.includes("html")) {
    const html = renderHtml(
      { presentation: deck.presentation, layout: deck.layout },
      {
        title: deck.presentation.meta.title,
        designPreset: options.designPreset ?? deck.config.theme.designPreset ?? deck.config.pptx.designPreset,
      },
    );
    const outPath = join(outDir, "deck.html");
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html, "utf-8");
    writtenFiles.push(outPath);
  }

  if (formats.includes("pdf")) {
    deck.diagnostics.push({ level: "warning", code: "PDF_RENDERER_NOT_IMPLEMENTED", message: "PDF renderer is TODO in scaffold." });
  }
  if (formats.includes("pptx")) {
    const outPath = join(outDir, "deck.pptx");
    mkdirSync(dirname(outPath), { recursive: true });
    await renderPptx(
      { presentation: deck.presentation, layout: deck.layout },
      {
        outPath,
        templatePath: options.templatePath ?? deck.config.pptx.template,
        designPreset: options.designPreset ?? deck.config.theme.designPreset ?? deck.config.pptx.designPreset,
        themeGalleryPresets: options.themeGalleryPresets,
        lockBackgroundToMaster: deck.config.pptx.lockBackgroundToMaster,
      },
    );
    writtenFiles.push(outPath);
  }

  return { ...deck, writtenFiles };
}

export function validateDeck(inputPath: string, options: OrchestrationOptions = {}): ValidationResult {
  const deck = createDeckPlan(inputPath, options);
  const contentByBlockId = createContentIndex(deck.presentation);
  const overflowDiagnostics = validateLayoutOverflow(deck.layout, contentByBlockId);
  const diagnostics = [...deck.diagnostics, ...overflowDiagnostics];

  return {
    ...deck,
    diagnostics,
    valid: diagnostics.every((diagnostic) => diagnostic.level !== "error"),
  };
}

export function resolveEffectiveConfig(options: OrchestrationOptions = {}, diagnostics: Diagnostic[] = []): Config {
  const fileConfig = options.configPath ? readConfigFile(options.configPath, diagnostics) : undefined;
  return mergeConfig(mergeConfig(defaultConfig, fileConfig), options.cliConfig);
}

function mergeConfig(base: Config, override?: Partial<Config>): Config {
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
