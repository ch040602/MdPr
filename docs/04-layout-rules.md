# 04. Layout Selection Rules

## Selection Formula

```text
SlideIntent + itemCount + blockType + density -> LayoutPreset
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

## Planner Pseudocode

```ts
function chooseLayout(slide, config) {
  if (slide.intent === "comparison") return comparisonHorizontal();
  if (slide.intent === "table") return tableFocus();
  if (slide.intent === "image") return chooseImageLayout(slide);
  if (slide.intent === "code") return codeFocus();
  if (slide.intent === "timeline") return timeline();
  if (slide.intent === "diagram") return pipeline();

  const itemCount = countPrimaryItems(slide);
  if (itemCount > 0) return chooseItemLayout(itemCount);

  return titleBody();
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
