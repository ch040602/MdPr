# mdpresent

![MDPR one-page teaser slide preview](docs/assets/readme-teaser/slides/slide-01.png?v=bentogrid-pipeline-one-page)

`mdpresent` 是将 Markdown 转换为可编辑 PowerPoint 的确定性演示文稿
runtime。正常构建不需要 LLM 或 API key。

| | MDPR |
| --- | --- |
| 输入 | Markdown |
| 输出 | 可编辑的 `PPTX`、`HTML` 和 `PDF` |
| Runtime | rule-based parsing、splitting、layout、validation、theme binding 和 rendering |
| 可选 review | [`mdpr-skill`](https://github.com/ch040602/mdpr-skill) 提供 semantic hints 和 evidence，但不拥有最终 layout |

语言版本：[English](README.md), [Korean](README.ko.md)

## 快速开始

```bash
npm install -g @mdpresent/cli
mdpresent build deck.md --to pptx,pdf,html --out dist --design executive --visual
```

需要可移植 PPTX 时，请提供明确的 font 文件，以及绑定到每个 font
SHA-256 的 license evidence。MDPR 会在 render 后验证 evidence 绑定，但不作
法律判断。

```bash
mdpresent build deck.md --to pptx --out dist \
  --embed-font fonts/Pretendard-Regular.ttf \
  --require-font-embedded \
  --font-license-evidence font-license-evidence.json \
  --require-font-license-evidence
```

## 核心功能

- **PPTX first**：先生成可编辑 PowerPoint，再导出 PNG 进行检查。
- **No LLM runtime**：构建结果不依赖模型调用，可重复生成。
- **One-page teaser mode**：`--pipeline-one-page` keeps pipeline, feature, chart, and table summaries on one rendered slide.
- **Markdown semantics**：保留 heading、list、emphasis、table、chart、image、code、quote 和 pipeline diagram。
- **Design grammar**：将 decoration style 与 color seed 分离，并根据 harmony 规则生成 PPT theme/chart colors。
- **Object coverage**：支持 native table、native chart、proof object、icon slot、SVG-backed surface 和 diagram connector。
- **Deterministic validation**：检查 overflow、generated artifact contract、slide count、surface marker、语言和 manifest drift。
- **Skill-side review**：LLM-advised layout critique, visual polish, and high-quality deck guidance belong in [`mdpr-skill`](https://github.com/ch040602/mdpr-skill#usage), not MDPR runtime.

<!-- mdpr-readability-typography-contract -->
## 可读性与字体契约

可读性规则：

- 每个非装饰性 source block 都必须进入 layout region；即使 list、prose、
  table 和 code 混合出现，evidence-oriented layout 也不能丢弃其中任何部分。
- 每一行 code 都保留为可编辑的 OpenXML line。缩进 prose 使用独立、可编辑的
  row box，并保留 `0.06-0.10in` 的安全间距。
- `--pipeline-one-page` 中的 feature summary 与 table evidence 保持最低
  `16pt` 字体下限。
- `build` 和 `validate --visual` 在必需的 polish chapter 失败时停止，并以
  `MDPR_POLISH_GATE_FAILED` 报告失败的 chapter。
- image safe frame 保留原始 aspect ratio，或使用明确的 focal-point crop；
  source-neutral slide 不会获得没有来源依据的 image 或 icon。

字体规则：

- 默认 profile 使用 `Pretendard`：title `34pt`、body `22pt`、caption `18pt`、
  configured minimum `18pt`，line height 为 `1.2`。
- region 的有效下限依次取自 `region.typography.minFontSize`、slide overflow
  floor 和 theme minimum。shrink 与 containment resolution 不会低于该下限；
  若内容仍无法容纳，则保留 diagnostic。
- 必需的 `--visual` `fontHierarchy` chapter 要求已声明的 font family、
  title 比 body 至少大 `4pt`、Layout IR 全局下限至少 `16pt`，并且同一 role
  的 font-size variance 为 0。
- generated caption 与 code region 不再从低于 strict floor 的值开始。
  显式 override 低于 `16pt` 时仍是 required-gate failure。
- generated list 与 diagram 的 number badge 也至少使用 `16pt`；内置 preset
  不再自动添加 title 下划线、TOC 横线或 cover 底部的孤立装饰线。
- PPTX 将 resolved family 写入 document head/body theme 和可编辑 text run；
  code region 是明确的 monospace 例外，使用 `Consolas`。
- `--template` 会保留原始 master、layout 与 theme OOXML，但 generated text
  仍使用 resolved MDPR typography。若要求完全一致，应将
  `typography.fontFamily` 明确设置为 master theme family。
- 每次 build 都会在 `validation.fontEnvironment` 中记录 configured、
  detected 和 missing family、probe source 与 font-package evidence。
- `--require-font-installed` 会区分 family 缺失与 host catalog 无法检查。
  重复使用 `--embed-font <face.ttf|face.otf>` 可将显式 font face 以 EOT part
  写入 PPTX；`--require-font-embedded` 要求实际使用的 family/style coverage
  完整。
- `--font-license-evidence <evidence.json>` 将 license source 与授权声明绑定到
  每个 font SHA-256；`--require-font-license-evidence` 会拒绝 missing、
  malformed、unauthorized、stale 或 post-render hash 不匹配的 record。
  这验证 evidence 绑定而非法律充分性，因此 manifest 保留
  `legalDetermination: external`。
- Font 选择仍是显式的：MDPR 不按 family 名称下载或自动嵌入已安装 font，
  并拒绝 TTC/OTC/WOFF container。CJK 与 mixed-language 测量不会为了 fit
  改写 source text。

<!-- mdpr-runtime-skill-comparison -->
## MDPR 与 mdpr-skill 一览

快速选择：生成 deck 时运行 MDPR；还需要 agent review 时再加入
`mdpr-skill`。两者互补，并非相互竞争的 renderer。

| 决策边界 | MDPR | mdpr-skill |
| --- | --- | --- |
| 适用场景 | 确定性完成 Markdown parsing、layout、validation，并输出可编辑的 `PPTX`/`HTML`/`PDF` | 在 MDPR build 前后提供可选的 Codex hint、review finding 和 comparison evidence |
| 字体决定权 | 决定 font family、point size、region floor 与 editable text run。caption 默认为 `18pt`；generated code、caption、list badge 和 diagram badge 均没有 sub-`16pt` runtime 例外。 | 可以建议缩短文案或 content split，但不能指定精确 family、point size、line break 或 text-box geometry。 |
| Strict visual failure | 必需的 `fontHierarchy` 以 `16pt` 检查每个 active Layout IR region；更小的显式 override 会保留为 `MDPR_POLISH_GATE_FAILED`。 | 只用 evidence 镜像 manifest failure，不重新计算、放宽或 override。 |
| 装饰线 | Built-in preset 不会自动添加 title underline、TOC horizontal rule 或孤立的 cover-bottom rule。 | 除非 source content 明确要求，否则 review evidence 不添加 synthetic subtitle、title rule 或 bottom takeaway band。 |
| Template font | `--template` 保留 master/layout/theme OOXML，但 generated text 使用 resolved MDPR typography；精确匹配应设置 `typography.fontFamily`。 | 可以报告 template mismatch，但不会替换 master typography，也不会声称 font 已安装或嵌入。 |
| 输出责任 | 拥有最终 coordinates、colors、z-order、objects、rendering 和 pass/fail。 | 只生成 hint、review report 与 evidence；所有最终 runtime 决策仍由 MDPR 作出。 |

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

## 命令参考

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
