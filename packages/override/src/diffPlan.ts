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
  }

  return diffs;
}
