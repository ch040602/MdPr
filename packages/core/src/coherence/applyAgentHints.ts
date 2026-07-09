import type { BlockIR, CoherenceGroup, Diagnostic, PresentationIR, SemanticBlockRole, SlideIR, SlideIntent } from "../ir/types.js";
import { countPrimaryItems } from "../intent/detectSlideIntent.js";
import { calculateDensity } from "../split/density.js";
import { buildCoherenceGroups } from "./buildCoherenceGroups.js";

export type AgentGroupCandidate = {
  elementIds: string[];
  role: SemanticBlockRole | CoherenceGroup["role"];
  confidence: number;
};

export type AgentImportanceCandidate = {
  elementId: string;
  importance: "primary" | "secondary" | "supporting";
  confidence: number;
};

export type AgentKeyMessageCandidate = {
  messageRole: "main-takeaway" | "decision-needed" | "risk-callout" | "proof-anchor" | "section-transition";
  emphasisLevel: "primary" | "secondary" | "supporting";
  elementIds: string[];
  evidenceRefs?: string[];
  claimRef?: string;
  preferredPlaceholderRole?: "title" | "subtitle" | "body" | "callout" | "caption";
  reason: string;
  confidence: number;
};

export type AgentContentSplitCandidate = {
  reason: "dense-content" | "mixed-topics" | "long-bullets" | "evidence-overload";
  elementIds: string[];
  preferredSplitBy: "h2" | "h3" | "h4" | "block-group" | "list-chunk";
  confidence: number;
};

export type AgentReadabilityCandidate = {
  action: "shorten-copy" | "plain-language" | "reduce-bullet-count" | "claim-title" | "move-detail-to-notes";
  elementIds: string[];
  reason: string;
  confidence: number;
};

export type AgentWorkflowIntentCandidate = {
  intent: "template-fill" | "style-transform" | "theme-import" | "generated-asset-request";
  confidence: number;
  evidenceRefs: string[];
};

export type AgentTemplateUseCandidate = {
  templateSourceRef: string;
  masterSlidePolicy: "preserve-existing-master-slides" | "use-master-as-theme-source";
  placeholderPolicy: "prefer-existing-placeholders" | "fill-named-slots-only";
  confidence: number;
};

export type AgentMediaPolicyCandidate = {
  imageUse: "no-image" | "source-image-only" | "generated-asset-approved";
  imageSearch: "disabled" | "source-evidence-only" | "explicit-request-only";
  iconUse: "no-new-icons" | "semantic-keywords-only";
  evidenceRefs: string[];
};

export type AgentIconKeywordCandidate = {
  keyword: string;
  elementIds: string[];
  evidenceRefs: string[];
  reason: string;
  confidence: number;
  workflowIntentRef?: string;
};

export type AcceptedAgentHint = {
  slideId: string;
  workflowIntentCandidate?: AgentWorkflowIntentCandidate;
  intentCandidate?: SlideIntent;
  confidence: number;
  groupCandidates?: AgentGroupCandidate[];
  importanceCandidates?: AgentImportanceCandidate[];
  keyMessageCandidates?: AgentKeyMessageCandidate[];
  contentSplitCandidates?: AgentContentSplitCandidate[];
  readabilityCandidates?: AgentReadabilityCandidate[];
  templateUseCandidate?: AgentTemplateUseCandidate;
  mediaPolicyCandidate?: AgentMediaPolicyCandidate;
  iconKeywordCandidates?: AgentIconKeywordCandidate[];
  rationale?: string;
};

const MIN_HINT_CONFIDENCE = 0.5;

export function applyAgentHintsToPresentation(
  presentation: PresentationIR,
  hints: readonly AcceptedAgentHint[] = [],
): PresentationIR {
  if (!hints.length) return presentation;

  const next = structuredClone(presentation);
  let contentSplitApplied = false;

  for (const hint of hints) {
    if (hint.confidence < MIN_HINT_CONFIDENCE) {
      next.diagnostics.push(ignoredHintDiagnostic(hint));
      continue;
    }
    contentSplitApplied = applyContentSplitHints(next, hint) || contentSplitApplied;
  }

  if (contentSplitApplied) {
    next.slides.forEach((slide, index) => {
      slide.index = index + 1;
    });
    next.coherenceGroups = buildCoherenceGroups(next.slides);
  }

  const groupsBySlideId = new Map(next.coherenceGroups.map((group) => [group.slideId, group]));
  const slidesById = new Map(next.slides.map((slide) => [slide.id, slide]));

  for (const hint of hints) {
    if (hint.confidence < MIN_HINT_CONFIDENCE) continue;
    const slide = slidesById.get(hint.slideId);
    const group = groupsBySlideId.get(hint.slideId);
    if (!slide || !group) continue;

    const blockIds = new Set(slide.blocks.map((block) => block.id));
    const acceptedGroupCandidates = (hint.groupCandidates ?? [])
      .filter((candidate) => candidate.confidence >= MIN_HINT_CONFIDENCE)
      .map((candidate) => ({
        ...candidate,
        elementIds: candidate.elementIds.filter((id) => blockIds.has(id)),
      }))
      .filter((candidate) => candidate.elementIds.length > 0);
    const acceptedImportance = (hint.importanceCandidates ?? [])
      .filter((candidate) => candidate.confidence >= MIN_HINT_CONFIDENCE && blockIds.has(candidate.elementId));
    const acceptedKeyMessages = (hint.keyMessageCandidates ?? [])
      .filter((candidate) => candidate.confidence >= MIN_HINT_CONFIDENCE)
      .map((candidate) => ({
        ...candidate,
        elementIds: resolveHintElementIds(candidate.elementIds, blockIds),
      }))
      .filter((candidate) => candidate.elementIds.length > 0);
    const acceptedReadability = (hint.readabilityCandidates ?? [])
      .filter((candidate) => candidate.confidence >= MIN_HINT_CONFIDENCE)
      .map((candidate) => ({
        ...candidate,
        elementIds: resolveHintElementIds(candidate.elementIds, blockIds),
      }))
      .filter((candidate) => candidate.elementIds.length > 0);
    const acceptedIconKeywords = (hint.iconKeywordCandidates ?? [])
      .filter((candidate) => candidate.confidence >= MIN_HINT_CONFIDENCE)
      .map((candidate) => ({
        ...candidate,
        elementIds: resolveHintElementIds(candidate.elementIds, blockIds),
      }))
      .filter((candidate) => candidate.elementIds.length > 0 && candidate.evidenceRefs.length > 0);

    if (
      !acceptedGroupCandidates.length
      && !acceptedImportance.length
      && !acceptedKeyMessages.length
      && !acceptedReadability.length
      && !acceptedIconKeywords.length
      && !hint.intentCandidate
      && !hint.workflowIntentCandidate
      && !hint.templateUseCandidate
      && !hint.mediaPolicyCandidate
    ) {
      continue;
    }

    slide.tags = Array.from(new Set([...slide.tags, "agent-hint-semantic"]));
    if (hint.intentCandidate && hint.intentCandidate !== slide.intent) {
      slide.secondaryIntents = Array.from(new Set([...(slide.secondaryIntents ?? []), hint.intentCandidate]));
    }

    mergeGroupCandidates(group, acceptedGroupCandidates);
    mergeImportanceCandidates(group, acceptedImportance, blockIds);
    mergeKeyMessageCandidates(group, acceptedKeyMessages, blockIds);
    for (const candidate of acceptedReadability) {
      next.diagnostics.push(readabilityDiagnostic(slide, candidate));
    }
    for (const candidate of acceptedIconKeywords) {
      next.diagnostics.push(iconKeywordDiagnostic(slide, candidate));
    }
  }

  return next;
}

function ignoredHintDiagnostic(hint: AcceptedAgentHint): Diagnostic {
  return {
    level: "info",
    code: "AGENT_HINT_IGNORED_LOW_CONFIDENCE",
    message: `Ignored agent hint for slide "${hint.slideId}" because confidence ${hint.confidence} is below ${MIN_HINT_CONFIDENCE}.`,
    slideId: hint.slideId,
    details: {
      confidence: hint.confidence,
      threshold: MIN_HINT_CONFIDENCE,
    },
  };
}

function mergeGroupCandidates(group: CoherenceGroup, candidates: AgentGroupCandidate[]): void {
  if (!candidates.length) return;

  const strongestGroupRole = candidates
    .filter((candidate) => isCoherenceGroupRole(candidate.role))
    .sort((a, b) => b.confidence - a.confidence)[0];
  if (strongestGroupRole) {
    group.role = strongestGroupRole.role as CoherenceGroup["role"];
    if (group.role === "evidence-pack" || group.role === "workflow") {
      group.keepTogether = true;
      group.splitPriority = Math.min(group.splitPriority, 1);
    }
  }

  group.blockRoles ??= {};
  const signals = new Set(group.semanticSignals ?? []);
  for (const candidate of candidates) {
    const semanticRole = semanticRoleFromHintRole(candidate.role);
    signals.add(semanticRole);
    for (const elementId of candidate.elementIds) {
      group.blockRoles[elementId] = semanticRole;
    }
  }
  group.semanticSignals = Array.from(signals);
}

function mergeImportanceCandidates(
  group: CoherenceGroup,
  candidates: AgentImportanceCandidate[],
  blockIds: ReadonlySet<string>,
): void {
  const primary = candidates
    .filter((candidate) => candidate.importance === "primary")
    .sort((a, b) => b.confidence - a.confidence)[0];
  if (!primary || !blockIds.has(primary.elementId)) return;

  const previousPrimary = group.primaryBlockId;
  group.primaryBlockId = primary.elementId;
  group.supportingBlockIds = Array.from(new Set([
    ...group.supportingBlockIds.filter((id) => id !== primary.elementId),
    previousPrimary,
  ].filter((id) => id !== primary.elementId && blockIds.has(id))));
}

function resolveHintElementIds(elementIds: string[], blockIds: ReadonlySet<string>): string[] {
  const resolved: string[] = [];
  const available = [...blockIds];
  for (const elementId of elementIds) {
    if (blockIds.has(elementId)) {
      resolved.push(elementId);
      continue;
    }
    resolved.push(...available.filter((blockId) => blockId.startsWith(`${elementId}-hint-chunk-`)));
  }
  return Array.from(new Set(resolved));
}

function mergeKeyMessageCandidates(
  group: CoherenceGroup,
  candidates: AgentKeyMessageCandidate[],
  blockIds: ReadonlySet<string>,
): void {
  const primary = candidates
    .filter((candidate) => candidate.emphasisLevel === "primary")
    .sort((a, b) => b.confidence - a.confidence)[0];
  if (!primary) return;

  const primaryElementId = primary.elementIds.find((id) => blockIds.has(id));
  if (!primaryElementId) return;

  const previousPrimary = group.primaryBlockId;
  group.primaryBlockId = primaryElementId;
  group.supportingBlockIds = Array.from(new Set([
    ...group.supportingBlockIds.filter((id) => id !== primaryElementId),
    ...primary.elementIds.filter((id) => id !== primaryElementId && blockIds.has(id)),
    previousPrimary,
  ].filter((id) => id !== primaryElementId && blockIds.has(id))));
  group.semanticSignals = Array.from(new Set([...(group.semanticSignals ?? []), "claim"]));
  group.blockRoles ??= {};
  group.blockRoles[primaryElementId] = primary.messageRole === "proof-anchor" ? "evidence" : "claim";
}

function readabilityDiagnostic(slide: SlideIR, candidate: AgentReadabilityCandidate): Diagnostic {
  return {
    level: "info",
    code: "AGENT_HINT_READABILITY_NOTE",
    message: `Readability hint "${candidate.action}" recorded for slide "${slide.title ?? slide.id}" without rewriting source text.`,
    slideId: slide.id,
    details: {
      action: candidate.action,
      elementIds: candidate.elementIds,
      reason: candidate.reason,
      confidence: candidate.confidence,
      sourcePreserved: true,
    },
  };
}

function iconKeywordDiagnostic(slide: SlideIR, candidate: AgentIconKeywordCandidate): Diagnostic {
  return {
    level: "info",
    code: "AGENT_HINT_ICON_KEYWORD",
    message: `Semantic icon keyword "${candidate.keyword}" recorded for slide "${slide.title ?? slide.id}" without selecting an icon asset.`,
    slideId: slide.id,
    details: {
      keyword: candidate.keyword,
      elementIds: candidate.elementIds,
      evidenceRefs: candidate.evidenceRefs,
      reason: candidate.reason,
      confidence: candidate.confidence,
      finalIconAssetSelected: false,
    },
  };
}

function applyContentSplitHints(presentation: PresentationIR, hint: AcceptedAgentHint): boolean {
  const candidate = (hint.contentSplitCandidates ?? [])
    .filter((entry) => entry.confidence >= MIN_HINT_CONFIDENCE && entry.preferredSplitBy === "list-chunk")
    .sort((a, b) => b.confidence - a.confidence)[0];
  if (!candidate) return false;

  const slideIndex = presentation.slides.findIndex((slide) => slide.id === hint.slideId);
  if (slideIndex < 0) return false;
  const slide = presentation.slides[slideIndex]!;
  const targetIds = new Set(candidate.elementIds);
  const blockIndex = slide.blocks.findIndex((block) => block.type === "bulletList" && targetIds.has(block.id));
  if (blockIndex < 0) return false;

  const block = slide.blocks[blockIndex]!;
  const chunks = splitListBlockForHint(block);
  if (chunks.length <= 1) return false;

  const before = slide.blocks.slice(0, blockIndex);
  const after = slide.blocks.slice(blockIndex + 1);
  const replacementSlides = chunks.map((chunk, index) => {
    const blocks = [
      ...(index === 0 ? before : []),
      chunk,
      ...(index === chunks.length - 1 ? after : []),
    ];
    const continuation = `${index + 1}/${chunks.length}`;
    return {
      ...slide,
      id: index === 0 ? slide.id : `${slide.id}-hint-list-${index + 1}`,
      title: index === 0 ? slide.title : `${slide.title ?? slide.id} (Cont. ${continuation})`,
      blocks,
      tags: Array.from(new Set([...slide.tags, "agent-hint-semantic", "agent-hint-content-split", "auto-list-chunk"])),
      primaryItemCount: countPrimaryItems(blocks),
      density: calculateDensity(blocks).total,
    };
  });
  presentation.slides.splice(slideIndex, 1, ...replacementSlides);
  presentation.diagnostics.push({
    level: "info",
    code: "AGENT_HINT_CONTENT_SPLIT_APPLIED",
    message: `Applied source-preserving list-chunk split for slide "${slide.title ?? slide.id}".`,
    slideId: slide.id,
    details: {
      preferredSplitBy: candidate.preferredSplitBy,
      reason: candidate.reason,
      blockId: block.id,
      chunkCount: chunks.length,
      sourcePreserved: true,
    },
  });
  return true;
}

function splitListBlockForHint(block: BlockIR): BlockIR[] {
  const listItems = block.listItems ?? [];
  const items = block.items ?? [];
  const itemCount = listItems.length || items.length;
  if (itemCount <= 3) return [block];
  const chunks: BlockIR[] = [];
  const chunkSize = 3;

  for (let index = 0; index < itemCount; index += chunkSize) {
    const chunkListItems = listItems.slice(index, index + chunkSize);
    const chunkItems = items.length
      ? items.slice(index, index + chunkSize)
      : chunkListItems.map((item) => item.text);
    chunks.push({
      ...block,
      id: `${block.id}-hint-chunk-${chunks.length + 1}`,
      items: chunkItems,
      listItems: chunkListItems,
    });
  }

  return chunks;
}

function isCoherenceGroupRole(role: string): role is CoherenceGroup["role"] {
  return role === "argument"
    || role === "comparison"
    || role === "workflow"
    || role === "evidence-pack"
    || role === "summary";
}

function semanticRoleFromHintRole(role: SemanticBlockRole | CoherenceGroup["role"]): SemanticBlockRole {
  if (role === "argument") return "claim";
  if (role === "comparison") return "evidence";
  if (role === "workflow") return "action";
  if (role === "evidence-pack") return "evidence";
  if (role === "summary") return "claim";
  return role;
}
