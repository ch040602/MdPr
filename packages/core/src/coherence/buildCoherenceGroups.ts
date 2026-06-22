import type { BlockIR, CoherenceGroup, SemanticBlockRole, SlideIR } from "../ir/types.js";
import { createStableId } from "../utils/stableId.js";
import { findCaptionPairs, isCaptionBlock } from "./captionClassifier.js";

export function buildCoherenceGroups(slides: SlideIR[]): CoherenceGroup[] {
  return slides
    .filter((slide) => slide.role === "content")
    .map((slide) => coherenceGroupForSlide(slide))
    .filter((group): group is CoherenceGroup => Boolean(group));
}

function coherenceGroupForSlide(slide: SlideIR): CoherenceGroup | undefined {
  const blocks = slide.blocks.filter((block) => block.type !== "slideBreak");
  if (!blocks.length) return undefined;
  const role = coherenceRoleForSlide(slide);
  const primary = primaryBlockForGroup(blocks, role);
  const supporting = blocks.filter((block) => block.id !== primary.id).map((block) => block.id);
  const blockRoles = Object.fromEntries(blocks.map((block) => [block.id, semanticRoleForBlock(block, slide)]));
  const semanticSignals = Array.from(new Set(blocks.flatMap((block) => semanticRolesForText(block, slide))));
  const captionPairs = findCaptionPairs(slide);

  return {
    id: createStableId(["coherence", slide.id, role], "coherence"),
    slideId: slide.id,
    headingPath: slide.headingPath,
    primaryBlockId: primary.id,
    supportingBlockIds: supporting,
    role,
    keepTogether: captionPairs.length > 0 || role === "evidence-pack" || role === "workflow" || supporting.length <= 2,
    splitPriority: role === "evidence-pack" || role === "workflow" || captionPairs.length > 0 ? 1 : supporting.length > 4 ? 4 : 3,
    blockRoles,
    semanticSignals,
  };
}

function coherenceRoleForSlide(slide: SlideIR): CoherenceGroup["role"] {
  const text = slide.blocks.map((block) => `${block.text ?? ""} ${(block.items ?? []).join(" ")}`).join(" ");
  if (/because|therefore|따라서|원인|결과|이유|목적|용도|조건/.test(text)) return "argument";
  if (slide.intent === "comparison") return "comparison";
  if (slide.intent === "diagram" || slide.secondaryIntents?.includes("diagram")) return "workflow";
  if (slide.intent === "evidence" || ["chart", "table", "image", "metric"].some((intent) => slide.secondaryIntents?.includes(intent as SlideIR["intent"]))) return "evidence-pack";
  if (slide.blocks.some((block) => /because|therefore|따라서|원인|결과/i.test(block.text ?? ""))) return "argument";
  return "summary";
}

function primaryBlockForGroup(blocks: BlockIR[], role: CoherenceGroup["role"]): BlockIR {
  if (role === "evidence-pack") {
    return blocks.find((block) => block.type === "paragraph" || block.type === "quote")
      ?? blocks.find((block) => block.type === "bulletList")
      ?? blocks[0]!;
  }
  if (role === "workflow") return blocks.find((block) => block.type === "diagram") ?? blocks[0]!;
  if (role === "comparison") return blocks.find((block) => block.type === "bulletList") ?? blocks[0]!;
  return blocks[0]!;
}

function semanticRoleForBlock(block: BlockIR, slide: SlideIR): SemanticBlockRole {
  return semanticRolesForText(block, slide)[0] ?? "evidence";
}

function semanticRolesForText(block: BlockIR, slide: SlideIR): SemanticBlockRole[] {
  const text = `${block.text ?? ""} ${(block.items ?? []).join(" ")} ${(block.rows ?? []).flat().join(" ")}`.toLowerCase();
  const roles: SemanticBlockRole[] = [];
  if (isCaptionBlock(block, slide)) roles.push("caption");
  if (block.type === "chart" || block.type === "table" || block.type === "image" || block.type === "diagram") roles.push("evidence");
  if (/\d+(?:\.\d+)?\s?(?:%|x|k|m|ms|s|pt|pts|users?)|\$\s?\d+|성능 저하|performance regression/.test(text)) roles.push("metric");
  if (/risk|limitation|주의|한계|조건|constraint/.test(text)) roles.push("risk");
  if (/next|todo|action|해야|할 일|개선|improve|improvement/.test(text)) roles.push("action");
  if (/decision|decide|결정|용도|purpose|usage/.test(text)) roles.push("decision");
  if (/source|출처|reference/.test(text)) roles.push("source");
  if (/example|예시/.test(text)) roles.push("example");
  if (!roles.includes("caption") && (/목적|이유|because|therefore|따라서/.test(text) || block.type === "paragraph" || block.type === "quote")) roles.push("claim");
  if (!roles.length) roles.push("evidence");
  return roles;
}
