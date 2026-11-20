# 기여하기

> **English:** Issues and pull requests are welcome in Korean or English.
> This is the WebGL 3D viewer core shared by the OpenCAD STEP, SKP and NC apps. Changes to the scene contract affect all three.
> Run `npm ci`, `npm run typecheck` and `npm test` before opening a pull request. Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

OpenCAD STEP·SKP·NC 앱이 함께 쓰는 3D 뷰어 코어입니다. 버그 신고, 성능 제보, 기능 제안을 반깁니다. 한국어나 영어로 쓰시면 됩니다.
동작을 크게 바꾸거나 장면 계약을 바꾸는 일이면 먼저 이슈로 의논해 주십시오. 참여하는 모든 분은 [행동 강령](CODE_OF_CONDUCT.md)을 따릅니다.
보안 문제는 이슈 대신 [SECURITY.md](SECURITY.md)의 비공개 신고로 알려 주십시오.

## 개발 환경

CI와 같은 Node 22를 씁니다. 개발용 페이지의 주소 인자와 단추는 [README](README.md)의 「개발」에 있습니다.

```bash
npm ci
npm run dev         # dev/viewer3d.html
npm run typecheck
npm test
npm run pixels -- --base origin/main   # 화소 비교: 두 판의 같은 장면을 헤드리스 Chrome으로 찍어 견줌(CI의 pixels 작업과 같음)
```

## 바꿀 때 지켜 주실 것

- **시험**: 고친 동작과 새 동작에는 `tests/` 아래에 시험을 더합니다. 그리기 결과가 바뀌면 화소 비교도 확인합니다.
- **장면 계약**: 앱이 넘기는 장면 자료와 뷰어 API(README 「장면 계약」)를 바꾸면 README를 함께 고치고, STEP·SKP·NC 앱에 무엇이 달라지는지 PR에 적습니다.
- **성능**: 큰 장면의 프레임 비용이나 메모리가 달라질 수 있는 변경은 `npm run bench:many`·`npm run bench:edit` 결과를 전후로 적습니다.
- **판**: 판 번호와 태그는 관리자가 올립니다. PR에서 `package.json`의 `version`을 바꾸지 않아도 됩니다.

## PR

- 제목은 이 저장소의 커밋처럼 `[<gitmoji> <동작>] 요약` 꼴로 씁니다(예: `[🐛 fix] 단면을 끈 뒤 선 색이 남던 것`).
- 본문에는 바꾼 것, 확인한 것(돌린 명령과 결과), 남은 위험을 적습니다.

## 라이선스

보내 주신 기여는 이 저장소와 같은 [MIT 라이선스](LICENSE)로 배포됩니다.
