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
- BVH 고르기(그물·윤곽선·선분·점), 두 점 측정(꼭짓점·끝점, 켜면 가운데 점·앱이 준 원 중심, 두 선분 교차점·수직 발·축 방향·지나간 모서리와 나란한 방향까지 붙잡기와 Shift·앱 단추로 방향 잠그기 — 앱 점 수십만 개도 색인으로, 재생에 맞춰 차례 한도로 거르기), 앱 측정 덧그림(거리·각·반지름·점)·화면 위치(`project`), 두 묶음 최근접점, 묶음별 켜고 끄기·불투명도·색·행렬(분해도), 선분 그리기 범위(재생용), 그림 저장(배율·투명 바탕), 창 확대
- 단면 보기: 평면 하나 또는 여럿(상자 단면, 평면마다 자를 묶음), 잘린 면 채우기(닫힌 그물·capGroup)·단면 테두리, 고르기·측정도 잘린 쪽을 무시
- 마주 보는 그물(billboard), 뒷면 색·무늬
- 무늬(텍스처): 그물마다 무늬 좌표(UV, 원근 무늬는 q까지)와 그림 하나. 되풀이(REPEAT)·밉맵·비등방 거르기, 한 장 크기·전체 GPU 예산 한도
- 큰 좌표(예: 1e6 mm대): 묶음 원점(`origin`)을 double 행렬로 합쳐 그려 떨리지 않음
- 실제 GPU에서 선분 300만 개·삼각형 100만 개를 끌어도 끊기지 않습니다. 나눠 올리기를 쓰면 아주 큰 배열 하나도 여러 프레임에 조각으로 올립니다.

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
- `onPick((pick, e) => …)`: 두 번째 인자 `e`는 누를 때의 `altKey`·`ctrlKey`·`shiftKey`·`metaKey`, `clicks`(1 또는 2 — 바로 앞 누르기와 0.45초·6화소(터치는 24화소) 안이면 2), `button`, `pointerType`. 한 인자 콜백도 그대로 된다
- `onMeasure`(두 번째 점에서 결과, 지우거나 새 측정을 시작하면 `null`), `measurePointCount`
- `gridVisible`, `viewCubeVisible`, `axesVisible`: 격자·뷰 큐브·좌표축 켜짐 상태
- `viewCubeSize` 옵션·`setViewCubeSize(px)`: 뷰 큐브 크기(기본 112, 64~160) — 좁은 화면에서 줄여 쓴다
- `setDrawLimitBySegmentId`, `setMarker`: NC 재생
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
`pointsFor`로 미리 보고 같은 자리를 누른 `base·off-measure-points-for`. 새 화면 7가지·값 7묶음은 0.9.1에 없는 API라 건너뜀).
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
- 화소·값 비교: 나란함·Shift 잠금(보통·큰 좌표)·앱 단추로 잠근 수직(보통·큰 좌표) 화면, 잠금·나란함·추론 다섯 가지 값

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

## 다른 저장소에서 가져다 쓰기

npm에 올리지 않고 GitHub 의존으로 씁니다. TypeScript 원본 그대로 내보내므로 Vite 같은 번들러와 `moduleResolution: "bundler"`가 필요합니다.

```json
"dependencies": {
  "opencad-viewer3d": "github:GyuTae-Kim/opencad-viewer3d#v0.10.0"
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
| `src/renderer.ts`, `src/shaders.ts`, `src/upload.ts` | WebGL2 그리기(묶음 원점 RTC, 단면 자르기·잘린 면 채우기, 무늬, 셰이더 변종 — 여러 단면·숨은 선·해·그림자·안개·뒷면, 외곽선(그물마다 색)·하늘 바탕·그림자 깊이 그림), 큰 배열 조각 올리기 |
| `src/annotate.ts` | 앱 측정 덧그림 모양·글(거리·각·반지름·점) |
| `src/closest.ts` | 두 묶음 최근접점(BVH 둘을 함께 내려가며, 점·선분·삼각형 쌍) |
| `src/billboard.ts` | 마주 보는 그물 돌림·범위 |
| `src/texture.ts` | 무늬 도구(그림 머리 읽기, 크기 한도·예산 나누기, 뒤집어 풀기) |
| `src/camera.ts`, `src/viewcube.ts` | 카메라·표준 뷰·뷰 큐브 |
| `src/bvh.ts`, `src/pick.ts`, `src/scenepick.ts`, `src/bounds.ts`, `src/segments.ts` | 고르기 가속 구조·고르기(묶음·장면)·범위, 원본 번호로 강조 선분 모으기 |
| `src/snap.ts`, `src/inference.ts`, `src/snapindex.ts` | 측정 점 붙잡기 고르기(고르기가 붙잡은 점·앱 점·추론 점 가운데)와 측정 결과, 추론 붙잡기(교차점·수직 발·축·나란함)와 방향 잠금, 앱 점 색인(차례 한도) |
| `src/walk.ts` | 걷기 중력·부딪힘(세계 광선 맞음, 한 걸음) |
| `src/ranges.ts` | 묶음 안 구간 순수 계산(합치기·숨김/강조 나누기·판정·색인 모으기) |
| `src/section.ts` | 단면 순수 계산(평면·범위 안 위치·교선·광선/선분 자르기·화면 끌기) |
| `src/grid.ts`, `src/marker.ts`, `src/theme.ts`, `src/math.ts`, `src/playback.ts` | 격자·표식·색(캔버스 초점 테두리 포함)·행렬·재생 도우미 |
| `src/synth.ts`, `src/dev.ts`, `dev/viewer3d.html` | 합성 장면(무늬 상자·원근 무늬 판 포함)과 개발 확인 페이지 |
| `scripts/pixels/` | 화소·값 회귀 비교(`npm run pixels`): 비교 페이지·장면 목록, git 판 소스 묶기, 헤드리스 Chrome, PNG·차이 |

## 개발

```bash
npm install
npm run dev        # dev/viewer3d.html (주소 인자 ?segs=선분 수&sseg=구 칸 수&theme=light)
                   #   &offset=1e6(큰 좌표, 묶음 원점) &bake=1(원점 없이 구워 넣기 — 떨림 비교) &section=z:0.5(:flip)
                   #   &incremental=1(나눠 올리기) &tex=1(무늬 상자·원근 무늬 판). 단추: 단면 X·Y·Z, 구간 숨김·구간 강조,
                   #   0.7.0 모드(숨은 선·단색·무늬 없음)·외곽선·숨은 점선·하늘·해·그림자·안개·걷기·윤곽선 고르기,
                   #   0.8.0 붙잡기+(가운데 점·중심)·음영 뒤 모서리·대비 선 색·중력·부딪힘,
                   #   0.9.0 추론 붙잡기(교차점·수직 발·축)·그물 선 색,
                   #   0.10.0 나란함·잠금(Shift)·잠금 단추(setMeasureInferenceLock)
npm run typecheck
npm test
npm run pixels -- --base origin/main   # 화소·값 회귀 비교(아래)
```

### 화소·값 회귀 비교

`npm run pixels -- --base <git 판>`은 같은 기계에서 base 판과 지금 작업 트리(커밋 안 한 변경 포함)를 헤드리스 Chrome으로 똑같이 찍어 비교합니다.
Chrome이 있어야 하고(못 찾으면 `CHROME_PATH`로 알려 줍니다), WebGL은 SwiftShader(CPU)로 그려 같은 기계에서는 같은 화소가 나옵니다.

- 합성 장면 83가지를 960×600으로 찍어 RGBA 해시를 비교합니다. 그리기 모드 일곱 가지와 밝은 테마, 숨은 점선, 외곽선, 단면, 평행 투영,
  구간 숨김과 강조, 측정 미리 보기는 보통 좌표와 큰 좌표에서 한 벌씩 찍습니다. 0.8.0의 붙잡기 표식, 음영 뒤 모서리, 대비 선 색과
  걷기(중력 포함), 하늘 바탕, 그림자, 안개, 무늬, 두 단면, 재생, 묶음 겉모습, 측정 덧그림, 뷰 큐브, 0.9.0의 추론 붙잡기 표식(교차점·수직 발·축),
  그물마다 윤곽선·외곽선 색, 나눠 올린 큰 장면, 0.10.0의 붙잡기 한도 미리 보기와 추론 잠금(Shift·앱 단추)·나란함 표식도 찍습니다.
- 값도 비교합니다. 고르기 7,200번, 측정 누르기 2만 4천여 번(앱 점 수천 개 붙잡기·추론 붙잡기, 0.9.1의 축 붙잡기 축, 0.10.0의 차례 한도·추론 잠금·나란함·
  같은 자리 미리 보기 뒤 누르기의 `pointsFor` 포함)의 결과와 화면 위치, 걷기 경로입니다.
- 판마다 두 번 찍어 같은 코드가 같은 그림을 내는지 먼저 봅니다. 두 번이 다르면 그 장면은 "불안정"(`unstable`)으로 따로 알리고 비교에서 뺍니다.
- base에 아직 없는 API를 쓰는 장면은 "새 장면"(`new`)으로 건너뜁니다. 다른 장면·값(또는 head에서 사라진 장면)이 있으면 1,
  도구 오류나 head 장면에서 난 예외는 2로 끝납니다(예외는 라벨로 넘기지 않습니다 — API를 바꿨으면 `scripts/pixels/page.ts`를 같은 PR에서 고칩니다).
- 결과는 `--out`(기본 `.runtime/pixels/<base>-<head>-<시각>/`)에 `summary.json`(`done: true`, 장면마다 같은지와 다른 화소 수)과
  `summary.md`로 남깁니다. 다른 장면은 `diff/`에 base 그림, head 그림, 차이 그림(다른 화소는 빨강)을 PNG로 둡니다.
- base 소스는 작업 트리나 소스 사본을 만들지 않고 git 개체(`git cat-file`)에서 바로 묶습니다. 비교 페이지(`scripts/pixels/page.ts`)와
  장면 목록은 두 판 모두 작업 트리 것을 쓰고 `src/`만 바뀝니다. 장면을 더하려면 이 파일에 넣습니다.
- 선택: `--head <판>`(작업 트리 대신 커밋끼리), `--runs 1`(두 번 찍기 생략), `--only <정규식>`, `--size 폭x높이`, `--keep-shots`(같은 장면 그림·값도 남기기), `--port`.

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
- 추론 붙잡기는 선분끼리의 3D 교차, 선분 위 수직 발, 첫 점을 지나는 세계 X·Y·Z 축 방향과 지나간 선분과 나란한 방향뿐이다(선과 면의 교차, 면 위 수직 발,
  모서리에 수직인 방향, 다른 점에서 끌어온 축 안내, 면 잠금은 없다). 나란함의 기준은 마지막으로 지나간 선분 하나다. 잠금은 첫 점을 지나는 선 하나이고
  키보드 화살표로 축을 고르는 잠금(SketchUp의 →·←·↑)은 없다(앱이 `setMeasureInferenceLock('x')` 등으로 단다). 커서 둘레 선분은 화면에서 가까운 24개까지만 짝짓는다.
  `pointsFor`는 같은 고르기에서는 다시 쓰지만 커서가 움직여 고른 점이 바뀌면 부른다
- 음영 뒤 모서리 점선은 반투명 그물 뒤 모서리에는 그리지 않는다
- 그림 저장 배율은 한 변 GPU 한도·약 4천만 화소까지(넘으면 줄인다)
- 잘린 면 채우기는 스텐실 홀짝이라 `closed` 그물이 정말 닫혀 있어야 한다(틈·겹친 입체가 있으면 줄무늬·구멍). 반투명 그물·X-ray·와이어프레임에서는 채우지 않는다
- 원점(`origin`) 없이 큰 좌표를 그대로 넣은 장면은 예전처럼 떨린다(해석기가 원점을 채워야 한다)
- 나눠 올리기에서 큰 묶음은 다 채운 뒤에야 보인다(채운 앞부분부터 그리지 않는다). 그물 범위(CPU)는 묶음 하나를 한 번에 센다. 나눠 올리지 않는 `setScene`은 예전처럼 한 번에 올린다
- 구간 숨김은 그물 윤곽선(`edges`)을 삼각형과 짝지어 주지 않는다 — 윤곽선도 숨기려면 `{ prims, edges }`로 윤곽선 번호를 함께 준다
- 무늬는 그물마다 앞·뒷면 하나씩(여러 겹 무늬, 법선·거칠기 같은 PBR 그림 없음). 색 공간은 정점 색과 같이 sRGB 값 그대로 조명한다
- 투명 화소를 쓰는 무늬(`alpha`)는 그물 단위로 앞뒤를 정렬해 그린다(그물 안 삼각형끼리는 정렬하지 않는다)

## 내력

[2dcad-viewer](https://github.com/GyuTae-Kim/opencad-dwgdxf)의 `src/viewer3d/`에서 분리했습니다(커밋 `d7c584a` 기준, 처음 들어온 것은 PR #7).
2D 뷰어 안에서 3D 문서를 열던 탭·리본·패널 화면(`src/app/view3d/`)은 그 커밋의 2dcad-viewer에 남아 있습니다.

## 라이선스

MIT
