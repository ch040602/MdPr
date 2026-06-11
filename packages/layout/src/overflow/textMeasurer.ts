export type TextMeasureInput = {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight?: "normal" | "bold";
  width: number;
  lineHeight: number;
};

export type TextMeasureResult = {
  lines: number;
  height: number;
  overflow: boolean;
};

/**
 * MVP용 근사 측정기.
 * 실제 구현에서는 canvas/font metrics 기반으로 교체한다.
 */
export function measureText(input: TextMeasureInput, maxHeight: number): TextMeasureResult {
  const averageCharWidth = input.fontSize * 0.52;
  const widthPx = input.width * 96;
  const widthUnitsPerLine = Math.max(1, widthPx / averageCharWidth);
  const lines = input.text.split(/\r?\n/).reduce((sum, line) => sum + Math.max(1, Math.ceil(displayWidth(line) / widthUnitsPerLine)), 0);
  const height = (input.fontSize * input.lineHeight * lines) / 72;
  return { lines, height, overflow: height > maxHeight };
}

function displayWidth(value: string): number {
  return Array.from(value).reduce((width, char) => width + (isWideCharacter(char) ? 1.85 : 1), 0);
}

function isWideCharacter(char: string): boolean {
  const codePoint = char.codePointAt(0) ?? 0;
  return (
    (codePoint >= 0x1100 && codePoint <= 0x11ff) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7af) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xff01 && codePoint <= 0xff60)
  );
}

export type OverflowDiagnostic = {
  level: "warning" | "error";
  code: "LAYOUT_REGION_OUT_OF_BOUNDS" | "LAYOUT_MIN_FONT_SIZE_VIOLATION" | "TEXT_OVERFLOW";
  message: string;
  slideId: string;
  regionId: string;
};

export type OverflowLayout = {
  slideSize: { width: number; height: number };
  theme: { fontFamily: string; bodyFontSize: number; minFontSize: number; lineHeight: number };
  slides: Array<{
    sourceSlideId: string;
    regions: Array<{
      id: string;
      blockIds: string[];
      x: number;
      y: number;
      w: number;
      h: number;
      typography?: {
        fontFamily?: string;
        fontSize?: number;
        minFontSize?: number;
        lineHeight?: number;
      };
    }>;
    overflowPolicy: {
      action: "reflow" | "shrink" | "split" | "warn" | "fail";
      minFontSize: number;
    };
  }>;
};

export function validateLayoutOverflow(
  layout: OverflowLayout,
  contentByBlockId: ReadonlyMap<string, string>,
): OverflowDiagnostic[] {
  const diagnostics: OverflowDiagnostic[] = [];

  for (const slide of layout.slides) {
    for (const region of slide.regions) {
      const level = slide.overflowPolicy.action === "fail" ? "error" : "warning";
      const fontSize = region.typography?.fontSize ?? layout.theme.bodyFontSize;
      const minFontSize = region.typography?.minFontSize ?? slide.overflowPolicy.minFontSize ?? layout.theme.minFontSize;
      const lineHeight = region.typography?.lineHeight ?? layout.theme.lineHeight;
      const fontFamily = region.typography?.fontFamily ?? layout.theme.fontFamily;

      if (region.x < 0 || region.y < 0 || region.x + region.w > layout.slideSize.width || region.y + region.h > layout.slideSize.height) {
        diagnostics.push({
          level,
          code: "LAYOUT_REGION_OUT_OF_BOUNDS",
          message: `Region ${region.id} is outside the slide bounds.`,
          slideId: slide.sourceSlideId,
          regionId: region.id,
        });
      }

      if (fontSize < minFontSize) {
        diagnostics.push({
          level,
          code: "LAYOUT_MIN_FONT_SIZE_VIOLATION",
          message: `Region ${region.id} font size ${fontSize} is smaller than min font size ${minFontSize}.`,
          slideId: slide.sourceSlideId,
          regionId: region.id,
        });
      }

      const text = region.blockIds.map((blockId) => contentByBlockId.get(blockId) ?? "").filter(Boolean).join("\n");
      if (!text) continue;

      const measurement = measureText({ text, fontFamily, fontSize, width: region.w, lineHeight }, region.h);
      if (measurement.overflow) {
        diagnostics.push({
          level,
          code: "TEXT_OVERFLOW",
          message: `Region ${region.id} text height ${measurement.height.toFixed(2)} exceeds region height ${region.h}.`,
          slideId: slide.sourceSlideId,
          regionId: region.id,
        });
      }
    }
  }

  return diagnostics;
}
