# MDPR: Markdown to Editable PPTX

## Runtime Pipeline

Markdown => Semantic IR => Layout Grammar => Theme Tokens => Editable PPTX

## Main Proof

- PPTX first: editable slides, PNG previews, HTML/PDF exports.
- No agent runtime: deterministic parse, split, layout, validation, render.
- 9 themes, 36+ patterns, 12 object families, chart/table/diagram/image/icon coverage.
- Coherence checks: text bounds, graph containment, table fit, PPT theme colors.

## Coverage

```chart
labels: Styles, Patterns, Object families, Checks
Current: 9, 36, 12, 9
```

## Boundary

| MDPR owns | Skill may hint |
| --- | --- |
| layout, theme, objects, output | semantic grouping, review notes |
