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

export type AgentVisualAssetCandidate = {
  kind: "generated-image";
  trigger: "explicit-generated-asset-request";
  requestRef: string;
  semanticPrompt: string;
  confidence: number;
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
  visualAssetCandidates?: AgentVisualAssetCandidate[];
  rationale?: string;
};

const MIN_HINT_CONFIDENCE = 0.5;
const HINT_CHUNK_SEPARATOR = "-hint-chunk-";
const RUNTIME_OWNED_AGENT_HINT_FIELDS = new Set([
  "box",
  "coordinates",
  "crop",
  "cropRect",
  "color",
  "colors",
  "exactIcon",
  "finalImageAsset",
  "finalImagePath",
  "fontFamily",
  "fontSize",
  "geometry",
  "h",
  "iconName",
  "iconPath",
  "layoutId",
  "recipeId",
  "rendererObject",
  "rendererObjectId",
  "typography",
  "variantId",
  "w",
  "x",
  "y",
  "z-order",
  "zOrder",
]);

type SplitLineageEntry = {
  slideId: string;
  blockId: string;
  sourceElementId: string;
};

type SplitResult = {
  applied: boolean;
  lineage: SplitLineageEntry[];
};

export function applyAgentHintsToPresentation(
  presentation: PresentationIR,
  hints: readonly AcceptedAgentHint[] = [],
): PresentationIR {
  if (!hints.length) return presentation;

  const next = structuredClone(presentation);
  next.diagnostics.push(...runtimeOwnershipDiagnostics(hints));
  let contentSplitApplied = false;
  const splitLineage = new Map<string, SplitLineageEntry[]>();

  for (const hint of hints) {
    if (hint.confidence < MIN_HINT_CONFIDENCE) {
      next.diagnostics.push(ignoredHintDiagnostic(hint));
      continue;
    }
    const splitResult = applyContentSplitHints(next, hint);
    if (splitResult.applied) {
      contentSplitApplied = true;
      splitLineage.set(hint.slideId, splitResult.lineage);
    }
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
    const targetSlides = getHintTargetSlides(hint, slidesById, splitLineage);
    for (const slide of targetSlides) {
      const group = groupsBySlideId.get(slide.id);
      if (!group) continue;

      const scope = buildSlideHintScope(slide);
      const acceptedGroupCandidates = (hint.groupCandidates ?? [])
        .filter((candidate) => candidate.confidence >= MIN_HINT_CONFIDENCE)
        .map((candidate) => ({
          ...candidate,
          elementIds: resolveScopedHintElementIds(candidate.elementIds, scope),
        }))
        .filter((candidate) => candidate.elementIds.length > 0);
      const acceptedImportance = (hint.importanceCandidates ?? [])
        .filter((candidate) => candidate.confidence >= MIN_HINT_CONFIDENCE)
        .map((candidate) => ({
          ...candidate,
          elementId: resolveScopedHintElementIds([candidate.elementId], scope)[0],
        }))
        .filter((candidate): candidate is AgentImportanceCandidate => Boolean(candidate.elementId));
      const acceptedKeyMessages = (hint.keyMessageCandidates ?? [])
        .filter((candidate) => candidate.confidence >= MIN_HINT_CONFIDENCE)
        .map((candidate) => ({
          ...candidate,
          elementIds: resolveScopedHintElementIds(candidate.elementIds, scope),
        }))
        .filter((candidate) => candidate.elementIds.length > 0);
      const acceptedReadability = (hint.readabilityCandidates ?? [])
        .filter((candidate) => candidate.confidence >= MIN_HINT_CONFIDENCE)
        .map((candidate) => ({
          ...candidate,
          elementIds: resolveScopedHintElementIds(candidate.elementIds, scope),
        }))
        .filter((candidate) => candidate.elementIds.length > 0);
      const iconPolicyAllowsKeywords = hint.mediaPolicyCandidate?.iconUse !== "no-new-icons";
      const acceptedIconKeywords = (hint.iconKeywordCandidates ?? [])
        .filter((candidate) => candidate.confidence >= MIN_HINT_CONFIDENCE)
        .map((candidate) => ({
          ...candidate,
          elementIds: resolveScopedHintElementIds(candidate.elementIds, scope),
        }))
        .filter((candidate) => candidate.elementIds.length > 0 && candidate.evidenceRefs.length > 0 && iconPolicyAllowsKeywords);
      const acceptedVisualAssets = (hint.visualAssetCandidates ?? [])
        .filter((candidate) => candidate.confidence >= MIN_HINT_CONFIDENCE && visualAssetHasPositivePermission(hint, candidate));

      recordIgnoredScopedHints(next, slide, hint, scope, {
        acceptedKeyMessages,
        acceptedReadability,
        acceptedIconKeywords,
      });
      recordPolicyConflictDiagnostics(next, slide, hint);

      if (
        !acceptedGroupCandidates.length
        && !acceptedImportance.length
        && !acceptedKeyMessages.length
        && !acceptedReadability.length
        && !acceptedIconKeywords.length
        && !acceptedVisualAssets.length
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
      mergeImportanceCandidates(group, acceptedImportance, scope.blockIds);
      mergeKeyMessageCandidates(group, acceptedKeyMessages, scope.blockIds);
      for (const candidate of acceptedReadability) {
        next.diagnostics.push(readabilityDiagnostic(slide, candidate));
      }
      for (const candidate of acceptedIconKeywords) {
        next.diagnostics.push(iconKeywordDiagnostic(slide, candidate));
      }
      for (const candidate of acceptedVisualAssets) {
        next.diagnostics.push(visualAssetDiagnostic(slide, candidate));
      }
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
  const sourceRanges = sourceRangesForElementIds(slide, candidate.elementIds);
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
      rewriteApplied: false,
      summarizationApplied: false,
      textDeletionApplied: false,
      allowedRuntimeActions: ["split", "wrap", "overflow-handling"],
      sourceRanges,
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
      exactIconSelected: false,
      visibleSlideTextInserted: false,
    },
  };
}

function visualAssetDiagnostic(slide: SlideIR, candidate: AgentVisualAssetCandidate): Diagnostic {
  return {
    level: "info",
    code: "AGENT_HINT_VISUAL_ASSET_REQUEST",
    message: `Generated visual asset request recorded for slide "${slide.title ?? slide.id}" without selecting an asset or placement.`,
    slideId: slide.id,
    details: {
      kind: candidate.kind,
      trigger: candidate.trigger,
      requestRef: candidate.requestRef,
      semanticPrompt: candidate.semanticPrompt,
      confidence: candidate.confidence,
      finalAssetPathSelected: false,
      finalPlacementSelected: false,
      contentChannel: "generated-asset-request",
      visibleSlideTextInserted: false,
      captionInserted: false,
      altTextInserted: false,
    },
  };
}

function applyContentSplitHints(presentation: PresentationIR, hint: AcceptedAgentHint): SplitResult {
  const candidate = (hint.contentSplitCandidates ?? [])
    .filter((entry) => entry.confidence >= MIN_HINT_CONFIDENCE && entry.preferredSplitBy === "list-chunk")
    .sort((a, b) => b.confidence - a.confidence)[0];
  if (!candidate) return { applied: false, lineage: [] };

  const slideIndex = presentation.slides.findIndex((slide) => slide.id === hint.slideId);
  if (slideIndex < 0) return { applied: false, lineage: [] };
  const slide = presentation.slides[slideIndex]!;
  const targetIds = new Set(candidate.elementIds);
  const blockIndex = slide.blocks.findIndex((block) => block.type === "bulletList" && targetIds.has(block.id));
  if (blockIndex < 0) return { applied: false, lineage: [] };

  const block = slide.blocks[blockIndex]!;
  const chunks = splitListBlockForHint(block);
  if (chunks.length <= 1) return { applied: false, lineage: [] };

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
  const lineage = replacementSlides.flatMap((replacementSlide) =>
    replacementSlide.blocks
      .filter((candidateBlock) => sourceElementIdForHintChunk(candidateBlock.id) === block.id)
      .map((candidateBlock) => ({
        slideId: replacementSlide.id,
        blockId: candidateBlock.id,
        sourceElementId: block.id,
      }))
  );
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
      lineage,
    },
  });
  for (const entry of lineage) {
    presentation.diagnostics.push({
      level: "info",
      code: "AGENT_HINT_SPLIT_LINEAGE",
      message: `Recorded source lineage for split block "${entry.blockId}" on slide "${entry.slideId}".`,
      slideId: entry.slideId,
      details: {
        sourceSlideId: hint.slideId,
        sourceElementId: entry.sourceElementId,
        blockId: entry.blockId,
        boundarySafe: true,
      },
    });
  }
  return { applied: true, lineage };
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

function getHintTargetSlides(
  hint: AcceptedAgentHint,
  slidesById: ReadonlyMap<string, SlideIR>,
  splitLineage: ReadonlyMap<string, SplitLineageEntry[]>,
): SlideIR[] {
  const slide = slidesById.get(hint.slideId);
  const continuationIds = [...new Set((splitLineage.get(hint.slideId) ?? []).map((entry) => entry.slideId))];
  const continuationSlides = continuationIds
    .map((slideId) => slidesById.get(slideId))
    .filter((candidate): candidate is SlideIR => Boolean(candidate));
  if (continuationSlides.length) return continuationSlides;
  return slide ? [slide] : [];
}

function buildSlideHintScope(slide: SlideIR): { blockIds: Set<string>; sourceToBlockIds: Map<string, string[]> } {
  const blockIds = new Set(slide.blocks.map((block) => block.id));
  const sourceToBlockIds = new Map<string, string[]>();
  for (const block of slide.blocks) {
    const sourceElementId = sourceElementIdForHintChunk(block.id);
    if (!sourceElementId) continue;
    sourceToBlockIds.set(sourceElementId, [...(sourceToBlockIds.get(sourceElementId) ?? []), block.id]);
  }
  return { blockIds, sourceToBlockIds };
}

function resolveScopedHintElementIds(
  elementIds: string[],
  scope: { blockIds: ReadonlySet<string>; sourceToBlockIds: ReadonlyMap<string, string[]> },
): string[] {
  const resolved: string[] = [];
  for (const elementId of elementIds) {
    if (scope.blockIds.has(elementId)) {
      resolved.push(elementId);
      continue;
    }
    resolved.push(...(scope.sourceToBlockIds.get(elementId) ?? []));
  }
  return Array.from(new Set(resolved));
}

function sourceElementIdForHintChunk(blockId: string): string | undefined {
  const index = blockId.indexOf(HINT_CHUNK_SEPARATOR);
  return index > 0 ? blockId.slice(0, index) : undefined;
}

function recordIgnoredScopedHints(
  presentation: PresentationIR,
  slide: SlideIR,
  hint: AcceptedAgentHint,
  scope: { blockIds: ReadonlySet<string>; sourceToBlockIds: ReadonlyMap<string, string[]> },
  accepted: {
    acceptedKeyMessages: AgentKeyMessageCandidate[];
    acceptedReadability: AgentReadabilityCandidate[];
    acceptedIconKeywords: AgentIconKeywordCandidate[];
  },
): void {
  const acceptedKeyMessageIds = new Set(accepted.acceptedKeyMessages.flatMap((candidate) => candidate.elementIds));
  const acceptedReadabilityIds = new Set(accepted.acceptedReadability.flatMap((candidate) => candidate.elementIds));
  const acceptedIconIds = new Set(accepted.acceptedIconKeywords.flatMap((candidate) => candidate.elementIds));
  for (const candidate of hint.keyMessageCandidates ?? []) {
    recordMissingElementDiagnostic(presentation, slide, "keyMessageCandidates", candidate.elementIds, scope, acceptedKeyMessageIds);
  }
  for (const candidate of hint.readabilityCandidates ?? []) {
    recordMissingElementDiagnostic(presentation, slide, "readabilityCandidates", candidate.elementIds, scope, acceptedReadabilityIds);
  }
  for (const candidate of hint.iconKeywordCandidates ?? []) {
    recordMissingElementDiagnostic(presentation, slide, "iconKeywordCandidates", candidate.elementIds, scope, acceptedIconIds);
  }
}

function recordMissingElementDiagnostic(
  presentation: PresentationIR,
  slide: SlideIR,
  candidateKind: string,
  elementIds: string[],
  scope: { blockIds: ReadonlySet<string>; sourceToBlockIds: ReadonlyMap<string, string[]> },
  acceptedIds: ReadonlySet<string>,
): void {
  const unresolved = elementIds.filter((elementId) => {
    if (scope.blockIds.has(elementId)) return false;
    const lineageMatches = scope.sourceToBlockIds.get(elementId) ?? [];
    return !lineageMatches.some((blockId) => acceptedIds.has(blockId));
  });
  if (!unresolved.length) return;
  presentation.diagnostics.push({
    level: "info",
    code: "AGENT_HINT_IGNORED_MISSING_ELEMENT",
    message: `Ignored ${candidateKind} references not present on slide "${slide.title ?? slide.id}".`,
    slideId: slide.id,
    details: {
      candidateKind,
      missingElementIds: unresolved,
      availableElementIds: [...scope.blockIds],
      boundarySafe: true,
    },
  });
}

function recordPolicyConflictDiagnostics(
  presentation: PresentationIR,
  slide: SlideIR,
  hint: AcceptedAgentHint,
): void {
  const policy = hint.mediaPolicyCandidate;
  if (!policy) return;
  if (policy.iconUse === "no-new-icons" && (hint.iconKeywordCandidates?.length ?? 0) > 0) {
    presentation.diagnostics.push({
      level: "warning",
      code: "AGENT_HINT_POLICY_CONFLICT",
      message: `Ignored semantic icon candidates for slide "${slide.title ?? slide.id}" because media policy forbids new icons.`,
      slideId: slide.id,
      details: {
        policy: "iconUse:no-new-icons",
        candidateKind: "iconKeywordCandidates",
        candidateCount: hint.iconKeywordCandidates?.length ?? 0,
      },
    });
  }
  if (policy.imageUse === "no-image" && (hint.visualAssetCandidates?.length ?? 0) > 0) {
    presentation.diagnostics.push({
      level: "warning",
      code: "AGENT_HINT_POLICY_CONFLICT",
      message: `Ignored generated visual asset candidates for slide "${slide.title ?? slide.id}" because media policy forbids images.`,
      slideId: slide.id,
      details: {
        policy: "imageUse:no-image",
        candidateKind: "visualAssetCandidates",
        candidateCount: hint.visualAssetCandidates?.length ?? 0,
      },
    });
  }
  if (policy.imageUse !== "no-image") {
    const unauthorized = (hint.visualAssetCandidates ?? [])
      .filter((candidate) => candidate.confidence >= MIN_HINT_CONFIDENCE && !visualAssetHasPositivePermission(hint, candidate));
    if (unauthorized.length) {
      presentation.diagnostics.push({
        level: "warning",
        code: "AGENT_HINT_MEDIA_PERMISSION_MISSING",
        message: `Ignored generated visual asset candidates for slide "${slide.title ?? slide.id}" because no explicit generated-asset request evidence was supplied.`,
        slideId: slide.id,
        details: {
          candidateKind: "visualAssetCandidates",
          candidateCount: unauthorized.length,
          requiredEvidence: ["workflowIntent:generated-asset-request", "imageSearch:explicit-request-only", "request:* or instruction:generated-asset-request"],
          sourcePreserved: true,
        },
      });
    }
  }
}

function runtimeOwnershipDiagnostics(hints: readonly AcceptedAgentHint[]): Diagnostic[] {
  return hints.flatMap((hint) => {
    const paths = runtimeOwnedFieldPaths(hint);
    if (!paths.length) return [];
    return [{
      level: "warning" as const,
      code: "AGENT_HINT_RUNTIME_OWNERSHIP_FIELD",
      message: `Ignored runtime-owned final-decision fields in agent hint for slide "${hint.slideId}".`,
      slideId: hint.slideId,
      details: {
        fieldPaths: paths,
        rule: "agent-hints-must-not-own-geometry-theme-assets-or-renderer-objects",
        runtimeOwner: "MDPR",
      },
    }];
  });
}

function runtimeOwnedFieldPaths(value: unknown, path = "$"): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => runtimeOwnedFieldPaths(item, `${path}[${index}]`));
  }
  const paths: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (RUNTIME_OWNED_AGENT_HINT_FIELDS.has(key)) paths.push(childPath);
    paths.push(...runtimeOwnedFieldPaths(child, childPath));
  }
  return paths;
}

function visualAssetHasPositivePermission(hint: AcceptedAgentHint, candidate: AgentVisualAssetCandidate): boolean {
  if (hint.mediaPolicyCandidate?.imageUse !== "generated-asset-approved") return false;
  if (hint.mediaPolicyCandidate.imageSearch !== "explicit-request-only") return false;
  if (candidate.trigger !== "explicit-generated-asset-request") return false;
  const refs = [
    ...(hint.workflowIntentCandidate?.evidenceRefs ?? []),
    ...(hint.mediaPolicyCandidate.evidenceRefs ?? []),
    candidate.requestRef,
  ].filter(Boolean);
  const hasRequestRef = refs.some((ref) => /^(?:request:|instruction:generated-asset-request\b)/i.test(ref));
  return hint.workflowIntentCandidate?.intent === "generated-asset-request" && hasRequestRef;
}

function sourceRangesForElementIds(slide: SlideIR, elementIds: string[]): Array<{ elementId: string; startLine?: number; endLine?: number }> {
  const ids = new Set(elementIds);
  return slide.blocks
    .filter((block) => ids.has(block.id))
    .map((block) => ({
      elementId: block.id,
      ...(block.source?.startLine !== undefined ? { startLine: block.source.startLine } : {}),
      ...(block.source?.endLine !== undefined ? { endLine: block.source.endLine } : {}),
    }));
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
