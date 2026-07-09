import type { BlockIR, Config, Diagnostic, MarkdownDocument, OutlineNode, PresentationIR, SlideIR, SourceCleanupDiagnostic } from "../ir/types.js";
import { buildOutlineTree } from "../outline/buildOutlineTree.js";
import { calculateDensity } from "./density.js";
import { detectSlideIntentProfile, countPrimaryItems } from "../intent/detectSlideIntent.js";
import { createStableId } from "../utils/stableId.js";
import { buildCoherenceGroups } from "../coherence/buildCoherenceGroups.js";

const MAX_TOC_ITEMS_PER_SLIDE = 14;

type SplitOverride = NonNullable<Config["split"]["overrides"]>[number];

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
    const splitOverride = splitOverrideForNode(config, node);
    const density = calculateDensity(node.blocks).total;
    const explicitChunks = splitBySlideBreak(node.blocks);
    const normalizedNode = explicitChunks.length === 1 ? { ...node, blocks: explicitChunks[0]! } : node;
    const forcedChunks = explicitChunks.length === 1 ? splitForcedContinuationBlocks(normalizedNode.blocks) : [];
    const autosplitMaxDensity = splitOverride?.maxDensity ?? config.split.autosplit.maxDensity;
    const forceSingleSlide = splitOverride?.forceSingleSlide === true || splitOverride?.splitBy === "none";
    const headingSplitChildren = forceSingleSlide ? [] : headingSplitChildrenForOverride(splitOverride, node);

    if (explicitChunks.length > 1) {
      for (const [chunkIndex, blocks] of explicitChunks.entries()) {
        slides.push(createContentSlide({ ...node, blocks }, slides.length + 1, undefined, `${chunkIndex + 1}/${explicitChunks.length}`));
      }
    } else if (headingSplitChildren.length > 0) {
      for (const child of headingSplitChildren) {
        slides.push(createContentSlide(child, slides.length + 1, node.title));
      }
    } else if (shouldKeepCompactMixedEvidence(normalizedNode.blocks)) {
      slides.push(createContentSlide(normalizedNode, slides.length + 1));
    } else if (forceSingleSlide) {
      slides.push(createContentSlide(normalizedNode, slides.length + 1));
    } else if (config.split.autosplit.enabled && density > autosplitMaxDensity && node.children.length > 1) {
      for (const child of node.children) {
        slides.push(createContentSlide(child, slides.length + 1, node.title));
      }
    } else if (forcedChunks.length > 1) {
      for (const [chunkIndex, blocks] of forcedChunks.entries()) {
        slides.push(createContentSlide({ ...normalizedNode, blocks }, slides.length + 1, undefined, `${chunkIndex + 1}/${forcedChunks.length}`));
      }
    } else if (config.split.autosplit.enabled && density > autosplitMaxDensity) {
      const chunks = splitBlocksIntoChunks(normalizedNode.blocks, autosplitMaxDensity);
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
    coherenceGroups: buildCoherenceGroups(slides),
    assets: [],
    diagnostics: (doc.sourceCleanupDiagnostics ?? []).map(sourceCleanupDiagnosticToDiagnostic),
  };
}

function sourceCleanupDiagnosticToDiagnostic(diagnostic: SourceCleanupDiagnostic): Diagnostic {
  return {
    level: diagnostic.level,
    code: "SOURCE_CLEANUP_PARAGRAPH_MARKER",
    message: `Normalized paragraph marker "${diagnostic.originalMarker}" to "-" at source line ${diagnostic.line}.`,
    details: {
      sourceLine: diagnostic.line,
      originalMarker: diagnostic.originalMarker,
      normalizedMarker: diagnostic.normalizedMarker,
      action: diagnostic.action,
      reason: diagnostic.reason,
    },
  };
}

function splitOverrideForNode(config: Config, node: OutlineNode): SplitOverride | undefined {
  return config.split.overrides?.find((override) => {
    if (override.target.title && override.target.title === node.title) return true;
    if (override.target.headingPath && JSON.stringify(override.target.headingPath) === JSON.stringify(node.headingPath)) return true;
    return false;
  });
}

function headingSplitChildrenForOverride(splitOverride: SplitOverride | undefined, node: OutlineNode): OutlineNode[] {
  const targetLevel = headingLevelFromSplitOverride(splitOverride);
  if (!targetLevel) return [];
  return flattenNodes(node.children).filter((child) => child.level === targetLevel);
}

function headingLevelFromSplitOverride(splitOverride: SplitOverride | undefined): number | undefined {
  if (!splitOverride?.splitBy) return undefined;
  if (splitOverride.splitBy === "h2" || splitOverride.splitBy === "h3" || splitOverride.splitBy === "h4") {
    return Number(splitOverride.splitBy.slice(1));
  }
  return undefined;
}

function createPipelineOnePageSlide(doc: MarkdownDocument, config: Config, plannedSlides: SlideIR[]): SlideIR {
  const contentSlides = plannedSlides.filter((slide) => slide.role !== "cover" && slide.role !== "toc");
  const title = doc.title ?? config.deck.title ?? contentSlides[0]?.title ?? "Pipeline Overview";
  const source = contentSlides[0]?.source ?? {};
  const id = createStableId(["pipeline-one-page", title], "pipeline-one-page");
  const blocks = createPipelineTeaserBlocks(id, contentSlides);
  const fallbackBlocks = plannedSlides.flatMap((slide) => slide.blocks.filter((block) => block.type !== "slideBreak"));
  const sourceBlocks = doc.blocks.filter((block) => block.type !== "heading" && block.type !== "slideBreak");
  const finalBlocks = blocks.length ? blocks : fallbackBlocks.length ? fallbackBlocks : sourceBlocks;
  const base: Omit<SlideIR, "intent" | "tags"> = {
    id,
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
    tags: ["auto", "pipeline-one-page", ...createPipelineTeaserTags(contentSlides, finalBlocks)],
  };
}

function createPipelineTeaserBlocks(teaserSlideId: string, contentSlides: SlideIR[]): BlockIR[] {
  if (!contentSlides.length) return [];

  const allBlocks = contentSlides.flatMap((slide) => slide.blocks.filter((block) => block.type !== "slideBreak"));
  const overview = createTeaserOverviewBlock(teaserSlideId, contentSlides);
  const diagram = firstBlockOfType(allBlocks, "diagram");
  const chart = firstBlockOfType(allBlocks, "chart");
  const table = firstBlockOfType(allBlocks, "table");
  const image = firstBlockOfType(allBlocks, "image");
  const selected = [
    diagram,
    overview,
    chart,
    table,
    image,
  ].filter((block): block is BlockIR => Boolean(block));

  if (selected.length > 1 || !allBlocks.length) return selected;
  return selected.length ? selected : allBlocks.slice(0, 4);
}

function createTeaserOverviewBlock(teaserSlideId: string, contentSlides: SlideIR[]): BlockIR {
  const listItems = contentSlides.slice(0, 4).map((slide, index) => {
    const label = cleanTeaserText(slide.title ?? `Step ${index + 1}`) || `Step ${index + 1}`;
    const description = truncateTeaserText(summarizeSlideForTeaser(slide), 92);
    const text = description ? `${label}: ${description}` : label;
    return {
      text,
      level: 0,
      ordered: false,
      label,
      description,
    };
  });

  return {
    id: `${teaserSlideId}-teaser-overview`,
    type: "bulletList",
    items: listItems.map((item) => item.text),
    listItems,
    listKind: "unordered",
    source: contentSlides[0]?.source,
  };
}

function createPipelineTeaserTags(contentSlides: SlideIR[], selectedBlocks: BlockIR[]): string[] {
  if (!contentSlides.length) return ["teaser-source:h1-fallback"];

  const allBlocks = contentSlides.flatMap((slide) => slide.blocks.filter((block) => block.type !== "slideBreak"));
  const overview = selectedBlocks.find((block) => block.id.endsWith("-teaser-overview"));
  const overviewItems = overview?.listItems ?? [];
  const selectedProofKinds = ["diagram", "chart", "table", "image"].filter((type) =>
    selectedBlocks.some((block) => block.type === type)
  );
  const tags = [
    `teaser-sections:${contentSlides.length}`,
    `teaser-sections-selected:${overviewItems.length}`,
    `teaser-sections-omitted:${Math.max(0, contentSlides.length - overviewItems.length)}`,
    `teaser-proofs:${selectedProofKinds.length ? selectedProofKinds.join("+") : "none"}`,
    `teaser-truncated:${overviewItems.filter((item) => item.description?.endsWith("...")).length}`,
    "teaser-proof-priority:first-by-type-source-order",
  ];

  for (const kind of ["diagram", "chart", "table", "image"]) {
    const total = allBlocks.filter((block) => block.type === kind).length;
    const selected = selectedBlocks.filter((block) => block.type === kind).length;
    if (total > selected) tags.push(`teaser-proof-omitted:${kind}:${total - selected}`);
  }

  return tags;
}

function summarizeSlideForTeaser(slide: SlideIR): string {
  const primary = slide.blocks.find((block) => block.type !== "slideBreak");
  if (!primary) return "Section summary.";

  if (primary.type === "diagram") {
    const labels = primary.diagram?.nodes.map((node) => node.label).filter(Boolean).slice(0, 4) ?? [];
    return labels.length ? labels.join(" -> ") : "Pipeline diagram.";
  }

  if (primary.type === "bulletList") {
    const firstItem = primary.listItems?.[0];
    if (firstItem) return cleanTeaserText(`${firstItem.label ?? ""} ${firstItem.description ?? firstItem.text}`.trim());
    return cleanTeaserText(primary.items?.[0] ?? "Feature summary.");
  }

  if (primary.type === "chart") {
    const labels = primary.chart?.labels.slice(0, 3).join(", ");
    return labels ? `Chart signal: ${labels}.` : "Chart signal.";
  }

  if (primary.type === "table") {
    const headers = primary.rows?.[0]?.filter(Boolean).slice(0, 3).join(" / ");
    return headers ? `Table proof: ${headers}.` : "Table proof.";
  }

  if (primary.type === "image") return cleanTeaserText(primary.alt ? `Image proof: ${primary.alt}.` : "Image proof.");
  if (primary.type === "code") return cleanTeaserText(primary.lines?.[0] ?? primary.text ?? "Code proof.");
  if (primary.type === "quote") return cleanTeaserText(primary.text ?? "Quoted evidence.");
  return cleanTeaserText(primary.sentences?.[0] ?? primary.text ?? "Section summary.");
}

function firstBlockOfType(blocks: BlockIR[], type: BlockIR["type"]): BlockIR | undefined {
  return blocks.find((block) => block.type === type);
}

function cleanTeaserText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateTeaserText(value: string, maxLength: number): string {
  const cleaned = cleanTeaserText(value);
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
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
  return "Agenda";
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
  const intentProfile = detectSlideIntentProfile(base);
  return {
    ...base,
    intent: intentProfile.primaryIntent,
    intentScores: intentProfile.scores,
    secondaryIntents: intentProfile.secondaryIntents,
    tags: continuation ? ["auto", "auto-sentence-split"] : ["auto"],
  };
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
  if (!hasImage || (!hasChart && !hasTable)) return false;

  const tableRows = Math.max(0, ...blocks.filter((block) => block.type === "table").map((block) => block.rows?.length ?? 0));
  const chartLabels = Math.max(0, ...blocks.filter((block) => block.type === "chart").map((block) => block.chart?.labels.length ?? 0));
  const listItems = blocks
    .filter((block) => block.type === "bulletList")
    .reduce((count, block) => count + (block.listItems?.length ?? block.items?.length ?? 0), 0);
  const paragraphText = blocks
    .filter((block) => block.type === "paragraph" || block.type === "quote")
    .reduce((length, block) => length + (block.text?.length ?? 0), 0);

  return tableRows <= 4 && chartLabels <= 4 && listItems <= 3 && paragraphText <= 120;
}

function splitForcedContinuationBlocks(blocks: SlideIR["blocks"]): SlideIR["blocks"][] {
  if (shouldSplitParagraphSequence(blocks)) {
    return splitParagraphSequence(blocks);
  }

  const tableIndex = blocks.findIndex((block) => block.type === "table" && shouldSplitTableBlock(block));
  if (tableIndex >= 0) {
    const tableBlock = blocks[tableIndex]!;
    const beforeTable = blocks.slice(0, tableIndex);
    const afterTable = blocks.slice(tableIndex + 1);
    const chunks = splitTableBlock(tableBlock);
    if (chunks.length <= 1) return [];
    return chunks.map((chunk, index) => [
      ...(index === 0 ? beforeTable : []),
      chunk,
      ...(index === chunks.length - 1 ? afterTable : []),
    ]);
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

  const items = block.listItems?.length
    ? block.listItems.map((item) => `${item.label ?? ""} ${item.description ?? ""} ${item.text}`.trim())
    : block.items ?? [];
  if (itemCount === 4) return items.some((item) => item.length > 220 || item.includes("\n"));
  if (itemCount < 5) return false;
  return items.some((item) => item.length > 72 || item.includes("\n"));
}

function splitListBlock(block: SlideIR["blocks"][number]): SlideIR["blocks"][number][] {
  const items = block.items ?? [];
  const listItems = block.listItems ?? [];
  const itemCount = listItems.length || items.length;
  const itemTexts = listItems.length ? listItems.map((item) => `${item.label ?? ""} ${item.description ?? ""} ${item.text}`.trim()) : items;
  const chunkSize = itemTexts.some((item) => item.length > 220 || item.includes("\n"))
    ? 2
    : itemCount === 5 && listItems.some((item) => item.description || item.text.length > 72) ? 3 : 4;
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

function shouldSplitTableBlock(block: SlideIR["blocks"][number]): boolean {
  return (block.rows?.length ?? 0) > 7;
}

function splitTableBlock(block: SlideIR["blocks"][number]): SlideIR["blocks"][number][] {
  const rows = block.rows ?? [];
  if (rows.length <= 7) return [block];
  const [header, ...dataRows] = rows;
  const chunks: SlideIR["blocks"][number][] = [];

  for (let index = 0; index < dataRows.length; index += 6) {
    chunks.push({
      ...block,
      id: `${block.id}-chunk-${chunks.length + 1}`,
      rows: [header ?? [], ...dataRows.slice(index, index + 6)],
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
