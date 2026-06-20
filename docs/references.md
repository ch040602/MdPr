# References

This file lists implementation reference candidates. It does not require a specific library.

## Markdown Parsing

- unified
- remark
- remark-parse
- gray-matter
- Pandoc JSON AST

## YAML and Schema Validation

- yaml
- ajv
- json-schema-to-typescript

## PPTX Rendering

- PptxGenJS
- Office Open XML documentation
- PresentationML documentation

## HTML and PDF Rendering

- Playwright
- Chromium print-to-PDF

## CLI

- commander
- cac
- yargs

## Testing

- Node test runner
- vitest
- uvu
- snapshot tests

## Design Note

The MVP may keep dependencies minimal. Product-level implementation should separate Markdown AST handling, YAML parsing, JSON Schema validation, PPTX generation, PDF generation, and screenshot/raster validation.
