/**
 * WebGL2 그리기: 장면 형식 배열을 그대로 GPU 버퍼에 올리고(같은 배열은 한 번만), 묶음마다 그리기 한 번.
 * 화면 상태(카메라·모드·강조·그리기 범위·단면)는 부를 때마다 RenderState로 받는다. DOM은 모른다.
 *
 * 큰 좌표: 묶음 원점(origin)은 모형 행렬 matrix · T(origin)으로 합쳐 double로 시점·투영 행렬과 곱한 뒤에야 float32로 넘긴다(RTC).
 * 그래서 positions가 원점 기준의 작은 값이면 세계 좌표가 1e6대여도 떨리지 않는다. 원점이 없으면 예전과 같은 행렬을 쓴다.
 *
 * 단면: 세계 평면을 묶음마다 로컬 좌표로 옮겨(planeToLocal) u_clip으로 넘긴다. 잘린 면 채우기는 스텐실 홀짝으로 한다 —
 * 닫힌 그물을 잘린 채로 스텐실에 뒤집어 그리면 평면 위 입체 안쪽 화소만 1이 남고, 거기에 평면 ∩ 범위 다각형을 칠한다.
 *
 * 무늬: 장면의 무늬 그림(Scene3d.textures) 중 그물이 쓰는 것만 몇 장씩 풀어(decodeTexture — 한 장 한도·전체 예산 안으로 줄임)
 * REPEAT·밉맵으로 올린다. 다 풀기 전에는 그물을 color로 칠하고, 올릴 때마다 onTexture로 다시 그리게 알린다.
 * 같은 무늬 객체를 다시 넘긴 장면(setScene)은 올린 무늬를 그대로 쓴다.
 */
import type { Box3, LineSet3d, Mesh3d, PointSet3d, Rgba, Scene3d, Texture3d } from './types';
import { type ViewFrame, viewMatrix } from './camera';
import type { GridLines } from './grid';
import { type MarkerKind, markerMesh } from './marker';
import { type V3, cross, hasOrigin, mat4Mul, modelMatrix, normalMatrix, normalize, orthographic, translation } from './math';
import { boxCenter, boxIsEmpty, boxSphere, meshBounds, transformBox, unionBox } from './bounds';
import { DEPTH_FS, DEPTH_VS, FULL_VS, MESH_FS, MESH_VS, POINT_FS, POINT_VS, PROFILE_FS, SKY_FS, THIN_FS, THIN_VS, WIDE_FS, WIDE_VS, withClip, withDefines } from './shaders';
import { TEXTURE_BUDGET, TEXTURE_LIMIT, decodeTexture, textureSides, uvComponents } from './texture';
import { contrastLineColor } from './theme';
import { type BufferSink, type BufferTarget, CHUNK_BYTES, CHUNK_MIN_BYTES, ChunkedUpload, type UploadArray, newArrays } from './upload';
import { MAX_SECTION_PLANES, NO_CLIP, type Plane4, boxStraddles, planeBoxPolygon, planeToLocal } from './section';
import { type IndexRange, type RangePart, clipRanges, compactStride, compactTriIndices, countBelow, partsOf, rangesTotal } from './ranges';

/**
 * 그리기 모드. 0.7.0: hiddenLine(면을 바탕색으로 채워 뒤의 선을 가리고 윤곽선만 — 숨은 윤곽선을 점선으로 보일 수도),
 * monochrome(정점 색·무늬 없이 한 색 음영 + 윤곽선), noTexture(무늬만 끈 음영 + 윤곽선)
 */
export type RenderMode = 'shaded' | 'shadedEdges' | 'wireframe' | 'xray' | 'hiddenLine' | 'monochrome' | 'noTexture';

/** 그물이 윤곽선(Mesh3d.edges)을 선분 하나(6값) 이상 가졌는지 — 이때만 윤곽선을 올려 그린다 */
export function hasMeshEdges(m: Pick<Mesh3d, 'edges'>): boolean {
  return !!m.edges && m.edges.length >= 6;
}

/**
 * 윤곽선·와이어프레임 차례에 그물을 무엇으로 그리는지: 'edges' = 윤곽선(음영 말고 모든 모드),
 * 'triangles' = 삼각형 변(윤곽선이 없는 그물을 와이어프레임·숨은 선 모드에서 — Mesh3d.triangleEdges가 false면 하지 않는다),
 * null = 선 없음
 */
export function meshLineKind(m: Pick<Mesh3d, 'edges' | 'triangleEdges'>, mode: RenderMode): 'edges' | 'triangles' | null {
  if (mode === 'shaded') return null;
  if (hasMeshEdges(m)) return 'edges';
  return (mode === 'wireframe' || mode === 'hiddenLine') && m.triangleEdges !== false ? 'triangles' : null;
}

/** 면을 채우는 음영 계열 모드(음영·음영+윤곽·숨은 선·단색·무늬 없음): 불투명 면을 먼저 그려 깊이로 서로 가린다 */
export function isShadedLike(mode: RenderMode): boolean {
  return mode === 'shaded' || mode === 'shadedEdges' || mode === 'hiddenLine' || mode === 'monochrome' || mode === 'noTexture';
}

/**
 * 외곽선(RenderState.profiles)을 그리는 모드: 음영 계열과, 0.7.2부터 와이어프레임.
 * 외곽선은 어느 모드에서나 불투명 그물만 그린 맨 앞 깊이 그림의 실루엣이다(바깥 테두리·구멍·앞 그물이 뒤 그물 위에 겹친 테두리).
 * 와이어프레임은 면이 서로 가리지 않지만 외곽선은 이 맨 앞 그림을 따르므로 앞 그물에 가린 뒤 그물의 외곽선은 그 자리에서 끊긴다.
 * X-ray는 그리지 않는다: 반투명 면이 이미 모양을 보여 주고(모서리 없는 면도 사라지지 않는다), 모든 면을 비쳐 보이는 모드에서
 * 맨 앞 깊이 실루엣은 비쳐 보이는 뒤 그물의 외곽선을 앞 그물 자리에서 끊어 그림과 어긋난다
 */
export function drawsProfiles(mode: RenderMode): boolean {
  return mode === 'wireframe' || isShadedLike(mode);
}

/**
 * 숨은 점선(뒤 모서리)을 그리는 것(0.8.0): 숨은 선 모드는 0.7.2처럼 그물 윤곽선과 LineSet3d.hiddenEdges 선분 묶음 모두.
 * shaded(RenderState.hiddenEdgesShaded)면 음영 계열에서도 — 그물 윤곽선은 보이는 윤곽선을 그리는 모드(음영+윤곽·단색·무늬 없음)에서만,
 * 음영은 선분 묶음만. 와이어프레임·X-ray는 면이 가리지 않으므로 없다
 */
export function drawsBackEdges(mode: RenderMode, shaded: boolean): { meshes: boolean; lines: boolean } {
  if (mode === 'hiddenLine') return { meshes: true, lines: true };
  if (!shaded || !isShadedLike(mode)) return { meshes: false, lines: false };
  return { meshes: mode !== 'shaded', lines: true };
}

/**
 * 그물 윤곽선·삼각형 변 선 색(0.8.0 선택 포함). 강조면 강조색. 없으면 0.7.2 모드 색: 숨은 선 = 선 색, 음영+윤곽·단색·무늬 없음 = 윤곽선 색,
 * 와이어프레임·X-ray = 그물 색(X-ray 알파 0.9). fixed면 그 색(X-ray는 알파에 0.9), contrast(대신할 선 색)면 바탕을 보고 고르는 모드
 * (와이어프레임·X-ray·숨은 선)에서 바탕과 3:1이 안 될 때 contrastLineColor로 바꾼다
 */
export function meshEdgeColor(
  mode: RenderMode,
  meshColor: Rgba,
  colors: Pick<RenderColors, 'line' | 'edge' | 'background' | 'highlight'>,
  hi: boolean,
  opt: { fixed?: Rgba | null; contrast?: Rgba | null } = {},
): Rgba {
  if (hi) return colors.highlight;
  let c: Rgba =
    mode === 'hiddenLine' ? colors.line : mode === 'shadedEdges' || mode === 'monochrome' || mode === 'noTexture' ? colors.edge : [meshColor[0], meshColor[1], meshColor[2], mode === 'xray' ? 0.9 : 1];
  const f = opt.fixed;
  if (f) c = mode === 'xray' ? [f[0], f[1], f[2], f[3] * 0.9] : f;
  if (opt.contrast && (mode === 'hiddenLine' || mode === 'wireframe' || mode === 'xray')) c = contrastLineColor(c, colors.background, opt.contrast);
  return c;
}

/**
 * 그물 하나의 윤곽선·삼각형 변 색(0.9.0): 선 색 선택(lineOpt — 전역 edgeColor·대비)도 그물 색(item — setItemEdgeColor)도 없으면
 * 0.7.2 모드 색 그대로(meshEdgeColor 기본과 같은 값). 그물 색이 있으면 그 그물에서는 전역 edgeColor 자리에 쓰고 대비 선택은 그대로 따진다
 */
export function edgeLineColor(
  mode: RenderMode,
  meshColor: Rgba,
  colors: Pick<RenderColors, 'line' | 'edge' | 'background' | 'highlight'>,
  hi: boolean,
  lineOpt: { fixed?: Rgba | null; contrast?: Rgba | null } | null,
  item?: Rgba | null,
): Rgba {
  if (!lineOpt && !item)
    return hi ? colors.highlight : mode === 'hiddenLine' ? colors.line : mode === 'shadedEdges' || mode === 'monochrome' || mode === 'noTexture' ? colors.edge : [meshColor[0], meshColor[1], meshColor[2], mode === 'xray' ? 0.9 : 1];
  return meshEdgeColor(mode, meshColor, colors, hi, item ? { fixed: item, contrast: lineOpt?.contrast ?? null } : lineOpt!);
}

/**
 * 숨은 점선(뒤 모서리) 한 묶음의 선 그리기 선택(0.9.0): 1화소 점선, 묶음 불투명도를 곱한 alpha.
 * 늘 두꺼운 선 변종 CAPZ(끝 마개를 늘릴 때 깊이도 선을 따라 늘리고 기울기만큼 눈 쪽으로)에 BACK_EDGE_BIAS만큼 당겨 그린다 —
 * 보이는 모서리 위에 점선이 겹치지 않게. 0.8.0은 숨은 선 모드 기본 색(점선 색을 주지 않음)에서만 기본 변종이라
 * 마개 깊이가 어긋나 보이는 모서리 위에도 점선이 조금 겹쳤다(0.7.2부터)
 */
export function backEdgeDash(color: Rgba, alpha: number): { color: Rgba; vcol: false; width: 1; dashed: true; alpha: number; bias: number; capz: true } {
  return { color, vcol: false, width: 1, dashed: true, alpha, bias: BACK_EDGE_BIAS, capz: true };
}

/**
 * 외곽선 굵기(장치 화소)를 1화소로 그리는지(0.7.2): 1.5 미만이면 끊긴 곳 앞쪽 화소만 칠한다.
 * 그 이상은 0.7.1 그대로 끊긴 곳 양쪽을 굵기/2(최소 1)씩 — 가장 가는 것이 2화소
 */
export function profileOnePixel(width: number): boolean {
  return width < 1.5;
}

export interface RenderColors {
  /** 단색 모드 면 색(없으면 밝은 회색) */
  monochrome?: Rgba;
  background: Rgba;
  edge: Rgba;
  line: Rgba;
  point: Rgba;
  grid: Rgba;
  gridMinor: Rgba;
  axisX: Rgba;
  axisY: Rgba;
  highlight: Rgba;
}

export interface DrawRange {
  count: number;
  /** 나머지를 이 불투명도로 흐리게(0이면 안 그림) */
  ghost: number;
}

/** 앱이 고른 선분 강조(Viewer3d.setHighlightSegments) — 선분 자체는 setHighlightSegments로 올린다 */
export interface SegmentHighlightDraw {
  color: Rgba;
  /** 화면 화소 굵기 */
  width: number;
  /** 가려진 부분의 불투명도(0이면 가려진 부분은 안 그림) */
  hidden: number;
}

export interface MarkerDraw {
  kind: MarkerKind;
  matrix: Float64Array;
  color: Rgba;
}

/** 단면 그리기 상태 */
export interface SectionDraw {
  /** 세계 평면 [a, b, c, w](값 > 0 쪽을 버린다) */
  plane: Plane4;
  /** 잘린 면 채우기: 'closed' = Mesh3d.closed인 불투명 그물만, 'all' = 불투명 그물 모두, 'none' = 채우지 않음 */
  caps: 'closed' | 'all' | 'none';
  /** 단면 테두리(교선) 색 */
  color: Rgba;
  /** 단면 테두리 굵기(화면 화소) */
  width: number;
}

/** 묶음 하나의 겉모습 바꾸기(0.7.0, Viewer3d.setItemOpacity·setItemColor·setItemMatrix 등) */
export interface ItemLook {
  /** 불투명도 0~1(묶음 색 알파에 곱한다. 1보다 작으면 반투명 차례에 그린다) */
  alpha?: number;
  /** 색 바꾸기(정점 색·무늬 대신 이 색, 알파도 이 값) */
  color?: Rgba;
  /** 세계에 더 거는 4×4 행렬(열 우선): 세계' = matrix · 세계 */
  matrix?: ArrayLike<number>;
  /** 0.9.0: 그물 윤곽선(Mesh3d.edges)·삼각형 변 색(강조색이 먼저, 전역 edgeColor보다 먼저 — X-ray는 알파에 0.9) */
  edgeColor?: Rgba;
  /** 0.9.0: 외곽선 색(전역 profiles.color 대신, 이 그물이 앞에 있는 외곽선) */
  profileColor?: Rgba;
}

/** 여러 단면 그리기 상태(0.7.0 — 평면이 둘 이상이거나 범위를 정한 평면이 있을 때). 있으면 section 대신 쓴다 */
export interface SectionsDraw {
  /** 평면들(세계 [a, b, c, w], 값 > 0 쪽을 버린다)과 채우기 */
  planes: readonly { plane: Plane4; caps: 'closed' | 'all' | 'none' }[];
  /** 묶음 id → 그 묶음을 자르는 평면 번호들(planes 안, 오름차순). 모르는 id(강조 선분 등)는 범위 없는 평면들 */
  of: (id: string) => readonly number[];
  /** 단면 테두리 색·굵기 */
  color: Rgba;
  width: number;
}

/**
 * 묶음 안 구간(숨김·강조)을 반영한 보이는 구간 목록. 뷰어가 만들어 넘긴다.
 * prims: 그물 = 삼각형, 선분 묶음 = 선분, 점 묶음 = 점 번호의 보이는 구간(hi = 강조). edges: 그물 윤곽선 선분의 보이는 구간
 */
export interface ItemParts {
  /** 바뀔 때마다 새 값(GPU 캐시 열쇠) */
  ver: number;
  prims: readonly RangePart[];
  edges?: readonly RangePart[] | null;
}

export interface RenderState {
  mode: RenderMode;
  colors: RenderColors;
  /** 화면 화소 → 장치 화소 */
  dpr: number;
  /** 보이는 항목인지 */
  visible: (id: string, group: string | undefined) => boolean;
  highlight: ReadonlySet<string>;
  ranges: ReadonlyMap<string, DrawRange>;
  grid: boolean;
  marker: MarkerDraw | null;
  /** 선분 강조(없으면 null) */
  segHighlight: SegmentHighlightDraw | null;
  /** 끄는 중(큰 선분 묶음은 가는 선으로 빠르게) */
  interacting: boolean;
  /** 단면(없으면 null 또는 생략) */
  section?: SectionDraw | null;
  /** 여러 단면(있으면 section 대신) */
  sections?: SectionsDraw | null;
  /** 묶음 안 구간(숨김·강조). 없는 묶음은 통째로 그린다 */
  parts?: (id: string) => ItemParts | undefined;
  /** 묶음별 겉모습(없으면 모두 장면 그대로) */
  look?: ((id: string) => ItemLook | undefined) | null;
  /** 화면 밖 그리기(그림 저장): 대상 크기(장치 화소). 없으면 그리기 버퍼 크기 */
  viewport?: readonly [number, number];
  /** 투명 바탕(그림 저장): 바탕을 비우고 알파를 곱해 쌓는다(결과 색은 알파를 곱한 값) */
  transparent?: boolean;
  /** 숨은 선 모드에서 면 뒤의 윤곽선을 이 불투명도의 점선으로(0·없으면 안 그림) */
  hiddenEdges?: number;
  /**
   * 0.8.0: 숨은 점선을 음영 계열 모드(음영·음영+윤곽·단색·무늬 없음)에서도 그린다(SketchUp "뒤 모서리"). 그물 윤곽선은 보이는 윤곽선을 그리는
   * 모드에서만(음영은 LineSet3d.hiddenEdges 선분 묶음만). 없으면 숨은 선 모드에서만(0.7.2)
   */
  hiddenEdgesShaded?: boolean;
  /** 0.8.0: 숨은 점선 색(없으면 colors.line) */
  hiddenEdgeColor?: Rgba | null;
  /**
   * 0.8.0: 그물 윤곽선(Mesh3d.edges)과 삼각형 변 선 색. 주면 선을 그리는 모든 모드에서 이 색(강조색은 그대로, X-ray는 알파에 0.9를 곱한다).
   * 없으면 모드 색(와이어프레임·X-ray = 그물 색, 숨은 선 = colors.line, 음영+윤곽·단색·무늬 없음 = colors.edge)
   */
  edgeColor?: Rgba | null;
  /**
   * 0.8.0: 바탕을 보고 선 색을 고르는 모드(와이어프레임·X-ray·숨은 선)에서 윤곽선·삼각형 변 색이 바탕(colors.background)과 대비 3:1이 안 되면
   * fallback(테마 선 색 — 그것도 모자라면 검정·흰색)으로 바꾼다. edgeColor보다 뒤에 따진다
   */
  edgeContrast?: { fallback: Rgba } | null;
  /**
   * 화면 공간 외곽선(실루엣): 굵기(장치 화소)·색. 음영 계열 모드와 와이어프레임(0.7.2)에서(drawsProfiles).
   * 굵기 1.5 미만은 끊긴 곳 앞쪽 1화소만(0.7.2 — 0.7.1까지는 2화소로 그렸다), 그 이상은 0.7.1 그대로 양쪽 굵기/2씩
   */
  profiles?: { width: number; color: Rgba } | null;
  /** 하늘·땅 바탕(없으면 colors.background 한 색) */
  sky?: { sky: Rgba; skyHorizon: Rgba; ground: Rgba; groundHorizon: Rgba } | null;
  /** 해 조명(없으면 예전 고정 조명): 세계 방향(해 쪽, 단위)·색(세기를 곱한 rgb)·주변광 */
  light?: { dir: V3; color: Rgba; ambient: number } | null;
  /** 해 그림자(light가 있을 때): 그림자를 받을 범위(세계)·깊이 그림 크기·치우침·판(바뀌면 깊이 그림을 다시 그린다) */
  shadow?: { box: Box3; size: number; bias: number; version: number } | null;
  /** 선형 안개: 색·시작·끝(눈 깊이, 세계 단위) */
  fog?: { color: Rgba; start: number; end: number } | null;
  /** 앱 측정 덧그림 선(setAnnotationLines로 올린 것)을 그릴 때: 굵기(화면 화소)·가려진 부분 불투명도(0이면 안 그림) */
  annotations?: { width: number; hidden: number } | null;
}

export interface RenderStats {
  drawCalls: number;
  triangles: number;
  segments: number;
  points: number;
}

/** 무늬 그림 상태(장면이 쓰는 것만) */
export interface TextureStats {
  /** 그물이 쓰는 무늬 수 */
  count: number;
  /** 올린 수 */
  ready: number;
  /** 풀지 못한 수(그물은 color로 칠한다) */
  failed: number;
  /** 올린 무늬의 GPU 크기 어림(바이트, 밉맵 포함) */
  bytes: number;
}

/** 한 번에 풀어 두는 무늬 수(풀린 그림이 한꺼번에 메모리에 쌓이지 않게) */
const TEXTURE_DECODES = 4;

interface TexRec {
  src: Texture3d;
  /** 긴 변 한도(화소) */
  side: number;
  tex: WebGLTexture | null;
  state: 'queued' | 'decoding' | 'ready' | 'failed';
  bytes: number;
}

/** 음영 계열 뒤 모서리 점선(0.8.0)을 눈 쪽으로 당기는 깊이 치우침(클립 z에서 w에 곱한다 — 반올림 차이만 덮는 크기) */
const BACK_EDGE_BIAS = 2e-6;

/** 끄는 동안 이보다 많은 선분 묶음은 gl.LINES(1화소)로 그린다 */
export const FAST_LINES_WHILE_MOVING = 400_000;

interface Prog {
  p: WebGLProgram;
  u: Map<string, WebGLUniformLocation | null>;
  /** 그물 변종 표시: CLIP(평면 하나 u_clip)·CLIPN(여러 평면)·TEX(무늬)·SUN·SHADOW·FOG */
  clip1?: boolean;
  clipN?: boolean;
  tex?: boolean;
  sun?: boolean;
  shadow?: boolean;
  fog?: boolean;
  back?: boolean;
  backTex?: boolean;
}

/** 겉모습 행렬을 합친 모형 행렬 캐시(행렬·원래 모형이 같으면 다시 쓴다 — 균일 변수 캐시가 같은 객체로 알아보게) */
interface LookCache {
  src: ArrayLike<number>;
  base: ArrayLike<number> | undefined;
  model: ArrayLike<number>;
  box?: Box3;
  center?: V3;
}

interface LineRec {
  lookM?: LookCache;
  id: string;
  group: string | undefined;
  n: number;
  pos: WebGLBuffer;
  col: WebGLBuffer | null;
  wide: WebGLVertexArrayObject;
  thin: WebGLVertexArrayObject;
  /** 로컬 → 세계(묶음 원점), 없으면 단위 */
  model?: ArrayLike<number>;
  parts?: PartCache;
}

/** 한 종류(보통·강조)의 그릴 구간: 구간이 적으면 원래 버퍼에서 구간마다, 많으면 모은 자료로 한 번에 */
interface DrawList {
  runs: IndexRange[];
  total: number;
  compact: { vao: WebGLVertexArrayObject; count: number; rec?: LineRec } | null;
}

/** 묶음 하나의 구간 그리기 캐시(ItemParts.ver가 바뀌면 GPU 자료를 지우고 새로) */
interface PartCache {
  ver: number;
  vaos: WebGLVertexArrayObject[];
  bufs: WebGLBuffer[];
  lists: Map<string, DrawList>;
}

/** 구간이 이보다 많으면 모은 자료(색인·복사본)를 만들어 그리기 한 번으로 그린다 */
const RUN_LIMIT = 24;

interface MeshRec {
  lookM?: LookCache;
  src: Mesh3d;
  vao: WebGLVertexArrayObject;
  count: number;
  indexed: boolean;
  hasNormals: boolean;
  hasColors: boolean;
  /** 무늬 좌표 정점당 값 수(0 = 무늬 없음) */
  uv: 0 | 2 | 3;
  /** 무늬 그림 id(uv가 있고 장면에 그 그림이 있을 때) */
  tex: string | null;
  /** 무늬 그림의 알파를 불투명도에 곱하는지(Texture3d.alpha — 반투명 차례에 그린다) */
  texAlpha: boolean;
  transparent: boolean;
  /** 뒷면(Mesh3d.backColor·backTexture): 색(없으면 null)·뒷면 무늬 id·좌표 값 수·무늬 알파 */
  back: { color: Rgba | null; tex: string | null; uv: 0 | 2 | 3; texAlpha: boolean } | null;
  /** 로컬 → 세계 = matrix · T(origin)(원점이 없으면 matrix 그대로, 둘 다 없으면 undefined) */
  model: ArrayLike<number> | undefined;
  /** 세계 범위(행렬·원점 반영) */
  box: Box3;
  /** 세계 좌표 범위의 가운데(반투명 정렬용) */
  center: V3;
  edges: LineRec | null;
  wire: { vao: WebGLVertexArrayObject; count: number } | null;
  parts?: PartCache;
}

interface PointRec {
  lookM?: LookCache;
  src: PointSet3d;
  n: number;
  vao: WebGLVertexArrayObject;
  model?: ArrayLike<number>;
  parts?: PartCache;
}

interface ThinRec {
  vao: WebGLVertexArrayObject;
  buf: WebGLBuffer;
  count: number;
}

/** 잘린 면을 채울 단위(그물 하나 또는 같은 capGroup 그물들, 평면 하나) */
interface CapUnit {
  meshes: MeshRec[];
  /** 세계 범위(묶음이면 합친 것) */
  box: Box3;
  /** 채울 평면(세계) */
  plane: Plane4;
  /** 채운 면을 자를 다른 평면들(세계, 여러 단면일 때) */
  others: Plane4[];
  /** 채운 면 바탕색(첫 그물 색) */
  color: Rgba;
  group: boolean;
}

const DASH: [number, number] = [7, 5];
/** 단색 모드 기본 면 색 */
const MONO_COLOR: Rgba = [0.86, 0.87, 0.89, 1];
/** 잘린 면 다각형 꼭짓점 최대 수(평면 ∩ 상자는 6각형까지) */
const CAP_MAX_VERTS = 8;

export class Renderer3d {
  readonly gl: WebGL2RenderingContext;
  private mesh!: Prog;
  private wideP!: Prog;
  private thinP!: Prog;
  private pointP!: Prog;
  /** 단면 변종(처음 쓸 때 만든다) */
  private meshC: Prog | null = null;
  private thinC: Prog | null = null;
  /** 무늬 변종(처음 쓸 때 만든다): 보통·단면 */
  private meshT: Prog | null = null;
  private meshTC: Prog | null = null;
  /** 0.7.0 셰이더 변종(정의 이름 묶음 → 프로그램, 처음 쓸 때 만든다) */
  private variants = new Map<string, Prog>();
  private clipBuf = new Float32Array(MAX_SECTION_PLANES * 4);
  /** 외곽선: 깊이 그림(그물만)과 그 그리기 버퍼, 화면 전체 삼각형 프로그램 */
  private profTex: { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number } | null = null;
  /** 그물마다 외곽선 색을 쓸 때만(0.9.0): 외곽선 깊이 그림(profTex)과 함께 묶은 색 그림(RGBA8) */
  private profCol: { tex: WebGLTexture; fb: WebGLFramebuffer } | null = null;
  private profileP: Prog | null = null;
  private skyP: Prog | null = null;
  /** 해 그림자 깊이 그림과 그때의 빛 행렬(판이 같으면 다시 쓴다) */
  private shadowMap: { tex: WebGLTexture; fb: WebGLFramebuffer; size: number; version: number; vp: Float64Array } | null = null;
  /** 만들지 못한 그림자 깊이 그림 크기(같은 크기는 다시 시도하지 않는다) */
  private shadowFailed = 0;
  private m4c = new Float32Array(16);
  private emptyVao: WebGLVertexArrayObject | null = null;
  private quadWide!: WebGLBuffer;
  private quadPoint!: WebGLBuffer;
  private capBuf!: WebGLBuffer;
  private capVao!: WebGLVertexArrayObject;
  private stencilOk = false;
  private arrayBufs = new Map<ArrayBufferView, WebGLBuffer>();
  private elemBufs = new Map<ArrayBufferView, WebGLBuffer>();
  private vaos: WebGLVertexArrayObject[] = [];
  meshes: MeshRec[] = [];
  lines: (LineRec & { src: LineSet3d })[] = [];
  points: PointRec[] = [];
  private grid: { major: ThinRec | null; minor: ThinRec | null; axisX: ThinRec | null; axisY: ThinRec | null; model?: ArrayLike<number> } | null = null;
  private markers = new Map<MarkerKind, MeshRec>();
  /** 강조 선분(자주 바뀌므로 버퍼 캐시·VAO 목록 밖에서 따로 만들고 지운다) */
  private hiSeg: LineRec | null = null;
  /** 단면 테두리 선분(평면이 바뀔 때마다 바뀐다 — 강조 선분처럼 따로 둔다) */
  private cutSeg: LineRec | null = null;
  /** 앱 측정 덧그림 선(정점 색). 장면을 바꿔도 남는다(앱이 지운다) */
  private annoSeg: LineRec | null = null;
  stats: RenderStats = { drawCalls: 0, triangles: 0, segments: 0, points: 0 };
  /** 균일 변수용 임시 배열(그리기마다 새로 만들지 않는다) */
  private m4a = new Float32Array(16);
  private m4b = new Float32Array(16);
  private m3 = new Float32Array(9);
  private d4a = new Float64Array(16);
  private d4b = new Float64Array(16);
  private capData = new Float32Array(CAP_MAX_VERTS * 3);
  /** 나눠 올리는 중인 장면(setScene(scene, { incremental: true })) */
  private pending: { scene: Scene3d; mi: number; li: number; pi: number; chunk?: ChunkedUpload<WebGLBuffer> | null } | null = null;
  /** 장면의 무늬 그림(id → 원본) */
  private texSrc = new Map<string, Texture3d>();
  /** 그물이 쓰는 무늬(풀기·올리기 상태) */
  private textures = new Map<string, TexRec>();
  /** 무늬 판(장면·문맥이 바뀌면 늘려 늦게 끝난 풀기를 버린다) */
  private texGen = 0;
  private decoding = 0;
  private aniso: { ext: EXT_texture_filter_anisotropic; max: number } | null = null;
  /** 무늬 한 장 긴 변 한도(화소, GPU 한도와 작은 쪽)와 전체 예산(바이트) — 다음 장면부터 */
  textureLimit = TEXTURE_LIMIT;
  textureBudget = TEXTURE_BUDGET;
  /** 무늬를 올렸거나 풀지 못했을 때(다시 그리기용) */
  onTexture: (() => void) | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.init();
  }

  /** 프로그램과 공용 버퍼(문맥을 되찾은 뒤에도 부른다) */
  init(): void {
    const gl = this.gl;
    this.mesh = this.program(MESH_VS, MESH_FS);
    this.wideP = this.program(WIDE_VS, WIDE_FS);
    this.thinP = this.program(THIN_VS, THIN_FS);
    this.pointP = this.program(POINT_VS, POINT_FS);
    this.meshC = null;
    this.thinC = null;
    this.meshT = null;
    this.meshTC = null;
    this.variants.clear();
    this.profileP = null;
    this.skyP = null;
    const an = gl.getExtension('EXT_texture_filter_anisotropic');
    this.aniso = an ? { ext: an, max: Number(gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) || 1 } : null;
    this.quadWide = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadWide);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    this.quadPoint = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadPoint);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.capBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.capBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.capData.byteLength, gl.DYNAMIC_DRAW);
    this.capVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.capVao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);
    this.stencilOk = !!gl.getContextAttributes()?.stencil;
  }

  /** 문맥을 잃었을 때: GPU 객체는 이미 사라졌으므로 지우지 않고 잊는다 */
  forget(): void {
    this.arrayBufs.clear();
    this.elemBufs.clear();
    this.vaos = [];
    this.meshes = [];
    this.lines = [];
    this.points = [];
    this.grid = null;
    this.markers.clear();
    this.hiSeg = null;
    this.cutSeg = null;
    this.annoSeg = null;
    this.meshC = null;
    this.thinC = null;
    this.meshT = null;
    this.meshTC = null;
    this.variants.clear();
    this.profTex = null;
    this.profCol = null;
    this.profileP = null;
    this.skyP = null;
    this.shadowMap = null;
    this.emptyVao = null;
    this.pending = null;
    this.texGen++;
    this.textures.clear();
    this.texSrc.clear();
    this.decoding = 0;
  }

  private program(vs: string, fs: string): Prog {
    const gl = this.gl;
    const sh = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(`3D 셰이더 컴파일 실패: ${gl.getShaderInfoLog(s) ?? ''}`);
      return s;
    };
    const p = gl.createProgram()!;
    const a = sh(gl.VERTEX_SHADER, vs);
    const b = sh(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, a);
    gl.attachShader(p, b);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`3D 셰이더 연결 실패: ${gl.getProgramInfoLog(p) ?? ''}`);
    gl.deleteShader(a);
    gl.deleteShader(b);
    return { p, u: new Map() };
  }

  /** 잘린 면을 채울 수 있는지(스텐실 버퍼가 있는 문맥) */
  get canFillSection(): boolean {
    return this.stencilOk;
  }

  private meshClip(): Prog {
    return (this.meshC ??= { ...this.program(withClip(MESH_VS), withClip(MESH_FS)), clip1: true });
  }

  private thinClip(): Prog {
    return (this.thinC ??= this.program(withClip(THIN_VS), withClip(THIN_FS)));
  }

  /** 무늬 그물 프로그램(clip이면 단면 변종) */
  private meshTex(clip: boolean): Prog {
    if (clip) return (this.meshTC ??= { ...this.program(withDefines(MESH_VS, 'CLIP', 'TEX'), withDefines(MESH_FS, 'CLIP', 'TEX')), clip1: true, tex: true });
    return (this.meshT ??= { ...this.program(withDefines(MESH_VS, 'TEX'), withDefines(MESH_FS, 'TEX')), tex: true });
  }

  /** 안개 변종 선·점 프로그램에 안개 색·범위와 눈 깊이 행(시점·모형의 z 행)을 올린다 */
  private setLineFog(p: Prog, f: ViewFrame, model: ArrayLike<number> | undefined, fog: NonNullable<RenderState['fog']>): void {
    const gl = this.gl;
    const mv = model ? mat4Mul(f.view, model, this.d4b) : f.view;
    gl.uniform4f(this.loc(p, 'u_mvz'), mv[2]!, mv[6]!, mv[10]!, mv[14]!);
    gl.uniform4f(this.loc(p, 'u_fogCol'), fog.color[0], fog.color[1], fog.color[2], 1);
    gl.uniform2f(this.loc(p, 'u_fog'), fog.start, fog.end);
  }

  /** 해 그림자 깊이 그림(비교 표본 — sampler2DShadow) */
  private makeShadowMap(size: number): Renderer3d['shadowMap'] {
    const gl = this.gl;
    this.dropShadow();
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.bindTexture(gl.TEXTURE_2D, null);
    const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, prev);
    if (!ok) {
      gl.deleteFramebuffer(fb);
      gl.deleteTexture(tex);
      return null;
    }
    return (this.shadowMap = { tex, fb, size, version: -1, vp: new Float64Array(16) });
  }

  private dropShadow(): void {
    const m = this.shadowMap;
    if (!m) return;
    this.gl.deleteFramebuffer(m.fb);
    this.gl.deleteTexture(m.tex);
    this.shadowMap = null;
  }

  /** 해 쪽 평행 투영(범위를 감싸는 구에 맞춘다): 빛 시점·투영 행렬(double) */
  private lightViewProj(dir: V3, box: Box3): Float64Array {
    const b = boxIsEmpty(box) ? { min: [-1, -1, -1] as [number, number, number], max: [1, 1, 1] as [number, number, number] } : box;
    const sp = boxSphere(b);
    const R = Math.max(sp.radius, 1e-6);
    const back = normalize(dir);
    const ref: V3 = Math.abs(back[2]) < 0.99 ? [0, 0, 1] : [0, 1, 0];
    const right = normalize(cross(ref, back));
    const up = cross(back, right);
    const eye: V3 = [sp.center[0] + back[0] * R * 2, sp.center[1] + back[1] * R * 2, sp.center[2] + back[2] * R * 2];
    const view = viewMatrix(eye, { right, up, back });
    return mat4Mul(orthographic(-R, R, -R, R, R * 0.5, R * 3.5), view);
  }

  /** 그물 정점만 그리기(깊이 그림): 구간 목록이 있으면 그 구간만 */
  private drawMeshGeometry(r: MeshRec, list: DrawList | null): void {
    const gl = this.gl;
    if (list) {
      if (!list.total) return;
      if (list.compact) {
        gl.bindVertexArray(list.compact.vao);
        gl.drawElements(gl.TRIANGLES, list.compact.count, gl.UNSIGNED_INT, 0);
        return;
      }
      gl.bindVertexArray(r.vao);
      for (const run of list.runs) {
        if (r.indexed) gl.drawElements(gl.TRIANGLES, run.count * 3, gl.UNSIGNED_INT, run.start * 12);
        else gl.drawArrays(gl.TRIANGLES, run.start * 3, run.count * 3);
      }
      return;
    }
    gl.bindVertexArray(r.vao);
    if (r.indexed) gl.drawElements(gl.TRIANGLES, r.count, gl.UNSIGNED_INT, 0);
    else gl.drawArrays(gl.TRIANGLES, 0, r.count);
  }

  /** 하늘·땅 바탕을 화면 전체 삼각형으로(깊이는 쓰지 않는다) */
  private drawSky(f: ViewFrame, sky: NonNullable<RenderState['sky']>, devW: number, devH: number): void {
    const gl = this.gl;
    const p = (this.skyP ??= this.program(FULL_VS, SKY_FS));
    gl.useProgram(p.p);
    const b = f.basis;
    gl.uniform3f(this.loc(p, 'u_right'), b.right[0], b.right[1], b.right[2]);
    gl.uniform3f(this.loc(p, 'u_up'), b.up[0], b.up[1], b.up[2]);
    gl.uniform3f(this.loc(p, 'u_fwd'), -b.back[0], -b.back[1], -b.back[2]);
    const tanV = (f.pixelPerDepth * f.height) / 2;
    gl.uniform2f(this.loc(p, 'u_tan'), tanV * (f.width / f.height), tanV);
    gl.uniform2f(this.loc(p, 'u_shift'), f.shift?.[0] ?? 0, f.shift?.[1] ?? 0);
    const c = (n: string, v: Rgba): void => gl.uniform4f(this.loc(p, n), v[0], v[1], v[2], v[3]);
    c('u_sky', sky.sky);
    c('u_skyH', sky.skyHorizon);
    c('u_ground', sky.ground);
    c('u_groundH', sky.groundHorizon);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.depthMask(false);
    this.emptyVao ??= gl.createVertexArray();
    gl.bindVertexArray(this.emptyVao);
    gl.viewport(0, 0, devW, devH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);
  }

  /** 외곽선 깊이 그림 버퍼(크기가 바뀌면 다시 만든다). 만들지 못하면 null */
  private profileTarget(w: number, h: number): WebGLFramebuffer | null {
    const gl = this.gl;
    const t = this.profTex;
    if (t && t.w === w && t.h === h) return t.fb;
    this.dropProfile();
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, prev);
    if (!ok) {
      gl.deleteFramebuffer(fb);
      gl.deleteTexture(tex);
      return null;
    }
    this.emptyVao ??= gl.createVertexArray();
    this.profTex = { tex, fb, w, h };
    return fb;
  }

  /**
   * 그물마다 외곽선 색(0.9.0): 외곽선 깊이 그림과 같은 크기의 색 그림(RGBA8)을 깊이 그림과 함께 묶은 버퍼. 만들지 못하면 null.
   * 그물마다 다른 색을 쓸 때만 만든다(화면 크기 RGBA8 한 장 — 휴대폰 3배 화소면 10 MB 남짓)
   */
  private profileColorTarget(w: number, h: number): WebGLFramebuffer | null {
    const gl = this.gl;
    if (!this.profileTarget(w, h)) return null;
    if (this.profCol) return this.profCol.fb;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.profTex!.tex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, prev);
    if (!ok) {
      gl.deleteFramebuffer(fb);
      gl.deleteTexture(tex);
      return null;
    }
    this.profCol = { tex, fb };
    return fb;
  }

  private dropProfileColor(): void {
    const c = this.profCol;
    if (!c) return;
    this.gl.deleteFramebuffer(c.fb);
    this.gl.deleteTexture(c.tex);
    this.profCol = null;
  }

  private dropProfile(): void {
    this.dropProfileColor();
    const t = this.profTex;
    if (!t) return;
    this.gl.deleteFramebuffer(t.fb);
    this.gl.deleteTexture(t.tex);
    this.profTex = null;
  }

  /** 겉모습 행렬 m을 합친 모형 행렬(m · base, 캐시) */
  private lookModel(rec: { lookM?: LookCache }, m: ArrayLike<number>, base: ArrayLike<number> | undefined): LookCache {
    const c = rec.lookM;
    if (c && c.src === m && c.base === base) return c;
    return (rec.lookM = { src: m, base, model: base ? mat4Mul(m, base) : m });
  }

  /** 0.7.0 변종 프로그램(기본 원본 + #define 이름들). 같은 묶음은 한 번만 만든다. profile = 외곽선(0.7.2 ONE) */
  private variant(base: 'mesh' | 'wide' | 'thin' | 'point' | 'depth' | 'profile', defs: readonly string[]): Prog {
    const key = `${base}:${[...defs].sort().join(',')}`;
    let p = this.variants.get(key);
    if (p) return p;
    const [vs, fs] =
      base === 'mesh' ? [MESH_VS, MESH_FS] : base === 'wide' ? [WIDE_VS, WIDE_FS] : base === 'thin' ? [THIN_VS, THIN_FS] : base === 'depth' ? [DEPTH_VS, DEPTH_FS] : base === 'profile' ? [FULL_VS, PROFILE_FS] : [POINT_VS, POINT_FS];
    p = {
      ...this.program(withDefines(vs, ...defs), withDefines(fs, ...defs)),
      clip1: defs.includes('CLIP'),
      clipN: defs.includes('CLIPN'),
      tex: defs.includes('TEX'),
      sun: defs.includes('SUN'),
      shadow: defs.includes('SHADOW'),
      fog: defs.includes('FOG'),
      back: defs.includes('BACK'),
      backTex: defs.includes('BACKTEX'),
    };
    this.variants.set(key, p);
    return p;
  }

  /** 여러 단면 평면(로컬)을 지금 프로그램에 올린다(u_clips·u_nclip) */
  private setClips(p: Prog, planes: readonly Readonly<Plane4>[]): void {
    const n = Math.min(planes.length, MAX_SECTION_PLANES);
    const b = this.clipBuf;
    b.fill(0);
    for (let i = 0; i < n; i++) b.set(planes[i]!, i * 4);
    this.gl.uniform4fv(this.loc(p, 'u_clips'), b);
    this.gl.uniform1i(this.loc(p, 'u_nclip'), n);
  }

  private loc(pr: Prog, name: string): WebGLUniformLocation | null {
    let l = pr.u.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(pr.p, name);
      pr.u.set(name, l);
    }
    return l;
  }

  private arrayBuf(data: Float32Array): WebGLBuffer {
    let b = this.arrayBufs.get(data);
    if (b) return b;
    const gl = this.gl;
    b = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.arrayBufs.set(data, b);
    return b;
  }

  private elemBuf(data: Uint32Array): WebGLBuffer {
    let b = this.elemBufs.get(data);
    if (b) return b;
    const gl = this.gl;
    b = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.elemBufs.set(data, b);
    return b;
  }

  private vao(): WebGLVertexArrayObject {
    const v = this.gl.createVertexArray()!;
    this.vaos.push(v);
    this.gl.bindVertexArray(v);
    return v;
  }

  /**
   * 장면 올리기(이전 것은 지운다). incremental이면 여기서는 비우기만 하고, uploadSome()을 부를 때마다 묶음을 몇 개씩 올린다
   * (올라간 묶음부터 그린다 — 큰 모형에서 화면이 멈추지 않게).
   */
  setScene(scene: Scene3d, opts: { incremental?: boolean } = {}): void {
    this.clear(true);
    this.syncTextures(scene);
    if (opts.incremental) {
      this.pending = { scene, mi: 0, li: 0, pi: 0 };
      return;
    }
    for (const m of scene.meshes) this.meshes.push(this.meshRec(m));
    for (const l of scene.lines) this.lines.push(this.sceneLineRec(l));
    for (const p of scene.points ?? []) this.points.push(this.pointRec(p));
    this.gl.bindVertexArray(null);
  }

  /** 나눠 올리는 중인지 */
  get uploading(): boolean {
    return !!this.pending;
  }

  /** 나눠 올리기 진행: 올린 묶음 수 / 전체 묶음 수(올리는 중이 아니면 null) */
  get uploadProgress(): { done: number; total: number } | null {
    const p = this.pending;
    if (!p) return null;
    const s = p.scene;
    return { done: p.mi + p.li + p.pi, total: s.meshes.length + s.lines.length + (s.points?.length ?? 0) };
  }

  /**
   * 나눠 올리기를 budgetMs 동안 이어 간다(적어도 한 걸음). 그물 → 선분 → 점 차례. 다 올렸으면 true.
   * 0.9.0: 묶음 하나가 새로 올릴 배열이 CHUNK_MIN_BYTES를 넘으면 버퍼를 CHUNK_BYTES 조각으로 여러 걸음(프레임)에 나눠 채우고,
   * 다 채운 뒤 그 묶음을 그리기 목록에 넣는다(0.8.0은 묶음을 통째로 올려 아주 큰 배열 하나가 한 프레임에 걸렸다)
   */
  uploadSome(budgetMs: number): boolean {
    const p = this.pending;
    if (!p) return true;
    const s = p.scene;
    const pts = s.points ?? [];
    const t0 = performance.now();
    let first = true;
    this.gl.bindVertexArray(null);
    while (first || performance.now() - t0 < budgetMs) {
      first = false;
      const kind = p.mi < s.meshes.length ? 'mesh' : p.li < s.lines.length ? 'line' : p.pi < pts.length ? 'point' : null;
      if (!kind) break;
      const item = kind === 'mesh' ? s.meshes[p.mi]! : kind === 'line' ? s.lines[p.li]! : pts[p.pi]!;
      // 큰 묶음: 버퍼를 잡고 조각 하나씩 채운다(다 채울 때까지 그 묶음 기록은 만들지 않는다)
      if (p.chunk === undefined) {
        const arrays = newArrays(this.uploadArrays(kind, item), (d) => (d instanceof Uint32Array ? this.elemBufs.has(d) : this.arrayBufs.has(d as Float32Array)));
        const bytes = arrays.reduce((n, a) => n + a.data.byteLength, 0);
        p.chunk = bytes > CHUNK_MIN_BYTES ? new ChunkedUpload(arrays, this.bufferSink(), (d, t, b) => (t === 'element' ? this.elemBufs.set(d as Uint32Array, b) : this.arrayBufs.set(d as Float32Array, b)), CHUNK_BYTES) : null;
      }
      // 버퍼 잡기(크기만큼 0 채우기)는 이번 걸음 몫을 이미 썼으면 다음 프레임 처음으로 미룬다
      if (p.chunk && p.chunk.nextIsAlloc && performance.now() - t0 > budgetMs / 2 && budgetMs !== Infinity) break;
      if (p.chunk && !p.chunk.step()) continue;
      p.chunk = undefined;
      if (kind === 'mesh') this.meshes.push(this.meshRec(s.meshes[p.mi++]!));
      else if (kind === 'line') this.lines.push(this.sceneLineRec(s.lines[p.li++]!));
      else this.points.push(this.pointRec(pts[p.pi++]!));
      this.gl.bindVertexArray(null);
    }
    this.gl.bindVertexArray(null);
    if (p.mi >= s.meshes.length && p.li >= s.lines.length && p.pi >= pts.length) this.pending = null;
    return !this.pending;
  }

  /**
   * 묶음 하나가 GPU에 올리는 배열(meshRec·lineRec·pointRec가 arrayBuf·elemBuf로 올리는 것과 같은 조건 — 나눠 올리기에서 미리 채운다)
   */
  private uploadArrays(kind: 'mesh' | 'line' | 'point', item: Mesh3d | LineSet3d | PointSet3d): ({ data: UploadArray; target: BufferTarget } | null)[] {
    const A = (data: Float32Array | undefined | false | null): { data: UploadArray; target: BufferTarget } | null => (data ? { data, target: 'array' } : null);
    if (kind === 'point') return [A(item.positions)];
    if (kind === 'line') {
      const l = item as LineSet3d;
      const n = Math.floor(l.positions.length / 6);
      return [A(l.positions), A(l.colors && l.colors.length >= n * 8 && l.colors)];
    }
    const m = item as Mesh3d;
    const nv = Math.floor(m.positions.length / 3);
    const buvs = m.backTexture ? (m.backUvs ?? m.uvs) : undefined;
    return [
      A(m.positions),
      A(!!m.normals && m.normals.length >= nv * 3 && m.normals),
      A(!!m.colors && m.colors.length >= nv * 4 && m.colors),
      A(!!uvComponents(m) && !!m.texture && m.uvs),
      A(!!buvs && !!uvComponents(m, buvs) && buvs),
      m.indices ? { data: m.indices, target: 'element' } : null,
      A(hasMeshEdges(m) && m.edges),
    ];
  }

  /** WebGL2 버퍼 만들기·채우기(나눠 올리기). 그물 VAO를 건드리지 않게 묶인 VAO는 비운 채로 부른다 */
  private bufferSink(): BufferSink<WebGLBuffer> {
    const gl = this.gl;
    const T = (t: BufferTarget): number => (t === 'element' ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER);
    return {
      alloc: (t, bytes) => {
        const b = gl.createBuffer()!;
        gl.bindBuffer(T(t), b);
        gl.bufferData(T(t), bytes, gl.STATIC_DRAW);
        return b;
      },
      write: (b, t, off, src, srcOffset, length) => {
        gl.bindBuffer(T(t), b);
        gl.bufferSubData(T(t), off, src, srcOffset, length);
      },
    };
  }

  private sceneLineRec(l: LineSet3d): LineRec & { src: LineSet3d } {
    const r = this.lineRec(l.id, l.group, l.positions, l.colors);
    if (hasOrigin(l.origin)) r.model = translation(l.origin);
    return { ...r, src: l };
  }

  /** 지금 묶인 VAO에 그물 정점 속성(위치·법선·색·무늬 좌표)을 건다 */
  private bindMeshAttribs(m: Mesh3d): { hasNormals: boolean; hasColors: boolean } {
    const gl = this.gl;
    const nv = Math.floor(m.positions.length / 3);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.arrayBuf(m.positions));
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    const hasNormals = !!m.normals && m.normals.length >= nv * 3;
    if (hasNormals) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.arrayBuf(m.normals!));
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 12, 0);
    }
    const hasColors = !!m.colors && m.colors.length >= nv * 4;
    if (hasColors) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.arrayBuf(m.colors!));
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 16, 0);
    }
    const uv = uvComponents(m);
    if (uv && m.texture) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.arrayBuf(m.uvs!));
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, uv, gl.FLOAT, false, uv * 4, 0);
    }
    // 뒷면 무늬 좌표(backUvs, 없으면 uvs)
    const buvs = m.backTexture ? (m.backUvs ?? m.uvs) : undefined;
    const buv = buvs ? uvComponents(m, buvs) : 0;
    if (buv) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.arrayBuf(buvs!));
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, buv, gl.FLOAT, false, buv * 4, 0);
    }
    return { hasNormals, hasColors };
  }

  private meshRec(m: Mesh3d): MeshRec {
    const gl = this.gl;
    const nv = Math.floor(m.positions.length / 3);
    const vao = this.vao();
    const { hasNormals, hasColors } = this.bindMeshAttribs(m);
    let count: number;
    const indexed = !!m.indices;
    if (m.indices) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.elemBuf(m.indices));
      count = m.indices.length - (m.indices.length % 3);
    } else count = nv - (nv % 3);
    gl.bindVertexArray(null);
    const uv = m.texture && this.texSrc.has(m.texture) ? uvComponents(m) : 0;
    const texAlpha = uv > 0 && this.texSrc.get(m.texture!)!.alpha === true;
    let transparent = m.color[3] < 0.999 || texAlpha;
    if (hasColors && !transparent) {
      // 정점 색에 반투명이 있으면 투명 차례에 그린다(앞 몇천 개만 본다)
      const c = m.colors!;
      for (let i = 3, e = Math.min(c.length, 4 * 4096); i < e; i += 4)
        if (c[i]! < 0.999) {
          transparent = true;
          break;
        }
    }
    const edges = hasMeshEdges(m) ? this.lineRec(m.id, m.group, m.edges!, undefined) : null;
    const box = meshBounds(m);
    // 뒷면 색·무늬(없으면 null — 예전 그대로)
    const buv = m.backTexture && this.texSrc.has(m.backTexture) ? uvComponents(m, m.backUvs ?? m.uvs) : 0;
    const bcol = m.backColor && m.backColor.length >= 3 ? m.backColor : null;
    const back = bcol || buv ? { color: bcol, tex: buv ? m.backTexture! : null, uv: buv, texAlpha: buv > 0 && this.texSrc.get(m.backTexture!)!.alpha === true } : null;
    if (back?.texAlpha) transparent = true;
    return {
      back,
      src: m,
      vao,
      count,
      indexed,
      hasNormals,
      hasColors,
      uv,
      tex: uv ? m.texture! : null,
      texAlpha,
      transparent,
      model: modelMatrix(m.matrix, m.origin),
      box,
      center: boxCenter(box),
      edges,
      wire: null,
    };
  }

  private lineRec(id: string, group: string | undefined, positions: Float32Array, colors: Float32Array | undefined): LineRec {
    const gl = this.gl;
    const n = Math.floor(positions.length / 6);
    const pos = this.arrayBuf(positions);
    const col = colors && colors.length >= n * 8 ? this.arrayBuf(colors) : null;
    const wide = this.vao();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadWide);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    this.bindWide(pos, col, 0);
    const thin = this.vao();
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    if (col) {
      gl.bindBuffer(gl.ARRAY_BUFFER, col);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 16, 0);
    }
    gl.bindVertexArray(null);
    return { id, group, n, pos, col, wide, thin };
  }

  /** 굵은 선 VAO(이미 묶여 있어야 함)의 인스턴스 속성을 first번째 선분부터로 건다 */
  private bindWide(pos: WebGLBuffer, col: WebGLBuffer | null, first: number): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, first * 24);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 24, first * 24 + 12);
    gl.vertexAttribDivisor(2, 1);
    if (col) {
      gl.bindBuffer(gl.ARRAY_BUFFER, col);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, first * 32);
      gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, first * 32 + 16);
      gl.vertexAttribDivisor(4, 1);
    }
  }

  private pointRec(p: PointSet3d): PointRec {
    const gl = this.gl;
    const n = Math.floor(p.positions.length / 3);
    const vao = this.vao();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadPoint);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.arrayBuf(p.positions));
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 12, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
    return { src: p, n, vao, model: hasOrigin(p.origin) ? translation(p.origin) : undefined };
  }

  private thinRec(data: Float32Array): ThinRec | null {
    if (data.length < 6) return null;
    const gl = this.gl;
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const vao = this.vao();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);
    return { vao, buf, count: Math.floor(data.length / 3) };
  }

  private deleteThin(r: ThinRec | null): void {
    if (!r) return;
    this.gl.deleteBuffer(r.buf);
    this.gl.deleteVertexArray(r.vao);
    this.vaos = this.vaos.filter((v) => v !== r.vao);
  }

  /**
   * 따로 두는 선분(강조·단면 테두리·구간 모음): 버퍼와 VAO를 새로 만든다(버퍼 캐시·VAO 목록 밖 — 지우는 쪽이 지운다).
   * origin이 있으면 positions는 그 점 기준. colors(정점마다 rgba)는 선택
   */
  private dynLines(id: string, positions: Float32Array | null, origin?: readonly number[] | null, colors?: Float32Array | null): LineRec | null {
    const gl = this.gl;
    const n = positions ? Math.floor(positions.length / 6) : 0;
    if (!positions || !n) return null;
    const pos = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.bufferData(gl.ARRAY_BUFFER, positions.subarray(0, n * 6), gl.DYNAMIC_DRAW);
    let col: WebGLBuffer | null = null;
    if (colors && colors.length >= n * 8) {
      col = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, col);
      gl.bufferData(gl.ARRAY_BUFFER, colors.subarray(0, n * 8), gl.STATIC_DRAW);
    }
    const wide = gl.createVertexArray()!;
    gl.bindVertexArray(wide);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadWide);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    this.bindWide(pos, col, 0);
    const thin = gl.createVertexArray()!;
    gl.bindVertexArray(thin);
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    if (col) {
      gl.bindBuffer(gl.ARRAY_BUFFER, col);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 16, 0);
    }
    gl.bindVertexArray(null);
    return { id, group: undefined, n, pos, col, wide, thin, model: hasOrigin(origin) ? translation(origin) : undefined };
  }

  private deleteDyn(r: LineRec | null): void {
    if (!r) return;
    const gl = this.gl;
    gl.deleteBuffer(r.pos);
    if (r.col) gl.deleteBuffer(r.col);
    gl.deleteVertexArray(r.wide);
    gl.deleteVertexArray(r.thin);
  }

  /** 강조 선분 바꾸기(선분 쌍 xyz,xyz…, null이면 없음). origin이 있으면 그 점 기준 좌표. 이전 버퍼는 지운다 */
  setHighlightSegments(positions: Float32Array | null, origin?: readonly number[] | null): void {
    this.deleteDyn(this.hiSeg);
    this.hiSeg = this.dynLines('__hiseg', positions, origin);
  }

  /** 단면 테두리 선분 바꾸기(선분 쌍, origin 기준 좌표, null이면 없음) */
  setSectionLines(positions: Float32Array | null, origin?: readonly number[] | null): void {
    this.deleteDyn(this.cutSeg);
    this.cutSeg = this.dynLines('__cut', positions, origin);
  }

  /** 앱 측정 덧그림 선 바꾸기(선분 쌍, origin 기준 좌표, 정점마다 rgba 색, null이면 없음) */
  setAnnotationLines(positions: Float32Array | null, colors: Float32Array | null, origin?: readonly number[] | null): void {
    this.deleteDyn(this.annoSeg);
    this.annoSeg = this.dynLines('__anno', positions, origin, colors);
  }

  /** 격자 선분 바꾸기(null이면 없음). origin이 있으면 선분은 그 점 기준 좌표(gridLines(g, origin)) */
  setGrid(g: GridLines | null, origin?: readonly number[] | null): void {
    if (this.grid) {
      this.deleteThin(this.grid.major);
      this.deleteThin(this.grid.minor);
      this.deleteThin(this.grid.axisX);
      this.deleteThin(this.grid.axisY);
    }
    this.grid = g
      ? { major: this.thinRec(g.major), minor: this.thinRec(g.minor), axisX: this.thinRec(g.axisX), axisY: this.thinRec(g.axisY), model: hasOrigin(origin) ? translation(origin) : undefined }
      : null;
  }

  /** 장면 GPU 자료 지우기(격자·표시 그물은 남긴다). keepTextures면 무늬는 남긴다(setScene이 새 장면과 맞춘다) */
  clear(keepTextures = false): void {
    const gl = this.gl;
    this.pending = null;
    if (!keepTextures) this.dropTextures();
    for (const r of this.meshes) {
      this.dropParts(r);
      if (r.edges) this.dropParts(r.edges);
    }
    for (const r of this.lines) this.dropParts(r);
    for (const r of this.points) this.dropParts(r);
    const keep = new Set<WebGLVertexArrayObject>();
    if (this.grid) for (const r of [this.grid.major, this.grid.minor, this.grid.axisX, this.grid.axisY]) if (r) keep.add(r.vao);
    const markerBufs = new Set<WebGLBuffer>();
    for (const m of this.markers.values()) {
      keep.add(m.vao);
      if (m.src.normals) markerBufs.add(this.arrayBufs.get(m.src.normals)!);
      markerBufs.add(this.arrayBufs.get(m.src.positions)!);
    }
    for (const v of this.vaos) if (!keep.has(v)) gl.deleteVertexArray(v);
    this.vaos = this.vaos.filter((v) => keep.has(v));
    for (const [k, b] of this.arrayBufs)
      if (!markerBufs.has(b)) {
        gl.deleteBuffer(b);
        this.arrayBufs.delete(k);
      }
    for (const b of this.elemBufs.values()) gl.deleteBuffer(b);
    this.elemBufs.clear();
    this.meshes = [];
    this.lines = [];
    this.points = [];
    this.setHighlightSegments(null);
    this.setSectionLines(null);
  }

  dispose(): void {
    this.clear();
    this.setGrid(null);
    this.setAnnotationLines(null, null);
    const gl = this.gl;
    for (const v of this.vaos) gl.deleteVertexArray(v);
    for (const b of this.arrayBufs.values()) gl.deleteBuffer(b);
    this.vaos = [];
    this.arrayBufs.clear();
    this.markers.clear();
    gl.deleteBuffer(this.quadWide);
    gl.deleteBuffer(this.quadPoint);
    gl.deleteBuffer(this.capBuf);
    gl.deleteVertexArray(this.capVao);
    for (const p of [this.mesh, this.wideP, this.thinP, this.pointP, this.meshC, this.thinC, this.meshT, this.meshTC, this.profileP, this.skyP, ...this.variants.values()]) if (p) gl.deleteProgram(p.p);
    this.variants.clear();
    this.profileP = null;
    this.dropProfile();
    this.dropShadow();
    if (this.emptyVao) gl.deleteVertexArray(this.emptyVao);
    this.emptyVao = null;
    this.meshC = null;
    this.thinC = null;
    this.meshT = null;
    this.meshTC = null;
  }

  /** 삼각형 선 그리기(윤곽선 없는 그물의 와이어프레임) */
  private wireOf(r: MeshRec): { vao: WebGLVertexArrayObject; count: number } {
    if (r.wire) return r.wire;
    const gl = this.gl;
    const m = r.src;
    const tris = r.count / 3;
    const idx = new Uint32Array(tris * 6);
    const I = m.indices;
    // 삼각형마다 작은 배열을 만들지 않고 바로 채운다(삼각형 수백만 개에서 쓰레기 수집이 길어지지 않게)
    for (let t = 0, o = 0; t < tris; t++, o += 6) {
      const a = I ? I[t * 3]! : t * 3;
      const b = I ? I[t * 3 + 1]! : t * 3 + 1;
      const c = I ? I[t * 3 + 2]! : t * 3 + 2;
      idx[o] = a;
      idx[o + 1] = b;
      idx[o + 2] = b;
      idx[o + 3] = c;
      idx[o + 4] = c;
      idx[o + 5] = a;
    }
    const vao = this.vao();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.arrayBuf(m.positions));
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.elemBuf(idx));
    gl.bindVertexArray(null);
    r.wire = { vao, count: idx.length };
    return r.wire;
  }

  private markerRec(kind: MarkerKind): MeshRec {
    let r = this.markers.get(kind);
    if (r) return r;
    const g = markerMesh(kind);
    r = this.meshRec({ id: `__marker_${kind}`, positions: g.positions, normals: g.normals, color: [1, 1, 1, 1] });
    this.markers.set(kind, r);
    return r;
  }

  // ───────────── 무늬 ─────────────

  /**
   * 새 장면의 무늬: 그물이 쓰는 것만 남긴다. 같은 id·같은 원본 객체로 이미 올린(또는 푸는 중인) 것은 그대로 두고,
   * 나머지는 지운 뒤 한 장 한도·전체 예산으로 긴 변을 정해 차례로 푼다.
   */
  private syncTextures(scene: Scene3d): void {
    const gl = this.gl;
    this.texSrc.clear();
    for (const t of scene.textures ?? []) if (t && typeof t.id === 'string' && !this.texSrc.has(t.id)) this.texSrc.set(t.id, t);
    const used = new Map<string, Texture3d>();
    for (const m of scene.meshes) {
      const t = m.texture !== undefined ? this.texSrc.get(m.texture) : undefined;
      if (t && uvComponents(m)) used.set(t.id, t);
      const bt = m.backTexture !== undefined ? this.texSrc.get(m.backTexture) : undefined;
      if (bt && uvComponents(m, m.backUvs ?? m.uvs)) used.set(bt.id, bt);
    }
    let dropped = false;
    for (const [id, rec] of this.textures)
      if (used.get(id) !== rec.src || rec.state === 'failed') {
        if (rec.tex) gl.deleteTexture(rec.tex);
        this.textures.delete(id);
        dropped = true;
      }
    // 푸는 중이던 것을 버렸으면 판을 바꿔 늦게 끝난 결과를 버린다(남은 것은 다시 줄 세운다)
    if (dropped) {
      this.texGen++;
      this.decoding = 0;
      for (const rec of this.textures.values()) if (rec.state === 'decoding') rec.state = 'queued';
    }
    const fresh = [...used.values()].filter((t) => !this.textures.has(t.id));
    if (!fresh.length && !dropped) return;
    const maxSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096;
    const sides = textureSides([...used.values()], Math.max(1, Math.min(maxSize, this.textureLimit)), this.textureBudget);
    for (const t of fresh) this.textures.set(t.id, { src: t, side: sides.get(t.id) ?? TEXTURE_LIMIT, tex: null, state: 'queued', bytes: 0 });
    this.pumpTextures();
  }

  /** 줄 선 무늬를 TEXTURE_DECODES장까지 풀기 시작한다 */
  private pumpTextures(): void {
    if (this.decoding >= TEXTURE_DECODES) return;
    const gen = this.texGen;
    for (const rec of this.textures.values()) {
      if (this.decoding >= TEXTURE_DECODES) break;
      if (rec.state !== 'queued') continue;
      rec.state = 'decoding';
      this.decoding++;
      decodeTexture(rec.src, rec.side).then(
        (bmp) => {
          if (gen !== this.texGen || this.textures.get(rec.src.id) !== rec || this.gl.isContextLost()) {
            bmp.close();
            return;
          }
          try {
            this.uploadTexture(rec, bmp);
            rec.state = 'ready';
          } catch {
            rec.state = 'failed';
          } finally {
            bmp.close();
          }
          this.decoding--;
          this.pumpTextures();
          this.onTexture?.();
        },
        () => {
          if (gen !== this.texGen || this.textures.get(rec.src.id) !== rec) return;
          rec.state = 'failed';
          this.decoding--;
          this.pumpTextures();
          this.onTexture?.();
        },
      );
    }
  }

  private uploadTexture(rec: TexRec, bmp: ImageBitmap): void {
    const gl = this.gl;
    const t = gl.createTexture();
    if (!t) throw new Error('무늬를 만들지 못했습니다');
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, this.aniso.max));
    gl.bindTexture(gl.TEXTURE_2D, null);
    rec.tex = t;
    rec.bytes = Math.round(bmp.width * bmp.height * 4 * (4 / 3));
  }

  /** 지운다: 올린 무늬 모두 */
  private dropTextures(): void {
    for (const rec of this.textures.values()) if (rec.tex) this.gl.deleteTexture(rec.tex);
    this.textures.clear();
    this.texSrc.clear();
    this.texGen++;
    this.decoding = 0;
  }

  /** 장면 무늬 상태 */
  get textureStats(): TextureStats {
    const s: TextureStats = { count: this.textures.size, ready: 0, failed: 0, bytes: 0 };
    for (const r of this.textures.values()) {
      if (r.state === 'ready') {
        s.ready++;
        s.bytes += r.bytes;
      } else if (r.state === 'failed') s.failed++;
    }
    return s;
  }

  /** 그물의 올린 뒷면 무늬(없거나 아직이면 null) */
  private backTexOf(r: MeshRec): WebGLTexture | null {
    if (!r.back?.tex) return null;
    const t = this.textures.get(r.back.tex);
    return t && t.state === 'ready' ? t.tex : null;
  }

  /** 그물의 올린 무늬(없거나 아직이면 null) */
  private texOf(r: MeshRec): WebGLTexture | null {
    if (!r.tex) return null;
    const t = this.textures.get(r.tex);
    return t && t.state === 'ready' ? t.tex : null;
  }

  // ───────────── 묶음 안 구간(숨김·강조) ─────────────

  /** 구간 캐시를 지운다(GPU 자료 포함) */
  private dropParts(rec: { parts?: PartCache }): void {
    const c = rec.parts;
    if (!c) return;
    const gl = this.gl;
    for (const v of c.vaos) gl.deleteVertexArray(v);
    for (const b of c.bufs) gl.deleteBuffer(b);
    rec.parts = undefined;
  }

  /** 이 판의 구간 캐시(판이 바뀌었으면 옛 자료를 지우고 새로) */
  private partCache(rec: { parts?: PartCache }, ver: number): PartCache {
    const c = rec.parts;
    if (c && c.ver === ver) return c;
    if (c) this.dropParts(rec);
    return (rec.parts = { ver, vaos: [], bufs: [], lists: new Map() });
  }

  /** 그물의 한 종류 구간(삼각형 번호). wire면 와이어프레임용(삼각형마다 변 셋) */
  private meshList(r: MeshRec, c: PartCache, parts: readonly RangePart[], hi: boolean, wire: boolean): DrawList {
    const key = `${wire ? 'w' : 'f'}${hi ? 'h' : 'n'}`;
    let l = c.lists.get(key);
    if (l) return l;
    const runs = partsOf(parts, hi);
    const total = rangesTotal(runs);
    let compact: DrawList['compact'] = null;
    if (runs.length > RUN_LIMIT && total > 0) {
      const gl = this.gl;
      const idx = compactTriIndices(r.src.indices, runs, wire);
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      if (wire) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.arrayBuf(r.src.positions));
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
      } else this.bindMeshAttribs(r.src);
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      c.vaos.push(vao);
      c.bufs.push(buf);
      compact = { vao, count: idx.length };
    }
    l = { runs, total, compact };
    c.lists.set(key, l);
    return l;
  }

  /** 선분 묶음(또는 그물 윤곽선)의 한 종류 구간(선분 번호). 구간이 많으면 위치·색을 모은 복사본을 만든다 */
  private lineList(rec: LineRec, c: PartCache, parts: readonly RangePart[], hi: boolean, positions: Float32Array, colors: Float32Array | undefined): DrawList {
    const key = hi ? 'h' : 'n';
    let l = c.lists.get(key);
    if (l) return l;
    const runs = partsOf(parts, hi);
    const total = rangesTotal(runs);
    let compact: DrawList['compact'] = null;
    if (runs.length > RUN_LIMIT && total > 0) {
      const cr = this.dynLines(`${rec.id}__part`, compactStride(positions, runs, 6), null, rec.col && colors ? compactStride(colors, runs, 8) : null);
      if (cr) {
        c.vaos.push(cr.wide, cr.thin);
        c.bufs.push(cr.pos);
        if (cr.col) c.bufs.push(cr.col);
        compact = { vao: cr.wide, count: total, rec: cr };
      }
    }
    l = { runs, total, compact };
    c.lists.set(key, l);
    return l;
  }

  /** 점 묶음의 한 종류 구간(점 번호): 늘 모은 복사본으로 그린다(점 묶음은 대개 작다) */
  private pointList(r: PointRec, c: PartCache, parts: readonly RangePart[], hi: boolean): DrawList {
    const key = hi ? 'h' : 'n';
    let l = c.lists.get(key);
    if (l) return l;
    const runs = partsOf(parts, hi);
    const total = rangesTotal(runs);
    let compact: DrawList['compact'] = null;
    if (total > 0) {
      const gl = this.gl;
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, compactStride(r.src.positions, runs, 3), gl.STATIC_DRAW);
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadPoint);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 12, 0);
      gl.vertexAttribDivisor(1, 1);
      gl.bindVertexArray(null);
      c.vaos.push(vao);
      c.bufs.push(buf);
      compact = { vao, count: total };
    }
    l = { runs, total, compact };
    c.lists.set(key, l);
    return l;
  }

  /**
   * 선분 구간 그리기: 원래 번호 [lo, hi) 창 안의 구간만(그리기 범위·흐린 나머지와 함께 쓰려고).
   * 모은 자료가 있으면 창을 모은 번호로 바꿔 한 번에 그린다.
   */
  private drawLineList(
    f: ViewFrame,
    r: LineRec,
    model: ArrayLike<number> | undefined,
    list: DrawList,
    lo: number,
    hi: number,
    o: { color: Rgba; vcol: boolean; width: number; dashed: boolean; alpha: number; bias?: number; clip?: Plane4 | null; clips?: Plane4[] | null; noFog?: boolean; capz?: boolean },
    st: RenderState,
    stats: RenderStats,
  ): void {
    if (!list.total || hi <= lo) return;
    if (list.compact?.rec) {
      const k0 = countBelow(list.runs, lo), k1 = countBelow(list.runs, hi);
      if (k1 > k0) this.drawLines(f, list.compact.rec, model, { ...o, first: k0, count: k1 - k0 }, st, stats);
      return;
    }
    for (const run of clipRanges(list.runs, lo, hi)) this.drawLines(f, r, model, { ...o, first: run.start, count: run.count }, st, stats);
  }

  /** 세계 상자의 화면 사각형(장치 화소, 가장자리 여유 포함). 화면 밖이면 null, 눈 뒤에 걸치면 화면 전체 */
  private screenRect(f: ViewFrame, b: Box3, devW: number, devH: number): { x: number; y: number; w: number; h: number } | null {
    const m = f.viewProj;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const x = i & 1 ? b.max[0] : b.min[0], y = i & 2 ? b.max[1] : b.min[1], z = i & 4 ? b.max[2] : b.min[2];
      const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
      if (!(w > 1e-12)) return { x: 0, y: 0, w: devW, h: devH };
      const nx = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w;
      const ny = (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w;
      x0 = Math.min(x0, nx);
      x1 = Math.max(x1, nx);
      y0 = Math.min(y0, ny);
      y1 = Math.max(y1, ny);
    }
    if (x1 < -1 || y1 < -1 || x0 > 1 || y0 > 1) return null;
    const px0 = Math.max(0, Math.floor(((Math.max(-1, x0) + 1) / 2) * devW) - 2);
    const py0 = Math.max(0, Math.floor(((Math.max(-1, y0) + 1) / 2) * devH) - 2);
    const px1 = Math.min(devW, Math.ceil(((Math.min(1, x1) + 1) / 2) * devW) + 2);
    const py1 = Math.min(devH, Math.ceil(((Math.min(1, y1) + 1) / 2) * devH) + 2);
    if (px1 <= px0 || py1 <= py0) return null;
    return { x: px0, y: py0, w: px1 - px0, h: py1 - py0 };
  }

  /** 한 프레임 그리기. f는 카메라 행렬, devW·devH는 장치 화소 크기 */
  render(f: ViewFrame, devW: number, devH: number, st: RenderState): void {
    const gl = this.gl;
    const stats: RenderStats = { drawCalls: 0, triangles: 0, segments: 0, points: 0 };
    this.stats = stats;
    const multi = st.sections ?? null;
    const sec = multi ? null : (st.section ?? null);
    const capsOn =
      (multi ? multi.planes.some((q) => q.caps !== 'none') : !!sec && sec.caps !== 'none') &&
      this.stencilOk &&
      (st.mode === 'shaded' || st.mode === 'shadedEdges' || st.mode === 'hiddenLine' || st.mode === 'monochrome' || st.mode === 'noTexture');
    gl.viewport(0, 0, devW, devH);
    const bg = st.colors.background;
    if (st.transparent) gl.clearColor(0, 0, 0, 0);
    else gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clearDepth(1);
    gl.depthMask(true);
    gl.colorMask(true, true, true, true);
    if (capsOn) {
      gl.clearStencil(0);
      gl.stencilMask(0xff);
    }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | (capsOn ? gl.STENCIL_BUFFER_BIT : 0));
    if (st.sky && !st.transparent) this.drawSky(f, st.sky, devW, devH);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    if (st.transparent) gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const vpF = new Float32Array(f.viewProj);
    const ortho = f.projection === 'orthographic' ? 1 : 0;
    const vis = (id: string, g: string | undefined): boolean => st.visible(id, g);
    const hiTint = st.colors.highlight;
    const mode = st.mode;
    // 0.7.0 모드: 숨은 선(바탕색 면 + 윤곽선)·단색·무늬 없음. 예전 모드에서는 모두 꺼진다
    const flat = mode === 'hiddenLine';
    const noTex = flat || mode === 'monochrome' || mode === 'noTexture';
    const mono: Rgba | null = mode === 'monochrome' ? (st.colors.monochrome ?? MONO_COLOR) : null;
    const shadedLike = isShadedLike(mode);
    /** 그물 셰이더에 더 넣을 정의 */
    const meshExtra: string[] = flat ? ['FLAT'] : [];
    const light = st.light ?? null;
    const fog = st.fog ?? null;
    if (light) meshExtra.push('SUN');
    if (fog) meshExtra.push('FOG');
    // 그림자는 깊이 그림을 그린 뒤에 SHADOW를 더한다(아래 1a)
    let shadowOn = false;
    /** 묶음 로컬 좌표의 단면 평면(단면이 없으면 null) */
    const clipOf = (model: ArrayLike<number> | undefined): Plane4 | null => (sec ? planeToLocal(sec.plane, model) : null);
    /** 여러 단면: 묶음 id를 자르는 평면들(로컬). 여러 단면이 아니면 null */
    const clipsOf = (id: string, model: ArrayLike<number> | undefined): Plane4[] | null => (multi ? multi.of(id).map((i) => planeToLocal(multi.planes[i]!.plane, model)) : null);
    // 묶음별 겉모습(없으면 모두 장면 그대로 — 아래 함수들은 예전 값을 그대로 돌려준다)
    const look = st.look ?? null;
    const lookOf = (id: string): ItemLook | undefined => (look ? look(id) : undefined);
    const mm = (r: MeshRec): ArrayLike<number> | undefined => {
      const m = lookOf(r.src.id)?.matrix;
      return m ? this.lookModel(r, m, r.model).model : r.model;
    };
    const lm = (r: { lookM?: LookCache; model?: ArrayLike<number> }, id: string): ArrayLike<number> | undefined => {
      const m = lookOf(id)?.matrix;
      return m ? this.lookModel(r, m, r.model).model : r.model;
    };
    const bgFill: Rgba = [st.colors.background[0], st.colors.background[1], st.colors.background[2], 1];
    const colOf = (r: MeshRec): Rgba => {
      const c = lookOf(r.src.id)?.color ?? r.src.color;
      if (flat) return bgFill;
      return mono ? [mono[0], mono[1], mono[2], c[3]] : c;
    };
    const alphaOf = (id: string): number => lookOf(id)?.alpha ?? 1;
    const texOfR = (r: MeshRec): WebGLTexture | null => (noTex || lookOf(r.src.id)?.color ? null : this.texOf(r));
    const transOf = (r: MeshRec): boolean => {
      if (flat) return false;
      const l = lookOf(r.src.id);
      if (!l) return r.transparent;
      return (l.color ? l.color[3] < 0.999 : r.transparent) || (l.alpha ?? 1) < 0.999;
    };
    /** 겉모습 행렬을 반영한 세계 범위·가운데 */
    const boxOf = (r: MeshRec): Box3 => {
      const m = lookOf(r.src.id)?.matrix;
      if (!m) return r.box;
      const c = this.lookModel(r, m, r.model);
      return (c.box ??= transformBox(r.box, m));
    };
    const centerOf = (r: MeshRec): V3 => {
      const m = lookOf(r.src.id)?.matrix;
      if (!m) return r.center;
      const c = this.lookModel(r, m, r.model);
      return (c.center ??= boxCenter(boxOf(r)));
    };
    const meshN = multi ? this.variant('mesh', ['CLIPN']) : null;
    const meshTN = multi ? this.variant('mesh', ['CLIPN', 'TEX']) : null;
    /** 잘린 면 홀짝 그리기 동안 쓸 단면 평면(세계, 여러 단면에서 평면 하나만으로 자를 때) */
    let capPlane: Plane4 | null = null;
    // 그물 공통. 같은 값의 균일 변수는 다시 보내지 않는다(부품이 수천 개인 조립품에서 호출 수를 줄인다)
    // 그물 프로그램을 쓰기 시작할 때 meshUse()로 캐시를 비운다
    let cur: Prog = this.mesh;
    let lastMat: ArrayLike<number> | null | undefined;
    let lastCol = '';
    let lastFlags = '';
    let lastCull: boolean | undefined;
    let lastTex: WebGLTexture | null = null;
    let lastClip = '#';
    const meshUse = (p: Prog): void => {
      cur = p;
      gl.useProgram(p.p);
      lastMat = undefined;
      lastCol = '';
      lastFlags = '';
      lastCull = undefined;
      lastTex = null;
      lastClip = '#';
      gl.uniform1f(this.loc(p, 'u_ortho'), ortho);
      if (p.tex) gl.uniform1i(this.loc(p, 'u_tex'), 0);
      if (p.sun && light) {
        // 해 방향을 시점 공간으로(회전만)
        const v = f.view, d = light.dir;
        const sx = v[0]! * d[0] + v[4]! * d[1] + v[8]! * d[2], sy = v[1]! * d[0] + v[5]! * d[1] + v[9]! * d[2], sz = v[2]! * d[0] + v[6]! * d[1] + v[10]! * d[2];
        const l = Math.hypot(sx, sy, sz) || 1;
        gl.uniform3f(this.loc(p, 'u_sunDir'), sx / l, sy / l, sz / l);
        gl.uniform3f(this.loc(p, 'u_sunCol'), light.color[0], light.color[1], light.color[2]);
        gl.uniform1f(this.loc(p, 'u_amb'), light.ambient);
      }
      if (p.shadow && this.shadowMap) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowMap.tex);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(this.loc(p, 'u_shadow'), 2);
        gl.uniform2f(this.loc(p, 'u_shadowTexel'), 1 / this.shadowMap.size, 1 / this.shadowMap.size);
        gl.uniform1f(this.loc(p, 'u_shadowBias'), st.shadow?.bias ?? 0.0015);
      }
      if (p.fog && fog) {
        gl.uniform4f(this.loc(p, 'u_fogCol'), fog.color[0], fog.color[1], fog.color[2], 1);
        gl.uniform2f(this.loc(p, 'u_fog'), fog.start, fog.end);
      }
    };
    const setMeshMatrix = (model: ArrayLike<number> | undefined): void => {
      const p = cur;
      const mv = model ? mat4Mul(f.view, model, this.d4a) : f.view;
      const mvp = model ? mat4Mul(f.proj, mv, this.d4b) : f.viewProj;
      this.m4a.set(mvp);
      this.m4b.set(mv);
      normalMatrix(mv, this.m3);
      gl.uniformMatrix4fv(this.loc(p, 'u_mvp'), false, this.m4a);
      gl.uniformMatrix4fv(this.loc(p, 'u_mv'), false, this.m4b);
      gl.uniformMatrix3fv(this.loc(p, 'u_nmat'), false, this.m3);
      if (p.shadow && this.shadowMap) {
        // 깊이 그림 좌표 = [0, 1] 맞춤 · 빛 투영·시점 · 모형(double로 합친 뒤 float)
        const lv = model ? mat4Mul(this.shadowMap.vp, model, this.d4a) : this.shadowMap.vp;
        for (let i = 0; i < 16; i++) this.m4c[i] = lv[i]!;
        for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) this.m4c[j * 4 + i] = lv[j * 4 + i]! * 0.5 + lv[j * 4 + 3]! * 0.5;
        gl.uniformMatrix4fv(this.loc(p, 'u_shadowM'), false, this.m4c);
      }
      // 무늬 단면 변종(CLIP+TEX)도 평면을 받는다(0.6.0까지는 빠져 무늬 그물이 단면에 잘리지 않았다)
      if (p.clip1) {
        const c = (capPlane ? planeToLocal(capPlane, model) : clipOf(model)) ?? NO_CLIP;
        gl.uniform4f(this.loc(p, 'u_clip'), c[0], c[1], c[2], c[3]);
      }
    };
    /** 여러 단면 변종이면 그물의 평면들을 올린다(묶음·행렬이 바뀔 때만) */
    let clipMat: ArrayLike<number> | null | undefined;
    const meshClips = (r: MeshRec, matrix: ArrayLike<number> | undefined): void => {
      const p = cur;
      if (!multi || !p.clipN) return;
      const key = multi.of(r.src.id).join(',');
      if (key === lastClip && clipMat === (matrix ?? null)) return;
      lastClip = key;
      clipMat = matrix ?? null;
      this.setClips(p, clipsOf(r.src.id, matrix)!);
    };
    /** 그물 그리기. list를 주면 그 구간만(묶음 안 숨김·강조). 무늬 프로그램이면 그물의 무늬를 건다 */
    const meshDraw = (r: MeshRec, matrix: ArrayLike<number> | undefined, color: Rgba, alpha: number, tint: number, cull: boolean, list?: DrawList | null): void => {
      if (list && !list.total) return;
      const p = cur;
      if (p.tex) {
        const t = this.texOf(r);
        if (t !== lastTex) {
          lastTex = t;
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, t);
        }
        gl.uniform1f(this.loc(p, 'u_uvq'), r.uv === 3 ? 1 : 0);
        gl.uniform1f(this.loc(p, 'u_texAlpha'), r.texAlpha ? 1 : 0);
      }
      if (p.back) {
        const bc = r.back?.color;
        if (bc) gl.uniform4f(this.loc(p, 'u_backColor'), bc[0], bc[1], bc[2], 1);
        else gl.uniform4f(this.loc(p, 'u_backColor'), 0, 0, 0, -1);
        // 거울 행렬(행렬식 < 0)이면 감김이 뒤집힌다
        const M = matrix;
        const det = M ? M[0]! * (M[5]! * M[10]! - M[6]! * M[9]!) - M[4]! * (M[1]! * M[10]! - M[2]! * M[9]!) + M[8]! * (M[1]! * M[6]! - M[2]! * M[5]!) : 1;
        gl.uniform1f(this.loc(p, 'u_flipFace'), det < 0 ? 1 : 0);
        if (p.backTex) {
          gl.activeTexture(gl.TEXTURE3);
          gl.bindTexture(gl.TEXTURE_2D, this.backTexOf(r));
          gl.activeTexture(gl.TEXTURE0);
          gl.uniform1i(this.loc(p, 'u_tex2'), 3);
          gl.uniform1f(this.loc(p, 'u_uvq2'), r.back?.uv === 3 ? 1 : 0);
          gl.uniform1f(this.loc(p, 'u_tex2Alpha'), r.back?.texAlpha ? 1 : 0);
        }
      }
      const m = matrix ?? null;
      if (m !== lastMat) {
        lastMat = m;
        setMeshMatrix(matrix);
      }
      if (multi) meshClips(r, matrix);
      const ck = `${color[0]},${color[1]},${color[2]},${color[3]}`;
      if (ck !== lastCol) {
        lastCol = ck;
        gl.uniform4f(this.loc(p, 'u_color'), color[0], color[1], color[2], color[3]);
      }
      const vcol = r.hasColors && !(look && lookOf(r.src.id)?.color) && !mono && !flat;
      const fk = `${vcol ? 1 : 0}${r.hasNormals ? 1 : 0}|${tint}|${alpha}`;
      if (fk !== lastFlags) {
        lastFlags = fk;
        gl.uniform1f(this.loc(p, 'u_vcol'), vcol ? 1 : 0);
        gl.uniform1f(this.loc(p, 'u_hasNrm'), r.hasNormals ? 1 : 0);
        gl.uniform4f(this.loc(p, 'u_tint'), hiTint[0], hiTint[1], hiTint[2], tint);
        gl.uniform1f(this.loc(p, 'u_alpha'), alpha);
      }
      if (cull !== lastCull) {
        lastCull = cull;
        if (cull) gl.enable(gl.CULL_FACE);
        else gl.disable(gl.CULL_FACE);
      }
      if (list) {
        if (list.compact) {
          gl.bindVertexArray(list.compact.vao);
          gl.drawElements(gl.TRIANGLES, list.compact.count, gl.UNSIGNED_INT, 0);
          stats.drawCalls++;
        } else {
          gl.bindVertexArray(r.vao);
          for (const run of list.runs) {
            if (r.indexed) gl.drawElements(gl.TRIANGLES, run.count * 3, gl.UNSIGNED_INT, run.start * 12);
            else gl.drawArrays(gl.TRIANGLES, run.start * 3, run.count * 3);
            stats.drawCalls++;
          }
        }
        stats.triangles += list.total;
        return;
      }
      gl.bindVertexArray(r.vao);
      if (r.indexed) gl.drawElements(gl.TRIANGLES, r.count, gl.UNSIGNED_INT, 0);
      else gl.drawArrays(gl.TRIANGLES, 0, r.count);
      stats.drawCalls++;
      stats.triangles += r.count / 3;
    };
    /** 그물 프로그램: 단면(CLIP·CLIPN)·무늬(TEX)에 모드·조명 등 더 넣을 정의(extra)가 있으면 그 변종, 없으면 예전 프로그램 */
    const progOf = (tex: boolean): Prog => {
      if (!meshExtra.length) return tex ? (meshTN ?? this.meshTex(!!sec)) : (meshN ?? (sec ? this.meshClip() : this.mesh));
      return this.variant('mesh', [...meshExtra, ...(shadowOn ? ['SHADOW'] : []), ...(multi ? ['CLIPN'] : sec ? ['CLIP'] : []), ...(tex ? ['TEX'] : [])]);
    };
    const sceneMeshProg = (): Prog => progOf(false);
    const texProg = (): Prog => progOf(true);
    /** 뒷면 변종이 필요한 그물인지(단색·숨은 선 모드, 색 바꾸기는 뒷면 없이) */
    const backOf = (r: MeshRec): boolean => !!r.back && !mono && !flat && !lookOf(r.src.id)?.color && (!!r.back.color || (!noTex && !!this.backTexOf(r)));
    /** 그물에 맞는 프로그램(올린 무늬가 있으면 무늬 변종, 뒷면이 있으면 뒷면 변종) */
    const progFor = (r: MeshRec): Prog => {
      if (!backOf(r)) return texOfR(r) ? texProg() : sceneMeshProg();
      const defs = [...meshExtra, ...(shadowOn ? ['SHADOW'] : []), ...(multi ? ['CLIPN'] : sec ? ['CLIP'] : []), ...(texOfR(r) ? ['TEX'] : []), 'BACK'];
      if (!noTex && this.backTexOf(r)) defs.push('BACKTEX');
      return this.variant('mesh', defs);
    };
    /** 묶음 안 구간이 있으면 [보통, 강조] 그릴 목록(없으면 null — 옛 캐시는 지운다). wire면 와이어프레임용 */
    const meshLists = (r: MeshRec, wire = false): [DrawList, DrawList] | null => {
      const p = st.parts?.(r.src.id);
      if (!p) {
        if (r.parts) this.dropParts(r);
        return null;
      }
      const c = this.partCache(r, p.ver);
      return [this.meshList(r, c, p.prims, false, wire), this.meshList(r, c, p.prims, true, wire)];
    };
    /** 보통·강조로 나눠 그물 그리기(구간이 없으면 통째로) */
    const meshDrawParts = (r: MeshRec, color: Rgba, alpha: number, tint: number, cull: boolean): void => {
      const L = meshLists(r);
      const model = mm(r);
      if (!L) meshDraw(r, model, color, alpha, tint, cull);
      else {
        meshDraw(r, model, color, alpha, tint, cull, L[0]);
        meshDraw(r, model, color, alpha, 0.5, cull, L[1]);
      }
    };

    const visibleMeshes = this.meshes.filter((r) => vis(r.src.id, r.src.group));

    // 1a) 해 그림자 깊이 그림(판이 바뀌었을 때만 다시): 불투명 그물을 해 쪽 평행 투영으로
    if (light && st.shadow && shadedLike && !flat) {
      const sh = st.shadow;
      let m = this.shadowMap;
      // 크기: 256 ~ min(8192, GPU 무늬 한도), 수가 아니면 2048. 만들지 못한 크기는 다시 시도하지 않는다(그림자 없이)
      const maxTex = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096;
      const size = Math.max(256, Math.min(8192, maxTex, Number.isFinite(sh.size) ? Math.round(sh.size) : 2048));
      if ((!m || m.size !== size) && this.shadowFailed !== size) {
        m = this.makeShadowMap(size);
        if (!m) this.shadowFailed = size;
      }
      if (m && m.version !== sh.version) {
        const target = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        m.vp = this.lightViewProj(light.dir, sh.box);
        gl.bindFramebuffer(gl.FRAMEBUFFER, m.fb);
        gl.viewport(0, 0, size, size);
        gl.clearDepth(1);
        gl.depthMask(true);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.colorMask(false, false, false, false);
        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(2, 4);
        const dp = this.variant('depth', multi ? ['CLIPN'] : sec ? ['CLIP'] : []);
        gl.useProgram(dp.p);
        for (const r of visibleMeshes) {
          if (transOf(r)) continue;
          const model = mm(r);
          const lv = model ? mat4Mul(m.vp, model, this.d4a) : m.vp;
          this.m4a.set(lv);
          gl.uniformMatrix4fv(this.loc(dp, 'u_mvp'), false, this.m4a);
          if (sec) {
            const c = clipOf(model)!;
            gl.uniform4f(this.loc(dp, 'u_clip'), c[0], c[1], c[2], c[3]);
          }
          if (multi) this.setClips(dp, clipsOf(r.src.id, model)!);
          const L = meshLists(r);
          if (!L) this.drawMeshGeometry(r, null);
          else for (const l of L) this.drawMeshGeometry(r, l);
        }
        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.colorMask(true, true, true, true);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target);
        gl.viewport(0, 0, devW, devH);
        m.version = sh.version;
      }
      shadowOn = !!m && m.size === size;
    } else if (this.shadowMap) this.dropShadow();
    // 외곽선을 끄면 깊이 그림 버퍼도 놓는다
    if (!st.profiles && this.profTex) this.dropProfile();

    // 1) 불투명 면(무늬 없는 것 먼저, 그다음 올린 무늬가 있는 것 — 프로그램을 한 번씩만 바꾼다)
    if (shadedLike) {
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 1);
      let textured = false;
      meshUse(sceneMeshProg());
      let backs = false;
      for (const r of visibleMeshes) {
        if (transOf(r)) continue;
        if (r.back && backOf(r)) {
          backs = true;
          continue;
        }
        if (texOfR(r)) {
          textured = true;
          continue;
        }
        meshDrawParts(r, colOf(r), 1, st.highlight.has(r.src.id) ? 0.5 : 0, r.src.doubleSided === false);
      }
      if (textured) {
        meshUse(texProg());
        for (const r of visibleMeshes)
          if (!transOf(r) && texOfR(r) && !(r.back && backOf(r))) meshDrawParts(r, colOf(r), 1, st.highlight.has(r.src.id) ? 0.5 : 0, r.src.doubleSided === false);
      }
      // 뒷면 색·무늬가 있는 그물(그물마다 맞는 변종)
      if (backs)
        for (const r of visibleMeshes) {
          if (transOf(r) || !r.back || !backOf(r)) continue;
          const p = progFor(r);
          if (p !== cur) meshUse(p);
          meshDrawParts(r, colOf(r), 1, st.highlight.has(r.src.id) ? 0.5 : 0, r.src.doubleSided === false);
        }
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.disable(gl.CULL_FACE);
      // 1b) 잘린 면 채우기
      if (capsOn) {
        // 반투명·범위·색은 겉모습·모드(숨은 선·단색)를 반영한 값으로(겉모습이 없고 예전 모드면 장면 값 그대로)
        const units = this.capUnits(visibleMeshes, sec, multi, { trans: transOf, box: boxOf, color: colOf });
        const plain = meshExtra.length ? this.variant('mesh', [...meshExtra, ...(multi ? ['CLIPN'] : [])]) : multi ? this.variant('mesh', ['CLIPN']) : this.mesh;
        if (units.length) this.drawCaps(f, devW, devH, units, multi, st, stats, meshUse, meshDraw, () => cur, (r) => meshLists(r), (pl) => (capPlane = pl), mm, plain);
      }
    }

    // 1c) 단면 테두리(교선): 면 위에 깊이를 따져 굵게
    const cutStyle = multi ?? sec;
    if (cutStyle && this.cutSeg) {
      gl.enable(gl.BLEND);
      this.drawLines(f, this.cutSeg, this.cutSeg.model, { color: cutStyle.color, vcol: false, width: cutStyle.width, dashed: false, alpha: 1, first: 0, count: this.cutSeg.n, bias: 2e-5 }, st, stats);
      gl.disable(gl.BLEND);
    }

    // 2) 윤곽선·와이어프레임
    if (mode !== 'shaded') {
      const edgeCol = st.colors.edge;
      // 0.8.0 선 색 선택(없으면 0.7.2 그대로 — meshEdgeColor 시험이 0.7.2 식과 견준다). 대비 계산은 같은 색끼리 한 번만
      const lineOpt = st.edgeColor || st.edgeContrast ? { fixed: st.edgeColor ?? null, contrast: st.edgeContrast?.fallback ?? null } : null;
      const lineCache = new Map<string, Rgba>();
      gl.enable(gl.BLEND);
      for (const r of visibleMeshes) {
        const hi = st.highlight.has(r.src.id);
        const c = colOf(r);
        // 0.9.0 그물마다 윤곽선 색(setItemEdgeColor): 그 그물에서는 전역 edgeColor 자리에(대비 선택은 그대로)
        const ic = lookOf(r.src.id)?.edgeColor;
        let col: Rgba;
        if (!lineOpt && !ic) col = hi ? hiTint : flat ? st.colors.line : mode === 'shadedEdges' || mode === 'monochrome' || mode === 'noTexture' ? edgeCol : [c[0], c[1], c[2], mode === 'xray' ? 0.9 : 1];
        else {
          const key = `${hi ? 1 : 0}${c.join()}|${ic ? ic.join() : ''}`;
          col = lineCache.get(key) ?? edgeLineColor(mode, c, st.colors, hi, lineOpt, ic);
          lineCache.set(key, col);
        }
        const model = mm(r);
        if (r.edges) {
          const ep = st.parts?.(r.src.id);
          const eparts = ep?.edges;
          const eo = { color: col, vcol: false, width: hi ? 2 : 1, dashed: false, alpha: alphaOf(r.src.id), clip: clipOf(model), clips: clipsOf(r.src.id, model) };
          if (!ep || !eparts) {
            if (r.edges.parts) this.dropParts(r.edges);
            this.drawLines(f, r.edges, model, { ...eo, first: 0, count: r.edges.n }, st, stats);
          } else {
            // 윤곽선 구간(숨김·강조)
            const c = this.partCache(r.edges, ep.ver);
            this.drawLineList(f, r.edges, model, this.lineList(r.edges, c, eparts, false, r.src.edges!, undefined), 0, r.edges.n, eo, st, stats);
            this.drawLineList(f, r.edges, model, this.lineList(r.edges, c, eparts, true, r.src.edges!, undefined), 0, r.edges.n, { ...eo, color: hiTint, width: 2 }, st, stats);
          }
        } else if (meshLineKind(r.src, mode) === 'triangles') {
          // 윤곽선이 없는 그물: 와이어프레임·숨은 선에서 삼각형 변(X-ray에서는 반투명 면만, triangleEdges: false면 선 없음)
          const w = this.wireOf(r);
          const clip = clipOf(model);
          const wclips = clipsOf(r.src.id, model);
          const p = fog
            ? this.variant('thin', ['FOG', ...(wclips ? ['CLIPN'] : clip ? ['CLIP'] : [])])
            : wclips
              ? this.variant('thin', ['CLIPN'])
              : clip
                ? this.thinClip()
                : this.thinP;
          gl.useProgram(p.p);
          this.m4a.set(model ? mat4Mul(f.viewProj, model, this.d4a) : f.viewProj);
          gl.uniformMatrix4fv(this.loc(p, 'u_mvp'), false, this.m4a);
          gl.uniform4f(this.loc(p, 'u_color'), col[0], col[1], col[2], col[3]);
          gl.uniform1f(this.loc(p, 'u_vcol'), 0);
          gl.uniform1f(this.loc(p, 'u_alpha'), alphaOf(r.src.id));
          gl.uniform4f(this.loc(p, 'u_override'), 0, 0, 0, 0);
          gl.uniform1f(this.loc(p, 'u_bias'), 0);
          if (clip) gl.uniform4f(this.loc(p, 'u_clip'), clip[0], clip[1], clip[2], clip[3]);
          if (wclips) this.setClips(p, wclips);
          if (fog) this.setLineFog(p, f, model, fog);
          const L = meshLists(r, true);
          if (!L) {
            gl.bindVertexArray(w.vao);
            gl.drawElements(gl.LINES, w.count, gl.UNSIGNED_INT, 0);
            stats.drawCalls++;
            stats.segments += w.count / 2;
          } else
            L.forEach((list, k) => {
              if (!list.total) return;
              if (k === 1) gl.uniform4f(this.loc(p, 'u_color'), hiTint[0], hiTint[1], hiTint[2], hiTint[3]);
              if (list.compact) {
                gl.bindVertexArray(list.compact.vao);
                gl.drawElements(gl.LINES, list.compact.count, gl.UNSIGNED_INT, 0);
                stats.drawCalls++;
              } else {
                gl.bindVertexArray(w.vao);
                for (const run of list.runs) {
                  gl.drawElements(gl.LINES, run.count * 6, gl.UNSIGNED_INT, run.start * 24);
                  stats.drawCalls++;
                }
              }
              stats.segments += list.total * 3;
            });
        }
      }
      gl.disable(gl.BLEND);
    }

    // 2b) 숨은 선 모드: 면 뒤 윤곽선을 흐린 점선으로(깊이 비교를 뒤집어). 숨긴 구간(setHiddenRanges)은 빼고 묶음 불투명도를 곱한다.
    // 모형 모서리 선분 묶음(LineSet3d.hiddenEdges)도 그리기 범위 안쪽을 함께(선분 묶음은 아직 깊이에 없어 면만 가린다)
    // 0.8.0: hiddenEdgesShaded면 음영 계열 모드에서도(그물 윤곽선은 보이는 윤곽선을 그리는 모드에서만 — 음영은 선분 묶음만)
    const backEdges = drawsBackEdges(mode, !!st.hiddenEdgesShaded);
    if ((backEdges.meshes || backEdges.lines) && st.hiddenEdges && st.hiddenEdges > 0) {
      gl.enable(gl.BLEND);
      gl.depthFunc(gl.GREATER);
      gl.depthMask(false);
      const dashCol = st.hiddenEdgeColor ?? st.colors.line;
      /** 선분 레코드 하나를 [0, count) 안에서 숨은 점선으로(구간이 있으면 보통·강조 구간 모두, 숨긴 구간은 빼고) */
      const dashHidden = (rec: LineRec, id: string, model: ArrayLike<number> | undefined, count: number, parts: readonly RangePart[] | null | undefined, ver: number, positions: Float32Array, colors: Float32Array | undefined): void => {
        // 끝 마개 깊이를 맞춘 변종(CAPZ)에 눈 쪽으로 아주 조금 당겨 그린다: 보이는 윤곽선(얇은 선) 위에 점선이 비치지 않게(0.9.0부터 숨은 선 모드 기본 색도)
        const o = { ...backEdgeDash(dashCol, st.hiddenEdges! * alphaOf(id)), clip: clipOf(model), clips: clipsOf(id, model) };
        if (!parts) {
          this.drawLines(f, rec, model, { ...o, first: 0, count }, st, stats);
          return;
        }
        const c = this.partCache(rec, ver);
        for (const hi of [false, true]) this.drawLineList(f, rec, model, this.lineList(rec, c, parts, hi, positions, colors), 0, count, o, st, stats);
      };
      for (const r of visibleMeshes) {
        if (!r.edges || !backEdges.meshes) continue;
        const ep = st.parts?.(r.src.id);
        dashHidden(r.edges, r.src.id, mm(r), r.edges.n, ep?.edges, ep?.ver ?? 0, r.src.edges!, undefined);
      }
      for (const r of this.lines) {
        const l = r.src;
        if (!backEdges.lines || l.hiddenEdges !== true || !vis(l.id, l.group)) continue;
        const range = st.ranges.get(l.id);
        const count = range ? Math.max(0, Math.min(r.n, Math.floor(range.count))) : r.n;
        const p = st.parts?.(l.id);
        if (count > 0) dashHidden(r, l.id, lm(r, l.id), count, p?.prims, p?.ver ?? 0, l.positions, l.colors);
      }
      gl.depthMask(true);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.BLEND);
    }

    // 2c) 외곽선(실루엣): 불투명 그물만 깊이 그림에 따로 그려 깊이가 끊기는 곳을 칠한다.
    // 와이어프레임(0.7.2)도 같은 길: 이 깊이 그림은 자기 버퍼라 기본 깊이(선만 있다)와 상관없다
    if (st.profiles && drawsProfiles(mode) && visibleMeshes.length) {
      const target = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      // 0.9.0 그물마다 외곽선 색(setItemProfileColor)이 있는 불투명 그물이 보일 때만 색 그림을 함께 그린다(없으면 0.8.0 길 그대로)
      const perItem = visibleMeshes.some((r) => !!lookOf(r.src.id)?.profileColor && !transOf(r));
      if (!perItem && this.profCol) this.dropProfileColor();
      const fb = perItem ? this.profileColorTarget(devW, devH) : this.profileTarget(devW, devH);
      if (fb) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.viewport(0, 0, devW, devH);
        gl.clearDepth(1);
        gl.depthMask(true);
        const dc = stats.drawCalls, tr = stats.triangles;
        const pc = st.profiles.color;
        if (perItem) {
          // 깊이와 함께 그물마다 외곽선 색을 쓴다(깊이만 그리는 프로그램 PCOL 변종 — 모형·시점·투영은 그물 그리기와 같은 순서로 합친다)
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          const dp = this.variant('depth', ['PCOL', ...(multi ? ['CLIPN'] : sec ? ['CLIP'] : [])]);
          gl.useProgram(dp.p);
          for (const r of visibleMeshes) {
            if (transOf(r)) continue;
            const model = mm(r);
            const mv = model ? mat4Mul(f.view, model, this.d4a) : f.view;
            this.m4a.set(model ? mat4Mul(f.proj, mv, this.d4b) : f.viewProj);
            gl.uniformMatrix4fv(this.loc(dp, 'u_mvp'), false, this.m4a);
            if (sec) {
              const k = clipOf(model)!;
              gl.uniform4f(this.loc(dp, 'u_clip'), k[0], k[1], k[2], k[3]);
            }
            if (multi) this.setClips(dp, clipsOf(r.src.id, model)!);
            const ic = lookOf(r.src.id)?.profileColor ?? pc;
            gl.uniform4f(this.loc(dp, 'u_pcol'), ic[0], ic[1], ic[2], ic[3]);
            if (r.src.doubleSided === false) gl.enable(gl.CULL_FACE);
            else gl.disable(gl.CULL_FACE);
            const L = meshLists(r);
            if (!L) this.drawMeshGeometry(r, null);
            else for (const l of L) this.drawMeshGeometry(r, l);
          }
          gl.disable(gl.CULL_FACE);
          if (st.transparent) gl.clearColor(0, 0, 0, 0);
          else gl.clearColor(bg[0], bg[1], bg[2], 1);
        } else {
          gl.clear(gl.DEPTH_BUFFER_BIT);
          gl.colorMask(false, false, false, false);
          meshUse(sceneMeshProg());
          for (const r of visibleMeshes) {
            if (transOf(r)) continue;
            const p = progFor(r);
            if (p !== cur) meshUse(p);
            meshDrawParts(r, colOf(r), 1, 0, r.src.doubleSided === false);
          }
          gl.disable(gl.CULL_FACE);
        }
        stats.drawCalls = dc;
        stats.triangles = tr;
        gl.colorMask(true, true, true, true);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target);
        gl.viewport(0, 0, devW, devH);
        // 굵기 1.5 미만(0.7.2): 앞쪽 1화소 변종. 그 밖에는 0.7.1 프로그램 그대로(그물마다 색이면 PCOL 변종)
        const one = profileOnePixel(st.profiles.width);
        const pp = perItem ? this.variant('profile', one ? ['ONE', 'PCOL'] : ['PCOL']) : one ? this.variant('profile', ['ONE']) : (this.profileP ??= this.program(FULL_VS, PROFILE_FS));
        gl.useProgram(pp.p);
        if (perItem) {
          gl.activeTexture(gl.TEXTURE4);
          gl.bindTexture(gl.TEXTURE_2D, this.profCol!.tex);
          gl.uniform1i(this.loc(pp, 'u_pcol'), 4);
        }
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.profTex!.tex);
        gl.uniform1i(this.loc(pp, 'u_depth'), 1);
        gl.uniform2f(this.loc(pp, 'u_texel'), 1 / devW, 1 / devH);
        gl.uniform1f(this.loc(pp, 'u_r'), Math.max(1, st.profiles.width / 2));
        gl.uniform4f(this.loc(pp, 'u_color'), pc[0], pc[1], pc[2], pc[3]);
        gl.uniform1f(this.loc(pp, 'u_ortho'), ortho);
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.enable(gl.BLEND);
        gl.bindVertexArray(this.emptyVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        stats.drawCalls++;
        gl.disable(gl.BLEND);
        gl.depthMask(true);
        gl.enable(gl.DEPTH_TEST);
        gl.bindTexture(gl.TEXTURE_2D, null);
        if (perItem) {
          gl.activeTexture(gl.TEXTURE4);
          gl.bindTexture(gl.TEXTURE_2D, null);
        }
        gl.activeTexture(gl.TEXTURE0);
        lastTex = null;
      }
    }

    // 3) 선분 묶음
    for (const r of this.lines) {
      const l = r.src;
      if (!vis(l.id, l.group)) continue;
      const hi = st.highlight.has(l.id);
      const range = st.ranges.get(l.id);
      const count = range ? Math.max(0, Math.min(r.n, Math.floor(range.count))) : r.n;
      const lo = lookOf(l.id);
      const color = lo?.color ?? l.color ?? st.colors.line;
      const model = lm(r, l.id);
      const la = lo?.alpha ?? 1;
      const base = { color: hi ? hiTint : color, vcol: !!r.col && !hi && !lo?.color, width: (l.width ?? 1) + (hi ? 1 : 0), dashed: !!l.dashed, clip: clipOf(model), clips: clipsOf(l.id, model) };
      const blend = (lo?.color ? lo.color[3] < 1 : (l.color?.[3] ?? 1) < 1 || !!r.col) || la < 1;
      const p = st.parts?.(l.id);
      if (!p && r.parts) this.dropParts(r);
      if (blend) gl.enable(gl.BLEND);
      if (!p) {
        if (count > 0) this.drawLines(f, r, model, { ...base, alpha: la, first: 0, count }, st, stats);
        if (range && range.ghost > 0 && count < r.n) {
          gl.enable(gl.BLEND);
          gl.depthMask(false);
          this.drawLines(f, r, model, { ...base, alpha: range.ghost * la, first: count, count: r.n - count }, st, stats);
          gl.depthMask(true);
        }
      } else {
        // 묶음 안 구간: 숨긴 구간은 빼고, 강조 구간은 강조색·굵게(그리기 범위·흐린 나머지와 함께)
        const c = this.partCache(r, p.ver);
        const ln = this.lineList(r, c, p.prims, false, l.positions, l.colors);
        const lh = this.lineList(r, c, p.prims, true, l.positions, l.colors);
        const hiBase = { ...base, color: hiTint, vcol: false, width: (l.width ?? 1) + 1 };
        if (count > 0) {
          this.drawLineList(f, r, model, ln, 0, count, { ...base, alpha: la }, st, stats);
          this.drawLineList(f, r, model, lh, 0, count, { ...hiBase, alpha: la }, st, stats);
        }
        if (range && range.ghost > 0 && count < r.n) {
          gl.enable(gl.BLEND);
          gl.depthMask(false);
          this.drawLineList(f, r, model, ln, count, r.n, { ...base, alpha: range.ghost * la }, st, stats);
          this.drawLineList(f, r, model, lh, count, r.n, { ...hiBase, alpha: range.ghost * la }, st, stats);
          gl.depthMask(true);
        }
      }
      gl.disable(gl.BLEND);
    }

    // 4) 점
    if (this.points.length) {
      const p = fog ? this.variant('point', ['FOG', ...(multi ? ['CLIPN'] : [])]) : multi ? this.variant('point', ['CLIPN']) : this.pointP;
      gl.useProgram(p.p);
      gl.uniformMatrix4fv(this.loc(p, 'u_mvp'), false, vpF);
      gl.uniform2f(this.loc(p, 'u_viewport'), devW, devH);
      gl.uniform1f(this.loc(p, 'u_bias'), 2e-5);
      gl.uniform4f(this.loc(p, 'u_clip'), NO_CLIP[0], NO_CLIP[1], NO_CLIP[2], NO_CLIP[3]);
      let shifted = false;
      for (const r of this.points) {
        if (!vis(r.src.id, r.src.group) || !r.n) continue;
        const hi = st.highlight.has(r.src.id);
        const po = lookOf(r.src.id);
        const c0 = hi ? hiTint : po?.color ?? r.src.color ?? st.colors.point;
        const c: Rgba = po?.alpha !== undefined && po.alpha < 1 ? [c0[0], c0[1], c0[2], c0[3] * po.alpha] : c0;
        const model = lm(r, r.src.id);
        if (model || shifted) {
          this.m4a.set(model ? mat4Mul(f.viewProj, model, this.d4a) : f.viewProj);
          gl.uniformMatrix4fv(this.loc(p, 'u_mvp'), false, this.m4a);
          shifted = !!model;
        }
        if (sec) {
          const k = clipOf(model)!;
          gl.uniform4f(this.loc(p, 'u_clip'), k[0], k[1], k[2], k[3]);
        }
        if (multi) this.setClips(p, clipsOf(r.src.id, model)!);
        if (fog) this.setLineFog(p, f, model, fog);
        const draw = (vao: WebGLVertexArrayObject, n: number, c: Rgba, big: boolean): void => {
          gl.uniform1f(this.loc(p, 'u_size'), Math.max(1, (r.src.size ?? 4) * st.dpr + (big ? 2 * st.dpr : 0)));
          gl.uniform4f(this.loc(p, 'u_color'), c[0], c[1], c[2], c[3]);
          gl.uniform4f(this.loc(p, 'u_ring'), c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 1);
          if (c[3] < 1) gl.enable(gl.BLEND);
          gl.bindVertexArray(vao);
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
          gl.disable(gl.BLEND);
          stats.drawCalls++;
          stats.points += n;
        };
        const pp = st.parts?.(r.src.id);
        if (!pp) {
          if (r.parts) this.dropParts(r);
          draw(r.vao, r.n, c, hi);
        } else {
          // 묶음 안 구간: 숨긴 점은 빼고 강조 점은 강조색·크게
          const pc = this.partCache(r, pp.ver);
          const ln = this.pointList(r, pc, pp.prims, false), lh = this.pointList(r, pc, pp.prims, true);
          if (ln.compact) draw(ln.compact.vao, ln.total, c, hi);
          if (lh.compact) draw(lh.compact.vao, lh.total, hiTint, true);
        }
      }
    }

    // 5) 공구 표시(단면으로 자르지 않는다)
    if (st.marker) {
      const r = this.markerRec(st.marker.kind);
      meshUse(this.mesh);
      meshDraw(r, st.marker.matrix, st.marker.color, 1, 0, false);
    }

    // 5b) 선분 강조: 가려진 부분은 깊이 비교를 뒤집어 흐리게, 보이는 부분은 깊이를 따져 굵게(같은 선분 위에 겹쳐 그린다)
    if (st.segHighlight && this.hiSeg) {
      const s = st.segHighlight;
      const r = this.hiSeg;
      const base = { color: s.color, vcol: false, width: s.width, dashed: false, first: 0, count: r.n, clip: clipOf(r.model), clips: clipsOf('__hiseg', r.model) };
      gl.enable(gl.BLEND);
      if (s.hidden > 0) {
        gl.depthFunc(gl.GREATER);
        gl.depthMask(false);
        this.drawLines(f, r, r.model, { ...base, alpha: s.hidden }, st, stats);
        gl.depthMask(true);
        gl.depthFunc(gl.LEQUAL);
      }
      this.drawLines(f, r, r.model, { ...base, alpha: 1, bias: 2e-5 }, st, stats);
      gl.disable(gl.BLEND);
    }

    // 6) 격자
    if (st.grid && this.grid) {
      const p = this.thinP;
      gl.useProgram(p.p);
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      const gm = this.grid.model;
      if (gm) {
        this.m4a.set(mat4Mul(f.viewProj, gm, this.d4a));
        gl.uniformMatrix4fv(this.loc(p, 'u_mvp'), false, this.m4a);
      } else gl.uniformMatrix4fv(this.loc(p, 'u_mvp'), false, vpF);
      gl.uniform1f(this.loc(p, 'u_vcol'), 0);
      gl.uniform1f(this.loc(p, 'u_alpha'), 1);
      gl.uniform4f(this.loc(p, 'u_override'), 0, 0, 0, 0);
      gl.uniform1f(this.loc(p, 'u_bias'), 0);
      const g = this.grid;
      const parts: [ThinRec | null, Rgba][] = [
        [g.minor, st.colors.gridMinor],
        [g.major, st.colors.grid],
        [g.axisX, st.colors.axisX],
        [g.axisY, st.colors.axisY],
      ];
      for (const [r, c] of parts) {
        if (!r) continue;
        gl.uniform4f(this.loc(p, 'u_color'), c[0], c[1], c[2], c[3]);
        gl.bindVertexArray(r.vao);
        gl.drawArrays(gl.LINES, 0, r.count);
        stats.drawCalls++;
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // 7) 반투명 면(X-ray 포함): 뒤에서 앞으로
    const xray = mode === 'xray';
    const trans = mode === 'wireframe' || flat ? [] : visibleMeshes.filter((r) => xray || transOf(r));
    if (trans.length) {
      const eye = f.eye;
      const fwd: V3 = [-f.basis.back[0], -f.basis.back[1], -f.basis.back[2]];
      // center는 이미 세계 좌표(행렬·원점을 거친 범위의 가운데)
      const depth = (r: MeshRec): number => {
        const c = centerOf(r);
        return (c[0] - eye[0]) * fwd[0] + (c[1] - eye[1]) * fwd[1] + (c[2] - eye[2]) * fwd[2];
      };
      trans.sort((a, b) => depth(b) - depth(a));
      meshUse(sceneMeshProg());
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      for (const r of trans) {
        const p = progFor(r);
        if (p !== cur) meshUse(p);
        meshDrawParts(r, colOf(r), (xray ? 0.22 : 1) * alphaOf(r.src.id), st.highlight.has(r.src.id) ? 0.5 : 0, false);
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // 8) 앱 측정 덧그림 선: 가려진 부분은 흐리게(깊이 비교를 뒤집어), 보이는 부분은 깊이를 따져 또렷하게. 단면으로 자르지 않는다
    if (st.annotations && this.annoSeg) {
      const a = st.annotations;
      const r = this.annoSeg;
      const base = { color: [1, 1, 1, 1] as Rgba, vcol: true, width: a.width, dashed: false, first: 0, count: r.n, noFog: true };
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      if (a.hidden > 0) {
        gl.depthFunc(gl.GREATER);
        this.drawLines(f, r, r.model, { ...base, alpha: a.hidden }, st, stats);
        gl.depthFunc(gl.LEQUAL);
      }
      this.drawLines(f, r, r.model, { ...base, alpha: 1, bias: 2e-5 }, st, stats);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    gl.bindVertexArray(null);
  }

  /**
   * 잘린 면을 채울 단위: 그물 하나(Mesh3d.closed 또는 caps 'all'), 또는 같은 capGroup의 불투명 그물들(재질별로 나뉜 닫힌 입체).
   * 평면 하나(section)면 그 평면, 여러 평면(sections)이면 평면마다 그 평면이 자르는 그물로 만들고, 다른 평면들은 채운 면을 자르는 데 쓴다.
   * capGroup이 없는 장면은 예전과 같은 차례·같은 그물이다.
   */
  private capUnits(
    meshes: readonly MeshRec[],
    sec: SectionDraw | null,
    multi: SectionsDraw | null,
    lk: { trans: (r: MeshRec) => boolean; box: (r: MeshRec) => Box3; color: (r: MeshRec) => Rgba } | null,
  ): CapUnit[] {
    const out: CapUnit[] = [];
    const trans = (r: MeshRec): boolean => (lk ? lk.trans(r) : r.transparent);
    const boxOf = (r: MeshRec): Box3 => (lk ? lk.box(r) : r.box);
    const colOf = (r: MeshRec): Rgba => (lk ? lk.color(r) : r.src.color);
    const build = (plane: Plane4, caps: 'closed' | 'all' | 'none', inScope: (r: MeshRec) => boolean, others: (r: MeshRec) => Plane4[]): void => {
      if (caps === 'none') return;
      const groups = new Map<string, CapUnit>();
      for (const r of meshes) {
        if (trans(r) || !inScope(r)) continue;
        const g = r.src.capGroup;
        if (g !== undefined) {
          const u = groups.get(g);
          if (u) {
            u.meshes.push(r);
            u.box = unionBox(u.box, boxOf(r));
          } else {
            const nu: CapUnit = { meshes: [r], box: boxOf(r), plane, others: others(r), color: colOf(r), group: true };
            groups.set(g, nu);
            out.push(nu);
          }
          continue;
        }
        if ((caps === 'all' || r.src.closed === true) && boxStraddles(boxOf(r), plane)) out.push({ meshes: [r], box: boxOf(r), plane, others: others(r), color: colOf(r), group: false });
      }
      // 묶음 단위는 합친 범위가 평면을 걸칠 때만
      for (let i = out.length - 1; i >= 0; i--) if (out[i]!.group && out[i]!.plane === plane && !boxStraddles(out[i]!.box, plane)) out.splice(i, 1);
    };
    if (multi)
      multi.planes.forEach((q, k) =>
        build(
          q.plane,
          q.caps,
          (r) => multi.of(r.src.id).includes(k),
          (r) => multi.of(r.src.id).filter((i) => i !== k).map((i) => multi.planes[i]!.plane),
        ),
      );
    else if (sec) build(sec.plane, sec.caps, () => true, () => []);
    return out;
  }

  /**
   * 잘린 면 채우기(스텐실 홀짝). 단위마다: 화면 사각형만 스텐실을 비우고 → 그 평면 하나로만 자른 그물(들)을 색·깊이 없이 뒤집어 그리고(INVERT) →
   * 스텐실이 1인 곳에 평면 ∩ 범위 다각형을 칠한다(여러 평면이면 다른 평면들로 다각형을 자른다). 닫힌 그물이면 1인 화소는 평면 위 입체 안쪽뿐이다.
   */
  private drawCaps(
    f: ViewFrame,
    devW: number,
    devH: number,
    units: readonly CapUnit[],
    multi: SectionsDraw | null,
    st: RenderState,
    stats: RenderStats,
    meshUse: (p: Prog) => void,
    meshDraw: (r: MeshRec, matrix: ArrayLike<number> | undefined, color: Rgba, alpha: number, tint: number, cull: boolean, list?: DrawList | null) => void,
    current: () => Prog,
    lists: (r: MeshRec) => [DrawList, DrawList] | null,
    setCapPlane: (p: Plane4 | null) => void,
    modelOf: (r: MeshRec) => ArrayLike<number> | undefined,
    plainP: Prog,
  ): void {
    const gl = this.gl;
    const clipP = this.meshClip();
    const secColor = multi ? multi.color : st.section!.color;
    gl.enable(gl.STENCIL_TEST);
    gl.enable(gl.SCISSOR_TEST);
    gl.stencilMask(0xff);
    const ortho = f.projection === 'orthographic' ? 1 : 0;
    for (const u of units) {
      const poly = planeBoxPolygon(u.box, u.plane);
      if (poly.length < 3 || poly.length > CAP_MAX_VERTS) continue;
      const rect = this.screenRect(f, u.box, devW, devH);
      if (!rect) continue;
      gl.scissor(rect.x, rect.y, rect.w, rect.h);
      gl.clear(gl.STENCIL_BUFFER_BIT);
      // 홀짝: 남은 그물 조각 수
      gl.colorMask(false, false, false, false);
      gl.depthMask(false);
      gl.disable(gl.DEPTH_TEST);
      gl.stencilFunc(gl.ALWAYS, 0, 1);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
      if (multi) setCapPlane(u.plane);
      if (current() !== clipP) meshUse(clipP);
      // 화면에 보이는 그리기가 아니므로 통계에서 뺀다
      const dc = stats.drawCalls, tr = stats.triangles;
      for (const r of u.meshes) {
        const L = lists(r);
        if (!L) meshDraw(r, modelOf(r), r.src.color, 1, 0, false);
        else for (const l of L) meshDraw(r, modelOf(r), r.src.color, 1, 0, false, l);
      }
      stats.drawCalls = dc;
      stats.triangles = tr;
      if (multi) setCapPlane(null);
      // 채우기: 평면 다각형(가운데 기준 좌표 + 이동 행렬 — 큰 좌표에서도 정밀)
      gl.colorMask(true, true, true, true);
      gl.depthMask(true);
      gl.enable(gl.DEPTH_TEST);
      gl.stencilFunc(gl.EQUAL, 1, 1);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 1);
      const c: V3 = [0, 0, 0];
      for (const q of poly) for (let k = 0; k < 3; k++) c[k] += q[k]! / poly.length;
      const d = this.capData;
      poly.forEach((q, i) => {
        d[i * 3] = q[0] - c[0];
        d[i * 3 + 1] = q[1] - c[1];
        d[i * 3 + 2] = q[2] - c[2];
      });
      gl.bindBuffer(gl.ARRAY_BUFFER, this.capBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, d, 0, poly.length * 3);
      meshUse(plainP);
      gl.uniform1f(this.loc(plainP, 'u_ortho'), ortho);
      const T = translation(c);
      const mv = mat4Mul(f.view, T, this.d4a);
      this.m4a.set(mat4Mul(f.proj, mv, this.d4b));
      this.m4b.set(mv);
      normalMatrix(mv, this.m3);
      gl.uniformMatrix4fv(this.loc(plainP, 'u_mvp'), false, this.m4a);
      gl.uniformMatrix4fv(this.loc(plainP, 'u_mv'), false, this.m4b);
      gl.uniformMatrix3fv(this.loc(plainP, 'u_nmat'), false, this.m3);
      if (multi) this.setClips(plainP, u.others.map((q) => planeToLocal(q, T)));
      const mc = u.color, sc = secColor;
      const k = 0.25;
      gl.uniform4f(this.loc(plainP, 'u_color'), mc[0] + (sc[0] - mc[0]) * k, mc[1] + (sc[1] - mc[1]) * k, mc[2] + (sc[2] - mc[2]) * k, 1);
      gl.uniform1f(this.loc(plainP, 'u_vcol'), 0);
      gl.uniform1f(this.loc(plainP, 'u_hasNrm'), 0);
      const hi = u.meshes.some((r) => st.highlight.has(r.src.id)) ? 0.5 : 0;
      const ht = st.colors.highlight;
      gl.uniform4f(this.loc(plainP, 'u_tint'), ht[0], ht[1], ht[2], hi);
      gl.uniform1f(this.loc(plainP, 'u_alpha'), 1);
      gl.bindVertexArray(this.capVao);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, poly.length);
      stats.drawCalls++;
      gl.disable(gl.POLYGON_OFFSET_FILL);
      // 다음 그물의 홀짝 그리기를 위해 프로그램 캐시를 다시 잡는다
      meshUse(clipP);
    }
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.colorMask(true, true, true, true);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);
  }

  /** 선분 묶음 그리기(굵기·점선이면 사각형 인스턴스, 아니면 gl.LINES). clip은 묶음 로컬 좌표의 단면 평면 */
  private drawLines(
    f: ViewFrame,
    r: LineRec,
    matrix: ArrayLike<number> | undefined,
    o: { color: Rgba; vcol: boolean; width: number; dashed: boolean; alpha: number; first: number; count: number; bias?: number; clip?: Plane4 | null; clips?: Plane4[] | null; noFog?: boolean; capz?: boolean },
    st: RenderState,
    stats: RenderStats,
  ): void {
    const gl = this.gl;
    if (o.count <= 0) return;
    const clips = o.clips ?? null;
    const mvp = this.m4a;
    mvp.set(matrix ? mat4Mul(f.viewProj, matrix, this.d4a) : f.viewProj);
    const wDev = o.width * st.dpr;
    const fast = st.interacting && r.n > FAST_LINES_WHILE_MOVING;
    const wide = !fast && (o.dashed || wDev > 1.01);
    const clip = o.clip ?? null;
    const fog = !o.noFog && st.fog ? st.fog : null;
    if (wide) {
      const p = o.capz
        ? this.variant('wide', ['CAPZ', ...(fog ? ['FOG'] : []), ...(clips ? ['CLIPN'] : [])])
        : fog
          ? this.variant('wide', ['FOG', ...(clips ? ['CLIPN'] : [])])
          : clips
            ? this.variant('wide', ['CLIPN'])
            : this.wideP;
      gl.useProgram(p.p);
      if (clips) this.setClips(p, clips);
      if (fog) this.setLineFog(p, f, matrix, fog);
      gl.uniformMatrix4fv(this.loc(p, 'u_mvp'), false, mvp);
      if (st.viewport) gl.uniform2f(this.loc(p, 'u_viewport'), st.viewport[0], st.viewport[1]);
      else gl.uniform2f(this.loc(p, 'u_viewport'), gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(this.loc(p, 'u_width'), wDev);
      gl.uniform4f(this.loc(p, 'u_color'), o.color[0], o.color[1], o.color[2], o.color[3]);
      gl.uniform1f(this.loc(p, 'u_vcol'), o.vcol ? 1 : 0);
      gl.uniform1f(this.loc(p, 'u_alpha'), o.alpha);
      gl.uniform4f(this.loc(p, 'u_override'), 0, 0, 0, 0);
      gl.uniform1f(this.loc(p, 'u_bias'), o.bias ?? 0);
      gl.uniform2f(this.loc(p, 'u_dash'), o.dashed ? DASH[0] * st.dpr : 0, DASH[1] * st.dpr);
      const k = clip ?? NO_CLIP;
      gl.uniform4f(this.loc(p, 'u_clip'), k[0], k[1], k[2], k[3]);
      gl.bindVertexArray(r.wide);
      if (o.first) this.bindWide(r.pos, r.col, o.first);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, o.count);
      if (o.first) this.bindWide(r.pos, r.col, 0);
    } else {
      const p = fog
        ? this.variant('thin', ['FOG', ...(clips ? ['CLIPN'] : clip ? ['CLIP'] : [])])
        : clips
          ? this.variant('thin', ['CLIPN'])
          : clip
            ? this.thinClip()
            : this.thinP;
      gl.useProgram(p.p);
      if (clips) this.setClips(p, clips);
      if (fog) this.setLineFog(p, f, matrix, fog);
      gl.uniformMatrix4fv(this.loc(p, 'u_mvp'), false, mvp);
      gl.uniform4f(this.loc(p, 'u_color'), o.color[0], o.color[1], o.color[2], o.color[3]);
      gl.uniform1f(this.loc(p, 'u_vcol'), o.vcol ? 1 : 0);
      gl.uniform1f(this.loc(p, 'u_alpha'), o.alpha);
      gl.uniform4f(this.loc(p, 'u_override'), 0, 0, 0, 0);
      gl.uniform1f(this.loc(p, 'u_bias'), o.bias ?? 0);
      if (clip) gl.uniform4f(this.loc(p, 'u_clip'), clip[0], clip[1], clip[2], clip[3]);
      gl.bindVertexArray(r.thin);
      gl.drawArrays(gl.LINES, o.first * 2, o.count * 2);
    }
    stats.drawCalls++;
    stats.segments += o.count;
  }
}
