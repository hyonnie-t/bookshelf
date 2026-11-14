// 효니의 책장: 공개 화면은 data/public.json(책·인스타 서평), 주인 로그인 뒤에는 비공개 기록을 겹쳐 보여 주고 고칠 수 있다.
import * as remote from './fb.js';
import * as local from './local.js';
import { hasText, suggest, wordStats } from './guess.js';
import { spineColor, SAMPLE_COVERS } from './spine.js';
import { buildWordIndex, layoutGraph, narrowIndex, relatedWords, wordDoc, wordGraph, WORD_KINDS } from './words.js';
import { pickTheme, authorTheme } from './kdc.js';
import { isReading, canMarkReading, setReading, hasDoneRec, lastUnreadAt, readingPatch } from './reading.js';

const LOCAL = document.documentElement.dataset.mode === 'local'; // 범용판(/my/): 로그인 없이 기기에 저장
const fb = LOCAL ? local : remote;
const DEMO = !LOCAL && new URLSearchParams(location.search).get('demo') === '1'; // 시험용: 가짜 기록으로 주인 화면, 저장은 메모리에만
const KINDS = [['book','책'],['reading','읽는 중'],['film','영화·드라마'],['show','전시·공연'],['trip','여행'],['other','다른 글'],['wishlist','읽을 목록'],['all','전체']];
const THEMES = [['소설','소설'],['에세이','에세이'],['역사','역사'],['철학','철학'],['사회·정치','사회정치'],['여성','여성'],['과학·환경','과학환경'],['사랑·관계','사랑관계'],['죽음·상실','죽음상실'],['일·노동','일노동'],['교육','교육'],['법','법'],['SF·판타지','SF판타지'],['여행','여행'],['예술','예술'],['시','시'],['심리','심리'],['인문','인문'],['청소년·그림책','청소년그림책'],['경제·자기계발','경제자기계발'],['기타','기타']];
const POST_KINDS = [['review','서평'],['etc','결산·일상'],['blog','블로그'],['all','전체']];
const PAGE = 24;
const $ = (id) => document.getElementById(id);
const el = (tag, props, ...kids) => { const n = Object.assign(document.createElement(tag), props || {}); kids.flat(Infinity).forEach((k) => { if (k != null) n.append(k); }); return n; };
const themeVar = (t) => { const f = THEMES.find((x) => x[0] === t); return `var(--t-${f ? f[1] : '없음'})`; };
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const validCode = (c) => /^[A-Za-z0-9_-]{5,}$/.test(c);
const igUrl = (c) => `https://www.instagram.com/p/${c}/`;

const S = { kind:'book', theme:'', q:'', hideUnknown:true, onlyIg:false, onlyMe:false, pKind:'review', pq:'', pShown:PAGE, owner:false, user:null, view:'shelf', lf:'all', lq:'', ls:'theme', cur:null, lastWhere:'', order:'new', ry:'', drill:'', drillN:20, rOpen:'', rMore:[], voice:0 };
const D = { pub:null, blog:[], spines:{}, works:new Map(), posts:[], byWork:new Map(), priv:{}, lib:[], moved:new Map() };
// 합쳐서 빠진 책의 id를 남긴 책의 id로 바꾼다. 서평·서재 연결을 고쳐 쓰지 않아 되돌리기가 쉽다
// 찾기: 띄어쓰기와 문장부호를 무시하고, 여러 낱말은 순서와 상관없이 모두 들어 있으면 찾는다
const squeeze = (s) => (s || '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
const hasAll = (hay, q) => { const terms = (q || '').split(/\s+/).map(squeeze).filter(Boolean); return terms.length ? terms.every((t) => hay.includes(t)) : !(q || '').trim(); }; // 문장부호만 적으면 아무것도 안 찾는다
// 그래도 없을 때만 쓰는 찾기: 제목에 글자 순서만 맞으면 찾는다(«레슨케미» → 레슨 인 케미스트리). 짧은 말은 엉뚱한 책까지 잡으니 세 글자부터
const titleInOrder = (w, q) => { const s = squeeze(q); if (s.length < 3) return false; let i = 0; for (const c of squeeze(w.t)) if (c === s[i]) i++; return i === s.length; };
const movedTo = (id) => { let n = 0; while (D.moved.has(id) && n++ < 9) id = D.moved.get(id); return id; };
const VIEWS = ['shelf', 'library', 'posts', 'recap'];
const LIB_KINDS = [['all','전체'],['own','소장'],['out','빌려준 책'],['in','빌려 온 책'],['unread','아직 안 읽음']];
const DEFAULT_WHERE = '내 책장';
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.edition === 'eink'; // 이북리더기 에디션은 움직임을 끈다

/* ---------- 데이터 ---------- */
function rebuild() {
  const works = new Map();
  (D.pub.books || []).forEach((b) => works.set(b.id, { recs:[], notes:[], known:true, th:[], ...b, pub:true }));
  if (S.owner) Object.entries(D.priv.works || {}).forEach(([id, w]) => {
    const pub = works.get(id) || {};
    works.set(id, { recs:[], notes:[], ...pub, ...w, id, th:w.th || (DEMO ? pub.th : []) || [], y:w.y || pub.y || '', fd:w.fd || pub.fd || '' });
  });
  D.moved = new Map();
  for (const [id, w] of works) { w.recs = w.recs || []; w.notes = w.notes || []; w.archived = w.archived || []; w.marks = w.marks || []; w.th = w.th || []; if (w.del) { if (w.into) D.moved.set(id, w.into); works.delete(id); } }
  // 공개본의 옮김 표(tools/publish.js). 주인이 되돌려 다시 살아난 책은 따르지 않는다
  Object.entries(D.pub.moved || {}).forEach(([from, to]) => { if (!works.has(from) && !D.moved.has(from)) D.moved.set(from, to); });
  const posts = new Map((D.pub.posts || []).map((p) => [p.c, { ...p, w:p.w || [] }]));
  if (S.owner) {
    Object.values(D.priv.igAdded || {}).forEach((p) => posts.set(p.c, { ...p, w:p.w || [] }));
    Object.entries(D.priv.igLinks || {}).forEach(([c, l]) => { const p = posts.get(c); if (p) { p.w = l.w || []; if (l.k) p.k = l.k; } });
  }
  D.blog.forEach((p) => posts.set(p.c, { ...p, w:p.w || [], blog:true })); // 티스토리 글은 data/blog.json에서만 온다
  D.works = works;
  posts.forEach((p) => { p.w = [...new Set(p.w.map(movedTo))].filter((id) => works.has(id)); if (!p.w.length && p.k === 'review') p.k = 'etc'; });
  D.posts = [...posts.values()].sort((a, b) => b.d.localeCompare(a.d));
  D.byWork = new Map();
  D.posts.forEach((p) => p.w.forEach((id) => { if (!D.byWork.has(id)) D.byWork.set(id, []); D.byWork.get(id).push(p); }));
  works.forEach((w) => {
    const rv = D.byWork.get(w.id) || [];
    if (!w.pub && !w.notes.length && w.archived.length && !w.marks.length && !w.recs.length && !rv.length) { works.delete(w.id); return; } // 메모를 다 보관해 글이 없는 칸은 책장에서 뺀다. 되돌리면 다시 꽂힌다(tools/publish.js와 같은 기준)
    w.nameHay = squeeze([w.t, w.a, w.p].filter(Boolean).join(' '));
    w.hay = squeeze([w.t, w.a, w.p, ...w.notes.flatMap((n) => [n.l, n.b]), ...w.recs.flatMap((r) => [r.l, r.b]), ...w.marks.flatMap((m) => [m.q, m.why]), ...rv.map((p) => p.x)].filter(Boolean).join(' '));
    if (!w.y) { const d = [...w.recs.map((r) => r.d), ...w.notes.map((n) => n.d), ...rv.map((p) => p.d)].filter(Boolean).sort()[0]; if (d) w.y = d.slice(0, 4); }
    if (!w.fd) w.fd = [...w.recs.map((r) => r.d), ...w.notes.map((n) => n.d), ...rv.map((p) => p.d)].filter(Boolean).sort()[0] || '';
    // 책장의 달 묶음에 쓰는 날짜: 그해의 읽은 기록 → 처음 날짜 → 메모 → 서평 → 읽다 멈춘 기록 순으로 먼저 있는 것
    const inYear = (ds) => ds.filter((d) => d && d.length >= 7 && d.slice(0, 4) === w.y).sort()[0];
    w.md = inYear(w.recs.filter((r) => r.st !== 'unread').map((r) => r.d)) || inYear([w.fd]) || inYear(w.notes.map((n) => n.d)) || inYear(rv.map((p) => p.d)) || inYear(w.recs.map((r) => r.d)) || '';
  });
  D.posts.forEach((p) => { p.hay = squeeze([p.x, p.t, ...p.w.map((id) => { const w = works.get(id); return w ? titleOf(w) : ''; })].filter(Boolean).join(' ')); });
  // 내 서재는 비공개 칸(library)에만 있다. 읽은 책과는 w로 이어질 뿐 섞지 않는다
  D.lib = S.owner ? Object.entries(D.priv.library || {}).map(([id, v]) => ({ ...v, id, w:v.w ? movedTo(v.w) : '', st:v.st || 'own', loans:v.loans || [], th:v.th || [] })) : [];
}
const titleOf = (w) => w.t || { book:'제목 미확인 책', film:'제목 미확인 영화', show:'제목 미확인 공연', trip:'여행 기록', other:'제목 없는 글', wishlist:'읽을 목록' }[w.k] || '제목 없음';
const reviewsOf = (w) => D.byWork.get(w.id) || [];
// 나만 보기: 직접 정한 값이 먼저다. 정한 적 없으면 책·영화가 아닌 칸(여행·공연·다른 글·읽을 목록)은 나만 본다. tools/publish.js와 같은 기준
const isOnlyMe = (w) => w.only === undefined ? !['book','film'].includes(w.k || 'book') : !!w.only;
const showsOnlyMe = (w) => S.owner && !LOCAL && isOnlyMe(w);
const list = () => [...D.works.values()];
// 다 읽은 기록이 없고 미완독·읽는 중 표시가 있는 책. 공개 화면은 public.json의 st로 안다
const inShelfKind = (w, k) => k === 'all' || (k === 'reading' ? isReading(w) : w.k === k && !(k === 'book' && isReading(w)));

/* ---------- 책장 ---------- */
const isHidden = (w) => S.hideUnknown && !w.known && ['book','film','show'].includes(w.k);
function matches(w, loose) {
  if (!inShelfKind(w, S.kind)) return false;
  if (S.theme && !w.th.includes(S.theme)) return false;
  if (S.onlyIg && !reviewsOf(w).length) return false;
  if (S.onlyMe && !showsOnlyMe(w)) return false;
  if (isHidden(w) && !S.q && !S.onlyMe) return false; // 찾을 때는 숨긴 기록까지 찾아 준다
  if (S.q && !(loose ? titleInOrder(w, S.q) : hasAll(w.hay, S.q))) return false;
  return true;
}
function chips() {
  const all = list().filter((w) => !isHidden(w));
  $('onlyIg').setAttribute('aria-pressed', S.onlyIg);
  $('showUnknown').setAttribute('aria-pressed', !S.hideUnknown);
  if ($('onlyMe')) { $('onlyMe').setAttribute('aria-pressed', S.onlyMe); $('onlyMe').textContent = `나만 보기 ${list().filter(showsOnlyMe).length}`; }
  const count = (k) => all.filter((w) => inShelfKind(w, k)).length;
  const kinds = KINDS.filter(([k]) => k === 'all' ? false : count(k));
  const rows = kinds.length > 1 ? [...kinds, ['all','전체']] : [];
  $('kinds').replaceChildren(...rows.map(([k, label]) => {
    const b = el('button', { className:'chip', type:'button', textContent:`${label} ${count(k)}` });
    b.setAttribute('aria-pressed', S.kind === k);
    b.onclick = () => { S.kind = k; renderShelf(); };
    return b;
  }));
  const used = new Set(all.flatMap((w) => w.th));
  $('themes').replaceChildren(...[['', '주제 전체']].concat(THEMES.filter(([t]) => used.has(t))).map(([t]) => {
    const b = el('button', { className:'chip', type:'button' });
    if (t) { const sw = el('span', { className:'sw' }); sw.style.background = themeVar(t); b.append(sw, t); } else b.textContent = '주제 전체';
    b.setAttribute('aria-pressed', S.theme === t);
    b.onclick = () => { S.theme = S.theme === t ? '' : t; renderShelf(); };
    return b;
  }));
  foldSummary();
}
const SHORT_LATIN = /(?<![0-9A-Za-z])([0-9A-Za-z]{1,2})(?![0-9A-Za-z])/;
const spineText = (label) => el('span', {}, label.split(SHORT_LATIN).map((x, i) => (i % 2 ? el('i', { className:'tcy', textContent:x }) : x)));
// 책등 줄 4가지와 자세는 책 id로 정해 새로고침해도 같다
const LINES = ['ln-t1', 'ln-t2', 'ln-b1', 'ln-n'];
const lineOf = (id) => LINES[Math.abs(hash('line' + id)) % 4];
// 책 꺼내기: 누른 책이 선반에서 살짝 빠져나온 뒤 책 창이 펼쳐진다(움직임 끔·이북리더기면 바로 연다)
function pullOut(b, go) {
  if (calm()) { go(); return; }
  if (b._pull) return; // 빠르게 두 번 눌러도 한 번만 연다
  b.classList.add('pull');
  if (b.animate) b.animate([
    { translate:'0 0', scale:'1' },
    { translate:'0 -22px', scale:'1.04', boxShadow:'4px 10px 14px -4px rgba(0,0,0,.35)', offset:.28 },
    { translate:'0 0', scale:'1' },
  ], { duration:600, easing:'cubic-bezier(.3,.7,.3,1)' });
  b._pull = setTimeout(() => { b._pull = 0; go(); }, 170);
  setTimeout(() => b.classList.remove('pull'), 620);
}
const spineMark = (w) => (w.guess ? '추정' : isReading(w) ? '미완' : showsOnlyMe(w) ? '나만' : '');
// 책등 색(2026-11-14): data/spines.json의 [바탕, 글자, 강조]는 tools/cover-colors.js가 표지에서 뽑았다. 글자는 바탕과 대비 4.5 이상.
// 색이 없는 책(표지를 못 찾음·범용판)은 예전처럼 주제 색 바탕이고, 색이 있는 책은 주제 색을 아래 작은 띠로 남긴다
const coverColors = (w) => (!LOCAL && w && (w.k || 'book') === 'book' && D.spines[w.id]) || null;
// 칠하는 색은 표지 색 그대로가 아니라 고른 색 에디션의 범위로 옮긴 색이다(js/spine.js). 에디션이나 밝은·어두운 화면이 바뀌면 repaintSpines가 다시 칠한다
const isDark = () => { const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(getComputedStyle(document.body).backgroundColor); return !!m && (+m[1] * 0.299 + +m[2] * 0.587 + +m[3] * 0.114) < 110; };
function tintSpine(b, id, c, dark = isDark()) {
  const p = spineColor(c, document.documentElement.dataset.edition || 'base', dark, hash('tone' + id));
  b.dataset.cid = id;
  b.style.backgroundColor = p.bg; b.style.color = p.ink;
  b.style.setProperty('--ln', p.ln);
  // 표지 색 조각: 표지를 위에서 아래로 훑은 색을 책등 전체에 깐다(칸 사이만 살짝 번지게). 눕힌 책은 왼쪽에서 오른쪽으로.
  // 종이 결(가로 줄무늬)은 css 규칙이 인라인에 덮이므로 여기서 함께 깐다. 이북리더기는 css가 !important로 지운다
  const n = p.stops.length, lie = b.classList.contains('lie');
  const strip = n ? `linear-gradient(to ${lie ? 'right' : 'bottom'},${p.stops.map((c, i) => `${c} ${(i / n * 100 + (i ? 2.5 : 0)).toFixed(1)}% ${((i + 1) / n * 100 - (i < n - 1 ? 2.5 : 0)).toFixed(1)}%`).join(',')})` : '';
  b.style.backgroundImage = [lie ? '' : 'repeating-linear-gradient(to bottom,rgba(0,0,0,.025) 0 1px,transparent 1px 3px)', strip].filter(Boolean).join(',');
}
function repaintSpines() {
  const dark = isDark();
  document.querySelectorAll('.spine.cov[data-cid]').forEach((b) => { const c = D.spines[b.dataset.cid]; if (c) tintSpine(b, b.dataset.cid, c, dark); });
}
function paintSpine(b, w) {
  const c = coverColors(w);
  if (!c) { b.style.backgroundColor = themeVar(w.th[0]); return null; } // background 대신 색만(css의 결·그늘 background-image가 덧입혀진다)
  b.classList.add('cov');
  tintSpine(b, w.id, c);
  if (w.th[0]) { const band = el('b', { className:'band' }); band.style.background = themeVar(w.th[0]); b.append(band); }
  return c;
}
// 출판사: 책등 아래쪽에 작게(실제 책처럼). 괄호·«출판사» 꼬리를 떼고 다섯 글자까지
const pubShort = (p) => { const s = String(p || '').replace(/\(.*?\)|\[.*?\]/g, '').replace(/\s*(출판사|출판|주식회사|㈜|\(주\))\s*/g, '').trim(); return s.length > 5 ? s.slice(0, 5) : s; };
// 눕혀 쌓은 책: 가로 제목 22px, 폭은 제목 길이로만 정한다. 서평 막대는 오른쪽 끝, ×n은 제목 오른쪽
function lyingSpine(w) {
  const rv = reviewsOf(w), items = w.notes.length + w.recs.length + rv.length;
  const full = titleOf(w), mark = spineMark(w);
  const raw = w.t || (w.notes[0] || {}).l || (w.recs[0] || {}).l || full;
  const label = raw.length > 24 ? raw.slice(0, 23) + '…' : raw;
  const wd = Math.max(70, Math.min(130, 32 + label.length * 10));
  const b = el('button', { type:'button', className:'spine lie' + (w.known ? '' : ' unknown') + (rv.length ? ' has-ig' : '') });
  b.style.width = wd + 'px';
  b.append(el('span', { textContent:label }));
  if (coverColors(w)) { b.classList.add('cov'); tintSpine(b, w.id, coverColors(w)); }
  else b.style.backgroundColor = themeVar(w.th[0]);
  if (mark) b.append(el('i', { textContent:mark }));
  if (items > 1) b.append(el('i', { textContent:'×' + items }));
  b.setAttribute('aria-label', full + (w.a ? ', ' + w.a : '') + ', 글 ' + rv.length + '개' + (showsOnlyMe(w) ? ', 나만 보기' : ''));
  b.onclick = () => pullOut(b, () => openBook(w.id, b));
  return b;
}
function spine(w, pose) {
  const rv = reviewsOf(w), items = w.notes.length + w.recs.length + rv.length;
  const full = titleOf(w), multi = items > 1;
  const raw = w.t || (w.notes[0] || {}).l || (w.recs[0] || {}).l || full;
  const label = raw.length > 24 ? raw.slice(0, 23) + '…' : raw;
  const cols = label.length <= 8 ? 1 : label.length <= 16 ? 2 : 3;
  const len = rv.reduce((a, p) => a + p.x.length, 0) + w.notes.reduce((a, n) => a + (n.len || 0), 0);
  const mark = spineMark(w);
  let h = Math.min(198, (cols > 1 ? 150 : 124) + Math.min(36, Math.round(Math.sqrt(len) * .8)) + (multi ? 22 : 0) + (mark ? 18 : 0));
  // 출판사 자리: 제목 글자 높이(한 줄 약 13.5px)+위아래 여백+출판사 글자(약 10.5px)+띠. 198px 안에 다 들어갈 때만 넣고 그만큼 책을 키운다
  const pub = coverColors(w) && !mark ? pubShort(w.p) : '';
  const pubH = pub ? pub.length * 10.5 + 18 : 0;
  const need = Math.ceil(Math.ceil(label.length / cols) * 13.5 + 16 + (multi ? 16 : 0) + pubH + 6);
  const showPub = pub && need <= 198;
  if (showPub) h = Math.max(h, need);
  const wd = 18 + cols * 19 + Math.abs(hash(full + w.fd) % 9);
  const b = el('button', { type:'button', className:'spine' + (w.known ? '' : ' unknown') + (multi ? ' multi' : '') + (mark ? ' guess' : '') + (rv.length ? ' has-ig' : '') + ' ' + lineOf(w.id) + (pose === 'lean' ? ' lean' : '') });
  b.style.height = h + 'px'; b.style.width = wd + 'px';
  let gap = 0;
  if (pose === 'lean') { // 기대어 선다: 7~11°, 오른쪽 아래 모서리가 축이라 판에 박히지 않고, 기울어 나가는 만큼 오른쪽에 여백
    const tilt = 7 + Math.abs(hash('tilt' + w.id)) % 5;
    b.style.setProperty('--tilt', tilt + 'deg');
    gap = Math.ceil(h * Math.sin(tilt * Math.PI / 180)) + 2;
  }
  b.append(spineText(label));
  paintSpine(b, w);
  if (showPub) { b.classList.add('has-pub'); b.style.paddingBottom = Math.ceil(pubH) + 'px'; b.append(el('small', { className:'pub', textContent:pub })); }
  if (mark) b.append(el('i', { className:'est', textContent:mark }));
  if (multi) b.append(el('i', { className:'times', textContent:`×${items}` }));
  b.setAttribute('aria-label', `${full}${w.a ? ', ' + w.a : ''}, 글 ${rv.length}개${showsOnlyMe(w) ? ', 나만 보기' : ''}`);
  b.onclick = () => pullOut(b, () => openBook(w.id, b));
  const slot = el('div', { className:'slot' + (pose === 'lean' ? ' lean' : '') }, b);
  if (gap) slot.style.setProperty('--gap', gap + 'px');
  return slot;
}
// 선반 끝: 책이 8권 이상이면 2~3권을 눕혀 쌓고(선반당 한 번), 그 앞에 기대어 선 책을 둔다. 기댄 책과 눕힌 책은 합쳐 3권을 넘기지 않는다
function shelfBooks(items) {
  const n = items.length;
  if (n < 4) return items.map((w) => spine(w));
  const seed = Math.abs(hash('end' + items[n - 1].id));
  const lie = n >= 8 && seed % 3 ? (n >= 14 && seed % 2 ? 3 : 2) : 0;
  const lean = Math.max(0, Math.min(n - lie - 2, lie === 3 ? 0 : lie ? (seed >> 2) % 2 : 1 + (seed >> 2) % 2));
  const out = items.slice(0, n - lie - lean).map((w) => spine(w));
  items.slice(n - lie - lean, n - lie).forEach((w) => out.push(spine(w, 'lean')));
  if (lie) {
    out.push(el('div', { className:'slot pile' }, items.slice(n - lie).map((w) => {
      const b = lyingSpine(w);
      b.style.marginLeft = (Math.abs(hash('off' + w.id)) % 8 - 1) + 'px'; // -1~6px 어긋나게
      return b;
    })));
  }
  return out;
}
let io;
function watch(sel) {
  if (!('IntersectionObserver' in window)) { document.querySelectorAll(sel).forEach((n) => n.classList.add('show')); return; }
  io = io || new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('show'); io.unobserve(e.target); } }), { rootMargin:'0px 0px -5% 0px' });
  document.querySelectorAll(sel).forEach((n) => { if (!n.classList.contains('show')) io.observe(n); });
}
const NAMED_GROUP = '제목·저자 일치';
const ORDERS = [['new','최신순'],['old','오래된순']];
/* 접는 칸: 첫 화면에 책이 보이도록 주제·순서와 관리 도구를 접어 둔다. 펼친 상태는 기기별로 기억한다 */
const FOLD_KEY = LOCAL ? 'myshelf-fold' : 'shelf-fold';
const fold = { filters:false, tools:false };
try { (localStorage.getItem(FOLD_KEY) || '').split(',').forEach((k) => { if (k in fold) fold[k] = true; }); } catch (e) {}
function syncFold() {
  $('filterPanel').hidden = !fold.filters;
  $('toolsPanel').hidden = !(fold.tools && S.owner);
  $('foldFilters').setAttribute('aria-expanded', fold.filters);
  $('foldTools').setAttribute('aria-expanded', fold.tools);
}
function toggleFold(k) {
  fold[k] = !fold[k];
  try { localStorage.setItem(FOLD_KEY, Object.keys(fold).filter((x) => fold[x]).join(',')); } catch (e) {}
  syncFold();
}
function foldSummary() {
  const on = [S.theme, S.order === 'old' ? '오래된순' : '', S.onlyIg ? '서평 있는 책' : '', S.owner && !LOCAL && !S.hideUnknown ? '제목 미확인 포함' : '', S.onlyMe ? '나만 보기' : ''].filter(Boolean);
  $('foldLabel').textContent = on.length ? `주제·순서: ${on[0]}${on.length > 1 ? ` 외 ${on.length - 1}` : ''}` : '주제·순서';
  $('foldFilters').classList.toggle('on', on.length > 0);
}
const ORDER_KEY = LOCAL ? 'myshelf-order' : 'shelf-order';
try { if (localStorage.getItem(ORDER_KEY) === 'old') S.order = 'old'; } catch (e) {}
function syncOrder() {
  ['shelfSort', 'postSort'].filter($).forEach((id) => { [...$(id).children].forEach((b) => b.setAttribute('aria-pressed', b.dataset.order === S.order)); });
}
function setOrder(v) {
  if (S.order === v) return;
  S.order = v;
  try { localStorage.setItem(ORDER_KEY, v); } catch (e) {}
  syncOrder();
  renderShelf();
  renderPosts(true);
}
['shelfSort', 'postSort'].filter($).forEach((id) => {
  $(id).replaceChildren(...ORDERS.map(([v, label]) => {
    const b = el('button', { className:'chip', type:'button', textContent:label });
    b.dataset.order = v;
    b.onclick = () => setOrder(v);
    return b;
  }));
});
syncOrder();
// 그해 책을 달마다 나눈다. 달을 아는 책이 하나도 없는 해(공개 화면의 옛 책들)는 예전처럼 한 선반에 꽂는다
function yearBody(y, rows, unit) {
  const dir = S.order === 'old' ? 1 : -1;
  const rack = (items) => el('div', { className:'rack' }, shelfBooks(items.sort((a, b) => dir * (a.md || a.fd).localeCompare(b.md || b.fd))));
  const months = {}, unknown = [];
  rows.forEach((w) => { const m = /^\d{4}$/.test(y) ? w.md.slice(0, 7) : ''; if (m) (months[m] = months[m] || []).push(w); else unknown.push(w); });
  const keys = Object.keys(months).sort((a, b) => dir * a.localeCompare(b));
  if (!keys.length) return rack(rows);
  const part = (label, items) => el('div', { className:'month' }, el('div', { className:'month-head' }, el('h3', { textContent:label }), el('span', { textContent:`${items.length}${unit}` })), rack(items));
  return el('div', { className:'months' }, keys.map((m) => jumpMark(part(`${+m.slice(5)}월`, months[m]), m)), unknown.length ? part('달을 모르는 책', unknown) : null);
}
function renderShelf() {
  queueJump();
  chips();
  let rows = list().filter((w) => matches(w));
  const loose = !!S.q && !rows.length;
  if (loose) rows = list().filter((w) => matches(w, true));
  const unit = S.kind === 'film' ? '편' : '권';
  $('count').textContent = `${rows.length}${unit}`;
  const byYear = {};
  const named = new Set(S.q ? rows.filter((w) => hasAll(w.nameHay, S.q)) : []); // 서평·메모에만 나온 책에 묻히지 않게 제목·저자에 있는 책을 맨 위에 모은다
  const groupOf = (w) => loose ? '비슷한 제목' : (named.size &&named.size < rows.length && named.has(w) ? NAMED_GROUP : w.y || '날짜 없음');
  rows.forEach((w) => { (byYear[groupOf(w)] = byYear[groupOf(w)] || []).push(w); });
  const ys = Object.keys(byYear).sort((a, b) => (b === NAMED_GROUP) - (a === NAMED_GROUP) || (a === '날짜 없음') - (b === '날짜 없음') || (S.order === 'old' ? a.localeCompare(b) : b.localeCompare(a))); // 날짜 없는 칸은 맨 아래
  if (LOCAL && !D.works.size) {
    const first = el('button', { className:'btn', type:'button', textContent:'첫 책 꽂기' });
    first.onclick = () => openBookForm(null);
    $('shelves').replaceChildren(el('div', { className:'empty' }, el('div', { textContent:'아직 꽂은 책이 없어요. 가입은 필요 없고, 기록은 이 기기에만 남아요.' }), first));
    return;
  }
  if (!ys.length) {
    const reset = el('button', { className:'btn', type:'button', textContent:'조건 풀기' });
    reset.onclick = () => { Object.assign(S, { kind:'all', theme:'', q:'', hideUnknown:!S.owner, onlyIg:false, onlyMe:false }); $('q').value = ''; renderShelf(); };
    $('shelves').replaceChildren(el('div', { className:'empty' }, el('div', { textContent:'조건에 맞는 책이 없어요. 종류나 주제를 바꿔 보세요.' }), reset));
    return;
  }
  $('shelves').replaceChildren(...ys.map((y) => jumpMark(el('section', { className:'shelf' },
    el('div', { className:'shelf-head' }, el('h2', { textContent:y }), el('span', { textContent:`${byYear[y].length}${unit}` })),
    yearBody(y, byYear[y], unit)), y)));
  balanceRacks();
  watch('.shelf');
}
// 두 줄 넘게 꽂히는 칸: 아랫줄에 한두 권만 남지 않게, 줄 수는 그대로 두고 칸 폭을 줄여 줄마다 비슷하게 꽂는다(글의 줄 고르기와 같은 생각)
function balanceRacks() {
  const racks = [...$('shelves').querySelectorAll('.rack')];
  racks.forEach((r) => { r.style.maxWidth = ''; });
  const plan = racks.map((r) => {
    const ws = [...r.children].map((k) => k.getBoundingClientRect().width);
    if (ws.length < 3) return 0;
    const cs = getComputedStyle(r), side = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const inner = r.getBoundingClientRect().width - side;
    const rows = (W) => { let n = 1, x = 0; ws.forEach((w) => { if (x && x + w > W + 0.5) { n++; x = 0; } x += w; }); return n; };
    const R = rows(inner);
    if (R < 2) return 0;
    let lo = Math.max(...ws), hi = inner;
    while (hi - lo > 1) { const mid = (lo + hi) / 2; if (rows(mid) <= R) hi = mid; else lo = mid; }
    return hi + 2 < inner ? Math.ceil(hi) + side + 1 : 0;
  });
  racks.forEach((r, i) => { if (plan[i]) r.style.maxWidth = plan[i] + 'px'; });
}
let rackTimer = 0, rackW = innerWidth;
window.addEventListener('resize', () => { if (innerWidth === rackW) return; rackW = innerWidth; clearTimeout(rackTimer); rackTimer = setTimeout(() => { if (S.view === 'shelf') balanceRacks(); }, 120); });

/* ---------- 바로 가기·맨 위로 ---------- */
const jumpMark = (n, label) => { n.dataset.jump = label; n.tabIndex = -1; return n; };
const jumpScope = () => (S.view === 'shelf' ? $('shelves') : S.view === 'library' ? $('cases') : S.view === 'posts' ? $('posts') : null);
const smooth = () => (calm() ? 'auto' : 'smooth');
const isMonthMark = (l) => /^\d{4}-\d{2}$/.test(l);
const yearOfMark = (l) => (isMonthMark(l) ? l.slice(0, 4) : l);
// 달은 옆으로 이어 꽂혀 한 줄에 여럿이다. 누른 칩이 그 줄의 다른 달로 바뀌어 보이지 않게, 직접 스크롤할 때까지 표시를 고정한다
let jumpPin = '';
['wheel', 'touchstart', 'keydown'].forEach((t) => window.addEventListener(t, () => { jumpPin = ''; }, { passive:true }));
function goJump(label) {
  const find = () => jumpScope().querySelector(`[data-jump="${CSS.escape(label)}"], [data-jump^="${CSS.escape(label)}-"]`);
  let target = find();
  if (!target && S.view === 'posts') { // 아직 안 펼친 해·달의 글이면 거기까지 펼친다
    const i = postRows().findIndex((p) => p.d.startsWith(label));
    if (i < 0) return;
    S.pShown = i + PAGE;
    renderPosts();
    target = find();
  }
  if (!target) return;
  jumpPin = label;
  target.scrollIntoView({ block:'start', behavior:smooth() });
  target.focus({ preventScroll:true });
}
// 연도(또는 서재 칸) → 그 안의 달. 책장은 연도·달별로 꽂혀 있고 서재는 칸별이다. 종류·주제는 이미 고르기 단추가 있다
function jumpGroups() {
  const scope = jumpScope();
  const marks = S.view === 'posts' ? postRows().map((p) => p.d.slice(0, 7)) : scope ? [...scope.querySelectorAll('[data-jump]')].map((n) => n.dataset.jump) : [];
  const groups = new Map();
  marks.forEach((l) => { const y = yearOfMark(l); if (!groups.has(y)) groups.set(y, []); if (isMonthMark(l) && !groups.get(y).includes(l)) groups.get(y).push(l); });
  return groups;
}
let jumpMap = new Map(), jumpYear = null;
// 지금 보는 해 바로 뒤에만 달을 펼쳐, 메뉴가 한 줄을 넘지 않게 한다
function drawJump(year) {
  jumpYear = year;
  const chip = (label, text, cls, aria) => {
    const b = el('button', { className:'chip' + (cls ? ' ' + cls : ''), type:'button', textContent:text });
    b.dataset.j = label;
    if (aria) b.setAttribute('aria-label', aria);
    b.onclick = () => goJump(label);
    return b;
  };
  $('jump').replaceChildren(...[...jumpMap.entries()].flatMap(([y, months]) => [chip(y, y), ...(y === year ? months.map((m) => chip(m, `${+m.slice(5)}월`, 'jm', `${m.slice(0, 4)}년 ${+m.slice(5)}월`)) : [])]));
}
function nowMark() {
  const line = $('topnav').getBoundingClientRect().bottom + 16, scope = jumpScope();
  if (jumpPin && scope && scope.querySelector(`[data-jump="${CSS.escape(jumpPin)}"], [data-jump^="${CSS.escape(jumpPin)}-"]`)) return jumpPin;
  jumpPin = '';
  let now = '';
  const marks = scope ? [...scope.querySelectorAll('[data-jump]')] : [];
  for (const n of marks) { if (n.getBoundingClientRect().top <= line) now = n.dataset.jump; else break; }
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2 && marks.length && (S.view !== 'posts' || $('postsMore').hidden)) now = marks[marks.length - 1].dataset.jump; // 끝까지 내려오면 마지막 묶음(덜 펼친 서평은 제외)
  return now || (marks[0] && marks[0].dataset.jump) || '';
}
function renderJump() {
  jumpMap = jumpGroups();
  const box = $('jump'), hasMonths = [...jumpMap.values()].some((m) => m.length);
  box.hidden = jumpMap.size < 2 && !hasMonths;
  box.setAttribute('aria-label', S.view === 'library' ? '서재 칸으로 바로 가기' : '연도와 달로 바로 가기');
  if (box.hidden) box.replaceChildren(); else drawJump(yearOfMark(nowMark()));
  spy();
}
let jumpQueued = false;
function queueJump() { if (jumpQueued) return; jumpQueued = true; queueMicrotask(() => { jumpQueued = false; renderJump(); }); }
let lastScrollY = 0;
// 지금 보는 묶음을 메뉴에 표시하고, 내려왔으면 맨 위로 단추를 보인다
function spy() {
  $('toTop').classList.toggle('show', scrollY > 500);
  if (Math.abs(scrollY - lastScrollY) > 8) {
    const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
    document.body.classList.toggle('scroll-down', scrollY > lastScrollY && scrollY > 200 && !atEnd);
    lastScrollY = scrollY;
  }
  const box = $('jump');
  if (box.hidden) return;
  const now = nowMark(), year = yearOfMark(now);
  if (year !== jumpYear) drawJump(year);
  [...box.children].forEach((b) => {
    const on = b.dataset.j === now || b.dataset.j === year;
    if (on && b.getAttribute('aria-current') !== 'true' && (b.dataset.j === now)) box.scrollLeft = b.offsetLeft - (box.clientWidth - b.offsetWidth) / 2;
    if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
  });
}
let spyQueued = false;
window.addEventListener('scroll', () => { if (spyQueued) return; spyQueued = true; requestAnimationFrame(() => { spyQueued = false; spy(); }); }, { passive:true });
$('toTop').onclick = () => {
  scrollTo({ top:0, behavior:smooth() });
  const tab = document.querySelector('.tab[aria-selected="true"]');
  if (tab) tab.focus({ preventScroll:true });
};
const syncNavH = () => document.documentElement.style.setProperty('--nav-h', `${$('topnav').offsetHeight}px`);
syncNavH();
if ('ResizeObserver' in window) new ResizeObserver(syncNavH).observe($('topnav'));

/* ---------- 색 에디션: 기기마다 저장한다 ---------- */
const EDITIONS = [['base','표지 색','책마다 표지에서 뽑은 색'],['paper','오래된 종이','크림색 종이와 나무 선반'],['forest','숲속 서재','이끼색과 풀색'],['sea','새벽 바다','맑고 서늘한 푸른색'],['blossom','봄 벚꽃','연한 분홍빛'],['ink','먹과 한지','거의 무채색인 묵직한 서가'],['night','밤 서재','늘 어두운 밤빛 배경에 표지 색 그대로'],['eink','이북리더기','흑백·큰 글자·움직임 없음. 전자잉크 화면용']];
const ED_KEY = LOCAL ? 'myshelf-edition' : 'shelf-edition';
const curEdition = () => document.documentElement.dataset.edition || 'base';
function syncBarColor() {
  const c = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  const m = document.querySelector('meta[name="theme-color"]');
  if (c && m) m.content = c;
}
function setEdition(id) {
  if (id === 'base') delete document.documentElement.dataset.edition; else document.documentElement.dataset.edition = id;
  syncBarColor();
  repaintSpines();
}
function openEditionForm() {
  const was = curEdition();
  let chosen = false;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches; // 견본은 지금 에디션이 아니라 기기 설정 기준(밤 서재에서 열어도 다른 에디션은 고르면 보일 판으로)
  const THEME_SAMPLES = ['소설','에세이','역사','철학','사회·정치','여행','법','시','과학·환경','예술'];
  const opts = EDITIONS.map(([id, name, note]) => {
    if (LOCAL && id === 'base') { name = '조용한 서가'; note = '지금까지 쓰던 차분한 색'; } // 범용판은 표지 색을 쓰지 않고 주제 색으로 칠한다
    if (LOCAL && id === 'night') note = '늘 어두운 밤빛 배경';
    const r = el('input', { type:'radio', name:'edition', value:id, checked:id === was });
    r.onchange = () => setEdition(id);
    const sw = el('span', { className:'ed-swatch' }, SAMPLE_COVERS.map((c, i) => { // 견본은 실제 책등과 같은 규칙으로 칠한다
      const s = el('i');
      s.style.background = LOCAL ? themeVar(THEME_SAMPLES[i]) : id === 'eink' ? '#fff' : spineColor([c], id, id === 'night' || dark, i).bg; s.style.height = `${60 + (i * 37) % 40}%`;
      return s;
    }));
    sw.dataset.edition = id;
    sw.setAttribute('aria-hidden', 'true');
    return el('label', { className:'ed-opt' }, r, el('b', { textContent:name }), sw, el('p', { className:'ed-note', style:'grid-column:1 / -1', textContent:note }));
  });
  const box = el('div', { className:'ed-list', role:'radiogroup', ariaLabel:'색 에디션' }, opts);
  $('form').addEventListener('close', () => { if (!chosen) setEdition(was); }, { once:true });
  showForm('색 에디션', [box, el('p', { className:'ed-note', textContent:'고르면 뒤의 책장이 바로 바뀌어요. 이 기기에서만 바뀌고, 어두운 화면에서는 같은 색의 어두운 판으로 보여요.' })], async () => {
    chosen = true;
    try { localStorage.setItem(ED_KEY, curEdition()); } catch (e) {}
    toast('이 색으로 쓸게요');
  }, '이 색으로 쓰기');
}
$('editionBtn').onclick = openEditionForm;

/* ---------- 새로고침 단추 ---------- */
// 홈 화면에 추가한 앱은 주소창·당겨서 새로고침이 없어 새 버전을 보려면 앱을 껐다 켜야 한다. 앱 파일 캐시만 지우고 다시 불러온다.
// 비공개 기록(IndexedDB)·localStorage·로그인은 건드리지 않는다. 캐시 이름은 루트 bookshelf-, 범용판 myshelf-(같은 주소에 있는 다른 앱 캐시는 지우지 않는다)
async function refreshApp() {
  const btn = $('refreshBtn');
  if (btn.disabled) return;
  // 인터넷이 끊겨 있으면 새 버전을 받을 수 없고, 캐시를 지운 뒤 다시 읽으면 빈 화면이 된다
  if (navigator.onLine === false) { toast('인터넷이 끊겨 있어요. 연결되면 다시 눌러 주세요.'); return; }
  // 양식 창이 열려 있으면 쓰던 내용이 날아갈 수 있어 한 번 묻는다(모달이 열려 있으면 보통 이 단추는 눌리지 않는다)
  if ($('form').open && !await ask('쓰던 내용이 있으면 사라져요. 그래도 새로고침할까요?', '새로고침')) return;
  btn.disabled = true; btn.classList.add('spinning');
  const limit = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const turn = new Promise((r) => setTimeout(r, calm ? 0 : 700));
  try {
    if ('serviceWorker' in navigator) { const reg = await limit(navigator.serviceWorker.getRegistration(), 2000); if (reg) await limit(reg.update().catch(() => {}), 3000); }
    if ('caches' in window) { const pre = LOCAL ? 'myshelf-' : 'bookshelf-'; const ks = await limit(caches.keys(), 2000); await Promise.all((ks || []).filter((k) => k.startsWith(pre)).map((k) => caches.delete(k))); }
  } catch (e) { console.error(e); }
  await turn;
  location.reload();
}
$('refreshBtn').onclick = refreshApp;
syncBarColor();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { syncBarColor(); repaintSpines(); });

/* ---------- 책 자세히 ---------- */
// 앞머리: 첫 문장(12~70자)이 글의 일부일 때만. 문장이 전부이거나 너무 길면 나누지 않는다
function postLead(x) {
  const m = /^\s*([^\n]{12,70}?[.!?…。])(?=\s|$)\s*([\s\S]*)$/.exec(x || '');
  if (!m) return null;
  const rest = m[2].trim();
  return rest.length >= 20 ? { head:m[1].trim(), rest } : null;
}
// 표지 문장: 필사한 밑줄(12~160자) 하나. 날마다 바뀐다. 없으면 null
function coverQuote(w) {
  if (!w.id) return null;
  // 주인은 자기 밑줄 전부, 방문자는 공개본(public.json의 qs=[[문장,쪽]])에 올라간 문장만(효니 결정 2026-11-09: 문장은 기본 공개, 밑줄마다 끌 수 있음)
  const src = S.owner ? (w.marks || []).map((m) => ({ q:tidy(m.q), p:m.p })) : (w.qs || []).map((x) => ({ q:tidy(x[0]), p:x[1] }));
  const ok = src.filter((m) => m.q.length >= 12 && m.q.length <= 160);
  if (!ok.length) return null;
  const m = ok[Math.abs(hash(`${today()}:${w.id}`)) % ok.length];
  return { q:m.q, where:pageLabel(m.p) };
}
function postBlock(p, { showBooks = false, ownerTools = false, inWork = null } = {}) {
  const lead = showBooks && !p.t ? postLead(p.x) : null; // 서평 목록 카드: 앞머리 한 줄을 위에 따로 보이고 본문은 그 뒤부터 (공개 글이라 누구나)
  const text = el('p', { className:'post-text', textContent:lead ? lead.rest : p.x });
  const long = text.textContent.length > 420;
  if (long) text.classList.add('clamp');
  const kids = [el('div', { className:'when', textContent:p.blog ? `${p.d} · 블로그` : p.d })];
  if (p.t) kids.push(el('p', { className:'post-title', textContent:p.t }));
  else if (lead) kids.push(el('p', { className:'post-lead', textContent:lead.head }));
  if (showBooks && p.w.length) {
    kids.push(el('div', { className:'post-books' }, p.w.map((id) => {
      const w = D.works.get(id); if (!w) return null;
      const b = el('button', { className:'chip book-chip', type:'button', textContent:titleOf(w) });
      b.onclick = () => openBook(id, b);
      return b;
    })));
  }
  kids.push(text);
  const foot = el('div', { className:'memo-foot' });
  if (long) {
    const more = el('button', { className:'copy', type:'button', textContent:'더 보기' });
    more.setAttribute('aria-expanded', 'false');
    more.onclick = () => { const open = text.classList.toggle('clamp'); more.textContent = open ? '더 보기' : '접기'; more.setAttribute('aria-expanded', String(!open)); };
    foot.append(more);
  }
  if (p.blog) foot.append(el('a', { className:'copy link', href:p.u, target:'_blank', rel:'noopener', textContent:'블로그에서 읽기' }));
  else if (validCode(p.c)) foot.append(el('a', { className:'copy link', href:igUrl(p.c), target:'_blank', rel:'noopener', textContent:'인스타그램에서 보기' }));
  if (ownerTools && S.owner && !p.blog) {
    if (inWork) {
      const un = el('button', { className:'copy', type:'button', textContent:'이 책 글이 아니에요' });
      un.onclick = () => saveLinks(p, p.w.filter((x) => x !== inWork), '연결을 풀었어요', inWork).catch((e) => { console.error(e); toast(e.userMsg || '저장하지 못했어요. 인터넷 연결을 확인해 주세요'); });
      foot.append(un);
    } else {
      const link = el('button', { className:'copy', type:'button', textContent:'책과 잇기' });
      link.onclick = () => openLinkForm(p);
      foot.append(link);
    }
  }
  kids.push(foot);
  return el('article', { className:'memo post' }, kids);
}
function openBook(rawId, from, item) {
  const id = movedTo(rawId);
  const w = D.works.get(id);
  if (!w) { toast('이 책을 찾지 못했어요'); return; }
  S.cur = item ? { lib:item.id } : { id };
  renderTome(w, item || (S.owner ? libByWork(id) : null), from);
}
// 서재의 책: 읽은 책과 이어져 있으면 그 기록까지, 아니면 서재 정보만 펼친다
function openLib(libId, from) {
  const it = D.lib.find((x) => x.id === libId);
  if (!it) { toast('이 책을 찾지 못했어요'); return; }
  const w = libWork(it);
  if (w) { openBook(w.id, from, it); return; }
  S.cur = { lib:libId };
  renderTome({ t:it.t, a:it.a, p:it.p, k:'book', th:it.th, recs:[], notes:[], marks:[] }, it, from);
}
const privateTag = () => LOCAL ? null : el('span', { className:'only-tag', textContent:'나만 보기' });
/* 글 하나씩의 공개 여부(2026-11-09): 메모·기록은 기본이 나만 보기고 글마다 pub:true로 공개한다. 밑줄은 기본 공개고 pub:false로 끈다.
   공개는 tools/publish.js가 책 공개본의 ms=[[본문, 날짜]]로 옮긴다(책이 공개 상태일 때만, 별점·내 생각은 안 감(본문이 비면 한 줄 평)). 범용판에는 없다 */
const MS_MAX = 1000, MS_COUNT = 5;
const baseOnlyTag = () => LOCAL ? null : el('span', { className:'only-tag', textContent:'기본은 나만 보기' });
const visTag = (open) => LOCAL ? null : el('span', { className:'only-tag vis' + (open ? ' open' : ''), textContent:open ? '공개' : '나만 보기' });
const itemBody = (x) => String(x.b || x.l || '').trim();
// 책 창을 다시 그려도 보던 자리가 그대로 있도록 스크롤을 붙잡았다 되돌린다
function keepScroll(job) {
  const at = ['.pages', '.leaf.r'].map((c) => { const n = document.querySelector(`#sheet-body ${c}`); return [c, n ? n.scrollTop : 0]; });
  return job().then(() => at.forEach(([c, top]) => { const n = document.querySelector(`#sheet-body ${c}`); if (n) n.scrollTop = top; })).catch(() => {});
}
// 글(기록·메모)의 «방문자에게 공개» 칸. 고치기 창 아래에 둔다(2026-11-14 효니 선택: 카드에는 «고치기»만). 밑줄은 openMarkForm에 따로 있다(기본 공개)
function pubBox(x) {
  if (LOCAL) return null;
  const input = el('input', { type:'checkbox', checked:!!(x && x.pub === true) });
  const box = el('label', { className:'check' }, input, ' 방문자에게 공개 (다음 공개 반영 때 이 책 페이지에 올라가요. 책이 공개 상태일 때만 보여요)');
  box.input = input;
  return box;
}
// 공개를 새로 켤 때만 막을 것을 보고 확인 창을 한 번 띄운다. 거절하면 저장하지 않는다
async function pubCheck(box, was, body, group, w) {
  if (!box || !box.input.checked || was) return;
  if (!body) throw fail('본문이 없는 글은 공개할 수 없어요. 공개 칸을 끄거나 본문을 적어 주세요.');
  if (body.length > MS_MAX) throw fail(`${MS_MAX}자가 넘어서 공개할 수 없어요. 줄이거나 나눠 주세요.`);
  if (!await ask(`이 글을 방문자에게 공개할까요? 다음 공개 반영 때 «${titleOf(w) || '이 책'}» 페이지에 올라가요. ${group === 'recs' ? '별점은 안 올라가요(본문이 비어 있으면 한 줄 평이 올라가요). ' : ''}(책이 공개 상태일 때만 보여요)`, '공개하기', false)) throw fail('공개하지 않았어요. 저장하려면 공개 칸을 끄고 다시 눌러 주세요.');
}
const setPub = (x, box) => { if (!box) return x; const z = { ...x }; if (box.input.checked) z.pub = true; else delete z.pub; return z; };
// 고치기 창 아래의 (보관) ··· 지우기 줄. 누르면 창을 닫고 일을 한다(지우기는 확인 창을 거친다)
function formTools(...btns) {
  btns = btns.filter(Boolean);
  return btns.length ? el('div', { className:'memo-foot form-tools' }, btns) : null;
}
function formBtn(label, job, danger) {
  const b = el('button', { className:'copy' + (danger ? ' danger' : ''), type:'button', textContent:label });
  b.onclick = async () => { b.disabled = true; try { await job(); } finally { b.disabled = false; } };
  return b;
}
// 모든 글(기록·밑줄·메모)의 카드: «고치기»만(2026-11-14). 공개 여부는 옆의 표(visTag)가 보이고, 공개·보관·지우기는 고치기 창 안에 있다
function itemTools(w, { edit }) {
  const e = el('button', { className:'copy', type:'button', textContent:'고치기' });
  e.onclick = edit;
  return el('div', { className:'memo-foot' }, e);
}
async function delRec(w, i, onYes) {
  const cur = D.works.get(w.id) || w;
  if (!await ask('이 기록을 지울까요? 되돌릴 수 없어요.')) return;
  if (onYes) onYes();
  const recs = cur.recs.filter((_, x) => x !== i);
  const next = { ...cur, recs };
  if (recs.length) next.unread = recs.every((x) => x.st === 'unread'); // 남은 기록으로 읽는 중인지 다시 정한다(기록을 더할 때와 같은 기준)
  await keepScroll(() => memoSave(next, '기록을 지웠어요'));
}
// 공개 페이지(data/public.json)는 tools/publish.js로만 바뀐다. 그래서 지금 방문자에게 어떻게 보이는지를 그대로 적는다
function onlyMeText(w) {
  const on = isOnlyMe(w), rv = reviewsOf(w).some((p) => !p.blog);
  const merged = [...D.moved].some(([from, to]) => to === w.id && (D.pub.books || []).some((b) => b.id === from)); // 이 칸에 합쳐졌지만 공개본에는 아직 남은 책
  if (on && (w.pub || merged)) return '공개 페이지에는 아직 남아 있어요. 다음 공개 반영 때 내려가요.';
  if (on) return rv ? '방문자에게 이 책이 안 보여요. 이어진 인스타 글은 공개로 남고 책 연결만 빠져요.' : '방문자에게 안 보여요.';
  if (w.pub) return '방문자에게 책 정보(제목·저자·주제·날짜)와 인스타 글이 보여요. 기록과 메모는 나만 봐요.';
  if (!w.t || w.guess) return '제목을 확인하기 전까지는 공개되지 않아요.';
  const done = w.k === 'book' && w.known && (w.recs.some((r) => r.st !== 'unread') || w.st === 'done'); // tools/publish.js와 같은 기준
  if (w.only === false || done || rv) return '다음 공개 반영 때 책 정보(제목·저자·주제·날짜)가 올라가요. 기록과 메모는 나만 봐요.';
  return '아직 공개 페이지에 없어요. 다 읽은 기록을 남기면 다음 공개 반영 때 책 정보가 올라가요.';
}
// 제목 미확인 책: 메모의 드문 낱말·저자·같은 무렵 인스타 글로 «혹시 이 책?» 후보 3개(js/guess.js). 누를 때만 찾는 말이 중계로 나가고, 후보를 누르기 전에는 아무것도 저장하지 않는다
function guessBox(w) {
  const out = el('ul', { className:'found' });
  const msg = el('p', { className:'warn', role:'status', hidden:true });
  const go = el('button', { className:'btn ghost', type:'button', textContent:'혹시 이 책?' });
  go.onclick = async () => {
    go.disabled = true; msg.hidden = false; msg.textContent = '후보를 찾는 중이에요'; out.replaceChildren();
    try {
      const books = list().filter((x) => x.k === 'book');
      const shelf = books.filter((x) => x.known && x.t).map((x) => ({ id:x.id, t:x.t, a:x.a, p:x.p }));
      const { top } = await suggest(w, { stats:wordStats(books), posts:D.posts.filter((p) => !p.blog), shelf, search:fromRelay });
      msg.textContent = top.length ? '맞는 책을 누르면 제목과 저자가 채워져요. 단서가 약해 틀릴 수 있어요.' : '단서로는 후보를 찾지 못했어요. «책 고치기»에서 직접 찾아 주세요.';
      out.replaceChildren(...top.map((c) => {
        const pick = el('button', { type:'button' }, el('strong', { textContent:c.t }), el('span', { textContent:[c.a, c.p, c.y].filter(Boolean).join(' · ') }), el('span', { className:'why', textContent:c.why }));
        pick.onclick = async () => {
          out.querySelectorAll('button').forEach((b) => { b.disabled = true; });
          try { const next = { ...w, t:c.t, a:c.a || w.a || '', p:c.p || w.p || '', known:true }; delete next.guess; await saveWork(next, `«${c.t}»로 채웠어요`); reshow(); }
          catch (e) { console.error(e); out.querySelectorAll('button').forEach((b) => { b.disabled = false; }); toast('채우지 못했어요'); }
        };
        return el('li', {}, pick);
      }));
    } catch (e) { console.error(e); msg.textContent = '지금은 찾지 못했어요. 잠시 뒤 다시 눌러 주세요.'; }
    go.disabled = false;
  };
  return el('div', { className:'guess-box' }, go, hasText(w) ? null : el('small', { textContent:'메모 글이 없어 날짜와 저자 단서만 써요.' }), msg, out, el('small', { textContent:'누르면 메모의 낱말 몇 개와 저자만 앱스크립트를 거쳐 카카오 책 검색으로 가요.' }));
}
function reshow() {
  if (!$('sheet').open || !S.cur) return;
  if (S.cur.lib) openLib(S.cur.lib, $('sheet').returnEl); else openBook(S.cur.id, $('sheet').returnEl);
}
// 책 창 표지 그림(2026-11-14): 책을 열 때 중계(카카오 책 검색)로 그때그때 찾는다. 주소는 이 창이 열려 있는 동안 메모리에만 두고 저장하지 않는다(운영정책 제5조 제20호).
// 표지 색이 있는 책(= 도구가 표지를 찾은 책)만 찾는다. 못 찾거나 그림이 안 열리면 자리를 비운다
const COVER_URL = new Map(), COVER_ASK = new Map();
const coverNorm = (s) => String(s || '').replace(/\(.*?\)|\[.*?\]/g, '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
function findCover(w) {
  if (COVER_URL.has(w.id)) return Promise.resolve(COVER_URL.get(w.id));
  if (!COVER_ASK.has(w.id)) {
    const title = String(w.t || '').split(/\s+[-:]\s+|\s*:\s*/)[0].trim();
    const author = String(w.a || '').split('/')[0].split(/[,·]/)[0].replace(/\s+외$/, '').trim();
    const t = coverNorm(title), a = coverNorm(author);
    const ask = (q) => getJson(`${BOOK_RELAY}?q=${encodeURIComponent(q)}`, 12000).then((r) => (r.ok ? r.books || [] : [])).catch(() => []);
    const pick = (list) => { const ok = list.filter((x) => /^https:\/\//.test(x.cover || '')); const au = (x) => !a || coverNorm((x.authors || []).join()).includes(a);
      return ok.find((x) => coverNorm(x.title) === t && au(x)) || ok.find((x) => coverNorm(x.title).startsWith(t) && au(x)) || ok.find((x) => coverNorm(x.title) === t) || null; };
    COVER_ASK.set(w.id, (async () => {
      let m = pick(await ask(`${title} ${author}`.trim()));
      if (!m && author) m = pick(await ask(title));
      const url = m ? m.cover : ''; // 카카오 미리보기는 120×174. 크기를 주소로 바꾸면 허용된 크기만 열린다(240×348은 403, 2026-11-14 실측)라 받은 그대로 쓴다
      COVER_URL.set(w.id, url); COVER_ASK.delete(w.id);
      return url;
    })());
  }
  return COVER_ASK.get(w.id);
}
function coverImage(w) {
  // 방문자에게도 보여 준다(효니 2026-11-14 «방문자가 많을 거 같진 않은데»). 방문자도 중계 하루 상한 3,000건을 같이 쓴다
  if (!coverColors(w) || !relayOn() || !w.known) return null;
  const c = coverColors(w);
  const img = el('img', { className:'book-cover', alt:'', decoding:'async' });
  img.referrerPolicy = 'no-referrer';
  const box = el('div', { className:'book-cover-box wait' }, img);
  box.style.backgroundColor = c[0]; // 그림이 오기 전에는 책등 색 판
  box.setAttribute('aria-hidden', 'true'); // 제목·저자가 바로 아래 글자로 있다
  img.onload = () => box.classList.remove('wait');
  img.onerror = () => box.remove();
  findCover(w).then((url) => { if (url) img.src = url; else box.remove(); });
  return box;
}
// 왼쪽 면은 책 정보, 오른쪽 면은 글. 폰에서는 한 면으로 이어진다
function renderTome(w, item, from) {
  const close = el('button', { className:'close', type:'button', textContent:'×', ariaLabel:'닫기' });
  close.onclick = closeBook;
  const kindName = (KINDS.find((k) => k[0] === w.k) || [,''])[1];
  const rv = reviewsOf(w);
  const byline = [w.a, w.p, kindName === '책' ? '' : kindName].filter(Boolean).join(' · ');
  const cq = coverQuote(w);
  const cover = coverImage(w);
  const left = [el('div', { className:'title-page' }, cover, el('h2', { id:'sheet-title', textContent:titleOf(w) }), el('p', { className:'by', textContent:byline }),
    cq ? el('figure', { className:'cover-q' }, el('blockquote', { textContent:cq.q }), cq.where ? el('figcaption', { textContent:cq.where }) : null) : null)];
  if (isReading(w)) left.push(el('p', { className:'by', textContent:'읽는 중' }));
  if (w.th.length) left.push(el('div', { className:'title-tags' }, w.th.map((t) => { const s = el('span', { className:'tag', textContent:t }); s.style.background = themeVar(t); return s; })));
  if (w.guess && S.owner) left.push(el('p', { className:'warn', textContent:'제목과 저자는 메모 내용으로 추정한 것이에요. 틀렸으면 고쳐 주세요.' }));
  if (S.owner && !LOCAL && w.id && w.k === 'book' && !w.known && relayOn()) left.push(guessBox(w));
  const body = [];
  const rvBlog = rv.filter((p) => p.blog), rvIg = rv.filter((p) => !p.blog);
  if (rvBlog.length) body.push(el('h3', { className:'sec', textContent:`블로그 글 ${rvBlog.length}` }), rvBlog.map((p) => postBlock(p)));
  if (rvIg.length) body.push(el('h3', { className:'sec', textContent:`인스타 서평 ${rvIg.length}` }), rvIg.map((p) => postBlock(p, { ownerTools:true, inWork:w.id })));
  // 방문자에게는 공개본(public.json의 ms=[[본문, 날짜]])에 올라간 글만 보인다. 주인은 아래에서 자기 기록·메모를 그대로 본다
  if (!S.owner && (w.ms || []).length) body.push(el('h3', { className:'sec', textContent:`남긴 글 ${w.ms.length}` }), w.ms.map((x) => el('div', { className:'memo' }, x[1] ? el('div', { className:'when', textContent:x[1] }) : null, el('p', { className:'post-text', textContent:x[0] }))));
  if (!S.owner && !rvIg.length && !(w.ms || []).length) body.push(el('p', { className:'warn', textContent:w.k === 'film' ? '아직 쓴 감상이 없는 작품이에요.' : '아직 쓴 서평이 없는 책이에요.' }));
  let lib = null;
  if (S.owner) {
    lib = libBox(item, w);
    if (lib.box) left.push(lib.box);
    if (!LOCAL && w.id && isOnlyMe(w)) left.push(el('p', { className:'only-state' }, el('span', { className:'only-tag', textContent:'이 책 전체 나만 보기' }), el('small', { textContent:onlyMeText(w) })));
    if (!rv.length && !w.recs.length && !w.notes.length && !w.marks.length) {
      const kids = [el('p', { className:'warn', textContent:w.id ? '아직 남긴 글이 없어요.' : '아직 읽은 기록이 없어요.' })];
      if (!w.id) { const go = el('button', { className:'btn', type:'button', textContent:'읽고 기록 남기기' }); go.onclick = () => openBookForm(null, { pre:item }); kids.push(go); }
      body.push(el('div', { className:'blank-page' }, kids));
    }
    if (w.recs.length) {
      body.push(el('h3', { className:'sec' }, w.k === 'film' ? '내 감상 기록' : '내 독서 기록', baseOnlyTag()));
      w.recs.forEach((r, i) => {
        const score = r.r == null ? '' : starText(r.r);
        body.push(el('div', { className:'memo' },
          el('div', { className:'when' }, [r.d || '날짜 없음', r.st === 'unread' ? '읽는 중·미완독' : '', score].filter(Boolean).join(' · '), visTag(r.pub === true)),
          r.l ? el('p', { className:'line', textContent:r.l }) : null,
          r.b ? el('p', { className:'post-text', textContent:r.b }) : null,
          itemTools(w, { edit:() => openRecForm(w, i) })));
      });
    }
    if (w.marks.length) {
      body.push(el('h3', { className:'sec' }, `밑줄 ${w.marks.length}`, LOCAL ? null : el('span', { className:'only-tag', textContent:'문장은 기본 공개' })));
      marksInOrder(w).forEach((m) => body.push(markRow(w, m)));
    }
    if (w.notes.length) {
      body.push(el('h3', { className:'sec' }, `아이폰 메모 ${w.notes.length}`, baseOnlyTag()));
      w.notes.forEach((n, i) => body.push(el('div', { className:'memo' + (S.justMemo === `${w.id}:${i}` ? ' just' : '') },
        el('div', { className:'when' }, [n.d, n.v, n.g ? '내용으로 이 책에 연결함' : '', n.s === 'want' ? '읽고 싶음' : n.s === 'reading' ? '읽는 중' : ''].filter(Boolean).join(' · ') || '날짜 없음', visTag(n.pub === true)),
        n.b ? el('p', { className:'post-text', textContent:n.b }) : el('p', { className:'line none', textContent:n.l || '본문 없음' }),
        itemTools(w, { edit:() => openMemoForm(w, i) }))));
    }
    if (w.archived && w.archived.length) {
      const open = el('button', { className:'copy', type:'button', textContent:`보관한 메모 ${w.archived.length}` });
      open.onclick = () => openMemoBin(w.id);
      body.push(el('div', { className:'memo-foot' }, open));
    }
  }
  const share = el('button', { className:'copy', type:'button', textContent:w.k === 'film' ? '이 작품 링크 복사' : '이 책 링크 복사' });
  share.onclick = () => copy(`${location.origin}${location.pathname}#book/${encodeURIComponent(w.id)}`);
  if (S.owner && w.id) { // 위: 글 더하기(진한 단추), 아래: 책 고치기 · 더 보기(합치기·링크·서재). 2026-11-14 단추 정리(효니 선택)
    const addRec = el('button', { className:'btn', type:'button', textContent:'기록 더하기' });
    addRec.onclick = () => openRecForm(w, -1);
    const editBook = el('button', { className:'btn ghost', type:'button', textContent:'책 고치기' });
    editBook.onclick = () => openBookForm(w);
    const merge = el('button', { className:'copy', type:'button', textContent:'같은 책과 합치기' });
    merge.onclick = () => openMergePick(w);
    let addMark = null;
    if (w.k === 'book') { addMark = el('button', { className:'btn', type:'button', textContent:'밑줄 더하기' }); addMark.onclick = () => openMarkForm(w); }
    left.push(el('div', { className:'actions' }, addRec, addMark), el('div', { className:'actions sub' }, editBook, moreMenu([merge, w.pub ? share : null, ...lib.tools])));
  } else if (S.owner && lib.tools.length) left.push(el('div', { className:'actions sub' }, lib.tools)); // 서재에만 있는 책: 서재 단추는 그대로
  else if (w.pub) left.push(el('div', { className:'memo-foot share' }, share));
  // 표지: 앞면은 책등과 같은 색, 뒷면은 왼쪽 면과 같은 종이. 펼칠 때와 덮을 때만 보인다
  const flip = el('div', { className:'flip' },
    el('div', { className:'flip-front' }, el('strong', { textContent:titleOf(w) }), w.a ? el('span', { textContent:w.a }) : null, cq ? el('em', { className:'flip-q', textContent:cq.q }) : null),
    el('div', { className:'flip-back' }));
  flip.setAttribute('aria-hidden', 'true');
  const fc = coverColors(w), front = flip.firstChild, seen = COVER_URL.get(w.id);
  front.style.backgroundColor = fc ? fc[0] : themeVar(w.th[0]);
  if (fc) front.style.color = fc[1];
  if (seen) { front.classList.add('pic'); front.style.setProperty('--pic', `url("${seen}")`); } // 한 번 받은 표지는 펼칠 때 앞표지 그림으로
  const rightLeaf = el('div', { className:'leaf r', tabIndex:0 }, body.flat());
  rightLeaf.setAttribute('role', 'region');
  rightLeaf.setAttribute('aria-label', '서평과 기록');
  const tome = $('sheet-body');
  tome.replaceChildren(el('div', { className:'pages' }, el('div', { className:'leaf l' }, left), rightLeaf), close, flip);
  if (from || !$('sheet').open) $('sheet').returnEl = from;
  if (!$('sheet').open) {
    clearTimeout(tomeT);
    tome.classList.remove('closing', 'opening');
    $('sheet').showModal(); pushDlg('sheet');
    if (!calm()) { tome.classList.add('opening'); tomeT = setTimeout(() => tome.classList.remove('opening'), 760); }
  }
}
let tomeT;
function closeBook() {
  const s = $('sheet'), tome = $('sheet-body');
  if (!s.open || tome.classList.contains('closing')) return;
  if (calm()) { s.close(); return; }
  clearTimeout(tomeT);
  tome.classList.remove('opening');
  tome.classList.add('closing');
  tomeT = setTimeout(() => { if (s.open) s.close(); }, 320);
}
$('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) closeBook(); });
$('sheet').addEventListener('cancel', (e) => { e.preventDefault(); closeBook(); });
$('sheet').addEventListener('close', () => {
  clearTimeout(tomeT);
  $('sheet-body').classList.remove('closing', 'opening');
  let r = $('sheet').returnEl;
  if (r && !r.isConnected && r.dataset.lib) r = [...document.querySelectorAll('.lbook')].find((b) => b.dataset.lib === r.dataset.lib); // 저장으로 책장을 다시 그렸을 때
  if (r && r.isConnected) r.focus();
  popDlg('sheet');
});
// 창을 열 때 기록을 하나 쌓아, 폰의 뒤로 가기가 앱을 떠나지 않고 창만 닫게 한다
// 창을 닫을 때 쓰는 back이 브라우저의 옛 스크롤 위치로 되돌리지 않게 한다(부드럽게 스크롤한 직후 열면 위로 튀었다, 2026-11-07)
function pushDlg(id) { try { history.scrollRestoration = 'manual'; history.pushState({ dlg:id }, '', location.href); } catch (e) {} }
// 양식과 책 창이 한꺼번에 닫히면 앞의 back이 끝나기 전에 뒤의 창이 닫히므로, 진행 중인 back을 세어 함께 뺀다
let popping = 0;
function popDlg(id) { if (popping || (history.state && history.state.dlg === id)) { popping++; history.back(); } }
window.addEventListener('popstate', () => {
  const askOpen = document.querySelector('.ask-dlg');
  if (askOpen) askOpen.close(); // 뒤로 가기는 취소로 친다
  popping = Math.max(0, popping - 1);
  const top = history.state && history.state.dlg;
  if ($('form').open && top !== 'form') $('form').close();
  if ($('sheet').open && top !== 'form' && top !== 'sheet') closeBook();
  if (!top && location.hash.startsWith('#book/')) history.replaceState(null, '', location.pathname + location.search);
});

/* ---------- 서평 글 목록 ---------- */
const inKind = (p, k) => k === 'all' || (k === 'blog' ? !!p.blog : (p.k || 'etc') === k);
function postRows() {
  const rows = D.posts.filter((p) => inKind(p, S.pKind) && hasAll(p.hay, S.pq));
  return S.order === 'old' ? rows.reverse() : rows;
}
function renderPosts(reset) {
  queueJump();
  if (reset) S.pShown = PAGE;
  const count = (k) => D.posts.filter((p) => inKind(p, k)).length;
  $('postKinds').replaceChildren(...POST_KINDS.filter(([k]) => k !== 'blog' || count(k)).map(([k, label]) => {
    const b = el('button', { className:'chip', type:'button', textContent:`${label} ${count(k)}` });
    b.setAttribute('aria-pressed', S.pKind === k);
    b.onclick = () => { S.pKind = k; renderPosts(true); };
    return b;
  }));
  const rows = postRows();
  $('pcount').textContent = `${rows.length}개`;
  const shown = rows.slice(0, S.pShown);
  if (!shown.length) { $('posts').replaceChildren(el('div', { className:'empty' }, el('div', { textContent:'찾는 글이 없어요.' }))); $('postsMore').hidden = true; return; }
  $('posts').replaceChildren(...shown.map((p) => { const n = postBlock(p, { showBooks:true, ownerTools:!p.w.length }); n.classList.add('card', 'rise'); return jumpMark(n, p.d.slice(0, 7)); }));
  watch('.rise');
  $('postsMore').hidden = shown.length >= rows.length;
  if (shown.length < rows.length) {
    const more = el('button', { className:'btn ghost', type:'button', textContent:`더 보기 (${rows.length - shown.length}개 남음)` });
    more.onclick = () => { S.pShown += PAGE; renderPosts(); };
    $('postsMore').replaceChildren(more);
  }
}

/* ---------- 돌아보기 ---------- */
const doneRecs = (w) => w.recs.filter((r) => r.st !== 'unread');
const firstRead = (w) => doneRecs(w).map((r) => r.d).filter(Boolean).sort()[0] || '';
const readYear = (w) => { const d = firstRead(w); return d ? d.slice(0, 4) : (reviewsOf(w).length || w.pub ? w.y : ''); };
const ratedRows = (books) => books.flatMap((w) => doneRecs(w).filter((r) => r.r != null).map((r) => ({ w, d:r.d, r:r.r })));
const bookRows = (books) => books.map((w) => { const r = doneRecs(w).filter((x) => x.r != null).map((x) => x.r); return { w, d:firstRead(w) || w.md || w.fd, r:r.length ? r[r.length - 1] : null }; });
const meanOf = (rows) => (rows.length ? rows.reduce((a, x) => a + x.r, 0) / rows.length : 0);
const pct = (n, total) => (total ? Math.round(n / total * 100) : 0);
const ratingWord = (r) => (r === 0 ? '최하' : `${r}점`);
const firstAuthor = (w) => (w.a || '').split(/[\/,]/)[0].trim().replace(/\s+(외(\s*\d+\s*(명|인)?)?|지음|지은이|저자|저|글\s*[·,]?\s*그림|글그림|글|그림|옮김|엮음|편저|편)$/, '').trim();
const signed = (n) => (Math.abs(n) < .05 ? '0.0' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`);
const DRILL_PAGE = 20;

// 숫자를 누르면 그 자리 아래에 해당하는 책을 펼친다. 창을 겹치지 않아 책을 열고 닫아도 목록이 그대로 남는다
function fillDrill(slot, title, rows) {
  const dir = S.order === 'old' ? 1 : -1;
  const sorted = [...rows].sort((a, b) => (!a.d - !b.d) || dir * (a.d || '').localeCompare(b.d || ''));
  const shown = sorted.slice(0, S.drillN);
  const list = el('ul', { className:'drill-list' }, shown.map((x) => {
    const when = x.d && x.d.length >= 7 ? x.d.slice(0, 7).replace('-', '.') : (x.d || x.w.y || '');
    const b = el('button', { className:'drill-row', type:'button' }, el('span', { className:'drill-title', textContent:titleOf(x.w) }),
      el('span', { className:'drill-meta', textContent:[firstAuthor(x.w), when, x.r != null ? ratingWord(x.r) : ''].filter(Boolean).join(' · ') }));
    b.style.borderLeftColor = themeVar(x.w.th[0]);
    b.onclick = () => openBook(x.w.id, b);
    return el('li', {}, b, x.lines ? wordLines(x.lines, x.word) : null);
  }));
  const close = el('button', { className:'copy', type:'button', textContent:'접기' });
  close.onclick = () => closeDrill(true);
  const orders = el('div', { className:'drill-order', role:'group', ariaLabel:'목록 순서' }, ORDERS.map(([v, label]) => {
    const b = el('button', { className:'copy', type:'button', textContent:label });
    b.setAttribute('aria-pressed', S.order === v);
    b.onclick = () => { setOrder(v); fillDrill(slot, title, rows); };
    return b;
  }));
  const more = sorted.length > shown.length ? el('button', { className:'btn ghost', type:'button', textContent:`더 보기 (${sorted.length - shown.length}개 남음)` }) : null;
  if (more) more.onclick = () => { S.drillN += DRILL_PAGE; fillDrill(slot, title, rows); };
  slot.replaceChildren(el('div', { className:'drill-panel' },
    el('div', { className:'drill-head' }, el('strong', { textContent:`${title} ${rows.length}` }), orders, close), rows.top ? rows.top() : null, list, more));
}
function closeDrill(refocus) {
  const opened = '#recap [aria-expanded="true"]:not(.rfold-head)'; // 접는 카드 제목은 펼침 목록이 아니다
  const on = document.querySelector(opened);
  S.drill = '';
  document.querySelectorAll(opened).forEach((b) => b.setAttribute('aria-expanded', 'false'));
  document.querySelectorAll('#recap .drill-slot').forEach((s) => s.replaceChildren());
  if (refocus && on) on.focus();
  markNet($('wordMap'));
}
function drillable(btn, key, title, getRows, slot) {
  const own = slot || el('div', { className:'drill-slot' });
  const opened = S.drill === key;
  btn.setAttribute('aria-expanded', opened);
  btn.onclick = () => {
    const was = S.drill === key;
    closeDrill();
    if (was) return;
    S.drill = key; S.drillN = DRILL_PAGE;
    btn.setAttribute('aria-expanded', 'true');
    fillDrill(own, title, getRows());
    if (own.closest('.word-card')) scrollWordMap(own); else own.scrollIntoView({ block:'nearest', behavior:smooth() });
  };
  if (opened) fillDrill(own, title, getRows());
  return slot ? btn : [btn, own];
}
// 폰·눕힌 폰에서는 카드를 한 줄 결론으로 접고 한 번에 하나만 연다. 넓은 화면은 카드를 그대로 둔다
const FOLD_MQ = matchMedia('(max-width:767px), (max-height:500px)');
const folds = () => FOLD_MQ.matches;
FOLD_MQ.addEventListener('change', () => { if ($('recap').children.length) renderRecap(); });
function foldCard(key, line, card) {
  if (!folds()) return card;
  const [title, ...rest] = card.children, open = S.rOpen === key, bodyId = `rfold-${key}`;
  const btn = el('button', { className:'rfold-head', type:'button' },
    el('span', { className:'rfold-t' }, el('span', { className:'rfold-name' }, ...title.childNodes), line ? el('span', { className:'rfold-line', textContent:line }) : null),
    el('span', { className:'rfold-mark', ariaHidden:'true' }));
  btn.setAttribute('aria-expanded', open);
  btn.setAttribute('aria-controls', bodyId);
  btn.onclick = () => openRecapFold(key);
  const body = el('div', { className:'rfold-body', id:bodyId }, rest);
  body.hidden = !open;
  card.replaceChildren(el('h2', { className:'rfold-h' }, btn), body);
  card.classList.add('rfold');
  card.classList.toggle('open', open);
  card.dataset.fold = key;
  return card;
}
function openRecapFold(key) {
  const was = S.rOpen === key;
  closeDrill();
  S.rOpen = was ? '' : key;
  document.querySelectorAll('#recap .rfold').forEach((c) => {
    const on = c.dataset.fold === S.rOpen;
    c.classList.toggle('open', on);
    c.querySelector('.rfold-head').setAttribute('aria-expanded', on);
    c.querySelector('.rfold-body').hidden = !on;
    if (!on) return;
    const map = c.querySelector('#wordMap');
    if (map) { if (map.dataset.pending) drawWordMap(map); else placeNet(map); } // 숨어 있으면 칩 크기를 못 재므로 열 때 그린다
    c.scrollIntoView({ block:'start', behavior:smooth() }); // 위 카드가 닫혀 올라가도 연 카드 제목이 화면에 남게
  });
}
// 접은 화면에서 긴 목록은 앞(과 끝)만 보여 주고 가운데를 단추 뒤에 둔다
function shortList(key, items, keep, tail = 0) {
  if (!folds() || S.rMore.includes(key) || items.length <= keep + tail + 1) return items;
  const mid = items.slice(keep, items.length - tail);
  const more = el('button', { className:'copy rfold-more', type:'button', textContent:`나머지 ${mid.length}개 보기` });
  more.onclick = () => {
    S.rMore.push(key);
    const nodes = mid.flat(Infinity);
    more.replaceWith(...nodes);
    nodes[0].focus({ preventScroll:true });
  };
  return [items.slice(0, keep), more, tail ? items.slice(-tail) : []];
}

/* 독서 성향 문장: 효니가 서평에 쓰는 말투(다 평서체, 괄호 방백, ㅎㅎ). 날마다, 그리고 «다른 말로»를 누를 때마다 바뀐다. 문장마다 실제 숫자에서 나온 조건을 건다 */
const hasJong = (s) => { const c = s.charCodeAt(s.length - 1) - 0xAC00; return c >= 0 && c <= 11171 && c % 28 > 0; };
const josa = (s, a, b) => s + (hasJong(s) ? a : b);
const THEME_VOICE = {
  '소설':['남의 인생 구경을 못 참는 사람', '이야기에 약한 사람', '퇴근하면 딴 세상으로 도망치는 사람'],
  '에세이':['남의 하루가 제일 재밌는 사람', '남의 일기장 앞에서 오래 머무는 사람'],
  '역사':['책에서도 교실을 못 벗어난 역사 선생님', '퇴근해도 옛날로 돌아가는 사람', '지난 일을 또 따져 묻는 사람'],
  '청소년·그림책':['아이들 책장을 먼저 훑는 선생님', '그림책 앞에서 오래 서 있는 어른'],
  '사회·정치':['세상 돌아가는 꼴을 책으로 따지는 사람', '뉴스 보다 말고 책을 펴는 사람'],
  '과학·환경':['모르는 세계 앞에서 신나는 문과생(?)', '지구 걱정을 책으로 하는 사람'],
  '여성':['여자들 이야기를 찾아 읽는 사람', '지워진 이름을 찾아 읽는 사람'],
  '철학':['답 없는 질문을 사서 붙드는 사람', '왜냐고 묻다 밤을 새우는 사람'],
  '인문':['이것저것 왜냐고 묻는 사람', '궁금한 게 많아 피곤한 사람(?)'],
  '심리':['남의 마음도 내 마음도 궁금한 사람', '내 마음부터 들여다보는 사람'],
  '예술':['그림 보러 책을 펴는 사람', '책으로 전시장을 도는 사람'],
  '시':['짧은 말에 오래 붙들리는 사람', '한 줄 앞에서 멈춰 서는 사람'],
  '사랑·관계':['사람 사이가 제일 어렵고 재밌는 사람', '남의 연애에 진심인 사람'],
  '경제·자기계발':['가끔 정신 차리려고 책을 펴는 사람', '돈 공부도 책으로 하는 사람'],
  'SF·판타지':['지구 밖까지 나가 보는 사람', '없는 세계에서 더 잘 노는 사람'],
  '법':['법 앞에서 더 파고드는 사람', '조문 사이를 뒤지는 사람'],
  '일·노동':['일하는 사람 이야기에 오래 머무는 사람', '남의 일터가 궁금한 사람'],
  '죽음·상실':['잃는 이야기를 피하지 않는 사람', '끝에 대해 자꾸 읽는 사람'],
  '교육':['퇴근해도 교실 생각을 못 끄는 선생님', '남의 교실이 궁금한 선생님'],
  '여행':['책으로 먼저 떠나는 사람', '가방보다 책부터 싸는 사람'],
};
function readerVoice({ ts, books, rated, avg, sd, authors, reviewed, again, bestM, ry, prevN, seed }) {
  const mix = (s) => { let h = hash(s); h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); h = Math.imul(h ^ (h >>> 15), 0x2d2c9f47); return (h ^ (h >>> 16)) >>> 0; }; // 칸마다 따로 움직이게 섞는다(그냥 hash면 앞말과 뒷말이 같이 돌아 조합이 몇 개 안 나온다)
  const pick = (arr, tag) => arr[mix(`${seed}|${tag}`) % arr.length];
  if (books.length < 10) return { headline:books.length ? `${books.length}권. 성향을 따지기엔 아직 적다.` : '', lines:[] };
  if (!ts.length) return { headline:'', lines:[] };
  const main = (ts.find(([t]) => t !== '기타') || ts[0])[0], top = ts[0][0], p = pct(ts[0][1], books.length), share = ts[0][1] / books.length;
  const noun = pick(THEME_VOICE[main] || [`${main} 칸부터 들르는 사람`], 'noun');
  const shownAvg = +avg.toFixed(1), enough = rated.length >= 10;
  const breadth = share >= .5 ? ['한 칸이 유독 닳은', '옆 칸은 잘 안 보는'] : ts.length >= 8 ? ['온 서가를 떠돌아도 결국', '이것저것 손대 봐도 결국', '책장 앞에서 길을 잃어도 결국'] : ['자주 가는 칸이 정해진', '늘 가던 칸으로 돌아가는'];
  const rate = sd >= .9 ? ['좋고 싫음을 별로 다 말하면서', '별점으로 할 말 다 하면서'] : shownAvg < 3.2 ? ['별은 짜게 주면서', '별 하나도 쉽게 안 주면서', '3점도 아껴 주면서'] : shownAvg < 3.8 ? ['별점은 덤덤하게 주면서', '호들갑 없이 별을 주면서'] : ['좋으면 별부터 주면서', '별을 후하게 뿌리면서'];
  const lead = pick(enough ? [...rate, ...breadth] : breadth, 'lead');
  const first = ts.length > 1 ? pick([
    `${josa(top, '이', '가')} ${p}%로 1위다. 다음은 ${ts[1][0]}(${pct(ts[1][1], books.length)}%).`,
    `제일 많이 펼친 건 ${top}(${p}%), 그다음이 ${ts[1][0]}(${pct(ts[1][1], books.length)}%)다.`,
    ...(ts.length >= 8 && share < .5 ? [`주제만 ${ts.length}개를 돌았다. ${josa(top, '이', '가')} ${p}%로 그나마 제일 많다.`] : []),
    ...(share >= .4 ? [`${top} ${p}%. 솔직히 편식이 맞다 ㅎㅎ`] : []),
  ], 'first') : `${top}만 읽었다. 이 정도면 전공이다(?)`;
  const facts = [];
  if (enough) {
    const hi = pct(rated.filter((x) => x.r >= 4.5).length, rated.length), lo = pct(rated.filter((x) => x.r <= 2).length, rated.length);
    facts.push(pick([`평균 ${avg.toFixed(1)}점. 4.5점 이상은 ${hi}%${hi < 15 && shownAvg < 3.8 ? '뿐이다' : '다'}.`, ...(lo >= 10 ? [`평균 ${avg.toFixed(1)}점. 2점 이하도 ${lo}%나 줬다. 할 말은 한다 ㅎㅎ`] : shownAvg >= 3.2 ? [`평균 ${avg.toFixed(1)}점. 2점 이하는 ${lo}%뿐이다. 나쁜 말은 잘 안 한다.`] : [])], 'rate'));
    if (sd >= .9) facts.push('점수 폭이 넓다. 좋으면 좋고 아니면 아니다.');
    else if (sd < .6) facts.push('점수가 한곳에 몰린다. 웬만해선 안 흔들린다.');
  }
  const authorList = [...authors.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ko'));
  if (authorList.length) {
    const [a, x] = authorList[0], repeat = pct(authorList.filter(([, v]) => v.length > 1).flatMap(([, v]) => v).length, books.length);
    if (x.length >= 3) facts.push(pick([`${a} 책이 ${x.length}권이다. 이쯤이면 따라 읽는 사이다.`, `제일 많이 읽은 저자는 ${a}(${x.length}권). 한 권으로 안 끝났다.`], 'author'));
    facts.push(repeat < 25 ? `두 권 이상 읽은 저자의 책은 ${repeat}%뿐이다. 한 저자에 오래 안 머문다.` : `두 권 이상 읽은 저자의 책이 ${repeat}%다. 또 찾아 읽는 저자가 있다.`);
  }
  if (!LOCAL) {
    const rv = pct(reviewed, books.length);
    facts.push(rv >= 40 ? pick([`읽은 책의 ${rv}%에 서평을 썼다. 읽고 그냥 못 넘어간다.`, `${rv}%는 서평까지 남겼다. 할 말이 많다 ㅎㅎ`], 'review') : `서평을 쓴 건 ${rv}%다. 나머지는 마음속에만 있다 ㅎㅎ`);
  }
  if (again >= 3) facts.push(`같은 책을 다시 편 게 ${again}권이다. 한 번으로 안 끝났다.`);
  if (bestM) facts.push(['01', '02', '07', '08'].includes(bestM) ? `${+bestM}월에 제일 많이 읽었다. 역시 방학이 있어야 읽는다 ㅎㅎ` : `${+bestM}월에 제일 많이 읽었다. 학기 중인데 어떻게 읽었는지 나도 모르겠다(?)`);
  if (ry && prevN && ry !== today().slice(0, 4)) { const d = books.length - prevN; if (d) facts.push(d > 0 ? `${+ry - 1}년보다 ${d}권 더 읽었다.` : `${+ry - 1}년보다 ${-d}권 덜 읽었다. 바빴다고 해 두자.`); }
  const order = facts.map((t, i) => [mix(`${seed}|f${i}`), t]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  return { headline:`${lead} ${noun}`, lines:[first, ...order.slice(0, 2)] };
}
function setPeriod(y) {
  S.ry = y; S.drill = '';
  renderRecap();
  const b = $('recap').querySelector(`[data-period="${y}"]`);
  if (b) b.focus({ preventScroll:true });
}
function renderRecap() {
  const box = $('recap'), redraw = S.view === 'recap' && box.children.length > 0, allBooks = list().filter((w) => w.k === 'book' && w.known && !isReading(w)); // 제목 확인 안 된 칸은 책장 권수처럼 뺀다
  if (LOCAL && !allBooks.length) { box.replaceChildren(el('div', { className:'empty span2' }, el('div', { textContent:'책을 꽂으면 해마다 읽은 책과 내 독서 성향을 모아 보여 줄게요.' }))); return; }
  const yc = {};
  allBooks.forEach((w) => { const y = readYear(w); if (y) yc[y] = (yc[y] || 0) + 1; });
  const ys = Object.keys(yc).sort(), maxY = Math.max(1, ...Object.values(yc)), topY = ys.find((y) => yc[y] === maxY);
  const noYear = allBooks.length - Object.values(yc).reduce((a, b) => a + b, 0);
  const ry = yc[S.ry] ? S.ry : '';
  const books = ry ? allBooks.filter((w) => readYear(w) === ry) : allBooks;
  const when = ry ? `${ry}년` : '지금까지';
  const head = (text, only) => el('h2', {}, text, only ? ' ' : null, only ? privateTag() : null);
  const sec = (text) => el('h3', { className:'recap-sec', textContent:text });
  const hbar = (label, n, max, color, onclick, shown) => { const fill = el('div', { className:'fill' }); fill.style.width = `${n / max * 100}%`; fill.style.background = color;
    const b = el('button', { className:'hbar', type:'button' }, el('span', { textContent:label, title:label }), el('div', { className:'track' }, fill), el('span', { className:'n', textContent:shown || n }));
    if (onclick) b.onclick = onclick; return b; };

  const period = el('div', { className:'row span2', role:'group', ariaLabel:'돌아볼 기간' }, [['', '전체'], ...[...ys].reverse().map((y) => [y, y])].map(([y, label]) => {
    const b = el('button', { className:'chip', type:'button', textContent:label });
    b.dataset.period = y;
    b.setAttribute('aria-pressed', ry === y);
    b.onclick = () => setPeriod(y);
    return b;
  }));

  /* 성향 */
  const rated = S.owner ? ratedRows(books) : [];
  const avg = meanOf(rated);
  const sd = rated.length ? Math.sqrt(rated.reduce((a, x) => a + (x.r - avg) ** 2, 0) / rated.length) : 0;
  const tc = {};
  books.forEach((w) => w.th.forEach((t) => { tc[t] = (tc[t] || 0) + 1; }));
  const ts = Object.entries(tc).sort((a, b) => b[1] - a[1]);
  const authorBooks = new Map();
  books.forEach((w) => { const a = firstAuthor(w); if (!a) return; if (!authorBooks.has(a)) authorBooks.set(a, []); authorBooks.get(a).push(w); });
  const reviewedBooks = books.filter((w) => reviewsOf(w).some((p) => !p.blog));
  const againBooks = books.filter((w) => new Set(doneRecs(w).map((r) => r.d).filter(Boolean)).size > 1);
  const rc = {};
  rated.forEach((x) => { rc[x.r] = (rc[x.r] || 0) + 1; });
  const oftenR = RATING_STEPS.filter((r) => rc[r]).sort((a, b) => rc[b] - rc[a])[0];
  const dated = S.owner ? books.map((w) => [w, firstRead(w).slice(0, 7)]).filter(([, m]) => m.length === 7) : [];
  const byCalMonth = {};
  dated.forEach(([, m]) => { byCalMonth[m.slice(5)] = (byCalMonth[m.slice(5)] || 0) + 1; });
  const best = Object.keys(byCalMonth).sort((a, b) => byCalMonth[b] - byCalMonth[a])[0];
  let lines = [];
  let headline = '';
  if (!LOCAL) {
    const said = readerVoice({ ts, books, rated, avg, sd, authors:authorBooks, reviewed:reviewedBooks.length, again:S.owner ? againBooks.length : 0, bestM:dated.length >= 10 ? best : '', ry, prevN:ry ? yc[+ry - 1] : 0, seed:`${ry}|${today()}|${S.voice}` });
    headline = said.headline; lines = said.lines;
  } else if (books.length >= 10 && ts.length) {
    const share = ts[0][1] / books.length;
    const shownAvg = +avg.toFixed(1); // 화면에 보이는 평균과 같은 값으로 가른다
    const rateWord = rated.length < 10 ? '' : shownAvg < 3.2 ? '별점이 깐깐하고' : shownAvg < 3.8 ? '별점을 고르게 주고' : '별점이 후하고';
    const body = share >= .5 ? `${ts[0][0]} 위주로 읽는 독자` : ts.length >= 8 ? `두루 읽는 ${ts[0][0]} 독자` : `몇몇 주제를 오가는 ${ts[0][0]} 독자`;
    headline = [rateWord, body].filter(Boolean).join(' ');
    const top3 = ts.slice(0, 3).map(([t]) => t);
    lines.push(`가장 많이 읽은 주제는 ${ts[0][0]}(${pct(ts[0][1], books.length)}%)${top3.length > 1 ? `이고, 위 ${top3.length}개 주제를 합치면 책의 ${pct(books.filter((w) => w.th.some((t) => top3.includes(t))).length, books.length)}%` : ''}예요.`);
    if (rated.length >= 10) {
      lines.push(`평균 ${avg.toFixed(1)}점. 4.5점 이상은 ${pct(rated.filter((x) => x.r >= 4.5).length, rated.length)}%, 2점 이하는 ${pct(rated.filter((x) => x.r <= 2).length, rated.length)}%예요.`);
      if (sd >= .9) lines.push('점수 폭이 넓어서 좋고 싫음이 뚜렷한 편이에요.');
      else if (sd < .6) lines.push('점수가 한곳에 모이는 편이에요.');
    }
    const repeat = [...authorBooks.values()].filter((x) => x.length > 1).flat().length;
    lines.push(`2권 이상 읽은 저자의 책이 ${pct(repeat, books.length)}%예요.`);
    if (!LOCAL) lines.push(`읽은 책의 ${pct(reviewedBooks.length, books.length)}%에 서평을 썼어요.`);
  }
  const tileSlot = el('div', { className:'drill-slot' });
  const tile = (label, value, key, title, getRows) => {
    const b = el('button', { className:'tile', type:'button' }, el('span', { className:'tile-n', textContent:value }), el('span', { className:'tile-l', textContent:label }));
    if (!getRows().length) { b.disabled = true; return b; }
    return drillable(b, key, title, getRows, tileSlot);
  };
  const tiles = [tile('읽은 책', `${books.length}권`, 't:all', `${when} 읽은 책`, () => bookRows(books))];
  if (rated.length) {
    tiles.push(tile('평균 별점', `${avg.toFixed(1)}점`, 't:rated', '별점을 남긴 기록', () => rated));
    tiles.push(tile('자주 준 별점', ratingWord(oftenR), 't:often', `${ratingWord(oftenR)} 준 기록`, () => rated.filter((x) => x.r === oftenR)));
  }
  if (!LOCAL) tiles.push(tile('서평 쓴 책', `${reviewedBooks.length}권`, 't:rev', '서평 쓴 책', () => bookRows(reviewedBooks)));
  tiles.push(tile('만난 저자', `${authorBooks.size}명`, 't:authors', '저자를 아는 책', () => bookRows([...authorBooks.values()].flat())));
  if (S.owner) tiles.push(tile('다시 읽은 책', `${againBooks.length}권`, 't:again', '다시 읽은 책', () => bookRows(againBooks)));
  const voiceBtn = el('button', { className:'copy voice-btn', type:'button', textContent:'다른 말로' });
  voiceBtn.dataset.voice = '1';
  voiceBtn.onclick = () => {
    S.voice += 1;
    renderRecap();
    const again = $('recap').querySelector('[data-voice]');
    if (again) again.focus({ preventScroll:true });
    const card = $('recap').querySelector('.profile');
    if (card) card.classList.add('voiced');
  };
  const profile = el('div', { className:'card span2 profile' }, el('p', { className:'profile-when', textContent:`${when}의 독서 성향` }),
    headline ? el('h2', { className:'profile-head', textContent:headline }) : null,
    lines.length ? el('ul', { className:'profile-lines' }, lines.map((t) => el('li', { textContent:t }))) : null,
    !LOCAL && books.length >= 10 ? voiceBtn : null,
    el('div', { className:'tiles' }, tiles), tileSlot);

  /* 기록으로 고르는 다음 할 일: 접지 않고 성향 바로 아래 둔다 */
  let actsCard = null;
  if (S.owner && rated.length) {
    const ownedIds = new Set(D.lib.filter((it) => it.st === 'own' && it.w).map((it) => it.w));
    const bestOf = (w) => Math.max(...doneRecs(w).filter((r) => r.r != null).map((r) => r.r), -1);
    const high = books.filter((w) => bestOf(w) >= 4.5), low = books.filter((w) => bestOf(w) >= 0 && bestOf(w) <= 2);
    const daysAgo = (n) => new Date(Date.now() + 9 * 3600e3 - n * 864e5).toISOString().slice(0, 10);
    const threeYearsAgo = daysAgo(1096), halfYearAgo = daysAgo(182);
    const lastTouch = (w) => [...w.recs.map((r) => r.d), ...w.notes.map((n) => n.d), ...(w.marks || []).map((m) => m.d), w.fd].filter((d) => d && d.length >= 7).sort().pop() || ''; // 연도만 적힌 날짜는 언제인지 몰라 뺀다
    const acts = [
      D.lib.length ? ['소장하면 좋을 책', '4.5점 이상 줬는데 서재에 없어요', high.filter((w) => !ownedIds.has(w.id))] : null,
      D.lib.length ? ['서재에서 정리해도 될 책', '서재에 있는데 2점 이하를 줬어요', low.filter((w) => ownedIds.has(w.id))] : null,
      LOCAL ? null : ['서평으로 남겨 볼 책', '4.5점 이상 줬는데 서평이 없어요', high.filter((w) => !reviewsOf(w).length)],
      ['다시 읽어 볼 책', '4.5점 이상 줬고 3년 넘게 안 펼쳤어요', high.filter((w) => { const ds = new Set(doneRecs(w).map((r) => r.d).filter(Boolean)); return ds.size === 1 && lastTouch(w) && lastTouch(w) < threeYearsAgo; })],
      ry ? null : ['읽다 멈춘 책', '읽는 중인데 반년 넘게 기록이 없어요', list().filter((w) => w.k === 'book' && w.known && isReading(w) && lastTouch(w) && lastTouch(w) < halfYearAgo)],
    ].filter((x) => x && x[2].length);
    if (acts.length) actsCard = el('div', { className:'card span2 acts-card' }, head('기록으로 고르는 다음 할 일', true), el('p', { className:'sub', textContent:'별점과 서재, 서평을 함께 봤어요' }),
      el('div', { className:'act-list' }, acts.map(([label, hint, rows]) => drillable(el('button', { className:'act', type:'button' }, el('span', { className:'act-t' }, el('strong', { textContent:label }), el('small', { textContent:hint })), el('span', { className:'n', textContent:`${rows.length}권` })), `x:${label}`, label, () => bookRows(rows)))));
  }

  /* 해마다 */
  const yearCard = foldCard('years', topY ? `최다 ${topY}년 ${maxY}권` : '', el('div', { className:'card span2' }, head('해마다 읽은 책'), el('p', { className:'sub', textContent:topY ? `${topY}년에 ${maxY}권으로 가장 많이 읽었어요. 막대를 누르면 그해만 돌아봐요${noYear ? `. 읽은 해를 모르는 ${noYear}권은 막대에서 빠져요` : ''}` : '' }),
    el('div', { className:'years' }, ys.map((y) => { const bar = el('div', { className:'ybar' }); bar.style.height = `${yc[y] / maxY * 100}%`; bar.style.flex = '0 0 auto';
      const col = el('button', { className:'ycol' + ((ry ? y === ry : y === topY) ? ' top' : ''), type:'button' }, el('span', { className:'yval', textContent:yc[y] }), bar);
      col.setAttribute('aria-label', `${y}년 ${yc[y]}권, 이 해만 돌아보기`);
      col.setAttribute('aria-pressed', ry === y);
      col.onclick = () => setPeriod(ry === y ? '' : y);
      return col; })),
    el('div', { className:'ylabels' }, ys.map((y) => el('span', { textContent:"'" + y.slice(2) })))));

  /* 달력 */
  const cards = [period, profile, actsCard, yearCard];
  if (S.owner) {
    if (dated.length) {
      const mc = {};
      dated.forEach(([, m]) => { mc[m] = (mc[m] || 0) + 1; });
      const maxM = Math.max(...Object.values(mc));
      const rowYs = [...new Set(Object.keys(mc).map((m) => m.slice(0, 4)))].sort().reverse();
      // 빈 달 없이 이어 읽은 가장 긴 때
      const seq = Object.keys(mc).sort();
      const idx = (m) => +m.slice(0, 4) * 12 + +m.slice(5);
      let run = [seq[0], seq[0], 1], cur = [seq[0], seq[0], 1];
      seq.slice(1).forEach((m, i) => { cur = idx(m) === idx(seq[i]) + 1 ? [cur[0], m, cur[2] + 1] : [m, m, 1]; if (cur[2] > run[2]) run = cur; });
      const slot = el('div', { className:'drill-slot' });
      const cell = (y, mm) => {
        const key = `${y}-${mm}`, n = mc[key] || 0;
        if (!n) return el('span', { className:'hcell empty-cell', ariaHidden:'true' });
        const mix = [12, 20, 30, 72, 88][Math.min(4, Math.floor(n / maxM * 5))]; // 밝은 판·어두운 판 모두 글자 대비 4.5가 안 나오는 중간 농도(31~71)는 쓰지 않는다
        const b = el('button', { className:'hcell' + (mix > 50 ? ' deep' : ''), type:'button', textContent:n, title:`${y}년 ${+mm}월 ${n}권` });
        b.style.background = `color-mix(in srgb, var(--accent) ${mix}%, var(--surface))`;
        b.setAttribute('aria-label', `${y}년 ${+mm}월 ${n}권`);
        return drillable(b, `m:${key}`, `${y}년 ${+mm}월에 읽은 책`, () => bookRows(dated.filter(([, m]) => m === key).map(([w]) => w)), slot);
      };
      const months = Array.from({ length:12 }, (_, i) => String(i + 1).padStart(2, '0'));
      const fmt = (m) => m.replace('-', '.');
      const runText = run[2] > 1 ? ` 가장 오래 이어 읽은 때는 ${fmt(run[0])}~${fmt(run[1])}, ${run[2]}개월이에요.` : '';
      cards.push(foldCard('cal', `가장 많이 읽은 달 ${+best}월`, el('div', { className:'card span2' }, head('달력으로 보는 독서', true),
        el('p', { className:'sub', textContent:`${+best}월에 가장 많이 읽었어요.${ry ? '' : runText} 날짜가 남은 ${dated.length}권 기준이에요` }),
        el('div', { className:'heat' }, el('span', { className:'heat-corner' }), months.map((mm) => el('span', { className:'heat-m', textContent:+mm })),
          rowYs.flatMap((y) => [el('span', { className:'heat-y', textContent:"'" + y.slice(2) }), ...months.map((mm) => cell(y, mm))])), slot)));
    }

    /* 이맘때: 지난해들의 이번 달 */
    if (!ry) {
      const nowY = today().slice(0, 4), nowM = today().slice(5, 7), past = {};
      dated.forEach(([w, m]) => { if (m.slice(5) === nowM && m.slice(0, 4) < nowY) (past[m.slice(0, 4)] = past[m.slice(0, 4)] || []).push(w); });
      const pastYs = Object.keys(past).sort().reverse();
      if (pastYs.length) {
        const slot = el('div', { className:'drill-slot' });
        cards.push(foldCard('then', `${+pastYs[0] === +nowY - 1 ? '작년' : `${pastYs[0]}년`} ${+nowM}월 ${past[pastYs[0]].length}권`, el('div', { className:'card span2' }, head('이맘때 읽은 책', true),
          el('p', { className:'sub', textContent:`지난해들의 ${+nowM}월에 읽은 책이에요. 누르면 그 책이 나와요` }),
          el('div', { className:'again' }, pastYs.map((y) => drillable(el('button', { className:'chip', type:'button', textContent:`${y}년 ${past[y].length}권` }), `n:${y}`, `${y}년 ${+nowM}월에 읽은 책`, () => bookRows(past[y]), slot))), slot)));
      }
    }

    cards.push(foldCard('word', '내 글에 자주 나온 말과 이어진 말', el('div', { className:'card span2' }, head('낱말 지도', true), wordCard(ry))));

    /* 별점 */
    if (rated.length) {
      const maxR = Math.max(1, ...Object.values(rc));
      const avgByYear = ry ? [] : ys.map((y) => [y, ratedRows(allBooks.filter((w) => readYear(w) === y))]).filter(([, rows]) => rows.length >= 5);
      cards.push(foldCard('rate', `평균 ${avg.toFixed(1)}점 · 최다 ${ratingWord(oftenR)}`, el('div', { className:'card' }, head('별점', true), el('p', { className:'sub', textContent:`별점을 남긴 ${rated.length}건, 평균 ${avg.toFixed(1)}점. 누르면 그 책이 나와요` }),
        RATING_STEPS.filter((r) => rc[r]).map((r) => drillable(hbar(ratingWord(r), rc[r], maxR, 'var(--bar)'), `r:${r}`, `${ratingWord(r)} 준 기록`, () => rated.filter((x) => x.r === r))),
        avgByYear.length > 1 ? sec('해마다 평균 별점') : null,
        avgByYear.length > 1 ? shortList('rateY', (folds() ? [...avgByYear].reverse() : avgByYear).map(([y, rows]) => hbar(y, meanOf(rows), 5, 'var(--bar)', () => setPeriod(y), meanOf(rows).toFixed(1))), 3) : null)));
      const need = ry ? 3 : 5;
      const taste = ts.map(([t]) => { const rows = rated.filter((x) => x.w.th.includes(t)); return { t, rows, delta:meanOf(rows) - avg }; }).filter((x) => x.rows.length >= need).sort((a, b) => b.delta - a.delta);
      if (taste.length > 1) {
        const maxD = Math.max(.1, ...taste.map((x) => Math.abs(x.delta)));
        const hiT = taste[0], loT = taste[taste.length - 1];
        cards.push(foldCard('taste', `${hiT.t} ${signed(hiT.delta)}, ${loT.t} ${signed(loT.delta)}`, el('div', { className:'card' }, head('높게 주는 주제, 낮게 주는 주제', true),
          el('p', { className:'sub', textContent:`내 평균 ${avg.toFixed(1)}점보다 얼마나 높거나 낮은지예요. 별점 ${need}건 이상인 주제만 봐요` }),
          shortList('taste', taste.map((x) => {
            const fill = el('i', { className:'dfill ' + (x.delta >= 0 ? 'up' : 'down') });
            fill.style.width = `${Math.abs(x.delta) / maxD * 50}%`;
            const b = el('button', { className:'dbar', type:'button' }, el('span', { textContent:x.t }), el('span', { className:'dtrack' }, fill), el('span', { className:'n', textContent:signed(x.delta) }));
            b.setAttribute('aria-label', `${x.t}, 평균 ${meanOf(x.rows).toFixed(1)}점, 내 평균보다 ${signed(x.delta)}, ${x.rows.length}건`);
            b.title = `평균 ${meanOf(x.rows).toFixed(1)}점 · ${x.rows.length}건`;
            return drillable(b, `d:${x.t}`, `${x.t}에 준 별점`, () => x.rows);
          }), 3, 3))));
      }
    }
  }

  /* 주제 */
  const themeCard = ts.length ? foldCard('themes', `최다 ${ts[0][0]} ${ts[0][1]}권`, el('div', { className:'card' }, head('주제별 책'), el('p', { className:'sub', textContent:ry ? `${ry}년에 읽은 책의 주제예요. 누르면 그 책이 나와요` : '누르면 책장에서 그 주제만 보여요' }),
    shortList('themes', ts.map(([t, n]) => {
      if (ry) return drillable(hbar(t, n, ts[0][1], themeVar(t)), `th:${t}`, `${ry}년 ${t}`, () => bookRows(books.filter((w) => w.th.includes(t))));
      return hbar(t, n, ts[0][1], themeVar(t), () => { Object.assign(S, { kind:'book', theme:t, q:'', hideUnknown:true, onlyIg:false }); $('q').value = ''; show('shelf'); renderShelf(); scrollTo(0, 0); });
    }), 6))) : null;
  cards.push(themeCard);

  /* 저자 */
  const authors = [...authorBooks.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ko'));
  const shownAuthors = authors.filter(([, x]) => x.length > 1).slice(0, 10);
  if (authors.length) {
    const list2 = shownAuthors.length ? shownAuthors : authors.slice(0, 5);
    const trust = rated.length ? authors.map(([a, x]) => { const rows = ratedRows(x); return { a, rows, m:meanOf(rows) }; }).filter((x) => x.rows.length >= 2 && x.m >= Math.max(3.5, avg + .5)).sort((a, b) => b.m - a.m || b.rows.length - a.rows.length).slice(0, 8) : [];
    const trustSlot = el('div', { className:'drill-slot' });
    cards.push(foldCard('authors', list2[0][1].length > 1 ? `최다 ${list2[0][0]} ${list2[0][1].length}권` : `저자 ${authors.length}명`, el('div', { className:'card' }, head('많이 읽은 저자'), el('p', { className:'sub', textContent:`저자 ${authors.length}명 중 2권 이상 읽은 저자는 ${authors.filter(([, x]) => x.length > 1).length}명이에요` }),
      shortList('authors', list2.map(([a, x]) => drillable(hbar(a, x.length, list2[0][1].length, 'var(--bar)'), `a:${a}`, `${a}의 책`, () => bookRows(x))), 5),
      trust.length ? el('h3', { className:'recap-sec' }, '믿고 읽는 저자 ', privateTag()) : null,
      trust.length ? el('div', { className:'again' }, trust.map((x) => drillable(el('button', { className:'chip', type:'button', textContent:`${x.a} ${x.m.toFixed(1)}` }), `ta:${x.a}`, `${x.a}에게 준 별점`, () => x.rows, trustSlot))) : null,
      trust.length ? trustSlot : null)));
  }

  /* 주제 변화 */
  if (!ry && ys.length > 1) {
    const topOfYear = (y) => { const c = {}; allBooks.filter((w) => readYear(w) === y).forEach((w) => w.th.forEach((t) => { c[t] = (c[t] || 0) + 1; })); return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3); };
    const newest = ys[ys.length - 1], newestTop = topOfYear(newest)[0];
    cards.push(foldCard('shift', newestTop ? `${newest}년 최다 ${newestTop[0]}` : '', el('div', { className:'card' }, head('해마다 많이 읽은 주제'), el('p', { className:'sub', textContent:'그해에 가장 많이 읽은 주제 세 개예요' }),
      el('table', { className:'ytable' }, el('tbody', {}, [...ys].reverse().map((y) => el('tr', {}, el('th', { scope:'row', textContent:y }), el('td', {}, topOfYear(y).map(([t, n]) => { const g = el('span', { className:'tag' }, `${t} `, el('b', { textContent:n })); g.style.background = themeVar(t); return g; })))))))));
  }

  /* 서평 */
  if (!LOCAL && !ry) {
    const pc = {};
    D.posts.filter((p) => p.k === 'review' && !p.blog).forEach((p) => { const y = p.d.slice(0, 4); pc[y] = (pc[y] || 0) + 1; });
    const pys = Object.keys(pc).sort().reverse(), maxP = Math.max(1, ...Object.values(pc));
    const reviewed = [...D.byWork.entries()].map(([id, ps]) => [D.works.get(id), ps.filter((p) => !p.blog).length]).filter(([w, n]) => w && n > 1).sort((a, b) => b[1] - a[1]).slice(0, 24);
    cards.push(foldCard('posts', `지금까지 ${Object.values(pc).reduce((a, b) => a + b, 0)}편`, el('div', { className:'card' }, head('해마다 쓴 서평'), el('p', { className:'sub', textContent:'@hyonnie_books에 올린 서평 글 기준' }),
      pys.map((y) => hbar(y, pc[y], maxP, 'var(--bar)')),
      reviewed.length ? sec('여러 번 쓴 책') : null,
      reviewed.length ? el('div', { className:'again' }, shortList('postsAgain', reviewed.map(([w, n]) => { const b = el('button', { className:'chip', type:'button', textContent:`${titleOf(w)} ×${n}` }); b.onclick = () => openBook(w.id, b); return b; }), 6)) : null)));
  }
  box.replaceChildren(...cards.filter(Boolean));
  placeNet($('wordMap'));
  if (redraw) return; // 보고 있는 화면을 기간·저장으로 다시 그릴 때는 카드가 깜박이지 않게 움직임을 뺀다
  box.querySelectorAll('.card').forEach((c) => c.classList.add('rise'));
  watch('#recap .rise');
}

/* ---------- 낱말 지도 ---------- */
// 주인 화면에만 그린다(공개 화면에서는 부르지 않고, 공개 파일에 낱말을 넣지 않는다). 글을 다 훑으므로 돌아보기를 볼 때 만들고, 저장해 책장이 다시 만들어지면 다시 만든다
const WORD_MAX = 120, W = { src:null, idx:[] };
// 연결망에 넣는 낱말 수: 폰 폭에서는 칩이 겹치지 않을 만큼만. 나머지는 «낱말 더 보기»의 칩 목록으로 본다
const netCount = () => { const w = $('recap').clientWidth || innerWidth; return w < 560 ? 18 : w < 900 ? 28 : 40; };
function wordIndex() {
  if (W.src !== D.works) {
    W.src = D.works;
    W.idx = buildWordIndex(list().filter((w) => WORD_KINDS.includes(w.k || 'book') && w.known).map((w) => wordDoc(w.id, w, reviewsOf(w).filter((p) => !p.blog).map((p) => p.x))));
  }
  return W.idx;
}
function wordsFor(ry) {
  const all = wordIndex();
  return ry ? narrowIndex(all, new Set(list().filter((w) => readYear(w) === ry).map((w) => w.id))) : all;
}
// 긴 문장은 낱말 둘레만 잘라 보여 주고 낱말에 표시한다
function wordLine(text, word) {
  const at = text.indexOf(word), max = 110;
  let s = text;
  if (text.length > max) { const start = Math.max(0, at - 40); s = (start ? '…' : '') + text.slice(start, start + max) + (start + max < text.length ? '…' : ''); }
  const i = s.indexOf(word);
  return i < 0 ? [s] : [s.slice(0, i), el('mark', { textContent:word }), s.slice(i + word.length)];
}
function wordLines(lines, word) {
  const seen = new Set();
  const shown = lines.filter((l) => { const k = squeeze(l.text); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 2);
  return el('ul', { className:'word-lines' }, shown.map((l) => el('li', {}, el('small', { className:'word-src', textContent:l.src }), el('span', {}, wordLine(l.text, word)))));
}
function wordRows(x, idx) {
  const rows = x.books.map((b) => { const w = D.works.get(b.id); return w ? { w, d:firstRead(w) || w.md || w.fd, r:null, lines:b.lines, word:x.word } : null; }).filter(Boolean);
  const near = relatedWords(idx.slice(0, WORD_MAX), x.word); // 칩으로 그릴 수 있는 낱말 안에서만 고른다. 밖의 낱말을 누르면 펼칠 자리가 없다
  if (near.length) rows.top = () => el('div', { className:'word-near' }, el('span', { className:'word-near-l', textContent:'함께 나오는 낱말' }), near.map((word) => {
    const b = el('button', { className:'chip', type:'button', textContent:word });
    b.onclick = () => openWord(word);
    return b;
  }));
  return rows;
}
function openWord(word) {
  closeDrill();
  S.drill = `w:${word}`; S.drillN = DRILL_PAGE;
  const card = $('wordMap');
  if (wordsFor(card.dataset.ry).findIndex((x) => x.word === word) >= netCount()) S.wordAll = true; // 접혀 있는 낱말일 때만 펼친다
  drawWordMap(card);
  const chip = [...card.querySelectorAll('[data-word]')].find((b) => b.dataset.word === word);
  if (chip) chip.focus({ preventScroll:true });
  scrollWordMap(card.querySelector('.drill-slot'));
}
function scrollWordMap(slot) {
  const net = slot.closest('.word-card').querySelector('.net');
  const fits = net && slot.getBoundingClientRect().top - net.getBoundingClientRect().top + 220 < innerHeight;
  (fits ? net : slot).scrollIntoView({ block:'start', behavior:smooth() });
}
function wordCard(ry) {
  const card = el('div', { className:'word-card', id:'wordMap' });
  card.dataset.ry = ry;
  if (S.view === 'recap' && (!folds() || S.rOpen === 'word')) drawWordMap(card); else card.dataset.pending = '1'; // 접혀 있으면 글을 훑지 않고 열 때 만든다
  return card;
}
function wordChip(x, i, idx, slot, card) {
  const size = i < 5 ? 3 : i < 15 ? 2 : 1; // 한 낱말이 유난히 많아도 크기가 고르게 갈리도록 순위로 나눈다
  const b = el('button', { className:`chip word-chip w${size}`, type:'button' }, x.word, el('b', { textContent:x.books.length }));
  b.dataset.word = x.word;
  b.style.setProperty('--i', Math.min(i, 30));
  b.setAttribute('aria-label', `${x.word}, ${x.books.length}권에 나옴`);
  drillable(b, `w:${x.word}`, `«${x.word}» 나온 책`, () => wordRows(x, idx), slot);
  b.addEventListener('click', () => markNet(card));
  return b;
}
function drawWordMap(card) {
  delete card.dataset.pending;
  if (card.querySelector('.net')) (card.closest('.card') || card).classList.add('drawn'); // 같은 카드를 다시 그릴 때는 움직이지 않는다. 등장 효과(.rise)가 바깥 카드에 있어 거기에 단다
  const ry = card.dataset.ry, idx = wordsFor(ry);
  if (idx.length < 3) {
    card.replaceChildren(el('p', { className:'sub', textContent:ry ? `${ry}년에 읽은 책에는 두 권 이상에 나온 낱말이 아직 적어요.` : '메모와 밑줄이 쌓이면 두 권 이상에 나온 낱말을 모아 보여 줄게요.' }));
    return;
  }
  const slot = el('div', { className:'drill-slot' }), count = netCount();
  const { nodes, edges } = wordGraph(idx, count);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'net-lines');
  svg.setAttribute('aria-hidden', 'true');
  const top = Math.max(...edges.map((e) => e.w), 0);
  edges.forEach((e) => { const line = document.createElementNS('http://www.w3.org/2000/svg', 'line'); if (e.w >= top * .6) line.setAttribute('class', 'strong'); line.dataset.a = nodes[e.a].word; line.dataset.b = nodes[e.b].word; svg.append(line); });
  const net = el('div', { className:'net', role:'group', ariaLabel:`낱말 연결망, 낱말 ${nodes.length}개` }, svg, nodes.map((x, i) => wordChip(x, i, idx, slot, card)));
  net.edges = edges;
  const rest = idx.slice(count, WORD_MAX);
  const cloud = S.wordAll && rest.length ? el('div', { className:'word-cloud' }, rest.map((x, i) => wordChip(x, count + i, idx, slot, card))) : null;
  const more = !S.wordAll && rest.length ? el('button', { className:'copy word-more', type:'button', textContent:`낱말 더 보기 (${rest.length}개)` }) : null;
  if (more) more.onclick = () => { S.wordAll = true; drawWordMap(card); const next = card.querySelector('.word-cloud [data-word]'); if (next) next.focus({ preventScroll:true }); };
  card.replaceChildren(
    el('p', { className:'sub', textContent:`${ry ? `${ry}년에 읽은 책의` : '내'} ${LOCAL ? '메모·밑줄' : '메모·밑줄·서평'}에서 두 권 이상에 나온 낱말이에요. 선은 같은 책에 함께 나오는 낱말을 잇고, 숫자는 이어진 책 수예요. 누르면 그 문장이 나와요` }),
    net, ...(more ? [more] : []), ...(cloud ? [cloud] : []), slot);
  placeNet(card);
}
// 칩의 실제 크기를 재서 자리를 정한다. 화면에 붙어 있어야 잴 수 있어 renderRecap도 그린 뒤에 부른다
function placeNet(card) {
  const net = card && card.querySelector('.net');
  if (!net || !net.isConnected || !net.clientWidth) return;
  const chips = [...net.querySelectorAll('.word-chip')], width = net.clientWidth;
  const { height, points } = layoutGraph(chips.map((b) => ({ w:b.offsetWidth, h:b.offsetHeight })), net.edges, width);
  net.style.height = `${height}px`;
  net.dataset.width = width;
  chips.forEach((b, i) => { b.style.left = `${points[i].x}px`; b.style.top = `${points[i].y}px`; });
  const center = (i) => [points[i].x + chips[i].offsetWidth / 2, points[i].y + chips[i].offsetHeight / 2];
  net.querySelectorAll('line').forEach((line, i) => { const e = net.edges[i], [x1, y1] = center(e.a), [x2, y2] = center(e.b); line.setAttribute('x1', x1); line.setAttribute('y1', y1); line.setAttribute('x2', x2); line.setAttribute('y2', y2); });
  markNet(card);
}
// 고른 낱말의 선과 이웃을 드러낸다
function markNet(card) {
  const net = card && card.querySelector('.net');
  if (!net) return;
  const word = S.drill.startsWith('w:') ? S.drill.slice(2) : '', near = new Set();
  net.querySelectorAll('line').forEach((line) => {
    const on = !!word && (line.dataset.a === word || line.dataset.b === word);
    line.classList.toggle('on', on);
    if (on) { near.add(line.dataset.a); near.add(line.dataset.b); }
  });
  net.classList.toggle('has-on', near.size > 0);
  net.querySelectorAll('.word-chip').forEach((b) => b.classList.toggle('near', near.has(b.dataset.word)));
}
// 폭이 바뀌면 자리를 다시 정한다. 낱말 수가 달라지는 폭이면 다시 그린다
function fitNet() {
  const card = $('wordMap'), net = card && card.querySelector('.net');
  if (!net || S.view !== 'recap' || card.dataset.pending) return;
  const idx = wordsFor(card.dataset.ry);
  if (net.querySelectorAll('.word-chip').length !== Math.min(netCount(), idx.length)) {
    const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.word : '';
    if (S.drill.startsWith('w:') && idx.findIndex((x) => x.word === S.drill.slice(2)) >= netCount()) S.wordAll = true; // 열어 둔 낱말이 연결망 밖으로 나가면 칩 목록으로 펼쳐 둔다
    drawWordMap(card);
    const again = focused && [...card.querySelectorAll('[data-word]')].find((b) => b.dataset.word === focused);
    if (again) again.focus({ preventScroll:true });
    return;
  }
  if (+net.dataset.width !== net.clientWidth) placeNet(card);
}
window.addEventListener('resize', fitNet);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { const c = $('wordMap'); if (c && S.view === 'recap') placeNet(c); });

/* ---------- 내 서재 ---------- */
const openLoan = (it) => it.loans.find((l) => !l.back);
const fromWho = (who) => `${who}${/(도서관|학교|문고)$/.test(who || '') ? '에서' : '에게서'}`; // 관악중앙도서관에서, 민수에게서
const isActive = (it) => it.st === 'own' || !!openLoan(it); // 빌려 온 책을 돌려주면 서가에서 빠지고 기록만 남는다
const libWork = (it) => (it.w ? D.works.get(it.w) : null);
const libByWork = (id) => D.lib.find((x) => x.w === id && isActive(x)) || null;
const libRead = (it) => { const w = libWork(it); return !!w && w.k !== 'wishlist' && !isReading(w); };
const libThemes = (it) => (it.th.length ? it.th : (libWork(it) || {}).th || []);
// 첫 저자만: «저자, 역자 옮김», «A / B», «홍길동(지은이)», «첫 사람 외» 꼴에서 이름만 남긴다
const libAuthor = (it) => (it.a || (libWork(it) || {}).a || '').replace(/[(\[][^)\]]*[)\]]/g, '').split(/[\/,]/)[0].trim().replace(/\s+(외(\s*\d+\s*명)?|지음|옮김|엮음|저|역|글|그림)$/, '').trim();
const isLate = (l) => !!l.due && !l.back && l.due < today();
const norm = (s) => (s || '').replace(/\s+/g, '').toLowerCase();
function libMatches(it) {
  const l = openLoan(it);
  if (S.lf === 'own' && it.st !== 'own') return false;
  if (S.lf === 'out' && !(l && l.dir === 'out')) return false;
  if (S.lf === 'in' && it.st !== 'in') return false;
  if (S.lf === 'unread' && libRead(it)) return false;
  if (!S.lq) return true;
  return hasAll(squeeze([it.t, it.a, it.p, it.where, ...it.loans.map((x) => x.who)].filter(Boolean).join(' ')), S.lq);
}
function caseBook(it) {
  const l = openLoan(it), out = !!l && l.dir === 'out';
  const title = it.t || '제목 없음', th = libThemes(it);
  // 플랫한 색면에 얇은 줄과 저자만 더한다(효니 선택 2026-11-05). 빌려준 책은 빈자리로 보인다
  const label = title.length > 24 ? title.slice(0, 23) + '…' : title;
  const sub = out ? `${l.who.slice(0, 6)}에게` : libAuthor(it).slice(0, 6);
  const h = 146 + Math.abs(hash(title)) % 50;
  const perCol = Math.max(5, Math.floor((h - 30 - sub.length * 12) / 15));
  const cols = Math.min(3, Math.ceil(label.length / perCol));
  const b = el('button', { type:'button', className:`spine lbook ${lineOf(it.id)}${out ? ' gone' : ''}` });
  b.style.height = h + 'px';
  b.style.width = 14 + cols * 18 + Math.abs(hash(title + 'w')) % 14 + 'px';
  if (!out) b.style.backgroundColor = themeVar(th[0]);
  b.append(spineText(label));
  if (sub) b.append(el('small', { textContent:sub }));
  const status = it.st === 'in' ? `${fromWho(l.who)} 빌려 온 책` : out ? `${l.who}에게 빌려줌` : '소장';
  b.setAttribute('aria-label', [title, it.a, status].filter(Boolean).join(', '));
  b.title = [title, status].join(' · ');
  b.dataset.lib = it.id;
  b.onclick = () => pullOut(b, () => openLib(it.id, b));
  return el('div', { className:'lslot' }, b);
}
function ledgerRow(it, l) {
  const i = it.loans.indexOf(l);
  const name = el('button', { className:'ledger-title', type:'button', textContent:it.t || '제목 없음' });
  name.onclick = () => openLib(it.id, name);
  const meta = [l.dir === 'out' ? `${l.who}에게` : fromWho(l.who), l.d ? `${l.d} 빌림` : '', l.due ? `${l.due}까지` : '', l.back ? `${l.back} 돌아옴` : ''].filter(Boolean).join(' · ');
  const tools = el('div', { className:'ledger-tools' });
  if (!l.back) tools.append(backButton(it, i));
  const fix = el('button', { className:'copy', type:'button', textContent:'고치기' });
  fix.onclick = () => openLoanForm(it, i);
  tools.append(fix);
  return el('li', { className:'ledger-row' + (isLate(l) ? ' late' : '') },
    el('div', { className:'ledger-main' }, name, el('div', { className:'when', textContent:meta }), isLate(l) ? el('strong', { className:'late-tag', textContent:'약속한 날 지남' }) : null), tools);
}
function backButton(it, i) {
  const l = it.loans[i];
  const b = el('button', { className:'copy', type:'button', textContent:l.dir === 'out' ? '돌려받았어요' : '돌려줬어요' });
  b.onclick = () => {
    const loans = it.loans.map((x, n) => (n === i ? { ...x, back:today() } : x));
    saveLib({ ...it, loans }, l.dir === 'out' ? '서가에 다시 꽂았어요' : '돌려준 기록을 남겼어요').then(reshow).catch(saveFailed);
  };
  return b;
}
const saveFailed = (e) => { console.error(e); toast(e.userMsg || '저장하지 못했어요. 인터넷 연결을 확인해 주세요'); };
function renderLedger() {
  const loans = D.lib.flatMap((it) => it.loans.map((l) => [it, l]));
  const byDue = (a, b) => (a[1].due || '9').localeCompare(b[1].due || '9');
  const open = loans.filter(([, l]) => !l.back);
  const out = open.filter(([, l]) => l.dir === 'out').sort(byDue), inn = open.filter(([, l]) => l.dir === 'in').sort(byDue);
  const past = loans.filter(([, l]) => l.back).sort((a, b) => b[1].back.localeCompare(a[1].back));
  const part = (title, rows) => (rows.length ? el('section', { className:'ledger-part' }, el('h3', { className:'sec', textContent:`${title} ${rows.length}` }), el('ul', { className:'ledger-list' }, rows.map(([it, l]) => ledgerRow(it, l)))) : null);
  const kids = [part('빌려준 책', out), part('빌려 온 책', inn)].filter(Boolean);
  if (past.length) {
    const box = el('details', { className:'ledger-part', open:S.pastOpen }, el('summary', { textContent:`지난 기록 ${past.length}` }), el('ul', { className:'ledger-list' }, past.map(([it, l]) => ledgerRow(it, l))));
    box.ontoggle = () => { S.pastOpen = box.open; };
    kids.push(box);
  }
  if (!kids.length && D.lib.length) kids.push(el('p', { className:'warn', textContent:'책장의 책을 누르면 빌려준 기록을 남길 수 있어요.' }));
  $('ledger').replaceChildren(...kids);
}
function renderLibrary() {
  queueJump();
  if (!S.owner) { ['cases', 'ledger', 'libKinds'].forEach((id) => $(id).replaceChildren()); $('lcount').textContent = ''; return; }
  const act = D.lib.filter(isActive);
  const count = { all:act.length, own:act.filter((x) => x.st === 'own').length, out:act.filter((x) => { const l = openLoan(x); return l && l.dir === 'out'; }).length, in:act.filter((x) => x.st === 'in').length, unread:act.filter((x) => !libRead(x)).length };
  $('libKinds').replaceChildren(...LIB_KINDS.map(([k, label]) => {
    const b = el('button', { className:'chip', type:'button', textContent:`${label} ${count[k]}` });
    b.setAttribute('aria-pressed', S.lf === k);
    b.onclick = () => { S.lf = k; renderLibrary(); };
    return b;
  }));
  const sort = libSort();
  drawLibSort(sort);
  const rows = act.filter(libMatches);
  $('lcount').textContent = `${rows.length}권`;
  renderLedger();
  if (!act.length) {
    const one = el('button', { className:'btn', type:'button', textContent:'한 권 꽂기' }); one.onclick = () => openLibForm(null);
    const many = el('button', { className:'btn ghost', type:'button', textContent:'여러 권 한꺼번에 꽂기' }); many.onclick = openManyForm;
    $('cases').replaceChildren(el('section', { className:'lib-group' }, el('div', { className:'empty' }, el('div', { textContent:'아직 꽂은 책이 없어요. 가진 책과 빌려 온 책을 꽂아 보세요.' }), el('div', { className:'actions' }, one, many)), el('div', { className:'case' })));
    return;
  }
  if (!rows.length) {
    const reset = el('button', { className:'btn', type:'button', textContent:'조건 풀기' });
    reset.onclick = () => { S.lf = 'all'; S.lq = ''; $('lq').value = ''; renderLibrary(); };
    $('cases').replaceChildren(el('div', { className:'empty' }, el('div', { textContent:'조건에 맞는 책이 없어요.' }), reset));
    return;
  }
  const byTheme = sort === 'theme';
  $('cases').classList.toggle('by-theme', byTheme);
  $('cases').replaceChildren(...libSections(rows, sort).map(({ name, books, swatch, markOf }) => {
    const seen = new Set();
    const slots = books.map((it) => {
      const slot = caseBook(it), mark = markOf && markOf(it);
      if (mark && !seen.has(mark)) { seen.add(mark); jumpMark(slot, mark); } // 긴 선반 하나에서 그 글자의 첫 책으로 바로 간다
      return slot;
    });
    const h2 = el('h2');
    if (swatch) { const sw = el('span', { className:'sw' }); sw.style.background = themeVar(swatch === NO_THEME ? '' : swatch); h2.append(sw); }
    h2.append(name);
    const section = el('section', { className:`lib-group shelf${byTheme && books.length <= FEW_BOOKS ? ' few' : ''}` },
      el('div', { className:'shelf-head' }, h2, el('span', { textContent:`${books.length}권` })),
      el('div', { className:`case${byTheme ? ' fit' : ''}` }, slots));
    return seen.size ? section : jumpMark(section, name); // 글자로 건너뛰는 선반은 글자 칩만 둔다
  }));
  watch('.lib-group.shelf');
}
/* 꽂는 순서: 소장한 책만 순서를 바꾸고, 빌려 온 책은 언제나 맨 뒤 칸에 따로 둔다(내 책장에 있는 책이 아니라서) */
const NO_THEME = '주제 미정', LIB_FLAT = '소장한 책', LIB_IN = '빌려 온 책', NO_AUTHOR = '저자 미상', FEW_BOOKS = 8;
const LIB_SORTS = [['theme','주제'],['title','제목'],['author','저자'],['recent','최근'],['where','위치']];
const LIBSORT_KEY = LOCAL ? 'myshelf-libsort' : 'shelf-libsort';
try { const v = localStorage.getItem(LIBSORT_KEY); if (LIB_SORTS.some(([k]) => k === v)) S.ls = v; } catch (e) {}
const KO = new Intl.Collator('ko', { numeric:true, sensitivity:'base' }); // 1권 다음에 2권, 10권은 그 뒤
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', CHO_BASE = { ㄲ:'ㄱ', ㄸ:'ㄷ', ㅃ:'ㅂ', ㅆ:'ㅅ', ㅉ:'ㅈ' };
const leadTrim = (s) => (s || '').replace(/^[^\p{L}\p{N}]+/u, ''); // «」(처럼 앞에 붙은 문장부호는 순서에 넣지 않는다
function firstLetter(s) {
  const c = leadTrim(s)[0] || '', code = c.charCodeAt(0);
  if (code >= 0xAC00 && code <= 0xD7A3) { const ch = CHO[Math.floor((code - 0xAC00) / 588)]; return CHO_BASE[ch] || ch; }
  if (/[a-z]/i.test(c)) return 'A-Z';
  if (/\d/.test(c)) return '0-9';
  return '기타';
}
const libHasPlaces = () => new Set(D.lib.filter((x) => x.st === 'own' && isActive(x)).map((x) => x.where || DEFAULT_WHERE)).size >= 2;
const libSort = () => (S.ls === 'where' && !libHasPlaces() ? 'theme' : S.ls); // 위치를 적은 책이 없으면 위치 단추도 없다
function drawLibSort(sort) {
  const box = $('libSort');
  box.hidden = !D.lib.some(isActive);
  box.replaceChildren(el('span', { className:'sort-label', textContent:'꽂는 순서' }), ...LIB_SORTS.filter(([k]) => k !== 'where' || libHasPlaces()).map(([k, label]) => {
    const b = el('button', { className:'chip', type:'button', textContent:label });
    b.setAttribute('aria-pressed', sort === k);
    b.onclick = () => {
      S.ls = k;
      try { localStorage.setItem(LIBSORT_KEY, k); } catch (e) {}
      renderLibrary();
    };
    return b;
  }));
}
function libSections(rows, sort) {
  const own = rows.filter((x) => x.st === 'own'), inn = rows.filter((x) => x.st === 'in');
  const byTitle = (a, b) => KO.compare(leadTrim(a.t), leadTrim(b.t));
  const out = [];
  if (sort === 'theme' || sort === 'where') {
    const groups = new Map();
    own.forEach((x) => { const k = sort === 'theme' ? libThemes(x)[0] || NO_THEME : x.where || DEFAULT_WHERE; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
    const rank = (t) => (t === NO_THEME ? 1e3 : (THEMES.findIndex((x) => x[0] === t) + 1) || 999); // 칸이 늘거나 줄어도 자리가 바뀌지 않게 주제 목록 순서를 따른다
    const names = [...groups.keys()].sort(sort === 'theme' ? (a, b) => rank(a) - rank(b) : (a, b) => groups.get(b).length - groups.get(a).length || a.localeCompare(b, 'ko'));
    // 위치별 칸 안에서는 예전처럼 주제 색이 모이도록 주제, 제목 순으로 꽂는다
    const inGroup = sort === 'theme' ? byTitle : (a, b) => rank(libThemes(a)[0] || NO_THEME) - rank(libThemes(b)[0] || NO_THEME) || byTitle(a, b);
    names.forEach((name) => out.push({ name, books:groups.get(name).sort(inGroup), swatch:sort === 'theme' ? name : '' }));
  } else if (own.length) {
    const byAuthor = (a, b) => (!libAuthor(a) - !libAuthor(b)) || KO.compare(leadTrim(libAuthor(a)), leadTrim(libAuthor(b))) || byTitle(a, b);
    const byRecent = (a, b) => (b.added || '').localeCompare(a.added || '') || byTitle(a, b);
    const markOf = sort === 'title' ? (x) => firstLetter(x.t) : sort === 'author' ? (x) => (libAuthor(x) ? firstLetter(libAuthor(x)) : NO_AUTHOR) : null;
    out.push({ name:LIB_FLAT, books:own.sort(sort === 'title' ? byTitle : sort === 'author' ? byAuthor : byRecent), markOf });
  }
  if (inn.length) out.push({ name:LIB_IN, books:inn.sort(byTitle) });
  return out;
}
// 책 창 왼쪽의 서재 상태(글)와, «더 보기» 메뉴로 가는 서재 단추들(2026-11-14 단추 정리)
function libBox(it, w) {
  if (!it) {
    const add = el('button', { className:'copy', type:'button', textContent:'내 서재에 꽂기' });
    add.onclick = () => openLibForm(null, { work:w });
    return { box:null, tools:[add] };
  }
  const l = openLoan(it);
  const state = it.st === 'in' ? (l ? `빌려 온 책 · ${fromWho(l.who)}` : '빌렸다가 돌려준 책') : l ? `소장 · 지금 ${l.who}에게 빌려줌` : `소장 · ${it.where || DEFAULT_WHERE}`;
  const kids = [el('h3', { className:'sec', textContent:'내 서재' }), el('p', { className:'libstate', textContent:state })];
  it.loans.forEach((x, i) => {
    const fix = el('button', { className:'copy', type:'button', textContent:'고치기' });
    fix.onclick = () => openLoanForm(it, i);
    const text = [x.dir === 'out' ? `${x.who}에게` : fromWho(x.who), x.d, x.due ? `${x.due}까지` : '', x.back ? `${x.back} 돌아옴` : ''].filter(Boolean).join(' · ');
    kids.push(el('div', { className:'loanline' + (isLate(x) ? ' late' : '') }, el('span', { textContent:text }), fix));
  });
  const tools = [];
  if (l) tools.push(backButton(it, it.loans.indexOf(l)));
  else if (it.st === 'own') { const lend = el('button', { className:'copy', type:'button', textContent:'빌려주기' }); lend.onclick = () => openLoanForm(it, -1); tools.push(lend); }
  if (it.st === 'in') {
    const mine = el('button', { className:'copy', type:'button', textContent:'내 책이 됐어요' });
    mine.onclick = () => {
      const loans = it.loans.map((x) => (x.back ? x : { ...x, back:today() }));
      saveLib({ ...it, st:'own', loans }, '내 책으로 옮겼어요').then(reshow).catch(saveFailed);
    };
    tools.push(mine);
  }
  const edit = el('button', { className:'copy', type:'button', textContent:'서재 정보 고치기' });
  edit.onclick = () => openLibForm(it);
  tools.push(edit);
  return { box:el('div', { className:'libbox' }, kids), tools };
}
// «⋯ 더 보기»: 자주 안 쓰는 단추를 접어 둔다. 책 창 안에서 펼쳐지는 목록이라 화면 밖으로 나가지 않는다. Esc·바깥 누르기·항목 누르기로 닫힌다
function moreMenu(items) {
  items = items.filter(Boolean);
  if (!items.length) return null;
  const btn = el('button', { className:'btn ghost', type:'button', textContent:'⋯ 더 보기' });
  const menu = el('div', { className:'more-menu', hidden:true, id:`more${Date.now().toString(36)}` }, items);
  btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', menu.id);
  const wrap = el('div', { className:'more-wrap' }, btn, menu);
  const outside = (e) => { if (!wrap.contains(e.target)) set(false); };
  const esc = (e) => { if (e.key === 'Escape' && !menu.hidden) { e.stopPropagation(); e.preventDefault(); set(false); btn.focus(); } };
  const set = (open) => {
    menu.hidden = !open; btn.setAttribute('aria-expanded', String(open));
    if (open) { document.addEventListener('pointerdown', outside, true); menu.querySelector('button, a')?.focus({ preventScroll:true }); menu.scrollIntoView({ block:'nearest', behavior:calm() ? 'auto' : 'smooth' }); }
    else document.removeEventListener('pointerdown', outside, true);
  };
  btn.onclick = () => set(menu.hidden);
  wrap.addEventListener('keydown', esc);
  menu.addEventListener('click', (e) => { if (e.target.closest('button, a')) set(false); });
  return wrap;
}
async function saveLib(it, msg) {
  const data = JSON.parse(JSON.stringify(it));
  delete data.id;
  await write(`library/${it.id}`, data);
  setPriv('library', it.id, data);
  refreshAll();
  toast(msg);
}
const newLibId = (n = 0) => (DEMO ? Promise.resolve(`demo${Date.now()}${n}`) : fb.newId('library'));
function nameList(id, names) { return el('datalist', { id }, [...new Set(names.filter(Boolean))].map((v) => el('option', { value:v }))); }
function whereInput(value) {
  const i = el('input', { type:'text', value, placeholder:DEFAULT_WHERE });
  i.setAttribute('list', 'whereNames');
  return i;
}
const whereList = () => nameList('whereNames', D.lib.map((x) => x.where));
function openLibForm(it, { work } = {}) {
  const isNew = !it, seed = it || work || {};
  let newId = '';
  const pickr = bookPicker(true);
  const t = pickr.input;
  t.value = seed.t || '';
  const a = el('input', { type:'text', value:seed.a || '' });
  const p = el('input', { type:'text', value:seed.p || '' });
  const where = whereInput(it ? it.where || '' : S.lastWhere);
  const th = themeChecks(seed.th || []);
  t.addEventListener('change', () => {
    const hit = pickr.pick();
    if (!hit) return;
    t.value = hit.t; a.value = hit.a || ''; p.value = hit.p || '';
    th.querySelectorAll('input').forEach((c) => { c.checked = hit.th.includes(c.value); });
  });
  const kids = [bookLookup((b) => { t.value = b.t; a.value = b.a || a.value; p.value = b.p || p.value; }), field('제목', t, '읽은 책에 있으면 목록에서 골라 주세요. 서평과 이어져요'), pickr.dl, field('저자', a), field('출판사', p)];
  let st, who, d, due;
  if (isNew) {
    st = el('select', {}, el('option', { value:'own', textContent:'내 책' }), el('option', { value:'in', textContent:'빌려 온 책' }));
    who = el('input', { type:'text' }); who.setAttribute('list', 'peopleNames');
    d = el('input', { type:'date', value:today() }); due = el('input', { type:'date' });
    const loanBox = el('div', { className:'sub-fields', hidden:true }, field('누구에게서', who), nameList('peopleNames', D.lib.flatMap((x) => x.loans.map((l) => l.who))), field('빌린 날', d), field('돌려주기로 한 날', due));
    const whereField = field('어느 칸에 꽂을까요', where, '집, 교무실처럼 적으면 칸이 나뉘어요. 비워도 돼요');
    st.onchange = () => { loanBox.hidden = st.value !== 'in'; whereField.hidden = st.value === 'in'; };
    kids.push(field('구분', st), loanBox, whereField, whereList());
  } else if (it.st === 'own') kids.push(field('어느 칸에 꽂을까요', where), whereList());
  kids.push(field('주제', th, '책등 색이 이 주제로 정해져요'));
  const save = async () => {
    const hit = pickr.pick();
    const title = hit ? hit.t : t.value.trim();
    if (!title) throw fail('제목을 적어 주세요');
    if (isNew && D.lib.some((x) => isActive(x) && norm(x.t) === norm(title))) throw fail('이미 내 서재에 있는 책이에요');
    const link = hit ? hit.id : it && it.t === title ? it.w || '' : work && work.t === title ? work.id : '';
    if (isNew && !newId) newId = await newLibId(); // 저장을 다시 눌러도 같은 칸에 쓰여 책이 겹치지 않는다
    const base = isNew ? { id:newId, st:st.value, added:today(), loans:[] } : { ...it };
    Object.assign(base, { t:title, a:a.value.trim(), p:p.value.trim(), w:link, th:th.values() });
    if (base.st === 'own') { base.where = where.value.trim(); S.lastWhere = base.where; }
    if (isNew && base.st === 'in') {
      if (!who.value.trim()) throw fail('누구에게서 빌렸는지 적어 주세요');
      base.loans = [{ dir:'in', who:who.value.trim(), d:d.value, due:due.value }];
    }
    S.lf = 'all';
    await saveLib(base, isNew ? '서재에 꽂았어요' : '고쳤어요');
    reshow();
  };
  if (it) {
    const del = el('button', { className:'copy danger', type:'button', textContent:'서재에서 빼기' });
    del.onclick = async () => {
      if (!await ask(`«${it.t}»을 내 서재에서 뺄까요? 빌린 기록도 함께 지워져요.`, '빼기')) return;
      try {
        await write(`library/${it.id}`, null);
        setPriv('library', it.id, null);
        const stay = S.cur && S.cur.id;
        refreshAll();
        $('form').close();
        if (stay) reshow(); else if ($('sheet').open) $('sheet').close();
        toast('서재에서 뺐어요');
      } catch (e) { saveFailed(e); }
    };
    kids.push(el('div', { className:'memo-foot' }, del));
  }
  showForm(isNew ? '내 서재에 꽂기' : '서재 정보 고치기', kids, save);
}
function openManyForm() {
  const x = el('textarea', { rows:10, placeholder:'한 줄에 한 권씩 적어 주세요\n이방인 / 알베르 카뮈\n코스모스' });
  const where = whereInput(S.lastWhere);
  const ids = new Map(); // 저장을 다시 눌러도 같은 줄은 같은 칸에 쓰인다
  showForm('여러 권 한꺼번에 꽂기', [field('책 목록', x, '«제목 / 저자»로 적어요. 읽은 책에 같은 제목이 있으면 저절로 이어져요'), field('어느 칸에 꽂을까요', where, '비워도 돼요'), whereList()], async () => {
    const lines = x.value.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!lines.length) throw fail('책을 한 권 이상 적어 주세요');
    const have = new Set(D.lib.filter(isActive).map((b) => norm(b.t)));
    const works = new Map(list().filter((w) => w.t && w.k === 'book').map((w) => [norm(w.t), w]));
    const add = {};
    let linked = 0, skipped = 0, n = 0;
    for (const line of lines) {
      const [rawT, ...rest] = line.split(/\s+\/\s+/); // AC/DC처럼 제목 속 빗금은 자르지 않는다
      const title = rawT.trim(), author = rest.join(' / ').trim();
      if (!title || have.has(norm(title))) { skipped++; continue; }
      have.add(norm(title));
      const hit = works.get(norm(title));
      if (hit) linked++;
      if (!ids.has(norm(title))) ids.set(norm(title), await newLibId(ids.size));
      n++;
      add[ids.get(norm(title))] = { t:hit ? hit.t : title, a:author || (hit ? hit.a || '' : ''), p:hit ? hit.p || '' : '', w:hit ? hit.id : '', th:hit ? hit.th : [], st:'own', where:where.value.trim(), added:today(), loans:[] };
    }
    if (!n) throw fail('새로 꽂을 책이 없어요. 모두 이미 서재에 있어요.');
    await write('library', add, 'update');
    Object.entries(add).forEach(([id, v]) => setPriv('library', id, JSON.parse(JSON.stringify(v))));
    S.lastWhere = where.value.trim(); S.lf = 'all';
    refreshAll();
    toast([`${n}권 꽂았어요`, linked ? `읽은 책과 이은 책 ${linked}권` : '', skipped ? `이미 있는 책 ${skipped}권은 뺐어요` : ''].filter(Boolean).join(' · '));
  }, '꽂기');
}
function openLoanForm(it, i) {
  const editing = i >= 0, l = editing ? it.loans[i] : { dir:'out' };
  const who = el('input', { type:'text', required:true, value:l.who || '' });
  who.setAttribute('list', 'peopleNames');
  const d = el('input', { type:'date', value:editing ? l.d || '' : today() });
  const due = el('input', { type:'date', value:l.due || '' });
  const back = el('input', { type:'date', value:l.back || '' });
  const kids = [field(l.dir === 'out' ? '누구에게' : '누구에게서', who), nameList('peopleNames', D.lib.flatMap((x) => x.loans.map((y) => y.who))), field(l.dir === 'out' ? '빌려준 날' : '빌린 날', d), field(l.dir === 'out' ? '돌려받기로 한 날' : '돌려주기로 한 날', due, '정하지 않았으면 비워 두세요')];
  if (editing) kids.push(field('돌아온 날', back, '아직 안 돌아왔으면 비워 두세요'));
  const save = async () => {
    if (!who.value.trim()) throw fail('이름을 적어 주세요');
    const next = { ...l, who:who.value.trim(), d:d.value, due:due.value };
    if (editing && back.value) next.back = back.value; else delete next.back;
    const loans = [...it.loans];
    if (editing) loans[i] = next; else loans.push(next);
    await saveLib({ ...it, loans }, editing ? '고쳤어요' : '빌려준 기록을 남겼어요');
    reshow();
  };
  if (editing && l.dir === 'out') {
    const del = el('button', { className:'copy danger', type:'button', textContent:'이 기록 지우기' });
    del.onclick = async () => {
      if (!await ask('이 기록을 지울까요?')) return;
      try { await saveLib({ ...it, loans:it.loans.filter((_, n) => n !== i) }, '기록을 지웠어요'); $('form').close(); reshow(); } catch (e) { saveFailed(e); }
    };
    kids.push(el('div', { className:'memo-foot' }, del));
  }
  showForm(editing ? '빌린 기록 고치기' : `«${it.t}» 빌려주기`, kids, save);
}

/* ---------- 저장 ---------- */
async function write(path, value, how) {
  if (DEMO) { console.info('[demo] 저장 안 함', path); return; }
  if (!LOCAL && navigator.onLine === false) throw fail('인터넷이 끊겨 있어요. 연결되면 다시 눌러 주세요.');
  // Firebase 저장은 끊기면 응답 없이 기다리므로 시간을 정해 알린다. 늦게라도 연결되면 저장될 수 있다
  await Promise.race([(how === 'update' ? fb.updatePath : fb.writePath)(path, value), new Promise((_, no) => setTimeout(() => no(fail('응답이 늦어요. 인터넷을 확인해 주세요. 새로 고침해서 저장됐는지 본 뒤 다시 해 주세요.')), 15000))]);
}
const setPriv = (group, key, val) => { D.priv[group] = D.priv[group] || {}; if (val === null) delete D.priv[group][key]; else D.priv[group][key] = val; };
const refreshAll = () => { rebuild(); renderShelf(); renderLibrary(); renderPosts(); renderRecap(); renderToday(); setLede(); syncMemoBin(); if (S.owner) { const n = dupPairs().length; $('fixDups').textContent = n ? `겹치는 책 고치기 ${n}` : '겹치는 책 고치기'; $('foldTools').textContent = n ? `관리 ${n}` : '관리'; } };
// 공개 데이터의 책을 처음 고칠 때는 공개 필드를 함께 저장한다
function storedWork(w) {
  const { hay, nameHay, pub, qs, ms, ...rest } = w; // qs·ms는 공개본에서 온 표지 문장·공개 글이라 비공개 칸에 되돌려 쓰지 않는다
  return JSON.parse(JSON.stringify(rest));
}
async function saveWork(w, msg) {
  const data = storedWork(w);
  await write(`works/${w.id}`, data);
  setPriv('works', w.id, data);
  refreshAll();
  toast(msg);
}
async function saveLinks(p, ids, msg, stayOn) {
  const k = ids.length ? 'review' : 'etc';
  const val = { w:ids, k };
  await write(`igLinks/${p.c}`, val);
  setPriv('igLinks', p.c, val);
  refreshAll();
  if ($('sheet').open && stayOn) openBook(stayOn, $('sheet').returnEl);
  toast(msg);
}

/* ---------- 확인 창 ---------- */
// 브라우저 기본 confirm은 앱 안 브라우저 등에서 창 없이 바로 취소로 끝나 지우기가 안 된다(2026-11-05 재현). 그래서 화면 안에 직접 그린다
function ask(message, yes = '지우기', danger = true) {
  return new Promise((done) => {
    const d = el('dialog', { className:'ask-dlg' });
    d.setAttribute('role', 'alertdialog');
    const no = el('button', { className:'btn ghost', type:'button', textContent:'취소' });
    no.onclick = () => d.close();
    const ok = el('button', { className:'btn' + (danger ? ' danger' : ''), type:'button', textContent:yes });
    ok.onclick = () => d.close('yes');
    d.append(el('p', { className:'ask-text', textContent:message }), el('div', { className:'actions' }, no, ok));
    d.addEventListener('close', () => { const r = d.returnValue === 'yes'; d.remove(); done(r); });
    document.body.append(d);
    d.showModal();
    no.focus(); // 되돌릴 수 없는 일이라 처음에는 취소에 둔다(공개도 밖으로 나가는 일이라 같다)
  });
}

/* ---------- 밑줄 ---------- */
// 문장·쪽·내 생각을 한 묶음으로 두는 비공개 칸 marks. 아이폰 메모(notes)와 섞지 않고, tools/publish.js는 옮기지 않는다
const markId = () => 'm' + Date.now().toString(36) + Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, '0')).join('');
const pageText = (s) => tidy(s).replace(/^pp?\.?\s*(?=\d)/i, '').replace(/\s*(?:쪽|페이지)$/, '').replace(/(\d)\s*[-~—―–]\s*(\d)/g, '$1–$2'); // 129-130도 129~130도 129–130으로 맞춘다
const pageLabel = (p) => (/^\d/.test(p || '') ? `p.${p}` : p || '');
const pageNum = (p) => { const m = /\d+/.exec(p || ''); return m ? +m[0] : Infinity; };
const marksInOrder = (w) => [...w.marks].sort((a, b) => pageNum(a.p) - pageNum(b.p) || (a.d || '').localeCompare(b.d || '') || (a.id || '').localeCompare(b.id || ''));
function markRow(w, m) {
  return el('div', { className:`memo mark${S.justMark === m.id ? ' just' : ''}` },
    el('div', { className:'when' }, [pageLabel(m.p), m.d].filter(Boolean).join(' · ') || '쪽 없음', visTag(m.pub !== false)),
    el('blockquote', { className:'mark-q', textContent:m.q }),
    m.why ? el('p', { className:'mark-why', textContent:m.why }) : null,
    itemTools(w, { edit:() => openMarkForm(w, m.id) }));
}
function openMarkForm(w, id) {
  const m = id ? w.marks.find((x) => x.id === id) || {} : {};
  const q = el('textarea', { rows:5, value:m.q || '' });
  const p = el('input', { type:'text', value:m.p || '', autocomplete:'off' });
  const why = el('textarea', { rows:3, value:m.why || '' });
  const d = el('input', { type:'date', value:m.d || today() });
  const open = el('input', { type:'checkbox', checked:m.pub !== false });
  const openBox = LOCAL ? null : el('label', { className:'check' }, open, ' 문장·쪽을 방문자에게 공개 (12~160자 문장만 책 표지에, 내 생각·날짜는 나만)');
  const del = id ? formBtn('지우기', async () => {
    if (!await ask('이 밑줄을 지울까요? 되돌릴 수 없어요.')) return;
    $('form').close();
    const cur = D.works.get(w.id) || w;
    await keepScroll(() => memoSave({ ...cur, marks:cur.marks.filter((x) => x.id !== id) }, '밑줄을 지웠어요'));
  }, true) : null;
  showForm(id ? '밑줄 고치기' : '밑줄 더하기', [field('문장', q, '책에서 옮긴 문장을 붙여 넣어요'), field('쪽', p, '129–130처럼 적어요. 없으면 비워 둬요'), field('내 생각', why, '왜 남겼는지 적어요. 비워 둬도 돼요'), field('날짜', d), openBox, formTools(del)].filter(Boolean), async () => {
    const text = q.value.replace(/\r\n?/g, '\n').trim();
    if (!text) throw fail('문장을 붙여 넣어 주세요.');
    const next = { ...m, id:m.id || markId(), d:d.value, p:pageText(p.value), q:text, why:why.value.replace(/\r\n?/g, '\n').trim() };
    if (!LOCAL) { if (open.checked) delete next.pub; else next.pub = false; } // 켜짐이 기본이라 꺼 둔 밑줄만 표시를 남긴다
    const cur = D.works.get(w.id) || w; // 창을 연 뒤에 바뀌었을 수 있어 최신 칸에 넣는다
    const marks = id ? cur.marks.map((x) => (x.id === id ? next : x)) : [...cur.marks, next];
    await saveWork({ ...cur, marks }, '밑줄을 저장했어요');
    S.justMark = next.id;
    openBook(w.id, $('sheet').returnEl);
    S.justMark = '';
    const row = document.querySelector('#sheet-body .mark.just');
    if (row) row.scrollIntoView({ block:'center' });
  });
}

/* ---------- 오늘의 문장 ---------- */
// 주인과 범용판에서만 나온다(S.owner). 날짜로 정해 하루 동안 같은 문장이고, 밑줄이 있으면 절반은 밑줄에서 고른다
const memoSentences = (b) => (b || '').split(/\n+|(?<=[.!?…。])\s+/).map(tidy).filter((s) => s.length >= 12 && s.length <= 160 && !/https?:|#\S/.test(s));
function todayPool() {
  const marks = [], memos = [];
  list().forEach((w) => {
    w.marks.forEach((m) => marks.push({ w, text:m.q, where:pageLabel(m.p) }));
    if (['book', 'film', 'show'].includes(w.k)) w.notes.forEach((n) => { if (n.s === 'want') return; const parts = memoSentences(n.b); if (parts.length) memos.push({ w, parts, where:'옛 메모' }); });
  });
  return { marks, memos };
}
function todayPick() {
  if (!S.owner) return null;
  const { marks, memos } = todayPool();
  if (!marks.length && !memos.length) return null;
  const seed = Math.abs(hash(`${today()}:${S.todayN || 0}`));
  const pool = marks.length && (!memos.length || seed % 2 === 0) ? marks : memos;
  const it = pool[(seed >>> 1) % pool.length];
  const text = it.parts ? it.parts[(seed >>> 3) % it.parts.length] : it.text;
  return { w:it.w, where:it.where, text:text.length > 240 ? text.slice(0, 239) + '…' : text };
}
function renderToday() {
  const box = $('today');
  if (!box) return;
  const it = todayPick();
  if (!it) { box.hidden = true; box.replaceChildren(); return; }
  if (box.hidden) { box.hidden = false; box.classList.add('enter'); }
  const go = el('button', { className:'copy', type:'button', textContent:'이 책 펴기' });
  go.onclick = () => openBook(it.w.id, go);
  const other = el('button', { className:'copy', type:'button', textContent:'다른 문장' });
  other.onclick = () => {
    const next = () => { const was = it.text; let n = 0; do { S.todayN = (S.todayN || 0) + 1; } while (++n < 6 && todayPick().text === was); renderToday(); box.classList.remove('swap'); };
    if (calm()) { next(); return; }
    box.classList.add('swap'); // 글자가 먼저 사라진 뒤 새 글자를 보여 준다
    setTimeout(next, 150);
  };
  box.replaceChildren(
    el('h2', { className:'today-label', textContent:'오늘의 문장' }),
    el('blockquote', { className:'today-q', textContent:it.text }),
    el('div', { className:'today-foot' }, el('span', { className:'today-from', textContent:[titleOf(it.w), it.where].filter(Boolean).join(' · ') }), el('span', { className:'today-tools' }, go, other)));
}

/* ---------- 메모 보관·지우기 ---------- */
// 보관한 메모는 같은 칸의 archived로 옮긴다. notes에서 빠지므로 책등·찾기·돌아보기·공개 반영에 쓰이지 않는다
const memoOwner = (id) => { const w = D.priv.works[id]; return D.works.get(id) || { ...w, id, t:w.t || '', th:w.th || [], recs:w.recs || [], notes:w.notes || [], archived:w.archived || [], marks:w.marks || [] }; };
const emptyAfter = (w, notes, archived) => !w.pub && !notes.length && !archived.length && !w.marks.length && !w.recs.length && !reviewsOf(w).length;
function afterMemo() {
  if (!$('sheet').open) return;
  if (S.cur && S.cur.id && !D.works.has(S.cur.id)) closeBook(); else reshow();
}
let memoBusy = false; // 저장 중에 또 누르면 옛 내용으로 덮어써 앞 동작이 취소되므로 막는다
async function memoSave(next, msg) {
  if (memoBusy) return;
  memoBusy = true;
  try { await saveWork(next, msg); }
  catch (e) { console.error(e); toast(e.userMsg || '저장하지 못했어요. 인터넷 연결을 확인해 주세요'); throw e; }
  finally { memoBusy = false; }
  afterMemo();
}
// 메모 고치기 창 아래의 «보관 ··· 지우기». 창을 연 뒤 바뀌었을 수 있어 최신 칸에서 같은 메모를 찾는다
function memoTools(w, n0) {
  const fresh = () => { const cur = D.works.get(w.id) || w; const i = cur.notes.findIndex((x) => x === n0 || (n0.id != null && x.id === n0.id)); return [cur, i]; };
  const gone = () => { toast('그 사이 메모가 바뀌었어요. 창을 닫고 다시 열어 주세요'); };
  const keep = formBtn('보관', async () => {
    const [cur, i] = fresh();
    if (i < 0) return gone();
    $('form').close();
    const notes = cur.notes.filter((_, x) => x !== i), out = !cur.pub && !notes.length && !cur.marks.length && !cur.recs.length && !reviewsOf(cur).length;
    await memoSave({ ...cur, notes, archived:[...cur.archived, { ...cur.notes[i], arcAt:today() }] }, out ? '보관하고 책장에서 뺐어요. «보관한 메모»에서 되돌릴 수 있어요' : '보관했어요').catch(() => {});
  });
  keep.title = '지우지 않고 «보관한 메모»로 옮겨 둬요. 언제든 되돌릴 수 있어요';
  const del = formBtn('지우기', async () => {
    let [cur, i] = fresh();
    if (i < 0) return gone();
    const empty = emptyAfter(cur, cur.notes.filter((_, x) => x !== i), cur.archived);
    if (!await ask(empty ? '이 메모를 완전히 지울까요? 되돌릴 수 없어요. 이 칸에 남는 글이 없어서 책장에서도 빠져요.' : '이 메모를 완전히 지울까요? 되돌릴 수 없어요.')) return;
    [cur, i] = fresh();
    if (i < 0) return gone();
    $('form').close();
    const notes = cur.notes.filter((_, x) => x !== i);
    await memoSave({ ...cur, notes, ...(emptyAfter(cur, notes, cur.archived) ? { del:true } : {}) }, '메모를 지웠어요').catch(() => {});
  }, true);
  return formTools(keep, del);
}
// 메모 고치기: 본문(b)과 날짜(d)만 고친다. 첫 줄(l)과 글자 수(len)는 본문에서 다시 만들어 책등 높이·찾기·돌아보기·낱말·겹침 판정이 새 글을 따른다. 보관한 메모는 «되돌리기» 뒤에 고친다
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
function openMemoForm(w, i) {
  const n0 = w.notes[i] || {};
  const b = el('textarea', { rows:10, value:n0.b || n0.l || '' });
  const d = el('input', { type:'date', value:ISO_DAY.test(n0.d || '') ? n0.d : '' });
  const pub = pubBox(n0);
  showForm('메모 고치기', [field('본문', b, '없애려면 아래 «지우기»를 눌러요'), field('날짜', d, n0.d && !ISO_DAY.test(n0.d) ? `지금은 «${n0.d}»로 적혀 있어요. 비워 두면 그대로 둬요` : ''), pub, memoTools(w, n0)].filter(Boolean), async () => {
    const text = b.value.replace(/\r\n?/g, '\n').trim();
    if (!text) throw fail('본문을 적어 주세요. 메모를 없애려면 «지우기»를 눌러요.');
    if (memoBusy) throw fail('저장하는 중이에요. 잠시 뒤 다시 눌러 주세요.');
    const cur = D.works.get(w.id); // 창을 연 뒤에 바뀌었을 수 있어 최신 칸에서 같은 메모를 찾는다
    const at = cur ? cur.notes.findIndex((x) => x === n0 || (n0.id != null && x.id === n0.id)) : -1;
    if (at < 0) throw fail('그 사이 메모가 바뀌었어요. 창을 닫고 다시 열어 주세요.');
    await pubCheck(pub, n0.pub === true, text, 'notes', cur);
    const same = text === (n0.b || n0.l || '').replace(/\r\n?/g, '\n').trim(); // 본문을 안 고쳤으면 b·l·len은 그대로 둔다(날짜만 고칠 때 본문이 새로 생기지 않게)
    const next = setPub({ ...cur.notes[at], ...(same ? {} : { b:text, l:text.split('\n')[0].trim().slice(0, 60), len:text.length }), d:d.value || cur.notes[at].d || '' }, pub);
    S.justMemo = `${w.id}:${at}`;
    try { await memoSave({ ...cur, notes:cur.notes.map((x, k) => (k === at ? next : x)) }, '메모를 고쳤어요'); }
    finally { setTimeout(() => { S.justMemo = ''; }, 0); }
  });
}
function archivedMemos(onlyId) {
  return Object.entries(D.priv.works || {}).filter(([id, w]) => !w.del && (w.archived || []).length && (!onlyId || id === onlyId))
    .flatMap(([id, w]) => w.archived.map((n, i) => ({ id, i, n })))
    .sort((a, b) => (b.n.arcAt || '').localeCompare(a.n.arcAt || ''));
}
function openMemoBin(onlyId) {
  const rows = archivedMemos(onlyId).map(({ id, i, n }) => {
    const w = memoOwner(id);
    const text = n.b || n.l || '본문 없음', long = text.length > 420;
    const body = el('p', { className:'post-text' + (long ? ' clamp' : ''), textContent:text });
    const back = el('button', { className:'copy', type:'button', textContent:'되돌리기' });
    const { arcAt, ...restored } = n;
    back.onclick = () => memoSave({ ...w, notes:[...w.notes, restored], archived:w.archived.filter((_, x) => x !== i) }, '메모를 되돌렸어요').then(() => openMemoBin(onlyId)).catch(() => {});
    const del = el('button', { className:'copy danger', type:'button', textContent:'완전히 지우기' });
    del.onclick = async () => {
      const archived = w.archived.filter((_, x) => x !== i), empty = emptyAfter(w, w.notes, archived);
      if (!await ask(empty ? '이 메모를 완전히 지울까요? 되돌릴 수 없어요. 이 칸의 마지막 글이라 칸도 함께 사라져요.' : '이 메모를 완전히 지울까요? 되돌릴 수 없어요.')) return;
      memoSave({ ...w, archived, ...(empty ? { del:true } : {}) }, '메모를 지웠어요').then(() => openMemoBin(onlyId)).catch(() => {});
    };
    const tools = [back, del];
    if (long) {
      const more = el('button', { className:'copy', type:'button', textContent:'더 보기' });
      more.onclick = () => { more.textContent = body.classList.toggle('clamp') ? '더 보기' : '접기'; };
      tools.unshift(more);
    }
    return el('div', { className:'dup-row' }, el('p', { className:'dup-book' }, el('strong', { textContent:titleOf(w) }), el('span', { textContent:[n.d || '날짜 없음', n.arcAt ? `${n.arcAt} 보관` : ''].filter(Boolean).join(' · ') })), body, el('div', { className:'dup-tools' }, tools));
  });
  showForm(onlyId ? '이 책의 보관한 메모' : '보관한 메모', rows.length ? rows : [el('p', { className:'warn', textContent:'보관한 메모가 없어요.' })]);
}
/* ---------- 인스타와 겹치는 메모 ---------- */
// 메모와 인스타 글이 다섯 글자 묶음을 얼마나 함께 갖는지 짧은 쪽 기준으로 잰다. 실제 메모 389개에서 비율 0.3~0.8 사이 건수가 거의 안 변했다(2026-11-05)
// 짧은 인용 메모는 긴 서평에 다 들어 있어도 같은 글이 아니므로, 미리 고르는 «거의 같음»은 긴 쪽 기준으로도 절반 넘게 겹칠 때만 준다
const OVERLAP_MIN = .5, OVERLAP_SURE = .8, OVERLAP_SURE_LONG = .5, GRAMS_MIN = 20;
const gramsOf = (s) => { const t = squeeze((s || '').replace(/#\S+/g, '')), g = new Set(); for (let i = 0; i + 5 <= t.length; i++) g.add(t.slice(i, i + 5)); return g; }; // 해시태그는 글마다 비슷해 뺀다
function memoOverlaps() {
  const posts = D.posts.filter((p) => !p.blog).map((p) => ({ p, g:gramsOf(p.x) })).filter((x) => x.g.size >= GRAMS_MIN);
  const index = new Map();
  posts.forEach((x, i) => x.g.forEach((g) => { if (!index.has(g)) index.set(g, []); index.get(g).push(i); }));
  const rows = [];
  list().forEach((w) => w.notes.forEach((n, i) => {
    const g = gramsOf(n.b || n.l);
    if (g.size < GRAMS_MIN) return;
    const hits = new Map();
    g.forEach((x) => (index.get(x) || []).forEach((k) => hits.set(k, (hits.get(k) || 0) + 1)));
    let best = null, score = 0, long = 0;
    hits.forEach((c, k) => {
      const r = c / Math.min(g.size, posts[k].g.size);
      if (r > score || (r === score && best && posts[k].p.w.includes(w.id))) { score = r; best = posts[k].p; long = c / Math.max(g.size, posts[k].g.size); }
    });
    if (score >= OVERLAP_MIN) rows.push({ w, i, n, p:best, score, sure:score >= OVERLAP_SURE && long >= OVERLAP_SURE_LONG });
  }));
  return rows.sort((a, b) => b.sure - a.sure || b.score - a.score);
}
async function archiveOverlaps(picked) {
  if (memoBusy) throw fail('저장하는 중이에요. 잠시 뒤 다시 눌러 주세요.');
  memoBusy = true;
  try {
    const stamp = today(), byWork = new Map();
    picked.forEach((r) => { if (!byWork.has(r.w.id)) byWork.set(r.w.id, { w:r.w, at:new Set() }); byWork.get(r.w.id).at.add(r.i); });
    const out = {};
    byWork.forEach(({ w, at }, id) => {
      out[id] = storedWork({ ...w, notes:w.notes.filter((_, x) => !at.has(x)), archived:[...w.archived, ...w.notes.filter((_, x) => at.has(x)).map((n) => ({ ...n, arcAt:stamp }))] });
    });
    await write('works', out, 'update');
    Object.entries(out).forEach(([id, v]) => setPriv('works', id, v));
    refreshAll();
    toast(`메모 ${picked.length}개를 보관했어요`);
  } finally { memoBusy = false; }
}
function openMemoOverlap() {
  showForm('인스타 글과 겹치는 메모', [el('p', { className:'warn', role:'status', textContent:'찾는 중이에요.' })]);
  setTimeout(showMemoOverlap, 30); // 글이 많으면 재는 동안 화면이 멈추므로 안내를 먼저 그린다
}
function showMemoOverlap() {
  if (!$('form').open) return;
  if (!((D.pub || {}).posts || []).length) { showForm('인스타 글과 겹치는 메모', [el('p', { className:'warn', textContent:'아직 인스타 글을 불러오는 중이에요. 잠시 뒤 다시 눌러 주세요.' })]); return; }
  const rows = memoOverlaps();
  if (!rows.length) { showForm('인스타 글과 겹치는 메모', [el('p', { className:'warn', textContent:'겹치는 메모가 없어요.' })]); return; }
  const sure = rows.filter((r) => r.sure).length;
  const boxes = rows.map((r) => el('input', { type:'checkbox', checked:r.sure }));
  const kids = rows.map((r, x) => {
    const books = r.p.w.map((id) => { const w = D.works.get(id); return w ? titleOf(w) : ''; }).filter(Boolean).join(', ') || '책 연결 없음';
    const leaves = !r.w.pub && !r.w.recs.length && !reviewsOf(r.w).length;
    return el('div', { className:'dup-row' },
      el('label', { className:'check overlap-pick' }, boxes[x], el('strong', { textContent:titleOf(r.w) })),
      el('div', { className:'when', textContent:[r.n.d || '날짜 없음', r.sure ? '거의 같음' : '일부 겹침'].join(' · ') }),
      el('p', { className:'post-text clamp', textContent:r.n.b || r.n.l }),
      el('div', { className:'memo-foot' }, validCode(r.p.c) ? el('a', { className:'copy link', href:igUrl(r.p.c), target:'_blank', rel:'noopener', textContent:`인스타 글 ${r.p.d}` }) : el('span', { className:'memo-name', textContent:`인스타 글 ${r.p.d}` }), el('span', { className:'memo-name', textContent:books })),
      leaves ? el('small', { className:'overlap-note', textContent:'이 칸의 메모를 다 보관하면 책장에서도 빠져요.' }) : null);
  });
  showForm('인스타 글과 겹치는 메모', [el('p', { className:'warn', textContent:`겹치는 메모 ${rows.length}개 중 거의 같은 ${sure}개를 골라 뒀어요. 보관해도 «보관한 메모»에서 되돌릴 수 있어요.` }), ...kids], async () => {
    const picked = rows.filter((_, x) => boxes[x].checked);
    if (!picked.length) throw fail('보관할 메모를 골라 주세요');
    await archiveOverlaps(picked);
  }, '고른 메모 보관');
}
function syncMemoBin() {
  const b = $('memoBin');
  if (!b) return;
  const n = S.owner ? archivedMemos().length : 0;
  b.hidden = !n; b.textContent = `보관한 메모 ${n}`;
}

/* ---------- 입력 양식 ---------- */
function field(label, input, hint) { return el('label', { className:'field' }, el('span', { textContent:label }), input, hint ? el('small', { textContent:hint }) : null); }
// onSave가 없으면 저장 단추 없이 보여 준다. onSave가 'stay'를 돌려주면 창을 닫지 않는다(다음 화면을 같은 창에 그렸을 때)
function showForm(title, kids, onSave, saveLabel = '저장') {
  const close = el('button', { className:'close', type:'button', textContent:'×', ariaLabel:'닫기' });
  close.onclick = () => $('form').close();
  const err = el('p', { className:'form-err', role:'alert', hidden:true });
  const save = onSave ? el('button', { className:'btn', type:'submit', textContent:saveLabel }) : null;
  const form = $('form-body');
  form.replaceChildren(el('div', { className:'sheet-head' }, el('h2', { id:'form-title', textContent:title }), close), ...kids, err, ...(save ? [el('div', { className:'actions form-foot' }, save)] : []));
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!save) return;
    save.disabled = true; save.textContent = '저장하는 중'; err.hidden = true;
    try { if (await onSave() !== 'stay') { $('form').close(); rehostToast(); } }
    catch (ex) { console.error(ex); err.textContent = ex.userMsg || '저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요. 쓴 내용은 그대로 있어요.'; err.hidden = false; }
    save.disabled = false; save.textContent = saveLabel;
  };
  if (!$('form').open) { $('form').showModal(); pushDlg('form'); }
  $('form').scrollTop = 0;
}
/* ---------- 인터넷에서 책 찾아 채우기 ---------- */
// 교보문고·알라딘은 다른 사이트에서 바로 읽을 수 없어(직접 확인 2026-11-05) 카카오 책 검색을 앱스크립트 중계로 먼저 찾고, 키 없는 공개 목록을 그다음에 쓴다. 안 나오면 서점 검색으로 넘겨 준다
const BOOK_RELAY = 'https://script.google.com/macros/s/AKfycbyijv6_u2vViI8hsdMvmzFWwLoZXaeEoayBU0WlYdFiCNGHZrpTxpYOZ0qrBwqyFzA7/exec'; // 앱스크립트 웹 앱 주소(tools/kakao-book-relay.gs). 주소는 공개돼도 되고 키는 스크립트 속성에만 있다
const relayOn = () => !!BOOK_RELAY;
// 범용판은 국립중앙도서관 소장자료 검색(효니 결정 2026-11-09). 카카오는 효니 책장에서만 쓴다(약관 «타인에게 제공» 해석 여지, 11-05 결정)
const RELAY_SRC = LOCAL ? 'nl' : '';
const RELAY_NAME = LOCAL ? '국립중앙도서관 소장자료 검색' : '카카오 책 검색';
const tidy = (s) => String(s || '').replace(/\s+/g, ' ').trim();
// 책 칸 형식에 맞춘다: 제본 표시는 빼고, 저자는 «저자, 역자 옮김», 넷 이상이면 «첫 사람 외». 괄호 안은 판 이름·총서명일 수 있어 부제로 바꾸지 않는다
const bookTitle = (s) => tidy(s).replace(/\s*\((?:반?양장본?(?:\s*hard\s*cover)?|hard\s*cover|paperback)\)$/i, '');
const peopleText = (xs) => { const n = (xs || []).map(tidy).filter(Boolean); return n.length > 3 ? `${n[0]} 외` : n.join(', '); };
function bookAuthors(authors, translators) {
  const a = peopleText(authors), tr = peopleText(translators);
  return tr ? (a ? `${a}, ` : '') + `${tr} 옮김` : a;
}
async function getJson(url, ms = 5000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal:c.signal }); if (!r.ok) throw new Error(String(r.status)); return await r.json(); } finally { clearTimeout(t); }
}
const uniqueBooks = (rows) => { const seen = new Set(); return rows.filter((b) => { const k = dupNorm(b.t + b.a + b.p); if (seen.has(k)) return false; seen.add(k); return true; }); };
const isbnOf = (s) => { const xs = String(s || '').split(/\s+/).filter(Boolean); return xs.find((x) => x.length === 13) || xs[0] || ''; }; // 카카오는 «10자리 13자리»로 준다
async function fromRelay(q) {
  const r = await getJson(`${BOOK_RELAY}?q=${encodeURIComponent(q)}${RELAY_SRC ? `&src=${RELAY_SRC}` : ''}`, 12000); // 앱스크립트는 오래 쉬면 깨어나는 데 몇 초 걸린다
  if (!r.ok) throw new Error(r.error || 'relay');
  return uniqueBooks((r.books || []).map((b) => ({ t:bookTitle(b.title), a:bookAuthors(b.authors, b.translators), p:tidy(b.publisher), y:b.year || '', isbn:isbnOf(b.isbn), kdc:b.kdc || '', kid:!!b.kid }))); // isbn·kdc는 주제 저절로 고르기에만 쓰고 저장하지 않는다
}
async function searchBooks(q) {
  const enc = encodeURIComponent(q);
  const fits = (b) => hasAll(squeeze(`${b.t} ${b.a}`), q); // 출판사는 넣지 않는다(«사피엔»이 출판사 이름만 맞는 책을 맞다고 보지 않게)
  const sources = [
    relayOn() && (async () => {
      const rows = await fromRelay(q);
      if (rows.some(fits)) return rows;
      // 카카오·국립중앙도서관은 낱말 단위로 찾아 잘린 제목(«레슨 인 케미»)이나 띄엄띄엄 적은 말(«코끼리 장례식»)을 놓친다. 낱말을 줄여 다시 찾고 찾는 말이 다 들어 있는 책만 남긴다
      const words = q.split(/\s+/);
      const tries = words.length < 2 ? [] : [...new Set([words.slice(0, -1).join(' '), ...words.filter((x) => x.length >= 2)])].filter((x) => x !== q).slice(0, 3);
      const more = (await Promise.allSettled(tries.map(fromRelay))).flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).filter(fits);
      return more.length ? uniqueBooks(more).slice(0, 8) : rows;
    }),
    async () => ((await getJson(`https://www.googleapis.com/books/v1/volumes?maxResults=6&printType=books&q=${enc}`)).items || []).map(({ volumeInfo:v }) => ({ t:v.title || '', a:(v.authors || []).join(', '), p:v.publisher || '', y:(v.publishedDate || '').slice(0, 4) })),
    async () => ((await getJson(`https://openlibrary.org/search.json?limit=6&fields=title,author_name,publisher,first_publish_year&q=${enc}`)).docs || []).map((d) => ({ t:d.title || '', a:(d.author_name || []).join(', '), p:(d.publisher || [])[0] || '', y:d.first_publish_year ? String(d.first_publish_year) : '' })),
  ].filter(Boolean);
  let failed = false, loose = [];
  for (const source of sources) {
    try {
      const rows = (await source()).filter((b) => b.t), fit = rows.filter(fits);
      if (fit.length) return { rows:[...fit, ...rows.filter((b) => !fits(b))], failed:false };
      if (!loose.length) loose = rows;
    } catch (e) { failed = true; console.warn('책 찾기 실패', e.message); }
  }
  return { rows:loose, failed:failed && !loose.length, loose:!!loose.length };
}
const STORES = [['교보문고', 'https://search.kyobobook.co.kr/search?keyword='], ['알라딘', 'https://www.aladin.co.kr/search/wsearchresult.aspx?SearchTarget=Book&SearchWord=']];
function bookLookup(apply) {
  const q = el('input', { type:'search', maxLength:100, placeholder:'제목이나 저자로 찾기', ariaLabel:'인터넷에서 책 찾기' });
  const go = el('button', { className:'btn ghost', type:'button', textContent:'찾기' });
  const found = el('ul', { className:'found' });
  const msg = el('p', { className:'warn', role:'status', hidden:true });
  const links = STORES.map(([name, url]) => {
    const a = el('a', { className:'copy', href:url, target:'_blank', rel:'noopener noreferrer', textContent:name });
    q.addEventListener('input', () => { a.href = url + encodeURIComponent(q.value.trim()); });
    return a;
  });
  let run = 0;
  const search = async () => {
    const word = q.value.trim();
    if (!word) { q.focus(); return; }
    const mine = ++run;
    go.disabled = true; msg.hidden = false; msg.textContent = '찾는 중이에요'; found.replaceChildren();
    const { rows, failed, loose } = await searchBooks(word);
    if (mine !== run) return;
    go.disabled = false;
    msg.textContent = loose ? '찾는 말이 다 들어 있는 책은 없어요. 제목의 낱말을 끝까지 적어 보거나 서점에서 찾아 주세요. 아래는 비슷한 결과예요.' : rows.length ? '맞는 책을 누르면 아래 칸이 채워져요.' : failed ? '지금은 책 목록에서 정보를 받아 오지 못했어요(찾는 곳이 바쁘거나 인터넷이 끊겼을 수 있어요). 아래 칸에 제목과 저자를 직접 적거나, 서점에서 찾아 옮겨 주세요.' : '여기서는 찾지 못했어요. 서점에서 찾아 아래 칸에 적어 주세요.';
    found.replaceChildren(...rows.map((b) => {
      const pick = el('button', { type:'button' }, el('strong', { textContent:b.t }), el('span', { textContent:[b.a, b.p, b.y].filter(Boolean).join(' · ') }));
      pick.onclick = () => { apply(b); found.replaceChildren(); msg.textContent = `«${b.t}» 정보를 채웠어요. 틀린 곳이 있으면 고쳐 주세요.`; };
      return el('li', {}, pick);
    }));
  };
  go.onclick = search;
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }); // 양식이 저장되지 않게
  // 찾는 말이 실제로 가는 곳만 적는다
  const note = el('small', { textContent:relayOn() ? `찾는 말만 구글 앱스크립트를 거쳐 ${RELAY_NAME}으로 보내요. 거기서 못 찾으면 구글 도서와 오픈 라이브러리로도 보내요. 내 기록은 보내지 않아요.` : '찾는 말만 구글 도서와 오픈 라이브러리로 보내요. 내 기록은 보내지 않아요.' });
  return el('div', { className:'lookup' }, el('div', { className:'lookup-row' }, q, go), msg, found,
    el('div', { className:'store-links' }, el('span', { textContent:'서점에서 찾기' }), links), note);
}

/* ---------- 겹치는 책 고치기 ---------- */
const dupNorm = (s) => (s || '').replace(/[\s:·,.\-()«»"'!?~]/g, '').toLowerCase();
const pairKey = (a, b) => [a, b].sort().join('~');
function dupPairs() {
  const skip = (D.priv.meta || {}).notDup || {};
  const named = list().filter((w) => w.t && w.id).map((w) => [w, dupNorm(w.t)]).filter(([, n]) => n);
  const out = [];
  named.forEach(([a, x], i) => {
    for (let j = i + 1; j < named.length; j++) {
      const [b, y] = named[j];
      // 왓챠 작품은 코드가 다르면 다른 작품이고(리메이크 등), 같은 제목의 책·공연과도 다른 작품이다
      if (a.wc && b.wc) continue;
      if ((a.wc || b.wc) && a.k !== b.k) continue;
      const same = x === y;
      if ((same || (Math.min(x.length, y.length) >= 3 && (x.startsWith(y) || y.startsWith(x)))) && !skip[pairKey(a.id, b.id)]) out.push({ a, b, same });
    }
  });
  return out.sort((p, q) => q.same - p.same);
}
const kindName = (w) => (KINDS.find((k) => k[0] === w.k) || [,''])[1];
const bookCounts = (w) => `기록 ${w.recs.length} · 메모 ${w.notes.length}${w.marks.length ? ` · 밑줄 ${w.marks.length}` : ''} · 서평 ${reviewsOf(w).length}`;
const bookMeta = (w) => [kindName(w), w.a || '저자 없음', w.y, bookCounts(w)].filter(Boolean).join(' · ');
const bookWeight = (w) => w.recs.length + w.notes.length + w.marks.length + reviewsOf(w).length + (w.k === 'book' ? .5 : 0) + (w.a ? .25 : 0) - (w.guess || !w.t ? 100 : 0); // 추정 제목이나 제목 없는 칸보다 확인된 제목을 먼저 권한다
function openDupTool() {
  const pairs = dupPairs();
  const row = ({ a, b }) => {
    const go = el('button', { className:'btn', type:'button', textContent:'합치기' });
    go.onclick = () => openMergeForm(a, b, true);
    const no = el('button', { className:'copy', type:'button', textContent:'다른 책이에요' });
    no.onclick = async () => {
      try { await write(`meta/notDup/${pairKey(a.id, b.id)}`, true); const m = D.priv.meta = D.priv.meta || {}; m.notDup = { ...(m.notDup || {}), [pairKey(a.id, b.id)]:true }; refreshAll(); openDupTool(); } catch (e) { saveFailed(e); }
    };
    const line = (w) => el('p', { className:'dup-book' }, el('strong', { textContent:w.t }), el('span', { textContent:bookMeta(w) }));
    return el('div', { className:'dup-row' }, line(a), line(b), el('div', { className:'dup-tools' }, go, no));
  };
  const sec = (title, rows) => (rows.length ? el('section', { className:'dup-sec' }, el('h3', { className:'sec', textContent:`${title} ${rows.length}` }), rows.map(row)) : null);
  const kids = [sec('제목이 같아요', pairs.filter((p) => p.same)), sec('제목이 비슷해요', pairs.filter((p) => !p.same))].filter(Boolean);
  if (!kids.length) kids.push(el('p', { className:'warn', textContent:'겹쳐 보이는 책이 없어요.' }));
  const done = Object.entries(D.priv.works || {}).filter(([, w]) => w.del && w.into).sort((x, y) => (y[1].at || 0) - (x[1].at || 0)); // 먼저 되돌릴 수 있는 최근 합치기가 위로
  if (done.length) kids.push(el('section', { className:'dup-sec' }, el('h3', { className:'sec', textContent:`합친 책 ${done.length}` }), done.map(([id, w]) => {
    const back = el('button', { className:'copy', type:'button', textContent:'되돌리기' });
    back.onclick = async () => { if (await ask('이 합치기를 되돌릴까요? 합친 뒤 고친 저자·출판사·주제·연도는 합치기 전 값으로 돌아가요. 기록은 고친 내용 그대로 원래 칸으로 돌아가요.', '되돌리기')) undoMerge(id).then(openDupTool).catch(saveFailed); };
    const keep = D.priv.works[w.into]; // 남긴 책을 나중에 책장에서 뺐어도 되돌릴 수 있게 저장된 값을 본다
    return el('div', { className:'dup-row' }, el('p', { className:'dup-book' }, el('strong', { textContent:w.t || '제목 없음' }), el('span', { textContent:keep ? `«${keep.t || '제목 없음'}»에 합침${w.at ? ` · ${new Date(w.at + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')}` : ''}` : '합친 책을 찾지 못함' })), el('div', { className:'dup-tools' }, back));
  })));
  showForm('겹치는 책 고치기', kids);
}
function openMergePick(w) {
  const pick = bookPicker(true, w.id);
  showForm(`«${titleOf(w)}»과 같은 책 고르기`, [field('같은 책', pick.input, '읽은 책에 있는 제목을 골라 주세요'), pick.dl], async () => {
    const hit = pick.pick();
    if (!hit) throw fail('아래 목록에서 책을 눌러 주세요');
    openMergeForm(w, hit, false);
    return 'stay';
  }, '다음');
}
function openMergeForm(a, b, backToList) {
  const first = bookWeight(b) > bookWeight(a) ? b : a;
  const opts = [a, b].map((w) => el('label', { className:'keep-opt' }, el('input', { type:'radio', name:'keep', value:w.id, checked:w === first }), el('span', { className:'dup-book' }, el('strong', { textContent:titleOf(w) }), el('span', { textContent:bookMeta(w) }))));
  const note = LOCAL ? '' : ' 공개 화면에는 다음 공개 반영 때 들어가요.';
  showForm('두 칸을 한 권으로 합치기', [el('p', { className:'warn', textContent:'남길 칸을 골라 주세요. 다른 칸의 기록·메모·밑줄·서평 연결을 모두 옮기고, 비어 있는 저자·출판사도 채워요.' + note }), ...opts, el('p', { className:'warn', textContent:'잘못 합쳤으면 «겹치는 책 고치기»에서 되돌릴 수 있어요.' })], async () => {
    const keepId = $('form-body').querySelector('input[name="keep"]:checked').value;
    const keep = keepId === a.id ? a : b, drop = keep === a ? b : a;
    await mergeWorks(keep, drop);
    if (backToList) { openDupTool(); return 'stay'; }
    S.cur = { id:keep.id };
    reshow();
    return undefined;
  }, '합치기');
}
const earliest = (x, y) => [x, y].filter(Boolean).sort()[0] || '';
async function mergeWorks(keep, drop) {
  // 옮긴 기록에 어디서 왔는지 표시한다. 되돌릴 때 이 표시로 찾으므로 합친 뒤 고친 내용도 함께 돌아간다
  const tag = (x) => ({ ...x, from:[...(x.from || []), drop.id] });
  const src = isOnlyMe(drop) && !drop.only && !isOnlyMe(keep) ? { ...drop, t:'', a:'', p:'', th:[], known:false, guess:false, y:'', fd:'' } : drop;
  const recs = [...keep.recs, ...drop.recs.map(tag)].sort((x, y) => (x.d || '').localeCompare(y.d || ''));
  const next = storedWork({ ...keep, t:keep.t || src.t || '', recs, notes:[...keep.notes, ...drop.notes.map(tag)], archived:[...keep.archived, ...drop.archived.map(tag)], marks:[...keep.marks, ...drop.marks.map(tag)], a:keep.a || src.a || '', p:keep.p || src.p || '', th:[...new Set([...keep.th, ...src.th])], known:!!(keep.known || src.known), y:earliest(keep.y, src.y), fd:earliest(keep.fd, src.fd) });
  if (recs.length) { if (recs.every((r) => r.st === 'unread')) next.unread = true; else delete next.unread; }
  else if (keep.unread || drop.unread) next.unread = true;
  if (keep.guess && src.known && !src.guess) delete next.guess; // 확인된 책과 합쳤으면 더는 추정이 아니다
  if (keep.only || drop.only) next.only = true; // 한쪽이라도 나만 보기로 잠갔으면 합친 뒤에도 잠근다
  const was = { ...(keep.t ? {} : { t:'' }), a:keep.a || '', p:keep.p || '', th:keep.th, known:keep.known, unread:keep.unread, guess:keep.guess, only:keep.only, y:keep.y || '', fd:keep.fd || '' };
  const gone = storedWork({ ...drop, recs:[], notes:[], archived:[], marks:[], del:true, into:keep.id, at:Date.now(), was });
  await write('works', { [keep.id]:next, [drop.id]:gone }, 'update');
  setPriv('works', keep.id, next);
  setPriv('works', drop.id, gone);
  refreshAll();
  toast(`«${titleOf(keep)}» 한 권으로 합쳤어요`);
}
const cameFrom = (x, id) => (x.from || []).slice(-1)[0] === id;
const stepBack = ({ from, ...x }) => { const rest = (from || []).slice(0, -1); return rest.length ? { ...x, from:rest } : x; };
// 나중에 합친 것부터 되돌린다. 그래야 합치기 전 값(was)으로 돌아가도 앞뒤가 맞는다
async function undoMerge(id) {
  const stored = D.priv.works[id];
  const keep = D.priv.works[stored.into];
  if (!keep) throw fail('합친 책을 찾지 못했어요');
  if (keep.del && keep.into) throw fail(`«${keep.t || '제목 없음'}»의 합치기를 먼저 되돌려 주세요`);
  const later = Object.values(D.priv.works).find((w) => w.del && w.into === stored.into && (w.at || 0) > (stored.at || 0));
  if (later) throw fail(`나중에 합친 «${later.t || '제목 없음'}»을 먼저 되돌려 주세요`);
  const { del, into, was, at, ...rest } = stored;
  const recs = keep.recs || [], notes = keep.notes || [], archived = keep.archived || [], marks = keep.marks || [];
  const back = JSON.parse(JSON.stringify({ ...rest, recs:recs.filter((x) => cameFrom(x, id)).map(stepBack), notes:notes.filter((x) => cameFrom(x, id)).map(stepBack), archived:archived.filter((x) => cameFrom(x, id)).map(stepBack), marks:marks.filter((x) => cameFrom(x, id)).map(stepBack) }));
  const next = JSON.parse(JSON.stringify({ ...keep, ...(was || {}), th:(was && was.th) || [], recs:recs.filter((x) => !cameFrom(x, id)), notes:notes.filter((x) => !cameFrom(x, id)), archived:archived.filter((x) => !cameFrom(x, id)), marks:marks.filter((x) => !cameFrom(x, id)) }));
  ['unread', 'guess', 'known', 'only'].forEach((k) => { if (!was || was[k] === undefined) delete next[k]; }); // 합치기 전에 없던 표시는 지운다
  await write('works', { [stored.into]:next, [id]:back }, 'update');
  setPriv('works', stored.into, next);
  setPriv('works', id, back);
  refreshAll();
  toast('합치기 전으로 되돌렸어요');
}
$('fixDups').onclick = openDupTool;
if ($('memoBin')) $('memoBin').onclick = () => openMemoBin();
if ($('memoOverlap')) $('memoOverlap').onclick = openMemoOverlap;
const fail = (m) => { const e = new Error(m); e.userMsg = m; return e; };
function themeChecks(selected) {
  const box = el('div', { className:'checks' }, THEMES.map(([t]) => el('label', { className:'check' }, el('input', { type:'checkbox', value:t, checked:selected.includes(t) }), t)));
  box.values = () => [...box.querySelectorAll('input:checked')].map((i) => i.value);
  box.set = (vals) => box.querySelectorAll('input').forEach((i) => { i.checked = vals.includes(i.value); });
  // 저절로 켠 칩이 한 번 물든다(.just, 움직임 끔·이북리더기에서는 css가 끈다)
  box.flash = (v) => { const i = [...box.querySelectorAll('input')].find((x) => x.value === v); if (!i) return; const lab = i.closest('label'); lab.classList.remove('just'); void lab.offsetWidth; lab.classList.add('just'); };
  return box;
}
// 별점은 0.5 단위(효니 결정 2026-11-05). 0은 «최하», 0.5는 ½
const RATING_STEPS = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, .5, 0];
function starText(r) { return r === 0 ? '최하' : '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : ''); }
function ratingSelect(v) {
  const s = el('select', {}, ...[['', '남기지 않음'], ...RATING_STEPS.map((r) => [String(r), starText(r)])].map(([val, t]) => el('option', { value:val, textContent:t })));
  s.value = v == null ? '' : String(v);
  return s;
}
// 인스타 글 추가의 «아직 읽는 중» 칸. 미완독 기록이 있는 책에서는 칸이 숨는다(«책 고치기»에서 다 읽음으로 바꾼다)
const readingCheck = (w, label = ' 아직 읽는 중이에요') => el('label', { className:'check' }, el('input', { type:'checkbox', checked:!!(w && isReading(w)) }), label);
// 주제 저절로 고르기(2026-11-14): 책 찾기로 책을 고르면 주제 칩이 하나도 안 켜져 있을 때만 하나를 켠다. 같은 저자 책 → 도서관 분류(ISBN으로 국립중앙도서관) 순(js/kdc.js)
const themeShelf = (exceptId) => list().filter((x) => x.k === 'book' && x.known && x.th.length && x.id !== exceptId).map((x) => ({ id:x.id, a:x.a, th:x.th }));
async function autoTheme(found, id) {
  const me = { id, a:found.a || '', th:[] }, shelf = themeShelf(id);
  if (authorTheme(me, shelf) || found.kdc || !found.isbn || !relayOn()) return pickTheme(me, shelf, found.kdc, found.kid);
  try { // 카카오에는 분류가 없어 ISBN으로 국립중앙도서관에 한 번 더 묻는다(제목으로 찾으면 다른 판이 먼저 나온다)
    const r = await getJson(`${BOOK_RELAY}?src=nl&q=${encodeURIComponent(found.isbn)}`, 12000), b = r.ok && (r.books || [])[0];
    return pickTheme(me, shelf, b ? b.kdc : '', b ? b.kid : false);
  } catch (e) { return null; }
}
// 읽기 상태 고르기(«책 고치기»): 읽는 중 / 다 읽음 두 칸. 다 읽음을 새로 고를 때만 다 읽은 날·별점이 보인다
function readingPicker(w) {
  const done = hasDoneRec(w), now = isReading(w) ? 'reading' : 'done', at = lastUnreadAt(w);
  const box = el('fieldset', { className:'field reading-pick' }, el('legend', { textContent:'읽기 상태' }));
  if (done) {
    box.append(el('p', { className:'seg-fixed', textContent:'다 읽음' }), el('small', { textContent:'다 읽은 기록이 있어요. 다시 읽는 중이면 책 창의 «기록 더하기»에서 «아직 다 못 읽음»을 켜요.' }));
    return { box, value:() => 'done', extra:() => ({}) };
  }
  const opts = [['reading', '읽는 중'], ['done', '다 읽음']].map(([v, l]) => el('label', { className:'seg' }, el('input', { type:'radio', name:'readstate', value:v, checked:v === now }), el('span', { textContent:l })));
  const d = el('input', { type:'date', value:at >= 0 ? today() : '' });
  const r = ratingSelect(at >= 0 ? w.recs[at].r : null);
  const more = el('div', { className:'reading-more', hidden:true }, field('다 읽은 날', d, at >= 0 ? '읽는 중이던 기록(가장 최근 것)이 이 날짜의 다 읽은 기록으로 바뀌어요' : '비워 두면 기록은 더하지 않고 다 읽음으로만 바꿔요'), field('별점', r));
  const value = () => (box.querySelector('input:checked') || {}).value || now;
  box.addEventListener('change', () => { more.hidden = !(value() === 'done' && now === 'reading'); });
  box.append(el('div', { className:'segs' }, opts), more);
  return { box, value, extra:() => ({ d:d.value, r:r.value === '' ? null : +r.value }) };
}
function openBookForm(w, { pre } = {}) { // pre: 서재에만 있던 책을 읽은 책으로 옮길 때
  const isNew = !w, seed = w || pre || {};
  let newId = ''; // 저장을 다시 눌러도 같은 칸에 쓰여 책이 겹치지 않는다
  const t = el('input', { type:'text', required:true, value:seed.t || '' });
  const a = el('input', { type:'text', value:seed.a || '' });
  const p = el('input', { type:'text', value:seed.p || '' });
  const k = el('select', {}, ...KINDS.filter(([x]) => x !== 'all' && x !== 'reading').map(([x, l]) => el('option', { value:x, textContent:l })));
  k.value = w ? w.k : 'book';
  const th = themeChecks(seed.th || []);
  const thNote = el('small', { className:'auto-note', role:'status', hidden:true });
  let pickRun = 0;
  const applyFound = async (f) => {
    t.value = f.t; a.value = f.a || a.value; p.value = f.p || p.value;
    if (th.values().length || k.value !== 'book') return; // 이미 고른 주제는 건드리지 않는다
    const mine = ++pickRun;
    thNote.hidden = false; thNote.textContent = '주제 찾는 중이에요';
    const got = await autoTheme(f, w ? w.id : '');
    if (mine !== pickRun) return;
    if (got && !th.values().length) { th.set([got.th]); thNote.textContent = `골라 둔 주제: ‹${got.th}› · ${got.why} 기준. 틀리면 눌러 고쳐요.`; th.flash(got.th); }
    else if (!got) thNote.textContent = '주제는 찾지 못했어요. 골라 주세요.';
    else thNote.hidden = true;
  };
  th.addEventListener('change', () => { pickRun++; thNote.hidden = true; });
  const kids = [bookLookup(applyFound), field('제목', t), field('저자', a), field('출판사', p), field('종류', k), el('div', { className:'field' }, el('span', { textContent:'주제' }), th, thNote)];
  let d, r, l, b, unfinished, reading = null, only = null;
  if (isNew) {
    unfinished = el('label', { className:'check' }, el('input', { type:'checkbox' }), ' 아직 읽는 중이에요');
    d = el('input', { type:'date', value:today() }); r = ratingSelect(null); l = el('input', { type:'text' }); b = el('textarea', { rows:6 });
    kids.push(field('읽은 날', d), unfinished, field('별점', r), field('한 줄 평', l), field('기록', b));
  } else {
    if (w.k === 'book') { reading = readingPicker(w); kids.push(reading.box); k.addEventListener('change', () => { reading.box.hidden = k.value !== 'book'; }); }
    if (!LOCAL) { // «이 책 전체 나만 보기»(전에는 책 창에 따로 있던 칸)
      only = el('input', { type:'checkbox', checked:isOnlyMe(w) });
      kids.push(el('div', { className:'only-box' + (isOnlyMe(w) ? ' on' : '') }, el('label', { className:'check' }, only, ' 이 책 전체 나만 보기'), el('small', { textContent:onlyMeText(w) })));
    }
  }
  const save = async () => {
    const title = t.value.trim();
    if (!title) throw fail('제목을 적어 주세요');
    if (isNew && !newId) newId = DEMO ? `demo${Date.now()}` : await fb.newId();
    let base = isNew ? { id:newId, recs:[], notes:[], known:true } : { ...w };
    if (reading && k.value === 'book') base = readingPatch(base, reading.value(), reading.extra());
    Object.assign(base, { t:title, a:a.value.trim(), p:p.value.trim(), k:k.value, th:th.values(), known:true });
    delete base.guess;
    if (isNew) { const rec = { d:d.value, r:r.value === '' ? null : +r.value, l:l.value.trim(), b:b.value.trim() }; if (unfinished.querySelector('input').checked) { rec.st = 'unread'; base.unread = true; } base.recs = [rec]; base.y = (d.value || today()).slice(0, 4); base.fd = d.value || today(); }
    if (only && only.checked !== isOnlyMe(w)) { // 예전 책 창 칸과 같은 규칙: 책·영화는 풀면 only를 지워 원래 기준으로
      base.only = only.checked;
      if (!only.checked && ['book', 'film'].includes(base.k || 'book')) delete base.only;
    }
    await saveWork(base, isNew ? (base.unread ? '읽는 중인 책으로 꽂았어요' : '읽은 책에 꽂았어요') : '고쳤어요');
    if (pre) { await saveLib({ ...pre, w:base.id }, '읽은 책과 이었어요'); S.cur = { lib:pre.id }; }
    if ($('sheet').open) openBook(base.id, $('sheet').returnEl);
    else { // 다른 종류를 보고 있어도 꽂힌 걸 바로 보여 준다. 양식의 기록이 먼저 빠진 뒤 연다
      let tries = 0;
      const go = () => { if (((history.state && history.state.dlg) === 'form' || $('form').open) && ++tries < 40) setTimeout(go, 50); else openBook(base.id, $('addBook')); };
      setTimeout(go, 50);
    }
  };
  const del = w ? el('button', { className:'copy danger', type:'button', textContent:'책장에서 빼기' }) : null;
  if (del) del.onclick = async () => { if (!await ask(`«${titleOf(w)}»을 책장에서 뺄까요?${w.marks.length ? ` 밑줄 ${w.marks.length}개도 함께 안 보이게 돼요.` : ''}`, '빼기')) return; try { await saveWork({ ...w, del:true }, '책장에서 뺐어요'); $('form').close(); if ($('sheet').open) $('sheet').close(); } catch (e) { toast('빼지 못했어요'); } };
  if (del) kids.push(el('div', { className:'memo-foot' }, del));
  showForm(isNew ? '책 추가' : '책 고치기', kids, save);
}
function openRecForm(w, i) {
  const r = i >= 0 ? w.recs[i] : {};
  const d = el('input', { type:'date', value:r.d || today() });
  const rt = ratingSelect(r.r);
  const st = el('label', { className:'check' }, el('input', { type:'checkbox', checked:i >= 0 ? r.st === 'unread' : isReading(w) }), ' 아직 다 못 읽음'); // 읽는 중인 책에 새 기록을 더하면 읽는 중 그대로 둔다
  const l = el('input', { type:'text', value:r.l || '' });
  const b = el('textarea', { rows:8, value:r.b || '' });
  const pub = pubBox(r);
  const del = i >= 0 ? formBtn('지우기', () => delRec(w, i, () => $('form').close()), true) : null;
  const kids = [field('날짜', d), field('별점', rt), st, field('한 줄 평', l), field('기록', b), pub, formTools(del)].filter(Boolean);
  const save = async () => {
    const body = b.value.trim() || l.value.trim(); // 공개되는 글: 본문, 비면 한 줄 평(tools/publish.js와 같음)
    await pubCheck(pub, r.pub === true, body, 'recs', w);
    const next = setPub({ ...r, d:d.value, r:rt.value === '' ? null : +rt.value, l:l.value.trim(), b:b.value.trim() }, pub);
    if (st.querySelector('input').checked) next.st = 'unread'; else delete next.st;
    const recs = [...w.recs];
    if (i >= 0) recs[i] = next; else recs.push(next);
    await saveWork({ ...w, recs, unread:recs.every((x) => x.st === 'unread') }, '기록을 저장했어요');
    openBook(w.id, $('sheet').returnEl);
  };
  // 공개·지우기는 이 창 아래에 있다(2026-11-14)
  showForm(i >= 0 ? '기록 고치기' : '기록 더하기', kids, save);
}
function bookPicker(required, exceptId) {
  const opts = list().filter((w) => w.t && w.id !== exceptId).sort((a, b) => a.t.localeCompare(b.t, 'ko'));
  const name = (w) => w.t + (w.a ? ` / ${w.a}` : '');
  const input = el('input', { type:'text', required, autocomplete:'off', placeholder:'제목이나 저자를 조금만 적어도 찾아요' });
  const dl = el('ul', { className:'found picks', hidden:true });
  let chosen = null; // 같은 제목·저자의 책이 둘이어도 누른 그 책으로 잇는다
  const pick = () => { if (chosen) return chosen; const same = opts.filter((w) => name(w) === input.value || w.t === input.value.trim()); return same.length === 1 ? same[0] : undefined; };
  const choose = (w) => { chosen = w; input.value = name(w); dl.hidden = true; dl.replaceChildren(); input.dispatchEvent(new Event('change', { bubbles:true })); };
  input.addEventListener('input', () => {
    const q = squeeze(input.value);
    chosen = null;
    let hits = !q || pick() ? [] : opts.filter((w) => hasAll(w.nameHay, input.value)).sort((a, b) => squeeze(b.t).includes(q) - squeeze(a.t).includes(q));
    if (q && !hits.length && !pick()) hits = opts.filter((w) => titleInOrder(w, input.value));
    dl.hidden = !hits.length;
    dl.replaceChildren(...hits.slice(0, 8).map((w) => {
      const b = el('button', { type:'button' }, el('strong', { textContent:w.t }), el('span', { textContent:[w.a, w.p, w.y].filter(Boolean).join(' · ') }));
      b.onclick = () => choose(w);
      return el('li', {}, b);
    }));
    if (hits.length > 8) dl.append(el('li', { className:'picks-more', textContent:`${hits.length - 8}권 더 있어요. 조금 더 적어 주세요.` }));
  });
  return { input, dl, pick };
}
function openLinkForm(p) {
  const b = bookPicker(true);
  showForm('이 글을 어느 책과 이을까요?', [field('책', b.input), b.dl], async () => {
    const hit = b.pick();
    if (!hit) throw fail('아래 목록에서 책을 눌러 주세요. 없는 책이면 «+ 책 추가»로 먼저 꽂아 주세요.');
    await saveLinks(p, [...new Set([...p.w, hit.id])], '이었어요');
  }, '잇기');
}
function openPostForm() {
  const url = el('input', { type:'url', required:true, placeholder:'https://www.instagram.com/p/…' });
  const d = el('input', { type:'date', value:today() });
  const x = el('textarea', { rows:8, required:true });
  const b = bookPicker(false);
  // 읽는 도중에 쓴 서평이면 책을 읽는 중으로 둔다. 서평을 이어도 다 읽은 책으로 바뀌지 않게
  const still = readingCheck(null, ' 이 책은 아직 읽는 중이에요');
  const syncStill = () => { const w = b.input.value.trim() ? b.pick() : null; still.hidden = !canMarkReading(w) || w.recs.some((r) => r.st === 'unread'); /* 미완독 기록이 있으면 이미 읽는 중이고 여기서 끄지 않는다 */ if (w) still.querySelector('input').checked = isReading(w); };
  b.input.addEventListener('change', syncStill); b.input.addEventListener('input', syncStill); syncStill();
  showForm('인스타 서평 추가', [field('글 주소', url), field('올린 날', d), field('글', x, '인스타 글을 복사해 붙여 넣어 주세요'), field('책', b.input, '비워 두면 결산·일상 글로 들어가요'), b.dl, still], async () => {
    const m = url.value.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel)\/([A-Za-z0-9_-]+)/);
    if (!m) throw fail('인스타 글 주소를 넣어 주세요');
    const c = m[1];
    if (!x.value.trim()) throw fail('글을 넣어 주세요');
    if (D.posts.some((p) => p.c === c)) throw fail('이미 들어 있는 글이에요');
    const hit = b.input.value.trim() ? b.pick() : null;
    if (b.input.value.trim() && !hit) throw fail('아래 목록에서 책을 눌러 주세요. 없는 책이면 «+ 책 추가»로 먼저 꽂아 주세요.');
    const val = { c, d:d.value || today(), x:x.value.trim(), k:hit ? 'review' : 'etc', w:hit ? [hit.id] : [] };
    const mark = hit && !still.hidden && canMarkReading(hit) && still.querySelector('input').checked !== isReading(hit);
    await write(`igAdded/${c}`, val);
    setPriv('igAdded', c, val);
    if (mark) { const next = { ...hit, recs:[...hit.recs], notes:[...hit.notes] }; setReading(next, still.querySelector('input').checked); await saveWork(next, '서평을 넣었어요'); return; }
    refreshAll();
    toast('서평을 넣었어요');
  });
}

/* ---------- 머리·탭·로그인 ---------- */
function setLede() {
  if (LOCAL) {
    const read = list().filter((w) => w.k === 'book' && !isReading(w)).length, now = list().filter(isReading).length;
    $('lede').textContent = `읽은 책 ${read}권` + (now ? `, 읽는 중 ${now}권` : '');
    $('foot').textContent = fb.syncStatus().on ? '기록은 이 기기와 내 구글 드라이브에 저장돼요. 이 책장을 만든 사람에게는 가지 않아요. 드라이브와 맞출 수 없을 때도 이 기기에는 그대로 저장되고, 연결되면 알아서 맞춰요.' : '기록은 이 기기에만 저장되고 어디로도 보내지 않아요. 여러 기기에서 쓰려면 «내 구글 드라이브 연결»을 켜 보세요. 브라우저 기록을 지우거나 기기를 바꾸면 사라지고, 아이폰 사파리는 오래 안 쓰면 지워질 수 있어요. 가끔 «파일로 저장»을 눌러 두세요. 홈 화면에 추가하면 더 안전한데, 아이폰은 저장 공간이 따로라 추가하기 전에 파일로 저장한 뒤 홈 화면 앱에서 불러와 주세요.';
    return;
  }
  const books = list().filter((w) => w.k === 'book' && !isHidden(w) && !isReading(w)).length, now = list().filter((w) => isReading(w) && !isHidden(w)).length, reviews = D.posts.filter((p) => p.k === 'review' && !p.blog).length, blogs = D.posts.filter((p) => p.blog).length;
  $('lede').textContent = `책 ${books}권` + (now ? `, 읽는 중 ${now}권` : '') + `, 인스타 서평 ${reviews}개` + (blogs ? `, 블로그 글 ${blogs}개` : '');
  $('foot').textContent = S.owner
    ? '내 기록과 메모, 별점은 로그인한 나에게만 보여요. 고친 내용은 바로 저장되고, 공개 화면에는 다음 공개 반영 때 들어가요. 제목을 못 찾은 메모는 점선 책등으로 꽂아 뒀어요.'
    : '@hyonnie_books와 블로그 «효니의 기록»에 쓴 글을 책별로 모았어요.';
}
function applyName() {
  const name = ((D.priv.meta || {}).name || '').trim() || '나의 책장';
  document.querySelector('.cover h1').textContent = name;
  document.title = name;
}
function openNameForm() {
  const name = el('input', { type:'text', maxLength:40, value:(D.priv.meta || {}).name || '', placeholder:'나의 책장' });
  showForm('책장 이름', [field('이름', name, '비워 두면 «나의 책장»으로 보여요')], async () => {
    await write('meta/name', name.value.trim());
    setPriv('meta', 'name', name.value.trim());
    applyName();
    toast('이름을 바꿨어요');
  });
}
async function saveBackup() {
  const text = await fb.exportText();
  const file = new File([text], `my-bookshelf-${today()}.json`, { type:'application/json' });
  // 폰은 공유 창이 파일 저장의 확실한 길이다. 그 밖에는 내려받기
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files:[file] })) {
    try { await navigator.share({ files:[file] }); } catch (e) { if (e.name === 'AbortError') return; throw e; }
  } else {
    const a = el('a', { href:URL.createObjectURL(file), download:file.name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  await fb.markBackup(today());
  setPriv('meta', 'lastBackup', today());
  renderWho();
  toast('파일로 저장했어요');
}
async function loadBackup(file) {
  const data = fb.parseBackup(await file.text());
  const count = (m) => Object.values(m || {}).filter((w) => !w.del).length;
  const linked = fb.syncStatus().on ? ' 내 구글 드라이브에 연결돼 있어서, 드라이브와 연결된 다른 기기의 기록도 이 파일대로 바뀌어요. 파일에 없는 책은 모든 기기에서 빠져요.' : '';
  if (!await ask(`지금 이 기기의 기록(${count(D.priv.works)}권)을 지우고 파일의 기록(${count(data.works)}권)으로 바꿀까요?${linked}`, '바꾸기')) return;
  await fb.replaceAll(data);
  D.priv = await fb.readPrivate();
  applyName(); renderWho(); refreshAll();
  toast('파일에서 불러왔어요');
}
function renderLocalTools(box) {
  const name = el('button', { className:'copy', type:'button', textContent:'이름 바꾸기' });
  name.onclick = openNameForm;
  const out = el('button', { className:'copy', type:'button', textContent:'파일로 저장' });
  out.onclick = () => saveBackup().catch((e) => { console.error(e); toast('저장하지 못했어요'); });
  const pick = el('input', { type:'file', accept:'.json,application/json', hidden:true });
  pick.onchange = () => { const f = pick.files[0]; pick.value = ''; if (f) loadBackup(f).catch((e) => { console.error(e); toast(e.userMsg || '불러오지 못했어요'); }); };
  const inn = el('button', { className:'copy', type:'button', textContent:'파일 불러오기' });
  inn.onclick = () => pick.click();
  const last = (D.priv.meta || {}).lastBackup, ss = fb.syncStatus();
  const drive = el('button', { className:`copy drive-btn${ss.err ? ' warn' : ''}`, type:'button', textContent:ss.on ? (ss.busy ? '드라이브 맞추는 중' : ss.err ? '드라이브 확인 필요' : '드라이브 연결됨') : '내 구글 드라이브 연결' });
  drive.onclick = openDriveForm;
  const state = ss.on ? (ss.err ? '드라이브와 못 맞춤 · 기록은 이 기기에 있어요' : ss.at ? `드라이브와 맞춤 ${whenText(ss.at)}` : '드라이브와 맞추는 중') : last ? `마지막 저장 ${last}` : '아직 파일로 저장 안 함';
  box.replaceChildren(el('span', { className:'me', textContent:state }), name, out, inn, drive, pick);
}
// 맞춘 때: 오늘이면 시각만
function whenText(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.toDateString() === new Date().toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
/* ---------- 내 구글 드라이브 연결(범용판, 원하는 사람만) ---------- */
// 기록은 쓰는 사람이 만든 앱스크립트를 거쳐 그 사람 드라이브에만 간다. 이 책장을 만든 사람의 서버는 거치지 않는다
async function copyText(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); return true; }
  catch (e) { toast('복사하지 못했어요. 길게 눌러 직접 복사해 주세요'); return false; }
}
async function openDriveForm() {
  const ss = fb.syncStatus();
  if (ss.on) {
    const now = el('button', { className:'btn', type:'button', textContent:'지금 맞추기' });
    now.onclick = async () => { now.disabled = true; try { await fb.syncNow(); toast('드라이브와 맞췄어요'); } catch (e) { toast(e.userMsg || '맞추지 못했어요'); } now.disabled = false; openDriveForm(); };
    const share = el('button', { className:'btn ghost', type:'button', textContent:'다른 기기용 주소 복사' });
    share.onclick = async () => copyText(await fb.driveUrl(), '주소를 복사했어요. 다른 기기의 책장에 붙여 넣어 주세요');
    const off = el('button', { className:'copy danger', type:'button', textContent:'이 기기 연결 끊기' });
    off.onclick = async () => {
      if (!await ask('이 기기만 드라이브 연결을 끊을까요? 이 기기의 기록과 드라이브 파일은 둘 다 그대로 남아요.', '끊기')) return;
      await fb.disconnectDrive(); $('form').close(); renderWho(); toast('연결을 끊었어요');
    };
    showForm('내 구글 드라이브 연결', [
      el('p', { className:'drive-state' + (ss.err ? ' bad' : ''), textContent:ss.err || (ss.busy ? '지금 맞추는 중이에요.' : ss.at ? `${whenText(ss.at)}에 드라이브와 맞췄어요. 고치면 몇 초 뒤 알아서 올라가요.` : '아직 맞추지 못했어요.') }),
      el('p', { className:'sub', textContent:'다른 기기(폰·태블릿·PC)에서도 같은 책장을 쓰려면, 그 기기에서 이 책장을 열고 «내 구글 드라이브 연결» > «웹 앱 주소 붙여 넣기»에 아래 단추로 복사한 주소를 넣으세요. 주소가 열쇠라서, 아는 사람은 기록을 보고 바꿀 수도 있어요. 나에게만 보내 주세요.' }),
      el('div', { className:'actions drive-acts' }, share, now),
      el('p', { className:'note' }, off),
    ]);
    return;
  }
  const url = el('input', { type:'url', placeholder:'https://script.google.com/macros/s/…/exec', autocomplete:'off', spellcheck:false });
  url.setAttribute('inputmode', 'url');
  const code = el('button', { className:'copy', type:'button', textContent:'코드 복사' });
  code.onclick = async () => {
    code.disabled = true;
    try { const r = await fetch('drive-sync.gs', { cache:'no-cache' }); if (!r.ok) throw new Error(String(r.status)); await copyText(await r.text(), '코드를 복사했어요'); }
    catch (e) { console.error(e); toast('코드를 불러오지 못했어요. 인터넷을 확인해 주세요'); }
    code.disabled = false;
  };
  const step = (n, ...kids) => el('li', {}, ...kids);
  const guide = el('details', { className:'drive-guide', open:!matchMedia('(max-width: 599px)').matches }, // 폰은 두 번째 기기로 주소만 붙여 넣는 일이 많아 접어 둔다
    el('summary', { textContent:'처음 연결하기 (PC에서 5분쯤)' }),
    el('ol', { className:'drive-steps' },
      step(1, code, ' 단추로 연결 코드를 복사해요.'),
      step(2, el('a', { href:'https://script.new', target:'_blank', rel:'noopener', textContent:'새 앱스크립트 열기' }), ' (구글 로그인) → 있던 글을 모두 지우고 붙여 넣은 뒤 저장(Ctrl+S)해요.'),
      step(3, '오른쪽 위 ', el('b', { textContent:'배포 → 새 배포' }), ' → 톱니바퀴에서 ', el('b', { textContent:'웹 앱' }), '을 고르고, 실행 사용자 ', el('b', { textContent:'나' }), ', 액세스 권한 ', el('b', { textContent:'모든 사용자' }), ' → 배포.'),
      step(4, '권한을 물으면 ', el('b', { textContent:'액세스 승인 → 내 계정 → 고급 → 안전하지 않음으로 이동 → 허용' }), '. 내가 방금 만든 코드라 구글이 검사하지 않았다는 뜻이고, 드라이브 권한은 기록 파일을 내 드라이브에 저장하려고 묻는 거예요.'),
      step(5, '나온 ', el('b', { textContent:'웹 앱 주소' }), '(…/exec로 끝나요)를 복사해 아래에 붙여 넣어요.')),
    el('p', { className:'sub', textContent:'학교·회사 계정은 «모든 사용자»가 막혀 있을 수 있어요. 개인 gmail 계정으로 해 주세요.' }));
  showForm('내 구글 드라이브 연결', [
    el('p', { className:'sub', textContent:'여러 기기에서 같은 책장을 쓰고 싶을 때만 켜요. 기록은 내 구글 드라이브의 파일 «나의 책장 기록.json» 하나에 저장되고, 이 책장을 만든 사람에게는 가지 않아요. 연결해도 이 기기의 기록은 그대로 남아요.' }),
    guide,
    field('웹 앱 주소 붙여 넣기', url, '다른 기기에서 이미 연결했다면, 그 기기의 «다른 기기용 주소 복사»로 받은 주소만 넣으면 돼요. 두 기기의 기록은 합쳐져요.'),
  ], async () => {
    const before = list().length;
    const r = await fb.connectDrive(url.value);
    D.priv = await fb.readPrivate();
    applyName(); renderWho(); refreshAll();
    toast(r.had ? `연결했어요. 드라이브의 책 ${r.had}권과 이 기기 책 ${before}권을 합쳤어요` : '연결했어요. 이제 고치면 드라이브에도 저장돼요');
  }, '연결하기');
}
function renderWho() {
  const box = $('who');
  document.querySelectorAll('.owner-only').forEach((n) => { n.hidden = !S.owner; });
  syncFold();
  if (LOCAL) { renderLocalTools(box); return; }
  if (S.owner) {
    const out = el('button', { className:'copy', type:'button', textContent:'로그아웃' });
    out.onclick = async () => { if (!DEMO) await fb.signOutOwner(); leaveOwner(); };
    box.replaceChildren(el('span', { className:'me', textContent:DEMO ? '시험 화면' : '내 기록 보는 중' }), out);
  } else {
    const inBtn = el('button', { className:'copy', type:'button', textContent:'주인 로그인' });
    if (!DEMO) fb.warm();
    inBtn.onclick = async () => {
      inBtn.disabled = true;
      try {
        const u = await fb.signIn();
        if (u === 'redirect') return; // 구글 로그인 페이지로 넘어가는 중
        if (!u) toast('이 책장의 주인 계정이 아니에요');
        else await enterOwner(u);
      } catch (e) { if (e && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') { console.error(e); toast('로그인하지 못했어요'); } }
      inBtn.disabled = false;
    };
    box.replaceChildren(inBtn);
  }
}
async function enterOwner(user) {
  S.user = user; S.owner = true;
  try { D.priv = DEMO ? await (await fetch('demo/private.json')).json() : await fb.readPrivate(); }
  catch (e) { console.error(e); S.owner = false; toast('내 기록을 불러오지 못했어요'); renderWho(); return; }
  renderWho(); refreshAll();
}
function leaveOwner() {
  S.hideUnknown = true;
  if ($('form').open) $('form').close();
  if ($('sheet').open) $('sheet').close();
  $('sheet-body').replaceChildren(); $('form-body').replaceChildren();
  S.owner = false; S.user = null; D.priv = {}; S.cur = null; S.onlyMe = false; S.lf = 'all'; S.lq = ''; S.lastWhere = ''; S.pastOpen = false; $('lq').value = '';
  if (S.kind !== 'book') S.kind = 'book';
  if (S.view === 'library') show('shelf');
  renderWho(); refreshAll();
}
function show(v, quiet) {
  if ((v === 'library' && !S.owner) || (v === 'posts' && LOCAL)) return;
  if (S.view !== v) scrollTo(0, 0); // 메뉴가 위에 붙어 있어 내려온 채로 탭을 바꿀 수 있다. 새 화면은 처음부터 보여 준다
  S.view = v;
  VIEWS.forEach((x) => { $(`view-${x}`).hidden = x !== v; $(`tab-${x}`).setAttribute('aria-selected', x === v); });
  $('addBook').textContent = v === 'library' ? '+ 내 서재에 꽂기' : '+ 책 추가';
  if (!quiet) { try { history.replaceState(null, '', `${location.pathname}${location.search}#${v}`); } catch (e) {} }
  if (v === 'shelf') balanceRacks(); // 숨은 동안 다시 그렸거나 창 폭이 바뀌었으면 폭을 못 쟀다. 보일 때 다시 잰다
  if (v === 'posts') watch('.rise');
  if (v === 'recap') { const c = document.querySelector('#wordMap[data-pending]'); if (c && !c.closest('.rfold-body[hidden]')) drawWordMap(c); else fitNet(); }
  renderJump();
}
VIEWS.forEach((v) => { $(`tab-${v}`).onclick = () => show(v); });
function route() {
  const h = location.hash;
  if (h.startsWith('#book/')) { let id = ''; try { id = decodeURIComponent(h.slice(6)); } catch (e) {} show('shelf', true); openBook(id); return; }
  if (VIEWS.map((v) => `#${v}`).includes(h)) show(h.slice(1), true);
}
window.addEventListener('hashchange', route);
$('q').addEventListener('input', (e) => { const had = !!S.q; S.q = e.target.value.trim(); if (S.q && !had) { S.prevKind = S.kind; S.kind = 'all'; } if (!S.q && had && S.prevKind) { S.kind = S.prevKind; S.prevKind = ''; } renderShelf(); });
$('pq').addEventListener('input', (e) => { S.pq = e.target.value.trim(); renderPosts(true); });
$('showUnknown').onclick = () => { S.hideUnknown = !S.hideUnknown; renderShelf(); setLede(); };
if ($('onlyMe')) $('onlyMe').onclick = () => { S.onlyMe = !S.onlyMe; S.kind = S.onlyMe ? 'all' : 'book'; renderShelf(); };
$('onlyIg').onclick = () => { S.onlyIg = !S.onlyIg; renderShelf(); };
$('foldFilters').onclick = () => toggleFold('filters');
$('foldTools').onclick = () => toggleFold('tools');
syncFold();
$('lq').addEventListener('input', (e) => { S.lq = e.target.value.trim(); renderLibrary(); });
$('addMany').onclick = () => openManyForm();
$('addBook').onclick = () => (S.view === 'library' ? openLibForm(null) : openBookForm(null));
$('addPost').onclick = () => openPostForm();
$('form').addEventListener('click', (e) => { if (e.target === $('form')) $('form').close(); });
$('form').addEventListener('close', () => {
  popDlg('form');
  rehostToast();
});
function rehostToast() { if (!$('toast').hidden) ($('sheet').open ? $('sheet') : document.body).append($('toast')); } // 닫힌 창에 알림이 갇히지 않게

let toastT;
function toast(t) {
  const host = $('form').open ? $('form') : $('sheet').open ? $('sheet') : document.body;
  host.append($('toast')); $('toast').textContent = t; $('toast').hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { $('toast').hidden = true; }, 2200);
}
function copy(text) {
  const failMsg = () => toast('복사하지 못했어요');
  try { navigator.clipboard.writeText(text).then(() => toast('링크를 복사했어요'), failMsg); } catch (e) { failMsg(); }
}

// 다른 기기에서 고친 내용을 덮어쓰지 않게, 오래 비웠다 돌아오면 비공개 기록을 다시 읽는다
let hiddenAt = 0;
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (!S.owner || DEMO || Date.now() - hiddenAt < 3 * 60e3 || $('form').open) return;
  try { D.priv = await fb.readPrivate(); const open = $('sheet').open; refreshAll(); if (open) $('sheet').close(); } catch (e) { console.error(e); }
});

// 드라이브에서 다른 기기의 기록을 받았을 때. 양식을 쓰는 중이면 닫을 때 반영한다(쓰던 글이 사라지지 않게)
let drivePending = false;
async function applyDrive() {
  drivePending = false;
  D.priv = await fb.readPrivate();
  const open = $('sheet').open;
  applyName(); refreshAll();
  if (open) $('sheet').close();
}
function onDriveSync(ev) {
  if (!$('form').open) renderWho();
  if (ev !== 'pulled') return;
  if ($('form').open) { drivePending = true; return; }
  applyDrive().catch((e) => console.error(e));
}
$('form').addEventListener('close', () => { if (LOCAL) { renderWho(); if (drivePending) applyDrive().catch((e) => console.error(e)); } });

/* ---------- 시작 ---------- */
async function start() {
  if (LOCAL) {
    D.pub = { books:[], posts:[] };
    D.priv = await fb.readPrivate();
    S.owner = true; S.user = { uid:'local' };
    applyName(); renderWho(); refreshAll(); route();
    if (fb.isVolatile()) toast('이 창에서는 저장이 안 돼요. 창을 닫으면 기록이 사라져요');
    fb.onSync(onDriveSync);
    fb.initSync().catch((e) => console.error(e));
    return;
  }
  try {
    const r = await fetch('data/public.json', { cache:'no-cache' });
    if (!r.ok) throw new Error(String(r.status));
    D.pub = await r.json();
    // 블로그 글·책등 색은 없어도 책장은 열린다(색이 없으면 주제 색)
    const [blog, spines] = await Promise.all([
      fetch('data/blog.json', { cache:'no-cache' }).then((x) => (x.ok ? x.json() : {})).then((x) => x.posts || []).catch(() => []),
      fetch('data/spines.json', { cache:'no-cache' }).then((x) => (x.ok ? x.json() : {})).then((x) => x.c || {}).catch(() => ({})),
    ]);
    D.blog = blog; D.spines = spines;
  } catch (e) {
    console.error(e);
    const retry = el('button', { className:'btn', type:'button', textContent:'다시 불러오기' });
    retry.onclick = () => location.reload();
    $('lede').textContent = '';
    $('shelves').replaceChildren(el('div', { className:'empty' }, el('div', { textContent:'책장을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.' }), retry));
    return;
  }
  renderWho(); refreshAll(); route();
  if (DEMO) { await enterOwner({ uid:'demo' }); route(); return; }
  const back = fb.takeIdToken();
  (back ? fb.finishRedirect(back).then((u) => { if (!u) toast('이 책장의 주인 계정이 아니에요'); }).catch((e) => { console.error(e); toast('로그인하지 못했어요'); }) : Promise.resolve())
    .then(() => fb.watchAuth((u) => { if (fb.isOwner(u) && !S.owner) enterOwner(u).then(route); else if (!u && S.owner) leaveOwner(); }))
    .catch((e) => console.error(e));
}
start();
