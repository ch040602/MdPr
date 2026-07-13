import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import PptxGenJSExport from "pptxgenjs";
import JSZip from "jszip";
import { renderPptx } from "../dist/index.js";
import { iconKindForText } from "../dist/iconCatalog.js";
import { extractTemplateDesignAssets, inspectTemplatePackageIntegrity } from "../dist/templateImport.js";

const PptxGenJS = typeof PptxGenJSExport === "function" ? PptxGenJSExport : PptxGenJSExport.default;
const EMU_PER_INCH = 914400;
const templateMasterPreservationFixture = fileURLToPath(new URL("../../../tests/fixtures/template-master-preservation.fixture.pptx", import.meta.url));

async function assertPptxObjectsInsideSlide(pptxPath, widthIn = 13.333, heightIn = 7.5) {
  const zip = await JSZip.loadAsync(readFileSync(pptxPath));
  const slideRight = Math.round(widthIn * EMU_PER_INCH);
  const slideBottom = Math.round(heightIn * EMU_PER_INCH);
  const tolerance = 3;
  const slidePaths = Object.keys(zip.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path));

  for (const slidePath of slidePaths) {
    const xml = await zip.file(slidePath).async("string");
    const objects = [...xml.matchAll(/<p:(?:sp|pic|cxnSp)\b[\s\S]*?<\/p:(?:sp|pic|cxnSp)>/g)].map((match) => match[0]);
    for (const [index, objectXml] of objects.entries()) {
      const xfrm = /<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(-?\d+)" cy="(-?\d+)"\/>/.exec(objectXml);
      if (!xfrm) continue;
      const x = Number(xfrm[1]);
      const y = Number(xfrm[2]);
      const w = Math.max(0, Number(xfrm[3]));
      const h = Math.max(0, Number(xfrm[4]));
      assert.equal(x >= -tolerance, true, `${slidePath} object ${index} x underflow: ${x}`);
      assert.equal(y >= -tolerance, true, `${slidePath} object ${index} y underflow: ${y}`);
      assert.equal(x + w <= slideRight + tolerance, true, `${slidePath} object ${index} x overflow: ${x + w} > ${slideRight}`);
      assert.equal(y + h <= slideBottom + tolerance, true, `${slidePath} object ${index} y overflow: ${y + h} > ${slideBottom}`);
    }
  }
}

function shapeXmlContainingText(xml, text) {
  const shapes = [...xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)].map((match) => match[0]);
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return shapes.find((shape) => new RegExp(`<a:t>${escaped}</a:t>`).test(shape));
}

function shapeTransform(shapeXml) {
  const xfrm = /<a:off x="(-?\d+)" y="(-?\d+)"\/>\s*<a:ext cx="(-?\d+)" cy="(-?\d+)"\/>/.exec(shapeXml ?? "");
  assert.ok(xfrm, `missing transform for shape: ${shapeXml?.slice(0, 180)}`);
  return {
    x: Number(xfrm[1]) / EMU_PER_INCH,
    y: Number(xfrm[2]) / EMU_PER_INCH,
    w: Number(xfrm[3]) / EMU_PER_INCH,
    h: Number(xfrm[4]) / EMU_PER_INCH,
  };
}

function slideObjectsWithTransforms(xml) {
  return [...xml.matchAll(/<p:(sp|pic|cxnSp)\b[\s\S]*?<\/p:\1>/g)]
    .map((match, index) => ({ tag: match[1], index, xml: match[0], ...shapeTransform(match[0]) }));
}

function sameNumber(left, right, tolerance = 0.01) {
  return Math.abs(left - right) <= tolerance;
}

test("icon catalog searches keyword candidates before choosing a semantic icon", () => {
  assert.equal(iconKindForText("GitHub repository pull request workflow"), "github");
  assert.equal(iconKindForText("PowerPoint theme color harmony and palette coherence"), "palette");
  assert.equal(iconKindForText("Database storage cache evidence"), "database");
  assert.equal(iconKindForText("LLM semantic hint ideas for icon choice"), "spark");
  assert.equal(iconKindForText("검증 품질 guard"), "verified");
});

async function patchTemplateTheme(templatePath, colors) {
  const zip = await JSZip.loadAsync(readFileSync(templatePath));
  const themePath = Object.keys(zip.files).find((path) => /^ppt\/theme\/theme\d+\.xml$/.test(path));
  assert.ok(themePath);

  const themeFile = zip.file(themePath);
  assert.ok(themeFile);
  let xml = await themeFile.async("string");
  for (const [name, color] of Object.entries(colors)) {
    xml = xml.replace(new RegExp(`<a:${name}>[\\s\\S]*?<\\/a:${name}>`), `<a:${name}><a:srgbClr val="${color}"/></a:${name}>`);
  }
  zip.file(themePath, xml);
  writeFileSync(templatePath, await zip.generateAsync({ type: "nodebuffer" }));
}

async function patchTemplatePartPlaceholders(templatePath, partPattern, placeholders, partLabel) {
  const zip = await JSZip.loadAsync(readFileSync(templatePath));
  const partPath = Object.keys(zip.files).find((path) => partPattern.test(path));
  assert.ok(partPath, `expected generated template to contain ${partLabel}`);

  const partFile = zip.file(partPath);
  assert.ok(partFile);
  const xml = await partFile.async("string");
  const placeholderXml = placeholders.map((placeholder, index) => {
    const id = 8000 + index;
    const x = Math.round(placeholder.x * EMU_PER_INCH);
    const y = Math.round(placeholder.y * EMU_PER_INCH);
    const w = Math.round(placeholder.w * EMU_PER_INCH);
    const h = Math.round(placeholder.h * EMU_PER_INCH);
    const typeAttr = placeholder.type ? ` type="${placeholder.type}"` : "";
    return `
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="${id}" name="${placeholder.name ?? "Template Placeholder"}"/>
          <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
          <p:nvPr><p:ph${typeAttr} idx="${index + 1}"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>
      </p:sp>`;
  }).join("");

  assert.match(xml, /<\/p:spTree>/);
  zip.file(partPath, xml.replace("</p:spTree>", `${placeholderXml}</p:spTree>`));
  writeFileSync(templatePath, await zip.generateAsync({ type: "nodebuffer" }));
}

async function patchTemplatePlaceholders(templatePath, placeholders) {
  await patchTemplatePartPlaceholders(
    templatePath,
    /^ppt\/slideLayouts\/slideLayout\d+\.xml$/,
    placeholders,
    "a slide layout",
  );
}

async function patchTemplateMasterPlaceholders(templatePath, placeholders) {
  await patchTemplatePartPlaceholders(
    templatePath,
    /^ppt\/slideMasters\/slideMaster\d+\.xml$/,
    placeholders,
    "a slide master",
  );
}

async function readPptxThemeXml(pptxPath) {
  const zip = await JSZip.loadAsync(readFileSync(pptxPath));
  const themePath = Object.keys(zip.files).find((path) => /^ppt\/theme\/theme\d+\.xml$/.test(path));
  assert.ok(themePath);
  const themeFile = zip.file(themePath);
  assert.ok(themeFile);
  return themeFile.async("string");
}

async function zipTextByPath(pptxPath, path) {
  const zip = await JSZip.loadAsync(readFileSync(pptxPath));
  const file = zip.file(path);
  assert.ok(file, `missing ${path}`);
  return file.async("string");
}

async function zipPaths(pptxPath) {
  const zip = await JSZip.loadAsync(readFileSync(pptxPath));
  return Object.keys(zip.files).sort();
}

const sampleDeck = {
  presentation: {
    version: "1.0",
    meta: { title: "Korean README", language: "ko" },
    outline: [],
    assets: [],
    diagnostics: [],
    slides: [
      {
        id: "slide-1",
        index: 0,
        role: "content",
        title: "핵심 철학",
        headingPath: ["mdpresent", "핵심 철학"],
        source: {},
        intent: "list",
        tags: [],
        blocks: [
          {
            id: "list-1",
            type: "bulletList",
            items: [
              "Markdown은 원본 문서다.",
              "분할은 heading + density로 한다.",
              "레이아웃은 intent + item count로 고른다.",
              "본문 배치는 CLI가 새로 계산한다.",
            ],
          },
        ],
      },
    ],
  },
  layout: {
    version: "1.0",
    slideSize: { width: 13.333, height: 7.5, unit: "in" },
    theme: {
      fontFamily: "Arial",
      backgroundColor: "#FFFFFF",
      textColor: "#111827",
      primaryColor: "#2563EB",
      titleFontSize: 30,
      bodyFontSize: 20,
      captionFontSize: 12,
      minFontSize: 14,
      lineHeight: 1.2,
    },
    diagnostics: [],
    slides: [
      {
        id: "layout-slide-1",
        sourceSlideId: "slide-1",
        index: 0,
        layout: { preset: "grid", columns: 2, rows: 2 },
        background: { color: "#FFFFFF" },
        overflowPolicy: { action: "shrink", minFontSize: 14, maxShrinkSteps: 3 },
        regions: [
          {
            id: "title",
            role: "title",
            blockIds: [],
            x: 0.8,
            y: 0.45,
            w: 11.7,
            h: 0.8,
            zIndex: 10,
            typography: { fontFamily: "Arial", fontSize: 30, fontWeight: "bold", lineHeight: 1.2, minFontSize: 14 },
          },
          {
            id: "item-1",
            role: "item",
            blockIds: ["list-1#0"],
            x: 0.9,
            y: 1.6,
            w: 5.5,
            h: 1.7,
            zIndex: 10,
            typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
          },
          {
            id: "item-2",
            role: "item",
            blockIds: ["list-1#1"],
            x: 6.9,
            y: 1.6,
            w: 5.5,
            h: 1.7,
            zIndex: 10,
            typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
          },
        ],
      },
    ],
  },
};

test("renderPptx writes editable text boxes with stable coordinates and no source-neutral item icons", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-"));
  const outPath = join(outDir, "deck.pptx");

  try {
    await renderPptx(sampleDeck, { outPath });

    assert.equal(existsSync(outPath), true);
    assert.ok(readFileSync(outPath).length > 0);

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /핵심 철학/);
    assert.match(xml, /Markdown은 원본 문서다\./);
    assert.equal((xml.match(/txBox="1"/g) ?? []).length, 3);
    assert.match(xml, /<a:off x="731520" y="411480"\/><a:ext cx="10698480" cy="731520"\/>/);
    assert.doesNotMatch(xml, / icon from /);
    assert.doesNotMatch(xml, /simple-icons|tabler-icons|svgrepo/);
    const firstItemShape = shapeXmlContainingText(xml, "Markdown은 원본 문서다.");
    const firstItemTransform = shapeTransform(firstItemShape);
    assert.ok(firstItemTransform.x < 1.35);
    assert.ok(firstItemTransform.h >= 0.42);
    assert.match(xml, /<a:bodyPr[^>]*wrap="square"/);
    assert.match(xml, /<a:normAutofit\/>/);
    assert.match(xml, /<a:bodyPr[^>]*anchor="ctr"/);
    assert.match(xml, /lIns="0" tIns="25400" rIns="25400" bIns="0"/);
    assert.match(xml, /<a:pPr[^>]*algn="ctr"/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx returns a stable MDPR object map for future PowerPoint selection bridges", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-object-map-"));
  const outPath = join(outDir, "deck.pptx");

  try {
    const result = await renderPptx(sampleDeck, { outPath });
    assert.ok(Array.isArray(result.objectMap));
    assert.ok(result.objectMap.length > 0);
    assert.ok(result.objectMap.some((entry) => entry.slideId === "slide-1" && entry.regionId === "title"));
    assert.ok(result.objectMap.some((entry) => entry.blockIds.some((blockId) => blockId.startsWith("list-1")) && entry.objectKind === "native-text"));
    assert.ok(result.objectMap.every((entry) => entry.shapeName.startsWith("mdpr:")));
    assert.ok(result.objectMap.every((entry) => entry.editable === true));

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");
    const titleEntry = result.objectMap.find((entry) => entry.slideId === "slide-1" && entry.regionId === "title");
    assert.ok(titleEntry);
    assert.match(xml, new RegExp(`name="${escapeRegExp(titleEntry.shapeName)}"`));
    assert.doesNotMatch(xml, /name="Text \d+"/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx gives wrapped item text enough height to avoid PowerPoint overlap", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-wrapped-item-height-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].blocks = [
    {
      id: "list-1",
      type: "bulletList",
      items: ["MDPR is the main presentation runtime."],
    },
  ];
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    {
      id: "item-1",
      role: "item",
      blockIds: ["list-1#0"],
      x: 0.9,
      y: 1.6,
      w: 5.5,
      h: 1.7,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 22, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "clean" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");
    const textShape = shapeXmlContainingText(xml, "MDPR is the main presentation runtime.");
    const transform = shapeTransform(textShape);

    assert.ok(transform.x < 1.35);
    assert.ok(transform.h >= 0.7);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx only enables PowerPoint autofit for shrink overflow policy", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-autofit-policy-"));

  try {
    for (const action of ["shrink", "reflow", "split", "warn", "fail"]) {
      const outPath = join(outDir, `${action}.pptx`);
      const deck = structuredClone(sampleDeck);
      deck.presentation.slides[0].blocks = [
        {
          id: "body-1",
          type: "paragraph",
          text: "This text box should expose whether PowerPoint native autofit is enabled.",
        },
      ];
      deck.layout.slides[0].overflowPolicy = { action, minFontSize: 14, maxShrinkSteps: 3 };
      deck.layout.slides[0].regions = [
        deck.layout.slides[0].regions[0],
        {
          id: "body",
          role: "body",
          blockIds: ["body-1"],
          x: 1,
          y: 1.8,
          w: 5.6,
          h: 1,
          zIndex: 10,
          typography: { fontFamily: "Arial", fontSize: 22, lineHeight: 1.2, minFontSize: 14 },
        },
      ];

      await renderPptx(deck, { outPath, designPreset: "technical" });
      const zip = await JSZip.loadAsync(readFileSync(outPath));
      const xml = await zip.file("ppt/slides/slide1.xml").async("string");
      const textShape = [...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)]
        .map((match) => match[0])
        .find((shape) => shape.includes("This text box should expose")) ?? "";
      assert.ok(textShape);
      if (action === "shrink") assert.match(textShape, /<a:normAutofit\/>/);
      else assert.doesNotMatch(textShape, /<a:normAutofit\/>/);
    }
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx renders item text when a bullet list only contains structured listItems", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-listitems-only-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].blocks = [
    {
      id: "list-1",
      type: "bulletList",
      listItems: [
        { text: "Structured item alpha", level: 0, ordered: false },
        { text: "Structured item beta", level: 0, ordered: false },
      ],
      listKind: "unordered",
    },
  ];

  try {
    await renderPptx(deck, { outPath });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /Structured item alpha/);
    assert.match(xml, /Structured item beta/);
    assert.equal((xml.match(/Structured item/g) ?? []).length, 2);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx does not write round-rectangle adjustment data into odd ellipse badges", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-ellipse-badge-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].blocks = [
    {
      id: "list-1",
      type: "bulletList",
      listItems: [{ text: "First ordered item", level: 0, ordered: true, number: 1 }],
      listKind: "ordered",
    },
  ];
  deck.layout.slides[0].regions = [deck.layout.slides[0].regions[0], deck.layout.slides[0].regions[1]];

  try {
    await renderPptx(deck, { outPath });
    const xml = await zipTextByPath(outPath, "ppt/slides/slide1.xml");
    const badge = [...xml.matchAll(/<p:sp>[^]*?<\/p:sp>/g)]
      .map((match) => match[0])
      .find((shape) => shape.includes('prst="ellipse"') && shape.includes("<a:t>1</a:t>"));

    assert.ok(badge);
    assert.doesNotMatch(badge, /<a:gd name="adj"/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx renders labeled list items with bold label, line break, and indented description", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-labeled-list-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].blocks = [
    {
      id: "list-1",
      type: "bulletList",
      listItems: [
        {
          text: "Constraint: text must stay inside the card",
          label: "Constraint",
          description: "text must stay inside the card",
          level: 0,
          ordered: false,
        },
      ],
      listKind: "unordered",
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "technical" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /Constraint/);
    assert.match(xml, /text must stay inside the card/);
    assert.match(xml, /<a:rPr[^>]*b="1"[\s\S]{0,240}<a:t>Constraint<\/a:t>/);
    assert.match(xml, /Constraint[\s\S]*<a:pPr[^>]*algn="l"[\s\S]*text must stay inside the card/);
    assert.match(xml, /<a:t>  text must stay inside the card<\/a:t>/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx renders plain lists as separate editable text boxes to avoid collapsed line breaks", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-plain-list-lines-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].title = "Agenda";
  deck.presentation.slides[0].blocks = [
    { id: "toc-item-1", type: "listItem", text: "Validation Ring" },
    { id: "toc-item-2", type: "listItem", text: "Readiness Gauge" },
    { id: "toc-item-3", type: "listItem", text: "Connected Strip" },
    { id: "toc-item-4", type: "listItem", text: "Native Bar Baseline" },
  ];
  deck.layout.slides[0].layout = { preset: "title-body" };
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    {
      id: "body",
      role: "body",
      blockIds: ["toc-item-1", "toc-item-2", "toc-item-3", "toc-item-4"],
      x: 0.9,
      y: 1.6,
      w: 8.4,
      h: 3.4,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 22, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "clean" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /Validation Ring/);
    assert.match(xml, /Readiness Gauge/);
    assert.equal((xml.match(/txBox="1"/g) ?? []).length >= 5, true);
    assert.equal((xml.match(/sz="2200"/g) ?? []).length >= 4, true);
    assert.match(xml, /Validation Ring[\s\S]*?<\/p:sp><p:sp>[\s\S]*?Readiness Gauge/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx preserves editable code lines as OOXML line boundaries", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-code-lines-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].title = "Literal markers";
  deck.presentation.slides[0].blocks = [
    {
      id: "code-1",
      type: "code",
      text: "-literal marker must stay code\nㆍliteral bullet must stay code",
    },
  ];
  deck.layout.slides[0].layout = { preset: "code-focus" };
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    {
      id: "code",
      role: "code",
      blockIds: ["code-1"],
      x: 0.9,
      y: 1.55,
      w: 11.5,
      h: 4.9,
      zIndex: 10,
      typography: { fontFamily: "Consolas", fontSize: 18, lineHeight: 1.2, minFontSize: 12 },
    },
  ];

  try {
    await renderPptx(deck, { outPath });
    const xml = await zipTextByPath(outPath, "ppt/slides/slide1.xml");
    const codeShape = shapeXmlContainingText(xml, "-literal marker must stay code");
    assert.ok(codeShape);
    assert.match(codeShape, /-literal marker must stay code[\s\S]*(?:<a:br\/>|<\/a:p>\s*<a:p>)[\s\S]*ㆍliteral bullet must stay code/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx aligns and fits text inside table cells", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-table-fit-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  const rows = [
    ["**Metric**", "*Value*"],
    ["Very long retained label that should stay readable inside one cell", "123"],
    ["Quality", "98%"],
    ["Coverage", "87%"],
    ["Warnings", "2"],
    ["Build", "Pass"],
    ["Visual QA", "OK"],
    ["Export", "Done"],
    ["Review", "Ready"],
  ];
  deck.presentation.slides[0].title = "Table Fit";
  deck.presentation.slides[0].intent = "table";
  deck.presentation.slides[0].blocks = [{ id: "table-1", type: "table", rows }];
  deck.layout.slides[0].layout = { preset: "table-focus" };
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    {
      id: "table",
      role: "table",
      blockIds: ["table-1"],
      x: 1.0,
      y: 1.55,
      w: 11.2,
      h: 2.2,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "executive" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /Metric/);
    assert.doesNotMatch(xml, /\*\*Metric\*\*/);
    assert.doesNotMatch(xml, /\*Value\*/);
    assert.match(xml, /Very long retained label that should stay readable inside one cell/);
    assert.match(xml, /<a:pPr[^>]*algn="ctr"[\s\S]*?<a:t>Metric<\/a:t>/);
    assert.match(xml, /<a:pPr[^>]*algn="l"[\s\S]{0,900}<a:rPr[^>]*b="1"[\s\S]{0,900}<a:t>Very long retained label/);
    assert.match(xml, /<a:pPr[^>]*algn="r"[\s\S]*?<a:t>123<\/a:t>/);
    assert.match(xml, /<a:tcPr[^>]*marL="54864"[^>]*marR="54864"[^>]*marT="36576"[^>]*marB="36576"[^>]*anchor="ctr"/);
    assert.match(xml, /sz="1[4-9]00"/);
    assert.doesNotMatch(xml, /<a:br\/>/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx keeps stressed plain-list row text boxes inside the source region", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-plain-list-bounds-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  const items = Array.from({ length: 10 }, (_, index) => `Compact row ${index + 1}`);
  deck.presentation.slides[0].blocks = [
    {
      id: "list-1",
      type: "bulletList",
      items,
    },
  ];
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    {
      id: "body",
      role: "body",
      blockIds: ["list-1"],
      x: 1,
      y: 1.7,
      w: 4.5,
      h: 1.2,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 18, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "technical" });

    const zip = await JSZip.loadAsync(readFileSync(outPath));
    const xml = await zip.file("ppt/slides/slide1.xml").async("string");
    const regionBottomEmu = Math.round((1.7 + 1.2) * 914400);
    const rowShapes = [...xml.matchAll(/<p:sp>[\s\S]*?<a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>[\s\S]*?<a:t>Compact row \d+<\/a:t>[\s\S]*?<\/p:sp>/g)];

    assert.equal(rowShapes.length, 10);
    for (const match of rowShapes) {
      const y = Number(match[2]);
      const h = Number(match[4]);
      assert.equal(y + h <= regionBottomEmu + 2, true);
    }
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx clamps compact text boxes to the owning region and slide bounds", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-compact-bounds-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].blocks = [
    {
      id: "list-1",
      type: "bulletList",
      items: ["Tiny bounded label"],
    },
  ];
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    {
      id: "item-1",
      role: "item",
      blockIds: ["list-1#0"],
      x: 12.98,
      y: 7.24,
      w: 0.32,
      h: 0.22,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 14, lineHeight: 1.2, minFontSize: 10 },
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "technical" });

    await assertPptxObjectsInsideSlide(outPath);

    const zip = await JSZip.loadAsync(readFileSync(outPath));
    const xml = await zip.file("ppt/slides/slide1.xml").async("string");
    const labelShape = [...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)]
      .map((match) => match[0])
      .find((shape) => shape.includes("<a:t>Tiny bounded label</a:t>"));
    assert.ok(labelShape);
    const xfrm = /<a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(labelShape);
    assert.ok(xfrm);
    const x = Number(xfrm[1]);
    const y = Number(xfrm[2]);
    const w = Number(xfrm[3]);
    const h = Number(xfrm[4]);
    const regionLeft = Math.round(12.98 * EMU_PER_INCH);
    const regionTop = Math.round(7.24 * EMU_PER_INCH);
    const regionRight = Math.round((12.98 + 0.32) * EMU_PER_INCH);
    const regionBottom = Math.round((7.24 + 0.22) * EMU_PER_INCH);
    assert.equal(x >= regionLeft, true, `text x underflow: ${x} < ${regionLeft}`);
    assert.equal(y >= regionTop, true, `text y underflow: ${y} < ${regionTop}`);
    assert.equal(x + w <= regionRight + 3, true, `text x overflow: x=${x} w=${w} right=${x + w} > ${regionRight}`);
    assert.equal(y + h <= regionBottom + 3, true, `text y overflow: y=${y} h=${h} bottom=${y + h} > ${regionBottom}`);
    assert.match(labelShape, /anchor="ctr"/);
    assert.match(labelShape, /<a:pPr[^>]*algn="ctr"/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx avoids hard tab indentation in rich list text boxes", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-indent-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].blocks = [
    {
      id: "list-1",
      type: "bulletList",
      listItems: [
        { text: "Runtime owner: MDPR handles deterministic rendering", label: "Runtime owner", description: "MDPR handles deterministic rendering", ordered: false, level: 0 },
        { text: "Hint owner: semantic grouping only", label: "Hint owner", description: "semantic grouping only", ordered: false, level: 0 },
      ],
      listKind: "unordered",
    },
  ];
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    {
      id: "body",
      role: "body",
      blockIds: ["list-1"],
      x: 0.9,
      y: 1.6,
      w: 8.4,
      h: 3.4,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "executive" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /Runtime owner/);
    assert.match(xml, /MDPR handles deterministic rendering/);
    assert.doesNotMatch(xml, /\t|&#x9;|_x0009_/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("design presets add visual background accents and card surfaces without changing content coordinates", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-design-"));
  const outPath = join(outDir, "deck.pptx");

  try {
    await renderPptx(sampleDeck, { outPath, designPreset: "executive" });
    await assertPptxObjectsInsideSlide(outPath);

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /val="F8FAFC"/);
    assert.match(xml, /val="1D4ED8"/);
    assert.equal((xml.match(/<p:sp>/g) ?? []).length >= 6, true);
    assert.match(xml, /<a:off x="822960" y="1463040"\/><a:ext cx="5029200" cy="1554480"\/>/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("ordinary body prose can render without a visible filled surface", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-open-body-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].title = "Design Presets";
  deck.presentation.slides[0].intent = "standard";
  deck.presentation.slides[0].blocks = [
    {
      id: "paragraph-1",
      type: "paragraph",
      text: "Shared presets apply across PPTX and HTML.",
      lines: ["Shared presets apply across PPTX and HTML."],
      sentences: ["Shared presets apply across PPTX and HTML."],
    },
    {
      id: "paragraph-2",
      type: "paragraph",
      text: "Theme galleries repeat the planned slides for visual QA.",
      lines: ["Theme galleries repeat the planned slides for visual QA."],
      sentences: ["Theme galleries repeat the planned slides for visual QA."],
    },
  ];
  deck.layout.slides[0].layout = { preset: "title-body" };
  deck.layout.slides[0].regions = [
    {
      id: "title",
      role: "title",
      blockIds: [],
      x: 0.8,
      y: 0.5,
      w: 11.7,
      h: 0.8,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 30, fontWeight: "bold", lineHeight: 1.2, minFontSize: 14 },
    },
    {
      id: "body",
      role: "body",
      blockIds: ["paragraph-1", "paragraph-2"],
      x: 1.0,
      y: 1.6,
      w: 11.2,
      h: 4.9,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "executive" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /Shared presets apply across PPTX and HTML/);
    assert.match(xml, /Theme galleries repeat the planned slides/);
    assert.doesNotMatch(xml, /<a:off x="914400" y="1463040"\/><a:ext cx="10241280" cy="4480560"\/>[\s\S]{0,240}<a:prstGeom prst="roundRect"/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("shared presentation palettes can be selected for PPTX output", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-palette-"));
  const outPath = join(outDir, "deck.pptx");

  try {
    await renderPptx(sampleDeck, { outPath, designPreset: "nord" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /val="2E3440"/);
    assert.match(xml, /val="F8F8F8"/);
    assert.match(xml, /val="88C0D0"/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx applies decoration style separately from theme color seed", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-style-color-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.layout.theme.decorationStyle = "glassmorphism";
  deck.layout.theme.colorSeed = "#8A4FFF";
  deck.layout.theme.primaryColor = "#8A4FFF";
  deck.layout.theme.colorCombination = "analogous";

  try {
    await renderPptx(deck, { outPath });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");
    const themeXml = await readPptxThemeXml(outPath);
    const mediaFiles = readdirSync(join(expanded, "ppt", "media"));

    assert.match(xml, /val="8A4FFF"/);
    assert.match(xml, /val="0B1020"/);
    assert.match(xml, /outerShdw/);
    assert.match(xml, /glow/);
    assert.equal(mediaFiles.some((file) => file.endsWith(".svg")), true);
    assert.match(themeXml, /<a:accent1><a:srgbClr val="8A4FFF"\/><\/a:accent1>/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx emits newmorphic and minimalist style surfaces", async () => {
  const cases = [
    {
      style: "newmorphism",
      colorSeed: "#4F6F8F",
      harmony: "analogous",
      expectedBackground: "E9EEF5",
      expectedSvg: /data-mdpr-newmorphism="soft-ui"|newmorphicLift/,
    },
    {
      style: "neomorphism",
      colorSeed: "#5D7FA4",
      harmony: "analogous",
      expectedBackground: "EEF3F8",
      expectedSvg: /data-mdpr-style="neomorphism"[\s\S]*(?:data-mdpr-newmorphism="soft-ui"|newmorphicLift)/,
    },
    {
      style: "minimalism",
      colorSeed: "#111827",
      harmony: "monochromatic",
      expectedBackground: "FFFFFF",
      expectedSvg: /data-mdpr-minimalism-layer="hairline-rule"[\s\S]*data-mdpr-surface="rounded"|data-mdpr-surface="rounded"[\s\S]*data-mdpr-minimalism-layer="hairline-rule"/,
    },
  ];

  for (const item of cases) {
    const outDir = mkdtempSync(join(tmpdir(), `mdpresent-pptx-${item.style}-`));
    const outPath = join(outDir, "deck.pptx");
    const deck = structuredClone(sampleDeck);
    deck.layout.theme.decorationStyle = item.style;
    deck.layout.theme.colorSeed = item.colorSeed;
    deck.layout.theme.primaryColor = item.colorSeed;
    deck.layout.theme.colorCombination = item.harmony;

    try {
      await renderPptx(deck, { outPath });

      const expanded = join(outDir, "expanded");
      execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
      const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");
      const mediaDir = join(expanded, "ppt", "media");
      const svgText = readdirSync(mediaDir)
        .filter((file) => file.endsWith(".svg"))
        .map((file) => readFileSync(join(mediaDir, file), "utf-8"))
        .join("\n");

      assert.match(xml, new RegExp(`val="${item.expectedBackground}"`));
      assert.match(svgText, item.expectedSvg);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }
});

test("SVG surfaces diversify card shape grammar without moving layout regions", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-surface-variants-"));
  const outPath = join(outDir, "surface-variants.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].blocks = [
    { id: "list-1#0", type: "listItem", text: "Method flag: short high-level step" },
    { id: "list-1#1", type: "listItem", text: "Ticket panel: document-like evidence" },
    { id: "list-1#2", type: "listItem", text: "Circle vine: connected semantic marker" },
    { id: "list-1#3", type: "listItem", text: "Two-corner panel: linear grouping" },
  ];
  deck.layout.slides[0].layout = { preset: "grid", columns: 2, rows: 2 };
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    {
      id: "item-1",
      role: "item",
      blockIds: ["list-1#0"],
      x: 0.9,
      y: 1.6,
      w: 5.2,
      h: 1.35,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
    {
      id: "item-2",
      role: "item",
      blockIds: ["list-1#1"],
      x: 6.7,
      y: 1.6,
      w: 5.2,
      h: 1.35,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
    {
      id: "item-3",
      role: "item",
      blockIds: ["list-1#2"],
      x: 0.9,
      y: 3.35,
      w: 5.2,
      h: 1.35,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
    {
      id: "item-4",
      role: "item",
      blockIds: ["list-1#3"],
      x: 6.7,
      y: 3.35,
      w: 5.2,
      h: 1.35,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "technical" });

    const zip = await JSZip.loadAsync(readFileSync(outPath));
    const slideXml = await zip.file("ppt/slides/slide1.xml").async("string");
    const surfaceSvgs = await Promise.all(Object.keys(zip.files)
      .filter((path) => /^ppt\/media\/.*\.svg$/.test(path))
      .map((path) => zip.file(path).async("string")));
    const combinedSvg = surfaceSvgs.join("\n");

    assert.match(slideXml, /Method flag/);
    assert.match(slideXml, /Ticket panel/);
    assert.match(slideXml, /Circle vine/);
    assert.match(slideXml, /Two-corner panel/);
    assert.match(slideXml, /<a:off x="822960" y="1463040"\/><a:ext cx="4754880" cy="1234440"\/>/);
    const itemSurfaceVariants = [...combinedSvg.matchAll(/data-mdpr-surface="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(itemSurfaceVariants.length >= 4, true);
    assert.deepEqual(new Set(itemSurfaceVariants), new Set(["two-corner-right"]));
    assert.doesNotMatch(combinedSvg, /data-mdpr-surface="ticket"/);
    assert.doesNotMatch(combinedSvg, /data-mdpr-surface="circle-vine"/);
    assert.doesNotMatch(combinedSvg, /data-mdpr-surface-accent="circle-vine-(?:dot|line)"/);
    assert.doesNotMatch(combinedSvg, /data-mdpr-surface-accent="flag-drop"/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx renders distinct native decoration grammar for remaining rich styles", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-style-grammar-"));

  try {
    const expectedMarkers = {
      skeuomorphism: [/data-mdpr-skeuomorphism-layer/],
      neomorphism: [/data-mdpr-neomorphism-layer/, /data-mdpr-newmorphism-layer/],
      glassmorphism: [/data-mdpr-glassmorphism-layer/, /data-mdpr-glass-layer/],
      claymorphism: [/data-mdpr-claymorphism-layer/],
      minimalism: [/data-mdpr-minimalism-layer/],
      newmorphism: [/data-mdpr-newmorphism-layer="legacy-floating-relief"/],
      brutalism: [/data-mdpr-brutalism-layer/],
      "liquid-glass": [/data-mdpr-liquid-glass-layer/, /data-mdpr-glass-layer/],
      bentogrid: [/data-mdpr-bentogrid-layer/],
    };
    for (const style of ["skeuomorphism", "neomorphism", "glassmorphism", "claymorphism", "minimalism", "newmorphism", "brutalism", "liquid-glass", "bentogrid"]) {
      const outPath = join(outDir, `${style}.pptx`);
      const deck = structuredClone(sampleDeck);
      deck.layout.theme.decorationStyle = style;
      deck.layout.theme.colorSeed = "#8A4FFF";
      deck.layout.theme.primaryColor = "#8A4FFF";
      deck.layout.theme.colorCombination = "split-complementary";

      await renderPptx(deck, { outPath });

      const expanded = join(outDir, style);
      execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
      const slideDir = join(expanded, "ppt", "slides");
      const xml = readdirSync(slideDir)
        .filter((file) => /^slide\d+\.xml$/.test(file))
        .map((file) => readFileSync(join(slideDir, file), "utf-8"))
        .join("\n");
      const mediaDir = join(expanded, "ppt", "media");
      const svg = existsSync(mediaDir)
        ? readdirSync(mediaDir)
          .filter((file) => file.endsWith(".svg"))
          .map((file) => readFileSync(join(mediaDir, file), "utf-8"))
          .join("\n")
        : "";
      assert.match(svg, new RegExp(`data-mdpr-style="${style}"`));
      for (const marker of expectedMarkers[style] ?? []) assert.match(svg, marker);

      if (style === "glassmorphism" || style === "liquid-glass") {
        assert.match(xml, /outerShdw/);
        assert.match(xml, /glow/);
      }
      if (style === "newmorphism") {
        assert.match(xml, /outerShdw/);
      }
      if (style === "neomorphism") {
        assert.match(xml, /outerShdw/);
      }
      if (style === "skeuomorphism") {
        assert.match(xml, /outerShdw/);
      }
      if (style === "claymorphism") {
        assert.match(xml, /outerShdw/);
      }
      if (style === "minimalism") {
        assert.equal((xml.match(/prst="line"/g) ?? []).length >= 2, true);
      }
      if (style === "brutalism") {
        assert.doesNotMatch(xml, /outerShdw/);
        assert.equal((xml.match(/prst="rect"/g) ?? []).length >= 4, true);
      }
      if (style === "bentogrid") {
        assert.equal((xml.match(/prst="line"/g) ?? []).length >= 4, true);
      }
    }
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx does not duplicate cover titles through empty body regions", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-cover-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].role = "cover";
  deck.presentation.slides[0].title = "mdpresent";
  deck.presentation.slides[0].blocks = [];
  deck.layout.slides[0].layout = { preset: "cover" };
  deck.layout.slides[0].regions = [
    {
      id: "title",
      role: "title",
      blockIds: ["__title:slide-1"],
      x: 1.0,
      y: 2.25,
      w: 11.3,
      h: 1.25,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 44, fontWeight: "bold", lineHeight: 1.2, minFontSize: 14 },
    },
    {
      id: "body",
      role: "body",
      blockIds: [],
      x: 0.9,
      y: 1.6,
      w: 11.5,
      h: 4.9,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "executive" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.equal((xml.match(/mdpresent/g) ?? []).length, 1);
    assert.match(xml, /val="1D4ED8"/);
    assert.doesNotMatch(xml, /<a:off x="822960" y="1463040"\/><a:ext cx="10515600" cy="4480560"\/>/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx can emit one multi-theme gallery PPTX for visual comparison", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-theme-gallery-"));
  const outPath = join(outDir, "theme-gallery.pptx");

  try {
    await renderPptx(sampleDeck, { outPath, themeGalleryPresets: ["executive", "nord"] });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const slideCount = Number(execFileSync("powershell", ["-NoProfile", "-Command", `(Get-ChildItem -LiteralPath '${join(expanded, "ppt", "slides")}' -Filter 'slide*.xml' | Measure-Object).Count`], { encoding: "utf-8" }).trim());
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide2.xml"), "utf-8");

    assert.equal(slideCount, sampleDeck.layout.slides.length * 2);
    assert.match(xml, /val="2E3440"/);
    assert.match(xml, /Theme: nord/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx writes active color combination into PowerPoint document theme", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-theme-colors-"));
  const outPath = join(outDir, "theme-colors.pptx");
  const deck = structuredClone(sampleDeck);
  deck.layout.theme.primaryColor = "#2563EB";
  deck.layout.theme.colorCombination = "complementary";

  try {
    await renderPptx(deck, { outPath, designPreset: "clean" });
    const xml = await readPptxThemeXml(outPath);

    assert.match(xml, /<a:lt1><a:srgbClr val="F8FAFC"\/><\/a:lt1>/);
    assert.match(xml, /<a:dk1><a:srgbClr val="111111"\/><\/a:dk1>/);
    assert.match(xml, /<a:accent1><a:srgbClr val="2563EB"\/><\/a:accent1>/);
    assert.match(xml, /<a:accent2><a:srgbClr val="F0AA11"\/><\/a:accent2>/);
    assert.match(xml, /<a:accent3><a:srgbClr val="31B5EA"\/><\/a:accent3>/);
    assert.match(xml, /<a:accent5><a:srgbClr val="E7B955"\/><\/a:accent5>/);
    assert.match(xml, /<a:accent6><a:srgbClr val="0A3CAA"\/><\/a:accent6>/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx renders chart blocks as native PowerPoint charts with theme colors", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-chart-"));
  const outPath = join(outDir, "chart.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides = [
    {
      id: "slide-chart",
      index: 0,
      role: "content",
      title: "Source Shape Summary",
      headingPath: ["Source Shape Summary"],
      source: {},
      intent: "chart",
      tags: [],
      blocks: [
        {
          id: "chart-1",
          type: "chart",
          text: "Headings: 192, 28, 7",
          chart: {
            kind: "bar",
            labels: ["Docs", "Examples", "Root"],
            series: [{ name: "Headings", values: [192, 28, 7] }],
          },
        },
        {
          id: "table-1",
          type: "table",
          text: "Group | Files | Headings\nDocs | 12 | 192",
          rows: [["Group", "Files", "Headings"], ["Docs", "12", "192"], ["Examples", "6", "28"], ["Root", "3", "7"]],
        },
      ],
    },
  ];
  deck.layout.slides = [
    {
      id: "layout-slide-chart",
      sourceSlideId: "slide-chart",
      index: 0,
      layout: { preset: "chart-table", direction: "horizontal" },
      background: { color: "#FFFFFF" },
      overflowPolicy: { action: "shrink", minFontSize: 14, maxShrinkSteps: 3 },
      regions: [
        { id: "title", role: "title", blockIds: ["__title:slide-chart"], x: 0.8, y: 0.45, w: 11.7, h: 0.8, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 30, fontWeight: "bold", lineHeight: 1.2, minFontSize: 14 } },
        { id: "chart", role: "chart", blockIds: ["chart-1"], x: 0.9, y: 1.7, w: 5.6, h: 3.5, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 16, lineHeight: 1.2, minFontSize: 14 } },
        { id: "table", role: "table", blockIds: ["table-1"], x: 6.85, y: 1.8, w: 5.3, h: 2.2, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 15, lineHeight: 1.2, minFontSize: 14 } },
      ],
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "executive" });
    const zip = await JSZip.loadAsync(readFileSync(outPath));
    const chartPaths = Object.keys(zip.files).filter((path) => /^ppt\/charts\/chart\d+\.xml$/.test(path));
    assert.equal(chartPaths.length, 1);
    const chartXml = await zip.file(chartPaths[0]).async("string");
    assert.match(chartXml, /<c:barChart>/);
    assert.match(chartXml, /<a:srgbClr val="1D4ED8"\/>/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx keeps text tables and charts as native editable PPTX XML objects", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-native-editable-"));
  const outPath = join(outDir, "native-editable.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides = [
    {
      id: "slide-native",
      index: 0,
      role: "content",
      title: "Editable XML Contract",
      headingPath: ["Editable XML Contract"],
      source: {},
      intent: "chart",
      tags: [],
      blocks: [
        {
          id: "body-1",
          type: "paragraph",
          text: "Native text remains editable after PPTX export.",
        },
        {
          id: "table-1",
          type: "table",
          text: "Object | Contract\nText | txBox\nTable | a:tbl",
          rows: [["Object", "Contract"], ["Text", "txBox"], ["Table", "a:tbl"]],
        },
        {
          id: "chart-1",
          type: "chart",
          text: "Editable: 91, 87",
          chart: {
            kind: "bar",
            labels: ["Text", "Table"],
            series: [{ name: "Editable", values: [91, 87] }],
          },
        },
      ],
    },
  ];
  deck.layout.slides = [
    {
      id: "layout-slide-native",
      sourceSlideId: "slide-native",
      index: 0,
      layout: { preset: "chart-table", direction: "horizontal" },
      background: { color: "#FFFFFF" },
      overflowPolicy: { action: "shrink", minFontSize: 14, maxShrinkSteps: 3 },
      regions: [
        { id: "title", role: "title", blockIds: ["__title:slide-native"], x: 0.7, y: 0.45, w: 12, h: 0.75, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 30, fontWeight: "bold", lineHeight: 1.2, minFontSize: 14 } },
        { id: "body", role: "body", blockIds: ["body-1"], x: 0.9, y: 1.55, w: 4.8, h: 1.2, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 16, lineHeight: 1.2, minFontSize: 14 } },
        { id: "table", role: "table", blockIds: ["table-1"], x: 0.9, y: 3.0, w: 4.8, h: 2.0, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 14, lineHeight: 1.2, minFontSize: 12 } },
        { id: "chart", role: "chart", blockIds: ["chart-1"], x: 6.2, y: 1.55, w: 5.9, h: 3.6, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 16, lineHeight: 1.2, minFontSize: 14 } },
      ],
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "plain" });
    const zip = await JSZip.loadAsync(readFileSync(outPath));
    const slideXml = await zip.file("ppt/slides/slide1.xml").async("string");
    const slideRels = await zip.file("ppt/slides/_rels/slide1.xml.rels").async("string");
    const chartPaths = Object.keys(zip.files).filter((path) => /^ppt\/charts\/chart\d+\.xml$/.test(path));

    assert.match(shapeXmlContainingText(slideXml, "Editable XML Contract"), /txBox="1"/);
    assert.match(shapeXmlContainingText(slideXml, "Native text remains editable after PPTX export."), /txBox="1"/);
    assert.match(slideXml, /<a:tbl>/);
    assert.match(slideXml, /<a:t>Object<\/a:t>/);
    assert.match(slideXml, /<a:t>a:tbl<\/a:t>/);
    assert.equal(chartPaths.length, 1);
    assert.match(slideRels, /Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/chart"/);
    assert.match(slideRels, /Target="(?:\.\.\/charts|\/ppt\/charts)\/chart\d+\.xml"/);
    const chartXml = await zip.file(chartPaths[0]).async("string");
    assert.match(chartXml, /<c:barChart>/);
    assert.match(chartXml, /<c:v>Text<\/c:v>/);
    assert.match(chartXml, /<c:v>Editable<\/c:v>/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx renders chart proof objects as editable shapes without native chart parts", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-chart-proof-"));
  const outPath = join(outDir, "chart-proof.pptx");
  const deck = makeChartProofDeck([
    {
      title: "Validation Ring",
      chart: {
        kind: "arc-ring",
        labels: ["Validated", "Remaining"],
        series: [{ name: "Coverage", values: [72, 28] }],
      },
    },
    {
      title: "Readiness Gauge",
      chart: {
        kind: "gauge",
        labels: ["Readiness"],
        series: [{ name: "Score", values: [83] }],
      },
    },
    {
      title: "Connected Strip",
      chart: {
        kind: "connected-strip",
        labels: ["Draft", "Render", "Validate"],
        series: [{ name: "Confidence", values: [20, 68, 92] }],
      },
    },
    {
      title: "Ranked Bars",
      chart: {
        kind: "ranked-bars",
        labels: ["Parser", "Layout", "Renderer"],
        series: [{ name: "Coverage", values: [91, 87, 94] }],
      },
    },
    {
      title: "Metric Dots",
      chart: {
        kind: "metric-dots",
        labels: ["Draft", "Review", "Ship"],
        series: [{ name: "Confidence", values: [20, 68, 92] }],
      },
    },
  ]);

  try {
    await renderPptx(deck, { outPath, designPreset: "clean" });
    const zip = await JSZip.loadAsync(readFileSync(outPath));
    const chartPaths = Object.keys(zip.files).filter((path) => /^ppt\/charts\/chart\d+\.xml$/.test(path));
    assert.equal(chartPaths.length, 0);

    const slideXml = await Promise.all([1, 2, 3, 4, 5].map(async (index) => zip.file(`ppt/slides/slide${index}.xml`).async("string")));
    const combinedXml = slideXml.join("\n");
    const surfaceSvgs = await Promise.all(Object.keys(zip.files)
      .filter((path) => /^ppt\/media\/.*\.svg$/.test(path))
      .map((path) => zip.file(path).async("string")));

    assert.match(slideXml[0], /Validation Ring/);
    assert.match(slideXml[0], /Coverage/);
    assert.match(slideXml[0], /72%/);
    assert.match(slideXml[1], /Readiness Gauge/);
    assert.match(slideXml[1], /83%/);
    assert.match(slideXml[2], /Connected Strip/);
    assert.match(slideXml[2], /Draft/);
    assert.match(slideXml[2], /Validate/);
    assert.match(slideXml[3], /Ranked Bars/);
    assert.match(slideXml[3], /Renderer/);
    assert.match(slideXml[4], /Metric Dots/);
    assert.match(slideXml[4], /Ship/);
    assert.equal((slideXml[0].match(/prst="blockArc"/g) ?? []).length >= 2, true);
    assert.equal((slideXml[0].match(/prst="roundRect"/g) ?? []).length < 12, true);
    assert.equal((combinedXml.match(/prst="ellipse"/g) ?? []).length >= 12, true);
    assert.equal((combinedXml.match(/prst="roundRect"/g) ?? []).length >= 8, true);
    assert.equal(surfaceSvgs.some((svg) => /viewBox="0 0 \d+ \d+"[\s\S]*(?:rx="\d+"|data-mdpr-surface="(?:flag-drop|ticket|circle-vine|notched-corner|two-corner-left|two-corner-right)")/.test(svg)), true);
    assert.equal((combinedXml.match(/prst="line"/g) ?? []).length >= 4, true);
    assert.equal((combinedXml.match(/sz="1[4-9]00"|sz="2[0-9]00"|sz="3[0-9]00"/g) ?? []).length >= 8, true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx preserves a consistent raw scale for metric-dots with out-of-range values", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-metric-dot-value-"));
  const outPath = join(outDir, "metric-dot-value.pptx");
  const deck = makeChartProofDeck([{
    title: "Metric value parity",
    chart: {
      kind: "metric-dots",
      labels: ["Collection", "Grouping", "Fixtures", "Builds"],
      series: [{ name: "Value", values: [100, 107, 10, 20] }],
    },
  }]);

  try {
    await renderPptx(deck, { outPath, designPreset: "clean" });
    const zip = await JSZip.loadAsync(readFileSync(outPath));
    const slideXml = await zip.file("ppt/slides/slide1.xml").async("string");

    assert.match(slideXml, /Collection/);
    assert.match(slideXml, /Grouping/);
    assert.match(slideXml, />100</);
    assert.match(slideXml, />107</);
    assert.match(slideXml, />10</);
    assert.match(slideXml, />20</);
    assert.doesNotMatch(slideXml, />100%</);
    assert.doesNotMatch(slideXml, />10%</);
    assert.doesNotMatch(slideXml, />20%</);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx keeps dense connected-strip proof chart text inside the chart region", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-dense-connected-strip-"));
  const outPath = join(outDir, "dense-connected-strip.pptx");
  const labels = ["Source", "Parse", "Split", "Plan", "Theme", "Render", "Export", "Review"];
  const deck = makeChartProofDeck([
    {
      title: "Dense Connected Strip",
      chart: {
        kind: "connected-strip",
        labels,
        series: [{ name: "Progress", values: [11, 24, 38, 52, 66, 78, 89, 97] }],
      },
    },
  ]);

  try {
    await renderPptx(deck, { outPath, designPreset: "technical" });
    const zip = await JSZip.loadAsync(readFileSync(outPath));
    const xml = await zip.file("ppt/slides/slide1.xml").async("string");
    const region = { x: 1.05, y: 1.55, w: 11.15, h: 4.95 };
    const left = Math.round(region.x * 914400);
    const top = Math.round(region.y * 914400);
    const right = Math.round((region.x + region.w) * 914400);
    const bottom = Math.round((region.y + region.h) * 914400);

    for (const label of labels) {
      const shape = [...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)]
        .map((match) => match[0])
        .find((candidate) => candidate.includes(`<a:t>${label}</a:t>`));
      assert.ok(shape, `missing label shape for ${label}`);
      const xfrm = /<a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(shape);
      assert.ok(xfrm, `missing shape bounds for ${label}`);
      const x = Number(xfrm[1]);
      const y = Number(xfrm[2]);
      const w = Number(xfrm[3]);
      const h = Number(xfrm[4]);
      assert.equal(x >= left, true, `${label} x underflow`);
      assert.equal(y >= top, true, `${label} y underflow`);
      assert.equal(x + w <= right, true, `${label} x overflow`);
      assert.equal(y + h <= bottom, true, `${label} y overflow`);
    }
    assert.equal((xml.match(/prst="line"/g) ?? []).length >= labels.length - 1, true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx renders multiple chart proof blocks in one region instead of text fallback", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-multi-chart-proof-region-"));
  const outPath = join(outDir, "multi-chart-proof-region.pptx");
  const deck = makeChartProofDeck([
    {
      title: "Editable Proof Objects",
      chart: {
        kind: "arc-ring",
        labels: ["Validated", "Remaining"],
        series: [{ name: "Coverage", values: [84, 16] }],
      },
    },
  ]);
  deck.presentation.slides[0].blocks.push({
    id: "chart-proof-extra",
    type: "chart",
    text: "Score: 91",
    chart: {
      kind: "gauge",
      labels: ["Readiness"],
      series: [{ name: "Score", values: [91] }],
    },
  });
  deck.layout.slides[0].regions[1].blockIds.push("chart-proof-extra");

  try {
    await renderPptx(deck, { outPath, designPreset: "technical" });
    const zip = await JSZip.loadAsync(readFileSync(outPath));
    const xml = await zip.file("ppt/slides/slide1.xml").async("string");

    assert.match(xml, /Coverage/);
    assert.match(xml, /84%/);
    assert.match(xml, /Score/);
    assert.match(xml, /91%/);
    assert.equal((xml.match(/prst="blockArc"/g) ?? []).length >= 2, true);
    assert.match(xml, /prst="roundRect"/);
    assert.doesNotMatch(xml, /Coverage: 84, 16Score: 91/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx does not invent icon media for source-neutral text-only slides", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-icon-aside-"));
  const outPath = join(outDir, "icon-aside.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides = [
    {
      id: "slide-design-skill",
      index: 0,
      role: "content",
      title: "Design Skill Boundary",
      headingPath: ["Design Skill Boundary"],
      source: {},
      intent: "standard",
      tags: [],
      blocks: [
        {
          id: "body-1",
          type: "paragraph",
          text: "MDPR owns deterministic slide structure, theme colors, chart rendering, table coherence, and editable PowerPoint output. The skill adds lightweight agent hints only when extra design judgment is useful.",
        },
      ],
    },
  ];
  deck.layout.slides = [
    {
      id: "layout-slide-icon-aside",
      sourceSlideId: "slide-design-skill",
      index: 0,
      layout: { preset: "text-icon-aside" },
      background: { color: "#FFFFFF" },
      overflowPolicy: { action: "shrink", minFontSize: 14, maxShrinkSteps: 3 },
      regions: [
        { id: "title", role: "title", blockIds: ["__title:slide-design-skill"], x: 0.8, y: 0.45, w: 11.7, h: 0.8, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 30, fontWeight: "bold", lineHeight: 1.2, minFontSize: 14 } },
        { id: "body-panel", role: "body", blockIds: ["body-1"], x: 0.9, y: 1.68, w: 7, h: 3.72, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 } },
        { id: "icon-aside", role: "icon", blockIds: [], x: 8.55, y: 2.15, w: 2.42, h: 2.42, zIndex: 5, typography: { fontFamily: "Arial", fontSize: 12, lineHeight: 1.2, minFontSize: 10 } },
      ],
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "clean" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /Design Skill Boundary/);
    assert.match(xml, /MDPR owns deterministic slide structure/);
    assert.doesNotMatch(xml, / icon from /);
    assert.doesNotMatch(xml, /simple-icons/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx selects SVG icons from semantic source families", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-svg-icons-"));
  const outPath = join(outDir, "svg-icons.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides = [
    {
      id: "github-data-flow",
      index: 0,
      role: "content",
      title: "GitHub Data Flow",
      headingPath: ["GitHub Data Flow"],
      source: {},
      intent: "standard",
      tags: [],
      blocks: [{ id: "body-1", type: "paragraph", text: "Icon: github. GitHub repository data flows through the runtime." }],
    },
    {
      id: "database-runtime",
      index: 1,
      role: "content",
      title: "Database Runtime",
      headingPath: ["Database Runtime"],
      source: {},
      intent: "standard",
      tags: [],
      blocks: [{ id: "body-2", type: "paragraph", text: "Icon: database. Database storage evidence stays secondary to the text." }],
    },
  ];
  deck.layout.slides = deck.presentation.slides.map((slide, index) => ({
    id: `layout-${slide.id}`,
    sourceSlideId: slide.id,
    index,
    layout: { preset: "text-icon-aside" },
    background: { color: "#FFFFFF" },
    overflowPolicy: { action: "shrink", minFontSize: 14, maxShrinkSteps: 3 },
    regions: [
      { id: "title", role: "title", blockIds: [`__title:${slide.id}`], x: 0.8, y: 0.45, w: 11.7, h: 0.8, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 30, fontWeight: "bold", lineHeight: 1.2, minFontSize: 14 } },
      { id: "body-panel", role: "body", blockIds: [`body-${index + 1}`], x: 0.9, y: 1.68, w: 7, h: 3.72, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 } },
      { id: "icon-aside", role: "icon", blockIds: [], x: 8.55, y: 2.15, w: 2.42, h: 2.42, zIndex: 5, typography: { fontFamily: "Arial", fontSize: 12, lineHeight: 1.2, minFontSize: 10 } },
    ],
  }));

  try {
    await renderPptx(deck, { outPath, designPreset: "technical" });

    const zip = await JSZip.loadAsync(readFileSync(outPath));
    const svgs = await Promise.all(Object.keys(zip.files)
      .filter((path) => /^ppt\/media\/.*\.svg$/.test(path))
      .map((path) => zip.file(path).async("string")));
    const slideXml = await zip.file("ppt/slides/slide1.xml").async("string");

    assert.equal(svgs.length >= 2, true);
    assert.equal(svgs.some((svg) => svg.includes("C4.422 18.07 3.633 17.7")), true);
    assert.equal(svgs.some((svg) => svg.includes("c4.42 0 8 1.57 8 3.5")), true);
    assert.match(slideXml, /descr="github icon from simple-icons/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx does not replay ordinary template slide images into generated output", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-template-"));
  const templatePath = join(outDir, "template.pptx");
  const logoPath = join(outDir, "logo.png");
  const outPath = join(outDir, "deck.pptx");

  try {
    writeFileSync(logoPath, Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFElEQVR42mP8z8AARLJgwiM3FQAAp5kT+dqQB7EAAAAASUVORK5CYII=",
      "base64",
    ));

    const template = new PptxGenJS();
    template.layout = "LAYOUT_WIDE";
    const slide = template.addSlide();
    slide.addImage({ path: logoPath, x: 0.25, y: 0.2, w: 0.5, h: 0.5 });
    await template.writeFile({ fileName: templatePath });

    await renderPptx(sampleDeck, { outPath, templatePath });

    const zip = await JSZip.loadAsync(readFileSync(outPath));
    const xml = await zip.file("ppt/slides/slide1.xml").async("string");
    const mediaPaths = Object.keys(zip.files).filter((path) => /^ppt\/media\/[^/]+\.(png|jpe?g|gif|webp)$/i.test(path));

    assert.doesNotMatch(xml, /<p:pic>/);
    assert.equal(mediaPaths.length, 0);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx applies template title and body placeholder geometry without changing master parts", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-template-placeholders-"));
  const templatePath = join(outDir, "template.pptx");
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  const titlePlaceholder = { type: "title", name: "Template Title", x: 1.25, y: 0.8, w: 10.5, h: 0.6 };
  const bodyPlaceholder = { type: "body", name: "Template Body", x: 2.1, y: 2.0, w: 8.8, h: 3.1 };

  deck.presentation.slides[0].title = "Template Title Alignment";
  deck.presentation.slides[0].blocks = [{
    id: "body-1",
    type: "paragraph",
    text: "Template body placement follows the master layout placeholder.",
  }];
  deck.layout.slides[0].layout = { preset: "title-body" };
  deck.layout.slides[0].regions = [
    {
      ...deck.layout.slides[0].regions[0],
      x: 0.5,
      y: 0.25,
      w: 12.0,
      h: 0.75,
    },
    {
      id: "body",
      role: "body",
      blockIds: ["body-1"],
      x: 0.75,
      y: 1.4,
      w: 6.0,
      h: 1.8,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    const template = new PptxGenJS();
    template.layout = "LAYOUT_WIDE";
    template.addSlide().addText("Template sample", { x: 1, y: 1, w: 5, h: 0.5 });
    await template.writeFile({ fileName: templatePath });
    await patchTemplatePlaceholders(templatePath, [titlePlaceholder, bodyPlaceholder]);

    const assets = await extractTemplateDesignAssets(templatePath);
    assert.equal(
      assets.placeholders.some((placeholder) =>
        placeholder.role === "title" &&
        sameNumber(placeholder.x, titlePlaceholder.x) &&
        placeholder.sourcePath.includes("/slideLayouts/"),
      ),
      true,
      "expected parser to capture the first inserted title placeholder inside p:spTree",
    );
    assert.equal(
      assets.placeholders.some((placeholder) =>
        placeholder.role === "body" &&
        sameNumber(placeholder.x, bodyPlaceholder.x) &&
        placeholder.sourcePath.includes("/slideLayouts/"),
      ),
      true,
      "expected parser to capture body placeholders from the slide layout",
    );

    await renderPptx(deck, { outPath, templatePath, designPreset: "plain" });

    const zip = await JSZip.loadAsync(readFileSync(outPath));
    const xml = await zip.file("ppt/slides/slide1.xml").async("string");
    const titleShape = shapeXmlContainingText(xml, "Template Title Alignment");
    const bodyShape = shapeXmlContainingText(xml, "Template body placement follows the master layout placeholder.");
    assert.ok(titleShape, "expected rendered title text");
    assert.ok(bodyShape, "expected rendered body text");

    const titleTransform = shapeTransform(titleShape);
    assert.equal(sameNumber(titleTransform.x, titlePlaceholder.x), true);
    assert.equal(sameNumber(titleTransform.y, titlePlaceholder.y), true);
    assert.equal(sameNumber(titleTransform.w, titlePlaceholder.w), true);
    assert.equal(sameNumber(titleTransform.h, titlePlaceholder.h), true);

    const bodyTransform = shapeTransform(bodyShape);
    assert.equal(sameNumber(bodyTransform.x, bodyPlaceholder.x + 0.08), true);
    assert.equal(sameNumber(bodyTransform.y, bodyPlaceholder.y + 0.12), true);
    assert.equal(sameNumber(bodyTransform.w, bodyPlaceholder.w - 0.16), true);
    assert.equal(sameNumber(bodyTransform.h, bodyPlaceholder.h - 0.24), true);
    assert.equal(await zipTextByPath(outPath, "ppt/slideLayouts/slideLayout1.xml"), await zipTextByPath(templatePath, "ppt/slideLayouts/slideLayout1.xml"));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx keeps generated content regions when a template has too few body placeholders", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-template-multi-body-"));
  const templatePath = join(outDir, "template.pptx");
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  const titlePlaceholder = { type: "title", name: "Template Title", x: 1.0, y: 0.6, w: 11.0, h: 0.7 };
  const loneBodyPlaceholder = { type: "body", name: "Only Body Placeholder", x: 3.0, y: 2.0, w: 7.0, h: 3.0 };

  deck.presentation.slides[0].title = "Multiple Body Regions";
  deck.presentation.slides[0].blocks = [
    { id: "body-1", type: "paragraph", text: "First generated region must not collapse." },
    { id: "body-2", type: "paragraph", text: "Second generated region must not collapse." },
  ];
  deck.layout.slides[0].layout = { preset: "comparison" };
  deck.layout.slides[0].regions = [
    { ...deck.layout.slides[0].regions[0], x: 0.5, y: 0.25, w: 12.0, h: 0.75 },
    {
      id: "body-left",
      role: "body",
      blockIds: ["body-1"],
      x: 0.9,
      y: 1.55,
      w: 5.2,
      h: 3.5,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
    {
      id: "body-right",
      role: "body",
      blockIds: ["body-2"],
      x: 7.0,
      y: 1.55,
      w: 5.2,
      h: 3.5,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    const template = new PptxGenJS();
    template.layout = "LAYOUT_WIDE";
    template.addSlide().addText("Template sample", { x: 1, y: 1, w: 5, h: 0.5 });
    await template.writeFile({ fileName: templatePath });
    await patchTemplatePlaceholders(templatePath, [titlePlaceholder, loneBodyPlaceholder]);

    await renderPptx(deck, { outPath, templatePath, designPreset: "plain" });

    const zip = await JSZip.loadAsync(readFileSync(outPath));
    const xml = await zip.file("ppt/slides/slide1.xml").async("string");
    const firstShape = shapeXmlContainingText(xml, "First generated region must not collapse.");
    const secondShape = shapeXmlContainingText(xml, "Second generated region must not collapse.");
    assert.ok(firstShape, "expected first body text");
    assert.ok(secondShape, "expected second body text");

    const firstTransform = shapeTransform(firstShape);
    const secondTransform = shapeTransform(secondShape);
    assert.equal(sameNumber(firstTransform.x, 0.9 + 0.08), true);
    assert.equal(sameNumber(secondTransform.x, 7.0 + 0.08), true);
    assert.equal(sameNumber(firstTransform.x, loneBodyPlaceholder.x + 0.08), false);
    assert.equal(sameNumber(secondTransform.x, loneBodyPlaceholder.x + 0.08), false);
    assert.equal(sameNumber(firstTransform.x, secondTransform.x), false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx prefers slide layout placeholders over slide master placeholders", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-template-layout-priority-"));
  const templatePath = join(outDir, "template.pptx");
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  const masterTitle = { type: "title", name: "Master Title", x: 0.4, y: 0.3, w: 12.1, h: 0.6 };
  const masterBody = { type: "body", name: "Master Body", x: 0.7, y: 1.3, w: 5.5, h: 4.2 };
  const layoutTitle = { type: "title", name: "Layout Title", x: 1.4, y: 0.75, w: 10.0, h: 0.65 };
  const layoutBody = { type: "body", name: "Layout Body", x: 2.2, y: 2.1, w: 8.0, h: 2.8 };

  deck.presentation.slides[0].title = "Layout Placeholder Priority";
  deck.presentation.slides[0].blocks = [{ id: "body-1", type: "paragraph", text: "Layout placeholders should win over master placeholders." }];
  deck.layout.slides[0].layout = { preset: "title-body" };
  deck.layout.slides[0].regions = [
    { ...deck.layout.slides[0].regions[0], x: 0.6, y: 0.25, w: 11.8, h: 0.8 },
    {
      id: "body",
      role: "body",
      blockIds: ["body-1"],
      x: 0.8,
      y: 1.3,
      w: 6.5,
      h: 2.0,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    const template = new PptxGenJS();
    template.layout = "LAYOUT_WIDE";
    template.addSlide().addText("Template sample", { x: 1, y: 1, w: 5, h: 0.5 });
    await template.writeFile({ fileName: templatePath });
    await patchTemplateMasterPlaceholders(templatePath, [masterTitle, masterBody]);
    await patchTemplatePlaceholders(templatePath, [layoutTitle, layoutBody]);

    await renderPptx(deck, { outPath, templatePath, designPreset: "plain" });

    const zip = await JSZip.loadAsync(readFileSync(outPath));
    const xml = await zip.file("ppt/slides/slide1.xml").async("string");
    const titleTransform = shapeTransform(shapeXmlContainingText(xml, "Layout Placeholder Priority"));
    const bodyTransform = shapeTransform(shapeXmlContainingText(xml, "Layout placeholders should win over master placeholders."));

    assert.equal(sameNumber(titleTransform.x, layoutTitle.x), true);
    assert.equal(sameNumber(titleTransform.y, layoutTitle.y), true);
    assert.equal(sameNumber(bodyTransform.x, layoutBody.x + 0.08), true);
    assert.equal(sameNumber(bodyTransform.y, layoutBody.y + 0.12), true);
    assert.equal(sameNumber(titleTransform.x, masterTitle.x), false);
    assert.equal(sameNumber(bodyTransform.x, masterBody.x + 0.08), false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx keeps Markdown images inside their surfaced region safe frame", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-image-safe-"));
  const imagePath = join(outDir, "preview.png");
  const outPath = join(outDir, "deck.pptx");
  const region = { id: "image-1", role: "image", blockIds: ["image-1"], x: 1.0, y: 1.65, w: 4.0, h: 2.0, zIndex: 10 };
  const inset = 0.07;
  const deck = {
    presentation: {
      version: "1.0",
      meta: { title: "Image Safe Frame" },
      outline: [],
      assets: [],
      diagnostics: [],
      slides: [{
        id: "slide-image",
        index: 0,
        role: "content",
        title: "Image Safe Frame",
        headingPath: ["Image Safe Frame"],
        source: {},
        intent: "image",
        tags: [],
        blocks: [{ id: "image-1", type: "image", src: imagePath, alt: "safe image" }],
      }],
    },
    layout: {
      version: "1.0",
      slideSize: { width: 13.333, height: 7.5, unit: "in" },
      theme: {
        fontFamily: "Arial",
        backgroundColor: "#FFFFFF",
        textColor: "#111827",
        primaryColor: "#2563EB",
        titleFontSize: 30,
        bodyFontSize: 20,
        captionFontSize: 12,
        minFontSize: 14,
        lineHeight: 1.2,
      },
      diagnostics: [],
      slides: [{
        id: "layout-image",
        sourceSlideId: "slide-image",
        index: 0,
        layout: { preset: "image-focus" },
        background: { color: "#FFFFFF" },
        overflowPolicy: { action: "shrink", minFontSize: 14, maxShrinkSteps: 3 },
        regions: [
          { id: "title", role: "title", blockIds: ["__title:slide-image"], x: 0.8, y: 0.45, w: 11.7, h: 0.8, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 30, fontWeight: "bold", lineHeight: 1.2, minFontSize: 14 } },
          region,
        ],
      }],
    },
  };

  try {
    writeFileSync(imagePath, Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAABQAAAAMCAYAAABiDJ37AAAAI0lEQVR42mP8z8Dwn4GKgImBjoEJRh1MDRgYGBgAAJ1CDxN5CHiFAAAAAElFTkSuQmCC",
      "base64",
    ));

    await renderPptx(deck, { outPath, designPreset: "glassmorphism" });
    await assertPptxObjectsInsideSlide(outPath);

    const zip = await JSZip.loadAsync(readFileSync(outPath));
    const xml = await zip.file("ppt/slides/slide1.xml").async("string");
    const safeFrame = {
      left: Math.round((region.x + inset) * EMU_PER_INCH),
      top: Math.round((region.y + inset) * EMU_PER_INCH),
      right: Math.round((region.x + region.w - inset) * EMU_PER_INCH),
      bottom: Math.round((region.y + region.h - inset) * EMU_PER_INCH),
    };
    const pictureTransforms = [...xml.matchAll(/<p:pic\b[\s\S]*?<a:off x="(-?\d+)" y="(-?\d+)"\/>\s*<a:ext cx="(-?\d+)" cy="(-?\d+)"\/>[\s\S]*?<\/p:pic>/g)]
      .map((match) => ({ xml: match[0], values: match.slice(1, 5).map(Number) }));
    const markdownPicture = pictureTransforms.find((picture) => picture.xml.includes("mdpr:slide-image:image-1:image-1"));
    assert.ok(markdownPicture, "expected Markdown image picture");

    const [x, y, w, h] = markdownPicture.values;
    assert.equal(x >= safeFrame.left - 3, true);
    assert.equal(y >= safeFrame.top - 3, true);
    assert.equal(x + w <= safeFrame.right + 3, true);
    assert.equal(y + h <= safeFrame.bottom + 3, true);
    assert.equal(Math.abs((w / h) - (20 / 12)) < 0.02, true, `image aspect ratio distorted: ${w / h}`);
    assert.doesNotMatch(markdownPicture.xml, /<a:srcRect/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx preserves Markdown image aspect ratio inside template picture placeholders", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-template-image-placeholder-"));
  const templatePath = join(outDir, "template.pptx");
  const imagePath = join(outDir, "preview.png");
  const outPath = join(outDir, "deck.pptx");
  const imagePlaceholder = { type: "pic", name: "Template Picture", x: 4.0, y: 1.55, w: 4.0, h: 4.0 };
  const inset = 0.07;
  const deck = {
    presentation: {
      version: "1.0",
      meta: { title: "Template Image Placeholder" },
      outline: [],
      assets: [],
      diagnostics: [],
      slides: [{
        id: "slide-image",
        index: 0,
        role: "content",
        title: "Template Image Placeholder",
        headingPath: ["Template Image Placeholder"],
        source: {},
        intent: "image",
        tags: [],
        blocks: [{ id: "image-1", type: "image", src: imagePath, alt: "template safe image" }],
      }],
    },
    layout: {
      version: "1.0",
      slideSize: { width: 13.333, height: 7.5, unit: "in" },
      theme: {
        fontFamily: "Arial",
        backgroundColor: "#FFFFFF",
        textColor: "#111827",
        primaryColor: "#2563EB",
        titleFontSize: 30,
        bodyFontSize: 20,
        captionFontSize: 12,
        minFontSize: 14,
        lineHeight: 1.2,
      },
      diagnostics: [],
      slides: [{
        id: "layout-image",
        sourceSlideId: "slide-image",
        index: 0,
        layout: { preset: "image-focus" },
        background: { color: "#FFFFFF" },
        overflowPolicy: { action: "shrink", minFontSize: 14, maxShrinkSteps: 3 },
        regions: [
          { id: "title", role: "title", blockIds: ["__title:slide-image"], x: 0.8, y: 0.45, w: 11.7, h: 0.8, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 30, fontWeight: "bold", lineHeight: 1.2, minFontSize: 14 } },
          { id: "image-1", role: "image", blockIds: ["image-1"], x: 0.9, y: 1.65, w: 4.5, h: 2.2, zIndex: 10 },
        ],
      }],
    },
  };

  try {
    writeFileSync(imagePath, Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAABQAAAAMCAYAAABiDJ37AAAAI0lEQVR42mP8z8Dwn4GKgImBjoEJRh1MDRgYGBgAAJ1CDxN5CHiFAAAAAElFTkSuQmCC",
      "base64",
    ));

    const template = new PptxGenJS();
    template.layout = "LAYOUT_WIDE";
    template.addSlide().addText("Template sample", { x: 1, y: 1, w: 5, h: 0.5 });
    await template.writeFile({ fileName: templatePath });
    await patchTemplatePlaceholders(templatePath, [imagePlaceholder]);

    await renderPptx(deck, { outPath, templatePath, designPreset: "plain" });
    await assertPptxObjectsInsideSlide(outPath);

    const zip = await JSZip.loadAsync(readFileSync(outPath));
    const xml = await zip.file("ppt/slides/slide1.xml").async("string");
    const markdownPicture = [...xml.matchAll(/<p:pic\b[\s\S]*?<a:off x="(-?\d+)" y="(-?\d+)"\/>\s*<a:ext cx="(-?\d+)" cy="(-?\d+)"\/>[\s\S]*?<\/p:pic>/g)]
      .map((match) => ({ xml: match[0], values: match.slice(1, 5).map(Number) }))
      .find((picture) => picture.xml.includes("mdpr:slide-image:image-1:image-1"));
    assert.ok(markdownPicture, "expected Markdown image picture");

    const [x, y, w, h] = markdownPicture.values;
    const safeFrame = {
      left: Math.round((imagePlaceholder.x + inset) * EMU_PER_INCH),
      top: Math.round((imagePlaceholder.y + inset) * EMU_PER_INCH),
      right: Math.round((imagePlaceholder.x + imagePlaceholder.w - inset) * EMU_PER_INCH),
      bottom: Math.round((imagePlaceholder.y + imagePlaceholder.h - inset) * EMU_PER_INCH),
    };

    assert.equal(x >= safeFrame.left - 3, true);
    assert.equal(y >= safeFrame.top - 3, true);
    assert.equal(x + w <= safeFrame.right + 3, true);
    assert.equal(y + h <= safeFrame.bottom + 3, true);
    assert.equal(Math.abs((w / h) - (20 / 12)) < 0.02, true, `template image aspect ratio distorted: ${w / h}`);
    assert.doesNotMatch(markdownPicture.xml, /<a:srcRect/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx crops explicit cover images around the requested focal point", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-image-cover-"));
  const imagePath = join(outDir, "preview.png");
  const outPath = join(outDir, "deck.pptx");
  const region = { id: "image-1", role: "image", blockIds: ["image-1"], x: 1.0, y: 1.65, w: 4.0, h: 2.0, zIndex: 10 };
  const inset = 0.07;
  const deck = {
    presentation: {
      version: "1.0",
      meta: { title: "Image Cover Crop" },
      outline: [],
      assets: [],
      diagnostics: [],
      slides: [{
        id: "slide-image",
        index: 0,
        role: "content",
        title: "Image Cover Crop",
        headingPath: ["Image Cover Crop"],
        source: {},
        intent: "image",
        tags: [],
        blocks: [{
          id: "image-1",
          type: "image",
          src: imagePath,
          alt: "cover image",
          pandocAttr: { attributes: { imageFit: "cover", focalPoint: "left top" } },
        }],
      }],
    },
    layout: {
      version: "1.0",
      slideSize: { width: 13.333, height: 7.5, unit: "in" },
      theme: {
        fontFamily: "Arial",
        backgroundColor: "#FFFFFF",
        textColor: "#111827",
        primaryColor: "#2563EB",
        titleFontSize: 30,
        bodyFontSize: 20,
        captionFontSize: 12,
        minFontSize: 14,
        lineHeight: 1.2,
      },
      diagnostics: [],
      slides: [{
        id: "layout-image",
        sourceSlideId: "slide-image",
        index: 0,
        layout: { preset: "image-focus" },
        background: { color: "#FFFFFF" },
        overflowPolicy: { action: "shrink", minFontSize: 14, maxShrinkSteps: 3 },
        regions: [
          { id: "title", role: "title", blockIds: ["__title:slide-image"], x: 0.8, y: 0.45, w: 11.7, h: 0.8, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 30, fontWeight: "bold", lineHeight: 1.2, minFontSize: 14 } },
          region,
        ],
      }],
    },
  };

  try {
    writeFileSync(imagePath, Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAABQAAAAMCAYAAABiDJ37AAAAI0lEQVR42mP8z8Dwn4GKgImBjoEJRh1MDRgYGBgAAJ1CDxN5CHiFAAAAAElFTkSuQmCC",
      "base64",
    ));

    await renderPptx(deck, { outPath, designPreset: "glassmorphism" });

    const zip = await JSZip.loadAsync(readFileSync(outPath));
    const xml = await zip.file("ppt/slides/slide1.xml").async("string");
    const markdownPicture = [...xml.matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/g)]
      .map((match) => match[0])
      .find((picture) => picture.includes("mdpr:slide-image:image-1:image-1"));
    assert.ok(markdownPicture, "expected Markdown image picture");
    const frameAspectRatio = (region.w - inset * 2) / (region.h - inset * 2);
    const expectedBottomCrop = Math.round((1 - 20 / (frameAspectRatio * 12)) * 100000);
    assert.match(markdownPicture, new RegExp(`<a:srcRect l="0" r="0" t="0" b="${expectedBottomCrop}"\\/>`));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("template import records master layout and theme parts as preserved template package evidence", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-template-integrity-"));
  const templatePath = join(outDir, "template.pptx");

  try {
    const template = new PptxGenJS();
    template.layout = "LAYOUT_WIDE";
    template.theme = {
      headFontFace: "Aptos Display",
      bodyFontFace: "Aptos",
      lang: "ko-KR",
    };
    template.addSlide().addText("Template sample", { x: 1, y: 1, w: 5, h: 0.5 });
    await template.writeFile({ fileName: templatePath });

    const integrity = await inspectTemplatePackageIntegrity(templatePath);

    assert.equal(integrity.preservationPolicy, "preserve-template-masters-and-themes-by-default");
    assert.equal(integrity.masterPartPaths.length >= 1, true);
    assert.equal(integrity.layoutPartPaths.length >= 1, true);
    assert.equal(integrity.themePartPaths.length >= 1, true);
    assert.equal(integrity.masterRelationshipPaths.length >= 1, true);
    assert.equal(integrity.layoutRelationshipPaths.length >= 1, true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx preserves template master theme layout OOXML parts in output package", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-template-ooxml-"));
  const outPath = join(outDir, "deck.pptx");

  try {
    assert.equal(existsSync(templateMasterPreservationFixture), true, "template master preservation fixture must be committed");

    await renderPptx(sampleDeck, { outPath, templatePath: templateMasterPreservationFixture, designPreset: "plain" });

    const templatePaths = await zipPaths(templateMasterPreservationFixture);
    const outputPaths = await zipPaths(outPath);
    const requiredParts = [
      "ppt/theme/theme1.xml",
      "ppt/slideMasters/slideMaster1.xml",
      "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      "ppt/slideLayouts/slideLayout1.xml",
      "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    ];

    for (const partPath of requiredParts) {
      assert.ok(templatePaths.includes(partPath), `template missing ${partPath}`);
      assert.ok(outputPaths.includes(partPath), `output missing ${partPath}`);
      assert.equal(await zipTextByPath(outPath, partPath), await zipTextByPath(templateMasterPreservationFixture, partPath), `${partPath} must be copied from template`);
    }

    const presentationRels = await zipTextByPath(outPath, "ppt/_rels/presentation.xml.rels");
    const slideRels = await zipTextByPath(outPath, "ppt/slides/_rels/slide1.xml.rels");
    const templateRasterAssets = templatePaths.filter((path) => /^ppt\/media\/.*\.(png|jpe?g|gif|webp)$/i.test(path));

    assert.match(presentationRels, /Target="slideMasters\/slideMaster1\.xml"/);
    assert.match(slideRels, /Target="\.\.\/slideLayouts\/slideLayout1\.xml"/);
    assert.equal(templateRasterAssets.length, 0, "template preservation fixture must not require raster image assets");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("template import reuses decorative shapes for matching layout types and preserves theme colors", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-template-style-"));
  const templatePath = join(outDir, "template.pptx");
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].intent = "comparison";
  deck.layout.slides[0].layout = { preset: "comparison", columns: 2, direction: "horizontal" };
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    {
      id: "left",
      role: "body",
      blockIds: ["list-1#0"],
      x: 0.9,
      y: 1.7,
      w: 5.4,
      h: 4.8,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
    {
      id: "right",
      role: "body",
      blockIds: ["list-1#1"],
      x: 7.0,
      y: 1.7,
      w: 5.4,
      h: 4.8,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    const template = new PptxGenJS();
    template.layout = "LAYOUT_WIDE";
    const slide = template.addSlide();
    slide.addText("Left example", { x: 0.8, y: 1.5, w: 4.5, h: 0.5 });
    slide.addText("Right example", { x: 7.0, y: 1.5, w: 4.5, h: 0.5 });
    slide.addShape("rect", {
      x: 11.8,
      y: 0,
      w: 0.4,
      h: 7.5,
      fill: { color: "0B5563" },
      line: { color: "0B5563" },
    });
    await template.writeFile({ fileName: templatePath });
    await patchTemplateTheme(templatePath, {
      lt1: "FFF8E7",
      dk1: "1A1A1A",
      accent1: "0B5563",
      accent2: "D97706",
    });

    await renderPptx(deck, { outPath, templatePath, designPreset: "executive" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /val="FFF8E7"/);
    assert.match(xml, /val="0B5563"/);
    assert.match(xml, /val="D97706"/);
    assert.match(xml, /<a:off x="10789920" y="0"\/>\s*<a:ext cx="365760" cy="6858000"\/>[\s\S]{0,420}<a:prstGeom prst="rect"/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("paragraph rendering preserves markdown lines and sentence units as readable line breaks", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-lines-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].blocks = [
    {
      id: "paragraph-1",
      type: "paragraph",
      text: "첫 문장입니다. 둘째 문장입니다. Third sentence.",
      lines: ["첫 문장입니다. 둘째 문장입니다.", "Third sentence."],
      sentences: ["첫 문장입니다.", "둘째 문장입니다.", "Third sentence."],
    },
  ];
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    {
      id: "body",
      role: "body",
      blockIds: ["paragraph-1"],
      x: 0.9,
      y: 1.6,
      w: 5.5,
      h: 3.2,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "plain" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /첫 문장입니다\./);
    assert.match(xml, /둘째 문장입니다\./);
    assert.match(xml, /Third sentence\./);
    assert.equal((xml.match(/<a:br\/>|<a:p\b/g) ?? []).length >= 2, true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx preserves hierarchy and nonoverlapping row bounds for dense Korean prose", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-indented-paragraph-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  const lines = [
    "이 슬라이드는 한국어 문장이 많고, 일부 영어 기술 용어가 섞여 있으며, 단락 들여쓰기를 통해 논리적 종속 관계를 표현한다. 발표 자료에서는 이런 문장이 한 페이지에 많이 들어갈 수 있으므로, MDPR은 원문을 임의로 줄이지 않고도 읽기 가능한 배치를 선택해야 한다.",
    "보조 설명은 본문보다 낮은 계층으로 보여야 한다. 단순히 같은 크기의 텍스트 박스에 이어 붙이면 발표자가 강조하려는 구조가 사라진다.",
    "예외 조건은 더 낮은 계층으로 남겨야 한다. 이 줄은 dense technical prose 프로필을 검증하기 위한 깊은 들여쓰기다.",
  ];
  deck.presentation.slides[0].blocks = [
    {
      id: "paragraph-1",
      type: "paragraph",
      text: lines.join(" "),
      lines,
      lineIndents: [0, 1, 2],
      sentences: lines,
    },
  ];
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    {
      id: "body",
      role: "body",
      blockIds: ["paragraph-1"],
      x: 1.0,
      y: 1.52,
      w: 11.2,
      h: 5.05,
      zIndex: 10,
      typography: { fontFamily: "Pretendard", fontSize: 18, lineHeight: 1.2, minFontSize: 18 },
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "plain" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");
    const textBoxes = [...xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)]
      .map((match) => match[0])
      .filter((shapeXml) => lines.some((line) => shapeXml.includes(line)));

    assert.equal(textBoxes.length, 3);
    const positions = textBoxes.map((shapeXml) => {
      const text = /<a:t>([^<]+)<\/a:t>/.exec(shapeXml)?.[1] ?? "";
      const x = Number(/<a:off x="(-?\d+)"/.exec(shapeXml)?.[1] ?? 0);
      const y = Number(/<a:off x="-?\d+" y="(-?\d+)"/.exec(shapeXml)?.[1] ?? 0);
      const h = Number(/<a:ext cx="-?\d+" cy="(-?\d+)"/.exec(shapeXml)?.[1] ?? 0);
      return { text, x, y, h };
    });
    const base = positions.find((position) => position.text === lines[0]);
    const support = positions.find((position) => position.text === lines[1]);
    const caveat = positions.find((position) => position.text === lines[2]);

    assert.ok(base);
    assert.ok(support);
    assert.ok(caveat);
    assert.equal(support.x > base.x, true);
    assert.equal(caveat.x > support.x, true);
    const minimumGapEmu = 0.05 * EMU_PER_INCH;
    assert.equal(support.y - (base.y + base.h) >= minimumGapEmu, true);
    assert.equal(caveat.y - (support.y + support.h) >= minimumGapEmu, true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx preserves paragraph emphasis while keeping markdown line breaks", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-rich-paragraph-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].blocks = [
    {
      id: "paragraph-1",
      type: "paragraph",
      text: "First bold line. Second italic line.",
      lines: ["First **bold** line.", "Second *italic* line."],
      sentences: ["First bold line.", "Second italic line."],
      inlineRuns: [
        { text: "First " },
        { text: "bold", bold: true },
        { text: " line.\nSecond " },
        { text: "italic", italic: true },
        { text: " line." },
      ],
    },
  ];
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    {
      id: "body",
      role: "body",
      blockIds: ["paragraph-1"],
      x: 0.9,
      y: 1.6,
      w: 5.5,
      h: 3.2,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "plain" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /First/);
    assert.match(xml, /Second/);
    assert.match(xml, /<a:rPr[^>]*b="1"/);
    assert.match(xml, /<a:rPr[^>]*i="1"/);
    assert.equal((xml.match(/<a:br\/>|<a:p\b/g) ?? []).length >= 2, true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx preserves ordered list numbering and inline emphasis in editable text", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-structure-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].blocks = [
    {
      id: "list-1",
      type: "bulletList",
      items: ["Prepare source", "Render deck", "Validate output"],
      listItems: [
        { text: "Prepare source\nUse Markdown", label: "Prepare source", description: "Use Markdown", descriptionRuns: [{ text: "Use Markdown" }], ordered: true, number: 1, level: 0, runs: [{ text: "Prepare " }, { text: "source", bold: true }, { text: "\nUse Markdown" }] },
        { text: "Render deck", ordered: true, number: 2, level: 0, runs: [{ text: "Render " }, { text: "deck", italic: true }] },
        { text: "Validate output", ordered: false, level: 1, runs: [{ text: "Validate output" }] },
      ],
    },
  ];
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    {
      id: "body",
      role: "body",
      blockIds: ["list-1"],
      x: 0.9,
      y: 1.6,
      w: 5.5,
      h: 3.2,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "plain" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /1\. Prepare/);
    assert.match(xml, /Use Markdown/);
    assert.match(xml, /2\. Render/);
    assert.match(xml, /Validate output/);
    assert.doesNotMatch(xml, /•/);
    assert.match(xml, /<a:rPr[^>]*b="1"/);
    assert.match(xml, /<a:rPr[^>]*i="1"/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx adds editable number badges and accent-colored key text for item cards", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-item-badges-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].title = "Workflow";
  deck.presentation.slides[0].blocks = [
    {
      id: "list-1",
      type: "bulletList",
      items: ["Prepare source", "Render deck"],
      listItems: [
        { text: "Prepare source", ordered: true, number: 1, level: 0, runs: [{ text: "Prepare " }, { text: "source", bold: true }] },
        { text: "Render deck", ordered: true, number: 2, level: 0, runs: [{ text: "Render " }, { text: "deck", bold: true }] },
      ],
    },
  ];
  deck.layout.slides[0].layout = { preset: "grid", columns: 2, rows: 1 };
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    { id: "item-1", role: "item", blockIds: ["list-1#0"], x: 0.9, y: 1.7, w: 5.5, h: 1.7, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 } },
    { id: "item-2", role: "item", blockIds: ["list-1#1"], x: 6.9, y: 1.7, w: 5.5, h: 1.7, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 } },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "executive" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, />1</);
    assert.match(xml, />2</);
    assert.match(xml, /Prepare/);
    assert.match(xml, /Render/);
    assert.match(xml, /val="1D4ED8"/);
    assert.equal((xml.match(/prst="ellipse"|prst="roundRect"/g) ?? []).length >= 2, true);
    assert.equal((xml.match(/anchor="ctr"/g) ?? []).length >= 2, true);
    assert.equal((xml.match(/<a:pPr[^>]*algn="ctr"/g) ?? []).length >= 2, true);
    assert.doesNotMatch(xml, /1\. Prepare/);

    const marker = shapeTransform(shapeXmlContainingText(xml, "1"));
    const itemText = shapeTransform(shapeXmlContainingText(xml, "Prepare "));
    const markerCenterY = marker.y + marker.h / 2;
    const itemCenterY = itemText.y + itemText.h / 2;
    assert.equal(Math.abs(markerCenterY - itemCenterY) < 0.01, true);
    assert.equal(itemText.h < 0.75, true, `item text box should be compact and centered, got ${itemText.h}`);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx places foreground decorations above region background surfaces", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-decoration-zorder-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].title = "Layering";
  deck.presentation.slides[0].blocks = [
    {
      id: "list-1",
      type: "bulletList",
      items: ["Alpha", "Beta"],
      listItems: [
        { text: "Alpha", ordered: false, level: 0, runs: [{ text: "Alpha" }] },
        { text: "Beta", ordered: false, level: 0, runs: [{ text: "Beta" }] },
      ],
    },
  ];
  deck.layout.slides[0].layout = { preset: "grid", columns: 2, rows: 1 };
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    { id: "item-1", role: "item", blockIds: ["list-1#0"], x: 0.9, y: 1.7, w: 5.5, h: 1.7, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 } },
    { id: "item-2", role: "item", blockIds: ["list-1#1"], x: 6.9, y: 1.7, w: 5.5, h: 1.7, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 } },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "executive" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");
    const objects = slideObjectsWithTransforms(xml);
    const surface = objects.find((object) =>
      object.tag === "pic"
      && sameNumber(object.x, 0.9)
      && sameNumber(object.y, 1.7)
      && sameNumber(object.w, 5.5)
      && sameNumber(object.h, 1.7)
    );
    const accent = objects.find((object) =>
      object.tag === "sp"
      && sameNumber(object.x, 0.9)
      && sameNumber(object.y, 1.7)
      && sameNumber(object.w, 0.08)
      && sameNumber(object.h, 1.7)
    );
    const text = objects.find((object) => object.xml.includes("<a:t>Alpha</a:t>"));

    assert.ok(surface, "expected an SVG-backed region surface for item-1");
    assert.ok(accent, "expected a foreground accent shape for item-1");
    assert.ok(text, "expected item text for item-1");
    assert.equal(accent.index > surface.index, true, "accent must be created after the background surface so it remains visible");
    assert.equal(text.index > accent.index, true, "content must remain above foreground decorations");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx serializes marker badges with matching shape and text centers", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-marker-centers-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].blocks = [
    {
      id: "list-1",
      type: "bulletList",
      items: ["Alpha", "Beta"],
      listItems: [
        { text: "Alpha", ordered: true, number: 1, level: 0, runs: [{ text: "Alpha" }] },
        { text: "Beta", ordered: true, number: 2, level: 0, runs: [{ text: "Beta" }] },
      ],
    },
  ];
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    { id: "item-1", role: "item", blockIds: ["list-1#0"], x: 0.9, y: 1.7, w: 5.5, h: 1.7, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 } },
    { id: "item-2", role: "item", blockIds: ["list-1#1"], x: 6.9, y: 1.7, w: 5.5, h: 1.7, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 } },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "executive" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");
    const centeredRuns = [...xml.matchAll(/<a:bodyPr[^>]*anchor="ctr"[\s\S]*?<a:pPr[^>]*algn="ctr"[\s\S]*?<a:t>(1|2)<\/a:t>/g)];

    assert.equal(centeredRuns.length, 2);
    for (const marker of ["1", "2"]) {
      const markerIndex = xml.indexOf(`<a:t>${marker}</a:t>`);
      assert.ok(markerIndex > 0);
      const preceding = xml.slice(Math.max(0, markerIndex - 900), markerIndex);
      assert.match(preceding, /<a:bodyPr[^>]*anchor="ctr"/);
      assert.match(preceding, /<a:pPr[^>]*algn="ctr"/);
      const markerShape = shapeXmlContainingText(xml, marker);
      assert.match(markerShape, /<a:prstGeom prst="(?:ellipse|roundRect)"/);
      const markerBox = shapeTransform(markerShape);
      assert.equal(Math.abs(markerBox.w - markerBox.h) < 0.001, true, `marker ${marker} must use a square text-owning shape`);
    }
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx normalizes same-role text to one font size per slide", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-role-fonts-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].blocks = [
    {
      id: "list-1",
      type: "bulletList",
      items: ["Alpha item", "Beta item"],
      listItems: [
        { text: "Alpha item", ordered: false, level: 0, runs: [{ text: "Alpha item" }] },
        { text: "Beta item", ordered: false, level: 0, runs: [{ text: "Beta item" }] },
      ],
    },
  ];
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    { id: "item-1", role: "item", blockIds: ["list-1#0"], x: 0.9, y: 1.7, w: 5.5, h: 1.7, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 24, lineHeight: 1.2, minFontSize: 16 } },
    { id: "item-2", role: "item", blockIds: ["list-1#1"], x: 6.9, y: 1.7, w: 5.5, h: 1.7, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 18, lineHeight: 1.2, minFontSize: 16 } },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "plain" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /Alpha item/);
    assert.match(xml, /Beta item/);
    assert.equal((xml.match(/sz="1800"/g) ?? []).length >= 2, true);
    assert.doesNotMatch(xml, /sz="2400"/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx separates key quote text into a surfaced region with a one-sided accent", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-key-message-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].title = "Decision";
  deck.presentation.slides[0].intent = "quote";
  deck.presentation.slides[0].blocks = [
    { id: "quote-1", type: "quote", text: "Keep the Markdown source authoritative.", inlineRuns: [{ text: "Keep the Markdown source " }, { text: "authoritative", bold: true }, { text: "." }] },
    { id: "paragraph-1", type: "paragraph", text: "Supporting detail stays below." },
  ];
  deck.layout.slides[0].layout = { preset: "key-message" };
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    { id: "key-message", role: "body", blockIds: ["quote-1"], x: 1.0, y: 1.55, w: 11.2, h: 1.45, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 26, fontWeight: "bold", lineHeight: 1.2, minFontSize: 14 } },
    { id: "body", role: "body", blockIds: ["paragraph-1"], x: 1.0, y: 3.35, w: 11.2, h: 2.95, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 20, lineHeight: 1.2, minFontSize: 14 } },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "executive" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /Keep the Markdown source/);
    assert.match(xml, /authoritative/);
    assert.match(xml, /Supporting detail stays below/);
    assert.match(xml, /<a:off x="914400" y="1417320"\/><a:ext cx="10241280" cy="1325880"\/>/);
    assert.match(xml, /<a:off x="1046988" y="1549908"\/><a:ext cx="73152" cy="1060704"\/>/);
    assert.match(xml, /<a:off x="1298448" y="1545336"\/><a:ext cx="9637776" cy="1069848"\/>/);
    assert.match(xml, /<a:bodyPr[^>]*lIns="0"[^>]*rIns="0"[^>]*anchor="ctr"/);
    assert.match(xml, /val="1D4ED8"/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx renders pipeline diagrams as editable nodes and connectors", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-diagram-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.presentation.slides[0].title = "Pipeline";
  deck.presentation.slides[0].intent = "diagram";
  deck.presentation.slides[0].blocks = [
    {
      id: "diagram-1",
      type: "diagram",
      diagram: {
        kind: "pipeline",
        nodes: [
          { id: "node-1", label: "Draft" },
          { id: "node-2", label: "Review" },
          { id: "node-3", label: "Render" },
        ],
        edges: [
          { from: "node-1", to: "node-2" },
          { from: "node-2", to: "node-3" },
        ],
      },
    },
  ];
  deck.layout.slides[0].layout = { preset: "pipeline", direction: "horizontal" };
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    {
      id: "diagram",
      role: "diagram",
      blockIds: ["diagram-1"],
      x: 1.0,
      y: 2.5,
      w: 11.2,
      h: 1.5,
      zIndex: 10,
      typography: { fontFamily: "Arial", fontSize: 18, lineHeight: 1.2, minFontSize: 14 },
    },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "nord" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.match(xml, /Draft/);
    assert.match(xml, /Review/);
    assert.match(xml, /Render/);
    assert.match(xml, />1</);
    assert.match(xml, />2</);
    assert.match(xml, />3</);
    assert.equal((xml.match(/prst="roundRect"/g) ?? []).length >= 3, true);
    assert.equal((xml.match(/prst="ellipse"/g) ?? []).length >= 3, true);
    assert.equal((xml.match(/<a:ln/g) ?? []).length >= 2, true);
    assert.equal(xml.indexOf('prst="line"') < xml.indexOf('prst="roundRect"'), true);
    assert.doesNotMatch(xml, /<a:off x="914400" y="2286000"\/>\s*<a:ext cx="10241280" cy="1371600"\/>[\s\S]{0,420}<a:prstGeom prst="roundRect"/);
    assert.doesNotMatch(xml, /<a:off x="914400" y="2286000"\/>\s*<a:ext cx="10241280" cy="73152"\/>[\s\S]{0,420}<a:prstGeom prst="rect"/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx fits two-word teaser pipeline labels without source shortening", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-teaser-diagram-labels-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = makeDiagramDeck([
    {
      title: "Teaser Pipeline",
      labels: ["Markdown", "Semantic IR", "Layout Grammar", "Theme Tokens", "Editable PPTX"],
    },
  ]);
  deck.layout.slides[0].layout = { preset: "pipeline-one-page" };
  deck.layout.slides[0].regions[1] = {
    id: "diagram",
    role: "diagram",
    blockIds: ["diagram-1"],
    x: 0.62,
    y: 1.12,
    w: 7.42,
    h: 2.48,
    zIndex: 10,
    typography: { fontFamily: "Arial", fontSize: 14, lineHeight: 1.2, minFontSize: 12 },
  };

  try {
    await renderPptx(deck, { outPath, designPreset: "bentogrid" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");
    const labelShape = shapeXmlContainingText(xml, "Layout Grammar");

    assert.ok(labelShape);
    assert.equal((xml.match(/<a:t>Layout Grammar<\/a:t>/g) ?? []).length, 1);
    assert.match(labelShape, /sz="1200"/);
    assert.equal(shapeTransform(labelShape).w >= 1.35, true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx selects vertical, U, reverse-U, and cycle-like graph arrangements for diagrams", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-diagram-arrangements-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = makeDiagramDeck([
    {
      title: "Vertical",
      labels: [
        "Deep Markdown semantic extraction",
        "Presentation intermediate representation normalization",
        "Editable renderer output",
      ],
    },
    {
      title: "U Shape",
      labels: ["Draft", "Parse", "Outline", "Split", "Layout", "Render"],
    },
    {
      title: "Reverse U Shape",
      labels: ["A", "B", "C", "D", "E", "F", "G", "H"],
    },
    {
      title: "Cycle",
      labels: ["Plan", "Render", "Review", "Revise"],
      cycle: true,
    },
  ]);

  try {
    await renderPptx(deck, { outPath, designPreset: "executive" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const verticalXml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");
    const uXml = readFileSync(join(expanded, "ppt", "slides", "slide2.xml"), "utf-8");
    const reverseUXml = readFileSync(join(expanded, "ppt", "slides", "slide3.xml"), "utf-8");
    const cycleXml = readFileSync(join(expanded, "ppt", "slides", "slide4.xml"), "utf-8");

    const diagramXml = [verticalXml, uXml, reverseUXml, cycleXml].join("\n");
    const lineExtents = [
      ...diagramXml.matchAll(/<a:xfrm>[\s\S]{0,320}<a:ext cx="(-?\d+)" cy="(-?\d+)"\/>[\s\S]{0,360}<a:prstGeom prst="line"/g),
    ];

    assert.match(verticalXml, /Presentation intermediate representation normalization/);
    assert.match(verticalXml, /<a:ext cx="\d+" cy="[1-9]\d+"\/>[\s\S]{0,700}prst="line"/);
    assert.match(uXml, /Split/);
    assert.match(uXml, /<a:ext cx="\d+" cy="[1-9]\d+"\/>[\s\S]{0,700}prst="line"/);
    assert.match(reverseUXml, /H/);
    assert.match(reverseUXml, /<a:ext cx="\d+" cy="[1-9]\d+"\/>[\s\S]{0,700}prst="line"/);
    assert.match(cycleXml, /Revise/);
    assert.equal((cycleXml.match(/prst="line"/g) ?? []).length >= 4, true);
    assert.equal(lineExtents.length > 0, true);
    assert.equal(lineExtents.every((match) => Number(match[1]) >= 0 && Number(match[2]) >= 0), true);
    assert.equal(lineExtents.every((match) => Number(match[1]) > 0 || Number(match[2]) > 0), true);
    assert.equal((cycleXml.match(/prst="rect"/g) ?? []).length >= 4, true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("renderPptx decorates pentagon layouts with editable edge accents behind item boxes", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "mdpresent-pptx-pentagon-"));
  const outPath = join(outDir, "deck.pptx");
  const deck = structuredClone(sampleDeck);
  deck.layout.slides[0].layout = { preset: "pentagon", direction: "radial" };
  deck.layout.slides[0].regions = [
    deck.layout.slides[0].regions[0],
    { id: "item-1", role: "item", blockIds: ["list-1#0"], x: 5.1, y: 1.4, w: 3.0, h: 1.2, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 18, lineHeight: 1.2, minFontSize: 14 } },
    { id: "item-2", role: "item", blockIds: ["list-1#1"], x: 8.4, y: 2.8, w: 3.0, h: 1.2, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 18, lineHeight: 1.2, minFontSize: 14 } },
    { id: "item-3", role: "item", blockIds: ["list-1#2"], x: 7.1, y: 5.0, w: 3.0, h: 1.2, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 18, lineHeight: 1.2, minFontSize: 14 } },
    { id: "item-4", role: "item", blockIds: ["list-1#3"], x: 3.2, y: 5.0, w: 3.0, h: 1.2, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 18, lineHeight: 1.2, minFontSize: 14 } },
    { id: "item-5", role: "item", blockIds: ["list-1#0"], x: 1.9, y: 2.8, w: 3.0, h: 1.2, zIndex: 10, typography: { fontFamily: "Arial", fontSize: 18, lineHeight: 1.2, minFontSize: 14 } },
  ];

  try {
    await renderPptx(deck, { outPath, designPreset: "technical" });

    const expanded = join(outDir, "expanded");
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${outPath}' -DestinationPath '${expanded}' -Force`]);
    const xml = readFileSync(join(expanded, "ppt", "slides", "slide1.xml"), "utf-8");

    assert.equal((xml.match(/val="A7F3D0"/g) ?? []).length >= 5, true);
    assert.equal((xml.match(/prst="line"/g) ?? []).length >= 5, true);
    const lineExtents = [
      ...xml.matchAll(/<a:xfrm>[\s\S]{0,320}<a:ext cx="(-?\d+)" cy="(-?\d+)"\/>[\s\S]{0,360}<a:prstGeom prst="line"/g),
    ];
    assert.equal(lineExtents.length >= 5, true);
    assert.equal(lineExtents.every((match) => Number(match[1]) >= 0 && Number(match[2]) >= 0), true);
    assert.equal(lineExtents.every((match) => Number(match[1]) > 0 || Number(match[2]) > 0), true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

function makeDiagramDeck(slides) {
  return {
    presentation: {
      version: "1.0",
      meta: { title: "Diagram Arrangements", language: "en" },
      outline: [],
      assets: [],
      diagnostics: [],
      slides: slides.map((slide, index) => ({
        id: `slide-${index + 1}`,
        index,
        role: "content",
        title: slide.title,
        headingPath: [slide.title],
        source: {},
        intent: "diagram",
        tags: [],
        blocks: [
          {
            id: `diagram-${index + 1}`,
            type: "diagram",
            text: slide.labels.join(" => "),
            diagram: makePipelineDiagram(slide.labels, slide.cycle),
          },
        ],
      })),
    },
    layout: {
      version: "1.0",
      slideSize: sampleDeck.layout.slideSize,
      theme: sampleDeck.layout.theme,
      diagnostics: [],
      slides: slides.map((slide, index) => ({
        id: `layout-slide-${index + 1}`,
        sourceSlideId: `slide-${index + 1}`,
        index,
        layout: { preset: "pipeline", direction: "horizontal" },
        background: { color: "#FFFFFF" },
        overflowPolicy: { action: "shrink", minFontSize: 14, maxShrinkSteps: 3 },
        regions: [
          {
            id: "title",
            role: "title",
            blockIds: [`__title:slide-${index + 1}`],
            x: 0.8,
            y: 0.45,
            w: 11.7,
            h: 0.8,
            zIndex: 10,
            typography: { fontFamily: "Arial", fontSize: 30, fontWeight: "bold", lineHeight: 1.2, minFontSize: 14 },
          },
          {
            id: "diagram",
            role: "diagram",
            blockIds: [`diagram-${index + 1}`],
            x: 1.0,
            y: 1.65,
            w: 11.2,
            h: 4.9,
            zIndex: 10,
            typography: { fontFamily: "Arial", fontSize: 18, lineHeight: 1.2, minFontSize: 14 },
          },
        ],
      })),
    },
  };
}

function makeChartProofDeck(slides) {
  return {
    presentation: {
      version: "1.0",
      meta: { title: "Chart Proof Objects", language: "en" },
      outline: [],
      assets: [],
      diagnostics: [],
      slides: slides.map((slide, index) => ({
        id: `slide-chart-proof-${index + 1}`,
        index,
        role: "content",
        title: slide.title,
        headingPath: [slide.title],
        source: {},
        intent: "chart",
        tags: [],
        blocks: [
          {
            id: `chart-proof-${index + 1}`,
            type: "chart",
            text: slide.chart.series.map((series) => `${series.name}: ${series.values.join(", ")}`).join("\n"),
            chart: slide.chart,
          },
        ],
      })),
    },
    layout: {
      version: "1.0",
      slideSize: sampleDeck.layout.slideSize,
      theme: sampleDeck.layout.theme,
      diagnostics: [],
      slides: slides.map((slide, index) => ({
        id: `layout-chart-proof-${index + 1}`,
        sourceSlideId: `slide-chart-proof-${index + 1}`,
        index,
        layout: { preset: "chart-table", direction: "horizontal" },
        background: { color: "#FFFFFF" },
        overflowPolicy: { action: "shrink", minFontSize: 14, maxShrinkSteps: 3 },
        regions: [
          {
            id: "title",
            role: "title",
            blockIds: [`__title:slide-chart-proof-${index + 1}`],
            x: 0.8,
            y: 0.45,
            w: 11.7,
            h: 0.8,
            zIndex: 10,
            typography: { fontFamily: "Arial", fontSize: 30, fontWeight: "bold", lineHeight: 1.2, minFontSize: 14 },
          },
          {
            id: "chart",
            role: "chart",
            blockIds: [`chart-proof-${index + 1}`],
            x: 1.05,
            y: 1.55,
            w: 11.15,
            h: 4.95,
            zIndex: 10,
            typography: { fontFamily: "Arial", fontSize: 18, lineHeight: 1.2, minFontSize: 14 },
          },
        ],
      })),
    },
  };
}

function makePipelineDiagram(labels, cycle = false) {
  const nodes = labels.map((label, index) => ({ id: `node-${index + 1}`, label }));
  const edges = nodes.slice(0, -1).map((node, index) => ({ from: node.id, to: nodes[index + 1].id }));
  if (cycle && nodes.length > 2) edges.push({ from: nodes[nodes.length - 1].id, to: nodes[0].id });
  return { kind: "pipeline", nodes, edges };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
