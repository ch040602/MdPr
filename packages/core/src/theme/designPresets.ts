import type { Config, DesignPresetName } from "../ir/types.js";

export type DesignTokens = {
  name: DesignPresetName;
  backgroundColor: string;
  textColor: string;
  primaryColor: string;
  secondaryColor: string;
  surfaceFill: string;
  surfaceLine: string;
  mutedTextColor: string;
  ruleColor: string;
  titleRule: boolean;
  cornerAccent: boolean;
  cards: boolean;
};

export const DESIGN_PRESET_NAMES = [
  "plain",
  "clean",
  "executive",
  "editorial",
  "technical",
  "dark",
  "nord",
  "solarized",
  "dracula",
  "tableau",
  "gruvbox",
  "monokai",
  "material",
  "tokyo-night",
] as const satisfies readonly DesignPresetName[];

export const DESIGN_PRESETS: Record<DesignPresetName, DesignTokens> = {
  plain: {
    name: "plain",
    backgroundColor: "FFFFFF",
    textColor: "111827",
    primaryColor: "2563EB",
    secondaryColor: "93C5FD",
    surfaceFill: "FFFFFF",
    surfaceLine: "E5E7EB",
    mutedTextColor: "4B5563",
    ruleColor: "2563EB",
    titleRule: false,
    cornerAccent: false,
    cards: false,
  },
  clean: {
    name: "clean",
    backgroundColor: "F8FAFC",
    textColor: "111827",
    primaryColor: "2563EB",
    secondaryColor: "DBEAFE",
    surfaceFill: "FFFFFF",
    surfaceLine: "E2E8F0",
    mutedTextColor: "475569",
    ruleColor: "2563EB",
    titleRule: true,
    cornerAccent: false,
    cards: true,
  },
  executive: {
    name: "executive",
    backgroundColor: "F8FAFC",
    textColor: "0F172A",
    primaryColor: "1D4ED8",
    secondaryColor: "BFDBFE",
    surfaceFill: "FFFFFF",
    surfaceLine: "CBD5E1",
    mutedTextColor: "334155",
    ruleColor: "1D4ED8",
    titleRule: true,
    cornerAccent: true,
    cards: true,
  },
  editorial: {
    name: "editorial",
    backgroundColor: "F7F3EF",
    textColor: "1F2937",
    primaryColor: "B45309",
    secondaryColor: "FCD34D",
    surfaceFill: "FFFBF5",
    surfaceLine: "E7D8C9",
    mutedTextColor: "57534E",
    ruleColor: "B45309",
    titleRule: true,
    cornerAccent: true,
    cards: true,
  },
  technical: {
    name: "technical",
    backgroundColor: "F9FAFB",
    textColor: "111827",
    primaryColor: "047857",
    secondaryColor: "A7F3D0",
    surfaceFill: "FFFFFF",
    surfaceLine: "D1FAE5",
    mutedTextColor: "374151",
    ruleColor: "047857",
    titleRule: true,
    cornerAccent: false,
    cards: true,
  },
  dark: {
    name: "dark",
    backgroundColor: "111827",
    textColor: "F9FAFB",
    primaryColor: "38BDF8",
    secondaryColor: "164E63",
    surfaceFill: "1F2937",
    surfaceLine: "374151",
    mutedTextColor: "CBD5E1",
    ruleColor: "38BDF8",
    titleRule: true,
    cornerAccent: true,
    cards: true,
  },
  nord: {
    name: "nord",
    backgroundColor: "2E3440",
    textColor: "ECEFF4",
    primaryColor: "88C0D0",
    secondaryColor: "B48EAD",
    surfaceFill: "3B4252",
    surfaceLine: "4C566A",
    mutedTextColor: "D8DEE9",
    ruleColor: "81A1C1",
    titleRule: true,
    cornerAccent: true,
    cards: true,
  },
  solarized: {
    name: "solarized",
    backgroundColor: "FDF6E3",
    textColor: "073642",
    primaryColor: "268BD2",
    secondaryColor: "B58900",
    surfaceFill: "EEE8D5",
    surfaceLine: "93A1A1",
    mutedTextColor: "586E75",
    ruleColor: "2AA198",
    titleRule: true,
    cornerAccent: true,
    cards: true,
  },
  dracula: {
    name: "dracula",
    backgroundColor: "282A36",
    textColor: "F8F8F2",
    primaryColor: "BD93F9",
    secondaryColor: "FF79C6",
    surfaceFill: "44475A",
    surfaceLine: "6272A4",
    mutedTextColor: "D6D6D2",
    ruleColor: "8BE9FD",
    titleRule: true,
    cornerAccent: true,
    cards: true,
  },
  tableau: {
    name: "tableau",
    backgroundColor: "FFFFFF",
    textColor: "1F2937",
    primaryColor: "4E79A7",
    secondaryColor: "F28E2B",
    surfaceFill: "F7F7F7",
    surfaceLine: "D4D4D8",
    mutedTextColor: "4B5563",
    ruleColor: "59A14F",
    titleRule: true,
    cornerAccent: true,
    cards: true,
  },
  gruvbox: {
    name: "gruvbox",
    backgroundColor: "282828",
    textColor: "FBF1C7",
    primaryColor: "FABD2F",
    secondaryColor: "83A598",
    surfaceFill: "3C3836",
    surfaceLine: "665C54",
    mutedTextColor: "D5C4A1",
    ruleColor: "B8BB26",
    titleRule: true,
    cornerAccent: true,
    cards: true,
  },
  monokai: {
    name: "monokai",
    backgroundColor: "272822",
    textColor: "F8F8F2",
    primaryColor: "A6E22E",
    secondaryColor: "FD971F",
    surfaceFill: "3E3D32",
    surfaceLine: "75715E",
    mutedTextColor: "E6DB74",
    ruleColor: "66D9EF",
    titleRule: true,
    cornerAccent: true,
    cards: true,
  },
  material: {
    name: "material",
    backgroundColor: "FAFAFA",
    textColor: "263238",
    primaryColor: "2196F3",
    secondaryColor: "FF9800",
    surfaceFill: "FFFFFF",
    surfaceLine: "CFD8DC",
    mutedTextColor: "546E7A",
    ruleColor: "4CAF50",
    titleRule: true,
    cornerAccent: true,
    cards: true,
  },
  "tokyo-night": {
    name: "tokyo-night",
    backgroundColor: "1A1B26",
    textColor: "C0CAF5",
    primaryColor: "7AA2F7",
    secondaryColor: "BB9AF7",
    surfaceFill: "24283B",
    surfaceLine: "414868",
    mutedTextColor: "A9B1D6",
    ruleColor: "9ECE6A",
    titleRule: true,
    cornerAccent: true,
    cards: true,
  },
};

export function resolveDesignTokens(
  name: DesignPresetName | undefined,
  theme: Pick<Config["theme"], "backgroundColor" | "textColor" | "primaryColor">,
): DesignTokens {
  if (!name || name === "plain") {
    return {
      ...DESIGN_PRESETS.plain,
      backgroundColor: normalizeHex(theme.backgroundColor),
      textColor: normalizeHex(theme.textColor),
      primaryColor: normalizeHex(theme.primaryColor),
      ruleColor: normalizeHex(theme.primaryColor),
    };
  }
  return DESIGN_PRESETS[name] ?? DESIGN_PRESETS.clean;
}

export function isDesignPresetName(value: string): value is DesignPresetName {
  return (DESIGN_PRESET_NAMES as readonly string[]).includes(value);
}

function normalizeHex(color: string): string {
  const hex = color.replace(/^#/, "").toUpperCase();
  if (/^[0-9A-F]{3}$/.test(hex)) return hex.split("").map((char) => `${char}${char}`).join("");
  return hex;
}
