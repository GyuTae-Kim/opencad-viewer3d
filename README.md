# OpenCAD 3D 뷰어 코어

브라우저에서 WebGL2로 3D 장면을 그리고, 돌려 보고, 고르고, 재는 뷰어입니다.
형식 해석기가 만든 장면(`Scene3d`: 삼각형 그물·선분·점)을 받아 그리며, 다른 3D 엔진이나 그래픽 라이브러리를 쓰지 않고 새로 작성했습니다.

OpenCAD의 3D 형식 저장소들이 이 뷰어를 함께 씁니다.

- [opencad-nc](https://github.com/GyuTae-Kim/opencad-nc): NC 프로그램(G-code·Heidenhain·woodWOP MPR) → 공구 경로 장면
- [opencad-step](https://github.com/GyuTae-Kim/opencad-step): STEP(AP203·AP214·AP242) → B-rep 삼각화 장면
- [opencad-skp](https://github.com/GyuTae-Kim/opencad-skp): SketchUp 2021~2026(.skp) → 모형 장면

## 할 수 있는 것

- 왼쪽 끌기 궤도 회전(커서 아래 점 둘레), 가운데·오른쪽 끌기 이동, 휠 확대, 터치 회전·이동·핀치(손가락 떨림을 견디는 터치 문턱).
  앱이 누르기마다(누른 순간·끌기를 시작하는 순간) 그 포인터를 맡아 제 끌기(부품 옮기기 등)를 할 수 있다(맡지 않은 누르기는 그대로)
- 뷰 큐브와 표준 뷰(위·앞·오른쪽·등각 등, 키 1~7), 전체 보기(F), 원근·평행. 손가락으로 큐브를 누르면 큐브를 크게 펴서 다시 눌러 고른다(0.44.0 — 누르는 자리 24 CSS px 이상).
  카메라를 날리는 움직임은 연 뒤에도 끄고 켤 수 있고, 켜면 사용자의 움직임 줄이기 선호를 연 뒤에도 따른다(0.48.0 `animate: 'auto'`·`setAnimate`, 저장된 보기로 날아가기 `flyTo`).
  0.49.0부터 움직임이 끝났는지(끝 자리에 닿았는지) Promise로 알리고, `flyTo`는 움직임 길이를 고른다
- 음영·음영+윤곽·와이어프레임·X-ray·숨은 선·단색·무늬 없음, 화면 공간 외곽선, 굵은 선·점선, 바닥 격자, 좌표축, 밝은·어두운 테마(CSS 변수 `--v3d-*`로 바꿀 수 있음 —
  0.48.0부터 두 테마 모두 좌표축·고른 것 강조색이 바탕과 3:1 이상, 0.49.0부터 밝은 테마 강조색이 측정색·공구 표시색과 적록 색맹에서도 갈림), 키보드 초점 테두리
- 뒤 모서리 점선(숨은 선, 켜면 음영 계열도), 바탕과 대비되는 외곽선·윤곽선 색(켤 때만), 그물마다 다른 윤곽선·외곽선 색
- 해 조명·그림자(PCF)·선형 안개·하늘과 땅 바탕·주변 가림(0.49.0 화면 공간 SSAO)(모두 켤 때만), 1인칭 걷기·둘러보기(켜면 바닥 따라가기·부딪힘), 시야각·굴림·렌즈 이동(2점 투시)
- BVH 고르기(그물·윤곽선·선분·점), 두 점 측정(꼭짓점·끝점, 켜면 가운데 점·앱이 준 원 중심·측정 첫 점에 따라 앱이 주는 접점(접점 표식) — 앱 점마다 같은 화면 거리면 뒤·다른 붙잡기가 없을 때만 같은 우선도 —, 두 선분 교차점·수직 발·축 방향·지나간 모서리와 나란한 방향까지 붙잡기와 Shift·앱 단추로 방향 잠그기(모서리 끝에서 그 모서리를 따라 가리킨 점, 앱이 정한 방향도), 코어가 고른 수직 발·모서리 위 점·가운데 점·교차점을 앱이 정확한 곡선 위로 다듬기, 꺾은선으로는 후보가 없는 곡선 위 발·두 곡선의 교차점도 앱이 다듬어 붙잡기, 붙잡은 점이 놓인 선분 식별자, 켜면 머문 점에서 끌어온 X·Y·Z 축과 그 축끼리·모서리와 만나는 점, 끌어온 점에서 지나간 모서리와 나란한 선·수직인 선(곡선을 나눈 현은 앱이 기준에서 거른다 — 첫 점의 나란함도)과 켜면 그 선이 첫 점 축·다른 끌어온 축·모서리·면과 만나는 점·두 끌어온 점의 그 선끼리 만나는 점·곡선 모서리의 활꼴만 지나는 자리(앱이 곡선 위로)·곡면을 나눈 삼각형을 비켜 가며 곡면만 뚫는 자리(앱이 곡면 위로), 첫 점 축이 모서리와 만나는 점, 축이 면을 뚫는 점, 축과 곡선 모서리가 만나는 점을 앱이 곡선 위로 다듬기(선이 현을 얕게 가로질러 현과 만나는 자리와 곡선 교차가 화면에서 떨어져도), 잠근 동안 잠근 선이 모서리와 만나는 점·면을 뚫는 점·끌어온 축과 만나는 점, 축이 곡면을 뚫는 점과 붙잡지 않은 곡면 위 점을 앱이 곡면 위로 다듬기, 축·잠근 선이 꺾은선과 만나지 않고 그 활꼴만 지나도(두 번 지나면 두 교차 모두, 활꼴이 붙잡기 거리보다 두껍게 보이도록 확대해도, 현이 커서에서 멀어질 만큼 확대해도) 앱이 준 곡선 위 교차에 붙기,
선이 현을 가로지르는 자리가 곡선 교차에서 화면으로 멀어도 커서 둘레의 곡선 교차에 붙기, 켜면 선이 꺾은선 꼭짓점을 반 화소 안으로 지나는 자리도 끝점보다 먼저 앱이 준 곡선 위 교차에 붙기, 축·잠근 선이 곡면을 나눈 삼각형을 비켜 가며 곡면만 뚫어도(한 삼각형 위를 두 번 지나면 두 교차 모두 — 칸을 대각선으로 나눈 한 삼각형 위여도, 아주 가까이 확대해 꼭짓점이 눈 뒤인 칸도, 구멍 안 벽처럼 처짐이 붙잡기 거리보다 크게 보일 만큼 가까이 본 커서 아래 칸도, 칸을 얕게 뚫어 그물을 뚫는 자리와 곡면 교차가 화면에서 떨어져도, 긴 칸을 따라가도) 앱이 준 곡면 위 교차에 붙기, 켜면 커서가 그물·현을 뚫는 자리 쪽이라 곡면·곡선 교차가 커서에서 조금 멀어도 같은 교차의 정확한 자리로 표식·찍은 점 옮기기, 잠금·끌어온 점을 둔 채 다듬기 기억·앱 점 기억만 비우기 — 앱 점 수십만 개도 색인으로, 재생에 맞춰 차례 한도로 거르기), 그물 면만 고르기(면 위 선분·점 아래의 면 — 고르기와 누르기 알림), 반투명 그물 너머 불투명 면 고르기(고르기·누르기 알림·측정 — 그물마다 고르기에서 불투명으로 볼 수 있고, 그물의 일부 면(포켓 뚜껑 등)만 지나가게 할 수 있고, 측정 중 잠금을 둔 채 켜고 끌 수 있고, 누르기 알림 하나에서 가장 앞 고르기와 함께 받을 수 있다), 앱 측정 덧그림(거리·각·반지름·점 — 글상자는 앱이 알려 준 띠·뷰 큐브 자리와 서로를 비켜 그린다, 뷰어 글상자와 글상자 자리 순수 계산 모두 앱이 정한 기본 자리부터, 그 자리가 막히면 예전 차례로 고르기도, 켜면 측정 거리 글상자가 측정 점 표식도 비킨다 — 그림 저장에서도)·측정 글 꼴(앱이 이름표만 옮겨도 수·자릿수·단위 글은 코어 기본 꼴 그대로)·화면 위치(`project`)·뷰 큐브 자리, 두 묶음 최근접점(화면을 멈추지 않게 시간 조각으로 나눠 돌리기, 두 점이 놓인 삼각형·선분 번호도, 0.45.0부터 묶음 안 면(삼각형 구간)끼리도), 묶음의 임의 방향 범위(꼭짓점 지지 — 행렬·원점 반영), 묶음별 켜고 끄기·불투명도·색·행렬(분해도 — 여러 묶음 행렬·겉모습을 한 번에), 선분 그리기 범위(재생용), 그림 저장(배율·투명 바탕), 창 확대
- 키보드로 3D 붙잡기·고르기(0.46.0 — 앱이 켤 때만): 3D 보기에 초점이 있을 때 화살표로 가상 커서를 옮기고, Tab으로 그 자리의 붙잡기 후보를 차례로 돌려(AutoCAD 객체 스냅 Tab 돌리기)
  Enter로 측정 점을 찍거나 고른다. 마우스와 같은 붙잡기 규칙이고, 화면 읽기 프로그램에 읽힐 글(종류·좌표·차례)을 앱에 넘긴다. 같은 후보 목록을 앱 UI용으로도 준다(`measureCandidates`).
  0.47.0부터 고르기 모드에서도 Tab으로 커서 자리에 겹친 점·선분·면(앞 면 뒤의 것까지)을 돌려 고르고(`pickCandidates` — AutoCAD 선택 돌리기), 알림 글을 앱 언어 틀로 바꾼다(`messages`)
- 단면 보기: 평면 하나 또는 여럿(상자 단면, 평면마다 자를 묶음 — 0.44.0부터 묶음 안 삼각형·선분 구간만도), 잘린 면 채우기(닫힌 그물·capGroup)·단면 테두리, 고르기·측정도 잘린 쪽을 무시
  (0.45.0부터 앱 붙잡기 점·`project`도 그 점의 기본 도형 번호로 구간 단면을 따른다)
- 마주 보는 그물(billboard), 뒷면 색·무늬
- 무늬(텍스처): 그물마다 무늬 좌표(UV, 원근 무늬는 q까지)와 그림 하나. 되풀이(REPEAT)·밉맵·비등방 거르기, 한 장 크기·전체 GPU 예산 한도.
  무늬가 많은 장면을 처음 올리거나 되찾을 때 한 장마다 다시 그리지 않고 모아 그린다(그리기가 비싼 큰 모형에서 다 보이기까지 몇 배 빠르다)
- PBR 그림(0.43.0): 그물마다 법선 그림(접선 없이 화면 미분으로 접선 틀)·거칠기·금속성 그림과 값(glTF 2.0 금속·거칠기 규격, SketchUp처럼 거칠기·금속 그림을 따로 주거나
  매끈함 그림·DirectX 꼴 법선 그림도). 지금 조명 식에 거칠기(반사광 퍼짐)·금속성만 넣는다 — 주지 않은 그물은 예전 그림 그대로
- 큰 좌표(예: 1e6 mm대): 묶음 원점(`origin`)을 double 행렬로 합쳐 그려 떨리지 않음
- 깨진 장면 입력(0.50.0): 해석기가 깨진 파일에서 만든 NaN·무한대·1e15 넘는 좌표, 정점 수 밖 색인(0xffffffff 포함), 길이가 맞지 않는 배열, 유한하지 않은 색·원점·행렬·굵기·범위가 와도
  예외·빈 화면 없이 깨진 부분만 빼거나 고쳐 그리고 무엇을 했는지 알림(`sceneIssues`·`onSceneIssues`)으로 알린다(멀쩡한 장면은 그대로)
- 실제 GPU에서 선분 300만 개·삼각형 100만 개를 끌어도 끊기지 않습니다. 나눠 올리기를 쓰면 아주 큰 배열 하나도 여러 프레임에 조각으로 올립니다.
- 같은 그물을 여러 자리에 놓은 장면(같은 배열을 함께 쓰는 자리 — 조립의 같은 부품)은 자리마다가 아니라 같은 그물끼리 그리기 한 번에 그립니다(인스턴싱 — 정의 12개 × 자리 3,000에서
  그리기 호출 6,004 → 28, 자리 색·강조·분해 행렬·숨기기는 자리마다 그대로, 0.43.0부터 단면 하나·그림자를 켜도 면은 모은다)
- 화면 밖 잘라내기(0.51.0 기본 켬): 확대해 화면 밖에 있는 그물은 그리지 않습니다(그림은 끔과 바이트까지 같다 — 부품 자리 8만을 8배 확대하면 프레임이 몇 배 빠르다).
  그물마다 그리는 윤곽선의 GL 호출도 줄였다(같은 상태 윤곽선은 행렬만)
- 그물이 아주 많은 장면 묶어 그리기(0.52.0 — 묶을 수 있는 작은 정적 그물이 2,000개 이상이면 저절로): 서로 다른 부품이 많은 조립의 그물을 묶음 버퍼에 잇고 그물마다 버퍼를 놓아
  GL 객체 수를 묶음 수만큼으로(서로 다른 그물 8만 — 버퍼·VAO 50만 개 → 370개, 버퍼 바이트는 자료의 1.26배), 면·윤곽선·숨은 점선은 묶음마다 그리기 한 번에(1만 그리기 호출 20,004 → 14).
  고르기·강조·숨기기·색·행렬·구간·단면·그물 바꾸기는 그대로(SwiftShader 그림은 0.51.0과 같고 기계 GPU는 몇 화소가 다를 수 있다 — 끄려면 `merging: false`)
- 장면 전체를 다시 주지 않고 그물 하나만 넣기·바꾸기·빼기(`setMesh`·`removeMesh` — 그 그물의 GPU 버퍼·BVH만 다시, 바뀐 정점 구간만 올리기도)
- 큰 모형 메모리: 놓기 선택을 주면 올린 뒤 법선·무늬 좌표·무늬 원본을 코어가 놓고, 그래픽 문맥을 되찾으면 위치·색으로 먼저 그린 뒤 앱에서 다시 받기. 문맥 잃음·되찾음 알림과 되찾은 뒤 다시 올리기가 다 끝났다는 알림.
  앱이 손질하는 무늬는 장면을 먼저 올리고 나중에 받기(그동안 그물 색).
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

0.43.0에서 더한 선택 필드(PBR 그림 — 아래 0.43.0 절). 그림은 모두 `Scene3d.textures`의 id이고 무늬 좌표는 `uvs`·`uvTransform`을 함께 쓴다:

- `Mesh3d.normalTexture`(접선 공간 법선 그림 — R·G·B → X·Y·Z, 초록이 v가 느는 쪽)·`normalScale`(X·Y 배율, 기본 1)·`normalFlipY`(초록이 아래인 DirectX 꼴이면 `true`)
- `Mesh3d.roughness`·`metallic`(0~1): 그림이 있으면 그 값에 곱하는 배율(기본 1), 없으면 그 값(거칠기는 없으면 0.42.0 반사광 그대로, 금속성은 0)
- `Mesh3d.metallicRoughnessTexture`(glTF — 초록 = 거칠기, 파랑 = 금속성)·`roughnessTexture`·`metallicTexture`(따로 준 그림 — 초록·파랑 채널이라 회색조 그림이면 그대로)·
  `roughnessInvert`(거칠기 그림이 매끈함 그림이면 `true`)

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
- `viewCubeSize` 옵션·`setViewCubeSize(px)`: 뷰 큐브 크기(기본 112, 64~160) — 좁은 화면에서 줄여 쓴다.
  `viewCubeTouch` 옵션·`setViewCubeTouch`: 손가락으로 누르면 펴서 고르기(0.44.0 — 기본 켬, 아래 0.44.0 절)
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
  `onScreen`은 눈 앞이고 캔버스 안, `visible`은 거기에 더해 단면에 잘리지 않고(`occlusion`을 주면) 불투명 면에 가리지 않음. 가림은 음영 모드에서만 따진다.
  0.45.0 `{ id, raw?, edges? }`(`ProjectOptions`): 그 점이 놓인 묶음(과 기본 도형 번호)을 주면 잘림을 앱 붙잡기 점과 같은 규칙으로 본다 —
  그 묶음을 자르는 평면(`items`로 범위를 정한 평면도), `raw`가 있으면 그 도형이 든 구간 단면의 평면도. 주지 않으면 모든 묶음을 자르는 평면만(0.44.0 그대로)
- `Viewer3dOptions.formatMeasure`·`setMeasureFormat(fn | null)`: 측정 글 꼴. `fn({ a, b, distance, dx, dy, dz, units })` → 글 줄들.
  내장 측정과 글(`label`)을 주지 않은 거리 덧그림이 쓴다(앱의 단위·자릿수·언어). 없으면 예전 글 그대로
- `setAnnotations([{ kind, a, b?, c?, label?, color?, normal? }, …] | null, { hidden?, width? })`: 앱이 잰 값을 내장 측정과 같은 모양(선·점·글자 상자)으로 그린다
  - `distance`: a–b, `angle`: 꼭짓점 a와 팔 끝 b·c(호를 그린다), `radius`: 중심 a–원 위 b(`normal`을 주면 원 전체), `point`: a
  - `label`이 없으면 값으로 쓴다(거리·`R 반지름`은 장면 단위, 각은 도, 점은 좌표). `'\n'`으로 여러 줄, 빈 문자열이면 글자 상자 없음
  - 선은 깊이를 따져 가려진 부분을 `hidden`(기본 0.35) 불투명도로, 점도 가려지면 흐리게 그린다. 가려진 글자 상자는 0.47.0부터 바탕·글을 불투명하게 두고 테두리를 점선으로 그린다
    (글 대비 4.5:1 — 0.46.0까지는 흐리게). 단면으로 자르지 않고 `toBlob`에 담긴다
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
- 0.45.0 `{ rangeA?, rangeB? }`(`IndexRange` 하나나 목록): 그 묶음 안 구간(면 표의 면 하나 같은 삼각형 구간)끼리만 잰다. 구간만의 BVH를 만들어 기억한다(이어진 구간 하나는 배열을 복사하지 않는다).
  결과 번호(`indices` — `rawA`·`indexA` 등)는 묶음 번호 그대로다(아래 0.45.0 절)
- 순수 함수 `closestBetween(shapeA, shapeB)`(`opencad-viewer3d/closest` — 점·선분·삼각형 쌍 최근접점 도우미도 있다), 0.45.0 구간 모양 `closestPart(kind, positions, indices, ranges)`

### 여러 단면 평면

- `setSections([{ normal, offset, items?, caps?, outline?, plane?, id? }, …] | null, opts?)`: 평면 여러 개(최대 `MAX_SECTION_PLANES` = 6 — 상자 단면)의 남는 쪽(교집합)만 남긴다.
  `items`를 주면 그 평면은 그 묶음 id만 자른다(나머지는 그대로). 평면마다 `caps`·`outline`·`plane`을 따로 준다.
  0.44.0부터 묶음 id 대신 묶음 안 구간 `{ id, start, count, edges? }`도 준다 — 그 구간만 자른다(아래 0.44.0 절)
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
    `id`를 주면 그 묶음이 숨었으면 빼고, 그 묶음의 단면 평면으로 자르고, 묶음 행렬(`setItemMatrix` — 분해도)을 따라 옮긴다.
    0.45.0 `raw`(+ `edges`): 그 점이 놓인 기본 도형 번호 — 그 도형이 든 구간 단면의 평면으로도 자르고 숨긴 구간이면 뺀다(아래 0.45.0 절)
  - `pointsFor(pick)`: 커서 아래 고른 것(그물·윤곽선·선분·점)마다 앱이 더하는 점. 마우스 이동마다 부르므로 가볍게. `id`가 없으면 고른 묶음으로 자르고 가린다
    (0.45.0: `raw`가 없으면 고른 것의 번호도 받는다 — 구간 단면)
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
  (0.30.0 `meets: { guides: true }`로 켠다)
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
- 0.30.0에 처음 올릴 때도 모아 그리게 바꿨다(아래 0.30.0 — 되찾을 때는 이 차례 그대로)

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

## 0.30.0: 처음 올릴 때 무늬 다시 그리기 모으기·두 끌어온 점의 안내 선끼리 만나는 점·묶음의 임의 방향 범위

새 선택(`inference.trackDirs`의 `meets: { guides: true }`)과 새 순수 함수(`trackDirPairSnap`, `itemExtent`·`itemsExtent`)를 쓰지 않으면 그림·고르기·측정은 0.29.0과 화소·값까지 같다
(`npm run pixels -- --base v0.29.0 --timeout 900`: 0.29.0의 장면 123개·값 80묶음 모두 같음. 새 장면 1개·값 1묶음은 0.29.0에 없는 선택이라 건너뛰고 head에서 두 번 찍어 같은 것을 확인했다.
250초, load average 4~11).
바뀐 기본 동작은 하나다 — 처음 올릴 때(`setScene`·`setMesh`로 새 무늬) 무늬를 잇달아 풀어 올리는 동안 한 장마다 다시 그리지 않고 모아 그린다(아래 — 다 올린 그림은 같다, `tex-*` 장면이 0.29.0과 같다).
입력 타입은 넓어지기만 했다(`MeasureTrackDirOptions.meets`가 `boolean | MeasureTrackDirMeets | null`). 출력 타입은 선택 필드만 늘었다(`NormalizedTrackDirs.meetGuides`,
`MeasureHoverSnap.trackGuide`·`MeasurePoint.trackGuide`·측정 붙잡기 `MeasurePointSnap.trackGuide`). 렌더러 내부 알림 `onTexture`가 그 올리기에 걸린 시간(ms)을 넘긴다.

SketchUp 30차 보고의 남은 일은 "처음 올릴 때(`setScene`)도 무늬마다 다시 그린다 — 되찾기와 같은 까닭으로 느릴 수 있지만 재지 않았다"(코어 몫),
NC 선택 요청은 두 끌어온 점의 안내 선(나란함·수직)끼리 만나는 점과 만나는 점이 원호를 나눈 꼭짓점과 거의 겹칠 때 끝점보다 다듬은 교차를 먼저 고르기,
STEP 선택 요청은 묶음의 임의 방향 범위(분해 화면 방향·같은 자리 떼기 — 지금은 축 나란 상자를 방향 v에 비춰 넉넉하게 어림한다)였다. 원호 꼭짓점 차례는 지금 차례와 설계만 적었다(아래).

### 처음 올릴 때 무늬 다시 그리기 모으기(바뀐 기본 동작)

- 먼저 잰 것(헤드리스 Chrome 156 SwiftShader, 무늬 64장 512²·PNG 30.8 MB를 그림 바이트만 주어(코어가 푼다) 새 뷰어에 `setScene` — 무늬가 모두 올라간 뒤 그린 화면을 `gl.finish`까지, 세 번씩, load average 4~12):
  - 무늬만(판 64개): 415~485 ms, 그사이 다시 그린 화면 10~11번. 다시 그리기를 막으면 231~320 ms
  - 삼각형 288만 개 그물을 더하면 12.1~13.2초(다시 그린 화면 12~13번, `texImage2D` 부르기 합 9.9~10.3초 — 0.29.0 되찾기와 같은 까닭: 그린 화면을 GPU가 끝낼 때까지 다음 무늬 올리기가 기다린다).
    다시 그리기를 막으면 1.8~2.2초
  - 푼 그림(`bitmap`)을 함께 준 장면은 첫 화면 전에 다 올라가 90~110 ms·1번(바꿀 것이 없다)
- 규칙(정한 것): 다른 무늬를 아직 푸는 중에 무늬를 하나 올리면(풀지 못한 것도 같다)
  - 이번 올리기의 첫 무늬는 곧 그린다(앞서 그린 화면을 GPU가 아직 끝내지 않았으면 끝낼 때까지 — 아래 울타리)
  - 그 뒤로는 앞서 무늬로 다시 그린 때부터 `TEXTURE_REDRAW_MS`(250)와 "그 뒤 그린 화면의 그리기 시간·무늬 올리기 시간·울타리를 기다린 시간 가운데 가장 긴 것 × `TEXTURE_REDRAW_SLOW`(4)"
    가운데 긴 시간이 지나야 다시 그린다. 미룬 무늬는 그 때가 되면 다음 무늬를 기다리지 않고 함께 그린다(타이머). 다시 그린 화면을 GPU가 끝내기를 기다리는 몫이 올리는 시간의 1/5쯤을 넘지 않는다
  - 푸는 무늬가 다 끝나면 곧 그린다
  - 울타리: 무늬를 푸는 동안 그린 화면 뒤에 `fenceSync`를 두고, 미룬 다시 그리기는 그 화면을 GPU가 끝냈을 때(`getSyncParameter` — 50 ms마다 본다) 그린다. 소프트웨어 GPU는 그 화면을 그리는 동안
    그림 풀기도 늦어 다음 무늬 올리기(그 기다림을 재는 때)보다 미룬 때가 먼저 왔다. `fenceSync`가 없거나 5초 넘게 끝났다고 오지 않으면 끝난 것으로 본다(울타리를 둔 뒤 `flush`)
  - 새 장면·문맥 잃음·장면 비우기·없애기에서 미룬 것을 버린다. 문맥을 되찾는 동안은 0.29.0 차례 그대로(다 끝났을 때 한 번), 카메라 조작 등 다른 다시 그리기는 그대로다
- 바꾼 뒤 같은 재기(여섯 번씩, load average 5~12): 무늬만 330~449 ms(다시 그린 화면 2~3번 — 다시 그리기를 막으면 237~352 ms), 큰 그물과 함께 3.09~3.64초(3번 — 처음 화면,
  첫 무늬 16장쯤의 화면, 끝 화면 — 막으면 1.78~2.04초), 푼 그림을 함께 준 장면은 그대로. 무늬만인 장면은 풀기가 대부분이라 시간은 조금만 줄고 그린 화면 수가 준다.
  다 올린 그림의 화소 해시는 전·후 같다. 기계 GPU에서는 그리기·올리기가 싸서 간격이 250 ms다(무늬가 초당 네 번쯤 나뉘어 나타난다)
- 시험: 첫 무늬·250 ms 간격·미룬 무늬를 그 때 함께·마지막은 곧, 올리기·그리기 시간이 길면 그 4배, 울타리를 기다리면 그 시간도, 끝났다고 오지 않는 울타리는 5초 뒤, 새 장면·풀지 못한 무늬,
  문맥 잃음·되찾기·없애기(가짜 시계 — `tests/v0300texload.test.ts`)

### 두 끌어온 점의 안내 선끼리 만나는 점(`inference.trackDirs: { meets: { guides: true } }`)

- `MeasureTrackDirOptions.meets?: boolean | MeasureTrackDirMeets | null`: 객체 꼴은 `true`와 같이 0.29.0 만나는 점을 켜고, `MeasureTrackDirMeets.guides?: boolean`(기본 꺼짐 — `true`일 때만)이면
  두 끌어온 점의 나란함·수직 선끼리 3D로 만나는 점에도 붙는다. 두 선은 같은 기준 선분(0.27.0 — 앱이 거르면 0.28.0 `edge`가 받은 것)에 대한 안내다 — 한 점의 나란한 선과 다른 점의 수직인 선이 만나는
  기운 사각형의 구석. `{}`·`{ guides: false }`는 `meets: true`와 같다. 편 꼴은 `NormalizedTrackDirs`에 `meets: true`와 `meetGuides: true`
- 규칙(정한 것 — 0.17.0 끌어온 축끼리의 교차와 같다, 순수 `trackDirPairSnap`): 기억한 두 점 P·Q(P가 앞 — 더 최근)마다 P의 안내 선과 Q의 안내 선 사이 가장 가까운 두 점이 그 깊이에서 화면 반 화소 안일 때만
  (만나지 않는 두 선 — 높이가 다른 점의 선 — 은 받지 않는다, 나란한 두 선은 보지 않는다). 교차가 P·Q·첫 점 자리면 빼고, 첫 점과 같은 점은 쌍에 넣지 않으며(첫 점의 나란함은 0.29.0 만나는 점의 직선),
  커서가 P나 Q의 화면 자리 붙잡기 거리 안이면 그 쌍은 보지 않는다. 같으면 앞 점 쌍 → P의 안내 차례 → Q의 안내 차례. 세계 축과 나란한 성분은 그 선의 값 그대로다
- 차례: 점 후보로 0.29.0 만나는 점 뒤다(1화소 넘게 가까워야 이긴다). 잠근 동안에는 보지 않는다
- 값: `snap`(P의 안내 종류)·`trackFrom`(P)·`edge`(기준 선분)에 `trackGuide`(Q의 선 — `{ from, kind, dir }`, 복사본)가 실린다. `measurePoints`에도 같다. `direction`이 없다 —
  첫 점을 지나는 선이 아니라 Shift·잠금 단추가 잠그지 않는다. 정확한 직선끼리라 앱 `refine`에 넘기지 않는다. 만나는 점에 붙은 동안 기준 선분은 바뀌지 않는다(0.29.0과 같다)
- 그리기: P에서와 같이 Q에서도 추론 색 쇄선과 큰 십자, 붙잡을 점에 추론 색 ×
- 비용(가짜 WebGL, 미리 보기 한 번 `measureAt`, 끌어온 점 셋·첫 점·나란함·커서 둘레 선분 24개, 두 안내 선을 따라 400자리, load average 4~5): `{ meets: true }` 평균 0.048~0.083 ms →
  `{ meets: { guides: true } }` 0.050~0.059 ms(p95 0.10~0.17 → 0.10~0.12 ms)
- 켜지 않으면 0.29.0과 같다(시험이 `{ meets: true }`·`{ meets: {} }`·`{ meets: { guides: false } }`의 화면 격자·네 안내 선을 따라 첫 점 전·뒤 미리 보기를 견주고, 켜면 바뀐 자리는 모두 두 구석인지 본다 —
  `tests/v0300guides.test.ts`)

```ts
// NC: 원호 현을 거른 끌어온 점 나란함·수직에 만나는 점과 두 끌어온 점의 안내 선끼리 만나는 점까지
viewer.setMeasureSnap({ ...ncSnapOptions(t), inference: { ...MEASURE_INFERENCE, trackDirs: { edge: (s) => !isArcChord(s), meets: { guides: true } } } });

// 툴팁(0.29.0 README 예에 이어서): 다른 끌어온 점의 안내 선과 만나면
const g = h?.trackGuide;
const meet2 = g ? ` · 끌어온 점에서 ${g.kind === 'parallel' ? '나란한' : '수직인'} 선 위` : '';
```

### 묶음의 임의 방향 범위(`itemExtent`·`itemsExtent` — `opencad-viewer3d/bounds`)

- `itemExtent(it, v): [number, number] | null`: 그물·선분·점 묶음의 세계 꼭짓점 p마다 p·v의 [최소, 최대](꼭짓점 지지 값 — 볼록 껍질의 지지 함수). 세계 = `matrix · (origin + position)`
  (행렬은 그물만 — `itemBounds`와 같은 규칙). 축 나란 상자를 v에 비춘 구간과 달리 꼭짓점 그대로라, 45° 돌린 정육면체를 면 방향으로 비추면 반폭이 2가 아니라 1이다
- `itemsExtent(items, v)`: 여럿의 가장 작은 최소·가장 큰 최대(정점이 있는 것이 없으면 `null`)
- 셈(정한 것): 행렬이 없거나 아핀이면(마지막 행 0·0·0·1) v를 로컬 방향(행렬 3×3의 전치 × v)으로 옮겨 정점마다 곱셈 셋, 원점·이동은 한 번 더한다(큰 좌표도 셈 오차가 늘지 않는다).
  원근 행렬은 정점마다 옮긴다. 같은 배열에 같은 로컬 방향을 잇달아 물으면 다시 훑지 않는다(배열마다 하나 기억 — 배열을 제자리에서 고치면 `forgetBounds`가 함께 버린다 — `positionsBox`와 같은 규칙).
  v는 단위 벡터로 준다(길이를 맞추지 않는다 — 길이 L이면 값이 L배). 수가 아닌 정점은 건너뛰고, 정점이 없거나 v·원점·행렬 값이 수가 아니면 `null`
- 비용(Node, load average 4~5): 정점 100만 개 새 방향 4.4~5.7 ms(`positionsBox` 처음 훑기 6.8 ms), 300만 개 13.5~14.3 ms(17.0 ms), 같은 방향 다시 0.01 ms 안, 원근 행렬 20~24 ms·58~62 ms
- 기존 함수(`itemBounds`·`meshBounds`·`sceneBounds` 등)는 그대로다. 시험: 정점마다 옮긴 값과 같은지(돌린 상자·큰 원점·거울·축척·무작위 아핀·원근), 축 나란 상자 비추기보다 좁은지, 수가 아닌 정점·빈 묶음,
  기억과 `forgetBounds`, 여럿 합치기(`tests/v0300extent.test.ts`)

```ts
// STEP: 분해 단위의 방향 v 범위(가운데·반폭) — 축 나란 상자 비추기 대신
import { itemsExtent } from 'opencad-viewer3d/bounds';
const e = itemsExtent(unit.ids.map((id) => itemOf(id)), v);
const [c, h] = e ? [(e[0] + e[1]) / 2, (e[1] - e[0]) / 2] : [0, 0];
```

### 만나는 점이 원호를 나눈 꼭짓점과 거의 겹칠 때(NC 선택 요청 — 지금 차례와 설계, 바꾸지 않았다)

- 지금 차례: 측정 점 고르기는 점 붙잡기(끝점·꼭짓점·가운데 점·앱 점)가 먼저다. 커서가 꺾은선 꼭짓점(원호를 나눈 두 현이 만나는 점)에서 붙잡기 거리 안이면 끝점이 고르기 결과이고,
  축·끌어온 축·안내 선과 모서리가 만나는 점(0.17.0·0.18.0·0.29.0)·열린 교차(0.20.0)는 점 붙잡기가 없을 때만 보므로 앱 `refine`을 부르지도 않는다. 꼭짓점에서 붙잡기 거리 밖이면
  선과 현의 교차를 보지만, 선이 꼭짓점을 반 화소 안으로 지나면 "선분 끝점은 끝점 붙잡기가 맡는다"는 규칙(0.17.0)으로 그 현과의 교차를 빼서 그 선 위 커서 자리가 된다.
  그래서 NC 31차 README의 "끝점이 먼저이거나(크게 당기면 만나는 점) 안내 선 위 커서 자리"가 된다
- 설계(선택 — 기본은 지금 차례): `MeasureSnapOptions.refineEnds?: boolean`(가칭). 켜고 `refine`이 있으면
  1. 점 붙잡기가 꺾은선 꼭짓점(끝점 — 두 토막이 함께 쓰는 점)이고 지금 켠 선 후보(첫 점 축·끌어온 축·안내 선·잠근 선)가 그 꼭짓점을 화면 붙잡기 거리 안으로 지나면,
     그 꼭짓점을 함께 쓰는 두 토막마다 `'axisEdge'`·`open: true`(point = 꼭짓점을 그 선에 내린 발 — 0.20.0 열린 교차 입력과 같은 꼴)로 묻는다. 호출 한도·기억은 열린 교차와 함께 쓴다
  2. 앱 점은 0.23.0 열린 교차의 받는 규칙(그 선 위로 내린 자리가 토막 범위·커서에서 붙잡기 거리 안·가리지 않음)으로 받고, 받으면 끝점보다 먼저다(다듬은 교차 — 앱이 곡선 위 점을 준 것이 근거).
     곧은 꺾은선(앱이 `null`)은 지금처럼 끝점이다
  3. 선분 교차에서 꼭짓점 자리를 빼는 규칙도 그 선택일 때는 빼지 않고 위와 같이 묻는다(선이 꼭짓점을 반 화소 안으로 지날 때)
- 미룬 까닭: 점 붙잡기가 먼저인 차례(0.8.0부터)를 바꾸는 일이라 축·끌어온 축·잠근 선·안내 선 다섯 곳의 차례와 값(끝점 대신 'axis'·안내 종류 + `segment`·`refined`)이 함께 바뀌고,
  꼭짓점 둘레마다 앱 함수를 더 부른다. NC의 같은 셈 시험(`measure-apex-core`)으로 확대 단마다 붙는 것을 먼저 견준 뒤 넣는다

### 앱이 할 일

- NC: 코어를 `#v0.30.0`으로 올린다. 두 끌어온 점의 안내 선끼리 만나는 점은 `trackDirs: { edge, meets: { guides: true } }`로 켠다. 툴팁·상태 줄은 끌어온 점 안내(`trackFrom`이 있고 잠그지 않은
  `'parallel'`·`'perpendicular'`)에 `trackGuide`가 있으면 "끌어온 점에서 나란한·수직인 선 위"를 덧붙인다(새 글은 앱 사전에). 원호 꼭짓점과 겹치는 자리는 바뀌지 않았다(위 설계)
- SKP: 코어를 `#v0.30.0`으로 올린다. 할 일은 없다 — 그림 바이트로 준 무늬(손질하지 않은 무늬)가 많은 큰 모형을 처음 열 때 코어가 무늬마다 다시 그리지 않는다(손질해 푼 그림을 준 무늬는 원래 빨랐다).
  처음 열기 재기에서 "무늬까지 다 보이기"가 줄었는지 보면 된다
- STEP: 코어를 `#v0.30.0`으로 올린다. 분해 계획의 방향 범위(`along(box, v)`)를 `itemsExtent(그 단위의 묶음들, v)`로 바꾸면 기운 방향(화면 가로·세로)에서 겹친 자리 판정·떼는 거리가 꼭짓점 그대로다
  (묶음마다 방향 하나에 정점 100만 개 5 ms쯤 — 계획을 세울 때 한 번)
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.31.0: 측정 글 꼴에 코어 기본 꼴 넘기기·안내 선의 열린 교차·측정 점 표식을 덮는 거리 글상자 옮기기·방향 범위 모듈 떼기

새 선택(측정 글 꼴의 둘째 인자, `inference.trackDirs`의 `meets: { open: true }`, `setMeasureLabelAvoid`의 `points`)을 쓰지 않으면 그림·고르기·측정은 0.30.0과 화소·값까지 같다
(`npm run pixels -- --base v0.30.0 --timeout 900`: 0.30.0의 장면 124개·값 81묶음 모두 같음. 새 장면 2개·값 3묶음은 0.30.0에 없는 선택이라 건너뛰고 head에서 두 번 찍어 같은 것을 확인했다.
249초, load average 3~9).
바뀐 기본 동작은 없다. 입력 타입은 선택 필드만 늘었다(`MeasureTrackDirMeets.open`, `MeasureLabelAvoid.points`, 순수 `LabelAvoidAreas.softBlocks`).
`MeasureFormat`에 둘째 매개변수(`core: MeasureFormatCore`)가 생겼다 — 한 인자 함수는 그대로 넘길 수 있고, 앱 코드가 `MeasureFormat` 함수를 제 손으로 한 인자만 주고 부르는 곳만 타입 검사에 걸린다
(NC·STEP은 코어에 넘기기만 한다). 출력 타입은 선택 필드만 늘었다(`NormalizedTrackDirs.meetOpen`, `measureLabelAvoid`의 `points`).
`itemExtent`·`itemsExtent`는 새 작은 모듈 `opencad-viewer3d/extent`로 옮겼고 `opencad-viewer3d/bounds`가 같은 이름으로 다시 내보낸다(기존 가져오기 그대로).

NC 32차 요청은 코어 캔버스 측정 거리 글상자를 번역하려고 `setMeasureFormat`에 앱 함수를 줬더니 소수 자릿수 규칙(장면 범위 대각선 기준 0~6자리)과 "-0.000" 처리를 앱이 복제해야 했다는 것,
관찰은 375화소 정밀 조준 미리 보기에서 거리 글상자가 첫 점 표식을 덮는 자리가 있다는 것이었다. STEP 33·34차 요청은 안내 선(끌어온 점 나란함·수직 선)에도 곡선 모서리의 활꼴만 지나는 자리의
열린 교차, 그리고 `itemExtent`를 첫 화면 공유 조각에 싣지 않는 작은 모듈(34차에 `bounds`째 실려 +0.44 kB라 쓰지 않았다)이었다. NC 선택 요청 `refineEnds`(0.30.0 설계)는 이번에도 넣지 않았다.

### 측정 글 꼴의 둘째 인자(`MeasureFormatCore`)

- `MeasureFormat = (m: MeasureResult & { units }, core: MeasureFormatCore) => string[]`. `core`는 글 꼴이 없을 때 코어가 그 글상자에 그릴 것이다(그릴 때마다 새로 만든다 — 앱이 고쳐도 된다)
  - `lines`: 코어 기본 줄(글자까지 같다). 내장 두 점 측정은 `["거리 12.345 mm", "ΔX 1.000  ΔY -2.000  ΔZ 0.000"]`(단위를 모르면 단위 없이), 글을 주지 않은 거리 덧그림은 `["12.345 mm"]`
  - `num(v)`: 코어 수 꼴 — 소수 `digits`자리(`toFixed` — 언어와 상관없이 소수점), 반올림해 "-0.000"이 되면 "0.000"
  - `digits`: 장면 범위(`Scene3d.bounds`, 없으면 그물·선분·점 범위 — `setMesh`로 바꾸면 바뀐 범위) 대각선 d에서 max(0, min(6, 5 − ⌊log10 d⌋))(크기 0인 범위는 5자리, 빈 장면은 0자리)
  - `unit`: 장면 단위 글(`'mm'` → "mm", `'inch'` → "in", `'m'` → "m", 모르면 "")
  - `source`: `'measure'`(내장 측정 미리 보기·찍은 결과) | `'annotation'`(글을 주지 않은 거리 덧그림 — `setAnnotations`)
- 순수 함수 `measureDigits(box)`·`measureNumber(v, digits)`(`opencad-viewer3d/annotate`, 입구에도): 뷰어가 쓰는 셈 그대로다(0.30.0까지 뷰어 안에 있던 셈을 뺐다 — 값은 같다)
- 한 인자 함수(0.30.0 꼴)는 그대로 된다. 글 꼴이 없거나 한 인자면 그린 글·글상자 자리가 0.30.0과 같다. `(m, c) => c.lines`는 글 꼴이 없을 때와 화면 덧그림·그림 저장 화소까지 같다
  (값 묶음 `base-measure-format-core` — 다른 화소 0)
- 시험: 순수 셈이 0.30.0 뷰어 셈과 같은지, 네 단위의 미리 보기·찍은 결과에서 `c.lines`로 그린 글·글상자 자리가 같은지, `num`·`digits`·`unit`으로 다시 만든 줄, 이름표만 옮긴 함수,
  한 인자 함수, `setMesh` 뒤 자릿수, 거리 덧그림(`tests/v0310format.test.ts`)

```ts
// NC measure-label.ts: 자릿수·"-0"·단위 글을 다시 세지 않는다(measureDigits·fixedNum·viewBox·UNIT를 지운다 — 한국어 화면은 코어 기본 글과 글자까지 같다)
export function measureLabelFormat(lang: () => string = () => document.documentElement.lang || 'ko'): MeasureFormat {
  return (m, c) => (c.source === 'measure' ? [`${translate('거리', lang())} ${c.num(m.distance)}${c.unit ? ` ${c.unit}` : ''}`, c.lines[1]!] : c.lines);
}
```

### 안내 선의 열린 교차(`inference.trackDirs: { meets: { open: true } }`)

- `MeasureTrackDirMeets.open?: boolean`(기본 꺼짐 — `true`이고 측정 붙잡기 `refine`이 있을 때만): 객체 꼴이라 0.29.0 만나는 점도 켜고(`{ open: true }`는 `meets: true`와 같이 켠다 — `guides`와 함께 줄 수 있다),
  끌어온 점의 나란함·수직 선이 커서 둘레 꺾은선 토막과 3D로 만나지 않지만 그 토막의 활꼴(현과 곡선 사이)을 지날 만큼 가까우면 앱 `refine`을 `'axisEdge'`·`open: true`로 불러
  (`line` = 그 안내 선 — 축 이름 없음, `point` = 그 선 위에서 토막에 가장 가까운 점) 곡선과의 정확한 교차를 받는다. 편 꼴은 `NormalizedTrackDirs`에 `meets: true`와 `meetOpen: true`
- 규칙(정한 것 — 0.20.0 잠근 선의 열린 교차와 같다, 순수 `openEdgeSnap`): 후보(곡선 평면을 뚫는 선·같은 평면에서 활꼴만 지나는 선, 0.22.0 둘째 힌트), 받는 범위(0.23.0 — 그 선 위로 내린 자리가
  토막 범위·현에서 0.1 × 토막 길이 안·커서에서 붙잡기 거리 안·가리지 않음), 미리 보기 한 번에 앱 함수를 새로 부르는 한도 `OPEN_REFINE_CALLS`(6번 — 0.15.0·0.20.0·0.22.0 열린 후보가 먼저 쓴다)와
  기억(같은 열쇠는 다시 부르지 않는다)이 모두 같다. 안내 선은 0.29.0 만나는 점과 같이 이 고르기가 기준을 바꾸기 전의 기준 선분에 대한 것이고, 첫 점과 같은 끌어온 점은 뺀다
- 차례: 점 후보로 0.30.0 안내 선끼리 만나는 점 뒤다(1화소 넘게 가까워야 이긴다). 잠근 동안에는 보지 않는다
- 값: 0.29.0 만나는 점의 선분과 같은 꼴 — `snap`(안내 종류)·`trackFrom`·`edge`(기준 선분)에 `segment`(그 토막)·`refined: true`. `direction`이 없고(첫 점을 지나는 선이 아니다) 선분 방향 잠금도 보지 않는다
  (0.20.0 열린 교차와 같다). 그 점에 붙은 동안 기준 선분은 바뀌지 않는다(0.29.0과 같다). 그리기는 0.29.0 만나는 점과 같다(추론 색 쇄선과 ×)
- 비용(가짜 WebGL, 미리 보기 한 번 `measureAt` — 끌어온 점 셋·첫 점, 12토막 원과 선분 둘, 안내 선을 따라 400자리를 한 번 지나 기억을 채운 뒤, load average 1.6~2.6): `{ meets: true }` 평균 0.051~0.059 ms →
  `{ meets: { open: true } }` 0.048~0.051 ms(p95 0.065~0.069 → 0.075~0.077 ms)
- 켜지 않거나 `refine`이 없거나 `null`만 주면 0.30.0과 같다(시험이 화면 격자·두 안내 선을 따라 첫 점 전·뒤 미리 보기를 견주고, 켜면 바뀐 자리는 모두 원 위 교차인지·이동 한 번의 새 호출이 한도 안인지 본다 —
  `tests/v0310open.test.ts`)

```ts
// STEP·NC: 곧은 모서리 거르기를 준 안내 선에 만나는 점·안내 선끼리·열린 교차까지(앱 refine은 이미 축 이름 없는 'axisEdge' 열린 후보를 곡선 위로 푼다)
viewer.setMeasureSnap({ ...snapOptions, inference: { ...MEASURE_INFERENCE, trackDirs: { edge: straightEdge, meets: { guides: true, open: true } } } });
```

### 측정 거리 글상자가 측정 점 표식을 덮는 자리(`setMeasureLabelAvoid({ points: true })`)

- 원인(가짜 DOM 375 × 560 캔버스에서 재현 — 정밀 조준 펜, 십자선 반지름 24·손가락 44화소 네모): 0.13.0 배치 규칙은 기본 자리(두 점 화면 가운데의 오른쪽 위)를 옮길지를 앱 영역(`rects`)·커서 둘레(`pointerRadius`)로만
  정하고, 측정 점 표식은 옮길 때만 될 수 있으면 비킨다. 첫 점이 가운데에서 오른쪽 위 8~48화소(글상자 높이 안)에 있으면 기본 자리가 첫 점 표식을 덮고, 그 자리가 십자선·손가락과 겹치지 않으면 그대로 그린다.
  휴대폰은 글상자가 화면 폭의 절반을 넘어 캔버스 안으로 당겨지므로 첫 점이 가운데보다 왼쪽이어도 덮는다(마우스·피할 것 없음도 같은 자리)
- `MeasureLabelAvoid.points?: boolean`(기본 꺼짐 — `true`일 때만): 고른 자리(기본 자리 또는 피할 영역을 비킨 자리)가 두 측정 점 표식(첫 점·미리 보기 점 또는 두 점째 — 반지름 `LABEL_POINT_R` 6)을
  덮으면 표식도 피할 원으로 보고 같은 차례(네 귀 → 선분 위 → 피할 영역·표식 위아래)로 다시 고른다. 그 자리가 앱 영역·커서 둘레·표식과 모두 겹치지 않을 때만 받고, 아니면 0.30.0 자리다.
  `rects`·`pointerRadius` 없이 이것만 줘도 켠다(`measureLabelAvoid`가 `{ rects: [], points: true }`). 측정 거리 글상자에만 쓴다(앱 측정 덧그림 글상자는 0.30.0 그대로). 그림 저장은 기본 자리 그대로다
- 순수 `LabelAvoidAreas.softBlocks?: boolean`(`placeMeasureLabel`·`placeLabelAmong`): 같은 규칙 — `soft`도 옮길 까닭이 된다. `placeLabelAmong`은 다시 고른 자리가 먼저 놓인 글상자와도 겹치지 않아야 받는다
  (처음 자리가 그것과 겹쳤으면 따지지 않는다)
- 기본으로 하지 않은 까닭: 화소 회귀의 960 × 600 측정 미리 보기에서도 기본 자리가 표식을 덮는 자리가 흔하다(값 묶음 `base-measure-label-points`의 12자리 가운데 4자리 — 둘은 첫 점, 둘은 커서 아래 미리 보기 점).
  미리 보기 점을 덮는 한 자리는 기존 장면 `base-measure-label-screen`(피할 자리 없음)이 쓰는 자리라 기본으로 바꾸면 그 장면부터 바뀌고, 측정 미리 보기를 찍는 다른 장면도 같은 규칙이라 넓게 바뀐다
- 시험: 원인 재현(375화소, 십자선·손가락과 겹치지 않는데 첫 점 표식을 덮는다), 켜면 표식·십자선·손가락을 모두 비킨 자리, 끄면 0.30.0 자리, `points`만 줘도, 두 점째 결과, 덮지 않던 자리는 그대로,
  순수 함수의 무작위 입력 1,500가지에서 켜지 않으면 0.30.0과 같고 켜도 처음 자리가 표식을 덮지 않으면 같은지(`tests/v0310label.test.ts`)

```ts
// NC measure-lock.ts pushAvoid: 측정 중에는 표식 비키기를 늘 켠다(rects·조준이 없어도)
const avoid: MeasureLabelAvoid = { rects, points: true, ...(this.aimAvoid ? { pointerRadius: AIM_RETICLE_RADIUS } : {}) };
```

### 방향 범위 모듈(`opencad-viewer3d/extent`)

- `itemExtent`·`itemsExtent`(0.30.0 — 값·기억 규칙 그대로)를 `src/extent.ts`로 옮겼다. `opencad-viewer3d/bounds`는 같은 이름으로 다시 내보낸다. 방향 기억은 `forgetBounds`가 함께 버린다(기억 표는 `bounds`에 둔다)
- 작은 번들 시험(vite 빌드, 쓰지 않고 메모리에서 — `tests/v0310extent.test.ts`): 첫 화면이 `sceneBounds`만 쓰고 늦은 조각이 `itemsExtent`를 쓰면 방향 범위 코드가 첫 화면 조각(진입 조각과 그것이 바로 가져오는 조각)에
  없고 늦은 조각에 있다 — `extent`에서 가져와도, `bounds`에서 가져와도(번들러가 다시 내보내기를 원래 모듈로 이어 준다). 첫 화면에서 쓰면 첫 화면에 실린다(대조).
  첫 화면 코드 gzip(줄이지 않은 빌드): 늦은 조각에서 쓰면 1.98 kB, 첫 화면에서 쓰면 2.47 kB. `import * as B from 'opencad-viewer3d/bounds'`처럼 이름공간으로 가져오면 다시 내보낸 것도 함께 실린다

### 앱이 할 일

- NC: 코어를 `#v0.31.0`으로 올린다. `measure-label.ts`는 글 꼴의 둘째 인자로 줄인다(위 예 — 수·자릿수·단위 글은 `c.num`·`c.unit`, 둘째 줄은 `c.lines[1]` 그대로, 덧그림은 `c.lines`).
  기존 시험(그린 글이 코어 기본 글과 같은지)은 그대로 통과해야 한다. 정밀 조준에서 거리 글상자가 첫 점 표식을 덮지 않게 `pushAvoid`가 넘기는 값에 `points: true`를 더한다(위 예 — 조준·툴팁이 없어도 넘기면
  마우스에서도 표식을 비킨다). 곡선(원호·나선)의 활꼴만 지나는 안내 선은 `trackDirs: { edge, meets: { guides: true, open: true } }`로 켠다(`ncSnapOptions`의 `refine`이 이미 축 이름 없는 열린 후보를 푼다).
  원호 꼭짓점과 겹치는 자리(`refineEnds`)는 바뀌지 않았다(0.30.0 설계)
- STEP: 코어를 `#v0.31.0`으로 올린다. 원·타원·B-스플라인 모서리의 활꼴만 지나는 안내 선은 `trackDirs: { edge, meets: { guides: true, open: true } }`로 켠다(앱 `refine`이 축 이름 없는 안내 선을 이미 곡선 위로 푼다).
  분해의 방향 범위를 쓰게 되면 `import { itemsExtent } from 'opencad-viewer3d/extent'`(늦은 조각에서 써도 첫 화면 조각에 실리지 않는다 — `bounds`에서 가져와도 되지만 이름공간 가져오기는 피한다)
- SKP: 코어를 `#v0.31.0`으로 올린다. 할 일은 없다(결과 글상자가 측정 점 표식을 덮지 않게 하려면 `setMeasureLabelAvoid`에 `points: true`를 더할 수 있다)
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.32.0: 앱이 포인터를 맡는 훅·여러 묶음 행렬 한 번에 걸기·안내 선이 곡면만 뚫는 면의 열린 교차

새 API(`setPointerClaim`·`claimPointer`·`setItemMatrices`)와 새 선택(`inference.trackDirs`의 `meets: { openFaces: true }`)을 쓰지 않으면 그림·고르기·측정·조작은 0.31.0과 화소·값까지 같다
(`npm run pixels -- --base v0.31.0 --timeout 900`: 0.31.0의 장면 126개·값 84묶음 모두 같음. 새로 넣은 몸짓 값 두 묶음(처리기 없이·늘 `false`인 처리기로 — 0.31.0은 처리기 없이)과
묶음 행렬 장면 두 개·값 한 묶음(0.32.0은 `setItemMatrices` 한 번, 0.31.0은 `setItemMatrix`를 하나씩)도 0.31.0과 같다. 맡기 값 한 묶음은 0.31.0에 없는 API라 건너뛰고 head에서 두 번 찍어 같은 것을 확인했다.
259초, load average 2~9).
바뀐 기본 동작은 없다. 입력 타입은 선택 필드만 늘었다(`MeasureTrackDirMeets.openFaces`), 출력 타입도 선택 필드만(`NormalizedTrackDirs.meetOpenFaces`). 새 타입은 `PointerClaimQuery`·`PointerClaimHandler`·
`PointerHoldHandler`·`HeldPointer`·`PointerHoldEnd`(입구에서 내보낸다)와 순수 모듈 `opencad-viewer3d/claim`(`PointerHolds`·`takesBackTouches`)이다.
안에서는 `setItemMatrix`·`setItemOpacity` 같은 겉모습 바꾸기 하나가 겉모습 전체를 훑어 행렬 건 묶음을 다시 세던 것을 그만두었다(값은 같다 — 부품 N개를 하나씩 바꾸면 N²이던 것).

STEP 35차(분해 중 부품 끌어 옮기기)는 코어가 궤도 끌기를 캔버스에서 바로 처리하므로 캔버스 부모의 캡처 단계에서 포인터를 먼저 받고, 끌기 시작 거리(마우스 4·손가락 10화소)를 넘는 순간
코어에 합성 `pointercancel`을 보냈다. 요청은 앱이 포인터를 먼저 가져가는 공식 끌기 훅과, 분해 밀대·끌기 때 부품 수만큼 부르는 `setItemMatrix`를 한 번에 거는 함수였다.
남은 일 가운데 STEP 33·34차 요청과 닿는 것으로 0.31.0이 남긴 안내 선의 면의 열린 교차(원기둥·구 면)를 넣었다. NC 선택 요청 `refineEnds`(0.30.0 설계)는 이번에도 넣지 않았다.

### 앱이 포인터를 맡는 훅(`setPointerClaim`·`claimPointer`)

- `setPointerClaim(h: PointerClaimHandler | ((q: PointerClaimQuery) => boolean) | null)`. 처리기는 `{ claim(q): boolean; move?(p: HeldPointer): void; end?(p: HeldPointer, reason: PointerHoldEnd): void }`
  (함수만 주면 `claim`만 있는 처리기). 좌표는 모두 캔버스 기준 CSS 화소(`pick`과 같다 — 화면 좌표가 필요하면 `q.event.clientX`)
- 묻는 때(정한 것): 캔버스를 누를 때마다(마우스·펜·손가락, 앱이 보내는 합성 사건도) 누른 순간 `phase: 'down'`으로 묻고, 거기서 맡지 않은 마우스·펜·한 손가락이
  끌기 시작 거리(`dragStartPx` — 마우스·펜 4, 손가락 10화소)를 넘는 순간 `phase: 'drag'`로 한 번 더 묻는다(코어가 궤도·이동을 시작하기 바로 전 — 두 손가락 몸짓 중에는 묻지 않는다).
  35차 앱처럼 그냥 누르면 예전처럼 고르기·작업 메뉴이고 끌 때만 맡으려면 `'drag'`에서 `true`를 돌려준다
- 물음 `PointerClaimQuery`: `phase`, `pointerId`, `pointerType`(빈 값은 `'mouse'`), `button`(`'drag'`에서도 누를 때의 단추), `x`·`y`(누른 자리), `at`(지금 자리 — `'drag'`면 문턱을 넘은 자리),
  `pointers`(지금 캔버스를 누르고 있는 포인터 수 — 이 포인터 포함, 코어·앱 것 모두), `held`(앱이 이미 맡은 수), `pick(opts?)`(누른 자리 고르기 — `pick(x, y, { ...opts, pointerType })`와 같다,
  부를 때만 구한다), `event`(그 `pointerdown`·`pointermove`)
- 맡으면(`true`) 그 포인터는 뗄 때까지 앱 것이다: 코어는 그 포인터로 궤도·이동·걷기 둘러보기·핀치·고르기(누르기 알림)·측정 점 찍기·측정 미리 보기·두 번 누르기 판별을 하지 않고,
  움직임은 `move`, 떼기·취소는 `end(p, 'up' | 'cancel')`로 넘긴다(맡은 그 사건에는 `move`를 부르지 않는다 — 그 자리는 `q.at`). `'drag'`에서 맡으면 코어에는 그 포인터에 `pointercancel`이 온 것과 같다
  (0.31.0에 앱이 합성 `pointercancel`을 보낸 상태 — 그 전에 코어가 시작한 일은 없다. 코어에는 관성·길게 누르기가 없다). 그대로인 것: 캔버스가 맡은 포인터도 잡는다(`setPointerCapture`),
  휠·키·뷰 큐브, DOM 사건 전달(코어는 사건을 막지 않는다). 휠은 맡은 끌기 중에도 확대한다(막으려면 앱이 `wheel`을 먼저 받아 막는다)
- 둘째 손가락(정한 것): 앱이 손가락을 맡은 동안 새 손가락이 닿으면 그 손가락도 묻고(`q.pointers`·`q.held`로 가른다), 맡으면 둘 다 앱 것, 맡지 않으면 코어가 앱이 맡은 손가락을 모두 돌려받아
  (`end(p, 'pinch')` — 맡은 차례대로) 지금 자리에서 함께 누른 것으로 두 손가락 이동·핀치를 한다(35차 앱이 끌기를 취소하고 첫 손가락을 다시 눌린 것으로 알리던 것과 같다).
  코어가 다루는 손가락이 있는데 새 손가락을 앱이 맡으면 코어는 제 손가락만으로 하던 것을 잇는다. 마우스·펜은 손가락·서로와 상관없다(앱이 마우스를 맡은 동안 손가락 누르기는 그대로)
- `claimPointer(pointerId, on?)`: 누르고 있는 포인터를 아무 때나 맡는다(앱 타이머의 길게 누르기 등 — 코어에는 그 포인터에 `pointercancel`이 온 것과 같다: 하던 궤도를 그만두고,
  두 손가락 몸짓이었으면 0.31.0 손가락 하나를 뗀 것처럼 남은 손가락은 뗄 때까지 무시). `on`을 주면 그 포인터의 `move`·`end`를 거기에(주지 않으면 `setPointerClaim` 처리기에, 없으면 알리지 않는다).
  맡았거나 이미 앱 것이면 `true`, 코어가 모르는 포인터면 `false`. 맡은 뒤는 둘째 손가락 규칙까지 같다. `heldPointers`: 앱이 맡은 포인터 id(맡은 차례)
- 처리기를 바꾸거나 `null`로 끄면 앞 처리기가 맡은 포인터에 `end(p, 'off')`를 알리고 뗄 때까지 무시만 한다(같은 처리기 객체를 다시 주면 그대로). 맡은 포인터 id로 다시 누르면
  (앱이 코어에 돌려주는 합성 누르기 등) 앞 맡기를 `end(p, 'cancel')`로 끝내고 새로 묻는다. `dispose`는 알리지 않는다
- 맡은 포인터 id로 보내는 합성 움직임도 앱 것이다 — 정밀 조준처럼 같은 `pointerId`로 코어에 미리 보기 움직임을 보내는 모듈은 `claimPointer`로 바꾸지 않는다(지금처럼 합성 `pointercancel`을 쓰거나 다른 id로 보낸다)
- 처리기를 주지 않거나 늘 `false`면 0.31.0과 같다(가짜 DOM 시험이 마우스 궤도·누르기·두 번 누르기·오른쪽 이동·Shift+가운데·가운데 두 번, 손가락 누르기·궤도·핀치·셋째 손가락, 취소, 펜, 휠,
  측정 점 찍기 차례의 카메라·고르기·측정을 견주고, 화소·값 회귀의 `base-pointer-gestures`·`base-pointer-declined`가 0.31.0과 견준다)
- 시험: 순수 기록·둘째 손가락 규칙, 묻는 때(누를 때마다·한 포인터 끌기 시작만), 누른 순간·끌기 시작에 맡은 뒤 코어가 아무것도 하지 않는지(측정 미리 보기 포함), 맡은 뒤 다음 조작이 처리기 없는 뷰어와 같은지,
  둘째 손가락(돌려받은 핀치 = 그 자리에서 두 손가락을 누른 카메라, 둘 다 맡기, 코어 손가락 잇기), `claimPointer`(= 합성 `pointercancel`), `'off'`, 같은 id 다시 누르기, 휠, `q.pick`(`tests/v0320claim.test.ts`)

```ts
// STEP explodedrag.ts: 캔버스 부모 캡처 단계 듣기·합성 pointercancel·둘째 손가락 다시 알리기 대신(좌표는 캔버스 기준)
viewer.setPointerClaim({
  claim: (q) => q.phase === 'drag' && q.pointers === 1 && this.opts.direct() && this.opts.start(q.x, q.y, q.pointerType),
  move: (p) => this.opts.move(p.x, p.y),
  end: (_p, why) => this.opts.end(why === 'up'), // 'cancel'·'pinch'(둘째 손가락 — 코어가 두 손가락 이동·핀치를 잇는다)·'off'는 앞 자리로
});
```

### 여러 묶음 행렬 한 번에(`setItemMatrices`)

- `setItemMatrices(entries: Iterable<readonly [id: string, matrix: ArrayLike<number> | null]>): number` — `[묶음 id, 행렬(열 우선 4×4) 또는 null(되돌림)]` 목록(`Map`도 그대로 준다).
  결과(그림·고르기·측정·범위·단면·최근접점·`itemLook`)는 목록 차례대로 `setItemMatrix`를 부른 것과 같다(같은 id 둘은 뒤의 것, 없는 id·앞 16개가 유한한 수가 아닌 행렬은 건너뛴다).
  범위·고르기 목록·단면 테두리·그림자·측정 미리 보기는 한 번만 버린다. 돌려주는 값은 건 항목 수(건너뛴 것 빼고)
- 잰 시간(가짜 DOM·가짜 WebGL, Node — 부품 N개 상자 장면에서 모든 부품 행렬을 바꾸는 한 단계, 가운데값, load average 4~5):

  | 부품 | 0.31.0 `setItemMatrix` × N | 0.32.0 `setItemMatrix` × N | 0.32.0 `setItemMatrices` | 0.32.0 불투명도·색·행렬 × N(STEP `applyLooks` 꼴) |
  |---:|---:|---:|---:|---:|
  | 100 | 0.08~0.09 ms | 0.04~0.06 ms | 0.04~0.05 ms | 0.06 ms |
  | 300 | 0.33~0.34 ms | 0.13~0.17 ms | 0.08~0.15 ms | 0.14 ms |
  | 1,000 | 2.30~2.32 ms | 0.34~0.51 ms | 0.29~0.46 ms | 0.46 ms |

  0.31.0은 호출마다 겉모습 전체를 훑어(부품 N개면 N²) 1,000개에서 셋을 부르면 그 세 배쯤이었다(어림 7 ms — 불투명도·색도 같은 훑기를 한다). 범위·고르기 목록·모형 행렬은 0.31.0에도 다음 그리기에서 한 번만 다시 세므로
  그다음 그리기(가짜 WebGL 6~8 ms)와 고르기 한 번(0.2 ms)은 전·후가 같다. 부품 하나만 옮기는 끌기 한 번은 0.002~0.003 ms(0.31.0 0.006 ms)
- 시험: 같은 목록(행렬·되돌림·없는 id·잘못된 행렬·같은 id 둘)을 하나씩 건 뷰어와 그리기 기록(해·그림자·단면 포함)·화면 격자 고르기·전체 보기·묶음 보기·최근접점·`itemLook`이 같은지,
  두 번째 목록·그물 빼기·`clearItemLooks` 뒤, 모두 되돌리면 행렬을 건 적 없는 뷰어와 같은지, 다른 겉모습은 그대로인지(`tests/v0320matrices.test.ts`). 화소·값 회귀 장면 `base-item-matrices`·
  `base-item-matrices-section`과 값 `base-item-matrices`가 0.31.0(하나씩)과 같다

```ts
// STEP app.ts applyLooks: 불투명도·색은 그대로, 행렬은 모아 한 번에
const mats: [string, ArrayLike<number> | null][] = [];
for (const id of [...this.appliedLooks.keys()])
  if (!want.has(id)) {
    v.setItemOpacity(id, null);
    v.setItemColor(id, null);
    mats.push([id, null]);
    this.appliedLooks.delete(id);
  }
for (const [id, l] of want) {
  const k = lookKey(l);
  if (this.appliedLooks.get(id) === k) continue;
  v.setItemOpacity(id, l.alpha, { pickable: l.pickable });
  v.setItemColor(id, l.color);
  mats.push([id, l.matrix]);
  this.appliedLooks.set(id, k);
}
v.setItemMatrices(mats);
```

### 안내 선이 곡면만 뚫는 면의 열린 교차(`inference.trackDirs: { meets: { openFaces: true } }`)

- `MeasureTrackDirMeets.openFaces?: boolean`(기본 꺼짐 — `true`이고 측정 붙잡기 `refineFace`가 있을 때만): 0.29.0 만나는 점도 켜고, 끌어온 점의 나란함·수직 선이 커서 둘레 그물 삼각형을
  뚫지 않지만 그 삼각형과 곡면 사이를 지날 만큼 가까우면 앱 `refineFace`를 `'axisFace'`·`open: true`(`line` = 그 안내 선 — 축 이름 없음, `point` = 그 선 위에서 삼각형에 가장 가까운 점,
  `face` = 그 삼각형)로 불러 곡면과의 정확한 교차를 받는다. `open`(0.31.0 토막의 열린 교차 — `refine`)과 따로 켠다(둘 다 줄 수 있다). 편 꼴은 `NormalizedTrackDirs`에 `meets: true`와 `meetOpenFaces: true`
- 규칙(정한 것 — 0.22.0 축의 면의 열린 교차와 같다, 순수 `openFaceSnap`): 후보·둘째 힌트(0.24.0)·받는 범위(그 선 위로 내린 자리, 코어 점·커서에서 붙잡기 거리 안, 그 삼각형 위 곡면 조각 자리,
  단면에서 남는 쪽, 가리지 않음 — 오목하게 보이는 자리는 0.23.0 규칙), 미리 보기 한 번에 앱 함수를 새로 부르는 한도 `OPEN_REFINE_CALLS`(앞의 열린 후보들이 먼저 쓴다)와 기억이 모두 같다.
  안내 선은 0.31.0 열린 교차와 같이 이 고르기가 기준을 바꾸기 전의 기준 선분에 대한 것이고, 첫 점과 같은 끌어온 점은 뺀다
- 차례: 점 후보로 0.31.0 안내 선의 열린 교차 뒤다(1화소 넘게 가까워야 이긴다). 잠근 동안에는 보지 않는다
- 값: 0.29.0 만나는 점의 면과 같은 꼴 — `snap`(안내 종류)·`trackFrom`·`edge`(기준 선분)에 `face`(그 삼각형)·`refined: true`. `direction`이 없다(첫 점을 지나는 선이 아니다). 그 점에 붙은 동안 기준 선분은 바뀌지 않는다
- 비용(가짜 WebGL, 미리 보기 한 번 `measureAt` — 끌어온 점 하나·기준 선분, 24 × 12 구, 안내 선을 따라 400자리를 한 번 지나 기억을 채운 뒤, load average 3~4): `{ meets: true }` 평균 0.015~0.023 ms →
  `{ meets: { openFaces: true } }` 0.075~0.087 ms(p95 0.017~0.037 → 0.10~0.17 ms — 선이 커서 가까이 지나면 커서 둘레 삼각형을 모은다)
- 켜지 않거나 `refineFace`가 없거나 받을 점을 주지 않으면(`null`·먼 근·선에서 벗어난 점) 0.31.0과 같다(시험이 화면 격자·안내 선을 따라 견주고, 켜면 바뀐 자리는 모두 구 위·그 선 위 교차인지,
  `open`과 함께 줘도 같은지, 두 근·기억·호출 한도·찍은 점을 본다 — `tests/v0320faceopen.test.ts`)

```ts
// STEP: 원기둥·구 면도(앱 refineFace가 축 이름 없는 'axisFace' 열린 후보를 이미 B-rep 곡면 위로 푼다)
viewer.setMeasureSnap({ ...snapOptions, inference: { ...MEASURE_INFERENCE, trackDirs: { edge: straightEdge, meets: { guides: true, open: true, openFaces: true } } } });
```

### 앱이 할 일

- STEP: 코어를 `#v0.32.0`으로 올린다. 분해 손질 끌기(`explodedrag.ts`)의 바로 끌기를 `setPointerClaim`으로 바꾼다(위 예 — 캔버스 부모 캡처 단계 듣기, 문턱 셈, 합성 `pointercancel`,
  둘째 손가락이 닿을 때 첫 손가락을 다시 알리는 것을 뺀다. 좌표는 캔버스 기준이라 `start`가 화면 좌표를 쓰면 `q.event.clientX`·`clientY` 또는 캔버스 자리를 더한다).
  `'drag'`에서만 맡으면 그냥 누르기(고르기·두 번 눌러 맞춰 보기)는 그대로다. 길게 눌러 잡기는 정밀 조준 모듈이 같은 `pointerId`로 코어에 미리 보기를 보내므로 지금처럼 둔다.
  `applyLooks`는 행렬을 모아 `setItemMatrices` 한 번으로 건다(위 예). 원기둥·구 면을 비켜 가는 안내 선은 `meets`에 `openFaces: true`를 더한다
- NC: 코어를 `#v0.32.0`으로 올린다. 할 일은 없다(정밀 조준은 그대로 된다). 원호 꼭짓점과 겹치는 자리(`refineEnds`)는 바뀌지 않았다(0.30.0 설계)
- SKP: 코어를 `#v0.32.0`으로 올린다. 할 일은 없다(측정의 정밀 조준·상자 고르기가 코어에 보내는 합성 `pointercancel`은 그대로 된다 — 바꾸려면 `setPointerClaim`)
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.33.0: 켠 선이 꺾은선 꼭짓점을 지나는 자리 다듬기·그림 저장의 측정 점 표식 비키기·여러 묶음 겉모습 한 번에 걸기·아주 가까이 본 키 큰 칸의 면의 열린 교차

새 선택(`MeasureSnapOptions.refineEnds`·`MeasureLabelAvoid.snapshotPoints`)과 새 API(`setItemLooks`)를 쓰지 않으면 그림·고르기·측정은 0.32.0과 화소·값까지 같다
(`npm run pixels -- --base v0.32.0 --timeout 900`: 0.32.0으로도 찍을 수 있는 장면 129개·값 90묶음 모두 같음. 그 가운데 새로 넣은 겉모습 장면·값 `base-item-looks`(0.33.0은 `setItemLooks` 한 번, 0.32.0은 하나씩)와
`refineEnds`를 주지 않은 원호 꼭대기 값 `apex-measure-ends-off`도 0.32.0과 같다. 새 장면 2개(`apex-measure-ends`·`base-measure-label-points-image`)와 값 2묶음(`apex-measure-ends`·
`base-measure-label-snapshot`)은 0.32.0에 없는 선택이라 건너뛰고 head에서 두 번 찍어 같은 것을 확인했다. 653초, load average 20~75).
바뀐 기본 동작은 하나다: 면의 열린 교차(`refineFace`를 주고 축·잠근 선·안내 선의 그것을 켠 앱)에서 원근으로 아주 가까이 확대해 꼭짓점이 눈 뒤로 넘어간 삼각형도 커서 둘레 삼각형으로 모은다
(0.32.0까지는 뺐다 — 붙지 않던 자리가 붙는다. 아래 절). 입력 타입은 선택 필드만 늘었다(`MeasureSnapOptions.refineEnds`·`MeasureLabelAvoid.snapshotPoints`). 새 타입은 `ItemLookInput`(입구에서 내보낸다),
새 순수 함수는 `vertexEdgeCandidates`·`vertexEdgeSnap`(`opencad-viewer3d/track`)과 `nearClipRing`(`opencad-viewer3d/scenepick`)이다.
안에서는 묶음 행렬을 바꾸면(`setItemMatrix`·`setItemMatrices`·`setItemLooks`) 그 묶음의 범위·모형 행렬만 다시 센다(값은 같다).

NC 33차는 그림 저장(`toBlob`)의 거리 글상자도 측정 점 표식을 비키는 선택과, 30차부터 요청한 `refineEnds`(만나는 점이 원호를 나눈 꼭짓점과 거의 겹칠 때 끝점보다 다듬은 교차 먼저 — 0.30.0 설계)를 요청했다.
STEP 36차는 안내 선의 면의 열린 교차에서 두 자리(한 삼각형 위 곡면 조각을 두 번 스칠 때, 아주 가까이 확대해 키 큰 옆면 칸의 꼭짓점이 눈 뒤일 때)를 선택 요청으로 남겼고,
3,000개 조립 끌기 한 번의 4 ms는 앱이 부품마다 겉모습 열쇠를 다시 만드는 몫이라 했다(앱 일). 32차 남은 일은 행렬을 바꾼 묶음만 범위를 고치는 셈과 불투명도·색을 한 번에 거는 함수였다.
STEP 두 자리 가운데 아주 가까이 확대한 자리를 고쳤고, 한 삼각형을 두 번 스치는 자리는 설계만 적었다(아래).

### 켠 선이 꺾은선 꼭짓점을 지나는 자리 다듬기(`refineEnds`)

- `MeasureSnapOptions.refineEnds?: boolean`(기본 꺼짐 — `true`이고 `refine`이 있을 때만): 켠 선(첫 점 축 — `inference.axisEdges`, 끌어온 축 — `track`, 끌어온 점 안내 선 — `trackDirs: { meets }`,
  잠근 선 — `lockEdges`)이 곡선을 나눈 꺾은선 꼭짓점(토막 끝)을 그 깊이에서 화면 반 화소 안으로 지나면, 그 꼭짓점을 끝으로 둔 커서 둘레 토막마다 앱 `refine`을
  `'axisEdge'`·`open: true`(`point` = 꼭짓점을 그 선에 내린 발, `line` = 그 선 — 0.20.0 열린 교차 입력과 같은 꼴)로 불러 곡선과의 정확한 교차를 받는다(0.30.0 설계 그대로)
- 받는 규칙·호출 한도·기억은 0.23.0 열린 교차와 같다(그 선 위로 내린 자리가 토막 범위 안·토막 끝에서 반 화소 넘게·현에서 0.1 × 토막 길이 안, 커서에서 붙잡기 거리 안, 가리지 않음 — 순수 `vertexEdgeSnap`).
  앱 점이 꼭짓점과 반 화소 안이면(선이 꼭짓점에서 곡선을 가로지른다) 받지 않고 끝점 그대로다. 곧은 꺾은선(앱이 `null`)도 끝점 그대로다
- 차례: 받으면 그 꼭짓점의 끝점 붙잡기(잠근 동안이면 그 점을 잠근 선에 내린 자리)보다 먼저다. 꼭짓점이 커서에서 붙잡기 거리 밖이면 다른 점 후보와 함께 견준다(0.23.0 열린 교차 뒤 차례)
- 값은 열린 교차와 같은 꼴이다 — 축이면 `snap: 'axis'`·`axis`·`segment`·`refined`, 안내 선이면 안내 종류·`trackFrom`·`edge`·`segment`·`refined`, 잠근 선이면 잠근 선 위 점에 `segment`·`refined`
- NC 23차 재현(반지름 25 원호 33토막, 꼭대기를 스치는 첫 점 X축, 1화소 0.002~0.1 확대 12단 × 두 근): 첫 점 높이 25 − 0.001에서 원 위 교차에 붙는 단이 8단 → 11단(두 근 모두 —
  가장 가까이 본 첫 단은 그대로: 틈이 붙잡기 거리보다 넓다), 25 − 0.01에서 8단 → 12단. 바뀐 자리는 모두 선이 그 근 쪽 꼭대기 토막 끝을 반 화소 안으로 지나는 단이고,
  NC `measure-apex-core`의 셈에 그 조건을 더한 것과 같다. 끌어온 축·잠근 X축·기운 원호를 스치는 안내 선도 같은 규칙이다
- 비용(가짜 WebGL, 미리 보기 한 번 `measureAt` — 그 장면, 1화소 0.07(선이 꼭짓점을 반 화소 안으로 지나는 단)과 0.02, 꼭대기 둘레 X축을 따라 400자리를 한 번 지나 기억을 채운 뒤 세 번):
  켜기 전·후 차이가 부하에 따른 흔들림보다 작다(평균 둘 다 0.02~0.03 ms, load average 23~31에서 다시 재면 끈 것 0.03~0.11 ms·켠 것 0.02~0.05 ms)
- 시험: 순수 후보·받기(반 화소 안·밖, 끝점 자리만, 받는 범위 밖, 꼭짓점에서 가로지르는 선), 확대 12단을 끄고·켜서 견주기, NC 같은 셈, 끌어온 축·잠근 X축·안내 선, 화면 격자, 앱 `null`,
  찍은 거리(`tests/v0330ends.test.ts`). 화소·값 회귀의 `apex-measure-ends`(새 값)·`apex-measure-ends-off`(0.32.0과 같다)

```ts
// NC refine.ts ncSnapOptions: 원호 꼭짓점과 겹치는 만나는 점도 앱 refine(이미 'axisEdge' 열린 후보를 원호 위로 푼다)에 묻는다
return { points: centers.points, /* … */ refine: (c) => refineSnap(c, nc, arcAngle), refineEnds: true, throughTranslucent: true };
```

### 그림 저장의 측정 거리 글상자도 측정 점 표식 비키기(`setMeasureLabelAvoid({ points, snapshotPoints })`)

- `MeasureLabelAvoid.snapshotPoints?: boolean`(기본 꺼짐 — `points`와 함께 `true`일 때만): 그림 저장(`toBlob`·`renderImage`)의 측정 거리 글상자도 두 측정 점 표식을 덮는 자리를 옮긴다.
  규칙은 0.31.0 `points`와 같다(기본 자리 `setMeasureLabelSpot`부터, 표식을 덮으면 표식을 피할 원으로 보고 같은 차례로 다시 고른다 — 순수 `LabelAvoidAreas.softBlocks`)
- 그림에 없는 것은 보지 않는다: 앱 영역(`rects`)·커서 둘레(`pointerRadius`)·화면 덧그림 글상자끼리 비키기(0.24.0). 그것들이 화면 글상자를 옮기지 않았으면 화면 글상자와 같은 자리다
- 끄면(`points` 없이 준 것도) 0.32.0처럼 그림 저장은 기본 자리다. `measureLabelAvoid`는 켠 값(`snapshotPoints: true`)을 돌려준다
- 시험: 끄면 0.32.0 자리, 켜면 화면 글상자와 같은 자리(앱 영역이 없을 때·기본 자리를 정해도), 정밀 조준이면 표식만 비킨 자리(순수 함수와 같다), 두 점째 결과·화면 밖 그리기(배율 2),
  표식을 덮지 않는 자리는 그대로(`tests/v0330snaplabel.test.ts`). 화소·값 회귀의 `base-measure-label-points-image`·`base-measure-label-snapshot`(`points`만이면 그림 저장 화소가 0.32.0 규칙 그대로,
  켜면 화면 글상자를 옮긴 자리에서만 달라진다)

```ts
// NC measure-lock.ts pushAvoid: 그림 저장도 같은 표식 비키기
const avoid: MeasureLabelAvoid | null = rects.length || this.aimAvoid || this.measuring ? { rects, points: true, snapshotPoints: true, ...(this.aimAvoid ? { pointerRadius: AIM_RETICLE_RADIUS } : {}) } : null;
```

### 여러 묶음 겉모습 한 번에(`setItemLooks`)와 행렬을 바꾼 묶음만 범위 다시 세기

- `setItemLooks(entries: Iterable<readonly [id: string, look: ItemLookInput | null]>): number` — `[묶음 id, 겉모습 또는 null(그 묶음 겉모습을 모두 되돌림)]` 목록(`Map`도 그대로 준다).
  `ItemLookInput`은 `{ opacity?, pickable?, color?, matrix?, edgeColor?, profileColor?, pickOpaque?, pickThrough? }` — 준 필드만 바꾸고(`undefined`·없는 필드는 그대로) `null`은 그 겉모습 되돌림,
  값은 하나씩 부르는 함수와 같다(`opacity` = `setItemOpacity` — `pickable`은 `opacity`가 수일 때 그 `opts.pickable`, `null`이면 함께 되돌린다. `color`·`matrix`·`edgeColor`·`profileColor`·`pickOpaque`·`pickThrough`도 같은 이름의 `setItem…`)
- 결과(그림·고르기·측정·범위·단면·최근접점·`itemLook`)는 목록 차례대로, 한 항목 안에서는 `opacity` → `color` → `matrix` → `edgeColor` → `profileColor` → `pickOpaque` → `pickThrough` 차례로 하나씩 부른 것과 같다
  (같은 id 둘은 뒤의 것이 덮고, 없는 id·겉모습이 객체도 `null`도 아닌 항목은 건너뛰며, 앞 16개가 유한한 수가 아닌 행렬은 그 행렬만 건너뛴다. `pickThrough`는 그물에만).
  그림자·고르기 목록·측정 미리 보기는 한 번만 버리고, 같은 색 글은 한 번만 푼다. 돌려주는 값은 건 항목 수(건너뛴 것 빼고)
- 행렬을 바꾸면(`setItemMatrix`·`setItemMatrices`·`setItemLooks`) 그 묶음의 범위·모형 행렬·숨긴 구간 범위만 버린다(묶음 절반 넘게 바꾸면 예전처럼 통째로). 값은 같다
- 잰 시간(가짜 DOM·가짜 WebGL, Node — 부품 N개 상자 장면에서 모든 부품의 불투명도·색·행렬을 바꾸는 한 단계, 32번 가운데값, load average 16~31에서 두 번):

  | 부품 | 하나씩 셋 × N(`applyLooks` 예전 꼴) | 불투명도·색 하나씩 + `setItemMatrices`(0.32.0 예) | `setItemLooks` 한 번 | 부품 하나만 옮긴 뒤 고르기 한 번(0.32.0 → 0.33.0) |
  |---:|---:|---:|---:|---:|
  | 1,000 | 0.94~1.01 ms | 0.90~0.92 ms | 0.44~0.45 ms | 0.36~0.37 → 0.29~0.33 ms |
  | 3,000 | 3.22~3.47 ms | 2.61 ms | 1.44~1.53 ms | 0.98~1.03 → 0.65~0.73 ms |

  부하가 덜할 때 앞서 잰 한 번은 1,000개 0.82·0.71·0.39 ms, 3,000개 2.76·2.08·1.16 ms다. 다음 그리기(가짜 WebGL 1,000개 6~14 ms·3,000개 18~49 ms)와 고르기 한 번은
  세 꼴이 같다(부하로 흔들린다). 부품 하나만 옮긴 뒤의 고르기는 그 묶음의 범위·모형 행렬만 다시 세서 조금 줄었다
- 시험: 같은 목록(모든 필드, 필드 `null`, 항목 `null`, 없는 id, 잘못된 행렬, 같은 id 둘, 객체가 아닌 항목)을 하나씩 건 뷰어와 그리기 기록(해·그림자·단면 테두리)·화면 격자 고르기(반투명 너머 포함)·
  전체 보기·묶음 보기·최근접점·`itemLook`이 같은지(두 번째 목록·그물 빼기·`clearItemLooks` 뒤), 행렬을 하나씩 여러 번 옮긴 뷰어(사이사이 그리기·고르기)가 마지막 겉모습만 처음부터 건 뷰어와 같은지 —
  기억을 하나라도 지우지 않으면 실패하는 것을 확인했다(`tests/v0330looks.test.ts`). 화소·값 회귀의 `base-item-looks`가 0.32.0(하나씩)과 같다

```ts
// STEP looks.ts putLooks: 바뀐 묶음만 한 목록으로
const list: [string, ItemLookInput | null][] = [];
for (const id of [...applied.keys()])
  if (!want.has(id)) {
    list.push([id, { opacity: null, color: null, matrix: null }]);
    applied.delete(id);
  }
for (const [id, l] of want) {
  const k = lookKey(l);
  if (applied.get(id) === k) continue;
  list.push([id, { opacity: l.alpha, pickable: l.pickable, color: l.color, matrix: l.matrix }]);
  applied.set(id, k);
}
v.setItemLooks(list);
```

### 아주 가까이 본 키 큰 칸의 면의 열린 교차(바뀐 기본 동작 — `refineFace`를 준 앱만)

- 면의 열린 교차(0.22.0 축·잠근 선 `axisFaces`·`lockFaces`, 0.32.0 안내 선 `meets: { openFaces }`)가 보는 커서 둘레 삼각형(`trianglesNear`)은 꼭짓점이 하나라도 눈 뒤인 삼각형을 뺐다.
  원근으로 아주 가까이 확대하면 원기둥 옆면처럼 키 큰 칸의 삼각형은 먼 꼭짓점이 눈 뒤로 넘어가, 커서 바로 앞의 칸인데도 그 칸을 비켜 가며 곡면만 뚫는 자리가 붙지 않았다
- 이제 그런 삼각형은 가까운 면(클립 공간 z + w ≥ 0 — 선분 고르기 `segmentScreenPick`과 같은 자르기)으로 자른 화면 다각형(3~4각, 순수 `nearClipRing`)으로 커서가 그 위인지 본다.
  변까지 거리는 원래대로 선분 고르기(가까운 면에서 자른다)다. 꼭짓점이 모두 눈앞인 삼각형은 예전 셈 그대로라 그 밖의 자리는 바뀌지 않는다
- `refineFace`를 주고 면의 열린 교차를 켠 앱에서만 달라진다(커서 둘레 삼각형은 면의 열린 교차만 쓴다). 받는 규칙·차례·값은 그대로다
- 시험: 반지름 30 원기둥 옆면(높이 400 한 칸, 24토막)을 첫 점 X축이 칸을 비켜 가며 두 번 뚫는 자리를 거리 22에서 내려다보면(칸의 위 꼭짓점이 눈 뒤) 두 교차 모두 원기둥 위로 붙고,
  `refineFace` 없이·`null`이면 X축 위 커서 자리, 화면 격자에서 바뀐 자리는 모두 X축 위·원기둥 위 다듬은 교차(`tests/v0330near.test.ts`). 같은 확인을 0.32.0 셈으로 돌리면 그 칸의 삼각형을 모으지 않고 붙지 않는다

### 한 삼각형 위 곡면 조각을 두 번 스치는 안내 선(STEP 선택 요청 — 지금 차례와 설계, 바꾸지 않았다)

- 지금 차례: 선이 한 삼각형 위 곡면 조각을 두 번 지날 수 있는지(0.24.0 둘째 힌트)는 그 삼각형과 변을 함께 쓰는 매끈한 이웃(법선 사잇각 45° 안)마다 변 법선(두 면 법선의 합)을 두고,
  삼각형 법선과 변 법선들이 선 방향과 이루는 내적이 양·음 모두 있어야 한다. 원기둥 옆면 칸을 대각선으로 나눈 두 삼각형은 같은 평면이라 대각선의 변 법선이 삼각형 법선과 같고,
  각 삼각형은 휘는 변(이웃 칸과 함께 쓰는 세로 변)이 하나뿐이라 칸과 나란히 지나는 선은 부호 하나만 얻는다 — 두 교차가 한 삼각형에 다 들면 둘째 힌트를 두지 않아 무게중심 쪽 교차 하나만 붙는다
  (두 교차가 대각선을 사이에 두고 두 삼각형에 나뉘면 삼각형마다 하나씩 붙는다)
- 설계(선택 없이 고칠 수 있다 — 기본 차례를 바꾸지 않고 둘째 힌트를 더 두는 일): 이웃이 같은 평면(법선 사잇각 거의 0)이면 그 이웃도 같은 칸으로 묶어 칸의 바깥 변(그 이웃의 다른 변)의 변 법선까지 본다.
  그 이웃의 변 가운데 자리에서도 이웃 삼각형을 모아야 하므로(지금은 그 삼각형 세 변 가운데에서만 모은다) 칸 하나에 이웃 찾기가 한 번 는다. 힌트 자리는 칸 전체가 아니라 그 삼각형 위 조각의 두 끝 그대로다
  (두 교차가 다 그 삼각형 위일 때만 필요하다). 정해야 할 것은 같은 평면의 문턱(법선 사잇각)과 칸으로 묶는 이웃 수(사각 칸 둘 — 셋 이상 묶이는 평면 조각은 묶지 않는다)다
- 미룬 까닭: 둘째 힌트가 늘면 앱 함수를 부르는 횟수가 칸마다 둘 는다(호출 한도 `OPEN_REFINE_CALLS`를 함께 쓴다). STEP 36차 재현(원기둥 옆면 칸 한쪽 삼각형에 두 교차가 다 든 자리)을 코어 시험으로 옮겨
  둘째 힌트가 그 자리에서만 느는지 먼저 견준 뒤 넣는다

### 앱이 할 일

- NC: 코어를 `#v0.33.0`으로 올린다. 측정 붙잡기 선택(`ncSnapOptions`·`panelSnapOptions`)에 `refineEnds: true`를 더한다(위 예 — 앱 `refine`은 이미 `'axisEdge'` 열린 후보를 원호 위로 푼다).
  `measure-apex` 시험의 "끝점이 먼저이거나 안내 선 위 커서 자리" 단이 원 위 교차로 바뀌는지 본다. 그림 저장의 거리 글상자도 표식을 비키려면 `pushAvoid`의 값에 `snapshotPoints: true`를 더한다(위 예).
  판재 구멍 벽처럼 키 큰 칸을 아주 가까이 확대해도 축의 면의 열린 교차가 붙는다(할 일 없음)
- STEP: 코어를 `#v0.33.0`으로 올린다. `putLooks`는 불투명도·색·행렬을 `setItemLooks` 한 목록으로 건다(위 예). 아주 가까이 확대해도 원기둥 옆면의 안내 선 면 교차가 붙는다 —
  `guideopen` 시험의 "꼭짓점이 눈 뒤면 모으지 않는다" 전제는 빼도 된다. 3,000개 조립 끌기의 겉모습 열쇠 다시 만들기는 앱 일이다(끌기 중에는 옮긴 부품의 행렬만 거는 것으로 줄일 수 있다)
- SKP: 코어를 `#v0.33.0`으로 올린다. 할 일은 없다
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.34.0: 구멍 안에서 아주 가까이 본 벽의 면 위 만나는 점(NC 35차 결함)

새 API·선택은 없다. 면의 열린 교차(`refineFace`를 주고 축·잠근 선의 `axisFaces`·`lockFaces`나 안내 선의 `meets: { openFaces }`를 켠 앱)에서만 달라지고,
그 밖의 그림·고르기·측정은 0.33.0과 화소·값까지 같다(`npm run pixels -- --base v0.33.0 --timeout 900`: 0.33.0으로도 찍을 수 있는 장면 131개·값 93묶음 모두 같음 —
그 가운데 새 값 `hole-measure-near`의 같은 자리를 보통 거리에서 가리킨 `hole-measure-normal`도 같다. 새 장면·값 `hole-measure-near`는 0.33.0에 없는 동작이라 건너뛰고
head에서 두 번 찍어 같은 것을 확인했다. 376초, load average 6~20).
새 순수 함수는 `rayHitsTriangle`(`opencad-viewer3d/track` — 광선이 삼각형을 앞쪽에서 맞는지)이다.

NC 35차는 판재 구멍 안에서 원근 거리 0.5~2로 원기둥 벽을 볼 때, 끌어온 점 안내 선(`trackDirs: { meets: { guides, open, openFaces } }`)이 벽을 뚫거나
벽 활꼴(벽을 나눈 칸과 원기둥 사이)을 지나는 두 점 둘레를 81곳 × 30가지로 훑어 모두 안내 선 위 커서 자리였다고 알렸다(면 위 만나는 점 0 — 0.32.0·0.33.0 같음).
0.33.0 README는 "판재 구멍 벽처럼 키 큰 칸을 아주 가까이 확대해도 붙는다"고 적었지만 그것(꼭짓점이 눈 뒤인 칸도 모으기)만으로는 붙지 않았다.

### 원인(같은 장면을 코어 시험으로 옮겨 단계마다 센 것)

장면: 반투명 판(400 × 300 × 18)에 세운 구멍(반지름 5, 깊이 12 — 20토막 원기둥 고체, 칸 하나가 벽 높이 전체), 판 윗면의 기운 곧은 모서리(27°)를 기준으로 끌어온 점의
나란한 안내 선이 구멍 중심에서 반지름 − δ를 지난다. 카메라는 구멍 안에서 교차 M 쪽 벽을 거리 1로 본다(1화소 0.0012).

| 단계 | 활꼴(δ 0.03 — 선이 칸을 비켜 간다) | 칸을 뚫음(δ 0.1) |
|---|---|---|
| 커서 둘레 삼각형(`trianglesNear` — 24개 한도, 0.33.0 가까운 면 자르기) | 2(판 1·벽 칸 1) | 2(판 1·벽 칸 1) |
| 열린 면 후보(`openFaceCandidates`) | 0 — 선과 벽 칸 사이 0.032가 처짐 한도(0.1 × 가장 긴 변 1.21) 안이지만 붙잡기 거리의 세계 길이(10화소 × 0.0012 = 0.012)를 넘었다 | 0 — 선이 칸을 뚫으면 열린 후보가 아니다 |
| 면의 만나는 점(0.29.0 — 선이 커서 아래 칸을 뚫는 자리) | 없음(선이 칸과 나란) | 뚫는 자리가 원기둥을 뚫는 자리에서 선을 따라 0.095, 화면에서 78화소 — 커서에서 붙잡기 거리 밖 |
| 앱 `refineFace` 호출 | 0 | 0 |

받는 거리·보이는지(0.23.0 제 조각 가림)·호출 한도·기억·후보 차례에는 닿기 전에 빠졌다. 거리 8이면 붙잡기 거리의 세계 길이가 0.097이라 활꼴은 붙었고(81곳 가운데 73곳),
칸을 뚫는 자리는 9화소라 0.29.0 만나는 점이 33~38곳에서 붙었다. 처짐(칸과 원기둥 사이, 반지름 5·20토막이면 0.06)은 세계 길이로 정해지는데 거르는 셈이 화소로
정해진 길이와 견줘, 아주 가까이 확대하면 둘 다 빠졌다. 활꼴의 틈은 거의 눈 쪽이라 화면에서는 선이 커서 아래 그 칸을 지난다.

### 고친 것(`openFaceCandidates`)

- 활꼴: 커서 광선이 그 삼각형을 맞으면(`rayHitsTriangle` — 커서가 그 삼각형 위) 선과 삼각형 사이를 붙잡기 거리의 세계 길이와 견주지 않는다(처짐 한도 `0.1 × 가장 긴 변` 안만).
  커서 아래가 아닌 삼각형은 0.33.0 그대로다
- 칸을 뚫음: 선이 그 삼각형을 뚫어도 커서가 그 위이고, 뚫는 자리가 화면에서 커서 붙잡기 거리 밖이고, 커서 광선에 가장 가까운 선 위 점이 그 평면에서 붙잡기 거리의
  세계 길이보다 멀면(커서 쪽 활꼴이 붙잡기 거리보다 두껍다) 열린 후보로 본다(힌트는 0.22.0과 같은 무게중심 쪽 자리). 마지막 조건이 없는 보통 거리는 0.33.0 그대로다
- 받는 규칙(앱 점이 그 선 위·그 삼각형 위 곡면 조각 자리·커서에서 붙잡기 거리 안·가리지 않음), 호출 한도(미리 보기 한 번에 6번)·기억, 차례, 값의 꼴은 그대로다

### 확인

- NC 탐색과 같은 뜻의 경우를 모두 코어만으로(가짜 WebGL) 0.33.0과 견줬다: 세운 구멍 벽 격자(거리 1~8)·두 교차 둘레(0.5~8)·끌어온 점 X축이 꼭대기 꼭짓점 아래를 지나는 자리,
  누운 구멍(반지름 4·16토막) 벽 격자와 두 교차 둘레, 첫 점 X축, 보통 거리(맞춰 보기·옆 15·위 30·등각 60) — 31,020곳 가운데 6,083곳이 바뀌었고 모두 원기둥 위·그 선 위 다듬은 교차였다
  (잃은 만나는 점·엉뚱한 자리 0). NC가 알린 30가지(거리 0.5·1·2 × 다섯 자리 × 두 교차, 81곳씩)는 0 → 2,178 / 2,430곳(그 밖은 커서에서 붙잡기 거리 밖인 격자 구석),
  누운 구멍 두 교차 둘레는 0 → 1,191 / 1,458곳. 보통 거리 4,056곳은 그대로다
- 시험(`tests/v0340hole.test.ts`): 순수 후보(아주 가까이·거리 8, 커서 아래·아닌 칸, 뚫는 칸), 세운 구멍 다섯 자리 × 거리 0.5·1·2 × 두 교차가 원기둥 위·그 안내 선 위,
  `refineFace`가 `null`이면 그대로, 화면 격자에서 바뀐 자리는 모두 그 교차, 누운 구멍, 보통 거리 15에서 칸을 뚫는 자리 둘레는 0.33.0 그대로.
  화소·값 회귀의 `hole-measure-near`(새 장면·값 — 0.33.0은 건너뛴다)·`hole-measure-normal`(0.33.0과 같다)
- 비용: 앱 `refineFace`를 부르는 횟수가 아주 가까이 본 자리에서 는다(미리 보기 한 번에 6번 한도 안 — 커서 아래 큰 평면 삼각형(판 윗면 등)도 처짐 한도 안이면 묻는다. 앱은 평면이면 `null`).
  위 장면에서 M을 지나 안내 선을 따라 400자리를 세 번(1,200번) 옮기면 앱 호출이 거리 1 활꼴·칸을 뚫음에서 0 → 1번, 옆 15에서 2 → 4번(판 윗면 — 받는 점은 같다)이고,
  미리 보기 한 번(가짜 WebGL 그리기 포함)은 0.09~0.25 ms → 0.14~0.27 ms다(load average 9~14, 두 번씩 — 흔들림 안)

### 남은 한계

- 중간 거리: 선이 칸을 뚫는 자리가 커서에서 붙잡기 거리 밖인데 커서 쪽 활꼴이 붙잡기 거리보다 얇으면(위 장면의 거리 4 — 뚫는 자리 20화소, 활꼴 0.03 < 0.048) 0.33.0 그대로 붙지 않는다.
  같은 꼴은 보통 거리에서 칸을 아주 얕게 뚫거나 칸에 반 화소 안으로 붙어 지나는 선에도 있다(위 탐색의 보통 거리에서 이 조건을 빼면 4,056곳 가운데 126곳이 원기둥 위 교차로 바뀐다 —
  모두 맞는 교차였지만 보통 거리를 0.33.0 그대로 두려고 넣지 않았다)
- 선과 꺾은선 토막의 열린 교차(0.20.0 `refine` — `'axisEdge'`, `open`)도 같은 붙잡기 거리의 세계 길이로 거른다. 곡선 평면 안에서 지나는 선은 그 틈이 화면과 나란해 대개 문제가 없어 바꾸지 않았다

### 한 칸을 나눈 두 삼각형과 두 번 스치는 안내 선(STEP 37차 선택 요청 — 설계 보강, 바꾸지 않았다)

- 0.33.0 설계(같은 평면 이웃을 칸으로 묶어 그 이웃의 다른 두 변에서도 변 법선을 본다)를 그대로 넣고 전체 시험을 돌리면 0.24.0 시험 하나가 깨진다:
  두 교차가 칸의 두 삼각형에 하나씩 나뉜 자리(높이 3)에서도 한쪽 삼각형에 둘째 힌트를 더한다(받는 점은 그대로 — 다른 삼각형 쪽 교차는 그 삼각형 밖이라 버리지만 앱 호출이 는다).
  칸 전체로 보면 곡면이 선과 나란해지는 자리가 그 칸 안이라는 것만 알 뿐, 두 교차가 다 그 삼각형 위인지는 모르기 때문이다. STEP 재현(칸과 나란한 선의 두 교차가
  칸 아래쪽 한 삼각형에 다 든 자리)은 그 삼각형의 휘는 변과 같은 평면 이웃의 휘는 변이 부호가 갈려 둘째 힌트를 얻는 꼴이다(코어 시험으로는 아직 옮기지 않았다)
- 보강할 것: 칸의 두 휘는 변의 변 법선 내적(d₀ > 0 > d₁)으로 나란해지는 자리를 칸 안에서 어림하고(두 변 사이 λ = d₀ / (d₀ − d₁)), 변 법선으로 곡면 높이를
  두 번 적분해(이차식) 선 높이와 만나는 두 자리를 어림해 둘 다 그 삼각형 위일 때만 둘째 힌트를 둔다. 아니면 0.33.0 그대로(삼각형 하나의 판정)다.
  넣을 때는 0.24.0 시험(높이 9 둘째 힌트, 높이 3 둘째 힌트 없음)과 STEP 재현(칸 아래 삼각형에 두 교차)을 함께 맞추고, 화소·값 회귀(`globe-measure-face-open` 등)의 앱 호출 수를 견준다

### 앱이 할 일

- NC: 코어를 0.34.0(이번 판은 태그 없이 main 병합 커밋)으로 올린다. 할 일은 없다 — 판재 구멍 안 아주 가까이 본 벽에서 안내 선·축이 벽을 비켜 가거나 뚫는 교차가
  원기둥 위로 붙는다(`refineFaceSnap`이 이미 그 열린 후보를 푼다). 35차 탐색(`near.probe`)을 다시 돌려 두 교차 둘레가 면 위 만나는 점으로 바뀌는지 본다
- STEP: 코어를 0.34.0으로 올린다. 할 일은 없다(원기둥 옆면 칸을 아주 가까이 본 자리에서도 같다)
- SKP: 코어를 0.34.0으로 올린다. 할 일은 없다
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.35.0: 아주 가까이 본 꺾은선 활꼴의 열린 교차·한 칸을 나눈 두 삼각형 위를 두 번 스치는 선의 둘째 교차

새 API·선택은 없다. 새 순수 함수는 `cursorInLens`(`opencad-viewer3d/track` — 커서 광선이 토막의 활꼴 쪽을 지나는지)다. 바뀐 기본 동작은 둘이고 모두 앱이 다듬기를 준 열린 교차에서만이다:
`refine`을 주고 열린 교차를 켠 앱(첫 점 축 `axisEdges`·끌어온 축·잠근 선 `lockEdges`·안내 선 `meets: { open }`)에서 아주 가까이 확대한 꺾은선 활꼴 둘레,
`refineFace`를 주고 면의 열린 교차를 켠 앱에서 칸 하나에 두 교차가 다 든 삼각형의 둘째 교차가 붙는다. 그 밖의 그림·고르기·측정은 0.34.0과 같다
(`npm run pixels -- --base v0.33.0 --timeout 900`: 0.33.0으로도 찍을 수 있는 장면 131개·값 93묶음 모두 같음. 0.34.0 새 장면·값 `hole-measure-near`와 0.35.0 새 값
`ring12-measure-lens`·`lowcyl-measure-twice`는 0.33.0에 없는 동작이라 건너뛰고 head에서 두 번 찍어 같았다 — 304초, load average 3~11. `--base` 0.34.0 main으로 `hole-`·`apex-`만 돌리면
`hole-measure-near` 장면·값과 `apex-measure-ends` 값 모두 같다. 960 × 600 화소 회귀의 NC 23차 재현 확대는 1화소가 시험보다 조금 커서 바뀌는 단이 없다).

34차(0.34.0) 남은 일 두 가지 — 꺾은선 토막의 열린 교차에도 붙잡기 거리의 세계 길이로 거르는 셈이 있는데 아주 가까이 확대하면 빠지는지, STEP 37차 선택 요청
(원기둥 옆면 칸을 나눈 한 삼각형 위를 안내 선이 두 번 스치면 무게중심 쪽 교점만 붙는다)의 보강 — 을 했다. 거리 4에서 칸을 뚫고 커서 쪽 활꼴이 얇은 자리(0.34.0 남은 한계)는 그대로 둔다.

### 원인 1 — 꺾은선 토막의 열린 교차(단계마다 남은 후보 수)

NC 23차 재현(반지름 25 원호 33토막, 꼭대기를 스치는 첫 점 X축 y = 25 − 0.001 — 꼭대기 토막 현과 축 사이 0.023)을 위에서(원근·평행 같음) 확대해 오른쪽 교차에서 (1, 2)화소를 가리켰다(0.34.0).

| 1화소 | 커서 둘레 선분 | 열린 교차 후보 | 붙은 것 |
|---:|---|---|---|
| 0.0005·0.001 | 0 — 현이 커서에서 23~46화소(붙잡기 거리 밖) | 0 | 축 위 커서 자리 |
| 0.002 | 1(꼭대기 토막) | 0 — 틈 0.023이 0.1 × 토막 길이(0.218) 안이지만 붙잡기 거리의 세계 길이(0.02)를 넘었다 | 축 위 커서 자리 |
| 0.004 | 1 | 2 | 원 위 교차(앱 호출 3번) |

0.34.0 면의 열린 교차와 같은 꼴이다. 틈은 활꼴 높이(세계 길이)로 정해지는데 거르는 셈은 화소로 정한 길이와 견주므로, 활꼴이 붙잡기 거리보다 두껍게 보일 만큼 확대하면 빠진다.
위에서 본 같은 평면 곡선은 그 틈이 화면에서 그대로 보이지만, 커서는 현과 선 사이 활꼴 안(곡선 위 교차 자리)에 있다. 판재 구멍 윗 테두리(반지름 5·20토막, 판 윗면 높이의 안내 선)도
위에서 거리 2·4(틈 0.032·0.052)에서 같은 자리에서 빠졌다(거리 1 이하는 테두리가 커서에서 붙잡기 거리 밖 — 벽의 면의 열린 교차(0.34.0)가 같은 점에 붙는다).

### 원인 2 — 한 칸을 나눈 두 삼각형 위를 두 번 스치는 선

원기둥 옆면 칸을 대각선으로 나누면 삼각형마다 휘는 변(이웃 칸과 함께 쓰는 세로 변)이 하나다. 0.24.0 둘째 힌트 판정은 삼각형 법선과 휘는 변 법선이 선 방향과 이루는 내적의 부호가
갈려야 하는데, 칸의 현과 나란한 선은 삼각형 법선과 내적이 0이고 휘는 변 하나의 부호만 얻는다. 두 교차가 한 삼각형에 다 들면(칸 아래·위 가장자리 둘레) 무게중심 쪽 교차 하나만 붙었다.
0.33.0 설계(같은 평면 이웃을 칸으로 묶어 이웃의 휘는 변도 본다)를 그대로 넣으면 두 교차가 칸의 두 삼각형에 나뉜 자리(0.24.0 시험 높이 3)에도 둘째 힌트를 더해(받는 점은 같고 앱 호출만 는다)
0.24.0 시험이 깨졌다(34차).

### 고친 것(`openEdgeCandidates`·`openFaceCandidates`)

- 꺾은선 활꼴: 선과 토막 사이가 붙잡기 거리의 세계 길이를 넘어도 커서가 그 토막의 활꼴 쪽이면 남긴다(`cursorInLens` — 현과 선 위 가장 가까운 점이 놓인 평면을 커서 광선이 맞는 자리가
  현 범위 안이고 현에서 선 쪽으로 `0.1 × 토막 길이` 안). 활꼴 높이 한도(`0.1 × 토막 길이`)·받는 규칙·호출 한도·기억·차례는 그대로다. 토막은 여전히 커서 둘레(화면에서 붙잡기 거리 안)여야 한다
- 칸 둘째 교차: 0.24.0 판정이 아니라고 보면 같은 평면 이웃(법선 사잇각 약 0.008° 안)과 묶은 칸에서 t의 휘는 변과 이웃의 휘는 변 가운데 가장 나란한 짝(사잇각 약 25° 안)을 고른다.
  두 변 법선 사이각 θ와 칸 너비 W로 원호(높이 4·W/2·tan(θ/4)·u(1 − u))를 어림하고 선 높이와 견줘 두 근을 구해, 두 근을 그 평면에 내린 발이 모두 그 삼각형 안일 때만 둘째 힌트를 둔다(`cellTwice`).
  나뉘면 0.24.0 그대로다

### 확인

- 넓은 탐색(가짜 WebGL, 0.34.0 main과 행 단위로 견줌):
  - 꺾은선 — NC 23차 재현(원근·평행 × 첫 점 높이 4 × 확대 7단), 구멍 윗 테두리(위·위 평행·구멍 안 아래 × 거리 6 × 틈 2 × 두 교차), 12토막 원(등각·확대 5단):
    16,612곳 가운데 1,930곳이 바뀌었고 모두 원·테두리 위 다듬은 교차였다(엉뚱한 자리 0). 테두리 장면의 1,278곳은 둘째 교차(칸), 120곳은 같은 점이 벽 면에서 테두리 토막으로 바뀐 것이다.
    확대가 덜한 단(NC 23차 재현 1화소 0.004 이상, 테두리 거리 8 이상, 12토막 원 1화소 0.1 이상·등각)은 그대로다
  - 칸 — 낮은 원기둥(반지름 30·높이 60·50토막, 높이 9 × 틈 3 × 거리 15·40·100)·구(24 × 12칸, ρ 3 × 경도 4 × 거리 40·120): 35,490곳 가운데 5,580곳이 모두 원기둥 위·그 축 위
    다듬은 교차(구 0곳, 칸의 두 삼각형에 나뉜 높이 30 등은 그대로)
  - 0.34.0 구멍 탐색 31,020곳은 그대로
- 시험: `tests/v0350edge.test.ts`(`cursorInLens`, 활꼴 쪽·현 반대쪽 커서, 12토막 원 1화소 0.05에서 두 교차가 원 위, 0.02는 그대로), `tests/v0350twice.test.ts`(칸 아래 삼각형에 두 근이 다 들면 둘째 힌트 둘·
  나뉘면 없음, 두 교차가 원기둥 위, 화면 격자). NC 23차 재현의 앞 1단(1화소 0.002)을 "틈이 붙잡기 거리보다 넓어 붙지 않는다"로 적은 0.23.0·0.33.0 시험 기대를 원 위 교차로 고쳤다
  (`tests/v0230.test.ts`·`tests/v0330ends.test.ts` — 붙는 점은 정확한 원 위 근). 0.24.0 시험(높이 9 둘째 힌트, 높이 3 없음)은 그대로 통과한다.
  화소·값 회귀 `ring12-measure-lens`·`lowcyl-measure-twice`(새 값 — 0.34.0까지 없는 동작이라 건너뛴다)
- 비용(가짜 WebGL, 두 교차를 지나 1,200번 옮김, load average 6~12에서 두 번씩): 12토막 원 1화소 0.05 미리 보기 한 번 0.044~0.12 → 0.055~0.14 ms·앱 `refine` 3 → 8번,
  낮은 원기둥 높이 5 0.074~0.12 → 0.10~0.15 ms·열린 `refineFace` 2 → 4번

### 남은 한계

- 꺾은선 활꼴: 현이 커서에서 붙잡기 거리 밖이면(커서 둘레 선분이 아니다) 그대로다 — NC 23차 재현 1화소 0.001 이하, 12토막 원 1화소 0.02 이하. 커서 둘레 선분을 화면 거리로 모으는 것은
  그대로 두었다(그 화면에 그려진 꺾은선이 커서에서 멀다)
- 칸 둘째 교차의 곡면 어림은 칸의 두 휘는 변 법선 사이를 원호로 본다(원기둥·구처럼 고르게 나눈 곡면). 두 휘는 변이 25°보다 더 기울거나 휘는 변이 없는 칸, 칸이 같은 평면 삼각형 둘이 아닌 나눔은 0.24.0 그대로다
- 거리 4에서 칸을 뚫고 커서 쪽 활꼴이 붙잡기 거리보다 얇은 자리(0.34.0)는 그대로다

### 앱이 할 일

- NC: 코어를 0.35.0(태그 없이 main 병합 커밋)으로 올린다. 할 일은 없다 — 원호 꼭대기를 스치는 축·안내 선을 아주 가까이 확대한 단(23차 재현의 1화소 0.002)과 판재 구멍 테두리를 가까이 본 자리에서
  곡선 위 교차가 붙는다. `measure-apex` 시험이 그 단을 "붙지 않는다"로 적었다면 고친다
- STEP: 코어를 0.35.0으로 올린다. 할 일은 없다 — `guideopen` 시험의 "한 삼각형 위 곡면 조각을 두 번 스치는 안내 선 — 다른 교점은 만나는 점이 아니다" 기대는 "붙는다"로 바꾼다(그 시험의 주석대로)
- SKP: 코어를 0.35.0으로 올린다. 할 일은 없다
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.36.0: 중간·보통 거리에서 칸을 얕게 뚫는 선의 면 위 만나는 점(NC 37차 요청)

새 API·선택은 없다. 면의 열린 교차(`refineFace`를 주고 축·잠근 선의 `axisFaces`·`lockFaces`나 안내 선의 `meets: { openFaces }`를 켠 앱)에서만 달라지고,
**보통 거리에서도 기본 동작이 바뀐다**: 선이 그물 칸을 얕게 뚫어 뚫는 자리(0.29.0 면의 만나는 점 — 코어 교차)가 커서에서 붙잡기 거리 밖이면, 그 칸 위 곡면 교차 둘레를 가리킬 때
앱이 준 곡면 위 교차에 붙는다(0.35.0은 안내 선·축 위 커서 자리). 그 밖의 그림·고르기·측정은 0.35.0과 같다
(`npm run pixels -- --base v0.33.0 --timeout 900`: 0.33.0으로도 찍을 수 있는 장면 131개·값 92묶음 같음, 값 `hole-measure-normal` 16자리 가운데 3자리(등각 60 활꼴 M−·옆 15 칸을 뚫음 M±의
격자 몇 칸)가 원기둥 위 다듬은 교차로 바뀜 — 의도한 변화, 302초, load average 4~8. `--base` 0.35.0 main으로 `hole-`·`ring12-`·`lowcyl-`·`apex-`만 돌리면 그 3자리 말고 모두 같다.
새 장면·값 `hole-measure-mid`는 0.35.0까지 없는 동작이라 건너뛰고 head에서 두 번 찍어 같았다).

NC 37차는 실제 판재 구멍 14개에서 벽을 뚫는 선의 두 교차 둘레 1,944곳을 세어 거리 1이면 1,752곳, 거리 3이면 1,270곳이 붙는다고 알렸다.
36차는 그 차이(약 480곳)를 0.34.0 README "남은 한계"의 중간 거리(칸을 뚫는 자리가 커서에서 붙잡기 거리 밖인데 커서 쪽 활꼴이 붙잡기 거리의 세계 길이보다 얇다)로 보고
아래 합성 장면으로 옮겼다.

**37차에 바로잡음**: 이 원인 설명은 실제 판재에는 맞지 않았다. NC 39차가 코어 0.36.0으로 같은 셈을 다시 돌리니 거리 3은 1,270곳 그대로였고,
남은 482곳은 눈이 맞은편 벽 너머인 작은 구멍 438곳(거리 2.5까지는 모두 붙는다)과 위쪽 구멍 바닥이 가리는 44곳이라 붙지 않는 것이 맞았다(정당한 가림).
0.36.0 고침이 다룬 것은 아래 합성 장면의 셋째 조건 몫(그 장면 거리 3·4에서 붙을 수 있는 자리의 40~49 %)이고, 실제 판재의 482곳은 그 몫이 아니다.

### 원인(실제 판재 꼴 구멍을 코어 시험으로 옮겨 단계마다 센 것)

장면: 반투명 판(600 × 400 × 18)에 세운 구멍 다섯(지름 10 깊이 12·20토막, 지름 5 깊이 10·16토막(선반 핀), 지름 8 관통·24토막, 지름 35 깊이 12.5·48토막(경첩 컵),
지름 15 깊이 3·32토막(아주 얕다))과 판 옆면에서 X 방향으로 누운 구멍 셋(지름 8 길이 30·16토막과 24토막, 지름 5 길이 12·12토막).
선은 끌어온 점 안내 선(기준 27°와 나란함)과 끌어온 점 축(세운 구멍은 X축, 누운 구멍은 Y축)이고 벽에서 반지름의 0.2·2·6·20 % 안쪽을 지난다.
두 교차 M± 둘레 9 × 9(2화소 칸)를 구멍 안에서 거리 1·2·3·4·8로 본다(눈이 구멍 안인 거리만). 붙을 수 있는 자리는 두 교차 가운데 하나가 커서에서 10화소 안인 곳이다.

| 거리 | 붙을 수 있는 자리 | 0.35.0 붙음 | 0.34.0 셋째 조건에서 빠짐(0.35.0) | 0.36.0 붙음 |
|---:|---:|---:|---:|---:|
| 1 | 9,352 | 8,302 | 526 | 9,120 |
| 2 | 9,371 | 7,381 | 1,437 | 9,088 |
| 3 | 9,391 | 5,054 | 3,801 | 8,886 |
| 4 | 9,420 | 4,066 | 4,638 | 8,913 |
| 8(세운 구멍만) | 3,559 | 1,344 | 945 | 2,249 |
| 모두 | 41,093 | 26,147 | 11,347 | 38,256 |

0.34.0은 선이 칸을 뚫어도 커서가 그 칸 위이고 뚫는 자리가 커서에서 붙잡기 거리 밖이면 열린 후보로 보되, 커서 광선에 가장 가까운 선 위 점이 그 칸 평면에서
붙잡기 거리의 세계 길이(10화소 × 1화소)보다 멀어야 한다는 셋째 조건을 두었다(보통 거리를 0.33.0 그대로 두려고). 활꼴 두께(칸과 원기둥 사이 — 반지름 5·20토막이면 0.06)는 세계 길이인데
견주는 길이는 거리에 비례하므로 거리 3·4면 붙을 수 있는 자리의 40~49 %가 그 조건에서 빠졌다(36차는 이것을 NC 37차의 거리 1·3 차이와 같은 꼴로 보았다 —
37차에 바로잡음: 실제 판재의 차이는 정당한 가림이었다, 위 문단).
둘째로, 누운 구멍 옆면 칸(구멍 길이 전체의 긴 띠)을 비스듬히 따라가는 안내 선은 뚫는 칸의 힌트(선 위에서 무게중심에 가장 가까운 점 — 0.22.0)가 칸을 따라 멀리 떨어져
다른 교차에 더 가까웠다. 앱은 힌트 둘레 근을 주므로 다른 근이 와서 받지 않았다(셋째 조건만 빼고 힌트를 그대로 두면 누운 구멍에서 1,168곳이 그래도 빠진다).

### 고친 것(`openFaceCandidates`)

- 셋째 조건을 뺐다: 선이 칸을 뚫어도 커서가 그 칸 위(`rayHitsTriangle`)이고 뚫는 자리가 화면에서 커서 붙잡기 거리 밖이면 열린 후보다(커서 쪽 활꼴 두께는 보지 않는다).
  받는 규칙(앱 점이 그 선 위·그 칸 위 곡면 조각 자리·커서에서 붙잡기 거리 안·가리지 않음 — `openFaceSnap`)은 그대로라 바뀌는 자리는 늘 앱이 준 곡면 위 교차다.
  뚫는 자리가 커서 붙잡기 거리 안이면 0.29.0 면의 만나는 점이 맡는 것도 그대로다
- 뚫는 칸의 힌트(`refineFace`의 `point`)는 뚫는 자리다(그 칸 안 — 선과 칸으로만 정해진다. `SnapRefineFaceInput.open`의 "선 위에서 그 삼각형에 가장 가까운 점"과 같다).
  그 칸 위 곡면 조각의 교차는 선이 그 칸을 뚫는 자리 옆 근이다. 두 번 지날지(0.24.0·0.35.0) 판정과 둘째 힌트, 비켜 가는 칸의 힌트(무게중심 쪽)는 그대로다
- 다듬기 기억 열쇠(`openRefineKey`)에 `open`을 넣었다(열린 후보면 끝에 `'#open'`, 닫힌 열쇠는 그대로). 뚫는 칸의 열린 후보 입력은 같은 선이 같은 칸을 뚫는 코어 `'axisFace'`
  입력과 `open` 말고 같을 수 있는데, open일 때 다른 길로 푸는 앱(NC `refineFaceSnap`은 open이면 높이 판정·계산 길이 다르다)은 먼저 물은 쪽 답이 다른 쪽에 쓰이면
  붙을 자리가 빠지거나 다른 길의 답이 쓰인다. 이제 따로 묻고 각자 제 답을 쓴다(`refine`의 `'axisEdge'`·0.15.0 열린 후보도 같은 열쇠 꼴)
- 호출 한도(미리 보기 한 번에 6번)·차례·값의 꼴은 그대로다

### 바뀐 기본 동작(보통 거리 몫)

- 위 장면의 보통 거리(맞춰 보기·위 30·등각 60·옆 15 — 두 교차 둘레 9 × 9, 41,472곳)에서 2,853곳이 안내 선·축 위 커서 자리에서 원기둥 위 다듬은 교차로 바뀌었다
  (위 30에서 1,204곳·등각 60 306곳·옆 15 1,343곳, 맞춰 보기 0)
- 0.34.0 구멍 탐색(31,020곳)의 보통 거리 4,056곳 가운데 126곳(34차가 "이 조건을 빼면"으로 적은 그 126곳 — 등각 60 활꼴 33곳, 위 30·등각 60·옆 15 칸을 뚫음 20·5·68곳),
  0.35.0 칸 탐색의 낮은 원기둥(반지름 30·50토막) 거리 100에서 3,404곳, 구(반지름 30·24 × 12칸) 거리 40·120에서 602·1,166곳(첫 점 축이 칸을 얕게 뚫는 자리)도 같은 꼴로 바뀌었다
- 꼴: 선이 칸과 거의 나란히 얕게 뚫어 그물을 뚫는 자리와 곡면을 뚫는 자리가 화면에서 붙잡기 거리보다 떨어진 자리다. 바뀐 자리는 모두 곡면 위·그 선 위 교차이고
  커서에서 붙잡기 거리 안이다(잃은 만나는 점·다른 만나는 점으로 바뀐 자리·엉뚱한 자리 0)

### 확인

- 넓은 탐색(가짜 WebGL, 0.35.0 main과 행 단위로 견줌): 위 구멍 장면 86,832곳(가까이 45,360·보통 41,472) 가운데 14,962곳, 0.34.0 구멍 탐색 31,020곳 가운데 504곳
  (두 교차 둘레 364·벽 격자 14·보통 거리 126), 0.35.0 칸 탐색 35,490곳 가운데 5,172곳이 바뀌었고 모두 안내 선·축 위 커서 자리였던 곳이 곡면 위·그 선 위 다듬은 교차로 바뀐 것이다
  (잃은 자리·엉뚱한 자리 0). 0.35.0 꺾은선 탐색 16,612곳은 그대로다
- 시험(`tests/v0360pierce.test.ts`): 순수 후보(거리 3에서 셋째 조건에 걸리던 자리가 후보이고 힌트가 뚫는 자리, 누운 구멍 칸을 따라가는 선의 힌트가 그 칸 위 근에 가깝다),
  세운 구멍 δ 0.03·0.1·0.3 × 거리 1·2·3·4·8 × 두 교차와 누운 구멍 δ 0.24 × 거리 1~4가 원기둥 위·그 안내 선 위, 보통 거리(옆 15·위 30) 화면 격자의 다듬은 면 점이 모두 원기둥 위.
  "보통 거리 15에서 칸을 뚫는 자리 둘레는 0.33.0 그대로"로 적은 0.34.0 시험(`tests/v0340hole.test.ts`) 기대를 원기둥 위 교차로 고쳤다. 새·고친 시험 여섯은 0.35.0 src로 돌리면 모두 실패한다.
  open일 때와 아닐 때 다른 답을 주는 앱(닫힌 `'axisFace'`는 코어 점 그대로, 열린 후보는 원기둥 위 근)으로 뚫는 자리 둘레와 곡면 위 교차 둘레를 두 차례로 가리켜 각자 제 답을 쓰는지,
  `openRefineKey`의 `'#open'`도 본다(열쇠에 `open`을 넣기 전 src로 돌리면 실패한다).
  화소·값 회귀 `hole-measure-mid`(새 장면·값 — 거리 3·4·8과 누운 구멍)
- 비용(가짜 WebGL, 교차를 지나 선을 따라 400자리를 세 번 옮김, load average 4~8에서 두 번 넘게): 미리 보기 한 번 세운 구멍 거리 3 안내 선 0.19~0.33 → 0.20~0.38 ms(앱 호출 열린 1·닫힌 1번 그대로),
  축 거리 4 0.16~0.19 → 0.18~0.22 ms(2·1번 그대로), 누운 구멍 거리 3 0.21~0.24 → 0.28~0.31 ms(2번 그대로), 보통 거리 옆 15 0.28~0.31 → 0.32~0.37 ms(4·1번 그대로),
  누운 구멍 위 30 0.26~0.29 → 0.32~0.33 ms(3·1 → 5·1번). 처음 400자리에서 면 위 만나는 점은 26 → 130, 0 → 68, 0 → 130, 119 → 165, 0 → 87곳.
  위 구멍 장면 탐색 전체(816경우 — 경우마다 새 뷰어·새 기억)의 앱 호출은 0.35.0 열린 2,338·닫힌 1,365번 → 2,813·1,371번이다(열쇠에 `open`을 넣기 전에는 2,744·1,266번 —
  그때는 거리 3 안내 선 0·1번, 옆 15 3·1번으로 같은 입력의 답을 함께 썼다). `open`을 넣어도 붙는 자리·값은 같다(행 단위·화소 값 모두)

### 남은 한계

- 누운 작은 구멍(지름 5·12토막) 옆면 칸을 따라가는 안내 선이 칸을 뚫지 않고 활꼴만 지나면 힌트(무게중심 쪽)가 다른 교차에 가까워 붙지 않는다(위 탐색 487곳).
  비켜 가는 칸의 힌트는 이웃과 가르지 못하는 테두리를 피하려고 무게중심 쪽에 두었다(0.22.0) — 선을 따라 긴 칸이면 칸 안에서 선이 칸에 가장 가까운 자리를 쓰는 보강이 남았다
- 얕은 구멍(깊이 3)을 거리 8에서 보면 눈이 판 위로 나가 앱 점이 그 칸에 가린 것으로 보고 받지 않는다(0.23.0 제 조각 가림 — 위 탐색에서 그 구멍의 못 붙은 1,333곳 가운데 1,168곳이 거리 8)
- 꺾은선 토막의 열린 교차는 바꾸지 않았다. 현이 커서에서 붙잡기 거리 밖인 확대(35차 남은 일)와, 선이 현을 가로지르는 자리가 곡선 위 교차에서 붙잡기 거리보다 먼 확대(면의 0.34.0 pierced와 같은 꼴)는
  그대로다 — 아래 "남은 일"

### 앱이 할 일

- NC: 코어를 0.36.0(태그 없이 main 병합 커밋)으로 올린다. 할 일은 없다 — 중간 거리(위 합성 장면의 거리 3·4 등)에서 칸을 뚫는 선의 두 교차 둘레가 원기둥 위로 붙는다.
  37차 탐색(`near.probe`)을 다시 돌려 거리 3의 두 교차 둘레가 거리 1과 비슷해지는지, 보통 거리에서 바뀐 자리가 모두 곡면 위 교차인지 본다. 보통 거리에서 칸을 얕게 뚫는 자리가
  안내 선 위 커서 자리라고 적은 시험이 있으면 원기둥 위 교차로 고친다
  (37차에 바로잡음: NC 39차가 다시 돌리니 실제 판재 거리 3은 1,270곳 그대로였다 — 남은 482곳은 정당한 가림이라 거리 1과 비슷해지지 않는 것이 맞다, 위 "37차에 바로잡음")
- STEP·SKP: 코어를 0.36.0으로 올린다. 할 일은 없다 — `refineFace`·`refine`이 `open`일 때 다른 길로 풀어도 코어가 따로 묻는다(기억 열쇠에 `open`).
  축·안내 선이 원기둥·구를 얕게 뚫는 자리를 보통 거리에서 가리킨 시험 기대가 축·안내 선 위 커서 자리면 곡면 위 교차로 바뀐다.
  앱 다듬기 함수의 호출 수를 센 시험이 있으면 뚫는 칸 둘레에서 한 번 더 불릴 수 있다(같은 입력이라도 `open`이 다르면 따로)
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.37.0: 칸을 얕게 뚫는 선의 면 위 만나는 점을 앱 곡면 교점으로(STEP 42차 요청)·긴 칸을 따라가는 안내 선의 면의 열린 교차

새 API·선택은 없다. 새 순수 함수는 `acceptFacePatch`(`opencad-viewer3d/track` — 닫힌 면 교차 다듬기의 넓힌 받기)다. 바뀐 기본 동작은 둘이고 모두 `refineFace`를 준 앱에서만이다:
축·잠근 선(`axisFaces`·`lockFaces`)과 끌어온 점 안내 선(`trackDirs { meets }`)이 그물 칸을 얕게 뚫는 코어 교차 둘레를 가리키면 앱이 준 곡면 위 교점에 붙고(0.36.0은 현 위 코어 점 그대로 "면 위"),
긴 칸을 따라가는 안내 선(누운 작은 구멍 옆면 등)의 면의 열린 교차가 붙는다(0.36.0은 안내 선 위 커서 자리). 둘 다 보통 거리에서도 바뀐다. 그 밖의 그림·고르기·측정은 0.36.0과 같다
(화소·값 회귀는 아래 "확인").

STEP 42차는 낮은 원기둥(반지름 30·50토막)을 칸 반각의 1.1~4.4배로 스치는 안내 선 겨눈 훑기 20,400자리 가운데 642자리에서, 안내 선이 이웃 칸을 얕게 뚫는 자리(0.29.0 면의 만나는 점 —
코어 교차)가 커서에서 붙잡기 거리 안이면 코어가 그 뚫는 점(현 위)에 "· 면 위"로 붙고 앱 `refineFace`가 같은 입력에 정확히 준 곡면 위 교점은 받지 않는다고 알렸다
(그 점들은 곡면·곡선에서 반지름 방향으로 0.002~0.054 mm 안쪽 현 위 — 0.35.0·0.36.0 같음).

### 원인 1 — 닫힌 면 교차의 받는 거리(STEP 42차 꼴을 코어 시험으로 옮겨 단계마다 센 것)

0.19.0 다듬기(열린 후보가 아닌 `'axisFace'`)는 앱 점을 선 위로 내린 자리가 **코어 점에서** 화면 붙잡기 거리 안일 때만 받았다(0.14.0 `acceptRefined` — 앱이 엉뚱한 점을 주어도
표식이 커서에서 튀지 않게). 선이 칸을 얕게 뚫으면 그물을 뚫는 자리 X와 곡면을 뚫는 자리 Q가 선을 따라 (처짐 ÷ 사잇각의 사인)만큼 떨어진다. X가 커서에서 붙잡기 거리 밖이면
0.34.0·0.36.0의 열린 후보(뚫는 칸)가 Q를 커서 거리로 받지만, X가 안이면 코어 교차가 골라지고 Q는 X에서의 거리로 견줘 버려졌다 — 커서가 X와 Q 사이면 Q가 커서에서
붙잡기 거리 안이어도 붙지 않았다.

| 장면(Q 둘레 11 × 11, 2화소 칸) | 자리 | 0.36.0 다듬지 않은 면 위 만나는 점(모두 화면 \|X − Q\| 10~20화소) | 그 가운데 Q가 커서에서 붙잡기 거리 안·그 칸 위 | 0.37.0 남음 |
|---|---:|---:|---:|---:|
| 낮은 원기둥 바깥 거리 15 안내 선(칸 반각 1.1~4.4배 × 높이 5 × 두 근) | 6,050 | 408 | 268(뚫은 삼각형 251·같은 평면 짝 17) | 140 |
| 같은 자리 첫 점 X축 | 6,050 | 408 | 268 | 140 |
| 구(반지름 30·24 × 12칸) 바깥 거리 15·40·120 | 8,712 | 279 | 76 | 203 |
| 세운 구멍(반지름 5·20토막) 안 거리 1~8 | 3,630 | 98 | 58 | 40 |
| 판 위 기둥(반지름 5·20토막) 바깥 거리 5·15·40 | 5,808 | 143 | 91 | 52 |

남은 자리는 Q가 커서에서 붙잡기 거리 밖(커서가 X 쪽)이거나, 구에서 Q가 두 칸이 함께 쓰는 휘는 변 위(두 칸 평면에 내린 발이 모두 칸 밖인 쐐기)인 자리다(아래 "남은 한계").
받는 거리·호출 한도·기억·차례에는 닿기 전에 빠졌다(앱 호출은 이미 있었다 — 받지 않았을 뿐이다).

### 원인 2 — 긴 칸의 같은 평면 짝 위 곡면을 지나는 안내 선(36차 남은 한계)

판의 누운 작은 구멍(반지름 2.5·길이 12·12토막 — 꼭대기가 꼭짓점이라 꼭대기 양옆 칸이 구멍 길이 전체의 긴 띠이고 대각선이 칸을 따라 길다)을 꼭대기 아래 0.15(반지름의 6 %)로
지나는 안내 선은 칸의 한 삼각형(B)을 뚫고 커서 아래 다른 삼각형(A) 위 곡면을 지나 원기둥을 뚫는다. A는 비켜 가는 삼각형이라 힌트가 무게중심 쪽 자리(선 위에서 A 무게중심에
가장 가까운 점 — 0.22.0)인데, A의 무게중심(x 4)이 선이 A 위를 지나는 자리(x 7.5~8.5)에서 칸을 따라 3 mm쯤 떨어져 힌트가 다른 근에 더 가까웠다(앱은 힌트 둘레 근을 준다).
뚫는 B는 커서가 그 위가 아니라 0.34.0 뚫는 칸 후보가 아니다. 판재 꼴 탐색에서 그 구멍의 그 안내 선은 거리 1~4 두 근 둘레 8화소 안 376곳이 모두 안내 선 위 커서 자리였다.

### 고친 것(`acceptFacePatch`·`openFaceCandidates`)

- 닫힌 면 교차의 넓힌 받기: 축·안내 선·잠근 선의 면 교차(0.18.0 `axisFaceSnap`·0.19.0 `lockFaceSnap`·0.29.0 면의 만나는 점)를 다듬은 앱 점이 코어 점에서 붙잡기 거리 밖이면,
  열린 면 교차(0.22.0 `openFaceSnap`)와 같은 규칙으로 한 번 더 본다 — 앱 점을 선 위로 내린 자리가 그 칸 위 곡면 조각 자리(뚫은 삼각형이나 한 칸을 나눈 같은 평면 짝에 내린 발이 그 안,
  평면에서 0.1 × 가장 긴 변 안)이고 **커서에서** 붙잡기 거리 안이며 가리지 않으면(열린 면 교차와 같은 가림 — 오목한 곡면은 제 조각 가림, 0.23.0) 받는다. 같은 평면 짝 위면 `face`가 그 삼각형이다.
  이웃 칸 위 교차는 받지 않는다(그 칸의 열린 교차가 맡는다). 앱이 `null`이면(평면 등) 코어 교차 그대로다. 앱 호출·기억 열쇠는 그대로다(이미 부르던 닫힌 `'axisFace'` 답을 받는 규칙만 넓혔다)
- 비켜 가는 삼각형의 힌트: 무게중심 쪽 자리가 선에서 그 삼각형 위 곡면 조각 자리인 조각(화소 허용치 없이 — 0.24.0 둘째 힌트의 조각과 같다) 밖이면 힌트는 그 조각의 가운데다
  (칸 안에서 선이 지나는 자리 — 그 삼각형 위 교차는 그 조각 안이다). 조각 안이면 0.22.0 그대로다(이웃과 가르지 못하는 테두리는 쓰지 않는다). 커서와 상관없이 선과 삼각형으로만 정해진다
- 받는 규칙(열린 후보)·호출 한도(미리 보기 한 번에 6번)·차례·값의 꼴은 그대로다

### 바뀐 기본 동작(보통 거리 몫)

- 아래 넓은 탐색의 보통 거리(맞춰 보기·옆 15·위 30·등각 60, 바깥 거리 40·100·120 등 — 130,333곳)에서 2,000곳이 바뀌었다: 다듬지 않은 면 위 만나는 점 → 곡면 위 다듬은 교차 822곳
  (구 148·0.34.0 구멍 탐색 보통 거리 222·0.35.0 구 칸 43·판재 구멍 409), 안내 선 위 커서 자리 → 곡면 위 다듬은 교차 1,040곳(누운 구멍 618·판재 누운 구멍 422),
  같은 교차에 붙은 삼각형 번호만 같은 칸의 다른 삼각형으로 138곳(옮김 0)
- 꼴: 선이 칸과 거의 나란히 얕게 뚫어 그물을 뚫는 자리와 곡면을 뚫는 자리가 화면에서 붙잡기 거리보다 떨어진 자리, 긴 칸을 따라가는 안내 선이 그 칸 위 곡면을 지나는 자리다.
  바뀐 자리는 모두 곡면 위·그 선 위 교차이고 커서에서 붙잡기 거리 안이다(잃은 만나는 점·다른 만나는 점으로 바뀐 자리·엉뚱한 자리 0)

### 확인

- 넓은 탐색(가짜 WebGL, 경우마다 새 뷰어·새 기억, 0.36.0 main과 행 단위로 견줌 — 271,138곳): 34~36차 꼴(0.34.0 구멍·0.35.0 칸·꺾은선·0.36.0 판재 구멍 여덟 개)과 이번 재현
  (낮은 원기둥·구·세운 구멍·누운 구멍·기둥 — Q 둘레와 X 둘레) 가운데 5,880곳이 바뀌었다: 다듬지 않은 면 위 만나는 점 → 곡면 위·그 선 위 다듬은 교차 3,060곳,
  안내 선 위 커서 자리 → 곡면 위·그 선 위 다듬은 교차 2,682곳, 같은 교차의 삼각형 번호만 같은 칸의 짝으로 138곳. 잃은 자리·엉뚱한 자리 0. 꺾은선 탐색(NC 23차 원호·구멍 윗 테두리·12토막 원)과
  0.35.0 낮은 원기둥 칸 탐색, 0.34.0 세운 구멍 벽 격자는 그대로다
- 시험(`tests/v0370shallow.test.ts`): 순수 `acceptFacePatch`(받는 자리·같은 평면 짝·커서에서 멀면·선 밖·다른 근·같은 평면이 아닌 이웃)와 `openFaceCandidates`(긴 칸의 힌트 — 0.36.0 힌트는 다른 근),
  뷰어로 낮은 원기둥 바깥 거리 15의 안내 선·첫 점 X축·잠근 X축, 세운 구멍 안(오목), 같은 평면 짝 위 교점의 `face`, `refineFace`가 `null`이면 그대로, Q 둘레 화면 격자의 남은 다듬지 않은 점은
  모두 Q가 커서에서 붙잡기 거리 밖, 누운 작은 구멍 거리 1~4의 M± 둘레
- 화소·값 회귀: `npm run pixels -- --base v0.33.0 --timeout 900` — 0.33.0으로도 찍을 수 있는 장면 131개·값 92묶음 같음, 값 `hole-measure-normal`은 0.36.0이 바꾼 3자리
  그대로(16자리 가운데 3), 새 장면 3개·새 값 6묶음(0.34.0~0.37.0 동작이라 건너뛰고 head에서 두 번 찍어 같음 — 0.37.0 새 장면·값 `lowcyl-measure-shallow`·`lying12-measure-cell` 포함),
  714초(load average 30~80). `--base d0cee96`(0.36.0 main)으로는 장면 133개·값 97묶음이 모두 같고(34~36차 새 장면·값 `hole-measure-near`·`hole-measure-mid`·`ring12-measure-lens`·
  `lowcyl-measure-twice`와 `hole-measure-normal` 포함) 새 장면 1개·새 값 2묶음(0.37.0)만 새로 찍었다(head에서 두 번 찍어 같음, 1,544초, load average 30~160)
- 비용(가짜 WebGL, 교차를 지나 선을 따라 400자리를 세 번 옮김 — main d0cee96과 작업 트리를 번갈아 세 짝, load average 15~140이라 흔들림이 크다): 부하가 비슷했던 짝
  (load average 17~27)에서 미리 보기 한 번 낮은 원기둥 바깥 거리 15 안내 선 0.17~0.33 → 0.26~0.49 ms, 거리 40 0.18~0.22 → 0.20~0.31 ms, 세운 구멍 안 거리 2 0.20~0.26 → 0.20~0.34 ms,
  옆 15 0.28~0.32 → 0.31~0.39 ms, 누운 작은 구멍 거리 3 0.35~0.66 → 0.40~0.63 ms(차례를 바꾼 짝은 둘 다 부하로 0.8~4.9 ms — 흔들림 안). 앱 호출 수는 모든 경우 같다
  (열린 1·4·1·6·3번, 닫힌 1·1·0·1·1번 — 넓힌 받기는 이미 부른 닫힌 답을 받는다). 처음 400자리의 다듬은 면 위 만나는 점은 거리 15에서 42 → 80, 옆 15에서 39 → 77곳이다.
  넓은 탐색 전체(2,142경우 — 경우마다 새 뷰어·새 기억)의 앱 호출은 닫힌 12,839번 그대로, 열린 5,166 → 5,212번(바뀐 힌트의 삼각형에서 새로 묻는다)

### 남은 한계

- 커서가 그물을 뚫는 자리 X 쪽이라 곡면 교점 Q가 커서에서 붙잡기 거리 밖이면 코어 교차(현 위) 그대로 "면 위"다(위 탐색의 X 둘레 격자 등 13,829곳, 그 가운데 보통 거리 2,207곳 —
  0.36.0은 16,889곳·3,029곳). 받는 점은 커서 붙잡기 거리 안이라는 규칙(모든 붙잡기와 같다)을 그대로 두었다. "면 위"를 떼는 길(앱이 곡면 교점을 줬는데 받지 못한 면 교차는
  내지 않기)은 그 자리를 안내 선 위 커서 자리로 바꿔 만나는 점을 잃으므로 기본 동작으로는 넣지 않았다 — 앱이 고르는 선택으로 둘 만하다
- 구처럼 이웃 칸 사이 굽은 각이 큰 그물에서 Q가 두 칸이 함께 쓰는 휘는 변 위(두 칸 평면에 내린 발이 모두 그 칸 밖인 쐐기)면 어느 칸 조각 자리로도 보지 않아 받지 않는다
  (열린 면 교차도 0.22.0부터 같다 — 위 구 경우의 남은 자리 대부분)
- 꺾은선 토막과 만나는 닫힌 교차(`refine` — `'axisEdge'`)는 바꾸지 않았다. 선이 현을 얕게 가로지르면 같은 꼴(현 위 코어 교차 그대로)이 있을 수 있다. 아주 가까이 확대한 꺾은선 토막의 열린 교차
  (36차 "남은 일"의 설계)도 그대로다

### 앱이 할 일

- NC: 코어를 0.37.0(태그 없이 main 병합 커밋)으로 올린다. 할 일은 없다 — 판재 구멍 벽을 칸과 거의 나란히 얕게 뚫는 안내 선·축의 곡면 교차 둘레와 누운 작은 구멍 옆면의 긴 칸을 따라가는
  안내 선이 원기둥 위로 붙는다. 그런 자리를 안내 선 위 커서 자리·현 위 "면 위"로 적은 시험이 있으면 원기둥 위 교차로 고친다
- STEP: 코어를 0.37.0으로 올린다. 할 일은 없다 — 42차 겨눈 훑기의 642자리 가운데 Q가 커서에서 붙잡기 거리 안인 자리가 곡면 위 교점("· 면 위", 다듬음)으로 바뀐다. 다시 훑어
  남은 자리가 모두 Q가 커서에서 붙잡기 거리 밖인지 본다(남으면 그 자리의 X·Q·커서 화면 자리를 알려 주면 코어 시험으로 옮긴다). 같은 교차에서 `face.index`가 같은 칸의 다른 삼각형으로 바뀔 수 있다
- SKP: 코어를 0.37.0으로 올린다. 할 일은 없다
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.38.0: pointsFor에 측정 첫 점·첫 점으로 정하는 기억·접점 붙잡기 종류(STEP 43차 요청)·현을 얕게 가로지르는 선의 곡선 교점·장면을 올린 뒤 앱이 주는 무늬(SKP 36차 요청)

새 API·선택은 넷이다: `pointsFor`의 둘째 인자(`PointsForContext` — 측정 첫 점)와 `pointsForFirst`(기본 꺼짐), `clearMeasurePointsFor()`, `SnapKind`의 `'tangent'`,
`Texture3d.pending`(그 무늬를 `restoreTexture`로 나중에 준다). 새 순수 함수는 `acceptEdgePatch`(`opencad-viewer3d/track` — 결과 타입 `EdgePatchAccept`)·`sameFirst`(`opencad-viewer3d/snap`)다.
바뀐 기본 동작은 하나이고 `refine`을 준 앱에서만이다: 축·끌어온 축·잠근 선·끌어온 점 안내 선이 꺾은선 토막(현)을 얕게 가로지르는 자리 둘레를 가리키면
앱이 준 곡선 위 교점에 붙는다(0.37.0은 현 위 코어 점 그대로 "모서리 위"). 그 밖의 그림·고르기·측정은 0.37.0과 같다(화소·값 회귀는 아래 "확인").

### pointsFor의 측정 첫 점(`pointsFor(pick, ctx)`·`pointsForFirst`)

STEP 43차는 측정 첫 점에서 곡선 모서리에 그은 접선이 닿는 점(접점)을 앱 점 `pointsFor`로 준다. 코어는 바로 앞과 같은 고르기면 `pointsFor` 결과를 다시 쓰므로(0.10.0 —
같은 자리 미리 보기 뒤 누르기) 첫 점이 바뀌어도 같은 고르기에서는 앞 첫 점의 접점이 남았다. 기억을 비우는 길은 `setMeasureSnap`뿐이라 그러면 잠금·끌어온 점이 풀려,
앱은 첫 점이 바뀔 때마다 세대를 올려 `SnapPoint.order = −세대`·`setMeasureSnapLimit(1 − 세대)`로 앞 세대 접점을 걸렀다.

- 코어는 `pointsFor`에 둘째 인자 `ctx = { first }`를 늘 넘긴다. `first`는 측정 첫 점(첫 점만 찍었을 때 그 세계 점의 복사본 — 추론 붙잡기의 첫 점과 같다), 아니면 `null`이다.
  인자 하나로 적은 앱 함수는 그대로이고, 앱이 직접 부르는 시험(`o.pointsFor!(pick)`)도 컴파일된다(타입은 선택 인자)
- `pointsForFirst: true`(기본 꺼짐)면 기억 열쇠에 첫 점이 든다(좌표 값으로 견준다 — `sameFirst`). 첫 점을 찍거나 지우면(두 점째·Esc·측정 지우기) 같은 고르기에서도
  다시 부르고, 같은 첫 점·같은 고르기면 예전처럼 다시 쓴다. 끄면 0.37.0과 같다(부른 횟수도 같다 — 아래 "확인")
- 설계 근거: (1) 첫 점은 코어가 이미 가진 상태라 앱이 따로 들고 있다 맞추지 않아도 되고, 기억이 저절로 맞는다. (2) 기본으로 열쇠에 넣으면 고른 것으로만 정해지는 앱 함수
  (NC 이동·판재 요소 등)가 첫 점을 찍을 때마다 같은 자리에서 한 번 더 불려 호출 수가 바뀌므로 선택으로 둔다. (3) 기억만 비우는 API(아래)는 첫 점이 아닌 앱 자료가 바뀔 때 쓴다

```ts
viewer.setMeasureSnap({
  points: centers,
  pointsFor: (pick, ctx) => edgeSnapPoints(pick, ctx?.first ?? null), // 첫 점이 있으면 접점도
  pointsForFirst: true,
  inference: MEASURE_INFERENCE,
});
```

### pointsFor 기억만 비우기(`clearMeasurePointsFor`)

- `clearMeasurePointsFor()`는 `pointsFor` 기억(바로 앞 고르기와 결과)만 잊고, 측정 미리 보기가 보이면 그 자리에서 다시 구한다(그때 앱 함수를 다시 부른다).
  찍은 점·잠금·끌어온 점·나란함 기준 선분·붙잡기 선택·한도·다듬기 기억(`clearMeasureRefine`)은 그대로다. 비운 기억이 있었으면 `true`, 없었거나 붙잡기가 꺼져 있으면 `false`
- 앱 점을 정하는 앱 자료를 나중에 받았을 때(곡선 계산 조각을 나눠 받기 등) `setMeasureSnap`을 다시 주지 않고 쓴다

### 접점 붙잡기 종류(`SnapKind` `'tangent'`)

- 앱 점(`points`·`pointsFor`)에 `kind: 'tangent'`를 달면 미리 보기(`measureHoverSnap.snap`)·찍은 결과(`snapA`·`snapB`)·`measurePoints`에 그대로 실린다.
  코어는 접점을 구하지 않는다(곡선 정의는 앱이 안다)
- 표식은 동그라미 테(반지름 6화소)와 그 꼭대기에 닿는 가로선(양옆 10화소 — AutoCAD 접점 표식 꼴), 바탕 테 위 측정 색이다. 점은 동그라미 가운데다
- 머무르기로 끌어올 수 있는 점 붙잡기이고(0.16.0), 다듬기(`refine`)에 넘기지 않으며(앱이 준 점), 차례는 다른 앱 점과 같다(화면에서 가까운 것). 기존 종류의 그림·차례는 그대로다
- 코어 측정 거리 글(“거리 …”·ΔX ΔY ΔZ)에는 종류 이름이 없다 — 이름표(“접점”)는 앱이 상태 줄·측정 띠·글 꼴(`setMeasureFormat`)에서 `snapB === 'tangent'`로 붙인다.
  `SnapKind`가 늘었으므로 종류마다 이름을 고르는 앱 `switch`는 `'tangent'`를 더한다(`default`가 있으면 컴파일은 그대로다).
  `Record<SnapKind, …>`처럼 모든 종류를 채워야 하는 표는 `'tangent'` 항목이 없으면 typecheck가 깨진다 — 올릴 때 한 줄씩 더한다

### 현을 얕게 가로지르는 선의 곡선 교점(`acceptEdgePatch` — 37차 남은 꼴)

0.18.0 다듬기(열린 후보가 아닌 `'axisEdge'`)는 앱 점을 선 위로 내린 자리가 **코어 점에서** 화면 붙잡기 거리 안일 때만 받았다. 선이 현을 얕게 가로지르면 현과 만나는 자리 X와
곡선과 만나는 자리 Q가 선을 따라 (처짐 ÷ 사잇각의 사인)만큼 떨어진다. 커서가 X와 Q 사이면 Q가 커서에서 붙잡기 거리 안이어도 X에서 멀어 버려져 현 위 X 그대로였다
(0.37.0이 면 교차에서 고친 것과 같은 꼴). 합성 장면(꺾은선 원 반지름 30·50토막에 첫 점 X축이 칸 반각의 4.4배로 스친다)을 코어 시험으로 옮겨 그대로 재현했다.

- 닫힌 선분 교차(0.17.0 끌어온 축·0.18.0 첫 점 축·0.19.0 잠근 선·0.29.0 안내 선의 선분)를 다듬은 앱 점이 코어 점에서 붙잡기 거리 밖이면 열린 교차(0.23.0)와 같은 규칙으로
  한 번 더 본다 — 앱 점을 선 위로 내린 자리가 그 토막 곡선 조각 자리(현에 내린 자리가 토막 범위 안·토막 끝에서 반 화소 넘게·현에서 0.1 × 토막 길이 안)이고 **커서에서**
  붙잡기 거리 안이며 가리지 않으면 받는다. 선이 현을 가로질러 들어간 활꼴은 그 토막의 것이라 이웃 토막 활꼴 위 교차·다른 근은 받지 않는다
- 앱이 `null`이면 코어 교차 그대로다. 앱 호출·기억 열쇠·차례·값의 꼴은 그대로다(이미 부르던 닫힌 `'axisEdge'` 답을 받는 규칙만 넓혔다)

### 장면을 올린 뒤 앱이 주는 무늬(`Texture3d.pending` ↔ `restoreTexture`)

SKP 36차는 165 MB 표본에서 무늬 손질(색 바꾸기·알파 재기, 0.8~1.3초)이 첫 그림 앞에 놓여 있는데, 손질한 무늬는 `setScene` 때 장면에 있어야 하고 그 뒤에 무늬를 주는 길은
문맥 복구의 `restoreTexture`뿐이라 기하를 먼저 보낼 수 없다고 알렸다. 첫 그림은 어차피 무늬를 올리기 전(평균색)이다.

- `Texture3d.pending: true`(그림 바이트·푼 그림 없이)인 무늬는 코어가 풀지 않고 기다린다 — 0.25.0 놓은 무늬를 되찾을 때 기다리는 것과 같은 상태라 그 무늬를 칠한 그물은 `color`로 그리고,
  `restoreNeed.textures`·`stats.textures.missing`에 든다. 앱이 `restoreTexture(id, 원본)`(그림 바이트·`ImageBitmap`·`{ data, bitmap, mime, width, height }`)으로 주면
  처음 올릴 때와 같은 긴 변 한도로 풀어 올리고 다시 그린다(받은 `ImageBitmap`은 닫는다). 크기를 알면 `width`·`height`를 함께 주면 한 장 한도·전체 예산을 처음부터 나눈다
- 맞물림: 0.25.0 놓기(`release`)는 코어가 푼 무늬의 원본만 놓으므로 pending 무늬와 상관없다(`textures: 'bitmap'`이면 보통 무늬는 되찾을 때 바이트를 다시 푼다).
  코어는 앱이 준 그림을 붙잡지 않으므로 문맥을 잃었다 되찾으면 pending 무늬는 다시 기다리고(`onContextRestore`의 `need.textures`에 든다), 앱이 다시 줘야 끝 알림(0.29.0)이 온다.
  처음 올릴 때 무늬 다시 그리기 모으기(0.30.0)는 다른 무늬를 푸는 중이면 그 간격 규칙을, 아니면 곧 그린다. 같은 장면 객체를 다시 주면 받은 무늬는 그대로다
- `data`나 `bitmap`이 있으면 `pending`은 보지 않는다(0.37.0과 같다). 이미 올린 무늬를 바꾸는 길은 아니다(기다리지 않는 무늬에는 `false`)

```ts
// 해석 워커가 기하와 무늬 크기만 먼저 보내면: 손질할 무늬는 pending으로 두고 장면부터 올린다
viewer.setScene({ ...scene, textures: scene.textures.map((t) => (needsTrim(t) ? { id: t.id, width: t.width, height: t.height, alpha: t.alpha, pending: true } : t)) });
// 워커가 손질을 마치는 대로
for await (const t of trimmed) await viewer.restoreTexture(t.id, t.bitmap);
```

### 확인

- 시험: `tests/v0380points.test.ts`(10개 — 켜면 첫 점 뒤 같은 고르기를 다시 불러 접점에 붙고 찍은 결과 `snapB`가 `'tangent'`, Esc 뒤 같은 자리, 다른 첫 점,
  `ctx` 복사본, 끈 앱의 부른 횟수, `clearMeasurePointsFor`, 접점 표식의 그리기 호출과 마름모 그대로), `tests/v0380edge.test.ts`(6개 — 순수 `acceptEdgePatch`의 받는 자리·
  커서에서 멀면·선 밖·다른 근·이웃 토막 활꼴·토막 끝·지나는 점, 뷰어로 첫 점 X축·끌어온 점 X축·잠근 X축·안내 선, `refine`이 `null`이면 그대로, Q 둘레 격자의 남은 현 위 점은
  모두 Q가 커서에서 붙잡기 거리 밖), `tests/v0380pending.test.ts`(8개 — 기다림·주기·바이트로 주기·풀지 못하면 다시 기다림·문맥 복구·놓기와 함께·`data`가 있으면 보지 않음·
  `pending` 없이 원본이 없으면 0.37.0처럼 풀지 못함). typecheck와 전체 시험(82파일 844개)이 통과한다
- 넓은 탐색(가짜 WebGL, 경우마다 새 뷰어·새 기억, 0.37.0 머리와 행 단위로 견줌): 꺾은선 원 셋(반지름 30·50토막, 5·20토막, 30·12토막) × 첫 점 X축·끌어온 점 X축·잠근 X축·
  안내 선 × 칸 반각의 1.1~4.4배 × 두 근 × 시점 셋 × 거리 다섯(0.2~12) × 원근·평행 3,600경우의 Q 둘레·X 둘레 11 × 11 격자 871,200자리 가운데 14,968자리가
  현 위 X → 원 위·그 선 위 다듬은 교차로 바뀌었다. 그 밖의 변화·엉뚱한 자리·잃은 자리 0, 앱 호출 수 같음(닫힌 3,640·열린 2,312번).
  37차 넓은 탐색(34~37차 꼴 271,138자리)은 12토막 원 꺾은선 116자리(보통 거리 95자리)만 X → 원 위 교차로 바뀌고 잃은 자리·엉뚱한 자리 0, 면 교차·칸·구멍 벽은 그대로다
- 화소·값 회귀: `npm run pixels -- --base c40967a --timeout 900`(0.37.0 머리)으로 장면 134개·값 99묶음이 모두 같고, 새 장면 2개(`ring50-measure-chord`·`base-measure-tangent`)·
  새 값 2묶음(`ring50-measure-chord`·`base-measure-points-first`)만 새로 찍었다(head에서 두 번 찍어 같음, 1,921초). `--base v0.33.0`으로는 0.33.0으로도 찍을 수 있는
  장면 131개·값 92묶음이 같고, 값 `hole-measure-normal`은 0.36.0이 바꾼 3자리 그대로(16자리 가운데 3 — 0.37.0 때와 바이트까지 같은 값), 새 장면 5개·새 값 8묶음
  (0.34.0~0.38.0 동작)이다(1,751초). 두 번 모두 load average 27~150
- 비용(가짜 WebGL, 0.37.0 머리와 번갈아 세 짝 — load average 26~42라 흔들림이 크다): 50토막 원 꺾은선에서 첫 점 X축이 현을 칸 반각의 4.4배로 가로지르는 근을 지나
  축을 따라 400자리를 세 번 옮기면 미리 보기 한 번이 거리 15에서 가운데값 0.30 → 0.19 ms(0.09~0.65), 거리 40에서 0.30 → 0.25 ms(0.07~0.76)로 흔들림 안이다.
  앱 다듬기 호출은 같고(거리 15 닫힌 1번, 거리 40 닫힌 1번·열린 1번 — 넓힌 받기는 이미 부른 닫힌 답을 받는다), 처음 400자리의 다듬은 모서리 위 만나는 점은 거리 15에서 0 → 38곳
  (거리 40은 80곳 그대로)이다. 원 위를 지나는 400자리 × 세 번에서 첫 점이 있으면 접점 둘을 주는 `pointsFor`는 부른 횟수가 1,188번으로 0.37.0·켬·끔 모두 같고
  (첫 점이 그대로인 동안은 다시 쓴다), 미리 보기 한 번은 가운데값 0.19~0.21 ms로 같다

### 남은 한계

- 접점은 코어가 구하지 않는다(앱 점). `pointsFor`는 무엇을 골랐을 때만 부르므로, 커서가 그 곡선에서 붙잡기 거리보다 떨어진 빈 곳이면 접점에 붙지 않는다(곡선을 골라야 한다)
- 닫힌 선분 교차의 넓힌 받기는 커서가 X 쪽이라 Q가 커서에서 붙잡기 거리 밖이면 현 위 X 그대로다(받는 점은 커서 붙잡기 거리 안이라는 규칙 — 0.37.0 면과 같다.
  위 탐색에서 현 위 X로 남은 126,256자리가 모두 그 꼴이다 — 0.37.0은 Q가 커서에서 붙잡기 거리 안인 14,968자리도 X였다)
- `pending` 무늬는 문맥을 되찾을 때마다 앱이 다시 줘야 한다(코어가 손질한 그림을 들고 있지 않는다 — 메모리를 놓는 것과 같은 까닭). 이미 올린 무늬의 그림을 바꾸는 API는 없다

### 앱이 할 일

- NC: 코어를 0.38.0(태그 없이 main 병합 커밋)으로 올린다. 할 일은 없다 — 원호·원을 나눈 꺾은선 현을 얕게 가로지르는 첫 점 축·잠근 선·안내 선 둘레에서 정확한 원 위 교차에 붙는다.
  그런 자리를 현 위 "모서리 위"로 적은 시험이 있으면 원 위 교차로 고친다. `pointsFor`는 첫 점과 상관없으므로 `pointsForFirst`를 켜지 않는다
- STEP: 코어를 0.38.0으로 올리고 접점의 세대 꾀(`MeasureFirst`의 `order = −세대`·`setMeasureSnapLimit(1 − 세대)`)를 `pointsFor: (p, ctx) => …ctx?.first…`와 `pointsForFirst: true`로 바꾼다.
  접점은 `kind: 'tangent'`로 달고 `snapLabel`에 `'tangent'`(“접점”)를 더한다(`'point'`를 “접점”으로 읽던 것은 뺀다). 곡선 계산 조각을 나중에 받을 때 `syncMeasureSnap` 대신
  `clearMeasurePointsFor()`로 잠금·끌어온 점을 둘 수 있다. B-rep 곡선 모서리 현을 얕게 가로지르는 선 둘레가 곡선 위 교차로 바뀐다
- SKP: 코어를 0.38.0으로 올린다. 큰 모형에서 손질할 무늬를 `pending`(`width`·`height`·`alpha`와 함께)으로 두고 장면부터 올린 뒤 워커가 손질한 그림을 `restoreTexture`로 준다.
  문맥 복구 때 이미 `restoreTexture`로 다시 주는 길(`release.ts`)이 pending 무늬도 맡는다(need.textures에 든다). 측정 붙잡기 이름표·색 표(`SNAP_LABELS`·`SNAP_COLORS` —
  `Record<SnapKind, string>`)에 `'tangent'` 항목을 더해야 typecheck가 지난다(SKP는 접점을 주지 않으므로 화면에 나오지는 않는다)
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.39.0: 커서가 그물 교차 쪽인 얕은 교차를 같은 교차의 정확한 자리로(`refineSnapToExact` — 앱이 고르는 선택)

새 API는 하나다: `MeasureSnapOptions.refineSnapToExact`(기본 꺼짐). 순수 함수 `acceptEdgePatch`·`acceptFacePatch`(`opencad-viewer3d/track`)에 마지막 선택 인자 `exactPx`가 늘고
결과에 `exact`가 붙을 수 있으며, 화면 상한 상수 `EXACT_SNAP_SCALE`(3)을 내보낸다. **바뀐 기본 동작은 없다** — 끄면(주지 않으면) 0.38.0과 결과·앱 호출 수가 바이트까지 같다
(넓은 탐색 행 단위·화소·값 — 아래 "확인"). `SnapKind`는 그대로라 앱의 `Record<SnapKind, …>` 표는 깨지지 않는다.

앱들이 알린 남은 꼴은 모두 같은 뿌리다. 선이 그물 칸·꺾은선 현을 얕게 뚫는 자리에서 커서가 그물을 뚫는 점 X 쪽이면, 앱이 준 같은 교차의 곡면·곡선 교점 Q가
커서에서 붙잡기 거리 밖이라 현 위 X("· 면 위"·"모서리 위", 다듬지 않음)가 남는다(0.37.0·0.38.0 넓힌 받기는 Q가 커서에서 붙잡기 거리 안일 때만 받는다).
STEP 44차 겨눈 훑기 630자리(거리 15, Q가 커서에서 10.9~19.2화소, 반지름 방향 0.035~0.059 mm 안쪽), NC 42차 판재 구멍 1,621자리(보통 거리 1,148), 코어 38차 넓은 탐색의
모서리 꼴 126,256자리가 그 꼴이다. STEP은 "면 위"를 떼는 길은 만나는 점을 잃으므로, 코어가 앱이 고르는 선택으로 두면 쓸지 정하겠다고 적었다(0.37.0 README "남은 한계"에
코어가 "둘 만하다"고 적은 것).

### 동작(`refineSnapToExact: true` — `refine`·`refineFace`가 있을 때만)

- 대상: 0.37.0·0.38.0 넓힌 받기와 같은 닫힌 교차다 — 첫 점 축·끌어온 축·잠근 선·끌어온 점 안내 선이 꺾은선 토막과 3D로 만나는 점(`refine` `'axisEdge'`),
  그물 칸을 뚫는 점(`refineFace` `'axisFace'`). 코어가 그 교차 X를 고른 뒤(X가 커서에서 붙잡기 거리 안 — 후보 차례도 X의 커서 거리로 견준다) 앱이 준 Q를
  0.38.0까지의 규칙(X에서 붙잡기 거리 안이면 받고, 아니면 그 토막·칸 조각 자리이고 커서에서 붙잡기 거리 안이면 받는다)으로 받지 못하면 한 번 더 본다
- 받는 규칙: Q를 그 선 위로 내린 자리가 넓힌 받기와 같은 조각 자리(현에 내린 자리가 그 토막 범위 안·현에서 0.1 × 토막 길이 안, 면은 뚫은 삼각형이나 한 칸을 나눈 같은 평면 짝에
  내린 발이 그 안·평면에서 0.1 × 가장 긴 변 안)이고, X에서 세계 거리로 그 토막 길이(면은 그 칸 꼭짓점 사이 가장 먼 거리) 안, 화면 거리로 `EXACT_SNAP_SCALE` × 붙잡기 거리
  (마우스 30화소) 안이면 표식·미리 보기·찍은 점을 Q로 옮긴다(`refined: true`, 면은 Q가 놓인 삼각형). 가림·단면은 넓힌 받기와 같다(선분은 그 자리 가림, 면은 오목한 곡면의 제 조각 가림)
- 앱 호출·기억 열쇠·차례·값의 꼴은 그대로다(이미 부르던 닫힌 답을 받는 규칙만 넓힌다). 열린 교차(현·삼각형을 비켜 가는 선)는 원래 커서 거리로 받으므로 상관없다

```ts
viewer.setMeasureSnap({ ...snap, refine, refineFace, refineSnapToExact: true });
```

### 설계 근거(CAD 설명서)와 코어 규칙과의 맞물림

- AutoCAD 도움말("About Using Object Snaps")은 객체 스냅을 "precise locations on objects"를 주는 길로 적고, AutoSnap 표식은 커서가 객체의 스냅 자리 위로 가면
  그 자리에 그린다. 고르는 범위는 화소로 정한 대상 상자다(APERTURE — "object snap target box", 화소). 원·호의 겉모습은 짧은 선분으로 그리는 정도(VIEWRES)를 따로 정하고,
  스냅은 화면 선분이 아니라 객체 위 자리를 준다.
  SOLIDWORKS 도움말("Inferencing")도 커서가 교차 같은 기하 관계 위에 있음을 커서 표시로 알리고, 곡면의 화면 삼각화 정밀도는 문서 화질 설정(Image Quality)으로 형상과 따로 둔다.
  곧 "무엇을 골랐는가"는 화면 거리로, "표식·점을 어디에 두는가"는 실제 형상 위 정확한 자리로 나눈다
- 코어 규칙 "받는 점은 커서 붙잡기 거리 안"과의 맞물림: 이 선택에서 커서 붙잡기 거리 안인 것은 X이고, 그것이 그 교차를 고른 근거다(차례도 X로 정한다). Q는 새로 고른 점이 아니라
  같은 교차의 정확한 자리다 — 선이 현(삼각형)을 한 번 지나면 그 토막(칸)의 곡선 조각(곡면 조각)도 한 번만 지나므로 조각 자리 규칙이 같은 교차라는 근거다. 그래서 X가 아닌
  다른 교차(이웃 토막·칸 위 교차, 같은 선의 다른 근)는 이 선택에서도 받지 않는다
- 상한: 세계 거리(토막 길이·칸 크기)는 조각 자리 규칙이 이미 그 안으로 묶는 범위를 적어 둔 것이다. 화면 상한(붙잡기 거리의 3배)은 아주 가까이 확대해 현과 곡선이 화면에서
  갈라져 보이는 자리에서 표식이 커서·그린 꺾은선에서 멀리 뛰지 않게 둔다. 넓은 탐색에서 화면 상한을 두지 않으면 옮길 수 있는 남은 꼴이 모두 같은 교차로 옮겨졌다(엉뚱·잃음 0).
  그 자리를 X와 Q 사이 화면 거리의 상한별로 세면 아래와 같다(누적)

  | 상한(화소) | 15 | 20 | 30 | 40 | 60 | 100 | 없음 |
  |---|---:|---:|---:|---:|---:|---:|---:|
  | 38차 모서리 꼴(126,256자리) | 17,592 | 27,040 | **57,264** | 72,048 | 91,760 | 109,624 | 126,256 |
  | 37차 면·모서리 꼴(X 13,832자리 — 옮길 수 있는 것 12,392) | 2,060 | 2,902 | **7,031** | 7,724 | 8,773 | 10,236 | 12,392 |
  | 그 가운데 보통 거리(X 2,209 — 옮길 수 있는 것 1,459) | 318 | 816 | **1,170** | 1,247 | 1,459 | 1,459 | 1,459 |

  30화소(붙잡기 거리의 3배)를 고른 까닭: STEP 44차 꼴(거리 15, Q가 커서에서 19.2화소 안 — X와 Q 사이 29.2화소 안)과 같은 37차 낮은 원기둥 꼴(거리 15·40·100, 4,340자리),
  판재 구멍 꼴(175자리)이 모두 30화소 안이다. 30화소를 넘는 모서리 자리는 모두 아주 가까이 본 자리다(카메라 거리가 반지름의 0.2·0.5배, 거친 12토막 원은 1.33배까지 —
  그 확대에서는 처짐이 화면에서 수~수십 화소라 그린 꺾은선과 곡선이 갈라져 보인다). 면 꼴에서 30화소를 넘어 남는 보통 거리 자리는 289자리(30~60화소 — 구 등)다
- 기본으로 켜지 않는 까닭: 표식이 커서에서 붙잡기 거리보다 먼 자리(마우스 최대 40화소)에 놓이고, 측정 값이 그 자리를 찍은 값으로 바뀐다(곡면 교점을 쓰는 앱의 시험·화면 기대가 바뀐다).
  0.37.0 README "남은 한계"의 "면 위"를 떼는 길(만나는 점을 잃는다)보다 낫지만 앱이 고른다

### 확인

- 시험 `tests/v0390exact.test.ts`(9개): 순수 `acceptEdgePatch`·`acceptFacePatch`의 `exactPx`(X 쪽 커서에서 Q를 받음·`exact`, 화면 상한·세계 상한·다른 근·이웃 토막·
  같은 평면이 아닌 이웃 칸은 빠짐), 뷰어로 50토막 원의 첫 점 X축·끌어온 점 X축·잠근 X축·안내 선과 낮은 원기둥의 안내 선·첫 점 X축(끄면 X, 켜면 같은 토막·칸의 Q, 앱 호출 수 같음),
  찍은 둘째 점이 Q, 아주 가까이 확대해 X와 Q가 상한보다 멀면 켜도 X, X 둘레 격자에서 바뀐 자리가 모두 그 X에 가장 가까운 근, `refine` 없이 이 선택만 주면 붙잡기가 켜지지 않음.
  typecheck와 전체 시험(83파일 853개)이 통과한다
- 넓은 탐색(가짜 WebGL, 경우마다 새 뷰어·새 기억, 38차 머리 5c81714와 행 단위로 견줌):
  - 38차 모서리 꼴(꺾은선 원 셋 × 첫 점 X축·끌어온 점 X축·잠근 X축·안내 선 × 칸 반각의 1.1~4.4배 × 두 근 × 시점 셋 × 거리 다섯 × 원근·평행 3,600경우, Q·X 둘레 871,200자리):
    끄면 모든 행이 바이트까지 같고 앱 호출도 같다(닫힌 3,640·열린 2,312번). 켜면 57,264자리가 현 위 X → 같은 토막·그 선 위 원 위 근(X에 가장 가까운 근)으로 바뀌고
    그 밖의 변화·다른 근·다른 토막·잃은 자리 0, 앱 호출 같음. 남은 현 위 X 68,992자리는 모두 X와 Q 사이가 30화소를 넘는다
  - 37차 넓은 탐색(34~37차 꼴 271,138자리): 끄면 모두 같다. 켜면 다듬지 않은 만나는 점 13,832자리 가운데 7,031자리(보통 거리 2,209 가운데 1,170)가 같은 교차의 곡면·원 위 근으로
    바뀌고(922자리는 같은 칸의 다른 삼각형 — Q가 놓인 삼각형), 잃은 자리·엉뚱한 자리·다른 근 0. 남은 6,801자리 가운데 5,361자리는 X와 Q 사이가 30화소를 넘는 자리이고,
    1,440자리는 상한을 두지 않아도 옮기지 않는 자리다(구 1,437자리 — 0.37.0 남은 한계의 휘는 변 쐐기 등, 판재 3자리)
- 화소·값 회귀(960 × 600, 판마다 두 번): `npm run pixels -- --base 5c81714 --timeout 900`(0.38.0 머리)으로 장면 136개·값 101묶음이 모두 같고, 새 장면 `ring50-measure-exact`와
  새 값 `ring50-measure-exact`·`lowcyl-measure-exact`만 새로 찍었다(0.38.0에 없는 선택 — head에서 두 번 찍어 같음, 1,573초, load average 20~100. `lowcyl-measure-exact`는
  판 확인을 lowcyl 자료로 고친 뒤 `--only 'exact$'`로 다시 찍었다 — 19초).
  `--base v0.33.0`으로는 0.33.0으로도 찍을 수 있는 장면 131개·값 92묶음이 같고, 값 `hole-measure-normal`은 0.36.0이 바꾼 3자리 그대로(16자리 가운데 3 — 0.37.0·0.38.0 때와
  바이트까지 같은 값), 새 장면 6개·새 값 10묶음(0.34.0~0.39.0 동작)이다(611초)
- 비용(가짜 WebGL, 선을 따라 Q를 지나 400자리 × 세 번 — 38차 머리·끔·켬을 차례를 돌려 세 짝, load average 50~67이라 흔들림이 크다): 미리 보기 한 번 가운데값이
  50토막 원 첫 점 X축 거리 15에서 0.15 · 0.13 · 0.09 ms(0.05~0.26), 거리 40에서 0.10 · 0.10 · 0.09 ms(0.05~0.28), 낮은 원기둥 안내 선 거리 15에서 0.24 · 0.29 · 0.26 ms
  (0.15~1.05)로 흔들림 안이다. 앱 다듬기 호출은 셋 다 같고(닫힌 1·열린 0번, 닫힌 1·열린 1번, 닫힌 1·열린 1번 — 이미 부른 닫힌 답을 받는다), 처음 400자리의 다듬은
  만나는 점은 원 거리 15에서 38 → 80곳, 원기둥 거리 15에서 80 → 122곳(켬), 원 거리 40은 80곳 그대로다

### 37차 남은 과제 — 아주 가까이 확대한 꺾은선 토막의 열린 교차(재현해 센 값만)

0.35.0 "남은 한계"(현이 커서에서 붙잡기 거리 밖이면 커서 둘레 선분이 아니라 열린 교차를 보지 않는다)를 0.39.0으로 다시 재현해 셌다. 받는 규칙은 바꾸지 않았다(아래 까닭).
정확한 근 R 둘레 9 × 9(2화소 칸) 격자 가운데 커서가 R에서 붙잡기 거리(10화소) 안인 자리를 나눴다(경우마다 새 뷰어, `refine` = 정확한 원 근).

| 장면 | 1화소 세계 길이 | 자리 | 원 위 다듬은 교차 | 축 위 커서 자리이고 현이 커서에서 붙잡기 거리 밖 |
|---|---|---:|---:|---:|
| NC 23차 꼴 원호(반지름 25·33토막, 첫 점 X축이 꼭대기 아래 0.001~0.02, 원근·평행) | 0.0005 | 1,168 | 28 | 1,124 |
| 같은 장면 | 0.001 | 1,168 | 232 | 924 |
| 같은 장면 | 0.002 | 1,168 | 668 | 496 |
| 같은 장면 | 0.004 | 1,168 | 976 | 192 |
| 12토막 원(반지름 10, 등각, 첫 점 X축 y = −9.7·−9.8·−9.95) | 0.005·0.01·0.02·0.05 | 각 438 | 0·0·0·21 | 438·409·227·65 |

12토막 원의 나머지(0.01에 29, 0.02에 211, 0.05에 340자리)는 현이 커서에서 붙잡기 거리 안인데 축 위 커서 자리로 남은 곳으로, 선이 현을 가로지르는 자리가 곡선 위 교차에서
붙잡기 거리보다 먼 꼴(0.34.0 면의 뚫는 칸과 같은 꼴 — "남은 일"의 둘째 설계)이다. `refineSnapToExact`는 이 자리와 상관없다(코어 교차 X가 후보가 아니다 — 켜도 끈 것과 같다).
받기를 넣지 않은 까닭: 현이 커서에서 먼 토막까지 모으려면 커서 둘레 선분을 붙잡기 거리 + 처짐 한도(0.1 × 토막 길이)의 화소 거리까지 모아야 하는데, 그 거리가 확대에 따라
수백 화소까지 커져(위 원호 1화소 0.0005에서 약 950화소) 미리 보기 한 번의 비용과 받는 근거(그린 꺾은선이 커서에서 멀다)를 함께 정해야 한다. 0.35.0 꺾은선 탐색과 견주는 넓은 탐색과
함께 다음 차수로 남긴다

### 남은 한계

- 켜도 X와 Q가 화면에서 붙잡기 거리의 3배보다 멀면(아주 가까이 확대한 자리) 현 위 X 그대로다. 구처럼 Q가 두 칸이 함께 쓰는 휘는 변 위 쐐기면 어느 칸 조각 자리로도 보지 않아(0.37.0)
  켜도 그대로다
- 두 꺾은선 토막의 교차점(0.15.0 `'intersection'`)·수직 발 등 다른 다듬기는 0.14.0 규칙(코어 점에서 붙잡기 거리 안) 그대로다(이 선택은 선과 토막·칸의 닫힌 교차만)
- 화면 상한의 배수는 상수다(앱이 바꾸는 선택은 두지 않았다)

### 앱이 할 일

- NC: 코어를 0.39.0(태그 없이 main 병합 커밋)으로 올린다. 그대로면 할 일은 없다(기본 꺼짐). 42차 판재 구멍 남은 꼴(1,621자리, 보통 거리 1,148)을 줄이려면 `setMeasureSnap`에
  `refineSnapToExact: true`를 더한다 — 코어 넓은 탐색의 판재 구멍 꼴 175자리는 모두 원기둥 위 교차로 바뀐다. 켜면 그런 자리를 현 위 "면 위"로 적은 시험을 원기둥 위 교차로 고치고,
  다시 세어 남은 자리가 X와 Q 사이 30화소 넘는 자리(아주 가까이 본 자리)인지 본다
- STEP: 코어를 0.39.0으로 올리고 44차 남은 꼴(630자리)을 위해 `refineSnapToExact: true`를 켠다(STEP이 물은 선택 — "면 위"를 떼지 않고 만나는 점을 지킨다).
  같은 꼴의 코어 재현(낮은 원기둥 거리 15·40·100, 4,340자리)은 모두 곡면 위 교점으로 바뀐다. 다시 훑어 남은 자리의 X·Q·커서 화면 자리를 알려 주면 코어 시험으로 옮긴다.
  같은 교차에서 `face.index`가 같은 칸의 다른 삼각형으로 바뀔 수 있다(Q가 놓인 삼각형)
- SKP: 코어를 0.39.0으로 올린다. 할 일은 없다(`refine`·`refineFace`를 주지 않으므로 이 선택과 상관없다). `SnapKind`는 그대로라 `SNAP_LABELS`·`SNAP_COLORS`(`Record<SnapKind, string>`)는
  그대로 typecheck가 지난다
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.40.0: 아주 가까이 확대한 꺾은선 토막의 교차(`openEdgeLens` — `refine`을 준 앱의 바뀐 기본 동작)

새 선택은 하나다: `MeasureSnapOptions.openEdgeLens`(`refine`이 있으면 기본 켜짐 — `false`면 0.39.0과 결과·앱 호출 수가 바이트까지 같다).
순수 함수(`opencad-viewer3d/track`)에 `piercedEdgeCandidates`·`lensEdgeSnap`·`lineScreenGap`과 상수 `LENS_SEGMENTS`(24)를 더하고, `openEdgeCandidates`·`openEdgeSnap`에 마지막 선택 인자
`from`(후보를 낼 토막), `TrackSegment`에 선택 필드 `sag`(활꼴 높이 어림)를 더했다. `segmentCandidates`(`opencad-viewer3d/pick`)의 `chord` 선택과 결과 `bandPx`·`sag`,
`segmentsNear`(`opencad-viewer3d/scenepick`)의 마지막 선택 인자 `chord`, `queryCone`(`opencad-viewer3d/bvh`)의 마지막 선택 인자 `grow`도 새로 생겼다. 모두 선택이라 지금 부르는 쪽은 그대로다.
`SnapKind`·`SnapRefineInput`은 그대로라 앱의 `Record<SnapKind, …>` 표와 `refine` 타입은 깨지지 않는다.

**바뀐 기본 동작**(`refine`을 준 앱만): 첫 점 축·끌어온 축·잠근 선·끌어온 점 안내 선(`meets: { open }`)을 켠 앱에서, 선 위 커서 자리(축·안내 선·잠근 선 위 점)로 남던 자리 가운데
같은 선과 곡선의 교차가 커서 붙잡기 거리 안인 곳이 그 교차(`refined`, `segment`)로 바뀐다. 아주 가까이 확대해 현이 커서에서 붙잡기 거리 밖인 자리(0.35.0 남은 한계 —
NC 23차 원호를 1화소 0.0005로 보면 현이 근에서 약 54화소)와, 선이 현을 가로지르는 자리가 곡선 교차에서 화면으로 붙잡기 거리보다 먼 자리(12토막 원·50토막 원을 보통 거리로 볼 때도 있다)다.
그 밖의 자리·값과 앱 호출은 같다(넓은 탐색 행 단위 — 아래 "확인").

### 동작

- 보는 선: 0.20.0 열린 교차와 0.31.0 안내 선의 열린 교차가 보는 선(잠근 동안은 잠근 선 — `lockEdges`) 가운데 화면에서 커서 붙잡기 거리 안을 지나는 것만(`lineScreenGap` — 받는 점은 그 선 위·커서 붙잡기 거리 안이다)
- 모으는 토막: 토막마다 활꼴 띠(현의 직선에서 활꼴 높이 어림 `sag` 안)를 화면에 비춘 것이 커서 붙잡기 거리 안에 닿는 토막을 띠와의 화면 거리 차례로 `LENS_SEGMENTS`(24)개까지(`segmentsNear(…, chord)`).
  `sag`는 선분 묶음(그물 윤곽선도) 배열에서 앞·뒤 토막이 그 끝을 같은 값으로 잇는 꺾은선이면 그 꼭짓점에서 꺾인 각 φ(45° 미만 — 넘으면 모서리로 보고 쓰지 않는다)로 `길이/2 × tan(φ/2)`(두 끝 가운데 큰 것)이고
  `0.1 × 길이`를 넘지 않는다. 따로 떨어지거나 곧게 이어진 토막은 0이라 띠가 없다. BVH 질의는 마디 상자를 `0.1 × 대각선`만큼 부풀린 원뿔이다(`queryCone` `grow`)
- 후보 둘(0.35.0 README "남은 일"에 적은 두 설계):
  - 현이 커서에서 붙잡기 거리 밖인 토막의 열린 교차: 0.20.0과 같은 셈(선이 현과 만나지 않고 활꼴을 지날 만큼 가깝다, 0.35.0 `cursorInLens`, 0.22.0 둘째 힌트, 선에서 그 토막 범위인 조각이 커서 붙잡기 거리 안).
    이웃 토막 판정은 커서 둘레 토막과 띠로 모은 토막을 함께 본다. 활꼴 높이 한도는 `0.1 × 길이` 대신 그 토막 `sag`다
  - 선이 현을 가로지르는 자리 X가 커서에서 붙잡기 거리 밖이라 코어 교차 후보가 되지 못하는 토막(커서 둘레 토막도) 가운데 선에서 그 토막 범위(현에서 `sag` 안)인 조각이 커서 붙잡기 거리 안인 것 —
    X를 힌트로 묻는다(`piercedEdgeCandidates` — 면의 0.36.0 뚫는 칸과 같은 꼴). X가 토막 끝 둘레(꼭짓점을 지나는 선 — 0.33.0 `refineEnds`)거나 커서 붙잡기 거리 안(코어 교차가 맡는다)이면 빼고, 곧은 토막(`sag` 0)도 빠진다
- 앱 호출: `'axisEdge'`·`open: true` — 0.20.0 열린 교차와 같은 입력(`point`는 열린 교차면 선 위에서 토막에 가장 가까운 점, 가로지르는 자리면 X, `segment`, `line`, `first`, `ray`)과 기억 열쇠.
  앞의 열린 후보(0.15.0~0.33.0)가 쓰고 남은 미리 보기 한 번 한도(`OPEN_REFINE_CALLS` 6) 안에서 커서에 가까운 힌트부터 부른다
- 받는 규칙: 0.23.0 열린 교차 그대로(앱 점을 선 위로 내린 자리가 그 토막 곡선 조각 자리 — 현에 내린 자리가 토막 범위 안·끝에서 반 화소 넘게·현에서 `0.1 × 토막 길이` 안 —, 커서에서 붙잡기 거리 안, 단면·가림)
- 차례: 다른 점 후보 모두의 뒤(축·끌어온 축·안내 선은 열세째, 잠근 동안은 일곱째 — 앞 후보보다 1화소 넘게 가까워야 이긴다). 값은 0.20.0 열린 교차·0.31.0 안내 선의 열린 교차·
  잠근 선의 열린 교차와 같은 꼴(`refined`, `segment`)

```ts
viewer.setMeasureSnap({ ...snap, refine });                       // 0.40.0부터 켜짐
viewer.setMeasureSnap({ ...snap, refine, openEdgeLens: false });  // 0.39.0과 같게
```

### 설계 근거

- 0.23.0 받는 규칙의 필요조건: 받는 점은 선 위·그 토막 범위(현 둘레 기둥) 안·커서 붙잡기 거리 안이므로 그 토막 범위를 화면에 비춘 것이 커서 붙잡기 거리 안에 닿아야 한다.
  0.39.0까지 "현이 커서 붙잡기 거리 안"(커서 둘레 선분)으로 모은 것은 그보다 좁은 비용 지름길이라, 처짐이 화면에서 붙잡기 거리보다 커지면 받을 수 있는 교차가 빠졌다
- 활꼴 높이 어림: `OPEN_EDGE_CHORD`(0.1)의 근거(한 토막이 45°보다 덜 도는 꺾은선이면 활꼴 높이 = 현 길이/2 × tan(돈 각/4) ≤ 0.1 × 현 길이)와 같은 식에 꺾은선 자신이 보이는 각을 넣는다.
  원을 나눈 꺾은선이면 꼭짓점에서 꺾인 각은 이웃 두 토막이 도는 각의 평균이라 그 토막이 도는 각은 꺾인 각의 2배를 넘지 않는다. NC 23차 원호(33토막 — 5.45°)는 0.057(실제 처짐 0.028의 2배,
  `0.1 × 길이`는 0.238)이다. 곧은 선분은 활꼴이 없다 — `0.1 × 길이`로 모으면 길고 곧은 모서리·가공 경로를 축과 나란히 지날 때마다 앱을 헛되이 부른다(촘촘한 시험 장면 — 길이 1,200 곧은 선 41개 —
  에서 커서 둘레마다 곧은 선 9개 남짓이 후보였다)
- 가로지르는 자리를 힌트로: 선이 현을 한 번 지나면 그 토막 곡선 조각도 한 번만 지나므로(0.39.0과 같은 근거) 앱 근이 그 조각 자리면 같은 교차다. 받는 점이 커서 붙잡기 거리 안이라는 코어 규칙은 그대로다
  (0.39.0 `refineSnapToExact`의 반대쪽 — 그것은 X가 커서 둘레이고 곡선 교차가 멀다)
- 기본으로 켠 까닭: 받는 규칙이 그대로이고(표식은 커서 붙잡기 거리 안), 넓은 탐색에서 바뀐 자리가 모두 선 위 커서 자리(남던 자리)에서 같은 선의 정확한 곡선 교차로 바뀐 것뿐이며
  (잃음·엉뚱·다른 근 0), 앱 호출이 느는 것은 곡선 꺾은선을 아주 가까이 보거나 선이 현을 얕게 가로지르는 자리뿐이다(곧은 선분은 띠가 없다). 0.35.0 `cursorInLens`와 같은 꼴의 기본 동작 변경이다.
  CAD 설명서의 근거(객체 스냅은 화면 선분이 아니라 객체 위 정확한 자리 — AutoCAD "About Using Object Snaps"·VIEWRES, SOLIDWORKS Image Quality)는 0.39.0 README와 같다

### 확인

- 시험 `tests/v0400lens.test.ts`(13개): 띠로 모으기(20° 꺾은선 토막만 — 떨어진 곧은 선분·90° 모서리는 띠 없음, BVH 있이·없이·행렬 축척), `piercedEdgeCandidates`(근 둘레만 — 가로지르는 자리가
  커서 둘레거나 범위 조각이 멀면 없음), `lineScreenGap`, `lensEdgeSnap`, 뷰어로 12토막 원 꼭대기 활꼴을 지나는 첫 점 X축 1화소 0.02·0.005(끄면 축 위 커서 자리, 기본은 두 근 — 새 호출 한도 안·찍은 점도 근),
  잠근 X축, 앱 `null`·`refine` 없음, 아래 토막 현을 가로지르는 자리가 근에서 79화소인 첫 점 X축(힌트 = 가로지르는 자리), 곧은 변과 나란히 0.1 × 길이 안을 지나는 축(앱을 부르지 않음).
  0.35.0 시험 "1화소 0.02면 그대로"는 `openEdgeLens: false`일 때로 고쳤다. typecheck와 전체 시험(84파일 866개)이 통과한다
- 39차 재현(정확한 근 R 둘레 9 × 9 — 2화소 칸 — 가운데 R에서 붙잡기 거리 안인 자리, 경우마다 새 뷰어):

  | 장면 | 1화소 세계 길이 | 자리 | 0.39.0 원 위 교차 | 0.40.0 원 위 교차 | 미리 보기 한 번 새 호출(최대) |
  |---|---|---:|---:|---:|---:|
  | NC 23차 꼴 원호(반지름 25·33토막, 첫 점 X축이 꼭대기 아래 0.001~0.02, 원근·평행) | 0.00025 | 1,168 | 0 | 1,168 | 3 |
  | 같은 장면 | 0.0005·0.001·0.002·0.004 | 각 1,168 | 28·232·668·976 | 각 1,168 | 3·3·3·4 |
  | 12토막 원(반지름 10, 등각, 첫 점 X축 y = −9.7·−9.8·−9.95) | 0.002·0.005·0.01·0.02 | 각 438 | 0·0·0·0 | 각 438 | 1·1·2·2 |
  | 같은 장면 | 0.05 | 438 | 21 | 426 | 3 |

  12토막 원 1화소 0.05의 나머지 12자리는 0.39.0과 같은 끝점 붙잡기다. 바뀐 자리는 모두 겨눈 근 R(다른 근·원 밖 점 0)
- 넓은 탐색(가짜 WebGL, 경우마다 새 뷰어·새 기억, 39차 머리 387a015와 행 단위로 견줌 — `openEdgeLens: false`는 0.39.0 판, 켬은 기본과 같은 길):
  - 37차 넓은 탐색 사본에 확대 단계(원호 1화소 0.00025, 12토막 원 0.002·0.005·0.01)와 대조 무리(모서리를 둥글린 직사각형 — 곧은 변 180·둥글림 반지름 10 8토막,
    곧은 변과 나란히 1·4·9 위를 지나는 첫 점 X축, 1화소 0.005~0.5)를 더해 275,836자리: 끄면 0자리가 바뀌고 앱 호출도 같다.
    켜면 8,262자리(원호 3,976·구멍 윗 테두리 1,623·12토막 원 2,461·둥근 직사각형 둥글림 202)가 선 위 커서 자리 → 같은 선의 원 위 교차로 바뀌고(모두 커서 10화소 안),
    잃은 자리·엉뚱한 자리·다른 근·그 밖의 변화 0. 열린 `refine` 호출은 그 무리에서만 448 → 556·146 → 202·90 → 152·95 → 125번(곧은 변 가운데를 겨눈 자리는 그대로·호출 늘지 않음),
    미리 보기 한 번 최대 호출은 그대로다
  - 38차 모서리 꼴(꺾은선 원 셋 × 첫 점 X축·끌어온 점 X축·잠근 X축·안내 선 × 칸 반각의 1.1~4.4배 × 두 근 × 시점 셋 × 거리 다섯 × 원근·평행 3,600경우, 871,200자리):
    끄면 모든 행이 바이트까지 같고 앱 호출도 같다(닫힌 3,640·열린 2,312번). 켜면 169,604자리가 선 위 커서 자리(축 84,774·잠근 축 42,401·안내 선 42,246·그 밖의 축·수직 안내 183)
    → 같은 선의 원 위 다듬은 교차로 바뀐다(모두 커서 10화소 안, 그 밖의 변화 0). 카메라 거리(반지름의 배수)별로 0.2배 55,176·0.5배 51,120·1.33배 38,100·4배 20,256·12배 4,952자리다.
    열린 호출 2,312 → 5,960번(닫힌 호출 같음). 0.39.0 `refineSnapToExact`가 맡는 현 위 X 자리(126,256)는 그대로다
- 화소·값 회귀(960 × 600, 판마다 두 번): `npm run pixels -- --base 387a015 --timeout 900`(39차 머리)으로 장면 137개가 모두 같고 값 105묶음 가운데 102묶음이 같다
  (끈 값 `ring12-measure-lens-off` 포함). 다른 두 묶음은 바뀐 기본 동작 그대로다 — `ring12-measure-lens`는 확대 0.02의 50자리 모두와 0.04의 30자리(0.1은 그대로),
  `ring50-measure-chord`는 첫 점 X축·잠근 X축의 거리 15에서 62자리·거리 40에서 6자리(현을 가로지르는 자리가 근에서 먼 자리)가 축 위 커서 자리 → 같은 축의 원 위 다듬은 교차로 바뀌었고
  그 밖의 자리는 같다. 새 값 `ring12-measure-lens-far`는 head에서 두 번 찍어 같았다(846초, load average 20~37).
  `--base v0.33.0`으로는 0.33.0으로도 찍을 수 있는 장면 131개·값 92묶음이 같고, 값 `hole-measure-normal`은 0.36.0이 바꾼 3자리 그대로(0.37.0~0.39.0 때와 같은 값),
  새 장면 6개·새 값 12묶음이다(624초)
- 모으는 비용(순수 `segmentsNear`, 겨눈 근을 지나는 첫 점 X축 위 400자리 평균 — 커서 둘레 선분 수는 한도 24, 띠로 모은 수는 한도 없이 센 것, load average 12~30):

  | 장면 | 1화소 | 커서 둘레 선분 | 띠로 모은 선분(최대) | 시간 ms(커서 둘레 · 띠) |
  |---|---:|---:|---:|---|
  | NC 23차 꼴 원호 | 0.00025~0.002 | 0 | 1(1) | 0.001~0.003 · 0.007~0.020 |
  | 같은 장면 | 0.004~0.1 | 1~1.8 | 1~1.9(2) | 0.003~0.004 · 0.007~0.008 |
  | 12토막 원(반지름 30) | 0.002~0.05 | 0~0.1 | 1~5(5) | 0.002~0.003 · 0.003~0.007 |
  | 촘촘한 장면(동심원 100개 × 128토막 + 길이 1,200 곧은 선 41개 = 13,841토막) | 0.01·0.05·0.2·0.5 | 0.2·0.2·1.4·6.6 | 0.3·0.2·1.4·6.7(10) | 0.10~0.11 · 0.13~0.16 |
  | 같은 장면(멀리서) | 2 | 24(한도) | 119(481 — 뷰어는 24로 자른다) | 0.17 · 0.31 |

  `0.1 × 길이` 띠로 모으면 원호 1화소 0.00025에서 11개(원근에서 띠가 눈까지의 거리보다 두꺼워 가까운 면으로 잘린다), 촘촘한 장면에서 11~19개(곧은 선)였다
- 미리 보기 한 번(가짜 WebGL 그리기 포함, 선을 따라 겨눈 근을 지나는 400자리 × 세 번, 387a015·끔·켬을 차례를 돌려 세 짝, load average 12~18 — 가운데값 ms):

  | 장면 | 387a015 | 끔 | 켬 | 처음 400자리의 원 위 교차 | 켬 앱 호출(열린) |
  |---|---:|---:|---:|---|---:|
  | 원호 1화소 0.0005(첫 점 X축) | 0.051 | 0.047 | 0.074 | 0 → 80 | 3 |
  | 12토막 원 1화소 0.05(현을 가로지르는 첫 점 X축) | 0.059 | 0.053 | 0.064 | 0 → 80 | 1 |
  | 50토막 원 거리 15(39차와 같은 길) | 0.061 | 0.061 | 0.068 | 38 → 80 | 1 |
  | 촘촘한 장면 1화소 0.05 | 0.504 | 0.490 | 0.662 | 80 → 82 | 1 |
  | 촘촘한 장면 1화소 0.5 | 0.579 | 0.558 | 0.555 | 0 | 0 |

### 남은 한계

- 띠는 선분 묶음(그물 윤곽선) 배열에서 차례로 이어진 꺾은선(앞 토막 끝과 다음 토막 시작이 같은 값)만 꺾인 각으로 어림한다. 따로 떨어지거나 차례가 섞인 선분은 띠가 없어 0.39.0처럼
  커서 둘레 선분일 때만 본다. 45° 넘게 꺾인 꼭짓점은 모서리로 본다(그보다 거칠게 나눈 곡선은 0.1의 전제 밖이다)
- 띠로 모으는 토막은 24개까지(띠와의 거리 차례), 커서가 보는 선 가운데 하나의 화면 붙잡기 거리 안일 때만 모은다. 원근에서 띠가 눈까지의 거리보다 두꺼우면 띠의 화면 폭은 가까운 면으로 잘라 재어 넉넉해진다
- 꺾은선 꼭짓점을 지나는 선(0.33.0 `refineEnds`)과 두 꺾은선의 교차점·수직 발(0.15.0)은 커서 둘레 선분만 본다
- 커서가 현과 만나는 자리(X) 쪽이라 곡선 교차가 커서에서 붙잡기 거리 밖인 자리는 0.39.0 그대로다(`refineSnapToExact`를 켜면 30화소 안까지)

### 앱이 할 일

- NC: 코어를 0.40.0(태그 없이 main 병합 커밋)으로 올린다. `refine`을 주므로 켜진다. `'axisEdge'` 다듬기(축 직선과 원호의 교차 — `point` 둘레 근)가 띠로 모은 토막의 열린 후보와
  가로지르는 자리 힌트도 그대로 푼다(같은 입력 꼴). 원호를 나눈 공구 경로 선분을 차례로(앞 토막 끝 = 다음 토막 시작, 같은 값) 두어야 띠가 생긴다 — 판 외곽선·구멍 테두리처럼
  그물 윤곽선으로 주는 곡선도 같다. 아주 가까이 확대한 단을 "붙지 않는다"로 적은 시험(`measure-apex` 등)이 있으면 원 위 교차로 고친다. 0.39.0과 같게 두려면 `openEdgeLens: false`
- STEP: 코어를 올린다(0.38.0·0.39.0 다음). `intersectAxis`가 열린 후보를 그대로 푼다. B-rep 모서리 꺾은선을 선분 묶음에 차례로 이어 두면 띠가 생기고, 차례가 섞이면 0.39.0과 같다.
  새로 보이는 글은 없다
- SKP: 코어를 0.40.0으로 올린다. 할 일은 없다(`refine`을 주지 않는다). `SnapKind`는 그대로라 `SNAP_LABELS`·`SNAP_COLORS`(`Record<SnapKind, string>`)는 그대로 typecheck가 지난다
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.41.0: 앱 붙잡기 점의 우선(`SnapPoint.priority` — STEP 46차 요청)·최근접점 나눠 돌리기(`closestPointsAsync`)·두 점이 놓인 기본 도형 번호(`indices`)

새 API는 셋이고 모두 선택이다. 주지 않으면 0.40.0과 결과·앱 호출 수가 바이트까지 같다(넓은 탐색·화소·값 — 아래 "확인"). **바뀐 기본 동작은 없다.**

- `SnapPoint.priority?: 'normal' | 'low' | 'fallback'`(타입 `SnapPriority`), 상수 `LOW_PRIORITY_YIELD_PX`(0.5)와 순수 `snapPriority`(`opencad-viewer3d/snap`)
- `Viewer3d.closestPointsAsync(idA, idB, { maxDistance?, indices?, signal?, sliceMs?, stats? })`(`ClosestPointsAsyncOptions`), 순수 `ClosestSearch`·`closestBetweenAsync`·`closestSlice`·
  `CLOSEST_SLICE_MS`(8)(`opencad-viewer3d/closest`)
- `closestPoints`·`closestBetween`의 `indices` 선택(기본 꺼짐)과 결과 `rawA`·`rawB`, 뷰어는 `indexA`·`indexB`도(`ClosestPointsOptions`)

`SnapKind`는 그대로라 앱의 `Record<SnapKind, …>` 표는 깨지지 않는다. `MeasureHoverSnap`·`MeasureResult`도 그대로다(우선은 고르는 차례만 바꾸고 종류·값 꼴은 그 점 그대로다).

### 앱 점의 우선(`SnapPoint.priority`)

- 0.10.0 `order`와 다르다: `order`는 붙잡기 한도(`setMeasureSnapLimit`)로 거르기만 하고(한도 밖이면 후보가 아니다) 고르는 차례는 바꾸지 않는다. `priority`는 후보로 남은 점이
  다른 붙잡기와 견줄 때의 자리다. 둘을 함께 줄 수 있다
- 없음·`'normal'`: 0.8.0~0.40.0 규칙 그대로 — 붙잡기 거리 안에서 화면에 가장 가까운 보이는 점, 같으면 고르기 꼭짓점·끝점·가운데 점 → 앱 점(`pointsFor` → `points`) → 교차점·수직 발 → 열린 후보
- `'low'`: 점 붙잡기끼리 견줄 때 다른 점(고르기 점, 보통 앱 점, 교차점·수직 발·열린 후보)보다 `LOW_PRIORITY_YIELD_PX`(반 화소) 넘게 가까울 때만 이긴다. 겹친 점(같은 화면 거리 —
  반올림만큼 다른 점도)이면 뒤 차례인 교차점·수직 발에도 진다. `'low'`끼리는 0.8.0 규칙이다. 점 붙잡기로 이기면 그 뒤는 보통 앱 점과 같다(축·나란함 같은 선 붙잡기는 점 붙잡기가 없을 때만 본다)
- `'fallback'`: 다른 붙잡기가 하나도 없을 때만이다 — 점 붙잡기(고르기 점·보통·`'low'` 앱 점·교차점·수직 발·열린 후보), `refineEnds`, 끌어온 점 후보(축끼리·모서리·면·열린 교차·
  안내 선이 만나는 점 등 열세 가지), 첫 점 축·나란함, 끌어온 축·안내 선이 모두 없을 때 커서 붙잡기 거리 안에서 화면에 가장 가까운 보이는 `'fallback'` 점(같으면 앞의 것)이다.
  붙잡지 않은 자리(선분·면 위 점과 그 다듬은 점)보다만 먼저다. 잠근 동안(Shift·`setMeasureInferenceLock`)에는 점 붙잡기와 잠근 선이 만나는 점(`lockEdges`·`lockFaces`·`lockTracks`)이
  없을 때 그 점을 잠근 선에 내린 자리(`from`·`fromSnap`)다 — 커서를 내린 자리보다 먼저
- `points`(늘 후보 — 색인 길도)와 `pointsFor` 점 모두에 쓴다. 이긴 `'fallback'` 점은 보통 앱 점이 이긴 것과 같은 길(꺾은선 꼭짓점 종류면 `refineEnds`, 수직 발 종류면 첫 점 → 그 점 방향,
  선분 방향 잠금)을 지난다
- 비용: `'fallback'` 점은 후보에서 빼 모아 두었다가 사슬 끝에서 한 번 고른다(보이는지 묻기도 그때만). 우선을 단 점이 하나도 없는 목록은 점마다 칸을 두지 않는다

```ts
// STEP 꼴: 끝점·가운데 점·중심·접점은 보통(0.40.0 그대로), 곡선–면 교차점은 다른 붙잡기가 없을 때만
viewer.setMeasureSnap({
  ...snap,
  pointsFor: (pick, ctx) => [
    ...edgePoints(pick, ctx),
    ...crossingsOf(pick).map((point) => ({ point, kind: 'intersection' as const, priority: 'fallback' as const })),
  ],
});
```

### 설계 근거(CAD 설명서)

- AutoCAD는 켜 둔 객체 스냅이 여럿이면 종류와 상관없이 고른 스냅 모드들이 조준 상자 가운데에 가장 가까운 점을 돌려주고(Autodesk 도움말 OSNAP 명령·3D Object Snap 탭),
  한 자리에 여럿이 맞으면 Tab으로 돌려 고른다("About Using Object Snaps"). 종류마다의 차례 표는 없다 — 코어 기본(가장 가까운 점)이 이것이다.
  출처가 다른 입력 사이의 우선은 설정으로 둔다: OSNAPCOORD는 키보드로 친 좌표와 켜 둔 객체 스냅 가운데 어느 쪽이 이기는지를 고른다(0 객체 스냅, 1 키보드, 2 스크립트만 객체 스냅 — 기본 2).
  `priority`는 같은 생각으로 "앱이 더한 점"이라는 출처에 우선을 다는 길이다
- SOLIDWORKS 스케치 스냅은 "Nearest"를 켜면 포인터가 그 점 둘레일 때만 붙고, Quick Snaps는 한 번 그리는 동안 고른 스냅만 남겨 나머지를 거른다(SOLIDWORKS 도움말 Sketch Snaps·Quick Snaps).
  "가까울 때만"과 "다른 것을 거르기"를 사용자가 고르는 것이다. 코어는 Tab·한 번 거르기 같은 사용자 조작을 두지 않고(앱 몫), 앱이 점마다 "같은 화면 거리면 뒤"(`'low'`)와
  "다른 붙잡기가 없을 때만"(`'fallback'`)을 고른다
- 숫자 차례(예: 0~9)를 두지 않은 까닭: 코어 붙잡기는 점 붙잡기 한 줄과, 점 붙잡기가 없을 때만 보는 선 붙잡기(축·안내 선) 사슬로 나뉘어 있어 숫자 하나로 두 줄 사이 자리를 정하기 어렵다.
  요청한 두 규칙(같은 거리면 뒤, 다른 붙잡기보다 뒤)을 그대로 이름으로 두었다
- 반 화소: 겹친 두 점이 서로 다른 계산(B-rep 곡선 위 점과 꺾은선 교차 등)으로 반올림만큼 다르면 화면 거리도 아주 조금 달라 "같은 거리"가 엇갈린다.
  0.8.0 가운데 점 양보(`MIDPOINT_YIELD_PX` 2)·0.17.0 끌어온 점 후보 양보(`TRACK_YIELD_PX` 1)와 같은 꼴로 화면 한 화소 안을 같은 자리로 본다

### 최근접점 나눠 돌리기(`closestPointsAsync`)와 두 점이 놓인 기본 도형 번호(`indices`)

- `closestPointsAsync(idA, idB, opts)` → `Promise<ClosestResult | null>`: `closestPoints`와 같은 계산을 조각마다 `sliceMs`(기본 8 ms, 1000 위는 1000)를 넘기기 전에 멈추고
  다음 작업으로 넘긴다(쉬는 길은 `MessageChannel` — 브라우저의 `setTimeout(0)`은 다섯 번째부터 4 ms 넘게 미뤄진다 —, 없으면 `setTimeout(0)`). 시계는 마디 쌍 64개마다 본다
- 답(두 점·거리·번호)은 끝날 때의 장면으로 부른 `closestPoints`와 바이트까지 같다. 찾기 상태(마디 쌍 더미·지금 최솟값·세계 상자·정점 기억)를 `ClosestSearch`로 떼고
  `closestBetween`도 같은 것을 한 번에 끝까지 돌리므로(`step(∞)`), 나눠도 같은 차례로 같은 쌍을 본다
- 도는 동안 두 묶음의 모양이 바뀌면(그물 바꾸기·지우기 — 정점·번호 배열·BVH, 숨긴 구간 `setHiddenRanges`, 묶음 행렬·원점의 값) 처음부터 다시 찾는다(`stats.restarts`).
  같은 값의 행렬을 다시 걸면 그대로 간다. 묶음을 지우거나 뷰어를 닫으면 `null`이다
- `signal`(AbortSignal)이 멈추면 `signal.reason`으로 거절한다(부르기 전에 멈췄으면 곧바로). 측정 짝이 바뀌면 앱이 앞 것을 멈춘다
- BVH가 아직 없는 묶음은 그 묶음 BVH를 한 작업에서 만든 뒤 쉰다(BVH 만들기는 나누지 않는다 — 장면을 올리면 쉬는 틈에 미리 만들어 두므로 보통은 이미 있다)
- `stats`(`{ slices: 0, longest: 0, visited: 0, restarts: 0 }`을 주면 그 자리에 적는다): 조각 수·가장 긴 조각(ms)·마지막 찾기에서 꺼낸 마디 쌍 수·다시 찾은 횟수
- 순수 함수: `ClosestSearch`(`step(n)`·`done`·`result`·`visited`), `closestBetweenAsync(A, B, { …, wait, now?, signal?, sliceMs?, stats? })`(쉬는 길·시계를 받는다 — 앱 워커에서도 쓴다), `closestSlice`
- `indices: true`(기본 꺼짐 — 끄면 결과는 0.40.0처럼 `a`·`b`·`distance`뿐이다): `rawA`·`rawB` = 두 점이 놓인 기본 도형의 배열 안 번호(`Pick3d.raw`와 같은 뜻 — 그물 삼각형 번호,
  선분·점 배열 안 번호), 뷰어는 `indexA`·`indexB` = 원본 식별 번호(`Pick3d.index`와 같은 뜻 — `segmentIds`·`pointIds`를 거친 번호, 그물이면 삼각형 번호)도 싣는다.
  걸친 짝(거리 0)은 처음 찾은 걸친 쌍이다. 앱은 면 표(삼각형 구간)로 그 점이 놓인 면을 바로 찾는다(그물 삼각형을 다시 훑지 않아도 된다)

```ts
let job: AbortController | null = null;
async function partsDistance(a: string, b: string): Promise<void> {
  job?.abort();
  const ac = (job = new AbortController());
  try {
    const r = await viewer.closestPointsAsync(a, b, { indices: true, signal: ac.signal });
    if (r) show(r.distance, r.a, r.b, faceOf(a, r.indexA!), faceOf(b, r.indexB!));
  } catch (e) {
    if ((e as Error).name !== 'AbortError') throw e;
  }
}
```

### 워커가 아니라 시간 조각인 까닭(잰 값)

이 기계(Node 24, load average 7~12)에서 합성 짝을 잰 값이다(가운데값, 일곱 번 — 나눠 돌리기의 쉬는 길은 바로 풀리는 약속이라 계산 시간만).

| 짝 | 삼각형 | 한 번에 ms | 나눠 ms(조각 수 · 가장 긴 조각 ms) | 두 그물 배열 복사 | BVH 배열 복사 | BVH 다시 만들기 |
|---|---|---:|---|---|---|---:|
| 같은 축 핀–구멍(반지름 1.91·2, 둘레 192·256 × 높이 64칸) | 24,576 · 32,768 | 910 | 906(113 · 8.7) | 1.0 MB 0.12 ms | 1.2 MB 0.18 ms | 32 ms |
| 같은 핀–구멍(둘레 384·512 × 128칸) | 98,304 · 131,072 | 3,698 | 3,695(460 · 8.5) | 4.1 MB 0.79 ms | 5.1 MB 1.0 ms | 35 ms |
| 구 안 구(틈이 한쪽으로 좁다) | 36,864 · 65,536 | 1,286 | 1,271(161 · 8.6) | 1.9 MB 0.40 ms | 2.6 MB 0.40 ms | 40 ms |
| 떨어진 두 구 | 65,536 · 65,536 | 10.7 | 10.7(2 · 8.5) | 2.4 MB 0.63 ms | 3.4 MB 0.53 ms | 37 ms |

- 나눠 돌리는 덧비용은 잴 수 없을 만큼 작고 조각은 8 ms를 0.7 ms 넘지 않았다. 답은 모두 바이트까지 같았다
- 워커 길: 보내는 쪽 복사(`structuredClone` — `postMessage`가 보내는 쪽에서 하는 직렬화)는 작지만(위 표), 빈 워커를 띄워 첫 왕복까지 15.7 ms이고(`worker_threads`), 워커는 BVH를
  다시 만들거나(32~40 ms) BVH 배열까지 받아야 하며, 잴 때마다 다시 보내지 않으려면 장면 그물의 사본을 들고 있어야 한다(메모리 두 벌). 숨긴 구간은 함수라 그대로 넘기지 못하고
  (구간 목록으로 바꿔야 한다), 코어가 워커 파일을 내놓으면 앱 번들러 설정(워커 주소)이 따라와야 한다. 나눠 돌리기는 복사·사본 없이 같은 코드를 같은 차례로 돌리므로 답이 같다는 것을
  구조로 지킨다 — 그래서 이것을 골랐다
- 워커가 필요한 앱(위 고운 핀–구멍처럼 한 번에 수 초)은 `opencad-viewer3d/closest`(DOM 없음)의 `ClosestSearch`·`closestBetween`을 제 워커에서 쓴다(정점·번호·BVH 배열과 행렬을 보낸다)

### 확인

- 시험 `tests/v0410priority.test.ts`(9개): `snapPriority`, 우선이 없으면 `chooseMeasureSnap`이 0.40.0 사본과 같은 점·같은 차례로 보이는지 묻기(무작위 3,000가지),
  `'low'` 반 화소 양보(보통 점·고르기 점·뒤 차례 교차점 — 앞·뒤 차례 모두), `'fallback'`(가운데 점·교차점·첫 점 축·수직 발에 지고 다른 붙잡기가 없는 자리에서만 — 찍은 결과 종류도 그 점),
  잠근 동안 잠근 선에 내린 자리, `pointsFor`·색인(앱 점 600개) 길, `'normal'`을 단 목록과 우선 없는 목록의 커서 격자 미리 보기가 같다.
  `tests/v0410closest.test.ts`(7개): `ClosestSearch.step(1·3·64·∞)`이 `closestBetween`과 바이트까지 같다(9짝 × `indices` 켬·끔), 번호의 기본 도형 위 점, `closestBetweenAsync`의 조각·멈추기,
  뷰어 다섯 짝이 `closestPoints`와 같고, 도는 동안 행렬·숨긴 구간이 바뀌면 다시 찾고, 멈추기·닫기·없는 id, `indexA`·`indexB`(`segmentIds`·`pointIds`).
  typecheck와 전체 시험(86파일 882개)이 통과한다
- 넓은 탐색(가짜 WebGL, 경우마다 새 뷰어·새 기억, 40차 머리 68d99d1과 행 단위로 견줌): 37차 넓은 탐색 사본 275,836자리와 38차 모서리 꼴 3,600경우 871,200자리가
  모두 같다(행 파일이 바이트까지 같고 앱 호출도 같다 — 닫힌 3,640·열린 5,960번)
- 미리 보기 한 번(가짜 WebGL 그리기 포함, 400자리 × 세 번, 68d99d1·head·`'low'`·`'fallback'`을 차례를 돌려 세 짝, load average 4~8 — 가운데값 ms):

  | 장면 | 68d99d1 | head(우선 없음) | `'low'` | `'fallback'` |
  |---|---:|---:|---:|---:|
  | 곧은 선 82개 격자 + 앱 점 20,000개(색인) + `pointsFor` 셋 | 0.0457 | 0.0458 | 0.0459 | 0.0456 |
  | 40차 장면(원호 0.0005·12토막 0.05·50토막 거리 15·촘촘 0.05·0.5) | 0.057·0.053·0.059·0.600·0.515 | 0.057·0.054·0.060·0.588·0.518 | | |

  `pointsFor` 호출은 넷 모두 102·204번, 40차 장면의 앱 `refine` 호출도 같다. 앱 점 장면의 처음 400자리에서 고른 종류는 68d99d1과 head가 같고, `'low'`는 교차점 46 → 44·가운데 점 14 → 16,
  `'fallback'`은 교차점 46 → 29·가운데 점 14 → 31자리다(앱 점이 겹치거나 더 가까웠던 자리가 가운데 점으로 — 그 밖은 같다)
- 화소·값 회귀(960 × 600, 판마다 두 번): `npm run pixels -- --base 68d99d1 --timeout 900`(40차 머리)으로 장면 137개·값 105묶음이 모두 같고, 새 값은 `base-measure-priority` 하나다
  (head에서 두 번 찍어 같음, 1,096초, load average 6~45). 그 값에서 우선 없음과 `'normal'`은 같은 값(208줄)이고, `'low'`는 이 격자에서 바뀐 자리가 없으며,
  `'fallback'`은 앱 점에 붙던 5자리가 꼭짓점으로 바뀌었다(미리 보기와 누른 결과 10줄). `--base v0.33.0`으로는 0.33.0으로도 찍을 수 있는 장면 131개·값 92묶음이 같고,
  값 `hole-measure-normal`은 0.36.0이 바꾼 3자리 그대로(0.37.0~0.40.0 때와 같은 값), 새 장면 6개·새 값 13묶음이다(356초, load average 10~20).
  더한 값은 격자 180자리 × 넷이라(그 값만 찍으면 head 3.5초) CI 화소 비교 시간은 0.40.0과 거의 같다

### 남은 한계

- 우선은 두 단계다. 종류마다의 차례 표(교차점 > 가운데 점 같은)와 Tab으로 같은 자리 후보 돌리기(AutoCAD)는 없다. `'low'`는 점 붙잡기끼리만, `'fallback'`은 붙잡지 않은 자리보다만 먼저다 —
  "축보다는 먼저, 가운데 점보다는 뒤" 같은 가운데 자리는 없다
- `'fallback'` 점은 다른 붙잡기가 있으면 고르지 않으므로, 첫 점 축을 켠 앱에서는 첫 점을 찍은 뒤 첫 점 축 둘레(붙잡기 거리 안)에서 붙지 않는다
- 최근접점 나눠 돌리기는 BVH 만들기를 나누지 않는다. 같은 축 짝(핀–구멍)은 틈이 고르게 좁아 상자 거리 가지치기가 약하므로 삼각형 수에 거의 비례해 마디 쌍을 본다 — 고운 짝은 수 초 걸리고
  그동안 주 스레드를 8 ms씩 쓴다. 마디 쌍을 상자 거리 차례 더미(우선순위 큐)로 꺼내면 줄 수 있지만 같은 거리 동점에서 고르는 쌍(번호·점)이 바뀔 수 있어 두었다
- 도는 동안 모양이 끊임없이 바뀌면(끄는 동안 행렬을 프레임마다 바꾸면) 끝나지 않고 다시 찾는다 — 앱은 끌기를 마친 뒤 부르거나 멈춘다. 마주 보는 그물(billboard)은 카메라에 따라 행렬이 바뀌므로
  도는 동안 카메라가 움직이면 다시 찾는다

### 면별 최소 거리(STEP 45차 선택 요청 — 설계만, 넣지 않았다)

- 요청: 두 부품에서 고른 두 면(삼각형 구간) 사이 삼각형 최소 거리(앱이 따로 둔 삼각형 사이 거리 코드를 대신)
- 설계: `closestPoints(idA, idB, { rangeA?, rangeB? })`(`IndexRange` — `{ start, count }` 삼각형 구간 하나, 면 표가 면마다 이어진 삼각형 구간이면 그대로).
  이어진 구간은 번호 배열의 `subarray`(번호 배열이 없으면 정점 배열의 `subarray`)로 복사 없이 그 구간만의 BVH를 만든다(구간 열쇠로 기억 — 그물을 바꾸면 버린다).
  결과 `rawA`는 구간 시작을 더해 그물 번호로 돌리고, 숨긴 구간은 지금처럼 함수로 거른다. 같은 `ClosestSearch`라 나눠 돌리기·`indices`가 그대로 붙는다
- 이어지지 않은 면(구간 여럿)은 구간을 이어 붙인 번호 배열을 새로 만들거나(복사), 그물 전체 BVH에 거르는 함수를 주면 복사는 없지만 가지치기가 약하다(구간 밖 마디도 내려간다) —
  앱의 면 표 꼴을 보고 고른다
- 앞의 둘과 겹치지 않는다: 우선은 측정 붙잡기 차례만, 이것은 최근접점의 입력(삼각형 범위)만 바꾼다

### 앱이 할 일

- STEP: 코어를 0.41.0으로 올린다(0.38.0~0.40.0 다음). 곡선–면 교차점(`pointsFor` kind `'intersection'`)에 `priority: 'fallback'`을 달면 43차 측정 격자에서 바뀐 116자리 가운데
  다른 붙잡기였던 62자리(X축 방향 49·가운데 점 11·수직 발 2)는 예전 붙잡기로 돌아가고, 붙잡지 않던 54자리만 교차점으로 남을 것이다(앱이 같은 격자로 다시 재어 확인한다).
  같은 화면 거리일 때만 뒤로 두려면 `'low'`다. 부품 사이 최소 거리를 `closestPointsAsync`로 바꾸면 긴 작업에서 코어 몫(70~95 ms — CPU 4배 느리게)이 8 ms 조각으로 나뉜다.
  받는 쪽이 이미 시간 조각(46차)이라 같은 꼴로 잇고, 측정 짝이 바뀌면 `signal`로 멈춘다. `indices: true`로 받은 `indexA`·`indexB`(삼각형 번호)로 면 표에서 면을 찾으면
  두 점 둘레 삼각형을 다시 훑지 않아도 된다
- NC: 코어를 0.41.0으로 올린다. 할 일은 없다(우선을 달지 않으면 0.40.0 그대로이고, 원호 중심의 `order`·한도도 그대로다)
- SKP: 코어를 0.41.0으로 올린다. 할 일은 없다. `SnapKind`는 그대로라 `SNAP_LABELS`·`SNAP_COLORS`(`Record<SnapKind, string>`)는 그대로 typecheck가 지난다
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.42.0: 같은 그물 자리를 그리기 한 번에(인스턴싱 — STEP 48차 요청)·PBR 법선·거칠기 그림 설계(SKP 40차 요청 — 설계만)

같은 배열(`positions`·`normals`·`indices`·`edges` 등 배열 객체)을 함께 쓰는 그물 자리 — 자리 행렬·id·색만 다른 같은 정의의 자리(STEP 조립의 같은 부품, SketchUp 컴포넌트) — 가
보이는 것만 8개(`INSTANCE_MIN`) 이상이면 자리마다 그리지 않고 같은 그물끼리 그리기 한 번(WebGL2 인스턴싱)으로 그린다. **바뀐 기본 동작이다**(아래 "바뀐 기본 동작").
같은 그물 자리가 7개 이하인 장면은 0.41.0과 같은 길·같은 차례로 그린다(지금 화소·값 회귀 장면은 모두 그렇다 — 바이트까지 같다).

- 새 선택: `Viewer3d.setRenderOptions({ instancing })` — `false`면 끄고(0.41.0 그대로), `{ min }`이면 하한(2 이상)을 바꾸고, `true`면 기본(켬, 하한 8)으로. `renderOptions.instancing`(`{ on, min }`)
- 새 값: `stats.instanced` = `{ draws, items, pending }`(지난 그리기에서 모아 그린 그리기 호출 수·그렇게 그린 자리 수·번역을 기다리는 인스턴싱 변종 수). 상수 `INSTANCE_MIN`, 타입 `InstancingOptions`
- 장면 계약(`Scene3d`·`Mesh3d`)은 그대로다. 앱은 같은 정의의 자리에 같은 배열 객체를 주면 된다(STEP 해석기는 이미 그렇게 준다 — SKP 해석기는 배치를 재질·태그 묶음으로 구워 합친다)

### 동작

- 모으는 것: 불투명 면(무늬 있는 것도), 외곽선 깊이 그림, 그물 윤곽선(`edges` — 가는 선·굵은 선 모두), 윤곽선 없는 그물의 와이어프레임·숨은 선 삼각형 변, 숨은 선 점선.
  묶음 = 같은 그물(정점 속성·색인 버퍼와 그 꼴·그릴 수·무늬·무늬 좌표 축척·한쪽 면)이면서 균일 변수가 같은 자리(면은 색·강조·정점 색·무늬 쓰기, 선은 색·굵기·불투명도).
  자리 색(`setItemColor`)·강조·불투명도가 다른 자리는 따로 묶음이 되고, 행렬(`setItemMatrix` — 분해도)·마주 보는 그물 돌림은 자리마다 그대로 든다
- 그물마다(0.41.0 그대로) 그리는 것: 단면이 있을 때 모두(자리마다 로컬 평면이 다르다), 반투명 면·X-ray 면(뒤에서 앞으로 정렬), 묶음 안 구간이 있는 그물(`setHiddenRanges`·`highlightRanges`),
  뒷면 색·무늬 변종 그물, 그림자를 켰을 때의 면(자리마다 그림자 행렬 — 윤곽선은 모은다), 그물마다 외곽선 색(`setItemProfileColor`)을 쓴 외곽선 깊이 그림, 선분·점 묶음
- 같은 그림: 자리 행렬은 예전 `setMeshMatrix`·`drawLines`와 같은 double 곱(시점 · 모형, 투영 · 그것, 법선 행렬 / 시점·투영 · 모형, 안개 깊이 행)을 float32로 자리 자료 그림
  (RGBA32F, 폭 1024 텍셀 — 그물 자리 하나 11텍셀, 선 자리 하나 5텍셀)에 쓰고, 셰이더 변종 `INST`가 `gl_InstanceID`로 그 텍셀을 읽어 예전 균일 변수와 같은 이름의 지역 변수로 둔다
  (아래 식은 한 글자도 바뀌지 않는다). 같은 float 값에 같은 연산이라 면은 바이트까지 같다(묶음 원점 1e6대의 큰 좌표도 — RTC가 double 곱 그대로다)
- 굵은 선(굵기 > 1 장치 화소·점선)은 선분 하나 = 사각형 인스턴스 하나라, 모은 그리기의 인스턴스 = 선분 × 자리이고 선분 속성의 나눔 수를 자리 수로 걸어 그린 뒤 1로 되돌린다
  (자리 = `gl_InstanceID % 자리 수`). 정점 속성 16자리 한도 때문에 자리 행렬을 인스턴스 속성이 아니라 자료 그림으로 둔다(그물은 이미 다섯 자리, 행렬 셋이 열한 자리를 쓴다)
- 셰이더 번역: `KHR_parallel_shader_compile`이 있으면 `INST` 변종 번역을 걸어 두고 다 될 때까지 그물마다 그린 뒤 다음 프레임에 다시 그린다(`stats.instanced.pending`).
  기계 GPU(ANGLE Metal, 새 프로필 — 번역 저장소가 비었을 때)에서 변종 둘의 번역이 첫 프레임을 383 ms 붙잡던 것(처음 만든 판)을 없앴다. 없으면 처음 쓸 때 바로 번역한다. 번역에 실패하면 그 문맥에서는 인스턴싱을 끈다
- 메모리: 자리 자료 그림 하나(1024 × 줄 수, 줄은 16부터 두 배씩 — 자리 3,000에 면·선 합쳐 1 MB). `stats.buffers`에는 들지 않는다. 삼각형 변 색인은 묶음 첫 그물 것 하나만 만든다

### 바뀐 기본 동작

- 모은 묶음은 장면 차례가 아니라 같은 그물끼리 그린다(묶음 안 자리 차례는 장면 차례). 서로 다른 그물이 같은 깊이로 겹치는 화소만 결과가 다를 수 있다 —
  맞닿은 면의 깊이 동점(z-fighting)과, 깊이를 쓰면서 섞는 반투명 모서리 선(음영+윤곽 0.75·X-ray 0.9 알파)이 다른 정의 자리끼리 엇갈린 화소다.
  합성 장면(정의 12 × 자리 120 — 눕힌 원기둥이 이웃 자리를 파고든다, 960 × 600)에서 면은 모든 모드에서 바이트까지 같고(음영·외곽선 깊이), 와이어프레임+외곽선·숨은 선(점선)·
  단면도 같다. 음영+윤곽은 105화소(그림의 0.02%, 가장 큰 차 19/255), 강조·자리 색·반투명·분해·숨기기를 섞은 장면은 38화소, X-ray는 275화소(14/255)가 다르다 —
  모두 반투명 모서리 선이 다른 정의 자리끼리 겹친 자리다(base `a01dcdf` ↔ head 화소 회귀와 head 안 켬·끔 값이 같은 수)
- `stats.drawCalls`가 준다(삼각형·선분 수는 같다). 앱이 그리기 호출 수로 무엇을 정했다면 `stats.instanced`를 함께 본다

### 왜 인스턴싱인가(잰 값)

STEP 48차 요청은 "인스턴싱이나 나눠 올리는 동안 다시 그리기 줄이기"였다. 같은 꼴 장면(`npm run bench:many` — 정의 12개(닫힌 원기둥, 삼각형 306~919개)를 모듈 30 × 자리 100에 돌려 놓은
3,000자리, 삼각형 182만 개, 윤곽선 있음, 음영+윤곽)을 코어에서 재어 골랐다.

- 0.41.0은 프레임마다 자리마다 면(행렬 균일 변수 셋·색·깃발·그리기)과 윤곽선(프로그램·균일 변수 열둘·그리기)을 따로 건다 — 그리기 호출 6,004·GL 호출 45,047(외곽선을 켜면 63,083)
- 자리들이 배열을 함께 쓰므로 나눠 올리기(`incremental` 8 ms)에서 새로 올릴 배열은 정의 12개뿐이라 3,000자리가 2~3프레임(CPU 4배 느리게 7~10프레임) 만에 다 올라간다.
  다시 그리기를 줄여 얻을 몫은 그 몇 프레임뿐이고, 자리마다 그리는 몫은 다 올린 뒤에도 돌려 볼 때마다 남는다 — 그래서 프레임마다의 몫을 줄이는 인스턴싱을 골랐다
- SwiftShader(소프트웨어 GPU)에서는 그리기 명령이 많으면 주 스레드의 GL 호출이 GPU 쪽 처리를 기다려 프레임이 길어졌다(STEP 48차 헤드리스 프로필의 `drawLines`·`bindWide`·`setMeshMatrix`
  몫과 같은 꼴). 명령이 350개로 줄어 그 기다림이 없어졌다

기계 GPU(ANGLE Metal, Apple M1 Pro), 다 올린 뒤 조금씩 돌리며 다섯 번 × 판을 번갈아 두 번, 가운데값 ms(load average 13~25). head 인스턴싱 끔은 0.41.0과 같은 값이다(음영+윤곽 4.6·13.7 ms):

| 모드 | 그리기 JS 0.41.0 → 0.42.0 | GPU 마침까지 | CPU 4배 느리게: 그리기 JS | GPU 마침까지 | 그리기 호출 | GL 호출 |
|---|---:|---:|---:|---:|---:|---:|
| 음영+윤곽 | 4.3 → 2.1 | 12.8 → 7.2 | 16.4 → 7.3 | 21.8 → 12.3 | 6,004 → 28 | 45,047 → 350 |
| 음영 | 2.9 → 1.5 | 9.0 → 5.8 | 12.0 → 6.0 | 16.9 → 11.0 | 3,004 → 16 | 18,045 → 156 |
| 음영+윤곽+외곽선 | 7.8 → 3.3 | 19.3 → 9.8 | 30.6 → 15.5 | 36.1 → 19.3 | 6,005 → 29 | 63,083 → 497 |
| 음영+윤곽, 두 자리 강조 | 4.9 → 2.2 | 13.6 → 7.5 | 19.1 → 9.5 | 24.8 → 13.8 | 6,004 → 32 | 45,067 → 426 |

처음 열기(`setScene` 나눠 올리기 8 ms → 다 올린 뒤 두 프레임, 판마다 두 번):

| 백엔드 | 다 올림 ms | 프레임 JS 합 | 가장 긴 프레임 | 긴 작업(50 ms 넘는) 합 |
|---|---:|---:|---:|---:|
| 기계 GPU | 29 → 34 | 35 → 31 | 15.3 → 16.9 | 0 → 0 |
| 기계 GPU, CPU 4배 느리게 | 194 → 181 | 182 → 156 | 29.1 → 21.3 | 0 → 0 |
| SwiftShader | 467(29~905) → 41 | 989 → 38 | 908 → 18 | 976 → 0 |

- SwiftShader에서 다 올린 뒤의 GPU 마침(0.8~1.9초)은 삼각형 182만 개 래스터 몫이라 그대로다(외곽선을 켠 프레임은 흔들림이 커 0.41.0 1.5초·0.42.0 1.9초 — 셰이더가 정점마다
  자리 자료 텍셀을 읽는 몫일 수 있다). 기계 GPU에서는 GPU 마침까지가 절반쯤으로 준다
- 남은 주 스레드 몫(CPU 4배 느리게 음영+윤곽 7.3 ms)은 자리마다 행렬 곱·자료 쓰기와 보이기·겉모습 묻기다

### 확인

- 시험 `tests/v0420inst.test.ts`(9개, 가짜 WebGL): 같은 정의 12자리는 그리기 한 번·3자리(하한 아래)와 하나뿐인 그물은 그물마다, 자리 자료 텍셀이 인스턴싱을 끄고 그물마다 그릴 때의
  균일 변수(`u_mvp`·`u_mv`·`u_nmat`, 윤곽선 `u_mvp`)와 같은 float 값·장면 차례, 강조 윤곽선(굵은 선)의 선분 나눔 수(자리 수 → 1), 그물마다로 돌아가는 경우(단면·그림자 면·묶음 안 구간·
  반투명·숨긴 묶음·끔·하한)와 묶음 나누기(자리 색·불투명도), 다섯 모드의 켬·끔 삼각형·선분 수, 삼각형 변 색인 하나, 병렬 번역을 기다리는 동안 그물마다·다 되면 모아서.
  두꺼운 선 셰이더 비교 시험(`lines080`)은 `#ifndef`를 읽게 해 `INST`가 없는 변종이 0.7.2 원본과 글자까지 같은지 그대로 본다. typecheck와 전체 시험(87파일 891개)이 통과한다
- 화소·값 회귀(960 × 600, 판마다 두 번): `npm run pixels -- --base a01dcdf --timeout 900`(41차 머리)으로 0.41.0 장면 137개·값 106묶음이 모두 같다(바이트까지 — 같은 그물 자리가 8개
  넘는 장면이 없어 0.41.0 길 그대로). 새 장면 `many-*` 10개(base 판은 그물마다 그리므로 base ↔ head가 곧 인스턴싱 끔 ↔ 켬) 가운데 음영·와이어프레임+외곽선·숨은 선·단면 넷이 같고,
  음영+윤곽(105화소)·겉모습 섞기(38)·해+안개(100)·그림자(105)·X-ray(275)·큰 좌표 음영+윤곽(105) 여섯은 반투명 모서리 선이 겹친 자리만 다르다(위 "바뀐 기본 동작" — 의도한 차이).
  새 값 `many-picks`·`many-off-picks`(고르기)는 두 판이 같고, `many-instancing`(head만)은 일곱 경우의 켬·끔 삼각형·선분 수가 같고 그리기 호출만 준다
  (음영 124 → 16, 음영+윤곽 244 → 28, 숨은 선 364 → 40, X-ray 244 → 136, 단면 246 그대로), 다른 화소는 위 화소 회귀와 같은 수다. head를 두 번 찍어 같았다(567초, load average 16~22).
  `--base v0.33.0`으로는 0.33.0으로도 찍을 수 있는 장면 135개(새 `many-*` 넷 포함)·값 94묶음이 같고 `many-*` 여섯은 위와 같은 화소 수, `hole-measure-normal`은 0.36.0이 바꾼 3자리 그대로,
  새 장면 6개·새 값 14묶음이다(459초)
- 메모리(기계 GPU, 판마다 두 번): GPU 버퍼는 0.2 MB로 같고(배열을 함께 쓰는 정의 12개 — 자리 자료 그림 약 1 MB는 따로), JS 힙은 12.9 → 16.3 MB(8~18 MB로 흔들림 — 자리 자료 CPU 배열 약 0.5 MB)
- CI 화소 비교 시간: 새 장면 10개는 찍기마다 0.2~0.9초, `many-instancing`은 head에서 18초라 판마다 두 번 찍으면 1분쯤 는다

### 남은 한계

- 단면을 켜면 모두 그물마다다(로컬 평면을 자리마다 자료 그림에 더하면 모을 수 있다 — 그물 변종은 정점 속성 자리가 남지 않아 자료 그림 텍셀로). 그림자를 켜면 면은 그물마다다
  (0.43.0에서 단면 하나·그림자의 면은 그렇게 모은다)
- 반투명 면은 그물마다(정렬 차례)이고, 묶음 안 구간이 있는 그물·뒷면 변종 그물도 그물마다다
- 같은 그물 열쇠는 배열 객체(버퍼)가 같아야 한다 — 값이 같은 다른 배열은 모으지 않는다(해석기가 배열을 함께 써야 한다)
- 나눠 올리기는 그대로 프레임마다 그때까지 올린 것을 다시 그린다. 같은 배열을 함께 쓰는 자리는 몇 프레임 안에 다 올라가 다시 그리기 몫이 작지만, 서로 다른 큰 배열이 많은 장면(STEP diverse)은
  그물마다 그리기가 남는다(모을 것이 없다)
- 자리 자료 그림은 그리기마다 다시 올린다(자리 3,000에 1 MB쯤 — 카메라가 움직이면 모든 자리 행렬이 바뀌므로)

### 앱이 할 일

- STEP: 코어를 0.42.0으로 올린다. 해석기가 같은 형상 항목을 한 번만 삼각화해 자리마다 같은 배열을 주므로 할 일은 없다(같은 정의 자리가 8개 이상이면 저절로 모은다 —
  단위 바꾸기 등으로 자리마다 새 배열을 만드는 길이 있으면 모이지 않으니 `stats.instanced.items`로 확인한다).
  48차 합성 same으로 처음 열기·돌려 보기를 다시 재어 앱 몫(번역층 훑기·나무 줄)만 남았는지 본다. 앱 화소 회귀가 있으면 맞닿은 부품의 반투명 모서리 선이 겹친 몇 화소가
  0.41.0과 다를 수 있다(바뀐 기본 동작). 단면을 켜면 모두 그물마다로 돌아가 0.41.0 속도다. 그리기 호출 수를 화면에 보이면 `stats.instanced`를 함께 본다
- SKP: 코어를 0.42.0으로 올린다. 할 일은 없다 — 지금 해석기는 배치를 재질·태그 묶음으로 세계 좌표에 구워 합치므로(같은 배열을 함께 쓰는 자리가 없다) 그리는 길이 0.41.0과 같다.
  같은 컴포넌트를 아주 많이 놓은 모형에서 정의마다 그물을 두고 `matrix`로 놓는 길로 바꾸면 모아 그리지만, 지금 합친 묶음도 그리기 호출이 적어 바꿀 까닭은 재어 본 뒤에 정한다.
  PBR 그림은 아래 설계만이다
- NC: 코어를 0.42.0으로 올린다. 할 일은 없다(공구 경로는 선분 묶음이라 모으지 않는다 — 그리는 길이 0.41.0과 같다)
- DWG: 3D 뷰어 코어를 쓰지 않는다

### PBR 법선·거칠기 그림(SKP 40차 요청 — 설계만, 넣지 않았다)

0.43.0에서 넣었다(아래 0.43.0 절). 이 설계와 달라진 것: 접선(`tangents`)·`Texture3d.data` 꼴 표시는 넣지 않았고, 그림이 있을 때 금속성 배율 기본은 glTF처럼 1,
그림도 값도 없는 거칠기는 0.42.0 반사광 그대로, SketchUp처럼 따로 준 거칠기·금속 그림과 매끈함 그림·DirectX 꼴 법선 그림을 더했고, 무늬 단위는 6·7·8이다.

- 요청: SketchUp 2021+ 재질의 법선·거칠기·금속 그림(앱 표본 2021+ 810개 가운데 9개에 법선 56·거칠기 45·금속 7장). 지금 코어는 그물마다 앞·뒷면 무늬 한 장씩이다
- 근거 규격(glTF 2.0 Materials — "Metallic-Roughness Material"·"Additional Textures"): 금속·거칠기 그림은 한 장에 담아 초록 채널이 거칠기, 파랑 채널이 금속성이고
  `metallicFactor`·`roughnessFactor`는 그 값에 곱하는 선형 배율이다. 법선 그림은 접선 공간 법선을 RGB에 담고(R·G → X·Y는 [−1, 1], B → Z는 [0, 1]) `scale`은 X·Y에만 곱한다.
  접선(TANGENT)이 없으면 MikkTSpace로 만들고(Geometry "Meshes Overview"), 쌍접선 = cross(법선, 접선.xyz) × 접선.w(±1 손잡이)다
- API 설계: `Mesh3d.normalTexture?: string`(그림 id)·`normalScale?: number`(기본 1)·`metallicRoughnessTexture?: string`·`metallic?: number`(기본 0)·`roughness?: number`(기본 1)·
  `tangents?: Float32Array`(정점마다 xyzw — 없으면 아래 화면 미분), 무늬 좌표는 `uvs`를 함께 쓴다. `Texture3d`에 `data?: 'color' | 'linear'`(법선·거칠기는 색이 아니라 값 —
  코어는 지금도 sRGB 바꾸기 없이 올리므로 올리기는 같고, 밉맵으로 평균한 법선은 셰이더에서 길이를 맞춘다)
- 셰이더: 그물 변종 `NMAP`·`MR`(주지 않은 그물은 지금 변종 그대로라 그림이 바이트까지 같다). 접선이 없으면 조각 셰이더에서 시점 위치·무늬 좌표의 화면 미분(`dFdx`·`dFdy`)으로
  접선 틀을 만든다(정점 속성이 늘지 않는다 — 다만 MikkTSpace 접선과 삼각형 경계·이음매에서 조금 다르다). 거칠기는 지금 고정 반사광 지수(48)를 거칠기로 바꾸고(α = 거칠기²,
  Blinn-Phong 지수 2/α² − 2), 금속성은 반사광 색을 바탕색으로·확산광을 (1 − 금속성)배로 — 둘레 빛(IBL) 없는 어림이다
- 함께 지킬 것: 놓기(0.25.0 `release`)·나중에 주는 무늬(0.38.0 `pending`)·한 장 한도·전체 예산·`stats.textures`가 새 그림에도 같고, 무늬 단위는 0(색)·3(뒷면) 밖의 둘을 쓴다
  (5는 0.42.0 자리 자료 그림)
- SKP가 할 일(넣은 뒤): 재질의 법선·거칠기·금속 그림을 `Scene3d.textures`에 넣고 그물에 id를 단다(SketchUp 거칠기·금속 값이 그림 없이 수만 있으면 `metallic`·`roughness`)

## 0.43.0: PBR 법선·거칠기·금속 그림(SKP 40차 요청)·단면 하나·그림자를 켠 상태의 인스턴싱

그물에 PBR 선택 필드(법선 그림·거칠기·금속성 그림과 값)를 더하고 셰이더가 쓴다. 지금 조명 식은 그대로 두고 법선 그림으로 조각 법선을, 거칠기로 반사광 퍼짐을, 금속성으로
확산광·반사광 색을 바꾼다(둘레 빛 없는 어림 — 아래 "빛 식"). **PBR 필드를 주지 않은 그물은 0.42.0과 바이트까지 같다** — 셰이더 변종 정의(`UV`·`NMAP`·`PBR`)가 없으면
0.42.0 렌더러가 쓰던 변종의 전처리 글이 0.42.0과 글자까지 같다.
42차 남은 한계였던 단면 하나·그림자를 켠 상태의 같은 그물 자리도 면을 그리기 한 번에 모은다(바뀐 기본 동작 — 그림은 같다).

### 새 API

- 장면 계약 `Mesh3d`(모두 선택): `normalTexture`·`normalScale`(기본 1)·`normalFlipY`, `roughness`·`metallic`(0~1), `metallicRoughnessTexture`(glTF — 초록 거칠기·파랑 금속성),
  `roughnessTexture`·`metallicTexture`(따로 준 그림 — 초록·파랑 채널, 회색조 그림이면 그대로), `roughnessInvert`(매끈함 그림). 그림은 `Scene3d.textures`의 id, 무늬 좌표는 `uvs`·`uvTransform`
- 값의 기본: 거칠기 그림이 있으면 `roughness`는 배율(기본 1 — glTF `roughnessFactor`), 없으면 그 값(없으면 0.42.0 반사광 그대로 — 거칠기로 치면 `PBR_DEFAULT_ROUGHNESS` = √0.2 ≈ 0.447).
  금속성 그림이 있으면 `metallic`은 배율(기본 1 — glTF `metallicFactor`), 없으면 그 값(기본 0). 거칠기 그림은 `roughnessTexture`가 `metallicRoughnessTexture`보다 먼저다(금속성도 같다)
- `Viewer3d.setRenderOptions({ pbr })`(기본 켬): `false`면 PBR 필드를 준 그물도 0.42.0 셰이더로 그린다(그림은 올린 채 — 다시 켜면 바로 쓴다). `renderOptions.pbr`
- 내보내기(순수 — `opencad-viewer3d`·`opencad-viewer3d/pbr`): `PBR_DEFAULT_ROUGHNESS`, `PBR_MAX_EXPONENT`(2048), `pbrSource`(필드 정리)·`pbrState`(올라간 그림으로 셰이더가 쓸 것)·
  `specExponent`(거칠기 → 반사광 지수), 타입 `PbrSource`·`PbrState`
- `stats.textures`의 수·바이트에 PBR 그림도 든다(무늬 그림과 같은 표)

### 동작

- 그림 길은 무늬 그림과 같다: 한 장 한도·전체 예산(PBR 그림도 같은 비로 줄인다), 놓기(0.25.0 `release` — 원본을 놓고 문맥을 되찾으면 `restoreNeed.textures`에 든다),
  나중에 주는 그림(0.38.0 `pending` — 그림마다 따로 기다리고 `restoreTexture`로 하나씩 받는다), 동시에 푸는 수 4장
- 무늬 그림이 없어도 PBR 그림이 있으면 무늬 좌표(`uvs`)를 GPU에 올린다(놓기·문맥 복구도 그 무늬 좌표를 다시 받는다)
- 아직 올라가지 않은(푸는 중·기다리는·놓은 뒤 되찾는 중) 그림은 없는 것처럼 본다 — 법선 그림이면 법선을 바꾸지 않고, 거칠기·금속 그림이면 준 값만(값도 없으면 0.42.0 빛 식)
- 쓰지 않는 때: 무늬 없음·단색·숨은 선 모드, 색을 바꾼 묶음(`setItemColor` — 무늬 그림처럼), 뒷면 색·무늬가 칠해지는 쪽(앞면 재질에만), `pbr: false`, 무늬 좌표가 없는 그물.
  X-ray·반투명·해·그림자·안개·단면·강조와는 함께 쓴다. 외곽선 깊이 그림은 PBR 변종 없이 그린다(깊이는 같다)
- 셰이더 변종: `UV`(무늬 그림 없이 무늬 좌표만 읽기)·`NMAP`(법선 그림 — 무늬 단위 6)·`PBR`(거칠기 그림 단위 7·금속성 그림 단위 8 — 그림이 없는 쪽은 흰 1화소 그림이라 배율이 곧 값).
  PBR 그물은 불투명 차례에서 그물마다 맞는 변종으로 그리고, 같은 그물 자리가 8개 이상이면 PBR 인스턴싱 변종으로 모은다(그물 열쇠에 PBR 필드가 든다 — 색을 바꾼 자리는 PBR 없이 따로 묶인다)
- 법선 그림의 접선 틀: 조각마다 시점 위치·무늬 좌표의 화면 미분으로 dp = T·du + B·dv를 풀어(T = ∂p/∂u, B = ∂p/∂v) T를 법선에 맞춰 곧게 펴고 B = n × T(손잡이는 ∂p/∂v 쪽).
  그림 값 (R, G, B)·2 − 1의 X·Y에 `normalScale`(DirectX 꼴이면 Y는 음수)을 곱해 T·B·n으로 펴고 길이를 맞춘다(밉맵으로 평균한 짧은 법선도). 무늬 좌표가 퇴화한(화면 미분이 0) 조각은 법선 그대로

### 빛 식(설계 근거)

- 지금 음영 셰이더: 고정 조명은 주변 0.30 + 주광 0.60·(n·l₁) + 보조광 0.20·(n·l₂) 확산에 주광 반사광 0.2·(n·h)⁴⁸, 해 조명은 주변 + 해 색·(n·l)·그늘에 같은 반사광이다.
  둘레 빛(IBL)·GGX로 전면 PBR을 하면 PBR 필드가 없는 그물까지 그림이 바뀌고 둘레 빛 그림이 필요하다 — 그래서 빛 식은 그대로 두고 PBR 필드를 준 그물의 반사광·확산광만 바꾼다
- 거칠기 r → α = r²(glTF 2.0 부록 B "alphaRoughness"), 반사광 지수 n = 2/α² − 2(Walter 외 2007 "Microfacet Models for Refraction" — Beckmann α와 같은 퍼짐의 Phong 지수, 상한 2048),
  세기는 정규화 (n + 8)/8(Blinn-Phong 에너지 보존 어림 — 매끈하면 작고 밝은 반짝임, 거칠면 넓고 어두운 빛)에 F0 = mix(0.04, 바탕색, 금속성)(glTF 유전체 F0 0.04)과
  그 빛의 확산 세기(0.60·0.20 — 두 고정 빛 모두, 해는 해 색)·n·l을 곱한다. 0.42.0 지수 48은 r = √0.2이다(`PBR_DEFAULT_ROUGHNESS` — 금속성만 주면 이 퍼짐)
- 금속성 m: 확산광을 (1 − m)배로 하고, 주변광 몫(0.30·해 조명의 `ambient`)은 금속이 바탕색으로 되비춘다고 본다(고른 둘레 빛에서 금속 반사 = F0 × 둘레 빛 — 검게 꺼지지 않게).
  그래서 아주 거친 금속(r = 1)은 같은 색 확산면과 밝기가 같고, 매끈한 금속은 빛을 반짝임에 모아 그 밖은 주변광 몫만큼이다(둘레 빛이 없는 어림 — 남은 한계)
- 접선: 화면 미분 대 MikkTSpace(glTF가 접선이 없을 때 권하는 것). SketchUp 면은 평면이고 무늬 좌표가 면 위에서 아핀(사진 맞춤은 원근 — q로 나눈 뒤 미분)이라 화면 미분 틀은
  MikkTSpace가 그 면에 주는 틀(∂p/∂u·∂p/∂v를 법선에 맞춰 편 것)과 같다. MikkTSpace를 코어가 만들면 정점 속성(정점마다 16바이트)·놓기·문맥 복구 길과 큰 구현이 따르고,
  지금 PBR 그림을 주려는 앱(SKP)은 접선이 없다 — 그래서 화면 미분을 골랐다(매끈한 곡면 그물에서는 틀이 삼각형마다 꺾여 이음매가 조금 보일 수 있다)
- 색 공간: 코어는 무늬를 sRGB 바꾸기 없이(`colorSpaceConversion: 'none'`) 올리고 값 그대로 섞으므로 법선·거칠기 그림도 값 그대로 읽힌다(`Texture3d`에 꼴 표시를 더하지 않았다)

### 단면 하나·그림자를 켠 인스턴싱(42차 남은 한계)

- 0.42.0은 단면이 있거나 그림자를 켜면 자리마다 로컬 단면 평면·그림자 행렬이 달라 면을 그물마다 그렸다. 0.43.0은 그 값도 그물마다 그릴 때의 균일 변수와 같은 식(double로 셈한 뒤 float32)으로
  자리 자료 그림에 더 쓴다 — 그림자 행렬 4텍셀(11~14), 로컬 평면 1텍셀(맨 끝), 자리 하나 12·15·16텍셀(셰이더 `u_instStride`). 셰이더는 `INST` 변종에서만 그 균일 변수 선언을 빼고
  같은 이름의 지역 변수로 두어 식이 한 글자도 바뀌지 않는다(같은 float 값에 같은 연산 — 그림이 같다)
- 단면이 있을 때 선(윤곽선·삼각형 변·숨은 점선)은 그물마다다(굵은 선은 정점 셰이더에서 평면으로 자른다 — 0.42.0 그대로). 여러 단면은 면·선 모두 그물마다. 외곽선 깊이 그림도 모은다.
  해 쪽 그림자 깊이 그림은 판이 바뀔 때만 다시 그리므로 그물마다 그대로다

### 바뀐 기본 동작

- PBR 필드를 주지 않은 장면: 없다(바이트까지 같다)
- 단면 하나·그림자를 켠 장면의 같은 그물 자리(보이는 것이 8개 이상): 면을 모아 그린다 — `stats.drawCalls`가 준다(비용 재기 자리 3,000의 음영+단면·음영+그림자 3,004 → 16). 그림은 같다(0.42.0 "바뀐 기본 동작"처럼 같은 그물끼리
  그리는 차례라 서로 다른 그물이 같은 깊이로 겹치는 화소만 다를 수 있다 — 화소 회귀 장면에서는 없었다)
- 무늬 그림 없이 PBR 그림 id만 준 그물은 무늬 좌표를 GPU에 올린다(그 그물의 `stats.buffers.uvs`)

### 확인

- 시험 `tests/v0430pbr.test.ts`(15개): 필드 정리·올라간 그림만 쓰기·기본값·반사광 지수(기본 거칠기 = 지수 48), 셰이더 같음(0.42.0 렌더러가 쓰던 변종 — 예전 정의 10개의 부분 집합에서
  INST를 단면·그림자·뒷면 없이 — 의 전처리 글 해시가 e4780f4와 같다), 변종·균일 변수·무늬 단위 6·7·8·흰 1화소 그림, 무늬 그림 없는 판의 무늬 좌표 올리기, PBR 필드가 없는 그물의
  그리기 같음, 끔·무늬 없음·단색·숨은 선·색 바꾸기는 0.42.0 변종, X-ray에서 씀, 한 예산, 나중에 주는 그림 둘을 각각 받기, 놓기 뒤 문맥 복구, 병렬 번역 동안 0.42.0 변종·
  변종 정의가 바뀌어도 기다림이 끝남, PBR 인스턴싱.
  `tests/v0430inst.test.ts`(5개): 단면 하나(12텍셀)·그림자(15)·둘 다(16)에서 자리 자료가 인스턴싱을 끄고 그물마다 그릴 때의 `u_mvp`·`u_mv`·`u_nmat`·`u_shadowM`·`u_clip`과 같은 float 값,
  윤곽선은 단면이면 그물마다·그림자면 모음, 여러 단면은 모두 그물마다, 외곽선 깊이 그림도 모음. `v0420inst`의 그물마다로 돌아가는 경우를 바뀐 기본 동작으로 고쳤다.
  typecheck와 전체 시험(89파일 911개)이 통과한다
- 화소·값 회귀(960 × 600, 판마다 두 번): `npm run pixels -- --base e4780f4`(42차 머리)으로 0.42.0 장면 147개와 PBR을 끈 `pbr-off`·`pbr-off-sun`·`pbr-noTexture`가
  모두 같다(바이트까지 — 단면을 켠 `many-section`·그림자를 켠 `many-shadows`도: base는 면을 그물마다, head는 모아 그린다). 켠 `pbr-*` 다섯은 새 장면.
  값 111묶음 가운데 108이 같고, `many-instancing`의 단면 경우만 그리기 호출이 246 → 138(모아 그린 그리기 12·자리 120)로 바뀌었다(그림 해시는 켬·끔·base 모두 같다 — 의도한 변화).
  새 값 `pbr-values`: 나중에 주는 그림 셋을 하나씩 받을 때마다 기다림이 줄고 그림이 바뀌며 다 받은 그림이 처음부터 그림을 준 장면과 0화소 다르다, 끔·켬 그림이 다르고 켬 = 처음 그림,
  PBR 판 12자리 인스턴싱 켬·끔 0화소(그리기 7 ↔ 17), DirectX 꼴 그림 + `normalFlipY`와 OpenGL 꼴 그림은 5,284화소가 최대 2/255 다르다(그림 값 반올림).
  `many-instancing-43`: 그림자·단면 채우기·단면 + 외곽선·단면 + 그림자 + 안개·단면 + 숨은 선의 인스턴싱 켬·끔이 0화소(그리기 124 → 16 등), 그림자 + 윤곽선만 105화소(최대 25/255)
  다른데 0.42.0 "바뀐 기본 동작"의 반투명 모서리 선 겹침이다(윤곽선은 0.42.0부터 그림자에서도 모은다 — 면 차이 없음).
  `--base v0.33.0`으로는 0.33.0으로도 찍을 수 있는 장면 138개·값 94묶음이 같고 `many-*` 여섯이 0.42.0과 같은 화소 수(105·38·100·105·275·105), `hole-measure-normal`은 0.36.0이 바꾼 3자리 그대로다.
  head 한 번 찍기 138초·base 115초(load average 10~16) — 판마다 두 번이면 약 8분 30초
- 그림(`pbr-*`, 0.43.0 판만): 법선 그림 판의 돌기는 빛 쪽이 밝고(고정 조명은 왼쪽 위, 해는 왼쪽 앞 — 빛 방향 둘), 위에서 본 판은 그림 위쪽(+v) 가로 띠가 솟아 보여 초록 = 위가 맞고,
  금속 거칠기 판은 거칠기 0.1 칸이 작고 밝은 반짝임·0.9 칸이 넓은 빛이다. 매끈한 금속 구는 반짝임 밖이 어둡다(둘레 빛 없는 어림)

### 비용(시간·메모리)

`npm run bench:many`(정의 12 × 자리 3,000, 삼각형 182만 개), 다 올린 뒤 조금씩 돌리며 다섯 번 × 판을 번갈아 두 번, 가운데값(최소~최대) ms, load average 13~20.

PBR 그림(`--pbr` — 셋째 정의마다 바둑판 무늬에 법선·금속 거칠기 그림 64², 자리 1,000곳이 PBR — base 판은 PBR 필드를 몰라 바둑판만):

| 백엔드·모드 | 그리기 JS base → PBR 켬 → 끔 | GPU 마침까지 | 그리기 호출 | GL 호출 |
|---|---:|---:|---:|---:|
| 기계 GPU 음영+윤곽 | 2.2 → 2.4 → 2.2 | 7.3 → 7.8 → 7.4 | 28 | 430 → 478 → 430 |
| 기계 GPU 음영 | 1.6 → 2.0 → 1.7 | 6.1 → 6.4 → 6.1 | 16 | 236 → 284 → 236 |
| SwiftShader 음영+윤곽 | 2.3 → 3.9 → 2.5 | 1,194 → 1,843(1,038~3,718) → 1,053 | 28 | 430 → 478 → 430 |
| SwiftShader 음영 | 1.8 → 2.6 → 2.3 | 1,088 → 1,178 → 908 | 16 | 236 → 284 → 236 |

- 그리기 호출은 같고(PBR 자리도 모아 그린다) GL 호출은 PBR 묶음의 무늬 단위 셋·균일 변수 몫(48)만 는다. 기계 GPU에서 PBR 조각 셰이더 몫은 0.3~0.5 ms다.
  SwiftShader는 조각마다 그림 셋을 더 읽는 몫이 보이지만 흔들림이 크다(부하가 높은 기계 — 끔은 base와 같은 길)
- 처음 열기: PBR 변종 번역을 기다리지 않는다(병렬 번역). 처음 만든 판은 기계 GPU 첫 판에서 번역을 기다린 프레임(121 ms)이 있었고, 바뀐 변종 정의의 앞 변종을 다시 묻지 않아
  기다림이 끝나지 않고 프레임마다 다시 그리는 일(600프레임·10초)도 있어 고쳤다(0.42.0 인스턴싱 변종도 번역 중에 모드를 바꾸면 생길 수 있던 일). 고친 뒤 다 올림 39·35 ms,
  가장 긴 프레임 13.8·14.8 ms(base 14.6·16.2)
- 메모리: GPU 버퍼 0.2 MB로 같다(무늬 좌표는 무늬 정의가 이미 올린다). PBR 그림은 64² 둘 — 무늬 바이트 어림 44 KB(그림 크기 × 4 × 4/3). JS 힙은 9~36 MB로 흔들려 차이를 가리지 못했다

단면 하나·그림자를 켠 인스턴싱(base e4780f4 = 그물마다 ↔ head):

| 백엔드·모드 | 그리기 JS | GPU 마침까지 | 그리기 호출 | GL 호출 |
|---|---:|---:|---:|---:|
| 기계 GPU 음영+단면 | 3.1 → 1.6 | 9.1 → 6.0 | 3,004 → 16 | 21,045 → 168 |
| 기계 GPU 음영+윤곽+단면 | 4.6 → 5.6(3.5~8.1) | 13.5 → 12.7 | 6,004 → 3,016 | 51,047 → 30,170 |
| 기계 GPU 음영+그림자 | 3.5 → 4.0(1.9~6.9) | 9.4 → 9.1 | 3,004 → 16 | 21,055 → 187 |
| 기계 GPU 음영+윤곽+그림자 | 3.7 → 2.3 | 11.3 → 7.0 | 3,016 → 28 | 21,249 → 381 |
| SwiftShader 음영+단면 | 3.7 → 1.7 | 1,021 → 963 | 3,004 → 16 | 21,045 → 168 |
| SwiftShader 음영+윤곽+단면 | 25.8(9.2~117.5) → 3.8 | 1,479 → 1,136 | 6,004 → 3,016 | 51,047 → 30,170 |
| SwiftShader 음영+그림자 | 4.1 → 2.0 | 1,219 → 1,038 | 3,004 → 16 | 21,055 → 187 |
| SwiftShader 음영+윤곽+그림자 | 4.0 → 2.5 | 1,037 → 1,269 | 3,016 → 28 | 21,249 → 381 |

- 단면을 켜면 윤곽선은 그물마다라(0.42.0 그대로) 음영+윤곽+단면은 면 몫(3,000 → 12)만 준다 — 그리기 JS는 흔들림 안이다. 기계 GPU 음영+그림자 head의 흔들림은 한 판에서
  `INST+SHADOW` 변종을 번역하는 동안 그물마다 그린 프레임(그리기 1,759)이 섞인 것이다. SwiftShader GPU 마침은 래스터 몫이라 흔들림 안이다
- 처음 열기·GPU 버퍼는 같다(다 올림 33 ms). 자리 자료 그림은 자리 하나가 그림자 4·단면 1텍셀 더 — 자리 3,000에 11 → 16텍셀이면 0.5 → 0.8 MB

### 남은 한계

- 접선 속성(`tangents`)을 받지 않는다(화면 미분). 낮은 해상도 곡면 그물에서는 법선 그림 틀이 삼각형마다 꺾여 이음매가 보일 수 있고, 무늬 좌표가 퇴화한 삼각형은 법선 그림 없이 그린다
- 둘레 빛(IBL)·환경 반사·가림(AO) 그림·발광(emissive)·투명 전송·clearcoat가 없다 — 매끈한 금속은 반짝임 밖이 어둡다. 반사광은 고정 조명 두 빛(또는 해)만이다
- 법선 그림 밉맵의 거칠기 보정(먼 곳에서 법선 그림이 반짝이는 것을 거칠기로 바꾸는 Toksvig 등)이 없다
- 뒷면 재질의 PBR 그림은 없다(앞면 재질만 — 뒷면 색·무늬가 칠해지는 쪽은 0.42.0 빛 식). 그림마다 다른 무늬 좌표(glTF `texCoord`)·변환(`KHR_texture_transform`)은 없다(`uvs`·`uvTransform` 하나)
- 단면이 있을 때 선은 그물마다, 여러 단면은 면·선 모두 그물마다, 그림자 깊이 그림은 그물마다다(선 자리 자료에 평면을 더하면 모을 수 있다)

### 앱이 할 일

- SKP: 코어를 0.43.0으로 올린다. 재질의 `<mat:pbrMR>`가 가리키는 그림(같은 재질 폴더 `path="./…"`)을 `Scene3d.textures`에 넣고(바이트 `data`, 크기를 알면 `width`·`height`)
  그 재질 그물에 `normalTexture`(법선)·`roughnessTexture`(거칠기)·`metallicTexture`(금속)를 단다(SketchUp 그림은 따로이므로 `metallicRoughnessTexture`가 아니라 둘로).
  `normalScale` ← `normalScale`, `normalFlipY` ← `normalMapStyle`이 DirectX 꼴이면, `roughnessInvert` ← `roughness_texture_invert`, 그림 없이 값만 있으면 `roughness`·`metallic`,
  `enable_normal`이 꺼져 있으면 `normalTexture`를 달지 않는다. 무늬 좌표는 색 무늬와 같은 `uvs`(지금 주는 것)를 함께 쓴다 — 색 무늬 없이 PBR 그림만 있는 재질도 `uvs`를 준다.
  그림을 손질해야 하면 `pending` 뒤 `restoreTexture`로 하나씩 준다. 큰 모형에서 무늬 예산이 모자라면 PBR 그림도 같은 비로 줄므로, 필요하면 휴대 기기에서 `setRenderOptions({ pbr: false })`
  또는 PBR 그림을 넣지 않는 길을 둔다. `normalMapStyle`·거칠기·금속 값 꼬리표 이름은 앱 표본으로 확인한다(코어는 받는 값만 정했다)
- STEP: 코어를 0.43.0으로 올린다. PBR 필드는 없어 할 일은 없다. 단면 하나·그림자를 켜도 같은 부품 면을 모아 그리므로 단면을 켠 큰 조립 돌려 보기를 다시 재 본다(그림은 같다)
- NC: 코어를 0.43.0으로 올린다. 할 일은 없다(그물 PBR 필드·같은 그물 자리가 없다)
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.44.0: 묶음 안 구간 단면(SKP 42차 요청)·손가락 기기 뷰 큐브(STEP 50차 요청)

`setSections`의 `items`에 묶음 id 대신 묶음 안 구간(`{ id, start, count, edges? }`)을 주면 평면이 그 구간만 자른다. SketchUp 그룹 안 단면처럼
해석기가 재질·태그 묶음으로 구워 합친 그물에서 그룹 하나만 자를 때 쓴다(지금은 앱이 단면이 든 그룹을 따로 묶음으로 나눠야 했다).
**구간을 주지 않은 장면은 0.43.0과 그림·값이 바이트까지 같다.**
손가락으로 뷰 큐브를 누르면 고르지 않고 큐브를 224화소로 펴고, 편 큐브를 다시 눌러 고른다(바뀐 기본 동작 — 손가락만, 마우스·펜은 그대로).

### 새 API

- `SectionPlane.items`: `readonly SectionItem[]` — `SectionItem = string | SectionItemRange`, `SectionItemRange = { id, start, count, edges? }`.
  번호는 `setHiddenRanges`·`Pick3d.raw`와 같다(그물 = 삼각형, 선분 묶음 = 선분, 점 묶음 = 점). `edges: true`면 그물 윤곽선(`Mesh3d.edges`)의 선분 번호 —
  윤곽선은 이것으로 준 구간만 자른다(삼각형 구간과 짝짓지 않는다 — 숨긴 구간과 같은 규칙). 같은 묶음의 구간은 합치고, 같은 묶음을 통째로도 주면 통째로 자른다.
  묶음 수 밖의 번호는 쓸 때 자른다(`setMesh`로 삼각형이 줄어도 된다)
- `SectionState.ranges`(`sections[i].ranges`): 그 평면의 구간(묶음·종류마다 합친 것). `items`는 통째로 자르는 묶음만이다(구간만 준 평면은 빈 목록)
- `Viewer3dOptions.viewCubeTouch`·`setViewCubeTouch(false | true | { size, band })`·`viewCubeTouch`·`viewCubeExpanded`(편 동안 true)
- 순수(`opencad-viewer3d`·`opencad-viewer3d/viewcube`): `cubeTargets`(보이는 누르는 자리와 그 폭), `CUBE_TOUCH_MIN`(24)·`CUBE_TOUCH_SIZE`(224)·`CUBE_TOUCH_BAND`(0.3),
  `cubeHit`·`drawViewCube`의 띠 선택(주지 않으면 0.43.0 그대로). `opencad-viewer3d/ranges`: `cutRuns`·`cutParts`·`partCuts`·`cutMaskAt`·`cutBits`, `RangePart.cut`.
  타입 `SectionItem`·`SectionItemRange`·`ViewCubeTouchOptions`·`CubeTarget`

### 구간 단면 동작

- 묶음 안 기본 도형마다 자르는 평면 = 그 묶음을 통째로 자르는 평면 ∪ 그 도형이 든 구간의 평면이다. 같은 평면 모음(갈래)끼리 묶는다 — 그룹 단면 하나면 갈래 둘(그룹 밖·그룹)
- 그리기: 갈래마다 그 평면들을 균일 변수(`u_clips`)로 올리고 그 갈래 구간만 그린다(면·그림자 깊이 그림·외곽선 깊이 그림·삼각형 변·윤곽선·숨은 점선·선분·점).
  숨김·강조 구간(`setHiddenRanges`·`highlightRanges`)과 겹치면 함께 나눈다
- 잘린 면 채우기: 갈래마다 단위 — 그 갈래 삼각형만 홀짝을 세고, 채운 면은 그 갈래의 다른 평면으로 자르며, 단위 범위(가위 사각형·채울 다각형)는 그 갈래 정점의 범위다.
  갈래 0(통째 평면만)은 같은 `capGroup`의 통째 그물과 함께 센다. 그룹 하나가 닫힌 입체면(SketchUp 그룹은 대개 그렇다) 그 그룹의 잘린 면만 채운다
- 단면 테두리: 갈래마다 그 갈래 삼각형과 평면의 교선을 그 갈래의 다른 평면으로 자른다
- 고르기·가림·측정 붙잡기·걷기 부딪힘: 갈래마다 대리 묶음(같은 배열·id — 그 갈래 평면들로 자르고 그 갈래가 아닌 기본 도형·윤곽선은 건너뛴다)으로 0.43.0과 같은 고르기를 한다.
  결과의 id·번호(`raw`)는 원래 묶음·번호다. 잘린 면을 누르면 그 갈래가 들어온 평면의 법선이다
- 인스턴싱: 구간을 준 평면은 범위를 정한 평면이라 여러 단면 길이다 — 0.43.0의 여러 단면처럼 모든 그물을 그물마다 그린다

### 설계 근거(셰이더가 구간을 아는 길)

- 정점 속성(정점마다 평면 비트): 색인 그물은 정점을 여러 삼각형이 함께 쓴다 — 그룹 경계 정점이 두 갈래에 걸리면 정점을 나눠야 하고, 정점 수만큼 바이트와
  버퍼·VAO·놓기(0.25.0)·문맥 복구 길이 늘며, 구간을 바꿀 때마다 다시 올린다
- 구간 그림(삼각형 번호 → 비트 무늬): WebGL2(GLSL ES 3.00)에는 `gl_PrimitiveID`가 없고, 색인 그리기의 `gl_VertexID`는 색인 값(정점 번호)이라 삼각형 번호를 모른다
- 그리기를 나눠 균일 변수(고른 길): 0.7.0 묶음 안 구간 그리기(숨김·강조 — 구간마다 `drawElements` 자리, 구간이 24개를 넘으면 모은 색인 한 번)를 그대로 쓰고
  갈래마다 `u_clips`만 바꾼다. 셰이더·정점 버퍼는 그대로이고(구간이 많을 때 모은 색인만 더), 비용은 갈래 수만큼의 그리기 호출이다(아래 비용)
- 뷰어는 0.43.0 여러 단면의 "묶음 → 평면 번호" 위에 "묶음 안 번호 → 평면 비트"(`cutRuns` — 평면마다 구간을 합쳐 이분 탐색)를 더한다. 평면 목록을 새로 둘 때만
  다시 세고(위치·뒤집기·표시만 바꾸면 그대로) 묶음 객체마다 기억한다

### 손가락 기기 뷰 큐브

- STEP 50차 손가락 쓰기 점검: 휴대폰 76화소 큐브는 면 뷰 가운데 18.6·띠 8.6 CSS px, 등각에서 가장 좁은 자리 6.1(`cubeTargets` — 평행사변형 조각의 작은 높이).
  WCAG 2.2 2.5.8 Target Size (Minimum)(AA)은 24 × 24 CSS px, 2.5.5 Target Size (Enhanced)(AAA)와 Apple HIG(Buttons — hit target)는 44 × 44다.
  큐브는 자리 26개(등각에서 보이는 것 19개)를 캔버스 하나에 담아, 0.43.0이 받는 64~160화소 어디서도 띠·구석이 24보다 좁다(160화소 면 뷰 19.2·등각 13.6).
  늘 키우면 3D 보기를 가린다(STEP이 휴대폰에서 76으로 줄인 까닭)
- 고른 길: 손가락 누르기는 펴기, 편 큐브 누르기는 고르기. 편 크기·띠는 26 표준 뷰(면·모서리·구석 뷰)에서 보이는 자리가 모두 24 이상이 되는
  가장 작은 16의 배수 224화소와 띠 0.3이다(등각·모서리 뷰 가장 좁은 자리 24.1, 면 뷰 가운데 45.5 — 44 이상. 208화소면 22.3). 편 큐브는 바탕을 깔고 띠 경계를 옅게 그린다
  (손가락은 가리키기가 없어 누를 자리를 미리 보이지 못한다)
- 견준 길: 판정만 넓히기(누른 점 둘레 원·가장 가까운 자리) — 76화소 큐브의 면 뷰 넓이 1,282 px²에 자리가 9개라 24²(576 px²)를 둘도 담지 못한다.
  손가락에서 띠만 바꾸기 — 가운데를 키우면 띠가 좁아지고 그 반대도 같다. 큐브를 늘 키우기 — 3D 보기를 가린다
- 편 큐브 밖(큐브 캔버스 구석)·3D 보기 누르기·Esc·큐브 감추기·크기 바꾸기·선택 바꾸기는 고르지 않고 접는다(3D 보기 누르기는 접고 그 누르기는 그대로 이어 간다).
  손가락 끌기 시작은 10화소(`TOUCH_DRAG_START_PX` — 0.43.0은 3화소라 누르다 조금 밀린 손가락이 큐브를 돌렸다), 끌면 0.43.0처럼 돌린다(편 큐브도)
- 편 크기는 뷰어 짧은 변 − 16으로 자르고, 그것이 지금 큐브보다 크지 않으면 펴지 않고 바로 고른다. `viewCubeRect`는 편 동안 편 자리다

### 바뀐 기본 동작

- 구간 단면: 없다(구간을 주지 않으면 바이트까지 같다). 0.43.0 판은 `items`의 구간 객체를 묶음 id로 보지 못해 그 평면이 아무것도 자르지 않았다
- 손가락 뷰 큐브: 손가락 누르기 한 번은 펴기다 — 뷰를 바꾸려면 두 번 누른다. 손가락 끌기 시작 10화소. 0.43.0처럼 쓰려면 `viewCubeTouch: false`.
  마우스·펜은 그리기·고르기·끌기 모두 0.43.0 그대로다

### 확인

- 시험 `tests/v0440secrange.test.ts`(14개): 갈래 구간 순수 함수, 그리기를 갈래마다 나누고 그 갈래 평면만 올리는지(A 평면 0개·B 평면 하나 — 통째·통째 + 구간은 0.43.0처럼 한 번),
  상태 `ranges`, 고르기(A 윗면 그대로·B는 잘린 면, 채우기를 끄면 B 바닥 안쪽 — 구간을 주지 않은 그물은 단면이 없는 것과 같은 고르기), 측정(잘린 면 위 점·남은 구간 꼭짓점),
  선분 묶음 구간(고르기·그리기), 단면 테두리(B 삼각형만 — 통째면 두 배), 잘린 면 채우기(B 갈래만 홀짝·채운 면 하나), 모형 전체 평면을 더한 두 평면(갈래마다 평면 합·
  걸치지 않는 갈래는 채우기 단위가 아님), 숨긴·강조 구간과 함께, 윤곽선 구간, 인스턴싱(구간 단면이 있으면 그물마다 — 지우면 다시 모은다), `setMesh`로 삼각형이 줄 때.
  `tests/v0440cube.test.ts`(9개): 보이는 자리 수·폭(0.43.0 크기 64~160은 26 표준 뷰 모두 24 미만, 편 큐브는 모두 24 이상·면 뷰 가운데 44 이상, 208화소면 모자람),
  `cubeHit` 띠, 뷰어 — 마우스·펜은 바로 고름, 손가락 펴기 → 고르기·접기(`viewCubeRect` 224 → 76), 큐브 밖·3D 보기·Esc로 접기, 손가락 끌기 10화소·마우스 3화소,
  끔·크기·띠 자르기·뷰어 짧은 변·감추기. typecheck와 전체 시험(91파일 934개)이 통과한다
- 화소·값 회귀(960 × 600, 판마다 두 번): `npm run pixels -- --base eb0a831`(43차 머리)으로 0.43.0 장면 155개(마우스 뷰 큐브 `base-cube-iso`·`base-cube-light-front` 포함)와
  값 111묶음이 모두 같다(바이트까지). 새 장면 `secrange-shadedEdges`·`base-cube-touch`, 새 값 `secrange-values`.
  `secrange-values`: 한 그물로 합친 판재 + B 구간 단면과, 같은 모양을 묶음으로 나눈 장면 + B 묶음 단면이 평면 하나·모형 전체 평면을 더한 두 평면·숨은 선 모두
  다른 화소 0이고 화면 격자 고르기(맞은 자리 18·15·18)가 같다(그리기 호출 12 ↔ 14, 14 ↔ 17, 12 ↔ 14 — 합친 쪽이 적다).
  채우기 단위 범위를 그물 통째로 두었던 첫 판은 채운 면 화소가 1씩(숨은 선 5,561화소) 달라 갈래 정점 범위로 고쳤다(5781e55).
  `--base v0.33.0`으로는 0.33.0으로도 찍을 수 있는 장면 138개·값 94묶음이 같고, `many-*` 여섯이 0.42.0·0.43.0과 같은 화소 수(105·38·100·105·275·105 — 0.42.0 인스턴싱의
  반투명 모서리 선 겹침), `hole-measure-normal`은 0.36.0이 바꾼 3자리 그대로다(751초 — head 387·143초, base 130·87초)
- 화소 시간: eb0a831 비교 1,552초(head 513·545초, base 294·195초 — load average 35~47, 43차 같은 비교는 load 10~16에서 510초). 가장 느려진 값 셋
  (`many-instancing`·`edit-same-pixels`·`base-measure-points-for-calls`)만 다시 재면 head 36.5·28.5초 ↔ base 28.1·25.5초라 기계 부하 몫이다.
  새 장면·값은 head 한 번에 3.7초(`secrange-shadedEdges` 1.9·`secrange-values` 1.4(그림 여섯 장)·`base-cube-touch` 0.4 — 같은 부하, base는 건너뛴다)
- 그림(`secrange-shadedEdges`·`base-cube-touch`): B만 x = 220에서 잘려 잘린 면이 채워지고 판·A·판 위 기준선은 평면을 지나도 그대로, 편 큐브는 바탕 위에 띠 경계가 옅게 보인다

### 비용(시간)

`npm run bench:many`(정의 12 × 자리 3,000, 삼각형 182만 개), 다 올린 뒤 조금씩 돌리며 가운데값(최소~최대) ms. 모드 꼬리 `+items`는 x 가운데 평면(채우기 없음)이
열째 자리마다(300곳) 그물 통째를, `+secrange`는 같은 300곳의 앞 절반 삼각형 구간만 자른다(0.43.0 판은 구간을 몰라 `+secrange`에서 아무것도 자르지 않는다 — head끼리만 견준다).
기계 GPU(Apple M1 Pro, 판을 번갈아 세 번 × 열 번, load average 18~25):

| 모드 | 그리기 JS eb0a831 → head | GPU 마침까지 | 그리기 호출 | GL 호출 |
|---|---:|---:|---:|---:|
| 음영 | 1.5 → 1.7 | 6.2 → 6.3 | 16 | 156 |
| 음영+윤곽 | 2.0 → 2.2 | 7.5 → 7.8 | 28 | 350 |
| 음영 + 묶음 300곳 단면(`+items`) | 3.9 → 4.2 | 9.9 → 9.6 | 3,004 | 24,045 |
| 음영 + 구간 300곳 단면(`+secrange`, head) | 5.2(4.8~6.3) | 10.7 | 3,304 | 25,245 |

- 구간 단면이 없는 모드는 같은 길이다 — 같은 코드를 두 판으로 잰 대조(6487fc6 ↔ 작업 트리)가 음영 1.6 ↔ 1.6·음영+윤곽 2.2 ↔ 2.0으로 이만큼 흔들린다.
  SwiftShader(판마다 두 번, load average 22~32)는 음영 1.6 → 1.7, 음영+윤곽 2.7 → 2.7
- 구간 단면 300곳은 같은 300곳 묶음 단면보다 그리기 호출이 300(그물마다 갈래 하나 더), GL 호출이 1,200 늘고 그리기 JS 1.0 ms·GPU 마침 1.1 ms가 늘었다.
  음영+윤곽에서도 늘어난 호출은 면 몫이다(윤곽선 구간을 주지 않아 윤곽선은 통째로 한 번 — 6,004 → 6,304, 기계 GPU 그리기 JS 7.4 → 8.7)
- 메모리: 갈래의 구간이 24개 이하면 원래 색인 버퍼를 자리만 바꿔 그려 GPU 버퍼가 그대로다(0.2 MB). 24개를 넘으면 0.7.0처럼 그 갈래 색인을 모은 버퍼를 하나 더 둔다

### 남은 한계

- 구간 단면이 있는 동안 모든 그물이 그물마다 그려진다(인스턴싱 꺼짐 — 0.43.0 여러 단면 길). 갈래 수만큼 그리기 호출이 는다
- 앱 붙잡기 점(`SnapPoint.id`)·`project`의 잘림 판정은 묶음 통째 평면만 본다(점이 어느 구간인지 모른다 — 앱 점은 구간 단면에 잘려도 보인다)
- 구간 단면의 잘린 면 채우기는 갈래가 닫힌 입체일 때만 맞다(갈래가 열린 면이면 홀짝이 어긋난다 — 0.7.0 `caps: 'all'`과 같은 한계).
  `capGroup` 묶음은 갈래 0만 통째 그물과 함께 세고, 갈래가 있는 구간은 그 그물만으로 센다
- 최근접점(`closestPoints`)은 단면을 보지 않는다(0.41.0 그대로)
- 손가락 뷰 큐브는 두 번 눌러야 하고, 편 동안 3D 보기 오른쪽 위(224 × 224)를 가린다. 비스듬히 돌린 뷰(표준 뷰가 아닌)에서는 기운 면의 자리가 24보다 좁을 수 있다.
  화면 읽기 프로그램(VoiceOver·TalkBack)으로 큐브를 쓰는 길은 없다(앱의 표준 뷰 메뉴·키 1~7)

### 앱이 할 일

- SKP: 코어를 0.44.0으로 올린다. 나누지 않은 깊은 그룹·컴포넌트 안 단면(지금 건너뛰고 `skipped.scope`로 세는 단면)은 그 노드의 구간(`nodeRanges` — 항목 차례 → 삼각형·선분 구간)을
  `items`에 `{ id, start, count }`로 준다(같은 항목의 여러 구간도 그대로 — 코어가 합친다). 카메라를 보는 그물처럼 윤곽선이 그 노드 것이면 `{ …, edges: true }`도 준다.
  단면이 든 노드를 따로 나누는 해석기 규칙(나무 노드 한도)은 이제 단면 때문에 나눌 까닭이 없다 — 나누는 한도를 다시 정할 수 있다.
  잘린 면 채우기는 그 구간이 닫힌 입체일 때만 맞으므로 `capGroup`을 주는 칸의 입체는 구간도 그 입체 단위로 준다. 손가락 큐브는 그대로 쓰거나 끈다
- STEP: 코어를 0.44.0으로 올린다. 휴대폰 76화소 큐브는 그대로 두고 손가락 누르기가 펴기가 된다 — 큐브 자리를 쓰는 글상자 비키기(`viewCubeRect`)는 편 동안 224화소 자리를 받는다
  (`viewCubeExpanded`로 펴졌는지 본다). 앱 손가락 쓰기 점검·CI 44px 검사에서 큐브는 "편 큐브 자리 24 이상(면 뷰 가운데 45)"으로 적는다. 구간 단면은 할 일 없음
- NC: 코어를 0.44.0으로 올린다. 할 일은 없다(휴대폰에서 큐브를 쓰면 두 번 누르기 — 끄려면 `viewCubeTouch: false`)
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.45.0: 구간 단면과 앱 붙잡기 점·`project`(44차 남은 한계)·면별 최근접점(STEP 45차 요청)

0.44.0 구간 단면(`setSections` `items`의 `{ id, start, count, edges? }`)이 있을 때 앱 붙잡기 점·`project`·측정 미리 보기가 그 점이 놓인 기본 도형 번호로
통째 단면과 같은 규칙을 따른다. 두 묶음 최근접점은 묶음 안 구간(면 표의 면 하나)끼리도 잰다.
**구간 단면이 없으면(그리고 새 필드를 주지 않으면) 0.44.0과 결과·앱 호출 수가 바이트까지 같다**(넓은 탐색·화소·값 — 아래 "확인").

### 새 API

- `SnapPoint.raw?: number`·`SnapPoint.edges?: boolean`: 그 점이 놓인 기본 도형의 배열 안 번호(`Pick3d.raw`·`setHiddenRanges`·`items`의 구간과 같은 번호 — 그물 = 삼각형,
  선분 묶음 = 선분, 점 묶음 = 점, `edges`면 그물 윤곽선 `Mesh3d.edges`의 선분). `id`와 함께 줄 때만 쓴다
- `project(p, { occlusion?, id?, raw?, edges? })`(타입 `ProjectOptions`): `id`를 주면 그 묶음을 자르는 평면(`items`로 범위를 정한 평면도), `raw`를 주면 그 도형이 든 구간 단면의
  평면으로도 잘림을 본다(앱 붙잡기 점과 같은 규칙). 숨김은 보지 않는다(0.44.0과 같다)
- `ClosestPointsOptions.rangeA`·`rangeB`(`IndexRange` 하나나 목록 — `closestPoints`·`closestPointsAsync`): 그 묶음 안 구간끼리만 잰다
- 순수(`opencad-viewer3d/closest`): `closestPart(kind, positions, indices, ranges)`(타입 `ClosestPart` — 입구에서도), `ClosestShape.offset`·`map`(모양 번호 → 묶음 번호).
  `opencad-viewer3d/snap`: `snapRaw`(입구에서도), `chooseMeasureSnap`의 `visible` 다섯째 인자(후보)

### 구간 단면과 앱 붙잡기 점

- 앱 점(`id` + `raw`)을 자르는 평면 = 그 묶음을 통째로 자르는 평면 ∪ 그 도형이 든 구간의 평면이다 — 같은 묶음의 그 도형(그리기·고르기)을 자르는 평면과 같다.
  `edges`면 윤곽선 구간(`items`의 `edges: true`)으로 본다(0.44.0 윤곽선 규칙 — 삼각형 구간과 짝짓지 않는다). 선분·점 묶음의 `edges`는 아무 구간에도 들지 않는다
- 그 도형을 숨겼으면(`setHiddenRanges`) 뺀다 — 묶음을 숨기면 빼는 0.8.0 `id` 규칙과 같은 꼴(구간 단면이 없어도)
- `pointsFor` 점은 `raw`가 없으면 고른 것의 번호(`Pick3d.raw` — 윤곽선을 골랐으면 윤곽선 번호)를 받는다(점의 `id`가 없거나 고른 것과 같을 때).
  `pointsFor`는 고른 것에서 나온 점(그 면·모서리의 끝점·중심)이므로 고른 도형과 같은 구간이라고 본다. 잘린 면을 골랐으면(`Pick3d.section` — 번호 −1) 받지 않는다
- 코어가 다듬기에 넘긴 선분·면(`refine`·`refineFace` — 0.14.0~0.39.0)의 앱 점, 열린 교차·끌어온 축이 받는 점의 잘림도 그 선분·삼각형 번호로 본다
  (0.44.0은 묶음 통째 평면만 보아 잘린 구간 쪽으로 다듬은 점을 받을 수 있었다)
- 늘 후보인 점(`points`)은 `raw`를 점마다 담는다(한 점이라도 줬을 때만 — 없으면 0.44.0처럼 칸을 두지 않는다). 색인 길(0.9.0)도 같다

### 구간을 모르는 앱 점(`raw` 없음)을 0.44.0 그대로 둔 까닭

- 구간 단면은 그 구간만 자른다(SketchUp 그룹 안 단면처럼 — 평면 너머여도 그룹 밖은 그대로). `raw`가 없는 점을 그 묶음의 모든 구간 평면으로 자르면, 해석기가 재질·태그로 구운
  그물(모형 전체에 걸친다)의 다른 그룹 점이 그 평면 너머에서 모두 사라진다 — 잘린 그룹의 점 몇 개를 붙잡는 것보다 큰 잘못이고 0.44.0 앱의 결과를 바꾼다
- 점에 가장 가까운 기본 도형으로 구간을 어림하는 길: 앱 점에는 그물 위에 없는 점(원·구멍 중심, 곡선 교차)이 많아 이웃 그룹 도형으로 틀릴 수 있고, 점마다 BVH 질의가 든다(색인 길 30만 점)
- 그래서 모르는 점은 0.44.0처럼 통째 평면만 보고, 앱이 `raw`를 달면 정확히 자른다. 앱 점은 앱이 만든 것이라 그 점의 면·모서리를 앱이 안다(STEP 면 표, SKP 노드 구간)

### 면별 최근접점(`rangeA`·`rangeB`)

- 41차 설계 그대로: 구간이 이어진 하나면 번호 배열의 `subarray`(번호 없는 그물·선분·점이면 정점 배열의 `subarray`)로 복사 없이 그 구간만의 BVH를 만든다. 여럿이면 번호 배열을 모으고
  (번호 없는 그물은 정점 번호를 만들고 선분·점은 정점을 모은다) 모양 번호 → 묶음 번호 표(`map`)를 둔다. 이웃한 구간은 합쳐 하나로 본다
- 같은 기본 도형을 같은 차례로 따로 담은 묶음의 BVH와 같은 나무다 — 앱이 그 면 삼각형만 따로 그물로 만들어 잰 것과 두 점·거리가 바이트까지 같고, 번호는 묶음 번호다(구간 시작을 더한 값)
- 숨긴 구간은 묶음 번호로 묻는다. 묶음 원점·행렬·마주 보기 돌림은 그대로 반영한다. 구간이 묶음 밖뿐이면 `null`
- 뷰어는 구간 모양을 묶음(정점·번호 배열)과 합친 구간 열쇠로 묶음마다 64개(`CLOSEST_PART_CACHE`)까지 기억하고(가장 오래 쓰지 않은 것부터 버린다) BVH 기억과 함께 버린다
  (장면·그물 바꾸기, 제자리 정점 고치기). 그래서 나눠 돌리기(`closestPointsAsync`)는 조각 사이에 같은 모양으로 보고 다시 찾지 않는다. 아직 없으면 한 작업에서 만들고 쉰다
- 작은 구간이 큰 그물의 정점 배열을 함께 쓰고 행렬이 있으면(쓰는 번호 × 4 < 정점 수) 세계 정점을 정점 수만큼의 배열 대신 Map에 둔다(면 하나를 잴 때마다 그물 정점 수만큼 잡지 않게)

### 면별 최근접점의 비용과 고른 길(잰 값)

합성 STEP 꼴 부품 둘(핀 부품 = 원기둥 넷 · 면 12개 · 삼각형 53,760개, 구멍 판 = 안쪽 구멍 벽 둘과 바깥 원기둥 · 면 9개 · 54,784개 — 면마다 이어진 삼각형 구간),
Node 24, load average 9~15, 가운데값(일곱 번 — 거르기 길은 한 번, 마디 쌍 400만 개 한도):

| 면 짝(삼각형) | 거리 | 구간 모양: 만들기 ms · 새 바이트 · 찾기 ms | 앱 길(면 삼각형 복사 + BVH): ms · 바이트 · 찾기 ms | 거르기 길(통째 BVH + 구간 밖 건너뛰기) |
|---|---:|---|---|---|
| 핀 옆면–같은 축 구멍 벽(24,576 · 24,576) | 0.0899 | 3.9 · 1.07 MB · 847 | 7.6 · 1.96 MB · 830 | 1,057 ms(마디 쌍 147만 — 구간 모양 17.6만) |
| 둘째 핀 옆면–같은 축 둘째 구멍 벽(24,576 · 24,576) | 0.0899 | 3.8 · 1.07 MB · 821 | 7.2 · 1.96 MB · 780 | 400만 쌍(1,019 ms)에 끝나지 않음(첫째 짝 둘레를 먼저 내려간다) |
| 핀 옆면–옆 구멍 벽(24,576 · 24,576) | 6.09 | 3.8 · 1.07 MB · 0.03 | 7.5 · 1.96 MB · 0.09 | 400만 쌍(1,252 ms)에 끝나지 않음 |
| 핀 아랫면–구멍 벽(192 · 24,576) | 2.00 | 2.6 · 0.58 MB · 4.2 | 4.5 · 1.03 MB · 5.4 | 400만 쌍(794 ms)에 끝나지 않음 |
| 턱 아랫면–판 윗면(192 · 256) | 2 | 0.05 · 11.7 kB · 3.1 | 0.09 · 22.5 kB · 3.2 | 400만 쌍(726 ms)에 끝나지 않음 |
| 턱 옆면–판 바깥 옆면(1,536 · 4,096) | 4.47 | 0.46 · 137 kB · 1.2 | 0.91 · 244 kB · 1.2 | 400만 쌍(726 ms)에 끝나지 않음 |

- 여섯 짝 모두 구간 모양과 앱 길의 답(두 점·거리·번호 — 번호는 구간 시작만큼 다르다)이 바이트까지 같다. 찾기 시간은 같은 나무라 같다(차이는 잴 때의 흔들림)
- 구간 모양은 BVH 배열만 새로 잡는다(면 하나에 BVH 약 0.53 MB / 삼각형 2.5만 개 — 그물 통째 BVH는 5.4만 개에 1.23 MB, 4.2 ms). 앱 길은 정점·번호를 복사하는 몫이 더해져 바이트·시간이 약 두 배다
- 거르기 길(그물 통째 BVH를 그대로 쓰고 구간 밖 기본 도형을 잎에서 건너뛰기 — 41차에 견준 다른 길): BVH를 새로 만들지 않지만 구간 밖 마디도 내려가고, 구간 안 쌍을 처음 만날 때까지
  최솟값이 없어 가지치기가 전혀 없다(같은 축 핀–구멍처럼 가까운 다른 면이 많으면 그 쌍을 다 본다). 위 표에서 구간 모양이 0.03~4 ms에 끝내는 짝을 0.7~1.3초(마디 쌍 400만 개)에도 끝내지 못했다 —
  그래서 구간 BVH를 만드는 길을 골랐다(면 짝을 잇달아 재는 앱은 기억한 구간 BVH를 다시 쓴다)
- 구간 없이 부른 결과: 0.44.0(14cbba2)의 `closest.ts`와 지금 것을 무작위 짝 240개(구·핀·구멍 원기둥, 행렬·숨김·`indices`·`maxDistance`)로 견주면 답(바이트)과 꺼낸 마디 쌍 수가 모두 같다

### 바뀐 기본 동작

- 구간 단면이 있을 때만: `pointsFor` 점이 고른 것의 번호로 구간 단면에 잘린다(잘린 그룹을 지나 그 그룹의 남은 면을 가리켜도 잘린 쪽 점을 붙잡지 않는다),
  다듬은 점·열린 교차의 잘림을 그 선분·삼각형 번호로 본다. 구간 단면이 없으면 0.44.0과 같다
- `raw`·`project`의 `id`·`rangeA`·`rangeB`는 새 선택이라 주지 않으면 0.44.0과 같다

### 확인

- 시험 `tests/v0450secsnap.test.ts`(15개): `snapRaw`, 늘 후보 점(`raw`가 B면 잘린 쪽을 붙잡지 않고 A면·없으면 0.44.0처럼 붙잡음, 잘못된 값은 없는 것과 같다), 윤곽선 번호(`edges`),
  색인 길(앱 점 302개), `pointsFor`가 고른 것의 번호를 받음(앱이 단 `raw`·다른 묶음 `id`는 그대로), 숨긴 구간, `project`(`id`·`raw`·`edges` — 통째 범위 평면·모든 묶음 평면도),
  다듬은 점(`refine` onEdge — 잘린 기둥 위로 옮긴 점은 받지 않음), **같은 규칙**: 한 그물로 합친 판 + 구간 단면 + `raw`를 단 앱 점과 묶음으로 나눈 판 + 묶음 단면 + `id`만 단 앱 점의
  화면 격자(35 × 26자리)·앱 점 자리 미리 보기가 위·남서 등각·북동 등각 × 채우기 `none`·`all` 여섯 가지 모두 같다, 구간 단면이 없으면(단면 없음·통째 범위 평면·모든 묶음 평면) `raw`를 달아도 같다.
  `tests/v0450closest.test.ts`(11개): `closestPart`(subarray·모음·번호 없는 그물·선분·점·묶음 밖·빈 구간), 면 짝 아홉 개가 앱이 면을 따로 그물로 만든 값과 바이트까지 같고(행렬 있음·없음)
  삼각형 쌍을 모두 잰 최솟값과 같은 거리, 작은 구간 + 행렬(Map 길)·여러 구간, 통째 구간 = 구간 없음(바이트), 숨김은 묶음 번호로, 뷰어 — 면을 따로 묶음으로 둔 장면과 같은 답·
  선분 묶음 `segmentIds`·원점·빈 구간, 숨긴 구간, 나눠 돌리기(같은 답·다시 찾지 않음, 도는 동안 그물을 바꾸면 처음부터). typecheck와 전체 시험(93파일 960개)이 통과한다
- 넓은 탐색(가짜 WebGL, 경우마다 새 뷰어·새 기억, 44차 머리 14cbba2와 행 단위로 견줌): 37차 넓은 탐색 사본 275,836자리와 38차 모서리 꼴 3,600경우 871,200자리가
  모두 같다(행 파일이 바이트까지 같고 앱 호출도 같다 — 닫힌 3,640·열린 5,960번)
- 미리 보기 한 번(가짜 WebGL 그리기 포함, 400자리 × 세 번 — 둘째·셋째 판의 가운데값 ms, base·head·head + `raw`를 차례를 돌려 세 짝, load average 6~12):

  | 장면 | 14cbba2 | head(`raw` 없음) | head + `raw` |
  |---|---:|---:|---:|
  | 곧은 선 82개 격자 + 앱 점 20,000개(색인) + `pointsFor` 셋(단면 없음) | 0.0511 · 0.0405 | 0.0505 · 0.0406 | 0.0509 · 0.0407 |
  | 상자 200개를 합친 그물 + 앞 100개 구간 단면 + 앱 점 20,000개 + `pointsFor` 둘 — 잘린 상자 둘레 | 0.1206 · 0.1153 | 0.1168 · 0.1120 | 0.1160 · 0.1100 |
  | 같은 장면 — 잘리지 않은 상자 둘레 | 0.1095 · 0.1108 | 0.1204 · 0.1080 | 0.1073 · 0.1079 |

  `pointsFor` 호출은 셋 모두 같고, 고른 종류는 14cbba2와 head(`raw` 없음)가 모든 장면에서 같다. `raw`를 달면 잘린 상자 둘레 400자리에서 붙잡은 앱 점이 160 → 92자리(잘린 쪽 점이 빠짐),
  잘리지 않은 상자 둘레는 같다
- 화소·값 회귀(960 × 600, 판마다 두 번): `npm run pixels -- --base 14cbba2`(44차 머리)로 장면 157개와 값 112묶음이 모두 같고(바이트까지 — 구간 단면 장면 `secrange-shadedEdges`·
  값 `secrange-values`도), 새 값은 `secrange-snap-values` 하나다(새 장면 없음, 582초 — head 178·135초, base 139·126초, load average 6~15).
  그 값에서 합친 판재 + 구간 단면 + `raw` 앱 점과 나눈 장면 + 묶음 단면 + `id` 앱 점의 화면 격자 160자리·앱 점 여덟 자리 미리 보기와 `project` 보이는지가 같다
  (B의 잘린 쪽 두 점 — 윗면·안쪽 — 과 기준선 1의 잘린 쪽 점은 붙잡지 않고 `project`도 안 보임, B의 남는 쪽·A·판 위 점은 붙잡는다).
  `--base v0.33.0`으로는 0.33.0으로도 찍을 수 있는 장면 138개·값 94묶음이 같고, `many-*` 여섯이 0.42.0~0.44.0과 같은 화소 수(105·38·100·105·275·105 — 0.42.0 인스턴싱의
  반투명 모서리 선 겹침), `hole-measure-normal`은 0.36.0이 바꾼 3자리 그대로다(472초 — head 147·142초, base 98·81초, load average 15~18)

### 남은 한계

- `raw`를 주지 않은 늘 후보 앱 점은 구간 단면에 잘리지 않는다(0.44.0 그대로 — 위 까닭). 잘린 면을 고른 `pointsFor` 점은 고른 것의 번호가 없어 통째 평면만 본다
- `project`는 숨김(묶음·구간)을 보지 않는다. 최근접점은 단면을 보지 않는다(0.41.0 그대로 — 앱이 잴 구간을 준다)
- 구간 단면이 있는 동안 구간이 없는 그물도 그물마다 그린다(인스턴싱 꺼짐 — 0.44.0 그대로). 설계(넣지 않았다): 여러 단면 길은 평면을 그물 로컬로 바꿔 균일 변수로 올리므로
  자리마다 평면이 다르다 — 인스턴스 셰이더가 세계 좌표(자리 행렬 × 위치)로 세계 평면을 견주게 하고, 같은 그물·같은 평면 모음(그 묶음을 자르는 평면 번호들)끼리 모으면 균일 변수 한 벌로 그릴 수 있다
- 앞 뷰처럼 상자 옆면이 시선과 나란한 자리에서는 그 면 위 윤곽선의 가림 판정이 합친 그물과 나눈 묶음에서 다를 수 있다(잘린 면 채우기 `'all'` — 구간 단면과 상관없이 통째·모든 묶음 단면에서도, 0.44.0부터)

### 앱이 할 일

- SKP: 코어를 0.45.0으로 올린다. 지금 앱은 코어 앱 붙잡기 점(`setMeasureSnap`의 `points`·`pointsFor`)과 `project`를 쓰지 않아 할 일은 없다(측정은 앱 도구가 `pick`으로 —
  고르기는 0.44.0부터 구간 단면을 따른다). 앞으로 코어 앱 점을 쓰면 그 점이 놓인 노드의 삼각형 번호(`nodeRanges` 구간 안 아무 번호 — 윤곽선 점이면 그 윤곽선 번호와 `edges: true`)를
  `raw`로 달고(그룹 안 단면에서 잘린 그룹의 점을 붙잡지 않는다), 단면 너머 표시(글자·표식)를 `project`로 거르면 `{ id, raw }`를 준다. `pointsFor` 점은 고른 것의 번호를 받는다
- STEP: 코어를 0.45.0으로 올린다. 면 사이 최소 거리(앱이 따로 둔 삼각형 사이 거리 코드)는 `closestPointsAsync(a, b, { rangeA: 면 A 구간, rangeB: 면 B 구간, indices: true, signal })`로 바꾼다 —
  면 표의 이어진 삼각형 구간을 그대로 주면 복사 없이 같은 답이고, 번호(`rawA`·`rawB`)는 부품 그물 번호 그대로라 면 표로 바로 찾는다. 구간 단면은 쓰지 않으므로 앱 점 할 일은 없다
- NC: 코어를 0.45.0으로 올린다. 할 일은 없다
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.46.0: 키보드로 3D 붙잡기·고르기(STEP 53차 요청 — 가상 커서·Tab 후보 돌리기·Enter 찍기)·측정 후보 목록

3D 보기 안에서 측정 점을 찍고 고르는 일을 키보드만으로 한다(WCAG 2.1.1 키보드). 앱이 켜는 선택(`setKeyboardSnap`)이고,
**켜지 않으면(기본) 0.45.0과 그림·값·앱 호출 수가 바이트까지 같다**(넓은 탐색·화소·값 — 아래 "확인").

### 새 API

- `setKeyboardSnap(o)`(타입 `KeyboardSnapOptions` — `step`·`bigStep`·`keys`·`announce`, `true` = 기본값, `false`·`null` = 끈다), 읽기 `keyboardSnap`(기본값을 채운 꼴)·`keyboardCursor`
  (`KeyboardCursorState` — 자리·모드·후보 차례와 수, 꺼져 있으면 `null`)
- 알림 `announce(a)`(타입 `KeyboardSnapAnnouncement`): `reason`(`'start'`·`'move'`·`'cycle'`·`'commit'`·`'end'`·`'refresh'`), `mode`(`'measure'`·`'pick'`), 커서 자리 `x`·`y`,
  지금 후보 `snap`(`measureHoverSnap`과 같은 꼴)·`index`·`count`, 고르기 모드의 `pick`, 찍었을 때 `point`(`MeasurePoint`)·`measurement`, 코어 기본 한국어 글 `text`
- `measureCandidates(x, y, { max?, pointerType? })`(타입 `MeasureCandidatesOptions`): 화면 자리의 측정 붙잡기 후보 목록(`MeasureHoverSnap[]` — 가상 커서 Tab 차례와 같다).
  뷰어 상태(미리 보기·찍은 점·기준 선분)를 바꾸지 않는다. `commitMeasureCandidate(x, y, index, o?)`: 그 차례 후보를 찍는다(누르기와 같은 `onMeasure`)
- 순수(`opencad-viewer3d/keysnap` — 입구에서도): 기본 키 표 `KEY_SNAP_KEYS`, `KEY_STEP_PX`(5)·`KEY_BIG_STEP_PX`(50)·`KEY_CANDIDATES_MAX`(16)·`KEY_POINTER`(`'keyboard'`),
  `keySnapAction`(키 사건 → 할 일)·`normalizeKeySnapKeys`·`parseKeyDesc`·`keyLabel`·`keySnapHint`(키 안내 글)·`snapKindText`·`SNAP_KIND_LABELS`(앱 도움말·번역용)

### 키(기본 — `keys`로 바꾸거나 끈다)

| 키 | 할 일 | 언제 |
|---|---|---|
| ← → ↑ ↓ | 가상 커서를 켠다(처음 — 캔버스 가운데)·5 CSS 화소 옮긴다 | 측정·고르기 모드 |
| Shift+화살표 | 50 CSS 화소 옮긴다 | 같다 |
| Tab · Shift+Tab | 그 자리의 다음·앞 붙잡기 후보(끝에서 처음으로 돈다) | 커서가 켜진 측정 모드에서만 — 그 밖의 Tab은 브라우저 초점 이동 그대로 |
| Enter | 측정 모드면 지금 후보를 찍는다(`onMeasure`), 아니면 그 자리를 누른 것처럼 고른다(`onPick` — `pointerType` `'keyboard'`, 늘 `clicks` 1, Shift+Enter면 `shiftKey`) | 커서가 꺼져 있으면 켠다 |
| Esc | 뷰 큐브 접기·측정 지우기(뷰어 Esc 그대로)가 먼저, 지울 것이 없으면 커서를 끈다 | 커서가 켜져 있을 때 |

- 캔버스가 받은 키만 받는다(대상이 캔버스이거나 대상이 없는 합성 사건). 앱이 창 키를 `handleKey`로 넘겨도 다른 칸(단추·입력 칸)의 Tab·Enter는 받지 않는다.
  앱이 이미 기본 동작을 막은 키(`defaultPrevented`)도 받지 않는다 — 앱이 같은 키를 먼저 쓰려면 막으면 된다. 걷기 중에는 받지 않는다(화살표는 걷기)
- 커서를 끄는 때: Esc, 포인터가 켤 때 자리에서 4화소(`DRAG_START_PX`) 넘게 움직이거나 누를 때(포인터가 이어받는다 — 그 안의 제자리 사건은 넘긴다),
  초점이 문서 안 다른 곳으로 갈 때(창만 흐려지면 둔다 — 0.9.1 초점 테두리와 같은 판정), `setKeyboardSnap(false)`
- 가상 커서 표식: 측정 붙잡기 표식 그리기(0.8.0~0.38.0 — `drawMeasure` 안에서 그대로 떼었다)에 가운데를 비운 십자를 더해 화면 덧그림에만 그린다(그림 저장에는 없다).
  지금 후보는 마우스 미리 보기와 같은 표식·안내선·거리 글상자로 그린다

### 후보 차례(마우스와 같은 규칙)

- 첫째 = 같은 자리 마우스 미리 보기(`measureHoverSnap`). 둘째부터 = 앞 후보로 고른 점 붙잡기의 자리를 빼고 같은 측정 점 고르기를 다시 부른 결과 —
  그래서 붙잡기 차례(화면에서 가까운 것, 같으면 앞의 것), 앱 점 우선(0.41.0 `'low'`·`'fallback'`), 다듬기(0.14.0~0.40.0), 잠금(0.10.0 — 잠근 동안은 모든 후보가 잠근 선 위 점),
  구간 단면(0.45.0)을 그대로 따른다. 코어 안에서는 측정 점 고르기에 "뺄 자리" 인자를 하나 더했을 뿐이고, 주지 않으면 0.45.0과 같은 길이다
- 점 붙잡기(꼭짓점·끝점·가운데 점·앱 점·교차점·수직 발)가 다하면 선 추론(첫 점 축·나란함·끌어온 축과 그 교차, 잠근 선 교차) 하나, 그다음 선 추론 없이 `'fallback'` 앱 점,
  끝은 붙잡지 않은 자리(선분·면 위 점 — 다듬기 `'onEdge'`·`'onFace'`도, 잠근 동안이면 커서를 잠근 선에 내린 자리)다. 자리가 꼭 같은 결과는 앞의 것만 두고, 16개까지
- 후보마다 같은 앞 상태(지나간 기준 선분 — 0.10.0·0.27.0·0.29.0)에서 구해 마우스가 그 자리에 처음 온 것과 같게 하고, 보이는 후보를 고른 뒤의 상태로 둔다
- Enter는 그 자리에서 후보를 다시 구해(누르기가 그 자리를 다시 구하는 것과 같다) 보인 후보와 같은 점을 찍는다. 찍은 뒤에도 커서는 켜져 있고 같은 자리 다음 미리 보기를 보인다
- 예(시험 장면): 두 선분의 교차점, 앱 원 중심, `'low'` 앱 점이 커서 10화소 안이면 Tab 차례는 교차점 → 중심 → 앱 점 → 선분 위 점이다

### 설계 근거

- AutoCAD 도움말 "About Using Object Snaps": 한 자리에 여러 객체 스냅이 걸리면 점을 고르기 전에 Tab으로 차례로 돌린다 — 후보 돌리기 키와 "점 붙잡기가 먼저, 그다음 자리" 차례
- WCAG 2.1.1(키보드)·2.1.2(키보드 덫 없음): Tab은 커서를 켠 동안 측정 모드에서만 받고, Esc로 끄면 초점 이동으로 돌아간다. 켤 때 알림 끝에 키 안내
  (`'옮기기 ←→↑↓ · 후보 Tab · 찍기 Enter · 끄기 Esc'` — 바꾼 키면 그 키)를 붙인다. WAI-ARIA 작성 관행(초점이 있는 복합 위젯 안 이동은 화살표, 실행은 Enter)
- 겹침: 뷰어 키(F·1~7·Esc)와 세 앱이 쓰는 키(STEP H·I·Home·F7·Ctrl+O·Z·Y, SKP T·PageUp·PageDown·?·F7·Delete, NC Space·F7·Ctrl+F·G)와 겹치지 않는다(시험).
  화살표는 NC(측정 첫 점 뒤 방향 잠금·재생 걸음·줄 이동)와 SKP 측정 도구(방향 잠금)도 쓴다 — 켜는 앱이 정한다(아래 "앱이 할 일")
- 시간으로 정하는 몸짓을 쓰지 않는다: 끌어온 축 머무르기(0.16.0)는 키보드에서 하지 않는다(화면 읽기 프로그램이 알림을 읽는 동안 머문 점이 모두 끌려온다 — WCAG 2.2.1).
  손가락처럼 앱이 `setMeasureTrackPoints`로 준다
- 포인터 종류 `'keyboard'`는 터치가 아니라 허용 거리가 마우스·펜과 같다. 고르기 알림의 `pointerType`으로 앱이 가린다

### 바뀐 기본 동작

- 없다. 켜지 않으면 키·그리기·포인터·측정이 0.45.0과 같다(아래 "확인"). 안에서는 누르기의 측정 찍기를 `commitMeasure`로, 붙잡기 표식 그리기를 `drawSnapMark`로 떼었다(같은 명령)

### 확인

- 시험 `tests/v0460keysnap.test.ts`(27개): 키 표(풀기·합치기·할 일 — 뷰어 키·세 앱 키와 겹치지 않음, 수정 키를 꼭 같게 적은 키가 먼저, 한 글자 대소문자), 걸음·안내·후보 글,
  후보 목록(교차점 → 앱 중심 → `'low'` 앱 점 → 선분 위 점, 첫째 = 마우스 미리 보기, 목록을 구해도 상태 그대로, 다듬기 `'onEdge'`·잠근 선 위, 첫 점 축 → `'fallback'` → 붙잡지 않은 점,
  0.7.2 규칙), 가짜 DOM 키 사건(켜기·Tab 한 바퀴·Shift+Tab, Enter로 찍은 점·`onMeasure` = 같은 자리 마우스 누르기, Tab은 커서가 켜진 측정 모드에서만, Esc 차례,
  다른 대상·막은 키·걷기, 포인터 4화소·누르기·초점으로 끄기, 고르기 모드 `onPick`, Shift 잠금 `'refresh'`, 키 바꾸기, 표식은 화면 덧그림에만), 켜 두고 쓰지 않으면
  마우스 미리 보기·누르기·`pointsFor` 호출 수가 끈 것과 같다. typecheck와 전체 시험(94파일 987개)이 통과한다
- 넓은 탐색(가짜 WebGL, 경우마다 새 뷰어·새 기억, 45차 머리 63df824와 행 단위로 견줌): 37차 넓은 탐색 사본 275,836자리와 38차 모서리 꼴 3,600경우 871,200자리가
  모두 같다(행 파일이 바이트까지 같고 앱 호출도 같다 — 닫힌 3,640·열린 5,960번)
- 미리 보기 한 번(가짜 WebGL 그리기 포함, 400자리 × 세 번 — 둘째·셋째 판의 가운데값 ms, base·head·head 가상 커서를 차례를 돌려 세 짝, load average 7~10):

  | 장면 | 63df824(마우스) | head(마우스) | head 가상 커서(화살표 한 번 — 후보 목록 다시 구하기 + 그리기) |
  |---|---:|---:|---:|
  | 곧은 선 82개 격자 + 앱 점 20,000개(색인) + `pointsFor` 셋 | 0.0492 · 0.0398 | 0.0501 · 0.0389 | 0.0546 · 0.0521(후보 평균 1.05개) |
  | 상자 200개를 합친 그물 + 앞 100개 구간 단면 + 앱 점 20,000개 + `pointsFor` 둘 | 0.1126 · 0.1086 | 0.1139 · 0.1103 | 0.1372 · 0.1262(후보 평균 1.6개) |

  `pointsFor` 호출과 고른 종류는 63df824와 head(마우스)가 같다. 가상 커서는 화살표 한 번에 측정 점 고르기를 (후보 수 + 1)번쯤 부른다(`pointsFor`는 같은 고르기면 다시 쓴다)
- 화소·값 회귀(960 × 600, 판마다 두 번): `npm run pixels -- --base 63df824`(45차 머리)로 장면 157개와 값 113묶음이 모두 같고(바이트까지), 새 값은 `keysnap-values` 하나다
  (새 장면 없음, 569초 — head 131·133초, base 161·138초, load average 7~18). 그 값에서 화면 격자 90자리 모두 마우스 미리 보기 = 후보 목록 첫째이고 목록을 구해도 미리 보기가 그대로,
  가상 커서로 켜 걸음으로 옮긴 자리(후보 셋 — 끝점·앱 점·앱 중심)에서 Tab 한 바퀴 = 목록 차례·Shift+Tab = 마지막, Enter로 찍은 둘째 후보 = `commitMeasureCandidate`,
  커서 표식은 화면 덧그림에만 있다(같은 자리 마우스 미리 보기와 덧그림은 다르고 그림 저장은 같다).
  `--base v0.33.0`으로는 0.33.0으로도 찍을 수 있는 장면 138개·값 94묶음이 같고, `many-*` 여섯이 0.42.0~0.45.0과 같은 화소 수(105·38·100·105·275·105 — 0.42.0 인스턴싱의
  반투명 모서리 선 겹침), `hole-measure-normal`은 0.36.0이 바꾼 3자리 그대로다(450초, load average 12~18)

### 남은 한계

- 고르기 모드에는 후보 돌리기가 없다 — 커서 아래 고르기 하나다(같은 자리에 겹친 선분·면을 돌려 고르는 AutoCAD 선택 돌리기는 없다)
- 선 추론은 한 자리에 하나만 후보에 든다(점 붙잡기가 없을 때 마우스가 고르는 그것 — 첫 점 축과 끌어온 축이 함께 커서 둘레여도 둘째 선은 돌리지 않는다)
- 카메라를 바꾸면(뷰 키·휠·끌기) 커서 화면 자리는 그대로이고 후보는 다음 키에서 다시 구한다(마우스와 같다). 커서는 늘 캔버스 가운데에서 켠다(예측할 수 있게 — 마우스 자리에서 켜지 않는다)
- 커서는 화면 자리만 옮긴다(축을 따라 세계 거리만큼 옮기기·좌표 입력은 없다 — 측정 첫 점 뒤 거리 입력은 앱 몫). 코어 알림 글은 한국어 하나다(앱이 값으로 옮긴다)
- 코어는 화면 읽기 프로그램에 직접 말하지 않는다(aria-live 영역·캔버스 이름·`aria-keyshortcuts`는 앱 몫)

### 앱이 할 일

- STEP: 코어를 0.46.0으로 올리고 `setKeyboardSnap({ announce })`로 켠다. `announce`의 `text`(또는 값으로 번역한 글)를 `aria-live="polite"` 영역에 넣고, 캔버스에
  `aria-keyshortcuts`와 도움말 키 표를 단다(`keySnapHint`·`keyLabel`). 창 키를 `handleKey`로 넘기지만 코어는 캔버스가 받은 키만 쓰므로 단추의 Tab·Enter와 겹치지 않는다.
  면·모서리 고르기도 Enter로 된다 — `onPick`의 `pointerType`이 `'keyboard'`면 초점을 캔버스에 둔다(선택 패널로 옮기지 않는다)
- NC: 켠다면 측정 첫 점 뒤 화살표 방향 잠금·←→ 재생 걸음·↑↓ 줄 이동(캔버스 초점)과 겹친다. `keyboardCursor`가 있는 동안(가상 커서가 켜진 동안) 그 화살표를 앱 `keyAction`에서
  코어로 넘기거나, 코어 키를 `keys: { left: ['Alt+ArrowLeft'], … }`처럼 바꾼다. 방향 잠금은 Shift(코어 — 지금 후보의 방향)로도 된다
- SKP: 앱 측정 도구는 코어 측정을 쓰지 않는다 — 켜면 고르기(Enter → `onPick`)는 그대로 되고, 줄자 도구가 가상 커서를 쓰려면 `keyboardCursor`의 자리로 제 고르기·붙잡기를 하거나
  (알림 `reason`으로 때를 안다) 코어 측정과 `measureCandidates`로 옮긴다. 줄자 도구의 화살표 잠금과 겹치므로 켜는 동안 앱 키를 정한다
- 마우스 사용자에게 같은 차례를 주려면(앱 단축키·목록 UI) `measureCandidates(커서 x, y)`로 목록을 보이고 `commitMeasureCandidate`로 찍는다
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.47.0: 가려진 측정 덧그림 글의 대비(STEP 54차 요청)·겹친 것 고르기 돌리기·키보드 알림 글 바꾸기

가려진 앱 측정 덧그림 글상자는 이제 글을 진하게 두고 가려짐을 점선 테두리로 알린다(**바뀐 기본 동작** — 가려진 덧그림 글상자만).
겹친 것 고르기 돌리기(`pickCandidates`, 가상 커서 고르기 모드의 Tab)와 키보드 알림 글 틀(`messages`)은 앱이 쓸 때만 달라진다.
그 밖의 그림·값·앱 호출은 0.46.0과 같다(아래 "확인").

### 가려진 측정 덧그림 글상자(STEP 54차 요청 — WCAG 1.4.3)

- 앱 측정 덧그림(`setAnnotations`)의 글자 상자 자리가 앞 면에 가려지면 0.46.0까지는 상자 바탕·글·테두리를 모두 불투명도 `max(hidden, 0.5)`로 그렸다.
  기본 `hidden` 0.35에서 글이 글상자 바탕과 테마 바탕 위에서 밝게 3.1:1, 어둡게 4.4:1이라 4.5:1에 못 미쳤다(앱이 잰 값과 같다 — 아래 표)
- 이제 가려진 글상자도 바탕·글은 보이는 글상자처럼 불투명하게 그리고, 테두리만 [4, 3] 점선(`HIDDEN_LABEL_DASH`)으로 그린다. 점 표식과 GL 선은 글이 아니므로 그대로 `hidden` 불투명도다.
  `hidden` 0이면 가려진 글상자를 그리지 않고, 1이면 실선이다(보이는 것과 같다 — 둘 다 0.46.0 그대로). 꼴은 순수 `annotationLabelLook(hidden, opacity)`가 정한다(입구에서도)
- 점선은 캔버스 점선 스트로크(`setLineDash`)가 아니라 둘레를 무늬대로 자른 토막(순수 `dashedRectSegments`)마다 굵기 1 사각형을 칠한다. 점선 경로 스트로크는
  Chrome 2D 캔버스에서 같은 캔버스의 다른 덧그림(좌표축·점 표식·다른 글상자 테두리) 경계 화소까지 몇 단계 바꿨다(화소 회귀로 보았다 — 아래 "확인")
- 근거: WCAG 1.4.3(글 대비 4.5:1)과 1.4.1(투명도·색만으로 상태를 알리지 않는다 — 실선·점선의 모양 차이로 가른다). 제도에서 가려진 모서리는 점선(숨은선)이고,
  코어도 뒤 모서리(0.7.1)·단면 평면 표시를 점선으로 그린다. 점선 테두리(테마 측정 색)는 테마 바탕 위 글상자 바탕과 밝게 4.25:1, 어둡게 11.43:1이다(그래픽 3:1 — WCAG 1.4.11)
- 대비(글 대 글상자 바탕, WCAG 2 대비비). 계산은 테마 색으로 글상자 바탕을 아래 바탕 위에 얹은 값, 실측은 Chrome(SwiftShader) 그림 저장 화소에서 상자 면 위 글상자의
  가장 흔한 색(바탕)과 그것과 휘도 차가 가장 큰 화소(글)를 잰 값이다(화소 값 묶음 `hidden-label-cycle-values`):

  | 테마 | 0.46.0 계산(테마 바탕) | 0.46.0 계산(검정·흰색·회색·면 색 가운데 가장 낮은 것) | 0.46.0 실측(상자 면 위) | 0.47.0 계산(테마 바탕) | 0.47.0 계산(네 바탕 가운데 가장 낮은 것) | 0.47.0 실측(보이는 글상자 실측) |
  |---|---:|---:|---:|---:|---:|---:|
  | 어두운 | 4.36 | 1.53(흰색) | 3.21 | 13.78 | 8.76(흰색) | 11.28(11.28) |
  | 밝은 | 3.09 | 1.79(검정) | 1.72 | 15.29 | 11.75(검정) | 13.76(13.73) |

### 겹친 것 고르기 돌리기(46차가 남긴 것)

- `pickCandidates(x, y, opts?)`(선택 `PickCandidatesOptions` — `pick` 선택 `pointerType`·`edges`·`meshesOnly`·`throughTranslucent`과 `max`, 기본 16 `PICK_CANDIDATES_MAX`):
  화면 자리에 겹친 고르기 후보(`Pick3d[]`). 첫째는 같은 선택의 `pick(x, y, opts)`와 같고, 다음은 앞 후보(점·선분·윤곽선·그물 삼각형·잘린 면)를 걷어 내고 같은 고르기를
  다시 부른 것이다 — 그래서 고르기 차례(점 → 선분 → 윤곽선 → 잘린 면 → 그물 면), 허용 거리, 가림, 단면, 숨긴 구간, 반투명 지나기가 그대로이고, 그물은 앞 면 뒤의 것
  (같은 그물의 뒷면, 뒤 묶음, 앞 면에 가렸던 선분·점)이 앞에서부터 나온다(깊이 벗기기). 같은 그물에서 같은 깊이·같은 법선으로 맞은 삼각형(삼각형 경계 위 — 한 평면)은 하나로 센다.
  뷰어 상태를 바꾸지 않는다(앱이 제 목록 UI로 고르게 할 때 — 고른 것은 앱이 제 고르기 처리기에 넘긴다). 순수 `samePickTarget`(종류·묶음·번호·잘린 면이 같은지)도 입구에서 내보낸다
- 가상 커서 고르기 모드(`setKeyboardSnap`의 새 선택 `pickCycle` — 기본 켬): 커서가 켜진 고르기 모드(측정 모드가 아닐 때)에서도 Tab·Shift+Tab으로 커서 자리의 `pickCandidates`
  차례를 돌린다. 알림·`keyboardCursor`의 `index`·`count`가 고르기 후보 차례와 수이고, 알림 글은 `'상자 면 2/3: X …'`(측정 후보 글과 같은 꼴), 켤 때 키 안내에 `후보 Tab`이 든다.
  지금 후보가 선분·윤곽선이면 그 선분을, 점이면 둘레 고리를 화면 덧그림에 강조 색으로 그린다(그물 면은 커서 자리 그대로 — 앱이 알림의 `pick`으로 강조한다. 그림 저장에는 없다)
- Enter: 첫째 후보면 0.46.0처럼 누른 것과 같은 고르기(`onPick` 알림마다 제 선택). 둘째 이후 후보면 모든 알림이 그 후보를 받고 사건에 `cycle`(`{ index, count }`)이 붙는다 —
  `front` 알림의 `front`도 그 후보, 그물 면만 받는 알림(`meshesOnly`)은 후보가 그물 면이 아니면 그 알림의 보통 고르기다. 고른 뒤에도 커서와 차례가 그대로다
- `pickCycle` 객체(`KeyPickCycleOptions` — `edges`·`meshesOnly`·`throughTranslucent`)는 후보를 고를 선택이다(앱의 `onPick` 선택과 맞춘다). `false`면 0.46.0 고르기 모드 그대로
  (Tab은 브라우저 초점 이동, 알림의 `index`·`count`는 0)
- 근거: AutoCAD 선택 돌리기(도움말 "Work with Stacked Objects"·"Selection Cycling" — 겹친 객체를 Shift+Space로 차례로 돌려 고른다, 지금 후보를 강조한다)와
  Onshape "Select other"(커서 아래 겹친 것 목록 — 마우스 앱 UI는 `pickCandidates`로 만든다). SketchUp에는 겹친 것 돌리기가 없어 X-ray·선 보기로 뒤를 보고 고른다 —
  코어는 3D에서 앞 면 뒤를 차례로 내는 깊이 벗기기로 그 자리를 채운다. 키는 0.46.0 측정 후보와 같은 Tab(커서가 켜진 동안만, Esc로 끄면 초점 이동 — WCAG 2.1.2)

### 키보드 알림 글 바꾸기(46차가 남긴 것 — 코어 알림 글은 한국어 하나)

- `setKeyboardSnap({ messages })`: 열쇠 → 틀 글(`{0}`·`{1}` 자리 — 세 앱의 `site/locales/*.json` 사전과 같은 꼴)을 주면 그 틀로 알림 `text`를 만든다.
  준 열쇠만 바뀌고 나머지는 기본(한국어 `KEY_SNAP_MESSAGES`)이다. 틀을 주지 않으면 0.46.0 글과 바이트까지 같다
- 열쇠: 알림 틀(`start`·`end`·`only`·`candidate`·`candidateDistance`·`order`·`point`·`noSnap`·`pickItem`·`noPick`·`picked`·`pickedNothing`·`noPoint`·`firstPoint`·`secondPoint`),
  종류 이름(`snap.vertex` … `snap.none`, `pick.mesh` … `pick.section`, `axisKind`·`lockedKind`), 키 안내(`hintMove`·`hintNext`·`hintCommit`·`hintPick`·`hintExit`·`hintJoin`).
  자리 차례를 틀이 정하므로(예: `pickItem` `'{1} of {0}'` → `'segment of Rail'`) 말 차례가 다른 언어도 된다
- 순수(입구에서도): `KEY_SNAP_MESSAGES`(타입 `KeySnapMessages`·`KeySnapMessageKey`), `keySnapMessages(부분 틀)`(합치기 — 글이 아닌 값·모르는 열쇠는 뺀다), `formatKeySnapMessage(틀, 값)`,
  `orderedText`(차례·거리를 붙인 후보 글), `snapKindText`·`candidateText`·`pointText`·`keySnapHint`의 마지막 인자로 틀(주지 않으면 0.46.0 글). `candidateText`·`pointText`도 0.47.0부터 입구에서 내보낸다
- 근거: 알림 글은 페이지 언어로 읽혀야 한다(WCAG 3.1.1 — 한국어 글을 영어 페이지의 화면 읽기 프로그램이 영어로 읽는다). 값은 0.46.0처럼 알림에 그대로 있으므로
  틀 대신 값으로 제 글을 만들어도 된다(글 만드는 함수를 따로 받지 않는다 — 열쇠·값 꼴이 앱 사전과 바로 맞는다)

### 바뀐 기본 동작

- 가려진 앱 측정 덧그림 글상자(기본 `hidden` 0.35 등 0과 1 사이): 반투명 → 불투명 바탕·글에 점선 테두리. 보이는 글상자·점 표식·GL 선·측정 거리 글상자는 그대로다
- `setKeyboardSnap`을 켠 앱의 고르기 모드: 커서가 켜진 동안 Tab을 받는다(`pickCycle: false`면 0.46.0 그대로). 켜지 않은 앱은 바뀌지 않는다
- 안에서는 고르기 선택 만들기를 `pickArgs`로 떼었다(같은 선택 — 넓은 탐색으로 확인)

### 확인

- 시험: `tests/v0470label.test.ts`(8개 — 글상자 꼴 네 경우, 점선 토막(모서리 너머 무늬 잇기·홀수 무늬·잘못된 입력), 0.46.0 꼴은 테마 바탕에서 4.5:1 아래·0.47.0은 두 테마 네 바탕 모두 4.5:1 이상·
  점선 테두리 3:1 이상, 덧그림 2D 호출 기록으로 가려진 글상자 = 불투명 바탕·글 + [4, 3] 토막 사각형(경로 점선 없음), 보이는 것·`hidden` 1·선 모드 = 실선, `hidden` 0 = 그리지 않음,
  가려진 점 표식은 그대로 흐림),
  `tests/v0470cycle.test.ts`(13개 — 세 선분이 만나는 자리의 후보 차례, 가린 점은 앞 면 뒤에, 첫째 = `pick`(격자 · 다섯 선택), 반투명 지나기, 단면 잘린 면 하나, 윤곽선,
  고르기 모드 Tab·Shift+Tab·알림, Enter 첫째 = 누르기와 같은 고르기·둘째 이후 = 그 후보와 `cycle`·`front`·그물 면만 알림, `pickCycle` 객체·끔, 후보 표식, 켜 두고 쓰지 않으면 마우스 고르기가 같다),
  `tests/v0470messages.test.ts`(6개 — 틀 자리·합치기, 기본 틀 = 0.46.0 글, 영어 틀로 측정·고르기 알림 — 값은 그대로). 0.46.0 Tab 시험의 고르기 모드 단언은 `pickCycle: false`에서 본다.
  typecheck와 전체 시험(97파일 1,014개)이 통과한다
- 넓은 탐색(가짜 WebGL, 46차 머리 7df754f와 행 단위로 견줌 — 고르기 선택 만들기를 뗀 것까지): 37차 넓은 탐색 사본 275,836자리와 38차 모서리 꼴 3,600경우 871,200자리 행 파일이
  바이트까지 같고 앱 호출도 같다(닫힌 3,640·열린 5,960번). 고르기 돌리기를 넣은 판(8cad6e5)과 마지막 코드(57c9dd0) 두 번 모두 같다(load average 7~70)
- 비용(가짜 WebGL 그리기 포함, 400자리 × 세 번 — 둘째·셋째 판 가운데값 ms, base 7df754f·head(a96a761 — 그 뒤는 가려진 글상자 점선 칠하기만 바뀜)를 번갈아 세 짝, load average 34~38):

  | 장면 | 7df754f 마우스 미리 보기 | head 마우스 미리 보기 | 7df754f `pick` | head `pick` | head `pickCandidates`(후보 평균) | head 고르기 모드 화살표 한 번(후보 평균) |
  |---|---:|---:|---:|---:|---:|---:|
  | 곧은 선 82개 격자 + 앱 점 20,000개 + `pointsFor` 셋 | 0.0575 · 0.0441 | 0.0594 · 0.0452 | 0.0065 · 0.0060 | 0.0065 · 0.0056 | 0.0075 · 0.0078(0.31개) | 0.0330 · 0.0310(0.24개) |
  | 상자 200개를 합친 그물 + 구간 단면 + 앱 점 20,000개 + `pointsFor` 둘 | 0.1339 · 0.1374 | 0.1330 · 0.1237 | 0.0107 · 0.0109 | 0.0117 · 0.0099 | 0.0206 · 0.0220(2개) | 0.0960 · 0.1016(2개) |

  `pointsFor` 호출·고른 종류·고르기 종류는 7df754f와 head가 같다. 후보 목록은 후보 수 + 1번 고르기다(고르기 모드 화살표는 목록과 그리기)
- 화소·값 회귀(960 × 600, 판마다 두 번, Chrome 157 SwiftShader): `npm run pixels -- --base 7df754f`(46차 머리)로 장면 157개 가운데 156개와 값 115묶음 가운데 114개(`keysnap-values` 포함 —
  기본 틀 알림 글이 같다)가 바이트까지 같다. 다른 것은 의도한 둘이다: 장면 `base-annotations`는 글자 자리가 구 안(가려짐)인 반지름 덧그림 글상자 한 덩어리 2,234화소(최대 차 111)만 다르고
  (다른 덧그림·3D 그림은 같다), 새 값 묶음 `hidden-label-cycle-values`(기존 `base` 장면을 다시 씀 — 새 장면 없음)는 위 대비 실측과 고르기 돌리기 값이다(522초 — head 126·128초, base 130·135초, load average 8~15).
  그 고르기 값: 화면 격자 90자리 모두 후보 첫째 = `pick`(후보 수 0개 77자리·2개 4·4개 7·16개 2), 구멍 점 자리 후보는 점 하나 뒤 공구 경로 토막 15개(16개 한도),
  가상 커서 Tab 한 바퀴 = 목록 차례(1/16 … 0/16), Enter로 고른 둘째 후보 = `onPick`(`cycle` `{ index: 1, count: 16 }`, `pointerType` `'keyboard'`).
  점선을 캔버스 점선 스트로크로 그린 첫 판(8cad6e5)은 같은 장면에서 좌표축·점 표식·다른 글상자 테두리 경계 화소도 몇십 개씩(최대 차 4~24) 달라 토막 사각형 칠하기로 고쳤다(57c9dd0).
  `--base v0.33.0`으로는 0.33.0으로도 찍을 수 있는 장면 144개 가운데 137개·값 94묶음이 같고(0.46.0은 138개), 다른 장면은 `base-annotations`(위와 같은 한 덩어리 2,234화소)와
  0.42.0~0.46.0과 같은 화소 수의 `many-*` 여섯(105·38·100·105·275·105), 다른 값은 0.36.0이 바꾼 `hole-measure-normal` 3자리 그대로와 새 값 `hidden-label-cycle-values`다(444초, load average 14~16)
- 화소 CI(`pixels.yml`)는 base와 값이 다른 장면·값이 있으면 실패하므로 이 PR에는 `pixels-changed` 라벨이 필요하다(의도한 변화 — 가려진 덧그림 글상자 한 장면과 새 값 묶음).
  새 장면이 없고 새 값 하나가 head에서 몇 초라 화소 CI 시간은 0.46.0과 거의 같다(약 11~12분)

### 남은 한계

- 고르기 후보는 기본 도형 단위다(같은 그물의 앞 면·뒷면은 둘, 꺾은선의 겹친 토막은 토막마다 — 아주 촘촘한 공구 경로 위에서는 16개 한도가 선분으로 찬다).
  묶음·B-rep 면 단위로 묶어 돌리는 것은 앱 몫이다(`pickCandidates` 결과를 앱 식별자로 묶는다)
- 그물 면 후보는 화면 덧그림에 표시하지 않는다(커서 자리 그대로 — 면 모양은 앱이 안다). 마우스로 Tab을 돌리는 것(커서 아래 겹친 것)은 코어에 없다(앱이 `pickCandidates`로 만든다)
- 선 추론은 한 자리에 하나만 측정 후보에 든다(0.46.0 그대로 — 둘째 선 추론은 돌리지 않는다)
- 알림 글 틀은 문장 틀이다 — 복수형·성 같은 언어 규칙(ICU 복수 등)은 없다(앱이 값으로 만든다). 수 꼴(소수점)은 측정 글과 같은 `toFixed`다

### 앱이 할 일

- STEP: 코어를 0.47.0으로 올리면 가려진 측정 덧그림 글이 진해진다(54차 요청 — 앱 쪽 우회가 있으면 뺀다). 가상 커서를 켰다면 `pickCycle: { throughTranslucent: pickThrough }`로
  앱 `onPick` 선택과 맞추고, 사건의 `cycle`이 있으면 그 고르기를 면·모서리 선택에 쓴다(B-rep 면 단위로 묶어 보이려면 `pickCandidates` 결과를 면 id로 묶는다).
  알림 글은 `messages`에 `site/locales/*.json`의 같은 열쇠 틀을 넣는다
- NC: 판재 보기의 `onPick({ throughTranslucent: true, front: true })`와 맞추려면 `pickCycle: { throughTranslucent: true }`로 켠다(둘째 이후 후보는 `front`도 그 후보 — 겹친 가공 경로·구멍을
  키보드로 차례로 고른다). 촘촘한 공구 경로에서는 후보가 경로 토막으로 차므로 가공 단위로 묶어 보이려면 `pickCandidates`를 앱 가공 id로 묶는다. 알림 글은 `messages`
- SKP: 고르기 모드 Tab으로 겹친 면·모서리를 돌려 고를 수 있다(SketchUp에 없는 것 — X-ray 없이 뒤 면 고르기). `onPick` 처리기가 `e.cycle`을 받으면 그 고르기를 그대로 고른다.
  측정 도구 줄자는 0.46.0 그대로(앱 측정). 알림 글은 `messages`
- 마우스 "다른 것 고르기" 목록(Onshape "Select other" 같은 것 — 길게 누르기·오른쪽 단추 메뉴 등 앱 UI)을 주려면 `pickCandidates(커서 x, y, 앱 고르기 선택)`로 목록을 보이고 고른 것을 앱 처리기에 넘긴다
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.48.0: 카메라 움직임 설정을 연 뒤에도 따르기(STEP 55·SKP 47차 요청)·밝은 테마 Y축과 고른 것 강조색 대비(SKP 47차 요청)

카메라 움직임 설정을 뷰어를 연 뒤에도 바꿀 수 있고(`setAnimate`), `animate: 'auto'`면 사용자의 움직임 줄이기 선호(`prefers-reduced-motion`)를 코어가 스스로 따른다.
밝은 테마의 Y축 색과 고른 것 강조색은 바탕과 3:1이 넘게 진해졌다(**바뀐 기본 동작** — 밝은 테마 그림의 그 두 색 자리만).
`animate`를 주지 않은 앱의 카메라 움직임과 그 밖의 그림·값·앱 호출은 0.47.0과 같다(아래 "확인").

### 새 API

- `Viewer3dOptions.animate`: `true`(기본 — 0.47.0)·`false`에 더해 `'auto'`(타입 `AnimateSetting`). `'auto'`면 `matchMedia('(prefers-reduced-motion: reduce)')`가 맞을 때 카메라를 바로 옮기고,
  그 질의의 `change` 사건(옛 Safari 13 이하는 `addListener`)으로 연 뒤 OS·브라우저 설정을 바꿔도 새로 고침 없이 따른다. `'auto'`일 때만 질의를 듣는다(`true`·`false`면 0.47.0처럼 부르지 않는다)
- `setAnimate(true | false | 'auto')`: 연 뒤 바꾼다(앱 설정 화면, 앱이 제 질의를 들을 때). 읽기 `animate`(지금 부드럽게 옮기는지 — `'auto'`면 선호를 따른 값)·`animateSetting`(준 값).
  바뀐 값이 "움직이지 않음"이면(설정을 끄거나 `'auto'`에서 선호가 줄이기로 바뀌면) 옮기던 카메라를 그 자리에서 끝 자리로 마친다(바로 옮긴 것과 같은 카메라)
- `flyTo(camera, animate?)`: 주어진 카메라로 날아간다(앱의 홈 보기·저장된 보기·장면 탭). 다른 카메라 길과 같은 0.32초 움직임·같은 곡선이고 같은 설정을 따른다.
  `setCamera`는 0.47.0 그대로 늘 바로 바꾼다
- 순수(입구에서도, 하위 경로 `opencad-viewer3d/motion` — 가져오는 모듈이 없다): `REDUCED_MOTION_QUERY`, `normalizeAnimate`(주지 않으면 `true`, `'auto'`는 그대로, 그 밖은 참·거짓 — 0.47.0까지처럼),
  `resolveAnimate(설정, 줄이기)`, `watchReducedMotion(matchMedia, cb)` → `{ reduce, off }`(값이 바뀔 때만 알린다, matchMedia가 없거나 던지면 선호 없음), 타입 `MotionQueryList`·`MotionMatchMedia`

### 카메라를 날리는 길(모두 같은 설정)

- 코어의 카메라 움직임은 모두 안의 `goto` 하나를 지난다. 0.47.0까지 그 길의 기본 인자가 만들 때 정한 `animate`였고, 이제 지금 값(읽기 `animate`)이다:
  뷰 큐브 누르기, 키 F(전체 보기)·1~7(표준 뷰 — 7 남동 등각은 앱의 홈 보기로도 쓴다), 가운데 단추 두 번(전체 보기), `fit`·`fitItems`(고른 것 맞춰 보기)·`setView`·`setViewDir`·`zoomToRect`·`flyTo`(저장된 보기)
- 각 함수에 `animate` 인자를 주면 그 값이 이긴다(0.47.0 그대로 — 앱이 제 설정으로 정할 때). 세 앱은 바로 옮길 때만(`fit(false)`·`setView(v, false)`) 인자를 준다
- 걷기(키를 누르는 동안)·끌기·휠은 사용자가 움직이는 동안만 움직이므로 설정과 상관없다
- 근거: WCAG 2.3.3(상호 작용으로 생긴 움직임을 끌 수 있다), CSS Media Queries Level 5 `prefers-reduced-motion`과 `MediaQueryList`의 `change` 사건.
  선호를 코어가 직접 들으면 앱이 듣는 길을 따로 두지 않아도 뷰 큐브·키처럼 코어 안에서 시작하는 움직임까지 같은 값을 쓴다

### 밝은 테마 Y축·고른 것 강조색(SKP 47차 요청 — WCAG 1.4.11)

- 대비(테마 바탕 위에 알파대로 얹은 색, WCAG 2 대비비). 밝은 테마 Y축과 강조색만 3:1이 안 됐고, 어두운 테마는 축 셋·강조색 모두 3:1 이상이라 그대로 두었다:

  | 테마 | 색 | 0.47.0 | 대비 | 0.48.0 | 대비 |
  |---|---|---|---:|---|---:|
  | 밝은 | Y축 | `rgba(40,150,40,0.75)` | 2.52 | `rgba(25,120,25,0.85)` | 3.91 |
  | 밝은 | 고른 것 강조색 | `#e07800` | 2.81 | `#b87700` | 3.39 |
  | 밝은 | X축·Z축 | 그대로 | 3.30·4.08 | 그대로 | 3.30·4.08 |
  | 어두운 | X·Y·Z축·강조색 | 그대로 | 3.09·4.89·4.12·8.42 | 그대로 | 3.09·4.89·4.12·8.42 |

- Y축: 축 색 관례(X 빨강·Y 초록·Z 파랑)를 지키며 같은 초록 색상(120°)에서 진하게 했다. 0.47.0 밝은 Y축은 X축과 밝기가 비슷해 적록 색맹 모의에서 거의 같은 색이었다
  (Machado 2009 모의 + CIEDE2000, 제2색맹 3.4). Y축을 X축보다 어둡게 두어 9.3으로 벌렸다(제1색맹 19.1 → 13.6, 제3색맹 59.2 → 58.6, 정상 61.1 → 60.6, Y·Z 정상 53.9 → 52.8).
  3:1을 겨우 넘기는 밝기(X축과 같은 밝기 — 3.25:1)는 제2색맹 차가 3.7로 떨어져 피했다. 알파는 Z축과 같은 0.85다
- 강조색: 어두운 테마(`#ffb44c`)와 같은 주황 계열을 지키며 노란 쪽(색상 39°)으로 진하게 했다. 정상 시각에서 측정색(`#c25e00`)·공구 표시색(`#e0602a`)과의 차가 0.47.0보다 크다(9.7 → 11.5, 11.9 → 18.4).
  비슷한 대비의 빨간 쪽 후보(`#c76a00` — 3.51:1)는 측정색과 4.3밖에 떨어지지 않아 노란 쪽을 골랐다
- 쓰이는 곳: Y축 = 바닥 격자 Y축 선·왼쪽 아래 좌표축의 Y 선과 글자·측정 축 붙잡기 안내 선(Y)·측정 성분 선(ΔY), 강조색 = 고른 그물의 물들임·고른 그물 윤곽선·고른 선분·점·
  `setHighlightSegments` 기본색·가상 커서 고르기 후보 표식
- 그 밖의 테마 색과 어두운 테마는 그대로다. 앱이 색을 덮는 길(테마 객체 `theme: { base: 'light', axisY, highlight }`, CSS 변수 `--v3d-axis-y`·`--v3d-highlight`)도 그대로다 — 0.47.0 색을 지키려면 그 길로 준다
- 대비 계산은 `contrastRatio`(입구), 색맹 모의와 CIEDE2000은 시험(`tests/v0480contrast.test.ts`) 안에만 있다

### 바뀐 기본 동작

- 밝은 테마 그림: Y축 색과 고른 것 강조색 자리만 진해진다(화소 회귀 — 아래). 앱의 밝은 테마 3D 그림 해시는 그 자리가 있는 그림만 바뀐다
- 카메라 움직임: `animate`를 주지 않으면 0.47.0과 같다(부드럽게, 움직임 질의를 듣지 않는다). 안에서는 카메라 함수의 기본 인자를 `this.opts.animate`에서 읽기 `animate`로 바꿨다(같은 값)

### 확인

- 시험: `tests/v0480motion.test.ts`(15개 — 순수 `normalizeAnimate`·`resolveAnimate`·`watchReducedMotion`(change 사건·옛 `addListener`·matchMedia 없음·던짐·null), 입구와 하위 경로(가져오는 모듈 없음),
  뷰어(가짜 DOM·matchMedia 흉내)에서 카메라를 날리는 길 열한 가지(뷰 큐브 위 면, 키 F·5·7, 가운데 단추 두 번, `fit`·`fitItems`·`setView`·`setViewDir`·`zoomToRect`·`flyTo`):
  주지 않으면 모두 부드럽게·움직임 질의 없음, `false`면 모두 바로·끝 자리는 부드럽게 간 것과 같음, `'auto'`가 연 뒤 줄이기 → 모두 바로 → 되돌리면 다시 부드럽게(질의는 한 번),
  처음부터 줄이기·옛 `addListener`, 옮기는 중 줄이기로 바뀌면 열한 길 모두 바로 옮긴 것과 같은 끝 자리, 인자가 이김, `setCamera`는 늘 바로·`flyTo` 끝 자리 = `setCamera`,
  `setAnimate`로 바꾸기·듣기 풀기·옮기는 중 끝 자리, `dispose`가 듣기를 푼다),
  `tests/v0480contrast.test.ts`(8개 — 0.47.0 밝은 Y축·강조색 2.52·2.81, 두 테마 축 셋·강조색 3:1 이상, 축 색 관례·강조색 주황 계열, 색맹 모의 X·Y 차(두 테마 8 넘음),
  강조색과 측정색·공구 표시색의 정상 시각 차, 바뀐 색은 밝은 테마 둘뿐, 뷰어가 새 색으로 그리고 테마 객체·CSS 변수 덮기가 이김). typecheck와 전체 시험(99파일 1,037개)이 통과한다
- 넓은 탐색(가짜 WebGL, 47차 머리 49b3375와 행 단위로 견줌): 37차 넓은 탐색 사본 275,836자리와 38차 모서리 꼴 3,600경우 871,200자리 행 파일이 바이트까지 같고 앱 호출도 같다
  (닫힌 3,640·열린 5,960번, load average 12~18)
- 비용(가짜 WebGL 그리기 포함, 400자리 × 세 번 — 둘째·셋째 판 가운데값 ms, base 49b3375·head를 번갈아 세 짝, load average 10~11). 바뀐 것이 카메라 함수의 기본 인자와 테마 색뿐이라 같은 값이다:

  | 장면 | 49b3375 마우스 미리 보기 | head 마우스 미리 보기 | 49b3375 `pick` | head `pick` | 49b3375 `pickCandidates` | head `pickCandidates` | 49b3375 고르기 모드 화살표 | head 고르기 모드 화살표 |
  |---|---:|---:|---:|---:|---:|---:|---:|---:|
  | 곧은 선 82개 격자 + 앱 점 20,000개 + `pointsFor` 셋 | 0.0514 · 0.0410 | 0.0534 · 0.0415 | 0.0064 · 0.0054 | 0.0062 · 0.0053 | 0.0073 · 0.0071 | 0.0073 · 0.0071 | 0.0316 · 0.0294 | 0.0315 · 0.0291 |
  | 상자 200개를 합친 그물 + 구간 단면 + 앱 점 20,000개 + `pointsFor` 둘 | 0.1171 · 0.1162 | 0.1170 · 0.1205 | 0.0105 · 0.0093 | 0.0111 · 0.0089 | 0.0200 · 0.0197 | 0.0199 · 0.0193 | 0.0918 · 0.0938 | 0.0929 · 0.0879 |

  `pointsFor` 호출·고른 종류·고르기 종류·후보 수는 49b3375와 head가 같다
- 화소·값 회귀(960 × 600, 판마다 두 번, Chrome 157 SwiftShader): `npm run pixels -- --base 49b3375`(47차 머리)로 장면 157개 가운데 148개와 값 116묶음 가운데 115개가 바이트까지 같다
  (555초 — head 153·133초, base 134·131초, load average 12~15).
  다른 장면 아홉은 모두 밝은 테마의 Y축이 보이는 장면이다 — `base-light-shaded` 617화소·`base-light-wire` 687·`base-wire-edgecolor-contrast` 687·`base-infer-parallel-light` 650·
  `base-measure-track-cross-light` 801·`base-measure-track-pair-light` 741·`off-light-shaded`·`off-light-wire`·`off-wire-edgecolor-contrast` 111(최대 차 35~36).
  다른 화소는 모두 0.47.0·0.48.0 두 그림에서 초록이 가장 큰 화소(Y축)이거나 그 2화소 안이고, 그 밖은 반투명 판 너머로 비치는 Y축 선(111화소)·청록 선과 겹친 Y축 화소 1개·
  좌표축 원점(1~2화소)이다(그림으로도 보았다).
  밝은 테마에서 강조를 쓰는 화소 장면은 없어 새 값 묶음 `theme-contrast-motion-values`(기존 `base` 자료를 다시 씀 — 새 장면 없음)로 그린 대비를 쟀다:

  | 테마 | 좌표축 X·Y·Z 화소 가장 큰 대비 | 고른 그물 윤곽선(강조색 화소 795개) 평균 대비 | 강조로 바뀐 주황 화소 가운데 3:1 이상 |
  |---|---|---:|---:|
  | 어두운(49b3375 = head) | 3.51·4.90·4.82 | 8.42 | 14,666 / 14,693 |
  | 밝은 49b3375 | 3.82·**2.76**·5.61 | **2.81** | 13,094 / 15,170 |
  | 밝은 head | 4.00·4.11·5.72 | 3.39 | 13,750 / 14,260 |

  (밝은 X·Z가 조금 바뀐 것은 좌표축 원점에서 Y 선과 겹친 화소다.) 같은 묶음의 움직임 값(head만): Chrome 헤드리스의 `prefers-reduced-motion`은 `false`, `'auto'`를 켜면 `animate` true,
  `flyTo`는 움직임으로 시작하고 `setAnimate(false)`가 끝 자리로 마친다. 실험으로 `src/theme.ts`의 두 색만 0.47.0으로 되돌린 작업 트리(커밋하지 않음)를 49b3375와 견주면
  장면 157개가 모두 바이트까지 같고 값은 이 묶음의 움직임 네 자리(49b3375에 API 없음)만 다르다 — 그림이 바뀐 까닭은 두 색뿐이다.
  `--base v0.33.0`으로는 0.33.0으로도 찍을 수 있는 장면 144개 가운데 128개·값 94묶음이 같고(0.47.0은 137개), 다른 장면은 위 밝은 테마 아홉(같은 화소 수)과 0.47.0의 `base-annotations` 2,234화소,
  0.42.0~0.47.0과 같은 화소 수의 `many-*` 여섯(105·38·100·105·275·105), 다른 값은 0.36.0이 바꾼 `hole-measure-normal` 3자리·0.47.0 `hidden-label-cycle-values`와 새 `theme-contrast-motion-values`다(551초)
- 화소 CI(`pixels.yml`)는 base와 값이 다른 장면·값이 있으면 실패하므로 이 PR에는 `pixels-changed` 라벨이 필요하다(의도한 변화 — 밝은 테마 Y축 장면 아홉과 새 값 묶음).
  새 장면이 없고 새 값 묶음 하나가 판마다 0.3초쯤이라 화소 CI 시간은 0.47.0과 거의 같다(약 11~12분)

### 남은 한계

- 강조색과 측정색은 둘 다 주황 계열이고 밝기도 가까워(3.39·3.93:1) 적록 색맹 모의 차가 0.47.0보다 작다(측정색과 제2색맹 9.0 → 3.0, 공구 표시색과 4.5 → 2.8 — 어두운 테마도 4.5·5.9).
  고른 것은 그물 물들임·윤곽선이고 측정은 선·점 표식·글상자라 모양으로도 갈린다. 주황 계열 안에서 3:1을 넘기며 측정색과 밝기로도 갈리는 자리는 없다(측정색을 함께 바꾸면 측정 그림이 모두 바뀐다 —
  이번에는 요청된 두 색만). 앱은 덮는 길로 다른 색을 쓸 수 있다
- 좌표축 글자 X·Y·Z(11 px 굵게)는 축 색 그대로라 글 대비 4.5:1(WCAG 1.4.3)에는 못 미친다(밝은 X 3.30·Y 3.91·Z 4.08, 어두운 X 3.09) — 좌표축을 그래픽(1.4.11 3:1)으로 보았다.
  격자 선(밝은 1.52·어두운 1.67:1)은 바탕 무늬라 그대로다
- 움직임 끝 알림은 없다(앱은 `onCameraChange`로 본다). 움직임 길이(0.32초)·곡선을 바꾸는 선택은 없다. 앱이 제 `requestAnimationFrame` 고리로 옮기는 카메라는 코어가 모른다
  (앱이 `flyTo`로 바꾸거나 읽기 `animate`가 false면 시간을 0으로 한다)

### 앱이 할 일

- 세 앱 공통: `new Viewer3d(host, { animate: 'auto' })`로 만들면 뷰 큐브·키 F·1~7·코어 맞춰 보기가 연 뒤 바꾼 OS 설정을 따른다(앱이 제 질의로 만들 때 한 번 정하던 길·새로 고침 안내는 뺀다).
  앱 설정에 움직임 켬·끔·시스템 따르기가 있으면 `setAnimate`. 앱이 제 고리로 카메라를 옮기는 곳(홈 보기·저장된 보기·장면 탭)은 `flyTo`로 바꾸거나, 그대로 두면
  시작할 때 `viewer.animate`가 false면 바로 옮긴다. 밝은 테마 3D 그림 해시는 Y축·강조색 자리가 있는 그림만 새로 뜬다
- STEP: 보기 도우미의 카메라 움직임 고리(같은 0.32초·같은 곡선)는 `flyTo(to)`와 같다 — 바꾸면 움직임 설정을 따른다. 링크로 연 보기 `setCamera`는 그대로 바로다
- SKP: 장면 탭 넘김처럼 끝난 뒤 부를 것이 있는 앱 고리는 `viewer.animate`가 false면 시간을 0으로 한다(코어 `flyTo`에는 끝 알림이 없다). 47차에 밝은 테마 Y축·강조색을 덮지 않았으므로
  코어만 올리면 두 색이 3:1을 넘는다
- NC: `animate: 'auto'`로 만든다(선반 보기 `setView('front', false)`·처음 맞춤 `fit(false)`은 인자 그대로 바로)
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.49.0: 카메라 움직임 끝 알림·길이(48차가 남긴 것 — SKP 장면 탭·STEP 보기 도우미)·밝은 테마 강조색의 색맹 구별·주변 가림(SKP 45차 요청)

카메라를 날리는 함수(`flyTo`·`fit`·`fitItems`·`setView`·`setViewDir`·`zoomToRect`)가 움직임이 끝났는지 알리는 `Promise<boolean>`을 돌려주고, `flyTo`는 움직임 길이(ms)를 고를 수 있다.
밝은 테마의 고른 것 강조색을 어둡게(`#b87700` → `#8a4500`) 해 측정색·공구 표시색과 적록 색맹에서도 갈리게 했다(**바뀐 기본 동작** — 밝은 테마의 고른 것 그림만).
켜면 면이 만나는 구석·틈을 어둡게 하는 주변 가림(화면 공간 SSAO — `setAmbientOcclusion`, 기본 꺼짐)을 더했다.
돌려준 값을 쓰지 않고 길이를 주지 않는 앱의 카메라 움직임과 주변 가림을 켜지 않은 그림, 그 밖의 값·앱 호출은 0.48.0과 같다(아래 "확인").

### 새 API

- `flyTo(camera, animate?, { duration? })` → `Promise<boolean>`. 셋째 인자(`FlyToOptions`)의 `duration`은 움직이는 길이(ms, 기본 `CAMERA_MOVE_MS` = 320 — 0.48.0 그대로)다.
  0 이하면 바로 옮기고, 유한한 수가 아니면 기본, `CAMERA_MOVE_MAX_MS`(60초)에서 자른다. 움직이지 않는 설정(`animate` false, `'auto'`에서 줄이기 선호)이면 길이와 상관없이 바로 옮긴다
- `fit`·`fitItems`·`setView`·`setViewDir`·`zoomToRect`도 같은 `Promise<boolean>`을 돌려준다(길이는 0.32초 그대로). 인자 순서·기본값은 0.48.0과 같아 돌려준 값을 쓰지 않아도 된다
- 순수(입구와 하위 경로 `opencad-viewer3d/motion`): `CAMERA_MOVE_MS`, `CAMERA_MOVE_MAX_MS`, `moveDuration(ms)`(길이 읽기), 타입 `FlyToOptions`
- `setAmbientOcclusion({ radius?, intensity? } | true | null)`·읽기 `ambientOcclusion`: 주변 가림(아래). 순수(입구와 `opencad-viewer3d/ao`): `aoParams`·`aoSize`·`AO_RADIUS_RATIO`(0.03)·
  `AO_SAMPLES`(12)·`AO_MAX_INTENSITY`(4)·`AO_MAX_PIXELS`(160), 타입 `AmbientOcclusionOptions`·`AoParams`

### 끝 알림 규칙

`true`는 "카메라가 끝 자리에 닿았다", `false`는 "닿기 전에 다른 길이 카메라를 가져갔다"이다. 실패(reject)하지 않는다.

| 일 | Promise | 카메라 |
|---|---|---|
| 끝까지 옮김 | 끝 자리를 그린 그림 뒤 `true`(그 그림의 `onCameraChange`가 먼저 알린다) | 끝 자리 |
| 움직이지 않음(`animate` false, `'auto'`에서 줄이기 선호, `duration` 0 이하) | 곧바로 `true`(다음 마이크로 작업) | 부른 그때 끝 자리 |
| 끌기·휠·굴림·시야각 같은 카메라 조작, `setAnimate(false)`·줄이기 선호로 바뀜, `zoomToRect`, 걷기로 바꾸기 | `true` | 0.48.0처럼 끝 자리로 마친 뒤 그 조작 |
| 다른 카메라 길(`flyTo`·`fit`·`setView`·뷰 큐브·키 F·1~7·가운데 단추 두 번)이 새로 시작 | 앞의 것은 `false`(같은 프레임에 두 번 불러도) | 새 움직임이 지금 자리에서 시작 |
| `setCamera`, 새 장면 맞춤(`keepView` 없는 `setScene`), 걷기 이동 | `false` | 그 길의 카메라 |
| 옮기는 중 `dispose` | `false` | — |
| `dispose` 뒤에 부름, `zoomToRect`가 무시하는 작은 사각형 | 곧바로 `false`(던지지 않는다) | 그대로 |

- 처리기에서 다음 `flyTo`를 불러도 된다(장면 차례 넘기기). 처리기는 끝 자리 그림을 다 그린 뒤(마이크로 작업)에 돈다
- 그림은 `requestAnimationFrame`으로 그리므로 탭이 숨은 동안(브라우저가 그림을 멈춘다)·그래픽 문맥을 잃은 동안은 풀리지 않는다. 돌아오면 끝 자리 그림 뒤 `true`, 그 사이 `dispose`면 `false`다

### 설계 근거

- Promise로: 앱이 `await`로 "닿으면 할 일"을 쓰고 끊긴 것(`false`)을 갈라 본다. Web Animations API의 `Animation.finished`처럼 끝을 Promise로 알리되,
  `finished`가 취소에서 `AbortError`로 실패하는 것과 달리 끊김을 값(`false`)으로 둬 앱이 `catch`를 달지 않아도 되게 했다
- "끝 자리에 닿았나"를 값으로: 끌기·휠은 0.48.0부터 옮기던 움직임을 끝 자리로 마친 뒤 시작하므로 닿은 것(`true`)이다 — SKP 장면 탭이 다 옮긴 뒤 2점 투시·도구 막대를 맞추는 일은
  카메라가 장면 자리에 닿았으면 해야 한다. 다른 길이 카메라를 가져가면 닿지 못한 것(`false`)이다
- 인자 순서 그대로: `animate` 다음 셋째 인자에 선택 객체(나중에 곡선 같은 선택을 더할 자리). `fit` 등에는 길이를 더하지 않았다 — 길이를 바꾸는 앱 고리(SKP 이전·다음 보기 0.28초,
  장면 전환 최대 4초, STEP 보기 도우미)는 모두 저장된 카메라라 `flyTo`로 간다
- 0.48.0과 같은 바이트: 길이를 주지 않으면 같은 0.32초·같은 곡선이고, 앞 움직임을 바꿀 때 그 Promise를 푸는 것만 더해졌다(카메라 차례는 시험으로 견줬다 — 아래)

### SKP 장면 탭 넘김을 코어 움직임으로 바꾸는 예

SKP `src/app/app.ts`의 앱 고리 `animateCamera(to, ms, done)`(`requestAnimationFrame` + `setCamera` — 이전·다음 보기 0.28초, 장면 전환 `min(초, 4)`초, 끝나거나 그만두면 `done`)를 이렇게 바꿀 수 있다:

```ts
private flight = 0;
private animateCamera(to: CameraState, ms = 320, done?: () => void): void {
  const v = this.viewer;
  if (!v) return;
  this.stopCameraAnim(); // 앞 움직임의 done을 먼저 부르고 비운다(지금과 같다 — cancelAnimationFrame만 빠진다)
  const id = ++this.flight;
  this.camAnimDone = done ?? null;
  void v.flyTo(to, undefined, { duration: ms }).then(() => {
    if (id !== this.flight) return; // 그 사이 새 움직임이 시작됨 — 앞의 done은 stopCameraAnim이 이미 불렀다
    this.camAnimDone = null;
    done?.(); // 끝 자리에 닿았으면 true, setCamera·새 장면이 가져갔으면 false(둘 다 지금처럼 done을 부른다)
  });
}
```

- 끊긴 앞 Promise는 다음 마이크로 작업에 `false`로 풀리므로 차례 번호(`flight`)로 지난 것을 거른다. "옮기는 중"(`this.camAnim`)은 `this.camAnimDone !== null`로 본다
- 움직임 줄이기(`calmQuery`)·`ms` 0 갈래는 코어가 맡는다(`'auto'`면 바로 옮기고 곧바로 `true`)
- 달라지는 것: 곡선이 코어 곡선(표준 뷰와 같은 2차 가속·감속 — SKP 고리는 3차 감속)이다. 옮기는 중 끌기·휠을 대면 0.48.0처럼 끝 자리로 마치고 그 조작이 이어진다
  (앱 고리는 다음 그림에서 사용자 조작을 덮어쓴다)
- STEP 보기 도우미(`motion.ts` `animateCamera(v, to, ms)` — 같은 0.32초·같은 곡선, 끝 알림을 쓰지 않음)는 `void v.flyTo(to, undefined, { duration: ms })` 한 줄이다

### 밝은 테마 고른 것 강조색(48차 남은 한계 — 적록 색맹)

- 0.48.0 강조색 `#b87700`(밝기 L\* 55.5)은 측정색 `#c25e00`(51.2)·공구 표시색 `#e0602a`(56.5)와 밝기가 같은 주황이라 적록 색맹 모의(Machado 2009 + CIEDE2000)에서 거의 같은 색이었다.
  주황 계열을 지키며(색상 39° → 30° — 어두운 테마 `#ffb44c`는 35°) 어둡게(`#8a4500` — L\* 37.2, 바탕과 6.57:1) 해 밝기로 갈랐다(바탕 위 색, 넷 = 정상·제1·제2·제3색맹):

  | 짝 | 0.48.0 `#b87700` | 0.49.0 `#8a4500` |
  |---|---|---|
  | 강조색 – 측정색 | 11.5 · 6.4 · **3.0** · 6.9 | 13.9 · 11.4 · 15.0 · 13.8 |
  | 강조색 – 공구 표시색 | 18.4 · 4.3 · **2.8** · 8.7 | 21.2 · 14.6 · 21.0 · 20.2 |
  | 강조색 – Y축 | 37.5 · **4.7** · 11.9 · 50.5 | 44.9 · 18.3 · 11.4 · 53.2 |
  | 강조색 – X축 | 30.0 · 17.4 · 11.7 · **6.9** | 27.9 · 20.3 · 21.5 · 19.5 |
  | 강조색 – 측정·공구 표시·축 셋·단면·추론 색의 가장 작은 차 | 2.8 | 11.4 |
  | 바탕 대비(WCAG 1.4.11 3:1) | 3.39 | 6.57 |

- 고른 길: 주황 계열(어두운 테마 `#ffb44c`와 같은 계열)에서 L\* 50~58이면 어느 색상이든 측정색·공구 표시색과 적록 차가 6을 넘지 못했다 — 밝기로 가르려면 L\* 38 아래여야 한다
  (`#904800` L\* 38.8은 10.2, 더 어두운 `#803e00`은 14.0이지만 갈색에 가까워 그 사이를 골랐다).
  파랑 계열(하늘색 `#0096db` 등)은 차가 50이 넘지만 NC의 첫 공구 색(파랑)·Z축·뷰 큐브 강조와 겹치고 어두운 테마와 계열이 달라졌다.
  측정색을 옮기는 길은 밝은 테마의 측정 장면이 모두 바뀌고 강조색–공구 표시색 짝(2.8)이 그대로라 고르지 않았다
- 물들인 그물(셰이더처럼 그물 색과 강조색을 반씩): 그대로인 그물과의 차(시각 넷 가운데 가장 작은 값)는 밝은 회색 21.2 → 22.9·나무 10.3 → 15.6·강철 28.7 → 27.4·
  어두운 회색 21.8 → 20.1로 모두 15를 넘는다.
  나무색 그물을 물들인 위에 그린 측정 선은 제2색맹 11.1 → 7.4로 줄었다(밝기가 가까워짐 — 측정 선은 끝점 표식·글상자로도 보인다)
- 표·후보 찾기는 시험(`tests/v0490contrast.test.ts` — 색맹 모의·CIEDE2000은 `tests/cvd.ts`)에 같은 값으로 있다

### 주변 가림(SKP 45차 요청 — 기본 꺼짐)

- `setAmbientOcclusion({})`(또는 `true`)로 켜면 음영 계열 모드(음영·음영+윤곽·단색·무늬 없음)에서 불투명 면을 그린 뒤 면이 만나는 구석·틈·물체가 놓인 바닥을 어둡게 한다.
  `radius`는 가림을 보는 거리(세계 단위, 기본 보이는 범위 대각선의 3%), `intensity`는 세기(기본 1, 0~4 — 0이면 끈 것). `null`·`false`면 끈다.
  선·점·격자·측정 덧그림·반투명 면은 가리지 않는다(그 뒤에 그린다). 와이어프레임·X-ray·숨은 선 모드에서는 하지 않는다. 그림 저장(`renderImage`·`snapshot`)도 같다
- 길(셰이더 `AO_FS`·`AO_BLUR_FS`·`AO_MIX_FS`):
  1. 깊이 — 외곽선과 같은 맨 앞 불투명 깊이 그림(장치 화소)에 불투명 그물을 그린다. 외곽선을 켰으면 그 깊이 그림을 함께 써 한 번만 그린다
  2. 가림 — 반 해상도에서 화소마다 깊이 그림 화소 가운데로 눈 공간 자리를 다시 세우고(역투영 — 원근·평행·렌즈 이동), 법선은 이웃 깊이 둘 가운데 가까운 쪽으로 세운다.
     원반 위 나선 표본 12개가 법선 쪽으로 솟아 있으면 그 코사인 × 거리 감쇠를 더한다(가림 거리 밖 표본은 세지 않아 앞 물체 둘레에 띠가 생기지 않는다)
  3. 흐림 — 가로·세로 9칸, 눈 깊이 차가 가림 거리보다 큰 이웃(다른 물체·바탕)은 섞지 않는다
  4. 곱하기 — 장치 화소 그림에 곱한다. 깊이를 깊이 그림 값으로 두고 그림 깊이와 견주므로 깊이 그림에 없는 면(단면의 잘린 면 채우기)에는 곱하지 않는다. 알파는 그대로
- 화소 가운데로 다시 세우는 까닭: 처음 판은 화소 안의 자리로 역투영해 기운 바닥·벽에 화면 가로 줄무늬가 생겼다(가장 가까운 화소의 깊이를 다른 자리에 붙여 생긴 어긋남)
- 실제 Chrome(SwiftShader, `secrange` 자료 — 판 위 상자 둘, 960 × 600): 기본 세기로 20,657화소가 어두워지고(밝아진 화소·바탕 화소·알파 0) 밝기 비는 평균 0.876·가장 어두운 구석 0.446,
  세기 2는 25,559화소·0.823·0.155. 두 테마가 같은 꼴이고, 다시 끄면 처음 그림과 바이트까지 같다
- 비용(`npm run bench:many -- --variants head --modes shadedEdges,shadedEdges+ao,shadedEdges+profiles,shadedEdges+profiles+ao,shaded,shaded+ao --backend both`,
  정의 12 × 자리 3,000 — 삼각형 182만, 960 × 600, 판마다 2번 × 10장, GPU 마침까지 가운데값 ms, load average 15~25):

  | 모드 | Apple M1 Pro GPU 끔 | 켬 | SwiftShader 끔 | 켬 |
  |---|---:|---:|---:|---:|
  | 음영+윤곽 | 7.1 | 10.0 | 1,096 | 1,307 |
  | 음영+윤곽 + 외곽선(깊이 그림을 함께 씀) | 10.9 | 11.1 | 1,283 | 1,478 |
  | 음영 | 6.0 | 8.9 | 865 | 1,202 |

  외곽선과 함께 쓰면 늘어난 것은 화면 단계뿐이라 0.2 ms(반 해상도 가림·흐림 둘·곱하기 — 960 × 600)이고, 외곽선 없이는 불투명 깊이를 한 번 더 그리는 몫(이 장면 약 2.7 ms)이 더해진다.
  그리기 호출은 넷 늘고(깊이 그리기는 세지 않는다) GL 호출은 350 → 530이다.
  휴대폰 어림: 화면 단계는 화소 수에 비례해 390 × 844 CSS·화소 비 2(장치 화소 1.32 M — 960 × 600의 2.3배)면 M1 Pro에서 약 0.5 ms, 휴대폰 GPU를 그 1/3~1/5로 보면 1.5~2.5 ms다.
  깊이 몫은 삼각형 수에 비례해 이 182만 삼각형 장면이면 휴대폰에서 10 ms 안팎이다(같은 장면의 끈 그림이 이미 20~35 ms) — 큰 장면을 휴대폰에서 돌릴 때는 외곽선과 함께 켜거나 끈다
- 넣은 까닭: 선택(기본 꺼짐)이라 켜지 않은 앱·그림은 GL 호출까지 0.48.0과 같고, 외곽선을 쓰는 앱(음영+윤곽 기본)에는 화면 단계 몫만 더해진다.
  SketchUp 모형처럼 같은 색 면이 많은 장면에서 벽과 바닥이 만나는 자리·물체가 놓인 자리가 드러난다(SKP 45차 요청)

### 바뀐 기본 동작

- 밝은 테마 그림: 고른 것 강조색 자리(고른 그물 물들임·고른 그물 윤곽선·고른 선분·점·`setHighlightSegments` 기본색·가상 커서 고르기 후보 표식)가 어두워진다.
  0.48.0 색을 지키려면 `theme: { base: 'light', highlight: '#b87700' }` 또는 CSS 변수 `--v3d-highlight`
- 카메라 함수가 `void` 대신 `Promise<boolean>`을 돌려준다(값을 쓰지 않으면 0.48.0과 같다). `fit` 등의 Promise는 돌려줄 때 늘 만든다(풀리지 않은 채 남는 것은 옮기는 중인 하나뿐)
- 주변 가림은 기본 꺼짐이라 바뀐 그림이 없다(끄면 그리기 상태에 그 필드가 없고 GL 호출이 0.48.0과 같다)

### 확인

- 시험: `tests/v0490motion.test.ts`(16개 — 순수 `moveDuration`과 입구, 가짜 DOM 뷰어에서 끝 자리 그림 뒤 `true`(그 전에는 기다리고 `onCameraChange`가 먼저),
  움직이지 않음 넷(`animate: false`·인자 false·길이 0·음수)·`'auto'` 줄이기는 그림 없이 `true`, 같은 프레임 두 번 부름(앞 `false`)·처리기 안에서 다음 장면,
  다른 길 여섯(`fit`·`setView`·키 F → `false`, `setCamera` → `false`·그 카메라, 새 장면 맞춤 → `false`, `keepView` → 이어서 `true`), 끝 자리로 마치는 다섯(끌기·휠·굴림·`setAnimate(false)`·줄이기 선호) → `true`,
  걷기 이동 → `false`, `dispose` 중·뒤·처리기 안 부름 → `false`(던지지 않음), 길이 1,000ms(반에서 곡선 반)·60초 자름, 주지 않으면 0.48.0과 같은 카메라 차례(11 시각),
  `fit`·`fitItems`·`setView`·`setViewDir`·`zoomToRect`의 같은 Promise와 무시한 사각형 `false`),
  `tests/v0490contrast.test.ts`(7개 — 위 표와 바뀐 색 하나, 물들인 그물, 뷰어가 새 색으로 그리고 theme 객체로 0.48.0 색). 0.48.0 대비 시험은 0.48.0 색을 덮어 그대로 확인한다.
  `tests/v0490ao.test.ts`(9개 — 순수 `aoParams`·`aoSize`·셰이더 상수, 가짜 WebGL에서 끄면(기본·켰다 끈 뒤·`false`·세기 0) 그리기 기록이 켜 본 적 없는 뷰어와 같고,
  켜면 불투명 그물 깊이와 화면 전체 넷이 불투명 면 뒤·반투명 면과 선 앞에 더해지며 나머지 차례는 같음, 가림 단계 균일 변수(기본 거리·세기·평행·숨겨 바뀐 범위),
  음영 계열만, 반투명 그물만이면 없음, 외곽선과 깊이를 함께 써 다시 그리지 않음, 그림 저장도 가림·dispose 뒤 던지지 않음).
  typecheck와 전체 시험(102파일 1,069개)이 통과한다
- 넓은 탐색(가짜 WebGL, 48차 머리 2619d86과 행 단위로 견줌): 37차 넓은 탐색 사본 275,836자리와 38차 모서리 꼴 3,600경우 871,200자리 행 파일이 바이트까지 같고 앱 호출도 같다(닫힌 3,640·열린 5,960번).
  과제 1·2 뒤(6716384)와 주변 가림을 넣은 뒤(c13a29e) 두 번 같다
- 비용(가짜 WebGL 그리기 포함, 400자리 × 세 번 — 둘째·셋째 판 가운데값 ms, base 2619d86·head를 번갈아 세 짝, load average 2.3~2.6). 고르기·미리 보기 길은 바뀌지 않아 같은 값이다:

  | 장면 | 2619d86 마우스 미리 보기 | head 마우스 미리 보기 | 2619d86 `pick` | head `pick` | 2619d86 `pickCandidates` | head `pickCandidates` | 2619d86 고르기 모드 화살표 | head 고르기 모드 화살표 |
  |---|---:|---:|---:|---:|---:|---:|---:|---:|
  | 곧은 선 82개 격자 + 앱 점 20,000개 + `pointsFor` 셋 | 0.0490 · 0.0386 | 0.0491 · 0.0398 | 0.0060 · 0.0050 | 0.0061 · 0.0050 | 0.0069 · 0.0068 | 0.0070 · 0.0071 | 0.0293 · 0.0294 | 0.0297 · 0.0290 |
  | 상자 200개를 합친 그물 + 구간 단면 + 앱 점 20,000개 + `pointsFor` 둘 | 0.1120 · 0.1044 | 0.1138 · 0.1079 | 0.0101 · 0.0089 | 0.0103 · 0.0092 | 0.0196 · 0.0204 | 0.0212 · 0.0236 | 0.0866 · 0.0863 | 0.0943 · 0.0853 |

  `pointsFor` 호출·고른 종류·고르기 종류·후보 수는 2619d86과 head가 같다. 주변 가림을 넣은 뒤(c13a29e, load average 11~12)에도 같은 값이다
  (미리 보기 0.0498·0.0403 → 0.0498·0.0402, 0.1163·0.1117 → 0.1151·0.1155)
- 화소·값 회귀(960 × 600, 판마다 두 번, Chrome 157 SwiftShader): `npm run pixels -- --base 2619d86`(48차 머리)로 장면 157개가 모두, 이전 값 116묶음 가운데 115개가 바이트까지 같다
  (576초 — head 165·132초, base 159·116초, load average 12~17. 과제 1·2만 넣은 판도 같은 결과 — 482초).
  새 값 묶음 `ao-flyto-end-values`는 base에 API가 없어 head만 찍는다(위 주변 가림 값과 실제 Chrome 끝 알림 `[false, true]`·0.15초 지남·끝 자리·`fit(false)` `true`).
  다른 것은 0.48.0 묶음 `theme-contrast-motion-values`의 밝은 테마 줄 하나다(어두운 줄·움직임 값은 같다 — 밝은 테마에서 강조를 쓰는 화소 장면은 없다):

  | 밝은 테마 `상자` 강조 | 2619d86 | head |
  |---|---:|---:|
  | 강조로 바뀐 화소 가운데 주황 쪽 | 14,260 | 14,262 |
  | 그 가운데 바탕과 3:1 이상 | 13,750 | 13,988 |
  | 가장 큰 대비 | 5.19 | 6.92 |
  | 그 판 강조색 화소(고른 그물 윤곽선) 수 · 평균 대비 | 795 · 3.39 | 827 · 6.57 |

  `--base v0.33.0`으로는 장면 157개 가운데 128개(0.48.0과 같음)·값 94묶음이 같고, 다른 장면은 0.48.0과 같은 열여섯(밝은 테마 Y축 아홉·`base-annotations` 2,234화소·`many-*` 여섯 —
  화소 수도 같음), 다른 값은 `hole-measure-normal`·`hidden-label-cycle-values`·`theme-contrast-motion-values`(0.33.0에는 움직임 API가 없음)다(413초)
- 화소 CI(`pixels.yml`)는 base와 값이 다르거나 새 값 묶음이 있으면 실패하므로 이 PR에는 `pixels-changed` 라벨이 필요하다(의도한 변화 — 밝은 테마 강조 값 한 줄과 새 묶음).
  새 장면이 없고 새 값 묶음 하나가 head 판마다 5초쯤(그림 저장 스물여섯 장·끝 알림 0.3초 — 이 기계 SwiftShader)이라 화소 CI 시간은 0.48.0과 거의 같다(약 11~12분, 두 번 찍어 10초 남짓 늚)

### 남은 한계

- 움직임 곡선은 하나(2차 가속·감속)다. 코어 자신의 길(뷰 큐브·키·`fit` 등)의 길이는 0.32초 그대로다(설정 없음)
- 탭이 숨은 동안·문맥을 잃은 동안은 끝 알림이 풀리지 않는다(위 규칙)
- 어두운 테마의 강조색(`#ffb44c`)과 측정색(`#ffd24c`)·공구 표시색(`#ff8a3d`)도 적록 차가 4.5·5.9로 작다(바탕이 어두워 L\* 69~86에 셋이 몰려 있다 — 이번에는 48차가 짚은 밝은 테마만).
  밝은 테마 측정색과 공구 표시색끼리도 9.4 · 4.2 · 5.5 · 6.0으로 가깝다(둘이 한 그림에 함께 나오는 것은 NC 재생 중 측정뿐)
- 주변 가림은 화면 공간이라 화면에 보이는 맨 앞 불투명 면만 본다 — 화면 밖·앞 물체에 가린 것이 드리우는 가림은 없고, 반투명 면은 가리지도 가려지지도 않는다.
  법선을 깊이에서 세우므로 아주 얇은 물체·화소보다 작은 틈은 잡지 못하고, 표본 12개를 흐려 가장 어두운 구석이 부드럽다. 끌어 돌리는 동안에도 같은 비용이다(움직이는 동안 끄는 길 없음).
  거리는 세계 단위 하나라 아주 큰 장면과 작은 부품이 섞이면 한쪽에 맞춰 준다. 둘레 빛(IBL)·HDR 환경 배경·반사(SKP 45차 요청의 나머지)는 없다

### 앱이 할 일

- 세 앱 공통: 밝은 테마 3D 그림 해시 가운데 고른 것이 있는 그림만 새로 뜬다. 앱이 제 고리로 카메라를 옮기는 곳은 `flyTo`로 바꿀 수 있다(아래)
- SKP: 장면 탭 넘김·이전·다음 보기·고른 것 맞춰 보기의 `animateCamera` 고리를 위 예처럼 `flyTo(to, undefined, { duration })`로 바꾸면 움직임 줄이기 갈래(`calmQuery`)와
  `requestAnimationFrame` 고리를 뺄 수 있다. 장면 재생(슬라이드 쇼)은 지금처럼 전환 + 지연 시간 타이머로 둬도 되고, `await flyTo(...)` 뒤 지연 시간을 기다리게 바꿔도 된다.
  보기 설정에 "주변 가림" 켬·끔을 두고 `setAmbientOcclusion({})`(45차 요청 — 기본은 끔, 휴대폰의 큰 모형은 외곽선과 함께 켜거나 끄게)
- STEP: 보기 도우미 `animateCamera(v, to, ms)`를 `v.flyTo(to, undefined, { duration: ms })`로 — 앱의 `reducedMotion()` 갈래는 뷰어를 `animate: 'auto'`로 만들면 코어가 맡는다.
  조립품 틈을 읽기 쉽게 하려면 보기 설정에 주변 가림(`setAmbientOcclusion({})`)을 둘 수 있다
- NC: 할 일 없음(공구 표시색·측정색은 그대로, 밝은 테마에서 고른 공구 경로 선분 색만 어두워진다. 공구 경로는 선이라 주변 가림이 없다 — 소재 깎기 그물에는 쓸 수 있다)
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.50.0: 깨진 장면 입력을 빼거나 고쳐 그리고 알림(코어 입력 퍼징)·주변 가림을 움직이는 동안 끄기·숨은 탭의 끝 알림·BVH 일 줄(STEP 58차)

STEP 57차가 해석기 퍼징으로 깨진 파일에서 NaN·무한대·아주 큰 좌표, 범위 밖 색인, 길이가 맞지 않는 배열이 나올 수 있음을 보였다. 코어가 그런 장면을 받았을 때를 씨앗 고정 퍼징으로
두드려(가짜 WebGL 8,002경우 + 실제 Chrome WebGL2 24가지) 찾은 결함을 고쳤다 — 깨진 부분만 빼거나 고쳐 그리고, 무엇을 했는지 알림(`sceneIssues`·`onSceneIssues`)으로 앱에 알린다.
멀쩡한 장면은 받은 객체·배열을 그대로 쓰고 그림·값·앱 호출이 0.49.0과 같다(아래 "확인").
함께: 주변 가림을 카메라를 옮기는 동안 끄거나 ¼ 해상도로 셈하는 선택(기본 0.49.0 그대로), 탭이 숨었거나 문맥을 잃은 동안 카메라 움직임 끝 알림이 풀리지 않던 것(49차 남은 한계),
부품 자리가 아주 많은 장면을 연 뒤 BVH 일 줄이 O(n²)이던 것(STEP 58차 — 부품 자리 8만에서 CPU 1.9초).

### 새 API

- 읽기 `sceneIssues`(`readonly SceneIssue[]` — 지금 장면의 입력 알림, 멀쩡하면 빈 배열)와 `onSceneIssues(cb)`(→ 그만 듣는 함수): `setScene`·`setMesh`가 깨진 값을 찾으면
  그 호출이 끝나기 전에 그 호출이 찾은 알림으로 부른다. `setMesh`는 그 그물 것만 바꾸고 `removeMesh`는 그 그물 것을 뺀다(`clear`·`dispose`면 빈 배열)
- 순수(입구와 하위 경로 `opencad-viewer3d/sceneissues` — DOM·WebGL 없이 워커에서도): `checkScene(scene)` → `{ scene, issues }`(뷰어가 쓰는 그 검사 — 그릴 장면과 알림),
  `sceneIssueText(issue, messages?)`(한국어 기본 글, `{id}`·`{field}`·`{count}` 자리 — 앱이 code별 글을 준다), `SCENE_ISSUE_MESSAGES`, `COORD_LIMIT`(1e15),
  타입 `SceneIssue`·`SceneIssueCode`·`SceneIssueAction`·`SceneCheck`
- `setAmbientOcclusion({ moving })`: `'keep'`(기본)·`'off'`·`'low'`(아래). 순수 `aoParams(o, diagonal, moving?)`·`aoSize(w, h, div?)`·`AO_LOW_DIV`(4), 타입 `AoMoving`

### 퍼징

- 생성기(`tests/fuzzscene.ts`): 씨앗마다 멀쩡한 장면(상자·삼각형 무리·선분·점 1~6묶음)을 만들고 묶음 하나~셋에 깨진 값 하나~둘 —
  그물 37가지(좌표 NaN·±Infinity·1e38·3.4e38·모두 NaN, 길이 3의 배수 아님·빈 배열, 범위 밖·0xffffffff·길이 안 맞는 색인, 법선 0·NaN·짧음·Int8 길이, 정점 색 짧음·NaN·범위 밖,
  color NaN·알파 NaN·셋, 뒷면 색 NaN, 윤곽선 길이·NaN, 무늬 좌표 길이·NaN, 행렬 NaN·0·열둘·무한·1e30배, 원점 NaN·1e38·둘, 마주 보기 원점 NaN, 열린 그물에 `closed`, 한 점으로 뭉갠 그물, 같은 id),
  선분 11가지, 점 9가지, 장면 5가지(`bounds` NaN·뒤집힘·무한·1e38, 빈 장면), 큰 그물(정점 100만·200만에 깨진 좌표·색인 여덟씩)
- 경우마다 가짜 DOM·WebGL 뷰어에 `setScene` → 그리기 → BVH → `fit`·`setView` → `pick`(9자리)·`pickCandidates` → 마우스 미리 보기 → 측정(앱 붙잡기 점 NaN·1e38 포함)·후보 →
  키(F·1·7·화살표) → 궤도·휠·끌기 → 단면·구간 단면 → 구간 숨김·강조(범위 밖) → 선분 그리기 범위 → 강조 → 묶음 행렬·색 → 최근접점 → 덧그림(NaN·1e38) → 마커 → `project` →
  `zoomToRect` → 주변 가림 → 모드 넷 → `fitItems` → `setMesh`·`removeMesh` → 나눠 올리기 → `dispose`를 차례로 부르고,
  잡히지 않은 예외(함수·메시지·src 첫 자리로 묶음), 가짜 WebGL 그리기 검사(색인 버퍼 밖, 정점·인스턴스 버퍼 밖 색인·개수, 0xffffffff), 유한하지 않은 균일 변수(행렬·색·굵기·크기),
  카메라·장면 범위 NaN, 고른 점·측정 결과가 유한하지 않거나 1e15 넘음, 한 경우 3초 넘음을 원인별로 센다
- 0.49.0(594e10e): 종류 하나씩 3,000경우에 원인 37가지(예: 유한하지 않은 `u_mvp` 88,401번 — 경우당 가운데값 5 ms·가장 긴 경우 2.6초), 섞은 5,000경우에 45가지·3초 넘는 경우 4.
  0.50.0: 같은 8,000경우 + 큰 그물 둘에 0(경우당 가운데값 4 ms, 가장 긴 경우 39 ms)
- 실제 Chrome(SwiftShader WebGL2): 값 묶음 `input-fuzz-values`(기존 `secrange` 자료 — 판재 그물·기준선 사본에 깨진 값, 또는 판 옆 깨진 상자) 24가지.
  **GL 오류는 0.49.0도 하나도 없다** — WebGL2는 정점 버퍼 밖 색인을 오류 없이 0이나 버퍼 안 값으로 읽는다(강건 접근). 그래서 결함은 예외·그림으로 드러난다(아래 표)

### 찾은 결함과 고침

| 원인 | 깨진 값(재현) | 0.49.0 | 0.50.0 |
|---|---|---|---|
| 아주 큰 좌표가 장면 범위를 키움 | 정점·선분·점 하나 1e38, 행렬 1e30배, 원점 1e38, `bounds` ±1e38 | 카메라 맞춤·자르기 면이 float32로 넘쳐 화면 전체가 빔(Chrome 바탕 아닌 화소 141,356 → 354) | 좌표 한도 `COORD_LIMIT`(1e15) 밖·NaN·무한대 정점은 범위에서 빼고 그 정점을 쓰는 도형은 그리지 않는다(140,029). 항목 상자 구석을 한도 밖으로 옮기는 원점·행렬이면 그 항목을 뺀다(0 — 깨끗한 그림과 같음) |
| 무한 `Scene3d.bounds` | `{ min: [-Infinity, …], max: [Infinity, …] }` | `setScene`이 `RangeError`(격자 선분을 끝없이 쌓다 — 2.5~4.8초 걸린 뒤), 카메라 NaN | 유한·한도 안·min ≤ max인 `bounds`만 쓰고 아니면 그물에서 다시 센다(빈 상자·뒤집힌 상자는 0.49.0도 다시 셌다), 격자 칸 수 한도 `GRID_MAX_LINES` |
| 색인 0xffffffff(−1을 Uint32로) | 삼각형 하나의 색인 | WebGL2는 0xffffffff를 늘 "도형 다시 시작"으로 읽어 뒤 삼각형이 모두 어긋남(60,158화소) | 정점 수 밖 색인이 든 삼각형을 넓이 0(멀쩡한 정점 하나를 세 번)으로 바꾼 색인 사본을 올린다(0화소 — 그 삼각형만 빠짐) |
| 정점 수 밖 색인 | 색인 하나 nv + 5, positions 정점 하나 모자람 | 강건 접근이 읽은 엉뚱한 정점으로 그림(8,495화소) | 그 삼각형만 그리지 않는다(5,537 — 빠진 삼각형 자리) |
| 놓을 자리를 모름 | 원점 NaN·둘, 행렬 NaN·열둘·무한 | 균일 변수 NaN으로 소리 없이 사라짐, 고르기·단면 평면 NaN | 그 항목을 빼고(그리기·고르기·범위·`viewer.scene`) `placement` 알림 |
| 유한하지 않은 색 | `color` NaN, `backColor` NaN, 정점 색 NaN | 검게(바탕 아닌 화소 평균 휘도 0.010) | 기본 회색(0.187 — `[0.7, 0.7, 0.7, 1]`), 뒷면 색·정점 색은 쓰지 않는다. `color`가 셋이면 알파 1 |
| 유한하지 않은 굵기·크기 | 선 `width`·점 `size` NaN·무한 | 균일 변수 NaN(선은 1화소, 점은 사라짐) | 1·4 |
| 같은 id 둘 + 구간 그리기 | 그물·선분이 같은 id, 그 id에 구간 단면·숨김 | 다른 항목의 기본 도형 수로 정한 구간이 색인 버퍼 밖을 그림(가짜 WebGL 검사 — WebGL 명세는 색인 버퍼 밖 그리기를 `INVALID_OPERATION`으로 버린다) | 구간을 그 항목의 기본 도형 수로 자른다. `duplicate-id` 알림(둘 다 그린다 — id로 찾는 기능은 0.49.0처럼 한 항목) |
| 그리지 않는 도형을 고름 | 끝점 1e38 선분·점, 범위 밖 색인 삼각형 | `pick`·후보·측정이 1e38 자리를 돌려줌 | BVH가 깨진 기본 도형을 빼고 만든다(`Bvh.prims` = 배열의 도형 수), 나무 없이 훑는 단면 교선도 건너뛴다. 앱 붙잡기 점도 한도 밖은 건너뛴다(NaN은 0.8.0부터) |
| API 인자 | `setMarker([NaN, 0, 0])`, `setItemColor(id, [NaN, …])` | NaN 행렬 마커, 검은 묶음 | `null`과 같다(마커 없음·색 되돌림) |

- 정점 NaN·무한대(`pos-nan`·`pos-inf`)는 0.49.0도 GPU가 그 삼각형을 버려 그림이 같다(7,712·8,794화소 — 그 정점을 쓰는 삼각형 자리). 0.50.0은 같은 그림에 `positions` 알림을 더하고, 범위·고르기에서도 뺀다
- 법선 0·NaN은 실제 Chrome에서 그림이 같아(셰이더가 면 법선으로 메운다) 고치지 않았다(알림도 없음)
- 고친 배열은 사본이다: 정점 수 밖 색인·깨진 정점이 있는 그물은 색인 사본(`triangleFix` — 색인 없는 그물은 0, 1, 2… 사본으로 그린다), 깨진 끝점 선분은 그 선분 여섯 값을 NaN으로 바꾼 사본
  (`segmentFix` — WebGL은 NaN 꼭짓점 도형을 그리지 않는다, 0.49.0도 NaN 선분은 그리지 않았다). 삼각형·선분 번호는 그대로라 구간·고르기 번호가 바뀌지 않는다.
  멀쩡한 배열은 새로 만들지 않는다(배열마다 한 번 훑고 기억 — 정점은 범위 계산과 같은 훑기, 색인은 가장 큰 값 한 번)
- 필드를 고친 항목(색·굵기·크기·재질 값·정점 색)은 배열을 함께 쓰는 얕은 사본이라, 그 장면에 `release`(0.25.0 놓기)를 주면 코어는 사본에서 배열을 지우고 앱이 준 객체에는 남는다(그 항목만)

### 알림(`SceneIssue`)

`{ code, action, kind, id?, field?, count }` — `kind`는 `'mesh'`·`'line'`·`'point'`·`'scene'`, `count`는 깨진 정점·삼각형·선분·값 수, `action`은 코어가 한 일이다.

| code | 무엇 | action |
|---|---|---|
| `placement` | `origin`·`matrix`가 유한한 수 셋·열여섯이 아니거나 항목을 한도 밖으로 옮김, `positions` 없음 | `skipped`(그 항목을 빼고 그림) |
| `positions` | 정점 좌표 NaN·무한대·\|값\| > 1e15(`field`: `positions`·`edges`) | `fixed`(범위에서 빼고 그 정점 도형을 그리지 않음) |
| `indices` | 정점 수 밖 색인(0xffffffff 포함)이 든 삼각형 | `fixed`(그 삼각형을 그리지 않음) |
| `color` | `color`·`backColor`가 유한한 0 이상 수 셋·넷이 아님 | `fixed`(기본색) — 뒷면 색은 `ignored` |
| `colors` | 정점 색이 모자라거나 유한하지 않은 값 | `ignored`(한 색으로) |
| `width`·`size` | 선 굵기·점 크기가 유한하지 않음 | `fixed`(1·4) |
| `material` | `roughness`·`metallic`·`normalScale`·`uvTransform`·`backUvTransform` 유한하지 않음 | `ignored`(기본값) |
| `billboard` | `billboard.origin` 유한하지 않음 | `ignored`(마주 보기 없이 — 0.49.0과 같은 그림) |
| `length` | `positions`·`indices`·`edges` 길이가 3·3·6의 배수 아님 | `ignored`(남는 값 — 0.49.0과 같은 그림) |
| `normals`·`uvs` | 길이가 정점 수와 맞지 않음 | `ignored`(평면 음영·무늬 없음 — 0.49.0과 같은 그림) |
| `ids` | `segmentIds`·`pointIds`가 선분·점 수보다 짧음 | `kept`(뒤쪽은 배열 안 번호 — 0.49.0과 같음) |
| `duplicate-id` | 같은 id가 또 있음 | `kept` |
| `bounds` | `Scene3d.bounds`가 NaN·무한대·한도 밖·짧음 | `ignored`(그물에서 다시 셈) |

```ts
viewer.onSceneIssues((list) => {
  for (const i of list) warnings.push(sceneIssueText(i, myMessages)); // 앱 경고 목록(Scene3d.warnings 옆)에
});
viewer.setScene(scene); // 깨진 값이 있으면 위 처리기가 setScene 안에서 불린다 — viewer.sceneIssues로 읽어도 된다
```

### 주변 가림을 카메라를 옮기는 동안(49차가 남긴 것)

- `setAmbientOcclusion({ moving: 'off' })`: 끌기·휠·손가락 몸짓·`flyTo`·`fit` 등 카메라 움직임 동안 가림을 그리지 않는다 — 불투명 깊이 그리기와 화면 넷이 모두 빠져 그 그림은
  가림을 끈 뷰어와 그리기 기록이 같고, 멈춘 첫 그림(손을 뗀 그림·휠 0.16초 뒤·움직임 끝 자리)부터 다시 그린다. 가림 그림은 놓지 않아 다시 만들지 않는다
- `{ moving: 'low' }`: 움직이는 동안 가림 단계를 ¼ 해상도 그림(반 해상도 그림과 따로 둔다)에 셈한다. 흐림·곱하기는 같고 깊이 그리기는 남는다
- 기본 `'keep'`(또는 주지 않음)은 0.49.0과 같은 그리기다. 걷기 이동은 움직임으로 보지 않는다(걷기는 키를 누르는 동안 계속 움직인다)
- 비용(`npm run bench:many -- --variants head --modes …+ao,…+aolow`, 960 × 600, GPU 마침까지 가운데값 ms — `+aolow`는 'low'를 켜고 움직이는 중으로 둔 그림. load average 11~18):

  | 장면 · 모드 | M1 Pro 끔 | 켬 | 켬 'low' 움직이는 중 | SwiftShader 끔 | 켬 | 켬 'low' 움직이는 중 |
  |---|---:|---:|---:|---:|---:|---:|
  | 정의 12 × 자리 3,000(삼각형 182만) 음영+윤곽 | 7.4 | 10.5 | 11.3 | 1,199 | 1,714 | 1,523 |
  | 같은 장면 음영 | 5.9 | 8.9 | 8.6 | 878 | 1,208 | 1,572 |
  | 자리 300(삼각형 18.2만) 음영+윤곽+외곽선(깊이 그림을 함께 씀) | 5.1 | 5.0 | 4.9 | 314 | 417 | 366 |
  | 같은 장면 음영 | 3.0 | 4.0 | 4.0 | 241 | 319 | 247 |

  'off'는 움직이는 동안 그 그림이 가림을 끈 그림과 같다(위 "끔" 열). 'low'는 화면 단계(가림 표본)만 ¼로 줄여 화면 단계가 비싼 SwiftShader 작은 장면에서 가림 몫이
  103 → 52 ms(외곽선과 함께)·77 → 6 ms로 줄고, 깊이 그리기가 큰 장면·GPU에서는 차이가 잴 수 있는 만큼 나지 않는다(M1 Pro 960 × 600 화면 단계는 0.2 ms 남짓 —
  기계 부하 load average 11~23이라 판마다 흔들림이 크다: 최소~최대는 `.runtime` 요약에). 큰 장면을 끌 때는 'off', 고해상도 휴대폰 화면처럼 화소가 많은 곳은 'low'가 맞다
- 품질(실제 Chrome, `secrange` 자료 — 판 위 상자 둘, 960 × 600, 값 묶음 `input-fuzz-values` 끝 줄): 멈춘 그림은 가림으로 20,657화소가 바뀌고 밝기 비 평균 0.876이다.
  움직이는 중 'keep'은 그와 같고(0화소 다름), 'off'는 끈 그림과 같고(20,657화소가 멈춘 그림과 다름), 'low'는 24,116화소가 바뀌고 밝기 비 평균 0.889(¼ 그림을 늘려 곱해 가장자리가 번지고 조금 옅다 —
  멈춘 그림과 25,966화소 다름). 멈추면 처음 그림과 바이트까지 같다

### 탭이 숨었거나 문맥을 잃은 동안의 끝 알림(49차가 남긴 것)

0.49.0 끝 알림 규칙에 두 줄을 더한다:

| 일 | Promise | 카메라 |
|---|---|---|
| 옮기는 중 탭이 숨음(`visibilitychange` → `hidden`)·그래픽 문맥을 잃음 | `true` | 끝 자리로 마침(끌기·휠과 같다 — 다시 보이거나 되찾으면 그 자리를 그린다) |
| 숨은 동안·잃은 동안 부름 | 곧바로 `true` | 움직이지 않고 끝 자리 |

- 0.49.0은 `requestAnimationFrame`이 멈춰 보일 때까지(되찾을 때까지) 풀리지 않았다 — SKP 장면 재생처럼 `await flyTo`로 다음 일을 잇는 앱이 숨은 탭에서 멈췄다.
  끝 자리로 마치는 것은 끌기·휠이 옮기던 움직임을 끝 자리로 마치는 것(0.48.0)과 같은 규칙이고, 사용자가 보지 못한 움직임을 다시 보여 줄 까닭이 없어 고른 값이다
- 문서 `visibilitychange`는 그 뷰어가 처음 움직임을 시작할 때만 듣는다(움직임을 쓰지 않는 뷰어는 0.49.0과 같은 사건 듣기)

### BVH 일 줄(STEP 58차 — 부품 자리 8만)

장면을 올린 뒤 쉬는 틈에 고르기 BVH를 만드는 일 줄이 `shift()`로 앞에서 하나씩 꺼내 일이 많으면 남은 줄을 매번 당겼다(O(n²) — 그물 8만 + 윤곽선 8만 = 일 16만에서 CPU 1.9초,
휴대폰 CPU를 4배로 보면 약 30초). 앞 자리 번호로 꺼내도록 바꿨다. 일의 차례(작은 것부터, 같은 크기는 장면 차례 — 정렬은 안정)와 결과는 0.49.0과 같고,
중간에 `setMesh`로 일을 더해도 남은 일과 더한 일을 다시 정렬하는 차례가 같다(시험이 0.49.0 `shift` 줄을 흉내 내 견준다).
가짜 WebGL에서 서로 다른 작은 그물 8만(윤곽선 고르기 켬 — 일 16만)을 올린 뒤 줄을 다 도는 시간(Node, 네 번 가운데값, base·head 번갈아 두 짝, load average 11~18)이
594e10e 13.9~14.6초 → 1.7~2.3초다(남은 시간은 BVH 만들기 자체).

### 바뀐 기본 동작

- 깨진 입력만 바뀐다(위 표): 한도 밖 좌표는 범위·그리기·고르기에서 빠지고, 놓을 자리를 모르는 항목은 그리지 않고, 깨진 색·굵기·크기는 기본값으로 그린다.
  1e15 넘는 유한한 좌표는 0.49.0이 범위에 넣던 것이다(mm면 지구–태양 거리의 6.7배 — float32 좌표 칸 간격이 1억을 넘어 그리기·측정에 쓸 수 없다)
- 깨진 항목이 있으면 `viewer.scene`은 앱이 준 객체가 아니라 그 항목을 빼거나 고친 새 장면 객체다(멀쩡하면 0.49.0처럼 준 객체 그대로)
- 놓을 자리를 모르는 그물을 `setMesh`에 주면 넣지 않고 `false`(앞 그물은 그대로)
- 앱 붙잡기 점(`setMeasureSnap({ points })`)은 한도 밖 좌표도 건너뛴다, `setMarker`·`setItemColor`의 유한하지 않은 값은 `null`과 같다
- 탭이 숨었거나 문맥을 잃은 동안 카메라 움직임은 끝 자리로 마치고 `true`(위)
- 주변 가림은 `moving`을 주지 않으면 0.49.0과 같다

### 확인

- 시험: `tests/v0500input.test.ts`(18개 — 순수 `checkScene` 알림·조치·같은 객체·얕은 사본, 범위 한도·`positionsBad`, `triangleFix`·`segmentFix`, BVH 빼기, 격자 한도,
  가짜 WebGL 뷰어에서 무한 `bounds`·1e38 정점·한도 밖 원점·1e30 행렬·0xffffffff 색인(모드 넷·구간 숨김)·원점 NaN·색 NaN·`setMesh`/`removeMesh` 알림·같은 id 구간 단면·고르기 한도·API 인자·큰 그물,
  빠른 퍼징 700경우 문제 0, BVH 일 줄 차례가 0.49.0 `shift` 줄과 같음(중간 `setMesh`)·일 16만이 2초 안), `tests/v0500ao.test.ts`(5개 — `'keep'` 같은 그리기,
  `'off'` 끈 뷰어와 같은 그리기·그림 다시 만들지 않음, `'low'` ¼ 그림·차례 같음, `flyTo` 중), `tests/v0500hidden.test.ts`(5개 — 보이는 동안 0.49.0, 옮기는 중 숨김·숨은 동안 부름·문맥 잃음 `true`·끝 자리,
  `dispose` `false`). 시험 도우미 `tests/fuzzscene.ts`(생성기)·`tests/glguard.ts`(가짜 WebGL 그리기 검사). typecheck와 전체 시험(105파일 1,097개)이 통과한다
- 퍼징(위): 마지막 커밋에서 다시 8,000경우 + 큰 그물 둘 문제 0
- 넓은 탐색(가짜 WebGL, 49차 머리 594e10e와 행 단위로 견줌): 37차 넓은 탐색 사본 275,836자리와 38차 모서리 꼴 3,600경우 871,200자리 행 파일이 바이트까지 같고 앱 호출도 같다(닫힌 3,640·열린 5,960번).
  과제 1~3 뒤(6ac0a67)와 마지막 커밋 두 번 같다
- 비용(가짜 WebGL 그리기 포함, 400자리 × 세 번 — 둘째·셋째 판 가운데값 ms, 594e10e·head를 번갈아 세 짝, load average 13~15). 고르기·미리 보기 길은 바뀌지 않아 같은 값이다:

  | 장면 | 594e10e 마우스 미리 보기 | head | 594e10e `pick` | head | 594e10e `pickCandidates` | head | 594e10e 고르기 모드 화살표 | head |
  |---|---:|---:|---:|---:|---:|---:|---:|---:|
  | 곧은 선 82개 격자 + 앱 점 20,000개 + `pointsFor` 셋 | 0.0537 · 0.0417 | 0.0581 · 0.0434 | 0.0062 · 0.0054 | 0.0062 · 0.0052 | 0.0075 · 0.0073 | 0.0072 · 0.0074 | 0.0324 · 0.0307 | 0.0309 · 0.0290 |
  | 상자 200개를 합친 그물 + 구간 단면 + 앱 점 20,000개 + `pointsFor` 둘 | 0.1311 · 0.1183 | 0.1283 · 0.1197 | 0.0119 · 0.0092 | 0.0132 · 0.0107 | 0.0213 · 0.0242 | 0.0203 · 0.0188 | 0.0994 · 0.0927 | 0.0963 · 0.0949 |

  `pointsFor` 호출·고른 종류·고르기 종류·후보 수는 594e10e와 head가 같다(한 번 더 잰 판도 같은 결과)
- `setScene` 비용(가짜 WebGL, `setScene` + 첫 그림, 네 번 가운데값 ms, 594e10e·head 번갈아 두 짝, load average 13~18): 정의 12 × 자리 3,000 19.1~24.7 → 20.2~20.6(같음),
  서로 다른 작은 그물 8만 2,189~2,353 → 2,327~2,384(같음 — 처음 판은 배열마다 기억을 둬 2,721~2,916이었고 깨진 배열·긴 배열에만 두도록 고쳤다),
  정점 200만·삼각형 200만·정점 색·윤곽선 30만 그물 하나 20.8~22.7 → 46.6~51.7(색인 600만·정점 색 800만·윤곽선을 한 번씩 훑는 몫 — 실제 GPU 올리기 수백 ms에 견줘 작다)
- 화소·값 회귀(960 × 600, 판마다 두 번, Chrome 157 SwiftShader): `npm run pixels -- --base 594e10e`(49차 머리)로 장면 157개가 모두, 값 118묶음 가운데 117개가 바이트까지 같다
  (675초 — head 154·183초, base 165·169초, load average 12~15). 다른 것은 새 값 묶음 `input-fuzz-values` 하나다 — 0.49.0에 없는 API를 쓰지 않아 base에서도 찍히고 깨진 값 결과가 다르다
  (위 "찾은 결함과 고침"의 Chrome 값, 끝 줄의 주변 가림 `moving`은 0.49.0에서 셋 모두 `'keep'`과 같다). 그 묶음은 head 판마다 1.8초다.
  `--base v0.33.0`으로는 장면 157개 가운데 128개·값 94묶음이 같고, 다른 장면은 0.49.0과 같은 열여섯(화소 수도 같음), 다른 값은 0.49.0의 셋(`hole-measure-normal`·`hidden-label-cycle-values`·
  `theme-contrast-motion-values`)과 `input-fuzz-values`다(489초). 마지막 커밋(검사 기억만 바꿈)은 앞 커밋과 `input-fuzz-values`·`secrange` 장면·값이 같다
- 화소 CI(`pixels.yml`)는 base와 값이 다르면 실패하므로 이 PR에는 `pixels-changed` 라벨이 필요하다(의도한 변화 — 새 값 묶음 하나). 새 장면이 없고 새 묶음이 판마다 2초 안이라
  화소 CI 시간은 0.49.0과 거의 같다(약 11~12분, 네 번 찍어 7초 남짓 늚)

### 남은 한계

- 반투명 면의 주변 가림(49차가 남긴 것)은 고치지 않았다 — 반투명 그물은 지금처럼 가리지도 가려지지도 않는다. 설계: 반투명 그물까지 그린 둘째 깊이 그림을 표본에만 쓰고(받는 화소는 불투명 깊이 그대로)
  셰이더 변종(`OCC`)으로 켜면 유리 꽃병 둘레 바닥처럼 반투명 물체가 드리우는 가림이 생긴다(깊이 그리기 한 번 더 — 켤 때만)
- 'low'는 화면 단계만 줄인다(불투명 깊이 그리기는 그대로 — 큰 장면은 'off'가 낫다)
- 법선·무늬 좌표의 값(NaN·0)은 보지 않는다(길이만 — 실제 Chrome에서 법선 0·NaN은 그림이 같았다). 무늬 그림(`Texture3d`)·앱 붙잡기 점 밖의 앱 입력(덧그림·끌어온 점·단면 평면)은
  유한하지 않은 값을 0.49.0처럼 각자 거르는 데까지만 본다(퍼징에서 문제는 없었다)
- 깨진 끝점 선분을 그리지 않는 것은 WebGL이 NaN 꼭짓점 도형을 버리는 것에 기댄다(Chrome SwiftShader·Apple GPU에서 확인 — 명세는 정하지 않는다)
- 같은 id는 알리기만 한다(둘 다 그린다)
- 걷기 이동은 주변 가림 `moving`의 움직임으로 보지 않는다

### 앱이 할 일

- 세 앱 공통: `onSceneIssues`(또는 `setScene` 뒤 `sceneIssues`)를 앱 경고 목록(`Scene3d.warnings`와 같은 패널)에 이어 보인다 — `code`로 제 말 글을 쓰거나 `sceneIssueText`.
  해석 워커에서 미리 보려면 `checkScene`을 쓴다(뷰어와 같은 판정). 해석기가 이미 거르는 값은 그대로 두면 된다(코어는 거른 장면에 아무것도 하지 않는다)
- STEP: 57차 퍼징이 찾은 깨진 파일 표본을 앱에서 열어 경고 목록에 코어 알림이 나오는지 본다. 큰 조립(58차)은 코어를 올리기만 하면 BVH 일 줄이 빨라진다
- SKP: 보기 설정의 주변 가림에 "움직이는 동안 끄기"를 두거나 휴대폰에서 `moving: 'off'`를 기본으로 — 장면 탭 재생(`await flyTo`)은 숨은 탭에서도 끝까지 이어진다
- NC: 깨진 프로그램에서 나온 공구 경로 좌표 NaN·아주 큰 값은 그 선분만 그리지 않고 `positions` 알림이 온다(재생 범위·선분 번호는 그대로). 할 일은 경고 목록에 잇는 것뿐이다
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.51.0: 그물 많은 장면의 프레임 비용(STEP 58차 — 화면 밖 잘라내기·그물마다 GL 호출 줄이기)·나눠 올리기 걸음 몫과 다시 그리기 간격(STEP 59차)·`packNormals`·`packUvs` 빠른 셈(SKP 51차)

STEP 58차가 부품 자리 8만(그물 8만 2,780)에서 먼저 무너지는 것이 코어 그리기라고 보였다(코어 0.37.0 — 그물마다 그리기를 불러 한 프레임 233 ms, M1 Pro).
그물 1만·8만 합성 장면(`scripts/bench/flat.ts` — 자리마다 그물 하나·자리 행렬 하나)으로 프레임을 단계별로 나눠 재고, 큰 몫부터 줄였다.
기본 그림은 0.50.0과 바이트까지 같다(아래 "확인").

### STEP 표본 꼴(같은 배열)은 인스턴싱이 이미 잡는다

STEP 58차 표본(같은 판 하나를 8만 자리에 — 해석기가 같은 형상 항목을 한 번만 삼각화하고 `Mesh3d.matrix`로 놓는다)은 배열을 함께 쓴다.
STEP이 고정한 코어 0.37.0에는 같은 그물 자리 모아 그리기(0.42.0 인스턴싱)가 없어 그물마다 그렸다. 같은 꼴 합성(`s80k` — 원기둥 정의 하나 × 8만 자리)은
0.50.0에서도 그리기 호출 11번으로 그린다 — M1 Pro 960 × 600 음영+윤곽 한 프레임 JS 51~58 ms·GPU 마침까지 64~71 ms(0.51.0 49~50·59~64 ms — 부하가 다른 두 번 잰 범위).
코어를 올리기만 하면 233 ms가 이만큼 준다(같은 꼴 합성 기준 — 부품 삼각형 수는 다르다).
서로 다른 부품(서로 다른 배열)이 많은 조립은 인스턴싱이 묶지 못한다 — 이번 차수가 주로 본 꼴이다.

### 프레임 단계 나누기(0.50.0, M1 Pro Metal)

`npm run bench:many -- --parts`: GL 호출을 종류별로 세고, 그 종류를 아무것도 하지 않는 함수로 바꿔 줄어든 JS 시간을 그 몫으로 본다(몫끼리는 겹친다 — GPU 프로세스로 넘기는 명령이 쌓이면
JS가 기다리는 몫이 함께 빠진다). 서로 다른 배열(그물 하나 삼각형 136개, 윤곽선 있음) 자리 8만(`d80k`)·1만(`d10k`), 음영+윤곽:

| 단계 | 8만 0.50.0 | 1만 0.50.0 | 1만 0.51.0 |
|---|---:|---:|---:|
| 그리기 JS(`renderNow`) | 321 ms | 32.8 ms | 28.6 ms |
| GPU 마침까지(1화소 읽기) | 505 ms | 64.8 ms | 63.1 ms |
| GL 없는 JS(모든 GL 호출을 비움) | 102 ms | 13.0 ms | 12.2 ms |
| 그리기 몫 · uniform 몫 · 묶기 몫(그 종류만 비운 JS 차) | 137 · 70 · 158 ms | 10.6 · 11.3 · 11.8 ms | 7.2 · 12.3 · 9.1 ms |
| 윤곽선 몫(음영+윤곽 − 음영, JS · GPU 마침) | 144 · 214 ms | 15.7 · 24.2 ms | 12.0 · 24.5 ms |
| 그리기 호출 · uniform · 묶기(프로그램·VAO) 호출 | 160,004 · 731,443 · 240,007 | 20,004 · 91,443 · 30,007 | 20,004 · 41,448 · 20,008 |
| 화면 가운데 고르기(처음 — BVH 만들기 · 그 뒤) | 96 · 18 ms | 14 · 4.6 ms | 24 · 2.8 ms |
| 뷰어 몫(`renderNow` − 렌더러) | 0.1 ms | 0.2 ms | 0.2 ms |

(1만은 마지막 판 b58242b, load average 28~46 — 흔들림이 크다. 8만은 50차 머리 단독 판. 8만 0.51.0 중간 판(68765e4 — 아래 "되돌린 것" 포함)은 JS 298·GPU 마침 480 ms,
GL 없는 JS 78 ms였다)

CPU 프로필(`--profile`, 그물 8만 섞음, 잘라내기·선 기억까지 넣고 `mat4Mul` 풀기 전 판, 한 프레임): `uniformMatrix4fv` 49 ms·`mat4Mul` 36 ms·`bindVertexArray` 17 ms·
`drawArrays`·`drawElements` 16 ms·묶음 나누기 10 ms·`uniformMatrix3fv` 9 ms·잘라내기 판단 6 ms(그 뒤 덩어리로).
가장 큰 몫은 **그리기 호출 수**다 — JS를 줄여도 GPU 프로세스(ANGLE Metal)가 그리기 하나에 2.5 µs 남짓을 써 맞춘 화면의 프레임은 그만큼 남는다(JS가 그 명령이 빠지기를 기다린다).
그래서 이번 차수는 (1) 화면 밖 그물은 아예 그리지 않고, (2) 그물마다 GL 호출을 줄였다. 서로 다른 그물을 버퍼 하나로 묶어 그리기 호출 자체를 줄이는 것은 설계만 했다(아래 "남은 한계").

### 고친 것

- **화면 밖 잘라내기**(기본 켬 — `src/cull.ts`): 그물(삼각형 정점 ∪ 윤곽선 끝점의 로컬 범위를 모형 행렬로 옮긴 상자)이 시야 옆 네 평면(시점·투영 행렬의 행 —
  굵은 선 반폭·끝 마개를 덮는 여백 장치 화소 4 × 화소 비율 + 4) 가운데 하나의 확실히 바깥이면 면·윤곽선·삼각형 변·숨은 점선·외곽선 깊이·주변 가림 깊이·반투명 면을 그리지 않는다.
  GPU float32 셈 어긋남(큰 로컬 좌표를 행렬이 되돌리는 꼴까지)만큼 한도를 더 두고, 수가 아니거나 투영 성분이 있는 행렬이면 빼지 않는다. 장면 차례 64개 덩어리로 감싸는 상자를 먼저 보아
  맞춘 화면에서는 거의 셈하지 않는다(덩어리 판단 = 그물마다 판단). 그림자 깊이 그림·잘린 면 채우기·인스턴싱 자리 수·묶음 나누기와 차례는 잘라내기 전 그대로다(모은 묶음에서는 그릴 때만 뺀다)
- **잇단 윤곽선·숨은 점선의 상태 기억**: 같은 프로그램·같은 값이면 `useProgram`과 고정 균일 변수(색·정점 색·불투명도·덧칠·치우침·굵기·점선·화면 크기)를 다시 보내지 않고 행렬·단면 평면·안개만(그물마다 GL 호출 9~13 → 3)
- JS: `mat4Mul` 풀어 쓰기(같은 연산·차례 — 비트 같음), 그물 색·깃발 기억을 글자열 대신 수로, 인스턴싱 묶음 나누기에서 자리마다 닫힘 함수·빈 배열·글자열 잇기를 만들지 않는다
- 해 보고 되돌린 것: 그물 행렬 셋(`u_mvp`·`u_mv`·`u_nmat`)을 vec4 배열 하나(`u_m` — 자리 자료 그림 INST 텍셀 꼴)로 한 번에 보내고 셰이더에서 행렬을 만들면 그물마다 GL 호출이 3 → 1이지만,
  M1 Pro(ANGLE Metal)에서 확대한 음영+윤곽·숨은 선·X-ray·단면 그림이 0.50.0과 달랐다(음영만·와이어프레임은 같음 — 깊이 마지막 자리가 달라 면 위 윤곽선의 깊이 겨루기가 바뀐 것으로 본다,
  SwiftShader는 같다). 기본 그림 바이트 같음을 지키려 0.50.0 그대로 둔다(같은 까닭으로 인스턴싱 켬·끔도 Metal에서 그런 화소가 다를 수 있다 — 0.42.0 "남은 한계"의 겹친 깊이 화소)

### 전·후(960 × 600, 판을 번갈아 두 번 × 다섯 번 가운데값)

`npm run bench:many -- --base cd3df76 --variants base,head --size <크기> --parts --modes shadedEdges,shaded,shadedEdges+zoom` — `+zoom`은 맞춘 뒤 8배 확대(자리 대부분이 화면 밖).
GPU 마침까지 ms(괄호는 그리기 JS):

| 장면(그물 수, 삼각형) | M1 Pro 맞춤 0.50.0 | 0.51.0 | M1 Pro 8배 확대 0.50.0 | 0.51.0 | 잘라낸 그물 |
|---|---:|---:|---:|---:|---:|
| 서로 다른 배열 1만(136만) | 64.8 (32.8) | 63.1 (28.6) | 61.4 (31.7) | 13.8 (8.5) | 9,118 |
| 섞음 1만(짝수 자리는 정의 12개 배열을 함께 씀 — 136만) | 33.8 (18.3) | 35.8 (17.4) | 33.1 (17.4) | 10.4 (7.6) | 9,118 |
| 같은 배열 8만(STEP 표본 꼴 — 576만) | 71.0 (57.7) | 63.8 (50.0) | 62.3 (53.8) | 42.3 (38.9) | 73,365 |
| 섞음 8만(1,088만) ※ | 230.9 (206.1) | 224.3 (197.4) | 230.4 (211.5) | 60.7 (56.7) | 73,296 |
| 서로 다른 배열 8만(1,088만) ※ | 504.6 (321.1) | 480.0 (297.6) | 466.4 (303.4) | 61.3 (46.0) | 73,296 |

위 세 줄은 마지막 판(b58242b, load average 28~46). ※ 8만 둘은 중간 판(68765e4 — 아래 되돌린 행렬 한 번에가 든 판 — 그물 면마다 GL 호출이 둘 적다, load average 7~18)이다.
마지막 판으로 다시 재는 동안 기계 부하(load average 40 안팎·스왑)에 헤드리스 Chrome 그림이 멈춰 끊었다. 맞춘 화면은 1만 서로 다른 배열에서 JS가 13% 남짓 줄고 GPU 마침은 흔들림 안,
같은 배열 8만은 JS·GPU 마침이 10% 남짓 준다. 확대한 화면은 잘라낸 만큼 4~8배 빠르다.

SwiftShader(CPU로 흉내 낸 GPU — 래스터가 대부분, 판마다 한 번 × 세 번, 중간 판 68765e4, load average 17~18): 서로 다른 배열 1만 맞춤 1,170 (22.1) → 1,210 (25.4)·확대 777 (22.7) → 171 (6.9),
섞음 1만 맞춤 1,281 (17.6) → 1,157 (16.2)·확대 719 (14.2) → 288 (7.3) — 맞춤은 흔들림 안, 확대는 잘라낸 만큼 래스터·정점 일이 준다. 같은 배열 8만(steady만): 확대 4,691 (59.8) → 732 (38.1), 맞춤 그리기 JS 59.0 → 42.5
(맞춤 GPU 마침은 load average 17~27에서 10~42초로 흔들려 견주지 않는다). 섞음·서로 다른 배열 8만은 SwiftShader 한 프레임이 수 초라 재지 않았다.
GPU 버퍼 바이트는 같다. 잘라내기 자료(그물마다 상자 9값과 로컬 범위)는 서로 다른 그물 8만에 20 MB 남짓이다(JS 힙 — 흔들림이 커 판끼리 차이로는 보이지 않는다).

### 나눠 올리기 걸음 몫·다시 그리기 간격(STEP 58·59차)

나눠 올리는 동안 프레임마다 그때까지 올린 것을 다시 그려 걸음이 많으면 다 올리기가 그물 수의 제곱으로 는다. STEP 59차는 코어의 비공개 상태(`upload.budget`)를 고쳐
앞 두 걸음만 8 ms로(첫 그림), 그다음은 그물 수에 맞춘 몫(1,000개마다 1 ms, 8~100 ms)으로 올렸다. 이를 공개 선택으로 받는다:

- `setScene(scene, { incremental: { budgetMs: (step, meshes) => ms } })`: 걸음마다 몫(step = 0부터, meshes = 장면 그물 수). 돌려준 값이 유한한 양수가 아니거나 함수가 예외를 내면 그 걸음은 숫자 몫(8 ms)
- `incremental.redrawMs`: 올리기 걸음만으로 생긴 다시 그리기를 이 간격(ms)에 한 번(첫 걸음은 그린다 — 첫 그림). 다 올린 걸음은 그리지 않고 다음 프레임에 장면 전체를 그린다
  (올리기와 장면 그리기를 두 작업으로 — 가장 긴 작업이 둘의 합이 아니게). 카메라·고르기·무늬 등 다른 까닭의 그리기와 `renderNow`는 늘 그린다. `Infinity`면 첫 그림과 다 올린 뒤만
- 주지 않으면 0.50.0과 같다(숫자 몫, 걸음마다 그리기). 숫자 몫 상태(`upload.budget`)는 그대로라 앱이 고치던 길도 0.50.0처럼 듣는다(이제 함수로 바꾸면 된다)
- 비용(`npm run bench:many -- --base cd3df76 --variants base,head,head-step,head-step-r250,head-step-once --open-only --budget 8 --rounds 2`, M1 Pro, 처음 열기 가운데값 ms(head는 되돌리기 전 판 e5bc75f, load average 9~20) —
  `head-step`은 몫 함수 `(s, n) => s < 2 ? 8 : min(100, max(8, n / 1000))`, `-r250`·`-once`는 `redrawMs` 250·`Infinity`):

  | 장면 · 판 | 다 올림 | 첫 그림 | 다 올린 뒤 그림 끝 | 프레임 · 장면 그리기 | 가장 긴 프레임 |
  |---|---:|---:|---:|---:|---:|
  | 같은 배열 8만 · 0.50.0 숫자 8 ms | 1,739 | 132 | 1,787 | 50 · 50 | 61 |
  | 0.51.0 숫자 8 ms(같은 길) | 1,740 | 136 | 1,784 | 54 · 54 | 53 |
  | 0.51.0 몫 함수 | 786 | 156 | 844 | 8 · 8 | 138 |
  | 0.51.0 몫 함수 + `redrawMs` 250 | 674 | 136 | 743 | 9 · 4 | 161 |
  | 0.51.0 몫 함수 + `redrawMs` Infinity | 608 | 137 | 720 | 9 · 3 | 108 |

  섞음 8만(숫자 8 ms 판은 열기마다 걸음이 수백 번)은 같은 Chrome에서 열기를 되풀이하는 동안 GPU 프로세스가 12 GB까지 불어 기계가 버거워 멈췄다(재지 못함).

  몫 함수만으로 걸음이 50 → 8번이 되어 다 그리기까지 절반 아래로 줄고, `redrawMs`는 남은 걸음의 장면 그리기를 빼고 다 올린 걸음과 장면 그리기를 나눠 가장 긴 프레임도 준다
  (Infinity의 장면 그리기 셋은 첫 그림·다 올린 뒤에 다른 까닭의 다시 그리기가 하나 낀 것이다 — 올리기 걸음만으로 생긴 그리기는 건너뛴다)

### `packNormals`·`packUvs` 빠른 셈(SKP 51차)

- `hypot3(x, y, z)`(새 — 입구에서 내보낸다): V8 `Math.hypot`(builtins math.tq)과 같은 차례의 같은 연산(가장 큰 절댓값으로 나눈 제곱의 Kahan 합 → √ × 최댓값)을 인자 배열 없이.
  최댓값이 유한한 양수가 아니면 `Math.hypot`에 맡긴다. V8(Chrome·Node)에서 비트까지 같다(시험 — 무작위·넓은 지수·특수 값 30만 짝과 특수 값 모든 짝). 다른 엔진의 `Math.hypot`과는 마지막 자리가 다를 수 있다
- `packNormals`는 길이를 `hypot3`로, `packUvs`는 축마다 닫힘 함수·배열 대신 축 둘을 풀어 쓴 같은 셈(Math.min·max의 −0·NaN 규칙, 한도 자르기까지) — 출력 바이트·`uvTransform`이 0.50.0과 같다
  (시험이 0.50.0 셈 사본과 무작위·극값·0 길이·NaN·무한대·−0·짧은 배열로 견준다)
- 시간(node v24, esbuild로 묶은 0.50.0과 0.51.0을 번갈아 다섯 번 가운데값, load average 20 안팎이라 흔들림이 크다): 법선 600만 334~989 → 79~270 ms(4~6배), 무늬 좌표 200만 85~261 → 65~111 ms

### 새 API

- `setRenderOptions({ culling })`(기본 켬, `false`·`null`이면 끈다)·`renderOptions.culling`, `stats.culled`(이 그림에서 잘라낸 그물 수)
- `setScene` `incremental.budgetMs`에 함수 `(step, meshes) => number`, `incremental.redrawMs`
- `hypot3`(입구 `opencad-viewer3d`·하위 경로 `opencad-viewer3d/math`)
- 순수 `opencad-viewer3d/cull`: `cullPlanes(viewProj, mx, my)`·`cullBox(local, model)`·`cullOut(planes, box)`·`cullUnion(list)`·`cullSide(planes, box)`·`segmentsBox(xyz)`

### 바뀐 기본 동작

- 그림은 같다. 화면 밖 그물만큼 `stats.drawCalls`·`triangles`·`segments`와 인스턴싱 자리 수(`stats.instanced.items`)가 준다(확대한 화면 — 맞춘 화면은 0.50.0과 같은 수)
- 나눠 올리기는 주지 않으면 0.50.0과 같다. 셰이더는 0.50.0과 글자까지 같다

### 확인

- 시험: `tests/v0510cull.test.ts`(14개 — 잘라내기 순수 계산·덩어리 판단 무작위 2만 번, 뷰어에서 확대하면 화면 밖 그물만 빼고 남은 그리기 기록이 끔과 같은 차례·같은 값(모드 여섯·겉모습·외곽선·
  숨은 점선·단면·구간)·윤곽선이 화면을 지나는 그물은 남김·맞춤은 끔과 같은 기록·옮긴 묶음·덩어리와 그물마다 판단이 같은 그물(300개, 지움·바꿈 뒤), 선 상태 기억 끔과 그리기 기록이
  균일 변수 값까지 같음·GL 호출 줄어듦), `tests/v0510pack.test.ts`(8개 — `hypot3`·`mat4Mul` 비트 같음, `packNormals`·`packUvs` 0.50.0과 같은 출력), `tests/v0510first.test.ts`(5개 — 걸음 몫 함수·
  쓸 수 없는 값, 주지 않으면 0.50.0 걸음·그리기, `redrawMs` Infinity·간격·조작 프레임). typecheck와 전체 시험(108파일 1,124개)이 통과한다
- 넓은 탐색(가짜 WebGL, 50차 머리 cd3df76과 행 단위로 견줌): 37차 넓은 탐색 사본 275,836자리와 38차 모서리 꼴 3,600경우 871,200자리 행 파일이 바이트까지 같다
- 기계 GPU 그림(`npm run bench:many -- --hash`, M1 Pro Metal, 960 × 600 — 같은 장면·같은 카메라를 판마다 그려 화면 전체 해시): 섞음 1만·서로 다른 배열 1만·정의 12 × 자리 300에서
  맞춤 음영+윤곽과 8배 확대한 음영·음영+윤곽·와이어프레임·숨은 선·X-ray·단면·외곽선·강조·주변 가림이 0.50.0과 같은 해시이고, 잘라내기 켬·끔도 같다.
  해 그림자는 0.50.0끼리도 두 번 잰 해시가 달라(같은 판을 다시 연 그림끼리 — 까닭은 보지 않았다) 견주지 않았다
- 화소·값 회귀(960 × 600, 판마다 두 번, Chrome 157 SwiftShader, 마지막 판 b58242b): `npm run pixels -- --base cd3df76`(50차 머리)로 장면 157개가 모두, 값 119묶음 가운데 118개가 바이트까지 같다
  (800초 — load average 16~68). 다른 하나는 새 값 묶음 `many-culling`(기존 `many` 자료 — 0.50.0에 없는 선택이라 base에서는 건너뛴다)이다:
  돌려 8배 가까이 확대한 카메라에서 음영+윤곽·겉모습·와이어프레임+외곽선·숨은 선+점선·X-ray·잘린 면 채우기·주변 가림+그림자·평행 투영+외곽선 여덟 경우 모두
  잘라내기 켬·끔의 다른 화소가 0이고, 그물 120개 가운데 57~96개를 잘라 삼각형·선분·모은 자리 수가 그만큼 준다(그리기 호출은 그물마다 그리는 겉모습·X-ray·단면·평행 투영에서
  103·136·137·29 → 62·57·58·21, 모아 그리는 경우는 같은 수). `--base v0.33.0`으로는 장면 157개 가운데 128개·값 94묶음이 같고, 다른 장면 열여섯·다른 값 넷은 0.50.0과
  같은 것·같은 화소 수다(새 값은 `many-culling`을 더한 21묶음, 1,038초)
- 화소 CI(`pixels.yml`)는 base와 값이 다르면 실패하므로(새 값 묶음 — base에서 건너뜀) 이 PR에는 `pixels-changed` 라벨이 필요하다. 새 장면이 없고 새 묶음이 판마다 2.5초라
  화소 CI 시간은 0.50.0과 거의 같다(약 11~12분)
- 미리 보기 비용(가짜 WebGL, 400자리 × 세 번 — 둘째·셋째 판 가운데값 ms, cd3df76·head를 번갈아 세 짝, load average 17~28): 마우스 미리 보기 곧은 선 격자 0.0622·0.0475 → 0.0546·0.0433,
  상자 200개 + 구간 단면 0.1586·0.1268 → 0.1325·0.1119, `pick`·`pickCandidates`·고르기 화살표는 같은 범위. 고른 종류·후보 수·앱 호출은 같다

### 남은 한계

- 서로 다른 배열의 그물은 그물마다 그리기 한두 번이라 맞춘 화면의 프레임은 GPU 프로세스 몫(그리기 하나에 2.5 µs 남짓 — 서로 다른 그물 8만 음영+윤곽 480 ms)이 대부분이다.
  묶어 그리기 설계: 장면 차례로 잇단 같은 상태(그물 프로그램·무늬·뒷면·PBR 없음·불투명·구간 없음·같은 법선 꼴·같은 한쪽 면)의 그물을 버퍼 하나로 잇고(로컬 좌표 그대로) 정점마다 자리 번호를 두어,
  INST처럼 자리 자료 그림에서 행렬(+ 색)을 읽는 변종(`MERGE`)으로 그린다 — 같은 차례·같은 float 값이라 그림이 같다. 숨긴 그물은 색인 구간을 나눠 건너뛰고, 강조·반투명·구간·단면이 걸린 그물은
  그물마다로 돌아간다. 윤곽선도 같은 길(가는 선 `LINES`, 굵은 선은 선분 인스턴스마다 자리 번호). 버퍼가 두 벌이 되는 메모리(그물 자리만큼)와 장면을 바꿀 때 다시 잇는 비용을 재야 한다.
  셰이더가 자료에서 만든 행렬은 Metal에서 깊이 마지막 자리가 균일 행렬과 다를 수 있어(위 "해 보고 되돌린 것") SwiftShader 화소만으로는 같다고 할 수 없다 — 처음에는 선택(기본 끔)으로 두고 `--hash`로 기계 GPU를 견준다
- 잘라내기는 시야 옆 네 평면만 본다(앞·뒤 자르기 평면, 다른 그물에 가린 그물은 그린다). 겉모습 행렬이 하나라도 있으면 덩어리 없이 그물마다 판단한다
- 같은 배열 8만 자리(인스턴싱)는 자리마다 행렬 셈(`instMeshes` — 그물 행렬 둘·법선 행렬)이 남은 몫이다(맞춘 화면 JS 49 ms 가운데 15 ms 남짓)
- 고르기 첫 번은 BVH를 만든다(서로 다른 그물 8만에서 96 ms)

### 앱이 할 일

- STEP: 코어를 올리면 같은 부품 자리(표본 꼴)는 인스턴싱으로 프레임이 233 → 60 ms 남짓(M1 Pro). `src/app/upload.ts`의 `setUploadBudget`(코어 비공개 상태 고치기)을
  `setScene(…, { incremental: { budgetMs: stepBudgetMs, redrawMs } })`로 바꾼다(`stepBudgetMs(step, meshes)` 그대로 넘기면 된다). 확대해 보는 화면은 잘라내기로 빨라진다(할 일 없음)
- SKP: 앱이 복제해 쓰던 `hypot3`를 코어 `hypot3`로(같은 비트), `packNormals`·`packUvs`는 코어를 올리기만 하면 빨라진다
- NC: 할 일 없음(공구 경로 선분 묶음은 잘라내기 대상이 아니다 — 그물만). 코어를 올리면 그물이 많은 공작물 표시에서 프레임이 준다
- 세 앱 공통: 화면 밖 잘라내기는 기본 켬이다 — 끄려면 `setRenderOptions({ culling: false })`. `stats.drawCalls`를 화면 시험에서 견주는 앱은 확대한 화면에서 수가 줄 수 있다
- DWG: 3D 뷰어 코어를 쓰지 않는다

## 0.52.0: 그물이 아주 많은 장면을 묶어서 — GL 객체 수·버퍼 바이트를 묶음 수만큼으로, 그리기 호출을 묶음마다 한 번으로(기본 'auto')

0.51.0은 그물이 많은 장면에서 화면 밖 그물을 빼고 그물마다 GL 호출을 줄였지만, 서로 다른 배열의 그물(조립의 서로 다른 부품 — 인스턴싱이 묶지 못한다)은
그물마다 GPU 버퍼 넷·VAO 셋을 만들고 그리기 호출을 둘씩 불렀다. 서로 다른 그물 8만이면 GL 객체가 50만 개를 넘어, 이 차수에 그 장면을 기계 GPU(M1 Pro, ANGLE Metal)로 재던
헤드리스 Chrome의 GPU 프로세스가 14 GB를 넘기고 컴퓨터가 두 번 멈췄다(그물마다 작은 버퍼가 많으면 Metal 쪽 자원이 실제 자료보다 훨씬 커진다고 본다).
그래서 0.52.0은 **묶을 수 있는 작은 정적 그물이 2,000개 이상인 장면은 저절로**(`merging` 기본 `'auto'`) 장면 차례로 묶음 버퍼에 잇고 그 그물의 그물마다 버퍼·VAO를 놓는다 —
묶음 버퍼가 그 그물의 저장소가 되어 GL 객체 수는 묶음 수만큼(8만에서 버퍼·VAO 50만 6천 → 372개), 버퍼 바이트는 자료의 1.26배이고, 잇단 묶음 그물은 그리기 한 번에 그린다.
그보다 작은 장면(화소 회귀 장면 모두)은 훑지도 않아 0.51.0과 같다. 8만 그물은 크래시 위험이 있어 실제 GPU로 다시 재지 않았다 — 가짜 WebGL 객체 수·SwiftShader 1만 수치다(아래).

### 동작

- 묶는 그물: 다른 그물과 배열을 함께 쓰지 않고(같은 정의 자리는 인스턴싱 몫), 정점 65,536개·윤곽선 선분 65,536개 이하이고, 무늬 좌표·뒷면 색·PBR·장면 값 반투명·다시 받을 배열이 없는 그물.
  코어가 법선을 놓은(`release: { normals }`) 그물은 이을 배열이 없어 묶지 않는다(그물마다 버퍼 그대로)
- 켜기: `'auto'`(기본)는 장면을 올리기 전에 배열 공유를 훑어 묶을 수 있어 보이는 그물이 `MERGE_AUTO_MIN`(2,000) 이상이면 그 장면에 켠다(그물마다 GL 객체 7개 남짓 × 2,000 = 1만 4천 개,
  그리기 호출 4,000번 — 그리기 하나에 GPU 프로세스 2.5 µs 남짓이면 프레임마다 10 ms). 그물 수가 문턱보다 적은 장면은 훑지 않는다. `setMesh`로 그물이 문턱만큼 모여도 켜진다.
  `true`/`'on'`은 늘(그물 둘부터), `false`/`'off'`는 끈다(묶음 그물을 그물 배열에서 그물마다 버퍼로 되돌린다), `{ min }`은 문턱
- 묶음: 같은 꼴(법선 값 꼴 — Float32·Int8·Int16·정점마다 값 수, `doubleSided === false`)끼리 장면 차례로 버퍼 하나에 잇는다(로컬 좌표 그대로 — 위치·법선·정점 색 사본(정점 색이 없는 그물 자리는 0),
  색인은 앞 그물 정점 수만큼 옮김, 윤곽선 선분). 정점마다 묶음 안 그물 번호(Uint16, 정점 속성 위치 5). 묶음 하나는 그물 65,535개·정점 262,144개까지
- 굽기: 장면을 올리는 걸음 안에서 묶을 그물이 2,048개(또는 정점 262,144개) 모일 때마다 굽고 곧 그물마다 버퍼·VAO를 놓는다 — 그물마다 객체가 한꺼번에 쌓이는 것은 1만 4천 개 안쪽이다.
  다 올린 뒤에 생긴 일(켜기·다시 굽기)은 프레임마다 몫(8 ms와 지난 장면 그리기 시간 가운데 큰 것) 안에서 굽고, 그동안 뷰어가 다음 프레임을 부른다(`stats.merged.pending`)
- 저장소: 묶은 그물의 기록은 묶음 VAO와 그 그물 색인 시작·정점 시작·윤곽선 선분 시작을 가리킨다. 그물마다 그리는 길(강조 윤곽선·묶음 안 구간·단면·그림자 깊이·외곽선 색·반투명·
  잘린 면 채우기·삼각형 변)도 묶음 버퍼의 그 그물 자리를 같은 정점·같은 색인 차례로 그린다(`drawElements` 시작, 굵은 선 인스턴스 시작, 구간 모음·삼각형 변 색인에 정점 시작)
- 그리기: 불투명 면·외곽선/주변 가림 깊이·그물 윤곽선(굵기 1 — 화소 비율이 크면 굵은 선 변종)·숨은 점선에서, 그물마다 그리던 자리에 잇단 묶음 그물을 구간 하나로 모으고
  그물마다 그리기와 한 목록에 장면 차례로 둔다. 차례 끝에 구간들의 자리 자료(면 12텍셀 = `u_mvp`·`u_mv`·`u_nmat`·색, 선 6텍셀 = `u_mvp`·안개 깊이 행·선 색 — 그물마다 그릴 때와
  같은 double 곱을 float32로)를 이어 한 번 올리고 목록을 차례대로 그린다(구간마다 `drawElements`·`drawArrays`·`drawArraysInstanced` 한 번). 그리는 도형·차례·값이 그물마다와 같다
- MERGE 셰이더 변종은 INST 변종 글에서 자리 번호를 `gl_InstanceID` 대신 `a_item`으로, 색·정점 색 쓰기도 자리 자료에서 읽게 바꾼 것이다(`mergeShader` — 원본 셰이더 글자는 그대로라
  묶지 않는 그림의 셰이더는 0.51.0과 같다). 병렬 번역이 끝날 때까지는 그물마다(묶음 자리로) 그린다
- 구간을 끊는 것(그물마다 또는 빠짐): 숨긴 그물·화면 밖 그물(빠짐), 반투명·무늬·PBR·뒷면 그물, 묶음 안 구간(`setHiddenRanges`·`highlightRanges`)이 있는 그물,
  강조 윤곽선(굵기 2 — 면은 강조색을 섞은 구간으로 묶는다), 꼴이 다른 그물. 단면(하나·여럿)이 있으면 모두 그물마다, 그림자를 쓰면 면은 그물마다(윤곽선은 묶는다) — 모두 묶음 자리로
- 겉모습: 색·불투명도(1일 때)·행렬(`setItemMatrix` — 분해도)·윤곽선 색은 프레임마다 자리 자료에 든다(다시 굽지 않는다)
- 바꾸기: `setMesh`로 바꾼 그물(같은 id — 제자리 고치기 `vertices`도)은 새 기록이 그물마다 버퍼로 들어설 때 묶음에서 빠지고(그때까지 앞 기록은 묶음 자리를 그린다), `removeMesh`한 그물도 빠진다.
  묶음 안 빠진 그물이 ¼을 넘으면 남은 그물을 새 묶음으로 옮기고 옛 묶음을 지운다. 묶음 밖 묶을 수 있는 그물이 256개 이상 모이면 그것들로 새 묶음을 굽는다(그 아래면 그물마다 버퍼).
  문맥을 잃으면 묶음을 잊고 다시 올리며 다시 굽는다
- 고르기·후보·측정·범위는 CPU 자료라 그대로다

### 그림이 같은가

묶음 자리로 그물마다 그리는 길은 같은 정점·같은 색인 차례·같은 균일 변수라 어느 GPU에서나 0.51.0과 같다. 묶음 구간(MERGE 변종)은 같은 도형·차례·float 값이지만 행렬을 셰이더가
자리 자료로 만든다. `npm run bench:many -- --size d10k --variants head --open-only --mergediff`(서로 다른 배열 그물 1만, 960 × 600 — 같은 페이지·같은 카메라에서 끔으로 그려 읽고,
켜서 묶음을 다 구운 뒤 그려 읽어 견준다. M1 Pro 열은 사본 묶음 판 71ffc38 — 묶음 구간 그리기는 지금과 같은 길, 그 뒤로 기계 GPU 헤드리스는 띄우지 않는다):

| 모드 | SwiftShader 다른 화소 | M1 Pro(ANGLE Metal) 다른 화소(가장 큰 채널 차) | 묶음 구간 |
|---|---:|---:|---:|
| 음영 | 0 | 0 | 6 |
| 음영+윤곽 | 0 | 1 (8) | 12 |
| 음영+윤곽, 8배 확대 | 0 | 8 (31) | 112 |
| 와이어프레임 | 0 | 0 | 6 |
| 숨은 선 | 0 | 0 | 12 |
| 음영+윤곽+외곽선 | 0 | 0 | 18 |
| X-ray | 0 | 3 (3) | 6 |
| 단색 | 0 | 1 (8) | 12 |
| 음영+윤곽, 강조 넷 | 0 | 1 (8) | 16 |
| 음영+윤곽+주변 가림 | 0 | 1 (8) | 18 |
| 음영+윤곽+해 그림자(면은 그물마다·윤곽선만 묶음) | 0 | 1 (9) | 6 |

SwiftShader(화소 회귀 CI가 쓰는 소프트웨어 GPU)는 모든 모드에서 바이트까지 같다. 기계 GPU에서는 면만 그린 그림(음영)·선만 그린 그림(와이어프레임)은 같지만, 모서리 선이 면 위에서 깊이를
겨루는 그림에서 화소 몇 개(그림의 0.001% 안팎)가 다르다 — 셰이더가 자리 자료로 만든 행렬과 균일 행렬의 곱이 깊이 마지막 자리에서 다르다고 본다(0.51.0에서 되돌린 `u_m`과 같은 까닭,
그림자 경우는 면이 그물마다라 윤곽선 쪽 깊이만 바뀐 것). 0.42.0 인스턴싱도 같은 길이다. 그래서 묶어 그리기는 그물이 문턱(2,000) 이상인 장면만 저절로 켠다 —
그보다 작은 장면은 0.51.0과 바이트까지 같고, 큰 장면은 기계 GPU에서 이 몇 화소를 감수하고 GPU 자원·그리기 호출을 줄인다(그림을 0.51.0과 맞춰야 하면 `merging: false`).

### 단계 나누기·전후(M1 Pro, 1만 — 사본 묶음 판 71ffc38)

이 차수 앞쪽(그물 버퍼를 놓기 전, 묶음이 사본이던 판 71ffc38 — 묶음 구간 그리기는 지금과 같은 길, 정점 색 유무가 묶음 열쇠였다)에서 기계 GPU로 잰 값이다.
그 뒤 8만 장면 측정이 컴퓨터를 멈춰 이 차수에는 기계 GPU 헤드리스를 다시 띄우지 않았다(1만도 — 지금 판의 프레임은 아래 SwiftShader 표).
`npm run bench:many -- --base 972d344 --variants base,head,head-mergeall --size <크기> --parts --rounds 2 --modes shadedEdges,shaded,shadedEdges+zoom`
(960 × 600, 판을 번갈아 두 번 × 다섯 번 가운데값 ms, load average 33~78). head(끔)는 base와 같은 호출 수·흔들림 안의 시간이었다. 단계 몫은 그 종류 GL 호출을 비운 JS 차(0.51.0 표와 같은 셈):

| 장면 · 모드 | 그리기 호출 0.51.0 → 켬(묶음 구간) | 그리기 JS | GPU 마침까지 | GL 없는 JS | 그리기·uniform·묶기 몫 | uniform 호출 |
|---|---:|---:|---:|---:|---:|---:|
| 서로 다른 배열 1만(삼각형 136만) · 음영+윤곽 | 20,004 → 16 (12) | 24.9 → 13.2 | 60.9 → 20.7 | 10.2 → 12.6 | 9.3·12.2·8.5 → 0.3·0.4·0.3 | 41,448 → 38 |
| · 음영 | 10,004 → 10 (6) | 14.8 → 7.3 | 37.3 → 14.8 | 6.5 → 7.4 | 4.5·6.3·2.4 → 0 안팎(흔들림) | 31,443 → 22 |
| · 음영+윤곽, 8배 확대(9,118 잘라냄) | 1,768 → 86 (82) | 5.8 → 4.8 | 10.3 → 9.2 | 4.7 → 4.4 | 0.3·0.9·0.8 → 0·0.6·0.5 | 3,702 → 143 |
| 섞인 꼴 1만(반투명·정점 색·같은 정의 배열이 흩어짐) · 음영+윤곽 | 18,345 → 4,857 (3,846) | 29.5 → 14.5 | 56.8 → 22.0 | 8.9 → 10.9 | 13.4·17.1·17.0 → 0.7·3.0·1.3 | 45,237 → 19,660 |
| · 음영 | 9,177 → 2,183 (1,673) | 14.0 → 7.3 | 37.0 → 16.2 | 5.9 → 6.2 | 3.4·5.6·3.7 → 0 안팎(흔들림) | 36,139 → 10,384 |
| · 음영+윤곽, 8배 확대 | 1,631 → 492 (397) | 6.8 → 5.4 | 11.8 → 10.7 | 4.4 → 4.5 | 1.3·2.1·2.3 → 0.6·0.9·0.9 | 4,052 → 1,822 |

맞춘 화면은 GPU 마침까지가 2.3~2.9배 짧다 — 그리기 호출이 GPU 프로세스로 넘어가는 몫이 사라지고, 그리기 JS는 그물마다 보이기·겉모습 묻기·행렬 곱(GL 없는 JS — 자리 자료 쓰기만큼 조금 는다)만 남는다.
확대한 화면은 0.51.0 잘라내기가 이미 대부분을 줄여 차이가 작다. 섞인 꼴은 그때 정점 색이 있는 그물(열째마다)이 다른 묶음이라 장면 차례를 지키느라 구간이 짧았다(구간 3,846 —
그래도 GPU 마침 2.6배). 지금은 정점 색 쓰기를 자리 자료 깃발로 두어 한 묶음에 든다(가짜 WebGL로 셋째마다 정점 색인 1만이 그리기 20,004 → 14).

**모서리 선(윤곽선) 몫**(음영+윤곽 − 음영, JS · GPU 마침): 서로 다른 배열 1만 10.1 · 23.6 → 5.9 · 5.9 ms, 섞인 꼴 1만 15.5 · 19.8 → 7.2 · 5.8 ms.
윤곽선 그리기 호출은 그물마다 하나(1만) → 묶음마다 하나(6)다. 숨은 점선(숨은 선 모드·음영 뒤 모서리)도 같은 길이다(그림 같음은 위 표와 시험).

### GL 객체 수·버퍼 바이트(가짜 WebGL — 실제 GPU 없이)

가짜 WebGL(시험용 `tests/fakegl.ts` — 만든·지운 버퍼·VAO·무늬를 센다)로 서로 다른 상자 그물(셋째마다 정점 색, 윤곽선 있음) 1만·8만을 0.51.0(972d344)과 같은 셈으로 그렸다
(`.runtime` 하네스 — 처음 그림 → 돌리기·모드·외곽선·주변 가림·숨은 점선·확대 프레임 84개 → 1만은 묶어 그리기 끄고 켜기 세 번·30% 빼기·20% 바꾸기 → 끄기 → dispose):

| 장면 | GPU 버퍼 수 0.51.0 → 0.52.0 | VAO 수 | 버퍼 바이트(`stats.buffers` — 장면 자료 대비) | 그리기 호출(음영+윤곽) | 묶음 |
|---|---:|---:|---:|---:|---:|
| 서로 다른 그물 1만 | 33,341 → 37 | 30,005 → 20 | 5.44 → 6.87 MB(자료 5.44 MB의 1.26배) | 20,004 → 14 | 5 |
| 서로 다른 그물 8만 | 266,674 → 247 | 240,005 → 125 | 43.54 → 54.93 MB(1.26배) | 160,004 → 84 | 40 |

- 두 판 모두 프레임을 거듭해도 객체 수가 늘지 않는다(외곽선 첫 그림의 빈 VAO 하나뿐 — 누수 없음). 0.52.0에서 끄면 0.51.0과 같은 수로 돌아가고, dispose 뒤에는 둘 다 0이다.
  30% 빼기 뒤에도 묶음 1개(남은 그물로 다시 구움), 20% 바꾸기 뒤 묶음 2개(바꾼 그물로 새로 구움 — 옛 묶음과 장면 차례로 엇갈려 그리기 호출 4,006)
- 버퍼 바이트가 자료보다 26% 많은 것은 정점마다 그물 번호 2바이트·선분마다 4바이트와, 정점 색이 없는 그물 자리에도 잡는 색 버퍼(16바이트)다
- 자리 자료 그림(RGBA32F, 0.42.0 인스턴싱과 같은 그림)은 그리기마다 묶은 그물 하나에 면 192바이트·선 96바이트를 올린다(1만 음영+윤곽 2.9 MB, 8만 23 MB). 그림 높이는 두 배씩 자라고
  `stats.buffers`에 들지 않는다
- 굽기: 장면을 올리는 걸음 안에서 그물 2,048개마다(묶음 하나 17~28 ms — 사본 묶음 판 M1 Pro 값), 그 사이 그물마다 버퍼는 그 묶음 몫만 잠깐 있다.
  다시 굽기는 묶음 안 빠진 몫이 ¼을 넘을 때만 그 묶음 크기만큼이다. 겉모습(색·행렬·불투명도)·보이기·강조는 굽기 없이 프레임마다 든다

### SwiftShader 프레임(1만 — 지금 판)

`npm run bench:many -- --base 972d344 --variants base,head,head-off --size d10k --backend swiftshader --rounds 2 --reps 3`(서로 다른 배열 그물 1만, 960 × 600, 판을 번갈아 두 번,
가운데값 ms — 헤드리스 Chrome은 SwiftShader만, 띄운 Chrome 묶음 RSS 3 GB 지킴이, load average 9~30. head-off(묶어 그리기 끔)는 base와 같은 길이라 흔들림을 보는 짝이다):

| 모드 | 그리기 호출 0.51.0 → 0.52.0 | 그리기 JS | GPU 마침까지(head-off) |
|---|---:|---:|---:|
| 음영+윤곽 | 20,004 → 26 | 23.3 → 9.8 | 1,588 → 1,451 (1,967) |
| 음영 | 10,004 → 15 | 13.6 → 7.0 | 796 → 1,184 (1,073) |
| 음영+윤곽, 8배 확대 | 2,716 → 106 | 8.1 → 7.3 | 204 → 304 (313) |

SwiftShader는 CPU가 래스터하므로 GPU 마침까지는 래스터 몫이 대부분이고 판끼리 ±40% 흔들린다(같은 길인 base와 head-off가 796 · 1,073). 그리기 JS는 맞춘 화면에서 절반 아래로 준다.
묶음 변종은 정점마다 자리 자료 12텍셀을 읽어 SwiftShader 정점 셈이 늘 수 있다(음영 1,184 — 흔들림과 가리지 못했다). 처음 열기(나눠 올리기 100 ms): 첫 그림 177 → 177 ms,
다 올린 뒤 그림 끝 3,051 → 2,655 ms(굽기 합 835 ms를 올리는 걸음 안에서), GPU 버퍼 62.9 → 68.2 MB, 띄운 Chrome RSS 가장 큰 값 2,975 MB(0.51.0 판을 함께 연 Chrome).

### 새 API

- `setRenderOptions({ merging })`: `'auto'`(기본 — 묶을 수 있는 그물이 문턱 이상인 장면만)·`true`/`'on'`(늘)·`false`/`null`/`'off'`(끔 — 묶음 그물을 그물마다 버퍼로 되돌린다)·
  `{ mode, min }`(`min` = 'auto' 문턱). `renderOptions.merging` = `{ mode, min }`
- `stats.merged` = `{ active, draws, items, groups, meshes, bytes, pending, bakeMs }`: 이 장면에서 켜졌는지, 지난 그리기의 묶음 구간 그리기 호출 수·그렇게 그린 그물 수(면·선 차례마다),
  구운 묶음 수·묶음에 든 그물 수(그 그물은 그물마다 버퍼가 없다)·묶음 버퍼 바이트(`stats.buffers`에도 든다)·굽기를 기다리는 묶음 수·지금 장면에서 굽기에 쓴 ms
- 입구 상수 `MERGE_AUTO_MIN`(2,000)·`MERGE_MESH_VERTS`·`MERGE_MESH_SEGMENTS`, 타입 `MergingMode`·`MergingOptions`, 순수 `opencad-viewer3d/merge`(`mergePlan`·`mergeArrays`·`mergeBytes`·`mergeSrcBytes`),
  `opencad-viewer3d/shaders`의 `mergeShader`

### 바뀐 기본 동작

- 묶을 수 있는 작은 정적 그물이 2,000개 이상인 장면은 저절로 묶는다(`merging` 기본 `'auto'`): GPU 버퍼·VAO 수가 그물 수가 아니라 묶음 수만큼이 되고(`stats.buffers.count`·바이트가 바뀐다),
  `stats.drawCalls`가 크게 준다. SwiftShader 그림은 같고, 기계 GPU에서는 모서리 선이 면과 깊이를 겨루는 몇 화소가 0.51.0과 다를 수 있다(위 표). 0.51.0 길을 그대로 쓰려면 `merging: false`
- 그보다 작은 장면은 그리는 길·GL 호출·셰이더가 0.51.0과 같다(`stats.merged`가 늘었고 값은 0)

### 확인

- 시험 `tests/v0520merge.test.ts`(16개): 순수 계산(묶음 나누기 — 열쇠·그물 수·정점 수·바이트 한도·하나뿐인 묶음, 이은 배열 — 색인 옮기기·색인 없는 그물·정수 법선 4값·정점 색이 섞인 그물·
  윤곽선·그물 번호·정점 시작), `mergeShader` 글(원본 셰이더 글자 그대로, 바꿀 자리가 없으면 예외), 그리고 가짜 WebGL 그리기를 도형마다 펼친 기록(`tests/drawexpand.ts` — 정점마다 행렬로 옮긴
  클립·시점 좌표·법선·셰이더가 고르는 색, 선분 끝점·굵기·점선, 깊이만 그리는 프로그램과 켠 상태·깊이·색 쓰기·면 밀기·틀 버퍼·조각 셰이더 균일 변수)이 켬·끔에서 **같은 차례·같은 값**인지:
  모드 일곱, 외곽선(그물마다 색 포함)·안개+해·숨은 점선(숨은 선·음영 뒤 모서리)·강조·겉모습 색·불투명도·행렬·윤곽선 색·숨김·묶음 안 구간·화면 밖·주변 가림·평행 투영·화소 비율 2(굵은 선)·
  단면 하나·여럿·구간 단면·잘린 면 채우기(모두 묶음 자리로 그물마다)·그림자(면은 그물마다)·인스턴싱과 섞임, 그물 바꾸기·제자리 고치기·많이 빼기(남은 그물로 다시 굽기)·더하기, 문맥 잃음·되찾음,
  나눠 올리기, 놓은 법선, 'auto' 문턱, 켜면 버퍼 바이트가 그물 번호만큼만 늘고 끄면 끔과 같은 바이트·같은 그림, 고르기·후보·키보드 후보 돌리기(pickCycle)가 켬·끔 같은지,
  GPU 객체(그물 2,000 — 프레임을 거듭해도 늘지 않고, 굽기·빼기·바꾸기·끄고 켜기·문맥 복구·dispose마다 켠 뷰어 객체 수 = 끈 뷰어 − 묶은 그물의 그물마다 몫 + 묶음 몫, 끈 뷰어의 1/20 아래).
  일부러 자리 자료 색을 틀리게 하면 아홉 시험이 실패한다(펼친 기록이 그 차이를 잡는다)
- GL 객체 수·누수(가짜 WebGL 하네스 — 0.51.0과 같은 셈, 위 표): 1만·8만에서 두 판 모두 누수 없음
- 넓은 탐색(가짜 WebGL, 51차 머리 972d344와 행 단위로 견줌): 37차 넓은 탐색 사본 275,836자리와 38차 모서리 꼴 3,600경우 871,200자리 행 파일이 바이트까지 같다
- 미리 보기 비용(가짜 WebGL, 400자리 × 세 번, 972d344와 번갈아 세 짝): 고른 종류·후보 수·앱 호출이 같고 시간은 같은 범위다(load average 160~210이라 흔들림이 크다)
- 그림: 위 "그림이 같은가" 표(SwiftShader 모드 11개 다른 화소 0, M1 Pro는 깊이를 겨루는 몇 화소)
- 화소·값(`npm run pixels`, SwiftShader 960 × 600): 51차 머리 972d344와 장면 157개·값 묶음 119개가 모두 같고, 새 값 묶음은 `many-merging` 하나다
  ('many' 장면 그물 80개를 배열만 새로 만든 사본으로 올려 경우 여덟 × 확대 둘 — 켬·끔 다른 화소 모두 0, 묶음 하나에 80개, 음영+윤곽 그리기 호출 230 → 122·숨은 선 343 → 235,
  단면은 그물마다라 같은 수). 장면 사이 되돌리기를 `'auto'`로 둔 머리로 'many' 장면 10개·값 묶음 5개를 다시 견줘도 같다. v0.33.0과는 51차와 같은 차이다(다른 장면 16개·값 묶음 4개가 다른 화소 수까지 같음)

### 남은 한계

- 8만 그물은 크래시 위험이 있어 실제 GPU로 재지 않았다(가짜 WebGL 객체 수만). 기계 GPU 프레임 값은 사본 묶음 판(71ffc38)의 1만뿐이다
- 기계 GPU(Apple, ANGLE Metal)에서는 셰이더가 자리 자료로 만든 행렬의 곱이 균일 행렬과 깊이 마지막 자리가 달라 모서리 선이 면과 깊이를 겨루는 몇 화소가 0.51.0과 다르다(문턱 이상 장면).
  같은 모형 행렬(행렬·원점이 없는 그물 — 세계 좌표로 구운 장면)끼리는 균일 행렬 그대로 색만 자리 자료로 읽으면 같게 할 수 있지만, 그물마다 행렬이 다른 조립에는 쓸 수 없어 넣지 않았다
- 법선 꼴·한쪽 면이 섞여 흩어진 장면은 꼴마다 묶음이 나뉘어 장면 차례로 구간이 짧다. 다시 구운 묶음(바꾼 그물로 새로 구움)은 옛 묶음과 장면 차례로 엇갈려 구간이 짧아진다
  (20% 바꾸기 뒤 1만 그리기 4,006 — 이웃 묶음과 함께 다시 굽는 것이 다음 후보)
- 코어가 법선을 놓는(`release: { normals }`) 장면의 그물은 묶지 않아 그물마다 버퍼 그대로다(묶음 저장소가 그물 배열에서 다시 굽기 때문)
- 단면(하나·여럿)이 있으면 모두, 그림자를 쓰면 면은 그물마다(묶음 자리로)다(그물마다 로컬 평면·그림자 행렬 — 인스턴싱처럼 자리 자료에 더하면 모을 수 있다)
- 윤곽선이 없는 그물의 와이어프레임·숨은 선 삼각형 변(묶음 자리로 그물마다), 선분 묶음(`LineSet3d`)·점은 묶지 않는다. 강조 윤곽선(굵기 2)·윤곽선 구간이 있는 그물도 그물마다다
- 프레임마다 자리 자료를 다시 만들어 올린다(카메라가 움직이면 모든 행렬이 바뀐다 — 8만에 23 MB) — 맞춘 화면에 남는 JS는 그물마다 보이기·겉모습 묻기·행렬 곱이다(GL 없는 JS — 0.51.0과 같은 몫)

### 앱이 할 일

- STEP: 할 일 없음 — 서로 다른 부품이 2,000개 넘는 조립은 코어를 올리기만 하면 저절로 묶여 GPU 버퍼·VAO가 묶음 수만큼(8만 부품 50만 → 수백 개)이 되고 맞춘 화면의 그리기 호출이 준다
  (같은 부품 자리는 0.42.0 인스턴싱 그대로). 단면을 켜면 그물마다(묶음 자리로) 그린다. 기계 GPU로 찍는 앱 화소 회귀는 큰 조립에서 모서리 선이 면과 겨루는 몇 화소가 다를 수 있다(SwiftShader는 같다).
  `stats.drawCalls`·`stats.buffers`를 화면에 보이거나 시험에서 견주면 큰 조립에서 수가 크게 준다. 부품 분해(`setItemMatrix`)·숨기기·강조는 다시 굽지 않는다. 0.51.0 길이 필요하면 `merging: false`
- SKP: 할 일 없음 — 지금 해석기는 배치를 재질·태그 묶음으로 구워 합쳐 그물 수가 적어(문턱 아래) 0.51.0과 같다. 무늬가 있는 그물은 묶지 않고, 무늬 원본만 놓는 지금 놓기(`release: { textures }`)는
  묶기와 상관없다. 그물이 아주 많은 모형을 그물마다 두는 길로 바꾸면 무늬 없는 그물은 저절로 묶인다
- NC: 할 일 없음 — 공구 경로는 선분 묶음이라 묶지 않고, 공작물 그물은 몇 개뿐이라 0.51.0과 같다
- 세 앱 공통: `Viewer3dStats`에 `merged`가 늘었다. 그물이 2,000개 안쪽인 장면은 그림·GL 호출이 0.51.0과 같다

npm에 올리지 않고 GitHub 의존으로 씁니다. TypeScript 원본 그대로 내보내므로 Vite 같은 번들러와 `moduleResolution: "bundler"`가 필요합니다.

```json
"dependencies": {
  "opencad-viewer3d": "github:GyuTae-Kim/opencad-viewer3d#v0.33.0"
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
| `src/pointer.ts`, `src/claim.ts` | 포인터 종류별 문턱(끌기 시작·고르기 허용 거리·두 번 누르기, 터치만 넓게), 앱이 맡은 포인터 기록(0.32.0 — 맡은 차례·자리·알릴 곳, 둘째 손가락이면 돌려받을지) |
| `src/renderer.ts`, `src/shaders.ts`, `src/upload.ts` | WebGL2 그리기(묶음 원점 RTC, 단면 자르기·잘린 면 채우기, 무늬(올릴 때마다 그 올리기 시간을 알린다 — 뷰어가 다시 그리기를 모은다), 셰이더 변종 — 여러 단면·숨은 선·해·그림자·안개·뒷면, 외곽선(그물마다 색)·하늘 바탕·그림자 깊이 그림), 큰 배열 조각 올리기, 올린 뒤 성분 기억·놓기·문맥 복구 때 다시 받기와 올리는 중인지(되찾은 뒤 끝 알림), 작은 법선·무늬 좌표의 정점 속성 꼴·무늬 좌표 축척·이동, 살아 있는 GPU 버퍼의 성분별 바이트, 같은 그물 자리 모아 그리기(0.42.0 인스턴싱 — 같은 그물 열쇠·자리 자료 그림·셰이더 `INST` 변종·병렬 번역) |
| `src/attribs.ts` | 작은 정점 속성 배열 순수 계산(법선 Int8·Int16, 무늬 좌표 Int16·Uint16의 꼴 판정·정규화 값, 줄이기 도우미 `packNormals`·`packUvs` — 0.51.0 할당 없는 같은 셈, 길이는 `math.ts`의 `hypot3`) |
| `src/cull.ts` | 화면 밖 잘라내기 순수 계산(0.51.0 — 시야 옆 네 평면·여백, 그물 로컬 범위를 모형 행렬로 옮긴 상자, float32 어긋남 한도, 64개 덩어리 감싸기) |
| `src/merge.ts` | 서로 다른 작은 정적 그물 묶어 그리기 순수 계산(0.52.0 — 묶음 나누기·이은 배열·바이트 어림과 한도 상수. 굽기·그리기는 renderer.ts, MERGE 셰이더 글은 shaders.ts `mergeShader`) |
| `src/release.ts` | 놓기·문맥 복구 순수 계산(놓기 선택 정리, 지운 배열의 올린 꼴에서 다시 받을 것 고르기) |
| `src/pbr.ts` | PBR 그림 순수 계산(0.43.0 — 그물 PBR 필드 정리, 올라간 그림으로 셰이더가 쓸 것·변종 정의, 거칠기 → 반사광 지수) |
| `src/annotate.ts` | 앱 측정 덧그림 모양·글(거리·각·반지름·점), 측정 글의 소수 자릿수·수 꼴(0.31.0 — 뷰어 측정 글과 글 꼴의 둘째 인자가 쓴다) |
| `src/closest.ts` | 두 묶음 최근접점(BVH 둘을 함께 내려가며, 점·선분·삼각형 쌍 — 0.41.0부터 이어 돌릴 수 있는 찾기 상태 `ClosestSearch`와 시간 조각으로 나눠 돌리기, 0.45.0 묶음 안 구간 모양 `closestPart`) |
| `src/billboard.ts` | 마주 보는 그물 돌림·범위 |
| `src/texture.ts` | 무늬 도구(그림 머리 읽기, 크기 한도·예산 나누기, 뒤집어 풀기) |
| `src/camera.ts`, `src/viewcube.ts` | 카메라·표준 뷰·뷰 큐브(0.44.0 누르는 자리 폭 `cubeTargets`·손가락 큐브 띠) |
| `src/bvh.ts`, `src/pick.ts`, `src/scenepick.ts`, `src/bounds.ts`, `src/extent.ts`, `src/segments.ts` | 고르기 가속 구조·고르기(묶음·장면 — 반투명 그물 너머 고르기와 그물마다 고르기 불투명, 그물 일부 면만 지나가기 포함)·커서 둘레 선분·삼각형 모으기(0.33.0부터 꼭짓점이 눈 뒤인 삼각형은 가까운 면으로 잘라)·범위(축 나란 상자, 0.30.0부터 임의 방향 꼭짓점 지지 범위 — 0.31.0부터 작은 모듈 `extent`, `bounds`가 다시 내보낸다), 원본 번호로 강조 선분 모으기 |
| `src/snap.ts`, `src/inference.ts`, `src/track.ts`, `src/snapindex.ts` | 측정 점 붙잡기 고르기(고르기가 붙잡은 점·앱 점·추론 점 가운데)와 측정 결과, 붙잡은 점이 놓인 선분 식별자, 앱이 다듬을 점 고르기와 받을지 판정, 추론 붙잡기(교차점·수직 발·축·나란함)와 방향 잠금(선분 방향·앱이 정한 방향 포함), 끌어온 축(머무르기·끌어온 점 목록·축 붙잡기·축끼리와 선분의 교차), 축·잠근 선과 선분·면의 교차, 축·잠근 선과 꺾은선 토막의 열린 교차(활꼴을 두 번 지나는 둘째 힌트, 토막 범위인 선 조각으로 거르기, 0.35.0부터 아주 가까이 본 활꼴 쪽 커서), 축·잠근 선과 삼각형의 열린 교차(오목하게 보이는 곡면의 제 조각 가림, 한 삼각형 위 두 교차의 둘째 힌트 — 0.35.0부터 같은 평면 칸으로도, 0.34.0부터 아주 가까이 본 커서 아래 칸), 잠근 선과 끌어온 축의 교차, 붙잡지 않은 면 위 점 다듬기 받기, 끌어온 점에서 기준 선분과 나란함·수직 방향(0.27.0부터 뷰어 측정 붙잡기도 — 0.28.0부터 앱이 기준 선분을 거른다)과 그 선이 다른 직선·선분·면과 만나는 점(0.28.0 순수, 0.29.0부터 뷰어도)·두 끌어온 점의 그 선끼리 만나는 점(0.30.0)·그 선이 꺾은선 토막의 활꼴만 지나는 열린 교차(0.31.0 — 뷰어), 켠 선이 꺾은선 꼭짓점을 반 화소 안으로 지나는 자리의 다듬은 교차(0.33.0 `refineEnds`), 앱 점 색인(차례 한도) |
| `src/measurelabel.ts` | 측정 거리 글상자·앱 측정 덧그림 글상자 자리 순수 계산(기본 자리 — 앱이 정할 수도, 이름 자리 고르기, 앱 영역·커서를 비켜 갈 자리 차례, 기본 자리가 막히면 예전 차례로 고르기, 먼저 놓인 글상자 비키기, 측정 점 표식을 덮는 자리도 옮기기, 겹침 판정) |
| `src/walk.ts` | 걷기 중력·부딪힘(세계 광선 맞음, 한 걸음) |
| `src/keysnap.ts` | 키보드 붙잡기 순수 계산(0.46.0 — 기본 키 표·키 글 풀기·키 사건 → 할 일, 가상 커서 걸음, 붙잡은 종류·키 안내·후보 알림 글, 같은 자리 후보 빼기) |
| `src/motion.ts` | 카메라 움직임 설정 순수 계산(0.48.0 — 설정 읽기, 설정과 움직임 줄이기 선호로 움직일지, `prefers-reduced-motion` 질의 듣기·풀기, 0.49.0 `flyTo` 길이 읽기) |
| `src/ranges.ts` | 묶음 안 구간 순수 계산(합치기·숨김/강조 나누기·판정·색인 모으기, 0.44.0 구간 단면 갈래 — 평면 비트로 더 나누기·번호 → 비트) |
| `src/section.ts` | 단면 순수 계산(평면·범위 안 위치·교선·광선/선분 자르기·화면 끌기) |
| `src/ao.ts` | 주변 가림 순수 계산(0.49.0 — 선택 → 가림 거리·세기, 반 해상도 크기, 표본 수·한도 상수 — 셰이더는 `src/shaders.ts`의 `AO_*`, 0.50.0 움직이는 동안 'off'·'low') |
| `src/sceneissues.ts` | 장면 입력 검사 순수 계산(0.50.0 — 깨진 값 알림 `SceneIssue`·`checkScene`, 깨진 삼각형·선분을 빼고 그리는 색인·선분 사본 `triangleFix`·`segmentFix`, 좌표 한도는 `src/bounds.ts`의 `COORD_LIMIT`) |
| `src/grid.ts`, `src/marker.ts`, `src/theme.ts`, `src/math.ts`, `src/playback.ts` | 격자·표식·색(캔버스 초점 테두리 포함)·행렬·재생 도우미 |
| `src/synth.ts`, `src/dev.ts`, `dev/viewer3d.html` | 합성 장면(무늬 상자·원근 무늬 판, 작은 배열 판 포함)과 개발 확인 페이지 |
| `scripts/pixels/` | 화소·값 회귀 비교(`npm run pixels`): 비교 페이지·장면 목록, git 판 소스 묶기, 헤드리스 Chrome, PNG·차이, 높이 격자 그물(`grid.ts`), 같은 그물 자리가 많은 장면(`many.ts` — 0.42.0), PBR 그림 장면(`pbr.ts` — 0.43.0 법선·금속 거칠기·매끈함 그림 BMP와 판·구) |
| `scripts/bench/` | 그물 바꾸기 비용 재기(`npm run bench:edit`): `setScene` 장면 전체·`setMesh` 그물 전체·`vertices` 구간, SwiftShader와 기계 GPU. 같은 그물 자리 많은 장면 비용(`npm run bench:many` — 0.42.0: base·head 처음 열기·프레임 JS·GPU 마침·그리기·GL 호출 수) |
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
                   #   0.30.0 안내 선끼리(inference.trackDirs { edge, meets: { guides: true } } — 두 끌어온 점의 나란함·수직 선끼리 만나는 점,
                   #     상태 줄 "(…)에서 모서리와 나란함 · (…)에서 수직인 선과 만나는 점"),
                   #     처음 올리기 재기(&tex=1 — 같은 그림을 새 무늬 id로 다시 올려 상태 줄에 다 보이기까지의 시간과 그사이 그린 화면 수)
                   #   0.31.0 안내 선 열린 교차(시연 원과 inference.trackDirs { edge, meets: { guides, open } } — 끌어온 점의 안내 선이 원 토막의 활꼴만 지나는 자리를 정확한 원 위로,
                   #     상태 줄 "(…)에서 모서리와 나란함 · 시연 원#…과 만나는 점(다듬음)"), 글 꼴 번역(setMeasureFormat의 둘째 인자로 이름표만 "Distance"),
                   #     점 표식 비키기(setMeasureLabelAvoid({ points: true }) — 첫 점을 찍고 그 왼쪽 아래를 가리키면 기본 자리가 첫 점 표식을 덮던 자리)
                   #   0.32.0 부품 끌기(setPointerClaim — 작은 상자·구를 끌기 시작하면 앱이 포인터를 맡아 그 부품을 옮긴다, 그냥 누르기는 고르기, 빈 곳 끌기는 궤도,
                   #     끄는 중 둘째 손가락이면 앞 자리로 돌아가고 두 손가락 이동·핀치 — 상태 줄 "부품 끌기 끝: … (up·pinch)"),
                   #     분해(행렬 한꺼번에 — setItemMatrices로 모든 그물을 바깥으로, 상태 줄에 건 수·시간),
                   #     안내 선 면 열린 교차(inference.trackDirs { meets: { openFaces } } — 끌어온 점의 안내 선이 구 그물을 비켜 가며 곡면만 뚫는 자리를 정확한 구 위로)
npm run typecheck
npm test
npm run pixels -- --base origin/main   # 화소·값 회귀 비교(아래)
npm run bench:edit -- --reps 5         # 그물 바꾸기 비용(0.11.0 비용 표): 선분 30만 + 격자 1024², SwiftShader와 기계 GPU(--backend swiftshader|gpu|both)
npm run bench:many -- --base origin/main   # 같은 그물 자리 많은 장면(0.42.0 비용 표): 정의 12 × 자리 3,000, base·head·head 인스턴싱 끔(--variants),
                                           #   --rounds N(판을 번갈아), --cpu 4(CPU 느리게), --size small, --backend swiftshader|gpu|both,
                                           #   0.43.0: --pbr(무늬 정의에 법선·금속 거칠기 그림 — 판 head-nopbr = PBR 끔), --modes에 +section·+shadows
                                           #   0.49.0: --modes에 +ao(주변 가림), 꼬리 여럿 잇기(예 shadedEdges+profiles+ao)
                                           #   0.51.0: --size d10k·m10k·s10k·d80k·m80k·s80k(자리 1만·8만 — 서로 다른 배열·짝수 자리만 같은 배열·모두 같은 배열),
                                           #   --modes에 +zoom(8배 확대 — 화면 밖 잘라내기), 판 head-nocull, --parts(프레임 비용 나누기 — GL 호출 종류별 수와 그 종류를
                                           #   비운 JS 몫·GL 없는 JS·뷰어 몫·고르기), --profile(CPU 프로필 — 함수별 자기 시간 위 20)
                                           #   0.52.0: 판 head-merge(묶어 그리기 늘 켬)·head-off(끔 — head는 기본 'auto'), --mergediff(같은 페이지에서 끔·켬 그림의 다른 화소 수),
                                           #   --size v10k·v80k(서로 다른 배열에 반투명·정점 색·같은 정의 배열이 흩어진 꼴). 기본 백엔드는 SwiftShader만
                                           #   (기계 GPU는 OPENCAD_BENCH_GPU=1일 때만 — 그물이 아주 많은 장면은 컴퓨터를 멈출 수 있다), 판을 바꿀 때 문맥을 놓고,
                                           #   띄운 Chrome 묶음 RSS가 3 GB(CHROME_RSS_LIMIT_MB — 화소 비교도)를 넘으면 그 Chrome을 끄고 실패
```

### 화소·값 회귀 비교

`npm run pixels -- --base <git 판>`은 같은 기계에서 base 판과 지금 작업 트리(커밋 안 한 변경 포함)를 헤드리스 Chrome으로 똑같이 찍어 비교합니다.
Chrome이 있어야 하고(못 찾으면 `CHROME_PATH`로 알려 줍니다), WebGL은 SwiftShader(CPU)로 그려 같은 기계에서는 같은 화소가 나옵니다.

- 합성 장면 157가지(0.44.0)를 960×600으로 찍어 RGBA 해시를 비교합니다. 그리기 모드 일곱 가지와 밝은 테마, 숨은 점선, 외곽선, 단면, 평행 투영,
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
  0.30.0 장면 `cross-measure-track-dir-guides`는 끌어온 점 둘(구멍 점 자리 (90, 50, 40)이 앞, (30, 30, 40))을 주고 엇갈린 선분 0을 지난 뒤 앞 점의 나란한 선과 다른 점의 수직인 선이
  만나는 자리를 가리킨 그림(두 점에서 추론 색 쇄선, 추론 색 ×), 값 묶음 `cross-measure-track-dir-guides`는 `{ meets: true }`·`{ meets: { guides: true } }`마다 두 구석, 그 뒤 안내 선 위,
  첫 점 뒤 같은 구석·잠금 단추·두 점째로 찍은 값(`trackGuide`)입니다. 0.29.0에 없는 선택이라 새 장면·값입니다.
  0.30.0에 바꾼 처음 올릴 때 무늬 다시 그리기는 다 올린 뒤 찍으므로 `tex-*` 장면이 0.29.0과 같아야 합니다.
  0.31.0 값 묶음 `base-measure-format-core`는 상자 윗면 앞 구석을 첫 점으로 찍고 가까운 네 점을 가리킨 미리 보기마다 글 꼴 없이·`(m, c) => c.lines`의 글상자 자리가 같은지와 화면 덧그림·그림 저장의
  다른 화소 수(0), 받은 기본 꼴, 이름표만 옮긴 글 꼴의 글상자 자리, 거리 덧그림에서 받은 것입니다(화면 덧그림 캔버스는 처음 몇 번 읽을 때 Chrome이 CPU 그리기로 바꿔 글자 가장자리 화소가 달라지므로
  먼저 여러 번 읽은 뒤 잽니다). 장면 `arc-measure-track-dir-open`은 끌어온 점 (80, 14, 60)에서 상자 윗면 앞모서리로 내린 수직인 선이 원판 원의 0° 자리(현에서 0.68 mm 바깥)에서 원판 평면을 뚫는 자리를
  가리킨 그림(정확한 원 위 점에 추론 색 ×), 값 묶음 `arc-measure-track-dir-open`은 `{ meets: { open: true } }`·`{ meets: true }`·`{ open: false }`·`refine` 없이·`null`마다 지나간 기준, 두 자리 미리 보기,
  앱 호출 수(둘째 자리는 기억이라 0번)와 넘긴 선의 축 이름, 첫 점 뒤 같은 자리와 두 점째 거리(정확한 값과 1e-9 안인지)입니다. 장면 `base-measure-label-points-aim`(화면 덧그림)은 정밀 조준에서 기본 자리가
  첫 점 표식을 덮던 자리를 `points`로 비킨 그림, 값 묶음 `base-measure-label-points`는 12자리 × 마우스·펜마다 피할 것 없이·`points`만·정밀 조준·정밀 조준과 `points`의 글상자 자리와 표식을 덮는지,
  옮긴 자리가 모두 비키는지, 덮지 않던 자리는 그대로인지, 그림 저장 화소가 같은지입니다. 모두 0.30.0에 없는 선택이라 새 장면·값입니다.
  0.32.0 값 묶음 `base-pointer-gestures`는 캔버스 가운데 둘레의 몸짓 차례(마우스 궤도, 구석 누르기 뒤 누르기·두 번 누르기, 오른쪽 이동, Shift+가운데 궤도, 가운데 두 번, 손가락 누르기·궤도·핀치·셋째 손가락,
  끄는 중 취소, 펜 궤도, 측정 두 점)의 단계마다 카메라·누르기 알림 수·측정 알림 수와 알림 값, `base-pointer-declined`는 같은 몸짓을 늘 `false`인 `setPointerClaim` 처리기로 한 값(그 API가 없는 판은 처리기 없이 —
  0.31.0 처리기 없는 값과 같아야 한다)입니다. `base-pointer-claim`(새 값)은 누른 순간에 맡은 마우스 끌기, 상자 위 끌기 시작에서만 맡기(그냥 누르기는 고르기, 빈 곳 끌기는 궤도), 앱이 맡은 손가락에 둘째 손가락
  (돌려받은 핀치가 그 자리에서 두 손가락을 누른 카메라와 같은지), `claimPointer`(합성 `pointercancel`과 같은지)와 물음 꼴입니다. 장면 `base-item-matrices`(해 그림자)·`base-item-matrices-section`(단면)과
  값 묶음 `base-item-matrices`(화면 격자 고르기·전체 보기·묶음 보기·최근접점·`itemLook`·측정 두 점)는 `setItemMatrices`가 있는 판은 한 번에, 없는 판은 `setItemMatrix`를 하나씩 건다 — 두 판이 같아야 합니다.
  0.33.0 `apex` 자료는 반지름 25 원호 33토막과 급속 이동 선분뿐인 NC 23차 재현(첫 점 X축이 원호 꼭대기를 스친다)입니다. 값 묶음 `apex-measure-ends-off`는 `refineEnds` 없이 확대 12단 × 두 근의 미리 보기(앱 `null`도 — 두 판이 같아야 합니다),
  장면·값 `apex-measure-ends`(새 장면)는 켠 미리 보기·끈 것과 다른 자리가 모두 원 위 다듬은 교차인지·앱 호출 수·잠근 X축·두 점째 거리입니다. 장면 `base-measure-label-points-image`(새 장면)는
  그림 저장의 거리 글상자가 첫 점 표식을 비킨 자리, 값 묶음 `base-measure-label-snapshot`(새 값)은 표식 둘레 자리마다 `points`만이면 그림 저장 화소가 피할 것 없이와 같고 `snapshotPoints`를 켜면
  화면 글상자를 옮긴 자리에서만 달라지는지입니다. 장면·값 `base-item-looks`는 같은 겉모습 목록을 `setItemLooks`가 있는 판은 한 번에, 없는 판은 하나씩 건다 — 두 판이 같아야 합니다.
  0.34.0 `hole` 자료는 반투명 판에 세운 구멍(반지름 5·20토막 원기둥 고체)·누운 구멍(반지름 4·16토막)과 판 윗면의 기운 기준 선분뿐인 NC 35차 재현입니다. 장면·값 `hole-measure-near`(새 장면 —
  0.33.0은 판 기능 확인에서 건너뛴다)는 구멍 안 거리 0.5·1·2에서 끌어온 점 안내 선이 벽 활꼴을 지나거나 칸을 뚫는 두 교차 둘레를 가리킨 미리 보기(원기둥 위인지 포함),
  값 묶음 `hole-measure-normal`은 같은 자리를 맞춰 보기·위 30·등각 60·옆 15에서 가리킨 것입니다 — 0.35.0까지는 0.34.0 규칙이 닿지 않아 0.33.0과 같았고,
  0.36.0부터 칸을 얕게 뚫는 3자리가 원기둥 위 교차로 바뀝니다(0.36.0 README). 0.36.0 장면·값 `hole-measure-mid`(새 장면)는 거리 3·4·8에서 활꼴·칸을 뚫는 두 교차 둘레와
  누운 구멍 옆면 칸을 따라가는 안내 선(거리 1·3)의 미리 보기입니다.
  0.35.0 값 묶음 `ring12-measure-lens`(`ring12` 자료 — 12토막 원)는 원의 활꼴을 지나는 첫 점 X축을 확대 0.02·0.04·0.1로 위에서 본 두 교차 둘레, `lowcyl-measure-twice`(`lowcyl` 자료 —
  낮은 원기둥 50토막)는 높이 5·30·55의 첫 점 X축이 한 칸을 스치는 두 교차 둘레입니다. 둘 다 0.34.0까지 없는 동작이라 판 기능 확인에서 건너뛰는 새 값입니다.
  0.37.0 장면·값 `lowcyl-measure-shallow`는 낮은 원기둥 칸 0의 현과 나란히 칸 반각의 4.4배로 스치는 첫 점 X축이 이웃 칸을 얕게 뚫는 두 근 둘레(높이 5·21, 거리 15·40)의
  미리 보기이고, `lying12` 자료(반투명 판의 누운 작은 구멍 — 반지름 2.5·길이 12·12토막)의 값 묶음 `lying12-measure-cell`은 꼭대기 아래 0.15를 지나 기준과 나란한 안내 선의
  두 근 둘레를 구멍 안 거리 1~4에서 본 미리 보기입니다. 둘 다 0.36.0까지 없는 동작이라 판 기능 확인에서 건너뛰는 새 장면·값입니다.
  0.38.0 `ring50` 자료(50토막 원 꺾은선 — 반지름 30)의 장면·값 `ring50-measure-chord`는 첫 점 X축·잠근 X축이 이웃 토막 현을 칸 반각의 4.4배로 얕게 가로지르는
  두 근 둘레(거리 15·40) 미리 보기, 장면 `base-measure-tangent`는 첫 점을 찍은 뒤에만 주는 앱 접점(`'tangent'`) 표식, 값 `base-measure-points-first`는
  첫 점에 따라 달라지는 `pointsFor`로 미리 보고 같은 자리를 누른 결과·부른 횟수(`pointsForFirst` 켬·끔)입니다. 셋 다 0.37.0까지 없는 동작·API라 건너뛰는 새 장면·값입니다.
  0.39.0 장면·값 `ring50-measure-exact`는 `refineSnapToExact`를 켜고 첫 점 X축·잠근 X축이 현과 만나는 X 쪽을 가리킨 그림과 두 X 둘레(거리 15·40) 미리 보기,
  값 `lowcyl-measure-exact`는 낮은 원기둥 칸을 얕게 뚫는 첫 점 X축(높이 5·21)의 두 X 둘레 미리 보기입니다. 0.38.0까지 없는 선택이라 건너뛰는 새 장면·값입니다.
  0.40.0 값 `ring12-measure-lens-far`는 `openEdgeLens`를 켜고 12토막 원 꼭대기 활꼴을 지나는 첫 점 X축(확대 0.005·0.01·0.02, 잠근 X축 0.01)과 45°–75° 토막 현을 가로지르는
  첫 점 X축 y = 25(확대 0.02·0.05)의 근 둘레 미리 보기(0.39.0까지 없는 동작이라 건너뛰는 새 값), `ring12-measure-lens-off`는 같은 자리를 `openEdgeLens: false`로 본 것입니다 —
  그 선택이 없는 판(0.35.0~0.39.0)과 같아야 합니다.
  0.41.0 값 `base-measure-priority`는 `pointsFor` 앱 점(고른 점을 4 단위로 반올림한 점·묶음 앞 중심)과 늘 후보인 점 둘에 우선(없음·`'normal'`·`'low'`·`'fallback'`)을 달아
  가운데 점·교차점·수직 발·축 방향과 함께 격자 미리 보기·누르기를 남긴 것입니다(0.40.0까지 없는 API라 건너뛰는 새 값 — 없음과 `'normal'`은 같은 값이어야 합니다).
  0.42.0 `many`·`many-off` 자료(`scripts/pixels/many.ts` — 닫힌 원기둥 정의 12개를 자리 120곳에 같은 배열로 놓고 셋째 정의마다 바둑판 무늬, `many-off`는 묶음 원점 1e6대)의 장면 `many-*` 10개는
  음영·음영+윤곽·겉모습 섞기(강조·자리 색·반투명·분해·숨긴 모듈·숨긴 구간)·와이어프레임+외곽선·숨은 선 점선·해+안개·그림자·X-ray·단면·큰 좌표입니다. 옛 판은 그물마다 그리므로
  base ↔ head가 인스턴싱 끔 ↔ 켬입니다 — 면은 같아야 하고, 반투명 모서리 선이 다른 정의 자리끼리 겹친 화소만 다를 수 있습니다(0.42.0 README "바뀐 기본 동작").
  값 `many-picks`·`many-off-picks`는 고르기(두 판 같음), `many-instancing`은 head 안에서 켬·끔·하한의 그리기 호출·삼각형·선분 수와 그림 해시·다른 화소 수입니다(0.41.0까지 없는 선택이라 새 값).
  찍기 전에 인스턴싱 변종 번역을 기다립니다(`stats.instanced.pending`).
  0.43.0 `pbr` 자료(`scripts/pixels/pbr.ts` — 법선 그림 판, 바둑판 + 법선 + 금속 거칠기 그림 판, 법선 그림을 단 금속 구, 매끈함 그림 + DirectX 꼴 법선 그림 구)의 장면은
  PBR을 켠 `pbr-light-a`(고정 조명)·`pbr-light-b`(왼쪽 앞 해 — 빛 방향 둘)·`pbr-sun-shadows`·`pbr-top`·`pbr-xray`(0.42.0까지 없는 선택이라 새 장면)와
  끈 `pbr-off`·`pbr-off-sun`·무늬 없음 모드 `pbr-noTexture`(옛 판과 바이트까지 같아야 한다)입니다. 값 `pbr-values`는 나중에 주는 PBR 그림 셋을 하나씩 받는 동안의 기다림·그림과
  다 받은 그림이 처음부터 준 장면과 같은지, 끔·켬, 같은 PBR 판 12자리의 인스턴싱 켬·끔 그림, DirectX 꼴 그림 + `normalFlipY`와 OpenGL 꼴 그림의 차이이고,
  `many-instancing-43`은 그림자·단면 하나를 켠 자리 많은 장면의 인스턴싱 켬·끔 그림과 그리기 수입니다(둘 다 0.43.0 판만).
  0.44.0 `secrange` 자료(`scripts/pixels/secrange.ts` — 판 위 그룹 A·B 상자를 한 그물로 합친 판재와 기준선 둘)의 `secrange-shadedEdges`는 B 구간(삼각형·윤곽선)과
  B 위 기준선만 자른 그림, 값 `secrange-values`는 같은 모양을 묶음으로 나눈 장면 + 묶음 단면과의 다른 화소 수·화면 격자 고르기·그리기 호출(평면 하나·모형 전체 평면을 더한 둘·숨은 선)이고,
  `base-cube-touch`는 손가락으로 누른 뒤 편 뷰 큐브 캔버스입니다(모두 0.44.0 판만).
  0.45.0 값 `secrange-snap-values`는 같은 `secrange` 자료에서 앱 붙잡기 점(합친 쪽은 묶음 id + `raw`, 나눈 쪽은 묶음 id만 — B의 잘린 쪽·남는 쪽, A·판 윗면, 기준선 둘)을 두고
  화면 격자·앱 점 자리의 측정 미리 보기와 `project` 보이는지가 두 장면에서 같은지와 합친 쪽 값입니다(0.45.0 판만 — 새 장면 없이 값 묶음 하나)
  0.46.0 값 `keysnap-values`는 `base` 자료에서 0.41.0 우선 묶음과 같은 붙잡기 선택으로 화면 격자 90자리의 마우스 미리 보기 = 측정 후보 목록 첫째인지·목록·목록을 구해도 미리 보기가 그대로인지,
  가상 커서(`handleKey`에 `KeyboardEvent`)로 켜기·걸음·Tab 한 바퀴 = 목록 차례·Enter 찍기 = `commitMeasureCandidate`·알림 글, 커서 표식이 화면 덧그림에만 있는지(그림 저장은 같은 자리 마우스와 같다)입니다
  (0.46.0 판만 — 새 장면 없이 값 묶음 하나).
  0.48.0 값 `theme-contrast-motion-values`는 `base` 자료를 두 테마·음영+윤곽 모드로 '상자'를 강조해 그림 저장한 뒤 바탕(가장 흔한 색)과 왼쪽 아래 좌표축 X·Y·Z 화소의 가장 큰 대비,
  강조로 바뀐 화소(주황 쪽 수·3:1 이상 수)와 그 판 테마 강조색 화소(고른 그물 윤곽선)의 평균 대비, 실제 Chrome `matchMedia`로 켠 `'auto'`·`flyTo`가 움직임으로 시작하는지·`setAnimate(false)`가
  끝 자리로 마치는지입니다(새 장면 없이 값 묶음 하나 — 움직임 값은 0.48.0 판만).
  0.49.0 값 `ao-flyto-end-values`는 `secrange` 자료(판 위 상자 둘)를 두 테마·음영+윤곽 모드로 주변 가림 끔·기본·세기 2로 그림 저장해 견준 바뀐 화소·밝아진 화소·바탕 화소·알파·밝기 비(켬/끔)의
  평균·가장 작은 값과 다시 끈 그림이 처음과 같은지, 모드마다(음영·단색·와이어프레임·X-ray·숨은 선)·평행 투영·두 배 그림 저장·투명 바탕·단면 채우기의 바뀐 화소, 실제 Chrome 프레임으로
  같은 프레임 두 번 `flyTo`(0.15초)의 끝 알림 두 값·지난 시간·끝 자리·`fit(false)` 값입니다(새 장면 없이 값 묶음 하나 — 0.49.0 판만).
  0.51.0 값 `many-culling`은 `many` 자료를 돌려 8배 가까이 확대한 여덟 경우의 화면 밖 잘라내기 켬·끔 다른 화소와 잘라낸 그물·그리기 수, 0.52.0 값 `many-merging`은 같은 자료를
  배열만 새로 만든 사본(서로 다른 그물 — 묶음 대상)으로 다시 올려 여덟 경우(음영+윤곽·겉모습·와이어프레임+외곽선·숨은 선+점선·X-ray·단면 채우기·주변 가림+그림자·안개+평행 투영+외곽선)
  × 맞춤·5배 확대의 묶어 그리기 끔·켬 다른 화소(SwiftShader에서 0)와 그리기·묶음 수입니다(새 장면 없이 값 묶음 하나씩 — 그 선택이 있는 판만)
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

- 단면 평면은 여섯 개까지(셰이더 균일 배열). 여러 평면은 교집합만(합집합 단면 없음). 묶음 안 구간 단면(0.44.0)이 있는 동안은 모든 그물을 그물마다 그린다
  (인스턴싱 꺼짐 — 여러 단면 길. 0.45.0 절에 같은 평면 모음끼리 세계 평면으로 모으는 설계를 적었다). 앱 붙잡기 점·`project`는 기본 도형 번호(`raw`)를 줄 때만 구간 단면을 따른다
  (주지 않은 점은 묶음 통째 평면만 — 0.45.0). 구간의 잘린 면 채우기는 그 구간이 닫힌 입체일 때만 맞다
- 뷰 큐브: 손가락은 두 번 누른다(펴기 → 고르기, 0.44.0). 표준 뷰가 아닌 비스듬한 뷰의 기운 면 자리는 편 큐브에서도 24 CSS px보다 좁을 수 있고, 화면 읽기 프로그램으로 큐브를 쓰는 길은 없다
  (키보드는 표준 뷰 키 1~7)
- 카메라 움직임 설정(0.48.0 `animate: 'auto'`·`setAnimate`)은 코어가 날리는 카메라만 따른다 — 앱이 제 고리로 옮기는 카메라는 앱이 `flyTo`로 바꾸거나 읽기 `animate`로 맞춘다.
  움직임 곡선은 하나이고, 코어 자신의 길(뷰 큐브·키·`fit` 등)의 길이는 0.32초 그대로다(0.49.0 길이 선택은 `flyTo`만). 탭이 숨거나 문맥을 잃으면 옮기던 움직임은 끝 자리로 마친다(0.50.0 — 숨은 탭에서 움직임을 보여 주는 길은 없다)
- 어두운 테마 강조색과 측정색·공구 표시색, 밝은 테마 측정색과 공구 표시색은 같은 계열·가까운 밝기라 적록 색맹 모의 차가 작다(0.49.0은 밝은 테마 강조색만 가름 — 앱은 덮는 길로 다른 색을 쓴다).
  좌표축 글자 X·Y·Z는 그래픽 대비 3:1만 맞춘다(글 4.5:1 아님)
- 키보드로 3D 붙잡기·고르기(0.46.0 `setKeyboardSnap`)는 화면 자리 가상 커서다 — 축을 따라 세계 거리만큼 옮기기·좌표 입력, 끌어온 축 머무르기는 없다
  (앱이 `setMeasureTrackPoints`로 준다). 커서는 늘 캔버스 가운데에서 켜고, 카메라를 바꾸면 다음 키에서 후보를 다시 구한다. aria-live 영역은 앱 몫이다.
  측정 후보에서 한 자리의 둘째 선 추론은 돌리지 않는다. 고르기 후보 돌리기(0.47.0)는 기본 도형 단위이고(묶음·B-rep 면으로 묶는 것은 앱 몫), 그물 면 후보는 화면에 표시하지 않는다.
  알림 글 틀(0.47.0 `messages`)은 문장 틀만이다(복수형 같은 언어 규칙은 앱이 값으로)
- 그림자는 보이는 범위 전체를 감싸는 깊이 그림 한 장(계단식 그림자 아님)이라 아주 넓은 장면에서는 그늘이 거칠다(`shadows.size`로 키운다). 반투명 그물은 그림자를 드리우지 않는다
- 외곽선은 화면 공간 깊이 차이라 화소보다 얇은 틈·면 안쪽 접힘선은 잡지 않는다. 맨 앞 깊이 그림 하나라 와이어프레임에서도 앞 그물에 가린
  뒤 그물의 외곽선은 끊긴다. 그물마다 색은 줄 수 있지만 한 그물 안에서 부분마다(면·재질마다) 다른 색은 없다. 안개는 격자·덧그림에 하지 않는다
- 선 색 대비(`'contrast'`)는 한 색 바탕만 본다(하늘·땅 기울기 바탕, 선 뒤의 다른 면 색은 보지 않는다)
- 걷기 부딪힘은 눈·무릎 높이 광선 둘이라 그 사이 높이의 가는 막대·난간 살은 지나가고, 머리 위 천장은 따지지 않는다. 중력은 바로 내려앉는다(떨어지는 시간 없음).
  마주 보는 그물은 Z축 둘레만(axis 'z')
- 추론 붙잡기는 선분끼리의 3D 교차, 선분 위 수직 발, 첫 점을 지나는 세계 X·Y·Z 축 방향과 지나간 선분과 나란한 방향뿐이다(잠그지 않은 나란함·수직 선과 면의 교차,
  면 위 수직 발, 모서리에 수직인 방향, 면 잠금은 없다 — 축이 아닌 선이 면을 뚫는 점은 그 선으로 잠갔을 때만이다, 0.19.0 `lockFaces`). 나란함의 기준은 마지막으로 지나간 선분 하나다. 잠금은 첫 점을 지나는 선 하나이고
  키보드 화살표로 축을 고르는 잠금(SketchUp의 →·←·↑)은 없다(앱이 `setMeasureInferenceLock('x')` 등으로 단다). 커서 둘레 선분은 화면에서 가까운 24개까지만 짝짓는다.
  `pointsFor`는 같은 고르기에서는 다시 쓰지만 커서가 움직여 고른 점이 바뀌면 부른다(0.38.0 `pointsForFirst`를 켜면 측정 첫 점이 바뀌어도 부른다 — 둘째 인자로 첫 점을 받는다).
  모서리 끝에서 그 모서리 방향으로 잠그기(0.12.0)는 코어가 아는 곧은 선분(선분 묶음·그물 윤곽선)만 본다. 곡선을 나눈 꺾은선은 그 조각의 방향이고
  곡선의 접선 방향은 없다(앱이 `setMeasureInferenceLock({ direction })`으로 준다).
  앱이 붙잡을 점을 다듬는 것(0.14.0 `refine`)은 수직 발·코어 가운데 점·붙잡지 않은 선분 위 점·교차점(0.15.0)·축과 선분의 교차(0.18.0, 0.19.0부터 잠근 축도,
  0.20.0부터 축이 아닌 잠근 선과 활꼴만 지나는 열린 교차도, 0.31.0부터 켜면 끌어온 점 안내 선의 열린 교차도)이고, 축·잠근 선이 면을 뚫는 점(0.22.0부터 삼각형을 비켜 가며 곡면만 뚫는 열린 교차도, 0.32.0부터 켜면 안내 선의 그 교차도)과
  붙잡지 않은 면 위 점(0.21.0 `'onFace'`)은 0.19.0 `refineFace`다.
  잠근 선으로 옮겨 오는 점, 잠근 선 위 커서에 가까운 점(잠근 동안의 면 위 점도), 단면의 잘린 면 채움 위 점은 꺾은선·삼각형 그대로다.
  `'onFace'`는 바로 앞 입력 하나만 기억하므로 커서가 곡면 위를 움직이는 동안 이동마다 앱 함수를 부른다(앱이 가볍게 풀어야 한다).
  다듬은 점으로 후보를 견주는 것은 열린 후보(0.15.0 — 토막 밖 수직 발, 넓힌 교차점, 0.20.0 선과 토막의 열린 교차, 0.22.0 선과 삼각형의 열린 교차)뿐이고, 다른 후보는 코어 점으로 견준 뒤 한 점만 다듬는다.
  열린 후보는 미리 보기 한 번에 앱 함수를 6번까지만 새로 부르므로, 커서 둘레에 토막·삼각형이 아주 많으면(촘촘한 곡선 여럿) 기억이 찰 때까지 몇 번의 이동 뒤에 붙는다.
  선과 토막의 열린 교차는 한 토막의 활꼴을 두 번 지나는 선이 곡선에 거의 닿듯 활꼴 가운데쯤을 지날 때만 두 교차를 받는다(0.22.0 둘째 힌트 —
  토막 끝 둘레만 스치는 선은 가까운 끝 쪽 하나). 앱이 힌트 둘레 교차 하나를 주는 것을 전제로 하므로, 늘 같은 근을 주는 앱은 하나만 붙는다.
  선과 삼각형의 열린 교차는 커서 둘레 24개 삼각형만 본다. 한 삼각형 위 곡면 조각을 선이 두 번 지나면(아주 얕게 스칠 때) 0.24.0부터 둘째 힌트(그 조각의 두 끝)로 둘 다 묻지만,
  곡면이 선과 나란해지는 자리를 매끈한 이웃(법선 사잇각 45° 안)과의 변 법선으로 어림하므로 그런 이웃이 없거나 찾지 못하면(그 변 가운데가 눈 뒤) 힌트(무게중심 쪽)에 가까운 교차 하나만 받는다.
  같은 평면으로 나눈 칸(원기둥 옆면 칸의 두 삼각형)은 휘는 변이 삼각형마다 하나라, 0.35.0부터 칸의 두 휘는 변으로 곡면을 원호로 어림해 두 근이 다 그 삼각형 위면 둘 다 묻는다 —
  두 휘는 변이 25°보다 기울거나 같은 평면 짝이 아닌 나눔은 하나만 받는다(0.35.0 README).
  아주 가까이 확대해 처짐이 붙잡기 거리보다 큰 곡면(구멍 안 벽 등)도 커서 아래 칸이면 열린 교차를 본다(0.34.0). 선이 칸을 뚫는 자리가 커서에서 붙잡기 거리 밖이면
  커서 쪽 활꼴 두께와 상관없이(0.36.0 — 중간·보통 거리도) 그 칸 위 곡면 교차를 묻고 뚫는 자리를 힌트로 준다. 뚫는 자리가 커서에서 붙잡기 거리 안이면 코어 교차(현 위)를
  다듬는데, 앱 곡면 교점이 코어 점에서 붙잡기 거리 밖이어도 그 칸(같은 평면 짝 포함) 위 곡면 조각 자리이고 커서에서 붙잡기 거리 안이면 받는다(0.37.0). 커서가 그물을 뚫는 자리 쪽이라
  곡면 교점이 커서에서 붙잡기 거리 밖이면 코어 교차(현 위) 그대로 면 위 만나는 점이고(앱이 곡면 교점을 줘도 — 받는 점은 커서 붙잡기 거리 안이라는 규칙), 곡면 교점이 두 칸이 함께 쓰는
  휘는 변 위(두 칸 평면에 내린 발이 모두 그 칸 밖인 쐐기 — 성긴 구)면 어느 칸 조각 자리로도 보지 않아 받지 않는다(0.37.0 README "남은 한계").
  선이 꺾은선 현과 만나는 닫힌 교차도 같다 — 곡선 교점이 코어 점에서 붙잡기 거리 밖이어도 그 토막 곡선 조각 자리이고 커서에서 붙잡기 거리 안이면 받고, 커서가 현과 만나는 자리 쪽이라
  곡선 교점이 커서에서 붙잡기 거리 밖이면 현 위 코어 교차 그대로다(0.38.0). 앱이 `refineSnapToExact`(0.39.0)를 켜면 그 자리도 같은 교차의 정확한 자리로 옮기지만,
  코어 교차와 곡면·곡선 교점이 화면에서 붙잡기 거리의 3배보다 먼 자리(아주 가까이 확대한 자리)는 그대로다.
  비켜 가는 칸의 힌트(무게중심 쪽)가 선에서 그 칸 위 조각 밖이면 조각 가운데다(0.37.0 — 누운 작은 구멍 옆면의 긴 칸).
  아주 가까이 확대해 현이 커서에서 붙잡기 거리 밖인 꺾은선 토막의 열린 교차와 선이 현을 가로지르는 자리가 곡선 교차에서 먼 교차는 0.40.0부터 활꼴 띠가 커서에 닿는 토막을 모아 본다
  (`openEdgeLens` — `refine`을 준 앱은 기본 켜짐). 띠는 선분 묶음·그물 윤곽선 배열에서 차례로 이어진 꺾은선(앞 토막 끝 = 다음 토막 시작)만 꼭짓점에서 꺾인 각(45° 미만)으로 어림하므로,
  따로 떨어지거나 차례가 섞인 선분은 0.39.0처럼 커서 둘레 선분일 때만 보고, 띠로 모으는 토막은 24개까지다. 꺾은선 꼭짓점을 지나는 선(0.33.0)·두 꺾은선의 교차점·수직 발은 커서 둘레 선분만 본다.
  그물을 뚫는 이웃 삼각형을 뺄지는 처짐 한도(0.1 × 가장 긴 변)로 어림해, 붙잡기 거리보다 처짐이 큰 확대에서는 뚫는 자리 둘레 삼각형도 앱에 묻는다(받지는 않는다 — 앱 함수를 부르는 횟수만 는다).
  곡면이 오목하게 보이는 자리의 열린 교차(0.23.0)는 앱 점 자리 광선이 처음 맞은 면이 그 삼각형이나 꼭짓점을 함께 쓰는 이웃일 때만 보인다고 본다 — 아주 잘게 나눈 곡면을 비스듬히 볼 때
  두 칸 넘게 떨어진 같은 곡면 조각에 가리면 받지 않는다. 열린 교차의 후보 거르기(0.23.0 `reachPx`)는 받는 범위의 필요조건이라 부르는 차례는 그대로 코어 점 거리 차례다.
  곡선과 면의 교차는 없다. 곡선 위 접점(첫 점에서 곡선에 그은 접선이 닿는 점)은 코어가 구하지 않는다(앱이 `pointsFor`로 주고 `'tangent'`로 단다 — 0.38.0).
  앱 점의 우선(0.41.0 `priority`)은 두 단계(`'low'` 같은 화면 거리면 뒤, `'fallback'` 다른 붙잡기가 없을 때만)뿐이다 — 종류마다의 차례 표, "축보다는 먼저·가운데 점보다는 뒤" 같은 가운데 자리는 없다.
  같은 자리 후보를 Tab으로 돌려 고르기(AutoCAD)는 0.46.0 가상 커서(키보드 — 켰을 때만)에만 있고, 마우스 미리 보기에서 Tab으로 돌리는 것은 코어에 없다(앱이 `measureCandidates`·`commitMeasureCandidate`로 만든다).
  한 자리의 선 추론 후보는 하나다(마우스가 고르는 그것).
  끝점의 선분 식별자(0.16.0)는 고르기가 고른 토막 하나다(꺾은선 꼭짓점을 함께 쓰는 다른 토막은 싣지 않는다).
  끌어온 축(0.16.0)은 기억한 점을 지나는 세계 X·Y·Z 축, 첫 점 축 위 나란한 자리, 그 축끼리와 커서 둘레 선분·윤곽선과 3D로 만나는 점(0.17.0), 커서 아래 면을 뚫는 점(0.18.0)이다
  (3D로 만나지 않는 두 축은 붙잡지 않는다). 끌어온 점에서 지나간 모서리와 나란함·수직(0.27.0 `trackDirs`)은 그 선 위 점과, 켜면(0.29.0 `meets`) 그 선이 첫 점 축·첫 점의 나란함·
  다른 끌어온 축·커서 둘레 모서리·면과 만나는 점, 켜면(0.30.0 `meets: { guides: true }`) 두 끌어온 점의 그 선끼리 만나는 점이다(같은 기준 선분에 대한 두 점의 선 — 3D로 만날 때만).
  안내 선이 꺾은선 활꼴만 지나는 열린 교차는 켰을 때만이다(0.31.0 `meets: { open: true }` — 앱 `refine`이 있어야 한다). 안내 선이 삼각형을 비켜 가며 곡면만 뚫는 면의 열린 교차도
  켰을 때만이다(0.32.0 `meets: { openFaces: true }` — 앱 `refineFace`가 있어야 한다). 만나는 점(축·안내 선과 모서리)이 곡선을 나눈 꺾은선 꼭짓점과 거의 겹치면 끝점 붙잡기가 먼저이고, 선이 꼭짓점을 반 화소 안으로 지나면
  모서리와 만나는 점에서 빠진다 — 켜면(0.33.0 `refineEnds` — 앱 `refine`이 있어야 한다) 그 자리를 앱에 물어 곡선 위 교차가 끝점보다 먼저다. 그 선 자체는 잠그지 못하며
  (첫 점을 지나지 않는다 — 만나는 점이 첫 점 축·나란함 위면 그 선으로 잠근다), 잠근 동안에는 보지 않는다.
  기준 선분은 마지막으로 지나간(앱이 거르면 0.28.0 `edge`가 받은) 모서리 하나이고 뷰어는 세계 축만 쓴다. 0.10.0 나란함(첫 점에서)의 기준은 0.29.0 `parallelEdge`로 따로 거른다.
  SketchUp 도움말 "Introducing Drawing Basics and Concepts"는 점에서 시작하는 선 추론으로 축 색 From Point와 Through Point만 들고 나란함·수직은 모서리·면에 대한 맞춤으로 들어
  기본으로 켜지 않는다(선택).
  축이 면을 뚫는 점(0.18.0)은 커서가 그물 면 위일 때만 본다(0.22.0 면의 열린 교차는 커서 둘레 삼각형을 본다 — `refineFace`가 있을 때만). 잠근 동안에는 `lockEdges`·`lockFaces`를 켜야 잠근 선이 모서리와 만나는 점·면을 뚫는 점에 붙고(0.19.0),
  잠근 선이 끌어온 축과 만나는 점(0.21.0 `lockTracks`)은 3D로 만날 때만이고, 축이 아닌 잠근 선 위에는 끌어온 점과 나란한 자리가 없다
  (끌어온 점 위를 가리키면 0.10.0처럼 그 점을 잠근 선에 내린 자리다).
  다듬기 기억만 비우기(0.21.0 `clearMeasureRefine`)는 `refine`·`refineFace` 기억만이다(`pointsFor` 기억은 0.38.0 `clearMeasurePointsFor`로 따로 비운다).
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
  그 덧그림 것만 될 수 있으면 비킨다). 앱이 캔버스 위에 그린 글(툴팁·결과 글)은 넘겨준 사각형으로만 안다. 덧그림 글상자는 커서 둘레를 보지 않는다. 그림 저장은 켜면 측정 거리 글상자만 측정 점 표식을 비킨다(0.33.0 `snapshotPoints` — 앱 영역·커서 둘레·덧그림 글상자끼리는 비키지 않는다).
  앱이 정한 기본 자리는 순수 `placeMeasureLabel`·`placeLabelAmong`(0.26.0 `first`)과 뷰어 글상자(0.27.0 `setMeasureLabelSpot` — 이름 자리만, 측정 거리 글상자 하나·덧그림 글상자 모두에 하나씩)다.
  덧그림마다 다른 기본 자리는 없다. 기본 자리가 막히면 0.25.0 차례로 고르는 선택은 순수 함수(0.28.0 `fallback`)와 뷰어 글상자(0.29.0 `setMeasureLabelSpot`의 `fallback` —
  측정 거리 글상자·덧그림 글상자에 하나로, 글상자마다 다른 `fallback`은 없다)에 있다.
  측정 점 표식은 기본으로는 글상자를 옮길 때만 비키고, 표식을 덮는 기본 자리도 옮기는 것은 선택이다(0.31.0 `setMeasureLabelAvoid({ points })` — 측정 거리 글상자만, 덧그림 글상자의 점 표식은 0.30.0 그대로).
  코어 기본 측정 글의 이름표는 한국어 하나("거리")다 — 다른 언어는 앱이 글 꼴의 둘째 인자(0.31.0 `MeasureFormatCore`)로 이름표만 옮긴다
- 임의 방향 범위(0.30.0 `itemExtent` — 0.31.0부터 `opencad-viewer3d/extent`)는 정점을 한 번 훑는다(정점 100만 개 5 ms쯤 — 볼록 껍질을 미리 만들지 않는다). 같은 배열의 바로 앞 방향 하나만 기억하고(원근 행렬은 기억하지 않는다),
  숨긴 구간·마주 보는 그물 돌림은 보지 않는다(`itemBounds`와 같다)
- 두 묶음 최근접점(`closestPoints`)은 0.45.0부터 묶음 안 구간(면)끼리도 잰다(`rangeA`·`rangeB` — 구간 BVH를 만드는 것은 나누지 않는다). 단면은 보지 않는다.
  같은 축 짝(핀–구멍)은 틈이 고르게 좁아 가지치기가 약해 삼각형 수에 거의 비례해 걸린다(3.3만 × 2.5만 삼각형에 0.9초 — 0.41.0 `closestPointsAsync`가 8 ms 조각으로 나눈다).
  나눠 돌리기는 BVH 만들기를 나누지 않고, 도는 동안 모양이 끊임없이 바뀌면 끝나지 않고 다시 찾는다. 워커로 돌리는 길은 코어에 없다(순수 `ClosestSearch`를 앱 워커에서 쓴다)
- 음영 뒤 모서리 점선은 반투명 그물 뒤 모서리에는 그리지 않는다
- 그림 저장 배율은 한 변 GPU 한도·약 4천만 화소까지(넘으면 줄인다)
- 잘린 면 채우기는 스텐실 홀짝이라 `closed` 그물이 정말 닫혀 있어야 한다(틈·겹친 입체가 있으면 줄무늬·구멍). 반투명 그물·X-ray·와이어프레임에서는 채우지 않는다
- 원점(`origin`) 없이 큰 좌표를 그대로 넣은 장면은 예전처럼 떨린다(해석기가 원점을 채워야 한다)
- 장면 입력 검사(0.50.0)는 좌표·색인·색·원점·행렬·굵기·크기·범위·배열 길이만 본다 — 법선·무늬 좌표의 값(NaN·0)과 무늬 그림은 보지 않고, 같은 id는 알리기만 한다.
  깨진 끝점 선분을 그리지 않는 것은 WebGL이 NaN 꼭짓점 도형을 버리는 것에 기댄다. 반투명 면의 주변 가림(드리우기)은 설계만 있다(0.50.0 "남은 한계")
- 나눠 올리기에서 큰 묶음은 다 채운 뒤에야 보인다(채운 앞부분부터 그리지 않는다). 그물 범위(CPU)는 묶음 하나를 한 번에 센다. 나눠 올리지 않는 `setScene`은 예전처럼 한 번에 올린다
- 앱이 포인터를 맡는 훅(0.32.0 `setPointerClaim`·`claimPointer`)은 누르기 단위다 — 휠·키는 맡지 않고(앱이 막으려면 그 사건을 먼저 받아 막는다), 코어에는 관성·길게 누르기가 없어
  앱이 길게 누르기를 하려면 제 타이머에서 `claimPointer`로 맡는다. 맡은 포인터 id로 보낸 합성 사건도 앱 것이라 코어 측정 미리 보기를 쓰는 정밀 조준은 지금처럼 합성 `pointercancel`을 쓴다.
  둘째 손가락을 앱이 맡지 않으면 코어가 앱 손가락을 모두 돌려받는 것 하나뿐이다(돌려받지 않고 새 손가락만 코어가 다루는 선택은 없다)
- 묶음 겉모습을 바꾸면 범위·모형 행렬은 행렬을 바꾼 묶음만 다시 세지만(0.33.0 — 묶음 절반 넘게 바꾸면 통째로), 보이는 묶음 목록과 (켰으면) 그림자 깊이 그림은
  다음 그리기에서 통째로 다시 만든다(색·불투명도 하나만 바꿔도). 여러 묶음 겉모습을 한 번에 거는 것(0.33.0 `setItemLooks`)은 필드 이름이 정해져 있다 —
  숨기기(`setItemVisible`)·숨긴 구간(`setHiddenRanges`)은 따로 부른다
- 하나씩 바꾸기는 그물만이다(선분·점 묶음은 장면을 다시 준다). 바꾼 그물의 고르기 BVH는 통째로 다시 만들고(상자만 고치기 없음), 범위는 위치 배열을 통째로 한 번 훑는다.
  `setMesh`의 나눠 올리기는 다 채울 때까지 GPU에 그 그물이 두 벌이고, 정점 구간은 위치·법선·색·무늬 좌표만(색인·윤곽선은 통째로)
- 구간 숨김은 그물 윤곽선(`edges`)을 삼각형과 짝지어 주지 않는다 — 윤곽선도 숨기려면 `{ prims, edges }`로 윤곽선 번호를 함께 준다
- 무늬는 그물마다 앞·뒷면 하나씩(여러 겹 무늬 없음). 색 공간은 정점 색과 같이 sRGB 값 그대로 조명한다
- PBR 그림(0.43.0)은 지금 조명 식에 거칠기·금속성만 넣은 어림이다 — 둘레 빛(IBL)·HDR 환경 배경·환경 반사·가림(AO) 그림·발광 그림이 없어 매끈한 금속은 반짝임 밖이 어둡고,
  반사광은 고정 조명 두 빛(또는 해)만이다(화면 공간 주변 가림은 0.49.0 `setAmbientOcclusion` — 보이는 맨 앞 불투명 면만, 반투명 면은 가리지 않는다. 끌어 돌리는 동안은 0.50.0 `moving`으로 끄거나 ¼ 해상도).
  접선 속성은 받지 않고 화면 미분으로 틀을 만든다(낮은 해상도 곡면에서 이음매가 보일 수 있다). 앞면 재질만이고 그림마다 다른 무늬 좌표·변환은 없다. 법선 그림 밉맵의 거칠기 보정은 없다
- 같은 그물 자리 모아 그리기(0.42.0 인스턴싱)는 여러 단면이 있을 때·반투명 면·묶음 안 구간이 있는 그물·뒷면 변종은 그물마다 그린다(0.43.0부터 단면 하나·그림자를 켠 면은 모은다 —
  단면이 있을 때 선과 그림자 깊이 그림은 그물마다). 모은 묶음은 같은 그물끼리 그리므로
  서로 다른 그물이 같은 깊이로 겹치는 화소(맞닿은 면, 반투명 모서리 선이 엇갈린 몇 화소)는 끔과 보이는 쪽·섞임이 다를 수 있다. 같은 배열 객체여야 모은다(값이 같은 다른 배열은 모으지 않는다)
- 서로 다른 배열의 그물(조립의 서로 다른 부품)은 기본으로 그물마다 그리기 한두 번이다 — 맞춘 화면에서는 GPU 쪽(브라우저 GPU 프로세스가 그리기 호출을 옮기는 몫)이 프레임 대부분이다
  (0.51.0 절 표). 0.52.0 묶어 그리기(`merging` 'auto')는 묶을 수 있는 그물이 2,000개 이상인 장면만 켠다: 기계 GPU(ANGLE Metal)에서 셰이더가 자리 자료로 만든 행렬의 곱이 균일 행렬과
  깊이 마지막 자리가 달라 모서리 선이 면과 겨루는 몇 화소가 0.51.0과 다르다. 법선을 놓는 장면의 그물·단면·그림자 면·윤곽선 없는 그물의 삼각형 변·선분 묶음은 묶음 구간으로 그리지 않는다
  (단면·그림자·삼각형 변은 묶음 자리로 그물마다). 다시 구운 묶음은 옛 묶음과 장면 차례로 엇갈려 구간이 짧아진다. 8만 그물은 실제 GPU로 재지 않았다(크래시 위험 — 가짜 WebGL 객체 수만).
  화면 밖 잘라내기는 시야 옆 네 평면만 보고(앞·뒤 자르기 평면·가려진 그물은 그린다), 그림자 깊이 그림·잘린 면 채우기는 모두 그린다
- 투명 화소를 쓰는 무늬(`alpha`)는 그물 단위로 앞뒤를 정렬해 그린다(그물 안 삼각형끼리는 정렬하지 않는다)
- 놓기(0.25.0 `release`)는 법선·무늬 좌표·무늬 원본만이다. 위치·색인·정점 색은 고르기·측정·범위가 쓰므로 놓지 않고, 놓아도 GPU 버퍼(그림)는 그대로 남는다.
  놓은 그물은 문맥을 잃었다 되찾을 때 앱이 다시 줄 때까지 평면 음영·그물 색이다(코어가 법선을 스스로 다시 만들지 않는다). 놓은 장면 객체를 `setScene`에 다시 주면 지운 배열은 다시 올리지 못해
  `restoreNeed`에 남는다(알림 없음). 놓은 그물의 `setMesh` `vertices` 구간은 놓은 속성에는 올리지 않는다(알림만 — 통째로 다시 준다).
  `textures: 'bitmap'`은 `data`가 `bitmap`과 같은 그림이라고 믿고 되찾을 때 `data`를 다시 푼다(코어는 둘이 같은지 모른다).
  장면을 올린 뒤 앱이 주는 무늬(0.38.0 `pending`)는 코어가 받은 그림을 들고 있지 않아 문맥을 되찾을 때마다 앱이 다시 준다. 이미 올린 무늬의 그림을 바꾸는 API는 없다(장면·그물을 다시 준다).
  되찾은 뒤 끝 알림(0.29.0 `onContextRestoreDone`)은 앱이 주지 않은 것이 남으면 오지 않는다(`restoreNeed`로 본다). 되찾는 동안은 무늬 한 장마다 다시 그리지 않아(0.29.0)
  무늬가 하나씩이 아니라 푸는 것이 다 끝날 때 함께 나타나고, 되찾는 순간 위치·색으로 그리는 한 번은 남는다(소프트웨어 GPU의 아주 큰 모형에서는 그 한 번이 다음 무늬 올리기를 붙잡는다 —
  삼각형 288만 개에서 1.3초쯤). 처음 올릴 때(0.30.0)는 첫 무늬를 곧 그리고 그 뒤로는 250 ms와 올리기·그리기 시간의 4배 가운데 긴 간격마다 그려 무늬가 몇 번에 나뉘어 나타난다.
  그리기가 비싼 큰 모형에서는 처음 화면·첫 무늬 화면·끝 화면 세 번이 남는다(삼각형 288만 개 SwiftShader에서 무늬 64장이 다 보이기까지 3.1~3.6초, 다시 그리기를 모두 막으면 1.8~2.0초).
  간격 규칙은 CPU 쪽에서 재는 시간(올리기·그리기 벽시계, `fenceSync` 울타리를 폴링한 시간)이라 GPU가 실제로 쓴 시간보다 길게 잡힐 수 있다.
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
