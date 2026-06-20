# 10. PPT Template and Slide Master Policy

## Principle

```text
Template controls brand.
Layout engine controls placement.
```

Templates provide brand and background material. MDPR recalculates body placement.

## Import From Templates

```text
- slide size
- theme colors
- fonts
- master background
- layout background
- logo
- footer
- decorative image assets
- safe-area hints where available
```

## Do Not Reuse Directly

```text
- body placeholder positions
- arbitrary title/content box positions
- sample slide layout coordinates
- sample text inside templates
```

## Master-Layer Candidates

```text
- company logo
- fixed background patterns
- brand bars
- common footers
- decorative shapes or images
```

## Body-Layer Candidates

```text
- title
- prose
- lists
- tables
- images
- charts
- code
- diagrams
```

## Safe Area

Avoid zones keep content away from master background elements.

```yaml
safeArea:
  enabled: true
  avoid:
    - id: top-brand-bar
      x: 0
      y: 0
      w: 13.33
      h: 0.6
    - id: footer
      x: 0
      y: 6.85
      w: 13.33
      h: 0.65
```

## Note

Slide Master is not a security boundary. It only reduces accidental movement of repeated background elements during normal slide editing.
