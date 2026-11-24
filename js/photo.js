// 사진 읽기(2026-11-24, 출처: 효니 쪽지 «도서 웹앱에서 사진으로 인식하기», 효니 선택 «대출 화면 캡처·바코드 둘 다, 제미나이»).
// 사진을 줄이고 중계(tools/kakao-book-relay.gs doPost)에 보내는 일은 app.js, 여기는 받은 결과를 다루는 계산만(다른 파일을 불러오지 않음). 시험 node tools/test-photo.js
const key = (s) => String(s || '').replace(/\s+/g, '').toLowerCase(); // app.js norm과 같은 기준(띄어쓰기만 다른 제목은 같은 책)

// ISBN-13 검사 숫자(978·979로 시작). 바코드 사진에서 받은 숫자가 맞는지 한 번 더 본다
export function isbnOk(s) {
  const d = String(s || '');
  if (!/^97[89]\d{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(d[12]);
}
// 찾는 말이 ISBN이면 숫자만(하이픈·띄어쓰기 뺌), 아니면 빈 글자
export function isbnQuery(q) {
  const d = String(q || '').replace(/[\s-]/g, '');
  return isbnOk(d) ? d : '';
}
// 찾은 책이 그 ISBN인지(카카오는 «10자리 13자리»로 준다)
export const sameIsbn = (b, isbn) => !!isbn && String((b && b.isbn) || '').split(/\s+/).includes(isbn);

// 대출 화면에서 읽은 책을 «여러 권 한꺼번에 꽂기» 줄(«제목 / 저자»)에 더한다.
// 이미 적힌 제목은 줄을 더하지 않고, 그 줄에 저자가 없을 때만 저자를 붙인다. have(제목 키 Set)에 있는 책은 «이미 서재에» 수로만 센다
export function mergeLines(lines, books, have = new Set()) {
  const out = [...lines];
  const titleOf = (l) => key(l.split(/\s+\/\s+/)[0]);
  let added = 0, filled = 0, already = 0;
  for (const b of books || []) {
    const t = String((b && b.t) || '').trim(), a = String((b && b.a) || '').trim();
    if (!t) continue;
    if (have.has(key(t))) { already++; continue; }
    const at = out.findIndex((l) => titleOf(l) === key(t));
    if (at < 0) { out.push(a ? `${t} / ${a}` : t); added++; }
    else if (a && !/\s\/\s/.test(out[at])) { out[at] = `${out[at].trim()} / ${a}`; filled++; }
  }
  return { lines:out, added, filled, already };
}

// 빌린 곳·반납일: 가장 많이 나온 값. 책마다 반납일이 다르면 mixed(가장 많은 날을 넣고 화면에 알린다)
export function loanGuess(books) {
  const most = (xs) => {
    const n = new Map();
    xs.filter(Boolean).forEach((x) => n.set(x, (n.get(x) || 0) + 1));
    return [...n.entries()].sort((p, q) => q[1] - p[1] || (p[0] < q[0] ? -1 : 1))[0];
  };
  const bs = books || [], who = most(bs.map((b) => b.lib)), due = most(bs.map((b) => b.due));
  return { who:who ? who[0] : '', due:due ? due[0] : '', mixed:new Set(bs.map((b) => b.due).filter(Boolean)).size > 1 };
}

// 줄인 사진 크기: 긴 변 max 이하, 비율 그대로
export function fitSize(w, h, max = 1600) {
  const s = Math.min(1, max / Math.max(w, h, 1));
  return { w:Math.max(1, Math.round(w * s)), h:Math.max(1, Math.round(h * s)) };
}
// 중계 오류 코드 → 효니에게 보일 말
export function seeError(code) {
  return ({
    no_key:'사진 읽기 열쇠가 아직 중계에 없어요.',
    limit:'오늘 사진 읽기 횟수를 다 썼어요. 내일 다시 해 주세요.',
    too_big:'사진이 너무 커요. 화면 캡처로 다시 해 주세요.',
    upstream:'제미나이가 지금 바빠요. 잠깐 뒤에 다시 해 주세요.',
  })[code] || '사진을 읽지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.';
}
