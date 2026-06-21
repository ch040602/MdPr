import type { BlockIR, SlideIntent, SlideIntentProfile, SlideIntentScores, SlideIR } from "../ir/types.js";

const comparisonKeywords = [
  "기존",
  "개선",
  "as-is",
  "to-be",
  "장점",
  "단점",
];

const beforeAfterPattern = /\bbefore\b/i;
const afterPattern = /\bafter\b/i;
const prosPattern = /\bpros\b/i;
const consPattern = /\bcons\b/i;

export function countPrimaryItems(blocksOrSlide: BlockIR[] | SlideIR): number {
  const blocks = Array.isArray(blocksOrSlide) ? blocksOrSlide : blocksOrSlide.blocks;
  const firstList = blocks.find((b) => b.type === "bulletList");
  return firstList?.items?.length ?? firstList?.listItems?.length ?? 0;
}

export function detectSlideIntent(slide: Omit<SlideIR, "intent" | "tags">): SlideIntent {
  return detectSlideIntentProfile(slide).primaryIntent;
}

export function detectSlideIntentProfile(slide: Omit<SlideIR, "intent" | "tags">): SlideIntentProfile {
  const title = slide.title?.toLowerCase() ?? "";
  const text = [
    title,
    ...slide.blocks.map((b) => b.text ?? ""),
    ...slide.blocks.flatMap((b) => b.items?.length ? b.items : b.listItems?.map((item) => item.text) ?? []),
  ].join(" ").toLowerCase();
  const scores: SlideIntentScores = {
    comparison: 0,
    evidence: 0,
    metric: 0,
    chart: 0,
    table: 0,
    image: 0,
    workflow: 0,
    timeline: 0,
    code: 0,
    summary: 0,
  };

  if (
    comparisonKeywords.some((kw) => text.includes(kw)) ||
    (beforeAfterPattern.test(text) && afterPattern.test(text)) ||
    (prosPattern.test(text) && consPattern.test(text))
  ) scores.comparison += 8;
  if (slide.blocks.some((b) => b.type === "chart")) scores.chart += 8;
  if (slide.blocks.some((b) => b.type === "table")) scores.table += 7;
  if (slide.blocks.some((b) => b.type === "image")) scores.image += 7;
  if (slide.blocks.some((b) => b.type === "code")) scores.code += 8;
  if (slide.blocks.some((b) => b.type === "diagram")) scores.workflow += 8;
  if (/\b(step|phase|단계|일정|timeline)\b/i.test(text)) scores.timeline += 7;
  if (/\b(summary|recap|결론|요약)\b/i.test(text)) scores.summary += 4;

  const itemCount = countPrimaryItems(slide.blocks);
  const metricSignal = metricSignalScore(text, slide.blocks);
  scores.metric += metricSignal;
  const objectKinds = ["chart", "table", "image", "code", "workflow"].filter((key) => scores[key as keyof SlideIntentScores] > 0).length;
  if (objectKinds >= 2) scores.evidence += 5 + objectKinds;
  if (metricSignal > 0 && (scores.table > 0 || scores.chart > 0 || scores.image > 0 || itemCount > 0)) scores.evidence += 5;
  if (metricSignal >= 3 && scores.table > 0 && itemCount > 0) scores.evidence += 5;
  if (/\b(evidence|proof|signal|validated|근거|검증|증거)\b/i.test(text)) scores.evidence += 5;
  if (slide.blocks.some((b) => b.type === "quote")) scores.summary += 3;

  if (itemCount >= 4) scores.summary += 2;
  if (itemCount > 0) scores.summary += 1;

  const primaryIntent = choosePrimaryIntent(scores, slide, itemCount);
  const secondaryIntents = Object.entries(scores)
    .filter(([intent, score]) => score > 0 && intent !== primaryIntent)
    .sort((a, b) => b[1] - a[1] || secondaryOrder(a[0]) - secondaryOrder(b[0]))
    .map(([intent]) => normalizeIntentName(intent))
    .filter((intent): intent is SlideIntent => Boolean(intent))
    .slice(0, 4);

  return { primaryIntent, secondaryIntents, scores };
}

function choosePrimaryIntent(scores: SlideIntentScores, slide: Omit<SlideIR, "intent" | "tags">, itemCount: number): SlideIntent {
  if (scores.comparison >= 8) return "comparison";
  if (scores.evidence >= 10) return "evidence";
  if (scores.chart >= 8) return "chart";
  if (scores.workflow >= 8) return "diagram";
  if (slide.blocks.some((b) => b.type === "quote")) return "quote";
  if (scores.table >= 7) return "table";
  if (scores.image >= 7) return "image";
  if (scores.code >= 8) return "code";
  if (scores.timeline >= 7) return "timeline";
  if (scores.metric >= 7) return "metric";
  if (itemCount >= 4) return "grid";
  if (itemCount > 0) return "list";

  return "standard";
}

function normalizeIntentName(intent: string): SlideIntent | undefined {
  if (intent === "workflow") return "diagram";
  return intent as SlideIntent;
}

function metricSignalScore(text: string, blocks: BlockIR[]): number {
  const metricMatches = text.match(/(?:\d+(?:\.\d+)?\s?(?:%|x|k|m|ms|s|pt|pts|users?)|\$\s?\d+|\d{4}-\d{1,2}-\d{1,2}|\b\d{4}\b)/gi)?.length ?? 0;
  const tableNumericCells = blocks
    .filter((block) => block.type === "table")
    .flatMap((block) => block.rows ?? [])
    .flatMap((row) => row)
    .filter((cell) => /\d/.test(cell)).length;
  const chartMetrics = blocks.filter((block) => block.type === "chart").length * 2;
  return Math.min(10, metricMatches + tableNumericCells + chartMetrics);
}

function secondaryOrder(intent: string): number {
  return ["metric", "table", "image", "chart", "workflow", "code", "comparison", "evidence", "timeline", "summary"].indexOf(intent);
}
