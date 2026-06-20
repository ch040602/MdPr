# README Teaser Improvement TODO

This document tracks follow-up work for README teaser generation after the
picture-frame and text-fit safeguards were added.

## Completed Safeguards

- Rectangular picture-safe frames are now the only supported preview image
  container in the README showcase teaser.
- Circular shapes are reserved for marker glyphs, not image masks.
- Teaser text boxes are fitted before insertion and recorded in the asset report.
- README asset evaluation now fails on slide bounds, text-fit, circular-picture,
  and picture-frame safe-area violations.

## Remaining TODO

- Add rendered-PNG pixel checks for teaser text clipping, because PowerPoint can
  render slightly lower than the static text estimate.
- Add a visual-diff threshold for teaser regeneration so accidental layout drift
  is visible in CI artifacts.
- Add a small golden metadata test for `readme-slide-assets-report.json` so the
  validation contract cannot be weakened silently.
- Replace hard-coded teaser coordinates with named regions once the README hero
  layout stabilizes.
- Add a compact alt-text generator for teaser images that mirrors the final
  visible hierarchy without describing hidden implementation details.
