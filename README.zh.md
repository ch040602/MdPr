# mdpresent

![MDPR one-page teaser slide preview](docs/assets/readme-teaser/slides/slide-01.png?v=bentogrid-pipeline-one-page)

`mdpresent` 是 deterministic Markdown presentation runtime。

- **Input**：Markdown documents
- **Intermediate model**：`Presentation IR` and `Layout IR`
- **Outputs**：editable `PPTX`, `HTML`, and `PDF`
- **Runtime**：rule-based parsing, splitting, layout, validation, theme selection, and rendering
- **LLM-advised quality**：use [`mdpr-skill`](https://github.com/ch040602/mdpr-skill) for agent-side semantic hints, review loops, or visual-quality advice before MDPR builds the deck.
- **Agent boundary**：[`mdpr-skill`](https://github.com/ch040602/mdpr-skill) may pass compact semantic hints through `--hints`, but MDPR rejects final coordinates, colors, fonts, object choices, and renderer decisions. MDPR owns final structure and output.
- **README assets**：main teaser is built from `examples/readme-teaser/deck.md` with `--pipeline-one-page`; gallery images come from the shared theme preview deck. There is no README-only renderer.

语言版本：[English](README.md), [Korean](README.ko.md)

## 核心功能

- **PPTX first**：先生成可编辑 PowerPoint，再导出 PNG 进行检查。
- **No LLM runtime**：构建结果不依赖模型调用，可重复生成。
- **One-page teaser mode**：`--pipeline-one-page` keeps pipeline, feature, chart, and table summaries on one rendered slide.
- **Markdown semantics**：保留 heading、list、emphasis、table、chart、image、code、quote 和 pipeline diagram。
- **Design grammar**：将 decoration style 与 color seed 分离，并根据 harmony 规则生成 PPT theme/chart colors。
- **Object coverage**：支持 native table、native chart、proof object、icon slot、SVG-backed surface 和 diagram connector。
- **Deterministic validation**：检查 overflow、generated artifact contract、slide count、surface marker、语言和 manifest drift。
- **Skill-side review**：LLM-advised layout critique, visual polish, and high-quality deck guidance belong in [`mdpr-skill`](https://github.com/ch040602/mdpr-skill#usage), not MDPR runtime.

## 预览

- [Open the PPT-generated theme preview gallery](https://ch040602.github.io/MdPr/theme-preview/)
- Preview scope: 9 redefined decoration styles, excluding palette-only or background-only swaps.
- Gallery artifacts: generated PPTX decks plus PNG slides extracted from PowerPoint output.

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

## 主题风格示例

同一个 Markdown source 会通过 pruned distinct theme styles 渲染。下面的图片都来自 generated PPTX output 导出的 PNG。

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

- Agent hint 只能提供 compact semantic tag 或 icon keyword。
- Hint files are validated as weak metadata; coordinates, colors, font sizes, z-order, component choices, and renderer object IDs are rejected.
- MDPR 负责 parsing、splitting、graph preservation、layout、theme color、icon search、z-order、overflow check 和 renderer output。
- 一个 graph 或 diagram block 不会被拆成两页以上。

<img src="docs/theme-preview/slides/bentogrid/slide-11.png" alt="MDPR deterministic presentation pipeline slide exported to PNG" width="100%">

```text
Markdown
  -> Markdown AST / Simple AST
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

## 快速使用

```bash
mdpresent inspect examples/basic/deck.md --json > deck.plan.json
mdpresent plan examples/basic/deck.md --json > layout.plan.json
mdpresent validate examples/basic/deck.md --override examples/basic/deck.override.yaml
mdpresent build examples/basic/deck.md --to pptx,pdf,html --out dist --design executive
mdpresent build examples/basic/deck.md --to pptx --out dist --theme-style glassmorphism --theme-color "#8A4FFF" --theme-harmony analogous --visual
mdpresent build examples/readme-teaser/deck.md --to pptx --out dist/readme-teaser --theme-style bentogrid --theme-color "#0F766E" --theme-harmony split-complementary --pipeline-one-page --visual
mdpresent build examples/basic/deck.md --to pptx --out dist --template company-master.pptx
```

## Design Controls

- `--theme-style`: `skeuomorphism`, `neomorphism`, `glassmorphism`, `claymorphism`, `minimalism`, `newmorphism`, `brutalism`, `liquid-glass`, `bentogrid`
- `--theme-color`: main color seed，例如 `#8A4FFF`
- `--theme-harmony`: `preset`, `monochromatic`, `analogous`, `complementary`, `split-complementary`, `triadic`
- `--pipeline-one-page`: creates a single-slide pipeline/teaser composition from multi-section Markdown while keeping the shared parser, layout planner, validation, and renderers.
- `--theme-gallery`: 用多个 style 重复渲染同一个 Markdown 以便比较。README/Actions preview 只使用 distinct style subset。
- `--design`: legacy/shared preset 兼容选项

## Coherence Rules

- 渲染前会规范化 text，减少多余空格和异常换行。
- List item 会保留编号、缩进、bold 和 italic 信息。
- Table 使用 middle vertical alignment、coherent cell margin 和 readable minimum font size。
- SVG-backed surface 使用固定 corner radius，避免不同尺寸改变圆角观感。
- Icon slot 只作为小型、居中、单色的辅助元素。

## Project Map

```text
docs/       design, rendering, validation, and methodology documents
schemas/    Config, Override, Presentation IR, and Layout IR schemas
packages/   core, layout, override, CLI, and renderers
examples/   example Markdown decks and configs
scripts/    shared theme preview export and evaluation utilities
```

## GitHub Actions

- `CI`: installs the workspace, typechecks, builds, and runs tests.
- `Theme Preview`: generates PPTX decks, exports PNG slides, verifies artifacts, and publishes GitHub Pages.

Both workflows must pass without an LLM or external API key.
