# 12. Design Methodology

MDPR keeps Markdown as the source of truth and treats design as a deterministic rendering contract. Optional agent hints may suggest compact semantics, but final splitting, layout, color, typography, objects, z-order, overflow handling, and renderer output remain rule-based.

## Content Semantics

The parser preserves presentation-relevant Markdown structure:

- Lists keep ordered or unordered numbering, nesting level, and fallback text.
- Decorative empty bullet lines are removed before rendering.
- Inline emphasis such as `**bold**` and `*italic*` is carried into HTML and editable PPTX text runs.
- Block quotes become separated key-message regions with accent styling.
- Paragraph line breaks and sentence units remain available for slide splitting and text-box fitting.
- Standalone pipeline lines such as `Draft => Review => Render` become semantic diagram blocks.
- One graph or diagram block stays on a single slide; MDPR does not split one diagram across continuation pages.
- Chart slides may keep prose beside the chart, and chart-plus-table slides keep the graph and table in parallel regions.

After splitting, MDPR also emits `coherenceGroups`. These groups classify
blocks as claim, evidence, metric, example, risk, decision, action, caption,
source, or appendix, then group compact slides as argument, comparison,
workflow, evidence-pack, or summary. This layer preserves proximity between
charts/tables/images and their explanations without asking an agent to rewrite
the content.

## Design Selection

`theme.designPreset` is the compatibility entry point for a named preset. `theme.decorationStyle` selects the visual grammar separately from color:

```text
clean, executive, editorial, technical,
minimalism, newmorphism, glass, grid, data, magazine
```

Legacy color-only presets remain available through `theme.designPreset` and `--design` for existing decks, but Actions previews only enumerate decoration styles that alter layout, surfaces, or page grammar.

The generated Actions/README preview is intentionally pruned to these distinct
style grammars:

```text
clean, editorial, minimalism, newmorphism, glass, grid, data, magazine
```

`executive` and `technical` remain valid CLI styles for compatibility and
specific deck use, but they are not part of the generated preview gallery when
their output would read as a palette or background variation of another style.

`theme.colorSeed` provides the main color. `theme.colorCombination` derives the supporting palette using Adobe Color Wheel-style harmony rules:

```text
preset, monochromatic, analogous, complementary, split-complementary, triadic
```

The derived palette feeds element accents, chart colors, and the generated PowerPoint document theme colors (`accent1` through `accent6`).

## Coherence Rules

- Same-role objects use the same connector and surface family unless the content expresses a different flow.
- Same-depth item objects use one surface variant per slide. Theme styles may
  change the family, but sibling items should not rotate unrelated shape
  grammars just to create decoration.
- Parent object text is at least as large as child object text; bold weight may vary by emphasis.
- Tables use middle vertical alignment, readable cell margins, coherent header fills, and a readable minimum font size.
- Icons remain small, monotone, and secondary; they are not used to fill empty space.
- If a circle, badge, alphabet marker, number marker, or icon acts like a bullet, the glyph and marker share the same center point on both axes.
- SVG-backed surfaces use fixed absolute corner geometry so wide panels and small cards do not drift into different rounded-rectangle styles.

## Design Lock

Every `build` writes `mdpresent-design-lock.json` and `mdpresent-manifest.json` beside the rendered files. The design lock records the resolved decoration style, color seed, palette seed, PowerPoint theme colors, typography, and surface policy.

Use `--design-lock <path>` to pin a contract and `--update-design-lock` to accept intentional style or color changes. Use `--visual` to add structural visual-validation summaries to the manifest.
