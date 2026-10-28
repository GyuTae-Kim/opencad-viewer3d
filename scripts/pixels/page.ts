/**
 * 화소·값 회귀 비교 페이지(scripts/pixels/run.mjs가 base·head 두 판으로 묶어 헤드리스 Chrome에서 연다).
 * 이 파일은 늘 작업 트리 것을 쓰고, `src/`만 비교할 판의 것으로 바뀐다. 그래서 오래된 판에도 있는 것만 가져온다
 * (Viewer3d·syntheticScene). 새 API는 장면의 needs로 확인하고, 없으면 그 장면을 "새 장면"(base에 없음)으로 건너뛴다.
 *
 * 뷰어(WebGL 문맥) 하나에 자료(base·off·tex)를 바꿔 올리고, 장면마다 상태를 처음으로 되돌린 뒤(reset)
 * 화면 밖 그림(renderImage)의 RGBA를 그대로 넘긴다. 장면·자료마다 뷰어를 새로 만들면 문맥마다 셰이더를 다시 번역해
 * SwiftShader에서 몇 배 느려진다. 찍는 차례는 두 판이 같으므로 되돌리기에서 빠진 상태가 있어도 비교는 공정하다.
 * 주소 인자: ?w=폭&h=높이(CSS 화소, 장치 화소 비율 1).
 */
import { boxMesh, syntheticScene } from '../../src/synth';
import type { LineSet3d, Mesh3d, Scene3d } from '../../src/types';
import { Viewer3d } from '../../src/viewer';
import { type GridSpec, cutBy, fillGrid, gridMesh, gridX, gridY } from './grid';

/** 판마다 있을 수도 없을 수도 있는 메서드를 부르려고 느슨하게 본 뷰어 */
type V = Viewer3d & Record<string, any>;
/**
 * cross = base에 상자 윗면 위로 엇갈린 선분 둘을 더한 자료(0.9.0 교차점 붙잡기),
 * big = 나선 선분 40만 개(위치 9.6 MB·색 12.8 MB — 조각 일곱) 장면을 나눠 올리기로 올린 자료(0.9.0 큰 배열 조각 올리기 — 다 올린 그림이 같아야 한다),
 * edit·edit-big = base에 상자 윗면 위 높이 격자 그물(96² 마디, 큰 쪽은 520²)을 더한 자료(0.11.0 그물 바꾸기 — 장면마다 새로 만든다. 격자 배열을 제자리에서 고치므로),
 * arc = base에 거친 원 둘(상자 위에 뜬 12토막 원 꺾은선 선분 묶음, 상자 앞 바닥의 12토막 원판 그물 둘레 윤곽선)을 더한 자료(0.14.0 붙잡기 다듬기 — 앱이 정확한 원 위로 옮긴다),
 * arc2 = base에 상자 위에 뜬 12토막 원 꺾은선, 그와 한 점에서 3D로 만나는 세로 원 꺾은선, 원을 가로지르는 곧은 선분, 원 밖 멀리 있는 첫 점 선분을 더한 자료
 * (0.15.0 열린 수직 발·교차점 다듬기)
 */
type Data = 'base' | 'off' | 'tex' | 'cross' | 'big' | 'edit' | 'edit-big' | 'arc' | 'arc2';

interface Ctx {
  v: V;
  host: HTMLElement;
  w: number;
  h: number;
  /** 장면 좌표 → 세계 좌표(off 장면은 묶음 원점만큼 옮긴다) */
  world(p: readonly number[]): number[];
  /** shift = Shift를 누른 채(0.10.0 추론 잠금 — 그 전 판은 무시한다) */
  click(x: number, y: number, pointerType?: string, shift?: boolean): void;
  hover(x: number, y: number, pointerType?: string, shift?: boolean): void;
  /** 세계 점의 화면 위치(project가 없는 판이면 null) */
  at(p: readonly number[]): { x: number; y: number } | null;
}

interface Shot {
  name: string;
  data: Data;
  /** 이 장면에 필요한 판 기능(없으면 건너뛸 까닭을 돌려준다) */
  needs?: Need;
  setup(c: Ctx): void | Promise<void>;
  /** 'cube' = 뷰 큐브 캔버스만, 'overlay' = 화면 덧그림 캔버스만(0.13.0 — 측정 글상자를 비켜 그리는 것은 화면 덧그림뿐이다) */
  capture?: 'image' | 'cube' | 'overlay';
}

interface ValueSet {
  name: string;
  data: Data;
  needs?: Need;
  run(c: Ctx): unknown[] | Promise<unknown[]>;
}

/** 판 기능 확인(없으면 건너뛸 까닭). c로 그 자료에서 짧게 눌러 볼 수도 있다(되돌리기는 확인이 스스로) */
type Need = (v: V, c: Ctx) => string | null;

const q = new URLSearchParams(location.search);
const W = Math.max(64, Number(q.get('w')) || 960);
const H = Math.max(64, Number(q.get('h')) || 600);
const host = document.getElementById('view')!;
host.style.width = `${W}px`;
host.style.height = `${H}px`;

const OFFSET: [number, number, number] = [1e6, -5e5, 1e4];
const scenes = new Map<Data, ReturnType<typeof syntheticScene>>();
function sceneOf(d: Data): ReturnType<typeof syntheticScene> {
  if (d === 'edit' || d === 'edit-big') return editScene(d === 'edit-big' ? EDIT_BIG : EDIT_GRID, flatTop);
  let s = scenes.get(d);
  if (!s) {
    const base = { segments: d === 'big' ? 400_000 : 20_000, sphereSeg: 48 };
    s = syntheticScene(d === 'off' ? { ...base, offset: OFFSET } : d === 'tex' ? { ...base, textures: true } : base);
    if (d === 'cross')
      s = {
        ...s,
        lines: [
          ...s.lines,
          { id: '엇갈림', positions: new Float32Array([10, 10, 40.5, 110, 70, 40.5, 10, 70, 40.5, 110, 10, 40.5]), color: [0.95, 0.95, 0.4, 1], hiddenEdges: true },
        ],
      };
    if (d === 'arc') s = { ...s, lines: [...s.lines, arcRing()], meshes: [...s.meshes, arcDisk()] };
    if (d === 'arc2') s = { ...s, lines: [...s.lines, ...arc2Lines()] };
    scenes.set(d, s);
  }
  return s;
}

// ───────────── 판 기능 확인 ─────────────
const fn =
  (...names: string[]): Need =>
  (v) => {
    const miss = names.filter((n) => typeof v[n] !== 'function');
    return miss.length ? `이 판에 없는 API: ${miss.join(', ')}` : null;
  };
/** 0.8.0 보여 주기 선택(음영 뒤 모서리·대비 선 색)이 있는 판인지 — renderOptions에 그 열쇠가 있다 */
const v080: Need = (v) => {
  const r = typeof v.setRenderOptions === 'function' ? v.renderOptions : null;
  return r && 'edgeColor' in r && 'hiddenEdgesShaded' in r ? null : '이 판에 없는 선택: 0.8.0 보여 주기(edgeColor·hiddenEdges.shaded)';
};
/** 0.9.0 추론 붙잡기가 있는 판인지 — 추론만 켠 붙잡기 선택이 남는다(0.8.0은 아무것도 켜지 않은 선택이라 끈다) */
const v090infer: Need = (v) => {
  if (typeof v.setMeasureSnap !== 'function') return '이 판에 없는 API: setMeasureSnap';
  v.setMeasureSnap({ inference: { axes: true } });
  const ok = !!v.measureSnap?.inference && typeof v.measureSnap.inference === 'object';
  v.setMeasureSnap(null);
  return ok ? null : '이 판에 없는 선택: 0.9.0 추론 붙잡기(setMeasureSnap({ inference }))';
};
/** 0.9.1 측정 결과의 축(MeasureResult.axisB)이 있는 판인지 — 상자 구석에서 Z축 방향으로 두 점을 찍어 본다(infer-axis와 같은 자리) */
const v091axis: Need = (v, c) => {
  const why = all(v090infer, fn('setGroupVisible'))(v, c);
  if (why) return why;
  // 공구 경로(나선)는 숨긴다 — 선분 고르기가 먼저라 상자 위를 덮어 끝점에 붙잡힌다(inferShots와 같다)
  v.setGroupVisible('공구 경로', false);
  let got: any = null;
  const off = v.onMeasure((m: any) => {
    if (m) got = m;
  });
  v.setMeasureMode(true);
  v.setMeasureSnap({ inference: { axes: true } });
  const a = c.at(c.world([120, 0, 40]));
  const p = c.at(c.world([120, 0, 95]));
  if (a && p) {
    c.click(a.x - 1, a.y + 1);
    c.click(p.x + 5, p.y - 2);
  }
  off();
  v.setMeasureMode(false);
  v.setMeasureSnap(null);
  v.setGroupVisible('공구 경로', true);
  // 0.9.0부터 축 붙잡기는 되므로 여기서 축이 아니면 장면·자리가 바뀐 것이다(조용히 건너뛰지 않게 오류로)
  if (got?.snapB !== 'axis') throw new Error('축 확인 측정이 축 붙잡기가 아닙니다(장면을 바꿨으면 v091axis의 자리를 고칩니다)');
  return got.axisB ? null : '이 판에 없는 값: 0.9.1 MeasureResult.axisB(축 붙잡기의 축)';
};
const all =
  (...ns: Need[]): Need =>
  (v, c) => {
    for (const n of ns) {
      const r = n(v, c);
      if (r) return r;
    }
    return null;
  };

const r10 = (x: number): number => +x.toPrecision(10);
const r10s = (p: ArrayLike<number> | null | undefined): number[] | null => (p ? Array.from(p, r10) : null);

// ───────────── 장면 목록 ─────────────
/** 5차(0.7.2→0.8.0 확인)의 장면 21가지 — base·off 두 자료에 */
function classicShots(d: 'base' | 'off'): Shot[] {
  const s = (name: string, setup: Shot['setup'], needs?: Need): Shot => ({ name: `${d}-${name}`, data: d, setup, needs });
  const modes = ['shaded', 'shadedEdges', 'wireframe', 'xray', 'hiddenLine', 'monochrome', 'noTexture'];
  const opts = fn('setRenderOptions');
  return [
    ...modes.map((m) => s(m, ({ v }) => v.setRenderMode(m as never))),
    s('light-shaded', ({ v }) => v.setTheme('light')),
    s('light-wire', ({ v }) => {
      v.setTheme('light');
      v.setRenderMode('wireframe');
    }),
    s('hidden-dash', ({ v }) => {
      v.setRenderMode('hiddenLine' as never);
      v.setRenderOptions({ hiddenEdges: true });
    }, opts),
    s('shaded-hiddenEdgesOpt', ({ v }) => v.setRenderOptions({ hiddenEdges: true }), opts),
    s('shadedEdges-hiddenEdgesOpt', ({ v }) => {
      v.setRenderMode('shadedEdges');
      v.setRenderOptions({ hiddenEdges: true });
    }, opts),
    s('prof-shaded', ({ v }) => v.setRenderOptions({ profiles: true }), opts),
    s('prof-wire1', ({ v }) => {
      v.setRenderMode('wireframe');
      v.setRenderOptions({ profiles: { width: 1 } });
    }, opts),
    s('prof-color', ({ v }) => v.setRenderOptions({ profiles: { width: 3, color: '#ff8800' } }), opts),
    s('section', ({ v }) => v.setSectionAxis('z', 0.5)),
    s('front-ortho', ({ v }) => {
      v.setProjection('orthographic');
      v.setView('front', false);
      v.fit(false);
    }),
    s('hide-hi', (c) => rangesDemo(c), fn('setHiddenRanges', 'highlightRanges')),
    s('measure-draw', (c) => {
      c.v.setMeasureMode(true);
      c.click(c.w * 0.333, c.h * 0.445);
      c.click(c.w * 0.583, c.h * 0.623);
      c.hover(c.w * 0.467, c.h * 0.564);
    }),
    s('measure-hover', (c) => {
      c.v.setMeasureMode(true);
      c.click(c.w * 0.333, c.h * 0.445);
      c.hover(c.w * 0.533, c.h * 0.519);
    }),
    s('measure-hover2', (c) => {
      c.v.setMeasureMode(true);
      c.v.setPickEdges(true);
      c.hover(c.w * 0.5, c.h * 0.445);
    }, fn('setPickEdges')),
  ];
}

/** 0.8.0 새 선택(붙잡기 표식·음영 뒤 모서리·대비 선 색) */
function newShots(d: 'base' | 'off'): Shot[] {
  const s = (name: string, setup: Shot['setup'], needs: Need = v080): Shot => ({ name: `${d}-${name}`, data: d, setup, needs });
  return [
    s('backedges-shaded', ({ v }) => v.setRenderOptions({ hiddenEdges: { opacity: 0.45, shaded: true } })),
    s('backedges-shadedEdges', ({ v }) => {
      v.setRenderMode('shadedEdges');
      v.setRenderOptions({ hiddenEdges: { shaded: true, color: '#3cc8ff' } });
    }),
    s('prof-contrast', ({ v }) => {
      v.setBackground({ color: '#f4f4f4' });
      v.setRenderOptions({ profiles: { width: 2, color: 'contrast' } });
    }),
    s('wire-edgecolor-contrast', ({ v }) => {
      v.setTheme('light');
      v.setRenderMode('wireframe');
      v.setRenderOptions({ edgeColor: 'contrast' });
    }),
    // 상자 앞 윗모서리 가운데 점(세모 표식)
    s('snap-mid', (c) => {
      c.v.setMeasureMode(true);
      c.v.setMeasureSnap({ midpoints: true, edges: true });
      const p = c.at(c.world([60, 0, 40]));
      if (p) c.hover(p.x + 3, p.y + 2);
    }, all(v080, fn('setMeasureSnap', 'project'))),
    // 앱 점(상자 윗면 가운데 = 중심 ⊕ 표식)을 붙잡고 끝점 하나와 잰 그림
    s('snap-center', (c) => {
      c.v.setMeasureMode(true);
      c.v.setMeasureSnap({ points: [{ point: c.world([60, 40, 40]), kind: 'center', id: '상자' }] });
      const a = c.at(c.world([120, 0, 40]));
      const p = c.at(c.world([60, 40, 40]));
      if (a) c.click(a.x + 2, a.y - 2);
      if (p) c.hover(p.x + 4, p.y - 3);
    }, all(v080, fn('setMeasureSnap', 'project'))),
  ];
}

/** 0.9.0 추론 붙잡기 표식(교차점 ×·수직 발 ⊥·축 안내선). 공구 경로(나선)는 숨긴다 — 선분 고르기가 먼저라 상자 위를 덮는다 */
function inferShots(d: 'base' | 'off'): Shot[] {
  const s = (name: string, setup: Shot['setup'], data: Data = d): Shot => ({
    name: `${d}-${name}`,
    data,
    needs: all(v090infer, fn('project', 'setGroupVisible')),
    setup: (c) => {
      c.v.setGroupVisible('공구 경로', false);
      return setup(c);
    },
  });
  const out: Shot[] = [
    // 구멍 점(50, 70, 40)에서 상자 앞 윗모서리로 내린 수직 발(50, 0, 40)
    s('infer-perp', (c) => {
      c.v.setMeasureMode(true);
      c.v.setMeasureSnap({ edges: true, inference: { perpendicular: true } });
      const a = c.at(c.world([50, 70, 40]));
      const p = c.at(c.world([50, 0, 40]));
      if (a) c.click(a.x + 1, a.y);
      if (p) c.hover(p.x + 4, p.y + 1);
    }),
    // 상자 앞 오른쪽 위 구석에서 Z축 방향(상자 위 빈 곳)
    s('infer-axis', (c) => {
      c.v.setMeasureMode(true);
      c.v.setMeasureSnap({ inference: { axes: true } });
      const a = c.at(c.world([120, 0, 40]));
      const p = c.at(c.world([120, 0, 95]));
      if (a) c.click(a.x - 1, a.y + 1);
      if (p) c.hover(p.x + 5, p.y - 2);
    }),
  ];
  if (d === 'base')
    out.push(
      // 상자 윗면 위로 엇갈린 두 선분의 교차점(60, 40, 40.5)
      s(
        'infer-cross',
        (c) => {
          c.v.setMeasureMode(true);
          c.v.setMeasureSnap({ inference: { intersections: true } });
          const p = c.at([60, 40, 40.5]);
          if (p) c.hover(p.x + 4, p.y - 3);
        },
        'cross',
      ),
    );
  return out;
}

/** 0.9.0 그물마다 윤곽선·외곽선 색 */
function itemLineShots(d: 'base' | 'off'): Shot[] {
  const s = (name: string, setup: Shot['setup']): Shot => ({ name: `${d}-${name}`, data: d, setup, needs: fn('setItemEdgeColor', 'setItemProfileColor') });
  const out: Shot[] = [
    // 외곽선(굵기 3): 상자·구는 제 색, 나머지는 전역 색 — 구가 판 위에 겹친 테두리는 구 색
    s('item-profile', ({ v }) => {
      v.setRenderOptions({ profiles: { width: 3, color: '#101418' } });
      v.setItemProfileColor('상자', '#e0245e');
      v.setItemProfileColor('구', [0.15, 0.45, 0.95, 1]);
    }),
  ];
  if (d === 'base')
    out.push(
      // 와이어프레임 1화소 외곽선 + 그물마다 윤곽선 색(상자 = 윤곽선, 구 = 삼각형 변)
      s('item-lines-wire', ({ v }) => {
        v.setRenderMode('wireframe');
        v.setRenderOptions({ profiles: { width: 1 } });
        v.setItemEdgeColor('상자', '#e0245e');
        v.setItemEdgeColor('구', '#22aa66');
        v.setItemProfileColor('작은 상자 2', '#ffcc00');
      }),
      // 음영+윤곽: 상자 윤곽선만 제 색, 반투명 판의 외곽선 색은 쓰지 않는다(반투명은 외곽선 없음)
      s('item-edge-shadedEdges', ({ v }) => {
        v.setRenderMode('shadedEdges');
        v.setRenderOptions({ profiles: { width: 2 } });
        v.setItemEdgeColor('상자', '#e0245e');
        v.setItemProfileColor('판', '#00ff00');
      }),
    );
  return out;
}

/** 걷기(0.7.0)와 중력·부딪힘(0.8.0) */
const walkShots: Shot[] = [
  {
    name: 'base-walk',
    data: 'base',
    needs: fn('setNavigation', 'walkBy', 'lookBy'),
    setup: ({ v }) => {
      v.setNavigation('walk', { eyeHeight: 40 });
      v.walkBy(120, -20);
      v.lookBy(0.35, -0.12);
    },
  },
  {
    // 판 위에 서서(중력) 상자 앞면까지 걸어가 멈춘(부딪힘) 뒤 오른쪽(구 쪽)으로 돌아본다
    name: 'base-walk-gravity',
    data: 'base',
    needs: all(v080, fn('setNavigation', 'walkBy', 'lookBy')),
    setup: ({ v }) => {
      standOnPlate(v);
      for (let i = 0; i < 4; i++) v.walkBy(12, 0);
      v.lookBy(-1.1, 0.05);
    },
  },
];

/**
 * 걷기 시작 자리: 앞에서 본 카메라에서 판 위(상자 앞 약 20 mm)까지 걸어간 뒤 중력·부딪힘을 켠다(발밑 판 윗면에 선다).
 * 눈높이 30 mm(장면이 mm라 기본 1.6 m는 장면보다 크다)
 */
function standOnPlate(v: V): void {
  v.setView('front', false);
  v.fit(false);
  const cam = v.getCamera();
  v.setNavigation('walk', { eyeHeight: 30 });
  v.walkBy(cam.distance - (cam.target[1] + 20), 0);
  v.setNavigation('walk', { gravity: true, collide: true });
}

/** 0.7.0 보여 주기 몇 가지(하늘·그림자·안개·무늬·두 단면·재생·겉모습)와 뷰 큐브 */
const extraShots: Shot[] = [
  {
    name: 'base-sky',
    data: 'base',
    needs: fn('setBackground'),
    setup: ({ v }) => v.setBackground({ sky: '#5d8fd0', skyHorizon: '#cfe0f2', ground: '#6d6656', groundHorizon: '#b3ad9c' }),
  },
  {
    name: 'base-sun-shadows',
    data: 'base',
    needs: fn('setLighting'),
    setup: ({ v }) => v.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true }),
  },
  {
    name: 'base-fog',
    data: 'base',
    needs: fn('setFog'),
    setup: ({ v }) => {
      const cam = v.getCamera();
      v.setFog({ start: cam.distance * 0.7, end: cam.distance * 1.6 });
    },
  },
  { name: 'tex-shaded', data: 'tex', setup: () => undefined },
  {
    name: 'base-sections-two',
    data: 'base',
    needs: fn('setSections'),
    setup: ({ v }) =>
      v.setSections(
        [
          { normal: [1, 0, 0], offset: 150 },
          { normal: [0, -1, 0], offset: -40 },
        ],
        { caps: 'all' },
      ),
  },
  {
    name: 'base-playback',
    data: 'base',
    needs: fn('setLineDrawRange', 'setMarker'),
    setup: ({ v }) => {
      const line = sceneOf('base').lines[0]!;
      const n = 8000;
      v.setLineDrawRange(line.id, n, { ghost: 0.12 });
      const o = (n - 1) * 6 + 3;
      v.setMarker([line.positions[o]!, line.positions[o + 1]!, line.positions[o + 2]!], 'ball');
    },
  },
  {
    name: 'base-looks',
    data: 'base',
    needs: fn('setItemOpacity', 'setItemColor', 'setItemMatrix'),
    setup: ({ v }) => {
      v.setItemOpacity('상자', 0.4);
      v.setItemColor('구', '#33aa55');
      v.setItemMatrix('작은 상자 1', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 30, 1]);
    },
  },
  {
    name: 'base-annotations',
    data: 'base',
    needs: fn('setAnnotations'),
    setup: ({ v }) =>
      v.setAnnotations([
        { kind: 'distance', a: [0, 0, 40], b: [120, 0, 40] },
        { kind: 'angle', a: [120, 80, 40], b: [0, 80, 40], c: [120, 0, 40] },
        { kind: 'radius', a: [190, 40, 35], b: [225, 40, 35], normal: [0, 0, 1] },
      ]),
  },
  { name: 'base-cube-iso', data: 'base', capture: 'cube', setup: () => undefined },
  // 나눠 올리기로 올린 큰 장면(그림을 찍을 때 남은 올리기를 마친다): 0.9.0은 큰 배열을 조각으로 채운다 — 다 올린 그림은 0.8.0과 같아야 한다
  { name: 'big-incremental', data: 'big', setup: () => undefined },
  {
    name: 'base-cube-light-front',
    data: 'base',
    capture: 'cube',
    setup: ({ v }) => {
      v.setTheme('light');
      v.setView('front', false);
    },
  },
];

/** 0.10.0 붙잡기 한도(setMeasureSnapLimit): 한도 밖이던 상자 윗면 중심이 한도를 늘리면 그 커서 자리에서 다시 붙잡힌다 */
function limitShots(d: 'base' | 'off'): Shot[] {
  return [
    {
      name: `${d}-measure-limit-hover`,
      data: d,
      needs: fn('setMeasureSnapLimit', 'project', 'setGroupVisible'),
      setup: (c) => {
        const { v } = c;
        // 공구 경로(나선)는 숨긴다 — 선분 끝점이 상자 위를 덮는다(inferShots와 같다)
        v.setGroupVisible('공구 경로', false);
        v.setMeasureMode(true);
        v.setMeasureSnap({ points: [{ point: c.world([60, 40, 40]), kind: 'center', id: '상자', order: 5 }], limit: 5 });
        const p = c.at(c.world([60, 40, 40]));
        if (p) c.hover(p.x + 3, p.y - 2);
        v.renderNow();
        v.setMeasureSnapLimit(6);
      },
    },
  ];
}

/** 0.10.0 추론 잠금이 있는 판인지 */
const v0100lock: Need = (v, c) => all(v090infer, fn('setMeasureInferenceLock', 'project', 'setGroupVisible'))(v, c);

/**
 * 0.10.0 추론 보완 표식: 나란함(엇갈린 선분과 나란한 자홍 안내선·기준 선분·∥), Shift 잠금(축 — 작은 상자 구석을 잠근 Z선으로 옮겨 온 점선과 고리),
 * 앱 잠금(수직 — 수직 발 너머로). 공구 경로는 숨긴다
 */
function lockShots(d: 'base' | 'off'): Shot[] {
  const s = (name: string, setup: Shot['setup'], data: Data = d): Shot => ({
    name: `${d}-${name}`,
    data,
    needs: v0100lock,
    setup: (c) => {
      c.v.setGroupVisible('공구 경로', false);
      return setup(c);
    },
  });
  const out: Shot[] = [
    // 상자 앞 오른쪽 위 구석에서 Z축 방향을 보다가 Shift를 누른 채 작은 상자 1의 앞 위 구석으로 — 잠근 Z선 위 그 높이(120, 0, 12)
    s('infer-lock-shift', (c) => {
      c.v.setMeasureMode(true);
      c.v.setMeasureSnap({ inference: { axes: true, lock: true } });
      const a = c.at(c.world([120, 0, 40]));
      const p = c.at(c.world([120, 0, 95]));
      const q = c.at(c.world([156, -36, 12]));
      if (a) c.click(a.x - 1, a.y + 1);
      if (p) c.hover(p.x + 5, p.y - 2);
      c.v.renderNow();
      if (q) c.hover(q.x + 2, q.y + 1, 'mouse', true);
    }),
    // 구멍 점에서 상자 앞 윗모서리로 내린 수직 발을 앱 단추로 잠그고(setMeasureInferenceLock(true)) 모서리 너머로
    s('infer-lock-perp', (c) => {
      c.v.setMeasureMode(true);
      c.v.setMeasureSnap({ edges: true, inference: { perpendicular: true } });
      const a = c.at(c.world([50, 70, 40]));
      const p = c.at(c.world([50, 0, 40]));
      const q = c.at(c.world([50, -60, 40]));
      if (a) c.click(a.x + 1, a.y);
      if (p) c.hover(p.x + 4, p.y + 1);
      c.v.renderNow();
      c.v.setMeasureInferenceLock(true);
      if (q) c.hover(q.x + 6, q.y + 3);
    }),
  ];
  if (d === 'base')
    out.push(
      // 상자 앞 오른쪽 위 구석(120, 0, 40)에서, 엇갈린 선분 하나를 지나간 뒤 그와 나란한 자리(상자 앞 허공). 밝은 테마의 추론 색도 한 장
      ...[false, true].map((light) =>
      s(
        light ? 'infer-parallel-light' : 'infer-parallel',
        (c) => {
          if (light) c.v.setTheme('light');
          c.v.setMeasureMode(true);
          c.v.setMeasureSnap({ inference: { axes: true, parallel: true } });
          const a = c.at([120, 0, 40]);
          const r = c.at([35, 25, 40.5]);
          const e = [100 / Math.hypot(100, 60), 60 / Math.hypot(100, 60), 0];
          const p = c.at([120 - e[0]! * 50, -e[1]! * 50, 40]);
          if (a) c.click(a.x - 1, a.y + 1);
          if (r) c.hover(r.x, r.y);
          c.v.renderNow();
          if (p) c.hover(p.x + 3, p.y + 2);
        },
        'cross',
      ),
      ),
    );
  return out;
}

// ───────────── 0.12.0 선분 방향 잠금·앱 방향 잠금 ─────────────
/** 0.12.0 측정 잠금 보완(measureHoverLock·measurePoints·measureLabelRect getter)이 있는 판인지 */
const v0120lock: Need = (v, c) => {
  const why = v0100lock(v, c);
  if (why) return why;
  const miss = ['measureHoverLock', 'measurePoints', 'measureLabelRect'].filter((n) => !(n in v));
  return miss.length ? `이 판에 없는 API: ${miss.join(', ')}` : null;
};

/**
 * 0.12.0 잠금 표식: 상자 구석에서 세 모서리가 만나는 다른 구석(점 붙잡기)을 가리킨 뒤 Shift — 첫 점을 지나는 모서리 축(Y)으로 잠근 굵은 선.
 * base 자료만: 엇갈린 대각 선분 끝에서 다른 끝을 가리킨 뒤 Shift(그 선분과 나란히 — 자홍 잠금선·기준 선분 점선),
 * 앱이 정한 방향(setMeasureInferenceLock({ edge })). 공구 경로는 숨긴다
 */
function edgeLockShots(d: 'base' | 'off'): Shot[] {
  const s = (name: string, setup: Shot['setup'], data: Data = d): Shot => ({
    name: `${d}-${name}`,
    data,
    needs: v0120lock,
    setup: (c) => {
      c.v.setGroupVisible('공구 경로', false);
      return setup(c);
    },
  });
  const out: Shot[] = [
    s('infer-lock-edge-axis', (c) => {
      c.v.setMeasureMode(true);
      c.v.setMeasureSnap({ edges: true, inference: { axes: true, lock: true } });
      const a = c.at(c.world([120, 0, 40]));
      const p = c.at(c.world([120, 80, 40]));
      const q = c.at(c.world([135, 115, 70]));
      if (a) c.click(a.x, a.y);
      if (p) c.hover(p.x, p.y);
      c.v.renderNow();
      if (q) c.hover(q.x, q.y, 'mouse', true);
    }),
  ];
  if (d === 'base')
    out.push(
      s(
        'infer-lock-edge',
        (c) => {
          // 구멍 점(z 40)이 대각 선분 끝(z 40.5) 바로 아래에 있어 점이 먼저 붙잡힌다 — 숨긴다
          c.v.setGroupVisible('구멍', false);
          c.v.setMeasureMode(true);
          c.v.setMeasureSnap({ midpoints: true, inference: { intersections: true, axes: true, lock: true } });
          const a = c.at([10, 10, 40.5]);
          const p = c.at([110, 70, 40.5]);
          const q = c.at([150, 75, 40.5]);
          if (a) c.click(a.x, a.y);
          if (p) c.hover(p.x, p.y);
          c.v.renderNow();
          if (q) c.hover(q.x, q.y, 'mouse', true);
        },
        'cross',
      ),
      s('infer-lock-direction', (c) => {
        c.v.setMeasureMode(true);
        c.v.setMeasureSnap({ inference: { axes: true } });
        c.v.setMeasureInferenceLock({
          edge: [
            [0, 0, 40],
            [120, 80, 40],
          ],
        });
        const a = c.at([120, 0, 40]);
        const q = c.at([175, 30, 40]);
        if (a) c.click(a.x, a.y);
        if (q) c.hover(q.x, q.y);
      }),
    );
  return out;
}

// ───────────── 0.13.0 측정 거리 글상자 비켜 그리기 ─────────────
/** 0.13.0 거리 글상자 비켜 그리기(setMeasureLabelAvoid)가 있는 판인지 */
const v0130label: Need = (v, c) => v0120lock(v, c) ?? fn('setMeasureLabelAvoid')(v, c);

/** 손가락 위 정밀 조준 십자선의 반지름(커서 둘레)과 그 아래 손가락 자리(십자선 가운데에서 64화소 아래, 44화소 네모) */
const AIM_R = 24;
const finger = (x: number, y: number): { x: number; y: number; width: number; height: number } => ({ x: x - 22, y: y + 64 - 22, width: 44, height: 44 });
/** 상자 윗면 앞 구석에서 윗면 모서리를 따라 가까운 점 — 기본 글상자가 커서에 걸린다 */
const LABEL_TARGET = [120, 22, 40];

/** 공구 경로를 숨기고 상자 윗면 앞 구석(120, 0, 40)에 첫 점을 찍은 뒤 target을 가리킨다(pointerType). 가리킨 화면 자리 */
function labelPreview(c: Ctx, target: readonly number[], pointerType = 'mouse'): { x: number; y: number } | null {
  c.v.setGroupVisible('공구 경로', false);
  c.v.setMeasureMode(true);
  const a = c.at(c.world([120, 0, 40]));
  const q = c.at(c.world(target));
  if (!a || !q) return null;
  c.click(a.x, a.y);
  c.hover(q.x, q.y, pointerType);
  return q;
}

/**
 * 화면 덧그림 캔버스만 찍는다(비켜 그리기는 화면 덧그림뿐 — 그림 저장은 기본 자리). 기본 자리(옛 API만 — base와 견준다),
 * 그 자리를 앱 사각형으로 막은 것, 정밀 조준처럼 펜으로 가리키고 십자선(커서 둘레)과 손가락을 피한 것
 */
const labelShots: Shot[] = [
  { name: 'base-measure-label-screen', data: 'base', needs: fn('setGroupVisible', 'project'), capture: 'overlay', setup: (c) => void labelPreview(c, LABEL_TARGET) },
  {
    name: 'base-measure-label-avoid-rect',
    data: 'base',
    needs: v0130label,
    capture: 'overlay',
    setup: (c) => {
      if (!labelPreview(c, LABEL_TARGET)) return;
      c.v.renderNow();
      const r = c.v.measureLabelRect;
      c.v.setMeasureLabelAvoid(r ? [r] : null);
    },
  },
  // 첫 점 가까이(6 mm — 화면 몇 화소)를 가리키면 귀·선분 위 자리가 모두 십자선에 걸려 십자선 바로 위로
  ...[
    ['aim', LABEL_TARGET],
    ['aim-short', [120, 6, 40]],
  ].map(
    ([name, target]): Shot => ({
      name: `base-measure-label-avoid-${name}`,
      data: 'base',
      needs: v0130label,
      capture: 'overlay',
      setup: (c) => {
        const q = c.at(c.world(target as number[]));
        if (q) c.v.setMeasureLabelAvoid({ pointerRadius: AIM_R, rects: [finger(q.x, q.y)] });
        labelPreview(c, target as number[], 'pen');
      },
    }),
  ),
];

/**
 * 0.13.0 비켜 그리기 값: 상자 윗면 앞 구석에서 가까운 점들을 가리킨 기본 자리, 그 자리를 앱 사각형으로 막은 자리, 십자선·손가락을 피한 자리와
 * 확인(막은 자리와 겹치지 않거나 모두 겹쳐 기본 자리인지, 그림 저장(renderImage)이 피할 영역을 쓰지 않는지 — 다른 화소 수 0,
 * 화면 덧그림은 글상자가 옮겨졌을 때만 바뀌는지)
 */
const labelAvoidValues: ValueSet = {
  name: 'base-measure-label-avoid',
  data: 'base',
  needs: v0130label,
  run: (c) => {
    const { v } = c;
    const overlay = c.host.querySelector<HTMLCanvasElement>('canvas.v3d-overlay')!;
    const screen = (): Uint8ClampedArray => overlay.getContext('2d')!.getImageData(0, 0, overlay.width, overlay.height).data;
    const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
      let n = 0;
      for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++;
      return n;
    };
    type Rect = { x: number; y: number; width: number; height: number };
    const rect = (r: Rect | null): number[] | null => (r ? [r.x, r.y, r.width, r.height].map(r10) : null);
    const same = (a: Rect | null, b: Rect | null): boolean => JSON.stringify(a) === JSON.stringify(b);
    const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    const out: unknown[] = [];
    const a = c.at(c.world([120, 0, 40]))!;
    for (const t of [LABEL_TARGET, [120, 6, 40], [120, 40, 40], [100, 0, 40], [120, 0, 25], [90, 30, 40], [0, 0, 40]])
      for (const pt of ['mouse', 'pen']) {
        v.setMeasureLabelAvoid(null);
        v.clearMeasure();
        const q = labelPreview(c, t, pt);
        v.renderNow();
        const r0: Rect | null = v.measureLabelRect;
        if (!q || !r0) {
          out.push([t, pt, null]);
          continue;
        }
        const img0 = v.renderImage({}).data, scr0 = screen();
        v.setMeasureLabelAvoid([r0]);
        v.renderNow();
        const r1: Rect = v.measureLabelRect!;
        const aim = { pointerRadius: AIM_R, rects: [finger(q.x, q.y)] };
        v.setMeasureLabelAvoid(aim);
        v.renderNow();
        const r2: Rect = v.measureLabelRect!;
        const img2 = v.renderImage({}).data, scr2 = screen();
        // 십자선(커서 둘레 원)·손가락과 겹치는지
        const dx = q.x - Math.min(Math.max(q.x, r2.x), r2.x + r2.width), dy = q.y - Math.min(Math.max(q.y, r2.y), r2.y + r2.height);
        const hit2 = dx * dx + dy * dy < AIM_R * AIM_R || overlap(r2, aim.rects[0]!);
        // 옮긴 글상자가 첫 점 표식(반지름 6)을 가리는지
        const ax = a.x - Math.min(Math.max(a.x, r2.x), r2.x + r2.width), ay = a.y - Math.min(Math.max(a.y, r2.y), r2.y + r2.height);
        out.push([
          t,
          pt,
          rect(r0),
          rect(r1),
          !overlap(r1, r0) || same(r1, r0),
          rect(r2),
          hit2 === same(r2, r0) || !hit2,
          !same(r2, r0) && ax * ax + ay * ay < 36,
          v.measureLabelAvoid,
          diff(img0, img2),
          diff(scr0, scr2) > 0 === !same(r0, r2),
        ]);
      }
    v.setMeasureLabelAvoid(null);
    v.setMeasureMode(false);
    v.renderNow();
    out.push(['off', v.measureLabelRect, v.measureLabelAvoid]);
    return out;
  },
};

// ───────────── 0.11.0 그물 하나 바꾸기(setMesh·removeMesh) ─────────────
/**
 * 상자 윗면(z 40) 위에 띄운 높이 격자(소재 윗면 z 52, 깎으면 내려간다). 원점은 격자 가운데 윗면.
 * head는 setMesh·removeMesh로 바꾸고, 그 API가 없는 판(base)은 같은 마지막 장면을 setScene(keepView)으로 다시 준다
 * (0.11.0 전에 앱이 하던 길) — 그래서 base·head 비교가 곧 "setMesh = 장면 전체 다시 올리기"의 확인이다
 */
const TOP = 52;
const EDIT_GRID: GridSpec = { n: 96, size: 70, x0: 25, y0: 5, origin: [60, 40, TOP] };
const EDIT_BIG: GridSpec = { ...EDIT_GRID, n: 520 };
const flatTop = (): number => TOP;
const EDIT_PATH: [number, number][] = [
  [35, 15],
  [85, 65],
  [85, 20],
  [40, 60],
];
const cutTop = cutBy(flatTop, EDIT_PATH, 6, TOP - 5, 3);
const gridOpts = { top: TOP, depth: 6, group: '소재' };

function editScene(g: GridSpec, z: (x: number, y: number) => number): Scene3d {
  const s = sceneOf('base');
  return { ...s, meshes: [...s.meshes, gridMesh('소재', g, z, gridOpts)] };
}

/** 장면 그물 목록에서 id를 바꾼(없으면 끝에 더한, null이면 뺀) 새 장면 */
function withMesh(s: Scene3d, id: string, m: Mesh3d | null): Scene3d {
  const i = s.meshes.findIndex((x) => x.id === id);
  const meshes = s.meshes.slice();
  if (!m) meshes.splice(i, 1);
  else if (i >= 0) meshes[i] = m;
  else meshes.push(m);
  return { ...s, meshes };
}

interface Edit {
  name: string;
  data: 'edit' | 'edit-big';
  /** 바꾸기 전에 거는 보기 상태(base는 setScene 뒤에 다시 건다) */
  state?: (v: V) => void;
  /** head: setMesh·removeMesh로 바꾼다 */
  head: (v: V) => void;
  /** base: 바꾼 뒤의 장면(지금 장면에서) */
  final: (s: Scene3d) => Scene3d;
}

const grid2: GridSpec = { n: 48, size: 40, x0: 10, y0: -48, origin: [30, -28, 4] };
const cut2 = cutBy(() => 4, [
  [14, -44],
  [46, -12],
], 4, 1, 1.5);
const grid2Opts = { top: 4, depth: 3, group: '소재' };
const sphereBox = (): Mesh3d => ({ ...boxMesh('구', [160, 10, 0], [220, 70, 50], [0.85, 0.45, 0.35, 1], '구') });
const EDITS: Edit[] = [
  {
    // 격자를 깎은 격자로(같은 크기 새 배열 — 앞 버퍼를 물려받는다, 색인은 같은 배열)
    name: 'replace',
    data: 'edit',
    head: (v) => {
      const g = v.scene!.meshes.find((m: Mesh3d) => m.id === '소재')!;
      v.setMesh(gridMesh('소재', EDIT_GRID, cutTop, { ...gridOpts, indices: g.indices }));
    },
    final: (s) => withMesh(s, '소재', gridMesh('소재', EDIT_GRID, cutTop, gridOpts)),
  },
  {
    // 보기 상태(숨김·강조·겉모습·단면·그림자·외곽선)를 건 채 바꾸기
    name: 'replace-state',
    data: 'edit',
    state: (v) => {
      v.setRenderMode('shadedEdges');
      v.setGroupVisible('공구 경로', false);
      v.setItemVisible('구멍', false);
      v.highlight(['상자']);
      v.setItemColor('판', '#3366aa');
      v.setItemEdgeColor('상자', '#00ff00');
      v.setItemProfileColor('소재', '#e0245e');
      v.setSection({ normal: [0, 1, 0], offset: 46 });
      v.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true });
      v.setRenderOptions({ profiles: { width: 2 } });
    },
    head: (v) => v.setMesh(gridMesh('소재', EDIT_GRID, cutTop, gridOpts)),
    final: (s) => withMesh(s, '소재', gridMesh('소재', EDIT_GRID, cutTop, gridOpts)),
  },
  {
    // 제자리에서 고친 마디 줄(30~70)만 vertices로 올리기
    name: 'range',
    data: 'edit',
    head: (v) => {
      const g = v.scene!.meshes.find((m: Mesh3d) => m.id === '소재')!;
      v.setMesh(g, { vertices: fillGrid(g, EDIT_GRID, cutTop, 30, 70, TOP, 6) });
    },
    final: (s) => {
      const g = gridMesh('소재', EDIT_GRID, flatTop, gridOpts);
      fillGrid(g, EDIT_GRID, cutTop, 30, 70, TOP, 6);
      return withMesh(s, '소재', g);
    },
  },
  {
    // 넣기(새 격자 조각)·빼기(작은 상자 2)·모양이 다른 그물로 바꾸기(구 → 상자), 숨은 선 모드
    name: 'insert-remove',
    data: 'edit',
    state: (v) => v.setRenderMode('hiddenLine'),
    head: (v) => {
      v.setMesh(gridMesh('조각 2', grid2, cut2, grid2Opts));
      v.removeMesh('작은 상자 2');
      v.setMesh(sphereBox());
    },
    final: (s) => withMesh(withMesh(withMesh(s, '조각 2', gridMesh('조각 2', grid2, cut2, grid2Opts)), '작은 상자 2', null), '구', sphereBox()),
  },
  {
    // 와이어프레임(법선 없는 격자 — 삼각형 변) + 1화소 외곽선
    name: 'wire',
    data: 'edit',
    state: (v) => {
      v.setRenderMode('wireframe');
      v.setRenderOptions({ profiles: { width: 1 } });
    },
    head: (v) => v.setMesh(gridMesh('소재', EDIT_GRID, cutTop, { ...gridOpts })),
    final: (s) => withMesh(s, '소재', gridMesh('소재', EDIT_GRID, cutTop, gridOpts)),
  },
  {
    // 큰 격자(520² 마디, 새 배열 10.8 MB)를 나눠 올리기로 바꾸기 — 그림을 찍을 때 남은 조각을 채운다
    name: 'incremental',
    data: 'edit-big',
    head: (v) => v.setMesh(gridMesh('소재', EDIT_BIG, cutTop, gridOpts), { incremental: true }),
    final: (s) => withMesh(s, '소재', gridMesh('소재', EDIT_BIG, cutTop, gridOpts)),
  },
];

/** 바꾸기 한 가지를 지금 뷰어에 건다(head = setMesh 길, base = 같은 마지막 장면을 setScene). 뷰어 장면이 바뀌므로 다음 장면은 다시 올린다 */
function applyEdit(c: Ctx, e: Edit, path: 'auto' | 'setScene' = 'auto'): void {
  const { v } = c;
  e.state?.(v);
  if (path === 'auto' && typeof v.setMesh === 'function') e.head(v);
  else {
    v.setScene(e.final(v.scene!), { keepView: true });
    e.state?.(v);
  }
  loaded = null;
}

const editShots: Shot[] = EDITS.map((e) => ({ name: `${e.data}-${e.name}`, data: e.data, setup: (c) => applyEdit(c, e) }));

/** 같은 판 안에서: setMesh로 바꾼 그림 = 처음부터 바뀐 장면을 setScene한 그림(다른 화소 수 — base는 둘 다 setScene이라 0) */
const editSame: ValueSet = {
  name: 'edit-same-pixels',
  data: 'edit',
  run: () => {
    const out: unknown[] = [];
    for (const e of EDITS) {
      const ca = makeCtx(e.data);
      applyEdit(ca, e);
      const a = ca.v.renderImage({}).data;
      const cb = makeCtx(e.data);
      applyEdit(cb, e, 'setScene');
      const b = cb.v.renderImage({}).data;
      let diff = 0;
      for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) diff++;
      out.push([e.name, a.length, diff]);
    }
    return out;
  },
};

/** 바꾼 장면의 값: 고르기(격자 위 화면 점)·측정(상자 구석 → 깎인 격자 마디)·미리 보기·범위·보이기·그리기 수 */
const editValues: ValueSet = {
  name: 'edit-values',
  data: 'edit',
  run: (c) => {
    const { v, w, h } = c;
    applyEdit(c, EDITS[3]!);
    applyEdit(c, EDITS[0]!);
    v.setGroupVisible('공구 경로', false);
    const out: unknown[] = [];
    for (const pointerType of ['mouse', 'touch'])
      for (let j = 0; j < 12; j++)
        for (let i = 0; i < 16; i++) {
          const p = v.pick(((i + 0.5) * w) / 16, ((j + 0.5) * h) / 12, { pointerType });
          out.push(p ? [p.kind, p.id, p.index, r10s(p.point)] : null);
        }
    const res: unknown[] = [];
    const off = v.onMeasure((m: any) => m && res.push([r10s(m.a), r10s(m.b), r10(m.distance), m.snapA ?? null, m.snapB ?? null]));
    v.setMeasureMode(true);
    for (const [i, j] of [
      [14, 14],
      [48, 48],
      [80, 30],
      [60, 60],
    ] as const) {
      const x = gridX(EDIT_GRID, i), y = gridY(EDIT_GRID, j);
      const a = c.at([120, 0, 40]);
      const p = c.at([x, y, cutTop(x, y)]);
      if (!a || !p) continue;
      c.click(a.x - 1, a.y + 1);
      c.hover(p.x, p.y);
      v.renderNow();
      const hs = v.measureHoverSnap;
      res.push(hs ? [r10s(hs.point), hs.snap] : null);
      c.click(p.x, p.y);
    }
    off();
    v.renderNow();
    out.push(res, v.sectionRange('x'), v.sectionRange('z'), v.groups(), ['소재', '조각 2', '구', '작은 상자 2'].map((id) => v.isVisible(id)));
    const st = v.stats;
    out.push([st.drawCalls, st.triangles, st.segments, st.points]);
    return out;
  },
};

const SHOTS: Shot[] = [
  ...classicShots('base'),
  ...classicShots('off'),
  ...newShots('base'),
  ...newShots('off'),
  ...walkShots,
  ...extraShots,
  ...inferShots('base'),
  ...inferShots('off'),
  ...itemLineShots('base'),
  ...itemLineShots('off'),
  ...limitShots('base'),
  ...limitShots('off'),
  ...lockShots('base'),
  ...lockShots('off'),
  ...editShots,
  ...edgeLockShots('base'),
  ...edgeLockShots('off'),
  ...labelShots,
];

// ───────────── 값(고르기·측정·화면 위치·걷기) ─────────────
function valueSets(d: 'base' | 'off'): ValueSet[] {
  return [
    {
      // 격자 위 점 고르기: 모드 셋 × 윤곽선 고르기 끔·켬 × 마우스·터치
      name: `${d}-picks`,
      data: d,
      run: ({ v, w, h }) => {
        const out: unknown[] = [];
        for (const mode of ['shaded', 'wireframe', 'hiddenLine'])
          for (const edges of [false, true])
            for (const pointerType of ['mouse', 'touch']) {
              v.setRenderMode(mode as never);
              for (let j = 0; j < 15; j++)
                for (let i = 0; i < 20; i++) {
                  const p = v.pick(((i + 0.5) * w) / 20, ((j + 0.5) * h) / 15, { edges, pointerType });
                  out.push(p ? [p.kind, p.id, p.index, r10s(p.point)] : null);
                }
            }
        return out;
      },
    },
    {
      // 측정 두 점 누르기(마우스·터치·펜) — 결과 거리와 붙잡은 점
      name: `${d}-measure`,
      data: d,
      run: (c) => measureClicks(c, ['mouse', 'touch', 'pen']),
    },
    {
      name: `${d}-measure-snap`,
      data: d,
      needs: all(v080, fn('setMeasureSnap')),
      run: (c) => {
        c.v.setMeasureSnap({ midpoints: true, edges: true, points: [{ point: c.world([60, 40, 40]), kind: 'center', id: '상자' }] });
        return measureClicks(c, ['mouse', 'touch']);
      },
    },
    {
      // 0.9.0 앱 점 색인: 앱 점 수천 개(묶음 행렬로 옮긴 묶음 포함)를 붙잡는 측정 — 0.8.0(모두 훑기)과 값이 같아야 한다
      name: `${d}-measure-snap-many`,
      data: d,
      needs: all(v080, fn('setMeasureSnap', 'setItemMatrix')),
      run: (c) => {
        c.v.setItemMatrix('작은 상자 1', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 30, 1]);
        c.v.setMeasureSnap({ points: manySnapPoints(c) });
        return measureClicks(c, ['mouse', 'touch']);
      },
    },
    {
      // 0.9.0 추론 붙잡기를 모두 켠 측정(교차점·수직 발·축)
      name: `${d}-measure-infer`,
      data: d,
      needs: v090infer,
      run: (c) => {
        c.v.setMeasureSnap({ edges: true, inference: true });
        return measureClicks(c, ['mouse', 'touch']);
      },
    },
    {
      // 0.9.1 축 붙잡기 측정: 상자 구석 셋에서 X·Y·Z 축 방향(앞·뒤로)을 찍은 결과의 붙잡기 종류와 축(axisB). 공구 경로는 숨긴다
      name: `${d}-measure-axis`,
      data: d,
      needs: v091axis,
      run: (c) => {
        const { v } = c;
        const res: unknown[] = [];
        const off = v.onMeasure((m: any) => m && res.push([r10s(m.a), r10s(m.b), r10(m.distance), m.snapA ?? null, m.snapB ?? null, m.axisA ?? null, m.axisB ?? null]));
        v.setGroupVisible('공구 경로', false);
        v.setMeasureMode(true);
        v.setMeasureSnap({ inference: { axes: true } });
        const dirs = [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ];
        for (const corner of [
          [120, 0, 40],
          [0, 0, 40],
          [120, 80, 40],
        ])
          for (const e of dirs)
            for (const t of [-30, 25, 55]) {
              const a = c.at(c.world(corner));
              const p = c.at(c.world(corner.map((x, i) => x + e[i]! * t)));
              if (!a || !p) continue;
              c.click(a.x - 1, a.y + 1);
              c.click(p.x + 3, p.y - 2);
            }
        off();
        return res;
      },
    },
    {
      // 상자 구석·구 중심의 화면 위치와 가림(음영)
      name: `${d}-project`,
      data: d,
      needs: fn('project'),
      run: ({ v, world }) => {
        const pts = [
          [0, 0, 0],
          [120, 0, 0],
          [120, 80, 0],
          [0, 80, 0],
          [0, 0, 40],
          [120, 0, 40],
          [120, 80, 40],
          [0, 80, 40],
          [190, 40, 35],
          [60, 40, 110],
        ];
        const out: unknown[] = [];
        for (const view of ['seIso', 'front', 'top']) {
          v.setView(view as never, false);
          v.fit(false);
          for (const p of pts) {
            const r = v.project(world(p), { occlusion: true });
            out.push(r ? [r10(r.x), r10(r.y), r10(r.depth), r.behind, r.onScreen, r.occluded, r.visible] : null);
          }
        }
        return out;
      },
    },
  ];
}

/**
 * 앱 붙잡기 점 수천 개: 상자 윗면 격자(묶음 '상자'), 구 겉면(묶음 없음), 작은 상자 1 둘레(묶음 행렬을 거는 묶음 — 따로 찾는 길).
 * 종류는 차례로 돌린다
 */
function manySnapPoints(c: Ctx): { point: number[]; kind: 'center' | 'point' | 'midpoint'; id?: string }[] {
  const kinds = ['center', 'point', 'midpoint'] as const;
  const out: { point: number[]; kind: 'center' | 'point' | 'midpoint'; id?: string }[] = [];
  for (let j = 0; j <= 40; j++) for (let i = 0; i <= 60; i++) out.push({ point: c.world([i * 2, j * 2, 40]), kind: kinds[out.length % 3]!, id: '상자' });
  for (let j = 1; j < 24; j++)
    for (let i = 0; i < 48; i++) {
      const ph = (j / 24) * Math.PI, th = (i / 48) * Math.PI * 2;
      out.push({ point: c.world([190 + 35 * Math.sin(ph) * Math.cos(th), 40 + 35 * Math.sin(ph) * Math.sin(th), 35 + 35 * Math.cos(ph)]), kind: kinds[out.length % 3]! });
    }
  for (let k = 0; k < 120; k++) out.push({ point: c.world([150 - 6 + (k % 12), -30 - 6 + Math.floor(k / 12) * 1.2, 12]), kind: kinds[out.length % 3]!, id: '작은 상자 1' });
  return out;
}

function measureClicks(c: Ctx, types: string[]): unknown[] {
  const { v, w, h } = c;
  const res: unknown[] = [];
  const off = v.onMeasure((m: any) =>
    res.push(m ? [r10s(m.a), r10s(m.b), r10(m.distance), m.snapA ?? null, m.snapB ?? null] : null),
  );
  for (const mode of ['shaded', 'wireframe'])
    for (const edges of [false, true])
      for (const pt of types) {
        v.setRenderMode(mode as never);
        if (typeof v.setPickEdges === 'function') v.setPickEdges(edges);
        v.setMeasureMode(true);
        for (let j = 0; j < 10; j++) for (let i = 0; i < 11; i++) c.click(((i + 0.5) * w) / 11, ((j + 0.5) * h) / 10, pt);
        v.setMeasureMode(false);
      }
  off();
  return res;
}

const crossValues: ValueSet = {
  // 0.9.0 교차점 붙잡기: 엇갈린 선분이 있는 자료에서 추론을 켠 측정
  name: 'cross-measure-infer',
  data: 'cross',
  needs: v090infer,
  run: (c) => {
    c.v.setMeasureSnap({ edges: true, inference: true });
    return measureClicks(c, ['mouse']);
  },
};

const walkValues: ValueSet = {
  // 중력·부딪힘 걷기: 걸음마다 대상점(눈 앞)·거리
  name: 'base-walk-path',
  data: 'base',
  needs: all(v080, fn('setNavigation', 'walkBy')),
  run: ({ v }) => {
    const out: unknown[] = [];
    const rec = (): void => {
      const cam = v.getCamera();
      out.push([r10s(cam.target), r10(cam.distance)]);
    };
    standOnPlate(v);
    rec();
    // 상자 앞면으로(부딪힘) → 오른쪽으로 상자를 벗어나 앞으로(판 위) → 판 밖으로(아래 바닥 없음)
    for (let i = 0; i < 4; i++) {
      v.walkBy(12, 0);
      rec();
    }
    for (let i = 0; i < 6; i++) {
      v.walkBy(4, 15);
      rec();
    }
    for (let i = 0; i < 8; i++) {
      v.walkBy(30, 0);
      rec();
    }
    return out;
  },
};

/**
 * 0.10.0 붙잡기 한도: 앱 점 수천 개에 차례 값을 두고 한도를 바꾸며 잰 측정이, 한도 안 점만 다시 준 목록(0.9.1 앱의 slice)과 같은지.
 * 값은 한도마다 [한도로 잰 결과, 다시 준 목록과 같은지]. 묶음 행렬로 옮긴 묶음도 든다
 */
function limitValues(d: 'base' | 'off'): ValueSet {
  return {
    name: `${d}-measure-limit`,
    data: d,
    needs: fn('setMeasureSnapLimit', 'setItemMatrix'),
    run: (c) => {
      c.v.setItemMatrix('작은 상자 1', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 30, 1]);
      // 차례: 번호의 두 배(뒤쪽 300개는 거꾸로), 열한 번째마다 차례 없음(늘 후보)
      const pts: (ReturnType<typeof manySnapPoints>[number] & { order?: number })[] = manySnapPoints(c).map((p, i, a) =>
        i % 11 === 10 ? p : { ...p, order: i < a.length - 300 ? i * 2 : (a.length - i) * 2 },
      );
      // 누를 자리: 격자(measureClicks)와 앱 점 열세 개마다 하나의 화면 자리 바로 옆(묶음 행렬로 옮긴 점은 옮긴 자리)
      const spots: { x: number; y: number }[] = [];
      for (let i = 0; i < pts.length; i += 13) {
        const p = pts[i]!;
        const s = c.at(p.id === '작은 상자 1' ? [p.point[0]!, p.point[1]!, p.point[2]! + 30] : p.point);
        if (s) spots.push({ x: s.x + 1.5, y: s.y - 1 });
      }
      const run = (): unknown[] => {
        const res: unknown[] = [];
        const off = c.v.onMeasure((m: any) => res.push(m ? [r10s(m.a), r10s(m.b), r10(m.distance), m.snapA ?? null, m.snapB ?? null] : null));
        // 앞 차례의 measureClicks가 남긴 모드·윤곽선 고르기를 처음으로
        c.v.setRenderMode('shaded');
        c.v.setPickEdges(false);
        c.v.setMeasureMode(true);
        for (const s of spots) c.click(s.x, s.y);
        c.v.setMeasureMode(false);
        off();
        return [...res, ...measureClicks(c, ['mouse'])];
      };
      const out: unknown[] = [];
      for (const lim of [0, 1500, 4000, 7000, null]) {
        c.v.setMeasureSnap({ points: pts });
        c.v.setMeasureSnapLimit(lim);
        const a = run();
        c.v.setMeasureSnap({ points: pts.filter((p) => lim === null || p.order === undefined || p.order < lim) });
        const b = run();
        out.push([lim, a, JSON.stringify(a) === JSON.stringify(b)]);
      }
      return out;
    },
  };
}

/** 측정 결과 한 줄(0.10.0 방향·잠금까지 — 없는 판·없는 필드는 null) */
const lockRow = (m: any): unknown[] => [
  r10s(m.a),
  r10s(m.b),
  r10(m.distance),
  m.snapA ?? null,
  m.snapB ?? null,
  m.axisB ?? null,
  r10s(m.directionB),
  m.lockedB ?? null,
];

/**
 * 0.10.0 추론 잠금 값: 상자 구석 셋에서 (1) 앱 단추 꼴 축 잠금(setMeasureInferenceLock('x'·'y'·'z'))으로 여러 자리를 찍은 결과,
 * (2) Z축 방향을 보다가 Shift를 누른 채 찍은 결과(작은 상자 구석·구 쪽·빈 곳), (3) 잠금을 푼 뒤 같은 자리. 공구 경로는 숨긴다
 */
function lockValues(d: 'base' | 'off'): ValueSet {
  return {
    name: `${d}-measure-lock`,
    data: d,
    needs: v0100lock,
    run: (c) => {
      const { v } = c;
      const res: unknown[] = [];
      const off = v.onMeasure((m: any) => m && res.push(lockRow(m)));
      v.setGroupVisible('공구 경로', false);
      v.setMeasureMode(true);
      v.setMeasureSnap({ inference: { axes: true, lock: true } });
      const targets = [
        [156, -36, 12],
        [186, -36, 12],
        [0, 80, 40],
        [190, 40, 70],
        [60, 40, 0],
        [-15, 100, 60],
      ];
      // 구석(누를 화소 어긋남은 상자 안쪽으로)과 Z축 방향 미리 보기 자리(다른 꼭짓점이 겹치지 않는 높이)
      for (const { corner, dx, dy, up } of [
        { corner: [120, 0, 40], dx: -1, dy: 1, up: 55 },
        { corner: [0, 0, 40], dx: 1, dy: 1, up: 70 },
        { corner: [120, 80, 40], dx: -1, dy: 1, up: 50 },
      ]) {
        const a = c.at(c.world(corner));
        const z = c.at(c.world([corner[0]!, corner[1]!, corner[2]! + up]));
        if (!a || !z) continue;
        for (const axis of ['x', 'y', 'z', true] as const)
          for (const t of targets) {
            const q = c.at(c.world(t));
            if (!q) continue;
            v.clearMeasure();
            c.click(a.x + dx, a.y + dy);
            // true: 그 축 방향을 먼저 보고(미리 보기) 그 방향을 잠근다
            if (axis === true) {
              c.hover(z.x + 5, z.y - 2);
              v.renderNow();
            }
            res.push(['lock', axis, v.measurePointCount, v.setMeasureInferenceLock(axis)]);
            c.click(q.x + 1.5, q.y - 1);
            res.push(['after', v.measureInferenceLock]);
          }
        // Shift: Z축 방향 미리 보기 → Shift를 누른 채 옮겨 찍기, 떼고 같은 자리
        for (const t of targets) {
          const q = c.at(c.world(t));
          if (!q) continue;
          for (const sh of [true, false]) {
            v.clearMeasure();
            c.click(a.x + dx, a.y + dy);
            c.hover(z.x + 5, z.y - 2);
            v.renderNow();
            const h0 = v.measureHoverSnap;
            c.hover(q.x + 1.5, q.y - 1, 'mouse', sh);
            v.renderNow();
            const h = v.measureHoverSnap;
            res.push(['hover', sh, h0?.snap ?? null, h ? [r10s(h.point), h.snap, h.axis ?? null, h.locked ?? null, r10s(h.from), h.fromSnap ?? null] : null]);
            c.click(q.x + 1.5, q.y - 1, 'mouse', sh);
          }
        }
      }
      // 커서가 캔버스를 떠난 뒤(앱 단추를 마우스로 누를 때) true는 마지막으로 본 방향 추론을 잠근다
      v.clearMeasure();
      const a = c.at(c.world([120, 0, 40]));
      const z = c.at(c.world([120, 0, 95]));
      if (a && z) {
        c.click(a.x - 1, a.y + 1);
        c.hover(z.x + 5, z.y - 2);
        v.renderNow();
        v.canvas.dispatchEvent(new PointerEvent('pointerleave', { pointerId: 1, pointerType: 'mouse' }));
        res.push(['leave', v.measureHoverSnap, v.setMeasureInferenceLock(true), v.measureInferenceLock?.axis ?? null]);
      }
      // 잠근 채 측정 모드를 끄면 풀린다
      v.clearMeasure();
      if (a) c.click(a.x - 1, a.y + 1);
      res.push(['off', v.setMeasureInferenceLock('z'), v.measureInferenceLock?.axis ?? null]);
      v.setMeasureMode(false);
      res.push(['off', v.measureInferenceLock]);
      off();
      return res;
    },
  };
}

/**
 * 0.10.0 나란함 값: 상자 위 구석 셋에서 엇갈린 선분 하나를 지나간 뒤 그와 나란한 여러 거리(앞·뒤)를 미리 보고 찍은 결과.
 * 나란함만 켠 것과 축도 켠 것 둘 다
 */
const parallelValues: ValueSet = {
  name: 'cross-measure-parallel',
  data: 'cross',
  needs: v0100lock,
  run: (c) => {
    const { v } = c;
    const res: unknown[] = [];
    const off = v.onMeasure((m: any) => m && res.push(lockRow(m)));
    v.setGroupVisible('공구 경로', false);
    v.setMeasureMode(true);
    const L = Math.hypot(100, 60);
    for (const axes of [true, false]) {
      v.setMeasureSnap({ inference: { axes, parallel: true } });
      for (const [ref, e] of [
        [
          [35, 25, 40.5],
          [100 / L, 60 / L],
        ],
        [
          [85, 25, 40.5],
          [100 / L, -60 / L],
        ],
      ] as const)
        for (const { corner, dx, dy } of [
          { corner: [120, 0, 40], dx: -1, dy: 1 },
          { corner: [0, 0, 40], dx: 2, dy: 0 },
          { corner: [120, 80, 40], dx: -1, dy: 1 },
        ])
          for (const t of [-70, -40, 25, 45, 80]) {
            const a = c.at(corner);
            const r = c.at(ref);
            const p = c.at([corner[0]! + e[0] * t, corner[1]! + e[1] * t, corner[2]!]);
            if (!a || !r || !p) continue;
            v.clearMeasure();
            c.click(a.x + dx, a.y + dy);
            c.hover(r.x, r.y);
            v.renderNow();
            c.hover(p.x + 3, p.y + 2);
            v.renderNow();
            const h = v.measureHoverSnap;
            res.push(['hover', v.measurePointCount, h ? [r10s(h.point), h.snap, r10s(h.direction), h.edge ? h.edge.map(r10s) : null] : null]);
            c.click(p.x + 3, p.y + 2);
          }
    }
    off();
    return res;
  },
};

/**
 * 기본 동작이 그대로인지(0.9.1과 견준다): 0.10.0 선택을 켜지 않고 Shift를 누른 채 미리 보고 찍어도 0.9.1과 같은 결과 —
 * 축 붙잡기(상자 구석 셋 × 방향)와 추론 모두(true)의 격자 누르기
 */
const shiftOffValues: ValueSet = {
  name: 'base-measure-shift-off',
  data: 'base',
  needs: v091axis,
  run: (c) => {
    const { v, w, h } = c;
    const res: unknown[] = [];
    const off = v.onMeasure((m: any) => res.push(m ? [r10s(m.a), r10s(m.b), r10(m.distance), m.snapA ?? null, m.snapB ?? null, m.axisA ?? null, m.axisB ?? null] : null));
    v.setGroupVisible('공구 경로', false);
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { axes: true } });
    for (const corner of [
      [120, 0, 40],
      [0, 0, 40],
    ])
      for (const t of [[0, 0, 50], [30, 0, 0], [0, -25, 0], [36, -36, -28]]) {
        const a = c.at(c.world(corner));
        const z = c.at(c.world([corner[0]!, corner[1]!, corner[2]! + 50]));
        const q = c.at(c.world(corner.map((x, i) => x + t[i]!)));
        if (!a || !z || !q) continue;
        c.click(a.x - 1, a.y + 1);
        c.hover(z.x + 4, z.y - 2);
        v.renderNow();
        c.hover(q.x + 2, q.y - 1, 'mouse', true);
        v.renderNow();
        c.click(q.x + 2, q.y - 1, 'mouse', true);
      }
    v.setGroupVisible('공구 경로', true);
    v.setMeasureSnap({ edges: true, inference: true });
    for (let j = 0; j < 8; j++)
      for (let i = 0; i < 9; i++) {
        c.hover(((i + 0.5) * w) / 9, ((j + 0.5) * h) / 8, 'mouse', true);
        v.renderNow();
        c.click(((i + 0.5) * w) / 9, ((j + 0.5) * h) / 8, 'mouse', true);
      }
    off();
    return res;
  },
};

/**
 * 앱이 고른 것마다 더하는 점(pointsFor)을 고른 점에 따라 정하는 꼴(NC 보정 경로·판재 요소처럼 가장 가까운 요소를 찾는 앱): 고른 점을 4 단위 격자로
 * 내린 점과 고른 묶음 번호로 정한 점. calls에 부른 횟수를 센다
 */
function pickPoints(c: Ctx, calls: { n: number }) {
  return (pick: any) => {
    calls.n++;
    const p = pick.point as number[];
    const g = p.map((x) => Math.round(x / 4) * 4);
    return [
      { point: g, kind: 'point' as const },
      { point: c.world([pick.raw % 2 ? 60 : 120, 40, 40]), kind: 'center' as const },
    ];
  };
}

/** 미리 본 자리에서 누르기(같은 자리 — 0.10.0은 pointsFor를 다시 부르지 않는다): 격자 자리마다 미리 보기·그리기·누르기 */
function hoverClicks(c: Ctx, step: () => void = () => undefined): unknown[] {
  const { v, w, h } = c;
  const res: unknown[] = [];
  const off = v.onMeasure((m: any) => res.push(m ? [r10s(m.a), r10s(m.b), r10(m.distance), m.snapA ?? null, m.snapB ?? null] : null));
  for (const mode of ['shaded', 'wireframe']) {
    v.setRenderMode(mode as never);
    v.setMeasureMode(true);
    for (let j = 0; j < 9; j++)
      for (let i = 0; i < 10; i++) {
        const x = ((i + 0.5) * w) / 10, y = ((j + 0.5) * h) / 9;
        c.hover(x, y);
        v.renderNow();
        const hv = v.measureHoverSnap;
        res.push(hv ? [r10s(hv.point), hv.snap] : null);
        step();
        c.click(x, y);
      }
    v.setMeasureMode(false);
  }
  off();
  return res;
}

/**
 * pointsFor 값(0.9.1과 견준다): 고른 점에 따라 달라지는 앱 점으로 미리 보고 같은 자리를 누른 결과. 0.10.0은 누를 때 미리 보기의 결과를 다시 쓰므로
 * 같은 값이 나와야 한다
 */
function pointsForValues(d: 'base' | 'off'): ValueSet {
  return {
    name: `${d}-measure-points-for`,
    data: d,
    needs: all(v080, fn('setMeasureSnap')),
    run: (c) => {
      c.v.setMeasureSnap({ midpoints: true, pointsFor: pickPoints(c, { n: 0 }) });
      return hoverClicks(c);
    },
  };
}

/** 0.10.0 pointsFor 부른 횟수: 미리 보기·누르기와, 그 사이 붙잡기 한도를 바꿔 같은 자리에서 다시 구할 때(새 장면) */
const pointsForCallValues: ValueSet = {
  name: 'base-measure-points-for-calls',
  data: 'base',
  needs: fn('setMeasureSnapLimit'),
  run: (c) => {
    // 0.9.1은 미리 보기와 누르기에서 한 번씩(이 자료에서 52번), 한도를 바꿔 다시 구하면 한 번 더 불렀다. 0.10.0은 미리 보기에서만(26번)
    const calls = { n: 0 };
    c.v.setMeasureSnap({ midpoints: true, pointsFor: pickPoints(c, calls), points: [{ point: [60, 40, 40], kind: 'center', order: 1 }] });
    hoverClicks(c);
    const n1 = calls.n;
    calls.n = 0;
    let k = 0;
    const withLimit = hoverClicks(c, () => {
      c.v.setMeasureSnapLimit(k++ % 2 ? 2 : 1);
      c.v.renderNow();
    });
    return [n1, calls.n, withLimit];
  },
};

/** 0.10.0 추론 다섯 가지를 모두 켠 격자 누르기(엇갈린 선분 자료 — 나란함 기준 선분이 계속 바뀐다) */
const crossAllValues: ValueSet = {
  name: 'cross-measure-infer-all',
  data: 'cross',
  needs: v0100lock,
  run: (c) => {
    c.v.setMeasureSnap({ edges: true, inference: { intersections: true, perpendicular: true, axes: true, parallel: true, lock: true } });
    return measureClicks(c, ['mouse']);
  },
};

/** 잠금 상태 한 줄(없으면 null) */
const lockState = (l: any): unknown[] | null => (l ? [l.kind, l.axis ?? null, r10s(l.direction), l.edge ? l.edge.map(r10s) : null, l.source ?? null] : null);

/**
 * 0.12.0 선분 방향 잠금 값: 첫 점(모서리 끝)마다 다른 점(끝점·가운데 점·교차점·선 위)을 가리켜 미리 보기·잠글 방향(measureHoverLock)을 남기고,
 * Shift를 누른 채 같은 자리 → 잠금 상태, 선 밖으로 옮겨 찍은 결과. 첫 점 자리·첫 점을 지나지 않는 모서리의 끝은 잠그지 않아야 한다.
 * 마지막에 커서가 캔버스를 떠난 뒤 setMeasureInferenceLock(true)(마지막으로 본 방향)
 */
function edgeLockRun(c: Ctx, firsts: number[][], targets: number[][], snap: Record<string, unknown>): unknown[] {
  const { v } = c;
  const res: unknown[] = [];
  const off = v.onMeasure((m: any) => m && res.push(lockRow(m)));
  v.setGroupVisible('공구 경로', false);
  v.setGroupVisible('구멍', false);
  v.setMeasureMode(true);
  v.setMeasureSnap(snap);
  for (const first of firsts) {
    const a = c.at(c.world(first));
    if (!a) continue;
    for (const t of targets) {
      const q = c.at(c.world(t));
      if (!q) continue;
      v.clearMeasure();
      c.click(a.x, a.y);
      c.hover(q.x, q.y);
      v.renderNow();
      const h = v.measureHoverSnap;
      const p0 = v.measurePoints[0];
      res.push(['hover', first, t, p0 ? [r10s(p0.point), p0.snap] : null, h ? [r10s(h.point), h.snap, h.axis ?? null] : null, lockState(v.measureHoverLock)]);
      c.hover(q.x, q.y, 'mouse', true);
      v.renderNow();
      res.push(['shift', lockState(v.measureInferenceLock)]);
      c.hover(q.x + 23, q.y - 31, 'mouse', true);
      v.renderNow();
      const g = v.measureHoverSnap;
      res.push(['moved', g ? [r10s(g.point), g.snap, g.locked ?? null, r10s(g.from)] : null]);
      c.click(q.x + 23, q.y - 31, 'mouse', true);
      c.hover(q.x + 23, q.y - 31);
    }
  }
  // 첫 점 → 둘째 대상(점 붙잡기)을 본 뒤 캔버스를 떠나 앱 단추로
  const a = c.at(c.world(firsts[0]!)), q = c.at(c.world(targets[1]!));
  if (a && q) {
    v.clearMeasure();
    c.click(a.x, a.y);
    c.hover(q.x, q.y);
    v.renderNow();
    v.canvas.dispatchEvent(new PointerEvent('pointerleave', { pointerId: 1, pointerType: 'mouse' }));
    v.renderNow();
    res.push(['leave', v.measureHoverSnap, lockState(v.measureHoverLock), v.setMeasureInferenceLock(true), lockState(v.measureInferenceLock)]);
  }
  v.setMeasureMode(false);
  off();
  return res;
}

/** 0.12.0 선분 방향 잠금: 상자 윗면 네 구석에서 다른 구석·모서리 가운데 점·아래 구석(그물 윤곽선 — 모두 축 방향) */
function edgeLockValues(d: 'base' | 'off'): ValueSet {
  const top = [
    [0, 0, 40],
    [120, 0, 40],
    [120, 80, 40],
    [0, 80, 40],
  ];
  return {
    name: `${d}-measure-edge-lock`,
    data: d,
    needs: v0120lock,
    run: (c) =>
      edgeLockRun(c, top, [...top, [60, 0, 40], [120, 40, 40], [60, 80, 40], [0, 40, 40], [120, 0, 0], [0, 0, 0], [120, 0, 17]], {
        midpoints: true,
        edges: true,
        inference: { intersections: true, perpendicular: true, axes: true, lock: true },
      }),
  };
}

/** 0.12.0 선분 방향 잠금(대각): 엇갈린 선분 네 끝에서 맞은편 끝·가운데(가운데 점 = 교차점)·선 위·다른 선분 끝 */
const crossEdgeLockValues: ValueSet = {
  name: 'cross-measure-edge-lock',
  data: 'cross',
  needs: v0120lock,
  run: (c) => {
    const ends = [
      [10, 10, 40.5],
      [110, 70, 40.5],
      [10, 70, 40.5],
      [110, 10, 40.5],
    ];
    const out: unknown[] = [];
    for (const snap of [
      { midpoints: true, inference: { intersections: true, axes: true, lock: true } },
      { inference: { intersections: true, lock: true } },
      { inference: { axes: true, parallel: true, lock: true } },
    ])
      out.push(edgeLockRun(c, ends, [...ends, [60, 40, 40.5], [35, 25, 40.5], [85, 25, 40.5]], snap));
    return out;
  },
};

/**
 * 0.12.0 앱이 정한 방향 잠금(setMeasureInferenceLock({ direction, edge?, kind? })): 돌려준 값·잠금 상태, 상자 구석에서 여러 자리를 찍은 결과와 찍은 점(measurePoints),
 * 거리 글상자 자리(measureLabelRect). 잘못된 값은 false
 */
function directionLockValues(d: 'base' | 'off'): ValueSet {
  return {
    name: `${d}-measure-direction-lock`,
    data: d,
    needs: v0120lock,
    run: (c) => {
      const { v } = c;
      const res: unknown[] = [];
      const off = v.onMeasure((m: any) => m && res.push(lockRow(m)));
      v.setGroupVisible('공구 경로', false);
      v.setMeasureMode(true);
      v.setMeasureSnap({ inference: { axes: true, lock: true } });
      // 판마다 API가 다를 수 있어 느슨하게(잘못된 값도 넣어 본다)
      const inputs: any[] = [
        { direction: [1, 1, 0] },
        { direction: [0, 0, -2] },
        { direction: [3, -4, 5], kind: 'perpendicular' },
        { edge: [c.world([0, 0, 40]), c.world([120, 80, 40])] },
        { direction: [1, 0, 0], kind: 'parallel', edge: [c.world([0, 80, 40]), c.world([120, 80, 40])] },
        { direction: [3, 4, 0], kind: 'axis' },
        { direction: [0, 0, 0] },
        { edge: [c.world([5, 5, 5]), c.world([5, 5, 5])] },
      ];
      const targets = [
        [156, -36, 12],
        [190, 40, 70],
        [-15, 100, 60],
      ];
      for (const corner of [
        [120, 0, 40],
        [0, 80, 40],
      ]) {
        const a = c.at(c.world(corner));
        if (!a) continue;
        inputs.forEach((input, i) => {
          for (const t of targets) {
            const q = c.at(c.world(t));
            if (!q) continue;
            v.clearMeasure();
            res.push(['set', i, v.setMeasureInferenceLock(input), lockState(v.measureInferenceLock)]);
            c.click(a.x, a.y);
            c.hover(q.x + 1.5, q.y - 1);
            v.renderNow();
            const h = v.measureHoverSnap;
            const r = v.measureLabelRect;
            res.push(['hover', h ? [r10s(h.point), h.snap, h.locked ?? null, r10s(h.from)] : null, r ? [r.x, r.y, r.width, r.height].map(r10) : null]);
            c.click(q.x + 1.5, q.y - 1);
            res.push(['points', v.measurePoints.map((p: any) => [r10s(p.point), p.snap, p.axis ?? null, r10s(p.direction), p.locked ?? null]), v.measureInferenceLock]);
          }
        });
      }
      v.setMeasureMode(false);
      v.renderNow();
      res.push(['off', v.measurePoints, v.measureLabelRect]);
      off();
      return res;
    },
  };
}

// ───────────── 0.14.0 측정 붙잡기 다듬기 ─────────────
/** 거친 원 둘(arc 자료): 상자 위에 뜬 원 꺾은선(선분 묶음, 원본 번호 100 + k)과 상자 앞 바닥의 원판 그물(윤곽선 = 둘레). 12토막, 꼭짓점은 start° + 30°·k */
type Arc = { id: string; c: number[]; r: number; start: number };
const ARC_RING: Arc = { id: '원', c: [60, 40, 60], r: 30, start: 0 };
const ARC_DISK: Arc = { id: '원판', c: [60, -28, 0], r: 20, start: 15 };
const ARC_N = 12;
const arcAt = (k: Arc, i: number): number[] => {
  const a = ((k.start + (i % ARC_N) * 30) * Math.PI) / 180;
  return [k.c[0]! + k.r * Math.cos(a), k.c[1]! + k.r * Math.sin(a), k.c[2]!];
};
function arcRing(): LineSet3d {
  const P: number[] = [];
  for (let i = 0; i < ARC_N; i++) P.push(...arcAt(ARC_RING, i), ...arcAt(ARC_RING, i + 1));
  return {
    id: ARC_RING.id,
    positions: new Float32Array(P),
    segmentIds: new Uint32Array(Array.from({ length: ARC_N }, (_, i) => 100 + i)),
    color: [0.4, 0.95, 0.6, 1],
    width: 1.5,
    group: '원',
  };
}
function arcDisk(): Mesh3d {
  const pts = Array.from({ length: ARC_N }, (_, i) => arcAt(ARC_DISK, i));
  const idx: number[] = [];
  const E: number[] = [];
  for (let i = 0; i < ARC_N; i++) {
    idx.push(0, 1 + i, 1 + ((i + 1) % ARC_N));
    E.push(...pts[i]!, ...pts[(i + 1) % ARC_N]!);
  }
  return {
    id: ARC_DISK.id,
    name: ARC_DISK.id,
    positions: new Float32Array([...ARC_DISK.c, ...pts.flat()]),
    indices: new Uint32Array(idx),
    color: [0.85, 0.75, 0.4, 1],
    edges: new Float32Array(E),
    group: '원',
  };
}

/** 0.14.0 붙잡기 다듬기(setMeasureSnap({ refine }))가 있는 판인지 — refine만 준 선택이 남는다(0.13.0은 아무것도 켜지 않은 선택이라 끈다) */
const v0140refine: Need = (v, c) => {
  const why = v0120lock(v, c);
  if (why) return why;
  v.setMeasureSnap({ refine: () => null });
  const ok = typeof v.measureSnap?.refine === 'function';
  v.setMeasureSnap(null);
  return ok ? null : '이 판에 없는 선택: 0.14.0 붙잡기 다듬기(setMeasureSnap({ refine }))';
};

/**
 * 0.14.0 붙잡기 다듬기 값(arc 자료): 앱이 정확한 원 위로 다듬는 함수로 두 원의 토막 가운데 점·토막 위 점을 가리키고,
 * 상자 구석(첫 점)에서 원으로 내린 수직 발을 찍은 결과(원 위인지, 거리가 정확한 값과 1e-9 안인지, 꺾은선 발까지 거리).
 * 같은 순서를 refine 없이·null을 돌려주는 함수·먼 점을 돌려주는 함수(버림)로 되풀이해 refine 없이와 같은지, 잠금 중에 부르지 않는지,
 * 같은 자리 미리 보기 뒤 누르기에서 다시 부르지 않는지
 */
const refineValues: ValueSet = {
  name: 'arc-measure-refine',
  data: 'arc',
  needs: v0140refine,
  run: (c) => {
    const { v } = c;
    v.setGroupVisible('공구 경로', false);
    v.setGroupVisible('구멍', false);
    v.setMeasureMode(true);
    const f32 = (p: readonly number[]): number[] => Array.from(new Float32Array(p));
    const vtx = (k: Arc, i: number): number[] => f32(arcAt(k, i));
    const lerp = (a: readonly number[], b: readonly number[], t: number): number[] => a.map((x, j) => x + (b[j]! - x) * t);
    const dist3 = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
    const onArc = (k: Arc, p: readonly number[]): boolean => Math.abs(dist3(p, k.c) - k.r) < 1e-9 && Math.abs(p[2]! - k.c[2]!) < 1e-9;
    /** 원 평면 위로 지름 방향 */
    const radial = (k: Arc, p: readonly number[]): number[] => {
      const dx = p[0]! - k.c[0]!, dy = p[1]! - k.c[1]!, l = Math.hypot(dx, dy);
      return [k.c[0]! + (k.r * dx) / l, k.c[1]! + (k.r * dy) / l, k.c[2]!];
    };
    const arcOf = (id: string): Arc | null => (id === ARC_RING.id ? ARC_RING : id === ARC_DISK.id ? ARC_DISK : null);
    const count = { n: 0 };
    /**
     * 앱 쪽 정확한 원: 토막 위 점 = 광선과 원 평면의 만남을 원 위로, 가운데 점 = 토막 현 가운데를 원 위로, 수직 발 = 첫 점의 지름 방향 두 점 중 코어 점에 가까운 것.
     * 호출 수는 0.14.0이 넘기던 것만 센다 — 0.15.0의 열린 후보(open)·교차점(intersection) 호출은 arc2-measure-open에서 따로 본다
     * (그래서 이 값 묶음은 0.14.0과 0.15.0이 같아야 한다: 0.14.0 종류의 호출과 결과가 그대로인지)
     */
    const exact = (i: any): number[] | null => {
      if (i.kind === 'intersection') return null;
      if (!i.open) count.n++;
      const k = arcOf(i.segment.id);
      if (!k) return null;
      if (i.kind === 'onEdge') {
        const o = i.ray.origin, d = i.ray.dir;
        const s = (k.c[2]! - o[2]) / d[2];
        return radial(k, [o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s]);
      }
      if (i.kind === 'midpoint') return radial(k, lerp(i.segment.ends[0], i.segment.ends[1], 0.5));
      const q = radial(k, i.first);
      const q2 = [2 * k.c[0]! - q[0]!, 2 * k.c[1]! - q[1]!, q[2]!];
      return dist3(q, i.point) <= dist3(q2, i.point) ? q : q2;
    };
    /** 꺾은선 발: 첫 점의 지름 방향이 지나는 토막으로 내린 수직 발(코어가 붙잡는 점) */
    const coreFoot = (k: Arc, P: readonly number[]): number[] => {
      const ang = ((((Math.atan2(P[1]! - k.c[1]!, P[0]! - k.c[0]!) * 180) / Math.PI - k.start) % 360) + 360) % 360;
      const i = Math.floor(ang / 30);
      const a = vtx(k, i), b = vtx(k, i + 1);
      const e = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
      const t = ((P[0]! - a[0]!) * e[0]! + (P[1]! - a[1]!) * e[1]! + (P[2]! - a[2]!) * e[2]!) / (e[0]! ** 2 + e[1]! ** 2 + e[2]! ** 2);
      return lerp(a, b, t);
    };
    const hoverRow = (k: Arc, p: readonly number[]): unknown[] => {
      const q = c.at(c.world(p));
      if (!q) return ['hover', k.id, r10s(p), null];
      c.hover(q.x, q.y);
      v.renderNow();
      const h = v.measureHoverSnap;
      return ['hover', k.id, r10s(p), h ? [h.snap, !!h.refined, r10s(h.point), onArc(k, h.point), r10s(h.direction)] : null];
    };
    /**
     * 수직 발의 첫 점: 상자 윗면(z 40)에서 원 중심의 지름 방향이 한 토막의 가운데 쪽인 자리(그 토막 안에 발이 생기게).
     * 고리는 토막 가운데가 15° + 30°·k, 원판은 30°·k
     */
    const PERP: [Arc, number[]][] = [
      [ARC_RING, [ARC_RING.c[0]! + 45 * Math.cos((15 * Math.PI) / 180), ARC_RING.c[1]! + 45 * Math.sin((15 * Math.PI) / 180), 40]],
      [ARC_RING, [ARC_RING.c[0]! + 35 * Math.cos((258 * Math.PI) / 180), ARC_RING.c[1]! + 35 * Math.sin((258 * Math.PI) / 180), 40]],
      [ARC_DISK, [ARC_DISK.c[0]! + 50 * Math.cos((62 * Math.PI) / 180), ARC_DISK.c[1]! + 50 * Math.sin((62 * Math.PI) / 180), 40]],
      [ARC_DISK, [ARC_DISK.c[0]! + 45 * Math.cos((118 * Math.PI) / 180), ARC_DISK.c[1]! + 45 * Math.sin((118 * Math.PI) / 180), 40]],
    ];
    const sweep = (opt: Record<string, unknown>): unknown[] => {
      const rows: unknown[] = [];
      // 토막 가운데: 가운데 점 붙잡기를 켜면 가운데 점(midpoint), 끄면 붙잡지 않은 토막 위 점(onEdge — 끝점에서 붙잡기 거리 밖)
      for (const midpoints of [true, false]) {
        v.setMeasureSnap({ ...opt, midpoints });
        for (const k of [ARC_RING, ARC_DISK])
          for (const i of [0, 3, 6, 9]) {
            v.clearMeasure();
            rows.push(hoverRow(k, lerp(vtx(k, i), vtx(k, i + 1), 0.5)));
          }
      }
      v.setMeasureSnap({ ...opt, midpoints: false });
      for (const [k, corner] of PERP) {
        v.clearMeasure();
        const a = c.at(c.world(corner));
        if (!a) {
          rows.push(null);
          continue;
        }
        c.click(a.x, a.y);
        const P = v.measurePoints[0]?.point;
        if (!P) {
          rows.push(['first', null]);
          continue;
        }
        const foot = coreFoot(k, P);
        rows.push(hoverRow(k, foot));
        const q = c.at(c.world(foot))!;
        c.click(q.x, q.y);
        const m = v.measurement();
        const want = Math.hypot(Math.hypot(P[0] - k.c[0]!, P[1] - k.c[1]!) - k.r, P[2] - k.c[2]!);
        rows.push([
          'measure',
          r10s(P),
          m ? [r10s(m.b), r10(m.distance), m.snapB ?? null, r10s(m.directionB)] : null,
          v.measurePoints.map((p: any) => [p.snap, !!p.refined]),
          r10(want),
          !!m && Math.abs(m.distance - want) < 1e-9,
          r10(dist3(P, foot)),
        ]);
      }
      return rows;
    };
    const opt = { edges: true, inference: { intersections: true, perpendicular: true, axes: true, lock: true } };
    const out: unknown[] = [];
    const refined = sweep({ ...opt, refine: exact });
    out.push(['refined', refined], ['calls', count.n]);
    const plain = sweep(opt);
    const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
    out.push(['refined-differs', !same(refined, plain)]);
    out.push(['null-same', same(sweep({ ...opt, refine: () => null }), plain)]);
    // 원의 맞은쪽(지름만큼 — 붙잡기 거리 밖)을 돌려주면 모두 버린다
    out.push([
      'far-same',
      same(
        sweep({
          ...opt,
          refine: (i: any) => {
            const k = arcOf(i.segment.id) ?? { c: i.point };
            return [2 * k.c[0] - i.point[0], 2 * k.c[1] - i.point[1], i.point[2]];
          },
        }),
        plain,
      ),
    ]);
    // 잠금 중에는 부르지 않는다(잠근 Z선 위), 풀면 다시. 같은 자리 미리 보기 뒤 누르기는 다시 부르지 않는다
    v.setMeasureSnap({ ...opt, midpoints: true, refine: exact });
    v.clearMeasure();
    const a = c.at(c.world([120, 80, 40]));
    const mid = lerp(vtx(ARC_RING, 3), vtx(ARC_RING, 4), 0.5);
    if (a) {
      c.click(a.x, a.y);
      const n0 = count.n;
      out.push(['lock', v.setMeasureInferenceLock('z'), hoverRow(ARC_RING, mid), count.n - n0]);
      v.setMeasureInferenceLock(false);
      const n1 = count.n;
      out.push(['unlock', hoverRow(ARC_RING, mid), count.n - n1]);
      const q = c.at(c.world(mid))!;
      const n2 = count.n;
      c.click(q.x, q.y);
      out.push(['click-same', count.n - n2, v.measurePoints.map((p: any) => [r10s(p.point), p.snap, !!p.refined])]);
    }
    return out;
  },
};

// ───────────── 0.15.0 열린 수직 발·교차점 다듬기 ─────────────
/** arc2 자료의 원: 중심·단위 법선·반지름·틀(u·v)·12토막 시작 각(도) */
type Circ = { id: string; c: number[]; n: number[]; r: number; u: number[]; v: number[]; start: number };
/** 상자 위에 뜬 원(z 60 평면, 중심 (60, 40), 반지름 30, 꼭짓점 15° + 30°·k — 0°는 토막 가운데) */
const C2_RING: Circ = { id: '고리', c: [60, 40, 60], n: [0, 0, 1], r: 30, u: [1, 0, 0], v: [0, 1, 0], start: 15 };
/** 세로 원(y 40 평면, 중심 (80, 40, 60), 반지름 10) — 고리와 (90, 40, 60) 한 점에서 만난다. 꺾은선끼리는 현의 처짐만큼 비켜 간다 */
const C2_UP: Circ = { id: '세로 원', c: [80, 40, 60], n: [0, 1, 0], r: 10, u: [1, 0, 0], v: [0, 0, 1], start: 15 };
const C2_X = [90, 40, 60];
/** 고리를 가로지르는 곧은 선분(z 60 평면, y 55) */
const C2_LINE = [
  [0, 55, 60],
  [120, 55, 60],
];
/** 첫 점(곧은 선분 '기준'의 끝): 고리 중심에서 20° 방향 80 mm — 그 방향 원 위 발은 꼭짓점 15°에서 5°라 둘레 토막으로 내린 꺾은선 발은 모두 토막 밖 */
const C2_FIRST = [60 + 80 * Math.cos((20 * Math.PI) / 180), 40 + 80 * Math.sin((20 * Math.PI) / 180), 60];
const circAt = (k: Circ, deg: number): number[] => {
  const a = (deg * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
  return [0, 1, 2].map((j) => k.c[j]! + k.r * (k.u[j]! * cs + k.v[j]! * sn));
};
function circLine(k: Circ): LineSet3d {
  const P: number[] = [];
  for (let i = 0; i < 12; i++) P.push(...circAt(k, k.start + i * 30), ...circAt(k, k.start + (i + 1) * 30));
  return { id: k.id, positions: new Float32Array(P), segmentIds: new Uint32Array(Array.from({ length: 12 }, (_, i) => 100 + i)), color: [0.4, 0.95, 0.6, 1], width: 1.5, group: '원' };
}
function arc2Lines(): LineSet3d[] {
  const F = C2_FIRST;
  return [
    circLine(C2_RING),
    circLine(C2_UP),
    { id: '가로선', positions: new Float32Array([...C2_LINE[0]!, ...C2_LINE[1]!]), segmentIds: new Uint32Array([7]), color: [0.95, 0.8, 0.4, 1], group: '원' },
    { id: '기준', positions: new Float32Array([...F, F[0]! + 12, F[1]! - 3, F[2]!]), color: [0.95, 0.5, 0.5, 1], group: '원' },
  ];
}

/** 0.15.0 열린 후보(토막 밖 수직 발·넓힌 교차점)가 있는 판인지 — 두 원이 만나는 자리를 가리켜 앱 함수가 open으로 불리는지 본다 */
const v0150open: Need = (v, c) => {
  const why = v0140refine(v, c);
  if (why) return why;
  v.setGroupVisible('공구 경로', false);
  v.setMeasureMode(true);
  let open = false;
  v.setMeasureSnap({ inference: { intersections: true }, refine: (i: any) => ((open ||= !!i.open), null) });
  const q = c.at(C2_X);
  if (q) {
    c.hover(q.x, q.y);
    v.renderNow();
  }
  v.setMeasureSnap(null);
  v.setMeasureMode(false);
  v.setGroupVisible('공구 경로', true);
  return open ? null : '이 판에 없는 동작: 0.15.0 열린 후보 다듬기(SnapRefineInput.open)';
};

/**
 * 0.15.0 열린 수직 발·교차점 다듬기 값(arc2 자료): 원 밖 멀리 있는 첫 점에서 원으로 내린 발(꺾은선 발은 토막 밖)을 가리키고 찍은 결과(원 위인지, 거리가 정확한 값과 1e-9 안인지),
 * 원과 곧은 선분의 교차점(꺾은선 교차점을 정확한 교차점으로), 두 원의 교차점(꺾은선끼리 비켜 가는 자리 — 넓힌 교차)을 가리키고 찍은 결과.
 * 같은 차례를 refine 없이·null·코어 점 그대로·맞은쪽 점으로 되풀이해 refine 없이와 같은지, 원을 따라 지나갈 때 미리 보기 한 번의 열린 후보 호출 수(한도 안)와
 * 같은 길을 다시 지나갈 때 0인지(기억), 잠금 중에는 부르지 않는지
 */
const openValues: ValueSet = {
  name: 'arc2-measure-open',
  data: 'arc2',
  needs: v0150open,
  run: (c) => {
    const { v } = c;
    v.setGroupVisible('공구 경로', false);
    v.setGroupVisible('구멍', false);
    v.setMeasureMode(true);
    const f32 = (p: readonly number[]): number[] => Array.from(new Float32Array(p));
    const sub = (a: readonly number[], b: readonly number[]): number[] => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
    const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    const cross = (a: readonly number[], b: readonly number[]): number[] => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
    const dist3 = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
    const lerp = (a: readonly number[], b: readonly number[], t: number): number[] => a.map((x, j) => x + (b[j]! - x) * t);
    const vtx = (k: Circ, i: number): number[] => f32(circAt(k, k.start + i * 30));
    const onC = (k: Circ, p: readonly number[]): boolean => Math.abs(dist3(p, k.c) - k.r) < 1e-9 && Math.abs(dot(sub(p, k.c), k.n)) < 1e-9;
    /** 원 평면 위로 내린 뒤 지름 방향 */
    const radial = (k: Circ, p: readonly number[]): number[] => {
      const d = sub(p, k.c), h = dot(d, k.n);
      const w = [d[0]! - h * k.n[0]!, d[1]! - h * k.n[1]!, d[2]! - h * k.n[2]!];
      const l = Math.hypot(w[0]!, w[1]!, w[2]!);
      return [0, 1, 2].map((j) => k.c[j]! + (k.r * w[j]!) / l);
    };
    /** 직선(o, d)과 원 */
    const lineCirc = (o: readonly number[], d: readonly number[], k: Circ): number[][] => {
      const dn = dot(d, k.n);
      if (Math.abs(dn) > 1e-12) {
        const t = dot(sub(k.c, o), k.n) / dn;
        const p = [0, 1, 2].map((j) => o[j]! + d[j]! * t);
        return Math.abs(dist3(p, k.c) - k.r) < 1e-9 ? [p] : [];
      }
      const w = sub(o, k.c);
      const A = dot(d, d), B = 2 * dot(w, d), D = B * B - 4 * A * (dot(w, w) - k.r * k.r);
      return D < 0 ? [] : [-1, 1].map((s) => (-B + s * Math.sqrt(D)) / (2 * A)).map((t) => [0, 1, 2].map((j) => o[j]! + d[j]! * t));
    };
    /** 다른 평면의 두 원: 두 평면의 교선과 첫 원의 만남 가운데 둘째 원 위인 것 */
    const circCirc = (a: Circ, b: Circ): number[][] => {
      const d = cross(a.n, b.n);
      const dd = dot(d, d);
      if (dd < 1e-24) return [];
      const ha = dot(a.n, a.c), hb = dot(b.n, b.c);
      const o = cross([0, 1, 2].map((j) => hb * a.n[j]! - ha * b.n[j]!), d).map((x) => -x / dd);
      return lineCirc(o, d, a).filter((p) => Math.abs(dist3(p, b.c) - b.r) < 1e-9);
    };
    const nearest = (ps: number[][], q: readonly number[]): number[] | null => ps.reduce<number[] | null>((m, p) => (!m || dist3(p, q) < dist3(m, q) ? p : m), null);
    const circOf = (id: string): Circ | null => (id === C2_RING.id ? C2_RING : id === C2_UP.id ? C2_UP : null);
    const calls = { all: 0, open: 0, intersection: 0 };
    /** 앱 쪽 정확한 원·곧은 선분 */
    const exact = (i: any): number[] | null => {
      calls.all++;
      if (i.open) calls.open++;
      if (i.kind === 'intersection') {
        calls.intersection++;
        const a = circOf(i.segment.id), b = i.other ? circOf(i.other.id) : null;
        if (a && b) return nearest(circCirc(a, b), i.point);
        const k = a ?? b;
        const isLine = i.segment.id === '가로선' || i.other?.id === '가로선';
        return k && isLine ? nearest(lineCirc(C2_LINE[0]!, sub(C2_LINE[1]!, C2_LINE[0]!), k), i.point) : null;
      }
      const k = circOf(i.segment.id);
      if (!k) return null;
      if (i.kind === 'onEdge') {
        const o = i.ray.origin, d = i.ray.dir;
        const t = dot(sub(k.c, o), k.n) / dot(d, k.n);
        return radial(k, [0, 1, 2].map((j) => o[j] + d[j] * t));
      }
      if (i.kind === 'midpoint') return radial(k, lerp(i.segment.ends[0], i.segment.ends[1], 0.5));
      const q = radial(k, i.first);
      const q2 = [0, 1, 2].map((j) => 2 * k.c[j]! - q[j]!);
      return dist3(q, i.point) <= dist3(q2, i.point) ? q : q2;
    };
    const hoverRow = (name: string, p: readonly number[], want: readonly number[] | null, k: Circ | null): unknown[] => {
      const q = c.at(p);
      if (!q) return [name, null];
      c.hover(q.x, q.y);
      v.renderNow();
      const h = v.measureHoverSnap;
      return [name, h ? [h.snap, !!h.refined, r10s(h.point), want ? dist3(h.point, want) < 1e-9 : null, k ? onC(k, h.point) : null, r10s(h.direction)] : null];
    };
    const clickAt = (p: readonly number[]): boolean => {
      const q = c.at(p);
      if (q) c.click(q.x, q.y);
      return !!q;
    };
    // 꺾은선 교차점: 고리 토막 0(15°–45°)과 곧은 선분
    const lineCore = (() => {
      const a = vtx(C2_RING, 0), b = vtx(C2_RING, 1), y = Math.fround(C2_LINE[0]![1]!);
      const t = (y - a[1]!) / (b[1]! - a[1]!);
      return lerp(a, b, t);
    })();
    const lineExact = [C2_RING.c[0]! + Math.sqrt(900 - 225), 55, 60];
    const sweep = (opt: Record<string, unknown>): unknown[] => {
      const rows: unknown[] = [];
      v.setMeasureSnap({ midpoints: true, inference: { perpendicular: true, intersections: true, axes: true, lock: true }, ...opt });
      // 1. 열린 수직 발
      v.clearMeasure();
      if (!clickAt(C2_FIRST)) return ['first', null];
      const A = v.measurePoints[0]?.point;
      if (!A) return ['first', null];
      const T = radial(C2_RING, A);
      rows.push(['first', r10s(A), v.measurePoints[0].snap], hoverRow('foot', T, T, C2_RING));
      clickAt(T);
      const m = v.measurement();
      const want = dist3(A, C2_RING.c) - C2_RING.r;
      rows.push(['foot-measure', m ? [r10s(m.b), r10(m.distance), m.snapB ?? null, Math.abs(m.distance - want) < 1e-9] : null, v.measurePoints.map((p: any) => [p.snap, !!p.refined])]);
      // 2. 원과 곧은 선분(꺾은선 교차점)·두 원(넓힌 교차), 첫 점에서 찍은 거리
      for (const [name, p, w, k] of [
        ['line-x', lineCore, lineExact, C2_RING],
        ['circles-x', C2_X, C2_X, C2_UP],
      ] as [string, number[], number[], Circ][]) {
        v.clearMeasure();
        rows.push(hoverRow(name, p, w, k));
        clickAt(C2_FIRST);
        clickAt(p);
        const mm = v.measurement();
        rows.push([`${name}-measure`, mm ? [r10s(mm.b), r10(mm.distance), mm.snapB ?? null] : null, v.measurePoints.map((q: any) => [q.snap, !!q.refined])]);
      }
      // 3. 원을 따라 지나가기(토막 가운데·꼭짓점 둘레, 첫 점에서)
      v.clearMeasure();
      clickAt(C2_FIRST);
      for (let i = 0; i < 12; i++)
        for (const t of [0.1, 0.5]) {
          const p = lerp(vtx(C2_RING, i), vtx(C2_RING, i + 1), t);
          rows.push(hoverRow(`ring-${i}-${t}`, p, null, C2_RING));
        }
      return rows;
    };
    const out: unknown[] = [];
    const refined = sweep({ refine: exact });
    out.push(['refined', refined], ['calls', { ...calls }]);
    const plain = sweep({});
    const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
    out.push(['refined-differs', !same(refined, plain)]);
    out.push(['null-same', same(sweep({ refine: () => null }), plain)]);
    out.push(['core-same', same(sweep({ refine: (i: any) => (i.open ? i.point : null) }), plain)]);
    // 고리 중심에 대해 맞은쪽 점(붙잡기 거리 밖)을 돌려주면 모두 버린다
    out.push(['far-same', same(sweep({ refine: (i: any) => [2 * C2_RING.c[0]! - i.point[0], 2 * C2_RING.c[1]! - i.point[1], i.point[2]] }), plain)]);
    // 호출 한도·기억: 원을 따라 지나갈 때 미리 보기 한 번의 열린 후보 호출 수, 같은 길을 다시 지나갈 때
    v.setMeasureSnap({ inference: { perpendicular: true, intersections: true }, refine: exact });
    v.clearMeasure();
    clickAt(C2_FIRST);
    const per: number[] = [];
    const path: number[][] = [];
    for (let i = 0; i < 12; i++) for (let t = 0; t < 1; t += 0.125) path.push(lerp(vtx(C2_RING, i), vtx(C2_RING, i + 1), t));
    for (const p of path) {
      const n = calls.open;
      const q = c.at(p);
      if (!q) continue;
      c.hover(q.x, q.y);
      v.renderNow();
      per.push(calls.open - n);
    }
    const n2 = calls.open;
    for (const p of path) {
      const q = c.at(p);
      if (!q) continue;
      c.hover(q.x, q.y);
      v.renderNow();
    }
    out.push(['per-move', Math.max(...per), per.reduce((s, x) => s + x, 0), calls.open - n2]);
    // 잠금 중에는 부르지 않는다
    const T = radial(C2_RING, v.measurePoints[0]!.point);
    const n3 = calls.all;
    out.push(['lock', v.setMeasureInferenceLock('z'), hoverRow('locked', T, null, null), calls.all - n3]);
    v.setMeasureInferenceLock(false);
    return out;
  },
};

const VALUES: ValueSet[] = [
  ...valueSets('base'),
  ...valueSets('off'),
  walkValues,
  crossValues,
  limitValues('base'),
  limitValues('off'),
  lockValues('base'),
  lockValues('off'),
  parallelValues,
  shiftOffValues,
  crossAllValues,
  pointsForValues('base'),
  pointsForValues('off'),
  pointsForCallValues,
  editValues,
  editSame,
  edgeLockValues('base'),
  edgeLockValues('off'),
  crossEdgeLockValues,
  directionLockValues('base'),
  directionLockValues('off'),
  labelAvoidValues,
  refineValues,
  openValues,
];

// ───────────── 장면마다 뷰어 하나 ─────────────
function rangesDemo({ v }: Ctx): void {
  const scene = sceneOf('base');
  const sph = scene.meshes.find((m) => m.id === '구')!;
  const tris = sph.indices ? sph.indices.length / 3 : sph.positions.length / 9;
  const band: { start: number; count: number }[] = [];
  for (let t = 0; t < tris; t += 1000) band.push({ start: t, count: 500 });
  v.setHiddenRanges('구', band);
  const n = scene.lines[0]!.positions.length / 6;
  const cut: { start: number; count: number }[] = [];
  for (let i = 0; i < n; i += Math.max(2, Math.floor(n / 40))) cut.push({ start: i, count: Math.max(1, Math.floor(n / 80)) });
  v.setHiddenRanges(scene.lines[0]!.id, cut);
  v.setHiddenRanges('상자', { prims: [{ start: 2, count: 2 }], edges: [{ start: 4, count: 4 }] });
  v.setHiddenRanges('구멍', [{ start: 0, count: 6 }]);
  v.highlightRanges({
    구: [{ start: Math.floor(tris * 0.55), count: Math.floor(tris * 0.15) }],
    [scene.lines[0]!.id]: [{ start: 0, count: Math.floor(n / 4) }],
    상자: { prims: [{ start: 4, count: 2 }], edges: [{ start: 8, count: 4 }] },
    구멍: [{ start: 6, count: 6 }],
  });
}

let viewer: V | null = null;
let loaded: Data | null = null;

/** 뷰어 하나(처음 부를 때 만든다)에 그 자료를 올린다 */
function viewerOf(d: Data): V {
  viewer ??= new Viewer3d(host, { theme: 'dark', animate: false, keyboard: false, renderMode: 'shaded' }) as V;
  if (loaded !== d) {
    viewer.setScene(sceneOf(d), d === 'big' ? { incremental: true } : {});
    loaded = d;
  }
  return viewer;
}

/** 장면 사이 되돌리기: 찍는 장면이 바꾸는 상태를 모두 처음으로(그 판에 있는 메서드만) */
function reset(v: V, d: Data): void {
  const call = (name: string, ...a: unknown[]): void => {
    if (typeof v[name] === 'function') v[name](...a);
  };
  call('setNavigation', 'orbit', { gravity: false, collide: false, eyeHeight: undefined });
  call('setMeasureMode', false);
  call('setMeasureSnap', null);
  // 0.13.0: 측정을 지워도 남으므로 장면마다 끈다(뷰어 하나를 모든 장면이 함께 쓴다)
  call('setMeasureLabelAvoid', null);
  call('setPickEdges', false);
  call('setRenderMode', 'shaded');
  call('setRenderOptions', { profiles: null, hiddenEdges: null, edgeColor: null });
  call('setSections', null);
  call('setSection', null);
  call('setTheme', 'dark');
  call('setBackground', null);
  call('setLighting', null);
  call('setFog', null);
  call('setProjection', 'perspective');
  call('clearHiddenRanges');
  call('highlightRanges', null);
  call('highlight', null);
  call('clearItemLooks');
  call('setAnnotations', null);
  call('setMarker', null);
  for (const l of sceneOf(d === 'edit' || d === 'edit-big' ? 'base' : d).lines) call('setLineDrawRange', l.id, null);
  call('setGridVisible', true);
  if (typeof v.groups === 'function') for (const g of v.groups()) if (!g.visible) call('setGroupVisible', g.name, true);
  v.setView('seIso', false);
  v.fit(false);
}

function makeCtx(d: Data): Ctx {
  const v = viewerOf(d);
  reset(v, d);
  const shift = d === 'off' ? OFFSET : [0, 0, 0];
  const ptr = (type: string, x: number, y: number, pointerType: string, buttons: number, shiftKey = false): void => {
    const r = v.canvas.getBoundingClientRect();
    v.canvas.dispatchEvent(
      new PointerEvent(type, {
        clientX: r.left + x,
        clientY: r.top + y,
        pointerId: pointerType === 'mouse' ? 1 : 2,
        pointerType,
        button: type === 'pointermove' ? -1 : 0,
        buttons,
        shiftKey,
        bubbles: true,
        cancelable: true,
        isPrimary: true,
      }),
    );
  };
  return {
    v,
    host,
    w: W,
    h: H,
    world: (p) => p.map((x, i) => x + shift[i]!),
    click: (x, y, pt = 'mouse', sh = false) => {
      ptr('pointerdown', x, y, pt, 1, sh);
      ptr('pointerup', x, y, pt, 0, sh);
    },
    hover: (x, y, pt = 'mouse', sh = false) => ptr('pointermove', x, y, pt, 0, sh),
    at: (p) => {
      if (typeof v.project !== 'function') return null;
      const r = v.project(p);
      return r ? { x: r.x, y: r.y } : null;
    },
  };
}

/** 무늬가 다 풀릴 때까지(없는 판이면 바로) */
async function texturesReady(v: V): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const t = v.stats?.textures;
    if (!t || t.ready >= t.count) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('무늬가 5초 안에 풀리지 않았습니다');
}

async function b64(data: Uint8ClampedArray): Promise<string> {
  const url = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(new Blob([data as Uint8ClampedArray<ArrayBuffer>]));
  });
  return url.slice(url.indexOf(',') + 1);
}

type Result<T> = { ok: true; value: T } | { skip: string } | { error: string };

async function withViewer<T>(item: { data: Data; needs?: Need }, fn: (c: Ctx) => Promise<T>): Promise<Result<T>> {
  try {
    const c = makeCtx(item.data);
    const why = item.needs?.(c.v, c);
    if (why) return { skip: why };
    return { ok: true, value: await fn(c) };
  } catch (e) {
    return { error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

async function shot(name: string): Promise<Result<{ w: number; h: number; rgba: string }>> {
  const s = SHOTS.find((x) => x.name === name);
  if (!s) return { error: `장면 없음: ${name}` };
  return withViewer(s, async (c) => {
    await s.setup(c);
    await texturesReady(c.v);
    // 화면 그리기 한 번: 측정 미리 보기(마우스 아래 붙잡을 점)·뷰 큐브는 그릴 때 정한다(사용자가 보는 그대로)
    c.v.renderNow();
    let img: ImageData;
    if (s.capture === 'cube' || s.capture === 'overlay') {
      const el = c.host.querySelector<HTMLCanvasElement>(`canvas.v3d-${s.capture}`);
      if (!el) throw new Error(`${s.capture === 'cube' ? '뷰 큐브' : '화면 덧그림'} 캔버스가 없습니다`);
      img = el.getContext('2d')!.getImageData(0, 0, el.width, el.height);
    } else img = c.v.renderImage({});
    return { w: img.width, h: img.height, rgba: await b64(img.data) };
  });
}

async function value(name: string): Promise<Result<unknown[]>> {
  const s = VALUES.find((x) => x.name === name);
  if (!s) return { error: `값 묶음 없음: ${name}` };
  return withViewer(s, async (c) => s.run(c));
}

function info(): Record<string, string> {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2');
  const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
  const out = {
    renderer: gl ? String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : '(WebGL2 없음)',
    vendor: gl ? String(gl.getParameter(dbg ? dbg.UNMASKED_VENDOR_WEBGL : gl.VENDOR)) : '',
    dpr: String(devicePixelRatio),
  };
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return out;
}

(window as unknown as { pixels: unknown }).pixels = {
  ready: true,
  size: { w: W, h: H },
  shots: SHOTS.map((s) => s.name),
  values: VALUES.map((s) => s.name),
  shot,
  value,
  info,
};
