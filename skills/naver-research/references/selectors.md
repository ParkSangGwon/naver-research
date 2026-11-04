# 실측 앵커와 복구 절차

2026-09-20 실측 기준이다.
네이버가 마크업을 바꾸면 여기부터 다시 확인한다.

## 왜 이 경로인가 (당시 실측값)

| 경로 | 결과 |
|---|---|
| Claude `WebFetch` → blog.naver.com | 도메인 차단 (`unable to fetch from blog.naver.com`) |
| curl → `blog.naver.com/{id}/{logNo}` | HTTP 200이지만 182바이트 빈 껍데기 (iframe) |
| curl → `m.blog.naver.com/PostView.naver` + 모바일 UA | 성공, 87KB |
| curl → `search.naver.com?ssc=tab.blog.all` | 성공, 페이지당 30건 |
| Open API `blog.json&sort=sim` | 네이버 블로그 0~4% |
| Open API `blog.json&sort=date` | 네이버 블로그 98~100% |
| `search.shopping.naver.com` | HTTP 418 (봇 차단) |

모바일 URL에 데스크톱 UA를 쓰면 PC판으로 리다이렉트돼 다시 빈 껍데기가 온다.
`http.mjs`가 UA를 나눠 쓰는 이유다.

## 검색 결과 (search.naver.com)

클래스 체계는 `sds-comps-*`다.
`title_link`·`user_info`·`dsc_link` 같은 구 클래스는 전부 0건이니 오래된 예제를 믿지 말 것.

| 필드 | 앵커 | 비고 |
|---|---|---|
| 포스트 URL | `data-url="https://blog.naver.com/{id}/{logNo}"` | 30/30 매칭. **등장 순서가 곧 검색 순위** |
| 제목 | `sds-comps-text-type-headline` | URL 앵커 **이후** 가장 가까운 것 |
| 설명 | `sds-comps-text-type-body1` | URL 앵커 **이후** 가장 가까운 것 |
| 블로거명 | `profile-info-title-text` 안쪽 `<a>` | URL 앵커 **이전** 가장 가까운 것 |
| 발행일 | `profile-info-subtext` | URL 앵커 **이전** 가장 가까운 것 |

**위치 기반으로 잡는 이유**: 필드를 `href` 패턴으로 매칭하면 네이버 인플루언서를 놓친다.
인플루언서는 프로필 링크가 `blog.naver.com/{id}`가 아니라 `in.naver.com/{handle}`로 나가고, 실측 30건 중 9건이 그랬다.
같은 이유로 `in.naver.com` 여부가 `isInfluencer` 판정 기준이 된다.

**앞뒤 탐색에는 4,000자 제한이 걸려 있다.**
제한이 없으면 프로필 블록이 없는 항목(광고 카드, 다른 레이아웃)이 **앞 결과의 블로거명과 발행일을 조용히 물려받는다**.
빈 값이 아니라 그럴듯한 값이라 아래 품질 기준으로도 안 걸러지므로, 값이 비는 편이 낫다.

**제목을 "가장 긴 텍스트"로 고르면 안 된다**: 제목과 설명이 같은 `<a href="blog.naver.com/...">` 패턴에 둘 다 걸려서, 길이로 고르면 30건 전부 설명이 제목 자리에 들어온다.

**접근성 라벨**: 앵커마다 숨겨진 `<span>새 창 열림</span>`이 들어 있다.
클래스가 `fender-ui_` + CSS 모듈 해시라 불안정하므로 라벨 텍스트로 지운다.

**날짜**: 최근 글은 `3일 전`·`2주 전` 상대 표기, 오래된 글은 `2026.07.15.`다.
`toAbsoluteDate()`가 둘 다 `YYYY-MM-DD`로 맞춘다.

### 파라미터

```
https://search.naver.com/search.naver
  ?query=<검색어>
  &ssc=tab.blog.all
  &sm=tab_jum        # 2페이지부터는 tab_pge
  &start=1           # 31, 61, ... (페이지당 30건)
  &nso=so:r,p:all,a:all    # 정확도순. 최신순은 so:dd,p:all,a:all
```

## 본문 (m.blog.naver.com)

| 대상 | 앵커 |
|---|---|
| 본문 컨테이너 | `.se-main-container` → 없으면 `#viewTypeSelector` |
| 문단 수 | `se-module-text` 출현 횟수 |
| 소제목(정식) | `se-section-sectionTitle` 블록 |
| 소제목(크기 기반) | `se-fs-fs{n}` 중 n ≥ 19 |
| 이미지 | `data-lazy-src` → 없으면 `src`, 호스트가 `postfiles.pstatic.net`·`blogfiles.naver.net`·`*blogthumb*.pstatic.net`인 것만 |

**컨테이너는 정규식으로 못 자른다**: 중첩 div가 깊어서 `extractDivBlock()`이 여는/닫는 `<div>`를 세어 블록 끝을 찾는다.
HTML 주석 안의 태그는 건너뛴다.
균형이 끝까지 안 맞으면 `null`을 돌려준다 — 문서 나머지 전체를 본문으로 넘기면 푸터와 트래킹 스크립트가 `text`·`charCount`에 섞인 채 성공으로 보고된다.

**`<script>`·`<style>`은 내용까지 지운다**: SE 컴포넌트마다 `<script type="text/data">`가 컨테이너 안에 박혀 있다.
실측 시점엔 154개가 전부 비어 있었지만, 채워지면 JSON이 그대로 본문이 된다.

**span 속성 순서를 가정하지 말 것**: 실제 마크업이 `<span style="..." class="se-fs-fs38 ...">`라서 `<span class="`로 시작하는 정규식은 소제목을 통째로 놓친다.
실제로 이 버그로 12개 중 1개만 잡혔었다.

**이미지 CDN**: `postfiles`는 쿼리 없이 원본을 주고, 썸네일 CDN(`mblogthumb`·`blogthumb`·`blogpfthumb`)은 `?type=`이 없으면 404다 — `?type=w800`을 붙인다.

**소제목 0은 결측이 아니다**: 소제목 없이 쓰는 블로그가 많다.

## 복구 절차

1. 실패한 검색어로 HTML을 받아둔다
   ```bash
   curl -s -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36" \
     "https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=강릉%20카페" -o /tmp/s.html
   ```
2. 위 표의 앵커가 몇 건씩 잡히는지 센다 — 0이면 그 앵커가 바뀐 것이다
   ```bash
   grep -o 'data-url="https://blog.naver.com/[^"]*"' /tmp/s.html | sort -u | wc -l
   grep -c 'sds-comps-text-type-headline' /tmp/s.html
   ```
3. 살아 있는 앵커(대개 `data-url`) 주변 HTML을 직접 열어 새 클래스명을 찾는다
   ```bash
   python3 -c "import re;s=open('/tmp/s.html',encoding='utf-8',errors='ignore').read();i=s.find('data-url=\"https://blog.naver.com');print(re.sub(r'\s+',' ',s[i-1200:i+1200]))"
   ```
4. `lib/parse.mjs`의 해당 정규식만 고친다
5. `node naver.mjs search "강릉 카페" --count 30`으로 4개 필드가 다시 채워지는지 확인한다

품질 기준은 **30건에서 제목·URL·블로거명·발행일이 28건 이상**, 본문은 **5건 중 5건 추출 성공**이다.
