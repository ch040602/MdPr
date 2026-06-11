import type { BlockIR, SlideIntent, SlideIR } from "../ir/types.js";

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
  const title = slide.title?.toLowerCase() ?? "";
  const text = [
    title,
    ...slide.blocks.map((b) => b.text ?? ""),
    ...slide.blocks.flatMap((b) => b.items?.length ? b.items : b.listItems?.map((item) => item.text) ?? []),
  ].join(" ").toLowerCase();

  if (
    comparisonKeywords.some((kw) => text.includes(kw)) ||
    (beforeAfterPattern.test(text) && afterPattern.test(text)) ||
    (prosPattern.test(text) && consPattern.test(text))
  ) return "comparison";
  if (slide.blocks.some((b) => b.type === "diagram")) return "diagram";
  if (slide.blocks.some((b) => b.type === "quote")) return "quote";
  if (slide.blocks.some((b) => b.type === "table")) return "table";
  if (slide.blocks.some((b) => b.type === "image")) return "image";
  if (slide.blocks.some((b) => b.type === "code")) return "code";
  if (/\b(step|phase|단계|일정|timeline)\b/i.test(text)) return "timeline";

  const itemCount = countPrimaryItems(slide.blocks);
  if (itemCount >= 4) return "grid";
  if (itemCount > 0) return "list";

  return "standard";
}
