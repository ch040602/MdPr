# 테스트 설계

초기 테스트는 snapshot 중심으로 구성한다.

## 권장 테스트

```text
core/parser
  - heading parse
  - bullet parse
  - code parse

core/split
  - h2 candidate 생성
  - h3 autosplit
  - density threshold

core/intent
  - comparison keyword
  - 4 items → grid
  - 5 items → pentagon candidate

layout
  - comparison regions
  - 2x2 grid regions
  - pentagon regions

override
  - slideId target resolve
  - setLayout operation
  - setTypography operation
  - target not found diagnostic
```

