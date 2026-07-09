# Long Table Fixture

## Review matrix

The review matrix should cover high-risk areas without requiring screenshots or decorative substitutes.

| Area | Signal | Expected MDPR behavior | Residual risk |
| --- | --- | --- | --- |
| Markdown parsing | Mixed list markers | Normalize prose markers only | Literal block edge cases |
| Paragraph hierarchy | Indented prose lines | Preserve line indentation | Excessive nesting |
| Image placement | Source image dimensions | Contain by default | Missing dimensions |
| Template master | Existing PPTX theme | Preserve master background | Conflicting overrides |

## Notes

This fixture should remain a table-first slide and should not be treated as an image or a generic body paragraph.
