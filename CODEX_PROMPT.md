# Codex Implementation Prompt

This repository implements `mdpresent`, a CLI-based Markdown presentation structuring tool.

## Goal

Build a deterministic pipeline that parses Markdown into `Presentation IR`, plans `Layout IR`, and renders PPTX, HTML, or PDF outputs without requiring an LLM at runtime.

## Required Rules

1. Match types and generated artifacts to `schemas/*.json`.
2. Split slides from headings, density, explicit slide breaks, and semantic block structure.
3. Select layouts from slide intent, item count, block type, and density.
4. Treat override manifests as structured operations.
5. Prefer `slideId` over `slideIndex` for targeting.
6. Do not let renderers redo split or layout decisions.
7. Keep PPTX output editable: text boxes, tables, charts, shapes, images, and connectors should remain native where possible.

## Implementation Order

1. Complete parsing, splitting, intent detection, and semantic block handling in `packages/core`.
2. Complete preset, region, typography, and overflow planning in `packages/layout`.
3. Complete manifest loading, target resolution, and operation application in `packages/override`.
4. Keep CLI config, build, validate, and design-lock behavior in `packages/cli`.
5. Keep `packages/render-pptx` as the primary editable-object renderer.
6. Keep `packages/render-html` as a lightweight browser preview and gallery shell.
7. Keep `packages/render-pdf` as an export path.

## First Acceptance Commands

```bash
pnpm install
pnpm cli inspect examples/basic/deck.md --json
pnpm cli plan examples/basic/deck.md --json
pnpm cli build examples/basic/deck.md --to pptx,html --out dist
```
