#!/usr/bin/env node
import { buildDeck, inspectDeck, planDeck, validateDeck } from "./orchestrate.js";
import { isDesignPresetName as isKnownDesignPresetName, type DesignPresetName, type OutputFormat, type ParserMode } from "@mdpresent/core";

const args = process.argv.slice(2);
const exitCode = await runCli(args);
if (exitCode !== 0) process.exit(exitCode);

export async function runCli(args: string[]): Promise<number> {
  const command = args[0];
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
      themeGalleryPresets: readThemeGalleryPresets(args),
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

function readCommonOptions(args: string[]) {
  return {
    configPath: readOption(args, "--config"),
    overridePath: readOption(args, "--override"),
    parser: readParserMode(args),
  };
}

function readFormats(args: string[]): OutputFormat[] {
  const value = readOption(args, "--to") ?? "html";
  return value.split(",").map((format) => format.trim()).filter(Boolean) as OutputFormat[];
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
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
  mdpresent inspect <deck.md> [--parser simple|pandoc] [--json]
  mdpresent plan <deck.md> [--parser simple|pandoc] [--json]
  mdpresent validate <deck.md> [--parser simple|pandoc] [--override deck.override.yaml] [--json]
  mdpresent build <deck.md> --to pptx,html --out dist [--parser simple|pandoc] [--design executive] [--theme-gallery executive,nord] [--template master.pptx]

Config and override file loading are still scaffold diagnostics. HTML and PPTX rendering are wired through the shared orchestration path.
`);
}
