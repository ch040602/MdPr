import type { BlockIR, DesignTokens, DiagramIR, InlineRunIR, ListItemIR, PresentationIR, SlideIR } from "@mdpresent/core";
import type { LayoutIR } from "@mdpresent/layout";
import { readFile, writeFile } from "node:fs/promises";
import PptxGenJSExport from "pptxgenjs";
import type PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import { addPresetBackground, addRegionSurface, type DesignPresetName, resolveDesignPreset } from "./designPresets.js";
import { extractTemplateDesignAssets, type TemplateShapeAsset, type TemplateTheme } from "./templateImport.js";

export type { DesignPresetName } from "./designPresets.js";

export type RenderPptxOptions = {
  outPath: string;
  templatePath?: string | null;
  lockBackgroundToMaster?: boolean;
  designPreset?: DesignPresetName;
  themeGalleryPresets?: DesignPresetName[];
};

export type RenderableDeckIR = {
  presentation: PresentationIR;
  layout: LayoutIR;
};

export type RenderPptxInput = LayoutIR | RenderableDeckIR;

export async function renderPptx(input: RenderPptxInput, options: RenderPptxOptions): Promise<void> {
  const layout = isRenderableDeck(input) ? input.layout : input;
  const presentation = isRenderableDeck(input) ? input.presentation : undefined;
  const PptxGen = resolvePptxGenConstructor(PptxGenJSExport);
  const pptx = new PptxGen();
  const layoutName = "MDPRESENT_LAYOUT";
  const designPresets = options.themeGalleryPresets?.length
    ? options.themeGalleryPresets.map((preset) => resolveDesignPreset(preset, layout.theme))
    : [resolveDesignPreset(options.designPreset ?? layout.theme.designPreset, layout.theme)];
  const templateAssets = await extractTemplateDesignAssets(options.templatePath);
  let documentDesignPreset: DesignTokens | undefined;

  pptx.author = "mdpresent";
  pptx.company = "mdpresent";
  pptx.subject = "Generated from Markdown through Presentation IR and Layout IR";
  pptx.title = presentation?.meta.title ?? "mdpresent";
  pptx.defineLayout({
    name: layoutName,
    width: layout.slideSize.width,
    height: layout.slideSize.height,
  });
  pptx.layout = layoutName;
  pptx.theme = {
    headFontFace: layout.theme.fontFamily,
    bodyFontFace: layout.theme.fontFamily,
  };

  for (const baseDesignPreset of designPresets) {
    const designPreset = applyTemplateTheme(baseDesignPreset, templateAssets.theme);
    documentDesignPreset ??= designPreset;
    for (const layoutSlide of layout.slides) {
      const slide = pptx.addSlide();
      const sourceSlide = presentation?.slides.find((candidate) => candidate.id === layoutSlide.sourceSlideId);
      const blockIndex = sourceSlide ? createBlockIndex(sourceSlide) : new Map<string, BlockIR>();
      const isCover = layoutSlide.layout.preset === "cover";
      const roleFontSizes = fontSizesByRole(layoutSlide, layout.theme.bodyFontSize);

      slide.background = { color: isCover ? designPreset.primaryColor : designPreset.backgroundColor };
      addPresetBackground(slide, designPreset, layout.slideSize);
      if (isCover) addCoverTemplateDecorations(slide, designPreset, layout.slideSize);
      addLayoutDecorations(slide, layoutSlide, designPreset);
      addThemeGalleryLabel(slide, designPreset, layout.slideSize, options.themeGalleryPresets);
      for (const asset of templateAssets.images) {
        slide.addImage({ path: asset.path, x: asset.x, y: asset.y, w: asset.w, h: asset.h });
      }
      addTemplateShapeAssets(slide, templateAssets.shapes, layoutSlide.layout.preset);

      for (const region of [...layoutSlide.regions].sort((left, right) => left.zIndex - right.zIndex)) {
        if (region.role !== "title" && region.blockIds.length === 0) continue;
        addRegionSurface(slide, designPreset, region);
      }

      for (const region of [...layoutSlide.regions].sort((left, right) => left.zIndex - right.zIndex)) {
        if (region.role !== "title" && region.blockIds.length === 0) continue;
        const fontSize = roleFontSizes.get(region.role) ?? region.typography?.fontSize ?? layout.theme.bodyFontSize;
        const textPlacement = textPlacementForRegion(region);
        const common = {
          x: region.x,
          y: region.y,
          w: region.w,
          h: region.h,
          fontFace: region.typography?.fontFamily ?? layout.theme.fontFamily,
          fontSize,
          color: isCover && region.role === "title" ? readableTextColor(designPreset.primaryColor) : designPreset.textColor,
          margin: textPlacement.margin,
          fit: textFitForRegion(region, layoutSlide.overflowPolicy.action),
          wrap: true,
          breakLine: false,
          valign: textPlacement.valign,
          align: textPlacement.align,
          bold: region.typography?.fontWeight === "bold" || region.role === "title",
          lineSpacingMultiple: region.typography?.lineHeight ?? layout.theme.lineHeight,
          isTextBox: true,
          transparency: 0,
        };

        const blocks = region.blockIds
          .map((blockId) => blockIndex.get(blockId))
          .filter((block): block is BlockIR => Boolean(block));
        const orderedItemNumber = region.role === "item" ? orderedListItemNumber(blocks) : undefined;
        const badge = orderedItemNumber !== undefined ? renderItemNumberBadge(slide, region, orderedItemNumber, designPreset, common) : undefined;
        const textCommon = orderedItemNumber !== undefined
          ? textBoxForRegion(region, common, badge ? { reservedLeft: badge.right - region.x + 0.14 } : undefined)
          : textBoxForRegion(region, common);

        if (region.role === "title" && sourceSlide?.title) {
          slide.addText(sourceSlide.title, textCommon);
        } else if (blocks.length === 1 && blocks[0].type === "diagram" && blocks[0].diagram) {
          renderDiagramRegion(slide, blocks[0].diagram, region, designPreset, common);
        } else if (blocks.length === 1 && blocks[0].type === "table" && blocks[0].rows?.length) {
          const minTableFontSize = region.typography?.minFontSize ?? layoutSlide.overflowPolicy.minFontSize ?? layout.theme.minFontSize;
          slide.addTable(buildAlignedTableRows(blocks[0].rows, region, common, designPreset), {
            x: region.x,
            y: region.y,
            w: region.w,
            h: region.h,
            fontFace: common.fontFace,
            fontSize: tableFontSize(blocks[0].rows, region, fontSize, minTableFontSize),
            color: common.color,
            margin: [0.04, 0.06, 0.04, 0.06],
            breakLine: false,
            valign: "middle",
            autoPage: false,
            autoPageCharWeight: 0.25,
            autoPageLineWeight: 0.25,
            border: { color: designPreset.surfaceLine, type: "solid", pt: 1 },
          });
        } else if (blocks.length === 1 && blocks[0].type === "image" && blocks[0].src) {
          slide.addImage({ path: blocks[0].src, x: region.x, y: region.y, w: region.w, h: region.h });
        } else {
          const richText = renderRichRegionContent(region.blockIds, blockIndex, sourceSlide, region.role, designPreset);
          slide.addText(hasVisibleRichText(richText) ? richText : renderPlainRegionContent(region.role, region.blockIds, blockIndex, sourceSlide), textCommon);
        }
      }
    }
  }

  await pptx.writeFile({ fileName: options.outPath, compression: false });
  if (documentDesignPreset) await writePptxThemeColors(options.outPath, documentDesignPreset);
}

function textFitForRegion(
  region: { role: string },
  overflowAction: LayoutIR["slides"][number]["overflowPolicy"]["action"],
): "none" | "shrink" {
  if (region.role === "image" || region.role === "diagram") return "none";
  if (overflowAction === "fail") return "none";
  return "shrink";
}

function buildAlignedTableRows(
  rows: string[][],
  region: { w: number; h: number; typography?: { minFontSize?: number } },
  common: PptxGenJS.TextPropsOptions,
  preset: DesignTokens,
): PptxGenJS.TableRow[] {
  const size = tableFontSize(rows, region, common.fontSize ?? 12, region.typography?.minFontSize);

  return rows.map((row, rowIndex) => row.map((value, columnIndex) => {
    const isHeader = rowIndex === 0;
    return {
      text: normalizeTableCellText(value),
      options: {
        fontFace: common.fontFace,
        fontSize: isHeader ? Math.min(size + 1, common.fontSize ?? size) : size,
        bold: isHeader,
        color: isHeader ? readableTextColor(preset.primaryColor) : common.color,
        fill: isHeader ? { color: preset.primaryColor, transparency: 0 } : undefined,
        align: isHeader ? "center" : tableCellAlign(value, columnIndex),
        valign: "middle",
        margin: [0.04, 0.06, 0.04, 0.06],
        breakLine: false,
        border: { color: preset.surfaceLine, type: "solid", pt: 1 },
        autoPageCharWeight: 0.25,
        autoPageLineWeight: 0.25,
      },
    };
  }));
}

function tableFontSize(rows: string[][], region: { w: number; h: number }, baseFontSize: number, minFontSize = 8): number {
  const rowCount = Math.max(1, rows.length);
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const maxChars = Math.max(0, ...rows.flat().map((cell) => normalizeTableCellText(cell).length));
  const rowHeight = region.h / rowCount;
  const columnWidth = region.w / columnCount;
  let size = baseFontSize;

  if (rowHeight < 0.36) size -= 3;
  else if (rowHeight < 0.48) size -= 2;
  if (maxChars > columnWidth * 18) size -= 2;
  else if (maxChars > columnWidth * 13) size -= 1;
  if (rowCount > 7) size -= 1;

  return Math.max(minFontSize, Math.min(baseFontSize, Math.round(size)));
}

function tableCellAlign(value: string, columnIndex: number): PptxGenJS.HAlign {
  if (columnIndex > 0 && /^[-+]?[$€₩¥]?\s*\d[\d,]*(?:\.\d+)?%?$/.test(value.trim())) return "right";
  return "left";
}

function normalizeTableCellText(value: string): string {
  return value.replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim();
}

async function writePptxThemeColors(outPath: string, preset: DesignTokens): Promise<void> {
  const zip = await JSZip.loadAsync(await readFile(outPath));
  const themePath = Object.keys(zip.files).find((path) => /^ppt\/theme\/theme\d+\.xml$/.test(path));
  const themeFile = themePath ? zip.file(themePath) : undefined;
  if (!themePath || !themeFile) return;

  const colors = preset.themeColors;
  const replacements: Record<string, string> = {
    dk1: colors.dark1,
    lt1: colors.light1,
    dk2: colors.dark2,
    lt2: colors.light2,
    accent1: colors.accent1,
    accent2: colors.accent2,
    accent3: colors.accent3,
    accent4: colors.accent4,
    accent5: colors.accent5,
    accent6: colors.accent6,
    hlink: colors.hyperlink,
    folHlink: colors.followedHyperlink,
  };
  let xml = await themeFile.async("string");
  for (const [name, color] of Object.entries(replacements)) {
    xml = xml.replace(new RegExp(`<a:${name}>[\\s\\S]*?<\\/a:${name}>`), `<a:${name}><a:srgbClr val="${color}"/></a:${name}>`);
  }
  zip.file(themePath, xml);
  await writeFile(outPath, await zip.generateAsync({ type: "nodebuffer" }));
}

function applyTemplateTheme(preset: DesignTokens, theme: TemplateTheme): DesignTokens {
  if (!Object.values(theme).some(Boolean)) return preset;

  const themed = {
    ...preset,
    backgroundColor: theme.backgroundColor ?? preset.backgroundColor,
    textColor: theme.textColor ?? preset.textColor,
    primaryColor: theme.primaryColor ?? preset.primaryColor,
    secondaryColor: theme.secondaryColor ?? preset.secondaryColor,
    surfaceFill: theme.surfaceFill ?? theme.backgroundColor ?? preset.surfaceFill,
    surfaceLine: theme.surfaceLine ?? theme.secondaryColor ?? preset.surfaceLine,
    ruleColor: theme.ruleColor ?? theme.primaryColor ?? preset.ruleColor,
  };
  return withResolvedThemeColors(themed);
}

function withResolvedThemeColors(preset: DesignTokens): DesignTokens {
  const chartColors = [
    preset.primaryColor,
    preset.secondaryColor,
    preset.ruleColor,
    preset.mutedTextColor,
    preset.surfaceLine,
    preset.textColor,
  ];
  return {
    ...preset,
    chartColors,
    themeColors: {
      dark1: preset.textColor,
      light1: preset.backgroundColor,
      dark2: preset.mutedTextColor,
      light2: preset.surfaceFill,
      accent1: preset.primaryColor,
      accent2: preset.secondaryColor,
      accent3: preset.ruleColor,
      accent4: preset.mutedTextColor,
      accent5: preset.surfaceFill,
      accent6: preset.surfaceLine,
      hyperlink: preset.primaryColor,
      followedHyperlink: preset.secondaryColor,
    },
  };
}

function addTemplateShapeAssets(slide: PptxGenJS.Slide, shapes: TemplateShapeAsset[], layoutPreset: string): void {
  for (const shape of shapes.filter((candidate) => !candidate.layoutPreset || candidate.layoutPreset === layoutPreset)) {
    slide.addShape(shape.geometry as never, {
      x: shape.x,
      y: shape.y,
      w: shape.w,
      h: shape.h,
      fill: shape.fillColor ? { color: shape.fillColor } : { transparency: 100 },
      line: {
        color: shape.lineColor ?? shape.fillColor ?? "FFFFFF",
        transparency: shape.lineTransparency ?? (shape.lineColor ? 0 : 100),
        pt: shape.lineColor ? 1 : 0,
      },
    } as never);
  }
}

function isRenderableDeck(input: RenderPptxInput): input is RenderableDeckIR {
  return "presentation" in input && "layout" in input;
}

type PptxGenConstructor = new () => PptxGenJS;

function resolvePptxGenConstructor(value: unknown): PptxGenConstructor {
  if (typeof value === "function") return value as PptxGenConstructor;

  const nestedDefault = (value as { default?: unknown })?.default;
  if (typeof nestedDefault === "function") return nestedDefault as PptxGenConstructor;

  throw new TypeError("pptxgenjs default export is not a constructor");
}

function fontSizesByRole(layoutSlide: LayoutIR["slides"][number], fallbackFontSize: number): Map<string, number> {
  const grouped = new Map<string, number[]>();
  for (const region of layoutSlide.regions) {
    if (region.role === "title") continue;
    const values = grouped.get(region.role) ?? [];
    values.push(region.typography?.fontSize ?? fallbackFontSize);
    grouped.set(region.role, values);
  }

  return new Map(
    [...grouped.entries()].map(([role, sizes]) => [role, Math.min(...sizes)]),
  );
}

function createBlockIndex(slide: SlideIR): Map<string, BlockIR> {
  const index = new Map<string, BlockIR>();

  for (const block of slide.blocks) {
    index.set(block.id, block);
    if (block.type === "bulletList") {
      const itemCount = Math.max(block.items?.length ?? 0, block.listItems?.length ?? 0);
      for (let itemIndex = 0; itemIndex < itemCount; itemIndex++) {
        const item = block.items?.[itemIndex] ?? block.listItems?.[itemIndex]?.text;
        if (!item) continue;
        index.set(`${block.id}#${itemIndex}`, {
          ...block,
          id: `${block.id}#${itemIndex}`,
          items: [item],
          listItems: block.listItems?.[itemIndex] ? [block.listItems[itemIndex]] : undefined,
        });
      }
    }
  }

  return index;
}

function hasVisibleRichText(runs: PptxGenJS.TextProps[]): boolean {
  return runs.some((run) => (run.text ?? "").trim().length > 0);
}

function renderRichRegionContent(
  blockIds: string[],
  blockIndex: Map<string, BlockIR>,
  slide?: SlideIR,
  role = "body",
  preset?: DesignTokens,
): PptxGenJS.TextProps[] {
  const runs: PptxGenJS.TextProps[] = [];

  for (const blockId of blockIds) {
    const block = blockIndex.get(blockId);
    if (!block) continue;

    if (block.type === "bulletList") {
      const items = block.listItems?.length
        ? block.listItems
        : (block.items ?? []).map((item) => ({ text: item, ordered: false, level: 0 }) satisfies ListItemIR);

      for (const item of items) {
        runs.push(...renderListItemRuns(item, runs.length > 0, role, preset));
      }
    } else if (block.type === "code") {
      runs.push(...renderCodeRuns(block.text ?? "", runs.length > 0));
    } else if (block.type === "paragraph" || block.type === "quote") {
      if (block.type === "paragraph" && runs.length > 0) {
        runs.push({ text: "", options: { breakLine: true } });
      }
      if (block.inlineRuns?.length) {
        runs.push(...renderInlineRuns(block.inlineRuns, runs.length > 0, "", preset?.primaryColor));
      } else {
        for (const unit of paragraphUnits(block)) {
          runs.push({ text: normalizeRenderableText(unit), options: { breakLine: runs.length > 0 } });
        }
      }
    } else {
      const text = normalizeRenderableText(block.text ?? block.alt ?? "");
      if (text) runs.push({ text, options: { breakLine: runs.length > 0 } });
    }
  }

  if (!runs.length && role === "title" && slide?.title) return [{ text: slide.title }];
  return runs;
}

function renderCodeRuns(text: string, breakLine: boolean): PptxGenJS.TextProps[] {
  return text.split(/\r?\n/).map((line, index) => ({
    text: line,
    options: {
      fontFace: "Consolas",
      breakLine: index === 0 ? breakLine : true,
    },
  }));
}

function renderPlainRegionContent(
  role: string,
  blockIds: string[],
  blockIndex: Map<string, BlockIR>,
  slide?: SlideIR,
): string {
  if (role === "title" && slide?.title) return slide.title;

  const text = blockIds
    .map((blockId) => {
      const block = blockIndex.get(blockId);
      if (!block) return "";
      if (block.type === "paragraph") return paragraphUnits(block).join("\n");
      if (block.listItems?.length) return block.listItems.map(formatListItemText).join("\n");
      if (block.items?.length) return block.items.join("\n");
      if (block.rows?.length) return block.rows.map((row) => row.join(" ")).join("\n");
      return block.text ?? block.alt ?? "";
    })
    .filter(Boolean)
    .join("\n");

  return normalizeRenderableText(text || "");
}

function paragraphUnits(block: BlockIR): string[] {
  if (block.sentences?.length) return block.sentences;
  if (block.lines?.length) return block.lines;
  return block.text ? [block.text] : [];
}

function renderListItemRuns(item: ListItemIR, breakLine: boolean, role: string, preset?: DesignTokens): PptxGenJS.TextProps[] {
  if (item.label && item.description) {
    const prefix = `${"  ".repeat(item.level)}${listPrefix(item, role)}`;
    return [
      {
        text: `${prefix}${item.label}`,
        options: { breakLine, bold: true, color: preset?.primaryColor },
      },
      ...renderInlineRuns(item.descriptionRuns?.length ? item.descriptionRuns : [{ text: item.description }], true, `${"\t".repeat(item.level + 1)}`, preset?.primaryColor),
    ];
  }

  const prefix = `${"  ".repeat(item.level)}${listPrefix(item, role)}`;
  const inlineRuns = item.runs?.length ? item.runs : [{ text: item.text }];
  return renderInlineRuns(inlineRuns, breakLine, prefix, preset?.primaryColor);
}

function renderInlineRuns(inlineRuns: InlineRunIR[], breakLine: boolean, prefix = "", accentColor?: string): PptxGenJS.TextProps[] {
  const rendered: PptxGenJS.TextProps[] = [];
  let needsPrefix = true;
  let nextBreakLine = breakLine;

  for (const run of inlineRuns) {
    const parts = run.text.split(/\r?\n/);
    for (const [index, part] of parts.entries()) {
      const text = `${needsPrefix ? prefix : ""}${normalizeRenderableRunText(part)}`;
      if (text || index === 0) {
        rendered.push({
          text,
          options: {
            breakLine: nextBreakLine || index > 0,
            bold: run.bold,
            italic: run.italic,
            color: run.bold ? accentColor : undefined,
          },
        });
      }
      needsPrefix = false;
      nextBreakLine = index < parts.length - 1;
    }
  }

  return rendered;
}

function normalizeRenderableText(value: string): string {
  return value.replace(/[ \t\f\v]+/g, " ").trim();
}

function normalizeRenderableRunText(value: string): string {
  return value.replace(/[ \t\f\v]+/g, " ");
}

function formatListItemText(item: ListItemIR): string {
  if (item.label && item.description) {
    return `${"  ".repeat(item.level)}${listPrefix(item, "body")}${item.label}\n${"\t".repeat(item.level + 1)}${item.description}`;
  }
  return `${"  ".repeat(item.level)}${listPrefix(item, "body")}${item.text}`;
}

function listPrefix(item: ListItemIR, role: string): string {
  if (role === "item") return "";
  if (item.ordered) return `${item.number ?? 1}. `;
  return "- ";
}

function orderedListItemNumber(blocks: BlockIR[]): number | undefined {
  if (blocks.length !== 1 || blocks[0]?.type !== "bulletList") return undefined;
  const item = blocks[0].listItems?.[0];
  if (!item?.ordered) return undefined;
  return item.number ?? 1;
}

type TextPlacement = {
  inset: { top: number; right: number; bottom: number; left: number };
  margin: [number, number, number, number];
  align: PptxGenJS.HAlign;
  valign: PptxGenJS.VAlign;
};

function textPlacementForRegion(region: { id: string; role: string; h: number; w: number }): TextPlacement {
  if (region.id === "key-message") {
    return {
      inset: { top: 0.14, right: 0.24, bottom: 0.14, left: 0.42 },
      margin: [0, 0, 0, 0],
      align: "left",
      valign: "middle",
    };
  }

  if (region.role === "title") {
    return {
      inset: { top: 0, right: 0, bottom: 0, left: 0 },
      margin: [0, 0, 0, 0],
      align: "center",
      valign: "middle",
    };
  }

  if (region.role === "item") {
    const vertical = Math.min(0.18, Math.max(0.1, region.h * 0.09));
    return {
      inset: { top: vertical, right: 0.22, bottom: vertical, left: 0.24 },
      margin: [0, 2, 0, 2],
      align: "center",
      valign: "middle",
    };
  }

  if (region.role === "code") {
    return {
      inset: { top: 0.16, right: 0.18, bottom: 0.16, left: 0.18 },
      margin: [0, 2, 0, 2],
      align: "left",
      valign: "top",
    };
  }

  if (region.role === "diagram") {
    return {
      inset: { top: 0, right: 0, bottom: 0, left: 0 },
      margin: [0, 0, 0, 0],
      align: "center",
      valign: "middle",
    };
  }

  return {
    inset: { top: 0.12, right: 0.08, bottom: 0.12, left: 0.08 },
    margin: [0, 2, 0, 2],
    align: "left",
    valign: "top",
  };
}

function renderItemNumberBadge(
  slide: PptxGenJS.Slide,
  region: { x: number; y: number; w: number; h: number; typography?: { fontSize?: number } },
  number: number,
  preset: DesignTokens,
  common: PptxGenJS.TextPropsOptions,
): { x: number; y: number; size: number; right: number } {
  const size = Math.min(0.42, Math.max(0.28, region.h * 0.34));
  const x = region.x + Math.min(0.24, Math.max(0.14, region.w * 0.04));
  const y = region.y + (region.h - size) / 2;
  const shape = number % 2 === 0 ? "roundRect" : "ellipse";
  slide.addShape(shape as never, {
    x,
    y,
    w: size,
    h: size,
    rectRadius: 0.05,
    fill: { color: preset.primaryColor },
    line: { color: preset.primaryColor, transparency: 100 },
  } as never);
  slide.addText(String(number), {
    ...common,
    x,
    y,
    w: size,
    h: size,
    margin: [0, 0, 0, 0],
    fontSize: Math.max(8, Math.min(13, (region.typography?.fontSize ?? 18) - 5)),
    color: readableTextColor(preset.primaryColor),
    bold: true,
    align: "center",
    valign: "middle",
  });
  return { x, y, size, right: x + size };
}

function textBoxForRegion(
  region: { id: string; role: string; x: number; y: number; w: number; h: number },
  common: PptxGenJS.TextPropsOptions,
  options: { reservedLeft?: number } = {},
): PptxGenJS.TextPropsOptions {
  const placement = textPlacementForRegion(region);
  const leftInset = Math.max(placement.inset.left, options.reservedLeft ?? 0);
  const rightInset = placement.inset.right;
  const topInset = placement.inset.top;
  const bottomInset = placement.inset.bottom;

  if (region.id === "key-message") {
    return {
      ...common,
      x: region.x + leftInset,
      y: region.y + topInset,
      w: Math.max(0.2, region.w - leftInset - rightInset),
      h: Math.max(0.2, region.h - topInset - bottomInset),
      margin: placement.margin,
      align: placement.align,
      valign: placement.valign,
    };
  }

  return {
    ...common,
    x: region.x + leftInset,
    y: region.y + topInset,
    w: Math.max(0.2, region.w - leftInset - rightInset),
    h: Math.max(0.2, region.h - topInset - bottomInset),
    margin: placement.margin,
    align: options.reservedLeft !== undefined ? "left" : placement.align,
    valign: placement.valign,
  };
}

function renderDiagramRegion(
  slide: PptxGenJS.Slide,
  diagram: DiagramIR,
  region: { x: number; y: number; w: number; h: number; typography?: { fontFamily?: string; fontSize?: number } },
  preset: DesignTokens,
  common: PptxGenJS.TextPropsOptions,
): void {
  if (diagram.kind !== "pipeline" || diagram.nodes.length === 0) return;

  const arrangement = arrangeDiagramNodes(diagram, region);
  const boxesById = new Map(arrangement.boxes.map((box) => [box.node.id, box]));
  const labelFontSize = uniformDiagramLabelFontSize(arrangement.boxes, region.typography?.fontSize ?? common.fontSize ?? 14);

  for (const [index, box] of arrangement.boxes.entries()) {
    const { node, x, y, w, h } = box;
    const accentColor = preset.primaryColor;
    const badgeSize = Math.min(0.34, Math.max(0.24, h * 0.28));
    const badgeX = x + Math.min(0.18, Math.max(0.1, w * 0.06));
    const badgeY = y + (h - badgeSize) / 2;
    const labelX = badgeX + badgeSize + 0.16;
    const labelRightPadding = 0.18;
    slide.addShape("roundRect", {
      x,
      y,
      w,
      h,
      rectRadius: 0.06,
      fill: { color: preset.surfaceFill },
      line: { color: accentColor, pt: 1.4 },
      shadow: { type: "outer", color: "000000", opacity: 0.12, blur: 1, angle: 45 },
    });
    decorateDiagramNode(slide, box, index, arrangement.kind, accentColor, preset);
    slide.addShape("ellipse", {
      x: badgeX,
      y: badgeY,
      w: badgeSize,
      h: badgeSize,
      fill: { color: accentColor },
      line: { color: accentColor, transparency: 100 },
    });
    slide.addText(String(index + 1), {
      ...common,
      x: badgeX,
      y: badgeY,
      w: badgeSize,
      h: badgeSize,
      fontSize: Math.max(7, Math.min(11, (region.typography?.fontSize ?? common.fontSize ?? 14) - 8)),
      color: preset.backgroundColor,
      bold: true,
      align: "center",
      valign: "middle",
      margin: [0, 0, 0, 0],
    });
    slide.addText(node.label, {
      ...common,
      x: labelX,
      y: y + 0.14,
      w: Math.max(0.35, x + w - labelX - labelRightPadding),
      h: Math.max(0.28, h - 0.28),
      fontSize: labelFontSize,
      color: preset.textColor,
      align: "left",
      valign: "middle",
      margin: [0, 2, 0, 2],
      breakLine: false,
      fit: "shrink",
      lineSpacingMultiple: 0.92,
    });
  }

  for (const edge of diagram.edges) {
    const from = boxesById.get(edge.from);
    const to = boxesById.get(edge.to);
    if (!from || !to) continue;
    const { start, end } = connectorEndpoints(from, to);
    renderConnector(slide, start, end, preset.ruleColor);
  }
}

type DiagramArrangementKind = "horizontal" | "vertical" | "u" | "reverse-u" | "cycle";

type DiagramNodeBox = {
  node: DiagramIR["nodes"][number];
  x: number;
  y: number;
  w: number;
  h: number;
};

function arrangeDiagramNodes(
  diagram: DiagramIR,
  region: { x: number; y: number; w: number; h: number },
): { kind: DiagramArrangementKind; boxes: DiagramNodeBox[] } {
  const kind = chooseDiagramArrangement(diagram);
  const nodes = diagram.nodes;
  const gap = 0.34;

  if (kind === "vertical") {
    const nodeH = Math.min(1.45, Math.max(0.95, (region.h - gap * (nodes.length - 1)) / nodes.length));
    const nodeW = Math.min(region.w, Math.max(4.2, region.w * 0.72));
    const startX = region.x + (region.w - nodeW) / 2;
    const startY = region.y + Math.max(0, (region.h - nodeH * nodes.length - gap * (nodes.length - 1)) / 2);
    return {
      kind,
      boxes: nodes.map((node, index) => ({
        node,
        x: startX,
        y: startY + index * (nodeH + gap),
        w: nodeW,
        h: Math.max(0.45, nodeH),
      })),
    };
  }

  if (kind === "cycle") {
    const nodeW = Math.min(2.8, Math.max(1.75, region.w / 4.0));
    const nodeH = Math.min(1.2, Math.max(0.92, region.h / 3.5));
    const radiusX = Math.max(0.1, (region.w - nodeW) / 2);
    const radiusY = Math.max(0.1, (region.h - nodeH) / 2);
    return {
      kind,
      boxes: nodes.map((node, index) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * index) / nodes.length;
        return {
          node,
          x: region.x + region.w / 2 + Math.cos(angle) * radiusX - nodeW / 2,
          y: region.y + region.h / 2 + Math.sin(angle) * radiusY - nodeH / 2,
          w: nodeW,
          h: nodeH,
        };
      }),
    };
  }

  if (kind === "u" || kind === "reverse-u") {
    const columns = nodes.length <= 6 ? 3 : Math.min(4, Math.ceil(Math.sqrt(nodes.length + 1)));
    const rows = Math.max(2, Math.ceil(nodes.length / columns));
    const nodeW = Math.max(1.35, (region.w - gap * (columns - 1)) / columns);
    const nodeH = Math.max(0.9, Math.min(1.28, (region.h - gap * (rows - 1)) / rows));
    const startY = region.y + Math.max(0, (region.h - nodeH * rows - gap * (rows - 1)) / 2);
    const cells = kind === "u"
      ? uShapeCells(columns, rows).slice(0, nodes.length)
      : reverseUShapeCells(columns, rows).slice(0, nodes.length);

    return {
      kind,
      boxes: nodes.map((node, index) => {
        const cell = cells[index] ?? { column: index % columns, row: Math.floor(index / columns) };
        return {
          node,
          x: region.x + cell.column * (nodeW + gap),
          y: startY + cell.row * (nodeH + gap),
          w: nodeW,
          h: nodeH,
        };
      }),
    };
  }

  const columnCount = nodes.length;
  const nodeW = Math.max(1.05, (region.w - gap * (columnCount - 1)) / columnCount);
  const nodeH = Math.min(region.h, 1.32);
  const startY = region.y + Math.max(0, (region.h - nodeH) / 2);
  return {
    kind,
    boxes: nodes.map((node, index) => ({
      node,
      x: region.x + index * (nodeW + gap),
      y: startY,
      w: nodeW,
      h: nodeH,
    })),
  };
}

function chooseDiagramArrangement(diagram: DiagramIR): DiagramArrangementKind {
  const nodeCount = diagram.nodes.length;
  const longestLabel = Math.max(...diagram.nodes.map((node) => node.label.length));
  const averageLabel = diagram.nodes.reduce((sum, node) => sum + node.label.length, 0) / Math.max(nodeCount, 1);
  const firstId = diagram.nodes[0]?.id;
  const lastId = diagram.nodes[nodeCount - 1]?.id;

  if (nodeCount > 2 && diagram.edges.some((edge) => edge.from === lastId && edge.to === firstId)) return "cycle";
  if (nodeCount <= 5 && (longestLabel > 34 || averageLabel > 24)) return "vertical";
  if (nodeCount <= 4 && longestLabel <= 22) return "horizontal";
  if (nodeCount <= 7) return "u";
  if (nodeCount <= 10) return "reverse-u";
  return "vertical";
}

function uShapeCells(columns: number, rows: number): Array<{ column: number; row: number }> {
  const cells: Array<{ column: number; row: number }> = [];
  for (let column = 0; column < columns; column++) cells.push({ column, row: 0 });
  for (let row = 1; row < rows; row++) cells.push({ column: columns - 1, row });
  for (let row = rows - 1; row >= 1; row--) {
    for (let column = columns - 2; column >= 0; column--) cells.push({ column, row });
  }
  return uniqueCells(cells);
}

function reverseUShapeCells(columns: number, rows: number): Array<{ column: number; row: number }> {
  const cells: Array<{ column: number; row: number }> = [];
  for (let column = 0; column < columns; column++) cells.push({ column, row: rows - 1 });
  for (let row = rows - 2; row >= 0; row--) cells.push({ column: columns - 1, row });
  for (let row = 0; row < rows - 1; row++) {
    for (let column = columns - 2; column >= 0; column--) cells.push({ column, row });
  }
  return uniqueCells(cells);
}

function uniqueCells(cells: Array<{ column: number; row: number }>): Array<{ column: number; row: number }> {
  const seen = new Set<string>();
  return cells.filter((cell) => {
    const key = `${cell.column}:${cell.row}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function connectorEndpoints(
  from: DiagramNodeBox,
  to: DiagramNodeBox,
): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const fromCenter = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const toCenter = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { start: { x: from.x + from.w - 0.03, y: fromCenter.y }, end: { x: to.x + 0.03, y: toCenter.y } }
      : { start: { x: from.x + 0.03, y: fromCenter.y }, end: { x: to.x + to.w - 0.03, y: toCenter.y } };
  }

  return dy >= 0
    ? { start: { x: fromCenter.x, y: from.y + from.h - 0.03 }, end: { x: toCenter.x, y: to.y + 0.03 } }
    : { start: { x: fromCenter.x, y: from.y + 0.03 }, end: { x: toCenter.x, y: to.y + to.h - 0.03 } };
}

function renderConnector(
  slide: PptxGenJS.Slide,
  start: { x: number; y: number },
  end: { x: number; y: number },
  color: string,
): void {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const points = Math.abs(dx) < 0.05 || Math.abs(dy) < 0.05
    ? [start, end]
    : [
        start,
        { x: start.x + dx / 2, y: start.y },
        { x: start.x + dx / 2, y: end.y },
        end,
      ];

  for (let index = 0; index < points.length - 1; index++) {
    addNormalizedLine(slide, points[index]!, points[index + 1]!, color, index === points.length - 2);
  }
}

function addNormalizedLine(
  slide: PptxGenJS.Slide,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  arrowAtTo: boolean,
  style: { pt?: number; transparency?: number } = {},
): void {
  if (Math.abs(to.x - from.x) < 0.02 && Math.abs(to.y - from.y) < 0.02) return;

  const reverse = to.x < from.x || to.y < from.y;
  const start = reverse ? to : from;
  const end = reverse ? from : to;
  slide.addShape("line" as never, {
    x: start.x,
    y: start.y,
    w: Math.max(0, end.x - start.x),
    h: Math.max(0, end.y - start.y),
    line: {
      color,
      pt: style.pt ?? 1.35,
      ...(style.transparency !== undefined ? { transparency: style.transparency } : {}),
      ...(arrowAtTo ? reverse ? { beginArrowType: "triangle" } : { endArrowType: "triangle" } : {}),
    },
  } as never);
}

function decorateDiagramNode(
  slide: PptxGenJS.Slide,
  box: DiagramNodeBox,
  index: number,
  kind: DiagramArrangementKind,
  accentColor: string,
  preset: DesignTokens,
): void {
  const variant = diagramDecorationVariant(index, kind);
  const { x, y, w, h } = box;

  if (variant === "left-rail") {
    slide.addShape("rect", {
      x,
      y,
      w: 0.1,
      h,
      fill: { color: accentColor },
      line: { color: accentColor, transparency: 100 },
    });
    return;
  }

  if (variant === "bottom-rule") {
    slide.addShape("rect", {
      x: x + 0.16,
      y: y + h - 0.13,
      w: w - 0.32,
      h: 0.08,
      fill: { color: accentColor },
      line: { color: accentColor, transparency: 100 },
    });
    return;
  }

  if (variant === "corner-chip") {
    slide.addShape("rect", {
      x: x + w - 0.46,
      y,
      w: 0.46,
      h: 0.18,
      fill: { color: preset.secondaryColor },
      line: { color: preset.secondaryColor, transparency: 100 },
    });
    return;
  }

  slide.addShape("rect", {
    x,
    y,
    w,
    h: 0.12,
    fill: { color: accentColor },
    line: { color: accentColor, transparency: 100 },
  });
}

function diagramDecorationVariant(index: number, kind: DiagramArrangementKind): "top-bar" | "left-rail" | "bottom-rule" | "corner-chip" {
  void index;
  if (kind === "cycle") return "corner-chip";
  return "top-bar";
}

function diagramLabelFontSize(label: string, width: number, height: number, baseFontSize: number): number {
  const lines = label.split(/\r?\n/).length;
  const longestLine = Math.max(...label.split(/\r?\n/).map((line) => line.length));
  const capacity = Math.max(8, width * height * 18);
  const pressure = Math.max(longestLine, label.length / Math.max(lines, 1)) / capacity;
  if (pressure > 0.26) return Math.max(10, baseFontSize - 5);
  if (pressure > 0.18) return Math.max(11, baseFontSize - 3);
  return Math.max(11, Math.min(baseFontSize - 1, 15));
}

function uniformDiagramLabelFontSize(boxes: DiagramNodeBox[], baseFontSize: number): number {
  if (!boxes.length) return Math.max(11, Math.min(baseFontSize - 1, 15));
  return Math.min(...boxes.map((box) => diagramLabelFontSize(box.node.label, box.w, box.h, baseFontSize)));
}

function addLayoutDecorations(slide: PptxGenJS.Slide, layoutSlide: LayoutIR["slides"][number], preset: DesignTokens): void {
  addRegionAccents(slide, layoutSlide, preset);
  if (layoutSlide.layout.preset !== "pentagon") return;
  const itemRegions = layoutSlide.regions
    .filter((region) => region.role === "item")
    .sort((left, right) => left.id.localeCompare(right.id));
  if (itemRegions.length < 4) return;

  for (let index = 0; index < itemRegions.length; index++) {
    const current = itemRegions[index]!;
    const next = itemRegions[(index + 1) % itemRegions.length]!;
    const from = { x: current.x + current.w / 2, y: current.y + current.h / 2 };
    const to = { x: next.x + next.w / 2, y: next.y + next.h / 2 };
    addNormalizedLine(slide, from, to, preset.secondaryColor, false, { pt: 1.2, transparency: 12 });
  }
}

function addCoverTemplateDecorations(slide: PptxGenJS.Slide, preset: DesignTokens, slideSize: LayoutIR["slideSize"]): void {
  const variant = coverTemplateVariant(preset.name);

  if (variant === "split-band") {
    slide.addShape("rect", {
      x: 0,
      y: slideSize.height - 1.15,
      w: slideSize.width,
      h: 1.15,
      fill: { color: preset.secondaryColor, transparency: 8 },
      line: { color: preset.secondaryColor, transparency: 100 },
    });
    slide.addShape("rect", {
      x: 0.72,
      y: slideSize.height - 1.42,
      w: 4.1,
      h: 0.08,
      fill: { color: readableTextColor(preset.primaryColor) },
      line: { color: readableTextColor(preset.primaryColor), transparency: 100 },
    });
    return;
  }

  if (variant === "left-rail") {
    slide.addShape("rect", {
      x: 0,
      y: 0,
      w: 0.34,
      h: slideSize.height,
      fill: { color: preset.secondaryColor },
      line: { color: preset.secondaryColor, transparency: 100 },
    });
    slide.addShape("rect", {
      x: 0.54,
      y: 1.1,
      w: 0.08,
      h: slideSize.height - 2.2,
      fill: { color: readableTextColor(preset.primaryColor), transparency: 15 },
      line: { color: readableTextColor(preset.primaryColor), transparency: 100 },
    });
    return;
  }

  if (variant === "frame") {
    const color = readableTextColor(preset.primaryColor);
    slide.addShape("rect", {
      x: 0.55,
      y: 0.55,
      w: slideSize.width - 1.1,
      h: slideSize.height - 1.1,
      fill: { color: preset.primaryColor, transparency: 100 },
      line: { color, transparency: 15, pt: 1.5 },
    });
    slide.addShape("rect", {
      x: slideSize.width - 2.3,
      y: slideSize.height - 0.72,
      w: 1.75,
      h: 0.08,
      fill: { color: preset.secondaryColor },
      line: { color: preset.secondaryColor, transparency: 100 },
    });
    return;
  }

  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: slideSize.width,
    h: 0.22,
    fill: { color: preset.secondaryColor },
    line: { color: preset.secondaryColor, transparency: 100 },
  });
  slide.addShape("rect", {
    x: slideSize.width - 3.1,
    y: slideSize.height - 0.36,
    w: 2.35,
    h: 0.08,
    fill: { color: readableTextColor(preset.primaryColor), transparency: 10 },
    line: { color: readableTextColor(preset.primaryColor), transparency: 100 },
  });
}

function coverTemplateVariant(presetName: string): "top-rule" | "split-band" | "left-rail" | "frame" {
  if (["editorial", "solarized", "gruvbox"].includes(presetName)) return "split-band";
  if (["technical", "material", "tableau"].includes(presetName)) return "left-rail";
  if (["dark", "nord", "dracula", "monokai", "tokyo-night"].includes(presetName)) return "frame";
  return "top-rule";
}

function addRegionAccents(slide: PptxGenJS.Slide, layoutSlide: LayoutIR["slides"][number], preset: DesignTokens): void {
  for (const region of layoutSlide.regions) {
    if (!region.blockIds.length) continue;
    if (region.id === "key-message") continue;
    if (!["body", "item"].includes(region.role)) continue;
    const indexMatch = /(\d+)$/.exec(region.id);
    const index = indexMatch ? Number(indexMatch[1]) : 0;
    const color = index % 2 === 0 ? preset.secondaryColor : preset.primaryColor;

    if (region.role === "item") {
      slide.addShape("rect", {
        x: region.x,
        y: region.y,
        w: 0.08,
        h: region.h,
        fill: { color },
        line: { color, transparency: 100 },
      });
      continue;
    }

    slide.addShape("rect", {
      x: region.x,
      y: region.y,
      w: region.w,
      h: 0.08,
      fill: { color: preset.primaryColor },
      line: { color: preset.primaryColor, transparency: 100 },
    });
  }
}

function addThemeGalleryLabel(
  slide: PptxGenJS.Slide,
  preset: DesignTokens,
  slideSize: LayoutIR["slideSize"],
  galleryPresets?: DesignPresetName[],
): void {
  if (!galleryPresets?.length) return;
  slide.addText(`Theme: ${preset.name}`, {
    x: slideSize.width - 2.55,
    y: slideSize.height - 0.38,
    w: 2.25,
    h: 0.18,
    fontSize: 8,
    fontFace: "Arial",
    color: preset.mutedTextColor,
    align: "right",
    margin: [0, 0, 0, 0],
  });
}

function normalizeHex(color: string): string {
  const hex = color.replace(/^#/, "").toUpperCase();
  if (/^[0-9A-F]{3}$/.test(hex)) return hex.split("").map((char) => `${char}${char}`).join("");
  return hex;
}

function readableTextColor(backgroundColor: string): string {
  const hex = normalizeHex(backgroundColor);
  if (!/^[0-9A-F]{6}$/.test(hex)) return "FFFFFF";
  const red = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const green = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(hex.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance > 0.58 ? "111827" : "FFFFFF";
}
