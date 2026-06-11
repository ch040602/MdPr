# 03. 페이지 분할 규칙

## 기본 heading 규칙

```text
#   cover 또는 section
##  slide candidate
### subsection 또는 autosplit 기준
#### 본문 내부 heading
```

## 기본 절차

```text
1. Markdown AST 생성
2. heading tree 생성
3. h2 기준 slide candidate 생성
4. candidate별 density 계산
5. maxDensity 이하이면 한 슬라이드 유지
6. `---` horizontal rule이 있으면 explicit slide separator로 우선 분할
7. 초과하면 h3 기준 분할
8. h3가 없으면 block group 기준 분할
9. paragraph가 길면 Markdown line과 sentence chunk 기준으로 분할
10. list가 길면 list chunk 기준 분할
11. 표/이미지/코드는 독립 slide 후보로 분리
12. cover와 toc 삽입
```

## Density 점수

| 요소 | 기본 점수 |
|---|---:|
| 짧은 문단 | 1 |
| 긴 문단 | 2 |
| bullet 1개 | 1 |
| nested bullet | 1.5 |
| heading | 1 |
| 작은 표 | 4 |
| 큰 표 | 8 |
| 이미지 | 5 |
| 짧은 코드 | 5 |
| 긴 코드 | 9 |
| 인용문 | 3 |

## Density 기준

```text
0 ~ 8    한 슬라이드
9 ~ 14   레이아웃 최적화 또는 autosplit 검토
15 이상  분할 권장
```

## Sentence-Aware Paragraph Splitting

Parser output preserves both author-written Markdown lines and sentence units:

```text
BlockIR.lines      original paragraph lines from the Markdown file
BlockIR.sentences  sentence-sized units split on terminal punctuation
```

When a slide candidate exceeds `split.autosplit.maxDensity` and does not have h3 children, the split planner expands long paragraph blocks into sentence units and creates continuation slides such as:

```text
Long Narrative (1/3)
Long Narrative (2/3)
Long Narrative (3/3)
```

This keeps long Korean or English narrative paragraphs from reaching the renderer as one unbroken text box.

## Explicit Slide Separators

`---` on its own line is treated as an explicit slide separator, following common Markdown slide tools such as Slidev, reveal.js/reveal-md, and Pandoc.

```md
## Walkthrough

First part.

---

Second part without another heading.
```

The planner creates continuation slides:

```text
Walkthrough (1/2)
Walkthrough (2/2)
```

If the separator appears before another slide-level heading, it starts the next heading cleanly and is not rendered as content.

## Markdown Structure Blocks

The parser now preserves these block types as presentation structure:

```text
paragraph  keeps text, original Markdown lines, sentence units, and inline emphasis runs
bulletList keeps flat text plus structured listItems with ordered/nested metadata
quote      `>` blockquote text
table      pipe table rows, excluding the delimiter row
code       fenced code with language
image      Markdown image references
slideBreak explicit `---` separator
```

## Structured Lists And Inline Emphasis

List parsing keeps both renderer-friendly text and semantic structure:

```text
BlockIR.items       plain text list item fallback
BlockIR.listItems   ordered/unordered flag, numeric marker, nesting level, inline runs
BlockIR.listKind    ordered, unordered, or mixed
```

Decorative list markers such as an empty `-` line or standalone `·` are removed during parsing so renderers do not emit empty bullets or empty text boxes.

Inline Markdown emphasis is preserved in `InlineRunIR`:

```md
1. Prepare **source**
2. Render *deck*
   - Validate output
```

This produces ordered list metadata for the first two items, nested unordered metadata for the third item, and bold/italic runs that PPTX and HTML renderers can map to native target-format styling.

## SplitStrategy

```ts
type SplitStrategy =
  | "none"
  | "by-heading"
  | "by-block-group"
  | "by-list-chunk"
  | "by-table"
  | "by-media"
  | "continuation"
```

## 분할 override 예시

```yaml
operations:
  - op: setSplit
    target:
      slideId: problem-definition-a12bc
    value:
      forceSingleSlide: true
      maxDensity: 14
```

## Stable ID 규칙

슬라이드 번호는 자동 분할 결과에 따라 바뀔 수 있으므로, override는 `slideIndex`보다 `slideId`를 사용한다.

권장 생성 방식:

```text
slugified-title + short-hash(headingPath + duplicate occurrence)
```

Stable ID 보존 범위:

```text
보존:
- 기존 heading 위나 아래에 본문 paragraph/list/code/image를 삽입하는 경우
- 기존 heading의 source line이 이동하지만 headingPath가 유지되는 경우

보존하지 않음:
- heading 제목 변경
- heading 계층 변경
- 같은 headingPath를 가진 중복 heading을 기존 heading 앞에 추가
- autosplit 결과 자체가 바뀌어 slide candidate가 달라지는 경우
```

예:

```text
main-features-a13f92
comparison-as-is-to-be-991af
```
