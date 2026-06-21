import { spawnSync } from "node:child_process";
import type {
  BlockIR,
  HeadingLevel,
  InlineRunIR,
  ListItemIR,
  MarkdownDocument,
  PandocAttr,
} from "../ir/types.js";
import {
  deriveListItemStructure,
  parseFencedChart,
  parseFencedPipelineDiagram,
  parseMarkdown,
  parsePipelineDiagram,
  parsePipelineList,
  splitSentences,
} from "./parseMarkdown.js";

export type PandocParseOptions = {
  sourcePath?: string;
  pandocPath?: string;
  from?: string;
  extraArgs?: string[];
  fallbackToSimple?: boolean;
};

type PandocNode = { t: string; c?: unknown };

type ParseState = {
  sourcePath?: string;
  blocks: BlockIR[];
  headings: BlockIR[];
  nextId: number;
};

export function parseMarkdownWithPandoc(markdown: string, options: PandocParseOptions = {}): MarkdownDocument {
  const result = spawnSync(
    options.pandocPath ?? "pandoc",
    ["--from", options.from ?? "markdown", "--to", "json", ...(options.extraArgs ?? [])],
    {
      input: markdown,
      encoding: "utf-8",
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  if (result.status !== 0 || result.error) {
    if (options.fallbackToSimple) return parseMarkdown(markdown, options.sourcePath);
    const detail = result.stderr?.trim() || result.error?.message || "Pandoc exited without a diagnostic.";
    throw new Error(`Pandoc markdown parser failed: ${detail}`);
  }

  return parsePandocJson(result.stdout, options.sourcePath);
}

export function parsePandocJson(raw: string | unknown, sourcePath?: string): MarkdownDocument {
  const document = typeof raw === "string" ? JSON.parse(raw) : raw;
  const blocks = extractPandocBlocks(document);
  const state: ParseState = { sourcePath, blocks: [], headings: [], nextId: 1 };

  for (const block of blocks) pushConvertedBlocks(state, convertBlock(block, state));

  return {
    sourcePath,
    title: state.headings.find((heading) => heading.level === 1)?.text,
    parser: "pandoc",
    blocks: state.blocks,
    headings: state.headings,
  };
}

function extractPandocBlocks(document: unknown): unknown[] {
  if (Array.isArray(document) && Array.isArray(document[1])) return document[1];
  if (isRecord(document) && Array.isArray(document.blocks)) return document.blocks;
  throw new Error("Invalid Pandoc JSON: expected a document with a blocks array.");
}

function convertBlock(block: unknown, state: ParseState, inheritedAttr?: PandocAttr): BlockIR[] {
  const tag = tagOf(block);
  const content = contentOf(block);

  if (tag === "Header" && Array.isArray(content)) {
    const level = clampHeadingLevel(Number(content[0]));
    const attr = parsePandocAttr(content[1]);
    const inlineRuns = inlineRunsFromPandoc(asArray(content[2]));
    const text = normalizeText(inlineRuns.map((run) => run.text).join(""));
    const heading: BlockIR = {
      id: newBlockId(state, "heading"),
      type: "heading",
      level,
      text,
      inlineRuns,
      source: sourceFor(state),
      pandocAttr: attr,
    };
    state.headings.push(heading);
    return [heading];
  }

  if ((tag === "Para" || tag === "Plain") && Array.isArray(content)) {
    const image = singleImageInline(content);
    if (image) {
      return [{
        id: newBlockId(state, "image"),
        type: "image",
        src: image.src,
        alt: image.alt,
        text: image.alt,
        source: sourceFor(state),
        pandocAttr: image.attr,
      }];
    }

    const inlineRuns = inlineRunsFromPandoc(content);
    const text = normalizeText(inlineRuns.map((run) => run.text).join(""));
    if (!text) return [];
    const pipeline = parsePipelineDiagram(text);
    if (pipeline) {
      return [{
        id: newBlockId(state, "diagram"),
        type: "diagram",
        text: pipeline.nodes.map((node) => node.label).join(" => "),
        diagram: pipeline,
        source: sourceFor(state),
        pandocAttr: inheritedAttr,
      }];
    }
    return [{
      id: newBlockId(state, "paragraph"),
      type: "paragraph",
      text,
      lines: [text],
      sentences: splitSentences(text),
      inlineRuns,
      source: sourceFor(state),
      pandocAttr: inheritedAttr,
    }];
  }

  if (tag === "BulletList" && Array.isArray(content)) {
    const listItems = collectListItemsFromPandoc(content, false, 0, 1);
    const pipeline = parsePipelineList(listItems);
    if (pipeline) {
      return [{
        id: newBlockId(state, "diagram"),
        type: "diagram",
        text: pipeline.nodes.map((node) => node.label).join(" => "),
        diagram: pipeline,
        source: sourceFor(state),
        pandocAttr: inheritedAttr,
      }];
    }
    return [listBlock(state, listItems, inheritedAttr)];
  }

  if (tag === "OrderedList" && Array.isArray(content)) {
    const items = asArray(content[1]);
    const start = Array.isArray(content[0]) ? Number(content[0][0] ?? 1) : 1;
    const listItems = collectListItemsFromPandoc(items, true, 0, Number.isFinite(start) ? start : 1);
    const pipeline = parsePipelineList(listItems);
    if (pipeline) {
      return [{
        id: newBlockId(state, "diagram"),
        type: "diagram",
        text: pipeline.nodes.map((node) => node.label).join(" => "),
        diagram: pipeline,
        source: sourceFor(state),
        pandocAttr: inheritedAttr,
      }];
    }
    return [listBlock(state, listItems, inheritedAttr)];
  }

  if (tag === "CodeBlock" && Array.isArray(content)) {
    const attr = parsePandocAttr(content[0]);
    const language = attr?.classes?.[0] ?? "";
    const codeLines = String(content[1] ?? "").split(/\r?\n/);
    const chart = parseFencedChart(language, codeLines);
    if (chart) {
      return [{
        id: newBlockId(state, "chart"),
        type: "chart",
        text: chart.series.map((series) => `${series.name}: ${series.values.join(", ")}`).join("\n"),
        chart,
        source: sourceFor(state),
        pandocAttr: attr ?? inheritedAttr,
      }];
    }
    const pipeline = parseFencedPipelineDiagram(language, codeLines);
    if (pipeline) {
      return [{
        id: newBlockId(state, "diagram"),
        type: "diagram",
        text: pipeline.nodes.map((node) => node.label).join(" => "),
        diagram: pipeline,
        source: sourceFor(state),
        pandocAttr: attr ?? inheritedAttr,
      }];
    }
    return [{
      id: newBlockId(state, "code"),
      type: "code",
      text: String(content[1] ?? ""),
      language,
      source: sourceFor(state),
      pandocAttr: attr ?? inheritedAttr,
    }];
  }

  if (tag === "BlockQuote" && Array.isArray(content)) {
    const text = normalizeText(blocksToText(content));
    return text ? [{
      id: newBlockId(state, "quote"),
      type: "quote",
      text,
      source: sourceFor(state),
      pandocAttr: inheritedAttr,
    }] : [];
  }

  if (tag === "Table") {
    const rows = tableRowsFromPandoc(block);
    return [{
      id: newBlockId(state, "table"),
      type: "table",
      rows,
      text: rows.map((row) => row.join(" | ")).join("\n"),
      source: sourceFor(state),
      pandocAttr: inheritedAttr,
    }];
  }

  if (tag === "HorizontalRule") {
    return [{
      id: newBlockId(state, "slide-break"),
      type: "slideBreak",
      source: sourceFor(state),
    }];
  }

  if (tag === "Div" && Array.isArray(content)) {
    const attr = parsePandocAttr(content[0]) ?? inheritedAttr;
    return asArray(content[1]).flatMap((child) => convertBlock(child, state, attr));
  }

  if (tag === "RawBlock" && Array.isArray(content)) {
    const format = String(content[0] ?? "");
    const text = String(content[1] ?? "");
    return [{
      id: newBlockId(state, format === "html" ? "html" : "code"),
      type: format === "html" ? "html" : "code",
      text,
      language: format === "html" ? undefined : format,
      source: sourceFor(state),
      pandocAttr: inheritedAttr,
    }];
  }

  const text = normalizeText(blocksToText([block]));
  return text ? [{
    id: newBlockId(state, "paragraph"),
    type: "paragraph",
    text,
    lines: [text],
    sentences: splitSentences(text),
    inlineRuns: [{ text }],
    source: sourceFor(state),
    pandocAttr: inheritedAttr,
  }] : [];
}

function listBlock(state: ParseState, listItems: ListItemIR[], pandocAttr?: PandocAttr): BlockIR {
  return {
    id: newBlockId(state, "list"),
    type: "bulletList",
    items: listItems.map((item) => item.text),
    listItems,
    listKind: listItems.every((item) => item.ordered) ? "ordered" : listItems.every((item) => !item.ordered) ? "unordered" : "mixed",
    source: sourceFor(state),
    pandocAttr,
  };
}

function collectListItemsFromPandoc(items: unknown[], ordered: boolean, level: number, start: number): ListItemIR[] {
  return items.flatMap((item, index): ListItemIR[] => {
    const blocks = asArray(item);
    const ownBlocks = blocks.filter((block) => tagOf(block) !== "BulletList" && tagOf(block) !== "OrderedList");
    const nestedLists = blocks.filter((block) => tagOf(block) === "BulletList" || tagOf(block) === "OrderedList");
    const text = normalizeText(blocksToText(ownBlocks));
    const runs = inlineRunsFromPandocBlocks(ownBlocks);
    const current: ListItemIR[] = text
      ? [{
          text,
          level,
          ordered,
          number: ordered ? start + index : undefined,
          marker: ordered ? `${start + index}.` : "-",
          runs,
          ...deriveListItemStructure(text, runs),
        }]
      : [];

    const nested = nestedLists.flatMap((nestedList) => {
      const tag = tagOf(nestedList);
      const content = contentOf(nestedList);
      if (tag === "BulletList" && Array.isArray(content)) {
        return collectListItemsFromPandoc(content, false, level + 1, 1);
      }
      if (tag === "OrderedList" && Array.isArray(content)) {
        const nestedStart = Array.isArray(content[0]) ? Number(content[0][0] ?? 1) : 1;
        return collectListItemsFromPandoc(asArray(content[1]), true, level + 1, Number.isFinite(nestedStart) ? nestedStart : 1);
      }
      return [];
    });

    return [...current, ...nested];
  });
}

function inlineRunsFromPandocBlocks(blocks: unknown[]): InlineRunIR[] {
  const runs: InlineRunIR[] = [];
  for (const block of blocks) {
    const tag = tagOf(block);
    const content = contentOf(block);
    if ((tag === "Para" || tag === "Plain") && Array.isArray(content)) {
      if (runs.length) runs.push({ text: "\n" });
      runs.push(...inlineRunsFromPandoc(content));
    } else {
      const text = normalizeText(blocksToText([block]));
      if (text) {
        if (runs.length) runs.push({ text: "\n" });
        runs.push({ text });
      }
    }
  }
  return mergeAdjacentRuns(runs).filter((run) => run.text.length > 0);
}

function inlineRunsFromPandoc(inlines: unknown[], style: Partial<InlineRunIR> = {}): InlineRunIR[] {
  const runs: InlineRunIR[] = [];

  for (const inline of inlines) {
    const tag = tagOf(inline);
    const content = contentOf(inline);
    if (tag === "Str") runs.push({ text: String(content ?? ""), ...style });
    else if (tag === "Space") runs.push({ text: " ", ...style });
    else if (tag === "SoftBreak" || tag === "LineBreak") runs.push({ text: "\n", ...style });
    else if (tag === "Strong") runs.push(...inlineRunsFromPandoc(asArray(content), { ...style, bold: true }));
    else if (tag === "Emph") runs.push(...inlineRunsFromPandoc(asArray(content), { ...style, italic: true }));
    else if (tag === "Code" && Array.isArray(content)) runs.push({ text: String(content[1] ?? ""), ...style });
    else if (tag === "Link" && Array.isArray(content)) runs.push(...inlineRunsFromPandoc(asArray(content[1]), style));
    else if (tag === "Image" && Array.isArray(content)) runs.push({ text: normalizeText(inlineRunsFromPandoc(asArray(content[1])).map((run) => run.text).join("")), ...style });
    else if (Array.isArray(content)) runs.push(...inlineRunsFromPandoc(content, style));
  }

  return mergeAdjacentRuns(runs).filter((run) => run.text.length > 0);
}

function singleImageInline(inlines: unknown[]): { src: string; alt: string; attr?: PandocAttr } | undefined {
  const nonSpace = inlines.filter((inline) => tagOf(inline) !== "Space" && tagOf(inline) !== "SoftBreak");
  if (nonSpace.length !== 1 || tagOf(nonSpace[0]) !== "Image") return undefined;
  const content = contentOf(nonSpace[0]);
  if (!Array.isArray(content)) return undefined;
  const target = asArray(content[2]);
  const src = String(target[0] ?? "");
  if (!src) return undefined;
  const alt = normalizeText(inlineRunsFromPandoc(asArray(content[1])).map((run) => run.text).join(""));
  return { src, alt, attr: parsePandocAttr(content[0]) };
}

function tableRowsFromPandoc(block: unknown): string[][] {
  const rows: string[][] = [];
  visit(block, (node) => {
    if (tagOf(node) !== "Row") return;
    const content = contentOf(node);
    if (!Array.isArray(content)) return;
    const cells = asArray(content[1]).map((cell) => normalizeText(blocksToText(cellBlocks(cell))));
    if (cells.length) rows.push(cells);
  });
  return rows;
}

function cellBlocks(cell: unknown): unknown[] {
  const content = contentOf(cell);
  if (!Array.isArray(content)) return [];
  const tail = content[content.length - 1];
  return Array.isArray(tail) ? tail : [];
}

function blocksToText(blocks: unknown[]): string {
  return blocks
    .map((block) => {
      const tag = tagOf(block);
      const content = contentOf(block);
      if ((tag === "Para" || tag === "Plain") && Array.isArray(content)) {
        return inlineRunsFromPandoc(content).map((run) => run.text).join("");
      }
      if (tag === "Header" && Array.isArray(content)) {
        return inlineRunsFromPandoc(asArray(content[2])).map((run) => run.text).join("");
      }
      if (tag === "CodeBlock" && Array.isArray(content)) return String(content[1] ?? "");
      if (tag === "BulletList" && Array.isArray(content)) return content.map((item) => blocksToText(asArray(item))).join("\n");
      if (tag === "OrderedList" && Array.isArray(content)) return asArray(content[1]).map((item) => blocksToText(asArray(item))).join("\n");
      if (tag === "BlockQuote" && Array.isArray(content)) return blocksToText(content);
      if (tag === "RawBlock" && Array.isArray(content)) return String(content[1] ?? "");
      if (Array.isArray(content)) return blocksToText(content);
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function parsePandocAttr(value: unknown): PandocAttr | undefined {
  if (!Array.isArray(value)) return undefined;
  const identifier = String(value[0] ?? "");
  const classes = asArray(value[1]).map(String).filter(Boolean);
  const attributes: Record<string, string> = {};
  for (const pair of asArray(value[2])) {
    if (Array.isArray(pair) && pair.length >= 2) attributes[String(pair[0])] = String(pair[1]);
  }
  if (!identifier && classes.length === 0 && Object.keys(attributes).length === 0) return undefined;
  return {
    ...(identifier ? { identifier } : {}),
    ...(classes.length ? { classes } : {}),
    ...(Object.keys(attributes).length ? { attributes } : {}),
  };
}

function tagOf(node: unknown): string | undefined {
  if (isRecord(node) && typeof node.t === "string") return node.t;
  if (Array.isArray(node) && typeof node[0] === "string") return node[0];
  return undefined;
}

function contentOf(node: unknown): unknown {
  if (isRecord(node) && "c" in node) return (node as PandocNode).c;
  if (Array.isArray(node)) return node.slice(1);
  return undefined;
}

function pushConvertedBlocks(state: ParseState, blocks: BlockIR[]): void {
  state.blocks.push(...blocks);
}

function newBlockId(state: ParseState, prefix: string): string {
  return `${prefix}-${state.nextId++}`;
}

function sourceFor(state: ParseState) {
  return state.sourcePath ? { file: state.sourcePath } : undefined;
}

function clampHeadingLevel(value: number): HeadingLevel {
  return Math.min(6, Math.max(1, Number.isFinite(value) ? value : 1)) as HeadingLevel;
}

function normalizeText(text: string): string {
  return text.replace(/[ \t]*\n[ \t]*/g, "\n").replace(/[ \t]+/g, " ").trim();
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

function visit(node: unknown, callback: (node: unknown) => void): void {
  callback(node);
  if (Array.isArray(node)) {
    for (const child of node) visit(child, callback);
  } else if (isRecord(node)) {
    for (const value of Object.values(node)) visit(value, callback);
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
