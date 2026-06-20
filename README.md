# mdpresent

`mdpresent` turns Markdown into structured, editable presentation outputs. It is not a direct Markdown-to-PowerPoint converter; it parses the document into `Presentation IR`, plans `Layout IR`, and renders `PPTX`, `HTML`, or `PDF`.

`mdpresent` is the deterministic runtime. Parsing, splitting, layout, validation, theme selection, editable object rendering, and PowerPoint output are rule-based and do not require LLM calls. [`mdpr-skill`](https://github.com/ch040602/mdpr-skill) is a separate reasoning companion that may suggest compact semantic hints, but MDPR owns the final structure and rendering.

![MDPR theme and object showcase teaser](docs/assets/readme-slides/mdpr-showcase-teaser.png)

This README showcase is generated as `docs/assets/readme-slides/mdpr-showcase-teaser.pptx`, exported to `docs/assets/readme-slides/mdpr-showcase-teaser.png`, and built from real `docs/theme-preview/slides/` PPTX PNG exports.

Language variants:

- [Korean README](README.ko.md)
- [Chinese README](README.zh.md)

## What It Does

- **PPTX first**: produces editable PowerPoint slides, then exports PNG previews for review.
- **Deterministic runtime**: no API key, model call, or external LLM is required for build output.
- **Markdown semantics**: preserves headings, lists, emphasis, tables, charts, images, code, quotes, and pipeline diagrams.
- **Design grammar**: separates decoration style from color seed and derives PPT theme/chart colors from the selected harmony.
- **Object coverage**: supports native tables, native charts, proof objects, icon slots, SVG-backed surfaces, and bounded diagram connectors.
- **Visual QA**: checks generated PPTX/PNG artifacts, slide counts, surface markers, language, overflow status, and manifest drift.

## Preview Gallery

[Open the PPT-generated theme preview gallery](https://ch040602.github.io/MdPr/theme-preview/) to switch between built-in styles, download each generated PPTX deck, and inspect PNG slides extracted from PowerPoint output.

| Cover / Title | Pipeline Diagram |
| --- | --- |
| <img src="docs/theme-preview/slides/technical/slide-01.png" alt="PPTX cover slide exported to PNG" width="100%"> | <img src="docs/theme-preview/slides/technical/slide-09.png" alt="PPTX pipeline diagram slide exported to PNG" width="100%"> |

| Markdown Semantics | Editable Proof Objects |
| --- | --- |
| <img src="docs/theme-preview/slides/grid/slide-08.png" alt="PPTX semantic blocks slide exported to PNG" width="100%"> | <img src="docs/theme-preview/slides/technical/slide-13.png" alt="PPTX editable proof object slide exported to PNG" width="100%"> |

## Runtime Pipeline

MDPR keeps the runtime deterministic:

- Optional agent hints may suggest semantic tags or icon-search keywords.
- MDPR owns parsing, splitting, graph preservation, layout, theme color derivation, icon search, z-order, overflow checks, and renderer output.
- A single graph or diagram block stays on one slide.

<img src="docs/assets/readme-slides/mdpr-pipeline-teaser.png" alt="MDPR deterministic presentation pipeline" width="100%">

```text
Markdown
  -> Markdown AST / Simple AST
  -> Outline Tree
  -> Split Planner
  -> Presentation IR
  -> Layout Planner
  -> Override Engine
  -> QA / Overflow Checker
  -> Renderer
      -> PPTX
      -> HTML
      -> PDF
```

## Quick Usage

```bash
mdpresent inspect examples/basic/deck.md --json > deck.plan.json
mdpresent plan examples/basic/deck.md --json > layout.plan.json
mdpresent validate examples/basic/deck.md --override examples/basic/deck.override.yaml
mdpresent build examples/basic/deck.md --to pptx,pdf,html --out dist --design executive
mdpresent build examples/basic/deck.md --to pptx --out dist --theme-style glass --theme-color "#8A4FFF" --theme-harmony analogous --visual
mdpresent build examples/basic/deck.md --to pptx --out dist --template company-master.pptx
mdpresent build README.md --to pptx --out dist/theme-gallery --theme-gallery executive,editorial,technical,clean
```

## Design Controls

- `--theme-style`: `clean`, `executive`, `editorial`, `technical`, `minimalism`, `newmorphism`, `glass`, `grid`, `data`, `magazine`
- `--theme-color`: main color seed such as `#8A4FFF`
- `--theme-harmony`: `preset`, `monochromatic`, `analogous`, `complementary`, `split-complementary`, `triadic`
- `--design`: compatibility alias for legacy/shared preset selection
- `--theme-gallery`: repeats the same source deck under multiple style presets for visual comparison

## Coherence Rules

- Text is normalized before validation and rendering.
- Rich list items preserve ordered numbering, indentation, bold, and italic runs.
- Plain TOC/list entries render as separate editable PPTX text boxes to avoid collapsed line breaks.
- Tables use middle vertical alignment, coherent cell margins, preset-derived borders, and a readable font floor.
- SVG-backed surfaces keep fixed corner radii so shape size does not change the perceived roundness.
- Icon slots remain small, centered, monotone, and secondary to text.

## Project Map

```text
docs/       Design, rendering, QA, and methodology notes
schemas/    Config, Override, Presentation IR, and Layout IR schemas
packages/   Core, layout, override, CLI, and renderers
examples/   Example Markdown decks and configs
scripts/    Theme preview, README asset, and evaluation utilities
```

Implementation order:

1. Keep schemas stable unless the task explicitly changes a schema contract.
2. Build Markdown-to-`Presentation IR` in `packages/core`.
3. Build `Presentation IR`-to-`Layout IR` in `packages/layout`.
4. Apply override manifests in `packages/override`.
5. Keep `packages/render-pptx` as the primary editable-object renderer.
6. Keep `packages/render-html` as a gallery/preview shell.
7. Keep `packages/render-pdf` as an export path.

## GitHub Actions

- `CI`: installs the workspace, typechecks, builds, and runs tests.
- `Theme Preview`: regenerates PPTX decks, rasterizes slides to PNG, verifies artifacts, and publishes the gallery to GitHub Pages.

These checks must pass without an LLM or external API key.

## Acknowledgements

README assets:

- `docs/assets/readme-slides/mdpr-showcase-teaser.pptx`
- `docs/assets/readme-slides/mdpr-showcase-teaser.png`
- `docs/assets/readme-slides/mdpr-pipeline-teaser.pptx`
- `docs/assets/readme-slides/mdpr-pipeline-teaser.png`
- `docs/assets/readme-slides/mdpr-pipeline-teaser.svg`

References:

| Reference | Use |
| --- | --- |
| [Google Material Design Icons](https://github.com/google/material-design-icons) | general icon style reference |
| [Simple Icons](https://github.com/simple-icons/simple-icons) | explicit brand icon reference |
| [SVG Repo](https://www.svgrepo.com/) | generic SVG object reference |
| [Tabler Icons](https://github.com/tabler/tabler-icons) | restrained concept glyph reference |
