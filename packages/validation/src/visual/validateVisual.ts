import type { Diagnostic } from "@mdpresent/core";
import type { LayoutIR } from "@mdpresent/layout";

type LayoutRegion = LayoutIR["slides"][number]["regions"][number];

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
