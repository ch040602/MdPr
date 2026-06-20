# mdpresent

![MDPR generated teaser summary slide preview](docs/theme-preview/slides/magazine/slide-04.png)

`mdpresent`는 deterministic Markdown presentation runtime입니다.

- **입력**: Markdown 문서
- **중간 모델**: `Presentation IR`, `Layout IR`
- **출력**: editable `PPTX`, `HTML`, `PDF`
- **런타임**: 파싱, 분할, 레이아웃, 검증, 테마 선택, 렌더링 모두 rule-based
- **Agent 경계**: [`mdpr-skill`](https://github.com/ch040602/mdpr-skill)은 compact semantic hint만 제안할 수 있고, 최종 구조와 출력은 MDPR이 결정합니다.
- **README asset**: 공통 `examples/theme-preview-en/deck.md` PPTX preview deck에서 추출하며 README 전용 renderer를 쓰지 않습니다.

언어별 문서: [English](README.md), [Chinese](README.zh.md)

## 핵심 기능

- **PPTX-first**: editable PowerPoint 슬라이드를 먼저 만들고, 이를 PNG로 추출해 검수합니다.
- **No LLM runtime**: 빌드 결과는 모델 호출 없이 재현 가능합니다.
- **Markdown semantics 보존**: heading, list, emphasis, table, chart, image, code, quote, pipeline diagram을 구조로 유지합니다.
- **Design grammar**: 장식 스타일과 색상 seed를 분리하고, harmony 규칙으로 PPT theme/chart 색을 계산합니다.
- **Object coverage**: native table, native chart, proof object, icon slot, SVG-backed surface, diagram connector를 지원합니다.
- **Visual QA**: PPTX/PNG 산출물, slide count, surface marker, 언어, overflow, manifest drift를 검사합니다.

## 미리보기

- [PPT 생성 기반 theme preview gallery 열기](https://ch040602.github.io/MdPr/theme-preview/)
- Preview 범위: palette-only 또는 background-only swap을 제외한 8개 pruned decoration style
- Gallery 산출물: generated PPTX deck과 PowerPoint에서 추출한 PNG slide

| Teaser Summary | Pipeline Diagram |
| --- | --- |
| <img src="docs/theme-preview/slides/magazine/slide-04.png" alt="PPTX teaser summary slide exported to PNG" width="100%"> | <img src="docs/theme-preview/slides/grid/slide-10.png" alt="PPTX pipeline diagram slide exported to PNG" width="100%"> |

| Markdown Semantics | Decoration Patterns |
| --- | --- |
| <img src="docs/theme-preview/slides/grid/slide-09.png" alt="PPTX semantic blocks slide exported to PNG" width="100%"> | <img src="docs/theme-preview/slides/magazine/slide-11.png" alt="PPTX decoration pattern catalog slide exported to PNG" width="100%"> |

| Editable Proof Objects | Mixed Object Packing |
| --- | --- |
| <img src="docs/theme-preview/slides/data/slide-16.png" alt="PPTX editable proof object slide exported to PNG" width="100%"> | <img src="docs/theme-preview/slides/grid/slide-23.png" alt="PPTX mixed object packing slide exported to PNG" width="100%"> |

## 런타임 파이프라인

- Agent hint는 semantic tag나 icon keyword 같은 작은 힌트만 줄 수 있습니다.
- MDPR은 parsing, splitting, graph preservation, layout, theme color, icon search, z-order, overflow check, renderer output을 직접 결정합니다.
- 하나의 graph 또는 diagram block은 두 페이지 이상으로 쪼개지지 않습니다.

<img src="docs/theme-preview/slides/grid/slide-10.png" alt="MDPR deterministic presentation pipeline slide exported to PNG" width="100%">

```text
Markdown
  -> Markdown AST / Simple AST
  -> Outline Tree
  -> Split Planner
  -> Presentation IR
  -> Layout Planner
  -> Override Engine
  -> QA / Overflow Checker
  -> Renderer
      -> PPTX
      -> HTML
      -> PDF
```

## 빠른 사용법

```bash
mdpresent inspect examples/basic/deck.md --json > deck.plan.json
mdpresent plan examples/basic/deck.md --json > layout.plan.json
mdpresent validate examples/basic/deck.md --override examples/basic/deck.override.yaml
mdpresent build examples/basic/deck.md --to pptx,pdf,html --out dist --design executive
mdpresent build examples/basic/deck.md --to pptx --out dist --theme-style glass --theme-color "#8A4FFF" --theme-harmony analogous --visual
mdpresent build examples/basic/deck.md --to pptx --out dist --template company-master.pptx
```

## 디자인 옵션

- `--theme-style`: `clean`, `executive`, `editorial`, `technical`, `minimalism`, `newmorphism`, `glass`, `grid`, `data`, `magazine`
- `--theme-color`: `#8A4FFF` 같은 main color seed
- `--theme-harmony`: `preset`, `monochromatic`, `analogous`, `complementary`, `split-complementary`, `triadic`
- `--theme-gallery`: 같은 Markdown을 여러 style로 반복 렌더링하여 비교합니다. README/Actions preview는 distinct style subset만 사용합니다.
- `--design`: 기존 shared preset 선택과의 호환 옵션

## Coherence 규칙

- 렌더링 전 text를 정규화해 불필요한 공백과 이상한 줄바꿈을 줄입니다.
- List item은 번호, 들여쓰기, bold, italic 정보를 유지합니다.
- Table은 middle vertical alignment, coherent cell margin, readable minimum font size를 사용합니다.
- SVG-backed surface는 도형 크기와 무관하게 고정 corner radius를 유지합니다.
- Icon slot은 작고 중앙 정렬된 보조 요소로만 사용합니다.

## 프로젝트 구조

```text
docs/       설계, 렌더링, QA, 방법론 문서
schemas/    Config, Override, Presentation IR, Layout IR schema
packages/   core, layout, override, CLI, renderer
examples/   예시 Markdown deck과 config
scripts/    shared theme preview export and evaluation utility
```

## GitHub Actions

- `CI`: workspace 설치, typecheck, build, test 실행
- `Theme Preview`: PPTX deck 생성, PNG 추출, artifact 검증, GitHub Pages 배포

두 workflow 모두 LLM이나 외부 API key 없이 통과해야 합니다.
