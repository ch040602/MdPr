# Contributing Guide

Thank you for improving MDPR.

MDPR is a deterministic Markdown presentation runtime. Contributions should keep
the project reproducible without an LLM or external API key.

## Contribution Scope

Prefer changing MDPR when the work affects:

- Markdown parsing or normalization.
- Slide splitting and graph preservation.
- Presentation IR or Layout IR.
- Theme style, theme color derivation, chart colors, or PPT theme settings.
- Typography, table layout, diagram connectors, object placement, or overflow
  handling.
- PPTX, HTML, PDF, manifest, or preview rendering.
- Validation rules and generated artifact contracts.

Use [`mdpr-skill`](https://github.com/ch040602/mdpr-skill) for optional
agent-side semantic hints, visual critique notes, and review loops. MDPR must
own the final structure and output.

## Pull Request Requirements

Every PR should include:

- A concise summary of the change.
- The reason the change is needed.
- The source Markdown or fixture used for validation.
- The validation commands that were run.
- Any known limitations or follow-up work.

For visual, layout, theme, diagram, table, chart, icon, or PPTX changes, include
before/after evidence whenever possible:

- Before and after PNG screenshots exported from generated PPTX output.
- Before and after PPTX files when editability or object structure changed.
- The manifest, design lock, validation report, or preview report used to verify
  the change.
- A short note describing the visual issue being addressed, such as overflow,
  alignment, readability, contrast, object coherence, theme feel, table
  stability, graph continuity, or z-order.

Generated outputs should be committed with the input Markdown or fixture needed
to reproduce them.

## Validation

Run focused tests for the changed package. For README preview and teaser work,
run:

```bash
python -m unittest tests.test_readme_asset_contract
python scripts/evaluate-readme-assets.py
```

For CLI orchestration, theme, or pipeline-one-page changes, run:

```bash
node --test packages/cli/test/orchestrate.test.mjs
```

For packaging, installable CLI behavior, or publish metadata changes, run:

```bash
corepack pnpm test:pack
```

For theme preview changes, regenerate and evaluate the preview artifacts:

```bash
npm run preview:theme
```

If a command cannot be run locally, state why in the PR.

## Generated Assets

Generated PPTX, PNG, HTML, JSON, manifest, and design-lock files are acceptable
when they are part of a reproducible example, README preview, or GitHub Actions
preview surface.

Keep generated assets reviewable:

- Commit the source Markdown next to the generated output or document the source
  path in the README.
- Avoid README-only scripts or one-off renderers; use the shared `mdpresent`
  build path.
- Keep visual preview files compact enough for normal GitHub review.
- Do not commit local caches, downloaded reference decks, private documents, or
  copied third-party slide layouts.

## Documentation

Update documentation when behavior changes:

- `README.md`, `README.ko.md`, and `README.zh.md` for user-facing behavior.
- `docs/01-architecture.md` for runtime ownership and pipeline changes.
- `docs/07-rendering-rules.md` for renderer behavior.
- `docs/11-qa-overflow.md` for validation and overflow policy.
- `docs/13-object-forms-and-icons.md` for object forms and icon behavior.

Project-internal Markdown should be written in English unless the file is a
localized README.

## Review Expectations

Reviewers should check:

- The build still works without LLM calls.
- A graph or diagram block is not split across multiple slides.
- Text remains inside slide, table, and shape bounds.
- Typography respects readable font floors.
- Theme styles are structurally distinct, not palette-only swaps.
- Before/after visual evidence exists when rendered output changes.
- Generated assets can be reproduced from committed inputs.
