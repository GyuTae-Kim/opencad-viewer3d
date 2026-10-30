/**
 * 합성 장면(개발 확인 페이지·시험용): 상자·구 그물, 나선 공구 경로 선분, 점. 선택으로 무늬 상자·원근 무늬 판.
 */
import { packNormals, packUvs } from './attribs';
import type { LineSet3d, Mesh3d, PointSet3d, Rgba, Scene3d, Texture3d } from './types';

/** 축 나란 상자(정점 8개, 삼각형 12개, 모서리 12개) */
export function boxMesh(id: string, min: readonly number[], max: readonly number[], color: Rgba, group?: string): Mesh3d {
  const [x0, y0, z0] = min as [number, number, number];
  const [x1, y1, z1] = max as [number, number, number];
  const positions = new Float32Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]);
  // 바깥에서 볼 때 반시계
  const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
  const e = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
  const edges = new Float32Array(e.length * 3);
  e.forEach((v, i) => edges.set(positions.subarray(v * 3, v * 3 + 3), i * 3));
  return { id, name: id, positions, indices, color, edges, group, closed: true };
}

/**
 * 바둑판 무늬 BMP(24비트, 의존성 없이 — 개발 확인·시험용). cells × cells 칸, 칸마다 px 화소.
 * 그림 맨 위 왼쪽 칸은 빨강이라 무늬 방향(v 위로)을 눈으로 확인할 수 있다.
 */
export function checkerBmp(cells = 8, px = 8, a: readonly number[] = [236, 236, 230], b: readonly number[] = [58, 92, 150]): Uint8Array {
  const w = cells * px;
  const stride = (w * 3 + 3) & ~3;
  const size = 54 + stride * w;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d;
  dv.setUint32(2, size, true);
  dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, w, true);
  dv.setInt32(22, w, true); // 양수 = 아래 줄부터
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  dv.setUint32(34, stride * w, true);
  for (let row = 0; row < w; row++) {
    const y = w - 1 - row; // 그림 위에서 잰 줄
    for (let x = 0; x < w; x++) {
      const cx = Math.floor(x / px), cy = Math.floor(y / px);
      const c = cx === 0 && cy === 0 ? [220, 40, 40] : (cx + cy) % 2 ? b : a;
      const o = 54 + row * stride + x * 3;
      out[o] = c[2]!;
      out[o + 1] = c[1]!;
      out[o + 2] = c[0]!;
    }
  }
  return out;
}

/** 무늬 상자: 면마다 정점 4개(정점 24개)와 무늬 좌표(tile 길이마다 한 번 되풀이). 옆면은 v가 위(+Z), 윗면·밑면은 u = x, v = y */
export function texturedBoxMesh(id: string, min: readonly number[], max: readonly number[], color: Rgba, texture: string, tile: number, group?: string): Mesh3d {
  const [x0, y0, z0] = min as [number, number, number];
  const [x1, y1, z1] = max as [number, number, number];
  // 면마다 바깥에서 볼 때 반시계 네 점(왼쪽 아래부터)과 (u 축, v 축)
  const faces: [number[][], number, number][] = [
    [[[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 0, 2], // 앞(−Y)
    [[[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], 1, 2], // 오른쪽(+X)
    [[[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]], 0, 2], // 뒤(+Y, u는 −X 쪽으로)
    [[[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]], 1, 2], // 왼쪽(−X, u는 −Y 쪽으로)
    [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 0, 1], // 위
    [[[x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]], 0, 1], // 아래
  ];
  const positions = new Float32Array(24 * 3);
  const uvs = new Float32Array(24 * 2);
  const indices = new Uint32Array(36);
  faces.forEach(([pts, ua, va], f) => {
    const p0 = pts[0]!;
    const du = Math.sign(pts[1]![ua]! - p0[ua]!) || 1;
    pts.forEach((p, k) => {
      positions.set(p, (f * 4 + k) * 3);
      uvs[(f * 4 + k) * 2] = ((p[ua]! - p0[ua]!) * du) / tile;
      uvs[(f * 4 + k) * 2 + 1] = (p[va]! - (va === 2 ? z0 : p0[va]!)) / tile;
    });
    indices.set([f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3], f * 6);
  });
  const e = boxMesh(id, min, max, color).edges;
  return { id, name: id, positions, indices, uvs, texture, color, edges: e, group, closed: true };
}

/**
 * 원근 무늬 판: 사다리꼴 네 점에 (u·q, v·q, q) 3값 무늬 좌표를 준다(먼 변의 q = 0.5) — 셰이더가 조각마다 q로 나누는지 확인용.
 * q를 무시하면 바둑판이 대각선으로 꺾여 보인다.
 */
export function projectiveQuadMesh(id: string, at: readonly number[], w: number, d: number, texture: string, group?: string): Mesh3d {
  const [x, y, z] = at as [number, number, number];
  const positions = new Float32Array([x, y, z, x + w, y, z, x + w * 0.75, y + d, z, x + w * 0.25, y + d, z]);
  const q = [1, 1, 0.5, 0.5];
  const uv = [0, 0, 4, 0, 4, 4, 0, 4];
  const uvs = new Float32Array(12);
  for (let k = 0; k < 4; k++) uvs.set([uv[k * 2]! * q[k]!, uv[k * 2 + 1]! * q[k]!, q[k]!], k * 3);
  return { id, name: id, positions, indices: new Uint32Array([0, 1, 2, 0, 2, 3]), uvs, texture, color: [0.6, 0.62, 0.66, 1], group };
}

/** 위경도 구(정점 법선, 선택: 정점 색) */
export function sphereMesh(id: string, center: readonly number[], r: number, seg: number, rings: number, color: Rgba, opts: { vertexColors?: boolean; group?: string } = {}): Mesh3d {
  const nv = (seg + 1) * (rings + 1);
  const positions = new Float32Array(nv * 3);
  const normals = new Float32Array(nv * 3);
  const colors = opts.vertexColors ? new Float32Array(nv * 4) : undefined;
  let k = 0;
  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    const ph = v * Math.PI;
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      const nx = Math.sin(ph) * Math.cos(th), ny = Math.sin(ph) * Math.sin(th), nz = Math.cos(ph);
      positions[k * 3] = center[0]! + r * nx;
      positions[k * 3 + 1] = center[1]! + r * ny;
      positions[k * 3 + 2] = center[2]! + r * nz;
      normals[k * 3] = nx;
      normals[k * 3 + 1] = ny;
      normals[k * 3 + 2] = nz;
      if (colors) {
        colors[k * 4] = 0.35 + 0.6 * v;
        colors[k * 4 + 1] = 0.45 + 0.4 * Math.abs(Math.cos(th));
        colors[k * 4 + 2] = 0.95 - 0.6 * v;
        colors[k * 4 + 3] = 1;
      }
      k++;
    }
  }
  const indices = new Uint32Array(seg * rings * 6);
  let q = 0;
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      indices[q++] = a;
      indices[q++] = c;
      indices[q++] = b;
      indices[q++] = b;
      indices[q++] = c;
      indices[q++] = d;
    }
  return { id, name: id, positions, normals, colors, indices, color, group: opts.group, closed: true };
}

/**
 * 나선 공구 경로(선분 n개): 반지름이 천천히 바뀌며 내려가는 나선. 정점 색은 높이에 따라 파랑 → 빨강.
 * segmentIds는 10선분마다 한 "줄"로 묶는다(NC 줄 번호 흉내).
 */
export function helixPath(id: string, center: readonly number[], r: number, depth: number, n: number, opts: { group?: string; width?: number; stepDeg?: number } = {}): LineSet3d {
  const positions = new Float32Array(n * 6);
  const colors = new Float32Array(n * 8);
  const segmentIds = new Uint32Array(n);
  const step = ((opts.stepDeg ?? 2) * Math.PI) / 180;
  const turns = (n * step) / (Math.PI * 2);
  const pt = (k: number, o: Float32Array, at: number): number => {
    const th = k * step;
    const f = k / n;
    const rr = r * (0.55 + 0.45 * Math.abs(Math.sin(f * Math.PI * 3)));
    o[at] = center[0]! + rr * Math.cos(th);
    o[at + 1] = center[1]! + rr * Math.sin(th);
    o[at + 2] = center[2]! - (depth * th) / (turns * Math.PI * 2);
    return f;
  };
  for (let i = 0; i < n; i++) {
    const f0 = pt(i, positions, i * 6);
    const f1 = pt(i + 1, positions, i * 6 + 3);
    for (const [f, o] of [
      [f0, i * 8],
      [f1, i * 8 + 4],
    ] as const) {
      colors[o] = 0.2 + 0.8 * f;
      colors[o + 1] = 0.55 + 0.35 * Math.sin(f * Math.PI);
      colors[o + 2] = 1 - 0.8 * f;
      colors[o + 3] = 1;
    }
    segmentIds[i] = Math.floor(i / 10) + 1;
  }
  return { id, name: id, positions, colors, segmentIds, width: opts.width ?? 1, group: opts.group };
}

/** 격자 점 */
export function gridPointSet(id: string, x0: number, y0: number, z: number, nx: number, ny: number, step: number, color: Rgba, group?: string): PointSet3d {
  const positions = new Float32Array(nx * ny * 3);
  let k = 0;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      positions[k++] = x0 + i * step;
      positions[k++] = y0 + j * step;
      positions[k++] = z;
    }
  return { id, name: id, positions, color, size: 7, group };
}

/**
 * 개발 확인용 장면. segments = 나선 선분 수, sphereSeg = 구 경도 칸 수(삼각형 ≈ 2·seg·seg/2).
 * offset을 주면 장면 전체를 그만큼 옮긴다(큰 좌표 확인): 기본은 묶음 원점(origin)에 두고 positions는 그대로,
 * bake면 원점 없이 positions에 더해 넣는다(float32로 반올림되는 예전 방식 — 비교용).
 * compact(0.26.0)면 그물 법선을 Int8(정점 4값)로, 무늬 좌표를 Int16 + uvTransform으로 줄인다(작은 배열 확인 — packNormals·packUvs)
 */
export function syntheticScene(
  opts: { segments?: number; sphereSeg?: number; offset?: readonly number[]; bake?: boolean; textures?: boolean; compact?: boolean } = {},
): Scene3d {
  const scene = baseScene(opts);
  if (opts.textures) {
    const tex: Texture3d = { id: '바둑판', data: checkerBmp(), mime: 'image/bmp', width: 64, height: 64 };
    scene.textures = [tex];
    scene.meshes.push(texturedBoxMesh('무늬 상자', [-80, 0, 0], [-20, 60, 50], [0.6, 0.6, 0.65, 1], tex.id, 20, '무늬'));
    scene.meshes.push(projectiveQuadMesh('원근 무늬', [-90, -110, 0], 100, 80, tex.id, '무늬'));
  }
  if (opts.compact) scene.meshes = scene.meshes.map(compactMesh);
  const o = opts.offset;
  if (!o || (!o[0] && !o[1] && !o[2])) return scene;
  const origin: [number, number, number] = [o[0]!, o[1]!, o[2]!];
  const shift = <T extends { positions: Float32Array; origin?: [number, number, number] }>(it: T, extra: Float32Array[] = []): T => {
    if (!opts.bake) return { ...it, origin };
    const move = (a: Float32Array): Float32Array => {
      const b = new Float32Array(a.length);
      for (let i = 0; i < a.length; i += 3) {
        b[i] = a[i]! + origin[0];
        b[i + 1] = a[i + 1]! + origin[1];
        b[i + 2] = a[i + 2]! + origin[2];
      }
      return b;
    };
    const r = { ...it, positions: move(it.positions) } as T & { edges?: Float32Array };
    if (extra.length) r.edges = move(extra[0]!);
    return r;
  };
  // 같은 배열을 여러 번 놓은 그물(행렬)은 원점 방식에서는 배열을 그대로 함께 쓴다
  const meshes = scene.meshes.map((m) => {
    if (!opts.bake) return { ...m, origin };
    // 행렬이 있는 그물을 굽기: 원점은 행렬 앞에 오므로 positions에 더한다(행렬은 이동뿐이라 같은 뜻)
    return shift(m, m.edges ? [m.edges] : []);
  });
  return { ...scene, meshes, lines: scene.lines.map((l) => shift(l)), points: scene.points?.map((p) => shift(p)) };
}

/** 그물의 법선·무늬 좌표를 작은 배열로(0.26.0): 법선 Int8 정점 4값, 앞·뒷면 무늬 좌표 Int16 + 축척·이동. 다른 필드·배열은 그대로 함께 쓴다 */
export function compactMesh(m: Mesh3d): Mesh3d {
  const nv = Math.floor(m.positions.length / 3);
  const out: Mesh3d = { ...m };
  if (m.normals) out.normals = packNormals(m.normals, 'int8', 4);
  if (m.uvs && !m.uvTransform) {
    const p = packUvs(m.uvs, nv, 'int16');
    out.uvs = p.uvs;
    out.uvTransform = p.transform;
  }
  if (m.backUvs && !m.backUvTransform) {
    const p = packUvs(m.backUvs, nv, 'int16');
    out.backUvs = p.uvs;
    out.backUvTransform = p.transform;
  }
  return out;
}

function baseScene(opts: { segments?: number; sphereSeg?: number }): Scene3d {
  const segs = opts.segments ?? 300_000;
  const sseg = opts.sphereSeg ?? 128;
  const meshes: Mesh3d[] = [];
  meshes.push(boxMesh('상자', [0, 0, 0], [120, 80, 40], [0.62, 0.68, 0.76, 1], '상자'));
  meshes.push(sphereMesh('구', [190, 40, 35], 35, sseg, Math.max(4, sseg >> 1), [0.8, 0.5, 0.3, 1], { vertexColors: true, group: '구' }));
  // 같은 그물을 행렬로 세 번 놓기(같은 배열은 GPU에 한 번만 올라간다)
  const small = boxMesh('작은 상자', [-6, -6, 0], [6, 6, 12], [0.3, 0.7, 0.55, 1], '작은 상자');
  for (let i = 0; i < 3; i++) {
    const m = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 150 + i * 30, -30, 0, 1]);
    meshes.push({ ...small, id: `작은 상자 ${i + 1}`, name: `작은 상자 ${i + 1}`, matrix: m });
  }
  // 두께 있는 판(반투명)
  const plate = boxMesh('판', [-20, -50, -6], [250, 120, -2], [0.45, 0.65, 0.95, 0.35], '판');
  meshes.push(plate);
  const helix = helixPath('공구 경로', [60, 40, 70], 45, 60, segs, { group: '공구 경로' });
  const rapid: LineSet3d = {
    id: '급속 이송',
    positions: new Float32Array([60, 40, 110, 105, 40, 110, 105, 40, 110, 105, 40, 70, 0, 0, 110, 60, 40, 110]),
    color: [1, 0.35, 0.35, 1],
    dashed: true,
    width: 1.5,
    group: '공구 경로',
  };
  const points = [gridPointSet('구멍', 10, 10, 40, 6, 4, 20, [1, 0.85, 0.2, 1], '구멍')];
  return { name: '합성 장면', units: 'mm', meshes, lines: [helix, rapid], points, warnings: [] };
}
