import type { Diagnostic, PresentationIR } from "@mdpresent/core";
import type { LayoutIR } from "@mdpresent/layout";

type LayoutRegion = LayoutIR["slides"][number]["regions"][number];

export type PolishQualitySummary = {
  checked: true;
  source: {
    videoId: "GX0Fn-5YqKE";
    title: string;
    chapters: Array<{ time: string; key: keyof PolishQualitySummary["chapters"]; label: string }>;
  };
  chapters: {
    fontHierarchy: PolishChapterCheck & {
      titleFontPt: number;
      bodyFontPt: number;
      minFontPt: number;
      sameRoleFontVarianceCount: number;
      fontFamily: string;
    };
    layoutComposition: PolishChapterCheck & {
      structuredLayoutRatio: number;
      genericBlockySlideCount: number;
      averageRegionsPerContentSlide: number;
    };
    highlightPage: PolishChapterCheck & {
      importantClaimSlideCount: number;
      highlightedSlideCount: number;
    };
    coverPage: PolishChapterCheck & {
      coverSlideCount: number;
      polishedCoverCount: number;
    };
    detailPolish: PolishChapterCheck & {
      visualErrorCount: number;
      overlapCount: number;
      clippingRiskCount: number;
      contrastFailureCount: number;
      connectorClearanceCount: number;
    };
    beforeAfterComparison: PolishChapterCheck & {
      presets: string[];
    };
  };
  requiredFailureCount: number;
  optionalFailureCount: number;
};

type PolishChapterCheck = {
  passed: boolean;
  required: boolean;
  evidence: string;
};

export type PolishQualityOptions = {
  comparisonPresets?: string[];
};

export function polishQualityDiagnostics(
  presentation: PresentationIR,
  layout: LayoutIR,
  options: PolishQualityOptions = {},
): Diagnostic[] {
  const summary = createPolishQualitySummary(presentation, layout, options);
  const failedChapters = Object.entries(summary.chapters)
    .filter(([, chapter]) => chapter.required && !chapter.passed)
    .map(([key]) => key);
  if (!failedChapters.length) return [];

  return [{
    level: "error",
    code: "MDPR_POLISH_GATE_FAILED",
    message: `Required polish chapters failed: ${failedChapters.join(", ")}.`,
    details: {
      failedChapters,
      requiredFailureCount: summary.requiredFailureCount,
      runtimeOwner: "MDPR",
    },
  }];
}

export function createVisualValidationSummary(layout: LayoutIR) {
  const diagnostics = visualValidationDiagnostics(layout);
  return {
    checked: true,
    slideCount: layout.slides.length,
    thresholds: {
      minimumTextContrastRatio: 4.5,
      maximumSameLayerOverlapRatio: 0.08,
      minimumReadableFontSize: 8,
      imageAspectRatioRange: [0.25, 4.0],
      minimumDiagramConnectorSpace: { width: 2.0, height: 1.0 },
    },
    checks: {
      nonBlankSlides: layout.slides.every((slide) => slide.regions.some((region) => region.blockIds.length || region.role === "title")),
      regionBounds: diagnostics.every((diagnostic) => diagnostic.code !== "VISUAL_REGION_BOUNDS"),
      minimumTextSize: diagnostics.every((diagnostic) => diagnostic.code !== "VISUAL_FONT_FLOOR"),
      textContrast: diagnostics.every((diagnostic) => diagnostic.code !== "VISUAL_CONTRAST"),
      sameLayerOverlap: diagnostics.every((diagnostic) => diagnostic.code !== "VISUAL_REGION_OVERLAP"),
      imageAspectRatio: diagnostics.every((diagnostic) => diagnostic.code !== "VISUAL_IMAGE_ASPECT_RATIO"),
      connectorClearance: diagnostics.every((diagnostic) => diagnostic.code !== "VISUAL_CONNECTOR_CLEARANCE"),
      pipelineOnePageEvidenceRail: diagnostics.every((diagnostic) => diagnostic.code !== "VISUAL_TEASER_EVIDENCE_RAIL"),
      backgroundContentOverlap: diagnostics.every((diagnostic) => !["VISUAL_BACKGROUND_OVERLAP", "VISUAL_REGION_OVERLAP"].includes(diagnostic.code ?? "")),
    },
    diagnostics,
  };
}

export function visualValidationDiagnostics(layout: LayoutIR): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const contrast = contrastRatio(layout.theme.textColor, layout.theme.backgroundColor);
  if (contrast !== undefined && contrast < 4.5) {
    diagnostics.push({
      level: "error",
      code: "VISUAL_CONTRAST",
      message: `Theme text/background contrast ratio ${contrast.toFixed(2)} is below the 4.5 readable threshold.`,
    });
  }

  for (const slide of layout.slides) {
    for (const region of slide.regions) {
      if (region.x < 0 || region.y < 0 || region.x + region.w > layout.slideSize.width || region.y + region.h > layout.slideSize.height) {
        diagnostics.push({
          level: "error",
          code: "VISUAL_REGION_BOUNDS",
          slideId: slide.sourceSlideId,
          message: `Region ${region.id} is outside the slide bounds.`,
        });
      }
      const minFontSize = region.typography?.minFontSize ?? layout.theme.minFontSize;
      const fontSize = region.typography?.fontSize ?? layout.theme.bodyFontSize;
      if (region.role !== "image" && Math.min(fontSize, minFontSize) < 8) {
        diagnostics.push({
          level: "error",
          code: "VISUAL_FONT_FLOOR",
          slideId: slide.sourceSlideId,
          message: `Region ${region.id} falls below the 8pt visual readability floor.`,
          details: {
            regionId: region.id,
            fontSize,
            minFontSize,
            threshold: 8,
            sourcePreserved: true,
            rewriteApplied: false,
            summarizationApplied: false,
            textDeletionApplied: false,
            runtimeOwner: "MDPR",
          },
        });
      }
      if (region.role === "image") {
        const ratio = region.w / Math.max(0.0001, region.h);
        if (ratio < 0.25 || ratio > 4.0) {
          diagnostics.push({
            level: "error",
            code: "VISUAL_IMAGE_ASPECT_RATIO",
            slideId: slide.sourceSlideId,
            message: `Image region ${region.id} has an extreme frame aspect ratio (${ratio.toFixed(2)}).`,
          });
        }
      }
      if (region.role === "diagram" && (region.w < 2.0 || region.h < 1.0)) {
        diagnostics.push({
          level: "error",
          code: "VISUAL_CONNECTOR_CLEARANCE",
          slideId: slide.sourceSlideId,
          message: `Diagram region ${region.id} is too small for readable connector routing.`,
        });
      }
    }

    if (slide.layout.preset === "pipeline-one-page") {
      diagnostics.push(...validatePipelineOnePageEvidenceRail(slide));
    }

    const contentRegions = slide.regions.filter(isContentRegion);
    for (let leftIndex = 0; leftIndex < contentRegions.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < contentRegions.length; rightIndex++) {
        const left = contentRegions[leftIndex]!;
        const right = contentRegions[rightIndex]!;
        if (left.zIndex !== right.zIndex) continue;
        const overlapRatio = regionOverlapRatio(left, right);
        if (overlapRatio <= 0.08) continue;
        diagnostics.push({
          level: "error",
          code: "VISUAL_REGION_OVERLAP",
          slideId: slide.sourceSlideId,
          message: `Regions ${left.id} and ${right.id} overlap on the same z-index layer (${overlapRatio.toFixed(2)} area ratio).`,
        });
      }
    }
  }
  return diagnostics;
}

function validatePipelineOnePageEvidenceRail(slide: LayoutIR["slides"][number]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const diagram = slide.regions.find((region) => region.id === "diagram" || region.role === "diagram");
  const chart = slide.regions.find((region) => region.id === "chart" || region.role === "chart");
  const table = slide.regions.find((region) => region.id === "table" || region.role === "table");

  if (diagram && chart && chart.x <= diagram.x + diagram.w) {
    diagnostics.push(teaserRailDiagnostic(slide.sourceSlideId, "Chart evidence rail must sit to the right of the hero diagram."));
  }
  if (chart && table && table.y <= chart.y + chart.h) {
    diagnostics.push(teaserRailDiagnostic(slide.sourceSlideId, "Table evidence rail must sit below the chart rail."));
  }
  if (chart && (chart.w < 3.6 || chart.h < 1.5)) {
    diagnostics.push(teaserRailDiagnostic(slide.sourceSlideId, `Chart evidence rail is too small (${chart.w.toFixed(2)}x${chart.h.toFixed(2)}in).`));
  }
  if (table && (table.w < 3.6 || table.h < 2.1)) {
    diagnostics.push(teaserRailDiagnostic(slide.sourceSlideId, `Table evidence rail is too small (${table.w.toFixed(2)}x${table.h.toFixed(2)}in).`));
  }
  for (const region of [chart, table].filter((candidate): candidate is LayoutRegion => Boolean(candidate))) {
    const fontSize = region.typography?.fontSize ?? 14;
    const minFontSize = region.typography?.minFontSize ?? 14;
    if (Math.min(fontSize, minFontSize) < 14) {
      diagnostics.push(teaserRailDiagnostic(slide.sourceSlideId, `Evidence rail region ${region.id} falls below the 14pt teaser readability floor.`));
    }
  }

  return diagnostics;
}

function teaserRailDiagnostic(slideId: string, message: string): Diagnostic {
  return {
    level: "error",
    code: "VISUAL_TEASER_EVIDENCE_RAIL",
    slideId,
    message,
  };
}

export function createPolishQualitySummary(
  presentation: PresentationIR,
  layout: LayoutIR,
  options: PolishQualityOptions = {},
): PolishQualitySummary {
  const diagnostics = visualValidationDiagnostics(layout);
  const titleFontPt = maxRegionFont(layout, "title", layout.theme.titleFontSize);
  const bodyFontPt = maxRegionFont(layout, "body", layout.theme.bodyFontSize);
  const minFontPt = minimumRegionFont(layout);
  const sameRoleFontVarianceCount = sameRoleFontVariance(layout);
  const structuredLayoutRatio = structuredLayoutRatioFor(layout);
  const genericBlockySlideCount = genericBlockySlides(layout);
  const contentSlides = layout.slides.filter((slide) => !["cover", "toc"].includes(slide.layout.preset));
  const averageRegionsPerContentSlide = contentSlides.length
    ? contentSlides.reduce((sum, slide) => sum + slide.regions.filter(isContentRegion).length, 0) / contentSlides.length
    : 0;
  const importantClaimSlideIds = new Set(
    presentation.slides
      .filter((slide) => slide.intent === "quote" || slide.blocks.some((block) => block.type === "quote"))
      .map((slide) => slide.id),
  );
  const highlightedSlideCount = layout.slides
    .filter((slide) => slide.layout.preset === "key-message" || slide.layout.preset === "quote")
    .length;
  const coverSlideCount = presentation.slides.filter((slide) => slide.role === "cover").length;
  const polishedCoverCount = layout.slides.filter((slide) => {
    if (slide.layout.preset !== "cover") return false;
    return slide.regions.some((region) => region.role === "title" && region.blockIds.length > 0)
      && !slide.regions.some((region) => region.role !== "title" && region.blockIds.length === 0);
  }).length;
  const visualErrorCount = diagnostics.filter((diagnostic) => diagnostic.level === "error").length;
  const overlapCount = diagnostics.filter((diagnostic) => diagnostic.code === "VISUAL_REGION_OVERLAP").length;
  const clippingRiskCount = diagnostics.filter((diagnostic) => diagnostic.code === "VISUAL_REGION_BOUNDS" || diagnostic.code === "VISUAL_FONT_FLOOR").length;
  const contrastFailureCount = diagnostics.filter((diagnostic) => diagnostic.code === "VISUAL_CONTRAST").length;
  const connectorClearanceCount = diagnostics.filter((diagnostic) => diagnostic.code === "VISUAL_CONNECTOR_CLEARANCE").length;
  const comparisonPresets = options.comparisonPresets ?? [];

  const chapters: PolishQualitySummary["chapters"] = {
    fontHierarchy: {
      required: true,
      passed: Boolean(layout.theme.fontFamily) && titleFontPt >= bodyFontPt + 4 && minFontPt >= 16 && sameRoleFontVarianceCount === 0,
      evidence: "Title/body hierarchy, readable font floor, family availability, and same-role consistency are checked from Layout IR typography.",
      titleFontPt,
      bodyFontPt,
      minFontPt,
      sameRoleFontVarianceCount,
      fontFamily: layout.theme.fontFamily,
    },
    layoutComposition: {
      required: true,
      passed: structuredLayoutRatio >= 0.5 && genericBlockySlideCount === 0,
      evidence: "Layout presets are checked for structured composition instead of generic dense AI-PPT blocks.",
      structuredLayoutRatio: Number(structuredLayoutRatio.toFixed(3)),
      genericBlockySlideCount,
      averageRegionsPerContentSlide: Number(averageRegionsPerContentSlide.toFixed(3)),
    },
    highlightPage: {
      required: true,
      passed: importantClaimSlideIds.size === 0 || highlightedSlideCount >= importantClaimSlideIds.size,
      evidence: "Quote and key-message intents must route to quote/key-message layouts when important claims exist.",
      importantClaimSlideCount: importantClaimSlideIds.size,
      highlightedSlideCount,
    },
    coverPage: {
      required: true,
      passed: coverSlideCount === 0 || polishedCoverCount >= coverSlideCount,
      evidence: "Cover slides must use the cover preset with visible title hierarchy and no empty body artifacts.",
      coverSlideCount,
      polishedCoverCount,
    },
    detailPolish: {
      required: true,
      passed: visualErrorCount === 0,
      evidence: "Detail polish reuses visual diagnostics for overlap, clipping, contrast, image aspect, and connector clearance failures.",
      visualErrorCount,
      overlapCount,
      clippingRiskCount,
      contrastFailureCount,
      connectorClearanceCount,
    },
    beforeAfterComparison: {
      required: false,
      passed: comparisonPresets.length >= 2,
      evidence: "Theme-gallery builds with at least two presets provide deterministic before/after comparison evidence for representative decks.",
      presets: comparisonPresets,
    },
  };

  const checks = Object.values(chapters);
  return {
    checked: true,
    source: {
      videoId: "GX0Fn-5YqKE",
      title: "Do not use AI-made PPT as-is",
      chapters: [
        { time: "00:24", key: "fontHierarchy", label: "font changes" },
        { time: "02:33", key: "layoutComposition", label: "layout" },
        { time: "05:20", key: "highlightPage", label: "highlight page" },
        { time: "07:13", key: "coverPage", label: "cover page" },
        { time: "07:48", key: "detailPolish", label: "detail polish" },
        { time: "08:45", key: "beforeAfterComparison", label: "before/after comparison" },
      ],
    },
    chapters,
    requiredFailureCount: checks.filter((check) => check.required && !check.passed).length,
    optionalFailureCount: checks.filter((check) => !check.required && !check.passed).length,
  };
}

function isContentRegion(region: LayoutRegion): boolean {
  if (["icon", "footer", "pageNumber"].includes(region.role)) return false;
  return region.role === "title" || region.blockIds.length > 0;
}

function regionOverlapRatio(left: LayoutRegion, right: LayoutRegion): number {
  const x = Math.max(0, Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x));
  const y = Math.max(0, Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y));
  const overlap = x * y;
  if (overlap <= 0) return 0;
  const smallerArea = Math.max(0.0001, Math.min(left.w * left.h, right.w * right.h));
  return overlap / smallerArea;
}

function maxRegionFont(layout: LayoutIR, role: string, fallback: number): number {
  const values = layout.slides
    .flatMap((slide) => slide.regions)
    .filter((region) => region.role === role)
    .map((region) => region.typography?.fontSize)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length ? Math.max(...values) : fallback;
}

function minimumRegionFont(layout: LayoutIR): number {
  const values = layout.slides
    .flatMap((slide) => slide.regions)
    .flatMap((region) => [region.typography?.fontSize, region.typography?.minFontSize])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length ? Math.min(...values) : layout.theme.minFontSize;
}

function sameRoleFontVariance(layout: LayoutIR): number {
  let count = 0;
  for (const slide of layout.slides) {
    const byRole = new Map<string, number[]>();
    for (const region of slide.regions) {
      if (!isContentRegion(region)) continue;
      const value = region.typography?.fontSize ?? (region.role === "title" ? layout.theme.titleFontSize : layout.theme.bodyFontSize);
      const values = byRole.get(region.role) ?? [];
      values.push(value);
      byRole.set(region.role, values);
    }
    for (const values of byRole.values()) {
      if (values.length > 1 && Math.max(...values) - Math.min(...values) > 2) count += 1;
    }
  }
  return count;
}

function structuredLayoutRatioFor(layout: LayoutIR): number {
  const contentSlides = layout.slides.filter((slide) => !["cover", "toc"].includes(slide.layout.preset));
  if (!contentSlides.length) return 1;
  const structured = contentSlides.filter((slide) => slide.layout.preset !== "title-body" || slide.regions.filter(isContentRegion).length <= 2);
  return structured.length / contentSlides.length;
}

function genericBlockySlides(layout: LayoutIR): number {
  return layout.slides.filter((slide) => {
    if (slide.layout.preset !== "title-body") return false;
    const contentRegions = slide.regions.filter(isContentRegion);
    const itemLikeCount = contentRegions.filter((region) => region.role === "item" || region.blockIds.some((blockId) => blockId.includes("#"))).length;
    return itemLikeCount >= 4 || contentRegions.length >= 5;
  }).length;
}

function contrastRatio(foreground: string, background: string): number | undefined {
  const fg = parseHexColor(foreground);
  const bg = parseHexColor(background);
  if (!fg || !bg) return undefined;
  const lighter = Math.max(relativeLuminance(fg), relativeLuminance(bg));
  const darker = Math.min(relativeLuminance(fg), relativeLuminance(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

function parseHexColor(value: string): [number, number, number] | undefined {
  const normalized = value.trim().replace(/^#/, "");
  const full = /^[0-9a-fA-F]{3}$/.test(normalized)
    ? normalized.split("").map((part) => `${part}${part}`).join("")
    : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return undefined;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
