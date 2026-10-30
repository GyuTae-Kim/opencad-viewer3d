# OpenCAD 3D 뷰어 코어

브라우저에서 WebGL2로 3D 장면을 그리고, 돌려 보고, 고르고, 재는 뷰어입니다.
형식 해석기가 만든 장면(`Scene3d`: 삼각형 그물·선분·점)을 받아 그리며, 다른 3D 엔진이나 그래픽 라이브러리를 쓰지 않고 새로 작성했습니다.

OpenCAD의 3D 형식 저장소들이 이 뷰어를 함께 씁니다.

- [opencad-nc](https://github.com/GyuTae-Kim/opencad-nc): NC 프로그램(G-code·Heidenhain·woodWOP MPR) → 공구 경로 장면
- [opencad-step](https://github.com/GyuTae-Kim/opencad-step): STEP(AP203·AP214·AP242) → B-rep 삼각화 장면
- [opencad-skp](https://github.com/GyuTae-Kim/opencad-skp): SketchUp 2021~2026(.skp) → 모형 장면

## 할 수 있는 것

- 왼쪽 끌기 궤도 회전(커서 아래 점 둘레), 가운데·오른쪽 끌기 이동, 휠 확대, 터치 회전·이동·핀치(손가락 떨림을 견디는 터치 문턱)
- 뷰 큐브와 표준 뷰(위·앞·오른쪽·등각 등, 키 1~7), 전체 보기(F), 원근·평행
- 음영·음영+윤곽·와이어프레임·X-ray·숨은 선·단색·무늬 없음, 화면 공간 외곽선, 굵은 선·점선, 바닥 격자, 좌표축, 밝은·어두운 테마(CSS 변수 `--v3d-*`로 바꿀 수 있음), 키보드 초점 테두리
- 뒤 모서리 점선(숨은 선, 켜면 음영 계열도), 바탕과 대비되는 외곽선·윤곽선 색(켤 때만), 그물마다 다른 윤곽선·외곽선 색
- 해 조명·그림자(PCF)·선형 안개·하늘과 땅 바탕(모두 켤 때만), 1인칭 걷기·둘러보기(켜면 바닥 따라가기·부딪힘), 시야각·굴림·렌즈 이동(2점 투시)
- BVH 고르기(그물·윤곽선·선분·점), 두 점 측정(꼭짓점·끝점, 켜면 가운데 점·앱이 준 원 중심, 두 선분 교차점·수직 발·축 방향·지나간 모서리와 나란한 방향까지 붙잡기와 Shift·앱 단추로 방향 잠그기(모서리 끝에서 그 모서리를 따라 가리킨 점, 앱이 정한 방향도), 코어가 고른 수직 발·모서리 위 점·가운데 점·교차점을 앱이 정확한 곡선 위로 다듬기, 꺾은선으로는 후보가 없는 곡선 위 발·두 곡선의 교차점도 앱이 다듬어 붙잡기, 붙잡은 점이 놓인 선분 식별자, 켜면 머문 점에서 끌어온 X·Y·Z 축과 그 축끼리·모서리와 만나는 점, 끌어온 점에서 지나간 모서리와 나란한 선·수직인 선(곡선을 나눈 현은 앱이 기준에서 거른다 — 첫 점의 나란함도)과 켜면 그 선이 첫 점 축·다른 끌어온 축·모서리·면과 만나는 점, 첫 점 축이 모서리와 만나는 점, 축이 면을 뚫는 점, 축과 곡선 모서리가 만나는 점을 앱이 곡선 위로 다듬기, 잠근 동안 잠근 선이 모서리와 만나는 점·면을 뚫는 점·끌어온 축과 만나는 점, 축이 곡면을 뚫는 점과 붙잡지 않은 곡면 위 점을 앱이 곡면 위로 다듬기, 축·잠근 선이 꺾은선과 만나지 않고 그 활꼴만 지나도(두 번 지나면 두 교차 모두) 앱이 준 곡선 위 교차에 붙기, 축·잠근 선이 곡면을 나눈 삼각형을 비켜 가며 곡면만 뚫어도(한 삼각형 위를 두 번 지나면 두 교차 모두) 앱이 준 곡면 위 교차에 붙기, 잠금·끌어온 점을 둔 채 다듬기 기억만 비우기 — 앱 점 수십만 개도 색인으로, 재생에 맞춰 차례 한도로 거르기), 그물 면만 고르기(면 위 선분·점 아래의 면 — 고르기와 누르기 알림), 반투명 그물 너머 불투명 면 고르기(고르기·누르기 알림·측정 — 그물마다 고르기에서 불투명으로 볼 수 있고, 그물의 일부 면(포켓 뚜껑 등)만 지나가게 할 수 있고, 측정 중 잠금을 둔 채 켜고 끌 수 있고, 누르기 알림 하나에서 가장 앞 고르기와 함께 받을 수 있다), 앱 측정 덧그림(거리·각·반지름·점 — 글상자는 앱이 알려 준 띠·뷰 큐브 자리와 서로를 비켜 그린다, 뷰어 글상자와 글상자 자리 순수 계산 모두 앱이 정한 기본 자리부터, 그 자리가 막히면 예전 차례로 고르기도)·화면 위치(`project`)·뷰 큐브 자리, 두 묶음 최근접점, 묶음별 켜고 끄기·불투명도·색·행렬(분해도), 선분 그리기 범위(재생용), 그림 저장(배율·투명 바탕), 창 확대
- 단면 보기: 평면 하나 또는 여럿(상자 단면, 평면마다 자를 묶음), 잘린 면 채우기(닫힌 그물·capGroup)·단면 테두리, 고르기·측정도 잘린 쪽을 무시
- 마주 보는 그물(billboard), 뒷면 색·무늬
- 무늬(텍스처): 그물마다 무늬 좌표(UV, 원근 무늬는 q까지)와 그림 하나. 되풀이(REPEAT)·밉맵·비등방 거르기, 한 장 크기·전체 GPU 예산 한도
- 큰 좌표(예: 1e6 mm대): 묶음 원점(`origin`)을 double 행렬로 합쳐 그려 떨리지 않음
- 실제 GPU에서 선분 300만 개·삼각형 100만 개를 끌어도 끊기지 않습니다. 나눠 올리기를 쓰면 아주 큰 배열 하나도 여러 프레임에 조각으로 올립니다.
- 장면 전체를 다시 주지 않고 그물 하나만 넣기·바꾸기·빼기(`setMesh`·`removeMesh` — 그 그물의 GPU 버퍼·BVH만 다시, 바뀐 정점 구간만 올리기도)
- 큰 모형 메모리: 놓기 선택을 주면 올린 뒤 법선·무늬 좌표·무늬 원본을 코어가 놓고, 그래픽 문맥을 되찾으면 위치·색으로 먼저 그린 뒤 앱에서 다시 받기. 문맥 잃음·되찾음 알림과 되찾은 뒤 다시 올리기가 다 끝났다는 알림.
  법선·무늬 좌표를 작은 정수 배열(Int8·Int16 정규화)로 받아 그대로 GPU에 올리기. GPU 버퍼 바이트를 성분별(위치·법선·무늬 좌표·색인·선분 등)로 읽기(`stats.buffers`)

## 장면 계약

`src/types.ts`의 `Scene3d`가 해석기와 뷰어 사이의 약속입니다. 오른손 좌표계, Z 위입니다.
여러 해석기가 함께 쓰므로 바꿀 때는 기존 필드의 뜻을 바꾸지 말고 선택 필드만 더합니다.

0.4.0에서 더한 선택 필드:

- `Mesh3d.origin`·`LineSet3d.origin`·`PointSet3d.origin`(`[x, y, z]`): 묶음 원점. 있으면 `positions`(그물은 `edges`도)는 이 점 기준 좌표이고
  세계 = `origin + position`(그물에 `matrix`가 있으면 `matrix · (origin + position)`). 좌표가 큰 장면(측량·대형 설비 등)은 해석기가
  묶음 가운데쯤을 원점으로 잡고 positions에서 빼 두면 float32로도 떨리지 않습니다. 없으면 예전과 똑같습니다.
  범위·`fitItems`·고르기 결과(`Pick3d.point`)·측정·`setDrawLimitBySegmentId`가 돌려주는 위치는 모두 원점을 더한 세계 좌표입니다.
- `Mesh3d.closed`: 닫힌 입체(물 샐 틈 없는 껍질)면 `true`. 단면에서 잘린 면을 채웁니다. 열린 면·얇은 판에는 두지 않습니다.
- `Pick3d.section`: 잘린 면(채운 면)을 골랐으면 `true`(`point`는 평면 위, `normal`은 평면 법선, `index`·`raw`는 −1).

0.5.0에서 더한 선택 필드(무늬):

- `Scene3d.textures`(`Texture3d[]`): 무늬 그림. `id`와 그림 파일 바이트 `data`(PNG·JPEG·GIF·WebP·BMP, `mime`은 없으면 첫 바이트로 가림)
  또는 이미 푼 `bitmap`(ImageBitmap, 보통 방향 — 워커에서 만들어 넘길 때). `width`·`height`를 알면 큰 그림을 풀면서 바로 줄인다.
  `alpha: true`면 그림의 투명 화소를 쓰고 그 무늬를 칠한 그물을 반투명 차례에 그린다(없으면 그림 알파는 무시하고 불투명).
- `Mesh3d.texture`: 쓸 무늬의 `id`. `Mesh3d.uvs`: 정점마다 `(u, v)` 2값, 또는 원근 무늬(사진 맞춤처럼 면 위에서 q가 바뀌는 투영)면
  `(u·q, v·q, q)` 3값 — 길이로 가린다(정점 수 × 3이면 3값). u는 그림 오른쪽, v는 위쪽으로 늘고(0 = 그림 아래 끝) 0~1 밖은 되풀이한다.
- 무늬가 있으면 `color`(`colors`)의 rgb 대신 그림을 칠하고 불투명도는 `color` 알파를 따른다. 조명·강조·X-ray·단면 자르기·고르기는 그대로다.
  그림을 풀기 전(또는 풀지 못하면) `color`로 칠하므로 해석기는 `color`에 그림 평균색을 두면 된다. 잘린 면 채우기·와이어프레임은 `color`.
- 같은 `Texture3d` 객체를 다시 넘긴 `setScene`은 올린 무늬를 그대로 쓴다(장면을 바꿔 끼워도 다시 풀지 않는다).
- `Viewer3dOptions.textureLimit`(한 장 긴 변, 기본 2048 화소 — GPU 한도가 작으면 그것)·`textureBudget`(전체, 기본 256 MB 어림):
  넘으면 풀면서 줄이고, 전체가 넘으면 모든 무늬를 같은 비로 줄인다(64 화소 아래로는 줄이지 않음). 휴대 기기는 앱이 낮춰 준다.
- `stats.textures`: 쓰는 무늬 수·올린 수·실패 수·GPU 크기 어림. 무늬는 한 번에 네 장까지 풀고, 올릴 때마다 다시 그린다.
- `imageInfo(bytes)`: 그림 꼴·크기·알파 가능성(머리만 읽는 순수 함수 — 해석기도 쓸 수 있다).

0.26.0에서 넓힌 필드와 더한 선택 필드(작은 배열 — 아래 0.26.0 절):

- `Mesh3d.normals`(`NormalArray`): `Float32Array`에 더해 정규화 정수 `Int8Array`·`Int16Array`. 정점마다 3값, 또는 길이가 정점 수 × 4와 같으면 4값(넷째 값은 읽지 않는다)
- `Mesh3d.uvs`·`backUvs`(`UvArray`): `Float32Array`에 더해 정규화 정수 `Int16Array`(−1~1)·`Uint16Array`(0~1). 정점마다 2값 또는 원근 무늬 3값은 그대로
- `Mesh3d.uvTransform`·`backUvTransform`(`[su, sv, ou, ov]`): 무늬 좌표 값 (s, t)를 u = su·s + ou, v = sv·t + ov로 편다(없으면 그대로)

```ts
import { Viewer3d, type Scene3d } from 'opencad-viewer3d';

const viewer = new Viewer3d(document.getElementById('view')!, { theme: 'dark' });
viewer.setScene(scene); // Scene3d
viewer.fit();
```

앱이 자주 쓰는 것:

- `handleKey(e)`: 캔버스에 초점이 없을 때 창 키를 넘기면 F·1~7·Esc를 뷰어 규칙대로 처리하고 처리했으면 `true`. 표준 뷰 키 표는 `VIEW_KEYS`(0.10.0부터 작은 모듈 `opencad-viewer3d/camera`에서도)
- `fitItems(ids)`: 고른 항목(그물·선·점 id)만 맞춰 보기
- `highlight(ids)`, `setItemVisible`, `setGroupVisible`, `groups()`: 항목 단위 강조와 보이기
- `highlightSegmentIds(ids)`, `setHighlightSegments(positions)`: 선분 단위 강조(예: NC 한 줄). 보이는 부분은 깊이를 따져 굵게, 가려진 부분은 흐리게(`hidden`) 그린다. `highlightSegmentIds`는 `segmentIds`로 찾고 찾은 선분 수를 돌려준다
- `onPick((pick, e) => …)`: 두 번째 인자 `e`는 누를 때의 `altKey`·`ctrlKey`·`shiftKey`·`metaKey`, `clicks`(1 또는 2 — 바로 앞 누르기와 0.45초·6화소(터치는 24화소) 안이면 2), `button`, `pointerType`. 한 인자 콜백도 그대로 된다.
  한 누르기의 알림은 단 차례대로 부르고, `front` 없이 단 알림들은 같은 사건 객체를 받는다(0.26.0부터 약속). `{ throughTranslucent: true, front: true }`면 `e.front`에 같은 누르기의 가장 앞 고르기(0.26.0)
- `onMeasure`(두 번째 점에서 결과, 지우거나 새 측정을 시작하면 `null`), `measurePointCount`, `measurePoints`(찍은 점의 좌표·붙잡은 종류 — 0.12.0)
- `measureHoverSnap`(커서 아래 붙잡을 점), `measureHoverLock`(Shift·잠금 단추가 지금 잠글 방향 — 0.12.0), `setMeasureInferenceLock(true | 'x' | { direction, edge? } | false)`(앱 단추로 잠그기), `measureLabelRect`(코어 거리 글상자 자리 — 앱 툴팁이 피한다, 0.12.0),
  `setMeasureLabelAvoid({ rects?, pointerRadius? } | rects | null)`(코어 거리 글상자가 앱 십자선·툴팁과 커서 둘레를 비켜 그리기 — 0.13.0),
  `setMeasureLabelSpot('center' | { measure?, annotations? } | null)`(거리 글상자·덧그림 글상자의 기본 자리 — 0.27.0)
- `setItemPickOpaque(id, on)`(0.24.0)·`setItemPickThrough(id, ranges)`(0.27.0): 판 너머 고르기(`throughTranslucent`)가 그 그물에서 멈추기·그 그물의 일부 삼각형은 지나가기
- `gridVisible`, `viewCubeVisible`, `axesVisible`: 격자·뷰 큐브·좌표축 켜짐 상태
- `viewCubeSize` 옵션·`setViewCubeSize(px)`: 뷰 큐브 크기(기본 112, 64~160) — 좁은 화면에서 줄여 쓴다
- `setDrawLimitBySegmentId`, `setMarker`: NC 재생
- `setMesh(mesh, { vertices?, incremental? })`, `removeMesh(id)`: 장면 전체를 다시 주지 않고 그물 하나만 넣기·바꾸기·빼기(0.11.0 — 아래 절)
- `setScene(scene, { release })`, `onContextLost`, `onContextRestore(need)`, `restoreMeshArrays`, `restoreTexture`: 올린 뒤 법선·무늬 좌표·무늬 원본 놓기와 문맥 복구 때 다시 받기(0.25.0 — 아래 절)
- `setHighlightSegments(positions, { origin })`: 강조 선분도 원점 기준 좌표로 줄 수 있다(큰 좌표). `highlightSegmentIds`는 묶음 원점을 알아서 반영한다

터치 조작(0.6.0). 마우스·펜은 0.5.0과 똑같고 `pointerType === 'touch'`만 바뀐다:

- 끌기 시작: 누른 자리에서 `TOUCH_DRAG_START_PX`(10화소) 넘게 움직여야 회전한다(마우스·펜은 `DRAG_START_PX` 4화소). 그 안에서 떼면 누르기(고르기·측정 점).
  회전은 끌기가 시작된 자리부터 움직인 만큼만 돌려 10화소만큼 튀지 않는다
- 두 손가락 이동·핀치 뒤 한 손가락을 먼저 떼면 남은 손가락은 모두 뗄 때까지 무시한다(회전도 누르기도 없음). 새 손가락이 닿으면 두 손가락 몸짓을 다시 시작한다
- 고르기 허용 거리: `touchPickTolerance` 선택(기본 `TOUCH_PICK_TOLERANCE_PX` 14화소, 마우스·펜은 `pickTolerance` 기본 6). 측정 점을 꼭짓점·끝점에 붙잡는 거리도 터치는 이 값(10 아래면 10)
- 측정 중 터치 미리 보기: `pointerType: 'touch'`인 포인터 이동(앱의 정밀 조준이 보내는 합성 이벤트)도 터치 허용 거리로 붙잡을 점을 그려, 이어지는 터치 누르기가 찍는 점과 같다
- 두 번 누르기(`e.clicks === 2`): 터치는 24화소(`TOUCH_DOUBLE_TAP_PX`) 안
- `pick(x, y, pointerType?)`: `'touch'`를 주면 터치 허용 거리로 고른다(주지 않으면 예전처럼 `pickTolerance`)
- 앱의 길게 누르기 판정(예: 정밀 조준 `AIM_SLOP_PX`)은 `TOUCH_DRAG_START_PX`에 맞춘다. 상수와 `dragStartPx(pointerType)`·`pickTolerance(pointerType, mouse, touch)`를 패키지 입구에서 내보낸다

단면 보기(잘린 쪽은 그물·선·점·윤곽선·강조 선분 모두 그리지 않고, 고르기·측정·확대 기준점도 무시한다):

- `setSectionAxis('x' | 'y' | 'z', t, { flip?, world? })`: 축에 수직인 평면. `t`는 장면 범위 안 0~1(0 = 최소, 1 = 최대 좌표), `world: true`면 축 좌표. 기본은 +축 쪽을 잘라 내고 `flip`이면 반대쪽(주지 않으면 같은 축의 앞 값을 지킨다)
- `setSection({ normal, offset } | null)`: 임의 평면 `normal·p = offset`의 법선 쪽을 잘라 낸다. `null`이면 끈다
- `setSectionPosition(t, { world? })`, `flipSection(flip?)`, `setSectionOptions({ caps, outline, plane })`: 위치·방향·표시만 바꾸기
- `section`: 지금 상태(`normal`·`offset`·`axis`·`flip`·`position`·장면 범위 `min`·`max`·범위 안 위치 `t` 등, 꺼져 있으면 `null`) — 슬라이더는 `t`를 그대로 쓴다
- `sectionRange(axis | dir)`: 장면 범위를 그 방향으로 잰 `[min, max]`(단면을 켜기 전 눈금 표시용)
- `sectionHandle()`, `moveSectionByPixels(dx, dy)`: 화면 위 손잡이 위치·법선의 화면 방향을 얻고, 끈 화소만큼 평면을 옮긴 뒤 새 `t`를 받는다
- 선택: `caps`(`'closed'` 기본 — `Mesh3d.closed` 그물만 채움, `'all'`, `'none'`), `outline`(단면 테두리, 기본 켬), `plane`(평면 위치를 옅게 표시, 기본 켬). 색은 테마 `section`(CSS 변수 `--v3d-section`)
- `setScene`은 `keepView`면 단면 평면(세계 위치)을 지키고 아니면 끈다. `clear`도 끈다
- `onSectionChange((state | null) => …)`: 단면이 바뀔 때마다(앱 호출·손잡이 끌기·`setScene`/`clear`로 꺼짐·장면 범위가 바뀜·문맥 복구) 알림. 해제 함수를 돌려준다

묶음 안 구간(그물 = 삼각형 번호, 선분 묶음 = 선분 번호, 점 묶음 = 점 번호. 번호는 `Pick3d.raw`와 같다):

- `setHiddenRanges(id, [{ start, count }, …] | null)`: 그 구간만 숨긴다. `{ prims, edges }`로 주면 그물 윤곽선(`Mesh3d.edges`의 선분 번호)도 숨긴다(주지 않으면 윤곽선은 그대로). 숨긴 구간은 고르기·측정·단면 테두리·전체 보기 범위(`fit`·`fitItems`)에서도 빠진다. `hiddenRanges(id)`, `clearHiddenRanges()`
- `highlightRanges({ id: ranges | { prims, edges }, … } | Map | null)`: 구간 강조(그물은 강조색을 섞고 선·점은 강조색으로 굵게). 앞의 구간 강조를 모두 바꾸고 `null`이면 해제. 묶음 통째 강조 `highlight(ids)`와 따로 두며 함께 써도 된다
- 구간이 많아도(그리기 구간이 24개를 넘으면) 그물은 보이는 삼각형 색인을, 선분·점은 보이는 것만의 복사본을 만들어 한 번에 그린다. 장면을 바꾸면 풀린다

큰 장면 나눠 올리기:

- `setScene(scene, { incremental: true | { budgetMs }, onProgress: (done, total) => … })`: GPU 올리기를 프레임마다 `budgetMs`(기본 8 ms)씩 나눠 하고 올라간 묶음부터 그린다. `onProgress`는 올린 묶음 수·전체 수(끝나면 `done === total`). 범위·고르기·측정은 처음부터 장면 전체로 한다. `toBlob`은 남은 올리기를 마친 뒤 그린다. 주지 않으면 예전처럼 한 번에 올린다

## 0.7.0: 살펴보기·보여주기

모두 켜야 동작한다. 켜지 않으면 그림·고르기·입력은 0.6.0과 화소·값까지 같다(예외 하나: 무늬 그물이 단면에 잘리지 않던 0.5.0부터의 문제를 고쳐, 무늬 그물이 있는 장면의 단면 그림은 달라진다).

### 화면 위치와 측정 덧그림

- `project(p, { occlusion? })` → `{ x, y, depth, behind, onScreen, occluded, visible }` 또는 `null`(투영할 수 없는 점 — 수가 아니거나 눈 평면 위):
  세계 점의 캔버스 위치(CSS 화소, 왼쪽 위 원점)와 눈 깊이. `behind`는 원근에서 눈 뒤(이때 x·y는 뒤집힌 자리 — 화살표 방향용),
  `onScreen`은 눈 앞이고 캔버스 안, `visible`은 거기에 더해 단면에 잘리지 않고(`occlusion`을 주면) 불투명 면에 가리지 않음. 가림은 음영 모드에서만 따진다
- `Viewer3dOptions.formatMeasure`·`setMeasureFormat(fn | null)`: 측정 글 꼴. `fn({ a, b, distance, dx, dy, dz, units })` → 글 줄들.
  내장 측정과 글(`label`)을 주지 않은 거리 덧그림이 쓴다(앱의 단위·자릿수·언어). 없으면 예전 글 그대로
- `setAnnotations([{ kind, a, b?, c?, label?, color?, normal? }, …] | null, { hidden?, width? })`: 앱이 잰 값을 내장 측정과 같은 모양(선·점·글자 상자)으로 그린다
  - `distance`: a–b, `angle`: 꼭짓점 a와 팔 끝 b·c(호를 그린다), `radius`: 중심 a–원 위 b(`normal`을 주면 원 전체), `point`: a
  - `label`이 없으면 값으로 쓴다(거리·`R 반지름`은 장면 단위, 각은 도, 점은 좌표). `'\n'`으로 여러 줄, 빈 문자열이면 글자 상자 없음
  - 선은 깊이를 따져 가려진 부분을 `hidden`(기본 0.35) 불투명도로, 점·글자도 가려지면 흐리게 그린다. 단면으로 자르지 않고 `toBlob`에 담긴다
  - 앞의 덧그림을 모두 바꾼다. 장면을 바꿔도 남는다(앱이 `setAnnotations(null)`로 지운다). `annotations`로 지금 목록을 읽는다
  - 모양 계산은 순수 함수 `annotationGeometry`·`angleAt`(`opencad-viewer3d/annotate`)

### 윤곽선(모서리) 고르기

- `Viewer3dOptions.pickEdges`(기본 false)·`setPickEdges(on)`·`pickEdges`: 켜면 누르기·측정·`onPick`이 그물 윤곽선(`Mesh3d.edges`)을 선분 다음, 면보다 먼저 고른다
- `pick(x, y, { edges: true, pointerType })`: 한 번만 윤곽선까지 고르기(두 번째 인자로 예전처럼 포인터 종류 문자열도 된다)
- 결과는 `kind: 'edge'`, `id` = 그물 id, `index`·`raw` = `Mesh3d.edges`의 선분 번호, `point` = 윤곽선 위 세계 점. 측정은 끝점 가까이면 끝점에 붙잡는다
- 허용 거리는 0.6.0 규칙 그대로(마우스·펜 `pickTolerance`, 터치 `touchPickTolerance`). 음영 모드에서는 그 점에서 광선을 다시 쏴 면에 가린 윤곽선은 빼고,
  단면에 잘린 부분·`setHiddenRanges(id, { edges })`로 숨긴 윤곽선도 빼며, `Mesh3d.matrix`·`origin`이 걸린 그물도 세계 위치로 잰다
- 고른 윤곽선 강조는 `highlightRanges({ [id]: { edges: [{ start: index, count: 1 }] } })`

### 두 묶음 사이 최근접점

- `closestPoints(idA, idB, { maxDistance? })` → `{ a, b, distance } | null`: 두 묶음(그물·선분·점 묶음 id) 사이 가장 가까운 두 점(세계)과 거리.
  묶음 원점·`Mesh3d.matrix`·`setItemMatrix`·마주 보기 돌림을 반영하고 `setHiddenRanges`로 숨긴 구간은 뺀다. 서로 걸치면 0. 고르기용 BVH를 그대로 써서(없으면 만든다) 두 나무를 함께 내려가며 가지친다.
  묶음 전체 모양으로 재므로 숨긴 묶음·묶음 숨기기(`setItemVisible`·`setGroupVisible`)·`pickable: false`·단면에 잘린 부분은 따지지 않는다(앱이 보이는 것만 넘긴다)
- 순수 함수 `closestBetween(shapeA, shapeB)`(`opencad-viewer3d/closest` — 점·선분·삼각형 쌍 최근접점 도우미도 있다)

### 여러 단면 평면

- `setSections([{ normal, offset, items?, caps?, outline?, plane?, id? }, …] | null, opts?)`: 평면 여러 개(최대 `MAX_SECTION_PLANES` = 6 — 상자 단면)의 남는 쪽(교집합)만 남긴다.
  `items`를 주면 그 평면은 그 묶음 id만 자른다(나머지는 그대로). 평면마다 `caps`·`outline`·`plane`을 따로 준다
- `setSection`·`setSectionAxis`는 평면 하나 API로 남는다(부르면 다른 평면은 지운다). `section`은 첫 평면, `sections`는 모든 평면 상태(`items`·`id` 포함)
- `setSectionPosition(t, { index })`·`flipSection(flip, index)`·`setSectionOptions(opts, index)`·`sectionHandle(index)`·`moveSectionByPixels(dx, dy, index)`: 평면 번호(기본 0)마다
- `onSectionChange((first, all) => …)`: 둘째 인자로 모든 평면 상태
- 잘린 면 채우기: 평면마다 그 평면 하나로 자른 그물의 스텐실 홀짝을 세고, 채운 면은 다른 평면들로 자른다(상자 단면에서 모서리가 맞물린다).
  고르기·측정·가림도 묶음마다 자기 평면들로 하고, 잘린 면을 누르면 들어온 평면의 법선을 돌려준다. 단면 테두리는 다른 평면으로 잘라 남는 부분만
- `Mesh3d.capGroup`(선택): 재질별로 나뉜 그물들이 함께 닫힌 입체를 이루면 같은 이름을 준다 — 교차를 더해 한 번에 채운다(그물마다 `closed`가 아니어도 된다).
  평면 하나 단면에서도 쓴다. 채운 면 색은 처음 그물 색
- 평면이 하나이고 범위를 정하지 않았으면 예전 셰이더·그리기 그대로(여러 평면은 `CLIPN` 셰이더 변종). 순수 함수 `rayKeptIntervalN`·`clipPolygon`·`clipSegments`

### 묶음별 겉모습(불투명도·색·행렬)

- `setItemOpacity(id, alpha | null, { pickable? })`: 묶음 불투명도 0~1(색 알파에 곱한다). 1보다 작으면 반투명 차례에 뒤에서 앞으로 그리고 가림·잘린 면 채우기에서 빠진다.
  `pickable: false`면 고르기·측정·가림 판정에서도 뺀다(유령처럼 둘 때)
- `setItemColor(id, rgba | cssColor | null)`: 정점 색·무늬 대신 이 색(태그·부품별 색). 윤곽선(와이어·X-ray)·선분·점·잘린 면 색도 따른다
- `setItemMatrix(id, m4 | null)`: 세계에 더 거는 열 우선 4×4 행렬(세계' = m · 세계 — 분해도·움직이기). 그리기·고르기(그물·윤곽선·선분·점)·측정·
  전체 보기 범위·단면·최근접점이 모두 따른다
- `itemLook(id)`, `clearItemLooks()`. 장면을 바꾸면 모두 풀린다. 아무 겉모습도 없으면 예전 그리기·고르기 그대로

### 그림 저장 선택·창 확대

- `toBlob({ scale?, transparent?, overlays?, type?, quality? })`: 화면 밖(다중 표본 GPU 버퍼)에서 다시 그린다. `scale`은 화면 화소의 몇 배(선 굵기·점·덧그림도 같은 비율),
  `transparent`는 바탕을 비운 PNG, `overlays: false`면 측정·덧그림·좌표축·단면 표시 없이. 한 변 GPU 한도·약 4천만 화소를 넘으면 비율을 줄인다.
  예전처럼 `toBlob('image/png')`로 부르면 화면 캔버스를 그대로 쓴다. 화소만 필요하면 `renderImage(opts)` → `ImageData`.
  크기 한도: 넓이 `SNAPSHOT_MAX_PIXELS`(4096² — iOS Safari 2D 캔버스 한도)·한 변 GPU 한도를 넘으면 배율을 줄인다. 실제 크기·배율은 `snapshotSize({ scale })` → `{ width, height, scale }`.
  GPU에서 읽은 버퍼를 그대로 그림 데이터로 쓰고 덧그림은 같은 캔버스 위에 그려 복사를 줄였다. 만들지 못하면 무엇이 문제인지 적은 Error로 거절한다
- `zoomToRect(x0, y0, x1, y1, animate?)`: 화면 사각형(캔버스 CSS 화소)이 화면을 채우게 확대한다(가운데 아래 점 깊이 기준). 순수 함수 `rectZoomCamera`

### 그리기 모드 더하기·외곽선

- `setRenderMode('hiddenLine')`: 면을 바탕색(조명 없이)으로 채워 뒤의 선을 가리고 윤곽선만 보인다(윤곽선이 없는 그물은 삼각형 변 — 0.7.1부터 `triangleEdges: false`면 선 없음). 윤곽선 색은 선 색(테마 글자 쪽)
- `setRenderMode('monochrome')`: 정점 색·무늬 없이 한 색(테마 `monochrome`·CSS `--v3d-mono`, 기본 밝은 회색) 음영 + 윤곽선
- `setRenderMode('noTexture')`: 무늬만 끈 음영 + 윤곽선(정점 색·`color`는 그대로)
- `setRenderOptions({ hiddenEdges })`: 숨은 선 모드에서 면 뒤 윤곽선을 흐린 점선으로(true = 0.35 또는 불투명도)
- `setRenderOptions({ profiles: true | { width, color } })`: 화면 공간 외곽선(실루엣). 불투명 그물만 따로 깊이 그림에 그려 깊이가 끊기는 곳을 칠한다(음영 계열 모드 — 0.7.2부터 와이어프레임도).
  개발 페이지(swiftshader, 1200×700)에서 프레임 1.5 → 2.1 ms. `renderOptions`로 읽는다
- 고르기·가림·잘린 면 채우기는 새 모드를 음영 모드처럼 다룬다

### 바탕(한 색·하늘과 땅)

- `setBackground({ color?, sky?, skyHorizon?, ground?, groundHorizon? } | null)`·`background`: `color`는 테마 바탕 대신 한 색(앱이 파일 스타일을 따를 때 — 숨은 선 모드 면 색도 이 색).
  `sky`·`ground`를 주면 지평선 위·아래 기울기 바탕(화소마다 눈에서 본 방향의 높이로, 지평선은 카메라 앙각을 따라 움직인다 — 평행 투영도 같은 시야각으로).
  `skyHorizon`·`groundHorizon`은 지평선 근처 색. 투명 바탕 그림 저장에는 그리지 않는다

### 해 조명·그림자·안개(기본 꺼짐)

- `setLighting({ sun: { direction, intensity?, color? }, ambient?, shadows? } | null)`·`lighting`: 고정 보조광 대신 세계 방향 해 하나(해 쪽 방향)와 주변광으로 음영한다.
  `shadows: true | { size, bias }`면 해 쪽 평행 투영 깊이 그림(기본 2048², 장면 보이는 범위에 맞춤)을 3×3 PCF로 읽어 그늘을 곱한다.
  깊이 그림은 장면·보이기·숨긴 구간·단면·겉모습·조명이 바뀔 때만 다시 그린다(카메라만 움직이면 그대로 — 마주 보는 그물은 돌림 각이 바뀔 때만).
  크기는 256 ~ GPU 무늬 한도(최대 8192)로 자르고, 만들지 못한 크기는 다시 시도하지 않는다. 그림자·외곽선을 끄면 그 GPU 버퍼를 놓는다
- `setFog({ color?, start, end } | null)`·`fog`: 눈 깊이(세계 단위) start~end 선형 안개(기본 색은 바탕색). 그물·선·점에 적용하고 덧그림·격자에는 하지 않는다
- 개발 페이지(swiftshader, 1200×700, 작은 장면) 프레임: 기본 1.6 ms, 해 1.6, 그림자(깊이 그림 재사용) 1.8, 매 프레임 다시 그리면 2.0, 안개 1.6, 하늘 바탕 +0.1

### 1인칭 걷기·시야각

- `setNavigation('walk' | 'orbit', { eyeHeight?, speed?, tapToStand? })`·`navigation`: 걷기에서는 끌기(한 손가락) = 눈은 제자리에서 둘러보기, 휠·W/S·↑/↓ = 앞뒤,
  A/D = 옆, ←/→ = 돌기, Q/E·PageDown/PageUp = 아래·위, Shift = 세 배 빠르게, 두 번 누르기 = 그 자리 눈높이에 서기(이 두 번째 누르기는 `onPick`·측정으로 알리지 않는다), 두 손가락 = 벌려 앞으로·끌어 옆/위아래.
  걷기 키는 물리 키(`e.code`, 없으면 `e.key`)로 보므로 한글 입력기(ㅈㅁㄴㅇ)에서도 된다. 키를 누르고 있는 동안 뷰어가 창 `keyup`·`blur`·`visibilitychange`를 스스로 들어
  앱이 창 keydown만 넘겨도 키가 눌린 채로 남지 않는다(`walkKeyOf(e)` 순수 함수).
  눈높이 기본은 장면 단위로 1.6 m(단위를 모르면 범위 반지름의 0.1), 빠르기 기본은 초당 보이는 범위 반지름의 0.4. 걷기로 바꿀 때 눈은 제자리
- `setWalkInput({ forward, right, up, turn, look })`(−1~1, 가상 조이스틱 — 0이 아닌 동안 프레임마다 움직임), `walkBy(forward, right, up)`, `lookBy(dYaw, dPitch)`
- `handleKeyUp(e)`: 캔버스 밖 키를 넘기는 앱은 keyup도 넘길 수 있다(넘기지 않아도 위처럼 뷰어가 창 keyup을 듣는다)
- `setFov(도)`·`fov`: 세로 시야각(10~120°). 순수 함수 `lookCamera`·`walkCamera`·`standCamera`

### 마주 보는 그물

- `Mesh3d.billboard = { origin, axis?: 'z', front? }`(선택): 세계 Z축(origin을 지나는) 둘레로 프레임마다 돌려 `front`(기본 [0, −1, 0] — 앞 뷰에서 보이는 쪽)가
  카메라 쪽(원근은 원점 → 눈, 평행은 보는 방향)을 향한다. `origin`은 세계 좌표. 고르기·측정·윤곽선·그림자·단면 테두리도 돌린 자리로 하고,
  범위(전체 보기·고르기 상자)는 원점 둘레 기둥이라 돌려도 변하지 않는다. 순수 함수 `billboardMatrix`·`billboardAngle`·`towardCamera`·`billboardBounds`

### 뒷면 색·무늬

- `Mesh3d.backColor`(선택): 삼각형 감김이 화면에서 시계 방향인 쪽(바깥에서 반시계로 감은 그물의 안쪽·뒷면)을 이 색으로(불투명도는 `color` 알파). SketchUp 면 뒷면 재질처럼
- `Mesh3d.backTexture`·`backUvs`(선택): 뒷면 무늬(좌표가 없으면 `uvs`). `Mesh3d.matrix`가 거울(행렬식 < 0)이면 앞뒤를 맞춰 뒤집는다
- 단색·숨은 선 모드·`setItemColor`에서는 뒷면도 그 색, `noTexture`에서는 뒷면 무늬만 끈다. 셰이더 `BACK`·`BACKTEX` 변종(`gl_FrontFacing`)

### 카메라 굴림·렌즈 이동

- `CameraState.roll`(선택, 라디안)·`setRoll(rad)`: 화면 위 방향을 보는 축 둘레로 기울인다(뷰 큐브·좌표축도 함께). 0이면 없앤다
- `CameraState.shiftX`·`shiftY`(선택, 화면 반폭·반높이의 몇 배)·`setLensShift(x, y)`: 보는 방향은 두고 그림만 옮기는 축 어긋난 투영 — 2점 투시는 앙각 0으로 보고 `shiftY`로 맞춘다.
  고르기·`project`·하늘 바탕이 함께 따른다. 표준 뷰(`setView`)는 둘 다 0으로 돌린다. 값이 없으면 카메라 객체·투영은 예전과 같다
- `onCameraChange`는 0.7.0부터 시야각(`setFov`)·굴림·렌즈 이동이 바뀔 때도 부른다

## 0.7.1: 모서리만 그리기·선분 묶음 숨은 점선

새 선택을 주지 않으면 그림·고르기는 0.7.0과 화소·값까지 같다(개발 페이지 기본·큰 좌표 장면에서 일곱 모드·숨은 점선·단면·구간 숨김과 강조 등
화면 31가지와 고르기·붙잡기 값을 견주었다). 고친 것 하나: 숨은 점선이 숨긴 윤곽선 구간도 그리던 것.

- `Mesh3d.triangleEdges`(기본 `true`): `false`면 윤곽선(`edges`)이 없는 그물도 와이어프레임·숨은 선에서 삼각형 변을 그리지 않는다.
  선은 `edges`만 그린다(없으면 선 없음). 고르기·측정·단면 채우기·그림자·겉모습·그림 저장은 그대로다(면은 모드와 상관없이 고른다)
  - B-rep 해석기(STEP): 면 그물에 `triangleEdges: false`를 두면 모서리 없는 매끈한 닫힌 면(원환 등)이 숨은 선에서 촘촘한 삼각형 그물로 보이지 않는다.
    그런 면의 테두리가 필요하면 외곽선(`setRenderOptions({ profiles: { width: 1 } })`)을 함께 켠다(와이어프레임은 0.7.2부터 — 아래 0.7.2)
  - 모서리를 선분 묶음으로 따로 주는 해석기(SketchUp): 그물마다 `triangleEdges: false`를 두면 와이어프레임·숨은 선에 모서리만 보인다.
    0.7.0에서 쓰던 길이 0 윤곽선을 넣고 `setHiddenRanges`로 숨기는 꼼수는 필요 없다
- `LineSet3d.hiddenEdges`(선택): `true`면 그 선분 묶음도 숨은 선 모드의 숨은 점선(`setRenderOptions({ hiddenEdges })`)을 받는다 — 면 뒤로 가려진 부분만
  흐린 1화소 점선. 그리기 범위(`setLineDrawRange`) 안쪽만, 숨긴 구간은 빼고, 묶음 불투명도를 곱한다. 선분 묶음에 색을 주지 않으면 같은 모서리를
  그물 `edges`로 줄 때와 숨은 선 모드 그림이 화소까지 같다
- 숨은 점선은 `setHiddenRanges(id, { edges })`로 숨긴 윤곽선 구간을 빼고 묶음 불투명도(`setItemOpacity`)를 곱한다(0.7.0은 숨긴 윤곽선도 그렸다)

```ts
// SketchUp 꼴: 면 그물은 삼각형 변 없이, 모서리는 따로 선분 묶음
scene.meshes.push({ id: 'face-1', positions, indices, color, triangleEdges: false });
scene.lines.push({ id: 'edges-1', positions: edgeSegments, hiddenEdges: true });
viewer.setRenderMode('hiddenLine');
viewer.setRenderOptions({ hiddenEdges: true }); // 뒷모서리를 흐린 점선으로
```

## 0.7.2: 와이어프레임 외곽선·굵기 1화소

외곽선을 켜지 않으면 그림·고르기는 0.7.1과 화소·값까지 같다(개발 페이지 기본·큰 좌표 장면에서 0.7.1 기준 화면·고르기 값 41가지,
외곽선을 끈 와이어프레임의 그림 저장(배율 2·투명 바탕), 기본 굵기 외곽선을 켠 음영 계열 화면을 견주었다). 외곽선을 켜면 달라지는 것은 둘이다.

- 외곽선(`setRenderOptions({ profiles })`)을 와이어프레임에서도 그린다. 0.7.1은 음영 계열 모드에서만 그려서, `triangleEdges: false`인
  모서리 없는 매끈한 닫힌 면(구·원환)이 와이어프레임에서 아예 보이지 않았다. 순수 함수 `drawsProfiles(mode)`
  - 외곽선은 어느 모드에서나 불투명 그물만 따로 그린 맨 앞 깊이 그림의 실루엣이다: 바깥 테두리, 구멍, 앞 그물이 뒤 그물 위에 겹친 테두리.
    와이어프레임은 면이 서로 가리지 않지만 외곽선은 이 맨 앞 그림을 따르므로, 앞 그물에 가린 뒤 그물의 외곽선은 그 자리에서 끊긴다
  - 반투명 그물(장면 색 알파나 `setItemOpacity`가 1보다 작은 것)은 음영 계열처럼 외곽선이 없다. 숨긴 구간·단면·묶음 행렬은 따른다
  - X-ray에서는 그리지 않는다. 반투명 면이 이미 모양을 보여 주고(모서리 없는 면도 사라지지 않는다), 모든 면이 비쳐 보이는 그림에서
    맨 앞 깊이 실루엣은 비쳐 보이는 뒤 그물의 외곽선을 앞 그물 자리에서 끊어 그림과 어긋난다
  - 와이어프레임 선은 그물 색으로 그리고 외곽선은 한 색(기본은 선 색)이다. 부품 바깥 테두리에서는 외곽선 색이 그물 색 선 위에 겹친다.
    선을 한 색으로 쓰는 앱은 그 색을 `color`로 준다
- 굵기가 장치 화소 1.5보다 가늘면(화소 비율 1에서 `width: 1`) 깊이가 끊긴 곳의 앞쪽 화소 하나만 칠한다. 0.7.1은 끊긴 곳 양쪽 화소를 칠해
  가장 가는 것이 2화소였다(화소 비율 1에서 `width: 1`과 기본 2가 같은 그림). 기본 굵기 2와 장치 화소 1.5 이상은 0.7.1 그대로다.
  순수 함수 `profileOnePixel(width)`(장치 화소)
- 1화소 윤곽선·와이어프레임 선과 함께 쓸 때는 `{ width: 1 }`을 권한다. 기본 2는 모서리보다 두 배 굵어 보인다
  (개발 페이지 1200×700, 화소 비율 1: 칠한 화소 1,349개(1) / 2,797개(2)). 화소 비율 2에서 `width: 1`은 장치 화소 2개 = CSS 화소 1개다

```ts
// STEP 꼴: 모서리 없는 B-rep 면(triangleEdges: false)이 와이어프레임·숨은 선에서 사라지지 않게, 1화소 모서리와 같은 굵기로
const lineMode = mode === 'wireframe' || mode === 'hiddenLine';
viewer.setRenderMode(mode);
viewer.setRenderOptions({ profiles: lineMode ? { width: 1 } : userProfiles }); // userProfiles: 음영 모드에서 앱이 켠 외곽선
```

## 0.8.0: 측정 붙잡기·음영 뒤 모서리·선 색·걷기 중력

모두 켜야 동작한다. 켜지 않으면 그림·고르기·측정은 0.7.2와 화소·값까지 같다(개발 페이지 기본·큰 좌표 장면에서 0.7.2 기준
화면 42가지 — 일곱 모드·밝은 테마·숨은 점선·외곽선 셋·단면·평행 투영·구간 숨김과 강조·측정 그림과 붙잡을 점 표식 셋, 음영 모드에 0.7.2 꼴
`hiddenEdges: true`를 준 화면 — 와 고르기 7,200번(마우스·터치, 윤곽선 고르기 끔·켬)·측정 누르기 2,640번(마우스·터치·펜, 측정 결과 184개)의 값을 견주었다).
바뀐 기본 동작은 없다.

### 측정 점 붙잡기 넓히기

- `setMeasureSnap({ midpoints?, edges?, points?, pointsFor? } | null)`·`measureSnap`: 두 점 측정이 꼭짓점·끝점 말고도 붙잡을 점
  - `midpoints`: 고른 선분 묶음·그물 윤곽선 선분의 가운데 점. 끝점보다 2화소(`MIDPOINT_YIELD_PX`) 넘게 가까울 때만이라 화면에서 몇 화소짜리 꺾은선(곡선)은 끝점이 이긴다
  - `edges`: 측정 중에만 그물 윤곽선도 고른다(누르기·`onPick`의 `pickEdges`는 그대로). 주지 않으면 `pickEdges`를 따른다
  - `points`: 늘 후보인 앱 점 `SnapPoint[]` — `{ point, kind?, id? }`(세계 좌표, 종류 기본 `'point'`). 아무것도 고르지 않은 자리(구멍 가운데 빈 곳)에서도 붙잡는다.
    `id`를 주면 그 묶음이 숨었으면 빼고, 그 묶음의 단면 평면으로 자르고, 묶음 행렬(`setItemMatrix` — 분해도)을 따라 옮긴다
  - `pointsFor(pick)`: 커서 아래 고른 것(그물·윤곽선·선분·점)마다 앱이 더하는 점. 마우스 이동마다 부르므로 가볍게. `id`가 없으면 고른 묶음으로 자르고 가린다
- 붙잡기 거리 안(0.6.0 규칙 그대로 — 마우스·펜 10화소, 터치 `max(10, touchPickTolerance)`)에서 화면에 가장 가까운 보이는 점을 붙잡는다.
  같은 거리면 고르기가 붙잡은 꼭짓점·끝점이 이긴다. 단면에 잘린 점, 음영 계열에서 불투명 면에 가린 점, 숨긴 묶음의 점은 뺀다.
  앱의 정밀 조준(손가락 위 십자선 — 펜 포인터)도 미리 보기와 누르기가 같은 붙잡기 거리라 미리 본 점이 그대로 찍힌다
- 마우스를 올리면 표식 모양으로 종류를 보인다: 꼭짓점·끝점 네모(0.7.2와 같음), 가운데 점 세모, 중심 ⊕, 그 밖의 앱 점 마름모, 붙잡지 않음 동그라미
- `SnapKind` = `'vertex'`(그물 꼭짓점·점 묶음의 점) | `'endpoint'` | `'midpoint'` | `'center'` | `'point'`. 켰을 때만 `MeasureResult.snapA`·`snapB`(붙잡지 않은 점은 `null`)와
  `measureHoverSnap`(`{ point, snap }` — 상태 줄에 "중심" 같은 글을 보일 때)이 있다. 순수 함수 `chooseMeasureSnap`(`opencad-viewer3d/snap`)

```ts
// STEP 꼴: 모서리 표가 아는 원·원호 중심과 B-rep 모서리의 곡선 가운데 점
viewer.setMeasureSnap({
  midpoints: true,
  edges: true, // 측정 중에만 윤곽선도 고른다
  points: circleCenters.map((c) => ({ point: c.world, kind: 'center', id: c.meshId })), // 장면을 열 때 한 번
  pointsFor: (pick) => {
    if (pick.kind !== 'edge') return null;
    const e = edgePickOf(pick.id, pick.index); // 앱의 모서리 표 찾기(edges.ts)
    if (!e) return null;
    return [{ point: e.mid, kind: 'midpoint' }, { point: e.ends[0], kind: 'endpoint' }, { point: e.ends[1], kind: 'endpoint' }, ...(e.center ? [{ point: e.center, kind: 'center' as const }] : [])];
  },
});
viewer.onMeasure((m) => m && console.log(m.distance, m.snapA, m.snapB)); // 예: 40, 'midpoint', 'center'
```

### 음영 방식의 뒤 모서리

- `setRenderOptions({ hiddenEdges: { opacity?, shaded?, color? } })`: `shaded: true`면 음영 계열 모드에서도 면 뒤로 가려진 모서리를 흐린 1화소 점선으로(SketchUp "뒤 모서리").
  그물 윤곽선은 보이는 윤곽선을 그리는 음영+윤곽·단색·무늬 없음에서만, 음영에서는 `LineSet3d.hiddenEdges` 선분 묶음만 그린다(숨은 선 모드는 0.7.2 그대로 둘 다).
  `opacity` 기본 0.35, `color`는 점선 색(기본 테마 선 색). 예전처럼 `true`·숫자를 주면 숨은 선 모드에서만이다. 순수 함수 `drawsBackEdges(mode, shaded)`
- 음영 계열(과 점선 색을 준 숨은 선)의 점선은 두꺼운 선 셰이더 변종 `CAPZ`로 그린다: 끝 마개를 늘릴 때 깊이도 선을 따라 늘리고 선 기울기만큼 눈 쪽으로 당겨,
  보이는 모서리 위에 점선이 비치지 않는다. 0.7.2 숨은 선 모드는 이 어긋남으로 보이는 모서리 위에도 점선이 일부 겹쳤는데 선과 점선 색이 같아 보이지 않았다(기본은 그대로 둔다)
- 반투명 그물은 깊이에 없으므로 그 뒤 모서리는 점선이 되지 않는다(비쳐 보인다)

### 선 색: 외곽선·윤곽선이 바탕에 묻히지 않게

- `setRenderOptions({ edgeColor })`: 그물 윤곽선(`Mesh3d.edges`)·삼각형 변 선 색
  - 색(RGBA 또는 CSS 색): 선을 그리는 모든 모드에서 그 색(강조색은 그대로, X-ray는 알파에 0.9). 모서리를 선분 묶음으로 따로 그리는 앱이 같은 색을 그물 윤곽선에도 줄 때
  - `'contrast'`: 와이어프레임·X-ray·숨은 선(선 뒤가 바탕인 모드)에서 모드 색(그물 색·테마 선 색)이 바탕과 3:1(WCAG 그래픽)이 안 될 때만 테마 선 색으로, 그것도 모자라면 검정·흰색
  - `null`: 끄기(0.7.2). 순수 함수 `meshEdgeColor`
- `profiles.color: 'contrast'`: 외곽선을 바탕(`setBackground` 색 또는 테마 바탕)과 3:1이 되는 색으로(테마 선 색, 모자라면 검정·흰색)
- 바탕은 `setBackground({ color })`를 따른다(하늘·땅 기울기는 보지 않는다). 대비 계산 `contrastRatio(fg, bg)`·`contrastLineColor(color, bg, fallback)`·`LINE_CONTRAST_MIN`(3)을 입구에서 내보낸다

```ts
// SketchUp 꼴: 모서리는 선분 묶음(hiddenEdges: true), 카메라를 보는 컴포넌트 모서리만 그물 윤곽선(Mesh3d.edges)
viewer.setRenderOptions({
  hiddenEdges: { shaded: style.backEdges, color: edgeColor }, // 음영·음영+윤곽에서도 뒤 모서리 점선
  edgeColor: edgeColor, // 앱이 선분 묶음에 쓰는 모서리 색(linecontrast로 고른 것)을 그물 윤곽선에도 — 와이어프레임·X-ray에서 재질 색 대신
  profiles: style.profiles ? { width: style.profileWidth, color: 'contrast' } : null, // 파일 바탕 색과 대비
});
```

### 걷기 중력·부딪힘

- `setNavigation('walk', { gravity?, collide?, stepHeight?, radius? })`(`WalkOptions`, 기본 모두 꺼짐 — 끄면 0.7.x 걷기 그대로)
  - `gravity`: 발 + `stepHeight`에서 아래로 광선을 쏴 맞은 바닥 위 눈높이에 둔다. 계단·경사는 오르고(한 단이 `stepHeight` 이하), 난간 밖으로 나가면 아래 바닥으로 내려가며,
    아래에 아무것도 없으면 높이를 지킨다. 위아래 입력(Q/E·PageUp/PageDown·두 손가락 위아래)은 무시하고, 켜는 순간 발밑 바닥에 선다
  - `collide`: 눈 높이와 무릎 높이(발 + `stepHeight`)에서 움직이는 쪽으로 광선을 쏴 벽까지 수직 거리 `radius`에서 멈추고 벽을 따라 미끄러진다
  - `stepHeight` 기본 눈높이의 0.35(1.6 m면 0.56 m — SketchUp과 비슷), `radius` 기본 눈높이의 0.18
- 키·휠·두 손가락·조이스틱(`setWalkInput`)·`walkBy`가 모두 같은 길이다. 보이는 그물(반투명 포함, `pickable: false` 제외)과 부딪히고
  묶음 원점·행렬·숨긴 구간을 따르며 단면에 잘린 쪽은 지나간다. 순수 함수 `castRay`·`walkStep`(`opencad-viewer3d/walk`)

```ts
viewer.setNavigation('walk', { eyeHeight: 1676, gravity: true, collide: true }); // mm 모형, 눈높이 5′6″
```

## 0.9.0: 측정 추론 붙잡기·앱 점 색인·그물마다 선 색·큰 배열 나눠 올리기

새 선택을 켜지 않으면 그림·고르기·측정은 0.8.0과 화소·값까지 같다(`npm run pixels -- --base v0.8.0`: 개발 페이지 기본·큰 좌표 장면의
0.8.0 화면 66가지 가운데 아래 숨은 점선 두 화면 말고 모두, 값 11묶음 모두 — 앱 점 3,725개(묶음 행렬로 옮긴 묶음 포함)를 붙잡는 측정 누르기 1,760번도 같다).
바뀐 기본 동작은 셋이다.

- 숨은 선 모드의 숨은 점선(뒤 모서리)을 기본 색에서도 끝 마개 깊이를 맞춘 변종(`CAPZ`)으로 눈 쪽으로 아주 조금 당겨 그린다. 0.7.2부터 마개를 늘린 만큼
  보이는 모서리 위에도 점선 끝이 조금 겹쳤다(선과 점선 색이 같아 눈에는 거의 보이지 않았다). 화소 비교에서 `base-hidden-dash`·`off-hidden-dash` 두 화면만
  화소 100개씩(최대 차 65) 바뀐다 — 작은 상자·판 모서리의 꼭짓점 둘레. 점선 색을 준 숨은 선과 음영 뒤 모서리는 0.8.0부터 이 변종이었다. 순수 함수 `backEdgeDash`
- 캔버스에 키보드 초점이 오면(`:focus-visible`) 캔버스 안쪽에 2화소 테두리를 그린다. 마우스·터치로 누를 때는 테두리가 없다(누를 때 `focus({ focusVisible: false })`. 다만 키보드로 먼저 초점을 준 캔버스를 누르면 테두리가 남았다 — 0.9.1에서 고쳤다).
  0.8.0까지는 캔버스에 `outline:none`을 직접 두어 키보드 초점이 보이지 않았다. 색은 CSS 변수 `--v3d-focus`(없으면 어두운 테마 `#5aa9ff`, 밝은 테마 `#1f6fd1` —
  둘 다 테마 바탕과 3:1 넘음). 규칙은 `:where()`로 구체성을 낮춰 두었으므로 앱은 `.v3d-gl:focus-visible { outline: … }` 같은 보통 규칙으로 바꾼다(`!important`가 필요 없다)
- 나눠 올리기(`setScene(scene, { incremental })`)에서 새로 올릴 배열이 8 MB(`CHUNK_MIN_BYTES`)를 넘는 묶음은 GPU 버퍼를 배열마다 잡고 4 MB(`CHUNK_BYTES`)씩
  여러 프레임에 채운 뒤 그린다. 0.8.0은 묶음을 한 프레임에 통째로 올려 선분 수백만 개 한 묶음이 한 프레임에 걸렸다. `onProgress`는 예전처럼 묶음 수로 센다.
  나눠 올리지 않는 `setScene`과 다 올린 뒤의 그림은 같다(화소 비교 `big-incremental` — 선분 40만 개 묶음을 조각 일곱으로)

### 측정 추론 붙잡기

- `setMeasureSnap({ …, inference: { intersections?, perpendicular?, axes? } | true })`(`MeasureInference`, 기본 꺼짐 — `true`면 셋 모두): 0.8.0 붙잡기 선택에 더한다
  - `intersections`: 커서 붙잡기 거리 안의 두 선분(선분 묶음, 측정 중 윤곽선을 고르면(`edges`·`pickEdges`) 그물 윤곽선도)이 3D에서 만나는 점. 가장 가까운 두 점이
    그 자리 화면 반 화소 안이고 두 선분 모두 안쪽일 때만이다(끝점에서 만나는 꺾인 곳·T자는 끝점 붙잡기가 맡는다). 화면에서만 엇갈리는 선분은 붙잡지 않는다. 표식 ×
  - `perpendicular`: 첫 점을 찍은 뒤 커서 둘레 선분으로 내린 수직선의 발(선분 안쪽). 표식 ⊥(두 선이 만나는 곳이 그 점)
  - `axes`: 첫 점을 지나는 X·Y·Z 축 방향 선 위에서 커서 광선에 가장 가까운 점. 점 붙잡기(꼭짓점·끝점·가운데 점·중심·앱 점·교차점·수직 발)가 하나도 없을 때만 쓰고,
    첫 점에서 커서까지 축 색 점선과 축 색 동그라미를 그린다. 커서가 첫 점 둘레(붙잡기 거리 안)면 없다
- 점 붙잡기끼리는 0.8.0 규칙 그대로 화면에서 가장 가까운 보이는 점이고, 같은 거리면 고르기가 붙잡은 꼭짓점·끝점 → 앱 점 → 교차점·수직 발 차례다.
  단면에 잘린 쪽, 음영 계열에서 면에 가린 점, 숨긴 묶음, 묶음 행렬(분해도)을 따른다. 미리 보기와 누르기가 같은 길이라 미리 본 점이 그대로 찍힌다
- `SnapKind`에 `'intersection'`·`'perpendicular'`·`'axis'`를 더했다(`MeasureResult.snapA`·`snapB`). `measureHoverSnap`은 축 붙잡기면 `axis`(`'x'`·`'y'`·`'z'`)도 준다(`MeasureHoverSnap`).
  `measureSnap`은 `inference`를 세 값으로 편 꼴로 돌려준다. 순수 함수 `segmentIntersection`·`perpendicularFoot`·`axisSnap`(`opencad-viewer3d/inference`)

```ts
// STEP·SKP·NC 공통: 0.8.0 붙잡기 선택에 inference만 더한다(NC는 선분 묶음뿐이라 edges·points는 없어도 된다)
viewer.setMeasureSnap({ midpoints: true, edges: true, points: circleCenters, pointsFor, inference: true });
viewer.onMeasure((m) => m && console.log(m.distance, m.snapA, m.snapB)); // 예: 70, 'vertex', 'perpendicular'

// 상태 줄: 커서 아래 붙잡을 점의 종류
const KIND: Record<SnapKind, string> = { vertex: '꼭짓점', endpoint: '끝점', midpoint: '가운데 점', center: '중심', point: '점', intersection: '교차점', perpendicular: '수직', axis: '축' };
const h = viewer.measureHoverSnap;
status.textContent = !h?.snap ? '' : h.snap === 'axis' ? `${h.axis!.toUpperCase()}축 방향` : KIND[h.snap];
```

### 앱 붙잡기 점 색인

- `setMeasureSnap({ points })`의 앱 점이 512개(`SNAP_INDEX_MIN`) 이상이면 점 범위 나무(BVH)를 쉬는 틈에 만들어, 마우스 이동마다 커서 광선 둘레 원뿔(붙잡기 거리를
  세계 길이로 넉넉히 바꾼 것)에 들 수 있는 점만 번호 차례로 꺼낸다. 0.8.0은 이동마다 모든 점을 화면에 투영했다. 고르는 점은 모두 훑을 때와 같다(붙잡기 거리 밖 점은
  어차피 고를 수 없고, 같은 거리면 앞 번호가 이기는 규칙도 그대로). 큰 좌표는 점들 가운데를 뺀 좌표로 나무를 만든다
- 묶음 행렬(`setItemMatrix`)이 걸린 묶음의 점(`id`)은 그 묶음만의 나무에서 광선을 행렬의 역으로 옮겨 찾는다(점이 64개보다 적으면 모두 훑는다)
- 이 기계(Node)에서 앱 점 30만 개: 마우스 이동 한 번 37 ms → 0.4 ms, 색인 만들기 0.13초(점 목록을 줄 때 한 번). 순수 계산 `SnapPointIndex`(`opencad-viewer3d/snapindex`)

### 그물마다 윤곽선·외곽선 색

- `setItemEdgeColor(id, color | null)`: 그 그물의 윤곽선(`Mesh3d.edges`)·삼각형 변(와이어프레임·숨은 선) 색. CSS 색 또는 RGBA 0~1, `null`이면 되돌림.
  강조색이 먼저고, 전역 `setRenderOptions({ edgeColor })` 자리에 쓴다(X-ray는 알파에 0.9, `edgeColor: 'contrast'`면 이 색에도 바탕 대비를 따진다). 숨은 점선 색은 그대로다
- `setItemProfileColor(id, color | null)`: 외곽선(`setRenderOptions({ profiles })`)이 이 그물이 앞에 있는 곳에서 이 색 — 바탕·뒤 그물과 맞닿은 테두리, 구멍 테두리.
  앞 그물이 뒤 그물 위에 겹친 테두리는 앞 그물의 색이다(끊긴 곳 화소 가운데 가장 가까운 화소의 색). 색을 주지 않은 그물은 `profiles.color`. 반투명 그물은 0.7.2처럼 외곽선이 없다
- `itemLook(id)`에 `edgeColor`·`profileColor`가 실리고 `clearItemLooks()`가 함께 되돌린다. 순수 함수 `edgeLineColor`
- 비용: 외곽선 색을 준 불투명 그물이 하나라도 보일 때만, 외곽선 깊이 그림을 그리면서 화면 크기 색 그림(RGBA8) 한 장에 그물 색을 함께 쓴다(그물 그리기 횟수는 같다).
  합칠 때는 끊긴 곳 화소에서만 그 그림을 한 번 더 읽는다. 장치 화소 1170×2532 휴대폰이면 약 11.9 MB를 더 쓰고, 색을 모두 되돌리면 놓는다.
  그물 번호 그림(ID 버퍼)과 색 표 대신 색을 바로 쓰는 쪽을 골랐다 — 정수 그림·표 찾기가 없어 휴대 GPU에서도 RGBA8 그림 하나다

```ts
// SketchUp 꼴: 재질별 모서리 색(모서리 선분 묶음은 앱이 정점 색으로, 그물 윤곽선과 외곽선은 그물마다)
for (const m of scene.meshes) {
  const c = style.edgeColorMode === 'material' ? materialColorOf(m) : null;
  viewer.setItemEdgeColor(m.id, c);
  viewer.setItemProfileColor(m.id, c);
}
viewer.setRenderOptions({ profiles: style.profiles ? { width: style.profileWidth } : null });
```

### 큰 배열 나눠 올리기

- 위 기본 동작의 셋째. 묶음 하나가 새로 올릴 배열(위치·법선·색·무늬 좌표·색인·윤곽선 — 같은 배열을 쓰는 앞 묶음이 이미 올렸으면 뺀다)이 8 MB를 넘으면
  배열마다 버퍼 크기 잡기(0 채우기)와 4 MB 조각 채우기를 한 걸음씩 하고, 버퍼 잡기는 그 프레임 몫의 절반을 이미 썼으면 다음 프레임 처음으로 미룬다.
  순수 계산 `ChunkedUpload`·`chunkRanges`(`opencad-viewer3d/upload`)
- 헤드리스 Chrome(SwiftShader — CPU로 흉내 내는 GPU라 실제 기기와 시간은 다르다)에서 선분 300만 개 한 묶음(위치 72 MB·색 96 MB), 프레임 몫 8 ms:
  0.8.0은 그 묶음을 한 프레임에 25~56 ms, 0.9.0은 4프레임에 나눠 프레임마다 10~15 ms

## 0.9.1: 누른 뒤 초점 테두리·측정 결과의 축

0.9.0을 앱에 붙이며 찾은 것을 고친 작은 판이다. 그림·고르기·측정 값은 0.9.0과 같다(`npm run pixels -- --base v0.9.0`: 화면 76가지, 값 14묶음 모두 같음.
새 값 묶음 `base-measure-axis`·`off-measure-axis` 둘은 0.9.0에 없는 값이라 건너뜀). 측정 결과와 측정 글 꼴이 받는 값에는 아래 필드가 더해진다(앱이 쓰지 않으면 달라지는 것이 없다).
초점 테두리는 캔버스의 CSS 테두리라 이 비교(WebGL 그림)에 들지 않아 헤드리스 Chrome에서 따로 확인했다. 바뀐 기본 동작은 하나다(키보드로 초점을 준 캔버스를 누르면 테두리가 사라진다).

### 키보드로 초점을 준 뒤 누르면 테두리 감추기

- 0.9.0은 누를 때 `focus({ focusVisible: false })`만 불렀다. 키보드(Tab)로 이미 초점이 있던 캔버스는 초점이 바뀌지 않아 이 선택이 듣지 않고,
  브라우저가 `:focus-visible`을 그대로 두어 마우스·터치로 누른 뒤에도 테두리가 보였다(Chrome 156에서 확인)
- 0.9.1은 누르면(마우스·터치·펜) 캔버스에 `data-v3d-focus="pointer"`를 달고 그동안 테두리를 감춘다. 초점을 뺐다 다시 주지 않으므로 `blur`·`focus` 사건이 나지 않는다
  (화면 읽기 프로그램이 캔버스를 다시 읽지 않고, 누르고 있던 걷기 키도 풀리지 않는다). 속성과 CSS만 쓰므로 `:focus-visible`을 아는 브라우저면 같게 동작한다
- Tab·Shift+Tab을 누르거나 초점이 문서 안 다른 곳으로 가면 속성을 뗀다. 그래서 Tab으로 나갔다가 키보드로 돌아오면 다시 보인다.
  다른 앱이나 탭에 갔다 오면(창만 흐려지고 문서의 초점은 캔버스 그대로) 감춘 채다
- 캔버스에서 다른 키(F·1~7·걷기 키)를 눌러도 다시 보이지 않는다. 브라우저도 마우스로 준 초점에서는 키를 눌러도 테두리를 보이지 않는다(Chrome 156에서 확인).
  걷기에서 끌어 둘러보며 W·A·S·D를 눌러도 테두리가 깜박이지 않는다
- 감추는 규칙 `canvas.v3d-gl[data-v3d-focus=pointer]:focus-visible { outline: none }`은 구체성이 (0,3,1)이라 앱의 `.v3d-gl:focus-visible`이나
  전역 `:focus-visible` 같은 보통 규칙도 이긴다(보이는 규칙은 0.9.0처럼 `:where()`로 낮다). 누른 뒤에도 앱 테두리를 보이려면 이 속성을 넣은 더 구체적인 규칙을 쓰고,
  `outline` 대신 `box-shadow` 같은 것으로 테두리를 그리는 앱은 그 규칙에 `:not([data-v3d-focus=pointer])`를 붙인다
- 헤드리스 Chrome 156에서 실제 입력(CDP)으로 Tab → 누르기 → F·1 → Tab → Shift+Tab → 누르기 → 터치 → 다른 단추 누르기 → Shift+Tab 차례를
  앱 규칙 없음, `.v3d-gl:focus-visible`, 전역 `:focus-visible` 세 경우에 보았다. 0.9.0은 누른 뒤에도 테두리가 남고, 0.9.1은 누르면 없고 키보드로 돌아오면 있다.
  Safari·Firefox는 이 기계에서 돌려 보지 못했다
- 도우미 `pointerFocus`·`focusKey`·`focusLeft`·`POINTER_FOCUS_ATTR`(`opencad-viewer3d/theme`)

### 측정 결과의 축 붙잡기 축

- `MeasureResult.axisA`·`axisB`(`SnapAxis` — `'x'`·`'y'`·`'z'`): 축 붙잡기(`snapA`·`snapB`가 `'axis'`)로 찍은 점의 축. `measureHoverSnap.axis`와 같은 값이다.
  축 붙잡기는 첫 점을 찍은 뒤에만 되므로 지금은 `axisB`만 실린다(`axisA`는 `snapA`와 짝을 맞춘 자리). 다른 종류이거나 추론(`inference.axes`)을 끄면 이 필드가 없고 결과는 0.9.0과 같다.
  앱이 dx·dy·dz 가운데 가장 큰 것으로 축을 짐작하지 않아도 된다
- 측정 글 꼴(`formatMeasure`·`setMeasureFormat`)도 `onMeasure`와 같은 결과를 받는다. 0.9.0은 타입(`MeasureResult & { units }`)과 달리 내장 측정 글에
  `a`·`b`·거리·dx dy dz만 넘겨, 붙잡기를 켜도 `snapA`·`snapB`가 늘 없었다. 0.9.1은 붙잡기를 켰으면 `snapA`·`snapB`·`axisB`도 넘긴다(첫 점만 찍은 미리 보기에서 B는 커서 아래 붙잡을 점).
  글 꼴을 주지 않은 기본 글은 그대로다
- 순수 함수 `measureResult(a, b, snaps)`(`opencad-viewer3d/snap`)

```ts
// 측정 띠: 축 붙잡기면 "Z축"(0.9.0은 dx·dy·dz로 짐작했다). KIND는 위 0.9.0 예의 종류 이름표
viewer.onMeasure((m) => {
  if (!m) return;
  const name = (k: SnapKind | null | undefined, axis?: SnapAxis) => (k === 'axis' && axis ? `${axis.toUpperCase()}축` : k ? KIND[k] : '면 위 점');
  band.textContent = `${fmt(m.distance)} · ${name(m.snapA, m.axisA)} → ${name(m.snapB, m.axisB)}`;
});
// 3D 위 측정 글에도 같은 값이 온다
viewer.setMeasureFormat((m) => [`${fmt(m.distance)}${m.axisB ? ` (${m.axisB.toUpperCase()}축)` : ''}`]);
```

## 0.10.0: 붙잡기 점 차례 한도·추론 잠금과 나란함·작은 모듈의 뷰 키 표

새 선택을 켜지 않으면 그림·고르기·측정은 0.9.1과 화소·값까지 같다(`npm run pixels -- --base v0.9.1`: 0.9.1의 화면 76가지·값 16묶음 모두 같음.
새로 더한 값 가운데 0.9.1 API만 쓰는 셋도 같다 — 새 선택 없이 Shift를 누른 채 미리 보고 찍은 `base-measure-shift-off`, 고른 점에 따라 달라지는
`pointsFor`로 미리 보고 같은 자리를 누른 `base·off-measure-points-for`. 새 화면 8가지·값 7묶음은 0.9.1에 없는 API라 건너뜀).
바뀐 기본 동작은 없다. 측정 결과와 미리 보기에는 아래 필드가 더해지고(앱이 쓰지 않으면 달라지는 것이 없다), `measureSnap.inference`는 다섯 값으로 편 꼴이 된다.

### 앱 붙잡기 점 차례 한도

- `SnapPoint.order`(차례 값)와 `setMeasureSnapLimit(n)`·`setMeasureSnap({ limit })`·`measureSnapLimit`: 차례가 n보다 작은 앱 점만 붙잡는다.
  차례가 없는 점은 늘 후보이고, `pointsFor`가 준 점에도 같은 규칙을 쓴다. `null`(또는 `Infinity`)이면 한도가 없다
- 점 목록과 색인(BVH)은 모든 점으로 한 번 만들고 꺼낼 때만 거른다. 한도가 바뀌면 마지막 커서 자리에서 미리 보기를 다시 구한다
  (0.9.1 꼴로 `setMeasureSnap`을 다시 주면 미리 보기가 사라졌다)
- `setMeasureSnap`은 한도도 새로 정한다(`limit`을 주지 않으면 한도 없음). 붙잡기가 꺼져 있으면 `setMeasureSnapLimit`은 아무것도 하지 않는다
- 비용(이 기계 Node, 원호 중심 10만 개, 차례 = 이동 번호): 한도마다 목록을 잘라 색인을 다시 만들면(0.9.1 꼴) 한 번에 8~22 ms.
  한도로 거르는 질의는 마우스 이동 한 번에 0.05~0.1 ms로 한도가 없을 때와 차이를 잴 수 없을 만큼 작다(거른 점은 꺼내지도 정렬하지도 않는다)
- 시험: 한도로 거른 후보는 한도 없는 후보를 거른 것과 같고, 고른 점은 한도 안 점만 다시 준 목록과 같다(원근·평행·묶음 행렬).
  화소·값 비교 `base·off-measure-limit`은 앱 점 3,725개에 한도 다섯 가지로 잰 측정이 한도 안 점만 다시 준 목록과 같은지도 함께 남긴다

```ts
// NC 재생: 원호 중심마다 그 중심을 처음 그린 이동 번호를 차례로 두고, 문서를 열 때 한 번만 준다
viewer.setMeasureSnap({ points: centers.points.map((p, i) => ({ ...p, order: centers.moves[i] })), pointsFor, inference: true });
// 재생 위치가 바뀔 때마다(lastMove까지 그렸을 때) — 목록·색인은 그대로
viewer.setMeasureSnapLimit(playing ? lastMove + 1 : null);
```

### 작은 모듈의 표준 뷰 키 표

- `VIEW_KEYS`를 `opencad-viewer3d/camera`에서도 내보낸다(입구·`opencad-viewer3d/viewer`와 같은 객체). camera 모듈은 뷰어·그리기·셰이더를 가져오지 않으므로
  코어 입구를 나눠 받는 앱도 첫 화면 메뉴 글에 표를 복사하지 않고 쓴다. package.json `exports`의 `"./*"`가 이미 이 하위 경로를 내주므로 바꾸지 않았다

```ts
import { VIEW_KEYS, VIEW_LABELS } from 'opencad-viewer3d/camera';
```

### 추론 잠금(Shift·앱 단추)과 나란함

- `setMeasureSnap({ inference: { …, parallel?, lock? } })`(`MeasureInference`, 둘 다 기본 꺼짐). `inference: true`는 0.9.0의 셋 그대로다(켜 둔 앱의 동작이 바뀌지 않게 따로 켠다)
  - `parallel`: 측정 중 커서가 지나간 선분(선분 묶음, 측정 중 윤곽선을 고르면 그물 윤곽선도)을 기준으로, 첫 점에서 그와 나란한 선 위의 점.
    점 붙잡기가 하나도 없을 때만 쓰고, 축 붙잡기와 화면 거리로 견줘 가까운 것을 고른다(같으면 축). 기준 선분이 축과 나란하면 축에 맡긴다.
    자홍 안내선(테마 `inference`, CSS 변수 `--v3d-inference`)과 기준 선분 점선을 그리고, 표식은 자홍 동그라미와 ∥이다. `SnapKind`에 `'parallel'`을 더했다
  - `lock`: Shift를 누르는 순간 지금 미리 보기의 방향 추론(축, 나란함, 수직 — 첫 점에서 수직 발 쪽)을 잠그고, 떼면 푼다(SketchUp의 추론 잠금).
    잠그면 첫 점을 지나는 그 선 위에만 찍는다. 커서가 꼭짓점·끝점·중심 같은 점 붙잡기 위면 그 점을 선에 수직으로 내린 자리를 찍고
    (예: Z를 잠그고 다른 모서리 끝을 가리키면 그 높이), 아니면 커서 광선에 가장 가까운 선 위 점이다(붙잡기 거리 제한 없음).
    안내선은 굵은 실선, 표식에는 고리를 두르고, 옮겨 온 점에서 가는 점선을 긋는다
  - Shift는 포인터 이동의 `shiftKey`와 캔버스·`handleKey`·`handleKeyUp`의 Shift로 보고, 누르는 동안 창 keyup·blur도 들어 떼기를 놓치지 않는다.
    `handleKey`는 Shift를 받아도 `false`를 돌려준다(기본 동작을 막지 않는다)
- `setMeasureInferenceLock(true | 'x' | 'y' | 'z' | false)`·`measureInferenceLock`: Shift가 없는 터치 기기에서 앱 단추로 잠근다(위 `lock` 선택과 상관없이 된다).
  `true`는 지금 미리 보기의 방향 추론(커서가 캔버스를 떠났으면 첫 점을 찍은 뒤 마지막으로 본 것), 축 이름은 그 축(첫 점을 찍기 전에 줘도 된다), `false`는 풀기다.
  두 점째를 찍거나 측정을 지우거나(Esc·측정 모드 끄기·장면 바꾸기) 붙잡기 선택을 바꾸면 풀린다. `measureInferenceLock`은 `{ kind, direction, axis?, edge?, source }`
- 결과: `MeasureResult.directionA`·`directionB`(방향 추론의 단위 방향 — 축은 +X·+Y·+Z, 나란함은 기준 선분 방향, 수직은 첫 점에서 발 쪽)와 `lockedA`·`lockedB`.
  `measureHoverSnap`에는 `direction`·`locked`·`edge`(나란함의 기준 선분, 수직 발의 선분)·`from`·`fromSnap`(잠근 선으로 옮겨 온 점과 그 종류)이 실린다
- 순수 함수 `parallelSnap`·`lockedSnap`·`lockFromSnap`·`axisLock`·`rayLinePoint`(`opencad-viewer3d/inference`). 0.9.0 `axisSnap`은 같은 식(`rayLinePoint`)을 함께 쓰고 값은 그대로다(시험으로 견줌)
- 화소·값 비교: 나란함(어두운·밝은 테마)·Shift 잠금(보통·큰 좌표)·앱 단추로 잠근 수직(보통·큰 좌표) 화면, 잠금·나란함·추론 다섯 가지 값

```ts
viewer.setMeasureSnap({ points, pointsFor, inference: { intersections: true, perpendicular: true, axes: true, parallel: true, lock: true } });
// 상태 줄: KIND는 0.9.0 예의 종류 이름표에 parallel: '나란함'을 더한 것
const h = viewer.measureHoverSnap;
const name = !h?.snap ? '' : h.snap === 'axis' ? `${h.axis!.toUpperCase()}축 방향` : KIND[h.snap];
status.textContent = name && (h!.locked ? `${name} (잠금)` : h!.direction ? `${name} — Shift로 잠그기` : name);
// 터치: 정밀 조준 중 다른 손가락으로 누르는 잠금 단추, 첫 점 뒤 축 단추
lockButton.onclick = () => lockButton.setAttribute('aria-pressed', String(viewer.setMeasureInferenceLock(!viewer.measureInferenceLock)));
zButton.onclick = () => viewer.setMeasureInferenceLock('z');
viewer.onMeasure(() => lockButton.setAttribute('aria-pressed', String(!!viewer.measureInferenceLock))); // 두 점째에서 풀린다
```

### 같은 고르기에서 pointsFor 다시 쓰기

- 바로 앞 호출과 같은 고르기(종류·묶음 id·번호·고른 점·법선·잘린 면이 같다 — `samePick`)면 `pointsFor`를 다시 부르지 않고 앞 결과를 쓴다.
  같은 자리에서 미리 본 뒤 누를 때와, 붙잡기 한도나 잠금이 바뀌어 미리 보기를 다시 구할 때다. 커서가 움직이면 고른 점이 달라지므로,
  앱 점이 고른 점에 따라 정해져도(가장 가까운 요소 찾기) 값이 같다. 기억은 `setMeasureSnap`마다 새로 한다.
  결과는 고른 것으로만 정해져야 한다(앱 자료가 바뀌면 `setMeasureSnap`을 다시 준다 — 0.8.0부터의 약속)
- 화소·값 비교 자료에서 미리 보기 180자리와 같은 자리 누르기: 0.9.1은 52번, 0.10.0은 26번 불렀다(사이마다 한도를 바꿔도 26번).
  커서가 움직일 때마다 부르는 것은 그대로다

### 앱이 할 일

- NC: 원호 중심(`arcCenters`)에 `order`(그 중심을 처음 그린 이동 번호)를 두고, 재생 위치가 바뀔 때 `setMeasureSnap({ points: slice })` 대신
  `setMeasureSnapLimit(lastMove + 1)`(재생 중이 아니면 `null`)을 부른다. `src/app/keys.ts`의 `VIEW_KEYS` 복사본은 `opencad-viewer3d/camera`에서 가져오고, 견주던 시험은 뺀다
- STEP·SKP·NC: 잠금과 나란함을 쓰려면 `inference: { intersections: true, perpendicular: true, axes: true, parallel: true, lock: true }`로 켠다.
  터치 화면에는 잠금 단추(또는 X·Y·Z 단추)를 달고, 상태 줄에 `measureHoverSnap.locked`·`direction`으로 "잠금"·"Shift로 잠그기"를,
  측정 띠에 `snapB === 'parallel'`(나란함)·`lockedB`를 보인다. 새 글은 앱 사전(en·ja·zh-CN·de)에 넣는다
- 테마 색을 직접 주는 앱은 `inference`(또는 CSS `--v3d-inference`)를 바탕과 3:1 넘게 고른다(기본은 어두운 테마 `#f062f0` 5.5:1, 밝은 테마 `#b31ab3` 5.2:1)

## 0.11.0: 장면 그물 하나 넣기·바꾸기·빼기

새 API를 쓰지 않으면 그림·고르기·측정은 0.10.0과 화소·값까지 같다(CI의 `npm run pixels -- --base origin/main`: 장면 90개·값 28묶음 모두 같음).
그 안의 `edit-*` 장면 6개는 base(0.10.0)에서 같은 마지막 장면을 `setScene`으로 다시 준 것이라, `setMesh`로 바꾼 그림이 장면 전체를 다시 올린 그림과 화소까지 같다는 확인이기도 하다. 바뀐 기본 동작은 없다.
0.10.0까지는 그물 하나가 바뀌어도(소재 깎기 시뮬레이션의 높이 그물 등) 장면 전체를 `setScene`으로 다시 주어야 해서, 선분 수십만 개 공구 경로까지
GPU에 다시 올리고 모든 고르기 BVH를 다시 만들었다.

### 그물 하나 넣기·바꾸기·빼기

- `setMesh(mesh, opts?)`(`SetMeshOptions`): `mesh.id`와 같은 그물이 있으면 그 자리에서 바꾸고, 없으면 장면 그물 목록 끝에 더한다(`true`).
  장면이 없거나(`setScene` 먼저) 같은 id가 선분·점 묶음이면 `false`
  - GPU: 이 그물의 배열만 올린다. 앞 그물만 쓰던 배열과 바이트 크기가 같은 새 배열은 그 버퍼에 `bufferSubData`로 채우고(버퍼를 새로 만들지 않는다),
    크기가 다르면 새 버퍼를 만들고 앞 버퍼를 지운다. 여러 그물이 함께 쓰는 배열(같은 크기 조각의 색인 등)은 그 배열을 쓰는 마지막 그물이 빠질 때까지 남긴다.
    다른 묶음의 버퍼에는 아무 호출도 없다
  - 앞 그물과 같은 배열 객체는 바뀌지 않았다고 본다(다시 올리지 않고 범위·BVH도 다시 만들지 않는다). 제자리에서 고쳤으면 `vertices`를 준다(아래)
  - 이 그물에 걸린 것만 다시 한다: 고르기 BVH(쉬는 틈에 — 바꾸기가 200 ms 멈추면 만들고, 그 사이 고르기는 그 자리에서 만든다), 그물 범위와 장면 범위
    (`Scene3d.bounds`를 준 장면은 `setScene`처럼 그 값 그대로), 단면 테두리(다른 그물의 교선은 그물마다 기억한 것을 다시 쓴다), 그림자 깊이 그림(다음 그리기에서 한 번).
    색인 배열이 같으면 와이어프레임 삼각형 변 색인도 넘겨 쓴다
  - 그대로 두는 것: 카메라, 강조(`highlight`), 숨김(항목·묶음), 묶음 겉모습(이 id에 둔 색·불투명도·행렬·선 색도), 찍은 측정 점, 단면, 붙잡기 선택.
    이 id의 구간 숨김·강조는 새 삼각형 수로 자른다. 측정 미리 보기는 그 커서 자리에서 새 그물로 다시 구한다
  - `viewer.scene`은 그물을 바꾼 새 장면 객체가 된다(앱이 준 장면 객체는 고치지 않는다). 그물 차례도 `setScene`과 같다(새 id는 그물 목록 끝)
- `removeMesh(id)`: 그물 하나 빼기(뺐으면 `true`). 그 그물만 쓰던 버퍼를 지운다. 그 id에 둔 겉모습·구간 숨김·강조는 지우고,
  id로만 정하는 `setItemVisible`·`highlight`는 남긴다(같은 id로 다시 넣으면 따른다)
- 선분·점 묶음은 하나씩 바꾸지 않는다(바뀌면 장면을 다시 준다). 보이기만 바꿀 때는 `setItemVisible`·`setGroupVisible`
- 시험: 가짜 DOM·가짜 WebGL2(`tests/fakegl.ts` — 버퍼 내용과 그리기 호출마다 버퍼 해시·균일 변수를 기록)로, `setMesh`·`removeMesh`로 바꾼 뷰어와 처음부터
  바뀐 장면을 `setScene`한 뷰어의 그리기·고르기·측정 붙잡기(바꾼 그물의 꼭짓점)·미리 보기·장면 범위·보이기가 같고, 다른 묶음 버퍼에는 호출이 없음을 확인한다
  (새 배열·크기가 다른 배열·제자리 고치기·넣기·빼기·공유 색인·와이어프레임·나눠 올리기 도중)

### 바뀐 정점 구간만 올리기

- `setMesh(mesh, { vertices: { start, count } | [...] })`(정점 번호): 정점 속성 배열(위치·법선·색·무늬 좌표)은 그 구간 밖이 앞 그물과 같다는 약속으로, 그 구간만 올린다
  - 배열을 제자리에서 고쳤으면 꼭 준다(그 배열의 범위 캐시와 BVH를 버린다). 같은 배열을 함께 쓰는 다른 그물도 범위를 새로 센다
  - 같은 크기 새 배열에 주면 물려받은 버퍼에 그 구간만 올린다(워커가 새 배열을 보내며 바뀐 줄을 알려 줄 때)
  - 행 우선 높이 격자(가로 마디 nx개)에서 마디 줄 j0..j1을 고쳤으면 `{ start: j0 * nx, count: (j1 - j0 + 1) * nx }`. 법선을 이웃 마디 차분으로 세면 위아래 한 줄씩 넓힌다
- 색인(`indices`)·윤곽선(`edges`)은 구간으로 올리지 않는다. 바꿨으면 새 배열로 주고, 그 배열은 통째로 올라간다
- 싸게 하지 못한 것: 고르기 BVH는 그물 전체를 다시 만든다. 상자만 고치기(refit)는 같은 거리 맞음을 고르는 차례가 새로 만든 BVH와 달라
  `setScene`과 고르기 값이 어긋날 수 있어서 하지 않았다. 대신 만들기를 바꾸기가 멈출 때까지 미룬다(그 사이 고르면 그 자리에서 만든다).
  장면 범위를 맞추려고 위치 배열은 통째로 한 번 훑는다(1024² 마디 몇 ms)

### 큰 그물과 나눠 올리기

- `setMesh(mesh, { incremental: true | { budgetMs } })`: 새로 올릴 배열이 8 MB(`CHUNK_MIN_BYTES`)를 넘으면 0.9.0 조각 올리기(`ChunkedUpload`)로 새 버퍼에
  프레임마다 4 MB씩 채우고, 다 채울 때까지 앞 그물을 그린다(빈 화면이 없다 — 그동안 GPU에 그 그물이 두 벌). 고르기·측정·범위는 처음부터 새 그물로 한다.
  8 MB 이하이거나 `incremental`을 주지 않으면 한 번에 올린다. `toBlob`·`renderImage`는 남은 조각을 채운 뒤 그린다. `onProgress`는 장면 나눠 올리기만 알린다
- `setScene(…, { incremental })`로 장면을 나눠 올리는 동안 부르면: 이미 올린 그물은 바로 바꾸거나 빼고, 아직 차례가 오지 않은 그물은 새 그물이 그 차례에 올라간다
- `vertices` 구간 올리기는 작아서 늘 바로 한다

### 비용

비용은 이 판에서 아직 재지 않았다. `npm run bench:edit -- --reps 5`로 선분 30만 + 격자 1024²에서 `setScene` 장면 전체 · `setMesh` 그물 전체 · `vertices` 구간을
SwiftShader와 기계 GPU로 잴 수 있다. 이 판을 낼 때 로컬 확인 도구를 쓸 수 없어서, 표는 다음 판에 싣는다.

### 앱이 할 일

- NC(소재 깎기 시뮬레이션): 지금은 조각 그물이 바뀔 때마다 `composeSimScene`으로 장면 전체를 만들어 `setScene`(카메라 지킴)하고, 그 값이 비싸서 "걸린 시간 × 4"마다로
  묶고 측정·정밀 조준 중에는 미룬다. 0.11.0에서는 시뮬레이션을 켤 때 한 번만 `setScene(composeSimScene(…))`로 조각·옆면·바닥 그물이 든 장면을 주고
  (공구 경로 선분은 늘 장면에 두고 "공구 경로도 보이기"는 `setGroupVisible`로), 워커가 조각을 보낼 때마다 그 조각만 `viewer.setMesh(mesh)`(같은 id
  `sim-tile-x-y`, 워커가 넘긴 새 배열, 같은 크기 조각은 `indexCache`의 같은 색인 — 색인 버퍼는 다시 올리지 않는다)로 바꾼다. 옆면·바닥도 `setMesh`.
  공구 경로 버퍼·BVH를 건드리지 않고 측정 점·미리 보기도 지키므로 `holdScene` 미루기와 `minGap` 묶기는 뺄 수 있다(한 프레임에 조각 몇 개씩만 바꾸고 싶으면 남겨도 된다).
  시뮬레이션을 끄면 조각을 `removeMesh`하고 공작물 상자를 `setMesh`로 되돌리거나 문서 장면을 `setScene(…, { keepView: true })`로 다시 준다.
  `composeSimScene`이 `bounds`를 주므로 장면 범위(격자·단면 눈금)는 그 값 그대로다
- 조각으로 나누지 않은 큰 높이 그물 하나를 쓰는 앱은 배열을 제자리에서 고치고 바뀐 마디 줄을 `vertices`로 준다(새 배열을 통째로 줄 때는 `incremental`)

```ts
// NC: 시뮬레이션을 켤 때 한 번
viewer.setScene(composeSimScene(doc.scene, [...tiles, walls, bottom], true, stockBox), { keepView: true });
// 워커가 바뀐 조각을 보낼 때마다(장면 전체를 다시 올리지 않는다)
for (const t of msg.tiles) viewer.setMesh(this.mesh(`sim-tile-${t.tx}-${t.ty}`, t, this.indices(t.cols, t.rows, t.flat)));
if (msg.walls) viewer.setMesh(this.mesh('sim-walls', msg.walls, msg.walls.indices));
// 공구 경로 보이기
viewer.setGroupVisible(pathGroup, prefs.paths);
// 큰 높이 그물 하나를 제자리에서 고칠 때: 줄 j0..j1(법선 때문에 위아래 한 줄씩 넓혀)
viewer.setMesh(grid, { vertices: { start: Math.max(0, j0 - 1) * nx, count: (Math.min(ny - 1, j1 + 1) - Math.max(0, j0 - 1) + 1) * nx } });
```

## 0.12.0: 모서리 끝에서 그 모서리 방향 잠그기·앱이 정한 방향 잠금·찍은 측정 점·거리 글상자 자리

새 API를 쓰지 않고 잠그지 않으면 그림·고르기·측정은 0.11.0과 화소·값까지 같다(`npm run pixels -- --base v0.11.0`: 0.11.0의 장면 90개·값 28묶음 모두 같음.
새 장면 4개·값 5묶음은 0.11.0에 없는 API라 건너뛰고, head에서 두 번 찍어 같은 것을 확인했다).
바뀐 기본 동작은 하나다. 0.11.0에서 잠글 방향이 없던 자리(모서리 끝에서 그 모서리를 따라 가리킨 점 붙잡기)에서 Shift·`setMeasureInferenceLock(true)`가 잠근다.
잠그기 전 미리 보기와 찍은 결과는 0.11.0과 같다. 세 앱이 측정 잠금을 화면에 붙이며 따로 메우던 것을 코어로 옮긴 판이다.

### 모서리 끝에서 그 모서리를 따라 가리켜도 잠그기

- 0.10.0·0.11.0은 첫 점이 모서리(선분·그물 윤곽선) 끝이고 커서가 그 모서리의 다른 끝·가운데 점·교차점 위면, 점 붙잡기가 방향 추론(축·나란함)보다 먼저라
  미리 보기에 방향이 없었다. 그래서 Shift와 `setMeasureInferenceLock(true)`가 아무것도 잠그지 못했다(벽 모서리 끝에서 높이를 잴 때 흔하다).
  NC·STEP 앱은 첫 점 뒤 마지막으로 본 방향에 기대 우회했지만, 모서리 몸통을 지나지 않고 끝점으로 바로 가면 여전히 잠기지 않았다
- 0.12.0은 미리 보기의 점 붙잡기(꼭짓점·끝점·가운데 점·중심·앱 점·교차점)나 고른 선분 위 점(붙잡지 않은 점)이 놓인 선분의 직선이 첫 점을 지나면
  그 방향으로 잠근다. 축과 나란하면 그 축(`kind: 'axis'`), 아니면 그 선분과 나란히(`kind: 'parallel'`, `edge`는 그 선분)다
  - 고른 선분을 먼저 보고, 점 붙잡기면 커서 둘레 선분(교차점·수직 발 추론이 쓰는 것과 같다 — 한 번만 구한다)도 본다. 세 모서리가 만나는 구석에서
    고르기가 다른 모서리를 골라도 첫 점을 지나는 모서리를 찾는다. 같은 직선 위 떨어진 선분(잘게 나뉜 NC 직선 이동 등)도 된다
  - 커서가 첫 점 자리(여러 모서리가 만나는 꼭짓점이라 어느 모서리인지 모른다)거나 첫 점을 지나지 않는 선분이면 잠그지 않는다.
    허용치는 그 점 깊이에서 화면 반 화소다(교차점·수직 발과 같은 눈금이라 float32 좌표도 견딘다)
  - 방향 추론(축·나란함·수직)이 있으면 예전처럼 그것이 먼저다. Shift, `setMeasureInferenceLock(true)`, 첫 점 뒤 마지막으로 본 방향(커서가 캔버스를 떠난 뒤 앱 단추)이
    모두 같은 판정을 쓴다. 나란함 추론(`inference.parallel`)을 켜지 않아도 된다
- 잠그기 전 미리 보기(`measureHoverSnap`)와 찍은 결과는 그대로다(점 붙잡기 종류, `direction` 없음). 잠근 뒤에는 0.10.0 잠금 그대로
  잠근 선 위에 찍고(`snapB`는 `'axis'`·`'parallel'`, `lockedB`), 안내선·표식도 축·나란함 잠금 그대로 그린다
- `measureHoverLock`(새 getter, `InferenceLock | null`): 지금 미리 보기에서 Shift·`setMeasureInferenceLock(true)`가 잠글 방향. 첫 점 전·측정 중이 아니면 `null`.
  상태 줄의 "Shift로 잠그기" 안내는 `measureHoverSnap.direction` 대신 이것으로 보인다. 순수 함수 `edgeLineLock`(`opencad-viewer3d/inference`)

### 앱이 정한 방향으로 잠그기

- `setMeasureInferenceLock({ direction, edge?, kind? })`(`InferenceLockInput`): 앱이 정한 방향(앱이 아는 모서리, 곡선의 접선 등)으로 잠근다. 축 이름처럼 첫 점을 찍기 전에 줘도 된다
  - `direction`은 길이와 상관없다. 없으면 `edge`의 첫 끝점에서 둘째 끝점 쪽이다
  - `kind`가 없으면 축과 나란한 방향은 그 축(`'axis'` — +X·+Y·+Z로 바꾸고 축 색 안내선), 아니면 `'parallel'`(자홍 안내선)이다. `'perpendicular'`도 줄 수 있다
  - `edge`를 주면 잠근 동안 그 선분을 자홍 점선으로 그린다(나란함 잠금과 같다). `measureHoverSnap.edge`·`measureInferenceLock.edge`에도 실린다
- 방향이 길이 0이거나 수가 아닐 때, 축과 나란하지 않은데 `kind: 'axis'`일 때, 모르는 종류, 수가 아닌 `edge`면 잠그지 않고 `false`를 돌려준다(앞 잠금은 그대로).
  순수 함수 `directionLock`
- 풀리는 때는 0.10.0 그대로다(두 점째, 측정 지우기, 붙잡기 선택 바꾸기, `setMeasureInferenceLock(false)`). `measureInferenceLock.source`는 `'api'`

### 찍은 측정 점 읽기

- `measurePoints`(`MeasurePoint[]` — 0~2개, 찍은 차례, 복사본): `{ point, snap, axis?, direction?, locked? }`. `measurePointCount === 1`일 때 첫 점의 세계 좌표와
  붙잡은 종류를 읽어, 앱이 그 점에서 잠글 방향을 정하거나 표시를 붙인다. 붙잡기 선택이 없어도 0.7.2 규칙의 종류(`'vertex'`·`'endpoint'`·`null`)가 실린다.
  두 점이면 `measurement()`의 `a`·`b`와 같은 점이다

### 코어 거리 글상자 자리

- `measureLabelRect`(`MeasureLabelRect | null`): 마지막으로 화면에 그린 측정 거리 글상자(첫 점과 미리 보기 또는 두 점째 사이)의 자리.
  캔버스 왼쪽 위 기준 CSS 화소 `{ x, y, width, height }`이고, 그리지 않았으면 `null`이다
- 글상자는 두 점의 화면 가운데에서 오른쪽으로 10화소, 위로 8화소 띄워 그리고 캔버스 밖으로 나가면 안으로 당긴다. 커서가 첫 점 가까이 있으면
  커서 옆에 그린 앱 툴팁과 겹칠 수 있다. 앱은 툴팁 자리를 정할 때 이 상자와 겹치면 반대쪽으로 옮긴다
- 그리기는 requestAnimationFrame에서 하므로 미리 보기가 바뀐 다음 프레임(또는 `renderNow()` 뒤)에 읽는다. 그림 저장(`toBlob`·`renderImage`)의 덧그림은 이 값을 바꾸지 않는다.
  코어 글상자를 앱 툴팁에 맞춰 옮기는 선택은 두지 않았다(코어는 앱 툴팁의 크기를 모른다 — 0.13.0에서 앱이 자리를 알려 주는 `setMeasureLabelAvoid`를 더했다)

```ts
// 상태 줄: 잠글 수 있으면 안내(0.10.0 예의 h.direction 대신)
const h = viewer.measureHoverSnap;
const name = !h?.snap ? '' : h.snap === 'axis' ? `${h.axis!.toUpperCase()}축 방향` : KIND[h.snap];
status.textContent = name && (h!.locked ? `${name} (잠금)` : viewer.measureHoverLock ? `${name} — Shift로 잠그기` : name);
// 앱 단추: 앱이 아는 첫 점의 모서리(곡선이면 접선) 방향으로
const [first] = viewer.measurePoints;
if (first) viewer.setMeasureInferenceLock({ direction: tangentAt(first.point) });
// 툴팁(커서 오른쪽 아래)이 코어 거리 글상자와 겹치면 커서 왼쪽 위로
const r = viewer.measureLabelRect;
if (r && tipX < r.x + r.width && r.x < tipX + tipW && tipY < r.y + r.height && r.y < tipY + tipH) [tipX, tipY] = [sx - tipW - 12, sy - tipH - 12];
```

### 앱이 할 일

- 세 앱: 코어를 `#v0.12.0`으로 올린다. 새로 보이는 글은 없다(잠금은 0.10.0의 축·나란함 이름 그대로)
- NC(`src/app/measure-lock.ts`): `shiftDown`이 코어 대신 거는 잠금(`setMeasureInferenceLock(true)` 뒤 `from`을 보고 푸는 것)과 `shiftLock`·`shiftUp`을 뺀다.
  코어 Shift가 직접 잠그고 떼면 푼다. 잠금 단추·↓ 키는 `setMeasureInferenceLock(true)`만 부르고, 거짓이면 "잠글 방향이 없습니다"를 띄운다.
  툴팁 자리를 정할 때 `measureLabelRect`와 겹치면 옮긴다
- STEP(`src/app/snap.ts`): `lockMeasure`가 확인할 점을 돌려주는 것과 `lockStillValid`·`shiftFallbackLock`을 뺀다(`setMeasureInferenceLock(true)`의 참·거짓만 본다).
  `LockViewer`에 `measureHoverLock`을 더해 "Shift·화살표로 방향 잠금" 안내를 잠글 방향이 있을 때만 보일 수 있다
- SKP: 줄자·각도기는 코어 측정을 쓰지 않고 앱 추정(`src/app/snap.ts`의 `edgeLineLock`)으로 이미 고쳤으므로 바꿀 것이 없다.
  같은 판정을 코어 순수 함수 `edgeLineLock(첫 점, 점, [모서리, 다른 선분], 허용치)`로 바꿔 쓸 수는 있다(허용치를 세계 길이로 준다 — 앱은 지금 상대 1e-6)

## 0.13.0: 측정 거리 글상자가 앱 십자선·툴팁과 커서를 비켜 그리기

`setMeasureLabelAvoid`를 부르지 않으면 그림·고르기·측정은 0.12.0과 화소·값까지 같다(`npm run pixels -- --base v0.12.0`: 0.12.0으로도 찍을 수 있는 장면 95개·값 33묶음 모두 같음.
그 가운데 화면 덧그림의 기본 자리 장면 하나는 이번에 더했다. 새 장면 3개·값 1묶음은 0.12.0에 없는 API라 건너뛰고, head에서 두 번 찍어 같은 것을 확인했다).
바뀐 기본 동작은 없다.

0.12.0까지 코어 거리 글상자는 늘 두 점 화면 가운데의 오른쪽 위에 그렸다. 휴대폰의 정밀 조준 십자선(앱이 손가락 위에 띄워 그린다)은
커서 자리라 옮길 수 없는데, 첫 점 가까이를 가리키면 이 십자선이 글상자 왼쪽을 가렸다. 0.12.0의 `measureLabelRect`로는 앱이 제 툴팁만 옮길 수 있었다.
코어는 앱 십자선·툴팁의 크기를 모르므로, 앱이 그 자리를 알려 주면 코어 글상자가 비켜 그리게 했다.

### 피할 자리 알려 주기

- `setMeasureLabelAvoid(avoid: MeasureLabelAvoid | MeasureLabelRect[] | null)`. `MeasureLabelAvoid`는 `{ rects?, pointerRadius? }`이다
  - `rects`: 피할 화면 사각형(캔버스 왼쪽 위 기준 CSS 화소 `{ x, y, width, height }` — 앱이 그린 십자선·손가락·툴팁 자리). 사각형 목록만 줘도 된다.
    수가 아니거나 너비·높이가 0 이하인 것은 버린다
  - `pointerRadius`: 측정 커서 둘레에서 피할 반지름(CSS 화소). 커서는 코어가 미리 보기를 구한 포인터 자리다(앱이 십자선 자리로 포인터 사건을 보내면 십자선 가운데).
    미리 보기가 있을 때만 본다
  - 앱 십자선·툴팁이 움직일 때마다 다시 준다(같은 값이면 다시 그리지 않는다). `null`이나 빈 값이면 끈다(0.12.0과 같은 자리). 측정을 지우거나 측정 모드를 꺼도 남는다
  - `measureLabelAvoid`(getter): 고른 값의 복사본, 꺼져 있으면 `null`
- 자리는 이 차례로 보고, 겹치지 않는 첫 자리에 그린다(순수 함수 `placeMeasureLabel` — `opencad-viewer3d/measurelabel`)
  1. 기본 자리(두 점 화면 가운데에서 오른쪽 10·위 8, 캔버스 안으로 당김)가 피할 자리와 겹치지 않으면 옮기지 않는다
  2. 같은 기준점의 왼쪽 위 → 오른쪽 아래 → 왼쪽 아래
  3. 두 점을 잇는 화면 선분을 따라 첫 점 쪽 1/4 → 둘째 점 쪽 1/4 → 첫 점 → 둘째 점 자리에서 같은 네 귀(오른쪽 위부터)
  4. 피할 자리마다 바로 위·아래(기본 자리에서 세로로 가까운 것부터, 가로는 기본 자리 → 왼쪽 위). 선분이 짧아 커서가 기준점 바로 옆이면 앞의 자리가 모두 걸린다
  5. 모두 겹치면 기본 자리
  - 옮길 때는 두 측정 점 표식(반지름 6화소)도 가리지 않는 자리를 먼저 고르고, 그런 자리가 없으면 피할 자리만 비켜 간 첫 자리에 둔다.
    옮길지 말지는 앱이 준 자리와 커서로만 정한다(기본 자리가 점 표식에 걸쳐도 0.12.0처럼 그대로 둔다)
- `measureLabelRect`는 실제로 그린(옮긴) 자리를 돌려준다
- 화면 덧그림에만 쓴다. 그림 저장(`toBlob`·`renderImage`)은 앱 십자선·툴팁이 없는 그림이라 기본 자리에 그린다.
  선택 없이 부른 `toBlob()`은 화면 덧그림을 그대로 붙이는데, 글상자를 옮겨 그렸을 때만 덧그림을 기본 자리로 다시 그린다

```ts
// STEP 정밀 조준: 십자선(48화소)을 손가락 위 64화소에 띄우고 코어에는 십자선 가운데로 펜 포인터를 보낸다.
// 십자선은 커서 둘레(반지름 24)로, 손가락은 사각형으로(ax·ay = 십자선 가운데의 캔버스 기준 자리 — 옮길 때마다 다시)
viewer.setMeasureLabelAvoid({ pointerRadius: 24, rects: [{ x: ax - 22, y: ay + 64 - 22, width: 44, height: 44 }] });
viewer.setMeasureLabelAvoid(null); // 조준을 마치면
// NC 툴팁: 툴팁이 먼저 서려는 자리(붙잡을 점 오른쪽 아래)를 넘긴다. 코어 글상자가 먼저 비키고, 그래도 겹치면 placeTip이 예전처럼 툴팁을 옮긴다
viewer.setMeasureLabelAvoid([{ x: px + 12, y: py + 12, width: tipW, height: tipH }]);
```

### 앱이 할 일

- 세 앱: 코어를 `#v0.13.0`으로 올린다. 새로 보이는 글은 없다
- STEP(`src/app/aim.ts` 정밀 조준): 조준을 시작하거나 십자선을 옮길 때 십자선 반지름(`pointerRadius: 24` — `.aim-reticle` 48화소의 반)과 손가락 자리 사각형을 넘기고,
  조준을 마치면 `null`을 준다. 십자선 자리로 펜 `pointermove`를 보내는 같은 처리 안에서 부르면 같은 프레임에 반영된다.
  마우스로 쓸 때는 커서가 작으므로 조준 중에만 켠다
- NC(`src/app/measure-lock.ts`): 툴팁을 띄울 때 `placeTip`의 첫 자리(점 오른쪽 아래)를 캔버스 기준으로 바꿔 넘기고, 툴팁을 숨기면 `null`을 준다.
  `measureLabelRect`를 읽어 툴팁을 옮기는 `placeTip`은 그대로 둬도 된다. 넘기는 자리가 코어 글상자와 상관없이 정해지므로 둘이 서로를 쫓지 않고,
  코어가 비킬 자리를 못 찾았을 때만 툴팁이 옮긴다. 툴팁 자리는 그리기 뒤에 정하므로 코어 글상자는 다음 프레임에 비킨다
- SKP: 줄자·각도기는 코어 측정 글상자를 쓰지 않으므로 바꿀 것이 없다

## 0.14.0: 측정 붙잡기 점을 앱이 정확한 형상 위로 다듬기

`refine`을 주지 않으면 그림·고르기·측정은 0.13.0과 화소·값까지 같다(`npm run pixels -- --base v0.13.0`: 0.13.0의 장면 98개·값 34묶음 모두 같음.
새 값 묶음 `arc-measure-refine` 하나는 0.13.0에 없는 선택이라 건너뛰고, head에서 두 번 찍어 같은 것을 확인했다).
바뀐 기본 동작은 없다.

0.13.0까지 코어 측정 붙잡기는 화면용 꺾은선 토막만 보았다. STEP처럼 B-rep 곡선(원·타원·B-스플라인)의 정확한 정의를 아는 앱에서도
첫 점에서 곡선 모서리로 내린 수직 발, 커서 아래 모서리 위 점, 코어가 고른 모서리 가운데 점이 곡선이 아니라 꺾은선 토막(현) 위에 찍혀
현의 처짐만큼 어긋났다. 앱이 `pointsFor`로 정확한 점을 더해도 어느 쪽이 붙을지가 커서 자리에 따라 갈렸고, 코어가 고른 점을 앱이 고칠 길이 없었다.

### 다듬기 손잡이

- `setMeasureSnap({ …, refine })`(`MeasureSnapOptions.refine` — `(c: SnapRefineInput) => readonly number[] | null | undefined`): 코어가 붙잡을 점을 고른 뒤
  (그리기·찍기 전) 그 점이 아래 세 종류면 한 번 부른다. 앱이 세계 점을 돌려주면 그 점을 붙잡은 점으로 쓴다 — 표식 자리, 찍은 점, 거리와 dx dy dz,
  `measurePoints`, `measureHoverSnap`, 측정 글 꼴이 받는 값 모두. `null`·`undefined`나 수 셋이 아닌 값이면 코어 점 그대로다
  - `'perpendicular'`: 첫 점에서 커서 둘레 선분으로 내린 수직 발(`inference.perpendicular`). 다듬으면 방향(`directionB`, 잠글 때 쓰는 첫 점 → 발)도 다듬은 발 쪽이다
  - `'midpoint'`: 코어가 붙잡은 선분 가운데 점(`midpoints`). 앱 점(`pointsFor`)의 가운데 점은 넘기지 않는다
  - `'onEdge'`: 붙잡지 않은 선분·윤곽선 위 점(커서 아래 선 위 아무 점)
- 넘기는 것은 `SnapRefineInput` `{ kind, point, segment, first, ray }`이다(모두 복사본, 세계 좌표)
  - `point`: 코어가 고른 점(꺾은선 토막 위)
  - `segment`(`SnapSegment`): `{ kind: 'line' | 'edge', id, index, raw, ends }`. 고르기 결과(`Pick3d`)와 같은 식별자다 — 선분 묶음의 `index`는 `segmentIds`를 거친 값,
    윤곽선의 `index`는 `Mesh3d.edges`의 선분 번호, `raw`는 배열 안 번호, `ends`는 그 토막의 세계 끝점 둘. STEP은 `pointsFor`에서 쓰던 `edgeAt(table, raw)`로 B-rep 모서리를 찾는다
  - `first`: 첫 측정 점(없으면 `null`). `ray`: 커서 광선 `{ origin, dir }`(원점은 가까운 면 위, 방향은 단위). 모서리 위 점은 곡선에서 이 광선에 가장 가까운 점으로 다듬는다
- 넘기지 않는 것과 까닭
  - 끝점·꼭짓점: 해석기가 곡선 위 점으로 꺾은선을 나누므로 이미 곡선 위다
  - 중심과 앱 점(`points`·`pointsFor`): 앱이 정한 점이라 처음부터 정확히 준다
  - 교차점: 두 토막이 걸려 앱이 두 곡선을 함께 풀어야 한다(0.15.0부터 넘긴다)
  - 축·나란함: 첫 점을 지나는 직선 위 점이라 모서리 형상과 상관없다. 그물 면 위 점도 넘기지 않는다
- 안전장치: 다듬은 점이 코어 점에서 화면으로 붙잡기 거리(마우스·펜 10화소, 터치 `max(10, touchPickTolerance)`)를 넘거나, 눈 뒤·가까운 면 앞이거나,
  그 묶음의 단면에 잘린 쪽이면 버리고 코어 점을 쓴다. 앱이 다른 모서리를 잘못 찾아 먼 점을 돌려줘도 표식이 커서에서 튀지 않는다.
  가림은 다시 따지지 않는다(곡선 위 점은 꺾은선으로 만든 면에서 처짐만큼 벗어나 면 깊이와 어긋날 수 있다. 코어 점이 보이므로 그 바로 둘레다)
- 받았으면 `measureHoverSnap.refined`·`MeasurePoint.refined`가 `true`이고, 아니면 이 필드가 없다. 측정 결과(`MeasureResult`)에는 싣지 않는다
- `refine`만 줘도 붙잡기가 켜진다(`pointsFor`처럼 — 측정 결과에 `snapA`·`snapB`가 실린다). `measureSnap`은 준 함수를 그대로 돌려준다
- 순수 함수 `refineTarget`·`finitePoint`·`acceptRefined`·`sameRefineInput`(`opencad-viewer3d/snap`)

### 차례

- 추론 잠금(Shift·`setMeasureInferenceLock`) 중에는 부르지 않고 잠근 선 위 점이 먼저다. 잠근 선은 첫 점과 방향으로 정해지고, 커서 아래 붙잡은 점은
  그 선 위 자리만 정한다(선에 수직으로 내린다). 곡선의 접선 방향이 필요하면 앱이 잠글 방향(`setMeasureInferenceLock({ direction })`)으로 이미 정확히 준다.
  풀면 다음 미리 보기부터 다시 다듬는다
- 붙잡을 점 고르기는 0.13.0 그대로 코어 점으로 화면 거리를 견준다. 다듬기는 고른 뒤 그 한 점에만 한다(다듬은 점으로 후보를 다시 견주지 않는다).
  그래서 어느 종류가 붙을지는 0.13.0과 같고, 앱 함수는 미리 보기 한 번에 많아야 한 번 불린다
- 점 붙잡기가 없을 때 축·나란함이 이기면 부르지 않는다(모서리 위 점보다 먼저 — 0.13.0 차례)
- 모서리 끝 선분 방향 잠금(0.12.0 `measureHoverLock`)은 코어 점으로 판정한다. 다듬어도 잠글 방향은 0.13.0과 같다
- 바로 앞 호출과 입력(종류·코어 점·토막·첫 점·커서 광선)이 같으면 다시 부르지 않고 앞 결과를 쓴다(같은 자리에서 미리 본 뒤 누르기 — 미리 본 점이 그대로 찍힌다).
  기억은 `setMeasureSnap`마다 새로 한다. 결과는 넘긴 값으로만 정해져야 한다(앱 자료가 바뀌면 `setMeasureSnap`을 다시 준다)

```ts
// STEP: 모서리 표의 곡선 정의로 다듬는다(curveAt·closestToRay·footFrom·pointAt·paramOf는 앱이 만들 함수)
viewer.setMeasureSnap({
  ...measureSnapOptions(meshes, edges, centers),
  refine: (c) => {
    if (c.segment.kind !== 'edge') return null;
    const curve = curveAt(c.segment.id, edgeAt(table, c.segment.raw)); // 곧은 모서리면 null
    if (!curve) return null;
    if (c.kind === 'onEdge') return closestToRay(curve, c.ray);
    if (c.kind === 'midpoint') return curve.pointAt((paramOf(curve, c.segment.ends[0]) + paramOf(curve, c.segment.ends[1])) / 2);
    return footFrom(curve, c.first!, paramOf(curve, c.point)); // 코어 발 자리에서 시작하는 뉴턴 반복
  },
});
viewer.onMeasure((m) => m && console.log(m.distance)); // 곡선 위 발까지의 정확한 거리
const h = viewer.measureHoverSnap;
if (h?.refined) status.textContent += ' (곡선 위)';
```

### 앱이 할 일

- STEP: 코어를 `#v0.14.0`으로 올리고 `refine`을 준다. 모서리 표(`edgeAt`과 곡선 매개변수)로 곡선 모서리를 찾아 수직 발(첫 점에서 곡선으로 — 코어 발 자리에서 시작하는 반복),
  모서리 위 점(커서 광선에 가장 가까운 곡선 위 점), 코어 가운데 점(그 토막 두 끝 매개변수 가운데의 곡선 위 점)을 돌려주고, 곧은 모서리는 `null`을 준다.
  지금은 코어 `midpoints`를 꺼 두었으므로 `'midpoint'`는 오지 않는다. `pointsFor`의 곡선 가운데 점(`edges.ts`의 `mid`)은 꺾은선 길이로 잰 점이라,
  같은 곡선 정의로 바꾸면 곡선 위에 온다(앱 점은 다듬기를 거치지 않는다). 새로 보이는 글을 더하면(예: "곡선 위") 앱 사전(en·ja·zh-CN·de)에 넣는다
- NC·SKP: 할 일이 없다. NC 공구 경로는 해석기가 직선·원호를 나눈 선분이고 원호 중심은 이미 앱 점으로 준다. SKP 곡선은 모형이 가진 선분 그대로라
  코어 점이 정확한 값이다. 코어를 `#v0.14.0`으로 올려도 값이 같다

## 0.15.0: 멀리서 내린 곡선 위 수직 발과 두 곡선의 교차점 다듬기

`refine`을 주지 않으면 그림·고르기·측정은 0.14.0과 화소·값까지 같다(`npm run pixels -- --base v0.14.0`: 0.14.0의 장면 98개·값 35묶음 모두 같음.
0.14.0 종류의 다듬기 호출과 결과를 보는 `arc-measure-refine`도 같다. 새 값 묶음 `arc2-measure-open` 하나는 0.14.0에 없는 동작이라 건너뛰고, head에서 두 번 찍어 같은 것을 확인했다).
`refine`을 준 앱에서만 아래 두 가지가 새로 붙는다. `refine`이 `null`만 돌려주면 0.14.0과 같다.

0.14.0 `refine`은 코어가 이미 고른 점만 다듬었다. 그래서 두 빈틈이 남았다.

- 첫 점이 곡선에서 멀거나 꺾은선 나눔이 성기면 첫 점에서 꺾은선 토막에 내린 발이 늘 토막 밖으로 떨어진다(멀리서 보면 토막 방향이 조금만 틀어져도 발이 멀리 간다).
  곡선 위 진짜 발 둘레에 수직 발 후보가 없어 다듬을 기회도 없었다
- 두 곡선 모서리의 교차점은 넘기지 않아 꺾은선끼리의 교차점(현의 처짐만큼 어긋남) 그대로였다. 다른 평면의 두 곡선은 꺾은선끼리 3D로 비켜 지나가 교차점 후보조차 없었다

### 열린 수직 발

- `refine`이 있고 `inference.perpendicular`를 켰으면, 첫 점에서 내린 발이 토막 밖(또는 끝점에서 반 화소 안)이라 보통 수직 발이 없는 커서 둘레 토막도 앱에 넘긴다
  (`kind: 'perpendicular'`, `open: true`). `point`는 그 발을 토막 범위로 자른 토막 끝이다. 꺾은선 꼭짓점이라 곡선 위 점이고, 곡선 위 발은 그쪽에 있다.
  커서와 상관없이 첫 점과 토막만으로 정해지므로 커서가 움직여도 입력이 같다(기억이 맞는다)
- 앱이 곡선 위 발을 돌려주면 그 점이 붙잡기 후보가 된다. 받기 규칙은 다른 후보와 같다. 커서에서 붙잡기 거리 안이고, 눈 뒤·가까운 면 앞이 아니고,
  그 묶음 단면에서 남는 쪽이고, 음영 계열에서 면에 가리지 않아야 한다. `null`(모른다)이거나 코어 점을 그대로(반 화소 안) 돌려주면 후보가 없다
- 같은 곡선의 이웃 토막에서 같은 발이 여러 번 나오면(반 화소 안) 커서에 가까운 토막 것 하나만 남긴다
- 붙잡은 뒤는 0.14.0의 다듬은 수직 발과 같다. `snap: 'perpendicular'`, `refined: true`이고, 방향(`directionB`·잠글 방향)은 첫 점에서 곡선 위 발 쪽, 기준 선분(`edge`)은 그 토막이다

### 교차점 다듬기

- `SnapRefineKind`에 `'intersection'`을, `SnapRefineInput`에 둘째 토막 `other?: SnapSegment`(교차점일 때만)를 더했다. 열린 후보에는 `open: true`가 붙는다
- 코어 교차점(두 토막이 화면 반 화소 안에서 만난다 — 0.9.0): 고른 뒤 0.14.0 수직 발처럼 한 번 넘긴다. 앱이 두 곡선의 정확한 교차점을 주면 그 점을 쓴다(`refined: true`).
  받기 규칙도 같다(코어 점에서 화면 붙잡기 거리 안, 두 묶음 모두 단면에서 남는 쪽). `null`이면 꺾은선 교차점 그대로다
- 넓힌 교차(열린 후보): 반 화소로는 만나지 않지만 토막 범위 안의 가장 가까운 두 점이 `min(0.1 × 두 토막 길이 합, 그 깊이에서 붙잡기 거리의 세계 길이)` 안이면
  두 점의 가운데를 `point`로 넘긴다
  - 0.1의 근거: 한 토막이 45°보다 덜 도는 꺾은선이면 현과 곡선 사이(활꼴 높이 = 현 길이 / 2 × tan(돈 각 / 4))는 현 길이의 0.1배 안이다.
    두 곡선이 만나는 자리에서 두 꺾은선 사이 틈은 두 토막 길이 합의 0.1배 안이다
  - 붙잡기 거리로 자르는 까닭: 그보다 크게 어긋나는 꺾은선은 다듬은 점이 커서에서 붙잡기 거리 밖이기 쉬워 헛 호출만 는다
  - 앱이 정확한 교차점을 줄 때만 후보가 되고(받기 규칙은 열린 수직 발과 같다), `null`이면 버린다. 그래서 `refine`이 없거나 `null`만 돌려주면 0.14.0과 같다
  - 꼭짓점을 함께 쓰는 이웃 토막(가운데가 끝점에서 반 화소 안)과 나란한 토막은 넓히지 않는다

### 차례

- 후보는 모두 커서에서 화면 거리로 견준다(가까운 것이 붙는다). 열린 후보는 코어 점의 뜻이 약하므로(토막 끝, 두 토막 사이 가운데) 앱이 다듬은 점으로 잰다.
  다른 후보는 0.14.0 그대로 코어 점으로 재고, 고른 뒤 그 한 점만 다듬는다
- 거리가 같으면 앞의 것이 이긴다: 고르기가 붙잡은 꼭짓점·끝점·가운데 점 → 앱 점(`points`·`pointsFor`) → 교차점 → 수직 발 → 넓힌 교차점 → 열린 수직 발.
  열린 후보끼리는 커서에 가까운 토막 것부터다(교차점은 두 토막 가운데 커서에서 먼 쪽의 차례)
- 열린 후보도 점 붙잡기다. 붙으면 축·나란함은 쓰지 않는다(0.9.0 규칙)
- 잠금(Shift·`setMeasureInferenceLock`) 중에는 열린 후보를 만들지 않고 앱 함수도 부르지 않는다(0.14.0처럼 잠근 선 위 점이 먼저다)
- 모서리 끝 선분 방향 잠금(0.12.0)은 넓힌 교차점이면 다듬기 전 코어 점으로 판정한다(0.14.0처럼 코어 점으로)

### 호출 한도와 기억

- 열린 후보는 미리 보기(측정 점 고르기) 한 번에 앱 함수를 새로 많아야 `OPEN_REFINE_CALLS`(6)번 부른다. 커서에 가까운 토막 것이 먼저 쓰고, 남은 것은 다음 미리 보기에서 부른다
- 결과는 커서 광선을 뺀 입력(종류·코어 점·토막·둘째 토막·첫 점)으로 기억한다(`RefineMemo` — 256개, 오래 쓰지 않은 것부터 지운다, `setMeasureSnap`마다 새로).
  커서가 같은 곡선 둘레를 지나가는 동안에는 다시 부르지 않는다. 그래서 열린 후보의 결과는 커서 광선에 따라 달라지면 안 된다
- 코어 점 후보(0.14.0 종류와 코어 교차점)는 0.14.0처럼 바로 앞 입력 하나만 기억한다
- 비용: 가짜 WebGL 시험 환경에서 원 100개(48토막씩, 윤곽선 4,800개)와 곧은 선분 위로 커서를 400번 옮기며 첫 점에서 측정 점을 골랐다(기억을 비우고 세 번).
  한 번 평균이 `refine` 없이 0.06~0.08 ms, `null`만 돌려주는 함수 0.10~0.12 ms(이동마다 1.2번 부름), 정확한 원 0.09~0.10 ms(이동마다 1.0번)다.
  한 프레임(16 ms)에 견주면 드러나지 않는다. 화소 비교의 `arc2-measure-open`에서 원을 따라 96번 옮길 때 이동 한 번에 많아야 5번, 같은 길을 다시 지나가면 0번 불렀다
- 순수 함수: `openFoot`·`looseIntersection`·`openCandidates`(`opencad-viewer3d/inference`), `refineOpen`·`RefineMemo`·`openRefineKey`(`opencad-viewer3d/snap`)

```ts
// STEP: 0.14.0 refine에 교차점을 더한다(curveOf·intersectNear는 앱이 만들 함수)
viewer.setMeasureSnap({
  ...measureSnapOptions(meshes, edges, centers),
  refine: (c) => {
    if (c.kind === 'intersection') {
      const a = curveOf(c.segment), b = c.other && curveOf(c.other); // 곧은 모서리는 직선
      return a && b ? intersectNear(a, b, c.point) : null; // point 둘레의 3D 교차점, 만나지 않으면 null
    }
    return refineSnap(c); // 0.14.0 그대로 — 열린 수직 발(c.open)도 같은 계산(point가 토막 끝일 뿐)
  },
});
```

### 앱이 할 일

- STEP: 코어를 `#v0.15.0`으로 올린다
  - 지금 `refineSnap`(`curvesnap.ts`)은 `'midpoint'`·`'perpendicular'`가 아닌 종류를 모두 모서리 위 점처럼 푼다. `'intersection'`이 그 길로 가면
    교차점이 아닌 곡선 위 점(커서 광선에 가장 가까운 점)을 돌려주므로, 올리기 전에 `'intersection'`을 먼저 가른다(못 풀면 `null`)
  - 멀리서 내린 곡선 위 수직 발: 할 일이 거의 없다. `'perpendicular'`는 이미 토막 k 둘레(앞뒤 두 토막)의 곡선에서 (C − F)·C′ = 0인 매개변수 가운데 `point`에 가장 가까운 것을 찾는다.
    열린 후보는 `point`가 토막 끝일 뿐 같은 계산이고, 둘레에 근이 없으면 지금처럼 `null`이다. 결과가 광선과 상관없으므로 기억 약속도 지킨다
  - 두 B-rep 곡선의 교차점: `segment`·`other`가 모두 윤곽선이면 두 모서리 곡선(곧은 모서리는 직선)의 교차를 `point` 둘레에서 푼다(두 매개변수 뉴턴, 또는 한 곡선
    표본에서 다른 곡선까지 거리의 극소). 두 곡선 사이가 허용치보다 멀면(3D로 만나지 않는다) `null`, 같은 모서리이거나 꼭짓점에서 만나는 두 모서리의 그 끝도 `null`이다
  - 새로 보이는 글은 없다(교차점 이름은 0.9.0부터 있다)
- NC: `refine`을 주는 판이면 STEP과 같이 `'intersection'`을 먼저 가른다(못 풀면 `null`). 다른 종류를 모서리 위 점처럼 풀면 교차점이 아닌 점이 붙는다.
  열린 수직 발(`open`)은 0.14.0 `'perpendicular'` 계산이 그대로 맞으면 할 일이 없다. 원호(G2/G3·판재 윤곽 호)와 직선의 교차점은 식으로 풀린다.
  `refine`을 주지 않는 판은 코어를 올려도 값이 같다
- SKP: 할 일이 없다(곡선이 모형 선분 그대로라 코어 점이 정확한 값이다)

## 0.16.0: 붙잡은 선분 식별자·다른 점에서 끌어온 축

`inference.track`을 켜지 않으면 그림·고르기·측정은 0.15.0과 화소·값까지 같다(`npm run pixels -- --base v0.15.0`: 0.15.0의 장면 98개·값 36묶음 모두 같음.
새 장면 3개(`base-measure-track-*`)·값 3묶음(`cross-measure-segments`, `base·off-measure-track`)은 0.15.0에 없는 API라 건너뛰고, head에서 두 번 찍어 같은 것을 확인했다).
바뀐 기본 동작은 없다. 미리 보기와 찍은 점(`measureHoverSnap`·`measurePoints`)에 필드가 더해질 뿐이고, 측정 결과(`MeasureResult`)는 그대로다.

### 붙잡은 선분 식별자

0.15.0까지 NC·STEP 앱은 첫 점이 놓인 곡선을 찾으려고 찍은 점 좌표를 꼭짓점·토막 끝과 다시 견줬다. 코어는 붙잡을 때 이미 그 선분을 알고 있었다.

- `MeasureHoverSnap.segment`·`MeasurePoint.segment`(`SnapSegment` — 0.14.0 다듬기 입력과 같은 꼴 `{ kind, id, index, raw, ends }`, 복사본)와 교차점의 둘째 선분 `other`.
  앱은 `pointsFor`·`refine`에서 쓰던 찾기(묶음 id와 원본 번호 → 앱의 이동·모서리 표)를 그대로 쓴다
- 어느 점에 싣는지와 까닭

  | 붙잡은 점 | `segment` | `other` | 까닭 |
  |---|---|---|---|
  | 끝점 | 고르기가 고른 선분 하나 | 없음 | 꺾은선 꼭짓점은 두 토막이 함께 쓴다. 커서에 가까운 쪽(고르기가 고른 쪽)을 준다. 이웃 토막이 필요하면 앱이 `raw ± 1`이나 끝점으로 찾는다 |
  | 가운데 점, 붙잡지 않은 선분·윤곽선 위 점 | 그 선분 | 없음 | 점이 그 선분 위에 있다 |
  | 수직 발(0.15.0 열린 수직 발 포함) | 발이 놓인 토막 | 없음 | 다듬기 입력과 같다 |
  | 교차점(넓힌 교차 포함) | 첫째 선분 | 둘째 선분 | 다듬기 입력(0.15.0)과 같은 차례 |
  | 앱이 다듬은 점(`refined`) | 다듬기 전 코어 점의 선분 | 교차점이면 둘째 | 앱이 다듬은 곡선이 그 선분의 곡선이다 |
  | 그물 꼭짓점·면 위 점·점 묶음의 점 | 없음 | 없음 | 선분이 아니다. 윤곽선을 고르면(`edges`) 그물 꼭짓점도 윤곽선 끝점이 되어 윤곽선 식별자가 실린다 |
  | 앱 점(`points`·`pointsFor` — 중심 등) | 없음 | 없음 | 앱이 준 점이라 앱이 이미 안다 |
  | 축·나란함·잠근 선 위 점, 끌어온 축 | 없음 | 없음 | 첫 점(또는 끌어온 점)을 지나는 선 위 점이라 형상의 선분이 아니다 |

- 붙잡기 선택(`setMeasureSnap`)이 있을 때만 싣는다(0.7.2 규칙의 측정 점에는 없다). `MeasureResult`(`onMeasure`·측정 글 꼴)에는 싣지 않는다(0.14.0 `refined`와 같다).
  `onMeasure` 안에서 읽는 `measurePoints`가 그 두 점이다
- 순수 함수 `snapSegmentsOf`·`copySegment`(`opencad-viewer3d/snap`)

```ts
// NC·STEP: 첫 점이 놓인 곡선을 식별자로 찾는다(좌표로 꼭짓점·토막 끝을 다시 견주지 않는다)
const [first] = viewer.measurePoints;
const s = first?.segment;
const curve = !s ? null : s.kind === 'edge' ? curveAt(s.id, edgeAt(table, s.raw)) : moveCurve(s.id, s.index); // 앱 표 찾기
if (curve) viewer.setMeasureInferenceLock({ direction: curve.tangentAt(first!.point) });
```

### 다른 점에서 끌어온 축

- `setMeasureSnap({ inference: { …, track } })`(`MeasureInference.track` — `true` 또는 `{ dwellMs }`, 기본 꺼짐, `inference: true`에 들지 않는다).
  `measureSnap.inference`는 켰을 때만 `track: { dwellMs }`가 붙는다
- 머무르기: 마우스·펜 커서가 점 붙잡기(꼭짓점·끝점·가운데 점·중심·앱 점·교차점·수직 발) 위에서 머물기 시작한 자리 2화소(`TRACK_DWELL_PX`) 안으로
  `dwellMs`(기본 500 ms, `TRACK_DWELL_MS`) 동안 머물면 그 점(P)을 기억한다. 최근 셋(`TRACK_MAX`)까지, 새것이 앞이고 같은 점은 앞으로 옮긴다.
  미리 보기를 구할 때 `setTimeout`을 다시 걸어 재고, 2화소를 벗어나거나 다른 점·점 붙잡기 없음·캔버스를 떠남·끌기·누르기면 버린다
  - 2화소로 정한 까닭: 붙잡기 거리(10화소) 안에서 같은 점이 붙잡혀 있는 시간으로 재면 그 점을 천천히 지나가는 커서도 기억한다. 멈춘 커서만 센다
- 터치: 머무르지 않는다. 손가락은 누른 채 움직이면 끌기이고 떼면 점을 찍으므로 "머문 커서"가 없다. 코어가 길게 누르기를 가로채면 앱의 정밀 조준과 겹친다.
  앱이 길게 누르기·단추로 고른 점을 `setMeasureTrackPoints`로 준다. 앱이 정밀 조준 십자선 자리로 보내는 펜 포인터 미리 보기는 마우스처럼 머무른다
- 붙잡기 차례(점 붙잡기가 하나도 없을 때, 앞의 것이 있으면 그것)
  1. 첫 점 축 위 나란한 자리: 첫 점 A를 지나는 X·Y·Z 축 위에서 P와 그 축 방향 자리가 같은 점, 곧 P를 그 축에 수직으로 내린 자리 A + e·((P − A)·e)가
     커서에서 붙잡기 거리 안이면 그 점이다. A와 P가 다른 좌표 하나를 함께 쓰면 A의 축과 P의 다른 축이 3D로 만나는 점이고, 아니면 0.10.0 잠금에서 P를 가리킨
     자리(`from`)와 같은 점이다. 첫 점 축 붙잡기보다 먼저다 — 축 위의 한 점이라 더 구체적이고, 이 둘레 붙잡기 거리에서는 축을 따라 움직여도 이 자리에 붙는다.
     `snap: 'axis'`, `axis`, `direction`(첫 점 축), `trackFrom: P`. 방향이 있으므로 Shift·`setMeasureInferenceLock(true)`가 그 축으로 잠근다
  2. 첫 점 축·나란함(0.9.0·0.10.0 그대로)
  3. 끌어온 축: P를 지나는 X·Y·Z 축 위에서 커서 광선에 가장 가까운 점(붙잡기 거리 안). 첫 점 전에도 된다. `snap: 'axis'`, `axis`, `trackFrom: P`.
     첫 점을 지나는 선이 아니므로 `direction`이 없고 잠그지 않는다(첫 점 축으로 잠그면 점이 다른 선으로 튄다)
  - 여러 점·축이 붙잡기 거리 안이면 커서에 가까운 것, 같으면 새 점 → X·Y·Z 차례다. 커서가 P 둘레(붙잡기 거리)면 P의 축은 보지 않고(점 붙잡기가 맡는다),
    P가 첫 점이면 뺀다. 단면·가림은 따지지 않는다(0.9.0 축 붙잡기와 같다)
- 잠금과의 관계: 잠근 동안(Shift·`setMeasureInferenceLock`)에는 끌어온 축을 쓰지 않고 잠근 선 위 점이 먼저다(0.14.0 다듬기와 같은 차례).
  잠근 선 위 점은 점 붙잡기가 아니므로 머무르지 않고, 기억한 점은 남는다. 잠근 축에서 P를 가리키면 0.10.0처럼 P를 그 선에 내린 자리를 찍는다
- 그리기: P에서 붙잡을 점까지 점선. 끌어온 축은 그 축 색이고, 첫 점 축 위 나란한 자리는 P와 그 점을 잇는 선이 축과 나란할 때만 그 축 색(아니면 측정 색)이다.
  첫 점에서 그은 선은 첫 점 축 위 자리면 0.9.0처럼 축 색, 끌어온 축 위 점이면 보통 측정 색이다. 기억한 점마다 작은 십자(그 점에서 끌어왔으면 크게, 점선 색),
  붙잡을 점은 축 붙잡기 표식(축 색 동그라미)이다. 측정 모드에서 기억한 점이 있으면 커서가 캔버스를 떠나도 십자를 그린다
- 값: `measureHoverSnap.trackFrom`·`measurePoints[i].trackFrom`(복사본). `MeasureResult`는 0.9.1 축 붙잡기 그대로 `snapB: 'axis'`·`axisB`를 싣는다.
  첫 점 축 위 나란한 자리는 `directionB`도 있고, 끌어온 축 위 점은 `directionB`가 없다(첫 점에서 그 축 방향이 아니다). 앱이 "Z축"과 "끌어온 점에서 Z축"을
  가르려면 `measurePoints`의 `trackFrom`을 본다. 끌어온 축으로 첫 점을 찍으면 `snapA: 'axis'`·`axisA`가 실린다(0.15.0까지 비어 있던 자리)
- 잊는 때: 두 점째를 찍을 때(첫 점에서는 남긴다 — 첫 점 축 위 나란한 자리에 쓴다), 측정을 지울 때(`clearMeasure`·Esc·측정 모드 끄기·장면 바꾸기),
  붙잡기 선택을 다시 줄 때(`setMeasureSnap`), `setMeasureTrackPoints(null)`. Esc는 첫 점 전이라도 기억한 점이 있으면 지운다(그때 `handleKey`가 `true`)
- 꺼져 있으면 상태가 없다. 머물러도 기억하지 않고 `measureTrackPoints`는 빈 배열, `setMeasureTrackPoints`는 0을 돌려준다. 화소·값도 0.15.0과 같다
- API: `measureTrackPoints`(`V3[]` — 새것이 앞, 복사본), `setMeasureTrackPoints(points | null)`(측정 모드이고 track을 켰을 때만, 기억한 수를 돌려준다 —
  앞이 가장 최근, 셋까지, 수 셋이 아닌 것은 버린다)
- 순수(`opencad-viewer3d/track`): `trackCrossSnap(f, first, tracks, x, y, snapPx, axes?)`·`trackAxisSnap(f, tracks, x, y, snapPx, skip?, axes?)`
  (`axes`는 앱의 그리기 축 `{ x, y, z }` — 없으면 세계 축), `MeasureTracker`(점 목록과 머무르기 상태 — `hover(p, x, y)`가 `'start' | 'keep' | 'none'`, `commit()`,
  `add`·`set`·`clear`, 시간은 부르는 쪽이 잰다), `sameTrackPoint`, `TRACK_DWELL_MS`·`TRACK_DWELL_PX`·`TRACK_MAX`, `normalizeTrack`

```ts
viewer.setMeasureSnap({ ...options, inference: { intersections: true, perpendicular: true, axes: true, parallel: true, lock: true, track: true } });
// 상태 줄: 끌어온 축이면 "끌어온 점에서 Z축"(KIND는 0.10.0 예의 종류 이름표)
const h = viewer.measureHoverSnap;
const axisName = (a: SnapAxis) => `${a.toUpperCase()}축`;
status.textContent = !h?.snap ? '' : h.snap === 'axis' ? (h.trackFrom && !h.direction ? `끌어온 점에서 ${axisName(h.axis!)}` : `${axisName(h.axis!)} 방향`) : KIND[h.snap];
// 터치: 앱의 길게 누르기로 고른 점을 끌어올 점으로(가장 최근이 앞)
onLongPress((x, y) => {
  const p = viewer.pick(x, y, 'touch');
  if (p) viewer.setMeasureTrackPoints([p.point, ...viewer.measureTrackPoints]);
});
```

```ts
// SKP 줄자(코어 측정 모드를 쓰지 않는다): 같은 규칙을 순수 함수로. snap.ts의 점 붙잡기·첫 점 축 뒤에 잇는다
import { MeasureTracker, TRACK_DWELL_MS, trackAxisSnap, trackCrossSnap } from 'opencad-viewer3d/track';
const tracker = new MeasureTracker();
let timer = 0;
function onHover(point: V3 | null, x: number, y: number): void {
  const step = tracker.hover(point, x, y); // point = 점 붙잡기(꼭짓점·끝점 등)일 때만, 아니면 null
  if (step === 'keep') return;
  clearTimeout(timer);
  if (step === 'start') timer = window.setTimeout(() => tracker.commit() && redraw(), TRACK_DWELL_MS);
}
// 점 붙잡기가 없을 때: 나란한 자리 → 첫 점 축 → 끌어온 축(모형 축 axes를 그대로 준다)
const t = (first && trackCrossSnap(frame, first, tracker.view, x, y, 10, axes)) || axisLockAt(first) || trackAxisSnap(frame, tracker.view, x, y, 10, first, axes);
```

### 앱이 할 일

- NC·STEP: 코어를 `#v0.16.0`으로 올리고, 첫 점이 놓인 곡선을 좌표로 다시 찾던 곳(STEP `src/app/tangent.ts`의 첫 점에 닿는 곡선 끝 찾기와
  커서 아래 점이 그 모서리 위인지 판정, NC의 첫 점 원호·직선 이동 찾기)을 `measurePoints[0].segment`·`measureHoverSnap.segment`로 바꾼다
  (`kind`·`id`·`index`·`raw`는 `pointsFor`·`refine`이 받는 것과 같은 뜻). 끝점은 고른 쪽 토막 하나라 곡선이 바뀌는 꼭짓점(두 모서리의 끝)에서는
  다른 쪽 모서리도 끝점으로 볼지 앱이 정한다. 식별자가 없는 점(그물 꼭짓점·앱 점·축 위 점)은 예전 좌표 찾기로 남기거나 잠글 방향이 없다고 본다.
  끌어온 축을 켜려면 `inference.track`을 더하고, 상태 줄에 "끌어온 점에서 Z축"을 보인다(새로 보이는 글은 앱 사전 en·ja·zh-CN·de에).
  터치 화면은 길게 누르기로 `setMeasureTrackPoints`를 줄지 정한다
- SKP: 줄자·각도기는 코어 측정 모드를 쓰지 않으므로 켤 것이 없다. 같은 동작을 원하면 `opencad-viewer3d/track`의 순수 함수(`MeasureTracker`·
  `trackCrossSnap`·`trackAxisSnap`)를 `snap.ts`의 추정 차례(점 → 첫 점 축 위 나란한 자리 → 첫 점 축 → 끌어온 축)에 넣는다. 모형 축이 세계 축과 다르면 `axes`로 준다

## 0.17.0: 끌어온 축끼리의 교차·끌어온 축과 모서리의 교차

`inference.track`을 켜지 않으면 그림·고르기·측정은 0.16.0과 화소·값까지 같다(`npm run pixels -- --base v0.16.0`: 0.16.0의 장면 101개·값 39묶음 모두 같음 —
track을 켠 0.16.0 장면·값(`base-measure-track-*`, `*-measure-track`)도 같다. 새 장면 3개(`base-measure-track-pair`·`-pair-light`·`-edge`)·값 2묶음(`base·off-measure-track-pair`)은
0.16.0에 없는 값이라 건너뛰고, head에서 두 번 찍어 같은 것을 확인했다).
바뀐 기본 동작은 없다. 켠 앱도 기억한 점이 하나이고 그 축이 커서 둘레 선분과 만나지 않는 자리에서는 0.16.0과 같다.

0.16.0은 기억한 점(P)마다 그 점을 지나는 축 하나와 첫 점 축 위 나란한 자리만 붙잡았다. SketchUp에서는 두 점에서 끌어온 안내선이 만나는 자리
(두 모서리 가운데 점에 차례로 머문 뒤 사각형 한가운데를 찍는 식)와 끌어온 안내선이 모서리와 만나는 자리를 자주 찍는다.
SketchUp 도움말 "Introducing Drawing Basics and Concepts"의 추론 설명이 근거다. 점에 커서를 잠시 멈추면 그 점과 나란히 맞추기를 먼저 하고
(From Point — 축 색 점선), 추론 여럿을 합쳐 더 복잡한 추론을 만들며, 선이 다른 선과 만나는 점(Intersection)과 모서리 위 점(On Edge)을 점 추론으로 든다.
이번 판은 끌어온 안내선끼리, 끌어온 안내선과 모서리가 만나는 점을 점 후보로 더한다.

### 끌어온 축끼리의 교차

- 기억한 두 점 P·Q(P가 더 최근)의 서로 다른 축(P의 X축과 Q의 Y축 등)이 3D로 만나는 점. 세계 축이면 두 점이 남은 좌표 하나를 함께 쓸 때다 —
  P의 X축과 Q의 Y축은 Pz = Qz이면 (Qx, Py, Pz)에서 만난다(그 좌표를 셈 오차 없이 그대로 쓴다). 허용치는 그 점 깊이에서 화면 반 화소(0.9.0 두 선분 교차와 같은 눈금)
- 만나지 않으면 후보가 없다. 높이가 다른 두 점의 축은 화면에서 엇갈려 보여도 3D로는 떨어져 있고, 둘 사이 가장 가까운 자리는 한 점과만 나란하다.
  그 자리를 찍으면 다른 점과는 높이 차만큼 어긋난 거리가 나온다. 그래서 붙잡지 않고, 그 자리는 0.16.0처럼 한 축(끌어온 축)에만 붙는다
- 보지 않는 것: 같은 점의 두 축(그 점에서 만난다 — 점 붙잡기가 맡는다), 같은 축 둘(나란하다), 한 점이 다른 점의 축 위인 쌍(교차가 그 점이다),
  첫 점과 같은 점(첫 점 축과 끌어온 축의 교차는 0.16.0 첫 점 축 위 나란한 자리다), 교차가 첫 점 자리인 것. 커서가 P나 Q 둘레(붙잡기 거리)면 그 쌍은 보지 않는다
- 첫 점 전에도 된다. 첫 점을 찍기 전에 두 점과 나란한 자리를 찍을 수 있다(0.16.0 남은 일의 "첫 점 전의 나란한 자리")

### 끌어온 축과 선분·윤곽선의 교차

- P를 지나는 축이 커서 둘레 선분(선분 묶음, 측정 중 윤곽선을 고르면 그물 윤곽선도 — 0.9.0 교차점과 같은 가까운 24개)과 3D로 만나는 점.
  허용치는 0.9.0 두 선분 교차와 같이 선분 쪽 깊이에서 화면 반 화소다. 확대하면 함께 좁아지고, 아주 큰 좌표에서는 좌표 크기의 1e-9배 밑으로 내려가지 않는다
- 선분 안쪽만이다. 끝점(허용치 안)은 끝점 붙잡기가 맡는다. 축과 나란한 선분, P가 그 선분 위라서 P에서 만나는 것, 첫 점 자리는 뺀다.
  단면에 잘린 쪽과 음영 계열에서 면에 가린 점도 뺀다(0.9.0 교차점과 같다)
- 그 점의 `segment`는 그 선분이다(0.16.0 식별자 규칙 — 선분 위 점과 같은 `{ kind, id, index, raw, ends }`). `other`는 없다
- 앱 다듬기(`refine`)는 부르지 않는다. 축 위 점이라 곡선 위로 옮기면 축에서 벗어난다(꺾은선 토막 위 점이다)

### 차례·잠금·그리기·값

- 차례(점 붙잡기가 하나도 없을 때, 앞의 것이 있으면 그것)
  1. 끌어온 점 후보 가운데 점인 것: 첫 점 축 위 나란한 자리(0.16.0) → 끌어온 축끼리의 교차 → 끌어온 축과 선분의 교차.
     셋 사이는 화면에서 가까운 것이고, 뒤 차례 후보는 1화소(`TRACK_YIELD_PX`) 넘게 가까워야 이긴다
  2. 첫 점 축·나란함(0.9.0·0.10.0)
  3. 끌어온 축(0.16.0)
  - 점 후보를 선(첫 점 축·끌어온 축)보다 먼저 두는 까닭: 두 선이 만나는 한 점이라 더 구체적이고(SketchUp도 점 추론이 선 추론보다 먼저다),
    그 둘레 붙잡기 거리에서는 선을 따라 움직여도 그 점에 붙는다
  - 셋 사이를 고정 차례가 아니라 가까운 것으로 한 까닭: 둘이 붙잡기 거리 안에 함께 있을 때 커서 바로 아래 점을 두고 몇 화소 떨어진 점으로 튀지 않게.
    1화소 양보는 같은 점을 두 길로 구할 때(첫 점 축 위 나란한 자리가 곧 끌어온 축이 모서리와 만나는 자리) 셈 오차로 바꿔 고르지 않게 한다 — 그래서 0.16.0 값이 그대로다
- 잠금: 잠근 동안(Shift·`setMeasureInferenceLock`)에는 0.16.0처럼 끌어온 축 후보를 쓰지 않고 잠근 선 위 점이 먼저다.
  두 교차는 첫 점을 지나는 선 위 점이 아니므로 `direction`이 없고 Shift로 잠그지 않는다. 다만
  - 그 점을 지나는 끌어온 축(`trackFrom`·`axis`)이 첫 점도 지나면(끌어온 점이 첫 점 축 위) 첫 점 축 위 점이기도 하다. `direction`을 싣고 그 축으로 잠그며,
    첫 점에서 축 색 안내선을 긋는다(`trackAlongFirst`)
  - 선분 교차에서 그 선분 직선이 첫 점을 지나면 0.12.0처럼 그 선분 방향으로 잠근다
- 그리기: 끌어온 점에서 그 점까지 그 축 색 점선(0.16.0 그대로). 끌어온 축끼리의 교차는 둘째 끌어온 점에서도 그 축 색 점선을 긋고 두 점 모두 큰 십자를 그린다.
  표식은 축 붙잡기와 같은 축 색 동그라미(첫째 축 색)다. 첫 점에서 그은 선은 `direction`이 있을 때만 축 색이고 아니면 측정 색이다
- 값: 둘 다 `snap: 'axis'`이고 `axis`·`trackFrom`이 첫째 끌어온 축이다(축끼리의 교차는 더 최근 점 P)
  - 새 필드 `trackOther`(`TrackGuide` — `{ from: V3; axis: SnapAxis }`, 복사본): 끌어온 축끼리의 교차면 둘째 끌어온 점 Q와 그 축.
    `MeasureHoverSnap`·`MeasurePoint`에 싣고 `MeasureResult`에는 싣지 않는다(0.16.0 `trackFrom`과 같다). 결과는 `snapB: 'axis'`·`axisB`(P의 축)다
  - 선분 교차는 새 필드 없이 `trackFrom`·`axis`와 `segment`(그 선분)다
  - 앱이 가르는 법: `trackOther`가 있으면 축끼리의 교차, `trackFrom`과 `segment`면 선분 교차, `trackFrom`과 `direction`뿐이면 첫 점 축 위 나란한 자리, 그 밖의 `trackFrom`은 끌어온 축
- API 설계 까닭
  - `SnapKind`에 새 값을 더하지 않았다. 두 점 모두 끌어온 축 위 점이라 `'axis'`·`axis`·`trackFrom`이 그대로 맞는다. 0.16.0 상태 줄("끌어온 점에서 X축")을
    그대로 둔 앱도 틀린 글을 보이지 않고, 종류 이름표를 `Record<SnapKind, string>`으로 둔 앱이 고치지 않고 컴파일된다
  - 둘째 축은 0.16.0 교차점의 둘째 선분 `other`처럼 따로 둔 필드 하나다. 끌어온 축을 모두 담는 배열은 대부분 하나뿐이라 앱이 늘 첫째를 꺼내야 하고, 0.16.0 `trackFrom`과 겹친다.
    점과 축을 한 객체로 묶은 것은 둘째 축의 축 이름(`axis`)을 따로 둘 자리가 없어서다
- 순수(`opencad-viewer3d/track`): `trackPairSnap(f, tracks, x, y, snapPx, skip?, axes?)`(결과 `other`), `trackEdgeSnap(f, tracks, segs, x, y, snapPx, skip?, axes?, visible?)`
  (`segs`는 `{ a, b, wpp, keep? }` — 뷰어는 커서 둘레 선분, 결과 `seg`는 받은 그 객체), `chooseTrackPoint(cands, yieldPx?)`, `trackAlongFirst(f, first, from, axis, axes?)`,
  `TRACK_YIELD_PX`, 타입 `TrackGuide`·`TrackSegment`·`TrackEdgeSnap`. 커서 둘레 선분의 식별자 `nearSegmentId`(`opencad-viewer3d/inference`)

```ts
// 상태 줄: 0.16.0 예에 끌어온 축끼리의 교차와 모서리 위를 더한다(KIND는 0.10.0 예의 종류 이름표)
const h = viewer.measureHoverSnap;
const ax = (a: SnapAxis) => `${a.toUpperCase()}축`;
status.textContent = !h?.snap ? '' : h.snap !== 'axis' ? KIND[h.snap]
  : h.trackOther ? `끌어온 ${ax(h.axis!)}와 ${ax(h.trackOther.axis)}의 교차`
  : h.trackFrom && h.segment ? `끌어온 점에서 ${ax(h.axis!)} · 모서리 위`
  : h.trackFrom && !h.direction ? `끌어온 점에서 ${ax(h.axis!)}` : `${ax(h.axis!)} 방향`;
```

```ts
// SKP 줄자(순수 함수): 0.16.0 차례의 나란한 자리 자리에 점 후보 셋을 묶는다. segs = 커서 둘레 모서리 { a, b, wpp }(wpp = 그 깊이 한 화소의 세계 길이)
const pt = chooseTrackPoint([
  first && trackCrossSnap(frame, first, tracker.view, x, y, 10, axes),
  trackPairSnap(frame, tracker.view, x, y, 10, first, axes),
  trackEdgeSnap(frame, tracker.view, segs, x, y, 10, first, axes),
]);
const t = pt || axisLockAt(first) || trackAxisSnap(frame, tracker.view, x, y, 10, first, axes);
```

### 앱이 할 일

- NC·STEP: 코어를 `#v0.17.0`으로 올리면 `inference.track`을 켠 앱은 더 켤 것 없이 두 후보가 붙는다. `inference.track`을 켜지 않은 판은 올려도 값이 같다.
  상태 줄에 "끌어온 X축과 Y축의 교차"(`trackOther`), "끌어온 점에서 X축 · 모서리 위"(`trackFrom`과 `segment`)를 보이고, 새 글은 앱 사전(en·ja·zh-CN·de)에 넣는다.
  찍은 점을 보이거나 저장하는 앱은 `measurePoints[i].trackOther`도 본다
  - STEP: 선분 교차 점의 `segment`는 0.16.0 선분 식별자와 같아 첫 점 곡선 찾기(`edgeAt(table, raw)`)가 그대로 된다. 곡선 모서리면 꺾은선 토막 위 점이다
  - NC: 공구 경로 이동(선분 묶음)과의 교차도 된다. 원호를 나눈 꺾은선이면 토막 위 점이다
- SKP: 줄자가 `opencad-viewer3d/track` 순수 함수를 쓰면 위 예처럼 `trackPairSnap`·`trackEdgeSnap`을 `chooseTrackPoint`로 첫 점 축 위 나란한 자리와 묶어
  첫 점 축 앞에 넣는다. 모형 축은 `axes`로, 모서리는 화면 둘레 모서리에 그 깊이 한 화소의 세계 길이(`wpp`)를 붙여 준다

## 0.18.0: 첫 점 축과 모서리의 교차·축 교차 점 다듬기·축이 면을 뚫는 점

새 선택 `inference.axisEdges`·`inference.axisFaces`를 켜지 않고 `refine`을 주지 않으면 그림·고르기·측정은 0.17.0과 화소·값까지 같다(`npm run pixels -- --base v0.17.0`: 0.17.0의 장면 104개·값 41묶음 모두 같음.
새 장면 2개(`base-measure-axis-edge`·`post-measure-axis-face`)·값 4묶음(`base·off-measure-axis-edge`, `arc-measure-axis-edge`, `post-measure-axis-face`)은
0.17.0에 없는 값이라 건너뛰고, head에서 두 번 찍어 같은 것을 확인했다).
바뀐 기본 동작은 하나다. `refine`을 주고 `inference.track`을 켠 앱은 끌어온 축과 선분의 교차(0.17.0)에서도 `refine`이 `kind: 'axisEdge'`로 불린다.
모르는 종류에 `null`을 돌려주는 앱(NC·STEP의 지금 다듬기 함수가 그렇다)은 값이 같다.

0.17.0까지 첫 점에서 X·Y·Z 축을 따라가면 축 위에서 커서에 가장 가까운 자리만 붙잡았다. 축이 모서리에 닿는 자리는 그 축 위의 점을 끌어와야(0.17.0) 붙었고, 면에 닿는 자리는 붙지 않았다.
SketchUp에서는 첫 점에서 빨강·초록·파랑 축을 따라가다 모서리나 면에 닿는 자리를 자주 찍는다. SketchUp 도움말 "Introducing Drawing Basics and Concepts"의
추론 설명이 근거다. 축 방향(On Axis)을 선 추론으로, 선이 다른 선과 만나는 점(Intersection)·모서리 위 점(On Edge)·면 위 점(On Face)을 점 추론으로 들고,
추론 여럿을 합쳐 더 복잡한 추론을 만든다. 이번 판은 첫 점 축과 모서리의 교차, 축과 면의 교차를 점 후보로 더하고, 축과 곡선 모서리의 교차를 앱이 곡선 위로 다듬게 한다.

### 첫 점 축과 선분·윤곽선의 교차(`inference.axisEdges`)

- 첫 점을 지나는 X·Y·Z 축이 커서 둘레 선분(선분 묶음, 측정 중 윤곽선을 고르면 그물 윤곽선도)과 3D로 만나는 점. 0.17.0 끌어온 축과 선분의 교차와 계산·허용치·빼는 규칙이 같다
  (선분 쪽 깊이에서 화면 반 화소, 선분 안쪽만, 축과 나란한 선분·첫 점이 그 선분 위라서 첫 점에서 만나는 것·단면에 잘린 쪽·음영 계열에서 면에 가린 점은 뺀다).
  커서가 첫 점 둘레(붙잡기 거리)면 보지 않는다(세 축이 모두 지나는 곳 — 0.9.0 축 붙잡기와 같다)
- 값: `snap: 'axis'`, `axis`, `direction`(그 축 단위 방향), `segment`(그 선분). `trackFrom`은 없다. 첫 점을 지나는 선 위 점이라 Shift·`setMeasureInferenceLock(true)`가 그 축으로 잠근다
- 새 선택으로 둔 까닭: `inference.axes`만 켠 앱에서 그대로 켜면 축을 따라가다 모서리 둘레(붙잡기 거리)에서 점이 교차로 튄다. 기본값을 지키려고
  `true`에도 들지 않는 따로 켜는 선택으로 두었다(0.10.0 나란함·잠금, 0.16.0 `track`과 같다). `axes`·`track` 없이 이것만 켜도 된다
- 0.10.0 나란함 방향은 넣지 않았다. 나란함의 기준 선분이 커서가 지나는 선분으로 바뀌므로, 교차를 보려고 그 선분에 다가가면 기준이 곧 그 선분이고 그 선분과는 늘 나란하다
- 상자 모서리처럼 축과 수직인 선분에서는 이 교차가 곧 첫 점에서 내린 수직 발(0.9.0)이다. 수직 발은 점 붙잡기라 먼저이고, 그때 종류는 `'perpendicular'`다

### 축이 면을 뚫는 점(`inference.axisFaces`)

- 첫 점을 지나는 X·Y·Z 축과 끌어온 축(0.16.0 `track` — 첫 점과 같은 점은 뺀다)이 커서 아래 보이는 그물 면을 뚫는 점. 커서가 그물 면 위일 때만이다
  (선분·윤곽선·점 고르기 허용치 안, 단면 채운 면 위에서는 후보가 없다)
- 구하는 법: 축 직선과 커서 아래 삼각형의 평면이 만나는 점 m을 구하고, m의 화면 자리에서 그물 면만 다시 맞춰 본다. 맨 앞에 보이는 면이 m 자리(그 깊이에서 화면 반 화소 안)면 받는다.
  다른 점이 맞으면(곡면을 나눈 이웃 삼각형, 앞에 다른 면) 새로 맞은 삼각형의 평면으로 다시 구한다(3번까지, `AXIS_FACE_STEPS`). 가림·단면·면 밖은 이 다시 맞추기가 거른다.
  면 위에 그린 선분·점은 면을 가리지 않는다. 평면은 광선 맞은 점이 아니라 삼각형 꼭짓점으로 정해, 축과 수직인 면이면 교차의 그 좌표가 꼭짓점 좌표 그대로다
- 빼는 것: 면과 나란한 축, 교차가 지나는 점 자리인 축(그 점이 면 위 — 점 붙잡기가 맡는다), 커서가 지나는 점 둘레(붙잡기 거리)인 직선
- 값: `snap: 'axis'`, `axis`, 새 필드 `face`(`SnapFace` — `{ id, index, normal }`: 그물 id, 삼각형 번호(`Pick3d.index`와 같은 뜻), 세계 단위 법선(눈 쪽), 복사본).
  첫 점 축이면 `direction`이 있어 Shift로 그 축에 잠그고, 끌어온 축이면 `trackFrom`이다(그 축 선이 첫 점도 지나면 `direction`도). `segment`는 없다.
  `MeasureHoverSnap`·`MeasurePoint`에 싣고 `MeasureResult`에는 싣지 않는다(0.16.0 `trackFrom`과 같다)
- 다듬지 않는다. 곡면이면 그 곡면을 나눈 삼각형 위 점이다

### 축과 선분의 교차 다듬기(`refine` — `'axisEdge'`)

- 첫 점 축(`axisEdges`)과 끌어온 축(0.17.0 `track`)이 선분과 만나는 점을 찍을 때, 앱이 `refine`을 주면 `SnapRefineKind`의 새 값 `'axisEdge'`로 부른다.
  새 필드 `line`(`SnapRefineLine` — `{ origin, dir, axis }`: 지나는 점(첫 점이나 끌어온 점), 세계 축 단위 방향, 축 이름, 복사본)이 그 축 직선이다.
  앱은 이 직선이 `segment`가 놓인 곡선과 만나는 점(`point` 둘레)을 돌려준다. 만나지 않거나 모르면 `null`이고, 그러면 꺾은선 토막 위 점 그대로다
- 받는 규칙(`acceptOnLine`): 앱 점을 축 직선 위로 수직으로 내린 자리를 쓴다. 그 자리가 앱 점에서 화면 반 화소(아주 큰 좌표는 좌표 크기의 1e-9배)를 넘게 벗어나거나,
  코어 점에서 붙잡기 거리 밖이거나, 눈 뒤·가까운 면 앞·그 묶음 단면에 잘린 쪽이면 버리고 코어 점을 쓴다. 축 위로 내리므로 세계 축이면 지나는 점과 남은 두 좌표가 정확히 같다
  (찍은 점이 첫 점 축에서 셈 오차만큼도 벗어나지 않는다). 앱이 축과 상관없는 곡선 위 점(모르는 종류를 모서리 위 점처럼 푼 값)을 돌려줘도 버려진다
- 0.14.0·0.15.0 규칙과 맞춘 것: 후보는 코어 점으로 견주고 고른 한 점만 다듬는다. 잠글 방향도 코어 점으로 정한다. 가림은 다시 따지지 않는다(코어 점이 보이고 그 바로 둘레다).
  잠근 동안에는 부르지 않는다. 결과는 0.15.0 열린 후보처럼 커서 광선을 뺀 입력(종류·코어 점·토막·축 직선·첫 점 — `openRefineKey`에 축 직선이 붙는다)으로 기억해,
  커서가 그 둘레에서 움직이는 동안 다시 부르지 않는다(`setMeasureSnap`마다 새로). `sameRefineInput`도 축 직선을 견준다
- 새 종류로 둔 까닭: 모서리 위 점(`'onEdge'`)은 곡선에서 커서 광선에 가장 가까운 점이라, 그대로 다듬으면 축에서 벗어난다. 축 직선이 있어야 축과 곡선의 교차를 구할 수 있다

### 차례·그리기·값

- 차례(점 붙잡기가 하나도 없을 때): 0.17.0 끌어온 점 후보 셋(첫 점 축 위 나란한 자리 → 끌어온 축끼리의 교차 → 끌어온 축과 선분의 교차) 뒤에
  첫 점 축과 선분의 교차 → 축과 면의 교차를 붙여 다섯을 함께 견준다(`chooseTrackPoint` — 화면에서 가까운 것, 뒤 차례는 1화소 넘게 가까워야 이긴다). 그 다음이 첫 점 축·나란함, 끌어온 축이다
  - 뒤에 둔 까닭: 같은 점을 두 길로 구할 때(끌어온 점이 첫 점 축 위면 끌어온 축과 선분의 교차가 곧 첫 점 축과 선분의 교차) 0.17.0 후보와 값이 남게 한다.
    면보다 선분을 앞에 둔 것은 모서리가 면의 테두리라 더 구체적이어서다
  - 선(첫 점 축)보다 점 후보를 먼저 두는 것은 0.17.0과 같다
- 그리기: 축 붙잡기와 같은 축 색 동그라미. 첫 점 축이면 첫 점에서 그 점까지 축 색 안내선, 끌어온 축이면 0.16.0처럼 끌어온 점에서 축 색 점선이다
- 앱이 가르는 법(0.17.0에 더해): `snap: 'axis'`에 `face`가 있으면 축이 면을 뚫는 점, `trackFrom` 없이 `segment`가 있으면 첫 점 축과 선분의 교차다
- 순수(`opencad-viewer3d/track`): `axisEdgeSnap(f, first, segs, x, y, snapPx, axes?, visible?)`(결과 `{ p, axis, direction, distPx, seg }` — `segs`는 0.17.0 `trackEdgeSnap`과 같은 꼴),
  `axisFaceSnap(f, lines, x, y, snapPx, under, hitAt, axes?, steps?)`(`lines` = `{ from, axis }[]`, `under` = 커서 아래 면 맞음 `{ point, normal, origin? }`,
  `hitAt(sx, sy)` = 화면 점에서 맨 앞에 보이는 면 맞음. 결과 `{ p, axis, from, direction, distPx, hit, line }`), `AXIS_FACE_STEPS`, 타입 `AxisEdgeSnap`·`AxisFaceSnap`·`TrackFaceHit`·`TrackLine`.
  `opencad-viewer3d/snap`: `acceptOnLine(f, core, q, line, maxPx)`, 타입 `SnapRefineLine`·`SnapFace`. 고르기 결과 `PickDetail.corners`(그물 면이면 맞은 삼각형의 세계 꼭짓점 셋)

```ts
// 상태 줄: 0.17.0 예에 첫 점 축과 모서리, 축과 면을 더한다
status.textContent = !h?.snap ? '' : h.snap !== 'axis' ? KIND[h.snap]
  : h.trackOther ? `끌어온 ${ax(h.axis!)}와 ${ax(h.trackOther.axis)}의 교차`
  : h.face ? `${h.trackFrom ? '끌어온 점에서 ' : ''}${ax(h.axis!)} · 면 위`
  : h.segment ? `${h.trackFrom ? '끌어온 점에서 ' : ''}${ax(h.axis!)} · 모서리 위`
  : h.trackFrom && !h.direction ? `끌어온 점에서 ${ax(h.axis!)}` : `${ax(h.axis!)} 방향`;
```

```ts
// 앱 다듬기: 축 직선과 곡선의 교차. 원호(중심 c, 법선 n, 반지름 r)라면 직선을 원의 평면과 만나게 해 원 위인지 본다
refine: (c) => {
  if (c.kind === 'axisEdge' && c.line) return lineMeetsArc(c.line.origin, c.line.dir, arcOf(c.segment), c.point);
  // … 0.14.0·0.15.0 종류
  return null;
},
```

### 앱이 할 일

- NC·STEP: 코어를 `#v0.18.0`으로 올리면 두 선택(`axisEdges`·`axisFaces`)을 켜야 새 후보가 붙는다. 켜지 않은 판은 올려도 값이 같다(다듬기 함수가 모르는 종류에 `null`이면).
  상태 줄에 "X축 · 모서리 위"(`trackFrom` 없이 `segment`), "X축 · 면 위"(`face`)를 보이고, 새 글은 앱 사전(en·ja·zh-CN·de)에 넣는다
  - NC: 공구 경로 이동(선분 묶음)에 `axisEdges`가 맞는다. 원호를 나눈 꺾은선과 만나는 점은 다듬기에 `'axisEdge'`를 더해 축 직선과 원호의 교차로 옮긴다
    (지금 `refine.ts`의 원호 찾기를 그대로 쓰고, 직선과 원의 교차만 새로 구한다). 소재·고정구 그물이 있으면 `axisFaces`도 켤 만하다
  - STEP: B-rep 모서리에 `axisEdges`, 면에 `axisFaces`. 다듬기에 `'axisEdge'`를 더해 축 직선과 모서리 곡선의 교차를 구한다
    (원·타원은 식으로, 그 밖의 곡선은 0.15.0 교차점 다듬기처럼 반복으로). 면을 뚫는 점은 삼각형 위 점이라 곡면이면 곡면에서 조금 떨어져 있다(아래 남은 일)
- SKP: 줄자가 순수 함수를 쓰면 `axisEdgeSnap`을 0.17.0 `chooseTrackPoint` 묶음 끝에 넣고, 면은 앱의 면 고르기로 `under`·`hitAt`을 만들어 `axisFaceSnap`을 그 뒤에 넣는다.
  모형 축은 `axes`로 준다

## 0.19.0: 잠근 선이 모서리·면과 만나는 점·축이 곡면을 뚫는 점 다듬기

새 선택 `inference.lockEdges`·`inference.lockFaces`를 켜지 않고 `refineFace`를 주지 않으면 그림·고르기·측정은 0.18.0과 화소·값까지 같다(`npm run pixels -- --base v0.18.0`로 확인한다. 새 장면 2개(`base-measure-lock-edge`·`post-measure-lock-face`)·값 4묶음(`base·off-measure-lock-edge`, `post-measure-lock-face`, `globe-measure-lock-refine`)은 0.18.0에 없는 선택이라 건너뛴다).
바뀐 기본 동작은 없다. `refine`의 입력 타입(`SnapRefineInput`)도 그대로다.

0.18.0까지 Shift·`setMeasureInferenceLock`으로 잠근 동안에는 커서 아래 점 붙잡기(꼭짓점·끝점 등)를 잠근 선에 내린 자리나, 잠근 선 위에서 커서에 가장 가까운 점만 찍었다.
그래서 첫 점 축이 모서리와 만나는 점(0.18.0 `axisEdges`)을 미리 본 뒤 Shift로 그 축에 잠그면 점이 모서리에서 커서 쪽으로 몇 화소 옮겨 갔고, 잠근 축이 면에 닿는 자리는 찍을 수 없었다.
축이 곡면을 뚫는 점은 곡면을 나눈 삼각형 위 점이라 처짐만큼 어긋났다.
SketchUp 도움말 "Introducing Drawing Basics and Concepts"의 추론 설명이 근거다. Shift·화살표 키로 그리는 방향을 잠근 채 모형의 다른 형상을 가리켜 참고할 수 있고,
선이 다른 선이나 면과 만나는 점(Intersection)을 점 추론으로 든다. 이번 판은 잠근 선이 모서리와 만나는 점과 면을 뚫는 점을 잠근 동안의 점 후보로 더하고,
축이 면을 뚫는 점을 앱이 정확한 곡면 위로 다듬게 한다.

### 잠근 선과 선분·윤곽선의 교차(`inference.lockEdges`)

- 잠근 동안 커서 아래 점 붙잡기가 없으면, 첫 점을 지나는 잠근 선이 커서 둘레 선분(선분 묶음, 측정 중 윤곽선을 고르면 그물 윤곽선도)과 3D로 만나는 점을 찍는다.
  잠근 선은 잠금 종류와 상관없다(축, 나란함, 수직, 0.12.0 선분 방향, 앱이 정한 방향)
- 계산·허용치·빼는 규칙은 0.18.0 첫 점 축과 선분의 교차와 같다. 선분 쪽 깊이에서 화면 반 화소, 선분 안쪽만이고, 잠근 선과 나란한 선분·첫 점에서 만나는 것·단면에 잘린 쪽·
  음영 계열에서 면에 가린 점은 뺀다. 커서에서 붙잡기 거리 안일 때만이고, 커서가 첫 점 둘레(붙잡기 거리)면 보지 않는다
- 세계 축으로 잠갔으면 찍은 점의 남은 두 좌표가 첫 점과 정확히 같다

### 잠근 선이 면을 뚫는 점(`inference.lockFaces`)

- 잠근 동안 커서 아래 점 붙잡기가 없고 커서가 보이는 그물 면 위면, 잠근 선이 그 면을 뚫는 점을 찍는다(커서에서 붙잡기 거리 안일 때만)
- 구하는 법은 0.18.0 축이 면을 뚫는 점과 같다. 잠근 선과 커서 아래 삼각형 평면의 교차를 그 화면 자리에서 그물 면만 다시 맞춰 보고, 다른 면이 맞으면 그 평면으로 3번까지 다시 구한다.
  면과 나란한 잠근 선, 첫 점이 그 면 위인 것은 뺀다

### 차례·값

- 잠근 동안의 차례: 커서 아래 점 붙잡기(0.10.0 — 그 점을 잠근 선에 내린 자리, `from`) → 잠근 선과 선분의 교차 → 잠근 선이 면을 뚫는 점 → 잠근 선 위 커서에 가까운 점(0.10.0).
  선분과 면 사이는 0.17.0처럼 화면에서 가까운 것이고, 면은 1화소(`TRACK_YIELD_PX`) 넘게 가까워야 이긴다
  - 점 붙잡기를 먼저 둔 까닭: 잠근 채 다른 꼭짓점을 가리켜 그 높이·자리를 잠근 방향으로 옮겨 재는 것이 잠금의 쓰임이다(0.10.0). 교차는 그런 점이 없을 때 커서 쪽 점보다 구체적인 점이다
  - 선분을 면보다 먼저 둔 까닭은 0.18.0과 같다(모서리가 면의 테두리라 더 구체적이다)
- 값: 잠근 선 위 점 그대로(`snap`은 잠금 종류, `axis`, `direction`, `locked`, 나란함의 `edge`)에 그 선분 `segment`(0.16.0 식별자)나 그 면 `face`(0.18.0 `SnapFace`)가 더해진다.
  `from`은 없다. `MeasureHoverSnap`·`MeasurePoint`에 싣고, 결과(`MeasureResult`)는 0.10.0 잠금 그대로(`snapB`·`axisB`·`directionB`·`lockedB`)다
- 앱이 가르는 법: `locked`에 `segment`가 있으면 잠근 선이 모서리와 만나는 점, `face`가 있으면 면을 뚫는 점, `from`이 있으면 점 붙잡기를 옮겨 온 자리다
- 그리기는 잠금 그대로다(바탕 테 위 굵은 실선 안내선, 고리 두른 표식)
- 0.18.0 첫 점 축 교차·축이 면을 뚫는 점을 미리 본 뒤 Shift로 그 축에 잠가도, 커서가 그 둘레에 있는 동안 점이 같은 자리에 남는다
- 새 선택으로 둔 까닭: `axisEdges`·`axisFaces`를 켠 앱의 잠근 동안 점이 바뀌지 않게 따로 켠다(0.18.0 화소·값 비교의 Shift 잠금 값도 그대로다). `true`에도 들지 않는다.
  `lock`·`axes` 없이 이것만 켜도 앱 단추 잠금(`setMeasureInferenceLock`)에 쓰인다

### 축이 면을 뚫는 점 다듬기(`refineFace` — `'axisFace'`)

- `setMeasureSnap({ …, refineFace })`(`MeasureSnapOptions.refineFace` — `(c: SnapRefineFaceInput) => readonly number[] | null | undefined`): 축(첫 점 축·끌어온 축 — `axisFaces`,
  잠근 축 — `lockFaces`)이 그물 면을 뚫는 점을 고른 뒤 한 번 부른다
- 입력 `SnapRefineFaceInput` `{ kind: 'axisFace', point, face, line, first, ray }`(모두 복사본, 세계 좌표)
  - `point`: 코어 점(축 직선과 삼각형 평면의 교차). `face`: 그 면(`SnapFace` — 그물 id, 삼각형 번호(`Pick3d.index`와 같은 뜻), 세계 단위 법선)
  - `line`: 축 직선(`SnapRefineLine` — 0.18.0 `'axisEdge'`와 같은 꼴 `{ origin, dir, axis }`). 앱은 이 직선이 `face`가 놓인 곡면(B-rep 면 등)을 뚫는 점(`point` 둘레)을 돌려준다.
    모르거나 평면이면 `null`이고, 그러면 삼각형 위 점 그대로다
- 받는 규칙·기억은 0.18.0 `'axisEdge'`와 같다. 앱 점을 축 직선 위로 내린 자리를 쓰고(`acceptOnLine` — 축에서 화면 반 화소 넘게 벗어나거나, 코어 점에서 붙잡기 거리 밖이거나,
  눈 뒤·가까운 면 앞·그 그물 단면에 잘린 쪽이면 버린다), 가림은 다시 따지지 않는다(곡면 위 점은 삼각형으로 만든 면에서 처짐만큼 벗어나 면 깊이와 어긋날 수 있다).
  결과는 커서 광선을 뺀 입력(종류·코어 점·면·축 직선·첫 점 — `openRefineKey`의 선분 자리에 면)으로 기억해, 커서가 그 둘레에서 움직이는 동안 다시 부르지 않는다(`setMeasureSnap`마다 새로)
- 받았으면 `refined: true`다. 잠글 방향(`direction`)은 그 축 그대로다
- `refine`과 따로 둔 까닭: `refine` 입력(`SnapRefineInput`)은 0.14.0부터 선분(`segment`)이 늘 있는 꼴이고, 앱 함수가 그 꼴로 적혀 있다. 선분 없는 종류를 같은 함수로 넘기면
  입력 타입이 합집합이 되어 지금 앱 코드가 컴파일되지 않는다(이 저장소 시험에서도 14곳이 그랬다). 따로 두면 주지 않은 앱은 아무것도 바뀌지 않는다.
  `refineFace`만 줘도 붙잡기가 켜진다(`refine`과 같다). `measureSnap`은 준 함수를 그대로 돌려준다

### 잠근 축과 선분의 교차 다듬기(`refine` — `'axisEdge'`)

- 0.14.0부터 잠근 동안에는 `refine`을 부르지 않았다. 0.19.0은 그 예외로, 잠근 선이 축이면 잠근 선과 선분의 교차(`lockEdges`)를 0.18.0 `'axisEdge'`로 넘긴다
  (`line`은 첫 점을 지나는 그 축). 잠근 축이 면을 뚫는 점은 `refineFace`로 넘긴다
- 잠그기 전 첫 점 축과 선분의 교차와 입력(코어 점·토막·축 직선·첫 점)이 같으므로 기억이 맞는다. Shift를 눌러도 앱을 다시 부르지 않고 다듬은 점이 그대로 남는다
- 나란함·수직·앱이 정한 방향(축과 나란하지 않은)으로 잠근 선은 다듬지 않는다(꺾은선·삼각형 위 점). `SnapRefineLine.axis`가 축 이름이라 축이 아닌 직선을 넣을 자리가 없어서다
- 잠근 동안 그 밖의 점(점 붙잡기를 옮겨 온 자리, 커서에 가까운 점)은 0.14.0처럼 부르지 않는다
- 순수(`opencad-viewer3d/track`): `lockEdgeSnap(f, a, dir, segs, x, y, snapPx, visible?)`(결과 `{ p, distPx, seg }` — `segs`는 0.17.0 `trackEdgeSnap`과 같은 꼴),
  `lockFaceSnap(f, a, dir, x, y, snapPx, under, hitAt, steps?)`(결과 `{ p, distPx, hit }` — `under`·`hitAt`은 0.18.0 `axisFaceSnap`과 같다), 타입 `LockEdgeSnap`·`LockFaceSnap`.
  `dir`은 길이와 상관없다. `opencad-viewer3d/snap`: 타입 `SnapRefineFaceInput`, `openRefineKey`가 면 입력도 받는다

```ts
viewer.setMeasureSnap({
  ...options,
  inference: { axes: true, lock: true, axisEdges: true, axisFaces: true, lockEdges: true, lockFaces: true },
  refine, // 0.18.0 'axisEdge'까지 — 잠근 축과 모서리의 교차도 같은 함수로 다듬어진다
  // STEP: 축 직선과 B-rep 면의 교차(surfaceAt·lineMeetsSurface는 앱이 만들 함수 — 평면이면 null)
  refineFace: (c) => {
    const s = surfaceAt(c.face.id, c.face.index);
    return s ? lineMeetsSurface(s, c.line.origin, c.line.dir, c.point) : null;
  },
});
// 상태 줄: 0.18.0 예에 잠근 선 위 교차를 더한다
const where = h?.segment ? ' · 모서리 위' : h?.face ? ' · 면 위' : '';
if (h?.locked) status.textContent = `${h.axis ? ax(h.axis) : KIND[h.snap!]}${where} (잠금)`;
```

### 앱이 할 일

- NC·STEP: 코어를 `#v0.19.0`으로 올려도 새 선택을 켜지 않으면 값이 같다(`refine` 함수도 고칠 것이 없다). 잠금을 쓰는 측정에서 `lockEdges`(·`lockFaces`)를 켜면
  잠근 축·방향이 모서리와 만나는 점(·면을 뚫는 점)에 붙는다. 상태 줄에 "잠근 X축 · 모서리 위"·"· 면 위"를 보이고, 새 글은 앱 사전(en·ja·zh-CN·de)에 넣는다
  - NC: 공구 경로 이동(선분 묶음)에 `lockEdges`가 맞는다. 0.18.0 `'axisEdge'`로 원호 교차를 다듬는 판이면 잠근 축 교차도 같은 함수로 다듬어진다.
    소재·고정구 그물이 평면이면 `refineFace`는 필요 없다
  - STEP: B-rep 모서리에 `lockEdges`, 면에 `lockFaces`를 켜고, `refineFace`로 축 직선과 B-rep 곡면(원기둥·원뿔·구·원환은 식으로, 그 밖은 반복)의 교차를 준다.
    면 고르기에 쓰는 면 표(그물 id·삼각형 번호 → B-rep 면)로 곡면을 찾고, 평면 면은 `null`(삼각형 위 점이 이미 정확하다)
- SKP: 줄자가 순수 함수를 쓰면 잠근 동안 `lockEdgeSnap`·`lockFaceSnap`을 잠근 선 위 커서 점 앞에 넣는다(잠근 방향을 `dir`로). 면이 모형 그대로 평면이라 다듬을 것이 없다

## 0.20.0: 축이 꺾은선 토막의 활꼴만 지날 때의 곡선 교차·축이 아닌 잠근 선 다듬기·그물 면만 고르기

`refine`·`refineFace`를 주지 않고 `pick`에 `meshesOnly`를 주지 않으면 그림·고르기·측정은 0.19.0과 화소·값까지 같다(`npm run pixels -- --base v0.19.0`: 0.19.0의 장면 108개·값 49묶음 모두 같음.
새 값 3묶음(`arc-measure-axis-open`, `base·off-pick-meshes-only`)은 0.19.0에 없는 동작·선택이라 건너뛰고, head에서 두 번 찍어 같은 것을 확인했다).
`refine`이 `null`만 돌려줘도 값은 같다(앱 함수를 부르는 횟수만 는다).
바뀐 기본 동작은 둘이다. 둘 다 `refine`(·`refineFace`)을 준 앱에서만이고, 그 입력 타입은 그대로다(`SnapRefineLine.axis`만 선택 필드가 됐다).

- `refine`을 주고 `inference.axisEdges`·`track`·`lockEdges` 가운데 하나를 켠 앱은 축이 커서 둘레 토막과 3D로 만나지 않고 그 가까이를 지날 때도 `'axisEdge'`(`open: true`)로 불린다
- `inference.lockEdges`·`lockFaces`를 켜고 나란함·수직·선분 방향·앱이 정한 방향으로 잠근 동안에도 `refine`(`'axisEdge'`)·`refineFace`(`'axisFace'`)가 불린다(`line.axis` 없음). 0.19.0은 잠근 선이 축일 때만 불렀다

0.18.0·0.19.0의 축과 선분의 교차는 축이 꺾은선 토막과 3D로 만날 때(그 깊이에서 화면 반 화소 안)만 후보였다. 곡선을 나눈 꺾은선은 곡선보다 처짐만큼 안쪽에 있어 두 경우를 놓쳤다.
축이 곡선 평면을 뚫는 경우(원호 위 점에서 Z축을 내려 아래 원호에 닿는 자리 등)에는 곡선과 만나지만 현과는 처짐만큼 떨어져 지나간다.
같은 평면에서 축이 곡선에 거의 닿듯 지나가는 경우에는 한 토막의 활꼴(현과 곡선 사이)만 지나 현과 만나지 않는다. 두 경우 모두 코어가 후보를 만들지 못해 앱이 다듬을 기회가 없었다.
이번 판은 이런 토막도 앱에 열린 후보로 넘겨 곡선과의 교차를 받는다. 또 0.19.0에서 넘기지 못한 축이 아닌 잠근 선을 넘기고, SketchUp 앱 요청으로 그물 면만 고르는 선택을 공개한다.

### 축과 꺾은선 토막의 열린 교차(`refine` — `'axisEdge'`, `open`)

- 대상 선: 첫 점 축(`axisEdges`), 끌어온 축(`track` — 첫 점과 같은 점은 빼고, 첫 점 축과 같은 직선이면 한 번만), 잠근 선(`lockEdges` — 축이 아니어도)
- 후보: 선과 토막(범위 안) 사이 가장 가까운 거리가 그 깊이 화면 반 화소보다 멀고 `min(0.1 × 토막 길이, 커서 쪽 깊이에서 붙잡기 거리의 세계 길이)` 안인 토막
  - 0.1의 근거는 0.15.0 넓힌 교차와 같다. 한 토막이 45°보다 덜 도는 꺾은선이면 활꼴 높이(현 길이 / 2 × tan(돈 각 / 4))는 현 길이의 0.1배 안이다.
    곡선과 만나는 선은 그 토막의 활꼴을 지나므로 현에서 이만큼 안을 지난다
  - 붙잡기 거리로 자르는 까닭도 0.15.0과 같다(그보다 크게 어긋나면 다듬은 점이 커서에서 붙잡기 거리 밖이기 쉬워 헛 호출만 는다)
- 빼는 것: 선이 지나는 점이 그 토막 둘레인 것(첫 점이 곡선 위면 그 점에서 만난다), 커서가 지나는 점 둘레(붙잡기 거리)인 선,
  가장 가까운 자리가 토막 끝 밖인데(현과 나란하면 두 끝) 그 끝을 함께 쓰는 이웃 토막을 선이 3D로 지나는 것(곡선과의 교차는 그 이웃 토막의 코어 교차가 맡는다),
  코어 점이 커서에서 붙잡기 거리의 두 배 밖인 것(받는 점은 코어 점에서도, 커서에서도 붙잡기 거리 안이어야 한다)
- 넘기는 것: `kind: 'axisEdge'`, `open: true`, `point` = 선 위에서 토막에 가장 가까운 점(커서와 상관없다), `segment`, `line`(그 선 — 축이면 축 이름, 축이 아닌 잠근 선이면 `axis` 없음), `first`, `ray`.
  곡선 평면을 뚫는 축이면 `point`가 곧 곡선 위 교차와 거의 같은 자리이고, 활꼴만 지나는 선이면 토막 끝 쪽이다. 앱은 0.18.0과 같이 이 선이 `segment`의 곡선과 만나는 점(`point` 둘레)을 돌려준다
- 받는 규칙: 0.18.0 `acceptOnLine`(앱 점을 선 위로 내린 자리 — 앱 점에서 화면 반 화소 안, 코어 점에서 붙잡기 거리 안, 눈 뒤·가까운 면 앞이 아님)에 더해
  그 자리가 그 토막의 곡선 조각 위일 만한 자리여야 한다. 현에 내린 자리가 토막 범위 안이고 끝에서 화면 반 화소 넘게 떨어지며, 현에서 0.1 × 토막 길이 안이다
  (이웃 토막의 곡선 위 교차는 범위 밖이라 그 토막이 맡는다). 선이 지나는 점 자리가 아니고, 그 묶음 단면에서 남는 쪽, 커서에서 붙잡기 거리 안, 음영 계열에서 면에 가리지 않아야 한다
  - 코어 점 그대로 돌려줘도 받는다(곡선 평면을 수직으로 뚫는 축은 코어 점이 곧 교차다). 0.15.0 열린 후보와 다른 점이다. 모르면 `null`을 돌려준다
- 차례: 점 붙잡기가 없을 때 0.18.0의 다섯 점 후보(첫 점 축 위 나란한 자리 → 끌어온 축끼리 → 끌어온 축과 선분 → 첫 점 축과 선분 → 축과 면) 뒤 여섯째다.
  잠근 동안은 잠근 선과 선분 → 잠근 선이 면을 뚫는 점 → 열린 교차 → 잠근 선 위 커서 점이다. 열린 교차는 0.15.0 열린 후보처럼 다듬은 점으로 견준다(뒤 차례는 1화소 넘게 가까워야 이긴다)
- 호출 한도·기억: 0.15.0 열린 후보와 함께 미리 보기 한 번에 앱 함수를 새로 `OPEN_REFINE_CALLS`(6)번까지 부른다(0.15.0 열린 후보가 먼저 쓴다). 커서에 가까운 코어 점부터 부르고,
  받는 점이 지금 고른 것보다 가까울 수 없는 코어 점(커서에서 지금 고른 거리 + 붙잡기 거리 밖)부터는 부르지 않는다.
  결과는 0.18.0 `'axisEdge'`와 같은 열쇠(종류·코어 점·토막·선·첫 점 — 커서 광선 없이)로 기억해, 커서가 그 둘레에서 움직이는 동안과 Shift로 그 축에 잠근 뒤에도 다시 부르지 않는다
- 값: 0.18.0 축과 선분의 교차와 같은 꼴에 `refined: true`(`snap: 'axis'`, `axis`, 첫 점 축이면 `direction`, 끌어온 축이면 `trackFrom`, `segment`). 잠근 동안이면 잠근 선 위 점 값에 `segment`·`refined`
- 한 토막의 활꼴을 선이 두 번 지나면(곡선에 거의 닿듯) 코어 점에 가까운 교차 하나만 앱이 준다
- 꺾은선이 촘촘해 처짐이 화면 반 화소보다 작으면 0.18.0 코어 교차가 맡는다. 열린 교차는 확대해서 처짐이 보일 만큼일 때 붙는다
- 비용: 가짜 WebGL 시험 환경에서 원 109개(48토막씩 — 그 가운데 열 개는 첫 점 Z축 아래로 겹쳐 쌓았다)를 확대해 두고, 첫 점 Z축 아래로 커서를 400번 옮기며 미리 보기를 구했다(그리기 포함, 세 번).
  한 번 평균이 `refine` 없이 0.48~0.69 ms, `null`만 돌려주는 함수 0.55~0.71 ms, 정확한 원 0.47~0.70 ms다(이 기계 load average 56~77이라 차이는 흔들림 안이다).
  앱 함수는 원 열 개를 지나는 동안 열 번(기억 — 다시 지나가면 0번), 원 둘레를 따라 400번 옮길 때 한 번이었다
- 순수(`opencad-viewer3d/track`): `openEdgeCandidates(f, lines, segs, x, y, snapPx)`(`lines` = `{ from, dir }[]` — `OpenEdgeLine`, `segs`는 0.17.0 `trackEdgeSnap`과 같은 꼴,
  결과 `{ p, line, seg, gap, distPx }[]` — 커서에 가까운 차례), `openEdgeSnap(f, lines, segs, x, y, snapPx, refine, visible?)`(`refine(후보)`가 곡선 위 교차를 돌려주면 위 받는 규칙으로,
  결과 `{ p, core, line, seg, distPx }`), `OPEN_EDGE_CHORD`(0.1), 타입 `OpenEdgeLine`·`OpenEdgeCandidate`·`OpenEdgeSnap`. 호출 한도·기억은 부르는 쪽이 `refine` 안에서 한다(뷰어는 위와 같이)

```ts
// NC·STEP: 0.18.0 'axisEdge' 다듬기 그대로 — 열린 후보도 같은 계산(point 둘레에서 직선과 곡선의 교차, 만나지 않으면 null)
refine: (c) => {
  if (c.kind === 'axisEdge' && c.line) return lineMeetsCurve(c.line.origin, c.line.dir, curveOf(c.segment), c.point); // c.open이어도 같다
  // … 0.14.0·0.15.0 종류
  return null;
},
```

### 축이 아닌 잠근 선의 다듬기(`SnapRefineLine.axis` 선택)

- 0.19.0은 잠근 선이 축일 때만 잠근 선과 선분의 교차·면을 뚫는 점을 다듬었다. `SnapRefineLine.axis`가 축 이름(필수)이라 축이 아닌 직선을 넣을 자리가 없어서였다
- 0.20.0은 `axis`를 선택 필드로 두고, 나란함·수직·0.12.0 선분 방향·앱이 정한 방향으로 잠근 선도 `line = { origin: 첫 점, dir: 잠근 단위 방향 }`(`axis` 없음)으로 넘긴다
  (`lockEdges` — `'axisEdge'`, `lockFaces` — `refineFace`의 `'axisFace'`, 위 열린 교차도). 받는 규칙·기억은 0.18.0·0.19.0과 같다(기억 열쇠의 축 이름 자리는 `-`)
- 앱 타입: `line.axis`를 읽어 축 이름(`SnapAxis`) 자리에 넘기는 코드만 컴파일되지 않는다. NC·STEP·SKP의 지금 코드는 `line.origin`·`line.dir`만 읽어 그대로 컴파일되고,
  다듬기도 직선 일반으로 풀어 축이 아닌 잠근 선도 같은 함수로 다듬어진다

### 그물 면만 고르기(`pick(x, y, { meshesOnly: true })`)

- `PickOptions.meshesOnly`: 그물 면만 고른다. 선분·점 묶음과 그물 윤곽선은 고르지도 않고 면을 가리지도 않는다(`edges`는 무시한다). 면 위에 그린 선분·점 아래의 면을 알 때 쓴다
- 0.18.0 축과 면의 교차가 다시 맞춰 볼 때 쓰던 고르기와 같다. 단면 보기의 잘린 면(채운 면 — `section`)은 그물 면처럼 고르고, 숨긴 묶음·숨긴 구간·고르지 않는 묶음·단면에 잘린 쪽은 다른 고르기처럼 뺀다
- 주지 않거나 `false`면 0.19.0 그대로다

```ts
const hit = viewer.pick(x, y);                          // 면 위 선분이면 그 선분
const face = viewer.pick(x, y, { meshesOnly: true });   // 그 아래 면(없으면 null)
if (hit?.kind === 'line' && face) status.textContent = `${hit.id} · ${face.id} 면 위`;
```

### 앱이 할 일

- NC: 코어를 `#v0.20.0`으로 올린다. 0.18.0 `'axisEdge'` 다듬기(`refine.ts`의 축 직선과 원호의 교차 — `point` 둘레 곡선 범위에서 푼다)가 열린 후보도 그대로 푼다.
  같은 윤곽을 여러 깊이로 깎는 경로에서 위 원호 위 점(다듬은 점)을 첫 점으로 Z축을 내리면 아래 원호에 붙는다. 잠금을 쓰는 판이면 비스듬히 잠근 선도 같은 함수로 다듬어진다. 새로 보이는 글은 없다
- STEP: 코어를 올린다. `intersectAxis`(축 직선과 모서리 곡선의 교차 가운데 `point`에 가까운 것)가 열린 후보와 축이 아닌 잠근 선도 그대로 푼다.
  `refineFace`를 붙이는 판이면 `line.axis`를 읽지 않게 적는다
- SKP: 면 위 선을 따로 판정하던 곳을 `pick(x, y, { meshesOnly: true })`로 바꿀 수 있다. 곡선이 모형 선분 그대로라 열린 교차는 필요 없다
  (SketchUp 원호의 중심·반지름으로 곡선을 아는 줄자라면 `openEdgeSnap`을 `chooseTrackPoint` 묶음 끝에 넣을 수 있다)

## 0.21.0: 다듬기 기억만 비우기·잠근 선과 끌어온 축의 교차·붙잡지 않은 면 위 점 다듬기

`inference.lockTracks`를 켜지 않고 `refineFace`를 주지 않고 `clearMeasureRefine`을 부르지 않으면 그림·고르기·측정은 0.20.0과 화소·값까지 같다(`npm run pixels -- --base v0.20.0`: 0.20.0의 장면 108개·값 52묶음 모두 같음.
새 장면 1개(`base-measure-lock-track`)·값 4묶음(`base·off-measure-lock-track`, `arc-measure-clear-refine`, `globe-measure-on-face`)은 0.20.0에 없는 선택·API·동작이라 건너뛰고, head에서 두 번 찍어 같은 것을 확인했다).
`globe-measure-lock-refine`의 앱 함수는 이번 판부터 `'axisFace'`만 받게 고쳤다(0.20.0까지는 그 종류만 왔으므로 base 값은 그대로다).
바뀐 기본 동작은 하나다. `refineFace`를 준 앱은 붙잡지 않은 그물 면 위 점에서도 `'onFace'`로 불린다. 앱 함수가 `kind`로 거르면 값은 0.20.0과 같다(부르는 횟수만 는다).
입력 타입은 `SnapRefineFaceInput.kind`만 `SnapRefineFaceKind`(`'axisFace' | 'onFace'`)로 넓어졌고 꼴은 그대로다.

STEP 앱 요청 둘과 0.16.0부터 남은 일 하나를 채운다. STEP은 곡면 정의를 해석 워커에서 나중에 받는다. 받기 전에 부른 `refine`·`refineFace`의 `null`을 코어가 기억해, 받은 뒤에도 같은 둘레에서는 다시 묻지 않았다.
기억을 비우려면 `setMeasureSnap`을 다시 줘야 했고, 그러면 잠금·끌어온 점이 풀렸다. 또 붙잡지 않은 면 위 점은 다듬기로 넘기지 않아, 곡면을 찍으면 삼각형 위 점(처짐만큼 안쪽)이었다.
잠근 동안에는 끌어온 축을 쓰지 않아(0.16.0) 잠근 선이 다른 점에서 끌어온 축과 만나는 자리를 찍을 수 없었다. SketchUp 도움말 "Introducing Drawing Basics and Concepts"는
방향을 잠근 채 모형의 다른 형상을 참고하고, 점에서 끌어온 축 색 안내(From Point)와 다른 추론을 합쳐 더 복잡한 추론을 만든다고 설명한다(0.17.0·0.19.0과 같은 근거).

### 다듬기 기억만 비우기(`clearMeasureRefine`)

- `viewer.clearMeasureRefine(): number`: `refine`·`refineFace`가 돌려준 결과의 기억을 모두 잊는다. 0.14.0의 바로 앞 입력 하나, 0.15.0부터의 커서 광선을 뺀 열쇠 기억
  (열린 후보·`'axisEdge'`·`'axisFace'`), 0.21.0 `'onFace'`의 바로 앞 입력이다. 지운 항목 수를 돌려준다(바로 앞 입력 기억은 하나로 센다)
- 측정 미리 보기가 보이면 그 자리에서 다시 구한다. 그때 앱 함수를 다시 부르고, 받은 점이 바뀌면 표식·거리 글도 바뀐다. 미리 보기가 없으면 다음 미리 보기에서 부른다
- 그대로 두는 것: 찍은 점(찍은 다듬은 점과 측정 결과도), 추론 잠금(Shift·앱 단추), 끌어온 점, 나란함 기준 선분, 붙잡기 선택·한도, `pointsFor` 기억. 붙잡기가 꺼져 있으면 아무것도 하지 않고 0이다
- `pointsFor` 기억을 남긴 까닭: 바로 앞 고르기 하나뿐이라 커서가 움직이면 다시 부르고, 앱 자료가 바뀌면 `setMeasureSnap`을 다시 준다는 0.8.0 약속이 그대로다.
  다듬기 기억은 커서가 그 둘레를 지나는 동안(Shift로 잠근 뒤에도) 남는 열쇠 기억이라 따로 비울 길이 필요했다

```ts
// STEP: 해석 워커에서 곡면 정의를 받은 뒤(받기 전 refineFace의 null을 코어가 기억했다)
client.faceSurfaces().then((p) => {
  faceSurfs.set(doc, reviveFaceSurfaces(p));
  viewer.clearMeasureRefine(); // 잠금·끌어온 점은 그대로, 지금 미리 보기부터 곡면 위로
});
```

### 잠근 선과 끌어온 축의 교차(`inference.lockTracks`)

- 잠근 동안(Shift·`setMeasureInferenceLock` — 축, 나란함, 수직, 0.12.0 선분 방향, 앱이 정한 방향) 커서 아래 점 붙잡기가 없으면, 첫 점을 지나는 잠근 선이
  끌어온 점 P(0.16.0 — 머문 점, `setMeasureTrackPoints`)의 X·Y·Z 축과 3D로 만나는 점을 찍는다
  - 만난다: 두 직선 사이 가장 가까운 자리가 그 깊이에서 화면 반 화소 안이다(0.17.0 끌어온 축끼리의 교차와 같은 허용치). 찍는 점은 잠근 선 위의 그 자리다
    (잠근 방향 성분이 0인 좌표는 첫 점 그대로 — 세계 축으로 잠갔으면 남은 두 좌표가 첫 점과 정확히 같다)
  - 축으로 잠갔으면 P를 잠근 축에 수직으로 내린 자리 A + e·((P − A)·e)다. 0.16.0 첫 점 축 위 나란한 자리와 같은 셈이라, 잠그기 전 그 자리를 Shift로 잠가도 점이 그대로다.
    P가 첫 점과 다른 좌표 하나를 함께 쓰면 그 자리에서 P의 다른 축이 잠근 축과 만나고, 아니면 나란한 자리일 뿐이다(0.10.0 잠금에서 P를 가리킨 자리 `from`과 같은 점)
- 0.15.0 넓힌 교차처럼 조금 비켜 가는 직선까지 받지 않은 까닭: 그 허용치(토막 길이의 0.1배)는 곡선을 나눈 꺾은선의 처짐 때문이고, 곧은 두 직선에는 처짐이 없다.
  비켜 가는 두 직선에서 잠근 선 위 가장 가까운 자리는 P의 축 위 점이 아니다. 축 잠금이면 그 자리가 위의 나란한 자리라 이미 붙고, 축이 아닌 잠근 선이면 확대에 따라 붙었다 말았다 한다
- 빼는 것: 첫 점과 같은 P, 커서가 P 둘레(붙잡기 거리 — 점 붙잡기가 맡는다)인 P, 잠근 선과 나란한 P의 축, 교차가 첫 점이나 P 자리(P가 잠근 선 위)인 것, 가까운 면보다 앞인 점.
  커서가 첫 점 둘레면 보지 않는다. 단면·가림은 따지지 않는다(0.17.0 끌어온 축끼리와 같다 — 안내선끼리 만나는 점이다)
- 차례: 커서 아래 점 붙잡기(0.10.0 — 그 점을 잠근 선에 내린 자리) → 잠근 선과 끌어온 축의 교차 → 잠근 선과 선분(0.19.0) → 잠근 선이 면을 뚫는 점 → 열린 교차(0.20.0) →
  잠근 선 위 커서에 가까운 점. 가운데 넷 사이는 화면에서 가까운 것이고 뒤 차례는 1화소(`TRACK_YIELD_PX`) 넘게 가까워야 이긴다
  - 선분보다 먼저 둔 까닭: 잠그기 전에도 첫 점 축 위 나란한 자리(0.16.0)가 첫 점 축과 선분의 교차(0.18.0)보다 먼저다. 같은 점을 두 길로 구했을 때 Shift로 잠가도 같은 점에 같은 끌어온 점이 남는다
- 값: 잠근 선 위 점 그대로(`snap`은 잠금 종류, `axis`, `direction`, `locked`, 나란함의 `edge`)에, P의 축과 만나면 그 끌어온 축 `trackOther: { from: P, axis }`(0.17.0 `TrackGuide`,
  `trackFrom` 없이 — 첫째 선은 첫 점을 지나는 잠근 선이다), 축 잠금의 나란한 자리뿐이면 `trackFrom: P`가 더해진다. `MeasureHoverSnap`·`MeasurePoint`에 싣고 `MeasureResult`는 0.10.0 잠금 그대로다
- 앱이 가르는 법: `locked`에 `trackOther`가 있으면 잠근 선이 끌어온 축과 만나는 점, `trackFrom`이 있으면 잠근 축 위 끌어온 점과 나란한 자리다(0.19.0 `segment`·`face`, 0.10.0 `from`과 함께 오지 않는다)
- 그리기: 잠근 선은 잠금 그대로(바탕 테 위 굵은 실선)이고, 끌어온 점에서 그 점까지 그 축 색 점선을 긋는다(나란한 자리뿐이면 측정 색). 끌어온 점에는 큰 십자
- 새 선택으로 둔 까닭: `track`과 `lock`을 함께 켠 앱(NC·STEP)의 잠근 동안 점이 바뀌지 않게 따로 켠다. `true`에도 들지 않는다. 끌어온 점이 있어야 하므로 `track`과 함께 켠다
- 비용: 가짜 WebGL 시험 환경에서 첫 점 X축에 잠그고 끌어온 점 셋을 둔 채 잠근 축을 따라 커서를 400번 옮기며 미리 보기를 구했다(그리기 포함, 세 번).
  한 번 평균이 `lockTracks` 없이 0.043~0.062 ms, 켜고 0.047~0.057 ms다(이 기계 load average 10~37이라 차이는 흔들림 안이다). 400자리 가운데 58자리가 끌어온 점에 붙었다(만나는 축 22, 나란한 자리 36)
- 순수(`opencad-viewer3d/track`): `lockTrackSnap(f, a, dir, tracks, x, y, snapPx, axes?)`(결과 `{ p, from, axis?, distPx }` — `axis`는 이 점에서 잠근 선과 만나는 P의 축,
  `axes`는 앱의 그리기 축), 타입 `LockTrackSnap`

```ts
viewer.setMeasureSnap({ ...options, inference: { ...inference, lock: true, track: true, lockTracks: true } });
// 상태 줄: 0.19.0 예에 끌어온 축을 더한다
const meet = h?.trackOther ? ` · 끌어온 점 ${ax(h.trackOther.axis)} 위` : h?.trackFrom ? ' · 끌어온 점과 나란히' : '';
if (h?.locked) status.textContent = `${h.axis ? ax(h.axis) : KIND[h.snap!]}${where}${meet} (잠금)`;
```

### 붙잡지 않은 면 위 점 다듬기(`refineFace` — `'onFace'`)

- `refineFace`를 주면 붙잡지 않은 그물 면 위 점(점 붙잡기·추론·축 없이 커서 광선이 그물 삼각형을 맞은 점 — 단면의 잘린 면 채움은 빼고)도 넘긴다
- 입력은 0.19.0 `SnapRefineFaceInput` 꼴 그대로다. `kind: 'onFace'`, `point`(고르기가 맞은 삼각형 위 점 — `Pick3d.point`), `face`(그 면), `line`(커서 광선 — `ray`와 같은 값, `axis` 없음),
  `first`, `ray`. `line`이 곧 커서 광선이라 앱은 `'axisFace'`와 같은 계산(그 직선이 `face`가 놓인 곡면을 뚫는 점, `point` 둘레)으로 커서 아래 곡면 위 점을 준다. 평면이거나 모르면 `null`이다
- 받는 규칙(`acceptOnFace`): 앱 점을 커서 광선 위로 내린 자리가 앱 점에서 그 깊이 화면 반 화소 안이고, 코어 점에서 맞은 삼각형의 가장 긴 변 × 0.1(`ON_FACE_CHORD`) 안이며,
  눈 뒤·가까운 면 앞이 아니고 그 그물 단면에서 남는 쪽이어야 한다. 가림은 다시 따지지 않는다(0.19.0 `'axisFace'`와 같다)
  - 삼각형 크기로 자른 까닭: 광선 위 점은 화면 자리가 모두 같아 0.14.0의 화면 거리(붙잡기 거리)로는 앞뒤로 벗어난 점(구를 가로지른 맞은편 근 등)을 가를 수 없다.
    0.1의 근거는 0.15.0과 같다(한 변이 45°보다 덜 도는 나눔이면 곡면과 그 변 사이는 변 길이의 0.1배 안이다)
- 기억: 바로 앞 입력 하나(0.14.0 `'onEdge'`와 같다 — 커서마다 다른 광선이라 열쇠 기억에 넣지 않는다). 같은 자리에서 미리 본 뒤 누르면 다시 부르지 않는다
- 부르지 않는 때: 잠근 동안(잠근 선 위 점이 먼저다 — 0.14.0과 같다), 점 붙잡기·추론·축·끌어온 축 위 점, 선분 위 점(그것은 `refine`의 `'onEdge'`)
- 값: `refined: true`가 붙는다(`snap`은 `null` 그대로). `face`는 싣지 않는다. 0.18.0 `face`는 축이 면을 뚫는 점의 표시라 앱이 "축 · 면 위"로 읽는다. 찍은 점의 `measurePoints[i].refined`도 같다
- 앱 타입: `kind`만 넓어지고 꼴은 같아 `c.line`·`c.face`를 읽는 앱 함수는 그대로 컴파일된다. `kind`를 `'axisFace'` 하나로 받아 두는 코드(`const k: 'axisFace' = c.kind`,
  모든 종류를 가르는 `switch`)만 고쳐야 한다. NC·STEP·SKP의 지금 코드(main과 열린 PR)에는 없다
- 비용: 가짜 WebGL 시험 환경에서 구(48×24칸)를 확대해 두고 구 위로 커서를 400번 옮기며 미리 보기를 구했다(세 번). 한 번 평균이 `refineFace` 없이 0.042~0.096 ms,
  `null`만 돌려주는 함수 0.041~0.057 ms, 정확한 구 0.043~0.056 ms다. 앱 함수는 면 위 점(274자리)마다 한 번, 이동 한 번에 0.69번 불렸다(꼭짓점에 붙은 126자리는 부르지 않는다)
- 순수(`opencad-viewer3d/snap`): `acceptOnFace(f, core, q, ray, corners, maxPx)`(받으면 광선 위로 내린 자리, 아니면 `null`), `ON_FACE_CHORD`(0.1), 타입 `SnapRefineFaceKind`,
  `RefineMemo.clear()`(지운 수를 돌려준다), `openRefineKey`가 `'onFace'` 입력도 받는다

```ts
// STEP: refineFaceHit(facesnap.ts)은 kind를 보지 않고 line과 B-rep 곡면의 교차를 푼다 — 'onFace'면 커서 아래 곡면 위 점이 된다
refineFace: (c) => refineFaceHit(c, meshes, faces, surfaces), // 면 위 점을 다듬지 않으려면 c.kind !== 'axisFace'면 null
// 상태 줄: 붙잡지 않은 점을 다듬었으면 "곡면 위"
if (h && h.snap === null && h.refined) status.textContent = '곡면 위';
```

### 앱이 할 일

- NC: 코어를 `#v0.21.0`으로 올린다. `refineFaceSnap`(`refine.ts`)은 `kind !== 'axisFace'`면 `null`이라 면 위 점은 그대로다(부르는 횟수만 는다).
  판재 원기둥 벽 위 점도 원기둥 위로 옮기려면 `'onFace'`에 커서 광선과 원기둥의 교차를 따로 둔다(지금 함수는 축 직선이 세계 축이라고 본다).
  `MEASURE_INFERENCE`에 `lockTracks: true`를 더하면 잠근 축이 끌어온 점의 축과 만나는 점에 붙는다. 상태 줄에 "잠근 X축 · 끌어온 점 Y축 위"(`trackOther`)·
  "· 끌어온 점과 나란히"(`trackFrom`)를 보이고, 새 글은 앱 사전(en·ja·zh-CN·de)에 넣는다
- STEP: 코어를 올리고, 해석 워커에서 곡면 정의를 받은 뒤(`fetchFaceSurfaces`가 끝날 때) `viewer.clearMeasureRefine()`을 부른다. 그러면 받기 전 미리 본 자리도
  잠금·끌어온 점을 둔 채 곡면 위로 옮겨 간다. `refineFaceHit`은 `kind`를 보지 않으므로 `'onFace'`도 그대로 커서 아래 B-rep 곡면 위 점이 된다(면 경계 밖이면 `null`).
  원하지 않으면 `kind !== 'axisFace'`로 거른다. `lockTracks`와 상태 줄 글은 NC와 같다
- SKP: 줄자가 순수 함수를 쓰면 잠근 동안 `lockTrackSnap`을 `lockEdgeSnap` 앞에 넣는다(`chooseTrackPoint([lockTrackSnap(…, axes), lockEdgeSnap(…), lockFaceSnap(…)])` — 모형 축은 `axes`).
  면이 모형 그대로 평면이라 `'onFace'`와 기억 비우기는 필요 없다

## 0.22.0: 축이 곡면 삼각형을 비켜 가며 곡면만 뚫는 자리·한 토막 활꼴의 두 교차·누르기 알림의 그물 면만 고르기

`refineFace`·`refine`을 주지 않고 `onPick`에 둘째 인자를 주지 않으면 그림·고르기·측정은 0.21.0과 화소·값까지 같다(`npm run pixels -- --base v0.20.0`: 0.20.0의 장면 108개·값 52묶음 모두 같음.
새 장면 1개·값 8묶음 — 0.21.0의 넷과 0.22.0 `globe-measure-face-open`·`arc-measure-axis-twice`·`base·off-pick-on-meshes-only` — 은 0.20.0에 없는 선택·API·동작이라 건너뛰고, head에서 두 번 찍어 같은 것을 확인했다.
0.21.0의 새 장면·값 4묶음은 0.21.0 커밋과 견줘 같다. 이 기계 부하(load average 80~140)로 한 번에 돌린 비교가 CDP 120초 한도에 걸려, 장면·값 이름으로 세 묶음으로 나눠 돌렸다).
`refine`·`refineFace`를 쓰는 0.14.0~0.21.0 값 묶음(`globe-measure-lock-refine`·`arc-measure-axis-open` 등)도 같다 — 그 자리들에는 면의 열린 교차·둘째 힌트 후보가 없다.
`refineFace`가 `null`만 돌려줘도 값은 같다(앱 함수를 부르는 횟수만 는다).
바뀐 기본 동작은 둘이다. 둘 다 `refineFace`·`refine`을 준 앱에서만이고, 입력 타입은 `SnapRefineFaceInput.open`(선택 필드)만 더해졌다.

- `refineFace`를 주고 `inference.axisFaces`·`lockFaces` 가운데 하나를 켠 앱은 축·잠근 선이 커서 둘레 삼각형을 뚫지 않고 그 가까이를 지날 때도 `'axisFace'`(`open: true`)로 불린다
- `refine`을 준 앱은 0.20.0 열린 교차의 선이 한 토막의 활꼴을 두 번 지날 수 있는 자리에서 둘째 힌트로 한 번 더 불린다. 그 자리의 앱 점은 코어 점 거리 대신 토막 범위로 받는다

0.21.0까지 축이 면을 뚫는 점(0.18.0 `axisFaces`, 0.19.0 `lockFaces`)은 축이 삼각형과 만날 때만 후보였다. 곡면을 나눈 삼각형은 볼록한 곡면보다 처짐만큼 안쪽에 있어,
축이 곡면을 스치면(구의 실루엣 둘레, 볼록한 원기둥 벽을 비스듬히 스치는 축) 곡면과는 만나지만 삼각형은 비켜 간다. 0.20.0이 꺾은선 토막에서 고친 것과 같은 일이 면에서 남아 있었다.
또 0.20.0 열린 교차는 선이 한 토막의 활꼴을 두 번 지나면(곡선이 선 쪽으로 볼록해 곡선에 거의 닿듯 지나갈 때) 힌트 하나로 부르므로 교차 하나만 받았다.
`pick`의 그물 면만 고르기(0.20.0)는 누르기 알림(`onPick`)에는 없어, 앱이 누른 자리를 따로 다시 골라야 했다.

### 면의 열린 교차(`refineFace` — `'axisFace'`, `open`)

- 대상 선: 첫 점 축과 끌어온 축(`axisFaces` — 끌어온 축이 첫 점 축과 같은 직선이면 한 번), 잠근 선(`lockFaces` — 축이 아니어도)
- 보는 삼각형: 화면에서 커서 붙잡기 거리 안의 보이는 그물 삼각형(화면 거리 차례로 24개까지 — `trianglesNear`). 커서가 그물 면 위가 아니어도(실루엣 바깥) 본다.
  숨긴 묶음·숨긴 구간·고르지 않는 묶음과 한 단면 평면의 잘린 쪽에 모두 있는 삼각형은 뺀다. 화면에 그린 선이 커서에서 붙잡기 거리 밖을 지나면 그 선은 보지 않고,
  남는 선이 없으면 삼각형도 모으지 않는다(받는 점은 선 위·커서에서 붙잡기 거리 안이다 — 축 둘레가 아닌 미리 보기의 비용은 0.21.0과 같다)
- 후보: 선과 삼각형 사이 가장 가까운 거리가 그 깊이 화면 반 화소보다 멀고 `min(0.1 × 가장 긴 변, 커서 쪽 깊이에서 붙잡기 거리의 세계 길이)` 안
  - 0.1의 근거는 0.20.0 `OPEN_EDGE_CHORD`와 같다. 한 변이 45°보다 덜 도는 나눔이면 곡면과 그 삼각형 사이(활꼴 높이)는 가장 긴 변의 0.1배 안이고,
    곡면과 만나는 선이 삼각형을 비켜 가면 그 사이를 지나므로 삼각형에서 이만큼 안을 지난다
- 빼는 것: 선 위에서 삼각형에 가장 가까운 점이 선이 지나는 점(첫 점이 곡면 위면 그 점에서 만난다), 커서가 지나는 점 둘레(붙잡기 거리)인 선,
  가장 가까운 자리가 삼각형의 변(꼭짓점)인데 그 변(꼭짓점)을 함께 쓰는 이웃 삼각형을 선이 뚫고 그 뚫는 자리에서 곡면 위 교차까지가 붙잡기 거리 안인 것
  (선을 따라 `0.1 × 이웃의 가장 긴 변 ÷ 이웃 평면과 선 사잇각의 사인` — 그 안이면 0.18.0 코어 교차와 0.19.0 다듬기가 맡는다)
  - 이웃을 뚫어도 늘 빼지 않는 까닭: 비스듬히 스치는 선은 그물을 뚫는 자리와 곡면을 뚫는 자리가 몇 삼각형 떨어질 수 있다. 그때 0.19.0 다듬기는 코어 점에서 붙잡기 거리 밖이라 버린다
- 넘기는 것: `kind: 'axisFace'`, `open: true`, `point` = 선 위에서 그 삼각형 무게중심에 가장 가까운 점, `face`(그 삼각형 — 그물 id·삼각형 번호·눈 쪽 법선), `line`(그 선 — 축이면 축 이름), `first`, `ray`.
  앱은 0.19.0과 같이 이 선이 `face`가 놓인 곡면을 뚫는 점(`point` 둘레)을 돌려준다.
  `point`는 코어 점이 아니라 힌트라 곡면 밖일 수 있다 — 선이 볼록한 곡면을 아주 얕게 스치면 무게중심 쪽 힌트가 두 교차 바깥(원기둥이면 반지름보다 먼 자리)에 놓인다(0.24.0에서 바로잡음 — 아래 앱이 할 일)
  - 힌트를 선과 삼각형의 가장 가까운 자리로 두지 않은 까닭: 선이 삼각형을 비켜 가면 그 자리는 늘 이웃과 함께 쓰는 테두리라 이 삼각형 위 교차와 이웃 위 교차를 가르지 못한다
    (구를 스치는 선은 곡면을 두 번 뚫는다 — 적도 칸 둘레를 스치는 Z축이면 그 자리가 위·아래 칸 사이의 변이라 두 교차에서 같은 거리다). 무게중심 쪽 자리면 이 삼각형 위 교차가 온다
- 받는 규칙: 앱 점을 선 위로 내린 자리(앱 점에서 화면 반 화소 안, 눈 뒤·가까운 면 앞이 아님)가 그 삼각형 위 곡면 조각 자리여야 한다.
  삼각형 평면에 내린 발이 삼각형 안(반 화소 허용 — 이웃 삼각형 위 교차는 그 삼각형이 맡는다)이고 평면에서 `0.1 × 가장 긴 변` 안(앞뒤 어느 쪽이든)이다.
  선이 지나는 점 자리가 아니고, 그 그물 단면에서 남는 쪽, 커서에서 붙잡기 거리 안, 음영 계열에서 면에 가리지 않아야 한다
  - 0.20.0의 "코어 점에서 붙잡기 거리 안"은 두지 않는다. 삼각형 위 조각 자리라는 판정이 앱 점을 그 삼각형 둘레로 이미 묶고, 무게중심 쪽 힌트는 큰 삼각형이면 교차에서 붙잡기 거리보다 멀 수 있다
- 차례: 점 붙잡기가 없을 때 0.20.0의 여섯 후보 뒤 일곱째, 잠근 동안은 0.20.0 열린 교차 뒤다. 0.20.0 열린 교차처럼 다듬은 점으로 견준다(뒤 차례는 1화소 넘게 가까워야 이긴다)
- 호출 한도·기억: 0.15.0·0.20.0 열린 후보와 함께 미리 보기 한 번에 새로 `OPEN_REFINE_CALLS`(6)번까지(그 둘이 먼저 쓴다). 커서에 가까운 힌트부터 부른다.
  결과는 0.19.0 `'axisFace'`와 같은 열쇠(종류·힌트·면·선·첫 점 — 커서 광선 없이)로 기억해, 커서가 그 둘레에서 움직이는 동안과 Shift로 그 축에 잠근 뒤에도 다시 부르지 않는다.
  `clearMeasureRefine`(0.21.0)이 함께 비운다
- 값: 0.18.0 축과 면의 교차와 같은 꼴에 `refined: true`(`snap: 'axis'`, `axis`, 첫 점 축이면 `direction`, 끌어온 축이면 `trackFrom`, `face`는 그 곡면 조각 아래 삼각형).
  잠근 동안이면 잠근 선 위 점 값에 `face`·`refined`
- 한 삼각형 위 곡면 조각을 선이 두 번 지나면(아주 얕게 스칠 때) 힌트에 가까운 교차 하나만 받는다(0.24.0부터 둘째 힌트로 두 교차 모두 — 아래 0.24.0). 곡면이 오목하게 보이는 자리(구멍 안쪽 벽)는 앱 점이 삼각형 뒤라
  처짐이 2화소보다 크면 가림 판정에 걸려 받지 않는다
- 비용: 가짜 WebGL 시험 환경에서 구(48×24칸)를 적도에서 스치는 첫 점 Z축(그물 삼각형은 비켜 간다)을 따라 커서를 400번 옮기며 미리 보기를 구했다(그리기 포함, 세 번씩 세 차례).
  한 번 평균이 `refineFace` 없이 0.06~0.63 ms, `null`만 돌려주는 함수 0.13~0.45 ms, 정확한 구 0.13~0.41 ms다(이 기계 load average 47~141이라 차이는 흔들림 안이다).
  앱 함수는 1,200번 옮기는 동안 다섯 번 불렸고(기억), 400자리 가운데 두 교차 둘레 30자리가 구 위 교차에 붙었다.
  같은 첫 점에서 축에서 먼 구 앞면 위 400자리를 옮기면 `'axisFace'`는 한 번도 불리지 않는다(선이 커서 둘레를 지나지 않아 삼각형도 모으지 않는다)
- 순수: `opencad-viewer3d/track` — `openFaceCandidates(f, lines, tris, x, y, snapPx)`(`lines`는 0.20.0 `OpenEdgeLine`, `tris`는 `TrackTriangle`(`{ corners, wpp, keep? }`) 목록,
  결과 `{ p, line, tri, gap, distPx }[]` — 커서에 가까운 힌트 차례), `openFaceSnap(f, lines, tris, x, y, snapPx, refine, visible?)`(결과 `{ p, core, line, tri, distPx }`),
  `OPEN_FACE_CHORD`(0.1), 타입 `TrackTriangle`·`OpenFaceCandidate`·`OpenFaceSnap`. `opencad-viewer3d/scenepick` — `trianglesNear(f, x, y, items, o, tolPx, max?)`(결과 `NearTriangleHit[]`)

```ts
// STEP·NC: 0.19.0 refineFace 그대로 — 열린 후보도 같은 계산(point 둘레에서 직선과 곡면의 교차, 만나지 않으면 null)
refineFace: (c) => {
  const s = surfaceAt(c.face.id, c.face.index); // c.open이어도 face는 그 곡면 조각 아래 삼각형이다
  return s ? lineMeetsSurface(s, c.line.origin, c.line.dir, c.point) : null;
},
```

### 한 토막 활꼴의 두 교차(`refine` — `'axisEdge'`, `open`의 둘째 힌트)

- 조건: 0.20.0 열린 교차 후보 가운데, 선과 토막의 가장 가까운 자리가 토막 끝 밖이거나 현과 나란하고(0.20.0 `clamped`), 선이 현의 직선과 같은 평면이며
  (엇갈린 거리가 화면 반 화소 안 — 나란하면 늘), 현 가운데에서 선까지(현에 수직) 거리가 `0.1 × 토막 길이` 안인 것
  - 같은 평면에서 토막 밖에서 만나는 선은 현 양 끝에서 활꼴 밖이라, 활꼴 안을 지나면 들어가고 나오는 두 교차가 있다. 활꼴은 가운데쯤이 가장 높고(0.1 × 현 길이 안)
    곡선에 거의 닿듯 지나는 선은 그 높은 자리를 지난다. 토막 끝 둘레만 스치는 선(가운데에서 멀다)은 0.20.0처럼 가까운 끝 쪽 교차 하나다
  - 커서 둘레 토막 가운데 끝을 함께 쓰는 이웃이 있으면 볼록한 쪽을 본다. 꺾은선이 곡선을 나눴으면 이웃의 먼 끝은 곡선이 휘어 들어가는 쪽에 있고 활꼴은 그 반대쪽이다.
    선이 이웃의 먼 끝 쪽(곡선 안쪽)을 지나면 뺀다. 이웃이 없거나 양쪽에 있으면(굽은 방향이 바뀐다) 따지지 않는다
- 둘째 힌트: 현의 다른 끝(나란하면 두 끝 각각)에서 선에 내린 발을 `point`로 한 번 더 부른다(그 끝을 함께 쓰는 이웃 토막을 선이 지나면 그 발은 뺀다).
  0.20.0 힌트(가까운 끝의 발, 나란하면 현 가운데의 발)는 그대로다. 앱이 `point` 둘레의 교차 하나를 주면 두 교차가 따로 온다 — 두 교차의 가운데는 두 끝의 발 사이에 있다
- 받는 규칙: 이 선·토막의 앱 점(0.20.0 힌트 것도)은 "코어 점에서 붙잡기 거리 안"을 보지 않고 0.20.0 토막 범위 판정(현에 내린 자리가 범위 안·끝에서 반 화소 넘게, 현에서 `0.1 × 토막 길이` 안)과
  선 위·커서 붙잡기 거리·단면·가림으로 받는다. 힌트가 현 끝이라 활꼴 가운데쯤의 교차에서 멀 수 있고, 토막 범위 판정이 앱 점을 그 토막 곡선 조각으로 묶는다.
  그래서 이 후보는 힌트가 커서에서 붙잡기 거리의 두 배 밖이어도 남긴다
- 호출 한도·기억: 0.20.0과 같다(한도 안에서 커서에 가까운 힌트부터, 힌트마다 다른 열쇠). Shift로 그 축에 잠가도 같은 열쇠라 다시 부르지 않는다
- 값: 0.20.0 열린 교차와 같다(`refined: true`, `segment`). 두 교차 가운데 커서에 가까운 것이다
- 비용: 같은 환경에서 12토막 원의 한 토막 활꼴 안을 현과 나란히 지나는 첫 점 X축을 따라 커서를 400번 옮겼다. 한 번 평균이 `refine` 없이 0.05~0.81 ms,
  `null` 0.07~0.68 ms, 정확한 원 0.07~0.43 ms다(load average 47~141). 앱 함수는 1,200번 옮기는 동안 다섯 번 불렸고, 두 교차 둘레 49자리가 원 위 교차에 붙었다
- 순수: `openEdgeCandidates`의 결과에 `twice`(이 선·토막이 두 번 지날 수 있다)·`twin`(더한 둘째 힌트) 선택 필드, `openEdgeSnap`이 위 받는 규칙을 쓴다

### 누르기 알림의 그물 면만 고르기(`onPick(cb, { meshesOnly: true })`)

- `viewer.onPick(cb, opts?: OnPickOptions)`: `{ meshesOnly: true }`면 그 알림에는 누른 자리에서 그물 면만 고른 결과(0.20.0 `pick(x, y, { meshesOnly: true })`와 같은 고르기 —
  포인터 종류는 그 누르기의 것)를 준다. 그물 면이 없으면 `null`이다. 같은 누르기의 다른 알림(선택 없이 단 것)은 0.21.0 그대로다
- 그 고르기는 누르기 한 번에 한 번만 구해 그런 알림들이 함께 쓴다. 같은 함수를 다시 달면 마지막 선택을 따른다. 측정 중 누르기는 0.21.0처럼 알리지 않는다
- 공개 메서드 가운데 `Pick3d`를 돌려주는 것은 `pick`과 `onPick`뿐이다(사각형 고르기·호버 고르기 API는 없다). 측정 점 고르기는 늘 선분·점이 먼저다

```ts
viewer.onPick((p) => select(p));                                       // 면 위 선분이면 그 선분(그대로)
viewer.onPick((face) => (underFace = face), { meshesOnly: true });     // 같은 누르기의 그 아래 면(없으면 null)
```

### 앱이 할 일

- NC: 코어를 `#v0.22.0`으로 올린다. `refineFaceSnap`(`refine.ts`)이 `'axisFace'`를 직선과 원기둥 벽의 교차로 풀면, 판 외곽선 둥근 모서리처럼
  볼록한 원기둥 벽을 스치는 축이 벽 삼각형을 비켜 가도 원기둥 위 교차에 붙는다(`MEASURE_INFERENCE`가 `axisFaces`·`lockFaces`를 켠 판).
  다만 열린 후보(`c.open`)는 따로 푼다(0.24.0에서 바로잡음 — 0.22.0은 "그 함수가 코어 점이 벽의 처짐 안(반지름 `r·cos(반각)`~`r`)인지 보는 판정은 열린 후보의 힌트에도 맞는다"고 적었다).
  열린 후보의 `point`는 선 위에서 그 삼각형 무게중심에 가장 가까운 점(힌트)이라, 축이 볼록한 호 꼭대기를 아주 얕게 스치면 힌트가 두 근 바깥 — 원기둥 밖(중심에서 `r`보다 멀다) — 이고
  두 근이 모두 그 삼각형 위(그 현의 각 범위 안)일 수 있다. NC 25차가 실제 코어 판정으로 확인했다(판 외곽선 R50 볼록 호 17토막, 꼭대기를 0.005 아래로 스치는 X축 — 높이 3의 삼각형은 힌트가 원기둥 밖이라
  처짐 판정·"코어 점에서 바깥쪽 근" 규칙으로는 `null`이었다).
  앱이 볼 것: `c.open`이면 힌트가 처짐 안인지 보지 않고 면 법선(`c.face.normal` — 그 현의 가운데 방향, 눈 쪽이면 뒤집힌다)으로 벽을 찾고, 그 현의 각 범위 안 근 가운데 힌트에 가까운 것을 준다.
  커서 광선은 보지 않는다(코어가 커서 광선 없는 열쇠로 기억하므로 같은 입력에는 같은 답이어야 한다). 받을지(그 삼각형 위 곡면 조각 자리·커서 붙잡기 거리 안·가림)는 코어가 정한다.
  두 근이 한 삼각형 위면 힌트 쪽 하나만 붙는다(위 "한 삼각형 위 곡면 조각을 선이 두 번 지나면")
  `refine`(`'axisEdge'`)은 열린 후보를 그대로 풀어, 같은 평면에서 원호에 거의 닿듯 지나는 축이 두 교차 모두에 붙는다. 새로 보이는 글은 없다
- STEP: 코어를 올린다. `refineFaceHit`은 `kind`·`open`을 보지 않고 `line`과 B-rep 곡면의 교차를 푸므로 그대로 붙는다(면 경계 밖이면 `null`).
  면 고르기 중 PMI·모서리 위를 눌러도 그 아래 B-rep 면을 알려면 `onPick(…, { meshesOnly: true })`를 따로 단다(지금처럼 `pick`을 다시 부르지 않아도 된다)
- SKP: 면이 모형 그대로 평면이라 면의 열린 교차·둘째 힌트는 필요 없다. 면 위 선을 눌렀을 때 그 아래 면을 따로 고르던 곳은 `onPick`의 `meshesOnly`로 바꿀 수 있다

## 0.23.0: 열린 교차를 토막 범위로 받기·반투명 그물 너머 고르기·덧그림 글상자 비키기와 뷰 큐브 자리

`throughTranslucent`를 주지 않고 `setMeasureLabelAvoid`를 쓰지 않으면 그림·고르기는 0.22.0과 화소·값까지 같다(`npm run pixels -- --base v0.20.0 --timeout 900`: 0.20.0의 장면 108개·값 52묶음 모두 같음.
새 장면 1개·값 11묶음 — 0.21.0·0.22.0의 여덟과 0.23.0 `base·off-pick-through`·`base-annotation-avoid` — 은 0.20.0에 없는 선택·API·동작이라 건너뛰고, head에서 두 번 찍어 같은 것을 확인했다.
0.21.0·0.22.0의 새 장면·값은 0.22.0 커밋과 견줘 같다 — 앱 호출 수를 적는 `globe-measure-face-open`·`arc-measure-axis-twice`도. 이 기계 부하(load average 30~46)에서 새 `--timeout 900`으로 한 번에 끝났다(811초)).
`refine`·`refineFace`를 쓰는 0.14.0~0.22.0 값 묶음도 같다 — 그 자리들에는 받는 한도·후보 거르기로 달라지는 후보가 없다.

바뀐 기본 동작은 셋이다. 모두 `refine`·`refineFace`·`setMeasureLabelAvoid`를 쓰는 앱에서만이고, 입력 타입은 그대로다(후보 타입에 `reachPx`만 더해졌다).

- `refine`을 준 앱: 0.20.0 열린 교차(`'axisEdge'`, `open`)의 앱 점을 "코어 점에서 붙잡기 거리 안" 대신 토막 범위와 커서 붙잡기 거리로 받는다(0.22.0은 두 번 지날 수 있는 토막에서만 그랬다).
  선에서 그 토막 범위인 조각이 커서에서 붙잡기 거리 밖인 후보는 부르지 않는다(부르는 횟수가 줄 수 있다)
- `refineFace`를 준 앱: 면의 열린 교차도 같은 근거로 그 삼각형 위 곡면 조각 자리인 선 조각이 커서에서 붙잡기 거리 밖이면 부르지 않는다. 곡면이 오목하게 보이는 자리(구멍 안쪽 벽)의
  앱 점이 제 조각(그 삼각형과 꼭짓점을 함께 쓰는 이웃)에만 가리면 받는다(0.22.0은 처짐이 2화소보다 크면 받지 않았다)
- `setMeasureLabelAvoid`를 쓰는 앱: 앱 측정 덧그림(`setAnnotations`)의 글상자도 그 사각형을 비켜 그린다(화면 덧그림만 — 그림 저장은 기본 자리)

NC 23차 요청은 원호 꼭대기를 현과 거의 나란히 스치는 축이었다. 축과 현이 거의 나란하면 0.20.0 열린 교차의 코어 점이 현 끝(꼭짓점) 위라, 받는 한도 "앱 점이 코어 점에서 붙잡기 거리 안"으로는
붙을 자리가 꼭짓점 둘레뿐이고 거기서는 끝점 붙잡기가 먼저 이긴다. 이 경우는 0.22.0 둘째 힌트(두 번 지날 수 있는 토막 — 그 토막은 코어 점 거리 대신 토막 범위로 받는다)가 이미 맡아,
NC 측정 모델을 옮긴 코어 시험(`tests/v0230.test.ts` — 반지름 25 원호 33토막, 1화소의 세계 길이 0.002~0.1 사이 12단, δ 0.0001~0.01, 두 교차 모두)에서 0.22.0도 12단 가운데 8단에서 붙는다
(NC 23차 기록의 0.20.0은 0단). 0.23.0은 같은 받는 규칙을 모든 열린 교차 후보로 넓히고, 후보 거르기도 같은 근거로 바꿨다.
NC 22차 요청은 반투명 판 너머 구멍·포켓 벽(반투명 그물이 광선에 먼저 맞는다), STEP 24차 요청은 휴대폰에서 덧그림 글상자가 측정 띠·뷰 큐브와 겹치는 것이었다.

### 열린 교차의 받는 한도(`refine` — `'axisEdge'`, `open`)

- 받는 규칙: 앱 점을 선 위로 내린 자리(앱 점에서 화면 반 화소 안, 눈 뒤·가까운 면 앞이 아님)가 그 토막의 곡선 조각 자리여야 한다 — 현에 내린 자리가 토막 범위 안이고 끝에서 화면 반 화소 넘게 떨어지며,
  현에서 `0.1 × 토막 길이` 안. 선이 지나는 점 자리가 아니고, 그 묶음 단면에서 남는 쪽, 커서에서 붙잡기 거리 안, 음영 계열에서 면에 가리지 않아야 한다(0.20.0 규칙에서 "코어 점에서 붙잡기 거리 안"만 뺐다)
  - 뺀 까닭: 토막 범위 판정이 앱 점을 그 토막 곡선 조각으로 이미 묶는다. 이웃 토막의 근은 범위 밖, 맞은편 근·현에서 먼 선 위 점은 현에서 `0.1 × 토막 길이` 밖, 커서에서 먼 근은 커서 거리로 버린다
  - 0.22.0과 달라지는 자리: 둘째 힌트가 없는 열린 후보의 앱 점이 코어 점에서 붙잡기 거리 밖일 때다. 예를 들어 같은 평면에서 토막 끝 바로 바깥을 지나 활꼴을 두 번 지나지만 현 가운데에서
    `0.1 × 토막 길이`보다 멀어 둘째 힌트를 두지 않는 선(12토막 원의 한 토막을 12° 기울어 지나는 선)에서, 앱이 힌트(현 끝 쪽) 대신 커서 광선 쪽 근을 주면 받는다
- 후보 거르기(`reachPx`): 선에서 그 토막 범위(현에 내린 자리가 토막 안, 현의 직선에서 `0.1 × 토막 길이` 안 — 현 둘레 원기둥과 두 끝 평면 사이)인 조각과 커서의 화면 거리가 붙잡기 거리 안인 후보만 앱에 묻는다.
  받는 점은 그 조각 위·커서에서 붙잡기 거리 안이므로 필요조건이다. 0.22.0까지는 "코어 점이 커서에서 붙잡기 거리의 두 배 안"(두 번 지날 수 있는 토막은 거르지 않았다)이었다
  - 고른 것이 있으면 `reachPx`가 그 거리 이상인 후보는 부르지 않는다(받아도 더 가까울 수 없다). 부르는 차례는 그대로 커서에 가까운 코어 점부터다
- 면의 열린 교차(`refineFace` — `'axisFace'`, `open`)는 받는 규칙이 이미 같은 근거(그 삼각형 위 곡면 조각 자리 + 커서 붙잡기 거리)라 그대로 두고, 같은 거르기·건너뛰기를 더했다.
  조각은 삼각형 세 변을 화면 1화소만큼 바깥으로 민 수직 평면과 평면에서 `±(0.1 × 가장 긴 변 + 1화소)` 덮개 사이의 기둥을 선이 지나는 자리다
- 앱 호출 수: 화소·값 회귀의 0.22.0 값 묶음(`globe-measure-face-open`·`arc-measure-axis-twice` — 호출 수와 힌트 자리 포함)은 0.22.0 커밋과 같다. 구를 스치는 Z축 위 근 둘레를 가리킬 때
  아래 칸 삼각형(그 조각이 커서에서 멀다)은 이제 묻지 않는다(0.22.0 시험 하나를 그만큼 고쳤다)
- 순수(`opencad-viewer3d/track`): `OpenEdgeCandidate.reachPx`·`OpenFaceCandidate.reachPx`(필수 필드 — 후보 객체를 만들어 넘기는 앱 코드만 고친다), `openEdgeSnap`·`openFaceSnap`이 위 규칙을 쓴다

### 오목하게 보이는 곡면의 열린 면 교차

- 곡면이 눈에서 보아 오목한 자리(구멍 안쪽 벽)는 곡면이 그 삼각형 뒤에 있어, 앱이 준 곡면 위 교차가 그 칸 삼각형(과 이웃)에 가린다. 0.22.0은 그 깊이 차가 2화소(가림 판정 허용치)보다 크면 받지 않았다
- 0.23.0: 앱 점 화면 자리의 광선이 처음 맞은 불투명 면이 그 삼각형이거나 꼭짓점을 함께 쓰는 이웃이고, 앱 점이 그 면에서 `0.1 × 두 삼각형 가운데 가장 긴 변 + 2화소` 안이면 보인다고 본다.
  그 조각이 곧 앱 점이 놓인 곡면을 나눈 것이다. 다른 면(앞의 다른 벽·상자)에 먼저 맞았거나 그보다 멀리 뒤면 예전처럼 가린다
- 순수(`opencad-viewer3d/track`): `hiddenByOwnPatch(tri, hit, p, tol)`(`hit` = `{ corners, point, normal }` — 그 자리 광선이 처음 맞은 면)

### 반투명 그물 너머 고르기(`throughTranslucent`)

- `PickOptions.throughTranslucent`·`OnPickOptions.throughTranslucent`·`MeasureSnapOptions.throughTranslucent`(기본 꺼짐): 반투명 그물(투명도 < 1 — 그물 색 알파, `setItemOpacity`, `setItemColor`)의 면을 지나 고른다.
  광선이 그 뒤에서 불투명 그물 면(단면의 잘린 면 채움 포함)을 맞으면 가장 앞의 불투명 면을 고르고, 반투명 면만 맞으면 예전처럼 가장 앞의 반투명 면이다
- 그대로인 것: 선분·점·윤곽선 고르기(반투명 그물의 윤곽선도 고른다), 가림(반투명 면은 원래 선분·점·앱 점을 가리지 않는다). `meshesOnly`와 함께 줄 수 있다
- 측정(`setMeasureSnap({ …, throughTranslucent: true })` — 이것만 줘도 붙잡기가 켜진다): 커서 아래 면 위 점·꼭짓점, 축이 면을 뚫는 점(`axisFaces`·`lockFaces`의 다시 맞춰 보기),
  `'onFace'` 다듬기, `pointsFor`에 넘기는 고르기가 모두 그 뒤 불투명 면을 본다. 면의 열린 교차가 보는 커서 둘레 삼각형은 반투명 그물도 본다
- 누르기 알림은 선택 짝(`meshesOnly`·`throughTranslucent`)마다 고르기를 한 번만 구해 함께 쓴다
- 순수(`opencad-viewer3d/scenepick`): `ScenePickOptions.throughTranslucent`(불투명 판정은 `opaque` — 없으면 색 알파 ≥ 0.999)

```ts
// NC: 반투명 판 너머 구멍·포켓 벽을 측정한다(판 그물이 반투명일 때)
viewer.setMeasureSnap({ ...panelSnapOptions(t), throughTranslucent: true });
viewer.onPick((p) => select(p), { throughTranslucent: true }); // 누르기도 판 너머
```

### 덧그림 글상자 비키기(`setAnnotations` ↔ `setMeasureLabelAvoid`)와 뷰 큐브 자리(`viewCubeRect`)

- `setMeasureLabelAvoid`의 사각형이 있으면 앱 측정 덧그림의 글상자도 측정 거리 글상자와 같은 차례(순수 `placeMeasureLabel` — 기준점 네 귀, 거리·반지름이면 두 점을 잇는 선분을 따라,
  피할 사각형 위·아래)로 비켜 그린다. 옮길 때는 그 덧그림의 점 표식도 될 수 있으면 가리지 않는다. 피할 사각형이 없으면 0.22.0과 같은 자리다(기본 자리 계산이 `placeMeasureLabel`의 첫 자리와 한 줄씩 같다)
- 커서 둘레(`pointerRadius`)는 보지 않는다(커서를 따라다니는 측정 거리 글상자와 달리 덧그림 글상자는 제자리에 있다). 화면 덧그림만 옮기고 그림 저장(`toBlob`·`renderImage`)은 기본 자리다
- `viewer.annotationLabelRects`: 마지막으로 화면에 그린 덧그림 글상자 자리(덧그림 차례, 캔버스 왼쪽 위 기준 CSS 화소 — 글이 비었거나 기준점이 화면 밖이거나 가려 그리지 않은 것은 `null`, 복사본)
- `viewer.viewCubeRect`: 뷰 큐브의 화면 사각형(`{ x, y, width, height }` — 위·오른쪽에서 8화소, 한 변 `viewCubeSize`, 감췄으면 `null`). `setMeasureLabelAvoid`의 사각형과 같은 좌표다.
  코어가 둔 자리라 앱이 CSS로 큐브를 옮겼으면 그 요소를 직접 잰다

```ts
// STEP·NC(휴대폰): 측정 띠와 뷰 큐브를 거리 글상자·덧그림 글상자 모두 비켜 그린다
const cube = viewer.viewCubeRect; // canvas.v3d-cube를 찾지 않아도 된다
viewer.setMeasureLabelAvoid([bandRect, ...(cube ? [cube] : [])]);
```

### 앱이 할 일

- NC: 코어를 `#v0.23.0`으로 올린다. 원호 꼭대기를 스치는 축은 0.22.0부터 붙으므로(위 측정 모델 12단 가운데 8단) 23차 재현 기록 시험(`measure-apex-core`)의 기대값을 그에 맞춰 바꾼다.
  반투명 판 너머 구멍·포켓 벽을 재려면 `panelSnapOptions`·`ncSnapOptions`에 `throughTranslucent: true`를 더한다(판을 반투명으로 그릴 때만 차이가 난다).
  구멍 안쪽 벽(오목하게 보이는 원기둥 벽)의 면의 열린 교차는 `refineFaceSnap`이 그대로 풀면 0.23.0부터 받는다. 뷰 큐브 자리는 `viewer.viewCubeRect`로 읽을 수 있다. 새로 보이는 글은 없다
- STEP: 코어를 올리면 `setMeasureLabelAvoid`에 넘기던 띠·뷰 큐브 자리를 개체 측정 덧그림 글상자도 비킨다(앱 코드 그대로). 뷰 큐브는 내부 클래스(`canvas.v3d-cube`) 대신 `viewCubeRect`로 읽는다.
  부품을 반투명으로 보이는 기능에서 그 너머 면을 고르려면 `pick`·`onPick`·측정에 `throughTranslucent`를 준다
- SKP: 유리 같은 반투명 재질 너머 면을 고르거나 재려면 `throughTranslucent`를 준다. 측정 덧그림 글상자 비키기는 NC·STEP과 같다

## 0.24.0: 반투명 너머 고르기를 그물마다 멈추기·측정 중 그것만 켜고 끄기·덧그림 글상자끼리 비키기·면의 열린 교차 둘째 힌트

`setItemPickOpaque`·`setMeasurePickThrough`를 쓰지 않고, 화면 덧그림 글상자가 서로 겹치지 않으며, 면의 열린 교차의 선이 한 삼각형 위 곡면 조각을 두 번 지나지 않으면
그림·고르기·측정은 0.23.0과 화소·값까지 같다(`npm run pixels -- --base v0.23.0 --timeout 900`: 0.23.0의 장면 109개 모두 같고, 값 63묶음 가운데 62묶음이 같다.
다른 하나 `base-annotation-avoid`는 아래 첫째 까닭이다. 새 장면 2개 가운데 그림 저장 `base-annotation-overlap-image`는 0.23.0과 화소까지 같고, 화면 덧그림 장면 `base-annotation-overlap`과
새 값 4묶음 — `base·off-pick-opaque`·`base-measure-pick-through`·`base-annotation-overlap` — 은 0.23.0에 없는 API·동작이라 건너뛰고 head에서 두 번 찍어 같은 것을 확인했다.
이 기계 부하(load average 22~195)에서 한 번에 끝났다(937초). 면의 열린 교차 값 묶음 `globe-measure-face-open`·`arc-measure-axis-twice`도 앱 호출 수·힌트 자리까지 같다).
바뀐 기본 동작은 둘이다. 입력 타입은 그대로이고 선택 필드·인자만 더해졌다(`ItemLookState.pickOpaque`, 순수 `ScenePickOptions.pickOpaque`·`OpenFaceCandidate.twice`·`twin`,
`openFaceCandidates`·`openFaceSnap`의 마지막 인자 `around`).

- 모든 앱(화면 덧그림): 앱 측정 덧그림(`setAnnotations`) 글상자끼리, 덧그림 글상자와 측정 거리 글상자가 겹치면 뒤에 놓는 글상자가 비킨다(`setMeasureLabelAvoid`를 주지 않아도).
  겹치지 않으면 0.23.0과 같은 자리이고 그림 저장은 비키지 않는다. 화소·값 회귀의 0.23.0 값 묶음 `base-annotation-avoid`는 10줄 가운데 2줄이 바뀐다 —
  그 묶음의 '구석' 점 글상자가 각도 덧그림 글상자와 4.8화소 겹쳤는데(0.23.0) 이제 오른쪽 아래로 비키고, 띠를 준 뒤에는 둘이 함께 띠 아래로 내려가 다시 겹치던 것을 띠 위로 비킨다.
  나머지 줄(띠·뷰 큐브와 겹치지 않는지, 그림 저장 화소가 같은지, 화면 덧그림은 옮겼을 때만 바뀌는지, 끄면 처음 자리인지)은 같다
- `refineFace`를 준 앱: 면의 열린 교차에서 선이 한 삼각형 위 곡면 조각을 두 번 지날 수 있는 자리면 둘째 힌트(그 조각의 두 끝)로 더 부른다. 받는 규칙·호출 한도·기억은 같고
  부르는 횟수만 늘 수 있다

NC 25차 요청은 셋(그물마다 고르기 불투명, 면의 열린 교차 둘째 힌트, README 0.22.0 바로잡기 — 위 0.22.0 앱이 할 일), STEP 26차 요청은 측정 중 반투명 보기를 켜고 끌 때
잠금·끌어온 점이 풀리는 것, SketchUp 요청은 덧그림 글상자끼리 비키기와 메모리·문맥 복구(남은 일에 설계만 적었다)였다.

### 그물마다 고르기 불투명(`setItemPickOpaque`)

- `viewer.setItemPickOpaque(id: string, on: boolean): void`: on이면 반투명 그물 너머 고르기(`pick`·`onPick`의 `throughTranslucent`, 측정 붙잡기의 `throughTranslucent` — 커서 아래 면 위 점·꼭짓점,
  축이 면을 뚫는 점의 다시 맞춰 보기, `'onFace'` 다듬기와 `pointsFor`에 넘기는 고르기)가 그 그물 면을 지나가지 않고 불투명 면처럼 그 면에서 멈춘다. false면 되돌린다
- 그대로인 것: 그림(투명도·색), 가림(반투명 면은 뒤 선분·점·앱 점을 가리지 않는다 — 그림대로), `throughTranslucent`를 주지 않은 고르기, 잘린 면 채움.
  다른 겉모습처럼 `setScene`·`clearItemLooks`가 비우고 `setMesh`로 바꿔도 남는다. `itemLook(id).pickOpaque`(켰을 때만 `true`)
- 순수(`opencad-viewer3d/scenepick`): `ScenePickOptions.pickOpaque(m)` — `throughTranslucent`일 때만 본다

```ts
// NC: 판(알파 0.35)은 지나가고 포켓·홈(0.75·0.85)은 벽으로 본다 — 그림은 그대로. setScene마다 다시 준다(겉모습을 비운다)
for (const m of scene.meshes) if (m.id.startsWith('mpr-op-')) viewer.setItemPickOpaque(m.id, true);
```

### 반투명 너머 고르기만 바꾸기(`setMeasurePickThrough`)

- `viewer.setMeasurePickThrough(on: boolean): boolean`: 측정 붙잡기의 `throughTranslucent`만 바꾼다. Shift·앱 단추 잠금, 끌어온 점, 찍은 점, 나란함 기준 선분,
  다듬기 기억(`refine`·`refineFace` — 입력에 면이 들어 있어 고른 면이 바뀌면 열쇠가 다르다), `pointsFor` 기억, 붙잡기 한도와 다른 선택은 그대로다
- 측정 미리 보기가 보이면 그 자리에서 다시 구한다(다음 미리 보기부터 새 값). `measureSnap.throughTranslucent`도 따라 바뀐다(끄면 그 필드를 뺀다). 끄더라도 붙잡기는 켜진 채다
- 붙잡기가 꺼져 있으면 아무것도 하지 않고 `false`를 돌려준다(그때는 `setMeasureSnap({ throughTranslucent: true })`). `setMeasureSnap`은 0.23.0 그대로 잠금·끌어온 점을 새로 한다

```ts
// STEP: 측정 중 반투명 보기를 켜고 끌 때 — 붙잡기가 꺼져 있을 때만 붙잡기 선택을 다시 준다
if (!viewer.setMeasurePickThrough(on)) viewer.setMeasureSnap(measureSnapOptions(/* … */));
```

### 덧그림 글상자끼리·측정 거리 글상자와 비키기

- 화면 덧그림에서 덧그림 차례대로 글상자를 놓는다. 0.23.0 자리(`setMeasureLabelAvoid`의 사각형을 비킨 자리 — 없으면 기본 자리)가 먼저 놓인 글상자와 겹치면,
  먼저 놓인 글상자를 피할 사각형에 더해(앱 사각형 뒤에) 0.23.0 차례(기준점 네 귀, 거리·반지름이면 두 점을 잇는 선분 위, 피할 자리 위·아래)로 다시 고른다.
  옮길 때는 그 덧그림의 점 표식을 될 수 있으면 가리지 않는다. 모두 막히면 0.23.0 자리다
- 측정 거리 글상자는 덧그림 글상자 뒤에 놓아 덧그림 글상자를 비킨다(덧그림 글상자는 커서를 따라 움직이지 않는다). 옮길 때는 두 측정 점 표식을 될 수 있으면 가리지 않는다
- 놓는 차례가 정해져 있어 같은 입력에 같은 자리다. 피할 사각형에 더하는 것은 그 글상자 후보가 닿을 수 있는 가로 범위와 겹치는 먼저 놓인 글상자 가운데
  0.23.0 자리에 가까운 24개까지다(`LABEL_PLACED_MAX` — 덧그림이 아주 많아도 한 글상자의 비용을 묶는다)
- 그림 저장(`toBlob`·`renderImage`)은 비키지 않는다(화면 글상자를 옮겼으면 `toBlob`이 덧그림을 기본 자리로 다시 그린다). `annotationLabelRects`·`measureLabelRect`는 옮긴 자리다
- 순수(`opencad-viewer3d/measurelabel`): `placeLabelAmong(at, size, view, avoid, placed, segment?, soft?)`(결과 `MeasureLabelRect`), `LABEL_PLACED_MAX`(24)

### 면의 열린 교차 둘째 힌트(`refineFace` — `'axisFace'`, `open`)

- 조건: 0.22.0 면의 열린 교차 후보 가운데, 선이 곡면과 나란해지는 자리가 그 삼각형을 지나는 것. 그 삼각형과 변을 함께 쓰는 매끈한 이웃(법선 사잇각 45° 안)마다
  변 법선(두 면 법선의 합)을 두고, 그 삼각형 법선과 변 법선들이 선 방향과 이루는 내적이 양·음 모두 있어야 한다. 또 선이 이웃의 먼 꼭짓점 쪽(곡면이 휘어 들어가는 쪽)만이 아니어야 한다
  - 볼록한 곡면을 아주 얕게 스치는 선의 두 교차는 선이 곡면과 나란해지는 자리 양쪽에 있다. 그 자리가 그 삼각형 안이면 두 교차가 모두 그 삼각형 위일 수 있다
  - 변 법선만 써서 커서 둘레에 모은 삼각형이 꼭짓점 둘레를 다 덮지 않아도 흔들리지 않는다. 구의 적도를 스치는 축은 두 교차가 위·아래 칸에 나뉘고
    적도 변 법선이 축과 수직이라 둘째 힌트를 두지 않는다(0.22.0 값 묶음 `globe-measure-face-open`의 호출 수·힌트 자리가 그대로다)
  - 선이 그 삼각형 평면과 22.5°보다 가파르게 만나면(변 법선은 삼각형 법선에서 22.5° 안이라 부호가 바뀔 수 없다) 둘째 힌트를 두지 않고 이웃도 찾지 않는다.
    뷰어는 커서 둘레(붙잡기 거리 안)에 없는 이웃을 그 삼각형 세 변 가운데의 화면 자리에서 모은다(같은 그물만)
- 둘째 힌트: 선에서 그 삼각형 위 곡면 조각 자리인 조각(삼각형 평면에 내린 발이 삼각형 안, 평면에서 `0.1 × 가장 긴 변` 안)의 두 끝을 `point`로 한 번씩 더 부른다.
  두 교차는 그 조각 안이라 앱이 `point` 둘레 교차 하나를 주면 각 끝에 가까운 쪽이 따로 온다. 힌트는 커서와 상관없이 선과 삼각형으로만 정한다(기억 열쇠가 그대로 쓰인다).
  0.22.0 힌트(무게중심 쪽)는 그대로다
- 받는 규칙·호출 한도·기억: 0.22.0·0.23.0 그대로(그 삼각형 위 곡면 조각 자리, 커서 붙잡기 거리, 단면, 가림. 미리 보기 한 번에 새로 `OPEN_REFINE_CALLS`(6)번, 힌트마다 다른 열쇠)
- 비용: 가짜 WebGL 시험 환경에서 NC 꼴 벽(R50 볼록 호 17토막, 높이 18)의 꼭대기를 0.005 아래로 스치는 첫 점 X축(높이 9)을 따라 커서를 400번 옮겼다(세 번씩).
  한 번 평균이 `refineFace` 없이 0.04~0.08 ms, `null`만 돌려주는 함수 0.07~0.09 ms, 정확한 원기둥 0.07~0.08 ms다(이 기계 load average 86~99).
  앱 함수는 1,200번 옮기는 동안 다섯 번 불렸고 두 교차 둘레 24자리가 원기둥 위 교차에 붙었다. 0.22.0의 구 스침(48×24칸)은 다섯 번·30자리로 0.23.0과 같다
- 순수(`opencad-viewer3d/track`): `OpenFaceCandidate.twice`·`twin`(선택 필드), `openFaceCandidates(f, lines, tris, x, y, snapPx, around?)`·
  `openFaceSnap(f, lines, tris, x, y, snapPx, refine, visible?, around?)` — `around(t)`는 그 삼각형의 이웃을 더 찾을 삼각형 목록(없으면 `tris`에서만)

### 앱이 할 일

- NC: 코어를 `#v0.24.0`으로 올린다. 포켓·홈 그물(`mpr-op-*`)을 `setItemPickOpaque(id, true)`로 켜면(장면을 줄 때마다 — `setScene`이 겉모습을 비운다) 판 너머 고르기·측정이
  포켓 벽에서 멈춘다(그림은 그대로). 면의 열린 교차는 `refineFaceSnap`의 열린 후보 길(그 현의 각 범위 안 근 가운데 힌트에 가까운 것)이 둘째 힌트도 그대로 풀어,
  볼록 호 꼭대기를 얕게 스치는 축의 다른 근(재현 기록 `measure-face-open-core`의 높이 9, x ≈ 199.293)에도 붙는다 — 그 시험의 기대값을 바꾼다.
  둘째 힌트는 그 조각의 끝이라 그 함수의 힌트 판정(중심에서 `r·cos(반각)`과 `r ÷ cos(반각 × 2)` 사이, 법선 방향에서 반각 × 2 안)에 드는지 앱 시험으로 확인한다
  (이 저장소 시험의 같은 꼴 — 높이 9 — 에서는 두 끝 모두 그 안이다). 새로 보이는 글은 없다
- STEP: 측정 중 반투명 보기를 켜고 끌 때 `setMeasureSnap`을 다시 주는 대신 `setMeasurePickThrough(on)`을 부른다(붙잡기가 꺼져 있으면 `false` — 그때만 다시 준다).
  개체 측정 덧그림 글상자끼리·측정 거리 글상자와의 겹침은 코어가 비킨다(앱 코드 그대로)
- SKP: 코어 덧그림(`setAnnotations`)을 쓰면 글상자끼리·측정 거리 글상자와 서로 비킨다. 줄자·각도기 결과 글(앱이 그리는 글)은 순수 `placeLabelAmong`에 먼저 놓인 글상자를
  넘겨 같은 차례로 놓을 수 있다. 메모리·문맥 복구는 남은 일의 설계를 보고 다음 차수에 맞춘다
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.25.0: 올린 뒤 법선·무늬 좌표·무늬 원본 놓기와 문맥 복구 때 다시 받기·문맥 잃음과 되찾음 알림

놓기 선택(`setScene`의 `release`)을 주지 않으면 그림·고르기·측정·문맥 복구는 0.24.0과 화소·값까지 같다(`npm run pixels -- --base v0.24.0 --timeout 900`:
장면 115개 가운데 0.24.0의 111개와 새 장면 `tex-release`·`tex-restore`·`tex-release-restore`가 0.24.0과 같고, 값 69묶음 가운데 0.24.0의 67묶음과 새 `tex-release-picks`가 같다.
0.24.0에 없는 API를 쓰는 새 장면 `tex-release-restore-flat`과 새 값 `tex-release-restore`는 건너뛰고 head에서 두 번 찍어 같은 것을 확인했다.
이 기계 부하(load average 16~45)에서 한 번에 끝났다(462초)).
바뀐 기본 동작은 없다. 입력 타입은 그대로이고 `setScene`의 선택 필드 `release`와 메서드·알림만 더해졌다. 출력 타입 `TextureStats`에 `missing`(다시 받을 무늬 수)이 늘었다
(앱이 이 타입 객체를 직접 만들면 채워야 한다 — NC·STEP·SKP 앱은 만들지 않는다).

SketchUp 요청(0.24.0 남은 일에 적은 메모리·문맥 복구 설계 — 큰 모형에서 법선·무늬 좌표가 55 MB, 무늬 원본을 놓았다가 문맥 복구 때 무늬가 평균색이 되는 회귀로 SketchUp 23차가 되돌렸다)을
설계대로 넣었다. SketchUp 26차 의견 넷 가운데 놓기를 쓰지 않아도 받는 알림(`onContextLost`, 늘 부르는 `onContextRestore`)과 무늬의 푼 그림만 놓기(`textures: 'bitmap'`)를 넣었고,
작은 법선·무늬 좌표 배열 받기와 측정 글상자 기본 자리 받기는 남은 일에 적었다.

### 올린 뒤 성분 기억

- 렌더러가 그물마다 올릴 때 법선 유무, 앞·뒷면 무늬 좌표의 정점당 값 수(2·3), 쓰는 GPU 버퍼를 그물 기록에 기억한다. 그 뒤 무늬 쓰임 셈(`syncTextures`)·
  그물 기록 다시 만들기(`setMesh`, 배열을 함께 쓰는 그물)·구간 숨김과 강조·와이어프레임의 VAO 묶기는 `Mesh3d.normals`·`uvs`·`backUvs` 배열과 그 길이를 다시 보지 않는다
- GPU 버퍼 표는 배열과 무관한 열쇠로 둔다. 같은 배열을 한 번만 올리려고 배열에서 열쇠를 찾는 표는 약한 표(`WeakMap`)라 배열을 붙잡지 않는다
- 고르기·측정·범위·단면 테두리·잘린 면 채우기는 위치·색인만 쓴다(놓아도 같다 — 가짜 WebGL 시험과 화소·값 회귀의 `tex-release-picks`)

### 놓기 선택(`setScene(scene, { release })`)

- `release: true`(셋 모두) 또는 `ReleaseOptions` `{ normals?: boolean; uvs?: boolean; textures?: boolean | 'bitmap' }`: 켠 것은 GPU에 올린 뒤 코어가 장면 객체에서 지운다(필드를 `delete`).
  `normals`는 `Mesh3d.normals`, `uvs`는 `uvs`·`backUvs`, `textures`는 그물이 쓰는 무늬를 풀어 올린 뒤의 `Texture3d.data`·`bitmap`(푼 그림은 `close`)이다.
  그 뒤 코어는 그 배열·원본을 읽지 않으므로, 앱이 따로 쥐지 않으면 GC가 거둔다
- 나눠 올리기(`incremental`)에서는 그 그물 차례에 올린 뒤 지운다. 이 장면에 `setMesh`로 넣는 그물도 같다
- 위치·색인·정점 색·윤곽선은 놓지 않는다(고르기·측정·범위·단면이 쓴다)
- 놓은 그물을 `setMesh`로 바꿀 때: 새 그물이 그 배열을 주면 통째로 올리고, 주지 않으면 정점 수가 같고 위치 배열이 같거나 `vertices`를 줄 때 올려 둔 버퍼를 물려받는다.
  `vertices` 구간을 놓은 배열에 올릴 수 없으면 `console.warn`으로 알리고 앞 것을 그대로 쓴다(바뀌었으면 그 배열을 통째로 준다)
- 놓은 장면 객체를 `setScene`에 다시 주면 지운 배열은 다시 올릴 수 없다. 문맥 복구 때처럼 위치·색으로 그리고 `restoreNeed`에 남는다(알림은 없다 — 다시 줄 때는 새 장면 객체를 준다)
- 주지 않으면 0.24.0과 같다(장면 배열을 붙잡고 문맥 복구 때 그대로 다시 올린다)

### 문맥 잃음·되찾음 알림과 다시 받기

- `viewer.onContextLost(cb: () => void): () => void`: 그래픽 문맥을 잃을 때 부른다(놓기와 무관). 되찾을 때까지 다시 그리지 않는다. `dispose`가 일으킨 잃음은 알리지 않는다
- `viewer.onContextRestore(cb: (need: ContextRestoreNeed) => void | Promise<unknown>): () => void`: 되찾을 때마다 코어가 장면·덧그림·단면 테두리를 다시 올린 뒤 부른다.
  놓기 선택이 없거나 놓은 것이 모두 GPU에 있으면 `need`는 빈 목록 `{ meshes: [], textures: [] }`이다(그래도 부른다 — 앱이 안내를 거두거나 라벨 가림 판정을 다시 할 때)
- `need`(`ContextRestoreNeed`): `meshes`는 `{ id, normals, uvs, backUvs }`(다시 줄 배열마다 `true` — `uvs`는 뒷면이 `uvs`를 함께 썼으면 뒷면 몫도), `textures`는 무늬 id
- 놓은 것이 있으면 되찾는 즉시 위치·색으로 그린다(놓은 법선이 없는 그물은 평면 음영, 놓은 무늬 좌표·원본이 없는 그물은 그물 `color` — 앱이 무늬 평균색을 `color`로 주면 평균색)
- `viewer.restoreMeshArrays(id: string, arrays: MeshArrays): boolean`: `{ normals?, uvs?, backUvs? }` 가운데 그 그물에 지금 없는 놓은 배열만 받는다(길이가 맞을 때).
  그 그물 기록만 다시 만들고 준 배열은 붙잡지 않는다(그물 객체에도 넣지 않는다). 나눠 올리는 중이라 아직 올리지 않은 그물이면 차례가 올 때 함께 올린다. 받은 것이 있으면 `true`
- `viewer.restoreTexture(id: string, src: TextureSource): Promise<boolean>`: 그림 파일 바이트(`Uint8Array`), 푼 그림(`ImageBitmap` — 다 쓰면 닫는다), 또는 `{ data, bitmap, mime, width, height }`.
  처음 올릴 때와 같은 크기 한도로 풀어 올린다. 기다리는 무늬가 아니거나 풀지 못하면 `false`(풀지 못하면 다시 기다린다)
- `viewer.restoreNeed: ContextRestoreNeed | null`: 아직 주지 않은 것(없으면 `null`). `stats.textures.missing`은 다시 받을 무늬 수다(받아서 푸는 중인 것도 센다)
- 천천히 주어도 된다(준 것부터 되돌아온다). 주지 않은 무늬는 그물 `color` 그대로이고, 다시 잃었다 되찾으면 또 알린다

```ts
// SKP: 큰 모형만 놓고, 되찾으면 안내를 보이며 파일을 다시 읽어 준다
viewer.setScene(doc.scene, { incremental: true, release: { normals: true, uvs: true, textures: 'bitmap' } });
viewer.onContextLost(() => showNotice('그래픽을 다시 준비하는 중'));
viewer.onContextRestore(async (need) => {
  for (const m of await reparseMeshes(need.meshes.map((x) => x.id))) viewer.restoreMeshArrays(m.id, m);
  for (const id of need.textures) await viewer.restoreTexture(id, await recolorTexture(id));
  hideNotice();
  refreshLabelOcclusion();
});
```

### 무늬는 푼 그림만 놓기(`release: { textures: 'bitmap' }`)

- 푼 그림(`Texture3d.bitmap`)만 닫고 지우며 그림 바이트(`data`)는 장면에 둔다. 문맥을 되찾으면 코어가 `data`를 스스로 다시 풀어 올린다(`need.textures`에 들지 않는다).
  `data`가 없는 무늬만 `need.textures`로 받는다. `bitmap` 없이 `data`만 준 무늬는 아무것도 놓지 않는다(코어가 푼 그림은 올린 뒤 늘 닫는다)
- `data`가 `bitmap`과 같은 그림일 때만 쓴다. 앱이 색을 바꾸는 등 손질한 `bitmap`은 되찾을 때 `data`의 원래 그림으로 돌아가므로, 그 무늬는 `setScene` 전에 무늬 객체에서 `data`를 빼 두어
  `need.textures`로 받는다

### 메모리

격자 그물 24개(그물마다 정점 40,401개 — 법선 11.1 MB·무늬 좌표 7.4 MB, 위치 11.1 MB·색인 22.0 MB)와 무늬 8장(512×512)인 합성 장면을 앱이 쥐지 않고 뷰어에만 준 뒤 쟀다.

- 가짜 WebGL(시험 환경, 무늬 바이트 1 MB씩 8 MB, load average 54~81): 장면 객체가 쥔 법선·무늬 좌표·무늬 바이트는 놓지 않으면 26.5 MB, `release: true`면 0,
  `{ normals, uvs, textures: 'bitmap' }`이면 8.0 MB(바이트만 준 무늬라 놓을 푼 그림이 없다). GC 뒤 `process.memoryUsage().arrayBuffers`(가짜 GL이 쥔 버퍼 사본을 뺀 값)는
  놓지 않은 뷰어보다 올린 뒤 26.5 MB·18.5 MB 적고, 문맥을 잃었다 되찾아 앱이 다 준 뒤에도 26.5 MB·18.5 MB 적다(준 배열을 붙잡지 않는다)
- 헤드리스 Chrome(SwiftShader, 무늬는 PNG 바이트 4.8 MB와 같은 그림의 푼 그림 `bitmap` — SKP 알파 무늬의 꼴, load average 22~133): 새로 연 페이지마다 GC 뒤
  `Runtime.getHeapUsage`의 ArrayBuffer 뒷저장이 올린 뒤 놓지 않으면 59.2 MB, `release: true`면 38.3 MB(20.9 MB 적다), `'bitmap'`이면 43.1 MB(16.1 MB 적다 — 바이트 4.8 MB는 남는다)였다.
  둘 다 JS 힙 밖의 푼 그림 8장(512×512, 8 MB)도 닫는다. `WEBGL_lose_context`로 잃었다 되찾으면 놓지 않은 뷰어는 빈 `need`에 그림이 그대로이고,
  `true`는 그물 24개·무늬 8장을, `'bitmap'`은 그물 24개만 받았다(무늬는 코어가 바이트를 다시 풀었다). 앱이 다 준 뒤 그림(RGBA 해시)은 세 경우 모두 처음과 같다.
  되찾은 뒤의 뒷저장 값은 놓지 않은 뷰어도 그림을 읽을 때마다 늘어 견주지 않았다

### 앱이 할 일

- SKP: 코어를 `#v0.25.0`으로 올린다. 큰 모형(나눠 올리는 모형)에서 `setScene(d.scene, { incremental, release: { normals: true, uvs: true, textures: 'bitmap' } })`로 주면
  법선·무늬 좌표와 알파 무늬의 푼 그림을 코어가 놓는다. 그 전에 색을 바꾼 재질 무늬(`prepareSceneTextures`가 `bitmap`을 바꾼 것)는 무늬 객체에서 `data`를 빼 둔다
  (견본 그림에 쓰는 바이트는 앱이 따로 쥔다 — 남겨 두면 되찾을 때 원래 색 그림이 된다). 놓은 뒤에는 앱이 `d.scene`의 법선·무늬 좌표·무늬 원본을 읽지 않아야 한다
  (`revokeImages`의 `t.bitmap?.close()`는 필드가 없으면 건너뛰므로 그대로 된다). 같은 장면 객체를 `setScene`에 다시 주지 않는다.
  `onContextRestore`에서 `need.meshes`의 그물을 파일에서 다시 풀어 `restoreMeshArrays`로, `need.textures`(색을 바꾼 무늬)를 다시 풀고 색을 바꿔 `restoreTexture`로 준다 —
  그동안 위치·색(평면 음영·평균색)으로 보인다. `onContextLost`·`onContextRestore`(빈 `need`도 온다)로 안내를 보이고 거두며 라벨 가림 판정을 다시 한다.
  화면에 새로 보이는 글(안내)은 앱 사전에 넣는다
- NC·STEP: 선택. 바꾸지 않으면 0.24.0과 같다. 문맥 잃음·되찾음 알림만 쓸 수도 있다(놓기와 무관). STEP 큰 모형에서 법선을 놓으려면 `release: { normals: true }`와
  `onContextRestore`에서 다시 삼각화한 법선을 준다(NC는 공구 경로 선분이 대부분이라 얻을 것이 적다)
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.26.0: 한 누르기의 판 너머·가장 앞 고르기·작은 법선·무늬 좌표 배열·글상자 기본 자리·끌어온 점의 나란함·수직(순수)

새 선택(`onPick`의 `front`, 정수 법선·무늬 좌표 배열과 `uvTransform`, `placeMeasureLabel`·`placeLabelAmong`의 `first`)을 쓰지 않으면 그림·고르기·측정은 0.25.0과 화소·값까지 같다
(`npm run pixels -- --base v0.25.0 --timeout 900`: 0.25.0의 장면 115개·값 69묶음 모두 같음. 작은 배열 장면 `compact-shaded`·`compact-sun-shadows`와 새 값 `compact-vs-float`는
0.25.0에 없는 선택이라 건너뛰고 head에서 두 번 찍어 같은 것을 확인했다. 이 기계 부하(load average 22~80)에서 한 번에 끝났다(357초)).
바뀐 기본 동작은 없다. 장면 계약의 `Mesh3d.normals`·`uvs`·`backUvs`와 `restoreMeshArrays`의 `MeshArrays` 타입이 넓어졌다(`NormalArray`·`UvArray`) —
이 필드를 읽어 `Float32Array`를 받는 함수에 넘기는 앱 코드만 타입을 맞춘다(NC·STEP·SKP 앱은 이 필드를 쓰기만 한다).

NC 요청은 한 누르기에서 판 너머 고르기와 가장 앞 고르기를 함께 받는 방법(지금 NC는 알림 둘을 달아 같은 사건 객체로 짝짓는다), SketchUp 요청은 작은 법선·무늬 좌표 배열
(큰 모형 55 MB — 0.25.0 남은 일)과 글상자 자리 고르기가 앱이 정한 기본 자리(SketchUp 결과 글은 가운데)를 받는 것, NC·SketchUp 공통 요청은 끌어온 점에서 나란함·수직 방향이었다.

### 한 누르기의 두 고르기(`onPick(cb, { front: true })`)

- `OnPickOptions.front`: 그 알림의 사건에 `PickEvent.front`를 함께 준다 — 같은 누르기에서 그 알림의 고르기에서 `throughTranslucent`만 뺀 고르기
  (`meshesOnly`는 그 알림 그대로, 가장 앞의 그물 면·선분·점, 빈 곳이면 `null`). `throughTranslucent` 없이 단 알림이면 첫 인자와 같은 객체다
- 같은 선택 짝의 고르기는 한 누르기에 한 번만 구해 알림끼리 함께 쓴다. 그래서 `front`는 선택 없이 단 알림이 받는 고르기와 같은 객체다
- `front`를 준 알림의 사건은 그 알림만의 사본이다(나머지 필드는 같다). 주지 않은 알림의 사건에는 `front` 열쇠가 없다(0.25.0 그대로)
- 약속(0.26.0부터 README에 적는다): 한 누르기의 알림은 단 차례대로 부른다(같은 함수를 다시 달면 처음 자리에서 마지막 선택을 따르고, 끊었다 다시 달면 끝).
  `front` 없이 단 알림들은 모두 같은 사건 객체를 받고, 사건은 누르기마다 새 객체다 — NC의 지금 코드(판 너머 알림을 먼저 달고 사건 객체로 짝짓기)도 이 약속으로 그대로 된다

```ts
// NC: 판재 문서면 판 너머, 아니면 가장 앞 — 알림 하나로
v.onPick((p, e) => this.onPick(this.pickThrough ? p : (e.front ?? null)), { throughTranslucent: true, front: true });
```

### 작은 법선·무늬 좌표 배열(`Int8Array`·`Int16Array`·`Uint16Array`, `uvTransform`)

- `Mesh3d.normals`: `Float32Array`에 더해 정규화 정수 `Int8Array`(값 ÷ 127)·`Int16Array`(값 ÷ 32767). 길이를 1로 맞추지 않아도 된다(셰이더가 조각마다 맞춘다).
  정점마다 3값, 또는 배열 길이가 정점 수 × 4와 같으면 4값(넷째 값은 읽지 않는다). 한 정점이 4바이트(Int8 4값)·8바이트(Int16 4값)면 GPU 백엔드(Metal·D3D11)가
  속성 줄을 다시 맞추느라 사본을 만들지 않으므로 Int8 4값을 권한다. 다른 꼴(`Uint8Array` 등)은 법선 없이(평면 음영) 그린다 — 0.25.0에서 길이가 모자란 법선과 같다
- `Mesh3d.uvs`·`backUvs`: `Float32Array`에 더해 정규화 정수 `Int16Array`(값 ÷ 32767, −1~1)·`Uint16Array`(값 ÷ 65535, 0~1). 정점마다 2값 또는 원근 무늬 3값(길이로 가린다 — 0.5.0과 같다)
- `Mesh3d.uvTransform`·`backUvTransform`(`UvTransform` = `[su, sv, ou, ov]`): 배열 값(정수면 정규화한 값) (s, t)에서 u = su·s + ou, v = sv·t + ov(원근 무늬는 q로 나눈 뒤의
  u·v에 같은 변환 — 셰이더는 (su·s + ou·q, sv·t + ov·q, q)). 배열 꼴과 무관하게 있으면 늘 쓴다. 뒷면이 `uvs`를 함께 쓰면 `uvTransform`, 따로 준 `backUvs`면 `backUvTransform`
  (없으면 변환 없음). 놓기(`release`)는 변환을 지우지 않는다(문맥 복구 때 다시 준 배열을 펴는 데 쓴다)
- 렌더러는 배열을 바꾸지 않고 그대로 GPU 버퍼에 올려 WebGL2 정점 속성 꼴(`BYTE`·`SHORT`·`UNSIGNED_SHORT`, normalized)로 읽는다. 같은 배열은 한 번만 올리기, 나눠 올리기,
  그물 바꾸기(`setMesh`의 `vertices` 구간 — 값 크기대로 바이트 자리를 잡는다), 놓기와 문맥 복구(`restoreMeshArrays` — 작은 배열을 그대로 다시 준다)도 같은 꼴을 받는다.
  `Float32Array`는 0.25.0과 같은 속성 꼴로 올린다(변환이 없으면 균일 변수 `u_uvt` = (1, 1, 0, 0) — 곱하고 더해도 값이 그대로다)
- 고르기·측정·범위·단면은 위치·색인만 쓰므로 법선·무늬 좌표 꼴과 무관하다(가짜 WebGL 시험 `tests/v0260.test.ts`와 값 `compact-vs-float`에서 Float32 장면과 화면 격자 고르기·축 범위·측정이 같다)
- 정밀도: Int8 법선의 방향 오차는 0.4° 안(값마다 반올림 1/254), Int16 법선은 0.002° 안. Int16 무늬 좌표는 그 그물 u·v 범위 ÷ 65,534(예: 0~10 되풀이면 0.00015 — 512화소 무늬의 0.08화소).
  무늬 좌표 범위가 아주 넓은 그물(수백 번 되풀이)은 `Float32Array`로 둔다
- 줄이기 도우미(순수 — `opencad-viewer3d/attribs`, 워커에서도 된다): `packNormals(normals, type = 'int8', per = 4)`(정점마다 단위 길이로 맞춰 반올림),
  `packUvs(uvs, vertexCount, type = 'int16')` → `{ uvs, transform }`(u·v를 따로 범위에 맞춘다 — 원근 무늬는 q를 가장 큰 |q|로 나눠). 꼴 판정 `normalFormat`·`uvFormat`·`uvAccepted`, 값 `unpackValue`.
  패키지 입구에서도 `packNormals`·`packUvs`와 타입 `NormalArray`·`UvArray`·`UvTransform`을 내보낸다

```ts
// SKP 워커: 장면을 넘기기 전에 줄인다(옮기는 버퍼·GPU 버퍼 모두 작아진다)
import { packNormals, packUvs } from 'opencad-viewer3d/attribs';
for (const m of scene.meshes) {
  if (m.normals) m.normals = packNormals(m.normals);
  if (m.uvs) {
    const p = packUvs(m.uvs, m.positions.length / 3);
    m.uvs = p.uvs;
    m.uvTransform = p.transform;
  }
}
```

### 그림과 메모리

- 그림: 같은 합성 장면(무늬 상자·원근 무늬 판·법선 있는 구)을 작은 배열로 준 그림은 Float32로 준 그림과 960×600 화소 576,000개 가운데 2,908개(음영)·3,254개(해·그림자)가 다르고,
  가장 큰 채널 차는 1(0~255)이다(값 `compact-vs-float`, SwiftShader — 화면 격자 고르기는 같다)
- 메모리(0.25.0과 같은 격자 그물 24개 — 정점 40,401개씩, 무늬 8장): 법선 11.1 MB → 3.7 MB(Int8 4값), 무늬 좌표 7.4 MB → 3.7 MB(Int16)
  - 가짜 WebGL(시험 환경, load average 36~46): GPU 버퍼 가운데 법선·무늬 좌표가 18.5 MB → 7.4 MB, 살아 있는 버퍼 전체가 51.6 MB → 40.5 MB.
    앱이 장면을 쥐면 GC 뒤 `process.memoryUsage().arrayBuffers`(가짜 GL이 쥔 버퍼 사본을 뺀 값)도 71.3 MB → 60.2 MB. `release: true`와 함께면 장면 쪽은 둘 다 놓이고(44.9 MB로 같다) GPU 쪽만 11.1 MB 적다
  - 헤드리스 Chrome(SwiftShader, load average 27~32, 방식마다 새로 띄움): 앱이 장면을 쥐면 GC 뒤 `Runtime.getHeapUsage`의 ArrayBuffer 뒷저장이 113.4 MB → 102.3 MB(11.1 MB 적다),
    `release: true`면 둘 다 90.1 MB다. GPU 프로세스 RSS(올린 뒤)는 Float32 436.6·435.2 MB, 작은 배열 424.8·420.3 MB(놓기 없음·`release: true` — 11~15 MB 적다)

### 글상자 기본 자리(`placeMeasureLabel`·`placeLabelAmong`의 `first`)

- 순수(`opencad-viewer3d/measurelabel`): `placeMeasureLabel(at, size, view, avoid?, segment?, opts?)`, `placeLabelAmong(at, size, view, avoid, placed, segment?, soft?, opts?)` —
  `opts`는 `LabelPlaceOptions { first?: LabelSpot }`
- `LabelSpot`: `'topRight'`(기본 — 0.25.0 자리)·`'topLeft'`·`'bottomRight'`·`'bottomLeft'`(기준점 네 귀), `'center'`(기준점이 글상자 가운데), `'above'`·`'below'`(기준점 바로 위·아래 가운데).
  이름 자리는 캔버스 안으로 당긴다. `{ x, y }`는 앱이 구한 글상자 왼쪽 위(당기지 않는다). 모르는 값·수가 아닌 자리는 오른쪽 위
- 차례: 기본 자리 → 기준점 네 귀(기본 자리와 같은 귀는 빼고 오른쪽 위부터) → 선분 위 자리의 네 귀 → 피할 영역 위·아래(가로는 기본 자리 → 오른쪽 위 → 왼쪽 위).
  피할 것과 겹치지 않으면 기본 자리, 모두 막히면 기본 자리다. `placeLabelAmong`은 두 번 고르기(앱 영역만, 먼저 놓인 글상자까지) 모두 그 자리부터 본다
- 주지 않거나 `'topRight'`면 0.25.0과 같다(시험이 0.25.0 계산 사본과 무작위 입력 600가지를 견준다). 뷰어의 측정 거리 글상자·덧그림 글상자는 그대로 오른쪽 위다

```ts
// SKP: 결과 글은 가운데가 기본 — 겹침을 미리 보지 않고 한 번에(당기지 않으려면 first: { x: x - width / 2, y: y - height / 2 })
const r = placeLabelAmong([x, y], { width, height }, view, avoid, placed, seg, null, { first: 'center' });
```

### 끌어온 점에서 나란함·수직 방향(순수 — 뷰어 측정 붙잡기에는 아직 없다)

- `trackDirGuides(P, seg, axes?)`(`opencad-viewer3d/track`): 끌어온 점 P와 기준 선분 seg(커서가 앞서 지나간 모서리 — 0.10.0 나란함의 기준과 같다)에서 쓸 방향.
  나란함(선분 방향)과, 수직인 방향은 평면 하나라 쓸 만한 방향만 — P에서 선분 직선으로 내린 수직, 축(세계 X·Y·Z 또는 앱 `axes`)을 선분에 수직인 평면에 비친 방향
  (평면도에서 기운 벽에 수평으로 수직, 기운 서까래에는 그 세로 평면 안에서 수직). 축과 같은 선(끌어온 축이 맡는다)과 앞 방향과 같은 선은 뺀다
- `trackDirSnap(f, tracks, seg, x, y, snapPx, skip?, axes?)`: 기억한 점마다 그 방향 선 위에서 커서 광선에 가장 가까운 점이 붙잡기 거리 안이면 후보
  (`trackAxisSnap`과 같은 규칙 — 커서가 그 점 둘레면·첫 측정 점이면 뺀다). 결과 `TrackDirSnap { p, from, kind: 'parallel' | 'perpendicular', dir, distPx }`
- 뷰어 측정 붙잡기(`inference.track`)에 넣는 것(차례·잠금·그리기·값)은 0.27.0 `inference.trackDirs`로 넣었다. 자체 줄자를 쓰는 앱은 이 함수로 바로 붙일 수 있다

### 앱이 할 일

- NC: 코어를 `#v0.26.0`으로 올린다. 판 너머 누르기는 알림 둘을 사건 객체로 짝짓는 대신 `onPick(cb, { throughTranslucent: true, front: true })` 하나로 받아
  판재 문서면 첫 인자, 아니면 `e.front`를 쓴다(지금 코드도 0.26.0 약속으로 그대로 된다). 끌어온 점의 나란함·수직은 코어 측정 붙잡기에 들어온 뒤 켠다
  (그 전에 앱이 쓰려면 순수 `trackDirSnap` — 기준 선분은 앱이 지나간 모서리를 기억한다). 새로 보이는 글은 없다
- SKP: 코어를 `#v0.26.0`으로 올린다. 큰 모형은 워커에서 `packNormals`·`packUvs`로 법선·무늬 좌표를 줄여 넘긴다(0.25.0 놓기와 함께 쓸 수 있다 — 문맥 복구 때 다시 주는 배열도
  같은 꼴로 만들고, `uvTransform`은 장면에 남으므로 같은 변환에 맞춘다). 무늬 좌표 범위가 아주 넓은 재질은 `Float32Array`로 둔다.
  결과 글은 `labelSpot`의 가운데 미리 보기 대신 `placeLabelAmong(…, { first: 'center' })`(지금처럼 당기지 않으려면 `{ first: { x, y } }`)로 놓을 수 있다.
  끌어온 점의 "모서리와 나란히·모서리에 수직"은 `trackDirGuides`가 앱의 지금 규칙(시작점에서 내린 수직, 그리기 축을 비친 방향)과 같은 방향을 준다(앱 `axes`를 넘긴다)
- STEP: 선택. 바꾸지 않으면 0.25.0과 같다(큰 모형 법선은 `packNormals`로 줄일 수 있다)
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.27.0: 그물 일부 면만 판 너머 고르기에서 지나가게 하기·끌어온 점의 나란함·수직(측정 붙잡기)·뷰어 글상자 기본 자리

새 선택(`setItemPickThrough`, `inference.trackDirs`, `setMeasureLabelSpot`)을 쓰지 않으면 그림·고르기·측정은 0.26.0과 화소·값까지 같다 — 새 코드는 그 선택이 있을 때만 불린다
(`npm run pixels -- --base v0.26.0 --runs 1 --only 'track|pick|through|label|annotation|parallel|lock|measure-preview|release'`: 바꾼 코드가 닿는 0.26.0의 장면 29개·값 34묶음 —
화면 격자 고르기, 판 너머 고르기·고르기 불투명, 잠금·나란함, 끌어온 축, 글상자 비키기·덧그림, 놓기 — 이 모두 같다. 새 장면 4개·값 4묶음은 0.26.0에 없는 API라 건너뛰고 head에서 예외 없이 찍혔다.
64초, load average 11~16. 전체 비교는 CI `pixels`가 한다).
바뀐 기본 동작은 없다. 입력 타입은 선택 필드만 더해졌다(`MeasureInference.trackDirs`, 순수 `ScenePickOptions.pickThrough`). 출력 타입 `ItemLookState`에 `pickThrough`,
`NormalizedInference`에 `trackDirs`가 늘었다(켰을 때만 있다 — 앱이 이 타입 객체를 직접 만들지 않으면 그대로다).

0.26.0 남은 일 넷 가운데 셋을 넣었다. NC 선택 요청인 판 너머 고르기에서 포켓·홈 그물의 뚜껑만 지나가게 하기(지금은 그물 전체를 `setItemPickOpaque`로 막아
포켓 바닥 구멍을 판 위에서 재면 포켓 윗면에서 멈춘다 — 그물을 뚜껑과 벽으로 나누면 그림·윤곽선이 바뀐다), NC·SketchUp 공통 요청인 끌어온 점에서 나란함·수직(0.26.0은 순수 함수만),
뷰어 글상자의 기본 자리(0.26.0 `first`는 순수 함수만)다. Float16 무늬 좌표는 설계만 남은 일에 적었다.

### 그물 일부 면만 판 너머 고르기에서 지나가게 하기(`setItemPickThrough`)

- `viewer.setItemPickThrough(id: string, ranges: readonly IndexRange[] | null): void`: 반투명 그물 너머 고르기(`pick`·`onPick`·측정 붙잡기의 `throughTranslucent`)가 그물 `id`의 이 삼각형 구간
  (`{ start, count }` — 삼각형 번호, `Pick3d.raw`·`setHiddenRanges`와 같은 번호)을 반투명 면처럼 지나 그 뒤를 고른다. 그물을 `setItemPickOpaque`로 켰거나 불투명이어도 이 삼각형에서는
  멈추지 않고, 그 뒤 같은 그물의 다른 면(포켓 바닥·벽 안쪽)에서는 그 그물 규칙대로 멈춘다. 반투명 면만 맞으면 예전처럼 가장 앞의 면이다(지나는 삼각형일 수도 있다)
- 꼴: 이름은 `setItemPickOpaque`처럼 그물 겉모습(`setItem…`)이고, 구간은 `setHiddenRanges`의 목록 꼴이다. `{ prims, edges }`의 `edges`(윤곽선)는 받지 않는다 —
  판 너머 고르기는 원래 반투명 그물의 윤곽선도 고르고, 포켓 뚜껑의 윤곽선은 벽의 윗모서리라 포켓 깊이를 재는 데 쓰인다
- 같은 규칙(정한 것): 커서 아래 면 위 점·꼭짓점, 축이 면을 뚫는 점(`axisFaces`·`lockFaces`의 다시 맞춰 보기), `'onFace'` 다듬기, `pointsFor`에 넘기는 고르기는 모두 같은 고르기라 함께 지난다.
  면의 열린 교차(0.22.0)가 보는 커서 둘레 삼각형은 반투명 그물 삼각형처럼 그대로 본다(그 삼각형은 가림이 아니라 앱 곡면의 후보라 지나는 면과 상관없다)
- 그대로인 것: 그림·윤곽선(그물을 나누지 않는다), 윤곽선·선분·점 고르기, 가림(그림대로 — 불투명 그물의 이 면은 뒤 선분·점을 가린다), 잘린 면 채움,
  `throughTranslucent`를 주지 않은 고르기와 `onPick` `front`(같은 누르기의 가장 앞 고르기)
- 상태: `itemLook(id).pickThrough`(합친 구간 복사본, 줬을 때만). 빈 목록·`null`이면 되돌린다. 다른 겉모습처럼 `setScene`·`clearItemLooks`·`removeMesh`가 비우고,
  `setMesh`로 바꿔도 남는다(새 삼각형 수로 자르고, 모두 밖이면 지운다). BVH(고르기가 바로 만든다)·나눠 올리기·문맥 복구와 무관하다. 그물이 아닌 id는 무시한다
- 비용: 지나는 삼각형이 있는 그물에서 가장 앞 맞음이 그 삼각형일 때만 그 그물을 한 번 더 맞춘다(지나는 삼각형과 숨긴 삼각형을 빼고)
- 순수(`opencad-viewer3d/scenepick`): `ScenePickOptions.pickThrough(m)` — 그 그물의 지나갈 삼각형 판정(`throughTranslucent`일 때만 본다)

```ts
// NC: 포켓·홈은 벽에서 멈추고 뚜껑(판 윗면 자리)은 지나간다 — 포켓 바닥 구멍을 판 위에서 잰다. setScene마다 다시 준다(겉모습을 비운다)
for (const m of scene.meshes)
  if (m.id.startsWith('mpr-op-')) {
    viewer.setItemPickOpaque(m.id, true);
    viewer.setItemPickThrough(m.id, lidRanges(m.id)); // 앱이 뚜껑(과 구멍을 덮는 바닥) 삼각형 번호를 기억한다
  }
```

### 끌어온 점의 나란함·수직(`inference.trackDirs`)

- `MeasureInference.trackDirs`(기본 꺼짐 — `true`에 들지 않는다, `track`과 함께 켠다): 끌어온 점에서 기준 선분과 나란한 선·수직인 선 위의 점에 붙잡는다.
  기준 선분은 0.10.0 나란함과 같이 커서가 앞서 지나간 선분·윤곽선이다(`parallel`을 켜지 않아도 기억한다). 방향은 순수 `trackDirGuides`(세계 축 — 나란함, 끌어온 점에서 그 직선으로 내린 수직,
  축을 선분에 수직인 평면에 비친 방향. 축과 같은 선은 끌어온 축이 맡아 뺀다), 점은 `trackDirSnap`이다
- 차례(정한 것): 점 붙잡기 → 끌어온 점 후보(첫 점 축 위 나란한 자리·축끼리·선분·면과의 교차, 열린 교차) → 첫 점 축·나란함 → 끌어온 축과 이것(화면에서 가까운 것, 같으면 끌어온 축).
  첫 점 축·나란함과 끌어온 점의 나란함·수직 선이 만나는 점은 없다(남은 일)
- 값: `measureHoverSnap`·`measurePoints`의 `snap`이 `'parallel'`·`'perpendicular'`이고 `trackFrom`(끌어온 점), 미리 보기에는 `edge`(기준 선분)가 실린다. `direction`은 없다 —
  첫 점을 지나는 선이 아니므로 Shift·`setMeasureInferenceLock(true)`가 그 선으로 잠그지 않는다(끌어온 축과 같다. `measureHoverLock`은 `null`).
  앱이 `'parallel'`·`'perpendicular'`을 첫 점의 방향으로 보던 코드는 `trackFrom`이 있으면 끌어온 점의 안내로 본다(잠그지 않은 미리 보기에서 `trackFrom`과 함께 오는 것은 이것뿐이다)
- 잠근 동안(정한 것): 보지 않는다. 잠근 선 위 점이 먼저이고, `lockTracks`는 끌어온 점의 축과만 만난다. 그 선 위에 머물러도 끌어온 점으로 기억하지 않는다(선 위 점이다)
- 그리기: 끌어온 점에서 붙잡을 점까지 추론 색(자홍) 쇄선(`[8, 3, 2, 3]` — 끌어온 축의 `[4, 3]` 점선·축 색과 구별), 기준 선분 추론 색 점선(0.10.0 나란함과 같다),
  붙잡을 점은 추론 색 동그라미와 기준 선분 방향의 ∥(나란함)·⊥(수직). 첫 점에서 그은 선은 보통 측정 색이다
- 터치: 머무르기가 없으므로 앱이 `setMeasureTrackPoints`로 끌어온 점을 준다(그대로). 기준 선분은 터치 미리 보기도 지나간 모서리다
- 켜지 않으면 0.26.0과 같다(화소·값 회귀의 끌어온 축 값 묶음이 같다)

```ts
// NC: 끌어온 점에서 지나간 모서리와 나란함·수직(SketchUp은 모서리·면에 대한 맞춤으로 든다 — 선택으로만)
viewer.setMeasureSnap({ ...ncSnapOptions(t), inference: { ...MEASURE_INFERENCE, track: true, trackDirs: true } });
```

### 뷰어 글상자 기본 자리(`setMeasureLabelSpot`)

- `viewer.setMeasureLabelSpot(spot: LabelSpotName | { measure?: LabelSpotName; annotations?: LabelSpotName } | null): void`: 측정 거리 글상자(`measure` — 기준점 = 두 점 화면 가운데)와
  앱 측정 덧그림 글상자(`annotations` — 기준점 = 덧그림의 글자 상자 자리)를 기준점 오른쪽 위 대신 앱이 정한 자리부터 놓는다. 문자열 하나면 둘 모두, 객체면 준 것만
- `LabelSpotName`: 순수 `placeMeasureLabel`·`placeLabelAmong`의 `first`(0.26.0 `LabelSpot`)에서 앱 자리 `{ x, y }`를 뺀 이름 자리(`'topRight'`·`'topLeft'`·`'bottomRight'`·
  `'bottomLeft'`·`'center'`·`'above'`·`'below'` — 캔버스 안으로 당긴다). 글상자가 기준점을 따라 움직여 앱 자리는 받지 않는다. 모르는 값은 그 글상자에 주지 않은 것으로 본다
- 차례: 피할 자리(`setMeasureLabelAvoid`)·먼저 놓인 글상자와 겹치면 0.26.0 `first`와 같은 차례(기본 자리 → 기준점 네 귀 → 선분 위 → 피할 영역 위·아래)로 비키고, 모두 막히면 그 기본 자리다
- 그림 저장(`toBlob`·`renderImage`)도 이 자리에 그린다(비키지는 않는다 — 0.13.0과 같다). `measureLabelSpot`(준 것만의 복사본, 없으면 `null`). `null`·빈 객체면 끈다(0.26.0 자리).
  장면을 바꿔도·측정을 지워도 남는다(`setMeasureLabelAvoid`와 같다)
- 순수(`opencad-viewer3d/measurelabel`): `LabelSpotName`, `labelSpotName(v)`(이름 자리면 그 값, 아니면 `null`)

```ts
// STEP: 개체 측정 덧그림 값은 기준점 가운데, 측정 거리 글상자는 두 점 아래
viewer.setMeasureLabelSpot({ annotations: 'center', measure: 'below' });
```

### 앱이 할 일

- NC: 코어를 `#v0.27.0`으로 올린다. 포켓·홈 그물을 만들 때 뚜껑(판 윗면 자리) 삼각형 구간을 기억해 `setItemPickOpaque(id, true)` 뒤 `setItemPickThrough(id, 뚜껑)`을 준다
  (장면을 줄 때마다 — `setScene`이 겉모습을 비운다). 포켓 바닥에 구멍이 있으면 바닥 삼각형도 함께 주면 구멍 기둥(불투명)을 고르고, 주지 않으면 포켓 바닥에서 멈춘다(벽은 늘 멈춘다).
  그림·윤곽선은 그대로라 README 남은 일의 "포켓 윗면에서 멈춤"을 뺀다. 끌어온 점의 나란함·수직은 `inference`에 `trackDirs: true`를 더하면 된다(지나간 모서리는 코어가 기억한다 —
  툴팁·상태 줄이 `'parallel'`·`'perpendicular'`을 첫 점 방향으로 쓰면 `trackFrom`이 있을 때 "끌어온 점과 나란함·수직"으로 바꾼다 — 새 글은 앱 사전에). 뷰어 글상자 자리는 바꾸지 않아도 된다
- SKP: 선택. 자체 측정 붙잡기는 순수 `trackDirGuides`·`trackDirSnap`을 그대로 쓴다(뷰어 API는 바뀌지 않았다). 코어 덧그림을 쓰면 `setMeasureLabelSpot({ annotations: 'center' })`로
  결과 글처럼 가운데부터 놓을 수 있다
- STEP: 선택. 부품을 반투명으로 보이는 기능에서 일부 면만 지나가게 하려면 `setItemPickThrough`, 개체 측정 덧그림 글상자 자리를 바꾸려면 `setMeasureLabelSpot`. 바꾸지 않으면 0.26.0과 같다
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.28.0: 끌어온 점 나란함·수직의 기준 선분 거르기·글상자 자리가 막히면 예전 차례·GPU 버퍼 성분별 바이트

새 선택(`inference.trackDirs`의 객체 꼴 `{ edge }`, `placeMeasureLabel`·`placeLabelAmong`의 `fallback`)과 새 읽기(`stats.buffers`)를 쓰지 않으면 그림·고르기·측정은 0.27.0과 화소·값까지 같다
(`npm run pixels -- --base v0.27.0 --timeout 900`: 0.27.0의 장면 121개·값 74묶음 모두 같음. 새 값 `cross-measure-track-dir-edge`·`base-buffer-stats`는 0.27.0에 없는 API라 건너뛰고
head에서 두 번 찍어 같은 것을 확인했다. 249초, load average 5~13).
바뀐 기본 동작은 없다. 렌더러는 GPU 버퍼를 모두 한 곳에서 만들고 지우도록 고쳤지만 GL을 부르는 차례는 그대로다(가짜 WebGL 그리기 기록 시험과 화소 비교가 같다).
입력 타입은 선택 필드만 넓어졌다(`MeasureInference.trackDirs`가 `boolean | MeasureTrackDirOptions | null`, `LabelPlaceOptions.fallback`). 출력 타입 `Viewer3dStats`에 `buffers`가 늘었고,
`NormalizedInference.trackDirs`는 거르기를 줬을 때만 `{ edge }` 꼴이다(앱이 이 타입 객체를 직접 만들지 않으면 그대로다).

NC 요청은 `trackDirs`를 켜 보니 기준 선분이 원호·구멍 테두리를 나눈 짧은 현이 되면 엉뚱한 방향에 붙는 것(훑은 자리 196~256곳 가운데 13~67곳이 바뀜)을 앱이 거르는 방법,
SketchUp 요청은 결과 글 자리를 코어 한 번으로 바꾸려 해도 0.26.0 `first`만으로는 앱 `labelSpot`과 같은 자리가 84%(`{ x, y }`)·73%(`'center'`)뿐이라 "막히면 0.25.0 차례 그대로" 선택과,
잡음 큰 RSS 대신 GPU 쪽 감소를 바로 재는 성분별 GPU 버퍼 바이트였다. 0.27.0 남은 일 "끌어온 점의 나란함·수직 선이 첫 점 축·다른 끌어온 축·모서리·면과 만나는 점"은
순수 계산(`trackDirMeetSnap`)과 뷰어에 넣을 설계까지 했다.

### 끌어온 점 나란함·수직의 기준 선분 거르기(`inference.trackDirs: { edge }`)

- `MeasureInference.trackDirs?: boolean | MeasureTrackDirOptions | null`, `MeasureTrackDirOptions { edge?: TrackDirEdgeFilter | null }`,
  `TrackDirEdgeFilter = (seg: SnapSegment, item: LineSet3d | Mesh3d) => boolean`
- 커서가 선분·윤곽선 위를 지날 때 앱 함수에 그 선분(`SnapSegment` 복사본 — `kind` `'line'`·`'edge'`, 묶음 `id`, 원본 번호 `index`(선분 묶음은 `segmentIds`를 거친 값), 배열 안 번호 `raw`,
  세계 끝점 `ends`)과 그 묶음 객체(선분 묶음, 윤곽선이면 그 그물 — 장면에 준 객체 그대로)를 넘기고, `true`일 때만 끌어온 점의 기준 선분으로 받는다. 받지 않으면 앞서 받은 기준이 남는다
  (받은 것이 없으면 안내가 없다)
- 바로 앞에 물은 선분(같은 묶음 객체·종류·배열 안 번호·끝점)은 다시 묻지 않는다. 앱 함수가 던지거나 `true`가 아닌 값을 돌려주면 받지 않는다
- 정한 것: 0.10.0 나란함(첫 점에서 — `parallel`)의 기준은 거르지 않고 따로 기억한다(첫 점 나란함·Shift 잠금·앱의 원호 접선 잠금이 그대로다).
  순수 `trackDirGuides`·`trackDirSnap`은 기준 선분을 바로 받으므로 거르기를 받지 않는다(자체 줄자는 지나간 모서리를 기억할 때 앱이 거른다)
- `true`·`{}`·`{ edge: null }`은 0.27.0과 같다(시험이 화면 격자 미리 보기 값을 견준다). `measureSnap.inference.trackDirs`는 거르기를 줬으면 `{ edge }`(같은 함수), 아니면 `true`다.
  `setMeasureSnap`을 다시 주면 받은 기준을 잊는다(0.10.0 나란함 기준과 같다)
- 툴팁: 끌어온 점 안내는 `snap`이 `'parallel'`·`'perpendicular'`이고 `trackFrom`이 있고 `locked`가 없는 것이다. 첫 점의 나란함은 `trackFrom`이 없고 `direction`이 있으며,
  수직 발(첫 점에서 내린)에도 `trackFrom`이 없다. `edge`는 기준 선분의 세계 끝점이다

```ts
// NC: 원호 이동·둘레 호를 나눈 현은 기준이 되지 않는다(판 모서리·직선 이동만) — 앱의 판재 붙잡기 표로 가른다
viewer.setMeasureSnap({ ...ncSnapOptions(t), inference: { ...MEASURE_INFERENCE, trackDirs: { edge: (s) => !isArcChord(s) } } });
// isArcChord(s): 선분 묶음은 `${s.id}#${s.index}`(이동 번호)가 원호·나선 이동인지, 윤곽선(s.kind === 'edge')은 그 그물 둘레의 s.raw번 선분이 호 요소인지

// 툴팁: 끌어온 점 안내를 첫 점 방향·수직 발과 가른다
const h = viewer.measureHoverSnap;
const fromTrack = !!h?.trackFrom && !h.locked && (h.snap === 'parallel' || h.snap === 'perpendicular');
const label = fromTrack ? (h!.snap === 'parallel' ? '끌어온 점에서 모서리와 나란함' : '끌어온 점에서 모서리에 수직') : snapLabel(h?.snap, h?.axis);
```

### 글상자 자리가 막히면 0.25.0 차례로(`placeMeasureLabel`·`placeLabelAmong`의 `fallback`)

- `LabelPlaceOptions.fallback?: LabelFallback`(`'first' | 'topRight'`) — 주지 않거나 모르는 값이면 `'first'`(0.26.0 — 기본 자리부터 이어지는 차례). 0.27.0과 같다(0.27.0 계산 사본과 무작위 800가지)
- `'topRight'`: 기본 자리(`first`)가 막히면 `first`를 주지 않은 고르기(0.25.0 — 오른쪽 위부터)의 자리를 받고, 그것도 막혔으면 기본 자리다
  - `placeMeasureLabel`: 기본 자리가 피할 영역(`rects`·`circles`)과 겹치면 막힘. 0.25.0 자리가 피할 영역과 겹치지 않으면 받는다
  - `placeLabelAmong`: 기본 자리가 피할 영역이나 먼저 놓인 글상자와 겹치면 막힘. 기본 자리가 피할 영역과 겹쳤으면 0.25.0 자리(`placeLabelAmong` 그대로)가 피할 영역만 비키면 받고
    (먼저 놓인 글상자와 겹쳐도), 먼저 놓인 글상자와만 겹쳤으면 둘 다 비켜야 받는다
- SketchUp 결과 글 자리(`labelSpot`)의 계산 사본과 무작위 3,000가지(정밀 조준 원·손가락·툴팁·띠, 화면 선분, 측정 점 표식, 먼저 놓인 글상자 0~29개)에서 모두 같다.
  같은 입력에서 0.26.0 `first`만으로는 2,425가지(81%)가 같았다 — 측정 점 표식을 비키려 오른쪽 위를 건너뛰는 경우, 피할 영역 위·아래 자리의 차례·가로 자리, 먼저 놓인 글상자와 다시 고르는 차례가 다르다
- 측정 점 표식은 `avoid.soft`로 준다(앱의 지금 코드와 같다 — 따로 준 `soft` 인자는 0.25.0 고르기의 둘째 고르기에만 쓰인다). 오른쪽 위가 기본 자리면 `placeMeasureLabel`은 `fallback`과 무관하게 0.25.0과 같다(`placeLabelAmong`은 위 받는 규칙대로 — 먼저 놓인 글상자와만 겹쳤는데 0.25.0 자리도 그것과 겹치면 기본 자리)
- 뷰어 글상자(`setMeasureLabelSpot`)는 이 선택을 받지 않는다(0.27.0 차례 그대로)

```ts
// SKP: labelSpot을 코어 한 번으로 — 기본은 당기지 않은 가운데, 막히면 0.25.0 차례(지금 앱과 같은 자리)
const a = soft?.length ? { ...avoid, soft } : avoid;
const r = placeLabelAmong([x, y], { width, height }, view, a, placed, seg, null, { first: { x: x - width / 2, y: y - height / 2 }, fallback: 'topRight' });
const moved = r.x !== x - width / 2 || r.y !== y - height / 2;
```

### GPU 버퍼 성분별 바이트(`stats.buffers`)

- `Viewer3dStats.buffers: GpuBufferStats` — 살아 있는 GPU 버퍼마다 `bufferData`로 잡은 크기를 성분(`GpuBufferPart`)별로 더한 바이트와 합 `bytes`·버퍼 수 `count`.
  장면 그물은 `positions`·`normals`·`colors`·`uvs`·`backUvs`(따로 준 뒷면 무늬 좌표)·`indices`·`edges`(윤곽선), 선분 묶음은 `lines`·`lineColors`, 점 묶음은 `points`,
  코어가 만든 것은 `wireframe`(와이어프레임 색인 — 와이어프레임으로 그린 뒤 장면을 바꿀 때까지 둔다)·`ranges`(구간 숨김·강조의 모은 자료), 그 밖은 `overlay`(격자·표식·강조 선분·
  단면 테두리·측정 덧그림 선·공용 버퍼)
- 같은 배열은 한 번만 올리므로 처음 올린 성분으로 한 번만 센다(뒷면이 `uvs`를 함께 쓰면 `uvs`에만, 그물 여럿이 함께 쓰는 배열은 한 번)
- 놓기(`release`)는 GPU 버퍼를 지우지 않으므로 놓지 않은 장면과 같다. 작은 정수 배열은 그 바이트(Int8 법선 4값 = 정점마다 4바이트, Float32는 12바이트), 나눠 올리기는 크기를 잡는 순간부터 센다.
  그물 바꾸기·빼기 뒤에는 살아 있는 버퍼대로다(물려받은 버퍼는 그대로, 아무도 쓰지 않게 된 버퍼는 뺀다). 문맥을 잃으면 0이고, 되찾으면 다시 올린 것만이다(놓은 장면은 앱이 다시 줄 때까지 법선·무늬 좌표가 0)
- 무늬 그림은 0.9.0부터 `stats.textures.bytes`(밉맵 포함 어림)다. 틀 버퍼·그림자 깊이 그림 같은 그림 메모리는 세지 않는다
- 시험: 가짜 WebGL의 살아 있는 버퍼와 합·버퍼 수가 같은지(위 모든 경우, 끝낸 뒤 남는 버퍼 없음), 성분마다 장면 배열 바이트와 같은지(`tests/v0280buffers.test.ts`)

```ts
// SKP: 큰 모형에서 작은 배열로 줄인 GPU 쪽 감소를 바로 잰다(잡음 큰 RSS 대신)
const b = viewer.stats.buffers;
console.log(`GPU 버퍼 ${(b.bytes / 1e6).toFixed(1)} MB · 법선 ${(b.normals / 1e6).toFixed(1)} · 무늬 좌표 ${((b.uvs + b.backUvs) / 1e6).toFixed(1)}`);
```

### 끌어온 점 나란함·수직 선이 만나는 점(순수 `trackDirMeetSnap` — 뷰어 측정 붙잡기에는 아직 없다)

- `trackDirMeetSnap(f, tracks, seg, x, y, snapPx, opts?)`(`opencad-viewer3d/track`): 끌어온 점마다 `trackDirGuides`의 선이 `opts.lines`(부르는 쪽이 고른 직선 `TrackDirOtherLine` —
  지나는 점·방향·꼬리표: 첫 점 축, 첫 점의 나란함, 다른 끌어온 점의 축)와 3D로 만나는 점, `opts.segs`(커서 둘레 선분)와 만나는 점, `opts.under`·`opts.hitAt`(커서 아래 면)을 뚫는 점 가운데
  커서에서 `snapPx` 안이고 가장 가까운 것
- 결과 `TrackDirMeetSnap` = `TrackDirSnap`(찍을 점·끌어온 점·안내 종류·방향·화면 거리)과 `meet`(`{ kind: 'line', line, tag }` · `{ kind: 'edge', seg }` · `{ kind: 'face', hit }`)
- 규칙(정한 것): 직선끼리는 0.17.0 `trackPairSnap`과 같은 허용치(그 깊이에서 화면 반 화소 — 만나지 않는 직선은 받지 않는다), 선분은 `trackEdgeSnap`, 면은 `axisFaceSnap` 규칙이다.
  교차가 끌어온 점·그 직선이 지나는 점·첫 점 자리면 뺀다. 세계 축과 만나면 찍는 점의 남은 좌표는 그 축 값 그대로다. 거리가 같으면 앞 점 → 안내 차례 → 직선 → 선분 → 면
- 뷰어에 넣을 때(설계): 끌어온 점 후보(`chooseTrackPoint` — 첫 점 축 위 나란한 자리·축끼리·선분·첫 점 축과 선분·면·열린 교차) 뒤 차례에 넣는다. 직선은 첫 점 축(`axes`)·첫 점의 나란함
  (`parallel`)·다른 끌어온 점의 축이고, 값은 `snap` `'parallel'`·`'perpendicular'`·`trackFrom`·`edge`에 만난 것(`trackOther`·`segment`·`face`)을 싣는다. 첫 점 축과 만나면
  그 축 방향을 실어 Shift로 그 축에 잠글 수 있게 한다(0.17.0 축끼리 교차와 같다). 켜는 선택은 `trackDirs`에 더한다(`{ edge, meets: true }` 같은 꼴 — 기본 꺼짐)
- 0.29.0에 이 설계대로 뷰어 측정 붙잡기에 넣었다(`inference.trackDirs: { meets: true }` — 아래 0.29.0)

### 앱이 할 일

- NC: 코어를 `#v0.28.0`으로 올린다. `trackDirs: { edge }`로 원호·나선 이동(`segmentIds`의 이동 번호)과 판 둘레·포켓 둘레·구멍 테두리 윤곽선의 호 요소를 나눈 현을 거른다
  (앱의 판재 붙잡기 표로 가른다). 판 모서리는 대개 축과 나란해 끌어온 축이 맡으므로 거른 뒤 남는 기준은 기운 직선 모서리·직선 이동이다. 툴팁·상태 줄은 `trackFrom`이 있고 잠그지 않은
  `'parallel'`·`'perpendicular'`을 "끌어온 점에서 모서리와 나란함·수직"으로 보인다(새 글은 앱 사전에)
- SKP: 코어를 `#v0.28.0`으로 올린다. `labelSpot`을 `placeLabelAmong(…, { first: { x: x − w / 2, y: y − h / 2 }, fallback: 'topRight' })` 한 번으로 바꿀 수 있다(측정 점 표식은 `avoid.soft`로 —
  지금 코드와 같은 자리). 큰 모형 메모리 확인은 `viewer.stats.buffers`(법선·무늬 좌표 성분)로 잰다
- STEP: 선택. 바꾸지 않으면 0.27.0과 같다(큰 모형의 GPU 버퍼는 `stats.buffers`로 볼 수 있다)
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.29.0: 끌어온 점 나란함·수직 선이 만나는 점(측정 붙잡기)·뷰어 글상자가 막히면 예전 차례·되찾은 뒤 다시 올리기 끝 알림·첫 점 나란함의 기준 거르기

새 선택(`inference.trackDirs`의 `meets`, `inference.parallelEdge`, `setMeasureLabelSpot`의 `fallback`)과 새 알림·읽을 값(`onContextRestoreDone`·`restorePending`)을 쓰지 않으면
그림·고르기·측정은 0.28.0과 화소·값까지 같다(`npm run pixels -- --base v0.28.0 --timeout 900`: 0.28.0의 장면 121개·값 76묶음 모두 같음. 새 장면 2개·값 4묶음은 0.28.0에 없는 API라 건너뛰고
head에서 두 번 찍어 같은 것을 확인했다. 264초, load average 14~16).
바뀐 기본 동작은 하나다 — 문맥을 되찾은 뒤 무늬를 잇달아 풀어 올리는 동안 무늬마다 다시 그리지 않는다(아래 — 다 돌아온 그림은 같다, `tex-restore`·`tex-release-restore`가 0.28.0과 같다).
입력 타입은 선택 필드만 더해졌다(`MeasureTrackDirOptions.meets`, `MeasureInference.parallelEdge`, `MeasureLabelSpot.fallback`). 출력 타입 `NormalizedInference.trackDirs`의 객체 꼴이
`NormalizedTrackDirs`(`edge?`·`meets?` — 준 것만 있다)로 넓어졌고(0.28.0은 `{ edge }` — 이 객체의 `edge`를 바로 부르는 앱 코드만 `undefined`를 따지면 된다), `NormalizedInference.parallelEdge`가 늘었다.

NC 요청은 0.28.0에 순수 계산과 설계만 있던 "끌어온 점 나란함·수직 선이 첫 점 축·다른 끌어온 축·모서리·면과 만나는 점"을 뷰어 측정 붙잡기에 넣는 것,
SketchUp 선택 요청은 되찾은 뒤 다시 올리기가 다 끝났음을 알리는 알림과 문맥 복구 때 무늬 다시 풀기 속도(곡면·색 바꾼 무늬가 많은 큰 모형에서 코어 몫이 11초쯤),
STEP 요청은 0.10.0 나란함(첫 점에서)의 기준 선분 거르기(측정 격자 132,000자리에서 첫 점 "모서리와 나란히" 88자리 가운데 64자리가 원·타원·B-스플라인을 나눈 현이 기준이었다)였다.
0.28.0 남은 일 "기본 자리가 막히면 0.25.0 차례로 고르는 선택이 순수 함수에만 있다"도 넣었다.

### 끌어온 점 나란함·수직 선이 만나는 점(`inference.trackDirs: { meets: true }`)

- `MeasureTrackDirOptions.meets?: boolean`(기본 꺼짐 — `true`일 때만): 끌어온 점의 나란함·수직 선(0.27.0)이 다른 것과 만나는 점에 붙잡는다(순수 0.28.0 `trackDirMeetSnap`).
  만나 보는 것은 첫 점을 지나는 X·Y·Z 축, 첫 점의 나란함(`parallel`을 켰을 때 — 0.10.0 기준 선분과 나란한 선, 그 기준이 축과 나란하면 그 축이 맡는다), 다른 끌어온 점의 X·Y·Z 축
  (그 축이 첫 점 축과 같은 직선이면 첫 점 축만), 커서 둘레 선분·윤곽선(24개까지 — 0.9.0과 같은 한도, 가림은 0.17.0과 같다), 커서 아래 보이는 그물 면(0.18.0 `axisFaces`와 같은 다시 맞춰 보기 —
  `axisFaces`를 켜지 않아도 본다, 반투명 너머 고르기 반영)이다. 직선끼리는 3D로 만날 때만(그 깊이에서 화면 반 화소 안)이다. 안내 선끼리(두 끌어온 점의 나란함·수직 선)는 보지 않는다
- 차례(정한 것): 점 붙잡기 → 끌어온 점 후보(첫 점 축 위 나란한 자리·축끼리·선분·첫 점 축과 선분·면·열린 교차) → 이것(점 후보 — 뒤 차례라 1화소 넘게 가까워야 이긴다) →
  첫 점 축·나란함 → 끌어온 축과 그 선 위 점. 잠근 동안에는 보지 않는다(0.27.0과 같다)
- 값: `snap` `'parallel'`·`'perpendicular'`(안내 종류), `trackFrom`(끌어온 점), `edge`(기준 선분)는 0.27.0 그 선 위 점과 같고, 만난 것이 더해진다 —
  첫 점 축이면 `axis`·`direction`(그 축 방향), 첫 점의 나란함이면 `direction`(그 나란함 방향), 다른 끌어온 점의 축이면 `trackOther`, 선분·윤곽선이면 `segment`, 그물 면이면 `face`.
  찍은 점(`measurePoints`)에도 같다. 세계 축과 만나면 그 축에 수직인 좌표는 축 값 그대로다(셈 오차 없이)
- 잠금: 첫 점 축과 만나면 Shift·`setMeasureInferenceLock(true)`가 그 축에 잠그고(0.17.0 축끼리 교차와 같은 규칙 — `measureHoverLock`이 축 잠금), 첫 점의 나란함과 만나면 그 나란함에 잠근다.
  선분과 만나는 점은 그 선분 직선이 첫 점을 지날 때만 그 방향으로 잠근다(0.17.0과 같다). 다른 끌어온 점의 축·면과 만나는 점은 잠글 방향이 없다
- 다듬기(정한 것): 선분과 만나는 점은 앱 `refine`에 `'axisEdge'`로, 면과 만나는 점은 `refineFace`에 `'axisFace'`로 그 안내 선(`SnapRefineLine` — 끌어온 점·안내 방향, 축 이름 없음)을 넘긴다.
  0.20.0 축이 아닌 잠근 선과 같은 입력이라 받는 규칙(선 위로 내린 자리가 앱 점에서 화면 반 화소 안, 코어 점에서 붙잡기 거리 안)과 기억이 같다 — 곡선 모서리·곡면 위 교차로 옮길 수 있다.
  직선끼리 만나는 점은 넘기지 않는다(정확한 직선이다). 열린 교차(활꼴만 지나는 선)는 안내 선에는 없다
- 기준 선분(정한 것): 커서가 만나 볼 선분 위에 있으면 고르기가 그 선분을 곧 새 기준으로 받아 안내 선이 그 선분과 나란해지므로, 만나는 점은 이 고르기가 기준을 바꾸기 전의 기준으로 보고
  그 점을 고르면 기준을 되돌린다(만나는 점에 붙은 동안 기준이 바뀌지 않는다 — 0.10.0 나란함 기준도). 만나는 점이 없으면 0.27.0처럼 그 선분이 새 기준이다
- 그리기: 끌어온 점에서 추론 색 쇄선(0.27.0 그대로)에 더해 첫 점에서 그은 선은 만난 선의 색(축 색·추론 색), 다른 끌어온 점의 축이면 그 점에서 축 색 점선(0.17.0과 같다), 붙잡을 점에 추론 색 ×
- 비용(가짜 WebGL, 미리 보기 한 번 `measureAt`, 커서 둘레 선분 24개 — 한도까지 찬 자리에서 끌어온 점 셋·첫 점·나란함, 400자리, load average 13~19): 평면(안내 선이 면과 나란하다)에서 평균 0.045~0.087 ms →
  0.053~0.069 ms(p95 0.12~0.19 → 0.09~0.11 ms), 비스듬한 기준(안내 선이 바닥을 뚫어 면 다시 맞추기가 든다)에서 0.039~0.042 → 0.061~0.062 ms(p95 0.11 → 0.10 ms)
- 켜지 않으면 0.28.0과 같다(시험이 `true`·`{}`·`{ meets: false }`·모두 받는 `edge`의 화면 격자 미리 보기를 견주고, 켜면 바뀐 자리는 모두 만나는 점인지 본다 — `tests/v0290meet.test.ts`)

```ts
// NC: 원호 현을 거른 끌어온 점 나란함·수직에 만나는 점까지
viewer.setMeasureSnap({ ...ncSnapOptions(t), inference: { ...MEASURE_INFERENCE, trackDirs: { edge: (s) => !isArcChord(s), meets: true } } });

// 툴팁: 끌어온 점 안내(0.28.0 README 예)에 만난 것을 덧붙인다
const h = viewer.measureHoverSnap;
const fromTrack = !!h?.trackFrom && !h.locked && (h.snap === 'parallel' || h.snap === 'perpendicular');
const meet = !fromTrack ? '' : h!.axis ? ` · 첫 점 ${h!.axis.toUpperCase()}축과 만남` : h!.direction ? ' · 첫 점 나란함과 만남'
  : h!.trackOther ? ' · 끌어온 축과 만남' : h!.segment ? ' · 모서리와 만남' : h!.face ? ' · 면과 만남' : '';
```

### 뷰어 글상자 기본 자리가 막히면 0.25.0 차례(`setMeasureLabelSpot`의 `fallback`)

- `MeasureLabelSpot.fallback?: LabelFallback`(`'first' | 'topRight'`): 객체 꼴로 주면 준 기본 자리(측정 거리 글상자·덧그림 글상자) 둘 모두 순수 0.28.0 `fallback`과 같은 규칙으로 고른다 —
  `'topRight'`면 기본 자리가 막혔을 때 기본 자리를 주지 않은 고르기(0.26.0 오른쪽 위부터의 자리)를 받고, 그것도 막혔으면 기본 자리. `'first'`·주지 않으면 0.28.0과 같다
- 화면 덧그림만이다(그림 저장은 비키지 않으므로 기본 자리 그대로). 모르는 값과 기본 자리 없이 준 `fallback`은 뺀다(`measureLabelSpot`은 준 `fallback`도 돌려준다). 글상자마다 다른 `fallback`은 없다
- 시험: 측정 거리 글상자·첫 덧그림 글상자가 순수 `placeLabelAmong(…, { first, fallback: 'topRight' })`와 같은 자리이고, 기본 자리·네 귀·선분 위 자리를 모두 막은 띠에서 `'first'`와 다른지(`tests/v0290label.test.ts`)

```ts
// SKP: 코어 덧그림 글상자도 결과 글처럼 — 가운데가 기본, 막히면 0.25.0 차례
viewer.setMeasureLabelSpot({ annotations: 'center', fallback: 'topRight' });
```

### 되찾은 뒤 다시 올리기 끝 알림(`onContextRestoreDone`·`restorePending`)

- `viewer.onContextRestoreDone(cb: () => void): () => void`: 문맥을 되찾을 때마다 한 번, `onContextRestore` 알림들 뒤에 부른다. 끝은 셋이 모두일 때다 — 나눠 올리기를 마쳤다(장면·그물 바꾸기),
  다시 받을 것이 없다(`restoreNeed`가 `null` — 앱이 `restoreMeshArrays`·`restoreTexture`로 다 줬다), 무늬를 다 풀어 올렸다(코어가 장면의 그림 바이트를 다시 푸는 것과 앱이 준 원본을 푸는 것 —
  풀지 못한 무늬는 끝난 것으로 본다). 0.25.0 `restoreNeed`는 앱이 줄 것만 세서 코어가 그림 바이트를 다시 푸는 동안(`textures: 'bitmap'`)에도 `null`이었다
- 차례(정한 것): `onContextLost` → `onContextRestore`(되찾음, need) → `onContextRestoreDone`. 놓기도 무늬도 없으면 되찾음 알림들 바로 뒤 같은 차례로 온다. 되찾음 알림 안에서 앱이 다 줘도 끝 알림이 그 알림들보다 앞서지 않는다
- 오지 않는 때: 앱이 주지 않은 것이 남으면 오지 않는다(`restoreNeed`로 본다 — SKP처럼 다시 손질하지 못한 무늬를 "평균색"으로 알릴 때). 끝나기 전에 다시 잃으면 그 되찾기의 알림은 없고 다음 되찾기가 끝날 때 온다.
  그 사이 `setScene`으로 새 장면을 주면 그 장면을 다 올렸을 때 온다. `dispose` 뒤에는 오지 않는다
- `viewer.restorePending: boolean`: 잃는 순간 `true`, 끝 알림 직전에 `false`(잃은 적이 없거나 없앤 뒤면 `false`) — 알림을 달기 전에 일어난 되찾기도 읽을 수 있다
- 시험: 놓지 않은 장면·`release: true`·`'bitmap'`과 나눠 올리기, 차례, 다시 잃기, 새 장면, 해제·없앤 뒤(`tests/v0290restore.test.ts`)

### 되찾는 동안 무늬마다 다시 그리지 않기(문맥 복구 무늬 다시 풀기 속도)

- 바뀐 것: 되찾은 뒤 끝 알림(`restorePending`) 전까지는 무늬를 하나 올릴 때 다른 무늬를 아직 푸는 중이면 다시 그리지 않고, 푸는 무늬가 다 끝났을 때 한 번 그린다.
  되찾는 순간의 한 번(위치·색으로), 앱 `restoreMeshArrays`·카메라 조작의 다시 그리기는 그대로다. 앱이 준 원본을 풀지 못한 것이 마지막이면 그때 그린다. 처음 올릴 때(`setScene`)는 0.28.0처럼 무늬마다 그린다.
  다 돌아온 그림은 같다(화소·값 회귀의 `tex-restore`·`tex-release-restore`가 0.28.0과 같다)
- 먼저 나눠 잰 것(헤드리스 Chrome 156 SwiftShader, 무늬 64장 512²·PNG 30.8 MB와 같은 그림의 푼 그림을 `release: { textures: 'bitmap' }`로 올린 뒤 `WEBGL_lose_context`로 잃었다 되찾아 끝 알림까지, 세 번씩, load average 8~19):
  - 무늬만(판 64개): 380~415 ms. 그사이 그림 풀기(`createImageBitmap`) 64번은 합 1.3~1.4초·벽시계 366~395 ms, `texImage2D` 부르기 합 147~169 ms, 다시 그린 화면 9번
  - 삼각형 288만 개 그물을 더하면 10.0~11.3초(다시 그린 화면 10~11번, `texImage2D` 부르기 합 8.6~9.8초 — 소프트웨어 GPU가 그 화면을 다 그릴 때까지 다음 무늬 올리기가 기다렸다)
  - 다시 그리기를 막으면 103~115 ms(풀기 벽시계 97~108 ms, `texImage2D` 10~14 ms) — 코어 몫의 대부분이 풀기·올리기가 아니라 무늬마다 다시 그린 화면이었다
  - 따로 잰 같은 바이트의 풀기 벽시계: 1장씩 235~243 ms, 동시 4장(코어 `TEXTURE_DECODES`) 80~81 ms, 8장 58~61 ms, 16장 49~54 ms. 새 문맥에서 올리기 64장 15~19 ms(`gl.finish`까지), 밉맵은 0에 가깝다
  - 가짜 WebGL(코어 JS 몫, 가짜 풀기 — 바이트 읽기만): 되찾음 사건 처리(장면 다시 올리기) 1.5~2.7 ms, 끝 알림까지 10~18 ms
- 바꾼 뒤 같은 재기: 무늬만 208~219 ms, 큰 그물과 함께 1.44~1.50초(되찾는 순간 그린 한 번이 남는다 — 기계 GPU에서는 그 화면이 싸다)
- 동시 풀기 수(4)는 그대로 둔다: 8장이면 이 재기에서 20 ms쯤 줄지만 큰 무늬(4096²)에서는 한꺼번에 쥐는 푼 그림이 두 배(장마다 64 MB)라 휴대폰 메모리에 불리하다

### 첫 점 나란함의 기준 선분 거르기(`inference.parallelEdge`)

- `MeasureInference.parallelEdge?: TrackDirEdgeFilter | null`(기본 없음 — 0.28.0 그대로): 0.28.0 `trackDirs`의 `edge`와 같은 꼴·규칙으로 커서가 지나간 선분·윤곽선을 물어 받은 것만
  0.10.0 나란함(첫 점에서 — `parallel`)의 기준으로 기억한다. 받지 않으면 앞서 받은 기준이 남고, 받은 것이 없으면 첫 점의 나란함이 없다. `parallel`과 함께 쓴다(이것만으로는 켜지 않는다)
- 끌어온 점의 기준(`trackDirs`)과 따로 기억한다. 같은 함수를 둘에 주면 같은 선분은 한 번만 묻는다(바로 앞에 물은 답을 서로 쓴다). 만나는 점의 "첫 점의 나란함" 직선도 이 기준이다
- `NormalizedInference.parallelEdge`(함수를 줬을 때만). 주지 않으면·`null`이면 0.28.0과 같다(`tests/v0290parallel.test.ts`가 화면 격자 미리 보기를 견준다)
- 0.12.0 모서리 끝 선분 방향 잠금과 앱의 원호 접선 잠금(`setMeasureInferenceLock({ direction })`)은 이 기준과 무관하다

```ts
// STEP: 원·타원·B-스플라인을 나눈 현은 첫 점 나란함·끌어온 점 나란함의 기준이 되지 않는다 — 같은 함수 하나로
const edge = (s: SnapSegment) => !curvedEdge(s);
viewer.setMeasureSnap({ ...snapOptions, inference: { ...inference, parallel: true, parallelEdge: edge, trackDirs: { edge } } });
```

### 앱이 할 일

- NC: 코어를 `#v0.29.0`으로 올린다. 만나는 점은 `trackDirs: { edge, meets: true }`로 켠다. 툴팁·상태 줄은 끌어온 점 안내(`trackFrom`이 있고 잠그지 않은 `'parallel'`·`'perpendicular'`)에
  만난 것(`axis`·`direction`·`trackOther`·`segment`·`face`)을 덧붙인다(새 글은 앱 사전에). 원호 모서리·곡면과 만나는 점을 정확히 하려면 지금 `refine`(`'axisEdge'`)·`refineFace`(`'axisFace'`)가
  축 이름 없는 직선(`line.axis` 없음)을 이미 풀므로(0.20.0) 그대로 된다. 첫 점 나란함의 현도 거르려면 `parallelEdge`에 같은 함수를 준다
- SKP: 코어를 `#v0.29.0`으로 올린다. `ContextWatch`가 되찾음 알림에서 안내를 거두던 것을 `onContextRestoreDone`(또는 `restorePending`)으로 바꾸면 코어가 그림 바이트를 다시 풀어 올리는 동안까지
  안내를 둘 수 있다(`restoreNeed`가 남으면 끝 알림이 오지 않으므로 "평균색" 안내는 지금처럼 `restoreNeed`로). 되찾기 속도는 코어 쪽에서 무늬마다 다시 그리지 않게 바꿨으므로 앱은 할 일이 없다
  (헤드리스 다섯 번 재기의 "무늬까지 다 돌아오기 16.6~18.1초" 가운데 코어 몫이 줄어든다). 코어 덧그림 글상자를 쓰면 `setMeasureLabelSpot({ annotations: 'center', fallback: 'topRight' })`
- STEP: 코어를 `#v0.29.0`으로 올린다. `parallelEdge`에 `trackDirs`의 `edge`와 같은 곡선 현 거르기를 준다(첫 점 "모서리와 나란히"의 기준에서 원·타원·B-스플라인을 나눈 현이 빠진다)
- DWG: 3D 뷰어 코어를 쓰지 않는다

npm에 올리지 않고 GitHub 의존으로 씁니다. TypeScript 원본 그대로 내보내므로 Vite 같은 번들러와 `moduleResolution: "bundler"`가 필요합니다.

```json
"dependencies": {
  "opencad-viewer3d": "github:GyuTae-Kim/opencad-viewer3d#v0.29.0"
}
```

```ts
import type { Scene3d } from 'opencad-viewer3d/types';
```

`opencad-viewer3d/<파일>`로 `src/` 아래 모듈을 바로 가져올 수 있습니다(예: `opencad-viewer3d/camera`).

## 구조

| 파일 | 내용 |
|---|---|
| `src/index.ts` | 공개 입구 |
| `src/types.ts` | 장면 계약(`Scene3d`, `Mesh3d`, `LineSet3d`, `PointSet3d`, `Pick3d`) |
| `src/viewer.ts` | `Viewer3d`: 조작·고르기·측정·단면·화면 덧그림 |
| `src/pointer.ts` | 포인터 종류별 문턱(끌기 시작·고르기 허용 거리·두 번 누르기, 터치만 넓게) |
| `src/renderer.ts`, `src/shaders.ts`, `src/upload.ts` | WebGL2 그리기(묶음 원점 RTC, 단면 자르기·잘린 면 채우기, 무늬, 셰이더 변종 — 여러 단면·숨은 선·해·그림자·안개·뒷면, 외곽선(그물마다 색)·하늘 바탕·그림자 깊이 그림), 큰 배열 조각 올리기, 올린 뒤 성분 기억·놓기·문맥 복구 때 다시 받기와 올리는 중인지(되찾은 뒤 끝 알림), 작은 법선·무늬 좌표의 정점 속성 꼴·무늬 좌표 축척·이동, 살아 있는 GPU 버퍼의 성분별 바이트 |
| `src/attribs.ts` | 작은 정점 속성 배열 순수 계산(법선 Int8·Int16, 무늬 좌표 Int16·Uint16의 꼴 판정·정규화 값, 줄이기 도우미 `packNormals`·`packUvs`) |
| `src/release.ts` | 놓기·문맥 복구 순수 계산(놓기 선택 정리, 지운 배열의 올린 꼴에서 다시 받을 것 고르기) |
| `src/annotate.ts` | 앱 측정 덧그림 모양·글(거리·각·반지름·점) |
| `src/closest.ts` | 두 묶음 최근접점(BVH 둘을 함께 내려가며, 점·선분·삼각형 쌍) |
| `src/billboard.ts` | 마주 보는 그물 돌림·범위 |
| `src/texture.ts` | 무늬 도구(그림 머리 읽기, 크기 한도·예산 나누기, 뒤집어 풀기) |
| `src/camera.ts`, `src/viewcube.ts` | 카메라·표준 뷰·뷰 큐브 |
| `src/bvh.ts`, `src/pick.ts`, `src/scenepick.ts`, `src/bounds.ts`, `src/segments.ts` | 고르기 가속 구조·고르기(묶음·장면 — 반투명 그물 너머 고르기와 그물마다 고르기 불투명, 그물 일부 면만 지나가기 포함)·커서 둘레 선분·삼각형 모으기·범위, 원본 번호로 강조 선분 모으기 |
| `src/snap.ts`, `src/inference.ts`, `src/track.ts`, `src/snapindex.ts` | 측정 점 붙잡기 고르기(고르기가 붙잡은 점·앱 점·추론 점 가운데)와 측정 결과, 붙잡은 점이 놓인 선분 식별자, 앱이 다듬을 점 고르기와 받을지 판정, 추론 붙잡기(교차점·수직 발·축·나란함)와 방향 잠금(선분 방향·앱이 정한 방향 포함), 끌어온 축(머무르기·끌어온 점 목록·축 붙잡기·축끼리와 선분의 교차), 축·잠근 선과 선분·면의 교차, 축·잠근 선과 꺾은선 토막의 열린 교차(활꼴을 두 번 지나는 둘째 힌트, 토막 범위인 선 조각으로 거르기), 축·잠근 선과 삼각형의 열린 교차(오목하게 보이는 곡면의 제 조각 가림, 한 삼각형 위 두 교차의 둘째 힌트), 잠근 선과 끌어온 축의 교차, 붙잡지 않은 면 위 점 다듬기 받기, 끌어온 점에서 기준 선분과 나란함·수직 방향(0.27.0부터 뷰어 측정 붙잡기도 — 0.28.0부터 앱이 기준 선분을 거른다)과 그 선이 다른 직선·선분·면과 만나는 점(0.28.0 순수, 0.29.0부터 뷰어도), 앱 점 색인(차례 한도) |
| `src/measurelabel.ts` | 측정 거리 글상자·앱 측정 덧그림 글상자 자리 순수 계산(기본 자리 — 앱이 정할 수도, 이름 자리 고르기, 앱 영역·커서를 비켜 갈 자리 차례, 기본 자리가 막히면 예전 차례로 고르기, 먼저 놓인 글상자 비키기, 겹침 판정) |
| `src/walk.ts` | 걷기 중력·부딪힘(세계 광선 맞음, 한 걸음) |
| `src/ranges.ts` | 묶음 안 구간 순수 계산(합치기·숨김/강조 나누기·판정·색인 모으기) |
| `src/section.ts` | 단면 순수 계산(평면·범위 안 위치·교선·광선/선분 자르기·화면 끌기) |
| `src/grid.ts`, `src/marker.ts`, `src/theme.ts`, `src/math.ts`, `src/playback.ts` | 격자·표식·색(캔버스 초점 테두리 포함)·행렬·재생 도우미 |
| `src/synth.ts`, `src/dev.ts`, `dev/viewer3d.html` | 합성 장면(무늬 상자·원근 무늬 판, 작은 배열 판 포함)과 개발 확인 페이지 |
| `scripts/pixels/` | 화소·값 회귀 비교(`npm run pixels`): 비교 페이지·장면 목록, git 판 소스 묶기, 헤드리스 Chrome, PNG·차이, 높이 격자 그물(`grid.ts`) |
| `scripts/bench/` | 그물 바꾸기 비용 재기(`npm run bench:edit`): `setScene` 장면 전체·`setMesh` 그물 전체·`vertices` 구간, SwiftShader와 기계 GPU |
| `tests/fakegl.ts`, `tests/fakedom.ts` | 시험용 가짜 WebGL2(버퍼 내용·그리기 기록)·가짜 DOM — 브라우저 없이 뷰어를 돌려 값을 견준다 |

## 개발

```bash
npm install
npm run dev        # dev/viewer3d.html (주소 인자 ?segs=선분 수&sseg=구 칸 수&theme=light)
                   #   &offset=1e6(큰 좌표, 묶음 원점) &bake=1(원점 없이 구워 넣기 — 떨림 비교) &section=z:0.5(:flip)
                   #   &incremental=1(나눠 올리기) &tex=1(무늬 상자·원근 무늬 판) &compact=1(작은 법선·무늬 좌표 배열 — 상태 줄에 그 바이트).
                   #   단추: 단면 X·Y·Z, 구간 숨김·구간 강조,
                   #   0.7.0 모드(숨은 선·단색·무늬 없음)·외곽선·숨은 점선·하늘·해·그림자·안개·걷기·윤곽선 고르기,
                   #   0.8.0 붙잡기+(가운데 점·중심)·음영 뒤 모서리·대비 선 색·중력·부딪힘,
                   #   0.9.0 추론 붙잡기(교차점·수직 발·축)·그물 선 색,
                   #   0.10.0 나란함·잠금(Shift)·잠금 단추(setMeasureInferenceLock),
                   #   0.16.0 끌어온 축(점 위에 0.5초 머물기 — 측정 상태 줄에 둘째 점의 선분 식별자·끌어온 점),
                   #   0.17.0 같은 단추로 끌어온 축끼리·모서리와 만나는 점(상태 줄에 미리 보기의 끌어온 축·둘째 축·놓인 선분),
                   #   0.18.0 축과 모서리(첫 점 축이 모서리와 만나는 점)·축과 면(첫 점 축·끌어온 축이 면을 뚫는 점 — 상태 줄에 놓인 선분·면),
                   #   0.19.0 잠근 선 교차(잠근 동안 잠근 선이 모서리와 만나는 점·면을 뚫는 점, 축이 구를 뚫는 점은 정확한 구 위로 — 상태 줄에 "잠근 Y축 · 상자#6 위")
                   #   0.20.0 열린 교차(시연 원·기둥을 더해 기둥 아래 끝의 Z축이 원을 뚫는 자리를 정확한 원 위로 — 상태 줄에 "첫 점 Z축 · 시연 원#111 위(다듬음)"),
                   #     면만 고르기(누른 자리의 pick meshesOnly — 상태 줄 고름 뒤에 "아래 면")
                   #   0.21.0 끌어온 축 잠금(잠근 동안 잠근 선이 끌어온 점의 축과 만나는 점 — 상태 줄에 "잠근 X축 · (…)의 Y축과 만나는 점",
                   #     구 위 아무 데나 가리키면 정확한 구 위 점 — "면 위(다듬음)"), 다듬기 기억 비우기(clearMeasureRefine)
                   #   0.22.0 같은 단추들(잠근 선 교차부터)에서 구 위에 뜬 앱 점 '구 스침'을 첫 점으로 찍고 그 Z축이 구를 스치는 자리를 가리키면
                   #     그물 삼각형은 비켜 가도 정확한 구 위 교차(면의 열린 교차 — "첫 점 Z축 · 구 면(다듬음)"; 칸이 보이게 ?sseg=24),
                   #     시연 원 위·아래 토막의 현과 나란히 활꼴 안을 지나는 X축은 두 교차 모두, 면만 고르기는 onPick meshesOnly 알림으로
                   #   0.23.0 반투명 지나 고르기(상자를 반투명·바닥 판을 불투명으로 — 누르면 상태 줄 고름 뒤에 "반투명 너머: 판", 측정도 판 위),
                   #     글상자 비키기(위쪽 띠·뷰 큐브 자리를 setMeasureLabelAvoid로 넘기고 덧그림 넷 — 덧그림·측정 거리 글상자가 비켜 그린다)
                   #   0.24.0 상자 고르기 불투명(반투명 지나 고르기를 켠 채 setItemPickOpaque — 상자 위를 누르면 "반투명 너머"가 상자),
                   #     너머 고르기만 바꾸기(setMeasurePickThrough — 잠금·끌어온 점·찍은 첫 점을 둔 채 측정 고르기의 반투명 너머만 켜고 끈다),
                   #     글상자 겹침(기준점이 겹치는 덧그림 넷 — 화면에서 뒤 글상자가 앞 글상자를, 측정 거리 글상자가 덧그림 글상자를 비킨다)
                   #   0.25.0 놓기(장면 사본을 release로 다시 준다 — 상태 줄에 "놓음"과 사본에 남은 MB), 문맥 잃기·되찾기(WEBGL_lose_context —
                   #     상태 줄에 onContextLost·onContextRestore 알림과 다시 줄 것), 앱이 다시 줌(켜 두면 되찾을 때 원본 장면에서 다시 준다; 무늬는 &tex=1)
                   #   0.26.0 반투명 지나 고르기의 "반투명 너머"를 onPick front 알림 하나로 받아 같은 누르기의 가장 앞 고르기를 "(앞: …)"으로 함께 보인다
                   #   0.27.0 상자 뚜껑 지나기(반투명 지나 고르기·상자 고르기 불투명과 함께 setItemPickThrough로 상자 윗면 삼각형만 지난다 — 윗면을 누르면 "반투명 너머"가 상자 안쪽 면),
                   #     끌어온 점 나란함·수직(inference.trackDirs — 모서리를 지나간 뒤 끌어온 점에서 그 모서리와 나란한 선·수직인 선, 상태 줄 "(…)에서 모서리와 나란함"),
                   #     글상자 기본 자리(setMeasureLabelSpot — 측정 거리 글상자는 아래, 덧그림 글상자는 가운데부터)
                   #   0.28.0 기준 현 거르기(inference.trackDirs { edge } — 공구 경로 나선·시연 원의 현을 지나도 끌어온 점의 기준 선분이 바뀌지 않는다),
                   #     상태 줄에 GPU 버퍼 바이트(stats.buffers — 합·위치·법선·무늬 좌표·색인·선분)
                   #   0.29.0 안내 선 만나는 점(inference.trackDirs { edge, meets } — 끌어온 점의 나란함·수직 선이 첫 점 축·다른 끌어온 축·모서리·면과 만나는 점,
                   #     상태 줄 "(…)에서 모서리와 나란함 · 첫 점 X축과 만나는 점", 첫 점 나란함도 곡선 현을 거른다 — parallelEdge),
                   #     글상자 막히면 예전 차례(setMeasureLabelSpot fallback), 문맥 잃기·되찾기 뒤 상태 줄에 "다시 올리기 끝"(onContextRestoreDone)
npm run typecheck
npm test
npm run pixels -- --base origin/main   # 화소·값 회귀 비교(아래)
npm run bench:edit -- --reps 5         # 그물 바꾸기 비용(0.11.0 비용 표): 선분 30만 + 격자 1024², SwiftShader와 기계 GPU(--backend swiftshader|gpu|both)
```

### 화소·값 회귀 비교

`npm run pixels -- --base <git 판>`은 같은 기계에서 base 판과 지금 작업 트리(커밋 안 한 변경 포함)를 헤드리스 Chrome으로 똑같이 찍어 비교합니다.
Chrome이 있어야 하고(못 찾으면 `CHROME_PATH`로 알려 줍니다), WebGL은 SwiftShader(CPU)로 그려 같은 기계에서는 같은 화소가 나옵니다.

- 합성 장면 123가지를 960×600으로 찍어 RGBA 해시를 비교합니다. 그리기 모드 일곱 가지와 밝은 테마, 숨은 점선, 외곽선, 단면, 평행 투영,
  구간 숨김과 강조, 측정 미리 보기는 보통 좌표와 큰 좌표에서 한 벌씩 찍습니다. 0.8.0의 붙잡기 표식, 음영 뒤 모서리, 대비 선 색과
  걷기(중력 포함), 하늘 바탕, 그림자, 안개, 무늬, 두 단면, 재생, 묶음 겉모습, 측정 덧그림, 뷰 큐브, 0.9.0의 추론 붙잡기 표식(교차점·수직 발·축),
  그물마다 윤곽선·외곽선 색, 나눠 올린 큰 장면, 0.10.0의 붙잡기 한도 미리 보기와 추론 잠금(Shift·앱 단추)·나란함 표식,
  0.12.0의 모서리 끝 선분 방향 잠금(축·대각)과 앱이 정한 방향 잠금, 0.16.0의 끌어온 축(첫 점 축 위 나란한 자리 — 어두운·밝은 테마, 첫 점 전 끌어온 Z축),
  0.17.0의 끌어온 축끼리의 교차(첫 점 전 — 어두운·밝은 테마)와 끌어온 축이 상자 윗모서리와 만나는 점,
  0.18.0의 첫 점 X축이 상자 윗모서리와 만나는 점과 상자 위 기둥 아래 끝(첫 점)의 Z축이 윗면을 뚫는 점,
  0.19.0의 잠근 X축이 상자 윗모서리와 만나는 점과 잠근 Z축이 윗면을 뚫는 점, 0.21.0의 잠근 X축이 끌어온 점(다른 구멍 점)의 Y축과 만나는 점도 찍습니다.
  0.13.0의 측정 거리 글상자 네 장면(`base-measure-label-*`)은 그림 저장 대신 화면 덧그림 캔버스만 찍습니다(비켜 그리기는 화면에만 한다).
  기본 자리 한 장은 옛 API만 써서 base와 견주고, 앱 사각형·정밀 조준(커서 둘레와 손가락, 긴 선분·짧은 선분)으로 옮긴 세 장은 새 장면입니다.
  0.11.0의 그물 바꾸기 여섯 가지(`edit-*`)는 head가 `setMesh`·`removeMesh`로 바꾸고, 그 API가 없는 판(base)은 같은 마지막 장면을 `setScene`(카메라 지킴)으로
  다시 준다 — base·head 비교가 곧 "그물 하나 바꾸기 = 장면 전체 다시 올리기"의 확인이다.
- 값도 비교합니다. 고르기 7,200번, 측정 누르기 2만 4천여 번(앱 점 수천 개 붙잡기·추론 붙잡기, 0.9.1의 축 붙잡기 축, 0.10.0의 차례 한도·추론 잠금·나란함·
  같은 자리 미리 보기 뒤 누르기의 `pointsFor` 포함)의 결과와 화면 위치, 걷기 경로입니다. 0.11.0 `edit-values`는 바꾼 장면의 고르기·측정·미리 보기·범위,
  `edit-same-pixels`는 같은 판 안에서 `setMesh`로 바꾼 그림과 처음부터 `setScene`한 그림의 다른 화소 수(0이어야 한다)입니다.
  0.12.0 `*-measure-edge-lock`은 모서리 끝마다 다른 점을 가리킨 미리 보기·잠글 방향·Shift 잠금·찍은 결과, `*-measure-direction-lock`은
  앱이 정한 방향 잠금(잘못된 값 포함)·찍은 점(`measurePoints`)·거리 글상자 자리(`measureLabelRect`)입니다.
  0.13.0 `base-measure-label-avoid`는 상자 구석에서 여러 점을 가리킨 기본 자리, 그 자리를 막은 자리, 십자선·손가락을 비킨 자리와
  확인 값(막은 자리와 겹치지 않는지, 첫 점 표식을 가리지 않는지, 그림 저장 화소가 피할 자리를 주기 전과 같은지, 화면 덧그림은 옮겼을 때만 바뀌는지)입니다.
  0.14.0 `arc-measure-refine`은 거친 원 둘(상자 위에 뜬 12토막 원 꺾은선, 바닥의 12토막 원판 둘레 윤곽선)에서 앱이 정확한 원 위로 다듬은 가운데 점·토막 위 점·수직 발과
  찍은 거리(정확한 값과 1e-9 안인지), 같은 차례를 `refine` 없이·`null`을 돌려주는 함수·먼 점을 돌려주는 함수로 되풀이한 값이 `refine` 없이와 같은지,
  잠금 중에는 부르지 않는지, 같은 자리 미리 보기 뒤 누르기에서 다시 부르지 않는지입니다. 호출 수는 0.14.0이 넘기던 종류만 셉니다
  (0.15.0의 열린 후보·교차점 호출은 빼고 — 그래서 이 묶음은 0.14.0과 0.15.0이 같아야 합니다).
  0.15.0 `arc2-measure-open`은 상자 위에 뜬 12토막 원, 그와 한 점에서 3D로 만나는 세로 원, 원을 가로지르는 곧은 선분에서 원 밖 멀리 있는 첫 점에서 내린 곡선 위 발,
  원과 곧은 선분의 교차점, 두 원의 교차점을 가리키고 찍은 값(정확한 값과 1e-9 안인지)과, 같은 차례를 `refine` 없이·`null`·코어 점 그대로·맞은쪽 점으로 되풀이한 값이
  `refine` 없이와 같은지, 원을 따라 지나갈 때 이동 한 번의 열린 후보 호출 수와 같은 길을 다시 지나갈 때의 호출 수(기억), 잠금 중 호출 수입니다.
  0.16.0 `cross-measure-segments`는 상자 윗면 위 엇갈린 두 선분의 교차점·끝점, 상자 윤곽선 끝점·가운데 점·위 점, 구멍 점, 수직 발을 가리킨 미리 보기와 찍은 점의
  선분·둘째 선분 식별자이고, 같은 차례를 다듬는 `refine`으로 되풀이해 다듬은 점도 같은 선분인지 함께 남깁니다.
  `*-measure-track`은 구멍 점 위에 머물러(실제 타이머) 기억한 점, 그 점을 지나는 Z축, 첫 점 X·Y축 위 나란한 자리, 잠근 동안, 찍은 거리·찍은 점의 끌어온 점,
  두 점째 뒤 잊는지, Esc로 지우는지와, 같은 차례를 `track` 없이 되풀이한 값입니다.
  0.17.0 `*-measure-track-pair`는 구멍 점 둘의 축이 만나는 두 자리, 높이가 다른 점과는 만나지 않는 자리, 끌어온 축이 상자 윗모서리와 만나는 두 자리의 미리 보기,
  교차 자리를 첫 점으로 찍은 점의 둘째 끌어온 축, 잠근 동안, 모서리 교차를 두 점째로 찍은 결과와 그 선분이고, 같은 차례를 `track` 없이 되풀이한 값입니다.
  0.18.0 `*-measure-axis-edge`는 첫 점 X·Y축이 상자 윗모서리와 만나는 네 자리의 미리 보기·잠글 방향, Shift 잠금과 풀기, 두 점째로 찍은 결과와 선분이고
  같은 차례를 `axisEdges` 없이 되풀이한 값, `arc-measure-axis-edge`는 원판 중심에서 X·Y축이 둘레 토막과 만나는 네 자리를 정확한 원 위로 다듬은 점(원 위인지·거리 = 반지름)과
  앱 호출 수(기억), `refine` 없이·`null`·먼 점·축에서 벗어난 점이 `refine` 없이와 같은지, 잠금 중 호출 수입니다.
  `post-measure-axis-face`는 기둥 아래 끝(첫 점)의 Z축과 끌어온 점의 Z축이 상자 윗면을 뚫는 자리의 미리 보기(면의 그물 id·법선 포함), Shift 잠금, 두 점째로 찍은 결과와
  찍은 점의 면이고, 같은 차례를 `axisFaces` 없이 되풀이한 값입니다.
  0.19.0 `*-measure-lock-edge`는 구멍 점(첫 점)에서 앱 단추로 X·Y축에 잠근 채 상자 윗모서리와 만나는 네 자리, (1, 0.5, 0) 방향 잠금이 오른쪽 모서리와 만나는 자리,
  잠근 채 상자 구석(점 붙잡기 — 잠근 선에 내린 자리), 첫 점 축과 모서리의 교차 미리 보기에서 Shift로 잠근 같은 자리와 두 점째 결과이고 같은 차례를 `lockEdges` 없이 되풀이한 값,
  `post-measure-lock-face`는 기둥 아래 끝에서 Z축·(0.2, 0, −1) 방향 잠금이 윗면을 뚫는 자리, 축과 면의 교차 미리 보기에서 Shift로 잠근 같은 자리와 두 점째 결과·면이고
  같은 차례를 `lockFaces` 없이 되풀이한 값입니다. `globe-measure-lock-refine`(구 위 기둥과 바닥 원판을 더한 자료)은 기둥 아래 끝의 Z축이 구를 뚫는 자리를 `refineFace`로
  정확한 구 위로 다듬은 점(구 위인지·거리), 앱 호출 수(기억, Shift 잠금 중 0번), `refineFace` 없이·`null`·먼 근·축에서 벗어난 구 위 점이 `refineFace` 없이와 같은지,
  원판 중심에서 잠근 X·Y축과 둘레 토막의 교차를 `refine` `'axisEdge'`로 다듬은 점과 호출 수(`lockEdges`를 끄면 0번)입니다.
  0.20.0 `arc-measure-axis-open`은 원판 둘레 0° 자리 위 점(앱 붙잡기 점)을 첫 점으로 찍고 그 Z축이 원판 원을 뚫는 자리(현과는 처짐만큼 떨어진다)를 가리킨 미리 보기(원 위인지)·
  앱 호출 수(기억, Shift 잠금 중 0번)·두 점째로 찍은 거리, 비스듬한 방향 잠금(넘긴 직선에 축 이름이 없는지)과 끌어온 Z축의 같은 자리이고, 같은 차례를 `refine` 없이·`null`·먼 점·
  선에서 벗어난 원 위 점으로 되풀이한 값이 `refine` 없이와 같은지입니다. `*-pick-meshes-only`는 화면 격자 점마다(윤곽선 고르기를 켜고) 보통 고르기와 `meshesOnly` 고르기의
  종류 짝 수, 보통 고르기가 그물 면이면 두 결과가 같은지, 상자 윗모서리·공구 경로·구멍 점 위 몇 자리의 두 결과(그 아래 면·법선)입니다.
  0.21.0 `*-measure-lock-track`은 구멍 점(첫 점)에서 다른 구멍 점을 끌어온 점으로 주고 앱 단추로 X·Y축에 잠근 채 그 점의 축과 만나는 두 자리, (1, 0.5, 0) 방향 잠금이
  그 점의 Y·X축과 만나는 두 자리, 높이가 다른 끌어온 점의 잠근 X축 위 나란한 자리, 첫 점 축 위 나란한 자리 미리 보기에서 Shift로 잠근 같은 자리와 두 점째 결과이고
  같은 차례를 `lockTracks` 없이 되풀이한 값, `arc-measure-clear-refine`은 0.20.0 열린 교차 자리에서 앱 `refine`이 곡선 정의를 받기 전(`null`)·받은 뒤(기억이라 그대로)·
  `clearMeasureRefine` 뒤(다시 불러 원 위)의 미리 보기와 호출 수, 잠금·끌어온 점·찍은 점이 그대로인지, 두 점째 거리입니다. `globe-measure-on-face`는 구 위 아홉 자리를
  가리킨 미리 보기(다듬었는지·정확한 구 위인지·커서 광선 위인지)와 찍은 두 점, 같은 차례를 `refineFace` 없이·`null`·종류로 거르는 앱·맞은편 근·광선에서 벗어난 구 위 점으로
  되풀이한 값이 `refineFace` 없이와 같은지입니다.
  0.22.0 `globe-measure-face-open`은 구 위에 뜬 앱 점(첫 점 — 적도 칸 가운데 바깥)의 Z축이 구를 스치는 위·아래 두 자리(그물 삼각형은 비켜 간다)를 가리킨 미리 보기(구 위인지·면·다듬었는지)와
  앱 호출 수(기억, Shift 잠금 중 0번), 두 점째로 찍은 거리이고, 같은 차례를 `refineFace` 없이·`null`·열린 후보를 거르는 앱·먼 근·축에서 벗어난 구 위 점으로 되풀이한 값이
  `refineFace` 없이와 같은지, `arc-measure-axis-twice`는 원판 토막 2(현이 X축과 나란하다)의 활꼴 안을 지나는 첫 점 X축이 원과 만나는 두 자리, Shift 잠금, 조금 기운 방향 잠금의
  두 자리, 앱 호출 수와 힌트 자리(현 가운데·두 끝의 발), 두 점째 거리와 같은 차례를 `refine` 없이·`null`·선에서 벗어난 점·이웃 토막 곡선 위 점으로 되풀이한 값이
  `refine` 없이와 같은지입니다. `*-pick-on-meshes-only`는 화면 격자 점마다(윤곽선 고르기를 켜고) 눌러 선택 없이 단 알림과 `meshesOnly`로 단 알림이 받은 종류 짝 수,
  두 알림이 `pick(x, y)`·`pick(x, y, { meshesOnly: true })`와 같은지, 상자 윗모서리·공구 경로 위 몇 자리의 두 알림 값입니다.
  0.23.0 `*-pick-through`는 화면 격자 점마다 보통 고르기와 `throughTranslucent` 고르기의 종류·id 짝 수와 같은 자리 수(그물 면만 고르기와 함께도 — 장면 그대로, 상자를 반투명·바닥 판을 불투명으로 둔 뒤),
  상자 윗면 위 세 자리의 측정 미리 보기(`throughTranslucent` 없이·있게), `throughTranslucent`로 단 누르기 알림 값이고, `base-annotation-avoid`는 `base-annotations`의 세 덧그림과
  구석 글의 글상자 자리, 뷰 큐브 자리·가로 띠를 피할 자리로 준 뒤 자리(겹치지 않는지·옮겼는지), 그림 저장 화소가 같은지, 화면 덧그림은 옮겼을 때만 바뀌는지, 끄면 처음 자리인지, `viewCubeRect`입니다.
  0.24.0 `*-pick-opaque`는 상자를 반투명·판을 불투명으로 둔 뒤 `setItemPickOpaque`로 상자를 켰을 때 화면 격자 점마다 `throughTranslucent` 고르기가 보통 고르기와 같은지(그물 면만 고르기와 함께도),
  상자 윗면 위 세 자리의 측정 미리 보기, 누르기 알림, `itemLook`, 끈 뒤 0.23.0 고르기와 같은지이고, `base-measure-pick-through`는 구멍 점(첫 점)에서 끌어온 점을 주고 Z축에 잠근 채
  판 윗면을 뚫는 자리를 가리키며 `setMeasurePickThrough`로 켜고 끈 미리 보기(붙잡은 종류·점·면·잠금), 잠금·끌어온 점·찍은 점이 그대로인지, 앱 호출 수(다시 켜면 기억), 두 점째 거리,
  `setMeasureSnap`을 다시 주면 풀리는지, 붙잡기를 끄면 `false`인지, `base-annotation-overlap`은 기준점이 겹치는 덧그림 넷의 하나씩·함께 단 글상자 자리(서로 겹치지 않는지),
  측정 거리 글상자(덧그림 없이·있게), 가로 띠를 피할 자리로 준 뒤입니다. 장면 `base-annotation-overlap`(화면 덧그림 — 새 장면)과 `base-annotation-overlap-image`(같은 장면의 그림 저장 —
  비키지 않으므로 0.23.0과 화소까지 같아야 한다)도 찍습니다.
  0.25.0 장면 `tex-release`(무늬 자료의 얕은 사본을 `release: true`로 다시 준 그림), `tex-restore`(놓지 않고 `WEBGL_lose_context`로 문맥을 잃었다 되찾은 그림),
  `tex-release-restore`(놓고 잃었다 되찾은 뒤 알림의 `need`대로 원본 자료에서 다시 준 그림)는 놓기를 모르는 판(0.24.0 — `release`를 무시하고 문맥 복구 때 장면 배열을 다시 올린다)과
  화소까지 같아야 하고, `tex-release-restore-flat`(놓고 되찾은 뒤 아무것도 주지 않은 그림 — 평면 음영·그물 색)은 새 장면입니다. 값 묶음 `tex-release-picks`는 놓은 장면의
  화면 격자 고르기·축 범위와 문맥 복구 뒤에도 같은지(0.24.0과 같아야 한다), `tex-release-restore`는 놓은 뒤 장면 객체에 남은 배열·무늬 원본, 되찾음 알림의 `need`,
  다시 주기 전 무늬 상태, 법선만 준 뒤와 다 준 뒤 남은 것, 문맥 복구 전후 고르기가 같은지입니다(새 값).
  0.26.0 장면 `compact-shaded`·`compact-sun-shadows`는 `tex` 자료를 작은 배열(법선 Int8 정점 4값, 무늬 좌표 Int16 + `uvTransform` — `syntheticScene({ compact: true })`)로 준
  그림(`tex-shaded`·`base-sun-shadows`와 같은 자리 — 새 장면), 값 묶음 `compact-vs-float`는 같은 판 안에서 작은 배열 그림과 Float32 그림의 다른 화소 수·채널 차 8 넘는 화소 수·
  가장 큰 채널 차(음영·해 그림자), 화면 격자 고르기가 같은지, 법선·무늬 좌표 바이트입니다(새 값). 그 선택이 없는 판의 `syntheticScene`은 Float32 그대로라 건너뜁니다.
  0.27.0 값 묶음 `*-pick-through-ranges`는 상자를 반투명·판을 불투명으로 두고 상자를 `setItemPickOpaque`로 켠 뒤 윗면 삼각형만 `setItemPickThrough`로 지나가게 했을 때 화면 격자 점마다
  `throughTranslucent` 고르기의 짝(켜기 전 → 뒤 — 상자 윗면 자리는 상자 안쪽 바닥·옆면), 보통 고르기가 그대로인지, 상자 윗면 위 세 자리의 측정 미리 보기, 누르기 알림과 `front`,
  끈 뒤 켜기 전과 같은지입니다. 장면 `cross-measure-track-dir`·`cross-measure-track-dir-perp`는 엇갈린 선분 하나를 지나간 뒤 구멍 점 자리의 끌어온 점에서 그 선분과 나란한 선·수직인 선 위를
  가리킨 그림(추론 색 쇄선·기준 선분 점선), 값 묶음 `cross-measure-track-dir`는 같은 자리의 미리 보기(`trackDirs` 없이도), 첫 점 뒤·끌어온 점 축 위·잠근 동안, 두 점째 값입니다.
  장면 `base-measure-label-spot`·`base-annotation-spot`(화면 덧그림)과 값 묶음 `base-label-spot`은 측정 거리 글상자·덧그림 글상자의 기본 자리(일곱 이름, 띠를 피할 때, 끈 뒤 처음 자리인지,
  그림 저장이 기본 자리를 따르는지)입니다. 모두 0.26.0에 없는 API라 새 장면·값입니다.
  0.28.0 값 묶음 `cross-measure-track-dir-edge`는 엇갈린 선분 0을 지난 뒤 선분 1을 지나고 끌어온 점에서 선분 0과 나란한 자리를 가리킨 미리 보기(거르지 않으면 기준이 선분 1, 선분 1을 거르면 선분 0),
  첫 점 뒤 첫 점의 나란함(거르지 않는다)과 끌어온 점의 나란함, 앱 함수가 받은 선분이고, `base-buffer-stats`는 장면을 다시 준 뒤 성분별 GPU 버퍼 바이트와 장면 배열 합이 같은지,
  와이어프레임·구간 숨김 뒤 코어가 만든 것, 강조 선분의 덧그림 늘어남, 놓기 뒤 그대로인지입니다(덧그림 합은 앞 장면이 남긴 표식에 따라 달라 뺀다). 0.27.0에 없는 API라 새 값입니다.
  0.29.0 장면 `cross-measure-track-dir-meet`·`cross-measure-track-dir-meet-edge`는 구멍 점(첫 점)을 찍고 다른 구멍 점을 끌어온 점으로 준 뒤 엇갈린 선분 0을 지나고, 끌어온 점에서 그와 나란한 선이
  첫 점 X축·상자 오른쪽 윗모서리와 만나는 자리를 가리킨 그림(추론 색 ×), 값 묶음 `cross-measure-track-dir-meet`은 만나는 점을 끈 뒤·켠 뒤 같은 차례로 첫 점 X축과 나란한 선·수직인 선이 만나는 자리,
  상자 윗모서리와 만나는 자리와 그 뒤 기준이 그대로인지, 잠금 단추가 잠근 것, 두 점째, 첫 점 없이 다른 끌어온 점의 축과 만나는 자리입니다. `cross-measure-parallel-edge`는 첫 점 나란함의 기준 거르기
  (거르지 않으면 선분 1, 거르면 선분 0), `base-label-spot-fallback`은 가운데 기본 자리를 덮는 띠에서 `fallback` 없음·`'first'`·`'topRight'`의 글상자 자리, `tex-restore-done`은 `'bitmap'`·`release: true`로
  잃었다 되찾을 때 알림 차례와 그때 `restorePending`·무늬 상태입니다. 모두 0.28.0에 없는 API라 새 장면·값입니다.
- 판마다 두 번 찍어 같은 코드가 같은 그림을 내는지 먼저 봅니다. 두 번이 다르면 그 장면은 "불안정"(`unstable`)으로 따로 알리고 비교에서 뺍니다.
- base에 아직 없는 API를 쓰는 장면은 "새 장면"(`new`)으로 건너뜁니다. 다른 장면·값(또는 head에서 사라진 장면)이 있으면 1,
  도구 오류나 head 장면에서 난 예외는 2로 끝납니다(예외는 라벨로 넘기지 않습니다 — API를 바꿨으면 `scripts/pixels/page.ts`를 같은 PR에서 고칩니다).
- 결과는 `--out`(기본 `.runtime/pixels/<base>-<head>-<시각>/`)에 `summary.json`(`done: true`, 장면마다 같은지와 다른 화소 수)과
  `summary.md`로 남깁니다. 다른 장면은 `diff/`에 base 그림, head 그림, 차이 그림(다른 화소는 빨강)을 PNG로 둡니다.
- base 소스는 작업 트리나 소스 사본을 만들지 않고 git 개체(`git cat-file`)에서 바로 묶습니다. 비교 페이지(`scripts/pixels/page.ts`)와
  장면 목록은 두 판 모두 작업 트리 것을 쓰고 `src/`만 바뀝니다. 장면을 더하려면 이 파일에 넣습니다.
- 선택: `--head <판>`(작업 트리 대신 커밋끼리), `--runs 1`(두 번 찍기 생략), `--only <정규식>`, `--size 폭x높이`, `--keep-shots`(같은 장면 그림·값도 남기기), `--port`,
  `--timeout <초>`(0.23.0 — 장면·값 묶음 하나를 찍는 CDP 한도, 기본 120초, 환경 변수 `PIXELS_TIMEOUT`도 된다. 비교 페이지 준비 한도는 그 1/4과 30초 가운데 긴 것).
  부하가 높은 기계(load average 수십~백 넘게)에서 측정 값 묶음 하나가 120초를 넘기면 `--timeout 900`처럼 늘려 한 번에 끝낸다. CI는 주지 않아 그대로다.

PR마다 CI(`.github/workflows/pixels.yml`)가 같은 러너에서 PR이 들어갈 base 커밋과 병합 결과를 이 명령으로 비교합니다.
저장해 둔 기준 그림은 쓰지 않습니다(러너마다 GPU 흉내가 달라서). 다르면 작업 요약에 표를 붙이고 artifact `pixels`에 차이 PNG를 올린 뒤 실패합니다.
**그림이 바뀌는 것이 의도한 변화면 PR에 `pixels-changed` 라벨을 붙입니다.** 그러면 차이를 알리기만 하고 통과합니다(라벨을 붙이거나 떼면 다시 판정합니다).
라벨을 붙이기 전에 차이 PNG를 보고 바뀐 장면이 PR이 바꾸려던 것뿐인지 확인합니다.

## 남은 일

- 단면 평면은 여섯 개까지(셰이더 균일 배열). 여러 평면은 교집합만(합집합 단면 없음)
- 그림자는 보이는 범위 전체를 감싸는 깊이 그림 한 장(계단식 그림자 아님)이라 아주 넓은 장면에서는 그늘이 거칠다(`shadows.size`로 키운다). 반투명 그물은 그림자를 드리우지 않는다
- 외곽선은 화면 공간 깊이 차이라 화소보다 얇은 틈·면 안쪽 접힘선은 잡지 않는다. 맨 앞 깊이 그림 하나라 와이어프레임에서도 앞 그물에 가린
  뒤 그물의 외곽선은 끊긴다. 그물마다 색은 줄 수 있지만 한 그물 안에서 부분마다(면·재질마다) 다른 색은 없다. 안개는 격자·덧그림에 하지 않는다
- 선 색 대비(`'contrast'`)는 한 색 바탕만 본다(하늘·땅 기울기 바탕, 선 뒤의 다른 면 색은 보지 않는다)
- 걷기 부딪힘은 눈·무릎 높이 광선 둘이라 그 사이 높이의 가는 막대·난간 살은 지나가고, 머리 위 천장은 따지지 않는다. 중력은 바로 내려앉는다(떨어지는 시간 없음).
  마주 보는 그물은 Z축 둘레만(axis 'z')
- 추론 붙잡기는 선분끼리의 3D 교차, 선분 위 수직 발, 첫 점을 지나는 세계 X·Y·Z 축 방향과 지나간 선분과 나란한 방향뿐이다(잠그지 않은 나란함·수직 선과 면의 교차,
  면 위 수직 발, 모서리에 수직인 방향, 면 잠금은 없다 — 축이 아닌 선이 면을 뚫는 점은 그 선으로 잠갔을 때만이다, 0.19.0 `lockFaces`). 나란함의 기준은 마지막으로 지나간 선분 하나다. 잠금은 첫 점을 지나는 선 하나이고
  키보드 화살표로 축을 고르는 잠금(SketchUp의 →·←·↑)은 없다(앱이 `setMeasureInferenceLock('x')` 등으로 단다). 커서 둘레 선분은 화면에서 가까운 24개까지만 짝짓는다.
  `pointsFor`는 같은 고르기에서는 다시 쓰지만 커서가 움직여 고른 점이 바뀌면 부른다.
  모서리 끝에서 그 모서리 방향으로 잠그기(0.12.0)는 코어가 아는 곧은 선분(선분 묶음·그물 윤곽선)만 본다. 곡선을 나눈 꺾은선은 그 조각의 방향이고
  곡선의 접선 방향은 없다(앱이 `setMeasureInferenceLock({ direction })`으로 준다).
  앱이 붙잡을 점을 다듬는 것(0.14.0 `refine`)은 수직 발·코어 가운데 점·붙잡지 않은 선분 위 점·교차점(0.15.0)·축과 선분의 교차(0.18.0, 0.19.0부터 잠근 축도,
  0.20.0부터 축이 아닌 잠근 선과 활꼴만 지나는 열린 교차도)이고, 축·잠근 선이 면을 뚫는 점(0.22.0부터 삼각형을 비켜 가며 곡면만 뚫는 열린 교차도)과
  붙잡지 않은 면 위 점(0.21.0 `'onFace'`)은 0.19.0 `refineFace`다.
  잠근 선으로 옮겨 오는 점, 잠근 선 위 커서에 가까운 점(잠근 동안의 면 위 점도), 단면의 잘린 면 채움 위 점은 꺾은선·삼각형 그대로다.
  `'onFace'`는 바로 앞 입력 하나만 기억하므로 커서가 곡면 위를 움직이는 동안 이동마다 앱 함수를 부른다(앱이 가볍게 풀어야 한다).
  다듬은 점으로 후보를 견주는 것은 열린 후보(0.15.0 — 토막 밖 수직 발, 넓힌 교차점, 0.20.0 선과 토막의 열린 교차, 0.22.0 선과 삼각형의 열린 교차)뿐이고, 다른 후보는 코어 점으로 견준 뒤 한 점만 다듬는다.
  열린 후보는 미리 보기 한 번에 앱 함수를 6번까지만 새로 부르므로, 커서 둘레에 토막·삼각형이 아주 많으면(촘촘한 곡선 여럿) 기억이 찰 때까지 몇 번의 이동 뒤에 붙는다.
  선과 토막의 열린 교차는 한 토막의 활꼴을 두 번 지나는 선이 곡선에 거의 닿듯 활꼴 가운데쯤을 지날 때만 두 교차를 받는다(0.22.0 둘째 힌트 —
  토막 끝 둘레만 스치는 선은 가까운 끝 쪽 하나). 앱이 힌트 둘레 교차 하나를 주는 것을 전제로 하므로, 늘 같은 근을 주는 앱은 하나만 붙는다.
  선과 삼각형의 열린 교차는 커서 둘레 24개 삼각형만 본다. 한 삼각형 위 곡면 조각을 선이 두 번 지나면(아주 얕게 스칠 때) 0.24.0부터 둘째 힌트(그 조각의 두 끝)로 둘 다 묻지만,
  곡면이 선과 나란해지는 자리를 매끈한 이웃(법선 사잇각 45° 안)과의 변 법선으로 어림하므로 그런 이웃이 없거나 찾지 못하면(그 변 가운데가 눈 뒤) 힌트(무게중심 쪽)에 가까운 교차 하나만 받는다.
  그물을 뚫는 이웃 삼각형을 뺄지는 처짐 한도(0.1 × 가장 긴 변)로 어림해, 붙잡기 거리보다 처짐이 큰 확대에서는 뚫는 자리 둘레 삼각형도 앱에 묻는다(받지는 않는다 — 앱 함수를 부르는 횟수만 는다).
  곡면이 오목하게 보이는 자리의 열린 교차(0.23.0)는 앱 점 자리 광선이 처음 맞은 면이 그 삼각형이나 꼭짓점을 함께 쓰는 이웃일 때만 보인다고 본다 — 아주 잘게 나눈 곡면을 비스듬히 볼 때
  두 칸 넘게 떨어진 같은 곡면 조각에 가리면 받지 않는다. 열린 교차의 후보 거르기(0.23.0 `reachPx`)는 받는 범위의 필요조건이라 부르는 차례는 그대로 코어 점 거리 차례다.
  곡선과 면의 교차, 곡선 위 접점(첫 점에서 곡선에 그은 접선이 닿는 점)은 없다.
  끝점의 선분 식별자(0.16.0)는 고르기가 고른 토막 하나다(꺾은선 꼭짓점을 함께 쓰는 다른 토막은 싣지 않는다).
  끌어온 축(0.16.0)은 기억한 점을 지나는 세계 X·Y·Z 축, 첫 점 축 위 나란한 자리, 그 축끼리와 커서 둘레 선분·윤곽선과 3D로 만나는 점(0.17.0), 커서 아래 면을 뚫는 점(0.18.0)이다
  (3D로 만나지 않는 두 축은 붙잡지 않는다). 끌어온 점에서 지나간 모서리와 나란함·수직(0.27.0 `trackDirs`)은 그 선 위 점과, 켜면(0.29.0 `meets`) 그 선이 첫 점 축·첫 점의 나란함·
  다른 끌어온 축·커서 둘레 모서리·면과 만나는 점이다. 안내 선끼리(두 끌어온 점의 나란함·수직 선)의 교차와 안내 선이 꺾은선 활꼴만 지나는 열린 교차는 없다. 그 선 자체는 잠그지 못하며
  (첫 점을 지나지 않는다 — 만나는 점이 첫 점 축·나란함 위면 그 선으로 잠근다), 잠근 동안에는 보지 않는다.
  기준 선분은 마지막으로 지나간(앱이 거르면 0.28.0 `edge`가 받은) 모서리 하나이고 뷰어는 세계 축만 쓴다. 0.10.0 나란함(첫 점에서)의 기준은 0.29.0 `parallelEdge`로 따로 거른다.
  SketchUp 도움말 "Introducing Drawing Basics and Concepts"는 점에서 시작하는 선 추론으로 축 색 From Point와 Through Point만 들고 나란함·수직은 모서리·면에 대한 맞춤으로 들어
  기본으로 켜지 않는다(선택).
  축이 면을 뚫는 점(0.18.0)은 커서가 그물 면 위일 때만 본다(0.22.0 면의 열린 교차는 커서 둘레 삼각형을 본다 — `refineFace`가 있을 때만). 잠근 동안에는 `lockEdges`·`lockFaces`를 켜야 잠근 선이 모서리와 만나는 점·면을 뚫는 점에 붙고(0.19.0),
  잠근 선이 끌어온 축과 만나는 점(0.21.0 `lockTracks`)은 3D로 만날 때만이고, 축이 아닌 잠근 선 위에는 끌어온 점과 나란한 자리가 없다
  (끌어온 점 위를 가리키면 0.10.0처럼 그 점을 잠근 선에 내린 자리다).
  다듬기 기억만 비우기(0.21.0 `clearMeasureRefine`)는 `refine`·`refineFace` 기억만이다(`pointsFor` 기억은 바로 앞 고르기 하나라 그대로 둔다).
  그물 면만 고르기(0.20.0 `meshesOnly`)는 `pick`과 누르기 알림 `onPick`(0.22.0)에만 있다(측정 점 고르기는 늘 선분·점이 먼저다).
  반투명 그물 너머 고르기(0.23.0 `throughTranslucent`)는 면만 지난다(반투명 그물의 윤곽선·그 위 선분은 그대로 고른다). 그물마다 고르기에서 불투명으로 볼 수 있고(0.24.0 `setItemPickOpaque`)
  그물의 일부 삼각형(예: 포켓 뚜껑)만 지나가게 할 수 있지만(0.27.0 `setItemPickThrough` — 불투명 그물도 그 구간을 주면 지난다), 윤곽선 구간을 지나가게 하는 선택은 없다.
  지나는 삼각형은 앱이 번호로 준다(코어가 뚜껑·벽을 가리지 않는다).
  누르기 알림의 가장 앞 고르기 함께 받기(0.26.0 `front`)는 `onPick`에만 있다(측정 점 고르기에는 없다). 투명도 판정은 그물 색·겉모습 알파이고
  X-ray 모드의 비침이나 무늬 그림의 투명 화소(`alpha`)는 보지 않는다. 면의 열린 교차가 보는 커서 둘레 삼각형은 반투명 그물도 본다.
  곡면을 나눈 삼각형을 따라 다시 구하는 것은 3번까지라, 아주 잘게 나눈 곡면을 비스듬히 볼 때는 뚫는 자리가 커서에서 몇 삼각형 떨어져 있으면 붙지 않는다.
  머무르기는 마우스·펜 미리 보기에서만 재고, 터치는 앱이 `setMeasureTrackPoints`로 준다. 뷰어는 세계 축만 쓴다(그리기 축을 바꾸는 `axes`는 순수 함수에만)
- 코어 측정 거리 글상자와 앱 측정 덧그림(`setAnnotations`, 0.23.0) 글상자는 앱이 알려 준 자리(`setMeasureLabelAvoid`)만 비켜 그린다. 앱 화면 요소를 스스로 찾지 않고(뷰 큐브도
  `viewCubeRect`로 읽어 앱이 넘긴다), 자리는 정해진 차례(기준점 네 귀·선분 위·피할 자리 위아래) 가운데서만 고른다(덜 겹치는 자리를 따로 찾지 않아 모두 막히면 기본 자리).
  덧그림 글상자끼리·측정 거리 글상자와는 놓는 차례(덧그림 차례 → 측정 거리 글상자, 0.24.0)대로 뒤 글상자만 비킨다(앞 글상자를 옮겨 자리를 내주지 않고, 덧그림의 선·점 표식은
  그 덧그림 것만 될 수 있으면 비킨다). 앱이 캔버스 위에 그린 글(툴팁·결과 글)은 넘겨준 사각형으로만 안다. 덧그림 글상자는 커서 둘레를 보지 않는다. 그림 저장은 비켜 그리지 않는다.
  앱이 정한 기본 자리는 순수 `placeMeasureLabel`·`placeLabelAmong`(0.26.0 `first`)과 뷰어 글상자(0.27.0 `setMeasureLabelSpot` — 이름 자리만, 측정 거리 글상자 하나·덧그림 글상자 모두에 하나씩)다.
  덧그림마다 다른 기본 자리는 없다. 기본 자리가 막히면 0.25.0 차례로 고르는 선택은 순수 함수(0.28.0 `fallback`)와 뷰어 글상자(0.29.0 `setMeasureLabelSpot`의 `fallback` —
  측정 거리 글상자·덧그림 글상자에 하나로, 글상자마다 다른 `fallback`은 없다)에 있다
- 음영 뒤 모서리 점선은 반투명 그물 뒤 모서리에는 그리지 않는다
- 그림 저장 배율은 한 변 GPU 한도·약 4천만 화소까지(넘으면 줄인다)
- 잘린 면 채우기는 스텐실 홀짝이라 `closed` 그물이 정말 닫혀 있어야 한다(틈·겹친 입체가 있으면 줄무늬·구멍). 반투명 그물·X-ray·와이어프레임에서는 채우지 않는다
- 원점(`origin`) 없이 큰 좌표를 그대로 넣은 장면은 예전처럼 떨린다(해석기가 원점을 채워야 한다)
- 나눠 올리기에서 큰 묶음은 다 채운 뒤에야 보인다(채운 앞부분부터 그리지 않는다). 그물 범위(CPU)는 묶음 하나를 한 번에 센다. 나눠 올리지 않는 `setScene`은 예전처럼 한 번에 올린다
- 하나씩 바꾸기는 그물만이다(선분·점 묶음은 장면을 다시 준다). 바꾼 그물의 고르기 BVH는 통째로 다시 만들고(상자만 고치기 없음), 범위는 위치 배열을 통째로 한 번 훑는다.
  `setMesh`의 나눠 올리기는 다 채울 때까지 GPU에 그 그물이 두 벌이고, 정점 구간은 위치·법선·색·무늬 좌표만(색인·윤곽선은 통째로)
- 구간 숨김은 그물 윤곽선(`edges`)을 삼각형과 짝지어 주지 않는다 — 윤곽선도 숨기려면 `{ prims, edges }`로 윤곽선 번호를 함께 준다
- 무늬는 그물마다 앞·뒷면 하나씩(여러 겹 무늬, 법선·거칠기 같은 PBR 그림 없음). 색 공간은 정점 색과 같이 sRGB 값 그대로 조명한다
- 투명 화소를 쓰는 무늬(`alpha`)는 그물 단위로 앞뒤를 정렬해 그린다(그물 안 삼각형끼리는 정렬하지 않는다)
- 놓기(0.25.0 `release`)는 법선·무늬 좌표·무늬 원본만이다. 위치·색인·정점 색은 고르기·측정·범위가 쓰므로 놓지 않고, 놓아도 GPU 버퍼(그림)는 그대로 남는다.
  놓은 그물은 문맥을 잃었다 되찾을 때 앱이 다시 줄 때까지 평면 음영·그물 색이다(코어가 법선을 스스로 다시 만들지 않는다). 놓은 장면 객체를 `setScene`에 다시 주면 지운 배열은 다시 올리지 못해
  `restoreNeed`에 남는다(알림 없음). 놓은 그물의 `setMesh` `vertices` 구간은 놓은 속성에는 올리지 않는다(알림만 — 통째로 다시 준다).
  `textures: 'bitmap'`은 `data`가 `bitmap`과 같은 그림이라고 믿고 되찾을 때 `data`를 다시 푼다(코어는 둘이 같은지 모른다).
  되찾은 뒤 끝 알림(0.29.0 `onContextRestoreDone`)은 앱이 주지 않은 것이 남으면 오지 않는다(`restoreNeed`로 본다). 되찾는 동안은 무늬 한 장마다 다시 그리지 않아(0.29.0)
  무늬가 하나씩이 아니라 푸는 것이 다 끝날 때 함께 나타나고, 되찾는 순간 위치·색으로 그리는 한 번은 남는다(소프트웨어 GPU의 아주 큰 모형에서는 그 한 번이 다음 무늬 올리기를 붙잡는다 —
  삼각형 288만 개에서 1.3초쯤). 처음 올릴 때(`setScene`)는 그대로 무늬마다 다시 그린다(큰 모형을 소프트웨어 GPU로 처음 열 때도 같은 까닭으로 느릴 수 있다 — 재지 않았다).
  동시에 푸는 무늬 수는 4장 그대로다(8장이면 무늬 64장 512²에서 풀기가 80 → 58 ms지만 큰 무늬에서 한꺼번에 쥐는 푼 그림이 두 배).
  GPU 버퍼 바이트(0.28.0 `stats.buffers`)는 정점·색인 버퍼만이다(무늬는 `textures.bytes` 어림, 틀 버퍼·그림자 깊이 그림은 세지 않는다). 브라우저가 실제로 잡은 GPU 메모리(정렬·사본)는 알 수 없다
- 작은 배열(0.26.0)은 법선(Int8·Int16)과 무늬 좌표(Int16·Uint16)만이다. 위치·정점 색·윤곽선은 `Float32Array`만 받는다(위치는 고르기·측정·범위가 그대로 읽는다).
  `Float16Array`(반 정밀도) 무늬 좌표는 받지 않는다 — 장면 계약 타입에 넣으면 그 타입이 없는 앱 TypeScript 설정에서 타입 검사가 깨진다.
  설계(0.27.0에 적음): WebGL2는 정점 속성 `HALF_FLOAT`를 확장 없이 읽으므로 받으면 배열 바이트를 그대로 올리면 된다. 판정은 `typeof Float16Array !== 'undefined' && a instanceof Float16Array`
  (없는 브라우저에서는 앱이 만들 수 없어 대체 경로는 앱 쪽 — `packUvs`의 Int16으로 줄인다), 타입은 장면 계약에 `Float16Array`를 넣지 않고 구조 타입(2바이트 `ArrayBufferView` + 꼴 표시)으로 둔다.
  다만 반 정밀도 가수는 10비트라 0~10 되풀이 무늬 좌표의 끝(8~10)에서 간격이 0.0078(512화소 무늬의 4화소)로, 같은 2바이트인 Int16 + `uvTransform`(0.00015)보다 거칠다 —
  앱이 이미 반 정밀도 배열을 가진 경우가 아니면 얻을 것이 없어 넣지 않았다. 무늬 좌표 축척·이동은 그물마다 앞·뒷면 하나씩이라
  한 그물 안에서 범위가 아주 다른 면들은 Int16 정밀도가 그 그물 전체 범위로 나뉜다(그런 그물은 나누거나 Float32로 둔다). 정점 4값 정수 법선은 길이가 정점 수 × 4와 꼭 같을 때만 4값으로 읽는다

## 내력

[2dcad-viewer](https://github.com/GyuTae-Kim/opencad-dwgdxf)의 `src/viewer3d/`에서 분리했습니다(커밋 `d7c584a` 기준, 처음 들어온 것은 PR #7).
2D 뷰어 안에서 3D 문서를 열던 탭·리본·패널 화면(`src/app/view3d/`)은 그 커밋의 2dcad-viewer에 남아 있습니다.

## 라이선스

MIT
