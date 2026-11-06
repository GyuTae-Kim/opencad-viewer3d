#!/usr/bin/env node
// @ts-check
/**
 * 같은 그물 자리가 아주 많은 장면 비용 재기(0.42.0): npm run bench:many -- [--base <git 판>] [--variants base,head,head-noinst] [--rounds N] [--reps N]
 *   [--size full|small] [--modes shadedEdges,shaded,…] [--budget 8] [--cpu 1] [--port N] [--out .runtime/bench/<이름>] [--backend swiftshader|gpu|both]
 * --cpu N = CDP로 CPU를 N배 느리게(주 스레드 몫이 드러나게 — STEP 48차 측정은 4).
 *
 * 비교 페이지(scripts/bench/many.html)를 판마다 묶는다: base는 그 커밋의 src를 git에서 바로 읽고(화소 비교와 같은 gitSource), head는 작업 트리 src.
 * head-noinst는 head 묶음을 ?inst=0(인스턴싱 끔)으로 연다. 판을 번갈아 rounds번 연다(기계 부하가 한쪽에만 몰리지 않게).
 * 장면: full = 정의 12 × 자리 3,000(삼각형 약 184만 — STEP 큰 조립 합성 꼴), small = 정의 12 × 자리 300.
 * 결과: out/summary.json(done: true)·summary.md, 표준 출력에 표.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { launchChrome } from '../pixels/chrome.mjs';
import { gitSource, resolveCommit } from '../pixels/gitsrc.mjs';
import { stats } from './edit.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const log = (/** @type {string} */ s) => console.error(`[bench] ${s}`);

export const SIZES = {
  full: { defs: 12, modules: 30, perModule: 100, triangles: 613 },
  small: { defs: 12, modules: 6, perModule: 50, triangles: 613 },
};

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

/** 판 하나 묶기(commit이 있으면 그 src) @param {string} outDir @param {string | null} commit @param {string} cacheDir */
async function bundle(outDir, commit, cacheDir) {
  const { build } = await import('vite');
  const root = resolve(repo, 'scripts/bench');
  await build({
    configFile: false,
    root,
    base: './',
    publicDir: false,
    cacheDir,
    logLevel: 'warn',
    plugins: commit ? [gitSource({ repo, commit })] : [],
    build: { outDir, emptyOutDir: true, minify: false, sourcemap: false, reportCompressedSize: false, modulePreload: false, target: 'es2022', rollupOptions: { input: resolve(root, 'many.html') } },
  });
}

/** 표(가운데값 (최소~최대)) @param {any} res */
export function manyTable(res) {
  const f = (/** @type {number[]} */ a) => {
    const s = stats(a);
    return `${s.median} (${s.min}~${s.max})`;
  };
  let md = `### ${res.backend} — ${res.renderer}\n\n그물 ${res.meshes.toLocaleString('en-US')}개(자리), 삼각형 ${res.triangles.toLocaleString('en-US')}개, CPU ${res.cpu ?? 1}배 느리게, 판마다 ${res.rounds}번(가운데값 (최소~최대) ms)\n\n`;
  md += '| 판 | 처음 열기 다 올림 | 프레임 수 | 프레임 JS 합 | 가장 긴 프레임 | 긴 작업 합 | 모아 그리기 시작 |\n|---|---:|---:|---:|---:|---:|---:|\n';
  for (const [name, r] of Object.entries(res.variants))
    md += `| ${name} | ${f(r.open.map((/** @type {any} */ o) => o.doneMs))} | ${f(r.open.map((/** @type {any} */ o) => o.frames))} | ${f(r.open.map((/** @type {any} */ o) => o.drawSumMs))} | ${f(r.open.map((/** @type {any} */ o) => o.drawMaxMs))} | ${f(r.open.map((/** @type {any} */ o) => o.longSumMs))} | ${f(r.open.map((/** @type {any} */ o) => o.instMs ?? 0))} |\n`;
  md += '\n| 판 | 모드 | 그리기 JS | GPU 마침까지 | 그리기 호출 | GL 호출 |\n|---|---|---:|---:|---:|---:|\n';
  for (const [name, r] of Object.entries(res.variants))
    for (const mode of Object.keys(r.steady)) {
      const s = r.steady[mode];
      md += `| ${name} | ${mode} | ${f(s.js)} | ${f(s.total)} | ${s.drawCalls.join('·')} | ${s.glCalls.join('·')} |\n`;
    }
  return md;
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      base: { type: 'string' },
      variants: { type: 'string' },
      rounds: { type: 'string' },
      reps: { type: 'string' },
      size: { type: 'string' },
      modes: { type: 'string' },
      budget: { type: 'string' },
      cpu: { type: 'string' },
      port: { type: 'string' },
      out: { type: 'string' },
      backend: { type: 'string' },
      chrome: { type: 'string' },
    },
  });
  const rounds = Math.max(1, Math.min(20, Number(values.rounds ?? 2) || 2));
  const reps = Math.max(1, Math.min(50, Number(values.reps ?? 5) || 5));
  const budget = Math.max(1, Number(values.budget ?? 8) || 8);
  const cpu = Math.max(1, Math.min(20, Number(values.cpu ?? 1) || 1));
  const size = values.size === 'small' ? 'small' : 'full';
  const spec = SIZES[size];
  const modes = (values.modes ?? 'shadedEdges,shaded,shadedEdges+profiles,shadedEdges+highlight').split(',').filter(Boolean);
  const variants = (values.variants ?? (values.base ? 'base,head,head-noinst' : 'head,head-noinst')).split(',').filter(Boolean);
  if (variants.includes('base') && !values.base) throw new Error('base 판을 재려면 --base <git 판>을 주세요');
  const port = Number(values.port ?? 0) || 0;
  const backends = values.backend === 'gpu' ? ['gpu'] : values.backend === 'swiftshader' ? ['swiftshader'] : ['swiftshader', 'gpu'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const out = resolve(values.out ?? join(repo, '.runtime/bench', `many-${stamp}`));
  if (existsSync(join(out, 'summary.json'))) throw new Error(`이미 결과가 있습니다(덮어쓰지 않습니다): ${out}`);
  mkdirSync(out, { recursive: true });
  const buildDir = join(out, 'build');
  const cache = join(out, '.vite');
  const baseCommit = values.base ? resolveCommit(repo, values.base) : null;
  if (variants.some((x) => x.startsWith('head'))) await bundle(join(buildDir, 'head'), null, cache);
  if (baseCommit) await bundle(join(buildDir, 'base'), baseCommit, cache);
  rmSync(cache, { recursive: true, force: true });
  const server = await serve(buildDir, port);
  const addr = server.address();
  const p = typeof addr === 'object' && addr ? addr.port : port;
  /** @type {any[]} */
  const results = [];
  try {
    for (const backend of backends) {
      const browser = await launchChrome({ width: 960, height: 600, chrome: values.chrome, log, gpu: backend === 'gpu' });
      /** @type {any} */
      const res = { backend, renderer: '', rounds, cpu, meshes: 0, triangles: 0, variants: {} };
      try {
        for (let r = 0; r < rounds; r++) {
          // 판 차례를 번갈아(첫 판이 늘 먼저 열리지 않게)
          const order = r % 2 ? [...variants].reverse() : variants;
          for (const name of order) {
            const dir = name === 'base' ? 'base' : 'head';
            const qs = name === 'head-noinst' ? '?inst=0' : '';
            await browser.send('Page.navigate', { url: `http://127.0.0.1:${p}/${dir}/many.html${qs}` });
            let ready = false;
            for (let i = 0; i < 300 && !ready; i++) {
              await new Promise((ok) => setTimeout(ok, 100));
              ready = await browser.evaluate('!!(window.bench && window.bench.ready)').catch(() => false);
            }
            if (!ready) throw new Error(`${backend} ${name}: 페이지가 30초 안에 준비되지 않았습니다`);
            // CPU 느리게(STEP 48차 측정처럼 — 주 스레드 몫이 드러나게). 1이면 그대로
            await browser.send('Emulation.setCPUThrottlingRate', { rate: cpu });
            log(`${backend} ${name} ${r + 1}/${rounds}: 처음 열기…`);
            const o = await browser.evaluate(`bench.open(${JSON.stringify(spec)}, ${budget})`, 900_000);
            log(`  다 올림 ${o.doneMs.toFixed(0)} ms, 프레임 ${o.frames}, 프레임 JS 합 ${o.drawSumMs.toFixed(0)} ms`);
            const st = await browser.evaluate(`bench.steady(${reps}, ${JSON.stringify(modes)})`, 900_000);
            res.renderer = o.renderer;
            res.meshes = o.meshes;
            res.triangles = o.triangles;
            const v = (res.variants[name] ??= { open: [], steady: {} });
            v.open.push(o);
            for (const row of st) {
              const s = (v.steady[row.mode] ??= { js: [], total: [], drawCalls: [], glCalls: [] });
              s.js.push(...row.js);
              s.total.push(...row.total);
              if (!s.drawCalls.includes(row.drawCalls)) s.drawCalls.push(row.drawCalls);
              if (!s.glCalls.includes(row.glCalls)) s.glCalls.push(row.glCalls);
            }
          }
        }
      } finally {
        await browser.close();
      }
      results.push(res);
    }
  } finally {
    server.close();
  }
  rmSync(buildDir, { recursive: true, force: true });
  const md = results.map(manyTable).join('\n');
  writeFileSync(join(out, 'summary.json'), `${JSON.stringify({ done: true, tool: 'scripts/bench/many.mjs', at: new Date().toISOString(), base: baseCommit, size, spec, budget, cpu, rounds, reps, modes, results }, null, 1)}\n`);
  writeFileSync(join(out, 'summary.md'), md);
  console.log(md);
  console.log(`결과: ${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((e) => {
    console.error(`[bench] 오류: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    process.exit(2);
  });
