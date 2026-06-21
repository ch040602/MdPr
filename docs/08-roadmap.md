# 08. Roadmap

## Phase 1. Schema Contracts

- `config.schema.json`
- `override.schema.json`
- `presentation-ir.schema.json`
- `layout-ir.schema.json`

Acceptance: agents and humans can create valid config and override files from the schemas.

## Phase 2. Core Parser

- Markdown parsing
- Pandoc JSON normalization
- heading tree creation
- block extraction
- stable ID generation
- `Presentation IR`

Acceptance:

```bash
mdpresent inspect examples/basic/deck.md --json
```

## Phase 3. Split Planner

- h1/h2/h3 splitting
- density calculation
- explicit slide breaks
- autosplitting
- cover and TOC insertion

Acceptance: dense sections split predictably without breaking a single diagram across slides.

## Phase 4. Intent Detection

- comparison detection
- item count detection
- table/image/code/chart detection
- timeline and pipeline detection

Acceptance:

```text
before/after -> comparison
four examples -> grid
five methods -> pentagon candidate
table-heavy slide -> table-focus
pipeline arrows -> pipeline
```

## Phase 5. Layout Planner

- presets
- item-count layout selection
- safe areas
- typography and overflow floors

Acceptance:

```bash
mdpresent plan deck.md --json
```

## Phase 6. Override Engine

- YAML/JSON manifest loading
- schema validation
- target resolution
- operation application
- diff reporting

Acceptance:

```bash
mdpresent diff deck.md --override deck.override.yaml
```

## Phase 7. Renderers

- PPTX editable objects
- HTML preview and gallery shell
- PDF export path

Acceptance:

```bash
mdpresent build deck.md --to pptx,html,pdf --out dist
```

## Phase 8. Design and QA

- decoration style catalog
- color seed and harmony derivation
- SVG-backed surface grammar
- icon catalog search
- generated PPTX/PNG artifact checks
- README and Actions preview assets

Acceptance:

```bash
corepack pnpm preview:themes
corepack pnpm preview:readme
corepack pnpm test
```

## Runtime Gap Closure TODOs

These items track gaps between current implementation and the public README/API
promises. They should be completed one step at a time with a focused test,
lightweight validation, and a separate push.

- [x] Align PDF output promise with implementation: either wire
  `@mdpresent/render-pdf` into `buildDeck()` with fixture coverage, or mark PDF
  as experimental/TODO in user-facing examples.
- [x] Wire the Override Engine into CLI orchestration: apply overrides after
  layout planning, validate targets/conflicts, and make `validate --override`
  validate the overridden result.
- [x] Upgrade the default Markdown parser from the MVP parser to a
  CommonMark-compatible AST path while documenting Pandoc install/fallback
  policy.
- [x] Attach JSON schema validation to runtime config loading, including unknown
  key detection, invalid enum/unit diagnostics, and schema/type drift tests.
- [x] Strengthen CLI output format validation: `--to` now accepts only `pptx`,
  `html`, and `pdf`, and unknown formats fail with a non-zero CLI exit.
- [x] Expand tests to match README product goals: parser-to-IR-to-layout-to-
  renderer fixtures, PPTX XML contracts, and HTML/PDF artifact contracts.
- [x] Deepen visual validation beyond shallow metadata checks: overlap, z-order,
  contrast, clipping, image aspect ratio, connector crossing, and per-check
  manifest thresholds.
- [x] Harden packaging and installable CLI behavior: add a `mdpresent` bin,
  package exports/files, and an `npm pack` clean-project smoke test.
