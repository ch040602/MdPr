# mdpresent

A CLI engine that turns Markdown documents into presentation structure.

The source document stays intact, while presentation structure is computed through IR and renderers.

---

## Why It Exists

- Markdown is easy to write, but it lacks presentation layout information.
- Generic converters push long paragraphs and tables into slides and create overflow.
- Presentation decks must understand headings, sentences, lists, tables, and images as structure.
- `mdpresent` aims to be a structuring engine, not a basic converter.

---

## Core Pipeline

```text
Markdown
-> Parser
-> Outline Tree
-> Split Planner
-> Presentation IR
-> Layout IR
-> Renderer
```

Each stage leaves intermediate artifacts that humans can inspect and adjust.

---

## Structure Seen by the Splitter

- `#`, `##`, and `###` headings create slide candidates and subsections.
- `---` works as an explicit slide separator.
- Long paragraphs split by Markdown lines and sentence boundaries.
- Lists, quotes, tables, code, and images are preserved as separate block types.

---

## Layout Selection Rules

- Comparison intent uses a side-by-side comparison layout.
- Four items prefer a 2x2 grid.
- Five items become candidates for pentagon or radial layouts.
- Long narrative content splits into continuation slides.
- Overflow is validated with warn, fail, shrink, and split policies.

---

## PPTX Output Principles

- Text is emitted as editable PowerPoint text boxes.
- Bullet and paragraph line breaks reflect the original Markdown structure.
- Tables are emitted as PowerPoint table objects.
- Template PPTX image decorations may be reused as background layers.
- Multiple design presets can change the visual tone.

---

## Codex Workflow

- Lock schemas and IR contracts first.
- Use tests to fix parser, splitter, layout, and renderer behavior.
- Resolve failed overflow warnings through source split or layout rules.
- Validate final output with a `validate -> build -> package QA` loop.

---

## Current Completion State

- Markdown sentence-level splitting works.
- Explicit slide separation with `---` works.
- Config-based template paths are connected to product behavior.
- PPTX design presets and template image import work.
- Remaining improvements focus on vector master shape import and more precise typography fitting.
