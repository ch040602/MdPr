# 00. Product Definition

## One-Line Definition

`mdpresent` is a CLI-based presentation structuring tool that decomposes Markdown into a shared presentation structure and renders it to PPTX, HTML, or PDF.

## Non-Goals

```text
- It is not a direct Markdown-to-PowerPoint converter.
- It is not a full Marp syntax clone.
- It is not a tool that embeds CSS-rendered slide screenshots into PowerPoint.
- It is not an LLM runtime.
```

## Responsibilities

```text
- analyze Markdown headings and content blocks
- normalize paragraph marker bullets such as `-`, `-item`, `•`, `·`, `–`,
  `—`, `−`, `ㆍ`, and `▪` into list structure while preserving slide breaks,
  arrows, negative-number prose, and literal code/pre blocks
- emit source-cleanup diagnostics for parser-owned authoring shorthand without
  turning cleanup into layout or rendering decisions
- split slides from headings, density, and explicit separators
- detect comparison, example, method, table, image, code, chart, and diagram structures
- choose layouts through deterministic rules
- preserve configured font sizes and readable minimum font floors
- use PPTX template backgrounds and master assets where appropriate
- use CLI/config theme tokens for HTML and PDF outputs
- apply override manifests for selected slide exceptions
- produce generated artifact manifests and QA diagnostics
```

## Core Outputs

```text
Presentation IR: which slides and semantic blocks are needed
Layout IR: where each slide element is placed
Renderer Output: PPTX, HTML, and PDF artifacts
Design Lock: resolved style, color, typography, and surface contract
Manifest: source hashes, output paths, diagnostics, and visual summaries
```

## Automation Model

```text
Most output is produced by deterministic rules.
Overrides handle explicit exceptions.
Optional agent hints may suggest compact semantic tags, but MDPR owns final choices.
```
