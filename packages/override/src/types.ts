import type { LayoutSpec, Rect, TypographySpec, BackgroundSpec, OverflowPolicy } from "@mdpresent/layout";

export type OverrideTarget = {
  slideId?: string;
  slideIndex?: number;
  title?: string;
  headingPath?: string[];
  intent?: string;
  slot?: string;
  blockId?: string;
};

export type OverrideOperation = {
  op: "setLayout" | "setTypography" | "setBackground" | "setOverflow" | "setSplit" | "setSlot" | "moveBlock" | "hideBlock" | "pinBlock";
  target: OverrideTarget;
  value: Record<string, unknown>;
  reason?: string;
};

export type PatchOverride = {
  id: string;
  target: OverrideTarget;
  patch: {
    layout?: Partial<LayoutSpec>;
    typography?: Partial<TypographySpec>;
    background?: Partial<BackgroundSpec>;
    overflow?: Partial<OverflowPolicy>;
    split?: Record<string, unknown>;
    slots?: Record<string, Rect>;
  };
  reason?: string;
};

export type OverrideManifest = {
  version: "1.0";
  operations?: OverrideOperation[];
  overrides?: PatchOverride[];
};
