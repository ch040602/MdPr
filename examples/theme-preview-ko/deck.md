# mdpresent

## Core Principles

> The source is Markdown, and the output is a rendered presentation view.

Markdown drafts should remain readable by humans.
Slide splitting, layout selection, and overflow checks are handled by deterministic rules.

## Generation Flow

```text
Markdown draft
  -> structure analysis
  -> slide splitting
  -> presentation structure
  -> layout planning
  -> quality validation
  -> renderer output
```

## Rule-Based Engine

- No model call: generation runs without external model calls or external network calls.
- Rule-based: placement uses headings, density, item counts, sentence units, and diagram signals.
- Reproducible: the same manuscript and settings produce the same presentation structure.
- Skill wrapper friendly: the CLI can be wrapped by local automation skills.

## Markdown Structure Preservation

- Lists: numbering, nesting, and description lines are preserved.
- Emphasis: bold and italic are mapped into editable text effects.
- Quotes: key messages can be separated into emphasized regions.
- Diagrams: arrow flows become nodes and connectors.

## Theme Selection

- Presets: several color combinations are available for bright work decks, dark talk decks, and technical documents.
- Switching: the same presentation structure can be compared with different colors and decoration styles.
- Consistency: role-based styles for body text, titles, cards, and connectors stay coherent across themes.
- Editability: text and shapes remain directly editable in the presentation file.

## Quality Validation

- Text overflow: checks whether text fits inside its assigned region.
- Diagram connectors: draws node-to-node connectors from layout coordinates.
- Page splitting: dense content moves into continuation slides.
- Noise removal: decorative dots and empty items are removed before rendering.
