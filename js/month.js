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
  const reading = [...touched].filter((w) => known(w) && !doneAt.has(w) && !doneRecs(w).length && w.st !== 'not');
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

// 효니 말투 한 달 평(효니위키 사람/효니-문체.md: 메모·인스타 감상 = 반말 평서 «~다», 말 줄임 «...», 괄호 혼잣말, «거 같다», 공개 글 웃음은 ㅎㅎ.
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
  if (VACATION.includes(cur.ym.slice(5)) && cur.doneN >= 4) names.push('방학이라 몰아 읽는 사람 ㅎㅎ');
  if (cur.doneN === 0 && cur.dayN) names.push('읽는 중인 책만 늘어난 사람(?)');
  if (!names.length) names.push(cur.doneN >= 3 ? '한 권씩 꾸준히 넘기는 사람' : cur.doneN ? '조용히 한두 권 읽은 사람' : '책을 잠깐 쉬어 간 사람');
  const name = pick(names, 'name');

  const change = [];
  if (prev) {
    const d = cur.doneN - prev.doneN;
    if (d > 0) change.push(prev.doneN ? `${pm}보다 ${d}권 더 읽었다(${prev.doneN}권 → ${cur.doneN}권).` : `${pm}엔 다 읽은 책이 없었는데 이번 달은 ${cur.doneN}권이다.`);
    else if (d < 0) change.push(cur.doneN ? `${pm}보다 ${-d}권 덜 읽었다(${prev.doneN}권 → ${cur.doneN}권). 바빴다고 해 두자...` : `${pm}엔 ${prev.doneN}권이었는데 이번 달은 다 읽은 책이 없다... 바빴다고 해 두자.`);
    else if (cur.doneN) change.push(`${pm}이랑 똑같이 ${cur.doneN}권. 이 정도면 꾸준한 거 같다 ㅎㅎ`);
  } else if (cur.doneN) change.push(`이번 달에 다 읽은 책은 ${cur.doneN}권이다.`);
  const ptop = prev && prev.themes[0];
  if (top && cur.doneN >= 2) {
    if (ptop && ptop[0] !== top[0] && prev.doneN >= 2) change.push(`${pm}엔 ${ptop[0]} 책이 제일 많았는데 이번 달은 ${josa(top[0], '으로', '로')} 넘어갔다.`);
    else if (ptop && ptop[0] === top[0] && prev.doneN >= 2) change.push(`이번 달도 ${top[0]}. 결국 손이 가는 데로 간다...`);
    else if (share >= .5) change.push(`${cur.doneN}권 중 ${top[1]}권이 ${top[0]}. 솔직히 편식이 맞다 ㅎㅎ`);
    else if (cur.themes.length >= 4) change.push(`주제만 ${cur.themes.length}개를 돌았다. 이것저것 많이도 펼쳤다(?)`);
  }
  if (cur.again.length) change.push(`다시 펼친 책도 ${cur.again.length}권 있었다. 한 번으로 안 끝나는 책이 있다.`);

  const habit = [];
  if (cur.dayN) habit.push(cur.run >= 3 && cur.run === cur.dayN ? `기록을 남긴 ${cur.dayN}일이 하루도 안 빠지고 이어져 있다. 몰아서 읽은 게 티 난다 ㅎㅎ` : cur.run >= 3 ? `기록을 남긴 날은 ${cur.dayN}일이고 그중 ${cur.run}일은 하루도 안 빼고 이어서 남겼다.` : `기록을 남긴 날은 ${cur.dayN}일. 생각날 때마다 띄엄띄엄 남겼다.`);
  const avgM = +cur.avg.toFixed(1), avgA = +(ctx.avgAll || 0).toFixed(1);
  if (cur.rated.length >= 3 && (ctx.ratedAll || 0) >= 10 && Math.round(Math.abs(avgM - avgA) * 10) >= 3) { // 4.5 - 4.2 = 0.2999…라 소수 그대로 비교하면 경계에서 빠진다(제미나이 지적 2026-11-16)
    habit.push(avgM > avgA ? `별점은 평소보다 후했다(평소 ${avgA.toFixed(1)}점 → ${avgM.toFixed(1)}점). 좋은 책만 골랐나 보다 ㅎㅎ` : `별점은 평소보다 짰다(평소 ${avgA.toFixed(1)}점 → ${avgM.toFixed(1)}점). 이번 달은 좀 아쉬운 책이 많았던 거 같다...`);
  }
  if (cur.marks) habit.push(cur.marks >= 10 ? `밑줄은 ${cur.marks}개나 그었다. 손이 바빴다.` : `밑줄은 ${cur.marks}개.`);
  else if (cur.doneN) habit.push('밑줄은 하나도 없다. 그냥 쭉 읽어 버렸나 보다(?)');
  if (cur.notes) habit.push(`메모는 ${cur.notes}개 남겼다.`);

  let next = '';
  if (cur.reading.length) {
    const w = [...cur.reading].sort((a, b) => String(title(a)).localeCompare(String(title(b)), 'ko'))[hash(seed + 'r') % cur.reading.length];
    next = cur.reading.length > 1 ? `읽다 만 «${title(w)}» 말고도 ${cur.reading.length - 1}권이 더 있다... 다음 달엔 하나라도 끝낼 수 있을까.` : `읽다 만 «${title(w)}», 다음 달엔 끝낼 수 있을까...`;
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
    if (/^\d{4}$/.test(y) && opt.today && +opt.today.slice(0, 4) - +y >= 1) { score += .5; why.push(`${y}년부터 꽂혀만 있다(?)`); }
    out.push({ it, why:why.slice(0, 2), score });
  });
  return out.sort((a, b) => b.score - a.score || String(a.it.t).localeCompare(String(b.it.t), 'ko')).slice(0, opt.max || 6);
}
