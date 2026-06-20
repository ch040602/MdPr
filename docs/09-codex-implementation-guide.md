# 09. Codex 구현 가이드

## 먼저 읽을 파일

```text
README.md
docs/02-requirements.md
docs/03-page-splitting.md
docs/04-layout-rules.md
docs/05-overrides-for-llm.md
schemas/*.json
```

## 구현 원칙

```text
1. schema를 먼저 지킨다.
2. Presentation IR과 Layout IR 타입을 안정적으로 유지한다.
3. renderer는 split/layout 판단을 다시 하지 않는다.
4. override는 operation 기반으로 정규화한다.
5. slideIndex보다 slideId를 우선한다.
6. preset enum을 임의로 늘리지 않는다. 필요하면 schema와 docs를 함께 수정한다.
```

## 첫 번째 구현 목표

```text
mdpresent inspect examples/basic/deck.md --json
```

이 명령이 다음 정보를 출력해야 한다.

```text
- slide index
- slide id
- role
- title
- headingPath
- intent
- primary item count
```

## 두 번째 구현 목표

```text
mdpresent plan examples/basic/deck.md --json
```

이 명령이 다음 정보를 출력해야 한다.

```text
- slide size
- theme token
- layout preset
- regions
- typography
- overflow policy
```

## 세 번째 구현 목표

```text
mdpresent validate examples/basic/deck.md --override examples/basic/deck.override.yaml
```

이 명령이 override target과 operation의 유효성을 검사해야 한다.

## 네 번째 구현 목표

```text
mdpresent build examples/basic/deck.md --to pptx --out dist
```

Editable PPTX 출력을 주 렌더러로 완성한다. HTML은 브라우저 미리보기와 Pages gallery shell로 유지한다.

## 테스트 권장사항

```text
- heading split snapshot
- density calculation snapshot
- intent detection cases
- layout selection cases
- override target resolve cases
- schema validation cases
```

## 구현하지 않아도 되는 것

초기 버전에서 다음은 TODO로 남겨도 된다.

```text
- 완벽한 PPTX template parser
- 완벽한 text measurement
- 애니메이션
- video/audio
- Marp CSS 1:1 compatibility
```
