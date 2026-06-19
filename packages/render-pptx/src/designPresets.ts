import type PptxGenJS from "pptxgenjs";
import { resolveDesignTokens, type DesignPresetName, type DesignTokens } from "@mdpresent/core";
import type { LayoutRegion, LayoutSlide, SlideSize, ThemeTokens } from "@mdpresent/layout";

export type { DesignPresetName };
export type DesignPreset = DesignTokens;

export function resolveDesignPreset(name: DesignPresetName | undefined, theme: ThemeTokens): DesignPreset {
  return resolveDesignTokens(name ?? theme.designPreset, theme);
}

export function addPresetBackground(
  slide: PptxGenJS.Slide,
  preset: DesignPreset,
  slideSize: SlideSize,
): void {
  if (preset.cornerAccent) {
    slide.addShape("rect", {
      x: slideSize.width - 2.25,
      y: 0,
      w: 2.25,
      h: 0.28,
      fill: { color: preset.primaryColor },
      line: { color: preset.primaryColor, transparency: 100 },
    });
    slide.addShape("rect", {
      x: slideSize.width - 1.25,
      y: 0.28,
      w: 1.25,
      h: 0.08,
      fill: { color: preset.secondaryColor },
      line: { color: preset.secondaryColor, transparency: 100 },
    });
  }

  if (preset.titleRule) {
    slide.addShape("rect", {
      x: 0.8,
      y: 1.32,
      w: 1.45,
      h: 0.06,
      fill: { color: preset.ruleColor },
      line: { color: preset.ruleColor, transparency: 100 },
    });
  }
}

export function addRegionSurface(slide: PptxGenJS.Slide, preset: DesignPreset, region: LayoutRegion): void {
  if (!region.blockIds.length) return;
  if (!preset.cards || !["item", "table", "code"].includes(region.role) && region.id !== "key-message") return;

  if (region.id === "key-message") {
    const stripe = keyMessageStripe(region);
    slide.addShape("roundRect", {
      x: region.x,
      y: region.y,
      w: region.w,
      h: region.h,
      rectRadius: 0.06,
      fill: { color: preset.surfaceFill },
      line: { color: preset.surfaceLine, transparency: 18, pt: 1 },
    });
    slide.addShape("roundRect", {
      x: stripe.x,
      y: stripe.y,
      w: stripe.w,
      h: stripe.h,
      rectRadius: 0.02,
      fill: { color: preset.primaryColor },
      line: { color: preset.primaryColor, transparency: 100 },
    });
    return;
  }

  slide.addShape("roundRect", {
    x: region.x,
    y: region.y,
    w: region.w,
    h: region.h,
    rectRadius: 0.06,
    fill: { color: preset.surfaceFill },
    line: { color: preset.surfaceLine, transparency: 10, pt: 1 },
  });
}

function keyMessageStripe(region: LayoutRegion): { x: number; y: number; w: number; h: number } {
  const inset = Math.min(0.16, Math.max(0.08, region.h * 0.1));
  return {
    x: region.x + inset,
    y: region.y + inset,
    w: 0.08,
    h: Math.max(0.08, region.h - inset * 2),
  };
}
