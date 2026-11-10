/**
 * 3D 뷰어(WebGL2): 형식 해석기가 만든 Scene3d를 그리고, 궤도·이동·확대, 표준 뷰, 고르기, 측정을 한다.
 *
 * 조작
 * - 마우스: 왼쪽 끌기 = 궤도 회전(커서 아래 점 둘레), 가운데·오른쪽 끌기 = 이동, Shift+가운데 끌기 = 회전,
 *   휠 = 커서 쪽으로 확대·축소, 가운데 두 번 누르기 = 전체 보기, 왼쪽 누르기 = 고르기(측정 모드면 점 찍기)
 * - 터치: 한 손가락 = 회전(TOUCH_DRAG_START_PX = 10화소 넘게 움직일 때부터, 그 안에서 떼면 누르기),
 *   두 손가락 = 이동·핀치 확대(한 손가락을 먼저 떼면 남은 손가락은 모두 뗄 때까지 회전도 누르기도 하지 않는다).
 *   터치로 누르면 고르기·측정 붙잡기 허용 거리가 넓다(touchPickTolerance, 기본 14화소)
 * - 0.32.0: 앱이 누르기마다(누른 순간·끌기 시작 거리를 넘은 순간) 포인터를 맡을 수 있다(setPointerClaim·claimPointer) — 맡은 포인터로는 위 조작을 하지 않는다
 * - 키(캔버스에 초점이 있을 때): F = 전체 보기, 1 앞 2 뒤 3 왼쪽 4 오른쪽 5 위 6 아래 7 남동 등각, Esc = 측정 지우기
 * - 오른쪽 위 뷰 큐브: 면·모서리·구석을 누르면 그 방향 표준 뷰, 끌면 회전
 *
 * 프레임은 상태가 바뀔 때만 requestAnimationFrame 한 번으로 그린다.
 */
import type { Box3, LineSet3d, Mesh3d, Pick3d, PointSet3d, Rgba, Scene3d, SnapKind, SnapPoint } from './types';
import { boxCenter, boxIsEmpty, boxSphere, emptyBox, expandPoint, forgetBounds, itemBounds, itemRangesBounds, okCoord, sceneBounds, transformBox, unionBox } from './bounds';
import { type CutRanges, type IndexRange, type RangePart, cutBits, cutMaskAt, cutParts, cutRuns, mergeRanges, partCuts, partitionRanges, rangeTester } from './ranges';
import type { FaceOutline } from './pickpreview';
import { type Bvh, type PrimKind, buildBvh, primCount as bvhPrimCount } from './bvh';
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
import { type V3, dot, hasOrigin, mat4Mul, modelMatrix, placeMatrix, transform4, transformPoint, translation } from './math';
import {
  PICK_CANDIDATES_MAX,
  type PickDetail,
  type ScenePickItems,
  type ScenePickOptions,
  occludingDepth,
  pickScene,
  pickSceneCandidates,
  samePickTarget,
  segmentsNear,
  trianglesNear,
} from './scenepick';
import {
  type MeasurePointSnap,
  type MeasureSnapPick,
  type SnapCandidate,
  type SnapFace,
  type SnapRefineFaceInput,
  type SnapRefineInput,
  type SnapRefineLine,
  type SnapSegment,
  OPEN_REFINE_CALLS,
  RefineMemo,
  acceptOnFace,
  acceptOnLine,
  acceptRefined,
  chooseMeasureSnap,
  copySegment,
  finitePoint,
  measureResult,
  openRefineKey,
  refineOpen,
  refineTarget,
  sameFirst,
  sameRefineInput,
  samePick,
  snapLimit,
  snapPriority,
  snapRaw,
  snapSegmentsOf,
  withinSnapLimit,
} from './snap';
import {
  EXACT_SNAP_SCALE,
  LENS_SEGMENTS,
  MeasureTracker,
  OPEN_EDGE_CHORD,
  type OpenEdgeCandidate,
  type OpenEdgeSnap,
  type OpenFaceSnap,
  type TrackDirKind,
  type TrackDirLine,
  type TrackDirMeetSnap,
  type TrackDirOtherLine,
  type TrackFaceHit,
  type TrackGuide,
  type TrackLine,
  type TrackTriangle,
  acceptEdgePatch,
  acceptFacePatch,
  axisEdgeSnap,
  axisFaceSnap,
  chooseTrackPoint,
  hiddenByOwnPatch,
  lensEdgeSnap,
  lineScreenGap,
  lockEdgeSnap,
  lockFaceSnap,
  lockTrackSnap,
  openEdgeSnap,
  openFaceSnap,
  sameTrackPoint,
  trackAlongFirst,
  trackAxisSnap,
  trackCrossSnap,
  trackDirGuides,
  trackDirMeetSnap,
  trackDirPairSnap,
  trackDirSnap,
  trackEdgeSnap,
  trackPairSnap,
  vertexEdgeSnap,
} from './track';
import {
  LABEL_POINT_R,
  type LabelAvoidAreas,
  type LabelCircle,
  type LabelFallback,
  type LabelPlaceOptions,
  type LabelSpotName,
  type MeasureLabelRect,
  avoidRect,
  labelSpotName,
  placeLabelAmong,
  placeMeasureLabel,
} from './measurelabel';
import {
  type InferenceLock,
  type InferenceLockInput,
  type MeasureInference,
  type NearSegment,
  type NormalizedInference,
  type SnapAxis,
  type TrackDirEdgeFilter,
  axisAligned,
  axisLock,
  axisSnap,
  directionLock,
  edgeLineLock,
  inferenceCandidates,
  lockFromSnap,
  openCandidates,
  lockedSnap,
  nearSegmentId,
  normalizeInference,
  parallelSnap,
  rayLinePoint,
  unitDir,
} from './inference';
import { SNAP_INDEX_MIN, SnapPointIndex } from './snapindex';
import { type RayHit, castRay, walkStep } from './walk';
import {
  type Annotation3d,
  type AnnotationGeometry,
  annotationGeometry,
  annotationLabelLook,
  annotationText,
  dashedRectSegments,
  measureDigits,
  measureNumber,
} from './annotate';
import {
  type ClosestPart,
  type ClosestResult,
  ClosestSearch,
  type ClosestShape,
  type ClosestSliceStats,
  closestBetween,
  closestKey,
  closestPart,
  closestSlice,
  sameClosestKey,
  sliceRange,
} from './closest';
import { billboardAngle, billboardBounds, billboardMatrix, towardCamera } from './billboard';
import { type AmbientOcclusionOptions, aoParams } from './ao';
import { type SceneIssue, boundsOk, checkMesh, checkScene } from './sceneissues';
import { countIdsUpTo } from './playback';
import { type AnimateSetting, CAMERA_MOVE_MS, type FlyToOptions, moveDuration, normalizeAnimate, resolveAnimate, watchReducedMotion } from './motion';
import { DRAG_START_PX, type LastClick, PICK_TOLERANCE_PX, TOUCH_DRAG_START_PX, TOUCH_PICK_TOLERANCE_PX, clickCount, dragStarted, isTouch, pickTolerance, walkKeyOf } from './pointer';
import { type PointerHold, PointerHolds, takesBackTouches } from './claim';
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
import {
  type DrawRange,
  type GpuBufferStats,
  type ItemParts,
  type RenderColors,
  type RenderMode,
  type RenderState,
  type RenderStats,
  type TextureSource,
  type TextureStats,
  INSTANCE_MIN,
  type MergeKitState,
  Renderer3d,
  loadMergeKit,
  mergeKitState,
} from './renderer';
import { MERGE_AUTO_MIN, type MergingMode } from './mergeopts';
import { type MeshArrays, type ReleaseFlags, type RestoreNeed, releaseFlags } from './release';
import { TEXTURE_BUDGET, TEXTURE_LIMIT } from './texture';
import { CANVAS_CSS, CANVAS_FOCUS_CSS, DARK_THEME, FOCUS_DEFAULT, LIGHT_THEME, THEME_CSS_VARS, type Viewer3dTheme, contrastLineColor, focusKey, focusLeft, parseColor, pointerFocus } from './theme';
import { CUBE_TOUCH_BAND, CUBE_TOUCH_SIZE, cubeHit, cubeLayout, drawViewCube } from './viewcube';
import {
  KEY_BIG_STEP_PX,
  KEY_CANDIDATES_MAX,
  KEY_POINTER,
  KEY_STEP_PX,
  type KeySnapAction,
  type KeySnapKeys,
  type KeySnapMessageFn,
  type KeySnapMessageKey,
  type KeySnapText,
  candidateText,
  inPoints,
  keySnapAction,
  keySnapHint,
  keySnapMessages,
  keySnapText,
  moveKeyCursor,
  normalizeKeySnapKeys,
  orderedText,
  pointText,
  samePoint3,
  skipPoints,
  snapKindText,
} from './keysnap';

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
  /**
   * 0.44.0 손가락 뷰 큐브(기본 켬 — 바뀐 기본 동작): 손가락(pointerType 'touch')으로 큐브를 누르면 고르지 않고 큐브를 CUBE_TOUCH_SIZE(224) 화소로 펴서
   * 띠 경계를 보이고, 편 큐브를 다시 누르면 그 자리(띠 CUBE_TOUCH_BAND 0.3)의 뷰로 간 뒤 접는다. 편 큐브 밖을 누르거나 Esc면 고르지 않고 접는다.
   * false면 0.43.0처럼 손가락도 바로 고른다. { size, band }로 편 크기(이 큐브 크기보다 커야 편다 — 뷰어 짧은 변 − 16으로 자른다)·띠를 바꾼다.
   * 마우스·펜은 늘 0.43.0 그대로다
   */
  viewCubeTouch?: boolean | ViewCubeTouchOptions;
  /** 왼쪽 아래 좌표축(기본 true) */
  axes?: boolean;
  /** 키 입력(기본 true, 캔버스에 초점이 있을 때만) */
  keyboard?: boolean;
  projection?: Projection;
  renderMode?: RenderMode;
  /**
   * 카메라를 날리는 길(표준 뷰·전체 보기·맞춰 보기·뷰 큐브·키 F·1~7·가운데 단추 두 번·창 확대·flyTo)을 부드럽게(기본 true — 0.47.0 그대로).
   * false면 바로 옮긴다. 0.48.0 'auto'면 사용자의 움직임 줄이기 선호(prefers-reduced-motion: reduce)일 때 바로 옮기고, 뷰어를 연 뒤 OS·브라우저 설정이 바뀌어도
   * 따라간다(WCAG 2.3.3). setAnimate로 바꾸고 animate로 지금 값을 읽는다. 각 함수에 animate 인자를 주면 그 값이 이긴다
   */
  animate?: AnimateSetting;
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
   * 앱이 단위(파일·mm·in)·자릿수·언어를 맞출 때 쓴다. 없으면 기본("거리 … mm" / "ΔX … ΔY … ΔZ …"). setMeasureFormat으로 바꾼다.
   * 0.31.0: 둘째 인자로 코어 기본 꼴(MeasureFormatCore)을 받는다 — 이름표만 옮기는 앱은 수·자릿수·단위 글을 다시 세지 않는다
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
  /** 이 평면이 통째로 자르는 묶음 id(setSections에서 정했을 때만 — 0.44.0: 구간만 준 평면이면 빈 목록) */
  items?: string[];
  /** 0.44.0 이 평면이 자르는 묶음 안 구간(setSections items에 구간을 주었을 때만 — 묶음·종류마다 합친 것, 통째로 자르는 묶음의 구간은 뺀다) */
  ranges?: SectionItemRange[];
  /** setSections에서 준 식별자 */
  id?: string;
}

/**
 * 0.44.0 단면이 자르는 묶음 안 구간(setSections items에 묶음 id 대신 준다): 그물 = 삼각형, 선분 묶음 = 선분, 점 묶음 = 점 번호 [start, start + count)
 * (setHiddenRanges·Pick3d.raw와 같은 번호). edges: true면 그물 윤곽선(Mesh3d.edges)의 선분 번호 — 윤곽선은 이것으로 준 구간만 자른다
 */
export interface SectionItemRange {
  id: string;
  start: number;
  count: number;
  edges?: boolean;
}

/** 0.44.0 setSections items 하나: 묶음 id(통째로 자른다) 또는 묶음 안 구간 */
export type SectionItem = string | SectionItemRange;

/** 0.44.0 손가락 뷰 큐브 선택(Viewer3dOptions.viewCubeTouch·setViewCubeTouch) */
export interface ViewCubeTouchOptions {
  /** 편 큐브 한 변(CSS 화소, 기본 CUBE_TOUCH_SIZE 224) */
  size?: number;
  /** 편 큐브의 면 가장자리 띠 폭(면 한 변 대비 0.1~0.4, 기본 CUBE_TOUCH_BAND 0.3) */
  band?: number;
}

/**
 * 0.53.0 손가락 뷰 큐브를 펴거나 접은 까닭(onViewCubeExpandedChange): 'touch' 손가락으로 접힌 큐브를 눌러 폈다 · 'pick' 편 큐브에서 면·모서리·꼭짓점을 골라 접었다 ·
 * 'cube' 편 큐브의 고를 것이 없는 자리를 눌러 접었다 · 'canvas' 3D 보기를 눌러 접었다 · 'escape' Esc로 접었다 ·
 * 'option' 앱이 큐브 선택을 바꿔 접었다(setViewCubeVisible(false)·setViewCubeTouch·setViewCubeSize)
 */
export type ViewCubeExpandReason = 'touch' | 'pick' | 'cube' | 'canvas' | 'escape' | 'option';

/** 0.53.0 손가락 뷰 큐브 펴기·접기 알림 사건: 까닭과 바뀐 뒤 큐브 자리(viewCubeRect와 같은 값 — 편 동안은 편 자리) */
export interface ViewCubeExpandEvent {
  reason: ViewCubeExpandReason;
  rect: MeasureLabelRect | null;
}

/** setSections의 평면 하나: normal·p = offset의 법선 쪽을 잘라 낸다 */
export interface SectionPlane extends SectionOptions {
  normal: readonly number[];
  offset: number;
  /**
   * 이 평면이 자르는 묶음 id(없으면 모두). 0.44.0: 묶음 id 대신 묶음 안 구간({ id, start, count, edges? })도 — 그 구간만 자른다(같은 묶음의 다른 구간은 그대로).
   * 같은 묶음 id를 통째로도 주면 통째로 자른다
   */
  items?: readonly SectionItem[] | null;
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
  /**
   * 0.26.0: onPick(cb, { front: true })로 단 알림에만 있다 — 같은 누르기에서 반투명 그물을 지나지 않은 고르기(그 알림의 throughTranslucent만 뺀 고르기 —
   * meshesOnly는 그 알림 그대로, 가장 앞의 그물 면·선분·점). 빈 곳이면 null. throughTranslucent 없이 단 알림이면 첫 인자와 같은 객체다
   */
  front?: Pick3d | null;
  /**
   * 0.47.0: 가상 커서(setKeyboardSnap pickCycle)로 겹친 후보를 돌려 둘째 이후 후보(index ≥ 1)를 Enter로 골랐을 때만 있다 — 그 후보의 차례와 후보 수.
   * 이때 모든 알림이 그 후보를 받는다(front 알림의 front도 그 후보, 그물 면만 받는 알림은 후보가 그물 면이 아니면 그 알림의 보통 고르기)
   */
  cycle?: { index: number; count: number };
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
   * 두 점을 붙잡은 종류(0.8.0): 'vertex'·'endpoint'·'midpoint'·'center'·'point'(0.9.0부터 추론 'intersection'·'perpendicular'·'axis', 0.10.0 'parallel', 0.38.0 앱 접점 'tangent'),
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
  /**
   * 방향 추론의 단위 방향(0.10.0): snapA·snapB가 첫 점을 지나는 선 위의 점('axis' — +X·+Y·+Z, 'parallel' — 기준 선분 방향,
   * 'perpendicular' — 첫 점 → 수직 발)일 때만. 다른 종류면 없다. 방향 추론은 첫 점을 찍은 뒤에만 되므로 지금은 directionB만 실린다
   */
  directionA?: V3;
  directionB?: V3;
  /** 추론 잠금(0.10.0 — Shift·setMeasureInferenceLock)으로 잠근 선 위에 찍은 점이면 true(아니면 없다) */
  lockedA?: boolean;
  lockedB?: boolean;
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
 * pointsFor의 둘째 인자(0.38.0): 그 미리 보기의 측정 상태. 코어는 늘 넘긴다(인자 하나로 적은 앱 함수는 그대로다).
 * first = 측정 첫 점(첫 점만 찍었을 때 그 세계 점의 복사본 — 추론 붙잡기의 첫 점과 같다), 아니면 null(아직 찍지 않았거나 두 점을 찍었다).
 * 첫 점에 따라 다른 점(접점 등)을 주려면 MeasureSnapOptions.pointsForFirst를 켠다 — 끄면 기억(0.10.0)이 고르기로만 정해져 첫 점이 바뀌어도 앞 결과를 다시 쓴다
 */
export interface PointsForContext {
  first: V3 | null;
}

/**
 * 두 묶음 최근접점 선택(Viewer3d.closestPoints·closestPointsAsync): maxDistance = 그보다 멀면 찾지 않고 null,
 * 0.41.0 indices = 결과에 두 점이 놓인 기본 도형 번호(rawA·rawB — Pick3d.raw, indexA·indexB — Pick3d.index와 같은 뜻)를 싣는다(기본 꺼짐 — 끄면 0.40.0과 같은 필드)
 */
export interface ClosestPointsOptions {
  maxDistance?: number;
  indices?: boolean;
  /**
   * 0.45.0 묶음 안 구간(면 표의 면 하나 같은 기본 도형 구간 — 그물 = 삼각형, 선분 묶음 = 선분, 점 묶음 = 점. Pick3d.raw·setHiddenRanges와 같은 번호, 여럿이면 합친다):
   * 주면 그 묶음은 그 구간의 기본 도형만 잰다(rangeA = idA 쪽, rangeB = idB 쪽). 구간만의 BVH를 만들어(이어진 구간 하나는 배열을 복사하지 않는다) 묶음·구간마다 기억한다.
   * 결과 번호(rawA·rawB·indexA·indexB)는 묶음 번호 그대로다. 묶음 수 밖은 자르고, 남는 것이 없으면 null. 주지 않으면 0.44.0 그대로(묶음 통째)
   */
  rangeA?: IndexRange | readonly IndexRange[] | null;
  rangeB?: IndexRange | readonly IndexRange[] | null;
}

/**
 * 나눠 돌리는 최근접점 선택(0.41.0 Viewer3d.closestPointsAsync): signal = 멈추기(AbortSignal — 멈추면 그 reason으로 거절),
 * sliceMs = 한 조각 시간(기본 CLOSEST_SLICE_MS = 8 ms, 1000 위는 1000), stats = 0으로 채운 기록 객체를 주면 조각 수·가장 긴 조각·다시 찾은 횟수를 적는다
 */
export interface ClosestPointsAsyncOptions extends ClosestPointsOptions {
  signal?: AbortSignal | null;
  sliceMs?: number;
  stats?: ClosestSliceStats | null;
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
   * 마우스 이동마다 부르므로 가볍게. id를 주지 않은 점은 고른 묶음 id로 자르고 가린다.
   * 0.10.0: 바로 앞과 같은 고르기(종류·묶음·번호·고른 점·법선이 같다 — 같은 자리에서 미리 본 뒤 누르기, 붙잡기 한도·잠금이 바뀌어 다시 구하기)면
   * 다시 부르지 않고 앞 결과를 쓴다. 결과는 고른 것으로만 정해져야 한다(앱 자료가 바뀌면 setMeasureSnap을 다시 준다 — 0.8.0부터의 약속)
   * 0.38.0: 둘째 인자 ctx(PointsForContext — 측정 첫 점)를 넘긴다(앱이 직접 부를 때를 위해 타입은 선택 인자). pointsForFirst를 켜면 결과가 고른 것과 첫 점으로 정해져도 된다.
   * 앱 자료만 바뀌었으면 Viewer3d.clearMeasurePointsFor로 기억만 비운다
   */
  pointsFor?: ((pick: Pick3d, ctx?: PointsForContext) => readonly SnapPoint[] | null | undefined) | null;
  /**
   * 0.38.0(기본 꺼짐): pointsFor 기억(0.10.0 — 바로 앞과 같은 고르기면 다시 부르지 않는다)을 고르기와 측정 첫 점(ctx.first)으로 정한다 — 첫 점을 찍거나
   * 지우면(두 점째·Esc·측정 지우기) 같은 고르기에서도 다시 부른다. 앱이 첫 점에 따라 다른 점(첫 점에서 곡선에 그은 접선의 접점 등)을 줄 때 켠다.
   * 같은 첫 점·같은 고르기면 예전처럼 다시 쓴다(첫 점은 좌표 값으로 견준다). 주지 않거나 false면 0.37.0과 같다(이것만으로는 붙잡기를 켜지 않는다)
   */
  pointsForFirst?: boolean;
  /**
   * 추론 붙잡기(0.9.0, 기본 꺼짐): intersections = 커서 둘레 두 선분(선분 묶음·윤곽선)의 3D 교차점, perpendicular = 첫 측정 점에서
   * 커서 둘레 선분으로 내린 수직 발, axes = 첫 측정 점에서 X·Y·Z 축 방향(점 붙잡기가 없을 때만 — 축 색 안내선). true면 셋 모두.
   * 그물 윤곽선은 측정 중 윤곽선을 고를 때만(edges 또는 pickEdges) 쓴다.
   * 0.10.0(true에 들지 않는다 — 따로 켠다): parallel = 첫 측정 점에서 커서가 앞서 지나간 선분과 나란한 방향(점 붙잡기가 없을 때만, 축과 견줘 가까운 것 —
   * 자홍 안내선), lock = Shift를 누르고 있는 동안 지금 방향 추론(축·나란함·수직)을 잠근다(Viewer3d.setMeasureInferenceLock은 이 선택과 상관없이 된다)
   * 0.16.0(true에 들지 않는다): track = 다른 점에서 끌어온 축 안내 — 마우스·펜이 점 붙잡기 위에 머문 점(2화소 안에서 dwellMs, 기본 500 ms)을 최근 셋까지 기억하고
   * (터치는 머무르기가 없다 — 앱이 setMeasureTrackPoints로 준다), 첫 점 축 위에서 그 점과 나란한 자리와 그 점을 지나는 X·Y·Z 축에도 붙잡는다.
   * 차례는 점 붙잡기 → 첫 점 축 위 나란한 자리 → 첫 점 축·나란함 → 끌어온 축. 두 점째를 찍거나 측정을 지우거나 붙잡기 선택을 다시 주면 잊는다.
   * 0.17.0: 끌어온 두 점의 서로 다른 축이 3D로 만나는 점(trackOther)과 끌어온 축이 커서 둘레 선분·윤곽선과 만나는 점(segment)도 붙잡는다 —
   * 첫 점 축 위 나란한 자리와 함께 점 후보로 첫 점 축·나란함보다 먼저다(셋 사이는 화면에서 가까운 것, 뒤 차례는 1화소 넘게 가까워야 한다). 첫 점 전에도 된다.
   * 0.18.0(true에 들지 않는다): axisEdges = 첫 점을 지나는 X·Y·Z 축이 커서 둘레 선분·윤곽선과 3D로 만나는 점(snap 'axis'·axis·direction·segment —
   * 끌어온 점이 없어도 된다). 점 후보로 첫 점 축·나란함보다 먼저고, 끌어온 점 후보 셋 뒤 차례로 함께 견준다. 방향이 있어 Shift로 그 축에 잠근다.
   * axisFaces = 첫 점 축·끌어온 축이 커서 아래 보이는 그물 면을 뚫는 점(snap 'axis'·axis·face — 첫 점 축이면 direction, 끌어온 축이면 trackFrom).
   * 커서가 그물 면 위일 때만이고, 첫 점 축과 선분의 교차 뒤 차례로 함께 견준다(0.19.0부터 refineFace가 있으면 다듬는다).
   * 0.19.0(true에 들지 않는다): lockEdges·lockFaces = 잠근 동안(Shift·setMeasureInferenceLock) 커서 아래 점 붙잡기가 없으면 잠근 선이 커서 둘레 선분·윤곽선과
   * 3D로 만나는 점(segment)·커서 아래 보이는 그물 면을 뚫는 점(face)을 잠근 선 위 커서에 가까운 점보다 먼저 찍는다(axisEdges·axisFaces와 같은 허용치·빼는 규칙,
   * 선분 → 면 차례 — 뒤 차례는 1화소 넘게 가까워야 한다). 값은 잠근 선 위 점 그대로(종류·방향·locked)에 segment나 face가 더해진다
   * 0.27.0(true에 들지 않는다): trackDirs = 끌어온 점(track)에서 커서가 앞서 지나간 선분과 나란한 선·수직인 선 위의 점(snap 'parallel'·'perpendicular'·trackFrom·edge,
   * direction 없음 — 잠그지 않는다). 끌어온 축과 화면에서 가까운 것(같으면 끌어온 축)이고 첫 점 축·나란함 뒤 차례다. 끌어온 점에서 추론 색 쇄선을 긋는다.
   * 0.28.0: trackDirs: { edge(seg, item) } = 기준 선분이 될 수 있는 선분만(곡선을 나눈 현 등을 앱이 거른다 — 거른 선분을 지나면 앞 기준이 남는다)
   * 0.29.0: trackDirs: { meets: true } = 그 선이 첫 점 축·첫 점의 나란함·다른 끌어온 점의 축·커서 둘레 선분·커서 아래 면과 만나는 점(끌어온 점 후보 뒤 차례 —
   * 첫 점 축·나란함보다 먼저). 첫 점 축과 만나면 axis·direction이 실려 Shift가 그 축에 잠근다.
   * 0.30.0: trackDirs: { meets: { guides: true } } = 그에 더해 두 끌어온 점의 안내 선끼리 3D로 만나는 점(trackGuide — 0.29.0 만나는 점 뒤 차례)
   * 0.29.0: parallelEdge(seg, item) = 0.10.0 나란함(첫 점에서)의 기준 선분이 될 수 있는 선분만(trackDirs edge와 같은 꼴 — 따로 준다, 주지 않으면 0.28.0 그대로)
   */
  inference?: MeasureInference | boolean | null;
  /**
   * 붙잡기 한도(0.10.0, 기본 없음): 차례 값(SnapPoint.order)이 이보다 작은 앱 점만 붙잡는다(points·pointsFor 모두, 차례가 없는 점은 늘).
   * 처음 값이고, 바꿀 때는 setMeasureSnapLimit(n)(점 목록·색인을 다시 만들지 않는다)
   */
  limit?: number | null;
  /**
   * 측정 붙잡기 다듬기(0.14.0, 기본 없음): 코어가 붙잡을 점을 고른 뒤(그리기·찍기 전) 그 점이 수직 발('perpendicular' — 추론 붙잡기),
   * 코어 선분 가운데 점('midpoint' — midpoints), 붙잡지 않은 선분·윤곽선 위 점('onEdge')이면 한 번 부른다. 화면용 꺾은선 토막 위의 점을
   * 앱이 아는 정확한 형상(B-rep 곡선 등) 위로 옮길 때 그 세계 점을 돌려준다. null·undefined(또는 수가 아닌 값)면 코어 점 그대로.
   * 받은 점은 표식 자리·찍은 점·거리·measurePoints·measureHoverSnap에 모두 쓴다. 다만 코어 점과 화면 거리가 붙잡기 거리를 넘거나,
   * 눈 뒤·가까운 면 앞이거나, 그 묶음의 단면에 잘린 쪽이면 버리고 코어 점을 쓴다. 추론 잠금(Shift·setMeasureInferenceLock) 중에는 부르지 않는다
   * (잠근 선 위 점이 먼저다). 끝점·꼭짓점·앱 점(points·pointsFor)·축·나란함은 넘기지 않는다.
   * 마우스 이동마다 부르므로 가볍게. 바로 앞 호출과 입력이 같으면(같은 자리에서 미리 본 뒤 누르기) 다시 부르지 않고 앞 결과를 쓴다.
   * 0.15.0: 코어 교차점('intersection' — 두 선분, 둘째는 SnapRefineInput.other)도 넘긴다. 또 이 함수가 있으면 꺾은선으로는 후보가 없는
   * "열린 후보"(SnapRefineInput.open — 첫 점에서 내린 발이 토막 밖인 커서 둘레 토막의 수직 발, 허용치보다 조금 떨어져 지나가는 두 토막의 교차점)도
   * 부른다. 앱이 돌려준 점이 커서에서 붙잡기 거리 안이고 보이면(눈 뒤·가까운 면 앞·단면에 잘린 쪽이 아니고 가리지 않음) 그 점으로 붙잡기 후보가 되고,
   * null이면 후보가 없다(refine이 없거나 null만 돌려주면 0.14.0과 같다). 열린 후보는 미리 보기 한 번에 새로 OPEN_REFINE_CALLS(6)번까지 부르고,
   * 커서 광선을 뺀 입력으로 기억해(setMeasureSnap마다 새로) 같은 둘레에서는 다시 부르지 않는다.
   * 0.18.0: 축(첫 점 축 — inference.axisEdges, 끌어온 축 — inference.track)이 선분과 만나는 점도 'axisEdge'로 그 축 직선(SnapRefineInput.line)과 함께 넘긴다.
   * 앱이 축 직선과 그 선분 곡선의 교차점을 주면 축 직선 위로 내린 자리를 쓰고(앱 점에서 화면 반 화소 넘게 축을 벗어나면 버린다), null이면 꺾은선 위 점 그대로다.
   * 열린 후보처럼 커서 광선을 뺀 입력으로 기억한다.
   * 0.19.0: 잠근 동안에는 부르지 않는 것(0.14.0)의 예외로, 잠근 축이 선분과 만나는 점(inference.lockEdges)은 잠근 선이 축일 때 'axisEdge'로 부른다
   * (잠그기 전 첫 점 축과 선분의 교차와 같은 입력이라 기억을 함께 쓴다).
   * 0.20.0: 나란함·수직·선분 방향·앱이 정한 방향으로 잠근 선도 'axisEdge'로 부른다(SnapRefineLine.axis 없음). 또 축(첫 점 축 — axisEdges, 끌어온 축 — track,
   * 잠근 선 — lockEdges)이 커서 둘레 토막과 3D로 만나지 않지만 그 활꼴(현과 곡선 사이)을 지날 만큼 가까이 지나가면 열린 후보로 부른다('axisEdge', open = true,
   * point = 선 위에서 토막에 가장 가까운 점). 앱이 곡선과의 교차를 주면 그 점(선 위로 내린 자리)이 붙잡기 후보가 되고, null이면 후보가 없다(0.19.0과 같다).
   * 호출 한도는 0.15.0 열린 후보와 함께 쓴다(미리 보기 한 번에 OPEN_REFINE_CALLS)
   * 0.22.0: 열린 후보의 선이 현의 직선과 같은 평면에서 토막 밖에서 만나거나 나란하고 현 가운데에서 활꼴 높이 한도(0.1 × 토막 길이) 안을 지나면(곡선에 거의 닿듯 —
   * 활꼴을 두 번 지날 수 있다) point를 현의 다른 끝(나란하면 각 끝)에서 그 선에 내린 발로 바꿔 한 번 더 부른다. 앱이 point 둘레 교차 하나를 주면 두 교차가 따로 온다.
   * 그 선·토막의 앱 점은 코어 점 거리 대신 토막 범위(현에 내린 자리가 범위 안·현에서 0.1 × 토막 길이 안)로 받는다
   * 0.23.0: 모든 열린 후보('axisEdge', open)의 앱 점을 코어 점 거리 대신 토막 범위와 커서 붙잡기 거리로 받는다. 선에서 그 토막 범위인 조각이 커서에서 붙잡기 거리 밖이면 부르지 않는다
   * 0.38.0: 닫힌 'axisEdge'(선이 토막과 3D로 만나는 코어 교차)의 앱 점도 코어 점에서 붙잡기 거리 밖이면 열린 교차와 같은 규칙(그 선 위로 내린 자리가 그 토막 범위 안·
   * 토막 끝에서 반 화소 넘게·현에서 0.1 × 토막 길이 안, 커서에서 붙잡기 거리 안, 가리지 않음)으로 받는다 — 선이 현을 얕게 가로질러 곡선 교차가 현 위 코어 점에서 멀 때. 호출·기억은 그대로다
   */
  refine?: ((c: SnapRefineInput) => readonly number[] | null | undefined) | null;
  /**
   * 축이 면을 뚫는 점 다듬기(0.19.0, 기본 없음): 축(첫 점 축·끌어온 축 — inference.axisFaces, 잠근 축 — inference.lockFaces)이 커서 아래 그물 면을 뚫는 점을 고른 뒤
   * 'axisFace'로 그 면(SnapRefineFaceInput.face — 그물 id·삼각형 번호·법선)과 축 직선(line)을 넘긴다. 앱이 그 직선과 정확한 곡면의 교차(point 둘레)를 주면
   * 축 직선 위로 내린 자리를 쓴다 — 받는 규칙·기억은 refine의 'axisEdge'와 같다(앱 점에서 화면 반 화소 넘게 축을 벗어나거나 코어 점에서 붙잡기 거리 밖·눈 뒤·
   * 그 그물 단면에 잘린 쪽이면 버린다, 가림은 다시 따지지 않는다, 커서 광선을 뺀 입력으로 기억). null·undefined면 삼각형 위 점 그대로다.
   * 잠근 동안에도 부른다(0.19.0은 잠근 선이 축일 때만, 0.20.0부터 축이 아닌 잠근 선도 — 그때 line.axis가 없다). refine과 따로 둔 까닭: refine 입력(SnapRefineInput)은 0.14.0부터 선분(segment)이 늘 있는 꼴이라
   * 선분이 없는 종류를 더하면 그 꼴로 적힌 앱 함수가 컴파일되지 않는다. 주지 않으면 0.18.0과 같다(refine만 줘도 붙잡기가 켜지는 것처럼 이것만 줘도 켜진다).
   * 0.21.0: 붙잡지 않은 그물 면 위 점(점 붙잡기·추론 없이 커서 광선이 삼각형을 맞은 점 — 잘린 면 채움은 빼고)도 'onFace'로 넘긴다(line = 커서 광선, 축 이름 없음).
   * 앱이 그 광선과 정확한 곡면의 교차(point 둘레)를 주면 광선 위로 내린 자리를 쓴다 — 앱 점에서 화면 반 화소 넘게 광선을 벗어나거나, 코어 점에서 맞은 삼각형의
   * 가장 긴 변 × ON_FACE_CHORD(0.1)보다 멀거나, 눈 뒤·가까운 면 앞·그 그물 단면에 잘린 쪽이면 버린다. 잠근 동안은 부르지 않는다(0.14.0 'onEdge'와 같다).
   * 기억은 바로 앞 입력 하나뿐이다(커서마다 다른 광선 — 같은 자리 미리 보기 뒤 누르기에서만 다시 쓴다)
   * 0.22.0: 축(첫 점 축·끌어온 축 — inference.axisFaces, 잠근 선 — inference.lockFaces)이 커서 둘레(붙잡기 거리 안) 그물 삼각형을 뚫지 않지만 그 삼각형과 곡면 사이를
   * 지날 만큼 가까우면(삼각형과의 거리가 반 화소보다 멀고 min(0.1 × 가장 긴 변, 붙잡기 거리의 세계 길이) 안 — 곡면이 삼각형 밖으로 볼록해 축이 곡면만 뚫는 자리) 'axisFace'를
   * open = true로 넘긴다(point = 선 위에서 그 삼각형 무게중심에 가장 가까운 점, face = 그 삼각형). 커서가 그물 면 위가 아니어도(실루엣 바깥) 본다. 앱 점은 그 선 위로 내린 자리가
   * 그 삼각형 위 곡면 조각 자리(삼각형 평면에 내린 발이 삼각형 안, 평면에서 0.1 × 가장 긴 변 안)이고 커서에서 붙잡기 거리 안이며 가리지 않으면 받는다.
   * 호출 한도는 0.15.0·0.20.0 열린 후보와 함께 쓴다(그 둘이 먼저). null이면 후보가 없다(0.21.0과 같다)
   * 0.23.0: 선에서 그 삼각형 위 곡면 조각 자리인 조각이 커서에서 붙잡기 거리 밖이면 그 열린 후보는 부르지 않는다(받을 수 없는 자리 — 받는 규칙은 그대로)
   * 0.24.0: 선이 그 삼각형 위 곡면 조각을 두 번 지날 수 있으면(곡면이 선과 나란해지는 자리가 그 삼각형을 지난다 — 볼록한 곡면을 아주 얕게 스칠 때) point를 선에서 그 조각
   * 자리인 조각의 두 끝으로 바꿔 한 번씩 더 부른다(0.22.0 refine 열린 교차의 둘째 힌트와 같은 틀 — 호출 한도·기억 열쇠·받는 규칙이 같다). 앱이 point 둘레 교차 하나를 주면 두 교차가 따로 온다
   */
  refineFace?: ((c: SnapRefineFaceInput) => readonly number[] | null | undefined) | null;
  /**
   * 0.23.0: 측정 점 고르기가 반투명 그물(투명도 < 1 — 그물 색 알파·setItemOpacity·setItemColor)의 면을 지나 그 뒤 불투명 그물 면을 고른다(PickOptions.throughTranslucent와 같은 고르기).
   * 커서 아래 면 위 점·꼭짓점, 축이 면을 뚫는 점(axisFaces·lockFaces), 'onFace' 다듬기, pointsFor에 넘기는 고르기가 모두 그 면을 본다. 반투명 면만 맞으면 예전처럼 그 면이다.
   * 선분·점·윤곽선, 앱 점의 가림(원래 불투명 면만 가린다), 면의 열린 교차가 보는 커서 둘레 삼각형은 그대로다. 주지 않거나 false면 0.22.0과 같다(이것만 줘도 붙잡기가 켜진다)
   * 0.24.0: setItemPickOpaque로 켠 그물에서는 멈춘다. 잠금·끌어온 점·찍은 점·다듬기 기억을 두고 이것만 바꾸려면 setMeasurePickThrough
   */
  throughTranslucent?: boolean;
  /**
   * 0.33.0(기본 꺼짐 — true이고 refine이 있을 때만): 켠 선(첫 점 축 — inference.axisEdges, 끌어온 축 — track, 끌어온 점 안내 선 — trackDirs { meets },
   * 잠근 선 — lockEdges)이 곡선을 나눈 꺾은선 꼭짓점(토막 끝)을 그 깊이에서 화면 반 화소 안으로 지나면, 그 꼭짓점을 끝으로 둔 커서 둘레 토막마다
   * 앱 refine을 'axisEdge'·open = true(point = 꼭짓점을 그 선에 내린 발, line = 그 선)로 불러 곡선과의 정확한 교차를 받는다.
   * 받는 규칙·호출 한도·기억은 0.23.0 열린 교차와 같다(그 선 위로 내린 자리가 토막 범위 안·토막 끝에서 반 화소 넘게·현에서 0.1 × 토막 길이 안, 커서에서 붙잡기 거리 안, 가리지 않음).
   * 받으면 그 꼭짓점의 끝점 붙잡기(잠근 동안이면 그 점을 잠근 선에 내린 자리)보다 먼저이고, 꼭짓점이 커서에서 붙잡기 거리 밖이면 다른 점 후보와 함께 견준다(열린 교차 뒤 차례).
   * 값은 열린 교차와 같은 꼴(축이면 snap 'axis'·axis·segment·refined, 안내 선이면 안내 종류·trackFrom·edge·segment·refined, 잠근 선이면 잠근 선 위 점에 segment·refined).
   * 곧은 꺾은선(앱이 null)과 꼭짓점에서 곡선을 가로지르는 선(앱 점이 꼭짓점과 반 화소 안)은 그대로 끝점이다. 주지 않거나 false면 0.32.0과 같다
   */
  refineEnds?: boolean;
  /**
   * 0.39.0(기본 꺼짐 — true이고 refine·refineFace가 있을 때만): 선(첫 점 축 — inference.axisEdges·axisFaces, 끌어온 축 — track, 잠근 선 — lockEdges·lockFaces,
   * 끌어온 점 안내 선 — trackDirs { meets })이 꺾은선 토막(현)이나 그물 칸을 얕게 가로지르는 코어 교차 X가 커서에서 붙잡기 거리 안이라 그 교차를 골랐는데,
   * 앱 refine('axisEdge')·refineFace('axisFace')가 준 같은 교차의 정확한 자리 Q가 커서에서 붙잡기 거리 밖이면(0.37.0·0.38.0 넓힌 받기에서 빠지는 자리 — 커서가 X 쪽)
   * 표식·결과를 Q로 옮긴다(refined). 같은 교차라는 판정은 넓힌 받기와 같은 조각 자리 규칙(그 선 위로 내린 자리가 그 토막 곡선 조각·그 칸 위 곡면 조각 자리)이고,
   * Q는 X에서 세계 거리로 그 토막 길이·칸 크기 안, 화면 거리로 EXACT_SNAP_SCALE(3) × 붙잡기 거리 안이어야 한다. 가림·단면은 넓힌 받기와 같다.
   * 앱 호출·기억 열쇠·후보 차례(X의 커서 거리로 견준다)·값의 꼴은 그대로다(이미 부르던 닫힌 답을 받는 규칙만 넓힌다). 주지 않거나 false면 0.38.0과 같다
   */
  refineSnapToExact?: boolean;
  /**
   * 0.40.0(기본 켜짐 — refine이 있을 때만, false면 0.39.0과 결과·앱 호출 수가 같다): 아주 가까이 확대해 처짐이 화면에서 붙잡기 거리보다 커진 꺾은선 토막의 교차(0.35.0 남은 한계).
   * 선(첫 점 축 — inference.axisEdges, 끌어온 축 — track, 끌어온 점 안내 선 — trackDirs { meets: { open } }, 잠근 선 — lockEdges) 가운데 화면에서 커서 붙잡기 거리 안을
   * 지나는 것만 보고, 토막의 활꼴 띠(현에서 활꼴 높이 어림 안 — 배열에서 앞·뒤로 이어진 토막과 꺾인 각으로 어림, 0.1 × 토막 길이를 넘지 않고 곧은 토막은 0)가
   * 화면에서 커서 붙잡기 거리 안에 닿는 토막을 LENS_SEGMENTS(24)개까지 모아 (1) 현이 커서에서 붙잡기 거리 밖인 토막의 열린 교차, (2) 선이 현을 가로지르는 자리가
   * 커서에서 붙잡기 거리 밖인 교차(가로지르는 자리를 힌트로)를 앱 refine에 'axisEdge'·open = true로 묻는다.
   * 받는 규칙·기억 열쇠·값은 0.23.0 열린 교차와 같다(받는 점은 그 선 위·그 토막 곡선 조각 자리·커서에서 붙잡기 거리 안). 호출은 앞의 열린 후보들이 쓰고 남은 한도로 하고
   * (미리 보기 한 번 OPEN_REFINE_CALLS — 넘지 않는다), 다른 점 후보보다 뒤 차례다(1화소 넘게 가까워야 이긴다)
   */
  openEdgeLens?: boolean;
}

/** 측정 중 커서 아래 붙잡을 점(Viewer3d.measureHoverSnap) */
export interface MeasureHoverSnap {
  point: V3;
  /** 붙잡은 종류(붙잡지 않았으면 null) */
  snap: SnapKind | null;
  /** 축 붙잡기(snap === 'axis')면 그 축 */
  axis?: SnapAxis;
  /** 0.10.0: 방향 추론(축·나란함·수직)이면 첫 점을 지나는 그 선의 단위 방향 — 앱이 "Shift로 잠그기" 안내를 보일 때 */
  direction?: V3;
  /** 0.10.0: 추론 잠금 중(잠근 선 위의 점)이면 true */
  locked?: boolean;
  /** 0.10.0: 나란함의 기준 선분·수직 발의 선분(세계 끝점 둘) */
  edge?: [V3, V3];
  /** 0.10.0: 잠금 중 커서 아래 붙잡은 점(꼭짓점 등)을 잠근 선에 수직으로 내려 찍을 때 그 점과 종류 */
  from?: V3;
  fromSnap?: SnapKind;
  /** 0.14.0: 앱이 다듬은 점(MeasureSnapOptions.refine이 돌려준 점을 받았다)이면 true */
  refined?: boolean;
  /**
   * 0.16.0: 그 점이 놓인 선분의 식별자(SnapSegment — 0.14.0 다듬기 입력과 같은 꼴, 복사본). 끝점(꺾은선 꼭짓점이면 고르기가 고른 쪽 하나)·가운데 점·
   * 붙잡지 않은 선분·윤곽선 위 점·수직 발·교차점(첫째 선분)과 그 다듬은 점에만 있다. 그물 꼭짓점·면 위 점·점 묶음의 점·앱 점·축·나란함·잠근 선 위 점에는 없다.
   * 0.17.0: 끌어온 축이 선분·윤곽선과 만나는 점(snap 'axis'·trackFrom)에는 그 선분이 실린다.
   * 0.18.0: 첫 점 축이 선분·윤곽선과 만나는 점(snap 'axis'·direction, trackFrom 없음 — inference.axisEdges)에도 그 선분이 실린다
   */
  segment?: SnapSegment;
  /** 0.16.0: 교차점이면 둘째 선분(복사본) */
  other?: SnapSegment;
  /**
   * 0.16.0: 끌어온 축(inference.track)이면 그 축을 끌어온 점 P(복사본) — 점선은 P에서 이 점까지.
   * 0.21.0: 잠근 축 위에서 끌어온 점과 나란한 자리(inference.lockTracks — locked와 함께, P의 축과 만나지 않을 때)에도 그 점 P가 실린다.
   * 0.27.0: 끌어온 점에서 기준 선분과 나란함·수직인 선 위 점(inference.trackDirs — snap 'parallel'·'perpendicular', locked 없음)에도 그 점 P가 실리고 edge는 기준 선분이다.
   * 0.29.0: 그 선이 다른 것과 만나는 점(trackDirs { meets })도 같고, 만난 것이 더해진다 — 첫 점 축이면 axis·direction(그 축 방향 — Shift가 그 축에 잠근다),
   * 첫 점의 나란함이면 direction(그 나란함 방향), 다른 끌어온 점의 축이면 trackOther, 선분·윤곽선이면 segment, 그물 면이면 face
   */
  trackFrom?: V3;
  /**
   * 0.17.0: 끌어온 축끼리의 교차면 이 점에서 만나는 둘째 끌어온 축(끌어온 점 Q와 그 축 — 복사본). 첫째는 trackFrom과 axis다.
   * 끌어온 축이 선분·윤곽선과 만나는 점은 이 필드 없이 trackFrom·axis와 segment(그 선분)가 실린다.
   * 0.21.0: 잠근 선이 끌어온 축과 만나는 점(inference.lockTracks — locked와 함께, trackFrom 없음)이면 그 끌어온 축이다. 첫째 선은 첫 점을 지나는 잠근 선이다
   */
  trackOther?: TrackGuide;
  /**
   * 0.18.0: 축(첫 점 축·끌어온 축)이 커서 아래 보이는 그물 면을 뚫는 점(inference.axisFaces)이면 그 면(그물 id·삼각형 번호·세계 단위 법선 — 복사본).
   * snap 'axis'·axis와 함께, 첫 점 축이면 direction, 끌어온 축이면 trackFrom이 실린다.
   * 0.22.0: 면의 열린 교차(축이 삼각형을 비켜 가며 곡면만 뚫는 자리 — refineFace가 준 점, refined)면 그 곡면 조각 아래 삼각형이다
   */
  face?: SnapFace;
  /**
   * 0.30.0: 두 끌어온 점의 나란함·수직 선끼리 만나는 점(inference.trackDirs { meets: { guides: true } })이면 둘째 끌어온 점의 선(그 점·안내 종류·단위 방향 — 복사본).
   * 첫째 선은 trackFrom(끌어온 점)과 snap(안내 종류)이고 edge는 둘 모두의 기준 선분이다. direction은 없다(첫 점을 지나는 선이 아니다 — 잠그지 않는다)
   */
  trackGuide?: TrackDirLine;
}

/** 추론 잠금 상태(0.10.0, Viewer3d.measureInferenceLock). source = 'shift'(Shift를 누르고 있는 동안) 또는 'api'(setMeasureInferenceLock) */
export type MeasureInferenceLock = InferenceLock & { source: 'shift' | 'api' };

/**
 * 찍은 측정 점(0.12.0, Viewer3d.measurePoints): 세계 좌표와 붙잡은 종류(붙잡지 않았으면 null — 붙잡기 선택이 없으면 0.7.2 규칙의 꼭짓점·끝점),
 * 축 붙잡기면 그 축, 방향 추론(축·나란함·수직)이면 첫 점을 지나는 그 선의 단위 방향, 추론 잠금으로 찍었으면 locked
 */
export interface MeasurePoint {
  point: V3;
  snap: SnapKind | null;
  axis?: SnapAxis;
  direction?: V3;
  locked?: boolean;
  /** 0.14.0: 앱이 다듬은 점(MeasureSnapOptions.refine)으로 찍었으면 true */
  refined?: boolean;
  /** 0.16.0: 그 점이 놓인 선분의 식별자(복사본 — MeasureHoverSnap.segment와 같은 규칙). 붙잡기 선택(setMeasureSnap)이 있을 때만 */
  segment?: SnapSegment;
  /** 0.16.0: 교차점이면 둘째 선분(복사본) */
  other?: SnapSegment;
  /** 0.16.0: 끌어온 축(inference.track)으로 찍었으면 그 축을 끌어온 점(복사본). 0.27.0: 끌어온 점의 나란함·수직(inference.trackDirs)으로 찍었어도 그 점 */
  trackFrom?: V3;
  /** 0.17.0: 끌어온 축끼리의 교차로 찍었으면 둘째 끌어온 축(복사본 — MeasureHoverSnap.trackOther와 같은 규칙) */
  trackOther?: TrackGuide;
  /** 0.18.0: 축과 면의 교차로 찍었으면 그 면(복사본 — MeasureHoverSnap.face와 같은 규칙) */
  face?: SnapFace;
  /** 0.30.0: 두 끌어온 점의 안내 선끼리 만나는 점으로 찍었으면 둘째 끌어온 점의 선(복사본 — MeasureHoverSnap.trackGuide와 같은 규칙) */
  trackGuide?: TrackDirLine;
}

/**
 * 키보드로 3D 붙잡기·고르기 선택(0.46.0, Viewer3d.setKeyboardSnap — 기본 꺼짐). 3D 보기(캔버스)에 초점이 있을 때 키로 가상 커서를 옮기고
 * 그 자리의 측정 붙잡기 후보를 차례로 돌려 고르고 찍는다(측정 모드가 아니면 그 자리를 고른다 — onPick)
 */
export interface KeyboardSnapOptions {
  /** 화살표 한 번에 가상 커서가 움직이는 CSS 화소(기본 KEY_STEP_PX 5) */
  step?: number;
  /** Shift+화살표 한 번(기본 KEY_BIG_STEP_PX 50) */
  bigStep?: number;
  /**
   * 키 바꾸기: 할 일 → KeyboardEvent.key 목록(앞에 'Shift+'·'Alt+'·'Ctrl+'·'Meta+'). 준 할 일만 기본(KEY_SNAP_KEYS)을 바꾸고, 빈 목록·null이면 그 할 일을 끈다.
   * 옮기기·찍기는 Shift를 적지 않아도 Shift와 함께 받는다(옮기기는 bigStep, 찍기는 고르기 알림 shiftKey)
   */
  keys?: Partial<Record<KeySnapAction, readonly string[] | null>>;
  /** 화면 읽기 프로그램에 읽힐 알림(앱이 text를 aria-live 영역에 넣거나 값으로 제 글을 만든다). 키를 받을 때마다 부른다 */
  announce?: (a: KeyboardSnapAnnouncement) => void;
  /**
   * 0.47.0 고르기 모드의 후보 돌리기(기본 켬 — true와 같다): 커서가 켜진 고르기 모드(측정 모드가 아닐 때)에서도 Tab·Shift+Tab으로 커서 자리에 겹친 것
   * (pickCandidates 차례 — 점·선분·윤곽선·그물 면, 앞 면 뒤의 것)을 돌리고 Enter로 그것을 고른다(onPick — PickEvent.cycle).
   * 객체면 후보를 고를 선택(edges·meshesOnly·throughTranslucent — 앱의 onPick 선택과 맞춘다). false면 0.46.0처럼 고르기 모드의 Tab은 브라우저 초점 이동 그대로다
   */
  pickCycle?: boolean | KeyPickCycleOptions;
  /**
   * 0.47.0 알림 글 틀: 열쇠 → 틀 글({0}·{1} 자리 — KEY_SNAP_MESSAGES의 열쇠와 자리 뜻). 준 열쇠만 바꾸고 나머지는 기본(한국어 — 0.46.0 글과 같다).
   * 앱 다국어 사전의 같은 열쇠 틀을 그대로 넣는다(알림 값은 그대로 — 값으로 제 글을 만들어도 된다).
   * 0.53.0: 글 함수 (key, values) => string 도 받는다(values = 그 열쇠 틀의 {0}·{1}… 자리 값 차례 — 앱 번역 함수로 잇는다. 글이 아니면 그 열쇠의 기본 틀)
   */
  messages?: Partial<Record<KeySnapMessageKey, string>> | KeySnapMessageFn;
  /**
   * 0.54.0 고른 것 이름 함수(SKP 56차 요청): 알림 글의 고른 것 이름(틀 pickItem의 {0} — 기본은 묶음 이름, 없으면 id)을 앱 이름(그룹·컴포넌트 경로, B-rep 면 이름 등)으로.
   * 고르기 모드 후보 글·'commit'의 picked 글에 쓴다. 글이 아니거나 빈 글·예외면 기본 이름
   */
  pickName?: ((p: Pick3d) => string | null | undefined) | null;
}

/**
 * 키보드 고르기 후보 돌리기 선택(0.47.0 KeyboardSnapOptions.pickCycle — pickCandidates·pick 선택과 같은 뜻, 포인터 종류는 'keyboard').
 * 0.53.0 group: 앱 묶음 열쇠 — 같은 묶음은 한 후보로 돌리고 후보 한도(16)·알림 count·onPick cycle을 묶음 수로 센다(NC 56·STEP 62차 요청).
 * 0.54.0 facePreview: 지금 후보가 그물 면이면 그 면을 화면 덧그림에 강조한다(setPickPreview와 같은 표식 — 기본 끔: 0.53.0처럼 커서만, SKP 56·57차 요청).
 * faceRanges: 그 면으로 강조할 삼각형 구간(앱이 아는 면 — PickPreviewOptions.ranges와 같은 뜻, undefined·null이면 맞은 삼각형과 같은 평면으로 이어진 삼각형)
 */
export type KeyPickCycleOptions = Omit<PickOptions, 'pointerType'> & {
  group?: PickGroupKey | null;
  facePreview?: boolean;
  faceRanges?: ((p: Pick3d) => readonly IndexRange[] | null | undefined) | null;
};

/**
 * 0.54.0 고르기 후보 미리 강조 선택(Viewer3d.setPickPreview): ranges = 그물 면 후보를 강조할 삼각형 구간(그 그물 삼각형 번호 { start, count } — setHiddenRanges와 같은 꼴,
 * 앱이 아는 면). 주지 않으면 맞은 삼각형과 같은 평면에서 변을 맞대고 이어진 삼각형(PICK_PREVIEW_MAX_TRIS개까지)
 */
export interface PickPreviewOptions {
  ranges?: readonly IndexRange[] | null;
}

/** 키보드 붙잡기 알림(0.46.0) */
export interface KeyboardSnapAnnouncement {
  /**
   * 'start' 가상 커서를 켰다 · 'move' 옮겼다 · 'cycle' 후보를 돌렸다 · 'commit' 찍었다(고르기) · 'end' 껐다 ·
   * 'refresh' 커서는 그대로인데 후보가 다시 정해졌다(Shift·setMeasureInferenceLock 잠금, 붙잡기 한도 등 — 마우스 미리 보기를 다시 구하는 때와 같다)
   */
  reason: 'start' | 'move' | 'cycle' | 'commit' | 'end' | 'refresh';
  /** 'measure' = 측정 점 붙잡기(측정 모드), 'pick' = 고르기 */
  mode: 'measure' | 'pick';
  /** 가상 커서 자리(캔버스 왼쪽 위 기준 CSS 화소). 'end'면 끈 자리 */
  x: number;
  y: number;
  /** 지금 후보(measureHoverSnap과 같은 꼴 — 측정 모드에서 후보가 없거나 고르기 모드면 null) */
  snap: MeasureHoverSnap | null;
  /**
   * 지금 후보 차례(0부터)와 후보 수(측정 모드 — 후보가 없으면 0·0). 0.47.0: 고르기 모드에서는 pickCycle이면 겹친 고르기 후보의 차례와 수
   * (pickCycle false면 0.46.0처럼 0·0)
   */
  index: number;
  count: number;
  /** 고르기 모드에서 커서 아래 고른 것(0.47.0 pickCycle이면 지금 차례의 후보, 없으면 null — 측정 모드는 늘 null) */
  pick: Pick3d | null;
  /** 'commit'(측정): 찍은 점(measurePoints의 마지막 것), 두 점째면 측정 결과도 */
  point?: MeasurePoint;
  measurement?: MeasureResult;
  /** 코어 기본 한국어 글(앱이 다른 말로 읽게 하려면 위 값으로 만들거나 0.47.0 KeyboardSnapOptions.messages로 틀을 준다) */
  text: string;
}

/** 가상 커서 상태(0.46.0, Viewer3d.keyboardCursor) */
export interface KeyboardCursorState {
  x: number;
  y: number;
  mode: 'measure' | 'pick';
  index: number;
  count: number;
}

/** 측정 후보 목록 선택(0.46.0, Viewer3d.measureCandidates·commitMeasureCandidate) */
export interface MeasureCandidatesOptions {
  /** 후보 수 한도(기본 KEY_CANDIDATES_MAX 16) */
  max?: number;
  /** 허용 거리를 정할 포인터 종류(기본 'mouse' — 'touch'면 손가락 거리) */
  pointerType?: string;
}

/** 측정 거리 글상자의 화면 자리(0.12.0, Viewer3d.measureLabelRect): 캔버스 왼쪽 위 기준 CSS 화소 */
export type { MeasureLabelRect, LabelSpotName, LabelFallback };

/**
 * 측정 거리 글상자가 비켜 그릴 자리(0.13.0, Viewer3d.setMeasureLabelAvoid). 화면 덧그림에만 쓴다(그림 저장 toBlob·renderImage는 기본 자리 —
 * 0.33.0 snapshotPoints를 켜면 측정 점 표식만 비킨다)
 */
export interface MeasureLabelAvoid {
  /** 피할 화면 영역(캔버스 왼쪽 위 기준 CSS 화소 — 앱이 그린 십자선·손가락·툴팁 자리). 수가 아니거나 너비·높이가 0 이하인 것은 버린다 */
  rects?: readonly MeasureLabelRect[];
  /** 측정 커서(코어가 미리 보기를 구한 포인터 자리) 둘레에서 피할 반지름(CSS 화소). 미리 보기가 있을 때만 본다. 0·없으면 커서를 보지 않는다 */
  pointerRadius?: number;
  /**
   * 0.31.0: true면 두 측정 점 표식(첫 점·미리 보기 점 또는 두 점째 — 반지름 LABEL_POINT_R 6)을 덮는 자리도 옮긴다(기본 꺼짐 — true일 때만).
   * 0.30.0까지 표식은 글상자를 옮길 때만 될 수 있으면 비켰다 — 기본 자리(두 점 화면 가운데의 오른쪽 위)가 첫 점 표식을 덮어도 그대로였다
   * (첫 점이 가운데에서 오른쪽 위 8~48화소에 있을 때, 휴대폰처럼 글상자가 화면 폭의 절반을 넘으면 캔버스 안으로 당겨져 더 자주).
   * 켜면 고른 자리가 표식을 덮을 때 표식도 피할 원으로 보고 같은 차례로 다시 고른다(순수 LabelAvoidAreas.softBlocks — 그런 자리가 없으면 0.30.0 자리).
   * rects·pointerRadius 없이 이것만 줘도 된다. 측정 거리 글상자에만 쓴다(앱 측정 덧그림 글상자는 0.30.0 그대로)
   */
  points?: boolean;
  /**
   * 0.33.0: points와 함께 true면 그림 저장(toBlob·renderImage)의 측정 거리 글상자도 두 측정 점 표식을 덮는 자리를 옮긴다(기본 꺼짐 — 둘 다 true일 때만).
   * 규칙은 points와 같고(기본 자리 setMeasureLabelSpot부터, 표식을 덮으면 표식을 피할 원으로 보고 같은 차례로 다시 고른다), 그림에 없는 앱 영역(rects)·커서 둘레(pointerRadius)와
   * 화면 덧그림 글상자끼리 비키기(0.24.0)는 보지 않는다 — 그것들이 화면 글상자를 옮기지 않았으면 화면 글상자와 같은 자리다. 끄면 0.32.0처럼 그림 저장은 기본 자리다
   */
  snapshotPoints?: boolean;
}

/**
 * 뷰어 글상자의 기본 자리(0.27.0, Viewer3d.setMeasureLabelSpot): 순수 placeMeasureLabel·placeLabelAmong의 first와 같은 뜻의 이름 자리
 * (기준점을 따라 움직이므로 앱 자리 { x, y }는 받지 않는다). 없는 필드는 기준점 오른쪽 위(0.26.0과 같다)
 */
export interface MeasureLabelSpot {
  /** 측정 거리 글상자(기준점 = 두 점 화면 가운데) */
  measure?: LabelSpotName;
  /** 앱 측정 덧그림(setAnnotations) 글상자(기준점 = 덧그림의 글자 상자 자리) */
  annotations?: LabelSpotName;
  /**
   * 0.29.0: 기본 자리가 막혔을 때 고르는 차례(순수 placeMeasureLabel·placeLabelAmong의 0.28.0 fallback과 같은 규칙 — 준 기본 자리 둘 모두에).
   * 'first'(없을 때와 같다 — 0.27.0 차례: 기본 자리부터 이어서), 'topRight'(막히면 기본 자리를 주지 않은 고르기, 곧 0.26.0 오른쪽 위부터의 자리 — 그것도 막혔으면 기본 자리)
   */
  fallback?: LabelFallback;
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

/**
 * 측정 글 꼴(Viewer3dOptions.formatMeasure·setMeasureFormat): 받은 값으로 글 줄들을 만든다.
 * 0.31.0: 둘째 인자로 코어 기본 꼴(MeasureFormatCore — 기본 줄·수 꼴·자릿수·단위 글)을 받는다. 한 인자 함수는 그대로 된다(받은 것을 보지 않을 뿐)
 */
export type MeasureFormat = (m: MeasureResult & { units: Scene3d['units'] }, core: MeasureFormatCore) => string[];

/**
 * 측정 글 꼴의 둘째 인자(0.31.0): 글 꼴을 주지 않았을 때 코어가 그 글상자에 그릴 것. 앱이 이름표만 옮기고(번역) 수·자릿수·"-0" 처리·단위 글은
 * 코어와 같게 쓸 수 있다 — 코어 규칙을 앱이 다시 세지 않는다. 그릴 때마다 새로 만든다(앱이 고쳐도 된다)
 */
export interface MeasureFormatCore {
  /**
   * 코어 기본 글 줄(글 꼴이 없을 때와 글자까지 같다): 내장 두 점 측정은 ["거리 12.345 mm", "ΔX 1.000  ΔY -2.000  ΔZ 0.000"](단위를 모르면 단위 없이),
   * 글(label)을 주지 않은 거리 덧그림은 ["12.345 mm"]
   */
  lines: string[];
  /** 코어 수 꼴: 소수 digits자리(toFixed — 언어와 상관없이 소수점), 반올림해 "-0.000"이 되면 "0.000"(순수 opencad-viewer3d/annotate measureNumber) */
  num: (v: number) => string;
  /**
   * 소수 자릿수: 장면 범위(Scene3d.bounds, 없으면 그물·선분·점 범위 — setMesh로 바꾸면 바뀐 범위) 대각선 d에서 max(0, min(6, 5 − ⌊log10 d⌋))
   * (순수 opencad-viewer3d/annotate measureDigits — 크기 0인 범위는 5자리, 빈 장면은 0자리)
   */
  digits: number;
  /** 단위 글: 장면 단위 'mm' → "mm", 'inch' → "in", 'm' → "m", 모르면 "" */
  unit: string;
  /** 어느 글상자인지: 'measure' = 내장 두 점 측정(미리 보기·찍은 결과), 'annotation' = 글을 주지 않은 거리 덧그림(setAnnotations) */
  source: 'measure' | 'annotation';
}

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

/**
 * Viewer3d.project 선택: occlusion = 음영 모드에서 불투명 면에 가렸는지도 따진다.
 * 0.45.0 id = 그 점이 놓인 묶음(주면 그 묶음을 자르는 평면으로 잘림을 판정 — setSections items로 범위를 정한 평면도. 없는 id면 주지 않은 것과 같다),
 * raw = 그 묶음의 기본 도형 번호(SnapPoint.raw와 같은 뜻 — 주면 그 도형이 든 구간 단면의 평면도), edges = raw가 그물 윤곽선 번호인지.
 * 숨김(setGroupVisible·setHiddenRanges)은 보지 않는다(0.44.0과 같다)
 */
export interface ProjectOptions {
  occlusion?: boolean;
  id?: string;
  raw?: number;
  edges?: boolean;
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
  /** 0.24.0: 반투명 그물 너머 고르기(throughTranslucent)가 이 그물 면에서 멈춘다(setItemPickOpaque — 켰을 때만 true) */
  pickOpaque?: boolean;
  /** 0.27.0: 반투명 그물 너머 고르기가 지나가는 이 그물의 삼각형 구간(setItemPickThrough — 합친 것, 복사본. 줬을 때만) */
  pickThrough?: IndexRange[];
}

/**
 * 0.33.0 묶음 겉모습 한 번에(Viewer3d.setItemLooks)의 한 묶음 몫: 준 필드만 바꾸고(undefined·없는 필드는 그대로) null은 그 겉모습 되돌림 —
 * 하나씩 부르는 함수와 같은 값을 받는다. opacity = setItemOpacity(pickable은 opacity가 수일 때 그 opts.pickable — null이면 함께 되돌린다),
 * color = setItemColor, matrix = setItemMatrix, edgeColor = setItemEdgeColor, profileColor = setItemProfileColor, pickOpaque = setItemPickOpaque,
 * pickThrough = setItemPickThrough
 */
export interface ItemLookInput {
  opacity?: number | null;
  pickable?: boolean;
  color?: Rgba | string | null;
  matrix?: ArrayLike<number> | null;
  edgeColor?: Rgba | string | null;
  profileColor?: Rgba | string | null;
  pickOpaque?: boolean;
  pickThrough?: readonly IndexRange[] | null;
}

interface LookState {
  alpha?: number;
  pickable?: boolean;
  color?: Rgba;
  matrix?: Float64Array;
  edgeColor?: Rgba;
  profileColor?: Rgba;
  pickOpaque?: boolean;
  /** 0.27.0 setItemPickThrough: 합친 삼각형 구간(그물 삼각형 수 안)과 그 판정 */
  pickThrough?: IndexRange[];
  pickThroughTest?: (i: number) => boolean;
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
  /**
   * 0.20.0: 그물 면만 고른다(선분·점 묶음과 그물 윤곽선은 고르지도 않고 면을 가리지도 않는다 — edges는 무시한다). 면 위에 그린 선분·점 아래의 면을 알고 싶을 때.
   * 단면 보기에서 잘린 면(채운 면)은 그물 면처럼 고른다(section). 숨긴 묶음·숨긴 구간·고르지 않는 묶음(pickable false)·단면에 잘린 쪽은 다른 고르기와 같이 뺀다
   */
  meshesOnly?: boolean;
  /**
   * 0.23.0: 반투명 그물(투명도 < 1 — 그물 색 알파·setItemOpacity·setItemColor)의 면을 지나 고른다. 광선이 그 뒤에서 불투명 그물 면(단면의 잘린 면 채움 포함)을 맞으면
   * 가장 앞의 불투명 면을, 반투명 면만 맞으면 예전처럼 가장 앞의 반투명 면을 고른다. 선분·점·윤곽선 고르기와 가림은 그대로다(반투명 면은 원래 선분·점을 가리지 않는다).
   * meshesOnly와 함께 줄 수 있다. 주지 않거나 false면 0.22.0 그대로.
   * 0.24.0: setItemPickOpaque로 켠 그물은 반투명이어도 지나가지 않고 그 면에서 멈춘다
   */
  throughTranslucent?: boolean;
}

/**
 * 0.53.0 고르기 후보 묶음 열쇠(pickCandidates·키보드 pickCycle의 group): 고른 것(사본) → 앱 묶음 열쇠(공구 경로의 코드 줄·판재 가공 단위, STEP의 B-rep 면 등).
 * 열쇠가 같은 후보는 하나로 센다(가장 앞의 것). 문자열·유한한 수가 아니면(null·undefined 등) 그 후보는 묶지 않는다. 던지면 묶지 않는다
 */
export type PickGroupKey = (pick: Pick3d) => string | number | null | undefined;

/** Viewer3d.pickCandidates 선택(0.47.0): pick 선택과 후보 수 한도(기본 16 — 0.53.0 group을 주면 묶음 수) */
export interface PickCandidatesOptions extends PickOptions {
  max?: number;
  /** 0.53.0 앱 묶음 열쇠(같은 묶음은 한 후보 — 주지 않으면 0.47.0 그대로 기본 도형마다) */
  group?: PickGroupKey | null;
}

/** 고르기 복사본(점·법선 배열도 새로 — 앱이 고쳐도 뷰어 기억이 바뀌지 않게) */
function copyPick(p: Pick3d): Pick3d {
  const r: Pick3d = { ...p, point: [...p.point] as V3 };
  if (p.normal) r.normal = [...p.normal] as V3;
  return r;
}

/** onPick 둘째 인자(0.22.0) */
export interface OnPickOptions {
  /**
   * 그 알림에는 누른 자리의 그물 면만 고른 결과를 준다(PickOptions.meshesOnly와 같은 고르기 — 포인터 종류는 그 누르기의 것, 윤곽선 선택은 무시).
   * 그물 면이 없으면 null. 주지 않거나 false면 0.21.0 그대로(선분·점·윤곽선이 먼저)
   */
  meshesOnly?: boolean;
  /** 0.23.0: 그 알림에는 반투명 그물의 면을 지나 고른 결과를 준다(PickOptions.throughTranslucent와 같은 고르기 — meshesOnly와 함께 줄 수 있다) */
  throughTranslucent?: boolean;
  /**
   * 0.26.0: 그 알림의 사건에 같은 누르기의 가장 앞 고르기(PickEvent.front — 이 알림의 고르기에서 throughTranslucent만 뺀 것)를 함께 준다.
   * 판 너머 고르기와 가장 앞 고르기를 한 알림에서 받을 때 쓴다(알림 둘을 달아 사건 객체로 짝짓지 않아도 된다). 이 알림의 사건은 이 알림만의 사본이다
   * (front 없이 단 다른 알림들의 사건과 같은 객체가 아니다). 주지 않으면 0.25.0 그대로(사건에 front가 없다)
   */
  front?: boolean;
}

/**
 * 0.32.0 앱이 포인터를 맡을지 묻는 물음(setPointerClaim 처리기의 claim 인자). 좌표는 캔버스 기준 CSS 화소(pick과 같다).
 * 'down' = 누른 순간(코어가 그 누르기를 아직 아무것도 하지 않았다), 'drag' = 'down'에서 맡지 않은 마우스·펜·한 손가락이 끌기 시작 거리
 * (dragStartPx — 마우스·펜 4, 손가락 10화소)를 넘은 순간(코어가 궤도·이동을 시작하기 바로 전 — 두 손가락 몸짓 중에는 묻지 않는다)
 */
export interface PointerClaimQuery {
  phase: 'down' | 'drag';
  pointerId: number;
  /** 'mouse'·'touch'·'pen'(빈 값은 'mouse' — PickEvent와 같다) */
  pointerType: string;
  /** 누른 단추(0 왼쪽·1 가운데·2 오른쪽 — 손가락·펜은 0). 'drag'에서도 누를 때의 단추 */
  button: number;
  /** 누른 자리 */
  x: number;
  y: number;
  /** 지금 자리('down'이면 누른 자리, 'drag'면 끌기 시작 거리를 넘은 자리) */
  at: { x: number; y: number };
  /** 지금 캔버스를 누르고 있는 포인터 수(이 포인터 포함 — 코어가 다루는 것과 앱이 맡은 것 모두) */
  pointers: number;
  /** 앱이 이미 맡은 포인터 수(이 포인터 빼고) */
  held: number;
  /** 누른 자리의 고르기 — pick(x, y, { ...opts, pointerType })와 같다(부를 때만 구한다 — 처음 고르면 그 묶음 BVH를 만든다) */
  pick(opts?: Omit<PickOptions, 'pointerType'>): Pick3d | null;
  /** 그 사건('down'은 pointerdown, 'drag'는 끌기 시작 거리를 넘은 pointermove) */
  event: PointerEvent;
}

/** 0.32.0 앱이 맡은 포인터(move·end 알림). 좌표는 캔버스 기준 CSS 화소 */
export interface HeldPointer {
  pointerId: number;
  pointerType: string;
  /** 누른 자리 */
  sx: number;
  sy: number;
  /** 지금 자리(end는 뗀 자리 — 'pinch'·'off'면 마지막으로 본 자리) */
  x: number;
  y: number;
  /** 그 사건(pointermove·pointerup·pointercancel — 'pinch'·'off'면 없다) */
  event?: PointerEvent;
}

/** 0.32.0 맡은 포인터가 끝난 까닭: 뗌, 취소(pointercancel), 코어가 두 손가락 몸짓으로 돌려받음, 처리기를 바꾸거나 껐음 */
export type PointerHoldEnd = 'up' | 'cancel' | 'pinch' | 'off';

/** 0.32.0 맡은 포인터 알림(claimPointer 둘째 인자, setPointerClaim 처리기) */
export interface PointerHoldHandler {
  /** 맡은 포인터가 움직일 때마다(맡은 그 사건에는 부르지 않는다 — 그 자리는 물음의 at) */
  move?(p: HeldPointer): void;
  /** 맡은 포인터가 끝났을 때 한 번 */
  end?(p: HeldPointer, reason: PointerHoldEnd): void;
}

/** 0.32.0 setPointerClaim 처리기: claim이 true를 돌려주면 그 포인터를 앱이 맡는다 */
export interface PointerClaimHandler extends PointerHoldHandler {
  claim(q: PointerClaimQuery): boolean;
}

/** 측정 덧그림 전체 선택(setAnnotations 두 번째 인자) */
export interface AnnotationOptions {
  /**
   * 가려진 부분(선·점)의 불투명도 0~1(기본 0.35, 0이면 가려진 부분은 글자 상자까지 그리지 않는다).
   * 0.47.0: 가려진 글자 상자는 이 값으로 흐리게 하지 않고 바탕·글을 보이는 글상자처럼 불투명하게 그린 뒤 테두리를 점선으로 그린다(글 대비 4.5:1 — WCAG 1.4.3).
   * 1이면 가려진 것도 보이는 것과 같다(실선). 0.46.0까지는 글자 상자를 불투명도 max(이 값, 0.5)로 그렸다
   */
  hidden?: number;
  /** 선 굵기(화면 화소, 기본 2) */
  width?: number;
}

/**
 * 뷰어 통계(stats). 0.28.0 buffers: GPU 버퍼 바이트(bufferData로 잡은 크기, 살아 있는 버퍼만) — 성분별(위치·법선·정점 색·무늬 좌표·뒷면 무늬 좌표·색인·윤곽선·
 * 선분 위치·선분 색·점·와이어프레임 색인·구간 모음·덧그림)과 합(bytes)·버퍼 수(count). 같은 배열은 처음 올린 성분으로 한 번만 센다(GpuBufferStats).
 * 0.42.0 instanced: 지난 그리기에서 같은 그물 자리를 모아 그린(인스턴싱) 그리기 호출 수(draws — drawCalls에 든다, 외곽선 깊이 그림은 drawCalls처럼 빼고)·
 * 그렇게 그린 자리 수(items — 면·선 차례마다 센다)·번역을 기다리는 인스턴싱 변종 수(pending — 0이 아니면 그동안 그물마다 그리고 다 되면 다시 그린다)
 * 0.52.0 merged(묶어 그리기 — setRenderOptions({ merging })): 이 장면에서 켜졌는지(active — 'auto'면 묶을 수 있는 그물이 문턱 이상일 때), 지난 그리기에서 묶음 구간으로 그린
 * 그리기 호출 수(draws — drawCalls에 든다)·그렇게 그린 그물 수(items — 면·선 차례마다), 구운 묶음 수(groups)·묶음에 든 그물 수(meshes — 그 그물은 그물마다 버퍼가 없다)·
 * 묶음 버퍼 바이트(bytes — buffers에도 든다)·굽기를 기다리는 묶음 수(pending)·지금 장면에서 굽기에 쓴 벽시계 ms 합(bakeMs)
 */
export type Viewer3dStats = RenderStats & {
  frameMs: number;
  width: number;
  height: number;
  dpr: number;
  textures: TextureStats;
  buffers: GpuBufferStats;
  instanced: { draws: number; items: number; pending: number };
  merged: { active: boolean; draws: number; items: number; groups: number; meshes: number; bytes: number; pending: number; bakeMs: number };
};

/** Viewer3d.setMesh 선택(0.11.0) */
export interface SetMeshOptions {
  /**
   * 바뀐 정점 구간(정점 번호 { start, count }, 하나 또는 목록). 주면 정점 속성 배열(positions·normals·colors·uvs·backUvs)은 이 구간 밖이 앞 그물과 같다고 보고
   * 이 구간만 GPU에 올린다 — 앞 그물과 같은 배열 객체를 제자리에서 고쳤을 때(이때는 꼭 준다)와, 같은 크기 새 배열이 앞 버퍼를 물려받을 때.
   * 주지 않으면 앞 그물과 같은 배열 객체는 바뀌지 않았다고 보고 다시 올리지 않으며, 새 배열은 통째로 올린다
   */
  vertices?: IndexRange | readonly IndexRange[] | null;
  /**
   * 새로 올릴 배열이 8 MB(CHUNK_MIN_BYTES)를 넘으면 프레임마다 budgetMs(기본 8 ms)씩 4 MB 조각으로 새 버퍼에 채우고, 다 채울 때까지 앞 그물을 그린다.
   * 주지 않으면 한 번에 올린다
   */
  incremental?: boolean | { budgetMs?: number };
}

/**
 * setScene의 놓기 선택(0.25.0, release). 켠 것은 코어가 GPU에 올린 뒤 장면 객체에서 지우고(필드를 delete — 푼 그림은 close) 다시 읽지 않는다.
 * 앱은 그 배열·원본을 따로 쥐지 않으면 메모리가 놓인다. 그래픽 문맥을 잃었다 되찾으면 위치·색으로 먼저 그리고 onContextRestore로 다시 받는다
 */
export interface ReleaseOptions {
  /** 그물 법선(Mesh3d.normals) */
  normals?: boolean;
  /** 앞·뒷면 무늬 좌표(Mesh3d.uvs·backUvs) */
  uvs?: boolean;
  /**
   * 무늬 그림 원본(Texture3d.data·bitmap — 그물이 쓰는 무늬를 풀어 올린 뒤). 'bitmap'이면 푼 그림(bitmap)만 놓고 그림 바이트(data)는
   * 장면에 둔다 — 문맥을 되찾으면 코어가 data를 스스로 다시 풀어 올린다(알림의 need에 들지 않는다). data가 없는 무늬만 need로 다시 받는다.
   * 'bitmap'은 data가 bitmap과 같은 그림일 때만 쓴다(앱이 색을 바꾸는 등 손질한 bitmap이면 그 무늬의 data를 빼 두어 need로 받는다)
   */
  textures?: boolean | 'bitmap';
}

/**
 * 문맥 복구 때 다시 줄 것(0.25.0, onContextRestore·restoreNeed): 코어가 놓은 배열·원본 가운데 지금 GPU에 없는 것.
 * meshes = 그물마다 다시 줄 배열(normals, uvs — 뒷면이 uvs를 함께 썼으면 뒷면도, backUvs — 따로 준 뒷면 무늬 좌표), textures = 무늬 id
 */
export type ContextRestoreNeed = RestoreNeed;

/** 묶음 행렬(setItemMatrix·setItemMatrices): 앞 16개가 모두 유한한 수면 Float64Array 사본, 아니면 null */
function lookMatrix(matrix: ArrayLike<number>): Float64Array | null {
  if (!(matrix.length >= 16)) return null;
  const out = new Float64Array(16);
  for (let i = 0; i < 16; i++) {
    const v = matrix[i];
    if (!Number.isFinite(v)) return null;
    out[i] = v!;
  }
  return out;
}

/** 0.32.0 맡은 포인터 기록 → 앱에 넘길 값 */
const heldOf = (h: PointerHold<unknown>, event?: PointerEvent): HeldPointer => ({ pointerId: h.id, pointerType: h.type, sx: h.sx, sy: h.sy, x: h.x, y: h.y, ...(event ? { event } : {}) });

/** 두 상자의 여섯 값이 모두 같은지 */
const sameBox = (a: Box3, b: Box3): boolean =>
  a.min[0] === b.min[0] && a.min[1] === b.min[1] && a.min[2] === b.min[2] && a.max[0] === b.max[0] && a.max[1] === b.max[1] && a.max[2] === b.max[2];

type Item = { kind: 'mesh'; item: Mesh3d } | { kind: 'line'; item: LineSet3d } | { kind: 'point'; item: PointSet3d };
/**
 * 측정 점 고르기 결과(미리 보기·누르기): 찍을 점·붙잡았는지·종류, 0.9.0 축 붙잡기의 축,
 * 0.10.0 방향 추론의 단위 방향·잠갔는지·기준 선분·잠근 선으로 옮겨 온 점과 그 종류,
 * 0.12.0 점 붙잡기가 놓인 선분 직선이 첫 점을 지날 때 잠글 방향(lineLock — 결과·measureHoverSnap에는 싣지 않는다),
 * 0.14.0 앱이 다듬은 점이면 refined, 0.16.0 그 점이 놓인 선분 식별자(segment·교차점이면 other)와 끌어온 축의 끌어온 점(trackFrom),
 * 0.17.0 끌어온 축끼리의 교차면 둘째 끌어온 축(trackOther), 0.18.0 축과 면의 교차면 그 면(face)
 */
type MeasurePick = {
  p: V3;
  vertex: boolean;
  kind: SnapKind | null;
  axis?: SnapAxis;
  direction?: V3;
  locked?: boolean;
  edge?: [V3, V3];
  from?: V3;
  fromSnap?: SnapKind;
  lineLock?: InferenceLock;
  refined?: boolean;
  segment?: SnapSegment;
  other?: SnapSegment;
  trackFrom?: V3;
  trackOther?: TrackGuide;
  face?: SnapFace;
  trackGuide?: TrackDirLine;
};
/**
 * 0.46.0 후보 돌리기 한 번(measureAt의 다섯째 인자): skip = 앞 후보로 고른 점 붙잡기 자리(이 자리의 점 후보 — 고르기가 붙잡은 점·앱 점·추론 점 — 는 뺀다),
 * lines = 점 붙잡기가 없을 때 선 추론(축·나란함·끌어온 축·잠근 선 교차)을 보는지. src = 이번에 고른 점 붙잡기 자리(measureAt이 채운다 — 없으면 null)
 */
type KeyPass = { skip: readonly V3[]; lines: boolean; src: V3 | null };
/** 측정 붙잡기가 기억하는 기준 선분(0.10.0 나란함·0.27.0 끌어온 점·0.29.0 첫 점 나란함) — 후보마다 같은 앞 상태에서 구하려고 두었다가 되돌린다 */
type KeyRefs = { parallel: [V3, V3] | null; track: [V3, V3] | null; own: [V3, V3] | null };
/** 0.46.0 한 자리의 측정 후보 하나: 고른 결과, 그 결과를 낸 돌리기(skip·lines), 그 뒤의 기준 선분 상태 */
type KeyEntry = { pick: MeasurePick; skip: readonly V3[]; lines: boolean; after: KeyRefs };
/** 측정 점 고르기 결과 → 측정 결과에 실을 붙잡기(종류, 축, 0.10.0 방향·잠금, 0.14.0 다듬었는지, 0.16.0 선분 식별자·끌어온 점 — 있는 것만) */
const pointSnapOf = (s: MeasurePick): MeasurePointSnap => {
  const r: MeasurePointSnap = { kind: s.kind };
  if (s.axis) r.axis = s.axis;
  if (s.direction) r.direction = s.direction;
  if (s.locked) r.locked = true;
  if (s.refined) r.refined = true;
  if (s.segment) {
    r.segment = s.segment;
    if (s.other) r.other = s.other;
  }
  if (s.trackFrom) r.trackFrom = s.trackFrom;
  if (s.trackOther) r.trackOther = s.trackOther;
  if (s.face) r.face = s.face;
  if (s.trackGuide) r.trackGuide = s.trackGuide;
  return r;
};
/**
 * 측정 붙잡기 표식 하나를 (x, y)에 그린다(0.46.0에 drawMeasure 안에서 떼었다 — 그리는 명령은 그대로).
 * 0.8.0: 가운데 점 = 세모, 중심 = 동그라미 테 + 십자(⊕), 그 밖의 앱 점 = 마름모. 0.9.0 추론: 교차점 = 엇갈린 십자(×), 수직 발 = ⊥.
 * 0.38.0 접점: 동그라미 테와 꼭대기 가로선. 0.46.0 가상 커서('cursor'): 가운데를 비운 십자(점 표식과 같은 바탕 테 위 측정 색 선 — 붙잡기 거리 10화소보다 조금 길게)
 */
function drawSnapMark(
  ctx: CanvasRenderingContext2D,
  th: Viewer3dTheme,
  x: number,
  y: number,
  kind: 'midpoint' | 'center' | 'point' | 'intersection' | 'perpendicular' | 'tangent' | 'cursor',
): void {
  ctx.fillStyle = th.measure;
  ctx.strokeStyle = th.textBg;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (kind === 'tangent') {
    // 바탕 테(대비) 위에 측정 색 테와 위 접선(중심 ⊕와 같은 반지름 — 십자 대신 꼭대기 가로선이 테 밖으로 나간다)
    for (const [color, w] of [
      [th.textBg, 4],
      [th.measure, 2],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.moveTo(x - 10, y - 6);
      ctx.lineTo(x + 10, y - 6);
      ctx.stroke();
    }
  } else if (kind === 'intersection' || kind === 'perpendicular') {
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
  } else if (kind === 'cursor') {
    // 바탕 테(대비) 위에 측정 색 십자 — 가운데 3화소는 비워 붙잡은 점 표식을 가리지 않는다
    for (const [color, w] of [
      [th.textBg, 4],
      [th.measure, 2],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x - 13, y);
      ctx.lineTo(x - 3, y);
      ctx.moveTo(x + 3, y);
      ctx.lineTo(x + 13, y);
      ctx.moveTo(x, y - 13);
      ctx.lineTo(x, y - 3);
      ctx.moveTo(x, y + 3);
      ctx.lineTo(x, y + 13);
      ctx.stroke();
    }
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
}
/** 끌어온 축 하나의 복사본(0.17.0) */
const copyGuide = (g: TrackGuide): TrackGuide => ({ from: [g.from[0], g.from[1], g.from[2]], axis: g.axis });
/** 끌어온 점 안내 선 하나의 복사본(0.30.0) */
const copyDirLine = (g: TrackDirLine): TrackDirLine => ({ from: [g.from[0], g.from[1], g.from[2]], kind: g.kind, dir: [g.dir[0], g.dir[1], g.dir[2]] });
/** 그물 면의 복사본(0.18.0) */
const copyFace = (g: SnapFace): SnapFace => ({ id: g.id, index: g.index, normal: [g.normal[0], g.normal[1], g.normal[2]] });
/** 다듬기에 넘기는 직선의 복사본(0.18.0 — 0.20.0부터 축이 아닌 잠근 선이면 axis가 없다) */
const copyLine = (l: SnapRefineLine): SnapRefineLine => {
  const r: SnapRefineLine = { origin: [l.origin[0], l.origin[1], l.origin[2]], dir: [l.dir[0], l.dir[1], l.dir[2]] };
  if (l.axis) r.axis = l.axis;
  return r;
};
/** 점 origin을 지나는 세계 축 직선(0.18.0 'axisEdge'·0.19.0 'axisFace'의 line) */
const axisRefineLine = (origin: readonly number[], axis: SnapAxis): SnapRefineLine => ({ origin: [origin[0]!, origin[1]!, origin[2]!], dir: axisLock(axis).direction, axis });
/**
 * 열린 교차(0.20.0)가 보는 선: 지나는 점·단위 방향, 세계 축이면 그 이름, 끌어온 축인지(그 점을 trackFrom으로 싣는다).
 * 0.31.0: 끌어온 점의 안내 선(trackDirs { meets: { open } })이면 그 안내 종류(guide — 축 이름 없음, track: true)
 */
type OpenRefineLine = { from: V3; dir: V3; axis?: SnapAxis; track: boolean; guide?: TrackDirKind };
/** 열린 교차·잠근 선의 선 → 다듬기에 넘기는 직선(복사하지 않는다 — 넘길 때 copyLine) */
const refineLineOf = (l: OpenRefineLine): SnapRefineLine => (l.axis ? { origin: l.from, dir: l.dir, axis: l.axis } : { origin: l.from, dir: l.dir });
/**
 * 끌어온 점 안내 선이 만나 볼 직선의 꼬리표(0.29.0 trackDirs { meets }): 첫 점을 지나는 축, 첫 점의 나란함(그 단위 방향과 0.10.0 기준 선분), 다른 끌어온 점의 축
 */
type MeetTag = { kind: 'axis'; axis: SnapAxis } | { kind: 'parallel'; dir: V3; edge: [V3, V3] } | { kind: 'track'; from: V3; axis: SnapAxis };
/** 기준 선분 거르기에 바로 앞에 물은 선분과 답(0.28.0 trackDirs edge, 0.29.0 parallelEdge — 물은 함수도) */
type EdgeAsked = { fn: TrackDirEdgeFilter; item: object; kind: string; raw: number; ends: [V3, V3]; ok: boolean };
/** 축과 면의 교차가 보는 그물 면 맞음(0.18.0 faceHitOf): 그물 id·삼각형 번호와, 있으면 맞은 삼각형의 세계 꼭짓점(0.37.0 — 닫힌 면 교차 다듬기의 넓힌 받기) */
type FaceHit = TrackFaceHit & SnapFace & { corners?: [V3, V3, V3] };
/** 끌어온 점 안내 선이 만나는 점(0.29.0): 순수 결과와 그 안내의 기준 선분 */
type TrackDirMeet = { snap: TrackDirMeetSnap<NearSegment, FaceHit, MeetTag>; ref: [V3, V3] };
/** 커서 둘레 그물 삼각형(0.22.0 선과 삼각형의 열린 교차): 세계 꼭짓점 셋·커서 쪽 깊이의 화소 세계 길이·남는 쪽 판정과 그 면(그물 id·삼각형 번호·눈 쪽 법선) */
type NearTriangle = TrackTriangle & SnapFace & { corners: [V3, V3, V3] };
/**
 * 점 from을 지나는 방향 dir의 3D 직선을 화면에 그린 직선이 커서(x, y)에서 px 안을 지날 수 있는지(0.22.0 — 면의 열린 교차에서 삼각형 모으기를 건너뛸 때).
 * 원근 투영은 직선을 직선으로 옮기므로 눈 앞 두 점(커서 광선에 가장 가까운 점과 그 깊이만큼 떨어진 점)의 화면 자리를 지나는 2D 직선까지 거리가 그 아래 한계다.
 * 두 점을 화면에 그릴 수 없거나 한 점으로 겹치면(시선과 나란하다) 판정하지 않고 true
 */
function lineNearCursor(f: ViewFrame, ray: { origin: V3; dir: V3 }, from: readonly number[], dir: readonly number[], x: number, y: number, px: number): boolean {
  const e = unitDir([0, 0, 0], dir);
  if (!e) return false;
  const q1 = rayLinePoint(ray.origin, ray.dir, from, e) ?? [from[0]!, from[1]!, from[2]!];
  const L = Math.max(viewDepth(f, q1), f.near, 1e-9);
  let s1 = projectToScreen(f, q1), s2 = projectToScreen(f, [q1[0] + e[0] * L, q1[1] + e[1] * L, q1[2] + e[2] * L]);
  if (!s2) s2 = projectToScreen(f, [q1[0] - e[0] * L, q1[1] - e[1] * L, q1[2] - e[2] * L]);
  if (!s1 || !s2) return true;
  if (f.projection === 'perspective' && (s1[2] < f.near * 0.999 || s2[2] < f.near * 0.999)) return true;
  const dx = s2[0] - s1[0], dy = s2[1] - s1[1];
  const l = Math.hypot(dx, dy);
  if (!(l > 1e-9) || !Number.isFinite(l)) return true;
  return Math.abs(dx * (y - s1[1]) - dy * (x - s1[0])) / l <= px;
}
/**
 * 그물 면 고르기 결과 → 축과 면의 교차가 보는 면 맞음(0.18.0): 광선 맞은 점, 단위 법선, 평면 위 점은 맞은 삼각형의 첫 꼭짓점(광선 맞은 점의 셈 오차 없이 —
 * 축과 수직인 면이면 교차의 그 좌표가 꼭짓점 좌표 그대로), 그물 id·삼각형 번호. 그물 면(잘린 면 아님)이 아니면 null.
 * 0.37.0: 맞은 삼각형의 세계 꼭짓점(corners)도 싣는다(닫힌 면 교차 다듬기의 넓힌 받기가 그 칸 위 곡면 조각 자리를 본다 — 값으로 내보내지 않는다)
 */
const faceHitOf = (d: PickDetail | null): FaceHit | null => {
  const k = d?.pick;
  if (!k || k.kind !== 'mesh' || k.section || !k.normal) return null;
  const n = k.normal;
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  const r: FaceHit = { point: k.point, normal: [n[0] / l, n[1] / l, n[2] / l], id: k.id, index: k.index };
  if (d!.corners) {
    r.origin = d!.corners[0];
    r.corners = d!.corners;
  }
  return r;
};
/** 점 붙잡기(머무르기로 끌어올 수 있는 점 — 0.16.0)인지: 꼭짓점·끝점·가운데 점·중심·앱 점·교차점·수직 발이고 잠근 선 위 점이 아님 */
const dwellPointOf = (h: MeasurePick | null): V3 | null =>
  // 0.27.0: 끌어온 점의 나란함·수직 선 위 점('perpendicular'에 trackFrom)은 선 위 점이라 기억하지 않는다(끌어온 점이 실린 것은 모두 선 위 점이다)
  h && !h.locked && h.kind && h.kind !== 'axis' && h.kind !== 'parallel' && !h.trackFrom ? h.p : null;
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
/** 0.50.0 탭(문서)이 숨었는지 — 브라우저가 requestAnimationFrame을 멈춘다 */
function docHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/** 0.50.0 앱이 준 점이 유한한 수 셋(한도 COORD_LIMIT 안)인지 */
function okPoint3(p: readonly number[] | ArrayLike<number> | null | undefined): boolean {
  return !!p && p.length >= 3 && okCoord(p[0]!) && okCoord(p[1]!) && okCoord(p[2]!);
}

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
  /** 이 평면이 통째로 자르는 묶음 id(없으면 모두) */
  items: Set<string> | null;
  /** 0.44.0 이 평면이 자르는 묶음 안 구간(묶음 id → 기본 도형·윤곽선 구간, 합친 것 — 묶음 수로 자르는 것은 쓸 때). 없으면 구간 단면 없음 */
  ranges?: Map<string, { prims: IndexRange[]; edges: IndexRange[] }> | null;
  id?: string;
}

/** 0.44.0 구간 단면 한도 없는 합치기(묶음 수로 자르는 것은 쓸 때 — 아직 없는 묶음 id도 받는다) */
const RANGE_ANY = Number.MAX_SAFE_INTEGER;

/**
 * 0.44.0 묶음 하나의 구간 단면 갈래: 평면마다 그 묶음에서 자르는 구간(통째로 자르는 평면은 빼고 — 비트 1 << 평면 번호)과 번호 → 갈래 비트,
 * 갈래 값들(기본 도형·윤곽선, 0 = 통째 평면만인 나머지)
 */
interface SecCut {
  prims: CutRanges[];
  edges: CutRanges[];
  primMask: (i: number) => number;
  edgeMask: (i: number) => number;
  primMasks: Set<number>;
  /** 윤곽선 갈래(윤곽선이 있고 윤곽선 구간 단면이 없으면 {0}) */
  edgeMasks: Set<number>;
  masks: number[];
}

/**
 * 0.44.0 구간 단면 갈래 하나(고르기·단면 테두리): 그 갈래를 자르는 평면 번호들(오름차순 — 통째 평면 ∪ 갈래 비트)과 그 갈래가 아닌 것·숨긴 것을 건너뛰는 판정
 */
interface SecClass {
  mask: number;
  idx: number[];
  test: (i: number) => boolean;
  eTest: ((i: number) => boolean) | null;
  /** 그 갈래에 기본 도형이 있는지(없으면 윤곽선만) */
  prims: boolean;
}

interface Drag {
  mode: 'orbit' | 'pan' | 'touch';
  /** 0.32.0: 이 끌기를 시작한 포인터(끌기 시작 거리를 넘을 때 앱에 물을 포인터) */
  id: number;
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
/** 뷰 큐브를 뷰어 위·오른쪽 가장자리에서 띄우는 거리(CSS 화소 — viewCubeRect가 같은 값을 쓴다) */
const CUBE_INSET = 8;
/** 그림 저장 2D 캔버스 넓이 한도(화소): iOS Safari 캔버스 한도(약 16.7 Mpx = 4096²) */
export const SNAPSHOT_MAX_PIXELS = 4096 * 4096;
/** 그림 저장 한 변 한도(화소) */
const SNAPSHOT_MAX_SIDE = 16384;
/** 0.45.0 최근접점 구간 모양(closestPoints rangeA·rangeB)을 묶음(정점·번호 배열)마다 기억하는 개수 — 면 표에서 고른 면 짝을 잇달아 잴 때 다시 만들지 않게 */
const CLOSEST_PART_CACHE = 64;
/**
 * 0.30.0 처음 올릴 때 무늬 다시 그리기 간격: 첫 무늬 뒤로는 다른 무늬를 아직 푸는 중이면 앞서 무늬로 다시 그린 때부터 이만큼(ms)과
 * 그 뒤 그린 화면의 그리기·무늬 올리기 한 번·GPU 울타리 기다림에 걸린 가장 긴 시간 × TEXTURE_REDRAW_SLOW 가운데 긴 시간이 지나야 다시 그린다
 */
export const TEXTURE_REDRAW_MS = 250;
/** 0.30.0 무늬 다시 그리기 간격의 올리기 시간 배수 — 다시 그린 화면을 GPU가 끝내기를 기다리는 몫이 올리는 시간의 1/(1 + 4)쯤을 넘지 않게 */
export const TEXTURE_REDRAW_SLOW = 4;
/** 0.30.0 미룬 무늬 다시 그리기가 앞서 그린 화면을 GPU가 끝내기를 기다릴 때 다시 보는 간격(ms) */
const TEXTURE_REDRAW_POLL_MS = 50;
/** 0.30.0 그 울타리를 이만큼(ms) 넘게 기다리면 끝난 것으로 본다(끝났다는 알림이 오지 않는 드라이버에서도 첫 무늬가 나타나게) */
const TEXTURE_REDRAW_FENCE_MAX_MS = 5000;
const cubeSize = (px: number): number => Math.min(160, Math.max(64, Math.round(px) || CUBE_CSS));
/** 0.44.0 손가락 뷰 큐브 선택 정리(false = 끔, 아니면 편 한 변 64~480·띠 0.1~0.4) */
function cubeTouchOpts(t: boolean | ViewCubeTouchOptions | undefined): false | Required<ViewCubeTouchOptions> {
  if (t === false) return false;
  const o: ViewCubeTouchOptions = typeof t === 'object' && t ? t : {};
  const size = typeof o.size === 'number' && Number.isFinite(o.size) ? Math.max(64, Math.min(480, Math.round(o.size))) : CUBE_TOUCH_SIZE;
  const band = typeof o.band === 'number' && Number.isFinite(o.band) ? Math.max(0.1, Math.min(0.4, o.band)) : CUBE_TOUCH_BAND;
  return { size, band };
}
/** 표준 뷰 키 — 0.10.0부터 작은 모듈에 두고(0.54.0 viewkeys.ts — camera.ts가 다시 내보낸다) 여기서도 같은 객체를 내보낸다(opencad-viewer3d/viewer로 가져오던 앱) */
export { VIEW_KEYS };
const UNIT_LABEL: Record<Scene3d['units'], string> = { mm: 'mm', inch: 'in', m: 'm', unknown: '' };

/**
 * 0.54.0 고르기 후보 미리 강조의 면 셈 조각(pickpreview.ts — 뷰어가 처음 그물 면을 강조할 때 import()로 받는다: 면 미리 강조를 쓰지 않는 앱은 코어 조각에 그 코드를 받지 않는다).
 * 받았으면 그 모듈, 받지 못했으면 faceKitFailed(그 뒤 면 표식 없이)
 */
type FaceKit = typeof import('./pickpreview');
let faceKit: FaceKit | null = null;
let faceKitLoad: Promise<void> | null = null;
let faceKitFailed = false;

export class Viewer3d {
  /**
   * 0.54.0 묶어 그리기 조각(묶음 굽기 코드 — 앱 번들러가 따로 나눈 조각)을 미리 받는다. 받았으면 true, 받지 못했으면 false(그 뒤 이 페이지는 그물마다 그린다).
   * 뷰어는 묶어 그리기를 켤 수 있는 장면(setRenderOptions merging 'on'이거나 'auto'에서 그물이 문턱 이상)을 받을 때 스스로 받기를 걸고, 받는 동안은 그물마다 그리며
   * 나눠 올리기는 굽지 못한 그물이 굽기 단위(2,048개)에 닿으면 기다린다. 큰 장면을 한 번에(incremental 없이) 올리는 앱이 조각이 오기 전 그물마다 GL 객체를 쌓지 않으려면
   * 장면을 주기 전에 이것을 기다린다. 문턱을 넘지 않는 장면만 여는 앱은 부르지 않는다(조각을 받지 않는다)
   */
  static preloadMerging(): Promise<boolean> {
    return loadMergeKit();
  }

  /** 0.54.0 묶어 그리기 조각 받기 상태('idle' 받기를 걸지 않음 · 'loading' · 'ready' · 'failed' — 문턱을 넘지 않는 장면만 열었으면 'idle'로 남는다) */
  static mergingState(): MergeKitState {
    return mergeKitState();
  }

  readonly host: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  private wrap: HTMLDivElement;
  private overlay: HTMLCanvasElement;
  private octx: CanvasRenderingContext2D;
  private cube: HTMLCanvasElement;
  private cctx: CanvasRenderingContext2D;
  private gl: WebGL2RenderingContext;
  private renderer: Renderer3d;
  private opts: Required<Omit<Viewer3dOptions, 'theme' | 'projection' | 'renderMode' | 'formatMeasure' | 'animate'>>;
  /** 0.48.0 카메라 움직임 설정(true·false·'auto'), 'auto'일 때 듣는 움직임 줄이기 선호와 그만 듣기 */
  private motion: AnimateSetting = true;
  private reduceMotion = false;
  private motionOff: (() => void) | null = null;
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
  /** 0.44.0 단면 평면 목록 판(평면을 새로 두거나 지울 때 늘린다 — 위치·뒤집기·표시만 바꾸면 그대로)과 구간 단면이 있는지 */
  private secRangeVer = 0;
  private secHasRanges = false;
  /** 0.44.0 묶음 객체 → 구간 단면 갈래(판이 같으면 다시 쓴다)·렌더러에 넘길 구간(숨김·강조 구간이 같으면)·갈래 목록(숨김 판정이 같으면) */
  private secCuts = new WeakMap<AnyItem, { ver: number; cut: SecCut | null }>();
  private secParts = new WeakMap<AnyItem, { ver: number; base: ItemParts | null; parts: ItemParts }>();
  private secClassCache = new WeakMap<AnyItem, { ver: number; hid: unknown; ehid: unknown; list: SecClass[] }>();
  /** 0.44.0 고르기 목록의 구간 단면 갈래 대리 묶음(Object.create(원래 묶음)) → 원래 묶음·갈래 */
  private secWrap = new WeakMap<object, { base: AnyItem; cl: SecClass }>();
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
  /** 옮기는 중인 카메라 움직임(0.49.0 done — 그 움직임을 시작한 호출이 돌려준 Promise를 푼다: 끝 자리에 닿으면 true, 닿기 전에 끊기면 false) */
  private anim: { from: CameraState; to: CameraState; t0: number; dur: number; done: (arrived: boolean) => void } | null = null;
  private allBox: Box3 = emptyBox();
  private visBox: Box3 | null = null;
  private grid: GridSpec | null = null;
  private gridOn: boolean;
  private bvhs = new WeakMap<Float32Array, Map<Uint32Array | PrimKind, Bvh>>();
  /** 0.45.0 최근접점 구간 모양(closestPoints rangeA·rangeB): 정점 배열 → 번호 배열(없으면 종류) → 합친 구간 열쇠 → 조각. bvhs와 함께 버린다 */
  private parts = new WeakMap<Float32Array, Map<Uint32Array | PrimKind, Map<string, ClosestPart>>>();
  private bvhGen = 0;
  private bvhTimer = 0;
  /** 쉬는 틈에 만들 BVH 일(작은 것부터) */
  private bvhTasks: { n: number; run: () => void }[] = [];
  /** 0.50.0 bvhTasks에서 이미 한 일 수(앞 자리 번호 — shift 대신) */
  private bvhHead = 0;
  /** 0.50.0 문서 visibilitychange를 듣는지(움직임을 처음 시작할 때 건다 — listenHidden) */
  private hiddenOn = false;
  /** 그물마다 단면 교선(로컬 좌표) — 평면·숨긴 구간이 같으면 다시 쓴다(0.11.0: 그물 하나를 바꿔도 다른 그물은 다시 자르지 않는다) */
  private cutCache = new WeakMap<Mesh3d, { plane: Plane4; test: ((i: number) => boolean) | null | undefined; segs: Float32Array }[]>();
  /** 그물 바꾸기 나눠 올리기의 프레임 몫(ms, setMesh의 incremental.budgetMs) */
  private meshBudget = 8;

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

  /** 코어가 다루는 누른 포인터: 지금 자리, 0.32.0 종류·누른 자리(claimPointer가 맡길 때 쓴다) */
  private pointers = new Map<number, { x: number; y: number; type: string; sx: number; sy: number }>();
  /** 0.32.0: 누를 때마다 맡을지 묻는 앱 처리기(setPointerClaim — 없으면 0.31.0 그대로)와 앱이 맡은 포인터(코어가 끌기·고르기에 쓰지 않는다) */
  private claimer: PointerClaimHandler | null = null;
  private holds = new PointerHolds<PointerHoldHandler>();
  private drag: Drag | null = null;
  private touch: { dist: number; cx: number; cy: number } | null = null;
  private lastMiddle = { t: 0, x: 0, y: 0 };
  private cubeHover: V3 | null = null;
  private cubeDrag: { sx: number; sy: number; lx: number; ly: number; moved: boolean; touch: boolean } | null = null;
  /** 0.44.0 손가락 뷰 큐브를 편 한 변(CSS 화소, 0 = 접힘) */
  private cubeZoom = 0;

  private measuring = false;
  private measurePts: V3[] = [];
  private measureHover: MeasurePick | null = null;
  /** 추론 잠금(0.10.0 — Shift·setMeasureInferenceLock). 첫 점이 있을 때만 쓰고, 두 점째를 찍거나 측정을 지우면 푼다 */
  private inferLock: MeasureInferenceLock | null = null;
  /** Shift가 눌려 있는지(0.10.0 — 누르는 순간에만 잠근다)와 그동안 창 keyup·blur 듣기를 푸는 함수 */
  private shiftDown = false;
  private shiftRelease: (() => void) | null = null;
  /** 나란함 추론의 기준 선분(0.10.0 — 측정 중 커서가 마지막으로 지나간 선분·윤곽선, 세계 끝점 둘) */
  private parallelRef: [V3, V3] | null = null;
  /**
   * 0.28.0 끌어온 점의 나란함·수직 기준 선분(inference.trackDirs의 edge 거르기를 줬을 때만 — 그 함수가 받은 마지막 선분. 없으면 parallelRef를 쓴다 = 0.27.0)과
   * 바로 앞에 물은 선분(같은 선분이면 다시 묻지 않는다 — 묶음 객체·배열 안 번호·끝점이 같을 때)
   */
  private trackDirRef: [V3, V3] | null = null;
  private trackDirAsked: EdgeAsked | null = null;
  /**
   * 0.29.0 첫 점 나란함(0.10.0 parallel)의 기준 선분(inference.parallelEdge를 줬을 때만 — 그 함수가 받은 마지막 선분. 없으면 parallelRef = 0.28.0)과
   * 바로 앞에 물은 선분(trackDirAsked와 같은 꼴 — 같은 함수·같은 선분이면 둘 가운데 어느 기억이든 다시 묻지 않는다)
   */
  private parallelOwn: [V3, V3] | null = null;
  private parallelAsked: EdgeAsked | null = null;
  /**
   * 첫 점을 찍은 뒤 미리 보기에서 마지막으로 본 방향 추론(0.10.0 — setMeasureInferenceLock(true)가 커서가 캔버스를 떠난 뒤에도,
   * 예를 들어 마우스로 앱 단추를 누를 때 쓴다). 점을 찍거나 측정을 지우면 잊는다
   */
  private lastLockable: InferenceLock | null = null;
  /** 0.46.0 키보드 붙잡기 선택(setKeyboardSnap — 없으면 꺼짐: 키·그리기·포인터 처리가 0.45.0 그대로) */
  private keySnap: {
    step: number;
    bigStep: number;
    keys: KeySnapKeys;
    announce: ((a: KeyboardSnapAnnouncement) => void) | null;
    src: KeyboardSnapOptions;
    /** 0.47.0 고르기 모드 후보 돌리기 선택(끄면 null — 0.46.0 고르기 모드) */
    pickCycle: KeyPickCycleOptions | null;
    /** 0.47.0 알림 글 틀(기본과 합친 것), 0.53.0 또는 앱 글 함수 */
    msgs: KeySnapText;
    /** 0.54.0 고른 것 이름 함수(없으면 null) */
    pickName: ((p: Pick3d) => string | null | undefined) | null;
  } | null = null;
  /** 0.54.0 고르기 후보 미리 강조(setPickPreview — 화면 덧그림만): 고른 것 사본과 앱 삼각형 구간 */
  private pickPrev: { pick: Pick3d; ranges: IndexRange[] | null } | null = null;
  /**
   * 0.54.0 그물 면 미리 강조 셈 기억(덧그림은 프레임마다 그린다 — 같은 위치·색인 배열·삼각형·구간이면 다시 세지 않는다. 키보드 후보와 setPickPreview를 함께 두게 넷까지)
   */
  private faceMemo: { pos: ArrayLike<number>; idx: ArrayLike<number> | undefined; tri: number; ranges: string | null; out: FaceOutline | null }[] = [];
  /** 0.54.0 면 셈 조각을 기다리는지(오면 다시 그린다 — 한 번만 건다) */
  private faceKitWait = false;
  /**
   * 0.46.0 가상 커서(켰을 때만): 자리(CSS 화소)·지금 후보 차례·그 자리 측정 후보 목록, 고르기 모드면 커서 아래 고른 것,
   * 켤 때 포인터 자리(모르면 켠 뒤 처음 본 자리 — 거기서 4화소 넘게 움직이면 끈다). 0.47.0 picks: 고르기 모드 겹친 후보(pickCycle일 때만, 아니면 빈 배열)
   */
  private keyCur: { x: number; y: number; index: number; list: KeyEntry[]; picks: PickDetail[]; pick: Pick3d | null; ptr: { x: number; y: number } | null } | null = null;
  /** 0.46.0 바로 앞 포인터 이동 자리(캔버스를 떠나면 null — 가상 커서를 켤 때의 포인터 자리) */
  private lastPtr: { x: number; y: number } | null = null;
  /**
   * 끌어온 축(0.16.0 — inference.track을 켰을 때만, 끄면 null이라 상태가 없다): 기억한 점과 머무르기, 머무르기 타이머(dwellMs 뒤 commit)
   */
  private tracker: MeasureTracker | null = null;
  private dwellTimer = 0;
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
    inference: NormalizedInference | null;
    index: SnapPointIndex | null;
    /** 0.10.0 차례 값(점마다, 차례가 없는 점은 −Infinity — 한 점도 차례가 없으면 null)과 붙잡기 한도(없으면 null) */
    orders: Float64Array | null;
    /** 0.41.0 우선(점마다 0 = 보통, 1 = 'low', 2 = 'fallback' — 한 점도 우선이 없으면 null) */
    prios: Uint8Array | null;
    /** 0.45.0 기본 도형 번호(SnapPoint.raw — 점마다, 없는 점은 −1. id와 함께 준 점이 하나도 없으면 null)와 윤곽선 번호인지(edges — 하나도 없으면 null) */
    raws: Int32Array | null;
    rawEdges: Uint8Array | null;
    limit: number | null;
    /** 0.10.0: 바로 앞 pointsFor 호출의 고르기(복사본)와 결과 — 같은 고르기면 다시 부르지 않는다. 0.38.0: 그때의 첫 점(복사본 — pfFirst면 열쇠에 든다) */
    pfMemo: { pick: Pick3d; first: V3 | null; res: readonly SnapPoint[] | null | undefined } | null;
    /** 0.38.0 pointsForFirst — pointsFor 기억이 첫 점으로도 정해지는지 */
    pfFirst: boolean;
    /** 0.14.0 다듬기 손잡이와 바로 앞 호출의 입력(복사본)·결과(수 셋인 점의 복사본, 아니면 null) — 같은 입력이면 다시 부르지 않는다 */
    refine: MeasureSnapOptions['refine'];
    /** 0.19.0 축이 면을 뚫는 점 다듬기 손잡이(기억은 openMemo) */
    refineFace: MeasureSnapOptions['refineFace'];
    rfMemo: { input: SnapRefineInput; res: V3 | null } | null;
    /** 0.15.0 열린 후보(토막 밖 수직 발·넓힌 교차점) 다듬기 기억 — 커서 광선을 뺀 입력 열쇠 → 결과(0.18.0 'axisEdge'·0.19.0 'axisFace'도) */
    openMemo: RefineMemo;
    /** 0.21.0 붙잡지 않은 면 위 점 다듬기('onFace')의 바로 앞 입력 열쇠(openRefineKey — 커서 광선이 line에 들어 있다)와 결과 */
    ofMemo: { key: string; res: V3 | null } | null;
    /** 0.23.0 측정 점 고르기가 반투명 그물의 면을 지나는지(throughTranslucent) */
    through: boolean;
    /** 0.33.0 선이 꺾은선 꼭짓점을 지나는 자리를 앱 refine에 묻는지(refineEnds — refine이 있을 때만 true) */
    ends: boolean;
    /** 0.39.0 닫힌 선분·면 교차의 앱 점이 커서에서 붙잡기 거리 밖이어도 같은 교차의 정확한 자리면 옮기는지(refineSnapToExact — refine·refineFace가 있을 때만 true) */
    exact: boolean;
    /** 0.40.0 현이 커서에서 붙잡기 거리 밖이어도 활꼴 띠가 닿는 토막의 교차를 보는지(openEdgeLens — 기본 켜짐, refine이 있을 때만 true) */
    lens: boolean;
  } | null = null;
  /** 마지막으로 측정 미리 보기를 구한 자리(0.10.0 — 한도·잠금이 바뀌면 그 자리에서 다시 구한다) */
  private lastHoverAt: { x: number; y: number; pointerType: string } | null = null;
  /** 찍은 측정 점의 붙잡은 종류와 축 붙잡기의 축(점 배열 객체 → 붙잡기) */
  private measureSnaps = new WeakMap<V3, MeasurePointSnap>();
  /** 측정 글 꼴(없으면 기본) */
  private measureFmt: MeasureFormat | null = null;
  /** 마지막으로 화면에 그린 측정 거리 글상자(0.12.0 — CSS 화소, 그리지 않았으면 null) */
  private measureLabel: MeasureLabelRect | null = null;
  /** 측정 거리 글상자가 비켜 그릴 자리(0.13.0 — 고른 사각형과 커서 둘레 반지름, 없으면 null = 0.12.0 그대로) */
  /** 0.13.0 측정 거리 글상자가 비켜 그릴 자리(0.31.0 points, 0.33.0 snapshot — 그림 저장도 표식 비키기, points일 때만 true) */
  private labelAvoid: { rects: MeasureLabelRect[]; pointerRadius: number; points: boolean; snapshot: boolean } | null = null;
  /** 0.27.0 뷰어 글상자 기본 자리(setMeasureLabelSpot — 준 것만, 없으면 null = 0.26.0 그대로 오른쪽 위) */
  private labelSpot: MeasureLabelSpot | null = null;
  /** 마지막으로 화면에 그린 앱 측정 덧그림 글상자(0.23.0 — setAnnotations 차례, 그리지 않은 것은 null) */
  private annoLabels: (MeasureLabelRect | null)[] = [];
  /** 마지막 화면 덧그림에서 기본 자리가 아닌 곳에 그린 글상자가 있는지(0.24.0 — 그림 저장이 화면 덧그림을 그대로 쓰지 않고 기본 자리로 다시 그린다) */
  private labelsShifted = false;
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
  /** 0.49.0 주변 가림 선택(끄면 null) */
  private aoOpt: AmbientOcclusionOptions | null = null;
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
  /** 묶음 행렬을 건 묶음 id(있으면 보이는 범위를 다시 모은다 — 0.32.0부터 수를 세지 않고 모아 둔다: 하나 바꿀 때 겉모습 전체를 훑지 않게) */
  private lookMoved = new Set<string>();
  private lineModels = new WeakMap<LineSet3d | PointSet3d, ArrayLike<number>>();
  /** 앱 측정 덧그림(setAnnotations)과 계산한 모양 */
  private annos: { list: Annotation3d[]; geo: (AnnotationGeometry | null)[]; hidden: number; width: number; box: Box3 | null } | null = null;
  /** 측정 중 미리 볼 자리와 그 포인터 종류(터치 미리 보기는 터치 허용 거리로 — 이어지는 누르기와 같은 점) */
  private hoverAt: { x: number; y: number; pointerType: string } | null = null;

  /**
   * 고르기 알림과 그 알림의 고르기 선택(0.22.0 onPick의 meshesOnly, 0.23.0 throughTranslucent, 0.26.0 front) — 단 차례대로
   * (Map이라 같은 함수를 다시 달면 처음 자리를 지킨다)
   */
  private pickCbs = new Map<(p: Pick3d | null, e: PickEvent) => void, { meshesOnly: boolean; through: boolean; front: boolean }>();
  /** 0.25.0 지금 장면의 놓기 선택(setScene의 release — 문맥 복구에서 다시 올릴 때도 쓴다) */
  private releaseOpt: ReleaseFlags | null = null;
  /** 0.25.0 문맥 복구 알림(놓은 것을 다시 받는다 — 놓기 선택이 없어도 빈 need로 부른다) */
  private restoreCbs = new Set<(need: ContextRestoreNeed) => unknown>();
  /** 0.25.0 문맥 잃음 알림 */
  private lostCbs = new Set<() => void>();
  /** 0.29.0 되찾은 뒤 다시 올리기가 다 끝났을 때 알림 */
  private restoreDoneCbs = new Set<() => void>();
  /** 0.29.0 문맥을 잃은 뒤 다시 올리기가 아직 끝나지 않았는지(잃는 순간부터 끝 알림까지 — restorePending) */
  private restoreWait = false;
  /** 0.29.0 문맥 복구 알림을 부르는 동안(그 사이 앱이 다시 준 것으로 끝 알림이 먼저 가지 않게) */
  private restoreEmitting = false;
  /**
   * 0.30.0 처음 올릴 때 무늬 다시 그리기 모으기(texRedraw): 이번 무늬 올리기에서 무늬로 다시 그렸는지, 마지막으로 무늬로 다시 그린 때(performance.now),
   * 그 뒤 그린 화면·무늬 올리기 한 번·울타리 기다림에 걸린 가장 긴 시간(ms), 미룬 다시 그리기 타이머
   */
  private texDrawn = false;
  private texDrawAt = 0;
  private texSlow = 0;
  private texTimer: ReturnType<typeof setTimeout> | 0 = 0;
  /** 0.30.0 무늬를 올리는 동안 마지막으로 그린 화면 뒤의 GPU 울타리(미룬 무늬는 그 화면을 GPU가 끝낸 뒤 그린다 — 없으면 끝난 것으로 본다) */
  private texFence: WebGLSync | null = null;
  /** 0.30.0 그 울타리를 둔 때와 미룬 다시 그리기가 그 울타리를 기다렸는지(기다렸으면 그 화면의 GPU 시간으로 간격을 다시 정한다) */
  private texFenceAt = 0;
  private texFenceWaited = false;
  private sectionCbs = new Set<(s: SectionState | null, all: SectionState[]) => void>();
  private lastClick: LastClick = { t: 0, x: 0, y: 0, n: 0 };
  /** 묶음 안 구간(숨김·강조) */
  private rangeSel = new Map<string, RangeState>();
  private rangeVer = 0;
  /**
   * 나눠 올리기(setScene incremental): 한 프레임에 쓸 시간과 진행 알림. 0.51.0 fn = 걸음마다 몫 함수(없으면 budget), step = 다음 걸음 번호,
   * redraw = 올리기만으로 생긴 다시 그리기 간격(0이면 걸음마다 — 0.50.0), lastDraw = 마지막으로 장면을 그린 때(performance.now)
   */
  private upload: {
    budget: number;
    fn: ((step: number, meshes: number) => number) | null;
    step: number;
    redraw: number;
    lastDraw: number;
    cb: ((done: number, total: number) => void) | null;
  } | null = null;
  /** 0.51.0 기다리는 그리기가 나눠 올리기 걸음만으로 생겼는지(다른 까닭의 invalidate가 끼면 false — redrawMs가 이 그리기만 건너뛴다) */
  private upOnly = false;
  private measureCbs = new Set<(m: MeasureResult | null) => void>();
  private camCbs = new Set<(c: CameraState) => void>();
  /** 0.53.0 손가락 뷰 큐브 펴기·접기 알림(onViewCubeExpandedChange) */
  private cubeCbs = new Set<(expanded: boolean, e: ViewCubeExpandEvent) => void>();
  private lastCamKey = '';
  /** 0.50.0 지금 장면의 입력 알림(sceneIssues)과 듣는 함수(onSceneIssues) */
  private issues: SceneIssue[] = [];
  private issueCbs = new Set<(issues: readonly SceneIssue[]) => void>();

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
      viewCubeTouch: cubeTouchOpts(opts.viewCubeTouch),
      axes: opts.axes ?? true,
      keyboard: opts.keyboard ?? true,
      pickTolerance: opts.pickTolerance ?? PICK_TOLERANCE_PX,
      touchPickTolerance: opts.touchPickTolerance ?? TOUCH_PICK_TOLERANCE_PX,
      pickEdges: opts.pickEdges ?? false,
      maxPixelRatio: opts.maxPixelRatio ?? 2,
      textureLimit: opts.textureLimit ?? TEXTURE_LIMIT,
      textureBudget: opts.textureBudget ?? TEXTURE_BUDGET,
    };
    this.themeOpt = opts.theme;
    this.motion = normalizeAnimate(opts.animate);
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
    cube.style.cssText = `position:absolute;top:${CUBE_INSET}px;right:${CUBE_INSET}px;width:${this.opts.viewCubeSize}px;height:${this.opts.viewCubeSize}px;cursor:pointer;touch-action:none;`;
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
    renderer.onTexture = (uploadMs) => {
      this.texRedraw(uploadMs);
      // 0.29.0: 무늬를 다 풀어 올렸으면 되찾은 뒤 끝 알림
      this.checkRestoreDone();
    };
    // 0.54.0 묶어 그리기 조각이 오면(또는 받지 못하면) 다시 그린다 — 기다리던 올리기·굽기를 잇는다
    renderer.onMergeReady = () => this.invalidate();
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
    // 0.48.0: 'auto'일 때만 움직임 줄이기 선호를 듣는다(true·false면 0.47.0처럼 matchMedia를 부르지 않는다)
    this.listenMotion(this.motion === 'auto');
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
   * 그물 하나만 바뀌면 장면 전체 대신 setMesh·removeMesh(0.11.0)를 쓴다.
   *
   * 0.25.0 release(true = 셋 모두, 또는 ReleaseOptions): 켠 배열·원본은 GPU에 올린 뒤(나눠 올리면 그 그물 차례에, 무늬는 풀어 올린 뒤)
   * 코어가 장면 객체에서 지우고(delete — 무늬의 푼 그림은 close, textures: 'bitmap'이면 푼 그림만) 다시 읽지 않는다. 고르기·측정·범위·단면은 위치·색인만 쓰므로 그대로다.
   * 이 장면에 setMesh로 넣는 그물도 같다. 문맥을 잃었다 되찾으면 위치·색으로 먼저 그리고 onContextRestore로 다시 받는다.
   * 주지 않으면 0.24.0과 같다(장면 배열을 붙잡고 문맥 복구 때 그대로 다시 올린다)
   *
   * 0.51.0 나눠 올리기 걸음(STEP 58·59차): 나눠 올리는 동안 프레임마다 그때까지 올린 것을 다시 그리므로 걸음이 많으면 다 올리기까지 오래 걸린다(그물 수의 제곱).
   * - incremental.budgetMs에 함수 `(step, meshes) => ms`를 주면 걸음마다 몫을 정한다(step = 0부터 센 걸음, meshes = 장면 그물 수 — 예: 앞 두 걸음은 8 ms로 첫 그림을 곧,
   *   그다음은 그물 1,000개마다 1 ms). 돌려준 값이 유한한 양수가 아니거나 함수가 예외를 내면 그 걸음은 8 ms
   * - incremental.redrawMs: 나눠 올리는 동안 올리기만으로 생긴 다시 그리기를 이 간격(ms)에 한 번만 한다(첫 걸음은 그린다 — 첫 그림). 다 올린 걸음은 그리지 않고 다음 프레임에
   *   장면 전체를 그린다(올리기와 장면 그리기를 두 작업으로 — 가장 긴 작업이 둘의 합이 아니게). 카메라·고르기·무늬 등 다른 까닭의 다시 그리기는 그대로 그린다. Infinity면 첫 그림과 다 올린 뒤만
   * 주지 않으면 0.50.0과 같다(모든 걸음 budgetMs 숫자, 걸음마다 그리기)
   */
  setScene(
    scene: Scene3d,
    opts: {
      keepView?: boolean;
      incremental?: boolean | { budgetMs?: number | ((step: number, meshes: number) => number); redrawMs?: number };
      onProgress?: (done: number, total: number) => void;
      release?: boolean | ReleaseOptions;
    } = {},
  ): void {
    if (this.disposed) return;
    const hadSection = !!this.sec;
    // 0.50.0 입력 검사: 놓을 자리를 모르는 항목(유한하지 않은 원점·행렬)은 빼고, 깨진 색·굵기·크기·재질 값·정점 색은 고친 얕은 사본으로(배열은 같은 객체).
    // 고칠 것이 없으면 받은 장면 객체 그대로다. 깨진 좌표·색인은 범위에서 건너뛰고(bounds) 그리기 사본을 올린다(renderer — triangleFix·segmentFix)
    const chk = checkScene(scene);
    scene = chk.scene;
    this.issues = chk.issues;
    this.sceneRef = scene;
    this.releaseOpt = releaseFlags(opts.release);
    this.rebuildItems();
    this.bbList = scene.meshes.filter((m) => hasBillboard(m));
    this.bbCamKey = '';
    this.hiddenGroups.clear();
    this.hiddenItems.clear();
    this.hi.clear();
    this.ranges.clear();
    this.rangeSel.clear();
    this.looks.clear();
    this.lookMoved.clear();
    this.lineModels = new WeakMap();
    this.segHi = null;
    // 0.54.0 고르기 후보 미리 강조도 장면을 바꾸면 풀린다
    this.pickPrev = null;
    this.faceMemo = [];
    this.measurePts = [];
    this.measureHover = null;
    this.inferLock = null;
    this.lastLockable = null;
    this.clearTrack();
    this.bvhs = new WeakMap();
    this.parts = new WeakMap();
    this.boxes = new WeakMap();
    this.models = new WeakMap();
    this.cutCache = new WeakMap();
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
    // 0.51.0 걸음마다 몫(함수 — 숫자 몫 budget은 8 ms로 두고 함수가 쓸 수 없는 값을 내면 그것을 쓴다)·다시 그리기 간격(유한한 양수 또는 Infinity — 아니면 0.50.0처럼 걸음마다)
    const io = typeof inc === 'object' ? inc : null;
    const fn = typeof io?.budgetMs === 'function' ? io.budgetMs : null;
    const num = typeof io?.budgetMs === 'number' ? io.budgetMs : undefined;
    const redraw = typeof io?.redrawMs === 'number' && io.redrawMs > 0 ? io.redrawMs : 0;
    this.upload = inc ? { budget: Math.max(1, num ?? 8), fn, step: 0, redraw, lastDraw: -Infinity, cb: opts.onProgress ?? null } : null;
    // 0.30.0: 새 장면의 첫 무늬는 곧 그린다
    this.texReset();
    if (this.gpu) this.renderer.setScene(scene, { incremental: !!inc, release: this.releaseOpt });
    // 0.50.0: 유한하지 않거나 한도 밖인 Scene3d.bounds는 쓰지 않는다(0.49.0은 무한 범위에서 격자를 만들다 예외를 냈다)
    this.allBox = boundsOk(scene.bounds) ? scene.bounds! : sceneBounds(scene);
    this.visBox = null;
    this.rebuildGrid();
    if (!opts.keepView) {
      const a = dirToAngles(VIEW_DIRS.seIso);
      this.dropAnim();
      this.cam = fitCamera({ ...this.cam, yaw: a.yaw, pitch: a.pitch }, this.visibleBox(), this.cssW / this.cssH);
      this.pendingFit = !this.sizeKnown;
    }
    this.scheduleBvh();
    // 단면이 꺼졌거나(새 장면) 장면 범위가 바뀌어 위치(t)가 달라졌으면 알린다
    if (hadSection || this.sec) this.emitSection();
    this.invalidate();
    // 0.29.0: 되찾은 뒤 다시 올리는 중에 새 장면을 주면 그 장면을 다 올렸을 때 끝 알림
    this.checkRestoreDone();
    this.emitIssues(chk.issues);
  }

  /**
   * 0.50.0 지금 장면의 입력 알림(setScene이 새로 만들고 setMesh·removeMesh가 그 그물 것을 바꾼다, clear·dispose면 빈 배열).
   * 앱이 깨진 파일에서 만든 값(NaN·무한대·1e15 넘는 좌표, 정점 수 밖 색인, 길이가 맞지 않는 배열, 유한하지 않은 색·원점·행렬·굵기 등)을 코어가 어떻게 했는지
   * (빼고 그림·고쳐 그림·쓰지 않음 — SceneIssue.action) 항목마다 하나씩 적는다. 멀쩡한 장면은 빈 배열이다. 글은 sceneIssueText(SCENE_ISSUE_MESSAGES)
   */
  get sceneIssues(): readonly SceneIssue[] {
    return this.issues;
  }

  /**
   * 0.50.0 입력 알림 듣기: setScene·setMesh가 깨진 값을 찾으면 그 호출이 끝나기 전에(동기) 그 호출이 찾은 알림으로 부른다(멀쩡하면 부르지 않는다).
   * 돌려준 함수로 그만 듣는다
   */
  onSceneIssues(cb: (issues: readonly SceneIssue[]) => void): () => void {
    this.issueCbs.add(cb);
    return () => this.issueCbs.delete(cb);
  }

  private emitIssues(list: readonly SceneIssue[]): void {
    if (!list.length) return;
    for (const cb of [...this.issueCbs]) cb(list);
  }

  /** 장면 비우기(단면도 끈다) */
  clear(): void {
    if (this.disposed) return;
    const hadSection = !!this.sec;
    this.rangeSel.clear();
    this.looks.clear();
    this.lookMoved.clear();
    this.upload = null;
    this.releaseOpt = null;
    this.texReset();
    this.sceneRef = null;
    this.issues = [];
    this.items.clear();
    this.bbList = [];
    this.hi.clear();
    this.ranges.clear();
    this.segHi = null;
    this.measurePts = [];
    this.measureHover = null;
    this.inferLock = null;
    this.lastLockable = null;
    this.clearTrack();
    this.marker = null;
    this.bvhs = new WeakMap();
    this.parts = new WeakMap();
    this.boxes = new WeakMap();
    this.models = new WeakMap();
    this.cutCache = new WeakMap();
    this.visLists = null;
    this.sec = null;
    this.secMore = [];
    this.secIdx.clear();
    this.cutDirty = true;
    this.usesOrigin = false;
    this.wheelAnchor = null;
    this.bvhGen++;
    this.bvhTasks = [];
    this.bvhHead = 0;
    clearTimeout(this.bvhTimer);
    if (this.gpu) this.renderer.clear();
    this.allBox = emptyBox();
    this.visBox = null;
    this.rebuildGrid();
    if (hadSection) this.emitSection();
    this.invalidate();
    this.checkRestoreDone();
  }

  /**
   * 그물 하나 넣기·바꾸기(0.11.0): mesh.id와 같은 그물이 있으면 그 자리에서 바꾸고, 없으면 장면 그물 목록 끝에 더한다.
   * 장면 전체를 다시 올리지 않는다 — 이 그물의 GPU 버퍼만 올리고(앞 그물만 쓰던 버퍼와 바이트 크기가 같으면 그 버퍼에 bufferSubData, 다르면 새 버퍼),
   * 고르기 BVH·범위·단면 테두리도 이 그물 것만 다시 한다(그림자 깊이 그림은 다음 그리기에서 다시 그린다).
   * 다른 묶음의 버퍼, 카메라, 강조(highlight), 측정 점, 숨김(항목·묶음), 묶음 겉모습(이 그물 id에 둔 색·불투명도·행렬·선 색도), 단면은 그대로다.
   * 이 그물 id의 구간 숨김·강조는 새 삼각형 수로 자른다. 장면 범위는 Scene3d.bounds를 준 장면이면 그 값 그대로, 아니면 다시 센다(배열마다 캐시).
   * viewer.scene은 그물을 바꾼 새 장면 객체가 된다(앱이 준 장면 객체는 고치지 않는다).
   *
   * 앞 그물과 같은 배열 객체는 바뀌지 않았다고 본다(GPU·범위·BVH를 다시 만들지 않는다). 정점 속성 배열(위치·법선·색·무늬 좌표)을 제자리에서
   * 고쳤으면 opts.vertices로 바뀐 정점 구간을 알린다 — 그 구간만 올린다. 새 배열을 주면서 vertices를 주면 그 구간 밖은 앞 그물과 같다고 보고
   * 물려받은 버퍼에 그 구간만 올린다. 색인(indices)·윤곽선(edges)을 바꿨으면 새 배열로 준다.
   * opts.incremental이면 새로 올릴 배열이 8 MB(CHUNK_MIN_BYTES)를 넘을 때 프레임마다 4 MB씩 새 버퍼에 채우고, 다 채울 때까지 앞 그물을 그린다
   * (고르기·측정·범위는 처음부터 새 그물로 한다).
   * 0.25.0: 장면에 놓기 선택(setScene의 release)이 있으면 이 그물도 올린 뒤 그 배열을 지운다. 코어가 배열을 지운(놓은) 그물을 바꿀 때
   * 새 그물이 그 배열을 주면 통째로 올리고(vertices 구간은 그 배열에 쓰지 않는다), 주지 않으면 정점 수가 같고 위치 배열이 같거나
   * vertices를 주었을 때 올려 둔 것을 그대로 쓴다. vertices를 주었는데 놓은 배열이라 그 구간을 올리지 못하면 console.warn으로 알린다
   * (그 속성은 앞 그대로다 — 바뀌었으면 새 그물에 그 배열을 통째로 준다).
   * 돌려주는 값: 넣었거나 바꿨으면 true. 장면이 없거나(setScene 먼저) 같은 id가 선분·점 묶음이면 false
   */
  setMesh(mesh: Mesh3d, opts: SetMeshOptions = {}): boolean {
    const s = this.sceneRef;
    if (this.disposed || !s || !mesh || typeof mesh.id !== 'string' || !mesh.positions) return false;
    const old = this.items.get(mesh.id);
    if (old && old.kind !== 'mesh') return false;
    const prev = old?.item as Mesh3d | undefined;
    const v = opts.vertices;
    const ranges = v ? mergeRanges(Array.isArray(v) ? (v as readonly IndexRange[]) : [v as IndexRange], Math.floor(mesh.positions.length / 3)) : null;
    // 제자리에서 고친 배열의 캐시(범위·BVH, 그 배열을 함께 쓰는 묶음의 범위·단면 교선)
    if (prev && ranges?.length) {
      for (const a of [prev.positions, prev.normals, prev.colors, prev.uvs, prev.backUvs]) {
        if (!a || !this.sameArrayIn(mesh, a)) continue;
        if (a === mesh.positions) {
          forgetBounds(a);
          this.bvhs.delete(a);
          this.parts.delete(a);
          for (const it of this.items.values())
            if (it.item.positions === a) {
              this.boxes.delete(it.item);
              if (it.kind === 'mesh') this.cutCache.delete(it.item);
            }
        }
      }
    }
    // 0.50.0 입력 검사(setScene과 같다): 놓을 자리를 모르는 그물(유한하지 않은 원점·행렬)은 넣지 않고 false(앞 그물·알림은 그대로), 깨진 필드는 고친 얕은 사본으로
    const found: SceneIssue[] = [];
    const fixed = checkMesh(mesh, found);
    if (!fixed) {
      this.emitIssues(found);
      return false;
    }
    mesh = fixed;
    this.issues = [...this.issues.filter((i) => i.id !== mesh.id || i.kind !== 'mesh'), ...found];
    if (prev) {
      this.boxes.delete(prev);
      this.models.delete(prev);
      this.cutCache.delete(prev);
    }
    this.boxes.delete(mesh);
    this.models.delete(mesh);
    this.cutCache.delete(mesh);
    const meshes = s.meshes.slice();
    let k = prev ? meshes.indexOf(prev) : -1;
    if (prev && k < 0) k = meshes.findIndex((m) => m.id === mesh.id);
    if (k >= 0) meshes[k] = mesh;
    else meshes.push(mesh);
    const scene: Scene3d = { ...s, meshes };
    this.sceneRef = scene;
    if (prev) this.items.set(mesh.id, { kind: 'mesh', item: mesh });
    else this.rebuildItems();
    const r = this.rangeSel.get(mesh.id);
    if (r) {
      const it = this.items.get(mesh.id)!;
      const ne = mesh.edges ? Math.floor(mesh.edges.length / 6) : 0;
      r.hidden = mergeRanges(r.hidden, primCount(it));
      r.hi = mergeRanges(r.hi, primCount(it));
      r.eHidden = mergeRanges(r.eHidden, ne);
      r.eHi = mergeRanges(r.eHi, ne);
      this.rangesChanged(it);
    }
    // 0.27.0: 고르기에서 지나갈 삼각형 구간도 새 삼각형 수로 자른다(모두 밖이면 지운다)
    const lk = this.looks.get(mesh.id);
    if (lk?.pickThrough) {
      this.applyPickThrough(lk, mergeRanges(lk.pickThrough, primCount(this.items.get(mesh.id)!)));
      if (!lk.pickThrough) this.setLook(mesh.id, lk, false);
    }
    const inc = opts.incremental;
    if (inc) this.meshBudget = Math.max(1, (typeof inc === 'object' ? inc.budgetMs : undefined) ?? 8);
    if (this.gpu) {
      const skipped = this.renderer.setMesh(mesh, scene, { vertices: ranges, incremental: !!inc });
      if (skipped.length) console.warn(`opencad-viewer3d: setMesh('${mesh.id}')의 vertices 구간은 놓은 ${skipped.join('·')}에 올리지 않았습니다(올려 둔 것을 그대로 씁니다 — 바뀌었으면 그 배열을 통째로 주세요)`);
    }
    this.sceneEdited();
    this.queueBvh(mesh);
    // 0.29.0: 다시 받을 그물을 새 배열로 바꿨으면 되찾은 뒤 끝일 수 있다
    this.checkRestoreDone();
    this.emitIssues(found);
    return true;
  }

  /**
   * 그물 하나 빼기(0.11.0). 그 그물만 쓰던 GPU 버퍼를 지우고 범위·고르기·단면 테두리에서 뺀다. 다른 묶음·카메라·측정 점은 그대로다.
   * 그 id에 둔 겉모습(setItem…)·구간 숨김·강조는 지우고, id로 정한 보이기(setItemVisible)·강조(highlight)는 남긴다(같은 id로 다시 넣으면 따른다).
   * 돌려주는 값: 뺐으면 true(그런 그물이 없으면 false)
   */
  removeMesh(id: string): boolean {
    const s = this.sceneRef;
    const it = this.items.get(id);
    if (this.disposed || !s || !it || it.kind !== 'mesh') return false;
    const m = it.item;
    this.sceneRef = { ...s, meshes: s.meshes.filter((x) => x !== m) };
    this.items.delete(id);
    // 0.50.0: 뺀 그물의 입력 알림도 뺀다
    if (this.issues.length) this.issues = this.issues.filter((i) => i.id !== id || i.kind !== 'mesh');
    this.rangeSel.delete(id);
    this.looks.delete(id);
    this.lookMoved.delete(id);
    if (this.gpu) this.renderer.removeMesh(id, this.sceneRef);
    this.sceneEdited();
    // 0.29.0: 다시 받을 그물을 뺐으면 되찾은 뒤 끝일 수 있다
    this.checkRestoreDone();
    return true;
  }

  // ───────────────────────── 0.25.0 놓기·문맥 복구 ─────────────────────────

  /**
   * 그래픽 문맥을 잃었다 되찾을 때마다 부른다(0.25.0 — 코어가 장면·덧그림·단면 테두리를 다시 올린 뒤).
   * need는 코어가 놓은 배열·원본(setScene의 release) 가운데 다시 필요한 것이고, 놓기 선택이 없거나 모두 GPU에 있으면 빈 목록이다
   * (그래도 부른다 — 앱이 안내를 거두거나 라벨 가림 판정을 다시 할 때). 놓은 것이 있으면 코어는 이미 위치·색으로 그리고 있다
   * (놓은 법선 없이 평면 음영, 놓은 무늬 좌표·원본 없이 그물 color). 앱은 need에 든 것을 restoreMeshArrays·restoreTexture로 주고,
   * 준 것부터 되돌아온다(비동기로 천천히 주어도 된다 — 다 주지 않은 무늬는 평균색 그대로). 해제 함수를 돌려준다
   */
  onContextRestore(cb: (need: ContextRestoreNeed) => void | Promise<unknown>): () => void {
    this.restoreCbs.add(cb);
    return () => this.restoreCbs.delete(cb);
  }

  /**
   * 그래픽 문맥을 잃었을 때 부른다(0.25.0 — 놓기 선택과 무관). 되찾을 때까지 화면을 다시 그리지 않는다(앱은 안내를 보일 수 있다).
   * 브라우저가 문맥을 되찾으면 onContextRestore가 온다. 해제 함수를 돌려준다
   */
  onContextLost(cb: () => void): () => void {
    this.lostCbs.add(cb);
    return () => this.lostCbs.delete(cb);
  }

  /**
   * 코어가 놓은 배열·원본 가운데 지금 GPU에 없는 것(0.25.0 — 문맥 복구 뒤 앱이 다 주었는지 볼 때). 없으면 null.
   * 나눠 올리는 중이면 아직 올리지 않은 그물도 차례가 왔을 때 없을 것으로 셈한다. 0.38.0: 앱이 아직 주지 않은 pending 무늬(Texture3d.pending)도 textures에 든다
   */
  get restoreNeed(): ContextRestoreNeed | null {
    if (this.disposed || this.lost) return null;
    const n = this.renderer.restoreNeed(this.sceneRef);
    return n.meshes.length || n.textures.length ? n : null;
  }

  /**
   * 코어가 놓은 그물 배열을 다시 준다(0.25.0 — 문맥 복구 뒤). 그 그물에 지금 없는 놓은 배열만 받고(길이가 맞을 때) 그 그물 기록만 다시 만든다 —
   * 다른 속성 버퍼·다른 묶음은 그대로다. 준 배열은 올린 뒤 붙잡지 않는다(그물 객체에도 다시 넣지 않는다).
   * 나눠 올리는 중이라 아직 올리지 않은 그물이면 차례가 올 때 함께 올린다. 받은 것이 있으면 true
   */
  restoreMeshArrays(id: string, arrays: MeshArrays): boolean {
    if (!this.gpu || !this.sceneRef || !arrays) return false;
    const ok = this.renderer.restoreMeshArrays(id, arrays);
    if (ok) {
      this.invalidate();
      this.checkRestoreDone();
    }
    return ok;
  }

  /**
   * 코어가 놓은 무늬 원본을 다시 준다(0.25.0 — 문맥 복구 뒤, 그 무늬가 기다리는 동안만). 그림 파일 바이트(Uint8Array), 푼 그림(ImageBitmap — 다 쓰면 닫는다),
   * 또는 { data, bitmap, mime, width, height }. 처음 올릴 때와 같은 크기 한도로 풀어 올리고 다시 그린다. 원본은 붙잡지 않는다.
   * 올렸으면 true로 풀리는 약속(기다리는 무늬가 아니거나 풀지 못하면 false — 풀지 못하면 다시 기다린다).
   * 0.38.0: 장면에서 Texture3d.pending으로 둔 무늬(앱이 장면을 올린 뒤에 주는 그림 — 손질한 무늬 등)도 기다리는 무늬다. 문맥을 잃지 않아도 setScene 뒤 언제든 준다.
   * 코어가 붙잡지 않으므로 문맥을 잃었다 되찾으면 다시 기다린다(onContextRestore의 need.textures에 든다). 이미 올린 무늬를 바꾸는 길은 아니다(그때는 false)
   */
  restoreTexture(id: string, src: TextureSource): Promise<boolean> {
    if (!this.gpu) return Promise.resolve(false);
    // 0.29.0: 되찾은 뒤에는 무늬마다 다시 그리지 않으므로(푸는 무늬가 다 끝날 때 한 번) 풀지 못한 무늬가 마지막이었으면 여기서 그린다
    return this.renderer.restoreTexture(id, src).then((ok) => {
      if (!ok && !this.disposed && !this.lost && !this.renderer.texturesBusy) this.invalidate();
      return ok;
    });
  }

  /** 문맥을 되찾아 장면을 다시 올린 뒤: 다시 받을 것(없으면 빈 목록)을 알린다 */
  private emitRestore(): void {
    if (!this.restoreCbs.size) return;
    const need = this.renderer.restoreNeed(this.sceneRef);
    this.restoreEmitting = true;
    try {
      for (const cb of [...this.restoreCbs]) void cb(need);
    } finally {
      this.restoreEmitting = false;
    }
  }

  /**
   * 되찾은 뒤 다시 올리기가 다 끝났을 때 부른다(0.29.0 — 문맥을 되찾을 때마다 한 번, onContextRestore 알림들 뒤). 끝은 셋이 모두일 때다:
   * 나눠 올리기를 마쳤다(장면·그물 바꾸기), 다시 받을 것이 없다(restoreNeed가 null — 앱이 restoreMeshArrays·restoreTexture로 다 줬다),
   * 무늬를 다 풀어 올렸다(코어가 장면의 그림 바이트를 다시 푸는 것·앱이 준 원본을 푸는 것 — 풀지 못한 무늬는 끝난 것으로 본다).
   * 놓기 선택이 없고 무늬도 없으면 onContextRestore 알림들 바로 뒤에 같은 차례로 온다. 앱이 주지 않은 것이 남으면 오지 않는다(restoreNeed로 본다).
   * 끝나기 전에 다시 잃으면 그 되찾기의 알림은 없고 다음 되찾기가 끝날 때 온다. 그 사이 setScene으로 새 장면을 주면 그 장면을 다 올렸을 때다. 해제 함수를 돌려준다
   */
  onContextRestoreDone(cb: () => void): () => void {
    this.restoreDoneCbs.add(cb);
    return () => this.restoreDoneCbs.delete(cb);
  }

  /**
   * 문맥을 잃은 뒤 다시 올리기가 아직 끝나지 않았는지(0.29.0 — 잃는 순간 true, onContextRestoreDone을 부르기 직전에 false). 잃은 적이 없거나 없앤 뒤면 false
   */
  get restorePending(): boolean {
    return this.restoreWait && !this.disposed;
  }

  /**
   * 무늬를 하나 올렸거나 풀지 못했을 때 다시 그릴지(uploadMs = 그 올리기에 걸린 시간 — 렌더러 onTexture):
   * - 푸는 무늬가 다 끝났으면 곧 그린다(되찾을 때·처음 올릴 때 모두)
   * - 0.29.0 문맥을 되찾은 뒤 끝 알림 전(restoreWait)이면 그 사이에는 그리지 않는다
   * - 0.30.0 처음 올릴 때(setScene·setMesh로 새 무늬 — 다른 무늬를 아직 푸는 중): 이번 올리기의 첫 무늬는 곧 그리고(texLater — 앞 화면을 GPU가 끝냈으면),
   *   그 뒤로는 앞서 무늬로 다시 그린 때부터 TEXTURE_REDRAW_MS와 "그 뒤 그린 화면·무늬 올리기·GPU 울타리 기다림 가운데 가장 긴 시간 × TEXTURE_REDRAW_SLOW"
   *   가운데 긴 시간이 지났을 때만 그린다. 미룬 무늬는 그 시간이 되면(다음 무늬를 기다리지 않고) 함께 그린다.
   *   그리기가 비싼 큰 모형(소프트웨어 GPU 등)에서 무늬마다 그린 화면을 GPU가 끝낼 때까지 다음 무늬 올리기가 기다려, 다 보이기까지 몇 배가 걸렸다
   */
  private texRedraw(uploadMs: number): void {
    if (!this.renderer.texturesBusy) {
      this.texReset();
      this.invalidate();
      return;
    }
    if (this.restoreWait || this.disposed || this.lost) return;
    if (uploadMs > this.texSlow) this.texSlow = uploadMs;
    // 미룬 것이 있으면 그 때를 새 간격으로 다시 정한다(texLater가 간격·울타리를 본다)
    if (this.texTimer) clearTimeout(this.texTimer);
    this.texTimer = 0;
    this.texLater();
  }

  /** 0.30.0 무늬 다시 그리기 간격(ms) */
  private texGap(): number {
    return Math.max(TEXTURE_REDRAW_MS, TEXTURE_REDRAW_SLOW * this.texSlow);
  }

  /**
   * 0.30.0 무늬로 다시 그릴 때가 됐으면 그린다: 첫 무늬가 아니면 간격(texGap)이 지나야 하고, 무늬를 올리는 동안 마지막으로 그린 화면을 GPU가 아직 끝내지 않았으면(울타리)
   * TEXTURE_REDRAW_POLL_MS 뒤 다시 본다 — 소프트웨어 GPU는 그 화면을 그리는 동안 그림 풀기도 늦어져 다음 무늬 올리기(그 기다림을 재는 때)보다 이 때가 먼저 올 수 있다.
   * 기다렸으면 그 화면이 GPU에서 걸린 시간(울타리를 둔 때부터)도 간격에 셈한다
   */
  private texLater(): void {
    this.texTimer = 0;
    if (this.disposed || this.lost || this.restoreWait || !this.renderer.texturesBusy) return;
    const later = (ms: number): void => {
      this.texTimer = setTimeout(() => this.texLater(), Math.max(0, ms));
    };
    const now = performance.now();
    if (this.texDrawn && now - this.texDrawAt < this.texGap()) return later(this.texDrawAt + this.texGap() - now);
    const gl = this.gl;
    const s = this.texFence && typeof gl.getSyncParameter === 'function' ? gl.getSyncParameter(this.texFence, gl.SYNC_STATUS) : null;
    // 울타리가 아주 오래 안 끝나면(TEXTURE_REDRAW_FENCE_MAX_MS — 드라이버가 알리지 않는 때) 끝난 것으로 본다
    if (s !== null && s !== undefined && s === gl.UNSIGNALED && now - this.texFenceAt < TEXTURE_REDRAW_FENCE_MAX_MS) {
      this.texFenceWaited = true;
      return later(TEXTURE_REDRAW_POLL_MS);
    }
    if (this.texFenceWaited) {
      this.texFenceWaited = false;
      const gpu = now - this.texFenceAt;
      if (gpu > this.texSlow) this.texSlow = gpu;
      if (this.texDrawn && now - this.texDrawAt < this.texGap()) return later(this.texDrawAt + this.texGap() - now);
    }
    this.texNow(now);
  }

  /** 0.30.0 무늬로 지금 다시 그린다(그 때를 기억하고 올리기 시간은 새로 잰다) */
  private texNow(now: number): void {
    this.texDrawn = true;
    this.texDrawAt = now;
    this.texSlow = 0;
    if (this.texTimer) clearTimeout(this.texTimer);
    this.texTimer = 0;
    this.invalidate();
  }

  /**
   * 0.30.0 처음 올리며 무늬를 푸는 동안 그린 화면: 그 그리기 시간(ms — 앞 화면을 GPU가 끝내기를 기다린 시간이 들 수 있다)을 간격에 셈하고,
   * 화면 뒤에 GPU 울타리를 둔다(앞 울타리는 지운다 — fenceSync가 없으면 두지 않는다). 되찾는 동안(restoreWait)은 0.29.0 차례라 두지 않는다
   */
  private texAfterDraw(frameMs: number): void {
    if (this.restoreWait || !this.renderer.texturesBusy) return;
    if (frameMs > this.texSlow) this.texSlow = frameMs;
    const gl = this.gl;
    if (typeof gl.fenceSync !== 'function') return;
    if (this.texFence) gl.deleteSync(this.texFence);
    this.texFence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) ?? null;
    // 울타리까지의 명령을 GPU로 넘긴다(넘기지 않으면 끝났다는 알림이 오지 않을 수 있다)
    if (this.texFence) gl.flush();
    this.texFenceAt = performance.now();
    this.texFenceWaited = false;
  }

  /** 0.30.0 무늬 다시 그리기 모으기를 처음으로(무늬를 다 올렸을 때·새 장면·문맥을 잃었을 때·없앨 때) */
  private texReset(): void {
    this.texDrawn = false;
    this.texSlow = 0;
    if (this.texTimer) clearTimeout(this.texTimer);
    this.texTimer = 0;
    // 잃은 문맥의 울타리는 지울 수 없다(버리기만)
    if (this.texFence && !this.lost && !this.gl.isContextLost()) this.gl.deleteSync(this.texFence);
    this.texFence = null;
    this.texFenceWaited = false;
  }

  /** 0.29.0: 되찾은 뒤 다시 올리기가 다 끝났으면 끝 알림(잃은 동안·복구 알림을 부르는 동안·끝난 뒤에는 아무것도 하지 않는다) */
  private checkRestoreDone(): void {
    if (!this.restoreWait || this.lost || this.disposed || this.restoreEmitting) return;
    if (this.renderer.uploadBusy) return;
    const n = this.renderer.restoreNeed(this.sceneRef);
    if (n.meshes.length || n.textures.length) return;
    this.restoreWait = false;
    for (const cb of [...this.restoreDoneCbs]) cb();
  }

  /** mesh가 쓰는 정점 속성 배열 가운데 a와 같은 객체가 있는지 */
  private sameArrayIn(mesh: Mesh3d, a: ArrayBufferView): boolean {
    return a === mesh.positions || a === mesh.normals || a === mesh.colors || a === mesh.uvs || a === mesh.backUvs;
  }

  /** 장면 묶음 표(id → 묶음)를 장면 차례(그물 → 선분 → 점)로 다시 만든다 */
  private rebuildItems(): void {
    this.items.clear();
    const s = this.sceneRef;
    if (!s) return;
    for (const m of s.meshes) this.items.set(m.id, { kind: 'mesh', item: m });
    for (const l of s.lines) this.items.set(l.id, { kind: 'line', item: l });
    for (const p of s.points ?? []) this.items.set(p.id, { kind: 'point', item: p });
  }

  /** 그물 하나를 넣거나 바꾸거나 뺀 뒤: 장면에서 다시 셀 것(범위·마주 보기·원점 쓰기)과 화면 상태(그림자·단면 테두리·측정 미리 보기) */
  private sceneEdited(): void {
    const s = this.sceneRef!;
    this.bbList = s.meshes.filter((m) => hasBillboard(m));
    this.bbCamKey = '';
    const hadOrigin = this.usesOrigin;
    this.usesOrigin = s.meshes.some((m) => hasOrigin(m.origin)) || s.lines.some((l) => hasOrigin(l.origin)) || (s.points ?? []).some((p) => hasOrigin(p.origin));
    this.visLists = null;
    this.visBox = null;
    this.cutDirty = true;
    this.shadowVer++;
    // 0.50.0: 유한하지 않거나 한도 밖인 Scene3d.bounds는 쓰지 않는다(빈 상자·뒤집힌 상자는 0.49.0도 다시 셌다)
    const box = boundsOk(s.bounds) ? s.bounds! : sceneBounds(s);
    const moved = !sameBox(box, this.allBox);
    this.allBox = box;
    if (moved || hadOrigin !== this.usesOrigin) this.rebuildGrid();
    if (this.snapOpt) this.snapOpt.pfMemo = null;
    // 측정 미리 보기는 그 커서 자리에서 바뀐 그물로 다시 구한다(찍은 점은 그대로)
    this.rehover();
    if (moved && this.sec) this.emitSection();
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
    this.listenShiftRelease(false);
    this.listenMotion(false);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    clearTimeout(this.bvhTimer);
    clearTimeout(this.wheelTimer);
    clearTimeout(this.dwellTimer);
    this.texReset();
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
    this.cubeCbs.clear();
    this.issueCbs.clear();
    this.issues = [];
    this.restoreCbs.clear();
    this.lostCbs.clear();
    this.restoreDoneCbs.clear();
    this.restoreWait = false;
    this.releaseOpt = null;
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
    this.inferLock = null;
    this.lastLockable = null;
    this.tracker = null;
    this.bvhs = new WeakMap();
    this.parts = new WeakMap();
    this.boxes = new WeakMap();
    this.models = new WeakMap();
    this.cutCache = new WeakMap();
    this.bvhTasks = [];
    this.bvhHead = 0;
    this.visLists = null;
    // 0.49.0: 옮기던 움직임의 Promise는 false로 푼다(앱이 기다리던 끝 알림이 남지 않게)
    this.dropAnim();
    this.drag = null;
    this.touch = null;
    this.pointers.clear();
    // 0.32.0: 맡은 포인터는 알리지 않고 잊는다
    this.holds.clear();
    this.claimer = null;
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

  /** 카메라를 바로 바꾼다(움직임 없음 — 옮기던 움직임은 그만둔다: 그 Promise는 false). 저장된 보기로 날아가려면 flyTo */
  setCamera(c: CameraState): void {
    this.dropAnim();
    this.wheelAnchor = null;
    this.cam = { ...c, target: [...c.target] as V3 };
    this.invalidate();
  }

  /**
   * 0.48.0 주어진 카메라로 날아간다(앱의 홈 보기·저장된 보기·장면 탭): 다른 카메라 길과 같은 움직임(기본 0.32초, 같은 고르기 곡선)이고 animate 설정을 따른다
   * (주지 않으면 지금 animate — 'auto'면 움직임 줄이기 선호). 끌기·휠·다른 카메라 호출이 오면 옮기던 움직임을 끝 자리로 마치거나 바꾼다.
   *
   * 0.49.0 끝 알림과 길이: 돌려준 Promise는 카메라가 끝 자리에 닿으면 true로 풀린다 — 다 옮긴 그림을 그린 뒤, 움직이지 않으면(animate false·'auto'에서 줄이기 선호·
   * duration 0 이하) 곧바로, 끌기·휠·굴림·움직임 끄기가 옮기던 것을 끝 자리로 마치면 그때. 닿기 전에 다른 카메라 길(flyTo·fit·setView·뷰 큐브·키 등)·setCamera·
   * 새 장면 맞춤(setScene)·걷기 이동이 카메라를 바꾸거나 dispose하면 false로 풀린다(dispose 뒤 부르면 바로 false). 실패(reject)하지 않는다.
   * opts.duration: 움직이는 길이(ms, 기본 320 — 0.48.0 그대로, 60초에서 자름)
   */
  flyTo(c: CameraState, animate = this.animate, opts?: FlyToOptions): Promise<boolean> {
    return this.goto({ ...c, target: [...c.target] as V3 }, animate, moveDuration(opts?.duration));
  }

  /**
   * 0.48.0 카메라 움직임 설정을 바꾼다(Viewer3dOptions.animate와 같다 — true·false·'auto'). 'auto'면 움직임 줄이기 선호(prefers-reduced-motion: reduce)를
   * 듣기 시작하고 바뀔 때마다 따른다. 바뀐 값이 "움직이지 않음"이면 옮기던 움직임을 바로 끝 자리로 마친다. 뷰 큐브·키 F·1~7도 다음 누르기부터 따른다
   */
  setAnimate(v: AnimateSetting): void {
    if (this.disposed) return;
    this.motion = normalizeAnimate(v);
    this.listenMotion(this.motion === 'auto');
    this.motionChanged();
  }

  /** 0.48.0 지금 카메라를 부드럽게 옮기는지(설정이 'auto'면 움직임 줄이기 선호를 따른 값) — 앱이 제 카메라 움직임도 같은 값으로 정할 때 */
  get animate(): boolean {
    return resolveAnimate(this.motion, this.reduceMotion);
  }

  /** 0.48.0 카메라 움직임 설정(true·false·'auto' — 준 그대로) */
  get animateSetting(): AnimateSetting {
    return this.motion;
  }

  /** 'auto'일 때만 움직임 줄이기 선호를 듣는다(한 번만 — 이미 듣고 있으면 그대로) */
  private listenMotion(on: boolean): void {
    if (on === !!this.motionOff) return;
    if (!on) {
      this.motionOff?.();
      this.motionOff = null;
      this.reduceMotion = false;
      return;
    }
    const w = watchReducedMotion(typeof matchMedia === 'function' ? (q) => matchMedia(q) : null, (reduce) => {
      if (this.disposed) return;
      this.reduceMotion = reduce;
      this.motionChanged();
    });
    this.reduceMotion = w.reduce;
    this.motionOff = w.off;
  }

  /** 움직이지 않게 바뀌었으면 옮기던 카메라를 끝 자리로 마친다 */
  private motionChanged(): void {
    if (this.animate || !this.anim) return;
    this.finishAnim();
    this.invalidate();
  }

  /** 보이는 것 전체 보기. 0.49.0 끝 알림 Promise<boolean>(flyTo와 같다 — 끝 자리에 닿으면 true, 닿기 전에 끊기면 false) */
  fit(animate = this.animate): Promise<boolean> {
    return this.goto(fitCamera(this.cam, this.visibleBox(), this.cssW / this.cssH), animate);
  }

  /** 주어진 항목(그물·선·점 id) 가운데 보이는 것만 맞춰 보기. 맞출 것이 없으면 전체 보기. 0.49.0 끝 알림 Promise<boolean>(flyTo와 같다) */
  fitItems(ids: readonly string[], animate = this.animate): Promise<boolean> {
    let b = emptyBox();
    for (const id of new Set(ids)) {
      const it = this.items.get(id);
      if (it && this.visible(id, it.item.group)) b = unionBox(b, this.visibleBoundsOf(it));
    }
    if (boxIsEmpty(b)) return this.fit(animate);
    return this.goto(fitCamera(this.cam, b, this.cssW / this.cssH), animate);
  }

  /** 표준 뷰(위·아래·앞·뒤·왼쪽·오른쪽·남서/남동/북동/북서 등각)로 돌리고 전체 보기. 0.49.0 끝 알림 Promise<boolean>(flyTo와 같다) */
  setView(name: ViewName, animate = this.animate): Promise<boolean> {
    return this.setViewDir(VIEW_DIRS[name], animate);
  }

  /** 눈 방향(대상 → 눈)으로 돌리고 전체 보기(굴림·렌즈 이동은 0으로). 0.49.0 끝 알림 Promise<boolean>(flyTo와 같다) */
  setViewDir(dir: readonly number[], animate = this.animate): Promise<boolean> {
    const a = dirToAngles(dir, 0);
    const { roll: _r, shiftX: _x, shiftY: _y, ...base } = this.cam;
    void _r, _x, _y;
    return this.goto(fitCamera({ ...base, yaw: a.yaw, pitch: a.pitch }, this.visibleBox(), this.cssW / this.cssH), animate);
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
   * 0.42.0 instancing(기본 켬, 하한 INSTANCE_MIN = 8): 같은 그물(positions·normals·indices 등 같은 배열 객체를 함께 쓰는 Mesh3d — 자리 행렬·id·색만 다른 같은 정의의 자리)이
   * 하한 이상 보이면 자리마다 그리지 않고 균일 변수가 같은 자리끼리 그리기 한 번에 그린다(WebGL2 인스턴싱 — 자리 행렬은 예전과 같은 double 곱을 float32로 자리 자료 그림에 써서
   * 같은 그림). 불투명 면·외곽선 깊이·윤곽선·삼각형 변·숨은 점선을 모으고, 단면이 있을 때·반투명 면·묶음 안 구간(setHiddenRanges·highlightRanges)이 있는 그물·
   * 그림자를 쓸 때의 면은 0.41.0처럼 그물마다다. false면 끄고, { min }이면 하한(2 이상)을 바꾸고, true면 기본으로 켠다. 모은 묶음은 장면 차례와 다른 차례로 그리므로
   * 서로 다른 그물이 같은 깊이로 겹치는 곳(맞닿은 면, 반투명 모서리 선이 엇갈린 몇 화소)은 보이는 쪽·섞임이 끔과 다를 수 있다
   * 0.43.0 pbr(기본 켬): Mesh3d의 PBR 필드(normalTexture·roughness·metallic·metallicRoughnessTexture 등)를 쓴다. false·null이면 끄고 그 그물도 0.42.0 셰이더 그대로 그린다
   * (그림은 그대로 올라가 있어 다시 켜면 바로 쓴다 — 휴대 기기에서 조각 셰이더 몫을 줄일 때). PBR 필드가 없는 그물은 켬·끔과 상관없이 0.42.0과 같다
   * 0.51.0 culling(기본 켬): 화면 밖 잘라내기 — 그물(삼각형 정점과 윤곽선 끝점의 범위를 모형·겉모습 행렬로 옮긴 상자)이 시야 옆 네 평면 가운데 하나의 확실히 바깥이면
   * 면·윤곽선·삼각형 변·숨은 점선·외곽선·주변 가림 깊이·반투명 면을 그리지 않는다(src/cull.ts — 화면에 화소를 내지 않는 그물이라 그림은 끔과 같다. 굵은 선 반폭·
   * float32 셈 어긋남만큼 여유를 둔다). 그림자 깊이 그림·잘린 면 채우기는 그대로 모두 그린다. 뺀 그물 수는 stats.culled, 그리기 호출 수는 그만큼 준다. false·null이면 끈다
   * 0.52.0 merging(기본 'auto'): 서로 다른 작은 정적 그물 묶어 그리기 — 같은 꼴(법선 값 꼴·정점 색 유무·한쪽 면)의 그물(정점 65,536개·윤곽선 선분 65,536개 이하, 배열을 다른
   * 그물과 함께 쓰지 않고 무늬·뒷면·PBR·반투명이 아닌 것)을 장면 차례로 묶음 버퍼에 잇고 그 그물의 그물마다 버퍼·VAO는 놓는다(묶음 버퍼가 저장소 — 그물이 아주 많은 장면의
   * GL 객체 수·버퍼 바이트를 묶음 수만큼으로). 잇단 묶음 그물의 면·외곽선 깊이·윤곽선·숨은 점선은 그리기 한 번에(자리 행렬·색은 인스턴싱처럼 자리 자료 그림에서),
   * 그물마다 그리는 길(강조 윤곽선·구간·단면·그림자·반투명·잘린 면 채우기)은 묶음 버퍼의 그 그물 자리로 그린다. 'auto'는 묶을 수 있는 그물이 문턱(MERGE_AUTO_MIN = 2,000) 이상인
   * 장면만 켜고(장면을 올리는 걸음 안에서 굽는다 — 그보다 작은 장면은 0.51.0과 같다), true·'on'은 늘, false·null·'off'는 끈다(묶음 그물을 그물마다 버퍼로 되돌린다).
   * { min }이면 'auto' 문턱을 바꾼다. 그물마다 그리던 차례·값 그대로라 SwiftShader 그림은 같고, 기계 GPU는 셰이더가 자료에서 만든 행렬의 곱이 깊이 마지막 자리에서 달라
   * 모서리 선이 면과 겨루는 몇 화소가 다를 수 있다(인스턴싱과 같다). 바꾸거나 뺀 그물은 묶음에서 빠지고, 묶음 안 빠진 몫이 ¼을 넘으면 남은 그물로 다시 굽는다
   */
  setRenderOptions(o: {
    profiles?: boolean | { width?: number; color?: Rgba | string } | null;
    hiddenEdges?: boolean | number | { opacity?: number; shaded?: boolean; color?: Rgba | string | null } | null;
    edgeColor?: Rgba | string | null;
    instancing?: boolean | { min?: number } | null;
    pbr?: boolean | null;
    culling?: boolean | null;
    merging?: boolean | MergingMode | { mode?: MergingMode; min?: number } | null;
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
    if ('instancing' in o) {
      const i = o.instancing;
      const min = i && typeof i === 'object' && typeof i.min === 'number' && Number.isFinite(i.min) ? Math.max(2, Math.floor(i.min)) : INSTANCE_MIN;
      this.renderer.instancing = { on: i !== false && i !== null, min };
    }
    if ('pbr' in o) this.renderer.pbr = o.pbr !== false && o.pbr !== null;
    if ('culling' in o) this.renderer.culling = o.culling !== false && o.culling !== null;
    if ('merging' in o) {
      const g = o.merging;
      const obj = g && typeof g === 'object' ? g : null;
      const mode: MergingMode = g === true || g === 'on' ? 'on' : g === 'auto' ? 'auto' : obj ? (obj.mode === 'on' || obj.mode === 'off' ? obj.mode : 'auto') : 'off';
      const min = obj && typeof obj.min === 'number' && Number.isFinite(obj.min) ? Math.max(2, Math.floor(obj.min)) : MERGE_AUTO_MIN;
      this.renderer.setMerging({ mode, min });
    }
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

  /**
   * 0.49.0 주변 가림(SSAO, 기본 꺼짐 — SKP 45차 요청): 면이 만나는 구석·틈을 어둡게 해 깊이를 읽기 쉽게 한다. 음영 계열 모드(음영·음영+윤곽·단색·무늬 없음)의 불투명 면만,
   * 선·점·격자·반투명 면은 그대로. radius = 가림을 보는 거리(세계 단위, 기본 보이는 범위 대각선의 2%), intensity = 세기(기본 1, 0~4 — 0이면 끔).
   * true·{}면 기본 값, null·false면 끈다(끄면 그림·GL 호출이 0.48.0과 같다). 반 해상도로 셈하고 흐려 장치 화소에 곱한다(src/ao.ts).
   * 0.50.0 moving: 카메라를 옮기는 동안 'off'(가림 없이 — 멈춘 첫 그림부터 다시)·'low'(¼ 해상도). 기본 'keep'은 0.49.0과 같다
   */
  setAmbientOcclusion(o: AmbientOcclusionOptions | boolean | null): void {
    this.aoOpt = !o ? null : o === true ? {} : { ...o };
    this.invalidate();
  }

  /** 0.49.0 주변 가림 선택(준 그대로 — 끄면 null) */
  get ambientOcclusion(): AmbientOcclusionOptions | null {
    return this.aoOpt ? { ...this.aoOpt } : null;
  }

  /** 지금 보여 주기 선택(hiddenEdges는 불투명도, 0.8.0의 hiddenEdgesShaded·hiddenEdgeColor·edgeColor도, 0.42.0 instancing = { on, min }, 0.43.0 pbr, 0.51.0 culling, 0.52.0 merging = { mode, min }) */
  get renderOptions(): {
    profiles: { width: number; color: Rgba | string | null } | null;
    hiddenEdges: number;
    hiddenEdgesShaded: boolean;
    hiddenEdgeColor: Rgba | string | null;
    edgeColor: Rgba | string | null;
    instancing: { on: boolean; min: number };
    pbr: boolean;
    culling: boolean;
    merging: { mode: MergingMode; min: number };
  } {
    const r = this.renderOpts;
    return {
      profiles: r.profiles ? { ...r.profiles } : null,
      hiddenEdges: r.hiddenEdges,
      hiddenEdgesShaded: r.hiddenEdgesShaded,
      hiddenEdgeColor: r.hiddenEdgeColor,
      edgeColor: r.edgeColor,
      instancing: { ...this.renderer.instancing },
      pbr: this.renderer.pbr,
      culling: this.renderer.culling,
      merging: { ...this.renderer.merging },
    };
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
      hidden: (m) => this.hiddenOf(m),
      clips: this.sec ? (m) => this.itemClips(m) : undefined,
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
    this.dropAnim();
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
    if (!on) this.foldCube('option');
    this.opts.viewCube = on;
    this.cube.style.display = on ? '' : 'none';
    this.invalidate();
  }

  /**
   * 0.44.0 손가락 뷰 큐브 선택(Viewer3dOptions.viewCubeTouch와 같다 — false = 0.43.0처럼 손가락도 바로 고르기, true = 기본, { size, band }). 편 큐브는 접는다
   */
  setViewCubeTouch(t: boolean | ViewCubeTouchOptions): void {
    this.foldCube('option');
    this.opts.viewCubeTouch = cubeTouchOpts(t);
  }

  /** 0.44.0 손가락 뷰 큐브 선택(끔이면 false, 아니면 편 한 변·띠) */
  get viewCubeTouch(): false | Required<ViewCubeTouchOptions> {
    const t = this.opts.viewCubeTouch;
    return t === false ? false : { ...(t as Required<ViewCubeTouchOptions>) };
  }

  /** 0.44.0 손가락으로 뷰 큐브를 편 동안 true(viewCubeRect도 편 자리) */
  get viewCubeExpanded(): boolean {
    return this.cubeZoom > 0;
  }

  /**
   * 0.53.0 손가락 뷰 큐브를 펴고 접을 때마다 알림(STEP 61차 요청 — 앱이 pointerup·keyup에서 viewCubeExpanded를 다시 읽지 않아도 된다):
   * expanded = 바뀐 뒤 viewCubeExpanded, e.reason = 까닭(ViewCubeExpandReason), e.rect = 바뀐 뒤 viewCubeRect(측정 글상자 비키기 자리를 바로 고칠 때).
   * 펴고 접는 그 순간(사건 처리 안 — 그리기 전)에 부른다. 편 큐브에서 면을 고르면 카메라 움직임을 시작한 뒤 'pick'으로 접힌다. 바뀌지 않으면(이미 접힘·펴지 못함) 부르지 않는다.
   * dispose 뒤에는 부르지 않는다. 그만 받으려면 돌려준 함수를 부른다
   */
  onViewCubeExpandedChange(cb: (expanded: boolean, e: ViewCubeExpandEvent) => void): () => void {
    this.cubeCbs.add(cb);
    return () => this.cubeCbs.delete(cb);
  }

  /** 0.53.0 펴기·접기 알림을 보낸다 */
  private cubeNotify(reason: ViewCubeExpandReason): void {
    if (!this.cubeCbs.size) return;
    const expanded = this.cubeZoom > 0;
    for (const cb of [...this.cubeCbs]) cb(expanded, { reason, rect: this.viewCubeRect });
  }

  /** 0.44.0 지금 큐브 한 변(편 동안은 편 크기)과 누르는 자리 띠(편 동안만 손가락 띠 — 아니면 undefined = 0.43.0 띠) */
  private cubeSizeNow(): number {
    return this.cubeZoom || this.opts.viewCubeSize;
  }
  private cubeBandNow(): number | undefined {
    const t = this.opts.viewCubeTouch;
    return this.cubeZoom && t ? (t as Required<ViewCubeTouchOptions>).band : undefined;
  }

  /** 0.44.0 손가락 큐브를 편다(편 크기가 지금 큐브보다 크지 않으면 펴지 않고 false) */
  private unfoldCube(): boolean {
    const t = this.opts.viewCubeTouch;
    if (t === false || !this.opts.viewCube) return false;
    const z = Math.round(Math.min((t as Required<ViewCubeTouchOptions>).size, Math.min(this.cssW, this.cssH) - 2 * CUBE_INSET));
    if (!(z > this.opts.viewCubeSize)) return false;
    this.cubeZoom = z;
    this.cube.style.width = this.cube.style.height = `${z}px`;
    this.cubeHover = null;
    this.invalidate();
    this.cubeNotify('touch');
    return true;
  }

  /** 0.44.0 편 손가락 큐브를 접는다(0.53.0 reason — 접었으면 알림) */
  private foldCube(reason: ViewCubeExpandReason): void {
    if (!this.cubeZoom) return;
    this.cubeZoom = 0;
    this.cube.style.width = this.cube.style.height = `${this.opts.viewCubeSize}px`;
    this.cubeHover = null;
    this.invalidate();
    this.cubeNotify(reason);
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
    this.foldCube('option');
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
   * 0.54.0 고르기 후보 하나를 화면 덧그림에 미리 강조한다(SKP 56·57차 — 겹친 것 목록 줄에 초점·마우스가 갈 때 등, 고르기 알림 pick·pickCandidates 후보를 그대로):
   * 그물 면이면 맞은 삼각형과 같은 평면에서 변을 맞대고 이어진 삼각형(opts.ranges를 주면 그 삼각형 구간 — 앱이 아는 면)을 강조 색으로 옅게 칠하고 테두리를 긋고,
   * 선분·윤곽선은 그 선분, 점은 둘레 고리를 긋는다(키보드 고르기 후보 표식과 같은 꼴). 깊이를 따지지 않고 앞에 그린다(앞 면에 가린 후보도 보인다).
   * 고른 것·강조(highlight)·알림은 바꾸지 않는다. 숨긴 묶음·장면에 없는 묶음·단면의 잘린 면 후보는 그리지 않는다. null이면 지우고, 장면을 바꾸면 풀린다. 그림 저장에는 그리지 않는다
   */
  setPickPreview(p: Pick3d | null, opts: PickPreviewOptions = {}): void {
    if (this.disposed) return;
    const ok = !!p && typeof p === 'object' && typeof p.id === 'string' && Array.isArray(p.point) && p.point.length >= 3;
    if (!ok && !this.pickPrev) return;
    const ranges = Array.isArray(opts?.ranges) ? opts.ranges.map((r) => ({ start: Number(r?.start), count: Number(r?.count) })) : null;
    this.pickPrev = ok ? { pick: { ...p, point: [p.point[0], p.point[1], p.point[2]] }, ranges } : null;
    this.invalidate();
  }

  /** 0.54.0 지금 미리 강조한 고르기 후보(setPickPreview — 사본, 없으면 null) */
  get pickPreview(): Pick3d | null {
    const p = this.pickPrev?.pick;
    return p ? { ...p, point: [...p.point] as V3 } : null;
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
    // 0.50.0: 유한한 수 셋(한도 안)이 아닌 자리는 null과 같다(0.49.0은 NaN 행렬로 그려 보이지 않았다)
    this.marker = pos && okPoint3(pos) ? { pos: [pos[0]!, pos[1]!, pos[2]!], kind, opts } : null;
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
      if (q.items) {
        // 0.44.0 묶음 id는 통째로, 묶음 안 구간({ id, start, count, edges? })은 묶음·종류마다 합친다(통째로 준 묶음의 구간은 버린다)
        const ids = new Set<string>();
        let rg: Map<string, { prims: IndexRange[]; edges: IndexRange[] }> | null = null;
        for (const x of q.items) {
          if (typeof x === 'string') ids.add(x);
          else if (x && typeof x === 'object' && typeof x.id === 'string') {
            rg ??= new Map();
            let e = rg.get(x.id);
            if (!e) rg.set(x.id, (e = { prims: [], edges: [] }));
            (x.edges ? e.edges : e.prims).push({ start: Number(x.start), count: Number(x.count) });
          }
        }
        n.items = ids;
        if (rg) {
          for (const [id, e] of rg) {
            e.prims = mergeRanges(e.prims, RANGE_ANY);
            e.edges = mergeRanges(e.edges, RANGE_ANY);
            if (ids.has(id) || (!e.prims.length && !e.edges.length)) rg.delete(id);
          }
          if (rg.size) n.ranges = rg;
        }
      }
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
    if (s.ranges) {
      const out: SectionItemRange[] = [];
      for (const [id, e] of s.ranges) {
        for (const r of e.prims) out.push({ id, start: r.start, count: r.count });
        for (const r of e.edges) out.push({ id, start: r.start, count: r.count, edges: true });
      }
      st.ranges = out;
    }
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

  // ───── 0.44.0 묶음 안 구간 단면 ─────

  /** 지금 평면 목록이 앞에 본 것과 다른 객체들이면(평면을 새로 두거나 지움) 판을 늘린다 — 위치·뒤집기만 바꾼 평면은 같은 객체라 그대로 */
  private secList: Section[] = [];
  private secSync(): void {
    const a = this.sec, m = this.secMore, L = this.secList;
    let same = (a ? 1 : 0) + m.length === L.length && (!a || L[0] === a);
    for (let i = 0; same && i < m.length; i++) same = L[i + 1] === m[i];
    if (same) return;
    this.secList = a ? [a, ...m] : [];
    this.secRangeVer++;
    this.secHasRanges = this.secList.some((s) => !!s.ranges);
    this.visLists = null;
  }

  /** 묶음 안 구간 단면이 있는지(여러 단면 경로 — 구간을 준 평면은 늘 범위를 정한 평면이다) */
  private get secRanged(): boolean {
    this.secSync();
    return this.secHasRanges && this.multiSection;
  }

  /** 묶음의 구간 단면 갈래(그 묶음을 통째로 자르지 않는 평면이 그 묶음의 구간을 자를 때만 — 없으면 null). 평면 목록 판·묶음 객체가 같으면 다시 쓴다 */
  private secCutOf(it: Item): SecCut | null {
    if (!this.secRanged) return null;
    const item = it.item;
    const c = this.secCuts.get(item);
    if (c && c.ver === this.secRangeVer) return c.cut;
    const whole = this.secOf(item.id);
    const n = primCount(it);
    const ne = it.kind === 'mesh' && it.item.edges ? Math.floor(it.item.edges.length / 6) : 0;
    const prims: CutRanges[] = [], edges: CutRanges[] = [];
    this.allSecs().forEach((s, k) => {
      const r = s.ranges?.get(item.id);
      if (!r || whole.includes(k)) return;
      const p = mergeRanges(r.prims, n);
      if (p.length) prims.push({ bit: 1 << k, ranges: p });
      const e = ne ? mergeRanges(r.edges, ne) : [];
      if (e.length) edges.push({ bit: 1 << k, ranges: e });
    });
    let cut: SecCut | null = null;
    if (prims.length || edges.length) {
      const primMasks = new Set(partCuts(cutParts([{ start: 0, count: n, hi: false }], prims)));
      const edgeMasks = ne ? new Set(edges.length ? partCuts(cutParts([{ start: 0, count: ne, hi: false }], edges)) : [0]) : new Set<number>();
      cut = {
        prims,
        edges,
        primMask: cutMaskAt(cutRuns(prims)),
        edgeMask: cutMaskAt(cutRuns(edges)),
        primMasks,
        edgeMasks,
        masks: [...new Set([...primMasks, ...edgeMasks])].sort((a, b) => a - b),
      };
    }
    this.secCuts.set(item, { ver: this.secRangeVer, cut });
    return cut;
  }

  /**
   * 묶음의 구간 단면 갈래 목록(고르기 대리 묶음·단면 테두리): 갈래마다 평면 번호들과 그 갈래가 아닌 것·숨긴 것(setHiddenRanges)을 건너뛰는 판정.
   * 평면 목록 판과 숨김 판정이 같으면 같은 목록(같은 판정 함수 — 단면 테두리 캐시가 알아본다)
   */
  private secClasses(it: Item, cut: SecCut): SecClass[] {
    const r = this.rangeSel.get(it.item.id);
    const hid = r?.test ?? null, ehid = r?.eTest ?? null;
    const e = this.secClassCache.get(it.item);
    if (e && e.ver === this.secRangeVer && e.hid === hid && e.ehid === ehid) return e.list;
    const whole = this.secOf(it.item.id);
    const all = () => true;
    const list = cut.masks.map((m): SecClass => {
      const idx = [...new Set([...whole, ...cutBits(m)])].sort((a, b) => a - b);
      const prims = cut.primMasks.has(m);
      const test = !prims ? all : hid ? (i: number) => hid(i) || cut.primMask(i) !== m : (i: number) => cut.primMask(i) !== m;
      let eTest: ((i: number) => boolean) | null = null;
      if (it.kind === 'mesh' && it.item.edges) {
        if (!cut.edgeMasks.has(m)) eTest = all;
        else if (!cut.edges.length) eTest = ehid;
        else eTest = ehid ? (i: number) => ehid(i) || cut.edgeMask(i) !== m : (i: number) => cut.edgeMask(i) !== m;
      }
      return { mask: m, idx, test, eTest, prims };
    });
    this.secClassCache.set(it.item, { ver: this.secRangeVer, hid, ehid, list });
    return list;
  }

  /** 렌더러에 넘길 묶음 구간: 숨김·강조 구간(setHiddenRanges·highlightRanges)에 구간 단면 갈래(RangePart.cut)를 더한 것 */
  private renderParts(id: string): ItemParts | undefined {
    const base = this.rangeSel.get(id)?.parts ?? null;
    const it = this.secRanged ? this.items.get(id) : undefined;
    const cut = it ? this.secCutOf(it) : null;
    if (!it || !cut) return base ?? undefined;
    const e = this.secParts.get(it.item);
    if (e && e.ver === this.secRangeVer && e.base === base) return e.parts;
    const n = primCount(it);
    const full = (k: number): RangePart[] => [{ start: 0, count: k, hi: false }];
    const prims = cutParts(base ? base.prims : full(n), cut.prims);
    const ne = it.kind === 'mesh' && it.item.edges ? Math.floor(it.item.edges.length / 6) : 0;
    const edges = cut.edges.length ? cutParts(base?.edges ?? full(ne), cut.edges) : (base?.edges ?? null);
    const parts: ItemParts = { ver: ++this.rangeVer, prims, edges };
    this.secParts.set(it.item, { ver: this.secRangeVer, base, parts });
    return parts;
  }

  /** 고르기 목록의 묶음 → 원래 묶음(구간 단면 갈래 대리면 그 원래 묶음) */
  private baseOf<T extends AnyItem>(it: T): T {
    return (this.secWrap.get(it)?.base as T | undefined) ?? it;
  }

  /** 고르기 목록의 묶음을 자르는 세계 평면들(구간 단면 갈래 대리면 그 갈래 평면들) */
  private itemClips(it: AnyItem): Plane4[] {
    const w = this.secWrap.get(it);
    if (!w) return this.clipsFor(it.id);
    const all = this.allSecs();
    return w.cl.idx.filter((i) => i < all.length).map((i) => this.planeOf(all[i]!));
  }

  /** 고르기 목록의 묶음에서 건너뛸 기본 도형 판정(숨긴 구간 — 구간 단면 갈래 대리면 그 갈래가 아닌 것도) */
  private hiddenOf(it: AnyItem): ((i: number) => boolean) | null | undefined {
    const w = this.secWrap.get(it);
    return w ? w.cl.test : this.rangeSel.get(it.id)?.test;
  }

  /** 고르기 목록의 그물에서 건너뛸 윤곽선 판정 */
  private edgeHiddenOf(m: Mesh3d): ((i: number) => boolean) | null | undefined {
    const w = this.secWrap.get(m);
    return w ? w.cl.eTest : this.rangeSel.get(m.id)?.eTest;
  }

  /** 고르기 목록의 묶음을 자르는 평면 번호들(clipsOpts의 caps k → 평면) */
  private itemSecIdx(it: AnyItem): readonly number[] {
    return this.secWrap.get(it)?.cl.idx ?? this.secOf(it.id);
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
    // 0.44.0 평면을 새로 두었으면 구간 단면 갈래·고르기 목록을 새로
    this.secSync();
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

  /**
   * 나눠 올리기를 budgetMs만큼 이어 가고 진행을 알린다(다 올리면 끝 알림 뒤 그만). onProgress는 장면 나눠 올리기만 알린다
   * (0.11.0 그물 바꾸기 나눠 올리기는 알리지 않는다)
   */
  private pumpUpload(budgetMs: number): boolean {
    const scene = !!this.renderer.uploadProgress;
    const done = this.renderer.uploadSome(budgetMs);
    this.shadowVer++;
    if (scene) {
      const p = this.renderer.uploadProgress;
      const s = this.sceneRef;
      const total = s ? s.meshes.length + s.lines.length + (s.points?.length ?? 0) : 0;
      const cb = this.upload?.cb;
      if (!p) {
        if (this.upload) this.upload.cb = null;
        cb?.(total, total);
      } else cb?.(p.done, p.total);
    }
    if (!done) {
      // 0.54.0 묶어 그리기 조각을 기다려 멈춘 걸음이면 다음 걸음을 걸지 않는다(조각이 오면 onMergeReady가 다시 그린다)
      if (!this.renderer.uploadHeld) {
        // 0.51.0 다음 걸음 그리기는 올리기만으로 생긴 것(기다리는 그리기가 없었을 때 — 다른 까닭의 invalidate가 끼면 풀린다)
        const fresh = !this.raf;
        this.invalidate();
        if (fresh && this.raf) this.upOnly = true;
      }
    }
    // 0.29.0: 나눠 올리기를 마쳤으면 되찾은 뒤 끝 알림(다시 받을 것·풀 무늬가 남았으면 그것을 기다린다)
    else this.checkRestoreDone();
    return done;
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
      const segs = this.meshCut(m, planeToLocal(plane, model));
      if (!segs.length) continue;
      // 로컬 → 세계(double) → 장면 가운데 기준(교선은 그물마다 캐시하므로 새 배열에)
      const M = model;
      const out = new Float32Array(segs.length);
      for (let i = 0; i < segs.length; i += 3) {
        const x = segs[i]!, y = segs[i + 1]!, z = segs[i + 2]!;
        if (M) {
          out[i] = M[0]! * x + M[4]! * y + M[8]! * z + M[12]! - origin[0];
          out[i + 1] = M[1]! * x + M[5]! * y + M[9]! * z + M[13]! - origin[1];
          out[i + 2] = M[2]! * x + M[6]! * y + M[10]! * z + M[14]! - origin[2];
        } else {
          out[i] = x - origin[0];
          out[i + 1] = y - origin[1];
          out[i + 2] = z - origin[2];
        }
      }
      parts.push(out);
      total += out.length;
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

  /**
   * 그물과 로컬 평면의 교선(로컬 좌표, 고치지 않고 읽기만 한다). 같은 그물 객체·평면·숨긴 구간 판정이면 앞 결과를 다시 쓴다(0.11.0 — 그물 하나를
   * 바꾸거나 넣어도 다른 그물은 다시 자르지 않는다). 그물마다 평면 MAX_SECTION_PLANES개까지 기억한다
   */
  private meshCut(m: Mesh3d, plane: Plane4, skip?: ((i: number) => boolean) | null): Float32Array {
    // 0.44.0 skip을 주면 그 판정(구간 단면 갈래 — 갈래가 아닌 것·숨긴 것), 아니면 숨긴 구간
    const test = skip !== undefined ? skip : this.rangeSel.get(m.id)?.test;
    let list = this.cutCache.get(m);
    const hit = list?.find((e) => e.test === test && e.plane[0] === plane[0] && e.plane[1] === plane[1] && e.plane[2] === plane[2] && e.plane[3] === plane[3]);
    if (hit) return hit.segs;
    const segs = sectionSegments(m.positions, m.indices, plane, this.bvhFor('triangle', m.positions, m.indices, false), test);
    if (!list) this.cutCache.set(m, (list = []));
    list.push({ plane: [plane[0], plane[1], plane[2], plane[3]], test, segs });
    if (list.length > MAX_SECTION_PLANES) list.shift();
    return segs;
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
        // 0.44.0 구간 단면 갈래가 있는 그물은 이 평면이 드는 갈래마다(그 갈래의 삼각형만 자르고 그 갈래의 다른 평면들로 다시 자른다)
        const cut = this.secCutOf(it);
        const sets: { idx: readonly number[]; skip?: ((i: number) => boolean) | null }[] = cut
          ? this.secClasses(it, cut).filter((c) => c.prims).map((c) => ({ idx: c.idx, skip: c.test }))
          : [{ idx: this.secOf(m.id) }];
        if (!this.visible(m.id, m.group) || !boxStraddles(this.boundsOf(m), plane)) continue;
        for (const set of sets) {
          const idx = set.idx;
          if (!idx.includes(k)) continue;
          const model = this.modelOf(m);
          const segs = this.meshCut(m, planeToLocal(plane, model), set.skip);
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

  /**
   * 고르기 알림(빈 곳을 누르면 null). 돌려준 함수로 끊는다.
   * 0.22.0: 둘째 인자 { meshesOnly: true }면 그 알림에는 누른 자리의 그물 면만 고르기(pick(x, y, { meshesOnly: true })와 같은 고르기 — 선분·점·윤곽선은 고르지도 않고
   * 면을 가리지도 않는다, 그물 면이 없으면 null)를 준다. 같은 누르기의 다른 알림(선택 없이 단 것)은 그대로다. 같은 함수를 다시 달면 마지막 선택을 따른다.
   * 0.23.0: { throughTranslucent: true }면 반투명 그물의 면을 지나 고른 결과(pick(x, y, { throughTranslucent: true })와 같은 고르기)를 준다
   * 0.26.0: { front: true }면 그 알림의 사건(그 알림만의 사본)에 throughTranslucent만 뺀 같은 누르기의 고르기(PickEvent.front)를 함께 준다.
   * 차례: 한 누르기의 알림은 단 차례대로 부른다(같은 함수를 다시 달면 처음 자리, 끊었다 다시 달면 끝). front 없이 단 알림들은 모두 같은 사건 객체를 받는다
   */
  onPick(cb: (p: Pick3d | null, e: PickEvent) => void, opts?: OnPickOptions): () => void {
    this.pickCbs.set(cb, { meshesOnly: !!opts?.meshesOnly, through: !!opts?.throughTranslucent, front: !!opts?.front });
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
   * 0.32.0 앱이 포인터를 맡는 훅: 캔버스를 누를 때마다(마우스·펜·손가락, 앱이 보내는 합성 사건도) claim에 묻는다 — 누른 순간('down')에 묻고,
   * 맡지 않은 마우스·펜·한 손가락이 끌기 시작 거리를 넘는 순간('drag')에 한 번 더 묻는다. true를 돌려주면 그 포인터는 뗄 때까지 앱 것이다:
   * 코어는 그 포인터로 궤도·이동·걷기 둘러보기·핀치·고르기·측정 점 찍기·측정 미리 보기·두 번 누르기 판별을 하지 않고 움직임·떼기를 move·end로 넘긴다
   * ('drag'에서 맡으면 코어가 그 포인터에 pointercancel을 받은 것과 같다 — 0.31.0에 앱이 합성 pointercancel을 보낸 것과 같은 상태, 그 전에 시작한 일은 없다).
   * 캔버스는 맡은 포인터도 잡는다(setPointerCapture — 캔버스 밖으로 나가도 사건이 온다). 휠·키·뷰 큐브와 DOM 사건 전달은 그대로다.
   * 둘째 손가락: 앱이 손가락을 맡은 동안 새 손가락이 닿으면 그 손가락도 묻고, 맡지 않으면 코어가 앱이 맡은 손가락을 모두 돌려받아(end 'pinch')
   * 지금 자리에서 함께 누른 것으로 두 손가락 이동·핀치를 한다. 앱이 맡지 않은 손가락끼리는 0.31.0 그대로다(코어가 다루는 손가락이 있을 때 새 손가락을 맡으면
   * 코어는 제 손가락만으로 하던 것을 잇는다). 마우스·펜은 서로·손가락과 상관없다.
   * 함수만 주면 claim만 있는 처리기다. 다른 처리기를 주거나 null이면 앞 처리기가 맡은 포인터는 end('off')를 알리고 뗄 때까지 무시만 한다.
   * 주지 않거나 null이면 0.31.0과 같다
   */
  setPointerClaim(h: PointerClaimHandler | PointerClaimHandler['claim'] | null): void {
    if (this.disposed) return;
    const next = typeof h === 'function' ? { claim: h } : (h ?? null);
    const prev = this.claimer;
    if (next === prev) return;
    this.claimer = next;
    if (prev) for (const x of this.holds.detach(prev)) prev.end?.(heldOf(x), 'off');
  }

  /**
   * 0.32.0 누르고 있는 포인터를 지금 맡는다(앱 타이머의 길게 누르기 등 — 코어에는 그 포인터에 pointercancel이 온 것과 같다: 하던 궤도·이동을 그만두고
   * 두 손가락 몸짓이었으면 0.31.0 손가락 하나를 뗀 것처럼 남은 손가락은 뗄 때까지 무시한다). 그 뒤는 setPointerClaim에서 맡은 것과 같다(둘째 손가락 규칙 포함).
   * on을 주면 그 포인터의 move·end를 거기에, 주지 않으면 setPointerClaim 처리기에(없으면 알리지 않는다). 맡았거나 이미 앱 것이면 true,
   * 코어가 모르는 포인터(누르지 않았거나 이미 뗀 것)면 false. 맡은 포인터 id로 보낸 합성 사건도 코어는 앱 것으로 본다
   */
  claimPointer(pointerId: number, on?: PointerHoldHandler | null): boolean {
    if (this.disposed) return false;
    const held = this.holds.get(pointerId);
    if (held) {
      if (on !== undefined) held.on = on;
      return true;
    }
    const r = this.pointers.get(pointerId);
    if (!r) return false;
    this.coreUp(pointerId, true);
    this.holds.hold(pointerId, r.type, r.sx, r.sy, r.x, r.y, on === undefined ? this.claimer : on);
    return true;
  }

  /** 0.32.0 앱이 맡은 포인터 id(맡은 차례) */
  get heldPointers(): number[] {
    return this.holds.ids();
  }

  /**
   * 화면 점(캔버스 기준 CSS 화소)에서 고르기. 두 번째 인자는 포인터 종류 문자열 또는 { pointerType, edges, meshesOnly }:
   * pointerType이 'touch'면 터치 허용 거리(touchPickTolerance)로, 아니면 pickTolerance로. edges면 그물 윤곽선도 고른다(주지 않으면 pickEdges 선택).
   * 0.20.0: meshesOnly면 그물 면만(선분·점·윤곽선은 고르지 않고 면을 가리지도 않는다 — 측정의 축과 면의 교차가 다시 맞춰 볼 때와 같은 고르기)
   * 0.23.0: throughTranslucent면 반투명 그물의 면을 지나 그 뒤 불투명 그물 면을 고른다(불투명 면이 맞지 않으면 예전처럼 반투명 면)
   */
  pick(x: number, y: number, opts?: string | PickOptions): Pick3d | null {
    const o: PickOptions = typeof opts === 'string' ? { pointerType: opts } : (opts ?? {});
    const through = !!o.throughTranslucent;
    return (o.meshesOnly ? this.pickDetail(x, y, true, o.pointerType, false, false, true, through) : this.pickDetail(x, y, true, o.pointerType, o.edges, false, false, through))?.pick ?? null;
  }

  /**
   * 0.47.0 화면 점에 겹친 고르기 후보(차례대로 — AutoCAD 선택 돌리기·여러 CAD의 "다른 것 고르기" 목록). 첫째는 같은 선택의 pick(x, y, opts)와 같고,
   * 다음은 앞 후보(점·선분·윤곽선·그물 삼각형·잘린 면)를 걷어 내고 같은 규칙(차례 점 → 선분 → 윤곽선 → 그물 면, 허용 거리·가림·단면·숨긴 구간·반투명 지나기)으로
   * 다시 고른 것이다 — 그물은 앞 면 뒤의 것(같은 그물의 뒷면·뒤 묶음·앞 면에 가렸던 선분·점)이 차례로 나온다. 같은 그물의 같은 자리·같은 법선 삼각형은 하나로 센다.
   * 뷰어 상태를 바꾸지 않는다(앱이 제 목록 UI로 고르게 할 때 — 고른 것은 앱이 onPick 처리기에 넘긴다). 후보 수 한도 max(기본 16). 장면이 없거나 빈 곳이면 빈 배열.
   * 0.53.0 group(앱 묶음 열쇠): 같은 묶음은 가장 앞의 후보 하나로 세고 max는 묶음 수다(주지 않으면 0.47.0 그대로)
   */
  pickCandidates(x: number, y: number, opts?: string | PickCandidatesOptions): Pick3d[] {
    const o: PickCandidatesOptions = typeof opts === 'string' ? { pointerType: opts } : (opts ?? {});
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    const max = typeof o.max === 'number' && o.max >= 1 ? Math.floor(o.max) : PICK_CANDIDATES_MAX;
    return this.pickList(x, y, o.pointerType, o, max).map((d) => copyPick(d.pick));
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
   * 마우스를 올리면 표식 모양으로 종류를 보인다(끝점·꼭짓점 네모, 가운데 점 세모, 중심 ⊕, 0.38.0 접점('tangent') 동그라미 위 가로선, 그 밖의 앱 점 마름모). 측정 결과에 snapA·snapB가 실린다.
   * null(또는 빈 선택)이면 끈다. 장면을 바꿔도 남는다(점 목록은 앱이 장면에 맞춰 다시 준다)
   */
  setMeasureSnap(o: MeasureSnapOptions | null): void {
    const pts = o?.points ?? [];
    const inference = normalizeInference(o?.inference);
    if (!o || (!o.midpoints && o.edges === undefined && !pts.length && !o.pointsFor && !inference && !o.refine && !o.refineFace && !o.throughTranslucent)) this.snapOpt = null;
    else {
      const xyz = new Float64Array(pts.length * 3);
      const kinds: SnapKind[] = [], ids: (string | undefined)[] = [];
      // 차례 값(0.10.0): 한 점이라도 있으면 점마다 둔다(없는 점은 −Infinity — 어떤 한도에도 든다)
      let ord: Float64Array | null = null;
      let prio: Uint8Array | null = null;
      let raws: Int32Array | null = null, rawEdges: Uint8Array | null = null;
      let n = 0;
      for (const sp of pts) {
        const q = sp.point;
        // 유한하지 않은 점은 0.8.0부터 건너뛴다 — 0.50.0: 좌표 한도(COORD_LIMIT) 밖 점도(색인 가운데가 그 점으로 쏠려 다른 점의 정밀도를 잃는다)
        if (!q || !okPoint3(q)) continue;
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
        // 우선(0.41.0): 한 점이라도 'low'·'fallback'이면 점마다 둔다(없는 점은 0 = 보통)
        const pr = snapPriority(sp.priority);
        if (pr) {
          prio ??= new Uint8Array(pts.length);
          prio[n] = pr === 'low' ? 1 : 2;
        }
        // 기본 도형 번호(0.45.0): id와 함께 준 점이 하나라도 있으면 점마다 둔다(없는 점은 −1)
        const r = sp.id !== undefined ? snapRaw(sp.raw) : null;
        if (r !== null) {
          raws ??= new Int32Array(pts.length).fill(-1);
          raws[n] = r;
          if (sp.edges === true) (rawEdges ??= new Uint8Array(pts.length))[n] = 1;
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
      if (!o.refine) delete src.refine;
      if (!o.refineFace) delete src.refineFace;
      const so = (this.snapOpt = {
        midpoints: !!o.midpoints,
        edges: o.edges ?? null,
        pointsFor: o.pointsFor ?? null,
        src,
        pts: xyz.subarray(0, n * 3),
        kinds,
        ids,
        inference,
        index: null as SnapPointIndex | null,
        orders,
        prios: prio ? prio.subarray(0, n) : null,
        raws: raws ? raws.subarray(0, n) : null,
        rawEdges: rawEdges ? rawEdges.subarray(0, n) : null,
        limit,
        pfMemo: null,
        pfFirst: o.pointsForFirst === true,
        refine: o.refine ?? null,
        refineFace: o.refineFace ?? null,
        rfMemo: null,
        openMemo: new RefineMemo(),
        ofMemo: null,
        through: !!o.throughTranslucent,
        ends: o.refineEnds === true && !!o.refine,
        exact: o.refineSnapToExact === true && !!(o.refine || o.refineFace),
        lens: o.openEdgeLens !== false && !!o.refine,
      });
      // 앱 점이 많으면(0.9.0) 색인을 쉬는 틈에 미리 만든다(30만 개에 0.1초쯤 — 첫 마우스 이동에서 멈칫하지 않게)
      if (n >= SNAP_INDEX_MIN) {
        so.index = new SnapPointIndex(so.pts, ids, orders);
        setTimeout(() => {
          if (this.snapOpt === so && !this.disposed) so.index?.build();
        }, 0);
      }
      if (o.edges) this.scheduleBvh();
    }
    // 0.10.0: 추론 잠금·나란함 기준 선분은 붙잡기 선택과 함께 새로
    this.inferLock = null;
    this.lastLockable = null;
    this.parallelRef = null;
    this.trackDirRef = null;
    this.trackDirAsked = null;
    this.parallelOwn = null;
    this.parallelAsked = null;
    // 0.16.0: 끌어온 점도 새로(끄면 상태가 없다)
    this.clearTrack();
    this.tracker = this.snapOpt?.inference?.track ? new MeasureTracker() : null;
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

  /**
   * 다듬기 기억만 비운다(0.21.0): refine·refineFace가 돌려준 결과의 기억(0.14.0 바로 앞 입력, 0.15.0부터 커서 광선을 뺀 입력 열쇠의 기억 — 열린 후보·'axisEdge'·
   * 'axisFace', 0.21.0 'onFace')을 모두 잊고, 측정 미리 보기가 보이면 그 자리에서 다시 구한다(그때 앱 함수를 다시 부른다).
   * 찍은 점·잠금·끌어온 점·나란함 기준 선분·붙잡기 선택·한도·pointsFor 기억은 그대로다. 앱이 다듬기에 쓰는 자료를 나중에 받았을 때(곡면 정의를 나눠 받기 등)
   * setMeasureSnap을 다시 주지 않고(잠금·끌어온 점이 풀린다) 쓴다. 이미 찍은 점은 바꾸지 않는다. 붙잡기가 꺼져 있으면 아무것도 하지 않는다.
   * 지운 기억 항목 수(바로 앞 입력 기억은 하나로 센다)를 돌려준다
   */
  clearMeasureRefine(): number {
    const so = this.snapOpt;
    if (!so) return 0;
    const n = so.openMemo.clear() + (so.rfMemo ? 1 : 0) + (so.ofMemo ? 1 : 0);
    so.rfMemo = null;
    so.ofMemo = null;
    this.rehover();
    return n;
  }

  /**
   * pointsFor 기억만 비운다(0.38.0): 바로 앞 pointsFor 호출의 고르기와 결과(0.10.0 — 같은 고르기면 다시 쓴다)를 잊고, 측정 미리 보기가 보이면 그 자리에서 다시 구한다
   * (그때 앱 함수를 다시 부른다). 앱 점을 정하는 앱 자료가 바뀌었을 때(곡선 정의를 나눠 받기 등) setMeasureSnap을 다시 주지 않고(잠금·끌어온 점이 풀린다) 쓴다.
   * 찍은 점·잠금·끌어온 점·나란함 기준 선분·붙잡기 선택·한도·다듬기 기억(clearMeasureRefine)은 그대로다. 첫 점에 따라 다른 점은 pointsForFirst가 맡는다(첫 점이 바뀌면 저절로 다시 부른다).
   * 비운 기억이 있었으면 true, 없었거나 붙잡기가 꺼져 있으면 false
   */
  clearMeasurePointsFor(): boolean {
    const so = this.snapOpt;
    if (!so) return false;
    const had = !!so.pfMemo;
    so.pfMemo = null;
    this.rehover();
    return had;
  }

  /**
   * 측정 점 고르기의 반투명 그물 너머 고르기만 바꾼다(0.24.0 — setMeasureSnap의 throughTranslucent와 같은 값). 측정 중 반투명 보기를 켜고 끌 때
   * setMeasureSnap을 다시 주면 Shift·앱 단추 잠금, 끌어온 점, 나란함 기준 선분이 풀리므로 그 대신 쓴다. 찍은 점·미리 보기 잠금·끌어온 점·나란함 기준·
   * 다듬기 기억(refine·refineFace — 입력에 면이 들어 있어 고른 면이 바뀌면 열쇠가 다르다)·pointsFor 기억·붙잡기 한도·다른 붙잡기 선택은 그대로 두고,
   * 측정 미리 보기가 보이면 그 자리에서 다시 구한다(다음 미리 보기부터 새 값). measureSnap.throughTranslucent도 따라 바뀐다(끄면 그 필드를 뺀다).
   * 끄더라도 붙잡기는 켜진 채다(이것만 줘서 켠 붙잡기도 — 끄려면 setMeasureSnap(null)). 붙잡기가 꺼져 있으면 아무것도 하지 않고 false를 돌려준다
   * (그때는 setMeasureSnap({ throughTranslucent: true })로 켠다). 붙잡기가 켜져 있으면 true
   */
  setMeasurePickThrough(on: boolean): boolean {
    const so = this.snapOpt;
    if (!so) return false;
    const next = !!on;
    if (so.through === next) return true;
    so.through = next;
    if (next) so.src.throughTranslucent = true;
    else delete so.src.throughTranslucent;
    this.rehover();
    return true;
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
    if (r.inference) {
      const inf = { ...(r.inference as NormalizedInference) };
      if (inf.track) inf.track = { ...inf.track };
      if (inf.trackDirs && inf.trackDirs !== true) inf.trackDirs = { ...inf.trackDirs };
      r.inference = inf;
    }
    return r;
  }

  /**
   * 측정 중 커서 아래 붙잡을 점과 그 종류(0.8.0 — 앱이 상태 줄에 "끝점·가운데 점·중심"을 보일 때), 축 붙잡기면 그 축(0.9.0).
   * 측정 중이 아니거나 없으면 null
   */
  get measureHoverSnap(): MeasureHoverSnap | null {
    const h = this.measuring ? this.measureHover : null;
    if (!h) return null;
    return this.hoverSnapOf(h);
  }

  /**
   * 0.46.0 키보드로 3D 붙잡기·고르기(기본 꺼짐 — 끄면 키·그리기·포인터 처리가 0.45.0 그대로). 켜면 3D 보기(캔버스)에 초점이 있을 때(handleKey로 넘긴 키도 대상이 캔버스일 때만):
   * - 화살표: 가상 커서를 켠다(처음 — 캔버스 가운데) · 옮긴다(step 화소, Shift와 함께면 bigStep). 측정 모드면 그 자리에서 마우스 미리 보기와 같은 규칙으로 붙잡을 점을 보인다
   * - Tab·Shift+Tab(커서가 켜진 측정 모드에서만): 그 자리의 붙잡기 후보를 차례로 돌린다(measureCandidates와 같은 차례 — AutoCAD 객체 스냅 Tab 돌리기).
   *   커서를 켜기 전·끈 뒤 Tab은 브라우저 초점 이동 그대로다.
   *   0.47.0: 고르기 모드에서도 커서가 켜져 있으면 그 자리에 겹친 고르기 후보(pickCandidates 차례 — AutoCAD 선택 돌리기)를 돌리고 Enter로 그 후보를 고른다
   *   (pickCycle — 기본 켬, false면 0.46.0처럼 고르기 모드의 Tab은 초점 이동). 지금 후보가 선분·윤곽선·점이면 화면 덧그림에 강조 색으로 표시한다
   *   (0.54.0 pickCycle.facePreview를 켜면 그물 면 후보도 그 면을 — setPickPreview와 같은 표식). 0.54.0 pickName이면 알림 글의 고른 것 이름을 앱 이름으로
   * - Enter: 측정 모드면 지금 후보를 측정 점으로 찍고(onMeasure), 아니면 그 자리를 누른 것처럼 고른다(onPick — pointerType 'keyboard', clicks 1, Shift+Enter면 shiftKey).
   *   커서가 꺼져 있으면 켠다
   * - Esc: 뷰 큐브 접기·측정 지우기(뷰어 Esc)가 먼저, 지울 것이 없으면 커서를 끈다. 포인터가 캔버스에서 움직이거나(4화소 이상) 누르거나 캔버스가 초점을 잃어도 끈다
   * 걷기 중에는 받지 않는다(화살표는 걷기). 키는 keys로 바꾸거나 끈다. true = 기본값, false·null = 끈다(켜진 커서도 알리지 않고 끈다)
   */
  setKeyboardSnap(o: KeyboardSnapOptions | boolean | null): void {
    if (!o) {
      this.keyEnd(false);
      this.keySnap = null;
      return;
    }
    const src: KeyboardSnapOptions = o === true ? {} : { ...o };
    const pos = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d);
    const pc = src.pickCycle;
    this.keySnap = {
      step: pos(src.step, KEY_STEP_PX),
      bigStep: pos(src.bigStep, KEY_BIG_STEP_PX),
      keys: normalizeKeySnapKeys(src.keys),
      announce: typeof src.announce === 'function' ? src.announce : null,
      src,
      pickCycle:
        pc === false || pc === null
          ? null
          : typeof pc === 'object'
            ? {
                edges: pc.edges,
                meshesOnly: !!pc.meshesOnly,
                throughTranslucent: !!pc.throughTranslucent,
                ...(typeof pc.group === 'function' ? { group: pc.group } : {}),
                // 0.54.0 그물 면 후보 표식(켤 때만)·앱 면 구간
                ...(pc.facePreview === true ? { facePreview: true } : {}),
                ...(typeof pc.faceRanges === 'function' ? { faceRanges: pc.faceRanges } : {}),
              }
            : {},
      msgs: typeof src.messages === 'function' ? src.messages : keySnapMessages(src.messages),
      pickName: typeof src.pickName === 'function' ? src.pickName : null,
    };
    // 고르기 모드에서 켜진 커서는 새 pickCycle로 그 자리를 다시 구한다(알리지 않는다 — 측정 모드는 0.46.0 그대로 두어 차례를 지킨다)
    if (this.keyCur && !this.measuring) {
      this.keyRecompute();
      this.invalidate();
    }
  }

  /** 지금 키보드 붙잡기 선택(0.46.0 — 걸음·키 표는 기본값을 채운 꼴, 꺼져 있으면 null) */
  get keyboardSnap(): (KeyboardSnapOptions & { step: number; bigStep: number; keys: Record<KeySnapAction, string[]> }) | null {
    const k = this.keySnap;
    if (!k) return null;
    const keys = {} as Record<KeySnapAction, string[]>;
    for (const [a, l] of Object.entries(k.keys) as [KeySnapAction, readonly string[]][]) keys[a] = [...l];
    return { ...k.src, step: k.step, bigStep: k.bigStep, keys };
  }

  /** 가상 커서(0.46.0 — 켜져 있을 때 자리·모드·후보 차례와 수, 아니면 null). 앱 키가 화살표를 함께 쓸 때 커서가 켜졌는지 본다 */
  get keyboardCursor(): KeyboardCursorState | null {
    const c = this.keyCur;
    if (!c) return null;
    const count = this.keyCount(c);
    return { x: c.x, y: c.y, mode: this.keyMode, index: count ? c.index : 0, count };
  }

  /**
   * 0.46.0 화면 자리(캔버스 CSS 화소)의 측정 붙잡기 후보 목록(차례대로 — 가상 커서의 Tab 차례와 같다). 첫째는 그 자리 마우스 미리 보기(measureHoverSnap)와 같고,
   * 다음은 앞 후보 자리를 빼고 같은 규칙(차례·우선·다듬기·잠금·구간 단면)으로 고른 것, 점 붙잡기가 다하면 선 추론 하나와 붙잡지 않은 자리다. 측정 모드가 아니면 빈 배열.
   * 뷰어 상태(미리 보기·찍은 점·기준 선분)를 바꾸지 않는다 — 앱이 제 UI(목록·단추)로 고르게 할 때 쓴다(고른 것은 commitMeasureCandidate로 찍는다).
   * pointsFor·다듬기 앱 함수는 미리 보기처럼 부를 수 있다(같은 입력이면 기억을 다시 쓴다)
   */
  measureCandidates(x: number, y: number, o: MeasureCandidatesOptions = {}): MeasureHoverSnap[] {
    if (!this.measuring || !Number.isFinite(x) || !Number.isFinite(y)) return [];
    const max = typeof o.max === 'number' && o.max >= 1 ? Math.floor(o.max) : KEY_CANDIDATES_MAX;
    return this.keyCandidates(x, y, o.pointerType || 'mouse', max).map((e) => this.hoverSnapOf(e.pick));
  }

  /**
   * 0.46.0 화면 자리의 측정 후보 가운데 index번째(measureCandidates와 같은 차례)를 측정 점으로 찍는다(누르기와 같다 — onMeasure). 찍었으면 true,
   * 측정 모드가 아니거나 그 차례의 후보가 없으면 false
   */
  commitMeasureCandidate(x: number, y: number, index: number, o: MeasureCandidatesOptions = {}): boolean {
    if (!this.measuring || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isInteger(index) || index < 0) return false;
    const max = Math.max(index + 1, typeof o.max === 'number' && o.max >= 1 ? Math.floor(o.max) : KEY_CANDIDATES_MAX);
    const e = this.keyCandidates(x, y, o.pointerType || 'mouse', max)[index];
    if (!e) return false;
    this.refsSet(e.after);
    this.commitMeasure(e.pick);
    // 가상 커서가 켜져 있으면 그 자리 미리 보기를 다시 구한다(Enter로 찍은 뒤와 같다 — 알리지 않는다)
    if (this.keyCur) this.keyRecompute();
    return true;
  }

  /** 측정 점 고르기 결과 → 앱에 주는 미리 보기 붙잡기(복사본) */
  private hoverSnapOf(h: MeasurePick): MeasureHoverSnap {
    const r: MeasureHoverSnap = { point: [...h.p] as V3, snap: h.kind };
    if (h.axis) r.axis = h.axis;
    if (h.direction) r.direction = [...h.direction] as V3;
    if (h.locked) r.locked = true;
    if (h.edge) r.edge = [[...h.edge[0]] as V3, [...h.edge[1]] as V3];
    if (h.from) {
      r.from = [...h.from] as V3;
      if (h.fromSnap) r.fromSnap = h.fromSnap;
    }
    if (h.refined) r.refined = true;
    if (h.segment) {
      r.segment = copySegment(h.segment);
      if (h.other) r.other = copySegment(h.other);
    }
    if (h.trackFrom) r.trackFrom = [...h.trackFrom] as V3;
    if (h.trackOther) r.trackOther = copyGuide(h.trackOther);
    if (h.face) r.face = copyFace(h.face);
    if (h.trackGuide) r.trackGuide = copyDirLine(h.trackGuide);
    return r;
  }

  /**
   * 측정 추론 잠금(0.10.0 — 터치처럼 Shift가 없을 때 앱 단추로): true = 지금 미리 보기의 방향 추론(축·나란함·수직)을 잠근다
   * (0.12.0부터 커서가 첫 점을 지나는 선분 위의 점 붙잡기 — 모서리 끝에서 그 모서리를 따라 가리킨 끝점·가운데 점·교차점 — 면 그 선분 방향,
   * 미리 보기에 잠글 방향이 없거나 커서가 캔버스를 떠났으면 첫 점을 찍은 뒤 마지막으로 본 방향),
   * 'x'·'y'·'z' = 그 축 방향으로 잠근다(첫 점을 찍기 전에 줘도 된다), false·null = 푼다. 잠갔으면 true를 돌려준다.
   * 0.12.0: { direction, edge?, kind? } = 앱이 정한 방향(모서리 방향 등 — 첫 점을 찍기 전에 줘도 된다). kind가 없으면 축과 나란한 방향은 그 축,
   * 아니면 'parallel'. 방향이 길이 0·수가 아니거나 'axis'인데 축과 나란하지 않으면 잠그지 않고 false(InferenceLockInput)
   * 잠그면 첫 점을 지나는 그 선 위에만 찍고(커서가 꼭짓점 같은 점 붙잡기 위면 그 점을 선에 수직으로 내린 자리), 두 점째를 찍거나
   * 측정을 지우거나(clearMeasure·측정 모드 끄기·장면 바꾸기) 붙잡기 선택을 바꾸면 풀린다. 측정 모드이고 setMeasureSnap이 켜져 있어야 한다.
   * Shift 잠금(setMeasureSnap({ inference: { lock: true } }))과 같은 상태라 이 함수로 Shift 잠금도 푼다
   */
  setMeasureInferenceLock(lock: boolean | SnapAxis | InferenceLockInput | null): boolean {
    if (lock === false || lock === null || lock === undefined) {
      this.releaseLock();
      return false;
    }
    if (!this.snapOpt || !this.measuring) return false;
    const l: InferenceLock | null =
      lock === true
        ? this.measurePts.length === 1
          ? (this.hoverLock(this.measureHover) ?? this.lastLockable)
          : null
        : lock === 'x' || lock === 'y' || lock === 'z'
          ? axisLock(lock)
          : typeof lock === 'object'
            ? directionLock(lock)
            : null;
    if (!l) return false;
    this.inferLock = { ...l, source: 'api' };
    this.rehover();
    return true;
  }

  /**
   * 미리 보기에서 잠글 방향(0.10.0 방향 추론 — 축·나란함·수직, 0.12.0부터 첫 점을 지나는 선분 위의 점 붙잡기면 그 선분 방향).
   * Shift·setMeasureInferenceLock(true)가 같은 판정을 쓴다
   */
  private hoverLock(h: MeasurePick | null | undefined): InferenceLock | null {
    // 0.29.0: 끌어온 점 안내 선이 첫 점을 지나는 선과 만나는 점(trackDirs { meets })은 snap이 안내 종류라 그 선(lineLock — 축·첫 점의 나란함·선분 방향)으로 잠근다
    if (h?.trackFrom && h.lineLock && (h.kind === 'parallel' || h.kind === 'perpendicular')) return h.lineLock;
    return lockFromSnap(h) ?? h?.lineLock ?? null;
  }

  /**
   * 지금 미리 보기에서 잠글 수 있는 방향(0.12.0 — Shift·setMeasureInferenceLock(true)가 잠글 것: 방향 추론, 첫 점을 지나는 선분 위의 점 붙잡기면
   * 그 선분 방향). 앱이 상태 줄에 "Shift로 잠그기"를 보일 때 measureHoverSnap.direction 대신 쓴다. 잠갔으면 잠근 방향, 첫 점 전·측정 중이 아니거나 없으면 null.
   * setMeasureInferenceLock(true)는 이것이 없으면 첫 점 뒤 마지막으로 본 방향을 잠근다
   */
  get measureHoverLock(): InferenceLock | null {
    if (!this.measuring || this.measurePts.length !== 1) return null;
    const l = this.hoverLock(this.measureHover);
    if (!l) return null;
    const r: InferenceLock = { kind: l.kind, direction: [...l.direction] as V3 };
    if (l.axis) r.axis = l.axis;
    if (l.edge) r.edge = [[...l.edge[0]] as V3, [...l.edge[1]] as V3];
    return r;
  }

  /** 지금 측정 추론 잠금(0.10.0 — 종류·단위 방향·축·기준 선분·잠근 길). 없으면 null */
  get measureInferenceLock(): MeasureInferenceLock | null {
    const l = this.inferLock;
    if (!l) return null;
    const r: MeasureInferenceLock = { kind: l.kind, direction: [...l.direction] as V3, source: l.source };
    if (l.axis) r.axis = l.axis;
    if (l.edge) r.edge = [[...l.edge[0]] as V3, [...l.edge[1]] as V3];
    return r;
  }

  /** 추론 잠금을 푼다(있으면 미리 보기를 다시 구한다) */
  private releaseLock(): void {
    if (!this.inferLock) return;
    this.inferLock = null;
    this.rehover();
  }

  /**
   * Shift 눌림(0.10.0 — 포인터 이동의 shiftKey, 캔버스·handleKey의 Shift keydown·keyup): 누르는 순간 지금 미리 보기의 방향 추론
   * (0.12.0부터 첫 점을 지나는 선분 위의 점 붙잡기면 그 선분 방향 — hoverLock)을 잠그고
   * (setMeasureSnap({ inference: { lock: true } })일 때만), 떼면 Shift로 잠근 것을 푼다. 누르고 있는 동안 창 keyup·blur도 들어 떼기를 놓치지 않는다
   */
  private setShift(down: boolean): void {
    if (down === this.shiftDown) return;
    this.shiftDown = down;
    const on = !!this.snapOpt?.inference?.lock;
    this.listenShiftRelease(down && on);
    if (down) {
      if (!on || this.inferLock || !this.measuring || this.measurePts.length !== 1) return;
      const l = this.hoverLock(this.measureHover);
      if (!l) return;
      this.inferLock = { ...l, source: 'shift' };
      this.rehover();
    } else if (this.inferLock?.source === 'shift') this.releaseLock();
  }

  private listenShiftRelease(on: boolean): void {
    if (on === !!this.shiftRelease) return;
    if (!on) {
      this.shiftRelease!();
      this.shiftRelease = null;
      return;
    }
    const up = (e: KeyboardEvent): void => {
      if (e.key === 'Shift' || !e.shiftKey) this.setShift(false);
    };
    const blur = (): void => this.setShift(false);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur);
    this.shiftRelease = () => {
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', blur);
    };
  }

  /** 측정 모드(두 점 거리·dx dy dz). 끄면 측정도 지운다 */
  setMeasureMode(on: boolean): void {
    this.measuring = on;
    this.canvas.style.cursor = on ? 'crosshair' : '';
    if (!on) this.clearMeasure();
    // 0.46.0: 가상 커서가 켜져 있으면 새 모드로 그 자리를 다시 구한다(알리지 않는다)
    if (this.keyCur) this.keyRecompute();
    this.invalidate();
  }

  get measureMode(): boolean {
    return this.measuring;
  }

  /** 지금 찍힌 측정 점 수(0~2) */
  get measurePointCount(): number {
    return this.measurePts.length;
  }

  /**
   * 찍은 측정 점(0.12.0 — 0~2개, 찍은 차례, 복사본): 세계 좌표·붙잡은 종류·축·방향·잠금(MeasurePoint). 첫 점만 찍었을 때(measurePointCount === 1)
   * 앱이 그 점에서 잠글 방향을 정하거나(모서리 방향 등 — setMeasureInferenceLock({ direction })) 표시를 붙일 때 쓴다. 두 점이면 measurement()의 a·b와 같은 점
   */
  get measurePoints(): MeasurePoint[] {
    return this.measurePts.map((p) => {
      const s = this.measureSnaps.get(p);
      const r: MeasurePoint = { point: [p[0], p[1], p[2]], snap: s?.kind ?? null };
      if (s?.axis) r.axis = s.axis;
      if (s?.direction) r.direction = [...s.direction] as V3;
      if (s?.locked) r.locked = true;
      if (s?.refined) r.refined = true;
      if (s?.segment) {
        r.segment = copySegment(s.segment);
        if (s.other) r.other = copySegment(s.other);
      }
      if (s?.trackFrom) r.trackFrom = [...s.trackFrom] as V3;
      if (s?.trackOther) r.trackOther = copyGuide(s.trackOther);
      if (s?.face) r.face = copyFace(s.face);
      if (s?.trackGuide) r.trackGuide = copyDirLine(s.trackGuide);
      return r;
    });
  }

  /**
   * 끌어온 점(0.16.0 — setMeasureSnap({ inference: { track } })를 켰을 때, 새것이 앞, 최근 셋까지, 복사본): 마우스·펜이 점 붙잡기 위에 머물러 기억한 점과
   * 앱이 setMeasureTrackPoints로 준 점. 이 점들을 지나는 X·Y·Z 축과 첫 점 축 위에서 이 점과 나란한 자리에도 붙잡는다. 꺼져 있으면 빈 배열
   */
  get measureTrackPoints(): V3[] {
    return this.tracker?.points ?? [];
  }

  /**
   * 끌어온 점을 앱이 정한다(0.16.0 — 터치처럼 머무르기가 없을 때 길게 누르기·단추로 고른 점, 앞이 가장 최근, 셋까지, 수 셋이 아닌 것은 버린다).
   * null·빈 배열이면 지운다. 측정 모드이고 inference.track을 켰을 때만 되고, 기억한 수를 돌려준다(아니면 0 — 상태를 만들지 않는다).
   * 머무르기로 기억한 점과 같은 목록이라 그 뒤 머무르기는 이 목록 앞에 더한다
   */
  setMeasureTrackPoints(points: readonly (readonly number[])[] | null): number {
    const t = this.tracker;
    if (!t || !this.measuring) return 0;
    clearTimeout(this.dwellTimer);
    this.dwellTimer = 0;
    const n = t.set(points);
    this.rehover();
    this.invalidate();
    return n;
  }

  /** 끌어온 점과 머무르기를 지운다(0.16.0 — 두 점째·측정 지우기·붙잡기 선택·장면 바꾸기). 지울 것이 있었으면 true */
  private clearTrack(): boolean {
    clearTimeout(this.dwellTimer);
    this.dwellTimer = 0;
    return !!this.tracker?.clear();
  }

  /**
   * 머무르기(0.16.0): 미리 보기를 구할 때마다 커서 아래 점 붙잡기로 MeasureTracker.hover를 부르고, 새로 머물기 시작하면 dwellMs 타이머를 다시 건다(마우스·펜만).
   * 타이머가 끝날 때 같은 머무르기가 이어지고 있고(그 사이 다른 점·벗어남·떠남이 없었다) 미리 보기가 그 점이면 기억한다
   */
  private dwell(h: MeasurePick | null, at: { x: number; y: number; pointerType: string } | null): void {
    const t = this.tracker, ms = this.snapOpt?.inference?.track?.dwellMs;
    if (!t || ms === undefined) return;
    // 터치 포인터는 머무르지 않는다(손가락은 누른 채 움직이면 끌기이고 떼면 찍는다 — 앱이 setMeasureTrackPoints로 준다)
    const step = at && !isTouch(at.pointerType) ? t.hover(dwellPointOf(h), at.x, at.y) : (t.cancel(), 'none');
    if (step === 'keep') return;
    clearTimeout(this.dwellTimer);
    this.dwellTimer = 0;
    if (step !== 'start') return;
    this.dwellTimer = window.setTimeout(() => {
      this.dwellTimer = 0;
      if (this.disposed || this.tracker !== t || !this.measuring || this.drag) return t.cancel();
      const p = dwellPointOf(this.measureHover), q = t.dwelling;
      if (!p || !q || !sameTrackPoint(p, q)) return t.cancel();
      if (t.commit()) this.invalidate();
    }, ms);
  }

  /**
   * 측정 거리 글상자의 화면 자리(0.12.0 — 캔버스 왼쪽 위 기준 CSS 화소, 복사본): 첫 점과 미리 보기(또는 두 점째) 사이 거리 글을 마지막으로 그린 자리.
   * 앱이 커서 옆에 제 툴팁을 띄울 때 이 상자와 겹치지 않게 옮긴다. 그리지 않았으면(측정 중이 아님, 첫 점이나 미리 보기가 없음) null.
   * 그리기는 requestAnimationFrame에서 하므로 상태를 바꾼 직후 읽으려면 renderNow() 뒤에 읽는다. 그림 저장(toBlob·renderImage)의 덧그림은 바꾸지 않는다.
   * 0.13.0: setMeasureLabelAvoid로 비켜 그렸으면 옮긴 자리. 0.24.0: 앱 측정 덧그림 글상자(annotationLabelRects)와 겹치면 그것을 비킨 자리
   */
  get measureLabelRect(): MeasureLabelRect | null {
    const r = this.measureLabel;
    return r ? { ...r } : null;
  }

  /**
   * 측정 거리 글상자가 비켜 그릴 자리(0.13.0): 앱이 캔버스 위에 그린 것(손가락 위 십자선·커서 옆 툴팁)의 화면 사각형과 커서 둘레 반지름.
   * 사각형 목록만 줘도 된다. 기본 자리(두 점 화면 가운데의 오른쪽 위)가 이것과 겹치면 왼쪽 위 → 오른쪽 아래 → 왼쪽 아래, 그다음 두 점을 잇는
   * 선분을 따라 첫 점 쪽 1/4·둘째 점 쪽 1/4·첫 점·둘째 점 자리에서 같은 네 귀, 그다음 피할 영역마다 바로 위·아래(선분이 짧아 커서가 기준점 바로 옆일 때)를
   * 차례로 보고 겹치지 않는 첫 자리에 그린다(모두 겹치면 기본 자리 — 순수 함수 placeMeasureLabel).
   * 옮길 때는 두 측정 점 표식도 가리지 않는 자리를 먼저 찾는다(그런 자리가 없으면 앱 영역만 비켜 간 자리).
   * 화면 덧그림에만 쓰고 그림 저장(toBlob·renderImage)은 기본 자리에 그린다. 사각형은 캔버스 왼쪽 위 기준 CSS 화소이고, 앱의 십자선·툴팁이
   * 움직일 때마다 다시 준다(같은 값이면 다시 그리지 않는다). null·빈 값이면 끈다(0.12.0과 같은 자리). 측정을 지워도 남는다.
   * 0.23.0: 앱 측정 덧그림(setAnnotations)의 글상자도 이 사각형을 같은 차례로 비켜 그린다(커서 둘레는 보지 않는다 — annotationLabelRects).
   * 뷰 큐브 자리는 viewCubeRect로 읽어 함께 넘긴다.
   * 0.24.0: 화면 덧그림에서는 이것을 주지 않아도 덧그림 글상자끼리(덧그림 차례 — 뒤 글상자가 비킨다)와 측정 거리 글상자(덧그림 글상자를 비킨다)가 겹치지 않게 그린다.
   * 0.31.0: points: true면 측정 거리 글상자가 두 측정 점 표식을 덮는 자리도 옮긴다(MeasureLabelAvoid.points — 이것만 줘도 켠다)
   * 0.33.0: snapshotPoints도 true면 그림 저장(toBlob·renderImage)의 측정 거리 글상자도 표식만 같은 규칙으로 비킨다(MeasureLabelAvoid.snapshotPoints)
   */
  setMeasureLabelAvoid(avoid: MeasureLabelAvoid | readonly MeasureLabelRect[] | null): void {
    const o: MeasureLabelAvoid | null = Array.isArray(avoid) ? { rects: avoid as readonly MeasureLabelRect[] } : (avoid as MeasureLabelAvoid | null);
    const rects: MeasureLabelRect[] = [];
    for (const r of Array.isArray(o?.rects) ? o!.rects : []) {
      const a = avoidRect(r);
      if (a) rects.push(a);
    }
    const pr = o?.pointerRadius;
    const pointerRadius = typeof pr === 'number' && Number.isFinite(pr) && pr > 0 ? pr : 0;
    // 0.31.0: 측정 점 표식도 비키기(true일 때만 — 이것만 줘도 켠다). 0.33.0: 그림 저장도 표식 비키기(points와 함께일 때만)
    const points = o?.points === true;
    const snapshot = points && o?.snapshotPoints === true;
    const next = rects.length || pointerRadius || points ? { rects, pointerRadius, points, snapshot } : null;
    const prev = this.labelAvoid;
    const same =
      prev === next ||
      (!!prev &&
        !!next &&
        prev.pointerRadius === next.pointerRadius &&
        prev.points === next.points &&
        prev.snapshot === next.snapshot &&
        prev.rects.length === next.rects.length &&
        prev.rects.every((r, i) => {
          const s = next.rects[i]!;
          return r.x === s.x && r.y === s.y && r.width === s.width && r.height === s.height;
        }));
    this.labelAvoid = next;
    // 0.23.0: 앱 측정 덧그림 글상자도 비켜 그리므로 덧그림이 있으면 다시 그린다
    if (!same && ((this.measuring && this.measurePts.length) || this.annos)) this.invalidate();
  }

  /**
   * 앱 측정 덧그림(setAnnotations)의 글상자를 마지막으로 화면에 그린 자리(0.23.0 — 덧그림 차례대로, 캔버스 왼쪽 위 기준 CSS 화소, 복사본).
   * 글자 상자가 없거나(빈 label), 기준점이 화면 밖이거나, 가려서 그리지 않은 것은 null. setMeasureLabelAvoid의 사각형이 있으면 그것을 비켜 그린 자리다.
   * 0.24.0: 덧그림 차례로 놓아 앞 차례 글상자와 겹치면 뒤 글상자가 같은 차례(placeLabelAmong)로 비킨 자리다(겹치지 않으면 0.23.0 자리).
   * 그리기는 requestAnimationFrame에서 하므로 바꾼 직후 읽으려면 renderNow() 뒤에 읽는다
   */
  get annotationLabelRects(): (MeasureLabelRect | null)[] {
    return this.annoLabels.map((r) => (r ? { ...r } : null));
  }

  /**
   * 뷰 큐브의 화면 사각형(0.23.0 — 캔버스 왼쪽 위 기준 CSS 화소, setMeasureLabelAvoid의 사각형과 같은 좌표): 코어가 둔 자리(위·오른쪽에서 8화소, 한 변 viewCubeSize).
   * 뷰 큐브를 감췄으면 null. 앱이 CSS로 큐브를 옮겼으면 그 요소를 직접 잰다
   */
  get viewCubeRect(): MeasureLabelRect | null {
    if (!this.opts.viewCube) return null;
    // 0.44.0 손가락으로 편 동안은 편 자리
    const s = this.cubeSizeNow();
    return { x: this.cssW - CUBE_INSET - s, y: CUBE_INSET, width: s, height: s };
  }

  /**
   * 지금 측정 거리 글상자가 비켜 그릴 자리(0.13.0 — 고른 값의 복사본, 꺼져 있으면 null). 0.31.0: 측정 점 표식도 비키면 points: true.
   * 0.33.0: 그림 저장도 표식을 비키면 snapshotPoints: true(points 없이 준 snapshotPoints는 버린다)
   */
  get measureLabelAvoid(): MeasureLabelAvoid | null {
    const a = this.labelAvoid;
    if (!a) return null;
    const r: MeasureLabelAvoid = { rects: a.rects.map((x) => ({ ...x })) };
    if (a.pointerRadius) r.pointerRadius = a.pointerRadius;
    if (a.points) r.points = true;
    if (a.snapshot) r.snapshotPoints = true;
    return r;
  }

  /**
   * 뷰어 글상자의 기본 자리(0.27.0): 측정 거리 글상자(measure)·앱 측정 덧그림 글상자(annotations)를 기준점 오른쪽 위 대신 앱이 정한 자리부터 놓는다 —
   * 순수 placeMeasureLabel·placeLabelAmong의 first와 같은 뜻('topRight'·'topLeft'·'bottomRight'·'bottomLeft'·'center'·'above'·'below' — 캔버스 안으로 당긴다).
   * 문자열 하나면 둘 모두, 객체면 준 것만. 피할 자리(setMeasureLabelAvoid)·먼저 놓인 글상자와 겹치면 0.26.0 first와 같은 차례(기본 자리 → 기준점 네 귀 → 선분 위 →
   * 피할 영역 위·아래)로 비키고, 모두 막히면 그 기본 자리다. 그림 저장(toBlob·renderImage)도 이 자리에 그린다(비키지는 않는다).
   * 모르는 값·앱 자리 { x, y }는 그 글상자에 주지 않은 것으로 본다. null·빈 객체면 끈다(0.26.0과 같은 오른쪽 위). 장면을 바꿔도·측정을 지워도 남는다.
   * 0.29.0: 객체 꼴에 fallback('first' | 'topRight' — 순수 0.28.0 LabelPlaceOptions.fallback과 같은 규칙)을 주면 준 기본 자리 둘 모두 그 차례로 고른다
   * (화면 덧그림만 — 그림 저장은 비키지 않으므로 기본 자리 그대로). 모르는 값·기본 자리 없이 준 fallback은 뺀다. 주지 않으면 0.28.0과 같다
   */
  setMeasureLabelSpot(spot: LabelSpotName | MeasureLabelSpot | null): void {
    let next: MeasureLabelSpot | null = null;
    if (typeof spot === 'string') {
      const s = labelSpotName(spot);
      if (s) next = { measure: s, annotations: s };
    } else if (spot && typeof spot === 'object') {
      const m = labelSpotName(spot.measure), a = labelSpotName(spot.annotations);
      if (m || a) {
        next = {};
        if (m) next.measure = m;
        if (a) next.annotations = a;
        if (spot.fallback === 'first' || spot.fallback === 'topRight') next.fallback = spot.fallback;
      }
    }
    const prev = this.labelSpot;
    this.labelSpot = next;
    if (prev?.measure === next?.measure && prev?.annotations === next?.annotations && prev?.fallback === next?.fallback) return;
    if ((this.measuring && this.measurePts.length) || this.annos) this.invalidate();
  }

  /** 지금 뷰어 글상자의 기본 자리(0.27.0 — 준 것만의 복사본, 없으면 null. 0.29.0: 준 fallback도) */
  get measureLabelSpot(): MeasureLabelSpot | null {
    return this.labelSpot ? { ...this.labelSpot } : null;
  }

  /** 0.27.0 그 글상자의 기본 자리 선택(없으면 undefined — 0.26.0과 같은 부르기). 0.29.0: 준 fallback도 넘긴다(없으면 0.27.0과 같은 { first }) */
  private spotOpts(which: 'measure' | 'annotations'): LabelPlaceOptions | undefined {
    const s = this.labelSpot?.[which];
    if (!s) return undefined;
    const fb = this.labelSpot!.fallback;
    return fb ? { first: s, fallback: fb } : { first: s };
  }

  /**
   * 화면 덧그림의 글상자가 지금 피할 영역(커서 둘레는 미리 보기가 있을 때만). 옮길 때는 두 측정 점 표식(seg)도 될 수 있으면 가리지 않는다.
   * 0.31.0: points를 켰으면 표식을 덮는 자리도 옮긴다(softBlocks). 꺼져 있으면 null
   */
  private labelAvoidAreas(seg: [V3, V3] | null): LabelAvoidAreas | null {
    const a = this.labelAvoid;
    if (!a) return null;
    const at = a.pointerRadius && this.measuring && this.measureHover ? this.lastHoverAt : null;
    const out: LabelAvoidAreas = {
      rects: a.rects,
      circles: at ? [{ x: at.x, y: at.y, r: a.pointerRadius }] : [],
      soft: seg ? seg.map((p) => ({ x: p[0], y: p[1], r: LABEL_POINT_R })) : [],
    };
    if (a.points) out.softBlocks = true;
    return out;
  }

  /** 측정을 지운다(찍은 점·미리 보기·잠금, 0.16.0부터 끌어온 점도) */
  clearMeasure(): void {
    const had = this.measurePts.length > 0;
    this.measurePts = [];
    this.measureHover = null;
    this.inferLock = null;
    this.lastLockable = null;
    this.clearTrack();
    if (had) for (const cb of this.measureCbs) cb(null);
    // 0.46.0: 가상 커서가 켜져 있으면 그 자리 미리 보기를 다시 구한다(알리지 않는다)
    if (this.keyCur && this.measuring && !this.disposed) this.keyRecompute();
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
   * 0.45.0 id·raw·edges(ProjectOptions): 그 점이 놓인 묶음(과 기본 도형)을 주면 잘림을 앱 붙잡기 점(SnapPoint)과 같은 규칙으로 판정한다 —
   * 그 묶음을 자르는 평면(setSections items로 범위를 정한 평면도), raw가 있으면 그 도형이 든 구간 단면의 평면. 주지 않으면 0.44.0 그대로(모든 묶음을 자르는 평면만)
   */
  project(p: readonly number[], opts: ProjectOptions = {}): ProjectedPoint | null {
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
    let cut: boolean;
    if (typeof opts.id === 'string') {
      const r = snapRaw(opts.raw);
      cut = this.clippedAway([p[0]!, p[1]!, p[2]!], opts.id, r ?? undefined, opts.edges === true);
    } else cut = this.pointCut(p);
    const occluded = !!opts.occlusion && onScreen && !cut && this.occludedAt(f, p, x, y, true);
    return { x, y, depth, behind, onScreen, occluded, visible: onScreen && !cut && !occluded };
  }

  /**
   * 두 묶음(그물·선분·점 묶음 id) 사이 가장 가까운 두 점과 거리(세계 좌표). 묶음 원점·행렬을 반영하고 숨긴 구간은 뺀다.
   * 이미 만든 BVH를 쓴다(없으면 만든다). 서로 걸치면 거리 0. maxDistance를 주면 그보다 멀면 null. 없는 id·빈 묶음도 null.
   * 0.45.0 rangeA·rangeB: 그 묶음 안 구간(면 하나의 삼각형 구간 등)끼리만 잰다 — 구간만의 BVH(만들어 기억한다)
   */
  closestPoints(idA: string, idB: string, opts: ClosestPointsOptions = {}): ClosestResult | null {
    const a = this.closestShape(idA, true, opts.rangeA), b = this.closestShape(idB, true, opts.rangeB);
    if (!a || !b) return null;
    return this.closestIds(idA, idB, closestBetween(a, b, opts));
  }

  /**
   * closestPoints를 시간 조각으로 나눠 돌린다(0.41.0 — 화면을 멈추지 않게). 조각마다 sliceMs(기본 CLOSEST_SLICE_MS = 8 ms)를 넘기 전에 멈추고
   * 다음 작업(MessageChannel — 없으면 setTimeout 0)으로 넘겼다가 이어 간다. 답(두 점·거리·indices면 번호)은 끝날 때의 장면으로 부른 closestPoints와 바이트까지 같다
   * (같은 BVH를 같은 차례로 내려간다). 그 사이 두 묶음의 모양(그물 바꾸기·지우기, 묶음 행렬·원점, 숨긴 구간, BVH)이 바뀌면 처음부터 다시 찾는다.
   * 없는 id·빈 묶음·maxDistance보다 멀면 null, 뷰어를 닫으면 null. signal이 멈추면 signal.reason으로 거절한다.
   * 아직 BVH가 없는 묶음은 그 묶음 BVH를 한 작업에서 만든 뒤 쉰다(BVH 만들기는 나누지 않는다 — 장면을 올린 뒤 쉬는 틈에 미리 만든다)
   */
  async closestPointsAsync(idA: string, idB: string, opts: ClosestPointsAsyncOptions = {}): Promise<ClosestResult | null> {
    const signal = opts.signal ?? null;
    signal?.throwIfAborted();
    const ms = sliceRange(opts.sliceMs);
    const st = opts.stats ?? null;
    // 쉬는 길: MessageChannel(브라우저의 setTimeout 0은 다섯 번째부터 4 ms 넘게 미뤄진다), 없으면 setTimeout 0
    const ch = typeof MessageChannel === 'function' ? new MessageChannel() : null;
    let wake: (() => void) | null = null;
    if (ch) ch.port1.onmessage = () => wake?.();
    const wait = (): Promise<void> =>
      new Promise<void>((res) => {
        wake = res;
        if (ch) ch.port2.postMessage(0);
        else setTimeout(res, 0);
      });
    const now = (): number => performance.now();
    const ra = opts.rangeA, rb = opts.rangeB;
    try {
      for (;;) {
        // 모양 잡기: BVH가 없으면 그 묶음 것만 만들고 쉰다(0.45.0 구간을 주면 그 구간 BVH)
        let a = this.closestShape(idA, false, ra);
        if (!a) {
          if (this.disposed || !this.items.has(idA) || !(a = this.closestShape(idA, true, ra))) return null;
          await wait();
          signal?.throwIfAborted();
          continue;
        }
        let b = this.closestShape(idB, false, rb);
        if (!b) {
          if (this.disposed || !this.items.has(idB) || !(b = this.closestShape(idB, true, rb))) return null;
          await wait();
          signal?.throwIfAborted();
          continue;
        }
        const s = new ClosestSearch(a, b, opts);
        const ka = closestKey(a), kb = closestKey(b);
        let stale = false;
        while (!closestSlice(s, ms, now, st)) {
          await wait();
          signal?.throwIfAborted();
          if (this.disposed) return null;
          // 모양이 바뀌었으면 처음부터
          const a2 = this.closestShape(idA, false, ra), b2 = this.closestShape(idB, false, rb);
          if (!a2 || !b2 || !sameClosestKey(ka, closestKey(a2)) || !sameClosestKey(kb, closestKey(b2))) {
            stale = true;
            if (st) st.restarts++;
            break;
          }
        }
        if (stale) continue;
        return this.closestIds(idA, idB, s.result!);
      }
    } finally {
      if (ch) {
        ch.port1.onmessage = null;
        ch.port1.close();
        ch.port2.close();
      }
    }
  }

  /** 0.41.0 indices: 배열 안 번호(rawA·rawB)에 원본 식별 번호(indexA·indexB — segmentIds·pointIds, 그물이면 삼각형 번호 그대로)를 더한다 */
  private closestIds(idA: string, idB: string, r: ClosestResult | null): ClosestResult | null {
    if (!r || r.rawA === undefined || r.rawB === undefined) return r;
    const idOf = (id: string, raw: number): number => {
      const it = this.items.get(id);
      return it?.kind === 'line' ? (it.item.segmentIds?.[raw] ?? raw) : it?.kind === 'point' ? (it.item.pointIds?.[raw] ?? raw) : raw;
    };
    r.indexA = idOf(idA, r.rawA);
    r.indexB = idOf(idB, r.rawB);
    return r;
  }

  /**
   * 최근접점 모양(묶음 정점·BVH·모형 행렬·숨긴 구간). build = false면 BVH가 없을 때 null(0.41.0 — 나눠 돌리기가 BVH 만들기를 따로 둔다).
   * 0.45.0 range: 그 묶음 안 구간만 담은 모양(closestPart — 구간 BVH는 partFor가 기억한다). 구간이 묶음 밖뿐이면 null
   */
  private closestShape(id: string, build = true, range?: IndexRange | readonly IndexRange[] | null): ClosestShape | null {
    const it = this.items.get(id);
    if (!it) return null;
    const skip = this.rangeSel.get(id)?.test ?? null;
    if (range) {
      const kind: PrimKind = it.kind === 'mesh' ? 'triangle' : it.kind === 'line' ? 'segment' : 'point';
      const part = this.partFor(kind, it.item.positions, it.kind === 'mesh' ? it.item.indices : undefined, range, build);
      if (!part) return null;
      const o = it.item.origin;
      const model = it.kind === 'mesh' ? this.modelOf(it.item) : (this.lineModel(it.item) ?? (hasOrigin(o) ? translation(o) : undefined));
      const s: ClosestShape = { kind, positions: part.positions, bvh: part.bvh, model, skip, offset: part.offset, map: part.map };
      if (part.indices) s.indices = part.indices;
      return s;
    }
    if (it.kind === 'mesh') {
      const m = it.item;
      const bvh = this.bvhFor('triangle', m.positions, m.indices, build);
      return bvh ? { kind: 'triangle', positions: m.positions, indices: m.indices, bvh, model: this.modelOf(m), skip } : null;
    }
    const kind = it.kind === 'line' ? 'segment' : 'point';
    const bvh = this.bvhFor(kind, it.item.positions, undefined, build);
    const o = it.item.origin;
    return bvh ? { kind, positions: it.item.positions, bvh, model: this.lineModel(it.item) ?? (hasOrigin(o) ? translation(o) : undefined), skip } : null;
  }

  /**
   * 0.45.0 최근접점 구간 모양 기억(정점 배열 → 번호 배열·종류 → 합친 구간 열쇠): 없으면 build일 때 만든다(closestPart). 묶음마다 CLOSEST_PART_CACHE개까지
   * (가장 오래 쓰지 않은 것부터 버린다). BVH 기억과 함께 버린다(장면·그물 바꾸기, 제자리 정점 고치기). 구간이 묶음 밖뿐이거나 build가 아니고 없으면 null
   */
  private partFor(kind: PrimKind, positions: Float32Array, indices: Uint32Array | undefined, range: IndexRange | readonly IndexRange[], build: boolean): ClosestPart | null {
    const R = mergeRanges(Array.isArray(range) ? (range as readonly IndexRange[]) : [range as IndexRange], bvhPrimCount(kind, positions, indices));
    if (!R.length) return null;
    let m = this.parts.get(positions);
    if (!m) {
      m = new Map();
      this.parts.set(positions, m);
    }
    const sub = indices ?? kind;
    let c = m.get(sub);
    if (!c) {
      c = new Map();
      m.set(sub, c);
    }
    const key = R.map((r) => `${r.start}+${r.count}`).join(',');
    let p = c.get(key);
    if (p) {
      // 가장 최근에 쓴 것을 뒤로
      c.delete(key);
      c.set(key, p);
      return p;
    }
    if (!build) return null;
    const made = closestPart(kind, positions, indices, R);
    if (!made) return null;
    c.set(key, made);
    if (c.size > CLOSEST_PART_CACHE) c.delete(c.keys().next().value!);
    return made;
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
    // 0.50.0: 유한하지 않은 값이 든 색 배열은 null(되돌림)과 같다(0.49.0은 그 색으로 그려 검게 보였다)
    const bad = typeof color !== 'string' && color !== null && ![color[0], color[1], color[2], color[3] ?? 1].every((x) => Number.isFinite(x));
    if (color === null || bad) delete l.color;
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
    else {
      const m = lookMatrix(matrix);
      if (!m) return;
      l.matrix = m;
    }
    this.setLook(id, l, true);
  }

  /**
   * 0.32.0 여러 묶음 행렬을 한 번에 건다: [묶음 id, 행렬(열 우선 4×4 — setItemMatrix와 같다) 또는 null(되돌림)] 목록(Map도 그대로 준다).
   * 결과(그림·고르기·측정·범위·단면·최근접점·itemLook)는 목록 차례대로 setItemMatrix를 부른 것과 같다 — 같은 id가 둘이면 뒤의 것,
   * 없는 id와 앞 16개가 유한한 수가 아닌 행렬(배열이 아닌 값 포함)은 건너뛴다. 범위·고르기 목록·단면 테두리·그림자·측정 미리 보기는 한 번만 버린다
   * (다음 그리기·고르기에서 한 번 다시 센다). 분해 밀대·끌기처럼 부품 여럿을 한꺼번에 옮길 때. 돌려주는 값: 건 항목 수(건너뛴 것 빼고)
   */
  setItemMatrices(entries: Iterable<readonly [string, ArrayLike<number> | null]>): number {
    if (this.disposed) return 0;
    const moved: string[] = [];
    for (const [id, matrix] of entries) {
      if (!this.items.has(id)) continue;
      const m = matrix === null ? null : matrix && typeof matrix === 'object' ? lookMatrix(matrix) : null;
      if (matrix !== null && !m) continue;
      const l = this.looks.get(id) ?? {};
      if (m) l.matrix = m;
      else delete l.matrix;
      this.storeLook(id, l);
      moved.push(id);
    }
    if (moved.length) this.lookChanged(moved);
    return moved.length;
  }

  /**
   * 0.33.0 여러 묶음 겉모습을 한 번에 건다: [묶음 id, 겉모습(ItemLookInput — 준 필드만, null 필드는 그 겉모습 되돌림) 또는 null(그 묶음의 겉모습을 모두 되돌림)] 목록
   * (Map도 그대로 준다). 결과(그림·고르기·측정·범위·단면·최근접점·itemLook)는 목록 차례대로, 한 항목 안에서는 opacity(pickable과 함께) → color → matrix → edgeColor →
   * profileColor → pickOpaque → pickThrough 차례로 하나씩 부른 것과 같다 — 같은 id가 둘이면 뒤의 것이 덮고, 없는 id·겉모습이 객체도 null도 아닌 항목은 건너뛰며,
   * 앞 16개가 유한한 수가 아닌 행렬(배열이 아닌 값 포함)은 그 행렬만 건너뛴다(setItemMatrix와 같다). pickThrough는 그물에만.
   * 그림자·고르기 목록·측정 미리 보기와 행렬을 바꾼 묶음의 범위·모형 행렬은 한 번만 버린다(setItemMatrices와 같다). 돌려주는 값: 건 항목 수(건너뛴 것 빼고)
   */
  setItemLooks(entries: Iterable<readonly [string, ItemLookInput | null]>): number {
    if (this.disposed) return 0;
    let n = 0;
    const moved: string[] = [];
    // 같은 색 글은 한 번만 푼다(묶음마다 새 배열 — 하나씩 부른 것처럼 겉모습끼리 배열을 함께 쓰지 않는다)
    const parsed = new Map<string, Rgba>();
    const col = (c: Rgba | string): Rgba => {
      if (typeof c !== 'string') return [c[0], c[1], c[2], c[3] ?? 1] as Rgba;
      let p = parsed.get(c);
      if (!p) parsed.set(c, (p = this.rgba(c)));
      return [p[0], p[1], p[2], p[3]] as Rgba;
    };
    for (const [id, look] of entries) {
      const it = this.items.get(id);
      if (!it || (look !== null && (!look || typeof look !== 'object'))) continue;
      n++;
      if (look === null) {
        if (this.looks.has(id)) {
          if (this.looks.get(id)!.matrix) moved.push(id);
          this.storeLook(id, {});
        }
        continue;
      }
      const l = this.looks.get(id) ?? {};
      const { opacity, color, matrix, edgeColor, profileColor, pickOpaque, pickThrough } = look;
      if (opacity === null) {
        delete l.alpha;
        delete l.pickable;
      } else if (opacity !== undefined) {
        l.alpha = Math.min(1, Math.max(0, Number(opacity) || 0));
        if (look.pickable !== undefined) l.pickable = look.pickable;
      }
      if (color === null) delete l.color;
      else if (color !== undefined) l.color = col(color);
      if (matrix === null) {
        if (l.matrix) moved.push(id);
        delete l.matrix;
      } else if (matrix !== undefined) {
        const m = matrix && typeof matrix === 'object' ? lookMatrix(matrix) : null;
        if (m) {
          l.matrix = m;
          moved.push(id);
        }
      }
      if (edgeColor === null) delete l.edgeColor;
      else if (edgeColor !== undefined) l.edgeColor = col(edgeColor);
      if (profileColor === null) delete l.profileColor;
      else if (profileColor !== undefined) l.profileColor = col(profileColor);
      if (pickOpaque !== undefined) {
        if (pickOpaque) l.pickOpaque = true;
        else delete l.pickOpaque;
      }
      if (pickThrough !== undefined && it.kind === 'mesh') this.applyPickThrough(l, mergeRanges(pickThrough, primCount(it)));
      this.storeLook(id, l);
    }
    if (n) this.lookChanged(moved.length ? moved : false);
    return n;
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

  /**
   * 고르기에서 불투명으로 볼 그물(0.24.0): on이면 반투명 그물 너머 고르기(pick·onPick·측정 붙잡기의 throughTranslucent)가 이 그물 면을 지나가지 않고
   * 불투명 면처럼 그 면에서 멈춘다 — 판 안 포켓·홈처럼 반투명으로 그리지만 판 너머로 재고 싶은 벽. 그림·투명도·가림(반투명 면은 뒤 선분·점을 가리지 않는다)과
   * throughTranslucent를 주지 않은 고르기는 그대로다. false면 되돌린다(그물 색·겉모습 투명도로 가른다). 다른 겉모습처럼 장면을 바꾸면(setScene) 비우고,
   * setMesh로 바꿔도 남는다. 선분·점 묶음 id는 받지만 쓰이지 않는다(면이 없다)
   */
  setItemPickOpaque(id: string, on: boolean): void {
    if (this.disposed) return;
    const l = this.looks.get(id) ?? {};
    if ((l.pickOpaque === true) === !!on) return;
    if (on) l.pickOpaque = true;
    else delete l.pickOpaque;
    this.setLook(id, l, false);
  }

  /**
   * 고르기에서 지나갈 그물의 일부 면(0.27.0): 반투명 그물 너머 고르기(pick·onPick·측정 붙잡기의 throughTranslucent)가 이 그물의 삼각형 구간
   * ({ start, count } — 삼각형 번호, Pick3d.raw·setHiddenRanges와 같은 번호)을 반투명 면처럼 지나 그 뒤(같은 그물의 다른 면 포함)를 고른다.
   * 그물이 setItemPickOpaque로 켰거나 불투명이어도 이 삼각형에서는 멈추지 않는다 — 판 안 포켓의 뚜껑(판 윗면 자리)만 지나 포켓 바닥·그 안 구멍을 고르고 벽에서는 멈출 때.
   * 그대로인 것: 그림·윤곽선(그물을 나누지 않는다), 윤곽선 고르기(반투명 그물 윤곽선처럼 늘 고른다), 가림(그림대로 — 불투명 그물의 이 면은 뒤 선분·점을 가린다),
   * 잘린 면 채움, 면의 열린 교차가 보는 커서 둘레 삼각형(반투명 그물 삼각형처럼 본다), throughTranslucent를 주지 않은 고르기와 onPick front.
   * 빈 목록·null이면 되돌린다. 다른 겉모습처럼 장면을 바꾸면(setScene)·clearItemLooks가 비우고, setMesh로 바꿔도 남는다(새 삼각형 수로 자른다). 그물이 아닌 id는 무시한다
   */
  setItemPickThrough(id: string, ranges: readonly IndexRange[] | null): void {
    if (this.disposed) return;
    const it = this.items.get(id);
    if (!it || it.kind !== 'mesh') return;
    const l = this.looks.get(id) ?? {};
    const next = mergeRanges(ranges, primCount(it));
    const prev = l.pickThrough ?? [];
    if (prev.length === next.length && prev.every((r, i) => r.start === next[i]!.start && r.count === next[i]!.count)) return;
    this.applyPickThrough(l, next);
    this.setLook(id, l, false);
  }

  /** 지나갈 삼각형 구간과 그 판정을 겉모습에 둔다(빈 목록이면 지운다) */
  private applyPickThrough(l: LookState, r: IndexRange[]): void {
    const t = r.length ? rangeTester(r) : null;
    if (t) {
      l.pickThrough = r;
      l.pickThroughTest = t;
    } else {
      delete l.pickThrough;
      delete l.pickThroughTest;
    }
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
    if (l.pickOpaque) out.pickOpaque = true;
    if (l.pickThrough) out.pickThrough = l.pickThrough.map((r) => ({ ...r }));
    return out;
  }

  /** 모든 묶음 겉모습을 되돌린다 */
  clearItemLooks(): void {
    if (!this.looks.size) return;
    const moved = this.lookMoved.size > 0;
    this.looks.clear();
    this.lookMoved.clear();
    this.lookChanged(moved);
  }

  private setLook(id: string, l: LookState, moved: boolean): void {
    if (!this.items.has(id)) return;
    this.storeLook(id, l);
    this.lookChanged(moved ? [id] : false);
  }

  /** 겉모습 하나를 둔다(빈 겉모습이면 지운다 — 다시 셀 것은 lookChanged가 버린다) */
  private storeLook(id: string, l: LookState): void {
    if (l.alpha === undefined && l.pickable === undefined && !l.color && !l.matrix && !l.edgeColor && !l.profileColor && !l.pickOpaque && !l.pickThrough) this.looks.delete(id);
    else this.looks.set(id, l);
    if (l.matrix) this.lookMoved.add(id);
    else this.lookMoved.delete(id);
  }

  /**
   * 겉모습이 바뀐 뒤 다시 셀 것을 버린다. moved = 행렬이 바뀌었을 수 있는 묶음: true면 모든 묶음(0.32.0까지 — clearItemLooks), id 목록이면 그 묶음들만(0.33.0 —
   * 범위·모형 행렬·숨긴 구간 범위는 묶음마다 그 묶음의 행렬로만 정해진다), false면 없음. 보이는 범위·단면 테두리·휠 기준은 하나라도 바뀌면 버린다
   */
  private lookChanged(moved: boolean | readonly string[]): void {
    this.shadowVer++;
    this.visLists = null;
    // 묶음 절반 넘게 옮겼으면 하나씩 지우기보다 통째로 버리는 편이 싸다(값은 같다)
    if (moved !== true && moved && 2 * moved.length >= this.items.size) moved = true;
    if (moved === true) {
      this.boxes = new WeakMap();
      this.models = new WeakMap();
      this.lineModels = new WeakMap();
      for (const r of this.rangeSel.values()) r.box = null;
    } else if (moved)
      for (const id of moved) {
        const it = this.items.get(id);
        if (it) {
          this.boxes.delete(it.item);
          if (it.kind === 'mesh') this.models.delete(it.item);
          else this.lineModels.delete(it.item);
        }
        const r = this.rangeSel.get(id);
        if (r) r.box = null;
      }
    if (moved === true || (moved && moved.length)) {
      this.visBox = null;
      this.cutDirty = true;
      this.wheelAnchor = null;
    }
    if (this.measuring) this.measureHover = null;
    this.invalidate();
  }

  /**
   * 측정 글 꼴 바꾸기(null이면 기본). 내장 측정과 글을 주지 않은 거리 덧그림에 쓴다.
   * 0.31.0: fn(m, core)의 core는 그 글상자의 코어 기본 꼴(MeasureFormatCore — 기본 줄·수 꼴·자릿수·단위 글·어느 글상자인지)
   */
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
      hidden: (it) => this.hiddenOf(it),
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
    // 화면 덧그림을 그대로 쓴다. 다만 거리 글상자를 비켜 그렸으면(0.13.0 — 앱 십자선·툴팁은 그림에 없다) 덧그림만 기본 자리로 다시 그린다
    // (0.23.0: 앱 측정 덧그림 글상자를 비켜 그렸을 때도, 0.24.0: 글상자끼리 비켜 그렸을 때도)
    if ((this.labelAvoid && ((this.measuring && this.measurePts.length) || (this.annos && this.labelAvoid.rects.length))) || this.labelsShifted)
      this.drawOverlayOn(ctx, this.frame(), this.dpr);
    else ctx.drawImage(this.overlay, 0, 0);
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
   * 그 깊이에서 사각형이 꼭 맞게 확대한다. 너무 작은 사각형(2화소 미만)은 무시한다.
   * 0.49.0 끝 알림 Promise<boolean>(flyTo와 같다). 무시한 사각형·dispose 뒤에는 옮기지 않으므로 바로 false
   */
  zoomToRect(x0: number, y0: number, x1: number, y1: number, animate = this.animate): Promise<boolean> {
    if (this.disposed || Math.abs(x1 - x0) < 2 || Math.abs(y1 - y0) < 2) return Promise.resolve(false);
    this.finishAnim();
    const f = this.frame();
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const hit = this.pickDetail(cx, cy, true);
    const depth = hit ? viewDepth(f, hit.pick.point) : viewDepth(f, this.cam.target);
    return this.goto(rectZoomCamera(this.cam, f, x0, y0, x1, y1, depth, this.zoomLimits()), animate);
  }

  /** 기다리지 않고 바로 그린다 */
  renderNow(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    // 0.51.0 바로 그리기는 늘 그린다(나눠 올리기 redrawMs가 건너뛰지 않는다)
    this.upOnly = false;
    this.draw(performance.now());
  }

  get stats(): Viewer3dStats {
    return {
      ...this.renderer.stats,
      frameMs: this.frameMs,
      width: this.canvas.width,
      height: this.canvas.height,
      dpr: this.dpr,
      textures: this.renderer.textureStats,
      buffers: this.renderer.bufferStats,
      instanced: { ...this.renderer.instStats, pending: this.renderer.instPending },
      merged: (() => {
        const m = this.renderer.mergeInfo;
        return { active: m.active, ...this.renderer.mergeStats, groups: m.groups, meshes: m.items, bytes: m.bytes, pending: m.pending, bakeMs: m.bakeMs };
      })(),
    };
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
    if (!this.hiddenGroups.size && !this.hiddenItems.size && !ranged && !this.lookMoved.size && !this.bbList.length) return (this.visBox = this.allBox);
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

  /**
   * 카메라를 날리는 길 모두가 지난다. 0.49.0: 끝 알림 Promise를 돌려준다 — 옮기던 앞 움직임은 끝 자리에 닿기 전에 바뀌므로 false로 풀고,
   * 바로 옮기면(animate false·길이 0) 곧바로 true, 움직이면 끝 자리를 그린 그림 뒤(draw)·끝 자리로 마칠 때(finishAnim) true, 끊기면(dropAnim) false
   */
  private goto(c: CameraState, animate: boolean, ms = CAMERA_MOVE_MS): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    this.wheelAnchor = null;
    this.dropAnim();
    // 0.50.0: 탭이 숨었거나(브라우저가 그림을 멈춘다) 문맥을 잃은 동안은 움직이지 않고 바로 끝 자리로 옮긴다(곧바로 true — 0.49.0은 보일 때까지 풀리지 않았다)
    if (animate && ms > 0 && !this.lost && !docHidden()) {
      this.listenHidden();
      const from = this.getCamera();
      const p = new Promise<boolean>((done) => {
        this.anim = { from, to: c, t0: performance.now(), dur: ms, done };
      });
      this.invalidate();
      return p;
    }
    this.cam = c;
    this.invalidate();
    return Promise.resolve(true);
  }

  /** 옮기던 움직임을 끝 자리에 닿기 전에 그만둔다(카메라는 그 자리 그대로 — 0.49.0 그 Promise는 false) */
  private dropAnim(): void {
    const a = this.anim;
    if (!a) return;
    this.anim = null;
    a.done(false);
  }

  /**
   * 0.50.0 움직임을 처음 시작할 때 한 번 문서 visibilitychange를 듣는다(뷰어가 없어질 때까지): 탭이 숨으면 옮기던 움직임을 끝 자리로 마친다(true — 다시 보이면 그 자리를 그린다).
   * 움직임을 쓰지 않는 뷰어는 듣지 않는다(0.49.0과 같은 듣기)
   */
  private listenHidden(): void {
    if (this.hiddenOn || typeof document === 'undefined') return;
    this.hiddenOn = true;
    this.on(document, 'visibilitychange', () => {
      if (docHidden()) this.finishAnim();
    });
  }

  /** 옮기던 움직임을 끝 자리로 마친다(0.49.0 그 Promise는 true) */
  private finishAnim(): void {
    const a = this.anim;
    if (!a) return;
    this.cam = a.to;
    this.anim = null;
    a.done(true);
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
    ++this.bvhGen;
    this.bvhTasks = [];
    this.bvhHead = 0;
    const s = this.sceneRef;
    if (!s) {
      clearTimeout(this.bvhTimer);
      return;
    }
    for (const m of s.meshes) this.bvhTasks.push(this.meshBvhTask(m));
    if (this.opts.pickEdges) for (const m of s.meshes) if (m.edges && m.edges.length >= 6) this.bvhTasks.push(this.edgeBvhTask(m));
    for (const l of s.lines) this.bvhTasks.push({ n: l.positions.length, run: () => this.bvhFor('segment', l.positions, undefined, true) });
    for (const p of s.points ?? []) this.bvhTasks.push({ n: p.positions.length, run: () => this.bvhFor('point', p.positions, undefined, true) });
    this.runBvhTasks();
  }

  /**
   * 바꾼 그물 하나의 BVH를 쉬는 틈에 만들도록 줄에 더한다(0.11.0 setMesh). 기다림(200 ms)을 처음부터 다시 세므로
   * 그물을 잇달아 바꾸는 동안에는 만들지 않고(고르기는 필요할 때 그 자리에서 만든다) 바꾸기가 멈추면 만든다
   */
  private queueBvh(m: Mesh3d): void {
    this.bvhTasks.push(this.meshBvhTask(m));
    if (this.opts.pickEdges && m.edges && m.edges.length >= 6) this.bvhTasks.push(this.edgeBvhTask(m));
    this.runBvhTasks();
  }

  /** 그물 BVH 일(그 사이 그물이 바뀌었거나 빠졌으면 건너뛴다) */
  private meshBvhTask(m: Mesh3d): { n: number; run: () => void } {
    return { n: m.indices?.length ?? m.positions.length, run: () => void (this.items.get(m.id)?.item === m && this.bvhFor('triangle', m.positions, m.indices, true)) };
  }

  private edgeBvhTask(m: Mesh3d): { n: number; run: () => void } {
    return { n: m.edges!.length, run: () => void (this.items.get(m.id)?.item === m && this.bvhFor('segment', m.edges!, undefined, true)) };
  }

  private runBvhTasks(): void {
    clearTimeout(this.bvhTimer);
    const gen = this.bvhGen;
    // 0.50.0: 이미 한 일(앞 bvhHead개)을 떼어 낸 뒤 정렬한다 — 0.49.0이 shift로 앞에서 하나씩 뺀 줄과 같은 줄·같은 차례(정렬은 안정)
    if (this.bvhHead) {
      this.bvhTasks = this.bvhTasks.slice(this.bvhHead);
      this.bvhHead = 0;
    }
    const tasks = this.bvhTasks;
    tasks.sort((a, b) => a.n - b.n);
    const step = (): void => {
      if (gen !== this.bvhGen || this.disposed || tasks !== this.bvhTasks) return;
      // 끄는 중이면 미룬다
      if (this.drag || this.interacting) {
        this.bvhTimer = window.setTimeout(step, 120);
        return;
      }
      // 한 틈에 약 10 ms어치(작은 것은 여러 개, 큰 것은 하나). 0.50.0: 앞 자리 번호로 꺼낸다 — shift는 일이 많으면(부품 자리 8만 = 일 16만) 남은 줄을 매번 당겨 O(n²)였다
      const t0 = performance.now();
      while (this.bvhHead < tasks.length && performance.now() - t0 < 10) tasks[this.bvhHead++]!.run();
      if (this.bvhHead < tasks.length) this.bvhTimer = window.setTimeout(step, 16);
      else {
        tasks.length = 0;
        this.bvhHead = 0;
      }
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
  private boundsOf(it0: AnyItem): Box3 {
    const it = this.baseOf(it0);
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
  private modelOf(m0: Mesh3d): ArrayLike<number> | undefined {
    const m = this.baseOf(m0);
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
  private lineModel(it0: LineSet3d | PointSet3d): ArrayLike<number> | undefined {
    const it = this.baseOf(it0);
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
    // 0.44.0 평면을 새로 두었으면 목록을 새로(구간 단면 갈래 대리 묶음)
    this.secSync();
    if (this.visLists) return this.visLists;
    const meshes: Mesh3d[] = [], lines: LineSet3d[] = [], points: PointSet3d[] = [];
    const ranged = this.secRanged;
    for (const it of this.items.values()) {
      if (!this.visible(it.item.id, it.item.group) || this.looks.get(it.item.id)?.pickable === false) continue;
      // 0.44.0 구간 단면이 있는 묶음은 갈래마다 대리 묶음(같은 배열·id — 그 갈래 평면들로 자르고 그 갈래가 아닌 기본 도형·윤곽선은 건너뛴다)
      const cut = ranged ? this.secCutOf(it) : null;
      if (cut) {
        for (const cl of this.secClasses(it, cut)) {
          const w = Object.create(it.item) as AnyItem;
          this.secWrap.set(w, { base: it.item, cl });
          if (it.kind === 'mesh') meshes.push(w as Mesh3d);
          else if (it.kind === 'line') lines.push(w as LineSet3d);
          else points.push(w as PointSet3d);
        }
        continue;
      }
      if (it.kind === 'mesh') meshes.push(it.item);
      else if (it.kind === 'line') lines.push(it.item);
      else points.push(it.item);
    }
    return (this.visLists = { meshes, lines, points });
  }

  /**
   * 화면 점에서 고르기. 허용 거리는 포인터 종류로 가른다(터치 = touchPickTolerance, 그 밖 = pickTolerance). edges면 윤곽선도.
   * meshesOnly면 그물 면만(0.18.0 축과 면의 교차가 다시 맞춰 볼 때 — 면 위에 그린 선분·점이 그 면을 가리지 않게).
   * through면 반투명 그물의 면을 지나 고른다(0.23.0 throughTranslucent — 불투명 판정은 겉모습 반영 meshOpaque, 0.24.0 setItemPickOpaque 그물에서는 멈춘다)
   */
  private pickDetail(
    x: number,
    y: number,
    build = true,
    pointerType?: string,
    edges = this.opts.pickEdges,
    midpoints = false,
    meshesOnly = false,
    through = false,
  ): PickDetail | null {
    if (!this.sceneRef) return null;
    const a = this.pickArgs(build, pointerType, edges, midpoints, meshesOnly, through);
    return pickScene(this.frame(), x, y, a.items, a.o);
  }

  /**
   * 0.47.0 화면 점의 겹친 고르기 후보(pickSceneCandidates — 첫째는 pickDetail과 같은 고르기, 다음은 앞 후보를 걷어 낸 같은 고르기). 장면이 없으면 빈 배열
   */
  private pickList(x: number, y: number, pointerType: string | undefined, o: PickOptions & { group?: PickGroupKey | null }, max: number): PickDetail[] {
    if (!this.sceneRef) return [];
    const through = !!o.throughTranslucent;
    const a = o.meshesOnly ? this.pickArgs(true, pointerType, false, false, true, through) : this.pickArgs(true, pointerType, o.edges ?? this.opts.pickEdges, false, false, through);
    // 0.53.0 앱 묶음 열쇠(함수일 때만 — 같은 묶음은 한 후보)
    return pickSceneCandidates(this.frame(), x, y, a.items, a.o, max, typeof o.group === 'function' ? o.group : null);
  }

  /** 고르기 묶음 목록과 선택(pickDetail·pickList가 함께 쓴다 — 0.46.0 pickDetail의 인자 그대로) */
  private pickArgs(
    build: boolean,
    pointerType: string | undefined,
    edges: boolean | undefined,
    midpoints: boolean,
    meshesOnly: boolean,
    through: boolean,
  ): { items: ScenePickItems; o: ScenePickOptions } {
    const t = pickTolerance(pointerType, this.opts.pickTolerance, this.opts.touchPickTolerance);
    const items = this.visibleItems();
    const o: ScenePickOptions = {
      ...(edges ? { edges: true, edgeHidden: (m: Mesh3d) => this.edgeHiddenOf(m) } : {}),
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
      ...(through
        ? {
            throughTranslucent: true,
            opaque: (m: Mesh3d) => this.meshOpaque(m),
            pickOpaque: (m: Mesh3d) => this.looks.get(m.id)?.pickOpaque === true,
            pickThrough: (m: Mesh3d) => this.looks.get(m.id)?.pickThroughTest,
          }
        : {}),
      hidden: (it) => this.hiddenOf(it),
    };
    return { items: meshesOnly ? { meshes: items.meshes, lines: [], points: [] } : items, o };
  }

  /**
   * 측정 점 고르기: 화면 점에서 찍을 점과 붙잡은 종류. 붙잡기 선택(setMeasureSnap)이 없으면 0.7.2 그대로(고르기의 꼭짓점·끝점 붙잡기 — d를 주면 그것을 쓴다).
   * 있으면 고르기(윤곽선·가운데 점 선택 반영)의 붙잡은 점, pointsFor 점, 늘 후보인 앱 점 가운데 붙잡기 거리 안에서 화면에 가장 가까운 보이는 것.
   * 0.46.0 kc(키보드 후보 돌리기 — 주지 않으면 0.45.0 그대로): kc.skip 자리의 점 후보를 빼고 같은 규칙으로 고른다(점 붙잡기가 다하면 선 추론, kc.lines가 false면 그것도 빼고
   * 'fallback' 앱 점·붙잡지 않은 자리). 고른 점 붙잡기 자리를 kc.src에 둔다
   */
  private measureAt(x: number, y: number, pointerType: string | undefined, d0?: PickDetail | null, kc?: KeyPass): MeasurePick | null {
    const so = this.snapOpt;
    if (!so) {
      const d = d0 !== undefined ? d0 : this.pickDetail(x, y, true, pointerType);
      // 0.46.0: 붙잡은 꼭짓점·끝점을 앞 후보로 뺐으면 고른 자리 그대로(붙잡지 않은 점)
      if (kc && d) {
        if (d.snapKind && !inPoints(kc.skip, d.snap)) {
          kc.src = d.snap;
          return { p: d.snap, vertex: d.vertex, kind: d.snapKind };
        }
        return { p: d.pick.point, vertex: false, kind: null };
      }
      return d ? { p: d.snap, vertex: d.vertex, kind: d.snapKind } : null;
    }
    if (!this.sceneRef) return null;
    const edges = so.edges ?? this.opts.pickEdges;
    const dp = this.pickDetail(x, y, true, pointerType, edges, so.midpoints, false, so.through);
    // 0.46.0: 고르기가 붙잡은 점(꼭짓점·끝점·가운데 점)을 앞 후보로 뺐으면 붙잡지 않은 고르기(고른 자리 그대로 — 선분·면 위 점)로 본다
    const d: PickDetail | null = kc && dp && dp.snapKind && inPoints(kc.skip, dp.snap) ? { ...dp, snap: dp.pick.point, vertex: false, snapKind: null } : dp;
    const snapPx = pickTolerance(pointerType, this.opts.pickTolerance, this.opts.touchPickTolerance).snap;
    const f = this.frame();
    const inf = so.inference;
    const first = this.measurePts.length === 1 ? this.measurePts[0]! : null;
    // 0.29.0 끌어온 점 안내 선이 만나는 점(trackDirs { meets }): 이 고르기가 기준을 바꾸기 전의 기준 선분으로 본다 — 커서가 만나 볼 선분 위에 있으면
    // 그 선분이 곧 새 기준이 되어 안내 선과 나란해지므로. 만나는 점을 고르면 기준을 되돌린다(그 점에 붙은 동안 기준이 바뀌지 않는다)
    const meetsOn = !!(inf?.trackDirs && inf.trackDirs !== true && inf.trackDirs.meets);
    const refsBefore = meetsOn ? { parallel: this.parallelRef, track: this.trackDirRef, own: this.parallelOwn } : null;
    // 나란함(0.10.0): 커서가 지나간 선분·윤곽선을 기준으로 기억한다(첫 점을 찍기 전에도)
    // 0.27.0: 끌어온 점의 나란함·수직(trackDirs)도 같은 기준 선분을 쓴다(parallel을 켜지 않아도 기억한다)
    if ((inf?.parallel || inf?.trackDirs) && d?.ends) {
      this.parallelRef = d.ends;
      // 0.28.0: 앱이 기준 선분을 거르면(trackDirs { edge }) 받은 선분만 끌어온 점의 기준으로(앞 기준이 남는다 — 0.10.0 나란함 기준은 그대로)
      const tdEdge = inf.trackDirs && inf.trackDirs !== true ? inf.trackDirs.edge : null;
      if (tdEdge && this.edgeOk(tdEdge, d, 'track')) this.trackDirRef = d.ends;
      // 0.29.0: 첫 점 나란함의 기준 거르기(parallelEdge)를 줬으면 받은 선분만 그 기준으로(앞 기준이 남는다)
      if (inf.parallel && inf.parallelEdge && this.edgeOk(inf.parallelEdge, d, 'parallel')) this.parallelOwn = d.ends;
    }
    // 커서 둘레 선분(0.9.0 교차점·수직 발과 0.12.0 선분 방향 잠금이 함께 쓴다 — 필요할 때 한 번만 구한다)
    let near: NearSegment[] | null = null;
    const nearSegs = (): NearSegment[] => (near ??= this.segmentsAround(f, x, y, snapPx, edges));
    // 0.40.0 openEdgeLens: 활꼴 띠가 커서 붙잡기 거리 안에 닿는 토막(필요할 때 한 번만)
    let lensList: NearSegment[] | null = null;
    const lensSegs = (): NearSegment[] => (lensList ??= this.segmentsAround(f, x, y, snapPx, edges, OPEN_EDGE_CHORD));
    // 0.41.0 'fallback' 앱 점(SnapPoint.priority)은 후보에서 빼 모은다 — 다른 붙잡기가 모두 없을 때만 fallbackAt으로 고른다
    const fb: SnapCandidate[] = [];
    const app = this.snapCandidates(f, x, y, snapPx, d?.pick ?? null, fb);
    const lock = first ? this.inferLock : null;
    // 열린 후보(0.15.0): 다듬기가 있고 잠그지 않았을 때만 — 토막 밖 수직 발·넓힌 교차점을 앱이 다듬은 점으로(받을 수 있는 것만).
    // 미리 보기 한 번에 앱 함수를 새로 부르는 한도(OPEN_REFINE_CALLS)는 0.20.0 선과 토막의 열린 교차와 함께 쓴다(이 열린 후보가 먼저 쓴다)
    const refine = so.refine;
    const budget = { calls: OPEN_REFINE_CALLS };
    const open =
      refine && inf && !lock && (inf.intersections || (inf.perpendicular && first))
        ? (): SnapCandidate[] => refineOpen(openCandidates(nearSegs(), first, inf, snapPx), first, screenRay(f, x, y), refine, so.openMemo, budget)
        : null;
    let cands: Iterable<SnapCandidate> = inf ? this.withInference(inf, first, nearSegs, app, open) : app;
    // 0.46.0: 앞 후보 자리의 점 후보는 뺀다(차례는 그대로)
    if (kc && kc.skip.length) cands = skipPoints(cands, kc.skip);
    // 0.45.0: 앱 점의 기본 도형 번호(raw — 구간 단면·숨긴 구간)도 넘긴다
    const appVisible = (p: V3, sx: number, sy: number, id: string | undefined, c: SnapCandidate): boolean => this.snapVisible(f, p, sx, sy, id, c.raw, c.rawEdges === true);
    let r: MeasureSnapPick | null = chooseMeasureSnap(f, x, y, snapPx, d ? { p: d.snap, kind: d.snapKind } : null, cands, appVisible);
    if (kc) kc.src = r && r.kind ? r.p : null;
    // 0.41.0: 모아 둔 'fallback' 앱 점 가운데 붙잡기 거리 안에서 화면에 가장 가까운 보이는 것(같으면 앞의 것 — 0.8.0 규칙), 없으면 null.
    // 0.46.0: 앞 후보 자리의 것은 빼고, 고르면 그 자리를 kc.src에
    const fallbackAt = (): MeasureSnapPick | null => {
      if (!kc) return fb.length ? chooseMeasureSnap(f, x, y, snapPx, null, fb, appVisible) : null;
      const list = kc.skip.length ? fb.filter((c) => !inPoints(kc.skip, c.p)) : fb;
      const q = list.length ? chooseMeasureSnap(f, x, y, snapPx, null, list, appVisible) : null;
      if (q && q.kind) kc.src = q.p;
      return q;
    };
    const lockOut = (p: V3): MeasurePick => {
      const m: MeasurePick = { p, vertex: true, kind: lock!.kind, direction: [...lock!.direction] as V3, locked: true };
      if (lock!.axis) m.axis = lock!.axis;
      if (lock!.edge) m.edge = lock!.edge;
      return m;
    };
    // 0.33.0 refineEnds: 점 붙잡기가 꺾은선 꼭짓점(끝점·꼭짓점)이고 켠 선이 그 꼭짓점을 반 화소 안으로 지나면 그 꼭짓점을 끝으로 둔 토막들로 앱 refine에 묻는다 —
    // 받은 곡선 위 교차가 그 끝점(잠근 동안이면 그 점을 잠근 선에 내린 자리)보다 먼저다. 0.41.0: 'fallback' 앱 점이 이길 때도 같은 판정
    const endsAt = (r: MeasureSnapPick | null): MeasurePick | null => {
      if (!(so.ends && inf && r && (r.kind === 'endpoint' || r.kind === 'vertex') && !r.refined)) return null;
      const vis = (p: V3, sg: NearSegment): boolean => {
        const sp = projectToScreen(f, p);
        return !!sp && this.snapVisible(f, p, sp[0], sp[1], sg.id, sg.raw, sg.kind === 'edge');
      };
      const el = this.endLines(inf, f, first, lock, refsBefore);
      const v = el.lines.length ? this.openLineEdge(so, f, x, y, snapPx, el.lines, first, nearSegs(), budget, vis, r.p) : null;
      return v ? this.openEdgePick(f, v, first, lock ? lockOut : null, el.ref, refsBefore) : null;
    };
    const e0 = endsAt(r);
    if (e0) return e0;
    // 잠금(0.10.0): 첫 점을 지나는 잠근 선 위에만. 점 붙잡기가 있으면 그 점을 선에 수직으로 내린 자리
    if (lock && first) {
      let q = r && r.kind ? r : null;
      // 0.19.0: 점 붙잡기가 없으면 잠근 선이 커서 둘레 선분과 만나는 점(lockEdges)·커서 아래 면을 뚫는 점(lockFaces)이 커서에 가까운 선 위 점보다 먼저.
      // 0.21.0: 잠근 선이 끌어온 축과 만나는 점(lockTracks — 끌어온 점이 있을 때)도 — 그 셋보다 먼저 견준다
      const lockTracks = inf?.lockTracks && this.tracker?.size ? this.tracker.view : null;
      // 0.46.0: 후보 돌리기가 선 추론을 넘겼으면(kc.lines false) 보지 않는다
      if (!q && (inf?.lockEdges || inf?.lockFaces || lockTracks) && (!kc || kc.lines)) {
        const m = this.lockedMeet(so, inf!, f, x, y, snapPx, first, lock, d, nearSegs, pointerType, lockOut, budget, lockTracks, lensSegs);
        if (m) return m;
      }
      // 0.41.0: 점 붙잡기·잠근 선이 만나는 점이 없으면 'fallback' 앱 점을 잠근 선에 내린 자리(커서를 내린 자리보다 먼저)
      if (!q && (q = fallbackAt())) {
        const e = endsAt(q);
        if (e) return e;
      }
      const l = lockedSnap(f, first, lock.direction, x, y, q ? q.p : null);
      if (!l) return null;
      const out = lockOut(l.p);
      if (l.from) {
        out.from = l.from;
        out.fromSnap = q!.kind!;
      }
      return out;
    }
    // 끌어온 축(0.16.0 — 켰고 기억한 점이 있을 때만): 점 붙잡기가 하나도 없을 때 첫 점 축 위에서 끌어온 점과 나란한 자리가 첫 점 축보다 먼저다.
    // 0.17.0: 끌어온 축끼리의 교차·끌어온 축과 선분의 교차도 점 후보로 함께 견준다(화면에서 가까운 것, 뒤 차례는 TRACK_YIELD_PX 넘게 가까워야) — 첫 점 전에도.
    // 0.18.0: 첫 점 축과 선분의 교차(inference.axisEdges — 끌어온 점이 없어도), 축과 면의 교차(inference.axisFaces — 커서가 보이는 그물 면 위일 때)를
    // 그 셋 뒤 차례로 함께 견준다
    const tracks = this.tracker?.size ? this.tracker.view : null;
    const noPoint = !r || !r.kind;
    // 0.46.0: 후보 돌리기가 선 추론을 넘겼으면(kc.lines false) 아래 선 붙잡기(끌어온 축·첫 점 축·나란함)를 보지 않는다
    const noPointLine = noPoint && (!kc || kc.lines);
    const axisEdges = !!(first && inf?.axisEdges);
    const under = inf?.axisFaces && (first || tracks) ? faceHitOf(d) : null;
    // 0.22.0 면의 열린 교차: refineFace가 있으면 커서가 그물 면 위가 아니어도(실루엣 바깥) 축이 삼각형을 비켜 가며 곡면만 뚫는 자리를 본다
    const openFaces = !!(so.refineFace && inf?.axisFaces && (first || tracks));
    if ((tracks || axisEdges || under || openFaces) && noPointLine) {
      const vis = (p: V3, sg: NearSegment): boolean => {
        const sp = projectToScreen(f, p);
        return !!sp && this.snapVisible(f, p, sp[0], sp[1], sg.id, sg.raw, sg.kind === 'edge');
      };
      const cross = tracks && first ? trackCrossSnap(f, first, tracks, x, y, snapPx) : null;
      const pair = tracks ? trackPairSnap(f, tracks, x, y, snapPx, first) : null;
      const edge = tracks ? trackEdgeSnap(f, tracks, nearSegs(), x, y, snapPx, first, null, vis) : null;
      const axe = axisEdges ? axisEdgeSnap(f, first!, nearSegs(), x, y, snapPx, null, vis) : null;
      // 축 직선: 첫 점 X·Y·Z, 끌어온 점(새것이 앞, 첫 점과 같은 점은 뺀다) X·Y·Z
      let lines: TrackLine[] | null = null;
      if (under) {
        lines = [];
        const axes: SnapAxis[] = ['x', 'y', 'z'];
        if (first) for (const axis of axes) lines.push({ from: first, axis });
        if (tracks) for (const P of tracks) if (!first || !sameTrackPoint(P, first)) for (const axis of axes) lines.push({ from: P, axis });
      }
      const face = under && lines
        ? axisFaceSnap(f, lines, x, y, snapPx, under, (sx, sy) => faceHitOf(this.pickDetail(sx, sy, true, pointerType, false, false, true, so.through)))
        : null;
      // 끌어온 점을 지나는 그 축 선이 첫 점도 지나면(끌어온 점이 첫 점 축 위) 첫 점 축 위 점이기도 하다 — 방향을 실어 잠글 수 있게
      const along = (from: V3, axis: SnapAxis): V3 | null => (first ? trackAlongFirst(f, first, from, axis) : null);
      // 0.20.0 열린 교차: 끌어온 축·첫 점 축(axisEdges)이 커서 둘레 토막과 3D로 만나지 않지만 그 활꼴을 지날 만큼 가까우면 앱 refine('axisEdge', open)이 준
      // 곡선 위 교차(받을 수 있는 것만 — 다듬은 점으로 견준다). 다섯 후보 뒤 차례
      let openE: { snap: OpenEdgeSnap<NearSegment>; line: OpenRefineLine } | null = null;
      // 0.40.0 openEdgeLens가 다시 보는 선(이 열린 교차와 0.31.0 안내 선의 열린 교차의 선)
      const lensLines: OpenRefineLine[] = [];
      if (so.refine && (tracks || axisEdges)) {
        const ls: OpenRefineLine[] = [];
        const axes: SnapAxis[] = ['x', 'y', 'z'];
        if (tracks) for (const P of tracks) if (!first || !sameTrackPoint(P, first)) for (const axis of axes) ls.push({ from: P, dir: axisLock(axis).direction, axis, track: true });
        // 끌어온 축이 곧 첫 점 축이면(끌어온 점이 첫 점 축 위) 그 축은 한 번만(끌어온 축 — 방향도 실린다)
        if (axisEdges) for (const axis of axes) if (!ls.some((l) => l.axis === axis && along(l.from, axis))) ls.push({ from: first!, dir: axisLock(axis).direction, axis, track: false });
        openE = this.openLineEdge(so, f, x, y, snapPx, ls, first, nearSegs(), budget, vis);
        lensLines.push(...ls);
      }
      // 0.22.0 면의 열린 교차: 첫 점 축·끌어온 축(axisFaces)이 커서 둘레 삼각형을 뚫지 않지만 그 삼각형과 곡면 사이를 지날 만큼 가까우면 앱 refineFace('axisFace', open)가 준
      // 곡면 위 교차(받을 수 있는 것만 — 다듬은 점으로 견준다). 선은 열린 교차와 같이 끌어온 축 → 첫 점 축(같은 직선이면 한 번). 여섯 후보 뒤 차례
      let openF: { snap: OpenFaceSnap<NearTriangle>; line: OpenRefineLine } | null = null;
      if (openFaces) {
        const ls: OpenRefineLine[] = [];
        const axes: SnapAxis[] = ['x', 'y', 'z'];
        if (tracks) for (const P of tracks) if (!first || !sameTrackPoint(P, first)) for (const axis of axes) ls.push({ from: P, dir: axisLock(axis).direction, axis, track: true });
        if (first) for (const axis of axes) if (!ls.some((l) => l.axis === axis && along(l.from, axis))) ls.push({ from: first, dir: axisLock(axis).direction, axis, track: false });
        openF = this.openLineFace(so, f, x, y, snapPx, ls, first, budget);
      }
      // 0.29.0 끌어온 점의 나란함·수직 선이 만나는 점(inference.trackDirs { meets }): 첫 점 축·첫 점의 나란함·다른 끌어온 점의 축, 커서 둘레 선분, 커서 아래 면. 일곱 후보 뒤 차례
      const meet = tracks && refsBefore ? this.trackDirMeet(inf!, refsBefore, f, x, y, snapPx, tracks, first, d, nearSegs, pointerType, vis, !!so.through) : null;
      // 0.30.0 두 끌어온 점의 안내 선끼리 만나는 점(trackDirs { meets: { guides: true } }): 같은 기준 선분(이 고르기가 바꾸기 전)에 대한 두 점의 선. 여덟 후보 뒤 차례
      const guideRef = tracks && tracks.length > 1 && refsBefore && inf!.trackDirs !== true && inf!.trackDirs!.meetGuides ? this.trackDirBase(inf, refsBefore) : null;
      const guide = guideRef ? trackDirPairSnap(f, tracks!, guideRef, x, y, snapPx, first) : null;
      // 0.31.0 안내 선의 열린 교차(trackDirs { meets: { open: true } } — refine이 있을 때만): 끌어온 점의 나란함·수직 선(첫 점과 같은 점은 뺀다 — 0.29.0과 같다)이
      // 커서 둘레 토막과 3D로 만나지 않지만 그 활꼴을 지날 만큼 가까우면 앱 refine('axisEdge', open — 축 이름 없는 그 선)이 준 곡선 위 교차. 0.20.0 열린 교차와 같은 셈·한도·기억
      // (한도는 앞의 열린 교차들이 먼저 쓴다). 아홉 후보 뒤 차례
      const openRef = tracks && refsBefore && so.refine && inf!.trackDirs !== true && inf!.trackDirs!.meetOpen ? this.trackDirBase(inf, refsBefore) : null;
      let openG: { snap: OpenEdgeSnap<NearSegment>; line: OpenRefineLine } | null = null;
      if (openRef) {
        const ls: OpenRefineLine[] = [];
        for (const P of tracks!) if (!first || !sameTrackPoint(P, first)) for (const g of trackDirGuides(P, openRef)) ls.push({ from: P, dir: g.dir, track: true, guide: g.kind });
        if (ls.length) openG = this.openLineEdge(so, f, x, y, snapPx, ls, first, nearSegs(), budget, vis);
        lensLines.push(...ls);
      }
      // 0.32.0 안내 선의 면의 열린 교차(trackDirs { meets: { openFaces: true } } — refineFace가 있을 때만): 같은 안내 선이 커서 둘레 삼각형을 뚫지 않지만
      // 그 삼각형과 곡면 사이를 지날 만큼 가까우면 앱 refineFace('axisFace', open — 축 이름 없는 그 선)가 준 곡면 위 교차. 0.22.0 면의 열린 교차와 같은 셈·한도·기억. 열 후보 뒤 차례
      const openFaceRef = tracks && refsBefore && so.refineFace && inf!.trackDirs !== true && inf!.trackDirs!.meetOpenFaces ? this.trackDirBase(inf, refsBefore) : null;
      let openGF: { snap: OpenFaceSnap<NearTriangle>; line: OpenRefineLine } | null = null;
      if (openFaceRef) {
        const ls: OpenRefineLine[] = [];
        for (const P of tracks!) if (!first || !sameTrackPoint(P, first)) for (const g of trackDirGuides(P, openFaceRef)) ls.push({ from: P, dir: g.dir, track: true, guide: g.kind });
        if (ls.length) openGF = this.openLineFace(so, f, x, y, snapPx, ls, first, budget);
      }
      // 0.33.0 refineEnds: 끌어온 축·첫 점 축·안내 선이 커서 둘레 꺾은선 꼭짓점을 반 화소 안으로 지나는 자리(선분 교차·열린 교차에서 빠지는 자리)의
      // 앱 refine('axisEdge', open — point = 꼭짓점을 그 선에 내린 발)이 준 곡선 위 교차. 0.20.0 열린 교차와 같은 받는 규칙·한도·기억. 열한 후보 뒤 차례
      let ends: { snap: OpenEdgeSnap<NearSegment>; line: OpenRefineLine } | null = null;
      let endRef: [V3, V3] | null = null;
      if (so.ends && (tracks || axisEdges)) {
        const el = this.endLines(inf!, f, first, null, refsBefore);
        endRef = el.ref;
        if (el.lines.length) ends = this.openLineEdge(so, f, x, y, snapPx, el.lines, first, nearSegs(), budget, vis, null);
      }
      // 0.40.0 openEdgeLens: 같은 선(첫 점 축·끌어온 축·안내 선)이 현이 커서에서 붙잡기 거리 밖인 토막(활꼴 띠가 커서에 닿는 토막)의 활꼴을 지나는 열린 교차.
      // 남은 호출 한도로 묻고(앞의 열린 후보가 먼저 쓴다), 열두 후보 뒤 차례
      const lens = so.lens && lensLines.length ? this.openLensEdge(so, f, x, y, snapPx, lensLines, first, nearSegs, lensSegs, budget, vis) : null;
      const t = chooseTrackPoint<{ distPx: number }>([cross, pair, edge, axe, face, openE?.snap, openF?.snap, meet?.snap, guide, openG?.snap, openGF?.snap, ends?.snap, lens?.snap]);
      if (t && t === cross) return { p: cross.p, vertex: true, kind: 'axis', axis: cross.axis, direction: cross.direction!, trackFrom: cross.from };
      if (t && t === pair) {
        const out: MeasurePick = { p: pair.p, vertex: true, kind: 'axis', axis: pair.axis, trackFrom: pair.from, trackOther: pair.other! };
        const dir = along(pair.from, pair.axis);
        if (dir) out.direction = dir;
        return out;
      }
      if (t && t === edge) {
        // 그 선분 위 점(segment — 0.16.0 선분 위 점과 같은 식별자). 그 선분 직선이 첫 점을 지나면 0.12.0처럼 그 방향으로 잠글 수 있다
        const out: MeasurePick = { p: edge.p, vertex: true, kind: 'axis', axis: edge.axis, trackFrom: edge.from };
        const sg = nearSegmentId(edge.seg);
        if (sg) out.segment = copySegment(sg);
        const dir = along(edge.from, edge.axis);
        if (dir) out.direction = dir;
        else {
          const l = first ? this.lineLockAt(f, first, edge.p, [edge.seg.a, edge.seg.b], null) : null;
          if (l) out.lineLock = l;
        }
        // 0.18.0 다듬기: 앱이 끌어온 축 직선과 그 선분의 곡선이 만나는 점을 주면 그 점(축 위로 내린 자리). 잠글 방향은 코어 점으로 정했다(0.14.0 규칙)
        const rp = sg && so.refine ? this.axisEdgeRefined(so, f, x, y, snapPx, edge.p, sg, axisRefineLine(edge.from, edge.axis), first) : null;
        if (rp) {
          out.p = rp;
          out.refined = true;
        }
        return out;
      }
      if (t && t === axe) {
        // 0.18.0 첫 점 축과 선분의 교차: 첫 점 축 위 점이라 그 축 방향(잠글 때), 그 선분 식별자(segment)
        const out: MeasurePick = { p: axe.p, vertex: true, kind: 'axis', axis: axe.axis, direction: axe.direction };
        const sg = nearSegmentId(axe.seg);
        if (sg) out.segment = copySegment(sg);
        const rp = sg && so.refine ? this.axisEdgeRefined(so, f, x, y, snapPx, axe.p, sg, axisRefineLine(first!, axe.axis), first) : null;
        if (rp) {
          out.p = rp;
          out.refined = true;
        }
        return out;
      }
      if (t && t === face) {
        // 0.18.0 축과 면의 교차: 그 면(face). 첫 점 축이면 그 축 방향(잠글 때), 끌어온 축이면 끌어온 점(그 축 선이 첫 점도 지나면 방향도)
        const h = face.hit;
        const out: MeasurePick = { p: face.p, vertex: true, kind: 'axis', axis: face.axis, face: { id: h.id, index: h.index, normal: h.normal } };
        if (first && face.line < 3) out.direction = face.direction;
        else {
          out.trackFrom = face.from;
          const dir = along(face.from, face.axis);
          if (dir) out.direction = dir;
        }
        // 0.19.0 다듬기: 앱이 그 축 직선과 정확한 곡면의 교차를 주면 그 점(축 위로 내린 자리). 잠글 방향은 코어 점으로 정했다(0.14.0 규칙).
        // 0.37.0: 칸을 얕게 뚫는 축은 넓힌 받기(그 칸 위 곡면 조각 자리·커서에서 붙잡기 거리 안 — 같은 평면 짝 위면 face가 그 삼각형)
        const rp = so.refineFace ? this.axisFaceRefined(so, f, x, y, snapPx, face.p, out.face!, axisRefineLine(face.from, face.axis), first, h) : null;
        if (rp) {
          out.p = rp.p;
          out.face = rp.face;
          out.refined = true;
        }
        return out;
      }
      // 0.20.0 열린 교차: 앱이 준 곡선 위 교차(축 위로 내린 자리 — 다듬은 점). 첫 점 축이면 그 축 방향(잠글 때), 끌어온 축이면 끌어온 점(그 축 선이 첫 점도 지나면 방향도)
      if (t && openE && t === openE.snap) return this.openEdgePick(f, openE, first, null, null, null);
      if (t && openF && t === openF.snap) {
        // 0.22.0 면의 열린 교차: 앱이 준 곡면 위 교차(축 위로 내린 자리 — 다듬은 점)와 그 삼각형(face — 0.18.0 축과 면의 교차와 같은 꼴). 방향·끌어온 점은 열린 교차와 같다
        const { snap: o, line: l } = openF;
        const out: MeasurePick = { p: o.p, vertex: true, kind: 'axis', axis: l.axis!, face: copyFace(o.tri) };
        if (l.track) {
          out.trackFrom = [l.from[0], l.from[1], l.from[2]];
          const dir = along(l.from, l.axis!);
          if (dir) out.direction = dir;
        } else out.direction = [l.dir[0], l.dir[1], l.dir[2]];
        out.refined = true;
        return out;
      }
      if (t && meet && t === meet.snap) {
        this.parallelRef = refsBefore!.parallel;
        this.trackDirRef = refsBefore!.track;
        this.parallelOwn = refsBefore!.own;
        return this.trackDirMeetPick(so, f, x, y, snapPx, meet, first);
      }
      if (t && guide && t === guide) {
        // 0.30.0: 만나는 점에 붙은 동안 기준 선분이 바뀌지 않게(0.29.0 만나는 점과 같다). 정확한 직선끼리라 다듬지 않고 잠글 방향도 없다
        this.parallelRef = refsBefore!.parallel;
        this.trackDirRef = refsBefore!.track;
        this.parallelOwn = refsBefore!.own;
        return { p: guide.p, vertex: true, kind: guide.kind, trackFrom: guide.from, edge: [[...guideRef![0]] as V3, [...guideRef![1]] as V3], trackGuide: copyDirLine(guide.other) };
      }
      // 0.31.0 안내 선의 열린 교차: 앱이 준 곡선 위 교차(그 안내 선 위로 내린 자리 — 다듬은 점)와 그 토막(segment). 0.29.0 만나는 점처럼 기준 선분을 되돌리고,
      // 첫 점을 지나는 선이 아니라 잠글 방향이 없다(0.20.0 열린 교차처럼 선분 방향 잠금도 보지 않는다)
      if (t && openG && t === openG.snap) return this.openEdgePick(f, openG, first, null, openRef, refsBefore);
      if (t && openGF && t === openGF.snap) {
        // 0.32.0 안내 선의 면의 열린 교차: 앱이 준 곡면 위 교차(그 안내 선 위로 내린 자리 — 다듬은 점)와 그 삼각형(face). 0.31.0 열린 교차처럼 기준 선분을 되돌리고 잠글 방향이 없다
        this.parallelRef = refsBefore!.parallel;
        this.trackDirRef = refsBefore!.track;
        this.parallelOwn = refsBefore!.own;
        const { snap: o, line: l } = openGF;
        return {
          p: o.p,
          vertex: true,
          kind: l.guide!,
          trackFrom: [l.from[0], l.from[1], l.from[2]],
          edge: [[...openFaceRef![0]] as V3, [...openFaceRef![1]] as V3],
          face: copyFace(o.tri),
          refined: true,
        };
      }
      // 0.33.0 꼭짓점을 지나는 선의 다듬은 교차: 축이면 열린 교차(0.20.0), 안내 선이면 안내 선의 열린 교차(0.31.0)와 같은 값
      if (t && ends && t === ends.snap) return this.openEdgePick(f, ends, first, null, endRef, refsBefore);
      // 0.40.0 띠로 모은 토막의 열린 교차: 축이면 열린 교차(0.20.0), 안내 선이면 안내 선의 열린 교차(0.31.0)와 같은 값
      if (t && lens && t === lens.snap) return lens.line.guide ? this.openEdgePick(f, lens, first, null, openRef, refsBefore) : this.openEdgePick(f, lens, first, null, null, null);
    }
    // 축(0.9.0)·나란함(0.10.0): 점 붙잡기가 하나도 없을 때만 첫 점을 지나는 선에(화면에서 가까운 것, 같으면 축)
    if (first && noPointLine && (inf?.axes || inf?.parallel)) {
      const a = inf.axes ? axisSnap(f, first, x, y, snapPx) : null;
      // 0.29.0: 첫 점 나란함 기준 거르기를 줬으면 그것이 받은 기준(parallelOwn), 아니면 지나간 선분(0.28.0)
      const ref = inf.parallel ? (inf.parallelEdge ? this.parallelOwn : this.parallelRef) : null;
      const pr = ref ? parallelSnap(f, first, ref, x, y, snapPx, inf.axes) : null;
      if (a && (!pr || a.distPx <= pr.distPx)) return { p: a.p, vertex: true, kind: 'axis', axis: a.axis, direction: axisLock(a.axis).direction };
      if (pr) return { p: pr.p, vertex: true, kind: 'parallel', direction: pr.direction, edge: ref! };
    }
    // 끌어온 점을 지나는 축(0.16.0): 첫 점 축·나란함 다음(첫 점 전에도). 첫 점 축이 아니므로 방향(잠글 것)이 없다
    if (tracks && noPointLine) {
      const t = trackAxisSnap(f, tracks, x, y, snapPx, first);
      // 0.27.0 끌어온 점에서 기준 선분과 나란함·수직(inference.trackDirs): 끌어온 축과 화면에서 가까운 것(같으면 끌어온 축). 첫 점을 지나지 않아 방향(잠글 것)이 없다
      // 0.28.0: 기준 선분 거르기를 줬으면 그것이 받은 기준(trackDirRef), 아니면 0.27.0처럼 지나간 선분(parallelRef)
      const ref = this.trackDirBase(inf);
      const g = ref ? trackDirSnap(f, tracks, ref, x, y, snapPx, first) : null;
      if (g && (!t || g.distPx < t.distPx)) return { p: g.p, vertex: true, kind: g.kind, trackFrom: g.from, edge: ref! };
      if (t) return { p: t.p, vertex: true, kind: 'axis', axis: t.axis, trackFrom: t.from };
    }
    // 0.41.0: 다른 붙잡기가 하나도 없으면(점 붙잡기와 위의 선 붙잡기 모두) 'fallback' 앱 점 — 붙잡지 않은 자리(선분·면 위 점)보다 먼저.
    // 그 뒤는 앱 점이 이긴 것과 같은 길(수직 발 방향·선분 방향 잠금)
    if (noPoint) {
      const q = fallbackAt();
      if (q) {
        const e = endsAt(q);
        if (e) return e;
        r = q;
      }
    }
    // 그 점이 놓인 선분 식별자(0.16.0): 아래 점 붙잡기·선분 위 점에 싣는다(다듬은 점도 같은 선분)
    const sg = snapSegmentsOf(r, d);
    const seg = (m: MeasurePick): MeasurePick => {
      if (sg) {
        m.segment = sg.segment;
        if (sg.other) m.other = sg.other;
        else delete m.other;
      }
      return m;
    };
    // 다듬기(0.14.0): 수직 발·코어 가운데 점·선분 위 점이면 앱이 정확한 형상 위로 옮긴 점(받을 수 있을 때만). 잠금·축·나란함은 위에서 이미 돌아갔다.
    // 0.15.0: 코어 교차점도. 열린 후보는 이미 다듬은 점이다(다시 부르지 않는다)
    const rp = r?.refined ? r.p : so.refine && r ? this.refinedAt(so, f, x, y, snapPx, r, d, first) : null;
    // 수직 발(0.10.0): 첫 점 → 발 방향(잠글 때). 다듬은 발이면 첫 점 → 다듬은 발
    if (r && r.kind === 'perpendicular' && first) {
      const dir = unitDir(first, rp ?? r.p);
      if (dir) return seg(rp ? { ...r, p: rp, direction: dir, refined: true } : { ...r, direction: dir });
    }
    // 선분 방향 잠금(0.12.0): 점 붙잡기(또는 고른 선분 위 점)가 놓인 선분 직선이 첫 점을 지나면 Shift·setMeasureInferenceLock(true)가 그 방향으로 잠근다.
    // 고른 선분(d.ends)을 먼저 보고, 점 붙잡기면 커서 둘레 선분도 본다(여러 모서리가 만나는 꼭짓점에서 고르기가 다른 모서리를 골랐을 때).
    // 0.14.0: 판정은 코어 점(꺾은선 토막 위)으로 한다 — 다듬어도 잠글 방향은 0.13.0과 같다(0.15.0 열린 교차점은 다듬기 전 코어 점 core)
    if (first && r && r.kind !== 'perpendicular') {
      const ends = d && r.p === d.snap ? d.ends : undefined;
      if (r.kind || ends) {
        const l = this.lineLockAt(f, first, r.core ?? r.p, ends, r.kind ? nearSegs : null);
        if (l) return seg(rp ? { ...r, p: rp, lineLock: l, refined: true } : { ...r, lineLock: l });
      }
    }
    if (!r) return null;
    if (sg) return seg(rp ? { ...r, p: rp, refined: true } : { ...r });
    if (rp) return { ...r, p: rp, refined: true };
    // 0.21.0: 붙잡지 않은 그물 면 위 점(고르기가 맞은 삼각형 위 점 그대로)이면 앱 refineFace('onFace')가 준 곡면 위 점(커서 광선 위로 내린 자리)
    const rf = so.refineFace && !r.kind && !r.refined && d && r.p === d.snap ? this.onFaceRefined(so, f, x, y, snapPx, d, first) : null;
    return rf ? { ...r, p: rf, refined: true } : r;
  }

  /**
   * 0.33.0 refineEnds가 보는 선: 잠근 동안(lock)이면 잠근 선(inference.lockEdges일 때만). 아니면 끌어온 점(첫 점과 같은 점은 뺀다)의 X·Y·Z 축(끌어온 점이 있을 때 —
   * 0.17.0 끌어온 축과 선분의 교차), 첫 점 X·Y·Z 축(axisEdges — 끌어온 축과 같은 직선이면 한 번, 0.20.0 열린 교차와 같다), 끌어온 점의 나란함·수직 선
   * (trackDirs { meets } — 이 고르기가 바꾸기 전의 기준 선분 refs에 대한 것, 0.29.0 만나는 점과 같다). ref는 그 안내 선의 기준 선분(없으면 null)
   */
  private endLines(
    inf: NormalizedInference,
    f: ViewFrame,
    first: V3 | null,
    lock: InferenceLock | null,
    refs: { parallel: [V3, V3] | null; track: [V3, V3] | null; own: [V3, V3] | null } | null,
  ): { lines: OpenRefineLine[]; ref: [V3, V3] | null } {
    const ls: OpenRefineLine[] = [];
    if (lock) {
      if (first && inf.lockEdges) ls.push({ from: first, dir: lock.direction, ...(lock.axis ? { axis: lock.axis } : {}), track: false });
      return { lines: ls, ref: null };
    }
    const tracks = this.tracker?.size ? this.tracker.view : null;
    const axes: SnapAxis[] = ['x', 'y', 'z'];
    if (tracks) for (const P of tracks) if (!first || !sameTrackPoint(P, first)) for (const axis of axes) ls.push({ from: P, dir: axisLock(axis).direction, axis, track: true });
    if (first && inf.axisEdges)
      for (const axis of axes) if (!ls.some((l) => l.axis === axis && trackAlongFirst(f, first, l.from, axis))) ls.push({ from: first, dir: axisLock(axis).direction, axis, track: false });
    const ref = tracks && refs && inf.trackDirs && inf.trackDirs !== true && inf.trackDirs.meets ? this.trackDirBase(inf, refs) : null;
    if (ref) for (const P of tracks!) if (!first || !sameTrackPoint(P, first)) for (const g of trackDirGuides(P, ref)) ls.push({ from: P, dir: g.dir, track: true, guide: g.kind });
    return { lines: ls, ref };
  }

  /**
   * 선과 꺾은선 토막의 열린 교차(0.20.0 openLineEdge — 0.33.0 꼭짓점을 지나는 선도) → 측정 점 고르기 결과. 다듬은 점(refined)과 그 토막(segment)에
   * - 안내 선(line.guide — 0.31.0): 안내 종류·끌어온 점·기준 선분 ref(edge). 0.29.0 만나는 점처럼 기준 선분을 이 고르기 전(refs)으로 되돌린다. 잠글 방향이 없다
   * - 잠근 동안(lockOut — 0.20.0 잠근 선의 열린 교차): 잠근 선 위 점
   * - 축(0.20.0): snap 'axis'·axis. 첫 점 축이면 그 축 방향(잠글 때), 끌어온 축이면 끌어온 점(그 축 선이 첫 점도 지나면 방향도)
   */
  private openEdgePick(
    f: ViewFrame,
    o: { snap: OpenEdgeSnap<NearSegment>; line: OpenRefineLine },
    first: V3 | null,
    lockOut: ((p: V3) => MeasurePick) | null,
    ref: [V3, V3] | null,
    refs: { parallel: [V3, V3] | null; track: [V3, V3] | null; own: [V3, V3] | null } | null,
  ): MeasurePick {
    const { snap: s, line: l } = o;
    const guide = !!(l.guide && ref);
    let out: MeasurePick;
    if (guide) {
      if (refs) {
        this.parallelRef = refs.parallel;
        this.trackDirRef = refs.track;
        this.parallelOwn = refs.own;
      }
      out = { p: s.p, vertex: true, kind: l.guide!, trackFrom: [l.from[0], l.from[1], l.from[2]], edge: [[...ref![0]] as V3, [...ref![1]] as V3] };
    } else out = lockOut ? lockOut(s.p) : { p: s.p, vertex: true, kind: 'axis', axis: l.axis! };
    // 필드 차례는 0.32.0 값과 같게(토막 → 끌어온 점·방향 → 다듬음)
    const sg = nearSegmentId(s.seg);
    if (sg) out.segment = copySegment(sg);
    if (!guide && !lockOut) {
      if (l.track) {
        out.trackFrom = [l.from[0], l.from[1], l.from[2]];
        const dir = first ? trackAlongFirst(f, first, l.from, l.axis!) : null;
        if (dir) out.direction = dir;
      } else out.direction = [l.dir[0], l.dir[1], l.dir[2]];
    }
    out.refined = true;
    return out;
  }

  /**
   * 끌어온 점의 나란함·수직 기준 선분(0.27.0 inference.trackDirs — 꺼져 있으면 null): 0.28.0 거르기 edge를 줬으면 그것이 받은 기준(trackDirRef),
   * 아니면 지나간 선분(parallelRef — 0.29.0 { meets }만 줘도 그대로). refs를 주면 지금 기준 대신 그것(0.29.0 — 이 고르기가 바꾸기 전의 기준)
   */
  private trackDirBase(inf: NormalizedInference | null | undefined, refs?: { parallel: [V3, V3] | null; track: [V3, V3] | null }): [V3, V3] | null {
    const td = inf?.trackDirs;
    if (!td) return null;
    const r = refs ?? { parallel: this.parallelRef, track: this.trackDirRef };
    return td !== true && td.edge ? r.track : r.parallel;
  }

  /**
   * 0.29.0 끌어온 점의 나란함·수직 선이 만나는 점(inference.trackDirs { meets } — 순수 trackDirMeetSnap): 만나 보는 직선은 첫 점을 지나는 X·Y·Z 축,
   * 첫 점의 나란함(parallel을 켰고 0.10.0 기준 선분이 축과 나란하지 않을 때 — 축과 나란하면 그 축이 맡는다), 다른 끌어온 점(첫 점과 같은 점은 뺀다)의 X·Y·Z 축
   * (그 축이 첫 점 축과 같은 직선이면 첫 점 축만 — 열린 교차와 같다). 선분은 커서 둘레 선분·윤곽선(가림은 vis), 면은 커서 아래 그물 면(axisFaces와 같은 다시 맞춰 보기 —
   * 반투명 너머 고르기 반영). 기준 선분은 이 고르기가 바꾸기 전의 것(refs — 끌어온 점의 기준과 첫 점의 나란함 기준 모두). 기준 선분이 없거나 만나는 점이 없으면 null
   */
  private trackDirMeet(
    inf: NormalizedInference,
    refs: { parallel: [V3, V3] | null; track: [V3, V3] | null; own: [V3, V3] | null },
    f: ViewFrame,
    x: number,
    y: number,
    snapPx: number,
    tracks: readonly V3[],
    first: V3 | null,
    d: PickDetail | null,
    nearSegs: () => NearSegment[],
    pointerType: string | undefined,
    vis: (p: V3, sg: NearSegment) => boolean,
    through: boolean,
  ): TrackDirMeet | null {
    const ref = this.trackDirBase(inf, refs);
    if (!ref) return null;
    const lines: TrackDirOtherLine<MeetTag>[] = [];
    const axes: SnapAxis[] = ['x', 'y', 'z'];
    if (first) {
      for (const axis of axes) lines.push({ from: first, dir: axisLock(axis).direction, tag: { kind: 'axis', axis } });
      // 0.29.0: 첫 점 나란함 기준 거르기를 줬으면 그것이 받은 기준
      const pr = inf.parallel ? (inf.parallelEdge ? refs.own : refs.parallel) : null;
      const e = pr ? unitDir(pr[0], pr[1]) : null;
      if (pr && e && !axisAligned(e)) lines.push({ from: first, dir: e, tag: { kind: 'parallel', dir: e, edge: pr } });
    }
    for (const Q of tracks) {
      if (first && sameTrackPoint(Q, first)) continue;
      for (const axis of axes) if (!(first && trackAlongFirst(f, first, Q, axis))) lines.push({ from: Q, dir: axisLock(axis).direction, tag: { kind: 'track', from: Q, axis } });
    }
    const under = faceHitOf(d);
    const snap = trackDirMeetSnap<NearSegment, FaceHit, MeetTag>(f, tracks, ref, x, y, snapPx, {
      skip: first,
      lines,
      segs: nearSegs(),
      visible: vis,
      under,
      hitAt: under ? (sx, sy) => faceHitOf(this.pickDetail(sx, sy, true, pointerType, false, false, true, through)) : null,
    });
    return snap ? { snap, ref } : null;
  }

  /**
   * 0.29.0 끌어온 점 안내 선이 만나는 점 → 측정 점 고르기 결과: snap은 안내 종류('parallel'·'perpendicular'), trackFrom은 끌어온 점, edge는 기준 선분(0.27.0과 같다)에
   * 만난 것을 싣는다 — 첫 점 축이면 axis·direction(잠그면 그 축 — lineLock), 첫 점의 나란함이면 direction(잠그면 그 나란함), 다른 끌어온 점의 축이면 trackOther,
   * 선분이면 segment(그 선분 직선이 첫 점을 지나면 0.17.0처럼 그 방향으로 잠근다), 면이면 face. 선분·면은 앱 refine('axisEdge')·refineFace('axisFace')에
   * 안내 선(SnapRefineLine — 축 이름 없음)을 넘겨 다듬는다(받는 규칙·기억은 0.20.0 축이 아닌 잠근 선과 같다)
   */
  private trackDirMeetPick(so: NonNullable<Viewer3d['snapOpt']>, f: ViewFrame, x: number, y: number, snapPx: number, m: TrackDirMeet, first: V3 | null): MeasurePick {
    const s = m.snap;
    const out: MeasurePick = { p: s.p, vertex: true, kind: s.kind, trackFrom: s.from, edge: [[...m.ref[0]] as V3, [...m.ref[1]] as V3] };
    const line: SnapRefineLine = { origin: [s.from[0], s.from[1], s.from[2]], dir: [s.dir[0], s.dir[1], s.dir[2]] };
    const k = s.meet;
    if (k.kind === 'line') {
      const tag = k.tag!;
      if (tag.kind === 'axis') {
        out.axis = tag.axis;
        out.direction = axisLock(tag.axis).direction;
        out.lineLock = axisLock(tag.axis);
      } else if (tag.kind === 'parallel') {
        out.direction = [tag.dir[0], tag.dir[1], tag.dir[2]];
        out.lineLock = { kind: 'parallel', direction: [tag.dir[0], tag.dir[1], tag.dir[2]], edge: [[...tag.edge[0]] as V3, [...tag.edge[1]] as V3] };
      } else out.trackOther = { from: [tag.from[0], tag.from[1], tag.from[2]], axis: tag.axis };
      return out;
    }
    if (k.kind === 'edge') {
      const sg = nearSegmentId(k.seg);
      if (sg) out.segment = copySegment(sg);
      const l = first ? this.lineLockAt(f, first, s.p, [k.seg.a, k.seg.b], null) : null;
      if (l) out.lineLock = l;
      const rp = sg && so.refine ? this.axisEdgeRefined(so, f, x, y, snapPx, s.p, sg, line, first) : null;
      if (rp) {
        out.p = rp;
        out.refined = true;
      }
      return out;
    }
    const h = k.hit;
    out.face = copyFace(h);
    // 0.37.0: 칸을 얕게 뚫는 안내 선은 넓힌 받기(axisFaceRefined — 같은 평면 짝 위면 face가 그 삼각형)
    const rp = so.refineFace ? this.axisFaceRefined(so, f, x, y, snapPx, s.p, out.face, line, first, h) : null;
    if (rp) {
      out.p = rp.p;
      out.face = rp.face;
      out.refined = true;
    }
    return out;
  }

  /**
   * 기준 선분 거르기(0.28.0 끌어온 점 — inference.trackDirs { edge }, 0.29.0 첫 점 나란함 — inference.parallelEdge): 고른 선분·윤곽선 d를 앱 함수에 물어 true면 받는다.
   * 바로 앞에 물은 것과 같은 선분(같은 묶음 객체·종류·배열 안 번호·끝점)이면 다시 묻지 않는다 — 기억은 slot마다 하나이고, 다른 slot이 같은 함수로 같은 선분을
   * 바로 앞에 물었으면 그 답을 쓴다(두 거르기에 같은 함수를 주면 한 번만 묻는다). 앱 함수가 던지면 받지 않는다
   */
  private edgeOk(edge: TrackDirEdgeFilter, d: PickDetail, slot: 'track' | 'parallel'): boolean {
    const pk = d.pick;
    const ends = d.ends;
    const it = this.items.get(pk.id);
    const item = it && ((pk.kind === 'line' && it.kind === 'line') || (pk.kind === 'edge' && it.kind === 'mesh')) ? it.item : null;
    if (!ends || !item || (pk.kind !== 'line' && pk.kind !== 'edge')) return false;
    const raw = pk.raw ?? pk.index;
    const same = (a: readonly number[], b: readonly number[]): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    const hit = (q: EdgeAsked | null): boolean => !!q && q.fn === edge && q.item === item && q.kind === pk.kind && q.raw === raw && same(q.ends[0], ends[0]) && same(q.ends[1], ends[1]);
    const mine = slot === 'track' ? this.trackDirAsked : this.parallelAsked;
    const other = slot === 'track' ? this.parallelAsked : this.trackDirAsked;
    if (hit(mine)) return mine!.ok;
    let ok = false;
    if (hit(other)) ok = other!.ok;
    else
      try {
        ok = edge(copySegment({ kind: pk.kind, id: pk.id, index: pk.index, raw, ends }), item) === true;
      } catch {
        ok = false;
      }
    const q: EdgeAsked = { fn: edge, item, kind: pk.kind, raw, ends: [[...ends[0]], [...ends[1]]], ok };
    if (slot === 'track') this.trackDirAsked = q;
    else this.parallelAsked = q;
    return ok;
  }

  /**
   * 붙잡지 않은 면 위 점 다듬기(0.21.0, 'onFace'): 고르기가 맞은 그물 면(잘린 면 채움이 아닌 삼각형 — faceHitOf)의 점 d.snap을 그 면·커서 광선(line = ray)과 함께
   * 앱 refineFace에 넘겨 받을 수 있는 점(acceptOnFace — 커서 광선 위로 내린 자리가 앱 점에서 화면 반 화소 안, 코어 점에서 맞은 삼각형의 가장 긴 변 × ON_FACE_CHORD 안,
   * 눈 뒤·가까운 면 앞이 아님, 그 그물 단면에서 남는 쪽)이면 그 자리. 아니면 null(삼각형 위 점 그대로). 바로 앞 입력과 같으면(같은 자리 미리 보기 뒤 누르기)
   * 앞 결과를 쓴다(0.14.0 'onEdge'와 같다 — 커서마다 다른 광선이라 열쇠 기억에는 넣지 않는다). 가림은 다시 따지지 않는다('axisFace'와 같다)
   */
  private onFaceRefined(so: NonNullable<Viewer3d['snapOpt']>, f: ViewFrame, x: number, y: number, snapPx: number, d: PickDetail, first: V3 | null): V3 | null {
    const refine = so.refineFace;
    const hit = faceHitOf(d);
    if (!refine || !hit || !d.corners) return null;
    const core = d.snap;
    const ray = screenRay(f, x, y);
    const input: SnapRefineFaceInput = {
      kind: 'onFace',
      point: [core[0], core[1], core[2]],
      face: { id: hit.id, index: hit.index, normal: [hit.normal[0]!, hit.normal[1]!, hit.normal[2]!] },
      line: { origin: [ray.origin[0], ray.origin[1], ray.origin[2]], dir: [ray.dir[0], ray.dir[1], ray.dir[2]] },
      first: first ? [first[0], first[1], first[2]] : null,
      ray: { origin: [ray.origin[0], ray.origin[1], ray.origin[2]], dir: [ray.dir[0], ray.dir[1], ray.dir[2]] },
    };
    const key = openRefineKey(input);
    let q: V3 | null;
    const memo = so.ofMemo;
    if (memo && memo.key === key) q = memo.res;
    else {
      q = finitePoint(refine(input));
      so.ofMemo = { key, res: q };
    }
    if (!q) return null;
    const p = acceptOnFace(f, core, q, ray, d.corners, snapPx);
    return p && !this.clippedAway(p, hit.id, hit.index) ? p : null;
  }

  /**
   * 측정 붙잡기 다듬기(0.14.0): 고른 점 r이 다듬을 종류(refineTarget — 코어 수직 발·코어 선분 가운데 점·붙잡지 않은 선분 위 점, 0.15.0 코어 교차점)면 앱 refine을 불러
   * 받을 수 있는 점(수 셋, 코어 점에서 화면 붙잡기 거리 안, 그 묶음(교차점이면 두 묶음) 단면의 남는 쪽)이면 그 점. 아니면 null(코어 점 그대로).
   * 바로 앞 호출과 입력이 같으면 앞 결과를 쓴다(같은 자리 미리 보기 뒤 누르기 — 미리 본 점이 그대로 찍힌다)
   */
  private refinedAt(so: NonNullable<Viewer3d['snapOpt']>, f: ViewFrame, x: number, y: number, snapPx: number, r: MeasureSnapPick, d: PickDetail | null, first: V3 | null): V3 | null {
    const t = refineTarget(r, d);
    if (!t || !so.refine) return null;
    const ray = screenRay(f, x, y);
    // 앱이 입력을 고쳐도 기억이 바뀌지 않게 앱에는 따로 만든 복사본을 준다
    const make = (): SnapRefineInput => {
      const c: SnapRefineInput = {
        kind: t.kind,
        point: [r.p[0], r.p[1], r.p[2]],
        segment: { ...t.segment, ends: [[...t.segment.ends[0]] as V3, [...t.segment.ends[1]] as V3] },
        first: first ? [first[0], first[1], first[2]] : null,
        ray: { origin: [...ray.origin] as V3, dir: [...ray.dir] as V3 },
      };
      if (t.other) c.other = { ...t.other, ends: [[...t.other.ends[0]] as V3, [...t.other.ends[1]] as V3] };
      return c;
    };
    const input = make();
    let q: V3 | null;
    const memo = so.rfMemo;
    if (memo && sameRefineInput(memo.input, input)) q = memo.res;
    else {
      q = finitePoint(so.refine(make()));
      so.rfMemo = { input, res: q };
    }
    const sg = t.segment, o = t.other;
    if (!q || !acceptRefined(f, r.p, q, snapPx) || this.clippedAway(q, sg.id, sg.raw, sg.kind === 'edge') || (o && this.clippedAway(q, o.id, o.raw, o.kind === 'edge'))) return null;
    return [q[0], q[1], q[2]];
  }

  /**
   * 축과 선분의 교차 다듬기(0.18.0, 'axisEdge'): 코어 점 core(축과 꺾은선 토막의 교차), 그 토막 sg, 축 직선 line(지나는 점·단위 방향·축 이름 — 0.20.0부터 잠근 선이면
   * 축이 아닌 직선도, 그때 axis가 없다)을 앱 refine에 넘겨 받을 수 있는 점(acceptOnLine — 그 직선 위로 내린 자리가 앱 점에서 화면 반 화소 안, 코어 점에서 화면 붙잡기 거리 안,
   * 그 묶음 단면에서 남는 쪽)이면 그 자리. 아니면 null(코어 점 그대로). 결과는 커서 광선을 뺀 입력(종류·코어 점·토막·축 직선·첫 점)으로 기억한다(0.15.0 열린 후보의
   * RefineMemo — 커서가 그 둘레를 움직이는 동안 다시 부르지 않는다). 가림은 다시 따지지 않는다(0.14.0과 같다 — 코어 점이 보이므로 그 바로 둘레다).
   * 0.38.0: 앱 점이 코어 점에서 화면 붙잡기 거리 밖이면(선이 현을 얕게 가로지른다) 열린 교차와 같은 규칙으로 한 번 더 본다(track.ts acceptEdgePatch — 그 선 위·
   * 그 토막 곡선 조각 자리·커서에서 붙잡기 거리 안). 그때는 열린 교차와 같은 가림(snapVisible)을 본다.
   * 0.39.0 refineSnapToExact(so.exact): 커서에서 붙잡기 거리 밖이어도 코어 점에서 화면 EXACT_SNAP_SCALE × 붙잡기 거리·토막 길이 안이면 받는다(같은 교차의 정확한 자리)
   */
  private axisEdgeRefined(
    so: NonNullable<Viewer3d['snapOpt']>,
    f: ViewFrame,
    x: number,
    y: number,
    snapPx: number,
    core: V3,
    sg: SnapSegment,
    line: SnapRefineLine,
    first: V3 | null,
  ): V3 | null {
    const refine = so.refine;
    if (!refine) return null;
    const ray = screenRay(f, x, y);
    const input: SnapRefineInput = {
      kind: 'axisEdge',
      point: [core[0], core[1], core[2]],
      segment: copySegment(sg),
      first: first ? [first[0], first[1], first[2]] : null,
      ray: { origin: [...ray.origin] as V3, dir: [...ray.dir] as V3 },
      line: copyLine(line),
    };
    const key = openRefineKey(input);
    let q = so.openMemo.get(key);
    if (q === undefined) {
      q = finitePoint(refine(input));
      so.openMemo.set(key, q);
    }
    if (!q) return null;
    const p = acceptOnLine(f, core, q, line, snapPx);
    if (p) return this.clippedAway(p, sg.id, sg.raw, sg.kind === 'edge') ? null : p;
    // 0.38.0: 현을 얕게 가로지르는 선 — 앱 점이 그 토막 곡선 조각 자리이고 커서에서 붙잡기 거리 안이면 받는다(코어 점에서는 붙잡기 거리 밖).
    // 코어 점에서 멀 수 있으므로 열린 교차와 같은 가림(snapVisible)을 본다. 0.39.0 refineSnapToExact: 커서에서 붙잡기 거리 밖이어도 코어 점에서 화면
    // EXACT_SNAP_SCALE × 붙잡기 거리·토막 길이 안이면(같은 교차의 정확한 자리) 받는다
    const w = acceptEdgePatch(f, core, q, line, sg.ends, x, y, snapPx, so.exact ? EXACT_SNAP_SCALE * snapPx : null);
    if (!w || this.clippedAway(w.p, sg.id, sg.raw, sg.kind === 'edge')) return null;
    const sp = projectToScreen(f, w.p);
    return sp && this.snapVisible(f, w.p, sp[0], sp[1], sg.id, sg.raw, sg.kind === 'edge') ? w.p : null;
  }

  /**
   * 축이 면을 뚫는 점 다듬기(0.19.0, 'axisFace'): 코어 점 core(축과 삼각형 평면의 교차), 그 면 face, 축 직선 line(0.20.0부터 잠근 선이면 축이 아닌 직선도)을 앱 refineFace에 넘겨
   * 받을 수 있는 점이면 그 자리와 면. 받는 규칙·기억은 axisEdgeRefined와 같다(acceptOnLine, 그 그물 단면에서 남는 쪽, 커서 광선을 뺀 입력으로 RefineMemo — 열쇠의 선분 자리에 면).
   * 가림은 다시 따지지 않는다(곡면 위 점은 삼각형으로 만든 면에서 처짐만큼 벗어나 면 깊이와 어긋날 수 있다 — 코어 점이 보이므로 그 바로 둘레다).
   * 0.37.0: 앱 점이 코어 점에서 화면 붙잡기 거리 밖이면(선이 칸을 얕게 뚫는다) 열린 면 교차와 같은 규칙으로 한 번 더 본다(track.ts acceptFacePatch — 그 선 위·그 칸 위 곡면 조각 자리·
   * 커서에서 붙잡기 거리 안, hit의 꼭짓점과 같은 평면 짝은 그 세 변 가운데 자리에서 모은다 — edgeNeighbors). 그때는 열린 면 교차와 같은 가림(openFaceVisible)을 보고,
   * 앱 점이 같은 평면 짝 위면 face가 그 삼각형이다. hit이 없거나 꼭짓점이 없으면 0.36.0 그대로.
   * 0.39.0 refineSnapToExact(so.exact): 커서에서 붙잡기 거리 밖이어도 코어 점에서 화면 EXACT_SNAP_SCALE × 붙잡기 거리·칸 크기 안이면 받는다(같은 교차의 정확한 자리).
   * 0.53.0(NC 56차): 그래도 받지 못하면 커서 광선이 맞은 삼각형(같은 평면 짝, 또는 그 자리에 겹친 다른 그물 삼각형 — 같은 구멍을 판 두 면에서 뚫은 벽)도 칸 조각 후보로 한 번 더 본다
   */
  private axisFaceRefined(
    so: NonNullable<Viewer3d['snapOpt']>,
    f: ViewFrame,
    x: number,
    y: number,
    snapPx: number,
    core: V3,
    face: SnapFace,
    line: SnapRefineLine,
    first: V3 | null,
    hit?: FaceHit | null,
  ): { p: V3; face: SnapFace } | null {
    const refine = so.refineFace;
    if (!refine) return null;
    const ray = screenRay(f, x, y);
    const input: SnapRefineFaceInput = {
      kind: 'axisFace',
      point: [core[0], core[1], core[2]],
      face: copyFace(face),
      line: copyLine(line),
      first: first ? [first[0], first[1], first[2]] : null,
      ray: { origin: [...ray.origin] as V3, dir: [...ray.dir] as V3 },
    };
    const key = openRefineKey(input);
    let q = so.openMemo.get(key);
    if (q === undefined) {
      q = finitePoint(refine(input));
      so.openMemo.set(key, q);
    }
    if (!q) return null;
    const p = acceptOnLine(f, core, q, line, snapPx);
    if (p) return this.clippedAway(p, face.id, face.index) ? null : { p, face };
    // 0.37.0: 칸을 얕게 뚫는 선 — 앱 점이 그 칸 위 곡면 조각 자리이고 커서에서 붙잡기 거리 안이면 받는다(코어 점에서는 붙잡기 거리 밖)
    if (!hit?.corners || hit.id !== face.id || hit.index !== face.index) return null;
    const t: NearTriangle = { corners: hit.corners, wpp: worldPerPixel(f, viewDepth(f, core)), id: face.id, index: face.index, normal: [face.normal[0], face.normal[1], face.normal[2]] };
    const mates = this.edgeNeighbors(f, t);
    // 0.39.0 refineSnapToExact: 커서에서 붙잡기 거리 밖이어도 코어 점에서 화면 EXACT_SNAP_SCALE × 붙잡기 거리·칸 크기 안이면(같은 교차의 정확한 자리) 받는다
    const exactPx = so.exact ? EXACT_SNAP_SCALE * snapPx : null;
    let w = acceptFacePatch(f, core, q, line, t.corners, mates.map((n) => n.corners), x, y, snapPx, exactPx);
    if (!w) {
      // 0.53.0(NC 56차): 같은 자리에 다른 그물 삼각형이 겹치면(판 윗면·아랫면에서 뚫은 같은 구멍 벽) 변 가운데 둘레 삼각형 모으기(6개까지)가 그 겹친 것으로 차
      // 같은 평면 짝을 놓친다 — 커서 광선이 맞은 삼각형도 칸 조각 후보로 본다(X 삼각형과 꼭짓점 둘을 함께 쓰는 같은 평면 삼각형일 때만 — 같은 그물의 짝, 또는 그 짝 자리에
      // 겹친 다른 그물 삼각형). 처음 받기가 실패한 자리만 다시 보므로 받던 자리는 그대로다
      const c = this.cursorTriangle(f, x, y, so.through);
      if (c && !(c.id === t.id && c.index === t.index) && !mates.some((n) => n.id === c.id && n.index === c.index)) {
        mates.push(c);
        w = acceptFacePatch(f, core, q, line, t.corners, mates.map((n) => n.corners), x, y, snapPx, exactPx);
      }
    }
    if (!w) return null;
    const on = w.cell ? mates[w.cell - 1]! : t;
    if (this.clippedAway(w.p, on.id, on.index) || !this.openFaceVisible(f, w.p, on)) return null;
    return { p: w.p, face: w.cell ? copyFace(on) : face };
  }

  /**
   * 면의 열린 교차가 받는 앱 점 p가 보이는지(0.22.0 openLineFace의 가림 — 0.37.0부터 닫힌 면 교차의 넓힌 받기도): 그 화면 자리에서 가리지 않거나(snapVisible),
   * 0.23.0: 곡면이 오목하게 보이는 자리(구멍 안쪽 벽)는 앱 점이 그 삼각형(과 이웃) 뒤라 그 조각에 가린다 — 그 자리 광선이 처음 맞은 불투명 면이
   * 그 삼각형이나 꼭짓점을 함께 쓰는 이웃이고 앱 점이 그 면에서 처짐 한도 안이면 보인다고 본다(track.ts hiddenByOwnPatch). 음영 계열에서만 가린다
   */
  private openFaceVisible(f: ViewFrame, p: V3, t: NearTriangle): boolean {
    const sp = projectToScreen(f, p);
    if (!sp) return false;
    if (this.snapVisible(f, p, sp[0], sp[1], t.id, t.index)) return true;
    if (!this.shadedMode) return false;
    const d = this.pickDetail(sp[0], sp[1], true, undefined, false, false, true, true);
    const k = d?.pick;
    if (!k || k.kind !== 'mesh' || k.section || k.id !== t.id || !k.normal || !d!.corners) return false;
    return hiddenByOwnPatch(t.corners, { corners: d!.corners, point: k.point, normal: k.normal }, p, 2 * t.wpp);
  }

  /**
   * 선과 꺾은선 토막의 열린 교차(0.20.0, track.ts openEdgeSnap): 선 lines(끌어온 축·첫 점 축·잠근 선)가 커서 둘레 토막 segs(선분 식별자가 있는 것만)와 3D로 만나지 않지만
   * 그 활꼴을 지날 만큼 가까우면 앱 refine을 'axisEdge'·open = true로 불러(point = 선 위에서 토막에 가장 가까운 점, line = 그 선) 곡선과의 교차를 받는다.
   * 받는 규칙은 openEdgeSnap(그 선 위로 내린 자리, 코어 점·커서에서 붙잡기 거리 안, 그 토막의 곡선 조각 자리, 단면에서 남는 쪽, 가리지 않음).
   * 앱 함수는 미리 보기 한 번에 budget.calls(0.15.0 열린 후보와 함께 쓰는 OPEN_REFINE_CALLS)번까지만 새로 부르고, 결과는 커서 광선을 뺀 입력으로 기억한다
   * (0.18.0 'axisEdge'와 같은 꼴의 열쇠 — 잠그기 전 첫 점 축과 잠근 축이 같은 열쇠다. 0.36.0부터 끝에 '#open'이 붙어 같은 입력의 닫힌 'axisEdge'와 따로 묻는다). 받은 것이 없으면 null.
   * 0.33.0: at이 undefined가 아니면 열린 교차 대신 선이 꺾은선 꼭짓점을 반 화소 안으로 지나는 자리(track.ts vertexEdgeSnap — refineEnds)를 같은 부르기·한도·기억으로 본다
   * (at = 끝점 붙잡기가 고른 꼭짓점 — 그 자리만, null이면 커서 둘레 토막의 모든 끝)
   * 0.40.0 from: 열린 교차 후보를 낼 토막(띠로 모은 토막 — openLensEdge). segs는 이웃 판정에도 쓴다
   */
  private openLineEdge(
    so: NonNullable<Viewer3d['snapOpt']>,
    f: ViewFrame,
    x: number,
    y: number,
    snapPx: number,
    lines: readonly OpenRefineLine[],
    first: V3 | null,
    segs: readonly NearSegment[],
    budget: { calls: number },
    vis: (p: V3, sg: NearSegment) => boolean,
    at?: V3 | null,
    from?: readonly NearSegment[],
  ): { snap: OpenEdgeSnap<NearSegment>; line: OpenRefineLine } | null {
    const refine = so.refine;
    if (!refine || !lines.length) return null;
    const ids = new Map<NearSegment, SnapSegment>();
    for (const s of segs) {
      const g = nearSegmentId(s);
      if (g) ids.set(s, g);
    }
    if (!ids.size) return null;
    const ray = screenRay(f, x, y);
    const ask = (c: OpenEdgeCandidate<NearSegment>): V3 | null => {
      const input: SnapRefineInput = {
        kind: 'axisEdge',
        point: [c.p[0], c.p[1], c.p[2]],
        segment: copySegment(ids.get(c.seg)!),
        first: first ? [first[0], first[1], first[2]] : null,
        ray: { origin: [...ray.origin] as V3, dir: [...ray.dir] as V3 },
        line: copyLine(refineLineOf(lines[c.line]!)),
        open: true,
      };
      const key = openRefineKey(input);
      let q = so.openMemo.get(key);
      if (q === undefined) {
        if (budget.calls <= 0) return null;
        budget.calls--;
        q = finitePoint(refine(input));
        so.openMemo.set(key, q);
      }
      return q;
    };
    const list = [...ids.keys()];
    const r = from
      ? lensEdgeSnap(f, lines, list, from.filter((s) => ids.has(s)), x, y, snapPx, ask, vis)
      : at === undefined
        ? openEdgeSnap(f, lines, list, x, y, snapPx, ask, vis)
        : vertexEdgeSnap(f, lines, list, x, y, snapPx, ask, vis, at);
    return r ? { snap: r, line: lines[r.line]! } : null;
  }

  /**
   * 0.40.0 openEdgeLens: 아주 가까이 확대해 처짐이 화면에서 붙잡기 거리보다 큰 꺾은선 토막의 교차(track.ts lensEdgeSnap). 선 lines 가운데 화면에서 커서 붙잡기 거리 안인 것만 보고
   * (lineScreenGap — 받는 점은 그 선 위·커서에서 붙잡기 거리 안), 활꼴 띠(현에서 OPEN_EDGE_CHORD × 토막 길이 안 — 0.23.0 받는 범위)가 커서 붙잡기 거리 안에 닿는 토막(lens — 띠와
   * 거리 차례로 LENS_SEGMENTS개까지) 가운데 커서 둘레 토막(near)에 없는 것의 열린 교차와, near·lens 모두에서 선이 현을 가로지르는 자리가 커서에서 먼 교차(가로지르는 자리를 힌트로)를
   * 'axisEdge'·open = true로 묻는다. 받는 규칙·기억은 0.20.0 열린 교차(openLineEdge)와 같고, 이웃 판정은 near와 lens를 함께 본다. 호출 한도 budget은 앞의 열린 후보들이 쓰고 남은 것이다
   */
  private openLensEdge(
    so: NonNullable<Viewer3d['snapOpt']>,
    f: ViewFrame,
    x: number,
    y: number,
    snapPx: number,
    lines: readonly OpenRefineLine[],
    first: V3 | null,
    near: () => NearSegment[],
    lens: () => NearSegment[],
    budget: { calls: number },
    vis: (p: V3, sg: NearSegment) => boolean,
  ): { snap: OpenEdgeSnap<NearSegment>; line: OpenRefineLine } | null {
    if (!so.lens || !so.refine) return null;
    const ls = lines.filter((l) => lineScreenGap(f, l.from, l.dir, x, y) <= snapPx);
    if (!ls.length) return null;
    // 커서 둘레 토막은 띠로 모은 같은 토막의 활꼴 높이 어림(sag)을 싣는다(가로지르는 자리가 먼 교차 거르기 — 곧은 토막은 빠진다). 띠로 모은 것 가운데 커서 둘레에 없는 것이 열린 교차 후보
    const key = (s: NearSegment): string => `${s.kind}\u0000${s.id}\u0000${s.raw}`;
    const L = lens();
    const byKey = new Map(L.map((s) => [key(s), s]));
    const n = near().map((s) => {
      const l = byKey.get(key(s));
      return l?.sag !== undefined ? { ...s, sag: l.sag } : s;
    });
    const nk = new Set(n.map(key));
    const extra = L.filter((s) => !nk.has(key(s)));
    return n.length || extra.length ? this.openLineEdge(so, f, x, y, snapPx, ls, first, [...n, ...extra], budget, vis, undefined, extra) : null;
  }

  /**
   * 선과 삼각형의 열린 교차(0.22.0, track.ts openFaceSnap): 선 lines(끌어온 축·첫 점 축·잠근 선)가 커서 둘레 그물 삼각형(trianglesAround — 붙잡기 거리 안)을 뚫지 않지만
   * 그 삼각형과 곡면 사이를 지날 만큼 가까우면 앱 refineFace를 'axisFace'·open = true로 불러(point = 선 위에서 삼각형에 가장 가까운 점, face = 그 삼각형, line = 그 선)
   * 곡면과의 교차를 받는다. 받는 규칙은 openFaceSnap(그 선 위로 내린 자리, 코어 점·커서에서 붙잡기 거리 안, 그 삼각형 위 곡면 조각 자리, 단면에서 남는 쪽, 가리지 않음).
   * 앱 함수는 미리 보기 한 번에 budget.calls(0.15.0·0.20.0 열린 후보와 함께 쓰는 OPEN_REFINE_CALLS — 그 둘이 먼저 쓴다)번까지만 새로 부르고, 결과는 커서 광선을 뺀 입력으로
   * 기억한다(0.19.0 'axisFace'와 같은 꼴의 열쇠 — 잠그기 전 첫 점 축과 잠근 축이 같은 열쇠다. 0.36.0부터 끝에 '#open'이 붙어, 뚫는 칸의 힌트가 코어 'axisFace'의 점과
   * 같아도 따로 묻고 각자 제 답을 쓴다). 받은 것이 없으면 null
   */
  private openLineFace(
    so: NonNullable<Viewer3d['snapOpt']>,
    f: ViewFrame,
    x: number,
    y: number,
    snapPx: number,
    lines: readonly OpenRefineLine[],
    first: V3 | null,
    budget: { calls: number },
  ): { snap: OpenFaceSnap<NearTriangle>; line: OpenRefineLine } | null {
    const refine = so.refineFace;
    if (!refine) return null;
    const ray = screenRay(f, x, y);
    // 화면에 그린 선이 커서에서 붙잡기 거리 안을 지나는 선만(받는 점은 선 위·커서에서 붙잡기 거리 안이다) — 대부분의 미리 보기에서 삼각형 모으기를 건너뛴다
    const near = lines.filter((l) => lineNearCursor(f, ray, l.from, l.dir, x, y, snapPx));
    if (!near.length) return null;
    const tris = this.trianglesAround(f, x, y, snapPx);
    if (!tris.length) return null;
    const r = openFaceSnap(
      f,
      near,
      tris,
      x,
      y,
      snapPx,
      (c) => {
        const input: SnapRefineFaceInput = {
          kind: 'axisFace',
          point: [c.p[0], c.p[1], c.p[2]],
          face: copyFace(c.tri),
          line: copyLine(refineLineOf(near[c.line]!)),
          first: first ? [first[0], first[1], first[2]] : null,
          ray: { origin: [...ray.origin] as V3, dir: [...ray.dir] as V3 },
          open: true,
        };
        const key = openRefineKey(input);
        let q = so.openMemo.get(key);
        if (q === undefined) {
          if (budget.calls <= 0) return null;
          budget.calls--;
          q = finitePoint(refine(input));
          so.openMemo.set(key, q);
        }
        return q;
      },
      (p, t) => this.openFaceVisible(f, p, t),
      // 0.24.0 둘째 힌트를 둘지 볼 이웃: 커서 둘레 삼각형(붙잡기 거리 안)에 없을 수 있어 그 삼각형 세 변 가운데의 화면 자리에서 모은다(같은 그물만)
      (t) => this.edgeNeighbors(f, t),
    );
    return r ? { snap: r, line: near[r.line]! } : null;
  }

  /** 삼각형 t의 세 변 가운데 화면 자리에서 1화소 안의 같은 그물 삼각형(0.24.0 면의 열린 교차 둘째 힌트 — 변을 함께 쓰는 이웃 찾기, 자리마다 6개까지) */
  /** 0.53.0 커서 광선이 처음 맞은 그물 삼각형(그물 면만 — 잘린 면 아님, through면 반투명 그물을 지나) — 칸 조각 후보 꼴(없으면 null) */
  private cursorTriangle(f: ViewFrame, x: number, y: number, through: boolean): NearTriangle | null {
    const d = this.pickDetail(x, y, true, undefined, false, false, true, through);
    const k = d?.pick;
    if (!k || k.kind !== 'mesh' || k.section || !k.normal || !d!.corners) return null;
    return { corners: d!.corners, wpp: worldPerPixel(f, viewDepth(f, k.point)), id: k.id, index: k.index, normal: [k.normal[0], k.normal[1], k.normal[2]] };
  }

  private edgeNeighbors(f: ViewFrame, t: NearTriangle): NearTriangle[] {
    const out: NearTriangle[] = [];
    const c = t.corners;
    for (let k = 0; k < 3; k++) {
      const a = c[k]!, b = c[(k + 1) % 3]!;
      const s = projectToScreen(f, [(a[0]! + b[0]!) / 2, (a[1]! + b[1]!) / 2, (a[2]! + b[2]!) / 2]);
      if (!s) continue;
      for (const n of this.trianglesAround(f, s[0], s[1], 1, 6)) if (n.id === t.id && n.index !== t.index) out.push(n);
    }
    return out;
  }

  /** 커서 tolPx 안의 보이는 그물 삼각형(0.22.0 선과 삼각형의 열린 교차 — scenepick.ts trianglesNear)과 그 깊이의 화소 세계 길이 */
  private trianglesAround(f: ViewFrame, x: number, y: number, tolPx: number, max?: number): NearTriangle[] {
    const hits = trianglesNear(f, x, y, this.visibleItems(), {
      bvh: (kind, positions, indices) => this.bvhFor(kind, positions, indices, true),
      bounds: (it) => this.boundsOf(it),
      model: (m) => this.modelOf(m),
      ...this.clipOpts(),
      hidden: (it) => this.hiddenOf(it),
    }, tolPx, max);
    return hits.map((h) => {
      const t: NearTriangle = { corners: h.corners, wpp: worldPerPixel(f, h.depth), id: h.id, index: h.index, normal: h.normal };
      if (h.keep) t.keep = h.keep;
      return t;
    });
  }

  /**
   * 잠근 선 위의 교차(0.19.0 — inference.lockEdges·lockFaces, 잠근 동안 커서 아래 점 붙잡기가 없을 때): 첫 점을 지나는 잠근 선이 커서 둘레 선분과 3D로 만나는 점
   * (lockEdgeSnap — 0.18.0 axisEdgeSnap과 같은 허용치·빼는 규칙·가림)과 커서 아래 보이는 그물 면을 뚫는 점(lockFaceSnap — axisFaceSnap과 같다)을 견줘
   * (선분 → 면 차례, chooseTrackPoint — 뒤 차례는 TRACK_YIELD_PX 넘게 가까워야) 잠근 선 위 점(lockOut)에 그 선분(segment)·면(face)을 싣는다.
   * 앱 refine('axisEdge')·refineFace('axisFace')로 다듬는다(잠그기 전 첫 점 축 교차와 같은 축 직선·코어 점이라 기억을 함께 쓴다). 0.20.0: 나란함·수직·선분 방향·
   * 앱이 정한 방향으로 잠근 선(축이 아닌 직선 — SnapRefineLine.axis 없음)도 다듬고, refine이 있으면 잠근 선이 토막과 3D로 만나지 않고 활꼴만 지나는 열린 교차
   * (openLineEdge — 면 뒤 차례)도 본다. 0.21.0: tracks(inference.lockTracks를 켜고 끌어온 점이 있을 때)면 잠근 선이 끌어온 축과 만나는 점
   * (lockTrackSnap — 축으로 잠갔으면 잠근 축 위 끌어온 점과 나란한 자리)을 그 셋보다 먼저 견준다(만나는 끌어온 축은 trackOther, 나란한 자리뿐이면 trackFrom —
   * 다듬지 않는다, 축 위 점이다). 0.22.0: lockFaces와 refineFace가 있으면 잠근 선이 커서 둘레 삼각형을 비켜 가며 곡면만 뚫는 자리(openLineFace — 열린 교차 뒤 차례,
   * 그 삼각형 face·refined)도 본다. 다 없으면 null
   */
  private lockedMeet(
    so: NonNullable<Viewer3d['snapOpt']>,
    inf: NormalizedInference,
    f: ViewFrame,
    x: number,
    y: number,
    snapPx: number,
    first: V3,
    lock: InferenceLock,
    d: PickDetail | null,
    nearSegs: () => NearSegment[],
    pointerType: string | undefined,
    lockOut: (p: V3) => MeasurePick,
    budget: { calls: number },
    tracks: readonly V3[] | null,
    lensSegs: () => NearSegment[],
  ): MeasurePick | null {
    const vis = (p: V3, sg: NearSegment): boolean => {
      const sp = projectToScreen(f, p);
      return !!sp && this.snapVisible(f, p, sp[0], sp[1], sg.id, sg.raw, sg.kind === 'edge');
    };
    const trk = tracks ? lockTrackSnap(f, first, lock.direction, tracks, x, y, snapPx) : null;
    const edge = inf.lockEdges ? lockEdgeSnap(f, first, lock.direction, nearSegs(), x, y, snapPx, vis) : null;
    const under = inf.lockFaces ? faceHitOf(d) : null;
    const face = under
      ? lockFaceSnap(f, first, lock.direction, x, y, snapPx, under, (sx, sy) => faceHitOf(this.pickDetail(sx, sy, true, pointerType, false, false, true, so.through)))
      : null;
    const line: OpenRefineLine = { from: first, dir: lock.direction, ...(lock.axis ? { axis: lock.axis } : {}), track: false };
    const open = inf.lockEdges && so.refine ? this.openLineEdge(so, f, x, y, snapPx, [line], first, nearSegs(), budget, vis) : null;
    // 0.22.0 면의 열린 교차(lockFaces와 refineFace가 있을 때): 잠근 선이 커서 둘레 삼각형을 비켜 가며 곡면만 뚫는 자리 — 열린 교차 뒤 차례
    const openF = inf.lockFaces && so.refineFace ? this.openLineFace(so, f, x, y, snapPx, [line], first, budget) : null;
    // 0.33.0 refineEnds: 잠근 선이 커서 둘레 꺾은선 꼭짓점을 반 화소 안으로 지나는 자리(선분 교차에서 빠지는 자리)의 다듬은 교차 — 면의 열린 교차 뒤 차례
    const ends = inf.lockEdges && so.ends ? this.openLineEdge(so, f, x, y, snapPx, [line], first, nearSegs(), budget, vis, null) : null;
    // 0.40.0 openEdgeLens: 잠근 선이 현이 커서에서 붙잡기 거리 밖인 토막(활꼴 띠가 커서에 닿는 토막)의 활꼴을 지나는 열린 교차 — 남은 호출 한도로, 꼭짓점 다듬기 뒤 차례
    const lens = inf.lockEdges && so.lens ? this.openLensEdge(so, f, x, y, snapPx, [line], first, nearSegs, lensSegs, budget, vis) : null;
    const t = chooseTrackPoint<{ distPx: number }>([trk, edge, face, open?.snap, openF?.snap, ends?.snap, lens?.snap]);
    if (!t) return null;
    if (ends && t === ends.snap) return this.openEdgePick(f, ends, first, lockOut, null, null);
    if (lens && t === lens.snap) return this.openEdgePick(f, lens, first, lockOut, null, null);
    if (t === trk) {
      const out = lockOut(trk.p);
      if (trk.axis) out.trackOther = { from: trk.from, axis: trk.axis };
      else out.trackFrom = trk.from;
      return out;
    }
    let out: MeasurePick;
    let rp: V3 | null = null;
    if (t === edge) {
      out = lockOut(edge.p);
      const sg = nearSegmentId(edge.seg);
      if (sg) out.segment = copySegment(sg);
      if (sg && so.refine) rp = this.axisEdgeRefined(so, f, x, y, snapPx, edge.p, sg, refineLineOf(line), first);
    } else if (t === face) {
      const h = face.hit;
      out = lockOut(face.p);
      out.face = { id: h.id, index: h.index, normal: h.normal };
      // 0.37.0: 칸을 얕게 뚫는 잠근 선은 넓힌 받기(axisFaceRefined — 같은 평면 짝 위면 face가 그 삼각형)
      const r = so.refineFace ? this.axisFaceRefined(so, f, x, y, snapPx, face.p, out.face, refineLineOf(line), first, h) : null;
      if (r) {
        rp = r.p;
        out.face = r.face;
      }
    } else if (open && t === open.snap) {
      out = lockOut(open.snap.p);
      const sg = nearSegmentId(open.snap.seg);
      if (sg) out.segment = copySegment(sg);
      out.refined = true;
    } else {
      out = lockOut(openF!.snap.p);
      out.face = copyFace(openF!.snap.tri);
      out.refined = true;
    }
    if (rp) {
      out.p = rp;
      out.refined = true;
    }
    return out;
  }

  /**
   * 세계 점 p가 묶음 id의 단면 평면(여러 단면이면 그 묶음을 자르는 것, 없는 묶음이면 모든 묶음을 자르는 평면)에 잘린 쪽인지.
   * 0.45.0: raw(그 묶음의 기본 도형 번호 — rawEdges면 윤곽선 번호)를 주면 그 도형이 든 구간 단면(0.44.0)의 평면도 본다
   */
  private clippedAway(p: V3, id: string, raw?: number, rawEdges = false): boolean {
    const it = this.items.get(id);
    if (!it) return this.pointCut(p);
    for (const c of this.clipsFor(id)) if (planeValue(c, p[0], p[1], p[2]) > 1e-9 * (Math.abs(c[3]) + 1)) return true;
    return raw !== undefined && this.rangeCut(p, it, raw, rawEdges);
  }

  /**
   * 0.45.0 구간 단면: 묶음 it의 기본 도형 raw(rawEdges면 그물 윤곽선 선분)가 든 구간을 자르는 평면(그 묶음을 통째로 자르는 평면은 clipsFor가 본다)
   * 가운데 하나라도 p를 잘린 쪽에 두는지. 구간 단면이 없으면 곧바로 false(0.44.0 그대로)
   */
  private rangeCut(p: readonly number[], it: Item, raw: number, rawEdges: boolean): boolean {
    const cut = this.secCutOf(it);
    if (!cut || (rawEdges && !(it.kind === 'mesh' && it.item.edges))) return false;
    const mask = rawEdges ? cut.edgeMask(raw) : cut.primMask(raw);
    if (!mask) return false;
    const all = this.allSecs();
    for (const k of cutBits(mask)) {
      const s = all[k];
      if (!s) continue;
      const c = this.planeOf(s);
      if (planeValue(c, p[0]!, p[1]!, p[2]!) > 1e-9 * (Math.abs(c[3]) + 1)) return true;
    }
    return false;
  }

  /** 0.45.0: 묶음 id의 기본 도형 raw(rawEdges면 윤곽선 선분)를 숨겼는지(setHiddenRanges) */
  private rawHidden(id: string, raw: number, rawEdges: boolean): boolean {
    const r = this.rangeSel.get(id);
    const t = rawEdges ? r?.eTest : r?.test;
    return !!t && t(raw);
  }

  /**
   * 선분 방향 잠금(0.12.0, edgeLineLock): 첫 점 a, 붙잡은 점 p, 고른 선분 ends(있으면 먼저), near = 커서 둘레 선분(점 붙잡기일 때 — ends가 맞지 않을 때만 구한다).
   * 허용치는 그 점 깊이에서 화면 반 화소(0.9.0 교차점·수직 발과 같은 눈금 — float32 좌표의 같은 직선 위 선분도 된다)
   */
  private lineLockAt(f: ViewFrame, a: V3, p: V3, ends: [V3, V3] | undefined, near: (() => NearSegment[]) | null): InferenceLock | null {
    const tol = (q: V3): number => Math.max(0.5 * worldPerPixel(f, viewDepth(f, q)), 1e-12 * (1 + Math.hypot(q[0], q[1], q[2])));
    function* lines(): Generator<readonly [V3, V3]> {
      if (ends) yield ends;
      if (near) for (const s of near()) yield [s.a, s.b];
    }
    return edgeLineLock(a, p, lines(), tol(a), tol(p));
  }

  /**
   * 커서 tolPx 안의 보이는 선분(선분 묶음, edges면 그물 윤곽선)과 그 깊이의 화소 세계 길이(0.9.0 추론·0.12.0 선분 방향 잠금).
   * 0.40.0 chord(openEdgeLens): 선분 대신 그 활꼴 띠(현에서 chord × 선분 길이 안)가 커서 tolPx 안에 닿는 선분을 띠와의 거리 차례로 LENS_SEGMENTS개까지
   */
  private segmentsAround(f: ViewFrame, x: number, y: number, tolPx: number, edges: boolean, chord = 0): NearSegment[] {
    const segs = segmentsNear(f, x, y, this.visibleItems(), {
      ...(edges ? { edges: true, edgeHidden: (m: Mesh3d) => this.edgeHiddenOf(m) } : {}),
      bvh: (kind, positions, indices) => this.bvhFor(kind, positions, indices, true),
      limit: (id) => this.ranges.get(id)?.count,
      bounds: (it) => this.boundsOf(it),
      model: (m) => this.modelOf(m),
      ...this.clipOpts(),
      hidden: (it) => this.hiddenOf(it),
    }, tolPx, chord > 0 ? LENS_SEGMENTS : undefined, chord);
    return segs.map((s) => ({ a: s.a, b: s.b, id: s.id, keep: s.keep, wpp: worldPerPixel(f, s.depth), kind: s.kind, index: s.index, raw: s.raw, ...(s.sag !== undefined ? { sag: s.sag } : {}) }));
  }

  /**
   * 앱 붙잡기 후보 뒤에 추론 후보(0.9.0 — 커서 둘레 선분의 교차점·첫 점에서 내린 수직 발)를 잇는다.
   * 0.15.0: 그 뒤에 열린 후보(open — 다듬기가 있을 때만, 앱이 다듬은 점)를 잇는다. 거리가 같으면 앞의 것이 이긴다
   */
  private *withInference(inf: NormalizedInference, first: V3 | null, near: () => NearSegment[], app: Iterable<SnapCandidate>, open: (() => SnapCandidate[]) | null): Generator<SnapCandidate> {
    yield* app;
    if (!inf.intersections && !(inf.perpendicular && first)) return;
    for (const c of inferenceCandidates(near(), first, inf)) yield c;
    if (open) yield* open();
  }

  /**
   * 앱 붙잡기 후보: pointsFor(고른 것) 점(id가 없으면 고른 묶음), 늘 후보인 점. id가 있으면 묶음 행렬(분해도)을 따라 옮긴다.
   * 늘 후보인 점이 SNAP_INDEX_MIN개 이상이면(0.9.0) 색인에서 커서 둘레(붙잡기 거리 안일 수 있는 것)만 번호 차례로 — 결과는 모두 훑을 때와 같다.
   * 0.41.0 우선(SnapPoint.priority): 'low'는 후보에 실어 보내고, 'fallback'은 fb에 모은다(내보내지 않는다 — measureAt이 다른 붙잡기가 모두 없을 때 따로 고른다)
   */
  private *snapCandidates(f: ViewFrame, x: number, y: number, snapPx: number, pick: Pick3d | null, fb: SnapCandidate[]): Generator<SnapCandidate> {
    const so = this.snapOpt;
    if (!so) return;
    const at = (x: number, y: number, z: number, kind: SnapKind, id: string | undefined): SnapCandidate => {
      const m = id !== undefined ? this.looks.get(id)?.matrix : undefined;
      return { p: m ? transformPoint(m, [x, y, z]) : [x, y, z], kind, id };
    };
    // 우선이 있는 점: 'low'면 필드를 달아 내보내고 'fallback'이면 fb에 모은다(false = 내보내지 않음)
    const ranked = (c: SnapCandidate, pr: 'low' | 'fallback' | null): boolean => {
      if (!pr) return true;
      c.priority = pr;
      if (pr === 'low') return true;
      fb.push(c);
      return false;
    };
    const PR = so.prios;
    const prAt = (i: number): 'low' | 'fallback' | null => (!PR || !PR[i] ? null : PR[i] === 1 ? 'low' : 'fallback');
    const lim = so.limit;
    if (pick && so.pointsFor) {
      // 0.10.0: 바로 앞과 같은 고르기(같은 자리 — 미리 본 뒤 누르기, 붙잡기 한도·잠금이 바뀌어 다시 구하기)면 앞 결과를 다시 쓴다.
      // 0.38.0: 둘째 인자로 측정 첫 점(복사본)을 넘기고, pointsForFirst면 첫 점도 같아야 다시 쓴다
      const memo = so.pfMemo;
      const p0 = this.measurePts.length === 1 ? this.measurePts[0]! : null;
      let extra: readonly SnapPoint[] | null | undefined;
      if (memo && samePick(memo.pick, pick) && (!so.pfFirst || sameFirst(memo.first, p0))) extra = memo.res;
      else {
        const first: V3 | null = p0 ? [p0[0], p0[1], p0[2]] : null;
        const ctx: PointsForContext = { first: first ? [first[0], first[1], first[2]] : null };
        extra = so.pointsFor(pick, ctx);
        so.pfMemo = { pick: { ...pick, point: [...pick.point] as V3, ...(pick.normal ? { normal: [...pick.normal] as V3 } : {}) }, first, res: extra };
      }
      if (extra) {
        // 0.45.0: 점의 기본 도형 번호(SnapPoint.raw), 없으면 고른 묶음의 점은 고른 것의 번호(잘린 면을 고른 것이면 없음)
        const pr = snapRaw(pick.raw);
        for (const sp of extra) {
          const q = sp.point;
          if (q && Number.isFinite(q[0]) && Number.isFinite(q[1]) && Number.isFinite(q[2]) && withinSnapLimit(sp.order, lim)) {
            const id = sp.id ?? pick.id;
            const c = at(q[0]!, q[1]!, q[2]!, sp.kind ?? 'point', id);
            const r = snapRaw(sp.raw);
            if (r !== null) {
              c.raw = r;
              if (sp.edges === true) c.rawEdges = true;
            } else if (pr !== null && id === pick.id) {
              c.raw = pr;
              if (pick.kind === 'edge') c.rawEdges = true;
            }
            if (ranked(c, snapPriority(sp.priority))) yield c;
          }
        }
      }
    }
    // 0.45.0 늘 후보인 점의 기본 도형 번호(한 점도 없으면 null — 0.44.0 그대로)
    const RW = so.raws, RE = so.rawEdges;
    const rawAt = (c: SnapCandidate, i: number): SnapCandidate => {
      const r = RW![i]!;
      if (r >= 0) {
        c.raw = r;
        if (RE && RE[i]) c.rawEdges = true;
      }
      return c;
    };
    const P = so.pts;
    const n = P.length / 3;
    // 차례 한도(0.10.0): 한도와 차례 값이 모두 있을 때만 거른다
    const ord = lim !== null ? so.orders : null;
    if (n < SNAP_INDEX_MIN) {
      for (let i = 0; i < n; i++)
        if (!ord || ord[i]! < lim!) {
          const c = at(P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!, so.kinds[i]!, so.ids[i]);
          if (RW) rawAt(c, i);
          if (!PR || ranked(c, prAt(i))) yield c;
        }
      return;
    }
    so.index ??= new SnapPointIndex(P, so.ids, so.orders);
    const moved: string[] = [];
    for (const [id, l] of this.looks) if (l.matrix) moved.push(id);
    for (const i of so.index.near(f, x, y, snapPx, (id) => this.looks.get(id)?.matrix, moved, ord ? lim : null)) {
      const c = at(P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!, so.kinds[i]!, so.ids[i]);
      if (RW) rawAt(c, i);
      if (!PR || ranked(c, prAt(i))) yield c;
    }
  }

  /**
   * 앱 붙잡기 점이 보이는지: 묶음(id)이 보이고, 단면에 잘리지 않고(id면 그 묶음 평면, 아니면 모든 묶음을 자르는 평면), 음영 계열에서 가리지 않음.
   * 0.45.0: raw(그 묶음의 기본 도형 번호 — rawEdges면 윤곽선 번호)를 주면 그 도형을 숨겼으면(setHiddenRanges) 빼고, 그 도형이 든 구간 단면의 평면으로도 자른다
   */
  private snapVisible(f: ViewFrame, p: V3, sx: number, sy: number, id: string | undefined, raw?: number, rawEdges = false): boolean {
    if (id !== undefined) {
      const it = this.items.get(id);
      if (it && (!this.visible(it.item.id, it.item.group) || this.looks.get(id)?.pickable === false)) return false;
      if (it) {
        for (const c of this.clipsFor(id)) if (planeValue(c, p[0], p[1], p[2]) > 1e-9 * (Math.abs(c[3]) + 1)) return false;
        if (raw !== undefined && (this.rawHidden(id, raw, rawEdges) || this.rangeCut(p, it, raw, rawEdges))) return false;
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
    // 0.44.0 구간 단면 갈래 대리 묶음이면 그 갈래 평면들(평면 번호 k도 그 갈래 목록 안 번호)
    return { clips: (it) => this.itemClips(it), caps: (m, k) => this.cappedBy(m, all[this.itemSecIdx(m)[k ?? 0]!]), capGroup: (m) => m.capGroup, ...lk };
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

  /** 측정 점 하나를 찍는다(누르기·0.46.0 가상 커서 Enter·commitMeasureCandidate가 함께 쓴다 — 0.45.0 누르기의 찍기 그대로) */
  private commitMeasure(s: MeasurePick): void {
    if (this.measurePts.length >= 2) {
      this.measurePts = [];
      for (const cb of this.measureCbs) cb(null);
    }
    // 같은 점 객체가 두 번 찍혀도 종류를 따로 지키도록 복사해 넣는다(붙잡기 선택이 있을 때만 — 없으면 0.7.2 그대로)
    const p: V3 = this.snapOpt ? [s.p[0], s.p[1], s.p[2]] : s.p;
    this.measureSnaps.set(p, pointSnapOf(s));
    this.measurePts.push(p);
    this.measureHover = null;
    // 추론 잠금(0.10.0)은 그 측정의 두 점째에서 끝난다. 마지막으로 본 방향 추론은 첫 점이 바뀌면 잊는다.
    // 0.16.0: 끌어온 점도 두 점째에서 잊는다(첫 점에서는 남긴다 — 첫 점 축과 나란한 자리에 쓴다). 누르면 머무르기는 버린다
    if (this.measurePts.length === 2) {
      this.inferLock = null;
      this.clearTrack();
    } else if (this.tracker) {
      clearTimeout(this.dwellTimer);
      this.dwellTimer = 0;
      this.tracker.cancel();
    }
    this.lastLockable = null;
    const m = this.measurement();
    if (m) for (const cb of this.measureCbs) cb(m);
    this.invalidate();
  }

  // ───────────────────────── 내부: 키보드 붙잡기(0.46.0) ─────────────────────────

  private refsNow(): KeyRefs {
    return { parallel: this.parallelRef, track: this.trackDirRef, own: this.parallelOwn };
  }

  private refsSet(r: KeyRefs): void {
    this.parallelRef = r.parallel;
    this.trackDirRef = r.track;
    this.parallelOwn = r.own;
  }

  /**
   * 한 화면 자리의 측정 후보(차례대로, max개까지): 첫째는 그 자리 마우스 미리 보기와 같은 것(measureAt 그대로), 다음은 앞 후보로 고른 점 붙잡기 자리를 빼고 같은 measureAt —
   * 그래서 붙잡기 차례·우선(0.41.0)·다듬기·잠금·구간 단면이 그대로다. 점 붙잡기가 다하면 선 추론(축·나란함·끌어온 축·잠근 선 교차) 하나, 그다음 선 추론 없이
   * 'fallback' 앱 점과 붙잡지 않은 자리(선분·면 위 점, 잠근 동안이면 커서를 잠근 선에 내린 자리). 자리가 꼭 같은 결과는 앞의 것만 둔다.
   * 후보마다 같은 앞 상태(기준 선분 — refsBefore)에서 구하고, 끝나면 그 상태로 되돌린다(entry.after = 그 후보를 고른 뒤 상태)
   */
  private keyCandidates(x: number, y: number, pointerType: string, max: number): KeyEntry[] {
    const refs0 = this.refsNow();
    const out: KeyEntry[] = [];
    const skip: V3[] = [];
    let lines = true;
    for (let guard = 0; out.length < max && guard < 2 * max + 2; guard++) {
      this.refsSet(refs0);
      const kc: KeyPass = { skip: skip.slice(), lines, src: null };
      const m = this.measureAt(x, y, pointerType, undefined, kc);
      if (!m) break;
      if (!out.some((e) => samePoint3(e.pick.p, m.p))) out.push({ pick: m, skip: kc.skip, lines, after: this.refsNow() });
      const src = kc.src;
      if (src) {
        if (inPoints(skip, src)) break;
        skip.push([src[0], src[1], src[2]]);
      } else if (lines && m.kind) lines = false;
      else break;
    }
    this.refsSet(refs0);
    return out;
  }

  /** 측정 모드면 측정, 아니면 고르기 */
  private get keyMode(): 'measure' | 'pick' {
    return this.measuring ? 'measure' : 'pick';
  }

  /** 가상 커서 자리에서 후보를 다시 구하고(차례는 처음으로, keep이면 같은 점 후보 — 0.47.0 고르기 모드는 같은 고르기 후보 — 를 찾아 그 차례) 보인다. 알림은 부르는 쪽이 */
  private keyRecompute(keep = false): void {
    const c = this.keyCur;
    if (!c) return;
    if (this.measuring) {
      const shown = keep ? (c.list[c.index]?.pick ?? null) : null;
      c.list = this.keyCandidates(c.x, c.y, KEY_POINTER, KEY_CANDIDATES_MAX);
      c.picks = [];
      const i = shown ? c.list.findIndex((e) => samePoint3(e.pick.p, shown.p) && e.pick.kind === shown.kind) : 0;
      c.index = Math.max(0, i);
      c.pick = null;
      this.keyShow();
    } else {
      c.list = [];
      const pc = this.keySnap?.pickCycle;
      if (pc) {
        // 0.47.0 고르기 모드 후보 돌리기: 커서 자리에 겹친 고르기 후보(첫째 = 그 선택의 고르기)
        const shown = keep ? (c.picks[c.index]?.pick ?? null) : null;
        c.picks = this.pickList(c.x, c.y, KEY_POINTER, pc, KEY_CANDIDATES_MAX);
        const i = shown ? c.picks.findIndex((d) => samePickTarget(d.pick, shown)) : 0;
        c.index = Math.max(0, i);
        c.pick = c.picks[c.index]?.pick ?? null;
        return;
      }
      c.picks = [];
      c.index = 0;
      const d = this.sceneRef ? this.pickDetail(c.x, c.y, true, KEY_POINTER) : null;
      c.pick = d ? d.pick : null;
    }
  }

  /** 가상 커서 후보 수: 측정 모드는 측정 후보, 고르기 모드는 pickCycle일 때 겹친 고르기 후보(아니면 0 — 0.46.0) */
  private keyCount(c: NonNullable<Viewer3d['keyCur']>): number {
    return this.measuring ? c.list.length : this.keySnap?.pickCycle ? c.picks.length : 0;
  }

  /**
   * 지금 차례의 후보를 측정 미리 보기로(마우스 미리 보기와 같은 뒤처리 — 잠글 방향 기억). 끌어온 축 머무르기(0.16.0)는 하지 않는다 —
   * 손가락처럼 시간으로 정하는 몸짓이라(화면 읽기 프로그램이 알림을 읽는 동안 머문 점이 모두 끌려온다) 앱이 setMeasureTrackPoints로 준다
   */
  private keyShow(): void {
    const c = this.keyCur!;
    const e = c.list[c.index];
    if (e) this.refsSet(e.after);
    this.measureHover = e ? e.pick : null;
    this.lastHoverAt = { x: c.x, y: c.y, pointerType: KEY_POINTER };
    this.hoverAt = null;
    if (this.measurePts.length === 1 && !this.measureHover?.locked) this.lastLockable = this.hoverLock(this.measureHover) ?? this.lastLockable;
    if (this.tracker) this.dwell(this.measureHover, null);
  }

  /** 가상 커서를 켠다(캔버스 가운데) */
  private keyStart(): void {
    const lp = this.lastPtr;
    this.keyCur = { x: this.cssW / 2, y: this.cssH / 2, index: 0, list: [], picks: [], pick: null, ptr: lp ? { x: lp.x, y: lp.y } : null };
    this.keyRecompute();
    this.invalidate();
    this.keyAnnounce('start');
  }

  /** 가상 커서를 끈다(측정 미리 보기도 지운다). say = 알릴지 */
  private keyEnd(say: boolean): void {
    const c = this.keyCur;
    if (!c) return;
    const mode = this.keyMode;
    this.keyCur = null;
    if (this.lastHoverAt?.pointerType === KEY_POINTER) {
      this.measureHover = null;
      this.lastHoverAt = null;
      if (this.tracker) this.dwell(null, null);
    }
    this.invalidate();
    if (say && this.keySnap?.announce) this.keySnap.announce({ reason: 'end', mode, x: c.x, y: c.y, snap: null, index: 0, count: 0, pick: null, text: keySnapText(this.keySnap.msgs, 'end') });
  }

  /** 측정 모드의 첫 점에서 지금 후보까지 거리(첫 점만 찍었을 때) */
  private keyDistance(p: readonly number[] | null): number | null {
    const a = this.measurePts.length === 1 ? this.measurePts[0]! : null;
    return a && p ? Math.hypot(p[0]! - a[0], p[1]! - a[1], p[2]! - a[2]) : null;
  }

  /** 고른 것의 글: '이름 면'(이름이 없으면 id — 0.47.0 글 틀 pickItem·pick.*, 0.53.0 글 함수도, 0.54.0 이름은 앱 pickName이 정할 수 있다) */
  private pickText(p: Pick3d, msgs: KeySnapText): string {
    const it = this.items.get(p.id);
    let name = (it?.item.name || p.id).trim() || p.id;
    const fn = this.keySnap?.pickName;
    if (fn) {
      try {
        const s = fn({ ...p, point: [...p.point] as V3 });
        if (typeof s === 'string' && s.trim()) name = s.trim();
      } catch {
        // 앱 함수 오류 — 기본 이름
      }
    }
    const kind: KeySnapMessageKey = p.section ? 'pick.section' : `pick.${p.kind}`;
    return keySnapText(msgs, 'pickItem', [name, keySnapText(msgs, kind)]);
  }

  /** 알림을 만들어 앱에 넘긴다(extra = 찍은 점·측정 결과, lead = 지금 후보 글 대신 쓸 글) */
  private keyAnnounce(reason: KeyboardSnapAnnouncement['reason'], extra?: { point?: MeasurePoint; measurement?: MeasureResult | null; lead?: string }): void {
    const ks = this.keySnap, c = this.keyCur;
    if (!ks?.announce || !c) return;
    const mode = this.keyMode;
    const num = (v: number): string => this.fmt(v);
    const unit = UNIT_LABEL[this.sceneRef?.units ?? 'unknown'];
    const snap = mode === 'measure' ? this.measureHoverSnap : null;
    const count = this.keyCount(c);
    const index = count ? c.index : 0;
    // 0.47.0: 글은 글 틀(setKeyboardSnap messages — 주지 않으면 0.46.0과 같은 한국어)
    const M = ks.msgs;
    let body: string;
    if (mode === 'measure') body = candidateText(snap ? { kind: snap.snap, axis: snap.axis, locked: snap.locked, point: snap.point } : null, index, count, num, this.keyDistance(snap?.point ?? null), unit, M);
    // 0.47.0: 고르기 후보가 둘 이상이면 차례('상자 면 2/3: …' — 측정 후보 글과 같은 꼴)
    else body = c.pick ? orderedText(this.pickText(c.pick, M), index, count, pointText(c.pick.point, num, M), null, M) : keySnapText(M, 'noPick');
    let text = body;
    if (reason === 'start') text = keySnapText(M, 'start', [body, keySnapHint(ks.keys, mode, !!ks.pickCycle, M)]);
    else if (extra?.lead) text = extra.lead;
    else if (reason === 'cycle' && count === 1) text = keySnapText(M, 'only', [body]);
    const a: KeyboardSnapAnnouncement = { reason, mode, x: c.x, y: c.y, snap, index, count, pick: c.pick ? { ...c.pick, point: [...c.pick.point] as V3 } : null, text };
    if (extra?.point) a.point = extra.point;
    if (extra?.measurement) a.measurement = extra.measurement;
    ks.announce(a);
  }

  /**
   * 키보드 붙잡기 키(켰을 때만 — handleKey 맨 앞). 걷기 중·앱이 이미 기본 동작을 막은 키·캔버스가 아닌 대상의 키(앱이 다른 칸에서 넘긴 Tab·Enter)는 받지 않는다.
   * 처리했으면 true(handleKey가 기본 동작을 막는다)
   */
  private keyboardKey(e: KeyboardEvent): boolean {
    const ks = this.keySnap!;
    if (this.nav === 'walk') {
      // 걷기의 화살표는 걷기 키다(켜 둔 커서는 끈다)
      this.keyEnd(true);
      return false;
    }
    if (this.disposed || e.defaultPrevented) return false;
    const t = e.target;
    if (t && t !== this.canvas) return false;
    const a = keySnapAction(e, ks.keys);
    if (!a) return false;
    const c = this.keyCur;
    switch (a.action) {
      case 'left':
      case 'right':
      case 'up':
      case 'down': {
        if (!c) {
          this.keyStart();
          return true;
        }
        const n = moveKeyCursor(c, a.action, a.big, ks.step, ks.bigStep, this.cssW, this.cssH);
        c.x = n.x;
        c.y = n.y;
        this.keyRecompute();
        this.invalidate();
        this.keyAnnounce('move');
        return true;
      }
      case 'next':
      case 'prev': {
        // 커서가 켜진 측정 모드에서만(그 밖의 Tab은 브라우저 초점 이동 그대로 — 키보드 덫을 만들지 않는다).
        // 0.47.0: 고르기 모드도 pickCycle이면 겹친 고르기 후보를 돌린다(끄면 0.46.0처럼 초점 이동)
        if (!c || (!this.measuring && !ks.pickCycle)) return false;
        const n = this.keyCount(c);
        if (n) {
          c.index = (c.index + (a.action === 'next' ? 1 : -1) + n) % n;
          if (this.measuring) this.keyShow();
          else c.pick = c.picks[c.index]!.pick;
          this.invalidate();
        }
        this.keyAnnounce('cycle');
        return true;
      }
      case 'commit':
        if (!c) this.keyStart();
        else this.keyCommit(e);
        return true;
      case 'exit':
        if (!c) return false;
        // Esc는 뷰어 Esc(뷰 큐브 접기·측정 지우기)가 먼저 — 지울 것이 없을 때 커서를 끈다
        if (e.key === 'Escape' && (this.cubeZoom || this.measurePts.length || (this.measuring && this.tracker?.size))) return false;
        this.keyEnd(true);
        return true;
    }
    return false;
  }

  /** 가상 커서 Enter: 측정 모드면 지금 후보를 찍고(그 자리에서 다시 구해 보인 후보와 같은 점을 찍는다), 아니면 그 자리를 누른 것처럼 고른다(onPick) */
  private keyCommit(e: KeyboardEvent): void {
    const c = this.keyCur!;
    const M = this.keySnap!.msgs;
    if (!this.measuring) {
      const ev = { pointerType: KEY_POINTER, button: 0, altKey: e.altKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, metaKey: e.metaKey } as unknown as PointerEvent;
      // 0.47.0: 돌려 고른 후보(pickCycle — 같은 자리에서 다시 구해 같은 후보를 찾는다)가 둘째 이후면 그 후보를 고른다. 첫째·후보 없음은 0.46.0처럼 누르기와 같은 고르기
      this.keyRecompute(true);
      if (this.keySnap?.pickCycle && c.index > 0 && c.picks[c.index]) this.keyPickCandidate(c, e);
      else this.click(c.x, c.y, ev, true);
      if (this.keyCur !== c) return;
      this.keyAnnounce('commit', { lead: c.pick ? keySnapText(M, 'picked', [this.pickText(c.pick, M)]) : keySnapText(M, 'pickedNothing') });
      return;
    }
    this.keyRecompute(true);
    const ent = c.list[c.index];
    if (!ent) {
      this.keyAnnounce('commit', { lead: keySnapText(M, 'noPoint') });
      return;
    }
    this.refsSet(ent.after);
    this.commitMeasure(ent.pick);
    const pts = this.measurePoints;
    const point = pts[pts.length - 1]!;
    const m = this.measurement();
    // 찍은 뒤 같은 자리에서 다음 미리 보기(마우스는 다음 이동에서 — 키보드는 커서를 옮기지 않아도 들리게)
    this.keyRecompute();
    const num = (v: number): string => this.fmt(v);
    const unit = UNIT_LABEL[this.sceneRef?.units ?? 'unknown'];
    const u = unit ? ` ${unit}` : '';
    const lead = m
      ? keySnapText(M, 'secondPoint', [`${num(m.distance)}${u}`, num(m.dx), num(m.dy), num(m.dz)])
      : keySnapText(M, 'firstPoint', [snapKindText(point.snap, point.axis, point.locked, M), pointText(point.point, num, M)]);
    this.keyAnnounce('commit', { point, measurement: m, lead });
  }

  /**
   * 0.47.0 가상 커서로 돌려 고른 둘째 이후 후보를 고른다(onPick — 사건에 cycle). 모든 알림이 그 후보를 받고(front 알림의 front도),
   * 그물 면만 받는 알림은 후보가 그물 면이 아니면 그 알림의 보통 고르기(누르기와 같다). 늘 한 번 누르기(clicks 1 — 누르기 짝을 끊는다)
   */
  private keyPickCandidate(c: NonNullable<Viewer3d['keyCur']>, e: KeyboardEvent): void {
    const cand = copyPick(c.picks[c.index]!.pick);
    this.lastClick = { t: 0, x: 0, y: 0, n: 0 };
    const ev: PickEvent = {
      altKey: !!e.altKey,
      ctrlKey: !!e.ctrlKey,
      shiftKey: !!e.shiftKey,
      metaKey: !!e.metaKey,
      clicks: 1,
      button: 0,
      pointerType: KEY_POINTER,
      cycle: { index: c.index, count: c.picks.length },
    };
    const faces = new Map<boolean, Pick3d | null>();
    const faceOf = (through: boolean): Pick3d | null => {
      let p = faces.get(through);
      if (p === undefined) faces.set(through, (p = this.pickDetail(c.x, c.y, true, KEY_POINTER, false, false, true, through)?.pick ?? null));
      return p;
    };
    for (const [cb, o] of this.pickCbs) {
      const p = o.meshesOnly && cand.kind !== 'mesh' ? faceOf(o.through) : cand;
      if (o.front) cb(p, { ...ev, front: p });
      else cb(p, ev);
    }
  }

  /** key = 0.46.0 가상 커서 Enter(늘 한 번 누르기 — 바로 앞 누르기와 두 번 누르기로 짝짓지 않고, 다음 누르기의 짝도 되지 않는다) */
  private click(x: number, y: number, e?: PointerEvent, key = false): void {
    const now = performance.now();
    const type = e?.pointerType || 'mouse';
    const n = key ? 1 : clickCount(this.lastClick, now, x, y, type);
    this.lastClick = key ? { t: 0, x: 0, y: 0, n: 0 } : { t: now, x, y, n };
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
      this.commitMeasure(s);
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
    // 0.22.0: 그물 면만 받는 알림이 있으면 그 고르기를 한 번만 구해 함께 쓴다(0.23.0: 반투명 면을 지나는 고르기도 선택 짝마다 한 번)
    const picks = new Map<number, PickDetail | null>();
    const pickOf = (meshesOnly: boolean, through: boolean): PickDetail | null => {
      if (!meshesOnly && !through) return d;
      const k = (meshesOnly ? 1 : 0) + (through ? 2 : 0);
      let dm = picks.get(k);
      if (dm === undefined) {
        dm = meshesOnly ? this.pickDetail(x, y, true, type, false, false, true, through) : this.pickDetail(x, y, true, type, undefined, false, false, true);
        picks.set(k, dm);
      }
      return dm;
    };
    for (const [cb, o] of this.pickCbs) {
      const dm = pickOf(o.meshesOnly, o.through);
      const p = dm ? dm.pick : null;
      // 0.26.0 front: 그 알림만의 사본에 반투명 너머가 아닌 같은 고르기(같은 선택 짝 고르기는 한 번만)
      if (o.front) {
        const df = o.through ? pickOf(o.meshesOnly, false) : dm;
        cb(p, { ...ev, front: df ? df.pick : null });
      } else cb(p, ev);
    }
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
      this.lastPtr = null;
      // 0.46.0: 가상 커서의 미리 보기는 포인터가 떠나도 둔다
      if (this.keyCur) return;
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
      // 0.46.0: 초점이 문서 안 다른 곳으로 가면 가상 커서를 끈다(창만 흐려진 것 — 다른 앱·탭 — 이면 둔다, focusLeft와 같은 판정)
      if (this.keyCur && cv.ownerDocument?.activeElement !== cv) this.keyEnd(true);
    });
    this.on(cv, 'webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      // 0.50.0: 잃은 동안은 그리지 않으므로 옮기던 움직임은 끝 자리로 마친다(true — 되찾으면 그 자리를 그린다. 0.49.0은 되찾을 때까지 풀리지 않았다)
      this.finishAnim();
      // 0.29.0: 되찾은 뒤 다시 올리기가 끝날 때까지(onContextRestoreDone·restorePending)
      if (!this.disposed) this.restoreWait = true;
      this.renderer.forget();
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      // 0.30.0: 미룬 무늬 다시 그리기는 버린다(되찾은 뒤는 0.29.0 차례)
      this.texReset();
      // 0.25.0: 앱에 알린다(놓기 선택과 무관 — 없앤 뒤 dispose가 부른 잃음은 알리지 않는다)
      if (!this.disposed) for (const cb of [...this.lostCbs]) cb();
    });
    this.on(cv, 'webglcontextrestored', () => {
      if (this.disposed) return;
      this.lost = false;
      this.renderer.init();
      // 0.25.0: 놓기 선택이 있으면 그대로 다시 건다(코어가 지운 배열·원본은 없이 위치·색으로 올리고, 아래 emitRestore로 앱에 알려 다시 받는다)
      if (this.sceneRef) this.renderer.setScene(this.sceneRef, { incremental: !!this.upload, release: this.releaseOpt });
      // 0.51.0 다시 나눠 올리기는 걸음 번호를 0부터(몫 함수의 앞 걸음 — 되찾은 첫 그림도 곧)
      if (this.upload) this.upload.step = 0;
      if (this.segHi) this.renderer.setHighlightSegments(this.segHi.positions, this.segHi.opts.origin);
      this.uploadAnnotations();
      // 단면 테두리도 GPU 자료라 다시 올린다
      this.cutDirty = true;
      this.rebuildGrid();
      this.invalidate();
      if (this.sec) this.emitSection();
      this.emitRestore();
      // 0.29.0: 다시 받을 것·풀 무늬·나눠 올릴 것이 없으면(또는 복구 알림에서 앱이 다 줬으면) 바로 끝 알림
      this.checkRestoreDone();
    });
    const cube = this.cube;
    this.on<PointerEvent>(cube, 'pointermove', (e) => {
      const p = this.local(e, cube);
      const cd = this.cubeDrag;
      if (cd) {
        // 0.44.0 손가락은 끌기 시작 거리 10화소(마우스·펜은 0.43.0 그대로 3화소) — 누르다 조금 밀린 손가락이 큐브를 돌리지 않게
        if (!cd.moved && Math.hypot(p.x - cd.sx, p.y - cd.sy) < (cd.touch ? TOUCH_DRAG_START_PX : 3)) return;
        cd.moved = true;
        this.finishAnim();
        this.wheelAnchor = null;
        this.cam = orbitCamera(this.cam, -(p.x - cd.lx) * ROT_PER_PX * 1.5, (p.y - cd.ly) * ROT_PER_PX * 1.5);
        cd.lx = p.x;
        cd.ly = p.y;
        this.invalidate();
        return;
      }
      const h = cubeHit(cameraBasis(this.cam), cubeLayout(this.cubeSizeNow()), p.x, p.y, this.cubeBandNow());
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
      try {
        cube.setPointerCapture(e.pointerId);
      } catch {
        /* 이미 놓친 포인터·앱이 보낸 합성 사건(0.44.0 — 잡지 못해도 누르기는 이어 간다) */
      }
      const p = this.local(e, cube);
      this.cubeDrag = { sx: p.x, sy: p.y, lx: p.x, ly: p.y, moved: false, touch: isTouch(e.pointerType) };
    });
    const cubeUp = (e: PointerEvent, cancel: boolean): void => {
      const cd = this.cubeDrag;
      this.cubeDrag = null;
      if (!cd || cd.moved || cancel) return;
      // 0.44.0 손가락으로 접힌 큐브를 누르면 고르지 않고 편다(편 큐브를 다시 눌러 고른다)
      if (cd.touch && !this.cubeZoom && this.unfoldCube()) return;
      const p = this.local(e, cube);
      const h = cubeHit(cameraBasis(this.cam), cubeLayout(this.cubeSizeNow()), p.x, p.y, this.cubeBandNow());
      if (h) this.setViewDir(h.dir);
      // 편 큐브는 고르거나 큐브 밖을 누르면 접는다
      this.foldCube(h ? 'pick' : 'cube');
    };
    this.on<PointerEvent>(cube, 'pointerup', (e) => cubeUp(e, false));
    this.on<PointerEvent>(cube, 'pointercancel', (e) => cubeUp(e, true));
    this.on(cube, 'contextmenu', (e) => e.preventDefault());
  }

  private onDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button > 2) return;
    // 0.46.0: 포인터로 누르면 가상 커서를 끈다(포인터가 이어받는다)
    if (this.keyCur) this.keyEnd(true);
    // 0.44.0 편 손가락 뷰 큐브는 3D 보기를 누르면 접는다(누르기는 그대로 이어 간다)
    this.foldCube('canvas');
    // 누르기로 받은 초점에는 테두리를 보이지 않는다(0.9.1 — 키보드로 이미 초점이 있던 캔버스도 data-v3d-focus="pointer"로 감춘다)
    pointerFocus(this.canvas);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* 이미 놓친 포인터 */
    }
    const p = this.local(e);
    const type = e.pointerType || 'mouse';
    // 0.32.0: 앱이 맡을지 먼저 묻는다. 맡지 않은 손가락이 닿았는데 앱이 손가락을 맡고 있으면 그 손가락들을 돌려받아 함께 두 손가락 몸짓을 한다
    let took = false;
    if (this.claimer || this.holds.size) {
      // 맡은 포인터 id로 다시 누르면(앱이 코어에 돌려주는 합성 누르기 등) 앞 맡기는 끝난 것으로 본다
      const again = this.holds.release(e.pointerId);
      if (again) again.on?.end?.(heldOf(again), 'cancel');
      const h = this.claimer;
      if (h && this.askClaim(h, 'down', e, p, p, e.button)) {
        this.holds.hold(e.pointerId, type, p.x, p.y, p.x, p.y, h);
        return;
      }
      if (takesBackTouches(e.pointerType, this.holds.list())) took = this.takeBackTouches();
    }
    this.pointers.set(e.pointerId, { x: p.x, y: p.y, type, sx: p.x, sy: p.y });
    this.finishAnim();
    if (e.pointerType === 'touch') {
      if (this.pointers.size === 1) this.drag = { mode: 'orbit', id: e.pointerId, button: 0, pointerType: 'touch', sx: p.x, sy: p.y, lx: p.x, ly: p.y, moved: false, pivot: null, depth: null };
      else if (this.pointers.size === 2 || (took && this.pointers.size > 2)) {
        // 두 손가락 이동·핀치(앞의 핀치 뒤 남겨 둔 손가락에 새 손가락이 닿아도 여기서 다시 시작한다 — 0.32.0 앱에서 돌려받은 손가락도)
        this.drag = { mode: 'touch', id: e.pointerId, button: 0, pointerType: 'touch', sx: p.x, sy: p.y, lx: p.x, ly: p.y, moved: true, pivot: null, depth: null };
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
    this.drag = { mode, id: e.pointerId, button: e.button, pointerType: e.pointerType, sx: p.x, sy: p.y, lx: p.x, ly: p.y, moved: false, pivot: null, depth: null };
  }

  /** 0.32.0: 앱 처리기에 묻는다(at0 = 누른 자리, at = 지금 자리) */
  private askClaim(h: PointerClaimHandler, phase: PointerClaimQuery['phase'], e: PointerEvent, at0: { x: number; y: number }, at: { x: number; y: number }, button: number): boolean {
    const type = e.pointerType || 'mouse';
    const x = at0.x, y = at0.y;
    return !!h.claim({
      phase,
      pointerId: e.pointerId,
      pointerType: type,
      button,
      x,
      y,
      at: { x: at.x, y: at.y },
      pointers: this.pointers.size + this.holds.size + (this.pointers.has(e.pointerId) ? 0 : 1),
      held: this.holds.size,
      pick: (o) => this.pick(x, y, { ...(o ?? {}), pointerType: type }),
      event: e,
    });
  }

  /** 0.32.0: 앱이 맡은 손가락을 모두 돌려받는다(지금 자리에서 누른 것으로 — 맡은 차례대로). 돌려받았으면 true */
  private takeBackTouches(): boolean {
    const back = this.holds.takeTouches();
    for (const h of back) this.pointers.set(h.id, { x: h.x, y: h.y, type: h.type, sx: h.x, sy: h.y });
    for (const h of back) h.on?.end?.(heldOf(h), 'pinch');
    return back.length > 0;
  }

  /** 지금 누른 손가락 앞의 둘로 핀치 기준(거리·가운데) */
  private pinchState(): { dist: number; cx: number; cy: number } {
    const [a, b] = [...this.pointers.values()];
    return { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), cx: (a!.x + b!.x) / 2, cy: (a!.y + b!.y) / 2 };
  }

  private onMove(e: PointerEvent): void {
    const p = this.local(e);
    // 0.46.0: 가상 커서가 켜진 동안 포인터가 켤 때 자리(모르면 처음 본 자리)에서 DRAG_START_PX(4화소) 넘게 움직이면 끄고 포인터가 이어받는다.
    // 그 안의 사건(화면이 바뀌어 브라우저가 보내는 제자리 이동 등)은 넘긴다
    this.lastPtr = { x: p.x, y: p.y };
    const kc = this.keyCur;
    if (kc && !this.drag && !this.holds.size) {
      if (!kc.ptr) {
        kc.ptr = { x: p.x, y: p.y };
        return;
      }
      if (Math.hypot(p.x - kc.ptr.x, p.y - kc.ptr.y) < DRAG_START_PX) return;
      this.keyEnd(true);
    }
    // 0.32.0: 앱이 맡은 포인터는 앱에만 넘긴다(끌기·측정 미리 보기 없음)
    if (this.holds.size) {
      const h = this.holds.move(e.pointerId, p.x, p.y);
      if (h) {
        h.on?.move?.(heldOf(h, e));
        return;
      }
    }
    const d = this.drag;
    const rec = this.pointers.get(e.pointerId);
    if (!d || !rec) {
      if (this.measuring && !d) {
        // Shift를 누른 채 움직이면(0.10.0) 앞 미리 보기의 방향 추론을 잠그고, 뗀 채 움직이면 푼다
        this.setShift(e.shiftKey);
        this.hoverAt = { x: p.x, y: p.y, pointerType: e.pointerType || 'mouse' };
        this.invalidate();
      }
      return;
    }
    rec.x = p.x;
    rec.y = p.y;
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
      // 0.32.0: 궤도·이동을 시작하기 전에 앱에 묻는다(맡으면 코어에는 이 포인터가 취소된 것과 같다)
      const h = this.claimer;
      if (h && e.pointerId === d.id && this.askClaim(h, 'drag', e, { x: d.sx, y: d.sy }, p, d.button)) {
        this.coreUp(e.pointerId, true);
        this.holds.hold(e.pointerId, rec.type, rec.sx, rec.sy, p.x, p.y, h);
        return;
      }
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
    // 0.32.0: 앱이 맡은 포인터는 앱에만 알린다
    if (this.holds.size) {
      const h = this.holds.release(e.pointerId);
      if (h) {
        const p = this.local(e);
        h.x = p.x;
        h.y = p.y;
        h.on?.end?.(heldOf(h, e), cancel ? 'cancel' : 'up');
        return;
      }
    }
    this.coreUp(e.pointerId, cancel, e);
  }

  /** 코어가 다루는 포인터를 뗐다(cancel이면 누르기로 치지 않는다 — 0.32.0 앱이 맡을 때도 이것). e는 떼기 사건(취소면 없어도 된다) */
  private coreUp(id: number, cancel: boolean, e?: PointerEvent): void {
    const had = this.pointers.delete(id);
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
    } else if (!cancel && e && !d.moved && (d.button === 0 || e.pointerType === 'touch')) {
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
    // 0.46.0 키보드 붙잡기(setKeyboardSnap을 켰을 때만 — 캔버스가 받은 키): 화살표 가상 커서·Tab 후보 돌리기·Enter 찍기·Esc 끄기
    if (this.keySnap && this.keyboardKey(e)) {
      e.preventDefault();
      return true;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    // Shift(0.10.0): 측정 추론 잠금(setMeasureSnap({ inference: { lock: true } })일 때). 기본 동작은 막지 않으므로 false
    if (e.key === 'Shift') {
      this.setShift(true);
      return false;
    }
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
    // 0.44.0: 손가락으로 편 뷰 큐브를 먼저 접는다
    else if (e.key === 'Escape' && this.cubeZoom) this.foldCube('escape');
    // 0.16.0: 첫 점 전이라도 끌어온 점이 있으면 Esc가 지운다
    else if (e.key === 'Escape' && (this.measurePts.length || (this.measuring && this.tracker?.size))) this.clearMeasure();
    else return false;
    e.preventDefault();
    return true;
  }

  /** 걷기 키를 뗐을 때(앱이 창 키를 넘길 때 keyup도 넘긴다). 처리했으면 true */
  handleKeyUp(e: KeyboardEvent): boolean {
    if (e.key === 'Shift') this.setShift(false);
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
    // 0.51.0 다른 까닭의 다시 그리기가 끼면 그 그리기는 나눠 올리기 걸음만의 것이 아니다(redrawMs가 건너뛰지 않는다)
    this.upOnly = false;
    if (this.raf || this.disposed || this.lost) return;
    this.raf = requestAnimationFrame((t) => {
      this.raf = 0;
      this.draw(t);
    });
  }

  private draw(now: number): void {
    if (this.disposed || this.lost) return;
    const t0 = performance.now();
    // 0.51.0 이 그리기가 나눠 올리기 걸음만으로 생겼는지(읽고 비운다)
    const upOnly = this.upOnly;
    this.upOnly = false;
    if (this.anim) {
      const a = this.anim;
      const t = Math.min(1, (now - a.t0) / a.dur);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      this.cam = t >= 1 ? a.to : lerpCamera(a.from, a.to, e);
      if (t >= 1) {
        this.anim = null;
        // 0.49.0 끝 알림: Promise 처리기는 이 그림(끝 자리)을 다 그린 뒤에 돈다
        a.done(true);
      } else this.invalidate();
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
    // 0.46.0: 가상 커서 자리를 다시 구할 때(잠금·붙잡기 한도 등 — rehover)는 후보 목록을 다시 구하고 같은 점 후보를 지킨다
    if (this.measuring && this.hoverAt && !this.drag && this.keyCur && this.hoverAt.pointerType === KEY_POINTER) {
      this.hoverAt = null;
      this.keyRecompute(true);
      this.keyAnnounce('refresh');
    } else if (this.measuring && this.hoverAt && !this.drag) {
      this.measureHover = this.measureAt(this.hoverAt.x, this.hoverAt.y, this.hoverAt.pointerType);
      this.lastHoverAt = this.hoverAt;
      this.hoverAt = null;
      if (this.measurePts.length === 1 && !this.measureHover?.locked) this.lastLockable = this.hoverLock(this.measureHover) ?? this.lastLockable;
      // 0.16.0 끌어온 축: 점 붙잡기 위 머무르기(켰을 때만)
      if (this.tracker) this.dwell(this.measureHover, this.lastHoverAt);
    }
    if (this.renderer.uploading) {
      const up = this.upload;
      const sceneUp = !!this.renderer.uploadProgress;
      let b = this.meshBudget;
      if (sceneUp) {
        b = up?.budget ?? 8;
        // 0.51.0 걸음마다 몫 함수(쓸 수 없는 값·예외면 숫자 몫)
        if (up?.fn) {
          let v: unknown;
          try {
            v = up.fn(up.step, this.sceneRef?.meshes.length ?? 0);
          } catch {
            v = undefined;
          }
          if (typeof v === 'number' && Number.isFinite(v) && v > 0) b = Math.max(1, v);
        }
        if (up) up.step++;
      }
      const done = this.pumpUpload(b);
      // 0.51.0 redrawMs: 올리기 걸음만으로 생긴 그리기는 간격 안이면 건너뛰고, 다 올린 걸음은 그리지 않고 다음 프레임에 장면 전체를 그린다
      if (sceneUp && up && up.redraw > 0 && upOnly) {
        if (done) {
          this.invalidate();
          return;
        }
        if (t0 - up.lastDraw < up.redraw) return;
      }
    }
    if (this.upload) this.upload.lastDraw = t0;
    if (this.cutDirty) {
      if (this.sec) this.updateCut();
      else {
        this.cutDirty = false;
        this.renderer.setSectionLines(null);
      }
    }
    this.renderer.render(f, w, h, this.renderState(f, dpr));
    // 0.42.0 인스턴싱 변종을 아직 번역 중이면(그동안 그물마다 그렸다) 다음 프레임에 다시 그린다 — 다 되면 모아 그린다.
    // 0.52.0 굽기를 기다리는 묶음이 있어도(프레임마다 몫 안에서 굽는다 — 0.54.0 조각을 받는 동안은 걸지 않고 onMergeReady로)
    if (this.renderer.instPending || this.renderer.mergeSteps) this.invalidate();
    this.drawOverlay(f);
    if (this.opts.viewCube) this.drawCube();
    this.frameMs = performance.now() - t0;
    // 0.30.0: 무늬를 올리는 동안이면 이 화면 뒤에 울타리를 두고 그리기 시간을 무늬 다시 그리기 간격에 셈한다
    this.texAfterDraw(this.frameMs);
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
      // 0.44.0 구간 단면이 있으면 그 갈래(RangePart.cut)도 구간으로 넘긴다(없으면 0.43.0 그대로 숨김·강조 구간만)
      parts: this.secRanged ? (id) => this.renderParts(id) : this.rangeSel.size ? (id) => this.rangeSel.get(id)?.parts ?? undefined : undefined,
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
      // 0.49.0 주변 가림(끄면 필드를 넣지 않는다 — 0.48.0과 같은 상태). 기본 거리는 보이는 범위 대각선의 2%
      // 0.50.0: 카메라를 옮기는 동안(끌기·휠·손가락 몸짓 — interacting, flyTo 등 움직임 — anim)이면 moving 선택('off'·'low')을 따른다(없거나 'keep'이면 0.49.0과 같은 값)
      ...(this.aoOpt ? { ao: aoParams(this.aoOpt, boxSphere(this.visibleBox()).radius * 2, this.interacting || !!this.anim) } : {}),
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
    // 0.44.0 손가락으로 편 동안은 편 크기(띠 경계를 옅게 — 바탕을 깔아 3D 보기 위에서도 읽힌다)
    const size = this.cubeSizeNow();
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
    const colors = { face: th.cubeFace, edge: th.cubeEdge, text: th.cubeText, hover: th.cubeHover };
    const font = `600 ${((27 * size) / CUBE_CSS).toFixed(1)}px ${FONT}`;
    if (!this.cubeZoom) {
      drawViewCube(ctx, cameraBasis(this.cam), cubeLayout(size), colors, this.cubeHover, font);
      return;
    }
    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = th.background;
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, size - 1, size - 1, 10);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = th.cubeEdge;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    drawViewCube(ctx, cameraBasis(this.cam), cubeLayout(size), colors, this.cubeHover, font, { band: this.cubeBandNow(), grid: true });
  }

  private drawOverlay(f: ViewFrame): void {
    const ctx = this.octx;
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    this.drawOverlayOn(ctx, f, dpr, true);
  }

  /** 덧그림(단면 평면·좌표축·덧그림·측정)을 ctx에 CSS 화소 × k 배율로. screen = 화면 덧그림(측정 글상자 자리를 기억한다 — 0.12.0) */
  private drawOverlayOn(ctx: CanvasRenderingContext2D, f: ViewFrame, k: number, screen = false): void {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (screen) this.labelsShifted = false;
    if (this.multiSection) this.drawSectionPlanes(ctx, f);
    else if (this.sec?.plane) this.drawSectionPlane(ctx, f);
    if (this.opts.axes) this.drawTriad(ctx, f);
    if (this.annos) this.drawAnnotations(ctx, f, screen);
    else if (screen) this.annoLabels = [];
    this.drawMeasure(ctx, f, screen);
    // 0.54.0 고르기 후보 미리 강조(setPickPreview — 화면 덧그림만)
    if (screen && this.pickPrev) {
      ctx.save();
      this.drawPickMark(ctx, f, this.pickPrev.pick, null, this.pickPrev.ranges);
      ctx.restore();
    }
    // 0.46.0 가상 커서(화면 덧그림만 — 그림 저장에는 그리지 않는다)
    const kc = screen ? this.keyCur : null;
    if (kc) {
      ctx.save();
      // 0.47.0 고르기 모드 후보 돌리기: 지금 후보가 선분·윤곽선이면 그 선분, 점이면 둘레 고리를 강조 색으로(그물 면은 0.54.0 facePreview를 켰을 때만 그 면 — 아니면 커서 자리 그대로)
      if (!this.measuring && this.keySnap?.pickCycle) this.drawKeyPick(ctx, f, kc.picks[kc.index] ?? null);
      drawSnapMark(ctx, this.theme, kc.x, kc.y, 'cursor');
      ctx.restore();
    }
  }

  /** 0.47.0 가상 커서 고르기 후보 표식(화면 덧그림만): 선분·윤곽선·점(drawPickMark), 0.54.0 그물 면은 pickCycle.facePreview일 때만(faceRanges면 앱 면) */
  private drawKeyPick(ctx: CanvasRenderingContext2D, f: ViewFrame, d: PickDetail | null): void {
    if (!d) return;
    if (d.pick.kind !== 'mesh') return this.drawPickMark(ctx, f, d.pick, d.ends ?? null, null);
    const pc = this.keySnap?.pickCycle;
    if (!pc?.facePreview) return;
    let ranges: readonly IndexRange[] | null = null;
    if (typeof pc.faceRanges === 'function') {
      try {
        const r = pc.faceRanges({ ...d.pick, point: [...d.pick.point] as V3 });
        if (Array.isArray(r)) ranges = r;
      } catch {
        // 앱 함수 오류 — 같은 평면 면
      }
    }
    this.drawPickMark(ctx, f, d.pick, null, ranges);
  }

  /**
   * 0.47.0·0.54.0 고르기 후보 표식(화면 덧그림만 — 깊이를 따지지 않는다): 선분·윤곽선은 바탕 테 위 강조 색 선(끝점을 모르면 장면 배열에서), 점은 바탕 테 위 강조 색 고리,
   * 0.54.0 그물 면은 그 면(drawFaceMark). 숨긴 묶음·장면에 없는 묶음은 그리지 않는다
   */
  private drawPickMark(ctx: CanvasRenderingContext2D, f: ViewFrame, p: Pick3d, ends: [V3, V3] | null, ranges: readonly IndexRange[] | null): void {
    const it = this.items.get(p.id);
    if (!it || !this.visible(it.item.id, it.item.group)) return;
    const th = this.theme;
    const k = p.kind;
    if (k === 'mesh') {
      if (it.kind === 'mesh') this.drawFaceMark(ctx, f, p, it.item, ranges);
      return;
    }
    if (k === 'line' || k === 'edge') {
      const e = ends ?? this.pickEnds(p);
      if (!e) return;
      const a = projectToScreen(f, e[0]), b = projectToScreen(f, e[1]);
      if (!a || !b) return;
      ctx.lineCap = 'round';
      for (const [color, w] of [
        [th.textBg, 7],
        [th.highlight, 3],
      ] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
    } else if (k === 'point') {
      const s = projectToScreen(f, p.point);
      if (!s) return;
      for (const [color, w] of [
        [th.textBg, 5],
        [th.highlight, 2],
      ] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(s[0], s[1], 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  /** 0.54.0 선분·윤곽선 고른 것의 세계 끝점 둘(장면 배열에서 — 선분은 raw(없으면 index) 번째, 윤곽선은 Mesh3d.edges의 index 번째). 없으면 null */
  private pickEnds(p: Pick3d): [V3, V3] | null {
    const it = this.items.get(p.id);
    if (!it) return null;
    let arr: Float32Array | undefined, i: number, model: ArrayLike<number> | undefined;
    if (p.kind === 'edge' && it.kind === 'mesh') {
      arr = it.item.edges;
      i = p.index;
      model = this.modelOf(it.item);
    } else if (p.kind === 'line' && it.kind === 'line') {
      arr = it.item.positions;
      i = p.raw ?? p.index;
      model = this.lineModel(it.item) ?? (hasOrigin(it.item.origin) ? translation(it.item.origin!) : undefined);
    } else return null;
    if (!arr || !Number.isInteger(i) || i < 0 || i * 6 + 6 > arr.length) return null;
    const a: V3 = [arr[i * 6]!, arr[i * 6 + 1]!, arr[i * 6 + 2]!], b: V3 = [arr[i * 6 + 3]!, arr[i * 6 + 4]!, arr[i * 6 + 5]!];
    return model ? [transformPoint(model, a), transformPoint(model, b)] : [a, b];
  }

  /**
   * 0.54.0 그물 면 후보 표식(화면 덧그림만): 면 삼각형(ranges면 그 구간, 아니면 맞은 삼각형과 같은 평면으로 이어진 삼각형 — pickpreview.ts)을 강조 색으로 옅게 한 번에 칠하고
   * 테두리 변을 바탕 테 위 강조 색 선으로. 단면의 잘린 면·삼각형 번호가 없는 후보는 그리지 않는다. 눈 뒤 꼭짓점이 있는 삼각형·변은 건너뛴다
   */
  private drawFaceMark(ctx: CanvasRenderingContext2D, f: ViewFrame, p: Pick3d, m: Mesh3d, ranges: readonly IndexRange[] | null): void {
    if (p.section || !Number.isInteger(p.index) || p.index < 0) return;
    const fo = this.faceOutlineOf(m, p.index, ranges);
    if (!fo) return;
    const M = this.modelOf(m);
    const pos = m.positions, idx = m.indices;
    const scr = (x: number, y: number, z: number): V3 | null => projectToScreen(f, M ? transformPoint(M, [x, y, z]) : [x, y, z]);
    const vert = (t: number, k: number): V3 | null => {
      const v = idx ? idx[t * 3 + k]! : t * 3 + k;
      return scr(pos[v * 3]!, pos[v * 3 + 1]!, pos[v * 3 + 2]!);
    };
    const th = this.theme;
    ctx.beginPath();
    for (const t of fo.tris) {
      const a = vert(t, 0), b = vert(t, 1), c = vert(t, 2);
      if (!a || !b || !c) continue;
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.closePath();
    }
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = th.highlight;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const e = fo.edges;
    for (const [color, w] of [
      [th.textBg, 5],
      [th.highlight, 2],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.beginPath();
      for (let i = 0; i + 5 < e.length; i += 6) {
        const a = scr(e[i]!, e[i + 1]!, e[i + 2]!), b = scr(e[i + 3]!, e[i + 4]!, e[i + 5]!);
        if (!a || !b) continue;
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      }
      ctx.stroke();
    }
  }

  /**
   * 0.54.0 그물 면 미리 강조 셈(같은 위치·색인 배열·삼각형·구간이면 기억에서 — 넷까지). 면 셈 조각이 아직 없으면 받기를 걸고 null(그 프레임은 표식 없이 — 오면 다시 그린다)
   */
  private faceOutlineOf(m: Mesh3d, tri: number, ranges: readonly IndexRange[] | null): FaceOutline | null {
    const pos = m.positions, idx = m.indices;
    if (!pos?.length) return null;
    const kit = faceKit;
    if (!kit) {
      if (faceKitFailed || this.faceKitWait) return null;
      faceKitLoad ??= import('./pickpreview').then(
        (k) => void (faceKit = k),
        () => void (faceKitFailed = true),
      );
      this.faceKitWait = true;
      void faceKitLoad.then(() => {
        this.faceKitWait = false;
        if (!this.disposed && faceKit) this.invalidate();
      });
      return null;
    }
    const key = ranges ? ranges.map((r) => `${r?.start}:${r?.count}`).join(',') : null;
    const memo = this.faceMemo;
    const hit = memo.findIndex((x) => x.pos === pos && x.idx === idx && x.tri === tri && x.ranges === key);
    if (hit >= 0) {
      const e = memo[hit]!;
      if (hit) memo.unshift(...memo.splice(hit, 1));
      return e.out;
    }
    const out = ranges ? kit.rangesFace(pos, idx, ranges) : kit.planarFace(pos, idx, tri);
    memo.unshift({ pos, idx, tri, ranges: key, out });
    if (memo.length > 4) memo.length = 4;
    return out;
  }

  /**
   * 앱 측정 덧그림의 점·글자(선은 GL에서 깊이를 따져 그린다). 가려진 점은 흐리게, 가려진 글상자는 불투명한 바탕·글에 점선 테두리(0.47.0 — annotationLabelLook).
   * 0.23.0: screen(화면 덧그림)이고 setMeasureLabelAvoid의 사각형이 있으면 글상자도 측정 거리 글상자와 같은 차례(placeMeasureLabel)로 비켜 그린다 —
   * 기준점은 글자 상자를 붙일 자리, 거리·반지름이면 두 점을 잇는 선분을 따라서도, 옮길 때는 그 덧그림의 점 표식도 될 수 있으면 가리지 않는다.
   * 커서 둘레(pointerRadius)는 보지 않는다(커서를 따라다니지 않는 글상자다). 그림 저장은 기본 자리.
   * 0.24.0: 화면 덧그림이면 앞 차례에 그린 덧그림 글상자와도 겹치지 않게 놓는다(placeLabelAmong — 피할 사각형이 없어도)
   */
  private drawAnnotations(ctx: CanvasRenderingContext2D, f: ViewFrame, screen = false): void {
    const A = this.annos!;
    const rects = screen && this.labelAvoid?.rects.length ? this.labelAvoid.rects : null;
    const placed: (MeasureLabelRect | null)[] = screen ? A.list.map(() => null) : [];
    /** 0.24.0: 앞 차례에 화면에 그린 글상자(뒤 글상자가 비킨다 — 화면 덧그림만) */
    const before: MeasureLabelRect[] = [];
    const spot = this.spotOpts('annotations');
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
        // 0.31.0: 둘째 인자는 코어 기본 꼴(이 덧그림의 기본 한 줄과 수 꼴)
        lines = fm(
          { a: [...p] as V3, b: [...q] as V3, distance: g.value, dx: q[0] - p[0], dy: q[1] - p[1], dz: q[2] - p[2], units: this.sceneRef?.units ?? 'unknown' },
          this.formatCore('annotation', annotationText(an, g, (v) => this.fmt(v), unit)),
        );
      } else lines = annotationText(an, g, (v) => this.fmt(v), unit);
      const at = projectToScreen(f, g.labelAt);
      if (!lines.length || !at) return;
      const hid = occl && this.occludedAt(f, g.labelAt, at[0], at[1], false);
      // 0.47.0: 가려진 글상자도 바탕·글은 불투명(글 대비 — WCAG 1.4.3), 가려짐은 점선 테두리(annotationLabelLook). 0.46.0은 globalAlpha max(hidden, 0.5)
      const look = annotationLabelLook(hid, hiddenA);
      if (!look) return;
      ctx.globalAlpha = 1;
      ctx.font = `12px ${FONT}`;
      const w = Math.max(...lines.map((t) => ctx.measureText(t).width)) + 14;
      const h = lines.length * 16 + 8;
      // 기본 자리(기준점 오른쪽 위 — placeMeasureLabel의 첫 자리와 한 줄씩 같다)와, 피할 사각형이 있으면 비킨 자리.
      // 0.24.0: 화면 덧그림이면 앞 차례에 그린 덧그림 글상자와도 겹치지 않게(placeLabelAmong — 겹치지 않으면 0.23.0 자리)
      let avoid: LabelAvoidAreas | null = null;
      let seg: [V3, V3] | null = null;
      let soft: LabelCircle[] = [];
      if (rects || before.length) {
        const ds = g.dots.map((p) => projectToScreen(f, p)).filter((s): s is V3 => !!s);
        if ((an.kind === 'distance' || an.kind === 'radius') && ds.length === 2) seg = [ds[0]!, ds[1]!];
        soft = ds.map((s) => ({ x: s[0], y: s[1], r: LABEL_POINT_R }));
        if (rects) avoid = { rects, soft };
      }
      const view = { width: this.cssW, height: this.cssH };
      // 0.27.0: 앱이 정한 기본 자리(setMeasureLabelSpot annotations — 없으면 0.26.0과 같은 부르기)
      const { x, y } = screen
        ? placeLabelAmong(at, { width: w, height: h }, view, avoid, before, seg, soft, spot)
        : placeMeasureLabel(at, { width: w, height: h }, view, avoid, seg, spot);
      if (screen) {
        placed[i] = { x, y, width: w, height: h };
        before.push(placed[i]!);
        const d = placeMeasureLabel(at, { width: w, height: h }, view, null, null, spot);
        if (d.x !== x || d.y !== y) this.labelsShifted = true;
      }
      ctx.fillStyle = th.textBg;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.fill();
      if (look.dash.length) {
        // 점선 테두리는 토막마다 선 굵기 1의 작은 사각형으로 칠한다(dashedRectSegments). 점선 경로 스트로크(setLineDash나 여러 토막 경로)는
        // Chrome 2D 캔버스가 같은 캔버스의 다른 덧그림(좌표축·점 표식·다른 글상자 테두리)의 경계 화소까지 바꿨다(화소 회귀 — 사각형 칠하기는 바꾸지 않는다)
        ctx.fillStyle = color;
        for (const [x0, y0, x1, y1] of dashedRectSegments(x, y, w, h, look.dash)) {
          if (y0 === y1) ctx.fillRect(Math.min(x0, x1), y0 - 0.5, Math.abs(x1 - x0), 1);
          else ctx.fillRect(x0 - 0.5, Math.min(y0, y1), 1, Math.abs(y1 - y0));
        }
      } else ctx.stroke();
      ctx.fillStyle = th.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      lines.forEach((t, k) => ctx.fillText(t, x + 7, y + 5 + k * 16));
    });
    ctx.restore();
    if (screen) this.annoLabels = placed;
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

  /** 측정 글의 수: 장면 범위 대각선에 맞춘 소수 자릿수(measureDigits — 0.31.0에 순수 함수로 뺐다, 셈은 그대로), "-0"은 "0" */
  private fmt(v: number): string {
    return measureNumber(v, measureDigits(this.allBox));
  }

  /** 0.31.0 측정 글 꼴의 둘째 인자: 이 글상자의 코어 기본 줄과 수 꼴·자릿수·단위 글(그릴 때마다 새로) */
  private formatCore(source: MeasureFormatCore['source'], lines: string[]): MeasureFormatCore {
    const digits = measureDigits(this.allBox);
    return { lines, num: (v) => measureNumber(v, digits), digits, unit: UNIT_LABEL[this.sceneRef?.units ?? 'unknown'], source };
  }

  private drawMeasure(ctx: CanvasRenderingContext2D, f: ViewFrame, screen = false): void {
    if (screen) this.measureLabel = null;
    const pts = this.measurePts;
    const hover = this.measuring ? this.measureHover : null;
    // 0.16.0: 끌어온 점(켰을 때만 — 기억한 점이 있으면 커서가 떠나도 표식을 그린다)
    const tracks = this.measuring && this.tracker?.size ? this.tracker.view : null;
    if (!pts.length && !hover && !tracks) return;
    const th = this.theme;
    const axisColor = (ax: SnapAxis): string => (ax === 'x' ? th.axisX : ax === 'y' ? th.axisY : th.axisZ);
    const inferColor = th.inference ?? DARK_THEME.inference!;
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
     * 0.9.0 추론: 교차점 = 엇갈린 십자(×), 수직 발 = ⊥(두 선이 만나는 곳이 점).
     * 0.38.0 접점(앱 점 'tangent'): 동그라미 테와 그 꼭대기에 닿는 가로선(AutoCAD 접점 표식 꼴 — 점은 동그라미 가운데)
     */
    const snapMarkAt = (p: V3 | null, kind: 'midpoint' | 'center' | 'point' | 'intersection' | 'perpendicular' | 'tangent'): void => {
      if (!p) return;
      drawSnapMark(ctx, th, p[0], p[1], kind);
    };
    /** seg = 두 점의 화면 자리(0.13.0 — 피할 영역과 겹치면 이 선분을 따라 옮겨 본다) */
    const label = (at: V3 | null, lines: string[], seg: [V3, V3] | null): void => {
      if (!at || !lines.length) return;
      ctx.font = `12px ${FONT}`;
      const w = Math.max(...lines.map((s) => ctx.measureText(s).width)) + 14;
      const h = lines.length * 16 + 8;
      // 기본 자리는 두 점 화면 가운데의 오른쪽 위(캔버스 안으로 당김). 화면 덧그림이고 앱이 피할 자리를 줬으면 비켜 그린다(0.13.0).
      // 0.24.0: 화면 덧그림이면 앱 측정 덧그림 글상자(먼저 그린다)와도 겹치지 않게(placeLabelAmong — 겹치지 않으면 0.23.0 자리)
      const size = { width: w, height: h }, view = { width: this.cssW, height: this.cssH };
      // 0.27.0: 앱이 정한 기본 자리(setMeasureLabelSpot measure — 없으면 0.26.0과 같은 부르기)
      const spot = this.spotOpts('measure');
      let x: number, y: number;
      if (screen) {
        const annos = this.annoLabels.filter((r): r is MeasureLabelRect => !!r);
        const soft = seg ? seg.map((p) => ({ x: p[0], y: p[1], r: LABEL_POINT_R })) : null;
        ({ x, y } = placeLabelAmong(at, size, view, this.labelAvoidAreas(seg), annos, seg, soft, spot));
        this.measureLabel = { x, y, width: w, height: h };
        const d = placeMeasureLabel(at, size, view, null, null, spot);
        if (d.x !== x || d.y !== y) this.labelsShifted = true;
      } else if (seg && this.labelAvoid?.snapshot) {
        // 0.33.0 그림 저장도 표식 비키기(setMeasureLabelAvoid의 points·snapshotPoints): 그림에 없는 앱 영역·커서 둘레 없이 두 측정 점 표식만(softBlocks — 화면과 같은 규칙)
        const soft = seg.map((p) => ({ x: p[0], y: p[1], r: LABEL_POINT_R }));
        ({ x, y } = placeMeasureLabel(at, size, view, { rects: [], circles: [], soft, softBlocks: true }, seg, spot));
      } else ({ x, y } = placeMeasureLabel(at, size, view, null, seg, spot));
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
    // 0.27.0: 끌어온 점에서 기준 선분과 나란함·수직인 선 위 점(inference.trackDirs — 잠그지 않은 'parallel'·'perpendicular'에 끌어온 점)
    const trackDir = !!(hover?.trackFrom && !hover.locked && (hover.kind === 'parallel' || hover.kind === 'perpendicular'));
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
      // 0.9.0 축 붙잡기 미리 보기: 첫 점에서 그 축 색 안내선.
      // 0.10.0: 나란함·잠근 수직은 추론 색(자홍) 안내선과 기준 선분 점선, 잠금은 바탕 테 위 굵은 실선, 잠근 선으로 옮겨 온 점에서 가는 점선
      // 0.27.0: 끌어온 점의 나란함·수직은 첫 점을 지나는 선이 아니므로 첫 점에서 그은 선은 보통 측정 색(기준 선분은 아래 끌어온 점 그리기에서)
      const hk = pts.length === 1 && !trackDir ? hover : null;
      // 0.29.0: 끌어온 점 안내 선이 첫 점 축·첫 점의 나란함과 만나는 점(trackDirs { meets } — 방향이 있다)이면 첫 점에서 그은 선은 그 선의 색(축 색·추론 색)
      const meetCol = pts.length === 1 && trackDir && hover?.direction ? (hover.axis ? axisColor(hover.axis) : inferColor) : null;
      // 0.16.0: 끌어온 점을 지나는 축(방향 없음)은 첫 점 축이 아니므로 첫 점에서 그은 선은 보통 측정 색
      const guide =
        hk?.kind === 'axis' && hk.axis && !(hk.trackFrom && !hk.direction)
          ? axisColor(hk.axis)
          : hk && (hk.kind === 'parallel' || (hk.kind === 'perpendicular' && hk.locked))
            ? inferColor
            : null;
      if (hk?.edge && (hk.kind === 'parallel' || hk.locked)) {
        const e0 = P(hk.edge[0]), e1 = P(hk.edge[1]);
        line(e0, e1, th.textBg, 5, []);
        line(e0, e1, inferColor, 2.5, [5, 3]);
      }
      if (hk?.locked && guide) {
        line(sa, sb, th.textBg, 6, []);
        line(sa, sb, guide, 3, []);
      } else line(sa, sb, guide ?? meetCol ?? th.measure, 2, pts.length === 2 ? [] : [6, 4]);
      if (hk?.from) line(P(hk.from), sb, th.measure, 1.5, [2, 3]);
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const mid = sa && sb ? ([(sa[0] + sb[0]) / 2, (sa[1] + sb[1]) / 2, 0] as V3) : sb ?? sa;
      const u = unit ? ` ${unit}` : '';
      const fm = this.measureFmt;
      // 글 꼴에는 onMeasure와 같은 결과를 준다(0.9.1 — 붙잡기를 켰으면 snapA·snapB·axisB도. 미리 보기의 B는 커서 아래 붙잡을 점)
      const snapB = pts[1] ? this.measureSnaps.get(pts[1]) : hover ? pointSnapOf(hover) : undefined;
      const lines = (): string[] => [`거리 ${this.fmt(Math.hypot(dx, dy, dz))}${u}`, `ΔX ${this.fmt(dx)}  ΔY ${this.fmt(dy)}  ΔZ ${this.fmt(dz)}`];
      label(
        mid,
        // 0.31.0: 글 꼴의 둘째 인자는 코어 기본 꼴(기본 두 줄과 수 꼴 — 앱이 이름표만 옮길 수 있게)
        fm
          ? fm(
              { ...measureResult([...a] as V3, [...b] as V3, this.snapOpt ? [this.measureSnaps.get(a), snapB] : null), units: this.sceneRef?.units ?? 'unknown' },
              this.formatCore('measure', lines()),
            )
          : lines(),
        sa && sb ? [sa, sb] : null,
      );
    }
    // 0.16.0 끌어온 축: 끌어온 점에서 붙잡을 점까지 점선(그 선이 축과 나란하면 축 색 — 끌어온 점을 지나는 축은 늘, 첫 점 축 위 나란한 자리는
    // 두 점이 다른 좌표 하나를 함께 쓸 때), 기억한 점마다 작은 십자(끌어온 점은 크게, 점선 색).
    // 0.17.0 끌어온 축끼리의 교차: 둘째 끌어온 점에서도 그 축 색 점선과 큰 십자
    if (tracks) {
      const tf = hover?.trackFrom ?? null;
      const to = hover?.trackOther ?? null;
      let col = th.measure;
      const col2 = to ? axisColor(to.axis) : th.measure;
      if (tf && hover && trackDir) {
        // 0.27.0 끌어온 점의 나란함·수직: 기준 선분(추론 색 점선 — 0.10.0 나란함과 같다)과 끌어온 점에서 추론 색 쇄선(끌어온 축의 [4, 3] 점선과 구별)
        col = inferColor;
        if (hover.edge) {
          const e0 = P(hover.edge[0]), e1 = P(hover.edge[1]);
          line(e0, e1, th.textBg, 5, []);
          line(e0, e1, inferColor, 2.5, [5, 3]);
        }
        const s0 = P(tf), s1 = P(hover.p);
        line(s0, s1, th.textBg, 3.5, []);
        line(s0, s1, col, 1.5, [8, 3, 2, 3]);
        // 0.29.0: 다른 끌어온 점의 축과 만나는 점(trackDirs { meets })이면 그 점에서 축 색 점선(0.17.0 끌어온 축끼리의 교차와 같다)
        if (to) {
          const s2 = P(to.from);
          line(s2, s1, th.textBg, 3.5, []);
          line(s2, s1, col2, 1.5, [4, 3]);
        }
        // 0.30.0: 다른 끌어온 점의 안내 선과 만나는 점(meets { guides })이면 그 점에서도 추론 색 쇄선
        if (hover.trackGuide) {
          const s2 = P(hover.trackGuide.from);
          line(s2, s1, th.textBg, 3.5, []);
          line(s2, s1, col, 1.5, [8, 3, 2, 3]);
        }
      } else if (tf && hover) {
        const u = unitDir(tf, hover.p);
        const ax: SnapAxis | null = !hover.direction ? (hover.axis ?? null) : u && axisAligned(u) ? (Math.abs(u[0]) > 0.5 ? 'x' : Math.abs(u[1]) > 0.5 ? 'y' : 'z') : null;
        if (ax) col = axisColor(ax);
        const s0 = P(tf), s1 = P(hover.p);
        line(s0, s1, th.textBg, 3.5, []);
        line(s0, s1, col, 1.5, [4, 3]);
        if (to) {
          const s2 = P(to.from);
          line(s2, s1, th.textBg, 3.5, []);
          line(s2, s1, col2, 1.5, [4, 3]);
        }
      } else if (to && hover) {
        // 0.21.0 잠근 선과 끌어온 축의 교차: 첫째 선은 잠근 선(첫 점에서 그은 안내선)이고, 끌어온 점에서 그 축 색 점선
        const s2 = P(to.from), s1 = P(hover.p);
        line(s2, s1, th.textBg, 3.5, []);
        line(s2, s1, col2, 1.5, [4, 3]);
      }
      const tg = trackDir ? (hover?.trackGuide ?? null) : null;
      for (const q of tracks) {
        const sp = P(q);
        if (!sp) continue;
        const on1 = !!tf && sameTrackPoint(q, tf);
        const on2 = !on1 && !!to && sameTrackPoint(q, to.from);
        // 0.30.0: 안내 선끼리 만나는 점의 둘째 끌어온 점도 크게(첫째와 같은 추론 색)
        const on3 = !on1 && !on2 && !!tg && sameTrackPoint(q, tg.from);
        const on = on1 || on2 || on3;
        const r = on ? 6 : 4;
        for (const [color, w] of [
          [th.textBg, on ? 4 : 3.5],
          [on1 || on3 ? col : on2 ? col2 : th.measure, on ? 2 : 1.5],
        ] as const) {
          ctx.strokeStyle = color;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(sp[0] - r, sp[1]);
          ctx.lineTo(sp[0] + r, sp[1]);
          ctx.moveTo(sp[0], sp[1] - r);
          ctx.lineTo(sp[0], sp[1] + r);
          ctx.stroke();
        }
      }
    }
    for (const p of pts) dotAt(P(p), false);
    if (hover) {
      const k = hover.kind;
      // 0.7.2의 두 모양(꼭짓점·끝점 네모, 붙잡지 않음 동그라미) 그대로, 0.8.0 붙잡기 종류만 새 모양
      if (trackDir && k === 'perpendicular') {
        // 0.27.0 끌어온 점에서 수직인 선 위: 추론 색 동그라미와 오른쪽 위에 기준 선분 화면 방향의 ⊥(밑줄이 기준 선분 방향)
        const sp = P(hover.p);
        if (sp) {
          ctx.fillStyle = inferColor;
          ctx.strokeStyle = th.textBg;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sp[0], sp[1], 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          const e0 = hover.edge ? P(hover.edge[0]) : null, e1 = hover.edge ? P(hover.edge[1]) : null;
          let ux = e0 && e1 ? e1[0] - e0[0] : 1, uy = e0 && e1 ? e1[1] - e0[1] : 0;
          const ul = Math.hypot(ux, uy);
          if (ul > 1e-6) {
            ux /= ul;
            uy /= ul;
          } else {
            ux = 1;
            uy = 0;
          }
          // 줄기는 화면 위쪽을 향하게
          let nx = -uy, ny = ux;
          if (ny > 0) {
            nx = -nx;
            ny = -ny;
          }
          const cx = sp[0] + 12, cy = sp[1] - 8;
          for (const [color, w] of [
            [th.textBg, 4],
            [inferColor, 1.8],
          ] as const) {
            ctx.strokeStyle = color;
            ctx.lineWidth = w;
            ctx.beginPath();
            ctx.moveTo(cx - ux * 5.5, cy - uy * 5.5);
            ctx.lineTo(cx + ux * 5.5, cy + uy * 5.5);
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + nx * 8, cy + ny * 8);
            ctx.stroke();
          }
        }
      } else if (k === 'midpoint' || k === 'center' || k === 'point' || k === 'intersection' || k === 'perpendicular' || k === 'tangent') snapMarkAt(P(hover.p), k);
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
      } else if (k === 'parallel') {
        // 0.10.0 나란함: 추론 색 동그라미와 오른쪽 위에 기준 선분 화면 방향의 겹줄(∥)
        const sp = P(hover.p);
        if (sp) {
          ctx.fillStyle = inferColor;
          ctx.strokeStyle = th.textBg;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sp[0], sp[1], 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          const e0 = hover.edge ? P(hover.edge[0]) : null, e1 = hover.edge ? P(hover.edge[1]) : null;
          let ux = e0 && e1 ? e1[0] - e0[0] : 1, uy = e0 && e1 ? e1[1] - e0[1] : 0;
          const ul = Math.hypot(ux, uy);
          if (ul > 1e-6) {
            ux /= ul;
            uy /= ul;
          } else {
            ux = 1;
            uy = 0;
          }
          const cx = sp[0] + 12, cy = sp[1] - 12;
          for (const [color, w] of [
            [th.textBg, 4],
            [inferColor, 1.8],
          ] as const) {
            ctx.strokeStyle = color;
            ctx.lineWidth = w;
            ctx.beginPath();
            for (const s of [-2.5, 2.5]) {
              ctx.moveTo(cx - uy * s - ux * 5, cy + ux * s - uy * 5);
              ctx.lineTo(cx - uy * s + ux * 5, cy + ux * s + uy * 5);
            }
            ctx.stroke();
          }
        }
      } else dotAt(P(hover.p), hover.vertex);
      // 0.29.0 끌어온 점 안내 선이 다른 선·선분·면과 만나는 점(trackDirs { meets }): 동그라미 위에 추론 색 ×(그 선 위 점과 가른다)
      if (trackDir && (hover.direction || hover.trackOther || hover.segment || hover.face || hover.trackGuide)) {
        const sp = P(hover.p);
        if (sp)
          for (const [color, w] of [
            [th.textBg, 4],
            [inferColor, 1.8],
          ] as const) {
            ctx.strokeStyle = color;
            ctx.lineWidth = w;
            ctx.beginPath();
            ctx.moveTo(sp[0] - 7, sp[1] - 7);
            ctx.lineTo(sp[0] + 7, sp[1] + 7);
            ctx.moveTo(sp[0] + 7, sp[1] - 7);
            ctx.lineTo(sp[0] - 7, sp[1] + 7);
            ctx.stroke();
          }
      }
      // 0.10.0 잠금: 표식 둘레 고리(안내선 색), 옮겨 온 점은 빈 동그라미
      if (hover.locked) {
        const sp = P(hover.p);
        const col = k === 'axis' && hover.axis ? axisColor(hover.axis) : inferColor;
        if (sp)
          for (const [color, w] of [
            [th.textBg, 4.5],
            [col, 2],
          ] as const) {
            ctx.strokeStyle = color;
            ctx.lineWidth = w;
            ctx.beginPath();
            ctx.arc(sp[0], sp[1], 9.5, 0, Math.PI * 2);
            ctx.stroke();
          }
        const sf = hover.from ? P(hover.from) : null;
        if (sf) {
          ctx.fillStyle = th.textBg;
          ctx.strokeStyle = th.measure;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sf[0], sf[1], 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
}
