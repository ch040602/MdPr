# Workflow Heavy Fixture

## End-to-end generation path

Markdown draft => Semantic parsing => Slide splitting => Layout ranking => PPTX rendering => Visual validation

The workflow should appear as a process, not as plain prose. Each node represents a real step that can fail independently, so the diagram needs stable spacing and short node labels.

## Failure recovery loop

Source edit => Rebuild deck => Inspect diagnostics => Adjust content split => Rebuild again => Export preview

The loop is intentionally long. A workflow-heavy academic or engineering talk often has repeated stages with different ownership, and MDPR should turn arrow syntax into a diagram block while keeping surrounding explanation short.

## Operational notes

- Parsing errors should be reported before layout decisions.
- Overflow diagnostics should point to the source slide.
- Image search remains disabled unless the user asks for image sourcing.
- Template masters should remain authoritative when a PPTX template is supplied.

