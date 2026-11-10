/**
 * 3D 뷰어 공개 입구. 화면 껍데기는 여기서만 가져다 쓴다.
 */
export type { Box3, LineSet3d, Mesh3d, NormalArray, Pick3d, PointSet3d, Rgba, Scene3d, SnapKind, SnapPoint, SnapPriority, Texture3d, UvArray, UvTransform } from './types';
export { packNormals, packUvs } from './attribs';
export { hypot3 } from './math';
export { SNAPSHOT_MAX_PIXELS, TEXTURE_REDRAW_MS, TEXTURE_REDRAW_SLOW, Viewer3d } from './viewer';
export type {
  AnnotationOptions,
  BackgroundOptions,
  ClosestPointsAsyncOptions,
  ClosestPointsOptions,
  ContextRestoreNeed,
  FogOptions,
  GroupInfo,
  ItemLookInput,
  ItemLookState,
  LightingOptions,
  MarkerOptions,
  MeasureFormat,
  MeasureFormatCore,
  MeasureHoverSnap,
  MeasureInferenceLock,
  LabelFallback,
  LabelSpotName,
  MeasureLabelAvoid,
  MeasureLabelRect,
  MeasureLabelSpot,
  MeasurePoint,
  MeasureResult,
  MeasureSnapOptions,
  WalkOptions,
  OnPickOptions,
  PickEvent,
  PickOptions,
  HeldPointer,
  KeyboardCursorState,
  KeyboardSnapAnnouncement,
  KeyboardSnapOptions,
  KeyPickCycleOptions,
  MeasureCandidatesOptions,
  PickCandidatesOptions,
  PickGroupKey,
  PointerClaimHandler,
  PointerClaimQuery,
  PointerHoldEnd,
  PointerHoldHandler,
  PointsForContext,
  ProjectedPoint,
  ProjectOptions,
  RangeSelection,
  ReleaseOptions,
  SectionCaps,
  SectionHandle,
  SectionItem,
  SectionItemRange,
  ViewCubeTouchOptions,
  ViewCubeExpandEvent,
  ViewCubeExpandReason,
  SectionOptions,
  SectionPlane,
  SectionState,
  SegmentHighlightOptions,
  SetMeshOptions,
  SnapshotOptions,
  Viewer3dOptions,
  Viewer3dStats,
} from './viewer';
export type { Plane4, SectionAxis } from './section';
export { PICK_CANDIDATES_MAX, samePickTarget } from './scenepick';
export type {
  InferenceLock,
  InferenceLockInput,
  InferenceLockKind,
  MeasureInference,
  MeasureTrackDirMeets,
  MeasureTrackDirOptions,
  MeasureTrackOptions,
  NormalizedInference,
  NormalizedTrackDirs,
  SnapAxis,
  TrackDirEdgeFilter,
} from './inference';
export type { SnapFace, SnapRefineFaceInput, SnapRefineFaceKind, SnapRefineInput, SnapRefineKind, SnapRefineLine, SnapSegment } from './snap';
export { LOW_PRIORITY_YIELD_PX, snapRaw } from './snap';
export type {
  AxisEdgeSnap,
  AxisFaceSnap,
  DwellStep,
  EdgePatchAccept,
  FacePatchAccept,
  LockEdgeSnap,
  LockFaceSnap,
  LockTrackSnap,
  OpenEdgeCandidate,
  OpenEdgeLine,
  OpenEdgeSnap,
  OpenFaceCandidate,
  OpenFaceSnap,
  TrackDirGuide,
  TrackDirKind,
  TrackDirLine,
  TrackDirMeetOptions,
  TrackDirMeetSnap,
  TrackDirOtherLine,
  TrackDirPairSnap,
  TrackDirSnap,
  TrackEdgeSnap,
  TrackFaceHit,
  TrackGuide,
  TrackLine,
  TrackSegment,
  TrackSnap,
  TrackTriangle,
} from './track';
export { MAX_SECTION_PLANES } from './section';
export {
  KEY_BIG_STEP_PX,
  KEY_CANDIDATES_MAX,
  KEY_POINTER,
  KEY_SNAP_KEYS,
  KEY_SNAP_MESSAGES,
  KEY_STEP_PX,
  type KeyDesc,
  type KeySnapAction,
  type KeySnapKeys,
  type KeySnapMessageFn,
  type KeySnapMessageKey,
  type KeySnapMessages,
  type KeySnapText,
  SNAP_KIND_LABELS,
  candidateText,
  formatKeySnapMessage,
  keyLabel,
  keySnapAction,
  keySnapHint,
  keySnapMessages,
  keySnapText,
  normalizeKeySnapKeys,
  orderedText,
  parseKeyDesc,
  pointText,
  snapKindText,
} from './keysnap';
export type { IndexRange } from './ranges';
export { segmentsById } from './segments';
export {
  CLOSEST_SLICE_MS,
  type ClosestOptions,
  type ClosestResult,
  ClosestSearch,
  type ClosestSliceStats,
  type ClosestYield,
  closestBetween,
  closestBetweenAsync,
  type ClosestPart,
  closestPart,
} from './closest';
export { type Annotation3d, type AnnotationKind, HIDDEN_LABEL_DASH, angleAt, annotationGeometry, annotationLabelLook, measureDigits, measureNumber } from './annotate';
export type { CameraState, Projection } from './camera';
export { VIEW_KEYS, VIEW_LABELS, type ViewName, viewKeyOf } from './viewkeys';
export {
  type AnimateSetting,
  CAMERA_MOVE_MAX_MS,
  CAMERA_MOVE_MS,
  type FlyToOptions,
  type MotionMatchMedia,
  type MotionQueryList,
  REDUCED_MOTION_QUERY,
  moveDuration,
  normalizeAnimate,
  resolveAnimate,
  watchReducedMotion,
} from './motion';
export { CUBE_TOUCH_BAND, CUBE_TOUCH_MIN, CUBE_TOUCH_SIZE, type CubeTarget, cubeTargets } from './viewcube';
export type { GpuBufferPart, GpuBufferStats, InstancingOptions, MergeKitState, RenderMode, TextureSource, TextureStats } from './renderer';
export { INSTANCE_MIN } from './renderer';
export { MERGE_AUTO_MIN, MERGE_MESH_SEGMENTS, MERGE_MESH_VERTS, type MergingMode, type MergingOptions } from './mergeopts';
export { PBR_DEFAULT_ROUGHNESS, PBR_MAX_EXPONENT, type PbrSource, type PbrState, pbrSource, pbrState, specExponent } from './pbr';
export { AO_LOW_DIV, AO_MAX_INTENSITY, AO_MAX_PIXELS, AO_RADIUS_RATIO, AO_SAMPLES, type AmbientOcclusionOptions, type AoMoving, type AoParams, aoParams, aoSize } from './ao';
export {
  COORD_LIMIT,
  SCENE_ISSUE_MESSAGES,
  type SceneCheck,
  type SceneIssue,
  type SceneIssueAction,
  type SceneIssueCode,
  checkScene,
  sceneIssueText,
} from './sceneissues';
export type { MeshArrays } from './release';
export { TEXTURE_BUDGET, TEXTURE_LIMIT, imageInfo, type ImageInfo } from './texture';
export type { MarkerKind } from './marker';
export type { GridZ } from './grid';
export type { Viewer3dTheme } from './theme';
export { DARK_THEME, LIGHT_THEME, LINE_CONTRAST_MIN, THEME_CSS_VARS, contrastLineColor, contrastRatio } from './theme';
export { sceneBounds } from './bounds';
export {
  DOUBLE_CLICK_PX,
  DRAG_START_PX,
  PICK_TOLERANCE_PX,
  SNAP_PX,
  TOUCH_DOUBLE_TAP_PX,
  TOUCH_DRAG_START_PX,
  TOUCH_PICK_TOLERANCE_PX,
  dragStartPx,
  walkKeyOf,
  type WalkKey,
  isTouch,
  pickTolerance,
  type PickTolerance,
} from './pointer';
