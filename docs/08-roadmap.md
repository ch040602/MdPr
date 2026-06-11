# 08. 구현 로드맵

## Phase 1. Schema 고정

- `config.schema.json`
- `override.schema.json`
- `presentation-ir.schema.json`
- `layout-ir.schema.json`

완료 기준:

```text
Codex/LLM이 schema를 기준으로 config/override 파일을 생성할 수 있음
```

## Phase 2. Core parser

- Markdown parse
- heading tree 생성
- block 추출
- stable id 생성
- Presentation IR 생성

완료 기준:

```bash
mdpresent inspect examples/basic/deck.md --json
```

## Phase 3. Split planner

- h1/h2/h3 기반 분할
- density 계산
- autosplit
- cover/toc 삽입

완료 기준:

```text
긴 h2 섹션이 h3 기준으로 자동 분할됨
```

## Phase 4. Intent detection

- comparison 감지
- item count 감지
- table/image/code 감지
- timeline 감지

완료 기준:

```text
기존/개선 → comparison
4개 예시 → grid
5개 방법 → pentagon 후보
표 중심 → table
```

## Phase 5. Layout planner

- preset 정의
- item count 기반 layout 선택
- safe area 적용
- overflow 검사 초안

완료 기준:

```bash
mdpresent plan deck.md --json
```

## Phase 6. Override engine

- override YAML/JSON 로딩
- schema 검증
- target resolve
- operation apply
- diff 출력

완료 기준:

```bash
mdpresent diff deck.md --override deck.override.yaml
```

## Phase 7. HTML renderer

- Layout IR → HTML
- CSS variable theme
- slide navigation

완료 기준:

```bash
mdpresent build deck.md --to html
```

## Phase 8. PDF renderer

- HTML 생성
- PDF 출력

완료 기준:

```bash
mdpresent build deck.md --to pdf
```

## Phase 9. PPTX renderer

- Layout IR → PPTX
- editable text box
- bullet
- table
- image
- background
- template theme 일부 반영

완료 기준:

```bash
mdpresent build deck.md --to pptx
```

