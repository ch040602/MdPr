# 03. Page Splitting Rules

## Heading Rules

```text
#     cover or section
##    slide candidate
###   subsection or autosplit boundary
####  in-body heading
```

## Procedure

```text
1. Parse CommonMark/GFM Markdown into an AST.
2. Convert the AST into MDPR `BlockIR` while preserving presentation-relevant
   semantics.
3. Normalize Pandoc JSON into `BlockIR` when `--parser pandoc` is selected.
4. Build the heading tree.
5. Create slide candidates from h2 sections.
6. Calculate density for each candidate.
7. Keep candidates below the density threshold together.
8. Split explicit `---` slide separators first.
9. Split overloaded candidates by h3 sections.
10. Split candidates without h3 sections by block groups.
11. Split long paragraphs by Markdown lines and sentence chunks.
12. Split long lists by list chunks.
13. Move tables, images, and code into dedicated slide candidates when needed.
14. Insert cover and table-of-contents slides.
15. Split generated table-of-contents slides into continuation slides when the
    entry count exceeds the bounded TOC capacity.
```

## Density Scores

| Element | Default Score |
| --- | ---: |
| Short paragraph | 1 |
| Long paragraph | 2 |
| Bullet item | 1 |
| Nested bullet | 1.5 |
| Heading | 1 |
| Small table | 4 |
| Large table | 8 |
| Image | 5 |
| Short code block | 5 |
| Long code block | 9 |
| Quote | 3 |

```text
0-8      keep on one slide
9-14     try layout optimization or autosplit
15+      split
```

## Preserved Block Structure

```text
paragraph  text, Markdown lines, sentence units, links, inline emphasis runs
bulletList fallback text and structured listItems
quote      blockquote text
table      GFM table rows, including escaped cell delimiters
code       fenced code with language
image      Markdown image references
html       raw HTML blocks for downstream renderers/validators
diagram    pipeline nodes and edges
slideBreak explicit `---` separator
```

## Pandoc Mode

```bash
mdpresent build deck.md --parser pandoc --to pptx,html --out dist
```

Pandoc mode is an advanced compatibility path and requires `pandoc` on `PATH`.
The default parser already uses a built-in CommonMark/GFM AST path and does not
shell out to Pandoc. Pandoc mode uses Pandoc only to obtain a Markdown AST, then
adapts that tree into MDPR-owned semantics:

```text
Markdown
  -> Pandoc JSON AST
  -> MDPR Pandoc adapter
  -> MDPR BlockIR with diagrams, chart fences, structured lists, tables,
     images, code, quote, HTML, and Div attributes
  -> Outline Tree
  -> Split Planner
  -> Presentation IR
```

Pandoc mode must not choose slide coordinates, colors, decorations, visual emphasis, or z-order.
Those decisions remain in MDPR layout, design, validation, and renderer stages.

## Structured Lists and Emphasis

```text
BlockIR.items       plain text fallback
BlockIR.listItems   ordered/unordered flag, numeric marker, nesting level, inline runs
BlockIR.listKind    ordered, unordered, or mixed
```

Decorative empty bullets are removed during parsing. Inline Markdown emphasis is preserved as `InlineRunIR` so PPTX and HTML renderers can map bold and italic to native target-format styling.

## Split Strategy

```ts
type SplitStrategy =
  | "none"
  | "by-heading"
  | "by-block-group"
  | "by-list-chunk"
  | "by-table"
  | "by-media"
  | "continuation";
```

## Long List Continuation

MDPR preserves compact 4-item grids when the item text is short. If a 4-item
list contains very long item text, it is split into 2-item continuation slides
before layout validation has to force text down to the readable font floor.

Longer lists keep the same per-slide capacity, but MDPR balances the generated
chunks so the final continuation is not a sparse orphan tail:

```text
4 very long items  -> 2 + 2 continuation
5 long items       -> 3 + 2 continuation
6 short items      -> 3x2 grid
7+ items           -> balanced list chunks within the existing capacity
```

The rule applies to list blocks only. A single diagram or graph block remains a
single slide-level object and is not split across continuation pages.

## Long Table Continuation

Long Markdown tables split before layout so cell text and row spacing remain
readable. The header row is repeated on each continuation slide.

```text
header + 1-6 data rows   -> one table slide
header + 7+ data rows    -> table continuation chunks
chunk size               -> header + 6 data rows
```

This keeps native PPTX table rendering editable while avoiding tiny table text
or off-slide rows.

## Split Override Example

```yaml
operations:
  - op: setSplit
    target:
      slideId: problem-definition-a12bc
    value:
      forceSingleSlide: true
      maxDensity: 14
```

## Stable ID Policy

Slide numbers may change after autosplitting, so overrides should target `slideId` instead of `slideIndex`.

```text
slugified-title + short-hash(headingPath + duplicate occurrence)
```

Stable IDs are preserved when body content is inserted above or below an existing heading and the heading path remains the same. They are not preserved when heading text, heading level, duplicate heading order, or autosplit candidate structure changes.

## Generated TOC Capacity

Generated table-of-contents slides are list slides, not semantic diagrams. When
the deck has many h2 sections, MDPR splits the TOC into continuation slides with
at most 14 entries per slide, then balances entries across the required slide
count. For example, 16 entries become 8 + 8 and 23 become 12 + 11. This prevents
TOC item regions from leaving the slide bounds without leaving a sparse final
page, while preserving graph and diagram slides as whole objects.
