# MDPR Design Grammar

## Teaser Summary

> Generated PPTX slides should show design range without sacrificing coherence.

- Preview styles: 5 pruned decoration grammars, not palette-only swaps.
- Pattern range: 36+ decoration and layout patterns selected by content role.
- Object support: native tables, charts, proof objects, diagrams, images, and icon slots.
- QA contract: readable text, bounded objects, aligned connectors, and editable PPTX output.

## Composition Contract

- Cover signal: title scale and first-viewport identity.
- Evidence rhythm: chart, table, and proof objects stay connected.
- Object grammar: cards, tickets, flags, and panels vary coherently.
- Connector clarity: arrows attach to object boundaries.
- Bounds discipline: no region exceeds the slide.

## Pruned Style Families

- Clean: restrained default structure.
- Minimalism / newmorphism: sparse rules or soft raised surfaces.
- Glass / data: translucent surfaces or metric rails.
- Clean: restrained default structure for ordinary decks.
- Pruning rule: preview excludes styles that only change palette or background.

## Semantic Blocks

- **Headings**: stable slide boundaries.
- **Lists**: ordered and unordered structure.
- **Constraint**:
  Indented description lines stay under the bold label.
- **Emphasis**: **bold** and *italic* remain editable.

## Pipeline Diagram

Markdown source => Parse blocks => Split slides => Layout objects => Validate overflow => Render PPTX HTML PDF

- Diagram rule: one graph stays on one slide.
- Connector rule: line segments overlap node edges slightly.
- Routing rule: straight and elbow paths remain legible.

## Decoration Pattern Catalog

- Surfaces: `rounded-card`, `two-corner-card`, `flag-drop`, `ticket-panel`, `notched-panel`, `circle-vine`.
- Layouts: `toc-strips`, `two-column-compare`, `three-card-grid`, `six-tile-grid`, `timeline-rail`, `pipeline-chain`.
- Evidence: `chart-table-pair`, `metric-proof`, `arc-ring-proof`, `gauge-proof`, `connected-strip`, `mixed-object-pack`.
- Connectors: `straight-arrow`, `elbow-arrow`, `boundary-attach`, `overlap-joint`, `parallel-flow`, `contrast-flow`.
- Icons: `number-badge`, `mono-icon-slot`, `letter-disc`, `quiet-aside`, `image-safe-frame`, `brand-glyph`.
- Page grammar: `clean-card`, `glass-surface`, `newmorphic-panel`, `data-rail`, `minimal-rule`.

## Table Coherence

| Object | Renderer expectation | QA signal |
| --- | --- | --- |
| Text box | editable, middle aligned | readable minimum size |
| Table | native table object | header fill and cell padding |
| Diagram | nodes and connectors | no clipped labels |
| Chart | theme-colored data object | contrast and value clarity |

## Chart and Table Pair

- Numeric evidence: chart and table stay side by side.
- Data density: values remain readable without shrinking below floor.
- Comparison goal: coverage and defects are visible together.

```chart
labels: Parser, Layout, PPTX
Coverage: 92, 88, 95
Defects: 3, 5, 2
```

| Stage | Coverage | Defects |
| --- | ---: | ---: |
| Parser | 92 | 3 |
| Layout | 88 | 5 |
| PPTX | 95 | 2 |

## Editable Proof Objects

```arc-ring
labels: Validated, Remaining
Coverage: 84, 16
```

```gauge
labels: Readiness
Score: 91
```

```connected-strip
Parse, 30
Plan, 62
Render, 86
Review, 94
```

## Object Shape Grammar

- Method flag: short high-level step.
- Ticket panel: document-like evidence.
- Two-corner panel: linear grouping.
- Notched panel: technical constraint or code-like object.
- Rounded panel: neutral fallback surface.

## Icon and Text Aside

- Icon role: quiet monochrome anchor.
- Icon scale: secondary to title and body text.
- Placement rule: icon never fills empty space alone.
- Fit rule: icon and text share a stable center line.

## Overflow Guard

- Text fit: region bounds are validated before output.
- Tables: cell text uses middle alignment and coherent margins.
- Continuation slides: dense content splits before unreadable shrink.
- Cleanup: decorative-only bullets and empty artifacts are removed.

## Image Safe Frame

- Image role: picture content uses an internal safe frame.
- Surface rule: background decoration stays outside the picture bounds.
- Bounds rule: child images never exceed their owning image region.

![Safe frame diagram](examples/theme-preview-en/assets/safe-frame.svg)

## Mixed Object Packing

- Reading order: chart and table remain the primary evidence.
- Image role: visual evidence stays bounded in a separate safe frame.

```chart
labels: Parse, Plan, Render
Score: 78, 86, 93
```

| Object | Signal |
| --- | --- |
| Chart | trend |
| Image | bounded |

![Safe frame diagram](examples/theme-preview-en/assets/safe-frame.svg)

## Actions Output Review

- Workflow: `Theme Preview` builds this source across decoration styles.
- Gallery: Pages shows each styled deck and object-check slide.
- Ownership: MDPR owns rendering; `mdpr-skill` may prepare hints.
