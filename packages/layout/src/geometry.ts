import type { LayoutSlide, LayoutSpec } from "./ir/types.js";

export type LayoutGeometrySignature =
  | "card-grid-2x2"
  | "card-grid-3x2"
  | "card-row-3"
  | "card-row-4"
  | "vertical-stack"
  | "split-columns"
  | "single-panel"
  | "radial-five"
  | `specialized-${string}`
  | `freeform-${number}`;

export function geometrySignatureForSpec(layout: LayoutSpec): LayoutGeometrySignature {
  if (layout.columns === 3 && layout.rows === 1) return "card-row-3";
  if (layout.columns === 4 && layout.rows === 1) return "card-row-4";
  if (layout.preset === "grid" && layout.columns === 2 && layout.rows === 2) return "card-grid-2x2";
  if (layout.preset === "grid" && layout.columns === 3 && layout.rows === 2) return "card-grid-3x2";
  if (layout.preset === "vertical-list") return "vertical-stack";
  if (layout.preset === "comparison" || layout.preset === "text-icon-aside") return "split-columns";
  if (layout.preset === "pentagon") return "radial-five";
  if (["title-body", "single-card"].includes(layout.preset)) return "single-panel";
  return `specialized-${layout.preset}`;
}

export function visibleGeometrySignature(slide: LayoutSlide): LayoutGeometrySignature {
  const regions = slide.regions.filter((region) =>
    !["title", "icon", "footer", "pageNumber"].includes(region.role) && region.blockIds.length > 0,
  );
  if (!regions.length) return geometrySignatureForSpec(slide.layout);

  const specializedRoles = [...new Set(
    regions
      .filter((region) => ["table", "chart", "image", "code", "diagram"].includes(region.role))
      .map((region) => region.role),
  )].sort();
  if (specializedRoles.length) return `specialized-${specializedRoles.join("+")}`;

  const xCount = clusteredCoordinateCount(regions.map((region) => region.x));
  const yCount = clusteredCoordinateCount(regions.map((region) => region.y));
  if (regions.length === 3 && xCount === 3 && yCount === 1) return "card-row-3";
  if (regions.length === 4 && xCount === 4 && yCount === 1) return "card-row-4";
  if (regions.length === 4 && xCount === 2 && yCount === 2) return "card-grid-2x2";
  if (regions.length === 6 && xCount === 3 && yCount === 2) return "card-grid-3x2";
  if (regions.length === 2 && xCount === 2 && yCount === 1) return "split-columns";
  if (regions.length >= 2 && xCount === 1 && yCount === regions.length) return "vertical-stack";
  if (regions.length === 1) return "single-panel";
  if (regions.length === 5 && xCount >= 3 && yCount >= 3) return "radial-five";
  return `freeform-${regions.length}`;
}

function clusteredCoordinateCount(values: number[], tolerance = 0.35): number {
  const clusters: number[] = [];
  for (const value of [...values].sort((left, right) => left - right)) {
    if (!clusters.some((cluster) => Math.abs(cluster - value) <= tolerance)) clusters.push(value);
  }
  return clusters.length;
}
