/**
 * 개발 확인 페이지(dev/viewer3d.html) 스크립트. 패키지 입구(src/index.ts)에서는 내보내지 않는다.
 * 주소 인자: ?segs=선분 수&sseg=구 경도 칸 수&theme=light
 *   &offset=1e6      장면을 (offset, −offset/2, offset/100)만큼 옮긴다(큰 좌표 확인, 묶음 원점 방식)
 *   &bake=1          위와 같이 옮기되 원점 없이 positions에 더해 넣는다(예전 방식 — 떨림 비교용)
 *   &section=z:0.5   처음부터 단면(축:범위 안 위치 0~1, 뒤에 :flip을 붙이면 반대쪽)
 *   &incremental=1   장면을 여러 프레임에 나눠 올린다(진행은 아래 상태 줄)
 *   &tex=1           무늬 상자·원근 무늬 판을 더한다(바둑판 BMP, 맨 위 왼쪽 칸이 빨강)
 *   &compact=1       0.26.0 작은 배열: 그물 법선을 Int8(정점 4값), 무늬 좌표를 Int16 + uvTransform으로 준다(syntheticScene compact — 상태 줄에 법선·무늬 좌표 바이트)
 * 0.7.0 단추: 숨은 선·단색·무늬 없음 모드, 외곽선·숨은 점선·하늘·해·그림자·안개·걷기·윤곽선 고르기
 * 0.8.0 단추: 붙잡기+(가운데 점·앱 중심 점), 음영 뒤 모서리, 대비 선 색, 중력·부딪힘(걷기)
 * 0.9.0 단추: 추론 붙잡기(붙잡기+에 교차점·수직 발·축 방향까지), 그물 선 색(상자·구의 윤곽선·외곽선 색)
 * 0.10.0 단추: 나란함·잠금(추론 붙잡기에 나란함과 Shift 잠금까지), 잠금(앱 단추 꼴 setMeasureInferenceLock)
 * 0.16.0 단추: 끌어온 축(나란함·잠금에 inference.track까지). 측정 상태 줄에 둘째 점이 놓인 선분(묶음 id#번호)·끌어온 점
 * 0.17.0: 같은 단추로 끌어온 두 점의 축이 만나는 점·끌어온 축이 모서리와 만나는 점. 상태 줄에 미리 보기의 끌어온 축(둘째 축·놓인 선분)
 * 0.18.0 단추: 축과 모서리(끌어온 축에 inference.axisEdges까지, 수직 발은 끈다 — 첫 점 축이 모서리와 만나는 점). 상태 줄에 미리 보기의 첫 점 축과 놓인 선분.
 *   축과 면(축과 모서리에 inference.axisFaces까지 — 첫 점 축·끌어온 축이 면을 뚫는 점). 상태 줄에 뚫은 면의 그물 id
 * 0.19.0 단추: 잠근 선 교차(축과 면에 inference.lockEdges·lockFaces와 refineFace까지 — 잠근 동안 잠근 선이 모서리와 만나는 점·면을 뚫는 점,
 *   축이 구를 뚫는 점은 정확한 구 위로). 상태 줄에 "잠근 Z축 · 구 면(다듬음)"
 * 0.20.0 단추: 열린 교차(잠근 선 교차에 시연 원·기둥과 refine까지 — 기둥 아래 끝을 첫 점으로 찍고 그 Z축이 원을 뚫는 자리를 가리키면 현과는 만나지 않아도
 *   정확한 원 위 교차에 붙는다. 잠근 선이 축이 아니어도 다듬는다). 상태 줄에 "첫 점 Z축 · 시연 원#111 위(다듬음)".
 *   면만 고르기(누른 자리의 pick(x, y, { meshesOnly: true }) — 상태 줄 고름 뒤에 "아래 면")
 * 0.21.0 단추: 끌어온 축 잠금(열린 교차에 inference.lockTracks까지 — 잠근 동안 잠근 선이 끌어온 점의 축과 만나는 점, 상태 줄에 "잠근 X축 · (…)의 Y축과 만나는 점").
 *   구 위 아무 데나 가리키면 refineFace('onFace')로 정확한 구 위 점(상태 줄에 "면 위(다듬음)" — 0.19.0 단추부터 같은 함수라 함께 붙는다).
 *   다듬기 기억 비우기(clearMeasureRefine — 상태 줄에 비운 수)
 * 0.22.0: 같은 단추들(잠근 선 교차부터)에서 구 위에 뜬 앱 점 '구 스침'(적도 칸 가운데 바깥)을 첫 점으로 찍고 그 Z축이 구를 스치는 자리를 가리키면
 *   그물 삼각형은 비켜 가도 정확한 구 위 교차에 붙는다(면의 열린 교차 — 상태 줄 "첫 점 Z축 · 구 면(다듬음)", 잠가도). 시연 원 위·아래 토막의 현과 나란히
 *   활꼴 안을 지나는 X축은 두 교차 모두에 붙는다(열린 교차 단추부터). 면만 고르기 단추는 onPick(cb, { meshesOnly: true }) 알림으로 아래 면을 받는다
 * 0.23.0 단추: 반투명 지나 고르기(상자를 반투명·바닥 판을 불투명으로 두고 누르기 알림·측정 고르기에 throughTranslucent — 상자 너머 판을 고르고 상태 줄 고름 뒤에
 *   "반투명 너머"), 글상자 비키기(뷰 큐브 자리(viewCubeRect)와 위쪽 띠를 setMeasureLabelAvoid로 넘기고 덧그림 넷을 단다 — 측정 거리 글상자와 덧그림 글상자가
 *   둘을 비켜 그린다, 띠는 점선 상자로 보인다)
 * 0.24.0 단추: 상자 고르기 불투명(반투명 지나 고르기를 켠 채 setItemPickOpaque('상자') — 상자 위를 누르면 "반투명 너머"가 상자, 그림은 그대로),
 *   너머 고르기만 바꾸기(setMeasurePickThrough — 잠금·끌어온 점·찍은 점을 둔 채 측정 고르기의 반투명 너머만 켜고 끈다),
 *   글상자 겹침(기준점이 겹치는 덧그림 넷 — 화면에서 뒤 글상자가 앞 글상자를, 측정 거리 글상자가 덧그림 글상자를 비킨다)
 * 0.25.0 단추: 놓기(장면 얕은 사본을 setScene(…, { release: true })로 다시 준다 — 올린 뒤 코어가 사본의 법선·무늬 좌표·무늬 원본을 지운다. 상태 줄에 "놓음"과
 *   사본에 남은 배열 MB), 문맥 잃기·되찾기(WEBGL_lose_context — onContextLost·onContextRestore 알림을 상태 줄에, 놓았으면 위치·색으로 먼저 그린다),
 *   앱이 다시 줌(켜 두면 되찾음 알림의 need대로 원본 장면에서 restoreMeshArrays·restoreTexture로 다시 준다 — 끄면 평면 음영·평균색 그대로).
 *   무늬는 &tex=1에서
 * 0.26.0: 반투명 지나 고르기 단추의 "반투명 너머"는 onPick(cb, { throughTranslucent: true, front: true }) 알림 하나로 받고 같은 누르기의 가장 앞 고르기(e.front)를
 *   "(앞: …)"으로 함께 보인다. &compact=1이면 작은 법선·무늬 좌표 배열
 * 0.27.0 단추: 상자 뚜껑 지나기(반투명 지나 고르기·상자 고르기 불투명과 함께 setItemPickThrough('상자', 윗면 삼각형) — 윗면을 누르면 "반투명 너머"가 상자 안쪽 면),
 *   끌어온 점 나란함·수직(inference.trackDirs — 모서리를 지나간 뒤 끌어온 점에서 그 모서리와 나란한 선·수직인 선, 상태 줄 "(…)에서 모서리와 나란함"),
 *   글상자 기본 자리(setMeasureLabelSpot — 측정 거리 글상자는 아래, 덧그림 글상자는 가운데부터)
 * 0.28.0 단추: 기준 현 거르기(끌어온 점 나란함·수직에서 곡선을 나눈 현 — 공구 경로 나선·시연 원 — 은 기준 선분이 되지 않는다, inference.trackDirs { edge }).
 *   상태 줄에 GPU 버퍼 바이트(stats.buffers — 합·위치·법선·무늬 좌표·색인·선분)
 * 0.29.0 단추: 안내 선 만나는 점(inference.trackDirs { edge, meets } — 끌어온 점의 나란함·수직 선이 첫 점 축·다른 끌어온 점의 축·모서리·면과 만나는 점,
 *   상태 줄 "(…)에서 모서리와 나란함 · 첫 점 X축과 만나는 점", 첫 점 나란함도 곡선 현을 거른다 — parallelEdge), 글상자 막히면 예전 차례(setMeasureLabelSpot fallback).
 *   문맥 잃기·되찾기 뒤 상태 줄에 "다시 올리기 끝"(onContextRestoreDone)
 * 0.30.0 단추: 안내 선끼리(inference.trackDirs { meets: { guides: true } } — 두 끌어온 점의 나란함·수직 선끼리 만나는 점, 상태 줄 "… · (…)에서 수직인 선과 만나는 점"),
 *   처음 올리기 재기(&tex=1 — 같은 그림을 새 무늬 id로 다시 올려 다 보이기까지의 시간과 그사이 그린 화면 수)
 * 0.31.0 단추: 안내 선 열린 교차(inference.trackDirs { meets: { guides, open } }와 시연 원·refine — 끌어온 점의 안내 선이 시연 원 토막의 활꼴만 지나는 자리를 정확한 원 위로,
 *   상태 줄 "… · 시연 원#…과 만나는 점(다듬음)"), 글 꼴 번역(setMeasureFormat의 둘째 인자 — 코어 기본 수 꼴·단위 글로 이름표만 "Distance"),
 *   점 표식 비키기(setMeasureLabelAvoid({ points }) — 거리 글상자가 첫 점·미리 보기 점 표식을 덮는 자리도 옮긴다, 글상자 비키기와 함께도)
 * 0.32.0 단추: 부품 끌기(setPointerClaim — 작은 상자·구를 끌기 시작하면 앱이 포인터를 맡아 그 부품을 세계 XY 평면 안에서 옮긴다, 그냥 누르기는 고르기,
 *   빈 곳 끌기는 궤도, 둘째 손가락이면 앞 자리로 돌아가고 두 손가락 몸짓 — 상태 줄 "부품 끌기: …"·"부품 끌기 끝: … (up·pinch)"),
 *   분해(행렬 한꺼번에 — setItemMatrices로 모든 그물을 장면 가운데에서 바깥으로, 상태 줄에 건 수·시간)
 * 자동 확인용으로 window.v3dDev(viewer, scene, bench, snapshot, diff, hideDemo, hiDemo …)를 둔다.
 */
import { itemBounds } from './bounds';
import { buildBvh } from './bvh';
import { VIEW_LABELS, type ViewName } from './camera';
import type { RenderMode } from './renderer';
import type { SectionAxis } from './section';
import { syntheticScene } from './synth';
import type { SnapRefineFaceInput, SnapRefineInput } from './snap';
import type { LineSet3d, Scene3d, SnapPoint } from './types';
import { type SectionCaps, Viewer3d } from './viewer';

const q = new URLSearchParams(location.search);
const segs = Math.max(1, Number(q.get('segs') ?? 300_000) | 0);
const sseg = Math.max(4, Number(q.get('sseg') ?? 128) | 0);
const offset = Number(q.get('offset') ?? 0) || 0;
const bake = q.get('bake') === '1';
const incremental = q.get('incremental') === '1';
const tex = q.get('tex') === '1';
const compact = q.get('compact') === '1';
let theme: 'dark' | 'light' = q.get('theme') === 'light' ? 'light' : 'dark';
document.body.dataset.theme = theme;

const bar = document.getElementById('bar')!;
const view = document.getElementById('view')!;
const status = document.getElementById('status')!;

/** offset 하나 → 장면 이동량(세 축 모두 크게 — Z도 확인한다) */
const offsetVec = (k: number): [number, number, number] => [k, -k / 2, k / 100];
const makeScene = (o: { offset?: number; bake?: boolean; segs?: number; sseg?: number } = {}): Scene3d =>
  syntheticScene({ segments: o.segs ?? segs, sphereSeg: o.sseg ?? sseg, offset: offsetVec(o.offset ?? 0), bake: o.bake, textures: tex, compact });

const viewer = new Viewer3d(view, { theme });
let info = '';
let pickInfo = '';
let secInfo = '';
let upInfo = '';
/** 0.17.0: 측정 미리 보기의 끌어온 축 설명(상태 줄) */
let hoverInfo = '';
/** 0.32.0: 부품 끌기·분해(행렬 한꺼번에) 상태(상태 줄) */
let claimInfo = '';
/** 0.20.0: 누른 자리에서 그물 면만 고른 결과도 보일지(면만 고르기 단추). 0.22.0부터 그 결과는 onPick(cb, { meshesOnly: true }) 알림으로 받는다 */
let meshesOnly = false;
let under: { id: string; index: number } | null = null;
/** 0.23.0: 반투명 그물을 지나 고른 결과도 보일지(반투명 지나 고르기 단추 — onPick throughTranslucent 알림) */
let through = false;
let beyond: { id: string; index: number } | null = null;
/** 0.26.0: 같은 누르기의 가장 앞 고르기(반투명 너머 알림의 e.front) */
let front: { id: string; index: number } | null = null;
const pt = (p: readonly number[]): string => `(${p.map((x) => x.toFixed(1)).join(', ')})`;
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
  const tx = s.textures.count ? ` · 무늬 ${s.textures.ready}/${s.textures.count}${s.textures.missing ? `(다시 받을 것 ${s.textures.missing})` : ''}` : '';
  // 0.26.0 &compact=1: 장면의 법선·무늬 좌표 바이트(작은 배열)
  let nb = 0;
  if (compact) for (const m of scene.meshes) nb += (m.normals?.byteLength ?? 0) + (m.uvs?.byteLength ?? 0) + (m.backUvs?.byteLength ?? 0);
  const cp = compact ? ` · 작은 배열(법선·무늬 좌표 ${(nb / 1024).toFixed(1)} KB)` : '';
  // 0.28.0: GPU 버퍼 바이트(stats.buffers — 합과 큰 성분)
  const b = s.buffers;
  const mb = (n: number): string => (n / 1048576).toFixed(1);
  const gb = ` · GPU 버퍼 ${mb(b.bytes)} MB(위치 ${mb(b.positions)} · 법선 ${mb(b.normals)} · 무늬 좌표 ${mb(b.uvs + b.backUvs)} · 색인 ${mb(b.indices)} · 선분 ${mb(b.lines + b.lineColors)})`;
  status.textContent = `선분 ${segs.toLocaleString()} · 그리기 ${s.drawCalls}회 · 삼각형 ${Math.round(s.triangles).toLocaleString()} · CPU ${s.frameMs.toFixed(1)} ms · ${s.width}×${s.height}@${s.dpr}${off}${tx}${cp}${gb}  ${upInfo}  ${secInfo}  ${info}  ${hoverInfo}  ${claimInfo}  ${pickInfo}`;
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
// 0.10.0: 나란함·Shift 잠금(추론 다섯 가지 모두), 앱 단추 꼴 잠금(터치에서 Shift 대신)
toggle(
  '나란함·잠금',
  (v) =>
    viewer.setMeasureSnap(
      v ? { midpoints: true, edges: true, points: demoSnapPoints(), inference: { intersections: true, perpendicular: true, axes: true, parallel: true, lock: true } } : null,
    ),
  '추론 붙잡기에 더해 지나간 선분과 나란한 방향, Shift를 누르고 있는 동안 지금 방향(축·나란함·수직) 잠금',
);
button('잠금', () => viewer.setMeasureInferenceLock(!viewer.measureInferenceLock), '지금 미리 보기의 방향을 잠그거나 푼다(터치 단추 꼴 — setMeasureInferenceLock)');
// 0.16.0: 다른 점에서 끌어온 축(점 붙잡기 위에 0.5초 머문 점의 X·Y·Z 축과 첫 점 축 위 나란한 자리)
toggle(
  '끌어온 축',
  (v) =>
    viewer.setMeasureSnap(
      v
        ? { midpoints: true, edges: true, points: demoSnapPoints(), inference: { intersections: true, perpendicular: true, axes: true, parallel: true, lock: true, track: true } }
        : null,
    ),
  '나란함·잠금에 더해, 점(꼭짓점·끝점·중심 등) 위에 0.5초 머물면 그 점을 기억하고(최근 셋) 그 점을 지나는 X·Y·Z 축과 첫 점 축 위에서 그 점과 나란한 자리, ' +
    '기억한 두 점의 축이 만나는 점, 그 축이 모서리와 만나는 점에도 붙잡기(Esc로 지우기)',
);
// 0.18.0: 첫 점 X·Y·Z 축이 모서리(선분·윤곽선)와 만나는 점
toggle(
  '축과 모서리',
  (v) =>
    viewer.setMeasureSnap(
      v
        ? {
            midpoints: true,
            edges: true,
            points: demoSnapPoints(),
            inference: { intersections: true, axes: true, parallel: true, lock: true, track: true, axisEdges: true },
          }
        : null,
    ),
  '끌어온 축에 더해, 첫 점을 지나는 X·Y·Z 축이 모서리와 만나는 점에도 붙잡기(Shift로 그 축에 잠그기). ' +
    '상자 모서리처럼 축과 수직인 모서리에서는 그 점이 곧 수직 발이라 수직 발을 끈다',
);
// 0.18.0: 첫 점 축·끌어온 축이 커서 아래 보이는 면을 뚫는 점
toggle(
  '축과 면',
  (v) =>
    viewer.setMeasureSnap(
      v
        ? {
            midpoints: true,
            edges: true,
            points: demoSnapPoints(),
            inference: { intersections: true, axes: true, parallel: true, lock: true, track: true, axisEdges: true, axisFaces: true },
          }
        : null,
    ),
  '축과 모서리에 더해, 첫 점을 지나는 X·Y·Z 축과 끌어온 축이 커서 아래 면을 뚫는 점에도 붙잡기(첫 점 축이면 Shift로 그 축에 잠그기)',
);
// 0.19.0: 잠근 선이 모서리와 만나는 점·면을 뚫는 점, 축이 구를 뚫는 점을 정확한 구 위로(refineFace)
toggle(
  '잠근 선 교차',
  (v) =>
    viewer.setMeasureSnap(
      v
        ? {
            midpoints: true,
            edges: true,
            points: demoSnapPoints(),
            inference: { intersections: true, axes: true, parallel: true, lock: true, track: true, axisEdges: true, axisFaces: true, lockEdges: true, lockFaces: true },
            refineFace: demoSphereFace,
          }
        : null,
    ),
  '축과 면에 더해, Shift·잠금 단추로 잠근 동안 잠근 선이 모서리와 만나는 점·커서 아래 면을 뚫는 점에도 붙잡기. 축이 구를 뚫는 점은 정확한 구 위로 다듬는다',
);
// 0.20.0: 축·잠근 선이 꺾은선 토막과 3D로 만나지 않고 그 활꼴만 지날 때도 앱 refine('axisEdge', open)이 준 곡선 위 교차에 붙기(시연 원·기둥을 장면에 더한다)
toggle(
  '열린 교차',
  (v) => {
    viewer.setScene(v ? { ...scene, lines: [...scene.lines, ...demoRingLines()] } : scene, { keepView: true });
    viewer.setMeasureSnap(
      v
        ? {
            midpoints: true,
            edges: true,
            points: demoSnapPoints(),
            inference: { intersections: true, axes: true, parallel: true, lock: true, track: true, axisEdges: true, axisFaces: true, lockEdges: true, lockFaces: true },
            refine: demoRingEdge,
            refineFace: demoSphereFace,
          }
        : null,
    );
  },
  '잠근 선 교차에 더해, 시연 원(바닥 12토막)과 기둥을 더한다. 기둥 아래 끝을 첫 점으로 찍고 그 Z축이 원을 뚫는 자리를 가리키면 꺾은선 현과는 만나지 않아도 ' +
    '정확한 원 위 교차에 붙는다(Shift로 잠가도, 비스듬히 잠근 선도)',
);
toggle('면만 고르기', (v) => (meshesOnly = v), '누른 자리에서 그물 면만 고른 결과(onPick meshesOnly 알림)를 상태 줄 고름 뒤에 보인다 — 면 위 선분·점 아래의 면');
// 0.21.0: 잠근 선이 끌어온 축과 만나는 점(inference.lockTracks), 다듬기 기억만 비우기(clearMeasureRefine)
toggle(
  '끌어온 축 잠금',
  (v) => {
    viewer.setScene(v ? { ...scene, lines: [...scene.lines, ...demoRingLines()] } : scene, { keepView: true });
    viewer.setMeasureSnap(
      v
        ? {
            midpoints: true,
            edges: true,
            points: demoSnapPoints(),
            inference: { intersections: true, axes: true, parallel: true, lock: true, track: true, axisEdges: true, axisFaces: true, lockEdges: true, lockFaces: true, lockTracks: true },
            refine: demoRingEdge,
            refineFace: demoSphereFace,
          }
        : null,
    );
  },
  '열린 교차에 더해, Shift·잠금 단추로 잠근 동안 잠근 선이 끌어온 점(0.5초 머문 점)의 X·Y·Z 축과 만나는 점에도 붙잡기(축으로 잠갔으면 그 점과 나란한 자리). ' +
    '구 위 아무 데나 가리키면 정확한 구 위 점으로 다듬는다(refineFace onFace)',
);
button('다듬기 기억 비우기', () => {
  const n = viewer.clearMeasureRefine();
  hoverInfo = `다듬기 기억 ${n}개를 비웠다(잠금·끌어온 점은 그대로)`;
  showStatus();
}, '앱이 다듬기에 쓰는 자료를 나중에 받았을 때처럼 refine·refineFace 결과 기억만 비운다(clearMeasureRefine)');
// 0.23.0: 반투명 그물을 지나 고르기(throughTranslucent), 덧그림 글상자 비키기(setMeasureLabelAvoid ↔ setAnnotations, viewCubeRect)
toggle(
  '반투명 지나 고르기',
  (v) => {
    through = v;
    viewer.setItemOpacity('상자', v ? 0.4 : null);
    viewer.setItemColor('판', v ? [0.45, 0.65, 0.95, 1] : null);
    const so = viewer.measureSnap;
    if (v || so) viewer.setMeasureSnap({ ...(so ?? {}), throughTranslucent: v });
  },
  '상자를 반투명·바닥 판을 불투명으로 두고, 누르기 알림(onPick throughTranslucent)과 측정 고르기가 상자 너머 판을 고른다 — 상태 줄 고름 뒤에 "반투명 너머"',
);
/** 글상자 비키기 단추의 위쪽 띠(점선 상자로 보인다) */
const band = document.createElement('div');
band.style.cssText = 'position:absolute;left:0;right:0;top:0;height:64px;border:1px dashed #e0a030;pointer-events:none;display:none;';
viewer.canvas.parentElement?.append(band);
toggle(
  '글상자 비키기',
  (v) => {
    band.style.display = v ? '' : 'none';
    const cube = viewer.viewCubeRect;
    viewer.setMeasureLabelAvoid(v ? [{ x: 0, y: 0, width: viewer.canvas.clientWidth, height: 64 }, ...(cube ? [cube] : [])] : null);
    viewer.setAnnotations(
      v
        ? [
            { kind: 'distance', a: [0, 0, 40], b: [120, 0, 40] },
            { kind: 'angle', a: [120, 80, 40], b: [0, 80, 40], c: [120, 0, 40] },
            { kind: 'radius', a: [190, 40, 35], b: [225, 40, 35], normal: [0, 0, 1] },
            { kind: 'point', a: [120, 80, 40], label: '상자 구석' },
          ]
        : null,
    );
  },
  '위쪽 띠와 뷰 큐브 자리(viewCubeRect)를 setMeasureLabelAvoid로 넘기고 덧그림 넷을 단다 — 덧그림 글상자(0.23.0)와 측정 거리 글상자가 둘을 비켜 그린다',
);
// 0.24.0: 그물마다 고르기 불투명(setItemPickOpaque), 반투명 너머 고르기만 바꾸기(setMeasurePickThrough), 덧그림 글상자끼리·측정 거리 글상자와 비키기
toggle(
  '상자 고르기 불투명',
  (v) => viewer.setItemPickOpaque('상자', v),
  '반투명 지나 고르기를 켠 채로 상자를 고르기에서 불투명으로 본다(setItemPickOpaque — 그림은 그대로). 상자 위를 누르면 "반투명 너머"가 판 대신 상자, 측정도 상자 위',
);
button(
  '너머 고르기만 바꾸기',
  () => {
    const on = !viewer.measureSnap?.throughTranslucent;
    hoverInfo = viewer.setMeasurePickThrough(on)
      ? `측정 고르기 반투명 너머 ${on ? '켬' : '끔'}(잠금·끌어온 점·찍은 점 그대로)`
      : '붙잡기가 꺼져 있다(setMeasureSnap으로 켠다)';
    showStatus();
  },
  '측정 붙잡기의 throughTranslucent만 켜고 끈다(setMeasurePickThrough) — Shift·잠금 단추 잠금, 끌어온 점, 찍은 첫 점, 다듬기 기억을 둔 채 다음 미리 보기부터',
);
toggle(
  '글상자 겹침',
  (v) =>
    viewer.setAnnotations(
      v
        ? [
            { kind: 'distance', a: [0, 0, 40], b: [120, 0, 40] },
            { kind: 'point', a: [60, 0, 40], label: '앞 가운데' },
            { kind: 'point', a: [62, 2, 40], label: '옆' },
            { kind: 'point', a: [190, 40, 70], label: '구 위' },
          ]
        : null,
    ),
  '기준점이 겹치는 덧그림 넷을 단다 — 화면에서는 뒤 글상자가 앞 글상자를 비키고(0.24.0), 측정 거리 글상자도 덧그림 글상자를 비킨다. PNG(그림 저장)는 기본 자리',
);
// 0.25.0: 놓기(setScene release)·문맥 잃기·되찾기 알림(onContextLost·onContextRestore)·앱이 다시 주기(restoreMeshArrays·restoreTexture)
/** 놓기를 켰을 때 뷰어에 준 장면 사본(코어가 지우는 것은 사본의 필드 — 원본 scene은 다시 주기·끄기에 쓴다) */
let released: Scene3d | null = null;
let regive = false;
/** 사본에 남은 법선·무늬 좌표·무늬 바이트(MB — 같은 배열은 한 번) */
const heldMb = (s: Scene3d): string => {
  const seen = new Set<object>();
  let n = 0;
  const add = (a: ArrayBufferView | undefined): void => {
    if (a && !seen.has(a)) {
      seen.add(a);
      n += a.byteLength;
    }
  };
  for (const m of s.meshes) [m.normals, m.uvs, m.backUvs].forEach(add);
  for (const t of s.textures ?? []) add(t.data);
  return (n / 1048576).toFixed(2);
};
const releaseInfo = (): string => (released ? `놓음(사본에 남은 법선·무늬 좌표·무늬 ${heldMb(released)} MB)` : '');
toggle(
  '놓기',
  (v) => {
    released = v ? { ...scene, meshes: scene.meshes.map((m) => ({ ...m })), textures: scene.textures?.map((t) => ({ ...t })) } : null;
    viewer.setScene(released ?? scene, { keepView: true, ...(released ? { release: true } : {}) });
    hoverInfo = releaseInfo();
    showStatus();
    // 무늬는 풀어 올린 뒤 지우므로 잠시 뒤 다시 센다
    setTimeout(() => {
      hoverInfo = releaseInfo();
      showStatus();
    }, 500);
  },
  '장면 얕은 사본을 setScene(…, { release: true })로 다시 준다 — 코어가 올린 뒤 사본의 법선·무늬 좌표·무늬 원본을 지운다(그림·고르기·측정은 그대로). 다른 단추가 장면을 다시 주면 풀린다',
);
viewer.onContextLost(() => {
  hoverInfo = '문맥 잃음';
  showStatus();
});
viewer.onContextRestore((need) => {
  hoverInfo = `문맥 되찾음 · 다시 줄 것 그물 ${need.meshes.length}·무늬 ${need.textures.length}${regive && released ? ' → 다시 줌' : ''}`;
  if (regive && released) {
    for (const m of need.meshes) {
      const o = scene.meshes.find((x) => x.id === m.id);
      if (o) viewer.restoreMeshArrays(m.id, { normals: o.normals, uvs: o.uvs, backUvs: o.backUvs });
    }
    for (const id of need.textures) {
      const t = scene.textures?.find((x) => x.id === id);
      if (t?.data) void viewer.restoreTexture(id, t.data).then(() => showStatus());
    }
  }
  showStatus();
});
button(
  '문맥 잃기·되찾기',
  () => {
    const ext = viewer.canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!ext) {
      hoverInfo = 'WEBGL_lose_context가 없다';
      showStatus();
      return;
    }
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), 300);
  },
  'WEBGL_lose_context로 그래픽 문맥을 잃었다 되찾는다 — 상태 줄에 onContextLost·onContextRestore 알림(놓지 않았으면 다시 줄 것 0, 그림은 그대로)',
);
toggle(
  '앱이 다시 줌',
  (v) => (regive = v),
  '켜 두면 문맥을 되찾을 때 알림의 need대로 원본 장면에서 restoreMeshArrays·restoreTexture로 다시 준다. 끄면 놓은 그물은 평면 음영, 놓은 무늬는 그물 색 그대로',
);
// 0.27.0: 그물 일부 면만 지나 고르기(setItemPickThrough), 끌어온 점의 나란함·수직(inference.trackDirs), 뷰어 글상자 기본 자리(setMeasureLabelSpot)
toggle(
  '상자 뚜껑 지나기',
  (v) => viewer.setItemPickThrough('상자', v ? [{ start: 2, count: 2 }] : null),
  '반투명 지나 고르기·상자 고르기 불투명을 켠 채로 상자 윗면 삼각형(2·3)만 지나가게 한다(setItemPickThrough — 그림·윤곽선은 그대로). ' +
    '상자 윗면을 누르면 "반투명 너머"가 상자 안쪽 바닥·벽, 측정도 그 면 위',
);
toggle(
  '끌어온 점 나란함·수직',
  (v) => {
    viewer.setMeasureSnap(
      v
        ? {
            midpoints: true,
            edges: true,
            points: demoSnapPoints(),
            inference: { intersections: true, axes: true, parallel: true, lock: true, track: true, trackDirs: true },
          }
        : null,
    );
  },
  '끌어온 축에 더해, 커서가 앞서 지나간 모서리와 나란한 선·수직인 선을 끌어온 점(0.5초 머문 점)에서 긋는다(inference.trackDirs — 추론 색 쇄선, 잠그지 않는다). ' +
    '모서리 위를 지나간 뒤 끌어온 점 둘레에서 그 모서리 방향·수직으로 가리킨다',
);
// 0.28.0: 끌어온 점 나란함·수직의 기준 선분 거르기(trackDirs { edge }) — 곡선을 나눈 현(공구 경로 나선·시연 원)은 기준이 되지 않는다
toggle(
  '기준 현 거르기',
  (v) => {
    viewer.setMeasureSnap(
      v
        ? {
            midpoints: true,
            edges: true,
            points: demoSnapPoints(),
            inference: {
              intersections: true,
              axes: true,
              parallel: true,
              lock: true,
              track: true,
              trackDirs: { edge: (_s, item) => item.id !== '공구 경로' && item.id !== '시연 원' },
            },
          }
        : null,
    );
  },
  '끌어온 점 나란함·수직과 같지만 곡선을 나눈 현(공구 경로 나선·시연 원)을 지나도 끌어온 점의 기준 선분이 바뀌지 않는다(inference.trackDirs { edge }). ' +
    '상자 모서리를 지나간 뒤 나선 위를 지나도 끌어온 점에서 상자 모서리와 나란한 선이 남는다(첫 점의 나란함은 0.10.0 그대로 나선 토막을 따른다)',
);
toggle(
  '글상자 기본 자리',
  (v) => viewer.setMeasureLabelSpot(v ? { measure: 'below', annotations: 'center' } : null),
  '측정 거리 글상자는 두 점 가운데 바로 아래, 덧그림 글상자는 기준점 가운데부터 놓는다(setMeasureLabelSpot — 피할 자리와 겹치면 같은 차례로 비킨다)',
);
// 0.29.0: 끌어온 점 안내 선이 만나는 점(trackDirs { meets })·첫 점 나란함 기준 거르기(parallelEdge), 뷰어 글상자 fallback, 되찾은 뒤 끝 알림(onContextRestoreDone)
/** 공구 경로 나선·시연 원을 나눈 현은 기준이 되지 않는다(0.28.0 trackDirs edge·0.29.0 parallelEdge에 함께 준다) */
const notCurve = (_s: unknown, item: { id: string }): boolean => item.id !== '공구 경로' && item.id !== '시연 원';
toggle(
  '안내 선 만나는 점',
  (v) => {
    viewer.setMeasureSnap(
      v
        ? {
            midpoints: true,
            edges: true,
            points: demoSnapPoints(),
            inference: { intersections: true, axes: true, parallel: true, lock: true, track: true, trackDirs: { edge: notCurve, meets: true }, parallelEdge: notCurve },
          }
        : null,
    );
  },
  '기준 현 거르기에 더해 끌어온 점의 나란함·수직 선이 첫 점 축·첫 점의 나란함·다른 끌어온 점의 축·모서리·면과 만나는 점에 붙는다(inference.trackDirs { meets } — 추론 색 ×, ' +
    '첫 점 축과 만나면 Shift로 그 축에 잠근다). 첫 점의 나란함도 곡선 현을 기준으로 받지 않는다(inference.parallelEdge)',
);
toggle(
  '글상자 막히면 예전 차례',
  (v) => viewer.setMeasureLabelSpot(v ? { measure: 'center', annotations: 'center', fallback: 'topRight' } : null),
  '측정 거리 글상자·덧그림 글상자를 가운데부터 놓고, 막히면 0.25.0 차례(오른쪽 위부터)로 고른다(setMeasureLabelSpot fallback — 글상자 비키기와 함께 본다)',
);
viewer.onContextRestoreDone(() => {
  hoverInfo = `${hoverInfo ? `${hoverInfo} · ` : ''}다시 올리기 끝(onContextRestoreDone)`;
  showStatus();
});
// 0.30.0: 두 끌어온 점의 안내 선끼리 만나는 점(trackDirs { meets: { guides } }), 처음 올릴 때 무늬 다시 그리기 모으기
toggle(
  '안내 선끼리',
  (v) => {
    viewer.setMeasureSnap(
      v
        ? {
            midpoints: true,
            edges: true,
            points: demoSnapPoints(),
            inference: { intersections: true, axes: true, parallel: true, lock: true, track: true, trackDirs: { edge: notCurve, meets: { guides: true } }, parallelEdge: notCurve },
          }
        : null,
    );
  },
  '안내 선 만나는 점에 더해 두 끌어온 점의 나란함·수직 선끼리 만나는 점에 붙는다(inference.trackDirs { meets: { guides: true } } — 두 점에서 추론 색 쇄선과 ×). ' +
    '두 점에 머물러 끌어온 뒤 기운 모서리를 지나가고, 한 점의 나란한 선과 다른 점의 수직인 선이 만나는 구석을 가리킨다',
);
button(
  '처음 올리기 재기',
  () => {
    const tex = scene.textures ?? [];
    if (!tex.length) {
      hoverInfo = '무늬가 없다(&tex=1로 연다)';
      showStatus();
      return;
    }
    // 같은 그림을 새 무늬 id로 준 장면 사본(같은 id면 코어가 올린 무늬를 그대로 쓴다) — 다 보이기까지의 시간과 그사이 그린 화면 수
    const tag = `#${Date.now() % 100000}`;
    const copy: Scene3d = {
      ...scene,
      meshes: scene.meshes.map((m) => ({ ...m, ...(m.texture ? { texture: m.texture + tag } : {}), ...(m.backTexture ? { backTexture: m.backTexture + tag } : {}) })),
      textures: tex.map((t) => ({ ...t, id: t.id + tag })),
    };
    const raf = window.requestAnimationFrame;
    let frames = 0;
    window.requestAnimationFrame = (cb) => raf.call(window, (t) => (frames++, cb(t)));
    const t0 = performance.now();
    viewer.setScene(copy, { keepView: true });
    const poll = (): void => {
      const s = viewer.stats.textures;
      if (s.ready + s.failed < s.count && performance.now() - t0 < 60_000) return void setTimeout(poll, 5);
      // 마지막 무늬로 그린 화면까지
      raf.call(window, () => {
        window.requestAnimationFrame = raf;
        hoverInfo = `처음 올리기: 무늬 ${s.count}장 ${(performance.now() - t0).toFixed(0)} ms · 다시 그린 화면 ${frames}번`;
        showStatus();
      });
    };
    poll();
  },
  '같은 그림을 새 무늬 id로 준 장면 사본을 setScene으로 다시 올려 무늬가 다 보이기까지의 시간과 그사이 그린 화면 수를 상태 줄에 보인다(&tex=1 — 0.30.0부터 첫 무늬 뒤로는 ' +
    '250 ms와 올리기·그리기 시간의 4배 가운데 긴 간격마다만 다시 그린다). 다른 단추가 장면을 다시 주면 원본 장면으로 돌아간다',
);
// 0.31.0: 안내 선의 열린 교차(trackDirs { meets: { open } }), 측정 글 꼴의 코어 기본 꼴(setMeasureFormat 둘째 인자), 측정 점 표식 비키기(setMeasureLabelAvoid points)
toggle(
  '안내 선 열린 교차',
  (v) => {
    viewer.setScene(v ? { ...scene, lines: [...scene.lines, ...demoRingLines()] } : scene, { keepView: true });
    viewer.setMeasureSnap(
      v
        ? {
            midpoints: true,
            edges: true,
            points: demoSnapPoints(),
            inference: { intersections: true, axes: true, parallel: true, lock: true, track: true, trackDirs: { edge: notCurve, meets: { guides: true, open: true } }, parallelEdge: notCurve },
            refine: demoRingEdge,
          }
        : null,
    );
  },
  '안내 선끼리에 더해 시연 원(바닥 12토막)을 더하고, 끌어온 점의 나란함·수직 선이 원 토막의 현과는 만나지 않고 현과 곡선 사이만 지나는 자리를 정확한 원 위 교차로 붙잡는다 ' +
    '(inference.trackDirs { meets: { open: true } } — 앱 refine axisEdge open). 점에 머물러 끌어온 뒤 곧은 모서리를 지나가고 그 안내 선이 원 둘레를 스치는 자리를 가리킨다',
);
toggle(
  '글 꼴 번역',
  (v) =>
    viewer.setMeasureFormat(
      v ? (m, c) => (c.source === 'measure' ? [`Distance ${c.num(m.distance)}${c.unit ? ` ${c.unit}` : ''}`, c.lines[1]!] : c.lines) : null,
    ),
  '측정 거리 글상자의 이름표만 "Distance"로 옮긴다 — 수·자릿수·"-0"·단위 글은 글 꼴의 둘째 인자(코어 기본 꼴 — num·digits·unit·lines)를 그대로 쓴다',
);
toggle(
  '점 표식 비키기',
  (v) => {
    const cur = viewer.measureLabelAvoid;
    viewer.setMeasureLabelAvoid(v ? { ...(cur ?? {}), points: true } : cur ? { ...cur, points: false } : null);
  },
  '거리 글상자가 첫 점·미리 보기 점 표식을 덮는 자리도 옮긴다(setMeasureLabelAvoid({ points: true }) — 글상자 비키기와 함께 켜면 띠·뷰 큐브도 비킨다). ' +
    '첫 점을 찍고 그 왼쪽 아래를 가리키면 기본 자리(두 점 가운데 오른쪽 위)가 첫 점 표식을 덮는다',
);
// 0.32.0: 앱이 포인터를 맡는 훅(setPointerClaim — 부품 끌기), 여러 묶음 행렬 한 번에(setItemMatrices — 분해)
/** 끌어 옮긴 양(묶음마다 세계 이동)과 분해를 켰는지 — 둘을 더해 묶음 행렬로 건다 */
const dragOffsets = new Map<string, [number, number, number]>();
let explodeOn = false;
const DRAG_PARTS = new Set(['작은 상자 1', '작은 상자 2', '작은 상자 3', '구']);
/** 분해 이동: 장면 그물 범위 가운데에서 그 그물 범위 가운데로 0.6배 */
function explodeOffset(id: string): [number, number, number] {
  const boxes = scene.meshes.map((m) => [m.id, itemBounds(m)] as const);
  const mid = (b: { min: readonly number[]; max: readonly number[] }, i: number): number => (b.min[i]! + b.max[i]!) / 2;
  const lo = [0, 1, 2].map((i) => Math.min(...boxes.map(([, b]) => b.min[i]!))), hi = [0, 1, 2].map((i) => Math.max(...boxes.map(([, b]) => b.max[i]!)));
  const b = boxes.find(([k]) => k === id)?.[1];
  if (!b) return [0, 0, 0];
  return [0, 1, 2].map((i) => (mid(b, i) - (lo[i]! + hi[i]!) / 2) * 0.6) as [number, number, number];
}
function partMatrix(id: string): number[] | null {
  const d = dragOffsets.get(id) ?? [0, 0, 0];
  const e = explodeOn ? explodeOffset(id) : [0, 0, 0];
  const t = [d[0] + e[0]!, d[1] + e[1]!, d[2] + e[2]!];
  return t.every((x) => x === 0) ? null : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t[0]!, t[1]!, t[2]!, 1];
}
/** 끄는 부품: 잡은 세계 점(잡을 때 자리), 잡을 때의 끈 양 */
let grab: { id: string; p: number[]; base: [number, number, number] } | null = null;
/** 잡은 점이 화면 (x, y)에 오도록 끈 양을 고친다(세계 XY 평면 안 — 화면 자리를 세 번 맞춰 본다) */
function dragTo(x: number, y: number): void {
  const g = grab;
  if (!g) return;
  const o: [number, number, number] = [...(dragOffsets.get(g.id) ?? g.base)];
  for (let k = 0; k < 3; k++) {
    const q = [g.p[0]! + o[0] - g.base[0], g.p[1]! + o[1] - g.base[1], g.p[2]! + o[2] - g.base[2]];
    const s = viewer.project(q), sx = viewer.project([q[0]! + 1, q[1]!, q[2]!]), sy = viewer.project([q[0]!, q[1]! + 1, q[2]!]);
    if (!s || !sx || !sy) return;
    const a = sx.x - s.x, b = sy.x - s.x, c = sx.y - s.y, d = sy.y - s.y, det = a * d - b * c;
    if (Math.abs(det) < 1e-9) return;
    const ex = x - s.x, ey = y - s.y;
    o[0] += (d * ex - b * ey) / det;
    o[1] += (a * ey - c * ex) / det;
  }
  dragOffsets.set(g.id, o);
  viewer.setItemMatrix(g.id, partMatrix(g.id));
  claimInfo = `부품 끌기: ${g.id} (${o[0].toFixed(1)}, ${o[1].toFixed(1)})`;
  showStatus();
}
toggle(
  '부품 끌기',
  (on) =>
    viewer.setPointerClaim(
      on
        ? {
            claim: (q) => {
              // 그냥 누르기는 예전처럼 고르기 — 끌기 시작 거리를 넘을 때 누른 자리가 움직일 부품이면 맡는다(두 손가락이면 맡지 않는다)
              if (q.phase !== 'drag' || q.pointers !== 1) return false;
              const p = q.pick({ meshesOnly: true });
              if (!p || !DRAG_PARTS.has(p.id)) return false;
              grab = { id: p.id, p: [...p.point], base: [...(dragOffsets.get(p.id) ?? [0, 0, 0])] };
              dragTo(q.at.x, q.at.y);
              return true;
            },
            move: (h) => dragTo(h.x, h.y),
            end: (_h, why) => {
              const g = grab;
              grab = null;
              if (!g) return;
              // 뗀 것만 남긴다(취소·두 손가락으로 돌려받음·끄기는 앞 자리로)
              if (why !== 'up') {
                dragOffsets.set(g.id, g.base);
                viewer.setItemMatrix(g.id, partMatrix(g.id));
              }
              claimInfo = `부품 끌기 끝: ${g.id} (${why})`;
              showStatus();
            },
          }
        : null,
    ),
  '작은 상자·구를 끌면 그 부품을 세계 XY 평면 안에서 옮긴다(setPointerClaim — 끌기 시작 거리를 넘는 순간 누른 자리가 부품이면 앱이 맡는다). ' +
    '그냥 누르면 예전처럼 고르기, 빈 곳·다른 그물을 끌면 궤도, 끄는 중 둘째 손가락이 닿으면 앞 자리로 돌아가고 두 손가락 이동·핀치',
);
toggle(
  '분해(행렬 한꺼번에)',
  (on) => {
    explodeOn = on;
    const t0 = performance.now();
    const n = viewer.setItemMatrices(scene.meshes.map((m) => [m.id, partMatrix(m.id)] as const));
    claimInfo = `setItemMatrices ${n}개 ${(performance.now() - t0).toFixed(3)} ms`;
    showStatus();
  },
  '그물마다 장면 가운데에서 바깥으로 옮긴 행렬(끌어 옮긴 양을 더해)을 setItemMatrices 한 번으로 건다 — 상태 줄에 건 수와 시간',
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
// 0.22.0: 그물 면만 받는 알림(면 위 선분·점을 눌러도 그 아래 면) — 아래 알림보다 먼저 달아 같은 누르기의 상태 줄에 함께 보인다
viewer.onPick((p) => (under = p ? { id: p.id, index: p.index } : null), { meshesOnly: true });
// 0.23.0: 반투명 그물을 지나 고른 알림(반투명 상자 너머 바닥 판). 0.26.0: front로 같은 누르기의 가장 앞 고르기도 이 알림 하나에서 받는다
viewer.onPick(
  (p, e) => {
    beyond = p ? { id: p.id, index: p.index } : null;
    front = e.front ? { id: e.front.id, index: e.front.index } : null;
  },
  { throughTranslucent: true, front: true },
);
viewer.onPick((p, e) => {
  picks.push({ id: p?.id ?? null, alt: e.altKey, shift: e.shiftKey, clicks: e.clicks });
  viewer.highlight(p ? [p.id] : null);
  const mods = [e.altKey && 'Alt', e.ctrlKey && 'Ctrl', e.shiftKey && 'Shift', e.metaKey && 'Meta', e.clicks > 1 && '두 번'].filter(Boolean).join('+');
  pickInfo = p ? `고름: ${p.kind} "${p.id}" #${p.index}${mods ? ` [${mods}]` : ''} (${p.point.map((v) => v.toFixed(2)).join(', ')})` : '';
  if (meshesOnly) pickInfo += ` · 아래 면: ${under ? `"${under.id}" #${under.index}` : '없음'}`;
  if (through) pickInfo += ` · 반투명 너머: ${beyond ? `"${beyond.id}" #${beyond.index}` : '없음'} (앞: ${front ? `"${front.id}" #${front.index}` : '없음'})`;
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
  // 0.16.0: 둘째 점이 놓인 선분(묶음 id#원본 번호, 교차점이면 둘째 선분도)과 끌어온 축의 끌어온 점
  const pb = m ? viewer.measurePoints[1] : undefined;
  const seg = pb?.segment ? ` [${pb.segment.id}#${pb.segment.index}${pb.other ? ` × ${pb.other.id}#${pb.other.index}` : ''}]` : '';
  // 0.17.0: 끌어온 축끼리의 교차면 둘째 끌어온 점과 그 축
  const from = pb?.trackFrom ? ` [끌어온 점 ${pt(pb.trackFrom)}${pb.trackOther ? ` × ${pt(pb.trackOther.from)}의 ${pb.trackOther.axis.toUpperCase()}축` : ''}]` : '';
  info = m ? `측정: ${m.distance.toFixed(3)} mm (ΔX ${m.dx.toFixed(3)} ΔY ${m.dy.toFixed(3)} ΔZ ${m.dz.toFixed(3)})${snap}${seg}${from}` : '';
  showStatus();
});
/**
 * 0.17.0: 측정 미리 보기의 끌어온 축 — 첫 점 축 위 나란한 자리, 끌어온 점의 축(둘째 축과 만나는 점이면 그 축도, 모서리와 만나는 점이면 그 선분).
 * 0.18.0: 첫 점 축이 모서리와 만나는 점이면 그 축과 선분(앱이 다듬었으면 표시), 축이 면을 뚫는 점이면 그 면의 그물 id.
 * 0.21.0: 잠근 선이 끌어온 축과 만나는 점(만나는 끌어온 축, 잠근 축 위 나란한 자리), 붙잡지 않은 면 위 점을 다듬었으면 "면 위(다듬음)"
 */
viewer.canvas.addEventListener('pointermove', () =>
  requestAnimationFrame(() => {
    const h = viewer.measureHoverSnap;
    const ax = (a: string | undefined): string => `${(a ?? '').toUpperCase()}축`;
    const face = h?.face ? ` · ${h.face.id} 면` : '';
    const lockLine = `잠근 ${h?.axis ? ax(h.axis) : '선'}`;
    // 0.27.0: 끌어온 점에서 기준 선분과 나란함·수직인 선 위(잠그지 않은 'parallel'·'perpendicular'에 끌어온 점)
    const dirOf = h && !h.locked && h.trackFrom && (h.snap === 'parallel' || h.snap === 'perpendicular') ? h.snap : null;
    // 0.29.0: 그 선이 만나는 것(첫 점 축·첫 점의 나란함·다른 끌어온 점의 축·모서리·면)
    const meet = !dirOf || !h
      ? ''
      : h.axis
        ? ` · 첫 점 ${ax(h.axis)}과 만나는 점`
        : h.direction
          ? ' · 첫 점의 나란함과 만나는 점'
          : h.trackOther
            ? ` · ${pt(h.trackOther.from)}의 ${ax(h.trackOther.axis)}과 만나는 점`
            : h.segment
              ? ` · ${h.segment.id}#${h.segment.index}과 만나는 점${h.refined ? '(다듬음)' : ''}`
              : h.face
                ? ` · ${h.face.id} 면과 만나는 점${h.refined ? '(다듬음)' : ''}`
                : h.trackGuide
                  ? ` · ${pt(h.trackGuide.from)}에서 ${h.trackGuide.kind === 'parallel' ? '나란한' : '수직인'} 선과 만나는 점`
                  : '';
    const next = dirOf && h?.trackFrom
      ? `미리 보기: ${pt(h.trackFrom)}에서 모서리와 ${dirOf === 'parallel' ? '나란함' : '수직'}${meet}`
      : h?.locked && h.trackOther
      ? `미리 보기: ${lockLine} · ${pt(h.trackOther.from)}의 ${ax(h.trackOther.axis)}과 만나는 점`
      : h?.locked && h.trackFrom
        ? `미리 보기: ${lockLine} 위 ${pt(h.trackFrom)}와 나란한 자리`
        : h && h.snap === null && h.refined
          ? '미리 보기: 면 위(다듬음)'
          : !h?.trackFrom
      ? h?.locked && (h.segment || h.face)
        ? `미리 보기: 잠근 ${h.axis ? ax(h.axis) : '선'}${h.segment ? ` · ${h.segment.id}#${h.segment.index} 위` : ''}${face}${h.refined ? '(다듬음)' : ''}`
        : h?.snap === 'axis' && (h.segment || h.face)
          ? `미리 보기: 첫 점 ${ax(h.axis)}${h.segment ? ` · ${h.segment.id}#${h.segment.index} 위` : ''}${face}${h.refined ? '(다듬음)' : ''}`
          : ''
      : h.direction && !h.trackOther && !h.segment && !h.face
        ? `미리 보기: 첫 점 ${ax(h.axis)} 위 ${pt(h.trackFrom)}와 나란한 자리`
        : `미리 보기: ${pt(h.trackFrom)}의 ${ax(h.axis)}${h.trackOther ? ` × ${pt(h.trackOther.from)}의 ${ax(h.trackOther.axis)}` : ''}${h.segment ? ` · ${h.segment.id}#${h.segment.index} 위` : ''}${face}`;
    if (next !== hoverInfo) {
      hoverInfo = next;
      showStatus();
    }
  }),
);

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
    // 0.22.0 '구 스침': 적도 칸 가운데(경도 180°/칸 수)에서 현(반지름 r·cos(180°/칸 수))과 구 사이 가운데 거리 위 — 그 Z축은 그물을 비켜 가며 구를 스친다
    if (m.id === '구') {
      const r = (b.max[0] - b.min[0]) / 2, a = Math.PI / sseg;
      const rho = (r * (1 + Math.cos(a))) / 2;
      out.push({ point: [c[0]! + rho * Math.cos(a), c[1]! + rho * Math.sin(a), c[2]! + 1.9 * r], kind: 'point' });
    }
  }
  return out;
}

/**
 * 0.19.0 축이 면을 뚫는 점 다듬기(개발 확인용 refineFace): 구 그물이면 축 직선과 정확한 구(그물 범위의 가운데·반지름)의 교차 가운데 코어 점에 가까운 것,
 * 다른 그물(평면 상자)이면 null — 삼각형 위 점 그대로. 0.21.0 'onFace'(line = 커서 광선)도 종류를 가리지 않고 같은 계산이다(커서 아래 구 위 점)
 */
function demoSphereFace(c: SnapRefineFaceInput): number[] | null {
  const m = c.face.id === '구' ? scene.meshes.find((k) => k.id === '구') : undefined;
  if (!m) return null;
  const b = itemBounds(m);
  const ctr = [0, 1, 2].map((i) => (b.min[i]! + b.max[i]!) / 2);
  const r = (b.max[0]! - b.min[0]!) / 2;
  const o = c.line.origin, d = c.line.dir;
  const w = [o[0] - ctr[0]!, o[1] - ctr[1]!, o[2] - ctr[2]!];
  const bb = w[0]! * d[0] + w[1]! * d[1] + w[2]! * d[2];
  const disc = bb * bb - (w[0]! * w[0]! + w[1]! * w[1]! + w[2]! * w[2]! - r * r);
  if (disc < 0) return null;
  const at = (t: number): number[] => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
  const p = at(-bb - Math.sqrt(disc)), q = at(-bb + Math.sqrt(disc));
  const far = (s: number[]): number => Math.hypot(s[0]! - c.point[0], s[1]! - c.point[1], s[2]! - c.point[2]);
  return far(p) <= far(q) ? p : q;
}

/** 0.20.0 시연 원(바닥 z 0, 중심 (60, −70), 반지름 25, 12토막 — 꼭짓점 15° + 30°·k라 0°는 토막 가운데)과 그 0° 자리 위 기둥(아래 끝 (85, −70, 30)) */
const DEMO_RING = { c: [60, -70, 0], r: 25 };
function demoRingLines(): LineSet3d[] {
  const off = offset ? offsetVec(offset) : null;
  const at = (a: number): number[] => [DEMO_RING.c[0]! + DEMO_RING.r * Math.cos(a), DEMO_RING.c[1]! + DEMO_RING.r * Math.sin(a), DEMO_RING.c[2]!];
  const P: number[] = [];
  for (let k = 0; k < 12; k++) P.push(...at(((15 + 30 * k) * Math.PI) / 180), ...at(((45 + 30 * k) * Math.PI) / 180));
  const post = [85, -70, 30, 85, -70, 50];
  // 큰 좌표: 원점 방식이면 origin, 굽기면 positions에 더한다(장면과 같은 방식)
  const place = (p: number[]): Pick<LineSet3d, 'positions' | 'origin'> =>
    !off ? { positions: new Float32Array(p) } : bake ? { positions: new Float32Array(p.map((x, i) => x + off[i % 3]!)) } : { positions: new Float32Array(p), origin: off };
  return [
    { id: '시연 원', name: '시연 원', ...place(P), segmentIds: new Uint32Array(Array.from({ length: 12 }, (_, k) => 100 + k)), color: [0.4, 0.95, 0.6, 1], width: 1.5 },
    { id: '시연 기둥', name: '시연 기둥', ...place(post), color: [0.95, 0.5, 0.5, 1], width: 1.5 },
  ];
}

/**
 * 0.20.0 열린 교차 다듬기(개발 확인용 refine): 시연 원 토막과 만나는 직선('axisEdge' — 축·잠근 선, 열린 후보도)이면 정확한 원과의 교차.
 * 원 평면을 뚫는 직선은 그 점이 원 위일 때만, 평면 위 직선은 코어 점에 가까운 근. 그 밖은 null
 */
function demoRingEdge(c: SnapRefineInput): number[] | null {
  if (c.kind !== 'axisEdge' || !c.line || c.segment.id !== '시연 원') return null;
  const off = offset ? offsetVec(offset) : [0, 0, 0];
  const C = DEMO_RING.c.map((x, i) => x + off[i]!);
  const o = c.line.origin, d = c.line.dir;
  const tol = 1e-9 * (1 + Math.abs(C[0]!) + Math.abs(C[1]!) + Math.abs(C[2]!));
  if (Math.abs(d[2]) > 1e-12) {
    const t = (C[2]! - o[2]) / d[2];
    const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
    return Math.abs(Math.hypot(p[0]! - C[0]!, p[1]! - C[1]!) - DEMO_RING.r) <= tol + 1e-9 * DEMO_RING.r ? p : null;
  }
  if (Math.abs(o[2] - C[2]!) > tol) return null;
  const wx = o[0] - C[0]!, wy = o[1] - C[1]!;
  const a = d[0] * d[0] + d[1] * d[1], b = wx * d[0] + wy * d[1], k = wx * wx + wy * wy - DEMO_RING.r * DEMO_RING.r;
  const disc = b * b - a * k;
  if (disc < 0) return null;
  const ps = [(-b - Math.sqrt(disc)) / a, (-b + Math.sqrt(disc)) / a].map((t) => [o[0] + d[0] * t, o[1] + d[1] * t, o[2]]);
  const far = (s: number[]): number => Math.hypot(s[0]! - c.point[0], s[1]! - c.point[1], s[2]! - c.point[2]);
  return far(ps[0]!) <= far(ps[1]!) ? ps[0]! : ps[1]!;
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
