# Test Design

The test suite should lock behavior at the semantic contract level before visual output is reviewed.

## Recommended Coverage

```text
core/parser
  - heading parsing
  - bullet and ordered-list parsing
  - code block parsing
  - table and image parsing
  - inline emphasis preservation

core/split
  - h2 slide candidates
  - h3 autosplitting
  - density thresholds
  - explicit slide breaks
  - one diagram per slide

core/intent
  - comparison keywords
  - four items -> grid
  - five items -> pentagon candidate
  - table/chart/code/image intent detection

layout
  - comparison regions
  - 2x2 and 3x2 grid regions
  - pipeline diagram regions
  - table-focus regions
  - overflow font floors

override
  - slideId target resolution
  - setLayout operation
  - setTypography operation
  - target-not-found diagnostics

render-pptx
  - editable text boxes
  - native tables and charts
  - unzip-level editable OpenXML contracts for text/table/chart fixtures
  - SVG-backed surfaces
  - centered icon and badge slots
  - bounded connectors
```
