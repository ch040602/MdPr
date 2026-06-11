# 02. 요구사항

## 기능 요구사항

### 입력

- Markdown 파일을 입력으로 받는다.
- 일반 Markdown heading 구조를 우선 사용한다.
- 전역 설정은 `mdpresent.config.yaml` 또는 CLI arg로 받는다.
- 슬라이드 전용 문법을 Markdown 본문에 강제하지 않는다.

### 분할

- 첫 번째 `#`는 기본적으로 cover 후보로 사용한다.
- `##`는 기본 slide candidate로 사용한다.
- `###`는 subsection 및 autosplit 기준으로 사용한다.
- 내용 밀도(density)가 높으면 h3, block group, list chunk 기준으로 자동 분할한다.

### 레이아웃

- 비교 구조는 좌우 배치를 기본으로 한다.
- 예시/방법/기능이 3개면 세로 카드 또는 단계형으로 배치한다.
- 4개면 2x2 grid를 기본으로 한다.
- 5개면 pentagon/radial 또는 vertical-list를 선택한다.
- 6개면 3x2 grid를 기본으로 한다.
- 7개 이상이면 vertical-list 또는 자동 분할을 기본으로 한다.
- 표, 이미지, 코드, 인용문, 타임라인은 전용 preset을 사용한다.

### 폰트와 overflow

- CLI/config로 지정된 기본 폰트 크기를 우선한다.
- 최소 폰트 크기 이하로 줄이지 않는다.
- overflow 발생 시 reflow → shrink → split → warn/fail 순서로 처리한다.
- 강제 single slide override가 있더라도 overflow diagnostic을 남긴다.

### PPTX 출력

- PPTX는 editable object 중심으로 생성한다.
- 텍스트는 text box, 표는 table, 이미지는 image object로 생성한다.
- PPT 템플릿이 있으면 slide size, theme color, fonts, master background, logo, decorative shape를 가져온다.
- 본문 배치와 placeholder 위치는 CLI가 새로 계산한다.
- Slide master로만 편집할 객체는 background layer에 둔다.

### PDF/HTML 출력

- PPT 템플릿이 아닌 CLI/config의 background color, font, theme token을 우선한다.
- HTML은 slide 단위 section 구조를 유지한다.
- PDF는 HTML 렌더링 결과를 인쇄용으로 내보내는 방식으로 시작한다.

### Override

- 특정 슬라이드의 layout, typography, background, split, overflow, slots를 override할 수 있어야 한다.
- override는 YAML/JSON을 모두 지원한다.
- `slideId` 기반 지정이 우선이다.
- `inspect --json` 결과를 보고 Codex/LLM이 override를 생성할 수 있어야 한다.
- JSON Schema를 제공해야 한다.

## 비기능 요구사항

- 구조는 모듈형이어야 한다.
- CLI와 Core SDK는 분리되어야 한다.
- renderer는 독립적으로 추가 가능해야 한다.
- snapshot test가 가능해야 한다.
- 실패 시 readable diagnostics를 출력해야 한다.
- LLM이 수정하기 쉬운 명시적 enum과 schema를 유지해야 한다.

## MVP 포함

```text
- heading 기반 split
- density 기반 autosplit
- intent detection
- rule-based layout selection
- override manifest
- inspect / plan / validate / build
- HTML output
- PPTX output skeleton
```

## MVP 제외 가능

```text
- 완전한 Marp CSS 호환
- 완벽한 PPTX template placeholder 분석
- 애니메이션
- 동영상
- speaker notes
- 완전한 text measurement
```

