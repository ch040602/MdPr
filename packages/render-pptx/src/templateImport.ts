import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { tmpdir } from "node:os";
import JSZip from "jszip";

export type TemplateImageAsset = {
  path: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type TemplateShapeAsset = {
  geometry: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fillColor?: string;
  lineColor?: string;
  lineTransparency?: number;
  layoutPreset?: string;
};

export type TemplatePlaceholderRole = "title" | "subtitle" | "body" | "image" | "table" | "chart" | "footer" | "pageNumber";

export type TemplatePlaceholderAsset = {
  role: TemplatePlaceholderRole;
  x: number;
  y: number;
  w: number;
  h: number;
  sourcePath: string;
  layoutPreset?: string;
};

export type TemplateTheme = {
  backgroundColor?: string;
  textColor?: string;
  primaryColor?: string;
  secondaryColor?: string;
  surfaceFill?: string;
  surfaceLine?: string;
  ruleColor?: string;
};

export type TemplateDesignAssets = {
  images: TemplateImageAsset[];
  shapes: TemplateShapeAsset[];
  placeholders: TemplatePlaceholderAsset[];
  theme: TemplateTheme;
};

export type TemplatePackageIntegrity = {
  masterPartPaths: string[];
  layoutPartPaths: string[];
  themePartPaths: string[];
  masterRelationshipPaths: string[];
  layoutRelationshipPaths: string[];
  preservationPolicy: "preserve-template-masters-and-themes-by-default";
};

export type PreservedTemplatePackageParts = TemplatePackageIntegrity & {
  copiedPartPaths: string[];
};

const EMU_PER_INCH = 914400;

export async function extractTemplateDesignAssets(templatePath?: string | null): Promise<TemplateDesignAssets> {
  if (!templatePath) return { images: [], shapes: [], placeholders: [], theme: {} };

  const zip = await JSZip.loadAsync(readFileSync(templatePath));
  const tempDir = mkdtempSync(join(tmpdir(), "mdpresent-template-assets-"));
  const images: TemplateImageAsset[] = [];
  const shapes: TemplateShapeAsset[] = [];
  const placeholders: TemplatePlaceholderAsset[] = [];
  const theme = await extractTemplateTheme(zip);

  const candidateXmlPaths = Object.keys(zip.files)
    .filter((path) => /ppt\/(slideMasters|slideLayouts|slides)\/[^/]+\.xml$/.test(path))
    .sort((left, right) => scoreTemplatePart(left) - scoreTemplatePart(right));

  for (const xmlPath of candidateXmlPaths) {
    const xmlFile = zip.file(xmlPath);
    if (!xmlFile) continue;

    const xml = await xmlFile.async("string");
    const relsPath = relationshipPathFor(xmlPath);
    const relsFile = zip.file(relsPath);
    const rels = relsFile ? parseRelationships(await relsFile.async("string"), xmlPath) : new Map<string, string>();
    const layoutPreset = inferLayoutPreset(xml, xmlPath);

    if (isMasterOrLayoutPart(xmlPath)) {
      for (const picture of parsePictures(xml)) {
        const target = rels.get(picture.relationshipId);
        if (!target) continue;

        const imageFile = zip.file(target);
        if (!imageFile) continue;

        const imagePath = join(tempDir, `${images.length}${extname(target) || ".png"}`);
        writeFileSync(imagePath, await imageFile.async("nodebuffer"));
        images.push({
          path: imagePath,
          x: picture.x / EMU_PER_INCH,
          y: picture.y / EMU_PER_INCH,
          w: picture.w / EMU_PER_INCH,
          h: picture.h / EMU_PER_INCH,
        });
      }
    }

    shapes.push(...parseDecorativeShapes(xml, theme, layoutPreset));
    placeholders.push(...parsePlaceholderShapes(xml, xmlPath, layoutPreset));
  }

  return {
    images: dedupeAssets(images),
    shapes: dedupeShapes(shapes).slice(0, 12),
    placeholders: dedupePlaceholders(placeholders).sort(comparePlaceholders),
    theme,
  };
}

export async function extractTemplateImageAssets(templatePath?: string | null): Promise<TemplateImageAsset[]> {
  return (await extractTemplateDesignAssets(templatePath)).images;
}

export async function inspectTemplatePackageIntegrity(templatePath?: string | null): Promise<TemplatePackageIntegrity> {
  if (!templatePath) {
    return {
      masterPartPaths: [],
      layoutPartPaths: [],
      themePartPaths: [],
      masterRelationshipPaths: [],
      layoutRelationshipPaths: [],
      preservationPolicy: "preserve-template-masters-and-themes-by-default",
    };
  }
  const zip = await JSZip.loadAsync(readFileSync(templatePath));
  const paths = Object.keys(zip.files);
  return {
    masterPartPaths: paths.filter((path) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(path)).sort(),
    layoutPartPaths: paths.filter((path) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(path)).sort(),
    themePartPaths: paths.filter((path) => /^ppt\/theme\/theme\d+\.xml$/.test(path)).sort(),
    masterRelationshipPaths: paths.filter((path) => /^ppt\/slideMasters\/_rels\/slideMaster\d+\.xml\.rels$/.test(path)).sort(),
    layoutRelationshipPaths: paths.filter((path) => /^ppt\/slideLayouts\/_rels\/slideLayout\d+\.xml\.rels$/.test(path)).sort(),
    preservationPolicy: "preserve-template-masters-and-themes-by-default",
  };
}

export async function preserveTemplatePackageParts(outputPath: string, templatePath?: string | null): Promise<PreservedTemplatePackageParts> {
  const integrity = await inspectTemplatePackageIntegrity(templatePath);
  if (!templatePath) return { ...integrity, copiedPartPaths: [] };

  const outputZip = await JSZip.loadAsync(readFileSync(outputPath));
  const templateZip = await JSZip.loadAsync(readFileSync(templatePath));
  const copyPatterns = [
    /^ppt\/theme\/theme\d+\.xml$/,
    /^ppt\/slideMasters\/slideMaster\d+\.xml$/,
    /^ppt\/slideMasters\/_rels\/slideMaster\d+\.xml\.rels$/,
    /^ppt\/slideLayouts\/slideLayout\d+\.xml$/,
    /^ppt\/slideLayouts\/_rels\/slideLayout\d+\.xml\.rels$/,
  ];
  const masterAndLayoutMediaPaths = await referencedMasterAndLayoutMediaPaths(templateZip);
  const copiedPartPaths: string[] = [];

  for (const path of Object.keys(templateZip.files).sort()) {
    if (!copyPatterns.some((pattern) => pattern.test(path)) && !masterAndLayoutMediaPaths.has(path)) continue;
    const file = templateZip.file(path);
    if (!file) continue;
    outputZip.file(path, await file.async("nodebuffer"));
    copiedPartPaths.push(path);
  }

  writeFileSync(outputPath, await outputZip.generateAsync({ type: "nodebuffer" }));
  return { ...integrity, copiedPartPaths };
}

function isMasterOrLayoutPart(path: string): boolean {
  return /ppt\/(slideMasters|slideLayouts)\//.test(path);
}

async function referencedMasterAndLayoutMediaPaths(zip: JSZip): Promise<Set<string>> {
  const mediaPaths = new Set<string>();
  const relationshipPaths = Object.keys(zip.files).filter((path) =>
    /^ppt\/(slideMasters|slideLayouts)\/_rels\/[^/]+\.xml\.rels$/.test(path),
  );

  for (const relationshipPath of relationshipPaths) {
    const relationshipFile = zip.file(relationshipPath);
    if (!relationshipFile) continue;
    const sourcePartPath = relationshipPath
      .replace("/_rels/", "/")
      .replace(/\.rels$/, "");
    const relationships = parseRelationships(await relationshipFile.async("string"), sourcePartPath);
    for (const target of relationships.values()) mediaPaths.add(target);
  }

  return mediaPaths;
}

function scoreTemplatePart(path: string): number {
  if (path.includes("/slideMasters/")) return 0;
  if (path.includes("/slideLayouts/")) return 1;
  return 2;
}

function relationshipPathFor(xmlPath: string): string {
  const slash = xmlPath.lastIndexOf("/");
  return `${xmlPath.slice(0, slash)}/_rels/${xmlPath.slice(slash + 1)}.rels`;
}

function parseRelationships(xml: string, sourcePath: string): Map<string, string> {
  const relationships = new Map<string, string>();
  const sourceDir = sourcePath.slice(0, sourcePath.lastIndexOf("/"));
  const relationshipPattern = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*>/g;

  for (const match of xml.matchAll(relationshipPattern)) {
    const [, id, target] = match;
    if (!target || !/\.(png|jpg|jpeg|gif|webp)$/i.test(target)) continue;

    relationships.set(id, normalizeZipPath(sourceDir, target));
  }

  return relationships;
}

function parsePictures(xml: string) {
  const pictures: Array<{ relationshipId: string; x: number; y: number; w: number; h: number }> = [];
  const picturePattern = /<p:pic[\s\S]*?<\/p:pic>/g;

  for (const match of xml.matchAll(picturePattern)) {
    const block = match[0];
    const relationshipId = /r:embed="([^"]+)"/.exec(block)?.[1];
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(block);
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(block);
    if (!relationshipId || !off || !ext) continue;

    pictures.push({
      relationshipId,
      x: Number(off[1]),
      y: Number(off[2]),
      w: Number(ext[1]),
      h: Number(ext[2]),
    });
  }

  return pictures;
}

async function extractTemplateTheme(zip: JSZip): Promise<TemplateTheme> {
  const themePath = Object.keys(zip.files).find((path) => /^ppt\/theme\/theme\d+\.xml$/.test(path));
  const themeFile = themePath ? zip.file(themePath) : undefined;
  if (!themeFile) return {};

  const xml = await themeFile.async("string");
  const colorByName = new Map<string, string>();
  const colorPattern = /<a:(dk1|lt1|accent1|accent2|accent3|accent4|accent5|accent6)\b[\s\S]*?<\/a:\1>/g;
  for (const match of xml.matchAll(colorPattern)) {
    const color = colorFromXml(match[0], colorByName);
    if (color) colorByName.set(match[1]!, color);
  }

  return {
    backgroundColor: colorByName.get("lt1"),
    textColor: colorByName.get("dk1"),
    primaryColor: colorByName.get("accent1"),
    secondaryColor: colorByName.get("accent2") ?? colorByName.get("accent3"),
    surfaceFill: colorByName.get("lt1"),
    surfaceLine: colorByName.get("accent2") ?? colorByName.get("accent1"),
    ruleColor: colorByName.get("accent1"),
  };
}

function parseDecorativeShapes(xml: string, theme: TemplateTheme, layoutPreset?: string): TemplateShapeAsset[] {
  const shapes: TemplateShapeAsset[] = [];
  const shapePattern = /<p:sp\b[\s\S]*?<\/p:sp>/g;
  const themeMap = themeColorMap(theme);

  for (const match of xml.matchAll(shapePattern)) {
    const block = match[0];
    if (/<p:ph\b/.test(block) || hasVisibleText(block)) continue;

    const preset = /<a:prstGeom prst="([^"]+)"/.exec(block)?.[1];
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(block);
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(block);
    if (!preset || !off || !ext || preset === "line") continue;

    const w = Number(ext[1]) / EMU_PER_INCH;
    const h = Number(ext[2]) / EMU_PER_INCH;
    if (w < 0.04 || h < 0.04) continue;

    shapes.push({
      geometry: preset,
      x: Number(off[1]) / EMU_PER_INCH,
      y: Number(off[2]) / EMU_PER_INCH,
      w,
      h,
      fillColor: colorFromFill(block, themeMap),
      lineColor: colorFromLine(block, themeMap),
      lineTransparency: colorFromLine(block, themeMap) ? undefined : 100,
      layoutPreset,
    });
  }

  return shapes;
}

function parsePlaceholderShapes(xml: string, sourcePath: string, layoutPreset?: string): TemplatePlaceholderAsset[] {
  const placeholders: TemplatePlaceholderAsset[] = [];
  const shapePattern = /<p:sp\b[\s\S]*?<\/p:sp>/g;

  for (const match of xml.matchAll(shapePattern)) {
    const block = match[0];
    const placeholder = /<p:ph\b([^>]*)\/?>/.exec(block)?.[1];
    if (!placeholder) continue;

    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(block);
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(block);
    if (!off || !ext) continue;

    const w = Number(ext[1]) / EMU_PER_INCH;
    const h = Number(ext[2]) / EMU_PER_INCH;
    if (w < 0.1 || h < 0.1) continue;

    placeholders.push({
      role: placeholderRole(placeholder),
      x: Number(off[1]) / EMU_PER_INCH,
      y: Number(off[2]) / EMU_PER_INCH,
      w,
      h,
      sourcePath,
      layoutPreset,
    });
  }

  return placeholders;
}

function placeholderRole(attrs: string): TemplatePlaceholderRole {
  const type = /\btype="([^"]+)"/.exec(attrs)?.[1];
  if (type === "ctrTitle" || type === "title") return "title";
  if (type === "subTitle") return "subtitle";
  if (type === "pic") return "image";
  if (type === "tbl") return "table";
  if (type === "chart") return "chart";
  if (type === "dt" || type === "ftr") return "footer";
  if (type === "sldNum") return "pageNumber";
  return "body";
}

function inferLayoutPreset(xml: string, xmlPath: string): string | undefined {
  if (/\/(slideMasters|slideLayouts)\//.test(xmlPath)) return undefined;

  const textShapeCount = [...xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)]
    .filter((match) => hasVisibleText(match[0]))
    .length;

  if (textShapeCount >= 4) return "grid";
  if (textShapeCount === 3) return "vertical-list";
  if (textShapeCount === 2) return "comparison";
  if (textShapeCount === 1) return "title-body";
  return "cover";
}

function hasVisibleText(shapeXml: string): boolean {
  return [...shapeXml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
    .some((match) => decodeXml(match[1] ?? "").trim().length > 0);
}

function colorFromFill(xml: string, themeMap: Map<string, string>): string | undefined {
  const fill = /<a:solidFill>([\s\S]*?)<\/a:solidFill>/.exec(xml)?.[1];
  return fill ? colorFromXml(fill, themeMap) : undefined;
}

function colorFromLine(xml: string, themeMap: Map<string, string>): string | undefined {
  const line = /<a:ln\b[\s\S]*?<\/a:ln>/.exec(xml)?.[0];
  if (!line) return undefined;
  const fill = /<a:solidFill>([\s\S]*?)<\/a:solidFill>/.exec(line)?.[1];
  return fill ? colorFromXml(fill, themeMap) : undefined;
}

function colorFromXml(xml: string, themeMap: Map<string, string>): string | undefined {
  const srgb = /<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(xml)?.[1];
  if (srgb) return normalizeHex(srgb);

  const scheme = /<a:schemeClr val="([^"]+)"/.exec(xml)?.[1];
  if (scheme) return themeMap.get(scheme) ?? themeMap.get(themeAlias(scheme));

  const sys = /<a:sysClr\b[^>]*lastClr="([0-9A-Fa-f]{6})"/.exec(xml)?.[1];
  return sys ? normalizeHex(sys) : undefined;
}

function themeColorMap(theme: TemplateTheme): Map<string, string> {
  return new Map(Object.entries({
    lt1: theme.backgroundColor,
    bg1: theme.backgroundColor,
    dk1: theme.textColor,
    tx1: theme.textColor,
    accent1: theme.primaryColor,
    accent2: theme.secondaryColor,
  }).filter((entry): entry is [string, string] => Boolean(entry[1])));
}

function themeAlias(value: string): string {
  if (value === "bg1") return "lt1";
  if (value === "tx1") return "dk1";
  return value;
}

function normalizeHex(value: string): string {
  return value.replace(/^#/, "").toUpperCase();
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function normalizeZipPath(sourceDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  return normalize(join(sourceDir, target)).replace(/\\/g, "/").replace(/^(\.\.\/)+/, "");
}

function dedupeAssets(assets: TemplateImageAsset[]): TemplateImageAsset[] {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    const key = `${asset.x}:${asset.y}:${asset.w}:${asset.h}:${asset.path.split(/[/\\]/).pop()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeShapes(shapes: TemplateShapeAsset[]): TemplateShapeAsset[] {
  const seen = new Set<string>();
  return shapes.filter((shape) => {
    const key = [
      shape.layoutPreset ?? "all",
      shape.geometry,
      shape.x.toFixed(3),
      shape.y.toFixed(3),
      shape.w.toFixed(3),
      shape.h.toFixed(3),
      shape.fillColor ?? "",
      shape.lineColor ?? "",
    ].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupePlaceholders(placeholders: TemplatePlaceholderAsset[]): TemplatePlaceholderAsset[] {
  const seen = new Set<string>();
  return placeholders.filter((placeholder) => {
    const key = [
      placeholder.role,
      placeholder.x.toFixed(3),
      placeholder.y.toFixed(3),
      placeholder.w.toFixed(3),
      placeholder.h.toFixed(3),
    ].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function comparePlaceholders(left: TemplatePlaceholderAsset, right: TemplatePlaceholderAsset): number {
  return scorePlaceholderSource(left.sourcePath) - scorePlaceholderSource(right.sourcePath) ||
    left.y - right.y ||
    left.x - right.x;
}

function scorePlaceholderSource(path: string): number {
  if (path.includes("/slideLayouts/")) return 0;
  if (path.includes("/slideMasters/")) return 1;
  return 2;
}
