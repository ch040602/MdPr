import type { Diagnostic, PresentationIR, SlideIR } from "@mdpresent/core";
import type { LayoutIR } from "@mdpresent/layout";

export function createCoherenceValidationSummary(presentation: PresentationIR, layout: LayoutIR) {
  const diagnostics = coherenceValidationDiagnostics(presentation, layout);
  const claimlessSlides = diagnostics.filter((diagnostic) => diagnostic.code === "CLAIMLESS_EVIDENCE_SLIDE").length;
  const captionDetached = diagnostics.filter((diagnostic) => diagnostic.code === "DETACHED_CAPTION").length;
  const orphanTables = diagnostics.filter((diagnostic) => diagnostic.code === "ORPHAN_TABLE").length;
  const lowObjectCoverage = diagnostics.filter((diagnostic) => diagnostic.code === "LOW_OBJECT_COVERAGE").length;
  const sectionMotifDrift = diagnostics.filter((diagnostic) => diagnostic.code === "SECTION_STYLE_DRIFT").length;
  const evidenceGroups = presentation.coherenceGroups.filter((group) => group.role === "evidence-pack").length;
  const groupedEvidence = presentation.coherenceGroups.filter((group) => group.role === "evidence-pack" && group.supportingBlockIds.length > 0).length;

  return {
    checked: true,
    thresholds: {
      minimumMixedObjectGroupingScore: 0.75,
      minimumObjectCoverageRatio: 0.2,
    },
    orphanEvidenceBlocks: orphanTables,
    captionDetached,
    claimlessSlides,
    sectionMotifDrift,
    continuationTitleQuality: diagnostics.some((diagnostic) => diagnostic.code === "DENSE_CONTINUATION_WITHOUT_TITLE") ? "needs-review" : "ok",
    mixedObjectGroupingScore: evidenceGroups ? Number((groupedEvidence / evidenceGroups).toFixed(2)) : 1,
    checks: {
      claimlessEvidenceSlides: claimlessSlides === 0,
      detachedCaptions: captionDetached === 0,
      orphanTables: orphanTables === 0,
      lowObjectCoverage: lowObjectCoverage === 0,
      sectionMotifDrift: sectionMotifDrift === 0,
    },
    diagnostics,
  };
}

export function coherenceValidationDiagnostics(presentation: PresentationIR, layout: LayoutIR): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const layoutBySlideId = new Map(layout.slides.map((slide) => [slide.sourceSlideId, slide]));

  for (const slide of presentation.slides) {
    if (slide.role !== "content") continue;
    const group = presentation.coherenceGroups.find((candidate) => candidate.slideId === slide.id);
    const blockRoles = group?.blockRoles ?? {};
    const blockTypes = new Set(slide.blocks.map((block) => block.type));
    const hasEvidenceObject = ["table", "chart", "image", "diagram"].some((type) => blockTypes.has(type as never));
    const hasClaim = Object.values(blockRoles).includes("claim") || slide.blocks.some((block) => block.type === "paragraph" && isClaimLikeText(block.text ?? block.sentences?.join(" ") ?? ""));
    const hasEvidenceRole = Object.values(blockRoles).some((role) => role === "evidence" || role === "metric");

    if (hasEvidenceObject && !hasClaim) {
      diagnostics.push({
        level: "warning",
        code: "CLAIMLESS_EVIDENCE_SLIDE",
        slideId: slide.id,
        message: `Slide "${slide.title ?? slide.id}" contains evidence objects without a claim-like explanatory block.`,
      });
    }

    const firstMeaningfulBlock = slide.blocks.find((block) => block.type !== "heading");
    if (firstMeaningfulBlock?.type === "table" && !hasClaim) {
      diagnostics.push({
        level: "warning",
        code: "ORPHAN_TABLE",
        slideId: slide.id,
        message: `Slide "${slide.title ?? slide.id}" starts with a table that is not attached to an explanatory paragraph.`,
      });
    }

    const imageBlocks = slide.blocks.filter((block) => block.type === "image");
    for (const image of imageBlocks) {
      const imageIndex = slide.blocks.indexOf(image);
      const nextBlock = slide.blocks[imageIndex + 1];
      const hasCaption = nextBlock?.type === "paragraph" && isCaptionLikeText(nextBlock.text ?? nextBlock.sentences?.join(" ") ?? "");
      if (!hasCaption && image.alt && image.alt.length > 0 && slide.blocks.length > 2) {
        diagnostics.push({
          level: "warning",
          code: "DETACHED_CAPTION",
          slideId: slide.id,
          message: `Image "${image.alt}" has no adjacent short caption paragraph.`,
        });
      }
    }

    const layoutSlide = layoutBySlideId.get(slide.id);
    if (layoutSlide && hasEvidenceRole) {
      const coveredBlockIds = new Set(layoutSlide.regions.flatMap((region) => region.blockIds.map((blockId) => blockId.split("#")[0])));
      const contentBlockIds = slide.blocks.filter((block) => block.type !== "heading").map((block) => block.id);
      const coverage = contentBlockIds.length ? contentBlockIds.filter((blockId) => coveredBlockIds.has(blockId)).length / contentBlockIds.length : 1;
      if (coverage < 0.2) {
        diagnostics.push({
          level: "warning",
          code: "LOW_OBJECT_COVERAGE",
          slideId: slide.id,
          message: `Slide "${slide.title ?? slide.id}" maps only ${(coverage * 100).toFixed(0)}% of source blocks to visible layout regions.`,
        });
      }
    }
  }

  diagnostics.push(...sectionStyleDriftDiagnostics(presentation, layout));
  diagnostics.push(...continuationTitleDiagnostics(presentation));

  return diagnostics;
}

function sectionStyleDriftDiagnostics(presentation: PresentationIR, layout: LayoutIR): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const layoutBySlideId = new Map(layout.slides.map((slide) => [slide.sourceSlideId, slide]));
  const groups = new Map<string, Array<{ slide: SlideIR; preset: string }>>();

  for (const slide of presentation.slides) {
    if (slide.role !== "content") continue;
    const sectionKey = sectionKeyForStyleDrift(slide);
    if (!sectionKey) continue;
    const layoutSlide = layoutBySlideId.get(slide.id);
    if (!layoutSlide) continue;
    const group = groups.get(sectionKey) ?? [];
    group.push({ slide, preset: layoutSlide.layout.preset });
    groups.set(sectionKey, group);
  }

  for (const [section, entries] of groups) {
    const distinctPresets = Array.from(new Set(entries.map((entry) => entry.preset)));
    if (entries.length < 3 || distinctPresets.length < 3) continue;
    diagnostics.push({
      level: "warning",
      code: "SECTION_STYLE_DRIFT",
      slideId: entries[0]?.slide.id,
      message: `Section "${section}" uses ${distinctPresets.length} layout motifs across ${entries.length} content slides (${distinctPresets.join(", ")}).`,
    });
  }

  return diagnostics;
}

function sectionKeyForStyleDrift(slide: SlideIR): string | undefined {
  if (slide.section) return slide.section;
  if (slide.headingPath.length > 2) return slide.headingPath.slice(0, -1).join(" / ");
  return undefined;
}

function continuationTitleDiagnostics(presentation: PresentationIR): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const groups = new Map<string, SlideIR[]>();

  for (const slide of presentation.slides) {
    if (slide.role !== "content") continue;
    const key = stableJson(slide.headingPath);
    const group = groups.get(key) ?? [];
    group.push(slide);
    groups.set(key, group);
  }

  for (const slides of groups.values()) {
    if (slides.length < 2) continue;
    for (const slide of slides.slice(1)) {
      if (/\(Cont\.\s+\d+\/\d+\)/.test(slide.title ?? "")) continue;
      diagnostics.push({
        level: "warning",
        code: "DENSE_CONTINUATION_WITHOUT_TITLE",
        slideId: slide.id,
        message: `Continuation slide "${slide.title ?? slide.id}" should include a continuation marker in its title.`,
      });
    }
  }

  return diagnostics;
}

function isClaimLikeText(text: string): boolean {
  return /\b(should|must|because|therefore|shows|means|indicates|suggests|result|impact|why|goal|purpose|objective)\b/i.test(text) ||
    /목적|이유|결과|의미|따라서|때문|필요|개선/.test(text);
}

function isCaptionLikeText(text: string): boolean {
  const normalized = text.trim();
  return normalized.length > 0 && normalized.length <= 120 && /^(figure|fig\.|image|source|caption|그림|출처)[:\s]/i.test(normalized);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
