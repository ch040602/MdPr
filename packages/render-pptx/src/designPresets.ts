import type PptxGenJS from "pptxgenjs";
import { resolveDesignTokens, type DecorationStyleName, type DesignPresetName, type DesignTokens } from "@mdpresent/core";
import type { LayoutRegion, LayoutSlide, SlideSize, ThemeTokens } from "@mdpresent/layout";

export type { DesignPresetName };
export type DesignPreset = DesignTokens;
type SurfaceVariant = "rounded" | "two-corner-left" | "two-corner-right" | "flag-drop" | "circle-vine" | "notched-corner" | "ticket";

export function resolveDesignPreset(name: DecorationStyleName | DesignPresetName | undefined, theme: ThemeTokens): DesignPreset {
  return resolveDesignTokens(name ?? theme.decorationStyle ?? theme.designPreset, theme);
}

export function addPresetBackground(
  slide: PptxGenJS.Slide,
  preset: DesignPreset,
  slideSize: SlideSize,
): void {
  if (preset.decorationStyle === "glass" || preset.decorationStyle === "glassmorphism") {
    addGlassBackground(slide, preset, slideSize);
  } else if (preset.decorationStyle === "liquid-glass") {
    addLiquidGlassBackground(slide, preset, slideSize);
  } else if (preset.decorationStyle === "newmorphism") {
    addNewmorphismBackground(slide, preset, slideSize);
  } else if (preset.decorationStyle === "neomorphism") {
    addNeomorphismBackground(slide, preset, slideSize);
  } else if (preset.decorationStyle === "minimalism") {
    addMinimalismBackground(slide, preset, slideSize);
  } else if (preset.decorationStyle === "skeuomorphism") {
    addSkeuomorphismBackground(slide, preset, slideSize);
  } else if (preset.decorationStyle === "claymorphism") {
    addClaymorphismBackground(slide, preset, slideSize);
  } else if (preset.decorationStyle === "brutalism") {
    addBrutalismBackground(slide, preset, slideSize);
  } else if (preset.decorationStyle === "bentogrid") {
    addBentoGridBackground(slide, preset, slideSize);
  } else if (preset.decorationStyle === "data") {
    addDataBackground(slide, preset, slideSize);
  }

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

function addNewmorphismBackground(slide: PptxGenJS.Slide, preset: DesignPreset, slideSize: SlideSize): void {
  slide.addShape("roundRect", {
    ...boundedBox(slideSize, { x: slideSize.width - 3.08, y: 0.42, w: 1.9, h: 0.34 }),
    rectRadius: 0.05,
    fill: { color: "F8FAFC", transparency: 28 },
    line: { color: "FFFFFF", transparency: 72, pt: 0.4 },
    shadow: { type: "outer", color: "B8C3D2", opacity: 0.16, blur: 1.2, angle: 45, distance: 0.55 },
  } as never);
  slide.addShape("ellipse", {
    ...boundedBox(slideSize, { x: slideSize.width - 2.0, y: 0.55, w: 0.9, h: 0.9 }),
    fill: { color: "F7FAFC", transparency: 8 },
    line: { color: "FFFFFF", transparency: 100 },
    shadow: { type: "outer", color: "C7D0DE", opacity: 0.22, blur: 1.2, angle: 45, distance: 0.9 },
  } as never);
  slide.addShape("ellipse", {
    ...boundedBox(slideSize, { x: 0.58, y: slideSize.height - 1.28, w: 0.72, h: 0.72 }),
    fill: { color: preset.backgroundColor, transparency: 0 },
    line: { color: "FFFFFF", transparency: 58, pt: 0.6 },
    shadow: { type: "outer", color: "B8C3D2", opacity: 0.18, blur: 1.0, angle: 45, distance: 0.8 },
  } as never);
  slide.addShape("line" as never, {
    x: slideSize.width - 3.2,
    y: slideSize.height - 0.46,
    w: 2.18,
    h: 0,
    line: { color: "FFFFFF", transparency: 12, pt: 1.2 },
  });
  slide.addShape("line" as never, {
    x: slideSize.width - 3.12,
    y: slideSize.height - 0.39,
    w: 2.1,
    h: 0,
    line: { color: "B8C3D2", transparency: 36, pt: 0.9 },
  });
}

function addNeomorphismBackground(slide: PptxGenJS.Slide, preset: DesignPreset, slideSize: SlideSize): void {
  slide.addShape("roundRect", {
    ...boundedBox(slideSize, { x: 0.54, y: slideSize.height - 1.1, w: slideSize.width - 1.08, h: 0.46 }),
    rectRadius: 0.08,
    fill: { color: "DDE8F2", transparency: 38 },
    line: { color: "FFFFFF", transparency: 68, pt: 0.35 },
    shadow: { type: "outer", color: "A8B6C8", opacity: 0.08, blur: 0.7, angle: 45, distance: 0.25 },
  } as never);
  slide.addShape("roundRect", {
    ...boundedBox(slideSize, { x: 0.82, y: slideSize.height - 0.96, w: 2.3, h: 0.16 }),
    rectRadius: 0.04,
    fill: { color: preset.primaryColor, transparency: 56 },
    line: { color: preset.primaryColor, transparency: 100 },
  } as never);
  slide.addShape("ellipse", {
    ...boundedBox(slideSize, { x: slideSize.width - 1.62, y: 0.56, w: 0.54, h: 0.54 }),
    fill: { color: "FFFFFF", transparency: 12 },
    line: { color: "CBD7E4", transparency: 50, pt: 0.45 },
    shadow: { type: "outer", color: "A8B6C8", opacity: 0.14, blur: 0.9, angle: 45, distance: 0.45 },
  } as never);
  slide.addShape("line" as never, {
    x: 0.82,
    y: 0.82,
    w: 1.48,
    h: 0,
    line: { color: preset.primaryColor, transparency: 16, pt: 1.1 },
  });
  slide.addShape("line" as never, {
    x: slideSize.width - 2.3,
    y: slideSize.height - 0.78,
    w: 1.3,
    h: 0,
    line: { color: "FFFFFF", transparency: 18, pt: 1.4 },
  });
}

function addMinimalismBackground(slide: PptxGenJS.Slide, preset: DesignPreset, slideSize: SlideSize): void {
  slide.addShape("line" as never, {
    x: 0.82,
    y: 0.78,
    w: Math.min(2.4, slideSize.width * 0.18),
    h: 0,
    line: { color: preset.primaryColor, transparency: 18, pt: 0.9 },
  });
  slide.addShape("line" as never, {
    x: slideSize.width - Math.min(2.3, slideSize.width * 0.18) - 0.82,
    y: slideSize.height - 0.72,
    w: Math.min(2.3, slideSize.width * 0.18),
    h: 0,
    line: { color: preset.surfaceLine, transparency: 18, pt: 0.7 },
  });
  const tick = 0.36;
  slide.addShape("line" as never, {
    x: 0.64,
    y: 0.64,
    w: tick,
    h: 0,
    line: { color: preset.surfaceLine, transparency: 28, pt: 0.5 },
  });
  slide.addShape("line" as never, {
    x: 0.64,
    y: 0.64,
    w: 0,
    h: tick,
    line: { color: preset.surfaceLine, transparency: 28, pt: 0.5 },
  });
  slide.addShape("line" as never, {
    x: slideSize.width - 0.64 - tick,
    y: slideSize.height - 0.64,
    w: tick,
    h: 0,
    line: { color: preset.surfaceLine, transparency: 28, pt: 0.5 },
  });
  slide.addShape("line" as never, {
    x: slideSize.width - 0.64,
    y: slideSize.height - 0.64 - tick,
    w: 0,
    h: tick,
    line: { color: preset.surfaceLine, transparency: 28, pt: 0.5 },
  });
  slide.addShape("line" as never, {
    x: 0.82,
    y: slideSize.height - 0.46,
    w: slideSize.width - 1.64,
    h: 0,
    line: { color: preset.surfaceLine, transparency: 82, pt: 0.35 },
  });
}

function addSkeuomorphismBackground(slide: PptxGenJS.Slide, preset: DesignPreset, slideSize: SlideSize): void {
  slide.addShape("roundRect", {
    ...boundedBox(slideSize, { x: 0.5, y: 0.44, w: slideSize.width - 1.0, h: slideSize.height - 0.88 }),
    rectRadius: 0.14,
    fill: { color: "E6EAF0", transparency: 0 },
    line: { color: "8793A3", transparency: 16, pt: 1.4 },
    shadow: { type: "outer", color: "475569", opacity: 0.18, blur: 1.1, angle: 45, distance: 0.58 },
  } as never);
  slide.addShape("roundRect", {
    ...boundedBox(slideSize, { x: 0.58, y: 0.5, w: slideSize.width - 1.16, h: slideSize.height - 1.0 }),
    rectRadius: 0.12,
    fill: { color: "FFFFFF", transparency: 0 },
    line: { color: preset.surfaceLine, transparency: 8, pt: 1.1 },
    shadow: { type: "outer", color: "64748B", opacity: 0.16, blur: 1.2, angle: 45, distance: 0.6 },
  } as never);
  slide.addShape("line" as never, {
    x: 0.72,
    y: 0.68,
    w: slideSize.width - 1.44,
    h: 0,
    line: { color: "FFFFFF", transparency: 0, pt: 1.3 },
  });
  slide.addShape("line" as never, {
    x: 0.72,
    y: slideSize.height - 0.7,
    w: slideSize.width - 1.44,
    h: 0,
    line: { color: "94A3B8", transparency: 34, pt: 1.1 },
  });
  slide.addShape("roundRect", {
    ...boundedBox(slideSize, { x: slideSize.width - 1.74, y: 0.56, w: 0.96, h: 0.22 }),
    rectRadius: 0.04,
    fill: { color: "D7DDE6", transparency: 8 },
    line: { color: "FFFFFF", transparency: 18, pt: 0.45 },
  } as never);
  for (const x of [0.86, slideSize.width - 1.02]) {
    slide.addShape("ellipse", {
      ...boundedBox(slideSize, { x, y: 0.72, w: 0.16, h: 0.16 }),
      fill: { color: "CBD5E1", transparency: 8 },
      line: { color: "64748B", transparency: 36, pt: 0.4 },
    } as never);
  }
}

function addClaymorphismBackground(slide: PptxGenJS.Slide, preset: DesignPreset, slideSize: SlideSize): void {
  const blobs = [
    { x: slideSize.width - 2.65, y: 0.46, w: 1.18, h: 1.18, color: preset.primaryColor, transparency: 14 },
    { x: 0.55, y: slideSize.height - 1.38, w: 1.04, h: 1.04, color: preset.secondaryColor, transparency: 14 },
    { x: slideSize.width - 1.6, y: slideSize.height - 1.2, w: 0.72, h: 0.72, color: "FDE047", transparency: 18 },
  ];
  for (const blob of blobs) {
    slide.addShape("ellipse", {
      ...boundedBox(slideSize, blob),
      fill: { color: blob.color, transparency: blob.transparency },
      line: { color: "FFFFFF", transparency: 72, pt: 0.5 },
      shadow: { type: "outer", color: blob.color, opacity: 0.14, blur: 1.6, angle: 45, distance: 0.55 },
    } as never);
  }
  slide.addShape("roundRect", {
    ...boundedBox(slideSize, { x: slideSize.width - 1.18, y: 0.18, w: 0.78, h: 0.14 }),
    rectRadius: 0.04,
    fill: { color: preset.secondaryColor, transparency: 0 },
    line: { color: preset.secondaryColor, transparency: 100 },
  } as never);
  slide.addShape("roundRect", {
    ...boundedBox(slideSize, { x: slideSize.width - 2.18, y: 0.24, w: 0.92, h: 0.12 }),
    rectRadius: 0.04,
    fill: { color: preset.primaryColor, transparency: 0 },
    line: { color: "FFFFFF", transparency: 100 },
  } as never);
}

function addBrutalismBackground(slide: PptxGenJS.Slide, preset: DesignPreset, slideSize: SlideSize): void {
  slide.addShape("rect", {
    ...boundedBox(slideSize, { x: 0.42, y: 0.4, w: slideSize.width - 0.84, h: slideSize.height - 0.8 }),
    fill: { color: preset.backgroundColor, transparency: 100 },
    line: { color: preset.primaryColor, transparency: 0, pt: 2.4 },
  });
  slide.addShape("rect", {
    ...boundedBox(slideSize, { x: slideSize.width - 2.1, y: 0.5, w: 1.2, h: 0.34 }),
    fill: { color: preset.secondaryColor },
    line: { color: preset.primaryColor, transparency: 0, pt: 1.2 },
  });
  slide.addShape("rect", {
    ...boundedBox(slideSize, { x: slideSize.width - 2.36, y: 0.34, w: 1.34, h: 0.22 }),
    fill: { color: preset.primaryColor },
    line: { color: preset.primaryColor, transparency: 100 },
  });
  slide.addShape("rect", {
    ...boundedBox(slideSize, { x: slideSize.width - 2.0, y: 0.5, w: 0.94, h: 0.22 }),
    fill: { color: preset.secondaryColor },
    line: { color: preset.primaryColor, transparency: 0, pt: 1.0 },
  });
  slide.addShape("line" as never, {
    x: 0.52,
    y: 0.84,
    w: 1.48,
    h: 0,
    line: { color: preset.primaryColor, transparency: 0, pt: 2.0 },
  });
  slide.addShape("line" as never, {
    x: 0.52,
    y: slideSize.height - 0.54,
    w: slideSize.width - 1.04,
    h: 0,
    line: { color: preset.primaryColor, transparency: 0, pt: 2.0 },
  });
}

function addLiquidGlassBackground(slide: PptxGenJS.Slide, preset: DesignPreset, slideSize: SlideSize): void {
  addGlassBackground(slide, preset, slideSize);
  slide.addShape("roundRect", {
    ...boundedBox(slideSize, { x: 0.58, y: 0.48, w: slideSize.width * 0.54, h: 0.16 }),
    rectRadius: 0.06,
    rotate: -3,
    fill: { color: "FFFFFF", transparency: 78 },
    line: { color: "FFFFFF", transparency: 100 },
  } as never);
  slide.addShape("roundRect", {
    ...boundedBox(slideSize, { x: slideSize.width * 0.62, y: 0.28, w: slideSize.width * 0.25, h: 0.22 }),
    rectRadius: 0.07,
    rotate: 2,
    fill: { color: preset.primaryColor, transparency: 36 },
    line: { color: "FFFFFF", transparency: 82, pt: 0.45 },
  } as never);
  slide.addShape("ellipse", {
    ...boundedBox(slideSize, { x: slideSize.width - 2.6, y: 0.72, w: 1.35, h: 1.35 }),
    fill: { color: preset.secondaryColor, transparency: 78 },
    line: { color: "FFFFFF", transparency: 64, pt: 0.6 },
    shadow: { type: "outer", color: preset.secondaryColor, opacity: 0.2, blur: 1.6, angle: 45, distance: 0.5 },
  } as never);
  slide.addShape("ellipse", {
    ...boundedBox(slideSize, { x: 0.62, y: slideSize.height - 1.48, w: 1.08, h: 1.08 }),
    fill: { color: preset.primaryColor, transparency: 82 },
    line: { color: "FFFFFF", transparency: 70, pt: 0.5 },
  } as never);
}

function addBentoGridBackground(slide: PptxGenJS.Slide, preset: DesignPreset, slideSize: SlideSize): void {
  const step = 0.62;
  for (let x = 0.65; x < slideSize.width - 0.65; x += step) {
    slide.addShape("line" as never, {
      x,
      y: 0.58,
      w: 0,
      h: slideSize.height - 1.16,
      line: { color: preset.surfaceLine, transparency: 82, pt: 0.35 },
    });
  }
  for (let y = 0.58; y < slideSize.height - 0.58; y += step) {
    slide.addShape("line" as never, {
      x: 0.65,
      y,
      w: slideSize.width - 1.3,
      h: 0,
      line: { color: preset.surfaceLine, transparency: 84, pt: 0.35 },
    });
  }
  for (const box of [
    { x: 0.72, y: 0.66, w: 1.1, h: 0.32, color: preset.primaryColor, transparency: 72 },
    { x: slideSize.width - 2.55, y: slideSize.height - 0.96, w: 1.74, h: 0.32, color: preset.secondaryColor, transparency: 82 },
  ]) {
    slide.addShape("roundRect", {
      ...boundedBox(slideSize, box),
      rectRadius: 0.04,
      fill: { color: box.color, transparency: box.transparency },
      line: { color: box.color, transparency: 100 },
    } as never);
  }
  slide.addShape("roundRect", {
    ...boundedBox(slideSize, { x: slideSize.width - 1.74, y: 0.5, w: 1.0, h: 0.28 }),
    rectRadius: 0.04,
    fill: { color: preset.primaryColor, transparency: 8 },
    line: { color: preset.primaryColor, transparency: 100 },
  } as never);
}

function addGlassBackground(slide: PptxGenJS.Slide, preset: DesignPreset, slideSize: SlideSize): void {
  slide.addShape("roundRect", {
    ...boundedBox(slideSize, { x: 0.34, y: 0.28, w: slideSize.width - 1.42, h: slideSize.height - 1.18 }),
    rectRadius: 0.12,
    fill: { color: preset.primaryColor, transparency: 74 },
    line: { color: "FFFFFF", transparency: 86, pt: 0.45 },
    shadow: { type: "outer", color: preset.primaryColor, opacity: 0.1, blur: 1.0, angle: 45, distance: 0.4 },
  } as never);
  slide.addShape("roundRect", {
    ...boundedBox(slideSize, { x: 0.62, y: 0.52, w: slideSize.width - 1.24, h: slideSize.height - 1.04 }),
    rectRadius: 0.14,
    fill: { color: preset.surfaceFill, transparency: 100 },
    line: { color: "FFFFFF", transparency: 72, pt: 0.75 },
    shadow: { type: "outer", color: preset.primaryColor, opacity: 0.12, blur: 1.2, angle: 45, distance: 0.35 },
  } as never);
  slide.addShape("rect", {
    ...boundedBox(slideSize, { x: 0.78, y: 1.32, w: 1.45, h: 0.07 }),
    fill: { color: preset.primaryColor, transparency: 12 },
    line: { color: preset.primaryColor, transparency: 100 },
  });
  slide.addShape("rect", {
    ...boundedBox(slideSize, { x: slideSize.width - 1.45, y: 0.0, w: 1.45, h: 0.28 }),
    fill: { color: preset.primaryColor, transparency: 10 },
    line: { color: preset.primaryColor, transparency: 100 },
  });
  slide.addShape("rect", {
    ...boundedBox(slideSize, { x: slideSize.width - 1.0, y: 0.28, w: 1.0, h: 0.07 }),
    fill: { color: preset.secondaryColor, transparency: 8 },
    line: { color: preset.secondaryColor, transparency: 100 },
  });
  slide.addShape("line" as never, {
    x: 0.82,
    y: 0.82,
    w: slideSize.width * 0.36,
    h: 0,
    line: { color: "FFFFFF", transparency: 34, pt: 1.1 },
  });
  slide.addShape("line" as never, {
    x: slideSize.width - 3.25,
    y: slideSize.height - 0.86,
    w: 2.2,
    h: 0,
    line: { color: preset.secondaryColor, transparency: 44, pt: 1.4 },
  });
  slide.addShape("line" as never, {
    x: slideSize.width - 2.8,
    y: 0.66,
    w: 1.48,
    h: 0,
    line: { color: "FFFFFF", transparency: 46, pt: 0.75 },
  });
}

function addDataBackground(slide: PptxGenJS.Slide, preset: DesignPreset, slideSize: SlideSize): void {
  slide.addText("DATA", {
    x: 0.66,
    y: 0.34,
    w: 1.15,
    h: 0.22,
    fontSize: 8,
    bold: true,
    color: preset.primaryColor,
    charSpace: 1.6,
    margin: 0,
    breakLine: false,
    isTextBox: true,
  } as never);
  const railY = slideSize.height - 0.62;
  for (let index = 0; index < 8; index++) {
    const w = 0.26 + (index % 4) * 0.14;
    slide.addShape("rect", {
      x: 0.68 + index * 0.55,
      y: railY - w * 0.34,
      w: 0.34,
      h: w,
      fill: { color: index % 3 === 0 ? preset.primaryColor : preset.surfaceLine, transparency: index % 3 === 0 ? 0 : 28 },
      line: { color: preset.surfaceLine, transparency: 70, pt: 0.3 },
    });
  }
  slide.addShape("line" as never, {
    x: 0.64,
    y: railY + 0.12,
    w: slideSize.width - 1.28,
    h: 0,
    line: { color: preset.surfaceLine, transparency: 28, pt: 0.8 },
  });
}

function boundedBox(slideSize: SlideSize, box: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const x = Math.max(0, Math.min(box.x, slideSize.width));
  const y = Math.max(0, Math.min(box.y, slideSize.height));
  return {
    x,
    y,
    w: Math.max(0, Math.min(box.w, slideSize.width - x)),
    h: Math.max(0, Math.min(box.h, slideSize.height - y)),
  };
}

export function addRegionSurface(slide: PptxGenJS.Slide, preset: DesignPreset, region: LayoutRegion): void {
  if (!region.blockIds.length) return;
  if (!preset.cards || !["item", "table", "chart", "code", "image"].includes(region.role) && !["key-message", "body-panel"].includes(region.id)) return;

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
  const variant = surfaceVariant(preset, region);
  if (preset.surfacePolicy.shapeSource === "svg") {
    if (preset.surfacePolicy.shadow === "newmorphic") addNewmorphicSurfaceShadows(slide, region, options.fill, preset.surfaceLine, radius);
    slide.addImage({
      data: svgSurfaceDataUri(
        options.fill,
        options.fillOpacity,
        preset.surfaceLine,
        options.lineTransparency,
        radius,
        region,
        variant,
        preset.primaryColor,
        preset.surfacePolicy.shadow === "glass",
        preset.surfacePolicy.shadow === "newmorphic",
        preset.decorationStyle,
      ),
      x: region.x,
      y: region.y,
      w: region.w,
      h: region.h,
    } as never);
    if (preset.surfacePolicy.shadow !== "none" && preset.surfacePolicy.shadow !== "newmorphic") slide.addShape("rect", {
      x: region.x,
      y: region.y,
      w: region.w,
      h: region.h,
      fill: { color: options.fill, transparency: 100 },
      line: { color: preset.surfaceLine, transparency: 100, pt: 0 },
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

function addNewmorphicSurfaceShadows(
  slide: PptxGenJS.Slide,
  region: LayoutRegion,
  fill: string,
  line: string,
  radius: number,
): void {
  const shape = "roundRect";
  slide.addShape(shape, {
    x: Math.max(0, region.x + 0.045),
    y: Math.max(0, region.y + 0.055),
    w: region.w,
    h: region.h,
    rectRadius: radius,
    fill: { color: "B8C3D2", transparency: 74 },
    line: { color: line, transparency: 100, pt: 0 },
    shadow: { type: "outer", color: "AAB5C4", opacity: 0.2, blur: 1.1, angle: 45, distance: 0.7 },
  } as never);
  slide.addShape(shape, {
    x: Math.max(0, region.x - 0.035),
    y: Math.max(0, region.y - 0.035),
    w: region.w,
    h: region.h,
    rectRadius: radius,
    fill: { color: "FFFFFF", transparency: 58 },
    line: { color: "FFFFFF", transparency: 100, pt: 0 },
    shadow: { type: "outer", color: "FFFFFF", opacity: 0.36, blur: 0.8, angle: 225, distance: 0.55 },
  } as never);
  slide.addShape(shape, {
    x: region.x,
    y: region.y,
    w: region.w,
    h: region.h,
    rectRadius: radius,
    fill: { color: fill, transparency: 94 },
    line: { color: "FFFFFF", transparency: 72, pt: 0.4 },
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
  return Number(Math.min(0.14, Math.max(0.045, Math.min(region.w, region.h) * 0.045)).toFixed(3));
}

function surfaceVariant(preset: DesignPreset, region: LayoutRegion): SurfaceVariant {
  if (region.role === "table") return "ticket";
  if (region.role === "chart") return preset.decorationStyle === "data" ? "notched-corner" : "flag-drop";
  if (region.role === "code") return "notched-corner";
  if (region.id === "key-message" || region.id === "body-panel") return "two-corner-left";
  if (region.role !== "item") return "rounded";

  const itemVariantByStyle: Record<string, SurfaceVariant> = {
    glass: "rounded",
    glassmorphism: "rounded",
    "liquid-glass": "rounded",
    newmorphism: "rounded",
    neomorphism: "rounded",
    minimalism: "rounded",
    skeuomorphism: "ticket",
    claymorphism: "circle-vine",
    brutalism: "notched-corner",
    bentogrid: "two-corner-left",
    data: "notched-corner",
    executive: "two-corner-left",
    technical: "two-corner-right",
  };
  return itemVariantByStyle[preset.decorationStyle] ?? "rounded";
}

function surfaceEffect(preset: DesignPreset): Partial<PptxGenJS.ShapeProps> {
  if (preset.surfacePolicy.shadow === "none") return {};
  if (preset.surfacePolicy.shadow === "glass") {
    return {
      transparency: Math.round((1 - preset.surfacePolicy.opacity) * 100),
      shadow: { type: "outer", color: "CBD5E1", opacity: 0.2, blur: 2.4, angle: 45, distance: 1.4 },
    } as Partial<PptxGenJS.ShapeProps>;
  }
  if (preset.surfacePolicy.shadow === "newmorphic") {
    return {
      shadow: { type: "outer", color: "B8C3D2", opacity: 0.18, blur: 1.25, angle: 45, distance: 0.9 },
    } as Partial<PptxGenJS.ShapeProps>;
  }
  return {
    shadow: { type: "outer", color: "000000", opacity: 0.08, blur: 1, angle: 45 },
  } as Partial<PptxGenJS.ShapeProps>;
}

function svgSurfaceDataUri(
  fill: string,
  opacity: number,
  stroke: string,
  lineTransparency: number,
  radiusInches: number,
  region: LayoutRegion,
  variant: SurfaceVariant,
  accent: string,
  frostedGlass = false,
  newmorphic = false,
  styleName = "clean",
): string {
  const unitsPerInch = 1000;
  const width = Math.max(10, Math.round(region.w * unitsPerInch));
  const height = Math.max(10, Math.round(region.h * unitsPerInch));
  const radius = Math.min(Math.floor(Math.min(width, height) / 2) - 1, Math.max(8, Math.round(radiusInches * unitsPerInch)));
  const strokeOpacity = Math.max(0, Math.min(1, 1 - lineTransparency / 100));
  const strokeWidth = 12;
  const base = surfaceSvgElements(width, height, radius, fill, opacity, stroke, strokeOpacity, strokeWidth, variant, accent, frostedGlass, newmorphic, styleName);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">`,
    ...base,
    "</svg>",
  ].join("");
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
}

function surfaceSvgElements(
  width: number,
  height: number,
  radius: number,
  fill: string,
  opacity: number,
  stroke: string,
  strokeOpacity: number,
  strokeWidth: number,
  variant: SurfaceVariant,
  accent: string,
  frostedGlass = false,
  newmorphic = false,
  styleName = "clean",
): string[] {
  const x = 1;
  const y = 1;
  const w = width - 2;
  const h = height - 2;
  const r = Math.max(4, Math.min(radius, Math.floor(Math.min(w, h) / 2) - 1));
  const baseProps = frostedGlass
    ? `data-mdpr-surface="${variant}" data-mdpr-style="${styleName}" data-mdpr-glass="frosted" fill="url(#glassFill)" fill-opacity="${Math.max(opacity, 0.5).toFixed(3)}" stroke="url(#glassStroke)" stroke-opacity="${Math.max(strokeOpacity, 0.7).toFixed(3)}" stroke-width="${Math.max(strokeWidth, 14)}"`
    : newmorphic
      ? `data-mdpr-surface="${variant}" data-mdpr-style="${styleName}" data-mdpr-newmorphism="soft-ui" filter="url(#newmorphicLift)" fill="#${fill}" fill-opacity="${opacity.toFixed(3)}" stroke="url(#newmorphicStroke)" stroke-opacity="0.860" stroke-width="${Math.max(strokeWidth, 10)}"`
    : `data-mdpr-surface="${variant}" data-mdpr-style="${styleName}" fill="#${fill}" fill-opacity="${opacity.toFixed(3)}" stroke="#${stroke}" stroke-opacity="${strokeOpacity.toFixed(3)}" stroke-width="${strokeWidth}"`;
  const glassPrefix = frostedGlass ? frostedGlassDefs(fill, stroke, accent) : [];
  const glassSuffix = frostedGlass ? frostedGlassOverlays(x, y, w, h, r, accent, stroke) : [];
  const newmorphicPrefix = newmorphic ? newmorphicDefs(fill, stroke) : [];
  const newmorphicSuffix = newmorphic ? newmorphicOverlays(x, y, w, h, r, accent, stroke, styleName) : [];
  const styleSuffix = styleOverlays(styleName, x, y, w, h, r, accent, stroke);
  if (variant === "rounded") {
    return [
      ...glassPrefix,
      ...newmorphicPrefix,
      `<rect ${baseProps} x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}"/>`,
      ...glassSuffix,
      ...newmorphicSuffix,
      ...styleSuffix,
    ];
  }

  if (variant === "two-corner-left") {
    const d = [
      `M ${x + r} ${y}`,
      `H ${x + w}`,
      `V ${y + h}`,
      `H ${x + r}`,
      `Q ${x} ${y + h} ${x} ${y + h - r}`,
      `V ${y + r}`,
      `Q ${x} ${y} ${x + r} ${y}`,
      "Z",
    ].join(" ");
    return [
      ...glassPrefix,
      ...newmorphicPrefix,
      `<path ${baseProps} d="${d}"/>`,
      ...glassSuffix,
      ...newmorphicSuffix,
      ...styleSuffix,
    ];
  }

  if (variant === "two-corner-right") {
    const d = [
      `M ${x} ${y}`,
      `H ${x + w - r}`,
      `Q ${x + w} ${y} ${x + w} ${y + r}`,
      `V ${y + h - r}`,
      `Q ${x + w} ${y + h} ${x + w - r} ${y + h}`,
      `H ${x}`,
      "Z",
    ].join(" ");
    return [
      ...glassPrefix,
      ...newmorphicPrefix,
      `<path ${baseProps} d="${d}"/>`,
      ...glassSuffix,
      ...newmorphicSuffix,
      ...styleSuffix,
    ];
  }

  if (variant === "flag-drop") {
    const tabW = Math.min(Math.max(width * 0.16, 96), width * 0.3);
    const tabH = Math.min(Math.max(height * 0.16, 64), height * 0.32);
    const tabX = x + Math.min(Math.max(width * 0.08, 42), Math.max(42, width - tabW - 42));
    const d = roundedRectPath(x, y, w, h, r);
    const flag = `M ${tabX} ${y} H ${tabX + tabW} V ${y + tabH} L ${tabX + tabW / 2} ${y + tabH * 0.78} L ${tabX} ${y + tabH} Z`;
    return [
      ...glassPrefix,
      ...newmorphicPrefix,
      `<path ${baseProps} d="${d}"/>`,
      `<path data-mdpr-surface-accent="flag-drop" d="${flag}" fill="#${accent}" fill-opacity="0.180"/>`,
      ...glassSuffix,
      ...newmorphicSuffix,
      ...styleSuffix,
    ];
  }

  if (variant === "circle-vine") {
    const dotR = Math.min(Math.max(height * 0.09, 34), 72);
    const dotX = x + Math.min(Math.max(width * 0.09, 58), 120);
    const dotY = y + Math.min(Math.max(height * 0.28, 72), Math.max(72, height - 72));
    const vine = [
      `M ${dotX + dotR * 0.8} ${dotY}`,
      `C ${dotX + dotR * 2.0} ${dotY - dotR * 1.4}, ${dotX + dotR * 3.0} ${dotY + dotR * 1.4}, ${dotX + dotR * 4.2} ${dotY}`,
    ].join(" ");
    return [
      ...glassPrefix,
      ...newmorphicPrefix,
      `<path ${baseProps} d="${roundedRectPath(x, y, w, h, r)}"/>`,
      `<circle data-mdpr-surface-accent="circle-vine-dot" cx="${dotX}" cy="${dotY}" r="${dotR}" fill="#${accent}" fill-opacity="0.160" stroke="#${accent}" stroke-opacity="0.360" stroke-width="${Math.max(4, strokeWidth / 2)}"/>`,
      `<path data-mdpr-surface-accent="circle-vine-line" d="${vine}" fill="none" stroke="#${accent}" stroke-opacity="0.280" stroke-width="${Math.max(5, strokeWidth / 2)}" stroke-linecap="round"/>`,
      ...glassSuffix,
      ...newmorphicSuffix,
      ...styleSuffix,
    ];
  }

  if (variant === "notched-corner") {
    const n = Math.min(Math.max(Math.min(width, height) * 0.13, 54), 110);
    const d = [
      `M ${x + r} ${y}`,
      `H ${x + w - n}`,
      `L ${x + w} ${y + n}`,
      `V ${y + h - r}`,
      `Q ${x + w} ${y + h} ${x + w - r} ${y + h}`,
      `H ${x + r}`,
      `Q ${x} ${y + h} ${x} ${y + h - r}`,
      `V ${y + r}`,
      `Q ${x} ${y} ${x + r} ${y}`,
      "Z",
    ].join(" ");
    return [
      ...glassPrefix,
      ...newmorphicPrefix,
      `<path ${baseProps} d="${d}"/>`,
      `<path data-mdpr-surface-accent="notched-corner-fold" d="M ${x + w - n} ${y} L ${x + w} ${y + n} L ${x + w - n} ${y + n} Z" fill="#${accent}" fill-opacity="0.120"/>`,
      ...glassSuffix,
      ...newmorphicSuffix,
      ...styleSuffix,
    ];
  }

  const punchR = Math.min(Math.max(height * 0.11, 30), 64);
  const d = roundedRectPath(x, y, w, h, r);
  return [
    ...glassPrefix,
    ...newmorphicPrefix,
    `<path ${baseProps} d="${d}"/>`,
    `<circle data-mdpr-surface-accent="ticket-left" cx="${x + punchR * 0.2}" cy="${y + h / 2}" r="${punchR}" fill="#FFFFFF" fill-opacity="0.260" stroke="#${stroke}" stroke-opacity="${Math.max(0.08, strokeOpacity * 0.6).toFixed(3)}" stroke-width="${Math.max(3, strokeWidth / 3)}"/>`,
    `<circle data-mdpr-surface-accent="ticket-right" cx="${x + w - punchR * 0.2}" cy="${y + h / 2}" r="${punchR}" fill="#FFFFFF" fill-opacity="0.260" stroke="#${stroke}" stroke-opacity="${Math.max(0.08, strokeOpacity * 0.6).toFixed(3)}" stroke-width="${Math.max(3, strokeWidth / 3)}"/>`,
    ...glassSuffix,
    ...newmorphicSuffix,
    ...styleSuffix,
  ];
}

function styleOverlays(styleName: string, x: number, y: number, w: number, h: number, r: number, accent: string, stroke: string): string[] {
  const inner = roundedRectPath(x + 10, y + 10, Math.max(2, w - 20), Math.max(2, h - 20), Math.max(2, r - 10));
  if (styleName === "glassmorphism") {
    return [
      `<path data-mdpr-glassmorphism-layer="pane-diagonal" d="M ${x + w * 0.08} ${y + h * 0.18} H ${x + w * 0.92}" fill="none" stroke="#FFFFFF" stroke-opacity="0.24" stroke-width="${Math.max(4, r * 0.06)}" stroke-linecap="round"/>`,
      `<path data-mdpr-glassmorphism-layer="frosted-edge" d="${inner}" fill="none" stroke="#${accent}" stroke-opacity="0.16" stroke-width="${Math.max(3, r * 0.04)}"/>`,
    ];
  }
  if (styleName === "neomorphism") {
    return [
      `<path data-mdpr-neomorphism-layer="recessed-bottom-rail" d="M ${x + Math.max(18, r * 0.5)} ${y + h - Math.max(22, r * 0.48)} H ${x + w - Math.max(18, r * 0.5)}" fill="none" stroke="#${stroke}" stroke-opacity="0.42" stroke-width="${Math.max(6, r * 0.08)}" stroke-linecap="round"/>`,
      `<path data-mdpr-neomorphism-layer="raised-top-rail" d="M ${x + Math.max(18, r * 0.5)} ${y + Math.max(22, r * 0.48)} H ${x + w * 0.46}" fill="none" stroke="#FFFFFF" stroke-opacity="0.68" stroke-width="${Math.max(5, r * 0.07)}" stroke-linecap="round"/>`,
    ];
  }
  if (styleName === "minimalism") {
    return [
      `<path data-mdpr-minimalism-layer="hairline-rule" d="M ${x + w * 0.08} ${y + h * 0.18} H ${x + w * 0.92}" fill="none" stroke="#${stroke}" stroke-opacity="0.34" stroke-width="${Math.max(2, r * 0.025)}"/>`,
      `<path data-mdpr-minimalism-layer="corner-tick" d="M ${x + w - Math.max(24, r * 0.5)} ${y + 12} H ${x + w - 12} V ${y + Math.max(24, r * 0.5)}" fill="none" stroke="#${accent}" stroke-opacity="0.22" stroke-width="${Math.max(2, r * 0.025)}"/>`,
    ];
  }
  if (styleName === "newmorphism") {
    return [
      `<path data-mdpr-newmorphism-layer="legacy-floating-relief" d="M ${x + w * 0.64} ${y + h * 0.2} C ${x + w * 0.78} ${y + h * 0.08}, ${x + w * 0.88} ${y + h * 0.18}, ${x + w * 0.92} ${y + h * 0.34}" fill="none" stroke="#FFFFFF" stroke-opacity="0.54" stroke-width="${Math.max(5, r * 0.06)}" stroke-linecap="round"/>`,
      `<ellipse data-mdpr-newmorphism-layer="soft-raised-cap" cx="${x + w * 0.86}" cy="${y + h * 0.22}" rx="${Math.max(12, w * 0.04)}" ry="${Math.max(10, h * 0.06)}" fill="#${accent}" fill-opacity="0.16"/>`,
    ];
  }
  if (styleName === "skeuomorphism") {
    return [
      `<path data-mdpr-skeuomorphism-layer="bevel-highlight" d="${inner}" fill="none" stroke="#FFFFFF" stroke-opacity="0.72" stroke-width="${Math.max(4, r * 0.06)}"/>`,
      `<path data-mdpr-skeuomorphism-layer="bevel-lowlight" d="M ${x + Math.max(18, r * 0.55)} ${y + h - Math.max(18, r * 0.42)} H ${x + w - Math.max(18, r * 0.55)}" fill="none" stroke="#${stroke}" stroke-opacity="0.58" stroke-width="${Math.max(5, r * 0.08)}" stroke-linecap="round"/>`,
      `<path data-mdpr-skeuomorphism-layer="inner-pressed-edge" d="M ${x + 16} ${y + 16} V ${y + h - 16} H ${x + w - 16}" fill="none" stroke="#${stroke}" stroke-opacity="0.18" stroke-width="${Math.max(3, r * 0.04)}"/>`,
    ];
  }
  if (styleName === "claymorphism") {
    return [
      `<ellipse data-mdpr-claymorphism-layer="puffy-highlight" cx="${x + w * 0.22}" cy="${y + h * 0.22}" rx="${Math.max(18, w * 0.12)}" ry="${Math.max(14, h * 0.12)}" fill="#FFFFFF" fill-opacity="0.34"/>`,
      `<ellipse data-mdpr-claymorphism-layer="soft-accent" cx="${x + w * 0.82}" cy="${y + h * 0.22}" rx="${Math.max(14, w * 0.08)}" ry="${Math.max(14, h * 0.10)}" fill="#${accent}" fill-opacity="0.18"/>`,
      `<path data-mdpr-claymorphism-layer="pillow-lowlight" d="M ${x + w * 0.18} ${y + h * 0.82} C ${x + w * 0.42} ${y + h * 0.94}, ${x + w * 0.68} ${y + h * 0.9}, ${x + w * 0.86} ${y + h * 0.76}" fill="none" stroke="#${stroke}" stroke-opacity="0.18" stroke-width="${Math.max(7, r * 0.08)}" stroke-linecap="round"/>`,
    ];
  }
  if (styleName === "brutalism") {
    const stripe = Math.max(26, Math.min(w, h) * 0.16);
    return [
      `<path data-mdpr-brutalism-layer="hard-offset" d="M ${x + stripe} ${y + h - stripe} H ${x + w} V ${y + h} H ${x + stripe} Z" fill="#${accent}" fill-opacity="0.18" stroke="#111111" stroke-opacity="1" stroke-width="6"/>`,
      `<path data-mdpr-brutalism-layer="slash" d="M ${x + w - stripe * 1.2} ${y} L ${x + w} ${y + stripe * 1.2}" fill="none" stroke="#111111" stroke-opacity="1" stroke-width="10"/>`,
      `<path data-mdpr-brutalism-layer="registration-mark" d="M ${x + 20} ${y + 20} H ${x + 86} M ${x + 20} ${y + 20} V ${y + 86}" fill="none" stroke="#111111" stroke-opacity="1" stroke-width="5"/>`,
    ];
  }
  if (styleName === "liquid-glass") {
    return [
      `<path data-mdpr-liquid-glass-layer="refractive-ribbon" d="M ${x + r} ${y + h * 0.26} C ${x + w * 0.32} ${y + h * 0.04}, ${x + w * 0.62} ${y + h * 0.44}, ${x + w - r} ${y + h * 0.18}" fill="none" stroke="#FFFFFF" stroke-opacity="0.38" stroke-width="${Math.max(6, r * 0.1)}" stroke-linecap="round"/>`,
      `<ellipse data-mdpr-liquid-glass-layer="lens" cx="${x + w * 0.78}" cy="${y + h * 0.72}" rx="${Math.max(16, w * 0.08)}" ry="${Math.max(12, h * 0.1)}" fill="#${accent}" fill-opacity="0.16" stroke="#FFFFFF" stroke-opacity="0.24" stroke-width="4"/>`,
      `<path data-mdpr-liquid-glass-layer="caustic-edge" d="M ${x + w * 0.16} ${y + h * 0.7} C ${x + w * 0.38} ${y + h * 0.56}, ${x + w * 0.54} ${y + h * 0.88}, ${x + w * 0.86} ${y + h * 0.58}" fill="none" stroke="#${accent}" stroke-opacity="0.26" stroke-width="${Math.max(4, r * 0.07)}" stroke-linecap="round"/>`,
    ];
  }
  if (styleName === "bentogrid") {
    return [
      `<path data-mdpr-bentogrid-layer="tile-rule-h" d="M ${x + w * 0.12} ${y + h * 0.28} H ${x + w * 0.88}" fill="none" stroke="#${stroke}" stroke-opacity="0.38" stroke-width="5" stroke-linecap="round"/>`,
      `<path data-mdpr-bentogrid-layer="tile-rule-v" d="M ${x + w * 0.78} ${y + h * 0.16} V ${y + h * 0.84}" fill="none" stroke="#${accent}" stroke-opacity="0.24" stroke-width="5" stroke-linecap="round"/>`,
      `<path data-mdpr-bentogrid-layer="module-index" d="M ${x + w * 0.12} ${y + h * 0.72} H ${x + w * 0.34} V ${y + h * 0.84} H ${x + w * 0.12} Z" fill="#${accent}" fill-opacity="0.08" stroke="#${accent}" stroke-opacity="0.22" stroke-width="4"/>`,
    ];
  }
  return [];
}

function newmorphicDefs(fill: string, stroke: string): string[] {
  return [
    "<defs>",
    `<linearGradient id="newmorphicStroke" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.86"/><stop offset="52%" stop-color="#${stroke}" stop-opacity="0.32"/><stop offset="100%" stop-color="#AEB9C9" stop-opacity="0.50"/></linearGradient>`,
    `<filter id="newmorphicLift" x="-16%" y="-16%" width="132%" height="132%"><feDropShadow dx="-18" dy="-18" stdDeviation="18" flood-color="#FFFFFF" flood-opacity="0.72"/><feDropShadow dx="18" dy="18" stdDeviation="20" flood-color="#AEB9C9" flood-opacity="0.42"/></filter>`,
    `<linearGradient id="newmorphicSheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.44"/><stop offset="54%" stop-color="#${fill}" stop-opacity="0.10"/><stop offset="100%" stop-color="#AEB9C9" stop-opacity="0.18"/></linearGradient>`,
    "</defs>",
  ];
}

function newmorphicOverlays(x: number, y: number, w: number, h: number, r: number, accent: string, stroke: string, styleName: string): string[] {
  const d = roundedRectPath(x + 1, y + 1, Math.max(2, w - 2), Math.max(2, h - 2), Math.max(2, r - 1));
  const highlight = [
    `M ${x + r * 0.9} ${y + Math.max(12, r * 0.35)}`,
    `H ${x + Math.max(r * 1.8, w * 0.42)}`,
  ].join(" ");
  const lowlight = [
    `M ${x + w - Math.max(r * 1.8, w * 0.38)} ${y + h - Math.max(12, r * 0.42)}`,
    `H ${x + w - r * 0.9}`,
  ].join(" ");
  return [
    `<path data-mdpr-newmorphism-layer="${styleName === "neomorphism" ? "neo-sheen" : "sheen"}" d="${d}" fill="url(#newmorphicSheen)" stroke="none"/>`,
    `<path data-mdpr-newmorphism-layer="${styleName === "neomorphism" ? "neo-top-left-highlight" : "top-left-highlight"}" d="${highlight}" fill="none" stroke="#FFFFFF" stroke-opacity="0.72" stroke-width="${Math.max(5, r * 0.08)}" stroke-linecap="round"/>`,
    `<path data-mdpr-newmorphism-layer="${styleName === "neomorphism" ? "neo-bottom-right-lowlight" : "bottom-right-lowlight"}" d="${lowlight}" fill="none" stroke="#${stroke}" stroke-opacity="0.62" stroke-width="${Math.max(5, r * 0.08)}" stroke-linecap="round"/>`,
    ...(styleName === "neomorphism" ? [] : [`<circle data-mdpr-newmorphism-layer="accent-dot" cx="${x + w - Math.max(24, r * 0.68)}" cy="${y + Math.max(24, r * 0.68)}" r="${Math.max(10, r * 0.16)}" fill="#${accent}" fill-opacity="0.30"/>`]),
  ];
}

function frostedGlassDefs(fill: string, stroke: string, accent: string): string[] {
  return [
    "<defs>",
    `<linearGradient id="glassFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.30"/><stop offset="42%" stop-color="#${fill}" stop-opacity="0.62"/><stop offset="100%" stop-color="#${accent}" stop-opacity="0.16"/></linearGradient>`,
    `<linearGradient id="glassStroke" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.92"/><stop offset="58%" stop-color="#FFFFFF" stop-opacity="0.24"/><stop offset="100%" stop-color="#${stroke}" stop-opacity="0.34"/></linearGradient>`,
    `<linearGradient id="glassSheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.32"/><stop offset="55%" stop-color="#FFFFFF" stop-opacity="0.05"/><stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>`,
    `<filter id="frostedNoise" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise"/><feColorMatrix in="noise" type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.13"/></feComponentTransfer></filter>`,
    "</defs>",
  ];
}

function frostedGlassOverlays(x: number, y: number, w: number, h: number, r: number, accent: string, stroke: string): string[] {
  const d = roundedRectPath(x + 1, y + 1, Math.max(2, w - 2), Math.max(2, h - 2), Math.max(2, r - 1));
  const highlight = [
    `M ${x + r * 0.85} ${y + Math.max(10, r * 0.35)}`,
    `H ${x + Math.max(r * 1.6, w * 0.44)}`,
  ].join(" ");
  const edge = [
    `M ${x + w - Math.max(r * 1.4, w * 0.32)} ${y + h - Math.max(10, r * 0.4)}`,
    `H ${x + w - r * 0.85}`,
  ].join(" ");
  return [
    `<path data-mdpr-glass-layer="sheen" d="${d}" fill="url(#glassSheen)" stroke="none"/>`,
    `<path data-mdpr-glass-layer="noise" d="${d}" fill="#FFFFFF" fill-opacity="0.18" filter="url(#frostedNoise)" stroke="none"/>`,
    `<path data-mdpr-glass-layer="top-highlight" d="${highlight}" fill="none" stroke="#FFFFFF" stroke-opacity="0.72" stroke-width="${Math.max(6, r * 0.11)}" stroke-linecap="round"/>`,
    `<path data-mdpr-glass-layer="accent-edge" d="${edge}" fill="none" stroke="#${accent}" stroke-opacity="0.42" stroke-width="${Math.max(5, r * 0.09)}" stroke-linecap="round"/>`,
    `<path data-mdpr-glass-layer="soft-inner-edge" d="${d}" fill="none" stroke="#${stroke}" stroke-opacity="0.18" stroke-width="${Math.max(3, r * 0.05)}"/>`,
  ];
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  return [
    `M ${x + r} ${y}`,
    `H ${x + w - r}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `V ${y + h - r}`,
    `Q ${x + w} ${y + h} ${x + w - r} ${y + h}`,
    `H ${x + r}`,
    `Q ${x} ${y + h} ${x} ${y + h - r}`,
    `V ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    "Z",
  ].join(" ");
}
