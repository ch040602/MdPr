import type { Config, PresentationIR, SlideIR } from "@mdpresent/core";
import type { LayoutIR, LayoutRegion, LayoutSlide, LayoutSpec, ThemeTokens } from "./ir/types.js";
import { chooseItemLayout, titleRect, bodyRect } from "./presets/presets.js";

export function planLayout(presentation: PresentationIR, config: Config): LayoutIR {
  const theme: ThemeTokens = {
    fontFamily: config.typography.fontFamily,
    designPreset: config.theme.designPreset ?? config.pptx.designPreset,
    colorCombination: config.theme.colorCombination,
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
    slides: presentation.slides.map((slide) => planSlideLayout(slide, config)),
    diagnostics: [...presentation.diagnostics],
  };
}

export function chooseLayout(slide: SlideIR, config: Config): LayoutSpec {
  if (slide.role === "cover") return { preset: "cover" };
  if (slide.role === "toc") return { preset: "toc" };
  if (slide.intent === "comparison") return { preset: "comparison", direction: "horizontal", columns: 2 };
  if (slide.intent === "chart") return { preset: "chart-table", direction: "horizontal" };
  if (slide.intent === "table") return { preset: "table-focus" };
  if (slide.intent === "image") return { preset: "image-focus" };
  if (slide.intent === "code") return { preset: "code-focus" };
  if (slide.intent === "quote") {
    const nonQuoteBlocks = slide.blocks.filter((block) => block.type !== "quote" && block.type !== "slideBreak");
    return { preset: nonQuoteBlocks.length ? "key-message" : "quote" };
  }
  if (slide.intent === "timeline") return { preset: "timeline", direction: "horizontal" };
  if (slide.intent === "diagram") return { preset: "pipeline", direction: "horizontal" };
  if (isTwoParagraphOpenLayout(slide)) return { preset: "comparison", direction: "horizontal", columns: 2 };
  if (isTextOnlyReliefCandidate(slide)) return { preset: "text-icon-aside" };

  const itemCount = slide.primaryItemCount ?? 0;
  if (itemCount > 0) return chooseItemLayout(itemCount);

  return { preset: config.layout.defaultPreset as LayoutSpec["preset"] };
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

function planSlideLayout(slide: SlideIR, config: Config): LayoutSlide {
  const layout = chooseLayout(slide, config);
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

  if (layout.preset === "quote" || layout.preset === "key-message") {
    return createKeyMessageRegions(slide, titleRegion, config);
  }

  if (imageBlockIds.length) {
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

  if (layout.preset === "vertical-list") {
    return [
      titleRegion,
      ...itemBlockIds.slice(0, 4).map((blockId, index) => ({
        id: `item-${index + 1}`,
        role: "item" as const,
        blockIds: [blockId],
        x: 1.0,
        y: Number((1.55 + index * 1.25).toFixed(2)),
        w: 11.2,
        h: 0.95,
        zIndex: 10,
        typography: bodyTypography(config),
      })),
    ];
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

  if (layout.preset === "chart-table") {
    return createChartTableRegions(slide, titleRegion, config);
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

function createChartTableRegions(slide: SlideIR, titleRegion: LayoutRegion, config: Config): LayoutRegion[] {
  const chartBlockIds = slide.blocks.filter((block) => block.type === "chart").map((block) => block.id);
  const tableBlockIds = slide.blocks.filter((block) => block.type === "table").map((block) => block.id);
  const bodyBlockIds = slide.blocks
    .filter((block) => !["chart", "table", "slideBreak"].includes(block.type))
    .map((block) => block.id);

  if (tableBlockIds.length) {
    return [
      titleRegion,
      { id: "chart", role: "chart", blockIds: chartBlockIds, x: 0.82, y: 1.65, w: 5.05, h: 3.75, zIndex: 10, typography: compactBodyTypography(config) },
      { id: "table", role: "table", blockIds: tableBlockIds.slice(0, 1), x: 6.1, y: 1.72, w: 6.05, h: 3.28, zIndex: 10, typography: compactBodyTypography(config) },
      ...(bodyBlockIds.length ? [{ id: "body", role: "body" as const, blockIds: bodyBlockIds, x: 6.1, y: 5.25, w: 6.05, h: 0.9, zIndex: 10, typography: compactBodyTypography(config) }] : []),
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
  return {
    fontFamily: config.typography.fontFamily,
    fontSize: Math.max(14, config.typography.bodyFontSize - 5),
    fontWeight: "normal" as const,
    lineHeight: config.typography.lineHeight,
    minFontSize: Math.max(12, Math.min(config.typography.minFontSize, 14)),
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
