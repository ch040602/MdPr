# 01. 아키텍처

## 전체 흐름

```text
Markdown
  ↓
Parser(simple Markdown or Pandoc JSON)
  ↓
Outline Builder
  ↓
Split Planner
  ↓
Presentation IR
  ↓
Layout Planner
  ↓
Layout IR
  ↓
Override Resolver
  ↓
QA / Overflow Checker
  ↓
Renderer
    ├─ PPTX
    ├─ PDF
    └─ HTML
```

## 패키지 역할

```text
packages/core
  Markdown parse, Pandoc JSON normalization, outline tree, split, density, intent detection, Presentation IR

packages/layout
  layout preset, layout rule, safe area, typography, overflow, Layout IR

packages/override
  override manifest load, schema validation, target resolve, operation apply, diff

packages/render-html
  Layout IR → HTML

packages/render-pdf
  HTML → PDF

packages/render-pptx
  Layout IR → editable PPTX

packages/cli
  build, inspect, plan, validate, diff, override set, preview
```

## 설계 원칙

### 1. Core는 렌더러를 모른다

`core`는 PPTX/PDF/HTML에 대한 지식 없이 `Presentation IR`만 만든다.

`core` also owns the Markdown-to-structure boundary. The default parser keeps the lightweight built-in Markdown path, while `--parser pandoc` runs Pandoc and normalizes Pandoc JSON into the same `BlockIR` structure. Layout, renderer, and external design layers should consume `Presentation IR`; they should not parse Markdown again.

### 2. Layout은 좌표와 슬롯을 다룬다

HTML/CSS 중심 레이아웃이 아니라, 포맷 공통으로 쓸 수 있는 `slot / region / constraint` 구조를 사용한다.

### 3. Renderer는 포맷별 구현만 담당한다

PPTX 렌더러는 text box, table, image, shape 등 editable object를 만든다. HTML 렌더러는 semantic HTML과 CSS variables를 만든다. PDF 렌더러는 HTML 기반 print output으로 시작한다.

### 4. Override는 마지막 예외 계층이다

자동 split/layout 결과를 먼저 만들고, 특정 슬라이드만 `override manifest`로 강제한다.

### 5. PPT 템플릿은 배경과 브랜드만 제공한다

템플릿의 placeholder 배치를 그대로 쓰지 않는다. 본문 배치는 CLI의 Layout Planner가 다시 계산한다.
