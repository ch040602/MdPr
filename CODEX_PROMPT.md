# Codex 구현 프롬프트

이 저장소는 `mdpresent`라는 CLI 기반 Markdown 프레젠테이션 구조화 도구의 스펙/스캐폴드입니다.

## 목표

Markdown 파일을 규칙 기반으로 분해하여 `Presentation IR`을 만들고, `Layout IR`로 변환한 뒤 PPTX/PDF/HTML로 렌더링하는 도구를 구현하세요.

## 반드시 지킬 것

1. `schemas/*.json`의 구조를 기준으로 타입과 출력물을 맞추세요.
2. split은 heading + density 기반으로 구현하세요.
3. layout은 intent + item count 기반으로 선택하세요.
4. override는 operation manifest를 우선 지원하세요.
5. slide targeting은 `slideId`를 최우선으로 처리하세요.
6. renderer는 split/layout 결정을 다시 하지 마세요.
7. PPTX renderer는 editable object 중심으로 구현하세요.

## 구현 순서

1. `packages/core`의 parser/split/intent를 완성하세요.
2. `packages/layout`의 preset/region 배치를 완성하세요.
3. `packages/override`에서 manifest loading, target resolve, operation apply를 완성하세요.
4. `packages/cli`에 config/override loading을 추가하세요.
5. HTML renderer를 먼저 완성하세요.
6. PDF renderer를 HTML 기반으로 구현하세요.
7. PPTX renderer를 editable object 중심으로 구현하세요.

## 첫 번째 완료 기준

```bash
pnpm install
pnpm cli inspect examples/basic/deck.md --json
pnpm cli plan examples/basic/deck.md --json
pnpm cli build examples/basic/deck.md --to html --out dist
```

위 명령이 동작하도록 만드세요.

