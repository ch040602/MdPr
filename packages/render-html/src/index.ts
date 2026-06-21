import { resolveDesignTokens, type BlockIR, type DecorationStyleName, type DesignPresetName, type InlineRunIR, type ListItemIR, type PresentationIR, type SlideIR } from "@mdpresent/core";
import type { LayoutIR } from "@mdpresent/layout";

export type RenderHtmlOptions = {
  title?: string;
  designPreset?: DesignPresetName;
  decorationStyle?: DecorationStyleName;
};

export type RenderableDeckIR = {
  presentation: PresentationIR;
  layout: LayoutIR;
};

export type RenderHtmlInput = LayoutIR | RenderableDeckIR;

export function renderHtml(input: RenderHtmlInput, options: RenderHtmlOptions = {}): string {
  const layout = isRenderableDeck(input) ? input.layout : input;
  const presentation = isRenderableDeck(input) ? input.presentation : undefined;
  const design = resolveDesignTokens(options.decorationStyle ?? options.designPreset ?? layout.theme.decorationStyle ?? layout.theme.designPreset, layout.theme);
  const themeStyle = classNameForRegionId(design.decorationStyle);
  const css = `
:root {
  --bg: #${design.backgroundColor};
  --text: #${design.textColor};
  --primary: #${design.primaryColor};
  --secondary: #${design.secondaryColor};
  --surface: #${design.surfaceFill};
  --surface-line: #${design.surfaceLine};
  --muted: #${design.mutedTextColor};
  --font: ${JSON.stringify(layout.theme.fontFamily)};
}
body { margin: 0; background: #111; font-family: var(--font); }
.deck { display: flex; flex-direction: column; gap: 24px; padding: 24px; }
.slide { position: relative; width: ${layout.slideSize.width}in; height: ${layout.slideSize.height}in; background: var(--bg); color: var(--text); overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,.3); isolation: isolate; }
.slide::before, .slide::after { content: ""; position: absolute; pointer-events: none; z-index: 0; }
.composition-cover .title { display: flex; align-items: center; font-size: 54pt !important; line-height: 1.05 !important; max-width: 10.6in; }
.composition-cover::after { left: 1in; bottom: 1.02in; width: 3.2in; height: .06in; background: var(--primary); opacity: .9; }
.composition-toc .body { columns: 2; column-gap: .7in; font-size: 20pt !important; }
.composition-chart-table .chart { justify-content: center; }
.composition-chart-table .chart.surface { box-shadow: 0 .08in .24in color-mix(in srgb, var(--primary) 18%, transparent); }
.composition-chart-table .table.surface { background: color-mix(in srgb, var(--surface) 98%, var(--primary) 2%); }
.composition-pipeline .diagram { background: linear-gradient(135deg, color-mix(in srgb, var(--surface) 86%, transparent), color-mix(in srgb, var(--secondary) 12%, var(--surface))); }
.composition-grid .item:nth-of-type(2) { transform: translateY(-.04in); }
.composition-grid .item:nth-of-type(5) { transform: translateY(.04in); }
.region { position: absolute; box-sizing: border-box; overflow: hidden; z-index: 2; overflow-wrap: anywhere; }
.region > * { position: relative; z-index: 1; }
.title { font-weight: 700; }
.body.key-message { background: var(--surface); border-left: .08in solid var(--primary); padding: .18in .28in; }
.body.key-message blockquote { margin: 0; font-weight: 700; color: var(--text); }
.surface { background: color-mix(in srgb, var(--surface) 94%, transparent); border: .012in solid var(--surface-line); padding: .17in .22in; }
.surface.rounded { border-radius: .12in; }
.surface.two-corner-left { border-radius: .18in .035in .035in .18in; }
.surface.two-corner-right { border-radius: .035in .18in .18in .035in; }
.surface.flag-drop { border-radius: .06in .06in .16in .06in; }
.surface.flag-drop::before { content: ""; position: absolute; left: .16in; top: 0; width: .26in; height: .22in; background: var(--primary); border-radius: 0 0 .06in .06in; opacity: .9; z-index: 0; }
.surface.notched-corner { clip-path: polygon(0 0, calc(100% - .18in) 0, 100% .18in, 100% 100%, 0 100%); border-radius: .08in; }
.surface.ticket { border-radius: .12in; background-image: radial-gradient(circle at left 50%, var(--bg) 0 .11in, transparent .115in), radial-gradient(circle at right 50%, var(--bg) 0 .11in, transparent .115in); }
.item { line-height: 1.22; }
.region ul, .region ol { margin: 0; padding-left: 1.2em; }
.structured-list { list-style: none; padding-left: 0; }
.region li.level-1 { margin-left: 1.1em; }
.region li.level-2 { margin-left: 2.2em; }
.region p { margin: 0 0 .45em; }
.region img { width: 100%; height: 100%; object-fit: contain; display: block; }
.item-number { display: inline-flex; width: .28in; height: .28in; align-items: center; justify-content: center; margin-right: .1in; border-radius: 999px; background: var(--primary); color: var(--bg); font-weight: 700; vertical-align: middle; line-height: 1; }
.item-label { font-weight: 700; display: block; margin-bottom: .12in; color: var(--primary); }
.item-description { display: block; margin-left: .18in; color: var(--muted); }
strong { color: var(--primary); }
.pipeline { position: relative; height: 100%; min-height: 3.6in; }
.pipeline-connectors { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; z-index: 1; }
.pipeline-connector { fill: none; stroke: var(--primary); stroke-width: 1.55; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.pipeline-node { position: absolute; z-index: 3; min-width: 0; border: 1px solid var(--surface-line); background: var(--surface); padding: .16in .2in; text-align: center; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border-radius: .12in; font-size: 15pt; font-weight: 700; line-height: 1.18; overflow: hidden; }
.chart { width: 100%; height: 100%; display: flex; flex-direction: column; gap: .12in; justify-content: center; }
.chart-row { display: grid; grid-template-columns: 1.1in 1fr .48in; gap: .12in; align-items: center; font-size: .15in; }
.chart-label { color: var(--text); font-weight: 700; }
.chart-track { height: .18in; background: color-mix(in srgb, var(--surface-line) 60%, transparent); border-radius: 999px; overflow: hidden; }
.chart-bar { height: 100%; background: var(--primary); border-radius: 999px; }
.chart-value { color: var(--muted); text-align: right; }
.proof-object { height: 100%; min-height: 1.05in; display: grid; align-items: center; justify-items: center; gap: .08in; color: var(--text); }
.proof-object + .proof-object { margin-top: .16in; }
.proof-label { color: var(--muted); font-size: .16in; font-weight: 800; text-transform: uppercase; letter-spacing: .015in; }
.proof-value { color: var(--primary); font-size: .38in; font-weight: 900; line-height: 1; }
.proof-arc-ring { grid-template-columns: minmax(1.15in, 1.35in) minmax(1.6in, 1fr); justify-items: start; }
.proof-ring { position: relative; width: 1.25in; height: 1.25in; border-radius: 999px; background: conic-gradient(var(--primary) calc(var(--value) * 1%), color-mix(in srgb, var(--surface-line) 76%, transparent) 0); display: grid; place-items: center; }
.proof-ring::after { content: ""; width: .74in; height: .74in; border-radius: 999px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--surface-line); }
.proof-ring-text { position: absolute; color: var(--primary); font-weight: 900; font-size: .22in; }
.proof-gauge { align-content: center; justify-items: stretch; padding: .2in .28in; }
.proof-gauge-track { position: relative; height: .34in; border-radius: 999px; background: color-mix(in srgb, var(--surface-line) 70%, transparent); overflow: hidden; box-shadow: inset 0 0 0 1px var(--surface-line); }
.proof-gauge-fill { height: 100%; width: calc(var(--value) * 1%); border-radius: inherit; background: linear-gradient(90deg, var(--secondary), var(--primary)); }
.proof-gauge-meta { display: flex; justify-content: space-between; align-items: baseline; gap: .2in; }
.proof-connected-strip { grid-template-columns: repeat(auto-fit, minmax(1.1in, 1fr)); gap: .12in; align-items: stretch; width: 100%; }
.proof-step { position: relative; min-height: .82in; border: 1px solid var(--surface-line); background: color-mix(in srgb, var(--surface) 88%, transparent); border-radius: .1in; padding: .12in; display: grid; align-content: center; gap: .06in; }
.proof-step:not(:last-child)::after { content: ""; position: absolute; top: 50%; right: -.13in; width: .14in; height: .02in; background: var(--primary); }
.proof-step-name { font-weight: 800; }
.proof-step-value { color: var(--primary); font-weight: 900; font-size: .24in; }
table.mdpr-table { width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed; font-size: max(.145in, 12pt); line-height: 1.18; }
.mdpr-table th, .mdpr-table td { border: 1px solid var(--surface-line); padding: .07in .08in; vertical-align: middle; overflow: hidden; text-overflow: ellipsis; }
.mdpr-table th { background: var(--primary); color: var(--bg); font-weight: 800; text-align: center; }
.mdpr-table td:first-child { font-weight: 700; }
.mdpr-table td.numeric { text-align: right; font-variant-numeric: tabular-nums; }
.mdpr-table tr:nth-child(odd) td { background: color-mix(in srgb, var(--surface) 76%, transparent); }
body[data-theme-style="glass"] .slide { background: radial-gradient(circle at 20% 18%, color-mix(in srgb, var(--primary) 42%, transparent) 0, transparent 34%), radial-gradient(circle at 78% 72%, color-mix(in srgb, var(--secondary) 34%, transparent) 0, transparent 30%), var(--bg); }
body[data-theme-style="glass"] .surface { background: linear-gradient(135deg, rgba(255,255,255,.2), rgba(255,255,255,.055)), color-mix(in srgb, var(--surface) 46%, transparent); border-color: color-mix(in srgb, #ffffff 58%, var(--surface-line)); box-shadow: 0 .1in .28in rgba(15,23,42,.24), inset 0 1px 0 rgba(255,255,255,.36), inset 0 0 .16in rgba(255,255,255,.08); -webkit-backdrop-filter: blur(18px) saturate(140%); backdrop-filter: blur(18px) saturate(140%); }
body[data-theme-style="glass"] .surface.flag-drop::before { background: color-mix(in srgb, var(--primary) 76%, #ffffff 24%); opacity: .78; }
body[data-theme-style="glass"] .surface.ticket { background-image: linear-gradient(135deg, rgba(255,255,255,.18), rgba(255,255,255,.04)), radial-gradient(circle at left 50%, var(--bg) 0 .11in, transparent .115in), radial-gradient(circle at right 50%, var(--bg) 0 .11in, transparent .115in); }
body[data-theme-style="newmorphism"] .surface { border-color: color-mix(in srgb, #ffffff 65%, var(--surface-line)); box-shadow: .06in .07in .16in rgba(100,116,139,.25), -.04in -.04in .12in rgba(255,255,255,.76); }
body[data-theme-style="minimalism"] .surface { background: transparent; border-color: var(--surface-line); box-shadow: none; }
body[data-theme-style="data"] .slide::before { content: "DATA"; left: .66in; top: .34in; color: var(--primary); font-size: 8pt; font-weight: 800; letter-spacing: .08in; }
body[data-theme-style="data"] .slide::after { left: .66in; right: .66in; bottom: .62in; height: .04in; background: var(--surface-line); opacity: .62; }
`;

  const slides = layout.slides.map((slide) => {
    const sourceSlide = presentation?.slides.find((candidate) => candidate.id === slide.sourceSlideId);
    const blockText = sourceSlide ? createBlockTextIndex(sourceSlide) : new Map<string, string>();
    const regions = slide.regions.map((region) => {
      const style = [
        `left:${region.x}in`,
        `top:${region.y}in`,
        `width:${region.w}in`,
        `height:${region.h}in`,
        `z-index:${region.zIndex}`,
        region.typography?.fontSize ? `font-size:${region.typography.fontSize}pt` : "",
        region.typography?.lineHeight ? `line-height:${region.typography.lineHeight}` : "",
      ].filter(Boolean).join(";");
      const content = renderRegionContent(region.role, region.blockIds, blockText, sourceSlide);
      const classes = [
        "region",
        region.role,
        shouldRenderSurface(region.role, region.id, region.blockIds, sourceSlide) ? "surface" : "",
        shouldRenderSurface(region.role, region.id, region.blockIds, sourceSlide) ? surfaceVariantClass(design.decorationStyle, surfaceRole(region.role, region.blockIds, sourceSlide), region.id) : "",
        classNameForRegionId(region.id),
      ].filter(Boolean).join(" ");
      return `<div class="${classes}" style="${style}">${content}</div>`;
    }).join("\n");
    const composition = classNameForRegionId(slide.layout.preset);
    return `<section class="slide composition composition-${composition}" data-slide-id="${slide.sourceSlideId}" data-layout="${slide.layout.preset}" data-composition="${composition}">${regions}</section>`;
  }).join("\n");

  const lang = presentation?.meta.language ?? "ko";

  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(options.title ?? presentation?.meta.title ?? "mdpresent")}</title>
<style>${css}</style>
</head>
<body data-theme-style="${escapeHtml(themeStyle)}">
<main class="deck">
${slides}
</main>
</body>
</html>`;
}

function isRenderableDeck(input: RenderHtmlInput): input is RenderableDeckIR {
  return "presentation" in input && "layout" in input;
}

function createBlockTextIndex(slide: SlideIR): Map<string, string> {
  const index = new Map<string, string>();

  for (const block of slide.blocks) {
    index.set(block.id, renderBlock(block));
    if (block.type === "bulletList") {
      const itemCount = Math.max(block.items?.length ?? 0, block.listItems?.length ?? 0);
      for (let itemIndex = 0; itemIndex < itemCount; itemIndex++) {
        const item = block.items?.[itemIndex] ?? block.listItems?.[itemIndex]?.text;
        if (!item) continue;
        const listItem = block.listItems?.[itemIndex];
        index.set(`${block.id}#${itemIndex}`, renderList([listItem ?? { text: item, ordered: false, level: 0 }]));
      }
    }
  }

  return index;
}

function renderRegionContent(
  role: string,
  blockIds: string[],
  blockText: Map<string, string>,
  slide?: SlideIR,
): string {
  if (role === "title" && slide?.title) return escapeHtml(slide.title);

  const content = blockIds
    .map((blockId) => blockText.get(blockId))
    .filter((value): value is string => Boolean(value))
    .join("\n");

  if (content) return content;
  if (role === "title" && blockIds.every(isPseudoTitleBlockId)) return escapeHtml(role);
  return escapeHtml(blockIds[0] ?? role);
}

function renderBlock(block: BlockIR): string {
  if (block.type === "bulletList") {
    const listItems = block.listItems?.length
      ? block.listItems
      : (block.items ?? []).map((item) => ({ text: item, ordered: false, level: 0 }) satisfies ListItemIR);
    return renderList(listItems);
  }
  if (block.type === "image") {
    return `<img src="${escapeHtml(block.src ?? "")}" alt="${escapeHtml(block.alt ?? "")}" />`;
  }
  if (block.type === "table" && block.rows?.length) return renderTable(block.rows);
  if (block.type === "code") return `<pre><code>${escapeHtml(block.text ?? "")}</code></pre>`;
  if (block.type === "diagram" && block.diagram?.kind === "pipeline") {
    return renderPipelineDiagram(block.diagram);
  }
  if (block.type === "chart" && block.chart?.kind === "bar") return renderBarChart(block.chart);
  if (block.type === "chart" && block.chart) return renderProofChart(block.chart);
  if (block.type === "paragraph" && block.inlineRuns?.length) return `<p>${renderInlineRuns(block.inlineRuns)}</p>`;
  if (block.type === "paragraph" && block.sentences?.length) return `<p>${block.sentences.map(escapeHtml).join("<br />")}</p>`;
  if (block.type === "paragraph" && block.lines?.length) return `<p>${block.lines.map(escapeHtml).join("<br />")}</p>`;
  if (block.type === "quote" && block.inlineRuns?.length) return `<blockquote>${renderInlineRuns(block.inlineRuns)}</blockquote>`;
  if (block.type === "quote" && block.text) return `<blockquote>${escapeHtml(block.text)}</blockquote>`;
  if (block.inlineRuns?.length) return `<p>${renderInlineRuns(block.inlineRuns)}</p>`;
  if (block.text) return `<p>${escapeHtml(block.text)}</p>`;
  return "";
}

function renderProofChart(chart: NonNullable<BlockIR["chart"]>): string {
  if (chart.kind === "arc-ring") return renderArcRing(chart);
  if (chart.kind === "gauge") return renderGauge(chart);
  if (chart.kind === "connected-strip") return renderConnectedStrip(chart);
  if (chart.kind === "ranked-bars") return renderBarChart({ ...chart, kind: "bar" });
  if (chart.kind === "metric-dots") return renderConnectedStrip(chart);
  return "";
}

function renderArcRing(chart: NonNullable<BlockIR["chart"]>): string {
  const value = clampPercent(chart.series[0]?.values[0] ?? 0);
  const label = chart.labels[0] ?? chart.series[0]?.name ?? "Value";
  return [
    `<div class="proof-object proof-arc-ring" data-proof-kind="arc-ring">`,
    `<div class="proof-ring" style="--value:${value.toFixed(1)}"><span class="proof-ring-text">${Math.round(value)}%</span></div>`,
    `<div><div class="proof-label">${escapeHtml(label)}</div><div class="proof-value">${Math.round(value)}%</div></div>`,
    `</div>`,
  ].join("");
}

function renderGauge(chart: NonNullable<BlockIR["chart"]>): string {
  const value = clampPercent(chart.series[0]?.values[0] ?? 0);
  const label = chart.labels[0] ?? chart.series[0]?.name ?? "Score";
  return [
    `<div class="proof-object proof-gauge" data-proof-kind="gauge" style="--value:${value.toFixed(1)}">`,
    `<div class="proof-gauge-meta"><span class="proof-label">${escapeHtml(label)}</span><span class="proof-value">${Math.round(value)}%</span></div>`,
    `<div class="proof-gauge-track"><div class="proof-gauge-fill"></div></div>`,
    `</div>`,
  ].join("");
}

function renderConnectedStrip(chart: NonNullable<BlockIR["chart"]>): string {
  const values = chart.series[0]?.values ?? [];
  const steps = chart.labels.map((label, index) => {
    const value = values[index] ?? 0;
    return [
      `<div class="proof-step">`,
      `<span class="proof-step-name">${escapeHtml(label)}</span>`,
      `<span class="proof-step-value">${escapeHtml(String(value))}</span>`,
      `</div>`,
    ].join("");
  }).join("");
  return `<div class="proof-object proof-connected-strip" data-proof-kind="connected-strip">${steps}</div>`;
}

function renderTable(rows: string[][]): string {
  const [header, ...body] = rows;
  const head = header
    ? `<thead><tr>${header.map((cell) => `<th>${escapeHtml(normalizeTableCellText(cell))}</th>`).join("")}</tr></thead>`
    : "";
  const bodyRows = body.map((row) => [
    "<tr>",
    ...row.map((cell) => {
      const text = normalizeTableCellText(cell);
      const numeric = /^[-+]?[$€₩¥]?\s*\d[\d,]*(?:\.\d+)?%?$/.test(text.trim()) ? " numeric" : "";
      return `<td class="${numeric.trim()}">${escapeHtml(text)}</td>`;
    }),
    "</tr>",
  ].join("")).join("");
  return `<table class="mdpr-table">${head}<tbody>${bodyRows}</tbody></table>`;
}

function renderBarChart(chart: NonNullable<BlockIR["chart"]>): string {
  const values = chart.series.flatMap((series) => series.values);
  const max = Math.max(1, ...values);
  const primary = chart.series[0];
  if (!primary) return "";
  const rows = chart.labels.map((label, index) => {
    const value = primary.values[index] ?? 0;
    const width = Math.max(2, Math.min(100, (value / max) * 100));
    return [
      `<div class="chart-row">`,
      `<span class="chart-label">${escapeHtml(label)}</span>`,
      `<span class="chart-track"><span class="chart-bar" style="width:${width.toFixed(1)}%"></span></span>`,
      `<span class="chart-value">${escapeHtml(String(value))}</span>`,
      `</div>`,
    ].join("");
  }).join("");
  return `<div class="chart" aria-label="${escapeHtml(primary.name)}">${rows}</div>`;
}

function renderList(items: ListItemIR[]): string {
  if (!items.length) return "";
  const tag = items[0].ordered ? "ol" : "ul";
  const renderedItems = items
    .map((item) => `<li class="level-${Math.min(item.level, 2)}">${renderListItem(item)}</li>`)
    .join("");
  return `<${tag} class="structured-list">${renderedItems}</${tag}>`;
}

function renderListItem(item: ListItemIR): string {
  const number = item.ordered ? `<span class="item-number">${escapeHtml(String(item.number ?? 1))}</span>` : "";
  if (item.label && item.description) {
    return [
      `<span class="item-label">${number}${escapeHtml(item.label)}</span>`,
      `<span class="item-description">${renderInlineRuns(item.descriptionRuns?.length ? item.descriptionRuns : [{ text: item.description }])}</span>`,
    ].join("");
  }
  return `${number}${renderInlineRuns(item.runs?.length ? item.runs : [{ text: item.text }])}`;
}

function renderInlineRuns(runs: InlineRunIR[]): string {
  return runs.map((run) => {
    const text = escapeHtml(run.text).replace(/\r?\n/g, "<br />");
    if (run.bold) return `<strong>${text}</strong>`;
    if (run.italic) return `<em>${text}</em>`;
    return text;
  }).join("");
}

type HtmlDiagramArrangementKind = "horizontal" | "vertical" | "u" | "reverse-u" | "cycle";

type HtmlDiagramNodeBox = {
  node: NonNullable<BlockIR["diagram"]>["nodes"][number];
  x: number;
  y: number;
  w: number;
  h: number;
};

function renderPipelineDiagram(diagram: NonNullable<BlockIR["diagram"]>): string {
  const arrangement = arrangeHtmlDiagramNodes(diagram);
  const boxesById = new Map(arrangement.boxes.map((box) => [box.node.id, box]));
  const markerId = `pipeline-arrow-${stableDiagramKey(diagram)}`;
  const connectors = diagram.edges.map((edge, index) => {
    const from = boxesById.get(edge.from);
    const to = boxesById.get(edge.to);
    if (!from || !to) return "";
    const points = htmlConnectorPoints(from, to);
    return `<polyline class="pipeline-connector" data-edge="${index + 1}" points="${points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ")}" marker-end="url(#${markerId})" />`;
  }).join("");
  const nodes = arrangement.boxes.map((box, index) => [
    `<div class="pipeline-node" data-node="${index + 1}" style="left:${box.x.toFixed(2)}%;top:${box.y.toFixed(2)}%;width:${box.w.toFixed(2)}%;height:${box.h.toFixed(2)}%">`,
    escapeHtml(box.node.label),
    "</div>",
  ].join("")).join("");

  return `<div class="pipeline pipeline-${arrangement.kind}" data-arrangement="${arrangement.kind}">
<svg class="pipeline-connectors" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
<defs><marker id="${markerId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary)" /></marker></defs>
${connectors}
</svg>
${nodes}
</div>`;
}

function arrangeHtmlDiagramNodes(diagram: NonNullable<BlockIR["diagram"]>): { kind: HtmlDiagramArrangementKind; boxes: HtmlDiagramNodeBox[] } {
  const kind = chooseDiagramArrangement(diagram);
  const nodes = diagram.nodes;
  const gap = 3.2;

  if (kind === "vertical") {
    const nodeH = Math.min(17, Math.max(10, (100 - gap * (nodes.length - 1)) / nodes.length));
    const nodeW = Math.min(84, Math.max(52, 100 - 18));
    const startX = (100 - nodeW) / 2;
    const startY = Math.max(0, (100 - nodeH * nodes.length - gap * (nodes.length - 1)) / 2);
    return {
      kind,
      boxes: nodes.map((node, index) => ({ node, x: startX, y: startY + index * (nodeH + gap), w: nodeW, h: nodeH })),
    };
  }

  if (kind === "cycle") {
    const nodeW = 22;
    const nodeH = 16;
    const radiusX = 38;
    const radiusY = 34;
    return {
      kind,
      boxes: nodes.map((node, index) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * index) / nodes.length;
        return {
          node,
          x: 50 + Math.cos(angle) * radiusX - nodeW / 2,
          y: 50 + Math.sin(angle) * radiusY - nodeH / 2,
          w: nodeW,
          h: nodeH,
        };
      }),
    };
  }

  if (kind === "u" || kind === "reverse-u") {
    const columns = nodes.length <= 6 ? 3 : Math.min(4, Math.ceil(Math.sqrt(nodes.length + 1)));
    const rows = Math.max(2, Math.ceil(nodes.length / columns));
    const nodeW = (100 - gap * (columns - 1)) / columns;
    const nodeH = Math.min(18, Math.max(12, (100 - gap * (rows - 1)) / rows));
    const startY = Math.max(0, (100 - nodeH * rows - gap * (rows - 1)) / 2);
    const cells = kind === "u"
      ? htmlUShapeCells(columns, rows).slice(0, nodes.length)
      : htmlReverseUShapeCells(columns, rows).slice(0, nodes.length);
    return {
      kind,
      boxes: nodes.map((node, index) => {
        const cell = cells[index] ?? { column: index % columns, row: Math.floor(index / columns) };
        return { node, x: cell.column * (nodeW + gap), y: startY + cell.row * (nodeH + gap), w: nodeW, h: nodeH };
      }),
    };
  }

  const nodeW = (100 - gap * (nodes.length - 1)) / nodes.length;
  const nodeH = 22;
  const startY = (100 - nodeH) / 2;
  return {
    kind,
    boxes: nodes.map((node, index) => ({ node, x: index * (nodeW + gap), y: startY, w: nodeW, h: nodeH })),
  };
}

function htmlConnectorPoints(from: HtmlDiagramNodeBox, to: HtmlDiagramNodeBox): Array<{ x: number; y: number }> {
  const { start, end } = htmlConnectorEndpoints(from, to);
  if (Math.abs(start.x - end.x) < 0.5 || Math.abs(start.y - end.y) < 0.5) return [start, end];
  const midX = (start.x + end.x) / 2;
  return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
}

function htmlConnectorEndpoints(
  from: HtmlDiagramNodeBox,
  to: HtmlDiagramNodeBox,
): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const fromCenter = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const toCenter = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  const overlap = 0.8;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { start: { x: from.x + from.w - overlap, y: fromCenter.y }, end: { x: to.x + overlap, y: toCenter.y } }
      : { start: { x: from.x + overlap, y: fromCenter.y }, end: { x: to.x + to.w - overlap, y: toCenter.y } };
  }

  return dy >= 0
    ? { start: { x: fromCenter.x, y: from.y + from.h - overlap }, end: { x: toCenter.x, y: to.y + overlap } }
    : { start: { x: fromCenter.x, y: from.y + overlap }, end: { x: toCenter.x, y: to.y + to.h - overlap } };
}

function htmlUShapeCells(columns: number, rows: number): Array<{ column: number; row: number }> {
  const cells: Array<{ column: number; row: number }> = [];
  for (let column = 0; column < columns; column++) cells.push({ column, row: 0 });
  for (let row = 1; row < rows; row++) cells.push({ column: columns - 1, row });
  for (let row = rows - 1; row >= 1; row--) {
    for (let column = columns - 2; column >= 0; column--) cells.push({ column, row });
  }
  return uniqueHtmlCells(cells);
}

function htmlReverseUShapeCells(columns: number, rows: number): Array<{ column: number; row: number }> {
  const cells: Array<{ column: number; row: number }> = [];
  for (let column = 0; column < columns; column++) cells.push({ column, row: rows - 1 });
  for (let row = rows - 2; row >= 0; row--) cells.push({ column: columns - 1, row });
  for (let row = 0; row < rows - 1; row++) {
    for (let column = columns - 2; column >= 0; column--) cells.push({ column, row });
  }
  return uniqueHtmlCells(cells);
}

function uniqueHtmlCells(cells: Array<{ column: number; row: number }>): Array<{ column: number; row: number }> {
  const seen = new Set<string>();
  return cells.filter((cell) => {
    const key = `${cell.column}:${cell.row}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stableDiagramKey(diagram: NonNullable<BlockIR["diagram"]>): string {
  return diagram.nodes.map((node) => node.id).join("-").replace(/[^a-z0-9_-]/gi, "-").slice(0, 48) || "diagram";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] ?? ch));
}

function isPseudoTitleBlockId(blockId: string): boolean {
  return blockId.startsWith("__title:");
}

function classNameForRegionId(regionId: string): string {
  return regionId.replace(/[^a-z0-9_-]/gi, "-");
}

function shouldRenderSurface(role: string, id: string, blockIds: string[], slide?: SlideIR): boolean {
  if (!blockIds.length) return false;
  if (blockIds.some((blockId) => {
    const block = slide?.blocks.find((candidate) => candidate.id === blockId);
    return block?.type === "table" || block?.type === "chart";
  })) return true;
  return ["item", "table", "chart", "code"].includes(role) || id === "key-message" || id === "body-panel";
}

function surfaceRole(role: string, blockIds: string[], slide?: SlideIR): string {
  const block = blockIds.map((blockId) => slide?.blocks.find((candidate) => candidate.id === blockId)).find(Boolean);
  if (block?.type === "table") return "table";
  if (block?.type === "chart") return "chart";
  return role;
}

function surfaceVariantClass(style: string, role: string, id: string): string {
  if (role === "table") return "ticket";
  if (role === "chart") return style === "data" ? "notched-corner" : "flag-drop";
  if (role === "code") return "notched-corner";
  if (id === "key-message" || id === "body-panel") return "two-corner-left";
  if (role !== "item") return "rounded";

  const itemVariantByStyle: Record<string, string> = {
    glass: "rounded",
    newmorphism: "rounded",
    minimalism: "rounded",
    data: "notched-corner",
    executive: "two-corner-left",
    technical: "two-corner-right",
  };
  return itemVariantByStyle[style] ?? "rounded";
}

function normalizeTableCellText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function chooseDiagramArrangement(diagram: NonNullable<BlockIR["diagram"]>): "horizontal" | "vertical" | "u" | "reverse-u" | "cycle" {
  const nodeCount = diagram.nodes.length;
  const longestLabel = Math.max(...diagram.nodes.map((node) => node.label.length));
  const averageLabel = diagram.nodes.reduce((sum, node) => sum + node.label.length, 0) / Math.max(nodeCount, 1);
  const firstId = diagram.nodes[0]?.id;
  const lastId = diagram.nodes[nodeCount - 1]?.id;

  if (nodeCount > 2 && diagram.edges.some((edge) => edge.from === lastId && edge.to === firstId)) return "cycle";
  if (nodeCount <= 5 && (longestLabel > 34 || averageLabel > 24)) return "vertical";
  if (nodeCount <= 4 && longestLabel <= 22) return "horizontal";
  if (nodeCount <= 7) return "u";
  if (nodeCount <= 10) return "reverse-u";
  return "vertical";
}
