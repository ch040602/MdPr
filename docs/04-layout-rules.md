# 04. 레이아웃 선택 규칙

## 기본 규칙

```text
SlideIntent + itemCount + blockType + density → LayoutPreset
```

## Intent 감지

| 조건 | intent |
|---|---|
| 기존/개선, Before/After, As-Is/To-Be, 장점/단점 | comparison |
| 날짜, 단계, phase, step 반복 | timeline |
| 큰 표 포함 | table |
| 이미지가 본문보다 중요 | image |
| 코드 블록 포함 | code |
| 인용문 중심 | quote |
| `A => B => C` 또는 `A -> B -> C` pipeline syntax | diagram |
| 여러 예시/방법/기능 | grid 또는 list |
| 일반 본문 | standard |

## 개수 기반 레이아웃

| 항목 수 | 기본 preset | 대안 |
|---:|---|---|
| 1 | single-card | title-body |
| 2 | comparison | two-cards |
| 3 | vertical-list | three-cards |
| 4 | grid 2x2 | quadrant |
| 5 | pentagon radial | vertical-list |
| 6 | grid 3x2 | grid 2x3 |
| 7 이상 | vertical-list | autosplit |

## 비교 구조 감지

비교 구조로 판단할 조건:

```text
- 제목에 기존/개선, Before/After, As-Is/To-Be, 장점/단점 포함
- h3가 정확히 2개이고 서로 대비됨
- bullet group이 2개이며 group title이 대비됨
- 표가 비교축 column을 가짐
```

## Preset 목록

```text
cover
toc
section-divider
title-body
key-message
comparison
vertical-list
grid
pentagon
timeline
table-focus
image-focus
image-left
image-right
code-focus
quote
summary
pipeline
```

## Pipeline Diagram Routing

A single Markdown line that uses `=>` or `->` between two or more labels is parsed as a semantic pipeline diagram instead of a paragraph.

```md
Draft => Review => Render => Validate
```

The parser emits a `diagram` block with ordered nodes and directed edges. The layout planner routes it to the `pipeline` preset and creates one `diagram` region. Renderers should preserve the node/edge relationship instead of converting the content to bullets.

## Polygon Edge Decoration

Five-item slides use the `pentagon` preset. PPTX rendering adds editable edge accent lines behind the item boxes using the active design preset's secondary color. These lines are background decoration and must not change item region coordinates or clip text.

## Layout Planner 의사코드

```ts
function chooseLayout(slide, config) {
  if (slide.intent === "comparison") return comparisonHorizontal()
  if (slide.intent === "table") return tableFocus()
  if (slide.intent === "image") return chooseImageLayout(slide)
  if (slide.intent === "code") return codeFocus()
  if (slide.intent === "timeline") return timeline()
  if (slide.intent === "diagram") return pipeline()

  const itemCount = countPrimaryItems(slide)
  if (itemCount > 0) return chooseItemLayout(itemCount)

  return titleBody()
}
```

## Safe area

PPT slide master의 배경 요소와 본문이 충돌하지 않도록 safe area와 avoid zone을 둔다.

```yaml
safeArea:
  content:
    x: 0.8
    y: 1.2
    w: 11.7
    h: 5.3
  avoid:
    - id: footer
      x: 0
      y: 6.7
      w: 13.33
      h: 0.8
```
