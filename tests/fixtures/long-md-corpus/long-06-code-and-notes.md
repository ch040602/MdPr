# Code Heavy Fixture

## Runtime profile

The renderer should keep code compact and editable. It should not treat literal marker characters inside code blocks as prose bullets.

```yaml
deck:
  ratio: 16:9
layout:
  overflow:
    defaultAction: shrink
notes:
  -literal-marker: keep as code
  arrow: Draft => Review => Render
```

## Explanation

The text around the code block explains the runtime shape. It should remain secondary to the code, but still be visible enough for a presenter to describe why the configuration matters.

## Edge cases

- Code markers stay literal.
- Prose markers outside code become structured list items.
- Long paths and inline code such as `packages/render-pptx/src/index.ts` should wrap without overflowing.

