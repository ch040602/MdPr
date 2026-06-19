import type { Config, MarkdownDocument, OutlineNode, PresentationIR, SlideIR } from "../ir/types.js";
import { buildOutlineTree } from "../outline/buildOutlineTree.js";
import { calculateDensity } from "./density.js";
import { detectSlideIntent, countPrimaryItems } from "../intent/detectSlideIntent.js";
import { createStableId } from "../utils/stableId.js";

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
    const tocBlocks = candidates.map((n, i) => ({
      id: `toc-item-${i + 1}`,
      type: "listItem" as const,
      text: n.title,
    }));
    slides.push({
      id: createStableId(["toc"], "toc"),
      index: slides.length + 1,
      role: "toc",
      title: "목차",
      headingPath: ["목차"],
      source: {},
      blocks: tocBlocks,
      intent: "list",
      tags: ["auto-toc"],
      primaryItemCount: tocBlocks.length,
      density: tocBlocks.length,
    });
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
  if (itemCount > 5) return true;
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
