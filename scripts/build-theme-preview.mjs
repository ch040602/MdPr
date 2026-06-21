import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDeckPlan } from "../packages/cli/dist/orchestrate.js";
import { DECORATION_STYLE_NAMES, resolveDesignTokens } from "../packages/core/dist/index.js";
import { renderPptx } from "../packages/render-pptx/dist/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = resolve(repoRoot, process.argv[2] ?? "examples/theme-preview-en/deck.md");
const outDir = resolve(repoRoot, process.argv[3] ?? "docs/theme-preview");
const pptxDir = join(outDir, "pptx");
const slidesDir = join(outDir, "slides");
const pngSize = { width: 1600, height: 900 };
const sourceMarkdown = readFileSync(inputPath, "utf-8");
const generatedAt = "source-controlled";
const previewStyleNames = [
  "clean",
  "minimalism",
  "newmorphism",
  "glass",
  "data",
].filter((name) => DECORATION_STYLE_NAMES.includes(name));

assertEnglishOnlyText(sourceMarkdown, inputPath);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(pptxDir, { recursive: true });
mkdirSync(slidesDir, { recursive: true });

const deck = createDeckPlan(inputPath, {
  cliConfig: {
    deck: {
      language: "en",
    },
  },
});
const compositionClasses = sortedUnique(deck.layout.slides.map((slide) => slide.layout.preset));
const proofKinds = sortedUnique(deck.presentation.slides.flatMap((slide) =>
  slide.blocks
    .filter((block) => block.type === "chart" && block.chart?.kind)
    .map((block) => block.chart.kind),
));
const surfaceVariants = ["flag-drop", "notched-corner", "rounded", "ticket", "two-corner-left", "two-corner-right"];
const themeEntries = [];

for (const name of previewStyleNames) {
  const tokens = resolveDesignTokens(name, deck.config.theme);
  const pptxPath = join(pptxDir, `${name}.pptx`);
  await renderPptx(
    { presentation: deck.presentation, layout: deck.layout },
    { outPath: pptxPath, designPreset: name },
  );

  const themeSlideDir = join(slidesDir, name);
  exportPptxSlides(pptxPath, themeSlideDir);
  const slides = readdirSync(themeSlideDir)
    .filter((file) => /^slide-\d+\.png$/.test(file))
    .sort()
    .map((file, index) => ({
      index: index + 1,
      file: `slides/${name}/${file}`,
      title: slideTitle(index),
      composition: deck.layout.slides[index]?.layout.preset ?? "unknown",
    }));

  themeEntries.push({
    name,
    pptx: `pptx/${name}.pptx`,
    slides,
    colors: {
      background: `#${tokens.backgroundColor}`,
      text: `#${tokens.textColor}`,
      primary: `#${tokens.primaryColor}`,
      secondary: `#${tokens.secondaryColor}`,
      surface: `#${tokens.surfaceFill}`,
    },
  });
}

const manifest = {
  kind: "pptx-png-theme-preview",
  source: relative(repoRoot, inputPath).replaceAll("\\", "/"),
  generatedAt,
  pngSize,
  styleCount: themeEntries.length,
  styleNames: sortedUnique(themeEntries.map((theme) => theme.name)),
  slideCount: themeEntries[0]?.slides.length ?? 0,
  compositionClasses,
  surfaceVariants,
  proofKinds,
  themes: themeEntries,
};

assertEnglishOnlyText(JSON.stringify(manifest), join(outDir, "preview-manifest.json"));

writeFileSync(join(outDir, "preview-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
writeFileSync(join(outDir, "index.html"), renderPreviewShell({
  title: deck.presentation.meta.title,
  source: manifest.source,
  generatedAt: manifest.generatedAt,
  themes: themeEntries,
}), "utf-8");

console.log(`Wrote ${relative(repoRoot, outDir).replaceAll("\\", "/")}/index.html`);

function exportPptxSlides(pptxPath, themeSlideDir) {
  const python = process.platform === "win32" ? "python" : "python3";
  execFileSync(python, [
    resolve(repoRoot, "scripts/export-pptx-pngs.py"),
    pptxPath,
    themeSlideDir,
    "--width",
    String(pngSize.width),
    "--height",
    String(pngSize.height),
  ], { stdio: "inherit" });
}

function slideTitle(index) {
  const sourceSlideId = deck.layout.slides[index]?.sourceSlideId;
  const sourceSlide = deck.presentation.slides.find((slide) => slide.id === sourceSlideId);
  return sourceSlide?.title ?? `Slide ${index + 1}`;
}

function renderPreviewShell({ title, source, generatedAt, themes }) {
  const themesJson = JSON.stringify(themes);
  const defaultTheme = themes.find((theme) => theme.name === "clean") ?? themes[0];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} PPTX Preview</title>
<style>
:root {
  color-scheme: light;
  --bg: #f6f7f9;
  --panel: #ffffff;
  --line: #d8dde6;
  --text: #101828;
  --muted: #667085;
  --active: #047857;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
button, select, input { font: inherit; }
.app {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
}
.sidebar {
  border-right: 1px solid var(--line);
  background: var(--panel);
  padding: 18px;
  overflow: auto;
  max-height: 100vh;
}
h1 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
}
.meta {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}
.control-group {
  display: grid;
  gap: 8px;
  margin: 16px 0;
}
label {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
}
select, input[type="range"] {
  width: 100%;
}
select {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  padding: 9px 10px;
}
.button-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.button-row button, .theme-card, .slide-list button {
  border: 1px solid var(--line);
  background: #fff;
  color: var(--text);
  border-radius: 8px;
  padding: 9px 10px;
  cursor: pointer;
}
.button-row button:hover, .theme-card:hover, .slide-list button:hover { border-color: var(--active); }
.theme-grid {
  display: grid;
  gap: 9px;
  margin-top: 10px;
}
.theme-card {
  display: grid;
  gap: 8px;
  text-align: left;
}
.theme-card[aria-current="true"], .slide-list button[aria-current="true"] {
  border-color: var(--active);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--active) 20%, transparent);
}
.theme-card-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  text-transform: capitalize;
}
.swatches {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  overflow: hidden;
  border-radius: 999px;
  border: 1px solid rgba(0,0,0,.08);
}
.swatches span { height: 12px; }
.stage {
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
  background: rgba(255,255,255,.9);
  backdrop-filter: blur(12px);
}
.toolbar strong { text-transform: capitalize; }
.toolbar a { color: var(--active); font-weight: 700; text-decoration: none; }
.viewport {
  min-height: 0;
  padding: 18px;
  overflow: auto;
}
.slide-shell {
  margin: 0 auto;
  width: min(100%, 1600px);
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
  background: #111;
  box-shadow: 0 12px 32px rgba(16,24,40,.18);
}
.slide-image {
  display: block;
  width: 100%;
  height: auto;
  background: #111;
}
.slide-list {
  max-height: 168px;
  overflow: auto;
  display: grid;
  gap: 6px;
}
.slide-list button {
  text-align: left;
  padding: 7px 8px;
}
@media (max-width: 980px) {
  .app { grid-template-columns: 1fr; }
  .sidebar {
    max-height: none;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .theme-grid {
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }
}
</style>
</head>
<body data-gallery-kind="pptx-png">
<div class="app">
  <aside class="sidebar">
    <h1>PPTX Theme Validation Gallery</h1>
    <p class="meta">Source: ${escapeHtml(source)}<br />Generated: ${escapeHtml(generatedAt)}<br />Each image is exported from a generated PPTX deck. HTML is only the gallery shell.</p>
    <div class="control-group">
      <label for="themeSelect">Selected PPT Theme Style</label>
      <select id="themeSelect"></select>
    </div>
    <div class="control-group">
      <label>Slide Navigation</label>
      <div class="button-row">
        <button id="prevSlide" type="button">Previous</button>
        <button id="nextSlide" type="button">Next</button>
      </div>
      <div id="slideList" class="slide-list" aria-label="Slides"></div>
    </div>
    <div class="control-group">
      <label>PPTX Styles</label>
      <div id="themeGrid" class="theme-grid"></div>
    </div>
  </aside>
  <main class="stage">
    <div class="toolbar">
      <div><strong id="activeTheme">${escapeHtml(defaultTheme.name)}</strong> <span id="slideCounter" class="meta"></span></div>
      <a id="openTheme" href="${escapeHtml(defaultTheme.pptx)}" target="_blank" rel="noreferrer">Download PPTX</a>
    </div>
    <div class="viewport">
      <figure class="slide-shell">
        <img id="slideImage" class="slide-image" alt="PPTX slide exported to PNG" src="${escapeHtml(defaultTheme.slides[0]?.file ?? "")}" />
      </figure>
    </div>
  </main>
</div>
<script>
const themes = ${themesJson};
const select = document.querySelector("#themeSelect");
const grid = document.querySelector("#themeGrid");
const slideImage = document.querySelector("#slideImage");
const activeTheme = document.querySelector("#activeTheme");
const openTheme = document.querySelector("#openTheme");
const slideList = document.querySelector("#slideList");
const slideCounter = document.querySelector("#slideCounter");
let currentTheme = ${JSON.stringify(defaultTheme.name)};
let currentSlide = 0;

for (const theme of themes) {
  const option = document.createElement("option");
  option.value = theme.name;
  option.textContent = theme.name;
  select.append(option);

  const card = document.createElement("button");
  card.type = "button";
  card.className = "theme-card";
  card.dataset.theme = theme.name;
  card.innerHTML = \`
    <span class="theme-card-title"><span>\${theme.name}</span><span>\${theme.slides.length} slides</span></span>
    <span class="swatches">\${Object.values(theme.colors).map((color) => \`<span style="background:\${color}"></span>\`).join("")}</span>
  \`;
  card.addEventListener("click", () => setTheme(theme.name));
  grid.append(card);
}

select.addEventListener("change", () => setTheme(select.value));
document.querySelector("#prevSlide").addEventListener("click", () => goToSlide(currentSlide - 1));
document.querySelector("#nextSlide").addEventListener("click", () => goToSlide(currentSlide + 1));

setTheme(currentTheme);

function setTheme(name) {
  const theme = themes.find((candidate) => candidate.name === name) ?? themes[0];
  currentTheme = theme.name;
  currentSlide = 0;
  select.value = theme.name;
  activeTheme.textContent = theme.name;
  openTheme.href = theme.pptx;
  for (const card of grid.querySelectorAll(".theme-card")) {
    card.setAttribute("aria-current", String(card.dataset.theme === theme.name));
  }
  renderSlideList(theme);
  updateSlide(theme);
}

function renderSlideList(theme) {
  slideList.replaceChildren();
  theme.slides.forEach((slide, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = \`\${slide.index}. \${slide.title}\`;
    button.addEventListener("click", () => {
      currentSlide = index;
      updateSlide(theme);
    });
    slideList.append(button);
  });
}

function goToSlide(index) {
  const theme = themes.find((candidate) => candidate.name === currentTheme) ?? themes[0];
  currentSlide = Math.max(0, Math.min(index, theme.slides.length - 1));
  updateSlide(theme);
}

function updateSlide(theme) {
  const slide = theme.slides[currentSlide] ?? theme.slides[0];
  if (!slide) return;
  slideImage.src = slide.file;
  slideImage.alt = \`\${theme.name} generated PPTX slide \${slide.index}: \${slide.title}\`;
  slideCounter.textContent = \`Slide \${slide.index} / \${theme.slides.length} · \${slide.composition}\`;
  [...slideList.children].forEach((button, buttonIndex) => {
    button.setAttribute("aria-current", String(buttonIndex === currentSlide));
  });
}
</script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function assertEnglishOnlyText(text, label) {
  const match = disallowedLanguageScriptMatch(text);
  if (!match) return;
  throw new Error(`Actions theme preview source must be English-only: ${relative(repoRoot, label).replaceAll("\\", "/")} contains non-English visible text "${match[0]}".`);
}

function disallowedLanguageScriptMatch(value) {
  return /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Cyrillic}]/u.exec(String(value));
}
