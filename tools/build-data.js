// 처음 한 번 쓰는 데이터 생성기: 어제 책장 데이터 + 볼트 본문 + 인스타 글 → 공개/비공개로 나눈다.
// 공개 data/public.json: 책 정보와 인스타에 이미 공개한 글만. 비공개 private-seed.json은 레포 밖(OneDrive)에 두고 Firebase에만 올린다.
// 사용: node tools/build-data.js   (글 내용은 출력하지 않는다)
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', '..', '..', '클로드작업', '산출물', '내 책장');
const VAULT = path.join(__dirname, '..', '..', '..', '클로드작업', '옵시디언', '효니노트', '4-독서·문화');
const read = (f) => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const shelf = read('shelf-data.json'), notion = read('notion-books.json'), ig = read('instagram-hyonnie_books.json');
const match = read('match-result.json'), review = read('match-review.json');
const key = (s) => (s || '').replace(/[\s·:,.!?'"“”‘’\-–—~()（）\[\]<>《》〈〉『』「」&+_/]/g, '').toLowerCase();
const hashHex = (s) => { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

// 볼트 본문 읽기
const byFile = new Map(), byNote = new Map();
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes:true })) {
    const q = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== '목차') walk(q); continue; }
    if (!e.name.endsWith('.md')) continue;
    const s = fs.readFileSync(q, 'utf8');
    let body = s.replace(/^---[\s\S]*?\n---\s*/, '');
    const m = s.match(/\[?원본번호:\s*(\d+)\]?/);
    body = body.replace(/^.*\[?원본번호:\s*\d+\]?.*$/m, '');
    body = body.replace(/^##+ .*\n(?=\s*(##|$))/gm, '').replace(/^##+ (인상 깊은 문장|생각·활용)\s*$/gm, '').trim();
    byFile.set(e.name.slice(0, -3), body);
    if (m) byNote.set(+m[1], body);
  }
})(VAULT);
const notionByFile = new Map(notion.map((r) => [r.file, r]));

// 비공개 전체
const works = {};
let recBody = 0, noteBody = 0, noteMiss = 0;
shelf.forEach((w, i) => {
  const id = `w${i}`;
  const recs = (w.recs || []).map((r) => {
    const n = r.file ? notionByFile.get(r.file) : null;
    const b = r.file ? (byFile.get(r.file) || '') : '';
    if (b) recBody++;
    const o = { d:r.d || '', l:(n && n.l) || r.l || '' };
    if (r.r != null) o.r = r.r;
    if (b) o.b = b;
    if (r.st) o.st = r.st;
    return o;
  });
  const notes = (w.notes || []).map((n) => {
    const b = byNote.get(n.id);
    if (b) noteBody++; else noteMiss++;
    const o = { id:n.id, d:n.d || '', l:n.l || '', len:n.len || 0 };
    if (n.v) o.v = n.v;
    if (n.g) o.g = 1;
    if (n.s && n.s !== 'read') o.s = n.s;
    if (b) o.b = b;
    return o;
  });
  const o = { id, t:w.t || '', a:w.a || '', k:w.k, th:w.th || [], y:w.y || '', fd:w.fd || '', known:!!w.known, recs, notes };
  if (w.p) o.p = w.p;
  if (w.guess) o.guess = true;
  if (w.unread) o.unread = true;
  works[id] = o;
});

// 인스타 글 ↔ 책
const dec = (c) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'; let n = 0n; for (const ch of c) n = n * 64n + BigInt(A.indexOf(ch)); return Number((n >> 23n) + 1314220021721n); };
const kst = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const byTitle = new Map(Object.values(works).filter((w) => w.t).map((w) => [key(w.t), w.id]));
const rev = new Map(review.map((r) => [r.c, r]));
const res = new Map(match.map((r) => [r.c, r]));
let added = 0;
const posts = ig.map((p) => {
  const m = res.get(p.c) || { w:[] }, r = rev.get(p.c);
  let ids = [], k = 'etc';
  if (r) {
    ids = (r.w || []).map((i) => `w${i}`);
    if (r.new && r.new.t) {
      const hit = byTitle.get(key(r.new.t));
      if (hit) ids.push(hit);
      else {
        const id = 'ig' + hashHex(key(r.new.t));
        works[id] = { id, t:r.new.t, a:r.new.a || '', k:'book', th:[], y:'', fd:'', known:true, recs:[], notes:[], igOnly:true };
        byTitle.set(key(r.new.t), id); ids.push(id); added++;
      }
    }
    if (ids.length) k = 'review';
  } else if (m.w && m.w.length) { ids = m.w.map((i) => `w${i}`); k = 'review'; }
  return { c:p.c, d:kst(p.t ? p.t * 1000 : dec(p.c)), x:p.x, k, w:[...new Set(ids)] };
});

// 공개 책: 완독 기록이 있는 책이거나, 인스타에 서평을 쓴 작품
const reviewed = new Set(posts.flatMap((p) => p.w));
const books = [];
Object.values(works).forEach((w) => {
  const done = w.k === 'book' && w.known && !w.guess && w.recs.some((r) => r.st !== 'unread');
  if (!done && !reviewed.has(w.id)) return;
  const first = posts.filter((p) => p.w.includes(w.id)).map((p) => p.d).sort()[0] || '';
  const doneYear = (w.recs.filter((r) => r.st !== 'unread').map((r) => r.d).filter(Boolean).sort()[0] || '').slice(0, 4);
  const o = { id:w.id, t:w.t, a:w.a, k:w.k, th:w.th, y:doneYear || first.slice(0, 4) || w.y };
  if (w.p) o.p = w.p;
  o.fd = doneYear || first; // 기록만 있는 책은 정확한 날짜 대신 연도만 공개
  books.push(o);
});
fs.writeFileSync(path.join(__dirname, '..', 'data', 'public.json'), JSON.stringify({ at:kst(Date.now()), books, posts }));
fs.writeFileSync(path.join(SRC, 'private-seed.json'), JSON.stringify({ works, seededAt:kst(Date.now()) }));

// 시험 화면용 가짜 기록(실제 내용 없음)
const sample = books.slice(0, 3);
const demo = { works:{} };
sample.forEach((b, i) => { demo.works[b.id] = { recs:[{ d:'2026-01-0' + (i + 1), r:5 - i, l:'시험용 한 줄 평', b:'시험용 기록 본문입니다.' }], notes:[{ id:i, d:'2025-12-0' + (i + 1), l:'시험 메모', b:'시험용 메모 본문입니다.', len:12 }] }; });
demo.works.demoFilm = { id:'demoFilm', t:'시험 영화', a:'', k:'film', th:['예술'], y:'2026', fd:'2026-01-01', known:true, recs:[], notes:[{ id:99, d:'2026-01-01', l:'영화 메모', b:'시험용 영화 메모입니다.', len:12 }] };
demo.works.demoUnknown = { id:'demoUnknown', t:'', a:'', k:'book', th:[], y:'2025', fd:'2025-01-01', known:false, recs:[], notes:[{ id:98, d:'2025-01-01', l:'제목을 모르는 메모', b:'시험용 메모입니다.', len:9 }] };
fs.writeFileSync(path.join(__dirname, '..', 'demo', 'private.json'), JSON.stringify(demo));

const size = (f) => (fs.statSync(f).size / 1024 | 0) + 'KB';
console.log({ works:Object.keys(works).length, publicBooks:books.length, posts:posts.length, review:posts.filter((p) => p.k === 'review').length, etc:posts.filter((p) => p.k === 'etc').length, igOnlyBooks:added, booksWithReview:reviewed.size, recBody, noteBody, noteMiss,
  publicSize:size(path.join(__dirname, '..', 'data', 'public.json')), privateSize:size(path.join(SRC, 'private-seed.json')) });
// 공개본에 비공개 칸이 없는지 검사
const pub = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'public.json'), 'utf8'));
const badKeys = pub.books.filter((b) => b.recs || b.notes || b.r != null || b.l).length;
const longLines = new Set(); Object.values(works).forEach((w) => { w.notes.forEach((n) => (n.b || '').split('\n').forEach((l) => { if (l.trim().length >= 30) longLines.add(l.trim()); })); w.recs.forEach((r) => (r.b || '').split('\n').forEach((l) => { if (l.trim().length >= 30) longLines.add(l.trim()); })); });
const pubText = JSON.stringify(pub.books);
console.log({ 비공개칸있는책:badKeys, 책정보에메모문장:[...longLines].filter((l) => pubText.includes(l)).length, 비공개문장수:longLines.size });
