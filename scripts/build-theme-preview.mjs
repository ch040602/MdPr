import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDeckPlan } from "../packages/cli/dist/orchestrate.js";
import { DESIGN_PRESET_NAMES, resolveDesignTokens } from "../packages/core/dist/index.js";
import { renderHtml } from "../packages/render-html/dist/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = resolve(repoRoot, process.argv[2] ?? "README.md");
const outDir = resolve(repoRoot, process.argv[3] ?? "docs/theme-preview");
const themesDir = join(outDir, "themes");

mkdirSync(themesDir, { recursive: true });

const deck = createDeckPlan(inputPath);
const themeEntries = DESIGN_PRESET_NAMES.map((name) => {
  const tokens = resolveDesignTokens(name, deck.config.theme);
  const fileName = `${name}.html`;
  const html = withPreviewMetadata(renderHtml(
    { presentation: deck.presentation, layout: deck.layout },
    { title: `${deck.presentation.meta.title} - ${name}`, designPreset: name },
  ), name);
  writeFileSync(join(themesDir, fileName), html, "utf-8");

  return {
    name,
    file: `themes/${fileName}`,
    colors: {
      background: `#${tokens.backgroundColor}`,
      text: `#${tokens.textColor}`,
      primary: `#${tokens.primaryColor}`,
      secondary: `#${tokens.secondaryColor}`,
      surface: `#${tokens.surfaceFill}`,
    },
  };
});

writeFileSync(join(outDir, "index.html"), renderPreviewShell({
  title: deck.presentation.meta.title,
  source: relative(repoRoot, inputPath).replaceAll("\\", "/"),
  generatedAt: new Date().toISOString(),
  themes: themeEntries,
}), "utf-8");

console.log(`Wrote ${relative(repoRoot, outDir).replaceAll("\\", "/")}/index.html`);

function withPreviewMetadata(html, themeName) {
  return html.replace(
    "<main class=\"deck\">",
    `<main class="deck" data-preview-theme="${escapeHtml(themeName)}">`,
  );
}

function renderPreviewShell({ title, source, generatedAt, themes }) {
  const themesJson = JSON.stringify(themes);
  const defaultTheme = themes.find((theme) => theme.name === "technical") ?? themes[0];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} theme preview</title>
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
.brand {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 16px;
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
.button-row button, .theme-card {
  border: 1px solid var(--line);
  background: #fff;
  color: var(--text);
  border-radius: 8px;
  padding: 9px 10px;
  cursor: pointer;
}
.button-row button:hover, .theme-card:hover { border-color: var(--active); }
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
.theme-card[aria-current="true"] {
  border-color: var(--active);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--active) 20%, transparent);
}
.theme-card-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-weight: 800;
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
  background: rgba(255,255,255,.86);
  backdrop-filter: blur(12px);
}
.toolbar strong { text-transform: capitalize; }
.toolbar a { color: var(--active); font-weight: 700; text-decoration: none; }
.viewport {
  min-height: 0;
  padding: 18px;
}
.frame-shell {
  width: 100%;
  height: 100%;
  min-height: 680px;
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
  background: #111;
}
iframe {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 680px;
  border: 0;
  background: #111;
}
.slide-list {
  max-height: 168px;
  overflow: auto;
  display: grid;
  gap: 6px;
}
.slide-list button {
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  color: var(--text);
  padding: 7px 8px;
  text-align: left;
  cursor: pointer;
}
.slide-list button[aria-current="true"] {
  border-color: var(--active);
  color: var(--active);
  font-weight: 800;
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
  .frame-shell, iframe { min-height: 520px; }
}
</style>
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="brand">
      <div>
        <h1>Theme Preview Gallery</h1>
        <p class="meta">Source: ${escapeHtml(source)}<br />Generated: ${escapeHtml(generatedAt)}</p>
      </div>
    </div>
    <div class="control-group">
      <label for="themeSelect">Selected Theme</label>
      <select id="themeSelect"></select>
    </div>
    <div class="control-group">
      <label for="zoomRange">Preview Zoom <span id="zoomValue">100%</span></label>
      <input id="zoomRange" type="range" min="55" max="120" value="100" />
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
      <label>All Themes</label>
      <div id="themeGrid" class="theme-grid"></div>
    </div>
  </aside>
  <main class="stage">
    <div class="toolbar">
      <div><strong id="activeTheme">${escapeHtml(defaultTheme.name)}</strong> <span id="slideCounter" class="meta"></span></div>
      <a id="openTheme" href="${escapeHtml(defaultTheme.file)}" target="_blank" rel="noreferrer">Open selected deck</a>
    </div>
    <div class="viewport">
      <div class="frame-shell">
        <iframe id="previewFrame" title="Selected theme deck preview" src="${escapeHtml(defaultTheme.file)}"></iframe>
      </div>
    </div>
  </main>
</div>
<script>
const themes = ${themesJson};
const select = document.querySelector("#themeSelect");
const grid = document.querySelector("#themeGrid");
const frame = document.querySelector("#previewFrame");
const activeTheme = document.querySelector("#activeTheme");
const openTheme = document.querySelector("#openTheme");
const zoomRange = document.querySelector("#zoomRange");
const zoomValue = document.querySelector("#zoomValue");
const slideList = document.querySelector("#slideList");
const slideCounter = document.querySelector("#slideCounter");
let currentTheme = ${JSON.stringify(defaultTheme.name)};
let currentSlide = 0;
let slides = [];

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
    <span class="theme-card-title"><span>\${theme.name}</span><span aria-hidden="true">↗</span></span>
    <span class="swatches">\${Object.values(theme.colors).map((color) => \`<span style="background:\${color}"></span>\`).join("")}</span>
  \`;
  card.addEventListener("click", () => setTheme(theme.name));
  grid.append(card);
}

select.addEventListener("change", () => setTheme(select.value));
zoomRange.addEventListener("input", applyZoom);
document.querySelector("#prevSlide").addEventListener("click", () => goToSlide(Math.max(0, currentSlide - 1)));
document.querySelector("#nextSlide").addEventListener("click", () => goToSlide(Math.min(slides.length - 1, currentSlide + 1)));
frame.addEventListener("load", () => {
  const doc = frame.contentDocument;
  slides = [...doc.querySelectorAll(".slide")];
  currentSlide = 0;
  applyZoom();
  renderSlideList();
  goToSlide(0);
});

setTheme(currentTheme);

function setTheme(name) {
  const theme = themes.find((candidate) => candidate.name === name) ?? themes[0];
  currentTheme = theme.name;
  select.value = theme.name;
  frame.src = theme.file;
  activeTheme.textContent = theme.name;
  openTheme.href = theme.file;
  for (const card of grid.querySelectorAll(".theme-card")) {
    card.setAttribute("aria-current", String(card.dataset.theme === theme.name));
  }
}

function applyZoom() {
  zoomValue.textContent = \`\${zoomRange.value}%\`;
  const doc = frame.contentDocument;
  if (!doc) return;
  const deck = doc.querySelector(".deck");
  if (!deck) return;
  const scale = Number(zoomRange.value) / 100;
  deck.style.transform = \`scale(\${scale})\`;
  deck.style.transformOrigin = "top left";
  deck.style.width = \`\${100 / scale}%\`;
}

function renderSlideList() {
  slideList.replaceChildren();
  slides.forEach((slide, index) => {
    const title = slide.querySelector(".title")?.textContent?.trim() || \`Slide \${index + 1}\`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = \`\${index + 1}. \${title}\`;
    button.addEventListener("click", () => goToSlide(index));
    slideList.append(button);
  });
}

function goToSlide(index) {
  if (!slides.length) return;
  currentSlide = Math.max(0, Math.min(index, slides.length - 1));
  slides[currentSlide].scrollIntoView({ block: "start", behavior: "smooth" });
  slideCounter.textContent = \`Slide \${currentSlide + 1} / \${slides.length}\`;
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
