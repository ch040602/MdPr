import type { BlockIR, SlideIR } from "../ir/types.js";

export const conferenceTemplateProfileNames = [
  "balanced-research-talk",
  "dense-technical-prose",
  "diagram-workflow-heavy",
  "visual-evidence-heavy",
  "data-table-chart-heavy",
  "status-agenda-update",
] as const;

export type ConferenceTemplateProfileName = typeof conferenceTemplateProfileNames[number];

export type ConferenceTemplateProfile = {
  name: ConferenceTemplateProfileName;
  corpusSignal: string;
  layoutBias: string;
  writingRule: string;
};

export const conferenceTemplateProfiles: Record<ConferenceTemplateProfileName, ConferenceTemplateProfile> = {
  "balanced-research-talk": {
    name: "balanced-research-talk",
    corpusSignal: "Moderate text, few visual objects, and compact claim/proof sequencing.",
    layoutBias: "Use title-body, vertical-list, or comparison layouts with restrained emphasis.",
    writingRule: "Keep one claim per slide and reserve substructure for evidence or caveats.",
  },
  "dense-technical-prose": {
    name: "dense-technical-prose",
    corpusSignal: "High text density with few images or charts, often standards or method detail.",
    layoutBias: "Prefer split text, text-aside relief, and preserved paragraph indentation over one large text box.",
    writingRule: "Expose hierarchy through paragraph indentation, short line units, and continuation slides.",
  },
  "diagram-workflow-heavy": {
    name: "diagram-workflow-heavy",
    corpusSignal: "Many shapes/connectors or explicit flow language.",
    layoutBias: "Prefer pipeline and workflow layouts before generic body layouts.",
    writingRule: "Turn process language into nodes, edges, and short labels.",
  },
  "visual-evidence-heavy": {
    name: "visual-evidence-heavy",
    corpusSignal: "Image or screenshot evidence dominates the slide surface.",
    layoutBias: "Prefer image-focus or chart-table layouts with adjacent caption/claim text.",
    writingRule: "Protect original image aspect ratio and keep captions close to the evidence.",
  },
  "data-table-chart-heavy": {
    name: "data-table-chart-heavy",
    corpusSignal: "Tables, charts, or numeric proof objects carry the argument.",
    layoutBias: "Prefer chart-table and table-focus layouts over prose-first layouts.",
    writingRule: "Lead with the takeaway, then expose the table or chart as editable proof.",
  },
  "status-agenda-update": {
    name: "status-agenda-update",
    corpusSignal: "Short status, agenda, and working-group update slides.",
    layoutBias: "Prefer vertical lists and agenda-like sequences with consistent section rhythm.",
    writingRule: "Use compact bullets, dates, owners, and decision markers.",
  },
};

export function inferConferenceTemplateProfile(slide: SlideIR): ConferenceTemplateProfileName {
  const stats = slideContentStats(slide.blocks);
  if (stats.tableCount + stats.chartCount > 0) return "data-table-chart-heavy";
  if (stats.imageCount > 0) return "visual-evidence-heavy";
  if (slide.intent === "diagram" || stats.diagramCount > 0 || stats.arrowTextCount >= 2) return "diagram-workflow-heavy";
  if (stats.textLength >= 780 || stats.indentedParagraphLines >= 2) return "dense-technical-prose";
  if ((slide.primaryItemCount ?? 0) >= 4 && stats.textLength < 520) return "status-agenda-update";
  return "balanced-research-talk";
}

function slideContentStats(blocks: BlockIR[]): {
  textLength: number;
  imageCount: number;
  tableCount: number;
  chartCount: number;
  diagramCount: number;
  arrowTextCount: number;
  indentedParagraphLines: number;
} {
  let textLength = 0;
  let arrowTextCount = 0;
  let indentedParagraphLines = 0;
  for (const block of blocks) {
    const text = blockText(block);
    textLength += text.length;
    if (/(?:->|=>|→|⇒)/.test(text)) arrowTextCount += 1;
    if (block.type === "paragraph") indentedParagraphLines += block.lineIndents?.filter((indent) => indent > 0).length ?? 0;
  }
  return {
    textLength,
    imageCount: blocks.filter((block) => block.type === "image").length,
    tableCount: blocks.filter((block) => block.type === "table").length,
    chartCount: blocks.filter((block) => block.type === "chart").length,
    diagramCount: blocks.filter((block) => block.type === "diagram").length,
    arrowTextCount,
    indentedParagraphLines,
  };
}

function blockText(block: BlockIR): string {
  return [
    block.text,
    block.alt,
    ...(block.lines ?? []),
    ...(block.items ?? []),
    ...(block.listItems?.map((item) => `${item.text} ${item.description ?? ""}`) ?? []),
    ...(block.rows?.flat() ?? []),
  ].filter(Boolean).join(" ");
}
