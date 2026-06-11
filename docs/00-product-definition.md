# 00. 제품 정의

## 한 줄 정의

`mdpresent`는 Markdown 문서를 규칙 기반으로 분해해 공통 발표 구조로 만들고, 이를 PPTX / PDF / HTML로 렌더링하는 CLI 기반 프레젠테이션 구조화 프로그램이다.

## 하지 않는 것

```text
Markdown 파일을 단순히 PPT로 변환하는 도구가 아니다.
Marp 문법을 그대로 재구현하는 도구가 아니다.
CSS 렌더링 결과를 슬라이드 이미지로 박는 도구가 아니다.
```

## 하는 것

```text
Markdown heading과 내용을 분석한다.
heading + density로 슬라이드를 분할한다.
비교 / 예시 / 방법 / 표 / 이미지 / 코드 등의 구조를 감지한다.
규칙 기반으로 레이아웃을 선택한다.
기본 폰트 크기와 최소 폰트 크기를 보존한다.
PPTX에서는 템플릿 배경과 slide master 요소를 배경으로 활용한다.
PDF/HTML에서는 CLI/config의 배경색과 폰트를 따른다.
특정 슬라이드는 override manifest로 레이아웃을 강제한다.
```

## 핵심 산출물

```text
Presentation IR: 어떤 슬라이드들이 필요한가
Layout IR: 각 슬라이드의 요소가 어디에 배치되는가
Renderer Output: PPTX / PDF / HTML
```

## 자동화와 수동 제어의 비율

```text
자동 규칙으로 90% 생성
Override manifest로 10% 예외 제어
```

