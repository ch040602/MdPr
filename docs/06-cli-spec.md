# 06. CLI Specification

## Commands

```bash
mdpresent init
mdpresent inspect deck.md --json
mdpresent plan deck.md --json > layout.plan.json
mdpresent validate deck.md --override deck.override.yaml
mdpresent build deck.md --to pptx,pdf,html --out dist
mdpresent diff deck.md --override deck.override.yaml
```

## Build Example

```bash
mdpresent build deck.md \
  --to pptx,pdf,html \
  --out dist \
  --config mdpresent.config.yaml \
  --override deck.override.yaml \
  --design executive \
  --theme-style glass \
  --theme-color "#8A4FFF" \
  --theme-harmony analogous \
  --visual \
  --template company-master.pptx
```

## Orchestration Boundary

CLI commands delegate to a reusable orchestration layer.

```text
createDeckPlan(inputPath, options)
  - resolves config sources
  - validates config files against schemas/config.schema.json
  - parses Markdown
  - plans Presentation IR
  - plans Layout IR
  - collects diagnostics

inspectDeck(inputPath, options)
  - returns Presentation IR slides

planDeck(inputPath, options)
  - returns Presentation IR, Layout IR, and diagnostics

buildDeck(inputPath, options)
  - renders requested outputs from the shared plan
```

Config precedence:

```text
default config < config file < CLI args
```

## Current Build Behavior

- `html` writes `dist/deck.html` through `@mdpresent/render-html`.
- `pptx` writes `dist/deck.pptx` through `@mdpresent/render-pptx`.
- Build writes `mdpresent-design-lock.json` and `mdpresent-manifest.json`.
- `--theme-style` selects decoration grammar separately from color.
- `--theme-color` provides the main color seed.
- `--theme-harmony` derives `monochromatic`, `analogous`, `complementary`, `split-complementary`, or `triadic` palettes.
- `--design-lock` checks the resolved design contract unless `--update-design-lock` is used.
- `--visual` adds structural visual-validation summaries.
- PPTX can reuse positioned image assets from a template/master deck as a background layer.
- PDF is exported from the generated PPTX with PowerPoint on Windows or LibreOffice in CI/Linux.

## Validation

Validation reports:

```text
- missing override targets
- invalid presets
- invalid config schema fields
- slot coordinates outside slide bounds
- minimum font size violations
- missing assets
- possible overflow
- design lock drift
```

## Main Options

```text
--to pptx,pdf,html
--out dist
--config mdpresent.config.yaml
--override deck.override.yaml
--template company-template.pptx
--design plain|clean|executive|editorial|technical|dark|nord|solarized|dracula|tableau|gruvbox|monokai|material|tokyo-night
--theme-style clean|executive|editorial|technical|minimalism|newmorphism|glass|grid|data|magazine
--theme-color "#2563EB"
--theme-harmony preset|monochromatic|analogous|complementary|split-complementary|triadic
--design-lock dist/mdpresent-design-lock.json
--update-design-lock
--visual
--background "#0B1020"
--font Aptos
--font-size 22
--min-font-size 18
--on-overflow split|shrink|warn|fail
--json
```
