# ADR 0001: Presentation IR Schema Contract

## Status

Accepted

## Context

The project treats JSON Schemas in `schemas/` as stable interchange contracts. The existing TypeScript `OutlineNode` type and `planPresentation()` output include `blocks` and `headingPath`, but `schemas/presentation-ir.schema.json` omitted those properties while setting `additionalProperties: false` for outline nodes.

That made valid runtime `PresentationIR` output incompatible with the published schema.

## Decision

`schemas/presentation-ir.schema.json` is the public interchange contract for serialized `PresentationIR`.

For the current scaffold, the TypeScript `PresentationIR` types and runtime output must conform to that schema. Because `blocks` and `headingPath` are already required by the TypeScript `OutlineNode` type and are useful for downstream planning, the schema now includes them as required outline node properties.

## Consequences

- `planPresentation()` output can be validated against the schema without dropping outline metadata.
- Future IR changes must update both the TypeScript type and the schema in the same TODO.
- Schema-contract changes require explicit approval because they affect public API compatibility.
