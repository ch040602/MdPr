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

After splitting, `packages/core/src/coherence` emits `coherenceGroups`. These groups classify
blocks as claim, evidence, metric, example, risk, decision, action, caption,
source, or appendix, then group compact slides as argument, comparison,
workflow, evidence-pack, or summary. This layer preserves proximity between
charts/tables/images and their explanations without asking an agent to rewrite
the content.

Caption classification treats the short paragraph after an image, chart, table,
or diagram as the caption. The object remains evidence; the caption paragraph
gets the `caption` role and the group receives keep-together priority.

When `--hints` is provided, accepted `mdpr-skill` hints are merged only into this
coherence metadata layer. They may add secondary intent candidates, block-role
signals, keep-together evidence groups, primary/supporting importance metadata,
or icon-search keywords. They do not choose layout coordinates, theme colors,
typography, z-order, component variants, renderer object IDs, or final output.

## Design Selection

`theme.designPreset` is the compatibility entry point for a named preset. `theme.decorationStyle` selects the visual grammar separately from color:

```text
skeuomorphism, neomorphism, glassmorphism, claymorphism,
minimalism, newmorphism, brutalism, liquid-glass, bentogrid
```

Palette-only or background-only swaps are pruned from `theme.decorationStyle`, `--theme-style`, and Actions previews. Layout presets such as `grid` remain available as composition grammar, not theme style.

The generated Actions/README preview is intentionally pruned to these distinct
style grammars:

```text
skeuomorphism, neomorphism, glassmorphism, claymorphism,
minimalism, newmorphism, brutalism, liquid-glass, bentogrid
```

`clean`, `executive`, and `technical` remain named design presets through
`--design`, but they are no longer public `--theme-style` decoration grammars.

The generated theme preview records a deterministic design-quality fingerprint
for each public style. The fingerprint combines palette distance, decoration
grammar, surface treatment markers, rendered surface variants, and token
contrast checks so visually adjacent families such as `neomorphism` versus
`newmorphism` and `glassmorphism` versus `liquid-glass` cannot silently collapse
into palette-only variants.

Each public theme also has a bounded decoration rule. These rules change only
background surfaces, SVG surface overlays, shadows, and accent marks; they must
not move content regions or replace editable text:

| Theme | Optimized decoration rule |
| --- | --- |
| `skeuomorphism` | chrome frame, inset bevel, highlight/lowlight edge, small physical screw cues |
| `neomorphism` | recessed soft UI rails, paired light/dark shadows, low-contrast relief, no floating accent dots |
| `glassmorphism` | dark field, translucent panes, frosted surface noise, straight glass edge highlights |
| `claymorphism` | soft puffy surfaces, warm colored depth, pillow highlights and lowlights |
| `minimalism` | hairline rules, sparse corner ticks, transparent surface treatment, low decoration count |
| `newmorphism` | legacy raised soft surfaces, paired shadows, subtle floating relief marks |
| `brutalism` | hard borders, offset blocks, registration marks, saturated canvas, no soft shadow |
| `liquid-glass` | frosted glass plus refractive ribbons, lens highlights, caustic edge accents |
| `bentogrid` | modular grid field, tile rules, index modules, bento-card rhythm |

The theme preview evaluator fails a style when its generated PPTX surfaces miss
the required theme-specific SVG layer markers. This keeps `neomorphism` distinct
from `newmorphism`, and `glassmorphism` distinct from `liquid-glass`, even when
the same Markdown and layout regions are rendered.

`theme.colorSeed` provides the main color. `theme.colorCombination` derives the supporting palette using Adobe Color Wheel-style harmony rules:

```text
preset, monochromatic, analogous, complementary, split-complementary, triadic
```

The derived palette feeds element accents, chart colors, and the generated PowerPoint document theme colors (`accent1` through `accent6`). Final body text colors are normalized separately as grayscale black/white brightness adjustments from the resolved background, so text readability is not coupled to hue choices in presets, packs, or templates.

Approved packs provide a separate token import path. `mdpresent pack import`
converts approved theme or component candidates into `mdpr-pack-v1`,
`mdpresent pack validate` checks provenance, approval, editability, external
asset risk, and accent budget, and `mdpresent build --pack mdpr.pack.json`
merges validated theme tokens before planning. This path is deterministic and
does not allow agent hints to set coordinates, raw renderer objects, z-order, or
final component variants.

## Coherence Rules

- Same-role objects use the same connector and surface family unless the content expresses a different flow.
- Layout candidates are scored against coherence groups. Evidence packs prefer
  layouts that keep chart/table/image objects and their explanation together;
  workflow groups prefer diagram layouts; same-section slides receive a small
  continuity penalty when their layout family changes abruptly.
- Same-depth item objects use one surface variant per slide. Theme styles may
  change the family, but sibling items should not rotate unrelated shape
  grammars just to create decoration.
- Parent object text is at least as large as child object text; bold weight may vary by emphasis.
- Text/background luminance coherence requires final theme text to be a
  grayscale black/white brightness adjustment with at least 4.5:1 contrast
  against the resolved slide background.
- Tables use middle vertical alignment, readable cell margins, coherent header fills, and a readable minimum font size.
- Icons remain small, monotone, and secondary; they are not used to fill empty space.
- If a circle, badge, alphabet marker, number marker, or icon acts like a bullet, the glyph and marker share the same center point on both axes.
- SVG-backed surfaces use fixed absolute corner geometry so wide panels and small cards do not drift into different rounded-rectangle styles.

## Design Lock

Every `build` writes `mdpresent-design-lock.json` and `mdpresent-manifest.json` beside the rendered files. The design lock records the resolved decoration style, color seed, palette seed, PowerPoint theme colors, typography, and surface policy.

Use `--design-lock <path>` to pin a contract and `--update-design-lock` to accept intentional style or color changes. Use `--visual` to add structural visual-validation summaries to the manifest.
