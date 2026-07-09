# 11. Validation and Overflow Policy

## Validation Checks

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
- manifest coherence-validation summary
```

## Overflow Resolution Order

```text
1. Place content with the default font size.
2. Split known high-risk content groups such as very long lists into continuation slides.
3. Measure overflow.
4. Try a layout variant where the candidate set already provides one.
5. Shrink down to the configured readable font floor.
6. Emit warn or fail diagnostics if content still does not fit.
```

Recommended defaults:

```text
normal build: split
CI/test: fail
design review: warn
```

## Diagnostics

Executable validation checks live in `@mdpresent/validation` and must emit diagnostics for:

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

Overflow and font-floor diagnostics are evidence records, not editing orders.
For CJK and mixed-language text they preserve deterministic text length,
source excerpts, measured line/box data, and explicit
`rewriteApplied: false`, `summarizationApplied: false`, and
`textDeletionApplied: false` fields. Tests cover Korean, Japanese, Chinese,
mixed Latin/CJK runs, and CJK punctuation-heavy strings without relying on
screenshots, downloads, or manual Office rendering.

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
3. For TEXT_OVERFLOW under reflow/shrink/split policies, try another ranked
   layout candidate when the slide has no explicit override.
4. If no candidate improves fit, reduce region font size down to the
   configured minimum.
5. If the font is already at minimum and slide bounds allow it, expand region
   height slightly.
6. Re-run measurement for a bounded number of iterations.
7. Do not auto-resolve `fail` or `warn`; those remain explicit diagnostics.
```

The resolver does not change slide order, drop content, or move unrelated
regions. Candidate retry is disabled when an override manifest is applied, and
it does not run on chart or diagram slides so graph-like objects stay intact. If
it cannot make text fit without violating minimum font size or slide bounds, the
normal overflow diagnostic remains.

Known high-risk split rules run before this resolver. For example, four very
long list items are split into two continuation slides instead of forcing a
2x2 grid to shrink to the font floor and still overflow.

## Text Measurement

Text measurement accepts legacy plain text input and rich text runs. The
runtime records a confidence value so future renderer-specific calibration can
distinguish font-metric estimates from heuristic fallbacks.

```ts
type TextMeasureInput = {
  runs: TextRun[];
  box: { widthIn: number; heightIn: number };
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  role: "title" | "body" | "table-cell" | "code" | "caption";
  locale?: string;
};

type TextMeasureResult = {
  lineCount: number;
  usedWidthIn: number;
  usedHeightIn: number;
  overflowX: boolean;
  overflowY: boolean;
  confidence: "exact" | "font-metric" | "heuristic";
};
```

Measurement uses display width rather than raw character count. Wide scripts
are treated as wider than ASCII, CJK prose may wrap at character boundaries,
monospace/code runs are treated as less breakable, and explicit newline
boundaries from `BlockIR.sentences` or `BlockIR.lines` are measured as separate
lines. Table cells, captions, titles, body text, and code blocks use role-aware
width factors.

## Build Manifest and Design Lock

Every build emits two audit files next to the rendered deck:

```text
mdpresent-design-lock.json
mdpresent-manifest.json
```

The design lock records the resolved decoration style, color seed, harmony rule, palette seed, PowerPoint theme colors, typography, and surface policy. A supplied `--design-lock` path must match the resolved contract unless `--update-design-lock` is used.

The manifest records source/config hashes, rendered outputs, per-artifact
contracts, diagnostics, overflow status, and optional `--visual` structural
summaries. Artifact contracts include output format, path, existence, byte size,
and SHA-256 so CI can detect stale or missing PPTX, HTML, and PDF products.
The manifest also records `validation.overflowResolution`, including strategy
counts for pre-split continuation, candidate reflow, region expansion, and font
shrink; continuation reasons; continuation group counts; and whether a graph or
diagram block was split.

The manifest also exposes normalized `metrics` for companion tools and CI:
`slideCount`, `overflowCount`, coherence warning/error counts, visual
warning/error counts, polish warning count, `minFontPt`, text clip risk count,
contrast failures, connector warnings, `buildMs`, and per-format `outputBytes`.
Companion tools must prefer these normalized metrics before falling back to
diagnostic strings.

PPTX builds additionally record `pptxObjects`. Each entry maps an editable
PowerPoint output object back to `slideId`, `layoutSlideId`, `regionId`,
`blockIds`, role, object kind, and a stable `mdpr:` shape name. This is the
runtime-owned bridge contract for future PowerPoint selection tools; agent
hints and review reports must not invent coordinates or renderer object IDs.
For supported PPTX object types, MDPR also writes the same stable `mdpr:`
identifier into the generated PowerPoint shape name so selection bridges can
resolve a clicked shape back to the manifest object map.
Visual summaries do not replace rendered screenshot review; they catch
deterministic geometry regressions such as out-of-bounds regions, unreadable
font floors, low text/background contrast, same-z-index content overlap,
extreme image frame ratios, and diagram regions too small for connector
routing. The manifest records the current thresholds for minimum contrast,
maximum same-layer overlap ratio, readable font size, image aspect range, and
minimum diagram connector space.

`validation.polish` records the deterministic post-AI PPT polish gate. The gate
maps the referenced presentation-polish checklist to runtime checks:

- `00:24` font hierarchy: title/body scale, readable minimum font floor,
  configured font family, and same-role font consistency
- `02:33` layout composition: structured presets and generic blocky-slide risk
- `05:20` highlight page: quote/key-message slides for important claims
- `07:13` cover page: cover preset, visible title hierarchy, and no empty body
  artifacts
- `07:48` detail polish: overlap, clipping, contrast, image aspect, and
  connector-clearance diagnostics
- `08:45` before/after comparison: `--theme-gallery` builds with two or more
  presets record deterministic comparison evidence

The first five checks are required build-quality gates in the manifest. The
before/after comparison is optional for normal builds and passes when the build
uses at least two theme-gallery presets.

Coherence summaries are always recorded in the manifest. `validate --coherence`
promotes the same checks into user-facing diagnostics:

```text
CLAIMLESS_EVIDENCE_SLIDE
DETACHED_CAPTION
ORPHAN_TABLE
LOW_OBJECT_COVERAGE
```

The summary records claimless slide count, detached caption count, orphan table
count, section motif drift count, continuation title quality, and mixed object
grouping score. These checks use `Presentation IR.coherenceGroups` and Layout
IR block coverage; they do not rewrite or summarize source content. Caption
roles are assigned to adjacent caption paragraphs, not to the image/chart/table
object itself, so validators can check object-caption proximity explicitly.

## Actions Preview Evaluation

`scripts/evaluate-theme-preview.mjs` checks generated `docs/theme-preview` artifacts after `scripts/build-theme-preview.mjs` runs. The builder renders PPTX decks first, exports each slide to PNG, and then writes an HTML gallery shell.

Generated TOC slides are bounded before layout by splitting long TOCs into
continuation slides. This keeps large Markdown corpora from creating off-slide
TOC regions while preserving non-TOC diagrams and graphs as single slide-level
objects.

The evaluator verifies:

- only distinct decoration-style PPTX decks are present
- legacy color-only preset decks are absent from the Actions gallery
- palette-only or background-only preview styles are pruned from the generated
  gallery, while compatibility presets may remain available through the CLI
- every expected style has a non-empty PPTX file
- every style has a complete set of exported PNG slides at the expected `1600x900` size
- PNG files are large enough to reject blank or failed rasterization output
- the manifest maps each style to its PPTX and slide PNG files
- required composition classes, proof-object kinds, and surface variants are represented in the manifest
- the generated deck includes the `Decoration Pattern Catalog` slide with the
  36+ named pattern source used by README teaser imagery
- generated PPTX media includes required surface markers
- image-focused preview slides include Markdown pictures inside surfaced safe
  frames with a minimum inset, preventing pictures from touching rounded or SVG
  surface boundaries
- mixed object preview slides keep chart, table, body text, and image regions on
  one slide when the source bundle is compact enough to remain readable
- the gallery has the `pptx-png` marker and does not fall back to legacy iframe-based HTML deck previews

## Performance Regression Gate

`scripts/check-performance-regression.mjs` compares current manifest-like
performance and quality counters with a baseline. It flags timing regressions
by ratio and quality regressions when overflow count increases, minimum font
size drops, or object coverage decreases. This keeps quality checks independent
from absolute CI machine speed.

`scripts/evaluate-readme-assets.py` is a documentation-preview contract check,
not a renderer. It verifies that README pages reference PNGs exported from the
shared `examples/theme-preview-en/deck.md` preview deck and records SHA-256
fingerprints for the selected documentation preview images.

Agent-side visual critique is not part of this MDPR validation path. Run the
[`mdpr-skill` review loop](https://github.com/ch040602/mdpr-skill#usage) when a
deck needs LLM-advised critique before the deterministic MDPR build.

## Future Improvements

```text
- renderer-specific correction factors
- exact font metric integration where available
- script-aware width profiles
- OCR or perceptual screenshot scoring
```
