// 제목 미확인 책의 «혹시 이 책?» 후보. 메모의 드문 낱말, 같은 무렵의 인스타 글에 적힌 책을 단서로 삼는다.
// 앱(js/app.js)과 후보표 도구(tools/guess-table.js)가 같이 쓴다. 다른 파일을 불러오지 않는다.
export const SQ = (s) => (s || '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
const TAIL = /(은|는|이|가|을|를|에|의|도|로|와|과|만|께|서|며|고|라|인|에서|에게|으로|이다|이라|입니다|했다|한다|하는|하고|하며|처럼|까지|부터|보다|이나|에는|에도|라는|이라는)$/;
const texts = (w) => [...(w.notes || []).filter((n) => n.s !== 'want').map((n) => n.b || n.l || ''), ...(w.recs || []).map((r) => `${r.l || ''} ${r.b || ''}`)].join('\n');
const tokens = (s) => {
  const out = new Set();
  String(s || '').replace(/https?:\S+/g, ' ').replace(/[가-힣]{2,}|[A-Za-z]{3,}/g, (m) => {
    let t = m;
    if (/[가-힣]/.test(t) && t.length >= 3) { const c = t.replace(TAIL, ''); if (c.length >= 2) t = c; }
    out.add(t.toLowerCase());
  });
  return out;
};
export const hasText = (w) => texts(w).trim().length > 0;
// works: 모든 책 칸(제목 미확인 포함). 다른 책에도 자주 나오는 낱말은 빼고 드문 낱말을 앞에 둔다
export function wordStats(works) {
  const df = new Map();
  works.forEach((w) => tokens(texts(w)).forEach((t) => df.set(t, (df.get(t) || 0) + 1)));
  return { df, n: works.length };
}
export function rareWords(w, stats, limit = 4) {
  const cap = Math.max(3, stats.n * .04);
  return [...tokens(texts(w))].map((t) => [t, stats.df.get(t) || 1]).filter(([t, c]) => c <= cap && t.length >= 2)
    .sort((a, b) => a[1] - b[1] || b[0].length - a[0].length).slice(0, limit).map(([t]) => t);
}
const dayNum = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? Math.round(Date.parse(d) / 864e5) : null);
// 같은 무렵 인스타 글에 적힌 책: shelf = [{id,t,a,p}] 제목이 확인된 책들
export function nearbyBooks(w, posts, shelf, days = 10) {
  const me = dayNum(w.fd);
  if (me == null) return [];
  const found = new Map();
  posts.forEach((p) => {
    const d = dayNum(p.d);
    if (d == null || Math.abs(d - me) > days) return;
    const hay = SQ(p.x || '');
    shelf.forEach((b) => {
      const t = SQ(b.t);
      if (t.length < 3 || b.id === w.id || !hay.includes(t)) return;
      const gap = Math.abs(d - me), old = found.get(b.id);
      if (!old || gap < old.gap) found.set(b.id, { id:b.id, t:b.t, a:b.a || '', p:b.p || '', gap, post:p.d });
    });
  });
  return [...found.values()].sort((x, y) => x.gap - y.gap);
}
// 카카오 검색 결과(row: {t,a,p,y})가 낱말을 얼마나 담는지. 출간 연도가 메모 연도보다 늦으면 0
export function scoreRow(row, words, w) {
  const hay = SQ(`${row.t} ${row.a}`);
  const hits = words.filter((x) => hay.includes(SQ(x)));
  const late = row.y && w.fd && +row.y > +String(w.fd).slice(0, 4);
  return late ? 0 : hits.length;
}
// 검색에 보낼 말: 저자가 있으면 저자(C), 추정 제목이 있으면 그 제목(D), 메모의 드문 낱말 둘을 함께와 하나씩(B). 최대 6번
export function queriesFor(w, words) {
  const qs = [];
  if (w.t) qs.push({ q:`${w.t} ${w.a || ''}`.trim(), kind:'D' });
  if (w.a) qs.push({ q:w.a.replace(/\s*(외|옮김|지음)\s*$/, '').split(',')[0].trim(), kind:'C' });
  if (words.length >= 2) qs.push({ q:words.slice(0, 2).join(' '), kind:'B' });
  words.slice(0, 3).forEach((x) => qs.push({ q:x, kind:'B' }));
  const seen = new Set();
  return qs.filter((x) => x.q && !seen.has(x.q) && seen.add(x.q)).slice(0, 6);
}
// 검색 한 번의 결과를 후보로. onShelf: 이미 책장에 있는 제목 집합(SQ)
export function rowsToCands(kind, rows, words, w, onShelf) {
  const out = [];
  rows.forEach((r) => {
    if (r.y && w.fd && +r.y > +String(w.fd).slice(0, 4)) return; // 메모 쓴 해보다 늦게 나온 책
    if (kind === 'B') { const s = scoreRow(r, words, w); if (s > 0) out.push({ ...r, kind, score:s, why:`메모 낱말 ${s}개가 제목·저자와 맞음` }); }
    else if (kind === 'C') { const who = SQ(String(w.a).split(',')[0].replace(/\s*외$/, '')); if (who && SQ(r.a).includes(who) && !onShelf.has(SQ(r.t))) out.push({ ...r, kind, score:1.5, why:'적어 둔 저자의 책(책장에 없는 것)' }); }
    else if (kind === 'D') { if (SQ(r.t).includes(SQ(w.t)) || SQ(w.t).includes(SQ(r.t))) out.push({ ...r, kind, score:4, why:'추정해 둔 제목과 맞는 책' }); }
  });
  return out;
}
// 후보 합치기: 점수순, 같은 제목은 하나, 최대 3개. 인스타 근처 책(A)은 약한 단서라 낮게 둔다
export function pickTop(near, rows) {
  const cands = near.slice(0, 3).map((n) => ({ t:n.t, a:n.a, p:n.p, y:'', why:`같은 무렵 인스타 글(${n.post}, ${n.gap}일 차이)에 적힌 책이라 같은 책일 수 있음`, kind:'A', score:1 + (10 - Math.min(n.gap, 10)) / 20 }));
  rows.forEach((r) => cands.push(r));
  const seen = new Set();
  return cands.sort((a, b) => b.score - a.score).filter((c) => { const k = SQ(c.t); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 3);
}
// 한 권의 후보 3개. ctx = { stats, posts, shelf, search(q) → [{t,a,p,y}] }
export async function suggest(w, ctx) {
  const words = rareWords(w, ctx.stats, 4);
  const onShelf = new Set(ctx.shelf.map((b) => SQ(b.t)));
  const near = nearbyBooks(w, ctx.posts, ctx.shelf, 10);
  const rows = new Map();
  const qs = queriesFor(w, words);
  const got = await Promise.allSettled(qs.map(({ q }) => ctx.search(q))); // 검색 하나가 실패해도 나머지는 쓴다
  got.forEach((g, i) => {
    if (g.status !== 'fulfilled') return;
    rowsToCands(qs[i].kind, g.value, words, w, onShelf).forEach((r) => { const k = SQ(r.t + r.a); const o = rows.get(k); if (!o || r.score > o.score) rows.set(k, r); });
  });
  return { top:pickTop(near, [...rows.values()]), words:words.length };
}
