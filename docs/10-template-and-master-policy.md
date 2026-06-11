# 10. PPT 템플릿과 Slide Master 정책

## 기본 원칙

```text
Template controls brand.
Layout engine controls placement.
```

즉, 템플릿은 브랜드와 배경의 출처이고, 본문 배치는 CLI가 다시 계산한다.

## PPT 템플릿에서 가져올 것

```text
- slide size
- theme color
- font
- master background
- layout background
- logo
- footer
- decorative shape
```

## PPT 템플릿에서 그대로 쓰지 않을 것

```text
- 본문 placeholder 위치
- title/content box 위치
- 임의의 slide layout 좌표
- 템플릿 내부 샘플 텍스트
```

## Slide Master 고정 정책

Slide Master로만 편집할 수 있게 둘 요소:

```text
- 회사 로고
- 고정 배경 패턴
- 브랜드 바
- 공통 footer
- 장식 도형
```

본문 슬라이드에는 다음만 배치한다.

```text
- 제목
- 본문
- 표
- 이미지
- 차트
- 코드
```

## Safe Area

Master 배경 요소 위에 본문이 올라가지 않도록 avoid zone을 정의한다.

```yaml
safeArea:
  enabled: true
  avoid:
    - id: top-brand-bar
      x: 0
      y: 0
      w: 13.33
      h: 0.6
    - id: footer
      x: 0
      y: 6.85
      w: 13.33
      h: 0.65
```

## 주의

Slide Master는 보안 잠금이 아니다. 사용자가 master 편집 화면에 들어가면 수정할 수 있다. 목적은 일반 슬라이드 편집 중 배경 요소를 실수로 움직이지 않게 하는 것이다.

