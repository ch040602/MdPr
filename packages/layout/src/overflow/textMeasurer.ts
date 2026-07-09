export type TextRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
};

export type TextMeasureRole = "title" | "body" | "table-cell" | "code" | "caption";

export type LegacyTextMeasureInput = {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight?: "normal" | "bold";
  width: number;
  lineHeight: number;
};

export type RichTextMeasureInput = {
  runs: TextRun[];
  box: { widthIn: number; heightIn: number };
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  role: TextMeasureRole;
  locale?: string;
};

export type TextMeasureInput = LegacyTextMeasureInput | RichTextMeasureInput;

export type TextMeasureResult = {
  lineCount: number;
  usedWidthIn: number;
  usedHeightIn: number;
  overflowX: boolean;
  overflowY: boolean;
  confidence: "exact" | "font-metric" | "heuristic";
  lines: number;
  height: number;
  overflow: boolean;
};

type NormalizedMeasureInput = {
  runs: TextRun[];
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  role: TextMeasureRole;
  widthIn: number;
  heightIn: number;
};

/**
 * Deterministic font-metric approximation used before renderer-specific proof.
 * It models rich runs, CJK, punctuation, monospace/code, and role-specific
 * wrapping without requiring an agent or a browser canvas at runtime.
 */
export function measureText(input: TextMeasureInput, maxHeight?: number): TextMeasureResult {
  const normalized = normalizeMeasureInput(input, maxHeight);
  const widthPx = Math.max(1, normalized.widthIn * 96);
  const explicitLines = runsToLines(normalized.runs);
  const rolePaddingFactor = roleWidthFactor(normalized.role);
  let lineCount = 0;
  let maxLineWidthPx = 0;
  let overflowX = false;

  for (const lineRuns of explicitLines) {
    const runWidths = lineRuns.map((run) => measureRunWidthPx(run, normalized) * rolePaddingFactor);
    const lineWidthPx = runWidths.reduce((sum, width) => sum + width, 0);
    const unbreakableWidthPx = longestUnbreakableWidthPx(lineRuns, normalized) * rolePaddingFactor;
    maxLineWidthPx = Math.max(maxLineWidthPx, Math.min(lineWidthPx, widthPx));
    overflowX = overflowX || unbreakableWidthPx > widthPx;
    lineCount += Math.max(1, Math.ceil(lineWidthPx / widthPx));
  }

  const usedHeightIn = (normalized.fontSize * normalized.lineHeight * lineCount) / 72;
  const usedWidthIn = maxLineWidthPx / 96;
  const overflowY = usedHeightIn > normalized.heightIn;

  return {
    lineCount,
    usedWidthIn,
    usedHeightIn,
    overflowX,
    overflowY,
    confidence: "font-metric",
    lines: lineCount,
    height: usedHeightIn,
    overflow: overflowX || overflowY,
  };
}

function normalizeMeasureInput(input: TextMeasureInput, maxHeight?: number): NormalizedMeasureInput {
  if ("runs" in input) {
    return {
      runs: input.runs.length ? input.runs : [{ text: "" }],
      fontFamily: input.fontFamily,
      fontSize: input.fontSize,
      lineHeight: input.lineHeight,
      role: input.role,
      widthIn: input.box.widthIn,
      heightIn: input.box.heightIn,
    };
  }

  return {
    runs: [{ text: input.text, bold: input.fontWeight === "bold" }],
    fontFamily: input.fontFamily,
    fontSize: input.fontSize,
    lineHeight: input.lineHeight,
    role: "body",
    widthIn: input.width,
    heightIn: maxHeight ?? Number.POSITIVE_INFINITY,
  };
}

function runsToLines(runs: TextRun[]): TextRun[][] {
  const lines: TextRun[][] = [[]];
  for (const run of runs) {
    const parts = run.text.split(/\r?\n/);
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1]!.push({ ...run, text: part });
    });
  }
  return lines.length ? lines : [[{ text: "" }]];
}

function measureRunWidthPx(run: TextRun, input: NormalizedMeasureInput): number {
  return Array.from(run.text).reduce((width, char) => width + charWidthPx(char, run, input), 0);
}

function longestUnbreakableWidthPx(runs: TextRun[], input: NormalizedMeasureInput): number {
  let maxWidth = 0;
  for (const run of runs) {
    if (run.code || input.role === "code" || isMonospace(input.fontFamily)) {
      maxWidth = Math.max(maxWidth, measureRunWidthPx(run, input));
      continue;
    }

    let segmentWidth = 0;
    for (const char of Array.from(run.text)) {
      if (isBreakOpportunity(char)) {
        maxWidth = Math.max(maxWidth, segmentWidth);
        segmentWidth = 0;
        continue;
      }

      const charWidth = charWidthPx(char, run, input);
      if (isWideCharacter(char)) {
        maxWidth = Math.max(maxWidth, segmentWidth, charWidth);
        segmentWidth = 0;
      } else {
        segmentWidth += charWidth;
      }
    }
    maxWidth = Math.max(maxWidth, segmentWidth);
  }
  return maxWidth;
}

function charWidthPx(char: string, run: TextRun, input: NormalizedMeasureInput): number {
  const base = input.fontSize;
  const codeLike = run.code || input.role === "code" || isMonospace(input.fontFamily);
  let factor = codeLike ? 0.62 : 0.52;
  if (isWideCharacter(char)) factor = codeLike ? 0.96 : 0.92;
  else if (isUppercaseAscii(char)) factor = codeLike ? 0.62 : 0.6;
  else if (isDigit(char)) factor = codeLike ? 0.62 : 0.54;
  else if (isThinPunctuation(char)) factor = codeLike ? 0.62 : 0.3;
  else if (/\s/.test(char)) factor = codeLike ? 0.62 : 0.28;
  else if (isEmoji(char)) factor = 1.0;

  if (run.bold) factor *= 1.08;
  if (run.italic) factor *= 1.03;
  if (run.code && input.role !== "code") factor *= 1.12;
  return base * factor;
}

function roleWidthFactor(role: TextMeasureRole): number {
  if (role === "table-cell") return 1.08;
  if (role === "caption") return 1.02;
  if (role === "title") return 1.04;
  return 1;
}

function isMonospace(fontFamily: string): boolean {
  return /consolas|courier|mono|menlo|monaco/i.test(fontFamily);
}

function isUppercaseAscii(char: string): boolean {
  return /^[A-Z]$/.test(char);
}

function isDigit(char: string): boolean {
  return /^[0-9]$/.test(char);
}

function isThinPunctuation(char: string): boolean {
  return /^[.,:;|'"`!()\[\]{}]$/.test(char);
}

function isBreakOpportunity(char: string): boolean {
  return /\s/.test(char) || /^[,.;:!?/\\()[\]{}|+-]$/.test(char);
}

function isEmoji(char: string): boolean {
  const codePoint = char.codePointAt(0) ?? 0;
  return codePoint >= 0x1f300 && codePoint <= 0x1faff;
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
  code: "LAYOUT_REGION_OUT_OF_BOUNDS" | "LAYOUT_MIN_FONT_SIZE_VIOLATION" | "TEXT_OVERFLOW" | "DENSE_TEXT_FIT_RISK";
  message: string;
  slideId: string;
  regionId: string;
  details?: {
    textLength?: number;
    textExcerpt?: string;
    lineCount?: number;
    usedWidthIn?: number;
    usedHeightIn?: number;
    regionWidthIn?: number;
    regionHeightIn?: number;
    fitRatio?: number;
    fontSize?: number;
    minFontSize?: number;
    sourcePreserved?: true;
    rewriteApplied?: false;
    summarizationApplied?: false;
    textDeletionApplied?: false;
    runtimeOwner?: "MDPR";
  };
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
          details: {
            fontSize,
            minFontSize,
            sourcePreserved: true,
            rewriteApplied: false,
            summarizationApplied: false,
            textDeletionApplied: false,
            runtimeOwner: "MDPR",
          },
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
          details: {
            textLength: text.length,
            textExcerpt: text.slice(0, 160),
            lineCount: measurement.lineCount,
            usedWidthIn: measurement.usedWidthIn,
            usedHeightIn: measurement.usedHeightIn,
            regionWidthIn: region.w,
            regionHeightIn: region.h,
            sourcePreserved: true,
            rewriteApplied: false,
            summarizationApplied: false,
            textDeletionApplied: false,
            runtimeOwner: "MDPR",
          },
        });
      } else if (isDenseTextFitRisk(text, measurement.usedHeightIn, region.h)) {
        diagnostics.push({
          level,
          code: "DENSE_TEXT_FIT_RISK",
          message: `Region ${region.id} dense text uses ${Math.round((measurement.usedHeightIn / region.h) * 100)}% of available height; add whitespace, split, or reflow before rendering.`,
          slideId: slide.sourceSlideId,
          regionId: region.id,
          details: {
            textLength: text.length,
            textExcerpt: text.slice(0, 160),
            lineCount: measurement.lineCount,
            usedWidthIn: measurement.usedWidthIn,
            usedHeightIn: measurement.usedHeightIn,
            regionWidthIn: region.w,
            regionHeightIn: region.h,
            fitRatio: Number((measurement.usedHeightIn / region.h).toFixed(3)),
            sourcePreserved: true,
            rewriteApplied: false,
            summarizationApplied: false,
            textDeletionApplied: false,
            runtimeOwner: "MDPR",
          },
        });
      }
    }
  }

  return diagnostics;
}

function isDenseTextFitRisk(text: string, usedHeightIn: number, regionHeightIn: number): boolean {
  if (!Number.isFinite(regionHeightIn) || regionHeightIn <= 0) return false;
  const nonEmptyLines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const hasHierarchy = nonEmptyLines.length >= 3;
  const denseLength = text.length >= 360;
  return (hasHierarchy || denseLength) && usedHeightIn > regionHeightIn * 0.95;
}
