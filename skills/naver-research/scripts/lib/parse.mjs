const TAG = /<[^>]+>/g;

// 검색 결과 앵커마다 들어가는 시각적으로 숨겨진 접근성 라벨 — 클래스명이 CSS 모듈 해시라 텍스트로 잡는다
const NEW_WINDOW_LABEL = /<span[^>]*>\s*새\s*창\s*열림\s*<\/span>/g;

const ENTITIES = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: ' ' };

// fromCharCode는 하위 16비트만 남겨 이모지를 깨뜨린다 — 블로그 제목에 흔하다
const fromCodePoint = (value) => (value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : null);

export function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (m, d) => fromCodePoint(Number(d)) ?? m)
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => fromCodePoint(parseInt(h, 16)) ?? m)
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

export function stripHtml(s) {
  return decodeEntities(s.replace(NEW_WINDOW_LABEL, '').replace(TAG, '')).replace(/\s+/g, ' ').trim();
}

// blog.naver.com 데스크톱은 iframe 구조라 본문이 비어 온다 — m.blog로 바꿔야 파싱된다
export function toMobileUrl(url) {
  const path = url.match(/blog\.naver\.com\/([^/?#]+)\/(\d+)/);
  if (path) return `https://m.blog.naver.com/${path[1]}/${path[2]}`;
  const blogId = url.match(/[?&]blogId=([^&#]+)/)?.[1];
  const logNo = url.match(/[?&]logNo=(\d+)/)?.[1];
  return blogId && logNo ? `https://m.blog.naver.com/${blogId}/${logNo}` : null;
}

const RELATIVE_UNITS = { 초: 1e3, 분: 6e4, 시간: 36e5, 일: 864e5, 주: 6048e5, 개월: 2592e6, 년: 31536e6 };

// 네이버가 말하는 "3일 전"은 KST 달력 기준이다 — UTC로 끊으면 00~09시 KST에 하루씩 밀린다
export const KST_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' });

// 검색 결과는 최근 글을 "3일 전"처럼 상대 표기한다 — 절대 날짜로 환산해야 비교·정렬이 된다
export function toAbsoluteDate(text, now = new Date()) {
  const absolute = text.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (absolute) {
    const [, y, m, d] = absolute;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // 뉴스 API는 RFC 822로 준다 — KST 기준으로 끊어야 자정 근처 기사가 하루 밀리지 않는다
  if (/^[A-Z][a-z]{2},/.test(text)) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return KST_DATE.format(parsed);
  }
  const relative = text.match(/(\d+)\s*(초|분|시간|일|주|개월|년)\s*전/);
  if (!relative) return null;
  const ms = now.getTime() - Number(relative[1]) * RELATIVE_UNITS[relative[2]];
  return KST_DATE.format(new Date(ms));
}

const POST_ANCHOR = /data-url="(https:\/\/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+))"/g;
const TITLE = /sds-comps-text-type-headline[^"]*"[^>]*>([\s\S]*?)<\/span>/g;
const DESCRIPTION = /sds-comps-text-type-body1[^"]*"[^>]*>([\s\S]*?)<\/span>/g;
const BLOGGER = /profile-info-title-text"><a[^>]*href="([^"]+)"[^>]*>(?:<span[^>]*>)?([\s\S]*?)<\/span>/g;
const POSTED = /profile-info-subtext">([^<]+)<\/span>/g;

// 거리 제한이 없으면 프로필 블록이 없는 항목(광고 카드 등)이 앞 결과의 블로거·발행일을 조용히 물려받는다
function nearestBefore(html, pattern, pos, window = 4000) {
  pattern.lastIndex = 0;
  let best = null;
  for (const m of html.matchAll(pattern)) {
    if (m.index >= pos) break;
    best = m;
  }
  return best && pos - best.index <= window ? best : null;
}

function nearestAfter(html, pattern, pos, window = 4000) {
  pattern.lastIndex = 0;
  for (const m of html.matchAll(pattern)) {
    if (m.index < pos) continue;
    return m.index - pos <= window ? m : null;
  }
  return null;
}

export function parseSearchResults(html, { now = new Date() } = {}) {
  const items = [];
  const seen = new Set();

  for (const anchor of html.matchAll(POST_ANCHOR)) {
    const [, url, blogId, logNo] = anchor;
    if (seen.has(url)) continue;
    seen.add(url);

    const blogger = nearestBefore(html, BLOGGER, anchor.index);
    const posted = nearestBefore(html, POSTED, anchor.index);
    const title = nearestAfter(html, TITLE, anchor.index);
    const description = nearestAfter(html, DESCRIPTION, anchor.index);
    const postedText = posted ? posted[1].trim() : '';

    items.push({
      rank: items.length + 1,
      url,
      mobileUrl: `https://m.blog.naver.com/${blogId}/${logNo}`,
      blogId,
      logNo,
      title: title ? stripHtml(title[1]) : '',
      blogger: blogger ? stripHtml(blogger[2]) : '',
      // 인플루언서는 프로필이 in.naver.com으로 빠진다 — 상위노출 분석에서 의미 있는 구분이다
      isInfluencer: blogger ? blogger[1].includes('in.naver.com') : false,
      postedText,
      publishedAt: toAbsoluteDate(postedText, now),
      description: description ? stripHtml(description[1]) : '',
    });
  }
  return items;
}

// se-main-container는 중첩 div가 깊어서 정규식으로 끝을 못 찾는다 — 여는/닫는 div를 세어 블록을 자른다
function extractDivBlock(html, at) {
  const start = html.lastIndexOf('<div', at);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < html.length; i += 1) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      i = end < 0 ? html.length : end + 2;
      continue;
    }
    if (html.startsWith('<div', i) && /[\s>/]/.test(html[i + 4] ?? '>')) depth += 1;
    else if (html.startsWith('</div>', i)) {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 6);
    }
  }
  // 끝까지 균형이 안 맞으면 문서 나머지 전체가 본문으로 둔갑한다 — 실패로 끊어 호출부가 알게 한다
  return null;
}

function toText(fragment) {
  return decodeEntities(
    fragment
      // SE 컴포넌트마다 <script type="text/data">가 박혀 있다. 지금은 비어 있지만 채워지면 본문에 섞인다
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h\d)>/gi, '\n')
      .replace(TAG, ''),
  )
    .replace(/[ \t​]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const IMAGE_HOSTS = /(?:blogfiles\.naver\.net|postfiles\.pstatic\.net|[a-z]*blogthumb[a-z-]*\.pstatic\.net)/;

// postfiles는 파라미터 없이 원본을 주고, 썸네일 CDN은 ?type=이 없으면 404다
export function normalizeImageUrl(src) {
  const base = src.split('?')[0];
  if (src.includes('postfiles.pstatic.net')) return base;
  if (/(mblogthumb|blogthumb|blogpfthumb)[.-]/.test(src)) return `${base}?type=w800`;
  return src;
}

export function parsePost(html) {
  const at = html.indexOf('se-main-container');
  const container = at >= 0 ? extractDivBlock(html, at) : null;
  const body = container ?? (html.includes('id="viewTypeSelector"') ? extractDivBlock(html, html.indexOf('id="viewTypeSelector"')) : null);
  if (!body) return null;

  const title =
    html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ??
    html.match(/<title>([^<]*)<\/title>/)?.[1] ??
    '';

  const headings = [];
  const isHeading = (t) => t.length > 1 && t.length < 80;
  for (const m of body.matchAll(/<div[^>]*class="[^"]*se-section-sectionTitle[\s\S]{0,4000}?<\/div>/g)) {
    const t = stripHtml(m[0]);
    if (isHeading(t)) headings.push(t);
  }
  // 소제목 블록 대신 글자 크기로 구획을 나누는 블로그가 많다 — 본문 기본 15~16pt 기준 19pt 이상을 소제목으로 본다
  for (const m of body.matchAll(/<span[^>]*class="[^"]*se-fs-fs(\d+)[^"]*"[^>]*>([\s\S]*?)<\/span>/g)) {
    if (Number(m[1]) < 19) continue;
    const t = stripHtml(m[2]);
    if (isHeading(t)) headings.push(t);
  }

  const images = [];
  for (const m of body.matchAll(/<img[^>]+>/g)) {
    // \s를 붙이지 않으면 data-lazy-src·data-src 안의 src= 에 먼저 걸린다
    const src = m[0].match(/data-lazy-src="([^"]+)"/)?.[1] ?? m[0].match(/\ssrc="([^"]+)"/)?.[1];
    if (!src || !IMAGE_HOSTS.test(src)) continue;
    const normalized = normalizeImageUrl(src);
    if (!images.includes(normalized)) images.push(normalized);
  }

  const text = toText(body);
  return {
    title: decodeEntities(title).replace(/\s*:\s*네이버 블로그\s*$/, '').trim(),
    text,
    charCount: text.length,
    headings: [...new Set(headings)].slice(0, 20),
    images,
    paragraphCount: (body.match(/se-module-text/g) ?? []).length,
  };
}
