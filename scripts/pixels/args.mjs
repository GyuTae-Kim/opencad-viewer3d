// @ts-check
/** 화소 비교 명령 인자 읽기(순수 함수 — 시험한다) */
import { parseArgs } from 'node:util';

export const USAGE = `쓰는 법: npm run pixels -- --base <git 판> [선택]

  --base <판>      비교 기준(브랜치·태그·SHA, 예: origin/main, v0.8.0, HEAD^1) — 꼭 준다
  --head <판>      비교할 판(기본: 지금 작업 트리, 커밋 안 한 변경 포함)
  --out <폴더>     결과 폴더(기본 .runtime/pixels/<base>-<head>-<시각>)
  --runs <N>       판마다 찍는 횟수(기본 2 — 같은 코드가 같은 그림을 내는지 먼저 본다, 1이면 건너뛴다)
  --size <폭x높이>  그림 크기(CSS 화소, 기본 960x600)
  --only <정규식>  이 이름에 맞는 장면·값 묶음만
  --port <N>       비교 페이지를 내줄 포트(기본 0 = 아무 빈 포트, 127.0.0.1에만)
  --chrome <경로>  Chrome 실행 파일(기본 CHROME_PATH 또는 흔한 자리)
  --keep-shots     같은 장면의 그림·값도 out/shots/에 남긴다
  --timeout <초>   장면·값 묶음 하나를 찍는 CDP 한도(기본 120, 환경 변수 PIXELS_TIMEOUT도 된다 — 부하가 높은 기계에서 늘린다.
                   비교 페이지 준비 한도는 그 1/4과 30초 가운데 긴 것)

끝 값: 0 = 모두 같음(불안정·새 장면은 알리기만), 1 = 다른 장면·값 또는 사라진 장면,
       2 = 도구 오류나 head 장면 예외(비교 페이지 scripts/pixels/page.ts를 함께 고친다)`;

/** 장면·값 묶음 하나를 찍는 CDP 한도 기본값(초) */
export const DEFAULT_TIMEOUT_S = 120;

/**
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} [env] 환경 변수(PIXELS_TIMEOUT — --timeout이 먼저다)
 * @returns {{ help: true } | { help: false; base: string; head: string | null; out: string | null; runs: number; size: { w: number; h: number }; only: RegExp | null; port: number; chrome: string | null; keepShots: boolean; timeoutMs: number }}
 */
export function readArgs(argv, env = {}) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      base: { type: 'string' },
      head: { type: 'string' },
      out: { type: 'string' },
      runs: { type: 'string' },
      size: { type: 'string' },
      only: { type: 'string' },
      port: { type: 'string' },
      chrome: { type: 'string' },
      'keep-shots': { type: 'boolean' },
      timeout: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) return { help: true };
  if (!values.base) throw new Error('--base <git 판>을 주세요(예: --base origin/main)');
  const runs = values.runs === undefined ? 2 : Number(values.runs);
  if (!Number.isInteger(runs) || runs < 1 || runs > 5) throw new Error(`--runs는 1~5: ${values.runs}`);
  const m = /^(\d+)x(\d+)$/i.exec(values.size ?? '960x600');
  if (!m) throw new Error(`--size는 폭x높이(예 960x600): ${values.size}`);
  const size = { w: Number(m[1]), h: Number(m[2]) };
  if (size.w < 64 || size.h < 64 || size.w > 4096 || size.h > 4096) throw new Error(`--size는 64~4096: ${values.size}`);
  const port = values.port === undefined ? 0 : Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`--port: ${values.port}`);
  let only = null;
  if (values.only) {
    try {
      only = new RegExp(values.only);
    } catch {
      throw new Error(`--only 정규식이 틀렸습니다: ${values.only}`);
    }
  }
  const ts = values.timeout ?? env.PIXELS_TIMEOUT;
  const timeout = ts === undefined || ts === '' ? DEFAULT_TIMEOUT_S : Number(ts);
  if (!Number.isFinite(timeout) || timeout < 10 || timeout > 3600) throw new Error(`--timeout(PIXELS_TIMEOUT)은 10~3600초: ${ts}`);
  return {
    help: false,
    base: values.base,
    head: values.head ?? null,
    out: values.out ?? null,
    runs,
    size,
    only,
    port,
    chrome: values.chrome ?? null,
    keepShots: !!values['keep-shots'],
    timeoutMs: Math.round(timeout * 1000),
  };
}

/** 비교 페이지가 준비되기를 기다리는 한도(ms): CDP 한도의 1/4과 30초 가운데 긴 것(기본 30초 — 0.22.0까지와 같다) @param {number} timeoutMs */
export const readyWaitMs = (timeoutMs) => Math.max(30_000, Math.round(timeoutMs / 4));

/** 판 이름 → 폴더 이름에 쓸 조각 @param {string} ref */
export const slug = (ref) => ref.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'ref';
