# mdpresent

[![npm version](https://img.shields.io/npm/v/@mdpresent/cli.svg)](https://www.npmjs.com/package/@mdpresent/cli)
[![Preview gallery](https://img.shields.io/badge/preview-gallery-0f766e)](https://ch040602.github.io/MdPr/theme-preview/)
[![Download PPTX](https://img.shields.io/badge/download-preview%20PPTX-8a4fff)](https://github.com/ch040602/MdPr/releases/tag/v0.1.0-preview)

![MDPR one-page teaser slide preview](docs/assets/readme-teaser/slides/slide-01.png?v=bentogrid-pipeline-one-page)

`mdpresent` / **MDPR** generates editable, visually checked PowerPoint decks
from Markdown with deterministic layout rules instead of a black-box LLM
runtime.

Markdown goes in. Editable PowerPoint, rendered previews, overflow checks, and
agent-review boundaries come out. When paired with `mdpr-skill`, the workflow
can also benchmark the same Markdown corpus against codex-ppt image-only
baselines and `Presentations` probe decks without giving the agent final layout
control.

[Preview gallery](https://ch040602.github.io/MdPr/theme-preview/) ·
[Download preview PPTX](https://github.com/ch040602/MdPr/releases/tag/v0.1.0-preview) ·
[Optional agent review](https://github.com/ch040602/mdpr-skill) ·
[Quick usage](#quick-usage) ·
[How it differs](#how-mdpr-differs) ·
[Report a broken deck](https://github.com/ch040602/MdPr/issues/new/choose)

- **Input**: Markdown documents.
- **Intermediate model**: `Presentation IR` and `Layout IR`.
- **Outputs**: editable `PPTX`, plus `HTML` and `PDF`.
- **Runtime**: rule-based parsing, splitting, layout, validation, theme selection, and rendering.
- **LLM-advised quality**: use [`mdpr-skill`](https://github.com/ch040602/mdpr-skill) when you want agent-side semantic hints, review loops, or visual-quality advice before MDPR builds the deck.
- **Agent boundary**: [`mdpr-skill`](https://github.com/ch040602/mdpr-skill) may pass compact semantic hints through `--hints`, but MDPR rejects final layout/style decisions. MDPR owns final structure and output.
- **Install path**: install MDPR with `npm install -g @mdpresent/cli`; use `mdpr-skill` only when you want optional Codex-assisted review before rendering.
- **README assets**: the main teaser is built from `examples/readme-teaser/deck.md` with `--pipeline-one-page`; gallery images come from the shared theme preview deck. There is no README-only renderer.

Language variants: [Korean](README.ko.md), [Chinese](README.zh.md)

Contributions: [Contributing guide](CONTRIBUTING.md) ·
[Community feedback guide](docs/community-feedback.md) ·
[International launch kit](docs/international-launch-kit.md) ·
[Open a Markdown/PPTX issue](https://github.com/ch040602/MdPr/issues/new/choose)

## Visual Proof

MDPR is the deterministic runtime in the comparison below: it owns Markdown
parsing, splitting, layout, theme binding, validation, and editable PPTX output.
`mdpr-skill` can add review hints and quality ledgers, but those hints stay
semantic and MDPR keeps final rendering authority.

The current companion evaluation in `mdpr-skill` reports 21/21 codex-ppt
feature families mapped, 23 public Markdown comparison sources, five visual
improvement passes, 25 scoring criteria, 23 `Presentations` probes, five
codex-ppt image-only baselines, and zero missing evidence artifacts.

## What It Does

- **PPTX first**: produces editable PowerPoint slides, then exports PNG previews for review.
- **Deterministic runtime**: no API key, model call, or external LLM is required for build output.
- **PDF export**: creates PPTX first, then saves that PPTX as PDF with PowerPoint on Windows or LibreOffice in CI/Linux.
- **One-page teaser mode**: `--pipeline-one-page` keeps dense pipeline, feature, chart, and table summaries on one rendered slide.
- **Markdown semantics**: parses CommonMark/GFM Markdown into an AST, then preserves headings, lists, links, emphasis, tables, HTML blocks, charts, images, code, quotes, and pipeline diagrams.
- **Design grammar**: separates decoration style from color seed and derives PPT theme/chart colors from the selected harmony.
- **Object coverage**: supports native tables, native charts, proof objects, icon slots, SVG-backed surfaces, and bounded diagram connectors.
- **Deterministic validation**: checks overflow, generated artifact contracts, slide counts, surface markers, language, manifest drift, and a post-AI PPT polish gate.
- **Skill-side review**: LLM-advised layout critique, visual polish, icon keyword ideas, and high-quality deck guidance belong in [`mdpr-skill`](https://github.com/ch040602/mdpr-skill#usage), not MDPR runtime.

Current readability contract:

- every non-decoration source block must reach a layout region; mixed lists,
  prose, tables, and code are preserved instead of being dropped by an
  evidence-focused layout
- code lines remain separate editable OpenXML lines, while indented prose uses
  separate editable row boxes with a bounded `0.06-0.10in` safety gap
- pipeline-one-page feature summaries and table evidence keep a `16pt` minimum
  font floor
- `build` and `validate` with `--visual` stop on a failed required polish
  chapter and report `MDPR_POLISH_GATE_FAILED` with the failed chapter names
- image safe frames preserve aspect ratio or use explicit focal-point crops;
  source-neutral slides do not receive invented images or icons

Typography rules:

- the default profile uses `Pretendard` with `34pt` titles, `22pt` body text,
  `14pt` captions, an `18pt` configured minimum, and `1.2` line height
- a region resolves its effective floor from `region.typography.minFontSize`,
  then the slide overflow floor, then the theme minimum; shrink and containment
  resolution stop at that floor and leave a diagnostic when text still cannot fit
- the required `--visual` `fontHierarchy` chapter needs a declared family,
  title text at least `4pt` larger than body text, a deck-wide Layout IR floor of
  at least `16pt`, and zero same-role font-size variance
- the strict polish floor has no silent caption or code exemption; an active
  region below `16pt` remains visible as a required-gate failure even when its
  non-strict profile default is smaller
- PPTX output writes the resolved family to the document head/body theme and
  editable text runs; code regions are the explicit monospace exception and use
  `Consolas`
- `--template` preserves the original master, layout, and theme OOXML, while
  generated text still uses resolved MDPR typography; set `typography.fontFamily`
  to the master theme family when an exact match is required
- MDPR does not embed fonts or verify host installation, so the selected family
  must exist on authoring and rendering systems; CJK and mixed-language
  measurement preserves source text instead of rewriting it to make content fit

Best fit:

- engineering reports that must become editable PowerPoint decks
- research notes that need tables, diagrams, and claims preserved
- data/product updates that need repeatable PPTX output in CI
- teams that want optional LLM review without giving an agent final slide geometry

## MDPR + mdpr-skill

MDPR is the product runtime. It parses Markdown, plans slides, validates visual
constraints, and writes editable PPTX/HTML/PDF artifacts. It does not need an
LLM, API key, or agent process for normal builds.

[`mdpr-skill`](https://github.com/ch040602/mdpr-skill) is the optional Codex
review companion. It can suggest compact semantic hints, icon-search keywords,
Markdown cleanup notes, and visual QA concerns before MDPR builds or rebuilds a
deck. The skill is useful when you want LLM-advised polish without letting the
agent own final coordinates, colors, z-order, shape geometry, exact icons, or
renderer object IDs.

```text
Markdown
  -> optional mdpr-skill review hints
  -> MDPR deterministic parsing, splitting, layout, validation
  -> editable PPTX / HTML / PDF
```

## How MDPR Differs

| Compared with | MDPR focus |
| --- | --- |
| **Pandoc** | Pandoc is a broad document converter. MDPR is narrower: PPTX-first layout planning, editability, overflow validation, object preservation, and generated preview QA. |
| **Marp / Slidev** | HTML/CSS slide tools are excellent for web decks. MDPR targets editable PowerPoint objects and downstream PPTX workflows. |
| **LLM slide generators** | MDPR keeps deterministic ownership of parsing, splitting, layout, colors, z-order, and renderer output. [`mdpr-skill`](https://github.com/ch040602/mdpr-skill) can suggest hints, but it cannot own final coordinates or style. |
| **Template-only automation** | MDPR derives slide structure from Markdown semantics, then applies reusable layout and theme grammar rather than filling a fixed master slide. |

If a Markdown file breaks the layout, opens as non-editable PPTX, clips text,
or loses graph/table structure, please open a
[Markdown edge-case issue](https://github.com/ch040602/MdPr/issues/new/choose)
with the smallest reproducible Markdown snippet.

## Preview Gallery

- [Open the PPT-generated theme preview gallery](https://ch040602.github.io/MdPr/theme-preview/)
- Preview scope: 9 redefined decoration styles, excluding palette-only or background-only swaps.
- Gallery artifacts: 9 generated PPTX decks plus 25 PNG slides per style
  extracted from presentation output (225 rendered slides total).

| Teaser Summary | Pipeline Diagram |
| --- | --- |
| <img src="docs/assets/readme-teaser/slides/slide-01.png?v=bentogrid-pipeline-one-page" alt="PPTX one-page teaser slide exported to PNG" width="100%"> | <img src="docs/theme-preview/slides/bentogrid/slide-11.png" alt="PPTX pipeline diagram slide exported to PNG" width="100%"> |

| Markdown Semantics | Decoration Patterns |
| --- | --- |
| <img src="docs/theme-preview/slides/minimalism/slide-09.png" alt="PPTX semantic blocks slide exported to PNG" width="100%"> | <img src="docs/theme-preview/slides/minimalism/slide-12.png" alt="PPTX decoration pattern catalog slide exported to PNG" width="100%"> |

| Editable Proof Objects | Mixed Object Packing |
| --- | --- |
| <img src="docs/theme-preview/slides/skeuomorphism/slide-17.png" alt="PPTX editable proof object slide exported to PNG" width="100%"> | <img src="docs/theme-preview/slides/newmorphism/slide-24.png" alt="PPTX mixed object packing slide exported to PNG" width="100%"> |

| Image Safe Frame | Brutalist Chart Pair |
| --- | --- |
| <img src="docs/theme-preview/slides/glassmorphism/slide-23.png" alt="PPTX image safe frame slide exported to PNG" width="100%"> | <img src="docs/theme-preview/slides/brutalism/slide-16.png" alt="PPTX chart and table pair slide exported to PNG" width="100%"> |

## Theme Style Examples

The same Markdown source is rendered through the pruned distinct theme styles. Each image below is exported from generated PPTX output.

| Skeuomorphism | Neomorphism | Glassmorphism |
| --- | --- | --- |
| <img src="docs/theme-preview/slides/skeuomorphism/slide-01.png" alt="Skeuomorphism theme cover slide exported from PPTX" width="100%"> | <img src="docs/theme-preview/slides/neomorphism/slide-01.png" alt="Neomorphism theme cover slide exported from PPTX" width="100%"> | <img src="docs/theme-preview/slides/glassmorphism/slide-01.png" alt="Glassmorphism theme cover slide exported from PPTX" width="100%"> |

| Claymorphism | Minimalism | Newmorphism |
| --- | --- | --- |
| <img src="docs/theme-preview/slides/claymorphism/slide-01.png" alt="Claymorphism theme cover slide exported from PPTX" width="100%"> | <img src="docs/theme-preview/slides/minimalism/slide-01.png" alt="Minimalism theme cover slide exported from PPTX" width="100%"> | <img src="docs/theme-preview/slides/newmorphism/slide-01.png" alt="Newmorphism theme cover slide exported from PPTX" width="100%"> |

| Brutalism | Liquid Glass | Bentogrid |
| --- | --- | --- |
| <img src="docs/theme-preview/slides/brutalism/slide-01.png" alt="Brutalism theme cover slide exported from PPTX" width="100%"> | <img src="docs/theme-preview/slides/liquid-glass/slide-01.png" alt="Liquid glass theme cover slide exported from PPTX" width="100%"> | <img src="docs/theme-preview/slides/bentogrid/slide-01.png" alt="Bentogrid theme cover slide exported from PPTX" width="100%"> |

## Runtime Pipeline

- Optional agent hints may suggest semantic tags or icon-search keywords.
- Hint files are validated as weak metadata; coordinates, colors, font sizes, z-order, component choices, and renderer object IDs are rejected.
- MDPR owns parsing, splitting, graph preservation, layout, theme color derivation, icon search, z-order, overflow checks, and renderer output.
- A single graph or diagram block stays on one slide.

<img src="docs/theme-preview/slides/bentogrid/slide-11.png" alt="MDPR deterministic presentation pipeline slide exported to PNG" width="100%">

```text
Markdown
  -> CommonMark / GFM Markdown AST
  -> Outline Tree
  -> Split Planner
  -> Presentation IR
  -> Layout Planner
  -> Override Engine
  -> Validation / Overflow Checker
  -> Renderer
      -> PPTX
      -> HTML
      -> PDF
```

## Quick Usage

Installable CLI package:

```bash
npm install -g @mdpresent/cli
mdpresent build examples/basic/deck.md --to pptx,pdf,html --out dist --design executive
```

Repository development:

```bash
corepack pnpm install
corepack pnpm --filter @mdpresent/cli build
node packages/cli/dist/index.js build examples/basic/deck.md --to pptx --out dist
```

Common commands:

```bash
mdpresent inspect examples/basic/deck.md --json > deck.plan.json
mdpresent plan examples/basic/deck.md --json > layout.plan.json
mdpresent validate examples/basic/deck.md --override examples/basic/deck.override.yaml --coherence
mdpresent validate examples/basic/deck.md --hints examples/basic/deck.mdpr-hints.json --strict
mdpresent build examples/basic/deck.md --to pptx,pdf,html --out dist --design executive
mdpresent build examples/basic/deck.md --to pptx --out dist --theme-style glassmorphism --theme-color "#8A4FFF" --theme-harmony analogous --visual --coherence
mdpresent pack import theme-candidate.json --approved --out mdpr.pack.json
mdpresent pack validate mdpr.pack.json --json
mdpresent build examples/basic/deck.md --to pptx,html --out dist --pack mdpr.pack.json
mdpresent build examples/readme-teaser/deck.md --to pptx --out dist/readme-teaser --theme-style bentogrid --theme-color "#0F766E" --theme-harmony split-complementary --pipeline-one-page --visual
mdpresent build examples/basic/deck.md --to pptx --out dist --template company-master.pptx
mdpresent build README.md --to pptx --out dist/theme-gallery --theme-gallery executive,nord,dracula,solarized
```

`--parser pandoc` is an advanced compatibility mode for users who need Pandoc
Markdown normalization. It requires `pandoc` on `PATH`, but MDPR does not use
Pandoc output as the presentation model. The Pandoc JSON AST is adapted back
into MDPR semantic blocks, including diagrams, chart fences, structured lists,
images, tables, code, and Div attributes. The default parser does not require
Pandoc and uses the built-in CommonMark/GFM AST path.

## Design Controls

- `--theme-style`: `skeuomorphism`, `neomorphism`, `glassmorphism`, `claymorphism`, `minimalism`, `newmorphism`, `brutalism`, `liquid-glass`, `bentogrid`
- `--theme-color`: main color seed such as `#8A4FFF`
- `--theme-harmony`: `preset`, `monochromatic`, `analogous`, `complementary`, `split-complementary`, `triadic`
- `--pipeline-one-page`: creates a single-slide pipeline/teaser composition from multi-section Markdown while keeping the shared parser, layout planner, validation, and renderers
- `--design`: compatibility alias for legacy/shared preset selection
- `--theme-gallery`: repeats the same source deck under multiple style presets for visual comparison; README/Actions previews use the pruned distinct-style subset
- `validation.polish`: every build manifest records the post-AI PPT polish gate for font hierarchy, layout composition, highlight pages, cover treatment, detail QA, and optional theme-gallery before/after evidence; `--visual` promotes required failures to `MDPR_POLISH_GATE_FAILED`
- `--pack`: applies an approved, tokenized MDPR pack after schema validation. Packs may provide theme tokens, component tokens, diagram tokens, and PPT effect mappings without requiring an agent at runtime.

Pack commands:

```bash
mdpresent pack list
mdpresent pack validate mdpr.pack.json
mdpresent pack import theme-candidate.json --approved --out mdpr.pack.json
mdpresent pack preview mdpr.pack.json
```

## Coherence Rules

- Text is normalized before validation and rendering.
- Rich list items preserve ordered numbering, indentation, bold, and italic runs.
- Plain TOC/list entries render as separate editable PPTX text boxes to avoid collapsed line breaks.
- Tables use middle vertical alignment, coherent cell margins, preset-derived borders, and a readable font floor.
- SVG-backed surfaces keep fixed corner radii so shape size does not change the perceived roundness.
- Icon slots remain small, centered, monotone, and secondary to text.

## Project Map

```text
docs/       Design, rendering, validation, and methodology notes
schemas/    Runtime IR, config, override, pack, bridge, and design proposal contracts
packages/   Core, layout, diagram, component, pack, override, CLI, and renderers
examples/   Example Markdown decks and configs
scripts/    Shared theme preview export and evaluation utilities
```

Implementation order:

1. Keep schemas stable unless the task explicitly changes a schema contract.
2. Build Markdown-to-`Presentation IR` in `packages/core`.
3. Build `Presentation IR`-to-`Layout IR` in `packages/layout`.
4. Keep diagram grammar, edge routing, and taste gates in `packages/diagram`.
5. Keep slide-native component taxonomy and token gates in `packages/component`.
6. Validate approved tokenized packs in `packages/pack` before they affect theme or component inputs.
7. Apply override manifests in `packages/override`.
8. Keep `packages/render-pptx` as the primary editable-object renderer.
9. Keep `packages/render-html` as a gallery/preview shell.
10. Keep `packages/render-pdf` as an export path.

Bridge and proposal schemas such as `mdpr-selection-context`,
`mdpr-ppt-selection`, `mdpr-ppt-pack-candidate`,
`mdpr-user-override-candidate`, `mdpr-theme-candidate`, and
`mdpr-html-design-analysis` live in MDPR as source-of-truth contracts.
`mdpr-skill` and `mdpr-ppt` may keep synced copies, but MDPR owns the runtime
validation boundary before packs, overrides, hints, or selection-derived
artifacts affect output.

## GitHub Actions

- `CI`: installs the workspace, typechecks, builds, and runs tests.
- `Theme Preview`: regenerates PPTX decks, rasterizes slides to PNG, verifies artifacts, and publishes the gallery to GitHub Pages.

These checks must pass without an LLM or external API key.
Theme preview regeneration removes only its owned PPTX, slide, index, and
manifest outputs so separately generated evaluation or review evidence remains
intact.

## Acknowledgements

- README preview source: `examples/theme-preview-en/deck.md`
- One-page teaser source: `examples/readme-teaser/deck.md`
- Main teaser image: `docs/assets/readme-teaser/slides/slide-01.png?v=bentogrid-pipeline-one-page`
- Main teaser PPTX: `docs/assets/readme-teaser/deck.pptx`
- Pipeline image: `docs/theme-preview/slides/bentogrid/slide-11.png`

References:

| Reference | Use |
| --- | --- |
| [Google Material Design Icons](https://github.com/google/material-design-icons) | general icon style reference |
| [Simple Icons](https://github.com/simple-icons/simple-icons) | explicit brand icon reference |
| [SVG Repo](https://www.svgrepo.com/) | generic SVG object reference |
| [Tabler Icons](https://github.com/tabler/tabler-icons) | restrained concept glyph reference |
