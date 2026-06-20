# 11. QA와 Overflow 정책

## QA 검사 항목

```text
- 텍스트 overflow
- 표 overflow
- 이미지 누락
- asset 경로 오류
- page number 겹침
- safe area 위반
- minFontSize 위반
- override target 미존재
- slot 좌표 범위 초과
- design lock drift
- manifest visual-validation summary
```

## Overflow 처리 순서

```text
1. 기본 font size로 배치
2. overflow 검사
3. layout variant 변경 시도
4. 최소 폰트 크기까지 shrink
5. continuation slide 생성
6. 그래도 실패하면 warn 또는 fail
```

## CLI 옵션

```bash
--on-overflow split
--on-overflow shrink
--on-overflow warn
--on-overflow fail
```

권장 기본값:

```text
일반 build: split
CI/test: fail
디자인 검토: warn
```

## Validation behavior

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

Safe-area and slot-bound checks use the same bounds rule in the MVP: a region must stay inside the slide rectangle.

Min font size validation compares the effective region font size against `region.typography.minFontSize`, then `overflowPolicy.minFontSize`, then the theme minimum.

Markdown normalization happens before overflow validation and rendering. Repeated spaces and tabs collapse inside paragraph lines, inline emphasis runs, list text, and table cells so measured text matches rendered text.

Simple Markdown table blocks carry both `rows` and validation `text`, matching Pandoc tables. PPTX table rendering clamps its compact table font to the same readable minimum rather than shrinking to an independent floor.

## Title regions

Title regions are validated with the same overflow path as body regions. The layout planner adds a stable pseudo block id for each slide title, and the CLI validation content index maps that pseudo block to the `Presentation IR` slide title. This prevents renderers from injecting a long title that was never checked by `validate`.

## Pre-Render Text Containment Resolver

Before validation and rendering, the CLI applies a conservative text containment pass to the planned `Layout IR`.

Behavior:

```text
1. Build Presentation IR and initial Layout IR.
2. Measure region text through the same overflow validator used by `validate`.
3. For TEXT_OVERFLOW under reflow/shrink/split policies, reduce the region font size down to the configured minimum.
4. If the font is already at minimum and slide bounds allow it, expand the region height slightly.
5. Re-run measurement for a bounded number of iterations.
6. Do not auto-resolve `fail` or `warn` policies; those remain explicit diagnostics.
```

The resolver does not change slide order, drop content, or move unrelated regions. When it cannot make text fit without violating the minimum font size or slide bounds, the normal overflow diagnostic remains.

## Text measurement MVP

초기 구현은 근사치로 시작해도 된다.

```ts
const averageCharWidth = fontSize * 0.52
const charsPerLine = Math.floor(regionWidthPx / averageCharWidth)
const lines = Math.ceil(text.length / charsPerLine)
```

Current measurement uses display width rather than raw character count. CJK/Hangul characters are treated as wider than ASCII, and explicit newline boundaries from `BlockIR.sentences` or `BlockIR.lines` are measured as separate lines.

## Build Manifest and Design Lock

Every build emits two audit files next to the rendered deck:

```text
mdpresent-design-lock.json
mdpresent-manifest.json
```

The design lock records the resolved decoration style, color seed, harmony rule, palette seed, PowerPoint theme colors, typography, and surface policy. A supplied `--design-lock` path must match the resolved contract unless `--update-design-lock` is used.

The manifest records source/config hashes, rendered outputs, diagnostics, overflow status, and optional `--visual` structural summaries. Visual summaries do not replace rendered screenshot review; they catch deterministic geometry regressions such as out-of-bounds regions, unreadable font floors, and region-count drift in CI-friendly form.

## Actions preview evaluation

`scripts/evaluate-theme-preview.mjs` checks the generated `docs/theme-preview` HTML after `scripts/build-theme-preview.mjs` runs. It verifies:

- only distinct decoration-style pages are present
- legacy color-only preset pages are absent from the Actions gallery
- each generated deck contains required composition markers
- tables render as structured HTML tables
- proof objects render as `arc-ring`, `gauge`, and `connected-strip` objects
- all absolutely positioned regions stay inside the slide rectangle
- body and item regions stay at or above the readable font floor
- pipeline connector coordinates are finite, in bounds, and present for each graph
- glass preview pages include frosted fill and browser glassmorphism filters
- singleton decorative-dot surface variants are rejected in generated preview pages

This evaluator is deterministic and complements manual visual review.

추후 개선:

```text
- canvas 기반 측정
- font metrics 반영
- PPTX renderer별 보정 계수
- 한국어/영어/숫자/코드 문자 폭 분리
```
