import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import type { BlockIR, ChartIR, HeadingLevel, InlineRunIR, ListItemIR, MarkdownDocument, SourceCleanupDiagnostic } from "../ir/types.js";

type MdastNode = {
  type: string;
  value?: string;
  depth?: number;
  lang?: string;
  meta?: string;
  url?: string;
  alt?: string;
  ordered?: boolean;
  start?: number;
  children?: MdastNode[];
  position?: {
    start?: { line?: number };
    end?: { line?: number };
  };
};

export function parseMarkdown(markdown: string, sourcePath?: string): MarkdownDocument {
  const sourceLines = markdown.split(/\r?\n/);
  const markerNormalization = normalizeParagraphMarkersForMarkdownAstWithReport(markdown);
  const astMarkdown = markerNormalization.markdown;
  const tree = fromMarkdown(astMarkdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }) as MdastNode;
  const blocks: BlockIR[] = [];

  const pushBlock = (block: Omit<BlockIR, "id">) => {
    blocks.push({ id: `block-${blocks.length + 1}`, ...block });
  };

  const appendNode = (node: MdastNode) => {
    if (node.type === "heading") {
      pushBlock({
        type: "heading",
        level: Math.min(6, Math.max(1, node.depth ?? 1)) as HeadingLevel,
        text: normalizeInlineSpacing(inlineText(node.children)),
        source: sourceFromNode(node, sourcePath),
      });
      return;
    }

    if (node.type === "paragraph") {
      const image = singleParagraphImage(node);
      if (image) {
        pushBlock({
          type: "image",
          alt: image.alt,
          src: image.src,
          source: sourceFromNode(node, sourcePath),
        });
        return;
      }

      const text = normalizePlainText(inlineText(node.children));
      if (isDecorativeListText(text)) return;

      const lines = sourceTextLines(node, sourceLines).map(normalizeInlineSpacing).filter(Boolean);
      const pipeline = parseParagraphPipelineDiagram(text, lines);
      if (pipeline) {
        pushBlock({
          type: "diagram",
          text: pipeline.nodes.map((pipelineNode) => pipelineNode.label).join(" => "),
          diagram: pipeline,
          source: sourceFromNode(node, sourcePath),
        });
        return;
      }

      pushBlock({
        type: "paragraph",
        text,
        lines: lines.length ? lines : [text],
        sentences: splitSentences(text),
        inlineRuns: inlineRunsFromMdast(node.children),
        source: sourceFromNode(node, sourcePath),
      });
      return;
    }

    if (node.type === "list") {
      const listItems = collectListItems(node, 0).filter((item) => !isDecorativeListText(item.text));
      if (!listItems.length) return;
      const pipeline = parsePipelineList(listItems);
      if (pipeline) {
        pushBlock({
          type: "diagram",
          text: pipeline.nodes.map((pipelineNode) => pipelineNode.label).join(" => "),
          diagram: pipeline,
          source: sourceFromNode(node, sourcePath),
        });
        return;
      }
      const listBlock: Omit<BlockIR, "id"> = {
        type: "bulletList",
        items: listItems.map((item) => item.text),
        listItems,
        listKind: listItems.every((item) => item.ordered) ? "ordered" : listItems.every((item) => !item.ordered) ? "unordered" : "mixed",
        source: sourceFromNode(node, sourcePath),
      };
      const previous = blocks[blocks.length - 1];
      if (previous?.type === "bulletList") {
        previous.items = [...(previous.items ?? []), ...(listBlock.items ?? [])];
        previous.listItems = [...(previous.listItems ?? []), ...(listBlock.listItems ?? [])];
        previous.listKind = previous.listItems.every((item) => item.ordered)
          ? "ordered"
          : previous.listItems.every((item) => !item.ordered)
          ? "unordered"
          : "mixed";
        previous.source = {
          file: previous.source?.file ?? listBlock.source?.file,
          startLine: previous.source?.startLine,
          endLine: listBlock.source?.endLine ?? previous.source?.endLine,
        };
      } else {
        pushBlock(listBlock);
      }
      return;
    }

    if (node.type === "blockquote") {
      const lines = blockText(node.children).split(/\n/g).map(normalizeInlineSpacing).filter(Boolean);
      const text = normalizeInlineSpacing(lines.join(" "));
      pushBlock({
        type: "quote",
        text,
        lines,
        sentences: splitSentences(text),
        inlineRuns: parseInlineRuns(text),
        source: sourceFromNode(node, sourcePath),
      });
      return;
    }

    if (node.type === "table") {
      const rows = tableRowsFromMdast(node);
      pushBlock({
        type: "table",
        rows,
        text: rows.map((row) => row.join(" | ")).join("\n"),
        source: sourceFromNode(node, sourcePath),
      });
      return;
    }

    if (node.type === "code") {
      const codeLines = (node.value ?? "").split(/\r?\n/);
      const language = normalizeInlineSpacing(node.lang ?? "");
      const chart = parseFencedChart(language, codeLines);
      const pipeline = parseFencedPipelineDiagram(language, codeLines);
      pushBlock(chart
        ? {
            type: "chart",
            text: chart.series.map((series) => `${series.name}: ${series.values.join(", ")}`).join("\n"),
            chart,
            source: sourceFromNode(node, sourcePath),
          }
        : pipeline
        ? {
            type: "diagram",
            text: pipeline.nodes.map((pipelineNode) => pipelineNode.label).join(" => "),
            diagram: pipeline,
            source: sourceFromNode(node, sourcePath),
          }
        : {
            type: "code",
            text: node.value ?? "",
            language: [node.lang, node.meta].filter(Boolean).join(" ").trim(),
            source: sourceFromNode(node, sourcePath),
          });
      return;
    }

    if (node.type === "html") {
      pushBlock({
        type: "html",
        text: (node.value ?? "").trim(),
        source: sourceFromNode(node, sourcePath),
      });
      return;
    }

    if (node.type === "thematicBreak") {
      pushBlock({
        type: "slideBreak",
        source: sourceFromNode(node, sourcePath),
      });
      return;
    }
  };

  for (const child of tree.children ?? []) appendNode(child);

  const headings = blocks.filter((b) => b.type === "heading");
  const title = headings.find((h) => h.level === 1)?.text;

  return {
    sourcePath,
    title,
    parser: "simple",
    blocks,
    headings,
    sourceCleanupDiagnostics: markerNormalization.diagnostics,
  };
}

export function normalizeParagraphMarkersForMarkdownAst(markdown: string): string {
  return normalizeParagraphMarkersForMarkdownAstWithReport(markdown).markdown;
}

export function normalizeParagraphMarkersForMarkdownAstWithReport(markdown: string): {
  markdown: string;
  diagnostics: SourceCleanupDiagnostic[];
} {
  const diagnostics: SourceCleanupDiagnostic[] = [];
  let fencedMarker: "`" | "~" | undefined;
  let fencedLength = 0;
  let inPreBlock = false;
  const lines = markdown.split(/\r?\n/).map((line, index) => {
    const fenced = fenceInfo(line);
    if (fencedMarker) {
      if (fenced && fenced.marker === fencedMarker && fenced.length >= fencedLength) {
        fencedMarker = undefined;
        fencedLength = 0;
      }
      return line;
    }
    if (fenced) {
      fencedMarker = fenced.marker;
      fencedLength = fenced.length;
      return line;
    }

    if (inPreBlock) {
      if (/<\/pre>/i.test(line)) inPreBlock = false;
      return line;
    }
    if (/^\s{0,3}<pre\b/i.test(line)) {
      if (!/<\/pre>/i.test(line)) inPreBlock = true;
      return line;
    }

    if (isIndentedCodeLine(line)) return line;

    const protectedLine = protectLikelyProseOrderedMarkerLine(line);
    if (protectedLine !== line) return protectedLine;

    const normalized = normalizeParagraphMarkerLine(line);
    if (normalized.line !== line) diagnostics.push({
      level: "info",
      code: "paragraph-marker-normalized",
      line: index + 1,
      originalMarker: normalized.originalMarker,
      normalizedMarker: "-",
      action: "normalize-to-list-marker",
      reason: "paragraph-marker-shorthand",
    });
    return normalized.line;
  });

  return { markdown: lines.join("\n"), diagnostics };
}

function protectLikelyProseOrderedMarkerLine(line: string): string {
  const match = /^(\s{0,3})(19\d{2}|20\d{2})\.\s+(\S.*)$/.exec(line);
  if (!match) return line;
  const [, indent = "", year = "", rest = ""] = match;
  return `${indent}${year}\\. ${rest}`;
}

function normalizeParagraphMarkerLine(line: string): { line: string; originalMarker: string } {
  const match = /^(\s*)([•·ㆍ▪◦‣–—−-])(?:[ \t]+|(?=\S)|$)(.*)$/.exec(line);
  if (!match) return { line, originalMarker: "" };
  const [, indent = "", marker = "", rest = ""] = match;

  if (marker === "-" && shouldKeepAsciiDashLine(rest)) return { line, originalMarker: marker };
  if (!rest) return { line: `${indent}-`, originalMarker: marker };
  return { line: `${indent}- ${rest.trimStart()}`, originalMarker: marker };
}

function fenceInfo(line: string): { marker: "`" | "~"; length: number } | undefined {
  const match = /^(?: {0,3})(`{3,}|~{3,})/.exec(line);
  if (!match) return undefined;
  const fence = match[1];
  return { marker: fence[0] as "`" | "~", length: fence.length };
}

function isIndentedCodeLine(line: string): boolean {
  return /^(?: {4,}|\t)/.test(line);
}

function shouldKeepAsciiDashLine(rest: string): boolean {
  if (!rest) return false;
  if (/^[-=*_]{1,}$/.test(rest)) return true;
  if (/^>/.test(rest)) return true;
  if (/^\d/.test(rest)) return true;
  return false;
}

function sourceFromNode(node: MdastNode, sourcePath?: string) {
  return {
    file: sourcePath,
    startLine: node.position?.start?.line,
    endLine: node.position?.end?.line,
  };
}

function sourceTextLines(node: MdastNode, sourceLines: string[]): string[] {
  const start = node.position?.start?.line;
  const end = node.position?.end?.line;
  if (!start || !end) return [];
  return sourceLines.slice(start - 1, end).map((line) => line.trim());
}

function singleParagraphImage(node: MdastNode): { src: string; alt: string } | undefined {
  const children = node.children ?? [];
  if (children.length !== 1 || children[0]?.type !== "image") return undefined;
  return { src: children[0].url ?? "", alt: children[0].alt ?? "" };
}

function collectListItems(listNode: MdastNode, level: number): ListItemIR[] {
  const items: ListItemIR[] = [];
  const ordered = Boolean(listNode.ordered);
  const start = listNode.start ?? 1;

  (listNode.children ?? []).forEach((itemNode, index) => {
    if (itemNode.type !== "listItem") return;
    const ownChildren = itemNode.children ?? [];
    const ownBlocks = ownChildren.filter((child) => child.type !== "list");
    const nestedLists = ownChildren.filter((child) => child.type === "list");
    const ownText = normalizeStructuredText(blockText(ownBlocks));
    const runs = inlineRunsFromListBlocks(ownBlocks);

    if (ownText) {
      const item: ListItemIR = {
        text: normalizeStructuredText(stripInlineMarkdown(ownText)),
        level,
        ordered,
        number: ordered ? start + index : undefined,
        marker: ordered ? `${start + index}.` : "-",
        runs,
        ...deriveListItemStructure(ownText, runs),
      };
      items.push(item);
    }

    for (const nestedList of nestedLists) items.push(...collectListItems(nestedList, level + 1));
  });

  return items;
}

function inlineRunsFromListBlocks(nodes: MdastNode[]): InlineRunIR[] {
  const runs: InlineRunIR[] = [];
  for (const node of nodes) {
    if (node.type === "paragraph" || node.type === "heading") {
      if (runs.length) runs.push({ text: "\n" });
      runs.push(...inlineRunsFromMdast(node.children));
    } else {
      const text = blockText([node]);
      if (text) {
        if (runs.length) runs.push({ text: "\n" });
        runs.push({ text });
      }
    }
  }
  return runs.filter((run) => run.text.length > 0);
}

function tableRowsFromMdast(node: MdastNode): string[][] {
  return (node.children ?? [])
    .filter((row) => row.type === "tableRow")
    .map((row) => (row.children ?? [])
      .filter((cell) => cell.type === "tableCell")
      .map((cell) => normalizeInlineSpacing(blockText(cell.children))));
}

function blockText(nodes: MdastNode[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === "paragraph" || node.type === "heading" || node.type === "tableCell") return inlineText(node.children);
      if (node.type === "code" || node.type === "html") return node.value ?? "";
      if (node.type === "list") return collectListItems(node, 0).map((item) => item.text).join("\n");
      if (node.children) return blockText(node.children);
      return inlineText([node]);
    })
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n");
}

function inlineText(nodes: MdastNode[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === "text" || node.type === "inlineCode") return node.value ?? "";
      if (node.type === "break") return "\n";
      if (node.type === "image") return node.alt ?? "";
      if (node.children) return inlineText(node.children);
      return "";
    })
    .join("");
}

function inlineRunsFromMdast(nodes: MdastNode[] | undefined, style: Partial<InlineRunIR> = {}): InlineRunIR[] {
  const runs: InlineRunIR[] = [];
  for (const node of nodes ?? []) {
    if (node.type === "text" || node.type === "inlineCode") {
      runs.push({ text: normalizeRunText(node.value ?? ""), ...style });
    } else if (node.type === "break") {
      runs.push({ text: "\n", ...style });
    } else if (node.type === "image") {
      const alt = normalizeRunText(node.alt ?? "");
      if (alt) runs.push({ text: alt, ...style });
    } else if (node.type === "strong") {
      runs.push(...inlineRunsFromMdast(node.children, { ...style, bold: true }));
    } else if (node.type === "emphasis") {
      runs.push(...inlineRunsFromMdast(node.children, { ...style, italic: true }));
    } else if (node.children) {
      runs.push(...inlineRunsFromMdast(node.children, style));
    }
  }
  return mergeAdjacentRuns(runs).filter((run) => run.text.length > 0);
}

function mergeAdjacentRuns(runs: InlineRunIR[]): InlineRunIR[] {
  const merged: InlineRunIR[] = [];
  for (const run of runs) {
    const previous = merged[merged.length - 1];
    if (previous && Boolean(previous.bold) === Boolean(run.bold) && Boolean(previous.italic) === Boolean(run.italic)) {
      previous.text += run.text;
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
}

export function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const sentences: string[] = [];
  const sentencePattern = /[^.!?。！？]+[.!?。！？]+(?:["')\]]+)?|[^.!?。！？]+$/g;

  for (const match of normalized.matchAll(sentencePattern)) {
    const sentence = match[0].trim();
    if (sentence) sentences.push(sentence);
  }

  return sentences.length ? sentences : [normalized];
}

function isDecorativeListText(text: string): boolean {
  return !text.trim() || /^[\-.•·*+]+$/.test(text.trim());
}

export function parseInlineRuns(text: string): InlineRunIR[] {
  const runs: InlineRunIR[] = [];
  const pattern = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3/g;
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) runs.push({ text: normalizeRunText(stripInlineMarkdown(text.slice(cursor, index))) });

    if (match[2] !== undefined) {
      runs.push({ text: normalizeRunText(stripInlineMarkdown(match[2])), bold: true });
    } else if (match[4] !== undefined) {
      runs.push({ text: normalizeRunText(stripInlineMarkdown(match[4])), italic: true });
    }

    cursor = index + match[0].length;
  }

  if (cursor < text.length) runs.push({ text: normalizeRunText(stripInlineMarkdown(text.slice(cursor))) });
  return runs.filter((run) => run.text.length > 0);
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1");
}

function normalizeStructuredText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => normalizeInlineSpacing(line))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeInlineSpacing(text: string): string {
  return text.replace(/[ \t\f\v]+/g, " ").trim();
}

function normalizePlainText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeRunText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t\f\v]+/g, " "))
    .join("\n");
}

export function deriveListItemStructure(rawText: string, runs: InlineRunIR[]): Partial<ListItemIR> {
  const plainLines = normalizeStructuredText(stripInlineMarkdown(rawText)).split(/\n/).filter(Boolean);
  if (plainLines.length > 1) {
    const [label, ...descriptionLines] = plainLines;
    const description = descriptionLines.join("\n");
    return {
      label,
      description,
      descriptionRuns: parseInlineRuns(description),
    };
  }

  const plain = plainLines[0] ?? "";
  const colonMatch = /^([^:：]{2,48})[:：]\s+(.+)$/.exec(plain);
  if (!colonMatch) return {};

  const label = colonMatch[1]!.trim();
  const description = colonMatch[2]!.trim();
  return {
    label,
    description,
    descriptionRuns: runs.some((run) => run.bold || run.italic) ? parseInlineRuns(description) : [{ text: description }],
  };
}

export function parsePipelineList(items: ListItemIR[]) {
  if (!items.length || !items.every((item) => hasPipelineArrow(item.text))) return undefined;

  const labels = items
    .flatMap((item) => splitPipelineLabels(item.text))
    .map((label) => label.trim())
    .filter(Boolean)
    .filter((label, index, all) => index === 0 || label !== all[index - 1]);

  if (labels.length < 2) return undefined;
  return createPipelineDiagram(labels);
}

export function parseFencedPipelineDiagram(language: string, lines: string[]) {
  if (language && !["text", "txt", "flow", "pipeline"].includes(language.toLowerCase())) return undefined;
  const cleaned = lines.map((line) => stripInlineMarkdown(line.trim())).filter(Boolean);
  if (cleaned.length < 2) return undefined;

  const firstLinePipeline = parsePipelineDiagram(cleaned[0]!);
  if (firstLinePipeline && cleaned.length === 1) return firstLinePipeline;

  const [first, ...rest] = cleaned;
  const arrowLines = rest.filter((line) => /^PIPELINE_ARROW\s+/.test(normalizePipelineArrows(line)));
  if (!arrowLines.length) return undefined;

  const labels = [
    first,
    ...arrowLines.map((line) => normalizePipelineArrows(line).replace(/^PIPELINE_ARROW\s+/, "").trim()),
  ].filter(Boolean);
  const branchOutputs = rest
    .filter((line) => /^[├└]─\s+/.test(line))
    .map((line) => line.replace(/^[├└]─\s+/, "").trim())
    .filter(Boolean);
  if (branchOutputs.length) {
    labels[labels.length - 1] = `${labels[labels.length - 1]}\n${branchOutputs.join(" / ")}`;
  }

  if (labels.length < 2) return undefined;
  return createPipelineDiagram(labels);
}

export function parsePipelineDiagram(line: string) {
  if (!hasPipelineArrow(line)) return undefined;
  const labels = splitPipelineLabels(line);
  if (labels.length < 2) return undefined;
  return createPipelineDiagram(labels);
}

function parseParagraphPipelineDiagram(text: string, lines: string[]) {
  if (lines.length <= 1) return parsePipelineDiagram(text);
  if (!lines.every(hasPipelineArrow)) return undefined;
  return parsePipelineDiagram(lines.join(" => "));
}

function splitPipelineLabels(text: string): string[] {
  return normalizePipelineArrows(text)
    .split(/\s*PIPELINE_ARROW\s*/g)
    .map((part) => stripInlineMarkdown(part.trim()))
    .filter(Boolean);
}

function hasPipelineArrow(text: string): boolean {
  return /(?:=>|->|→)/.test(text);
}

function normalizePipelineArrows(text: string): string {
  return text.replace(/=>|->|→/g, "PIPELINE_ARROW");
}

function createPipelineDiagram(labels: string[]) {
  const closesCycle = labels.length > 2 && labels[0]?.toLowerCase() === labels[labels.length - 1]?.toLowerCase();
  const nodeLabels = closesCycle ? labels.slice(0, -1) : labels;
  const nodes = nodeLabels.map((label, index) => ({ id: `node-${index + 1}`, label }));
  const edges = nodes.slice(0, -1).map((node, index) => ({
    from: node.id,
    to: nodes[index + 1]!.id,
  }));
  if (closesCycle && nodes.length > 2) {
    edges.push({ from: nodes[nodes.length - 1]!.id, to: nodes[0]!.id });
  }

  return { kind: "pipeline" as const, nodes, edges };
}

export function parseFencedChart(language: string, lines: string[]): ChartIR | undefined {
  const chartKind = chartKindFromLanguage(language);
  if (!chartKind) return undefined;
  let cleaned = lines.map((line) => normalizeInlineSpacing(line)).filter(Boolean);
  if (cleaned.length < 2) return undefined;
  const explicitKind = chartKindFromMetadata(cleaned);
  const kind = explicitKind ?? chartKind;
  cleaned = cleaned.filter((line) => !/^(?:kind|variant|type)\s*[:=]/i.test(line));
  if (cleaned.length < 2) return undefined;

  const labelsLineIndex = cleaned.findIndex((line) => /^labels?\s*:/i.test(line));
  if (labelsLineIndex >= 0) {
    const labels = splitChartValues(cleaned[labelsLineIndex]!.replace(/^labels?\s*:/i, ""));
    const series = cleaned
      .filter((_, index) => index !== labelsLineIndex)
      .map(parseNamedChartSeries)
      .filter((item): item is ChartIR["series"][number] => Boolean(item))
      .filter((item) => item.values.length === labels.length);
    if (labels.length && series.length) return { kind, labels, series };
  }

  const rows = cleaned.map((line) => line.split(",").map((part) => normalizeInlineSpacing(part))).filter((row) => row.length >= 2);
  const numericRows = rows.map((row) => ({ label: row[0]!, value: Number(row[1]!.replace(/,/g, "")) })).filter((row) => Number.isFinite(row.value));
  if (numericRows.length) {
    return {
      kind,
      labels: numericRows.map((row) => row.label),
      series: [{ name: "Value", values: numericRows.map((row) => row.value) }],
    };
  }

  return undefined;
}

function chartKindFromLanguage(language: string): ChartIR["kind"] | undefined {
  const normalized = language.toLowerCase().trim();
  if (["chart", "bar", "bar-chart", "barchart"].includes(normalized)) return "bar";
  if (["arc-ring", "arc-ring-chart", "ring", "ring-chart", "donut", "donut-chart"].includes(normalized)) return "arc-ring";
  if (["gauge", "gauge-chart", "gauge-dial", "dial"].includes(normalized)) return "gauge";
  if (["connected-strip", "chart-strip", "strip", "strip-chart", "sequence-strip"].includes(normalized)) return "connected-strip";
  if (["ranked-bars", "rank-bars", "ranking-bars", "ranked-bar", "ranked-bar-chart"].includes(normalized)) return "ranked-bars";
  if (["metric-dots", "dot-metrics", "status-dots", "progress-dots", "dot-strip"].includes(normalized)) return "metric-dots";
  return undefined;
}

function chartKindFromMetadata(lines: string[]): ChartIR["kind"] | undefined {
  const kindLine = lines.find((line) => /^(?:kind|variant|type)\s*[:=]/i.test(line));
  if (!kindLine) return undefined;
  return chartKindFromLanguage(kindLine.replace(/^(?:kind|variant|type)\s*[:=]/i, ""));
}

function parseNamedChartSeries(line: string): ChartIR["series"][number] | undefined {
  const match = /^([^:：]+)[:：]\s*(.+)$/.exec(line);
  if (!match) return undefined;
  const values = splitChartValues(match[2]!).map((value) => Number(value.replace(/,/g, "")));
  if (!values.length || values.some((value) => !Number.isFinite(value))) return undefined;
  return { name: normalizeInlineSpacing(match[1]!), values };
}

function splitChartValues(text: string): string[] {
  return text.split(/[,|]/g).map((part) => normalizeInlineSpacing(part)).filter(Boolean);
}
