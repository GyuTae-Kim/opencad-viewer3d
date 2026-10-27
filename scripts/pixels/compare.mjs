// @ts-check
/**
 * 화소·값 비교 판정(순수 함수 — 시험한다).
 * 한 장면(또는 값 묶음)마다 base·head를 runs번 찍은 결과를 받아 상태를 정한다:
 *   same      두 판이 같다
 *   diff      두 판이 다르다(실패)
 *   unstable  같은 판을 두 번 찍었는데 달랐다(어느 쪽인지 side) — 비교에서 빼고 따로 알린다
 *   new       base에 그 기능이 없어 head만 찍었다
 *   removed   base에서는 되던 장면을 head가 건너뛰었다(기능이 사라짐 — 실패)
 *   error     head에서 오류(실패)
 *   base-error base에서만 오류(알리기만)
 *   skipped   두 판 모두 건너뜀
 */

/**
 * @typedef {{ hash: string } | { skip: string } | { error: string }} Outcome
 * @typedef {{ status: 'same' | 'diff' | 'unstable' | 'new' | 'removed' | 'error' | 'base-error' | 'skipped'; side?: 'base' | 'head'; detail?: string }} Verdict
 */

export const FAILING = new Set(['diff', 'removed', 'error']);

/**
 * 끝 값: 0 = 모두 같음(불안정·새 장면은 알리기만), 1 = 다른 장면·값 또는 사라진 장면(의도한 변화일 수 있다 — CI는 pixels-changed 라벨로 통과),
 * 2 = head 장면에서 예외(라벨로 넘기지 않는다 — 비교 페이지를 같은 PR에서 고친다)
 * @param {{ status: string }[]} items
 */
export function exitCode(items) {
  if (items.some((x) => x.status === 'error')) return 2;
  return items.some((x) => FAILING.has(x.status)) ? 1 : 0;
}

/** @param {Outcome | undefined} o @returns {o is { hash: string }} */
const isHash = (o) => !!o && 'hash' in o;
/** @param {Outcome | undefined} o @returns {o is { error: string }} */
const isError = (o) => !!o && 'error' in o;
/** @param {Outcome | undefined} o @returns {o is { skip: string }} */
const isSkip = (o) => !!o && 'skip' in o;

/**
 * 같은 판 여러 번 찍기가 모두 같은지
 * @param {Outcome[]} runs
 */
function stable(runs) {
  const hashes = runs.filter(isHash).map((r) => r.hash);
  return hashes.every((h) => h === hashes[0]);
}

/**
 * @param {Outcome[]} base 찍은 순서대로(첫 번째가 비교에 쓰인다)
 * @param {Outcome[]} head
 * @returns {Verdict}
 */
export function classify(base, head) {
  const herr = head.find(isError);
  if (herr) return { status: 'error', side: 'head', detail: herr.error };
  const h = head[0], b = base[0];
  if (isSkip(h)) {
    if (isHash(b)) return { status: 'removed', detail: h.skip };
    return { status: 'skipped', detail: h.skip };
  }
  if (!isHash(h)) return { status: 'error', side: 'head', detail: 'head 결과 없음' };
  if (!stable(head)) return { status: 'unstable', side: 'head' };
  const berr = base.find(isError);
  if (berr) return { status: 'base-error', side: 'base', detail: berr.error };
  if (isSkip(b)) return { status: 'new', detail: b.skip };
  if (!isHash(b)) return { status: 'base-error', side: 'base', detail: 'base 결과 없음' };
  if (!stable(base)) return { status: 'unstable', side: 'base' };
  return { status: b.hash === h.hash ? 'same' : 'diff' };
}

/**
 * 두 값 배열에서 다른 자리 수와 앞의 몇 개
 * @param {unknown[]} a @param {unknown[]} b @param {number} [max]
 */
export function valueDiff(a, b, max = 5) {
  const n = Math.max(a.length, b.length);
  let count = 0;
  /** @type {{ index: number; base: unknown; head: unknown }[]} */
  const examples = [];
  for (let i = 0; i < n; i++) {
    const x = JSON.stringify(a[i]), y = JSON.stringify(b[i]);
    if (x === y) continue;
    count++;
    if (examples.length < max) examples.push({ index: i, base: a[i], head: b[i] });
  }
  return { count, lengths: [a.length, b.length], examples };
}

/**
 * @param {{ name: string; status: string }[]} items
 * @returns {Record<string, number>}
 */
export function countStatuses(items) {
  /** @type {Record<string, number>} */
  const c = {};
  for (const it of items) c[it.status] = (c[it.status] ?? 0) + 1;
  return c;
}

/**
 * 사람이 읽는 요약(Markdown — CI 작업 요약에도 쓴다)
 * @param {{ base: { ref: string; commit: string }; head: { ref: string; commit: string; dirty?: boolean }; size: { w: number; h: number }; runs: number; chrome?: string; webgl?: string; seconds?: number;
 *   shots: { name: string; status: string; diffPixels?: number; maxDelta?: number; side?: string; detail?: string }[];
 *   values: { name: string; status: string; n?: number; count?: number; side?: string; detail?: string }[]; ok: boolean }} s
 */
export function markdown(s) {
  const L = [];
  const c = countStatuses(s.shots), cv = countStatuses(s.values);
  const fmt = (/** @type {Record<string, number>} */ x) =>
    Object.entries(x)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ');
  L.push(`### 3D 뷰어 화소·값 비교 ${s.ok ? '— 같음' : '— 다름'}`);
  L.push('');
  L.push(`- base \`${s.base.ref}\` (${s.base.commit.slice(0, 12)}) ↔ head \`${s.head.ref}\` (${s.head.commit.slice(0, 12)}${s.head.dirty ? ', 커밋 안 한 변경 포함' : ''})`);
  L.push(`- 장면 ${s.shots.length}개: ${fmt(c)} · 값 묶음 ${s.values.length}개: ${fmt(cv)}`);
  L.push(`- ${s.size.w}×${s.size.h}, 판마다 ${s.runs}번 찍기${s.chrome ? ` · ${s.chrome}` : ''}${s.webgl ? ` · ${s.webgl}` : ''}${s.seconds ? ` · ${s.seconds.toFixed(0)}초` : ''}`);
  const bad = s.shots.filter((x) => x.status !== 'same');
  if (bad.length) {
    L.push('');
    L.push('| 장면 | 상태 | 다른 화소 | 최대 차 | 비고 |');
    L.push('| --- | --- | ---: | ---: | --- |');
    for (const x of bad) L.push(`| ${x.name} | ${x.status}${x.side ? `(${x.side})` : ''} | ${x.diffPixels ?? ''} | ${x.maxDelta ?? ''} | ${(x.detail ?? '').replace(/\|/g, '/').slice(0, 120)} |`);
  }
  const vbad = s.values.filter((x) => x.status !== 'same');
  if (vbad.length) {
    L.push('');
    L.push('| 값 묶음 | 상태 | 다른 자리 / 전체 | 비고 |');
    L.push('| --- | --- | ---: | --- |');
    for (const x of vbad) L.push(`| ${x.name} | ${x.status}${x.side ? `(${x.side})` : ''} | ${x.count ?? ''}${x.n !== undefined ? ` / ${x.n}` : ''} | ${(x.detail ?? '').replace(/\|/g, '/').slice(0, 120)} |`);
  }
  return L.join('\n') + '\n';
}
