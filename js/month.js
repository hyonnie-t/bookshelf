// 이달의 돌아보기(2026-11-16, 효니 쪽지 «개인 사용 편의성을 위해 돌아보기 기능이 더 강화되면 좋겠음», «효니 문체 더 들어가야할듯»).
// 한 달 숫자·효니 말투 한 달 평·서재에서 고른 다음 책을 계산만 한다(화면은 js/app.js). 효니 책장 주인 화면에서만 쓴다(범용판·공개 화면 없음).
// 앱(js/app.js)·시험(tools/test-month.js)이 같이 쓴다. 다른 파일을 불러오지 않는다(필요한 판정은 opt로 받는다).
// 문장은 기록에서 나온 숫자·제목으로만 만든다. 기록에 없는 말(감정·이유)을 지어 넣지 않는다.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isBook = (w) => (w.k || 'book') === 'book';
const doneRecs = (w) => (w.recs || []).filter((r) => r.st !== 'unread');
const inMonth = (d, ym) => typeof d === 'string' && d.startsWith(ym + '-') && DAY.test(d);
export const monthOf = (d) => (typeof d === 'string' && /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : '');
export const prevMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
export const nextMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
export const daysIn = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

// 그 책에 남은 날짜 있는 흔적: 기록(다 읽음·미완독)·메모·밑줄. 읽을 목록·여행 같은 칸은 부르는 쪽에서 뺀다
function traces(w) {
  const out = [];
  (w.recs || []).forEach((r) => { if (DAY.test(r.d || '')) out.push({ d:r.d, kind:r.st === 'unread' ? 'unread' : 'done', r }); });
  (w.notes || []).forEach((n) => { if (DAY.test(n.d || '')) out.push({ d:n.d, kind:'note' }); });
  (w.marks || []).forEach((m) => { if (DAY.test(m.d || '')) out.push({ d:m.d, kind:'mark', m }); });
  return out;
}

// 기록이 하나라도 있는 달(책만). 오래된 달부터
export function activeMonths(works) {
  const s = new Set();
  works.filter(isBook).forEach((w) => traces(w).forEach((t) => s.add(t.d.slice(0, 7))));
  return [...s].sort();
}

// 가장 길게 이어진 날 수(하루도 안 빠지고)
function longestRun(dates) {
  const ds = [...dates].sort();
  let best = ds.length ? 1 : 0, cur = best;
  for (let i = 1; i < ds.length; i++) {
    const gap = (Date.parse(ds[i]) - Date.parse(ds[i - 1])) / 864e5;
    cur = gap === 1 ? cur + 1 : 1;
    if (cur > best) best = cur;
  }
  return best;
}

// 한 달 숫자. opt.thick(w) = 책 두께 mm(모르면 0·null), opt.known(w) = 제목 확인된 책인지
export function monthStats(works, ym, opt = {}) {
  const thick = opt.thick || (() => 0), known = opt.known || ((w) => w.known !== false);
  const books = works.filter(isBook);
  const days = new Map(); // 날짜 → [{w, kind}]
  const done = [], doneAt = new Map(), touched = new Set();
  let marks = 0, notes = 0, recs = 0;
  const rated = [], quotes = [];
  books.forEach((w) => {
    traces(w).filter((t) => inMonth(t.d, ym)).forEach((t) => {
      if (!days.has(t.d)) days.set(t.d, []);
      days.get(t.d).push({ w, kind:t.kind });
      touched.add(w);
      if (t.kind === 'mark') { marks++; const q = String(t.m.q || '').trim(); if (q.length >= 12 && q.length <= 160) quotes.push({ w, q, p:t.m.p || '', d:t.d }); }
      else if (t.kind === 'note') notes++;
      else recs++;
      if (t.kind === 'done' && known(w)) {
        if (!doneAt.has(w) || t.d < doneAt.get(w)) doneAt.set(w, t.d);
        if (t.r.r != null) rated.push({ w, r:t.r.r, d:t.d });
      }
    });
  });
  doneAt.forEach((d, w) => done.push({ w, d }));
  done.sort((a, b) => a.d.localeCompare(b.d) || String(a.w.t || '').localeCompare(String(b.w.t || ''), 'ko'));
  const tc = {};
  done.forEach(({ w }) => (w.th || []).forEach((t) => { tc[t] = (tc[t] || 0) + 1; }));
  const themes = Object.entries(tc).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
  let mm = 0, measured = 0;
  done.forEach(({ w }) => { const t = +thick(w) || 0; if (t > 0) { mm += t; measured++; } });
  // 다시 편 책: 이달에 다 읽었는데 그 전에도 다 읽은 기록이 있는 책
  const again = done.filter(({ w, d }) => doneRecs(w).some((r) => DAY.test(r.d || '') && r.d < ym + '-01'));
  // 읽는 중에 기록만 남긴 책: 이달에 흔적은 있는데 이달에 다 읽지 않았고 다 읽은 기록도 없는 책
  // 판정은 앱과 같은 js/reading.js isReading을 opt.reading으로 받는다(날짜 없이 «다 읽음»만 눌러 둔 책 st:'done'이 «읽다 만»으로 나왔다, 검토자 재현 2026-11-16)
  const isReading = opt.reading || ((w) => !doneRecs(w).length && w.st !== 'not' && w.st !== 'done');
  const reading = [...touched].filter((w) => known(w) && !doneAt.has(w) && isReading(w));
  return {
    ym, done, doneN:done.length, days, dayN:days.size, run:longestRun(days.keys()), marks, notes, recs, writes:marks + notes + recs,
    rated, avg:rated.length ? rated.reduce((a, x) => a + x.r, 0) / rated.length : 0,
    themes, mm, measured, again, reading, quotes,
  };
}

const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const hasJong = (s) => { const c = String(s).charCodeAt(String(s).length - 1) - 0xAC00; return c >= 0 && c <= 11171 && c % 28 > 0; };
const josa = (s, a, b) => s + (hasJong(s) ? a : b);
const mon = (ym) => `${+ym.slice(5)}월`;
const VACATION = ['01', '02', '07', '08'];

// 효니 말투 한 달 평(효니위키 사람/효니-문체.md: 메모·인스타 감상 = 반말 평서 «~다».2026-11-17 효니 쪽지 «ㅎㅎ 남발»로 ㅎㅎ·(?)·말줄임 맺음은 쓰지 않는다.
// 교훈 한 줄로 끊어 세우지 않고, 대구·«A가 아니라 B»·«~라는 것.» 맺음을 쓰지 않는다).
// cur·prev = monthStats 결과, ctx = { avgAll:평소 별점 평균, ratedAll:평소 별점 수, themeVoice:{주제:[별명…]}, title:(w)=>제목 }
export function monthVoice(cur, prev, ctx = {}) {
  const title = ctx.title || ((w) => w.t || '');
  const seed = cur.ym;
  const pick = (arr, tag) => arr[hash(`${seed}|${tag}`) % arr.length];
  const pm = mon(prev ? prev.ym : prevMonth(cur.ym));
  const top = cur.themes[0], share = top && cur.doneN ? top[1] / cur.doneN : 0;
  // 칭호: 맞는 조건 가운데 하나(달마다 같은 칭호)
  const names = [];
  if (cur.run >= 4) names.push('며칠씩 이어 붙여 읽는 사람');
  if (prev && prev.doneN && cur.doneN >= 4 && cur.doneN >= prev.doneN * 2) names.push('갑자기 불붙은 사람');
  if (cur.marks >= 10) names.push('밑줄 긋다 한 달 다 간 사람');
  if (cur.notes >= 8) names.push('읽고 그냥 못 넘어가는 사람');
  if (top && cur.doneN >= 3 && share >= .5 && ctx.themeVoice && ctx.themeVoice[top[0]]) names.push(pick(ctx.themeVoice[top[0]], 'noun'));
  if (VACATION.includes(cur.ym.slice(5)) && cur.doneN >= 4) names.push('방학에 몰아 읽은 사람');
  if (cur.doneN === 0 && cur.dayN) names.push('읽는 중인 책이 늘어난 사람');
  if (!names.length) names.push(cur.doneN >= 3 ? '한 권씩 꾸준히 넘기는 사람' : cur.doneN ? '조용히 한두 권 읽은 사람' : '책을 잠깐 쉬어 간 사람');
  const name = pick(names, 'name');

  const change = [];
  if (prev) {
    const d = cur.doneN - prev.doneN;
    if (d > 0) change.push(prev.doneN ? `${pm}보다 ${d}권 더 읽었다(${prev.doneN}권 → ${cur.doneN}권).` : `${pm}엔 다 읽은 책이 없었는데 이번 달은 ${cur.doneN}권이다.`);
    else if (d < 0) change.push(cur.doneN ? `${pm}보다 ${-d}권 덜 읽었다(${prev.doneN}권 → ${cur.doneN}권).` : `${pm}엔 ${prev.doneN}권이었는데 이번 달은 다 읽은 책이 없다.`);
    else if (cur.doneN) change.push(`${pm}이랑 똑같이 ${cur.doneN}권을 읽었다.`);
  } else if (cur.doneN) change.push(`이번 달에 다 읽은 책은 ${cur.doneN}권이다.`);
  const ptop = prev && prev.themes[0];
  if (top && cur.doneN >= 2) {
    if (ptop && ptop[0] !== top[0] && prev.doneN >= 2) change.push(`${pm}엔 ${ptop[0]} 책이 제일 많았는데 이번 달은 ${josa(top[0], '으로', '로')} 넘어갔다.`);
    else if (ptop && ptop[0] === top[0] && prev.doneN >= 2) change.push(`이번 달도 ${top[0]} 책이 제일 많다.`);
    else if (share >= .5) change.push(`${cur.doneN}권 중 ${top[1]}권이 ${top[0]} 책이다.`);
    else if (cur.themes.length >= 4) change.push(`${cur.themes.length}개 주제를 고루 펼쳤다.`);
  }
  if (cur.again.length) change.push(`다시 펼친 책도 ${cur.again.length}권 있었다. 한 번으로 안 끝나는 책이 있다.`);

  const habit = [];
  if (cur.dayN) habit.push(cur.run >= 3 && cur.run === cur.dayN ? `기록을 남긴 ${cur.dayN}일이 하루도 안 빠지고 이어져 있다.` : cur.run >= 3 ? `기록을 남긴 날은 ${cur.dayN}일이고 그중 ${cur.run}일은 하루도 안 빼고 이어서 남겼다.` : `기록을 남긴 날은 ${cur.dayN}일. 생각날 때마다 띄엄띄엄 남겼다.`);
  const avgM = +cur.avg.toFixed(1), avgA = +(ctx.avgAll || 0).toFixed(1);
  if (cur.rated.length >= 3 && (ctx.ratedAll || 0) >= 10 && Math.round(Math.abs(avgM - avgA) * 10) >= 3) { // 4.5 - 4.2 = 0.2999…라 소수 그대로 비교하면 경계에서 빠진다(제미나이 지적 2026-11-16)
    habit.push(avgM > avgA ? `별점은 평소보다 후했다(평소 ${avgA.toFixed(1)}점 → ${avgM.toFixed(1)}점).` : `별점은 평소보다 짰다(평소 ${avgA.toFixed(1)}점 → ${avgM.toFixed(1)}점).`);
  }
  if (cur.marks) habit.push(cur.marks >= 10 ? `밑줄은 ${cur.marks}개나 그었다. 손이 바빴다.` : `밑줄은 ${cur.marks}개.`);
  else if (cur.doneN) habit.push('밑줄은 하나도 없다.');
  if (cur.notes) habit.push(`메모는 ${cur.notes}개 남겼다.`);

  let next = '';
  if (cur.reading.length) {
    const w = [...cur.reading].sort((a, b) => String(title(a)).localeCompare(String(title(b)), 'ko'))[hash(seed + 'r') % cur.reading.length];
    next = cur.reading.length > 1 ? `읽다 만 책은 «${title(w)}» 말고도 ${cur.reading.length - 1}권이 더 있다.` : `읽다 만 책은 «${title(w)}» 한 권이다.`;
  }
  const quote = cur.quotes.length ? cur.quotes[hash(seed + 'q') % cur.quotes.length] : null;
  return { name, change, habit, next, quote };
}

// 서재에서 고른 다음 책: 소장했는데 아직 다 읽지 않은 책 가운데 요즘 취향과 이어지는 책.
// lib = 서재 책 [{id,t,a,th,st,w,added}], works = 읽은 책들, opt = { firstAuthor, seriesKey, done:(w)=>다 읽었는지, work:(id)=>이어진 읽은 책, since:'YYYY-MM-DD' 요즘의 시작, today }
export function nextBooks(lib, works, opt) {
  const fa = opt.firstAuthor, sk = opt.seriesKey, isDone = opt.done, workOf = opt.work || (() => null);
  const readBooks = works.filter((w) => isBook(w) && isDone(w));
  const recent = readBooks.filter((w) => doneRecs(w).some((r) => (r.d || '') >= opt.since));
  const tc = {};
  recent.forEach((w) => (w.th || []).forEach((t) => { tc[t] = (tc[t] || 0) + 1; }));
  const topThemes = Object.entries(tc).sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, n]) => n >= 2).map(([t]) => t);
  const byAuthor = new Map();
  readBooks.forEach((w) => { const a = fa(w.a); if (!a) return; if (!byAuthor.has(a)) byAuthor.set(a, []); byAuthor.get(a).push(w); });
  const norm = (s) => String(s || '').replace(/[\s\p{P}\p{S}]/gu, '');
  const vols = new Map(); // 시리즈 이름 → 읽은 권 번호들
  readBooks.forEach((w) => { const k = sk(w.t); if (k && k.vol) { const h = norm(k.head); if (!vols.has(h)) vols.set(h, { head:k.head, v:[] }); vols.get(h).v.push(k.vol); } });
  const out = [];
  lib.filter((it) => it.st === 'own' && it.t).forEach((it) => {
    const w = it.w ? workOf(it.w) : null;
    if (w && isDone(w)) return;
    const why = [];
    let score = 0;
    const k = sk(it.t), s = k && vols.get(norm(k.head));
    if (s && k.vol === Math.max(...s.v) + 1) { score += 5; why.push(`«${s.head}» ${Math.max(...s.v)}권까지 읽었다. 이게 다음 권이다`); }
    const a = fa(it.a), mine = a && byAuthor.get(a);
    if (mine) {
      const rs = mine.flatMap((x) => doneRecs(x).filter((r) => r.r != null).map((r) => r.r));
      const m = rs.length ? rs.reduce((x, y) => x + y, 0) / rs.length : 0;
      if (rs.length && m >= 4) { score += 3; why.push(`${a} 책은 ${mine.length}권 읽었고 평균 ${m.toFixed(1)}점을 줬다`); }
      else if (mine.length >= 2) { score += 2; why.push(`${a} 책을 벌써 ${mine.length}권 읽었다`); }
      else { score += 1; why.push(`${a}의 다른 책을 읽은 적이 있다`); }
    }
    const t = (it.th || []).find((x) => topThemes.includes(x));
    if (t) { score += 1.5; why.push(`요즘 자주 읽는 ${t} 칸`); }
    if (w && (w.recs || []).some((r) => r.st === 'unread')) { score += 1; why.push('읽다 멈춘 책이다'); }
    if (!score) return;
    const y = String(it.added || '').slice(0, 4);
    if (/^\d{4}$/.test(y) && opt.today && +opt.today.slice(0, 4) - +y >= 1) { score += .5; why.push(`${y}년부터 서재에 꽂혀 있다`); }
    out.push({ it, why:why.slice(0, 2), score });
  });
  return out.sort((a, b) => b.score - a.score || String(a.it.t).localeCompare(String(b.it.t), 'ko')).slice(0, opt.max || 6);
}

// 그달 내 물음표(2026-11-16, 효니 말 «그달의 내 물음이 문장이 어색해» → 이름은 효니가 고름, 기본 «이달에 남긴 물음표»).
// 그달 날짜가 붙은 메모 본문(notes[].b)·밑줄의 내 생각(marks[].why)·기록 본문(recs[].b)에서 «?»로 끝나는 효니 문장만 모은다.
// 책 문장(marks[].q)은 넣지 않고, AI가 질문을 짓지 않는다. 맨 앞은 달마다 같은 하나(hash), 나머지는 «다른 물음표»로 넘긴다.
const Q_END = /[?？]+["'”’)\]」』〉》]*$/;
const Q_LEAD = /^[\s\-–—·•*>#📌👉🔖📖✔💕👀]+/u;
export function questionsIn(text) {
  const out = [];
  String(text || '').split(/\n+/).forEach((line) => {
    line.split(/(?<=[.!?？…。]["'”’)\]」』〉》]*)\s+/).forEach((raw) => { // 닫는 따옴표·괄호까지 붙여 자른다(«"정말일까?" 그래서» 놓침, 제미나이 지적 2026-11-16)
      const s = raw.replace(Q_LEAD, '').trim();
      if (!Q_END.test(s) || s.length < 6 || s.length > 140) return;
      if (/[(（][?？]+[)）]$/.test(s)) return; // «모르겠다(?)»는 효니 혼잣말 버릇이지 물음이 아니다
      if (/https?:\/\//.test(s)) return; // 주소 끝의 «?»는 물음이 아니다(검토자 지적)
      if (!/[가-힣]/.test(s.replace(/#\S+/g, ''))) return; // 해시태그·영어만 있는 줄은 뺀다
      out.push(s);
    });
  });
  return out;
}
// opt.known(w) = 제목 확인된 책인지(앱의 w.known). 책만, 날짜가 그달인 글만
export function monthQuestions(works, ym, opt = {}) {
  const known = opt.known || ((w) => w.known !== false);
  const out = [], seen = new Set();
  const add = (w, d, text, src) => questionsIn(text).forEach((q) => { const k = q.replace(/\s+/g, ''); if (seen.has(k)) return; seen.add(k); out.push({ w, d, q, src }); });
  works.filter((w) => isBook(w) && known(w)).forEach((w) => {
    (w.notes || []).forEach((n) => { if (inMonth(n.d, ym)) add(w, n.d, n.b, 'note'); });
    (w.marks || []).forEach((m) => { if (inMonth(m.d, ym)) add(w, m.d, m.why, 'mark'); });
    (w.recs || []).forEach((r) => { if (inMonth(r.d, ym)) add(w, r.d, r.b, 'rec'); });
  });
  out.sort((a, b) => a.d.localeCompare(b.d) || a.q.localeCompare(b.q, 'ko'));
  const start = out.length ? hash(ym + '?') % out.length : 0;
  return [...out.slice(start), ...out.slice(0, start)]; // 맨 앞이 그달의 하나
}

// 연말 결산(2026-11-16, 효니 «1,2,3 다 해도 될 거 같은데»). 이번 달 결산 카드의 1년판.
// books = 그해 다 읽은 책(앱의 readYear === y와 같은 묶음: 처음 다 읽은 해), all = 모든 기록(다시 편 책·밑줄을 센다)
// opt = { firstAuthor(a), thick(w), only(w): 나만 보기인지(제목 목록에서만 뺀다, 숫자는 센다) }
export function yearStats(books, all, y, opt = {}) {
  const fa = opt.firstAuthor || ((a) => String(a || '').split(/[,·]/)[0].trim());
  const thick = opt.thick || (() => 0), only = opt.only || (() => false);
  const bs = books.filter(isBook);
  const inY = (d) => typeof d === 'string' && d.startsWith(y);
  const byTitle = (a, b) => String(a.t || '').localeCompare(String(b.t || ''), 'ko');
  // 별점: 그해 기록의 가장 높은 점수(그해 별점이 없으면 다른 해 기록)
  const rateOf = (w) => { const rs = doneRecs(w).filter((r) => r.r != null); const iy = rs.filter((r) => inY(r.d)); const use = iy.length ? iy : rs; return use.length ? Math.max(...use.map((r) => r.r)) : null; };
  const rated = bs.map((w) => ({ w, r:rateOf(w) })).filter((x) => x.r != null);
  const best = rated.length ? Math.max(...rated.map((x) => x.r)) : null;
  const top = best == null ? [] : rated.filter((x) => x.r === best).map((x) => x.w).sort(byTitle);
  const ac = new Map();
  bs.forEach((w) => { const a = fa(w.a); if (a) ac.set(a, (ac.get(a) || 0) + 1); });
  const authors = [...ac].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')).slice(0, 3);
  const tc = {};
  bs.forEach((w) => (w.th || []).forEach((t) => { tc[t] = (tc[t] || 0) + 1; }));
  const themes = Object.entries(tc).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')).slice(0, 3);
  // 다시 편 책: 그해에 다 읽은 기록이 있고 그 전 해에도 다 읽은 기록이 있는 책(처음 읽은 해가 아니라 «완독한 책» 수에는 안 든다)
  const known = opt.known || ((w) => w.known !== false);
  const allBooks = all.filter(isBook);
  // 제목 미확인 책은 막대·완독 수처럼 뺀다(검토자 지적)
  const again = allBooks.filter(known).filter((w) => { const ds = doneRecs(w).map((r) => r.d || '').filter((d) => /^\d{4}/.test(d)); return ds.some(inY) && ds.some((d) => d.slice(0, 4) < y); }).sort(byTitle);
  let marks = 0;
  allBooks.forEach((w) => (w.marks || []).forEach((m) => { if (inY(m.d)) marks++; }));
  const mc = {};
  bs.forEach((w) => { const d = doneRecs(w).map((r) => r.d).filter((x) => DAY.test(x || '') && inY(x)).sort()[0]; if (d) mc[d.slice(5, 7)] = (mc[d.slice(5, 7)] || 0) + 1; });
  const bestM = Object.entries(mc).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;
  let mm = 0, measured = 0;
  bs.forEach((w) => { const t = +thick(w) || 0; if (t > 0) { mm += t; measured++; } });
  return { y, books:bs, doneN:bs.length, best, top, authors, themes, again, marks, bestM, mm, measured, shownTop:top.filter((w) => !only(w)), shownAgain:again.filter((w) => !only(w)) };
}

// 연말 결산 말투: 효니 인스타 «추천·결산» 갈래(효니위키 사람/효니-문체.md 표: 존댓말 «~요/~습니다», 📌·👉 목록. 2026-11-17부터 ㅎㅎ·덧붙이는 농담은 뺀다.
// 대표 글 «9월 #독서결산 / 완독한 책 11권 👏 / 📌 #책 / 저자»). 책 제목은 나만 보기를 뺀 목록(shownTop·shownAgain)만 쓴다(화면·그림 같은 문장).
// cur·prev = yearStats 결과(prev 없으면 비교 안 함), ctx.title(w)
export function yearVoice(cur, prev, ctx = {}) {
  const title = ctx.title || ((w) => w.t || '');
  const pick = (arr, tag) => arr[hash(`${cur.y}|${tag}`) % arr.length];
  const head = `${cur.y}년 #독서결산`;
  const big = cur.doneN ? `완독한 책 ${cur.doneN}권 👏` : '완독한 책은 아직 없어요';
  const list = (ws, n) => { const xs = ws.slice(0, n).map((w) => `«${title(w)}»`); return ws.length > n ? `${xs.join(', ')} 외 ${ws.length - n}권` : xs.join(', '); };
  const items = [];
  if (cur.shownTop.length && cur.best >= 4) { // 낮은 별점뿐인 해에 «제일 좋았던 책»이라 하지 않는다(검토자 지적)
    const many = cur.shownTop.length > 1;
    items.push(['가장 높게 준 책', `${list(cur.shownTop, 3)}. ${pick(many ? ['올해 제일 좋았던 책들이에요', '두고두고 추천하고 싶은 책들이에요'] : ['올해 제일 좋았던 책이에요', '두고두고 추천하고 싶은 책이에요'], 'top')}`]);
  }
  if (cur.authors.length) {
    const [a, n] = cur.authors[0];
    items.push(['많이 읽은 저자', `${a} 작가님 책을 ${n}권이나 읽었어요${cur.authors.length > 1 ? ` (${cur.authors.slice(1).map(([x, k]) => `${x} ${k}권`).join(', ')}도요)` : ''}`]);
  }
  if (cur.themes.length) {
    const [t, n] = cur.themes[0];
    const rest = cur.themes.slice(1).map(([x, k]) => `${x} ${k}권`).join(', ');
    items.push(['많이 읽은 주제', `${t} ${n}권${rest ? `, ${rest}` : ''}. ${cur.doneN && n / cur.doneN >= .4 ? '가장 자주 손이 간 주제예요' : '여러 주제를 골고루 읽었어요'}`]);
  }
  if (cur.again.length) {
    const hid = cur.again.length - cur.shownAgain.length;
    items.push(['다시 만난 책', `${cur.shownAgain.length ? list(cur.shownAgain, 2) + (hid ? ` 말고도 ${hid}권 더` : '') : `${cur.again.length}권`}. 두 번 이상 읽었어요`]);
  }
  const more = [];
  // 아직 안 끝난 해(ctx.ongoing)는 덜 읽었다고 하지 않는다(앱 성향 문장도 올해는 지난해와 견주지 않는다)
  if (prev && prev.doneN && cur.doneN && ctx.ongoing) { const d = cur.doneN - prev.doneN; more.push(d >= 0 ? `벌써 ${+cur.y - 1}년보다 ${d ? `${d}권 더` : '많이'} 읽었어요 👏` : `${+cur.y - 1}년엔 ${prev.doneN}권이었어요. 아직 남은 날이 있어요`); }
  else if (prev && prev.doneN && cur.doneN) { const d = cur.doneN - prev.doneN; more.push(d > 0 ? `${+cur.y - 1}년보다 ${d}권 더 읽었어요 👏` : d < 0 ? `${+cur.y - 1}년보다 ${-d}권 덜 읽었어요` : `${+cur.y - 1}년이랑 똑같이 ${cur.doneN}권이에요`); }
  if (cur.bestM && cur.bestM[1] >= 2) more.push(['01', '02', '07', '08'].includes(cur.bestM[0]) ? `${+cur.bestM[0]}월에 제일 많이 읽었어요(${cur.bestM[1]}권). 방학 때 많이 읽었어요` : `${+cur.bestM[0]}월에 제일 많이 읽었어요(${cur.bestM[1]}권)`);
  if (cur.marks) more.push(`밑줄은 ${cur.marks}개 그었습니다 ✍`);
  return { head, big, items, more };
}
