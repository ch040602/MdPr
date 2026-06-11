import type { BlockIR, HeadingLevel, InlineRunIR, ListItemIR, MarkdownDocument } from "../ir/types.js";

/**
 * MVP용 단순 Markdown parser.
 * 실제 구현에서는 remark/unified AST 기반으로 교체한다.
 */
export function parseMarkdown(markdown: string, sourcePath?: string): MarkdownDocument {
  const lines = markdown.split(/\r?\n/);
  const blocks: BlockIR[] = [];
  let paragraph: string[] = [];
  let list: ListItemIR[] = [];
  let quote: string[] = [];
  let table: string[][] = [];
  let inCode = false;
  let codeLang = "";
  let codeLines: string[] = [];

  const flushParagraph = (lineNo: number) => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ").trim();
    const richText = paragraph.join("\n").trim();
    blocks.push({
      id: `block-${blocks.length + 1}`,
      type: "paragraph",
      text,
      lines: [...paragraph],
      sentences: splitSentences(text),
      inlineRuns: parseInlineRuns(richText),
      source: { file: sourcePath, startLine: Math.max(1, lineNo - paragraph.length), endLine: lineNo },
    });
    paragraph = [];
  };

  const flushList = (lineNo: number) => {
    if (!list.length) return;
    const pipeline = parsePipelineList(list);
    if (pipeline) {
      blocks.push({
        id: `block-${blocks.length + 1}`,
        type: "diagram",
        text: pipeline.nodes.map((node) => node.label).join(" => "),
        diagram: pipeline,
        source: { file: sourcePath, startLine: Math.max(1, lineNo - list.length), endLine: lineNo },
      });
      list = [];
      return;
    }
    blocks.push({
      id: `block-${blocks.length + 1}`,
      type: "bulletList",
      items: list.map((item) => item.text),
      listItems: [...list],
      listKind: list.every((item) => item.ordered) ? "ordered" : list.every((item) => !item.ordered) ? "unordered" : "mixed",
      source: { file: sourcePath, startLine: Math.max(1, lineNo - list.length), endLine: lineNo },
    });
    list = [];
  };

  const flushQuote = (lineNo: number) => {
    if (!quote.length) return;
    const text = quote.join(" ").trim();
    blocks.push({
      id: `block-${blocks.length + 1}`,
      type: "quote",
      text,
      lines: [...quote],
      sentences: splitSentences(text),
      inlineRuns: parseInlineRuns(text),
      source: { file: sourcePath, startLine: Math.max(1, lineNo - quote.length), endLine: lineNo },
    });
    quote = [];
  };

  const flushTable = (lineNo: number) => {
    if (!table.length) return;
    blocks.push({
      id: `block-${blocks.length + 1}`,
      type: "table",
      rows: table,
      source: { file: sourcePath, startLine: Math.max(1, lineNo - table.length), endLine: lineNo },
    });
    table = [];
  };

  const flushInlineBlocks = (lineNo: number) => {
    flushParagraph(lineNo);
    flushList(lineNo);
    flushQuote(lineNo);
    flushTable(lineNo);
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const lineNo = i + 1;
    const line = raw.trimEnd();

    if (line.startsWith("```")) {
      if (!inCode) {
        flushInlineBlocks(lineNo);
        inCode = true;
        codeLang = line.slice(3).trim();
        codeLines = [];
      } else {
        const pipeline = parseFencedPipelineDiagram(codeLang, codeLines);
        blocks.push(pipeline
          ? {
              id: `block-${blocks.length + 1}`,
              type: "diagram",
              text: pipeline.nodes.map((node) => node.label).join(" => "),
              diagram: pipeline,
              source: { file: sourcePath, endLine: lineNo },
            }
          : {
              id: `block-${blocks.length + 1}`,
              type: "code",
              text: codeLines.join("\n"),
              language: codeLang,
              source: { file: sourcePath, endLine: lineNo },
            });
        inCode = false;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(raw);
      continue;
    }

    if (!line.trim()) {
      flushInlineBlocks(lineNo);
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      flushInlineBlocks(lineNo);
      blocks.push({
        id: `block-${blocks.length + 1}`,
        type: "slideBreak",
        source: { file: sourcePath, startLine: lineNo, endLine: lineNo },
      });
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      flushInlineBlocks(lineNo);
      blocks.push({
        id: `block-${blocks.length + 1}`,
        type: "heading",
        level: headingMatch[1]!.length as HeadingLevel,
        text: headingMatch[2]!.trim(),
        source: { file: sourcePath, startLine: lineNo, endLine: lineNo },
      });
      continue;
    }

    const listItem = parseListItem(raw);
    if (listItem) {
      flushParagraph(lineNo);
      flushQuote(lineNo);
      flushTable(lineNo);
      if (!isDecorativeListText(listItem.text)) list.push(listItem);
      continue;
    }

    const listContinuation = parseListContinuation(raw);
    if (list.length && listContinuation) {
      appendListContinuation(list[list.length - 1]!, listContinuation);
      continue;
    }

    const quoteMatch = /^>\s?(.*)$/.exec(line.trim());
    if (quoteMatch) {
      flushParagraph(lineNo);
      flushList(lineNo);
      flushTable(lineNo);
      quote.push(quoteMatch[1]!.trim());
      continue;
    }

    const imageMatch = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line.trim());
    if (imageMatch) {
      flushInlineBlocks(lineNo);
      blocks.push({
        id: `block-${blocks.length + 1}`,
        type: "image",
        alt: imageMatch[1],
        src: imageMatch[2],
        source: { file: sourcePath, startLine: lineNo, endLine: lineNo },
      });
      continue;
    }

    const pipeline = parsePipelineDiagram(line.trim());
    if (pipeline) {
      flushInlineBlocks(lineNo);
      blocks.push({
        id: `block-${blocks.length + 1}`,
        type: "diagram",
        text: pipeline.nodes.map((node) => node.label).join(" => "),
        diagram: pipeline,
        source: { file: sourcePath, startLine: lineNo, endLine: lineNo },
      });
      continue;
    }

    if (isTableRow(line)) {
      flushParagraph(lineNo);
      flushList(lineNo);
      flushQuote(lineNo);
      const cells = parseTableRow(line);
      if (!isTableDelimiterRow(cells)) table.push(cells);
      continue;
    }

    flushTable(lineNo);
    flushQuote(lineNo);
    paragraph.push(line.trim());
  }

  flushInlineBlocks(lines.length);

  const headings = blocks.filter((b) => b.type === "heading");
  const title = headings.find((h) => h.level === 1)?.text;

  return { sourcePath, title, blocks, headings };
}

function isTableRow(line: string): boolean {
  return line.includes("|") && parseTableRow(line).length > 1;
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableDelimiterRow(cells: string[]): boolean {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
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

function parseListItem(raw: string): ListItemIR | undefined {
  const match = /^(\s*)(?:(\d+)[.)]|[-*+•·])\s*(.*)$/.exec(raw);
  if (!match) return undefined;

  const marker = match[2] ? `${match[2]}.` : raw.trim().slice(0, 1);
  const text = (match[3] ?? "").trim();
  const level = Math.floor((match[1] ?? "").replace(/\t/g, "    ").length / 2);
  const number = match[2] ? Number(match[2]) : undefined;
  const cleanText = normalizeStructuredText(stripInlineMarkdown(text));
  const runs = parseInlineRuns(text);

  return {
    text: cleanText,
    level,
    ordered: number !== undefined,
    number,
    marker,
    runs,
    ...deriveListItemStructure(text, runs),
  };
}

function isDecorativeListText(text: string): boolean {
  return !text.trim() || /^[\-.•·*+]+$/.test(text.trim());
}

function parseListContinuation(raw: string): string | undefined {
  if (!/^\s{2,}\S/.test(raw) && !/^\t+\S/.test(raw)) return undefined;
  const text = raw.trim();
  if (/^(#{1,6})\s+/.test(text)) return undefined;
  if (/^(?:\d+[.)]|[-*+•·])\s+/.test(text)) return undefined;
  return text;
}

function appendListContinuation(item: ListItemIR, rawContinuation: string): void {
  const continuationText = normalizeStructuredText(stripInlineMarkdown(rawContinuation));
  item.text = normalizeStructuredText(`${item.text}\n${continuationText}`);
  item.runs = [...(item.runs ?? []), { text: "\n" }, ...parseInlineRuns(rawContinuation)];
  const structure = deriveListItemStructure(item.text, item.runs);
  item.label = structure.label;
  item.description = structure.description;
  item.descriptionRuns = structure.descriptionRuns;
}

export function parseInlineRuns(text: string): InlineRunIR[] {
  const runs: InlineRunIR[] = [];
  const pattern = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3/g;
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) runs.push({ text: stripInlineMarkdown(text.slice(cursor, index)) });

    if (match[2] !== undefined) {
      runs.push({ text: stripInlineMarkdown(match[2]), bold: true });
    } else if (match[4] !== undefined) {
      runs.push({ text: stripInlineMarkdown(match[4]), italic: true });
    }

    cursor = index + match[0].length;
  }

  if (cursor < text.length) runs.push({ text: stripInlineMarkdown(text.slice(cursor)) });
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
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function deriveListItemStructure(rawText: string, runs: InlineRunIR[]): Partial<ListItemIR> {
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

function parsePipelineList(items: ListItemIR[]) {
  if (!items.length || !items.every((item) => /(?:=>|->)/.test(item.text))) return undefined;

  const labels = items
    .flatMap((item) => splitPipelineLabels(item.text))
    .map((label) => label.trim())
    .filter(Boolean)
    .filter((label, index, all) => index === 0 || label !== all[index - 1]);

  if (labels.length < 2) return undefined;
  return createPipelineDiagram(labels);
}

function parseFencedPipelineDiagram(language: string, lines: string[]) {
  if (language && !["text", "txt", "flow", "pipeline"].includes(language.toLowerCase())) return undefined;
  const cleaned = lines.map((line) => stripInlineMarkdown(line.trim())).filter(Boolean);
  if (cleaned.length < 2) return undefined;

  const firstLinePipeline = parsePipelineDiagram(cleaned[0]!);
  if (firstLinePipeline && cleaned.length === 1) return firstLinePipeline;

  const [first, ...rest] = cleaned;
  const arrowLines = rest.filter((line) => /^(?:=>|->)\s+/.test(line));
  if (!arrowLines.length) return undefined;

  const labels = [
    first,
    ...arrowLines.map((line) => line.replace(/^(?:=>|->)\s+/, "").trim()),
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

function parsePipelineDiagram(line: string) {
  if (!/(?:=>|->)/.test(line)) return undefined;
  const labels = splitPipelineLabels(line);
  if (labels.length < 2) return undefined;
  return createPipelineDiagram(labels);
}

function splitPipelineLabels(text: string): string[] {
  return text
    .split(/\s*(?:=>|->)\s*/g)
    .map((part) => stripInlineMarkdown(part.trim()))
    .filter(Boolean);
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
