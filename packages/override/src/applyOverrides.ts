import type { PresentationIR } from "@mdpresent/core";
import type { LayoutIR, LayoutSpec, Rect } from "@mdpresent/layout";
import type { OverrideManifest, OverrideOperation } from "./types.js";
import { resolveTarget } from "./resolveTarget.js";

export function applyOverrides(layout: LayoutIR, manifest: OverrideManifest, presentation?: PresentationIR): LayoutIR {
  const next: LayoutIR = structuredClone(layout);
  const operations = normalizeOperations(manifest);

  for (const operation of operations) {
    const targets = resolveTarget(next, operation.target, presentation);
    if (!targets.length) {
      next.diagnostics.push({
        level: "warning",
        code: "OVERRIDE_TARGET_NOT_FOUND",
        message: `Override target not found: ${JSON.stringify(operation.target)}`,
      });
      continue;
    }

    for (const slide of targets) {
      switch (operation.op) {
        case "setLayout":
          slide.layout = { ...slide.layout, ...(operation.value as Partial<LayoutSpec>) };
          break;
        case "setTypography":
          for (const region of slide.regions) {
            region.typography = { ...region.typography, ...normalizeTypography(operation.value) } as typeof region.typography;
          }
          break;
        case "setBackground":
          slide.background = { ...slide.background, ...(operation.value as Record<string, unknown>) };
          break;
        case "setOverflow":
          slide.overflowPolicy = { ...slide.overflowPolicy, ...(operation.value as Record<string, unknown>) } as typeof slide.overflowPolicy;
          break;
        case "setSplit":
          next.diagnostics.push({
            level: "warning",
            code: "OVERRIDE_REQUIRES_PRE_LAYOUT_PHASE",
            message: "setSplit must be applied before presentation planning and layout generation.",
            slideId: slide.sourceSlideId,
          });
          break;
        case "setSlot": {
          const slot = operation.target.slot;
          const region = slide.regions.find((r) => r.id === slot);
          if (region) {
            Object.assign(region, operation.value as Rect);
          } else {
            next.diagnostics.push({
              level: "warning",
              code: "OVERRIDE_SLOT_NOT_FOUND",
              message: `Slot not found: ${slot}`,
              slideId: slide.sourceSlideId,
            });
          }
          break;
        }
        case "hideBlock":
          applyHideBlock(slide, operation, next.diagnostics);
          break;
        case "moveBlock":
          applyMoveBlock(slide, operation, next.diagnostics, false);
          break;
        case "pinBlock":
          applyMoveBlock(slide, operation, next.diagnostics, true);
          break;
        default:
          next.diagnostics.push({
            level: "warning",
            code: "OVERRIDE_OP_NOT_IMPLEMENTED",
            message: `Operation not implemented yet: ${operation.op}`,
            slideId: slide.sourceSlideId,
          });
      }
    }
  }

  return next;
}

function applyHideBlock(slide: LayoutIR["slides"][number], operation: OverrideOperation, diagnostics: LayoutIR["diagnostics"]): void {
  const blockId = operation.target.blockId;
  if (!blockId) {
    pushBlockDiagnostic(slide, diagnostics, "OVERRIDE_BLOCK_NOT_FOUND", "hideBlock requires target.blockId");
    return;
  }

  const found = slide.regions.some((region) => region.blockIds.includes(blockId));
  if (!found) {
    pushBlockDiagnostic(slide, diagnostics, "OVERRIDE_BLOCK_NOT_FOUND", `Block not found: ${blockId}`);
    return;
  }

  for (const region of slide.regions) {
    region.blockIds = region.blockIds.filter((id) => id !== blockId);
  }
}

function applyMoveBlock(slide: LayoutIR["slides"][number], operation: OverrideOperation, diagnostics: LayoutIR["diagnostics"], pin: boolean): void {
  const blockId = operation.target.blockId;
  const slot = typeof operation.value.slot === "string" ? operation.value.slot : operation.target.slot;
  if (!blockId) {
    pushBlockDiagnostic(slide, diagnostics, "OVERRIDE_BLOCK_NOT_FOUND", `${operation.op} requires target.blockId`);
    return;
  }
  if (!slot) {
    pushBlockDiagnostic(slide, diagnostics, "OVERRIDE_SLOT_NOT_FOUND", `${operation.op} requires value.slot or target.slot`);
    return;
  }

  const destination = slide.regions.find((region) => region.id === slot);
  if (!destination) {
    pushBlockDiagnostic(slide, diagnostics, "OVERRIDE_SLOT_NOT_FOUND", `Slot not found: ${slot}`);
    return;
  }

  const found = slide.regions.some((region) => region.blockIds.includes(blockId));
  if (!found) {
    pushBlockDiagnostic(slide, diagnostics, "OVERRIDE_BLOCK_NOT_FOUND", `Block not found: ${blockId}`);
    return;
  }

  for (const region of slide.regions) {
    region.blockIds = region.blockIds.filter((id) => id !== blockId);
  }

  destination.blockIds = pin ? [blockId, ...destination.blockIds] : [...destination.blockIds, blockId];
  if (pin) {
    destination.zIndex = Math.max(destination.zIndex, ...slide.regions.map((region) => region.zIndex)) + 1;
  }
}

function pushBlockDiagnostic(slide: LayoutIR["slides"][number], diagnostics: LayoutIR["diagnostics"], code: string, message: string): void {
  diagnostics.push({
    level: "warning",
    code,
    message,
    slideId: slide.sourceSlideId,
  });
}

function normalizeTypography(value: Record<string, unknown>): Record<string, unknown> {
  const next = { ...value };
  if (typeof next.bodyFontSize === "number" && next.fontSize === undefined) {
    next.fontSize = next.bodyFontSize;
  }
  delete next.bodyFontSize;
  delete next.titleFontSize;
  delete next.captionFontSize;
  return next;
}

function normalizeOperations(manifest: OverrideManifest): OverrideOperation[] {
  if (manifest.operations) return manifest.operations;
  return (manifest.overrides ?? []).flatMap((entry) => {
    const operations: OverrideOperation[] = [];
    if (entry.patch.layout) operations.push({ op: "setLayout", target: entry.target, value: entry.patch.layout, reason: entry.reason });
    if (entry.patch.typography) operations.push({ op: "setTypography", target: entry.target, value: entry.patch.typography, reason: entry.reason });
    if (entry.patch.background) operations.push({ op: "setBackground", target: entry.target, value: entry.patch.background, reason: entry.reason });
    if (entry.patch.split) operations.push({ op: "setSplit", target: entry.target, value: entry.patch.split, reason: entry.reason });
    if (entry.patch.overflow) operations.push({ op: "setOverflow", target: entry.target, value: entry.patch.overflow, reason: entry.reason });
    if (entry.patch.slots) {
      for (const [slot, value] of Object.entries(entry.patch.slots)) {
        operations.push({ op: "setSlot", target: { ...entry.target, slot }, value, reason: entry.reason });
      }
    }
    return operations;
  });
}
