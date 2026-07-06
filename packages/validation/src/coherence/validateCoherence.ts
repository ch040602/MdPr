import type { Diagnostic, PresentationIR, SlideIR } from "@mdpresent/core";
import type { LayoutIR, LayoutRegion } from "@mdpresent/layout";

const INTRA_SLIDE_SPACING_TOLERANCE_PX = 8;
const MIN_TEXT_BACKGROUND_CONTRAST = 4.5;
const MAX_GRAYSCALE_CHANNEL_DRIFT = 2;
const CONTENT_REGION_ROLES = new Set(["body", "item", "image", "table", "chart", "code", "diagram", "icon"]);

export function createCoherenceValidationSummary(presentation: PresentationIR, layout: LayoutIR) {
  const diagnostics = coherenceValidationDiagnostics(presentation, layout);
  const intraSlideSpacingCoverage = intraSlideSpacingValidationCoverage(layout);
  const claimlessSlides = diagnostics.filter((diagnostic) => diagnostic.code === "CLAIMLESS_EVIDENCE_SLIDE").length;
  const captionDetached = diagnostics.filter((diagnostic) => diagnostic.code === "DETACHED_CAPTION").length;
  const orphanTables = diagnostics.filter((diagnostic) => diagnostic.code === "ORPHAN_TABLE").length;
  const lowObjectCoverage = diagnostics.filter((diagnostic) => diagnostic.code === "LOW_OBJECT_COVERAGE").length;
  const sectionMotifDrift = diagnostics.filter((diagnostic) => diagnostic.code === "SECTION_STYLE_DRIFT").length;
  const intraSlideSpacingDrift = diagnostics.filter((diagnostic) => diagnostic.code === "INCONSISTENT_INTRA_SLIDE_SPACING").length;
  const textBackgroundLuminanceDrift = diagnostics.filter((diagnostic) => diagnostic.code === "TEXT_BACKGROUND_LUMINANCE_MISMATCH").length;
  const evidenceGroups = presentation.coherenceGroups.filter((group) => group.role === "evidence-pack").length;
  const groupedEvidence = presentation.coherenceGroups.filter((group) => group.role === "evidence-pack" && group.supportingBlockIds.length > 0).length;

  return {
    checked: true,
    thresholds: {
      minimumMixedObjectGroupingScore: 0.75,
      minimumObjectCoverageRatio: 0.2,
      intraSlideSpacingTolerancePx: INTRA_SLIDE_SPACING_TOLERANCE_PX,
      minimumTextBackgroundContrastRatio: MIN_TEXT_BACKGROUND_CONTRAST,
      maxTextColorGrayscaleChannelDrift: MAX_GRAYSCALE_CHANNEL_DRIFT,
    },
    orphanEvidenceBlocks: orphanTables,
    captionDetached,
    claimlessSlides,
    sectionMotifDrift,
    intraSlideSpacingDrift,
    textBackgroundLuminanceDrift,
    intraSlideSpacingCoverage,
    continuationTitleQuality: diagnostics.some((diagnostic) => diagnostic.code === "DENSE_CONTINUATION_WITHOUT_TITLE") ? "needs-review" : "ok",
    mixedObjectGroupingScore: evidenceGroups ? Number((groupedEvidence / evidenceGroups).toFixed(2)) : 1,
    checks: {
      claimlessEvidenceSlides: claimlessSlides === 0,
      detachedCaptions: captionDetached === 0,
      orphanTables: orphanTables === 0,
      lowObjectCoverage: lowObjectCoverage === 0,
      sectionMotifDrift: sectionMotifDrift === 0,
      intraSlideSpacing: intraSlideSpacingDrift === 0,
      textBackgroundLuminance: textBackgroundLuminanceDrift === 0,
    },
    diagnostics,
  };
}

export function coherenceValidationDiagnostics(presentation: PresentationIR, layout: LayoutIR): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const layoutBySlideId = new Map(layout.slides.map((slide) => [slide.sourceSlideId, slide]));

  for (const slide of presentation.slides) {
    if (slide.role !== "content") continue;
    const group = presentation.coherenceGroups.find((candidate) => candidate.slideId === slide.id);
    const blockRoles = group?.blockRoles ?? {};
    const blockTypes = new Set(slide.blocks.map((block) => block.type));
    const hasEvidenceObject = ["table", "chart", "image", "diagram"].some((type) => blockTypes.has(type as never));
    const hasClaim = Object.values(blockRoles).includes("claim") ||
      slide.blocks.some((block) => block.type === "paragraph" && isClaimLikeText(block.text ?? block.sentences?.join(" ") ?? "")) ||
      slide.blocks.some((block) => block.type === "bulletList" && block.id.endsWith("-teaser-overview"));
    const hasEvidenceRole = Object.values(blockRoles).some((role) => role === "evidence" || role === "metric");

    if (hasEvidenceObject && !hasClaim) {
      diagnostics.push({
        level: "warning",
        code: "CLAIMLESS_EVIDENCE_SLIDE",
        slideId: slide.id,
        message: `Slide "${slide.title ?? slide.id}" contains evidence objects without a claim-like explanatory block.`,
      });
    }

    const firstMeaningfulBlock = slide.blocks.find((block) => block.type !== "heading");
    if (firstMeaningfulBlock?.type === "table" && !hasClaim) {
      diagnostics.push({
        level: "warning",
        code: "ORPHAN_TABLE",
        slideId: slide.id,
        message: `Slide "${slide.title ?? slide.id}" starts with a table that is not attached to an explanatory paragraph.`,
      });
    }

    const imageBlocks = slide.blocks.filter((block) => block.type === "image");
    for (const image of imageBlocks) {
      const imageIndex = slide.blocks.indexOf(image);
      const nextBlock = slide.blocks[imageIndex + 1];
      const hasCaption = nextBlock?.type === "paragraph" && isCaptionLikeText(nextBlock.text ?? nextBlock.sentences?.join(" ") ?? "");
      if (!hasCaption && image.alt && image.alt.length > 0 && slide.blocks.length > 2) {
        diagnostics.push({
          level: "warning",
          code: "DETACHED_CAPTION",
          slideId: slide.id,
          message: `Image "${image.alt}" has no adjacent short caption paragraph.`,
        });
      }
    }

    const layoutSlide = layoutBySlideId.get(slide.id);
    if (layoutSlide && hasEvidenceRole) {
      const coveredBlockIds = new Set(layoutSlide.regions.flatMap((region) => region.blockIds.map((blockId) => blockId.split("#")[0])));
      const contentBlockIds = slide.blocks.filter((block) => block.type !== "heading").map((block) => block.id);
      const coverage = contentBlockIds.length ? contentBlockIds.filter((blockId) => coveredBlockIds.has(blockId)).length / contentBlockIds.length : 1;
      if (coverage < 0.2) {
        diagnostics.push({
          level: "warning",
          code: "LOW_OBJECT_COVERAGE",
          slideId: slide.id,
          message: `Slide "${slide.title ?? slide.id}" maps only ${(coverage * 100).toFixed(0)}% of source blocks to visible layout regions.`,
        });
      }
    }
  }

  diagnostics.push(...sectionStyleDriftDiagnostics(presentation, layout));
  diagnostics.push(...continuationTitleDiagnostics(presentation));
  diagnostics.push(...intraSlideSpacingDiagnostics(layout));
  diagnostics.push(...textBackgroundLuminanceDiagnostics(layout));

  return diagnostics;
}

function textBackgroundLuminanceDiagnostics(layout: LayoutIR): Diagnostic[] {
  const text = parseHex(layout.theme.textColor);
  const background = parseHex(layout.theme.backgroundColor);
  if (!text || !background) return [];

  const contrast = contrastRatio(text, background);
  const grayscaleDrift = Math.max(
    Math.abs(text.r - text.g),
    Math.abs(text.g - text.b),
    Math.abs(text.r - text.b),
  );
  const textLum = relativeLuminance(text);
  const backgroundLum = relativeLuminance(background);
  const directionMatches = backgroundLum < 0.5 ? textLum > backgroundLum : textLum < backgroundLum;
  const isCoherent = grayscaleDrift <= MAX_GRAYSCALE_CHANNEL_DRIFT &&
    contrast >= MIN_TEXT_BACKGROUND_CONTRAST &&
    directionMatches;

  if (isCoherent) return [];

  return [{
    level: "warning",
    code: "TEXT_BACKGROUND_LUMINANCE_MISMATCH",
    message: `Theme text color ${layout.theme.textColor} should be a grayscale black/white brightness adjustment for background ${layout.theme.backgroundColor}; contrast is ${contrast.toFixed(2)}.`,
  }];
}

function intraSlideSpacingDiagnostics(layout: LayoutIR): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const slide of layout.slides) {
    if (isExcludedFromLinearSpacing(slide)) continue;
    const regions = slide.regions.filter(isContentRegionForSpacing);
    if (regions.length < 3) continue;

    const horizontal = spacingDriftFor(regions, layout, "horizontal");
    const vertical = spacingDriftFor(regions, layout, "vertical");

    for (const drift of [horizontal, vertical].filter(Boolean) as SpacingDrift[]) {
      diagnostics.push({
        level: "warning",
        code: "INCONSISTENT_INTRA_SLIDE_SPACING",
        slideId: slide.sourceSlideId,
        message: `Slide "${slide.sourceSlideId}" uses uneven ${drift.axis} spacing between content regions (${drift.gapsPx.join(", ")}px; tolerance ${INTRA_SLIDE_SPACING_TOLERANCE_PX}px). Keep actual text and object regions on one spacing token within the slide.`,
      });
    }
  }

  return diagnostics;
}

type SpacingDrift = {
  axis: "horizontal" | "vertical";
  gapsPx: number[];
};

type IntraSlideSpacingCoverage = {
  checkedSlides: number;
  skippedSlides: number;
  notApplicableSlides: number;
  checkedGroups: number;
  skipped: Array<{ slideId: string; reason: string }>;
  notApplicable: Array<{ slideId: string; reason: string }>;
  scope: {
    includedRoles: string[];
    excludedRoles: string[];
    excludedLayoutDirections: string[];
    minimumContentRegions: number;
  };
};

function intraSlideSpacingValidationCoverage(layout: LayoutIR): IntraSlideSpacingCoverage {
  const coverage: IntraSlideSpacingCoverage = {
    checkedSlides: 0,
    skippedSlides: 0,
    notApplicableSlides: 0,
    checkedGroups: 0,
    skipped: [],
    notApplicable: [],
    scope: {
      includedRoles: Array.from(CONTENT_REGION_ROLES).sort(),
      excludedRoles: ["footer", "pageNumber", "subtitle", "title"],
      excludedLayoutDirections: ["radial"],
      minimumContentRegions: 3,
    },
  };

  for (const slide of layout.slides) {
    if (isExcludedFromLinearSpacing(slide)) {
      coverage.skippedSlides += 1;
      coverage.skipped.push({
        slideId: slide.sourceSlideId,
        reason: "radial and pentagon layouts are excluded from linear row/column spacing checks",
      });
      continue;
    }

    const regions = slide.regions.filter(isContentRegionForSpacing);
    if (regions.length < coverage.scope.minimumContentRegions) {
      coverage.notApplicableSlides += 1;
      coverage.notApplicable.push({
        slideId: slide.sourceSlideId,
        reason: `fewer than ${coverage.scope.minimumContentRegions} content regions in spacing scope`,
      });
      continue;
    }

    const checkedGroups =
      comparableGapSetsFor(regions, layout, "horizontal").length +
      comparableGapSetsFor(regions, layout, "vertical").length;
    if (checkedGroups === 0) {
      coverage.notApplicableSlides += 1;
      coverage.notApplicable.push({
        slideId: slide.sourceSlideId,
        reason: "no comparable same-row or same-column gap groups",
      });
      continue;
    }

    coverage.checkedSlides += 1;
    coverage.checkedGroups += checkedGroups;
  }

  return coverage;
}

function isExcludedFromLinearSpacing(slide: LayoutIR["slides"][number]): boolean {
  return slide.layout.direction === "radial" || slide.layout.preset === "pentagon";
}

function spacingDriftFor(regions: LayoutRegion[], layout: LayoutIR, axis: "horizontal" | "vertical"): SpacingDrift | undefined {
  for (const gapsPx of comparableGapSetsFor(regions, layout, axis)) {
    const min = Math.min(...gapsPx);
    const max = Math.max(...gapsPx);
    if (max - min > INTRA_SLIDE_SPACING_TOLERANCE_PX) {
      return { axis, gapsPx };
    }
  }

  return undefined;
}

function comparableGapSetsFor(regions: LayoutRegion[], layout: LayoutIR, axis: "horizontal" | "vertical"): number[][] {
  const groups = alignedRegionGroups(regions, axis);
  const gapSets = groups.map((group) => adjacentGapsPx(group, layout, axis));
  return [
    ...gapSets.filter((gaps) => gaps.length >= 2),
    gapSets.flatMap((gaps) => gaps).filter((gap) => gap >= 0),
  ].filter((gaps) => gaps.length >= 2);
}

function alignedRegionGroups(regions: LayoutRegion[], axis: "horizontal" | "vertical"): LayoutRegion[][] {
  const crossStart = axis === "horizontal" ? "y" : "x";
  const crossSize = axis === "horizontal" ? "h" : "w";
  const sorted = [...regions].sort((left, right) => left[crossStart] - right[crossStart]);
  const groups: LayoutRegion[][] = [];

  for (const region of sorted) {
    const group = groups.find((candidate) => regionOverlapRatio(region, groupBounds(candidate), crossStart, crossSize) >= 0.5);
    if (group) {
      group.push(region);
    } else {
      groups.push([region]);
    }
  }

  return groups;
}

function adjacentGapsPx(regions: LayoutRegion[], layout: LayoutIR, axis: "horizontal" | "vertical"): number[] {
  const start = axis === "horizontal" ? "x" : "y";
  const size = axis === "horizontal" ? "w" : "h";
  const sorted = [...regions].sort((left, right) => left[start] - right[start]);
  const gaps: number[] = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    const gap = next[start] - (current[start] + current[size]);
    if (gap < 0) continue;
    gaps.push(Number(toPx(gap, layout).toFixed(1)));
  }

  return gaps;
}

function isContentRegionForSpacing(region: LayoutRegion): boolean {
  return CONTENT_REGION_ROLES.has(region.role) && region.blockIds.length > 0;
}

function groupBounds(regions: LayoutRegion[]): Pick<LayoutRegion, "x" | "y" | "w" | "h"> {
  const minX = Math.min(...regions.map((region) => region.x));
  const minY = Math.min(...regions.map((region) => region.y));
  const maxX = Math.max(...regions.map((region) => region.x + region.w));
  const maxY = Math.max(...regions.map((region) => region.y + region.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function regionOverlapRatio(left: Pick<LayoutRegion, "x" | "y" | "w" | "h">, right: Pick<LayoutRegion, "x" | "y" | "w" | "h">, start: "x" | "y", size: "w" | "h"): number {
  const leftStart = left[start];
  const leftEnd = left[start] + left[size];
  const rightStart = right[start];
  const rightEnd = right[start] + right[size];
  const overlap = Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart));
  return overlap / Math.max(1e-6, Math.min(left[size], right[size]));
}

function toPx(value: number, layout: LayoutIR): number {
  return layout.slideSize.unit === "px" ? value : value * 96;
}

function sectionStyleDriftDiagnostics(presentation: PresentationIR, layout: LayoutIR): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const layoutBySlideId = new Map(layout.slides.map((slide) => [slide.sourceSlideId, slide]));
  const groups = new Map<string, Array<{ slide: SlideIR; preset: string }>>();

  for (const slide of presentation.slides) {
    if (slide.role !== "content") continue;
    const sectionKey = sectionKeyForStyleDrift(slide);
    if (!sectionKey) continue;
    const layoutSlide = layoutBySlideId.get(slide.id);
    if (!layoutSlide) continue;
    const group = groups.get(sectionKey) ?? [];
    group.push({ slide, preset: layoutSlide.layout.preset });
    groups.set(sectionKey, group);
  }

  for (const [section, entries] of groups) {
    const distinctPresets = Array.from(new Set(entries.map((entry) => entry.preset)));
    if (entries.length < 3 || distinctPresets.length < 3) continue;
    diagnostics.push({
      level: "warning",
      code: "SECTION_STYLE_DRIFT",
      slideId: entries[0]?.slide.id,
      message: `Section "${section}" uses ${distinctPresets.length} layout motifs across ${entries.length} content slides (${distinctPresets.join(", ")}).`,
    });
  }

  return diagnostics;
}

function sectionKeyForStyleDrift(slide: SlideIR): string | undefined {
  if (slide.section) return slide.section;
  if (slide.headingPath.length > 2) return slide.headingPath.slice(0, -1).join(" / ");
  return undefined;
}

function continuationTitleDiagnostics(presentation: PresentationIR): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const groups = new Map<string, SlideIR[]>();

  for (const slide of presentation.slides) {
    if (slide.role !== "content") continue;
    const key = stableJson(slide.headingPath);
    const group = groups.get(key) ?? [];
    group.push(slide);
    groups.set(key, group);
  }

  for (const slides of groups.values()) {
    if (slides.length < 2) continue;
    for (const slide of slides.slice(1)) {
      if (/\(Cont\.\s+\d+\/\d+\)/.test(slide.title ?? "")) continue;
      diagnostics.push({
        level: "warning",
        code: "DENSE_CONTINUATION_WITHOUT_TITLE",
        slideId: slide.id,
        message: `Continuation slide "${slide.title ?? slide.id}" should include a continuation marker in its title.`,
      });
    }
  }

  return diagnostics;
}

function isClaimLikeText(text: string): boolean {
  return /\b(should|must|because|therefore|shows|means|indicates|suggests|result|impact|why|goal|purpose|objective)\b/i.test(text) ||
    /목적|이유|결과|의미|따라서|때문|필요|개선/.test(text);
}

function isCaptionLikeText(text: string): boolean {
  const normalized = text.trim();
  return normalized.length > 0 && normalized.length <= 120 && /^(figure|fig\.|image|source|caption|그림|출처)[:\s]/i.test(normalized);
}

function parseHex(color: string): { r: number; g: number; b: number } | undefined {
  const normalized = color.replace(/^#/, "").toUpperCase();
  const hex = /^[0-9A-F]{3}$/.test(normalized)
    ? normalized.split("").map((char) => `${char}${char}`).join("")
    : normalized;
  if (!/^[0-9A-F]{6}$/.test(hex)) return undefined;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function contrastRatio(left: { r: number; g: number; b: number }, right: { r: number; g: number; b: number }): number {
  const leftLum = relativeLuminance(left);
  const rightLum = relativeLuminance(right);
  const light = Math.max(leftLum, rightLum);
  const dark = Math.min(leftLum, rightLum);
  return (light + 0.05) / (dark + 0.05);
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
