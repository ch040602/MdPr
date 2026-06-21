# README Preview TODO

README imagery must be generated from the same Markdown-to-MDPR pipeline used
for all decks. The main teaser source is `examples/readme-teaser/deck.md`
rendered with `--pipeline-one-page`; gallery preview source remains
`examples/theme-preview-en/deck.md`. README pages reference PNG slides exported
from generated PPTX files.

## Completed

- Removed the README-only teaser generation path from `preview:readme`.
- README pages now reference `docs/assets/readme-teaser/slides/slide-01.png`
  for the main teaser and `docs/theme-preview/slides/grid/slide-10.png` for
  the runtime pipeline image. Both are generated PPTX PNGs.
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
- Added `--pipeline-one-page` mode so a compact multi-section Markdown teaser
  can render as one PPTX slide with separated pipeline, feature, chart, and
  table regions.
- Replaced the main README teaser with
  `docs/assets/readme-teaser/slides/slide-01.png`, generated from
  `examples/readme-teaser/deck.md` through the normal MDPR CLI and PowerPoint
  PNG export path.
- Renamed the generated gallery title from `PPTX Theme QA Gallery` to
  `PPTX Theme Validation Gallery`, and evaluator checks now reject the legacy
  QA title.
- README preview evaluation now compares the `examples/readme-teaser/deck.md`
  SHA-256 against the generated teaser manifest, so stale teaser PNG/PPTX
  references fail deterministically after source changes.
- README preview image selection is title-based from `preview-manifest.json`,
  so inserting, deleting, or reordering slides cannot silently point README
  preview slots at the wrong PNG.
- README preview evaluation records the selected preview images by semantic
  slide title and verifies each selected PNG still maps back to the expected
  generated manifest title.
- Runtime-facing architecture, rendering, and overflow docs now use
  `validation` wording for MDPR-owned deterministic checks; skill-side
  critique and visual review language remains outside the MDPR runtime path.
- `preview:readme` explicitly rebuilds the main teaser from
  `examples/readme-teaser/deck.md` with `--pipeline-one-page`, exports the PPTX
  to `docs/assets/readme-teaser/slides/slide-01.png`, and only then evaluates
  README preview contracts.
- The main teaser source is intentionally compact and names the key proof
  points: PPTX-first output, no agent runtime, 8 themes, 36+ patterns, 12 object
  families, and deterministic coherence checks.

## Prioritized TODO

README preview generation itself is complete. Remaining improvements are role
boundary and validation hardening work:

- [ ] Add README contract tests that assert all language variants mention
  `LLM-advised quality` through `mdpr-skill`, while MDPR remains no-agent and
  owns final rendering.
- [ ] Move high-level visual critique guidance out of MDPR docs and link to the
  skill-side review loop documentation.
