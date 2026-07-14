import type { Diagnostic } from "@mdpresent/core";
import type { LayoutIR } from "@mdpresent/layout";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { platform } from "node:os";
import { extname, join } from "node:path";

export type FontEnvironmentCatalog = {
  source: string;
  installedFamilies: string[];
};

export type FontEnvironmentSummary = {
  checked: boolean;
  source: string;
  requestedFamilies: string[];
  installedFamilies: string[];
  missingFamilies: string[];
  allAvailable: boolean;
  embedding: {
    performed: false;
    reason: "font-embedding-not-requested";
  };
};

let cachedNativeCatalog: FontEnvironmentCatalog | undefined;

export function probeInstalledFontEnvironment(): FontEnvironmentCatalog {
  if (cachedNativeCatalog) return cachedNativeCatalog;

  const fontconfig = commandOutput("fc-list", ["--format", "%{family}\n"]);
  if (fontconfig) {
    cachedNativeCatalog = {
      source: "fontconfig",
      installedFamilies: uniqueFamilies(fontconfig.split(/\r?\n/).flatMap((line) => line.split(","))),
    };
    return cachedNativeCatalog;
  }

  if (platform() === "win32") {
    const registry = [
      commandOutput("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"]),
      commandOutput("reg", ["query", "HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"]),
    ].filter((value): value is string => Boolean(value)).join("\n");
    if (registry) {
      cachedNativeCatalog = {
        source: "windows-registry",
        installedFamilies: uniqueFamilies(registry.split(/\r?\n/).flatMap(registryFontFamilies)),
      };
      return cachedNativeCatalog;
    }
  }

  const filesystemFamilies = fontDirectories().flatMap(fontFamiliesFromDirectory);
  cachedNativeCatalog = filesystemFamilies.length
    ? { source: "filesystem-fallback", installedFamilies: uniqueFamilies(filesystemFamilies) }
    : { source: "unavailable", installedFamilies: [] };
  return cachedNativeCatalog;
}

export function inspectFontEnvironment(
  layout: LayoutIR,
  catalog: FontEnvironmentCatalog | undefined,
  required: boolean,
): { summary: FontEnvironmentSummary; diagnostics: Diagnostic[] } {
  const requestedFamilies = uniqueFamilies([
    layout.theme.fontFamily,
    ...layout.slides.flatMap((slide) => slide.regions.map((region) => region.typography?.fontFamily)),
  ]);
  const installedFamilies = uniqueFamilies(catalog?.installedFamilies ?? []);
  const installedKeys = new Set(installedFamilies.map(fontKey));
  const missingFamilies = requestedFamilies.filter((family) => !installedKeys.has(fontKey(family)));
  const source = catalog?.source ?? "unavailable";
  const checked = Boolean(catalog && source !== "unavailable");
  const diagnostics: Diagnostic[] = [];

  if (required && !checked) {
    diagnostics.push({
      level: "error",
      code: "FONT_ENVIRONMENT_UNAVAILABLE",
      message: "The export environment font catalog could not be inspected.",
      details: { probeSource: source, requestedFamilies },
    });
  } else if (required) {
    for (const requestedFamily of missingFamilies) {
      diagnostics.push({
        level: "error",
        code: "FONT_FAMILY_NOT_INSTALLED",
        message: `Configured font family ${requestedFamily} is not installed in the export environment.`,
        details: { requestedFamily, probeSource: source, installed: false },
      });
    }
  }

  return {
    summary: {
      checked,
      source,
      requestedFamilies,
      installedFamilies,
      missingFamilies,
      allAvailable: checked && missingFamilies.length === 0,
      embedding: { performed: false, reason: "font-embedding-not-requested" },
    },
    diagnostics,
  };
}

function uniqueFamilies(values: Array<string | undefined>): string[] {
  const families = new Map<string, string>();
  for (const value of values) {
    const family = value?.trim();
    if (family && !families.has(fontKey(family))) families.set(fontKey(family), family);
  }
  return Array.from(families.values());
}

function fontKey(value: string): string {
  return value.normalize("NFKC").replace(/[\s_-]+/g, "").toLocaleLowerCase("en-US");
}

function commandOutput(command: string, args: string[]): string | undefined {
  try {
    return execFileSync(command, args, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return undefined;
  }
}

function registryFontFamilies(line: string): string[] {
  const match = /^\s*(.+?)\s+REG_(?:SZ|EXPAND_SZ)\s+.+$/i.exec(line);
  if (!match) return [];
  return [stripFontStyle(match[1]!.replace(/\s*\((?:TrueType|OpenType)\)\s*$/i, ""))];
}

function fontDirectories(): string[] {
  if (platform() === "win32") {
    return [
      process.env.WINDIR ? join(process.env.WINDIR, "Fonts") : undefined,
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Microsoft", "Windows", "Fonts") : undefined,
    ].filter((value): value is string => Boolean(value));
  }
  if (platform() === "darwin") {
    return ["/System/Library/Fonts", "/Library/Fonts", process.env.HOME ? join(process.env.HOME, "Library", "Fonts") : ""];
  }
  return ["/usr/share/fonts", "/usr/local/share/fonts", process.env.HOME ? join(process.env.HOME, ".fonts") : ""];
}

function fontFamiliesFromDirectory(directory: string): string[] {
  if (!directory || !existsSync(directory)) return [];
  try {
    return readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && [".ttf", ".otf", ".ttc"].includes(extname(entry.name).toLowerCase()))
      .map((entry) => stripFontStyle(entry.name.slice(0, -extname(entry.name).length)));
  } catch {
    return [];
  }
}

function stripFontStyle(value: string): string {
  return value
    .replace(/[-_ ]+(?:thin|extralight|ultralight|light|regular|medium|semibold|demibold|bold|extrabold|ultrabold|black|italic|oblique)(?:[-_ ]+(?:italic|oblique))?$/i, "")
    .trim();
}
