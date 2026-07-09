# Data Proof Fixture

## Evaluation summary

The slide should lead with the conclusion and keep the proof object editable. A chart or table should not be converted into an uneditable screenshot.

```chart
labels: Parser, Splitter, Layout, PPTX
Pass: 91, 87, 84, 89
Review: 72, 75, 78, 81
```

## Interpretation

The result shows why the chart improved while leaving the detailed control table to a separate proof slide.

## Risk controls

The control table should remain editable and should not be converted into an image.

| Component | Risk | Current control | Status |
| --- | --- | --- | --- |
| Parser | Marker normalization may damage literal blocks | Code block exclusion and diagnostics | Stable |
| Layout | Image and table evidence may compete | Object coverage scoring | Stable |
