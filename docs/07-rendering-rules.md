# 07. Rendering Rules

## Shared Renderer Contract

Renderers do not choose layouts. They consume the planned deck:

```text
{ Presentation IR, Layout IR } -> PPTX
{ Presentation IR, Layout IR } -> HTML
{ Presentation IR, Layout IR } -> PDF
```

`Layout IR` provides position, size, region, slot, z-order, typography, and overflow policy. `Presentation IR` provides renderable content such as titles, prose, lists, code, tables, charts, images, quotes, and diagrams.

Using `Layout IR` alone is allowed only for debug or compatibility modes.

## PPTX Renderer

Goal: create editable PowerPoint decks.

Mapping:

```text
text      -> PowerPoint text box
bullets   -> PowerPoint text box with bullet options
tables    -> PowerPoint table
charts    -> native chart or editable proof object
images    -> PowerPoint image
shapes    -> PowerPoint shape or SVG-backed surface
diagrams  -> editable nodes and connectors
background -> master/layout layer when available
```

Implemented baseline:

- consumes `{ Presentation IR, Layout IR }`
- uses Layout IR slide size, regions, theme fonts, colors, z-order, and overflow policy
- emits editable text boxes for titles, paragraphs, lists, code, and fallback text
- emits native PowerPoint tables for table blocks
- emits native charts or bounded proof objects for chart blocks
- applies role-aware text insets so text aligns inside its own PowerPoint box
- preserves Layout IR coordinates and does not recompute layout
- applies PowerPoint shrink behavior only when overflow policy is `shrink`
- preserves Markdown line breaks, sentence units, ordered list numbers, nested list prefixes, bold, and italic runs
- renders block quotes as separated key-message regions when planned
- renders ordered item cards with editable badges and accent text
- centers item-card text boxes from the leading badge/icon center and keeps
  single-line rows compact so marker shapes and labels share the same horizontal
  visual axis
- uses smaller, marker-specific glyph sizing and optical vertical compensation
  for compact circular badges
- renders pipeline diagrams as editable rounded nodes and line connectors
- chooses horizontal, vertical, U-shaped, reverse-U, or cycle-like pipeline arrangements from graph shape
- renders SVG-backed surfaces with fixed corner radii before applying PPT border and shadow geometry
- renders semantic icon slots from a local SVG catalog
- renders preset-specific editable cover/title templates
- renders pentagon layout edge accents as editable background line shapes

## Decoration Styles

```text
skeuomorphism  tactile bevels, inset highlights, and physical panel cues
neomorphism    soft UI surfaces with paired light/dark shadows
glassmorphism  translucent dark-field surfaces with PPT shadow/glow effects
claymorphism   puffy rounded surfaces with soft colored depth
minimalism     restrained rules, transparent surfaces, sparse composition
newmorphism    legacy-compatible soft raised surfaces
brutalism      hard borders, offset blocks, and high-contrast geometry
liquid-glass   glassmorphism variant with rounded refractive highlights
bentogrid      tiled information rhythm with subtle grid structure
```

Palette-only or background-only swaps are pruned from `--theme-style` and the Actions preview. Existing layout presets such as `grid` remain layout grammar, not theme style.

## Color and Theme Policy

- `theme.decorationStyle` selects visual grammar.
- `theme.colorSeed` provides the main color.
- `theme.primaryColor` remains a compatibility fallback.
- `theme.colorCombination` derives palette and PPT theme accents from the seed.
- `preset` preserves catalog colors.
- `monochromatic`, `analogous`, `complementary`, `split-complementary`, and `triadic` follow Adobe Color Wheel-style harmony.
- PPTX output writes active color tokens into `ppt/theme/theme*.xml` so charts and later user edits inherit the same document theme.

## Surface Policy

```text
1. Resolve decoration style and color seed.
2. Resolve a bounded absolute surface corner radius from role and region size.
3. If the policy uses SVG, generate an aspect-aware SVG surface so the visible radius stays fixed across shape sizes.
4. Add PPT shadow/glow effects through transparent native geometry when needed.
5. Render text, tables, charts, icons, and connectors above the surface.
```

## Template and Master Import

Template import may:

- read positioned image assets from slide master, slide layout, and slide XML parts
- preserve image geometry when the template uses the same slide ratio
- place imported assets before generated content so they behave as background decoration
- read theme XML colors and apply them over the selected design preset
- import non-text decorative vector shapes from master, layout, and example slides
- reuse example-slide decorations only when generated slides have the same inferred layout family

Template import must not import:

- body placeholder positions
- arbitrary content box positions
- animations
- editable sample text

## HTML Renderer

Goal: provide a lightweight browser preview and gallery shell.

Rules:

- keep one section per slide
- apply theme tokens through CSS variables
- prefer a fixed 16:9 canvas
- preserve ordered and unordered list semantics
- render inline bold and italic as `<strong>` and `<em>`
- render planned quote/key-message regions separately
- render pipeline diagram blocks as semantic flow nodes with connector glyphs
- include arrangement classes such as `pipeline-horizontal`, `pipeline-vertical`, `pipeline-u`, `pipeline-reverse-u`, and `pipeline-cycle`

## PDF Renderer

Goal: create fixed distribution documents.

Initial path:

```text
Layout IR -> HTML -> headless browser PDF
```

## Non-PPTX Background Policy

PPT templates are directly consumed only for PPTX output. HTML and PDF background/font choices follow:

```text
CLI --design > config theme.designPreset > config pptx.designPreset > config theme colors > default theme
```

Example:

```bash
mdpresent build deck.md --to html,pdf --background "#111827" --font Aptos
```

## Generated Preview Validation

Actions theme preview is regenerated from PPTX output and checked by `scripts/evaluate-theme-preview.mjs`. The evaluator checks the 9-style redefined preview set, legacy deck removal, exported PNG count and size, manifest composition markers, proof object markers, rendered surface variants, required catalog slides, visible text language, and the absence of legacy iframe-based previews.
