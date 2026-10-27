/**
 * 3D 뷰어(WebGL2): 형식 해석기가 만든 Scene3d를 그리고, 궤도·이동·확대, 표준 뷰, 고르기, 측정을 한다.
 *
 * 조작
 * - 마우스: 왼쪽 끌기 = 궤도 회전(커서 아래 점 둘레), 가운데·오른쪽 끌기 = 이동, Shift+가운데 끌기 = 회전,
 *   휠 = 커서 쪽으로 확대·축소, 가운데 두 번 누르기 = 전체 보기, 왼쪽 누르기 = 고르기(측정 모드면 점 찍기)
 * - 터치: 한 손가락 = 회전(TOUCH_DRAG_START_PX = 10화소 넘게 움직일 때부터, 그 안에서 떼면 누르기),
 *   두 손가락 = 이동·핀치 확대(한 손가락을 먼저 떼면 남은 손가락은 모두 뗄 때까지 회전도 누르기도 하지 않는다).
 *   터치로 누르면 고르기·측정 붙잡기 허용 거리가 넓다(touchPickTolerance, 기본 14화소)
 * - 키(캔버스에 초점이 있을 때): F = 전체 보기, 1 앞 2 뒤 3 왼쪽 4 오른쪽 5 위 6 아래 7 남동 등각, Esc = 측정 지우기
 * - 오른쪽 위 뷰 큐브: 면·모서리·구석을 누르면 그 방향 표준 뷰, 끌면 회전
 *
 * 프레임은 상태가 바뀔 때만 requestAnimationFrame 한 번으로 그린다.
 */
import type { Box3, LineSet3d, Mesh3d, Pick3d, PointSet3d, Rgba, Scene3d, SnapKind, SnapPoint } from './types';
import { boxCenter, boxIsEmpty, boxSphere, emptyBox, expandPoint, itemBounds, itemRangesBounds, sceneBounds, transformBox, unionBox } from './bounds';
import { type IndexRange, mergeRanges, partitionRanges, rangeTester } from './ranges';
import { type Bvh, type PrimKind, buildBvh } from './bvh';
import {
  type CameraState,
  type Projection,
  type ViewFrame,
  type ViewName,
  VIEW_DIRS,
  VIEW_KEYS,
  cameraBasis,
  cameraEye,
  computeFrame,
  defaultCamera,
  dirToAngles,
  fitCamera,
  lerpCamera,
  orbitCamera,
  lookCamera,
  panCamera,
  projectToScreen,
  rectZoomCamera,
  standCamera,
  walkCamera,
  rayAtDepth,
  worldPerPixel,
  screenRay,
  viewDepth,
  zoomCamera,
} from './camera';
import { type GridSpec, type GridZ, gridLines, gridSpec } from './grid';
import { MARKER_HEIGHT, type MarkerKind } from './marker';
import { type V3, dot, hasOrigin, length, mat4Mul, modelMatrix, placeMatrix, sub, transform4, transformPoint, translation } from './math';
import { type PickDetail, type ScenePickItems, type ScenePickOptions, occludingDepth, pickScene, segmentsNear } from './scenepick';
import { type MeasurePointSnap, type SnapCandidate, chooseMeasureSnap, measureResult, snapLimit, withinSnapLimit } from './snap';
import { type MeasureInference, type SnapAxis, axisSnap, inferenceCandidates, normalizeInference } from './inference';
import { SNAP_INDEX_MIN, SnapPointIndex } from './snapindex';
import { type RayHit, castRay, walkStep } from './walk';
import { type Annotation3d, type AnnotationGeometry, annotationGeometry, annotationText } from './annotate';
import { type ClosestResult, type ClosestShape, closestBetween } from './closest';
import { billboardAngle, billboardBounds, billboardMatrix, towardCamera } from './billboard';
import { countIdsUpTo } from './playback';
import { type LastClick, PICK_TOLERANCE_PX, TOUCH_PICK_TOLERANCE_PX, clickCount, dragStarted, isTouch, pickTolerance, walkKeyOf } from './pointer';
import {
  AXIS_DIRS,
  type Plane4,
  type SectionAxis,
  boxRange,
  boxStraddles,
  planeBoxPolygon,
  planeFrom,
  planeToLocal,
  MAX_SECTION_PLANES,
  clipPolygon,
  clipSegments,
  planeValue,
  rangeFraction,
  sectionDragDistance,
  sectionScreenAxis,
  sectionSegments,
} from './section';
import { segmentsById } from './segments';
import { type DrawRange, type ItemParts, type RenderColors, type RenderMode, type RenderState, type RenderStats, type TextureStats, Renderer3d } from './renderer';
import { TEXTURE_BUDGET, TEXTURE_LIMIT } from './texture';
import { CANVAS_CSS, CANVAS_FOCUS_CSS, DARK_THEME, FOCUS_DEFAULT, LIGHT_THEME, THEME_CSS_VARS, type Viewer3dTheme, contrastLineColor, focusKey, focusLeft, parseColor, pointerFocus } from './theme';
import { cubeHit, cubeLayout, drawViewCube } from './viewcube';

export interface Viewer3dOptions {
  /** 'dark'(기본) | 'light' | 일부 색. 호스트의 CSS 변수(--v3d-*)가 있으면 그것이 이긴다 */
  theme?: 'dark' | 'light' | (Partial<Viewer3dTheme> & { base?: 'dark' | 'light' });
  /** 바닥 격자(기본 true) */
  grid?: boolean;
  /** 격자 높이(기본 'min' = 범위 바닥) */
  gridZ?: GridZ;
  /** 오른쪽 위 뷰 큐브(기본 true) */
  viewCube?: boolean;
  /** 뷰 큐브 한 변(CSS 화소, 기본 112 — 64~160으로 자른다). 좁은 화면에서 줄여 쓴다 */
  viewCubeSize?: number;
  /** 왼쪽 아래 좌표축(기본 true) */
  axes?: boolean;
  /** 키 입력(기본 true, 캔버스에 초점이 있을 때만) */
  keyboard?: boolean;
  projection?: Projection;
  renderMode?: RenderMode;
  /** 표준 뷰·전체 보기를 부드럽게(기본 true) */
  animate?: boolean;
  /** 고르기 허용 거리(화면 화소, 기본 6) — 마우스·펜 */
  pickTolerance?: number;
  /**
   * 터치로 누를 때(누르기·측정 점 찍기·측정 중 터치 미리 보기)의 고르기 허용 거리(화면 화소, 기본 14).
   * 측정 점을 꼭짓점·끝점에 붙잡는 거리도 이 값(10보다 작으면 10)까지 넓힌다
   */
  touchPickTolerance?: number;
  /**
   * 그물 윤곽선(Mesh3d.edges)도 고른다(기본 false): 누르기·측정·onPick이 선분 다음, 면보다 먼저 kind 'edge'(그물 id, edges 선분 번호)를 돌려준다.
   * 허용 거리는 선분과 같다(터치는 touchPickTolerance). 음영 모드에서는 면에 가린 윤곽선은 고르지 않는다. setPickEdges로 바꾼다
   */
  pickEdges?: boolean;
  /** 장치 화소 비율 상한(기본 2) */
  maxPixelRatio?: number;
  /**
   * 측정 글 꼴(내장 측정과 글을 주지 않은 거리 덧그림): 거리·성분·두 점·장면 단위를 받아 글 줄들을 돌려준다.
   * 앱이 단위(파일·mm·in)·자릿수·언어를 맞출 때 쓴다. 없으면 기본("거리 … mm" / "ΔX … ΔY … ΔZ …"). setMeasureFormat으로 바꾼다
   */
  formatMeasure?: MeasureFormat | null;
  /** 무늬 그림 한 장의 긴 변 한도(화소, 기본 2048 — GPU 한도보다 크면 GPU 한도). 큰 그림은 풀면서 줄인다 */
  textureLimit?: number;
  /** 무늬 그림 전체 GPU 예산(바이트, 기본 256 MB — RGBA·밉맵 어림). 넘으면 모든 무늬를 같은 비로 줄인다 */
  textureBudget?: number;
}

/** 선분 강조 선택(setHighlightSegments·highlightSegmentIds) */
export interface SegmentHighlightOptions {
  /** 색(기본: 테마 강조색) */
  color?: Rgba;
  /** 화면 화소 굵기(기본 3) */
  width?: number;
  /** 가려진 부분의 불투명도 0~1(기본 0.3, 0이면 가려진 부분은 그리지 않는다) */
  hidden?: number;
  /** positions의 원점(세계 좌표, 선택): 있으면 positions는 이 점 기준(세계 = origin + position) — 큰 좌표용 */
  origin?: readonly number[];
}

/** 잘린 면 채우기: 'closed' = Mesh3d.closed인 불투명 그물만(기본), 'all' = 불투명 그물 모두, 'none' = 채우지 않음 */
export type SectionCaps = 'closed' | 'all' | 'none';

/** 단면 보기 선택(setSection·setSectionAxis·setSectionOptions) — 주지 않은 것은 앞의 값(처음이면 기본값)을 쓴다 */
export interface SectionOptions {
  /** 잘린 면 채우기(기본 'closed') */
  caps?: SectionCaps;
  /** 단면 테두리(그물과 평면의 교선)를 굵게 그린다(기본 true) */
  outline?: boolean;
  /** 평면 위치(평면 ∩ 장면 범위 다각형)를 화면에 옅게 표시(기본 true) */
  plane?: boolean;
}

/** 지금 단면 상태(Viewer3d.section) */
export interface SectionState {
  /** 잘라 내는 쪽을 향한 단위 법선(normal·p > offset 쪽이 잘린다) */
  normal: V3;
  offset: number;
  /** 축 단면이면 그 축(x·y·z), 아니면 null */
  axis: SectionAxis | null;
  /** 기준 방향(축 단면이면 +축). flip이면 normal = −dir */
  dir: V3;
  flip: boolean;
  /** dir 방향 위치(dir·p = position인 평면) */
  position: number;
  /** 장면 범위를 dir 방향으로 잰 [min, max] — position이 이 안이면 평면이 장면을 지난다 */
  min: number;
  max: number;
  /** 범위 안 위치 (position − min) / (max − min). 0 = min, 1 = max(슬라이더에 그대로 쓴다) */
  t: number;
  caps: SectionCaps;
  outline: boolean;
  plane: boolean;
  /** 이 평면이 자르는 묶음 id(setSections에서 정했을 때만) */
  items?: string[];
  /** setSections에서 준 식별자 */
  id?: string;
}

/** setSections의 평면 하나: normal·p = offset의 법선 쪽을 잘라 낸다 */
export interface SectionPlane extends SectionOptions {
  normal: readonly number[];
  offset: number;
  /** 이 평면이 자르는 묶음 id(없으면 모두) */
  items?: readonly string[] | null;
  /** 앱이 붙이는 식별자(state.id로 돌려준다) */
  id?: string;
}

/** 화면에서 단면 평면을 끌 손잡이 정보(Viewer3d.sectionHandle) */
export interface SectionHandle {
  /** 평면 위 기준점(장면 가운데를 평면에 내린 점)의 화면 위치(캔버스 CSS 화소) */
  x: number;
  y: number;
  /** 법선(잘라 내는 쪽)이 화면에서 향하는 단위 방향(눈 쪽을 바로 향하면 0, 0) */
  dx: number;
  dy: number;
  /** 법선 방향 세계 1단위가 화면에서 몇 화소인지 */
  pxPerUnit: number;
}

/** onPick 두 번째 인자: 누를 때의 수정 키·누른 횟수 */
export interface PickEvent {
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  /** 1 = 한 번, 2 = 두 번째 누르기(바로 앞 누르기와 0.45초·6화소(터치 24화소) 안 — 두 번 누르기 판별). 세 번째는 다시 1 */
  clicks: number;
  /** 누른 단추(0 = 왼쪽)와 포인터 종류('mouse'·'touch'·'pen') */
  button: number;
  pointerType: string;
}

/**
 * 묶음 안 구간 선택: 기본 도형 번호 범위 목록(그물 = 삼각형, 선분 묶음 = 선분, 점 묶음 = 점 번호),
 * 또는 그물 윤곽선(Mesh3d.edges의 선분 번호)까지 함께 줄 때 { prims, edges }.
 */
export type RangeSelection = readonly IndexRange[] | { prims?: readonly IndexRange[]; edges?: readonly IndexRange[] };

export interface MeasureResult {
  a: V3;
  b: V3;
  distance: number;
  dx: number;
  dy: number;
  dz: number;
  /**
   * 두 점을 붙잡은 종류(0.8.0): 'vertex'·'endpoint'·'midpoint'·'center'·'point'(0.9.0부터 추론 'intersection'·'perpendicular'·'axis'),
   * 붙잡지 않은 점(면·선 위 아무 데)은 null. setMeasureSnap을 켰을 때만 있다(끄면 예전처럼 이 두 필드가 없다)
   */
  snapA?: SnapKind | null;
  snapB?: SnapKind | null;
  /**
   * 축 붙잡기의 축(0.9.1): snapA·snapB가 'axis'(첫 점에서 X·Y·Z 축 방향 — setMeasureSnap({ inference: { axes } }))일 때만 'x'·'y'·'z'.
   * 다른 종류나 추론을 끄면 없다. 축 붙잡기는 첫 점을 찍은 뒤에만 되므로 지금은 axisB만 실린다
   */
  axisA?: SnapAxis;
  axisB?: SnapAxis;
}

/** 걷기 선택(Viewer3d.setNavigation('walk', opts)) */
export interface WalkOptions {
  /** 눈높이(세계 단위, 기본 단위별 1.6 m) */
  eyeHeight?: number;
  /** 빠르기(초당 세계 단위, 기본 보이는 범위 반지름의 0.4) */
  speed?: number;
  /** 두 번 누르면 그 자리에 서기(기본 true) */
  tapToStand?: boolean;
  /** 0.8.0: 바닥을 따라간다(계단·경사 오르기, 아래 바닥으로 내려가기 — 위아래 입력은 무시). 기본 false */
  gravity?: boolean;
  /** 0.8.0: 면을 지나가지 않는다(벽 앞에서 멈추고 벽을 따라 미끄러진다). 기본 false */
  collide?: boolean;
  /** 0.8.0: 한 걸음에 오를 수 있는 높이(세계 단위, 기본 눈높이의 0.35 — 1.6 m면 0.56 m) */
  stepHeight?: number;
  /** 0.8.0: 몸 반지름(벽 앞에서 멈출 거리, 기본 눈높이의 0.18) */
  radius?: number;
}

/**
 * 측정 점 붙잡기 선택(0.8.0, Viewer3d.setMeasureSnap). 주지 않은 것은 끈다(edges는 pickEdges를 따른다).
 * 붙잡기 거리는 0.6.0 규칙 그대로(마우스·펜 SNAP_PX 10화소, 터치 max(10, touchPickTolerance)) — 정밀 조준(펜 포인터)도 같다
 */
export interface MeasureSnapOptions {
  /** 고른 선분 묶음·그물 윤곽선 선분의 가운데 점에도 붙잡는다 */
  midpoints?: boolean;
  /**
   * 측정 중에만 그물 윤곽선(Mesh3d.edges)도 고른다(누르기·onPick의 pickEdges는 그대로). 주지 않으면 pickEdges를 따른다.
   * 윤곽선 끝점·가운데 점·pointsFor는 윤곽선을 골라야 쓰인다
   */
  edges?: boolean;
  /**
   * 늘 후보인 앱 붙잡기 점(세계 좌표) — 예: 장면의 모든 원·원호 중심. 커서에서 붙잡기 거리 안이고 보이면(단면에 잘리지 않고, 음영 계열 모드에서
   * 불투명 면에 가리지 않고, id를 주면 그 묶음이 보일 때) 붙잡는다. 아무것도 고르지 않은 자리(구멍 가운데 빈 곳)에서도 된다
   */
  points?: readonly SnapPoint[] | null;
  /**
   * 커서 아래 고른 것(그물·윤곽선·선분·점)에 따라 앱이 더하는 붙잡기 점 — 예: STEP이 모서리 표로 아는 B-rep 모서리의 곡선 가운데 점·원 중심.
   * 마우스 이동마다 부르므로 가볍게. id를 주지 않은 점은 고른 묶음 id로 자르고 가린다
   */
  pointsFor?: ((pick: Pick3d) => readonly SnapPoint[] | null | undefined) | null;
  /**
   * 추론 붙잡기(0.9.0, 기본 꺼짐): intersections = 커서 둘레 두 선분(선분 묶음·윤곽선)의 3D 교차점, perpendicular = 첫 측정 점에서
   * 커서 둘레 선분으로 내린 수직 발, axes = 첫 측정 점에서 X·Y·Z 축 방향(점 붙잡기가 없을 때만 — 축 색 안내선). true면 셋 모두.
   * 그물 윤곽선은 측정 중 윤곽선을 고를 때만(edges 또는 pickEdges) 쓴다
   */
  inference?: MeasureInference | boolean | null;
  /**
   * 붙잡기 한도(0.10.0, 기본 없음): 차례 값(SnapPoint.order)이 이보다 작은 앱 점만 붙잡는다(points·pointsFor 모두, 차례가 없는 점은 늘).
   * 처음 값이고, 바꿀 때는 setMeasureSnapLimit(n)(점 목록·색인을 다시 만들지 않는다)
   */
  limit?: number | null;
}

/** 측정 중 커서 아래 붙잡을 점(Viewer3d.measureHoverSnap) */
export interface MeasureHoverSnap {
  point: V3;
  /** 붙잡은 종류(붙잡지 않았으면 null) */
  snap: SnapKind | null;
  /** 축 붙잡기(snap === 'axis')면 그 축 */
  axis?: SnapAxis;
}

export interface GroupInfo {
  name: string;
  visible: boolean;
  /** 이 묶음에 든 그물·선분 묶음·점 묶음 수 */
  count: number;
}

export interface MarkerOptions {
  /** 공구 축(끝 → 자루), 기본 +Z */
  axis?: readonly number[];
  /** 실제 공구 반지름(세계 단위). 없으면 화면에서 sizePx 높이로 일정하게 */
  radius?: number;
  /** 화면 높이(화소, 기본 44) */
  sizePx?: number;
  color?: Rgba;
}

/** 측정 글 꼴(Viewer3dOptions.formatMeasure·setMeasureFormat): 받은 값으로 글 줄들을 만든다 */
export type MeasureFormat = (m: MeasureResult & { units: Scene3d['units'] }) => string[];

/** project() 결과: 세계 점의 캔버스 위치(CSS 화소, 왼쪽 위 원점)와 보이는지 */
export interface ProjectedPoint {
  /** 캔버스 CSS 화소. behind면 눈 뒤 점을 원근 나눗셈한 자리(화면에서 거울처럼 뒤집힌 쪽 — 화살표 방향을 정할 때만 쓴다) */
  x: number;
  y: number;
  /** 눈에서 본 깊이(앞쪽이 양수, 세계 단위) */
  depth: number;
  /** 원근에서 눈 뒤(깊이 ≤ 0)에 있는지(평행 투영은 늘 false) */
  behind: boolean;
  /** 눈 앞(가까운 면 안쪽)에 있고 캔버스 안에 들어오는지 */
  onScreen: boolean;
  /** 불투명 면에 가렸는지(occlusion을 줬고 음영 모드일 때만 따진다, 아니면 false) */
  occluded: boolean;
  /** onScreen이고 단면에 잘리지 않았고 (occlusion을 줬으면) 가리지 않았는지 */
  visible: boolean;
}

/** 묶음 겉모습(itemLook): 바꾼 것만 있다 */
export interface ItemLookState {
  /** 불투명도 0~1 */
  opacity?: number;
  /** false면 고르기·측정·가림에서 뺀다 */
  pickable: boolean;
  color?: Rgba;
  /** 세계에 더 건 행렬(열 우선 4×4) */
  matrix?: Float64Array;
  /** 0.9.0: 윤곽선 색(setItemEdgeColor) */
  edgeColor?: Rgba;
  /** 0.9.0: 외곽선 색(setItemProfileColor) */
  profileColor?: Rgba;
}

interface LookState {
  alpha?: number;
  pickable?: boolean;
  color?: Rgba;
  matrix?: Float64Array;
  edgeColor?: Rgba;
  profileColor?: Rgba;
}

/** setLighting 선택 */
export interface LightingOptions {
  sun: {
    /** 해 쪽 세계 방향(길이 상관없음) */
    direction: readonly number[];
    /** 세기(기본 0.85) */
    intensity?: number;
    /** 해 빛 색(기본 흰색) */
    color?: Rgba | string;
  };
  /** 주변광(기본 0.35) */
  ambient?: number;
  /** 그림자: true 또는 { size: 깊이 그림 한 변(기본 2048), bias: 깊이 치우침(기본 0.0015) } */
  shadows?: boolean | { size?: number; bias?: number };
}

/** setFog 선택 */
export interface FogOptions {
  /** 안개 색(기본 바탕색) */
  color?: Rgba | string;
  /** 눈 깊이(세계 단위): start부터 섞기 시작해 end에서 안개 색 */
  start: number;
  end: number;
}

/** setBackground 선택: 색은 CSS 색 문자열 또는 RGBA 0~1 */
export interface BackgroundOptions {
  /** 한 색 바탕(테마 바탕 대신) */
  color?: Rgba | string;
  /** 하늘(지평선 위) 꼭대기 색 — sky나 ground를 주면 기울기 바탕 */
  sky?: Rgba | string;
  /** 지평선 근처 하늘 색(없으면 sky) */
  skyHorizon?: Rgba | string;
  /** 땅(지평선 아래) 바닥 쪽 색 */
  ground?: Rgba | string;
  /** 지평선 근처 땅 색(없으면 ground) */
  groundHorizon?: Rgba | string;
}

/** toBlob(선택)·renderImage 선택 */
export interface SnapshotOptions {
  /** 그림 꼴(기본 'image/png') */
  type?: string;
  /** JPEG·WebP 품질 0~1 */
  quality?: number;
  /** 화면 화소의 몇 배로 그릴지(기본 1, 0.1~16). 선 굵기·점 크기·덧그림도 같은 비율 */
  scale?: number;
  /** 바탕을 비운다(PNG 알파) */
  transparent?: boolean;
  /** 측정·덧그림·좌표축·단면 표시를 담는다(기본 true) */
  overlays?: boolean;
}

/** pick(x, y, opts) 선택 */
export interface PickOptions {
  /** 포인터 종류('touch'면 터치 허용 거리) */
  pointerType?: string;
  /** 그물 윤곽선도 고른다(주지 않으면 Viewer3dOptions.pickEdges) */
  edges?: boolean;
}

/** 측정 덧그림 전체 선택(setAnnotations 두 번째 인자) */
export interface AnnotationOptions {
  /** 가려진 부분(선·점·글자)의 불투명도 0~1(기본 0.35, 0이면 가려진 부분은 그리지 않는다) */
  hidden?: number;
  /** 선 굵기(화면 화소, 기본 2) */
  width?: number;
}

export type Viewer3dStats = RenderStats & { frameMs: number; width: number; height: number; dpr: number; textures: TextureStats };

type Item = { kind: 'mesh'; item: Mesh3d } | { kind: 'line'; item: LineSet3d } | { kind: 'point'; item: PointSet3d };
type AnyItem = Mesh3d | LineSet3d | PointSet3d;

/** 묶음 하나의 구간 상태(숨김·강조, 합친 것)와 그로부터 만든 것 */
interface RangeState {
  hidden: IndexRange[];
  hi: IndexRange[];
  eHidden: IndexRange[];
  eHi: IndexRange[];
  /** 렌더러에 넘길 보이는 구간(숨김·강조가 하나라도 있으면) */
  parts: ItemParts | null;
  /** 숨긴 기본 도형 판정(고르기·단면 테두리) */
  test: ((i: number) => boolean) | null;
  /** 숨긴 윤곽선 판정(윤곽선 고르기) */
  eTest: ((i: number) => boolean) | null;
  /** 보이는 구간만의 세계 범위(처음 필요할 때) */
  box: Box3 | null;
}

/** 쓸 수 있는 마주 보기 설정인지(origin이 수 셋 이상 — 배열·형식 배열 모두) */
function hasBillboard(m: Mesh3d): boolean {
  const o = m.billboard?.origin as ArrayLike<number> | undefined;
  return !!o && typeof o.length === 'number' && o.length >= 3 && Number.isFinite(o[0]) && Number.isFinite(o[1]) && Number.isFinite(o[2]);
}

const rangeKind = (it: Item): 'triangle' | 'segment' | 'point' => (it.kind === 'mesh' ? 'triangle' : it.kind === 'line' ? 'segment' : 'point');

/** 묶음의 기본 도형 수(그물 = 삼각형, 선분 묶음 = 선분, 점 묶음 = 점) */
function primCount(it: Item): number {
  if (it.kind === 'mesh') return it.item.indices ? Math.floor(it.item.indices.length / 3) : Math.floor(it.item.positions.length / 9);
  if (it.kind === 'line') return Math.floor(it.item.positions.length / 6);
  return Math.floor(it.item.positions.length / 3);
}

const selPrims = (s: RangeSelection | null | undefined): readonly IndexRange[] | undefined => (!s ? undefined : Array.isArray(s) ? s : (s as { prims?: readonly IndexRange[] }).prims);
const selEdges = (s: RangeSelection | null | undefined): readonly IndexRange[] | undefined => (!s || Array.isArray(s) ? undefined : (s as { edges?: readonly IndexRange[] }).edges);

interface Section {
  /** 기준 방향(단위) */
  dir: V3;
  flip: boolean;
  /** dir·p = pos */
  pos: number;
  axis: SectionAxis | null;
  caps: SectionCaps;
  outline: boolean;
  plane: boolean;
  /** 이 평면이 자르는 묶음 id(없으면 모두) */
  items: Set<string> | null;
  id?: string;
}

interface Drag {
  mode: 'orbit' | 'pan' | 'touch';
  button: number;
  /** 누른 포인터 종류(끌기 시작 거리를 가른다) */
  pointerType: string;
  sx: number;
  sy: number;
  lx: number;
  ly: number;
  moved: boolean;
  pivot: V3 | null;
  depth: number | null;
}

const FONT = "'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', system-ui, sans-serif";
const ROT_PER_PX = 0.0085;
const CUBE_CSS = 112;
/** 그림 저장 2D 캔버스 넓이 한도(화소): iOS Safari 캔버스 한도(약 16.7 Mpx = 4096²) */
export const SNAPSHOT_MAX_PIXELS = 4096 * 4096;
/** 그림 저장 한 변 한도(화소) */
const SNAPSHOT_MAX_SIDE = 16384;
const cubeSize = (px: number): number => Math.min(160, Math.max(64, Math.round(px) || CUBE_CSS));
/** 표준 뷰 키 — 0.10.0부터 작은 모듈 camera.ts에 두고 여기서도 같은 객체를 내보낸다(opencad-viewer3d/viewer로 가져오던 앱) */
export { VIEW_KEYS };
const UNIT_LABEL: Record<Scene3d['units'], string> = { mm: 'mm', inch: 'in', m: 'm', unknown: '' };

export class Viewer3d {
  readonly host: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  private wrap: HTMLDivElement;
  private overlay: HTMLCanvasElement;
  private octx: CanvasRenderingContext2D;
  private cube: HTMLCanvasElement;
  private cctx: CanvasRenderingContext2D;
  private gl: WebGL2RenderingContext;
  private renderer: Renderer3d;
  private opts: Required<Omit<Viewer3dOptions, 'theme' | 'projection' | 'renderMode' | 'formatMeasure'>>;
  private themeOpt: Viewer3dOptions['theme'];
  private theme: Viewer3dTheme = DARK_THEME;
  private colors!: RenderColors;
  /** 단면 테두리·채우기 섞음 색(테마에서 한 번 읽는다) */
  private sectionColor: Rgba = [1, 0.37, 0.64, 1];

  private sceneRef: Scene3d | null = null;
  private items = new Map<string, Item>();
  private hiddenGroups = new Set<string>();
  private hiddenItems = new Set<string>();
  private hi = new Set<string>();
  private ranges = new Map<string, DrawRange>();
  private marker: { pos: V3; kind: MarkerKind; opts: MarkerOptions } | null = null;
  private segHi: { positions: Float32Array; opts: SegmentHighlightOptions } | null = null;
  private sec: Section | null = null;
  /** 둘째 평면부터(setSections) */
  private secMore: Section[] = [];
  /** 묶음 id → 자르는 평면 번호(단면이 바뀌면 비운다) */
  private secIdx = new Map<string, number[]>();
  /** 단면 테두리를 다시 계산할지(평면·장면·보이기가 바뀌면) */
  private cutDirty = true;
  /** 묶음 세계 범위·모형 행렬 캐시(장면을 바꾸면 새로) */
  private boxes = new WeakMap<AnyItem, Box3>();
  private models = new WeakMap<Mesh3d, { m: ArrayLike<number> | undefined }>();
  /** 보이는 묶음 목록(고르기용, 보이기를 바꾸면 null) */
  private visLists: ScenePickItems | null = null;
  /** 장면에 묶음 원점(origin)을 쓴 묶음이 있는지 — 있으면 격자도 원점 기준으로 올린다 */
  private usesOrigin = false;
  private mode: RenderMode;
  private cam: CameraState;
  private anim: { from: CameraState; to: CameraState; t0: number; dur: number } | null = null;
  private allBox: Box3 = emptyBox();
  private visBox: Box3 | null = null;
  private grid: GridSpec | null = null;
  private gridOn: boolean;
  private bvhs = new WeakMap<Float32Array, Map<Uint32Array | PrimKind, Bvh>>();
  private bvhGen = 0;
  private bvhTimer = 0;

  private cssW = 1;
  private cssH = 1;
  private dpr = 1;
  private raf = 0;
  private lost = false;
  private disposed = false;
  private interacting = false;
  private wheelTimer = 0;
  private frameMs = 0;
  /** 크기를 아직 모를 때 올린 장면은 크기가 정해지면 다시 맞춘다 */
  private sizeKnown = false;
  private pendingFit = false;
  private wheelAnchor: { x: number; y: number; t: number; p: V3 } | null = null;

  private pointers = new Map<number, { x: number; y: number }>();
  private drag: Drag | null = null;
  private touch: { dist: number; cx: number; cy: number } | null = null;
  private lastMiddle = { t: 0, x: 0, y: 0 };
  private cubeHover: V3 | null = null;
  private cubeDrag: { sx: number; sy: number; lx: number; ly: number; moved: boolean } | null = null;

  private measuring = false;
  private measurePts: V3[] = [];
  private measureHover: { p: V3; vertex: boolean; kind: SnapKind | null; axis?: SnapAxis } | null = null;
  /**
   * 측정 붙잡기 선택(0.8.0, 없으면 0.7.2 규칙 그대로)과 늘 후보인 앱 점(세계 xyz·종류·묶음 id),
   * 추론 붙잡기(0.9.0)와 앱 점 색인(0.9.0 — 점이 SNAP_INDEX_MIN개 이상일 때 처음 쓸 때 만든다)
   */
  private snapOpt: {
    midpoints: boolean;
    edges: boolean | null;
    pointsFor: MeasureSnapOptions['pointsFor'];
    src: MeasureSnapOptions;
    pts: Float64Array;
    kinds: SnapKind[];
    ids: (string | undefined)[];
    inference: Required<MeasureInference> | null;
    index: SnapPointIndex | null;
    /** 0.10.0 차례 값(점마다, 차례가 없는 점은 −Infinity — 한 점도 차례가 없으면 null)과 붙잡기 한도(없으면 null) */
    orders: Float64Array | null;
    limit: number | null;
  } | null = null;
  /** 마지막으로 측정 미리 보기를 구한 자리(0.10.0 — 한도·잠금이 바뀌면 그 자리에서 다시 구한다) */
  private lastHoverAt: { x: number; y: number; pointerType: string } | null = null;
  /** 찍은 측정 점의 붙잡은 종류와 축 붙잡기의 축(점 배열 객체 → 붙잡기) */
  private measureSnaps = new WeakMap<V3, MeasurePointSnap>();
  /** 측정 글 꼴(없으면 기본) */
  private measureFmt: MeasureFormat | null = null;
  /** 마주 보는 그물(Mesh3d.billboard)과 그 돌림을 마지막으로 맞춘 카메라 */
  private bbList: Mesh3d[] = [];
  private bbCamKey = '';
  /** 조작 방식(궤도·걷기)과 걷기 상태 */
  private nav: 'orbit' | 'walk' = 'orbit';
  private walkOpts: WalkOptions = {};
  private walkKeys = new Set<string>();
  /** 걷기 키 떼기 듣기를 푸는 함수(누르고 있는 동안만) */
  private walkRelease: (() => void) | null = null;
  private walkFast = false;
  private walkIn = { forward: 0, right: 0, up: 0, turn: 0, look: 0 };
  private walkT = 0;
  /** 바탕 바꾸기(한 색·하늘·땅) */
  private bgOpt: BackgroundOptions | null = null;
  /** 해 조명·그림자, 안개 */
  private lightOpt: LightingOptions | null = null;
  private fogOpt: FogOptions | null = null;
  /** 그림자 깊이 그림 판(그림자를 바꾸는 상태가 바뀔 때마다 늘린다) */
  private shadowVer = 0;
  /** 보여 주기 선택(외곽선·숨은 점선) */
  private renderOpts: {
    profiles: { width: number; color: Rgba | string | null } | null;
    hiddenEdges: number;
    hiddenEdgesShaded: boolean;
    hiddenEdgeColor: Rgba | string | null;
    edgeColor: Rgba | string | null;
  } = { profiles: null, hiddenEdges: 0, hiddenEdgesShaded: false, hiddenEdgeColor: null, edgeColor: null };
  /** 묶음별 겉모습(불투명도·고르기·색·행렬). 장면을 바꾸면 비운다 */
  private looks = new Map<string, LookState>();
  /** 묶음 행렬을 건 묶음 수(있으면 보이는 범위를 다시 모은다) */
  private lookMoves = 0;
  private lineModels = new WeakMap<LineSet3d | PointSet3d, ArrayLike<number>>();
  /** 앱 측정 덧그림(setAnnotations)과 계산한 모양 */
  private annos: { list: Annotation3d[]; geo: (AnnotationGeometry | null)[]; hidden: number; width: number; box: Box3 | null } | null = null;
  /** 측정 중 미리 볼 자리와 그 포인터 종류(터치 미리 보기는 터치 허용 거리로 — 이어지는 누르기와 같은 점) */
  private hoverAt: { x: number; y: number; pointerType: string } | null = null;

  private pickCbs = new Set<(p: Pick3d | null, e: PickEvent) => void>();
  private sectionCbs = new Set<(s: SectionState | null, all: SectionState[]) => void>();
  private lastClick: LastClick = { t: 0, x: 0, y: 0, n: 0 };
  /** 묶음 안 구간(숨김·강조) */
  private rangeSel = new Map<string, RangeState>();
  private rangeVer = 0;
  /** 나눠 올리기(setScene incremental): 한 프레임에 쓸 시간과 진행 알림 */
  private upload: { budget: number; cb: ((done: number, total: number) => void) | null } | null = null;
  private measureCbs = new Set<(m: MeasureResult | null) => void>();
  private camCbs = new Set<(c: CameraState) => void>();
  private lastCamKey = '';

  private ro: ResizeObserver;
  private hostPos: string | null = null;
  private off: (() => void)[] = [];

  constructor(host: HTMLElement, opts: Viewer3dOptions = {}) {
    this.host = host;
    this.opts = {
      grid: opts.grid ?? true,
      gridZ: opts.gridZ ?? 'min',
      viewCube: opts.viewCube ?? true,
      viewCubeSize: cubeSize(opts.viewCubeSize ?? CUBE_CSS),
      axes: opts.axes ?? true,
      keyboard: opts.keyboard ?? true,
      animate: opts.animate ?? true,
      pickTolerance: opts.pickTolerance ?? PICK_TOLERANCE_PX,
      touchPickTolerance: opts.touchPickTolerance ?? TOUCH_PICK_TOLERANCE_PX,
      pickEdges: opts.pickEdges ?? false,
      maxPixelRatio: opts.maxPixelRatio ?? 2,
      textureLimit: opts.textureLimit ?? TEXTURE_LIMIT,
      textureBudget: opts.textureBudget ?? TEXTURE_BUDGET,
    };
    this.themeOpt = opts.theme;
    this.measureFmt = opts.formatMeasure ?? null;
    this.gridOn = this.opts.grid;
    this.mode = opts.renderMode ?? 'shadedEdges';
    this.cam = { ...defaultCamera(), projection: opts.projection ?? 'perspective' };

    if (getComputedStyle(host).position === 'static') {
      this.hostPos = host.style.position;
      host.style.position = 'relative';
    }
    const wrap = document.createElement('div');
    wrap.className = 'v3d';
    wrap.style.cssText = 'position:absolute;inset:0;overflow:hidden;user-select:none;-webkit-user-select:none;';
    const canvas = document.createElement('canvas');
    canvas.className = 'v3d-gl';
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', '3D 보기');
    // 0.9.0: 초점 테두리는 :focus-visible 규칙(키보드 초점에서만)으로 — 캔버스에 outline:none을 직접 두지 않는다
    canvas.style.cssText = CANVAS_CSS;
    const focusCss = document.createElement('style');
    focusCss.textContent = CANVAS_FOCUS_CSS;
    const overlay = document.createElement('canvas');
    overlay.className = 'v3d-overlay';
    overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
    const cube = document.createElement('canvas');
    cube.className = 'v3d-cube';
    cube.title = '뷰 큐브: 면·모서리·구석을 누르면 그 방향으로 봅니다';
    cube.style.cssText = `position:absolute;top:8px;right:8px;width:${this.opts.viewCubeSize}px;height:${this.opts.viewCubeSize}px;cursor:pointer;touch-action:none;`;
    if (!this.opts.viewCube) cube.style.display = 'none';
    wrap.append(focusCss, canvas, overlay, cube);
    host.append(wrap);
    this.wrap = wrap;
    this.canvas = canvas;
    this.overlay = overlay;
    this.cube = cube;
    this.octx = overlay.getContext('2d')!;
    this.cctx = cube.getContext('2d')!;
    // 스텐실은 단면의 잘린 면 채우기에 쓴다
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, depth: true, stencil: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    // 만들다 실패하면 호스트를 처음 그대로 돌려 둔다(덧붙인 요소·바꾼 position)
    const undo = (): void => {
      wrap.remove();
      if (this.hostPos !== null) host.style.position = this.hostPos;
    };
    if (!gl) {
      undo();
      throw new Error('이 브라우저는 WebGL2를 지원하지 않아 3D 보기를 열 수 없습니다');
    }
    this.gl = gl;
    let renderer: Renderer3d;
    try {
      renderer = new Renderer3d(gl);
    } catch (e) {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      undo();
      throw e;
    }
    this.renderer = renderer;
    renderer.textureLimit = this.opts.textureLimit;
    renderer.textureBudget = this.opts.textureBudget;
    // 무늬를 다 풀어 올릴 때마다 다시 그린다
    renderer.onTexture = () => this.invalidate();
    this.applyTheme();

    const r = host.getBoundingClientRect();
    this.cssW = Math.max(1, r.width);
    this.cssH = Math.max(1, r.height);
    this.sizeKnown = r.width > 0 && r.height > 0;
    this.ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = e.contentRect.width, h = e.contentRect.height;
        if (w > 0 && h > 0 && (w !== this.cssW || h !== this.cssH)) {
          this.cssW = w;
          this.cssH = h;
          this.sizeKnown = true;
          if (this.pendingFit) {
            this.pendingFit = false;
            this.fit(false);
          }
          this.invalidate();
        }
      }
    });
    this.ro.observe(wrap);
    this.watchDpr();
    this.bindInput();
    this.invalidate();
  }

  // ───────────────────────── 장면 ─────────────────────────

  get scene(): Scene3d | null {
    return this.sceneRef;
  }

  /**
   * 장면 바꾸기. keepView면 카메라를 그대로 둔다(아니면 남동 등각 + 전체 보기).
   * 단면은 keepView면 같은 평면(세계 위치)을 지키고, 아니면 끈다. 묶음 안 구간(숨김·강조)은 풀린다.
   *
   * incremental을 주면 GPU 올리기를 여러 프레임에 나눈다(한 프레임 budgetMs, 기본 8 ms — 묶음 하나는 통째로).
   * 올라간 묶음부터 그리고, onProgress(올린 묶음 수, 전체)를 프레임마다 부른다(끝나면 done = total).
   * 범위·고르기·측정은 처음부터 장면 전체로 한다. 주지 않으면 예전처럼 한 번에 올린다.
   */
  setScene(
    scene: Scene3d,
    opts: { keepView?: boolean; incremental?: boolean | { budgetMs?: number }; onProgress?: (done: number, total: number) => void } = {},
  ): void {
    if (this.disposed) return;
    const hadSection = !!this.sec;
    this.sceneRef = scene;
    this.items.clear();
    this.bbList = scene.meshes.filter((m) => hasBillboard(m));
    this.bbCamKey = '';
    for (const m of scene.meshes) this.items.set(m.id, { kind: 'mesh', item: m });
    for (const l of scene.lines) this.items.set(l.id, { kind: 'line', item: l });
    for (const p of scene.points ?? []) this.items.set(p.id, { kind: 'point', item: p });
    this.hiddenGroups.clear();
    this.hiddenItems.clear();
    this.hi.clear();
    this.ranges.clear();
    this.rangeSel.clear();
    this.looks.clear();
    this.lookMoves = 0;
    this.lineModels = new WeakMap();
    this.segHi = null;
    this.measurePts = [];
    this.measureHover = null;
    this.bvhs = new WeakMap();
    this.boxes = new WeakMap();
    this.models = new WeakMap();
    this.visLists = null;
    this.cutDirty = true;
    if (!opts.keepView) {
      this.sec = null;
      this.secMore = [];
    }
    this.secIdx.clear();
    this.shadowVer++;
    this.usesOrigin = scene.meshes.some((m) => hasOrigin(m.origin)) || scene.lines.some((l) => hasOrigin(l.origin)) || (scene.points ?? []).some((p) => hasOrigin(p.origin));
    this.wheelAnchor = null;
    const inc = opts.incremental;
    this.upload = inc ? { budget: Math.max(1, (typeof inc === 'object' ? inc.budgetMs : undefined) ?? 8), cb: opts.onProgress ?? null } : null;
    if (this.gpu) this.renderer.setScene(scene, { incremental: !!inc });
    this.allBox = scene.bounds && !boxIsEmpty(scene.bounds) ? scene.bounds : sceneBounds(scene);
    this.visBox = null;
    this.rebuildGrid();
    if (!opts.keepView) {
      const a = dirToAngles(VIEW_DIRS.seIso);
      this.anim = null;
      this.cam = fitCamera({ ...this.cam, yaw: a.yaw, pitch: a.pitch }, this.visibleBox(), this.cssW / this.cssH);
      this.pendingFit = !this.sizeKnown;
    }
    this.scheduleBvh();
    // 단면이 꺼졌거나(새 장면) 장면 범위가 바뀌어 위치(t)가 달라졌으면 알린다
    if (hadSection || this.sec) this.emitSection();
    this.invalidate();
  }

  /** 장면 비우기(단면도 끈다) */
  clear(): void {
    if (this.disposed) return;
    const hadSection = !!this.sec;
    this.rangeSel.clear();
    this.looks.clear();
    this.lookMoves = 0;
    this.upload = null;
    this.sceneRef = null;
    this.items.clear();
    this.bbList = [];
    this.hi.clear();
    this.ranges.clear();
    this.segHi = null;
    this.measurePts = [];
    this.measureHover = null;
    this.marker = null;
    this.bvhs = new WeakMap();
    this.boxes = new WeakMap();
    this.models = new WeakMap();
    this.visLists = null;
    this.sec = null;
    this.secMore = [];
    this.secIdx.clear();
    this.cutDirty = true;
    this.usesOrigin = false;
    this.wheelAnchor = null;
    this.bvhGen++;
    clearTimeout(this.bvhTimer);
    if (this.gpu) this.renderer.clear();
    this.allBox = emptyBox();
    this.visBox = null;
    this.rebuildGrid();
    if (hadSection) this.emitSection();
    this.invalidate();
  }

  /**
   * 뷰어를 없앤다: 입력·관찰·타이머를 풀고 GPU 자료를 지운 뒤 문맥을 놓는다.
   * 장면·BVH·강조 같은 큰 자료의 참조도 놓는다(앱이 뷰어 객체를 들고 있어도 장면 배열이 메모리에 남지 않게). 그 뒤의 호출은 아무것도 하지 않는다.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listenWalkRelease(false);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    clearTimeout(this.bvhTimer);
    clearTimeout(this.wheelTimer);
    this.bvhGen++;
    for (const f of this.off) f();
    this.off = [];
    this.ro.disconnect();
    this.pickCbs.clear();
    this.sectionCbs.clear();
    this.rangeSel.clear();
    this.upload = null;
    this.measureCbs.clear();
    this.camCbs.clear();
    if (!this.lost) this.renderer.dispose();
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.wrap.remove();
    if (this.hostPos !== null) this.host.style.position = this.hostPos;
    this.sceneRef = null;
    this.items.clear();
    this.hi.clear();
    this.ranges.clear();
    this.segHi = null;
    this.marker = null;
    this.sec = null;
    this.secMore = [];
    this.measurePts = [];
    this.measureHover = null;
    this.bvhs = new WeakMap();
    this.boxes = new WeakMap();
    this.models = new WeakMap();
    this.visLists = null;
    this.anim = null;
    this.drag = null;
    this.touch = null;
    this.pointers.clear();
    this.wheelAnchor = null;
  }

  /** GPU에 올려도 되는지(문맥을 잃었거나 없앤 뒤가 아님) */
  private get gpu(): boolean {
    return !this.lost && !this.disposed;
  }

  // ───────────────────────── 보기 ─────────────────────────

  /** 지금 카메라(굴림·렌즈 이동은 있을 때만 들어 있다) */
  getCamera(): CameraState {
    return { ...this.cam, target: [...this.cam.target] as V3 };
  }

  setCamera(c: CameraState): void {
    this.anim = null;
    this.wheelAnchor = null;
    this.cam = { ...c, target: [...c.target] as V3 };
    this.invalidate();
  }

  /** 보이는 것 전체 보기 */
  fit(animate = this.opts.animate): void {
    this.goto(fitCamera(this.cam, this.visibleBox(), this.cssW / this.cssH), animate);
  }

  /** 주어진 항목(그물·선·점 id) 가운데 보이는 것만 맞춰 보기. 맞출 것이 없으면 전체 보기 */
  fitItems(ids: readonly string[], animate = this.opts.animate): void {
    let b = emptyBox();
    for (const id of new Set(ids)) {
      const it = this.items.get(id);
      if (it && this.visible(id, it.item.group)) b = unionBox(b, this.visibleBoundsOf(it));
    }
    if (boxIsEmpty(b)) return this.fit(animate);
    this.goto(fitCamera(this.cam, b, this.cssW / this.cssH), animate);
  }

  /** 표준 뷰(위·아래·앞·뒤·왼쪽·오른쪽·남서/남동/북동/북서 등각)로 돌리고 전체 보기 */
  setView(name: ViewName, animate = this.opts.animate): void {
    this.setViewDir(VIEW_DIRS[name], animate);
  }

  /** 눈 방향(대상 → 눈)으로 돌리고 전체 보기(굴림·렌즈 이동은 0으로) */
  setViewDir(dir: readonly number[], animate = this.opts.animate): void {
    const a = dirToAngles(dir, 0);
    const { roll: _r, shiftX: _x, shiftY: _y, ...base } = this.cam;
    void _r, _x, _y;
    this.goto(fitCamera({ ...base, yaw: a.yaw, pitch: a.pitch }, this.visibleBox(), this.cssW / this.cssH), animate);
  }

  /** 카메라 굴림(라디안, 0.7.0): 화면 위 방향을 보는 축 둘레로(+면 카메라가 반시계로 기울어 장면은 시계로). 0이면 없앤다 */
  setRoll(rad: number): void {
    if (!Number.isFinite(rad)) return;
    this.finishAnim();
    const { roll: _r, ...base } = this.cam;
    void _r;
    this.cam = rad ? { ...base, roll: rad } : base;
    this.invalidate();
  }

  /**
   * 렌즈 이동(0.7.0, 정규 장치 좌표 — 화면 반폭·반높이의 몇 배): 보는 방향은 그대로 두고 그림만 옮긴다(축 어긋난 투영).
   * 2점 투시: 앙각을 0으로 두고 shiftY로 위아래를 맞춘다(세로선이 곧다). 둘 다 0이면 없앤다. 표준 뷰(setView)는 0으로 돌린다
   */
  setLensShift(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.finishAnim();
    const { shiftX: _x, shiftY: _y, ...base } = this.cam;
    void _x, _y;
    this.cam = x || y ? { ...base, shiftX: x, shiftY: y } : base;
    this.invalidate();
  }

  setProjection(p: Projection): void {
    if (this.cam.projection === p) return;
    this.finishAnim();
    this.cam = { ...this.cam, projection: p };
    this.invalidate();
  }

  getProjection(): Projection {
    return this.cam.projection;
  }

  setRenderMode(m: RenderMode): void {
    this.mode = m;
    this.invalidate();
  }

  getRenderMode(): RenderMode {
    return this.mode;
  }

  /**
   * 보여 주기 선택(0.7.0): profiles = 화면 공간 외곽선(실루엣, true 또는 { width: CSS 화소(기본 2), color } — 음영 계열 모드와
   * 와이어프레임(0.7.2)에서 그리고 X-ray에서는 그리지 않는다. 굵기가 장치 화소 1.5 미만이면(width 1 · 화소 비율 1) 1화소로(0.7.2)),
   * hiddenEdges = 숨은 선 모드에서 면 뒤 윤곽선을 흐린 점선으로(true = 0.35, 또는 불투명도). 주지 않은 것은 그대로, null이면 끈다.
   * 점선은 그물 윤곽선(Mesh3d.edges)과 LineSet3d.hiddenEdges가 true인 선분 묶음에 그리고(0.7.1), 숨긴 구간은 빼고 묶음 불투명도를 곱한다.
   * 0.8.0: hiddenEdges에 { opacity, shaded, color }를 주면 shaded: true일 때 음영 계열 모드에서도 뒤 모서리를 점선으로(SketchUp "뒤 모서리" —
   * 그물 윤곽선은 보이는 윤곽선을 그리는 음영+윤곽·단색·무늬 없음에서만, 음영에서는 LineSet3d.hiddenEdges 선분 묶음만), color = 점선 색(기본 테마 선 색).
   * profiles.color·edgeColor에 'contrast'를 주면 바탕(setBackground 색 또는 테마 바탕)과 대비 3:1이 되는 색을 고른다.
   * edgeColor = 그물 윤곽선(Mesh3d.edges)·삼각형 변 선 색: 색을 주면 선을 그리는 모든 모드에서 그 색(강조색은 그대로),
   * 'contrast'면 와이어프레임·X-ray·숨은 선에서 모드 색(그물 색·테마 선 색)이 바탕과 3:1이 안 될 때만 테마 선 색(그것도 모자라면 검정·흰색)
   */
  setRenderOptions(o: {
    profiles?: boolean | { width?: number; color?: Rgba | string } | null;
    hiddenEdges?: boolean | number | { opacity?: number; shaded?: boolean; color?: Rgba | string | null } | null;
    edgeColor?: Rgba | string | null;
  }): void {
    if ('profiles' in o) {
      const p = o.profiles;
      this.renderOpts.profiles = !p ? null : { width: Math.max(1, (typeof p === 'object' ? p.width : undefined) ?? 2), color: typeof p === 'object' ? (p.color ?? null) : null };
    }
    if ('hiddenEdges' in o) {
      const h = o.hiddenEdges;
      if (h && typeof h === 'object') {
        this.renderOpts.hiddenEdges = Math.min(1, Math.max(0, h.opacity ?? 0.35));
        this.renderOpts.hiddenEdgesShaded = !!h.shaded;
        this.renderOpts.hiddenEdgeColor = h.color ?? null;
      } else {
        this.renderOpts.hiddenEdges = h === true ? 0.35 : typeof h === 'number' ? Math.min(1, Math.max(0, h)) : 0;
        this.renderOpts.hiddenEdgesShaded = false;
        this.renderOpts.hiddenEdgeColor = null;
      }
    }
    if ('edgeColor' in o) this.renderOpts.edgeColor = o.edgeColor ?? null;
    this.invalidate();
  }

  /**
   * 바탕(0.7.0): color = 한 색(테마 바탕 대신 — 앱이 파일 스타일을 따를 때), sky·ground = 지평선 위·아래 색(주면 하늘·땅 기울기 바탕 —
   * 지평선은 카메라 앙각을 따라 움직인다), skyHorizon·groundHorizon = 지평선 근처 색(없으면 각각 sky·ground). null이면 테마 바탕으로.
   * 색은 CSS 색 문자열 또는 RGBA 0~1. 투명 바탕 그림 저장에는 그리지 않는다
   */
  setBackground(o: BackgroundOptions | null): void {
    this.bgOpt = o ? { ...o } : null;
    this.invalidate();
  }

  get background(): BackgroundOptions | null {
    return this.bgOpt ? { ...this.bgOpt } : null;
  }

  private skyColors(bg: BackgroundOptions, base: Rgba): { sky: Rgba; skyHorizon: Rgba; ground: Rgba; groundHorizon: Rgba } {
    const c = (v: Rgba | string | undefined, d: Rgba): Rgba => (v === undefined ? d : typeof v === 'string' ? this.rgba(v) : v);
    const sky = c(bg.sky, base), ground = c(bg.ground, base);
    return { sky, skyHorizon: c(bg.skyHorizon, sky), ground, groundHorizon: c(bg.groundHorizon, ground) };
  }

  /**
   * 해 조명(0.7.0, 기본은 꺼짐 — 예전 고정 조명): sun.direction = 해 쪽 세계 방향(예: [0.4, −0.6, 0.7]), intensity(기본 0.85)·color, ambient(기본 0.35).
   * shadows면 해 쪽 평행 투영 깊이 그림(기본 2048², 3×3 PCF)으로 그림자를 드리운다 — 장면·보이기·단면·겉모습·조명이 바뀔 때만 다시 그린다. null이면 끈다
   */
  setLighting(o: LightingOptions | null): void {
    this.lightOpt = o ? { ...o, sun: { ...o.sun, direction: [...o.sun.direction] } } : null;
    this.shadowVer++;
    this.invalidate();
  }

  get lighting(): LightingOptions | null {
    return this.lightOpt ? { ...this.lightOpt, sun: { ...this.lightOpt.sun } } : null;
  }

  /** 선형 안개(0.7.0, 기본 꺼짐): 눈 깊이 start(세계 단위)부터 end까지 color(기본 바탕색)로 섞는다. 그물·선·점(덧그림 제외). null이면 끈다 */
  setFog(o: FogOptions | null): void {
    this.fogOpt = o && Number.isFinite(o.start) && Number.isFinite(o.end) ? { ...o } : null;
    this.invalidate();
  }

  get fog(): FogOptions | null {
    return this.fogOpt ? { ...this.fogOpt } : null;
  }

  /** 지금 보여 주기 선택(hiddenEdges는 불투명도, 0.8.0의 hiddenEdgesShaded·hiddenEdgeColor·edgeColor도) */
  get renderOptions(): {
    profiles: { width: number; color: Rgba | string | null } | null;
    hiddenEdges: number;
    hiddenEdgesShaded: boolean;
    hiddenEdgeColor: Rgba | string | null;
    edgeColor: Rgba | string | null;
  } {
    const r = this.renderOpts;
    return { profiles: r.profiles ? { ...r.profiles } : null, hiddenEdges: r.hiddenEdges, hiddenEdgesShaded: r.hiddenEdgesShaded, hiddenEdgeColor: r.hiddenEdgeColor, edgeColor: r.edgeColor };
  }

  /**
   * 조작 방식(0.7.0): 'orbit'(기본, 대상점 둘레 궤도) 또는 'walk'(1인칭 — 끌기 = 제자리에서 둘러보기, 휠·W/S·↑/↓ = 앞뒤, A/D = 옆, ←/→ = 돌기,
   * Q/E·PageDown/PageUp = 아래·위, Shift = 빠르게, 두 번 누르기 = 그 자리에 서기(눈높이), 터치 두 손가락 = 벌려 앞으로·끌어 옆/위아래).
   * opts: eyeHeight(세계 단위, 기본 단위별 1.6 m), speed(초당 세계 단위, 기본 보이는 범위 반지름의 0.4), tapToStand(기본 true).
   * 걷기로 바꿀 때 눈은 제자리에 두고 대상점을 눈높이만큼 앞에 둔다. 앱의 가상 조이스틱은 setWalkInput으로.
   * 0.8.0(기본 꺼짐): gravity = 바닥을 따라간다(계단·경사를 오르고 난간 밖으로 나가면 아래 바닥으로, 위아래 입력은 무시 — 켜는 순간 발밑 바닥에 선다),
   * collide = 면을 지나가지 않는다(벽 앞 radius에서 멈추고 벽을 따라 미끄러진다), stepHeight = 오를 수 있는 높이(기본 눈높이의 0.35),
   * radius = 몸 반지름(기본 눈높이의 0.18). 보이는 그물(반투명 포함, pickable: false 제외)과 부딪히고 단면에 잘린 쪽은 지나간다
   */
  setNavigation(mode: 'orbit' | 'walk', opts: WalkOptions = {}): void {
    const hadGravity = !!this.walkOpts.gravity;
    this.walkOpts = { ...this.walkOpts, ...opts };
    if (mode === this.nav) {
      // 걷는 중에 중력을 켜면 발밑 바닥에 선다
      if (mode === 'walk' && this.walkOpts.gravity && !hadGravity) {
        this.walkMove(0, 0, 0);
        this.invalidate();
      }
      return;
    }
    this.finishAnim();
    this.nav = mode;
    this.walkKeys.clear();
    this.listenWalkRelease(false);
    this.walkIn = { forward: 0, right: 0, up: 0, turn: 0, look: 0 };
    if (mode === 'walk') {
      const eye = cameraEye(this.cam);
      const back = cameraBasis(this.cam).back;
      const d = Math.max(this.eyeHeight(), 1e-6);
      this.cam = { ...this.cam, distance: d, target: [eye[0] - back[0] * d, eye[1] - back[1] * d, eye[2] - back[2] * d] };
      if (this.walkOpts.gravity) this.walkMove(0, 0, 0);
    }
    this.invalidate();
  }

  /**
   * 걷기 한 걸음(수평 앞·오른쪽, 세계 위): 중력·부딪힘을 켰으면 walkStep으로 줄이고 바닥에 맞춘다. 끄면 0.7.x 그대로(walkCamera).
   * 대상점을 눈과 같이 옮긴다(보는 방향·거리는 그대로)
   */
  private walkMove(forward: number, right: number, up: number): void {
    const w = this.walkOpts;
    const before = this.cam;
    const next = walkCamera(before, forward, right, up);
    if ((!w.gravity && !w.collide) || !this.sceneRef) {
      this.cam = next;
      return;
    }
    const eh = this.eyeHeight();
    const box = this.visibleBox();
    const eye = cameraEye(before);
    const move: V3 = [next.target[0] - before.target[0], next.target[1] - before.target[1], next.target[2] - before.target[2]];
    const drop = Math.max(eh, boxIsEmpty(box) ? eh * 10 : eye[2] - box.min[2] + eh);
    const p = walkStep(
      eye,
      move,
      { eyeHeight: eh, stepHeight: w.stepHeight ?? eh * 0.35, radius: w.radius ?? eh * 0.18, gravity: !!w.gravity, collide: !!w.collide, drop },
      (o, d, t) => this.castWorld(o, d, t),
    );
    const k: V3 = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    this.cam = { ...before, target: [before.target[0] + k[0], before.target[1] + k[1], before.target[2] + k[2]] };
  }

  /** 세계 광선이 처음 맞는 보이는 그물 면(걷기 중력·부딪힘) */
  private castWorld(origin: V3, dir: V3, tMax: number): RayHit | null {
    return castRay(origin, dir, tMax, this.visibleItems().meshes, {
      bvh: (kind, positions, indices) => this.bvhFor(kind, positions, indices, true),
      model: (m) => this.modelOf(m),
      bounds: (it) => this.boundsOf(it),
      hidden: (m) => this.rangeSel.get(m.id)?.test,
      clips: this.sec ? (m) => this.clipsFor(m.id) : undefined,
    });
  }

  get navigation(): 'orbit' | 'walk' {
    return this.nav;
  }

  /**
   * 걷기 입력(가상 조이스틱 등): forward·right·up은 −1~1(초당 speed배), turn·look은 −1~1(초당 약 90°, 왼쪽·아래가 +).
   * 0이 아닌 값이 있는 동안 프레임마다 움직인다. 모두 0이면 멈춘다
   */
  setWalkInput(i: { forward?: number; right?: number; up?: number; turn?: number; look?: number }): void {
    const c = (v: number | undefined): number => Math.max(-1, Math.min(1, Number(v) || 0));
    this.walkIn = { forward: c(i.forward), right: c(i.right), up: c(i.up), turn: c(i.turn), look: c(i.look) };
    this.invalidate();
  }

  /** 1인칭 한 걸음(세계 단위): 수평 앞·오른쪽, 세계 위 */
  walkBy(forward: number, right: number, up = 0): void {
    this.finishAnim();
    this.walkMove(forward, right, up);
    this.invalidate();
  }

  /** 제자리에서 고개 돌리기(라디안, 왼쪽·아래가 +) */
  lookBy(dYaw: number, dPitch: number): void {
    this.finishAnim();
    this.cam = lookCamera(this.cam, dYaw, dPitch);
    this.invalidate();
  }

  /** 세로 시야각(도, 10~120). 원근에서 보이는 넓이를 바꾼다(평행에서는 확대와 같다) */
  setFov(deg: number): void {
    if (!Number.isFinite(deg)) return;
    this.finishAnim();
    this.cam = { ...this.cam, fovY: (Math.max(10, Math.min(120, deg)) * Math.PI) / 180 };
    this.invalidate();
  }

  get fov(): number {
    return (this.cam.fovY * 180) / Math.PI;
  }

  /** 걷기 빠르기(초당 세계 단위) */
  private walkSpeed(): number {
    return this.walkOpts.speed ?? Math.max(boxSphere(this.visibleBox()).radius * 0.4, 1e-6);
  }

  /** 눈높이(세계 단위): 정하지 않았으면 장면 단위로 1.6 m */
  private eyeHeight(): number {
    if (this.walkOpts.eyeHeight !== undefined) return this.walkOpts.eyeHeight;
    const u = this.sceneRef?.units;
    return u === 'mm' ? 1600 : u === 'inch' ? 63 : u === 'm' ? 1.6 : Math.max(boxSphere(this.visibleBox()).radius * 0.1, 1e-6);
  }

  /** 걷기: 누른 키·조이스틱 입력만큼 이 프레임 움직이고, 입력이 남아 있으면 다음 프레임을 부른다 */
  private stepWalk(now: number): void {
    const K = this.walkKeys, I = this.walkIn;
    const key = (a: string, b: string): number => (K.has(a) || K.has(b) ? 1 : 0);
    const fw = key('w', 'ArrowUp') - key('s', 'ArrowDown') + I.forward;
    const rt = key('d', 'd') - key('a', 'a') + I.right;
    const up = key('e', 'PageUp') - key('q', 'PageDown') + I.up;
    const tn = key('ArrowLeft', 'ArrowLeft') - key('ArrowRight', 'ArrowRight') + I.turn;
    const lk = I.look;
    if (!fw && !rt && !up && !tn && !lk) {
      this.walkT = 0;
      return;
    }
    const dt = this.walkT ? Math.min(0.1, Math.max(0, (now - this.walkT) / 1000)) : 1 / 60;
    this.walkT = now;
    const v = this.walkSpeed() * (this.walkFast ? 3 : 1) * dt;
    this.anim = null;
    if (fw || rt || up) this.walkMove(fw * v, rt * v, up * v);
    if (tn || lk) this.cam = lookCamera(this.cam, tn * dt * (Math.PI / 2), lk * dt * (Math.PI / 2));
    this.invalidate();
  }

  /** 대상점 둘레 회전(라디안) */
  orbitBy(dYaw: number, dPitch: number): void {
    this.finishAnim();
    this.wheelAnchor = null;
    this.cam = orbitCamera(this.cam, dYaw, dPitch);
    this.invalidate();
  }

  /** 대상점 쪽 확대·축소(factor < 1 이면 확대) */
  zoomBy(factor: number): void {
    this.finishAnim();
    this.cam = zoomCamera(this.cam, factor, this.cam.target, this.zoomLimits());
    this.invalidate();
  }

  setGridVisible(on: boolean): void {
    this.gridOn = on;
    this.invalidate();
  }

  setGridZ(z: GridZ): void {
    this.opts.gridZ = z;
    this.rebuildGrid();
    this.invalidate();
  }

  setViewCubeVisible(on: boolean): void {
    this.opts.viewCube = on;
    this.cube.style.display = on ? '' : 'none';
    this.invalidate();
  }

  setAxesVisible(on: boolean): void {
    this.opts.axes = on;
    this.invalidate();
  }

  get gridVisible(): boolean {
    return this.gridOn;
  }

  get viewCubeVisible(): boolean {
    return this.opts.viewCube;
  }

  /** 뷰 큐브 한 변(CSS 화소, 64~160으로 자른다) */
  setViewCubeSize(px: number): void {
    this.opts.viewCubeSize = cubeSize(px);
    this.cube.style.width = this.cube.style.height = `${this.opts.viewCubeSize}px`;
    this.invalidate();
  }

  get viewCubeSize(): number {
    return this.opts.viewCubeSize;
  }

  get axesVisible(): boolean {
    return this.opts.axes;
  }

  /** 테마 바꾸기(인자 없이 부르면 CSS 변수만 다시 읽는다) */
  setTheme(theme?: Viewer3dOptions['theme']): void {
    if (theme !== undefined) this.themeOpt = theme;
    this.applyTheme();
    this.invalidate();
  }

  // ───────────────────────── 묶음·강조·범위 ─────────────────────────

  /** 묶음(group) 목록 — 처음 나온 순서 */
  groups(): GroupInfo[] {
    const out = new Map<string, GroupInfo>();
    for (const it of this.items.values()) {
      const g = it.item.group;
      if (g === undefined) continue;
      const e = out.get(g);
      if (e) e.count++;
      else out.set(g, { name: g, visible: !this.hiddenGroups.has(g), count: 1 });
    }
    return [...out.values()];
  }

  setGroupVisible(group: string, on: boolean): void {
    if (on) this.hiddenGroups.delete(group);
    else this.hiddenGroups.add(group);
    this.visibilityChanged();
  }

  /** 항목 하나 켜고 끄기(id) */
  setItemVisible(id: string, on: boolean): void {
    if (on) this.hiddenItems.delete(id);
    else this.hiddenItems.add(id);
    this.visibilityChanged();
  }

  private visibilityChanged(): void {
    this.shadowVer++;
    this.visBox = null;
    this.visLists = null;
    this.cutDirty = true;
    this.invalidate();
  }

  isVisible(id: string): boolean {
    const it = this.items.get(id);
    return !!it && this.visible(id, it.item.group);
  }

  /** 강조할 항목 id(null이면 해제) */
  highlight(ids: readonly string[] | null): void {
    this.hi = new Set(ids ?? []);
    this.invalidate();
  }

  /**
   * 선분 강조: 선분 쌍 xyz,xyz…(세계 좌표)를 강조색으로 굵게 그린다. 보이는 부분은 깊이를 따지고,
   * 가려진 부분은 opts.hidden 불투명도로 흐리게 그린다. null이면 해제, 장면을 바꾸면 풀린다.
   */
  setHighlightSegments(positions: Float32Array | null, opts: SegmentHighlightOptions = {}): void {
    if (this.disposed) return;
    this.segHi = positions && positions.length >= 6 ? { positions, opts: { ...opts } } : null;
    if (this.gpu) this.renderer.setHighlightSegments(this.segHi?.positions ?? null, this.segHi?.opts.origin);
    this.invalidate();
  }

  /**
   * 원본 번호(LineSet3d.segmentIds — 예: NC 이동 번호)로 보이는 선분 묶음에서 선분을 모아 강조한다.
   * 찾은 선분 수를 돌려준다(없으면 0이고 강조는 풀린다). null·빈 목록이면 해제.
   * 묶음 원점(origin)이 있으면 첫 묶음의 원점 기준으로 모아 큰 좌표에서도 정밀하게 그린다.
   */
  highlightSegmentIds(ids: readonly number[] | null, opts: SegmentHighlightOptions = {}): number {
    const s = this.sceneRef;
    const accept = (l: LineSet3d): boolean => this.visible(l.id, l.group);
    const base = s ? s.lines.find((l) => l.segmentIds && hasOrigin(l.origin) && accept(l))?.origin : undefined;
    const p = s && ids?.length ? segmentsById(s.lines, ids, accept, base, (l) => this.rangeSel.get(l.id)?.test) : null;
    this.setHighlightSegments(p, base ? { ...opts, origin: base } : opts);
    return p ? p.length / 6 : 0;
  }

  /**
   * 선분 묶음의 앞에서 count개만 그린다(NC 재생). null이면 전부.
   * ghost(0~1)를 주면 나머지를 그 불투명도로 흐리게 그린다.
   */
  setLineDrawRange(id: string, count: number | null, opts: { ghost?: number } = {}): void {
    if (count === null) this.ranges.delete(id);
    else this.ranges.set(id, { count: Math.max(0, Math.floor(count)), ghost: opts.ghost ?? 0 });
    this.invalidate();
  }

  /**
   * NC 재생: segmentIds가 있는 모든 선분 묶음에서 원본 번호가 limitId 이하인 앞쪽 선분만 그린다
   * (급속·공구별로 나뉜 묶음을 이동 번호 하나로 함께 돌린다. segmentIds는 오름차순이라고 본다).
   * null이면 모두 그린다. 돌려주는 값은 지금 공구 위치(그려진 선분 가운데 번호가 가장 큰 것의 끝점).
   */
  setDrawLimitBySegmentId(limitId: number | null, opts: { ghost?: number } = {}): V3 | null {
    let best: { id: number; p: V3 } | null = null;
    for (const it of this.items.values()) {
      if (it.kind !== 'line' || !it.item.segmentIds) continue;
      const l = it.item;
      if (limitId === null) {
        this.ranges.delete(l.id);
        continue;
      }
      const ids = l.segmentIds!;
      const n = countIdsUpTo(ids, Math.floor(l.positions.length / 6), limitId);
      this.ranges.set(l.id, { count: n, ghost: opts.ghost ?? 0 });
      if (n > 0 && (!best || ids[n - 1]! > best.id)) {
        const o = (n - 1) * 6 + 3;
        const g = l.origin;
        best = { id: ids[n - 1]!, p: [l.positions[o]! + (g?.[0] ?? 0), l.positions[o + 1]! + (g?.[1] ?? 0), l.positions[o + 2]! + (g?.[2] ?? 0)] };
      }
    }
    this.invalidate();
    return best ? best.p : null;
  }

  /** 공구 위치 표시(null이면 지움). kind: 'cone'(기본)·'cylinder'·'ball' */
  setMarker(pos: readonly number[] | null, kind: MarkerKind = 'cone', opts: MarkerOptions = {}): void {
    this.marker = pos ? { pos: [pos[0]!, pos[1]!, pos[2]!], kind, opts } : null;
    this.invalidate();
  }

  // ───────────────────────── 단면 ─────────────────────────

  /**
   * 단면 보기: 평면 normal·p = offset의 법선 쪽(normal·p > offset)을 잘라 낸다. null이면 끈다.
   * normal은 길이와 상관없다(단위로 맞추고 offset도 같은 비율로 나눈다). 축 방향 법선이면 축 단면(axis)으로 기억한다.
   * 잘린 쪽은 그물·선·점·윤곽선·강조 선분 모두 그리지 않고, 고르기·측정·확대 기준점에서도 무시한다.
   * 평면 하나만 둔다(setSections로 둔 다른 평면은 지운다).
   */
  setSection(s: { normal: readonly number[]; offset: number } | null, opts: SectionOptions = {}): void {
    if (this.disposed) return;
    if (!s) {
      if (!this.sec && !this.secMore.length) return;
      this.sec = null;
      this.secMore = [];
      this.sectionChanged();
      return;
    }
    const n = this.makeSection(s.normal, s.offset, this.sectionOpts(opts));
    if (!n) return;
    this.sec = n;
    this.secMore = [];
    this.sectionChanged();
  }

  /**
   * 여러 단면 평면(0.7.0, 최대 MAX_SECTION_PLANES = 6 — 상자 단면): 모든 평면의 남는 쪽(교집합)만 남긴다. null·빈 목록이면 끈다.
   * 평면마다 items(그 평면이 자르는 묶음 id, 없으면 모두)·caps·outline·plane을 따로 줄 수 있다(주지 않으면 opts, 그다음 기본값).
   * 첫 평면이 예전 단면 API(section·setSectionPosition·sectionHandle …의 기본 번호 0)의 평면이다.
   */
  setSections(list: readonly SectionPlane[] | null, opts: SectionOptions = {}): void {
    if (this.disposed) return;
    if (!list || !list.length) return this.setSection(null);
    const out: Section[] = [];
    for (const q of list.slice(0, MAX_SECTION_PLANES)) {
      const base = { caps: q.caps ?? opts.caps ?? 'closed', outline: q.outline ?? opts.outline ?? true, plane: q.plane ?? opts.plane ?? true };
      const n = this.makeSection(q.normal, q.offset, base);
      if (!n) continue;
      if (q.items) n.items = new Set(q.items);
      if (q.id !== undefined) n.id = q.id;
      out.push(n);
    }
    if (!out.length) return this.setSection(null);
    this.sec = out[0]!;
    this.secMore = out.slice(1);
    this.sectionChanged();
  }

  /** normal·p = offset 평면 → 단면(축 방향이면 축 단면). 법선이 0이거나 수가 아니면 null */
  private makeSection(normal: readonly number[], offset: number, o: Pick<Section, 'caps' | 'outline' | 'plane'>): Section | null {
    const pf = planeFrom(normal, offset);
    if (!pf) return null;
    const n = pf.normal;
    // ±축이면 축 단면으로(dir = +축, 음의 축은 flip)
    const ai = [0, 1, 2].find((i) => Math.abs(n[i]!) === 1 && n[(i + 1) % 3] === 0 && n[(i + 2) % 3] === 0);
    const ax = ai === undefined ? null : (['x', 'y', 'z'] as const)[ai]!;
    if (ax) {
      const neg = n[ai!]! < 0;
      return { ...o, dir: [...AXIS_DIRS[ax]] as V3, flip: neg, pos: neg ? -pf.offset : pf.offset, axis: ax, items: null };
    }
    return { ...o, dir: n, flip: false, pos: pf.offset, axis: null, items: null };
  }

  /**
   * 축 단면: axis(x·y·z)에 수직인 평면을 둔다. value는 장면 범위 안 위치 0~1(0 = 최소, 1 = 최대 좌표)이고 world면 그 축 좌표.
   * 기본은 +축 쪽(좌표가 위치보다 큰 쪽)을 잘라 낸다. flip이면 반대쪽. flip을 주지 않으면 같은 축의 앞 값을 지킨다.
   * 평면 하나만 둔다(setSections로 둔 다른 평면은 지운다).
   */
  setSectionAxis(axis: SectionAxis, value: number, opts: SectionOptions & { flip?: boolean; world?: boolean } = {}): void {
    if (this.disposed) return;
    const dir = [...AXIS_DIRS[axis]] as V3;
    const flip = opts.flip ?? (this.sec?.axis === axis ? this.sec.flip : false);
    const pos = opts.world ? value : this.rangeAt(dir, value);
    if (!Number.isFinite(pos)) return;
    this.sec = { ...this.sectionOpts(opts), dir, flip, pos, axis, items: null };
    this.secMore = [];
    this.sectionChanged();
  }

  /** 단면 평면을 방향은 두고 옮긴다. value는 범위 안 0~1(state.t와 같은 뜻), world면 기준 방향 위치(state.position). index는 평면 번호(기본 0) */
  setSectionPosition(value: number, opts: { world?: boolean; index?: number } = {}): void {
    const s = this.secAt(opts.index);
    if (!s) return;
    const pos = opts.world ? value : this.rangeAt(s.dir, value);
    if (!Number.isFinite(pos) || pos === s.pos) return;
    s.pos = pos;
    this.sectionChanged();
  }

  /** 잘라 내는 쪽을 뒤집는다(flip을 주면 그 값으로). index는 평면 번호(기본 0) */
  flipSection(flip?: boolean, index = 0): void {
    const s = this.secAt(index);
    if (!s) return;
    const f = flip ?? !s.flip;
    if (f === s.flip) return;
    s.flip = f;
    this.sectionChanged();
  }

  /** 단면 표시 선택만 바꾼다(채우기·테두리·평면 표시). index는 평면 번호(기본 0) */
  setSectionOptions(opts: SectionOptions, index = 0): void {
    const s = this.secAt(index);
    if (!s) return;
    Object.assign(s, { caps: opts.caps ?? s.caps, outline: opts.outline ?? s.outline, plane: opts.plane ?? s.plane });
    this.sectionChanged();
  }

  /** 지금 단면 상태(첫 평면, 없으면 null) */
  get section(): SectionState | null {
    return this.sec ? this.sectionState(this.sec) : null;
  }

  /** 모든 단면 평면 상태(차례대로, 없으면 빈 목록) */
  get sections(): SectionState[] {
    return this.allSecs().map((s) => this.sectionState(s));
  }

  private sectionState(s: Section): SectionState {
    const r = boxRange(this.allBox, s.dir);
    const k = s.flip ? -1 : 1;
    const st: SectionState = {
      normal: [s.dir[0] * k, s.dir[1] * k, s.dir[2] * k],
      offset: s.pos * k,
      axis: s.axis,
      dir: [...s.dir] as V3,
      flip: s.flip,
      position: s.pos,
      min: r.min,
      max: r.max,
      t: rangeFraction(s.pos, r),
      caps: s.caps,
      outline: s.outline,
      plane: s.plane,
    };
    if (s.items) st.items = [...s.items];
    if (s.id !== undefined) st.id = s.id;
    return st;
  }

  /** 장면 범위를 방향(축 또는 벡터 — 단위로 맞춘다)으로 잰 [min, max]. 슬라이더 눈금·단위 표시에 쓴다 */
  sectionRange(dir: SectionAxis | readonly number[]): { min: number; max: number } {
    const d = typeof dir === 'string' ? AXIS_DIRS[dir] : planeFrom(dir, 0)?.normal;
    return d ? boxRange(this.allBox, d) : { min: 0, max: 0 };
  }

  /**
   * 화면에서 단면을 끌 손잡이 정보: 장면 가운데를 평면에 내린 점의 화면 위치와 법선의 화면 방향·배율.
   * 앱은 이 점에 손잡이를 그리고, 끈 화소를 moveSectionByPixels로 넘기면 된다. 단면이 없거나 점이 눈 뒤면 null. index는 평면 번호(기본 0)
   */
  sectionHandle(index = 0): SectionHandle | null {
    const s = this.secAt(index);
    if (!s) return null;
    const c = this.sectionCenter(s);
    return sectionScreenAxis(this.frame(), c, this.sectionNormal(s));
  }

  /**
   * 화면 끌기(CSS 화소)만큼 단면을 법선 방향으로 옮기고 새 범위 위치 t(0~1)를 돌려준다.
   * 법선이 화면에 드러나면 그 방향 성분을 쓰고, 눈 쪽을 거의 바로 향하면 세로 끌기(위 = 눈 쪽)를 쓴다. 단면이 없으면 null. index는 평면 번호(기본 0)
   */
  moveSectionByPixels(dx: number, dy: number, index = 0): number | null {
    const s = this.secAt(index);
    if (!s) return null;
    const d = sectionDragDistance(this.frame(), this.sectionCenter(s), this.sectionNormal(s), dx, dy);
    if (Number.isFinite(d) && d !== 0) {
      s.pos += s.flip ? -d : d;
      this.sectionChanged();
    }
    return rangeFraction(s.pos, boxRange(this.allBox, s.dir));
  }

  private sectionOpts(o: SectionOptions): Pick<Section, 'caps' | 'outline' | 'plane'> {
    const p = this.sec;
    return { caps: o.caps ?? p?.caps ?? 'closed', outline: o.outline ?? p?.outline ?? true, plane: o.plane ?? p?.plane ?? true };
  }

  /** 모든 단면 평면(첫 평면이 앞) */
  private allSecs(): Section[] {
    return this.sec ? [this.sec, ...this.secMore] : [];
  }

  private secAt(index = 0): Section | null {
    return index === 0 ? this.sec : (this.secMore[index - 1] ?? null);
  }

  /** 여러 단면 그리기·고르기를 쓰는지(평면이 둘 이상이거나 범위를 정한 평면이 있다) — 아니면 예전 평면 하나 경로 */
  private get multiSection(): boolean {
    return !!this.sec && (this.secMore.length > 0 || !!this.sec.items);
  }

  /** 묶음 id를 자르는 평면 번호들(범위를 정하지 않은 평면은 모두를 자른다). 단면이 바뀔 때까지 기억한다 */
  private secOf(id: string): readonly number[] {
    let r = this.secIdx.get(id);
    if (!r) {
      r = [];
      this.allSecs().forEach((s, i) => {
        if (!s.items || s.items.has(id)) r!.push(i);
      });
      this.secIdx.set(id, r);
    }
    return r;
  }

  /** 묶음을 자르는 세계 평면들 */
  private clipsFor(id: string): Plane4[] {
    const all = this.allSecs();
    return this.secOf(id).map((i) => this.planeOf(all[i]!));
  }

  /** dir 방향 범위 안 위치 t → dir·p 값 */
  private rangeAt(dir: readonly number[], t: number): number {
    const r = boxRange(this.allBox, dir);
    return r.min + (r.max - r.min) * t;
  }

  private sectionNormal(s: Section): V3 {
    return s.flip ? [-s.dir[0], -s.dir[1], -s.dir[2]] : [s.dir[0], s.dir[1], s.dir[2]];
  }

  /** 단면 하나의 세계 평면(값 > 0 쪽을 버린다) */
  private planeOf(s: Section): Plane4 {
    const n = this.sectionNormal(s);
    return [n[0], n[1], n[2], s.flip ? s.pos : -s.pos];
  }

  /** 세계 단면 평면(첫 평면, 값 > 0 쪽을 버린다) */
  private sectionPlane(): Plane4 | null {
    const s = this.sec;
    if (!s) return null;
    return this.planeOf(s);
  }

  /** 장면 가운데를 평면에 내린 점 */
  private sectionCenter(s: Section): V3 {
    const c = boxIsEmpty(this.allBox) ? this.cam.target : boxCenter(this.allBox);
    const k = dot(c, s.dir) - s.pos;
    return [c[0] - s.dir[0] * k, c[1] - s.dir[1] * k, c[2] - s.dir[2] * k];
  }

  private sectionChanged(): void {
    this.shadowVer++;
    this.cutDirty = true;
    this.secIdx.clear();
    this.wheelAnchor = null;
    if (this.measuring) this.measureHover = null;
    this.invalidate();
    this.emitSection();
  }

  /**
   * 단면이 바뀔 때마다 알림(앱 호출·손잡이 끌기·setScene/clear로 꺼짐·장면 범위가 바뀜·문맥 복구). 꺼지면 null. 돌려준 함수로 끊는다.
   * 두 번째 인자는 모든 평면 상태(여러 단면일 때)
   */
  onSectionChange(cb: (s: SectionState | null, all: SectionState[]) => void): () => void {
    this.sectionCbs.add(cb);
    return () => this.sectionCbs.delete(cb);
  }

  private emitSection(): void {
    if (!this.sectionCbs.size) return;
    const st = this.section;
    const all = this.sections;
    for (const cb of this.sectionCbs) cb(st, all);
  }

  // ───────────────────────── 묶음 안 구간 ─────────────────────────

  /**
   * 묶음 안 일부 숨기기: 그물은 삼각형 번호, 선분 묶음은 선분 번호, 점 묶음은 점 번호 범위({ start, count }) 목록.
   * { prims, edges }로 주면 그물 윤곽선(Mesh3d.edges의 선분 번호)도 숨긴다(주지 않으면 윤곽선은 그대로).
   * 숨긴 구간은 그리지 않고 고르기·측정·단면 테두리·전체 보기 범위에서도 뺀다. null이면 그 묶음의 숨김을 푼다. 장면을 바꾸면 풀린다.
   */
  setHiddenRanges(id: string, sel: RangeSelection | null): void {
    const it = this.items.get(id);
    if (!it || this.disposed) return;
    const r = this.rangeState(id);
    r.hidden = mergeRanges(selPrims(sel), primCount(it));
    r.eHidden = it.kind === 'mesh' && it.item.edges ? mergeRanges(selEdges(sel), Math.floor(it.item.edges.length / 6)) : [];
    this.rangesChanged(it);
    this.visibilityChanged();
  }

  /** 그 묶음에서 숨긴 기본 도형 구간(합친 것, 없으면 빈 목록) */
  hiddenRanges(id: string): IndexRange[] {
    return (this.rangeSel.get(id)?.hidden ?? []).map((r) => ({ ...r }));
  }

  /** 모든 묶음의 구간 숨김을 푼다 */
  clearHiddenRanges(): void {
    let any = false;
    for (const [id, r] of this.rangeSel) {
      if (!r.hidden.length && !r.eHidden.length) continue;
      r.hidden = [];
      r.eHidden = [];
      this.rangesChanged(this.items.get(id)!);
      any = true;
    }
    if (any) this.visibilityChanged();
  }

  /**
   * 묶음 안 구간 강조: id → 구간 목록(그물은 삼각형, 선분 묶음은 선분, 점 묶음은 점 번호, { prims, edges }면 윤곽선도).
   * 그 구간만 강조색으로 그린다(그물은 면에 강조색을 섞고, 선·점은 강조색으로 굵게). 앞의 구간 강조를 모두 바꾼다 — null이면 해제.
   * highlight(ids)(묶음 통째 강조)와는 따로 두며 함께 써도 된다. 장면을 바꾸면 풀린다.
   */
  highlightRanges(sel: ReadonlyMap<string, RangeSelection> | Readonly<Record<string, RangeSelection>> | null): void {
    if (this.disposed) return;
    const next = new Map<string, RangeSelection>(sel instanceof Map ? sel : Object.entries(sel ?? {}));
    for (const [id, r] of this.rangeSel) {
      if (next.has(id) || (!r.hi.length && !r.eHi.length)) continue;
      r.hi = [];
      r.eHi = [];
      this.rangesChanged(this.items.get(id)!);
    }
    for (const [id, s] of next) {
      const it = this.items.get(id);
      if (!it) continue;
      const r = this.rangeState(id);
      r.hi = mergeRanges(selPrims(s), primCount(it));
      r.eHi = it.kind === 'mesh' && it.item.edges ? mergeRanges(selEdges(s), Math.floor(it.item.edges.length / 6)) : [];
      this.rangesChanged(it);
    }
    this.invalidate();
  }

  private rangeState(id: string): RangeState {
    let r = this.rangeSel.get(id);
    if (!r) this.rangeSel.set(id, (r = { hidden: [], hi: [], eHidden: [], eHi: [], parts: null, test: null, eTest: null, box: null }));
    return r;
  }

  /** 구간이 바뀐 묶음의 보이는 구간·판정·범위를 다시 만든다(모두 비면 지운다) */
  private rangesChanged(it: Item): void {
    const id = it.item.id;
    const r = this.rangeSel.get(id);
    if (!r) return;
    if (!r.hidden.length && !r.hi.length && !r.eHidden.length && !r.eHi.length) {
      this.rangeSel.delete(id);
      return;
    }
    const prims = partitionRanges(primCount(it), r.hidden, r.hi);
    let edges = null;
    if ((r.eHidden.length || r.eHi.length) && it.kind === 'mesh' && it.item.edges) edges = partitionRanges(Math.floor(it.item.edges.length / 6), r.eHidden, r.eHi);
    r.parts = { ver: ++this.rangeVer, prims, edges };
    r.test = rangeTester(r.hidden);
    r.eTest = rangeTester(r.eHidden);
    r.box = null;
  }

  /** 나눠 올리기를 budgetMs만큼 이어 가고 진행을 알린다(다 올리면 끝 알림 뒤 그만) */
  private pumpUpload(budgetMs: number): void {
    const done = this.renderer.uploadSome(budgetMs);
    this.shadowVer++;
    const p = this.renderer.uploadProgress;
    const s = this.sceneRef;
    const total = s ? s.meshes.length + s.lines.length + (s.points?.length ?? 0) : 0;
    const cb = this.upload?.cb;
    if (done) {
      if (this.upload) this.upload.cb = null;
      cb?.(total, total);
    } else {
      cb?.(p!.done, p!.total);
      this.invalidate();
    }
  }

  /** 단면 테두리(보이는 그물과 평면의 교선)를 다시 모아 올린다. 장면 가운데 기준 좌표로 모아 큰 좌표에서도 정밀하게 */
  private updateCut(): void {
    this.cutDirty = false;
    if (this.multiSection) return this.updateCutMulti();
    const s = this.sceneRef;
    const plane = this.sectionPlane();
    if (!s || !plane || !this.sec!.outline) {
      if (this.gpu) this.renderer.setSectionLines(null);
      return;
    }
    const origin: V3 = boxIsEmpty(this.allBox) ? [0, 0, 0] : boxCenter(this.allBox);
    const parts: Float32Array[] = [];
    let total = 0;
    for (const it of this.items.values()) {
      if (it.kind !== 'mesh') continue;
      const m = it.item;
      if (!this.visible(m.id, m.group) || !boxStraddles(this.boundsOf(m), plane)) continue;
      const model = this.modelOf(m);
      const segs = sectionSegments(m.positions, m.indices, planeToLocal(plane, model), this.bvhFor('triangle', m.positions, m.indices, false), this.rangeSel.get(m.id)?.test);
      if (!segs.length) continue;
      // 로컬 → 세계(double) → 장면 가운데 기준
      const M = model;
      for (let i = 0; i < segs.length; i += 3) {
        const x = segs[i]!, y = segs[i + 1]!, z = segs[i + 2]!;
        if (M) {
          segs[i] = M[0]! * x + M[4]! * y + M[8]! * z + M[12]! - origin[0];
          segs[i + 1] = M[1]! * x + M[5]! * y + M[9]! * z + M[13]! - origin[1];
          segs[i + 2] = M[2]! * x + M[6]! * y + M[10]! * z + M[14]! - origin[2];
        } else {
          segs[i] = x - origin[0];
          segs[i + 1] = y - origin[1];
          segs[i + 2] = z - origin[2];
        }
      }
      parts.push(segs);
      total += segs.length;
    }
    let all: Float32Array | null = null;
    if (total) {
      all = parts.length === 1 ? parts[0]! : new Float32Array(total);
      if (parts.length > 1) {
        let o = 0;
        for (const p of parts) {
          all.set(p, o);
          o += p.length;
        }
      }
    }
    if (this.gpu) this.renderer.setSectionLines(all, origin);
  }

  /** 여러 단면의 테두리: 평면마다 그 평면이 자르는 보이는 그물과의 교선을 모으고, 그 그물을 자르는 다른 평면들로 다시 자른다 */
  private updateCutMulti(): void {
    const sc = this.sceneRef;
    const all = this.allSecs();
    if (!sc || !all.some((q) => q.outline)) {
      if (this.gpu) this.renderer.setSectionLines(null);
      return;
    }
    const origin: V3 = boxIsEmpty(this.allBox) ? [0, 0, 0] : boxCenter(this.allBox);
    const world: number[] = [];
    all.forEach((q, k) => {
      if (!q.outline) return;
      const plane = this.planeOf(q);
      for (const it of this.items.values()) {
        if (it.kind !== 'mesh') continue;
        const m = it.item;
        const idx = this.secOf(m.id);
        if (!idx.includes(k) || !this.visible(m.id, m.group) || !boxStraddles(this.boundsOf(m), plane)) continue;
        const model = this.modelOf(m);
        const segs = sectionSegments(m.positions, m.indices, planeToLocal(plane, model), this.bvhFor('triangle', m.positions, m.indices, false), this.rangeSel.get(m.id)?.test);
        if (!segs.length) continue;
        // 로컬 → 세계(double)
        const w: number[] = new Array(segs.length);
        const M = model;
        for (let i = 0; i < segs.length; i += 3) {
          const x = segs[i]!, y = segs[i + 1]!, z = segs[i + 2]!;
          if (M) {
            w[i] = M[0]! * x + M[4]! * y + M[8]! * z + M[12]!;
            w[i + 1] = M[1]! * x + M[5]! * y + M[9]! * z + M[13]!;
            w[i + 2] = M[2]! * x + M[6]! * y + M[10]! * z + M[14]!;
          } else {
            w[i] = x;
            w[i + 1] = y;
            w[i + 2] = z;
          }
        }
        const others = idx.filter((i) => i !== k).map((i) => this.planeOf(all[i]!));
        for (const v of others.length ? clipSegments(w, others) : w) world.push(v);
      }
    });
    let out: Float32Array | null = null;
    if (world.length) {
      out = new Float32Array(world.length);
      for (let i = 0; i < world.length; i += 3) {
        out[i] = world[i]! - origin[0];
        out[i + 1] = world[i + 1]! - origin[1];
        out[i + 2] = world[i + 2]! - origin[2];
      }
    }
    if (this.gpu) this.renderer.setSectionLines(out, origin);
  }

  // ───────────────────────── 고르기·측정 ─────────────────────────

  /** 고르기 알림(빈 곳을 누르면 null). 돌려준 함수로 끊는다 */
  onPick(cb: (p: Pick3d | null, e: PickEvent) => void): () => void {
    this.pickCbs.add(cb);
    return () => this.pickCbs.delete(cb);
  }

  /** 측정 알림(두 번째 점을 찍을 때 결과, 지우거나 세 번째 점으로 새 측정을 시작하면 null) */
  onMeasure(cb: (m: MeasureResult | null) => void): () => void {
    this.measureCbs.add(cb);
    return () => this.measureCbs.delete(cb);
  }

  /** 카메라가 바뀐 프레임마다 알림 */
  onCameraChange(cb: (c: CameraState) => void): () => void {
    this.camCbs.add(cb);
    return () => this.camCbs.delete(cb);
  }

  /**
   * 화면 점(캔버스 기준 CSS 화소)에서 고르기. 두 번째 인자는 포인터 종류 문자열 또는 { pointerType, edges }:
   * pointerType이 'touch'면 터치 허용 거리(touchPickTolerance)로, 아니면 pickTolerance로. edges면 그물 윤곽선도 고른다(주지 않으면 pickEdges 선택)
   */
  pick(x: number, y: number, opts?: string | PickOptions): Pick3d | null {
    const o = typeof opts === 'string' ? { pointerType: opts } : (opts ?? {});
    return this.pickDetail(x, y, true, o.pointerType, o.edges)?.pick ?? null;
  }

  /** 누르기·측정·onPick이 그물 윤곽선도 고르는지(Viewer3dOptions.pickEdges) */
  setPickEdges(on: boolean): void {
    if (this.opts.pickEdges === on) return;
    this.opts.pickEdges = on;
    if (this.measuring) this.measureHover = null;
    if (on) this.scheduleBvh();
    this.invalidate();
  }

  get pickEdges(): boolean {
    return this.opts.pickEdges;
  }

  /**
   * 측정 점 붙잡기 넓히기(0.8.0, 기본 꺼짐 — 끄면 0.7.2처럼 꼭짓점·끝점에만): midpoints = 선분·윤곽선 가운데 점, edges = 측정 중에만 윤곽선 고르기,
   * points = 늘 후보인 앱 점(원 중심 등), pointsFor = 고른 것에 따라 앱이 더하는 점. 붙잡기 거리 안에서 화면에 가장 가까운 것을 붙잡고(같으면 꼭짓점·끝점),
   * 마우스를 올리면 표식 모양으로 종류를 보인다(끝점·꼭짓점 네모, 가운데 점 세모, 중심 ⊕, 그 밖의 앱 점 마름모). 측정 결과에 snapA·snapB가 실린다.
   * null(또는 빈 선택)이면 끈다. 장면을 바꿔도 남는다(점 목록은 앱이 장면에 맞춰 다시 준다)
   */
  setMeasureSnap(o: MeasureSnapOptions | null): void {
    const pts = o?.points ?? [];
    const inference = normalizeInference(o?.inference);
    if (!o || (!o.midpoints && o.edges === undefined && !pts.length && !o.pointsFor && !inference)) this.snapOpt = null;
    else {
      const xyz = new Float64Array(pts.length * 3);
      const kinds: SnapKind[] = [], ids: (string | undefined)[] = [];
      // 차례 값(0.10.0): 한 점이라도 있으면 점마다 둔다(없는 점은 −Infinity — 어떤 한도에도 든다)
      let ord: Float64Array | null = null;
      let n = 0;
      for (const sp of pts) {
        const q = sp.point;
        if (!q || !Number.isFinite(q[0]) || !Number.isFinite(q[1]) || !Number.isFinite(q[2])) continue;
        xyz[n * 3] = q[0]!;
        xyz[n * 3 + 1] = q[1]!;
        xyz[n * 3 + 2] = q[2]!;
        kinds.push(sp.kind ?? 'point');
        ids.push(sp.id);
        const k = sp.order;
        if (typeof k === 'number' && !Number.isNaN(k)) {
          ord ??= new Float64Array(pts.length).fill(-Infinity);
          ord[n] = k;
        }
        n++;
      }
      const src: MeasureSnapOptions = { ...o };
      if (inference) src.inference = { ...inference };
      else delete src.inference;
      const limit = snapLimit(o.limit);
      if (limit === null) delete src.limit;
      else src.limit = limit;
      const orders = ord ? ord.subarray(0, n) : null;
      const so = (this.snapOpt = { midpoints: !!o.midpoints, edges: o.edges ?? null, pointsFor: o.pointsFor ?? null, src, pts: xyz.subarray(0, n * 3), kinds, ids, inference, index: null as SnapPointIndex | null, orders, limit });
      // 앱 점이 많으면(0.9.0) 색인을 쉬는 틈에 미리 만든다(30만 개에 0.1초쯤 — 첫 마우스 이동에서 멈칫하지 않게)
      if (n >= SNAP_INDEX_MIN) {
        so.index = new SnapPointIndex(so.pts, ids, orders);
        setTimeout(() => {
          if (this.snapOpt === so && !this.disposed) so.index?.build();
        }, 0);
      }
      if (o.edges) this.scheduleBvh();
    }
    if (this.measuring) this.measureHover = null;
    this.invalidate();
  }

  /**
   * 붙잡기 한도(0.10.0): 차례 값(SnapPoint.order)이 n보다 작은 앱 점만 붙잡는다(차례가 없는 점은 늘). null(또는 Infinity)이면 한도 없음.
   * 점 목록·색인(BVH)은 그대로 두고 꺼낼 때만 거른다 — NC 재생처럼 그린 이동이 늘 때마다 setMeasureSnap({ points })를 다시 주지 않아도 된다.
   * 측정 미리 보기는 마지막 커서 자리에서 다시 구한다. 붙잡기가 꺼져 있으면(setMeasureSnap(null)) 아무것도 하지 않는다 — setMeasureSnap은 한도도 새로 정한다
   */
  setMeasureSnapLimit(n: number | null): void {
    const so = this.snapOpt;
    if (!so) return;
    const limit = snapLimit(n);
    if (limit === so.limit) return;
    so.limit = limit;
    if (limit === null) delete so.src.limit;
    else so.src.limit = limit;
    this.rehover();
  }

  /** 지금 붙잡기 한도(없거나 붙잡기가 꺼져 있으면 null) */
  get measureSnapLimit(): number | null {
    return this.snapOpt?.limit ?? null;
  }

  /** 측정 미리 보기가 보이는 동안 그 자리에서 다시 구한다(0.10.0 — 붙잡기 한도·추론 잠금이 바뀌었을 때) */
  private rehover(): void {
    if (this.measuring && this.measureHover && this.lastHoverAt && !this.drag) {
      this.hoverAt = this.lastHoverAt;
      this.invalidate();
    }
  }

  /** 지금 측정 붙잡기 선택(꺼져 있으면 null). inference는 0.9.0부터 세 값으로 편 꼴 */
  get measureSnap(): MeasureSnapOptions | null {
    if (!this.snapOpt) return null;
    const r = { ...this.snapOpt.src };
    if (r.inference) r.inference = { ...(r.inference as Required<MeasureInference>) };
    return r;
  }

  /**
   * 측정 중 커서 아래 붙잡을 점과 그 종류(0.8.0 — 앱이 상태 줄에 "끝점·가운데 점·중심"을 보일 때), 축 붙잡기면 그 축(0.9.0).
   * 측정 중이 아니거나 없으면 null
   */
  get measureHoverSnap(): MeasureHoverSnap | null {
    const h = this.measuring ? this.measureHover : null;
    if (!h) return null;
    const r: MeasureHoverSnap = { point: [...h.p] as V3, snap: h.kind };
    if (h.axis) r.axis = h.axis;
    return r;
  }

  /** 측정 모드(두 점 거리·dx dy dz). 끄면 측정도 지운다 */
  setMeasureMode(on: boolean): void {
    this.measuring = on;
    this.canvas.style.cursor = on ? 'crosshair' : '';
    if (!on) this.clearMeasure();
    this.invalidate();
  }

  get measureMode(): boolean {
    return this.measuring;
  }

  /** 지금 찍힌 측정 점 수(0~2) */
  get measurePointCount(): number {
    return this.measurePts.length;
  }

  clearMeasure(): void {
    const had = this.measurePts.length > 0;
    this.measurePts = [];
    this.measureHover = null;
    if (had) for (const cb of this.measureCbs) cb(null);
    this.invalidate();
  }

  /** 지금 측정 결과(두 점이 있을 때) */
  measurement(): MeasureResult | null {
    const [a, b] = this.measurePts;
    if (!a || !b) return null;
    return measureResult(a, b, this.snapOpt ? [this.measureSnaps.get(a), this.measureSnaps.get(b)] : null);
  }

  // ───────────────────────── 화면 위치·측정 덧그림 ─────────────────────────

  /**
   * 세계 점 → 캔버스 위치(CSS 화소, 왼쪽 위 원점)·깊이·보이는지. 앱이 화면 위에 자기 표시(글자·단추)를 붙일 때 쓴다.
   * occlusion이면 음영 모드에서 그 점이 불투명 면에 가렸는지도 따진다(고르기와 같은 광선 — 점이 면 위에 있으면 보인다).
   */
  project(p: readonly number[], opts: { occlusion?: boolean } = {}): ProjectedPoint | null {
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) return null;
    const f = this.frame();
    const depth = viewDepth(f, p);
    const c = transform4(f.viewProj, p[0]!, p[1]!, p[2]!);
    if (!(Math.abs(c[3]) > 1e-12)) return null;
    const x = ((c[0] / c[3] + 1) / 2) * f.width, y = ((1 - c[1] / c[3]) / 2) * f.height;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const behind = f.projection === 'perspective' && c[3] <= 0;
    const front = f.projection === 'orthographic' || (!behind && depth >= f.near * 0.999);
    const onScreen = front && x >= 0 && x <= this.cssW && y >= 0 && y <= this.cssH;
    const cut = this.pointCut(p);
    const occluded = !!opts.occlusion && onScreen && !cut && this.occludedAt(f, p, x, y, true);
    return { x, y, depth, behind, onScreen, occluded, visible: onScreen && !cut && !occluded };
  }

  /**
   * 두 묶음(그물·선분·점 묶음 id) 사이 가장 가까운 두 점과 거리(세계 좌표). 묶음 원점·행렬을 반영하고 숨긴 구간은 뺀다.
   * 이미 만든 BVH를 쓴다(없으면 만든다). 서로 걸치면 거리 0. maxDistance를 주면 그보다 멀면 null. 없는 id·빈 묶음도 null
   */
  closestPoints(idA: string, idB: string, opts: { maxDistance?: number } = {}): ClosestResult | null {
    const a = this.closestShape(idA), b = this.closestShape(idB);
    if (!a || !b) return null;
    return closestBetween(a, b, opts);
  }

  private closestShape(id: string): ClosestShape | null {
    const it = this.items.get(id);
    if (!it) return null;
    const skip = this.rangeSel.get(id)?.test ?? null;
    if (it.kind === 'mesh') {
      const m = it.item;
      const bvh = this.bvhFor('triangle', m.positions, m.indices, true);
      return bvh ? { kind: 'triangle', positions: m.positions, indices: m.indices, bvh, model: this.modelOf(m), skip } : null;
    }
    const kind = it.kind === 'line' ? 'segment' : 'point';
    const bvh = this.bvhFor(kind, it.item.positions, undefined, true);
    const o = it.item.origin;
    return bvh ? { kind, positions: it.item.positions, bvh, model: this.lineModel(it.item) ?? (hasOrigin(o) ? translation(o) : undefined), skip } : null;
  }

  // ───────────────────────── 묶음 겉모습 ─────────────────────────

  /**
   * 묶음(그물·선·점 id) 불투명도 0~1(묶음 색 알파에 곱한다, null이면 되돌림). 1보다 작으면 반투명 차례에 뒤에서 앞으로 그린다.
   * pickable: false면 고르기·측정·가림(덧그림·윤곽선)에서 뺀다(유령처럼 흐리게 둘 때). null로 되돌리면 pickable도 true로
   */
  setItemOpacity(id: string, alpha: number | null, opts: { pickable?: boolean } = {}): void {
    if (this.disposed) return;
    const l = this.looks.get(id) ?? {};
    if (alpha === null) {
      delete l.alpha;
      delete l.pickable;
    } else {
      l.alpha = Math.min(1, Math.max(0, Number(alpha) || 0));
      if (opts.pickable !== undefined) l.pickable = opts.pickable;
    }
    this.setLook(id, l, false);
  }

  /** 묶음 색 바꾸기(정점 색·무늬 대신 이 색 — 태그·부품별 색). CSS 색 문자열 또는 RGBA 0~1. null이면 되돌림 */
  setItemColor(id: string, color: Rgba | string | null): void {
    if (this.disposed) return;
    const l = this.looks.get(id) ?? {};
    if (color === null) delete l.color;
    else l.color = typeof color === 'string' ? this.rgba(color) : ([color[0], color[1], color[2], color[3] ?? 1] as Rgba);
    this.setLook(id, l, false);
  }

  /**
   * 묶음에 세계 행렬을 더 건다(열 우선 4×4, 세계' = matrix · 세계 — 분해도·움직이기). null이면 되돌림.
   * 그리기·고르기·측정·범위(전체 보기)·단면·최근접점이 모두 이 행렬을 따른다. 큰 좌표면 행렬을 장면 원점 근처에서 만든다
   */
  setItemMatrix(id: string, matrix: ArrayLike<number> | null): void {
    if (this.disposed) return;
    const l = this.looks.get(id) ?? {};
    if (matrix === null) delete l.matrix;
    else if (matrix.length >= 16 && Array.from(matrix).slice(0, 16).every((v) => Number.isFinite(v))) l.matrix = Float64Array.from(Array.from(matrix).slice(0, 16));
    else return;
    this.setLook(id, l, true);
  }

  /**
   * 그물 윤곽선 색(0.9.0): 그 그물의 윤곽선(Mesh3d.edges)·삼각형 변(와이어프레임·숨은 선)을 이 색으로 — 재질별·묶음별 모서리 색.
   * 전역 setRenderOptions({ edgeColor })보다 먼저 쓰고(강조색이 가장 먼저, X-ray는 알파에 0.9), edgeColor: 'contrast'면 이 색에도 바탕 대비를 따진다.
   * CSS 색 문자열 또는 RGBA 0~1. null이면 되돌림. 숨은 점선(뒤 모서리) 색은 바꾸지 않는다
   */
  setItemEdgeColor(id: string, color: Rgba | string | null): void {
    if (this.disposed) return;
    const l = this.looks.get(id) ?? {};
    if (color === null) delete l.edgeColor;
    else l.edgeColor = typeof color === 'string' ? this.rgba(color) : ([color[0], color[1], color[2], color[3] ?? 1] as Rgba);
    this.setLook(id, l, false);
  }

  /**
   * 그물 외곽선 색(0.9.0): 외곽선(setRenderOptions({ profiles }))이 이 그물이 앞에 있는 곳에서 이 색 — 그물이 뒤 그물·바탕과 맞닿은 테두리와
   * 구멍 테두리. 앞 그물이 뒤 그물 위에 겹친 테두리는 앞 그물의 색이다. 주지 않은 그물은 profiles.color.
   * 한 그물이라도 색을 주면 외곽선 깊이 그림과 함께 화면 크기 색 그림(RGBA8) 한 장을 더 그린다(모두 되돌리면 놓는다). null이면 되돌림
   */
  setItemProfileColor(id: string, color: Rgba | string | null): void {
    if (this.disposed) return;
    const l = this.looks.get(id) ?? {};
    if (color === null) delete l.profileColor;
    else l.profileColor = typeof color === 'string' ? this.rgba(color) : ([color[0], color[1], color[2], color[3] ?? 1] as Rgba);
    this.setLook(id, l, false);
  }

  /** 묶음 겉모습(바꾼 것만, 없으면 null) */
  itemLook(id: string): ItemLookState | null {
    const l = this.looks.get(id);
    if (!l) return null;
    const out: ItemLookState = { pickable: l.pickable !== false };
    if (l.alpha !== undefined) out.opacity = l.alpha;
    if (l.color) out.color = l.color;
    if (l.matrix) out.matrix = new Float64Array(l.matrix);
    if (l.edgeColor) out.edgeColor = l.edgeColor;
    if (l.profileColor) out.profileColor = l.profileColor;
    return out;
  }

  /** 모든 묶음 겉모습을 되돌린다 */
  clearItemLooks(): void {
    if (!this.looks.size) return;
    const moved = this.lookMoves > 0;
    this.looks.clear();
    this.lookChanged(moved);
  }

  private setLook(id: string, l: LookState, moved: boolean): void {
    if (!this.items.has(id)) return;
    if (l.alpha === undefined && l.pickable === undefined && !l.color && !l.matrix && !l.edgeColor && !l.profileColor) this.looks.delete(id);
    else this.looks.set(id, l);
    this.lookChanged(moved);
  }

  private lookChanged(moved: boolean): void {
    this.shadowVer++;
    let n = 0;
    for (const l of this.looks.values()) if (l.matrix) n++;
    this.lookMoves = n;
    this.visLists = null;
    if (moved) {
      this.boxes = new WeakMap();
      this.models = new WeakMap();
      this.lineModels = new WeakMap();
      for (const r of this.rangeSel.values()) r.box = null;
      this.visBox = null;
      this.cutDirty = true;
      this.wheelAnchor = null;
    }
    if (this.measuring) this.measureHover = null;
    this.invalidate();
  }

  /** 측정 글 꼴 바꾸기(null이면 기본). 내장 측정과 글을 주지 않은 거리 덧그림에 쓴다 */
  setMeasureFormat(fn: MeasureFormat | null): void {
    this.measureFmt = fn ?? null;
    this.invalidate();
  }

  /**
   * 앱 측정 덧그림: 거리(a–b)·각(꼭짓점 a, 팔 b·c)·반지름(중심 a, 원 위 b, normal을 주면 원도)·점(a)을 내장 측정과 같은 모양으로 그린다.
   * 선은 깊이를 따져 가려진 부분을 흐리게(opts.hidden), 점·글자는 가려지면 흐리게 그린다. 단면으로 자르지 않고 그림 저장(toBlob)에도 담긴다.
   * 앞의 덧그림을 모두 바꾸고 null이면 지운다. 장면을 바꿔도 남는다(앱이 지운다).
   */
  setAnnotations(list: readonly Annotation3d[] | null, opts: AnnotationOptions = {}): void {
    if (this.disposed) return;
    if (!list || !list.length) {
      if (!this.annos) return;
      this.annos = null;
      if (this.gpu) this.renderer.setAnnotationLines(null, null);
      this.invalidate();
      return;
    }
    const copy = list.map((a) => ({ ...a }));
    const geo = copy.map((a) => annotationGeometry(a));
    // 선·점이 닿는 범위(가까운·먼 면에 넣는다)
    const box = emptyBox();
    for (const g of geo) {
      if (!g) continue;
      for (let i = 0; i + 2 < g.segs.length; i += 3) expandPoint(box, g.segs[i]!, g.segs[i + 1]!, g.segs[i + 2]!);
      for (const p of g.dots) expandPoint(box, p[0], p[1], p[2]);
      expandPoint(box, g.labelAt[0], g.labelAt[1], g.labelAt[2]);
    }
    this.annos = {
      list: copy,
      geo,
      hidden: Math.min(1, Math.max(0, opts.hidden ?? 0.35)),
      width: Math.max(0.5, opts.width ?? 2),
      box: boxIsEmpty(box) ? null : box,
    };
    this.uploadAnnotations();
    this.invalidate();
  }

  /** 지금 측정 덧그림(복사본, 없으면 빈 목록) */
  get annotations(): Annotation3d[] {
    return this.annos ? this.annos.list.map((a) => ({ ...a })) : [];
  }

  /** 덧그림 선을 첫 점 기준 좌표로 모아 올린다(큰 좌표에서도 정밀하게) */
  private uploadAnnotations(): void {
    const A = this.annos;
    if (!this.gpu) return;
    if (!A) {
      this.renderer.setAnnotationLines(null, null);
      return;
    }
    let n = 0;
    for (const g of A.geo) if (g) n += g.segs.length;
    const first = A.geo.find((g) => g)?.dots[0];
    if (!n || !first) {
      this.renderer.setAnnotationLines(null, null);
      return;
    }
    const o: V3 = [first[0], first[1], first[2]];
    const pos = new Float32Array(n);
    const col = new Float32Array((n / 3) * 4);
    let k = 0, c = 0;
    A.geo.forEach((g, i) => {
      if (!g) return;
      const rgba = this.rgba(A.list[i]!.color ?? this.theme.measure);
      for (let j = 0; j < g.segs.length; j += 3) {
        pos[k++] = g.segs[j]! - o[0];
        pos[k++] = g.segs[j + 1]! - o[1];
        pos[k++] = g.segs[j + 2]! - o[2];
        col.set(rgba, c);
        c += 4;
      }
    });
    this.renderer.setAnnotationLines(pos, col, o);
  }

  /** 세계 점이 단면에 잘리는 쪽에 있는지 */
  /** 세계 점이 단면(범위를 정하지 않은 평면)의 잘린 쪽에 있는지 */
  private pointCut(p: readonly number[]): boolean {
    for (const q of this.allSecs()) {
      if (q.items) continue;
      const plane = this.planeOf(q);
      if (planeValue(plane, p[0]!, p[1]!, p[2]!) > 1e-9 * (Math.abs(plane[3]) + 1)) return true;
    }
    return false;
  }

  /** 음영 모드에서 세계 점 p(화면 x, y)가 불투명 면에 가렸는지. build면 BVH가 없을 때 만든다 */
  private occludedAt(f: ViewFrame, p: readonly number[], x: number, y: number, build: boolean): boolean {
    if (!this.sceneRef || !this.shadedMode) return false;
    const d = viewDepth(f, p);
    const od = occludingDepth(f, x, y, this.visibleItems(), {
      bvh: (kind, positions, indices) => this.bvhFor(kind, positions, indices, build),
      limit: (id) => this.ranges.get(id)?.count,
      bounds: (it) => this.boundsOf(it),
      model: (m) => this.modelOf(m),
      ...this.clipOpts(),
      hidden: (it) => this.rangeSel.get(it.id)?.test,
    });
    return od < d - Math.max(Math.abs(d) * 1e-4, worldPerPixel(f, d) * 2, 1e-9);
  }

  // ───────────────────────── 출력 ─────────────────────────

  /**
   * 지금 화면(덧그림 포함, 뷰 큐브 제외)을 그림 파일로. 첫 인자로 선택을 주면 화면 밖에서 다시 그린다:
   * scale(화면 화소의 몇 배, 기본 1 — 굵기·점 크기도 같은 비율), transparent(바탕을 비운 PNG), overlays(측정·덧그림·좌표축·단면 표시, 기본 true),
   * type·quality. 너무 크면(한 변 GPU 한도·전체 약 4천만 화소) 비율을 줄인다
   */
  toBlob(type: string | SnapshotOptions = 'image/png', quality?: number): Promise<Blob> {
    if (typeof type === 'object') return this.snapshotBlob(type);
    // 나눠 올리는 중이면 그림에는 다 올린 장면을 담는다
    if (this.gpu && this.renderer.uploading) this.pumpUpload(Infinity);
    this.renderNow();
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(this.canvas, 0, 0);
    ctx.drawImage(this.overlay, 0, 0);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('그림을 만들지 못했습니다'))), type, quality));
  }

  /** 화면 밖 그리기로 그림 만들기(toBlob 선택). 실패하면 무엇이 문제인지 적은 Error로 거절한다 */
  private async snapshotBlob(o: SnapshotOptions): Promise<Blob> {
    const type = o.type ?? 'image/png';
    const c = this.renderCanvas(o);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error(`그림을 만들지 못했습니다(${c.width}×${c.height})`))), type, o.quality));
  }

  /**
   * 화면 밖 그림의 실제 크기와 배율(화면 CSS 화소 대비). scale을 GPU 한 변 한도·2D 캔버스 넓이 한도(SNAPSHOT_MAX_PIXELS,
   * iOS Safari도 되는 4096² 화소)에 맞춰 줄인 값이다 — toBlob·renderImage가 이 크기로 그린다
   */
  snapshotSize(o: Pick<SnapshotOptions, 'scale'> = {}): { width: number; height: number; scale: number } {
    const gl = this.gl;
    const dpr = this.dpr || 1;
    const lost = !this.gpu;
    const maxRb = lost ? 4096 : Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)) || 4096;
    const vp = lost ? null : (gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array | null);
    const maxSide = Math.min(maxRb, vp?.[0] ?? maxRb, vp?.[1] ?? maxRb, SNAPSHOT_MAX_SIDE);
    const want = Number.isFinite(o.scale) && o.scale! > 0 ? Math.min(16, Math.max(0.1, o.scale!)) : 1;
    let k = want * dpr;
    const W0 = this.cssW * k, H0 = this.cssH * k;
    k *= Math.min(1, maxSide / W0, maxSide / H0, Math.sqrt(SNAPSHOT_MAX_PIXELS / (W0 * H0)));
    // 화면 캔버스와 같은 반올림(1배면 화면 그림과 같은 크기)
    const width = Math.max(1, Math.round(this.cssW * k)), height = Math.max(1, Math.round(this.cssH * k));
    return { width, height, scale: width / this.cssW / dpr };
  }

  /**
   * 화면 밖에서 그린 화소(ImageData, 덧그림 포함). scale·transparent·overlays는 toBlob 선택과 같다(실제 크기는 snapshotSize).
   * GPU 다중 표본 버퍼에 그리고 읽어 온다(화면 캔버스는 건드리지 않는다)
   */
  renderImage(o: Omit<SnapshotOptions, 'type' | 'quality'> = {}): ImageData {
    if (o.overlays === false) return this.renderPixels(o).data;
    const c = this.renderCanvas(o);
    return c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
  }

  /** 화면 밖 그림을 2D 캔버스 하나에(덧그림은 같은 캔버스 위에 같은 배율로) */
  private renderCanvas(o: Omit<SnapshotOptions, 'type' | 'quality'>): HTMLCanvasElement {
    const { data, f, k } = this.renderPixels(o);
    const c = document.createElement('canvas');
    c.width = data.width;
    c.height = data.height;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error(`그림 저장용 2D 캔버스를 만들지 못했습니다(${data.width}×${data.height} — 기기 한도를 넘었을 수 있습니다)`);
    ctx.putImageData(data, 0, 0);
    if (o.overlays ?? true) this.drawOverlayOn(ctx, f, k);
    return c;
  }

  /** GPU에 화면 밖으로 그려 화소를 읽는다(읽은 버퍼를 그대로 ImageData로 — 위아래 뒤집기·알파 곱 풀기는 그 자리에서) */
  private renderPixels(o: Omit<SnapshotOptions, 'type' | 'quality'>): { data: ImageData; f: ViewFrame; k: number } {
    if (!this.gpu) throw new Error('3D 보기 문맥이 없어 그림을 만들 수 없습니다');
    if (this.renderer.uploading) this.pumpUpload(Infinity);
    const gl = this.gl;
    const { width: W, height: H } = this.snapshotSize(o);
    const k = W / this.cssW;
    // 다중 표본은 GPU 메모리를 표본 수만큼 쓴다: 크면 줄이고 아주 크면 한 표본(배율 자체가 덜 계단지게 한다)
    const maxS = Number(gl.getParameter(gl.MAX_SAMPLES)) || 0;
    const samples = Math.min(maxS, W * H <= 4.2e6 ? 4 : W * H <= 8.4e6 ? 2 : 0);
    const f = this.frame();
    // 그리기 버퍼: 다중 표본 색·깊이·스텐실 → 한 표본 색으로 풀기
    const fb = gl.createFramebuffer()!, rbC = gl.createRenderbuffer()!, rbD = gl.createRenderbuffer()!;
    const fb2 = gl.createFramebuffer()!, rb2 = gl.createRenderbuffer()!;
    let data: ImageData;
    try {
      gl.bindRenderbuffer(gl.RENDERBUFFER, rbC);
      if (samples > 0) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, W, H);
      else gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, W, H);
      gl.bindRenderbuffer(gl.RENDERBUFFER, rbD);
      if (samples > 0) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH24_STENCIL8, W, H);
      else gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, W, H);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rbC);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, rbD);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`그림 저장용 GPU 버퍼를 만들지 못했습니다(${W}×${H})`);
      if (this.cutDirty) {
        if (this.sec) this.updateCut();
        else {
          this.cutDirty = false;
          this.renderer.setSectionLines(null);
        }
      }
      const st = this.renderState(f, k);
      st.viewport = [W, H];
      if (o.transparent) st.transparent = true;
      if (o.overlays === false) st.annotations = null;
      this.renderer.render(f, W, H, st);
      // 한 표본으로 풀어 읽는다(ImageData 버퍼에 바로)
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb2);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, W, H);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb2);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb2);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fb2);
      gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb2);
      data = new ImageData(W, H);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(data.data.buffer, data.data.byteOffset, data.data.byteLength));
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
      gl.deleteFramebuffer(fb);
      gl.deleteFramebuffer(fb2);
      gl.deleteRenderbuffer(rbC);
      gl.deleteRenderbuffer(rbD);
      gl.deleteRenderbuffer(rb2);
      this.invalidate();
    }
    // 아래에서 위로 → 위에서 아래로(줄 하나 임시), 투명 바탕이면 알파 곱을 풀고 아니면 알파를 채운다
    const D = data.data;
    const row = W * 4;
    const tmp = new Uint8ClampedArray(row);
    for (let y = 0; y < H >> 1; y++) {
      const a = y * row, b = (H - 1 - y) * row;
      tmp.set(D.subarray(a, a + row));
      D.copyWithin(a, b, b + row);
      D.set(tmp, b);
    }
    if (o.transparent) {
      for (let i = 0; i < D.length; i += 4) {
        const a = D[i + 3]!;
        if (a > 0 && a < 255) {
          D[i] = Math.min(255, Math.round((D[i]! * 255) / a));
          D[i + 1] = Math.min(255, Math.round((D[i + 1]! * 255) / a));
          D[i + 2] = Math.min(255, Math.round((D[i + 2]! * 255) / a));
        }
      }
    } else for (let i = 3; i < D.length; i += 4) D[i] = 255;
    return { data, f, k };
  }

  /**
   * 창 확대: 화면 사각형(캔버스 CSS 화소 두 구석)이 화면을 채우게 한다. 사각형 가운데 아래 점(없으면 대상점 깊이)을 화면 가운데로 옮기고
   * 그 깊이에서 사각형이 꼭 맞게 확대한다. 너무 작은 사각형(2화소 미만)은 무시한다
   */
  zoomToRect(x0: number, y0: number, x1: number, y1: number, animate = this.opts.animate): void {
    if (this.disposed || Math.abs(x1 - x0) < 2 || Math.abs(y1 - y0) < 2) return;
    this.finishAnim();
    const f = this.frame();
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const hit = this.pickDetail(cx, cy, true);
    const depth = hit ? viewDepth(f, hit.pick.point) : viewDepth(f, this.cam.target);
    this.goto(rectZoomCamera(this.cam, f, x0, y0, x1, y1, depth, this.zoomLimits()), animate);
  }

  /** 기다리지 않고 바로 그린다 */
  renderNow(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.draw(performance.now());
  }

  get stats(): Viewer3dStats {
    return { ...this.renderer.stats, frameMs: this.frameMs, width: this.canvas.width, height: this.canvas.height, dpr: this.dpr, textures: this.renderer.textureStats };
  }

  // ───────────────────────── 내부: 상태 ─────────────────────────

  private visible(id: string, group: string | undefined): boolean {
    return !this.hiddenItems.has(id) && (group === undefined || !this.hiddenGroups.has(group));
  }

  private visibleBox(): Box3 {
    if (this.visBox) return this.visBox;
    const s = this.sceneRef;
    if (!s) return (this.visBox = emptyBox());
    let ranged = false;
    for (const r of this.rangeSel.values()) if (r.hidden.length) ranged = true;
    if (!this.hiddenGroups.size && !this.hiddenItems.size && !ranged && !this.lookMoves && !this.bbList.length) return (this.visBox = this.allBox);
    let b = emptyBox();
    for (const it of this.items.values()) if (this.visible(it.item.id, it.item.group)) b = unionBox(b, this.visibleBoundsOf(it));
    return (this.visBox = boxIsEmpty(b) ? this.allBox : b);
  }

  /** 묶음의 보이는 세계 범위(묶음 안 숨긴 구간을 빼고) */
  private visibleBoundsOf(it: Item): Box3 {
    const r = this.rangeSel.get(it.item.id);
    if (!r || !r.hidden.length || !r.parts) return this.boundsOf(it.item);
    if (!r.box) {
      r.box = itemRangesBounds(it.item, rangeKind(it), r.parts.prims);
      const lm = this.looks.get(it.item.id)?.matrix;
      if (lm) r.box = transformBox(r.box, lm);
    }
    return r.box;
  }

  private rebuildGrid(): void {
    const g = (this.grid = gridSpec(this.allBox, this.opts.gridZ));
    // 묶음 원점을 쓰는 장면(큰 좌표)이면 격자도 가운데 기준 좌표로 올린다(원점이 없는 장면은 예전 그대로)
    const o: V3 | null = this.usesOrigin ? [(g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, g.z] : null;
    if (this.gpu) this.renderer.setGrid(gridLines(g, o), o);
  }

  private zoomLimits(): { min: number; max: number } {
    const r = boxSphere(this.visibleBox()).radius;
    return { min: Math.max(r * 1e-6, 1e-9), max: r * 1e4 };
  }

  private goto(c: CameraState, animate: boolean): void {
    this.wheelAnchor = null;
    if (animate) {
      this.anim = { from: this.getCamera(), to: c, t0: performance.now(), dur: 320 };
    } else {
      this.anim = null;
      this.cam = c;
    }
    this.invalidate();
  }

  private finishAnim(): void {
    if (!this.anim) return;
    this.cam = this.anim.to;
    this.anim = null;
  }

  private applyTheme(): void {
    const t = this.themeOpt;
    const base = t === 'light' || (typeof t === 'object' && t.base === 'light') ? LIGHT_THEME : DARK_THEME;
    const theme: Viewer3dTheme = { ...base, ...(typeof t === 'object' ? t : {}) };
    delete (theme as { base?: unknown }).base;
    const cs = getComputedStyle(this.host);
    for (const k of Object.keys(THEME_CSS_VARS) as (keyof Viewer3dTheme)[]) {
      const v = cs.getPropertyValue(THEME_CSS_VARS[k]).trim();
      if (v) theme[k] = v;
    }
    this.theme = theme;
    this.wrap.style.setProperty('--v3d-focus-default', base === LIGHT_THEME ? FOCUS_DEFAULT.light : FOCUS_DEFAULT.dark);
    const c = (s: string): Rgba => this.rgba(s);
    const line: Rgba = base === LIGHT_THEME ? [0.15, 0.2, 0.28, 1] : [0.85, 0.88, 0.92, 1];
    this.colors = {
      ...(theme.monochrome ? { monochrome: c(theme.monochrome) } : {}),
      background: c(theme.background),
      edge: c(theme.edge),
      line,
      point: c(theme.measure),
      grid: c(theme.grid),
      gridMinor: c(theme.gridMinor),
      axisX: c(theme.axisX),
      axisY: c(theme.axisY),
      highlight: c(theme.highlight),
    };
    this.sectionColor = c(theme.section ?? base.section ?? DARK_THEME.section!);
    // 덧그림 기본색(측정 색)이 테마를 따른다
    if (this.annos) this.uploadAnnotations();
  }

  /** CSS 색 → RGBA. 직접 못 읽으면 2D 캔버스로 정규화해서 읽는다 */
  private rgba(s: string): Rgba {
    const p = parseColor(s);
    if (p) return p;
    const ctx = this.octx;
    ctx.fillStyle = '#000';
    ctx.fillStyle = s;
    return parseColor(String(ctx.fillStyle)) ?? [0, 0, 0, 1];
  }

  /** 화소 비율이 바뀌면(창을 다른 화면으로 옮김·확대) 다시 그린다. 지금 비율에 맞춘 질의 하나만 듣는다 */
  private watchDpr(): void {
    let mql: MediaQueryList | null = null;
    const on = (): void => {
      listen();
      this.invalidate();
    };
    const listen = (): void => {
      mql?.removeEventListener('change', on);
      mql = null;
      if (this.disposed) return;
      mql = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mql.addEventListener('change', on);
    };
    listen();
    // 해제 함수는 하나만 둔다(예전에는 비율이 바뀔 때마다 off 목록에 하나씩 쌓였다)
    this.off.push(() => {
      mql?.removeEventListener('change', on);
      mql = null;
    });
  }

  // ───────────────────────── 내부: 고르기 ─────────────────────────

  private bvhFor(kind: PrimKind, positions: Float32Array, indices: Uint32Array | undefined, build: boolean): Bvh | null {
    let m = this.bvhs.get(positions);
    if (!m) {
      m = new Map();
      this.bvhs.set(positions, m);
    }
    const key = indices ?? kind;
    let b = m.get(key);
    if (b || !build) return b ?? null;
    b = buildBvh(kind, positions, indices);
    m.set(key, b);
    return b;
  }

  /** 장면을 올린 뒤 쉬는 틈에 BVH를 미리 만든다(작은 것부터, 한 틈에 약 10 ms씩) */
  private scheduleBvh(): void {
    clearTimeout(this.bvhTimer);
    const gen = ++this.bvhGen;
    const s = this.sceneRef;
    if (!s) return;
    const tasks: { n: number; run: () => void }[] = [];
    for (const m of s.meshes) tasks.push({ n: m.indices?.length ?? m.positions.length, run: () => this.bvhFor('triangle', m.positions, m.indices, true) });
    if (this.opts.pickEdges) for (const m of s.meshes) if (m.edges && m.edges.length >= 6) tasks.push({ n: m.edges.length, run: () => this.bvhFor('segment', m.edges!, undefined, true) });
    for (const l of s.lines) tasks.push({ n: l.positions.length, run: () => this.bvhFor('segment', l.positions, undefined, true) });
    for (const p of s.points ?? []) tasks.push({ n: p.positions.length, run: () => this.bvhFor('point', p.positions, undefined, true) });
    tasks.sort((a, b) => a.n - b.n);
    const step = (): void => {
      if (gen !== this.bvhGen || this.disposed) return;
      // 끄는 중이면 미룬다
      if (this.drag || this.interacting) {
        this.bvhTimer = window.setTimeout(step, 120);
        return;
      }
      // 한 틈에 약 10 ms어치(작은 것은 여러 개, 큰 것은 하나)
      const t0 = performance.now();
      while (tasks.length && performance.now() - t0 < 10) tasks.shift()!.run();
      if (tasks.length) this.bvhTimer = window.setTimeout(step, 16);
    };
    this.bvhTimer = window.setTimeout(step, 200);
  }

  private frame(): ViewFrame {
    let b = this.visibleBox();
    if (this.gridOn && this.grid) {
      const g = this.grid;
      b = unionBox(b, { min: [g.x0, g.y0, g.z], max: [g.x1, g.y1, g.z] });
    }
    // 덧그림도 가까운·먼 면 안에(장면 밖에 둔 측정이 잘리지 않게)
    if (this.annos?.box) b = unionBox(b, this.annos.box);
    if (this.marker) {
      const m = this.marker;
      const s = this.markerScale(null);
      const ax = m.opts.axis ?? [0, 0, 1];
      const tip = m.pos;
      b = unionBox(b, emptyBox());
      expandPoint(b, tip[0], tip[1], tip[2]);
      expandPoint(b, tip[0] + ax[0]! * s * MARKER_HEIGHT, tip[1] + ax[1]! * s * MARKER_HEIGHT, tip[2] + ax[2]! * s * MARKER_HEIGHT);
    }
    const sphere = boxIsEmpty(b) ? { center: this.cam.target, radius: this.cam.distance } : boxSphere(b);
    return computeFrame(this.cam, this.cssW, this.cssH, sphere);
  }

  /** 표시 그물 배율(반지름 1 → 세계) */
  private markerScale(f: ViewFrame | null): number {
    const m = this.marker!;
    if (m.opts.radius && m.opts.radius > 0) return m.opts.radius;
    const px = m.opts.sizePx ?? 44;
    let wpp: number;
    if (f) {
      const d = viewDepth(f, m.pos);
      wpp = f.projection === 'perspective' ? Math.max(d, f.near) * f.pixelPerDepth : f.pixelConst;
    } else wpp = (2 * this.cam.distance * Math.tan(this.cam.fovY / 2)) / this.cssH;
    return (px * wpp) / MARKER_HEIGHT;
  }

  /** 묶음 세계 범위(원점·행렬 반영, 장면마다 캐시) */
  private boundsOf(it: AnyItem): Box3 {
    let b = this.boxes.get(it);
    if (!b) {
      b = itemBounds(it);
      const lm = this.looks.get(it.id)?.matrix;
      if (lm) b = transformBox(b, lm);
      // 마주 보는 그물: 돌려도 변하지 않는 기둥 범위
      if (this.items.get(it.id)?.kind === 'mesh' && hasBillboard(it as Mesh3d)) b = billboardBounds(b, (it as Mesh3d).billboard!.origin);
      this.boxes.set(it, b);
    }
    return b;
  }

  /** 마주 보는 그물의 지금 카메라 돌림 각(라디안) */
  private billboardAngleOf(m: Mesh3d): number {
    const bb = m.billboard!;
    const c = this.cam;
    const to = towardCamera(bb.origin, cameraEye(c), cameraBasis(c).back, c.projection === 'perspective', c.yaw);
    return billboardAngle(bb.front ?? [0, -1, 0], to);
  }

  /** 마주 보는 그물의 지금 카메라 돌림(세계, 원점 둘레) */
  private billboardRot(m: Mesh3d): ArrayLike<number> {
    return billboardMatrix(m.billboard!.origin, this.billboardAngleOf(m));
  }

  /** 그물 모형 행렬 = (마주 보기 돌림 ·)(묶음 행렬 setItemMatrix ·) matrix · T(origin)(마주 보기가 아니면 장면마다 캐시) */
  private modelOf(m: Mesh3d): ArrayLike<number> | undefined {
    if (hasBillboard(m)) {
      let base = modelMatrix(m.matrix, m.origin);
      const lm = this.looks.get(m.id)?.matrix;
      if (lm) base = base ? mat4Mul(lm, base) : lm;
      const R = this.billboardRot(m);
      return base ? mat4Mul(R, base) : R;
    }
    let e = this.models.get(m);
    if (!e) {
      let mm = modelMatrix(m.matrix, m.origin);
      const lm = this.looks.get(m.id)?.matrix;
      if (lm) mm = mm ? mat4Mul(lm, mm) : lm;
      this.models.set(m, (e = { m: mm }));
    }
    return e.m;
  }

  /** 마주 보는 그물이 있을 때 렌더러 겉모습: 그 그물은 이 프레임 돌림(· 묶음 행렬)을 행렬로 */
  private billboardLook(): (id: string) => LookState | undefined {
    const mats = new Map<string, ArrayLike<number>>();
    for (const m of this.bbList) {
      const lm = this.looks.get(m.id)?.matrix;
      const R = this.billboardRot(m);
      mats.set(m.id, lm ? mat4Mul(R, lm) : R);
    }
    return (id) => {
      const l = this.looks.get(id);
      const mm = mats.get(id);
      return mm ? { ...(l ?? {}), matrix: mm as Float64Array } : l;
    };
  }

  /** 선분·점 묶음의 모형 행렬: 묶음 행렬(setItemMatrix)이 있을 때만(원점 포함), 없으면 undefined(예전처럼 원점만 옮긴다) */
  private lineModel(it: LineSet3d | PointSet3d): ArrayLike<number> | undefined {
    const lm = this.looks.get(it.id)?.matrix;
    if (!lm) return undefined;
    let e = this.lineModels.get(it);
    if (!e) this.lineModels.set(it, (e = hasOrigin(it.origin) ? mat4Mul(lm, translation(it.origin)) : lm));
    return e;
  }

  /** 불투명 그물인지(겉모습 색·불투명도 반영) */
  private meshOpaque(m: Mesh3d): boolean {
    const l = this.looks.get(m.id);
    if (!l) return m.color[3] >= 0.999;
    return (l.color ? l.color[3] : m.color[3]) * (l.alpha ?? 1) >= 0.999;
  }

  /** 보이는 묶음 목록(고르기용, 보이기를 바꿀 때까지 다시 쓴다) */
  private visibleItems(): ScenePickItems {
    if (this.visLists) return this.visLists;
    const meshes: Mesh3d[] = [], lines: LineSet3d[] = [], points: PointSet3d[] = [];
    for (const it of this.items.values()) {
      if (!this.visible(it.item.id, it.item.group) || this.looks.get(it.item.id)?.pickable === false) continue;
      if (it.kind === 'mesh') meshes.push(it.item);
      else if (it.kind === 'line') lines.push(it.item);
      else points.push(it.item);
    }
    return (this.visLists = { meshes, lines, points });
  }

  /** 화면 점에서 고르기. 허용 거리는 포인터 종류로 가른다(터치 = touchPickTolerance, 그 밖 = pickTolerance). edges면 윤곽선도 */
  private pickDetail(x: number, y: number, build = true, pointerType?: string, edges = this.opts.pickEdges, midpoints = false): PickDetail | null {
    if (!this.sceneRef) return null;
    const t = pickTolerance(pointerType, this.opts.pickTolerance, this.opts.touchPickTolerance);
    return pickScene(this.frame(), x, y, this.visibleItems(), {
      ...(edges ? { edges: true, edgeHidden: (m: Mesh3d) => this.rangeSel.get(m.id)?.eTest } : {}),
      ...(midpoints ? { midpoints: true } : {}),
      tol: t.tol,
      snap: t.snap,
      occlude: this.shadedMode,
      bvh: (kind, positions, indices) => this.bvhFor(kind, positions, indices, build),
      fast: !build,
      limit: (id) => this.ranges.get(id)?.count,
      bounds: (it) => this.boundsOf(it),
      model: (m) => this.modelOf(m),
      ...this.clipOpts(),
      hidden: (it) => this.rangeSel.get(it.id)?.test,
    });
  }

  /**
   * 측정 점 고르기: 화면 점에서 찍을 점과 붙잡은 종류. 붙잡기 선택(setMeasureSnap)이 없으면 0.7.2 그대로(고르기의 꼭짓점·끝점 붙잡기 — d를 주면 그것을 쓴다).
   * 있으면 고르기(윤곽선·가운데 점 선택 반영)의 붙잡은 점, pointsFor 점, 늘 후보인 앱 점 가운데 붙잡기 거리 안에서 화면에 가장 가까운 보이는 것
   */
  private measureAt(x: number, y: number, pointerType: string | undefined, d0?: PickDetail | null): { p: V3; vertex: boolean; kind: SnapKind | null; axis?: SnapAxis } | null {
    const so = this.snapOpt;
    if (!so) {
      const d = d0 !== undefined ? d0 : this.pickDetail(x, y, true, pointerType);
      return d ? { p: d.snap, vertex: d.vertex, kind: d.snapKind } : null;
    }
    if (!this.sceneRef) return null;
    const d = this.pickDetail(x, y, true, pointerType, so.edges ?? this.opts.pickEdges, so.midpoints);
    const snapPx = pickTolerance(pointerType, this.opts.pickTolerance, this.opts.touchPickTolerance).snap;
    const f = this.frame();
    const inf = so.inference;
    const first = this.measurePts.length === 1 ? this.measurePts[0]! : null;
    const cands: Iterable<SnapCandidate> = inf ? this.withInference(f, x, y, snapPx, so.edges ?? this.opts.pickEdges, inf, first, this.snapCandidates(f, x, y, snapPx, d?.pick ?? null)) : this.snapCandidates(f, x, y, snapPx, d?.pick ?? null);
    const r = chooseMeasureSnap(f, x, y, snapPx, d ? { p: d.snap, kind: d.snapKind } : null, cands, (p, sx, sy, id) => this.snapVisible(f, p, sx, sy, id));
    // 축(0.9.0): 점 붙잡기가 하나도 없을 때만 첫 점의 축 방향 선에
    if (inf?.axes && first && (!r || !r.kind)) {
      const a = axisSnap(f, first, x, y, snapPx);
      if (a) return { p: a.p, vertex: true, kind: 'axis', axis: a.axis };
    }
    return r;
  }

  /** 앱 붙잡기 후보 뒤에 추론 후보(0.9.0 — 커서 둘레 선분의 교차점·첫 점에서 내린 수직 발)를 잇는다 */
  private *withInference(
    f: ViewFrame,
    x: number,
    y: number,
    snapPx: number,
    edges: boolean,
    inf: Required<MeasureInference>,
    first: V3 | null,
    app: Iterable<SnapCandidate>,
  ): Generator<SnapCandidate> {
    yield* app;
    if (!inf.intersections && !(inf.perpendicular && first)) return;
    const segs = segmentsNear(f, x, y, this.visibleItems(), {
      ...(edges ? { edges: true, edgeHidden: (m: Mesh3d) => this.rangeSel.get(m.id)?.eTest } : {}),
      bvh: (kind, positions, indices) => this.bvhFor(kind, positions, indices, true),
      limit: (id) => this.ranges.get(id)?.count,
      bounds: (it) => this.boundsOf(it),
      model: (m) => this.modelOf(m),
      ...this.clipOpts(),
      hidden: (it) => this.rangeSel.get(it.id)?.test,
    }, snapPx);
    const near = segs.map((s) => ({ a: s.a, b: s.b, id: s.id, keep: s.keep, wpp: worldPerPixel(f, s.depth) }));
    for (const c of inferenceCandidates(near, first, inf)) yield c;
  }

  /**
   * 앱 붙잡기 후보: pointsFor(고른 것) 점(id가 없으면 고른 묶음), 늘 후보인 점. id가 있으면 묶음 행렬(분해도)을 따라 옮긴다.
   * 늘 후보인 점이 SNAP_INDEX_MIN개 이상이면(0.9.0) 색인에서 커서 둘레(붙잡기 거리 안일 수 있는 것)만 번호 차례로 — 결과는 모두 훑을 때와 같다
   */
  private *snapCandidates(f: ViewFrame, x: number, y: number, snapPx: number, pick: Pick3d | null): Generator<SnapCandidate> {
    const so = this.snapOpt;
    if (!so) return;
    const at = (x: number, y: number, z: number, kind: SnapKind, id: string | undefined): SnapCandidate => {
      const m = id !== undefined ? this.looks.get(id)?.matrix : undefined;
      return { p: m ? transformPoint(m, [x, y, z]) : [x, y, z], kind, id };
    };
    const lim = so.limit;
    if (pick && so.pointsFor) {
      const extra = so.pointsFor(pick);
      if (extra)
        for (const sp of extra) {
          const q = sp.point;
          if (q && Number.isFinite(q[0]) && Number.isFinite(q[1]) && Number.isFinite(q[2]) && withinSnapLimit(sp.order, lim)) yield at(q[0]!, q[1]!, q[2]!, sp.kind ?? 'point', sp.id ?? pick.id);
        }
    }
    const P = so.pts;
    const n = P.length / 3;
    // 차례 한도(0.10.0): 한도와 차례 값이 모두 있을 때만 거른다
    const ord = lim !== null ? so.orders : null;
    if (n < SNAP_INDEX_MIN) {
      for (let i = 0; i < n; i++) if (!ord || ord[i]! < lim!) yield at(P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!, so.kinds[i]!, so.ids[i]);
      return;
    }
    so.index ??= new SnapPointIndex(P, so.ids, so.orders);
    const moved: string[] = [];
    for (const [id, l] of this.looks) if (l.matrix) moved.push(id);
    for (const i of so.index.near(f, x, y, snapPx, (id) => this.looks.get(id)?.matrix, moved, ord ? lim : null)) yield at(P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!, so.kinds[i]!, so.ids[i]);
  }

  /** 앱 붙잡기 점이 보이는지: 묶음(id)이 보이고, 단면에 잘리지 않고(id면 그 묶음 평면, 아니면 모든 묶음을 자르는 평면), 음영 계열에서 가리지 않음 */
  private snapVisible(f: ViewFrame, p: V3, sx: number, sy: number, id: string | undefined): boolean {
    if (id !== undefined) {
      const it = this.items.get(id);
      if (it && (!this.visible(it.item.id, it.item.group) || this.looks.get(id)?.pickable === false)) return false;
      if (it) {
        for (const c of this.clipsFor(id)) if (planeValue(c, p[0], p[1], p[2]) > 1e-9 * (Math.abs(c[3]) + 1)) return false;
      } else if (this.pointCut(p)) return false;
    } else if (this.pointCut(p)) return false;
    return !this.occludedAt(f, p, sx, sy, true);
  }

  /** 단면에서 잘린 면을 채워 그리는 그물인지(렌더러의 채우기 조건과 같다). capGroup이 있는 그물은 묶음으로 채운다 */
  private capped(m: Mesh3d): boolean {
    return this.cappedBy(m, this.sec);
  }

  private cappedBy(m: Mesh3d, s: Section | null | undefined): boolean {
    if (!s || s.caps === 'none' || !this.shadedMode || !this.meshOpaque(m) || !this.renderer.canFillSection) return false;
    return s.caps === 'all' || m.closed === true || m.capGroup !== undefined;
  }

  /** 면이 앞의 것을 가리는 모드(음영 계열 — 고르기·가림·잘린 면 채우기) */
  private get shadedMode(): boolean {
    const m = this.mode;
    return m === 'shaded' || m === 'shadedEdges' || m === 'hiddenLine' || m === 'monochrome' || m === 'noTexture';
  }

  /** 고르기·가림 판정의 단면 선택(평면 하나면 예전 그대로 clip, 여러 단면이면 묶음마다 clips) */
  private clipOpts(): Pick<ScenePickOptions, 'clip' | 'clips' | 'caps' | 'capGroup' | 'opaque' | 'itemModel'> {
    // 겉모습(불투명도·묶음 행렬)이 있을 때만 그 판정을 넘긴다(없으면 예전 규칙 그대로)
    const lk = this.looks.size ? { opaque: (m: Mesh3d) => this.meshOpaque(m), itemModel: (it: LineSet3d | PointSet3d) => this.lineModel(it) } : {};
    if (!this.multiSection) return { clip: this.sectionPlane(), caps: (m) => this.capped(m), capGroup: (m) => m.capGroup, ...lk };
    const all = this.allSecs();
    return { clips: (it) => this.clipsFor(it.id), caps: (m, k) => this.cappedBy(m, all[this.secOf(m.id)[k ?? 0]!]), capGroup: (m) => m.capGroup, ...lk };
  }

  /**
   * 확대 기준점: 커서 아래 점(이미 만든 BVH만), 없으면 대상점 깊이.
   * 같은 자리에서 잇달아 굴리면 앞의 점을 다시 쓴다(확대해도 그 점은 화면에서 제자리이므로).
   */
  private zoomAnchor(f: ViewFrame, x: number, y: number, pick = true): V3 {
    const now = performance.now();
    const w = this.wheelAnchor;
    if (pick && w && now - w.t < 400 && Math.hypot(w.x - x, w.y - y) < 2) {
      w.t = now;
      return w.p;
    }
    const d = pick ? this.pickDetail(x, y, false) : null;
    const p = d ? d.pick.point : rayAtDepth(f, screenRay(f, x, y), viewDepth(f, this.cam.target));
    if (pick) this.wheelAnchor = { x, y, t: now, p };
    return p;
  }

  private click(x: number, y: number, e?: PointerEvent): void {
    const now = performance.now();
    const type = e?.pointerType || 'mouse';
    const n = clickCount(this.lastClick, now, x, y, type);
    this.lastClick = { t: now, x, y, n };
    const d = this.pickDetail(x, y, true, type);
    // 걷기: 두 번 누르면 그 자리에 선다(눈높이 위)
    // 서기에 쓴 두 번째 누르기는 고르기·측정으로 알리지 않는다(첫 누르기는 이미 clicks 1로 알렸다)
    if (this.nav === 'walk' && n === 2 && d && this.walkOpts.tapToStand !== false) {
      this.finishAnim();
      this.cam = standCamera(this.cam, d.pick.point, this.eyeHeight());
      this.invalidate();
      return;
    }
    if (this.measuring) {
      const s = this.measureAt(x, y, type, this.snapOpt ? undefined : d);
      if (!s) return;
      if (this.measurePts.length >= 2) {
        this.measurePts = [];
        for (const cb of this.measureCbs) cb(null);
      }
      // 같은 점 객체가 두 번 찍혀도 종류를 따로 지키도록 복사해 넣는다(붙잡기 선택이 있을 때만 — 없으면 0.7.2 그대로)
      const p: V3 = this.snapOpt ? [s.p[0], s.p[1], s.p[2]] : s.p;
      this.measureSnaps.set(p, s.axis ? { kind: s.kind, axis: s.axis } : { kind: s.kind });
      this.measurePts.push(p);
      this.measureHover = null;
      const m = this.measurement();
      if (m) for (const cb of this.measureCbs) cb(m);
      this.invalidate();
      return;
    }
    const ev: PickEvent = {
      altKey: !!e?.altKey,
      ctrlKey: !!e?.ctrlKey,
      shiftKey: !!e?.shiftKey,
      metaKey: !!e?.metaKey,
      clicks: n,
      button: e?.button ?? 0,
      pointerType: type,
    };
    for (const cb of this.pickCbs) cb(d ? d.pick : null, ev);
  }

  // ───────────────────────── 내부: 입력 ─────────────────────────

  private local(e: { clientX: number; clientY: number }, el: HTMLElement = this.canvas): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private on<E extends Event>(el: EventTarget, type: string, fn: (e: E) => void, opts?: AddEventListenerOptions): void {
    el.addEventListener(type, fn as EventListener, opts);
    this.off.push(() => el.removeEventListener(type, fn as EventListener, opts));
  }

  private bindInput(): void {
    const cv = this.canvas;
    this.on<PointerEvent>(cv, 'pointerdown', (e) => this.onDown(e));
    this.on<PointerEvent>(cv, 'pointermove', (e) => this.onMove(e));
    this.on<PointerEvent>(cv, 'pointerup', (e) => this.onUp(e, false));
    this.on<PointerEvent>(cv, 'pointercancel', (e) => this.onUp(e, true));
    this.on(cv, 'pointerleave', () => {
      if (this.measureHover || this.hoverAt) {
        this.measureHover = null;
        this.hoverAt = null;
        this.invalidate();
      }
    });
    this.on<WheelEvent>(cv, 'wheel', (e) => this.onWheel(e), { passive: false });
    this.on(cv, 'contextmenu', (e) => e.preventDefault());
    this.on<MouseEvent>(cv, 'auxclick', (e) => {
      if (e.button === 1) e.preventDefault();
    });
    this.on<KeyboardEvent>(cv, 'keydown', (e) => {
      focusKey(cv, e);
      this.onKey(e);
    });
    this.on<KeyboardEvent>(cv, 'keyup', (e) => {
      if (this.opts.keyboard && this.handleKeyUp(e)) e.stopPropagation();
    });
    this.on(cv, 'blur', () => {
      focusLeft(cv);
      this.walkKeys.clear();
      this.listenWalkRelease(false);
    });
    this.on(cv, 'webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      this.renderer.forget();
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    });
    this.on(cv, 'webglcontextrestored', () => {
      if (this.disposed) return;
      this.lost = false;
      this.renderer.init();
      if (this.sceneRef) this.renderer.setScene(this.sceneRef, { incremental: !!this.upload });
      if (this.segHi) this.renderer.setHighlightSegments(this.segHi.positions, this.segHi.opts.origin);
      this.uploadAnnotations();
      // 단면 테두리도 GPU 자료라 다시 올린다
      this.cutDirty = true;
      this.rebuildGrid();
      this.invalidate();
      if (this.sec) this.emitSection();
    });
    const cube = this.cube;
    this.on<PointerEvent>(cube, 'pointermove', (e) => {
      const p = this.local(e, cube);
      const cd = this.cubeDrag;
      if (cd) {
        if (!cd.moved && Math.hypot(p.x - cd.sx, p.y - cd.sy) < 3) return;
        cd.moved = true;
        this.finishAnim();
        this.wheelAnchor = null;
        this.cam = orbitCamera(this.cam, -(p.x - cd.lx) * ROT_PER_PX * 1.5, (p.y - cd.ly) * ROT_PER_PX * 1.5);
        cd.lx = p.x;
        cd.ly = p.y;
        this.invalidate();
        return;
      }
      const h = cubeHit(cameraBasis(this.cam), cubeLayout(this.opts.viewCubeSize), p.x, p.y);
      const d = h ? h.dir : null;
      if ((d === null) !== (this.cubeHover === null) || (d && this.cubeHover && dot(d, this.cubeHover) < 0.9999)) {
        this.cubeHover = d;
        this.invalidate();
      }
    });
    this.on(cube, 'pointerleave', () => {
      if (this.cubeHover) {
        this.cubeHover = null;
        this.invalidate();
      }
    });
    this.on<PointerEvent>(cube, 'pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      cube.setPointerCapture(e.pointerId);
      const p = this.local(e, cube);
      this.cubeDrag = { sx: p.x, sy: p.y, lx: p.x, ly: p.y, moved: false };
    });
    const cubeUp = (e: PointerEvent, cancel: boolean): void => {
      const cd = this.cubeDrag;
      this.cubeDrag = null;
      if (!cd || cd.moved || cancel) return;
      const p = this.local(e, cube);
      const h = cubeHit(cameraBasis(this.cam), cubeLayout(this.opts.viewCubeSize), p.x, p.y);
      if (h) this.setViewDir(h.dir);
    };
    this.on<PointerEvent>(cube, 'pointerup', (e) => cubeUp(e, false));
    this.on<PointerEvent>(cube, 'pointercancel', (e) => cubeUp(e, true));
    this.on(cube, 'contextmenu', (e) => e.preventDefault());
  }

  private onDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button > 2) return;
    // 누르기로 받은 초점에는 테두리를 보이지 않는다(0.9.1 — 키보드로 이미 초점이 있던 캔버스도 data-v3d-focus="pointer"로 감춘다)
    pointerFocus(this.canvas);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* 이미 놓친 포인터 */
    }
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    this.finishAnim();
    if (e.pointerType === 'touch') {
      if (this.pointers.size === 1) this.drag = { mode: 'orbit', button: 0, pointerType: 'touch', sx: p.x, sy: p.y, lx: p.x, ly: p.y, moved: false, pivot: null, depth: null };
      else if (this.pointers.size === 2) {
        // 두 손가락 이동·핀치(앞의 핀치 뒤 남겨 둔 손가락에 새 손가락이 닿아도 여기서 다시 시작한다)
        this.drag = { mode: 'touch', button: 0, pointerType: 'touch', sx: p.x, sy: p.y, lx: p.x, ly: p.y, moved: true, pivot: null, depth: null };
        this.touch = this.pinchState();
        this.interacting = true;
      }
      return;
    }
    if (this.drag) return;
    if (e.button === 1) {
      e.preventDefault();
      const now = performance.now();
      if (now - this.lastMiddle.t < 420 && Math.hypot(p.x - this.lastMiddle.x, p.y - this.lastMiddle.y) < 8) {
        this.lastMiddle.t = 0;
        this.fit();
        return;
      }
      this.lastMiddle = { t: now, x: p.x, y: p.y };
    }
    const mode: Drag['mode'] = e.button === 0 ? 'orbit' : e.button === 1 && e.shiftKey ? 'orbit' : 'pan';
    this.drag = { mode, button: e.button, pointerType: e.pointerType, sx: p.x, sy: p.y, lx: p.x, ly: p.y, moved: false, pivot: null, depth: null };
  }

  /** 지금 누른 손가락 앞의 둘로 핀치 기준(거리·가운데) */
  private pinchState(): { dist: number; cx: number; cy: number } {
    const [a, b] = [...this.pointers.values()];
    return { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), cx: (a!.x + b!.x) / 2, cy: (a!.y + b!.y) / 2 };
  }

  private onMove(e: PointerEvent): void {
    const p = this.local(e);
    const d = this.drag;
    if (!d || !this.pointers.has(e.pointerId)) {
      if (this.measuring && !d) {
        this.hoverAt = { x: p.x, y: p.y, pointerType: e.pointerType || 'mouse' };
        this.invalidate();
      }
      return;
    }
    this.pointers.set(e.pointerId, p);
    if (d.mode === 'touch') {
      if (this.pointers.size < 2 || !this.touch) return;
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const cx = (a!.x + b!.x) / 2, cy = (a!.y + b!.y) / 2;
      const t = this.touch;
      if (this.nav === 'walk') {
        // 걷기: 벌리면 앞으로, 두 손가락을 끌면 옆·위아래로(장면을 잡아 끄는 쪽)
        const k = this.walkSpeed() * 0.01;
        this.walkMove((dist - t.dist) * k, -(cx - t.cx) * k, (cy - t.cy) * k);
        this.touch = { dist, cx, cy };
        this.invalidate();
        return;
      }
      const f = this.frame();
      this.cam = panCamera(this.cam, f, cx - t.cx, cy - t.cy);
      if (dist > 1 && t.dist > 1) {
        const f2 = this.frame();
        this.cam = zoomCamera(this.cam, t.dist / dist, this.zoomAnchor(f2, cx, cy, false), this.zoomLimits());
      }
      this.touch = { dist, cx, cy };
      this.invalidate();
      return;
    }
    if (!d.moved) {
      if (!dragStarted(p.x - d.sx, p.y - d.sy, d.pointerType)) return;
      d.moved = true;
      this.interacting = true;
      // 터치는 끌기 시작 거리가 커서 그만큼을 한꺼번에 돌리면 튀어 보인다 — 여기서부터 움직인 만큼만 돌린다
      if (isTouch(d.pointerType)) {
        d.lx = p.x;
        d.ly = p.y;
      }
      // 회전 중심·이동 깊이: 누른 곳 아래 점(이미 만든 BVH만 써서 끊김이 없게)
      const hit = this.pickDetail(d.sx, d.sy, false);
      const f = this.frame();
      if (hit) {
        d.pivot = hit.pick.point;
        d.depth = viewDepth(f, hit.pick.point);
      }
      if (this.measuring) this.measureHover = null;
    }
    const dx = p.x - d.lx, dy = p.y - d.ly;
    d.lx = p.x;
    d.ly = p.y;
    this.wheelAnchor = null;
    if (d.mode === 'orbit') {
      // 걷기: 눈은 제자리에 두고 고개만 돌린다(장면을 잡아 끄는 쪽으로)
      if (this.nav === 'walk') this.cam = lookCamera(this.cam, dx * ROT_PER_PX * 0.5, -dy * ROT_PER_PX * 0.5);
      else this.cam = orbitCamera(this.cam, -dx * ROT_PER_PX, dy * ROT_PER_PX, d.pivot);
    } else this.cam = panCamera(this.cam, this.frame(), dx, dy, d.depth ?? this.cam.distance);
    this.invalidate();
  }

  private onUp(e: PointerEvent, cancel: boolean): void {
    const had = this.pointers.delete(e.pointerId);
    const d = this.drag;
    if (!had || !d) return;
    if (d.mode === 'touch') {
      if (this.pointers.size >= 2) {
        // 셋째 손가락을 뗐다: 남은 둘로 핀치 기준을 다시 잡는다(짝이 바뀌어도 튀지 않게)
        this.touch = this.pinchState();
        return;
      }
      if (this.pointers.size === 1) {
        // 두 손가락 몸짓 뒤 남은 손가락은 모두 뗄 때까지 무시한다(회전·누르기 없음 — 핀치를 끝내다 모형이 돌지 않게).
        // 새 손가락이 닿으면 onDown에서 두 손가락 몸짓을 다시 시작한다
        this.touch = null;
        this.interacting = false;
        this.invalidate();
        return;
      }
    } else if (!cancel && !d.moved && (d.button === 0 || e.pointerType === 'touch')) {
      const p = this.local(e);
      this.click(p.x, p.y, e);
    }
    if (this.pointers.size === 0) {
      this.drag = null;
      this.touch = null;
      this.interacting = false;
      this.invalidate();
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (this.drag) return;
    this.finishAnim();
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.cssH : 1;
    const delta = Math.max(-400, Math.min(400, e.deltaY * k));
    if (this.nav === 'walk') {
      // 걷기: 휠은 앞뒤로 걷는다
      this.walkMove(-delta * this.walkSpeed() * 0.002, 0, 0);
      this.invalidate();
      return;
    }
    const factor = Math.exp(delta * (e.ctrlKey ? 0.006 : 0.0015));
    const p = this.local(e);
    const f = this.frame();
    this.cam = zoomCamera(this.cam, factor, this.zoomAnchor(f, p.x, p.y), this.zoomLimits());
    this.interacting = true;
    clearTimeout(this.wheelTimer);
    this.wheelTimer = window.setTimeout(() => {
      this.interacting = !!this.drag;
      this.invalidate();
    }, 160);
    this.invalidate();
  }

  /**
   * 뷰어 키(F 전체 보기, 1~7 표준 뷰, Esc 측정 지우기)를 처리한다. 처리했으면 기본 동작을 막고 true.
   * 캔버스에 초점이 없을 때 앱이 창 키를 넘겨 같은 규칙을 쓰게 한다(입력 칸 걸러내기는 앱 몫).
   */
  handleKey(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    // 걷기: W·A·S·D·화살표·Q·E·PageUp·PageDown(물리 키 — 한글 입력기에서도)은 누르는 동안 움직인다.
    // 떼기는 창 keyup·창 흐려짐·탭 숨김을 뷰어가 스스로 듣는다(앱이 창 keydown만 넘겨도 멈춘다)
    const wk = this.nav === 'walk' ? walkKeyOf(e) : null;
    if (wk) {
      this.walkKeys.add(wk);
      this.walkFast = e.shiftKey;
      this.listenWalkRelease(true);
      this.invalidate();
      e.preventDefault();
      return true;
    }
    if (e.key === 'f' || e.key === 'F') this.fit();
    else if (VIEW_KEYS[e.key]) this.setView(VIEW_KEYS[e.key]!);
    else if (e.key === 'Escape' && this.measurePts.length) this.clearMeasure();
    else return false;
    e.preventDefault();
    return true;
  }

  /** 걷기 키를 뗐을 때(앱이 창 키를 넘길 때 keyup도 넘긴다). 처리했으면 true */
  handleKeyUp(e: KeyboardEvent): boolean {
    const k = walkKeyOf(e);
    if (!k || !this.walkKeys.delete(k)) return false;
    this.walkFast = e.shiftKey;
    if (!this.walkKeys.size) this.listenWalkRelease(false);
    return true;
  }

  /** 걷기 키를 누르고 있는 동안만 창 keyup·blur·visibilitychange를 들어 떼기를 놓치지 않는다 */
  private listenWalkRelease(on: boolean): void {
    if (on === !!this.walkRelease) return;
    if (!on) {
      this.walkRelease!();
      this.walkRelease = null;
      return;
    }
    const up = (e: KeyboardEvent): void => {
      const k = walkKeyOf(e);
      if (k) this.walkKeys.delete(k);
      this.walkFast = e.shiftKey;
      if (!this.walkKeys.size) this.listenWalkRelease(false);
    };
    const clear = (): void => {
      this.walkKeys.clear();
      this.listenWalkRelease(false);
    };
    const vis = (): void => {
      if (document.visibilityState === 'hidden') clear();
    };
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', vis);
    this.walkRelease = () => {
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', vis);
    };
  }

  private onKey(e: KeyboardEvent): void {
    if (this.opts.keyboard && this.handleKey(e)) e.stopPropagation();
  }

  // ───────────────────────── 내부: 그리기 ─────────────────────────

  private invalidate(): void {
    if (this.raf || this.disposed || this.lost) return;
    this.raf = requestAnimationFrame((t) => {
      this.raf = 0;
      this.draw(t);
    });
  }

  private draw(now: number): void {
    if (this.disposed || this.lost) return;
    const t0 = performance.now();
    if (this.anim) {
      const a = this.anim;
      const t = Math.min(1, (now - a.t0) / a.dur);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      this.cam = t >= 1 ? a.to : lerpCamera(a.from, a.to, e);
      if (t >= 1) this.anim = null;
      else this.invalidate();
    }
    // 크기·화소 비율
    const dpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, this.opts.maxPixelRatio));
    this.dpr = dpr;
    const w = Math.max(1, Math.round(this.cssW * dpr)), h = Math.max(1, Math.round(this.cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (this.overlay.width !== w || this.overlay.height !== h) {
      this.overlay.width = w;
      this.overlay.height = h;
    }
    if (this.nav === 'walk') this.stepWalk(now);
    // 마주 보는 그물: 카메라가 바뀌면 그림자·단면 테두리·고르기 목록이 따라 바뀐다
    if (this.bbList.length) {
      // 돌림 각이 하나라도 바뀌었을 때만(카메라가 움직여도 각이 같으면 그림자·테두리는 그대로)
      let k = '';
      for (const m of this.bbList) k += `${this.billboardAngleOf(m).toFixed(9)},`;
      if (k !== this.bbCamKey) {
        this.bbCamKey = k;
        this.shadowVer++;
        if (this.sec) this.cutDirty = true;
      }
    }
    const f = this.frame();
    // 측정 중 커서 아래 붙잡을 점
    if (this.measuring && this.hoverAt && !this.drag) {
      this.measureHover = this.measureAt(this.hoverAt.x, this.hoverAt.y, this.hoverAt.pointerType);
      this.lastHoverAt = this.hoverAt;
      this.hoverAt = null;
    }
    if (this.renderer.uploading) this.pumpUpload(this.upload?.budget ?? 8);
    if (this.cutDirty) {
      if (this.sec) this.updateCut();
      else {
        this.cutDirty = false;
        this.renderer.setSectionLines(null);
      }
    }
    this.renderer.render(f, w, h, this.renderState(f, dpr));
    this.drawOverlay(f);
    if (this.opts.viewCube) this.drawCube();
    this.frameMs = performance.now() - t0;
    const key = `${this.cam.target.join(',')}|${this.cam.distance}|${this.cam.yaw}|${this.cam.pitch}|${this.cam.projection}|${this.cssW}x${this.cssH}|${this.cam.fovY}|${this.cam.roll ?? 0}|${this.cam.shiftX ?? 0}|${this.cam.shiftY ?? 0}`;
    if (key !== this.lastCamKey) {
      this.lastCamKey = key;
      const c = this.getCamera();
      for (const cb of this.camCbs) cb(c);
    }
  }

  /** 한 프레임 그리기 상태(화면과 그림 저장이 함께 쓴다) */
  private renderState(f: ViewFrame, dpr: number): RenderState {
    let marker = null;
    if (this.marker) {
      const m = this.marker;
      const s = this.markerScale(f);
      marker = { kind: m.kind, matrix: placeMatrix(m.pos, m.opts.axis ?? [0, 0, 1], s), color: m.opts.color ?? this.rgba(this.theme.marker) };
    }
    const bg = this.bgOpt;
    const bgColor = bg?.color === undefined ? null : typeof bg.color === 'string' ? this.rgba(bg.color) : bg.color;
    const colors = bgColor ? { ...this.colors, background: bgColor } : this.colors;
    const sky = bg && (bg.sky !== undefined || bg.ground !== undefined) ? this.skyColors(bg, colors.background) : null;
    const L = this.lightOpt;
    let light: RenderState['light'] = null;
    if (L) {
      const d = L.sun.direction;
      const l = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
      const k = L.sun.intensity ?? 0.85;
      const c = L.sun.color === undefined ? ([1, 1, 1, 1] as Rgba) : typeof L.sun.color === 'string' ? this.rgba(L.sun.color) : L.sun.color;
      light = { dir: [d[0]! / l, d[1]! / l, d[2]! / l], color: [c[0] * k, c[1] * k, c[2] * k, 1], ambient: L.ambient ?? 0.35 };
    }
    const shadows = L?.shadows;
    const F = this.fogOpt;
    return {
      light,
      shadow: L && shadows ? { box: this.visibleBox(), size: (typeof shadows === 'object' ? shadows.size : undefined) ?? 2048, bias: (typeof shadows === 'object' ? shadows.bias : undefined) ?? 0.0015, version: this.shadowVer } : null,
      fog: F ? { color: F.color === undefined ? colors.background : typeof F.color === 'string' ? this.rgba(F.color) : F.color, start: F.start, end: F.end } : null,
      mode: this.mode,
      colors,
      sky,
      dpr,
      visible: (id, g) => this.visible(id, g),
      highlight: this.hi,
      ranges: this.ranges,
      grid: this.gridOn,
      marker,
      segHighlight: this.segHi
        ? {
            color: this.segHi.opts.color ?? this.colors.highlight,
            width: this.segHi.opts.width ?? 3,
            hidden: Math.min(1, Math.max(0, this.segHi.opts.hidden ?? 0.3)),
          }
        : null,
      interacting: this.interacting,
      section: this.sec && !this.multiSection ? { plane: this.sectionPlane()!, caps: this.sec.caps, color: this.sectionColor, width: 2 } : null,
      sections: this.multiSection
        ? { planes: this.allSecs().map((q) => ({ plane: this.planeOf(q), caps: q.caps })), of: (id) => this.secOf(id), color: this.sectionColor, width: 2 }
        : null,
      parts: this.rangeSel.size ? (id) => this.rangeSel.get(id)?.parts ?? undefined : undefined,
      annotations: this.annos ? { width: this.annos.width, hidden: this.annos.hidden } : null,
      look: this.bbList.length ? this.billboardLook() : this.looks.size ? (id) => this.looks.get(id) : null,
      hiddenEdges: this.renderOpts.hiddenEdges,
      profiles: this.renderOpts.profiles
        ? {
            width: this.renderOpts.profiles.width * dpr,
            color: this.optColor(this.renderOpts.profiles.color, colors.background),
          }
        : null,
      ...this.lineColorState(colors.background),
    };
  }

  /** 선택 색(없으면 테마 선 색, 'contrast'면 바탕과 3:1이 되는 테마 선 색·검정·흰색) */
  private optColor(c: Rgba | string | null, bg: Rgba): Rgba {
    if (c === null) return this.colors.line;
    if (c === 'contrast') return contrastLineColor(this.colors.line, bg, this.colors.line);
    return typeof c === 'string' ? this.rgba(c) : c;
  }

  /** 0.8.0 선 색 선택을 그리기 상태로(쓰지 않으면 필드를 넣지 않는다 — 0.7.2와 같은 상태) */
  private lineColorState(bg: Rgba): Pick<RenderState, 'hiddenEdgesShaded' | 'hiddenEdgeColor' | 'edgeColor' | 'edgeContrast'> {
    const r = this.renderOpts;
    const o: Pick<RenderState, 'hiddenEdgesShaded' | 'hiddenEdgeColor' | 'edgeColor' | 'edgeContrast'> = {};
    if (r.hiddenEdgesShaded) o.hiddenEdgesShaded = true;
    if (r.hiddenEdgeColor !== null) o.hiddenEdgeColor = this.optColor(r.hiddenEdgeColor, bg);
    if (r.edgeColor === 'contrast') o.edgeContrast = { fallback: this.colors.line };
    else if (r.edgeColor !== null) o.edgeColor = this.optColor(r.edgeColor, bg);
    return o;
  }

  private drawCube(): void {
    const dpr = this.dpr;
    const size = this.opts.viewCubeSize;
    const n = Math.round(size * dpr);
    if (this.cube.width !== n || this.cube.height !== n) {
      this.cube.width = n;
      this.cube.height = n;
    }
    const ctx = this.cctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, n, n);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const th = this.theme;
    drawViewCube(ctx, cameraBasis(this.cam), cubeLayout(this.opts.viewCubeSize), { face: th.cubeFace, edge: th.cubeEdge, text: th.cubeText, hover: th.cubeHover }, this.cubeHover, `600 ${((27 * size) / CUBE_CSS).toFixed(1)}px ${FONT}`);
  }

  private drawOverlay(f: ViewFrame): void {
    const ctx = this.octx;
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    this.drawOverlayOn(ctx, f, dpr);
  }

  /** 덧그림(단면 평면·좌표축·덧그림·측정)을 ctx에 CSS 화소 × k 배율로 */
  private drawOverlayOn(ctx: CanvasRenderingContext2D, f: ViewFrame, k: number): void {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (this.multiSection) this.drawSectionPlanes(ctx, f);
    else if (this.sec?.plane) this.drawSectionPlane(ctx, f);
    if (this.opts.axes) this.drawTriad(ctx, f);
    if (this.annos) this.drawAnnotations(ctx, f);
    this.drawMeasure(ctx, f);
  }

  /** 앱 측정 덧그림의 점·글자(선은 GL에서 깊이를 따져 그린다). 가려진 점·글자는 흐리게 */
  private drawAnnotations(ctx: CanvasRenderingContext2D, f: ViewFrame): void {
    const A = this.annos!;
    const th = this.theme;
    const unit = UNIT_LABEL[this.sceneRef?.units ?? 'unknown'];
    // 점이 많으면 끄는 동안은 가림을 따지지 않는다(놓으면 다시 그린다)
    let anchors = 0;
    for (const g of A.geo) if (g) anchors += g.dots.length + 1;
    const occl = !this.interacting || anchors <= 64;
    const hiddenA = A.hidden;
    ctx.save();
    A.geo.forEach((g, i) => {
      if (!g) return;
      const an = A.list[i]!;
      const color = an.color ?? th.measure;
      for (const p of g.dots) {
        const s = projectToScreen(f, p);
        if (!s) continue;
        const hid = occl && this.occludedAt(f, p, s[0], s[1], false);
        if (hid && hiddenA <= 0) continue;
        ctx.globalAlpha = hid ? hiddenA : 1;
        ctx.fillStyle = color;
        ctx.strokeStyle = th.textBg;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(s[0], s[1], 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      const fm = this.measureFmt;
      let lines: string[];
      if (fm && an.kind === 'distance' && an.label === undefined) {
        const [p, q] = g.dots as [V3, V3];
        lines = fm({ a: [...p] as V3, b: [...q] as V3, distance: g.value, dx: q[0] - p[0], dy: q[1] - p[1], dz: q[2] - p[2], units: this.sceneRef?.units ?? 'unknown' });
      } else lines = annotationText(an, g, (v) => this.fmt(v), unit);
      const at = projectToScreen(f, g.labelAt);
      if (!lines.length || !at) return;
      const hid = occl && this.occludedAt(f, g.labelAt, at[0], at[1], false);
      if (hid && hiddenA <= 0) return;
      ctx.globalAlpha = hid ? Math.max(hiddenA, 0.5) : 1;
      ctx.font = `12px ${FONT}`;
      const w = Math.max(...lines.map((t) => ctx.measureText(t).width)) + 14;
      const h = lines.length * 16 + 8;
      let x = at[0] + 10, y = at[1] - h - 8;
      x = Math.min(Math.max(4, x), this.cssW - w - 4);
      y = Math.min(Math.max(4, y), this.cssH - h - 4);
      ctx.fillStyle = th.textBg;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = th.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      lines.forEach((t, k) => ctx.fillText(t, x + 7, y + 5 + k * 16));
    });
    ctx.restore();
  }

  /** 단면 평면 위치: 평면 ∩ 장면 범위(조금 넓힌) 다각형을 옅게 칠하고 점선 테두리 */
  private drawSectionPlane(ctx: CanvasRenderingContext2D, f: ViewFrame): void {
    const plane = this.sectionPlane();
    const b = this.allBox;
    if (!plane || boxIsEmpty(b)) return;
    const pad = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) * 0.04 || 1;
    const poly = planeBoxPolygon({ min: [b.min[0] - pad, b.min[1] - pad, b.min[2] - pad], max: [b.max[0] + pad, b.max[1] + pad, b.max[2] + pad] }, plane);
    const pts = poly.map((p) => projectToScreen(f, p));
    if (pts.length < 3 || pts.some((p) => !p)) return;
    const col = this.theme.section ?? DARK_THEME.section!;
    ctx.save();
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p![0], p![1]) : ctx.moveTo(p![0], p![1])));
    ctx.closePath();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = col;
    ctx.fill();
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.restore();
  }

  /** 여러 단면의 평면 위치: 평면마다 다각형을 범위를 정하지 않은 다른 평면들로 잘라 옅게 칠한다 */
  private drawSectionPlanes(ctx: CanvasRenderingContext2D, f: ViewFrame): void {
    const b = this.allBox;
    if (boxIsEmpty(b)) return;
    const all = this.allSecs();
    const pad = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) * 0.04 || 1;
    const box: Box3 = { min: [b.min[0] - pad, b.min[1] - pad, b.min[2] - pad], max: [b.max[0] + pad, b.max[1] + pad, b.max[2] + pad] };
    const col = this.theme.section ?? DARK_THEME.section!;
    ctx.save();
    all.forEach((q, k) => {
      if (!q.plane) return;
      let poly = planeBoxPolygon(box, this.planeOf(q));
      all.forEach((o, j) => {
        if (j !== k && !o.items && poly.length) poly = clipPolygon(poly, this.planeOf(o));
      });
      const pts = poly.map((p) => projectToScreen(f, p));
      if (pts.length < 3 || pts.some((p) => !p)) return;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p![0], p![1]) : ctx.moveTo(p![0], p![1])));
      ctx.closePath();
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = col;
      ctx.fill();
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
    });
    ctx.restore();
  }

  private drawTriad(ctx: CanvasRenderingContext2D, f: ViewFrame): void {
    const b = f.basis;
    const ox = 40, oy = this.cssH - 40, len = 28;
    const th = this.theme;
    const axes: { v: V3; c: string; l: string }[] = [
      { v: [1, 0, 0], c: th.axisX, l: 'X' },
      { v: [0, 1, 0], c: th.axisY, l: 'Y' },
      { v: [0, 0, 1], c: th.axisZ, l: 'Z' },
    ];
    axes.sort((p, q) => dot(p.v, b.back) - dot(q.v, b.back));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const a of axes) {
      const ex = dot(a.v, b.right) * len, ey = -dot(a.v, b.up) * len;
      ctx.strokeStyle = a.c;
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + ex, oy + ey);
      ctx.stroke();
      if (Math.hypot(ex, ey) > 4) {
        ctx.fillStyle = a.c;
        ctx.fillText(a.l, ox + ex * 1.32, oy + ey * 1.32);
      }
    }
    ctx.restore();
  }

  private fmt(v: number): string {
    const diag = Math.max(length(sub(this.allBox.max, this.allBox.min)) || 1, 1e-9);
    const digits = Math.max(0, Math.min(6, 5 - Math.floor(Math.log10(diag))));
    const s = v.toFixed(digits);
    return s === `-${(0).toFixed(digits)}` ? (0).toFixed(digits) : s;
  }

  private drawMeasure(ctx: CanvasRenderingContext2D, f: ViewFrame): void {
    const pts = this.measurePts;
    const hover = this.measuring ? this.measureHover : null;
    if (!pts.length && !hover) return;
    const th = this.theme;
    const unit = UNIT_LABEL[this.sceneRef?.units ?? 'unknown'];
    const P = (p: readonly number[]): V3 | null => projectToScreen(f, p);
    const line = (a: V3 | null, b: V3 | null, color: string, width: number, dash: number[]): void => {
      if (!a || !b) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    const dotAt = (p: V3 | null, square: boolean): void => {
      if (!p) return;
      ctx.fillStyle = th.measure;
      ctx.strokeStyle = th.textBg;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (square) ctx.rect(p[0] - 4.5, p[1] - 4.5, 9, 9);
      else ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };
    /**
     * 0.8.0 붙잡기 표식: 가운데 점 = 세모, 중심 = 동그라미 테 + 십자(⊕), 그 밖의 앱 점 = 마름모.
     * 0.9.0 추론: 교차점 = 엇갈린 십자(×), 수직 발 = ⊥(두 선이 만나는 곳이 점)
     */
    const snapMarkAt = (p: V3 | null, kind: 'midpoint' | 'center' | 'point' | 'intersection' | 'perpendicular'): void => {
      if (!p) return;
      const [x, y] = p;
      ctx.fillStyle = th.measure;
      ctx.strokeStyle = th.textBg;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (kind === 'intersection' || kind === 'perpendicular') {
        // 바탕 테(대비) 위에 측정 색 선
        for (const [color, w] of [
          [th.textBg, 4.5],
          [th.measure, 2],
        ] as const) {
          ctx.strokeStyle = color;
          ctx.lineWidth = w;
          ctx.beginPath();
          if (kind === 'intersection') {
            ctx.moveTo(x - 6, y - 6);
            ctx.lineTo(x + 6, y + 6);
            ctx.moveTo(x + 6, y - 6);
            ctx.lineTo(x - 6, y + 6);
          } else {
            ctx.moveTo(x - 7, y);
            ctx.lineTo(x + 7, y);
            ctx.moveTo(x, y);
            ctx.lineTo(x, y - 10);
          }
          ctx.stroke();
        }
      } else if (kind === 'midpoint') {
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x + 5.5, y + 4);
        ctx.lineTo(x - 5.5, y + 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (kind === 'point') {
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x + 6, y);
        ctx.lineTo(x, y + 6);
        ctx.lineTo(x - 6, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // 바탕 테(대비) 위에 측정 색 테와 십자
        for (const [color, w] of [
          [th.textBg, 4],
          [th.measure, 2],
        ] as const) {
          ctx.strokeStyle = color;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.moveTo(x - 9, y);
          ctx.lineTo(x + 9, y);
          ctx.moveTo(x, y - 9);
          ctx.lineTo(x, y + 9);
          ctx.stroke();
        }
      }
    };
    const label = (at: V3 | null, lines: string[]): void => {
      if (!at || !lines.length) return;
      ctx.font = `12px ${FONT}`;
      const w = Math.max(...lines.map((s) => ctx.measureText(s).width)) + 14;
      const h = lines.length * 16 + 8;
      let x = at[0] + 10, y = at[1] - h - 8;
      x = Math.min(Math.max(4, x), this.cssW - w - 4);
      y = Math.min(Math.max(4, y), this.cssH - h - 4);
      ctx.fillStyle = th.textBg;
      ctx.strokeStyle = th.measure;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = th.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      lines.forEach((s, i) => ctx.fillText(s, x + 7, y + 5 + i * 16));
    };
    ctx.save();
    const a = pts[0], b = pts[1] ?? (hover ? hover.p : undefined);
    if (a && b) {
      const sa = P(a), sb = P(b);
      // 축 방향 다리: A → (Bx, Ay, Az) → (Bx, By, Az) → B
      const k1: V3 = [b[0], a[1], a[2]], k2: V3 = [b[0], b[1], a[2]];
      if (pts.length === 2) {
        line(sa, P(k1), th.axisX, 1.5, [5, 4]);
        line(P(k1), P(k2), th.axisY, 1.5, [5, 4]);
        line(P(k2), sb, th.axisZ, 1.5, [5, 4]);
      }
      // 0.9.0 축 붙잡기 미리 보기: 첫 점에서 그 축 색 안내선
      const ax = pts.length === 1 && hover?.kind === 'axis' ? hover.axis : undefined;
      line(sa, sb, ax ? (ax === 'x' ? th.axisX : ax === 'y' ? th.axisY : th.axisZ) : th.measure, 2, pts.length === 2 ? [] : [6, 4]);
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const mid = sa && sb ? ([(sa[0] + sb[0]) / 2, (sa[1] + sb[1]) / 2, 0] as V3) : sb ?? sa;
      const u = unit ? ` ${unit}` : '';
      const fm = this.measureFmt;
      // 글 꼴에는 onMeasure와 같은 결과를 준다(0.9.1 — 붙잡기를 켰으면 snapA·snapB·axisB도. 미리 보기의 B는 커서 아래 붙잡을 점)
      const snapB = pts[1] ? this.measureSnaps.get(pts[1]) : hover ? { kind: hover.kind, ...(hover.axis ? { axis: hover.axis } : {}) } : undefined;
      label(
        mid,
        fm
          ? fm({ ...measureResult([...a] as V3, [...b] as V3, this.snapOpt ? [this.measureSnaps.get(a), snapB] : null), units: this.sceneRef?.units ?? 'unknown' })
          : [`거리 ${this.fmt(Math.hypot(dx, dy, dz))}${u}`, `ΔX ${this.fmt(dx)}  ΔY ${this.fmt(dy)}  ΔZ ${this.fmt(dz)}`],
      );
    }
    for (const p of pts) dotAt(P(p), false);
    if (hover) {
      const k = hover.kind;
      // 0.7.2의 두 모양(꼭짓점·끝점 네모, 붙잡지 않음 동그라미) 그대로, 0.8.0 붙잡기 종류만 새 모양
      if (k === 'midpoint' || k === 'center' || k === 'point' || k === 'intersection' || k === 'perpendicular') snapMarkAt(P(hover.p), k);
      else if (k === 'axis' && hover.axis) {
        // 축 위 점: 축 색 동그라미
        const sp = P(hover.p);
        if (sp) {
          ctx.fillStyle = hover.axis === 'x' ? th.axisX : hover.axis === 'y' ? th.axisY : th.axisZ;
          ctx.strokeStyle = th.textBg;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sp[0], sp[1], 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      } else dotAt(P(hover.p), hover.vertex);
    }
    ctx.restore();
  }
}
