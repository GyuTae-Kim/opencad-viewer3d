/**
 * 그물 바꾸기 비용 재기 페이지(scripts/bench/edit.mjs가 묶어 헤드리스 Chrome에서 연다).
 * 장면: 선분 30만 개 묶음 하나(NC 공구 경로 크기 — 위치 7.2 MB·정점 색 9.6 MB)와 높이 격자 그물 1024²(삼각형 약 209만 개 —
 * 위치 12.6 MB·법선 12.6 MB·정점 색 16.8 MB·색인 25.1 MB). 같은 뷰어에서 세 가지 길을 번갈아 잰다:
 *  - scene: 격자만 새 배열로 바꾼 새 장면을 setScene(keepView)(0.10.0까지 앱이 하던 길 — 모든 버퍼·BVH를 다시)
 *  - mesh: setMesh(새 배열 격자)(같은 크기라 앞 버퍼에 bufferSubData, 색인은 같은 배열)
 *  - range: 격자 배열 마디 줄 rows개를 제자리에서 고치고 setMesh(같은 그물, { vertices })
 * 잰 값(ms): call = API 호출, frame = 바로 다음 그리기 + GPU 마침(1화소 읽기), pick = 그다음 첫 고르기(바뀐 묶음의 BVH를 그 자리에서 만든다)
 */
import { Viewer3d } from '../../src/viewer';
import type { LineSet3d, Mesh3d, Scene3d } from '../../src/types';
import { type GridSpec, cutBy, fillGrid, gridMesh } from '../pixels/grid';

const W = 960, H = 600;
const host = document.getElementById('view')!;
host.style.width = `${W}px`;
host.style.height = `${H}px`;

function toolPath(n: number): LineSet3d {
  const positions = new Float32Array(n * 6);
  const colors = new Float32Array(n * 8);
  const segmentIds = new Uint32Array(n);
  // 소재 위를 지그재그로 훑는 경로(줄마다 왕복)
  const rows = 300;
  const per = Math.ceil(n / rows);
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / per), k = i % per;
    const nx = r % 2 ? 100 - ((k + 1) / per) * 100 : ((k + 1) / per) * 100;
    const ny = (r / rows) * 100;
    if (i === 0) [x, y] = [0, 0];
    positions.set([x, y, 2 + Math.sin(i * 0.01), nx, ny, 2 + Math.sin((i + 1) * 0.01)], i * 6);
    colors.set([0.2, 0.6, 1, 1, 0.2, 0.6, 1, 1], i * 8);
    segmentIds[i] = i + 1;
    x = nx;
    y = ny;
  }
  return { id: 'path', positions, colors, segmentIds };
}

const G: GridSpec = { n: 1024, size: 100, x0: 0, y0: 0, origin: [50, 50, 0] };
const flat = (): number => 0;

function syncGpu(v: Viewer3d): void {
  const gl = (v.canvas.getContext('webgl2') as WebGL2RenderingContext);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
}

interface Row {
  method: string;
  rows?: number;
  call: number[];
  frame: number[];
  pick: number[];
  uploadMB: number;
}

async function run(reps: number): Promise<{ renderer: string; rows: Row[]; tris: number; segs: number }> {
  const path = toolPath(300_000);
  const base = gridMesh('grid', G, flat);
  const idx = base.indices!;
  const cuts = [0, 1, 2, 3].map((k) => cutBy(flat, [[10 + k * 20, 5], [15 + k * 20, 95]], 4, -3 - k * 0.3, 2));
  const versions: Mesh3d[] = [0, 1].map((k) => gridMesh('grid', G, cuts[k]!, { indices: idx, top: 0, depth: 4 }));
  const scene: Scene3d = { name: 'bench', units: 'mm', meshes: [base], lines: [path] };
  const v = new Viewer3d(host, { animate: false, keyboard: false, viewCube: false, renderMode: 'shaded' });
  v.setScene(scene);
  v.renderNow();
  syncGpu(v);
  v.pick(W / 2, H / 2);
  const gl = v.canvas.getContext('webgl2') as WebGL2RenderingContext;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  const time = (f: () => void): number => {
    const t0 = performance.now();
    f();
    return performance.now() - t0;
  };
  const rows: Row[] = [];
  const measure = (method: string, step: (i: number) => void, mb: number, extra: Partial<Row> = {}): void => {
    const r: Row = { method, call: [], frame: [], pick: [], uploadMB: mb, ...extra };
    for (let i = 0; i < reps + 1; i++) {
      const c = time(() => step(i));
      const f = time(() => {
        v.renderNow();
        syncGpu(v);
      });
      const p = time(() => v.pick(W / 2 + (i % 3) * 7, H / 2));
      // 첫 번은 데우기(셰이더·JIT)로 빼고 잰다
      if (i > 0) {
        r.call.push(c);
        r.frame.push(f);
        r.pick.push(p);
      }
    }
    rows.push(r);
  };
  const MB = (n: number): number => +(n / 1048576).toFixed(1);
  const gridBytes = base.positions.byteLength + base.normals!.byteLength + base.colors!.byteLength;
  // 1) 장면 전체 다시 올리기
  measure('scene', (i) => v.setScene({ ...scene, meshes: [versions[i % 2]!] }, { keepView: true }), MB(gridBytes + idx.byteLength + path.positions.byteLength + path.colors!.byteLength));
  // 2) setMesh로 그물 하나(같은 크기 새 배열)
  v.setScene({ ...scene, meshes: [versions[0]!] }, { keepView: true });
  v.renderNow();
  measure('mesh', (i) => v.setMesh(versions[(i + 1) % 2]!), MB(gridBytes));
  // 3) 범위: 마디 줄 rows개를 제자리에서 고쳐 그 정점 구간만
  for (const n of [16, 128]) {
    const live = gridMesh('grid', G, flat, { indices: idx, top: 0, depth: 4 });
    v.setMesh(live);
    v.renderNow();
    const bytesPerVertex = 12 + 12 + 16;
    measure(
      'range',
      (i) => {
        const j0 = (i * 97) % (G.n - n);
        const rr = fillGrid(live, G, cuts[2 + (i % 2)]!, j0, j0 + n - 1, 0, 4);
        v.setMesh(live, { vertices: rr });
      },
      MB((n + 2) * G.n * bytesPerVertex),
      { rows: n },
    );
  }
  v.dispose();
  return { renderer, rows, tris: idx.length / 3, segs: path.positions.length / 6 };
}

(window as unknown as { bench: unknown }).bench = { ready: true, run };
