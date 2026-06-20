# 11. QA and Overflow Policy

## QA Checks

```text
- text overflow
- table overflow
- missing images
- invalid asset paths
- overlapping page numbers
- safe-area violations
- minimum font size violations
- missing override targets
- slot coordinates outside slide bounds
- design lock drift
- manifest visual-validation summary
```

## Overflow Resolution Order

```text
1. Place content with the default font size.
2. Measure overflow.
3. Try a layout variant.
4. Shrink down to the configured readable font floor.
5. Create continuation slides.
6. Emit warn or fail diagnostics if content still does not fit.
```

Recommended defaults:

```text
normal build: split
CI/test: fail
design review: warn
```

## Diagnostics

Executable validation checks must emit diagnostics for:

```text
TEXT_OVERFLOW
LAYOUT_REGION_OUT_OF_BOUNDS
LAYOUT_MIN_FONT_SIZE_VIOLATION
```

Diagnostic level follows the slide overflow policy:

```text
overflowPolicy.action = fail  -> error
overflowPolicy.action != fail -> warning
```

Safe-area and slot-bound checks use the same MVP rule: a region must stay inside the slide rectangle.

Minimum font size validation compares the effective region font size against `region.typography.minFontSize`, then `overflowPolicy.minFontSize`, then the theme minimum.

## Text Normalization

Markdown normalization happens before overflow validation and rendering. Repeated spaces and tabs collapse inside paragraph lines, inline emphasis runs, list text, and table cells so measured text matches rendered text.

Simple Markdown table blocks carry both row data and validation text, matching Pandoc tables. PPTX table rendering clamps compact table font size to the same readable minimum instead of shrinking to an independent floor.

## Title Regions

Title regions use the same overflow path as body regions. The layout planner adds a stable pseudo block id for each slide title, and CLI validation maps that pseudo block to the `Presentation IR` slide title. This prevents renderers from injecting long titles that were never checked by `validate`.

## Pre-Render Text Containment Resolver

Before validation and rendering, the CLI applies a conservative text containment pass to the planned `Layout IR`.

```text
1. Build Presentation IR and initial Layout IR.
2. Measure region text with the same overflow validator used by `validate`.
3. For TEXT_OVERFLOW under reflow/shrink/split policies, reduce region font size down to the configured minimum.
4. If the font is already at minimum and slide bounds allow it, expand region height slightly.
5. Re-run measurement for a bounded number of iterations.
6. Do not auto-resolve `fail` or `warn`; those remain explicit diagnostics.
```

The resolver does not change slide order, drop content, or move unrelated regions. If it cannot make text fit without violating minimum font size or slide bounds, the normal overflow diagnostic remains.

## Text Measurement MVP

The initial measurement model may be approximate:

```ts
const averageCharWidth = fontSize * 0.52;
const charsPerLine = Math.floor(regionWidthPx / averageCharWidth);
const lines = Math.ceil(text.length / charsPerLine);
```

Current measurement uses display width rather than raw character count. Wide scripts are treated as wider than ASCII, and explicit newline boundaries from `BlockIR.sentences` or `BlockIR.lines` are measured as separate lines.

## Build Manifest and Design Lock

Every build emits two audit files next to the rendered deck:

```text
mdpresent-design-lock.json
mdpresent-manifest.json
```

The design lock records the resolved decoration style, color seed, harmony rule, palette seed, PowerPoint theme colors, typography, and surface policy. A supplied `--design-lock` path must match the resolved contract unless `--update-design-lock` is used.

The manifest records source/config hashes, rendered outputs, diagnostics, overflow status, and optional `--visual` structural summaries. Visual summaries do not replace rendered screenshot review; they catch deterministic geometry regressions such as out-of-bounds regions, unreadable font floors, and region-count drift.

## Actions Preview Evaluation

`scripts/evaluate-theme-preview.mjs` checks generated `docs/theme-preview` artifacts after `scripts/build-theme-preview.mjs` runs. The builder renders PPTX decks first, exports each slide to PNG, and then writes an HTML gallery shell.

Generated TOC slides are bounded before layout by splitting long TOCs into
continuation slides. This keeps large Markdown corpora from creating off-slide
TOC regions while preserving non-TOC diagrams and graphs as single slide-level
objects.

The evaluator verifies:

- only distinct decoration-style PPTX decks are present
- legacy color-only preset decks are absent from the Actions gallery
- every expected style has a non-empty PPTX file
- every style has a complete set of exported PNG slides at the expected `1600x900` size
- PNG files are large enough to reject blank or failed rasterization output
- the manifest maps each style to its PPTX and slide PNG files
- required composition classes, proof-object kinds, and surface variants are represented in the manifest
- generated PPTX media includes required surface markers
- the gallery has the `pptx-png` marker and does not fall back to legacy iframe-based HTML deck previews

## Future Improvements

```text
- canvas-based measurement
- font metric integration
- renderer-specific correction factors
- script-aware width profiles
- OCR or perceptual screenshot scoring
```
