import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

// 데스크톱 UA로 m.blog를 요청하면 PC판으로 리다이렉트돼 iframe 껍데기(182B)가 온다
export const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 오픈 API 초당 속도 제한(에러 012) 회피 — 전 호출 직렬화 + 간격 유지
const GAP_MS = 250;
let queue = Promise.resolve();

function throttled(fn) {
  const next = queue.then(async () => {
    const result = await fn();
    await sleep(GAP_MS);
    return result;
  });
  queue = next.catch(() => {});
  return next;
}

async function request(url, { headers, timeout }) {
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeout) });
    if (res.status !== 429 || attempt >= 2) return res;
    await sleep(1000 * (attempt + 1));
  }
}

export function fetchText(url, { mobile = false, timeout = 15_000, referer } = {}) {
  const headers = {
    'User-Agent': mobile ? MOBILE_UA : DESKTOP_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko,en-US;q=0.9,en;q=0.8',
    ...(referer ? { Referer: referer } : {}),
  };
  return throttled(async () => {
    const res = await request(url, { headers, timeout });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return res.text();
  });
}

export function loadCredentials() {
  if (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) {
    return { id: process.env.NAVER_CLIENT_ID, secret: process.env.NAVER_CLIENT_SECRET };
  }
  const path = join(homedir(), '.config', 'naver', '.env');
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  const env = Object.fromEntries(
    raw
      .split('\n')
      .map((line) => line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, '')]),
  );
  if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) return null;
  return { id: env.NAVER_CLIENT_ID, secret: env.NAVER_CLIENT_SECRET };
}

export function requireCredentials(command) {
  const creds = loadCredentials();
  if (creds) return creds;
  throw new Error(
    `${command}에는 네이버 Open API 자격증명이 필요합니다.\n` +
      `~/.config/naver/.env 에 다음을 넣으세요 (https://developers.naver.com/apps 에서 발급):\n` +
      `  NAVER_CLIENT_ID=...\n  NAVER_CLIENT_SECRET=...`,
  );
}

export function openApi(endpoint, params) {
  const { id, secret } = requireCredentials(`${endpoint} 검색`);
  const url = new URL(`https://openapi.naver.com/v1/search/${endpoint}.json`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  return throttled(async () => {
    const res = await request(url, {
      headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret },
      timeout: 15_000,
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`네이버 Open API ${endpoint} ${res.status}: ${body.slice(0, 200)}`);
    return JSON.parse(body);
  });
}
