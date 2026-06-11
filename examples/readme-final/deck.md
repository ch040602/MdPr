# mdpresent

Markdown 문서를 발표 구조로 바꾸는 CLI 엔진.

원본 문서는 유지하고, 발표용 구조는 IR과 renderer가 계산한다.

---

## 왜 필요한가

- Markdown은 작성하기 쉽지만 발표 레이아웃 정보가 부족하다.
- 일반 변환기는 긴 문단과 표를 그대로 밀어 넣어 overflow를 만든다.
- 발표자료는 heading, 문장, 목록, 표, 이미지의 구조를 이해해야 한다.
- `mdpresent`는 변환기가 아니라 구조화 엔진을 목표로 한다.

---

## 핵심 파이프라인

```text
Markdown
→ Parser
→ Outline Tree
→ Split Planner
→ Presentation IR
→ Layout IR
→ Renderer
```

각 단계는 사람이 수정할 수 있는 중간 산출물을 남긴다.

---

## 분할기가 보는 구조

- `#`, `##`, `###` heading은 slide 후보와 subsection을 만든다.
- `---`는 명시적인 slide separator로 동작한다.
- 긴 paragraph는 Markdown line과 sentence 단위로 나뉜다.
- list, quote, table, code, image는 각각 다른 block type으로 보존된다.

---

## 레이아웃 선택 규칙

- comparison intent는 좌우 비교 layout을 사용한다.
- 4개 item은 2x2 grid를 우선한다.
- 5개 item은 pentagon 또는 radial layout 후보가 된다.
- 긴 narrative는 continuation slide로 나뉜다.
- overflow는 warn, fail, shrink, split 정책으로 검증된다.

---

## PPTX 출력 원칙

- 텍스트는 편집 가능한 PowerPoint text box로 만든다.
- bullet과 paragraph 줄바꿈은 원본 Markdown 구조를 반영한다.
- table은 PowerPoint table object로 만든다.
- template PPTX의 이미지 장식은 배경층으로 재사용할 수 있다.
- 여러 design preset으로 톤을 바꿀 수 있다.

---

## Codex 작업 흐름

- 먼저 schema와 IR 계약을 고정한다.
- 테스트로 parser, splitter, layout, renderer 동작을 고정한다.
- 실패한 overflow warning은 source split 또는 layout rule로 되돌려 수정한다.
- 완성본은 `validate → build → package QA` 루프로 확인한다.

---

## 현재 완성 상태

- Markdown 문장 단위 분할이 동작한다.
- `---` 기반 명시적 slide 분리가 동작한다.
- config 기반 template path가 제품 기능으로 연결됐다.
- PPTX design preset과 template image import가 동작한다.
- 남은 고도화는 vector master shape import와 더 정교한 typography fitting이다.
