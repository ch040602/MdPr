import type { ColorCombinationName, Config, DesignPresetName } from "../ir/types.js";

export type ThemeColorTokens = {
  dark1: string;
  light1: string;
  dark2: string;
  light2: string;
  accent1: string;
  accent2: string;
  accent3: string;
  accent4: string;
  accent5: string;
  accent6: string;
  hyperlink: string;
  followedHyperlink: string;
};

export type PaletteSeedTokens = {
  sourceModel: "adobe-color-wheel";
  harmony: ColorCombinationName;
  base: string;
  sequence: string[];
  contrast: string[];
  chart: string[];
  usage: {
    sequence: "brightness-variation";
    contrast: "hue-opposition";
  };
};

type BaseDesignTokens = {
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

export type DesignTokens = BaseDesignTokens & {
  colorCombination: ColorCombinationName;
  chartColors: string[];
  themeColors: ThemeColorTokens;
  paletteSeed: PaletteSeedTokens;
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

export const DESIGN_PRESETS: Record<DesignPresetName, BaseDesignTokens> = {
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
  theme: Pick<Config["theme"], "backgroundColor" | "textColor" | "primaryColor" | "colorCombination">,
): DesignTokens {
  const colorCombination = theme.colorCombination ?? "preset";
  const primaryColor = normalizeHex(theme.primaryColor);
  if (!name || name === "plain") {
    return finalizeDesignTokens({
      ...DESIGN_PRESETS.plain,
      backgroundColor: normalizeHex(theme.backgroundColor),
      textColor: normalizeHex(theme.textColor),
      primaryColor,
      ruleColor: primaryColor,
    }, colorCombination);
  }
  const preset = { ...(DESIGN_PRESETS[name] ?? DESIGN_PRESETS.clean) };
  if (colorCombination !== "preset") {
    preset.primaryColor = primaryColor;
    preset.ruleColor = primaryColor;
  }
  return finalizeDesignTokens(preset, colorCombination);
}

export function isDesignPresetName(value: string): value is DesignPresetName {
  return (DESIGN_PRESET_NAMES as readonly string[]).includes(value);
}

function normalizeHex(color: string): string {
  const hex = color.replace(/^#/, "").toUpperCase();
  if (/^[0-9A-F]{3}$/.test(hex)) return hex.split("").map((char) => `${char}${char}`).join("");
  return hex;
}

function finalizeDesignTokens(tokens: BaseDesignTokens, colorCombination: ColorCombinationName): DesignTokens {
  const combined = colorCombination === "preset" ? tokens : applyColorCombination(tokens, colorCombination);
  const chartColors = chartColorsFor(combined, colorCombination);
  const themeColors = themeColorsFor(combined, chartColors);
  return {
    ...combined,
    colorCombination,
    chartColors,
    themeColors,
    paletteSeed: paletteSeedFor(combined, chartColors, themeColors, colorCombination),
  };
}

function applyColorCombination(tokens: BaseDesignTokens, colorCombination: Exclude<ColorCombinationName, "preset">): BaseDesignTokens {
  const primary = normalizeHex(tokens.primaryColor);
  const accents = harmonyPalette(primary, colorCombination);
  return {
    ...tokens,
    primaryColor: primary,
    secondaryColor: accents[0] ?? tokens.secondaryColor,
    ruleColor: accents[1] ?? primary,
    surfaceLine: mixHex(tokens.surfaceLine, primary, 0.08),
    surfaceFill: mixHex(tokens.surfaceFill, tokens.backgroundColor, 0.55),
  };
}

function chartColorsFor(tokens: BaseDesignTokens, colorCombination: ColorCombinationName): string[] {
  if (colorCombination === "preset") {
    return [
      tokens.primaryColor,
      tokens.secondaryColor,
      tokens.ruleColor,
      tokens.mutedTextColor,
      tokens.surfaceLine,
      tokens.textColor,
    ].map(normalizeHex);
  }

  const accents = harmonyPalette(tokens.primaryColor, colorCombination);
  return [
    tokens.primaryColor,
    ...accents,
    tonalVariant(tokens.primaryColor, -0.18, 0.06),
    tonalVariant(accents[0] ?? tokens.secondaryColor, -0.2, 0.04),
  ].slice(0, 6).map(normalizeHex);
}

function themeColorsFor(tokens: BaseDesignTokens, chartColors: string[]): ThemeColorTokens {
  const accent5 = chartColors[4] ?? tonalVariant(tokens.primaryColor, 0.22, -0.04);
  const accent6 = ensureMinimumContrast(chartColors[5] ?? tonalVariant(tokens.primaryColor, -0.24, 0.05), tokens.backgroundColor, 3);
  return {
    dark1: normalizeHex(tokens.textColor),
    light1: normalizeHex(tokens.backgroundColor),
    dark2: normalizeHex(tokens.mutedTextColor),
    light2: normalizeHex(tokens.surfaceFill),
    accent1: normalizeHex(tokens.primaryColor),
    accent2: normalizeHex(tokens.secondaryColor),
    accent3: normalizeHex(chartColors[2] ?? tokens.ruleColor),
    accent4: normalizeHex(chartColors[3] ?? tokens.mutedTextColor),
    accent5: normalizeHex(accent5),
    accent6: normalizeHex(accent6),
    hyperlink: normalizeHex(tokens.primaryColor),
    followedHyperlink: normalizeHex(tokens.secondaryColor),
  };
}

function paletteSeedFor(
  tokens: BaseDesignTokens,
  chartColors: string[],
  themeColors: ThemeColorTokens,
  colorCombination: ColorCombinationName,
): PaletteSeedTokens {
  const base = normalizeHex(tokens.primaryColor);
  const sequence = [
    tonalVariant(base, 0.28, -0.1),
    tonalVariant(base, 0.12, -0.04),
    base,
    tonalVariant(base, -0.16, 0.05),
  ].map(normalizeHex);
  const contrast = [
    themeColors.accent3,
    themeColors.accent4,
    themeColors.accent5,
    themeColors.accent6,
  ].map(normalizeHex);

  return {
    sourceModel: "adobe-color-wheel",
    harmony: colorCombination,
    base,
    sequence,
    contrast,
    chart: chartColors.map(normalizeHex),
    usage: {
      sequence: "brightness-variation",
      contrast: "hue-opposition",
    },
  };
}

function harmonyPalette(primaryColor: string, colorCombination: Exclude<ColorCombinationName, "preset">): string[] {
  const primary = normalizeHex(primaryColor);
  const accent = (degrees: number, lightnessDelta = 0, saturationDelta = 0) => tunedHarmonyColor(primary, degrees, lightnessDelta, saturationDelta);
  switch (colorCombination) {
    case "monochromatic":
      return [
        tonalVariant(primary, 0.18, -0.06),
        tonalVariant(primary, -0.16, 0.05),
        tonalVariant(primary, 0.34, -0.12),
        tonalVariant(primary, -0.28, 0.08),
      ];
    case "analogous":
      return [accent(-30, 0.01, 0.04), accent(30, -0.01, 0.04), accent(-55, 0.04, -0.02), accent(55, -0.04, -0.02)];
    case "split-complementary":
      return [accent(150, -0.03, 0.05), accent(210, -0.02, 0.05), accent(-30, 0.04, -0.02), accent(30, -0.04, -0.02)];
    case "triadic":
      return [accent(120, -0.02, 0.04), accent(240, -0.02, 0.04), accent(120, 0.18, -0.08), accent(240, 0.18, -0.08)];
    case "complementary":
      return [accent(180, -0.03, 0.05), accent(-24, 0.02, -0.02), accent(24, -0.02, -0.02), accent(180, 0.18, -0.08)];
  }
}

function tunedHarmonyColor(hex: string, degrees: number, lightnessDelta: number, saturationDelta: number): string {
  const { h, s, l } = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb({
    h: positiveModulo(h + degrees, 360),
    s: clampUnit(Math.max(0.56, Math.min(0.9, s + saturationDelta))),
    l: clampUnit(Math.max(0.34, Math.min(0.62, l + lightnessDelta))),
  }));
}

function tonalVariant(hex: string, lightnessDelta: number, saturationDelta: number): string {
  const { h, s, l } = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb({
    h,
    s: clampUnit(Math.max(0.34, Math.min(0.92, s + saturationDelta))),
    l: clampUnit(Math.max(0.22, Math.min(0.82, l + lightnessDelta))),
  }));
}

function ensureMinimumContrast(hex: string, background: string, minContrast: number): string {
  let candidate = normalizeHex(hex);
  const backgroundRgb = hexToRgb(background);
  const backgroundIsDark = relativeLuminance(backgroundRgb) < 0.5;
  for (let step = 0; step < 10 && contrastRatio(candidate, background) < minContrast; step++) {
    candidate = tonalVariant(candidate, backgroundIsDark ? 0.08 : -0.08, 0.02);
  }
  return candidate;
}

function mixHex(left: string, right: string, rightWeight: number): string {
  const a = hexToRgb(left);
  const b = hexToRgb(right);
  return rgbToHex({
    r: Math.round(a.r * (1 - rightWeight) + b.r * rightWeight),
    g: Math.round(a.g * (1 - rightWeight) + b.g * rightWeight),
    b: Math.round(a.b * (1 - rightWeight) + b.b * rightWeight),
  });
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHex(hex);
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  return [rgb.r, rgb.g, rgb.b].map((value) => clamp(value, 0, 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function rgbToHsl(rgb: { r: number; g: number; b: number }): { h: number; s: number; l: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };

  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const h = max === r
    ? ((g - b) / delta + (g < b ? 6 : 0)) * 60
    : max === g
      ? ((b - r) / delta + 2) * 60
      : ((r - g) / delta + 4) * 60;
  return { h, s, l };
}

function hslToRgb(hsl: { h: number; s: number; l: number }): { r: number; g: number; b: number } {
  if (hsl.s === 0) {
    const value = Math.round(hsl.l * 255);
    return { r: value, g: value, b: value };
  }

  const q = hsl.l < 0.5 ? hsl.l * (1 + hsl.s) : hsl.l + hsl.s - hsl.l * hsl.s;
  const p = 2 * hsl.l - q;
  return {
    r: Math.round(hueToRgb(p, q, hsl.h / 360 + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, hsl.h / 360) * 255),
    b: Math.round(hueToRgb(p, q, hsl.h / 360 - 1 / 3) * 255),
  };
}

function hueToRgb(p: number, q: number, t: number): number {
  let value = t;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function contrastRatio(left: string, right: string): number {
  const leftLum = relativeLuminance(hexToRgb(left));
  const rightLum = relativeLuminance(hexToRgb(right));
  const light = Math.max(leftLum, rightLum);
  const dark = Math.min(leftLum, rightLum);
  return (light + 0.05) / (dark + 0.05);
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
