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
 * 0.43.0: --pbr이면 셋째 정의마다 바둑판 무늬에 법선·금속 거칠기 그림을 단 장면(모든 판 — 그 필드를 모르는 판은 바둑판만 그린다),
 * 판 head-nopbr = head 묶음을 PBR 끔(?pbroff=1)으로. 모드 꼬리 +section(x 가운데 단면 하나, 채우기 없음)·+shadows(해 그림자)
 * 0.51.0: --size d10k·d80k(자리마다 서로 다른 배열)·m10k·m80k(짝수 자리는 같은 배열 — 섞음)·s10k·s80k(모두 같은 배열 — STEP 58차 표본 꼴, scripts/bench/flat.ts),
 * 모드 꼬리 +zoom(8배 확대 — 자리 대부분이 화면 밖), 판 head-nocull = head 묶음을 화면 밖 잘라내기 끔(?cull=0)으로,
 * --parts면 steady 대신 프레임 비용 나누기(GL 호출 종류별 수와 그 종류를 비운 JS 시간·GL 없는 JS·뷰어 몫·고르기 — many.ts의 parts),
 * --profile이면 모드마다 CPU 프로필, --open-only면 처음 열기만. 판 head-step(나눠 올리기 걸음 몫 함수 — 앞 두 걸음 8 ms, 그다음 그물 1,000개마다 1 ms)·
 * head-step-r250(+ redrawMs 250)·head-step-once(+ redrawMs Infinity — 첫 그림과 다 올린 뒤만 그리기). 열기 표에 첫 그림·다 올린 뒤 그림 끝·장면 그리기 수
 * 0.52.0: 판 head-merge(묶어 그리기 늘 켬 ?merge=1)·head-off(끔 ?merge=off — head는 기본 'auto'). 기본 백엔드는 SwiftShader만(기계 GPU는 OPENCAD_BENCH_GPU=1일 때만),
 * 판을 바꿀 때 앞 페이지 뷰어를 놓고 문맥을 잃게 한 뒤 빈 페이지를 거친다, 띄운 Chrome 묶음 RSS가 3 GB(CHROME_RSS_LIMIT_MB)를 넘으면 그 Chrome을 끄고 실패.
 * 열기 표에 묶음 굽기 끝·굽기 합·묶은 그물 수·묶음 수·묶음 MB,
 * 프레임 표에 묶음 구간 그리기 호출 수
 * 0.53.0: --editdiff면 head 판에서 빼기·바꾸기·더하기 뒤 다시 굽기(프레임마다 굽기 ms)와 다시 구운 묶음 그대로의 끔·켬 그림 차이
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
  // 0.51.0 자리가 많은 평평한 장면(scripts/bench/flat.ts — 자리 하나 삼각형 약 60)
  d10k: { flat: 10000, share: 'distinct' },
  m10k: { flat: 10000, share: 'mixed' },
  s10k: { flat: 10000, share: 'same' },
  d80k: { flat: 80000, share: 'distinct' },
  m80k: { flat: 80000, share: 'mixed' },
  s80k: { flat: 80000, share: 'same' },
  // 0.52.0 서로 다른 배열에 그리기 상태가 섞인 꼴(반투명·정점 색·같은 정의 배열이 흩어져 있다)
  v10k: { flat: 10000, share: 'varied' },
  v80k: { flat: 80000, share: 'varied' },
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

/**
 * 0.51.0 CPU 프로필(Profiler.stop의 profile)에서 함수별 자기 시간(ms) 위 n개 — 이름·파일:줄로 묶는다(GL 메서드는 이름만)
 * @param {any} profile @param {number} n
 */
export function topSelf(profile, n) {
  /** @type {Map<number, any>} */
  const byId = new Map(profile.nodes.map((/** @type {any} */ x) => [x.id, x]));
  /** @type {Map<string, number>} */
  const self = new Map();
  let total = 0;
  const samples = profile.samples ?? [], deltas = profile.timeDeltas ?? [];
  for (let i = 0; i < samples.length; i++) {
    const node = byId.get(samples[i]);
    const dt = (deltas[i + 1] ?? deltas[i] ?? 0) / 1000;
    if (!node) continue;
    const cf = node.callFrame;
    const file = cf.url ? cf.url.split('/').pop() : '';
    const key = file ? `${cf.functionName || '(익명)'} ${file}:${cf.lineNumber + 1}` : cf.functionName || '(익명)';
    self.set(key, (self.get(key) ?? 0) + dt);
    total += dt;
  }
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  return { total: Math.round(total), top: top.map(([k, ms]) => [k, Math.round(ms * 10) / 10]) };
}

/** 표(가운데값 (최소~최대)) @param {any} res */
export function manyTable(res) {
  const f = (/** @type {number[]} */ a) => {
    const s = stats(a);
    return `${s.median} (${s.min}~${s.max})`;
  };
  let md = `### ${res.backend} — ${res.renderer}\n\n그물 ${res.meshes.toLocaleString('en-US')}개(자리), 삼각형 ${res.triangles.toLocaleString('en-US')}개, CPU ${res.cpu ?? 1}배 느리게, 판마다 ${res.rounds}번(가운데값 (최소~최대) ms)\n\n`;
  md += '| 판 | 처음 열기 다 올림 | 첫 그림 | 다 올린 뒤 그림 끝 | 프레임 수 | 장면 그리기 수 | 프레임 JS 합 | 가장 긴 프레임 | 긴 작업 합 | 모아 그리기 시작 | 묶음 굽기 끝 · 굽기 합 | 묶은 그물 · 묶음 · MB | JS 힙 MB | GPU 버퍼 MB |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const [name, r] of Object.entries(res.variants))
    md += `| ${name} | ${f(r.open.map((/** @type {any} */ o) => o.doneMs))} | ${f(r.open.map((/** @type {any} */ o) => o.firstFrameMs))} | ${f(r.open.map((/** @type {any} */ o) => o.settleMs ?? 0))} | ${f(r.open.map((/** @type {any} */ o) => o.frames))} | ${f(r.open.map((/** @type {any} */ o) => o.renders ?? 0))} | ${f(r.open.map((/** @type {any} */ o) => o.drawSumMs))} | ${f(r.open.map((/** @type {any} */ o) => o.drawMaxMs))} | ${f(r.open.map((/** @type {any} */ o) => o.longSumMs))} | ${f(r.open.map((/** @type {any} */ o) => o.instMs ?? 0))} | ${f(r.open.map((/** @type {any} */ o) => o.mergeMs ?? 0))} · ${f(r.open.map((/** @type {any} */ o) => o.bakeMs ?? 0))} | ${r.open[0].mergedMeshes ?? 0} · ${r.open[0].mergedGroups ?? 0} · ${r.open[0].mergedMB ?? 0} | ${f(r.open.map((/** @type {any} */ o) => o.heapMB ?? 0))} | ${f(r.open.map((/** @type {any} */ o) => o.gpuMB ?? 0))} |\n`;
  if (Object.values(res.variants).some((/** @type {any} */ r) => Object.keys(r.steady).length)) {
    md += '\n| 판 | 모드 | 그리기 JS | GPU 마침까지 | 그리기 호출 | 묶음 구간 | GL 호출 |\n|---|---|---:|---:|---:|---:|---:|\n';
    for (const [name, r] of Object.entries(res.variants))
      for (const mode of Object.keys(r.steady)) {
        const s = r.steady[mode];
        md += `| ${name} | ${mode} | ${f(s.js)} | ${f(s.total)} | ${s.drawCalls.join('·')} | ${(s.mergedDraws ?? []).join('·')} | ${s.glCalls.join('·')} |\n`;
      }
  }
  // 0.51.0 프레임 비용 나누기(가운데값 ms — 몫 = 보통 renderNow JS − 그 종류 GL 호출을 비운 JS, GL 없는 JS = 모두 비운 JS, 뷰어 몫 = renderNow − 렌더러 render)
  if (Object.values(res.variants).some((/** @type {any} */ r) => Object.keys(r.parts ?? {}).length)) {
    const m = (/** @type {number[]} */ a) => stats(a).median;
    md += '\n| 판 | 모드 | 그리기 JS | GPU 마침까지 | 렌더러 | 뷰어 몫 | GL 없는 JS | 그리기 몫 | uniform 몫 | 묶기 몫 | 상태 몫 | GL 호출(그리기·uniform·묶기·상태·기타) | 잘라냄 | 묶음 구간 | 고르기 처음·뒤 |\n|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|\n';
    for (const [name, r] of Object.entries(res.variants))
      for (const mode of Object.keys(r.parts ?? {})) {
        const s = r.parts[mode];
        const js = m(s.js);
        const share = (/** @type {string} */ k) => Math.round((js - m(s.stub[k])) * 10) / 10;
        const c = s.calls[0];
        md += `| ${name} | ${mode} | ${f(s.js)} | ${m(s.total)} | ${m(s.render)} | ${Math.round((js - m(s.render)) * 10) / 10} | ${m(s.stub.all)} | ${share('draw')} | ${share('uniform')} | ${share('bind')} | ${share('state')} | ${c.draw}·${c.uniform}·${c.bind}·${c.state}·${c.upload + c.other} | ${s.culled.join('·')} | ${(s.mergedDraws ?? []).join('·')} | ${m(s.pickFirst)}·${m(s.pick)} |\n`;
      }
  }
  // 0.51.0 그림 해시(판·차례마다 — 같은 모드는 판끼리 같아야 한다)
  for (const [name, r] of Object.entries(res.variants))
    if (r.hashes?.length) md += `\n**${name} 그림 해시**: ${r.hashes.map((/** @type {any[]} */ hs) => hs.map((h) => `${h.mode} ${h.hash}(${h.lit})`).join(' · ')).join(' / ')}\n`;
  // 0.52.0 묶어 그리기 끔·켬 차이(모드 — 다른 화소 수 / 바탕 아닌 화소, 가장 큰 채널 차, 묶음 구간 그리기 수)
  for (const [name, r] of Object.entries(res.variants))
    if (r.mergeDiff?.length) md += `\n**${name} 묶어 그리기 끔·켬 차이**: ${r.mergeDiff.map((/** @type {any[]} */ ds) => ds.map((d) => `${d.mode} ${d.diff}/${d.lit}(최대 ${d.max}, 구간 ${d.merged})`).join(' · ')).join(' / ')}\n`;
  // 0.53.0 --editdiff(빼기·바꾸기·더하기 뒤 다시 굽기와 끔·켬 차이)
  for (const [name, r] of Object.entries(res.variants))
    for (const e of r.editDiff ?? [])
      md += `\n**${name} 빼기·바꾸기·더하기 뒤**: 그리기 ${e.before.drawCalls} → 다시 굽기 첫 프레임 ${e.rebake.firstDraws} → ${e.after.drawCalls}, 묶음 ${e.before.groups} → ${e.after.groups}(묶은 그물 ${e.after.meshes}/${e.after.scene}), 버퍼 ${e.before.buffers} → ${e.after.buffers}; 바꾸기 ${e.rebake.editMs} ms, 다시 굽기 ${e.rebake.frames}프레임(굽기 ${e.rebake.bakeFrames}프레임, 프레임마다 굽기 가장 긴 ${e.rebake.bakeMaxMs} ms, 합 ${e.rebake.bakeSumMs} ms, 가장 긴 프레임 JS ${e.rebake.frameMaxMs} ms); 끔·켬 차이 ${e.diff.map((/** @type {any} */ d) => `${d.mode} ${d.diff}/${d.lit}(최대 ${d.max}, 그리기 ${d.draws} — 끔 ${d.offDraws}, 구간 ${d.merged})`).join(' · ')}\n`;
  // 0.51.0 CPU 프로필(마지막 차례의 것 — 함수별 자기 시간 ms, 프레임 수로 나누지 않은 합)
  for (const [name, r] of Object.entries(res.variants))
    for (const [mode, p] of Object.entries(r.profile ?? {})) {
      const pp = /** @type {any} */ (p);
      md += `\n**${name} ${mode} 프로필**(그리기 ${pp.frames}번, 벽시계 ${pp.wall} ms, 표본 합 ${pp.top.total} ms): ${pp.top.top.map((/** @type {any} */ x) => `${x[0]} ${x[1]}`).join(' · ')}\n`;
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
      pbr: { type: 'boolean' },
      parts: { type: 'boolean' },
      profile: { type: 'boolean' },
      'open-only': { type: 'boolean' },
      hash: { type: 'boolean' },
      mergediff: { type: 'boolean' },
      editdiff: { type: 'boolean' },
    },
  });
  const rounds = Math.max(1, Math.min(20, Number(values.rounds ?? 2) || 2));
  const reps = Math.max(1, Math.min(50, Number(values.reps ?? 5) || 5));
  const budget = Math.max(1, Number(values.budget ?? 8) || 8);
  const cpu = Math.max(1, Math.min(20, Number(values.cpu ?? 1) || 1));
  const size = /** @type {keyof typeof SIZES} */ (values.size && values.size in SIZES ? values.size : 'full');
  const spec = SIZES[size];
  const modes = (values.modes ?? 'shadedEdges,shaded,shadedEdges+profiles,shadedEdges+highlight').split(',').filter(Boolean);
  const variants = (values.variants ?? (values.base ? 'base,head,head-noinst' : 'head,head-noinst')).split(',').filter(Boolean);
  if (variants.includes('base') && !values.base) throw new Error('base 판을 재려면 --base <git 판>을 주세요');
  const port = Number(values.port ?? 0) || 0;
  // 0.52.0(52차 GPU 안전): 기본은 SwiftShader만. 기계 GPU(gpu·both)는 그물이 아주 많은 장면에서 기계를 멈춘 일이 있어 OPENCAD_BENCH_GPU=1을 줄 때만
  const wantGpu = values.backend === 'gpu' || values.backend === 'both';
  if (wantGpu && process.env.OPENCAD_BENCH_GPU !== '1') throw new Error('기계 GPU 재기는 OPENCAD_BENCH_GPU=1일 때만 합니다(그물이 아주 많은 장면은 기계를 멈출 수 있다 — SwiftShader로 잰다)');
  const backends = values.backend === 'gpu' ? ['gpu'] : values.backend === 'both' ? ['swiftshader', 'gpu'] : ['swiftshader'];
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
            const params = [
              ...(name === 'head-noinst' ? ['inst=0'] : []),
              ...(values.pbr ? ['pbr=1'] : []),
              ...(name === 'head-nopbr' ? ['pbroff=1'] : []),
              ...(name === 'head-nocull' ? ['cull=0'] : []),
              // 0.52.0 묶어 그리기 늘 켬·끔(주지 않으면 판 기본 — 0.52.0은 'auto')
              ...(name === 'head-merge' ? ['merge=1'] : name === 'head-off' ? ['merge=off'] : []),
              // 0.51.0 나눠 올리기 걸음 몫 함수(STEP 59차 꼴)·다시 그리기 간격
              ...(name.startsWith('head-step') ? ['up=step'] : []),
              ...(name === 'head-step-r250' ? ['redraw=250'] : name === 'head-step-once' ? ['redraw=inf'] : []),
            ];
            const qs = params.length ? `?${params.join('&')}` : '';
            // 0.52.0 앞 판 페이지의 뷰어를 놓고 문맥을 잃게 한 뒤 빈 페이지로(GPU 자원이 판마다 쌓이지 않게)
            await browser.evaluate('window.bench && window.bench.close ? window.bench.close() : null').catch(() => null);
            await browser.send('Page.navigate', { url: 'about:blank' });
            await new Promise((ok) => setTimeout(ok, 500));
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
            res.renderer = o.renderer;
            res.meshes = o.meshes;
            res.triangles = o.triangles;
            const v = (res.variants[name] ??= { open: [], steady: {}, parts: {} });
            v.open.push(o);
            // 0.51.0 --hash: 모드마다 그림 해시(판끼리 같은 그림인지 — 기계 GPU에서도)
            if (values.hash) {
              const hs = await browser.evaluate(`bench.hashes(${JSON.stringify(modes)})`, 900_000);
              (v.hashes ??= []).push(hs);
            }
            // 0.52.0 --mergediff: 같은 페이지에서 묶어 그리기 끔·켬 그림 차이(head 묶음 판만 — 그 선택을 모르는 판은 건너뛴다)
            if (values.mergediff && name !== 'base') {
              const md = await browser.evaluate(`bench.mergeDiff(${JSON.stringify(modes)})`, 1_800_000);
              (v.mergeDiff ??= []).push(md);
            }
            // 0.53.0 --editdiff: 빼기·바꾸기·더하기 뒤 다시 굽기(프레임마다 굽기 ms)와 다시 구운 묶음 그대로의 끔·켬 그림 차이(그 함수가 있는 판만)
            if (values.editdiff && name !== 'base') {
              const ed = await browser.evaluate(`bench.editDiff ? bench.editDiff(${JSON.stringify(modes)}) : null`, 1_800_000);
              if (ed) (v.editDiff ??= []).push(ed);
            }
            // 0.51.0 --open-only: 처음 열기만(나눠 올리기 걸음 견주기)
            if (values['open-only']) continue;
            if (values.profile) {
              // 0.51.0 CPU 프로필(모드마다 reps × 2번 그리기 — 함수별 자기 시간 위 20)
              for (const mode of modes) {
                await browser.evaluate(`bench.prep(${JSON.stringify(mode)})`, 900_000);
                await browser.send('Profiler.enable');
                await browser.send('Profiler.setSamplingInterval', { interval: 200 });
                await browser.send('Profiler.start');
                const t0 = Date.now();
                await browser.evaluate(`bench.spin(${reps * 2})`, 900_000);
                const wall = Date.now() - t0;
                const { profile } = await browser.send('Profiler.stop', {}, 300_000);
                (v.profile ??= {})[mode] = { frames: reps * 2, wall, top: topSelf(profile, 20) };
              }
            }
            if (values.parts) {
              // 0.51.0 프레임 비용 나누기
              const pr = await browser.evaluate(`bench.parts(${reps}, ${JSON.stringify(modes)})`, 1_800_000);
              for (const row of pr) {
                const s = (v.parts[row.mode] ??= { js: [], total: [], render: [], stub: {}, calls: [], drawCalls: [], culled: [], mergedDraws: [], pickFirst: [], pick: [] });
                s.js.push(...row.js);
                s.total.push(...row.total);
                s.render.push(...row.render);
                for (const [k, a] of Object.entries(row.stub)) (s.stub[k] ??= []).push(...a);
                s.calls.push(row.calls);
                if (!s.drawCalls.includes(row.drawCalls)) s.drawCalls.push(row.drawCalls);
                if (!s.culled.includes(row.culled)) s.culled.push(row.culled);
                if (!s.mergedDraws.includes(row.mergedDraws ?? 0)) s.mergedDraws.push(row.mergedDraws ?? 0);
                s.pickFirst.push(row.pickFirst);
                s.pick.push(...row.pick);
              }
              continue;
            }
            const st = await browser.evaluate(`bench.steady(${reps}, ${JSON.stringify(modes)})`, 900_000);
            for (const row of st) {
              const s = (v.steady[row.mode] ??= { js: [], total: [], drawCalls: [], glCalls: [], mergedDraws: [] });
              s.js.push(...row.js);
              s.total.push(...row.total);
              if (!s.drawCalls.includes(row.drawCalls)) s.drawCalls.push(row.drawCalls);
              if (!s.glCalls.includes(row.glCalls)) s.glCalls.push(row.glCalls);
              if (!s.mergedDraws.includes(row.mergedDraws ?? 0)) s.mergedDraws.push(row.mergedDraws ?? 0);
            }
          }
        }
      } finally {
        // 0.52.0 띄운 Chrome 묶음 RSS 가장 큰 값(지킴이 — 한도를 넘으면 그 Chrome을 끄고 실패로 끝난다)
        res.rssPeakMB = browser.rssPeakMB();
        log(`${backend} Chrome RSS 가장 큰 값 ${res.rssPeakMB} MB`);
        await browser.close();
      }
      results.push(res);
    }
  } finally {
    server.close();
  }
  rmSync(buildDir, { recursive: true, force: true });
  const md = results.map(manyTable).join('\n');
  writeFileSync(join(out, 'summary.json'), `${JSON.stringify({ done: true, tool: 'scripts/bench/many.mjs', at: new Date().toISOString(), base: baseCommit, size, spec, budget, cpu, rounds, reps, modes, pbr: !!values.pbr, parts: !!values.parts, results }, null, 1)}\n`);
  writeFileSync(join(out, 'summary.md'), md);
  console.log(md);
  console.log(`결과: ${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().then(
    // 0.51.0: 결과를 다 쓴 뒤에는 바로 끝낸다(묶기 서비스·남은 연결이 이벤트 고리를 붙잡아 끝나지 않은 적이 있다)
    () => process.exit(0),
    (e) => {
      console.error(`[bench] 오류: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
      process.exit(2);
    },
  );
