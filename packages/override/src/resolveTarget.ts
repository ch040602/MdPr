import type { PresentationIR, SlideIR } from "@mdpresent/core";
import type { LayoutIR, LayoutSlide } from "@mdpresent/layout";
import type { OverrideTarget } from "./types.js";

export function resolveTarget(layout: LayoutIR, target: OverrideTarget, presentation?: PresentationIR): LayoutSlide[] {
  if (target.slideId) return layout.slides.filter((s) => s.sourceSlideId === target.slideId || s.id === target.slideId);
  if (target.slideIndex) return layout.slides.filter((s) => s.index === target.slideIndex);

  if (presentation) {
    const slideIds = new Set(presentation.slides.filter((slide) => matchesPresentationTarget(slide, target)).map((slide) => slide.id));
    return layout.slides.filter((slide) => slideIds.has(slide.sourceSlideId));
  }

  return [];
}

function matchesPresentationTarget(slide: SlideIR, target: OverrideTarget): boolean {
  if (target.title && slide.title !== target.title) return false;
  if (target.intent && slide.intent !== target.intent) return false;
  if (target.headingPath && !sameHeadingPath(slide.headingPath, target.headingPath)) return false;
  return Boolean(target.title || target.intent || target.headingPath);
}

function sameHeadingPath(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
