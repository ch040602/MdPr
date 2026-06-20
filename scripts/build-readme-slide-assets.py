from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "assets" / "readme-slides"
TMP_DIR = OUT_DIR / ".tmp-readme-previews"
SLIDE_W = 1600
SLIDE_H = 900
PPT_W = 13.333
PPT_H = 7.5

PALETTE = {
    "ink": "111827",
    "muted": "64748B",
    "line": "D8D1C6",
    "paper": "FFFDF8",
    "bg": "F7F2EA",
    "sage": "86A789",
    "sage_dark": "2F6F5E",
    "teal": "14B8A6",
    "amber": "E9B44C",
    "amber_dark": "9A5B16",
    "indigo": "6366F1",
    "violet": "8B7CF6",
    "rose": "BE123C",
    "green_soft": "E7F3EA",
    "amber_soft": "FFF2D2",
    "teal_soft": "E4F7F3",
    "violet_soft": "ECEBFF",
    "rose_soft": "FFE9EF",
}


def rgb(hex_color: str) -> int:
    h = hex_color.strip().lstrip("#")
    r = int(h[0:2], 16)
    g = int(h[2:4], 16)
    b = int(h[4:6], 16)
    return r + (g << 8) + (b << 16)


def px_x(value: float) -> float:
    return value * (PPT_W * 72 / SLIDE_W)


def px_y(value: float) -> float:
    return value * (PPT_H * 72 / SLIDE_H)


def font_pt(px: float) -> float:
    return max(9.2, px * 0.72)


def add_shape(
    slide: Any,
    kind: int,
    x: float,
    y: float,
    w: float,
    h: float,
    fill: str,
    stroke: str = "FFFFFF",
    stroke_px: float = 1.4,
    shadow: bool = False,
) -> Any:
    shape = slide.Shapes.AddShape(kind, px_x(x), px_y(y), px_x(w), px_y(h))
    shape.Fill.Visible = -1
    shape.Fill.ForeColor.RGB = rgb(fill)
    shape.Line.Visible = -1
    shape.Line.ForeColor.RGB = rgb(stroke)
    shape.Line.Weight = max(0.5, px_x(stroke_px))
    if shadow:
        shape.Shadow.Visible = -1
        shape.Shadow.Transparency = 0.86
        shape.Shadow.Blur = 3
        shape.Shadow.OffsetX = 1.1
        shape.Shadow.OffsetY = 2.0
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
    margin: float = 2.0,
) -> Any:
    shape = slide.Shapes.AddTextbox(1, px_x(x), px_y(y), px_x(w), px_y(h))
    shape.Fill.Visible = 0
    shape.Line.Visible = 0
    tf2 = shape.TextFrame2
    tf2.WordWrap = -1
    tf2.AutoSize = 0
    tf2.MarginLeft = px_x(margin)
    tf2.MarginRight = px_x(margin)
    tf2.MarginTop = px_y(margin * 0.5)
    tf2.MarginBottom = px_y(margin * 0.5)
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
        shape.TextFrame.MarginTop = px_y(margin * 0.5)
        shape.TextFrame.MarginBottom = px_y(margin * 0.5)
        shape.TextFrame.VerticalAnchor = 3 if valign == "middle" else 1
        shape.TextFrame.TextRange.ParagraphFormat.Alignment = 2 if align == "center" else 1
    except Exception:
        pass
    return shape


def add_icon(slide: Any, cx: float, cy: float, r: float, fill: str, label: str) -> None:
    add_shape(slide, 9, cx - r, cy - r, r * 2, r * 2, fill, "FFFFFF", 1.2, False)
    add_text(slide, cx - r, cy - r, r * 2, r * 2, label, r * 1.05, "FFFFFF", True, "center", "middle", 0.0)


def add_card(
    slide: Any,
    x: float,
    y: float,
    w: float,
    h: float,
    title: str,
    body: str,
    accent: str,
    fill: str = "paper",
    label: str | None = None,
) -> None:
    add_shape(slide, 5, x, y, w, h, PALETTE[fill], PALETTE["line"], 1.5, True)
    add_icon(slide, x + 34, y + 38, 14, PALETTE[accent], label or title[:1].upper())
    add_text(slide, x + 58, y + 22, w - 78, 34, title, 20, PALETTE["ink"], True, margin=0.0)
    add_text(slide, x + 30, y + 70, w - 60, max(24, h - 80), body, 16, PALETTE["muted"], False, valign="top")


def add_arrow(slide: Any, x1: float, y1: float, x2: float, y2: float, color: str = "111827", width: float = 4.4) -> None:
    line = slide.Shapes.AddLine(px_x(x1), px_y(y1), px_x(x2), px_y(y2))
    line.Line.ForeColor.RGB = rgb(color)
    line.Line.Weight = px_x(width)
    line.Line.BeginArrowheadStyle = 1
    line.Line.EndArrowheadStyle = 3


def add_elbow(slide: Any, points: list[tuple[float, float]], color: str = "111827", width: float = 4.0) -> None:
    for idx, ((x1, y1), (x2, y2)) in enumerate(zip(points, points[1:])):
        line = slide.Shapes.AddLine(px_x(x1), px_y(y1), px_x(x2), px_y(y2))
        line.Line.ForeColor.RGB = rgb(color)
        line.Line.Weight = px_x(width)
        line.Line.BeginArrowheadStyle = 1
        line.Line.EndArrowheadStyle = 3 if idx == len(points) - 2 else 1


def prepare_slide(prs: Any) -> Any:
    slide = prs.Slides.Add(prs.Slides.Count + 1, 12)
    slide.FollowMasterBackground = False
    slide.Background.Fill.ForeColor.RGB = rgb(PALETTE["bg"])
    return slide


def build_cover(slide: Any) -> None:
    add_shape(slide, 1, 0, 0, SLIDE_W, SLIDE_H, PALETTE["bg"], PALETTE["bg"])
    add_text(slide, 96, 92, 620, 86, "mdpresent", 66, PALETTE["ink"], True, margin=0)
    add_text(slide, 100, 182, 720, 44, "Markdown to coherent editable decks", 28, PALETTE["muted"], margin=0)
    add_shape(slide, 1, 96, 258, 170, 10, PALETTE["teal"], PALETTE["teal"])
    add_shape(slide, 5, 920, 86, 520, 190, PALETTE["paper"], PALETTE["line"], 1.5, True)
    add_text(slide, 958, 118, 450, 34, "Deterministic by default", 25, PALETTE["ink"], True, margin=0)
    add_text(slide, 958, 166, 430, 64, "Themes, object recipes, layout rules, and visual checks are encoded in MDPR rather than improvised per deck.", 19, PALETTE["muted"], margin=0, valign="top")
    labels = [("Markdown", "M", "sage"), ("IR", "I", "amber"), ("Layout", "L", "teal"), ("Render", "R", "violet")]
    for idx, (title, label, accent) in enumerate(labels):
        x = 130 + idx * 330
        add_card(slide, x, 390, 250, 130, title, "bounded semantic contract", accent, label=label)
        if idx < len(labels) - 1:
            add_arrow(slide, x + 260, 455, x + 315, 455, PALETTE["ink"], 4.2)
    add_shape(slide, 5, 130, 640, 1110, 116, PALETTE["paper"], PALETTE["line"], 1.4, True)
    add_text(slide, 170, 674, 220, 34, "Outputs", 24, PALETTE["ink"], True, margin=0)
    add_text(slide, 400, 670, 690, 44, "PPTX / HTML / PDF with consistent theme tokens and editable objects", 22, PALETTE["muted"], margin=0)
    add_shape(slide, 5, 1240, 640, 210, 116, PALETTE["rose_soft"], PALETTE["rose"], 1.8, False)
    add_icon(slide, 1278, 698, 19, PALETTE["rose"], "V")
    add_text(slide, 1310, 675, 106, 46, "visual\nQA", 20, PALETTE["rose"], True, "center", "middle", 0)


def build_pipeline(slide: Any) -> None:
    add_shape(slide, 1, 0, 0, SLIDE_W, SLIDE_H, PALETTE["bg"], PALETTE["bg"])
    add_text(slide, 86, 74, 720, 70, "Pipeline Diagram", 54, PALETTE["ink"], True, margin=0)
    add_text(slide, 90, 148, 820, 38, "Rule-based structure first; optional agent hints only add compact intent signals.", 23, PALETTE["muted"], margin=0)
    zones = [
        (92, 246, 286, 380, "1. Content", "green_soft", "sage_dark"),
        (430, 246, 286, 380, "2. Reasoning", "amber_soft", "amber_dark"),
        (768, 246, 410, 380, "3. Rules", "teal_soft", "sage_dark"),
        (1230, 246, 286, 380, "4. Outputs", "violet_soft", "indigo"),
    ]
    for x, y, w, h, title, fill, color in zones:
        add_shape(slide, 5, x, y, w, h, PALETTE[fill], PALETTE["line"], 1.5, True)
        add_text(slide, x + 28, y + 28, w - 56, 34, title, 25, PALETTE[color] if color in PALETTE else color, True, margin=0)
    add_card(slide, 126, 356, 220, 102, "Markdown", "semantic source", "sage", label="A")
    add_card(slide, 126, 500, 220, 102, "Splitter", "graph kept whole", "sage", label="B")
    add_arrow(slide, 236, 458, 236, 496, PALETTE["ink"], 3.6)
    add_card(slide, 468, 356, 210, 102, "Slide IR", "semantic blocks", "amber", label="C")
    add_card(slide, 468, 500, 210, 102, "Hint Packet", "intent only", "amber", label="D")
    add_elbow(slide, [(346, 551), (405, 551), (405, 407), (460, 407)], PALETTE["ink"], 3.8)
    add_arrow(slide, 573, 458, 573, 496, PALETTE["amber_dark"], 3.1)
    add_shape(slide, 5, 812, 338, 322, 94, PALETTE["teal_soft"], PALETTE["teal"], 1.8, True)
    add_text(slide, 844, 365, 260, 34, "Rule Engine", 24, PALETTE["sage_dark"], True, margin=0)
    small = [
        (812, 476, "Features", "F"),
        (988, 476, "Recipes", "R"),
        (812, 574, "Objects", "O"),
        (988, 574, "Theme", "T"),
    ]
    for x, y, title, label in small:
        add_shape(slide, 5, x, y, 146, 72, PALETTE["paper"], PALETTE["teal"], 1.2, True)
        add_icon(slide, x + 27, y + 36, 12, PALETTE["teal"], label)
        add_text(slide, x + 48, y + 21, 80, 30, title, 16, PALETTE["ink"], True, margin=0)
    add_arrow(slide, 678, 407, 804, 407, PALETTE["ink"], 4.6)
    add_arrow(slide, 1134, 385, 1222, 385, PALETTE["ink"], 4.6)
    add_card(slide, 1264, 356, 210, 102, "Styled IR", "renderer-neutral", "violet", label="E")
    add_card(slide, 1264, 500, 210, 102, "Renderers", "PPTX HTML PDF", "violet", label="F")
    add_arrow(slide, 1369, 458, 1369, 496, PALETTE["ink"], 3.6)
    add_shape(slide, 5, 154, 714, 1250, 74, PALETTE["paper"], PALETTE["line"], 1.2, True)
    add_text(slide, 194, 735, 190, 30, "Alignment rules", 21, PALETTE["ink"], True, margin=0)
    add_text(slide, 404, 733, 850, 34, "centered badges, minimum padding, bounded text boxes, and role-consistent connectors", 20, PALETTE["muted"], margin=0)


def build_semantics(slide: Any) -> None:
    add_shape(slide, 1, 0, 0, SLIDE_W, SLIDE_H, PALETTE["bg"], PALETTE["bg"])
    add_text(slide, 92, 76, 760, 70, "Semantic Blocks", 54, PALETTE["ink"], True, margin=0)
    add_text(slide, 96, 150, 900, 42, "Plain Markdown remains source-of-truth while MDPR maps intent into layout-safe objects.", 23, PALETTE["muted"], margin=0)
    cards = [
        (120, 272, 610, 185, "Lists", "Bullets become aligned groups with consistent badge placement and readable line breaks.", "sage", "A"),
        (860, 272, 610, 185, "Tables", "Numeric rows can be paired with compact charts without splitting a single object across slides.", "teal", "B"),
        (120, 535, 610, 185, "Emphasis", "Bold, italic, and key phrases are preserved with hierarchy-aware type sizes.", "amber", "C"),
        (860, 535, 610, 185, "Diagrams", "Flows use straight or elbow connectors, role-level colors, and visible attachment points.", "violet", "D"),
    ]
    for x, y, w, h, title, body, accent, label in cards:
        add_shape(slide, 5, x, y, w, h, PALETTE["paper"], PALETTE["line"], 1.5, True)
        add_shape(slide, 1, x, y, 12, h, PALETTE[accent], PALETTE[accent])
        add_icon(slide, x + 58, y + 58, 18, PALETTE[accent], label)
        add_text(slide, x + 92, y + 34, w - 126, 42, title, 25, PALETTE["ink"], True, margin=0)
        add_text(slide, x + 58, y + 92, w - 96, 62, body, 20, PALETTE["muted"], False, valign="top")


def build_decorations(slide: Any) -> None:
    add_shape(slide, 1, 0, 0, SLIDE_W, SLIDE_H, PALETTE["bg"], PALETTE["bg"])
    add_text(slide, 92, 76, 820, 70, "Object Grammar", 54, PALETTE["ink"], True, margin=0)
    add_text(slide, 96, 150, 1010, 42, "Reusable treatments stay small, semantic, and theme-bound instead of filling empty space.", 23, PALETTE["muted"], margin=0)

    columns = [
        (110, 260, 405, "Structure", "sage", "A"),
        (596, 260, 405, "Emphasis", "amber", "B"),
        (1082, 260, 405, "Object Recipes", "teal", "C"),
    ]
    for x, y, w, title, accent, label in columns:
        add_shape(slide, 5, x, y, w, 430, PALETTE["paper"], PALETTE["line"], 1.5, True)
        add_shape(slide, 1, x, y, 12, 430, PALETTE[accent], PALETTE[accent])
        add_icon(slide, x + 56, y + 54, 18, PALETTE[accent], label)
        add_text(slide, x + 88, y + 30, w - 122, 42, title, 25, PALETTE["ink"], True, margin=0)

    # Structure: rails, separators, badges.
    add_shape(slide, 5, 166, 356, 292, 74, PALETTE["green_soft"], PALETTE["sage"], 1.2, False)
    add_shape(slide, 1, 166, 356, 8, 74, PALETTE["sage"], PALETTE["sage"])
    add_text(slide, 194, 374, 220, 28, "Accent rail", 18, PALETTE["ink"], True, margin=0)
    add_shape(slide, 1, 166, 474, 292, 4, PALETTE["line"], PALETTE["line"])
    add_text(slide, 166, 500, 292, 26, "Hairline separator", 17, PALETTE["ink"], True, "center", margin=0)
    for idx, label in enumerate(["1", "2", "3"]):
        cx = 206 + idx * 66
        add_icon(slide, cx, 588, 18, PALETTE["sage"], label)
    add_text(slide, 358, 568, 82, 42, "Step\nbadges", 16, PALETTE["ink"], True, "center", "middle", 0)

    # Emphasis: proof callout, contrast block, underline marker.
    add_shape(slide, 5, 650, 350, 294, 82, PALETTE["rose_soft"], PALETTE["rose"], 1.8, False)
    add_icon(slide, 690, 391, 20, PALETTE["rose"], "!")
    add_text(slide, 724, 372, 174, 28, "Proof callout", 18, PALETTE["rose"], True, margin=0)
    add_shape(slide, 5, 650, 478, 294, 72, PALETTE["amber_soft"], PALETTE["amber"], 1.4, False)
    add_text(slide, 684, 501, 226, 28, "Contrast surface", 18, PALETTE["amber_dark"], True, "center", margin=0)
    add_text(slide, 650, 604, 294, 28, "Short underline marker", 17, PALETTE["ink"], True, "center", margin=0)
    add_shape(slide, 1, 724, 642, 146, 8, PALETTE["amber"], PALETTE["amber"])

    # Object recipes: compact chart, icon slot, connector treatment.
    add_shape(slide, 5, 1136, 350, 294, 96, PALETTE["teal_soft"], PALETTE["teal"], 1.4, False)
    for idx, h in enumerate([34, 56, 42]):
        add_shape(slide, 1, 1170 + idx * 46, 402 - h, 28, h, [PALETTE["sage"], PALETTE["teal"], PALETTE["indigo"]][idx], [PALETTE["sage"], PALETTE["teal"], PALETTE["indigo"]][idx])
    add_text(slide, 1300, 382, 104, 28, "Mini chart", 17, PALETTE["ink"], True, margin=0)
    add_shape(slide, 5, 1136, 492, 294, 72, PALETTE["paper"], PALETTE["line"], 1.1, False)
    add_icon(slide, 1172, 528, 16, PALETTE["teal"], "i")
    add_text(slide, 1204, 512, 172, 30, "Icon slot", 18, PALETTE["ink"], True, margin=0)
    add_elbow(slide, [(1156, 630), (1234, 630), (1234, 600), (1352, 600)], PALETTE["ink"], 3.4)
    add_text(slide, 1160, 648, 270, 28, "Straight or elbow connectors", 16, PALETTE["muted"], False, "center", margin=0)

    add_shape(slide, 5, 154, 744, 1250, 70, PALETTE["paper"], PALETTE["line"], 1.2, True)
    add_text(slide, 194, 763, 220, 30, "Selection rule", 21, PALETTE["ink"], True, margin=0)
    add_text(slide, 420, 762, 830, 32, "choose by content role, density, importance, image presence, and chart/table need", 19, PALETTE["muted"], margin=0)


def svg_text(x: int, y: int, text: str, size: int, color: str, weight: int = 400, anchor: str = "start") -> str:
    return f'<text x="{x}" y="{y}" font-family="Aptos, Inter, Arial, sans-serif" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" fill="#{color}">{text}</text>'


def write_svg(name: str, title: str, body: str) -> None:
    path = OUT_DIR / f"{name}.svg"
    if name == "pipeline":
        diagram = """
  <rect x="92" y="246" width="286" height="380" rx="34" fill="#E7F3EA" stroke="#D8D1C6" stroke-width="3"/>
  <rect x="430" y="246" width="286" height="380" rx="34" fill="#FFF2D2" stroke="#D8D1C6" stroke-width="3"/>
  <rect x="768" y="246" width="410" height="380" rx="34" fill="#E4F7F3" stroke="#D8D1C6" stroke-width="3"/>
  <rect x="1230" y="246" width="286" height="380" rx="34" fill="#ECEBFF" stroke="#D8D1C6" stroke-width="3"/>
  <text x="120" y="308" font-family="Aptos, Arial" font-size="30" font-weight="800" fill="#2F6F5E">1. Content</text>
  <text x="458" y="308" font-family="Aptos, Arial" font-size="30" font-weight="800" fill="#9A5B16">2. Reasoning</text>
  <text x="796" y="308" font-family="Aptos, Arial" font-size="30" font-weight="800" fill="#2F6F5E">3. Rules</text>
  <text x="1258" y="308" font-family="Aptos, Arial" font-size="30" font-weight="800" fill="#6366F1">4. Outputs</text>
  <g fill="#FFFDF8" stroke="#D8D1C6" stroke-width="3"><rect x="126" y="356" width="220" height="102" rx="16"/><rect x="126" y="500" width="220" height="102" rx="16"/><rect x="468" y="356" width="210" height="102" rx="16"/><rect x="468" y="500" width="210" height="102" rx="16"/><rect x="1264" y="356" width="210" height="102" rx="16"/><rect x="1264" y="500" width="210" height="102" rx="16"/></g>
  <g font-family="Aptos, Arial" font-size="22" font-weight="800" fill="#111827"><text x="184" y="414">Markdown</text><text x="184" y="558">Splitter</text><text x="526" y="414">Slide IR</text><text x="526" y="558">Hint Packet</text><text x="1322" y="414">Styled IR</text><text x="1322" y="558">Renderers</text></g>
  <g stroke="#111827" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M346 551 H405 V407 H460"/><path d="M678 407 H804"/><path d="M1134 385 H1222"/><path d="M236 458 V496"/><path d="M1369 458 V496"/></g>
  <g fill="#111827"><path d="M460 407 l-18 -12 v24z"/><path d="M804 407 l-18 -12 v24z"/><path d="M1222 385 l-18 -12 v24z"/><path d="M236 496 l-12 -18 h24z"/><path d="M1369 496 l-12 -18 h24z"/></g>
  <rect x="812" y="338" width="322" height="94" rx="18" fill="#E4F7F3" stroke="#14B8A6" stroke-width="4"/>
  <text x="844" y="397" font-family="Aptos, Arial" font-size="28" font-weight="800" fill="#2F6F5E">Rule Engine</text>
"""
    elif name == "semantics":
        diagram = """
  <g fill="#FFFDF8" stroke="#D8D1C6" stroke-width="3"><rect x="120" y="272" width="610" height="185" rx="20"/><rect x="860" y="272" width="610" height="185" rx="20"/><rect x="120" y="535" width="610" height="185" rx="20"/><rect x="860" y="535" width="610" height="185" rx="20"/></g>
  <g><rect x="120" y="272" width="12" height="185" fill="#86A789"/><rect x="860" y="272" width="12" height="185" fill="#14B8A6"/><rect x="120" y="535" width="12" height="185" fill="#E9B44C"/><rect x="860" y="535" width="12" height="185" fill="#8B7CF6"/></g>
  <g font-family="Aptos, Arial" fill="#111827" font-weight="800" font-size="30"><text x="212" y="350">Lists</text><text x="952" y="350">Tables</text><text x="212" y="613">Emphasis</text><text x="952" y="613">Diagrams</text></g>
  <g font-family="Aptos, Arial" fill="#64748B" font-size="24"><text x="178" y="394">Aligned groups and readable line breaks</text><text x="918" y="394">Numeric rows plus compact charts</text><text x="178" y="657">Hierarchy-aware type sizes</text><text x="918" y="657">Straight or elbow connectors</text></g>
"""
    elif name == "decorations":
        diagram = """
  <text x="92" y="120" font-family="Aptos, Arial" font-size="64" font-weight="800" fill="#111827">Object Grammar</text>
  <text x="96" y="166" font-family="Aptos, Arial" font-size="28" fill="#64748B">Small theme-bound treatments selected by content role and density.</text>
  <g fill="#FFFDF8" stroke="#D8D1C6" stroke-width="3"><rect x="110" y="260" width="405" height="430" rx="22"/><rect x="596" y="260" width="405" height="430" rx="22"/><rect x="1082" y="260" width="405" height="430" rx="22"/></g>
  <g><rect x="110" y="260" width="12" height="430" fill="#86A789"/><rect x="596" y="260" width="12" height="430" fill="#E9B44C"/><rect x="1082" y="260" width="12" height="430" fill="#14B8A6"/></g>
  <g font-family="Aptos, Arial" font-size="30" font-weight="800" fill="#111827"><text x="198" y="320">Structure</text><text x="684" y="320">Emphasis</text><text x="1170" y="320">Object Recipes</text></g>
  <g fill="#E7F3EA" stroke="#86A789" stroke-width="2"><rect x="166" y="356" width="292" height="74" rx="16"/></g><rect x="166" y="356" width="8" height="74" fill="#86A789"/>
  <text x="194" y="402" font-family="Aptos, Arial" font-size="24" font-weight="800" fill="#111827">Accent rail</text>
  <line x1="166" y1="474" x2="458" y2="474" stroke="#D8D1C6" stroke-width="4"/>
  <text x="312" y="526" text-anchor="middle" font-family="Aptos, Arial" font-size="22" font-weight="800" fill="#111827">Hairline separator</text>
  <g fill="#86A789"><circle cx="206" cy="588" r="18"/><circle cx="272" cy="588" r="18"/><circle cx="338" cy="588" r="18"/></g>
  <g font-family="Aptos, Arial" font-size="18" font-weight="800" fill="#FFFFFF" text-anchor="middle"><text x="206" y="595">1</text><text x="272" y="595">2</text><text x="338" y="595">3</text></g>
  <text x="399" y="584" text-anchor="middle" font-family="Aptos, Arial" font-size="20" font-weight="800" fill="#111827">Step</text><text x="399" y="610" text-anchor="middle" font-family="Aptos, Arial" font-size="20" font-weight="800" fill="#111827">badges</text>
  <rect x="650" y="350" width="294" height="82" rx="18" fill="#FFE9EF" stroke="#BE123C" stroke-width="3"/><circle cx="690" cy="391" r="20" fill="#BE123C"/><text x="724" y="402" font-family="Aptos, Arial" font-size="24" font-weight="800" fill="#BE123C">Proof callout</text>
  <rect x="650" y="478" width="294" height="72" rx="16" fill="#FFF2D2" stroke="#E9B44C" stroke-width="3"/><text x="797" y="524" text-anchor="middle" font-family="Aptos, Arial" font-size="24" font-weight="800" fill="#9A5B16">Contrast surface</text>
  <text x="797" y="632" text-anchor="middle" font-family="Aptos, Arial" font-size="22" font-weight="800" fill="#111827">Short underline marker</text><rect x="724" y="642" width="146" height="8" fill="#E9B44C"/>
  <rect x="1136" y="350" width="294" height="96" rx="16" fill="#E4F7F3" stroke="#14B8A6" stroke-width="3"/><rect x="1170" y="368" width="28" height="34" fill="#86A789"/><rect x="1216" y="346" width="28" height="56" fill="#14B8A6"/><rect x="1262" y="360" width="28" height="42" fill="#6366F1"/><text x="1300" y="402" font-family="Aptos, Arial" font-size="22" font-weight="800" fill="#111827">Mini chart</text>
  <rect x="1136" y="492" width="294" height="72" rx="16" fill="#FFFDF8" stroke="#D8D1C6" stroke-width="2"/><circle cx="1172" cy="528" r="16" fill="#14B8A6"/><text x="1204" y="538" font-family="Aptos, Arial" font-size="24" font-weight="800" fill="#111827">Icon slot</text>
  <path d="M1156 630 H1234 V600 H1352" fill="none" stroke="#111827" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M1352 600 l-16 -10 v20z" fill="#111827"/><text x="1295" y="674" text-anchor="middle" font-family="Aptos, Arial" font-size="20" fill="#64748B">Straight or elbow connectors</text>
  <rect x="154" y="744" width="1250" height="70" rx="18" fill="#FFFDF8" stroke="#D8D1C6" stroke-width="3"/>
  <text x="194" y="790" font-family="Aptos, Arial" font-size="26" font-weight="800" fill="#111827">Selection rule</text>
  <text x="420" y="790" font-family="Aptos, Arial" font-size="24" fill="#64748B">choose by role, density, importance, image presence, and chart/table need</text>
"""
    else:
        diagram = """
  <text x="96" y="170" font-family="Aptos, Arial" font-size="76" font-weight="800" fill="#111827">mdpresent</text>
  <text x="100" y="226" font-family="Aptos, Arial" font-size="30" fill="#64748B">Markdown to coherent editable decks</text>
  <rect x="96" y="258" width="170" height="10" rx="5" fill="#14B8A6"/>
  <g fill="#FFFDF8" stroke="#D8D1C6" stroke-width="3"><rect x="130" y="390" width="250" height="130" rx="18"/><rect x="460" y="390" width="250" height="130" rx="18"/><rect x="790" y="390" width="250" height="130" rx="18"/><rect x="1120" y="390" width="250" height="130" rx="18"/></g>
  <g font-family="Aptos, Arial" font-weight="800" font-size="26" fill="#111827"><text x="188" y="458">Markdown</text><text x="518" y="458">IR</text><text x="848" y="458">Layout</text><text x="1178" y="458">Render</text></g>
  <g stroke="#111827" stroke-width="7" stroke-linecap="round"><path d="M390 455 H445"/><path d="M720 455 H775"/><path d="M1050 455 H1105"/></g>
  <g fill="#111827"><path d="M445 455 l-18 -12 v24z"/><path d="M775 455 l-18 -12 v24z"/><path d="M1105 455 l-18 -12 v24z"/></g>
  <rect x="130" y="640" width="1110" height="116" rx="18" fill="#FFFDF8" stroke="#D8D1C6" stroke-width="3"/>
  <rect x="1240" y="640" width="210" height="116" rx="18" fill="#FFE9EF" stroke="#BE123C" stroke-width="3"/>
"""
    content = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SLIDE_W} {SLIDE_H}" role="img" aria-labelledby="title desc">
  <title id="title">{title}</title>
  <desc id="desc">{body}</desc>
  <rect width="{SLIDE_W}" height="{SLIDE_H}" fill="#{PALETTE['bg']}"/>
{diagram}
</svg>
"""
    path.write_text(content, encoding="utf-8")


def export_pngs() -> None:
    import win32com.client  # type: ignore

    TMP_DIR.mkdir(parents=True, exist_ok=True)
    pptx_path = TMP_DIR / "readme-previews.pptx"
    app = win32com.client.DispatchEx("PowerPoint.Application")
    app.Visible = True
    prs = app.Presentations.Add(WithWindow=False)
    try:
        prs.PageSetup.SlideWidth = PPT_W * 72
        prs.PageSetup.SlideHeight = PPT_H * 72
        builders = [("cover", build_cover), ("pipeline", build_pipeline), ("semantics", build_semantics), ("decorations", build_decorations)]
        for _, builder in builders:
            builder(prepare_slide(prs))
        prs.SaveAs(str(pptx_path))
        for idx, (name, _) in enumerate(builders, start=1):
            out = OUT_DIR / f"{name}.png"
            prs.Slides(idx).Export(str(out), "PNG", SLIDE_W, SLIDE_H)
    finally:
        prs.Close()
        app.Quit()
    shutil.rmtree(TMP_DIR, ignore_errors=True)


def sync_pipeline_preview_from_teaser() -> None:
    teaser_png = OUT_DIR / "mdpr-pipeline-teaser.png"
    teaser_svg = OUT_DIR / "mdpr-pipeline-teaser.svg"
    if teaser_png.exists():
        shutil.copyfile(teaser_png, OUT_DIR / "pipeline.png")
    if teaser_svg.exists():
        shutil.copyfile(teaser_svg, OUT_DIR / "pipeline.svg")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    subprocess.run([sys.executable, str(ROOT / "scripts" / "build-readme-pipeline-teaser.py")], check=True)
    write_svg("cover", "PPTX cover export", "A PPTX cover slide exported to PNG for MDPR.")
    write_svg("pipeline", "PPTX pipeline export", "A PPTX pipeline diagram exported to PNG with aligned badges.")
    write_svg("semantics", "PPTX semantic blocks export", "A PPTX semantic-blocks slide exported to PNG.")
    write_svg("decorations", "PPTX object grammar export", "A PPTX object-grammar slide exported to PNG.")
    export_pngs()
    sync_pipeline_preview_from_teaser()
    report = {
        "assets": ["cover", "pipeline", "semantics", "decorations"],
        "pngSize": [SLIDE_W, SLIDE_H],
        "alignmentRules": [
            "badge text uses the same bounding box as its circle",
            "badge text boxes set margin to zero",
            "badge text is horizontally centered and vertically middle anchored",
            "card text keeps minimum left and right padding",
            "pipeline preview is synchronized from the validated README teaser",
        ],
    }
    (OUT_DIR / "readme-slide-assets-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
