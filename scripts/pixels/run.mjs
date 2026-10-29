#!/usr/bin/env node
// @ts-check
/**
 * 화소·값 회귀 비교: npm run pixels -- --base <git 판> [--head <판>] [--out .runtime/pixels/<이름>] …(args.mjs의 USAGE)
 *
 * 1. 비교 페이지(page.html·page.ts)를 두 번 묶는다 — base는 그 커밋의 src를 git에서 바로 읽고, head는 작업 트리(또는 --head 커밋).
 * 2. 127.0.0.1에 두 묶음을 내주고 헤드리스 Chrome(SwiftShader, 새 임시 프로필) 하나로 같은 장면·같은 카메라를 찍는다.
 *    head·base를 번갈아 runs번(기본 2) 찍어, 같은 코드가 같은 그림을 내는지 먼저 본다(다르면 "불안정"으로 따로 알린다).
 * 3. RGBA 해시와 고르기·측정 값을 비교하고, 다른 장면은 base·head·차이 PNG를 out/diff/에 남긴다.
 * 4. out/summary.json(done: true)과 summary.md. GITHUB_STEP_SUMMARY가 있으면 거기에도 요약을 붙인다.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readArgs, readyWaitMs, slug, USAGE } from './args.mjs';
import { buildPage } from './build.mjs';
import { launchChrome } from './chrome.mjs';
import { classify, countStatuses, exitCode, markdown, valueDiff } from './compare.mjs';
import { git, resolveCommit } from './gitsrc.mjs';
import { decodePng, diffImages, encodePng } from './png.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const log = (/** @type {string} */ s) => console.error(`[pixels] ${s}`);
const sha = (/** @type {string | Uint8Array} */ b) => createHash('sha256').update(b).digest('hex');

/** @param {string} root @param {number} port @returns {Promise<import('node:http').Server>} */
function serve(root, port) {
  /** @type {Record<string, string>} */
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    let file = '';
    try {
      file = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    } catch {
      /* 잘못된 주소 */
    }
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

/** @typedef {import('./compare.mjs').Outcome} Outcome */

async function main() {
  /** @type {ReturnType<typeof readArgs>} */
  let args;
  try {
    args = readArgs(process.argv.slice(2), process.env);
  } catch (e) {
    console.error(String(/** @type {Error} */ (e).message));
    console.error(USAGE);
    return 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const t0 = Date.now();
  const startedAt = new Date().toISOString();
  const baseCommit = resolveCommit(repo, args.base);
  const headCommit = resolveCommit(repo, args.head ?? 'HEAD');
  const headRef = args.head ?? 'worktree';
  // 판마다 다른 것은 src뿐이다(비교 페이지는 두 판이 같은 작업 트리 것을 쓴다)
  const dirty = !args.head && git(repo, ['status', '--porcelain', '--', 'src']).trim() !== '';
  const stamp = startedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const out = resolve(args.out ?? join(repo, '.runtime/pixels', `${slug(args.base)}-${slug(headRef)}-${stamp}`));
  if (existsSync(join(out, 'summary.json'))) throw new Error(`이미 결과가 있습니다(덮어쓰지 않습니다): ${out}`);
  mkdirSync(out, { recursive: true });
  log(`base ${args.base} = ${baseCommit.slice(0, 12)}, head ${headRef} = ${headCommit.slice(0, 12)}${dirty ? '(+작업 트리 변경)' : ''} → ${out}`);

  // 1. 묶기
  const buildDir = join(out, 'build');
  const cacheDir = join(out, '.vite');
  const tb = Date.now();
  const baseBuild = await buildPage({ repo, outDir: join(buildDir, 'base'), commit: baseCommit, cacheDir });
  await buildPage({ repo, outDir: join(buildDir, 'head'), commit: args.head ? headCommit : null, cacheDir });
  rmSync(cacheDir, { recursive: true, force: true });
  log(`묶기 ${((Date.now() - tb) / 1000).toFixed(1)}초(base src 파일 ${baseBuild.files}개를 git에서 읽음)`);

  // 2. 찍기
  const server = await serve(buildDir, args.port);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : args.port;
  const { w, h } = args.size;
  const browser = await launchChrome({ width: w, height: h, chrome: args.chrome ?? undefined, log });
  const stop = async () => {
    await browser.close();
    server.close();
  };
  const onSignal = () => void stop().finally(() => process.exit(130));
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  /** @type {string[]} */
  const pageErrors = [];
  await browser.send('Runtime.enable');
  browser.on((method, params) => {
    if (method === 'Runtime.exceptionThrown' && pageErrors.length < 20) pageErrors.push(String(params?.exceptionDetails?.exception?.description ?? params?.exceptionDetails?.text ?? '').slice(0, 400));
  });

  /** @type {{ base: Map<string, Outcome[]>; head: Map<string, Outcome[]> }} */
  const shotRuns = { base: new Map(), head: new Map() };
  /** @type {{ base: Map<string, Outcome[]>; head: Map<string, Outcome[]> }} */
  const valueRuns = { base: new Map(), head: new Map() };
  /** 찍은 그림(PNG) — [판][장면][몇 번째] (첫 번째와 다른 것만 뒤에 남긴다) */
  /** @type {{ base: Map<string, Buffer[]>; head: Map<string, Buffer[]> }} */
  const pngs = { base: new Map(), head: new Map() };
  /** 첫 번째 값 */
  /** @type {{ base: Map<string, unknown[]>; head: Map<string, unknown[]> }} */
  const firstValues = { base: new Map(), head: new Map() };
  /** @type {Record<string, unknown>} */
  const webgl = {};
  /** @type {string[] | null} */
  let shotNames = null;
  /** @type {string[] | null} */
  let valueNames = null;
  let firstListKey = '';
  /** head 첫 번째 찍기의 장면·값 묶음별 시간(ms) */
  /** @type {Map<string, number>} */
  const timing = new Map();

  // 장면·값 묶음 하나의 CDP 한도(--timeout·PIXELS_TIMEOUT, 기본 120초)와 비교 페이지 준비 한도(그 1/4과 30초 가운데 긴 것)
  const tmo = args.timeoutMs;
  const readyMs = readyWaitMs(tmo);
  if (tmo !== 120_000) log(`CDP 한도 ${tmo / 1000}초, 페이지 준비 한도 ${readyMs / 1000}초`);
  try {
    for (let run = 0; run < args.runs; run++)
      for (const side of /** @type {const} */ (['head', 'base'])) {
        const tr = Date.now();
        pageErrors.length = 0;
        await browser.send('Page.navigate', { url: `http://127.0.0.1:${port}/${side}/page.html?w=${w}&h=${h}` }, tmo);
        let ready = false;
        for (const end = Date.now() + readyMs; !ready && Date.now() < end; ) {
          await new Promise((r) => setTimeout(r, 100));
          ready = await browser.evaluate('!!(window.pixels && window.pixels.ready)', tmo).catch(() => false);
        }
        if (!ready) throw new Error(`${side} 비교 페이지가 ${readyMs / 1000}초 안에 준비되지 않았습니다${pageErrors.length ? `: ${pageErrors.join(' / ')}` : ''}`);
        const list = await browser.evaluate('({ shots: pixels.shots, values: pixels.values, info: pixels.info() })', tmo);
        const listKey = JSON.stringify([list.shots, list.values]);
        if (!shotNames || !valueNames) {
          firstListKey = listKey;
          shotNames = /** @type {string[]} */ (list.shots).filter((n) => !args.only || args.only.test(n));
          valueNames = /** @type {string[]} */ (list.values).filter((n) => !args.only || args.only.test(n));
        } else if (listKey !== firstListKey) throw new Error('두 묶음의 장면 목록이 다릅니다');
        if (run === 0) webgl[side] = list.info;
        if (list.info?.renderer === '(WebGL2 없음)') throw new Error('헤드리스 Chrome에서 WebGL2를 만들지 못했습니다(SwiftShader 인자·GPU 흉내를 확인하세요)');
        for (const name of shotNames) {
          const ts = Date.now();
          const r = await browser.evaluate(`pixels.shot(${JSON.stringify(name)})`, tmo);
          if (run === 0 && side === 'head') timing.set(name, Date.now() - ts);
          /** @type {Outcome} */
          let o;
          if (r?.ok) {
            const raw = Buffer.from(r.value.rgba, 'base64');
            o = { hash: `${r.value.w}x${r.value.h}:${sha(raw)}` };
            const prev = shotRuns[side].get(name)?.[0];
            if (run === 0 || (prev && 'hash' in prev && prev.hash !== o.hash)) {
              const list2 = pngs[side].get(name) ?? [];
              list2[run] = encodePng(r.value.w, r.value.h, raw);
              pngs[side].set(name, list2);
            }
          } else o = r?.skip ? { skip: r.skip } : { error: r?.error ?? '결과 없음' };
          const arr = shotRuns[side].get(name) ?? [];
          arr.push(o);
          shotRuns[side].set(name, arr);
        }
        for (const name of valueNames) {
          const ts = Date.now();
          const r = await browser.evaluate(`pixels.value(${JSON.stringify(name)})`, tmo);
          if (run === 0 && side === 'head') timing.set(name, Date.now() - ts);
          /** @type {Outcome} */
          let o;
          if (r?.ok) {
            o = { hash: sha(JSON.stringify(r.value)) };
            if (run === 0) firstValues[side].set(name, r.value);
          } else o = r?.skip ? { skip: r.skip } : { error: r?.error ?? '결과 없음' };
          const arr = valueRuns[side].get(name) ?? [];
          arr.push(o);
          valueRuns[side].set(name, arr);
        }
        log(`${side} ${run + 1}/${args.runs}: 장면 ${shotNames.length}개·값 ${valueNames.length}묶음 ${((Date.now() - tr) / 1000).toFixed(1)}초${pageErrors.length ? ` (페이지 오류 ${pageErrors.length})` : ''}`);
      }
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    await stop();
  }
  if (!shotNames || !valueNames) throw new Error('찍은 것이 없습니다');

  // 3. 비교
  const diffDir = join(out, 'diff');
  const unstableDir = join(out, 'unstable');
  /** @param {string} dir @param {string} file @param {Buffer | string} data */
  const put = (dir, file, data) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, file), data);
    return join(dir, file).slice(out.length + 1);
  };
  /** @param {Buffer} a @param {Buffer} b */
  const pngDiff = (a, b) => {
    const d = diffImages(decodePng(a), decodePng(b));
    return { d, png: d.image ? encodePng(d.image.width, d.image.height, d.image.data) : null };
  };
  const shots = shotNames.map((name) => {
    const v = classify(shotRuns.base.get(name) ?? [], shotRuns.head.get(name) ?? []);
    /** @type {{ name: string; status: string; [k: string]: unknown }} */
    const rec = { name, ...v, ms: timing.get(name) };
    const hb = pngs.base.get(name), hh = pngs.head.get(name);
    if (v.status === 'diff' && hb?.[0] && hh?.[0]) {
      const { d, png } = pngDiff(hb[0], hh[0]);
      Object.assign(rec, { diffPixels: d.diffPixels, maxDelta: d.maxDelta, box: d.box, sizeMismatch: d.sizeMismatch || undefined });
      rec.files = [put(diffDir, `${name}.base.png`, hb[0]), put(diffDir, `${name}.head.png`, hh[0]), ...(png ? [put(diffDir, `${name}.diff.png`, png)] : [])];
    } else if (v.status === 'unstable') {
      const runs = (v.side === 'base' ? hb : hh) ?? [];
      const second = runs.findIndex((p, i) => i > 0 && p);
      if (runs[0] && second > 0) {
        const { d, png } = pngDiff(runs[0], runs[second]);
        Object.assign(rec, { diffPixels: d.diffPixels, maxDelta: d.maxDelta, box: d.box });
        rec.files = [put(unstableDir, `${name}.${v.side}-1.png`, runs[0]), put(unstableDir, `${name}.${v.side}-${second + 1}.png`, runs[second]), ...(png ? [put(unstableDir, `${name}.diff.png`, png)] : [])];
      }
    }
    if (args.keepShots) {
      if (hb?.[0]) put(join(out, 'shots/base'), `${name}.png`, hb[0]);
      if (hh?.[0]) put(join(out, 'shots/head'), `${name}.png`, hh[0]);
    }
    return rec;
  });
  const values = valueNames.map((name) => {
    const v = classify(valueRuns.base.get(name) ?? [], valueRuns.head.get(name) ?? []);
    const hv = firstValues.head.get(name), bv = firstValues.base.get(name);
    /** @type {{ name: string; status: string; [k: string]: unknown }} */
    const rec = { name, ...v, n: hv?.length ?? bv?.length, ms: timing.get(name) };
    if (v.status === 'diff' && hv && bv) {
      const d = valueDiff(bv, hv);
      Object.assign(rec, { count: d.count, lengths: d.lengths, examples: d.examples });
      rec.files = [put(diffDir, `${name}.base.json`, JSON.stringify(bv)), put(diffDir, `${name}.head.json`, JSON.stringify(hv))];
    }
    if (args.keepShots) {
      if (bv) put(join(out, 'shots/base'), `${name}.json`, JSON.stringify(bv));
      if (hv) put(join(out, 'shots/head'), `${name}.json`, JSON.stringify(hv));
    }
    return rec;
  });
  const code = exitCode([...shots, ...values]);
  const summary = {
    done: true,
    ok: code === 0,
    exitCode: code,
    tool: 'scripts/pixels',
    base: { ref: args.base, commit: baseCommit },
    head: { ref: headRef, commit: headCommit, dirty },
    size: args.size,
    runs: args.runs,
    only: args.only ? String(args.only) : null,
    timeoutSeconds: tmo / 1000,
    chrome: browser.version,
    webgl,
    startedAt,
    seconds: (Date.now() - t0) / 1000,
    counts: { shots: countStatuses(shots), values: countStatuses(values) },
    shots,
    values,
  };
  writeFileSync(join(out, 'summary.json'), `${JSON.stringify(summary, null, 1)}\n`);
  const md = markdown(/** @type {any} */ ({ ...summary, webgl: String((/** @type {any} */ (webgl.head))?.renderer ?? '') }));
  writeFileSync(join(out, 'summary.md'), md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  console.log(md);
  console.log(`결과: ${out}`);
  return code;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`[pixels] 오류: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    process.exit(2);
  },
);
