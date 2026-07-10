# 13. Object Forms and Icons

This document keeps object-form details out of the README while preserving the renderer contract for PPTX, HTML, and PDF output.

## Editable Object Families

MDPR currently renders these object families as editable or renderer-native objects where the target format supports it:

- Cover and title text
- Paragraph text
- Ordered and unordered list cards
- Quote and key-message callouts
- Code windows
- Single-card, comparison-card, vertical-list-card, 2x2 grid-card, 3x2 grid-card, and pentagon/radial layouts
- Native tables
- Native bar charts
- Chart-beside-prose and chart-plus-table layouts
- Editable chart proof objects: `arc-ring`, `gauge`, `connected-strip`, `ranked-bars`, and `metric-dots`
- Pipeline diagrams
- Image-focus and image-beside-text layouts
- Text-icon-aside support
- Preset backgrounds, region surfaces, accent rails, number badges, icon badges, proof callouts, theme colors, and template assets

## Chart Fences

Use `chart` or `bar` for native PowerPoint bar charts. Use explicit proof-object kinds when the slide needs compact evidence rather than a full chart:

```text
arc-ring, gauge, connected-strip, ranked-bars, metric-dots
```

Generic `chart` fences may also declare `kind: arc-ring`, `kind: gauge`, `kind: connected-strip`, `kind: ranked-bars`, or `kind: metric-dots`.

`metric-dots` chooses one value-label policy for the entire metric group. A
group whose values are all in the 0-100 range uses percentage labels; if any
value is outside that range, every editable label uses its raw source number.
The five visual dots still use a capped 0-100 fill range, so MDPR never silently
replaces a source value with the visual cap or mixes scales within one group.

## SVG Surface Path

SVG-backed PowerPoint surfaces are generated in:

```text
packages/render-pptx/src/designPresets.ts
```

The renderer creates an aspect-aware SVG viewBox for each surface and applies a bounded absolute corner radius. Native PowerPoint shadow or glow effects may be layered above the SVG with transparent geometry, but the visible border remains SVG-backed so rounded corners stay coherent across differently sized shapes.

## Surface Shape Families

Surface shapes are selected by role, decoration style, and item index. The selection changes the background object only; text boxes, charts, tables, and diagram coordinates stay owned by Layout IR.

Current SVG surface families:

- `rounded`: default fixed-radius card for safe dense content.
- `two-corner-left`: only the left two corners are rounded, useful for linear list rows and left-to-right grouping.
- `two-corner-right`: only the right two corners are rounded, useful for closing panels or mirrored rows.
- `flag-drop`: a small flag descends from the top edge for method, step, or emphasis cards.
- `notched-corner`: a clipped/folded corner for code, data, warning, or proof-like panels.
- `ticket`: side punch marks for document, evidence, table, or checklist panels; it is not used in automatic item-card rotation because isolated punch marks can read as stray dots.

Coherence guards:

- Do not change region coordinates or text margins when changing the surface family.
- Use one surface grammar per same-role group unless the slide content expresses a different role.
- Keep decorative accents inside the surface bounds.
- Avoid singleton marker accents in automatic style rotation; decorative dots, punch holes, or relation marks must appear as part of an intentional repeated group, not on only one card.
- Use fixed absolute corner radii so shape size does not change the perceived roundness style.
- Fall back to `rounded` for dense text, crowded tables, or already visually rich slides.

Documentation preview images come from the shared MDPR theme-preview deck:

```text
examples/readme-teaser/deck.md
docs/assets/readme-teaser/slides/slide-01.png
examples/theme-preview-en/deck.md
docs/theme-preview/slides/bentogrid/slide-11.png
docs/theme-preview/slides/minimalism/slide-12.png
```

Documentation images must not be generated through a target-specific renderer.
The same Markdown parser, splitter, layout planner, design grammar, renderer,
and PowerPoint PNG export path used by Actions theme preview must produce the
referenced images.

## Icon Catalog Path

The local SVG icon catalog is stored in:

```text
packages/render-pptx/src/iconCatalog.ts
```

The catalog keeps icons monotone and secondary to text. Selection is semantic and keyword-search based:

- Tabler Icons-style 24px stroke glyphs for general UI and concept icons.
- Simple Icons-style filled glyphs only when the text explicitly names that brand.
- SVG Repo-style generic object glyphs for infrastructure or fallback cases.
- MDPR searches title, body, list, table, chart-label, and diagram-label keywords against the local icon index, then chooses the highest scoring tracked catalog icon.
- If an optional skill/agent proposes icon ideas, it may only provide compact keyword hints such as `validation`, `database`, `palette`, or `workflow`; MDPR still performs the final deterministic catalog search and may ignore the hint.

The renderer centers each icon in its slot and writes source/license metadata into the generated image alt text where the PPTX API allows it.
