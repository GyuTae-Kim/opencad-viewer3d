/**
 * 0.31.0 임의 방향 범위를 작은 모듈로 떼기(opencad-viewer3d/extent — itemExtent·itemsExtent, bounds도 같은 이름으로 다시 내보낸다).
 * - 두 길이 같은 함수이고 방향 기억을 bounds의 forgetBounds가 함께 버리는지(extent에서 가져와도)
 * - 작은 번들 시험(vite 빌드, 쓰지 않고 메모리에서): 첫 화면이 bounds의 sceneBounds만 쓰고 늦게 받는 조각이 extent(또는 bounds)에서 itemsExtent를 쓰면
 *   첫 화면 조각(진입 조각과 그것이 바로 가져오는 공유 조각)에 방향 범위 코드가 실리지 않고 늦은 조각에 실린다. 첫 화면에서 쓰면 첫 화면에 실린다(대조)
 */
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, type Plugin } from 'vite';
import * as bounds from '../src/bounds';
import * as extent from '../src/extent';
import type { LineSet3d } from '../src/types';

describe('opencad-viewer3d/extent(0.31.0)', () => {
  it('bounds가 다시 내보내는 것은 같은 함수다', () => {
    expect(bounds.itemExtent).toBe(extent.itemExtent);
    expect(bounds.itemsExtent).toBe(extent.itemsExtent);
  });

  it('방향 기억은 forgetBounds가 함께 버린다(extent에서 가져와 물어도)', () => {
    const p = new Float32Array([0, 0, 0, 10, 0, 0, 0, 5, 0]);
    const l: LineSet3d = { id: 'l', positions: p };
    expect(extent.itemExtent(l, [1, 0, 0])).toEqual([0, 10]);
    p[3] = 20;
    // 제자리에서 고쳤지만 잊게 하지 않았으면 기억한 값
    expect(extent.itemExtent(l, [1, 0, 0])).toEqual([0, 10]);
    bounds.forgetBounds(p);
    expect(extent.itemExtent(l, [1, 0, 0])).toEqual([0, 20]);
    expect(extent.itemsExtent([l, { id: 'm', positions: new Float32Array([-3, 0, 0]) }], [1, 0, 0])).toEqual([-3, 20]);
  });
});

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** 가상 진입(첫 화면)과 늦은 조각으로 빌드해 첫 화면 코드(진입 조각 + 그것이 바로 가져오는 조각)와 늦은 조각 코드를 돌려준다 */
async function bundle(main: string, lazy: string): Promise<{ first: string; late: string }> {
  const mods: Record<string, string> = { 'virtual:main': main, 'virtual:lazy': lazy };
  const virtual: Plugin = {
    name: 'v0310-virtual',
    resolveId: (id) => (id in mods ? `\0${id}` : null),
    load: (id) => (id.startsWith('\0') && id.slice(1) in mods ? mods[id.slice(1)] : null),
  };
  const res = await build({
    configFile: false,
    root: ROOT,
    logLevel: 'silent',
    plugins: [virtual],
    build: { write: false, minify: false, modulePreload: false, reportCompressedSize: false, rollupOptions: { input: { main: 'virtual:main' } } },
  });
  const outs = (Array.isArray(res) ? res : [res]) as { output: { type: string; fileName: string; code?: string; isEntry?: boolean; imports?: string[]; isDynamicEntry?: boolean }[] }[];
  const chunks = outs.flatMap((o) => o.output).filter((c) => c.type === 'chunk');
  const byName = new Map(chunks.map((c) => [c.fileName, c]));
  const entry = chunks.find((c) => c.isEntry)!;
  const firstNames = new Set([entry.fileName, ...(entry.imports ?? [])]);
  const first = [...firstNames].map((n) => byName.get(n)!.code!).join('\n');
  const late = chunks
    .filter((c) => !firstNames.has(c.fileName))
    .map((c) => c.code!)
    .join('\n');
  return { first, late };
}
// 앱 빌드는 진입의 내보내기를 남기지 않으므로(preserveEntrySignatures false) 전역에 붙여 쓴다
const MAIN_LATE = "import { sceneBounds } from '/src/bounds.ts';\nglobalThis.box = (s) => sceneBounds(s);\nglobalThis.later = () => import('virtual:lazy');\n";
const has = (code: string): boolean => /function (itemExtent|itemsExtent|positionsExtent)\b/.test(code);
const kb = (code: string): string => (gzipSync(code).length / 1024).toFixed(2);

describe('작은 번들 시험: 방향 범위 코드가 첫 화면 공유 조각에 실리지 않는다(0.31.0)', () => {
  it('늦은 조각이 extent에서 가져오면 첫 화면에 없고 늦은 조각에 있다 — bounds에서 가져와도(이름 다시 내보내기), 첫 화면에서 쓰면 첫 화면에(대조)', async () => {
    const fromExtent = await bundle(MAIN_LATE, "import { itemsExtent } from '/src/extent.ts';\nglobalThis.ext = (a, v) => itemsExtent(a, v);\n");
    expect(has(fromExtent.first)).toBe(false);
    expect(has(fromExtent.late)).toBe(true);
    expect(fromExtent.first).toMatch(/function sceneBounds\b/);
    const fromBounds = await bundle(MAIN_LATE, "import { itemsExtent } from '/src/bounds.ts';\nglobalThis.ext = (a, v) => itemsExtent(a, v);\n");
    expect(has(fromBounds.first)).toBe(false);
    expect(has(fromBounds.late)).toBe(true);
    const eager = await bundle(
      "import { sceneBounds } from '/src/bounds.ts';\nimport { itemsExtent } from '/src/extent.ts';\nglobalThis.box = (s, v) => [sceneBounds(s), itemsExtent(s.meshes, v)];\nglobalThis.later = () => import('virtual:lazy');\n",
      'globalThis.x = 1;\n',
    );
    expect(has(eager.first)).toBe(true);
    console.log(
      `첫 화면 코드 gzip(압축하지 않은 빌드): 늦은 조각이 extent에서 ${kb(fromExtent.first)} kB, bounds에서 ${kb(fromBounds.first)} kB, 첫 화면에서 쓰면 ${kb(eager.first)} kB · 늦은 조각 ${kb(fromExtent.late)} kB`,
    );
  });
});
