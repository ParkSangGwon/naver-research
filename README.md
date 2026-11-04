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

### Claude에게 맡기기

Claude 앱 대화창에 아래 프롬프트를 붙여 넣으면 Claude가 설치 순서를 한 단계씩 안내한다.
플러그인 추가와 설정 변경은 앱 화면에서 직접 눌러야 해서, Claude는 다음에 누를 곳을 알려 주고 기다린다.

```
naver-research 스킬 설치를 도와줘.
플러그인 추가와 설정 변경은 내가 직접 해야 하니까, 아래 순서를 한 번에 한 단계씩만 안내하고 내가 "했어"라고 하면 다음 단계로 넘어가줘.
화면에 안내한 메뉴가 안 보인다고 하면 비슷한 메뉴를 같이 찾아줘.

1. 왼쪽 사이드바 "사용자 지정" > "플러그인" 탭 > 오른쪽 위 "+ 추가" > "마켓플레이스 추가" > "저장소에서 추가"를 고르고, URL 칸에 https://github.com/ParkSangGwon/naver-research 를 붙여 넣은 뒤 "동기화"를 누른다.
2. 목록에 나온 "Naver research"의 "추가"를 누른다. 코드를 실행하는 구성 요소가 있다는 안내가 뜨면 "계속"을 누른다.
3. 왼쪽 아래 내 이름 > "설정" > "기능" > "코드 실행 및 파일 생성"에서 "클라우드에서 코드 실행"과 "외부 네트워크 접속 허용"이 켜져 있는지 보고, "추가 허용 도메인"에 *.naver.com 과 *.pstatic.net 을 하나씩 추가한다.
4. 다 끝나면, 설정은 이 대화에 반영되지 않으니 새 대화를 열어 아래 문장을 보내 보라고 알려줘.
   naver-research 설치 확인해줘. 스킬로 '강릉 카페'를 3건만 검색해 보고, 막히면 무엇을 고쳐야 하는지 알려줘.
```

### 직접 하려면

1. 왼쪽 사이드바 "사용자 지정" > 플러그인 탭 > "+ 추가" > "마켓플레이스 추가" > "저장소에서 추가"를 고른다.
   URL 칸에 `https://github.com/ParkSangGwon/naver-research`를 붙여 넣고 "동기화"를 누른다.
2. 목록에 나온 "Naver research"의 "추가"를 누른다.
   코드를 실행하는 구성 요소가 있다는 안내가 뜨면 "계속"을 누른다.
3. 왼쪽 아래 내 이름 > 설정 > 기능 > "코드 실행 및 파일 생성"의 "추가 허용 도메인"에 `*.naver.com`과 `*.pstatic.net`을 하나씩 추가한다.
4. 새 대화를 열어 쓴다.
   설정을 바꾸기 전에 열어 둔 대화에는 반영되지 않는다.

회사 계정(Team·Enterprise)은 네트워크 설정을 관리자만 바꿀 수 있다.
새 버전은 플러그인 화면의 "업데이트"로 받는다.

## 설치 — Claude Code

### Claude에게 맡기기

Claude Code를 열고 아래 프롬프트를 그대로 붙여 넣는다.
Node.js 확인, 플러그인 설치, 테스트 검색까지 Claude Code가 알아서 한다.

```
https://github.com/ParkSangGwon/naver-research 의 naver-research 플러그인을 Claude Code에 설치해줘.

1. node --version 으로 Node.js 18 이상인지 확인해. 없거나 버전이 낮으면 https://nodejs.org 에서 LTS 설치 파일(macOS는 .pkg, Windows는 .msi)을 받아 설치하라고 안내하고, 설치 후 Claude Code를 완전히 껐다 켠 다음 이 프롬프트를 다시 보내라고 말한 뒤 멈춰.
2. claude plugin marketplace add ParkSangGwon/naver-research 를 실행해. 이미 추가돼 있으면 claude plugin marketplace update naver-research 로 최신화해.
3. claude plugin install naver-research@naver-research 를 실행해. 이미 설치돼 있으면 claude plugin update naver-research@naver-research 로 업데이트해.
4. ~/.claude/plugins/cache 아래에서 naver-research 의 scripts/naver.mjs 를 찾아, node <그 경로> search "강릉 카페" --count 3 --format md 로 검색 결과 3건이 나오는지 확인해.
5. 끝나면 결과를 짧게 알려주고, Claude Code를 새로 열어야 스킬이 잡힌다는 것과 바로 써 볼 예시 문장 두 개를 알려줘.
```

### 직접 하려면

Node.js 18 이상이 필요하다 (`node --version`).

```
claude plugin marketplace add ParkSangGwon/naver-research
claude plugin install naver-research@naver-research
```

설치 뒤 Claude Code를 새로 열면 된다.
업데이트는 `claude plugin marketplace update naver-research` 뒤 `claude plugin update naver-research@naver-research`로 받는다.

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
