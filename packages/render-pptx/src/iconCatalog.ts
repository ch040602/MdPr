export type IconSourceName = "tabler-icons" | "simple-icons" | "svgrepo";

export type IconKind =
  | "article"
  | "flow"
  | "verified"
  | "spark"
  | "chart"
  | "table"
  | "image"
  | "palette"
  | "code"
  | "database"
  | "cloud"
  | "server"
  | "github";

type IconEntry = {
  source: IconSourceName;
  license: string;
  viewBox: string;
  svg: string;
  mode: "stroke" | "fill";
};

const TABLER_LICENSE = "MIT";
const SIMPLE_ICONS_LICENSE = "CC0-1.0 with brand guidelines";
const SVG_REPO_LICENSE = "open-license catalog pattern";

export const ICON_CATALOG: Record<IconKind, IconEntry> = {
  article: tabler(`<path d="M3 6a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2l0 -12" /><path d="M7 8h10" /><path d="M7 12h10" /><path d="M7 16h10" />`),
  flow: tabler(`<path d="M5 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M5 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M15 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M7 8l0 8" /><path d="M9 18h6a2 2 0 0 0 2 -2v-5" /><path d="M14 14l3 -3l3 3" />`),
  verified: tabler(`<path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M9 12l2 2l4 -4" />`),
  spark: tabler(`<path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6" />`),
  chart: tabler(`<path d="M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -6" /><path d="M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -10" /><path d="M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -14" /><path d="M4 20h14" />`),
  table: tabler(`<path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14" /><path d="M3 10h18" /><path d="M10 3v18" />`),
  image: tabler(`<path d="M15 8h.01" /><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12" /><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" /><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" />`),
  palette: tabler(`<path d="M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25" /><path d="M7.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M11.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M15.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />`),
  code: tabler(`<path d="M7 8l-4 4l4 4" /><path d="M17 8l4 4l-4 4" /><path d="M14 4l-4 16" />`),
  database: svgrepo(`<path d="M12 3c4.42 0 8 1.57 8 3.5v11c0 1.93-3.58 3.5-8 3.5s-8-1.57-8-3.5v-11c0-1.93 3.58-3.5 8-3.5Zm0 2c-3.63 0-6 1.08-6 1.5s2.37 1.5 6 1.5s6-1.08 6-1.5s-2.37-1.5-6-1.5Zm6 4.18c-1.46.74-3.58 1.32-6 1.32s-4.54-.58-6-1.32v2.32c0 .42 2.37 1.5 6 1.5s6-1.08 6-1.5V9.18Zm0 5c-1.46.74-3.58 1.32-6 1.32s-4.54-.58-6-1.32v3.32c0 .42 2.37 1.5 6 1.5s6-1.08 6-1.5v-3.32Z"/>`),
  cloud: svgrepo(`<path d="M8.5 19a5.5 5.5 0 0 1-.7-10.96A6.5 6.5 0 0 1 20.26 10.8A4.25 4.25 0 0 1 19.75 19H8.5Zm0-2h11.25a2.25 2.25 0 0 0 .06-4.5h-1.12l-.2-1.1A4.5 4.5 0 0 0 9.75 9.86l-.28 1.01-1.05.01A3.5 3.5 0 0 0 8.5 17Z"/>`),
  server: svgrepo(`<path d="M5 3h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 9h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Zm2-5.5a1 1 0 1 0 0 2a1 1 0 0 0 0-2Zm0 9a1 1 0 1 0 0 2a1 1 0 0 0 0-2Z"/>`),
  github: simpleIcon(`<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>`),
};

export function iconKindForIndex(index: number): IconKind {
  const kinds: IconKind[] = ["article", "flow", "verified", "spark", "chart", "table", "image", "palette", "code", "database", "cloud", "server"];
  return kinds[Math.abs(index) % kinds.length]!;
}

export function iconKindForText(value: string): IconKind {
  const marker = value.toLowerCase();
  if (/github|repo|repository/.test(marker)) return "github";
  if (/pipeline|flow|process|graph|단계/.test(marker)) return "flow";
  if (/valid|qa|risk|guard|검증|check/.test(marker)) return "verified";
  if (/database|storage|warehouse/.test(marker)) return "database";
  if (/cloud|deploy|service/.test(marker)) return "cloud";
  if (/server|runtime|engine/.test(marker)) return "server";
  if (/chart|metric|graph|score|data/.test(marker)) return "chart";
  if (/table|grid|matrix/.test(marker)) return "table";
  if (/image|visual|asset|photo/.test(marker)) return "image";
  if (/color|theme|palette|design/.test(marker)) return "palette";
  if (/code|parser|markdown|pandoc/.test(marker)) return "code";
  if (/hint|idea|skill|reason/.test(marker)) return "spark";
  return "article";
}

export function iconSource(kind: IconKind): Pick<IconEntry, "source" | "license"> {
  const entry = ICON_CATALOG[kind];
  return { source: entry.source, license: entry.license };
}

export function iconSvgDataUri(kind: IconKind, color: string): string {
  const entry = ICON_CATALOG[kind];
  const normalizedColor = normalizeHexColor(color);
  const svg = entry.mode === "stroke"
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${entry.viewBox}" fill="none" stroke="${normalizedColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${entry.svg}</svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${entry.viewBox}" fill="${normalizedColor}">${entry.svg}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
}

function tabler(svg: string): IconEntry {
  return { source: "tabler-icons", license: TABLER_LICENSE, viewBox: "0 0 24 24", mode: "stroke", svg };
}

function simpleIcon(svg: string): IconEntry {
  return { source: "simple-icons", license: SIMPLE_ICONS_LICENSE, viewBox: "0 0 24 24", mode: "fill", svg };
}

function svgrepo(svg: string): IconEntry {
  return { source: "svgrepo", license: SVG_REPO_LICENSE, viewBox: "0 0 24 24", mode: "fill", svg };
}

function normalizeHexColor(color: string): string {
  return `#${color.replace(/^#/, "")}`;
}
