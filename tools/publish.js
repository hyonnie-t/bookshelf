// 공개 반영: 앱에서 고친 책 정보·서평 연결을 data/public.json에 넣는다. 기록·메모·별점은 절대 옮기지 않는다.
// 준비: npx.cmd firebase-tools database:get /users/<주인uid>/bookshelf --project timetable-af612 -o private.local.json
// 사용: node tools/publish.js private.local.json   → 바뀐 개수만 출력. 그 뒤 git commit·push
// 밑줄(marks): 문장 q와 쪽 p만, 공개를 끄지 않은(pub:false가 아닌) 12~160자 문장 최대 3개를 books[].qs=[[문장,쪽],...]로 옮긴다(효니 결정 2026-11-09, 기본 공개). 내 생각(why)·날짜는 옮기지 않는다. 밑줄을 그어도 책이 공개되지는 않는다
// 나만 보기(only): 켠 칸은 공개본에서 뺀다. 정한 적 없으면 책·영화가 아닌 칸은 나만 본다. js/app.js의 isOnlyMe와 같은 기준
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'data', 'public.json');
const pub = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const priv = JSON.parse(fs.readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, ''));
const books = new Map(pub.books.map((b) => [b.id, b]));
const works = priv.works || {};
const isOnlyMe = (w) => w.only === undefined ? !['book','film'].includes(w.k || 'book') : !!w.only;
let changed = 0, removed = 0, added = 0;
const QS_MAX = 3;
const tidy = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const pageNum = (p) => { const m = /\d+/.exec(p || ''); return m ? +m[0] : Infinity; };
const quotes = (w) => (w.marks || []).filter((m) => m && m.pub !== false).map((m) => [tidy(m.q), tidy(m.p)]).filter(([q]) => q.length >= 12 && q.length <= 160).sort((a, b) => pageNum(a[1]) - pageNum(b[1])).slice(0, QS_MAX).map(([q, p]) => [q, p.length <= 20 ? p : '']); // 쪽 칸에 긴 글이 있으면 쪽을 비운다(내 생각이 새지 않게)
const pick = (w) => { const prev = absorbed.has(w.id) ? {} : books.get(w.id) || {}; const o = { id:w.id, t:w.t || '', a:w.a || '', k:w.k || 'book', th:w.th || [], y:prev.y || w.y || '' }; if (w.p) o.p = w.p; o.fd = prev.fd || (w.wc ? '' : w.fd) || ''; /* 왓챠에서 온 작품은 공개본에 평가한 날을 넣지 않는다 */ const recs = w.recs || []; if ((w.k || 'book') === 'book' && !recs.some((r) => r.st !== 'unread') && (w.unread || recs.some((r) => r.st === 'unread') || (w.notes || []).some((n) => n.s === 'reading'))) o.st = 'reading'; const qs = quotes(w); if (qs.length) o.qs = qs; return o; };
const posts = new Map(pub.posts.map((p) => [p.c, p]));
Object.values(priv.igAdded || {}).forEach((p) => { if (!posts.has(p.c)) { added++; } posts.set(p.c, { c:p.c, d:p.d, x:p.x, k:p.k || 'review', w:p.w || [] }); });
Object.entries(priv.igLinks || {}).forEach(([c, l]) => { const p = posts.get(c); if (p && JSON.stringify(p.w) !== JSON.stringify(l.w || [])) { p.w = l.w || []; p.k = l.k || p.k; changed++; } });
// 앱에서 합친 책(del + into): 서평 연결은 고쳐 쓰지 않고 옮김 표(moved)만 공개한다. 그래야 앱에서 되돌린 뒤 다시 반영해도 원래대로 돌아간다
const movedTo = (id) => { let n = 0; while (works[id] && works[id].del && works[id].into && n++ < 9) id = works[id].into; return id; };
const mergedIds = Object.entries(works).filter(([, w]) => w.del && w.into).map(([id]) => id);
// 다른 책을 받아들인 책(지금, 또는 지난 반영 때)은 앱의 연도를 쓴다
const absorbed = new Set([...mergedIds.map(movedTo), ...Object.values(pub.moved || {})]);
// 공개 책을 물려받은 칸은 기록이 없어도 공개본에 남긴다. 제목이 없거나 추정인 칸은 메모에서 나온 말이라 올리지 않는다
const heirs = new Set(mergedIds.filter((id) => books.has(id)).map(movedTo));
const merged = new Set(mergedIds.map(movedTo));
const staysPublic = (id, w) => !!w.t && !w.guess && (heirs.has(id) || (merged.has(id) && books.has(id)) || (books.has(id) && (w.marks || []).length > 0)); // 이미 공개된 책은 밑줄만 저장해 비공개 칸이 생겨도 빠지지 않는다
const reviewed = new Set([...posts.values()].flatMap((p) => p.w.map(movedTo)));
const blogged = new Set((JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'blog.json'), 'utf8')).posts || []).flatMap((p) => (p.w || []).map(movedTo)));
Object.entries(works).forEach(([id, w]) => {
  w.id = id;
  const recs = w.recs || [];
  const done = ((w.k || 'book') === 'book' && w.known && !w.guess && (recs.some((r) => r.st !== 'unread') || w.st === 'done' /* 책 정보 고치기에서 «읽는 중»을 끈 책(js/app.js setReading) */)) || (w.k === 'film' && !!w.wc) /* 왓챠에서 온 본 작품은 제목·연도만 공개(효니 결정 2026-11-05) */ || (w.only === false && !!w.t && !w.guess); // 나만 보기를 직접 푼 칸
  const shelved = !books.has(id) && !(w.notes || []).length && (w.archived || []).length && !(w.marks || []).length && !recs.length && !reviewed.has(id) && !blogged.has(id); // 메모를 다 보관한 칸. js/app.js rebuild와 같은 기준
  if (w.del || isOnlyMe(w) || shelved || (!done && !(reviewed.has(id) && !!w.t && !w.guess) && !staysPublic(id, w))) { if (books.delete(id)) removed++; return; }
  const next = pick(w), prev = books.get(id);
  if (!prev) added++; else if (JSON.stringify(prev) !== JSON.stringify(next)) changed++;
  books.set(id, next);
});
// 빠진 책을 가리키는 연결은 지운다
[...posts.values()].forEach((p) => { p.w = p.w.filter((id) => books.has(movedTo(id))); if (!p.w.length && p.k === 'review') p.k = 'etc'; });
const moved = Object.fromEntries(mergedIds.filter((id) => books.has(movedTo(id))).map((id) => [id, movedTo(id)])); // 빠진 책의 공유 링크와 서평 연결용. id만 담긴다
const out = { at:new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), books:[...books.values()], posts:[...posts.values()] };
if (Object.keys(moved).length) out.moved = moved;
fs.writeFileSync(OUT, JSON.stringify(out));
const text = fs.readFileSync(OUT, 'utf8');
if (/"(recs|notes|archived|marks|q|why|r|l|b)":/.test(JSON.stringify([...books.values()]))) throw new Error('공개본에 비공개 칸이 섞였습니다');
if ([...books.values()].some((b) => (b.qs || []).length > QS_MAX || (b.qs || []).some((x) => !Array.isArray(x) || x.length !== 2 || x[0].length > 160))) throw new Error('공개 밑줄 형식이 맞지 않습니다');
console.log({ 책:books.size, 글:posts.size, 추가:added, 변경:changed, 제외:removed, 크기KB:text.length / 1024 | 0 });
