/**
 * 3D 뷰어 공개 입구. 화면 껍데기는 여기서만 가져다 쓴다.
 */
export type { Box3, LineSet3d, Mesh3d, NormalArray, Pick3d, PointSet3d, Rgba, Scene3d, SnapKind, SnapPoint, Texture3d, UvArray, UvTransform } from './types';
export { packNormals, packUvs } from './attribs';
export { SNAPSHOT_MAX_PIXELS, Viewer3d } from './viewer';
export type {
  AnnotationOptions,
  BackgroundOptions,
  ContextRestoreNeed,
  FogOptions,
  GroupInfo,
  ItemLookState,
  LightingOptions,
  MarkerOptions,
  MeasureFormat,
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
  ProjectedPoint,
  RangeSelection,
  ReleaseOptions,
  SectionCaps,
  SectionHandle,
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
export type {
  InferenceLock,
  InferenceLockInput,
  InferenceLockKind,
  MeasureInference,
  MeasureTrackDirOptions,
  MeasureTrackOptions,
  NormalizedInference,
  NormalizedTrackDirs,
  SnapAxis,
  TrackDirEdgeFilter,
} from './inference';
export type { SnapFace, SnapRefineFaceInput, SnapRefineFaceKind, SnapRefineInput, SnapRefineKind, SnapRefineLine, SnapSegment } from './snap';
export type {
  AxisEdgeSnap,
  AxisFaceSnap,
  DwellStep,
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
  TrackDirMeetOptions,
  TrackDirMeetSnap,
  TrackDirOtherLine,
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
export type { IndexRange } from './ranges';
export { segmentsById } from './segments';
export { type ClosestResult, closestBetween } from './closest';
export { type Annotation3d, type AnnotationKind, angleAt, annotationGeometry } from './annotate';
export type { CameraState, Projection, ViewName } from './camera';
export { VIEW_KEYS, VIEW_LABELS } from './camera';
export type { GpuBufferPart, GpuBufferStats, RenderMode, TextureSource, TextureStats } from './renderer';
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
