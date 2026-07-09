import type { BlockIR, SlideIR } from "../ir/types.js";

const neutralTitlePattern = /^(agenda|background|motivation|overview|introduction|summary|results?|discussion|interpretation|limitations?|conclusion|next steps?|status|draft status|scope|method|evaluation setup|문제 정의|핵심 판단|검증 관점|결론|결과|한계|개요)$/i;
const claimSignalPattern = /\b(should|must|because|therefore|shows|means|indicates|suggests|result|impact|why|goal|purpose|objective|improves?|keeps?|preserves?|supports?)\b/i;
const koreanClaimSignalPattern = /목적|이유|결과|의미|따라서|때문|필요|개선|유지|보존|지원|검증|보여|해야|한다/;

export type ClaimMessageCandidate = {
  blockId: string;
  text: string;
  source: "explicit-prefix" | "claim-like-text";
};

export function findSlideClaimMessageCandidate(slide: SlideIR): ClaimMessageCandidate | undefined {
  for (const block of slide.blocks) {
    if (block.type === "slideBreak" || block.type === "heading") continue;
    if (block.type !== "paragraph" && block.type !== "quote") return undefined;

    const text = blockText(block);
    if (!text) continue;
    const explicit = explicitClaimText(text);
    if (explicit) return { blockId: block.id, text: explicit, source: "explicit-prefix" };
    if (isClaimLikeText(text) && isUsefulMessageLength(text)) {
      return { blockId: block.id, text: text.trim(), source: "claim-like-text" };
    }
    return undefined;
  }
  return undefined;
}

export function hasSlideClaimMessageCandidate(slide: SlideIR): boolean {
  return Boolean(findSlideClaimMessageCandidate(slide));
}

export function isNeutralSlideTitle(title?: string): boolean {
  if (!title) return false;
  return neutralTitlePattern.test(title.trim());
}

export function isClaimLikeText(text: string): boolean {
  return claimSignalPattern.test(text) || koreanClaimSignalPattern.test(text);
}

function explicitClaimText(text: string): string | undefined {
  const match = /^\s*(?:claim|takeaway|message|핵심|주장)\s*[:：]\s*(.+)$/i.exec(text);
  const value = match?.[1]?.trim();
  return value && isUsefulMessageLength(value) ? value : undefined;
}

function isUsefulMessageLength(text: string): boolean {
  const length = text.trim().length;
  return length >= 18 && length <= 220;
}

function blockText(block: BlockIR): string {
  if (block.text) return block.text;
  if (block.sentences?.length) return block.sentences.join(" ");
  if (block.lines?.length) return block.lines.join(" ");
  return "";
}
