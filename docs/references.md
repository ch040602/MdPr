# References

이 파일은 구현자가 참고할 수 있는 외부 기술 후보를 정리한다. 특정 라이브러리 사용을 강제하지 않는다.

## Markdown parsing

- unified
- remark
- remark-parse
- gray-matter

## YAML / Schema validation

- yaml
- ajv
- json-schema-to-typescript

## PPTX rendering

- PptxGenJS
- Open XML SDK 자료
- PresentationML 문서 구조 자료

## HTML / PDF rendering

- Playwright
- Chromium print-to-PDF

## CLI

- commander
- cac
- yargs

## Testing

- vitest
- uvu
- snapshot test

## 설계 메모

MVP에서는 의존성을 최소화해도 된다. 다만 실제 제품화 단계에서는 Markdown AST, YAML, JSON Schema validation, PPTX generation, PDF generation 라이브러리를 분리하여 관리하는 것이 좋다.

