---
name: naver-research
description: 네이버 블로그·뉴스를 검색하고 본문 전문과 이미지까지 가져온다 — 상위노출 순위는 search.naver.com 크롤로, 본문은 m.blog.naver.com으로, 대량 최신순은 Open API로 처리한다. "네이버 검색해줘", "블로그 검색해줘", "네이버에 검색해봐", "네이버에서 찾아줘", "네이버 블로그 검색해줘", "네이버에 뭐라고 나와?", "블로그 글 좀 찾아줘", "블로그 후기 모아줘", "이 키워드로 블로그 리서치해줘", "블로그 상위노출 분석해줘", "이 블로그 글 내용 읽어줘", "네이버 블로그 글 요약해줘", "경쟁 블로그 조사해줘", "블로그 이미지 받아줘", "네이버 뉴스 찾아줘"처럼 네이버에서 무언가를 검색·조사하거나, 블로그 글을 찾거나 읽어야 하는 요청이면 명령 형태가 아니어도 이 스킬을 실행한다. 출처를 밝히지 않고 "블로그"라고만 해도 국내 맥락에서는 네이버 블로그를 뜻하므로 이 스킬을 쓴다. 맛집·여행·제품 후기처럼 한국 사용자의 실사용 경험을 찾을 때도 웹 검색보다 이 스킬이 낫다. Claude의 WebFetch는 blog.naver.com을 차단하므로 네이버 블로그 URL을 받으면 반드시 이 스킬을 쓴다. 구글·티스토리·유튜브 등 다른 출처를 명시한 검색이나, 네이버 블로그에 글을 발행·수정하는 작업에는 쓰지 말 것.
allowed-tools: Bash(node:*)
---

# 네이버 리서치

네이버 블로그·뉴스 조사를 CLI 하나로 처리한다.

**WebFetch로는 안 된다.**
`blog.naver.com`은 Claude Code가 도메인 자체를 차단하고(`unable to fetch`), curl로 PC URL을 받아도 iframe 껍데기 182바이트만 온다.
네이버 블로그 URL이 나오면 예외 없이 이 스킬을 쓴다.

```bash
S="${CLAUDE_SKILL_DIR}/scripts/naver.mjs"
```

## 1. 검색

```bash
node "$S" search "강릉 카페" --format md              # 상위노출 10건
node "$S" search "강릉 카페" --count 30 --format md   # 상위노출 30건
node "$S" search "강릉 카페" --sort date --count 100  # 최신순 대량 수집
```

`--engine`은 기본 `auto`이고 아래 실측에 따라 알아서 고른다 — 직접 지정할 일은 거의 없다.

| 상황 | 경로 | 왜 |
|---|---|---|
| `--sort sim` (기본) | 크롤 | Open API는 `sim`에서 네이버 블로그를 0~4%만 준다 (나머지는 tistory) |
| `--sort date` + 30건 초과 | Open API | 크롤은 페이지당 30건, API는 100건씩 최대 1,000건 |
| `--sort date` + 30건 이하 | 크롤 | 한 번 요청으로 끝나고 블로거·인플루언서 정보가 더 풍부 |

크롤 결과에는 `rank`(실제 검색 순위)와 `isInfluencer`가 들어간다.
Open API 결과에는 없다 — 순위가 중요하면 크롤을 쓴다.

## 2. 본문 읽기

```bash
node "$S" read "https://blog.naver.com/ratbell/224405399942" --format md
node "$S" read "<url1>" "<url2>" "<url3>"          # 여러 건 한 번에 (JSON)
```

PC·모바일·`PostView.naver?blogId=&logNo=` 어떤 형태를 넣어도 모바일 URL로 바꿔 파싱한다.
반환은 `title` · `text`(전문) · `charCount` · `headings` · `images` · `paragraphCount`.

본문을 못 찾으면 에러로 끊는다 — 비공개·삭제된 글이거나 네이버가 페이지 구조를 바꾼 경우다.
조용히 빈 문자열이나 페이지 껍데기를 반환하지 않으니 성공 여부를 따로 검사할 필요는 없다.

여러 건을 넘겼을 때 일부만 실패하면 나머지는 그대로 돌려주고 `failed` 배열에 실패한 URL과 이유를 담는다.
전부 실패할 때만 에러로 끊는다.

## 3. 상위노출 분석

```bash
node "$S" rank "강릉 카페" --top 30
```

순위표에 더해 인플루언서 비율·제목 길이 중앙값·발행 시점 분포·복수 노출 블로거를 요약한다.
블로그 SEO나 콘텐츠 기획에서 "지금 이 키워드는 누가 먹고 있나"를 볼 때 쓴다.

## 4. 이미지

```bash
node "$S" images "<url>" --out ./images --max 10
```

네이버 CDN 규칙을 반영해 받는다 — `postfiles`는 원본, 썸네일 CDN은 `?type=w800`을 붙여야 404가 안 난다.

## 5. 뉴스

```bash
node "$S" news "금리 인하" --count 10 --format md
```

Open API 경로라 `~/.config/naver/.env`에 자격증명이 있어야 한다.
`shop`도 있지만 애플리케이션에 쇼핑 API를 추가 등록해야 열린다 (실행하면 방법을 안내한다).

## 결론의 근거

검색 결과의 `description`은 잘린 스니펫이다.
결론은 `read`로 가져온 본문을 근거로 낸다.

## 자격증명

크롤 경로(`search --sort sim`, `read`, `rank`, `images`)는 자격증명 없이 동작한다.
`news`·`shop`과 `--engine api`는 `~/.config/naver/.env`가 필요하다.

```
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
```

환경변수가 있으면 그쪽이 우선한다.
발급은 https://developers.naver.com/apps 이고, 무료 쿼터는 하루 25,000회다.

## Claude 앱 Cowork에서

스킬 경로가 `/mnt/skills/`로 시작하면 Claude 앱 Cowork 샌드박스다.
이때는 아래를 따른다.

- 실행이 `fetch failed`나 `HTTP 403`으로 끝나면 브라우저로 우회하지 말고, 스크립트가 출력한 안내대로 사용자에게 네트워크 허용을 요청하고 멈춘다.
  설정 > 기능 > 추가 허용 도메인에 `*.naver.com`, `*.pstatic.net`을 넣은 뒤 새 대화에서 다시 시도해야 한다.
- `news`·`shop`·`--engine api`·최신순 31건 이상은 Cowork판에서 지원하지 않는다.
  자격증명 파일을 만들라고 안내하지 말고, 크롤 경로(최신순 30건까지)로 할 수 있는 만큼 하거나 Claude Code에 설치해 쓰라고 안내한다: https://github.com/ParkSangGwon/naver-research
- `images`의 `--out`은 사용자가 볼 수 있는 작업 폴더 아래로 지정한다.

## 선을 지킬 것

개인적인 조사 용도로만 쓴다.
대량·체계적 수집, DB 구축, 차단 우회는 하지 않는다.
한 세션에서 수십 건을 넘기지 말고, 필요한 만큼만 가져온다.

## 파싱이 깨졌을 때

네이버가 검색 결과 HTML을 바꾸면 제목·블로거명이 빈 값으로 나온다.
실측한 앵커와 복구 절차는 [references/selectors.md](references/selectors.md)에 있다.
