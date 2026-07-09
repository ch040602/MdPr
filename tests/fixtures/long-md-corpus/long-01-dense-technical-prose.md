# Dense Technical Prose Fixture

## Scope and assumptions

The system must preserve the author's hierarchy even when the prose is long enough to look like standards-meeting notes. The top-level claim describes the decision boundary, the next line explains why the boundary exists, and the indented line records the caveat that should remain visually subordinate rather than becoming an unrelated bullet.
  The parser should keep this supporting line as a second visual level. It is not a new slide title, and it is not a list item.
    The deepest caveat should survive as a nested prose line so dense pages remain readable in a conference room.

## Design consequence

When a slide contains mostly paragraphs, the layout planner should not default to a single full-width text box. It should consider a split-text composition where the claim, evidence, and caveat can be scanned in order. This is especially important when the presenter is expected to speak over the details rather than read them aloud.

The second paragraph adds enough body content to force the dense profile. It describes input parsing, indentation preservation, renderer shrink policy, and fallback behavior in one place so the fixture resembles realistic technical notes instead of a short marketing slide.

## Review criteria

- Paragraph indentation is visible after parsing.
- The slide is split before becoming an unreadable prose wall.
- The generated PPTX keeps editable text objects.
- No decorative image is invented when the source does not provide one.

