/** 화소·값 회귀 비교 도구(scripts/pixels): PNG 쓰기·읽기, 차이, 판정, 인자, git 판 소스 플러그인, Chrome 인자 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readArgs, slug } from '../scripts/pixels/args.mjs';
import { chromeArgs, findChrome } from '../scripts/pixels/chrome.mjs';
import { classify, countStatuses, exitCode, FAILING, markdown, valueDiff } from '../scripts/pixels/compare.mjs';
import { gitSource, listTree, resolveCommit } from '../scripts/pixels/gitsrc.mjs';
import { crc32, decodePng, diffImages, encodePng } from '../scripts/pixels/png.mjs';

const repo = resolve(__dirname, '..');

/** 시험용 그림: 위치마다 다른 색(알파도 섞는다) */
function pattern(w: number, h: number): Uint8Array {
  const d = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = (i * 37) & 255;
    d[i * 4 + 1] = (i * 11 + 7) & 255;
    d[i * 4 + 2] = (i >> 3) & 255;
    d[i * 4 + 3] = i % 5 ? 255 : (i * 3) & 255;
  }
  return d;
}

/** 줄마다 주어진 거르기(0~4)로 PNG를 만든다(PNG 명세대로 — 읽기 쪽 시험용 기준 구현) */
function pngWithFilters(w: number, h: number, px: Uint8Array, bpp: 3 | 4, filters: number[]): Uint8Array {
  const row = w * bpp;
  const raw = new Uint8Array((row + 1) * h);
  const paeth = (a: number, b: number, c: number): number => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < h; y++) {
    const f = filters[y % filters.length]!;
    raw[y * (row + 1)] = f;
    for (let i = 0; i < row; i++) {
      const x = px[y * row + i]!;
      const a = i >= bpp ? px[y * row + i - bpp]! : 0;
      const b = y > 0 ? px[(y - 1) * row + i]! : 0;
      const c = i >= bpp && y > 0 ? px[(y - 1) * row + i - bpp]! : 0;
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
      raw[y * (row + 1) + 1 + i] = (x - pred) & 255;
    }
  }
  const chunk = (type: string, data: Uint8Array): Buffer => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = bpp === 4 ? 6 : 2;
  // IDAT를 둘로 나눠 이어 붙이기도 확인한다
  const z = deflateSync(raw);
  const half = z.length >> 1;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', z.subarray(0, half)),
    chunk('IDAT', z.subarray(half)),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

describe('PNG', () => {
  it('CRC-32 표준 확인 값', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('쓰고 읽으면 RGBA가 그대로', () => {
    const px = pattern(37, 23);
    const png = encodePng(37, 23, px);
    const back = decodePng(png);
    expect(back.width).toBe(37);
    expect(back.height).toBe(23);
    expect(Buffer.from(back.data).equals(Buffer.from(px))).toBe(true);
  });

  it('다섯 가지 거르기(RGBA·RGB)를 모두 읽는다', () => {
    const w = 19, h = 11;
    const rgba = pattern(w, h);
    expect(Buffer.from(decodePng(pngWithFilters(w, h, rgba, 4, [0, 1, 2, 3, 4])).data).equals(Buffer.from(rgba))).toBe(true);
    const rgb = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) rgb.set(rgba.subarray(i * 4, i * 4 + 3), i * 3);
    const got = decodePng(pngWithFilters(w, h, rgb, 3, [4, 3, 2, 1, 0])).data;
    for (let i = 0; i < w * h; i++) {
      expect([got[i * 4], got[i * 4 + 1], got[i * 4 + 2], got[i * 4 + 3]]).toEqual([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], 255]);
    }
  });

  it('PNG가 아니거나 길이가 맞지 않으면 알린다', () => {
    expect(() => decodePng(new Uint8Array(16))).toThrow(/PNG가 아닙니다/);
    expect(() => encodePng(2, 2, new Uint8Array(15))).toThrow(/RGBA 길이/);
  });
});

describe('그림 차이', () => {
  const img = (w: number, h: number, data = pattern(w, h)) => ({ width: w, height: h, data });

  it('같으면 0, 다른 화소 수·최대 차·범위', () => {
    const a = img(10, 8);
    expect(diffImages(a, img(10, 8)).diffPixels).toBe(0);
    expect(diffImages(a, img(10, 8)).box).toBeNull();
    const b = img(10, 8, a.data.slice());
    b.data[(3 * 10 + 4) * 4 + 1] ^= 0x40; // (4, 3) 초록
    b.data[(6 * 10 + 5) * 4 + 3]! -= 5; // (5, 6) 알파 195 → 190
    const d = diffImages(a, b);
    expect(d.diffPixels).toBe(2);
    expect(d.maxDelta).toBe(64);
    expect(d.box).toEqual({ x: 4, y: 3, w: 2, h: 4 });
    // 차이 그림: 다른 화소는 빨강, 같은 화소는 회색
    const o = d.image!.data;
    expect(o[(3 * 10 + 4) * 4]).toBe(255);
    expect(o[(3 * 10 + 4) * 4 + 1]).toBeLessThan(255);
    expect(o[0]).toBe(o[1]);
  });

  it('크기가 다르면 전체가 다름', () => {
    const d = diffImages(img(10, 8), img(8, 10));
    expect(d.sizeMismatch).toBe(true);
    expect(d.diffPixels).toBe(80);
    expect(d.image).toBeNull();
  });
});

describe('판정', () => {
  const H = (hash: string) => ({ hash });

  it('같음·다름', () => {
    expect(classify([H('a'), H('a')], [H('a'), H('a')]).status).toBe('same');
    expect(classify([H('a'), H('a')], [H('b'), H('b')]).status).toBe('diff');
    expect(classify([H('a')], [H('b')]).status).toBe('diff');
  });

  it('같은 판 두 번이 다르면 불안정(어느 쪽인지)', () => {
    expect(classify([H('a'), H('a')], [H('a'), H('c')])).toEqual({ status: 'unstable', side: 'head' });
    expect(classify([H('a'), H('c')], [H('a'), H('a')])).toEqual({ status: 'unstable', side: 'base' });
  });

  it('base에 없는 기능은 새 장면, head가 건너뛰면 사라진 장면', () => {
    expect(classify([{ skip: 'base에 없는 API: x' }], [H('a')])).toMatchObject({ status: 'new', detail: 'base에 없는 API: x' });
    expect(classify([H('a')], [{ skip: '없음' }]).status).toBe('removed');
    expect(classify([{ skip: '없음' }], [{ skip: '없음' }]).status).toBe('skipped');
  });

  it('오류: head면 실패, base만이면 알리기만', () => {
    expect(classify([H('a')], [H('a'), { error: 'TypeError: x' }])).toMatchObject({ status: 'error', side: 'head' });
    expect(classify([{ error: 'boom' }], [H('a')])).toMatchObject({ status: 'base-error', side: 'base' });
    expect(FAILING.has('diff') && FAILING.has('removed') && FAILING.has('error')).toBe(true);
    expect(FAILING.has('unstable') || FAILING.has('new') || FAILING.has('base-error')).toBe(false);
  });

  it('끝 값: 같음·불안정·새 장면 0, 다름·사라짐 1, head 예외 2', () => {
    const st = (...s: string[]) => s.map((status, i) => ({ name: String(i), status }));
    expect(exitCode(st('same', 'unstable', 'new', 'base-error', 'skipped'))).toBe(0);
    expect(exitCode(st('same', 'diff'))).toBe(1);
    expect(exitCode(st('removed', 'same'))).toBe(1);
    expect(exitCode(st('diff', 'error'))).toBe(2);
  });

  it('값 차이: 다른 자리 수와 앞의 몇 개', () => {
    const a = [1, [2, 'x'], null, 4, 5, 6];
    const b = [1, [2, 'y'], null, 4, 7, 6, 8];
    const d = valueDiff(a, b, 2);
    expect(d.count).toBe(3);
    expect(d.lengths).toEqual([6, 7]);
    expect(d.examples).toEqual([
      { index: 1, base: [2, 'x'], head: [2, 'y'] },
      { index: 4, base: 5, head: 7 },
    ]);
  });

  it('요약: 상태별 개수와 같지 않은 장면 표', () => {
    expect(countStatuses([{ name: 'a', status: 'same' }, { name: 'b', status: 'diff' }, { name: 'c', status: 'same' }])).toEqual({ same: 2, diff: 1 });
    const md = markdown({
      base: { ref: 'origin/main', commit: 'a'.repeat(40) },
      head: { ref: 'worktree', commit: 'b'.repeat(40), dirty: true },
      size: { w: 960, h: 600 },
      runs: 2,
      shots: [
        { name: 'base-shaded', status: 'same' },
        { name: 'base-wireframe', status: 'diff', diffPixels: 120, maxDelta: 40 },
      ],
      values: [{ name: 'base-picks', status: 'diff', n: 3600, count: 3 }],
      ok: false,
    });
    expect(md).toContain('— 다름');
    expect(md).toContain('| base-wireframe | diff | 120 | 40 |');
    expect(md).toContain('| base-picks | diff | 3 / 3600 |');
    expect(md).not.toContain('| base-shaded');
  });
});

describe('인자', () => {
  it('기본값과 선택', () => {
    const a = readArgs(['--base', 'origin/main']);
    expect(a).toMatchObject({ help: false, base: 'origin/main', head: null, out: null, runs: 2, size: { w: 960, h: 600 }, only: null, port: 0, keepShots: false });
    const b = readArgs(['--base', 'v0.8.0', '--head', 'HEAD', '--runs', '1', '--size', '640x400', '--only', '^base-', '--port', '4425', '--keep-shots', '--out', '.runtime/pixels/x']);
    expect(b).toMatchObject({ head: 'HEAD', runs: 1, size: { w: 640, h: 400 }, port: 4425, keepShots: true, out: '.runtime/pixels/x' });
    if (b.help) throw new Error('도움말이 아니다');
    expect(b.only?.test('base-shaded')).toBe(true);
    expect(readArgs(['--help'])).toEqual({ help: true });
  });

  it('틀린 인자는 알린다', () => {
    expect(() => readArgs([])).toThrow(/--base/);
    expect(() => readArgs(['--base', 'x', '--runs', '0'])).toThrow(/--runs/);
    expect(() => readArgs(['--base', 'x', '--size', '10x10'])).toThrow(/--size/);
    expect(() => readArgs(['--base', 'x', '--size', 'big'])).toThrow(/--size/);
    expect(() => readArgs(['--base', 'x', '--only', '('])).toThrow(/--only/);
    expect(() => readArgs(['--base', 'x', '--what'])).toThrow();
  });

  it('폴더 이름 조각', () => {
    expect(slug('origin/main')).toBe('origin_main');
    expect(slug('HEAD^1')).toBe('HEAD_1');
    expect(slug('///')).toBe('ref');
  });
});

describe('git 판 소스(디스크에 복사하지 않고 git 개체에서 읽기)', () => {
  const head = resolveCommit(repo, 'HEAD');
  /** 플러그인 훅을 부를 때의 this(오류는 던진다) */
  const ctx = { error: (m: string): never => { throw new Error(m); } };
  const plugin = gitSource({ repo, commit: head });
  const resolveId = plugin.resolveId as unknown as (this: typeof ctx, s: string, imp?: string) => string | null;
  const load = plugin.load as unknown as (this: typeof ctx, id: string) => string | null;

  it('판 이름 → 커밋, 없는 판은 알린다', () => {
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    expect(() => resolveCommit(repo, 'no-such-ref-for-pixels-test')).toThrow(/찾지 못했습니다/);
  });

  it('그 커밋의 src 파일 목록', () => {
    const files = listTree(repo, head, 'src');
    expect(files).toContain('src/viewer.ts');
    expect(files.every((f) => f.startsWith('src/'))).toBe(true);
  });

  it('src 안 상대 가져오기만 git 목록으로 풀고(확장자·.js→.ts), 밖은 그대로 둔다', () => {
    const imp = resolve(repo, 'src/index.ts');
    expect(resolveId.call(ctx, './viewer', imp)).toBe(resolve(repo, 'src/viewer.ts'));
    expect(resolveId.call(ctx, './viewer.js', imp)).toBe(resolve(repo, 'src/viewer.ts'));
    expect(resolveId.call(ctx, '../../src/synth', resolve(repo, 'scripts/pixels/page.ts'))).toBe(resolve(repo, 'src/synth.ts'));
    expect(resolveId.call(ctx, './page.ts', resolve(repo, 'scripts/pixels/page.html'))).toBeNull();
    expect(resolveId.call(ctx, 'vite', imp)).toBeNull();
    expect(() => resolveId.call(ctx, './no-such-module', imp)).toThrow(/없습니다/);
  });

  it('내용은 git cat-file 그대로(작업 트리를 읽지 않는다)', () => {
    const want = execFileSync('git', ['cat-file', 'blob', `${head}:src/bounds.ts`], { cwd: repo, encoding: 'utf8' });
    expect(load.call(ctx, resolve(repo, 'src/bounds.ts'))).toBe(want);
    expect(plugin.loaded.has('src/bounds.ts')).toBe(true);
    expect(load.call(ctx, resolve(repo, 'scripts/pixels/page.ts'))).toBeNull();
    expect(() => load.call(ctx, resolve(repo, 'src/no-such.ts'))).toThrow(/없습니다/);
    expect(() => load.call(ctx, `${resolve(repo, 'src/bounds.ts')}?raw`)).toThrow(/주소 인자/);
  });
});

describe('Chrome', () => {
  it('SwiftShader·새 프로필, 리눅스는 샌드박스를 끈다', () => {
    const mac = chromeArgs({ profile: '/tmp/p', width: 960, height: 600, platform: 'darwin' });
    expect(mac).toContain('--use-angle=swiftshader');
    expect(mac).toContain('--user-data-dir=/tmp/p');
    expect(mac).toContain('--window-size=960,600');
    expect(mac).not.toContain('--no-sandbox');
    expect(chromeArgs({ profile: '/tmp/p', width: 960, height: 600, platform: 'linux' })).toContain('--no-sandbox');
    // 0.11.0 비용 재기(scripts/bench)만: 기계 GPU — 화소 비교 기본값은 그대로 SwiftShader
    const gpu = chromeArgs({ profile: '/tmp/p', width: 960, height: 600, platform: 'darwin', gpu: true });
    expect(gpu).toContain('--use-angle=metal');
    expect(gpu.some((a) => a.includes('swiftshader'))).toBe(false);
  });

  it('CHROME_PATH가 먼저', () => {
    expect(findChrome({ CHROME_PATH: '/opt/chrome/chrome' }, 'linux')).toBe('/opt/chrome/chrome');
  });
});
