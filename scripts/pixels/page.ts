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
 * (0.15.0 열린 수직 발·교차점 다듬기),
 * post = base에 상자 위에 선 기둥 선분((60, 40, 90) → (60, 40, 120))을 더한 자료(0.18.0 축과 면의 교차 — 기둥 아래 끝의 Z축이 상자 윗면을 뚫는다),
 * globe = base에 구 위에 선 기둥 선분((200, 28, 95) → (200, 28, 120))과 바닥의 12토막 원판(arc의 원판)을 더한 자료
 * (0.19.0 축이 곡면을 뚫는 점 다듬기 — 기둥 아래 끝의 Z축이 구를 뚫는다, 잠근 축과 원판 둘레의 교차 다듬기)
 */
type Data = 'base' | 'off' | 'tex' | 'cross' | 'big' | 'edit' | 'edit-big' | 'arc' | 'arc2' | 'post' | 'globe';

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
    if (d === 'post') s = { ...s, lines: [...s.lines, { id: '기둥', positions: new Float32Array([...POST_FOOT, 60, 40, 120]), color: [0.95, 0.6, 0.95, 1], width: 1.5, group: '기둥' }] };
    if (d === 'globe')
      s = {
        ...s,
        lines: [...s.lines, { id: '구 기둥', positions: new Float32Array([...GLOBE_FOOT, 200, 28, 120]), color: [0.95, 0.6, 0.95, 1], width: 1.5, group: '기둥' }],
        meshes: [...s.meshes, arcDisk()],
      };
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

// ───────────── 0.16.0 붙잡은 선분 식별자·끌어온 축 ─────────────
/** 0.16.0 붙잡은 선분 식별자(MeasureHoverSnap.segment)가 있는 판인지 — 상자 앞 윗모서리 위를 가리켜 본다 */
const v0160seg: Need = (v, c) => {
  const why = all(v090infer, fn('project', 'setGroupVisible'))(v, c);
  if (why) return why;
  v.setGroupVisible('공구 경로', false);
  v.setMeasureMode(true);
  v.setMeasureSnap({ edges: true });
  const q = c.at(c.world([30, 0, 40]));
  if (q) {
    c.hover(q.x, q.y);
    v.renderNow();
  }
  const ok = !!v.measureHoverSnap?.segment;
  v.setMeasureSnap(null);
  v.setMeasureMode(false);
  v.setGroupVisible('공구 경로', true);
  return ok ? null : '이 판에 없는 값: 0.16.0 MeasureHoverSnap.segment(붙잡은 선분 식별자)';
};
/** 0.16.0 끌어온 축(inference.track)이 있는 판인지 */
const v0160track: Need = (v, c) => {
  const why = all(v090infer, fn('project', 'setGroupVisible', 'setMeasureTrackPoints'))(v, c);
  if (why) return why;
  v.setMeasureSnap({ inference: { track: true } });
  const ok = !!(v.measureSnap?.inference as any)?.track;
  v.setMeasureSnap(null);
  return ok ? null : '이 판에 없는 선택: 0.16.0 끌어온 축(setMeasureSnap({ inference: { track } }))';
};
const segRow = (s: any): unknown[] | null => (s ? [s.kind, s.id, s.index, s.raw, s.ends.map(r10s)] : null);

/**
 * 0.16.0 붙잡은 선분 식별자 값(cross 자료 — 상자 윗면 위 엇갈린 두 선분): 엇갈린 선분의 교차점·끝점, 상자 윤곽선 끝점·가운데 점·위 점, 구멍 점(점 묶음),
 * 구멍 점에서 상자 앞 윗모서리로 내린 수직 발을 가리킨 미리 보기의 종류와 선분·둘째 선분, 찍은 점(measurePoints)의 선분.
 * 같은 차례를 선분 위 점·가운데 점을 조금 옮겨 다듬는 refine으로 되풀이해 다듬은 점도 같은 선분인지
 */
const segmentValues: ValueSet = {
  name: 'cross-measure-segments',
  data: 'cross',
  needs: v0160seg,
  run: (c) => {
    const { v } = c;
    v.setGroupVisible('공구 경로', false);
    v.setMeasureMode(true);
    // 가운데 점 없이(엇갈린 두 선분은 가운데 점에서 만난다 — 교차점을 보려고)·구멍 점을 숨기고(첫 구멍 점이 엇갈린 선분 끝과 겹친다)
    const plainTargets: [string, number[]][] = [
      ['cross', [60, 40, 40.5]],
      ['cross-end', [10, 10, 40.5]],
      ['corner', [120, 0, 40]],
      ['on-edge', [30, 0, 40]],
    ];
    // 가운데 점을 켜고 구멍 점을 보이고
    const midTargets: [string, number[]][] = [
      ['mid', [60, 0, 40]],
      ['hole', [50, 70, 40]],
    ];
    const run = (refine: ((i: any) => number[] | null) | null): unknown[] => {
      const rows: unknown[] = [];
      const sweep = (targets: [string, number[]][]): void => {
        for (const [name, p] of targets) {
          const q = c.at(c.world(p));
          if (!q) {
            rows.push([name, null]);
            continue;
          }
          c.hover(q.x + 1, q.y);
          v.renderNow();
          const h = v.measureHoverSnap;
          rows.push([name, h ? [h.snap, !!h.refined, segRow(h.segment), segRow(h.other)] : null]);
        }
      };
      v.setGroupVisible('구멍', false);
      v.setMeasureSnap({ edges: true, inference: true, ...(refine ? { refine } : {}) });
      sweep(plainTargets);
      v.setGroupVisible('구멍', true);
      v.setMeasureSnap({ midpoints: true, edges: true, inference: true, ...(refine ? { refine } : {}) });
      v.clearMeasure();
      sweep(midTargets);
      // 구멍 점에서 상자 앞 윗모서리로 내린 수직 발
      const a = c.at(c.world([50, 70, 40])), f = c.at(c.world([50, 0, 40]));
      if (a && f) {
        c.click(a.x + 1, a.y);
        c.hover(f.x + 4, f.y + 1);
        v.renderNow();
        const h = v.measureHoverSnap;
        rows.push(['foot', h ? [h.snap, !!h.refined, segRow(h.segment)] : null]);
        c.click(f.x + 4, f.y + 1);
        rows.push(['points', v.measurePoints.map((p: any) => [p.snap, segRow(p.segment), segRow(p.other)])]);
      }
      return rows;
    };
    const plain = run(null);
    const nudge = (i: any): number[] | null => (i.kind === 'onEdge' || i.kind === 'midpoint' ? [i.point[0] + 0.01, i.point[1], i.point[2]] : null);
    const refined = run(nudge);
    // 다듬은 점은 refined만 다르고 선분은 같아야 한다
    const strip = (rows: unknown[]): string => JSON.stringify(rows, (k, x) => (k === '1' && typeof x === 'boolean' ? null : x));
    return [['plain', plain], ['refined', refined], ['refined-same-segments', strip(plain) === strip(refined)]];
  },
};

/** 0.16.0 끌어온 축 장면 자리: 구멍 점 P(90, 50, 40)·P2(30, 30, 40), 첫 점 A = 상자 앞 왼쪽 위 구석 */
const TRACK_P = [90, 50, 40];
const TRACK_P2 = [30, 30, 40];
const TRACK_A = [0, 0, 40];
/**
 * 첫 점을 찍고 끌어온 점 둘을 준 뒤 커서를 대상 자리 옆에(화면 dx, dy). 구멍 점(점 묶음)은 숨긴다 — 상자 모서리 위 나란한 자리 둘레에
 * 구멍 점이 붙잡기 거리 안에 들 수 있다(점 붙잡기가 먼저라 끌어온 축을 보지 못한다)
 */
function trackPreview(c: Ctx, target: number[] | null, first: boolean, dx = 3, dy = 1): void {
  const { v } = c;
  v.setGroupVisible('공구 경로', false);
  v.setGroupVisible('구멍', false);
  v.setMeasureMode(true);
  v.setMeasureSnap({ edges: true, inference: { axes: true, track: true } });
  if (first) {
    const a = c.at(c.world(TRACK_A));
    if (a) c.click(a.x + 1, a.y + 1);
  }
  v.setMeasureTrackPoints([c.world(TRACK_P), c.world(TRACK_P2)]);
  const q = target ? c.at(c.world(target)) : null;
  if (q) c.hover(q.x + dx, q.y + dy);
}
const trackShots: Shot[] = [
  // 첫 점 X축 위에서 구멍 점 P와 나란한 자리(90, 0, 40): 첫 점에서 X축 색 안내선, P에서 점선, 끌어온 점 표식 둘
  { name: 'base-measure-track-cross', data: 'base', needs: v0160track, setup: (c) => trackPreview(c, [90, 0, 40], true, 6, 0) },
  // 첫 점 전: 구멍 점 P를 지나는 Z축(상자 위 빈 곳)
  { name: 'base-measure-track-axis', data: 'base', needs: v0160track, setup: (c) => trackPreview(c, [90, 50, 85], false) },
  // 밝은 테마의 같은 나란한 자리(점선·십자 바탕 테가 밝은 바탕에서도 보이는지)
  {
    name: 'base-measure-track-cross-light',
    data: 'base',
    needs: v0160track,
    setup: (c) => {
      c.v.setTheme('light');
      trackPreview(c, [90, 0, 40], true, 6, 0);
    },
  },
];
SHOTS.push(...trackShots);

/**
 * 0.16.0 끌어온 축 값(base·off): 구멍 점 위에 머물러(dwellMs 40 — 실제 타이머) 기억한 점, 그 점을 지나는 Z축 미리 보기, 첫 점 X·Y축 위 나란한 자리(커서를 옆에 두어도
 * 그 자리), 찍은 거리·결과·찍은 점의 끌어온 점, 두 점째 뒤 잊는지, 잠근 동안 끌어온 축이 없는지, Esc로 지우는지.
 * 같은 커서 차례를 track 없이 되풀이한 미리 보기(꺼지면 0.15.0과 같은 첫 점 축·면 위 점)
 */
function trackValues(d: 'base' | 'off'): ValueSet {
  return {
    name: `${d}-measure-track`,
    data: d,
    needs: v0160track,
    run: async (c) => {
      const { v } = c;
      v.setGroupVisible('공구 경로', false);
      v.setMeasureMode(true);
      const out: unknown[] = [];
      const hoverRow = (name: string, p: readonly number[], dx = 3, dy = 1): unknown[] => {
        const q = c.at(c.world(p));
        if (!q) return [name, null];
        c.hover(q.x + dx, q.y + dy);
        v.renderNow();
        const h = v.measureHoverSnap;
        return [name, h ? [h.snap, h.axis ?? null, r10s(h.point), r10s(h.direction), r10s(h.trackFrom)] : null, lockState(v.measureHoverLock)];
      };
      const sweep = async (track: boolean): Promise<unknown[]> => {
        const rows: unknown[] = [];
        const got: unknown[] = [];
        const off = v.onMeasure((m: any) => m && got.push([r10s(m.a), r10s(m.b), r10(m.distance), m.snapA ?? null, m.snapB ?? null, m.axisA ?? null, m.axisB ?? null, r10s(m.directionB)]));
        v.setMeasureSnap({ edges: true, inference: { axes: true, ...(track ? { track: { dwellMs: 40 } } : {}) } });
        v.clearMeasure();
        v.setGroupVisible('구멍', true);
        // 구멍 점 P 위에 머물기(실제 타이머 — 40 ms 뒤 기억, 150 ms 기다린다)
        const p = c.at(c.world(TRACK_P));
        if (p) {
          c.hover(p.x + 1, p.y);
          v.renderNow();
          rows.push(['on-p', v.measureHoverSnap?.snap ?? null]);
          await new Promise((r) => setTimeout(r, 150));
        }
        rows.push(['tracked', (v.measureTrackPoints ?? []).map(r10s)]);
        rows.push(hoverRow('p-axis-z', [90, 50, 85]));
        // 구멍 점을 숨긴다(끌어온 점은 남는다 — 상자 모서리 위 나란한 자리 둘레의 구멍 점이 점 붙잡기로 먼저 잡히지 않게)
        v.setGroupVisible('구멍', false);
        // 첫 점 A
        const a = c.at(c.world(TRACK_A));
        if (a) c.click(a.x + 1, a.y + 1);
        rows.push(['first', v.measurePoints.map((q: any) => [r10s(q.point), q.snap, r10s(q.trackFrom)])]);
        rows.push(hoverRow('cross-x', [90, 0, 40], 6, 0), hoverRow('cross-y', [0, 50, 40], 0, 5), hoverRow('plain-x', [40, 0, 40], 2, 0));
        // 잠그면 끌어온 축이 없다
        rows.push(['lock', v.setMeasureInferenceLock('z'), hoverRow('locked', [90, 0, 40], 6, 0)]);
        v.setMeasureInferenceLock(false);
        // 나란한 자리를 찍는다(두 점째) — 끌어온 점은 잊는다
        const x = c.at(c.world([90, 0, 40]));
        if (x) {
          c.hover(x.x + 6, x.y);
          c.click(x.x + 6, x.y);
        }
        rows.push(['measure', got.at(-1) ?? null, v.measurePoints.map((q: any) => [q.snap, q.axis ?? null, r10s(q.trackFrom)]), (v.measureTrackPoints ?? []).map(r10s)]);
        // 첫 점 전 Esc
        if (track) {
          v.clearMeasure();
          v.setMeasureTrackPoints([c.world(TRACK_P)]);
          const before = v.measureTrackPoints.length;
          const esc = v.handleKey(new KeyboardEvent('keydown', { key: 'Escape' }));
          rows.push(['esc', before, esc, v.measureTrackPoints.length]);
        }
        off();
        return rows;
      };
      out.push(['track', await sweep(true)], ['off', await sweep(false)]);
      return out;
    },
  };
}

// ───────────── 0.17.0 끌어온 축끼리의 교차·끌어온 축과 선분의 교차 ─────────────
/** 0.17.0 끌어온 축끼리의 교차 자리: P의 X축과 P2의 Y축이 (30, 50, 40)에서, P의 Y축과 P2의 X축이 (90, 30, 40)에서 만난다(구멍 점 둘 다 높이 40) */
const PAIR_XY = [30, 50, 40];
const PAIR_YX = [90, 30, 40];
/** 0.17.0 끌어온 축과 선분의 교차 자리: P의 X축이 상자 오른쪽 윗모서리와(120, 50, 40), P의 Y축이 뒤 윗모서리와(90, 80, 40) */
const EDGE_X = [120, 50, 40];
const EDGE_Y = [90, 80, 40];
/** 0.17.0 끌어온 축끼리의 교차(MeasureHoverSnap.trackOther)가 있는 판인지 — 구멍 점 둘을 주고 두 축이 만나는 자리를 가리켜 본다 */
const v0170pair: Need = (v, c) => {
  const why = v0160track(v, c);
  if (why) return why;
  v.setGroupVisible('공구 경로', false);
  v.setGroupVisible('구멍', false);
  v.setMeasureMode(true);
  v.setMeasureSnap({ edges: true, inference: { track: true } });
  v.setMeasureTrackPoints([c.world(TRACK_P), c.world(TRACK_P2)]);
  const q = c.at(c.world(PAIR_XY));
  if (q) {
    c.hover(q.x + 3, q.y + 1);
    v.renderNow();
  }
  const ok = !!v.measureHoverSnap?.trackOther;
  v.setMeasureSnap(null);
  v.setMeasureMode(false);
  v.setGroupVisible('공구 경로', true);
  v.setGroupVisible('구멍', true);
  return ok ? null : '이 판에 없는 값: 0.17.0 끌어온 축끼리의 교차(MeasureHoverSnap.trackOther)';
};
const trackPairShots: Shot[] = [
  // 첫 점 전: 구멍 점 P의 X축과 P2의 Y축이 만나는 점(상자 윗면 위) — 두 끌어온 점에서 X축 색·Y축 색 점선 둘, 두 점 모두 큰 십자
  { name: 'base-measure-track-pair', data: 'base', needs: v0170pair, setup: (c) => trackPreview(c, PAIR_XY, false) },
  // 첫 점(상자 앞 왼쪽 위 구석)에서: P의 X축이 상자 오른쪽 윗모서리와 만나는 점 — P에서 X축 색 점선, 첫 점에서 측정 색 점선
  {
    name: 'base-measure-track-edge',
    data: 'base',
    needs: v0170pair,
    setup: (c) => {
      trackPreview(c, null, true);
      c.v.setMeasureTrackPoints([c.world(TRACK_P)]);
      const q = c.at(c.world(EDGE_X));
      if (q) c.hover(q.x + 1, q.y + 3);
    },
  },
  // 밝은 테마의 끌어온 축끼리의 교차
  {
    name: 'base-measure-track-pair-light',
    data: 'base',
    needs: v0170pair,
    setup: (c) => {
      c.v.setTheme('light');
      trackPreview(c, PAIR_XY, false);
    },
  },
];
SHOTS.push(...trackPairShots);

/**
 * 0.17.0 끌어온 축끼리의 교차·선분 교차 값(base·off): 첫 점 전에 구멍 점 둘(P·P2)의 축이 만나는 두 자리, 높이가 다른 점(P2를 20 올린 점)과는 만나지 않는 자리,
 * P의 축이 상자 윗모서리와 만나는 두 자리를 가리킨 미리 보기(종류·축·점·방향·끌어온 점·둘째 끌어온 축·선분). 교차 자리를 첫 점으로 찍은 점(trackOther),
 * 잠근 동안(교차 없음), 모서리 교차를 두 점째로 찍은 결과·찍은 점의 선분·두 점째 뒤 잊는지. 같은 차례를 track 없이 되풀이한 값
 */
function trackPairValues(d: 'base' | 'off'): ValueSet {
  return {
    name: `${d}-measure-track-pair`,
    data: d,
    needs: v0170pair,
    run: (c) => {
      const { v } = c;
      v.setGroupVisible('공구 경로', false);
      v.setGroupVisible('구멍', false);
      v.setMeasureMode(true);
      const guide = (g: any): unknown[] | null => (g ? [r10s(g.from), g.axis] : null);
      const hoverRow = (name: string, p: readonly number[], dx = 3, dy = 1): unknown[] => {
        const q = c.at(c.world(p));
        if (!q) return [name, null];
        c.hover(q.x + dx, q.y + dy);
        v.renderNow();
        const h = v.measureHoverSnap;
        return [
          name,
          h ? [h.snap, h.axis ?? null, r10s(h.point), r10s(h.direction), r10s(h.trackFrom), guide(h.trackOther), segRow(h.segment)] : null,
          lockState(v.measureHoverLock),
        ];
      };
      const sweep = (track: boolean): unknown[] => {
        const rows: unknown[] = [];
        const got: unknown[] = [];
        const off = v.onMeasure((m: any) => m && got.push([r10s(m.a), r10s(m.b), r10(m.distance), m.snapA ?? null, m.snapB ?? null, m.axisA ?? null, m.axisB ?? null, r10s(m.directionB)]));
        v.setMeasureSnap({ edges: true, inference: { axes: true, ...(track ? { track: true } : {}) } });
        v.clearMeasure();
        const P = c.world(TRACK_P), P2 = c.world(TRACK_P2);
        rows.push(['set', v.setMeasureTrackPoints([P, P2])]);
        rows.push(hoverRow('pair-xy', PAIR_XY), hoverRow('pair-yx', PAIR_YX));
        // 높이가 다른 점과는 만나지 않는다(화면에서 엇갈려도)
        v.setMeasureTrackPoints([P, c.world([30, 30, 60])]);
        rows.push(hoverRow('pair-apart', PAIR_XY));
        // 끌어온 축과 상자 윗모서리
        v.setMeasureTrackPoints([P]);
        rows.push(hoverRow('edge-x', EDGE_X, 1, 3), hoverRow('edge-y', EDGE_Y, 3, 1));
        // 교차 자리를 첫 점으로
        v.setMeasureTrackPoints([P, P2]);
        const a = c.at(c.world(PAIR_XY));
        if (a) {
          c.hover(a.x + 3, a.y + 1);
          c.click(a.x + 3, a.y + 1);
        }
        rows.push(['first', v.measurePoints.map((q: any) => [r10s(q.point), q.snap, q.axis ?? null, r10s(q.trackFrom), guide(q.trackOther)])]);
        // 잠근 동안에는 없다
        rows.push(['lock', v.setMeasureInferenceLock('z'), hoverRow('locked', PAIR_YX)]);
        v.setMeasureInferenceLock(false);
        // 모서리 교차를 두 점째로
        rows.push(hoverRow('edge-x2', EDGE_X, 1, 3));
        const e = c.at(c.world(EDGE_X));
        if (e) c.click(e.x + 1, e.y + 3);
        rows.push([
          'measure',
          got.at(-1) ?? null,
          v.measurePoints.map((q: any) => [q.snap, q.axis ?? null, r10s(q.trackFrom), guide(q.trackOther), segRow(q.segment)]),
          (v.measureTrackPoints ?? []).map(r10s),
        ]);
        off();
        return rows;
      };
      return [
        ['track', sweep(true)],
        ['off', sweep(false)],
      ];
    },
  };
}

// ───────────── 0.18.0 첫 점 축과 선분의 교차·축과 선분의 교차 다듬기 ─────────────
/** 0.18.0 첫 점 축과 선분의 교차(inference.axisEdges)가 있는 판인지 — 그 선택이 measureSnap.inference에 남는다(0.17.0은 아무것도 켜지 않은 선택이라 끈다) */
const v0180axisEdge: Need = (v, c) => {
  const why = all(v090infer, fn('project', 'setGroupVisible', 'setMeasureInferenceLock'))(v, c);
  if (why) return why;
  v.setMeasureSnap({ inference: { axisEdges: true } });
  const ok = !!(v.measureSnap?.inference as any)?.axisEdges;
  v.setMeasureSnap(null);
  return ok ? null : '이 판에 없는 선택: 0.18.0 첫 점 축과 선분의 교차(setMeasureSnap({ inference: { axisEdges } }))';
};
/** 0.18.0 첫 점(구멍 점 TRACK_P = (90, 50, 40))의 축이 상자 윗모서리와 만나는 네 자리: X축은 오른쪽(EDGE_X)·왼쪽, Y축은 뒤(EDGE_Y)·앞 */
const AXIS_EDGES: [string, number[], number, number][] = [
  ['x+', EDGE_X, 1, 3],
  ['x-', [0, 50, 40], 1, 3],
  ['y+', EDGE_Y, 3, 1],
  ['y-', [90, 0, 40], 3, 1],
];
/** 구멍 점 P를 첫 점으로 찍고 구멍 점을 숨긴다(P의 X축 위 구멍 점들이 교차 자리 둘레에서 점 붙잡기로 먼저 잡히지 않게) */
function axisEdgeFirst(c: Ctx, inference: Record<string, unknown>, extra: Record<string, unknown> = {}): void {
  const { v } = c;
  v.setGroupVisible('공구 경로', false);
  v.setGroupVisible('구멍', true);
  v.setMeasureMode(true);
  v.setMeasureSnap({ edges: true, inference, ...extra });
  v.clearMeasure();
  const p = c.at(c.world(TRACK_P));
  if (p) c.click(p.x + 1, p.y);
  v.setGroupVisible('구멍', false);
}
const axisEdgeShots: Shot[] = [
  // 첫 점(구멍 점)의 X축이 상자 오른쪽 윗모서리와 만나는 점 — 첫 점에서 X축 색 안내선, 축 색 동그라미
  {
    name: 'base-measure-axis-edge',
    data: 'base',
    needs: v0180axisEdge,
    setup: (c) => {
      axisEdgeFirst(c, { axes: true, axisEdges: true });
      const q = c.at(c.world(EDGE_X));
      if (q) c.hover(q.x + 1, q.y + 3);
    },
  },
];
SHOTS.push(...axisEdgeShots);

/**
 * 0.18.0 첫 점 축과 선분의 교차 값(base·off): 구멍 점을 첫 점으로 찍고 그 X·Y축이 상자 윗모서리와 만나는 네 자리를 가리킨 미리 보기(종류·축·점·방향·끌어온 점·선분·다듬었는지)와
 * 잠글 방향, Shift를 누른 채 같은 자리(잠금 상태·잠근 선 위 점), 오른쪽 모서리 교차를 두 점째로 찍은 결과·찍은 점. 같은 차례를 axisEdges 없이 되풀이한 값
 * (꺼지면 0.17.0과 같은 첫 점 축 위 커서 자리·모서리 위 점)
 */
function axisEdgeValues(d: 'base' | 'off'): ValueSet {
  return {
    name: `${d}-measure-axis-edge`,
    data: d,
    needs: v0180axisEdge,
    run: (c) => {
      const { v } = c;
      const hoverRow = (name: string, p: readonly number[], dx: number, dy: number, shift = false): unknown[] => {
        const q = c.at(c.world(p));
        if (!q) return [name, null];
        c.hover(q.x + dx, q.y + dy, 'mouse', shift);
        v.renderNow();
        const h = v.measureHoverSnap;
        return [
          name,
          h ? [h.snap, h.axis ?? null, r10s(h.point), r10s(h.direction), r10s(h.trackFrom), segRow(h.segment), !!h.refined, !!h.locked] : null,
          lockState(v.measureHoverLock),
        ];
      };
      const sweep = (on: boolean): unknown[] => {
        const rows: unknown[] = [];
        const got: unknown[] = [];
        const off = v.onMeasure((m: any) => m && got.push([r10s(m.a), r10s(m.b), r10(m.distance), m.snapB ?? null, m.axisB ?? null, r10s(m.directionB), m.lockedB ?? null]));
        axisEdgeFirst(c, { axes: true, lock: true, ...(on ? { axisEdges: true } : {}) });
        rows.push(['first', v.measurePoints.map((q: any) => [r10s(q.point), q.snap])]);
        for (const [name, p, dx, dy] of AXIS_EDGES) rows.push(hoverRow(name, p, dx, dy));
        // Shift를 누른 채 같은 자리 — 지금 미리 보기의 방향(축)으로 잠근다
        rows.push(hoverRow('x+', EDGE_X, 1, 3), hoverRow('shift', EDGE_X, 1, 3, true), ['lock', lockState(v.measureInferenceLock)]);
        rows.push(hoverRow('release', EDGE_X, 1, 3, false), ['lock', lockState(v.measureInferenceLock)]);
        // 오른쪽 모서리 교차를 두 점째로
        const e = c.at(c.world(EDGE_X));
        if (e) c.click(e.x + 1, e.y + 3);
        rows.push(['measure', got.at(-1) ?? null, v.measurePoints.map((q: any) => [q.snap, q.axis ?? null, r10s(q.direction), segRow(q.segment), !!q.refined])]);
        off();
        return rows;
      };
      return [
        ['on', sweep(true)],
        ['off', sweep(false)],
      ];
    },
  };
}

/**
 * 0.18.0 축과 선분의 교차 다듬기 값(arc 자료): 원판(바닥 12토막 원판 — 꼭짓점 15° + 30°·k라 0°·90°·180°·270°는 토막 가운데) 중심을 첫 점으로 찍고,
 * 첫 점 X·Y축이 원판 둘레 윤곽선 토막과 만나는 네 자리를 가리킨다. 앱 refine은 축 직선과 정확한 원의 교차점(origin + dir·t, |… − 중심| = 반지름 — point에 가까운 근)을 준다.
 * 미리 보기(종류·축·점·다듬었는지·원 위인지·방향·선분), 앱 호출 수(같은 자리 둘레를 두 번 가리켜도 한 번 — 기억), +X 교차를 두 점째로 찍은 거리(반지름과 1e-9 안인지),
 * 같은 차례를 refine 없이·null·먼 점(지름 너머)·축에서 벗어난 점(곡선 위 다른 점)으로 되풀이한 값이 refine 없이와 같은지, 잠금 중 호출 수
 */
const axisEdgeRefineValues: ValueSet = {
  name: 'arc-measure-axis-edge',
  data: 'arc',
  needs: all(v0180axisEdge, v0140refine),
  run: (c) => {
    const { v } = c;
    const K = ARC_DISK;
    // 원판을 맞춰 본 뒤 2.5배 물러난다(한 mm가 5화소쯤): 토막 끝(현 가운데에서 5.2 mm)은 붙잡기 거리 밖, 현의 처짐(0.68 mm)은 붙잡기 거리 안
    v.fitItems([K.id], false);
    const cam = v.getCamera();
    v.setCamera({ ...cam, distance: cam.distance * 2.5 });
    v.renderNow();
    const dist3 =(p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
    const onArc = (p: readonly number[]): boolean => Math.abs(dist3(p, K.c) - K.r) < 1e-9 && Math.abs(p[2]! - K.c[2]!) < 1e-9;
    /** 축 직선과 원판 원의 교차(원 평면 z = 중심 높이 위 직선만 — 그 밖은 null), point에 가까운 근 */
    const lineCircle = (i: any): number[] | null => {
      const o = i.line.origin, d = i.line.dir;
      if (Math.abs(d[2]) > 1e-12 || Math.abs(o[2] - K.c[2]!) > 1e-9) return null;
      const wx = o[0] - K.c[0]!, wy = o[1] - K.c[1]!;
      const b = wx * d[0] + wy * d[1], cc = wx * wx + wy * wy - K.r * K.r, a = d[0] * d[0] + d[1] * d[1];
      const disc = b * b - a * cc;
      if (disc < 0) return null;
      const ts = [(-b - Math.sqrt(disc)) / a, (-b + Math.sqrt(disc)) / a].map((t) => [o[0] + d[0] * t, o[1] + d[1] * t, o[2]]);
      return dist3(ts[0]!, i.point) <= dist3(ts[1]!, i.point) ? ts[0]! : ts[1]!;
    };
    const count = { n: 0 };
    const exact = (i: any): number[] | null => {
      if (i.kind !== 'axisEdge') return null;
      count.n++;
      return i.segment.id === K.id ? lineCircle(i) : null;
    };
    /** 첫 점 = 원판 중심(그물 꼭짓점). 축 방향 각 θ의 교차 자리(현 가운데 — 중심에서 r·cos15° 거리) */
    const crossAt = (deg: number): number[] => {
      const a = (deg * Math.PI) / 180, l = K.r * Math.cos((15 * Math.PI) / 180);
      return [K.c[0]! + l * Math.cos(a), K.c[1]! + l * Math.sin(a), K.c[2]!];
    };
    const DIRS: [string, number][] = [
      ['x+', 0],
      ['y+', 90],
      ['x-', 180],
      ['y-', 270],
    ];
    const hoverRow = (name: string, p: readonly number[], dx: number, dy: number): unknown[] => {
      const q = c.at(c.world(p));
      if (!q) return [name, null];
      c.hover(q.x + dx, q.y + dy);
      v.renderNow();
      const h = v.measureHoverSnap;
      return [name, h ? [h.snap, h.axis ?? null, r10s(h.point), !!h.refined, onArc(h.point), r10s(h.direction), segRow(h.segment)] : null];
    };
    const sweep = (refine: ((i: any) => number[] | null) | null): unknown[] => {
      const rows: unknown[] = [];
      v.setGroupVisible('공구 경로', false);
      v.setGroupVisible('구멍', false);
      v.setMeasureMode(true);
      v.setMeasureSnap({ edges: true, inference: { axes: true, lock: true, axisEdges: true }, ...(refine ? { refine } : {}) });
      v.clearMeasure();
      const a = c.at(c.world(K.c));
      if (a) c.click(a.x + 1, a.y);
      rows.push(['first', v.measurePoints.map((q: any) => [r10s(q.point), q.snap])]);
      for (const [name, deg] of DIRS) {
        const n0 = count.n;
        rows.push(hoverRow(name, crossAt(deg), 1, 3), hoverRow(name, crossAt(deg), 3, 1), ['calls', count.n - n0]);
      }
      // +X 교차를 두 점째로
      const e = c.at(c.world(crossAt(0)));
      if (e) c.click(e.x + 1, e.y + 3);
      const m = v.measurement();
      rows.push([
        'measure',
        m ? [r10s(m.b), r10(m.distance), m.snapB ?? null, m.axisB ?? null, r10s(m.directionB)] : null,
        !!m && Math.abs(m.distance - K.r) < 1e-9,
        v.measurePoints.map((q: any) => [q.snap, !!q.refined, segRow(q.segment)]),
      ]);
      return rows;
    };
    const out: unknown[] = [];
    const refined = sweep(exact);
    out.push(['refined', refined], ['calls', count.n]);
    const plain = sweep(null);
    const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
    out.push(['refined-differs', !same(refined, plain)]);
    out.push(['null-same', same(sweep(() => null), plain)]);
    // 지름 너머(붙잡기 거리 밖)·축에서 벗어난 원 위 점(원 위 10° 옆)은 버린다
    out.push(['far-same', same(sweep((i: any) => (i.kind === 'axisEdge' ? [2 * K.c[0]! - i.point[0], 2 * K.c[1]! - i.point[1], i.point[2]] : null)), plain)]);
    out.push([
      'off-axis-same',
      same(
        sweep((i: any) => {
          if (i.kind !== 'axisEdge') return null;
          const t = Math.atan2(i.point[1] - K.c[1]!, i.point[0] - K.c[0]!) + (10 * Math.PI) / 180;
          return [K.c[0]! + K.r * Math.cos(t), K.c[1]! + K.r * Math.sin(t), K.c[2]!];
        }),
        plain,
      ),
    ]);
    // 잠금 중에는 부르지 않는다
    v.setMeasureSnap({ edges: true, inference: { axes: true, lock: true, axisEdges: true }, refine: exact });
    v.clearMeasure();
    const a = c.at(c.world(K.c));
    if (a) c.click(a.x + 1, a.y);
    const n0 = count.n;
    out.push(['lock', v.setMeasureInferenceLock('x'), hoverRow('locked', crossAt(0), 1, 3), count.n - n0]);
    v.setMeasureInferenceLock(false);
    return out;
  },
};

// ───────────── 0.18.0 축과 면의 교차 ─────────────
/** post 자료의 기둥 아래 끝(첫 점) — 그 Z축이 상자 윗면을 POST_HIT에서 뚫는다. 끌어온 점 TRACK_UP의 Z축은 TRACK_UP_HIT에서 */
const POST_FOOT = [60, 40, 90];
const POST_HIT = [60, 40, 40];
const TRACK_UP = [20, 60, 70];
const TRACK_UP_HIT = [20, 60, 40];
/** 0.18.0 축과 면의 교차(inference.axisFaces)가 있는 판인지 */
const v0180axisFace: Need = (v, c) => {
  const why = all(v090infer, fn('project', 'setGroupVisible', 'setMeasureInferenceLock', 'setMeasureTrackPoints'))(v, c);
  if (why) return why;
  v.setMeasureSnap({ inference: { axisFaces: true } });
  const ok = !!(v.measureSnap?.inference as any)?.axisFaces;
  v.setMeasureSnap(null);
  return ok ? null : '이 판에 없는 선택: 0.18.0 축과 면의 교차(setMeasureSnap({ inference: { axisFaces } }))';
};
/** 기둥 아래 끝을 첫 점으로 찍는다(공구 경로·구멍 점은 숨긴다) */
function axisFaceFirst(c: Ctx, inference: Record<string, unknown>): void {
  const { v } = c;
  v.setGroupVisible('공구 경로', false);
  v.setGroupVisible('구멍', false);
  v.setMeasureMode(true);
  v.setMeasureSnap({ edges: true, inference });
  v.clearMeasure();
  const p = c.at(c.world(POST_FOOT));
  if (p) c.click(p.x + 1, p.y);
}
const axisFaceShots: Shot[] = [
  // 기둥 아래 끝(첫 점)의 Z축이 상자 윗면을 뚫는 점 — 첫 점에서 Z축 색 안내선, 축 색 동그라미
  {
    name: 'post-measure-axis-face',
    data: 'post',
    needs: v0180axisFace,
    setup: (c) => {
      axisFaceFirst(c, { axes: true, axisFaces: true });
      const q = c.at(c.world(POST_HIT));
      if (q) c.hover(q.x + 3, q.y + 1);
    },
  },
];
SHOTS.push(...axisFaceShots);

/**
 * 0.18.0 축과 면의 교차 값(post 자료): 기둥 아래 끝을 첫 점으로 찍고 그 Z축이 상자 윗면을 뚫는 자리, 끌어온 점의 Z축이 윗면을 뚫는 자리를 가리킨 미리 보기
 * (종류·축·점·방향·끌어온 점·면 — 그물 id와 법선)와 잠글 방향, Shift 잠금, 첫 점 Z축 교차를 두 점째로 찍은 결과·찍은 점의 면. 같은 차례를 axisFaces 없이 되풀이한 값
 */
const axisFaceValues: ValueSet = {
  name: 'post-measure-axis-face',
  data: 'post',
  needs: v0180axisFace,
  run: (c) => {
    const { v } = c;
    const faceRow = (g: any): unknown[] | null => (g ? [g.id, Number.isInteger(g.index), r10s(g.normal)] : null);
    const hoverRow = (name: string, p: readonly number[], shift = false): unknown[] => {
      const q = c.at(c.world(p));
      if (!q) return [name, null];
      c.hover(q.x + 3, q.y + 1, 'mouse', shift);
      v.renderNow();
      const h = v.measureHoverSnap;
      return [name, h ? [h.snap, h.axis ?? null, r10s(h.point), r10s(h.direction), r10s(h.trackFrom), faceRow(h.face), !!h.locked] : null, lockState(v.measureHoverLock)];
    };
    const sweep = (on: boolean): unknown[] => {
      const rows: unknown[] = [];
      const got: unknown[] = [];
      const off = v.onMeasure((m: any) => m && got.push([r10s(m.a), r10s(m.b), r10(m.distance), m.snapB ?? null, m.axisB ?? null, r10s(m.directionB)]));
      axisFaceFirst(c, { axes: true, lock: true, track: true, ...(on ? { axisFaces: true } : {}) });
      rows.push(['first', v.measurePoints.map((q: any) => [r10s(q.point), q.snap])]);
      rows.push(hoverRow('first-z', POST_HIT));
      rows.push(['set', v.setMeasureTrackPoints([c.world(TRACK_UP)])], hoverRow('track-z', TRACK_UP_HIT));
      rows.push(hoverRow('first-z', POST_HIT), hoverRow('shift', POST_HIT, true), ['lock', lockState(v.measureInferenceLock)]);
      rows.push(hoverRow('release', POST_HIT, false));
      const e = c.at(c.world(POST_HIT));
      if (e) c.click(e.x + 3, e.y + 1);
      rows.push(['measure', got.at(-1) ?? null, v.measurePoints.map((q: any) => [q.snap, q.axis ?? null, r10s(q.direction), faceRow(q.face)])]);
      off();
      return rows;
    };
    return [
      ['on', sweep(true)],
      ['off', sweep(false)],
    ];
  },
};

// ───────────── 0.19.0 잠근 선 위의 교차·축이 곡면을 뚫는 점 다듬기 ─────────────
/** 0.19.0 잠근 선과 선분·면의 교차(inference.lockEdges·lockFaces)가 있는 판인지 — 그 선택이 measureSnap.inference에 남는다 */
const v0190lock: Need = (v, c) => {
  const why = all(v090infer, fn('project', 'setGroupVisible', 'setMeasureInferenceLock'))(v, c);
  if (why) return why;
  v.setMeasureSnap({ inference: { lockEdges: true, lockFaces: true } });
  const inf = v.measureSnap?.inference as any;
  v.setMeasureSnap(null);
  return inf?.lockEdges && inf?.lockFaces ? null : '이 판에 없는 선택: 0.19.0 잠근 선과 선분·면의 교차(setMeasureSnap({ inference: { lockEdges, lockFaces } }))';
};
/** 0.19.0 축이 면을 뚫는 점 다듬기(setMeasureSnap({ refineFace }))가 있는 판인지 — refineFace만 준 선택이 남는다 */
const v0190refineFace: Need = (v, c) => {
  const why = all(v0190lock, v0180axisFace, v0140refine)(v, c);
  if (why) return why;
  v.setMeasureSnap({ refineFace: () => null });
  const ok = typeof v.measureSnap?.refineFace === 'function';
  v.setMeasureSnap(null);
  return ok ? null : '이 판에 없는 선택: 0.19.0 축이 면을 뚫는 점 다듬기(setMeasureSnap({ refineFace }))';
};
/** 잠근 선과 선분의 교차 자리: 첫 점 TRACK_P = (90, 50, 40)에서 (1, 0.5, 0) 방향 선은 상자 오른쪽 윗모서리와 (120, 65, 40)에서 만난다 */
const LOCK_SLANT = [1, 0.5, 0];
const LOCK_SLANT_HIT = [120, 65, 40];
/** 잠근 선과 면의 교차 자리: 기둥 아래 끝 POST_FOOT = (60, 40, 90)에서 (0.2, 0, −1) 방향 선은 상자 윗면을 (70, 40, 40)에서 뚫는다 */
const LOCK_TILT = [0.2, 0, -1];
const LOCK_TILT_HIT = [70, 40, 40];
const lockMeetShots: Shot[] = [
  // 잠근 X축(첫 점 = 구멍 점)이 상자 오른쪽 윗모서리와 만나는 점 — 굵은 X축 색 안내선, 고리 두른 축 색 동그라미가 모서리 위
  {
    name: 'base-measure-lock-edge',
    data: 'base',
    needs: v0190lock,
    setup: (c) => {
      axisEdgeFirst(c, { axes: true, lock: true, lockEdges: true });
      c.v.setMeasureInferenceLock('x');
      const q = c.at(c.world(EDGE_X));
      if (q) c.hover(q.x + 1, q.y + 3);
    },
  },
  // 잠근 Z축(첫 점 = 기둥 아래 끝)이 상자 윗면을 뚫는 점
  {
    name: 'post-measure-lock-face',
    data: 'post',
    needs: v0190lock,
    setup: (c) => {
      axisFaceFirst(c, { axes: true, lock: true, lockFaces: true });
      c.v.setMeasureInferenceLock('z');
      const q = c.at(c.world(POST_HIT));
      if (q) c.hover(q.x + 3, q.y + 1);
    },
  },
];
SHOTS.push(...lockMeetShots);

/** 미리 보기 한 줄(잠근 선 위 교차 값 묶음들이 함께 쓴다): 종류·축·점·방향·잠금·옮겨 온 점·선분·면·다듬었는지 */
function lockHoverRow(c: Ctx, name: string, p: readonly number[], dx: number, dy: number, shift = false): unknown[] {
  const q = c.at(c.world(p));
  if (!q) return [name, null];
  c.hover(q.x + dx, q.y + dy, 'mouse', shift);
  c.v.renderNow();
  const h = c.v.measureHoverSnap;
  const face = h?.face ? [h.face.id, Number.isInteger(h.face.index), r10s(h.face.normal)] : null;
  return [name, h ? [h.snap, h.axis ?? null, r10s(h.point), r10s(h.direction), !!h.locked, r10s(h.from), h.fromSnap ?? null, segRow(h.segment), face, !!h.refined] : null];
}

/**
 * 0.19.0 잠근 선과 선분의 교차 값(base·off): 구멍 점을 첫 점으로 찍고, 앱 단추로 X·Y축에 잠근 채 상자 윗모서리와 만나는 네 자리, (1, 0.5, 0) 방향으로 잠근 채 오른쪽 모서리와
 * 만나는 자리, X축에 잠근 채 상자 구석(점 붙잡기 — 0.10.0처럼 잠근 선에 내린다)을 가리킨 미리 보기와, 첫 점 축과 모서리의 교차(axisEdges) 미리 보기에서 Shift로 잠근 같은 자리,
 * 잠근 X축 교차를 두 점째로 찍은 결과·찍은 점. 같은 차례를 lockEdges 없이 되풀이한 값(0.18.0과 같은 잠근 축 위 커서 자리)
 */
function lockEdgeValues(d: 'base' | 'off'): ValueSet {
  return {
    name: `${d}-measure-lock-edge`,
    data: d,
    needs: v0190lock,
    run: (c) => {
      const { v } = c;
      const sweep = (on: boolean): unknown[] => {
        const rows: unknown[] = [];
        const got: unknown[] = [];
        const off = v.onMeasure((m: any) => m && got.push([r10s(m.a), r10s(m.b), r10(m.distance), m.snapB ?? null, m.axisB ?? null, r10s(m.directionB), m.lockedB ?? null]));
        axisEdgeFirst(c, { axes: true, lock: true, axisEdges: true, ...(on ? { lockEdges: true } : {}) });
        rows.push(['first', v.measurePoints.map((q: any) => [r10s(q.point), q.snap])]);
        for (const [name, p, dx, dy] of AXIS_EDGES) {
          rows.push(['lock', v.setMeasureInferenceLock(name[0] as 'x' | 'y'), lockHoverRow(c, name, p, dx, dy)]);
          v.setMeasureInferenceLock(false);
        }
        rows.push(['lock', v.setMeasureInferenceLock({ direction: LOCK_SLANT }), lockHoverRow(c, 'slant', LOCK_SLANT_HIT, 1, 3)]);
        rows.push(['lock', v.setMeasureInferenceLock('x'), lockHoverRow(c, 'corner', [120, 80, 40], -2, 2)]);
        v.setMeasureInferenceLock(false);
        // 첫 점 축과 모서리의 교차 미리 보기 → Shift로 잠근 같은 자리 → 그대로 두 점째
        rows.push(lockHoverRow(c, 'x+', EDGE_X, 1, 3), lockHoverRow(c, 'shift', EDGE_X, 1, 3, true), ['lock', lockState(v.measureInferenceLock)]);
        const e = c.at(c.world(EDGE_X));
        if (e) c.click(e.x + 1, e.y + 3, 'mouse', true);
        c.hover(e ? e.x + 1 : 0, e ? e.y + 3 : 0, 'mouse', false);
        rows.push([
          'measure',
          got.at(-1) ?? null,
          v.measurePoints.map((q: any) => [q.snap, q.axis ?? null, r10s(q.direction), !!q.locked, segRow(q.segment), !!q.refined]),
          lockState(v.measureInferenceLock),
        ]);
        off();
        return rows;
      };
      return [
        ['on', sweep(true)],
        ['off', sweep(false)],
      ];
    },
  };
}

/**
 * 0.19.0 잠근 선과 면의 교차 값(post 자료): 기둥 아래 끝을 첫 점으로 찍고, 앱 단추로 Z축에 잠근 채 상자 윗면을 뚫는 자리, (0.2, 0, −1) 방향으로 잠근 채 윗면을 뚫는 자리의 미리 보기와,
 * 축이 면을 뚫는 점(axisFaces) 미리 보기에서 Shift로 잠근 같은 자리, 그 자리를 두 점째로 찍은 결과·찍은 점의 면. 같은 차례를 lockFaces 없이 되풀이한 값
 */
const lockFaceValues: ValueSet = {
  name: 'post-measure-lock-face',
  data: 'post',
  needs: v0190lock,
  run: (c) => {
    const { v } = c;
    const sweep = (on: boolean): unknown[] => {
      const rows: unknown[] = [];
      const got: unknown[] = [];
      const off = v.onMeasure((m: any) => m && got.push([r10s(m.a), r10s(m.b), r10(m.distance), m.snapB ?? null, m.axisB ?? null, r10s(m.directionB), m.lockedB ?? null]));
      axisFaceFirst(c, { axes: true, lock: true, axisFaces: true, ...(on ? { lockFaces: true } : {}) });
      rows.push(['first', v.measurePoints.map((q: any) => [r10s(q.point), q.snap])]);
      rows.push(['lock', v.setMeasureInferenceLock('z'), lockHoverRow(c, 'z', POST_HIT, 3, 1)]);
      rows.push(['lock', v.setMeasureInferenceLock({ direction: LOCK_TILT }), lockHoverRow(c, 'tilt', LOCK_TILT_HIT, 3, 1)]);
      v.setMeasureInferenceLock(false);
      rows.push(lockHoverRow(c, 'first-z', POST_HIT, 3, 1), lockHoverRow(c, 'shift', POST_HIT, 3, 1, true), ['lock', lockState(v.measureInferenceLock)]);
      const e = c.at(c.world(POST_HIT));
      if (e) c.click(e.x + 3, e.y + 1, 'mouse', true);
      c.hover(e ? e.x + 3 : 0, e ? e.y + 1 : 0, 'mouse', false);
      rows.push([
        'measure',
        got.at(-1) ?? null,
        v.measurePoints.map((q: any) => [q.snap, q.axis ?? null, !!q.locked, q.face ? [q.face.id, r10s(q.face.normal)] : null]),
      ]);
      off();
      return rows;
    };
    return [
      ['on', sweep(true)],
      ['off', sweep(false)],
    ];
  },
};

/**
 * globe 자료: 구(중심 (190, 40, 35), 반지름 35 — 경도 48칸·위도 24칸) 위 기둥 아래 끝. 그 Z축은 구를 GLOBE_HIT에서 뚫는다(정확한 구 — 삼각형 위 코어 점은 그보다 조금 안쪽).
 * 중심에서 (10, −12) 옆이라 뚫는 자리는 구를 나눈 칸 가운데쯤(가장 가까운 꼭짓점까지 2.2) — 확대하면 꼭짓점 붙잡기 거리 밖이다
 */
const GLOBE_FOOT = [200, 28, 95];
const GLOBE_C = [190, 40, 35];
const GLOBE_R = 35;
const GLOBE_HIT = [200, 28, 35 + Math.sqrt(GLOBE_R * GLOBE_R - 244)];

/**
 * 0.19.0 축이 곡면을 뚫는 점 다듬기와 잠근 축 교차 다듬기 값(globe 자료).
 * - 구: 기둥 아래 끝을 첫 점으로 찍고 그 Z축이 구를 뚫는 자리를 가리킨다. 앱 refineFace는 축 직선과 정확한 구의 교차(point에 가까운 근)를 준다.
 *   미리 보기(종류·축·점·다듬었는지·구 위인지·면), 앱 호출 수(같은 자리 둘레를 두 번 가리켜도 한 번 — 기억, Shift로 잠가도 같은 입력이라 0번), 두 점째로 찍은 거리(정확한 값과 1e-9 안인지).
 *   같은 차례를 refineFace 없이·null·먼 근(구 아래쪽)·축에서 벗어난 구 위 점으로 되풀이한 값이 refineFace 없이와 같은지
 * - 원판: 중심을 첫 점으로 찍고 앱 단추로 X·Y축에 잠근 채 둘레 토막과 만나는 자리. 앱 refine은 축 직선과 정확한 원의 교차를 준다(lockEdges를 켰을 때만 부른다 — 끄면 0번)
 */
const lockRefineValues: ValueSet = {
  name: 'globe-measure-lock-refine',
  data: 'globe',
  needs: v0190refineFace,
  run: (c) => {
    const { v } = c;
    const dist3 = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
    const onSphere = (p: readonly number[]): boolean => Math.abs(dist3(p, GLOBE_C) - GLOBE_R) < 1e-9;
    /** 축 직선 o + d·t와 중심 cc·반지름 r 구(원이면 평면 위 직선만)의 교차 가운데 near에 가까운(far면 먼) 근 */
    const lineSphere = (o: number[], d: number[], cc: readonly number[], r: number, near: readonly number[], far = false): number[] | null => {
      const w = [o[0]! - cc[0]!, o[1]! - cc[1]!, o[2]! - cc[2]!];
      const a = d[0]! * d[0]! + d[1]! * d[1]! + d[2]! * d[2]!, b = w[0]! * d[0]! + w[1]! * d[1]! + w[2]! * d[2]!, k = w[0]! * w[0]! + w[1]! * w[1]! + w[2]! * w[2]! - r * r;
      const disc = b * b - a * k;
      if (disc < 0) return null;
      const ts = [(-b - Math.sqrt(disc)) / a, (-b + Math.sqrt(disc)) / a].map((t) => [o[0]! + d[0]! * t, o[1]! + d[1]! * t, o[2]! + d[2]! * t]);
      const i = dist3(ts[0]!, near) <= dist3(ts[1]!, near) ? 0 : 1;
      return ts[far ? 1 - i : i]!;
    };
    const count = { face: 0, edge: 0 };
    const sphereAt = (i: any): number[] | null => {
      count.face++;
      return i.face.id === '구' ? lineSphere(i.line.origin, i.line.dir, GLOBE_C, GLOBE_R, i.point) : null;
    };
    const K = ARC_DISK;
    const circleAt = (i: any): number[] | null => {
      if (i.kind !== 'axisEdge') return null;
      count.edge++;
      const o = i.line.origin, d = i.line.dir;
      // 원 평면(중심 높이) 위 직선만 — 원과 같은 구로 풀면 그 평면 위 원과의 교차다
      return i.segment.id === K.id && Math.abs(d[2]) < 1e-12 && Math.abs(o[2] - K.c[2]!) < 1e-9 ? lineSphere(o, d, K.c, K.r, i.point) : null;
    };
    const row = (name: string, p: readonly number[], dx: number, dy: number, shift = false): unknown[] => {
      const r = lockHoverRow(c, name, p, dx, dy, shift);
      const h = v.measureHoverSnap;
      return [...r, h ? onSphere(h.point) : null];
    };
    const sphereSweep = (fnc: ((i: any) => number[] | null) | null): unknown[] => {
      const rows: unknown[] = [];
      // 0.21.0부터 붙잡지 않은 면 위 점도 'onFace'로 오므로 앱처럼 종류로 거른다(이 묶음은 축이 면을 뚫는 점의 값 — 0.19.0·0.20.0과 같아야 한다)
      const refineFace = fnc ? (i: any): number[] | null => (i.kind === 'axisFace' ? fnc(i) : null) : null;
      v.setGroupVisible('공구 경로', false);
      v.setGroupVisible('구멍', false);
      v.setMeasureMode(true);
      v.setMeasureSnap({ edges: true, inference: { axes: true, lock: true, axisFaces: true, lockFaces: true }, ...(refineFace ? { refineFace } : {}) });
      v.clearMeasure();
      v.setView('seIso', false);
      v.fit(false);
      v.renderNow();
      const a = c.at(c.world(GLOBE_FOOT));
      if (a) c.click(a.x + 1, a.y);
      rows.push(['first', v.measurePoints.map((q: any) => [r10s(q.point), q.snap])]);
      // 뚫는 자리로 다가가 확대한다(구를 맞춰 본 거리의 반 — 구를 나눈 칸이 붙잡기 거리보다 넓게)
      v.fitItems(['구'], false);
      const cam = v.getCamera();
      v.setCamera({ ...cam, target: c.world(GLOBE_HIT) as [number, number, number], distance: cam.distance * 0.5 });
      v.renderNow();
      const n0 = count.face;
      rows.push(row('hit', GLOBE_HIT, 3, 1), row('hit', GLOBE_HIT, 1, 3), ['calls', count.face - n0]);
      const n1 = count.face;
      rows.push(row('shift', GLOBE_HIT, 1, 3, true), ['lock', lockState(v.measureInferenceLock)], ['calls', count.face - n1]);
      const e = c.at(c.world(GLOBE_HIT));
      if (e) c.click(e.x + 1, e.y + 3, 'mouse', true);
      c.hover(e ? e.x + 1 : 0, e ? e.y + 3 : 0, 'mouse', false);
      const m = v.measurement();
      rows.push([
        'measure',
        m ? [r10s(m.b), r10(m.distance), m.snapB ?? null, m.axisB ?? null, m.lockedB ?? null] : null,
        !!m && Math.abs(m.distance - (GLOBE_FOOT[2]! - GLOBE_HIT[2]!)) < 1e-9,
        v.measurePoints.map((q: any) => [q.snap, !!q.refined, !!q.locked, q.face?.id ?? null]),
      ]);
      return rows;
    };
    const out: unknown[] = [];
    const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
    const refined = sphereSweep(sphereAt);
    out.push(['sphere', refined], ['calls', count.face]);
    const plain = sphereSweep(null);
    out.push(['refined-differs', !same(refined, plain)]);
    out.push(['null-same', same(sphereSweep(() => null), plain)]);
    out.push(['far-same', same(sphereSweep((i: any) => lineSphere(i.line.origin, i.line.dir, GLOBE_C, GLOBE_R, i.point, true)), plain)]);
    out.push([
      'off-axis-same',
      same(
        sphereSweep((i: any) => {
          // 구 위 다른 점(구 중심에서 본 방향을 10° 돌린 점) — 축 위가 아니다
          const p = lineSphere(i.line.origin, i.line.dir, GLOBE_C, GLOBE_R, i.point)!;
          const u = [p[0]! - GLOBE_C[0]!, p[1]! - GLOBE_C[1]!, p[2]! - GLOBE_C[2]!];
          const t = (10 * Math.PI) / 180;
          return [GLOBE_C[0]! + u[0]! * Math.cos(t) - u[2]! * Math.sin(t), GLOBE_C[1]! + u[1]!, GLOBE_C[2]! + u[0]! * Math.sin(t) + u[2]! * Math.cos(t)];
        }),
        plain,
      ),
    ]);
    // 원판: 잠근 X·Y축과 둘레 토막의 교차(현 가운데 — 중심에서 r·cos15°)
    v.setGroupVisible('구', false);
    v.fitItems([K.id], false);
    const cam = v.getCamera();
    v.setCamera({ ...cam, distance: cam.distance * 2.5 });
    v.renderNow();
    const crossAt = (deg: number): number[] => {
      const a = (deg * Math.PI) / 180, l = K.r * Math.cos((15 * Math.PI) / 180);
      return [K.c[0]! + l * Math.cos(a), K.c[1]! + l * Math.sin(a), K.c[2]!];
    };
    const onCircle = (p: readonly number[]): boolean => Math.abs(dist3(p, K.c) - K.r) < 1e-9 && Math.abs(p[2]! - K.c[2]!) < 1e-9;
    for (const on of [true, false]) {
      v.setMeasureSnap({ edges: true, inference: { axes: true, lock: true, ...(on ? { lockEdges: true } : {}) }, refine: circleAt });
      v.clearMeasure();
      const a = c.at(c.world(K.c));
      if (a) c.click(a.x + 1, a.y);
      const rows: unknown[] = [['first', v.measurePoints.map((q: any) => [r10s(q.point), q.snap])]];
      for (const [axis, deg] of [
        ['x', 0],
        ['y', 90],
      ] as const) {
        const n0 = count.edge;
        v.setMeasureInferenceLock(axis);
        const r = lockHoverRow(c, axis, crossAt(deg), 1, 3);
        const h = v.measureHoverSnap;
        rows.push([r, h ? onCircle(h.point) : null, count.edge - n0]);
        v.setMeasureInferenceLock(false);
      }
      out.push([on ? 'disk-on' : 'disk-off', rows]);
    }
    return out;
  },
};

// ───────────── 0.20.0 선과 꺾은선 토막의 열린 교차·그물 면만 고르기 ─────────────
/**
 * arc 자료의 원판 둘레 0° 자리 OPEN_T(토막 가운데 바깥 — 현과는 처짐 r·(1 − cos15°) = 0.68 mm 떨어진다)와 그 위 OPEN_UP(첫 점 — 그 Z축이 원판 원을 OPEN_T에서 뚫는다),
 * OPEN_T로 비스듬히 내려가는 선의 첫 점 OPEN_SLANT. 첫 점은 앱 붙잡기 점(points)으로 찍는다
 */
const OPEN_T = [ARC_DISK.c[0]! + ARC_DISK.r, ARC_DISK.c[1]!, ARC_DISK.c[2]!];
const OPEN_UP = [OPEN_T[0]!, OPEN_T[1]!, 20];
const OPEN_SLANT = [OPEN_T[0]! - 10, OPEN_T[1]!, 20];
/** 원판을 맞춰 본 뒤 2.5배 물러난다(arc-measure-axis-edge와 같다 — 한 mm가 5화소쯤, 현의 처짐 3.4화소) */
function openCamera(v: V): void {
  v.fitItems([ARC_DISK.id], false);
  const cam = v.getCamera();
  v.setCamera({ ...cam, distance: cam.distance * 2.5 });
  v.renderNow();
}
/** 0.20.0 축과 꺾은선 토막의 열린 교차가 있는 판인지 — OPEN_UP을 첫 점으로 찍고 OPEN_T를 가리켜 앱 함수가 'axisEdge'·open으로 불리는지 본다 */
const v0200open: Need = (v, c) => {
  const why = all(v0180axisEdge, v0140refine, fn('fitItems', 'getCamera', 'setCamera'))(v, c);
  if (why) return why;
  v.setGroupVisible('공구 경로', false);
  v.setGroupVisible('구멍', false);
  openCamera(v);
  v.setMeasureMode(true);
  let open = false;
  v.setMeasureSnap({ edges: true, points: [{ point: c.world(OPEN_UP), kind: 'point' }], inference: { axisEdges: true }, refine: (i: any) => ((open ||= i.kind === 'axisEdge' && !!i.open), null) });
  const a = c.at(c.world(OPEN_UP));
  const t = c.at(c.world(OPEN_T));
  if (a && t) {
    c.click(a.x + 1, a.y);
    c.hover(t.x + 1, t.y + 3);
    v.renderNow();
  }
  v.setMeasureSnap(null);
  v.clearMeasure();
  v.setMeasureMode(false);
  v.setGroupVisible('공구 경로', true);
  v.setGroupVisible('구멍', true);
  v.setView('seIso', false);
  v.fit(false);
  return open ? null : '이 판에 없는 동작: 0.20.0 축과 꺾은선 토막의 열린 교차(refine — axisEdge, open)';
};

/**
 * 0.20.0 축·잠근 선과 꺾은선 토막의 열린 교차 값(arc 자료): 원판 둘레 0° 자리 위 OPEN_UP을 첫 점으로 찍고 그 Z축이 원판 원을 뚫는 자리 OPEN_T를 가리킨다
 * (축은 현과 3D로 만나지 않는다 — 0.19.0은 첫 점 Z축 위 커서 자리). 앱 refine은 직선과 정확한 원의 교차(원 평면을 뚫는 점이 원 위일 때만)를 준다.
 * 미리 보기(종류·축·점·다듬었는지·원 위인지·방향·선분·끌어온 점), 앱 호출 수(열린 후보 — 같은 자리 둘레를 두 번 가리켜도 한 번, Shift로 잠가도 0번),
 * 두 점째로 찍은 거리(높이 20과 1e-9 안인지), 끌어온 Z축(첫 점 전), 비스듬한 방향 잠금(축이 아닌 잠근 선 — 넘긴 직선에 축 이름이 없는지)과
 * 같은 차례를 refine 없이·null·먼 점·선에서 벗어난 원 위 점으로 되풀이한 값이 refine 없이와 같은지
 */
const axisOpenValues: ValueSet = {
  name: 'arc-measure-axis-open',
  data: 'arc',
  needs: v0200open,
  run: (c) => {
    const { v } = c;
    const K = ARC_DISK;
    const dist3 = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
    const onArc = (p: readonly number[]): boolean => Math.abs(Math.hypot(p[0]! - K.c[0]!, p[1]! - K.c[1]!) - K.r) < 1e-9 && Math.abs(p[2]! - K.c[2]!) < 1e-9;
    const count = { open: 0, all: 0 };
    const axisNames: (string | null)[] = [];
    /** 직선(origin, dir)과 원판 원: 원 평면을 뚫는 점이 원 위면 그 점, 평면 위 직선이면 point에 가까운 근 */
    const lineCircle = (i: any): number[] | null => {
      const o = i.line.origin, d = i.line.dir;
      if (Math.abs(d[2]) > 1e-12) {
        const t = (K.c[2]! - o[2]) / d[2];
        const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
        return onArc(p) ? p : null;
      }
      if (Math.abs(o[2] - K.c[2]!) > 1e-9) return null;
      const wx = o[0] - K.c[0]!, wy = o[1] - K.c[1]!;
      const b = wx * d[0] + wy * d[1], cc = wx * wx + wy * wy - K.r * K.r, a = d[0] * d[0] + d[1] * d[1];
      const disc = b * b - a * cc;
      if (disc < 0) return null;
      const ts = [(-b - Math.sqrt(disc)) / a, (-b + Math.sqrt(disc)) / a].map((t) => [o[0] + d[0] * t, o[1] + d[1] * t, o[2]]);
      return dist3(ts[0]!, i.point) <= dist3(ts[1]!, i.point) ? ts[0]! : ts[1]!;
    };
    const exact = (i: any): number[] | null => {
      if (i.kind !== 'axisEdge') return null;
      count.all++;
      if (i.open) {
        count.open++;
        axisNames.push(i.line.axis ?? null);
      }
      return i.segment.id === K.id ? lineCircle(i) : null;
    };
    const row = (name: string, p: readonly number[], dx: number, dy: number, shift = false): unknown[] => {
      const q = c.at(c.world(p));
      if (!q) return [name, null];
      c.hover(q.x + dx, q.y + dy, 'mouse', shift);
      v.renderNow();
      const h = v.measureHoverSnap;
      return [
        name,
        h ? [h.snap, h.axis ?? null, r10s(h.point), !!h.refined, onArc(h.point), r10s(h.direction), !!h.locked, segRow(h.segment), r10s(h.trackFrom)] : null,
      ];
    };
    const first = (p: readonly number[]): unknown[] => {
      v.clearMeasure();
      const a = c.at(c.world(p));
      if (a) c.click(a.x + 1, a.y);
      return ['first', v.measurePoints.map((q: any) => [r10s(q.point), q.snap])];
    };
    const points = [
      { point: c.world(OPEN_UP), kind: 'point' as const },
      { point: c.world(OPEN_SLANT), kind: 'point' as const },
    ];
    const sweep = (refine: ((i: any) => number[] | null) | null): unknown[] => {
      const rows: unknown[] = [];
      v.setGroupVisible('공구 경로', false);
      v.setGroupVisible('구멍', false);
      openCamera(v);
      v.setMeasureMode(true);
      v.setMeasureSnap({ edges: true, points, inference: { axes: true, lock: true, axisEdges: true, lockEdges: true }, ...(refine ? { refine } : {}) });
      // 1. 첫 점 Z축: 두 자리, Shift 잠금, 두 점째
      rows.push(first(OPEN_UP));
      const n0 = count.open;
      rows.push(row('hit', OPEN_T, 1, 3), row('hit', OPEN_T, 3, 1), ['calls', count.open - n0]);
      const n1 = count.open;
      rows.push(row('shift', OPEN_T, 3, 1, true), ['lock', lockState(v.measureInferenceLock)], ['calls', count.open - n1]);
      const e = c.at(c.world(OPEN_T));
      if (e) c.click(e.x + 3, e.y + 1, 'mouse', true);
      c.hover(e ? e.x + 3 : 0, e ? e.y + 1 : 0, 'mouse', false);
      const m = v.measurement();
      rows.push([
        'measure',
        m ? [r10s(m.b), r10(m.distance), m.snapB ?? null, m.axisB ?? null, m.lockedB ?? null] : null,
        !!m && Math.abs(m.distance - OPEN_UP[2]!) < 1e-9,
        v.measurePoints.map((q: any) => [q.snap, !!q.refined, !!q.locked, segRow(q.segment)]),
      ]);
      // 2. 비스듬한 방향 잠금(OPEN_SLANT → OPEN_T — 축이 아닌 잠근 선)
      rows.push(first(OPEN_SLANT));
      v.setMeasureInferenceLock({ direction: [OPEN_T[0]! - OPEN_SLANT[0]!, OPEN_T[1]! - OPEN_SLANT[1]!, OPEN_T[2]! - OPEN_SLANT[2]!] });
      rows.push(row('slant', OPEN_T, 1, 3));
      v.setMeasureInferenceLock(false);
      // 3. 끌어온 Z축(첫 점 전)
      v.clearMeasure();
      v.setMeasureSnap({ edges: true, inference: { track: true }, ...(refine ? { refine } : {}) });
      v.setMeasureTrackPoints([c.world(OPEN_UP)]);
      rows.push(row('track', OPEN_T, 1, 3));
      v.setMeasureTrackPoints(null);
      return rows;
    };
    const out: unknown[] = [];
    const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
    const refined = sweep(exact);
    out.push(['refined', refined], ['calls', { ...count }], ['line-axis', axisNames]);
    const plain = sweep(null);
    out.push(['refined-differs', !same(refined, plain)]);
    out.push(['null-same', same(sweep(() => null), plain)]);
    // 선 위 먼 점(붙잡기 거리 밖)·선에서 벗어난 원 위 점(원 위 10° 옆)은 버린다
    out.push(['far-same', same(sweep((i: any) => (i.kind === 'axisEdge' && i.line ? [i.point[0], i.point[1], i.point[2] - 30] : null)), plain)]);
    out.push([
      'off-line-same',
      same(
        sweep((i: any) => {
          if (i.kind !== 'axisEdge') return null;
          const t = Math.atan2(i.point[1] - K.c[1]!, i.point[0] - K.c[0]!) + (10 * Math.PI) / 180;
          return [K.c[0]! + K.r * Math.cos(t), K.c[1]! + K.r * Math.sin(t), K.c[2]!];
        }),
        plain,
      ),
    ]);
    return out;
  },
};

/** 0.20.0 그물 면만 고르기(pick(x, y, { meshesOnly }))가 있는 판인지 — 상자 앞 윗모서리(윤곽선 고르기)를 그물 면만으로 골라 본다 */
const v0200meshesOnly: Need = (v, c) => {
  const why = fn('project', 'setPickEdges')(v, c);
  if (why) return why;
  v.setPickEdges(true);
  const q = c.at(c.world([30, 0, 40]));
  const p = q ? v.pick(q.x, q.y + 0.5, { meshesOnly: true }) : null;
  v.setPickEdges(false);
  return p && p.kind === 'mesh' ? null : '이 판에 없는 선택: 0.20.0 그물 면만 고르기(pick meshesOnly)';
};

/**
 * 0.20.0 그물 면만 고르기 값(base·off): 화면 격자 점마다(윤곽선 고르기를 켜고) 보통 고르기와 meshesOnly 고르기의 종류 짝 수, 보통 고르기가 그물 면이면 두 결과가 같은지,
 * meshesOnly가 그물 면이 아닌 것을 고르지 않는지, 상자 윗모서리·공구 경로(나선 선분) 위 몇 자리의 두 결과(그 아래 면·법선)
 */
function meshesOnlyValues(d: 'base' | 'off'): ValueSet {
  return {
    name: `${d}-pick-meshes-only`,
    data: d,
    needs: v0200meshesOnly,
    run: (c) => {
      const { v } = c;
      v.setPickEdges(true);
      const kinds = new Map<string, number>();
      let sameMesh = 0, meshTotal = 0, nonMesh = 0;
      for (let y = 20; y < c.h; y += 37)
        for (let x = 20; x < c.w; x += 41) {
          const a = v.pick(x + 0.3, y + 0.4);
          const b = v.pick(x + 0.3, y + 0.4, { meshesOnly: true });
          const key = `${a?.kind ?? '-'}>${b?.kind ?? '-'}`;
          kinds.set(key, (kinds.get(key) ?? 0) + 1);
          if (b && b.kind !== 'mesh') nonMesh++;
          if (a?.kind === 'mesh') {
            meshTotal++;
            if (JSON.stringify(a) === JSON.stringify(b)) sameMesh++;
          }
        }
      const at = (p: number[], dx: number, dy: number): unknown[] => {
        const q = c.at(c.world(p));
        if (!q) return [p, null];
        const a = v.pick(q.x + dx, q.y + dy);
        const b = v.pick(q.x + dx, q.y + dy, { meshesOnly: true });
        const r = (k: any): unknown[] | null => (k ? [k.kind, k.id, k.index, r10s(k.point), r10s(k.normal), !!k.section] : null);
        return [p, r(a), r(b)];
      };
      const rows = [at([30, 0, 40], 0, 0.5), at([120, 40, 40], 0.5, 0), at([60, 40, 40], 0.4, 0.3), at([60, 40, 70], 0.4, 0.3)];
      v.setPickEdges(false);
      return [['grid', [...kinds.entries()].sort()], ['mesh-same', sameMesh, meshTotal], ['non-mesh', nonMesh], ['rows', rows]];
    },
  };
}

// ───────────── 0.21.0 다듬기 기억만 비우기·잠근 선과 끌어온 축의 교차·면 위 점 다듬기 ─────────────
/** 0.21.0 잠근 선과 끌어온 축의 교차(inference.lockTracks)가 있는 판인지 — 그 선택이 measureSnap.inference에 남는다 */
const v0210lockTracks: Need = (v, c) => {
  const why = all(v0190lock, v0160track)(v, c);
  if (why) return why;
  v.setMeasureSnap({ inference: { track: true, lockTracks: true } });
  const inf = v.measureSnap?.inference as any;
  v.setMeasureSnap(null);
  return inf?.lockTracks ? null : '이 판에 없는 선택: 0.21.0 잠근 선과 끌어온 축의 교차(setMeasureSnap({ inference: { lockTracks } }))';
};
/** 잠근 선과 끌어온 축이 만나는 자리: 첫 점 TRACK_P = (90, 50, 40)에서 잠근 X축은 끌어온 점 TRACK_P2 = (30, 30, 40)의 Y축과 PAIR_XY = (30, 50, 40)에서,
 * 잠근 Y축은 그 X축과 PAIR_YX = (90, 30, 40)에서, (1, 0.5, 0) 방향 잠근 선은 그 Y축과 (30, 20, 40)·X축과 (50, 30, 40)에서 만난다 */
const LOCK_TRACK_SLANT_Y = [30, 20, 40];
const LOCK_TRACK_SLANT_X = [50, 30, 40];
/** 높이가 다른 끌어온 점(첫 점과 좌표를 함께 쓰지 않는다 — 잠근 X축 위 나란한 자리는 PAIR_XY 그대로, 그 점의 축과는 만나지 않는다) */
const LOCK_TRACK_HIGH = [30, 30, 70];
const lockTrackShots: Shot[] = [
  // 잠근 X축(첫 점 = 구멍 점)이 끌어온 점(다른 구멍 점)의 Y축과 만나는 점 — 굵은 X축 색 안내선, 끌어온 점에서 Y축 색 점선, 큰 십자
  {
    name: 'base-measure-lock-track',
    data: 'base',
    needs: v0210lockTracks,
    setup: (c) => {
      axisEdgeFirst(c, { axes: true, lock: true, track: true, lockTracks: true });
      c.v.setMeasureTrackPoints([c.world(TRACK_P2)]);
      c.v.setMeasureInferenceLock('x');
      const q = c.at(c.world(PAIR_XY));
      if (q) c.hover(q.x + 3, q.y + 1);
    },
  },
];
SHOTS.push(...lockTrackShots);

/**
 * 0.21.0 잠근 선과 끌어온 축의 교차 값(base·off): 구멍 점 TRACK_P를 첫 점으로 찍고 다른 구멍 점 TRACK_P2를 끌어온 점으로 준 뒤, 앱 단추로 X·Y축에 잠근 채 그 점의 축과 만나는 두 자리,
 * (1, 0.5, 0) 방향 잠금이 그 점의 Y·X축과 만나는 두 자리, 높이가 다른 끌어온 점의 잠근 X축 위 나란한 자리, 잠그기 전 첫 점 축 위 나란한 자리 미리 보기에서 Shift로 잠근 같은 자리,
 * 잠근 X축 교차를 두 점째로 찍은 결과·찍은 점(종류·축·점·방향·잠금·끌어온 점·만나는 끌어온 축·선분). 같은 차례를 lockTracks 없이 되풀이한 값(0.20.0과 같은 잠근 선 위 커서 자리)
 */
function lockTrackValues(d: 'base' | 'off'): ValueSet {
  return {
    name: `${d}-measure-lock-track`,
    data: d,
    needs: v0210lockTracks,
    run: (c) => {
      const { v } = c;
      const guide = (g: any): unknown[] | null => (g ? [r10s(g.from), g.axis] : null);
      const row = (name: string, p: readonly number[], dx: number, dy: number, shift = false): unknown[] => {
        const r = lockHoverRow(c, name, p, dx, dy, shift);
        const h = v.measureHoverSnap;
        return [...r, h ? [r10s(h.trackFrom), guide(h.trackOther)] : null];
      };
      const sweep = (on: boolean): unknown[] => {
        const rows: unknown[] = [];
        const got: unknown[] = [];
        const off = v.onMeasure((m: any) => m && got.push([r10s(m.a), r10s(m.b), r10(m.distance), m.snapB ?? null, m.axisB ?? null, r10s(m.directionB), m.lockedB ?? null]));
        axisEdgeFirst(c, { axes: true, lock: true, track: true, ...(on ? { lockTracks: true } : {}) });
        rows.push(['first', v.measurePoints.map((q: any) => [r10s(q.point), q.snap])]);
        rows.push(['tracks', v.setMeasureTrackPoints([c.world(TRACK_P2)])]);
        for (const [axis, p] of [
          ['x', PAIR_XY],
          ['y', PAIR_YX],
        ] as const) {
          v.setMeasureInferenceLock(axis);
          rows.push(row(axis, p, 3, 1), row(axis, p, 1, 3));
          v.setMeasureInferenceLock(false);
        }
        v.setMeasureInferenceLock({ direction: LOCK_SLANT });
        rows.push(row('slant-y', LOCK_TRACK_SLANT_Y, 3, 1), row('slant-x', LOCK_TRACK_SLANT_X, 1, 3));
        v.setMeasureInferenceLock(false);
        v.setMeasureTrackPoints([c.world(LOCK_TRACK_HIGH)]);
        v.setMeasureInferenceLock('x');
        rows.push(row('high', PAIR_XY, 3, 1));
        v.setMeasureInferenceLock(false);
        // 잠그기 전 첫 점 X축 위 나란한 자리(0.16.0) → Shift로 잠근다
        v.setMeasureTrackPoints([c.world(TRACK_P2)]);
        rows.push(row('cross', PAIR_XY, 3, 1), row('shift', PAIR_XY, 3, 1, true), ['lock', lockState(v.measureInferenceLock)]);
        // 잠근 X축 교차를 두 점째로
        const e = c.at(c.world(PAIR_XY));
        if (e) c.click(e.x + 3, e.y + 1, 'mouse', true);
        c.hover(e ? e.x + 3 : 0, e ? e.y + 1 : 0, 'mouse', false);
        rows.push(['measure', got.at(-1) ?? null, v.measurePoints.map((q: any) => [q.snap, q.axis ?? null, !!q.locked, r10s(q.trackFrom), guide(q.trackOther)])]);
        off();
        return rows;
      };
      return [
        ['on', sweep(true)],
        ['off', sweep(false)],
      ];
    },
  };
}

/** 0.21.0 다듬기 기억만 비우기(Viewer3d.clearMeasureRefine)가 있는 판인지 */
const v0210clearRefine: Need = (v, c) => all(v0200open, fn('clearMeasureRefine'))(v, c);

/**
 * 0.21.0 다듬기 기억만 비우기 값(arc 자료 — 0.20.0 arc-measure-axis-open의 자리): OPEN_UP을 첫 점으로 찍고 OPEN_SLANT를 끌어온 점으로 준 뒤 앱 단추로 Z축에 잠그고,
 * 앱 refine이 곡선 정의를 받기 전(null)에 OPEN_T를 가리킨다. 정의를 받은 뒤 같은 둘레를 가리켜도 기억한 null이라 그대로인지, clearMeasureRefine 뒤 다음 미리 보기에서
 * 다시 불러 원 위 교차에 붙는지(호출 수·원 위인지), 잠금·끌어온 점·찍은 점·붙잡기 선택이 그대로인지, 두 점째로 찍은 거리(높이 20과 1e-9 안인지)
 */
const clearRefineValues: ValueSet = {
  name: 'arc-measure-clear-refine',
  data: 'arc',
  needs: v0210clearRefine,
  run: (c) => {
    const { v } = c;
    const K = ARC_DISK;
    const dist3 = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
    const onArc = (p: readonly number[]): boolean => Math.abs(Math.hypot(p[0]! - K.c[0]!, p[1]! - K.c[1]!) - K.r) < 1e-9 && Math.abs(p[2]! - K.c[2]!) < 1e-9;
    let loaded = false;
    const count = { open: 0 };
    const refine = (i: any): number[] | null => {
      if (i.kind !== 'axisEdge' || !i.line) return null;
      if (i.open) count.open++;
      if (!loaded || i.segment.id !== K.id || Math.abs(i.line.dir[2]) < 1e-12) return null;
      const o = i.line.origin, dd = i.line.dir;
      const t = (K.c[2]! - o[2]) / dd[2];
      const p = [o[0] + dd[0] * t, o[1] + dd[1] * t, o[2] + dd[2] * t];
      return onArc(p) ? p : null;
    };
    const row = (name: string, dx: number, dy: number): unknown[] => {
      const r = lockHoverRow(c, name, OPEN_T, dx, dy);
      const h = v.measureHoverSnap;
      return [...r, h ? onArc(h.point) : null, count.open];
    };
    const state = (): string =>
      JSON.stringify([lockState(v.measureInferenceLock), (v.measureTrackPoints ?? []).map(r10s), v.measurePoints.map((q: any) => [r10s(q.point), q.snap]), Object.keys(v.measureSnap ?? {}).sort()]);
    v.setGroupVisible('공구 경로', false);
    v.setGroupVisible('구멍', false);
    openCamera(v);
    v.setMeasureMode(true);
    v.setMeasureSnap({ edges: true, points: [{ point: c.world(OPEN_UP), kind: 'point' }], inference: { axes: true, lock: true, track: true, axisEdges: true, lockEdges: true }, refine });
    v.clearMeasure();
    const a = c.at(c.world(OPEN_UP));
    if (a) c.click(a.x + 1, a.y);
    const rows: unknown[] = [['first', v.measurePoints.map((q: any) => [r10s(q.point), q.snap])]];
    v.setMeasureTrackPoints([c.world(OPEN_SLANT)]);
    v.setMeasureInferenceLock('z');
    rows.push(row('before', 1, 3));
    loaded = true;
    rows.push(row('loaded', 3, 1));
    const s0 = state();
    const n = v.clearMeasureRefine();
    v.renderNow();
    const h = v.measureHoverSnap;
    rows.push(['cleared', n > 0, h ? [onArc(h.point), !!h.refined, !!h.locked] : null, count.open, state() === s0]);
    rows.push(row('again', 1, 3));
    const e = c.at(c.world(OPEN_T));
    if (e) c.click(e.x + 1, e.y + 3);
    const m = v.measurement();
    rows.push(['measure', m ? [r10(m.distance), m.lockedB ?? null] : null, !!m && Math.abs(m.distance - OPEN_UP[2]!) < 1e-9 && dist3(m.b, c.world(OPEN_T)) < 1e-9]);
    rows.push(['off', v.clearMeasureRefine() >= 0, (v.setMeasureSnap(null), v.clearMeasureRefine())]);
    return rows;
  },
};

/** 0.21.0 붙잡지 않은 면 위 점 다듬기(refineFace — 'onFace')가 있는 판인지 — 구 위를 가리켜 앱 함수가 'onFace'로 불리는지 본다 */
const v0210onFace: Need = (v, c) => {
  const why = all(v0190refineFace, fn('fitItems'))(v, c);
  if (why) return why;
  v.setGroupVisible('공구 경로', false);
  v.setGroupVisible('구멍', false);
  v.fitItems(['구'], false);
  v.setMeasureMode(true);
  let seen = false;
  v.setMeasureSnap({ refineFace: (i: any) => ((seen ||= i.kind === 'onFace'), null) });
  const q = c.at(c.world(onFaceSample(0)));
  if (q) {
    c.hover(q.x + 0.3, q.y + 0.4);
    v.renderNow();
  }
  v.setMeasureSnap(null);
  v.setMeasureMode(false);
  v.setGroupVisible('공구 경로', true);
  v.setGroupVisible('구멍', true);
  v.setView('seIso', false);
  v.fit(false);
  return seen ? null : '이 판에 없는 동작: 0.21.0 붙잡지 않은 면 위 점 다듬기(refineFace — onFace)';
};
/** 구(GLOBE_C·GLOBE_R) 위에서 seIso 눈 쪽을 둘러싼 점(k번째 — 위도·경도를 조금씩 돌린다) */
function onFaceSample(k: number): number[] {
  const lat = ((25 + 9 * (k % 3)) * Math.PI) / 180, lon = ((-45 + 11 * Math.floor(k / 3) - 11) * Math.PI) / 180;
  return [GLOBE_C[0]! + GLOBE_R * Math.cos(lat) * Math.cos(lon), GLOBE_C[1]! + GLOBE_R * Math.cos(lat) * Math.sin(lon), GLOBE_C[2]! + GLOBE_R * Math.sin(lat)];
}

/**
 * 0.21.0 붙잡지 않은 면 위 점 다듬기 값(globe 자료): 구를 맞춰 본 뒤 구 위 아홉 자리(눈 쪽)를 가리킨 미리 보기(종류·다듬었는지·정확한 구 위인지·커서 광선 위인지)와 앱 호출 수(종류별),
 * 같은 자리에서 누른 첫 점·둘째 점(다시 부르지 않는지)과 그 거리, 같은 차례를 refineFace 없이·null·종류로 거르는 앱·맞은편 근(구를 가로지른 뒤쪽)·광선에서 벗어난 구 위 점으로
 * 되풀이한 값이 refineFace 없이와 같은지
 */
const onFaceValues: ValueSet = {
  name: 'globe-measure-on-face',
  data: 'globe',
  needs: v0210onFace,
  run: (c) => {
    const { v } = c;
    const dist3 = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
    const onSphere = (p: readonly number[]): boolean => Math.abs(dist3(p, GLOBE_C) - GLOBE_R) < 1e-9;
    /** 직선 o + d·t와 구의 교차 가운데 near에 가까운(far면 먼) 근 */
    const lineSphere = (o: number[], d: number[], near: readonly number[], far = false): number[] | null => {
      const w = [o[0]! - GLOBE_C[0]!, o[1]! - GLOBE_C[1]!, o[2]! - GLOBE_C[2]!];
      const a = d[0]! * d[0]! + d[1]! * d[1]! + d[2]! * d[2]!, b = w[0]! * d[0]! + w[1]! * d[1]! + w[2]! * d[2]!, k = w[0]! * w[0]! + w[1]! * w[1]! + w[2]! * w[2]! - GLOBE_R * GLOBE_R;
      const disc = b * b - a * k;
      if (disc < 0) return null;
      const ts = [(-b - Math.sqrt(disc)) / a, (-b + Math.sqrt(disc)) / a].map((t) => [o[0]! + d[0]! * t, o[1]! + d[1]! * t, o[2]! + d[2]! * t]);
      const i = dist3(ts[0]!, near) <= dist3(ts[1]!, near) ? 0 : 1;
      return ts[far ? 1 - i : i]!;
    };
    const kinds: Record<string, number> = {};
    /** 종류를 가리지 않는 앱(직선과 곡면의 교차 하나로 축과 면 위 점을 함께 푼다) */
    const exact = (i: any): number[] | null => {
      kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
      return i.face.id === '구' ? lineSphere(i.line.origin, i.line.dir, i.point) : null;
    };
    const onRay = (p: readonly number[], x: number, y: number): boolean => {
      const s = v.project(p);
      return !!s && Math.hypot(s.x - x, s.y - y) < 1e-6;
    };
    const sweep = (refineFace: ((i: any) => number[] | null) | null): unknown[] => {
      const rows: unknown[] = [];
      v.setGroupVisible('공구 경로', false);
      v.setGroupVisible('구멍', false);
      v.setView('seIso', false);
      v.fitItems(['구'], false);
      v.renderNow();
      v.setMeasureMode(true);
      v.setMeasureSnap({ edges: true, ...(refineFace ? { refineFace } : {}) });
      v.clearMeasure();
      for (let k = 0; k < 9; k++) {
        const q = c.at(c.world(onFaceSample(k)));
        if (!q) {
          rows.push([k, null]);
          continue;
        }
        const x = q.x + 0.3, y = q.y + 0.4;
        c.hover(x, y);
        v.renderNow();
        const h = v.measureHoverSnap;
        rows.push([k, h ? [h.snap, !!h.refined, onSphere(h.point), onRay(h.point, x, y), r10s(h.point)] : null]);
      }
      const n0 = kinds.onFace ?? 0;
      const pts: unknown[] = [];
      for (const k of [1, 7]) {
        const q = c.at(c.world(onFaceSample(k)));
        if (q) c.click(q.x + 0.3, q.y + 0.4);
        pts.push(v.measurePoints.map((p: any) => [p.snap, !!p.refined, onSphere(p.point)]));
      }
      const m = v.measurement();
      rows.push(['measure', pts, m ? r10(m.distance) : null, (kinds.onFace ?? 0) - n0]);
      return rows;
    };
    const out: unknown[] = [];
    const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
    const refined = sweep(exact);
    out.push(['refined', refined], ['calls', { ...kinds }]);
    const plain = sweep(null);
    out.push(['refined-differs', !same(refined, plain)]);
    out.push(['null-same', same(sweep(() => null), plain)]);
    out.push(['kind-filter-same', same(sweep((i: any) => (i.kind !== 'axisFace' ? null : exact(i))), plain)]);
    out.push(['far-same', same(sweep((i: any) => lineSphere(i.line.origin, i.line.dir, i.point, true)), plain)]);
    out.push([
      'off-ray-same',
      same(
        sweep((i: any) => {
          // 구 위 다른 점(구 중심에서 본 방향을 10° 돌린 점) — 커서 광선 위가 아니다
          const p = lineSphere(i.line.origin, i.line.dir, i.point);
          if (!p) return null;
          const u = [p[0]! - GLOBE_C[0]!, p[1]! - GLOBE_C[1]!, p[2]! - GLOBE_C[2]!];
          const t = (10 * Math.PI) / 180;
          return [GLOBE_C[0]! + u[0]! * Math.cos(t) - u[2]! * Math.sin(t), GLOBE_C[1]! + u[1]!, GLOBE_C[2]! + u[0]! * Math.sin(t) + u[2]! * Math.cos(t)];
        }),
        plain,
      ),
    ]);
    return out;
  },
};

// ───────────── 0.22.0 면의 열린 교차·한 토막 활꼴의 두 교차·누르기 알림의 그물 면만 고르기 ─────────────
/**
 * globe 자료의 구(GLOBE_C·GLOBE_R — 경도 48칸)를 적도 둘레 경도 3.75°(칸 가운데)에서 스치는 Z축의 첫 점 FO_UP(앱 붙잡기 점). 적도 칸의 현은 중심에서 R·cos3.75° = 34.925에 있고
 * 그 바깥 FO_RHO = 34.96을 지나는 Z축은 그물 삼각형을 비켜 가며 구를 중심 높이 ± FO_DZ(1.67)에서 뚫는다(현과는 0.035 떨어진다 — FO_DIST 거리에서 한 화소 0.03)
 */
const FO_RHO = 34.96;
const FO_AZ = (3.75 * Math.PI) / 180;
const FO_DZ = Math.sqrt(GLOBE_R * GLOBE_R - FO_RHO * FO_RHO);
const FO_UP = [GLOBE_C[0]! + FO_RHO * Math.cos(FO_AZ), GLOBE_C[1]! + FO_RHO * Math.sin(FO_AZ), 95];
const FO_HI = [FO_UP[0]!, FO_UP[1]!, GLOBE_C[2]! + FO_DZ];
const FO_LO = [FO_UP[0]!, FO_UP[1]!, GLOBE_C[2]! - FO_DZ];
const FO_DIST = 25;
/** FO_UP을 첫 점으로 찍고(seIso로 맞춰 본 장면에서) 구를 스치는 자리 둘레로 다가간다 — 경도 23.75° 쪽 14° 위에서 FO_DIST 거리 */
function faceOpenFirst(c: Ctx): void {
  const { v } = c;
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  v.clearMeasure();
  const a = c.at(c.world(FO_UP));
  if (a) c.click(a.x + 1, a.y);
  const az = (23.75 * Math.PI) / 180, el = (14 * Math.PI) / 180;
  const dir = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
  // 카메라 각(yaw·pitch)은 판마다 뜻이 같다 — 대상점에서 눈 쪽 방향으로 맞춘다(setView·fit 없이)
  const cam = v.getCamera();
  const yaw = Math.atan2(dir[0]!, -dir[1]!), pitch = Math.asin(dir[2]!);
  v.setCamera({ ...cam, yaw, pitch, target: c.world([FO_HI[0]!, FO_HI[1]!, GLOBE_C[2]!]) as [number, number, number], distance: FO_DIST, projection: 'perspective' });
  v.renderNow();
}
/** 0.22.0 면의 열린 교차(refineFace — 'axisFace', open)가 있는 판인지 — FO_UP을 첫 점으로 찍고 FO_HI를 가리켜 앱 함수가 open으로 불리는지 본다 */
const v0220faceOpen: Need = (v, c) => {
  const why = all(v0190refineFace, fn('getCamera', 'setCamera'))(v, c);
  if (why) return why;
  v.setGroupVisible('공구 경로', false);
  v.setGroupVisible('구멍', false);
  v.setMeasureMode(true);
  let open = false;
  v.setMeasureSnap({ points: [{ point: c.world(FO_UP), kind: 'point' }], inference: { axes: true, axisFaces: true }, refineFace: (i: any) => ((open ||= i.kind === 'axisFace' && !!i.open), null) });
  faceOpenFirst(c);
  const t = c.at(c.world(FO_HI));
  if (t) c.hover(t.x + 1, t.y + 3);
  v.renderNow();
  v.setMeasureSnap(null);
  v.clearMeasure();
  v.setMeasureMode(false);
  v.setGroupVisible('공구 경로', true);
  v.setGroupVisible('구멍', true);
  v.setView('seIso', false);
  v.fit(false);
  return open ? null : '이 판에 없는 동작: 0.22.0 면의 열린 교차(refineFace — axisFace, open)';
};

/**
 * 0.22.0 면의 열린 교차 값(globe 자료): FO_UP을 첫 점으로 찍고 그 Z축이 구를 스치는 위·아래 자리(FO_HI·FO_LO — 축은 그물 삼각형을 비켜 간다, 0.21.0은 첫 점 Z축 위 커서 자리)를
 * 가리킨 미리 보기(종류·축·점·다듬었는지·구 위인지·방향·면·잠금), 앱 호출 수(열린 후보 — 같은 자리 둘레를 두 번 가리켜도 늘지 않는다, Shift로 잠가도 0번), 두 점째로 찍은 거리
 * (95 − FO_HI 높이와 1e-9 안인지)와 찍은 점, 같은 차례를 refineFace 없이·null·열린 후보를 거르는 앱·먼 근·축에서 벗어난 구 위 점으로 되풀이한 값이 refineFace 없이와 같은지
 */
const faceOpenValues: ValueSet = {
  name: 'globe-measure-face-open',
  data: 'globe',
  needs: v0220faceOpen,
  run: (c) => {
    const { v } = c;
    const dist3 = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
    const onSphere = (p: readonly number[]): boolean => Math.abs(dist3(p, c.world(GLOBE_C)) - GLOBE_R) < 1e-9;
    const lineSphere = (o: number[], d: number[], near: readonly number[], far = false): number[] | null => {
      const C = c.world(GLOBE_C);
      const w = [o[0]! - C[0]!, o[1]! - C[1]!, o[2]! - C[2]!];
      const a = d[0]! * d[0]! + d[1]! * d[1]! + d[2]! * d[2]!, b = w[0]! * d[0]! + w[1]! * d[1]! + w[2]! * d[2]!, k = w[0]! * w[0]! + w[1]! * w[1]! + w[2]! * w[2]! - GLOBE_R * GLOBE_R;
      const disc = b * b - a * k;
      if (disc < 0) return null;
      const ts = [(-b - Math.sqrt(disc)) / a, (-b + Math.sqrt(disc)) / a].map((t) => [o[0]! + d[0]! * t, o[1]! + d[1]! * t, o[2]! + d[2]! * t]);
      const i = dist3(ts[0]!, near) <= dist3(ts[1]!, near) ? 0 : 1;
      return ts[far ? 1 - i : i]!;
    };
    const count = { open: 0, face: 0 };
    const exact = (i: any): number[] | null => {
      if (i.kind !== 'axisFace') return null;
      count.face++;
      if (i.open) count.open++;
      return i.face.id === '구' ? lineSphere(i.line.origin, i.line.dir, i.point) : null;
    };
    const row = (name: string, p: readonly number[], dx: number, dy: number, shift = false): unknown[] => {
      const r = lockHoverRow(c, name, p, dx, dy, shift);
      const h = v.measureHoverSnap;
      return [...r, h ? onSphere(h.point) : null];
    };
    const sweep = (refineFace: ((i: any) => number[] | null) | null): unknown[] => {
      const rows: unknown[] = [];
      v.setGroupVisible('공구 경로', false);
      v.setGroupVisible('구멍', false);
      v.setMeasureMode(true);
      v.setMeasureSnap({ points: [{ point: c.world(FO_UP), kind: 'point' }], inference: { axes: true, lock: true, axisFaces: true, lockFaces: true }, ...(refineFace ? { refineFace } : {}) });
      faceOpenFirst(c);
      rows.push(['first', v.measurePoints.map((q: any) => [r10s(q.point), q.snap])]);
      const n0 = count.open;
      rows.push(row('hi', FO_HI, 1, 3), row('hi', FO_HI, 3, 1), ['calls', count.open - n0]);
      const n1 = count.open;
      rows.push(row('lo', FO_LO, 1, 3), row('lo', FO_LO, 3, -1), ['calls', count.open - n1]);
      const n2 = count.open;
      rows.push(row('shift', FO_HI, 3, 1, true), ['lock', lockState(v.measureInferenceLock)], ['calls', count.open - n2]);
      const e = c.at(c.world(FO_HI));
      if (e) c.click(e.x + 3, e.y + 1, 'mouse', true);
      c.hover(e ? e.x + 3 : 0, e ? e.y + 1 : 0, 'mouse', false);
      const m = v.measurement();
      rows.push([
        'measure',
        m ? [r10s(m.b), r10(m.distance), m.snapB ?? null, m.axisB ?? null, m.lockedB ?? null] : null,
        !!m && Math.abs(m.distance - (FO_UP[2]! - FO_HI[2]!)) < 1e-9,
        v.measurePoints.map((q: any) => [q.snap, !!q.refined, !!q.locked, q.face?.id ?? null]),
      ]);
      return rows;
    };
    const out: unknown[] = [];
    const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
    const refined = sweep(exact);
    out.push(['refined', refined], ['calls', { ...count }]);
    const plain = sweep(null);
    out.push(['refined-differs', !same(refined, plain)]);
    out.push(['null-same', same(sweep(() => null), plain)]);
    out.push(['open-filter-same', same(sweep((i: any) => (i.open ? null : exact(i))), plain)]);
    out.push(['far-same', same(sweep((i: any) => (i.kind === 'axisFace' ? lineSphere(i.line.origin, i.line.dir, i.point, true) : null)), plain)]);
    out.push([
      'off-axis-same',
      same(
        sweep((i: any) => {
          if (i.kind !== 'axisFace') return null;
          const p = lineSphere(i.line.origin, i.line.dir, i.point);
          return p ? [p[0]! + 0.3, p[1]!, p[2]!] : null;
        }),
        plain,
      ),
    ]);
    return out;
  },
};

/**
 * arc 자료의 원판(ARC_DISK — 12토막, 15° + 30°·k 꼭짓점) 토막 2(75°–105°)의 현은 X축과 나란하다(y = c.y + r·sin75°). 그 위 활꼴 안 TW_Y(현과 원 꼭대기의 가운데)를 지나는
 * X축의 첫 점 TW_A(앱 붙잡기 점)는 원과 두 자리 TW_PLUS·TW_MINUS에서 만난다(현과는 만나지 않는다 — 0.20.0은 현 가운데 힌트 하나로 같은 거리의 두 교차 가운데 하나)
 */
const TW_Y = ARC_DISK.c[1]! + ARC_DISK.r * (1 + Math.sin((75 * Math.PI) / 180)) / 2;
const TW_DX = Math.sqrt(ARC_DISK.r * ARC_DISK.r - (TW_Y - ARC_DISK.c[1]!) ** 2);
const TW_A = [ARC_DISK.c[0]! - 35, TW_Y, ARC_DISK.c[2]!];
const TW_PLUS = [ARC_DISK.c[0]! + TW_DX, TW_Y, ARC_DISK.c[2]!];
const TW_MINUS = [ARC_DISK.c[0]! - TW_DX, TW_Y, ARC_DISK.c[2]!];
/** 원판을 맞춰 본 뒤 조금 다가간다(한 mm가 12화소쯤 — 교차에서 현 끝 꼭짓점까지 1.5 mm가 붙잡기 거리보다 멀다) */
function twiceCamera(v: V): void {
  v.setView('seIso', false);
  v.fitItems([ARC_DISK.id], false);
  const cam = v.getCamera();
  v.setCamera({ ...cam, distance: cam.distance * 0.7 });
  v.renderNow();
}
/** 0.22.0 한 토막 활꼴의 두 교차(둘째 힌트)가 있는 판인지 — TW_A를 첫 점으로 찍고 TW_PLUS를 가리켜 현 끝의 발이 힌트로 오는지 본다 */
const v0220twice: Need = (v, c) => {
  const why = all(v0200open, fn('fitItems', 'getCamera', 'setCamera'))(v, c);
  if (why) return why;
  v.setGroupVisible('공구 경로', false);
  v.setGroupVisible('구멍', false);
  twiceCamera(v);
  v.setMeasureMode(true);
  const endX = ARC_DISK.c[0]! + ARC_DISK.r * Math.cos((75 * Math.PI) / 180);
  let twin = false;
  v.setMeasureSnap({
    edges: true,
    points: [{ point: c.world(TW_A), kind: 'point' }],
    inference: { axisEdges: true },
    // 윤곽선 끝점은 float32라 1e-4 안이면 그 끝의 발이다(현 가운데 힌트는 5 mm 떨어져 있다)
    refine: (i: any) => ((twin ||= i.kind === 'axisEdge' && !!i.open && Math.abs(i.point[0] - c.world([endX, 0, 0])[0]!) < 1e-4), null),
  });
  const a = c.at(c.world(TW_A));
  const t = c.at(c.world(TW_PLUS));
  if (a && t) {
    c.click(a.x + 1, a.y);
    c.hover(t.x + 1, t.y + 3);
    v.renderNow();
  }
  v.setMeasureSnap(null);
  v.clearMeasure();
  v.setMeasureMode(false);
  v.setGroupVisible('공구 경로', true);
  v.setGroupVisible('구멍', true);
  v.setView('seIso', false);
  v.fit(false);
  return twin ? null : '이 판에 없는 동작: 0.22.0 한 토막 활꼴의 두 교차(refine — axisEdge, open의 둘째 힌트)';
};

/**
 * 0.22.0 한 토막 활꼴의 두 교차 값(arc 자료): TW_A를 첫 점으로 찍고 그 X축이 원판 원과 만나는 두 자리(TW_PLUS·TW_MINUS)를 가리킨 미리 보기(원 위인지·선분), 앱 호출 수와 힌트 자리
 * (현 가운데·현 두 끝의 발 — 같은 둘레를 다시 가리켜도 늘지 않는다, Shift로 잠가도 0번), 조금 기운 방향 잠금(현과 나란하지 않은 같은 평면 선 — 가까운 끝·다른 끝의 발)의 두 자리,
 * 두 점째로 찍은 거리, 같은 차례를 refine 없이·null·선에서 벗어난 점·이웃 토막 곡선 위 점으로 되풀이한 값이 refine 없이와 같은지
 */
const twiceValues: ValueSet = {
  name: 'arc-measure-axis-twice',
  data: 'arc',
  needs: v0220twice,
  run: (c) => {
    const { v } = c;
    const K = ARC_DISK;
    const KC = c.world(K.c);
    const dist3 = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
    const onArc = (p: readonly number[]): boolean => Math.abs(Math.hypot(p[0]! - KC[0]!, p[1]! - KC[1]!) - K.r) < 1e-9 && Math.abs(p[2]! - KC[2]!) < 1e-9;
    const hints: number[] = [];
    let calls = 0;
    /** 원판 평면 위 직선과 원의 교차 가운데 point에 가까운 근 */
    const lineCircle = (i: any): number[] | null => {
      const o = i.line.origin, d = i.line.dir;
      if (Math.abs(d[2]) > 1e-12 || Math.abs(o[2] - KC[2]!) > 1e-9) return null;
      const wx = o[0] - KC[0]!, wy = o[1] - KC[1]!;
      const b = wx * d[0] + wy * d[1], cc = wx * wx + wy * wy - K.r * K.r, a = d[0] * d[0] + d[1] * d[1];
      const disc = b * b - a * cc;
      if (disc < 0) return null;
      const ts = [(-b - Math.sqrt(disc)) / a, (-b + Math.sqrt(disc)) / a].map((t) => [o[0] + d[0] * t, o[1] + d[1] * t, o[2]]);
      return dist3(ts[0]!, i.point) <= dist3(ts[1]!, i.point) ? ts[0]! : ts[1]!;
    };
    const exact = (i: any): number[] | null => {
      if (i.kind !== 'axisEdge' || !i.line) return null;
      if (i.open) {
        calls++;
        if (i.segment.id === K.id && i.segment.index === 2) hints.push(r10(i.point[0] - KC[0]!));
      }
      return i.segment.id === K.id ? lineCircle(i) : null;
    };
    const row = (name: string, p: readonly number[], dx: number, dy: number, shift = false): unknown[] => {
      const r = lockHoverRow(c, name, p, dx, dy, shift);
      const h = v.measureHoverSnap;
      return [...r, h ? onArc(h.point) : null];
    };
    const sweep = (refine: ((i: any) => number[] | null) | null): unknown[] => {
      const rows: unknown[] = [];
      v.setGroupVisible('공구 경로', false);
      v.setGroupVisible('구멍', false);
      twiceCamera(v);
      v.setMeasureMode(true);
      v.setMeasureSnap({ edges: true, points: [{ point: c.world(TW_A), kind: 'point' }], inference: { axes: true, lock: true, axisEdges: true, lockEdges: true }, ...(refine ? { refine } : {}) });
      v.clearMeasure();
      const a = c.at(c.world(TW_A));
      if (a) c.click(a.x + 1, a.y);
      rows.push(['first', v.measurePoints.map((q: any) => [r10s(q.point), q.snap])]);
      const n0 = calls;
      rows.push(row('plus', TW_PLUS, 1, 3), row('minus', TW_MINUS, 1, 3), row('plus', TW_PLUS, 3, 1), ['calls', calls - n0]);
      const n1 = calls;
      rows.push(row('shift', TW_PLUS, 3, 1, true), row('shift', TW_MINUS, 3, 1, true), ['calls', calls - n1]);
      // 조금 기운 방향(1, 0.004, 0)으로 잠근 선 — 현의 직선과 같은 평면에서 105° 끝 밖 멀리 만난다
      v.setMeasureInferenceLock({ direction: [1, 0.004, 0] });
      const tilt = (sgn: number): number[] => {
        // 잠근 선 y = TW_Y + 0.004·(x − TW_A.x)와 원의 교차(가까운 쪽)
        const s = 0.004, y0 = TW_Y - s * TW_A[0]! - K.c[1]!;
        const A = 1 + s * s, B = 2 * (s * y0 - K.c[0]!), C = K.c[0]! * K.c[0]! + y0 * y0 - K.r * K.r;
        const x = (-B + sgn * Math.sqrt(B * B - 4 * A * C)) / (2 * A);
        return [x, K.c[1]! + y0 + s * x, K.c[2]!];
      };
      rows.push(row('tilt', tilt(1), 1, 3), row('tilt', tilt(-1), 1, 3));
      v.setMeasureInferenceLock(false);
      const e = c.at(c.world(TW_PLUS));
      if (e) c.click(e.x + 1, e.y + 3);
      const m = v.measurement();
      rows.push(['measure', m ? [r10s(m.b), r10(m.distance), m.snapB ?? null, m.axisB ?? null] : null, !!m && Math.abs(m.distance - (TW_PLUS[0]! - TW_A[0]!)) < 1e-9]);
      return rows;
    };
    const out: unknown[] = [];
    const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
    const refined = sweep(exact);
    out.push(['refined', refined], ['calls', calls], ['hints', [...new Set(hints)].sort((p, q) => p - q)]);
    const plain = sweep(null);
    out.push(['refined-differs', !same(refined, plain)]);
    out.push(['null-same', same(sweep(() => null), plain)]);
    out.push(['off-line-same', same(sweep((i: any) => (i.kind === 'axisEdge' && i.line ? [i.point[0], i.point[1] + 0.4, i.point[2]] : null)), plain)]);
    out.push([
      'neighbor-same',
      same(
        sweep((i: any) => {
          // 원 위 40° 옆(이웃 토막 곡선 위 — 이 토막 범위 밖)
          if (i.kind !== 'axisEdge' || !i.line) return null;
          const p = lineCircle(i);
          if (!p) return null;
          const t = Math.atan2(p[1]! - KC[1]!, p[0]! - KC[0]!) + (40 * Math.PI) / 180;
          return [KC[0]! + K.r * Math.cos(t), KC[1]! + K.r * Math.sin(t), KC[2]!];
        }),
        plain,
      ),
    ]);
    return out;
  },
};

/** 0.22.0 누르기 알림의 그물 면만 고르기(onPick(cb, { meshesOnly }))가 있는 판인지 — 상자 앞 윗모서리(윤곽선 고르기)를 눌러 그 알림이 그물 면을 받는지 본다 */
const v0220onPickMeshes: Need = (v, c) => {
  const why = fn('project', 'setPickEdges', 'onPick')(v, c);
  if (why) return why;
  v.setPickEdges(true);
  let got: any;
  const off = v.onPick((p: any) => (got = p), { meshesOnly: true });
  const q = c.at(c.world([30, 0, 40]));
  if (q) c.click(q.x, q.y + 0.5);
  off();
  v.setPickEdges(false);
  return got && got.kind === 'mesh' ? null : '이 판에 없는 선택: 0.22.0 누르기 알림의 그물 면만 고르기(onPick meshesOnly)';
};

/**
 * 0.22.0 누르기 알림의 그물 면만 고르기 값(base·off): 윤곽선 고르기를 켜고 화면 격자 점마다 눌러, 선택 없이 단 알림과 meshesOnly로 단 알림이 받은 종류 짝 수,
 * 앞 알림이 pick(x, y)와, 뒤 알림이 pick(x, y, { meshesOnly: true })와 같은지(다른 자리 수), 상자 윗모서리·공구 경로 위 몇 자리의 두 알림 값
 */
function onPickMeshesValues(d: 'base' | 'off'): ValueSet {
  return {
    name: `${d}-pick-on-meshes-only`,
    data: d,
    needs: v0220onPickMeshes,
    run: (c) => {
      const { v } = c;
      v.setPickEdges(true);
      let plain: any = undefined, faces: any = undefined;
      const off1 = v.onPick((p: any) => (plain = p));
      const off2 = v.onPick((p: any) => (faces = p), { meshesOnly: true });
      const kinds = new Map<string, number>();
      let plainDiff = 0, facesDiff = 0, total = 0;
      for (let y = 26; y < c.h; y += 61)
        for (let x = 24; x < c.w; x += 67) {
          plain = faces = undefined;
          c.click(x + 0.3, y + 0.4);
          const key = `${plain?.kind ?? '-'}>${faces?.kind ?? '-'}`;
          kinds.set(key, (kinds.get(key) ?? 0) + 1);
          if (JSON.stringify(plain) !== JSON.stringify(v.pick(x + 0.3, y + 0.4))) plainDiff++;
          if (JSON.stringify(faces) !== JSON.stringify(v.pick(x + 0.3, y + 0.4, { meshesOnly: true }))) facesDiff++;
          total++;
        }
      const spots: unknown[] = [];
      for (const p of [
        [30, 0, 40],
        [100, 40, 40],
        [60, 40, 110],
      ]) {
        const q = c.at(c.world(p));
        if (!q) {
          spots.push(null);
          continue;
        }
        plain = faces = undefined;
        c.click(q.x + 0.4, q.y + 0.5);
        const row = (k: any): unknown[] | null => (k ? [k.kind, k.id, Number.isInteger(k.index), r10s(k.normal)] : null);
        spots.push([row(plain), row(faces)]);
      }
      off1();
      off2();
      v.setPickEdges(false);
      return [['kinds', [...kinds].sort()], ['same', total, plainDiff, facesDiff], ['spots', spots]];
    },
  };
}

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
  segmentValues,
  trackValues('base'),
  trackValues('off'),
  trackPairValues('base'),
  trackPairValues('off'),
  axisEdgeValues('base'),
  axisEdgeValues('off'),
  axisEdgeRefineValues,
  axisFaceValues,
  lockEdgeValues('base'),
  lockEdgeValues('off'),
  lockFaceValues,
  lockRefineValues,
  axisOpenValues,
  meshesOnlyValues('base'),
  meshesOnlyValues('off'),
  lockTrackValues('base'),
  lockTrackValues('off'),
  clearRefineValues,
  onFaceValues,
  faceOpenValues,
  twiceValues,
  onPickMeshesValues('base'),
  onPickMeshesValues('off'),
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
