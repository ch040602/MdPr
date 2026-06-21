import type { BlockIR, Config, MarkdownDocument, OutlineNode, PresentationIR, SlideIR } from "../ir/types.js";
import { buildOutlineTree } from "../outline/buildOutlineTree.js";
import { calculateDensity } from "./density.js";
import { detectSlideIntent, countPrimaryItems } from "../intent/detectSlideIntent.js";
import { createStableId } from "../utils/stableId.js";

const MAX_TOC_ITEMS_PER_SLIDE = 14;

function flattenNodes(nodes: OutlineNode[]): OutlineNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);
}

function headingLevelFromConfig(value: "h1" | "h2" | "h3"): number {
  return Number(value.slice(1));
}

export function planPresentation(doc: MarkdownDocument, config: Config): PresentationIR {
  const outline = buildOutlineTree(doc);
  const allNodes = flattenNodes(outline);
  const slideLevel = headingLevelFromConfig(config.split.slide);
  const candidates = allNodes.filter((node) => node.level === slideLevel);

  const slides: SlideIR[] = [];

  if (config.split.cover === "first-h1") {
    const firstH1 = allNodes.find((n) => n.level === 1);
    if (firstH1) {
      const coverBase: Omit<SlideIR, "intent" | "tags"> = {
        id: createStableId(["cover", firstH1.title], "cover"),
        index: 1,
        role: "cover",
        title: firstH1.title,
        headingPath: firstH1.headingPath,
        source: firstH1.source ?? {},
        blocks: [],
      };
      slides.push({ ...coverBase, intent: "title", tags: ["auto-cover"] });
    }
  }

  if (config.toc.enabled && config.toc.position === "after-cover") {
    const tocTitle = tocTitleForLanguage(config.deck.language);
    const tocBlocks = candidates.map((n, i) => ({
      id: `toc-item-${i + 1}`,
      type: "listItem" as const,
      text: n.title,
    }));
    const tocChunks = chunkTocBlocks(tocBlocks);
    for (const [chunkIndex, blocks] of tocChunks.entries()) {
      const continuation = tocChunks.length > 1 ? `${chunkIndex + 1}/${tocChunks.length}` : undefined;
      const title = continuation && !continuation.startsWith("1/")
        ? `${tocTitle} (Cont. ${continuation})`
        : tocTitle;
      slides.push({
        id: createStableId(continuation ? ["toc", continuation] : ["toc"], "toc"),
        index: slides.length + 1,
        role: "toc",
        title,
        headingPath: [title],
        source: {},
        blocks,
        intent: "list",
        tags: continuation ? ["auto-toc", "auto-toc-continuation"] : ["auto-toc"],
        primaryItemCount: blocks.length,
        density: blocks.length,
      });
    }
  }

  for (const node of candidates) {
    const density = calculateDensity(node.blocks).total;
    const explicitChunks = splitBySlideBreak(node.blocks);
    const normalizedNode = explicitChunks.length === 1 ? { ...node, blocks: explicitChunks[0]! } : node;
    const forcedChunks = explicitChunks.length === 1 ? splitForcedContinuationBlocks(normalizedNode.blocks) : [];

    if (explicitChunks.length > 1) {
      for (const [chunkIndex, blocks] of explicitChunks.entries()) {
        slides.push(createContentSlide({ ...node, blocks }, slides.length + 1, undefined, `${chunkIndex + 1}/${explicitChunks.length}`));
      }
    } else if (shouldKeepCompactMixedEvidence(normalizedNode.blocks)) {
      slides.push(createContentSlide(normalizedNode, slides.length + 1));
    } else if (config.split.autosplit.enabled && density > config.split.autosplit.maxDensity && node.children.length > 1) {
      for (const child of node.children) {
        slides.push(createContentSlide(child, slides.length + 1, node.title));
      }
    } else if (forcedChunks.length > 1) {
      for (const [chunkIndex, blocks] of forcedChunks.entries()) {
        slides.push(createContentSlide({ ...normalizedNode, blocks }, slides.length + 1, undefined, `${chunkIndex + 1}/${forcedChunks.length}`));
      }
    } else if (config.split.autosplit.enabled && density > config.split.autosplit.maxDensity) {
      const chunks = splitBlocksIntoChunks(normalizedNode.blocks, config.split.autosplit.maxDensity);
      if (chunks.length > 1) {
        for (const [chunkIndex, blocks] of chunks.entries()) {
          slides.push(createContentSlide({ ...normalizedNode, blocks }, slides.length + 1, undefined, `${chunkIndex + 1}/${chunks.length}`));
        }
      } else {
        slides.push(createContentSlide(normalizedNode, slides.length + 1));
      }
    } else {
      slides.push(createContentSlide(normalizedNode, slides.length + 1));
    }
  }

  if (config.deck.presentationMode === "pipeline-one-page") {
    slides.splice(0, slides.length, createPipelineOnePageSlide(doc, config, slides));
  }

  slides.forEach((slide, idx) => {
    slide.index = idx + 1;
  });

  return {
    version: "1.0",
    meta: {
      title: doc.title ?? config.deck.title ?? "Untitled",
      language: config.deck.language,
      sourcePath: doc.sourcePath,
    },
    outline,
    slides,
    assets: [],
    diagnostics: [],
  };
}

function createPipelineOnePageSlide(doc: MarkdownDocument, config: Config, plannedSlides: SlideIR[]): SlideIR {
  const contentSlides = plannedSlides.filter((slide) => slide.role !== "cover" && slide.role !== "toc");
  const title = doc.title ?? config.deck.title ?? contentSlides[0]?.title ?? "Pipeline Overview";
  const source = contentSlides[0]?.source ?? {};
  const blocks = contentSlides.flatMap((slide, index) => [
    createSectionLabelBlock(slide, index),
    ...slide.blocks.filter((block) => block.type !== "slideBreak"),
  ]);
  const fallbackBlocks = plannedSlides.flatMap((slide) => slide.blocks.filter((block) => block.type !== "slideBreak"));
  const sourceBlocks = doc.blocks.filter((block) => block.type !== "heading" && block.type !== "slideBreak");
  const finalBlocks = blocks.length ? blocks : fallbackBlocks.length ? fallbackBlocks : sourceBlocks;
  const base: Omit<SlideIR, "intent" | "tags"> = {
    id: createStableId(["pipeline-one-page", title], "pipeline-one-page"),
    index: 1,
    role: "content",
    title,
    headingPath: [title],
    source,
    blocks: finalBlocks,
    primaryItemCount: countPrimaryItems(finalBlocks),
    density: calculateDensity(finalBlocks).total,
  };

  return {
    ...base,
    intent: "summary",
    tags: ["auto", "pipeline-one-page"],
  };
}

function createSectionLabelBlock(slide: SlideIR, index: number): BlockIR {
  const text = slide.title ?? `Section ${index + 1}`;
  return {
    id: `${slide.id}-one-page-section`,
    type: "paragraph",
    text,
    lines: [text],
    inlineRuns: [{ text, bold: true }],
    source: slide.source,
  };
}

function chunkTocBlocks<T>(blocks: T[]): T[][] {
  if (blocks.length <= MAX_TOC_ITEMS_PER_SLIDE) return [blocks];
  const chunks: T[][] = [];
  for (let index = 0; index < blocks.length; index += MAX_TOC_ITEMS_PER_SLIDE) {
    chunks.push(blocks.slice(index, index + MAX_TOC_ITEMS_PER_SLIDE));
  }
  return chunks;
}

function tocTitleForLanguage(language?: string): string {
  const normalized = (language ?? "").toLowerCase();
  if (normalized.startsWith("en")) return "Agenda";
  return "목차";
}

function createContentSlide(node: OutlineNode, index: number, section?: string, continuation?: string): SlideIR {
  const density = calculateDensity(node.blocks).total;
  const baseTitle = section ? `${section} — ${node.title}` : node.title;
  const title = continuation
    ? continuation.startsWith("1/") ? baseTitle : `${baseTitle} (Cont. ${continuation})`
    : baseTitle;
  const base: Omit<SlideIR, "intent" | "tags"> = {
    id: createStableId(continuation ? [...node.headingPath, continuation] : node.headingPath, node.id),
    index,
    role: "content",
    title,
    section,
    headingPath: node.headingPath,
    source: node.source ?? {},
    blocks: node.blocks,
    primaryItemCount: countPrimaryItems(node.blocks),
    density,
  };
  const intent = detectSlideIntent(base);
  return { ...base, intent, tags: continuation ? ["auto", "auto-sentence-split"] : ["auto"] };
}

function splitBlocksIntoChunks(blocks: SlideIR["blocks"], maxDensity: number): SlideIR["blocks"][] {
  const units = expandSentenceUnits(blocks);
  const chunks: SlideIR["blocks"][] = [];
  let current: SlideIR["blocks"] = [];
  let currentDensity = 0;

  for (const unit of units) {
    const unitDensity = calculateDensity([unit]).total;
    if (current.length && currentDensity + unitDensity > maxDensity) {
      chunks.push(current);
      current = [];
      currentDensity = 0;
    }
    current.push(unit);
    currentDensity += unitDensity;
  }

  if (current.length) chunks.push(current);
  return chunks;
}

function shouldKeepCompactMixedEvidence(blocks: SlideIR["blocks"]): boolean {
  const hasChart = blocks.some((block) => block.type === "chart");
  const hasTable = blocks.some((block) => block.type === "table");
  const hasImage = blocks.some((block) => block.type === "image");
  if (!hasChart || !hasTable || !hasImage) return false;

  const tableRows = Math.max(0, ...blocks.filter((block) => block.type === "table").map((block) => block.rows?.length ?? 0));
  const chartLabels = Math.max(0, ...blocks.filter((block) => block.type === "chart").map((block) => block.chart?.labels.length ?? 0));
  const listItems = blocks
    .filter((block) => block.type === "bulletList")
    .reduce((count, block) => count + (block.listItems?.length ?? block.items?.length ?? 0), 0);
  const paragraphText = blocks
    .filter((block) => block.type === "paragraph" || block.type === "quote")
    .reduce((length, block) => length + (block.text?.length ?? 0), 0);

  return tableRows <= 4 && chartLabels <= 4 && listItems <= 2 && paragraphText <= 120;
}

function splitForcedContinuationBlocks(blocks: SlideIR["blocks"]): SlideIR["blocks"][] {
  if (shouldSplitParagraphSequence(blocks)) {
    return splitParagraphSequence(blocks);
  }

  const listIndex = blocks.findIndex((block) => block.type === "bulletList" && shouldSplitListBlock(block));
  if (listIndex >= 0) {
    const listBlock = blocks[listIndex]!;
    const beforeList = blocks.slice(0, listIndex);
    const afterList = blocks.slice(listIndex + 1);
    const chunks = splitListBlock(listBlock);
    if (chunks.length <= 1) return [];
    return chunks.map((chunk, index) => [
      ...(index === 0 ? beforeList : []),
      chunk,
      ...(index === chunks.length - 1 ? afterList : []),
    ]);
  }

  if (blocks.length !== 1) return [];
  const [block] = blocks;

  if (block?.type === "code" && isShellLanguage(block.language)) {
    const lines = block.text?.split(/\r?\n/) ?? [];
    if (lines.length <= 4) return [];
    const chunks: SlideIR["blocks"][] = [];
    for (let index = 0; index < lines.length; index += 4) {
      chunks.push([{
        ...block,
        id: `${block.id}-chunk-${chunks.length + 1}`,
        text: lines.slice(index, index + 4).join("\n"),
      }]);
    }
    return chunks;
  }

  return [];
}

function shouldSplitParagraphSequence(blocks: SlideIR["blocks"]): boolean {
  if (blocks.length < 3 || !blocks.every((block) => block.type === "paragraph")) return false;

  const textLength = blocks.reduce((sum, block) => sum + (block.text?.length ?? 0), 0);
  const sentenceCount = blocks.reduce((sum, block) => sum + (block.sentences?.length ?? 1), 0);
  return textLength > 360 || sentenceCount >= 5;
}

function splitParagraphSequence(blocks: SlideIR["blocks"]): SlideIR["blocks"][] {
  const chunks: SlideIR["blocks"][] = [];
  for (let index = 0; index < blocks.length; index += 2) {
    chunks.push(blocks.slice(index, index + 2));
  }
  return chunks;
}

function shouldSplitListBlock(block: SlideIR["blocks"][number]): boolean {
  const itemCount = block.listItems?.length ?? block.items?.length ?? 0;
  if (itemCount > 6) return true;
  if (itemCount < 5) return false;

  const items = block.listItems?.length
    ? block.listItems.map((item) => `${item.label ?? ""} ${item.description ?? ""} ${item.text}`.trim())
    : block.items ?? [];
  return items.some((item) => item.length > 72 || item.includes("\n"));
}

function splitListBlock(block: SlideIR["blocks"][number]): SlideIR["blocks"][number][] {
  const items = block.items ?? [];
  const listItems = block.listItems ?? [];
  const itemCount = listItems.length || items.length;
  const chunkSize = itemCount === 5 && listItems.some((item) => item.description || item.text.length > 72) ? 3 : 4;
  const chunks: SlideIR["blocks"][number][] = [];

  for (let index = 0; index < itemCount; index += chunkSize) {
    const chunkListItems = listItems.slice(index, index + chunkSize);
    const chunkItems = items.length
      ? items.slice(index, index + chunkSize)
      : chunkListItems.map((item) => item.text);
    chunks.push({
      ...block,
      id: `${block.id}-chunk-${chunks.length + 1}`,
      items: chunkItems,
      listItems: chunkListItems,
    });
  }

  return chunks;
}

function isShellLanguage(language?: string): boolean {
  return ["bash", "sh", "shell", "powershell", "ps1", "zsh"].includes((language ?? "").toLowerCase());
}

function expandSentenceUnits(blocks: SlideIR["blocks"]): SlideIR["blocks"] {
  return blocks.flatMap((block) => {
    if (block.type !== "paragraph" || !block.sentences || block.sentences.length <= 1) return [block];
    return block.sentences.map((sentence, index) => ({
      ...block,
      id: `${block.id}-s${index + 1}`,
      text: sentence,
      lines: [sentence],
      sentences: [sentence],
    }));
  });
}

function splitBySlideBreak(blocks: SlideIR["blocks"]): SlideIR["blocks"][] {
  const chunks: SlideIR["blocks"][] = [[]];

  for (const block of blocks) {
    if (block.type === "slideBreak") {
      if (chunks[chunks.length - 1]!.length) chunks.push([]);
      continue;
    }
    chunks[chunks.length - 1]!.push(block);
  }

  return chunks.filter((chunk) => chunk.length > 0);
}
