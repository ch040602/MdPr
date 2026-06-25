export type OutputFormat = "pptx" | "pdf" | "html";
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type DesignPresetName =
  | "plain"
  | "clean"
  | "executive"
  | "technical"
  | "dark"
  | "nord"
  | "solarized"
  | "dracula"
  | "tableau"
  | "gruvbox"
  | "monokai"
  | "material"
  | "tokyo-night";
export type DecorationStyleName =
  | "plain"
  | "simple"
  | "clean"
  | "executive"
  | "technical"
  | "minimalism"
  | "newmorphism"
  | "glass"
  | "data"
  | "dark"
  | "nord"
  | "solarized"
  | "dracula"
  | "tableau"
  | "gruvbox"
  | "monokai"
  | "material"
  | "tokyo-night";
export type ColorCombinationName =
  | "preset"
  | "monochromatic"
  | "analogous"
  | "complementary"
  | "split-complementary"
  | "triadic";

export type SlideRole = "cover" | "toc" | "section" | "content" | "appendix";
export const slideIntents = [
  "title",
  "standard",
  "comparison",
  "evidence",
  "metric",
  "list",
  "grid",
  "timeline",
  "workflow",
  "table",
  "image",
  "code",
  "quote",
  "summary",
  "diagram",
  "chart",
] as const;

export type SlideIntent = typeof slideIntents[number];

export type SlideIntentScores = Record<
  | "comparison"
  | "evidence"
  | "metric"
  | "chart"
  | "table"
  | "image"
  | "workflow"
  | "timeline"
  | "code"
  | "summary",
  number
>;

export type SlideIntentProfile = {
  primaryIntent: SlideIntent;
  secondaryIntents: SlideIntent[];
  scores: SlideIntentScores;
};

export type SourceRange = {
  file?: string;
  startLine?: number;
  endLine?: number;
};

export type ParserMode = "simple" | "pandoc";
export type PresentationMode = "normal" | "pipeline-one-page";

export type PandocAttr = {
  identifier?: string;
  classes?: string[];
  attributes?: Record<string, string>;
};

export type Diagnostic = {
  level: "info" | "warning" | "error";
  code?: string;
  message: string;
  slideId?: string;
};

export type BlockType =
  | "heading"
  | "paragraph"
  | "bulletList"
  | "listItem"
  | "table"
  | "image"
  | "code"
  | "quote"
  | "html"
  | "slideBreak"
  | "diagram"
  | "chart";

export type InlineRunIR = {
  text: string;
  bold?: boolean;
  italic?: boolean;
};

export type ListItemIR = {
  text: string;
  level: number;
  ordered: boolean;
  number?: number;
  marker?: string;
  runs?: InlineRunIR[];
  label?: string;
  description?: string;
  descriptionRuns?: InlineRunIR[];
};

export type DiagramIR = {
  kind: "pipeline";
  nodes: Array<{
    id: string;
    label: string;
  }>;
  edges: Array<{
    from: string;
    to: string;
    label?: string;
  }>;
};

export type ChartKind = "bar" | "arc-ring" | "gauge" | "connected-strip" | "ranked-bars" | "metric-dots";

export type ChartIR = {
  kind: ChartKind;
  labels: string[];
  series: Array<{
    name: string;
    values: number[];
  }>;
};

export type BlockIR = {
  id: string;
  type: BlockType;
  text?: string;
  lines?: string[];
  sentences?: string[];
  inlineRuns?: InlineRunIR[];
  level?: HeadingLevel;
  items?: string[];
  listItems?: ListItemIR[];
  listKind?: "ordered" | "unordered" | "mixed";
  diagram?: DiagramIR;
  chart?: ChartIR;
  rows?: string[][];
  src?: string;
  alt?: string;
  language?: string;
  source?: SourceRange;
  pandocAttr?: PandocAttr;
};

export type OutlineNode = {
  id: string;
  level: HeadingLevel;
  title: string;
  source?: SourceRange;
  blocks: BlockIR[];
  children: OutlineNode[];
  headingPath: string[];
};

export type DeckMeta = {
  title: string;
  language?: string;
  sourcePath?: string;
};

export type SlideIR = {
  id: string;
  index: number;
  role: SlideRole;
  title?: string;
  subtitle?: string;
  section?: string;
  headingPath: string[];
  source: SourceRange;
  blocks: BlockIR[];
  intent: SlideIntent;
  intentScores?: SlideIntentScores;
  secondaryIntents?: SlideIntent[];
  tags: string[];
  primaryItemCount?: number;
  density?: number;
};

export type SemanticBlockRole =
  | "claim"
  | "evidence"
  | "metric"
  | "example"
  | "risk"
  | "decision"
  | "action"
  | "caption"
  | "source"
  | "appendix";

export type CoherenceGroup = {
  id: string;
  slideId: string;
  headingPath: string[];
  primaryBlockId: string;
  supportingBlockIds: string[];
  role: "argument" | "comparison" | "workflow" | "evidence-pack" | "summary";
  keepTogether: boolean;
  splitPriority: number;
  blockRoles?: Record<string, SemanticBlockRole>;
  semanticSignals?: SemanticBlockRole[];
};

export type AssetRef = {
  id: string;
  type: "image" | "font" | "template" | "other";
  path: string;
};

export type PresentationIR = {
  version: "1.0";
  meta: DeckMeta;
  outline: OutlineNode[];
  slides: SlideIR[];
  coherenceGroups: CoherenceGroup[];
  assets: AssetRef[];
  diagnostics: Diagnostic[];
};

export type MarkdownDocument = {
  sourcePath?: string;
  title?: string;
  parser?: ParserMode;
  blocks: BlockIR[];
  headings: BlockIR[];
};

export type Config = {
  version: "1.0";
  deck: {
    titleFrom: "first-h1" | "frontmatter" | "filename" | "manual";
    title?: string;
    presentationMode?: PresentationMode;
    ratio: "16:9" | "4:3";
    language?: string;
    defaultOutput: OutputFormat[];
  };
  split: {
    cover: "first-h1" | "none";
    section: "h1" | "h2" | "none";
    slide: "h1" | "h2" | "h3";
    subsection: "h2" | "h3" | "h4" | "none";
    autosplit: {
      enabled: boolean;
      maxDensity: number;
      fallbackHeading: "h2" | "h3" | "h4";
      allowContinuation: boolean;
    };
    overrides?: Array<{
      target: {
        title?: string;
        headingPath?: string[];
      };
      forceSingleSlide?: boolean;
      splitBy?: "h2" | "h3" | "h4" | "block-group" | "list-chunk" | "none";
      maxDensity?: number;
    }>;
  };
  toc: {
    enabled: boolean;
    position: "after-cover" | "none";
    depth: number;
    includePageNumbers: boolean;
  };
  layout: {
    engine: "rule";
    basePack: "marp" | "business" | "minimal";
    defaultPreset: string;
    maxItemsBeforeGrid: number;
    safeArea: { enabled: boolean };
    overflow: {
      defaultAction: "reflow" | "shrink" | "split" | "warn" | "fail";
      allowedActions: Array<"reflow" | "shrink" | "split" | "warn" | "fail">;
      minFontSize: number;
      maxShrinkSteps: number;
    };
  };
  typography: {
    fontFamily: string;
    titleFontSize: number;
    bodyFontSize: number;
    captionFontSize: number;
    minFontSize: number;
    lineHeight: number;
  };
  theme: {
    designPreset?: DesignPresetName;
    decorationStyle?: DecorationStyleName;
    colorCombination?: ColorCombinationName;
    colorSeed?: string;
    useProvidedColors?: boolean;
    backgroundColor: string;
    textColor: string;
    primaryColor: string;
  };
  pptx: {
    template: string | null;
    designPreset?: DesignPresetName;
    useTemplateBackground: boolean;
    lockBackgroundToMaster: boolean;
    editableObjects: boolean;
  };
  pdf: { printBackground: boolean };
  html: { navigation: boolean; responsive: boolean };
};
