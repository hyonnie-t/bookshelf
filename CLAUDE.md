# bookshelf — 효니의 책장

## 무엇인지
배포 https://hyonnie-t.github.io/bookshelf/ . 효니의 책과 인스타 @hyonnie_books 서평을 모은 웹앱(2026-11-05, 옛 아티팩트 «효니의 책장»을 옮김).
공개 범위(효니 결정 2026-11-05): 책 정보와 인스타에 이미 공개한 글은 누구나 본다. 아이폰 메모·노션 기록·한 줄 평·별점은 주인 로그인 뒤에만 보인다. «내 서재» 탭(소장 목록·빌린 기록, 사람 이름 포함)도 주인 로그인 뒤에만 보인다(공개 여부는 효니에게 확인 전 기본값, 2026-11-05).

나만 보기(2026-11-05): 비공개 칸 `works/{id}.only`. 켜면 `tools/publish.js`가 공개본에서 뺀다. 값이 없으면 책·영화가 아닌 칸(trip·show·other·wishlist)은 나만 보기로 친다(app.js `isOnlyMe`와 publish.js가 같은 기준). 책·영화는 풀면 `only`를 지워 원래 기준으로 돌아가고, 다른 칸은 `only:false`로 책 정보(제목·저자·주제·날짜)가 올라간다. 기본값으로 잠긴 칸을 공개될 수 있는 책에 합치면 메모·기록만 옮기고 책 정보는 옮기지 않는다. 공개 페이지는 정적 파일이라 이미 올라간 책은 공개 반영 전까지 남고, 책 창에 그 상태를 그대로 적는다. 범용판에는 없다.

## 범용판 (/my/, 2026-11-05)
주소 https://hyonnie-t.github.io/bookshelf/my/ . 누구나 가입 없이 쓰는 빈 책장(효니 결정: 가입 없이, 기기 저장). 효니 데이터·Firebase를 쓰지 않는다. 같은 `js/app.js`를 `<html data-mode="local">`로 돌리고, 저장은 `js/local.js`(IndexedDB `my-bookshelf`), 백업은 JSON 파일. 서평 탭·인스타·블로그는 숨긴다. 서비스워커는 `my/sw.js`, 캐시 이름은 `myshelf-`(루트 sw가 `bookshelf-`만 정리). 앱 파일을 바꾸면 `my/sw.js` VERSION도 올린다.

## 구조
- `index.html` 뼈대, `css/app.css` 차분한 서가 스타일, `js/app.js` 화면 전부(읽은 책·내 서재·서평·돌아보기·입력 양식), `js/fb.js` 로그인과 비공개 저장, `sw.js` 앱 파일 캐시(비공개 기록은 캐시 안 함)
- `data/public.json` 공개 데이터(books, posts). 비공개 칸을 넣지 않는다
- 비공개 데이터: 시간표 앱과 같은 Firebase(timetable-af612) RTDB `users/{주인uid}/bookshelf`의 `works`·`igLinks`·`igAdded`·`library`. 규칙상 본인만 읽고 쓴다. 주인은 `js/fb.js`의 OWNER_UID
- 관악구통합도서관 빌린 책은 `st:'in'`, 빌려 준 곳은 분관 이름(관악중앙도서관·조원도서관)으로 넣었다(2026-11-05 5권)
- `library/{id}` 내 서재의 책: `t a p th where added`, `st`(own 소장/in 빌려 온 책), `w`(이어진 읽은 책 id, 없으면 빈 값), `loans[]`(`dir` out/in, `who d due back`). 빌려 온 책을 돌려주면 서가에서 빠지고 지난 기록에만 남는다. 읽은 책(`works`)에 섞지 않아 돌아보기 숫자가 그대로다. `tools/publish.js`는 이 칸을 읽지 않는다
- `demo/private.json` 가짜 기록. `?demo=1`로 주인 화면을 시험하고 저장은 메모리에만 한다
- `tools/build-data.js` 처음 한 번 쓴 데이터 생성기. 원본은 `클로드작업\산출물\내 책장`, 비공개 시드 `private-seed.json`도 거기 있다(레포 밖). 다시 돌리면 앱에서 고친 내용과 어긋나므로 시드를 다시 올리지 않는다
- `tools/publish.js` 공개 반영: 앱에서 고친 책 정보·연결을 public.json에 넣는다. 기록·메모·별점은 옮기지 않는다
- `data/blog.json` 티스토리 책 글(카테고리 «현의 문장들» 또는 태그·제목 괄호가 책 제목과 같은 글). 앞부분 180자와 주소만. `tools/fetch-blog.js`가 만들고 `.github/workflows/blog.yml`이 매일 06:20(KST) 돌린다
- 읽는 중: 다 읽은 기록 없이 미완독·읽는 중 표시가 있는 책은 «읽는 중» 칸으로 빠지고 읽은 권수에서 제외. 공개 화면은 `public.json`의 `st:'reading'`으로 안다(`tools/publish.js`가 채운다)
- 왓챠피디아(2026-11-05): 영화·시리즈는 `works`에 `k:'film'`, `wc`(왓챠 작품 코드), `recs[{d r l:'왓챠' b cd rd}]`로 넣었다. 하루 10건 이상 평가한 날은 본 날짜가 아니므로 `d`를 비우고 `rd`에만 둔다(앱이 `d`로 연도를 채우기 때문). 공개본에는 제목·연도만 간다. 만드는 도구는 `tools/import-watcha.js`. 왓챠 API는 공식 앱 외 요청을 막으므로(`not_allowed_client`) 내장 브라우저에서 평가·달력·코멘트 화면을 내려 가며 읽는다. 그 책 평가 47건은 넣지 않았다
- `tools/serve.js` 내 PC 확인용 서버(launch 이름 `bookshelf`, 포트 8780)

## 규칙
- 비공개 내용(메모·기록·별점·한 줄 평)을 레포·공개 JSON·답변·로그에 넣지 않는다. 글 내용 대신 건수와 코드만 출력한다.
- 앱 파일을 바꾸면 `sw.js`의 `VERSION`을 올린다(네트워크 우선이라 옛 캐시 정리용).
- 공개 반영 순서: `npx.cmd firebase-tools database:get /users/<uid>/bookshelf --project timetable-af612 -o private.local.json` → `node tools/publish.js private.local.json` → private.local.json 지우기 → 커밋·푸시. (`private*.json`, `*.local.json`은 gitignore)
- 실제 Firebase 쓰기 시험은 효니가 시킬 때만 한다. 기능 시험은 `?demo=1`.
- 별점은 0.5 단위(`r`: 0~5, 효니 결정 2026-11-05). 0은 «최하», 표시는 `starText`, 단계 목록은 `RATING_STEPS`.
- 화면 확인은 폰 375 · 태블릿 768 · PC 1280, 다크 모드까지.
- 인스타 글은 레포에 사진을 넣지 않고 글과 주소만 둔다. 새 글을 한꺼번에 받을 때는 내장 브라우저에서 내 계정 화면을 읽기만 한다. 파일 내려받기는 내장 브라우저에서 안 되므로 주소 `#`로 내 PC 임시 서버에 넘긴다.
- 움직임: 서평 카드 떠오름, 선반 나타남, 책 창은 표지가 넘어가며 펼쳐지고 덮인다(`.tome.opening/.closing`, 평소에는 표지 요소가 숨어 있어 움직임을 꺼도 그대로 읽힌다). `prefers-reduced-motion`에서 끈다. 중간 장면은 애니메이션을 `pause`하고 `currentTime`을 정해 찍는다.
- 내장 브라우저 창이 가려져 있으면 화면 프레임이 멈춰 dialog의 `close` 이벤트와 부드러운 스크롤, 등장 효과가 캡처할 때만 조금씩 진행된다. 앱 버그로 착각하지 않는다(2026-11-05).

## 메뉴·색·겹치는 책·책 찾기 (2026-11-05, 범용판도 같은 코드)
- 위에 붙는 메뉴(`.topnav`): 탭과 바로 가기. 바로 가기는 그 화면의 묶음 그대로다(읽은 책·서평은 연도, 내 서재는 칸). 종류·주제는 이미 고르기 단추가 있어 넣지 않았다. 묶음 요소에 `jumpMark`로 `data-jump`를 단다. 고정 영역이 화면 높이의 15%를 넘지 않게 찾기 칸은 붙이지 않는다.
- 색 에디션: `css/app.css` 끝의 `[data-edition="…"]`. 주제 색은 기준색(`--h0`) 둘레로 계산하고, 밝은 판·어두운 판을 함께 둔다. 새 에디션을 더하면 `js/app.js`의 EDITIONS에도 넣고 글자 대비(책등 4.5 이상)를 밝은 판·어두운 판 모두 재 본다. 고른 값은 기기별 localStorage(`shelf-edition`, 범용판은 `myshelf-edition`). `<head>`의 한 줄 스크립트가 첫 화면 전에 입힌다.
- 겹치는 책: 합치면 옮긴 기록·메모에 `from:[…빠진id]`를 달아 남길 책으로 옮기고, 빠지는 책은 `del:true, into:남길id, at, was:{남길 책의 합치기 전 a p th known unread guess y fd}`로 둔다. 되돌리기는 나중에 합친 것부터만 되고, 합친 뒤 고친 저자·출판사·주제·연도는 합치기 전 값으로 돌아간다(확인 창에 적음). 공개 연도가 앱 연도와 다른 책은 합치기→반영→되돌리기→반영 뒤 앱 연도로 바뀔 수 있다. 서평·서재 연결은 고쳐 쓰지 않고 읽을 때 `movedTo`로 옮겨 보여 준다(단, 합친 뒤 그 책의 서재 정보·서평 연결을 저장하면 남긴 책 id로 저장된다). `meta/notDup/{id~id}`는 «다른 책이에요». `tools/publish.js`는 서평 연결을 고쳐 쓰지 않고 공개본에 옮김 표 `moved`(id만)를 넣는다. 티스토리 글 연결(`tools/fetch-blog.js`)은 제목으로 다시 맞추므로, 빠진 책의 제목으로만 쓴 글은 공개 화면에서 연결이 빠질 수 있다.
- 책 찾기: 교보문고·알라딘 사이트는 CORS로 브라우저에서 못 읽는다(2026-11-05 확인). 지금은 구글 도서→오픈 라이브러리 순으로 찾고, 서점 검색 링크를 함께 둔다. 키 없는 구글은 공용 한도 초과(429)가 잦고, 오픈 라이브러리는 한국 책이 거의 없다(최근 책 5권 0건). 알라딘 Open API는 2026-10-30에 종료돼 쓸 수 없다(공지 2026-09-01). 후보는 카카오 책 검색(REST 키)인데, API 키를 레포에 넣지 않으므로 앱스크립트 중계가 필요하다(아직 안 만듦).
