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
 *
 * 0.25.0 올린 뒤 성분 기억: 그물 기록이 정점 속성 버퍼(법선 유무, 앞·뒷면 무늬 좌표 값 수 2·3)와 쓰는 버퍼 자리를 기억해,
 * 장면을 다시 맞출 때(무늬 쓰임 셈·그물 기록 다시 만들기·구간 VAO 묶기) Mesh3d.normals·uvs·backUvs 배열과 그 길이를 다시 보지 않는다.
 * 버퍼 표·쓰는 기록 수는 배열과 무관한 열쇠(BufKey)로 두고, 배열 → 열쇠는 약한 표(같은 배열은 한 번만 올리되 배열을 붙잡지 않는다).
 * 놓기(release): 켠 배열·무늬 원본은 올린 뒤 장면 객체에서 지운다(strip). 문맥을 잃었다 되찾으면 지운 것 없이 위치·색으로 다시 올리고,
 * 앱이 restoreMeshArrays·restoreTexture로 다시 준 것부터 되돌린다(restoreNeed — 계산은 release.ts)
 *
 * 0.26.0 작은 법선·무늬 좌표: 법선 Int8·Int16, 무늬 좌표 Int16·Uint16 배열을 그대로 버퍼에 올리고 정점 속성 꼴(BYTE·SHORT·UNSIGNED_SHORT, normalized)로 읽는다
 * (꼴 판정은 attribs.ts). 그물 기록이 속성 꼴을 기억해 다시 묶을 때도 배열을 보지 않는다. 무늬 좌표 축척·이동(uvTransform)은 그물마다 균일 변수 u_uvt·u_uvt2.
 * Float32 배열은 0.25.0과 같은 속성 꼴로 올린다(변환이 없으면 u_uvt = (1, 1, 0, 0) — 곱하고 더해도 값이 그대로다)
 *
 * 0.28.0 GPU 버퍼 바이트: 버퍼는 모두 newBuffer로 만들고 dropBuffer로 지워 살아 있는 버퍼마다 성분(GpuBufferPart)과 bufferData로 잡은 크기를 적는다
 * (bufferStats — 나눠 올리기는 크기를 잡을 때 적고 그 배열의 성분으로 바꾼다, 문맥을 잃으면 비운다). GL 부르는 차례는 예전과 같다
 *
 * 0.43.0 PBR 그림: 그물 기록이 PBR 필드(pbr.ts PbrSource)를 기억하고, 그 그림 id도 무늬 표(textures)에 들어 무늬 그림과 같은 길(예산·놓기·pending·복구)로 올린다.
 * 그리기마다 올라간 그림으로 상태(pbrState)를 정해 셰이더 변종(UV·NMAP·PBR)과 무늬 단위 6·7·8(없는 쪽은 흰 1화소 그림)을 건다. PBR 필드가 없는 그물은 늘 0.42.0 길이다.
 * 인스턴싱(0.42.0)은 그림자·단면 하나일 때도 면을 모은다 — 자리 자료에 그림자 행렬·로컬 평면을 더 쓴다(instMeshes)
 *
 * 0.44.0 묶음 안 구간 단면: 뷰어가 묶음 안 구간(ItemParts.prims·edges)에 그 구간만 더 자르는 평면 비트(RangePart.cut)를 붙여 넘긴다.
 * 그리기는 갈래(cut 값)마다 묶음 평면(SectionsDraw.of) ∪ 갈래 비트 평면을 u_clips로 올리고 그 갈래 구간만 그린다(면·깊이 그림·삼각형 변·윤곽선·
 * 숨은 점선·선분·점 — 구간이 24개를 넘으면 0.7.0처럼 모은 색인·복사본). 잘린 면 채우기는 갈래마다 단위(그 갈래 삼각형만 홀짝, 범위는 그 갈래 정점).
 * 갈래가 없는 묶음(cut이 모두 0)은 0.43.0 길 그대로다
 *
 * 0.52.0 묶어 그리기(merging — 기본 'auto', 계산은 merge.ts): 같은 꼴(법선 값 꼴·정점 색 유무·한쪽 면)의 작은 정적 그물(배열을 다른 그물과 함께 쓰지 않는 것)을
 * 장면 차례로 묶음 버퍼에 잇고(정점마다 묶음 안 그물 번호) **그물 버퍼·VAO는 놓는다** — 묶음 버퍼가 그 그물의 저장소가 되어(그물 기록은 묶음 VAO와 그 색인 구간·윤곽선 구간을 가리킨다)
 * 그물마다 그리는 길(강조 윤곽선·구간·단면·그림자·반투명·잘린 면 채우기)도 같은 정점·같은 색인 차례로 그린다. 'auto'는 묶을 수 있는 그물이 문턱(MERGE_AUTO_MIN) 이상인 장면만 켜고
 * 올리는 걸음 안에서 굽는다(그물이 아주 많아도 GL 객체가 쌓이지 않게). 그릴 때는 그물마다 그리던 자리에서 잇단 묶음 그물을 구간 하나로 모아 MERGE 변종(INST 꼴 자리 자료 — 행렬·색)으로 그린다.
 * 그물마다 그리기와 묶음 구간을 장면 차례 한 목록에 모아 자리 자료를 한 번 올린 뒤 차례대로 그린다. 바꾼·뺀 그물은 묶음에서 빠지고(몫이 크면 남은 그물로 다시 굽는다), 끄면 그물마다 버퍼로 되돌린다.
 * 0.53.0 다시 굽기는 장면 차례 토막으로(조각 planLoose —바꾼·새 그물을 이웃 묶음과 함께 굽기 단위로 고르게 나눠 묶음이 엇갈리지 않게).
 * 면은 단면 하나·그림자에서도 묶음 구간으로 그린다(자리 자료에 로컬 평면·그림자 행렬 — 인스턴싱과 같다). 단면이 있을 때의 선과 여러 단면은 그물마다(묶음 자리로)
 * 0.54.0 묶음 굽기·다시 굽기 차례·이은 배열·자리 자료·MERGE 셰이더 글은 나눠 받는 조각(mergegl.ts·merge.ts — loadMergeKit의 import())으로 옮겼다(SKP 57차 — 문턱을 넘지 않는
 * 앱은 받지 않는다). 렌더러는 묶을 수 있는지 판단·굽기 기다림·그리기 구간 모으기만 두고, 조각이 오기 전에는 그물마다 그린다(그림이 같다). 나눠 올리기에서는 장면 훑기
 * (함께 쓰는 배열 적기·묶을 수 있는 그물 세기)와 굽기를 첫 그림 뒤로 미루고, 굽지 못한 그물이 굽기 단위에 닿으면 그 걸음을 멈춘다(GL 객체가 쌓이는 한도는 0.53.0과 같다)
 * 0.55.0 조각 받기가 MERGE_KIT_WAIT_MS 안에 끝나지 않으면 그 페이지는 기다리지 않고 그물마다 이어 올린다(나중에 오면 그때부터 굽는다). 'auto'는 묶을 수 있는 그물을
 * 세어 문턱에 닿은 장면에서만 받기를 건다(0.54.0은 장면 그물 수만 보고 걸었다 — 무늬·함께 쓰는 배열 장면도 받았다)
 */
import type { Box3, LineSet3d, Mesh3d, PointSet3d, Rgba, Scene3d, Texture3d, UvTransform } from './types';
import { type AttribFormat, type VertexArray, normalFormat, uvFormat, uvTransformOf } from './attribs';
import { type ViewFrame, viewMatrix } from './camera';
import type { GridLines } from './grid';
import { type MarkerKind, markerMesh } from './marker';
import { type V3, cross, hasOrigin, mat4Invert, mat4Mul, modelMatrix, normalMatrix, normalize, orthographic, translation } from './math';
import { boxCenter, boxIsEmpty, boxSphere, meshBounds, offsetBox, positionsBox, rangesBox, transformBox, unionBox } from './bounds';
import { type CullBox, cullBox, cullOut, cullPlanes, cullSide, cullUnion, segmentsBox } from './cull';
import {
  AO_BLUR_FS,
  AO_FS,
  AO_MIX_FS,
  DEPTH_FS,
  DEPTH_VS,
  FULL_VS,
  MESH_FS,
  MESH_VS,
  POINT_FS,
  POINT_VS,
  PROFILE_FS,
  SKY_FS,
  THIN_FS,
  THIN_VS,
  WIDE_FS,
  WIDE_VS,
  withClip,
  withDefines,
} from './shaders';
import {
  MERGE_AUTO_MIN,
  MERGE_KIT_WAIT_MS,
  MERGE_MESH_SEGMENTS,
  MERGE_MESH_VERTS,
  MERGE_UPLOAD_MESHES,
  MERGE_UPLOAD_VERTS,
  type MergingOptions,
  MERGE_FIRST_MESHES,
  MERGE_SCAN_FIRST,
} from './mergeopts';
// 0.54.0: 묶음 나누기·굽기(merge.ts·mergegl.ts)는 값으로 가져오지 않는다 — 묶어 그리기를 켤 장면에서만 import()로 받는 조각(loadMergeKit)
import type { MergeSrc } from './merge';
import type { MergeDrawCtx, MergeHost, MergeOp, MergeSlots, MergeStore } from './mergegl';
import { AO_MAX_PIXELS, type AoParams, aoSize } from './ao';
import { segmentFix, triangleFix } from './sceneissues';
import { TEXTURE_BUDGET, TEXTURE_LIMIT, decodeTexture, textureSides, uvComponents } from './texture';
import { contrastLineColor } from './theme';
import { type BufferSink, type BufferTarget, CHUNK_BYTES, CHUNK_MIN_BYTES, ChunkedUpload, type UploadArray, newArrays } from './upload';
import { MAX_SECTION_PLANES, NO_CLIP, type Plane4, boxStraddles, planeBoxPolygon, planeToLocal } from './section';
import { type IndexRange, type RangePart, clipRanges, compactStride, compactTriIndices, countBelow, cutBits, partCuts, partsOf, rangesTotal } from './ranges';
import { type MeshArrays, type MeshLayout, type MeshMiss, type ReleaseFlags, type RestoreNeed, arraysMiss, layoutMiss, takeArrays } from './release';
import { type PbrSource, type PbrState, pbrDefines, pbrNeedsUv, pbrSource, pbrState, pbrTextureIds } from './pbr';

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
  /** 0.44.0: 구간 단면이 있으면 구간마다 cut(그 구간만 더 자르는 평면 비트 — SectionsDraw.planes 번호) */
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
  /**
   * 0.60.0 visible의 판: 숨김(항목·묶음)이 바뀔 때마다 달라지는 수. 주면 장면 차례가 그대로인 동안 같은 판의 보이는 목록을 프레임을 넘어 다시 쓴다
   * (주지 않으면 0.59.0처럼 그리기마다 그물마다 묻는다)
   */
  visKey?: number;
  /**
   * 0.63.0 숨김 판 since 뒤로 보이는지가 바뀌었을 수 있는 항목 id(그 차례 — 같은 id가 거듭 들 수 있다). 모르면 null(묶음 숨김·장면 바꾸기 등 — 렌더러는 처음부터 만든다).
   * 주면 판이 바뀐 그리기에서 그 그물만 보이는 목록을 고친다
   */
  visDelta?: (since: number) => readonly string[] | null;
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
  /** 0.49.0 주변 가림(SSAO): 가림 거리(세계 단위)·세기. 음영 계열(숨은 선 빼고)에서 불투명 면을 그린 뒤 곱한다. 없으면 0.48.0과 같은 GL 호출 */
  ao?: AoParams | null;
}

export interface RenderStats {
  drawCalls: number;
  triangles: number;
  segments: number;
  points: number;
  /** 0.51.0 화면 밖으로 잘라내 그리지 않은 그물 수(보이는 그물 가운데 — 잘라내기를 끄면 0) */
  culled: number;
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
  /** 0.25.0: 코어가 원본을 놓은 뒤 문맥을 잃어 앱이 다시 줄 때까지 기다리는 수(그물은 color로 칠한다) */
  missing: number;
}

/**
 * GPU 버퍼 성분(0.28.0, GpuBufferStats): 장면 그물의 위치·법선·정점 색·앞면 무늬 좌표·따로 준 뒷면 무늬 좌표(backUvs)·색인·윤곽선(Mesh3d.edges),
 * 선분 묶음의 위치·정점 색, 점 묶음 위치, 코어가 만든 와이어프레임 색인(삼각형 변)·구간 숨김·강조의 모은 자료(ranges),
 * 장면 밖 덧그림(격자·표시 그물·강조 선분·단면 테두리·앱 측정 덧그림 선·공용 사각형·잘린 면 다각형 — overlay)
 */
export type GpuBufferPart =
  | 'positions'
  | 'normals'
  | 'colors'
  | 'uvs'
  | 'backUvs'
  | 'indices'
  | 'edges'
  | 'lines'
  | 'lineColors'
  | 'points'
  | 'wireframe'
  | 'ranges'
  | 'overlay';

const GPU_BUFFER_PARTS: readonly GpuBufferPart[] = ['positions', 'normals', 'colors', 'uvs', 'backUvs', 'indices', 'edges', 'lines', 'lineColors', 'points', 'wireframe', 'ranges', 'overlay'];

/**
 * GPU 버퍼 바이트(0.28.0, Viewer3d.stats.buffers): 지금 살아 있는 버퍼마다 bufferData로 잡은 크기를 성분별로 더한 값(바이트)과 그 합(bytes)·버퍼 수(count).
 * 같은 배열은 한 번만 올리므로(같은 배열을 여러 그물·자리가 쓰면) 처음 올린 성분으로 한 번만 센다 — 뒷면이 uvs를 함께 쓰면 uvs에만 든다.
 * 놓기(release)는 GPU 버퍼를 지우지 않으므로 그대로이고, 작은 정수 배열은 그 바이트(Int8 법선 4값 = 정점마다 4바이트), 나눠 올리기는 크기를 잡는 순간부터 센다.
 * 문맥을 잃으면 0(덧그림 포함)이고 되찾으면 다시 올린 것만 센다. 무늬 그림은 textures.bytes(어림)
 */
export interface GpuBufferStats extends Record<GpuBufferPart, number> {
  bytes: number;
  count: number;
}

/** 한 번에 풀어 두는 무늬 수(풀린 그림이 한꺼번에 메모리에 쌓이지 않게) */
const TEXTURE_DECODES = 4;

interface TexRec {
  src: Texture3d;
  /** 긴 변 한도(화소) */
  side: number;
  tex: WebGLTexture | null;
  /** missing(0.25.0) = 코어가 원본을 놓은 무늬를 다시 올려야 하는데 앱이 아직 주지 않음, restoring = 앱이 다시 준 원본을 푸는 중(restoreTexture) */
  state: 'queued' | 'decoding' | 'ready' | 'failed' | 'missing' | 'restoring';
  bytes: number;
}

/** 앱이 다시 주는 무늬 원본(0.25.0 — Viewer3d.restoreTexture): 그림 파일 바이트, 푼 그림, 또는 Texture3d와 같은 꼴 */
export type TextureSource = Uint8Array | ImageBitmap | Pick<Texture3d, 'data' | 'bitmap' | 'mime' | 'width' | 'height'>;

/**
 * GPU 버퍼 열쇠(0.25.0): 배열과 무관한 객체. 같은 배열 객체는 같은 열쇠다(배열 → 열쇠는 약한 표라 배열을 붙잡지 않는다).
 * bytes는 처음 올린 바이트 수(그물을 바꿀 때 버퍼를 물려받을지 — 배열을 지운 뒤에도 안다)
 */
interface BufKey {
  readonly bytes: number;
}

/** 그물 기록이 쓰는 버퍼 자리 하나(0.25.0): 열쇠·대상·정점당 값 수(정점 속성이 아니면 0) */
interface Slot {
  key: BufKey;
  target: BufferTarget;
  stride: number;
}

/** 그물 기록의 버퍼 자리 차례(uploadArrays와 같다): 위치 0·법선 1·색 2·무늬 좌표 3·뒷면 무늬 좌표 4·색인 5·윤곽선 6 */
const SLOT_NORMALS = 1, SLOT_UV = 3, SLOT_BUV = 4;
/** 묶음 하나가 올리는 배열 하나(uploadArrays): 배열·대상·0.28.0 성분 */
interface UploadEntry {
  data: UploadArray;
  target: BufferTarget;
  part: GpuBufferPart;
}

/** 0.28.0 그물 버퍼 자리(SLOT 차례)의 GPU 버퍼 성분 */
const SLOT_PARTS: readonly GpuBufferPart[] = ['positions', 'normals', 'colors', 'uvs', 'backUvs', 'indices', 'edges'];

/** 그물 정점 속성 버퍼(0.25.0): 기록이 기억해 두고 배열을 다시 보지 않고 VAO를 묶는다 */
export interface MeshAttribs {
  pos: WebGLBuffer;
  nrm: WebGLBuffer | null;
  col: WebGLBuffer | null;
  /** 앞면 무늬 좌표(Mesh3d.texture가 있을 때만 올린다)와 정점당 값 수 */
  uv: WebGLBuffer | null;
  uvN: 0 | 2 | 3;
  /** 뒷면 무늬 좌표(backUvs, 없으면 uvs — Mesh3d.backTexture가 있을 때만)와 정점당 값 수 */
  buv: WebGLBuffer | null;
  buvN: 0 | 2 | 3;
  /** 0.26.0 법선·앞·뒷면 무늬 좌표의 속성 꼴(그 버퍼가 없으면 null — Float32면 0.25.0과 같은 FLOAT 꼴) */
  nrmF: AttribFormat | null;
  uvF: AttribFormat | null;
  buvF: AttribFormat | null;
}

/** 음영 계열 뒤 모서리 점선(0.8.0)을 눈 쪽으로 당기는 깊이 치우침(클립 z에서 w에 곱한다 — 반올림 차이만 덮는 크기) */
const BACK_EDGE_BIAS = 2e-6;

/** 끄는 동안 이보다 많은 선분 묶음은 gl.LINES(1화소)로 그린다 */
export const FAST_LINES_WHILE_MOVING = 400_000;

export interface Prog {
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
  /** 0.42.0 인스턴싱 변종(INST — 자리 행렬을 자리 자료 그림에서 읽는다) */
  inst?: boolean;
  /** 0.43.0 PBR 그림 변종: UV(무늬 그림 없이 무늬 좌표)·NMAP(법선 그림)·PBR(거칠기·금속성) */
  uv?: boolean;
  nmap?: boolean;
  pbr?: boolean;
  /** 0.52.0 묶어 그리기 변종(MERGE — INST 글에서 자리 번호를 정점 속성 a_item으로, 색도 자리 자료에서) */
  merge?: boolean;
}

/** 겉모습 행렬을 합친 모형 행렬 캐시(행렬·원래 모형이 같으면 다시 쓴다 — 균일 변수 캐시가 같은 객체로 알아보게) */
interface LookCache {
  src: ArrayLike<number>;
  base: ArrayLike<number> | undefined;
  model: ArrayLike<number>;
  box?: Box3;
  center?: V3;
}

export interface LineRec {
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
  /** 0.52.0 묶음 저장소의 윤곽선이면 묶음 선분 버퍼 안 이 그물 선분의 시작(선분 수 — 그릴 때 first에 더한다) */
  first?: number;
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
  /** 0.44.0 구간 단면 갈래 값들(partCuts — 처음 필요할 때). 0 하나뿐이면 null(0.43.0 길) */
  cuts?: number[] | null;
  /** 0.44.0 갈래마다 그 구간 정점의 범위(그물 positions 좌표 + 묶음 원점·matrix — 잘린 면 채우기 단위 범위) */
  cutBoxes?: Map<number, Box3>;
}

/** 0.44.0 구간 단면 갈래 하나의 그릴 목록(보통·강조) */
interface CutLists {
  cut: number;
  n: DrawList;
  h: DrawList;
}

/** 0.44.0 구간 목록의 구간 단면 갈래(0 하나뿐이면 null — 갈래가 없는 묶음은 0.43.0 길 그대로). 구간 캐시에 기억한다 */
function cacheCuts(c: PartCache, parts: readonly RangePart[]): number[] | null {
  if (c.cuts === undefined) {
    const k = parts.some((p) => !!p.cut) ? partCuts(parts) : null;
    c.cuts = k;
  }
  return c.cuts;
}

/** 구간이 이보다 많으면 모은 자료(색인·복사본)를 만들어 그리기 한 번으로 그린다 */
const RUN_LIMIT = 24;

/** 0.51.0 화면 밖 잘라내기 덩어리 하나의 그물 수(장면 차례 — 감싸는 상자가 확실히 안·바깥이면 그물마다 보지 않는다) */
const CULL_CHUNK = 64;

export interface MeshRec {
  lookM?: LookCache;
  src: Mesh3d;
  vao: WebGLVertexArrayObject;
  count: number;
  indexed: boolean;
  /** 0.50.0 깨진 삼각형을 넓이 0으로 바꾼 색인 사본(sceneissues.triangleFix — 그릴 때·와이어·구간 모으기에 src.indices 대신). 멀쩡하면 null */
  tri: Uint32Array | null;
  hasNormals: boolean;
  hasColors: boolean;
  /** 무늬 좌표 정점당 값 수(0 = 무늬 없음) */
  uv: 0 | 2 | 3;
  /** 무늬 그림 id(uv가 있고 장면에 그 그림이 있을 때) */
  tex: string | null;
  /** 무늬 그림의 알파를 불투명도에 곱하는지(Texture3d.alpha — 반투명 차례에 그린다) */
  texAlpha: boolean;
  /** 0.26.0 무늬 좌표 축척·이동(Mesh3d.uvTransform — 없으면 null = (1, 1, 0, 0)) */
  uvT: UvTransform | null;
  transparent: boolean;
  /** 뒷면(Mesh3d.backColor·backTexture): 색(없으면 null)·뒷면 무늬 id·좌표 값 수·무늬 알파·0.26.0 좌표 축척·이동(따로 준 backUvs면 backUvTransform, uvs를 함께 쓰면 uvTransform) */
  back: { color: Rgba | null; tex: string | null; uv: 0 | 2 | 3; texAlpha: boolean; uvT: UvTransform | null } | null;
  /** 로컬 → 세계 = matrix · T(origin)(원점이 없으면 matrix 그대로, 둘 다 없으면 undefined) */
  model: ArrayLike<number> | undefined;
  /** 세계 범위(행렬·원점 반영) */
  box: Box3;
  /** 세계 좌표 범위의 가운데(반투명 정렬용) */
  center: V3;
  /** 0.51.0 화면 밖 잘라내기 로컬 범위(positions와 윤곽선 끝점 — 원점·행렬 전, 깨진 값은 뺀다). 처음 쓸 때 cull(모형 행렬로 옮긴 잘라내기 자료)을 만든다 */
  local: Box3;
  cull?: CullBox | null;
  /** 0.51.0 이 그리기 번호(Renderer3d.frameNo)에서 화면 밖으로 잘라냈으면 그 번호 */
  culledAt?: number;
  /** 0.51.0 이 그리기 번호에서 보이는 그물이면 그 번호(덩어리 잘라내기가 보이는 그물만 센다). 0.60.0 보이는 목록을 만든 번호(Renderer3d.visSeq — 숨김이 그대로면 프레임을 넘어 같다) */
  visAt?: number;
  /** 0.60.0 그리기 뼈대(MergeOrder)에서 든 덩이 번호(묶음 밖 −1 — 뼈대를 만들 때 meshes의 모든 기록에 적는다) */
  bk?: number;
  /** 0.63.0 뼈대의 장면 차례 번호(MergeOrder.si를 만들 때 적는다 — 보이는 목록에 넣고 뺄 자리) */
  si?: number;
  edges: LineRec | null;
  /** 삼각형 변 그리기(와이어프레임) — idx는 이 기록만의 색인 배열(그물을 바꿀 때 색인이 같으면 넘겨 쓰고, 아니면 지운다) */
  wire: { vao: WebGLVertexArrayObject; count: number; idx: Uint32Array } | null;
  parts?: PartCache;
  /** 0.25.0 정점 속성 버퍼(다시 묶을 때 배열을 보지 않는다) */
  attrs: MeshAttribs;
  /** 0.25.0 이 기록이 쓰는 버퍼 자리(SLOT 차례 — 쓰는 기록 수 세기·버퍼 물려받기를 배열 없이 한다) */
  slots: (Slot | null)[];
  /** 0.25.0 코어가 배열을 지운(또는 올린 뒤 지울) 그물이면 그 꼴 */
  lay: MeshLayout | null;
  /** 0.25.0 지운 배열 가운데 지금 GPU에 없는 것(문맥 복구 뒤 앱이 다시 줄 때까지 — 다 있으면 null) */
  miss: MeshMiss | null;
  /**
   * 0.42.0 같은 그물 열쇠: 정점 속성·색인 버퍼와 그 꼴·그릴 수·무늬·무늬 좌표 축척·한쪽 면이 모두 같은 기록끼리 같다(자리 행렬·색·id만 다른 같은 정의의 자리).
   * 인스턴싱은 이 열쇠로 모아 기록 하나의 VAO로 자리 여럿을 그린다
   */
  geo: string;
  /** 0.43.0 PBR 필드(법선·거칠기·금속 그림 id와 값 — 없으면 null = 0.42.0 그물). 무늬 좌표는 attrs.uv·uvT를 함께 쓴다 */
  pbr: PbrSource | null;
  /**
   * 0.52.0 이 그물이 든 묶음(구운 것 — 그물의 GPU 저장소)과 그 안 번호(없으면 그물마다 버퍼). 묶음에 들면 vao·attrs·edges는 묶음 것을 가리키고 그물 버퍼는 없다(slots 빈 목록)
   */
  mg?: MergeGroup | null;
  mi?: number;
  /** 0.52.0 묶음 색인 버퍼 안 이 그물 색인의 시작(색인 수 — 그물마다 그리기의 drawElements 시작)과 묶음 정점 시작(구간 모음·삼각형 변 색인을 묶음 정점으로 옮길 때) */
  first?: number;
  vbase?: number;
  /** 0.52.0 장면에서 빠진(바꾸거나 뺀) 기록이면 true(굽기를 기다리던 묶음에서 뺀다) */
  dropped?: boolean;
  /**
   * 0.57.0 아직 GL 객체가 없는 기록(곧장 구울 그물 — 조각 direct): vao·attrs의 버퍼 자리는 NO_GL 자리표다. 한 동기 구간(uploadWhole·조각 run) 안에서만 있고
   * 구워지면(조각 attach) 묶음 저장소를, 굽기에 못 들면 그 자리에서 그물 버퍼를(조각 solid) 갖는다 — 그리기·고르기·setMesh는 이 상태를 보지 못한다
   */
  light?: boolean;
}

/** 0.57.0 빛 기록(MeshRec.light)의 GL 객체 자리표(GL에 넘기지 않는다 — 있다/없다 판정만) */
const NO_GL = Object.freeze({}) as WebGLBuffer & WebGLVertexArrayObject;

/**
 * 0.52.0 묶음 하나(구운 것): 그물 기록(장면 차례 — 번호 = 정점 a_item), 면 VAO(위치 0·법선 1·색 2·그물 번호 5·이은 색인)와 그물마다 색인 시작,
 * 윤곽선 VAO(가는 선 — 위치 0·그물 번호 5, 굵은 선 — 모서리 0·끝점 1·2·그물 번호 5)와 그물마다 선분 시작, 버퍼·바이트, 빠진(바꾼·뺀) 그물 수
 */
export interface MergeGroup {
  recs: MeshRec[];
  vao: WebGLVertexArrayObject;
  tri: Uint32Array;
  vStart: Uint32Array;
  thin: WebGLVertexArrayObject | null;
  wide: WebGLVertexArrayObject | null;
  seg: Uint32Array;
  segBuf: WebGLBuffer | null;
  segItem: WebGLBuffer | null;
  /** 그물 기록이 가리키는 정점 속성(그물마다 그리기·구간 모음·삼각형 변) */
  attrs: MeshAttribs;
  /** 0.63.0 이은 색인 버퍼(같은 꼴 그물 바꾸기가 그 그물 자리 색인을 다시 쓴다 — bufs에도 든다) */
  ib: WebGLBuffer;
  bufs: WebGLBuffer[];
  bytes: number;
  dead: number;
  /** 이 묶음을 저장소로 쓰는 그물 기록 수(0이 되면 버퍼·VAO를 지운다) */
  live: number;
  /** 빠진 몫이 커서 남은 그물을 새 묶음으로 옮기는 중 */
  rebuild: boolean;
  hasNormals: boolean;
  hasColors: boolean;
  /** 한쪽 면(Mesh3d.doubleSided === false — 뒷면 버리기) */
  cull: boolean;
  /** 0.53.0 묶음 열쇠(법선 값 꼴·한쪽 면 — 같은 열쇠의 장면 차례 줄에서 다시 굽기 차례를 정한다) */
  key: string;
  /** 0.53.0 다시 굽기 차례를 정할 때 쓰는 셈(조각 planLoose가 그때마다 새로 채운다) */
  plan?: MergePlanStat;
  /**
   * 0.60.0 프레임마다 다시 쓰는 그물 값(처음 쓸 때 만든다 — 묶음의 그물 기록·모형 행렬·색 배열은 묶음이 사는 동안 그대로):
   * 그물마다 모형 3열(이동뿐인 모형만 — sft 1), 면 색(Mesh3d.color 배열 그대로)·정점 색 쓰기, 정점 색 끔, 한 색 목록(쓰는 곳마다 마지막 값)
   */
  org?: Float64Array;
  sft?: Uint8Array;
  /** 0.62.0 그물 모형이 모두 이동뿐인지(sft 1·2이거나 모형이 없다 — nom. 겉모습이 없으면 자리 자료를 MSHIFT 꼴로: 면 3·선 2텍셀) */
  mov?: boolean;
  nom?: Uint8Array;
  fc?: { cols: Rgba[]; vc: boolean[] };
  nv?: boolean[];
  cc?: Record<string, { k: string; cols: Rgba[] }>;
  /** 0.61.0 자리 자료 저장소의 이 묶음 자리(종류 f·e·d마다 — 조각 mergegl) */
  ps?: Record<string, MergeSlots>;
}

/**
 * 0.53.0 다시 굽기 차례 셈(묶음 하나): 같은 열쇠 줄에서 마지막으로 본 이 묶음 그물의 줄 번호·묶음 번호, 이 묶음 그물 사이에 낀 다른 그물 수,
 * 이 묶음이 거느린 묶음 밖 그물 수(줄에서 이 묶음 그물 뒤 — 줄 맨 앞 것은 첫 묶음이), 묶음 번호가 장면 차례를 거슬렀는지
 */
export interface MergePlanStat {
  seq: number;
  mi: number;
  gaps: number;
  own: number;
  broken: boolean;
  /** 산 그물 수·그 정점 수(묶음 합치기 — 붙이면 묶음 수가 느는지) */
  n: number;
  nv: number;
}

/**
 * 0.52.0 그릴 묶음 구간 하나: 묶음·그물 번호 [a, b)·자리 자료 첫 텍셀 번호(셰이더 u_instBase — 구간 첫 그물의 자료가 a 자리에 오게 맞춘 값)·
 * 그물마다 색(cols — 구간 차례)·구간 공통 균일 변수(정점 색 쓰기·강조·불투명도). 그물마다 그리기와 같은 목록에 장면 차례로 든다
 */
export interface MergeRun {
  g: MergeGroup;
  a: number;
  b: number;
  base: number;
  /** 그물 i의 색은 cols[i − o](0.60.0 — 덩이째 더한 구간은 묶음 전체 목록을 함께 써 o = 0, sh) */
  cols: Rgba[];
  /** 그물마다 정점 색 쓰기(면 — 자리 자료 깃발), vc[i − o] */
  vc: boolean[];
  o: number;
  /** 0.60.0 cols·vc가 묶음과 함께 쓰는 목록(늘이려면 먼저 제 목록으로 옮긴다) */
  sh: boolean;
  tint: number;
  alpha: number;
  /** 0.61.0 윤곽선 굵기(CSS 화소 — 강조한 그물 2, 그 밖 1. 면 구간은 1) */
  w: number;
  /**
   * 0.62.0 면 구간 안 강조한 그물 번호(묶음 그물 번호 오름차순 — 없으면 null). 강조는 자리 깃발(정점 색 쓰기 깃발 + 2)이라 구간이 강조에서 끊기지 않고,
   * 강조 섞기 몫은 구간 균일 변수 tint(면 차례 0.5 — 깊이만 그리는 차례 0)에 그물마다 깃발을 곱한다
   */
  hl?: number[] | null;
}

/**
 * 0.60.0 그리기 뼈대의 덩이: 장면 차례(meshes)에서 같은 묶음의 잇단 번호 [a, b)(at = meshes 안 첫 자리). ok(반투명·뒷면·PBR·무늬 없음)·edges(그물마다 윤곽선)는
 * 만들 때 정한다(굽기가 받는 그물이라 늘 참 — 틀어지면 그 덩이는 그물마다). cut·hi·np는 그리기마다 쓰는 표시(이 그리기에 잘라낸 그물이 있음·강조 판·윤곽선 구간 모음이 없음)
 */
export interface MergeBlock {
  g: MergeGroup;
  a: number;
  b: number;
  at: number;
  ok: boolean;
  edges: boolean;
  cut: number;
  hi: number;
  np: boolean;
  npv: number;
  /** 숨긴 그물 번호(보이는 목록을 만들 때), 이 그리기에 잘라낸 그물 번호(cut 번호일 때), 강조한 그물 번호(hi 판일 때) — 모두 묶음 그물 번호 */
  hid: number[];
  cutL: number[];
  hiL: number[];
  /** 그리기마다 합친 예외 번호(ex 번호의 그리기에서 — exA 숨김·잘라냄, exB 거기에 강조) */
  ex: number;
  exA: number[];
  exB: number[];
  /** 0.62.0 이 그리기의 강조한 그물 번호(오름차순 — 강조가 없으면 null, ex 번호의 그리기에서) */
  hs?: number[] | null;
  /** 0.63.0 뼈대를 만들 때 묶음의 빠진 그물 수(dead)·쓰는 기록 수(live) — 달라지면 뼈대를 다시 만든다(조각 orderValid) */
  gd: number;
  gl: number;
  /** 그물 세계 범위(MeshRec.box)를 토막(조각 BLOCK_BOX개)마다 합친 상자·채우기 단위 묶음(capGroup)이 없는지(처음 쓸 때 — 조각 blockBoxes·blockCapFree) */
  boxes?: Box3[];
  ncg?: boolean;
}

/** 0.60.0 그리기 뼈대: 장면 차례의 덩이·묶음 밖 그물(items), 묶음 밖 그물만(loose), 그물 수(n) — 장면·묶음이 바뀌면 다시 만든다(mergegl orderValid) */
export interface MergeOrder {
  n: number;
  items: (MergeBlock | MeshRec)[];
  at: Int32Array;
  blocks: MergeBlock[];
  loose: MeshRec[];
  /** 강조 id → 덩이 번호 · 65536 + 묶음 그물 번호(처음 쓸 때 — 같은 id가 여럿이면 목록) */
  ids?: Map<string, number | number[]>;
  /** 0.63.0 id → 장면 차례 번호(meshes — 숨김을 고칠 때 처음 쓸 때 만들고 기록마다 MeshRec.si를 적는다. 같은 id가 여럿이면 목록) */
  si?: Map<string, number | number[]>;
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
  /**
   * 0.44.0 그물마다(meshes 차례) 홀짝을 셀 구간 단면 갈래(undefined면 그물 통째 — 묶음 안 숨김·강조 구간은 그대로). 구간 단면이 없으면 두지 않는다
   */
  cuts?: (number | undefined)[];
}

/**
 * 0.42.0 인스턴싱 기본: 보이는 같은 그물(MeshRec.geo가 같은) 자리가 이만큼 이상이면 자리마다 그리지 않고 그리기 한 번에 그린다
 * (Viewer3d.setRenderOptions({ instancing })로 바꾼다). 몇 자리뿐인 장면은 0.41.0과 같은 길·같은 차례로 그린다
 */
export const INSTANCE_MIN = 8;
/** 자리 자료 그림 폭(텍셀 — 셰이더의 k & 1023·k >> 10과 같다)과 자리 하나의 텍셀 수(그물 11 = u_mvp 4·u_mv 4·u_nmat 3, 선 5 = u_mvp 4·u_mvz 1 — 셰이더와 같다) */
const INST_W = 1024, INST_MESH = 11, INST_LINE = 5;
/** 자리 자료 그림을 묶어 두는 무늬 단위(다른 그리기가 쓰지 않는 자리: 0 무늬·1 외곽선 깊이·2 그림자·3 뒷면 무늬·4 외곽선 색) */
const INST_UNIT = 5;
/** 0.43.0 PBR 그림 무늬 단위: 법선 그림·거칠기 그림·금속성 그림(WebGL2 조각 셰이더 무늬 단위는 16개 이상) */
const NMAP_UNIT = 6, ROUGH_UNIT = 7, METAL_UNIT = 8;
/** 0.49.0 주변 가림 그림을 읽는 무늬 단위(그림자 단위 2를 비우지 않게 따로 — 깊이 그림은 외곽선과 같은 1) */
const AO_UNIT = 9;

/** 0.42.0 인스턴싱 선택(Renderer3d.instancing): on = 켬(기본), min = 모아 그릴 같은 그물 자리 수 하한(2 이상) */
export interface InstancingOptions {
  on: boolean;
  min: number;
}

/** 변종 프로그램 표시(정의 이름들 → Prog 깃발) */
function progFlags(defs: readonly string[]): Omit<Prog, 'p' | 'u'> {
  return {
    clip1: defs.includes('CLIP'),
    clipN: defs.includes('CLIPN'),
    tex: defs.includes('TEX'),
    sun: defs.includes('SUN'),
    shadow: defs.includes('SHADOW'),
    fog: defs.includes('FOG'),
    back: defs.includes('BACK'),
    backTex: defs.includes('BACKTEX'),
    inst: defs.includes('INST'),
    uv: defs.includes('UV'),
    nmap: defs.includes('NMAP'),
    pbr: defs.includes('PBR'),
    merge: defs.includes('MERGE'),
  };
}

/** 셰이더 원본 짝(정점·조각)에 정의를 넣은 변종 글. 0.52.0: MERGE면 정점 셰이더를 mergeShader로 바꾼다(INST 글이 바탕 — 정의에 INST도 든다) */
function variantSources(base: 'mesh' | 'wide' | 'thin' | 'point' | 'depth' | 'profile', defs: readonly string[]): [string, string] {
  const [vs, fs] =
    base === 'mesh' ? [MESH_VS, MESH_FS] : base === 'wide' ? [WIDE_VS, WIDE_FS] : base === 'thin' ? [THIN_VS, THIN_FS] : base === 'depth' ? [DEPTH_VS, DEPTH_FS] : base === 'profile' ? [FULL_VS, PROFILE_FS] : [POINT_VS, POINT_FS];
  const v = withDefines(vs, ...defs);
  // 0.54.0 MERGE 변종은 묶음이 있을 때만 부른다(묶음은 조각이 와야 구우므로 조각이 있다 — 없으면 예외, 부르는 쪽은 그물마다 그린다)
  if (defs.includes('MERGE') && !mergeKit) throw new Error('MERGE 변종: 묶어 그리기 조각을 아직 받지 않았다');
  // 0.62.0 그물 MERGE는 조각 셰이더도(강조 섞기 몫에 그물마다 강조 깃발 — 조각 mergeFrag)
  const fd = withDefines(fs, ...defs);
  if (!defs.includes('MERGE')) return [v, fd];
  return base === 'mesh' ? [mergeKit!.mergeShader(v, 'mesh'), mergeKit!.mergeFrag(fd)] : [mergeKit!.mergeShader(v, 'line'), fd];
}

/** 0.54.0 묶어 그리기 조각(mergegl.ts — 나눠 받는다): 받았으면 그 모듈, 받는 중이면 약속, 받지 못했으면 mergeKitFailed */
type MergeKit = typeof import('./mergegl');
let mergeKit: MergeKit | null = null;
let mergeKitLoad: Promise<boolean> | null = null;
let mergeKitFailed = false;
/** 0.55.0 받기를 건 지 MERGE_KIT_WAIT_MS가 지나도록 오지도 실패하지도 않았다(오거나 실패하면 거짓으로 — 그동안 렌더러는 조각을 기다리지 않는다) */
let mergeKitLate = false;
let mergeKitTimer: ReturnType<typeof setTimeout> | undefined;
/** 0.55.0 조각 받기 알림: 받음·받지 못함·기다림 한도를 넘음 */
type KitNote = (s: 'ready' | 'failed' | 'late') => void;
/** 0.55.0 조각을 기다리는 렌더러들의 알림(받거나 받지 못하면 부르고 비운다, 기다림 한도를 넘으면 부르고 둔다 — 렌더러를 닫으면 뺀다) */
const kitWaiters = new Set<KitNote>();

/** 0.55.0 받기가 끝났다(받음·받지 못함): 기다림 시계를 끄고 기다리던 렌더러에 알린다 */
function kitSettled(s: 'ready' | 'failed'): void {
  clearTimeout(mergeKitTimer);
  mergeKitTimer = undefined;
  mergeKitLate = false;
  const list = [...kitWaiters];
  kitWaiters.clear();
  for (const f of list) f(s);
}

/**
 * 0.54.0 묶어 그리기 조각을 받는다(한 번만 — 뷰어가 여럿이어도 같은 약속). 받았으면 true, 받지 못했으면(오프라인 등) false — 그 뒤 이 페이지의 렌더러는
 * 묶어 그리기를 끈다(그물마다 — 0.51.0 길). 렌더러가 필요할 때 스스로 부르고, 앱은 Viewer3d.preloadMerging()으로 미리 부를 수 있다.
 * 0.55.0: 받기를 건 지 MERGE_KIT_WAIT_MS 안에 끝나지 않으면 이 페이지는 조각을 기다리지 않는다('late' — 나눠 올리기가 굽기 단위에서 멈추지 않는다).
 * 약속은 그대로 받기가 끝날 때 풀린다(늦게 오면 true — 그때부터 굽는다)
 */
export function loadMergeKit(): Promise<boolean> {
  if (mergeKit) return Promise.resolve(true);
  if (mergeKitFailed) return Promise.resolve(false);
  if (!mergeKitLoad) {
    mergeKitTimer = setTimeout(() => {
      mergeKitTimer = undefined;
      if (mergeKit || mergeKitFailed) return;
      mergeKitLate = true;
      for (const f of [...kitWaiters]) f('late');
    }, MERGE_KIT_WAIT_MS);
    mergeKitLoad = import('./mergegl').then(
      (m) => {
        mergeKit = m;
        kitSettled('ready');
        return true;
      },
      () => {
        mergeKitFailed = true;
        kitSettled('failed');
        return false;
      },
    );
  }
  return mergeKitLoad;
}

/**
 * 0.54.0 묶어 그리기 조각 받기 상태: 'idle' 아직 받기를 걸지 않음 · 'loading' 받는 중 · 'ready' 받음 · 'failed' 받지 못함(이 페이지는 그물마다).
 * 0.55.0 'late' 받는 중이지만 기다림 한도(MERGE_KIT_WAIT_MS)를 넘었다 — 이 페이지는 조각을 기다리지 않고 그물마다 올린다(오면 'ready')
 */
export type MergeKitState = 'idle' | 'loading' | 'late' | 'ready' | 'failed';

/** 0.54.0 묶어 그리기 조각 받기 상태(시험·앱 확인용 — Viewer3d.mergingState) */
export function mergeKitState(): MergeKitState {
  return mergeKit ? 'ready' : mergeKitFailed ? 'failed' : mergeKitLate ? 'late' : mergeKitLoad ? 'loading' : 'idle';
}

/** 0.42.0 모아 그릴 선 묶음 하나(같은 선 버퍼·같은 색·굵기·불투명도 — 자리 행렬만 다르다). recs·models는 장면 차례 */
interface LineBatch {
  color: Rgba;
  width: number;
  alpha: number;
  recs: MeshRec[];
  models: (ArrayLike<number> | undefined)[];
}

/** 같은 열쇠의 묶음 가운데 색(같은 객체 또는 같은 값)·굵기·불투명도가 같은 것에 자리를 더한다(없으면 새 묶음) */
function addLineBatch(map: Map<unknown, LineBatch[]>, key: unknown, r: MeshRec, color: Rgba, width: number, alpha: number, model: ArrayLike<number> | undefined): void {
  let a = map.get(key);
  if (!a) map.set(key, (a = []));
  let b = a.find((x) => x.width === width && x.alpha === alpha && (x.color === color || (x.color[0] === color[0] && x.color[1] === color[1] && x.color[2] === color[2] && x.color[3] === color[3])));
  if (!b) a.push((b = { color, width, alpha, recs: [], models: [] }));
  b.recs.push(r);
  b.models.push(model);
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
  /** 0.49.0 주변 가림: 반 해상도 R8 그림 둘(가림 → 가로 흐림 → 세로 흐림 — 번갈아)과 그 프로그램 셋(처음 켤 때 만든다) */
  private aoTex: { a: { tex: WebGLTexture; fb: WebGLFramebuffer }; b: { tex: WebGLTexture; fb: WebGLFramebuffer }; w: number; h: number } | null = null;
  /** 0.50.0 움직이는 동안 'low'의 ¼ 해상도 그림 둘(반 해상도 그림과 따로 둔다 — 움직임을 시작·멈출 때마다 다시 만들지 않게) */
  private aoLow: Renderer3d['aoTex'] = null;
  private aoFailed = '';
  private aoP: Prog | null = null;
  private aoBlurP: Prog | null = null;
  private aoMixP: Prog | null = null;
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
  /**
   * 배열 → GPU 버퍼 열쇠(0.25.0): 같은 배열은 한 번만 올리려고 배열 객체로 찾지만, 약한 표라 배열을 붙잡지 않는다.
   * 버퍼 표·쓰는 기록 수는 이 열쇠로 둔다(코어가 배열을 지운 뒤에도 버퍼를 찾고 지운다)
   */
  private keys = new WeakMap<UploadArray, BufKey>();
  private arrayBufs = new Map<BufKey, WebGLBuffer>();
  private elemBufs = new Map<BufKey, WebGLBuffer>();
  /**
   * 장면 묶음(그물·선분·점 기록)이 쓰는 배열마다 그 배열을 쓰는 기록 수(0.11.0). 그물 하나를 바꾸거나 뺄 때
   * 아무도 쓰지 않게 된 배열의 GPU 버퍼만 지운다(조각 그물이 함께 쓰는 색인 같은 공유 배열은 남긴다). 표시 그물·따로 두는 선분은 세지 않는다
   */
  private refs = new Map<BufKey, number>();
  /** 0.25.0 놓기 선택(장면마다 setScene이 정한다 — 그 장면에 setMesh로 넣는 그물에도) */
  private rel: ReleaseFlags | null = null;
  /** 0.25.0 코어가 배열을 지운 그물 객체 → 올린 꼴(약한 표 — 문맥을 잃어도 남는다) */
  private laid = new WeakMap<Mesh3d, MeshLayout>();
  /** 0.25.0 코어가 원본을 지운 무늬 객체(문맥을 잃어도 남는다) */
  private texLaid = new WeakSet<Texture3d>();
  /** 0.25.0 나눠 올리는 장면에서 아직 차례가 오지 않은 그물에 앱이 다시 준 배열(차례가 오면 쓴다) */
  private restoreQ = new Map<string, MeshArrays>();
  private vaos = new Set<WebGLVertexArrayObject>();
  /** 0.28.0 살아 있는 GPU 버퍼마다 성분과 bufferData로 잡은 크기(문맥을 잃으면 비운다)와 성분별 합(stats.buffers) */
  private bufLedger = new Map<WebGLBuffer, { part: GpuBufferPart; bytes: number }>();
  private bufTotals = new Map<GpuBufferPart, number>();
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
  stats: RenderStats = { drawCalls: 0, triangles: 0, segments: 0, points: 0, culled: 0 };
  /** 균일 변수용 임시 배열(그리기마다 새로 만들지 않는다) */
  private m4a = new Float32Array(16);
  private m4b = new Float32Array(16);
  private m3 = new Float32Array(9);
  private d4a = new Float64Array(16);
  private d4b = new Float64Array(16);
  /** 0.43.0 자리 자료의 그림자 행렬(빛 · 모형) 셈 자리 */
  private d4c = new Float64Array(16);
  private capData = new Float32Array(CAP_MAX_VERTS * 3);
  /**
   * 나눠 올리는 중인 장면(setScene(scene, { incremental: true })).
   * 0.56.0 whole: 묶어 그리기 조각을 기다려 통째로 미룬 한 번에 올리기(setScene — 그물·선분·점 아무것도 올리지 않았다, mi·li·pi 0). 조각이 오면(또는 늦음·실패·끔·
   * 그림 저장처럼 다 올리라는 걸음이면) 다음 걸음에서 한 번에 다 올린다(uploadWhole — 미루지 않은 setScene과 같은 길)
   */
  private pending: { scene: Scene3d; mi: number; li: number; pi: number; chunk?: ChunkedUpload<WebGLBuffer> | null; whole?: boolean } | null = null;
  /**
   * 나눠 올리는 중인 그물 바꾸기(0.11.0 setMesh(…, { incremental })): id → 새 그물과 조각 올리기.
   * 다 채울 때까지 앞 그물 기록을 그대로 그리고, 다 채우면 기록을 바꾼다
   */
  private jobs = new Map<string, { mesh: Mesh3d; chunk: ChunkedUpload<WebGLBuffer>; keep: boolean }>();
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
  /**
   * 무늬를 올렸거나 풀지 못했을 때(다시 그리기용). 0.30.0: uploadMs = 그 무늬를 GPU에 올리는 데(texImage2D·밉맵 — 앞서 그린 화면이 GPU에서 끝나기를
   * 기다린 시간이 든다) 걸린 벽시계 ms, 풀지 못했거나 올리지 못했으면 0
   */
  onTexture: ((uploadMs: number) => void) | null = null;
  /** 0.42.0 인스턴싱 선택(다음 그리기부터) */
  instancing: InstancingOptions = { on: true, min: INSTANCE_MIN };
  /** 0.43.0 PBR 그림(법선·거칠기·금속)을 쓸지(기본 켬 — 끄면 PBR 필드를 준 그물도 0.42.0 셰이더 그대로, 다음 그리기부터) */
  pbr = true;
  /** 0.51.0 화면 밖 잘라내기(기본 켬 — src/cull.ts, 다음 그리기부터). 끄면 0.50.0처럼 보이는 그물을 모두 그린다 */
  culling = true;
  /** 0.43.0 흰 1화소 그림(거칠기·금속성 그림이 없는 쪽에 묶는다 — 배율이 곧 값). 문맥을 잃으면 잊는다 */
  private white: WebGLTexture | null = null;
  /** 0.42.0 자리 자료 그림(RGBA32F, 폭 INST_W)과 높이(줄). 문맥을 잃으면 잊는다 */
  private instTex: { tex: WebGLTexture; h: number } | null = null;
  /** 이번 그리기에서 자리 자료 그림의 다음 빈 줄(그리기마다 0부터 — 앞 그리기 호출이 읽는 줄은 덮지 않는다) */
  private instRow = 0;
  /** 자리 자료(CPU 쪽, 텍셀마다 4값 — 줄 단위로 올린다) */
  private instBuf = new Float32Array(INST_W * 4 * 4);
  private instM3 = new Float32Array(9);
  /** GPU 버퍼 번호(같은 그물 열쇠 MeshRec.geo를 만든다) */
  private bufIds = new WeakMap<WebGLBuffer, number>();
  private bufSeq = 0;
  /**
   * 0.42.0 인스턴싱 변종 번역(KHR_parallel_shader_compile가 있으면 기다리지 않고 번역을 걸어 두고 다 될 때까지 그물마다 그린다 — 첫 그림이
   * 번역을 기다려 멈추지 않게. 없으면 처음 쓸 때 바로 번역한다)
   */
  private parallel: object | null = null;
  private pendingProgs = new Map<string, { p: WebGLProgram; vs: WebGLShader; fs: WebGLShader; defs: readonly string[] }>();
  /** 인스턴싱 변종을 만들지 못했으면 true(그 문맥에서는 끄고 그물마다 그린다) */
  private instBroken = false;
  /** 0.43.0 PBR 변종을 만들지 못했으면 true(그 문맥에서는 PBR 그림 없이 0.42.0 셰이더로 그린다) */
  private pbrBroken = false;
  /** 0.42.0 지난 그리기의 인스턴싱: 모아 그린 그리기 호출 수·그 자리 수(차례마다 센다 — 면·외곽선 깊이·선을 모두) */
  instStats = { draws: 0, items: 0 };
  /** 0.51.0 그리기 번호(화면 밖으로 잘라낸 그물에 MeshRec.culledAt으로 적는다) */
  private frameNo = 0;
  /**
   * 0.51.0 잘라내기 덩어리(this.meshes 차례로 CULL_CHUNK개씩): 그때의 그물 기록(같은 자리의 기록이 바뀌면 그 덩어리를 다시 셈한다)·덩어리 그물 수·감싸는 자료
   * (null이면 덩어리째 판단하지 않는다). 그물마다 판단하는 것과 같은 결과를 덩어리 하나의 셈으로(맞춘 화면이면 거의 모든 덩어리가 확실히 안)
   */
  private cullChunks: { recs: (MeshRec | undefined)[]; n: number[]; box: (CullBox | null)[]; ord?: MergeOrder | null } = { recs: [], n: [], box: [] };
  /** 0.51.0 시험용: true면 선 상태 기억(LineMemo)을 쓰지 않고 그물마다 모두 보낸다(0.50.0 GL 호출 — 기억과 그리기 기록이 같은지 견줄 때) */
  lineMemoOff = false;
  /** 0.60.0 그리기 뼈대(다 올린 뒤 묶음이 있는 장면 — 장면 차례가 그대로인 동안 다시 쓴다)와 시험용 끄기(true면 0.59.0처럼 그물마다 훑는다 — 같은 그림인지 견줄 때) */
  private mgOrder: MergeOrder | null = null;
  orderOff = false;
  /** 0.60.0 보이는 목록: 만든 번호(MeshRec.visAt)와, 숨김 판(RenderState.visKey)·뼈대가 같으면 프레임을 넘어 다시 쓰는 목록 */
  private visSeq = 0;
  private visMemo: { ord: MergeOrder; key: number; seq: number; list: MeshRec[] } | null = null;
  /** 0.60.0 강조 모음이 든 덩이 표시(같은 모음·크기·뼈대면 다시 쓴다) */
  private hiSeq = 0;
  private hiMemo: { set: ReadonlySet<string>; size: number; ord: MergeOrder; stamp: number } | null = null;
  /** 0.60.0 구간 모음을 만들거나 지울 때마다 1씩(덩이의 윤곽선 구간 모음 없음 표시를 다시 볼 때) */
  private partsVer = 0;
  /** 0.61.0 묶음 자리 자료 저장소(조각이 만들고 놓는다 — 묶음이 모두 없어지면 null) */
  mgStore: MergeStore | null = null;
  /** 0.52.0 묶어 그리기 선택(기본 'auto' — 묶을 수 있는 그물이 min 이상인 장면만. 바꾸면 setMerging) */
  merging: MergingOptions = { mode: 'auto', min: MERGE_AUTO_MIN };
  /** 0.52.0 지금 장면에서 묶어 그리기가 켜졌는지('on'이거나, 'auto'에서 장면을 올릴 때 문턱을 넘었거나 묶음 밖 그물이 문턱만큼 모였을 때) */
  private mgActive = false;
  /** 0.52.0 장면에서 두 번 이상 쓰는 배열(같은 정의 자리 — 묶지 않는다. 장면을 올릴 때 훑는다) */
  private mgShared = new WeakSet<object>();
  /** 0.52.0 장면을 올리는 동안 굽기를 기다리는 그물 기록(장면 차례)과 그 정점 수 */
  private mgWait: MeshRec[] = [];
  private mgWaitVerts = 0;
  /** 0.57.0 mgWait 가운데 빛 기록 수(GL 객체 없이 곧 구울 것). 조각만 읽고 쓴다. 0.58.0: 나눠 올리기는 걸음 사이에도 남는다(그 기록은 mgHold에 있다) */
  mgLight = 0;
  /**
   * 0.58.0 나눠 올리는 동안 아직 보이지 않는 그물 기록(장면 차례 — 맨 앞은 늘 빛 기록, 그 뒤로 빛 기록과 끼어든 그물의 그물 버퍼 기록이 섞인다). 그리기·고르기·setMesh가 보는 meshes 밖이라
   * GL 객체 없는 기록을 걸음 사이에 들고 있어도 그 길들이 볼 일이 없다. 앞선 빛 기록을 굽는 대로 조각 drain이 meshes로 옮기고, 앱이 그 그물을 건드리면 조각 unhold가 그물 버퍼로 돌려 옮긴다
   */
  mgHold: MeshRec[] = [];
  /** 0.52.0 한 그리기에서 묶음 굽기에 쓸 몫(ms — 적어도 묶음 하나) */
  mergeBudgetMs = 8;
  /** 0.52.0 구운 묶음들과 굽기를 기다리는 묶음(그물 기록 목록 — 장면 차례), 묶음 버퍼 바이트 합 */
  private mgGroups = new Set<MergeGroup>();
  private mgQueue: MeshRec[][] = [];
  private mgBytes = 0;
  /** 0.52.0 묶을 그물을 다시 살펴야 하는지(장면·그물 바꾸기·묶음 풀기·선택 바꾸기 뒤 — 다 올린 뒤 한 번 훑는다) */
  private mgDirty = true;
  /** 0.52.0 묶음 변종을 만들지 못했으면 true(그 문맥에서는 그물마다) */
  private mergeBroken = false;
  /** 0.52.0 지난 그리기의 묶어 그리기: 묶음 구간 그리기 호출 수·그렇게 그린 그물 수(면·외곽선 깊이·윤곽선·숨은 점선 모두 센다) */
  mergeStats = { draws: 0, items: 0 };
  /** 0.52.0 지금까지 묶음 굽기에 쓴 벽시계 ms 합(장면을 바꾸면 0부터) */
  mergeBakeMs = 0;
  /** 0.52.0 지난 render 벽시계 ms(묶음 굽기를 뺀 장면 그리기 — 굽기 몫의 아래 한도, 조각 step이 읽는다) */
  renderMs = 0;
  /** 0.59.0 지난 render가 본 그리기 목록 기록 수(그물·선분·점 — uploadNews) */
  private drawnRecs = 0;
  /**
   * 0.54.0 미뤄 둔 장면 훑기(mergePrescan — 나눠 올리는 장면은 첫 그림 뒤 올리는 걸음마다 몫 안에서): 장면, 단계(0 그물 배열 적기·1 선분·점 배열 적기·2 묶을 수 있는 그물 세기),
   * 다음 그물 번호, 본 배열, 센 수. null이면 훑기를 마쳤거나 훑지 않는 장면.
   * 0.55.0 c: 훑기를 마치기 전에 올린 그물 가운데 묶을 수 있어 보이는 것의 수('auto' 받기를 일찍 걸 위 한계 — mergeOffer)
   */
  private mgScan: { scene: Scene3d; phase: 0 | 1 | 2; i: number; seen: WeakSet<object>; n: number; c: number } | null = null;
  /** 0.54.0 올렸지만 아직 굽기 기다림에 넣지 못한 그물(훑기 전·중이거나 조각을 받는 중 — 장면 차례)과 그 정점 수 */
  private mgUnfed: MeshRec[] = [];
  private mgUnfedVerts = 0;
  /** 0.54.0 나눠 올리는 장면의 첫 그림을 그렸는지(그 전에는 훑지도 굽지도 않는다) */
  private mgFramed = true;
  /** 0.54.0 지난 올리기 걸음이 조각을 기다려 멈췄는지(뷰어는 이때 프레임을 거듭 걸지 않고 조각이 오면 onMergeReady로 다시 그린다) */
  private mgHeld = false;
  /** 0.54.0 묶어 그리기 조각이 오거나 받지 못했을 때(뷰어가 다시 그린다). 0.55.0: 받기가 기다림 한도를 넘었을 때도(멈춘 올리기를 잇는다) */
  onMergeReady: (() => void) | null = null;
  /** 0.55.0 이 렌더러의 조각 받기 알림(wantKit이 페이지의 기다리는 렌더러 모음에 넣는다 — dispose가 뺀다) */
  private readonly kitNote: KitNote = (s) => {
    // 0.60.0 받는 동안 들고 있던 빛 기록은 받지 못하거나 늦으면 그물 버퍼로(장면 차례 그대로 그리기 목록에)
    if (s !== 'ready') this.holdOut();
    if (s === 'failed') {
      // 받지 못했다: 묶어 그리기를 끄고(그물마다) 멈춘 올리기를 잇는다
      this.mgActive = false;
      this.mgScan = null;
      this.mgUnfed = [];
      this.mgUnfedVerts = 0;
      this.mgWait = [];
      this.mgWaitVerts = 0;
      this.mgQueue = [];
    } else if (s === 'late') this.mergeLate();
    this.onMergeReady?.();
  };

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
    this.parallel = gl.getExtension('KHR_parallel_shader_compile');
    this.instBroken = false;
    this.pbrBroken = false;
    this.mergeBroken = false;
    this.quadWide = this.newBuffer(gl.ARRAY_BUFFER, new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), gl.STATIC_DRAW, 'overlay');
    this.quadPoint = this.newBuffer(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW, 'overlay');
    this.capBuf = this.newBuffer(gl.ARRAY_BUFFER, this.capData.byteLength, gl.DYNAMIC_DRAW, 'overlay');
    this.capVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.capVao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);
    this.stencilOk = !!gl.getContextAttributes()?.stencil;
  }

  /**
   * 문맥을 잃었을 때: GPU 객체는 이미 사라졌으므로 지우지 않고 잊는다.
   * 0.25.0: 놓기 선택과 코어가 지운 배열·원본의 꼴(laid·texLaid)은 남긴다 — 되찾은 뒤 무엇을 다시 받을지 안다
   */
  forget(): void {
    this.keys = new WeakMap();
    this.arrayBufs.clear();
    this.elemBufs.clear();
    this.refs.clear();
    // 0.28.0: 잃은 버퍼는 GPU에 없다(성분별 바이트도 0에서 다시)
    this.bufLedger.clear();
    this.bufTotals.clear();
    this.restoreQ.clear();
    this.jobs.clear();
    this.vaos.clear();
    // 0.52.0 묶음 GPU 자료도 사라졌다(지우지 않고 잊는다 — 되찾아 다시 올린 뒤 다시 굽는다)
    this.mergeClear(true);
    this.meshes = [];
    this.cullChunks = { recs: [], n: [], box: [] };
    this.forgetOrder();
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
    this.aoTex = null;
    this.aoLow = null;
    this.aoFailed = '';
    this.aoP = null;
    this.aoBlurP = null;
    this.aoMixP = null;
    this.skyP = null;
    this.shadowMap = null;
    this.instTex = null;
    this.white = null;
    this.pendingProgs.clear();
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
      // 0.52.0 묶음 저장소의 그물은 묶음 색인 버퍼 안 그 그물 자리부터(first — 아니면 0)
      const o = (r.first ?? 0) * 4;
      for (const run of list.runs) {
        if (r.indexed) gl.drawElements(gl.TRIANGLES, run.count * 3, gl.UNSIGNED_INT, o + run.start * 12);
        else gl.drawArrays(gl.TRIANGLES, run.start * 3, run.count * 3);
      }
      return;
    }
    gl.bindVertexArray(r.vao);
    if (r.indexed) gl.drawElements(gl.TRIANGLES, r.count, gl.UNSIGNED_INT, (r.first ?? 0) * 4);
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

  /**
   * 0.49.0 주변 가림 반 해상도 그림 둘(크기가 바뀌면 다시 만든다). 만들지 못하면 null(그 크기는 다시 시도하지 않는다 — 가림 없이 그린다).
   * 0.50.0 div 4(움직이는 동안 'low')는 ¼ 해상도 그림 둘을 따로 둔다
   */
  private aoTargets(w: number, h: number, div = 2): NonNullable<Renderer3d['aoTex']> | null {
    const low = div !== 2;
    const [hw, hh] = aoSize(w, h, div);
    const t = low ? this.aoLow : this.aoTex;
    if (t && t.w === hw && t.h === hh) return t;
    this.dropAo(low);
    if (this.aoFailed === `${low ? 'low:' : ''}${hw}x${hh}`) return null;
    const gl = this.gl;
    const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const made: { tex: WebGLTexture; fb: WebGLFramebuffer }[] = [];
    let ok = true;
    for (let i = 0; i < 2 && ok; i++) {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, hw, hh, 0, gl.RED, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      made.push({ tex, fb });
      ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prev);
    if (!ok) {
      for (const m of made) {
        gl.deleteFramebuffer(m.fb);
        gl.deleteTexture(m.tex);
      }
      this.aoFailed = `${low ? 'low:' : ''}${hw}x${hh}`;
      return null;
    }
    const rec = { a: made[0]!, b: made[1]!, w: hw, h: hh };
    if (low) this.aoLow = rec;
    else this.aoTex = rec;
    return rec;
  }

  /** 가림 그림을 놓는다: low를 주면 그 하나(false = 반 해상도, true = ¼), 없으면 둘 다 */
  private dropAo(low?: boolean): void {
    for (const k of low === undefined ? ([false, true] as const) : [low]) {
      const t = k ? this.aoLow : this.aoTex;
      if (!t) continue;
      for (const m of [t.a, t.b]) {
        this.gl.deleteFramebuffer(m.fb);
        this.gl.deleteTexture(m.tex);
      }
      if (k) this.aoLow = null;
      else this.aoTex = null;
    }
  }

  /**
   * 0.49.0 주변 가림 셋째 단계(외곽선 깊이 그림 profTex에 불투명 그물 깊이를 그린 뒤): 반 해상도 가림 → 가로·세로 흐림 → 장치 화소 그림(target)에 곱하기.
   * 그리기 수에 화면 전체 삼각형 넷을 더한다. 그림을 만들지 못하면 아무것도 하지 않는다(false)
   */
  private drawAo(f: ViewFrame, devW: number, devH: number, ao: AoParams, target: WebGLFramebuffer | null, transparent: boolean, stats: RenderStats): boolean {
    const gl = this.gl;
    const t = this.aoTargets(devW, devH, ao.div ?? 2);
    const inv = mat4Invert(f.proj);
    if (!t || !this.profTex || !inv) return false;
    const invProj = Float32Array.from(inv);
    const aoP = (this.aoP ??= this.program(FULL_VS, AO_FS));
    const blurP = (this.aoBlurP ??= this.program(FULL_VS, AO_BLUR_FS));
    const mixP = (this.aoMixP ??= this.program(FULL_VS, AO_MIX_FS));
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.BLEND);
    gl.bindVertexArray((this.emptyVao ??= gl.createVertexArray()));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.profTex.tex);
    // 가림(반 해상도 → a)
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.a.fb);
    gl.viewport(0, 0, t.w, t.h);
    gl.useProgram(aoP.p);
    gl.uniform1i(this.loc(aoP, 'u_depth'), 1);
    gl.uniformMatrix4fv(this.loc(aoP, 'u_invProj'), false, invProj);
    gl.uniform2f(this.loc(aoP, 'u_texel'), 1 / devW, 1 / devH);
    gl.uniform1f(this.loc(aoP, 'u_radius'), ao.radius);
    gl.uniform1f(this.loc(aoP, 'u_pxPerUnit'), (f.proj[5]! * devH) / 2);
    gl.uniform1f(this.loc(aoP, 'u_ortho'), f.projection === 'orthographic' ? 1 : 0);
    gl.uniform1f(this.loc(aoP, 'u_intensity'), ao.intensity);
    gl.uniform1f(this.loc(aoP, 'u_maxPx'), AO_MAX_PIXELS);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 가로 흐림(a → b)·세로 흐림(b → a)
    gl.useProgram(blurP.p);
    gl.uniform1i(this.loc(blurP, 'u_depth'), 1);
    gl.uniform1i(this.loc(blurP, 'u_ao'), AO_UNIT);
    gl.uniformMatrix4fv(this.loc(blurP, 'u_invProj'), false, invProj);
    gl.uniform1f(this.loc(blurP, 'u_radius'), ao.radius);
    gl.activeTexture(gl.TEXTURE0 + AO_UNIT);
    for (const [src, dst, sx, sy] of [
      [t.a, t.b, 1 / t.w, 0],
      [t.b, t.a, 0, 1 / t.h],
    ] as const) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform2f(this.loc(blurP, 'u_step'), sx, sy);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // 곱하기(a → 그림)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, devW, devH);
    gl.bindTexture(gl.TEXTURE_2D, t.a.tex);
    gl.useProgram(mixP.p);
    gl.uniform1i(this.loc(mixP, 'u_depth'), 1);
    gl.uniform1i(this.loc(mixP, 'u_ao'), AO_UNIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ZERO, gl.SRC_COLOR, gl.ZERO, gl.ONE);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    stats.drawCalls += 4;
    // 그리기 처음과 같은 섞기(투명 바탕 그림 저장은 알파를 따로)
    if (transparent) gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.BLEND);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    return true;
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
    const [vs, fs] = variantSources(base, defs);
    p = { ...this.program(vs, fs), ...progFlags(defs) };
    this.variants.set(key, p);
    return p;
  }

  /** 0.42.0 인스턴싱 변종 번역을 기다리는 수(0이 아니면 뷰어가 다음 프레임에 다시 그린다 — 다 되면 모아 그린다) */
  get instPending(): number {
    return this.pendingProgs.size;
  }

  /**
   * 0.42.0 인스턴싱 변종(defs에 INST를 더한 것). KHR_parallel_shader_compile가 있으면 번역·연결을 걸어 두고 다 될 때까지 null(부르는 쪽은 그물마다 그린다 —
   * 첫 그림이 번역을 기다려 멈추지 않게), 없으면 variant처럼 바로 번역한다. 번역·연결에 실패하면 이 문맥에서는 인스턴싱을 끄고 null
   */
  private instVariant(base: 'mesh' | 'wide' | 'thin', defs: readonly string[]): Prog | null {
    if (this.instBroken) return null;
    const p = this.asyncVariant(base, [...defs, 'INST']);
    if (p === false) this.instBroken = true;
    return p || null;
  }

  /**
   * 0.52.0 묶어 그리기 변종(defs에 INST·MERGE를 더한 것 — 정점 셰이더는 mergeShader). 인스턴싱 변종과 같이 기다리지 않고 번역하고(다 될 때까지 null — 그물마다 그린다),
   * 실패하면 이 문맥에서는 묶어 그리기를 끈다
   */
  mergeVariant(base: 'mesh' | 'wide' | 'thin', defs: readonly string[]): Prog | null {
    if (this.mergeBroken) return null;
    const p = this.asyncVariant(base, [...defs, 'INST', 'MERGE']);
    if (p === false) this.mergeBroken = true;
    return p || null;
  }

  /**
   * 기다리지 않는 변종 번역(0.42.0 인스턴싱 변종에서 떼어 냄 — 0.43.0 PBR 변종도 쓴다): 다 되었으면 프로그램, 번역 중이면 null(부르는 쪽은 다른 변종으로 그리고
   * 뷰어가 instPending으로 다음 프레임에 다시 그린다), 번역·연결에 실패하면 false. KHR_parallel_shader_compile가 없으면 variant처럼 바로 번역한다
   */
  private asyncVariant(base: 'mesh' | 'wide' | 'thin', all: readonly string[]): Prog | null | false {
    const key = `${base}:${[...all].sort().join(',')}`;
    const have = this.variants.get(key);
    if (have) return have;
    if (!this.parallel) {
      try {
        return this.variant(base, all);
      } catch {
        return false;
      }
    }
    const gl = this.gl;
    const q = this.pendingProgs.get(key);
    if (!q) {
      let src: [string, string];
      try {
        src = variantSources(base, all);
      } catch {
        return false;
      }
      const sh = (type: number, text: string): WebGLShader => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, text);
        gl.compileShader(s);
        return s;
      };
      const a = sh(gl.VERTEX_SHADER, src[0]);
      const b = sh(gl.FRAGMENT_SHADER, src[1]);
      const p = gl.createProgram()!;
      gl.attachShader(p, a);
      gl.attachShader(p, b);
      gl.linkProgram(p);
      this.pendingProgs.set(key, { p, vs: a, fs: b, defs: all });
      return null;
    }
    // COMPLETION_STATUS_KHR(0x91B1): 기다리지 않고 묻는다
    if (!gl.getProgramParameter(q.p, 0x91b1)) return null;
    return this.finishPending(key, q);
  }

  /** 번역이 끝난 변종을 변종 표로 옮긴다(연결에 실패했으면 지우고 false — 문맥을 잃었으면 null) */
  private finishPending(key: string, q: { p: WebGLProgram; vs: WebGLShader; fs: WebGLShader; defs: readonly string[] }): Prog | null | false {
    const gl = this.gl;
    this.pendingProgs.delete(key);
    const ok = !!gl.getProgramParameter(q.p, gl.LINK_STATUS);
    gl.deleteShader(q.vs);
    gl.deleteShader(q.fs);
    if (!ok) {
      gl.deleteProgram(q.p);
      return gl.isContextLost() ? null : false;
    }
    const prog: Prog = { p: q.p, u: new Map(), ...progFlags(q.defs) };
    this.variants.set(key, prog);
    return prog;
  }

  /**
   * 0.43.0 그리기마다 번역을 기다리는 변종을 모두 묻는다. 그 변종을 다시 부르지 않게 된 경우(무늬가 하나씩 올라와 PBR 변종 정의가 바뀌었거나 모드를 바꿈)에도
   * 기다림이 끝나게 — 남아 있으면 instPending이 0이 되지 않아 뷰어가 프레임마다 다시 그린다(0.42.0에도 모드를 바꾸면 생길 수 있던 일)
   */
  private pollPending(): void {
    if (!this.pendingProgs.size) return;
    const gl = this.gl;
    for (const [key, q] of [...this.pendingProgs]) {
      if (!gl.getProgramParameter(q.p, 0x91b1)) continue;
      if (this.finishPending(key, q) === false) {
        if (q.defs.includes('MERGE')) this.mergeBroken = true;
        else if (q.defs.includes('INST')) this.instBroken = true;
        else this.pbrBroken = true;
      }
    }
  }

  /**
   * 그물 프로그램(INST 아님)의 행렬 셋(u_mvp·u_mv·u_nmat — 시점·투영 · 모형과 시점 · 모형은 double을 float32로, 법선 행렬은 float32 배열에 곧바로).
   * 0.51.0: 한 균일 변수 배열(u_m)로 묶어 보내 보았으나 Apple GPU(ANGLE Metal)에서 셰이더가 만든 행렬과 균일 행렬의 곱이 깊이 마지막 자리에서 달라
   * 면 위 윤곽선의 깊이 겨루기 화소가 바뀌어(SwiftShader는 같음) 0.50.0처럼 셋으로 보낸다
   */
  private meshMats(p: Prog, mvp: ArrayLike<number>, mv: ArrayLike<number>): void {
    const gl = this.gl;
    this.m4a.set(mvp);
    this.m4b.set(mv);
    normalMatrix(mv, this.m3);
    gl.uniformMatrix4fv(this.loc(p, 'u_mvp'), false, this.m4a);
    gl.uniformMatrix4fv(this.loc(p, 'u_mv'), false, this.m4b);
    gl.uniformMatrix3fv(this.loc(p, 'u_nmat'), false, this.m3);
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

  /**
   * 0.28.0 GPU 버퍼 하나를 만들어 묶고 bufferData로 채우거나(배열) 크기만 잡는다(수) — 예전 createBuffer·bindBuffer·bufferData와 같은 차례.
   * 성분별 바이트(stats.buffers)에 센다
   */
  private newBuffer(target: number, src: ArrayBufferView | number, usage: number, part: GpuBufferPart): WebGLBuffer {
    const gl = this.gl;
    const b = gl.createBuffer()!;
    gl.bindBuffer(target, b);
    if (typeof src === 'number') gl.bufferData(target, src, usage);
    else gl.bufferData(target, src, usage);
    this.ledgerSet(b, part, typeof src === 'number' ? src : src.byteLength);
    return b;
  }

  /** 0.28.0 GPU 버퍼를 지우고 성분별 바이트에서 뺀다 */
  private dropBuffer(b: WebGLBuffer | null | undefined): void {
    if (!b) return;
    this.gl.deleteBuffer(b);
    const e = this.bufLedger.get(b);
    if (!e) return;
    this.bufLedger.delete(b);
    this.bufTotals.set(e.part, (this.bufTotals.get(e.part) ?? 0) - e.bytes);
  }

  /** 0.28.0 버퍼의 성분·크기를 적는다(이미 적힌 버퍼면 바꾼다 — 나눠 올리기는 크기를 잡은 뒤 성분을 정한다) */
  private ledgerSet(b: WebGLBuffer, part: GpuBufferPart, bytes: number): void {
    const e = this.bufLedger.get(b);
    if (e) this.bufTotals.set(e.part, (this.bufTotals.get(e.part) ?? 0) - e.bytes);
    this.bufLedger.set(b, { part, bytes });
    this.bufTotals.set(part, (this.bufTotals.get(part) ?? 0) + bytes);
  }

  /** 0.28.0 적힌 버퍼의 성분만 바꾼다(표시 그물 — meshRec이 장면 성분으로 적은 것) */
  private retag(b: WebGLBuffer | null, part: GpuBufferPart): void {
    const e = b ? this.bufLedger.get(b) : undefined;
    if (b && e && e.part !== part) this.ledgerSet(b, part, e.bytes);
  }

  /**
   * 0.28.0 GPU 버퍼 바이트(bufferData로 잡은 크기, 살아 있는 버퍼만): 성분별·합·버퍼 수(복사본). 같은 배열은 처음 올린 성분으로 한 번만 센다
   */
  get bufferStats(): GpuBufferStats {
    const out = { bytes: 0, count: this.bufLedger.size } as GpuBufferStats;
    for (const p of GPU_BUFFER_PARTS) {
      const n = this.bufTotals.get(p) ?? 0;
      out[p] = n;
      out.bytes += n;
    }
    return out;
  }

  /** 배열의 버퍼 열쇠(0.25.0 — 처음 보는 배열이면 만든다. 같은 배열은 같은 열쇠) */
  private keyOf(data: UploadArray): BufKey {
    let k = this.keys.get(data);
    if (!k) this.keys.set(data, (k = { bytes: data.byteLength }));
    return k;
  }

  /** 0.42.0 GPU 버퍼 번호(없으면 −1 — 같은 그물 열쇠용, 처음 보는 버퍼면 새 번호) */
  private bufId(b: WebGLBuffer | null): number {
    if (!b) return -1;
    let n = this.bufIds.get(b);
    if (n === undefined) this.bufIds.set(b, (n = ++this.bufSeq));
    return n;
  }

  /**
   * 0.42.0 자리 자료를 instBuf에 쓸 자리(texels개)를 마련한다(줄 단위로 올리므로 줄을 채울 만큼). 자리 자료 그림에 들어가지 않으면 false
   */
  private instReserve(texels: number): boolean {
    const rows = Math.max(1, Math.ceil(texels / INST_W));
    const maxH = Number(this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE)) || 2048;
    if (this.instRow + rows > maxH) return false;
    const need = rows * INST_W * 4;
    if (this.instBuf.length < need) this.instBuf = new Float32Array(Math.max(need, this.instBuf.length * 2));
    return true;
  }

  /**
   * 0.42.0 instBuf 앞 texels개의 자리 자료를 자리 자료 그림의 이번 그리기 다음 빈 줄부터 올리고, 그 첫 텍셀 번호(셰이더 u_instBase)를 돌려준다.
   * 그림이 모자라면 두 배씩 키워 새로 만든다(앞서 부른 그리기 호출은 GL 차례대로 그때 그림을 읽는다). instReserve가 먼저 자리를 마련한다
   */
  private instPut(texels: number): number {
    const gl = this.gl;
    const rows = Math.max(1, Math.ceil(texels / INST_W));
    const need = this.instRow + rows;
    let t = this.instTex;
    gl.activeTexture(gl.TEXTURE0 + INST_UNIT);
    if (!t || t.h < need) {
      const maxH = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 2048;
      let h = Math.max(16, t ? t.h : 16);
      while (h < need) h *= 2;
      h = Math.min(h, maxH);
      if (t) gl.deleteTexture(t.tex);
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, INST_W, h, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.instTex = t = { tex, h };
    } else gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, this.instRow, INST_W, rows, gl.RGBA, gl.FLOAT, this.instBuf, 0);
    gl.activeTexture(gl.TEXTURE0);
    const base = this.instRow * INST_W;
    this.instRow = need;
    return base;
  }

  /**
   * 0.42.0 그물 자리 자료: 자리마다 setMeshMatrix와 같은 double 곱(시점 · 모형, 투영 · 그것, 법선 행렬)을 float32로 instBuf에 11텍셀씩.
   * 0.43.0: shadow(빛 투영·시점)를 주면 setMeshMatrix의 u_shadowM과 같은 식(빛 · 모형을 double로 곱해 [0, 1]로 맞춘 행렬)을 4텍셀(11~14),
   * clip(모형 → 로컬 평면)을 주면 setMeshMatrix의 u_clip과 같은 로컬 평면을 맨 끝 1텍셀에 더 쓴다(자리 텍셀 수 = instStride)
   * 올린 첫 텍셀 번호(자리 자료 그림이 모자라면 −1 — 그때는 그물마다 그린다)
   */
  private instMeshes(
    f: ViewFrame,
    models: readonly (ArrayLike<number> | undefined)[],
    extra: { shadow?: ArrayLike<number> | null; clip?: ((model: ArrayLike<number> | undefined) => Readonly<Plane4> | null) | null } = {},
  ): number {
    const n = models.length;
    const shadow = extra.shadow ?? null, clip = extra.clip ?? null;
    const stride = Renderer3d.instStride(!!shadow, !!clip);
    if (!this.instReserve(n * stride)) return -1;
    const d = this.instBuf, m3 = this.instM3;
    for (let i = 0; i < n; i++) {
      const model = models[i];
      const mv = model ? mat4Mul(f.view, model, this.d4a) : f.view;
      const mvp = model ? mat4Mul(f.proj, mv, this.d4b) : f.viewProj;
      const o = i * stride * 4;
      for (let k = 0; k < 16; k++) {
        d[o + k] = mvp[k]!;
        d[o + 16 + k] = mv[k]!;
      }
      // 법선 행렬은 setMeshMatrix처럼 float32 배열에 곧바로(같은 반올림)
      normalMatrix(mv, m3);
      for (let c = 0; c < 3; c++) {
        d[o + 32 + c * 4] = m3[c * 3]!;
        d[o + 33 + c * 4] = m3[c * 3 + 1]!;
        d[o + 34 + c * 4] = m3[c * 3 + 2]!;
        d[o + 35 + c * 4] = 0;
      }
      if (shadow) {
        // setMeshMatrix의 u_shadowM: 빛 · 모형(double)을 그대로, 앞 세 행은 (행 + w 행) × 0.5를 double로 셈한 뒤 float32로
        const lv = model ? mat4Mul(shadow, model, this.d4c) : shadow;
        for (let k = 0; k < 16; k++) d[o + 44 + k] = lv[k]!;
        for (let j = 0; j < 4; j++) for (let r = 0; r < 3; r++) d[o + 44 + j * 4 + r] = lv[j * 4 + r]! * 0.5 + lv[j * 4 + 3]! * 0.5;
      }
      if (clip) {
        const c = clip(model) ?? NO_CLIP;
        const q = o + (stride - 1) * 4;
        d[q] = c[0];
        d[q + 1] = c[1];
        d[q + 2] = c[2];
        d[q + 3] = c[3];
      }
    }
    return this.instPut(n * stride);
  }

  /** 0.43.0 그물 자리 하나의 텍셀 수: 11(행렬) + 그림자 행렬 4 + 단면 평면 1 — 셰이더 u_instStride */
  private static instStride(shadow: boolean, clip: boolean): number {
    return INST_MESH + (shadow ? 4 : 0) + (clip ? 1 : 0);
  }

  // ───── 0.52.0 묶어 그리기(MERGE): 묶음 굽기·옮기기·되돌리기와 자리 자료 ─────

  /** 0.52.0 묶음을 모두 잊는다(clear·forget — 그물 기록도 함께 버려진다. lost면 GPU 객체는 이미 없다). 굽기를 기다리던 것도 버린다 */
  private mergeClear(lost: boolean): void {
    if (mergeKit) for (const g of [...this.mgGroups]) mergeKit.free(this.host, g, lost);
    this.mgQueue = [];
    this.mgWait = [];
    this.mgWaitVerts = 0;
    this.mgLight = 0;
    this.mgHold = [];
    this.mgBytes = 0;
    this.mgDirty = true;
    this.mgActive = this.merging.mode === 'on';
    this.mgShared = new WeakSet();
    this.mergeBakeMs = 0;
    // 0.55.0 조각을 기다리던 것도 잊는다(새 장면이 필요하면 다시 건다 — 훑기·'on'·mergeStep)
    kitWaiters.delete(this.kitNote);
    this.mgScan = null;
    this.mgUnfed = [];
    this.mgUnfedVerts = 0;
    this.mgFramed = true;
    this.mgHeld = false;
  }

  /** 0.54.0 이 렌더러에서 묶어 그리기를 쓰지 않는지(끔·MERGE 변종 실패·조각을 받지 못함) */
  private get mgOff(): boolean {
    return this.merging.mode === 'off' || this.mergeBroken || mergeKitFailed;
  }

  /**
   * 0.54.0 묶어 그리기 조각이 필요하면 받기를 건다(받았거나 받는 중이면 그대로). 오거나 받지 못하면 onMergeReady.
   * 0.55.0: 알림은 페이지의 기다리는 렌더러 모음으로(kitNote — 기다림 한도를 넘어도 알린다). 이미 한도를 넘은 받기면 곧 기다리지 않는 쪽으로(mergeLate)
   */
  private wantKit(): void {
    if (mergeKit || mergeKitFailed) return;
    kitWaiters.add(this.kitNote);
    if (mergeKitLate) this.mergeLate();
    void loadMergeKit();
  }

  /**
   * 0.55.0 조각 받기가 기다림 한도를 넘었다: 모아 둔 그물(훑기 뒤 굽기를 기다리던 것)을 놓고 그물마다 그대로 둔다 — 조각이 오면 다 올린 뒤 mergeStep이
   * 묶음 밖 그물로 다시 살펴 굽는다(mgDirty). 받기가 끝날 때까지(mergeKitLate) 나눠 올리기는 굽기 단위에서 멈추지 않고 새로 올린 그물도 모으지 않는다
   */
  private mergeLate(): void {
    this.mgUnfed = [];
    this.mgUnfedVerts = 0;
    this.mgDirty = true;
  }

  /** 0.54.0 다 올린 장면에서 묶어 그리기를 켤 수 있는지(조각을 받을 까닭 — 'on'이거나, 켜졌거나, 'auto'에서 그물이 문턱 이상) */
  private get mgMay(): boolean {
    const mode = this.merging.mode;
    return mode === 'on' || this.mgActive || (mode === 'auto' && this.meshes.length >= this.merging.min);
  }

  /**
   * 0.55.0 조각 없이 'auto' 장면을 켤 수 있는지 센다: 묶음 밖의 묶을 수 있는 그물(mergeSrcOf — 조각의 planLoose가 켤지 정할 때와 같은 셈)이 문턱 이상인지.
   * 문턱에 닿으면 멈춘다. 조각이 없으면 묶음도 없으므로 장면 그물 모두가 묶음 밖이다
   */
  private mgCanAuto(): boolean {
    const min = this.merging.min;
    let n = 0;
    for (const r of this.meshes) if (!r.mg && this.mergeSrcOf(r) && ++n >= min) return true;
    return false;
  }

  /**
   * 0.52.0 그물 기록이 장면에서 빠진다(그물을 바꾸거나 뺄 때 — 바꾼 그물의 새 기록은 그물마다 버퍼로 올린다). 다음 그리기에서 다시 살핀다.
   * 묶음에 든 그물이면 묶음의 빠진 그물 수를 세고 놓는다(0.57.0 조각 leave — 묶음이 있으면 조각도 있다)
   */
  private mergeLeave(r: MeshRec): void {
    this.mgDirty = true;
    if (r.mg) mergeKit!.leave(this.host, r);
  }

  /**
   * 0.52.0 장면을 올리기 전에: 두 번 이상 쓰는 배열을 적고(같은 정의 자리 — 묶지 않는다), 'auto'면 묶을 수 있어 보이는 그물(무늬·뒷면·PBR·반투명 색이 없고
   * 정점·윤곽선이 한도 안이며 배열을 함께 쓰지 않는 그물) 수가 문턱 이상인지로 이 장면의 묶어 그리기를 정한다. 그물이 문턱보다 적은 장면은 훑지 않는다(0.51.0과 같은 일).
   * 0.54.0: 훑을 장면이면 묶어 그리기 조각 받기를 곧 건다(훑기·첫 올리기 걸음과 겹친다). defer(나눠 올리기)면 훑기를 첫 그림 뒤 올리는 걸음으로 미룬다 —
   * 8만 그물 장면에서 이 훑기(배열 40만 개 적기)가 setScene을 50~90 ms 붙잡아 첫 그림이 0.51.0보다 늦었다(가짜 GL 첫 그림 0.51.0 137~142 → 0.53.0 176~319 ms).
   * 0.55.0: 'auto'는 여기서 받기를 걸지 않는다 — 훑기가 묶을 수 있는 그물을 문턱만큼 센 때(mergeScan), 또는 그 전에 올린 그물 가운데 묶을 수 있어 보이는 것이
   * 문턱에 닿은 때(mergeOffer — 나눠 올리기 첫 걸음 안이라 받기가 첫 걸음들과 겹친다) 건다. 무늬·반투명·같은 정의 자리가 많아 켜질 수 없는 장면은 받지 않는다
   */
  private mergePrescan(scene: Scene3d, defer: boolean): void {
    const mode = this.merging.mode;
    this.mgActive = mode === 'on';
    this.mgScan = null;
    if (this.mgOff || (mode === 'auto' && scene.meshes.length < this.merging.min)) return;
    if (mode === 'on') this.wantKit();
    this.mgScan = { scene, phase: 0, i: 0, seen: new WeakSet<object>(), n: 0, c: 0 };
    // 0.57.0 조각이 이미 있고 훑기가 짧은 장면(MERGE_SCAN_FIRST — 1만 6,384개까지, 가운데값 6.6 ms)은 나눠 올려도 곧 훑는다: 첫 걸음부터 곧장 구워(조각 direct) 첫 단위의 그물마다 GL 객체를 만들지 않는다
    if (!defer || (mergeKit && scene.meshes.length <= MERGE_SCAN_FIRST)) this.mergeScan(Infinity);
  }

  /**
   * 0.54.0 장면 훑기를 end(performance.now 시각 — Infinity면 끝까지)까지 이어 간다(적어도 그물 한 덩이 — 1,024개). 0.53.0 mergePrescan과 같은 셈·같은 차례:
   * 그물 배열 → 선분·점 배열 적기, 그다음 'auto'면 묶을 수 있어 보이는 그물 세기(모두 적은 뒤에 — 뒤 그물과 함께 쓰는 배열도 알게). 마치면 묶어 그리기를 정하고 true
   */
  private mergeScan(end: number): boolean {
    const sc = this.mgScan;
    if (!sc) return true;
    const ms = sc.scene.meshes;
    const mark = (a: object | undefined | null): void => {
      if (!a) return;
      if (sc.seen.has(a)) this.mgShared.add(a);
      else sc.seen.add(a);
    };
    const CHUNK = 1024;
    let first = true;
    const more = (): boolean => first || performance.now() < end;
    while (sc.phase === 0 && more()) {
      first = false;
      const stop = Math.min(ms.length, sc.i + CHUNK);
      for (; sc.i < stop; sc.i++) {
        const m = ms[sc.i]!;
        mark(m.positions);
        mark(m.normals);
        mark(m.indices);
        mark(m.colors);
        mark(m.edges);
      }
      if (sc.i >= ms.length) {
        sc.phase = 1;
        sc.i = 0;
      }
    }
    if (sc.phase === 1 && more()) {
      for (const l of sc.scene.lines) for (const a of [l.positions, l.colors]) mark(a);
      for (const p of sc.scene.points ?? []) mark(p.positions);
      sc.phase = 2;
    }
    const auto = this.merging.mode === 'auto';
    while (sc.phase === 2 && auto && sc.i < ms.length && more()) {
      first = false;
      const stop = Math.min(ms.length, sc.i + CHUNK);
      for (; sc.i < stop; sc.i++) {
        const m = ms[sc.i]!;
        const nv = Math.floor(m.positions.length / 3);
        if (!nv || nv > MERGE_MESH_VERTS || m.texture || m.backTexture || m.backColor || pbrSource(m) || !(m.color[3] >= 0.999)) continue;
        if ((m.edges ? m.edges.length / 6 : 0) > MERGE_MESH_SEGMENTS) continue;
        if ([m.positions, m.normals, m.indices, m.colors, m.edges].some((a) => !!a && this.mgShared.has(a))) continue;
        // 0.55.0 문턱에 닿은 때 받기를 건다(이 장면은 켜진다 — 셈은 줄지 않는다)
        if (++sc.n === this.merging.min) this.wantKit();
      }
    }
    if (sc.phase !== 2 || (auto && sc.i < ms.length)) return false;
    this.mgScan = null;
    this.mgActive = auto ? sc.n >= this.merging.min : this.merging.mode === 'on';
    return true;
  }

  /**
   * 0.54.0 올린 그물 하나를 굽기 기다림에 넣을 차례: 훑기 전·중이거나 켜졌는데 조각을 받는 중이면 따로 모아 두고(mgUnfed — 조각이 오고 훑기를 마치면 장면 차례로 넣는다),
   * 아니면 곧 넣는다(조각 feed — 0.53.0과 같다)
   */
  private mergeOffer(r: MeshRec): void {
    // 0.55.0 조각 받기가 기다림 한도를 넘었으면 모으지 않는다(그물마다 — 조각이 오면 다 올린 뒤 mergeStep이 묶음 밖 그물로 살핀다)
    if (mergeKitLate) {
      this.mgDirty = true;
      return;
    }
    // 0.55.0 'auto' 훑기를 마치기 전: 올린 그물 가운데 묶을 수 있어 보이는 것(mergeSrcOf — 앞서 올린 그물과 함께 쓰는 배열은 refs·적은 배열로 빠지고, 뒤 그물과 함께 쓸 배열의
    // 첫 그물만 더 센다 — 정확한 셈의 위 한계)이 문턱에 닿으면 곧 받기를 건다(그 장면은 켜질 수 있다). 훑기 셈을 기다리면 받기가 첫 걸음들과 겹치지 않아
    // 큰 장면의 굽기가 받기 시간만큼 늦었다(가짜 WebGL 데우지 않은 1만 — 55차 측정)
    const sc = this.mgScan;
    if (sc && !mergeKit && this.merging.mode === 'auto' && sc.c < this.merging.min && !kitWaiters.has(this.kitNote) && this.mergeSrcOf(r) && ++sc.c >= this.merging.min) this.wantKit();
    if (this.mgScan || (this.mgActive && !mergeKit && !this.mgOff)) {
      this.mgUnfed.push(r);
      this.mgUnfedVerts += Math.floor(r.src.positions.length / 3);
      return;
    }
    // 0.57.0 굽기 기다림에 넣기는 조각(feed — 조각이 없으면 할 일이 없다)
    mergeKit?.feed(this.host, r);
  }

  /** 0.54.0 따로 모아 둔 그물을 굽기 기다림에 넣는다(훑기를 마쳤고 조각이 있을 때 — 꺼졌거나 켜지지 않은 장면이면 버린다) */
  private mergeFeedUnfed(): void {
    if (this.mgScan || !this.mgUnfed.length) return;
    if (!this.mgActive || this.mgOff) {
      this.mgUnfed = [];
      this.mgUnfedVerts = 0;
      return;
    }
    if (!mergeKit) return;
    const list = this.mgUnfed;
    this.mgUnfed = [];
    this.mgUnfedVerts = 0;
    for (const r of list) if (!r.dropped) mergeKit.feed(this.host, r);
  }

  /**
   * 0.54.0 다음 그물(next)을 올리지 않고 이 걸음을 멈출지: 아직 굽지 못하는 동안(훑기 전·중 — 첫 그림 앞이거나 몫이 모자라 — 또는 켜진 장면에서 조각을 받는 중)
   * 굽지 못한 그물(따로 모은 것 + 굽기 기다림)이 굽기 단위(그물 2,048개 − 1 또는 정점 262,144개)에 닿으면. 그래서 그물마다 GL 객체가 한꺼번에 쌓이는 것은 0.53.0과 같은 단위 안이고,
   * 첫 그림 앞에서는 굽지 않는다. 한 번에 다 올릴 때(Infinity)는 멈추지 않는다.
   * 0.55.0: 조각 받기가 기다림 한도를 넘었으면 멈추지 않는다(0.54.0은 받기가 걸린 채 끝나지 않으면 이 걸음에서 멈춘 채 남았다)
   */
  private mergeHold(next: Mesh3d, budgetMs: number): boolean {
    if (budgetMs === Infinity || this.mgOff || mergeKitLate) return false;
    if (!this.mgScan && !(this.mgActive && !mergeKit)) return false;
    const nv = Math.floor(next.positions.length / 3);
    const p = this.pending!;
    // 0.59.0 훑기를 미룬 큰 장면의 첫 그림 앞: 몇 개만 그물마다 올리고 곧 첫 그림을 낸다(이 그물들은 훑기 뒤 곧 구워진다 — MERGE_FIRST_MESHES).
    // 0.60.0 조각이 아직 없어 훑기를 미룬 장면도(그물 수와 상관없이 — 훑기 뒤에는 빛 기록으로 들고 기다린다)
    if (this.mgScan && !this.mgFramed && (p.scene.meshes.length > MERGE_SCAN_FIRST || !mergeKit) && this.mgUnfed.length >= MERGE_FIRST_MESHES) return true;
    // 0.60.0 빛 기록을 들고 조각을 기다리는 동안 마지막 그물은 조각이 올 때까지 올리지 않는다(다 올림 — 남은 기다림 굽기 — 은 조각이 한다)
    if (!mergeKit && p.mi + 1 >= p.scene.meshes.length && (this.mgHold.length > 0 || this.lightWait(next))) return true;
    return this.mgUnfed.length + this.mgWait.length >= MERGE_UPLOAD_MESHES - 1 || this.mgUnfedVerts + this.mgWaitVerts + nv >= MERGE_UPLOAD_VERTS;
  }

  /** 0.54.0 장면 그물을 다 올렸을 때: 남은 훑기를 마치고 모아 둔 그물·기다림을 굽는다(0.53.0은 굽기만). 조각이 없으면 다 올린 뒤 mergeStep이 다시 살핀다(mgDirty) */
  private mergeUploadEnd(): void {
    if (this.mgScan) this.mergeScan(Infinity);
    if (mergeKit && !this.mgOff) {
      this.mergeFeedUnfed();
      mergeKit.flushWait(this.host);
    } else if (this.mgUnfed.length) {
      this.mgUnfed = [];
      this.mgUnfedVerts = 0;
      this.mgDirty = true;
    }
  }

  /** 0.54.0 조각 함수에 넘기는 렌더러 상태(이 렌더러 자신 — MergeHost의 이름은 Renderer3d 멤버와 같다) */
  private get host(): MergeHost {
    return this as unknown as MergeHost;
  }

  /**
   * 0.52.0 묶을 수 있는 그물이면 이은 배열 자료와 묶음 열쇠(같은 열쇠끼리만 잇는다 — 법선 값 꼴·정점 색 유무·한쪽 면), 아니면 null.
   * 묶지 않는 것: 무늬 좌표·뒷면·PBR·반투명(장면 값)·다시 받을 배열이 있는 그물, 그릴 것이 없는 그물, 정점·윤곽선이 한도보다 큰 그물,
   * 배열을 다른 기록과 함께 쓰는 그물(같은 정의 자리 — 인스턴싱 몫, 제자리 고치기가 함께 바뀐다), 코어가 법선을 놓은 그물(이을 배열이 없다).
   * 묶음에 든 그물(다시 굽기 — 다른 묶음으로 옮길 때)도 그물 배열에서 다시 잇는다
   */
  private mergeSrcOf(r: MeshRec): { src: MergeSrc; key: string } | null {
    const m = r.src;
    if (r.uv || r.back || r.pbr || r.transparent || r.miss || r.attrs.uv || r.attrs.buv || !r.count) return null;
    const nv = Math.floor(m.positions.length / 3);
    if (nv > MERGE_MESH_VERTS) return null;
    const ns = r.edges ? r.edges.n : 0;
    if (ns > MERGE_MESH_SEGMENTS) return null;
    for (const s of r.slots) if (s && (this.refs.get(s.key) ?? 0) > 1) return null;
    for (const a of [m.positions, m.normals, m.indices, m.colors, m.edges]) if (a && this.mgShared.has(a)) return null;
    let normals: VertexArray | null = null;
    let per = 3;
    let nk = '-';
    if (r.hasNormals) {
      const na = m.normals;
      const f = na ? normalFormat(na, nv) : null;
      const rf = r.attrs.nrmF;
      if (!na || !f || (rf && (rf.type !== f.type || rf.per !== f.per || rf.normalized !== f.normalized))) return null;
      normals = na;
      per = f.per;
      nk = `${f.type}${f.normalized ? 'n' : ''}${f.per}`;
    }
    const colors = r.hasColors ? (m.colors ?? null) : null;
    if (r.hasColors && (!colors || colors.length < nv * 4)) return null;
    const edges = r.edges && m.edges ? (segmentFix(m.edges).fix ?? m.edges) : null;
    if (r.edges && (!edges || Math.floor(edges.length / 6) < ns)) return null;
    // 그리는 색인(깨진 삼각형을 고친 사본이 먼저 — 묶음에 든 기록은 indexed가 늘 true라 그물 배열로 가린다), 없으면 0, 1, 2…
    const indices = r.tri ?? m.indices ?? null;
    // 정점 색 유무는 열쇠에 넣지 않는다(묶음 색 버퍼에 없는 그물 자리는 0, 그물마다 정점 색 쓰기는 자리 자료 깃발 — 정점 색 그물이 흩어진 장면도 구간이 끊기지 않게)
    return {
      src: { positions: m.positions, nv, normals, per, colors, indices, count: r.count, edges, ns },
      key: `${nk}|${m.doubleSided === false ? 1 : 0}`,
    };
  }

  /**
   * 0.52.0 묶음 굽기를 몫(mergeBudgetMs와 지난 그리기 시간 가운데 큰 것 — 적어도 묶음 하나) 안에서 이어 간다(다 올린 뒤에만 — 올리는 동안은 올리는 걸음이 굽는다).
   * 살필 것이 있으면 먼저 묶음을 나눈다(그물이 문턱보다 적은 'auto' 장면은 훑지 않는다).
   * 0.54.0: 조각이 없으면 켤 수 있는 장면일 때 받기를 걸고 기다린다(그동안 그물마다 — 오면 onMergeReady로 다시 그린다).
   * 0.55.0: 'auto'에서 아직 켜지지 않은 장면은 묶을 수 있는 그물을 세어(mgCanAuto — planLoose가 켤지 정하는 셈) 문턱에 닿을 때만 받는다. 닿지 않으면 살필 것을 지운다
   * (조각이 없으면 묶음도 없어 planLoose가 할 일이 없다 — 그물을 바꾸거나 더하면 다시 센다). 이미 받기를 기다리는 렌더러는 다시 세지 않는다
   */
  private mergeStep(): void {
    if (this.mgOff || this.uploading) return;
    if (!mergeKit) {
      if (!this.mgDirty || !this.mgMay || kitWaiters.has(this.kitNote)) return;
      if (this.merging.mode === 'on' || this.mgActive || this.mgCanAuto()) this.wantKit();
      else this.mgDirty = false;
      return;
    }
    mergeKit.step(this.host);
  }

  /**
   * 0.57.0 이 그물을 그물마다 GL 객체 없이 곧장 구울지(빛 기록 — meshRec light): 이 장면에서 켜졌고 훑기를 마쳤을 때(훑기 전·중은 묶일지 모른다 — 첫 그림을 그물마다 그린다).
   * 앱이 다시 준 배열을 함께 올릴 그물(restoreQ)·코어가 전에 지운 그물(laid — 올린 꼴과 다시 받을 것을 세는 길)·놓기가 법선을 지울 그물(0.56.0도 묶이지 않는다)은 그물마다 길로,
   * 조각 올리기(CHUNK_MIN_BYTES)를 탈 크기가 아니고 훑기가 묶을 수 있어 보인다고 세는 그물일 때만. 어림과 mergeSrcOf(정점 색 반투명 등)가 갈리면 조각 feed가 그 자리에서 그물 버퍼를 만든다.
   * 0.60.0 조각에서 렌더러로 옮겼다(조각을 받는 동안에도 같은 판단으로 빛 기록을 들고 기다린다 — lightWait)
   */
  mergeDirect(m: Mesh3d): boolean {
    if (!this.mgActive || this.mgScan || this.mgOff || this.restoreQ.has(m.id) || this.laid.has(m) || (this.rel?.normals && m.normals)) return false;
    const nv = Math.floor(m.positions.length / 3);
    if (!nv || nv > MERGE_MESH_VERTS || m.texture || m.backTexture || m.backColor || pbrSource(m) || !(m.color[3] >= 0.999)) return false;
    if ((m.edges ? m.edges.length / 6 : 0) > MERGE_MESH_SEGMENTS) return false;
    if ([m.positions, m.normals, m.indices, m.colors, m.edges].some((a) => !!a && this.mgShared.has(a))) return false;
    // 그물 배열 바이트 합이 조각 올리기 문턱 안(chunkFor로 나눠 올리지 않을 크기 — 같은 배열·이미 올린 배열을 빼지 않은 위 한계)
    let n = 0;
    for (const a of [m.positions, m.normals, m.colors, m.uvs, m.backUvs, m.indices, m.edges]) n += a?.byteLength ?? 0;
    return n <= CHUNK_MIN_BYTES;
  }

  /**
   * 0.60.0 조각을 받는 동안(켜진 장면·훑기를 마침·기다림 한도 안) 곧장 구울 그물이면 GL 객체 없이 빛 기록으로 들고 기다린다(조각이 오면 곧장 굽는다).
   * 0.59.0은 그물마다 버퍼·VAO를 만들어 그리고 조각이 오면 구웠다(1만 — 걸음 사이 버퍼 2,607개). 받지 못하거나 늦으면 holdOut이 그물 버퍼로 돌린다
   */
  private lightWait(m: Mesh3d): boolean {
    return !mergeKit && !mergeKitLate && !mergeKitFailed && kitWaiters.has(this.kitNote) && this.mergeDirect(m);
  }

  /**
   * 0.60.0 들고 있던 기록을 모두 보이는 목록으로(빛 기록은 그물 버퍼로 — 장면 차례 그대로). 조각이 있으면 조각 unhold, 없으면(받는 중·늦음·실패) 여기서.
   * 걸음 사이에 앱이 그물을 바꾸거나 빼거나 묶어 그리기를 끌 때, 받기가 늦거나 실패할 때, 다 올리라는 걸음(그림 저장)
   */
  private holdOut(): void {
    if (!this.mgHold.length) return;
    if (mergeKit) {
      mergeKit.unhold(this.host);
      return;
    }
    for (const r of this.mgHold) if (r.light) Object.assign(r, this.meshRec(r.src), { light: false });
    this.gl.bindVertexArray(null);
    for (const r of this.mgHold) this.meshes.push(r);
    this.mgHold = [];
  }

  /** 0.60.0 그리기 뼈대와 그것으로 다시 쓰던 목록을 잊는다(장면을 비울 때 — 옛 기록을 붙들지 않게) */
  private forgetOrder(): void {
    this.mgOrder = null;
    this.visMemo = null;
    this.hiMemo = null;
  }

  /**
   * 0.60.0 이 그리기에서 쓸 그리기 뼈대(조각 orderBuild): 다 올렸고(올리는 동안은 장면 차례가 걸음마다 바뀐다) 구운 묶음이 있을 때만, 맞지 않으면 다시 만든다
   */
  private orderNow(): MergeOrder | null {
    if (!mergeKit || this.orderOff || !this.mgGroups.size || this.uploading || this.mgHold.length) {
      if (this.mgOrder) this.forgetOrder();
      return null;
    }
    const o = this.mgOrder;
    if (o && mergeKit.orderValid(this.host, o)) return o;
    this.visMemo = null;
    this.hiMemo = null;
    return (this.mgOrder = mergeKit.orderBuild(this.host));
  }

  /**
   * 0.52.0 묶어 그리기 선택 바꾸기: 'off'면 묶음에 든 그물을 모두 그물마다 버퍼로 되돌리고(장면 배열에서 다시 올린다) 묶음을 지운다.
   * 'on'·'auto'로 바꾸면 다음 그리기에서 다시 살핀다('on'은 곧 켜고, 'auto'는 묶을 수 있는 그물이 문턱 이상일 때)
   */
  setMerging(o: MergingOptions): void {
    this.merging = { mode: o.mode, min: Math.max(2, Math.floor(o.min) || MERGE_AUTO_MIN) };
    this.mgDirty = true;
    if (o.mode === 'off') {
      this.mergeUnstore();
      this.mgActive = false;
      // 0.54.0 미뤄 둔 훑기·모아 둔 그물도 버린다(그물마다 그대로)
      this.mgScan = null;
      this.mgUnfed = [];
      this.mgUnfedVerts = 0;
    } else if (o.mode === 'on') {
      this.mgActive = true;
      if (!this.mgOff) this.wantKit();
    }
  }

  /** 0.52.0 묶음에 든 그물을 모두 그물마다 버퍼로 되돌린다(그물 배열에서 다시 올린다 — 묶음은 쓰는 기록이 없어져 지운다) */
  private mergeUnstore(): void {
    // 0.58.0 들고 있던 빛 기록을 먼저 그물 버퍼로(묶어 그리기를 끄면 다시 구울 일이 없다 — 0.60.0 조각을 받는 중이어도)
    this.holdOut();
    this.mgQueue = [];
    this.mgWait = [];
    this.mgWaitVerts = 0;
    for (let k = 0; k < this.meshes.length; k++) if (this.meshes[k]!.mg) this.installMesh(this.meshes[k]!.src, k);
    this.gl.bindVertexArray(null);
  }

  /**
   * 0.52.0 굽기를 기다리는 묶음 수(0이 아니면 뷰어가 다음 프레임에 다시 그린다 — 그동안 그 그물은 그물마다 그린다).
   * 0.53.0: 켜진 장면에서 다시 굽기 차례를 아직 정하지 않았으면(그물을 바꾸거나 빼거나 선택을 바꾼 뒤 다음 그리기 전) 1을 더한다 — 빼기는 52차처럼 곧 줄에 넣지 않으므로
   * 그 사이에도 기다리는 것이 있다고 알린다(정한 뒤 할 일이 없으면 0).
   * 0.54.0: 묶어 그리기 조각을 받는 중이고 이 장면에서 켤 수 있으면 1(stats.merged.pending — 다 구울 때까지 기다리는 쪽이 조각도 기다리게). 뷰어의 다시 그리기는 mergeSteps로.
   * 0.55.0: 받기가 기다림 한도를 넘었으면(mergeKitLate) 조각을 기다리지 않는다 — 0(걸린 받기를 기다리는 앱이 멈춘 채 남지 않게. 오면 그때부터 다시 센다).
   * 0.56.0: 통째로 미룬 한 번에 올리기는 올릴 때까지 1(조각을 기다리는 동안과, 오거나 늦은 뒤 다음 걸음이 올리기 전 — 다 구울 때까지 기다리는 쪽이 그 올리기도 기다리게)
   */
  get mergePending(): number {
    if (this.mgOff) return 0;
    if (this.pending?.whole) return 1;
    if (this.uploading) return 0;
    return this.mergeSteps + (!mergeKit && !mergeKitLate && this.mgDirty && this.mgMay ? 1 : 0);
  }

  /** 0.54.0 다음 그리기에서 할 굽기 일(굽기 줄 + 차례를 정할 것 — 조각이 있을 때만). 0이 아니면 뷰어가 다음 프레임을 건다(조각을 받는 동안은 걸지 않고 onMergeReady로) */
  get mergeSteps(): number {
    if (this.mgOff || this.uploading || !mergeKit) return 0;
    return this.mgQueue.length + (this.mgDirty && this.mgActive ? 1 : 0);
  }

  /** 0.54.0 지난 올리기 걸음이 묶어 그리기 조각을 기다려 멈췄는지(뷰어는 프레임을 거듭 걸지 않는다 — 조각이 오면 onMergeReady) */
  get uploadHeld(): boolean {
    return this.mgHeld && !!this.pending && !mergeKit && !this.mgOff && !mergeKitLate;
  }

  /** 0.52.0 묶음 상태: 구운 묶음 수·묶음에 든 그물 수·묶음 버퍼 바이트·굽기를 기다리는 묶음 수·굽기에 쓴 ms 합·이 장면에서 켜졌는지 */
  get mergeInfo(): { groups: number; items: number; bytes: number; pending: number; bakeMs: number; active: boolean } {
    let items = 0;
    for (const g of this.mgGroups) items += g.live;
    return { groups: this.mgGroups.size, items, bytes: this.mgBytes, pending: this.mergePending, bakeMs: Math.round(this.mergeBakeMs * 10) / 10, active: this.mgActive };
  }

  /**
   * 0.52.0 묶음 하나 굽기: 그동안 바뀌거나 빠진 그물·첫 그물과 열쇠가 다른 그물은 빼고 잇는다(둘 이상일 때만). 버퍼는 그물 버퍼와 같은 성분으로 센다
   * (stats.buffers — 그물 번호는 'indices'·'edges'). VAO는 그물 VAO와 같은 속성 꼴에 그물 번호(위치 5)를 더한다.
   * 구운 뒤 그물마다 버퍼·VAO(그리고 구간 모음·삼각형 변 — 다시 쓸 때 묶음 것으로 다시 만든다)를 놓고 그물 기록이 묶음 저장소를 가리키게 한다.
   * 다시 굽는 묶음(rebuild)의 그물은 옛 묶음에서 옮긴다. 0.54.0: 굽기는 조각(mergegl bake — 0.53.0과 같은 GL 호출 차례)
   */
  mergeBake(list: readonly MeshRec[]): void {
    mergeKit?.bake(this.host, list);
  }

  /** 0.42.0 선 자리 자료: 자리마다 drawLines와 같은 시점·투영 · 모형(그리고 안개면 setLineFog와 같은 시점 · 모형의 z 행)을 5텍셀씩. 올린 첫 텍셀 번호(−1 = 못 올림) */
  private instLines(f: ViewFrame, models: readonly (ArrayLike<number> | undefined)[], fog: boolean): number {
    const n = models.length;
    if (!this.instReserve(n * INST_LINE)) return -1;
    const d = this.instBuf;
    for (let i = 0; i < n; i++) {
      const model = models[i];
      const mvp = model ? mat4Mul(f.viewProj, model, this.d4a) : f.viewProj;
      const o = i * INST_LINE * 4;
      for (let k = 0; k < 16; k++) d[o + k] = mvp[k]!;
      if (fog) {
        const mv = model ? mat4Mul(f.view, model, this.d4b) : f.view;
        d[o + 16] = mv[2]!;
        d[o + 17] = mv[6]!;
        d[o + 18] = mv[10]!;
        d[o + 19] = mv[14]!;
      } else d.fill(0, o + 16, o + 20);
    }
    return this.instPut(n * INST_LINE);
  }

  /**
   * 0.42.0 같은 선분 기록(그물 윤곽선 — 여러 자리가 함께 쓰는 배열)을 자리 여럿에 그리기 한 번으로. drawLines와 같은 프로그램 고르기·균일 변수(자리 행렬만
   * 자리 자료 그림에서)와 같은 굵은 선·가는 선 판정이다(first = 0, 선분 모두 — 단면 평면 없이). 굵은 선은 선분 속성의 나눔 수를 자리 수로 바꿔 그리고 되돌린다.
   * wire를 주면 그 VAO·색인으로 삼각형 변(gl.LINES 색인 그리기)을 가는 선으로. 자리 자료 그림이 모자라면 false(그리지 않았다 — 부르는 쪽이 자리마다 그린다)
   */
  private drawLinesInst(
    f: ViewFrame,
    r: LineRec | null,
    models: readonly (ArrayLike<number> | undefined)[],
    o: { color: Rgba; vcol: boolean; width: number; dashed: boolean; alpha: number; bias?: number; noFog?: boolean; capz?: boolean },
    st: RenderState,
    stats: RenderStats,
    wire?: { vao: WebGLVertexArrayObject; count: number } | null,
  ): boolean {
    const gl = this.gl;
    const n = models.length;
    if (!r && !wire) return false;
    const fog = !o.noFog && st.fog ? st.fog : null;
    const wDev = o.width * st.dpr;
    const fast = !!r && st.interacting && r.n > FAST_LINES_WHILE_MOVING;
    const wide = !!r && !wire && !fast && (o.dashed || wDev > 1.01);
    // 변종이 아직 번역 중이면 그리지 않는다(부르는 쪽이 자리마다)
    const p = this.instVariant(wide ? 'wide' : 'thin', [...(wide && o.capz ? ['CAPZ'] : []), ...(fog ? ['FOG'] : [])]);
    if (!p) return false;
    const base = this.instLines(f, models, !!fog);
    if (base < 0) return false;
    gl.useProgram(p.p);
    if (fog) {
      gl.uniform4f(this.loc(p, 'u_fogCol'), fog.color[0], fog.color[1], fog.color[2], 1);
      gl.uniform2f(this.loc(p, 'u_fog'), fog.start, fog.end);
    }
    gl.uniform1i(this.loc(p, 'u_inst'), INST_UNIT);
    gl.uniform1i(this.loc(p, 'u_instBase'), base);
    gl.uniform1i(this.loc(p, 'u_instN'), n);
    gl.uniform4f(this.loc(p, 'u_color'), o.color[0], o.color[1], o.color[2], o.color[3]);
    gl.uniform1f(this.loc(p, 'u_vcol'), o.vcol ? 1 : 0);
    gl.uniform1f(this.loc(p, 'u_alpha'), o.alpha);
    gl.uniform4f(this.loc(p, 'u_override'), 0, 0, 0, 0);
    gl.uniform1f(this.loc(p, 'u_bias'), o.bias ?? 0);
    if (wide && r) {
      if (st.viewport) gl.uniform2f(this.loc(p, 'u_viewport'), st.viewport[0], st.viewport[1]);
      else gl.uniform2f(this.loc(p, 'u_viewport'), gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(this.loc(p, 'u_width'), wDev);
      gl.uniform2f(this.loc(p, 'u_dash'), o.dashed ? DASH[0] * st.dpr : 0, DASH[1] * st.dpr);
      gl.uniform4f(this.loc(p, 'u_clip'), NO_CLIP[0], NO_CLIP[1], NO_CLIP[2], NO_CLIP[3]);
      gl.bindVertexArray(r.wide);
      // 인스턴스 = 선분 × 자리: 선분 속성은 자리 수마다 한 칸(셰이더의 자리 = gl_InstanceID % u_instN)
      const at = r.col ? [1, 2, 3, 4] : [1, 2];
      for (const a of at) gl.vertexAttribDivisor(a, n);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, r.n * n);
      for (const a of at) gl.vertexAttribDivisor(a, 1);
    } else if (wire) {
      gl.bindVertexArray(wire.vao);
      gl.drawElementsInstanced(gl.LINES, wire.count, gl.UNSIGNED_INT, 0, n);
    } else {
      gl.bindVertexArray(r!.thin);
      gl.drawArraysInstanced(gl.LINES, 0, r!.n * 2, n);
    }
    stats.drawCalls++;
    stats.segments += (wire ? wire.count / 2 : r!.n) * n;
    this.instStats.draws++;
    this.instStats.items += n;
    return true;
  }

  /** 배열을 이미 올렸는지(버퍼 표에 그 열쇠가 있는지) */
  private hasBuf(data: UploadArray, target: BufferTarget): boolean {
    const k = this.keys.get(data);
    return !!k && (target === 'element' ? this.elemBufs : this.arrayBufs).has(k);
  }

  /** 배열의 GPU 버퍼(이미 올린 배열이면 그 버퍼). part = 처음 올릴 때 셀 성분(0.28.0) */
  private arrayBuf(data: VertexArray, part: GpuBufferPart): WebGLBuffer {
    const k = this.keyOf(data);
    let b = this.arrayBufs.get(k);
    if (b) return b;
    const gl = this.gl;
    b = this.newBuffer(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW, part);
    this.arrayBufs.set(k, b);
    return b;
  }

  private elemBuf(data: Uint32Array, part: GpuBufferPart): WebGLBuffer {
    const k = this.keyOf(data);
    let b = this.elemBufs.get(k);
    if (b) return b;
    const gl = this.gl;
    b = this.newBuffer(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW, part);
    this.elemBufs.set(k, b);
    return b;
  }

  private vao(): WebGLVertexArrayObject {
    const v = this.gl.createVertexArray()!;
    this.vaos.add(v);
    this.gl.bindVertexArray(v);
    return v;
  }

  /**
   * 장면 올리기(이전 것은 지운다). incremental이면 여기서는 비우기만 하고, uploadSome()을 부를 때마다 묶음을 몇 개씩 올린다
   * (올라간 묶음부터 그린다 — 큰 모형에서 화면이 멈추지 않게).
   * 0.56.0: 한 번에 올리는 장면이 묶어 그리기를 켤 장면이고 조각을 받는 중이면 아무것도 올리지 않고 미룬다(pending.whole — uploading, uploadHeld).
   * 조각이 오면(늦음·실패·끔도) 다음 uploadSome이 한 번에 다 올린다
   */
  setScene(scene: Scene3d, opts: { incremental?: boolean; release?: ReleaseFlags | null } = {}): void {
    this.clear(true);
    this.rel = opts.release ?? null;
    this.syncTextures(scene);
    // 0.52.0 이 장면에서 묶어 그리기를 켤지('auto' 문턱)·함께 쓰는 배열. 0.54.0: 나눠 올리면 훑기를 첫 그림 뒤로 미룬다
    this.mergePrescan(scene, !!opts.incremental);
    if (opts.incremental) {
      this.pending = { scene, mi: 0, li: 0, pi: 0 };
      this.mgFramed = false;
      return;
    }
    // 0.56.0 켜질 장면(훑기가 묶을 수 있는 그물을 문턱만큼 셌거나 'on')인데 조각을 받는 중이면 올리기를 통째로 미룬다. 0.55.0은 여기서 그물마다 버퍼·VAO를
    // 모두 만들고 조각이 오면 구웠다(STEP 66차 가짜 WebGL: 서로 다른 부품 2~3천 개에서 GL 버퍼 1만 개 남짓 — 미리 받으면 19개). 조각이 오면 다음 걸음이
    // 미리 받은 setScene과 같은 길(uploadWhole — 굽기 단위마다 곧 굽는다)로 올린다
    if (this.wholeHold(scene)) {
      this.pending = { scene, mi: 0, li: 0, pi: 0, whole: true };
      this.mgHeld = true;
      return;
    }
    this.uploadWhole(scene);
  }

  /**
   * 0.56.0 한 번에 올리는 장면을 조각이 올 때까지 미룰지: 묶어 그리기를 쓰고(끔·조각 실패·변종 실패가 아님) 이 장면에서 켜졌고(mgActive — 'auto'면 훑기가 묶을 수 있는
   * 그물을 문턱만큼 셌다) 그물이 문턱 이상이며, 조각이 아직 없고 받기가 기다림 한도 안이며 이 렌더러가 받기 알림을 기다릴 때
   */
  private wholeHold(scene: Scene3d): boolean {
    return !mergeKit && !this.mgOff && !mergeKitLate && this.mgActive && scene.meshes.length >= this.merging.min && kitWaiters.has(this.kitNote);
  }

  /** 0.56.0 통째로 미룬 한 번에 올리기를 아직 기다리는지(조각을 받는 중이고 기다림 한도 안, 묶어 그리기가 이 장면에서 켜진 채) */
  private get wholeWait(): boolean {
    return !!this.pending?.whole && !mergeKit && !this.mgOff && !mergeKitLate && this.mgActive;
  }

  /** 장면을 한 번에 올린다(setScene — 0.56.0 통째로 미룬 것은 다음 걸음 uploadSome에서). 미룬 동안 앱이 다시 준 배열(문맥 복구 — restoreMeshArrays)이 있으면 함께 올린다 */
  private uploadWhole(scene: Scene3d): void {
    for (const m of scene.meshes) {
      // 0.57.0 곧장 구울 수 있는 그물은 그물마다 버퍼·VAO를 만들지 않고 기록만(빛 기록 — 묶음이 찰 때 구워 묶음 버퍼가 저장소가 되고, 못 들면 그때 그물 버퍼를 만든다)
      const light = !!mergeKit && mergeKit.direct(this.host, m);
      const give = this.restoreQ.get(m.id) ?? null;
      this.restoreQ.delete(m.id);
      const r = this.sceneMeshRec(m, { give, light });
      this.meshes.push(r);
      // 0.52.0 묶을 그물이 모이면 곧 굽고 그물 버퍼를 놓는다(그물이 아주 많아도 GL 객체가 쌓이지 않게 — 0.54.0 조각이 아직 없으면 다 올린 뒤 mergeStep이)
      this.mergeOffer(r);
    }
    this.mergeUploadEnd();
    for (const l of scene.lines) this.lines.push(this.sceneLineRec(l));
    for (const p of scene.points ?? []) this.points.push(this.scenePointRec(p));
    this.gl.bindVertexArray(null);
  }

  /** 나눠 올리는 중인지(장면 나눠 올리기 또는 0.11.0 그물 바꾸기 나눠 올리기) */
  get uploading(): boolean {
    return !!this.pending || this.jobs.size > 0;
  }

  /**
   * 아직 올리는 중인 것이 있는지(0.29.0 — 문맥을 되찾은 뒤 끝 알림): 나눠 올리기(uploading) 또는 무늬를 푸는 중(줄 선 것·푸는 중·앱이 다시 준 원본을 푸는 중).
   * 앱이 다시 줄 때까지 기다리는 무늬('missing')·풀지 못한 무늬는 들지 않는다(앞은 restoreNeed가 센다)
   */
  get uploadBusy(): boolean {
    return this.uploading || this.texturesBusy;
  }

  /** 무늬를 푸는 중인지(0.29.0 — 줄 선 것·푸는 중·앱이 다시 준 원본을 푸는 중이 있다) */
  get texturesBusy(): boolean {
    for (const r of this.textures.values()) if (r.state === 'queued' || r.state === 'decoding' || r.state === 'restoring') return true;
    return false;
  }

  /** 0.59.0 지난 그리기 뒤 그리기 목록에 새 기록이 들어왔는지(나눠 올리는 걸음이 빛 기록만 모으면 false — 다시 그려도 같은 그림) */
  get uploadNews(): boolean {
    return this.meshes.length + this.lines.length + this.points.length !== this.drawnRecs;
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
    if (!p && !this.jobs.size) return true;
    const t0 = performance.now();
    let first = true;
    this.gl.bindVertexArray(null);
    this.mgHeld = false;
    if (p?.whole) {
      // 0.56.0 통째로 미룬 한 번에 올리기: 조각을 기다리는 동안은 멈춘다(뷰어는 프레임을 거듭 걸지 않는다 — 오면 onMergeReady). 오거나 늦거나 받지 못했거나 묶어 그리기를
      // 껐거나 다 올리라는 걸음(Infinity — 그림 저장)이면 한 번에 다 올린다(몫을 보지 않는다 — 미루지 않은 setScene과 같다)
      if (budgetMs !== Infinity && this.wholeWait) {
        this.mgHeld = true;
        return false;
      }
      this.pending = null;
      this.uploadWhole(p.scene);
    } else if (p) {
      // 0.54.0 미뤄 둔 장면 훑기: 첫 그림 뒤(한 번에 다 올릴 때는 곧) 이 걸음 몫 안에서 이어 가고, 마쳤고 조각이 있으면 모아 둔 그물을 굽기 기다림에 넣는다
      if (this.mgScan && (this.mgFramed || budgetMs === Infinity)) this.mergeScan(budgetMs === Infinity ? Infinity : t0 + budgetMs);
      this.mergeFeedUnfed();
      // 0.58.0 걸음 사이에 묶어 그리기가 꺼졌으면(변종 실패) 들고 있던 빛 기록은 구울 일이 없다 — 그물 버퍼로.
      // 0.60.0 조각을 받는 동안 들고 있던 빛 기록도: 받기가 끝나지 않았는데 다 올리라는 걸음(그림 저장)이면 기다리지 않고 그물 버퍼로
      if (this.mgOff || (!mergeKit && budgetMs === Infinity)) this.holdOut();
    }
    while (this.pending && (first || performance.now() - t0 < budgetMs)) {
      const s = p!.scene;
      const pts = s.points ?? [];
      const kind = p!.mi < s.meshes.length ? 'mesh' : p!.li < s.lines.length ? 'line' : p!.pi < pts.length ? 'point' : null;
      if (!kind) {
        this.pending = null;
        break;
      }
      // 0.54.0 아직 굽지 못하는 동안 굽지 못한 그물이 굽기 단위에 닿았으면 이 걸음을 멈춘다(첫 그림 앞·훑기 중은 다음 걸음에, 조각을 기다리면 조각이 온 뒤에 잇는다)
      if (kind === 'mesh' && p!.chunk === undefined && this.mergeHold(s.meshes[p!.mi]!, budgetMs)) {
        this.mgHeld = !this.mgScan;
        break;
      }
      // 0.60.0 조각을 받는 동안 곧장 구울 그물은 GL 객체 없이 빛 기록으로 들고(그리지 않는다) 굽기 기다림에 모은다 — 조각이 오면 위 mergeFeedUnfed가 넣고 단위가 차면 굽는다
      if (kind === 'mesh' && p!.chunk === undefined && budgetMs !== Infinity && this.lightWait(s.meshes[p!.mi]!)) {
        first = false;
        const r = this.sceneMeshRec(s.meshes[p!.mi++]!, { light: true });
        this.mgHold.push(r);
        this.mergeOffer(r);
        continue;
      }
      // 0.57.0 곧장 구울 그물이면 GL 객체 없이 잇는다(0.58.0: 몫이 다하면 빛 기록을 mgHold에 들고 돌아간다. 굽기를 다음 걸음으로 미뤘으면 이번 걸음은 여기까지)
      if (kind === 'mesh' && p!.chunk === undefined && mergeKit?.direct(this.host, s.meshes[p!.mi]!)) {
        const waited = mergeKit.run(this.host, p!, t0, budgetMs, first);
        first = false;
        this.gl.bindVertexArray(null);
        if (waited) break;
        if (p!.mi >= s.meshes.length && p!.li >= s.lines.length && p!.pi >= pts.length) this.pending = null;
        continue;
      }
      first = false;
      const item = kind === 'mesh' ? s.meshes[p!.mi]! : kind === 'line' ? s.lines[p!.li]! : pts[p!.pi]!;
      // 큰 묶음: 버퍼를 잡고 조각 하나씩 채운다(다 채울 때까지 그 묶음 기록은 만들지 않는다)
      if (p!.chunk === undefined) p!.chunk = this.chunkFor(this.uploadArrays(kind, item));
      // 버퍼 잡기(크기만큼 0 채우기)는 이번 걸음 몫을 이미 썼으면 다음 프레임 처음으로 미룬다
      if (p!.chunk && p!.chunk.nextIsAlloc && performance.now() - t0 > budgetMs / 2 && budgetMs !== Infinity) break;
      if (p!.chunk && !p!.chunk.step()) continue;
      p!.chunk = undefined;
      if (kind === 'mesh') {
        const m = s.meshes[p!.mi++]!;
        // 0.25.0: 차례가 오기 전에 앱이 다시 준 배열(문맥 복구)이 있으면 함께 올린다
        const give = this.restoreQ.get(m.id) ?? null;
        this.restoreQ.delete(m.id);
        const r = this.sceneMeshRec(m, { give });
        // 0.58.0 앞선 빛 기록을 들고 있으면 장면 차례를 지키려고 함께 든다(그 빛 기록이 구워지면 차례대로 보인다)
        (this.mgHold.length ? this.mgHold : this.meshes).push(r);
        // 0.52.0 묶을 그물이 모이면 이 걸음 안에서 굽고 그물 버퍼를 놓는다(그물을 다 올리면 남은 것도 — 0.54.0 훑기 전·중·조각을 받는 중이면 모아 둔다)
        this.mergeOffer(r);
        if (p!.mi >= s.meshes.length) this.mergeUploadEnd();
        if (this.mgHold.length) mergeKit?.drain(this.host);
      } else if (kind === 'line') this.lines.push(this.sceneLineRec(s.lines[p!.li++]!));
      else this.points.push(this.scenePointRec(pts[p!.pi++]!));
      this.gl.bindVertexArray(null);
      if (p!.mi >= s.meshes.length && p!.li >= s.lines.length && p!.pi >= pts.length) this.pending = null;
    }
    // 0.11.0 그물 바꾸기 나눠 올리기: 장면 나눠 올리기를 마친 뒤 같은 몫 안에서 차례로(다 채운 그물부터 기록을 바꾼다)
    while (!this.pending && this.jobs.size && (first || performance.now() - t0 < budgetMs)) {
      const [id, j] = this.jobs.entries().next().value!;
      if (!first && j.chunk.nextIsAlloc && performance.now() - t0 > budgetMs / 2 && budgetMs !== Infinity) break;
      first = false;
      if (!j.chunk.step()) continue;
      this.jobs.delete(id);
      this.gl.bindVertexArray(null);
      this.installMesh(j.mesh, this.meshes.findIndex((r) => r.src.id === id), { keep: j.keep });
    }
    this.gl.bindVertexArray(null);
    return !this.pending && !this.jobs.size;
  }

  /** 새로 올릴 배열이 CHUNK_MIN_BYTES를 넘으면 조각 올리기(버퍼는 잡는 대로 배열 표에 넣는다), 아니면 null */
  private chunkFor(list: readonly (UploadEntry | null)[]): ChunkedUpload<WebGLBuffer> | null {
    const arrays = newArrays(list, (d) => this.hasBuf(d, d instanceof Uint32Array ? 'element' : 'array'));
    const bytes = arrays.reduce((n, a) => n + a.data.byteLength, 0);
    if (bytes <= CHUNK_MIN_BYTES) return null;
    // 0.28.0: 잡은 버퍼를 그 배열의 성분으로 센다(같은 배열은 앞 자리 성분 — arrayBuf와 같다)
    const parts = new Map<UploadArray, GpuBufferPart>();
    for (const a of list) if (a && !parts.has(a.data)) parts.set(a.data, a.part);
    return new ChunkedUpload(
      arrays,
      this.bufferSink(),
      (d, t, b) => {
        (t === 'element' ? this.elemBufs : this.arrayBufs).set(this.keyOf(d), b);
        this.retag(b, parts.get(d) ?? 'overlay');
      },
      CHUNK_BYTES,
    );
  }

  /**
   * 묶음 하나가 GPU에 올리는 배열(meshRec·lineRec·pointRec가 arrayBuf·elemBuf로 올리는 것과 같은 조건 — 나눠 올리기에서 미리 채운다)
   */
  private uploadArrays(kind: 'mesh' | 'line' | 'point', item: Mesh3d | LineSet3d | PointSet3d): (UploadEntry | null)[] {
    const A = (data: VertexArray | undefined | false | null, part: GpuBufferPart): UploadEntry | null => (data ? { data, target: 'array', part } : null);
    if (kind === 'point') return [A(item.positions, 'points')];
    if (kind === 'line') {
      const l = item as LineSet3d;
      const n = Math.floor(l.positions.length / 6);
      // 0.50.0: 깨진 끝점 선분을 NaN으로 바꾼 사본(lineRec와 같은 배열)
      return [A(segmentFix(l.positions).fix ?? l.positions, 'lines'), A(l.colors && l.colors.length >= n * 8 && l.colors, 'lineColors')];
    }
    const m = item as Mesh3d;
    const nv = Math.floor(m.positions.length / 3);
    const buvs = m.backTexture ? (m.backUvs ?? m.uvs) : undefined;
    // 0.50.0: 깨진 삼각형을 넓이 0으로 바꾼 색인 사본(meshRec와 같은 배열)
    const I = triangleFix(m.positions, m.indices)?.indices ?? m.indices;
    return [
      A(m.positions, 'positions'),
      A(!!m.normals && !!normalFormat(m.normals, nv) && m.normals, 'normals'),
      A(!!m.colors && m.colors.length >= nv * 4 && m.colors, 'colors'),
      A(!!uvComponents(m) && (!!m.texture || pbrNeedsUv(m)) && m.uvs, 'uvs'),
      A(!!buvs && !!uvComponents(m, buvs) && buvs, 'backUvs'),
      I ? { data: I, target: 'element', part: 'indices' } : null,
      A(hasMeshEdges(m) && (segmentFix(m.edges!).fix ?? m.edges), 'edges'),
    ];
  }

  /** WebGL2 버퍼 만들기·채우기(나눠 올리기). 그물 VAO를 건드리지 않게 묶인 VAO는 비운 채로 부른다 */
  private bufferSink(): BufferSink<WebGLBuffer> {
    const gl = this.gl;
    const T = (t: BufferTarget): number => (t === 'element' ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER);
    return {
      // 0.28.0: 성분은 잡은 뒤(chunkFor의 onAlloc) 그 배열의 것으로 바꾼다
      alloc: (t, bytes) => this.newBuffer(T(t), bytes, gl.STATIC_DRAW, 'overlay'),
      write: (b, t, off, src, srcOffset, length) => {
        gl.bindBuffer(T(t), b);
        gl.bufferSubData(T(t), off, src, srcOffset, length);
      },
    };
  }

  private sceneLineRec(l: LineSet3d): LineRec & { src: LineSet3d } {
    const r = this.lineRec(l.id, l.group, l.positions, l.colors, 'lines');
    if (hasOrigin(l.origin)) r.model = translation(l.origin);
    this.retain(this.slotsOf(this.uploadArrays('line', l)));
    return { ...r, src: l };
  }

  /**
   * 장면 그물 기록(쓰는 버퍼 자리를 센다). 0.25.0: 놓기 선택이 있으면 올린 뒤 그 배열을 그물에서 지운다(strip).
   * from·keep·give는 meshRec 참고
   */
  private sceneMeshRec(m: Mesh3d, o: { from?: MeshRec | null; keep?: boolean; give?: MeshArrays | null; light?: boolean } = {}): MeshRec {
    const r = this.meshRec(m, o);
    this.retain(r.slots);
    this.strip(m, r);
    return r;
  }

  /** 장면 점 묶음 기록(쓰는 배열을 센다) */
  private scenePointRec(p: PointSet3d): PointRec {
    const r = this.pointRec(p);
    this.retain(this.slotsOf(this.uploadArrays('point', p)));
    return r;
  }

  /** 올리는 배열 목록 → 버퍼 자리(열쇠) */
  private slotsOf(list: readonly ({ data: UploadArray; target: BufferTarget } | null)[]): (Slot | null)[] {
    return list.map((a) => (a ? { key: this.keyOf(a.data), target: a.target, stride: 0 } : null));
  }

  /** 묶음 하나가 쓰는 버퍼 자리(같은 열쇠는 한 번)마다 쓰는 기록 수를 하나 늘린다 */
  private retain(slots: readonly (Slot | null)[]): void {
    const seen = new Set<BufKey>();
    for (const s of slots) {
      if (!s || seen.has(s.key)) continue;
      seen.add(s.key);
      this.refs.set(s.key, (this.refs.get(s.key) ?? 0) + 1);
    }
  }

  /** retain의 반대: 아무도 쓰지 않게 된 버퍼는 지운다(0.25.0 — 기록이 기억한 열쇠로, 배열을 보지 않고) */
  private release(slots: readonly (Slot | null)[]): void {
    const seen = new Set<BufKey>();
    for (const s of slots) {
      if (!s || seen.has(s.key)) continue;
      seen.add(s.key);
      const n = (this.refs.get(s.key) ?? 0) - 1;
      if (n > 0) this.refs.set(s.key, n);
      else {
        this.refs.delete(s.key);
        this.freeKey(s.key, s.target);
      }
    }
  }

  /** 열쇠의 GPU 버퍼를 지운다(있으면) */
  private freeKey(key: BufKey, target: BufferTarget): void {
    const map = target === 'element' ? this.elemBufs : this.arrayBufs;
    const b = map.get(key);
    if (!b) return;
    this.dropBuffer(b);
    map.delete(key);
  }

  /** 끊긴 조각 올리기가 잡은 버퍼 가운데 아무 기록도 쓰지 않는 것을 지운다 */
  private dropChunk(list: readonly ({ data: UploadArray; target: BufferTarget } | null)[]): void {
    for (const a of list) {
      const k = a ? this.keys.get(a.data) : undefined;
      if (a && k && !this.refs.has(k)) this.freeKey(k, a.target);
    }
  }

  /**
   * 0.25.0 놓기: 올린 그물의 법선·무늬 좌표를 그물 객체에서 지우고(놓기 선택에 든 것만) 올린 꼴을 기억한다.
   * 그 뒤 코어는 이 배열을 다시 읽지 않는다(무늬 쓰임 셈·다시 묶기는 기록과 꼴로, 문맥 복구는 앱이 restoreMeshArrays로 다시 준다)
   */
  private strip(m: Mesh3d, r: MeshRec): void {
    const rel = this.rel;
    if (!rel || (!rel.normals && !rel.uvs)) return;
    if (r.lay) this.laid.set(m, r.lay);
    try {
      if (rel.normals && m.normals !== undefined) delete m.normals;
      if (rel.uvs) {
        if (m.uvs !== undefined) delete m.uvs;
        if (m.backUvs !== undefined) delete m.backUvs;
      }
    } catch {
      // 얼린 그물 객체: 지우지 못해도 코어는 다시 읽지 않는다(앱이 쥔 배열만 남는다)
    }
  }

  /**
   * 그물 하나 넣기·바꾸기(0.11.0 — Viewer3d.setMesh). scene은 바꾼 뒤의 장면(무늬 맞추기, 나눠 올리는 중인 장면 갈아 끼우기).
   * 다른 묶음의 GPU 버퍼·기록은 건드리지 않는다. 같은 id가 있으면 그 자리에서 바꾸고, 없으면 끝에 더한다.
   * - 앞 그물과 같은 배열 객체는 바뀌지 않았다고 보고 다시 올리지 않는다. vertices를 주면 정점 속성 배열(위치·법선·색·무늬 좌표)의
   *   그 정점 구간만 바뀌었다고 보고 그 구간만 bufferSubData로 올린다(같은 배열 객체든, 앞 버퍼를 물려받는 새 배열이든)
   * - 새 배열은 앞 그물의 같은 자리 배열을 이 그물만 쓰고 바이트 크기가 같으면 그 GPU 버퍼에 bufferSubData로 채우고(vertices가 있으면 그 구간만),
   *   아니면 새 버퍼로 올린다. 아무도 쓰지 않게 된 앞 배열의 버퍼는 지운다
   * - incremental: 새로 올릴 배열이 CHUNK_MIN_BYTES를 넘으면 새 버퍼에 프레임마다 조각으로 채우고(uploadSome), 다 채울 때까지 앞 그물을 그린다
   * - 0.25.0 코어가 배열을 지운(놓은) 그물: 새 그물이 그 배열을 주면 통째로 올리고(vertices 구간은 그 배열에 쓰지 않는다),
   *   주지 않으면 정점 수가 같고 위치 배열이 같거나 vertices를 주었을 때 앞 기록의 버퍼를 그대로 물려받는다(구간 밖이 같다는 약속).
   *   돌려주는 값: vertices를 주었는데 놓은 배열이라 그 구간을 올리지 못한 속성 이름('normals'·'uvs'·'backUvs') — 없으면 빈 목록
   */
  setMesh(m: Mesh3d, scene: Scene3d, o: { vertices?: readonly IndexRange[] | null; incremental?: boolean; at?: number } = {}): string[] {
    this.syncTextures(scene);
    this.gl.bindVertexArray(null);
    const ranges = o.vertices?.length ? o.vertices : null;
    const p = this.pending;
    if (p) {
      // 나눠 올리는 장면에서 아직 올리지 않은 그물이면 장면만 갈아 끼운다(차례가 오면 새 그물을 올린다)
      const k = p.scene.meshes.findIndex((x) => x.id === m.id);
      const prev = k >= 0 ? p.scene.meshes[k]! : null;
      if (k === p.mi && p.chunk !== undefined) {
        if (p.chunk) this.dropChunk(this.uploadArrays('mesh', prev!));
        p.chunk = undefined;
      }
      // 0.58.0 올린 그물을 바꾸면(또는 함께 쓰는 배열을 고치면) 들고 있던 빛 기록을 그물 버퍼로 돌려 meshes에 옮긴다 — 아래 길은 meshes에서 찾는다
      if (this.mgHold.length && k >= 0 && (k < p.mi || ranges)) this.holdOut();
      p.scene = scene;
      if (k < 0 || k >= p.mi) {
        // 0.25.0: 다른 그물 객체로 바꿨으면 앞 객체에 앱이 다시 준 배열(문맥 복구)은 버린다
        if (prev !== m) this.restoreQ.delete(m.id);
        // 다른 묶음과 함께 쓰는 배열을 제자리에서 고쳤으면 이미 올린 그 버퍼는 고친다
        if (prev && ranges) {
          this.patchSame(this.vertexSlots(prev), null, m, ranges);
          this.refreshSharing(prev, m);
        }
        return [];
      }
    }
    this.dropJob(m.id);
    this.restoreQ.delete(m.id);
    const i = this.meshAt(m.id, o.at);
    const old = i >= 0 ? this.meshes[i]! : null;
    // 0.63.0 묶음에 든 그물을 같은 꼴 그물로 바꾸면 묶음 자리에 그대로 갈아 쓴다(그물마다 버퍼를 만들지 않고 다시 살필 것도 없다)
    if (old?.mg && this.mergeSwap(old, m, i)) return [];
    // 0.52.0 묶음을 다시 살핀다. 바꾸는 그물이 묶음 저장소에 있으면 새 기록이 들어설 때(installMesh — dropMeshRec) 빠진다 — 그때까지 앞 기록은 묶음 자리를 그린다
    // (묶음 저장소의 그물은 그물 버퍼가 없어 제자리 고치기가 앞 기록을 바꾸지 않는다)
    this.mgDirty = true;
    const skipped = old && ranges ? this.skippedRanges(old, m) : [];
    if (old && ranges) this.patchSame(old.slots, old.lay, m, ranges);
    if (old && o.incremental) {
      const chunk = this.chunkFor(this.uploadArrays('mesh', m));
      if (chunk) {
        this.jobs.set(m.id, { mesh: m, chunk, keep: !!ranges });
        if (ranges) this.refreshSharing(old.src, m);
        return skipped;
      }
    }
    if (old) this.recycle(old, m, ranges);
    this.installMesh(m, i, { keep: !!ranges });
    if (old && ranges) this.refreshSharing(old.src, m);
    return skipped;
  }

  /**
   * 0.64.0 그물 id의 기록 자리 — meshes.findIndex((r) => r.src.id === id)와 같다. 뷰어는 장면 id가 모두 다를 때(Viewer3d.idsUnique — 그때 기록은 장면 그물마다 많아야
   * 하나다) 그 그물의 장면 자리 at을 준다(더하는 그물이면 −1 — 그 id의 기록이 없다): 그 자리의 기록 id가 같으면 그 자리, 아니면(나눠 올리는 중 등) 처음부터 찾는다.
   * 0.63.0은 바꾸기·빼기·더하기마다 처음부터 찾았다(가짜 WebGL 8만 — 호출마다 평균 약 3.4 ms, 없는 id는 약 6.5 ms)
   */
  private meshAt(id: string, at?: number): number {
    if (at === -1) return -1;
    if (at !== undefined && at >= 0 && this.meshes[at]?.src.id === id) return at;
    return this.meshes.findIndex((r) => r.src.id === id);
  }

  /**
   * 0.63.0 묶음에 든 그물 기록 old(meshes의 i번째)를 그물 m으로 묶음 자리에서 갈아 쓴다(조각 swap — 정점·색인·윤곽선 수와 묶음 열쇠가 같을 때).
   * m이 곧장 구울 그물(mergeDirect)이면 GL 객체 없는 빛 기록을 만들어 묶을 수 있는지(mergeSrcOf) 보고, 갈아 쓰지 못하면 그 기록을 놓고 false(0.62.0 길 — 그물마다 버퍼)
   */
  private mergeSwap(old: MeshRec, m: Mesh3d, i: number): boolean {
    if (!mergeKit || old.mg!.rebuild || old.lay || old.miss || !this.mergeDirect(m)) return false;
    const r = this.sceneMeshRec(m, { light: true });
    const s = this.mergeSrcOf(r);
    if (!s || s.key !== old.mg!.key || !mergeKit.swap(this.host, old, r, s.src)) {
      this.release(r.slots);
      return false;
    }
    this.meshes[i] = r;
    // 뼈대(덩이 범위·잘라내기 덩어리 견주기)를 다시 만든다
    this.forgetOrder();
    return true;
  }

  /** 0.25.0: 놓은 배열(앞 기록이 지운 것) 가운데 새 그물이 주지 않아 vertices 구간을 올리지 못하는 속성 */
  private skippedRanges(old: MeshRec, m: Mesh3d): string[] {
    const lay = old.lay;
    if (!lay) return [];
    const nv = Math.floor(m.positions.length / 3);
    const has = (a: VertexArray | undefined, n: number): boolean => !!a && n > 0 && a.length >= nv * n;
    const out: string[] = [];
    if (lay.normals && !(m.normals && normalFormat(m.normals, nv))) out.push('normals');
    if (lay.uv && !has(m.uvs, lay.uv)) out.push('uvs');
    if (lay.buv && lay.ownBack && !has(m.backUvs, lay.buv)) out.push('backUvs');
    return out;
  }

  /**
   * 제자리에서 고친 위치·색 배열을 함께 쓰는 다른 그물 기록(드물다 — 같은 배열을 여러 그물이 쓸 때)은 범위·반투명 판정을 새로 하려고
   * 기록을 다시 만든다(배열은 이미 올라가 있어 다시 올리지 않는다)
   */
  private refreshSharing(prev: Mesh3d, next: Mesh3d): void {
    const changed = new Set<Float32Array>();
    if (prev.positions === next.positions) changed.add(next.positions);
    if (prev.colors && prev.colors === next.colors) changed.add(next.colors);
    if (!changed.size) return;
    for (let k = 0; k < this.meshes.length; k++) {
      const r = this.meshes[k]!;
      if (r.src.id !== next.id && (changed.has(r.src.positions) || (!!r.src.colors && changed.has(r.src.colors)))) this.installMesh(r.src, k);
    }
  }

  /**
   * 그물 하나 빼기(0.11.0 — Viewer3d.removeMesh). scene은 뺀 뒤의 장면. 아무도 쓰지 않게 된 배열의 버퍼를 지운다.
   * at: 0.64.0 뷰어가 장면 id가 모두 다를 때 준 뺀 그물의 장면 자리(meshAt)
   */
  removeMesh(id: string, scene: Scene3d, at?: number): void {
    this.syncTextures(scene);
    const p = this.pending;
    if (p) {
      const k = p.scene.meshes.findIndex((x) => x.id === id);
      if (k >= 0 && k === p.mi && p.chunk !== undefined) {
        if (p.chunk) this.dropChunk(this.uploadArrays('mesh', p.scene.meshes[k]!));
        p.chunk = undefined;
      }
      // 0.58.0 뺄 그물이 올린 그물이면 들고 있던 빛 기록을 먼저 meshes로(아래에서 meshes에서 찾는다)
      if (this.mgHold.length && k >= 0 && k < p.mi) this.holdOut();
      if (k >= 0 && k < p.mi) p.mi--;
      p.scene = scene;
    }
    this.dropJob(id);
    this.restoreQ.delete(id);
    const i = this.meshAt(id, at);
    if (i < 0) return;
    const r = this.meshes[i]!;
    this.meshes.splice(i, 1);
    this.dropMeshRec(r, false);
    this.release(r.slots);
  }

  /** 나눠 올리던 그물 바꾸기를 그만둔다(잡은 버퍼 가운데 쓰지 않는 것은 지운다) */
  private dropJob(id: string): void {
    const j = this.jobs.get(id);
    if (!j) return;
    this.jobs.delete(id);
    this.dropChunk(this.uploadArrays('mesh', j.mesh));
  }

  /**
   * 기록을 새 그물로(i = 앞 기록 자리, 없으면 −1 — 끝에 더한다). 배열은 arrayBuf·elemBuf가 이미 올린 것을 다시 쓰고 없는 것만 올린다.
   * 색인이 같으면 삼각형 변 그리기(wire)를 넘겨 쓴다(큰 그물의 와이어프레임 색인을 다시 만들지 않게).
   * 0.25.0: 앞 기록이 놓은 배열은 meshRec의 from·keep 규칙으로 물려받고, give는 앱이 다시 준 배열(restoreMeshArrays)
   */
  private installMesh(m: Mesh3d, i: number, o: { keep?: boolean; give?: MeshArrays | null } = {}): void {
    const old = i >= 0 ? this.meshes[i]! : null;
    const rec = this.sceneMeshRec(m, { from: old, keep: o.keep, give: o.give });
    if (old) {
      const w = old.wire;
      // 0.52.0 묶음 저장소의 앞 기록은 삼각형 변 색인이 묶음 정점 번호라 넘겨 쓰지 않는다
      if (w && !old.mg && old.src.indices === m.indices && old.tri === rec.tri && old.count === rec.count && old.indexed === rec.indexed) {
        const gl = this.gl;
        gl.bindVertexArray(w.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, rec.attrs.pos);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
        rec.wire = w;
      }
      this.dropMeshRec(old, rec.wire === w && !!w);
      this.release(old.slots);
      this.meshes[i] = rec;
    } else this.meshes.push(rec);
    this.gl.bindVertexArray(null);
  }

  /** 그물 기록의 VAO·구간 캐시·윤곽선 기록(keepWire가 아니면 삼각형 변 색인도)을 지운다. 배열 버퍼는 release가 지운다 */
  private dropMeshRec(r: MeshRec, keepWire: boolean): void {
    const gl = this.gl;
    // 0.52.0 묶음 저장소의 그물이면 묶음 VAO는 지우지 않고 묶음에서 빠진다(묶음 버퍼의 이 그물 자리는 그리지 않는다 — 쓰는 기록이 없어지면 묶음을 지운다)
    r.dropped = true;
    const stored = !!r.mg;
    this.mergeLeave(r);
    this.dropParts(r);
    if (!stored) {
      gl.deleteVertexArray(r.vao);
      this.vaos.delete(r.vao);
    }
    if (r.edges) {
      this.dropParts(r.edges);
      if (!stored)
        for (const v of [r.edges.wide, r.edges.thin]) {
          gl.deleteVertexArray(v);
          this.vaos.delete(v);
        }
    }
    if (r.wire && !keepWire) {
      gl.deleteVertexArray(r.wire.vao);
      this.vaos.delete(r.wire.vao);
      const k = this.keys.get(r.wire.idx);
      if (k) this.freeKey(k, 'element');
    }
  }

  /**
   * 그물의 정점 속성 배열(올리는 것만): 배열·정점당 값 수(0.26.0: 정수 법선은 3 또는 4). uploadArrays와 같은 조건이다
   */
  private vertexArrays(m: Mesh3d): ({ data: VertexArray; stride: number } | null)[] {
    const nv = Math.floor(m.positions.length / 3);
    const uv = m.texture || pbrNeedsUv(m) ? uvComponents(m) : 0;
    const buvs = m.backTexture ? (m.backUvs ?? m.uvs) : undefined;
    const buv = buvs ? uvComponents(m, buvs) : 0;
    const nf = m.normals ? normalFormat(m.normals, nv) : null;
    return [
      { data: m.positions, stride: 3 },
      nf ? { data: m.normals!, stride: nf.per } : null,
      m.colors && m.colors.length >= nv * 4 ? { data: m.colors, stride: 4 } : null,
      uv ? { data: m.uvs!, stride: uv } : null,
      buv ? { data: buvs!, stride: buv } : null,
    ];
  }

  /** 아직 기록이 없는 그물(나눠 올리는 중)의 정점 속성 배열 자리: 이미 올린 배열만 열쇠를 싣는다 */
  private vertexSlots(m: Mesh3d): (Slot | null)[] {
    return this.vertexArrays(m).map((x) => {
      const k = x ? this.keys.get(x.data) : undefined;
      return x && k ? { key: k, target: 'array', stride: x.stride } : null;
    });
  }

  /** 0.25.0: 버퍼 자리 s가 놓은(코어가 지운) 배열의 자리인지 */
  private releasedSlot(lay: MeshLayout | null, s: number): boolean {
    return !!lay && ((s === SLOT_NORMALS && lay.normals) || (s === SLOT_UV && lay.uv > 0) || (s === SLOT_BUV && lay.buv > 0));
  }

  /** 정점 구간들만 버퍼에 채운다(구간은 정점 번호, stride = 정점당 값 수 — 바이트 자리는 배열 값 크기로, 0.26.0) */
  private writeRanges(buf: WebGLBuffer, data: VertexArray, stride: number, ranges: readonly IndexRange[]): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const nv = Math.floor(data.length / stride);
    const bpe = data.BYTES_PER_ELEMENT;
    for (const r of ranges) {
      const s = Math.max(0, Math.floor(r.start)), e = Math.min(nv, s + Math.floor(r.count));
      if (e > s) gl.bufferSubData(gl.ARRAY_BUFFER, s * stride * bpe, data, s * stride, (e - s) * stride);
    }
  }

  /**
   * 앞 그물과 같은 정점 속성 배열 객체(제자리에서 고친 것)의 정점 구간을 이미 올린 버퍼에 채운다. before는 앞 그물의 버퍼 자리
   * (0.25.0 — 기록이 기억한 열쇠라 앞 그물의 배열을 보지 않는다). 놓은 자리(lay)에 앱이 같은 배열을 다시 주었으면 구간이 아니라 통째로 채운다
   */
  private patchSame(before: readonly (Slot | null)[], lay: MeshLayout | null, next: Mesh3d, ranges: readonly IndexRange[]): void {
    const b = this.vertexArrays(next);
    const done = new Set<BufKey>();
    for (let s = 0; s < b.length; s++) {
      const x = b[s];
      const k = x ? this.keys.get(x.data) : undefined;
      const a = before[s];
      if (!x || !k || done.has(k) || a?.key !== k || a.stride !== x.stride) continue;
      const buf = this.arrayBufs.get(k);
      if (!buf) continue;
      done.add(k);
      this.writeRanges(buf, x.data, x.stride, this.releasedSlot(lay, s) ? [{ start: 0, count: Infinity }] : ranges);
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
  }

  /**
   * 앞 그물만 쓰던 배열의 GPU 버퍼를 같은 자리의 새 배열이 물려받는다(바이트 크기가 같고 새 배열은 아직 올리지 않았을 때):
   * 버퍼를 새로 만들지 않고 bufferSubData로 채운다 — 정점 속성 배열에 ranges가 있으면 그 정점 구간만(0.25.0: 놓은 자리는 통째로).
   * 앞 그물은 기록이 기억한 버퍼 자리로 본다(배열을 보지 않는다)
   */
  private recycle(old: MeshRec, next: Mesh3d, ranges: readonly IndexRange[] | null): void {
    const gl = this.gl;
    const before = old.slots, after = this.uploadArrays('mesh', next);
    const vb = this.vertexArrays(next);
    const keep = new Set<BufKey>();
    for (const x of after) {
      const k = x ? this.keys.get(x.data) : undefined;
      if (k) keep.add(k);
    }
    gl.bindVertexArray(null);
    for (let s = 0; s < after.length; s++) {
      const a = before[s], b = after[s];
      if (!a || !b || a.target !== b.target || keep.has(a.key)) continue;
      if (a.key.bytes !== b.data.byteLength || this.refs.get(a.key) !== 1) continue;
      const map = a.target === 'element' ? this.elemBufs : this.arrayBufs;
      const buf = map.get(a.key);
      if (!buf || this.hasBuf(b.data, b.target)) continue;
      map.delete(a.key);
      map.set(this.keyOf(b.data), buf);
      // 앞 배열은 이제 아무 버퍼도 없다(release가 기록 수만 줄인다)
      const v = s < vb.length ? vb[s] : null;
      if (ranges && v && v.data === b.data && !this.releasedSlot(old.lay, s)) this.writeRanges(buf, v.data, v.stride, ranges);
      else {
        const T = a.target === 'element' ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
        gl.bindBuffer(T, buf);
        gl.bufferSubData(T, 0, b.data);
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /** 속성 꼴 → GL 값 꼴(0.26.0) */
  private glType(f: AttribFormat): number {
    const gl = this.gl;
    return f.type === 'byte' ? gl.BYTE : f.type === 'short' ? gl.SHORT : f.type === 'ushort' ? gl.UNSIGNED_SHORT : gl.FLOAT;
  }

  /**
   * 지금 묶인 VAO에 그물 정점 속성(위치·법선·색·무늬 좌표)을 건다(0.25.0 — 기록이 기억한 버퍼로, 배열을 보지 않고).
   * 0.26.0: 법선·무늬 좌표는 기록이 기억한 속성 꼴(정수면 normalized)로 건다 — Float32면 0.25.0과 같은 호출이다
   */
  private bindAttribs(a: MeshAttribs): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, a.pos);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    if (a.nrm) {
      const f = a.nrmF;
      gl.bindBuffer(gl.ARRAY_BUFFER, a.nrm);
      gl.enableVertexAttribArray(1);
      if (f) gl.vertexAttribPointer(1, 3, this.glType(f), f.normalized, f.stride, 0);
      else gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 12, 0);
    }
    if (a.col) {
      gl.bindBuffer(gl.ARRAY_BUFFER, a.col);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 16, 0);
    }
    if (a.uv) {
      const f = a.uvF;
      gl.bindBuffer(gl.ARRAY_BUFFER, a.uv);
      gl.enableVertexAttribArray(3);
      if (f) gl.vertexAttribPointer(3, a.uvN, this.glType(f), f.normalized, f.stride, 0);
      else gl.vertexAttribPointer(3, a.uvN, gl.FLOAT, false, a.uvN * 4, 0);
    }
    // 뒷면 무늬 좌표(backUvs, 없으면 uvs)
    if (a.buv) {
      const f = a.buvF;
      gl.bindBuffer(gl.ARRAY_BUFFER, a.buv);
      gl.enableVertexAttribArray(4);
      if (f) gl.vertexAttribPointer(4, a.buvN, this.glType(f), f.normalized, f.stride, 0);
      else gl.vertexAttribPointer(4, a.buvN, gl.FLOAT, false, a.buvN * 4, 0);
    }
  }

  /**
   * 그물 정점 속성 버퍼를 올리고(이미 올린 배열은 다시 쓴다) 버퍼 자리를 정한다. 조건은 uploadArrays와 같다(위치 → 법선 → 색 → 무늬 좌표 →
   * 뒷면 무늬 좌표 차례로 올린다). 0.25.0:
   * - give(앱이 다시 준 배열)가 그물 객체의 배열보다 먼저다
   * - from(바꾸는 앞 기록)이 놓은 배열을 새 그물이 주지 않으면(없거나 길이 0), 정점 수가 같고 위치 배열이 같거나 keep(vertices를 주어 구간 밖이 같다고 함)일 때
   *   앞 기록의 버퍼를 물려받는다
   * - 코어가 전에 지운 그물 객체(laid)의 뒷면은 따로 준 backUvs였으면 uvs로 대신하지 않는다
   * 0.26.0: 법선·무늬 좌표의 속성 꼴(정수 배열이면 정규화)을 함께 정한다(물려받은 버퍼는 앞 기록의 꼴)
   */
  private meshAttribs(m: Mesh3d, nv: number, o: { from?: MeshRec | null; keep?: boolean; give?: MeshArrays | null; light?: boolean }): { attrs: MeshAttribs; slots: (Slot | null)[]; ownBack: boolean } {
    const give = o.give ?? null;
    const from = o.from ?? null;
    const fl = from?.lay ?? null;
    const inherit = !!from && !!fl && fl.nv === nv && (from.src.positions === m.positions || !!o.keep);
    const absent = (a: VertexArray | undefined): boolean => !a || a.length === 0;
    const slots: (Slot | null)[] = [null, null, null, null, null, null, null];
    const put = (s: number, data: VertexArray, stride: number): WebGLBuffer => {
      slots[s] = { key: this.keyOf(data), target: 'array', stride };
      // 0.57.0 빛 기록은 버퍼를 만들지 않고 자리표만(있다/없다는 그물마다 올릴 때와 같다)
      return o.light ? NO_GL : this.arrayBuf(data, SLOT_PARTS[s]!);
    };
    const pos = put(0, m.positions, 3);
    let nrm: WebGLBuffer | null = null;
    let nrmF: AttribFormat | null = null;
    const na = give?.normals ?? m.normals;
    const naF = na ? normalFormat(na, nv) : null;
    if (na && naF) {
      nrm = put(SLOT_NORMALS, na, naF.per);
      nrmF = naF;
    } else if (inherit && fl!.normals && from!.attrs.nrm && absent(na)) {
      nrm = from!.attrs.nrm;
      nrmF = from!.attrs.nrmF;
      slots[SLOT_NORMALS] = from!.slots[SLOT_NORMALS]!;
    }
    const col = m.colors && m.colors.length >= nv * 4 ? put(2, m.colors, 4) : null;
    let uv: WebGLBuffer | null = null;
    let uvN: 0 | 2 | 3 = 0;
    let uvF: AttribFormat | null = null;
    // 0.43.0: 무늬 그림이 없어도 PBR 그림(법선·거칠기·금속)이 있으면 무늬 좌표를 올린다
    if (m.texture || pbrNeedsUv(m)) {
      const ua = give?.uvs ?? m.uvs;
      const n = uvComponents(m, ua);
      if (n) {
        uv = put(SLOT_UV, ua!, n);
        uvN = n;
        uvF = uvFormat(ua, n);
      } else if (inherit && fl!.uv && from!.attrs.uv && absent(ua)) {
        uv = from!.attrs.uv;
        uvN = from!.attrs.uvN;
        uvF = from!.attrs.uvF;
        slots[SLOT_UV] = from!.slots[SLOT_UV]!;
      }
    }
    let buv: WebGLBuffer | null = null;
    let buvN: 0 | 2 | 3 = 0;
    let buvF: AttribFormat | null = null;
    let ownBack = false;
    if (m.backTexture) {
      const own = give?.backUvs ?? m.backUvs;
      const ba = own ?? (this.laid.get(m)?.ownBack ? undefined : (give?.uvs ?? m.uvs));
      const n = ba ? uvComponents(m, ba) : 0;
      if (n) {
        buv = put(SLOT_BUV, ba!, n);
        buvN = n;
        buvF = uvFormat(ba, n);
        ownBack = ba === own;
      } else if (inherit && fl!.buv && from!.attrs.buv && absent(ba)) {
        buv = from!.attrs.buv;
        buvN = from!.attrs.buvN;
        buvF = from!.attrs.buvF;
        slots[SLOT_BUV] = from!.slots[SLOT_BUV]!;
        ownBack = fl!.ownBack;
      } else ownBack = !!this.laid.get(m)?.ownBack;
    }
    return { attrs: { pos, nrm, col, uv, uvN, buv, buvN, nrmF, uvF, buvF }, slots, ownBack };
  }

  /**
   * 0.25.0 그물 기록의 놓은 꼴: 놓기 선택에 든 것 가운데 올린 것과, 코어가 전에 지운 그물 객체의 꼴(laid — 문맥 복구 뒤에도 다시 받을 것)을 합친다.
   * 놓은 것이 없으면 null(0.24.0과 같은 그물)
   */
  private layoutOf(m: Mesh3d, nv: number, a: MeshAttribs, ownBack: boolean): MeshLayout | null {
    const r = this.rel;
    const was = this.laid.get(m);
    const normals = (!!r?.normals && !!a.nrm) || !!was?.normals;
    const uv: 0 | 2 | 3 = r?.uvs && a.uvN ? a.uvN : (was?.uv ?? 0);
    const buv: 0 | 2 | 3 = r?.uvs && a.buvN ? a.buvN : (was?.buv ?? 0);
    if (!normals && !uv && !buv) return null;
    return { nv, normals, uv, buv, ownBack: buv > 0 && ownBack };
  }

  /**
   * 그물 기록. 0.25.0: 정점 속성 버퍼·버퍼 자리를 기록에 기억한다(다시 묶기·쓰는 기록 수 세기에 배열을 보지 않는다).
   * 놓은 꼴(lay)이 있으면 그 가운데 지금 GPU에 없는 것을 miss에 적는다 — 그동안 법선 없이(평면 음영)·무늬 없이(color) 그린다
   */
  private meshRec(m: Mesh3d, o: { from?: MeshRec | null; keep?: boolean; give?: MeshArrays | null; light?: boolean } = {}): MeshRec {
    const gl = this.gl;
    const nv = Math.floor(m.positions.length / 3);
    const light = !!o.light;
    const vao = light ? NO_GL : this.vao();
    const { attrs, slots, ownBack } = this.meshAttribs(m, nv, o);
    if (!light) this.bindAttribs(attrs);
    const hasNormals = !!attrs.nrm;
    const hasColors = !!attrs.col;
    let count: number;
    // 0.50.0: 정점 수 밖 색인(0xffffffff — WebGL2는 늘 도형 다시 시작으로 읽는다)이나 깨진 정점(NaN·무한대·한도 밖)을 쓰는 삼각형은 넓이 0으로 바꾼 색인 사본을 올린다
    // (색인 없는 그물이면 0, 1, 2… 사본 — 삼각형 번호는 그대로). 멀쩡한 그물은 null(0.49.0과 같은 버퍼)
    const tri = triangleFix(m.positions, m.indices)?.indices ?? null;
    const I = tri ?? m.indices;
    const indexed = !!I;
    let elem: WebGLBuffer | null = null;
    if (I) {
      if (light) elem = NO_GL;
      else {
        elem = this.elemBuf(I, 'indices');
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elem);
      }
      slots[5] = { key: this.keyOf(I), target: 'element', stride: 0 };
      // 0.50.0: 정점이 하나도 없으면(빈 positions에 색인만) 그리지 않는다 — 넓이 0 삼각형도 가리킬 정점이 없다
      count = nv > 0 ? I.length - (I.length % 3) : 0;
    } else count = nv - (nv % 3);
    if (!light) gl.bindVertexArray(null);
    const uv = m.texture && this.texSrc.has(m.texture) ? attrs.uvN : 0;
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
    const edges = !hasMeshEdges(m) ? null : light ? { id: m.id, group: m.group, n: Math.floor(m.edges!.length / 6), pos: NO_GL, col: null, wide: NO_GL, thin: NO_GL } : this.lineRec(m.id, m.group, m.edges!, undefined, 'edges');
    // 0.50.0: 윤곽선 버퍼는 깨진 끝점 선분을 NaN으로 바꾼 사본일 수 있다(lineRec — segmentFix)
    if (edges) slots[6] = { key: this.keyOf(segmentFix(m.edges!).fix ?? m.edges!), target: 'array', stride: 0 };
    const box = meshBounds(m);
    // 뒷면 색·무늬(없으면 null — 예전 그대로)
    const buv = m.backTexture && this.texSrc.has(m.backTexture) ? attrs.buvN : 0;
    const bcol = m.backColor && m.backColor.length >= 3 ? m.backColor : null;
    // 0.26.0 뒷면 무늬 좌표 축척·이동: 따로 준 backUvs면 backUvTransform, uvs를 함께 쓰면 uvTransform
    const buvT = buv ? uvTransformOf(ownBack ? m.backUvTransform : m.uvTransform) : null;
    const back = bcol || buv ? { color: bcol, tex: buv ? m.backTexture! : null, uv: buv, texAlpha: buv > 0 && this.texSrc.get(m.backTexture!)!.alpha === true, uvT: buvT } : null;
    if (back?.texAlpha) transparent = true;
    const lay = this.layoutOf(m, nv, attrs, ownBack);
    const miss = lay ? layoutMiss(lay, { normals: !!attrs.nrm, uv: !!attrs.uv, buv: !!attrs.buv }) : null;
    // 0.42.0 같은 그물 열쇠(버퍼가 같으면 배열이 같고, 속성 꼴은 배열과 정점 수로 정해진다 — 그래도 꼴·값 수를 함께 적는다)
    const fmt = (a: AttribFormat | null): string => (a ? `${a.type}${a.normalized ? 'n' : ''}${a.stride}` : '');
    // 0.43.0 PBR 필드(없으면 null — 0.42.0 그물). 무늬 그림이 없어도 PBR 그림이 무늬 좌표를 쓰면 축척·이동을 함께 든다
    const pbr = pbrSource(m);
    const uvT0 = uv || (pbr && attrs.uvN) ? uvTransformOf(m.uvTransform) : null;
    // 0.57.0 빛 기록은 버퍼 번호가 없어 저마다 다른 열쇠(구우면 그물 저장소가 묶음으로 바뀌어 이 열쇠로 모아 그리지 않는다 — 그물마다 그리는 길로 떨어지면 mergeSolid가 고친다)
    let geo = light ? `L${++this.bufSeq}` : `${this.bufId(attrs.pos)}|${this.bufId(attrs.nrm)}${fmt(attrs.nrmF)}|${this.bufId(attrs.col)}|${this.bufId(attrs.uv)}${fmt(attrs.uvF)}:${uv}|${this.bufId(elem)}|${count}|${uv ? m.texture : ''}|${uvT0 ? uvT0.join() : ''}|${texAlpha ? 1 : 0}|${m.doubleSided === false ? 1 : 0}`;
    if (pbr) geo += `|pbr:${attrs.uvN}:${JSON.stringify(pbr)}`;
    return {
      light,
      pbr,
      geo,
      back,
      src: m,
      vao,
      count,
      indexed,
      tri,
      hasNormals,
      hasColors,
      uv,
      tex: uv ? m.texture! : null,
      texAlpha,
      uvT: uvT0,
      transparent,
      model: modelMatrix(m.matrix, m.origin),
      box,
      center: boxCenter(box),
      // 0.51.0 잘라내기 로컬 범위: 삼각형 정점(meshBounds가 이미 훑은 같은 기억)과 윤곽선 끝점(윤곽선이 그물 밖으로 나가도 덮게)
      local: edges ? unionBox(positionsBox(m.positions), segmentsBox(m.edges!)) : positionsBox(m.positions),
      edges,
      wire: null,
      attrs,
      slots,
      lay,
      miss,
    };
  }

  /** 선분 묶음·그물 윤곽선 기록. part = 위치 배열의 성분(0.28.0 — 선분 묶음 'lines'·윤곽선 'edges', 색은 'lineColors') */
  private lineRec(id: string, group: string | undefined, positions: Float32Array, colors: Float32Array | undefined, part: GpuBufferPart): LineRec {
    const gl = this.gl;
    const n = Math.floor(positions.length / 6);
    // 0.50.0: 끝점이 NaN·무한대·한도 밖인 선분은 여섯 값을 NaN으로 바꾼 사본을 올린다(그리지 않는다 — 한도 밖 유한한 끝점은 화면을 가로질렀다). 멀쩡하면 그 배열 그대로
    const pos = this.arrayBuf(segmentFix(positions).fix ?? positions, part);
    const col = colors && colors.length >= n * 8 ? this.arrayBuf(colors, 'lineColors') : null;
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
    gl.bindBuffer(gl.ARRAY_BUFFER, this.arrayBuf(p.positions, 'points'));
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 12, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
    return { src: p, n, vao, model: hasOrigin(p.origin) ? translation(p.origin) : undefined };
  }

  private thinRec(data: Float32Array): ThinRec | null {
    if (data.length < 6) return null;
    const gl = this.gl;
    const buf = this.newBuffer(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW, 'overlay');
    const vao = this.vao();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);
    return { vao, buf, count: Math.floor(data.length / 3) };
  }

  private deleteThin(r: ThinRec | null): void {
    if (!r) return;
    this.dropBuffer(r.buf);
    this.gl.deleteVertexArray(r.vao);
    this.vaos.delete(r.vao);
  }

  /**
   * 따로 두는 선분(강조·단면 테두리·구간 모음): 버퍼와 VAO를 새로 만든다(버퍼 캐시·VAO 목록 밖 — 지우는 쪽이 지운다).
   * origin이 있으면 positions는 그 점 기준. colors(정점마다 rgba)는 선택. part = 셀 성분(0.28.0 — 덧그림 'overlay', 구간 모음 'ranges')
   */
  private dynLines(id: string, positions: Float32Array | null, origin?: readonly number[] | null, colors?: Float32Array | null, part: GpuBufferPart = 'overlay'): LineRec | null {
    const gl = this.gl;
    const n = positions ? Math.floor(positions.length / 6) : 0;
    if (!positions || !n) return null;
    const pos = this.newBuffer(gl.ARRAY_BUFFER, positions.subarray(0, n * 6), gl.DYNAMIC_DRAW, part);
    let col: WebGLBuffer | null = null;
    if (colors && colors.length >= n * 8) col = this.newBuffer(gl.ARRAY_BUFFER, colors.subarray(0, n * 8), gl.STATIC_DRAW, part);
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
    this.dropBuffer(r.pos);
    this.dropBuffer(r.col);
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
    this.rel = null;
    this.restoreQ.clear();
    // 0.52.0 묶음 버퍼·VAO(그물 기록과 따로 만들고 지운다)
    this.mergeClear(false);
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
      if (m.attrs.nrm) markerBufs.add(m.attrs.nrm);
      markerBufs.add(m.attrs.pos);
    }
    for (const v of this.vaos)
      if (!keep.has(v)) {
        gl.deleteVertexArray(v);
        this.vaos.delete(v);
      }
    for (const [k, b] of this.arrayBufs)
      if (!markerBufs.has(b)) {
        this.dropBuffer(b);
        this.arrayBufs.delete(k);
      }
    for (const b of this.elemBufs.values()) this.dropBuffer(b);
    this.elemBufs.clear();
    this.refs.clear();
    this.jobs.clear();
    this.meshes = [];
    this.cullChunks = { recs: [], n: [], box: [] };
    this.forgetOrder();
    this.lines = [];
    this.points = [];
    this.setHighlightSegments(null);
    this.setSectionLines(null);
  }

  dispose(): void {
    this.onMergeReady = null;
    this.clear();
    this.setGrid(null);
    this.setAnnotationLines(null, null);
    const gl = this.gl;
    for (const v of this.vaos) gl.deleteVertexArray(v);
    for (const b of this.arrayBufs.values()) this.dropBuffer(b);
    this.vaos.clear();
    this.arrayBufs.clear();
    this.markers.clear();
    this.dropBuffer(this.quadWide);
    this.dropBuffer(this.quadPoint);
    this.dropBuffer(this.capBuf);
    gl.deleteVertexArray(this.capVao);
    for (const p of [this.mesh, this.wideP, this.thinP, this.pointP, this.meshC, this.thinC, this.meshT, this.meshTC, this.profileP, this.skyP, this.aoP, this.aoBlurP, this.aoMixP, ...this.variants.values()])
      if (p) gl.deleteProgram(p.p);
    this.variants.clear();
    this.profileP = null;
    this.aoP = this.aoBlurP = this.aoMixP = null;
    this.dropAo();
    this.dropProfile();
    this.dropShadow();
    if (this.instTex) gl.deleteTexture(this.instTex.tex);
    this.instTex = null;
    if (this.white) gl.deleteTexture(this.white);
    this.white = null;
    for (const q of this.pendingProgs.values()) {
      gl.deleteProgram(q.p);
      gl.deleteShader(q.vs);
      gl.deleteShader(q.fs);
    }
    this.pendingProgs.clear();
    if (this.emptyVao) gl.deleteVertexArray(this.emptyVao);
    this.emptyVao = null;
    this.meshC = null;
    this.thinC = null;
    this.meshT = null;
    this.meshTC = null;
  }

  /** 삼각형 선 그리기(윤곽선 없는 그물의 와이어프레임) */
  private wireOf(r: MeshRec): { vao: WebGLVertexArrayObject; count: number; idx: Uint32Array } {
    if (r.wire) return r.wire;
    const gl = this.gl;
    const m = r.src;
    const tris = r.count / 3;
    const idx = new Uint32Array(tris * 6);
    // 0.50.0: 깨진 삼각형을 넓이 0으로 바꾼 색인(있으면 — 그 변은 길이 0이라 그리지 않는다)
    const I = r.tri ?? m.indices;
    // 0.52.0 묶음 저장소의 그물은 묶음 위치 버퍼를 가리키므로 묶음 정점 번호로(vbase를 더한다 — 아니면 0)
    const vb = r.vbase ?? 0;
    // 삼각형마다 작은 배열을 만들지 않고 바로 채운다(삼각형 수백만 개에서 쓰레기 수집이 길어지지 않게)
    for (let t = 0, o = 0; t < tris; t++, o += 6) {
      const a = (I ? I[t * 3]! : t * 3) + vb;
      const b = (I ? I[t * 3 + 1]! : t * 3 + 1) + vb;
      const c = (I ? I[t * 3 + 2]! : t * 3 + 2) + vb;
      idx[o] = a;
      idx[o + 1] = b;
      idx[o + 2] = b;
      idx[o + 3] = c;
      idx[o + 4] = c;
      idx[o + 5] = a;
    }
    const vao = this.vao();
    gl.bindBuffer(gl.ARRAY_BUFFER, r.attrs.pos);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.elemBuf(idx, 'wireframe'));
    gl.bindVertexArray(null);
    r.wire = { vao, count: idx.length, idx };
    return r.wire;
  }

  private markerRec(kind: MarkerKind): MeshRec {
    let r = this.markers.get(kind);
    if (r) return r;
    const g = markerMesh(kind);
    r = this.meshRec({ id: `__marker_${kind}`, positions: g.positions, normals: g.normals, color: [1, 1, 1, 1] });
    // 표시 그물은 장면이 아니다(놓기 선택과 무관). 0.28.0: GPU 버퍼 바이트는 덧그림(overlay)으로 센다
    r.lay = null;
    r.miss = null;
    this.retag(r.attrs.pos, 'overlay');
    this.retag(r.attrs.nrm, 'overlay');
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
    // 0.63.0 장면에 무늬가 없고 올린 무늬도 없으면 쓸 무늬·지울 무늬가 없다(0.62.0은 setMesh·removeMesh마다 그물 기록 Map을 만들고 그물마다 셌다 — 8만 그물에서 바꾸기 호출의 40%)
    if (!this.texSrc.size && !this.textures.size) return;
    const used = new Map<string, Texture3d>();
    // 0.25.0: 올린 그물은 기록이 기억한 무늬 좌표 값 수로, 코어가 배열을 지운 그물은 그 꼴로 센다(배열과 그 길이를 다시 보지 않는다)
    const recs = this.meshes.length ? new Map(this.meshes.map((r) => [r.src, r])) : null;
    for (const m of scene.meshes) {
      const r = recs?.get(m);
      const t = m.texture !== undefined ? this.texSrc.get(m.texture) : undefined;
      if (t && (r ? r.attrs.uvN || (r.lay?.uv ?? 0) : uvComponents(m) || (this.laid.get(m)?.uv ?? 0))) used.set(t.id, t);
      const bt = m.backTexture !== undefined ? this.texSrc.get(m.backTexture) : undefined;
      if (bt && (r ? r.attrs.buvN || (r.lay?.buv ?? 0) : uvComponents(m, m.backUvs ?? m.uvs) || (this.laid.get(m)?.buv ?? 0))) used.set(bt.id, bt);
      // 0.43.0 PBR 그림(법선·거칠기·금속): 앞면 무늬 좌표가 있을 때만 — 무늬 그림과 같은 한 장 한도·전체 예산·놓기·나중에 주기(pending)·문맥 복구를 따른다
      const ids = pbrTextureIds(r ? r.pbr : pbrSource(m));
      if (ids.length && (r ? r.attrs.uvN || (r.lay?.uv ?? 0) : uvComponents(m) || (this.laid.get(m)?.uv ?? 0)))
        for (const id of ids) {
          const pt = this.texSrc.get(id);
          if (pt) used.set(pt.id, pt);
        }
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
    // 0.25.0: 코어가 원본을 지운 무늬(문맥을 잃었다 되찾음 등)는 풀지 않고 앱이 다시 줄 때까지 기다린다(그동안 그물은 color).
    // 0.38.0: 앱이 나중에 주는 무늬(pending — 그림 바이트·푼 그림이 없다)도 같은 상태로 기다린다(restoreTexture가 받는다)
    for (const t of fresh)
      this.textures.set(t.id, {
        src: t,
        side: sides.get(t.id) ?? TEXTURE_LIMIT,
        tex: null,
        state: (this.texLaid.has(t) || t.pending === true) && !t.data?.length && !t.bitmap ? 'missing' : 'queued',
        bytes: 0,
      });
    this.pumpTextures();
  }

  /**
   * 0.25.0 놓기: 올린 무늬의 원본(그림 바이트·푼 그림 — 푼 그림은 닫는다)을 무늬 객체에서 지우고 기억한다.
   * bitmapOnly('bitmap' 선택)면 푼 그림만 지우고 그림 바이트는 둔다(문맥을 되찾으면 syncTextures가 그 바이트를 다시 푼다 — 바이트도 없으면 앱에서 받는다)
   */
  private stripTexture(t: Texture3d, bitmapOnly: boolean): void {
    if (bitmapOnly && !t.bitmap) return;
    this.texLaid.add(t);
    try {
      if (t.bitmap) {
        t.bitmap.close();
        delete t.bitmap;
      }
      if (!bitmapOnly && t.data !== undefined) delete t.data;
    } catch {
      // 얼린 무늬 객체: 지우지 못해도 코어는 다시 읽지 않는다
    }
  }

  /**
   * 0.25.0 앱이 다시 준 무늬 원본을 풀어 올린다(코어가 원본을 지운 뒤 문맥을 잃었다 되찾아 기다리는 무늬만 — state 'missing'. 0.38.0부터 앱이 나중에 주는 pending 무늬도).
   * 긴 변은 처음 올릴 때와 같은 한도. 원본은 붙잡지 않고, 받은 ImageBitmap은 다 쓰면 닫는다. 올렸으면 true
   */
  restoreTexture(id: string, src: TextureSource): Promise<boolean> {
    const isBitmap = (x: unknown): x is ImageBitmap => !!x && typeof (x as ImageBitmap).close === 'function' && typeof (x as ImageBitmap).width === 'number';
    const o: Pick<Texture3d, 'data' | 'bitmap' | 'mime' | 'width' | 'height'> = src instanceof Uint8Array ? { data: src } : isBitmap(src) ? { bitmap: src } : (src ?? {});
    const bmp0 = o.bitmap ?? null;
    const close = (): void => {
      try {
        bmp0?.close();
      } catch {
        /* 이미 닫혔다 */
      }
    };
    const rec = this.textures.get(id);
    if (!rec || rec.state !== 'missing' || this.gl.isContextLost()) {
      close();
      return Promise.resolve(false);
    }
    const s = rec.src;
    const t: Texture3d = { id, data: o.data, bitmap: o.bitmap, mime: o.mime ?? s.mime, width: o.width ?? s.width, height: o.height ?? s.height, alpha: s.alpha };
    const gen = this.texGen;
    rec.state = 'restoring';
    // 늦게 끝났거나 풀지 못했으면 다시 기다린다(앱이 다시 줄 수 있게)
    const back = (): false => {
      if (this.textures.get(id) === rec && rec.state === 'restoring') rec.state = 'missing';
      return false;
    };
    return decodeTexture(t, rec.side).then(
      (bmp) => {
        close();
        if (gen !== this.texGen || this.textures.get(id) !== rec || rec.state !== 'restoring' || this.gl.isContextLost()) {
          bmp.close();
          return back();
        }
        let ok = false;
        let ms = 0;
        try {
          ms = this.uploadTexture(rec, bmp);
          rec.state = 'ready';
          ok = true;
        } catch {
          rec.state = 'missing';
        } finally {
          bmp.close();
        }
        this.onTexture?.(ms);
        return ok;
      },
      () => {
        close();
        return back();
      },
    );
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
          let ms = 0;
          try {
            ms = this.uploadTexture(rec, bmp);
            rec.state = 'ready';
            // 0.25.0 놓기: 올렸으면 원본을 지운다(문맥을 잃으면 앱이 restoreTexture로 다시 준다 — 'bitmap'이면 푼 그림만, 바이트는 코어가 다시 푼다)
            if (this.rel?.textures) this.stripTexture(rec.src, this.rel.textures === 'bitmap');
          } catch {
            rec.state = 'failed';
            ms = 0;
          } finally {
            bmp.close();
          }
          this.decoding--;
          this.pumpTextures();
          this.onTexture?.(ms);
        },
        () => {
          if (gen !== this.texGen || this.textures.get(rec.src.id) !== rec) return;
          rec.state = 'failed';
          this.decoding--;
          this.pumpTextures();
          this.onTexture?.(0);
        },
      );
    }
  }

  /** 푼 그림을 GPU에 올린다. 걸린 벽시계 ms(0.30.0 — texImage2D·밉맵, 앞서 그린 화면을 GPU가 끝내기를 기다린 시간 포함)를 돌려준다 */
  private uploadTexture(rec: TexRec, bmp: ImageBitmap): number {
    const t0 = performance.now();
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
    return Math.max(0, performance.now() - t0);
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
    const s: TextureStats = { count: this.textures.size, ready: 0, failed: 0, bytes: 0, missing: 0 };
    for (const r of this.textures.values()) {
      if (r.state === 'ready') {
        s.ready++;
        s.bytes += r.bytes;
      } else if (r.state === 'failed') s.failed++;
      else if (r.state === 'missing' || r.state === 'restoring') s.missing++;
    }
    return s;
  }

  // ───────────── 0.25.0 놓기·문맥 복구 ─────────────

  /** 아직 기록이 없는(나눠 올리는 중) 지운 그물이 차례가 왔을 때 GPU에 없을 것(앱이 미리 준 배열까지 셈한다) */
  private pendingMiss(m: Mesh3d, lay: MeshLayout): MeshMiss | null {
    return arraysMiss(lay, m, this.restoreQ.get(m.id));
  }

  /**
   * 다시 줄 것: 코어가 지운 배열·원본 가운데 지금 GPU에 없는 것(scene 차례 — 나눠 올리는 중이면 차례가 왔을 때 없을 것까지).
   * 놓기 선택을 주지 않은 장면은 늘 빈 목록이다
   */
  restoreNeed(scene: Scene3d | null): RestoreNeed {
    const out: RestoreNeed = { meshes: [], textures: [] };
    if (scene) {
      // 0.58.0 들고 있는 기록(나눠 올리는 중 — 그물 버퍼 기록은 놓기로 지워진 꼴이 있을 수 있다)도 기록으로 본다
      const recs = new Map([...this.meshes, ...this.mgHold].map((r) => [r.src, r]));
      for (const m of scene.meshes) {
        const r = recs.get(m);
        const lay = r ? null : this.laid.get(m);
        const miss = r ? r.miss : lay ? this.pendingMiss(m, lay) : null;
        if (miss) out.meshes.push({ id: m.id, normals: miss.normals, uvs: miss.uvs, backUvs: miss.backUvs });
      }
    }
    for (const t of this.textures.values()) if (t.state === 'missing') out.textures.push(t.src.id);
    return out;
  }

  /**
   * 앱이 다시 준 그물 배열을 올린다(코어가 지운 배열 가운데 지금 GPU에 없는 것만 받는다 — 문맥 복구 뒤). 다른 속성 버퍼는 그대로 물려받아
   * 그 그물 기록만 다시 만들고, 준 배열은 붙잡지 않는다. 나눠 올리는 중이라 아직 기록이 없으면 차례가 올 때 쓴다. 받은 것이 있으면 true
   */
  restoreMeshArrays(id: string, a: MeshArrays): boolean {
    if (this.gl.isContextLost() || !a) return false;
    this.holdOut();
    const i = this.meshes.findIndex((r) => r.src.id === id);
    let m: Mesh3d | null = i >= 0 ? this.meshes[i]!.src : null;
    let miss = i >= 0 ? this.meshes[i]!.miss : null;
    if (i < 0) {
      const p = this.pending;
      const k = p ? p.scene.meshes.findIndex((x) => x.id === id) : -1;
      if (!p || k < p.mi) return false;
      m = p.scene.meshes[k]!;
      const lay = this.laid.get(m);
      miss = lay ? this.pendingMiss(m, lay) : null;
    }
    if (!m || !miss) return false;
    const give = takeArrays(miss, { nv: Math.floor(m.positions.length / 3) }, a);
    if (!give) return false;
    if (i < 0) {
      this.restoreQ.set(id, { ...this.restoreQ.get(id), ...give });
      return true;
    }
    this.gl.bindVertexArray(null);
    this.installMesh(m, i, { give });
    return true;
  }

  /** 그물의 올린 뒷면 무늬(없거나 아직이면 null) */
  private backTexOf(r: MeshRec): WebGLTexture | null {
    if (!r.back?.tex) return null;
    const t = this.textures.get(r.back.tex);
    return t && t.state === 'ready' ? t.tex : null;
  }

  /** 0.43.0 id의 올린 무늬(없거나 아직이면 null — PBR 그림) */
  private readyTex(id: string | null): WebGLTexture | null {
    if (!id) return null;
    const t = this.textures.get(id);
    return t && t.state === 'ready' ? t.tex : null;
  }

  /**
   * 0.43.0 이번 그리기의 PBR 상태(PBR 필드가 없거나 쓸 것이 없으면 null — 0.42.0 셰이더). 올라가지 않은 그림은 없는 것처럼 본다(pbr.ts pbrState)
   */
  pbrStateOf(r: MeshRec): PbrState | null {
    if (!r.pbr || !this.pbr || this.pbrBroken) return null;
    return pbrState(r.pbr, (id) => !!this.readyTex(id), r.attrs.uvN > 0);
  }

  /** 0.43.0 흰 1화소 그림(처음 쓸 때 만든다 — 지금 무늬 단위에 묶인 채로 둔다. 부르는 쪽이 PBR 단위를 고른 뒤 부른다) */
  private whiteTex(): WebGLTexture | null {
    if (this.white) return this.white;
    const gl = this.gl;
    const t = gl.createTexture();
    if (!t) return null;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return (this.white = t);
  }

  /**
   * 0.43.0 PBR 변종(p.uv·p.nmap·p.pbr)의 그물마다 균일 변수와 그림(무늬 단위 6·7·8)을 건다. 무늬 그림 변종(TEX)이 아니면 무늬 좌표 값 수·축척도.
   * 끝나면 무늬 단위 0으로 돌려 둔다(무늬 그림 캐시 lastTex는 단위 0만 본다)
   */
  private pbrBind(p: Prog, r: MeshRec, st: PbrState | null): void {
    if (!p.uv && !p.nmap && !p.pbr) return;
    const gl = this.gl;
    if (!p.tex) {
      gl.uniform1f(this.loc(p, 'u_uvq'), r.attrs.uvN === 3 ? 1 : 0);
      const ut = r.uvT;
      gl.uniform4f(this.loc(p, 'u_uvt'), ut ? ut[0] : 1, ut ? ut[1] : 1, ut ? ut[2] : 0, ut ? ut[3] : 0);
    }
    if (p.nmap) {
      gl.activeTexture(gl.TEXTURE0 + NMAP_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, this.readyTex(st?.normal ?? null));
      gl.uniform2f(this.loc(p, 'u_nscale'), st ? st.scale[0] : 1, st ? st.scale[1] : 1);
    }
    if (p.pbr) {
      gl.activeTexture(gl.TEXTURE0 + ROUGH_UNIT);
      const w = this.whiteTex();
      gl.bindTexture(gl.TEXTURE_2D, this.readyTex(st?.rough ?? null) ?? w);
      gl.activeTexture(gl.TEXTURE0 + METAL_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, this.readyTex(st?.metal ?? null) ?? w);
      const f = st?.factors;
      gl.uniform3f(this.loc(p, 'u_pbr'), f ? f[0] : 1, f ? f[1] : 0, f ? f[2] : 0);
    }
    gl.activeTexture(gl.TEXTURE0);
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
    for (const b of c.bufs) this.dropBuffer(b);
    rec.parts = undefined;
    this.partsVer++;
  }

  /** 이 판의 구간 캐시(판이 바뀌었으면 옛 자료를 지우고 새로) */
  private partCache(rec: { parts?: PartCache }, ver: number): PartCache {
    const c = rec.parts;
    if (c && c.ver === ver) return c;
    if (c) this.dropParts(rec);
    this.partsVer++;
    return (rec.parts = { ver, vaos: [], bufs: [], lists: new Map() });
  }

  /** 그물의 한 종류 구간(삼각형 번호). wire면 와이어프레임용(삼각형마다 변 셋). 0.44.0: cut을 주면 그 구간 단면 갈래만 */
  private meshList(r: MeshRec, c: PartCache, parts: readonly RangePart[], hi: boolean, wire: boolean, cut?: number): DrawList {
    const key = `${wire ? 'w' : 'f'}${hi ? 'h' : 'n'}${cut ?? ''}`;
    let l = c.lists.get(key);
    if (l) return l;
    // 0.50.0: 이 그물의 삼각형 수로 자른다(같은 id가 둘인 장면은 구간이 다른 항목의 수로 정해져 색인 버퍼 밖을 그렸다 — GL 오류)
    const runs = clipRanges(partsOf(parts, hi, cut), 0, Math.floor(r.count / 3));
    const total = rangesTotal(runs);
    let compact: DrawList['compact'] = null;
    if (runs.length > RUN_LIMIT && total > 0) {
      const gl = this.gl;
      const idx = compactTriIndices(r.tri ?? r.src.indices, runs, wire);
      // 0.52.0 묶음 저장소의 그물은 묶음 정점 번호로(그 VAO가 묶음 버퍼를 가리킨다)
      if (r.vbase) for (let i = 0; i < idx.length; i++) idx[i] = idx[i]! + r.vbase;
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      if (wire) {
        gl.bindBuffer(gl.ARRAY_BUFFER, r.attrs.pos);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
      } else this.bindAttribs(r.attrs);
      const buf = this.newBuffer(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW, 'ranges');
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
  private lineList(rec: LineRec, c: PartCache, parts: readonly RangePart[], hi: boolean, positions: Float32Array, colors: Float32Array | undefined, cut?: number): DrawList {
    const key = `${hi ? 'h' : 'n'}${cut ?? ''}`;
    let l = c.lists.get(key);
    if (l) return l;
    // 0.50.0: 이 묶음의 선분 수로 자른다(meshList와 같다)
    const runs = clipRanges(partsOf(parts, hi, cut), 0, rec.n);
    const total = rangesTotal(runs);
    let compact: DrawList['compact'] = null;
    if (runs.length > RUN_LIMIT && total > 0) {
      const cr = this.dynLines(`${rec.id}__part`, compactStride(segmentFix(positions).fix ?? positions, runs, 6), null, rec.col && colors ? compactStride(colors, runs, 8) : null, 'ranges');
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
  private pointList(r: PointRec, c: PartCache, parts: readonly RangePart[], hi: boolean, cut?: number): DrawList {
    const key = `${hi ? 'h' : 'n'}${cut ?? ''}`;
    let l = c.lists.get(key);
    if (l) return l;
    // 0.50.0: 이 묶음의 점 수로 자른다(meshList와 같다)
    const runs = clipRanges(partsOf(parts, hi, cut), 0, r.n);
    const total = rangesTotal(runs);
    let compact: DrawList['compact'] = null;
    if (total > 0) {
      const gl = this.gl;
      const buf = this.newBuffer(gl.ARRAY_BUFFER, compactStride(r.src.positions, runs, 3), gl.STATIC_DRAW, 'ranges');
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
    const stats: RenderStats = { drawCalls: 0, triangles: 0, segments: 0, points: 0, culled: 0 };
    this.stats = stats;
    this.instRow = 0;
    this.instStats = { draws: 0, items: 0 };
    this.mergeStats = { draws: 0, items: 0 };
    this.pollPending();
    // 0.52.0 묶어 그리기를 켰으면 다 올린 뒤 몫 안에서 묶음을 굽는다(그동안 구운 묶음은 묶어서, 나머지는 그물마다)
    this.mergeStep();
    // 0.54.0 나눠 올리는 장면의 첫 그림 — 다음 올리기 걸음부터 훑고 굽는다
    this.mgFramed = true;
    this.drawnRecs = this.meshes.length + this.lines.length + this.points.length;
    const renderT0 = performance.now();
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
    /** 0.44.0 구간 단면 갈래(cut — 그 구간만 더 자르는 평면 비트)를 더한 묶음 평면들(로컬, 번호 오름차순). cut이 0이면 clipsOf와 같다 */
    const clipsOfCut = (id: string, model: ArrayLike<number> | undefined, cut: number): Plane4[] => {
      if (!multi) return [];
      if (!cut) return clipsOf(id, model)!;
      const s = new Set(multi.of(id));
      for (const k of cutBits(cut)) if (k < multi.planes.length) s.add(k);
      return [...s].sort((a, b) => a - b).map((i) => planeToLocal(multi.planes[i]!.plane, model));
    };
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
    /**
     * 0.43.0 그물의 PBR 상태(무늬 없음·단색·숨은 선 모드와 색을 바꾼 묶음은 무늬처럼 끈다 — PBR 필드가 없는 그물은 늘 null이라 0.42.0 길 그대로).
     * 한 그리기 안에서는 같은 값이라 그물마다 한 번만 센다
     */
    const pbrMemo = new Map<MeshRec, PbrState | null>();
    const pbrOf = (r: MeshRec): PbrState | null => {
      if (!r.pbr || noTex || !this.pbr) return null;
      if (lookOf(r.src.id)?.color) return null;
      let s = pbrMemo.get(r);
      if (s === undefined) pbrMemo.set(r, (s = this.pbrStateOf(r)));
      return s;
    };
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
    // 0.51.0 색·깃발 기억은 글자열 대신 수로(그물마다 글자열을 만들지 않는다 — 같은 값이면 다시 보내지 않는 것은 그대로, NaN만 늘 다시 보낸다)
    let colOk = false;
    let lc0 = 0, lc1 = 0, lc2 = 0, lc3 = 0;
    let flagsOk = false;
    let lfV = false, lfN = false, lfT = 0, lfA = 0;
    /** 색 u_color를 보내야 하면 true(기억을 새 값으로) */
    const colNew = (c: Rgba): boolean => {
      if (colOk && lc0 === c[0] && lc1 === c[1] && lc2 === c[2] && lc3 === c[3]) return false;
      colOk = true;
      lc0 = c[0];
      lc1 = c[1];
      lc2 = c[2];
      lc3 = c[3];
      return true;
    };
    /** 깃발(u_vcol·u_hasNrm·u_tint·u_alpha)을 보내야 하면 true */
    const flagsNew = (vcol: boolean, nrm: boolean, tint: number, alpha: number): boolean => {
      if (flagsOk && lfV === vcol && lfN === nrm && lfT === tint && lfA === alpha) return false;
      flagsOk = true;
      lfV = vcol;
      lfN = nrm;
      lfT = tint;
      lfA = alpha;
      return true;
    };
    let lastCull: boolean | undefined;
    let lastTex: WebGLTexture | null = null;
    let lastClip = '#';
    const meshUse = (p: Prog): void => {
      cur = p;
      gl.useProgram(p.p);
      lastMat = undefined;
      colOk = false;
      flagsOk = false;
      lastCull = undefined;
      lastTex = null;
      lastClip = '#';
      gl.uniform1f(this.loc(p, 'u_ortho'), ortho);
      if (p.tex) gl.uniform1i(this.loc(p, 'u_tex'), 0);
      if (p.inst) gl.uniform1i(this.loc(p, 'u_inst'), INST_UNIT);
      if (p.nmap) gl.uniform1i(this.loc(p, 'u_nmap'), NMAP_UNIT);
      if (p.pbr) {
        gl.uniform1i(this.loc(p, 'u_rough'), ROUGH_UNIT);
        gl.uniform1i(this.loc(p, 'u_metal'), METAL_UNIT);
      }
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
      this.meshMats(p, mvp, mv);
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
    const meshClips = (r: MeshRec, matrix: ArrayLike<number> | undefined, cut = 0): void => {
      const p = cur;
      if (!multi || !p.clipN) return;
      // 0.44.0 구간 단면 갈래는 열쇠에 갈래를 더한다(갈래가 없으면 0.43.0 열쇠 그대로)
      const key = cut ? `${multi.of(r.src.id).join(',')}/${cut}` : multi.of(r.src.id).join(',');
      if (key === lastClip && clipMat === (matrix ?? null)) return;
      lastClip = key;
      clipMat = matrix ?? null;
      this.setClips(p, clipsOfCut(r.src.id, matrix, cut));
    };
    /**
     * 그물 그리기. list를 주면 그 구간만(묶음 안 숨김·강조). 무늬 프로그램이면 그물의 무늬를 건다.
     * 0.44.0: cut은 그 목록의 구간 단면 갈래(여러 단면이면 그 갈래 평면들을 올린다 — 없으면 0)
     */
    const meshDraw = (r: MeshRec, matrix: ArrayLike<number> | undefined, color: Rgba, alpha: number, tint: number, cull: boolean, list?: DrawList | null, cut = 0): void => {
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
        // 0.26.0 무늬 좌표 축척·이동(없으면 (1, 1, 0, 0) — 값이 그대로다)
        const ut = r.uvT;
        gl.uniform4f(this.loc(p, 'u_uvt'), ut ? ut[0] : 1, ut ? ut[1] : 1, ut ? ut[2] : 0, ut ? ut[3] : 0);
      }
      // 0.43.0 PBR 그림(변종이 아니면 아무것도 하지 않는다)
      if (p.uv) this.pbrBind(p, r, pbrOf(r));
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
          const bt = r.back?.uvT;
          gl.uniform4f(this.loc(p, 'u_uvt2'), bt ? bt[0] : 1, bt ? bt[1] : 1, bt ? bt[2] : 0, bt ? bt[3] : 0);
        }
      }
      const m = matrix ?? null;
      if (m !== lastMat) {
        lastMat = m;
        setMeshMatrix(matrix);
      }
      if (multi) meshClips(r, matrix, cut);
      if (colNew(color)) gl.uniform4f(this.loc(p, 'u_color'), color[0], color[1], color[2], color[3]);
      const vcol = r.hasColors && !(look && lookOf(r.src.id)?.color) && !mono && !flat;
      if (flagsNew(vcol, r.hasNormals, tint, alpha)) {
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
          // 0.52.0 묶음 저장소의 그물은 묶음 색인 버퍼 안 그 그물 자리부터
          const o = (r.first ?? 0) * 4;
          for (const run of list.runs) {
            if (r.indexed) gl.drawElements(gl.TRIANGLES, run.count * 3, gl.UNSIGNED_INT, o + run.start * 12);
            else gl.drawArrays(gl.TRIANGLES, run.start * 3, run.count * 3);
            stats.drawCalls++;
          }
        }
        stats.triangles += list.total;
        return;
      }
      gl.bindVertexArray(r.vao);
      if (r.indexed) gl.drawElements(gl.TRIANGLES, r.count, gl.UNSIGNED_INT, (r.first ?? 0) * 4);
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
    /** 0.43.0 그물의 PBR 변종 정의(UV·NMAP·PBR — 쓸 것이 없으면 빈 목록) */
    const pbrDefsOf = (r: MeshRec): string[] => (r.pbr ? pbrDefines(pbrOf(r)) : []);
    /**
     * 그물에 맞는 프로그램(올린 무늬가 있으면 무늬 변종, 뒷면이 있으면 뒷면 변종, 0.43.0 PBR 그림이 있으면 그 변종).
     * usePbr = false면 PBR 변종을 쓰지 않는다(외곽선 깊이 그림처럼 색을 쓰지 않는 그리기 — 정점 셰이더의 위치 식은 같다)
     */
    const progFor = (r: MeshRec, usePbr = true): Prog => {
      const pd = usePbr ? pbrDefsOf(r) : [];
      const defs = (): string[] => {
        const d = [...meshExtra, ...(shadowOn ? ['SHADOW'] : []), ...(multi ? ['CLIPN'] : sec ? ['CLIP'] : []), ...(texOfR(r) ? ['TEX'] : [])];
        if (backOf(r)) {
          d.push('BACK');
          if (!noTex && this.backTexOf(r)) d.push('BACKTEX');
        }
        return d;
      };
      if (pd.length && !this.pbrBroken) {
        // 0.43.0 PBR 변종은 기다리지 않고 번역한다(병렬 번역이면 다 될 때까지 0.42.0 변종으로 — 뷰어가 다음 프레임에 다시 그린다)
        const p = this.asyncVariant('mesh', [...defs(), ...pd]);
        if (p) return p;
        if (p === false) this.pbrBroken = true;
      }
      if (!backOf(r)) return texOfR(r) ? texProg() : sceneMeshProg();
      return this.variant('mesh', defs());
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
    /**
     * 0.44.0 구간 단면 갈래마다 [보통, 강조] 그릴 목록(갈래 차례 — 작은 비트 합부터). 구간 단면 갈래가 없는 묶음(구간이 없거나 갈래 0뿐)은 null(meshLists 길 그대로)
     */
    const meshCuts = (r: MeshRec, wire = false): CutLists[] | null => {
      if (!multi) return null;
      const p = st.parts?.(r.src.id);
      if (!p) return null;
      const c = this.partCache(r, p.ver);
      const cuts = cacheCuts(c, p.prims);
      if (!cuts) return null;
      return cuts.map((k) => ({ cut: k, n: this.meshList(r, c, p.prims, false, wire, k), h: this.meshList(r, c, p.prims, true, wire, k) }));
    };
    /** 0.44.0 선분(그물 윤곽선·선분 묶음) 구간 목록의 구간 단면 갈래마다 [보통, 강조] 목록과 그 갈래 평면들(로컬). 갈래가 없으면 null(0.43.0 길) */
    const lineCuts = (
      rec: LineRec,
      c: PartCache,
      parts: readonly RangePart[],
      id: string,
      model: ArrayLike<number> | undefined,
      positions: Float32Array,
      colors: Float32Array | undefined,
    ): { clips: Plane4[]; n: DrawList; h: DrawList }[] | null => {
      if (!multi) return null;
      const cuts = cacheCuts(c, parts);
      if (!cuts) return null;
      return cuts.map((k) => ({ clips: clipsOfCut(id, model, k), n: this.lineList(rec, c, parts, false, positions, colors, k), h: this.lineList(rec, c, parts, true, positions, colors, k) }));
    };
    /** 보통·강조로 나눠 그물 그리기(구간이 없으면 통째로). 0.44.0: 구간 단면 갈래가 있으면 갈래마다 그 평면들로 */
    const meshDrawParts = (r: MeshRec, color: Rgba, alpha: number, tint: number, cull: boolean): void => {
      const C = meshCuts(r);
      if (C) {
        const model = mm(r);
        for (const k of C) {
          meshDraw(r, model, color, alpha, tint, cull, k.n, k.cut);
          meshDraw(r, model, color, alpha, 0.5, cull, k.h, k.cut);
        }
        return;
      }
      const L = meshLists(r);
      const model = mm(r);
      if (!L) meshDraw(r, model, color, alpha, tint, cull);
      else {
        meshDraw(r, model, color, alpha, tint, cull, L[0]);
        meshDraw(r, model, color, alpha, 0.5, cull, L[1]);
      }
    };

    // ───── 0.42.0 인스턴싱: 같은 그물(MeshRec.geo) 자리를 모아 그리기 한 번에 ─────
    /** 자리 묶음 하나: 같은 그물·같은 색·강조·정점 색·무늬 쓰기(균일 변수가 모두 같고 자리 행렬만 다르다) */
    interface MeshBatch {
      color: Rgba;
      tint: number;
      vcol: boolean;
      tex: boolean;
      /** 0.43.0 PBR 변종 정의(같은 그물 열쇠는 PBR 필드도 같다 — 색을 바꾼 자리만 PBR이 꺼져 따로 묶인다) */
      pbr: string[];
      /** 0.51.0 pbr.join()(묶음마다 한 번 — 자리마다 견줄 때 다시 잇지 않는다) */
      pk: string;
      list: MeshRec[];
    }
    const vcolOf = (r: MeshRec): boolean => r.hasColors && !(look && lookOf(r.src.id)?.color) && !mono && !flat;
    const NO_DEFS: string[] = [];
    /**
     * 같은 그물 자리들을 균일 변수가 같은 묶음으로 나눈다(색은 같은 객체를 먼저 보고, 다른 객체면 값으로).
     * 0.51.0: 자리마다 닫힘 함수·빈 배열·글자열 잇기를 만들지 않는다(PBR 필드가 없는 그물은 빈 정의 — 같은 묶음 나누기·차례)
     */
    const splitBatches = (list: readonly MeshRec[], tintOf: (r: MeshRec) => number): MeshBatch[] => {
      const out: MeshBatch[] = [];
      const byObj = new Map<Rgba, MeshBatch[]>();
      const byVal = new Map<string, MeshBatch>();
      for (const r of list) {
        const color = colOf(r), tint = tintOf(r), vcol = vcolOf(r), tex = !!texOfR(r);
        const pbr = r.pbr ? pbrDefsOf(r) : NO_DEFS;
        const pk = pbr.length ? pbr.join() : '';
        let b: MeshBatch | undefined;
        const cand = byObj.get(color);
        if (cand)
          for (const x of cand)
            if (x.tint === tint && x.vcol === vcol && x.tex === tex && x.pk === pk) {
              b = x;
              break;
            }
        if (!b) {
          const k = `${tint}|${vcol ? 1 : 0}${tex ? 1 : 0}|${color[0]},${color[1]},${color[2]},${color[3]}${pk ? `|${pk}` : ''}`;
          b = byVal.get(k);
          if (!b) {
            out.push((b = { color, tint, vcol, tex, pbr, pk, list: [] }));
            byVal.set(k, b);
          }
          const a = byObj.get(color);
          if (a) a.push(b);
          else byObj.set(color, [b]);
        }
        b.list.push(r);
      }
      return out;
    };
    /** 묶음 그리기의 그물 균일 변수(meshDraw에서 행렬·단면·뒷면을 뺀 것 — 같은 캐시를 쓴다) */
    const instState = (r: MeshRec, color: Rgba, alpha: number, tint: number, cull: boolean, vcol: boolean): void => {
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
        const ut = r.uvT;
        gl.uniform4f(this.loc(p, 'u_uvt'), ut ? ut[0] : 1, ut ? ut[1] : 1, ut ? ut[2] : 0, ut ? ut[3] : 0);
      }
      if (colNew(color)) gl.uniform4f(this.loc(p, 'u_color'), color[0], color[1], color[2], color[3]);
      if (flagsNew(vcol, r.hasNormals, tint, alpha)) {
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
    };
    /**
     * 모은 자리(같은 그물 열쇠 → 기록들, 장면 차례)를 묶음마다 그리기 한 번으로(불투명 면·외곽선 깊이 그림). 자리 자료 그림이 모자라면 그 묶음은 그물마다(meshDrawParts).
     * 묶음 안 자리 차례는 장면 차례 그대로다(묶음끼리·그물마다 그리는 것과의 차례만 바뀐다)
     */
    const flushMeshes = (pend: Map<string, MeshRec[]>, tintOf: (r: MeshRec) => number, usePbr = true): void => {
      for (const list of pend.values())
        for (const b of splitBatches(list, tintOf)) {
          const r0 = b.list[0]!;
          const cull = r0.src.doubleSided === false;
          for (const r of b.list) if (r.parts) this.dropParts(r);
          // 인스턴싱 변종이 아직 번역 중이거나 자리 자료 그림이 모자라면 그물마다(같은 그림).
          // 0.43.0 그림자(SHADOW)·단면 하나(CLIP)도 — 자리마다 그림자 행렬·로컬 평면을 자리 자료에 더 쓴다(그물마다 그릴 때의 균일 변수와 같은 값)
          // 0.51.0 화면 밖으로 잘라낸 자리는 묶음에서 뺀다(묶음 나누기·차례·상태는 빼기 전 그대로 — 남은 자리만 자리 자료에)
          const list = culledN ? b.list.filter((r) => r.culledAt !== frameNo) : b.list;
          if (!list.length) continue;
          const shadowVp = shadowOn && this.shadowMap ? this.shadowMap.vp : null;
          const p = this.instVariant('mesh', [...meshExtra, ...(shadowVp ? ['SHADOW'] : []), ...(sec ? ['CLIP'] : []), ...(b.tex ? ['TEX'] : []), ...(usePbr ? b.pbr : [])]);
          const base = p ? this.instMeshes(f, list.map(mm), { shadow: shadowVp, clip: sec ? clipOf : null }) : -1;
          if (!p || base < 0) {
            for (const r of list) {
              const q = progFor(r, usePbr);
              if (q !== cur) meshUse(q);
              meshDrawParts(r, b.color, 1, b.tint, cull);
            }
            continue;
          }
          if (p !== cur) meshUse(p);
          gl.uniform1i(this.loc(p, 'u_instBase'), base);
          if (p.shadow || p.clip1) gl.uniform1i(this.loc(p, 'u_instStride'), Renderer3d.instStride(!!p.shadow, !!p.clip1));
          instState(r0, b.color, 1, b.tint, cull, b.vcol);
          if (p.uv) this.pbrBind(p, r0, pbrOf(r0));
          gl.bindVertexArray(r0.vao);
          const n = list.length;
          if (r0.indexed) gl.drawElementsInstanced(gl.TRIANGLES, r0.count, gl.UNSIGNED_INT, 0, n);
          else gl.drawArraysInstanced(gl.TRIANGLES, 0, r0.count, n);
          stats.drawCalls++;
          stats.triangles += (r0.count / 3) * n;
          this.instStats.draws++;
          this.instStats.items += n;
        }
      pend.clear();
    };
    const addPend = <K>(m: Map<K, MeshRec[]>, k: K, r: MeshRec): void => {
      const a = m.get(k);
      if (a) a.push(r);
      else m.set(k, [r]);
    };

    const frameNo = ++this.frameNo;
    // 0.60.0 그리기 뼈대(다 올린 뒤 묶음이 있는 장면): 보이는 목록은 숨김 판(visKey)이 같으면 지난 목록 그대로, 깨끗한 덩이는 아래 차례마다 구간 하나로
    const O = this.orderNow();
    let visibleMeshes: MeshRec[];
    let visSeq: number;
    const VM = O && st.visKey !== undefined && this.visMemo?.ord === O ? this.visMemo : null;
    // 0.63.0 판이 바뀌었어도 그 사이 바뀐 것이 항목 숨김 몇 개뿐이면(visDelta) 그 그물만 고친다(조각 visPatch — 보이는 목록·덩이 숨긴 번호)
    if (VM && (VM.key === st.visKey || mergeKit!.visPatch(O!, this.meshes, VM.list, VM.seq, st.visDelta?.(VM.key) ?? null, vis))) {
      VM.key = st.visKey!;
      visibleMeshes = VM.list;
      visSeq = VM.seq;
    } else {
      visSeq = ++this.visSeq;
      visibleMeshes = [];
      for (const r of this.meshes)
        if (vis(r.src.id, r.src.group)) {
          r.visAt = visSeq;
          visibleMeshes.push(r);
        }
      // 덩이마다 숨긴 그물 번호(0.61.0 조각 blockHid — 0.60.0은 여기)
      if (O) mergeKit!.blockHid(O, visSeq);
      this.visMemo = O && st.visKey !== undefined ? { ord: O, key: st.visKey, seq: visSeq, list: visibleMeshes } : null;
    }
    // 강조한 그물이 든 덩이(강조 모음·크기·뼈대가 같으면 지난 표시 그대로 — 모음이 비면 0)
    let hiStamp = 0;
    if (O && st.highlight.size) {
      const H = this.hiMemo;
      if (H && H.set === st.highlight && H.size === st.highlight.size && H.ord === O) hiStamp = H.stamp;
      else {
        hiStamp = ++this.hiSeq;
        mergeKit!.blockHi(O, st.highlight, hiStamp);
        this.hiMemo = { set: st.highlight, size: st.highlight.size, ord: O, stamp: hiStamp };
      }
    }
    /**
     * 0.60.0 보이는 그물마다 fn(장면 차례 — visibleMeshes와 같은 차례). 뼈대가 있으면 덩이마다 먼저 blk(덩이, fn)를 묻고, 덩이를 다뤘으면(true) 그 그물들은 건너뛴다
     * (blk는 예외 그물 — 숨김·잘라냄·강조 — 을 fn으로 넘기고 그 사이 구간을 통째로 더한다). 0.61.0 뼈대 길은 조각 eachItem
     */
    const each = (fn: (r: MeshRec) => void, blk: ((k: MergeBlock, fn: (r: MeshRec) => void) => boolean) | null): void => {
      if (O) mergeKit!.eachItem(O, visSeq, fn, blk);
      else for (const r of visibleMeshes) fn(r);
    };
    // 0.51.0 화면 밖 잘라내기(src/cull.ts): 시야 사각뿔 옆 네 평면 가운데 하나의 확실히 바깥인 그물에 이 그리기 번호를 적고 면·윤곽선·삼각형 변·숨은 점선·
    // 외곽선·주변 가림 깊이·반투명 면에서 뺀다 — 화면에 화소를 내지 않는 그물이라 그림은 같다. 여백은 굵은 선 반폭·끝 마개(장치 화소 4 × 화소 비율 + 4).
    // 그림자 깊이 그림(해 쪽 시야)·잘린 면 채우기 단위·인스턴싱 자리 수·모은 묶음 나누기와 차례는 잘라내기 전 그대로 둔다(0.50.0과 같은 길)
    let culledN = 0;
    if (this.culling && visibleMeshes.length) {
      const vw = Math.min(devW, st.viewport ? st.viewport[0] : devW, gl.drawingBufferWidth || devW);
      const vh = Math.min(devH, st.viewport ? st.viewport[1] : devH, gl.drawingBufferHeight || devH);
      const px = 4 * st.dpr + 4;
      const P = cullPlanes(f.viewProj, (2 * px) / Math.max(1, vw), (2 * px) / Math.max(1, vh));
      const cullOf = (r: MeshRec): CullBox | null => (r.cull === undefined ? (r.cull = cullBox(r.local, r.model)) : r.cull);
      // 0.60.0 잘라낸 그물을 그 덩이의 이 그리기 예외로 적는다(장면 차례로 훑으므로 번호가 오름차순)
      const cut = (r: MeshRec): void => {
        r.culledAt = frameNo;
        culledN++;
        if (O && r.bk! >= 0) {
          const k = O.blocks[r.bk!]!;
          if (k.cut !== frameNo) {
            k.cut = frameNo;
            k.cutL = [];
          }
          k.cutL.push(r.mi!);
        }
      };
      if (look) {
        // 겉모습 행렬이 있으면 그물마다(옮긴 묶음은 옮긴 자리로)
        for (const r of visibleMeshes) {
          const lk = lookOf(r.src.id)?.matrix;
          const d = lk ? cullBox(r.local, this.lookModel(r, lk, r.model).model) : cullOf(r);
          if (d && cullOut(P, d)) cut(r);
        }
      } else {
        // 장면 차례 CULL_CHUNK개 덩어리: 감싸는 상자가 확실히 안이면 건너뛰고, 확실히 바깥이면 통째로, 걸치면 그물마다(같은 판단 — cullUnion).
        // 0.60.0 뼈대가 맞고 덩어리를 그 뼈대로 셌으면 장면 차례가 그대로라 덩어리 기록을 다시 견주지 않는다
        const M = this.meshes, C = this.cullChunks;
        if (C.recs.length > M.length) C.recs.length = M.length;
        const same = !!O && C.ord === O;
        for (let s = 0, k = 0; s < M.length; s += CULL_CHUNK, k++) {
          const e = Math.min(M.length, s + CULL_CHUNK);
          let ok = same || C.n[k] === e - s;
          if (!same) for (let i = s; ok && i < e; i++) if (C.recs[i] !== M[i]) ok = false;
          if (!ok) {
            const list: (CullBox | null)[] = [];
            for (let i = s; i < e; i++) {
              C.recs[i] = M[i];
              list.push(cullOf(M[i]!));
            }
            C.box[k] = cullUnion(list);
            C.n[k] = e - s;
          }
          const box = C.box[k];
          const side = box ? cullSide(P, box) : 0;
          if (side === 1) continue;
          for (let i = s; i < e; i++) {
            const r = M[i]!;
            if (r.visAt !== visSeq) continue;
            let out = side === -1;
            if (!out) {
              const d = cullOf(r);
              out = !!d && cullOut(P, d);
            }
            if (out) cut(r);
          }
        }
        C.ord = O;
      }
      stats.culled = culledN;
    }
    /** 이 그리기에서 화면 밖으로 잘라낸 그물인지 */
    const gone = (r: MeshRec): boolean => culledN > 0 && r.culledAt === frameNo;
    /** 모은 선 묶음에서 화면 밖 자리를 뺀 것(색·굵기·불투명도는 그대로) */
    const cutBatch = (b: LineBatch): LineBatch => {
      const recs: MeshRec[] = [], models: (ArrayLike<number> | undefined)[] = [];
      b.recs.forEach((r, i) => {
        if (r.culledAt !== frameNo) {
          recs.push(r);
          models.push(b.models[i]);
        }
      });
      return { ...b, recs, models };
    };

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
          // 0.44.0 구간 단면 갈래마다 그 평면들로
          const C = meshCuts(r);
          if (C) {
            for (const k of C) {
              this.setClips(dp, clipsOfCut(r.src.id, model, k.cut));
              this.drawMeshGeometry(r, k.n);
              this.drawMeshGeometry(r, k.h);
            }
            continue;
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
    // 0.49.0 주변 가림: 음영 계열(숨은 선 빼고)에서만. 끄면 그 그림도 놓는다
    const aoOn = !!st.ao && shadedLike && mode !== 'hiddenLine';
    if (!aoOn && (this.aoTex || this.aoLow)) this.dropAo();
    // 0.50.0 움직이는 동안 'off'(hold): 이 그림은 가림 없이 — 그림·깊이 버퍼는 놓지 않고 둔다(멈추면 다시 쓴다)
    const aoDraw = aoOn && !st.ao!.hold;
    // 외곽선을 끄면 깊이 그림 버퍼도 놓는다(0.49.0 주변 가림이 쓰는 동안은 둔다)
    if (!st.profiles && !aoOn && this.profTex) this.dropProfile();

    // 0.42.0 인스턴싱: 보이는 같은 그물 자리 수(그물 열쇠·윤곽선 버퍼별). 단면이 있으면 끈다(자리마다 로컬 평면이 다르다 — 그물마다 그린다).
    // 불투명 면·외곽선 깊이는 그림자를 쓰면(자리마다 그림자 행렬) 그물마다, 반투명 면은 늘 그물마다(뒤에서 앞으로 정렬)
    const instMin = Math.max(2, Math.floor(this.instancing.min) || INSTANCE_MIN);
    let geoN: Map<string, number> | null = null;
    let edgeN: Map<WebGLBuffer, number> | null = null;
    // 0.43.0: 단면 하나(sec)·그림자일 때도 면은 모은다(자리마다 로컬 평면·그림자 행렬을 자리 자료에). 선(윤곽선·삼각형 변·숨은 점선)은 단면이 있으면 그물마다(0.42.0 그대로)
    if (this.instancing.on && !multi) {
      geoN = new Map();
      if (!sec) edgeN = new Map();
      const G = geoN, E = edgeN;
      // 0.60.0 묶음에 든 그물은 세지 않는다: 굽기는 배열을 다른 기록과 함께 쓰는 그물을 받지 않아(mergeSrcOf) 그 그물 열쇠는 늘 하나뿐이다 — 모아 그릴 자리가 되지 않는다.
      // 다 묶은 큰 장면에서 프레임마다 그물 수만큼 글자열 열쇠 Map을 셌다(가짜 WebGL 1만 — 그리기 자기 시간의 약 30%). 뼈대가 있으면 덩이는 통째로 건너뛴다.
      // 0.52.0 묶음 저장소의 윤곽선은 묶음 선분 버퍼를 함께 가리키지만 같은 그물 자리가 아니다(세지 않는다 — 묶음 구간으로 그린다)
      each(
        (r) => {
          if (r.mg) return;
          G.set(r.geo, (G.get(r.geo) ?? 0) + 1);
          if (E && r.edges) E.set(r.edges.pos, (E.get(r.edges.pos) ?? 0) + 1);
        },
        () => true,
      );
    }
    /** 삼각형 변(와이어프레임·숨은 선) 모으기용 같은 그물 수(단면이 있으면 null — 선은 그물마다) */
    const wireGeoN = sec ? null : geoN;
    /** 면을 모아 그릴 자리인지(같은 그물이 하한 이상 보이고, 묶음 안 구간이 없을 때 — 0.43.0부터 단면 하나·그림자도) */
    const meshInst = (r: MeshRec): boolean => !!geoN && (geoN.get(r.geo) ?? 0) >= instMin && !st.parts?.(r.src.id);
    const pend = new Map<string, MeshRec[]>();

    // ───── 0.52.0 묶어 그리기: 묶음 그물은 그물마다 그리던 자리에서 잇단 것끼리 구간으로 모으고, 그물마다 그리기와 한 목록에 장면 차례로 두었다가
    // 자리 자료(행렬·색)를 한 번 올린 뒤 차례대로 그린다(차례가 같아 그림이 같다). 0.53.0: 면은 단면 하나·그림자에서도 묶는다(자리마다 로컬 평면·그림자 행렬 —
    // 인스턴싱과 같다), 선(윤곽선·숨은 점선)은 단면이 있으면 그물마다(0.60.0 선도 단면 하나에서 묶는다 — 자리마다 로컬 평면). 여러 단면이면 모두 그물마다 ─────
    // (MERGE 변종을 만들 수 없으면 묶음 저장소의 그물도 그물마다 — 그 그물 자리로 그린다)
    // 0.54.0 묶음은 조각이 와야 구우므로 묶음이 있으면 조각도 있다(0.57.0 구간 그리기도 조각 — kit.drawFaces·drawEdges)
    const kit = mergeKit!;
    const mOn = !this.mergeBroken && this.mgGroups.size > 0 && !multi && !!mergeKit;
    /** 0.53.0 선 차례에서 묶는지. 0.60.0 단면 하나도(선 변종이 자리마다 로컬 평면을 읽는다 — 0.59.0까지는 그물마다라 단면을 켠 큰 장면의 프레임이 그물 수만큼 GL 호출이었다) */
    const mOnLines = mOn;
    /** 지금 모으는 목록(null이면 예전처럼 바로 그린다 — 0.61.0 조각 RunList: 구간 늘이기·그물마다 그리기 끼우기) */
    let mops: InstanceType<MergeKit['RunList']> | null = null;
    /** 0.60.0 이 그리기에서 덩이를 구간으로 다룰 수 있는지(겉모습·구간이 없고 덩이 그물이 묶음 그리기 길을 탄다) */
    const fastOk = !!O && !look && !st.parts;
    const marks = { frame: frameNo, hi: hiStamp, vis: visSeq };
    /** 0.60.0 덩이를 예외 그물 사이 구간으로(조각 blockRuns). 다룰 수 없으면 false(덩이 전체를 그물마다). 0.62.0 withHi가 아니면 구간 안 강조 번호(hl)도 */
    const blockRuns = (k: MergeBlock, fn: (r: MeshRec) => void, withHi: boolean, add: (a: number, b: number, hl: number[] | null) => void): boolean =>
      fastOk && k.ok && (kit.blockRuns(k, fn, withHi, add, marks), true);
    /** 0.62.0 강조 섞기 몫(그물마다 그릴 때 강조한 그물의 u_tint.a — 면 구간은 자리 깃발에 곱한다) */
    const HI_TINT = 0.5;
    /** 0.60.0 묶음 그물마다 면 색·정점 색 쓰기(조각 faceCols — colOf·vcolOf와 같은 값, 겉모습이 없을 때) */
    const faceCols = (g: MergeGroup): [Rgba[], boolean[]] => kit.faceCols(g, flat ? bgFill : null, mono);
    /** 0.57.0 구간 그리기(조각 drawFaces·drawEdges)에 넘기는 이 프레임 값(부를 때마다 — 그림자는 깊이 그림을 그린 뒤 정해진다) */
    const mctx = (): MergeDrawCtx => ({
      f,
      st,
      stats,
      mm,
      look: !!look,
      sec,
      clipOf,
      shadowOn,
      shadowVp: shadowOn && this.shadowMap ? this.shadowMap.vp : null,
      meshExtra,
      hiTint,
      use: (p) => p !== cur && (meshUse(p), true),
      flagsNew,
      cullTo: (c) => {
        if (c === lastCull) return;
        lastCull = c;
        if (c) gl.enable(gl.CULL_FACE);
        else gl.disable(gl.CULL_FACE);
      },
      drawParts: meshDrawParts,
      dash: DASH,
    });
    /** 면 목록을 그린다(조각 drawFaces — plain은 그 그물을 그물마다 그릴 때의 프로그램) */
    const mergeFaces = (ops: readonly MergeOp[], plain: (r: MeshRec) => Prog): void => kit.drawFaces(this.host, mctx(), ops, plain);
    /** 그물을 이 면 차례에서 묶어 그릴 수 있는지(구운 묶음에 들었고 묶음 안 구간이 아닐 때 — 0.53.0 그림자·단면 하나도, 여러 단면은 mOn이 끈다) */
    const mergeFace = (r: MeshRec): boolean => !!r.mg && !st.parts?.(r.src.id);
    /** 선 목록을 그린다(조각 drawEdges — 그물 윤곽선, 숨은 점선이면 dash) */
    const mergeLines = (ops: readonly MergeOp[], o: { dashed: boolean; bias: number; capz: boolean }, memo: LineMemo | null): void => kit.drawEdges(this.host, mctx(), ops, o, memo);
    /** 그물 윤곽선을 이 선 차례에서 묶어 그릴 수 있는지(구운 묶음에 윤곽선이 있고 묶음 안 구간이 없을 때) */
    const mergeEdge = (r: MeshRec): boolean => !!r.mg?.thin && !!r.edges && !st.parts?.(r.src.id);

    /** 불투명 그물 깊이만 지금 묶은 깊이 그림 버퍼에(외곽선 2c와 0.49.0 주변 가림이 같이 쓴다 — 색은 쓰지 않는다) */
    const opaqueDepth = (): void => {
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.colorMask(false, false, false, false);
      meshUse(sceneMeshProg());
      // 0.52.0 묶음 그물은 구간으로(깊이만 — 강조 없이). 0.62.0 강조 깃발은 면 차례와 같게 적는다(같은 자리를 읽는다 — 섞는 몫은 0)
      mops = mOn ? new kit.RunList(0) : null;
      each(
        (r) => {
          if (transOf(r)) return;
          // 0.42.0 같은 그물 자리는 모아서(뒷면 변종 그물은 그물마다)
          if (!(r.back && backOf(r)) && meshInst(r)) {
            addPend(pend, r.geo, r);
            return;
          }
          if (gone(r)) return;
          if (mops && mergeFace(r)) {
            mops.add(r, colOf(r), vcolOf(r), st.highlight.has(r.src.id) ? HI_TINT : 0, 1);
            return;
          }
          // 0.43.0 깊이만 그리므로 PBR 변종은 쓰지 않는다(위치 식이 같아 깊이도 같다)
          if (mops) {
            mops.draw(() => {
              const p = progFor(r, false);
              if (p !== cur) meshUse(p);
              meshDrawParts(r, colOf(r), 1, 0, r.src.doubleSided === false);
            });
            return;
          }
          const p = progFor(r, false);
          if (p !== cur) meshUse(p);
          meshDrawParts(r, colOf(r), 1, 0, r.src.doubleSided === false);
        },
        // 0.60.0 덩이는 예외 사이 구간으로(깊이만이라 강조와 상관없다 — 0.62.0 강조 번호는 깃발로)
        mops
          ? (k, fn) => {
              const [cols, vc] = faceCols(k.g);
              return blockRuns(k, fn, false, (a, b, hl) => mops!.range(k.g, a, b, cols, vc, 0, 1, hl));
            }
          : null,
      );
      if (mops) {
        const ops = mops.ops;
        mops = null;
        mergeFaces(ops, (r) => progFor(r, false));
      }
      if (pend.size) flushMeshes(pend, () => 0, false);
      gl.disable(gl.CULL_FACE);
    };

    // 1) 불투명 면(무늬 없는 것 먼저, 그다음 올린 무늬가 있는 것 — 프로그램을 한 번씩만 바꾼다). 0.42.0: 모아 그릴 자리는 그 뒤에 묶음마다
    if (shadedLike) {
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 1);
      let textured = false;
      meshUse(sceneMeshProg());
      let backs = false;
      let pbrs = false;
      const hiOf = (r: MeshRec): number => (st.highlight.has(r.src.id) ? 0.5 : 0);
      // 0.52.0 묶음 그물은 구간으로 모아 그물마다 그리기와 장면 차례 그대로(이 차례 끝에 한 번에).
      // 0.62.0 강조는 자리 깃발(구간이 끊기지 않는다 — 섞는 몫 HI_TINT를 구간 균일 변수로)
      const plainP = cur;
      mops = mOn ? new kit.RunList(HI_TINT) : null;
      each(
        (r) => {
          if (transOf(r)) return;
          if (r.back && backOf(r)) {
            if (!gone(r)) backs = true;
            return;
          }
          if (meshInst(r)) {
            addPend(pend, r.geo, r);
            return;
          }
          if (gone(r)) return;
          // 0.43.0 PBR 그림을 쓰는 그물은 아래에서 그물마다 맞는 변종으로(PBR 필드가 없는 그물은 늘 빈 목록)
          if (r.pbr && pbrDefsOf(r).length) {
            pbrs = true;
            return;
          }
          if (texOfR(r)) {
            textured = true;
            return;
          }
          const tint = st.highlight.has(r.src.id) ? HI_TINT : 0;
          if (mops) {
            if (mergeFace(r)) mops.add(r, colOf(r), vcolOf(r), tint, 1);
            else
              mops.draw(() => {
                if (cur !== plainP) meshUse(plainP);
                meshDrawParts(r, colOf(r), 1, tint, r.src.doubleSided === false);
              });
            return;
          }
          meshDrawParts(r, colOf(r), 1, tint, r.src.doubleSided === false);
        },
        // 0.60.0 덩이는 예외(숨김·잘라냄) 사이 구간으로 — 0.62.0 강조한 그물은 구간 안 강조 번호로(0.61.0까지는 예외라 그물마다 길이 강조 구간을 따로 열었다)
        mops
          ? (k, fn) => {
              const [cols, vc] = faceCols(k.g);
              return blockRuns(k, fn, false, (a, b, hl) => mops!.range(k.g, a, b, cols, vc, 0, 1, hl));
            }
          : null,
      );
      if (mops) {
        const ops = mops.ops;
        mops = null;
        mergeFaces(ops, () => plainP);
      }
      // 0.60.0 무늬·PBR·뒷면 차례: 덩이 그물은 무늬·PBR·뒷면이 없어(ok) 모두 건너뛴다
      const noBlock = (k: MergeBlock): boolean => k.ok;
      if (textured) {
        meshUse(texProg());
        each((r) => {
          if (!transOf(r) && !gone(r) && texOfR(r) && !(r.back && backOf(r)) && !meshInst(r) && !(r.pbr && pbrDefsOf(r).length))
            meshDrawParts(r, colOf(r), 1, st.highlight.has(r.src.id) ? 0.5 : 0, r.src.doubleSided === false);
        }, noBlock);
      }
      if (pend.size) flushMeshes(pend, hiOf);
      if (pbrs)
        each((r) => {
          if (transOf(r) || gone(r) || (r.back && backOf(r)) || meshInst(r) || !pbrDefsOf(r).length) return;
          const p = progFor(r);
          if (p !== cur) meshUse(p);
          meshDrawParts(r, colOf(r), 1, st.highlight.has(r.src.id) ? 0.5 : 0, r.src.doubleSided === false);
        }, noBlock);
      // 뒷면 색·무늬가 있는 그물(그물마다 맞는 변종)
      if (backs)
        each((r) => {
          if (transOf(r) || gone(r) || !r.back || !backOf(r)) return;
          const p = progFor(r);
          if (p !== cur) meshUse(p);
          meshDrawParts(r, colOf(r), 1, st.highlight.has(r.src.id) ? 0.5 : 0, r.src.doubleSided === false);
        }, noBlock);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.disable(gl.CULL_FACE);
      // 1b) 잘린 면 채우기
      if (capsOn) {
        // 반투명·범위·색은 겉모습·모드(숨은 선·단색)를 반영한 값으로(겉모습이 없고 예전 모드면 장면 값 그대로)
        // 0.44.0 구간 단면 갈래가 있는 그물은 갈래마다 따로(그 갈래의 삼각형만 홀짝을 세고 그 갈래의 다른 평면으로 채운 면을 자른다 — 단위 범위는 그 갈래 정점의 범위)
        const cutBox = (r: MeshRec, cut: number): Box3 => {
          const p = st.parts?.(r.src.id);
          if (!p) return boxOf(r);
          const c = this.partCache(r, p.ver);
          let b = (c.cutBoxes ??= new Map()).get(cut);
          if (!b) {
            const runs = [...partsOf(p.prims, false, cut), ...partsOf(p.prims, true, cut)];
            b = offsetBox(rangesBox('triangle', r.src.positions, r.src.indices, runs), r.src.origin);
            if (r.src.matrix) b = transformBox(b, r.src.matrix);
            c.cutBoxes.set(cut, b);
          }
          const lm = lookOf(r.src.id)?.matrix;
          return lm ? transformBox(b, lm) : b;
        };
        // 0.60.0 단면 하나: 채우기 단위 묶음(capGroup)이 없는 덩이에서 그물 범위를 합친 토막 상자가 평면을 걸치지 않으면 그 토막 그물은 단위를 내지 않는다
        // (그물 상자 ⊂ 토막 상자 — 걸침 판단이 같다) — 넘기지 않는다(차례는 그대로)
        let capMeshes = visibleMeshes;
        if (fastOk && sec && !multi) {
          const list: MeshRec[] = [];
          const push = (r: MeshRec): void => void list.push(r);
          each(push, (k) => kit.capBlock(k, sec.plane, visSeq, push));
          capMeshes = list;
        }
        const units = this.capUnits(capMeshes, sec, multi, { trans: transOf, box: boxOf, color: colOf, cuts: (r) => meshCuts(r)?.map((k) => k.cut) ?? null, cutBox });
        const plain = meshExtra.length ? this.variant('mesh', [...meshExtra, ...(multi ? ['CLIPN'] : [])]) : multi ? this.variant('mesh', ['CLIPN']) : this.mesh;
        const capLists = (r: MeshRec, cut: number | undefined): DrawList[] | null => {
          if (cut === undefined) return meshLists(r);
          const k = meshCuts(r)?.find((x) => x.cut === cut);
          return k ? [k.n, k.h] : [];
        };
        if (units.length) this.drawCaps(f, devW, devH, units, multi, st, stats, meshUse, meshDraw, () => cur, capLists, (pl) => (capPlane = pl), mm, plain);
      }
    }

    // 1d) 0.49.0 주변 가림: 불투명 그물 깊이(외곽선과 같은 깊이 그림 — 아래 2c가 다시 쓴다)에서 셈해 지금 그림에 곱한다.
    // 선·점·격자·반투명 면은 이 뒤에 그려 가리지 않는다. 깊이를 그리는 그리기 수·삼각형·인스턴싱 셈은 늘리지 않는다(2c와 같다)
    let depthDone = false;
    if (aoDraw && st.ao && visibleMeshes.some((r) => !transOf(r))) {
      const target = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      const fb = this.profileTarget(devW, devH);
      if (fb) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.viewport(0, 0, devW, devH);
        gl.clearDepth(1);
        gl.depthMask(true);
        const dc = stats.drawCalls, tr = stats.triangles;
        const inst0 = { ...this.instStats };
        opaqueDepth();
        stats.drawCalls = dc;
        stats.triangles = tr;
        this.instStats = inst0;
        gl.colorMask(true, true, true, true);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target);
        gl.viewport(0, 0, devW, devH);
        depthDone = true;
        this.drawAo(f, devW, devH, st.ao, target, !!st.transparent, stats);
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
      /** 삼각형 변(윤곽선 없는 그물)을 그물 하나씩 가는 선으로(0.41.0 그대로 — 묶음 안 구간이 있으면 보통·강조 구간) */
      const wireDraw = (r: MeshRec, model: ArrayLike<number> | undefined, col: Rgba): void => {
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
        const wireList = (list: DrawList): void => {
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
        };
        // 0.44.0 구간 단면 갈래마다 그 평면들로(보통 → 강조)
        const C = meshCuts(r, true);
        if (C) {
          for (const k of C) {
            this.setClips(p, clipsOfCut(r.src.id, model, k.cut));
            if (k.n.total) {
              gl.uniform4f(this.loc(p, 'u_color'), col[0], col[1], col[2], col[3]);
              wireList(k.n);
            }
            if (k.h.total) {
              gl.uniform4f(this.loc(p, 'u_color'), hiTint[0], hiTint[1], hiTint[2], hiTint[3]);
              wireList(k.h);
            }
          }
          return;
        }
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
            wireList(list);
          });
      };
      // 0.42.0 모아 그릴 윤곽선(열쇠 = 함께 쓰는 윤곽선 버퍼)·삼각형 변(열쇠 = 'w' + 그물 열쇠) 묶음
      const lineBatches = new Map<unknown, LineBatch[]>();
      // 0.51.0 같은 프로그램·같은 값의 윤곽선을 그물마다 잇달아 그릴 때 고정 균일 변수를 다시 보내지 않는다(다른 길이 끼면 memo.p = null)
      const memo = this.lineMemoOff ? null : lineMemo();
      // 0.52.0 묶음 그물 윤곽선(강조 아닌 1화소)은 구간으로 모아 그물마다 그리기와 장면 차례 그대로(이 차례 끝에 한 번에 — 0.60.0 단면 하나에서도)
      mops = mOnLines ? new kit.RunList() : null;
      /** 0.60.0 묶음 그물마다 윤곽선 색(조각 edgeCols — 강조·그물마다 선 색이 없을 때 아래 col과 같은 값). 선 색 선택이 있으면 면 색마다 이 값 */
      const lineMemoC = new Map<Rgba, Rgba>();
      const lineOf = (c: Rgba): Rgba => {
        let v = lineMemoC.get(c);
        if (!v) {
          const key = `0${c.join()}|`;
          v = lineCache.get(key) ?? edgeLineColor(mode, c, st.colors, false, lineOpt, undefined);
          lineCache.set(key, v);
          lineMemoC.set(c, v);
        }
        return v;
      };
      const edgeCols = (g: MergeGroup): Rgba[] =>
        kit.edgeCols(
          g,
          () => faceCols(g)[0],
          flat ? st.colors.line : mode === 'shadedEdges' || mode === 'monochrome' || mode === 'noTexture' ? edgeCol : null,
          mode === 'xray' ? 0.9 : 1,
          lineOpt ? lineOf : null,
        );
      each(
        (r) => {
        // 0.51.0 화면 밖 그물: 모으는 길(같은 윤곽선 버퍼·삼각형 변 자리)이 아니면 건너뛴다 — 모으는 길은 묶음·차례를 그대로 두고 그릴 때 뺀다
        if (gone(r)) {
          const solo = st.parts?.(r.src.id);
          const batch = r.edges
            ? !solo && !!edgeN && (edgeN.get(r.edges.pos) ?? 0) >= instMin
            : meshLineKind(r.src, mode) === 'triangles' && !!wireGeoN && (wireGeoN.get(r.geo) ?? 0) >= instMin && !solo;
          if (!batch) return;
        }
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
        // 0.52.0 묶음 그물 윤곽선(굵기 1)은 구간에 더하고 다음 그물로(그물마다 그리기 선택 객체를 만들지 않는다).
        // 0.61.0 강조한 그물의 굵은 윤곽선(굵기 2)도 구간으로(굵기가 같은 구간끼리 — 0.60.0까지는 그물마다 drawLines, 8만 강조 825개에서 GL 호출 7만 남짓)
        if (mops && mergeEdge(r)) {
          if (r.edges!.parts) this.dropParts(r.edges!);
          mops.add(r, col, false, 0, alphaOf(r.src.id), hi ? 2 : 1);
          return;
        }
        const model = mm(r);
        if (r.edges) {
          const ep = st.parts?.(r.src.id);
          if (!ep && edgeN && (edgeN.get(r.edges.pos) ?? 0) >= instMin) {
            if (r.edges.parts) this.dropParts(r.edges);
            addLineBatch(lineBatches, r.edges.pos, r, col, hi ? 2 : 1, alphaOf(r.src.id), model);
            return;
          }
          const eparts = ep?.edges;
          const eo = { color: col, vcol: false, width: hi ? 2 : 1, dashed: false, alpha: alphaOf(r.src.id), clip: clipOf(model), clips: clipsOf(r.src.id, model) };
          if (!ep || !eparts) {
            if (r.edges.parts) this.dropParts(r.edges);
            if (mops) {
              const rec = r.edges;
              mops.draw(() => this.drawLines(f, rec, model, { ...eo, first: 0, count: rec.n }, st, stats, memo));
              return;
            }
            this.drawLines(f, r.edges, model, { ...eo, first: 0, count: r.edges.n }, st, stats, memo);
          } else {
            // 윤곽선 구간(숨김·강조)
            const rec = r.edges;
            const partsDraw = (): void => {
              if (memo) memo.p = null;
              const c = this.partCache(rec, ep.ver);
              const EC = lineCuts(rec, c, eparts, r.src.id, model, r.src.edges!, undefined);
              if (EC)
                for (const k of EC) {
                  this.drawLineList(f, rec, model, k.n, 0, rec.n, { ...eo, clips: k.clips }, st, stats);
                  this.drawLineList(f, rec, model, k.h, 0, rec.n, { ...eo, clips: k.clips, color: hiTint, width: 2 }, st, stats);
                }
              else {
                this.drawLineList(f, rec, model, this.lineList(rec, c, eparts, false, r.src.edges!, undefined), 0, rec.n, eo, st, stats);
                this.drawLineList(f, rec, model, this.lineList(rec, c, eparts, true, r.src.edges!, undefined), 0, rec.n, { ...eo, color: hiTint, width: 2 }, st, stats);
              }
            };
            if (mops) mops.draw(partsDraw);
            else partsDraw();
          }
        } else if (meshLineKind(r.src, mode) === 'triangles') {
          // 윤곽선이 없는 그물: 와이어프레임·숨은 선에서 삼각형 변(X-ray에서는 반투명 면만, triangleEdges: false면 선 없음)
          if (wireGeoN && (wireGeoN.get(r.geo) ?? 0) >= instMin && !st.parts?.(r.src.id)) {
            if (r.parts) this.dropParts(r);
            addLineBatch(lineBatches, `w${r.geo}`, r, col, 1, alphaOf(r.src.id), model);
            return;
          }
          if (mops) {
            mops.draw(() => {
              if (memo) memo.p = null;
              wireDraw(r, model, col);
            });
            return;
          }
          if (memo) memo.p = null;
          wireDraw(r, model, col);
        }
        },
        // 0.60.0 덩이는 예외(숨김·잘라냄·강조) 사이 구간으로(그물마다 윤곽선이 있고 윤곽선 구간 모음이 없을 때 — 강조한 그물은 굵게 따로 그린다)
        mops
          ? (k, fn) => {
              if (!k.edges || !fastOk || !kit.npOf(k, this.partsVer)) return false;
              const cols = edgeCols(k.g), vc = kit.noVc(k.g);
              return blockRuns(k, fn, true, (a, b) => mops!.range(k.g, a, b, cols, vc, 0, 1));
            }
          : null,
      );
      if (mops) {
        const ops = mops.ops;
        mops = null;
        mergeLines(ops, { dashed: false, bias: 0, capz: false }, memo);
      }
      // 0.42.0 모은 윤곽선·삼각형 변을 묶음마다 그리기 한 번으로(삼각형 변 색인은 묶음 첫 그물 것 하나만 만든다). 자리 자료 그림이 모자라면 그물마다
      for (const [key, list] of lineBatches)
        for (const b0 of list) {
          // 0.51.0 화면 밖 자리는 묶음에서 뺀다(묶음·차례는 그대로, 선 버퍼·삼각형 변 색인은 묶음 첫 자리 것)
          const b = culledN ? cutBatch(b0) : b0;
          if (!b.recs.length) continue;
          const wire = typeof key === 'string';
          const o = { color: b.color, vcol: false, width: b.width, dashed: false, alpha: b.alpha };
          if (wire ? this.drawLinesInst(f, null, b.models, o, st, stats, this.wireOf(b0.recs[0]!)) : this.drawLinesInst(f, b0.recs[0]!.edges!, b.models, o, st, stats)) continue;
          b.recs.forEach((r, i) => {
            if (wire) wireDraw(r, b.models[i], b.color);
            else this.drawLines(f, r.edges!, b.models[i], { ...o, first: 0, count: r.edges!.n }, st, stats);
          });
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
        // 0.44.0 구간 단면 갈래마다 그 평면들로
        const LC = lineCuts(rec, c, parts, id, model, positions, colors);
        if (LC) {
          for (const k of LC) for (const l of [k.n, k.h]) this.drawLineList(f, rec, model, l, 0, count, { ...o, clips: k.clips }, st, stats);
          return;
        }
        for (const hi of [false, true]) this.drawLineList(f, rec, model, this.lineList(rec, c, parts, hi, positions, colors), 0, count, o, st, stats);
      };
      // 0.42.0 같은 윤곽선 버퍼 자리가 하한 이상이면 묶음마다(점선은 같은 색·같은 불투명도 겹침이라 차례와 상관없다)
      const dashBatches = new Map<unknown, LineBatch[]>();
      // 0.51.0 그물마다 잇단 점선은 고정 균일 변수를 다시 보내지 않는다(구간 길이 끼면 memo.p = null)
      const dmemo = this.lineMemoOff ? null : lineMemo();
      // 0.52.0 묶음 그물 윤곽선의 숨은 점선도 구간으로(장면 차례 그대로 — 0.60.0 단면 하나에서도)
      mops = mOnLines && backEdges.meshes ? new kit.RunList() : null;
      const hiddenA = st.hiddenEdges;
      if (backEdges.meshes)
        each(
          (r) => {
            if (!r.edges) return;
            const ep = st.parts?.(r.src.id);
            if (!ep && edgeN && (edgeN.get(r.edges.pos) ?? 0) >= instMin) {
              addLineBatch(dashBatches, r.edges.pos, r, dashCol, 1, hiddenA * alphaOf(r.src.id), mm(r));
              return;
            }
            // 0.51.0 화면 밖 그물은 건너뛴다(모으는 길은 그릴 때 뺀다)
            if (gone(r)) return;
            const rec = r.edges;
            if (!ep?.edges) {
              const model = mm(r);
              if (mops) {
                if (mergeEdge(r)) mops.add(r, dashCol, false, 0, hiddenA * alphaOf(r.src.id));
                else mops.draw(() => this.drawLines(f, rec, model, { ...backEdgeDash(dashCol, hiddenA * alphaOf(r.src.id)), clip: clipOf(model), clips: clipsOf(r.src.id, model), first: 0, count: rec.n }, st, stats, dmemo));
                return;
              }
              this.drawLines(f, rec, model, { ...backEdgeDash(dashCol, hiddenA * alphaOf(r.src.id)), clip: clipOf(model), clips: clipsOf(r.src.id, model), first: 0, count: rec.n }, st, stats, dmemo);
              return;
            }
            const partsDash = (): void => {
              if (dmemo) dmemo.p = null;
              dashHidden(rec, r.src.id, mm(r), rec.n, ep.edges, ep.ver, r.src.edges!, undefined);
            };
            if (mops) mops.draw(partsDash);
            else partsDash();
          },
          // 0.60.0 덩이는 예외(숨김·잘라냄) 사이 구간으로(점선은 강조와 상관없다 — 겉모습이 없으면 불투명도는 hiddenA · 1)
          mops
            ? (k, fn) => {
                if (!k.edges) return false;
                const cols = kit.oneCol(k.g, 'd', dashCol), vc = kit.noVc(k.g);
                return blockRuns(k, fn, false, (a, b) => mops!.range(k.g, a, b, cols, vc, 0, hiddenA * 1));
              }
            : null,
        );
      if (mops) {
        const ops = mops.ops;
        mops = null;
        mergeLines(ops, { dashed: true, bias: BACK_EDGE_BIAS, capz: true }, dmemo);
      }
      for (const list of dashBatches.values())
        for (const b0 of list) {
          const b = culledN ? cutBatch(b0) : b0;
          if (!b.recs.length) continue;
          const r0 = b0.recs[0]!;
          if (this.drawLinesInst(f, r0.edges!, b.models, backEdgeDash(dashCol, b.alpha), st, stats)) continue;
          b.recs.forEach((r, i) => dashHidden(r.edges!, r.src.id, b.models[i], r.edges!.n, null, 0, r.src.edges!, undefined));
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
      // 0.60.0 겉모습이 없으면 그물마다 외곽선 색도 없다(그물마다 묻지 않는다)
      const perItem = !!look && visibleMeshes.some((r) => !!lookOf(r.src.id)?.profileColor && !transOf(r));
      if (!perItem && this.profCol) this.dropProfileColor();
      const fb = perItem ? this.profileColorTarget(devW, devH) : this.profileTarget(devW, devH);
      if (fb) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.viewport(0, 0, devW, devH);
        gl.clearDepth(1);
        gl.depthMask(true);
        const dc = stats.drawCalls, tr = stats.triangles;
        const inst0 = { ...this.instStats };
        const pc = st.profiles.color;
        if (perItem) {
          // 깊이와 함께 그물마다 외곽선 색을 쓴다(깊이만 그리는 프로그램 PCOL 변종 — 모형·시점·투영은 그물 그리기와 같은 순서로 합친다)
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          const dp = this.variant('depth', ['PCOL', ...(multi ? ['CLIPN'] : sec ? ['CLIP'] : [])]);
          gl.useProgram(dp.p);
          for (const r of visibleMeshes) {
            if (transOf(r) || gone(r)) continue;
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
            // 0.44.0 구간 단면 갈래마다 그 평면들로
            const C = meshCuts(r);
            if (C) {
              for (const k of C) {
                this.setClips(dp, clipsOfCut(r.src.id, model, k.cut));
                this.drawMeshGeometry(r, k.n);
                this.drawMeshGeometry(r, k.h);
              }
              continue;
            }
            const L = meshLists(r);
            if (!L) this.drawMeshGeometry(r, null);
            else for (const l of L) this.drawMeshGeometry(r, l);
          }
          gl.disable(gl.CULL_FACE);
          if (st.transparent) gl.clearColor(0, 0, 0, 0);
          else gl.clearColor(bg[0], bg[1], bg[2], 1);
        } else if (!depthDone) opaqueDepth(); // 0.49.0 주변 가림이 이미 그린 같은 깊이 그림은 다시 그리지 않는다
        stats.drawCalls = dc;
        stats.triangles = tr;
        this.instStats = inst0;
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
        const hiBase = { ...base, color: hiTint, vcol: false, width: (l.width ?? 1) + 1 };
        // 0.44.0 구간 단면 갈래마다 그 평면들로(갈래가 없으면 0.43.0 그대로 보통·강조 한 벌)
        const LC = lineCuts(r, c, p.prims, l.id, model, l.positions, l.colors);
        const sets = LC ? LC.map((k) => ({ ln: k.n, lh: k.h, clips: k.clips })) : [{ ln: this.lineList(r, c, p.prims, false, l.positions, l.colors), lh: this.lineList(r, c, p.prims, true, l.positions, l.colors), clips: base.clips }];
        if (count > 0)
          for (const s of sets) {
            this.drawLineList(f, r, model, s.ln, 0, count, { ...base, clips: s.clips, alpha: la }, st, stats);
            this.drawLineList(f, r, model, s.lh, 0, count, { ...hiBase, clips: s.clips, alpha: la }, st, stats);
          }
        if (range && range.ghost > 0 && count < r.n) {
          gl.enable(gl.BLEND);
          gl.depthMask(false);
          for (const s of sets) {
            this.drawLineList(f, r, model, s.ln, count, r.n, { ...base, clips: s.clips, alpha: range.ghost * la }, st, stats);
            this.drawLineList(f, r, model, s.lh, count, r.n, { ...hiBase, clips: s.clips, alpha: range.ghost * la }, st, stats);
          }
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
          // 0.44.0 구간 단면 갈래마다 그 평면들로
          const PC = multi ? cacheCuts(pc, pp.prims) : null;
          if (PC)
            for (const k of PC) {
              this.setClips(p, clipsOfCut(r.src.id, model, k));
              const ln = this.pointList(r, pc, pp.prims, false, k), lh = this.pointList(r, pc, pp.prims, true, k);
              if (ln.compact) draw(ln.compact.vao, ln.total, c, hi);
              if (lh.compact) draw(lh.compact.vao, lh.total, hiTint, true);
            }
          else {
            const ln = this.pointList(r, pc, pp.prims, false), lh = this.pointList(r, pc, pp.prims, true);
            if (ln.compact) draw(ln.compact.vao, ln.total, c, hi);
            if (lh.compact) draw(lh.compact.vao, lh.total, hiTint, true);
          }
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
    // 0.51.0 화면 밖 그물은 빼고(남은 그물의 정렬 차례는 그대로 — 안정 정렬)
    // 0.60.0 X-ray가 아니고 겉모습이 없으면 덩이 그물은 반투명이 아니다(굽기가 반투명 그물을 받지 않는다 — ok) — 덩이를 건너뛴다(차례는 visibleMeshes와 같다)
    let trans: MeshRec[] = [];
    if (mode !== 'wireframe' && !flat) {
      if (O && !xray && !look)
        each(
          (r) => {
            if (transOf(r) && !gone(r)) trans.push(r);
          },
          (k) => k.ok,
        );
      else trans = visibleMeshes.filter((r) => (xray || transOf(r)) && !gone(r));
    }
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
    this.renderMs = performance.now() - renderT0;
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
    lk: {
      trans: (r: MeshRec) => boolean;
      box: (r: MeshRec) => Box3;
      color: (r: MeshRec) => Rgba;
      /** 0.44.0 그물의 구간 단면 갈래들(없으면 null — 통째 그물)과 갈래 정점의 세계 범위 */
      cuts?: (r: MeshRec) => readonly number[] | null;
      cutBox?: (r: MeshRec, cut: number) => Box3;
    } | null,
  ): CapUnit[] {
    const out: CapUnit[] = [];
    const trans = (r: MeshRec): boolean => (lk ? lk.trans(r) : r.transparent);
    const boxOf = (r: MeshRec): Box3 => (lk ? lk.box(r) : r.box);
    const colOf = (r: MeshRec): Rgba => (lk ? lk.color(r) : r.src.color);
    const cutsOf = multi ? (lk?.cuts ?? null) : null;
    const build = (plane: Plane4, caps: 'closed' | 'all' | 'none', inScope: (r: MeshRec) => boolean, others: (r: MeshRec) => Plane4[], k = -1): void => {
      if (caps === 'none') return;
      const groups = new Map<string, CapUnit>();
      /** 단위에 그물 하나(cut은 0.44.0 구간 단면 갈래 — undefined면 통째, key는 capGroup 묶음 열쇠에 더할 갈래) */
      const add = (r: MeshRec, oth: Plane4[], cut: number | undefined, key: string | undefined): void => {
        const g = r.src.capGroup;
        // 갈래 단위의 범위는 그 갈래 정점의 범위(그물 통째 범위면 걸치지 않는 갈래도 단위가 되고 채운 다각형이 커진다)
        const box = cut !== undefined && lk?.cutBox ? lk.cutBox(r, cut) : boxOf(r);
        if (cut !== undefined && boxIsEmpty(box)) return;
        if (g !== undefined) {
          const gk = key === undefined ? g : `${g}\u0000${key}`;
          const u = groups.get(gk);
          if (u) {
            if (cut !== undefined && !u.cuts) u.cuts = u.meshes.map(() => undefined);
            u.meshes.push(r);
            u.cuts?.push(cut);
            u.box = unionBox(u.box, box);
          } else {
            const nu: CapUnit = { meshes: [r], box, plane, others: oth, color: colOf(r), group: true };
            if (cut !== undefined) nu.cuts = [cut];
            groups.set(gk, nu);
            out.push(nu);
          }
          return;
        }
        if ((caps === 'all' || r.src.closed === true) && boxStraddles(box, plane)) {
          const nu: CapUnit = { meshes: [r], box, plane, others: oth, color: colOf(r), group: false };
          if (cut !== undefined) nu.cuts = [cut];
          out.push(nu);
        }
      };
      for (const r of meshes) {
        if (trans(r)) continue;
        // 0.44.0 구간 단면 갈래가 있는 그물: 이 평면이 드는 갈래마다(그 갈래의 삼각형만 홀짝 — 채운 면은 그 갈래의 다른 평면들로 자른다).
        // 갈래 0(묶음 통째 평면만)은 통째 그물과 같은 capGroup 묶음에 든다
        const C = k >= 0 && cutsOf ? cutsOf(r) : null;
        if (C && multi) {
          for (const c of C) {
            const idx = new Set(multi.of(r.src.id));
            for (const b of cutBits(c)) if (b < multi.planes.length) idx.add(b);
            if (!idx.has(k)) continue;
            const oth = [...idx]
              .filter((i) => i !== k)
              .sort((a, b) => a - b)
              .map((i) => multi.planes[i]!.plane);
            add(r, oth, c, c ? String(c) : undefined);
          }
          continue;
        }
        if (!inScope(r)) continue;
        add(r, others(r), undefined, undefined);
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
          k,
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
    /** 그물의 [보통, 강조] 구간 목록(구간이 없으면 null — 통째). 0.44.0: cut을 주면 그 구간 단면 갈래만 */
    lists: (r: MeshRec, cut: number | undefined) => readonly DrawList[] | null,
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
      u.meshes.forEach((r, i) => {
        const L = lists(r, u.cuts?.[i]);
        if (!L) meshDraw(r, modelOf(r), r.src.color, 1, 0, false);
        else for (const l of L) meshDraw(r, modelOf(r), r.src.color, 1, 0, false, l);
      });
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
      this.meshMats(plainP, mat4Mul(f.proj, mv, this.d4b), mv);
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
    memo?: LineMemo | null,
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
      const vw = st.viewport ? st.viewport[0] : gl.drawingBufferWidth, vh = st.viewport ? st.viewport[1] : gl.drawingBufferHeight;
      const dash = o.dashed ? DASH[0] * st.dpr : 0;
      // 0.51.0 앞 그리기와 프로그램·값이 같으면(memo) 프로그램·고정 균일 변수를 다시 보내지 않는다 — 그물마다 바뀌는 행렬·단면 평면·안개만
      if (!memo || !lineSame(memo, p, o.color, o.vcol ? 1 : 0, o.alpha, o.bias ?? 0, wDev, dash, DASH[1] * st.dpr, vw, vh, clip ? 1 : 0)) {
        gl.useProgram(p.p);
        gl.uniform2f(this.loc(p, 'u_viewport'), vw, vh);
        gl.uniform1f(this.loc(p, 'u_width'), wDev);
        gl.uniform4f(this.loc(p, 'u_color'), o.color[0], o.color[1], o.color[2], o.color[3]);
        gl.uniform1f(this.loc(p, 'u_vcol'), o.vcol ? 1 : 0);
        gl.uniform1f(this.loc(p, 'u_alpha'), o.alpha);
        gl.uniform4f(this.loc(p, 'u_override'), 0, 0, 0, 0);
        gl.uniform1f(this.loc(p, 'u_bias'), o.bias ?? 0);
        gl.uniform2f(this.loc(p, 'u_dash'), dash, DASH[1] * st.dpr);
        if (!clip) gl.uniform4f(this.loc(p, 'u_clip'), NO_CLIP[0], NO_CLIP[1], NO_CLIP[2], NO_CLIP[3]);
      }
      if (clips) this.setClips(p, clips);
      if (fog) this.setLineFog(p, f, matrix, fog);
      gl.uniformMatrix4fv(this.loc(p, 'u_mvp'), false, mvp);
      if (clip) gl.uniform4f(this.loc(p, 'u_clip'), clip[0], clip[1], clip[2], clip[3]);
      gl.bindVertexArray(r.wide);
      // 0.52.0 묶음 저장소의 윤곽선은 묶음 선분 버퍼 안 그 그물 자리부터(r.first — 아니면 0)
      const f0 = (r.first ?? 0) + o.first;
      if (f0) this.bindWide(r.pos, r.col, f0);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, o.count);
      if (f0) this.bindWide(r.pos, r.col, 0);
    } else {
      const p = fog
        ? this.variant('thin', ['FOG', ...(clips ? ['CLIPN'] : clip ? ['CLIP'] : [])])
        : clips
          ? this.variant('thin', ['CLIPN'])
          : clip
            ? this.thinClip()
            : this.thinP;
      if (!memo || !lineSame(memo, p, o.color, o.vcol ? 1 : 0, o.alpha, o.bias ?? 0, 0, 0, 0, 0, 0, 0)) {
        gl.useProgram(p.p);
        gl.uniform4f(this.loc(p, 'u_color'), o.color[0], o.color[1], o.color[2], o.color[3]);
        gl.uniform1f(this.loc(p, 'u_vcol'), o.vcol ? 1 : 0);
        gl.uniform1f(this.loc(p, 'u_alpha'), o.alpha);
        gl.uniform4f(this.loc(p, 'u_override'), 0, 0, 0, 0);
        gl.uniform1f(this.loc(p, 'u_bias'), o.bias ?? 0);
      }
      if (clips) this.setClips(p, clips);
      if (fog) this.setLineFog(p, f, matrix, fog);
      gl.uniformMatrix4fv(this.loc(p, 'u_mvp'), false, mvp);
      if (clip) gl.uniform4f(this.loc(p, 'u_clip'), clip[0], clip[1], clip[2], clip[3]);
      gl.bindVertexArray(r.thin);
      gl.drawArrays(gl.LINES, ((r.first ?? 0) + o.first) * 2, o.count * 2);
    }
    stats.drawCalls++;
    stats.segments += o.count;
  }
}

/**
 * 0.51.0 선 그리기 상태 기억(drawLines의 memo — 그물 윤곽선·숨은 점선처럼 같은 프로그램·같은 값의 선을 그물마다 잇달아 그릴 때).
 * p = 마지막으로 쓴 프로그램(null이면 다음 그리기는 모두 보낸다 — 부르는 쪽이 사이에 다른 프로그램·균일 변수를 쓰면 null로), v = 그때 고정 균일 변수 값
 */
export interface LineMemo {
  p: Prog | null;
  v: Float64Array;
}

/** 새 선 상태 기억(비었음) */
function lineMemo(): LineMemo {
  return { p: null, v: new Float64Array(13) };
}

/** 기억한 프로그램·값과 같으면 true, 아니면 새 값을 적고 false(같은 수인지는 === — NaN은 늘 다르게 보아 다시 보낸다) */
function lineSame(m: LineMemo, p: Prog, c: Rgba, vcol: number, alpha: number, bias: number, w: number, d0: number, d1: number, vw: number, vh: number, clip: number): boolean {
  const v = m.v;
  if (
    m.p === p &&
    v[0] === c[0] &&
    v[1] === c[1] &&
    v[2] === c[2] &&
    v[3] === c[3] &&
    v[4] === vcol &&
    v[5] === alpha &&
    v[6] === bias &&
    v[7] === w &&
    v[8] === d0 &&
    v[9] === d1 &&
    v[10] === vw &&
    v[11] === vh &&
    v[12] === clip
  )
    return true;
  m.p = p;
  v[0] = c[0];
  v[1] = c[1];
  v[2] = c[2];
  v[3] = c[3];
  v[4] = vcol;
  v[5] = alpha;
  v[6] = bias;
  v[7] = w;
  v[8] = d0;
  v[9] = d1;
  v[10] = vw;
  v[11] = vh;
  v[12] = clip;
  return false;
}
