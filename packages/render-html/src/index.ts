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
.slide { position: relative; width: ${layout.slideSize.width}in; height: ${layout.slideSize.height}in; background: var(--bg); color: var(--text); overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,.3); }
.region { position: absolute; box-sizing: border-box; }
.title { font-weight: 700; }
.body.key-message { background: var(--surface); border-left: .08in solid var(--primary); padding: .18in .28in; }
.body.key-message blockquote { margin: 0; font-weight: 700; color: var(--text); }
.item { background: var(--surface); border-left: .06in solid var(--primary); padding: .12in .18in; }
.region ul, .region ol { margin: 0; padding-left: 1.2em; }
.structured-list { list-style: none; padding-left: 0; }
.region li.level-1 { margin-left: 1.1em; }
.region li.level-2 { margin-left: 2.2em; }
.region p { margin: 0 0 .45em; }
.region img { width: 100%; height: 100%; object-fit: contain; display: block; }
.item-number { display: inline-flex; width: .28in; height: .28in; align-items: center; justify-content: center; margin-right: .1in; border-radius: 999px; background: var(--primary); color: var(--bg); font-weight: 700; }
.item-label { font-weight: 700; display: block; margin-bottom: .12in; color: var(--primary); }
.item-description { display: block; margin-left: .18in; color: var(--muted); }
strong { color: var(--primary); }
.pipeline { position: relative; height: 100%; min-height: 3.6in; }
.pipeline-connectors { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; z-index: 3; }
.pipeline-connector { fill: none; stroke: var(--primary); stroke-width: 1.35; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.pipeline-node { position: absolute; z-index: 2; min-width: 0; border: 1px solid var(--surface-line); background: var(--surface); padding: .12in; text-align: center; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border-radius: .12in; font-weight: 700; line-height: 1.18; }
.chart { width: 100%; height: 100%; display: flex; flex-direction: column; gap: .12in; justify-content: center; }
.chart-row { display: grid; grid-template-columns: 1.1in 1fr .45in; gap: .1in; align-items: center; font-size: .13in; }
.chart-label { color: var(--text); font-weight: 700; }
.chart-track { height: .18in; background: color-mix(in srgb, var(--surface-line) 60%, transparent); border-radius: 999px; overflow: hidden; }
.chart-bar { height: 100%; background: var(--primary); border-radius: 999px; }
.chart-value { color: var(--muted); text-align: right; }
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
      const classes = ["region", region.role, classNameForRegionId(region.id)].filter(Boolean).join(" ");
      return `<div class="${classes}" style="${style}">${content}</div>`;
    }).join("\n");
    return `<section class="slide" data-slide-id="${slide.sourceSlideId}" data-layout="${slide.layout.preset}">${regions}</section>`;
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
<body>
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
  if (block.type === "code") return `<pre><code>${escapeHtml(block.text ?? "")}</code></pre>`;
  if (block.type === "diagram" && block.diagram?.kind === "pipeline") {
    return renderPipelineDiagram(block.diagram);
  }
  if (block.type === "chart" && block.chart?.kind === "bar") return renderBarChart(block.chart);
  if (block.type === "paragraph" && block.inlineRuns?.length) return `<p>${renderInlineRuns(block.inlineRuns)}</p>`;
  if (block.type === "paragraph" && block.sentences?.length) return `<p>${block.sentences.map(escapeHtml).join("<br />")}</p>`;
  if (block.type === "paragraph" && block.lines?.length) return `<p>${block.lines.map(escapeHtml).join("<br />")}</p>`;
  if (block.type === "quote" && block.inlineRuns?.length) return `<blockquote>${renderInlineRuns(block.inlineRuns)}</blockquote>`;
  if (block.type === "quote" && block.text) return `<blockquote>${escapeHtml(block.text)}</blockquote>`;
  if (block.inlineRuns?.length) return `<p>${renderInlineRuns(block.inlineRuns)}</p>`;
  if (block.text) return `<p>${escapeHtml(block.text)}</p>`;
  return "";
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

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { start: { x: from.x + from.w, y: fromCenter.y }, end: { x: to.x, y: toCenter.y } }
      : { start: { x: from.x, y: fromCenter.y }, end: { x: to.x + to.w, y: toCenter.y } };
  }

  return dy >= 0
    ? { start: { x: fromCenter.x, y: from.y + from.h }, end: { x: toCenter.x, y: to.y } }
    : { start: { x: fromCenter.x, y: from.y }, end: { x: toCenter.x, y: to.y + to.h } };
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
