# mdpresent

## Core Principle

> Markdown remains the source of truth; the deck is a rendered presentation view.

The source document should stay readable for people.
Slide splitting, layout selection, and overflow checks are handled by deterministic rules.

## Generation Flow

```text
Markdown source
  → Structure parsing
  → Slide splitting
  → Presentation model
  → Layout planning
  → Quality checks
  → Rendered output
```

## Rule-Based Engine

- NO LLM runtime: generation does not call an external model.
- Rule-based layout: headings, density, list count, sentence units, and diagram signals drive placement.
- Reproducible output: the same source and settings produce the same presentation structure.
- Auxiliary skill ready: the standalone CLI can be wrapped as a local automation skill.

## Markdown Semantics

- Lists: ordered items, nesting, and description lines stay structured.
- Emphasis: bold and italic markers become editable text effects.
- Quotes: key statements are separated into emphasized regions.
- Diagrams: arrow flows become nodes and connected lines.

## Theme Selection

- Presets: business, editorial, technical, dark, and data-friendly palettes are available.
- Switching: one presentation structure can be compared across multiple visual themes.
- Consistency: titles, body text, cards, and connectors keep their role-based styling.
- Editing: generated presentation files keep text and shapes editable.

## Quality Checks

- Text fit: content is checked against its assigned region.
- Diagram connections: node connectors are drawn from calculated coordinates.
- Continuation slides: dense content is split instead of shrinking below readable size.
- Cleanup: decorative bullets and empty artifacts are removed before rendering.
