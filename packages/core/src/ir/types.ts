export type OutputFormat = "pptx" | "pdf" | "html";
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type DesignPresetName =
  | "plain"
  | "clean"
  | "executive"
  | "editorial"
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
export type ColorCombinationName =
  | "preset"
  | "monochromatic"
  | "analogous"
  | "complementary"
  | "split-complementary"
  | "triadic";

export type SlideRole = "cover" | "toc" | "section" | "content" | "appendix";
export type SlideIntent =
  | "title"
  | "standard"
  | "comparison"
  | "list"
  | "grid"
  | "timeline"
  | "table"
  | "image"
  | "code"
  | "quote"
  | "summary"
  | "diagram"
  | "chart";

export type SourceRange = {
  file?: string;
  startLine?: number;
  endLine?: number;
};

export type ParserMode = "simple" | "pandoc";

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
  tags: string[];
  primaryItemCount?: number;
  density?: number;
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
    colorCombination?: ColorCombinationName;
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
