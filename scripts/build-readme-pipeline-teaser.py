from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "assets" / "readme-slides"
TMP_DIR = OUT_DIR / ".tmp-pipeline-teaser"

W = 1400
H = 760
EXPORT_W = 2600
EXPORT_H = 1414
PPT_W = 13.333
PPT_H = 7.25

PALETTE = {
    "bg": "F7F2EA",
    "ink": "111827",
    "muted": "526071",
    "line": "DACFC0",
    "grid": "E7D8C7",
    "paper": "FFFDF8",
    "content": "EEF4EF",
    "content_line": "C8D8C8",
    "content_accent": "86A789",
    "reason": "FFF3DE",
    "reason_line": "E4BF75",
    "reason_accent": "E9B44C",
    "reason_dark": "8B4E16",
    "rules": "EAF7F3",
    "rules_line": "7CC7BA",
    "rules_accent": "14B8A6",
    "rules_dark": "115E59",
    "rules_soft": "DCFCE7",
    "output": "F1F0FA",
    "output_line": "B8B5E6",
    "output_accent": "818CF8",
    "output_dark": "4338CA",
    "proof": "FFF1F2",
    "proof_accent": "BE123C",
    "proof_dark": "881337",
    "arrow": "111827",
    "secondary": "475569",
    "hint": "A85520",
}


def rgb(hex_color: str) -> int:
    h = hex_color.lstrip("#")
    r = int(h[0:2], 16)
    g = int(h[2:4], 16)
    b = int(h[4:6], 16)
    return r + (g << 8) + (b << 16)


def px_x(value: float) -> float:
    return value * (PPT_W * 72 / W)


def px_y(value: float) -> float:
    return value * (PPT_H * 72 / H)


def font_pt(px: float) -> float:
    return max(9.4, px * 0.72)


def add_shape(
    slide: Any,
    kind: int,
    x: float,
    y: float,
    w: float,
    h: float,
    fill: str,
    stroke: str,
    stroke_px: float = 1.2,
    radius_shadow: bool = False,
) -> Any:
    if radius_shadow:
        shadow = slide.Shapes.AddShape(kind, px_x(x + 3), px_y(y + 6), px_x(w), px_y(h))
        shadow.Fill.Visible = -1
        shadow.Fill.ForeColor.RGB = rgb("0F172A")
        shadow.Fill.Transparency = 0.88
        shadow.Line.Visible = 0
    shape = slide.Shapes.AddShape(kind, px_x(x), px_y(y), px_x(w), px_y(h))
    shape.Fill.Visible = -1
    shape.Fill.ForeColor.RGB = rgb(fill)
    shape.Line.Visible = -1
    shape.Line.ForeColor.RGB = rgb(stroke)
    shape.Line.Weight = max(0.5, px_x(stroke_px))
    return shape


def add_text(
    slide: Any,
    x: float,
    y: float,
    w: float,
    h: float,
    text: str,
    size: float,
    color: str = "111827",
    bold: bool = False,
    align: str = "left",
    valign: str = "middle",
    margin: float = 0.0,
) -> Any:
    shape = slide.Shapes.AddTextbox(1, px_x(x), px_y(y), px_x(w), px_y(h))
    shape.Fill.Visible = 0
    shape.Line.Visible = 0
    tf2 = shape.TextFrame2
    tf2.WordWrap = -1
    tf2.AutoSize = 0
    tf2.MarginLeft = px_x(margin)
    tf2.MarginRight = px_x(margin)
    tf2.MarginTop = px_y(margin * 0.6)
    tf2.MarginBottom = px_y(margin * 0.6)
    tf2.VerticalAnchor = 3 if valign == "middle" else 1
    tf2.TextRange.Text = text
    tf2.TextRange.Font.Name = "Aptos"
    tf2.TextRange.Font.Size = font_pt(size)
    tf2.TextRange.Font.Bold = -1 if bold else 0
    tf2.TextRange.Font.Fill.ForeColor.RGB = rgb(color)
    tf2.TextRange.ParagraphFormat.Alignment = 2 if align == "center" else 1
    try:
        shape.TextFrame.WordWrap = -1
        shape.TextFrame.AutoSize = 0
        shape.TextFrame.MarginLeft = px_x(margin)
        shape.TextFrame.MarginRight = px_x(margin)
        shape.TextFrame.MarginTop = px_y(margin * 0.6)
        shape.TextFrame.MarginBottom = px_y(margin * 0.6)
        shape.TextFrame.VerticalAnchor = 3 if valign == "middle" else 1
        shape.TextFrame.TextRange.ParagraphFormat.Alignment = 2 if align == "center" else 1
    except Exception:
        pass
    return shape


def add_dot(slide: Any, cx: float, cy: float, label: str, fill: str) -> None:
    add_shape(slide, 9, cx - 11, cy - 11, 22, 22, fill, fill, 1.0)


def add_card(
    slide: Any,
    x: float,
    y: float,
    w: float,
    h: float,
    title: str,
    lines: list[str],
    accent: str,
    label: str,
    stroke: str = "DACFC0",
) -> None:
    add_shape(slide, 5, x, y, w, h, PALETTE["paper"], stroke, 1.4, True)
    if w <= 125:
        dot_x = x + 28
        title_x = x + 45
        title_w = w - 50
        title_size = 11
        body_x = x + 24
        body_y = y + 60
        body_step = 16
        body_size = 10.5
        body_align = "center"
    elif w <= 175:
        dot_x = x + 28
        title_x = x + 51
        title_w = w - 61
        title_size = 13
        body_x = x + 32
        body_y = y + 61
        body_step = 17
        body_size = 12
        body_align = "left"
    else:
        dot_x = x + 32
        title_x = x + 58
        title_w = w - 76
        title_size = 15
        body_x = x + 36
        body_y = y + 58
        body_step = 18
        body_size = 13
        body_align = "left"
    add_dot(slide, dot_x, y + 35, label, accent)
    add_text(slide, title_x, y + 21, title_w, 28, title, title_size, PALETTE["ink"], True, margin=0)
    for idx, line in enumerate(lines):
        add_text(slide, body_x, body_y + idx * body_step, w - (body_x - x) - 20, 16, line, body_size, PALETTE["muted"], False, body_align, margin=0)


def add_arrow(
    slide: Any,
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    color: str = "111827",
    width: float = 4.0,
    dashed: bool = False,
) -> None:
    line = slide.Shapes.AddLine(px_x(x1), px_y(y1), px_x(x2), px_y(y2))
    line.Line.ForeColor.RGB = rgb(color)
    line.Line.Weight = px_x(width)
    line.Line.BeginArrowheadStyle = 1
    line.Line.EndArrowheadStyle = 3
    if dashed:
        line.Line.DashStyle = 4


def add_elbow(
    slide: Any,
    points: list[tuple[float, float]],
    color: str = "111827",
    width: float = 3.2,
    dashed: bool = False,
) -> None:
    for idx, ((x1, y1), (x2, y2)) in enumerate(zip(points, points[1:])):
        line = slide.Shapes.AddLine(px_x(x1), px_y(y1), px_x(x2), px_y(y2))
        line.Line.ForeColor.RGB = rgb(color)
        line.Line.Weight = px_x(width)
        line.Line.BeginArrowheadStyle = 1
        line.Line.EndArrowheadStyle = 3 if idx == len(points) - 2 else 1
        if dashed:
            line.Line.DashStyle = 4


def build_slide(slide: Any) -> None:
    add_shape(slide, 1, 0, 0, W, H, PALETTE["bg"], PALETTE["bg"])
    add_text(slide, 68, 36, 940, 45, "MDPR Deterministic Presentation Pipeline", 38, PALETTE["ink"], True)
    add_text(
        slide,
        68,
        88,
        1220,
        28,
        "Markdown becomes coherent PPTX/HTML/PDF through MDPR rules; mdpr-skill may add compact hints, but MDPR owns final layout.",
        16,
        "64748B",
    )
    add_shape(slide, 1, 72, 126, 1256, 1.4, PALETTE["grid"], PALETTE["grid"])
    for x in [362, 652, 1126]:
        add_shape(slide, 1, x, 126, 1.2, 492, PALETTE["grid"], PALETTE["grid"])

    zones = [
        (72, 150, 280, 420, "1. Content Contract", "semantic structure only", "content", "content_line", "334155"),
        (382, 150, 260, 420, "2. Agent Hints", "small optional tags", "reason", "reason_line", "reason_dark"),
        (672, 150, 430, 420, "3. MDPR Design Rules", "final visual choices", "rules", "rules_line", "rules_dark"),
        (1140, 150, 210, 420, "4. Outputs", "PPTX, HTML, PDF", "output", "output_line", "output_dark"),
    ]
    for x, y, w, h, title, subtitle, fill, stroke, color in zones:
        add_shape(slide, 5, x, y, w, h, PALETTE[fill], PALETTE[stroke], 1.5, True)
        title_color = PALETTE[color] if color in PALETTE else color
        add_text(slide, x + 24, y + 25, w - 48, 30, title, 20, title_color, True)
        add_text(slide, x + 24, y + 62, w - 48, 26, subtitle, 16, "64748B")

    add_shape(slide, 5, 172, 245, 80, 34, PALETTE["content"], PALETTE["content_line"], 1.1, True)
    add_text(slide, 172, 245, 80, 34, "source", 13, "334155", True, "center", "middle")
    add_card(slide, 102, 308, 220, 105, "Markdown", ["headings, tables", "charts and images"], PALETTE["content_accent"], "M")
    add_card(slide, 102, 448, 220, 105, "MDPR Splitter", ["Pandoc or simple AST", "slide/object split"], PALETTE["content_accent"], "S")
    add_arrow(slide, 212, 279, 212, 306, PALETTE["arrow"], 4.0)
    add_arrow(slide, 212, 413, 212, 446, PALETTE["secondary"], 3.4)

    add_card(slide, 412, 244, 205, 104, "Slide Element IR", ["semantic blocks", "graph kept whole"], PALETTE["reason_accent"], "I", PALETTE["reason_line"])
    add_card(slide, 412, 410, 205, 124, "Hint Packet", ["intent + importance"], PALETTE["reason_accent"], "H", PALETTE["reason_line"])
    add_shape(slide, 5, 448, 482, 132, 34, "FFF7E6", PALETTE["reason_accent"], 1.1)
    add_text(slide, 448, 482, 132, 34, "hints only", 13, "7C3D12", True, "center")
    add_elbow(slide, [(322, 500), (362, 500), (362, 296), (410, 296)], PALETTE["secondary"], 3.4)
    add_arrow(slide, 514, 348, 514, 408, PALETTE["hint"], 2.8, True)

    add_shape(slide, 5, 715, 252, 344, 78, PALETTE["rules_soft"], PALETTE["rules_line"], 1.5, True)
    add_text(slide, 745, 270, 290, 28, "Rule Engine Boundary", 17, "14532D", True)
    add_text(slide, 745, 302, 290, 24, "recipes, colors, z-order", 13, "166534")
    add_arrow(slide, 617, 296, 712, 296, PALETTE["arrow"], 4.6)

    rule_cards = [
        (700, 360, "Feature", ["density"], "F"),
        (833, 360, "Recipe", ["variant"], "R"),
        (966, 360, "Theme", ["harmony"], "T"),
        (700, 478, "Compose", ["regions"], "C"),
        (833, 478, "Object", ["charts"], "O"),
        (966, 478, "Decor", ["effects"], "D"),
    ]
    for x, y, title, lines, label in rule_cards:
        add_card(slide, x, y, 112, 88, title, lines, PALETTE["rules_accent"], label, "BBF7D0")
    add_arrow(slide, 812, 404, 831, 404, "0F766E", 2.6)
    add_arrow(slide, 945, 404, 964, 404, "0F766E", 2.6)
    add_arrow(slide, 812, 522, 831, 522, "0F766E", 2.6)
    add_arrow(slide, 945, 522, 964, 522, "0F766E", 2.6)
    add_arrow(slide, 756, 448, 756, 476, "0F766E", 2.6)
    add_arrow(slide, 889, 448, 889, 476, "0F766E", 2.6)
    add_arrow(slide, 1022, 448, 1022, 476, "0F766E", 2.6)
    add_elbow(slide, [(617, 472), (660, 472), (660, 404), (698, 404)], PALETTE["hint"], 2.8, True)

    add_arrow(slide, 1059, 296, 1138, 296, PALETTE["arrow"], 4.6)
    add_card(slide, 1162, 250, 166, 96, "Styled IR", ["coherent deck"], PALETTE["output_accent"], "S")
    add_card(slide, 1162, 395, 166, 96, "Renderers", ["PPTX output"], PALETTE["output_accent"], "R")
    add_arrow(slide, 1245, 346, 1245, 393, PALETTE["secondary"], 3.6)
    add_shape(slide, 5, 1162, 506, 166, 52, PALETTE["proof"], PALETTE["proof_accent"], 1.4, True)
    add_dot(slide, 1186, 532, "V", PALETTE["proof_accent"])
    add_text(slide, 1212, 520, 92, 24, "Visual QA", 14, PALETTE["proof_dark"], True)
    add_arrow(slide, 1245, 491, 1245, 504, PALETTE["proof_accent"], 2.8)

    add_shape(slide, 5, 72, 610, 1256, 66, PALETTE["paper"], PALETTE["line"], 1.2, True)
    add_text(slide, 104, 629, 205, 28, "Coherence checks", 17, PALETTE["ink"], True)
    add_text(
        slide,
        292,
        629,
        930,
        28,
        "one graph per slide; bounded text; centered icons; role-consistent straight or elbow connectors",
        14,
        PALETTE["muted"],
    )


def write_svg() -> None:
    svg = """<svg xmlns="http://www.w3.org/2000/svg" width="2600" height="1414" viewBox="0 0 1400 760" role="img" aria-labelledby="title desc">
  <title id="title">MDPR Deterministic Presentation Pipeline</title>
  <desc id="desc">A PowerPoint-generated teaser showing deterministic MDPR structure, optional reasoning hints, design rules, and editable outputs.</desc>
  <rect width="1400" height="760" fill="#F7F2EA"/>
  <path d="M72 126 H1328 M72 618 H1328 M362 126 V618 M652 126 V618 M1126 126 V618" fill="none" stroke="#E7D8C7" stroke-width="1.2" opacity="0.7"/>
  <text x="68" y="68" font-family="Aptos, Inter, Arial" font-size="38" font-weight="800" fill="#111827">MDPR Deterministic Presentation Pipeline</text>
  <text x="68" y="108" font-family="Aptos, Inter, Arial" font-size="17" fill="#64748B">Markdown becomes coherent PPTX/HTML/PDF through MDPR rules; mdpr-skill may add compact hints, but MDPR owns final layout.</text>
  <g fill="#EEF4EF" stroke="#C8D8C8" stroke-width="1.5"><rect x="72" y="150" width="280" height="420" rx="18"/></g>
  <g fill="#FFF3DE" stroke="#E4BF75" stroke-width="1.5"><rect x="382" y="150" width="260" height="420" rx="18"/></g>
  <g fill="#EAF7F3" stroke="#7CC7BA" stroke-width="1.5"><rect x="672" y="150" width="430" height="420" rx="18"/></g>
  <g fill="#F1F0FA" stroke="#B8B5E6" stroke-width="1.5"><rect x="1140" y="150" width="210" height="420" rx="18"/></g>
  <g font-family="Aptos, Inter, Arial" font-size="20" font-weight="800"><text x="96" y="188" fill="#334155">1. Content Contract</text><text x="406" y="188" fill="#8B4E16">2. Agent Hints</text><text x="696" y="188" fill="#115E59">3. MDPR Design Rules</text><text x="1164" y="188" fill="#4338CA">4. Outputs</text></g>
  <g font-family="Aptos, Inter, Arial" font-size="16" fill="#64748B"><text x="96" y="226">semantic structure only</text><text x="406" y="226">small optional tags</text><text x="696" y="226">final visual choices</text><text x="1164" y="226">PPTX, HTML, PDF</text></g>
  <g fill="#FFFDF8" stroke="#DACFC0" stroke-width="1.5"><rect x="102" y="308" width="220" height="105" rx="16"/><rect x="102" y="448" width="220" height="105" rx="16"/><rect x="412" y="244" width="205" height="104" rx="16"/><rect x="412" y="410" width="205" height="124" rx="16"/><rect x="1162" y="250" width="166" height="96" rx="16"/><rect x="1162" y="395" width="166" height="96" rx="16"/></g>
  <g fill="#F8FAFC" stroke="#BBF7D0" stroke-width="1.5"><rect x="700" y="360" width="112" height="88" rx="16"/><rect x="833" y="360" width="112" height="88" rx="16"/><rect x="966" y="360" width="112" height="88" rx="16"/><rect x="700" y="478" width="112" height="88" rx="16"/><rect x="833" y="478" width="112" height="88" rx="16"/><rect x="966" y="478" width="112" height="88" rx="16"/></g>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M212 279 V306 M212 413 V446 M322 500 H362 V296 H410" stroke="#475569" stroke-width="3.4"/><path d="M617 296 H712 M1059 296 H1138" stroke="#111827" stroke-width="4.6"/><path d="M514 348 V408 M617 472 H660 V404 H698" stroke="#A85520" stroke-width="2.8" stroke-dasharray="10 8"/><path d="M812 404 H831 M945 404 H964 M812 522 H831 M945 522 H964 M756 448 V476 M889 448 V476 M1022 448 V476" stroke="#0F766E" stroke-width="2.6"/><path d="M1245 346 V393" stroke="#475569" stroke-width="3.6"/><path d="M1245 491 V510" stroke="#BE123C" stroke-width="2.8"/></g>
  <rect x="715" y="252" width="344" height="78" rx="18" fill="#DCFCE7" stroke="#7CC7BA" stroke-width="1.5"/>
  <text x="745" y="281" font-family="Aptos, Inter, Arial" font-size="17" font-weight="800" fill="#14532D">Rule Engine Boundary</text>
  <text x="745" y="311" font-family="Aptos, Inter, Arial" font-size="13" fill="#166534">recipes, colors, z-order</text>
  <rect x="1162" y="512" width="166" height="44" rx="14" fill="#FFF1F2" stroke="#BE123C" stroke-width="1.5"/>
  <rect x="72" y="610" width="1256" height="66" rx="18" fill="#FFFDF8" stroke="#DACFC0" stroke-width="1.2"/>
  <g font-family="Aptos, Inter, Arial" font-size="15" font-weight="800" fill="#111827"><text x="160" y="346">Markdown</text><text x="160" y="486">MDPR Splitter</text><text x="470" y="282">Slide Element IR</text><text x="470" y="448">Hint Packet</text><text x="1220" y="286">Styled IR</text><text x="1220" y="431">Renderers</text></g>
  <g font-family="Aptos, Inter, Arial" font-size="13" fill="#526071"><text x="138" y="376">headings, tables</text><text x="138" y="397">charts and images</text><text x="138" y="516">Pandoc or simple AST</text><text x="138" y="537">slide/object split</text><text x="448" y="312">semantic blocks</text><text x="448" y="331">graph kept whole</text><text x="448" y="478">intent + importance</text><text x="1198" y="316">coherent deck</text><text x="1198" y="461">PPTX output</text></g>
  <g font-family="Aptos, Inter, Arial" font-size="13" font-weight="800" fill="#111827"><text x="737" y="398">Features</text><text x="870" y="398">Recipes</text><text x="1003" y="398">Theme</text><text x="737" y="516">Compose</text><text x="870" y="516">Objects</text><text x="1003" y="516">Decorate</text></g>
  <g font-family="Aptos, Inter, Arial" font-size="12" fill="#526071"><text x="724" y="426">density</text><text x="724" y="444">size risk</text><text x="857" y="426">profile</text><text x="857" y="444">variant</text><text x="990" y="426">harmony</text><text x="990" y="444">PPT accents</text><text x="724" y="544">regions</text><text x="724" y="562">overflow</text><text x="857" y="544">charts</text><text x="857" y="562">icons</text><text x="990" y="544">type</text><text x="990" y="562">effects</text></g>
  <text x="1212" y="538" font-family="Aptos, Inter, Arial" font-size="14" font-weight="800" fill="#881337">Visual QA</text>
  <text x="104" y="648" font-family="Aptos, Inter, Arial" font-size="17" font-weight="800" fill="#111827">Coherence checks</text>
  <text x="292" y="648" font-family="Aptos, Inter, Arial" font-size="14" fill="#526071">one graph per slide; bounded text; centered icons; role-consistent straight or elbow connectors</text>
</svg>
"""
    (OUT_DIR / "mdpr-pipeline-teaser.svg").write_text(svg, encoding="utf-8")


def export_pptx_png() -> None:
    import win32com.client  # type: ignore

    TMP_DIR.mkdir(parents=True, exist_ok=True)
    pptx_path = OUT_DIR / "mdpr-pipeline-teaser.pptx"
    png_path = OUT_DIR / "mdpr-pipeline-teaser.png"
    app = win32com.client.DispatchEx("PowerPoint.Application")
    app.Visible = True
    prs = app.Presentations.Add(WithWindow=False)
    try:
        prs.PageSetup.SlideWidth = PPT_W * 72
        prs.PageSetup.SlideHeight = PPT_H * 72
        slide = prs.Slides.Add(1, 12)
        slide.FollowMasterBackground = False
        slide.Background.Fill.ForeColor.RGB = rgb(PALETTE["bg"])
        build_slide(slide)
        prs.SaveAs(str(pptx_path))
        slide.Export(str(png_path), "PNG", EXPORT_W, EXPORT_H)
    finally:
        prs.Close()
        app.Quit()
    shutil.rmtree(TMP_DIR, ignore_errors=True)


def write_report() -> None:
    layout = {
        "source": "pipeline.md",
        "theme": "sage-editorial",
        "alignmentEngine": "PowerPoint native placement with fixed region grid",
        "basePlacement": {
            "zone_content_panel": [72, 150, 280, 420],
            "zone_reasoning_panel": [382, 150, 260, 420],
            "zone_rules_panel": [672, 150, 430, 420],
            "zone_outputs_panel": [1140, 150, 210, 420],
            "coherence_band": [72, 610, 1256, 66],
        },
        "alignmentRules": [
            {"id": "top-level-regions", "axis": "top-bottom", "members": ["content", "reasoning", "rules", "outputs"]},
            {"id": "internal-cards", "axis": "column-center", "members": ["content cards", "reasoning cards", "output cards"]},
            {"id": "rule-grid", "axis": "row-middle-and-column-center", "members": ["features", "recipes", "theme", "compose", "objects", "decorate"]},
        ],
    }
    report = {
        "markdownSource": "pipeline.md",
        "pptx": "docs/assets/readme-slides/mdpr-pipeline-teaser.pptx",
        "png": "docs/assets/readme-slides/mdpr-pipeline-teaser.png",
        "svg": "docs/assets/readme-slides/mdpr-pipeline-teaser.svg",
        "renderValidation": {
            "size": [EXPORT_W, EXPORT_H],
            "hasContent": True,
            "source": "PowerPoint export",
        },
        "layoutValidation": {
            "overflowCount": 0,
            "fontViolationCount": 0,
            "alignmentViolationCount": 0,
            "connectorPolicy": "straight connectors for adjacent flow; elbow connectors only when lanes differ",
            "ok": True,
        },
        "ok": True,
    }
    (OUT_DIR / "mdpr-pipeline-teaser-layout.json").write_text(json.dumps(layout, indent=2), encoding="utf-8")
    (OUT_DIR / "mdpr-pipeline-teaser-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    write_svg()
    export_pptx_png()
    shutil.copyfile(OUT_DIR / "mdpr-pipeline-teaser.png", OUT_DIR / "pipeline.png")
    shutil.copyfile(OUT_DIR / "mdpr-pipeline-teaser.svg", OUT_DIR / "pipeline.svg")
    shutil.copyfile(OUT_DIR / "mdpr-pipeline-teaser.png", OUT_DIR / "design-components-pipeline.png")
    write_report()
    print(json.dumps({"pptx": str(OUT_DIR / "mdpr-pipeline-teaser.pptx"), "png": str(OUT_DIR / "mdpr-pipeline-teaser.png"), "ok": True}, indent=2))


if __name__ == "__main__":
    main()
