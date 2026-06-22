import type { CoherenceGroup, PresentationIR, SemanticBlockRole, SlideIntent } from "../ir/types.js";

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

export type AcceptedAgentHint = {
  slideId: string;
  intentCandidate?: SlideIntent;
  confidence: number;
  groupCandidates?: AgentGroupCandidate[];
  importanceCandidates?: AgentImportanceCandidate[];
  iconKeywordCandidates?: string[];
  rationale?: string;
};

const MIN_HINT_CONFIDENCE = 0.5;

export function applyAgentHintsToPresentation(
  presentation: PresentationIR,
  hints: readonly AcceptedAgentHint[] = [],
): PresentationIR {
  if (!hints.length) return presentation;

  const next = structuredClone(presentation);
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

    if (!acceptedGroupCandidates.length && !acceptedImportance.length && !hint.intentCandidate && !(hint.iconKeywordCandidates?.length)) {
      continue;
    }

    slide.tags = Array.from(new Set([...slide.tags, "agent-hint-semantic"]));
    if (hint.intentCandidate && hint.intentCandidate !== slide.intent) {
      slide.secondaryIntents = Array.from(new Set([...(slide.secondaryIntents ?? []), hint.intentCandidate]));
    }

    mergeGroupCandidates(group, acceptedGroupCandidates);
    mergeImportanceCandidates(group, acceptedImportance, blockIds);
  }

  return next;
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
