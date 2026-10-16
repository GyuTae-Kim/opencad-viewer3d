/**
 * WebGL2 그리기: 장면 형식 배열을 그대로 GPU 버퍼에 올리고(같은 배열은 한 번만), 묶음마다 그리기 한 번.
 * 화면 상태(카메라·모드·강조·그리기 범위·단면)는 부를 때마다 RenderState로 받는다. DOM은 모른다.
 *
 * 큰 좌표: 묶음 원점(origin)은 모형 행렬 matrix · T(origin)으로 합쳐 double로 시점·투영 행렬과 곱한 뒤에야 float32로 넘긴다(RTC).
 * 그래서 positions가 원점 기준의 작은 값이면 세계 좌표가 1e6대여도 떨리지 않는다. 원점이 없으면 예전과 같은 행렬을 쓴다.
 *
 * 단면: 세계 평면을 묶음마다 로컬 좌표로 옮겨(planeToLocal) u_clip으로 넘긴다. 잘린 면 채우기는 스텐실 홀짝으로 한다 —
 * 닫힌 그물을 잘린 채로 스텐실에 뒤집어 그리면 평면 위 입체 안쪽 화소만 1이 남고, 거기에 평면 ∩ 범위 다각형을 칠한다.
 */
import type { Box3, LineSet3d, Mesh3d, PointSet3d, Rgba, Scene3d } from './types';
import type { ViewFrame } from './camera';
import type { GridLines } from './grid';
import { type MarkerKind, markerMesh } from './marker';
import { type V3, hasOrigin, mat4Mul, modelMatrix, normalMatrix, translation } from './math';
import { boxCenter, meshBounds } from './bounds';
import { MESH_FS, MESH_VS, POINT_FS, POINT_VS, THIN_FS, THIN_VS, WIDE_FS, WIDE_VS, withClip } from './shaders';
import { NO_CLIP, type Plane4, boxStraddles, planeBoxPolygon, planeToLocal } from './section';

export type RenderMode = 'shaded' | 'shadedEdges' | 'wireframe' | 'xray';

export interface RenderColors {
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
}

export interface RenderStats {
  drawCalls: number;
  triangles: number;
  segments: number;
  points: number;
}

/** 끄는 동안 이보다 많은 선분 묶음은 gl.LINES(1화소)로 그린다 */
export const FAST_LINES_WHILE_MOVING = 400_000;

interface Prog {
  p: WebGLProgram;
  u: Map<string, WebGLUniformLocation | null>;
}

interface LineRec {
  id: string;
  group: string | undefined;
  n: number;
  pos: WebGLBuffer;
  col: WebGLBuffer | null;
  wide: WebGLVertexArrayObject;
  thin: WebGLVertexArrayObject;
  /** 로컬 → 세계(묶음 원점), 없으면 단위 */
  model?: ArrayLike<number>;
}

interface MeshRec {
  src: Mesh3d;
  vao: WebGLVertexArrayObject;
  count: number;
  indexed: boolean;
  hasNormals: boolean;
  hasColors: boolean;
  transparent: boolean;
  /** 로컬 → 세계 = matrix · T(origin)(원점이 없으면 matrix 그대로, 둘 다 없으면 undefined) */
  model: ArrayLike<number> | undefined;
  /** 세계 범위(행렬·원점 반영) */
  box: Box3;
  /** 세계 좌표 범위의 가운데(반투명 정렬용) */
  center: V3;
  edges: LineRec | null;
  wire: { vao: WebGLVertexArrayObject; count: number } | null;
}

interface PointRec {
  src: PointSet3d;
  n: number;
  vao: WebGLVertexArrayObject;
  model?: ArrayLike<number>;
}

interface ThinRec {
  vao: WebGLVertexArrayObject;
  buf: WebGLBuffer;
  count: number;
}

const DASH: [number, number] = [7, 5];
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
  stats: RenderStats = { drawCalls: 0, triangles: 0, segments: 0, points: 0 };
  /** 균일 변수용 임시 배열(그리기마다 새로 만들지 않는다) */
  private m4a = new Float32Array(16);
  private m4b = new Float32Array(16);
  private m3 = new Float32Array(9);
  private d4a = new Float64Array(16);
  private d4b = new Float64Array(16);
  private capData = new Float32Array(CAP_MAX_VERTS * 3);

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
    this.meshC = null;
    this.thinC = null;
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
    return (this.meshC ??= this.program(withClip(MESH_VS), withClip(MESH_FS)));
  }

  private thinClip(): Prog {
    return (this.thinC ??= this.program(withClip(THIN_VS), withClip(THIN_FS)));
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

  /** 장면 올리기(이전 것은 지운다) */
  setScene(scene: Scene3d): void {
    this.clear();
    for (const m of scene.meshes) this.meshes.push(this.meshRec(m));
    for (const l of scene.lines) {
      const r = this.lineRec(l.id, l.group, l.positions, l.colors);
      if (hasOrigin(l.origin)) r.model = translation(l.origin);
      this.lines.push({ ...r, src: l });
    }
    for (const p of scene.points ?? []) this.points.push(this.pointRec(p));
    this.gl.bindVertexArray(null);
  }

  private meshRec(m: Mesh3d): MeshRec {
    const gl = this.gl;
    const nv = Math.floor(m.positions.length / 3);
    const vao = this.vao();
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
    let count: number;
    const indexed = !!m.indices;
    if (m.indices) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.elemBuf(m.indices));
      count = m.indices.length - (m.indices.length % 3);
    } else count = nv - (nv % 3);
    gl.bindVertexArray(null);
    let transparent = m.color[3] < 0.999;
    if (hasColors && !transparent) {
      // 정점 색에 반투명이 있으면 투명 차례에 그린다(앞 몇천 개만 본다)
      const c = m.colors!;
      for (let i = 3, e = Math.min(c.length, 4 * 4096); i < e; i += 4)
        if (c[i]! < 0.999) {
          transparent = true;
          break;
        }
    }
    const edges = m.edges && m.edges.length >= 6 ? this.lineRec(m.id, m.group, m.edges, undefined) : null;
    const box = meshBounds(m);
    return { src: m, vao, count, indexed, hasNormals, hasColors, transparent, model: modelMatrix(m.matrix, m.origin), box, center: boxCenter(box), edges, wire: null };
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

  /** 따로 두는 선분(강조·단면 테두리): 버퍼와 VAO를 새로 만든다. origin이 있으면 positions는 그 점 기준 */
  private dynLines(id: string, positions: Float32Array | null, origin?: readonly number[] | null): LineRec | null {
    const gl = this.gl;
    const n = positions ? Math.floor(positions.length / 6) : 0;
    if (!positions || !n) return null;
    const pos = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.bufferData(gl.ARRAY_BUFFER, positions.subarray(0, n * 6), gl.DYNAMIC_DRAW);
    const wide = gl.createVertexArray()!;
    gl.bindVertexArray(wide);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadWide);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    this.bindWide(pos, null, 0);
    const thin = gl.createVertexArray()!;
    gl.bindVertexArray(thin);
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);
    return { id, group: undefined, n, pos, col: null, wide, thin, model: hasOrigin(origin) ? translation(origin) : undefined };
  }

  private deleteDyn(r: LineRec | null): void {
    if (!r) return;
    const gl = this.gl;
    gl.deleteBuffer(r.pos);
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

  /** 장면 GPU 자료 지우기(격자·표시 그물은 남긴다) */
  clear(): void {
    const gl = this.gl;
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
    for (const p of [this.mesh, this.wideP, this.thinP, this.pointP, this.meshC, this.thinC]) if (p) gl.deleteProgram(p.p);
    this.meshC = null;
    this.thinC = null;
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
    const sec = st.section ?? null;
    const capsOn = !!sec && sec.caps !== 'none' && this.stencilOk && (st.mode === 'shaded' || st.mode === 'shadedEdges');
    gl.viewport(0, 0, devW, devH);
    const bg = st.colors.background;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clearDepth(1);
    gl.depthMask(true);
    gl.colorMask(true, true, true, true);
    if (capsOn) {
      gl.clearStencil(0);
      gl.stencilMask(0xff);
    }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | (capsOn ? gl.STENCIL_BUFFER_BIT : 0));
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const vpF = new Float32Array(f.viewProj);
    const ortho = f.projection === 'orthographic' ? 1 : 0;
    const vis = (id: string, g: string | undefined): boolean => st.visible(id, g);
    const hiTint = st.colors.highlight;
    const mode = st.mode;
    /** 묶음 로컬 좌표의 단면 평면(단면이 없으면 null) */
    const clipOf = (model: ArrayLike<number> | undefined): Plane4 | null => (sec ? planeToLocal(sec.plane, model) : null);

    // 그물 공통. 같은 값의 균일 변수는 다시 보내지 않는다(부품이 수천 개인 조립품에서 호출 수를 줄인다)
    // 그물 프로그램을 쓰기 시작할 때 meshUse()로 캐시를 비운다
    let cur: Prog = this.mesh;
    let lastMat: ArrayLike<number> | null | undefined;
    let lastCol = '';
    let lastFlags = '';
    let lastCull: boolean | undefined;
    const meshUse = (p: Prog): void => {
      cur = p;
      gl.useProgram(p.p);
      lastMat = undefined;
      lastCol = '';
      lastFlags = '';
      lastCull = undefined;
      gl.uniform1f(this.loc(p, 'u_ortho'), ortho);
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
      if (p === this.meshC) {
        const c = clipOf(model) ?? NO_CLIP;
        gl.uniform4f(this.loc(p, 'u_clip'), c[0], c[1], c[2], c[3]);
      }
    };
    const meshDraw = (r: MeshRec, matrix: ArrayLike<number> | undefined, color: Rgba, alpha: number, tint: number, cull: boolean): void => {
      const p = cur;
      const m = matrix ?? null;
      if (m !== lastMat) {
        lastMat = m;
        setMeshMatrix(matrix);
      }
      const ck = `${color[0]},${color[1]},${color[2]},${color[3]}`;
      if (ck !== lastCol) {
        lastCol = ck;
        gl.uniform4f(this.loc(p, 'u_color'), color[0], color[1], color[2], color[3]);
      }
      const fk = `${r.hasColors ? 1 : 0}${r.hasNormals ? 1 : 0}|${tint}|${alpha}`;
      if (fk !== lastFlags) {
        lastFlags = fk;
        gl.uniform1f(this.loc(p, 'u_vcol'), r.hasColors ? 1 : 0);
        gl.uniform1f(this.loc(p, 'u_hasNrm'), r.hasNormals ? 1 : 0);
        gl.uniform4f(this.loc(p, 'u_tint'), hiTint[0], hiTint[1], hiTint[2], tint);
        gl.uniform1f(this.loc(p, 'u_alpha'), alpha);
      }
      if (cull !== lastCull) {
        lastCull = cull;
        if (cull) gl.enable(gl.CULL_FACE);
        else gl.disable(gl.CULL_FACE);
      }
      gl.bindVertexArray(r.vao);
      if (r.indexed) gl.drawElements(gl.TRIANGLES, r.count, gl.UNSIGNED_INT, 0);
      else gl.drawArrays(gl.TRIANGLES, 0, r.count);
      stats.drawCalls++;
      stats.triangles += r.count / 3;
    };
    const sceneMeshProg = (): Prog => (sec ? this.meshClip() : this.mesh);

    const visibleMeshes = this.meshes.filter((r) => vis(r.src.id, r.src.group));

    // 1) 불투명 면
    if (mode === 'shaded' || mode === 'shadedEdges') {
      meshUse(sceneMeshProg());
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 1);
      for (const r of visibleMeshes) {
        if (r.transparent) continue;
        meshDraw(r, r.model, r.src.color, 1, st.highlight.has(r.src.id) ? 0.5 : 0, r.src.doubleSided === false);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.disable(gl.CULL_FACE);
      // 1b) 잘린 면 채우기
      if (capsOn && sec) this.drawCaps(f, devW, devH, sec, visibleMeshes, st, stats, meshUse, meshDraw, () => cur);
    }

    // 1c) 단면 테두리(교선): 면 위에 깊이를 따져 굵게
    if (sec && this.cutSeg) {
      gl.enable(gl.BLEND);
      this.drawLines(f, this.cutSeg, this.cutSeg.model, { color: sec.color, vcol: false, width: sec.width, dashed: false, alpha: 1, first: 0, count: this.cutSeg.n, bias: 2e-5 }, st, stats);
      gl.disable(gl.BLEND);
    }

    // 2) 윤곽선·와이어프레임
    if (mode !== 'shaded') {
      const edgeCol = st.colors.edge;
      gl.enable(gl.BLEND);
      for (const r of visibleMeshes) {
        const hi = st.highlight.has(r.src.id);
        const c = r.src.color;
        const col: Rgba = hi ? hiTint : mode === 'shadedEdges' ? edgeCol : [c[0], c[1], c[2], mode === 'xray' ? 0.9 : 1];
        if (r.edges) {
          this.drawLines(f, r.edges, r.model, { color: col, vcol: false, width: hi ? 2 : 1, dashed: false, alpha: 1, first: 0, count: r.edges.n, clip: clipOf(r.model) }, st, stats);
        } else if (mode === 'wireframe') {
          // 윤곽선이 없는 그물: 삼각형 변(X-ray에서는 반투명 면만)
          const w = this.wireOf(r);
          const clip = clipOf(r.model);
          const p = clip ? this.thinClip() : this.thinP;
          gl.useProgram(p.p);
          this.m4a.set(r.model ? mat4Mul(f.viewProj, r.model, this.d4a) : f.viewProj);
          gl.uniformMatrix4fv(this.loc(p, 'u_mvp'), false, this.m4a);
          gl.uniform4f(this.loc(p, 'u_color'), col[0], col[1], col[2], col[3]);
          gl.uniform1f(this.loc(p, 'u_vcol'), 0);
          gl.uniform1f(this.loc(p, 'u_alpha'), 1);
          gl.uniform4f(this.loc(p, 'u_override'), 0, 0, 0, 0);
          gl.uniform1f(this.loc(p, 'u_bias'), 0);
          if (clip) gl.uniform4f(this.loc(p, 'u_clip'), clip[0], clip[1], clip[2], clip[3]);
          gl.bindVertexArray(w.vao);
          gl.drawElements(gl.LINES, w.count, gl.UNSIGNED_INT, 0);
          stats.drawCalls++;
          stats.segments += w.count / 2;
        }
      }
      gl.disable(gl.BLEND);
    }

    // 3) 선분 묶음
    for (const r of this.lines) {
      const l = r.src;
      if (!vis(l.id, l.group)) continue;
      const hi = st.highlight.has(l.id);
      const range = st.ranges.get(l.id);
      const count = range ? Math.max(0, Math.min(r.n, Math.floor(range.count))) : r.n;
      const color = l.color ?? st.colors.line;
      const base = { color: hi ? hiTint : color, vcol: !!r.col && !hi, width: (l.width ?? 1) + (hi ? 1 : 0), dashed: !!l.dashed, clip: clipOf(r.model) };
      const blend = (l.color?.[3] ?? 1) < 1 || !!r.col;
      if (blend) gl.enable(gl.BLEND);
      if (count > 0) this.drawLines(f, r, r.model, { ...base, alpha: 1, first: 0, count }, st, stats);
      if (range && range.ghost > 0 && count < r.n) {
        gl.enable(gl.BLEND);
        gl.depthMask(false);
        this.drawLines(f, r, r.model, { ...base, alpha: range.ghost, first: count, count: r.n - count }, st, stats);
        gl.depthMask(true);
      }
      gl.disable(gl.BLEND);
    }

    // 4) 점
    if (this.points.length) {
      const p = this.pointP;
      gl.useProgram(p.p);
      gl.uniformMatrix4fv(this.loc(p, 'u_mvp'), false, vpF);
      gl.uniform2f(this.loc(p, 'u_viewport'), devW, devH);
      gl.uniform1f(this.loc(p, 'u_bias'), 2e-5);
      gl.uniform4f(this.loc(p, 'u_clip'), NO_CLIP[0], NO_CLIP[1], NO_CLIP[2], NO_CLIP[3]);
      let shifted = false;
      for (const r of this.points) {
        if (!vis(r.src.id, r.src.group) || !r.n) continue;
        const hi = st.highlight.has(r.src.id);
        const c = hi ? hiTint : r.src.color ?? st.colors.point;
        if (r.model || shifted) {
          this.m4a.set(r.model ? mat4Mul(f.viewProj, r.model, this.d4a) : f.viewProj);
          gl.uniformMatrix4fv(this.loc(p, 'u_mvp'), false, this.m4a);
          shifted = !!r.model;
        }
        if (sec) {
          const k = clipOf(r.model)!;
          gl.uniform4f(this.loc(p, 'u_clip'), k[0], k[1], k[2], k[3]);
        }
        gl.uniform1f(this.loc(p, 'u_size'), Math.max(1, (r.src.size ?? 4) * st.dpr + (hi ? 2 * st.dpr : 0)));
        gl.uniform4f(this.loc(p, 'u_color'), c[0], c[1], c[2], c[3]);
        gl.uniform4f(this.loc(p, 'u_ring'), c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 1);
        if (c[3] < 1) gl.enable(gl.BLEND);
        gl.bindVertexArray(r.vao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, r.n);
        gl.disable(gl.BLEND);
        stats.drawCalls++;
        stats.points += r.n;
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
      const base = { color: s.color, vcol: false, width: s.width, dashed: false, first: 0, count: r.n, clip: clipOf(r.model) };
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
    const trans = mode === 'wireframe' ? [] : visibleMeshes.filter((r) => xray || r.transparent);
    if (trans.length) {
      const eye = f.eye;
      const fwd: V3 = [-f.basis.back[0], -f.basis.back[1], -f.basis.back[2]];
      // center는 이미 세계 좌표(행렬·원점을 거친 범위의 가운데)
      const depth = (r: MeshRec): number => {
        const c = r.center;
        return (c[0] - eye[0]) * fwd[0] + (c[1] - eye[1]) * fwd[1] + (c[2] - eye[2]) * fwd[2];
      };
      trans.sort((a, b) => depth(b) - depth(a));
      meshUse(sceneMeshProg());
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      for (const r of trans) meshDraw(r, r.model, r.src.color, xray ? 0.22 : 1, st.highlight.has(r.src.id) ? 0.5 : 0, false);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    gl.bindVertexArray(null);
  }

  /**
   * 잘린 면 채우기(스텐실 홀짝). 그물마다: 화면 사각형만 스텐실을 비우고 → 잘린 그물을 색·깊이 없이 뒤집어 그리고(INVERT) →
   * 스텐실이 1인 곳에 평면 ∩ 범위 다각형을 칠한다. 닫힌 그물이면 1인 화소는 평면 위 입체 안쪽뿐이다.
   */
  private drawCaps(
    f: ViewFrame,
    devW: number,
    devH: number,
    sec: SectionDraw,
    meshes: readonly MeshRec[],
    st: RenderState,
    stats: RenderStats,
    meshUse: (p: Prog) => void,
    meshDraw: (r: MeshRec, matrix: ArrayLike<number> | undefined, color: Rgba, alpha: number, tint: number, cull: boolean) => void,
    current: () => Prog,
  ): void {
    const gl = this.gl;
    const list = meshes.filter((r) => !r.transparent && (sec.caps === 'all' || r.src.closed === true) && boxStraddles(r.box, sec.plane));
    if (!list.length) return;
    const clipP = this.meshClip();
    const plainP = this.mesh;
    gl.enable(gl.STENCIL_TEST);
    gl.enable(gl.SCISSOR_TEST);
    gl.stencilMask(0xff);
    const ortho = f.projection === 'orthographic' ? 1 : 0;
    for (const r of list) {
      const poly = planeBoxPolygon(r.box, sec.plane);
      if (poly.length < 3 || poly.length > CAP_MAX_VERTS) continue;
      const rect = this.screenRect(f, r.box, devW, devH);
      if (!rect) continue;
      gl.scissor(rect.x, rect.y, rect.w, rect.h);
      gl.clear(gl.STENCIL_BUFFER_BIT);
      // 홀짝: 남은 그물 조각 수
      gl.colorMask(false, false, false, false);
      gl.depthMask(false);
      gl.disable(gl.DEPTH_TEST);
      gl.stencilFunc(gl.ALWAYS, 0, 1);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
      if (current() !== clipP) meshUse(clipP);
      meshDraw(r, r.model, r.src.color, 1, 0, false);
      stats.drawCalls--; // 화면에 보이는 그리기가 아니므로 세지 않는다
      stats.triangles -= r.count / 3;
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
      const mv = mat4Mul(f.view, translation(c), this.d4a);
      this.m4a.set(mat4Mul(f.proj, mv, this.d4b));
      this.m4b.set(mv);
      normalMatrix(mv, this.m3);
      gl.uniformMatrix4fv(this.loc(plainP, 'u_mvp'), false, this.m4a);
      gl.uniformMatrix4fv(this.loc(plainP, 'u_mv'), false, this.m4b);
      gl.uniformMatrix3fv(this.loc(plainP, 'u_nmat'), false, this.m3);
      const mc = r.src.color, sc = sec.color;
      const k = 0.25;
      gl.uniform4f(this.loc(plainP, 'u_color'), mc[0] + (sc[0] - mc[0]) * k, mc[1] + (sc[1] - mc[1]) * k, mc[2] + (sc[2] - mc[2]) * k, 1);
      gl.uniform1f(this.loc(plainP, 'u_vcol'), 0);
      gl.uniform1f(this.loc(plainP, 'u_hasNrm'), 0);
      const hi = st.highlight.has(r.src.id) ? 0.5 : 0;
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
    o: { color: Rgba; vcol: boolean; width: number; dashed: boolean; alpha: number; first: number; count: number; bias?: number; clip?: Plane4 | null },
    st: RenderState,
    stats: RenderStats,
  ): void {
    const gl = this.gl;
    if (o.count <= 0) return;
    const mvp = this.m4a;
    mvp.set(matrix ? mat4Mul(f.viewProj, matrix, this.d4a) : f.viewProj);
    const wDev = o.width * st.dpr;
    const fast = st.interacting && r.n > FAST_LINES_WHILE_MOVING;
    const wide = !fast && (o.dashed || wDev > 1.01);
    const clip = o.clip ?? null;
    if (wide) {
      const p = this.wideP;
      gl.useProgram(p.p);
      gl.uniformMatrix4fv(this.loc(p, 'u_mvp'), false, mvp);
      gl.uniform2f(this.loc(p, 'u_viewport'), gl.drawingBufferWidth, gl.drawingBufferHeight);
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
      const p = clip ? this.thinClip() : this.thinP;
      gl.useProgram(p.p);
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
