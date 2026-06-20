import type PptxGenJS from "pptxgenjs";
import { resolveDesignTokens, type DecorationStyleName, type DesignPresetName, type DesignTokens } from "@mdpresent/core";
import type { LayoutRegion, LayoutSlide, SlideSize, ThemeTokens } from "@mdpresent/layout";

export type { DesignPresetName };
export type DesignPreset = DesignTokens;

export function resolveDesignPreset(name: DecorationStyleName | DesignPresetName | undefined, theme: ThemeTokens): DesignPreset {
  return resolveDesignTokens(name ?? theme.decorationStyle ?? theme.designPreset, theme);
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
  if (!preset.cards || !["item", "table", "chart", "code"].includes(region.role) && !["key-message", "body-panel"].includes(region.id)) return;

  if (region.id === "key-message") {
    const stripe = keyMessageStripe(region);
    addSurfaceLayer(slide, preset, region, {
      fill: preset.surfaceFill,
      fillOpacity: 1,
      lineTransparency: 18,
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

  addSurfaceLayer(slide, preset, region, {
    fill: preset.surfaceFill,
    fillOpacity: preset.surfacePolicy.opacity,
    lineTransparency: 10,
  });
}

function addSurfaceLayer(
  slide: PptxGenJS.Slide,
  preset: DesignPreset,
  region: LayoutRegion,
  options: { fill: string; fillOpacity: number; lineTransparency: number },
): void {
  const radius = surfaceRadius(preset, region);
  if (preset.surfacePolicy.shapeSource === "svg") {
    slide.addImage({
      data: svgSurfaceDataUri(options.fill, options.fillOpacity, radius, region),
      x: region.x,
      y: region.y,
      w: region.w,
      h: region.h,
    } as never);
    slide.addShape(surfaceShape(preset), {
      x: region.x,
      y: region.y,
      w: region.w,
      h: region.h,
      rectRadius: radius,
      fill: { color: options.fill, transparency: 100 },
      line: { color: preset.surfaceLine, transparency: options.lineTransparency, pt: 1 },
      ...surfaceEffect(preset),
    } as never);
    return;
  }

  slide.addShape(surfaceShape(preset), {
    x: region.x,
    y: region.y,
    w: region.w,
    h: region.h,
    rectRadius: radius,
    fill: { color: options.fill, transparency: Math.round((1 - options.fillOpacity) * 100) },
    line: { color: preset.surfaceLine, transparency: options.lineTransparency, pt: 1 },
    ...surfaceEffect(preset),
  } as never);
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

function surfaceShape(preset: DesignPreset): "roundRect" | "rect" {
  return preset.surfacePolicy.shapeSource === "pptx" && preset.surfacePolicy.cornerScale === "fixed" ? "roundRect" : "roundRect";
}

function surfaceRadius(preset: DesignPreset, region: LayoutRegion): number {
  if (preset.surfacePolicy.cornerScale === "fixed") return 0.06;
  return Number(Math.min(0.18, Math.max(0.025, Math.min(region.w, region.h) * 0.055)).toFixed(3));
}

function surfaceEffect(preset: DesignPreset): Partial<PptxGenJS.ShapeProps> {
  if (preset.surfacePolicy.shadow === "none") return {};
  if (preset.surfacePolicy.shadow === "glass") {
    return {
      transparency: Math.round((1 - preset.surfacePolicy.opacity) * 100),
      shadow: { type: "outer", color: "64748B", opacity: 0.14, blur: 1.2, angle: 45 },
    } as Partial<PptxGenJS.ShapeProps>;
  }
  return {
    shadow: { type: "outer", color: "000000", opacity: 0.08, blur: 1, angle: 45 },
  } as Partial<PptxGenJS.ShapeProps>;
}

function svgSurfaceDataUri(fill: string, opacity: number, radiusInches: number, region: LayoutRegion): string {
  const viewBox = 1000;
  const minSide = Math.max(0.01, Math.min(region.w, region.h));
  const radius = Math.min(180, Math.max(18, Math.round((radiusInches / minSide) * viewBox)));
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}" preserveAspectRatio="none">`,
    `<rect x="0" y="0" width="${viewBox}" height="${viewBox}" rx="${radius}" ry="${radius}" fill="#${fill}" fill-opacity="${opacity.toFixed(3)}"/>`,
    "</svg>",
  ].join("");
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
}
