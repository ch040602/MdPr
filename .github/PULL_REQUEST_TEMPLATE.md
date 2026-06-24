## Summary

Describe the user-visible behavior change and the MDPR pipeline area touched.

## Evidence

- [ ] Added or updated a Markdown fixture.
- [ ] Attached before/after PNG previews or PPTX artifacts when visual output changed.
- [ ] Added parser/layout/renderer/CLI tests where relevant.
- [ ] Ran `corepack pnpm test`.
- [ ] Ran `corepack pnpm typecheck`.

## Determinism Boundary

- [ ] The change works without an LLM or external API key.
- [ ] Any mdpr-skill hint remains weak metadata and does not own final coordinates, colors, z-order, geometry, or renderer object IDs.

