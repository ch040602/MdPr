# 02. Requirements

## Functional Requirements

### Input

- Accept Markdown files as the source document.
- Prefer normal Markdown heading structure.
- Load global settings from `mdpresent.config.yaml`, JSON config files, or CLI arguments.
- Avoid forcing slide-only syntax into normal Markdown prose.

### Splitting

- Treat the first `#` as a cover candidate by default.
- Treat `##` headings as slide candidates.
- Treat `###` headings as subsection and autosplit boundaries.
- Use density, block groups, list chunks, tables, images, code, and explicit slide breaks to split overloaded sections.
- Keep one graph or diagram block on one slide.

### Layout

- Use comparison layouts for clear before/after or two-sided structures.
- Use vertical or step-card layouts for three primary items.
- Use 2x2 grids for four primary items.
- Use pentagon/radial or vertical-list layouts for five primary items.
- Use 3x2 grids for six primary items.
- Use vertical lists or autosplitting for seven or more primary items.
- Use dedicated presets for tables, images, code, quotes, timelines, charts, and pipeline diagrams.

### Typography and Overflow

- Prefer configured font sizes.
- Never shrink below the configured readable font floor.
- Resolve overflow through reflow, shrink, split, warn, or fail policies.
- Emit diagnostics even when an override forces a dense slide to stay single-page.

### PPTX Output

- Generate editable PowerPoint objects.
- Render text as text boxes, tables as native tables, charts as native charts where possible, images as image objects, and diagrams as editable nodes/connectors.
- Import slide size, theme colors, fonts, master backgrounds, logos, and decorative assets from templates when configured.
- Recalculate content placement rather than reusing arbitrary template placeholder positions.

### HTML and PDF Output

- Use CLI/config theme tokens rather than PPT template internals.
- Preserve slide-level section structure in HTML.
- Keep PDF as an export path derived from the planned deck.

### Overrides

- Support YAML and JSON override manifests.
- Validate manifests with JSON Schema.
- Prefer `slideId` targeting over `slideIndex`.
- Allow structured operations for layout, typography, overflow, split, slots, and block-level changes.

## Non-Functional Requirements

- Keep modules independent and testable.
- Separate CLI orchestration from core planning logic.
- Let renderers be added independently.
- Produce readable diagnostics on failure.
- Keep enums and schemas explicit enough for agents and humans to edit safely.

## Included Scope

```text
- heading-based splitting
- density-based autosplitting
- intent detection
- rule-based layout selection
- override manifests
- inspect / plan / validate / build
- HTML output
- editable PPTX output
- theme styles, color seed, and color harmony
- generated artifact QA
```

## Deferred Scope

```text
- complete Marp CSS compatibility
- complete PPTX placeholder analysis
- animation
- video
- speaker notes
- perfect text measurement
- automated perceptual scoring
```
