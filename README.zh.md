# mdpresent

`mdpresent` 不是一个把 Markdown 直接转换成 PowerPoint 的工具。它是一个基于 CLI 的演示文稿结构化工具：先按规则把 Markdown 文档拆分为通用的 `Presentation IR`，再将该结构渲染为 `PPTX`、`PDF` 或 `HTML`。

`mdpresent` 是一个 **NO LLM runtime** 引擎：解析、拆分、布局、验证和渲染都以 deterministic rule-based 方式运行，不需要外部 API 调用。由于 CLI 行为独立，它也可以封装为辅助 Codex skill 或本地自动化 skill。

语言版本：

- [English README](README.md)
- [Korean README](README.ko.md)

## 核心理念

```text
Markdown 是源文档。
拆分由 heading 和 density 驱动。
布局由 intent 和 item count 选择。
例外情况通过 override manifest 控制。
PPT 模板只提供背景和品牌资产。
正文布局由 CLI 重新计算。
```

## 流水线

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
      ├─ PPTX
      ├─ PDF
      └─ HTML
```

## 快速使用

```bash
mdpresent inspect examples/basic/deck.md --json > deck.plan.json
mdpresent plan examples/basic/deck.md --json > layout.plan.json
mdpresent validate examples/basic/deck.md --override examples/basic/deck.override.yaml
mdpresent build examples/basic/deck.md --to pptx,pdf,html --out dist --design executive
mdpresent build examples/basic/deck.md --to pptx --out dist --template company-master.pptx
mdpresent build examples/basic/deck.md --to pptx --config examples/basic/mdpresent.config.yaml --out dist
mdpresent build examples/basic/deck.md --to html,pptx --config examples/themes/nord.config.yaml --out dist
mdpresent build README.md --to pptx --out dist/theme-gallery --theme-gallery executive,nord,dracula,solarized
```

## Markdown 结构保留

Parser 会保留演示文稿所需的 Markdown 结构，而不是把所有内容都压平成普通段落。

- ordered/unordered list 会保留编号、嵌套层级和 fallback text。
- 空的 `-` 行或单独的 `·` 等装饰性 bullet 会在渲染前移除。
- `**bold**`、`*italic*` 等强调会反映到 HTML 和 editable PPTX text run。
- paragraph line 和 sentence unit 会被保留，用于更安全的 slide splitting 和 overflow 判断。
- `Draft => Review => Render` 这样的 pipeline line 会转换为 semantic diagram block，并根据内容自动选择 horizontal、vertical、U-shaped、reverse-U 或 cycle-like 布局。
- 如果 diagram 和说明 block 位于同一个 section，diagram 会保留在标题 slide 中，说明内容会移动到 continuation slide。

## Design Presets

`--design` 和 `theme.designPreset` 在 PPTX 与 HTML 中使用同一个 shared catalog。当前 preset 包括 `plain`、`clean`、`executive`、`editorial`、`technical`、`dark`、`nord`、`solarized`、`dracula`、`tableau`、`gruvbox`、`monokai`、`material`、`tokyo-night`。

进行视觉 QA 时，可以使用 `--theme-gallery executive,nord,dracula,solarized` 在一个 PPTX 中比较多个 design preset。

提供 `--template example.pptx` 时，PPTX 输出会分析模板中的 theme color 和不含文本的装饰图形。来自示例 slide 的装饰只会在生成 slide 具有相同推断 layout family 时复用；正文 placeholder 和任意 content box 位置仍由 mdpresent 重新计算。

封面/title slide 使用按 preset 选择的 editable template。Theme gallery 会展示多个 title 候选；指定 `--design <preset>` 时只渲染该 preset 的一个 title template。

## 实现优先级

1. 先稳定 `schemas/` 中的 JSON Schema。
2. 在 `packages/core` 中实现 Markdown 到 `Presentation IR`。
3. 在 `packages/layout` 中实现 `Presentation IR` 到 `Layout IR`。
4. 在 `packages/override` 中应用结构化的 override manifest。
5. 优先实现 `packages/render-html`，用于预览输出。
6. `packages/render-pdf` 从 HTML 渲染路径开始。
7. `packages/render-pptx` 以可编辑 slide object 为中心实现。

## 目录概览

```text
docs/       最终需求和设计文档
schemas/    Config / Override / Presentation IR / Layout IR 的 JSON Schema
packages/   TypeScript package scaffold
examples/   示例 Markdown、config 和 override 文件
```

## Codex 工作流

1. 将此仓库交给 Codex。
2. 让 Codex 先阅读 `docs/09-codex-implementation-guide.md`。
3. 除非有明确的 schema-contract TODO，否则保持 `schemas/*.json` 稳定。
4. 按 `packages/core` → `packages/layout` → `packages/override` → renderers 的顺序实现。
