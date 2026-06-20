import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(repoRoot, process.argv[2] ?? "docs/theme-preview");
const themesDir = join(outDir, "themes");
const expectedStyles = [
  "plain",
  "simple",
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
const slideSize = { w: 13.333, h: 7.5 };
const report = evaluateThemePreview();
writeFileSync(join(outDir, "theme-preview-evaluation.json"), `${JSON.stringify(report, null, 2)}\n`, "utf-8");

if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(`Theme preview evaluation passed: ${report.styleCount} styles, ${report.slideCount} slides/style, ${report.surfaceVariants.length} surface variants.`);

function evaluateThemePreview() {
  const files = readdirSync(themesDir).filter((file) => file.endsWith(".html")).sort();
  const styleNames = files.map((file) => file.replace(/\.html$/, "")).sort();
  const missingStyles = expectedStyles.filter((style) => !styleNames.includes(style));
  const extraStyles = styleNames.filter((style) => !expectedStyles.includes(style));
  const legacyPages = legacyColorOnly.filter((style) => styleNames.includes(style));
  const htmlByFile = new Map(files.map((file) => [file, readFileSync(join(themesDir, file), "utf-8")]));
  const firstHtml = htmlByFile.get(files[0] ?? "") ?? "";
  const slideCount = (firstHtml.match(/class="slide /g) ?? []).length;
  const compositionClasses = sortedUnique([...firstHtml.matchAll(/data-composition="([^"]+)"/g)].map((match) => match[1]));
  const surfaceVariants = sortedUnique([...firstHtml.matchAll(/region [^"]* surface ([a-z0-9-]+)/g)].map((match) => match[1]));
  const proofKinds = sortedUnique([...firstHtml.matchAll(/data-proof-kind="([^"]+)"/g)].map((match) => match[1]));
  const overflow = [];
  const missingMarkers = [];

  for (const [file, html] of htmlByFile) {
    if (!/<table class="mdpr-table">/.test(html)) missingMarkers.push(`${file}:mdpr-table`);
    if (!/data-composition="chart-table"/.test(html)) missingMarkers.push(`${file}:chart-table-composition`);
    if (!/data-composition="pipeline"/.test(html)) missingMarkers.push(`${file}:pipeline-composition`);
    if (!/data-proof-kind="arc-ring"/.test(html)) missingMarkers.push(`${file}:arc-ring-proof`);
    if (!/data-proof-kind="gauge"/.test(html)) missingMarkers.push(`${file}:gauge-proof`);
    if (!/data-proof-kind="connected-strip"/.test(html)) missingMarkers.push(`${file}:connected-strip-proof`);
    overflow.push(...regionOverflow(file, html));
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
    overflowCount: overflow.length,
    overflow: overflow.slice(0, 10),
  };
}

function regionOverflow(file, html) {
  const overflow = [];
  for (const match of html.matchAll(/style="([^"]*)"/g)) {
    const style = match[1];
    const x = readInches(style, "left");
    const y = readInches(style, "top");
    const w = readInches(style, "width");
    const h = readInches(style, "height");
    if ([x, y, w, h].some((value) => value === undefined)) continue;
    if (x < -0.001 || y < -0.001 || x + w > slideSize.w + 0.001 || y + h > slideSize.h + 0.001) {
      overflow.push({ file, x, y, w, h, right: Number((x + w).toFixed(3)), bottom: Number((y + h).toFixed(3)) });
    }
  }
  return overflow;
}

function readInches(style, key) {
  const match = new RegExp(`${key}:([0-9.]+)in`).exec(style);
  return match ? Number(match[1]) : undefined;
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}
