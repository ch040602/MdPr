# 05. LLM/Codex 친화적 Override Manifest

## 목적

Override manifest는 자동 분할/자동 레이아웃 결과 중 일부 슬라이드를 사람이 또는 LLM/Codex가 구조적으로 수정하기 위한 파일이다.

## 원칙

```text
1. YAML/JSON 모두 지원한다.
2. JSON Schema로 검증한다.
3. slideIndex보다 slideId를 우선한다.
4. 좌표 직접 수정은 고급 기능으로 둔다.
5. 가능한 한 setLayout, setTypography, setBackground만 사용한다.
6. operation마다 reason을 남길 수 있다.
7. validate와 diff 명령으로 결과를 확인한다.
```

## 권장 workflow

```bash
mdpresent inspect deck.md --json > deck.plan.json
```

Codex/LLM은 `deck.plan.json`을 읽고 아래와 같은 override를 생성한다.

```yaml
version: "1.0"

operations:
  - op: setLayout
    target:
      slideId: main-features-a13f92
    value:
      preset: grid
      columns: 2
      rows: 2
    reason: "4개의 주요 기능이므로 2x2 grid가 적합함"

  - op: setLayout
    target:
      slideId: as-is-to-be-991af
    value:
      preset: comparison
      direction: horizontal
    reason: "기존/개선 비교 구조이므로 좌우 비교가 적합함"
```

## Target 우선순위

```text
slideId > headingPath > title > slideIndex > intent
```

`slideId` stability policy:

```text
Preserved when body content is inserted above or below an existing heading and the headingPath stays the same.
Not preserved when a heading title, heading level, duplicate heading order, or autosplit candidate changes.
```

## Operation 목록

```text
setLayout
setTypography
setBackground
setOverflow
setSplit
setSlot
moveBlock
hideBlock
pinBlock
```

## Override execution phases

Overrides are applied in two phases.

```text
Pre-layout phase:
  setSplit

Post-layout phase:
  setLayout
  setTypography
  setBackground
  setOverflow
  setSlot
  moveBlock
  hideBlock
  pinBlock
```

`setSplit` changes slide generation, so it must run before `Presentation IR` is planned and before `Layout IR` exists. The current post-layout override engine accepts the manifest shape but reports `OVERRIDE_REQUIRES_PRE_LAYOUT_PHASE` when `setSplit` reaches `applyOverrides()`.

Acceptance plan for `forceSingleSlide`:

```text
1. Load manifest.
2. Extract pre-layout operations.
3. Apply setSplit.forceSingleSlide to the matching outline or slide candidate.
4. Run presentation planning.
5. Assert the affected candidate remains one slide even when density exceeds the autosplit threshold.
6. Run layout planning and post-layout overrides.
```

## setLayout 예시

```yaml
operations:
  - op: setLayout
    target:
      slideId: five-methods-8a1c2
    value:
      preset: pentagon
      direction: radial
```

## setTypography 예시

```yaml
operations:
  - op: setTypography
    target:
      slideId: main-features-a13f92
    value:
      bodyFontSize: 21
      minFontSize: 18
```

## setSlot 예시

```yaml
operations:
  - op: setSlot
    target:
      slideId: comparison-as-is-to-be-291ab
      slot: left
    value:
      x: 0.8
      y: 1.6
      w: 5.6
      h: 4.8
```

## 주의사항

- LLM은 `slideIndex` 사용을 피한다.
- `forceSingleSlide`는 overflow 위험이 있으므로 명시적 요청이 있을 때만 사용한다.
- `minFontSize`는 config의 최소값보다 낮추지 않는다.
- 좌표 수정 전에는 먼저 preset 변경을 시도한다.
