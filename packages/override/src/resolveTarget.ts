import type { PresentationIR } from "@mdpresent/core";
import type { LayoutIR, LayoutSlide } from "@mdpresent/layout";
import type { OverrideTarget } from "./types.js";

export function resolveTarget(layout: LayoutIR, target: OverrideTarget, presentation?: PresentationIR): LayoutSlide[] {
  if (target.slideId) return layout.slides.filter((s) => s.sourceSlideId === target.slideId || s.id === target.slideId);
  if (target.slideIndex) return layout.slides.filter((s) => s.index === target.slideIndex);
  if (target.title && presentation) {
    const slideIds = new Set(presentation.slides.filter((slide) => slide.title === target.title).map((slide) => slide.id));
    return layout.slides.filter((slide) => slideIds.has(slide.sourceSlideId));
  }
  if (target.headingPath && presentation) {
    const serialized = JSON.stringify(target.headingPath);
    const slideIds = new Set(presentation.slides.filter((slide) => JSON.stringify(slide.headingPath) === serialized).map((slide) => slide.id));
    return layout.slides.filter((slide) => slideIds.has(slide.sourceSlideId));
  }
  if (target.intent && presentation) {
    const slideIds = new Set(presentation.slides.filter((slide) => slide.intent === target.intent).map((slide) => slide.id));
    return layout.slides.filter((slide) => slideIds.has(slide.sourceSlideId));
  }

  return [];
}
