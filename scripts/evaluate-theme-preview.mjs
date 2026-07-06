import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(repoRoot, process.argv[2] ?? "docs/theme-preview");
const pptxDir = join(outDir, "pptx");
const slidesDir = join(outDir, "slides");
const expectedStyles = [
  "bentogrid",
  "brutalism",
  "claymorphism",
  "glassmorphism",
  "liquid-glass",
  "minimalism",
  "neomorphism",
  "newmorphism",
  "skeuomorphism",
].sort();
const legacyColorOnly = ["clean", "data", "dark", "executive", "glass", "nord", "solarized", "dracula", "tableau", "technical", "gruvbox", "monokai", "material", "tokyo-night"];
const expectedPngSize = { w: 1600, h: 900 };
const EMU_PER_INCH = 914400;
const MIN_IMAGE_SAFE_INSET_EMU = Math.round(0.08 * EMU_PER_INCH);
const MIN_NORMAL_TEXT_CONTRAST = 4.5;
const MIN_ACCENT_CONTRAST = 3.0;
const MIN_VISUAL_DISTINCTIVENESS = 0.28;
const STYLE_GRAMMAR_SIGNATURES = {
  skeuomorphism: ["bevel", "chrome-frame", "highlight-lowlight", "soft-shadow"],
  neomorphism: ["soft-ui", "paired-light-dark-shadow", "bottom-rail", "low-contrast-relief"],
  glassmorphism: ["frosted-glass", "dark-field", "translucent-card", "straight-edge-highlight"],
  claymorphism: ["puffy-blob", "rounded-clay-surface", "soft-accent-orbs", "warm-shadow"],
  minimalism: ["low-decoration", "line-rule", "transparent-surface", "flat-hierarchy"],
  newmorphism: ["soft-ui", "paired-light-dark-shadow", "floating-relief-orbs", "legacy-soft-raised"],
  brutalism: ["hard-border", "offset-shadow", "saturated-canvas", "sharp-geometric-accent"],
  "liquid-glass": ["frosted-glass", "dark-field", "refractive-ribbon", "lens-highlight"],
  bentogrid: ["grid-field", "tile-rule", "bento-card", "modular-surface"],
};
const REQUIRED_STYLE_MARKERS = {
  skeuomorphism: ["data-mdpr-skeuomorphism-layer"],
  neomorphism: ["data-mdpr-neomorphism-layer", "data-mdpr-newmorphism-layer"],
  glassmorphism: ["data-mdpr-glassmorphism-layer", "data-mdpr-glass-layer"],
  claymorphism: ["data-mdpr-claymorphism-layer"],
  minimalism: ["data-mdpr-minimalism-layer"],
  newmorphism: ["data-mdpr-newmorphism-layer"],
  brutalism: ["data-mdpr-brutalism-layer"],
  "liquid-glass": ["data-mdpr-liquid-glass-layer", "data-mdpr-glass-layer"],
  bentogrid: ["data-mdpr-bentogrid-layer"],
};
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
  const previewSlideTitles = sortedUnique(firstTheme?.slides?.map((slide) => slide.title) ?? []);
  const renderedSurfaceVariants = new Set();
  const proofKinds = sortedUnique(previewSource.proofKinds ?? []);
  const overflow = [];
  const missingMarkers = [];
  const coherenceViolations = [];
  const connectorIssues = [];
  const typographyIssues = [];
  const glassIssues = [];
  const themeRuleIssues = [];
  const imageSafeFrameIssues = [];
  const pptxIssues = [];
  const pngIssues = [];
  const languageIssues = [];
  const contrastIssues = [];
  const themeFingerprints = [];
  const inspections = new Map();

  if (!/data-gallery-kind="pptx-png"/.test(indexHtml)) missingMarkers.push("index:pptx-png-gallery-marker");
  if (!/PPTX Theme Validation Gallery/.test(indexHtml)) missingMarkers.push("index:missing-validation-gallery-title");
  if (/PPTX Theme QA Gallery/.test(indexHtml)) missingMarkers.push("index:legacy-qa-gallery-title");
  if (/iframe|themes\/[^"']+\.html/.test(indexHtml)) missingMarkers.push("index:legacy-html-deck-preview");
  if (containsDisallowedLanguageScript(indexHtml)) languageIssues.push("index:contains-non-english-script");
  if (containsDisallowedLanguageScript(JSON.stringify(previewSource))) languageIssues.push("preview-manifest:contains-non-english-script");

  for (const style of styleNames) {
    const pptxPath = join(pptxDir, `${style}.pptx`);
    if (!existsSync(pptxPath) || statSync(pptxPath).size < 5000) pptxIssues.push(`${style}:pptx-missing-or-empty`);
    else {
      const manifestTheme = previewSource.themes?.find((theme) => theme.name === style);
      const imageSafeFrameSlideIndexes = (manifestTheme?.slides ?? [])
        .filter((slide) => slide.title === "Image Safe Frame")
        .map((slide) => slide.index);
      const pptxInspection = await inspectPptx(pptxPath, style, imageSafeFrameSlideIndexes);
      inspections.set(style, pptxInspection);
      languageIssues.push(...pptxInspection.languageIssues);
      imageSafeFrameIssues.push(...pptxInspection.imageSafeFrameIssues);
      themeRuleIssues.push(...inspectThemeRuleMarkers(style, pptxInspection.styleMarkers));
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
    if (manifestTheme?.colors) contrastIssues.push(...evaluateThemeContrast(style, manifestTheme.colors));
    if (!manifestTheme?.pptx?.endsWith(`${style}.pptx`)) pptxIssues.push(`${style}:manifest-pptx`);
    if ((manifestTheme?.slides?.length ?? 0) !== slideCount) pngIssues.push(`${style}:manifest-slide-count:${manifestTheme?.slides?.length ?? 0}:expected:${slideCount}`);
    themeFingerprints.push(themeFingerprint(style, manifestTheme?.colors, inspections.get(style)));
  }

  const requiredCompositions = ["cover", "toc", "vertical-list", "grid", "pipeline", "chart-table"];
  const missingCompositions = requiredCompositions.filter((name) => !compositionClasses.includes(name));
  const requiredSlideTitles = ["Decoration Pattern Catalog", "Image Safe Frame", "Mixed Object Packing"];
  const missingSlideTitles = requiredSlideTitles.filter((title) => !previewSlideTitles.includes(title));
  const requiredSurfaces = ["circle-vine", "flag-drop", "notched-corner", "rounded", "ticket", "two-corner-left"];
  const missingSurfaces = requiredSurfaces.filter((name) => !surfaceVariants.includes(name));
  const renderedSurfaceVariantList = sortedUnique([...renderedSurfaceVariants]);
  const missingRenderedSurfaces = requiredSurfaces.filter((name) => !renderedSurfaceVariantList.includes(name));
  const visualDistinctiveness = evaluateVisualDistinctiveness(themeFingerprints);

  const ok = !missingStyles.length
    && !extraStyles.length
    && !legacyPages.length
    && !overflow.length
    && !missingMarkers.length
    && !coherenceViolations.length
    && !connectorIssues.length
    && !typographyIssues.length
    && !glassIssues.length
    && !themeRuleIssues.length
    && !imageSafeFrameIssues.length
    && !pptxIssues.length
    && !pngIssues.length
    && !languageIssues.length
    && !contrastIssues.length
    && !visualDistinctiveness.issues.length
    && !missingCompositions.length
    && !missingSlideTitles.length
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
    missingSlideTitles,
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
    themeRuleIssues,
    imageSafeFrameIssues,
    decorationSafeZoneIssues: imageSafeFrameIssues,
    contrastIssues,
    visualDistinctiveness,
    themeFingerprints,
    pptxIssues,
    pngIssues,
    languageIssues,
    overflowCount: overflow.length,
    overflow: overflow.slice(0, 10),
  };
}

function inspectThemeRuleMarkers(style, styleMarkers = []) {
  const markers = new Set(styleMarkers);
  return (REQUIRED_STYLE_MARKERS[style] ?? [])
    .filter((marker) => !markers.has(marker))
    .map((marker) => `${style}:missing-theme-rule-marker:${marker}`);
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

async function inspectPptx(pptxPath, style, imageSafeFrameSlideIndexes = []) {
  const languageIssues = [];
  const imageSafeFrameIssues = [];
  const surfaceVariants = new Set();
  const zip = await JSZip.loadAsync(readFileSync(pptxPath));
  const slidePaths = Object.keys(zip.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path)).sort();
  for (const slidePath of slidePaths) {
    const slideXml = await zip.file(slidePath).async("string");
    for (const text of extractPptxTextRuns(slideXml)) {
      const match = disallowedLanguageScriptMatch(text);
      if (match) languageIssues.push(`${style}:${slidePath}:visible-slide-non-english-script:${match[0]}`);
    }
    const slideIndex = Number(/slide(\d+)\.xml$/.exec(slidePath)?.[1] ?? 0);
    if (imageSafeFrameSlideIndexes.includes(slideIndex)) {
      imageSafeFrameIssues.push(...inspectImageSafeFrameSlide(slideXml, style, slidePath));
    }
  }
  const svgPaths = Object.keys(zip.files).filter((path) => /^ppt\/media\/.*\.svg$/.test(path)).sort();
  for (const svgPath of svgPaths) {
    const svg = await zip.file(svgPath).async("string");
    for (const match of svg.matchAll(/data-mdpr-surface="([^"]+)"/g)) {
      surfaceVariants.add(match[1]);
    }
  }
  const styleMarkers = await extractStyleMarkers(svgPaths.map((path) => zip.file(path)).filter(Boolean));

  return {
    languageIssues,
    imageSafeFrameIssues,
    slideCount: slidePaths.length,
    surfaceVariants: [...surfaceVariants],
    styleMarkers,
  };
}

async function extractStyleMarkers(fileRefs) {
  const markers = new Set();
  for (const fileRef of fileRefs) {
    const svg = await fileRef.async("string");
    for (const match of svg.matchAll(/data-mdpr-[a-z0-9-]+="([^"]+)"/g)) markers.add(match[0].split("=")[0]);
  }
  return [...markers].sort();
}

function evaluateThemeContrast(style, colors) {
  const issues = [];
  const checks = [
    { role: "body-on-background", fg: colors.text, bg: colors.background, min: MIN_NORMAL_TEXT_CONTRAST },
    { role: "body-on-surface", fg: colors.text, bg: colors.surface, min: MIN_NORMAL_TEXT_CONTRAST },
    { role: "primary-large-on-background", fg: colors.primary, bg: colors.background, min: MIN_ACCENT_CONTRAST },
    { role: "primary-large-on-surface", fg: colors.primary, bg: colors.surface, min: MIN_ACCENT_CONTRAST },
  ];
  for (const check of checks) {
    const ratio = contrastRatio(check.fg, check.bg);
    if (ratio < check.min) {
      issues.push({
        style,
        role: check.role,
        foreground: normalizeHexColor(check.fg),
        background: normalizeHexColor(check.bg),
        ratio: Number(ratio.toFixed(2)),
        min: check.min,
      });
    }
  }
  return issues;
}

function themeFingerprint(style, colors = {}, inspection = {}) {
  const grammarSignature = sortedUnique(STYLE_GRAMMAR_SIGNATURES[style] ?? []);
  return {
    style,
    colors: {
      background: normalizeHexColor(colors.background),
      text: normalizeHexColor(colors.text),
      primary: normalizeHexColor(colors.primary),
      secondary: normalizeHexColor(colors.secondary),
      surface: normalizeHexColor(colors.surface),
    },
    paletteVector: ["background", "text", "primary", "secondary", "surface"].flatMap((key) => rgbVector(colors[key] ?? "000000")),
    grammarSignature,
    surfaceVariants: sortedUnique(inspection.surfaceVariants ?? []),
    styleMarkers: sortedUnique(inspection.styleMarkers ?? []),
  };
}

function evaluateVisualDistinctiveness(fingerprints) {
  const pairs = [];
  const issues = [];
  for (let leftIndex = 0; leftIndex < fingerprints.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < fingerprints.length; rightIndex++) {
      const left = fingerprints[leftIndex];
      const right = fingerprints[rightIndex];
      const paletteDistance = vectorDistance(left.paletteVector, right.paletteVector);
      const layoutGrammarDistance = jaccardDistance(left.surfaceVariants, right.surfaceVariants);
      const decorationGrammarDistance = jaccardDistance(left.grammarSignature, right.grammarSignature);
      const surfaceTreatmentDistance = jaccardDistance([...left.styleMarkers, ...left.grammarSignature], [...right.styleMarkers, ...right.grammarSignature]);
      const score = Number(((paletteDistance * 0.36) + (layoutGrammarDistance * 0.16) + (decorationGrammarDistance * 0.32) + (surfaceTreatmentDistance * 0.16)).toFixed(3));
      const pair = {
        styles: [left.style, right.style],
        paletteDistance: Number(paletteDistance.toFixed(3)),
        layoutGrammarDistance: Number(layoutGrammarDistance.toFixed(3)),
        decorationGrammarDistance: Number(decorationGrammarDistance.toFixed(3)),
        surfaceTreatmentDistance: Number(surfaceTreatmentDistance.toFixed(3)),
        score,
      };
      pairs.push(pair);
      if (score < MIN_VISUAL_DISTINCTIVENESS) issues.push(pair);
    }
  }
  return {
    minScore: pairs.length ? Math.min(...pairs.map((pair) => pair.score)) : 1,
    threshold: MIN_VISUAL_DISTINCTIVENESS,
    issues,
    closestPairs: pairs.sort((a, b) => a.score - b.score).slice(0, 8),
  };
}

function normalizeHexColor(value) {
  return String(value ?? "").replace(/^#/, "").toUpperCase();
}

function rgbVector(value) {
  const hex = normalizeHexColor(value).padEnd(6, "0").slice(0, 6);
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

function vectorDistance(left, right) {
  const length = Math.max(left.length, right.length, 1);
  const sum = Array.from({ length }, (_, index) => {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    return delta * delta;
  }).reduce((total, value) => total + value, 0);
  return Math.sqrt(sum / length);
}

function jaccardDistance(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set([...leftSet, ...rightSet]);
  if (!union.size) return 0;
  const intersection = [...leftSet].filter((value) => rightSet.has(value)).length;
  return 1 - (intersection / union.size);
}

function contrastRatio(foreground, background) {
  const leftLum = relativeLuminance(rgbVector(foreground));
  const rightLum = relativeLuminance(rgbVector(background));
  const light = Math.max(leftLum, rightLum);
  const dark = Math.min(leftLum, rightLum);
  return (light + 0.05) / (dark + 0.05);
}

function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function inspectImageSafeFrameSlide(slideXml, style, slidePath) {
  const issues = [];
  const pictures = extractPictures(slideXml);
  const markdownPictures = pictures.filter((picture) => picture.descr && picture.descr !== "preencoded.png");
  const surfacePictures = pictures.filter((picture) => picture.descr === "preencoded.png");

  if (!markdownPictures.length) {
    return [`${style}:${slidePath}:image-safe-frame:no-markdown-picture`];
  }
  if (!surfacePictures.length) {
    return [`${style}:${slidePath}:image-safe-frame:no-surface-picture`];
  }

  for (const picture of markdownPictures) {
    const containingSurface = surfacePictures.find((surface) => containsRect(surface, picture));
    if (!containingSurface) {
      issues.push(`${style}:${slidePath}:image-safe-frame:${picture.descr}:not-inside-surface`);
      continue;
    }
    const insets = rectInsets(containingSurface, picture);
    const minInset = Math.min(insets.left, insets.top, insets.right, insets.bottom);
    if (minInset < MIN_IMAGE_SAFE_INSET_EMU) {
      issues.push(`${style}:${slidePath}:image-safe-frame:${picture.descr}:inset-too-small:${Math.round(minInset / EMU_PER_INCH * 1000) / 1000}in`);
    }
  }

  return issues;
}

function extractPictures(slideXml) {
  return [...String(slideXml).matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/g)]
    .map((match) => {
      const xml = match[0];
      const xfrm = /<a:off x="(-?\d+)" y="(-?\d+)"\/>\s*<a:ext cx="(-?\d+)" cy="(-?\d+)"\/>/.exec(xml);
      if (!xfrm) return undefined;
      return {
        name: decodeXmlText(/name="([^"]+)"/.exec(xml)?.[1] ?? ""),
        descr: decodeXmlText(/descr="([^"]*)"/.exec(xml)?.[1] ?? ""),
        x: Number(xfrm[1]),
        y: Number(xfrm[2]),
        w: Math.max(0, Number(xfrm[3])),
        h: Math.max(0, Number(xfrm[4])),
      };
    })
    .filter(Boolean);
}

function containsRect(outer, inner) {
  return inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.w <= outer.x + outer.w
    && inner.y + inner.h <= outer.y + outer.h;
}

function rectInsets(outer, inner) {
  return {
    left: inner.x - outer.x,
    top: inner.y - outer.y,
    right: outer.x + outer.w - (inner.x + inner.w),
    bottom: outer.y + outer.h - (inner.y + inner.h),
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
