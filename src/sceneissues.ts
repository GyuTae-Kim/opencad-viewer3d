/**
 * 0.50.0 장면 입력 검사(순수 함수 — DOM·WebGL 없이 돈다. 앱이 워커에서 해석 결과를 미리 볼 때도 쓴다).
 *
 * 앱이 깨진 파일에서 만든 장면에는 NaN·무한대·1e38 같은 좌표, 정점 수 밖 색인(−1을 Uint32로 담은 0xffffffff 포함), 길이가 맞지 않는 배열,
 * 유한하지 않은 색·행렬·원점·굵기가 들어올 수 있다. 0.49.0은 이를 거르지 않아 화면 전체가 비거나(큰 좌표가 장면 범위를 키워 카메라 행렬이 넘침),
 * 예외로 장면을 열지 못하거나(무한 범위의 격자), 그물이 뭉개지거나(WebGL2는 0xffffffff를 늘 '도형 다시 시작'으로 읽어 뒤 삼각형이 모두 어긋남),
 * 항목이 소리 없이 사라졌다(유한하지 않은 원점·행렬·색).
 *
 * 뷰어(Viewer3d.setScene·setMesh)는 이 검사로 깨진 부분만 빼거나 고쳐 그리고 그 내용을 알림(SceneIssue — Viewer3d.sceneIssues·onSceneIssues)으로 알린다.
 * 멀쩡한 장면은 같은 객체·같은 배열을 그대로 쓴다(새 배열을 만들지 않는다). 배열 검사는 배열마다 한 번만 한다(WeakMap — 정점 훑기는 범위 계산과 함께).
 */
import { COORD_LIMIT, onForgetBounds, positionsBad, positionsBox } from './bounds';
import type { Box3, LineSet3d, Mesh3d, PointSet3d, Rgba, Scene3d } from './types';

export { COORD_LIMIT } from './bounds';

/**
 * 알림 종류(값은 바뀌지 않는다 — 앱이 제 말로 옮길 때 열쇠로 쓴다):
 * - 'bounds': Scene3d.bounds가 유한하지 않거나 뒤집혔거나 한도 밖 → 쓰지 않고 장면에서 다시 센다
 * - 'placement': origin·matrix가 유한한 수 셋·열여섯이 아니거나 항목 상자를 한도(COORD_LIMIT) 밖으로 옮긴다, positions가 없다 → 그 항목을 그리지도 고르지도 않는다(어디에 놓을지 모른다)
 * - 'billboard': billboard.origin이 유한하지 않다 → 마주 보기를 하지 않는다(놓인 그대로 그린다)
 * - 'positions': 정점 좌표가 NaN·무한대·|값| > COORD_LIMIT → 범위·카메라 맞춤에서 빼고, 그 정점을 쓰는 삼각형·선분을 그리지 않는다
 * - 'indices': 정점 수 밖 색인(0xffffffff 포함)이 든 삼각형 → 그 삼각형을 그리지 않는다
 * - 'length': positions·indices·edges 길이가 3·3·6의 배수가 아니다 → 남는 값을 쓰지 않는다(0.49.0과 같음 — 알리기만)
 * - 'normals': 법선 길이가 정점 수와 맞지 않는다 → 법선을 쓰지 않는다(평면 음영 — 0.49.0과 같음)
 * - 'colors': 정점 색이 정점 수보다 짧거나 유한하지 않은 값이 있다 → 정점 색을 쓰지 않고 color로 칠한다
 * - 'uvs': 무늬 좌표 길이가 정점 수와 맞지 않는다 → 무늬 없이 칠한다(0.49.0과 같음)
 * - 'color': color·backColor가 유한한 0 이상 수 셋·넷이 아니다 → 기본색(그물 회색, 선분·점은 테마 색)으로 — 뒷면 색은 쓰지 않는다
 * - 'material': roughness·metallic·normalScale·uvTransform이 유한하지 않다 → 그 값을 쓰지 않는다(기본)
 * - 'width': 선 굵기가 유한하지 않다 → 1
 * - 'size': 점 크기가 유한하지 않다 → 4
 * - 'ids': segmentIds·pointIds가 선분·점 수보다 짧다 → 모자란 뒤쪽은 배열 안 번호를 돌려준다(0.49.0과 같음)
 * - 'duplicate-id': 장면에 같은 id가 또 있다 → 둘 다 그리지만 id로 찾는 함수(숨김·겉모습·구간 등)는 한 항목만 본다
 */
export type SceneIssueCode =
  | 'bounds'
  | 'placement'
  | 'billboard'
  | 'positions'
  | 'indices'
  | 'length'
  | 'normals'
  | 'colors'
  | 'uvs'
  | 'color'
  | 'material'
  | 'width'
  | 'size'
  | 'ids'
  | 'duplicate-id';

/** 코어가 한 일: 'skipped' 항목을 빼고 그림, 'fixed' 깨진 부분만 빼거나 고쳐 그림, 'ignored' 그 필드를 쓰지 않음, 'kept' 그대로 둠(알리기만) */
export type SceneIssueAction = 'skipped' | 'fixed' | 'ignored' | 'kept';

export interface SceneIssue {
  code: SceneIssueCode;
  action: SceneIssueAction;
  /** 항목 종류(장면 전체 — bounds — 면 'scene') */
  kind: 'mesh' | 'line' | 'point' | 'scene';
  /** 항목 id(장면 전체면 없음) */
  id?: string;
  /** 그 필드 이름(예: 'positions', 'edges', 'origin', 'backColor') */
  field?: string;
  /** 깨진 개수(정점·삼각형·선분·값 수 — 셀 수 없으면 1) */
  count: number;
}

/** 알림 글(한국어 기본 — 앱이 code로 제 말을 쓸 수 있다). {id}·{field}·{count} 자리를 채운다 */
export const SCENE_ISSUE_MESSAGES: Readonly<Record<SceneIssueCode, string>> = {
  bounds: '장면 범위(bounds)가 유한하지 않아 그물에서 다시 셌습니다',
  placement: '{id}: {field}가 유한한 수가 아니거나 항목을 좌표 한도 밖으로 옮겨 그리지 않았습니다',
  billboard: '{id}: billboard.origin이 유한하지 않아 마주 보기를 하지 않았습니다',
  positions: '{id}: {field} 정점 {count}개가 NaN·무한대이거나 너무 커서 그 정점을 쓰는 도형을 그리지 않았습니다',
  indices: '{id}: 정점 수 밖 색인이 든 삼각형 {count}개를 그리지 않았습니다',
  length: '{id}: {field} 길이가 맞지 않아 남는 값 {count}개를 쓰지 않았습니다',
  normals: '{id}: 법선 길이가 정점 수와 맞지 않아 평면 음영으로 그렸습니다',
  colors: '{id}: 정점 색이 모자라거나 유한하지 않아 한 색으로 칠했습니다',
  uvs: '{id}: 무늬 좌표 길이가 정점 수와 맞지 않아 무늬 없이 칠했습니다',
  color: '{id}: {field}가 유한한 색이 아니어서 기본색으로 칠했습니다',
  material: '{id}: {field}가 유한하지 않아 기본값을 썼습니다',
  width: '{id}: 선 굵기가 유한하지 않아 1로 그렸습니다',
  size: '{id}: 점 크기가 유한하지 않아 4로 그렸습니다',
  ids: '{id}: {field}가 {count}개 모자라 뒤쪽은 배열 안 번호를 돌려줍니다',
  'duplicate-id': '{id}: 같은 id가 장면에 또 있어 id로 찾는 기능은 한 항목만 봅니다',
};

/** 알림 하나를 글로(messages로 code별 글을 바꿀 수 있다) */
export function sceneIssueText(i: SceneIssue, messages: Partial<Record<SceneIssueCode, string>> = {}): string {
  const t = messages[i.code] ?? SCENE_ISSUE_MESSAGES[i.code];
  return t.replace(/\{id\}/g, i.id ?? '').replace(/\{field\}/g, i.field ?? '').replace(/\{count\}/g, String(i.count));
}

// ───────────── 값 검사 ─────────────
const L = COORD_LIMIT;
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** 유한한 수 n개 이상인 배열 꼴인지(n개만 본다) */
function finiteN(a: unknown, n: number, limit = Infinity): boolean {
  if (!a || typeof (a as ArrayLike<number>).length !== 'number' || (a as ArrayLike<number>).length < n) return false;
  for (let i = 0; i < n; i++) {
    const x = (a as ArrayLike<number>)[i];
    if (!finite(x) || x > limit || x < -limit) return false;
  }
  return true;
}

/** 색(rgba 넷 또는 rgb 셋 — 셋이면 불투명)을 그릴 수 있는지: 유한한 0 이상 수 */
export function rgbaOk(c: unknown): boolean {
  const a = c as ArrayLike<number> | null | undefined;
  if (!a || typeof a.length !== 'number' || a.length < 3) return false;
  for (let i = 0; i < Math.min(4, a.length); i++) if (!finite(a[i]) || a[i]! < 0) return false;
  return a.length >= 4;
}

/** 깨진 색을 그릴 색으로: 셋이면 알파 1을 붙이고, 그 밖에 유한하지 않은 값이 있으면 fallback */
function fixRgba(c: unknown, fallback: Rgba): Rgba {
  const a = c as ArrayLike<number> | null | undefined;
  if (a && typeof a.length === 'number' && a.length === 3 && finiteN(a, 3) && a[0]! >= 0 && a[1]! >= 0 && a[2]! >= 0) return [a[0]!, a[1]!, a[2]!, 1];
  return fallback;
}

/** 원점이 유한한 수 셋(한도 안)인지(없으면 true) */
const originOk = (o: unknown): boolean => o === undefined || o === null || finiteN(o, 3, L);
/** 행렬이 유한한 수 열여섯인지(없으면 true) */
const matrixOk = (m: unknown): boolean => m === undefined || m === null || finiteN(m, 16);

/**
 * 원점·행렬로 옮긴 항목 상자의 여덟 구석이 모두 한도 안인지(원점·행렬이 없거나 상자가 비면 true). 유한한 행렬도 1e30배로 키우면 항목 전체가 한도 밖이라
 * 범위에서 빠지고(카메라는 나머지에 맞는다) 화면을 덮는 큰 도형이 된다 — 그런 항목은 놓을 자리를 모르는 것으로 본다
 */
function placedOk(p: Float32Array, origin: readonly number[] | undefined | null, matrix: ArrayLike<number> | undefined | null): boolean {
  if (!origin && !matrix) return true;
  const b = positionsBox(p);
  if (!(b.min[0] <= b.max[0] && b.min[1] <= b.max[1] && b.min[2] <= b.max[2])) return true;
  const ox = origin?.[0] ?? 0, oy = origin?.[1] ?? 0, oz = origin?.[2] ?? 0;
  for (let i = 0; i < 8; i++) {
    let x = (i & 1 ? b.max[0] : b.min[0]) + ox, y = (i & 2 ? b.max[1] : b.min[1]) + oy, z = (i & 4 ? b.max[2] : b.min[2]) + oz;
    if (matrix) {
      const m = matrix;
      const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
      const X = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, Y = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, Z = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
      const s = w !== 0 && w !== 1 ? 1 / w : 1;
      x = X * s;
      y = Y * s;
      z = Z * s;
    }
    if (!(x >= -L && x <= L && y >= -L && y <= L && z >= -L && z <= L)) return false;
  }
  return true;
}

// ───────────── 배열 검사(배열마다 한 번) ─────────────
/** 이보다 짧은 배열은 기억하지 않고 그때마다 훑는다(작은 배열이 아주 많은 장면에서 WeakMap 기억이 훑기보다 비싸다) */
const SMALL = 4096;
const maxMemo = new WeakMap<Uint32Array, number>();
/** 색인 배열의 가장 큰 값(빈 배열은 −1, 긴 배열은 캐시) */
export function indexMax(idx: Uint32Array): number {
  let m = idx.length < SMALL ? undefined : maxMemo.get(idx);
  if (m === undefined) {
    m = -1;
    for (let i = 0; i < idx.length; i++) if (idx[i]! > m) m = idx[i]!;
    if (idx.length >= SMALL) maxMemo.set(idx, m);
  }
  return m;
}

/** 범위에서 빼는 정점(NaN·무한대·한도 밖) 수 — 짧은 배열(윤곽선 등 범위를 세지 않는 배열)은 기억 없이 훑고, 긴 배열은 positionsBad(범위 훑기와 같은 기억) */
function badOf(p: Float32Array): number {
  if (p.length >= SMALL) return positionsBad(p);
  let bad = 0;
  for (let i = 0, n = p.length - (p.length % 3); i < n; i += 3) {
    const x = p[i]!, y = p[i + 1]!, z = p[i + 2]!;
    if (!(x >= -L && x <= L && y >= -L && y <= L && z >= -L && z <= L)) bad++;
  }
  return bad;
}

const finiteMemo = new WeakMap<ArrayLike<number>, number>();
/** 유한하지 않은 값의 수(캐시 — 정점 색처럼 GPU에 그대로 올리는 실수 배열) */
export function nonFiniteCount(a: Float32Array): number {
  let n = finiteMemo.get(a);
  if (n === undefined) {
    n = 0;
    for (let i = 0; i < a.length; i++) {
      const x = a[i]!;
      if (x - x !== 0) n++;
    }
    finiteMemo.set(a, n);
  }
  return n;
}

/** 0.50.0 삼각형 고침 결과: 그릴 색인(나쁜 삼각형은 한 정점을 세 번 — 넓이 0이라 그리지 않는다)과 그 삼각형 수 */
export interface TriangleFix {
  indices: Uint32Array;
  bad: number;
}
const triMemo = new WeakMap<Float32Array, { idx: Uint32Array | undefined; fix: TriangleFix | null }>();
const segMemo = new WeakMap<Float32Array, { fix: Float32Array | null; bad: number }>();
const NO_SEG_FIX: { readonly fix: null; readonly bad: 0 } = Object.freeze({ fix: null, bad: 0 });
onForgetBounds((p) => {
  triMemo.delete(p);
  segMemo.delete(p);
});

/**
 * 0.50.0 그물 삼각형 고침: 정점 수 밖 색인(0xffffffff 포함)이나 범위에서 뺀 정점(NaN·무한대·한도 밖 — positionsBad)을 쓰는 삼각형을
 * 넓이 0인 삼각형(멀쩡한 첫 정점 하나를 세 번)으로 바꾼 색인 사본. 색인이 없는 그물은 0, 1, 2…를 만든다(삼각형 번호는 그대로).
 * 고칠 것이 없으면 null(멀쩡한 그물은 색인 최댓값 한 번 훑기만 — 정점은 범위 계산과 함께 훑는다). 위치 배열·색인 배열 짝마다 캐시
 */
export function triangleFix(positions: Float32Array, indices?: Uint32Array): TriangleFix | null {
  const nv = Math.floor(positions.length / 3);
  const badV = positionsBad(positions);
  const outIdx = !!indices && indices.length >= 3 && indexMax(indices) >= nv;
  // 멀쩡한 그물은 기억 없이 바로(범위·색인 최댓값 기억만 본다)
  if (!badV && !outIdx) return null;
  const hit = triMemo.get(positions);
  if (hit && hit.idx === indices) return hit.fix;
  let fix: TriangleFix | null = null;
  {
    // 범위에서 뺀 정점 표(그 정점이 하나라도 있을 때만)
    let badMark: Uint8Array | null = null;
    let good = 0;
    if (badV > 0) {
      badMark = new Uint8Array(nv);
      let first = -1;
      for (let v = 0; v < nv; v++) {
        const x = positions[v * 3]!, y = positions[v * 3 + 1]!, z = positions[v * 3 + 2]!;
        if (!(x >= -L && x <= L && y >= -L && y <= L && z >= -L && z <= L)) badMark[v] = 1;
        else if (first < 0) first = v;
      }
      good = Math.max(0, first);
    }
    const tris = indices ? Math.floor(indices.length / 3) : Math.floor(nv / 3);
    const out = new Uint32Array(tris * 3);
    let bad = 0;
    for (let t = 0; t < tris; t++) {
      const a = indices ? indices[t * 3]! : t * 3;
      const b = indices ? indices[t * 3 + 1]! : t * 3 + 1;
      const c = indices ? indices[t * 3 + 2]! : t * 3 + 2;
      if (a >= nv || b >= nv || c >= nv || (badMark && (badMark[a] || badMark[b] || badMark[c]))) {
        bad++;
        out[t * 3] = out[t * 3 + 1] = out[t * 3 + 2] = good;
      } else {
        out[t * 3] = a;
        out[t * 3 + 1] = b;
        out[t * 3 + 2] = c;
      }
    }
    fix = bad > 0 ? { indices: out, bad } : null;
  }
  triMemo.set(positions, { idx: indices, fix });
  return fix;
}

/**
 * 0.50.0 선분 고침: 끝점이 NaN·무한대·한도 밖인 선분의 여섯 값을 모두 NaN으로 바꾼 사본(WebGL은 NaN 꼭짓점의 도형을 그리지 않는다 —
 * NaN 선분은 0.49.0에도 그리지 않았고, 한도 밖 유한한 끝점은 화면을 가로지르는 선이 됐다). 선분 번호는 그대로. 고칠 것이 없으면 null(캐시)
 */
export function segmentFix(positions: Float32Array): { fix: Float32Array | null; bad: number } {
  // 멀쩡한 배열은 기억 없이 바로
  if (!badOf(positions)) return NO_SEG_FIX;
  const hit = segMemo.get(positions);
  if (hit) return hit;
  let r: { fix: Float32Array | null; bad: number } = NO_SEG_FIX;
  {
    const n = Math.floor(positions.length / 6);
    let out: Float32Array | null = null;
    let bad = 0;
    for (let s = 0; s < n; s++) {
      let ok = true;
      for (let k = 0; k < 6; k++) {
        const x = positions[s * 6 + k]!;
        if (!(x >= -L && x <= L)) ok = false;
      }
      if (ok) continue;
      bad++;
      out ??= positions.slice();
      out.fill(NaN, s * 6, s * 6 + 6);
    }
    r = { fix: out, bad };
  }
  segMemo.set(positions, r);
  return r;
}

// ───────────── 장면 검사 ─────────────
/** 검사 결과: 그릴 장면(고칠 것이 없으면 받은 객체 그대로)과 알림 */
export interface SceneCheck {
  scene: Scene3d;
  issues: SceneIssue[];
}

const GRAY: Rgba = [0.7, 0.7, 0.7, 1];

/** 그물 하나 검사: 그릴 그물(그대로·필드를 고친 얕은 사본·null = 빼기)과 알림을 issues에 더한다 */
export function checkMesh(m: Mesh3d, issues: SceneIssue[]): Mesh3d | null {
  const id = m.id;
  const add = (code: SceneIssueCode, action: SceneIssueAction, field?: string, count = 1): void => void issues.push({ code, action, kind: 'mesh', id, ...(field ? { field } : {}), count });
  if (!m.positions || typeof m.positions.length !== 'number') {
    add('placement', 'skipped', 'positions');
    return null;
  }
  if (!originOk(m.origin)) {
    add('placement', 'skipped', 'origin');
    return null;
  }
  if (!matrixOk(m.matrix)) {
    add('placement', 'skipped', 'matrix');
    return null;
  }
  if (!placedOk(m.positions, m.origin, m.matrix)) {
    add('placement', 'skipped', m.matrix ? 'matrix' : 'origin');
    return null;
  }
  let o: Partial<Mesh3d> | null = null;
  const put = (k: keyof Mesh3d, v: unknown): void => {
    ((o ??= {}) as Record<string, unknown>)[k] = v;
  };
  const P = m.positions;
  const nv = Math.floor(P.length / 3);
  if (P.length % 3) add('length', 'ignored', 'positions', P.length % 3);
  positionsBox(P);
  const badV = positionsBad(P);
  if (badV) add('positions', 'fixed', 'positions', badV);
  if (m.indices) {
    if (m.indices.length % 3) add('length', 'ignored', 'indices', m.indices.length % 3);
    const f = indexMax(m.indices) >= nv ? triangleFix(P, m.indices) : null;
    if (f) {
      // 범위에서 뺀 정점만으로 그리지 않는 삼각형은 positions 알림이 센다 — 여기서는 색인이 정점 수 밖인 삼각형만
      let out = 0;
      const I = m.indices;
      for (let t = 0, n = Math.floor(I.length / 3); t < n; t++) if (I[t * 3]! >= nv || I[t * 3 + 1]! >= nv || I[t * 3 + 2]! >= nv) out++;
      if (out) add('indices', 'fixed', 'indices', out);
    }
  }
  if (m.edges && m.edges.length % 6) add('length', 'ignored', 'edges', m.edges.length % 6);
  if (m.edges && m.edges.length >= 6) {
    const e = segmentFix(m.edges);
    if (e.bad) add('positions', 'fixed', 'edges', e.bad);
  }
  if (m.normals && nv > 0) {
    const n = m.normals.length;
    const ok = m.normals instanceof Float32Array ? n >= nv * 3 : n === nv * 4 || n >= nv * 3;
    if (!ok) add('normals', 'ignored', 'normals');
  }
  if (m.colors) {
    if (m.colors.length < nv * 4) add('colors', 'ignored', 'colors');
    else if (nonFiniteCount(m.colors) > 0) {
      add('colors', 'ignored', 'colors', nonFiniteCount(m.colors));
      put('colors', undefined);
    }
  }
  if (m.uvs && nv > 0 && m.uvs.length < nv * 2) add('uvs', 'ignored', 'uvs');
  if (!rgbaOk(m.color)) {
    add('color', 'fixed', 'color');
    put('color', fixRgba(m.color, GRAY));
  }
  if (m.backColor !== undefined && !rgbaOk(m.backColor)) {
    const c = fixRgba(m.backColor, [NaN, NaN, NaN, NaN]);
    add('color', c[0] === c[0] ? 'fixed' : 'ignored', 'backColor');
    put('backColor', c[0] === c[0] ? c : undefined);
  }
  for (const k of ['roughness', 'metallic', 'normalScale'] as const)
    if (m[k] !== undefined && !finite(m[k])) {
      add('material', 'ignored', k);
      put(k, undefined);
    }
  for (const k of ['uvTransform', 'backUvTransform'] as const)
    if (m[k] !== undefined && !finiteN(m[k], 4)) {
      add('material', 'ignored', k);
      put(k, undefined);
    }
  if (m.billboard && !finiteN(m.billboard.origin, 3)) add('billboard', 'ignored', 'billboard');
  return o ? { ...m, ...(o as Partial<Mesh3d>) } : m;
}

function checkLine(l: LineSet3d, issues: SceneIssue[]): LineSet3d | null {
  const id = l.id;
  const add = (code: SceneIssueCode, action: SceneIssueAction, field?: string, count = 1): void => void issues.push({ code, action, kind: 'line', id, ...(field ? { field } : {}), count });
  if (!l.positions || typeof l.positions.length !== 'number') {
    add('placement', 'skipped', 'positions');
    return null;
  }
  if (!originOk(l.origin) || !placedOk(l.positions, l.origin, null)) {
    add('placement', 'skipped', 'origin');
    return null;
  }
  let o: Partial<LineSet3d> | null = null;
  const put = (k: keyof LineSet3d, v: unknown): void => {
    ((o ??= {}) as Record<string, unknown>)[k] = v;
  };
  const n = Math.floor(l.positions.length / 6);
  if (l.positions.length % 6) add('length', 'ignored', 'positions', l.positions.length % 6);
  positionsBox(l.positions);
  const s = segmentFix(l.positions);
  if (s.bad) add('positions', 'fixed', 'positions', s.bad);
  if (l.colors) {
    if (l.colors.length < n * 8) add('colors', 'ignored', 'colors');
    else if (nonFiniteCount(l.colors) > 0) {
      add('colors', 'ignored', 'colors', nonFiniteCount(l.colors));
      put('colors', undefined);
    }
  }
  if (l.color !== undefined && !rgbaOk(l.color)) {
    const c = fixRgba(l.color, [NaN, NaN, NaN, NaN]);
    add('color', 'fixed', 'color');
    put('color', c[0] === c[0] ? c : undefined);
  }
  if (l.width !== undefined && !finite(l.width)) {
    add('width', 'fixed', 'width');
    put('width', 1);
  }
  if (l.segmentIds && l.segmentIds.length < n) add('ids', 'kept', 'segmentIds', n - l.segmentIds.length);
  return o ? { ...l, ...(o as Partial<LineSet3d>) } : l;
}

function checkPoints(p: PointSet3d, issues: SceneIssue[]): PointSet3d | null {
  const id = p.id;
  const add = (code: SceneIssueCode, action: SceneIssueAction, field?: string, count = 1): void => void issues.push({ code, action, kind: 'point', id, ...(field ? { field } : {}), count });
  if (!p.positions || typeof p.positions.length !== 'number') {
    add('placement', 'skipped', 'positions');
    return null;
  }
  if (!originOk(p.origin) || !placedOk(p.positions, p.origin, null)) {
    add('placement', 'skipped', 'origin');
    return null;
  }
  let o: Partial<PointSet3d> | null = null;
  const put = (k: keyof PointSet3d, v: unknown): void => {
    ((o ??= {}) as Record<string, unknown>)[k] = v;
  };
  const n = Math.floor(p.positions.length / 3);
  if (p.positions.length % 3) add('length', 'ignored', 'positions', p.positions.length % 3);
  positionsBox(p.positions);
  const bad = positionsBad(p.positions);
  if (bad) add('positions', 'fixed', 'positions', bad);
  if (p.color !== undefined && !rgbaOk(p.color)) {
    const c = fixRgba(p.color, [NaN, NaN, NaN, NaN]);
    add('color', 'fixed', 'color');
    put('color', c[0] === c[0] ? c : undefined);
  }
  if (p.size !== undefined && !finite(p.size)) {
    add('size', 'fixed', 'size');
    put('size', 4);
  }
  if (p.pointIds && p.pointIds.length < n) add('ids', 'kept', 'pointIds', n - p.pointIds.length);
  return o ? { ...p, ...(o as Partial<PointSet3d>) } : p;
}

/** Scene3d.bounds를 쓸 수 있는지(유한·한도 안·min ≤ max) */
export function boundsOk(b: Box3 | undefined): boolean {
  return !!b && finiteN(b.min, 3, L) && finiteN(b.max, 3, L) && b.min[0] <= b.max[0] && b.min[1] <= b.max[1] && b.min[2] <= b.max[2];
}

/**
 * 장면 검사: 깨진 값마다 알림을 모으고, 그릴 장면을 돌려준다 — 고칠 것이 없으면 받은 장면 객체 그대로,
 * 있으면 빼는 항목(placement)을 뺀 목록과 필드를 고친 항목의 얕은 사본(배열은 같은 객체)을 담은 새 장면 객체. 깨진 Scene3d.bounds는 알리기만 한다
 * (뷰어는 boundsOk가 아니면 쓰지 않고 그물에서 다시 센다 — 장면 객체를 새로 만들지 않는다).
 * 좌표·색인 배열 자체는 고치지 않는다 — 범위는 깨진 정점을 건너뛰고(bounds.positionsBox), 그리기는 triangleFix·segmentFix 사본을 올린다
 */
export function checkScene(scene: Scene3d): SceneCheck {
  const issues: SceneIssue[] = [];
  let changed = false;
  const meshes: Mesh3d[] = [];
  for (const m of scene.meshes) {
    const c = checkMesh(m, issues);
    if (c !== m) changed = true;
    if (c) meshes.push(c);
  }
  const lines: LineSet3d[] = [];
  for (const l of scene.lines) {
    const c = checkLine(l, issues);
    if (c !== l) changed = true;
    if (c) lines.push(c);
  }
  let points: PointSet3d[] | undefined;
  if (scene.points) {
    points = [];
    for (const p of scene.points) {
      const c = checkPoints(p, issues);
      if (c !== p) changed = true;
      if (c) points.push(c);
    }
  }
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const it of [...meshes, ...lines, ...(points ?? [])]) {
    if (seen.has(it.id)) dup.add(it.id);
    seen.add(it.id);
  }
  for (const id of dup) issues.push({ code: 'duplicate-id', action: 'kept', kind: 'scene', id, count: 1 });
  if (boundsBroken(scene.bounds)) issues.push({ code: 'bounds', action: 'ignored', kind: 'scene', field: 'bounds', count: 1 });
  if (!changed) return { scene, issues };
  return { scene: { ...scene, meshes, lines, ...(points ? { points } : {}) }, issues };
}

/**
 * Scene3d.bounds가 깨졌는지(알릴 것인지): NaN·무한대(빈 상자 꼴 min +∞·max −∞는 빼고)·한도 밖·짧은 배열. 유한한 뒤집힌 상자는 빈 상자로 본다(0.49.0도 장면에서 다시 셌다)
 */
export function boundsBroken(b: Box3 | undefined | null): boolean {
  if (b === undefined || b === null || boundsOk(b)) return false;
  const lo = b.min as ArrayLike<number> | undefined, hi = b.max as ArrayLike<number> | undefined;
  if (!lo || !hi || lo.length < 3 || hi.length < 3) return true;
  const v = [lo[0]!, lo[1]!, lo[2]!, hi[0]!, hi[1]!, hi[2]!];
  if (v.slice(0, 3).every((x) => x === Infinity) && v.slice(3).every((x) => x === -Infinity)) return false;
  return !v.every((x) => x >= -L && x <= L);
}
