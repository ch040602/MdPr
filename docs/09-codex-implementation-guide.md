# 09. Codex Implementation Guide

## Read First

```text
README.md
docs/02-requirements.md
docs/03-page-splitting.md
docs/04-layout-rules.md
docs/05-overrides-for-llm.md
schemas/*.json
```

## Implementation Rules

1. Respect schemas first.
2. Keep `Presentation IR` and `Layout IR` stable.
3. Do not let renderers redo split or layout decisions.
4. Normalize overrides as operations.
5. Prefer `slideId` over `slideIndex`.
6. Do not expand preset enums without updating schemas, docs, and tests together.
7. Keep PPTX as the primary editable-object renderer.
8. Keep HTML as a preview/gallery shell.

## Milestone Commands

```bash
mdpresent inspect examples/basic/deck.md --json
mdpresent plan examples/basic/deck.md --json
mdpresent validate examples/basic/deck.md --override examples/basic/deck.override.yaml
mdpresent build examples/basic/deck.md --to pptx --out dist
```

## Expected Inspect Fields

```text
- slide index
- slide id
- role
- title
- headingPath
- intent
- primary item count
```

## Expected Plan Fields

```text
- slide size
- theme tokens
- layout preset
- regions
- typography
- overflow policy
- diagnostics
```

## Recommended Tests

```text
- heading split snapshots
- density calculation cases
- intent detection cases
- layout selection cases
- override target resolution cases
- schema validation cases
- PPTX text/table/chart rendering cases
- generated artifact evaluation
```

## Deferred Items

```text
- complete PPTX template parser
- perfect text measurement
- animation
- video/audio
- one-to-one Marp CSS compatibility
- automated perceptual scoring
```
