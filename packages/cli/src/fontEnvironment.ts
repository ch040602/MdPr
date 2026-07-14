import type { BlockIR, Diagnostic, PresentationIR } from "@mdpresent/core";
import type { LayoutIR } from "@mdpresent/layout";
import { inspectOpenTypeFont, type EmbeddedFontStyle, type FontEmbeddingResult, type OpenTypeFontInspection } from "@mdpresent/render-pptx";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
  embedding: FontEmbeddingSummary;
};

export type FontFaceRequirement = { family: string; styles: EmbeddedFontStyle[] };

export type FontEmbeddingCoverage = {
  requiredFaces: FontFaceRequirement[];
  suppliedFaces: FontFaceRequirement[];
  missingFaces: FontFaceRequirement[];
  complete: boolean;
};

export type FontLicenseEvidenceRecord = {
  fontSha256: string;
  licenseId: string;
  licenseSource: string;
  pptxEmbeddingAllowed: boolean;
  redistributionAllowed: boolean;
  attestedBy: string;
  attestedAt: string;
};

export type FontLicenseEvidenceSummary = {
  supplied: boolean;
  required: boolean;
  evidencePath?: string;
  schemaVersion?: "mdpr-font-license-evidence-v1";
  records: FontLicenseEvidenceRecord[];
  missingFontSha256: string[];
  unusedFontSha256: string[];
  complete: boolean;
  legalDetermination: "external";
};

export type FontEmbeddingSummary =
  | { performed: false; reason: "font-embedding-not-requested"; licenseEvidence: FontLicenseEvidenceSummary }
  | {
    performed: false;
    reason: "font-embedding-pending-build";
    requestedFiles: string[];
    fonts: Array<OpenTypeFontInspection & { sourcePath: string; sha256: string }>;
    coverage: FontEmbeddingCoverage;
    licenseEvidence: FontLicenseEvidenceSummary;
  }
  | (Omit<FontEmbeddingResult, "performed"> & {
    performed: true;
    coverage: FontEmbeddingCoverage;
    licenseEvidence: FontLicenseEvidenceSummary;
  });

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
  embeddingRequest: {
    fontPaths?: string[];
    requireComplete?: boolean;
    licenseEvidencePath?: string;
    requireLicenseEvidence?: boolean;
  } = {},
  presentation?: PresentationIR,
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

  const embedding = inspectEmbeddingRequest(
    layout,
    embeddingRequest.fontPaths ?? [],
    Boolean(embeddingRequest.requireComplete),
    diagnostics,
    presentation,
    embeddingRequest.licenseEvidencePath,
    Boolean(embeddingRequest.requireLicenseEvidence),
  );

  return {
    summary: {
      checked,
      source,
      requestedFamilies,
      installedFamilies,
      missingFamilies,
      allAvailable: checked && missingFamilies.length === 0,
      embedding,
    },
    diagnostics,
  };
}

export function completeFontEmbeddingSummary(
  current: FontEmbeddingSummary,
  result: FontEmbeddingResult,
): FontEmbeddingSummary {
  if (!result.performed) return current;
  const coverage = current.performed === false && current.reason === "font-embedding-pending-build"
    ? current.coverage
    : coverageFor([], result.fonts.map((font) => ({ family: font.family, style: font.style })));
  return {
    performed: true,
    format: result.format,
    fonts: result.fonts,
    coverage,
    licenseEvidence: bindFontLicenseEvidence(
      current.licenseEvidence ?? emptyLicenseEvidence(false),
      result.fonts.map((font) => font.sha256),
    ),
  };
}

function inspectEmbeddingRequest(
  layout: LayoutIR,
  fontPaths: string[],
  requireComplete: boolean,
  diagnostics: Diagnostic[],
  presentation?: PresentationIR,
  licenseEvidencePath?: string,
  requireLicenseEvidence = false,
): FontEmbeddingSummary {
  if (fontPaths.length === 0 && !requireComplete && !licenseEvidencePath && !requireLicenseEvidence) {
    return {
      performed: false,
      reason: "font-embedding-not-requested",
      licenseEvidence: emptyLicenseEvidence(false),
    };
  }
  const fonts: Array<OpenTypeFontInspection & { sourcePath: string; sha256: string }> = [];
  const seenFaces = new Set<string>();
  const requestedFamilies = new Set(requiredFontFaces(layout, presentation).map((face) => fontKey(face.family)));

  for (const sourcePath of fontPaths) {
    if (!existsSync(sourcePath)) {
      diagnostics.push({
        level: "error",
        code: "FONT_EMBEDDING_FILE_MISSING",
        message: `Requested font file does not exist: ${sourcePath}.`,
        details: { sourcePath },
      });
      continue;
    }
    try {
      const fontBytes = readFileSync(sourcePath);
      const inspection = inspectOpenTypeFont(fontBytes);
      const faceKey = `${fontKey(inspection.family)}:${inspection.style}`;
      if (seenFaces.has(faceKey)) {
        diagnostics.push({
          level: "error",
          code: "FONT_EMBEDDING_DUPLICATE_STYLE",
          message: `Font family ${inspection.family} has more than one ${inspection.style} embedding source.`,
          details: { sourcePath, family: inspection.family, style: inspection.style },
        });
      }
      seenFaces.add(faceKey);
      if (!inspection.editableEmbeddingAllowed) {
        diagnostics.push({
          level: "error",
          code: "FONT_EMBEDDING_NOT_EDITABLE",
          message: `Font ${inspection.fullName} cannot be embedded in an editable PPTX (${inspection.bitmapOnly ? "bitmap-only" : inspection.embeddingPermission}).`,
          details: { sourcePath, family: inspection.family, fsType: inspection.fsType, permission: inspection.embeddingPermission },
        });
      }
      if (!requestedFamilies.has(fontKey(inspection.family))) {
        diagnostics.push({
          level: "error",
          code: "FONT_EMBEDDING_UNUSED_FAMILY",
          message: `Embedded font family ${inspection.family} is not used by the planned presentation.`,
          details: { sourcePath, family: inspection.family },
        });
      }
      fonts.push({ ...inspection, sourcePath, sha256: sha256(fontBytes) });
    } catch (error) {
      diagnostics.push({
        level: "error",
        code: "FONT_EMBEDDING_FILE_INVALID",
        message: `Requested font file could not be inspected: ${sourcePath}. ${error instanceof Error ? error.message : String(error)}`,
        details: { sourcePath },
      });
    }
  }

  const requiredFaces = requiredFontFaces(layout, presentation);
  const coverage = coverageFor(requiredFaces, fonts.map((font) => ({ family: font.family, style: font.style })));
  if (requireComplete) {
    for (const face of coverage.missingFaces) {
      diagnostics.push({
        level: "error",
        code: "FONT_EMBEDDING_FACE_MISSING",
        message: `Portable PPTX output requires embedded ${face.styles.join("/")} face(s) for ${face.family}.`,
        details: face,
      });
    }
  }
  const licenseEvidence = inspectFontLicenseEvidence(
    licenseEvidencePath,
    requireLicenseEvidence,
    fonts.map((font) => font.sha256),
    diagnostics,
  );
  return {
    performed: false,
    reason: "font-embedding-pending-build",
    requestedFiles: [...fontPaths],
    fonts,
    coverage,
    licenseEvidence,
  };
}

function inspectFontLicenseEvidence(
  evidencePath: string | undefined,
  required: boolean,
  fontSha256Values: string[],
  diagnostics: Diagnostic[],
): FontLicenseEvidenceSummary {
  if (!evidencePath) {
    if (required) {
      diagnostics.push({
        level: "error",
        code: "FONT_LICENSE_EVIDENCE_REQUIRED",
        message: "Strict font portability requires a font license evidence file.",
        details: { required: true, legalDetermination: "external" },
      });
    }
    return emptyLicenseEvidence(required);
  }
  if (!existsSync(evidencePath)) {
    diagnostics.push({
      level: "error",
      code: "FONT_LICENSE_EVIDENCE_FILE_MISSING",
      message: `Font license evidence file does not exist: ${evidencePath}.`,
      details: { evidencePath },
    });
    return { ...emptyLicenseEvidence(required), supplied: true, evidencePath };
  }

  let value: unknown;
  try {
    value = JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch (error) {
    diagnostics.push({
      level: "error",
      code: "FONT_LICENSE_EVIDENCE_INVALID",
      message: `Font license evidence could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
      details: { evidencePath },
    });
    return { ...emptyLicenseEvidence(required), supplied: true, evidencePath };
  }

  if (!isRecord(value) || value.schemaVersion !== "mdpr-font-license-evidence-v1" || !Array.isArray(value.fonts)) {
    diagnostics.push({
      level: "error",
      code: "FONT_LICENSE_EVIDENCE_INVALID",
      message: "Font license evidence must use schemaVersion mdpr-font-license-evidence-v1 and contain a fonts array.",
      details: { evidencePath },
    });
    return { ...emptyLicenseEvidence(required), supplied: true, evidencePath };
  }

  const records: FontLicenseEvidenceRecord[] = [];
  const seen = new Set<string>();
  let structurallyValid = true;
  let authorizationComplete = true;
  for (const [index, candidate] of value.fonts.entries()) {
    if (!isFontLicenseEvidenceRecord(candidate)) {
      structurallyValid = false;
      diagnostics.push({
        level: "error",
        code: "FONT_LICENSE_EVIDENCE_INVALID",
        message: `Font license evidence record ${index} is malformed.`,
        details: { evidencePath, index },
      });
      continue;
    }
    const hash = candidate.fontSha256.toLowerCase();
    if (seen.has(hash)) {
      structurallyValid = false;
      diagnostics.push({
        level: "error",
        code: "FONT_LICENSE_EVIDENCE_DUPLICATE_RECORD",
        message: `Font license evidence contains duplicate SHA-256 ${hash}.`,
        details: { evidencePath, fontSha256: hash },
      });
      continue;
    }
    seen.add(hash);
    if (candidate.pptxEmbeddingAllowed !== true || candidate.redistributionAllowed !== true) {
      authorizationComplete = false;
      diagnostics.push({
        level: "error",
        code: "FONT_LICENSE_EVIDENCE_AUTHORIZATION_REQUIRED",
        message: `Font license evidence for ${hash} does not explicitly authorize editable PPTX embedding and redistribution.`,
        details: { evidencePath, fontSha256: hash },
      });
    }
    records.push({ ...candidate, fontSha256: hash });
  }

  const fontHashes = new Set(fontSha256Values.map((value) => value.toLowerCase()));
  const recordHashes = new Set(records.map((record) => record.fontSha256));
  const missingFontSha256 = Array.from(fontHashes).filter((hash) => !recordHashes.has(hash));
  const unusedFontSha256 = Array.from(recordHashes).filter((hash) => !fontHashes.has(hash));
  for (const fontSha256 of missingFontSha256) {
    diagnostics.push({
      level: "error",
      code: "FONT_LICENSE_EVIDENCE_FONT_MISSING",
      message: `No complete license evidence is bound to embedded font SHA-256 ${fontSha256}.`,
      details: { evidencePath, fontSha256 },
    });
  }
  for (const fontSha256 of unusedFontSha256) {
    diagnostics.push({
      level: "error",
      code: "FONT_LICENSE_EVIDENCE_UNUSED_RECORD",
      message: `Font license evidence SHA-256 ${fontSha256} does not match an embedded font input.`,
      details: { evidencePath, fontSha256 },
    });
  }
  if (required && fontHashes.size === 0) {
    diagnostics.push({
      level: "error",
      code: "FONT_LICENSE_EVIDENCE_EMBEDDED_FONT_REQUIRED",
      message: "Strict font license evidence requires at least one embedded font input.",
      details: { evidencePath },
    });
  }

  return {
    supplied: true,
    required,
    evidencePath,
    schemaVersion: "mdpr-font-license-evidence-v1",
    records,
    missingFontSha256,
    unusedFontSha256,
    complete: structurallyValid
      && authorizationComplete
      && fontHashes.size > 0
      && missingFontSha256.length === 0
      && unusedFontSha256.length === 0,
    legalDetermination: "external",
  };
}

function bindFontLicenseEvidence(
  evidence: FontLicenseEvidenceSummary,
  fontSha256Values: string[],
): FontLicenseEvidenceSummary {
  const fontHashes = new Set(fontSha256Values.map((value) => value.toLowerCase()));
  const recordHashes = new Set(evidence.records.map((record) => record.fontSha256.toLowerCase()));
  const missingFontSha256 = Array.from(fontHashes).filter((hash) => !recordHashes.has(hash));
  const unusedFontSha256 = Array.from(recordHashes).filter((hash) => !fontHashes.has(hash));
  const authorizationComplete = evidence.records.every((record) => (
    record.pptxEmbeddingAllowed === true && record.redistributionAllowed === true
  ));
  return {
    ...evidence,
    missingFontSha256,
    unusedFontSha256,
    complete: evidence.supplied
      && authorizationComplete
      && fontHashes.size > 0
      && missingFontSha256.length === 0
      && unusedFontSha256.length === 0,
  };
}

function emptyLicenseEvidence(required: boolean): FontLicenseEvidenceSummary {
  return {
    supplied: false,
    required,
    records: [],
    missingFontSha256: [],
    unusedFontSha256: [],
    complete: false,
    legalDetermination: "external",
  };
}

function isFontLicenseEvidenceRecord(value: unknown): value is FontLicenseEvidenceRecord {
  if (!isRecord(value)) return false;
  return typeof value.fontSha256 === "string"
    && /^[a-f0-9]{64}$/i.test(value.fontSha256)
    && nonEmptyString(value.licenseId)
    && nonEmptyString(value.licenseSource)
    && typeof value.pptxEmbeddingAllowed === "boolean"
    && typeof value.redistributionAllowed === "boolean"
    && nonEmptyString(value.attestedBy)
    && nonEmptyString(value.attestedAt)
    && !Number.isNaN(Date.parse(value.attestedAt));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function requiredFontFaces(layout: LayoutIR, presentation?: PresentationIR): FontFaceRequirement[] {
  const faces = new Map<string, { family: string; styles: Set<EmbeddedFontStyle> }>();
  const blocks = new Map<string, BlockIR>();
  for (const slide of presentation?.slides ?? []) {
    for (const block of slide.blocks) blocks.set(block.id, block);
  }
  const add = (family: string | undefined, style: EmbeddedFontStyle) => {
    const resolved = family?.trim();
    if (!resolved) return;
    const key = fontKey(resolved);
    const entry = faces.get(key) ?? { family: resolved, styles: new Set<EmbeddedFontStyle>() };
    entry.styles.add(style);
    faces.set(key, entry);
  };
  for (const slide of layout.slides) {
    for (const region of slide.regions) {
      const family = region.typography?.fontFamily ?? layout.theme.fontFamily;
      const baseBold = region.role === "title" || region.typography?.fontWeight === "bold";
      add(family, baseBold ? "bold" : "regular");
      for (const blockId of region.blockIds ?? []) {
        const block = blocks.get(blockId.replace(/#\d+$/, ""));
        if (!block) continue;
        for (const style of blockFontStyles(block, baseBold)) add(family, style);
      }
    }
  }
  return Array.from(faces.values(), (entry) => ({ family: entry.family, styles: styleOrder(entry.styles) }));
}

function blockFontStyles(block: BlockIR, baseBold: boolean): Set<EmbeddedFontStyle> {
  const styles = new Set<EmbeddedFontStyle>();
  const addRun = (run: { bold?: boolean; italic?: boolean }) => {
    const bold = baseBold || Boolean(run.bold);
    styles.add(bold && run.italic ? "boldItalic" : bold ? "bold" : run.italic ? "italic" : "regular");
  };
  for (const run of block.inlineRuns ?? []) addRun(run);
  for (const item of block.listItems ?? []) {
    if (item.label && item.description) styles.add("bold");
    for (const run of item.runs ?? []) addRun(run);
    for (const run of item.descriptionRuns ?? []) addRun(run);
  }
  if (["table", "chart", "diagram"].includes(block.type)) styles.add("bold");
  return styles;
}

function coverageFor(
  requiredFaces: FontFaceRequirement[],
  supplied: Array<{ family: string; style: EmbeddedFontStyle }>,
): FontEmbeddingCoverage {
  const suppliedMap = new Map<string, { family: string; styles: Set<EmbeddedFontStyle> }>();
  for (const face of supplied) {
    const key = fontKey(face.family);
    const entry = suppliedMap.get(key) ?? { family: face.family, styles: new Set<EmbeddedFontStyle>() };
    entry.styles.add(face.style);
    suppliedMap.set(key, entry);
  }
  const suppliedFaces = Array.from(suppliedMap.values(), (entry) => ({ family: entry.family, styles: styleOrder(entry.styles) }));
  const missingFaces = requiredFaces.flatMap((required) => {
    const suppliedStyles = suppliedMap.get(fontKey(required.family))?.styles ?? new Set<EmbeddedFontStyle>();
    const missing = required.styles.filter((style) => !suppliedStyles.has(style));
    return missing.length ? [{ family: required.family, styles: missing }] : [];
  });
  return { requiredFaces, suppliedFaces, missingFaces, complete: missingFaces.length === 0 };
}

function styleOrder(styles: Set<EmbeddedFontStyle>): EmbeddedFontStyle[] {
  return (["regular", "bold", "italic", "boldItalic"] as const).filter((style) => styles.has(style));
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
