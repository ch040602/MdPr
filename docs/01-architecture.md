# 01. Architecture

## Flow

```text
Markdown
  -> Parser (simple Markdown or Pandoc JSON)
  -> Outline Builder
  -> Split Planner
  -> Coherence Grouping
  -> Presentation IR
  -> Pack Validation / Token Import
  -> Layout Planner (candidate scoring)
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
  Markdown parsing, Pandoc JSON adaptation into MDPR semantic blocks, outline
  tree, split planning, density scoring, intent score profiles, and
  Presentation IR. The Markdown parser owns paragraph marker normalization for
  dash and bullet-like lines, including `-item`, `•`, `·`, `–`, `—`, `−`,
  `ㆍ`, and `▪`, while preserving explicit `---` slide breaks, pipeline arrows,
  negative-number prose, year-leading prose such as `2026. Roadmap`, fenced
  code, indented code, and raw `<pre>` blocks. Real ordered lists still retain
  their source numbering and nested marker semantics through list splitting.
  Parser-owned cleanup can emit source diagnostics with line numbers and marker
  kinds, but those diagnostics do not choose bullet glyphs, indentation,
  typography, or renderer objects. `planPresentation()` promotes those source
  cleanup diagnostics into `Presentation IR` diagnostics so build and validation
  manifests can expose parser-owned authoring cleanup without adding render
  decisions.

packages/core/src/coherence
  Rule-based block roles, caption pairing, coherence groups, and weak accepted
  agent-hint metadata merge. High-confidence content-split hints may create
  deterministic continuation slides without rewriting source text; readability
  and icon-keyword hints are recorded as diagnostics/metadata only. When a
  content-split hint creates continuation slides, downstream key-message,
  readability, and icon-keyword hints are scoped by split lineage so a hint only
  applies to elements present on that generated slide. Schema-valid but
  media-policy-conflicting icon/image candidates are ignored with diagnostics.
  Generated-image requests require explicit request evidence before MDPR records
  them. It never chooses coordinates, colors, typography, exact icon assets,
  final image paths, crops, z-order, or renderer objects; runtime-owned field
  leaks are surfaced as diagnostics rather than accepted as instructions.

packages/layout
  Layout presets, deterministic candidate scoring, region planning, safe
  areas, typography, text measurement, semantic/section continuity scoring,
  overflow policy, and Layout IR.

packages/validation
  Reusable visual and coherence diagnostics over Presentation IR plus Layout IR.
  CLI calls this package instead of owning domain validation rules.

packages/diagram
  Deterministic diagram type registry, editable node/edge IR validation,
  connector role normalization, complexity budget checks, and focal accent
  taste gates.

packages/component
  Slide-native component taxonomy, slot and token-reference validation,
  editable-primary-content gates, and rule-based component family summaries.

packages/pack
  Approved pack validation, theme/component/diagram token import, deterministic
  preview summaries, and pack command helpers. Packs may affect runtime theme
  inputs only after schema validation and explicit approval.

schemas/
  Source-of-truth JSON contracts for runtime IR, config, override, pack,
  bridge, and design proposal artifacts. `mdpr-skill` and `mdpr-ppt` can keep
  synchronized copies, but MDPR owns the contract accepted by build,
  validation, pack import, and override application.

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
  inspect, plan, validate, build, design locks, theme previews, diagnostics
  orchestration, and exit-code policy.
```

## Design Principles

1. `core` does not know renderers. It emits `Presentation IR` only.
2. `layout` owns coordinates, regions, slots, typography, and safe areas.
3. Renderers implement target-format output only; they must not redo split or layout decisions.
4. Overrides are the final exception layer after automatic planning.
5. PPT templates provide brand, background assets, and compatible master/layout placeholder geometry; MDPR recalculates placement only when template placeholders are absent or unsafe.
6. Optional agent hints may annotate coherence/planning metadata, but deterministic MDPR rules own final output.
7. Quality improvements preserve source semantics; they classify, group,
   measure, reflow, and validate content without summarizing or rewriting it.
   Parser marker normalization may convert authoring shorthand into stable
   list structure, but it must not turn mixed prose with inline arrows into a
   diagram or rewrite literal code/pre blocks.
8. Approved packs are token imports, not agent decisions. They can supply theme,
   component, and diagram tokens, while MDPR still owns final layout, z-order,
   object rendering, and validation.
