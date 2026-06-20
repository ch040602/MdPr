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
  const coherenceViolations = [];
  const connectorIssues = [];
  const typographyIssues = [];
  const glassIssues = [];

  for (const [file, html] of htmlByFile) {
    if (!/<table class="mdpr-table">/.test(html)) missingMarkers.push(`${file}:mdpr-table`);
    if (!/data-composition="chart-table"/.test(html)) missingMarkers.push(`${file}:chart-table-composition`);
    if (!/data-composition="pipeline"/.test(html)) missingMarkers.push(`${file}:pipeline-composition`);
    if (!/data-proof-kind="arc-ring"/.test(html)) missingMarkers.push(`${file}:arc-ring-proof`);
    if (!/data-proof-kind="gauge"/.test(html)) missingMarkers.push(`${file}:gauge-proof`);
    if (!/data-proof-kind="connected-strip"/.test(html)) missingMarkers.push(`${file}:connected-strip-proof`);
    if (/circle-vine/.test(html)) coherenceViolations.push(`${file}:singleton-dot-surface`);
    if (/class="region item surface ticket/.test(html)) coherenceViolations.push(`${file}:item-ticket-punch-surface`);
    connectorIssues.push(...pipelineConnectorIssues(file, html));
    typographyIssues.push(...regionTypographyIssues(file, html));
    if (file === "glass.html") glassIssues.push(...glassStyleIssues(file, html));
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
    && !coherenceViolations.length
    && !connectorIssues.length
    && !typographyIssues.length
    && !glassIssues.length
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
    overflowCount: overflow.length,
    overflow: overflow.slice(0, 10),
  };
}

function pipelineConnectorIssues(file, html) {
  const issues = [];
  for (const slide of html.matchAll(/<section class="slide[^>]*data-composition="pipeline"[\s\S]*?<\/section>/g)) {
    const source = slide[0];
    const nodes = (source.match(/class="pipeline-node"/g) ?? []).length;
    const connectors = (source.match(/class="pipeline-connector"/g) ?? []).length;
    if (nodes > 1 && connectors < nodes - 1) issues.push(`${file}:pipeline-connectors:${connectors}/${nodes - 1}`);
    if (/NaN|Infinity/.test(source)) issues.push(`${file}:pipeline-numeric`);
    for (const points of source.matchAll(/points="([^"]+)"/g)) {
      const values = points[1].split(/[,\s]+/).filter(Boolean).map(Number);
      if (values.length < 4 || values.some((value) => !Number.isFinite(value))) {
        issues.push(`${file}:pipeline-points`);
        continue;
      }
      if (values.some((value) => value < -0.01 || value > 100.01)) issues.push(`${file}:pipeline-point-bounds`);
    }
  }
  return sortedUnique(issues);
}

function regionTypographyIssues(file, html) {
  const issues = [];
  for (const match of html.matchAll(/class="region ([^"]*)" style="([^"]*)"/g)) {
    const classes = match[1];
    const style = match[2];
    const fontSize = readPt(style, "font-size");
    if (fontSize === undefined || classes.includes("title")) continue;
    if (fontSize < 14) issues.push(`${file}:region-font:${fontSize}`);
  }
  return sortedUnique(issues);
}

function glassStyleIssues(file, html) {
  const issues = [];
  if (!/body data-theme-style="glass"/.test(html)) issues.push(`${file}:theme-marker`);
  if (!/body\[data-theme-style="glass"\] \.surface \{[^}]*backdrop-filter: blur\(18px\) saturate\(140%\)/s.test(html)) {
    issues.push(`${file}:glass-backdrop-filter`);
  }
  if (!/-webkit-backdrop-filter: blur\(18px\) saturate\(140%\)/.test(html)) issues.push(`${file}:glass-webkit-filter`);
  if (!/linear-gradient\(135deg, rgba\(255,255,255,.2\)/.test(html)) issues.push(`${file}:glass-frosted-fill`);
  return issues;
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

function readPt(style, key) {
  const match = new RegExp(`${key}:([0-9.]+)pt`).exec(style);
  return match ? Number(match[1]) : undefined;
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}
