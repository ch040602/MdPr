import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(repoRoot, process.argv[2] ?? "docs/theme-preview");
const pptxDir = join(outDir, "pptx");
const slidesDir = join(outDir, "slides");
const expectedStyles = [
  "clean",
  "executive",
  "editorial",
  "technical",
  "minimalism",
  "newmorphism",
  "glass",
  "grid",
  "data",
  "magazine",
].sort();
const legacyColorOnly = ["dark", "nord", "solarized", "dracula", "tableau", "gruvbox", "monokai", "material", "tokyo-night"];
const expectedPngSize = { w: 1600, h: 900 };
const report = evaluateThemePreview();
writeFileSync(join(outDir, "theme-preview-evaluation.json"), `${JSON.stringify(report, null, 2)}\n`, "utf-8");

if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(`Theme preview evaluation passed: ${report.styleCount} PPTX styles, ${report.slideCount} PNG slides/style, ${report.surfaceVariants.length} surface variants.`);

function evaluateThemePreview() {
  const pptxFiles = listFiles(pptxDir).filter((file) => file.endsWith(".pptx")).sort();
  const styleNames = pptxFiles.map((file) => file.replace(/\.pptx$/, "")).sort();
  const missingStyles = expectedStyles.filter((style) => !styleNames.includes(style));
  const extraStyles = styleNames.filter((style) => !expectedStyles.includes(style));
  const legacyPages = legacyColorOnly.filter((style) => styleNames.includes(style));
  const indexHtml = existsSync(join(outDir, "index.html")) ? readFileSync(join(outDir, "index.html"), "utf-8") : "";
  const previewSource = existsSync(join(outDir, "preview-manifest.json"))
    ? JSON.parse(readFileSync(join(outDir, "preview-manifest.json"), "utf-8"))
    : { themes: [] };
  const firstTheme = previewSource.themes?.[0];
  const slideCount = firstTheme?.slides?.length ?? 0;
  const compositionClasses = sortedUnique(previewSource.compositionClasses ?? []);
  const surfaceVariants = sortedUnique(previewSource.surfaceVariants ?? []);
  const proofKinds = sortedUnique(previewSource.proofKinds ?? []);
  const overflow = [];
  const missingMarkers = [];
  const coherenceViolations = [];
  const connectorIssues = [];
  const typographyIssues = [];
  const glassIssues = [];
  const pptxIssues = [];
  const pngIssues = [];

  if (!/data-gallery-kind="pptx-png"/.test(indexHtml)) missingMarkers.push("index:pptx-png-gallery-marker");
  if (/iframe|themes\/[^"']+\.html/.test(indexHtml)) missingMarkers.push("index:legacy-html-deck-preview");

  for (const style of styleNames) {
    const pptxPath = join(pptxDir, `${style}.pptx`);
    if (!existsSync(pptxPath) || statSync(pptxPath).size < 5000) pptxIssues.push(`${style}:pptx-missing-or-empty`);
    const slideFiles = listFiles(join(slidesDir, style)).filter((file) => /^slide-\d+\.png$/.test(file)).sort();
    if (slideFiles.length < 10) pngIssues.push(`${style}:too-few-png-slides:${slideFiles.length}`);
    for (const file of slideFiles) {
      const pngPath = join(slidesDir, style, file);
      if (statSync(pngPath).size < 5000) pngIssues.push(`${style}/${file}:png-too-small`);
      const size = readPngSize(pngPath);
      if (!size) pngIssues.push(`${style}/${file}:invalid-png`);
      else if (size.w !== expectedPngSize.w || size.h !== expectedPngSize.h) {
        pngIssues.push(`${style}/${file}:png-size:${size.w}x${size.h}`);
      }
    }
    const manifestTheme = previewSource.themes?.find((theme) => theme.name === style);
    if (!manifestTheme?.pptx?.endsWith(`${style}.pptx`)) pptxIssues.push(`${style}:manifest-pptx`);
    if ((manifestTheme?.slides?.length ?? 0) !== slideFiles.length) pngIssues.push(`${style}:manifest-slide-count`);
  }

  const requiredCompositions = ["cover", "toc", "vertical-list", "grid", "pipeline", "chart-table"];
  const missingCompositions = requiredCompositions.filter((name) => !compositionClasses.includes(name));
  const requiredSurfaces = ["rounded", "two-corner-left", "flag-drop", "ticket"];
  const missingSurfaces = requiredSurfaces.filter((name) => !surfaceVariants.includes(name));

  const ok = !missingStyles.length
    && !extraStyles.length
    && !legacyPages.length
    && !overflow.length
    && !missingMarkers.length
    && !coherenceViolations.length
    && !connectorIssues.length
    && !typographyIssues.length
    && !glassIssues.length
    && !pptxIssues.length
    && !pngIssues.length
    && !missingCompositions.length
    && !missingSurfaces.length
    && slideCount >= 10
    && proofKinds.length >= 3;

  return {
    ok,
    outDir: relative(repoRoot, outDir).replaceAll("\\", "/"),
    styleCount: styleNames.length,
    styleNames,
    missingStyles,
    extraStyles,
    legacyPages,
    slideCount,
    compositionClasses,
    missingCompositions,
    surfaceVariants,
    missingSurfaces,
    proofKinds,
    missingMarkers,
    coherenceViolations,
    connectorIssues,
    typographyIssues,
    glassIssues,
    pptxIssues,
    pngIssues,
    overflowCount: overflow.length,
    overflow: overflow.slice(0, 10),
  };
}

function listFiles(path) {
  return existsSync(path) ? readdirSync(path) : [];
}

function readPngSize(path) {
  if (!existsSync(path)) return undefined;
  const buffer = readFileSync(path);
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return undefined;
  return { w: buffer.readUInt32BE(16), h: buffer.readUInt32BE(20) };
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}
