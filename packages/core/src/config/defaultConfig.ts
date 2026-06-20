import type { Config } from "../ir/types.js";

export const defaultConfig: Config = {
  version: "1.0",
  deck: {
    titleFrom: "first-h1",
    ratio: "16:9",
    language: "ko",
    defaultOutput: ["pptx", "pdf", "html"],
  },
  split: {
    cover: "first-h1",
    section: "h1",
    slide: "h2",
    subsection: "h3",
    autosplit: {
      enabled: true,
      maxDensity: 9,
      fallbackHeading: "h3",
      allowContinuation: true,
    },
  },
  toc: {
    enabled: true,
    position: "after-cover",
    depth: 2,
    includePageNumbers: true,
  },
  layout: {
    engine: "rule",
    basePack: "marp",
    defaultPreset: "title-body",
    maxItemsBeforeGrid: 4,
    safeArea: { enabled: true },
    overflow: {
      defaultAction: "split",
      allowedActions: ["reflow", "shrink", "split", "warn", "fail"],
      minFontSize: 18,
      maxShrinkSteps: 2,
    },
  },
  typography: {
    fontFamily: "Pretendard",
    titleFontSize: 34,
    bodyFontSize: 22,
    captionFontSize: 14,
    minFontSize: 18,
    lineHeight: 1.2,
  },
  theme: {
    designPreset: "clean",
    colorCombination: "preset",
    colorSeed: "#2563EB",
    backgroundColor: "#FFFFFF",
    textColor: "#111827",
    primaryColor: "#2563EB",
  },
  pptx: {
    template: null,
    designPreset: "clean",
    useTemplateBackground: true,
    lockBackgroundToMaster: true,
    editableObjects: true,
  },
  pdf: { printBackground: true },
  html: { navigation: true, responsive: false },
};
