# mdpresent

`mdpresent`는 Markdown 파일을 직접 PPT로 변환하는 도구가 아니라, Markdown 문서를 규칙 기반으로 분해하여 공통 발표 구조인 `Presentation IR`로 만들고, 이를 `PPTX / PDF / HTML`로 렌더링하는 CLI 기반 프레젠테이션 구조화 도구입니다.

언어별 문서:

- [English README](README.md)
- [Chinese README](README.zh.md)

## 핵심 철학

```text
Markdown은 원본 문서다.
분할은 heading + density로 한다.
레이아웃은 intent + item count로 고른다.
예외는 override manifest로 통제한다.
PPT 템플릿은 배경과 브랜드만 제공한다.
본문 배치는 CLI가 새로 계산한다.
```

## 파이프라인

```text
Markdown
  → Markdown AST / Simple AST
  → Outline Tree
  → Split Planner
  → Presentation IR
  → Layout Planner
  → Override Engine
  → QA / Overflow Checker
  → Renderer
      ├─ PPTX
      ├─ PDF
      └─ HTML
```

## 빠른 사용 예시

```bash
mdpresent inspect examples/basic/deck.md --json > deck.plan.json
mdpresent plan examples/basic/deck.md --json > layout.plan.json
mdpresent validate examples/basic/deck.md --override examples/basic/deck.override.yaml
mdpresent build examples/basic/deck.md --to pptx,pdf,html --out dist --design executive
mdpresent build examples/basic/deck.md --to pptx --out dist --template company-master.pptx
mdpresent build examples/basic/deck.md --to pptx --config examples/basic/mdpresent.config.yaml --out dist
mdpresent build examples/basic/deck.md --to html,pptx --config examples/themes/nord.config.yaml --out dist
mdpresent build README.md --to pptx --out dist/theme-gallery --theme-gallery executive,nord,dracula,solarized
```

## Markdown 구조 보존

Parser는 발표자료에 필요한 Markdown 구조를 단순 문단으로 평탄화하지 않고 보존합니다.

- ordered/unordered list의 번호, 중첩 level, fallback text를 유지합니다.
- 빈 `-` 줄이나 standalone `·` 같은 장식성 bullet은 렌더링 전에 제거합니다.
- `**bold**`, `*italic*` 같은 강조는 HTML과 editable PPTX text run에 반영합니다.
- paragraph line과 sentence unit을 유지하여 slide splitting과 overflow 판단에 활용합니다.
- `Draft => Review => Render` 같은 pipeline line은 semantic diagram block으로 변환하며, 내용에 따라 horizontal, vertical, U-shaped, reverse-U, cycle-like 배치를 자동 선택합니다.
- diagram과 설명 block이 같은 section에 있으면 diagram은 제목 slide에 유지하고 설명은 continuation slide로 분리합니다.

## Design Presets

`--design`과 `theme.designPreset`은 PPTX와 HTML에서 같은 shared catalog를 사용합니다. 현재 preset은 `plain`, `clean`, `executive`, `editorial`, `technical`, `dark`, `nord`, `solarized`, `dracula`, `tableau`, `gruvbox`, `monokai`, `material`, `tokyo-night`입니다.

시각 QA에는 `--theme-gallery executive,nord,dracula,solarized`를 사용해 여러 design preset을 하나의 PPTX에서 비교할 수 있습니다.

`--template example.pptx`를 입력하면 PPTX 출력은 template의 theme color와 text가 없는 장식 도형을 분석합니다. 예시 slide에서 가져온 장식은 생성 slide의 layout family가 같을 때만 재사용하며, 본문 placeholder 위치와 임의의 content box 위치는 mdpresent가 다시 계산합니다.

표지/title slide는 preset별 editable template을 사용합니다. Theme gallery는 여러 title 후보를 보여주며, `--design <preset>`을 지정하면 해당 preset의 title template 하나만 렌더링합니다.

## 구현 우선순위

1. `schemas/`의 JSON Schema를 먼저 고정한다.
2. `packages/core`에서 Markdown → Presentation IR을 만든다.
3. `packages/layout`에서 Presentation IR → Layout IR을 만든다.
4. `packages/override`에서 구조화된 override manifest를 적용한다.
5. `packages/render-html`을 먼저 구현하여 미리보기를 만든다.
6. `packages/render-pdf`는 HTML 기반 PDF로 시작한다.
7. `packages/render-pptx`는 editable object 중심으로 구현한다.

## 디렉터리 요약

```text
docs/       최종 요구사항과 설계 문서
schemas/    Config / Override / Presentation IR / Layout IR JSON Schema
packages/   TypeScript 패키지 스켈레톤
examples/   예시 Markdown, config, override
```

## Codex 사용 흐름

1. 이 저장소를 Codex에 전달한다.
2. `docs/09-codex-implementation-guide.md`를 먼저 읽게 한다.
3. 명시적인 schema-contract TODO가 없다면 `schemas/*.json`을 안정적으로 유지한다.
4. `packages/core` → `packages/layout` → `packages/override` → renderer 순서로 구현한다.
