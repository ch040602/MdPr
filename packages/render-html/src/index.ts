import { resolveDesignTokens, type BlockIR, type DesignPresetName, type InlineRunIR, type ListItemIR, type PresentationIR, type SlideIR } from "@mdpresent/core";
import type { LayoutIR } from "@mdpresent/layout";

export type RenderHtmlOptions = {
  title?: string;
  designPreset?: DesignPresetName;
};

export type RenderableDeckIR = {
  presentation: PresentationIR;
  layout: LayoutIR;
};

export type RenderHtmlInput = LayoutIR | RenderableDeckIR;

export function renderHtml(input: RenderHtmlInput, options: RenderHtmlOptions = {}): string {
  const layout = isRenderableDeck(input) ? input.layout : input;
  const presentation = isRenderableDeck(input) ? input.presentation : undefined;
  const design = resolveDesignTokens(options.designPreset ?? layout.theme.designPreset, layout.theme);
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
.pipeline { display: flex; align-items: center; gap: .18in; height: 100%; }
.pipeline-vertical { flex-direction: column; align-items: stretch; }
.pipeline-u, .pipeline-reverse-u, .pipeline-cycle { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-content: center; }
.pipeline-cycle { border-radius: .12in; }
.pipeline-node { flex: 1; min-width: 0; border: 1px solid var(--surface-line); background: var(--surface); padding: .12in; text-align: center; box-sizing: border-box; }
.pipeline-edge { color: var(--primary); font-weight: 700; }
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
    const arrangement = chooseDiagramArrangement(block.diagram);
    return `<div class="pipeline pipeline-${arrangement}" data-arrangement="${arrangement}">${block.diagram.nodes.map((node, index) => [
      index > 0 ? `<span class="pipeline-edge">→</span>` : "",
      `<div class="pipeline-node">${escapeHtml(node.label)}</div>`,
    ].join("")).join("")}</div>`;
  }
  if (block.type === "paragraph" && block.inlineRuns?.length) return `<p>${renderInlineRuns(block.inlineRuns)}</p>`;
  if (block.type === "paragraph" && block.sentences?.length) return `<p>${block.sentences.map(escapeHtml).join("<br />")}</p>`;
  if (block.type === "paragraph" && block.lines?.length) return `<p>${block.lines.map(escapeHtml).join("<br />")}</p>`;
  if (block.type === "quote" && block.inlineRuns?.length) return `<blockquote>${renderInlineRuns(block.inlineRuns)}</blockquote>`;
  if (block.type === "quote" && block.text) return `<blockquote>${escapeHtml(block.text)}</blockquote>`;
  if (block.inlineRuns?.length) return `<p>${renderInlineRuns(block.inlineRuns)}</p>`;
  if (block.text) return `<p>${escapeHtml(block.text)}</p>`;
  return "";
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
