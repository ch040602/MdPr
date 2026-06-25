import type { ColorCombinationName, DecorationStyleName, DesignPresetName, Diagnostic } from "@mdpresent/core";

export const layoutPresets = [
  "cover",
  "toc",
  "section-divider",
  "title-body",
  "text-icon-aside",
  "key-message",
  "comparison",
  "vertical-list",
  "grid",
  "pentagon",
  "timeline",
  "table-focus",
  "chart-table",
  "image-focus",
  "image-left",
  "image-right",
  "code-focus",
  "quote",
  "summary",
  "single-card",
  "pipeline",
  "pipeline-one-page",
] as const;

export type LayoutPreset = typeof layoutPresets[number];

export type Rect = { x: number; y: number; w: number; h: number };

export type LayoutSpec = {
  preset: LayoutPreset;
  variant?: string;
  columns?: number | null;
  rows?: number | null;
  direction?: "horizontal" | "vertical" | "radial";
};

export type LayoutCandidateScore = {
  overflowPenalty: number;
  minFontPenalty: number;
  objectCoveragePenalty: number;
  semanticGroupPenalty: number;
  readingOrderPenalty: number;
  whitespacePenalty: number;
  alignmentPenalty: number;
  emphasisPenalty: number;
  sectionConsistencyPenalty: number;
  total: number;
};

export type ScoredLayoutCandidate = {
  layout: LayoutSpec;
  score: LayoutCandidateScore;
};

export type TypographySpec = {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  lineHeight?: number;
  minFontSize?: number;
};

export type RegionRole = "title" | "subtitle" | "body" | "item" | "image" | "table" | "chart" | "code" | "diagram" | "icon" | "footer" | "pageNumber";

export type LayoutRegion = Rect & {
  id: string;
  role: RegionRole;
  blockIds: string[];
  zIndex: number;
  typography?: TypographySpec;
};

export type BackgroundSpec = {
  color?: string;
  image?: string | null;
  useTemplateBackground?: boolean;
};

export type OverflowPolicy = {
  action: "reflow" | "shrink" | "split" | "warn" | "fail";
  minFontSize: number;
  maxShrinkSteps: number;
};

export type ThemeTokens = {
  fontFamily: string;
  designPreset?: DesignPresetName;
  decorationStyle?: DecorationStyleName;
  colorCombination?: ColorCombinationName;
  colorSeed?: string;
  useProvidedColors?: boolean;
  backgroundColor: string;
  textColor: string;
  primaryColor: string;
  titleFontSize: number;
  bodyFontSize: number;
  captionFontSize: number;
  minFontSize: number;
  lineHeight: number;
};

export type SlideSize = { width: number; height: number; unit: "in" | "px" };

export type LayoutSlide = {
  id: string;
  sourceSlideId: string;
  index: number;
  layout: LayoutSpec;
  background: BackgroundSpec;
  regions: LayoutRegion[];
  overflowPolicy: OverflowPolicy;
};

export type LayoutIR = {
  version: "1.0";
  slideSize: SlideSize;
  theme: ThemeTokens;
  slides: LayoutSlide[];
  diagnostics: Diagnostic[];
  overflowResolution?: {
    candidateReflow: number;
    regionExpansion: number;
    fontShrink: number;
  };
};
