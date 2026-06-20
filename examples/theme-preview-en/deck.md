# MDPR Style and Object QA

## Preview Purpose

> This Actions/Pages deck is a visual QA fixture for MDPR decoration styles and editable object rendering.

The same semantic Markdown is rendered once per built-in decoration style.
Use the slide list to compare surface grammar, typography, spacing, table coherence, chart contrast, and connector clarity.

## Style Families

- Plain and clean: low-decoration baselines for dense source material.
- Executive and technical: structured operational layouts with visible hierarchy.
- Editorial and magazine-like styles: warmer page rhythm without losing bounded text.
- Minimalism and newmorphism: sparse composition or soft raised surfaces.
- Glass, grid, and data styles: visibly different background and surface grammar.

## Theme Style Checks

- **Surface grammar**: cards, rails, title rules, and proof callouts should change by style.
- **Color harmony**: sequential emphasis uses brightness variation; contrast uses hue opposition.
- **Typography**: same-role text keeps coherent size and readable line height.
- **Spacing**: text stays inside card/table bounds with visible inner padding.

## Markdown Semantics

- Headings: slide boundaries and title regions are stable.
- Lists: ordered and unordered items remain structured.
- Label detail: Constraint: renderer rules stay deterministic.
  The description line must be indented under the bold label.
- Emphasis: **bold** and *italic* runs remain editable text styling.

## Pipeline Diagram

Markdown source => Parse blocks => Split slides => Layout objects => Validate overflow => Render PPTX HTML PDF

- One diagram block must stay on one slide.
- Connectors should attach to node boundaries.
- Straight or elbow routing should remain clear in every theme.

## Table Coherence

| Object | Renderer expectation | QA signal |
| --- | --- | --- |
| Text box | editable, vertically aligned | readable at minimum size |
| Table | native table object | header fill and cell padding |
| Diagram | nodes and connectors | no clipped labels |
| Chart | style-colored data object | contrast and legend clarity |

## Chart and Table Pair

Chart slides may keep numeric evidence beside a compact table when both are needed.

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
- Circle vine: compact relationship marker.
- Two-corner panel: linear grouping.

## Icon and Text Aside

MDPR may add a restrained monotone icon only when the slide would otherwise be plain text.

- Icons stay secondary to the text.
- The icon box is centered in its slot.
- Brand icons require explicit brand terms.
- Generic object icons are used as fallbacks.

## Overflow Guard

- Text fit: region bounds are validated before output.
- Tables: cell text uses middle alignment and coherent margins.
- Continuation slides: dense content splits before text becomes unreadable.
- Cleanup: decorative-only bullets and empty artifacts are removed.

## Actions Output Review

- The `Theme Preview` workflow builds this source across built-in decoration styles.
- The Pages gallery lets reviewers inspect each styled deck and each object-check slide.
- The companion `mdpr-skill` repository can prepare optional reasoning hints, but MDPR owns final rendering.
