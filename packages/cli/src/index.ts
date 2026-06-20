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
      cliConfig: readThemeCliConfig(args),
      themeGalleryPresets: readThemeGalleryPresets(args),
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

function readCommonOptions(args: string[]) {
  return {
    configPath: readOption(args, "--config"),
    overridePath: readOption(args, "--override"),
    parser: readParserMode(args),
    cliConfig: readThemeCliConfig(args),
    visualValidation: args.includes("--visual"),
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

function readThemeCliConfig(args: string[]) {
  const decorationStyle = readDecorationStyle(args);
  const colorSeed = readOption(args, "--theme-color");
  const colorCombination = readColorCombination(args);
  if (!decorationStyle && !colorSeed && !colorCombination) return undefined;
  return {
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
  mdpresent inspect <deck.md> [--parser simple|pandoc] [--json]
  mdpresent plan <deck.md> [--parser simple|pandoc] [--json]
  mdpresent validate <deck.md> [--parser simple|pandoc] [--override deck.override.yaml] [--visual] [--json]
  mdpresent build <deck.md> --to pptx,html --out dist [--parser simple|pandoc] [--design executive] [--theme-style minimalism|newmorphism|glass|grid|data|magazine] [--theme-color #2563EB] [--theme-harmony analogous] [--theme-gallery executive,nord] [--template master.pptx] [--design-lock lock.json] [--update-design-lock] [--visual]

Config and override file loading are still scaffold diagnostics. HTML and PPTX rendering are wired through the shared orchestration path.
`);
}
