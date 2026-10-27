/**
 * 개발 확인 페이지(dev/viewer3d.html) 스크립트. 패키지 입구(src/index.ts)에서는 내보내지 않는다.
 * 주소 인자: ?segs=선분 수&sseg=구 경도 칸 수&theme=light
 *   &offset=1e6      장면을 (offset, −offset/2, offset/100)만큼 옮긴다(큰 좌표 확인, 묶음 원점 방식)
 *   &bake=1          위와 같이 옮기되 원점 없이 positions에 더해 넣는다(예전 방식 — 떨림 비교용)
 *   &section=z:0.5   처음부터 단면(축:범위 안 위치 0~1, 뒤에 :flip을 붙이면 반대쪽)
 *   &incremental=1   장면을 여러 프레임에 나눠 올린다(진행은 아래 상태 줄)
 *   &tex=1           무늬 상자·원근 무늬 판을 더한다(바둑판 BMP, 맨 위 왼쪽 칸이 빨강)
 * 0.7.0 단추: 숨은 선·단색·무늬 없음 모드, 외곽선·숨은 점선·하늘·해·그림자·안개·걷기·윤곽선 고르기
 * 0.8.0 단추: 붙잡기+(가운데 점·앱 중심 점), 음영 뒤 모서리, 대비 선 색, 중력·부딪힘(걷기)
 * 0.9.0 단추: 추론 붙잡기(붙잡기+에 교차점·수직 발·축 방향까지), 그물 선 색(상자·구의 윤곽선·외곽선 색)
 * 자동 확인용으로 window.v3dDev(viewer, scene, bench, snapshot, diff, hideDemo, hiDemo …)를 둔다.
 */
import { itemBounds } from './bounds';
import { buildBvh } from './bvh';
import { VIEW_LABELS, type ViewName } from './camera';
import type { RenderMode } from './renderer';
import type { SectionAxis } from './section';
import { syntheticScene } from './synth';
import type { Scene3d, SnapPoint } from './types';
import { type SectionCaps, Viewer3d } from './viewer';

const q = new URLSearchParams(location.search);
const segs = Math.max(1, Number(q.get('segs') ?? 300_000) | 0);
const sseg = Math.max(4, Number(q.get('sseg') ?? 128) | 0);
const offset = Number(q.get('offset') ?? 0) || 0;
const bake = q.get('bake') === '1';
const incremental = q.get('incremental') === '1';
const tex = q.get('tex') === '1';
let theme: 'dark' | 'light' = q.get('theme') === 'light' ? 'light' : 'dark';
document.body.dataset.theme = theme;

const bar = document.getElementById('bar')!;
const view = document.getElementById('view')!;
const status = document.getElementById('status')!;

/** offset 하나 → 장면 이동량(세 축 모두 크게 — Z도 확인한다) */
const offsetVec = (k: number): [number, number, number] => [k, -k / 2, k / 100];
const makeScene = (o: { offset?: number; bake?: boolean; segs?: number; sseg?: number } = {}): Scene3d =>
  syntheticScene({ segments: o.segs ?? segs, sphereSeg: o.sseg ?? sseg, offset: offsetVec(o.offset ?? 0), bake: o.bake, textures: tex });

const viewer = new Viewer3d(view, { theme });
let info = '';
let pickInfo = '';
let secInfo = '';
let upInfo = '';
/** 나눠 올리기 진행 알림 기록(자동 확인용) */
const progress: [number, number][] = [];
let scene: Scene3d = makeScene({ offset, bake });
viewer.setScene(scene, incremental ? { incremental: true, onProgress: (d, t) => onProgress(d, t) } : {});
function onProgress(d: number, t: number): void {
  progress.push([d, t]);
  upInfo = d < t ? `올리는 중 ${d}/${t}` : `다 올림 ${t}`;
  showStatus();
}

const showStatus = (): void => {
  const s = viewer.stats;
  const off = offset ? ` · 이동 ${offset.toExponential(0)}${bake ? '(굽기)' : '(원점)'}` : '';
  const tx = s.textures.count ? ` · 무늬 ${s.textures.ready}/${s.textures.count}` : '';
  status.textContent = `선분 ${segs.toLocaleString()} · 그리기 ${s.drawCalls}회 · 삼각형 ${Math.round(s.triangles).toLocaleString()} · CPU ${s.frameMs.toFixed(1)} ms · ${s.width}×${s.height}@${s.dpr}${off}${tx}  ${upInfo}  ${secInfo}  ${info}  ${pickInfo}`;
};
viewer.onCameraChange(() => {
  showStatus();
  placeHandle();
});

const button = (label: string, fn: () => void, title?: string): HTMLButtonElement => {
  const b = document.createElement('button');
  b.textContent = label;
  if (title) b.title = title;
  b.addEventListener('click', fn);
  bar.append(b);
  return b;
};
const sep = (): void => {
  const s = document.createElement('span');
  s.className = 'sep';
  bar.append(s);
};

for (const v of ['top', 'front', 'right', 'back', 'left', 'bottom', 'seIso', 'swIso', 'neIso', 'nwIso'] as ViewName[]) button(VIEW_LABELS[v], () => viewer.setView(v));
button('전체', () => viewer.fit());
sep();
const projBtn = button('원근', () => {
  const p = viewer.getProjection() === 'perspective' ? 'orthographic' : 'perspective';
  viewer.setProjection(p);
  projBtn.textContent = p === 'perspective' ? '원근' : '평행';
});
const modes: [RenderMode, string][] = [
  ['shaded', '음영'],
  ['shadedEdges', '음영+윤곽'],
  ['wireframe', '와이어'],
  ['xray', 'X-ray'],
  ['hiddenLine', '숨은 선'],
  ['monochrome', '단색'],
  ['noTexture', '무늬 없음'],
];
const modeBtns = modes.map(([m, l]) =>
  button(l, () => {
    viewer.setRenderMode(m);
    modeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(modes[i]![0] === m)));
  }),
);
modeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(modes[i]![0] === viewer.getRenderMode())));
sep();
const measureBtn = button('측정', () => {
  viewer.setMeasureMode(!viewer.measureMode);
  measureBtn.setAttribute('aria-pressed', String(viewer.measureMode));
});
button('테마', () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  document.body.dataset.theme = theme;
  viewer.setTheme(theme);
});
let gridOn = true;
button('격자', () => viewer.setGridVisible((gridOn = !gridOn)));
// 0.7.0 보여 주기(눌러서 켜고 끄기)
const toggle = (label: string, on: (v: boolean) => void, title?: string): void => {
  let v = false;
  const b = button(label, () => {
    v = !v;
    on(v);
    b.setAttribute('aria-pressed', String(v));
  }, title);
};
toggle('외곽선', (v) => viewer.setRenderOptions({ profiles: v }));
toggle('숨은 점선', (v) => viewer.setRenderOptions({ hiddenEdges: v }), '숨은 선 모드에서 면 뒤 윤곽선');
toggle('하늘', (v) => viewer.setBackground(v ? { sky: '#5d8fd0', skyHorizon: '#cfe0f2', ground: '#6d6656', groundHorizon: '#b3ad9c' } : null));
toggle('해', (v) => viewer.setLighting(v ? { sun: { direction: [-0.4, -0.6, 0.8] } } : null));
toggle('그림자', (v) => viewer.setLighting(v ? { sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true } : null));
toggle('안개', (v) => {
  const c = viewer.getCamera();
  viewer.setFog(v ? { start: c.distance * 0.7, end: c.distance * 1.6 } : null);
});
toggle('걷기', (v) => viewer.setNavigation(v ? 'walk' : 'orbit'), '끌기 = 둘러보기, WASD·화살표·휠 = 걷기, 두 번 누르기 = 서기');
toggle('윤곽선 고르기', (v) => viewer.setPickEdges(v));
toggle('중력·부딪힘', (v) => viewer.setNavigation(viewer.navigation, { gravity: v, collide: v }), '걷기에서 바닥 따라가기·벽에서 멈추기(0.8.0)');
// 0.8.0: 측정 붙잡기 넓히기(가운데 점·앱 점 — 구 중심과 상자 윗면 가운데를 '중심'으로), 음영 뒤 모서리, 대비 선 색
toggle(
  '붙잡기+',
  (v) => viewer.setMeasureSnap(v ? { midpoints: true, edges: true, points: demoSnapPoints() } : null),
  '측정 점을 선분·윤곽선 가운데 점과 앱 점(중심)에도 붙잡기',
);
// 0.9.0: 추론 붙잡기(교차점·첫 점에서 내린 수직 발·첫 점의 X·Y·Z 축 방향), 그물마다 윤곽선·외곽선 색
toggle(
  '추론 붙잡기',
  (v) => viewer.setMeasureSnap(v ? { midpoints: true, edges: true, points: demoSnapPoints(), inference: true } : null),
  '붙잡기+에 더해 두 선분 교차점, 첫 점에서 내린 수직 발, 첫 점의 X·Y·Z 축 방향에도 붙잡기',
);
toggle('그물 선 색', (v) => {
  viewer.setItemEdgeColor('상자', v ? '#e0245e' : null);
  viewer.setItemEdgeColor('구', v ? '#22aa66' : null);
  viewer.setItemProfileColor('상자', v ? '#e0245e' : null);
  viewer.setItemProfileColor('구', v ? '#2266dd' : null);
}, '상자·구의 윤곽선·외곽선을 제 색으로(외곽선을 함께 켜서 본다)');
toggle('음영 뒤 모서리', (v) => viewer.setRenderOptions({ hiddenEdges: v ? { shaded: true } : null }), '음영 계열 모드에서도 면 뒤 윤곽선을 점선으로');
toggle('대비 선 색', (v) => viewer.setRenderOptions({ edgeColor: v ? 'contrast' : null, ...(viewer.renderOptions.profiles ? { profiles: { width: viewer.renderOptions.profiles.width, color: v ? 'contrast' : undefined } } : {}) }));
button('PNG', () => {
  void viewer.toBlob('image/png').then((b) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = '3d-view.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
});
sep();
// 단면
const secBtns: HTMLButtonElement[] = [];
const secRange = document.createElement('input');
const pressSec = (): void => {
  const st = viewer.section;
  secBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.axis === (st?.axis ?? 'off'))));
  secRange.disabled = !st;
  if (st) secRange.value = String(Math.round(st.t * 1000));
  placeHandle();
};
for (const a of ['off', 'x', 'y', 'z'] as const) {
  const b = button(a === 'off' ? '단면 끔' : `단면 ${a.toUpperCase()}`, () => {
    if (a === 'off') viewer.setSection(null);
    else viewer.setSectionAxis(a, viewer.section?.axis === a ? viewer.section.t : 0.5);
    pressSec();
  });
  b.dataset.axis = a;
  secBtns.push(b);
}
button('뒤집기', () => {
  viewer.flipSection();
  pressSec();
});
const capsModes: SectionCaps[] = ['closed', 'all', 'none'];
const capsBtn = button('채우기: 닫힌 것', () => {
  const st = viewer.section;
  const next = capsModes[(capsModes.indexOf(st?.caps ?? 'closed') + 1) % 3]!;
  viewer.setSectionOptions({ caps: next });
  capsBtn.textContent = `채우기: ${next === 'closed' ? '닫힌 것' : next === 'all' ? '모두' : '없음'}`;
});
secRange.type = 'range';
secRange.id = 'secpos';
secRange.min = '0';
secRange.max = '1000';
secRange.title = '단면 위치(장면 범위 안 0~1)';
secRange.disabled = true;
secRange.addEventListener('input', () => viewer.setSectionPosition(Number(secRange.value) / 1000));
bar.append(secRange);
// 화면 위 단면 손잡이(sectionHandle·moveSectionByPixels 확인용)
const handle = document.createElement('div');
handle.id = 'sechandle';
handle.title = '끌어서 단면 옮기기';
view.append(handle);
function placeHandle(): void {
  const h = viewer.section ? viewer.sectionHandle() : null;
  handle.hidden = !h;
  if (h) handle.style.transform = `translate(${h.x - 8}px, ${h.y - 8}px)`;
}
let hdrag: { x: number; y: number } | null = null;
handle.addEventListener('pointerdown', (e) => {
  hdrag = { x: e.clientX, y: e.clientY };
  try {
    handle.setPointerCapture(e.pointerId);
  } catch {
    /* 자동 확인의 합성 사건 */
  }
  e.stopPropagation();
});
handle.addEventListener('pointermove', (e) => {
  if (!hdrag) return;
  // 슬라이더·손잡이는 onSectionChange 알림에서 맞춘다
  viewer.moveSectionByPixels(e.clientX - hdrag.x, e.clientY - hdrag.y);
  hdrag = { x: e.clientX, y: e.clientY };
});
handle.addEventListener('pointerup', () => (hdrag = null));
const secArg = q.get('section');
if (secArg) {
  const [a, t, f] = secArg.split(':');
  if (a === 'x' || a === 'y' || a === 'z') viewer.setSectionAxis(a as SectionAxis, Number(t ?? 0.5), { flip: f === 'flip' });
}
sep();
// 묶음 켜고 끄기
for (const g of viewer.groups()) {
  const l = document.createElement('label');
  const c = document.createElement('input');
  c.type = 'checkbox';
  c.checked = g.visible;
  c.addEventListener('change', () => viewer.setGroupVisible(g.name, c.checked));
  l.append(c, ` ${g.name}`);
  bar.append(l);
}
sep();
// 공구 경로 재생
const play = document.createElement('input');
play.type = 'range';
play.id = 'play';
play.min = '0';
play.max = String(segs);
play.value = String(segs);
play.title = '공구 경로 재생(앞에서 몇 선분까지)';
bar.append(play);
const setPlay = (n: number): void => {
  const line = scene.lines[0]!;
  if (n >= segs) {
    viewer.setLineDrawRange(line.id, null);
    viewer.setMarker(null);
    return;
  }
  viewer.setLineDrawRange(line.id, n, { ghost: 0.12 });
  const o = Math.max(0, n - 1) * 6 + 3;
  const P = line.positions;
  viewer.setMarker([P[o]!, P[o + 1]!, P[o + 2]!], 'ball');
};
play.addEventListener('input', () => setPlay(Number(play.value)));

/** 고르기 알림 기록(자동 확인용) */
const picks: { id: string | null; alt: boolean; shift: boolean; clicks: number }[] = [];
viewer.onPick((p, e) => {
  picks.push({ id: p?.id ?? null, alt: e.altKey, shift: e.shiftKey, clicks: e.clicks });
  viewer.highlight(p ? [p.id] : null);
  const mods = [e.altKey && 'Alt', e.ctrlKey && 'Ctrl', e.shiftKey && 'Shift', e.metaKey && 'Meta', e.clicks > 1 && '두 번'].filter(Boolean).join('+');
  pickInfo = p ? `고름: ${p.kind} "${p.id}" #${p.index}${mods ? ` [${mods}]` : ''} (${p.point.map((v) => v.toFixed(2)).join(', ')})` : '';
  showStatus();
});
/** 단면 알림 기록(자동 확인용) — 단추·슬라이더도 이 알림으로 맞춘다 */
const sections: (number | null)[] = [];
viewer.onSectionChange((s) => {
  sections.push(s ? s.t : null);
  secInfo = s ? `단면 ${s.axis ?? '임의'}${s.flip ? '(뒤집음)' : ''} t=${s.t.toFixed(3)}` : '';
  pressSec();
  showStatus();
});

// 묶음 안 구간 숨기기·강조(구: 삼각형 띠, 공구 경로: 선분 구간, 상자: 윗면과 그 윤곽선, 구멍: 첫 줄)
const sphere = (): { id: string; tris: number } => {
  const m = scene.meshes.find((x) => x.id === '구')!;
  return { id: m.id, tris: m.indices ? m.indices.length / 3 : m.positions.length / 9 };
};
function hideDemo(on: boolean): void {
  if (!on) return viewer.clearHiddenRanges();
  const s = sphere();
  const band: { start: number; count: number }[] = [];
  for (let t = 0; t < s.tris; t += 1000) band.push({ start: t, count: 500 });
  viewer.setHiddenRanges(s.id, band);
  const n = scene.lines[0]!.positions.length / 6;
  const cut: { start: number; count: number }[] = [];
  for (let i = 0; i < n; i += Math.max(2, Math.floor(n / 40))) cut.push({ start: i, count: Math.max(1, Math.floor(n / 80)) });
  viewer.setHiddenRanges(scene.lines[0]!.id, cut);
  viewer.setHiddenRanges('상자', { prims: [{ start: 2, count: 2 }], edges: [{ start: 4, count: 4 }] });
  viewer.setHiddenRanges('구멍', [{ start: 0, count: 6 }]);
}
function hiDemo(on: boolean): void {
  if (!on) return viewer.highlightRanges(null);
  const s = sphere();
  viewer.highlightRanges({
    [s.id]: [{ start: Math.floor(s.tris * 0.55), count: Math.floor(s.tris * 0.15) }],
    [scene.lines[0]!.id]: [{ start: 0, count: Math.floor(scene.lines[0]!.positions.length / 6 / 4) }],
    상자: { prims: [{ start: 4, count: 2 }], edges: [{ start: 8, count: 4 }] },
    구멍: [{ start: 6, count: 6 }],
  });
}
let hideOn = false, hiOn = false;
sep();
const hideBtn = button('구간 숨김', () => {
  hideDemo((hideOn = !hideOn));
  hideBtn.setAttribute('aria-pressed', String(hideOn));
});
const hiBtn = button('구간 강조', () => {
  hiDemo((hiOn = !hiOn));
  hiBtn.setAttribute('aria-pressed', String(hiOn));
});
viewer.onMeasure((m) => {
  // 붙잡기를 켰으면 두 점의 종류(축 붙잡기는 0.9.1부터 그 축)
  const snap = m && (m.snapA !== undefined || m.snapB !== undefined) ? ` · ${m.snapA ?? '자유'} → ${m.snapB === 'axis' && m.axisB ? `${m.axisB.toUpperCase()}축` : (m.snapB ?? '자유')}` : '';
  info = m ? `측정: ${m.distance.toFixed(3)} mm (ΔX ${m.dx.toFixed(3)} ΔY ${m.dy.toFixed(3)} ΔZ ${m.dz.toFixed(3)})${snap}` : '';
  showStatus();
});

/** 큰 자료 측정: 선분 segs개 + 구(sseg) 장면을 올리고 프레임·BVH·고르기 시간을 잰다 */
async function bench(o: { segs?: number; sseg?: number; frames?: number; width?: number } = {}): Promise<Record<string, number | string>> {
  const res: Record<string, number | string> = {};
  const nf = o.frames ?? 12;
  let t = performance.now();
  const sc = syntheticScene({ segments: o.segs ?? 3_000_000, sphereSeg: o.sseg ?? 1000 });
  res.genMs = performance.now() - t;
  if (o.width) sc.lines[0]!.width = o.width;
  res.segments = sc.lines[0]!.positions.length / 6;
  res.triangles = sc.meshes.reduce((a, m) => a + (m.indices ? m.indices.length / 3 : m.positions.length / 9), 0);
  const gl = viewer.canvas.getContext('webgl2')!;
  res.renderer = String(gl.getParameter(gl.RENDERER));
  const px = new Uint8Array(4);
  const sync = (): void => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  t = performance.now();
  viewer.setScene(sc);
  scene = sc;
  res.setSceneMs = performance.now() - t;
  t = performance.now();
  viewer.renderNow();
  sync();
  res.firstFrameMs = performance.now() - t;
  // 고르기(BVH가 아직 없으면 여기서 만든다)
  const w = viewer.canvas.clientWidth, h = viewer.canvas.clientHeight;
  t = performance.now();
  const p0 = viewer.pick(w * 0.45, h * 0.45);
  res.firstPickMs = performance.now() - t;
  res.firstPick = p0 ? `${p0.kind}:${p0.id}#${p0.index}` : '없음';
  t = performance.now();
  let hits = 0;
  for (let i = 0; i < 20; i++) if (viewer.pick(w * (0.3 + i * 0.02), h * (0.35 + i * 0.015))) hits++;
  res.pickMs = (performance.now() - t) / 20;
  res.pickHits = hits;
  // 가만히 있는 프레임(굵은 선 그대로)
  const times: number[] = [];
  for (let i = 0; i < nf; i++) {
    viewer.orbitBy(0.02, 0);
    t = performance.now();
    viewer.renderNow();
    sync();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  res.idleFrameMedianMs = times[times.length >> 1]!;
  // 끄는 프레임(포인터 사건으로 진짜 경로를 탄다)
  const r = viewer.canvas.getBoundingClientRect();
  const ev = (type: string, x: number, y: number, buttons: number): void => {
    viewer.canvas.dispatchEvent(new PointerEvent(type, { clientX: r.left + x, clientY: r.top + y, button: 0, buttons, pointerId: 7, pointerType: 'mouse', bubbles: true }));
  };
  const drag: number[] = [];
  ev('pointerdown', w / 2, h / 2, 1);
  for (let i = 1; i <= nf; i++) {
    ev('pointermove', w / 2 + i * 6, h / 2 + i * 2, 1);
    t = performance.now();
    viewer.renderNow();
    sync();
    drag.push(performance.now() - t);
  }
  ev('pointerup', w / 2 + nf * 6, h / 2 + nf * 2, 0);
  drag.sort((a, b) => a - b);
  res.dragFrameMedianMs = drag[drag.length >> 1]!;
  res.dragCpuMs = viewer.stats.frameMs;
  // BVH 만들기 시간(따로)
  t = performance.now();
  buildBvh('segment', sc.lines[0]!.positions);
  res.bvhSegmentsMs = performance.now() - t;
  const sph = sc.meshes[1]!;
  t = performance.now();
  buildBvh('triangle', sph.positions, sph.indices);
  res.bvhTrianglesMs = performance.now() - t;
  viewer.renderNow();
  return res;
}

/** 붙잡기+ 시연 점: 구 중심(구 안이라 가려진다 — 단면·와이어프레임에서 보임)과 상자 윗면 가운데('중심') */
function demoSnapPoints(): SnapPoint[] {
  const out: SnapPoint[] = [];
  for (const m of scene.meshes) {
    if (m.id !== '구' && m.id !== '상자') continue;
    const b = itemBounds(m);
    const c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, m.id === '상자' ? b.max[2] : (b.min[2] + b.max[2]) / 2];
    out.push({ point: c, kind: 'center', id: m.id });
  }
  return out;
}

/** 지금 화면(toBlob) → 화소 */
async function snapshot(): Promise<ImageData> {
  const b = await viewer.toBlob('image/png');
  const img = await createImageBitmap(b);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

/** 두 화면의 차이: 화소 채널 차이 최대·평균, 채널 차이가 thr 넘는 화소 비율(%) */
function diff(a: ImageData, b: ImageData, thr = 24): { max: number; mean: number; changedPct: number } {
  if (a.width !== b.width || a.height !== b.height) return { max: 255, mean: 255, changedPct: 100 };
  let max = 0, sum = 0, changed = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(Math.abs(a.data[i]! - b.data[i]!), Math.abs(a.data[i + 1]! - b.data[i + 1]!), Math.abs(a.data[i + 2]! - b.data[i + 2]!));
    if (d > max) max = d;
    sum += d;
    if (d > thr) changed++;
  }
  const n = a.data.length / 4;
  return { max, mean: sum / n, changedPct: (changed / n) * 100 };
}

/** 장면 바꾸기(큰 좌표 비교용). 카메라는 그대로 두지 않는다 */
function load(o: { offset?: number; bake?: boolean; segs?: number; sseg?: number; incremental?: boolean } = {}): Scene3d {
  scene = makeScene(o);
  progress.length = 0;
  viewer.setScene(scene, o.incremental ? { incremental: true, onProgress: (d, t) => onProgress(d, t) } : {});
  hideOn = hiOn = false;
  pressSec();
  return scene;
}

(window as unknown as { v3dDev: unknown }).v3dDev = {
  viewer,
  get scene() {
    return scene;
  },
  bench,
  setPlay,
  load,
  offsetVec,
  snapshot,
  diff,
  demoSnapPoints,
  hideDemo,
  hiDemo,
  picks,
  sections,
  progress,
  ready: true,
};
pressSec();
showStatus();
