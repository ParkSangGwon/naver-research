# naver-research

Claude가 네이버 블로그를 검색하고 본문 전문까지 읽게 해 주는 스킬이다.
Claude Code와 Claude 데스크톱 앱(Cowork) 양쪽에서 이 저장소 하나로 설치한다.

만든 사람: 박상권 (ted)

## 왜 필요한가

맛집·여행·제품 후기처럼 한국 사용자의 실사용 경험은 대부분 네이버 블로그에 있다.
그런데 Claude의 웹 읽기 도구는 `blog.naver.com`을 차단하고, PC 주소는 본문 없는 iframe 틀만 돌려준다.
이 스킬은 검색 화면(`search.naver.com`)과 모바일 본문(`m.blog.naver.com`)처럼 실제로 되는 경로만 골라 쓴다.

## 할 수 있는 것

| 기능 | Claude Code | Claude 앱 |
|---|---|---|
| 블로그 검색 (네이버 순위 그대로, 인플루언서 표시) | 됨 | 됨 |
| 본문 전문 읽기 (PC·모바일 주소 모두) | 됨 | 됨 |
| 상위노출 분석 | 됨 | 됨 |
| 이미지 받기 (최대 가로 800px) | 됨 | 됨 |
| 뉴스 검색 | API 키 필요 | 안 됨 |
| 최신순 31건 이상 대량 수집 (최대 1,000건) | API 키 필요 | 안 됨 |
| 쇼핑 검색 | API 키 필요 | 안 됨 |

## 설치 — Claude 앱 (Cowork)

1. 왼쪽 사이드바 "사용자 지정" > 플러그인 탭 > "+ 추가" > "마켓플레이스 추가" > "저장소에서 추가"를 고르고 `ParkSangGwon/naver-research`를 넣는다.
2. 목록에 나온 `naver-research` 플러그인을 설치한다.
3. 왼쪽 아래 내 이름 > 설정 > 기능 > "코드 실행 및 파일 생성"의 "추가 허용 도메인"에 `*.naver.com`과 `*.pstatic.net`을 하나씩 추가한다.
4. 새 대화를 열어 쓴다.
   설정을 바꾸기 전에 열어 둔 대화에는 반영되지 않는다.

회사 계정(Team·Enterprise)은 네트워크 설정을 관리자만 바꿀 수 있다.

## 설치 — Claude Code

Node.js 18 이상이 필요하다 (`node --version`).

```
/plugin marketplace add ParkSangGwon/naver-research
/plugin install naver-research@naver-research
```

설치 뒤 Claude Code를 새로 열면 된다.
업데이트는 `/plugin marketplace update naver-research`로 받는다.

### 네이버 Open API 키 (선택)

키는 뉴스 검색, 최신순 31건 이상 대량 수집, 쇼핑 검색에만 필요하다.

1. https://developers.naver.com/apps 에서 애플리케이션을 등록하고 사용 API로 "검색"을 고른다.
2. 발급된 Client ID·Secret을 `~/.config/naver/.env`에 저장한다.

```
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
```

환경변수 `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`이 있으면 그쪽이 우선한다.
무료 쿼터는 하루 25,000회다.

## 쓰는 법

명령어를 외울 필요 없이 그냥 말하면 된다.

- "강릉 카페 블로그 후기 모아줘"
- "이 블로그 글 요약해줘 https://blog.naver.com/..."
- "'제주 렌트카' 상위노출 누가 먹고 있어?"
- "이 글 사진 다 받아줘 https://blog.naver.com/..."

## 문제가 생기면

- Claude 앱에서 네이버에 접속할 수 없다고 나오면 허용 도메인 두 개가 있는지 확인하고 새 대화를 연다.
  이때 Claude가 Chrome 권한을 달라고 하면 거부해도 된다.
- 검색 결과의 제목이나 블로거명이 비어 있으면 네이버가 화면 구조를 바꾼 것이다.
  실측 앵커와 복구 절차는 [skills/naver-research/references/selectors.md](skills/naver-research/references/selectors.md)에 있다.
- 본문을 찾지 못했다고 나오면 비공개나 삭제된 글이다.

## 주의

개인적인 조사 용도로만 쓴다.
대량·체계적 수집, DB 구축, 차단 우회에는 쓰지 않는다.
