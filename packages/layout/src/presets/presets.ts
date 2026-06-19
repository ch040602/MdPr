import type { LayoutPreset, LayoutSpec, Rect } from "../ir/types.js";

export function chooseItemLayout(itemCount: number): LayoutSpec {
  switch (itemCount) {
    case 1:
      return { preset: "single-card" };
    case 2:
      return { preset: "comparison", columns: 2, direction: "horizontal" };
    case 3:
      return { preset: "vertical-list", direction: "vertical" };
    case 4:
      return { preset: "grid", columns: 2, rows: 2 };
    case 5:
      return { preset: "pentagon", direction: "radial" };
    case 6:
      return { preset: "grid", columns: 3, rows: 2 };
    default:
      return { preset: "vertical-list", direction: "vertical" };
  }
}

export function isKnownPreset(preset: string): preset is LayoutPreset {
  return [
    "cover",
    "toc",
    "section-divider",
    "title-body",
    "text-icon-aside",
    "key-message",
    "comparison",
    "vertical-list",
    "grid",
    "pentagon",
    "timeline",
    "table-focus",
    "chart-table",
    "image-focus",
    "image-left",
    "image-right",
    "code-focus",
    "quote",
    "summary",
    "single-card",
    "pipeline",
  ].includes(preset);
}

export const titleRect: Rect = { x: 0.8, y: 0.5, w: 11.7, h: 0.8 };
export const bodyRect: Rect = { x: 1.0, y: 1.6, w: 11.2, h: 4.9 };
