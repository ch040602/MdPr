# 06. CLI Specification

## Commands

```bash
mdpresent init
mdpresent doctor --pdf
mdpresent job-state validate mdpr-job-state.json --json
mdpresent job-state status dist --json
mdpresent generated-assets validate mdpr-generated-assets.json --json
mdpresent inspect deck.md --json
mdpresent plan deck.md --json > layout.plan.json
mdpresent validate deck.md --override deck.override.yaml --hints deck.mdpr-hints.json --coherence --require-font-installed --embed-font Pretendard-Regular.ttf --embed-font Pretendard-Bold.ttf --require-font-embedded
mdpresent build deck.md --to pptx,pdf,html --out dist --require-font-installed --embed-font Pretendard-Regular.ttf --embed-font Pretendard-Bold.ttf --require-font-embedded
mdpresent diff deck.md --override deck.override.yaml
```

## Build Example

```bash
mdpresent build deck.md \
  --to pptx,pdf,html \
  --out dist \
  --config mdpresent.config.yaml \
  --override deck.override.yaml \
  --hints deck.mdpr-hints.json \
  --design executive \
  --theme-style glassmorphism \
  --theme-color "#8A4FFF" \
  --theme-harmony analogous \
  --visual \
  --coherence \
  --strict \
  --template company-master.pptx
```

## Orchestration Boundary

CLI commands delegate to a reusable orchestration layer.

```text
createDeckPlan(inputPath, options)
  - resolves config sources
  - validates config files against schemas/config.schema.json
  - parses Markdown
  - validates optional agent hint files against schemas/agent-hint.schema.json
  - weakly merges accepted hints into coherence metadata
  - plans Presentation IR
  - plans Layout IR
  - collects diagnostics

inspectDeck(inputPath, options)
  - returns Presentation IR slides

planDeck(inputPath, options)
  - returns Presentation IR, Layout IR, and diagnostics

buildDeck(inputPath, options)
  - validates the shared plan
  - renders requested outputs only when error diagnostics are absent
```

Config precedence:

```text
default config < config file < CLI args
```

## Current Build Behavior

- `html` writes `dist/deck.html` through `@mdpresent/render-html`.
- `pptx` writes `dist/deck.pptx` through `@mdpresent/render-pptx`.
- Build writes `mdpresent-design-lock.json` and `mdpresent-manifest.json`.
- Every build records `validation.fontEnvironment`, including requested,
  installed, and missing families, the probe source, and exact embedding
  evidence. `--require-font-installed` gates the export host. Repeatable
  `--embed-font` inputs are inspected during validate/build and packaged only
  for PPTX/PDF builds. `--require-font-embedded` gates the family/style faces
  actually planned by the deck. A successful package records EOT part paths,
  source hashes, `fsType`, and coverage after mutation.
- `job-state validate/status` reads `mdpr-job-state-v1` from an explicit JSON
  file or `mdpr-job-state.json` inside a build directory. It verifies
  evidence-bound completion states for long-running review/repair workflows.
- `generated-assets validate` reads `mdpr-generated-assets-v1` provider and
  request metadata. It rejects secret-like provider fields and full-slide
  renderer requests, and warns when quality or transparency policy is not
  supported by provider metadata.
- Build fails before rendering when config, layout overflow, or requested
  visual/coherence validation produces error diagnostics.
- `--hints` accepts optional `mdpr-skill` semantic/icon/importance candidates as weak metadata only.
- Accepted hints may add secondary intent candidates, block-role hints, keep-together evidence groups, and primary/supporting importance metadata.
- Hint files with final layout or style fields such as coordinates, color, font, z-order, component, or renderer object IDs are rejected.
- Stale hint files are ignored by default and fail validation when `--strict` is set.
- `--theme-style` selects decoration grammar separately from color.
- `--theme-color` provides the main color seed.
- `--theme-harmony` derives `monochromatic`, `analogous`, `complementary`, `split-complementary`, or `triadic` palettes.
- `--design-lock` checks the resolved design contract unless `--update-design-lock` is used.
- `--visual` adds structural visual-validation summaries and promotes any
  required polish chapter failure to the `MDPR_POLISH_GATE_FAILED` error.
- `--coherence` adds claim/evidence/caption/table grouping diagnostics.
- Every build manifest records `validation.polish`, a deterministic post-AI PPT
  polish gate covering font hierarchy, layout composition, highlight pages,
  cover treatment, detail QA, and optional before/after comparison evidence.
- PPTX can reuse positioned image assets from a template/master deck as a background layer.
- PDF is exported from the generated PPTX with PowerPoint on Windows or LibreOffice in CI/Linux.
- `doctor --pdf` reports the configured or discoverable PDF exporter before a
  PDF build is attempted.

## Validation

The local release preflight is available through the workspace script:

```bash
corepack pnpm test:preflight
```

It emits `mdpr-runtime-preflight-profile-v1` JSON and checks that parser and
splitting coverage, readability/source preservation, generated-asset policy,
template/master integrity, PPTX editability, validation, and clean package smoke
remain documented and locally runnable. It is a static local gate; it does not
require Office GUI inspection, credentials, paid services, browser automation,
external assets, downloaded fonts, or manual visual QA.

The emitted gate IDs are `parser-splitting`,
`readability-source-preservation`, `image-permission`,
`template-master-package-integrity`, `agent-runtime-bridge`,
`pptx-editability`, `validation-cli`, and `package-cli`.

Validation reports:

Diagnostics from presentation, layout, config, hints, and optional validation
gates are de-duplicated by their complete structured payload while preserving
the first occurrence and source order.

```text
- missing override targets
- invalid presets
- invalid config schema fields
- slot coordinates outside slide bounds
- minimum font size violations
- missing assets
- possible overflow
- claimless evidence slides
- detached captions
- orphan tables
- low object coverage
- polish gate required failures
- design lock drift
```

## Main Options

```text
--to pptx,pdf,html
--out dist
--config mdpresent.config.yaml
--override deck.override.yaml
--hints deck.mdpr-hints.json
--template company-template.pptx
--design plain|clean|executive|technical|dark|nord|solarized|dracula|tableau|gruvbox|monokai|material|tokyo-night
--theme-style skeuomorphism|neomorphism|glassmorphism|claymorphism|minimalism|newmorphism|brutalism|liquid-glass|bentogrid
--theme-color "#2563EB"
--theme-harmony preset|monochromatic|analogous|complementary|split-complementary|triadic
--design-lock dist/mdpresent-design-lock.json
--update-design-lock
--visual
--coherence
--strict
--background "#0B1020"
--font Aptos
--font-size 22
--min-font-size 18
--on-overflow split|shrink|warn|fail
--json
```
