import type { CoherenceGroup, Config, PresentationIR, SlideIR } from "@mdpresent/core";
import type { LayoutCandidateScore, LayoutIR, LayoutRegion, LayoutSlide, LayoutSpec, ScoredLayoutCandidate, ThemeTokens } from "./ir/types.js";
import { chooseItemLayout, titleRect, bodyRect } from "./presets/presets.js";

export function planLayout(presentation: PresentationIR, config: Config): LayoutIR {
  const theme: ThemeTokens = {
    fontFamily: config.typography.fontFamily,
    designPreset: config.theme.designPreset ?? config.pptx.designPreset,
    decorationStyle: config.theme.decorationStyle ?? config.theme.designPreset ?? config.pptx.designPreset,
    colorCombination: config.theme.colorCombination,
    colorSeed: config.theme.colorSeed ?? config.theme.primaryColor,
    backgroundColor: config.theme.backgroundColor,
    textColor: config.theme.textColor,
    primaryColor: config.theme.primaryColor,
    titleFontSize: config.typography.titleFontSize,
    bodyFontSize: config.typography.bodyFontSize,
    captionFontSize: config.typography.captionFontSize,
    minFontSize: config.typography.minFontSize,
    lineHeight: config.typography.lineHeight,
  };

  return {
    version: "1.0",
    slideSize: config.deck.ratio === "4:3" ? { width: 10, height: 7.5, unit: "in" } : { width: 13.333, height: 7.5, unit: "in" },
    theme,
    slides: planSlidesWithContinuity(presentation, config),
    diagnostics: [...presentation.diagnostics],
  };
}

export function chooseLayout(slide: SlideIR, config: Config, coherenceGroup?: CoherenceGroup, previousPresetInSection?: string): LayoutSpec {
  return rankLayoutCandidates(slide, config, coherenceGroup, previousPresetInSection)[0]?.layout ?? { preset: config.layout.defaultPreset as LayoutSpec["preset"] };
}

export function rankLayoutCandidates(slide: SlideIR, config: Config, coherenceGroup?: CoherenceGroup, previousPresetInSection?: string): ScoredLayoutCandidate[] {
  return candidateLayoutsForSlide(slide, config)
    .map((layout) => ({ layout, score: scoreLayoutCandidate(slide, layout, config, coherenceGroup, previousPresetInSection) }))
    .sort((a, b) => a.score.total - b.score.total || layoutOrder(a.layout.preset) - layoutOrder(b.layout.preset));
}

function candidateLayoutsForSlide(slide: SlideIR, config: Config): LayoutSpec[] {
  if (slide.role === "cover") return [{ preset: "cover" }];
  if (slide.role === "toc") return [{ preset: "toc" }];
  if (slide.tags.includes("pipeline-one-page")) return [{ preset: "pipeline-one-page" }];
  const candidates: LayoutSpec[] = [];
  const add = (layout: LayoutSpec) => {
    if (!candidates.some((candidate) => JSON.stringify(candidate) === JSON.stringify(layout))) candidates.push(layout);
  };

  if (slide.intent === "comparison") add({ preset: "comparison", direction: "horizontal", columns: 2 });
  if (slide.intent === "evidence") for (const layout of evidenceLayouts(slide)) add(layout);
  if (slide.intent === "metric") for (const layout of metricLayouts(slide)) add(layout);
  if (slide.intent === "chart") add({ preset: "chart-table", direction: "horizontal" });
  if (slide.intent === "table") add({ preset: "table-focus" });
  if (slide.intent === "image") add({ preset: "image-focus" });
  if (slide.intent === "code") add({ preset: "code-focus" });
  if (slide.intent === "quote") {
    const nonQuoteBlocks = slide.blocks.filter((block) => block.type !== "quote" && block.type !== "slideBreak");
    add({ preset: nonQuoteBlocks.length ? "key-message" : "quote" });
  }
  if (slide.intent === "timeline") add({ preset: "timeline", direction: "horizontal" });
  if (slide.intent === "diagram") add({ preset: "pipeline", direction: "horizontal" });
  if (isTwoParagraphOpenLayout(slide)) add({ preset: "comparison", direction: "horizontal", columns: 2 });
  if (isTextOnlyReliefCandidate(slide)) add({ preset: "text-icon-aside" });

  const itemCount = slide.primaryItemCount ?? 0;
  if (itemCount > 0) add(chooseItemLayout(itemCount));

  add({ preset: config.layout.defaultPreset as LayoutSpec["preset"] });
  add({ preset: "vertical-list" });
  if (hasAny(slide, "table")) add({ preset: "table-focus" });
  if (hasAny(slide, "image")) add({ preset: "image-focus" });
  if (hasAny(slide, "chart") || (hasAny(slide, "table") && (hasAny(slide, "image") || hasText(slide)))) add({ preset: "chart-table", direction: "horizontal" });
  return candidates;
}

function evidenceLayouts(slide: SlideIR): LayoutSpec[] {
  const hasChart = slide.blocks.some((block) => block.type === "chart");
  const hasTable = slide.blocks.some((block) => block.type === "table");
  const hasImage = slide.blocks.some((block) => block.type === "image");
  return [
    ...(hasChart || (hasTable && hasImage) ? [{ preset: "chart-table" as const, direction: "horizontal" as const }] : []),
    ...(hasTable ? [{ preset: "table-focus" as const }] : []),
    ...(hasImage ? [{ preset: "image-focus" as const }] : []),
    { preset: "vertical-list" as const },
  ];
}

function metricLayouts(slide: SlideIR): LayoutSpec[] {
  if (slide.blocks.some((block) => block.type === "chart" || block.type === "table")) return [{ preset: "chart-table", direction: "horizontal" }, { preset: "table-focus" }];
  return [{ preset: "vertical-list" }];
}

function scoreLayoutCandidate(
  slide: SlideIR,
  layout: LayoutSpec,
  config: Config,
  coherenceGroup?: CoherenceGroup,
  previousPresetInSection?: string,
): LayoutCandidateScore {
  const objectCoveragePenalty = objectCoveragePenaltyFor(slide, layout);
  const semanticGroupPenalty = semanticGroupPenaltyFor(slide, layout, coherenceGroup);
  const readingOrderPenalty = readingOrderPenaltyFor(slide, layout);
  const whitespacePenalty = whitespacePenaltyFor(slide, layout);
  const emphasisPenalty = emphasisPenaltyFor(slide, layout);
  const minFontPenalty = layout.preset === "grid" && (slide.primaryItemCount ?? 0) > 6 ? Math.max(0, config.typography.minFontSize - 14) : 0;
  const overflowPenalty = roughOverflowPenaltyFor(slide, layout);
  const alignmentPenalty = ["grid", "vertical-list", "chart-table", "table-focus", "image-focus", "comparison"].includes(layout.preset) ? 0 : 1;
  const sectionConsistencyPenalty = sectionConsistencyPenaltyFor(layout, previousPresetInSection);
  const total = overflowPenalty + minFontPenalty + objectCoveragePenalty + semanticGroupPenalty + readingOrderPenalty + whitespacePenalty + alignmentPenalty + emphasisPenalty + sectionConsistencyPenalty;
  return { overflowPenalty, minFontPenalty, objectCoveragePenalty, semanticGroupPenalty, readingOrderPenalty, whitespacePenalty, alignmentPenalty, emphasisPenalty, sectionConsistencyPenalty, total };
}

function objectCoveragePenaltyFor(slide: SlideIR, layout: LayoutSpec): number {
  const required = ["chart", "table", "image", "code", "diagram"].filter((type) => hasAny(slide, type));
  if (!required.length) return 0;
  const covered = required.filter((type) => layoutCoversObject(layout, type)).length;
  return (required.length - covered) * 8;
}

function layoutCoversObject(layout: LayoutSpec, type: string): boolean {
  if (type === "chart") return layout.preset === "chart-table";
  if (type === "table") return layout.preset === "chart-table" || layout.preset === "table-focus";
  if (type === "image") return layout.preset === "chart-table" || layout.preset === "image-focus";
  if (type === "code") return layout.preset === "code-focus";
  if (type === "diagram") return layout.preset === "pipeline";
  return true;
}

function readingOrderPenaltyFor(slide: SlideIR, layout: LayoutSpec): number {
  if (slide.intent === "evidence" && hasText(slide) && layout.preset === "image-focus") return 3;
  return 0;
}

function semanticGroupPenaltyFor(slide: SlideIR, layout: LayoutSpec, group?: CoherenceGroup): number {
  if (!group) return 0;
  const roles = Object.values(group.blockRoles ?? {});
  const hasCaption = roles.includes("caption");
  if (group.role === "workflow" && layout.preset !== "pipeline") return 10;
  if (group.role === "evidence-pack") {
    const objectCount = ["chart", "table", "image"].filter((type) => hasAny(slide, type)).length;
    if (objectCount >= 2 && layout.preset !== "chart-table") return 8;
    if (hasAny(slide, "table") && layout.preset === "image-focus") return 6;
    if (hasAny(slide, "image") && layout.preset === "table-focus") return 4;
  }
  if (hasCaption && ["vertical-list", "title-body"].includes(layout.preset)) return 4;
  return 0;
}

function sectionConsistencyPenaltyFor(layout: LayoutSpec, previousPresetInSection?: string): number {
  if (!previousPresetInSection) return 0;
  if (previousPresetInSection === layout.preset) return 0;
  return layoutFamily(previousPresetInSection) === layoutFamily(layout.preset) ? 1 : 3;
}

function layoutFamily(preset: string): string {
  if (["chart-table", "table-focus", "image-focus", "image-left", "image-right"].includes(preset)) return "evidence";
  if (["grid", "vertical-list", "pentagon", "comparison", "text-icon-aside"].includes(preset)) return "list";
  if (["pipeline", "pipeline-one-page"].includes(preset)) return "workflow";
  if (["key-message", "quote"].includes(preset)) return "message";
  return preset;
}

function whitespacePenaltyFor(slide: SlideIR, layout: LayoutSpec): number {
  const objectCount = ["chart", "table", "image", "code", "diagram"].filter((type) => hasAny(slide, type)).length;
  if (objectCount >= 2 && ["vertical-list", "title-body"].includes(layout.preset)) return 5;
  return 0;
}

function emphasisPenaltyFor(slide: SlideIR, layout: LayoutSpec): number {
  if (slide.intent === "evidence" && layout.preset === "table-focus" && hasAny(slide, "image")) return 2;
  if ((slide.primaryItemCount ?? 0) >= 5 && (slide.primaryItemCount ?? 0) <= 6 && layout.preset === "vertical-list") return 3;
  if (slide.intent === "quote" && layout.preset !== "key-message" && layout.preset !== "quote") return 4;
  if (isTwoParagraphOpenLayout(slide) && layout.preset !== "comparison") return 3;
  if (isTextOnlyReliefCandidate(slide) && layout.preset !== "text-icon-aside") return 3;
  return 0;
}

function roughOverflowPenaltyFor(slide: SlideIR, layout: LayoutSpec): number {
  const textLength = slide.blocks.reduce((sum, block) => sum + (block.text?.length ?? 0) + (block.items ?? []).join(" ").length, 0);
  if (textLength > 420 && ["title-body", "vertical-list"].includes(layout.preset)) return 6;
  return 0;
}

function hasAny(slide: SlideIR, type: string): boolean {
  return slide.blocks.some((block) => block.type === type);
}

function hasText(slide: SlideIR): boolean {
  return slide.blocks.some((block) => ["paragraph", "bulletList", "quote"].includes(block.type));
}

function layoutOrder(preset: string): number {
  const order = [
    "cover",
    "toc",
    "pipeline-one-page",
    "chart-table",
    "pipeline",
    "key-message",
    "quote",
    "text-icon-aside",
    "table-focus",
    "image-focus",
    "code-focus",
    "comparison",
    "pentagon",
    "grid",
    "vertical-list",
    "title-body",
  ];
  const index = order.indexOf(preset);
  return index >= 0 ? index : 999;
}

function isTwoParagraphOpenLayout(slide: SlideIR): boolean {
  if (slide.intent !== "standard" || slide.blocks.length !== 2) return false;
  if (!slide.blocks.every((block) => block.type === "paragraph")) return false;
  const totalLength = slide.blocks.reduce((sum, block) => sum + (block.text?.length ?? 0), 0);
  return totalLength > 180;
}

function isTextOnlyReliefCandidate(slide: SlideIR): boolean {
  if (slide.intent !== "standard") return false;
  if (!slide.blocks.length) return false;
  if (slide.blocks.some((block) => ["table", "chart", "image", "code", "diagram", "quote"].includes(block.type))) return false;
  const textLength = slide.blocks.reduce((sum, block) => sum + (block.text?.length ?? 0), 0);
  return textLength >= 120;
}

function planSlidesWithContinuity(presentation: PresentationIR, config: Config): LayoutSlide[] {
  const groupsBySlideId = new Map((presentation.coherenceGroups ?? []).map((group) => [group.slideId, group]));
  const previousPresetBySection = new Map<string, string>();
  return presentation.slides.map((slide) => {
    const sectionKey = sectionKeyForSlide(slide);
    const previousPreset = sectionKey ? previousPresetBySection.get(sectionKey) : undefined;
    const layoutSlide = planSlideLayout(slide, config, groupsBySlideId.get(slide.id), previousPreset);
    if (sectionKey && slide.role === "content") previousPresetBySection.set(sectionKey, layoutSlide.layout.preset);
    return layoutSlide;
  });
}

function sectionKeyForSlide(slide: SlideIR): string | undefined {
  if (slide.section) return slide.section;
  if (slide.headingPath.length > 2) return slide.headingPath.slice(0, -1).join(" / ");
  return undefined;
}

function planSlideLayout(slide: SlideIR, config: Config, coherenceGroup?: CoherenceGroup, previousPresetInSection?: string): LayoutSlide {
  const layout = chooseLayout(slide, config, coherenceGroup, previousPresetInSection);
  return planSlideLayoutWithSpec(slide, config, layout);
}

export function planSlideLayoutWithSpec(slide: SlideIR, config: Config, layout: LayoutSpec): LayoutSlide {
  const regions = createRegionsForLayout(slide, layout, config);

  return {
    id: `layout-${slide.id}`,
    sourceSlideId: slide.id,
    index: slide.index,
    layout,
    background: {
      color: config.theme.backgroundColor,
      useTemplateBackground: config.pptx.useTemplateBackground,
    },
    regions,
    overflowPolicy: {
      action: config.layout.overflow.defaultAction,
      minFontSize: config.layout.overflow.minFontSize,
      maxShrinkSteps: config.layout.overflow.maxShrinkSteps,
    },
  };
}

function createRegionsForLayout(slide: SlideIR, layout: LayoutSpec, config: Config): LayoutRegion[] {
  const titleRegion: LayoutRegion = {
    id: "title",
    role: "title",
    blockIds: slide.title ? [titleBlockId(slide.id)] : [],
    ...titleRegionRect(slide),
    zIndex: 10,
    typography: {
      fontFamily: config.typography.fontFamily,
      fontSize: titleFontSize(slide, config),
      fontWeight: "bold",
      lineHeight: config.typography.lineHeight,
      minFontSize: config.typography.minFontSize,
    },
  };

  const firstList = slide.blocks.find((b) => b.type === "bulletList");
  const primaryItemBlockIds = firstList ? (firstList.items ?? []).map((_, idx) => `${firstList.id}#${idx}`) : [];
  const itemBlockIds = primaryItemBlockIds.length
    ? primaryItemBlockIds
    : slide.blocks.flatMap((b) => b.type === "bulletList" ? (b.items ?? []).map((_, idx) => `${b.id}#${idx}`) : [b.id]);
  const imageBlockIds = slide.blocks.filter((b) => b.type === "image").map((b) => b.id);
  const textBlockIds = itemBlockIds.filter((blockId) => !imageBlockIds.includes(blockId.split("#")[0]!));

  if (layout.preset === "cover") {
    return [titleRegion];
  }

  if (layout.preset === "toc") {
    return createTocRegions(slide, titleRegion, config);
  }

  if (layout.preset === "quote" || layout.preset === "key-message") {
    return createKeyMessageRegions(slide, titleRegion, config);
  }

  if (layout.preset === "image-focus" && imageBlockIds.length) {
    return createImageAwareRegions(titleRegion, textBlockIds, imageBlockIds, config);
  }

  if (layout.preset === "comparison") {
    return [
      titleRegion,
      { id: "left", role: "body", blockIds: itemBlockIds.slice(0, Math.ceil(itemBlockIds.length / 2)), x: 0.9, y: 1.7, w: 5.4, h: 4.8, zIndex: 10, typography: bodyTypography(config) },
      { id: "right", role: "body", blockIds: itemBlockIds.slice(Math.ceil(itemBlockIds.length / 2)), x: 7.0, y: 1.7, w: 5.4, h: 4.8, zIndex: 10, typography: bodyTypography(config) },
    ];
  }

  if (layout.preset === "grid" && layout.columns === 2 && layout.rows === 2) {
    return [
      titleRegion,
      { id: "item-1", role: "item", blockIds: itemBlockIds.slice(0, 1), x: 0.9, y: 1.6, w: 5.5, h: 2.1, zIndex: 10, typography: bodyTypography(config) },
      { id: "item-2", role: "item", blockIds: itemBlockIds.slice(1, 2), x: 6.9, y: 1.6, w: 5.5, h: 2.1, zIndex: 10, typography: bodyTypography(config) },
      { id: "item-3", role: "item", blockIds: itemBlockIds.slice(2, 3), x: 0.9, y: 4.1, w: 5.5, h: 2.1, zIndex: 10, typography: bodyTypography(config) },
      { id: "item-4", role: "item", blockIds: itemBlockIds.slice(3, 4), x: 6.9, y: 4.1, w: 5.5, h: 2.1, zIndex: 10, typography: bodyTypography(config) },
    ];
  }

  if (layout.preset === "grid" && layout.columns === 3 && layout.rows === 2) {
    const cells = [
      { x: 0.9, y: 1.6 },
      { x: 4.75, y: 1.6 },
      { x: 8.6, y: 1.6 },
      { x: 0.9, y: 4.1 },
      { x: 4.75, y: 4.1 },
      { x: 8.6, y: 4.1 },
    ];
    return [
      titleRegion,
      ...cells.map((cell, index) => ({
        id: `item-${index + 1}`,
        role: "item" as const,
        blockIds: itemBlockIds.slice(index, index + 1),
        x: cell.x,
        y: cell.y,
        w: 3.55,
        h: 2.1,
        zIndex: 10,
        typography: compactBodyTypography(config),
      })),
    ];
  }

  if (layout.preset === "vertical-list") {
    return createVerticalListRegions(itemBlockIds, titleRegion, config);
  }

  if (layout.preset === "text-icon-aside") {
    return [
      titleRegion,
      { id: "body-panel", role: "body", blockIds: slide.blocks.filter((block) => block.type !== "slideBreak").map((block) => block.id), x: 0.9, y: 1.72, w: 8.85, h: 3.62, zIndex: 10, typography: bodyTypography(config) },
      { id: "icon-aside", role: "icon", blockIds: [], x: 10.38, y: 2.36, w: 0.72, h: 0.72, zIndex: 8 },
    ];
  }

  if (layout.preset === "pentagon") {
    return [
      titleRegion,
      { id: "item-1", role: "item", blockIds: itemBlockIds.slice(0, 1), x: 5.1, y: 1.4, w: 3.0, h: 1.2, zIndex: 10, typography: bodyTypography(config) },
      { id: "item-2", role: "item", blockIds: itemBlockIds.slice(1, 2), x: 8.4, y: 2.8, w: 3.0, h: 1.2, zIndex: 10, typography: bodyTypography(config) },
      { id: "item-3", role: "item", blockIds: itemBlockIds.slice(2, 3), x: 7.1, y: 5.0, w: 3.0, h: 1.2, zIndex: 10, typography: bodyTypography(config) },
      { id: "item-4", role: "item", blockIds: itemBlockIds.slice(3, 4), x: 3.2, y: 5.0, w: 3.0, h: 1.2, zIndex: 10, typography: bodyTypography(config) },
      { id: "item-5", role: "item", blockIds: itemBlockIds.slice(4, 5), x: 1.9, y: 2.8, w: 3.0, h: 1.2, zIndex: 10, typography: bodyTypography(config) },
    ];
  }

  if (layout.preset === "pipeline") {
    return [
      titleRegion,
      { id: "diagram", role: "diagram", blockIds: slide.blocks.filter((b) => b.type === "diagram").map((b) => b.id), x: 0.7, y: 1.32, w: 11.95, h: 5.75, zIndex: 10, typography: bodyTypography(config) },
    ];
  }

  if (layout.preset === "pipeline-one-page") {
    return createPipelineOnePageRegions(slide, titleRegion, config);
  }

  if (layout.preset === "chart-table") {
    return createChartTableRegions(slide, titleRegion, config);
  }

  if (layout.preset === "table-focus") {
    return createTableFocusRegions(slide, titleRegion, config);
  }

  if (layout.preset === "code-focus") {
    return [
      titleRegion,
      { id: "code", role: "code", blockIds: slide.blocks.filter((b) => b.type === "code").map((b) => b.id), x: 0.85, y: 1.55, w: 11.65, h: 5.25, zIndex: 10, typography: codeTypography(config) },
    ];
  }

  return [
    titleRegion,
    { id: "body", role: "body", blockIds: slide.blocks.map((b) => b.id), ...bodyRect, zIndex: 10, typography: bodyTypography(config) },
  ];
}

function createPipelineOnePageRegions(slide: SlideIR, titleRegion: LayoutRegion, config: Config): LayoutRegion[] {
  const diagramBlockIds = slide.blocks.filter((block) => block.type === "diagram").map((block) => block.id);
  const chartBlockIds = slide.blocks.filter((block) => block.type === "chart").map((block) => block.id);
  const tableBlockIds = slide.blocks.filter((block) => block.type === "table").map((block) => block.id);
  const imageBlockIds = slide.blocks.filter((block) => block.type === "image").map((block) => block.id);
  const bulletBlockIds = slide.blocks.filter((block) => block.type === "bulletList").map((block) => block.id);
  const sectionLabelIds = new Set(slide.blocks
    .filter((block) => block.type === "paragraph" && block.id.endsWith("-one-page-section"))
    .map((block) => block.id));
  const evidenceBlockIds = [...chartBlockIds.slice(0, 2), ...tableBlockIds.slice(0, 1), ...imageBlockIds.slice(0, 1)];
  const evidenceSet = new Set(evidenceBlockIds);
  const textBlockIds = slide.blocks
    .filter((block) => !["diagram", "chart", "table", "image", "slideBreak"].includes(block.type) && !sectionLabelIds.has(block.id))
    .map((block) => block.id);
  const featureBlockIds = bulletBlockIds.length ? bulletBlockIds.slice(0, 1) : textBlockIds.slice(0, 4);
  const compact = compactBodyTypography(config);

  if (diagramBlockIds.length) {
    return [
      { ...titleRegion, y: 0.34, h: 0.66, typography: { ...titleRegion.typography, fontSize: Math.max(28, config.typography.titleFontSize - 2) } },
      { id: "diagram", role: "diagram", blockIds: diagramBlockIds.slice(0, 1), x: 0.72, y: 1.16, w: 6.9, h: 2.08, zIndex: 10, typography: compact },
      { id: "feature-summary", role: "body", blockIds: featureBlockIds, x: 0.72, y: 3.45, w: 6.9, h: 3.18, zIndex: 10, typography: { ...compact, fontSize: 14, minFontSize: 14 } },
      ...(chartBlockIds.length ? [{ id: "chart", role: "chart" as const, blockIds: chartBlockIds.slice(0, 1), x: 8.02, y: 1.16, w: 4.55, h: 2.2, zIndex: 10, typography: compact }] : []),
      ...(tableBlockIds.length ? [{ id: "table", role: "table" as const, blockIds: tableBlockIds.slice(0, 1), x: 8.02, y: 3.72, w: 4.55, h: 2.72, zIndex: 10, typography: { ...compact, fontSize: Math.max(14, compact.fontSize - 2), minFontSize: 14 } }] : []),
      {
        id: "object-summary",
        role: "body",
        blockIds: textBlockIds.slice(5).concat(evidenceBlockIds.filter((blockId) => !evidenceSet.has(blockId))),
        x: 8.02,
        y: 6.48,
        w: 4.55,
        h: 0.42,
        zIndex: 10,
        typography: compact,
      },
    ];
  }

  const primaryEvidence = evidenceBlockIds.slice(0, 2);
  return [
    { ...titleRegion, y: 0.34, h: 0.66, typography: { ...titleRegion.typography, fontSize: Math.max(28, config.typography.titleFontSize - 2) } },
    { id: "feature-summary", role: "body", blockIds: textBlockIds.slice(0, 4), x: 0.82, y: 1.2, w: 5.65, h: 2.35, zIndex: 10, typography: compact },
    { id: "object-summary", role: "body", blockIds: textBlockIds.slice(4, 8), x: 6.88, y: 1.2, w: 5.65, h: 2.35, zIndex: 10, typography: compact },
    ...(primaryEvidence[0] ? [{ id: "evidence-1", role: chartBlockIds.includes(primaryEvidence[0]) ? "chart" as const : tableBlockIds.includes(primaryEvidence[0]) ? "table" as const : "image" as const, blockIds: [primaryEvidence[0]], x: 0.82, y: 3.92, w: 5.65, h: 2.45, zIndex: 10, typography: compact }] : []),
    ...(primaryEvidence[1] ? [{ id: "evidence-2", role: chartBlockIds.includes(primaryEvidence[1]) ? "chart" as const : tableBlockIds.includes(primaryEvidence[1]) ? "table" as const : "image" as const, blockIds: [primaryEvidence[1]], x: 6.88, y: 3.92, w: 5.65, h: 2.45, zIndex: 10, typography: compact }] : []),
  ];
}

function createTableFocusRegions(slide: SlideIR, titleRegion: LayoutRegion, config: Config): LayoutRegion[] {
  const tableBlockIds = slide.blocks.filter((block) => block.type === "table").map((block) => block.id);
  const imageBlockIds = slide.blocks.filter((block) => block.type === "image").map((block) => block.id);
  if (!tableBlockIds.length) return [
    titleRegion,
    { id: "body", role: "body", blockIds: slide.blocks.map((block) => block.id), x: 0.95, y: 1.56, w: 11.35, h: 4.95, zIndex: 10, typography: bodyTypography(config) },
  ];

  if (imageBlockIds.length) {
    return [
      titleRegion,
      { id: "table", role: "table", blockIds: tableBlockIds.slice(0, 1), x: 0.9, y: 1.55, w: 6.15, h: 4.95, zIndex: 10, typography: compactBodyTypography(config) },
      { id: "image-1", role: "image", blockIds: imageBlockIds.slice(0, 1), x: 7.45, y: 1.6, w: 4.85, h: 4.95, zIndex: 10 },
    ];
  }

  return [
    titleRegion,
    { id: "table", role: "table", blockIds: tableBlockIds.slice(0, 1), x: 1.0, y: 1.55, w: 11.2, h: 4.95, zIndex: 10, typography: compactBodyTypography(config) },
  ];
}

function createTocRegions(slide: SlideIR, titleRegion: LayoutRegion, config: Config): LayoutRegion[] {
  const blockIds = slide.blocks.filter((block) => block.type !== "slideBreak").map((block) => block.id);
  const count = blockIds.length;
  if (!count) return [titleRegion];

  const columns = count > 5 ? 2 : 1;
  const rows = Math.ceil(count / columns);
  const bodyTop = 1.52;
  const bodyHeight = 5.1;
  const gapX = 0.42;
  const gapY = rows > 4 ? 0.16 : 0.22;
  const x = 0.9;
  const w = 11.5;
  const cellW = columns === 1 ? w : (w - gapX) / 2;
  const cellH = Math.max(0.62, Math.min(0.92, (bodyHeight - gapY * (rows - 1)) / rows));
  const totalH = cellH * rows + gapY * (rows - 1);
  const startY = bodyTop + Math.max(0, (bodyHeight - totalH) / 2);
  const typography = count > 6 ? compactBodyTypography(config) : bodyTypography(config);

  return [
    titleRegion,
    ...blockIds.map((blockId, index) => {
      const column = columns === 1 ? 0 : Math.floor(index / rows);
      const row = columns === 1 ? index : index % rows;
      return {
        id: `toc-item-${index + 1}`,
        role: "item" as const,
        blockIds: [blockId],
        x: Number((x + column * (cellW + gapX)).toFixed(2)),
        y: Number((startY + row * (cellH + gapY)).toFixed(2)),
        w: Number(cellW.toFixed(2)),
        h: Number(cellH.toFixed(2)),
        zIndex: 10,
        typography,
      };
    }),
  ];
}

function createVerticalListRegions(itemBlockIds: string[], titleRegion: LayoutRegion, config: Config): LayoutRegion[] {
  const count = itemBlockIds.length;
  if (!count) return [titleRegion];

  if (count <= 4) {
    const bodyTop = 1.52;
    const bodyHeight = 5.05;
    const gap = count >= 4 ? 0.24 : 0.32;
    const rowH = Math.max(0.88, Math.min(1.12, (bodyHeight - gap * (count - 1)) / count));
    const totalH = rowH * count + gap * (count - 1);
    const startY = bodyTop + Math.max(0, (bodyHeight - totalH) / 2);
    return [
      titleRegion,
      ...itemBlockIds.map((blockId, index) => ({
        id: `item-${index + 1}`,
        role: "item" as const,
        blockIds: [blockId],
        x: 1.0,
        y: Number((startY + index * (rowH + gap)).toFixed(2)),
        w: 11.2,
        h: Number(rowH.toFixed(2)),
        zIndex: 10,
        typography: bodyTypography(config),
      })),
    ];
  }

  const columns = 2;
  const rows = Math.ceil(count / columns);
  const bodyTop = 1.5;
  const bodyHeight = 5.15;
  const gapX = 0.42;
  const gapY = rows > 4 ? 0.16 : 0.24;
  const x = 0.9;
  const cellW = (11.5 - gapX) / columns;
  const cellH = Math.max(0.68, Math.min(0.96, (bodyHeight - gapY * (rows - 1)) / rows));

  return [
    titleRegion,
    ...itemBlockIds.map((blockId, index) => {
      const column = Math.floor(index / rows);
      const row = index % rows;
      return {
        id: `item-${index + 1}`,
        role: "item" as const,
        blockIds: [blockId],
        x: Number((x + column * (cellW + gapX)).toFixed(2)),
        y: Number((bodyTop + row * (cellH + gapY)).toFixed(2)),
        w: Number(cellW.toFixed(2)),
        h: Number(cellH.toFixed(2)),
        zIndex: 10,
        typography: compactBodyTypography(config),
      };
    }),
  ];
}

function createChartTableRegions(slide: SlideIR, titleRegion: LayoutRegion, config: Config): LayoutRegion[] {
  const chartBlockIds = slide.blocks.filter((block) => block.type === "chart").map((block) => block.id);
  const tableBlockIds = slide.blocks.filter((block) => block.type === "table").map((block) => block.id);
  const imageBlockIds = slide.blocks.filter((block) => block.type === "image").map((block) => block.id);
  const bodyBlockIds = slide.blocks
    .filter((block) => !["chart", "table", "image", "slideBreak"].includes(block.type))
    .map((block) => block.id);

  if (chartBlockIds.length && tableBlockIds.length && imageBlockIds.length) {
    return [
      titleRegion,
      { id: "chart", role: "chart", blockIds: chartBlockIds, x: 0.82, y: 1.58, w: 5.05, h: 2.58, zIndex: 10, typography: compactBodyTypography(config) },
      { id: "table", role: "table", blockIds: tableBlockIds.slice(0, 1), x: 6.1, y: 1.62, w: 6.05, h: 2.42, zIndex: 10, typography: compactBodyTypography(config) },
      ...(bodyBlockIds.length ? [{ id: "body", role: "body" as const, blockIds: bodyBlockIds, x: 0.92, y: 4.42, w: 5.0, h: 1.88, zIndex: 10, typography: compactBodyTypography(config) }] : []),
      { id: "image-1", role: "image", blockIds: imageBlockIds.slice(0, 1), x: 6.1, y: 4.28, w: 6.05, h: 2.2, zIndex: 10 },
    ];
  }

  if (tableBlockIds.length) {
    return [
      titleRegion,
      { id: "chart", role: "chart", blockIds: chartBlockIds, x: 0.82, y: 1.65, w: 5.05, h: 3.75, zIndex: 10, typography: compactBodyTypography(config) },
      { id: "table", role: "table", blockIds: tableBlockIds.slice(0, 1), x: 6.1, y: 1.72, w: 6.05, h: 3.28, zIndex: 10, typography: compactBodyTypography(config) },
      ...(bodyBlockIds.length ? [{ id: "body", role: "body" as const, blockIds: bodyBlockIds, x: 6.1, y: 5.25, w: 6.05, h: 0.9, zIndex: 10, typography: compactBodyTypography(config) }] : []),
    ];
  }

  if (bodyBlockIds.length) {
    return [
      titleRegion,
      { id: "body", role: "body", blockIds: bodyBlockIds, x: 0.92, y: 1.66, w: 4.18, h: 4.62, zIndex: 10, typography: bodyTypography(config) },
      { id: "chart", role: "chart", blockIds: chartBlockIds, x: 5.42, y: 1.56, w: 6.78, h: 4.82, zIndex: 10, typography: compactBodyTypography(config) },
    ];
  }

  return [
    titleRegion,
    { id: "chart", role: "chart", blockIds: chartBlockIds, x: 1.0, y: 1.55, w: 11.2, h: 4.75, zIndex: 10, typography: bodyTypography(config) },
    ...(bodyBlockIds.length ? [{ id: "body", role: "body" as const, blockIds: bodyBlockIds, x: 1.0, y: 6.05, w: 11.2, h: 0.58, zIndex: 10, typography: compactBodyTypography(config) }] : []),
  ];
}

function titleBlockId(slideId: string): string {
  return `__title:${slideId}`;
}

function createKeyMessageRegions(slide: SlideIR, titleRegion: LayoutRegion, config: Config): LayoutRegion[] {
  const quoteBlockIds = slide.blocks.filter((block) => block.type === "quote").map((block) => block.id);
  const bodyBlockIds = slide.blocks.filter((block) => block.type !== "quote" && block.type !== "slideBreak").map((block) => block.id);
  const keyTypography = {
    ...bodyTypography(config),
    fontSize: Math.max(config.typography.bodyFontSize + 4, config.typography.titleFontSize - 4),
    fontWeight: "bold" as const,
  };

  if (!bodyBlockIds.length) {
    return [
      titleRegion,
      { id: "key-message", role: "body", blockIds: quoteBlockIds, x: 1.25, y: 2.2, w: 10.8, h: 2.1, zIndex: 10, typography: keyTypography },
    ];
  }

  return [
    titleRegion,
    { id: "key-message", role: "body", blockIds: quoteBlockIds, x: 1.0, y: 1.55, w: 11.2, h: 1.45, zIndex: 10, typography: keyTypography },
    { id: "body", role: "body", blockIds: bodyBlockIds, x: 1.0, y: 3.35, w: 11.2, h: 2.95, zIndex: 10, typography: bodyTypography(config) },
  ];
}

function createImageAwareRegions(
  titleRegion: LayoutRegion,
  textBlockIds: string[],
  imageBlockIds: string[],
  config: Config,
): LayoutRegion[] {
  const regions: LayoutRegion[] = [titleRegion];

  if (!textBlockIds.length) {
    regions.push(...imageGridRegions(imageBlockIds, { x: 1.0, y: 1.55, w: 11.2, h: 5.25 }));
    return regions;
  }

  regions.push({
    id: "body",
    role: "body",
    blockIds: textBlockIds,
    x: 0.9,
    y: 1.6,
    w: 6.15,
    h: 4.95,
    zIndex: 10,
    typography: bodyTypography(config),
  });
  regions.push(...imageGridRegions(imageBlockIds, { x: 7.45, y: 1.6, w: 4.85, h: 4.95 }));
  return regions;
}

function imageGridRegions(imageBlockIds: string[], rect: { x: number; y: number; w: number; h: number }): LayoutRegion[] {
  const gap = imageBlockIds.length > 1 ? 0.18 : 0;
  const regionHeight = (rect.h - gap * (imageBlockIds.length - 1)) / imageBlockIds.length;
  return imageBlockIds.map((blockId, index) => ({
    id: `image-${index + 1}`,
    role: "image",
    blockIds: [blockId],
    x: rect.x,
    y: Number((rect.y + index * (regionHeight + gap)).toFixed(2)),
    w: rect.w,
    h: Number(regionHeight.toFixed(2)),
    zIndex: 10,
  }));
}

function titleRegionRect(slide: SlideIR) {
  if (slide.role === "cover") return { x: 1.0, y: 2.25, w: 11.3, h: 1.25 };
  if (slide.role === "toc") return { x: 0.8, y: 0.42, w: 11.7, h: 0.9 };
  return titleRect;
}

function titleFontSize(slide: SlideIR, config: Config): number {
  if (slide.role === "cover") return config.typography.titleFontSize + 14;
  if (slide.role === "toc") return config.typography.titleFontSize + 4;
  return config.typography.titleFontSize;
}

function bodyTypography(config: Config) {
  return {
    fontFamily: config.typography.fontFamily,
    fontSize: config.typography.bodyFontSize,
    fontWeight: "normal" as const,
    lineHeight: config.typography.lineHeight,
    minFontSize: Math.max(config.typography.minFontSize, 16),
  };
}

function compactBodyTypography(config: Config) {
  const minFontSize = Math.max(config.typography.minFontSize, 14);
  return {
    fontFamily: config.typography.fontFamily,
    fontSize: Math.max(minFontSize, config.typography.bodyFontSize - 5),
    fontWeight: "normal" as const,
    lineHeight: config.typography.lineHeight,
    minFontSize,
  };
}

function codeTypography(config: Config) {
  return {
    fontFamily: "Consolas",
    fontSize: Math.min(config.typography.captionFontSize, 14),
    fontWeight: "normal" as const,
    lineHeight: 1.12,
    minFontSize: Math.min(config.typography.minFontSize, 11),
  };
}
