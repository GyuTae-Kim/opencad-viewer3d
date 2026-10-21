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
- 음영·음영+윤곽·와이어프레임·X-ray, 굵은 선·점선, 바닥 격자, 좌표축, 밝은·어두운 테마(CSS 변수 `--v3d-*`로 바꿀 수 있음)
- BVH 고르기(그물·선분·점), 두 점 측정, 묶음별 켜고 끄기, 선분 그리기 범위(재생용), 그림 저장
- 단면 보기: 자르는 평면 하나(축 또는 임의 방향), 잘린 면 채우기(닫힌 그물)·단면 테두리, 고르기·측정도 잘린 쪽을 무시
- 무늬(텍스처): 그물마다 무늬 좌표(UV, 원근 무늬는 q까지)와 그림 하나. 되풀이(REPEAT)·밉맵·비등방 거르기, 한 장 크기·전체 GPU 예산 한도
- 큰 좌표(예: 1e6 mm대): 묶음 원점(`origin`)을 double 행렬로 합쳐 그려 떨리지 않음
- 실제 GPU에서 선분 300만 개·삼각형 100만 개를 끌어도 끊기지 않습니다.

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

- `handleKey(e)`: 캔버스에 초점이 없을 때 창 키를 넘기면 F·1~7·Esc를 뷰어 규칙대로 처리하고 처리했으면 `true`. 표준 뷰 키 표는 `VIEW_KEYS`
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

모두 켜야 동작한다. 켜지 않으면 그림·고르기·입력은 0.6.0과 화소·값까지 같다.

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
  묶음 원점·`Mesh3d.matrix`를 반영하고 숨긴 구간은 뺀다. 서로 걸치면 0. 고르기용 BVH를 그대로 써서(없으면 만든다) 두 나무를 함께 내려가며 가지친다
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
  예전처럼 `toBlob('image/png')`로 부르면 화면 캔버스를 그대로 쓴다. 화소만 필요하면 `renderImage(opts)` → `ImageData`
- `zoomToRect(x0, y0, x1, y1, animate?)`: 화면 사각형(캔버스 CSS 화소)이 화면을 채우게 확대한다(가운데 아래 점 깊이 기준). 순수 함수 `rectZoomCamera`

### 그리기 모드 더하기·외곽선

- `setRenderMode('hiddenLine')`: 면을 바탕색(조명 없이)으로 채워 뒤의 선을 가리고 윤곽선만 보인다(윤곽선이 없는 그물은 삼각형 변). 윤곽선 색은 선 색(테마 글자 쪽)
- `setRenderMode('monochrome')`: 정점 색·무늬 없이 한 색(테마 `monochrome`·CSS `--v3d-mono`, 기본 밝은 회색) 음영 + 윤곽선
- `setRenderMode('noTexture')`: 무늬만 끈 음영 + 윤곽선(정점 색·`color`는 그대로)
- `setRenderOptions({ hiddenEdges })`: 숨은 선 모드에서 면 뒤 윤곽선을 흐린 점선으로(true = 0.35 또는 불투명도)
- `setRenderOptions({ profiles: true | { width, color } })`: 화면 공간 외곽선(실루엣). 불투명 그물만 따로 깊이 그림에 그려 깊이가 끊기는 곳을 칠한다(음영 계열 모드).
  개발 페이지(swiftshader, 1200×700)에서 프레임 1.5 → 2.1 ms. `renderOptions`로 읽는다
- 고르기·가림·잘린 면 채우기는 새 모드를 음영 모드처럼 다룬다

### 바탕(한 색·하늘과 땅)

- `setBackground({ color?, sky?, skyHorizon?, ground?, groundHorizon? } | null)`·`background`: `color`는 테마 바탕 대신 한 색(앱이 파일 스타일을 따를 때 — 숨은 선 모드 면 색도 이 색).
  `sky`·`ground`를 주면 지평선 위·아래 기울기 바탕(화소마다 눈에서 본 방향의 높이로, 지평선은 카메라 앙각을 따라 움직인다 — 평행 투영도 같은 시야각으로).
  `skyHorizon`·`groundHorizon`은 지평선 근처 색. 투명 바탕 그림 저장에는 그리지 않는다

### 해 조명·그림자·안개(기본 꺼짐)

- `setLighting({ sun: { direction, intensity?, color? }, ambient?, shadows? } | null)`·`lighting`: 고정 보조광 대신 세계 방향 해 하나(해 쪽 방향)와 주변광으로 음영한다.
  `shadows: true | { size, bias }`면 해 쪽 평행 투영 깊이 그림(기본 2048², 장면 보이는 범위에 맞춤)을 3×3 PCF로 읽어 그늘을 곱한다.
  깊이 그림은 장면·보이기·숨긴 구간·단면·겉모습·조명이 바뀔 때만 다시 그린다(카메라만 움직이면 그대로)
- `setFog({ color?, start, end } | null)`·`fog`: 눈 깊이(세계 단위) start~end 선형 안개(기본 색은 바탕색). 그물·선·점에 적용하고 덧그림·격자에는 하지 않는다
- 개발 페이지(swiftshader, 1200×700, 작은 장면) 프레임: 기본 1.6 ms, 해 1.6, 그림자(깊이 그림 재사용) 1.8, 매 프레임 다시 그리면 2.0, 안개 1.6, 하늘 바탕 +0.1

### 1인칭 걷기·시야각

- `setNavigation('walk' | 'orbit', { eyeHeight?, speed?, tapToStand? })`·`navigation`: 걷기에서는 끌기(한 손가락) = 눈은 제자리에서 둘러보기, 휠·W/S·↑/↓ = 앞뒤,
  A/D = 옆, ←/→ = 돌기, Q/E·PageDown/PageUp = 아래·위, Shift = 세 배 빠르게, 두 번 누르기 = 그 자리 눈높이에 서기, 두 손가락 = 벌려 앞으로·끌어 옆/위아래.
  눈높이 기본은 장면 단위로 1.6 m(단위를 모르면 범위 반지름의 0.1), 빠르기 기본은 초당 보이는 범위 반지름의 0.4. 걷기로 바꿀 때 눈은 제자리
- `setWalkInput({ forward, right, up, turn, look })`(−1~1, 가상 조이스틱 — 0이 아닌 동안 프레임마다 움직임), `walkBy(forward, right, up)`, `lookBy(dYaw, dPitch)`
- `handleKeyUp(e)`: 캔버스 밖 키를 넘기는 앱은 keyup도 넘긴다(걷기 키 멈춤)
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

## 다른 저장소에서 가져다 쓰기

npm에 올리지 않고 GitHub 의존으로 씁니다. TypeScript 원본 그대로 내보내므로 Vite 같은 번들러와 `moduleResolution: "bundler"`가 필요합니다.

```json
"dependencies": {
  "opencad-viewer3d": "github:GyuTae-Kim/opencad-viewer3d#v0.6.0"
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
| `src/renderer.ts`, `src/shaders.ts` | WebGL2 그리기(묶음 원점 RTC, 단면 자르기·잘린 면 채우기, 무늬 올리기·무늬 셰이더 변종) |
| `src/texture.ts` | 무늬 도구(그림 머리 읽기, 크기 한도·예산 나누기, 뒤집어 풀기) |
| `src/camera.ts`, `src/viewcube.ts` | 카메라·표준 뷰·뷰 큐브 |
| `src/bvh.ts`, `src/pick.ts`, `src/scenepick.ts`, `src/bounds.ts`, `src/segments.ts` | 고르기 가속 구조·고르기(묶음·장면)·범위, 원본 번호로 강조 선분 모으기 |
| `src/ranges.ts` | 묶음 안 구간 순수 계산(합치기·숨김/강조 나누기·판정·색인 모으기) |
| `src/section.ts` | 단면 순수 계산(평면·범위 안 위치·교선·광선/선분 자르기·화면 끌기) |
| `src/grid.ts`, `src/marker.ts`, `src/theme.ts`, `src/math.ts`, `src/playback.ts` | 격자·표식·색·행렬·재생 도우미 |
| `src/synth.ts`, `src/dev.ts`, `dev/viewer3d.html` | 합성 장면(무늬 상자·원근 무늬 판 포함)과 개발 확인 페이지 |

## 개발

```bash
npm install
npm run dev        # dev/viewer3d.html (주소 인자 ?segs=선분 수&sseg=구 칸 수&theme=light)
                   #   &offset=1e6(큰 좌표, 묶음 원점) &bake=1(원점 없이 구워 넣기 — 떨림 비교) &section=z:0.5(:flip)
                   #   &incremental=1(나눠 올리기) &tex=1(무늬 상자·원근 무늬 판). 단추: 단면 X·Y·Z, 구간 숨김·구간 강조
npm run typecheck
npm test
```

## 남은 일

- 단면은 평면 하나만(상자 단면·여러 평면 없음)
- 잘린 면 채우기는 스텐실 홀짝이라 `closed` 그물이 정말 닫혀 있어야 한다(틈·겹친 입체가 있으면 줄무늬·구멍). 반투명 그물·X-ray·와이어프레임에서는 채우지 않는다
- 원점(`origin`) 없이 큰 좌표를 그대로 넣은 장면은 예전처럼 떨린다(해석기가 원점을 채워야 한다)
- 나눠 올리기는 묶음 단위라 아주 큰 배열 하나(예: 선분 수백만 개 한 묶음)는 한 프레임에 걸린다(버퍼를 쪼개 올리지 않는다)
- 구간 숨김은 그물 윤곽선(`edges`)을 삼각형과 짝지어 주지 않는다 — 윤곽선도 숨기려면 `{ prims, edges }`로 윤곽선 번호를 함께 준다
- 무늬는 그물마다 하나(앞·뒷면 다른 무늬, 여러 겹 무늬, 법선·거칠기 같은 PBR 그림 없음). 색 공간은 정점 색과 같이 sRGB 값 그대로 조명한다
- 투명 화소를 쓰는 무늬(`alpha`)는 그물 단위로 앞뒤를 정렬해 그린다(그물 안 삼각형끼리는 정렬하지 않는다)

## 내력

[2dcad-viewer](https://github.com/GyuTae-Kim/opencad-dwgdxf)의 `src/viewer3d/`에서 분리했습니다(커밋 `d7c584a` 기준, 처음 들어온 것은 PR #7).
2D 뷰어 안에서 3D 문서를 열던 탭·리본·패널 화면(`src/app/view3d/`)은 그 커밋의 2dcad-viewer에 남아 있습니다.

## 라이선스

MIT
