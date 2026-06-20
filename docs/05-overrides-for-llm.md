# 05. Override Manifest

## Purpose

An override manifest lets a human or script adjust selected slides without
changing the Markdown source. A separate skill may suggest semantic intent or a
reason string, but MDPR does not call an agent and does not accept agent-authored
final visual instructions as runtime authority.

## Principles

1. Support YAML and JSON.
2. Validate manifests with JSON Schema.
3. Prefer `slideId` over `slideIndex`.
4. Treat direct coordinate edits as advanced operations.
5. Prefer `setLayout`, `setTypography`, and `setBackground` before lower-level slot edits.
6. Allow an optional `reason` on each operation.
7. Verify results with `validate` and `diff`.

## Recommended Workflow

```bash
mdpresent inspect deck.md --json > deck.plan.json
```

Example manifest:

```yaml
version: "1.0"

operations:
  - op: setLayout
    target:
      slideId: main-features-a13f92
    value:
      preset: grid
      columns: 2
      rows: 2
    reason: "Four primary features fit a 2x2 grid."

  - op: setLayout
    target:
      slideId: as-is-to-be-991af
    value:
      preset: comparison
      direction: horizontal
    reason: "The slide compares two opposed states."
```

## Target Priority

```text
slideId > headingPath > title > slideIndex > intent
```

`slideId` is preserved when body content is inserted above or below an existing heading and the heading path stays the same. It is not preserved when heading title, heading level, duplicate heading order, or autosplit candidate structure changes.

## Operations

```text
setLayout
setTypography
setBackground
setOverflow
setSplit
setSlot
moveBlock
hideBlock
pinBlock
```

## Execution Phases

```text
Pre-layout phase:
  setSplit

Post-layout phase:
  setLayout
  setTypography
  setBackground
  setOverflow
  setSlot
  moveBlock
  hideBlock
  pinBlock
```

`setSplit` changes slide generation, so it must run before `Presentation IR` is planned and before `Layout IR` exists.

## Examples

```yaml
operations:
  - op: setTypography
    target:
      slideId: main-features-a13f92
    value:
      bodyFontSize: 21
      minFontSize: 18

  - op: setSlot
    target:
      slideId: comparison-as-is-to-be-291ab
      slot: left
    value:
      x: 0.8
      y: 1.6
      w: 5.6
      h: 4.8
```

## Guardrails

- Avoid `slideIndex` unless there is no stable semantic target.
- Use `forceSingleSlide` only when explicitly requested because it increases overflow risk.
- Do not set `minFontSize` below the configured readable floor.
- Try preset changes before manual coordinate changes.
