/**
 * 0.54.0 묶어 그리기 상수·선택 꼴(작은 모듈 — 렌더러·뷰어·입구가 늘 가져온다). 묶음 나누기·이은 배열(merge.ts)과 묶음 굽기(mergegl.ts)는
 * 렌더러가 묶어 그리기를 켤 장면에서만 import()로 받는 조각이다(SKP 57차 — 문턱을 넘지 않는 앱은 그 코드를 받지 않는다). merge.ts는 이 값들을 다시 내보낸다.
 */

/** 묶음 하나의 그물 수 한도(정점마다 그물 번호를 Uint16으로 둔다) */
export const MERGE_ITEMS = 65535;
/** 묶음 하나의 정점 수 한도(묶음 하나 굽기 — 이은 배열 만들기·올리기 — 가 한 프레임을 오래 붙잡지 않게) */
export const MERGE_VERTS = 262144;
/** 묶을 작은 그물의 정점 수 한도(이보다 큰 그물은 그물마다 — 그리기 호출 몫이 작다) */
export const MERGE_MESH_VERTS = 65536;
/** 묶을 그물의 윤곽선 선분 수 한도 */
export const MERGE_MESH_SEGMENTS = 65536;
/**
 * 'auto'(기본)에서 묶어 그리기를 켜는 문턱: 장면에 묶을 수 있는 그물이 이만큼 이상이면 켠다. 그물마다 GL 객체가 7개 남짓(버퍼 넷·VAO 셋)이라 2,000개면 1만 4천 개,
 * 그리기 호출은 면·윤곽선 4,000번(GPU 프로세스가 하나에 2.5 µs 남짓 — 프레임마다 10 ms)이다. 화소 회귀 장면은 모두 이보다 훨씬 작다(그림이 0.51.0과 같다)
 */
export const MERGE_AUTO_MIN = 2000;
/**
 * 묶음 밖에 남은 묶을 수 있는 그물(바꾼 그물·새 그물)과 묶음에서 빠진 그물이 합해 이만큼 모이면 다시 굽는다
 * (0.53.0: 그것들끼리 새 묶음이 아니라 그 그물들이 든 장면 차례 토막을 이웃 묶음과 함께 — mergegl planLoose)
 */
export const MERGE_LOOSE = 256;
/**
 * 장면을 올리는 동안 묶음을 굽는 단위: 기다리는 그물이 이만큼(또는 정점 MERGE_UPLOAD_VERTS개) 모이면 올리는 걸음 안에서 굽고 그물 버퍼·VAO를 놓는다 —
 * 그물마다 GL 객체(7개 남짓)가 한꺼번에 쌓이는 것은 이 수 × 7(1만 4천 개) 안쪽이다
 */
export const MERGE_UPLOAD_MESHES = 2048;
export const MERGE_UPLOAD_VERTS = 262144;
/**
 * 묶음 안 바꾼·뺀 그물 몫이 이보다 크면 그 묶음을 다시 굽는다(0.53.0: 그 묶음 그물 사이에 끼었거나 그 묶음이 거느린 묶음 밖 그물도 센다 —
 * 묶음 밖 그물이 MERGE_LOOSE보다 적어도 그 토막만 다시 굽는다)
 */
export const MERGE_DEAD_RATIO = 0.25;
/** 자리 자료 텍셀 수: 면 그물 하나 12(u_mvp 4·u_mv 4·u_nmat 3·u_color 1), 선 그물 하나 6(u_mvp 4·u_mvz 1·u_color 1) — 셰이더 mergeShader와 같다 */
export const MERGE_MESH_TEXELS = 12;
export const MERGE_LINE_TEXELS = 6;
/**
 * 0.62.0 이동뿐인 묶음(모든 그물 모형이 원점만 옮긴 것 — 겉모습이 없을 때)의 자리 텍셀 수(셰이더 MSHIFT 변종): 면 3(시점 투영 · 모형 3열·시점 · 모형 3열과 깃발·색),
 * 선 2(시점 투영 · 모형 3열·색). 0~2열·법선 행렬은 그물마다 같아 그리기마다 균일 변수로 한 번 보낸다(그림자 +1 — 3열, 안개 +1 — z 행 끝 칸, 단면 +1 — 로컬 평면)
 */
export const MERGE_LITE_MESH_TEXELS = 3;
export const MERGE_LITE_LINE_TEXELS = 2;
/**
 * 0.57.0 조각을 이미 받은 페이지에서 나눠 올리는 장면을 setScene 안에서 곧 훑을 그물 수 상한(이 수까지는 훑기가 짧다 — 이 컴퓨터 가운데값 1만 4 ms·1만 6,384개 6.6 ms, 첫 걸음부터 그물마다 GL 객체 없이 곧장 굽는다).
 * 더 큰 장면은 0.54.0처럼 첫 그림 뒤 걸음의 몫 안에서 훑는다(8만 그물 훑기가 setScene을 50~90 ms 붙잡아 첫 그림을 늦췄다)
 */
export const MERGE_SCAN_FIRST = 16384;
/**
 * 0.59.0 훑기를 뒤로 미룬 큰 장면(그물이 MERGE_SCAN_FIRST 초과)의 첫 그림 앞 걸음에서 그물마다 올릴 그물 수 상한. 이 걸음의 그물은 곧 구울 그물이라 그물마다 버퍼·VAO를 만드는 것은
 * 첫 그림을 내기 위해서다 — 8만 그물에서 몫 8 ms를 다 쓰면 208개(GL 버퍼 660~784개)를 올렸고, 몇백 개든 전체의 0.3% 안쪽이라 첫 그림이 달라 보이지 않는다
 */
export const MERGE_FIRST_MESHES = 64;
/**
 * 0.55.0 묶어 그리기 조각 받기를 기다리는 한도(ms — 받기를 건 때부터). 이 안에 오지도 실패하지도 않으면 그 페이지는 조각을 기다리지 않는다
 * (Viewer3d.mergingState() 'late' — 나눠 올리기가 굽기 단위에서 멈추지 않고 그물마다 이어 올린다. 받기는 그대로 두어, 나중에 오면 그때부터 굽고
 * 기다리지 않고 올린 그물은 다 올린 뒤 묶는다). 0.54.0은 한도가 없어 받기가 걸린 채 끝나지 않으면 나눠 올리기가 2,047번째 그물에서 멈춘 채 남았다.
 * 값: 조각은 gzip 6.2 kB 남짓(0.57.0)이라 느린 3G(내려받기 400 kbps 남짓·요청 지연 2 s 안팎)에서도 2.1 s 안팎에 온다 — 그 두 배 가까운 여유. 이 컴퓨터에서
 * 데우지 않은 첫 받기(시험 변환 포함)는 0.41~0.81 s였다(54차). 더 길게 잡으면 걸린 받기에서 장면이 그만큼 2,047개까지만 보인다
 */
export const MERGE_KIT_WAIT_MS = 4000;

/** 0.52.0 묶어 그리기 방식: 'auto' = 묶을 수 있는 그물이 문턱(min) 이상인 장면만, 'on' = 늘, 'off' = 끔(0.51.0 길) */
export type MergingMode = 'auto' | 'on' | 'off';

/** 0.52.0 묶어 그리기 선택(Renderer3d.merging — Viewer3d.setRenderOptions({ merging })) */
export interface MergingOptions {
  mode: MergingMode;
  /** 'auto' 문턱(묶을 수 있는 그물 수) */
  min: number;
}
