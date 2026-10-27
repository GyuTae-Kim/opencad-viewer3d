#!/usr/bin/env node
// @ts-check
/**
 * 그물 바꾸기 비용 재기(0.11.0): npm run bench:edit -- [--reps N] [--port N] [--out .runtime/bench/<이름>] [--backend swiftshader|gpu|both]
 *
 * 작업 트리 src로 scripts/bench/page.html을 묶어 127.0.0.1에 내주고, 헤드리스 Chrome(새 임시 프로필)으로 연다.
 * 기본은 두 번: SwiftShader(CPU로 흉내 내는 GPU — 화소 비교와 같은 백엔드)와 기계 GPU(macOS는 ANGLE Metal).
 * GPU 백엔드를 만들지 못하면 Chrome이 SwiftShader로 떨어지므로 표에는 WebGL 렌더러 이름을 함께 적는다.
 * 결과: out/summary.json(done: true)·summary.md, 표준 출력에 표.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { launchChrome } from '../pixels/chrome.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const log = (/** @type {string} */ s) => console.error(`[bench] ${s}`);

/** 가운데값·최소·최대(ms, 소수 한 자리) @param {number[]} a */
export function stats(a) {
  const s = [...a].sort((x, y) => x - y);
  const r = (/** @type {number} */ x) => Math.round(x * 10) / 10;
  if (!s.length) return { median: NaN, min: NaN, max: NaN };
  const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return { median: r(m), min: r(s[0]), max: r(s[s.length - 1]) };
}

/** @param {any} res @param {string} backend */
export function table(res, backend) {
  const head = `### ${backend} — ${res.renderer}${/swiftshader/i.test(res.renderer) ? ' (SwiftShader: CPU로 흉내 낸 GPU)' : ''}\n\n선분 ${res.segs.toLocaleString('en-US')}개 + 격자 삼각형 ${res.tris.toLocaleString('en-US')}개, 가운데값(최소~최대) ms, ${res.reps}번\n\n| 길 | 올리는 양 | 호출 | 다음 그리기(+GPU 마침) | 첫 고르기(BVH 다시) |\n|---|---:|---:|---:|---:|\n`;
  const f = (/** @type {number[]} */ a) => {
    const s = stats(a);
    return `${s.median} (${s.min}~${s.max})`;
  };
  const name = (/** @type {any} */ r) => (r.method === 'scene' ? 'setScene 장면 전체' : r.method === 'mesh' ? 'setMesh 그물 전체' : `setMesh 범위(마디 ${r.rows}줄)`);
  return head + res.rows.map((/** @type {any} */ r) => `| ${name(r)} | ${r.uploadMB} MB | ${f(r.call)} | ${f(r.frame)} | ${f(r.pick)} |`).join('\n') + '\n';
}

/** @param {string} root @param {number} port @returns {Promise<import('node:http').Server>} */
function serve(root, port) {
  /** @type {Record<string, string>} */
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const file = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => ok(server));
  });
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: { reps: { type: 'string' }, port: { type: 'string' }, out: { type: 'string' }, backend: { type: 'string' }, chrome: { type: 'string' } },
  });
  const reps = Math.max(1, Math.min(20, Number(values.reps ?? 5) || 5));
  const port = Number(values.port ?? 0) || 0;
  const backends = values.backend === 'gpu' ? ['gpu'] : values.backend === 'swiftshader' ? ['swiftshader'] : ['swiftshader', 'gpu'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const out = resolve(values.out ?? join(repo, '.runtime/bench', `edit-${stamp}`));
  if (existsSync(join(out, 'summary.json'))) throw new Error(`이미 결과가 있습니다(덮어쓰지 않습니다): ${out}`);
  mkdirSync(out, { recursive: true });
  const { build } = await import('vite');
  const root = resolve(repo, 'scripts/bench');
  const buildDir = join(out, 'build');
  await build({
    configFile: false,
    root,
    base: './',
    publicDir: false,
    cacheDir: join(out, '.vite'),
    logLevel: 'warn',
    build: { outDir: buildDir, emptyOutDir: true, minify: false, sourcemap: false, reportCompressedSize: false, modulePreload: false, target: 'es2022', rollupOptions: { input: resolve(root, 'page.html') } },
  });
  rmSync(join(out, '.vite'), { recursive: true, force: true });
  const server = await serve(buildDir, port);
  const addr = server.address();
  const p = typeof addr === 'object' && addr ? addr.port : port;
  /** @type {Record<string, any>} */
  const results = {};
  try {
    for (const backend of backends) {
      const browser = await launchChrome({ width: 960, height: 600, chrome: values.chrome, log, gpu: backend === 'gpu' });
      try {
        await browser.send('Page.navigate', { url: `http://127.0.0.1:${p}/page.html` });
        let ready = false;
        for (let i = 0; i < 300 && !ready; i++) {
          await new Promise((r) => setTimeout(r, 100));
          ready = await browser.evaluate('!!(window.bench && window.bench.ready)').catch(() => false);
        }
        if (!ready) throw new Error(`${backend}: 비용 재기 페이지가 30초 안에 준비되지 않았습니다`);
        log(`${backend}: 재는 중(${reps}번)…`);
        const res = await browser.evaluate(`bench.run(${reps})`, 600_000);
        results[backend] = { ...res, reps };
        log(`${backend}: ${res.renderer}`);
      } finally {
        await browser.close();
      }
    }
  } finally {
    server.close();
  }
  rmSync(buildDir, { recursive: true, force: true });
  const md = backends.map((b) => table(results[b], b)).join('\n');
  writeFileSync(join(out, 'summary.json'), `${JSON.stringify({ done: true, tool: 'scripts/bench/edit.mjs', at: new Date().toISOString(), reps, results }, null, 1)}\n`);
  writeFileSync(join(out, 'summary.md'), md);
  console.log(md);
  console.log(`결과: ${out}`);
}

// 명령으로 부를 때만 돈다(시험은 stats·table만 가져간다)
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((e) => {
    console.error(`[bench] 오류: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    process.exit(2);
  });
