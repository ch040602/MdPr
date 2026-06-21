# 14. Quality and Performance Roadmap

This roadmap records the agent-free quality improvements requested for MDPR.
The runtime must keep Markdown semantics authoritative: no summary generation,
no content rewriting, and no agent dependency in the build path.

## Current Implementation Status

Implemented in the deterministic runtime:

- Rich text measurement input and result fields with font-metric confidence.
- Script-aware width estimates for CJK, ASCII, punctuation, emoji, inline code,
  bold, italic, monospace/code, and role-specific text.
- CJK prose wrapping that avoids false horizontal overflow while keeping code
  and monospace content less breakable.
- Intent score profiles with primary and secondary intents.
- Coherence groups with deterministic block role classification.
- Layout candidate scoring with object coverage, reading order, whitespace,
  emphasis, and overflow penalties.
- Same-depth item surface coherence for HTML and PPTX decoration output.
- Baseline-relative performance regression checks for timing and quality
  counters.
- Manifest coherence summaries and `validate --coherence` diagnostics for
  claimless evidence, detached captions, orphan tables, and low object
  coverage.
- Very long 4-item lists split into 2+2 continuation slides before they become
  unreadable 2x2 grid slides.
- Long Markdown tables split into continuation slides with repeated headers.
- Manifest overflow-resolution summaries report pre-split continuation groups,
  continuation reasons, font-shrink counts, and graph/diagram split protection.
- Code continuation reasons are covered by a build manifest fixture.
- Post-layout candidate retry can replace an overflowing automatic text layout
  before font shrink while preserving explicit override layouts.

Remaining roadmap items are listed below.

## Highest Priority

1. Replace MVP text measurement with a quality measurement engine.
   - Use rich text runs, box size, font family, font size, line height, role,
     and locale as the measurement input.
   - Report line count, used width, used height, X/Y overflow, and confidence.
   - Separate CJK, monospace, punctuation, emoji, inline code, bold, italic,
     bullet indentation, table cells, and code blocks.
   - Keep heuristic fallback, but record confidence in diagnostics and
     manifests.
   - Add renderer calibration factors for PPTX, HTML, and PDF.

2. Move layout choice from single if/else preset selection to deterministic
   candidate scoring.
   - Generate 3-5 layout candidates per slide.
   - Score overflow, minimum font, object coverage, reading order, whitespace,
     alignment, emphasis, and section consistency.
   - Prefer the least bad measurable layout rather than guessing a design.

3. Resolve overflow through reflow and deterministic splitting before font
   shrink.
   - Split very long 4-item lists before grid layout forces unreadable shrink
     (implemented).
   - Split long Markdown tables with repeated headers before table layout
     forces unreadable shrink (implemented).
   - Try alternate layout candidates before shrink when no explicit override is
     active and the slide is not a chart/diagram slide (implemented for safe
     automatic text layouts).
   - Reposition regions (planned).
   - Add code-specific manifest strategy fixtures (implemented).
   - Shrink fonts only as a late fallback.
   - Emit diagnostics when content still cannot fit.

4. Add a coherence-oriented semantic grouping layer.
   - Classify block roles such as claim, evidence, metric, example, risk,
     decision, action, caption, source, and appendix.
   - Group slides as argument, comparison, workflow, evidence-pack, or summary.
   - Preserve chart/table/image explanation proximity, image-caption pairs,
     continuation title quality, and section motif continuity.

5. Improve intent detection from ordered keyword checks to a score profile.
   - Keep a primary intent for compatibility.
   - Add secondary intents and score maps for mixed slides.
   - Use metric/table/image/chart/workflow evidence signals to select compound
     layouts such as chart-table, image-left, table-focus, and evidence-grid.

## Performance Improvements

- Reduce repeated `render-pptx` searches by creating slide and block maps.
- Reuse sorted surface/content region lists.
- Merge PPTX theme color and glow-effect ZIP post-processing into one pass.
- Add fast and compact output modes.
- Add `--profile` manifest timing for parse, plan, measure, renderPptx,
  zipPostProcess, pdfExport, and output bytes.
- Add performance regression checks against baselines instead of absolute CI
  time.
- Cache text, table, image, chart-label, diagram, contrast, and overlap
  measurements by content, region, typography, and renderer hash.

## PDF Export Follow-Up

- Add `mdpresent doctor --pdf`.
- Record exporter engine, version, command hash, source PPTX hash, and duration
  in the manifest.
- Add a real LibreOffice smoke test in the Ubuntu CI path used by theme preview.

## Deterministic Author Control

Formalize lightweight Markdown directives:

```md
<!-- mdpr: section=Product role=claim emphasis=primary -->
<!-- mdpr: group=evidence keepTogether=true -->
<!-- mdpr: splitBefore=true -->
<!-- mdpr: layout=table-focus -->
```

Supported directive goals:

- `role=claim`
- `role=evidence`
- `group=...`
- `keepTogether=true`
- `emphasis=primary`
- `splitBefore=true`
- `splitAfter=true`
- `layout=table-focus`
- `density=low|medium|high`
- `sectionAccent=...`

## Coherence Diagnostics

Add diagnostics for:

- `CLAIMLESS_EVIDENCE_SLIDE` (implemented)
- `DETACHED_CAPTION` (implemented)
- `ORPHAN_TABLE` (implemented)
- `LOW_OBJECT_COVERAGE` (implemented)
- `SECTION_STYLE_DRIFT` (planned)
- `DENSE_CONTINUATION_WITHOUT_TITLE` (planned)

The manifest includes counts for orphan evidence blocks, detached captions,
claimless slides, section motif drift, continuation title quality, and mixed
object grouping score. Section motif drift and continuation title quality are
currently structural placeholders until section-state tracking and continuation
split naming are implemented.

## Section-Level Design Continuity

Track section design state:

```ts
type SectionDesignState = {
  sectionId: string;
  accentColor: string;
  motif: "bar" | "card" | "rail" | "corner" | "plain";
  preferredTitleRegion: Rect;
  preferredLayoutFamily: string[];
};
```

Rules:

- Use one accent color per top-level section.
- Keep title placement consistent within a section.
- Select one icon motif per section.
- Prefer the same layout family for continuation slides.
- Use low-density first content slides after section dividers.
- Add transition layouts when object types change abruptly.

## Schema and Build Correctness

- Treat TypeScript unions as the source of truth.
- Generate JSON schemas from exported unions where practical.
- Add schema drift tests for layout presets and slide intents.
- Implement or reject override operations consistently.
- Make build use the same validation gate as validate before rendering.
- Add `--strict`, `--allow-warnings`, `--visual`, and `--coherence` policies.

## Test and CI Follow-Up

Add or strengthen:

- Layout IR golden snapshots.
- PPTX XML contract tests for native text/table/chart objects.
- Real PDF exporter smoke tests.
- PNG raster visual diffs.
- Text overflow corpus for CJK, code, and table cells.
- Coherence fixtures for claim/evidence/caption grouping.
- Benchmark regression tests.
- Schema drift tests.
- Dependency pinning and clean package smoke tests.
