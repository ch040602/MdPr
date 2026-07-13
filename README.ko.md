# mdpresent

![MDPR one-page teaser slide preview](docs/assets/readme-teaser/slides/slide-01.png?v=bentogrid-pipeline-one-page)

`mdpresent`는 deterministic Markdown presentation runtime입니다.

- **입력**: Markdown 문서
- **중간 모델**: `Presentation IR`, `Layout IR`
- **출력**: editable `PPTX`, `HTML`, `PDF`
- **런타임**: 파싱, 분할, 레이아웃, 검증, 테마 선택, 렌더링 모두 rule-based
- **LLM-advised quality**: agent-side semantic hint, review loop, visual-quality advice가 필요하면 [`mdpr-skill`](https://github.com/ch040602/mdpr-skill)을 사용합니다.
- **Agent 경계**: [`mdpr-skill`](https://github.com/ch040602/mdpr-skill)은 `--hints`로 compact semantic hint만 전달할 수 있고, 좌표/색상/폰트/객체 선택 같은 최종 결정은 MDPR이 거부하며 최종 구조와 출력은 MDPR이 결정합니다.
- **README asset**: 메인 teaser는 `examples/readme-teaser/deck.md`를 `--pipeline-one-page`로 빌드하고, gallery 이미지는 공통 theme preview deck에서 추출합니다. README 전용 renderer는 쓰지 않습니다.

언어별 문서: [English](README.md), [Chinese](README.zh.md)

## 핵심 기능

- **PPTX-first**: editable PowerPoint 슬라이드를 먼저 만들고, 이를 PNG로 추출해 검수합니다.
- **No LLM runtime**: 빌드 결과는 모델 호출 없이 재현 가능합니다.
- **One-page teaser mode**: `--pipeline-one-page`는 pipeline, feature, chart, table 요약을 한 장의 slide에 유지합니다.
- **Markdown semantics 보존**: heading, list, emphasis, table, chart, image, code, quote, pipeline diagram을 구조로 유지합니다.
- **Design grammar**: 장식 스타일과 색상 seed를 분리하고, harmony 규칙으로 PPT theme/chart 색을 계산합니다.
- **Object coverage**: native table, native chart, proof object, icon slot, SVG-backed surface, diagram connector를 지원합니다.
- **Deterministic validation**: overflow, generated artifact contract, slide count, surface marker, 언어, manifest drift, post-AI PPT polish gate를 검사합니다.
- **Skill-side review**: LLM 기반 레이아웃 비평, visual polish, high-quality deck guidance는 MDPR runtime이 아니라 [`mdpr-skill`](https://github.com/ch040602/mdpr-skill#usage)의 역할입니다.

<!-- mdpr-readability-typography-contract -->
## 가독성 및 글꼴 계약

가독성 규칙:

- 장식용이 아닌 모든 source block은 layout region에 도달해야 하며,
  list, prose, table, code가 섞여 있어도 evidence 중심 layout이 일부를
  누락해서는 안 됩니다.
- code line은 각각 편집 가능한 OpenXML line으로 유지합니다. 들여쓴
  prose는 별도의 편집 가능한 row box로 배치하고 `0.06-0.10in`의 안전
  간격을 둡니다.
- `--pipeline-one-page`의 feature summary와 table evidence는 최소 `16pt`
  글꼴 하한을 유지합니다.
- `build`와 `validate --visual`은 필수 polish chapter가 실패하면 중단하고,
  실패한 chapter와 함께 `MDPR_POLISH_GATE_FAILED`를 보고합니다.
- image safe frame은 원본 aspect ratio를 보존하거나 명시적인 focal-point
  crop을 사용합니다. source-neutral slide에는 근거 없는 image나 icon을
  추가하지 않습니다.

글꼴 규칙:

- 기본 profile은 `Pretendard`, title `34pt`, body `22pt`, caption `18pt`,
  configured minimum `18pt`, line height `1.2`를 사용합니다.
- region의 실제 하한은 `region.typography.minFontSize`, slide overflow floor,
  theme minimum 순서로 결정합니다. shrink와 containment resolution은 이
  하한 아래로 내려가지 않으며, 그래도 맞지 않으면 diagnostic을 남깁니다.
- 필수 `--visual` `fontHierarchy` chapter는 선언된 font family, title/body
  사이 최소 `4pt` 차이, Layout IR 전체 최소 `16pt`, 동일 role의 font-size
  variance 0을 요구합니다.
- generated caption과 code region은 더 이상 strict floor보다 작은 값으로
  시작하지 않습니다. 명시적인 override가 `16pt`보다 작으면 required-gate
  failure로 남습니다.
- generated list와 diagram의 number badge도 최소 `16pt`를 사용하며, 내장
  preset은 모든 title 아래에 장식용 밑줄을 자동 추가하지 않습니다.
- PPTX는 resolved family를 document head/body theme과 편집 가능한 text run에
  기록합니다. code region은 명시적 monospace 예외로 `Consolas`를 사용합니다.
- `--template`은 기존 master, layout, theme OOXML을 보존하지만 generated text는
  resolved MDPR typography를 사용합니다. 정확히 일치해야 하면
  `typography.fontFamily`를 master theme family로 명시해야 합니다.
- MDPR은 font를 embed하거나 host 설치 여부를 검증하지 않습니다. authoring과
  rendering system에 선택한 family가 있어야 하며, CJK·mixed-language 측정은
  fit을 위해 source text를 임의로 다시 쓰지 않습니다.

<!-- mdpr-runtime-skill-comparison -->
## MDPR과 mdpr-skill 한눈에 비교

| 결정 경계 | MDPR | mdpr-skill |
| --- | --- | --- |
| 사용 목적 | Markdown parsing, layout, validation과 편집 가능한 `PPTX`/`HTML`/`PDF`를 결정론적으로 생성 | MDPR build 전후의 선택적 Codex hint, review finding, 비교 evidence |
| 글꼴 결정권 | font family, point size, region floor, editable text run을 결정합니다. caption 기본값은 `18pt`이고 code는 sub-`16pt` runtime 예외 없이 `Consolas`를 사용합니다. | 더 짧은 문장이나 content split은 제안할 수 있지만 정확한 family, point size, line break, text-box geometry는 지정할 수 없습니다. |
| Strict visual failure | 필수 `fontHierarchy`는 모든 active Layout IR region을 `16pt` 기준으로 검사합니다. 더 작은 명시적 override는 `MDPR_POLISH_GATE_FAILED`로 남습니다. | manifest failure를 evidence와 함께 mirror할 뿐 재계산, 완화, override하지 않습니다. |
| Template font | `--template`은 master/layout/theme OOXML을 보존하지만 generated text는 resolved MDPR typography를 사용합니다. 정확한 family 일치는 `typography.fontFamily`로 지정합니다. | template mismatch를 보고할 수 있지만 master typography를 교체하거나 font 설치·embed를 주장하지 않습니다. |
| 출력 책임 | 최종 좌표, 색상, z-order, object, rendering, pass/fail을 소유합니다. | hint, review report, evidence만 만들며 최종 runtime 결정은 모두 MDPR에 남깁니다. |

## 미리보기

- [PPT 생성 기반 theme preview gallery 열기](https://ch040602.github.io/MdPr/theme-preview/)
- Preview 범위: palette-only 또는 background-only swap을 제외한 9개 redefined decoration style
- Gallery 산출물: generated PPTX deck과 PowerPoint에서 추출한 PNG slide

| Teaser Summary | Pipeline Diagram |
| --- | --- |
| <img src="docs/assets/readme-teaser/slides/slide-01.png?v=bentogrid-pipeline-one-page" alt="PPTX one-page teaser slide exported to PNG" width="100%"> | <img src="docs/theme-preview/slides/bentogrid/slide-11.png" alt="PPTX pipeline diagram slide exported to PNG" width="100%"> |

| Markdown Semantics | Decoration Patterns |
| --- | --- |
| <img src="docs/theme-preview/slides/minimalism/slide-09.png" alt="PPTX semantic blocks slide exported to PNG" width="100%"> | <img src="docs/theme-preview/slides/minimalism/slide-12.png" alt="PPTX decoration pattern catalog slide exported to PNG" width="100%"> |

| Editable Proof Objects | Mixed Object Packing |
| --- | --- |
| <img src="docs/theme-preview/slides/skeuomorphism/slide-17.png" alt="PPTX editable proof object slide exported to PNG" width="100%"> | <img src="docs/theme-preview/slides/newmorphism/slide-24.png" alt="PPTX mixed object packing slide exported to PNG" width="100%"> |

| Image Safe Frame | Brutalist Chart Pair |
| --- | --- |
| <img src="docs/theme-preview/slides/glassmorphism/slide-23.png" alt="PPTX image safe frame slide exported to PNG" width="100%"> | <img src="docs/theme-preview/slides/brutalism/slide-16.png" alt="PPTX chart and table pair slide exported to PNG" width="100%"> |

## 테마 스타일 예시

같은 Markdown source를 pruned distinct theme style로 렌더링한 결과입니다. 아래 이미지는 모두 generated PPTX output에서 추출한 PNG입니다.

| Skeuomorphism | Neomorphism | Glassmorphism |
| --- | --- | --- |
| <img src="docs/theme-preview/slides/skeuomorphism/slide-01.png" alt="Skeuomorphism theme cover slide exported from PPTX" width="100%"> | <img src="docs/theme-preview/slides/neomorphism/slide-01.png" alt="Neomorphism theme cover slide exported from PPTX" width="100%"> | <img src="docs/theme-preview/slides/glassmorphism/slide-01.png" alt="Glassmorphism theme cover slide exported from PPTX" width="100%"> |

| Claymorphism | Minimalism | Newmorphism |
| --- | --- | --- |
| <img src="docs/theme-preview/slides/claymorphism/slide-01.png" alt="Claymorphism theme cover slide exported from PPTX" width="100%"> | <img src="docs/theme-preview/slides/minimalism/slide-01.png" alt="Minimalism theme cover slide exported from PPTX" width="100%"> | <img src="docs/theme-preview/slides/newmorphism/slide-01.png" alt="Newmorphism theme cover slide exported from PPTX" width="100%"> |

| Brutalism | Liquid Glass | Bentogrid |
| --- | --- | --- |
| <img src="docs/theme-preview/slides/brutalism/slide-01.png" alt="Brutalism theme cover slide exported from PPTX" width="100%"> | <img src="docs/theme-preview/slides/liquid-glass/slide-01.png" alt="Liquid glass theme cover slide exported from PPTX" width="100%"> | <img src="docs/theme-preview/slides/bentogrid/slide-01.png" alt="Bentogrid theme cover slide exported from PPTX" width="100%"> |

## 런타임 파이프라인

- Agent hint는 semantic tag나 icon keyword 같은 작은 힌트만 줄 수 있습니다.
- Hint 파일은 weak metadata로 검증되며 좌표, 색상, font size, z-order, component choice, renderer object ID는 거부됩니다.
- MDPR은 parsing, splitting, graph preservation, layout, theme color, icon search, z-order, overflow check, renderer output을 직접 결정합니다.
- 하나의 graph 또는 diagram block은 두 페이지 이상으로 쪼개지지 않습니다.

<img src="docs/theme-preview/slides/bentogrid/slide-11.png" alt="MDPR deterministic presentation pipeline slide exported to PNG" width="100%">

```text
Markdown
  -> Markdown AST / Simple AST
  -> Outline Tree
  -> Split Planner
  -> Presentation IR
  -> Layout Planner
  -> Override Engine
  -> Validation / Overflow Checker
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
mdpresent build examples/basic/deck.md --to pptx --out dist --theme-style glassmorphism --theme-color "#8A4FFF" --theme-harmony analogous --visual
mdpresent build examples/readme-teaser/deck.md --to pptx --out dist/readme-teaser --theme-style bentogrid --theme-color "#0F766E" --theme-harmony split-complementary --pipeline-one-page --visual
mdpresent build examples/basic/deck.md --to pptx --out dist --template company-master.pptx
```

## 디자인 옵션

- `--theme-style`: `skeuomorphism`, `neomorphism`, `glassmorphism`, `claymorphism`, `minimalism`, `newmorphism`, `brutalism`, `liquid-glass`, `bentogrid`
- `--theme-color`: `#8A4FFF` 같은 main color seed
- `--theme-harmony`: `preset`, `monochromatic`, `analogous`, `complementary`, `split-complementary`, `triadic`
- `--pipeline-one-page`: 여러 section의 Markdown을 한 장짜리 pipeline/teaser composition으로 만들되 parser, layout planner, validation, renderer는 동일 경로를 사용합니다.
- `--theme-gallery`: 같은 Markdown을 여러 style로 반복 렌더링하여 비교합니다. README/Actions preview는 distinct style subset만 사용합니다.
- `validation.polish`: 모든 build manifest가 font hierarchy, layout composition, highlight page, cover treatment, detail QA, 선택적 theme-gallery before/after evidence를 기록합니다.
- `--design`: 기존 shared preset 선택과의 호환 옵션

## Coherence 규칙

- 렌더링 전 text를 정규화해 불필요한 공백과 이상한 줄바꿈을 줄입니다.
- List item은 번호, 들여쓰기, bold, italic 정보를 유지합니다.
- Table은 middle vertical alignment, coherent cell margin, readable minimum font size를 사용합니다.
- SVG-backed surface는 도형 크기와 무관하게 고정 corner radius를 유지합니다.
- Icon slot은 작고 중앙 정렬된 보조 요소로만 사용합니다.

## 프로젝트 구조

```text
docs/       설계, 렌더링, 검증, 방법론 문서
schemas/    Config, Override, Presentation IR, Layout IR schema
packages/   core, layout, override, CLI, renderer
examples/   예시 Markdown deck과 config
scripts/    shared theme preview export and evaluation utility
```

## GitHub Actions

- `CI`: workspace 설치, typecheck, build, test 실행
- `Theme Preview`: PPTX deck 생성, PNG 추출, artifact 검증, GitHub Pages 배포

두 workflow 모두 LLM이나 외부 API key 없이 통과해야 합니다.
