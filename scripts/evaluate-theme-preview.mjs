import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
const JSZip = await loadWorkspaceJsZip();
const report = await evaluateThemePreview();
writeFileSync(join(outDir, "theme-preview-evaluation.json"), `${JSON.stringify(report, null, 2)}\n`, "utf-8");

if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(`Theme preview evaluation passed: ${report.styleCount} PPTX styles, ${report.slideCount} PNG slides/style, ${report.surfaceVariants.length} surface variants.`);

async function evaluateThemePreview() {
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
  const renderedSurfaceVariants = new Set();
  const proofKinds = sortedUnique(previewSource.proofKinds ?? []);
  const overflow = [];
  const missingMarkers = [];
  const coherenceViolations = [];
  const connectorIssues = [];
  const typographyIssues = [];
  const glassIssues = [];
  const pptxIssues = [];
  const pngIssues = [];
  const languageIssues = [];

  if (!/data-gallery-kind="pptx-png"/.test(indexHtml)) missingMarkers.push("index:pptx-png-gallery-marker");
  if (/iframe|themes\/[^"']+\.html/.test(indexHtml)) missingMarkers.push("index:legacy-html-deck-preview");
  if (containsDisallowedLanguageScript(indexHtml)) languageIssues.push("index:contains-non-english-script");
  if (containsDisallowedLanguageScript(JSON.stringify(previewSource))) languageIssues.push("preview-manifest:contains-non-english-script");

  for (const style of styleNames) {
    const pptxPath = join(pptxDir, `${style}.pptx`);
    if (!existsSync(pptxPath) || statSync(pptxPath).size < 5000) pptxIssues.push(`${style}:pptx-missing-or-empty`);
    else {
      const pptxInspection = await inspectPptx(pptxPath, style);
      languageIssues.push(...pptxInspection.languageIssues);
      pptxInspection.surfaceVariants.forEach((variant) => renderedSurfaceVariants.add(variant));
      if (pptxInspection.slideCount !== slideCount) pptxIssues.push(`${style}:pptx-slide-count:${pptxInspection.slideCount}:expected:${slideCount}`);
    }
    const slideFiles = listFiles(join(slidesDir, style)).filter((file) => /^slide-\d+\.png$/.test(file)).sort();
    if (slideFiles.length !== slideCount) pngIssues.push(`${style}:png-slide-count:${slideFiles.length}:expected:${slideCount}`);
    const missingSlideFiles = expectedSlideFiles(slideCount).filter((file) => !slideFiles.includes(file));
    if (missingSlideFiles.length) pngIssues.push(`${style}:missing-slide-files:${missingSlideFiles.join(",")}`);
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
    if ((manifestTheme?.slides?.length ?? 0) !== slideCount) pngIssues.push(`${style}:manifest-slide-count:${manifestTheme?.slides?.length ?? 0}:expected:${slideCount}`);
  }

  const requiredCompositions = ["cover", "toc", "vertical-list", "grid", "pipeline", "chart-table"];
  const missingCompositions = requiredCompositions.filter((name) => !compositionClasses.includes(name));
  const requiredSurfaces = ["rounded", "two-corner-left", "flag-drop", "ticket"];
  const missingSurfaces = requiredSurfaces.filter((name) => !surfaceVariants.includes(name));
  const renderedSurfaceVariantList = sortedUnique([...renderedSurfaceVariants]);
  const missingRenderedSurfaces = requiredSurfaces.filter((name) => !renderedSurfaceVariantList.includes(name));

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
    && !languageIssues.length
    && !missingCompositions.length
    && !missingSurfaces.length
    && !missingRenderedSurfaces.length
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
    renderedSurfaceVariants: renderedSurfaceVariantList,
    missingRenderedSurfaces,
    proofKinds,
    missingMarkers,
    coherenceViolations,
    connectorIssues,
    typographyIssues,
    glassIssues,
    pptxIssues,
    pngIssues,
    languageIssues,
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

function containsDisallowedLanguageScript(value) {
  return /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Cyrillic}]/u.test(String(value));
}

function disallowedLanguageScriptMatch(value) {
  return /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Cyrillic}]/u.exec(String(value));
}

async function inspectPptx(pptxPath, style) {
  const languageIssues = [];
  const surfaceVariants = new Set();
  const zip = await JSZip.loadAsync(readFileSync(pptxPath));
  const slidePaths = Object.keys(zip.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path)).sort();
  for (const slidePath of slidePaths) {
    const slideXml = await zip.file(slidePath).async("string");
    for (const text of extractPptxTextRuns(slideXml)) {
      const match = disallowedLanguageScriptMatch(text);
      if (match) languageIssues.push(`${style}:${slidePath}:visible-slide-non-english-script:${match[0]}`);
    }
  }
  const svgPaths = Object.keys(zip.files).filter((path) => /^ppt\/media\/.*\.svg$/.test(path)).sort();
  for (const svgPath of svgPaths) {
    const svg = await zip.file(svgPath).async("string");
    for (const match of svg.matchAll(/data-mdpr-surface="([^"]+)"/g)) {
      surfaceVariants.add(match[1]);
    }
  }

  return {
    languageIssues,
    slideCount: slidePaths.length,
    surfaceVariants: [...surfaceVariants],
  };
}

async function loadWorkspaceJsZip() {
  const jszipPath = resolve(repoRoot, "packages/render-pptx/node_modules/jszip/lib/index.js");
  const module = await import(pathToFileURL(jszipPath).href);
  return module.default ?? module;
}

function extractPptxTextRuns(slideXml) {
  return [...String(slideXml).matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => decodeXmlText(match[1]));
}

function decodeXmlText(value) {
  return String(value)
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function expectedSlideFiles(count) {
  return Array.from({ length: count }, (_, index) => `slide-${String(index + 1).padStart(2, "0")}.png`);
}
