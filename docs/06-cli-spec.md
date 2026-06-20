# 06. CLI 명령 설계

## init

```bash
mdpresent init
```

생성:

```text
mdpresent.config.yaml
deck.override.yaml
assets/
```

## inspect

```bash
mdpresent inspect deck.md
mdpresent inspect deck.md --json
```

Markdown을 분할한 뒤 slide 목록과 stable id를 출력한다.

사람용 출력 예:

```text
1  cover        cover-9f12a0             AI 도입 제안서
2  toc          toc-21a0ff                목차
3  content      problem-definition-a12bc  문제 정의
4  comparison   as-is-to-be-991af         기존 방식과 개선 방식
5  grid         main-features-a13f92      주요 기능
```

## plan

```bash
mdpresent plan deck.md --json > layout.plan.json
```

렌더링하지 않고 Presentation IR과 Layout IR 결과를 출력한다.

## build

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

## Orchestration API boundary

CLI commands must delegate to a reusable orchestration layer instead of owning pipeline behavior directly.

```text
createDeckPlan(inputPath, options)
  - resolves config sources
  - parses Markdown
  - plans Presentation IR
  - plans Layout IR
  - collects diagnostics

inspectDeck(inputPath, options)
  - returns Presentation IR slides

planDeck(inputPath, options)
  - returns Presentation IR + Layout IR + diagnostics

buildDeck(inputPath, options)
  - renders requested outputs from the shared plan
  - returns a Promise because PPTX/PDF renderers may perform async file writes
```

Future `validate` and `diff` commands must use the same boundary:

```text
validateDeck(createDeckPlan(...), override manifest, schemas)
diffDeck(before plan, after overrides)
```

Config precedence is owned by the orchestration layer:

```text
default config < config file < CLI args
```

Config files are loaded from YAML or JSON. Override file loading is still a scaffold diagnostic until the manifest loader is implemented.

Current build behavior:

```text
- html writes dist/deck.html through @mdpresent/render-html
- pptx writes dist/deck.pptx through @mdpresent/render-pptx
- build writes dist/mdpresent-design-lock.json and dist/mdpresent-manifest.json beside rendered outputs
- `--design` and `theme.designPreset` remain compatibility aliases for the shared preset catalog
- `--theme-style` and `theme.decorationStyle` select the decoration grammar separately from color
- `--theme-color` and `theme.colorSeed` provide the main color seed
- `--theme-harmony` and `theme.colorCombination` derive `monochromatic`, `analogous`, `complementary`, `split-complementary`, or `triadic` palettes from the color seed; `preset` keeps the catalog colors unchanged
- `--design-lock path.json` checks the resolved design contract; `--update-design-lock` accepts intentional changes
- `--visual` adds structural visual-validation summaries to the output manifest
- built-in presets: plain, clean, executive, editorial, technical, dark, nord, solarized, dracula, tableau, gruvbox, monokai, material, tokyo-night
- pptx can reuse positioned image assets from a template/master PPTX as a background layer
- config files are loaded from YAML or JSON; `pptx.template` paths are resolved relative to the config file
- pdf remains a structured TODO diagnostic
```

## validate

```bash
mdpresent validate deck.md --override deck.override.yaml
```

검사 항목:

```text
- override target 존재 여부
- preset 유효성
- slot 좌표 범위
- font size min 위반
- asset 누락
- overflow 가능성
```

Current scaffold behavior:

```text
- creates a shared deck plan through the orchestration API
- reports config/override loading as structured diagnostics while those loaders are pending
- applies the pre-render text containment resolver for reflow/shrink/split policies
- runs layout overflow validation
- exits 0 when diagnostics contain warnings only
- exits 1 when diagnostics contain errors
- supports --json output
```

## diff

```bash
mdpresent diff deck.md --override deck.override.yaml
```

출력 예:

```text
Slide main-features-a13f92
  layout.preset: vertical-list → grid
  layout.columns: null → 2
  layout.rows: null → 2
```

## override set

```bash
mdpresent override set deck.md \
  --slide-id main-features-a13f92 \
  --layout grid \
  --columns 2 \
  --rows 2
```

`deck.override.yaml`에 operation을 추가한다.

## 주요 옵션

```text
--to pptx,pdf,html
--out dist
--config mdpresent.config.yaml
--override deck.override.yaml
--template company-template.pptx
--design plain|clean|executive|editorial|technical|dark|nord|solarized|dracula|tableau|gruvbox|monokai|material|tokyo-night
--theme-style plain|simple|clean|executive|editorial|technical|glass|dark|nord|solarized|dracula|tableau|gruvbox|monokai|material|tokyo-night
--theme-color "#2563EB"
--theme-harmony preset|monochromatic|analogous|complementary|split-complementary|triadic
--design-lock dist/mdpresent-design-lock.json
--update-design-lock
--visual
--background "#0B1020"
--font Pretendard
--font-size 22
--min-font-size 18
--on-overflow split|shrink|warn|fail
--json
```
