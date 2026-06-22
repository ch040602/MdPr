import type { BlockIR, SlideIR } from "../ir/types.js";

export type CaptionPair = {
  objectBlockId: string;
  captionBlockId: string;
  confidence: number;
  source: "mdpr-rule" | "agent-hint";
};

export function findCaptionPairs(slide: SlideIR): CaptionPair[] {
  const pairs: CaptionPair[] = [];
  for (const [index, block] of slide.blocks.entries()) {
    if (!isCaptionableObject(block)) continue;
    const next = slide.blocks[index + 1];
    if (!next || next.type !== "paragraph") continue;
    if (!isCaptionLikeParagraph(next)) continue;
    pairs.push({
      objectBlockId: block.id,
      captionBlockId: next.id,
      confidence: hasExplicitCaptionPrefix(next) ? 0.95 : 0.72,
      source: "mdpr-rule",
    });
  }
  return pairs;
}

export function isCaptionBlock(block: BlockIR, slide: SlideIR): boolean {
  return findCaptionPairs(slide).some((pair) => pair.captionBlockId === block.id);
}

function isCaptionableObject(block: BlockIR): boolean {
  return block.type === "image" || block.type === "chart" || block.type === "table" || block.type === "diagram";
}

function isCaptionLikeParagraph(block: BlockIR): boolean {
  const text = (block.text ?? block.sentences?.join(" ") ?? "").trim();
  if (!text) return false;
  return hasExplicitCaptionPrefix(block) || text.length <= 90;
}

function hasExplicitCaptionPrefix(block: BlockIR): boolean {
  const text = (block.text ?? block.sentences?.join(" ") ?? "").trim();
  return /^(figure|fig\.|image|source|caption|table|chart|그림|표|출처)[:\s]/i.test(text);
}
