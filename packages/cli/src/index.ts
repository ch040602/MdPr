#!/usr/bin/env node
import { buildDeck, inspectDeck, planDeck, validateDeck } from "./orchestrate.js";
import {
  isDecorationStyleName as isKnownDecorationStyleName,
  isDesignPresetName as isKnownDesignPresetName,
  type ColorCombinationName,
  type DecorationStyleName,
  type DesignPresetName,
  type OutputFormat,
  type ParserMode,
} from "@mdpresent/core";
import { inspectPdfExporterEnvironment } from "@mdpresent/render-pdf";
import { importPackCandidate, listBuiltInPacks, previewPack, validateMdprPack, type MdprPack } from "@mdpresent/pack";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readGeneratedAssetsManifest, validateGeneratedAssetsManifest } from "./generatedAssets.js";
import { readMdprJobState, summarizeMdprJobState, validateMdprJobState } from "./jobState.js";

const args = process.argv.slice(2);
const exitCode = await runCli(args);
if (exitCode !== 0) process.exit(exitCode);

export async function runCli(args: string[]): Promise<number> {
  const command = args[0];

  if (command === "doctor") {
    if (args.includes("--pdf")) return doctorPdf();
    printHelp();
    return 1;
  }

  if (command === "pack") {
    return runPackCommand(args.slice(1));
  }

  if (command === "job-state") {
    return runJobStateCommand(args.slice(1));
  }

  if (command === "generated-assets") {
    return runGeneratedAssetsCommand(args.slice(1));
  }

  const input = args[1];
  if (!command || !input) {
    printHelp();
    return 1;
  }

  if (command === "inspect") {
    const slides = inspectDeck(input, readCommonOptions(args));
    if (args.includes("--json")) console.log(JSON.stringify(slides, null, 2));
    else {
      for (const slide of slides) {
        console.log(`${slide.index}\t${slide.role}\t${slide.intent}\t${slide.id}\t${slide.title ?? ""}`);
      }
    }
    return 0;
  }

  if (command === "plan") {
    const deck = planDeck(input, readCommonOptions(args));
    console.log(JSON.stringify(deck.layout, null, 2));
    return 0;
  }

  if (command === "build") {
    const result = await buildDeck(input, {
      ...readCommonOptions(args),
      formats: readFormats(args),
      outDir: readOption(args, "--out") ?? "dist",
      templatePath: readOption(args, "--template"),
      designPreset: readDesignPreset(args),
      cliConfig: readCliConfig(args),
      themeGalleryPresets: readThemeGalleryPresets(args),
      packPath: readOption(args, "--pack"),
      designLockPath: readOption(args, "--design-lock"),
      updateDesignLock: args.includes("--update-design-lock"),
      visualValidation: args.includes("--visual"),
    });

    for (const outPath of result.writtenFiles) console.log(`Wrote ${outPath}`);
    for (const diagnostic of result.diagnostics) {
      if (diagnostic.level === "warning") console.warn(diagnostic.message);
    }
    return 0;
  }

  if (command === "validate") {
    const result = validateDeck(input, readCommonOptions(args));
    if (args.includes("--json")) {
      console.log(JSON.stringify({
        valid: result.valid,
        diagnostics: result.diagnostics,
      }, null, 2));
    } else if (result.diagnostics.length) {
      for (const diagnostic of result.diagnostics) {
        console.log(`${diagnostic.level}\t${diagnostic.code ?? ""}\t${diagnostic.message}`);
      }
    } else {
      console.log("ok");
    }
    return result.valid ? 0 : 1;
  }

  printHelp();
  return 1;
}

function runGeneratedAssetsCommand(args: string[]): number {
  const subcommand = args[0];
  const inputPath = args[1] && !args[1].startsWith("--") ? args[1] : readOption(args, "--manifest");
  if (subcommand !== "validate" || !inputPath) {
    printHelp();
    return 1;
  }
  const validation = validateGeneratedAssetsManifest(readGeneratedAssetsManifest(inputPath));
  if (args.includes("--json")) console.log(JSON.stringify(validation, null, 2));
  else if (validation.valid) console.log("ok");
  else for (const error of validation.errors) console.log(`error\tGENERATED_ASSET_INVALID\t${error}`);
  return validation.valid ? 0 : 1;
}

function runJobStateCommand(args: string[]): number {
  const subcommand = args[0];
  const inputPath = args[1] && !args[1].startsWith("--") ? args[1] : readOption(args, "--state");
  if (!subcommand || !inputPath) {
    printHelp();
    return 1;
  }
  const state = readMdprJobState(inputPath);
  if (subcommand === "validate") {
    const validation = validateMdprJobState(state);
    if (args.includes("--json")) console.log(JSON.stringify(validation, null, 2));
    else if (validation.valid) console.log("ok");
    else for (const finding of validation.findings) console.log(`error\tJOB_STATE_INVALID\t${finding}`);
    return validation.valid ? 0 : 1;
  }
  if (subcommand === "status") {
    const summary = summarizeMdprJobState(state);
    if (args.includes("--json")) console.log(JSON.stringify(summary, null, 2));
    else {
      console.log(`total\t${summary.total}`);
      for (const [status, count] of Object.entries(summary.byStatus)) console.log(`${status}\t${count}`);
    }
    return 0;
  }
  printHelp();
  return 1;
}

async function doctorPdf(): Promise<number> {
  const status = await inspectPdfExporterEnvironment();
  console.log("PDF exporter:");
  console.log(`  platform: ${status.platform}`);
  console.log(`  preferred: ${status.preferred ?? "none"}`);
  console.log(`  injected: ${status.injected ? "yes" : "no"}`);
  for (const candidate of status.candidates) {
    const suffix = candidate.version ? ` (${candidate.version})` : candidate.message ? ` (${candidate.message})` : "";
    console.log(`  - ${candidate.label}: ${candidate.found ? "found" : "missing"} ${candidate.executable}${suffix}`);
  }
  return status.available ? 0 : 1;
}

function runPackCommand(args: string[]): number {
  const subcommand = args[0];
  if (subcommand === "list") {
    console.log(JSON.stringify(listBuiltInPacks(), null, 2));
    return 0;
  }

  const inputPath = args[1];
  if (!subcommand || !inputPath) {
    printHelp();
    return 1;
  }

  if (!existsSync(inputPath)) {
    console.error(`Pack input not found: ${inputPath}`);
    return 1;
  }

  const parsed = readJsonInput(inputPath);
  if (!parsed.ok) {
    const result = {
      valid: false,
      diagnostics: [{
        level: "error",
        code: "PACK_FILE_INVALID",
        message: `Pack input could not be parsed: ${inputPath}. ${parsed.message}`,
      }],
    };
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.error(`${result.diagnostics[0].level}\t${result.diagnostics[0].code}\t${result.diagnostics[0].message}`);
    return 1;
  }
  const value = parsed.value;
  if (subcommand === "validate") {
    const result = validateMdprPack(value);
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else if (result.valid) console.log("ok");
    else for (const diagnostic of result.diagnostics) console.log(`${diagnostic.level}\t${diagnostic.code}\t${diagnostic.message}`);
    return result.valid ? 0 : 1;
  }

  if (subcommand === "import") {
    const imported = importPackCandidate({ candidate: value, approved: args.includes("--approved") });
    const valid = imported.diagnostics.every((diagnostic) => diagnostic.level !== "error");
    if (!valid) {
      for (const diagnostic of imported.diagnostics) console.error(`${diagnostic.level}\t${diagnostic.code}\t${diagnostic.message}`);
      return 1;
    }
    const outPath = readOption(args, "--out") ?? "mdpr.pack.json";
    writeFileSync(outPath, JSON.stringify(imported.pack, null, 2), "utf-8");
    console.log(`Wrote ${outPath}`);
    return 0;
  }

  if (subcommand === "preview") {
    const result = validateMdprPack(value);
    if (!result.valid) {
      for (const diagnostic of result.diagnostics) console.error(`${diagnostic.level}\t${diagnostic.code}\t${diagnostic.message}`);
      return 1;
    }
    console.log(JSON.stringify(previewPack(value as MdprPack), null, 2));
    return 0;
  }

  printHelp();
  return 1;
}

function readJsonInput(path: string): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, "utf-8")) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function readCommonOptions(args: string[]) {
  return {
    configPath: readOption(args, "--config"),
    overridePath: readOption(args, "--override"),
    hintPath: readOption(args, "--hints"),
    packPath: readOption(args, "--pack"),
    parser: readParserMode(args),
    cliConfig: readCliConfig(args),
    visualValidation: args.includes("--visual"),
    coherenceValidation: args.includes("--coherence"),
    strict: args.includes("--strict"),
    requireFontInstalled: args.includes("--require-font-installed"),
    embedFontPaths: readOptions(args, "--embed-font"),
    requireFontEmbedded: args.includes("--require-font-embedded"),
    fontLicenseEvidencePath: readOption(args, "--font-license-evidence"),
    requireFontLicenseEvidence: args.includes("--require-font-license-evidence"),
  };
}

function readFormats(args: string[]): OutputFormat[] {
  const value = readOption(args, "--to") ?? "html";
  const formats = value.split(",").map((format) => format.trim()).filter(Boolean);
  const allowed: OutputFormat[] = ["pptx", "html", "pdf"];
  for (const format of formats) {
    if (!allowed.includes(format as OutputFormat)) {
      throw new Error(`Unknown output format: ${format}. Allowed formats: ${allowed.join(", ")}`);
    }
  }
  return formats as OutputFormat[];
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];

  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : undefined;
}

function readOptions(args: string[], name: string): string[] {
  const values: string[] = [];
  const prefix = `${name}=`;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === name && args[index + 1] && !args[index + 1]!.startsWith("--")) values.push(args[index + 1]!);
    else if (arg.startsWith(prefix) && arg.length > prefix.length) values.push(arg.slice(prefix.length));
  }
  return values;
}

function readParserMode(args: string[]): ParserMode | undefined {
  const value = readOption(args, "--parser");
  if (!value) return undefined;
  if (value === "simple" || value === "pandoc") return value;
  throw new Error(`Unknown parser mode: ${value}`);
}

function readDesignPreset(args: string[]): DesignPresetName | undefined {
  const value = readOption(args, "--design");
  if (!value) return undefined;
  if (isDesignPresetName(value)) return value;
  throw new Error(`Unknown design preset: ${value}`);
}

function readDecorationStyle(args: string[]): DecorationStyleName | undefined {
  const value = readOption(args, "--theme-style");
  if (!value) return undefined;
  if (isKnownDecorationStyleName(value)) return value;
  throw new Error(`Unknown theme decoration style: ${value}`);
}

function readColorCombination(args: string[]): ColorCombinationName | undefined {
  const value = readOption(args, "--theme-harmony");
  if (!value) return undefined;
  if (["preset", "monochromatic", "analogous", "complementary", "split-complementary", "triadic"].includes(value)) return value as ColorCombinationName;
  throw new Error(`Unknown theme harmony: ${value}`);
}

function readCliConfig(args: string[]) {
  const decorationStyle = readDecorationStyle(args);
  const colorSeed = readOption(args, "--theme-color");
  const colorCombination = readColorCombination(args);
  const pipelineOnePage = args.includes("--pipeline-one-page");
  if (!decorationStyle && !colorSeed && !colorCombination && !pipelineOnePage) return undefined;
  return {
    ...(pipelineOnePage ? { deck: { presentationMode: "pipeline-one-page" as const } } : {}),
    theme: {
      ...(decorationStyle ? { decorationStyle } : {}),
      ...(colorSeed ? { colorSeed, primaryColor: colorSeed } : {}),
      ...(colorCombination ? { colorCombination } : {}),
    },
  };
}

function readThemeGalleryPresets(args: string[]): DesignPresetName[] | undefined {
  const value = readOption(args, "--theme-gallery");
  if (!value) return undefined;
  const presets = value.split(",").map((preset) => preset.trim()).filter(Boolean);
  for (const preset of presets) {
    if (!isDesignPresetName(preset)) throw new Error(`Unknown design preset: ${preset}`);
  }
  return presets as DesignPresetName[];
}

function isDesignPresetName(value: string): value is DesignPresetName {
  return isKnownDesignPresetName(value);
}

function printHelp() {
  console.log(`mdpresent scaffold CLI

Usage:
  mdpresent doctor --pdf
  mdpresent pack list
  mdpresent pack validate <mdpr.pack.json> [--json]
  mdpresent pack import <candidate.json> --approved [--out mdpr.pack.json]
  mdpresent pack preview <mdpr.pack.json>
  mdpresent job-state validate <mdpr-job-state.json|build-dir> [--json]
  mdpresent job-state status <mdpr-job-state.json|build-dir> [--json]
  mdpresent generated-assets validate <mdpr-generated-assets.json> [--json]
  mdpresent inspect <deck.md> [--parser simple|pandoc] [--json]
  mdpresent plan <deck.md> [--parser simple|pandoc] [--json]
  mdpresent validate <deck.md> [--parser simple|pandoc] [--override deck.override.yaml] [--hints deck.mdpr-hints.json] [--visual] [--coherence] [--strict] [--require-font-installed] [--embed-font face.ttf ...] [--require-font-embedded] [--font-license-evidence evidence.json] [--require-font-license-evidence] [--json]
  mdpresent build <deck.md> --to pptx,html --out dist [--parser simple|pandoc] [--pipeline-one-page] [--design executive] [--theme-style skeuomorphism|neomorphism|glassmorphism|claymorphism|minimalism|newmorphism|brutalism|liquid-glass|bentogrid] [--theme-color #2563EB] [--theme-harmony analogous] [--theme-gallery executive,nord] [--pack mdpr.pack.json] [--hints deck.mdpr-hints.json] [--template master.pptx] [--design-lock lock.json] [--update-design-lock] [--visual] [--coherence] [--strict] [--require-font-installed] [--embed-font face.ttf ...] [--require-font-embedded] [--font-license-evidence evidence.json] [--require-font-license-evidence]

Config files are validated against schemas/config.schema.json before merging. Approved packs are validated against schemas/mdpr-pack.schema.json and can provide tokenized theme inputs. Optional agent hints are validated against schemas/agent-hint.schema.json and cannot set final layout/style decisions. Generated asset metadata is validated as provenance and request policy only; it cannot provide secrets or become a full-slide renderer. HTML, PPTX, and PDF rendering are wired through the shared orchestration path.
`);
}
