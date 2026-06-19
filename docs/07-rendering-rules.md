# 07. Renderer 규칙

## 공통 규칙

모든 renderer는 layout 결정을 다시 수행하지 않는다.

렌더러의 기본 입력 계약은 renderable deck이다.

```text
{ Presentation IR, Layout IR } → PPTX
{ Presentation IR, Layout IR } → HTML
{ Presentation IR, Layout IR } → PDF
```

`Layout IR`은 위치, 크기, region, slot, overflow policy를 제공한다. `Presentation IR`은 실제 텍스트, bullet, 코드, 이미지 같은 renderable content를 제공한다.

Renderer가 split이나 layout 선택을 다시 수행하면 안 된다. `Layout IR` 단독 입력은 디버그/호환성 모드로만 사용하며, 실제 출력에서는 `{ Presentation IR, Layout IR }`를 사용한다.

## PPTX Renderer

목표:

```text
편집 가능한 발표자료 생성
```

원칙:

```text
텍스트 → PowerPoint text box
bullet → PowerPoint text box with bullet options
표 → PowerPoint table
이미지 → PowerPoint image
도형 → PowerPoint shape
배경 → slide master/layout layer
```

Current implemented baseline:

```text
- consumes the normal renderable deck input: { Presentation IR, Layout IR }
- uses Layout IR slide size, region x/y/w/h, theme fonts, colors, and z-order
- emits editable PowerPoint text boxes for titles, paragraphs, bullets, code text, and fallback content
- emits PowerPoint table objects for table blocks
- emits image objects for image blocks with local paths
- centers title, subtitle, and item regions according to the fixed region box
- applies role-aware text box insets so text aligns inside its own PowerPoint box, not only to the outer region rectangle
- preserves region coordinates; it does not choose a new layout or recompute font sizes
- applies PowerPoint shrink behavior only when the slide overflow policy is `shrink`
- renders paragraph sentence units and Markdown lines as explicit PowerPoint line breaks
- renders ordered list numbers, nested list prefixes, and inline bold/italic runs as editable text
- renders block quotes as separated key-message regions when the layout planner assigns `quote` or `key-message`
- renders ordered item cards with editable colored number badges and accent-colored bold/label text
- renders key-message surfaces with an inset one-sided accent line that aligns with the box padding instead of protruding from the rounded surface
- renders pipeline diagram blocks as editable rounded node boxes and line connectors
- keeps same-role pipeline nodes on one coherent decoration style so a start node does not visually break from sibling nodes unless the content expresses a different role
- chooses pipeline graph arrangements from content shape: horizontal for short flows, vertical for long labels, U-shaped and reverse-U for denser multi-step flows, and cycle-like placement when an edge returns to the first node
- sizes diagram nodes and shrinks wrapped node labels before connector drawing to reduce text clipping outside shapes
- places diagram labels below decorative strips/badges so text does not overlap node decoration
- uses preset-specific editable cover/title templates; theme-gallery output shows multiple title candidates, while explicit `--design` output uses one title treatment
- renders pentagon layout edge accents as editable background line shapes
```

Built-in design presets:

```text
plain      minimal editable output using the configured theme
clean      light background, card surfaces, simple title rule
executive  light business deck with blue accent, title rule, card surfaces, corner accent
editorial  warmer editorial palette with card surfaces and accent bars
technical  green-accent technical deck with clean card surfaces
dark       dark background with high-contrast text and cyan accents
nord       Nord-inspired dark editorial palette
solarized  Solarized-inspired warm analytical palette
dracula    Dracula-inspired high-contrast dark palette
tableau    Tableau-inspired multi-accent analytics palette
gruvbox    Gruvbox-inspired warm dark palette
monokai    Monokai-inspired dark technical palette
material   Material-inspired clean product palette
tokyo-night Tokyo Night-inspired deep technical palette
```

The shared preset catalog lives in `@mdpresent/core`. `theme.designPreset` is the format-independent config location and is consumed by PPTX and HTML. `pptx.designPreset` remains supported as a PPTX-specific compatibility override.

Template/master import baseline:

```text
- reads positioned image assets from slide master, slide layout, and slide XML parts
- preserves image x/y/w/h from the source PPTX when the template uses the same slide ratio
- places imported assets before generated content so they behave as background/master decoration
- reads theme XML colors and applies them over the selected design preset so the template's main palette is preserved
- imports non-text decorative vector shapes from slide master, slide layout, and example slide XML parts
- reuses decorations from example slides only when the generated slide has the same inferred layout family
- does not import body placeholders, arbitrary content box positions, animations, or editable text from the template
```

PPT 템플릿 사용 시:

```text
가져올 것:
- slide size
- theme colors
- fonts
- master background
- logo
- decorative shapes

그대로 쓰지 않을 것:
- 본문 placeholder 위치
- content box 위치
- 임의의 template layout 배치
```

## HTML Renderer

목표:

```text
웹 미리보기 / 공유 / PDF intermediate
```

원칙:

```text
slide 단위 section 유지
CSS variables로 theme token 적용
fixed 16:9 canvas 우선
ordered/unordered list semantics are kept as HTML list tags
inline bold/italic runs are rendered as <strong>/<em>
block quotes are rendered as separated key-message regions when planned by Layout IR
ordered list numbers can render as explicit badge elements for card-like item layouts
pipeline diagram blocks are rendered as semantic flow nodes with connector glyphs
pipeline diagrams include an arrangement class such as `pipeline-horizontal`, `pipeline-vertical`, `pipeline-u`, `pipeline-reverse-u`, or `pipeline-cycle`
```

Overflow and split behavior:

```text
diagram + detail blocks in one section split into diagram slide first, detail continuation slide second
body and item regions keep a readable minimum font size during automatic overflow resolution
decorative lines and badges are drawn as editable shapes and text is inset away from those shapes
PPTX text boxes use role-aware inner margins and vertical anchors so titles, item cards, proof points, code blocks, and body text align consistently inside their shape bounds
```

Planned behavior:

```text
keyboard navigation 지원
```

## PDF Renderer

목표:

```text
배포용 고정 문서 생성
```

초기 구현:

```text
Layout IR → HTML → headless browser PDF
```

## PPTX가 아닐 때의 배경 처리

PPT 템플릿은 PPTX 출력에서만 직접 사용한다.

PDF/HTML 출력은 다음 순서로 배경과 폰트를 정한다.

```text
CLI --design > config theme.designPreset > config pptx.designPreset > config theme colors > default theme
```

예:

```bash
mdpresent build deck.md --to html,pdf --background "#111827" --font Pretendard
```
