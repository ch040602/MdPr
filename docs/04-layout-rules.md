# 04. Layout Selection Rules

## Selection Formula

```text
SlideIntentScoreProfile + itemCount + blockType + density
  -> candidate LayoutPresets
  -> deterministic score
  -> selected LayoutPreset
```

## Intent Detection

| Condition | Intent |
| --- | --- |
| Before/After, As-Is/To-Be, pros/cons, two opposed groups | comparison |
| Dates, stages, phases, repeated steps | timeline |
| Large table | table |
| Image is more important than body text | image |
| Code block | code |
| Quote-centered slide | quote |
| `A => B => C` or `A -> B -> C` pipeline syntax | diagram |
| Multiple examples, methods, or features | grid or list |
| General prose | standard |

Intent detection emits a compatibility `primaryIntent` plus a score map and
secondary intents. Mixed slides such as table + chart + metrics can therefore
route to compound layouts instead of losing secondary evidence.

```ts
type SlideIntentScores = {
  comparison: number;
  evidence: number;
  metric: number;
  chart: number;
  table: number;
  image: number;
  workflow: number;
  timeline: number;
  code: number;
  summary: number;
};
```

## Count-Based Layouts

| Item Count | Default Preset | Alternative |
| ---: | --- | --- |
| 1 | single-card | title-body |
| 2 | comparison | two-cards |
| 3 | vertical-list | three-cards |
| 4 | grid 2x2 | quadrant |
| 5 | pentagon radial | vertical-list |
| 6 | grid 3x2 | grid 2x3 |
| 7+ | vertical-list | autosplit |

## Presets

```text
cover
toc
section-divider
title-body
key-message
comparison
vertical-list
grid
pentagon
timeline
table-focus
image-focus
image-left
image-right
code-focus
quote
summary
pipeline
chart-table
text-icon-aside
pipeline-one-page
```

## Pipeline Diagram Routing

A single Markdown line with `=>` or `->` between two or more labels becomes a semantic pipeline diagram.

```md
Draft => Review => Render => Validate
```

The parser emits ordered nodes and directed edges. The layout planner routes the slide to the `pipeline` preset and creates a `diagram` region. Renderers must preserve the node/edge relationship rather than flattening the flow into bullets.

## Composition Grammar

Renderers may apply a non-positioning composition layer from the selected `LayoutSpec`. This layer changes visual hierarchy without changing Layout IR coordinates.

```text
cover        larger title scale and a single identity rule
toc          compact navigational grouping
grid         card offset rhythm inside fixed region bounds
pipeline     bounded diagram surface and connector clarity
chart-table  chart emphasis plus table/evidence pairing
```

The composition layer must not move regions outside the slide, reduce text below the minimum font size, or flatten editable objects into screenshots.

## Candidate Scoring

The layout planner ranks a small deterministic candidate set before selecting
the final preset. Candidate scores are penalties, so lower totals win.

```ts
type LayoutCandidateScore = {
  overflowPenalty: number;
  minFontPenalty: number;
  objectCoveragePenalty: number;
  readingOrderPenalty: number;
  whitespacePenalty: number;
  alignmentPenalty: number;
  emphasisPenalty: number;
  sectionConsistencyPenalty: number;
  total: number;
};
```

The score favors layouts that keep source objects visible, preserve heading to
claim to evidence reading order, avoid unnecessary font reduction, and keep
white space balanced.

## Intra-Slide Coherence Spacing

Within a single slide, actual content regions must share one spacing token
whenever they belong to the same visual row or column. This applies to body
text boxes, item boxes, images, tables, charts, code blocks, diagrams, icons,
and other object regions represented in Layout IR. Title, subtitle, footer, and
page-number chrome may use separate spacing.

Spacing is compared in pixels for validation. If the Layout IR is expressed in
inches, validation normalizes gaps with `96px = 1in`. Adjacent content gaps in a
comparable row or column should not drift by more than `8px`; otherwise the
slide is reported as an intra-slide coherence warning. Renderers must preserve
the validated Layout IR positions rather than hiding uneven spacing with
target-specific adjustments.

The linear spacing rule is scoped to deterministic row and column groups only.
It checks slides with at least three scoped content regions and at least one
comparable same-row or same-column gap group. Nonlinear radial layouts, including
the pentagon preset, are reported as skipped for this linear rule rather than
passed. Slides with too few scoped regions or no comparable linear groups are
reported as not applicable. The coherence summary records checked, skipped, and
not-applicable slide counts so a release profile can fail only covered
deterministic cases and can separately decide whether skipped radial layouts
need their own validator.

## Text/Background Luminance Coherence

The resolved Layout IR theme must use text colors that behave as grayscale
black/white brightness adjustments of the slide background. Validation reports
`TEXT_BACKGROUND_LUMINANCE_MISMATCH` when the final text color is not grayscale
within a 2-channel drift, does not move lighter on dark backgrounds or darker on
light backgrounds, or falls below a 4.5:1 text/background contrast ratio.

## Planner Pseudocode

```ts
function chooseLayout(slide, config) {
  return rankLayoutCandidates(slide, config)[0].layout;
}
```

## Safe Area

Safe areas and avoid zones keep generated content away from master-slide background elements.

```yaml
safeArea:
  content:
    x: 0.8
    y: 1.2
    w: 11.7
    h: 5.3
  avoid:
    - id: footer
      x: 0
      y: 6.7
      w: 13.33
      h: 0.8
```
