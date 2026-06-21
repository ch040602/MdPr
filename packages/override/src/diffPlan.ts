import type { LayoutIR } from "@mdpresent/layout";

export type LayoutDiff = {
  slideId: string;
  path: string;
  before: unknown;
  after: unknown;
};

export function diffLayout(before: LayoutIR, after: LayoutIR): LayoutDiff[] {
  const diffs: LayoutDiff[] = [];

  for (const beforeSlide of before.slides) {
    const afterSlide = after.slides.find((s) => s.sourceSlideId === beforeSlide.sourceSlideId);
    if (!afterSlide) continue;

    if (beforeSlide.layout.preset !== afterSlide.layout.preset) {
      diffs.push({ slideId: beforeSlide.sourceSlideId, path: "layout.preset", before: beforeSlide.layout.preset, after: afterSlide.layout.preset });
    }
    if (beforeSlide.layout.columns !== afterSlide.layout.columns) {
      diffs.push({ slideId: beforeSlide.sourceSlideId, path: "layout.columns", before: beforeSlide.layout.columns, after: afterSlide.layout.columns });
    }
    if (beforeSlide.layout.rows !== afterSlide.layout.rows) {
      diffs.push({ slideId: beforeSlide.sourceSlideId, path: "layout.rows", before: beforeSlide.layout.rows, after: afterSlide.layout.rows });
    }
    for (const beforeRegion of beforeSlide.regions) {
      const afterRegion = afterSlide.regions.find((region) => region.id === beforeRegion.id);
      if (!afterRegion) continue;
      if (beforeRegion.typography?.fontSize !== afterRegion.typography?.fontSize) {
        diffs.push({
          slideId: beforeSlide.sourceSlideId,
          path: `regions.${beforeRegion.id}.typography.fontSize`,
          before: beforeRegion.typography?.fontSize,
          after: afterRegion.typography?.fontSize,
        });
      }
      if (beforeRegion.typography?.minFontSize !== afterRegion.typography?.minFontSize) {
        diffs.push({
          slideId: beforeSlide.sourceSlideId,
          path: `regions.${beforeRegion.id}.typography.minFontSize`,
          before: beforeRegion.typography?.minFontSize,
          after: afterRegion.typography?.minFontSize,
        });
      }
    }
  }

  return diffs;
}
