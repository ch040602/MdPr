import type { LayoutIR, LayoutSlide } from "@mdpresent/layout";
import type { OverrideTarget } from "./types.js";

export function resolveTarget(layout: LayoutIR, target: OverrideTarget): LayoutSlide[] {
  if (target.slideId) return layout.slides.filter((s) => s.sourceSlideId === target.slideId || s.id === target.slideId);
  if (target.slideIndex) return layout.slides.filter((s) => s.index === target.slideIndex);

  // title/headingPath/intent target은 Presentation IR이 필요하다.
  // MVP skeleton에서는 Layout IR만으로 resolve 가능한 target만 처리한다.
  return [];
}
