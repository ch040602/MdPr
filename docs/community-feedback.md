# Community Feedback

MDPR needs real Markdown edge cases more than generic praise. If you want to
help, the most useful contribution is a small document that currently produces a
bad editable PPTX deck.

## What To Share

- Markdown snippets that split into the wrong slides.
- Tables, charts, diagrams, or images that should stay together.
- PPTX output where text clips, shrinks too much, or leaves its shape.
- Decks where same-depth objects lose visual coherence.
- Examples where Pandoc, Marp, Slidev, Quarto, or an LLM slide workflow handles
  something better.

## Good Issue Format

```text
Input Markdown:
...

Command:
mdpresent build deck.md --to pptx --out dist --visual

Expected:
...

Actual:
...

Artifacts:
- generated PPTX
- exported PNG
- manifest or diagnostics snippet
```

## Launch Message

Use this short description when sharing MDPR:

```text
MDPR generates editable, visually checked PowerPoint decks from Markdown with a
deterministic runtime. It focuses on PPTX layout quality, slide splitting,
tables/charts/diagrams, icon slots, theme rules, overflow validation, and
repeatable output without requiring an LLM at runtime.
```

For LLM-advised review, use
[`mdpr-skill`](https://github.com/ch040602/mdpr-skill). MDPR still owns the
final parsing, layout, coordinates, colors, z-order, and renderer output.
