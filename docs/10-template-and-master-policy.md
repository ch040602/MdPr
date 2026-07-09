# 10. PPT Template and Slide Master Policy

## Principle

```text
Template controls brand.
Slide master/layout controls approved placeholder placement.
Layout engine controls fallback placement.
Layout engine controls placement when master/layout placeholders are absent, ambiguous, or unsafe.
```

Templates provide brand, background material, and approved placeholder geometry.
In template-fill workflows, the existing PPTX/POTX package is treated as the
theme and master evidence source by default. MDPR inspects slide master,
layout, relationship, and theme parts to preserve the package boundary and to
reuse compatible title/content placeholders when doing so is unambiguous.
When compatible placeholders are absent or unsafe, body content placement
falls back to deterministic MDPR layout output.

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
- title, subtitle, body, image, table, and chart placeholder geometry
- safe-area hints where available
```

## Do Not Reuse Directly

```text
- arbitrary title/content box positions that are not master/layout placeholders
- sample slide layout coordinates
- sample text inside templates
- agent-provided replacement master/layout IDs
- agent-provided final image crops, coordinates, or z-order
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
Agent hints can request `preserve-existing-master-slides` as semantic policy,
but they cannot transform, replace, or select concrete master slide parts.
