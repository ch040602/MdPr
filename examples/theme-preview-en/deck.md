# MDPR Composition Grammar QA

## Preview Purpose

> A generated deck should show hierarchy, evidence, and object grammar before it shows decorative variation.

This Actions/Pages fixture renders the same semantic Markdown through every built-in decoration style.
The target is not color variety alone; the target is bounded, readable, composition-aware slide output.

## Composition Contract

- Cover signal: title scale and first-viewport object identity.
- Evidence rhythm: chart, table, and proof objects stay visually connected.
- Object grammar: cards, tickets, flags, and vines vary without breaking alignment.
- Connector clarity: pipeline arrows attach to object boundaries.
- Bounds discipline: no region may exceed the slide or hide essential text.

## Style Families

- Plain and clean: low-decoration baselines for dense source material.
- Executive and technical: structured operational layouts with visible hierarchy.
- Editorial and magazine-like: warmer page rhythm without losing bounded text.
- Minimalism and newmorphism: sparse composition or soft raised surfaces.
- Glass, grid, and data: visibly different background and surface grammar.

## Markdown Semantics

- **Headings**: slide boundaries and title regions are stable.
- **Lists**: ordered and unordered items remain structured.
- **Constraint**: renderer rules stay deterministic.
  The description line must be indented under the bold label.
- **Emphasis**: **bold** and *italic* runs remain editable text styling.

## Pipeline Diagram

Markdown source => Parse blocks => Split slides => Layout objects => Validate overflow => Render PPTX HTML PDF

- One diagram block stays on one slide.
- Connectors attach to node boundaries.
- Straight or elbow routing remains clear across styles.

## Table Coherence

| Object | Renderer expectation | QA signal |
| --- | --- | --- |
| Text box | editable, vertically aligned | readable at minimum size |
| Table | native table object | header fill and cell padding |
| Diagram | nodes and connectors | no clipped labels |
| Chart | style-colored data object | contrast and legend clarity |

## Chart and Table Pair

Numeric evidence should sit beside the table when both are needed for interpretation.

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
The icon is a quiet anchor, not a substitute for layout structure.

## Overflow Guard

- Text fit: region bounds are validated before output.
- Tables: cell text uses middle alignment and coherent margins.
- Continuation slides: dense content splits before text becomes unreadable.
- Cleanup: decorative-only bullets and empty artifacts are removed.

## Actions Output Review

- The `Theme Preview` workflow builds this source across built-in decoration styles.
- The Pages gallery lets reviewers inspect each styled deck and each object-check slide.
- `mdpr-skill` may prepare reasoning hints, but MDPR owns final rendering.
