# 보안 문제 신고

> **English:** Please report vulnerabilities privately through
> [GitHub's private vulnerability reporting](https://github.com/GyuTae-Kim/opencad-viewer3d/security/advisories/new).
> If that form isn't available, open an issue asking for a contact, without technical details. Only the latest `main` is supported.

## 신고하는 곳

[GitHub 비공개 취약점 신고](https://github.com/GyuTae-Kim/opencad-viewer3d/security/advisories/new)로 알려 주십시오.
신고 내용은 관리자에게만 보입니다.
그 양식이 열리지 않으면 공개 이슈에 재현 방법이나 공격 방법은 쓰지 말고, 연락 방법만 요청해 주십시오.

## 지원하는 판

최신 `main`만 고칩니다. OpenCAD STEP·SKP·NC 앱은 고친 커밋으로 의존을 올려 배포합니다.

## 특히 살펴 주실 곳

- **장면 자료**: 앱이 넘긴 그물, 선분, 무늬로 뷰어가 멈추거나(끝나지 않는 반복) 메모리나 GPU 메모리를 끝없이 쓰는 길
- **글 덧그림**: 측정 글, 이름표, 알림에 들어간 문자열이 HTML이나 스크립트로 해석되는 길
- **포인터와 키보드 입력**: 고르기, 재기, 걷기 중의 입력으로 페이지 밖에 영향을 주는 길

STEP·SKP·NC 파일을 읽는 코드는 각 앱 저장소에 있습니다. 파일 읽기 문제는 그 앱에 신고해 주십시오.
[opencad-step](https://github.com/GyuTae-Kim/opencad-step) · [opencad-skp](https://github.com/GyuTae-Kim/opencad-skp) · [opencad-nc](https://github.com/GyuTae-Kim/opencad-nc)
