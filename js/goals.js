// 다음 달 독서 목표(2026-11-24, 효니 쪽지 «다음 달 독서 목표 제안 … 기존에 내가 독서 빙고에서 했던 것들 … 기존 독서기록을 바탕으로 빈틈을 제공하거나
// 새로운 독서목표를 통한 리프레시 및 동기부여 제공이 목적»). 독서 빙고(2023 3분기: 과학·철학·고전·만화·경제·한국 여성 작가…)처럼 한 달에 해 볼 일을 고른다.
// 계산만 한다(화면은 js/app.js goalsCard). 앱·시험(tools/test-goals.js)이 같이 쓰고 다른 파일을 불러오지 않는다(판정은 ctx로 받는다).
// 목표마다 «왜 이 목표인지»를 효니 기록의 숫자로만 쓴다. AI를 부르지 않는다. 주인 화면만(공개 화면 없음). 범용판도 쓴다(2026-11-24, 서평 글이 없어 서평 목표는 후보에 안 나옴).
//
// ctx = {
//   works: 읽은 책 목록(책·영화 모두 와도 됨, 여기서 책만 고름), lib: 서재 책 [{id,t,st,added,loans,w}],
//   posts: 인스타 서평 [{d,k}], today:'YYYY-MM-DD',
//   known(w): 제목 확인된 책인지, reading(w): 읽는 중인지(js/reading.js isReading), firstAuthor(a): 첫 저자(js/kdc.js),
//   libWork(it): 서재 책이 이어진 읽은 책 id(합쳐서 빠진 책은 남긴 책으로 따라간 값)
// }

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isBook = (w) => (w.k || 'book') === 'book';
const doneRecs = (w) => (w.recs || []).filter((r) => r.st !== 'unread' && DAY.test(r.d || ''));
const inMonth = (d, ym) => typeof d === 'string' && d.startsWith(ym + '-') && DAY.test(d);
const ymOf = (d) => String(d || '').slice(0, 7);
const addMonths = (ym, k) => { const [y, m] = ym.split('-').map(Number); const t = y * 12 + (m - 1) + k; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`; };
const monthsBetween = (a, b) => { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };
const monLabel = (ym) => `${+ym.slice(0, 4)}년 ${+ym.slice(5)}월`;
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// 문학 칸. 이 칸이 하나도 없고 주제가 붙은 책을 비문학으로 친다(주제 없는 책은 모름이라 안 셈)
export const FICTION = ['소설', 'SF·판타지', '시', '청소년·그림책'];
export const isNonfic = (w) => (w.th || []).length > 0 && !(w.th || []).some((t) => FICTION.includes(t));

// 그림 배지가 있는 목표(2026-11-20 힉스필드로 만든 세 장, icons/goals/). 나머지는 이모지 배지
export const BADGE_IMG = { nonfic:'icons/goals/nonfic.png', library:'icons/goals/library.png', pile:'icons/goals/pile.png' };
const EMOJI = { theme:'🔖', newAuthor:'✨', reread:'🔁', finish:'🏁', review:'✍️', marks:'🖍️', count:'📚' };

// 저장 키 → 목표 뜻. 'th:역사', 'count:4'처럼 값이 붙는 목표가 있다
export function parseGoal(key) {
  const [k, v] = String(key).split(':');
  if (k === 'th' && v) return { k:'theme', theme:v, need:1 };
  if (k === 'count' && +v > 0) return { k:'count', need:+v };
  if (k === 'marks') return { k, need:5 };
  if (['nonfic', 'library', 'pile', 'newAuthor', 'reread', 'finish', 'review'].includes(k)) return { k, need:1 };
  return null;
}
export function goalLabel(key) {
  const g = parseGoal(key);
  if (!g) return '';
  return {
    nonfic:'비문학 1권 읽기', library:'도서관에서 책 빌려 오기', pile:'쌓인 책 한 권 읽기', theme:`오랜만에 ${g.theme} 책 한 권`,
    newAuthor:'처음 만나는 작가 책 읽기', reread:'아끼는 책 다시 펼치기', finish:'읽다 멈춘 책 끝내기', review:'서평 한 편 올리기',
    marks:'밑줄 5개 남기기', count:`${g.need}권 다 읽기`,
  }[g.k];
}
export const goalBadge = (key) => { const g = parseGoal(key); return g ? { img:BADGE_IMG[g.k] || '', emoji:EMOJI[g.k] || '' } : { img:'', emoji:'' }; };

// 책이 처음 다 읽힌 날(이번 달 안)
function firstDoneIn(w, ym) { const ds = doneRecs(w).map((r) => r.d).filter((d) => inMonth(d, ym)).sort(); return ds[0] || ''; }
// 이달에 다 읽은 책(제목 확인된 책만, 다시 읽은 책도 한 번)
function doneIn(ctx, ym) { const known = ctx.known || ((w) => w.known !== false); return ctx.works.filter((w) => isBook(w) && known(w) && firstDoneIn(w, ym)); }
// 이 서재 책이 이어진 읽은 책 id
const linkOf = (ctx, it) => (ctx.libWork ? ctx.libWork(it) : it.w) || '';
// 빌려 온 날짜들(서재에 «빌려 온 책»으로 넣은 날과 빌려 온 기록)
function borrowDates(ctx) {
  const out = [];
  (ctx.lib || []).forEach((it) => {
    (it.loans || []).forEach((l) => { if (l.dir === 'in' && DAY.test(l.d || '')) out.push(l.d); });
    if (it.st === 'in' && DAY.test(it.added || '') && !(it.loans || []).some((l) => l.dir === 'in' && l.d === it.added)) out.push(it.added);
  });
  return out.sort();
}
// 소장했는데 오늘까지 안 읽은 책(쌓인 책)
function pileBooks(ctx) {
  const byId = new Map(ctx.works.map((w) => [w.id, w])), t = ctx.today || '9999';
  return (ctx.lib || []).filter((it) => {
    if (it.st !== 'own') return false;
    const w = byId.get(linkOf(ctx, it));
    return !w || !readBefore(w, t + '~') && w.st !== 'done';
  });
}
// before 전에 다 읽은 기록이 있나. 연도만 적힌 날('2023')·날짜 없는 기록도 예전에 읽은 것으로 친다(검토자 지적 2026-11-24)
const readBefore = (w, before) => (w.recs || []).some((r) => r.st !== 'unread' && String(r.d || '') < before);
// 지금까지 읽은 첫 저자들(before 날짜 전에 다 읽은 책만)
function authorsBefore(ctx, before) {
  const fa = ctx.firstAuthor || ((a) => String(a || '').split(',')[0].trim());
  const s = new Set();
  ctx.works.filter(isBook).forEach((w) => { if (readBefore(w, before)) { const a = fa(w.a); if (a) s.add(a); } });
  return s;
}
const bestRating = (w) => Math.max(-1, ...doneRecs(w).filter((r) => r.r != null).map((r) => r.r));

// 그달 목표가 얼마나 됐나: { n, need, done, hits:[제목 또는 책] }
export function goalProgress(key, ctx, ym) {
  const g = parseGoal(key);
  if (!g) return null;
  const start = ym + '-01';
  const done = doneIn(ctx, ym);
  let hits = [];
  if (g.k === 'nonfic') hits = done.filter(isNonfic);
  else if (g.k === 'theme') hits = done.filter((w) => (w.th || []).includes(g.theme));
  else if (g.k === 'count') hits = done;
  else if (g.k === 'pile') {
    const piled = new Set((ctx.lib || []).filter((it) => it.st === 'own' && !(DAY.test(it.added || '') && it.added >= start)).map((it) => linkOf(ctx, it)).filter(Boolean));
    hits = done.filter((w) => piled.has(w.id));
  } else if (g.k === 'newAuthor') {
    const seen = authorsBefore(ctx, start), fa = ctx.firstAuthor || ((a) => String(a || '').split(',')[0].trim());
    hits = done.filter((w) => { const a = fa(w.a); return a && !seen.has(a); });
  } else if (g.k === 'reread') hits = done.filter((w) => doneRecs(w).some((r) => r.d < start));
  else if (g.k === 'finish') hits = done.filter((w) => (w.recs || []).some((r) => r.st === 'unread' && DAY.test(r.d || '') && r.d < start) || (w.notes || []).some((n) => n.s === 'reading' && DAY.test(n.d || '') && n.d < start));
  else if (g.k === 'library') hits = (ctx.lib || []).filter((it) => (it.loans || []).some((l) => l.dir === 'in' && inMonth(l.d, ym)) || it.st === 'in' && inMonth(it.added, ym));
  else if (g.k === 'review') hits = (ctx.posts || []).filter((p) => p.k === 'review' && !p.blog && inMonth(p.d, ym));
  else if (g.k === 'marks') hits = ctx.works.filter(isBook).flatMap((w) => (w.marks || []).filter((m) => inMonth(m.d, ym)).map(() => w));
  const n = hits.length;
  return { n, need:g.need, done:n >= g.need, hits };
}

// 다음 달(ym)에 해 볼 목표 후보. 점수가 높을수록 지금 기록에 빈틈이 큰 목표. [{key, label, why, score}]
export function goalCandidates(ctx, ym) {
  const t = ctx.today, nowYm = ymOf(t);
  const since3 = addMonths(nowYm, -3) + '-01', since6 = addMonths(nowYm, -6) + '-01';
  const known = ctx.known || ((w) => w.known !== false);
  const books = ctx.works.filter((w) => isBook(w) && known(w));
  const lastDone = (w) => doneRecs(w).map((r) => r.d).filter((d) => d <= t).sort().pop() || ''; // 오늘 뒤 날짜(잘못 적은 날)는 안 본다
  const recent3 = books.filter((w) => doneRecs(w).some((r) => r.d >= since3 && r.d <= t));
  const out = [];
  const add = (key, score, why) => out.push({ key, label:goalLabel(key), why, score });

  // 비문학: 지난 석 달 다 읽은 책 가운데 비문학 비중
  const nf = recent3.filter(isNonfic).length;
  if (recent3.length) add('nonfic', nf === 0 ? 3 : nf / recent3.length < .3 ? 2 : .6, nf === 0 ? `지난 석 달 다 읽은 ${recent3.length}권이 다 문학이다` : `지난 석 달 다 읽은 ${recent3.length}권 중 비문학은 ${nf}권`);
  else add('nonfic', 1, '지난 석 달 다 읽은 책이 없다. 가볍게 한 권부터');

  // 도서관: 마지막으로 빌려 온 때
  const bd = borrowDates(ctx).filter((d) => d <= t), lastB = bd[bd.length - 1];
  if (!lastB) add('library', 1.2, '서재에 빌려 온 기록이 아직 없다');
  else { const gap = monthsBetween(ymOf(lastB), nowYm); add('library', gap >= 3 ? 2.5 : gap >= 1 ? 1.2 : .4, gap >= 1 ? `마지막으로 빌려 온 건 ${monLabel(ymOf(lastB))}` : '이번 달에도 빌려 왔다. 다음 달도 이어서'); }

  // 쌓인 책
  const pile = pileBooks(ctx);
  if (pile.length) add('pile', pile.length >= 20 ? 2.6 : pile.length >= 5 ? 2 : 1, `서재에 아직 안 읽은 책이 ${pile.length}권 꽂혀 있다`);

  // 오랜만의 주제: 지금까지 3권 이상 읽었는데 반년 동안 한 권도 안 읽은 주제(많이 읽은 순 두 개)
  const tc = {}, tLast = {};
  books.forEach((w) => { const d = lastDone(w); if (!d) return; (w.th || []).forEach((x) => { tc[x] = (tc[x] || 0) + 1; if (!tLast[x] || d > tLast[x]) tLast[x] = d; }); });
  Object.entries(tc).filter(([x, n]) => n >= 3 && tLast[x] < since6 && x !== '기타').sort((a, b) => b[1] - a[1]).slice(0, 2)
    .forEach(([x, n], i) => add(`th:${x}`, 2.2 - i * .3, `${x} 책을 ${n}권 읽었는데 마지막이 ${monLabel(ymOf(tLast[x]))}`));

  // 처음 만나는 작가: 지난 석 달 읽은 책이 아는 작가 책이었던 비중
  if (recent3.length >= 3) {
    const fa = ctx.firstAuthor || ((a) => String(a || '').split(',')[0].trim());
    const seen = authorsBefore(ctx, since3);
    const again = recent3.filter((w) => { const a = fa(w.a); return a && seen.has(a); }).length;
    add('newAuthor', again / recent3.length >= .5 ? 1.8 : .7, `지난 석 달 ${recent3.length}권 중 ${again}권이 전에 읽은 작가 책`);
  }

  // 다시 펼치기: 4.5점 이상, 한 번 읽음, 3년 넘음
  const cut3y = `${+t.slice(0, 4) - 3}${t.slice(4)}`;
  const loved = books.filter((w) => bestRating(w) >= 4.5 && new Set(doneRecs(w).map((r) => r.d)).size === 1 && lastDone(w) && lastDone(w) < cut3y); // lastDone이 빈 값(오늘 뒤 날짜만 있는 책)이면 빼기(검토자 지적)

  if (loved.length) add('reread', 1.3, `4.5점 이상 줬는데 3년 넘게 안 편 책이 ${loved.length}권`);

  // 읽다 멈춘 책: 읽는 중인데 두 달 넘게 기록이 없는 책(지금 읽고 있는 책은 «멈춘» 책이 아니다, 검토자 지적)
  const cut2m = addMonths(nowYm, -2) + t.slice(7);
  const lastTrace = (w) => [...(w.recs || []), ...(w.notes || []), ...(w.marks || [])].map((x) => x.d).filter((d) => DAY.test(d || '') && d <= t).sort().pop() || '';
  const stalled = ctx.reading ? ctx.works.filter((w) => isBook(w) && known(w) && ctx.reading(w) && lastTrace(w) < cut2m) : [];
  if (stalled.length) add('finish', stalled.length >= 3 ? 2 : 1.4, `두 달 넘게 손 안 댄 읽는 중인 책이 ${stalled.length}권`);

  // 서평: 마지막 서평 글
  const rp = (ctx.posts || []).filter((p) => p.k === 'review' && !p.blog && DAY.test(p.d || '') && p.d <= t).map((p) => p.d).sort();
  if (rp.length) { const gap = monthsBetween(ymOf(rp[rp.length - 1]), nowYm); add('review', gap >= 2 ? 2 : gap >= 1 ? 1 : .3, gap >= 1 ? `마지막 서평이 ${monLabel(ymOf(rp[rp.length - 1]))}` : '이번 달에도 서평을 올렸다'); }

  // 밑줄: 지난 석 달 밑줄 수
  const mk = books.reduce((a, w) => a + (w.marks || []).filter((m) => DAY.test(m.d || '') && m.d >= since3).length, 0);
  add('marks', mk < 5 ? 1.5 : .3, mk ? `지난 석 달 밑줄이 ${mk}개` : '지난 석 달 남긴 밑줄이 없다');

  // 권수: 지난 석 달 평균보다 한 권 더(최소 2권)
  const avg = recent3.length / 3, need = Math.max(2, Math.ceil(avg) + (Math.ceil(avg) === avg ? 1 : 0));
  add(`count:${need}`, 1, `지난 석 달 평균 ${avg.toFixed(1)}권. 한 권만 더`);

  // 같은 점수는 달마다 다르게(같은 달이면 늘 같은 순서)
  return out.sort((a, b) => b.score - a.score || hash(ym + a.key) - hash(ym + b.key));
}

// 보여 줄 세 개: 점수 순으로 고르되 주제 목표는 하나만. shift(«다른 목표 보기»)만큼 뒤에서 고른다
export function pickGoals(cands, shift = 0, n = 3) {
  if (!cands.length) return [];
  const seq = [];
  let themeUsed = false;
  const pool = cands.slice(shift * n).concat(cands.slice(0, shift * n));
  for (const c of pool) {
    if (seq.length >= n) break;
    if (c.key.startsWith('th:')) { if (themeUsed) continue; themeUsed = true; }
    seq.push(c);
  }
  return seq;
}

// 한 달 결과 한 줄(효니 말투: 반말 평서, 숫자 조건으로만)
export function goalLine(results, ym) {
  if (!results.length) return '';
  const k = results.filter((r) => r.done).length, m = `${+ym.slice(5)}월`;
  if (k === results.length) return `${m} 목표 ${k}개를 다 이뤘다.`;
  if (!k) return `${m} 목표는 아직 하나도 못 채웠다.`;
  const left = results.filter((r) => !r.done).map((r) => `«${r.label}»`);
  return `${m} 목표 ${results.length}개 중 ${k}개를 이뤘다. 남은 건 ${left.join(', ')}.`;
}
export { addMonths };
