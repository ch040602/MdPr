# README Preview TODO

README imagery must be generated from the same Markdown-to-MDPR pipeline used
for all decks. The source of truth is `examples/theme-preview-en/deck.md`, and
README pages reference PNG slides exported from generated PPTX files.

## Completed

- Removed the README-only teaser generation path from `preview:readme`.
- README pages now reference `docs/theme-preview/slides/magazine/slide-04.png`
  and `docs/theme-preview/slides/grid/slide-10.png` as generated PPTX PNGs.
- README preview evaluation now fails if README pages refer to retired
  `docs/assets/readme-slides` outputs or target-specific teaser script names.
- The shared theme preview source now includes an `Image Safe Frame` slide, and
  preview evaluation requires that slide to be present.
- Theme preview evaluation now checks the generated PPTX image slide and fails
  if a Markdown picture is not inside a surfaced safe frame with minimum inset.
- The shared theme preview source now includes a `Mixed Object Packing` slide
  that keeps chart, table, body text, and image regions together on one slide.
- The shared theme preview source now includes a `Decoration Pattern Catalog`
  slide with 36+ named decoration and layout patterns.
- The Actions preview now renders 8 pruned decoration styles and excludes
  styles that behave like palette-only or background-only swaps.
- README preview evaluation records SHA-256 visual fingerprints for selected
  `docs/theme-preview/slides/*` documentation preview images without creating
  README-only assets.
- Generic preview QA documentation now describes image safe-frame checks, mixed
  object packing checks, and documentation preview fingerprints.

## Prioritized TODO

No remaining README preview TODOs. Continue future improvements in the generic
theme-preview QA and renderer/layout TODO documents.
