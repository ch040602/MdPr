# 01. Architecture

## Flow

```text
Markdown
  -> Parser (simple Markdown or Pandoc JSON)
  -> Outline Builder
  -> Split Planner
  -> Presentation IR
  -> Layout Planner
  -> Layout IR
  -> Override Resolver
  -> Validation / Overflow Checker
  -> Renderer
      -> PPTX
      -> HTML
      -> PDF
```

## Package Roles

```text
packages/core
  Markdown parsing, Pandoc JSON normalization, outline tree, split planning,
  density scoring, intent detection, and Presentation IR.

packages/layout
  Layout presets, region planning, safe areas, typography, overflow policy,
  and Layout IR.

packages/override
  Override manifest loading, schema validation, target resolution, operation
  application, and diffs.

packages/render-pptx
  Layout IR to editable PowerPoint objects.

packages/render-html
  Layout IR to semantic HTML preview and gallery shell.

packages/render-pdf
  Document export path.

packages/cli
  inspect, plan, validate, build, design locks, theme previews, and diagnostics.
```

## Design Principles

1. `core` does not know renderers. It emits `Presentation IR` only.
2. `layout` owns coordinates, regions, slots, typography, and safe areas.
3. Renderers implement target-format output only; they must not redo split or layout decisions.
4. Overrides are the final exception layer after automatic planning.
5. PPT templates provide brand and background assets; body placement is recalculated by MDPR.
6. Optional agent hints may annotate intent, but deterministic MDPR rules own final output.
