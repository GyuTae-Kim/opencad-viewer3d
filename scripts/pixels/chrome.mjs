// @ts-check
/**
 * 헤드리스 Chrome을 새 임시 프로필로 띄우고 CDP(웹소켓)로 다룬다. WebGL은 SwiftShader(CPU)로 그려
 * 같은 기계에서는 같은 화소가 나오게 한다. 쓰는 사람의 브라우저·프로필에는 붙지 않는다.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

/** Chrome 실행 파일: CHROME_PATH → 운영 체제별 흔한 자리 → PATH */
export function findChrome(env = process.env, platform = process.platform) {
  if (env.CHROME_PATH) return env.CHROME_PATH;
  const fixed =
    platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
      : platform === 'win32'
        ? [`${env.PROGRAMFILES ?? 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`]
        : [];
  for (const p of fixed) if (existsSync(p)) return p;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try {
      const p = execFileSync('which', [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (p) return p;
    } catch {
      /* 다음 이름 */
    }
  }
  throw new Error('Chrome을 찾지 못했습니다(CHROME_PATH로 실행 파일을 알려 주세요)');
}

/**
 * Chrome 인자. 리눅스 CI에서는 샌드박스·/dev/shm 제약을 끈다.
 * gpu(비용 재기 scripts/bench만): SwiftShader 대신 기계의 GPU 백엔드(macOS는 ANGLE Metal)를 쓴다 — 화소 비교는 늘 SwiftShader
 * @param {{ profile: string; width: number; height: number; platform?: string; gpu?: boolean }} o
 */
export function chromeArgs({ profile, width, height, platform = process.platform, gpu = false }) {
  const args = [
    '--headless=new',
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--mute-audio',
    ...(gpu ? ['--enable-gpu', '--ignore-gpu-blocklist', ...(platform === 'darwin' ? ['--use-angle=metal'] : [])] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    '--force-device-scale-factor=1',
    `--window-size=${width},${height}`,
    '--hide-scrollbars',
  ];
  if (platform === 'linux') args.push('--no-sandbox', '--disable-dev-shm-usage');
  args.push('about:blank');
  return args;
}

/**
 * @typedef {{ send: (method: string, params?: object, timeoutMs?: number) => Promise<any>; evaluate: (expr: string, timeoutMs?: number) => Promise<any>;
 *   on: (cb: (method: string, params: any) => void) => void; version: string; close: () => Promise<void> }} Browser
 */

/**
 * @param {{ width: number; height: number; chrome?: string; log?: (s: string) => void; gpu?: boolean }} o
 * @returns {Promise<Browser>}
 */
export async function launchChrome({ width, height, chrome, log = () => {}, gpu = false }) {
  const exe = chrome ?? findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'pixels-chrome-'));
  const proc = spawn(exe, chromeArgs({ profile, width, height, gpu }), { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr?.on('data', (d) => {
    if (stderr.length < 8192) stderr += String(d);
  });
  let exited = false;
  proc.on('exit', () => (exited = true));
  const cleanup = async () => {
    if (!exited) {
      proc.kill('SIGTERM');
      for (let i = 0; i < 50 && !exited; i++) await sleep(100);
    }
    rmSync(profile, { recursive: true, force: true });
  };
  try {
    let port = 0;
    for (let i = 0; i < 300 && !port; i++) {
      if (exited) throw new Error(`Chrome이 바로 끝났습니다: ${stderr.slice(0, 600)}`);
      await sleep(100);
      const f = join(profile, 'DevToolsActivePort');
      if (existsSync(f)) port = Number(readFileSync(f, 'utf8').split('\n')[0]) || 0;
    }
    if (!port) throw new Error(`Chrome 디버깅 포트를 30초 안에 얻지 못했습니다: ${stderr.slice(0, 600)}`);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((/** @type {{ type: string }} */ t) => t.type === 'page');
    if (!page) throw new Error('Chrome 페이지 대상을 찾지 못했습니다');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', () => rej(new Error('CDP 웹소켓을 열지 못했습니다')), { once: true });
    });
    let seq = 0;
    /** @type {Map<number, (m: any) => void>} */
    const pending = new Map();
    /** @type {((method: string, params: any) => void)[]} */
    const listeners = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(String(ev.data));
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)?.(m);
        pending.delete(m.id);
      } else if (m.method) for (const cb of listeners) cb(m.method, m.params);
    });
    ws.addEventListener('close', () => {
      for (const r of pending.values()) r({ error: { message: 'CDP 연결이 끊겼습니다' } });
      pending.clear();
    });
    /** @param {string} method @param {object} [params] @param {number} [timeoutMs] */
    const send = (method, params = {}, timeoutMs = 120_000) =>
      new Promise((res, rej) => {
        const id = ++seq;
        const timer = setTimeout(() => {
          pending.delete(id);
          rej(new Error(`CDP ${method}가 ${timeoutMs / 1000}초 안에 끝나지 않았습니다`));
        }, timeoutMs);
        pending.set(id, (m) => {
          clearTimeout(timer);
          if (m.error) rej(new Error(`CDP ${method}: ${m.error.message}`));
          else res(m.result);
        });
        ws.send(JSON.stringify({ id, method, params }));
      });
    /** @param {string} expression @param {number} [timeoutMs] */
    const evaluate = async (expression, timeoutMs) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
      if (r.exceptionDetails) throw new Error(`페이지 오류: ${(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? '').slice(0, 800)}`);
      return r.result?.value;
    };
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const ver = await send('Browser.getVersion');
    log(`Chrome ${ver.product} (${exe})`);
    return {
      send,
      evaluate,
      on: (cb) => listeners.push(cb),
      version: String(ver.product),
      close: async () => {
        try {
          await send('Browser.close', {}, 5000);
        } catch {
          /* 이미 닫힘 */
        }
        ws.close();
        await cleanup();
      },
    };
  } catch (e) {
    await cleanup();
    throw e;
  }
}
