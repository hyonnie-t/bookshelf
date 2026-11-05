# bookshelf — 효니의 책장

## 무엇인지
배포 https://hyonnie-t.github.io/bookshelf/ . 효니의 책과 인스타 @hyonnie_books 서평을 모은 웹앱(2026-11-05, 옛 아티팩트 «효니의 책장»을 옮김).
공개 범위(효니 결정 2026-11-05): 책 정보와 인스타에 이미 공개한 글은 누구나 본다. 아이폰 메모·노션 기록·한 줄 평·별점은 주인 로그인 뒤에만 보인다.

## 구조
- `index.html` 뼈대, `css/app.css` 차분한 서가 스타일, `js/app.js` 화면 전부(책장·서평·돌아보기·입력 양식), `js/fb.js` 로그인과 비공개 저장, `sw.js` 앱 파일 캐시(비공개 기록은 캐시 안 함)
- `data/public.json` 공개 데이터(books, posts). 비공개 칸을 넣지 않는다
- 비공개 데이터: 시간표 앱과 같은 Firebase(timetable-af612) RTDB `users/{주인uid}/bookshelf`의 `works`·`igLinks`·`igAdded`. 규칙상 본인만 읽고 쓴다. 주인은 `js/fb.js`의 OWNER_UID
- `demo/private.json` 가짜 기록. `?demo=1`로 주인 화면을 시험하고 저장은 메모리에만 한다
- `tools/build-data.js` 처음 한 번 쓴 데이터 생성기. 원본은 `클로드작업\산출물\내 책장`, 비공개 시드 `private-seed.json`도 거기 있다(레포 밖). 다시 돌리면 앱에서 고친 내용과 어긋나므로 시드를 다시 올리지 않는다
- `tools/publish.js` 공개 반영: 앱에서 고친 책 정보·연결을 public.json에 넣는다. 기록·메모·별점은 옮기지 않는다
- `tools/serve.js` 내 PC 확인용 서버(launch 이름 `bookshelf`, 포트 8780)

## 규칙
- 비공개 내용(메모·기록·별점·한 줄 평)을 레포·공개 JSON·답변·로그에 넣지 않는다. 글 내용 대신 건수와 코드만 출력한다.
- 앱 파일을 바꾸면 `sw.js`의 `VERSION`을 올린다(네트워크 우선이라 옛 캐시 정리용).
- 공개 반영 순서: `npx.cmd firebase-tools database:get /users/<uid>/bookshelf --project timetable-af612 -o private.local.json` → `node tools/publish.js private.local.json` → private.local.json 지우기 → 커밋·푸시. (`private*.json`, `*.local.json`은 gitignore)
- 실제 Firebase 쓰기 시험은 효니가 시킬 때만 한다. 기능 시험은 `?demo=1`.
- 화면 확인은 폰 375 · 태블릿 768 · PC 1280, 다크 모드까지.
- 인스타 글은 레포에 사진을 넣지 않고 글과 주소만 둔다. 새 글을 한꺼번에 받을 때는 내장 브라우저에서 내 계정 화면을 읽기만 한다. 파일 내려받기는 내장 브라우저에서 안 되므로 주소 `#`로 내 PC 임시 서버에 넘긴다.
- 움직임: 서평 카드 떠오름, 선반 나타남, `prefers-reduced-motion`에서 끈다.
