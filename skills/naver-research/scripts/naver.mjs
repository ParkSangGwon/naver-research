#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { fetchText, openApi } from './lib/http.mjs';
import { KST_DATE, parsePost, parseSearchResults, stripHtml, toAbsoluteDate, toMobileUrl } from './lib/parse.mjs';

const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy;
const nodeFlags = process.allowedNodeEnvironmentFlags;

// 내장 fetch는 HTTPS_PROXY를 무시해 프록시로만 나가는 샌드박스(Claude 앱 Cowork)에서 403 "Blocked by egress policy"를 받는다
if (PROXY && nodeFlags.has('--use-env-proxy') && !process.execArgv.includes('--use-env-proxy')) {
  const quiet = nodeFlags.has('--disable-warning') ? ['--disable-warning=UNDICI-EHPA'] : [];
  const { status } = spawnSync(process.execPath, ['--use-env-proxy', ...quiet, ...process.argv.slice(1)], { stdio: 'inherit' });
  process.exit(status ?? 1);
}

const CRAWL_PAGE_SIZE = 30;
const API_PAGE_SIZE = 100;
const API_START_LIMIT = 1000;

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    // --out=/a=b 처럼 값에 =가 들어갈 수 있어 첫 =에서만 자른다
    const separator = arg.indexOf('=');
    const key = separator < 0 ? arg.slice(2) : arg.slice(2, separator);
    const inline = separator < 0 ? undefined : arg.slice(separator + 1);
    flags[key] = inline ?? (argv[i + 1]?.startsWith('--') === false ? argv[++i] : 'true');
  }
  return { positional, flags };
}

// 플래그는 사용자 입력이라 검증한다 — 통과시키면 조용히 다른 경로로 돌고 출력 메타데이터까지 거짓이 된다
function option(flags, name, allowed, fallback) {
  const value = flags[name] ?? fallback;
  if (!allowed.includes(value)) {
    throw new Error(`--${name}은 ${allowed.join(' | ')} 중 하나여야 합니다 (받은 값: ${value})`);
  }
  return value;
}

function positiveInt(flags, name, fallback) {
  const raw = flags[name] ?? fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${name}은 1 이상의 정수여야 합니다 (받은 값: ${raw})`);
  }
  return value;
}

async function crawlSearch(query, { sort, count }) {
  const items = [];
  const seen = new Set();
  for (let start = 1; items.length < count && start <= API_START_LIMIT; start += CRAWL_PAGE_SIZE) {
    const url = new URL('https://search.naver.com/search.naver');
    url.searchParams.set('query', query);
    url.searchParams.set('ssc', 'tab.blog.all');
    url.searchParams.set('sm', start === 1 ? 'tab_jum' : 'tab_pge');
    url.searchParams.set('start', String(start));
    url.searchParams.set('nso', sort === 'date' ? 'so:dd,p:all,a:all' : 'so:r,p:all,a:all');

    const page = parseSearchResults(await fetchText(url.toString()));
    if (page.length === 0) break;

    const before = items.length;
    for (const item of page) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      items.push({ ...item, rank: items.length + 1 });
    }
    // 결과 수를 넘는 start에는 마지막 페이지가 그대로 돌아온다 — 안 끊으면 start=991까지 헛요청한다
    if (items.length === before) break;
  }
  return items.slice(0, count);
}

async function apiSearch(endpoint, query, { sort, count }) {
  const items = [];
  const seen = new Set();
  for (let start = 1; items.length < count && start <= API_START_LIMIT; start += API_PAGE_SIZE) {
    const display = Math.min(API_PAGE_SIZE, count - items.length);
    const body = await openApi(endpoint, { query, display, start, sort });
    if (!body.items?.length) break;
    for (const raw of body.items) {
      const link = raw.link;
      // 최신순 수집 중 새 글이 올라오면 페이지 경계에서 같은 글이 다시 나온다
      if (seen.has(link)) continue;
      seen.add(link);
      const blog = link.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)/);
      items.push({
        rank: items.length + 1,
        url: link,
        mobileUrl: blog ? `https://m.blog.naver.com/${blog[1]}/${blog[2]}` : null,
        blogId: blog?.[1] ?? null,
        logNo: blog?.[2] ?? null,
        title: stripHtml(raw.title),
        blogger: raw.bloggername ?? null,
        isInfluencer: false,
        postedText: raw.postdate ?? raw.pubDate ?? '',
        publishedAt: raw.postdate
          ? `${raw.postdate.slice(0, 4)}-${raw.postdate.slice(4, 6)}-${raw.postdate.slice(6, 8)}`
          : toAbsoluteDate(raw.pubDate ?? ''),
        description: stripHtml(raw.description),
      });
    }
  }
  return items.slice(0, count);
}

// 실측 근거: sort=sim에서 Open API는 네이버 블로그를 0~4%만 반환하고, 크롤은 페이지당 30건이 상한이다
function pickEngine({ engine, sort, count }) {
  if (engine !== 'auto') return engine;
  if (sort === 'sim') return 'crawl';
  return count > CRAWL_PAGE_SIZE ? 'api' : 'crawl';
}

function renderSearchMd(query, items, engine, label = '블로그') {
  const lines = [
    `# 네이버 ${label} 검색: ${query}`,
    '',
    `${items.length}건 · engine=${engine}`,
    '',
    `| # | ${label === '블로그' ? '블로거' : '출처'} | 발행일 | 제목 |`,
    '|---|---|---|---|',
  ];
  // 블로그명에 |가 들어가는 일이 흔하다 — 한 셀만 이스케이프하면 그 행의 열이 통째로 밀린다
  const cell = (value) => String(value ?? '-').replace(/\|/g, '\\|');
  for (const item of items) {
    const blogger = `${item.blogger || '-'}${item.isInfluencer ? ' (인플)' : ''}`;
    lines.push(`| ${item.rank} | ${cell(blogger)} | ${cell(item.publishedAt ?? item.postedText)} | [${cell(item.title)}](${item.url}) |`);
  }
  return lines.join('\n');
}

function renderPostMd(url, post) {
  return [
    `# ${post.title}`,
    '',
    `${url} · ${post.charCount.toLocaleString()}자 · 이미지 ${post.images.length}장`,
    post.headings.length ? `\n## 소제목\n${post.headings.map((h) => `- ${h}`).join('\n')}` : '',
    '',
    '## 본문',
    '',
    post.text,
  ]
    .filter(Boolean)
    .join('\n');
}

// publishedAt은 KST 달력 날짜라 오늘도 KST로 끊어야 한다 — 로컬 시각과 빼면 오전에 -1이 나온다
function daysAgo(dateString, now) {
  if (!dateString) return null;
  return Math.round((Date.parse(`${KST_DATE.format(now)}T00:00:00Z`) - Date.parse(`${dateString}T00:00:00Z`)) / 864e5);
}

function renderRankMd(query, items) {
  if (items.length === 0) return `${renderSearchMd(query, items, 'crawl')}\n\n검색 결과가 없어 분석을 건너뜁니다.`;

  const now = new Date();
  const buckets = { '7일 이내': 0, '30일 이내': 0, '90일 이내': 0, '그 이상': 0, 미상: 0 };
  const bloggers = new Map();
  let influencers = 0;

  for (const item of items) {
    const age = daysAgo(item.publishedAt, now);
    if (age === null) buckets.미상 += 1;
    else if (age <= 7) buckets['7일 이내'] += 1;
    else if (age <= 30) buckets['30일 이내'] += 1;
    else if (age <= 90) buckets['90일 이내'] += 1;
    else buckets['그 이상'] += 1;
    if (item.isInfluencer) influencers += 1;
    if (item.blogger) bloggers.set(item.blogger, (bloggers.get(item.blogger) ?? 0) + 1);
  }

  const repeat = [...bloggers.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
  const titleLengths = items.map((i) => i.title.length).sort((a, b) => a - b);
  const median = titleLengths[Math.floor(titleLengths.length / 2)] ?? 0;

  return [
    renderSearchMd(query, items, 'crawl'),
    '',
    '## 상위노출 분석',
    '',
    `- 인플루언서: ${influencers}/${items.length}건 (${Math.round((influencers / items.length) * 100)}%)`,
    `- 제목 길이 중앙값: ${median}자`,
    `- 발행 시점: ${Object.entries(buckets).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}건`).join(' · ')}`,
    repeat.length
      ? `- 복수 노출 블로거: ${repeat.map(([name, n]) => `${name}(${n})`).join(', ')}`
      : '- 복수 노출 블로거: 없음',
  ].join('\n');
}

async function readPost(url) {
  const mobileUrl = toMobileUrl(url);
  if (!mobileUrl) throw new Error(`네이버 블로그 URL이 아닙니다: ${url}`);
  const html = await fetchText(mobileUrl, { mobile: true });
  const post = parsePost(html);
  // PC판으로 리다이렉트되면 HTTP 200인데 본문이 없다 — 성공으로 오인하지 않도록 명시적으로 끊는다
  if (!post) throw new Error(`본문을 찾지 못했습니다 (비공개·삭제된 글이거나 페이지 구조 변경): ${mobileUrl}`);
  return { url: mobileUrl, ...post };
}

const COMMANDS = {
  async search({ positional, flags }) {
    const query = positional[0];
    if (!query) throw new Error('검색어가 필요합니다: naver.mjs search "강릉 카페"');
    const sort = option(flags, 'sort', ['sim', 'date'], 'sim');
    const format = option(flags, 'format', ['json', 'md'], 'json');
    const count = positiveInt(flags, 'count', 10);
    const engine = pickEngine({ engine: option(flags, 'engine', ['auto', 'crawl', 'api'], 'auto'), sort, count });
    const items = engine === 'api' ? await apiSearch('blog', query, { sort, count }) : await crawlSearch(query, { sort, count });
    return format === 'md' ? renderSearchMd(query, items, engine) : { query, sort, engine, count: items.length, items };
  },

  async read({ positional, flags }) {
    if (!positional.length) throw new Error('URL이 필요합니다: naver.mjs read "https://blog.naver.com/id/123"');
    const format = option(flags, 'format', ['json', 'md'], 'json');

    // 한 건이 비공개·삭제여도 나머지는 살린다 — 여러 건을 넘기는 명령에서 전부 잃으면 손해가 크다
    const posts = [];
    const failed = [];
    for (const url of positional) {
      try {
        posts.push(await readPost(url));
      } catch (error) {
        failed.push({ url, error: error.message });
      }
    }
    if (posts.length === 0) throw new Error(failed.map((f) => f.error).join('\n'));

    if (format === 'md') {
      return [...posts.map((p) => renderPostMd(p.url, p)), ...failed.map((f) => `> 읽지 못함: ${f.url}\n> ${f.error}`)].join('\n\n---\n\n');
    }
    if (posts.length === 1 && failed.length === 0) return posts[0];
    return { count: posts.length, posts, ...(failed.length ? { failed } : {}) };
  },

  async images({ positional, flags }) {
    const url = positional[0];
    if (!url) throw new Error('URL이 필요합니다: naver.mjs images "<url>" --out ./images');
    const out = flags.out ?? './images';
    const max = positiveInt(flags, 'max', 10);
    const post = await readPost(url);
    await mkdir(out, { recursive: true });

    const saved = [];
    for (const [index, src] of post.images.slice(0, max).entries()) {
      const res = await fetch(src, { headers: { Referer: post.url }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) continue;
      const extension = (basename(new URL(src).pathname).match(/\.(jpe?g|png|gif|webp)$/i)?.[0] ?? '.jpg').toLowerCase();
      const file = join(out, `${String(index + 1).padStart(2, '0')}${extension}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      await writeFile(file, bytes);
      saved.push({ file, bytes: bytes.length, source: src });
    }
    return { url: post.url, title: post.title, found: post.images.length, saved };
  },

  async rank({ positional, flags }) {
    const query = positional[0];
    if (!query) throw new Error('검색어가 필요합니다: naver.mjs rank "강릉 카페" --top 30');
    const format = option(flags, 'format', ['json', 'md'], 'md');
    const items = await crawlSearch(query, { sort: 'sim', count: positiveInt(flags, 'top', 30) });
    return format === 'json' ? { query, count: items.length, items } : renderRankMd(query, items);
  },

  async news({ positional, flags }) {
    const query = positional[0];
    if (!query) throw new Error('검색어가 필요합니다: naver.mjs news "키워드"');
    const format = option(flags, 'format', ['json', 'md'], 'json');
    const sort = option(flags, 'sort', ['date', 'sim'], 'date');
    const raw = await apiSearch('news', query, { sort, count: positiveInt(flags, 'count', 10) });
    const items = raw.map((item) => ({ ...item, blogger: new URL(item.url).hostname.replace(/^www\./, '') }));
    return format === 'md' ? renderSearchMd(query, items, 'api', '뉴스') : { query, count: items.length, items };
  },

  async shop({ positional, flags }) {
    const query = positional[0];
    if (!query) throw new Error('검색어가 필요합니다: naver.mjs shop "키워드"');
    const sort = option(flags, 'sort', ['sim', 'date', 'asc', 'dsc'], 'sim');
    const count = positiveInt(flags, 'count', 10);
    // 쇼핑은 페이지네이션을 두지 않았다 — API의 display 상한을 넘기면 정체불명의 400이 온다
    if (count > API_PAGE_SIZE) throw new Error(`--count는 ${API_PAGE_SIZE} 이하여야 합니다`);
    const body = await openApi('shop', { query, display: count, sort }).catch((error) => {
      // 쇼핑은 애플리케이션에 따로 등록해야 열린다. 크롤 대체 경로는 search.shopping.naver.com이 418로 막는다
      if (!error.message.includes('SE05')) throw error;
      throw new Error(
        '쇼핑 검색 API가 이 애플리케이션에 등록돼 있지 않습니다.\n' +
          'https://developers.naver.com/apps → 내 애플리케이션 → API 설정에서 "검색"을 추가하세요.\n' +
          '(search.shopping.naver.com 직접 크롤은 HTTP 418로 차단되므로 대체 경로가 없습니다)',
      );
    });
    const items = body.items.map((raw, index) => ({
      rank: index + 1,
      title: stripHtml(raw.title),
      url: raw.link,
      price: Number(raw.lprice),
      mall: raw.mallName,
      brand: raw.brand || null,
      category: [raw.category1, raw.category2, raw.category3].filter(Boolean).join(' > '),
    }));
    return { query, count: items.length, items };
  },
};

const USAGE = `네이버 리서치 — 검색·본문·이미지·순위 분석

  naver.mjs search <검색어> [--sort sim|date] [--count N] [--engine auto|crawl|api] [--format md]
  naver.mjs read <url...> [--format md]
  naver.mjs images <url> [--out DIR] [--max N]
  naver.mjs rank <검색어> [--top N] [--format json]
  naver.mjs news <검색어> [--sort date|sim] [--count N] [--format md]
  naver.mjs shop <검색어> [--count N]`;

const { positional, flags } = parseArgs(process.argv.slice(2));
const name = positional.shift() ?? '';
// Object.hasOwn 없이 인덱싱하면 toString·constructor 같은 프로토타입 멤버가 명령으로 실행된다
const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;

if (!command) {
  console.error(USAGE);
  process.exit(1);
}

try {
  const result = await command({ positional, flags });
  console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`오류: ${error.message}`);
  if (PROXY && /fetch failed|HTTP 403/.test(error.message)) {
    console.error(
      '프록시가 네이버 접속을 막고 있을 수 있습니다.\n' +
        'Claude 앱(Cowork)이면 설정 > 기능 > 추가 허용 도메인에 *.naver.com 과 *.pstatic.net 을 넣고 새 대화에서 다시 시도하세요.',
    );
  }
  process.exit(1);
}
