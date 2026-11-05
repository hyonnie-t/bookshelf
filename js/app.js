// 효니의 책장: 공개 화면은 data/public.json(책·인스타 서평), 주인 로그인 뒤에는 비공개 기록을 겹쳐 보여 주고 고칠 수 있다.
import * as fb from './fb.js';

const DEMO = new URLSearchParams(location.search).get('demo') === '1'; // 시험용: 가짜 기록으로 주인 화면, 저장은 메모리에만
const KINDS = [['book','책'],['film','영화·드라마'],['show','전시·공연'],['trip','여행'],['other','다른 글'],['wishlist','읽을 목록'],['all','전체']];
const THEMES = [['소설','소설'],['에세이','에세이'],['역사','역사'],['철학','철학'],['사회·정치','사회정치'],['여성','여성'],['과학·환경','과학환경'],['사랑·관계','사랑관계'],['죽음·상실','죽음상실'],['일·노동','일노동'],['교육','교육'],['법','법'],['SF·판타지','SF판타지'],['여행','여행'],['예술','예술'],['시','시'],['심리','심리'],['인문','인문'],['청소년·그림책','청소년그림책'],['경제·자기계발','경제자기계발'],['기타','기타']];
const POST_KINDS = [['review','서평'],['etc','결산·일상'],['all','전체']];
const PAGE = 24;
const $ = (id) => document.getElementById(id);
const el = (tag, props, ...kids) => { const n = Object.assign(document.createElement(tag), props || {}); kids.flat().forEach((k) => { if (k != null) n.append(k); }); return n; };
const themeVar = (t) => { const f = THEMES.find((x) => x[0] === t); return `var(--t-${f ? f[1] : '없음'})`; };
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const validCode = (c) => /^[A-Za-z0-9_-]{5,}$/.test(c);
const igUrl = (c) => `https://www.instagram.com/p/${c}/`;

const S = { kind:'book', theme:'', q:'', hideUnknown:false, onlyIg:false, pKind:'review', pq:'', pShown:PAGE, owner:false, user:null, view:'shelf', lf:'all', lq:'', cur:null, lastWhere:'' };
const D = { pub:null, works:new Map(), posts:[], byWork:new Map(), priv:{}, lib:[] };
const VIEWS = ['shelf', 'library', 'posts', 'recap'];
const LIB_KINDS = [['all','전체'],['own','소장'],['out','빌려준 책'],['in','빌려 온 책'],['unread','아직 안 읽음']];
const DEFAULT_WHERE = '내 책장';
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 데이터 ---------- */
function rebuild() {
  const works = new Map();
  (D.pub.books || []).forEach((b) => works.set(b.id, { recs:[], notes:[], known:true, th:[], ...b, pub:true }));
  if (S.owner) Object.entries(D.priv.works || {}).forEach(([id, w]) => {
    const pub = works.get(id) || {};
    works.set(id, { recs:[], notes:[], ...pub, ...w, id, th:w.th || (DEMO ? pub.th : []) || [], y:w.y || pub.y || '', fd:w.fd || pub.fd || '' });
  });
  for (const [id, w] of works) { w.recs = w.recs || []; w.notes = w.notes || []; w.th = w.th || []; if (w.del) works.delete(id); }
  const posts = new Map((D.pub.posts || []).map((p) => [p.c, { ...p, w:p.w || [] }]));
  if (S.owner) {
    Object.values(D.priv.igAdded || {}).forEach((p) => posts.set(p.c, { ...p, w:p.w || [] }));
    Object.entries(D.priv.igLinks || {}).forEach(([c, l]) => { const p = posts.get(c); if (p) { p.w = l.w || []; if (l.k) p.k = l.k; } });
  }
  D.works = works;
  posts.forEach((p) => { p.w = p.w.filter((id) => works.has(id)); if (!p.w.length && p.k === 'review') p.k = 'etc'; });
  D.posts = [...posts.values()].sort((a, b) => b.d.localeCompare(a.d));
  D.byWork = new Map();
  D.posts.forEach((p) => p.w.forEach((id) => { if (!D.byWork.has(id)) D.byWork.set(id, []); D.byWork.get(id).push(p); }));
  works.forEach((w) => {
    const rv = D.byWork.get(w.id) || [];
    w.hay = [w.t, w.a, w.p, ...w.notes.flatMap((n) => [n.l, n.b]), ...w.recs.flatMap((r) => [r.l, r.b]), ...rv.map((p) => p.x)].filter(Boolean).join(' ').toLowerCase();
    if (!w.y) { const d = [...w.recs.map((r) => r.d), ...w.notes.map((n) => n.d), ...rv.map((p) => p.d)].filter(Boolean).sort()[0]; if (d) w.y = d.slice(0, 4); }
    if (!w.fd) w.fd = [...w.recs.map((r) => r.d), ...w.notes.map((n) => n.d), ...rv.map((p) => p.d)].filter(Boolean).sort()[0] || '';
  });
  // 내 서재는 비공개 칸(library)에만 있다. 읽은 책과는 w로 이어질 뿐 섞지 않는다
  D.lib = S.owner ? Object.entries(D.priv.library || {}).map(([id, v]) => ({ ...v, id, st:v.st || 'own', loans:v.loans || [], th:v.th || [] })) : [];
}
const titleOf = (w) => w.t || { book:'제목 미확인 책', film:'제목 미확인 영화', show:'제목 미확인 공연', trip:'여행 기록', other:'제목 없는 글', wishlist:'읽을 목록' }[w.k] || '제목 없음';
const reviewsOf = (w) => D.byWork.get(w.id) || [];
const list = () => [...D.works.values()];

/* ---------- 책장 ---------- */
function matches(w) {
  if (S.kind !== 'all' && w.k !== S.kind) return false;
  if (S.theme && !w.th.includes(S.theme)) return false;
  if (S.onlyIg && !reviewsOf(w).length) return false;
  if (S.hideUnknown && !w.known && ['book','film','show'].includes(w.k)) return false;
  if (S.q && !w.hay.includes(S.q.toLowerCase())) return false;
  return true;
}
function chips() {
  const all = list();
  const count = (k) => k === 'all' ? all.length : all.filter((w) => w.k === k).length;
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
}
function spine(w) {
  const rv = reviewsOf(w), items = w.notes.length + w.recs.length + rv.length;
  const full = titleOf(w), multi = items > 1;
  const raw = w.t || (w.notes[0] || {}).l || (w.recs[0] || {}).l || full;
  const label = raw.length > 24 ? raw.slice(0, 23) + '…' : raw;
  const cols = label.length <= 8 ? 1 : label.length <= 16 ? 2 : 3;
  const len = rv.reduce((a, p) => a + p.x.length, 0) + w.notes.reduce((a, n) => a + (n.len || 0), 0);
  const h = Math.min(198, (cols > 1 ? 150 : 124) + Math.min(36, Math.round(Math.sqrt(len) * .8)) + (multi ? 22 : 0) + (w.guess || w.unread ? 18 : 0));
  const wd = 18 + cols * 19 + Math.abs(hash(full + w.fd) % 9);
  const b = el('button', { type:'button', className:'spine' + (w.known ? '' : ' unknown') + (multi ? ' multi' : '') + (w.guess || w.unread ? ' guess' : '') + (rv.length ? ' has-ig' : '') });
  b.style.height = h + 'px'; b.style.width = wd + 'px';
  b.style.background = themeVar(w.th[0]);
  b.append(el('span', { textContent:label }));
  if (w.guess || w.unread) b.append(el('i', { className:'est', textContent:w.guess ? '추정' : '미완' }));
  if (multi) b.append(el('i', { className:'times', textContent:`×${items}` }));
  b.setAttribute('aria-label', `${full}${w.a ? ', ' + w.a : ''}, 서평 ${rv.length}개`);
  b.onclick = () => openBook(w.id, b);
  return el('div', { className:'slot' }, b);
}
let io;
function watch(sel) {
  if (!('IntersectionObserver' in window)) { document.querySelectorAll(sel).forEach((n) => n.classList.add('show')); return; }
  io = io || new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('show'); io.unobserve(e.target); } }), { rootMargin:'0px 0px -5% 0px' });
  document.querySelectorAll(sel).forEach((n) => { if (!n.classList.contains('show')) io.observe(n); });
}
function renderShelf() {
  chips();
  const rows = list().filter(matches);
  $('count').textContent = `${rows.length}권`;
  const byYear = {};
  rows.forEach((w) => { (byYear[w.y || '날짜 없음'] = byYear[w.y || '날짜 없음'] || []).push(w); });
  const ys = Object.keys(byYear).sort((a, b) => b.localeCompare(a));
  if (!ys.length) {
    const reset = el('button', { className:'btn', type:'button', textContent:'조건 풀기' });
    reset.onclick = () => { Object.assign(S, { kind:'all', theme:'', q:'', hideUnknown:false, onlyIg:false }); $('q').value = ''; $('hideUnknown').checked = false; $('onlyIg').checked = false; renderShelf(); };
    $('shelves').replaceChildren(el('div', { className:'empty' }, el('div', { textContent:'조건에 맞는 책이 없어요. 종류나 주제를 바꿔 보세요.' }), reset));
    return;
  }
  $('shelves').replaceChildren(...ys.map((y) => el('section', { className:'shelf' },
    el('div', { className:'shelf-head' }, el('h2', { textContent:y }), el('span', { textContent:`${byYear[y].length}권` })),
    el('div', { className:'rack' }, byYear[y].sort((a, b) => a.fd.localeCompare(b.fd)).map(spine)))));
  watch('.shelf');
}

/* ---------- 책 자세히 ---------- */
function postBlock(p, { showBooks = false, ownerTools = false, inWork = null } = {}) {
  const text = el('p', { className:'post-text', textContent:p.x });
  const long = p.x.length > 420;
  if (long) text.classList.add('clamp');
  const kids = [el('div', { className:'when', textContent:p.d })];
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
  if (validCode(p.c)) foot.append(el('a', { className:'copy link', href:igUrl(p.c), target:'_blank', rel:'noopener', textContent:'인스타그램에서 보기' }));
  if (ownerTools && S.owner) {
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
function openBook(id, from, item) {
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
  renderTome({ t:it.t, a:it.a, p:it.p, k:'book', th:it.th, recs:[], notes:[] }, it, from);
}
function reshow() {
  if (!$('sheet').open || !S.cur) return;
  if (S.cur.lib) openLib(S.cur.lib, $('sheet').returnEl); else openBook(S.cur.id, $('sheet').returnEl);
}
// 왼쪽 면은 책 정보, 오른쪽 면은 글. 폰에서는 한 면으로 이어진다
function renderTome(w, item, from) {
  const close = el('button', { className:'close', type:'button', textContent:'×', ariaLabel:'닫기' });
  close.onclick = closeBook;
  const kindName = (KINDS.find((k) => k[0] === w.k) || [,''])[1];
  const rv = reviewsOf(w);
  const byline = [w.a, w.p, kindName === '책' ? '' : kindName].filter(Boolean).join(' · ');
  const left = [el('div', { className:'title-page' }, el('h2', { id:'sheet-title', textContent:titleOf(w) }), el('p', { className:'by', textContent:byline }))];
  if (w.th.length) left.push(el('div', { className:'title-tags' }, w.th.map((t) => { const s = el('span', { className:'tag', textContent:t }); s.style.background = themeVar(t); return s; })));
  if (w.guess && S.owner) left.push(el('p', { className:'warn', textContent:'제목과 저자는 메모 내용으로 추정한 것이에요. 틀렸으면 고쳐 주세요.' }));
  const body = [];
  if (rv.length) body.push(el('h3', { className:'sec', textContent:`인스타 서평 ${rv.length}` }), rv.map((p) => postBlock(p, { ownerTools:true, inWork:w.id })));
  else if (!S.owner) body.push(el('p', { className:'warn', textContent:'아직 쓴 서평이 없는 책이에요.' }));
  if (S.owner) {
    left.push(libBox(item, w));
    if (!rv.length && !w.recs.length && !w.notes.length) {
      const kids = [el('p', { className:'warn', textContent:w.id ? '아직 남긴 글이 없어요.' : '아직 읽은 기록이 없어요.' })];
      if (!w.id) { const go = el('button', { className:'btn', type:'button', textContent:'읽고 기록 남기기' }); go.onclick = () => openBookForm(null, { pre:item }); kids.push(go); }
      body.push(el('div', { className:'blank-page' }, kids));
    }
    if (w.recs.length) {
      body.push(el('h3', { className:'sec', textContent:'내 독서 기록' }));
      w.recs.forEach((r, i) => {
        const score = r.r == null ? '' : r.r === 0 ? '최하' : '★'.repeat(r.r);
        const edit = el('button', { className:'copy', type:'button', textContent:'고치기' });
        edit.onclick = () => openRecForm(w, i);
        body.push(el('div', { className:'memo' },
          el('div', { className:'when', textContent:[r.d || '날짜 없음', r.st === 'unread' ? '읽는 중·미완독' : '', score].filter(Boolean).join(' · ') }),
          r.l ? el('p', { className:'line', textContent:r.l }) : null,
          r.b ? el('p', { className:'post-text', textContent:r.b }) : null,
          el('div', { className:'memo-foot' }, edit)));
      });
    }
    if (w.notes.length) {
      body.push(el('h3', { className:'sec', textContent:`아이폰 메모 ${w.notes.length}` }));
      w.notes.forEach((n) => body.push(el('div', { className:'memo' },
        el('div', { className:'when', textContent:[n.d, n.v, n.g ? '내용으로 이 책에 연결함' : '', n.s === 'want' ? '읽고 싶음' : n.s === 'reading' ? '읽는 중' : ''].filter(Boolean).join(' · ') || '날짜 없음' }),
        n.b ? el('p', { className:'post-text', textContent:n.b }) : el('p', { className:'line none', textContent:n.l || '본문 없음' }))));
    }
    if (w.id) {
      const addRec = el('button', { className:'btn', type:'button', textContent:'기록 더하기' });
      addRec.onclick = () => openRecForm(w, -1);
      const editBook = el('button', { className:'btn ghost', type:'button', textContent:'책 정보 고치기' });
      editBook.onclick = () => openBookForm(w);
      left.push(el('div', { className:'actions' }, addRec, editBook));
    }
  }
  const share = el('button', { className:'copy', type:'button', textContent:'이 책 링크 복사' });
  share.onclick = () => copy(`${location.origin}${location.pathname}#book/${encodeURIComponent(w.id)}`);
  if (w.pub) left.push(el('div', { className:'memo-foot share' }, share));
  // 표지: 앞면은 책등과 같은 색, 뒷면은 왼쪽 면과 같은 종이. 펼칠 때와 덮을 때만 보인다
  const flip = el('div', { className:'flip' },
    el('div', { className:'flip-front' }, el('strong', { textContent:titleOf(w) }), w.a ? el('span', { textContent:w.a }) : null),
    el('div', { className:'flip-back' }));
  flip.setAttribute('aria-hidden', 'true');
  flip.firstChild.style.backgroundColor = themeVar(w.th[0]);
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
function pushDlg(id) { try { history.pushState({ dlg:id }, '', location.href); } catch (e) {} }
// 양식과 책 창이 한꺼번에 닫히면 앞의 back이 끝나기 전에 뒤의 창이 닫히므로, 진행 중인 back을 세어 함께 뺀다
let popping = 0;
function popDlg(id) { if (popping || (history.state && history.state.dlg === id)) { popping++; history.back(); } }
window.addEventListener('popstate', () => {
  popping = Math.max(0, popping - 1);
  const top = history.state && history.state.dlg;
  if ($('form').open && top !== 'form') $('form').close();
  if ($('sheet').open && top !== 'form' && top !== 'sheet') closeBook();
  if (!top && location.hash.startsWith('#book/')) history.replaceState(null, '', location.pathname + location.search);
});

/* ---------- 서평 글 목록 ---------- */
function postRows() {
  const q = S.pq.toLowerCase();
  return D.posts.filter((p) => (S.pKind === 'all' || (p.k || 'etc') === S.pKind) && (!q || p.x.toLowerCase().includes(q) || p.w.some((id) => { const w = D.works.get(id); return w && titleOf(w).toLowerCase().includes(q); })));
}
function renderPosts(reset) {
  if (reset) S.pShown = PAGE;
  const count = (k) => k === 'all' ? D.posts.length : D.posts.filter((p) => (p.k || 'etc') === k).length;
  $('postKinds').replaceChildren(...POST_KINDS.map(([k, label]) => {
    const b = el('button', { className:'chip', type:'button', textContent:`${label} ${count(k)}` });
    b.setAttribute('aria-pressed', S.pKind === k);
    b.onclick = () => { S.pKind = k; renderPosts(true); };
    return b;
  }));
  const rows = postRows();
  $('pcount').textContent = `${rows.length}개`;
  const shown = rows.slice(0, S.pShown);
  if (!shown.length) { $('posts').replaceChildren(el('div', { className:'empty' }, el('div', { textContent:'찾는 글이 없어요.' }))); $('postsMore').hidden = true; return; }
  $('posts').replaceChildren(...shown.map((p) => { const n = postBlock(p, { showBooks:true, ownerTools:!p.w.length }); n.classList.add('card', 'rise'); return n; }));
  watch('.rise');
  $('postsMore').hidden = shown.length >= rows.length;
  if (shown.length < rows.length) {
    const more = el('button', { className:'btn ghost', type:'button', textContent:`더 보기 (${rows.length - shown.length}개 남음)` });
    more.onclick = () => { S.pShown += PAGE; renderPosts(); };
    $('postsMore').replaceChildren(more);
  }
}

/* ---------- 돌아보기 ---------- */
function renderRecap() {
  const box = $('recap'), books = list().filter((w) => w.k === 'book');
  const yc = {};
  const readYear = (w) => { const d = w.recs.filter((r) => r.st !== 'unread').map((r) => r.d).filter(Boolean).sort()[0]; return d ? d.slice(0, 4) : (reviewsOf(w).length || w.pub ? w.y : ''); };
  books.forEach((w) => { const y = readYear(w); if (y) yc[y] = (yc[y] || 0) + 1; });
  const ys = Object.keys(yc).sort(), maxY = Math.max(1, ...Object.values(yc)), topY = ys.find((y) => yc[y] === maxY);
  const yearCard = el('div', { className:'card span2' }, el('h2', { textContent:'해마다 읽은 책' }), el('p', { className:'sub', textContent:topY ? `${topY}년에 ${maxY}권으로 가장 많이 읽었어요` : '' }),
    el('div', { className:'years' }, ys.map((y) => { const bar = el('div', { className:'ybar' }); bar.style.height = `${yc[y] / maxY * 100}%`; bar.style.flex = '0 0 auto'; return el('div', { className:'ycol' + (y === topY ? ' top' : '') }, el('span', { className:'yval', textContent:yc[y] }), bar); })),
    el('div', { className:'ylabels' }, ys.map((y) => el('span', { textContent:"'" + y.slice(2) }))));
  const hbar = (label, n, max, color, onclick) => { const fill = el('div', { className:'fill' }); fill.style.width = `${n / max * 100}%`; fill.style.background = color;
    const b = el('button', { className:'hbar', type:'button' }, el('span', { textContent:label }), el('div', { className:'track' }, fill), el('span', { className:'n', textContent:n }));
    if (onclick) b.onclick = onclick; return b; };
  const tc = {};
  books.forEach((w) => w.th.forEach((t) => { tc[t] = (tc[t] || 0) + 1; }));
  const ts = Object.entries(tc).sort((a, b) => b[1] - a[1]);
  const themeCard = el('div', { className:'card' }, el('h2', { textContent:'주제별 책' }), el('p', { className:'sub', textContent:'누르면 책장에서 그 주제만 보여요' }),
    ts.map(([t, n]) => hbar(t, n, ts[0][1], themeVar(t), () => { Object.assign(S, { kind:'all', theme:t, q:'', hideUnknown:false, onlyIg:false }); $('q').value = ''; show('shelf'); renderShelf(); scrollTo(0, 0); })));
  const pc = {};
  D.posts.filter((p) => p.k === 'review').forEach((p) => { const y = p.d.slice(0, 4); pc[y] = (pc[y] || 0) + 1; });
  const pys = Object.keys(pc).sort().reverse(), maxP = Math.max(1, ...Object.values(pc));
  const reviewed = [...D.byWork.entries()].map(([id, ps]) => [D.works.get(id), ps.length]).filter(([w, n]) => w && n > 1).sort((a, b) => b[1] - a[1]).slice(0, 24);
  const postCard = el('div', { className:'card' }, el('h2', { textContent:'해마다 쓴 서평' }), el('p', { className:'sub', textContent:'@hyonnie_books에 올린 서평 글 기준' }),
    pys.map((y) => hbar(y, pc[y], maxP, 'var(--bar)')),
    reviewed.length ? el('h2', { textContent:'여러 번 쓴 책', style:'margin-top:16px;margin-bottom:8px' }) : null,
    reviewed.length ? el('div', { className:'again' }, reviewed.map(([w, n]) => { const b = el('button', { className:'chip', type:'button', textContent:`${titleOf(w)} ×${n}` }); b.onclick = () => openBook(w.id, b); return b; })) : null);
  const cards = [yearCard, themeCard, postCard];
  if (S.owner) {
    const rc = {};
    books.forEach((w) => w.recs.forEach((r) => { if (r.r != null && r.st !== 'unread') rc[r.r] = (rc[r.r] || 0) + 1; }));
    const maxR = Math.max(1, ...Object.values(rc));
    const best = books.filter((w) => w.recs.some((r) => r.r === 5));
    cards.push(el('div', { className:'card span2' }, el('h2', { textContent:'별점 (나만 보임)' }), el('p', { className:'sub', textContent:`별점을 남긴 ${Object.values(rc).reduce((a, b) => a + b, 0)}건` }),
      [5, 4, 3, 2, 1, 0].filter((r) => rc[r]).map((r) => hbar(r === 0 ? '최하' : `${r}점`, rc[r], maxR, 'var(--bar)')),
      best.length ? el('h2', { textContent:'5점을 준 책', style:'margin-top:16px;margin-bottom:8px' }) : null,
      best.length ? el('div', { className:'again' }, best.map((w) => { const b = el('button', { className:'chip', type:'button', textContent:titleOf(w) }); b.onclick = () => openBook(w.id, b); return b; })) : null));
  }
  box.replaceChildren(...cards.filter(Boolean));
}

/* ---------- 내 서재 ---------- */
const openLoan = (it) => it.loans.find((l) => !l.back);
const isActive = (it) => it.st === 'own' || !!openLoan(it); // 빌려 온 책을 돌려주면 서가에서 빠지고 기록만 남는다
const libWork = (it) => (it.w ? D.works.get(it.w) : null);
const libByWork = (id) => D.lib.find((x) => x.w === id && isActive(x)) || null;
const libRead = (it) => { const w = libWork(it); return !!w && w.k !== 'wishlist' && !w.unread; };
const libThemes = (it) => (it.th.length ? it.th : (libWork(it) || {}).th || []);
const isLate = (l) => !!l.due && !l.back && l.due < today();
const norm = (s) => (s || '').replace(/\s+/g, '').toLowerCase();
function libMatches(it) {
  const l = openLoan(it);
  if (S.lf === 'own' && it.st !== 'own') return false;
  if (S.lf === 'out' && !(l && l.dir === 'out')) return false;
  if (S.lf === 'in' && it.st !== 'in') return false;
  if (S.lf === 'unread' && libRead(it)) return false;
  if (!S.lq) return true;
  return [it.t, it.a, it.p, it.where, ...it.loans.map((x) => x.who)].filter(Boolean).join(' ').toLowerCase().includes(S.lq.toLowerCase());
}
function caseBook(it) {
  const l = openLoan(it), out = !!l && l.dir === 'out';
  const title = it.t || '제목 없음', th = libThemes(it);
  // 플랫한 색면에 얇은 줄과 저자만 더한다(효니 선택 2026-11-05). 빌려준 책은 빈자리로 보인다
  const label = title.length > 24 ? title.slice(0, 23) + '…' : title;
  const sub = out ? `${l.who.slice(0, 6)}에게` : (it.a || '').split(/[\/,]/)[0].trim().slice(0, 6);
  const h = 146 + Math.abs(hash(title)) % 50;
  const perCol = Math.max(5, Math.floor((h - 30 - sub.length * 12) / 15));
  const cols = Math.min(3, Math.ceil(label.length / perCol));
  const b = el('button', { type:'button', className:`spine lbook band${Math.abs(hash(title + it.id)) % 3}${out ? ' gone' : ''}` });
  b.style.height = h + 'px';
  b.style.width = 14 + cols * 18 + Math.abs(hash(title + 'w')) % 14 + 'px';
  if (!out) b.style.background = themeVar(th[0]);
  b.append(el('span', { textContent:label }));
  if (sub) b.append(el('small', { textContent:sub }));
  const status = it.st === 'in' ? `${l.who}에게서 빌려 온 책` : out ? `${l.who}에게 빌려줌` : '소장';
  b.setAttribute('aria-label', [title, it.a, status].filter(Boolean).join(', '));
  b.title = [title, status].join(' · ');
  b.dataset.lib = it.id;
  b.onclick = () => openLib(it.id, b);
  return el('div', { className:'lslot' }, b);
}
function ledgerRow(it, l) {
  const i = it.loans.indexOf(l);
  const name = el('button', { className:'ledger-title', type:'button', textContent:it.t || '제목 없음' });
  name.onclick = () => openLib(it.id, name);
  const meta = [l.dir === 'out' ? `${l.who}에게` : `${l.who}에게서`, l.d ? `${l.d} 빌림` : '', l.due ? `${l.due}까지` : '', l.back ? `${l.back} 돌아옴` : ''].filter(Boolean).join(' · ');
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
  if (!S.owner) { ['cases', 'ledger', 'libKinds'].forEach((id) => $(id).replaceChildren()); $('lcount').textContent = ''; return; }
  const act = D.lib.filter(isActive);
  const count = { all:act.length, own:act.filter((x) => x.st === 'own').length, out:act.filter((x) => { const l = openLoan(x); return l && l.dir === 'out'; }).length, in:act.filter((x) => x.st === 'in').length, unread:act.filter((x) => !libRead(x)).length };
  $('libKinds').replaceChildren(...LIB_KINDS.map(([k, label]) => {
    const b = el('button', { className:'chip', type:'button', textContent:`${label} ${count[k]}` });
    b.setAttribute('aria-pressed', S.lf === k);
    b.onclick = () => { S.lf = k; renderLibrary(); };
    return b;
  }));
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
  const groups = new Map();
  rows.filter((x) => x.st === 'own').forEach((x) => { const k = x.where || DEFAULT_WHERE; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
  const order = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ko'));
  const inn = rows.filter((x) => x.st === 'in');
  if (inn.length) order.push(['빌려 온 책', inn]);
  // 주제 색이 모이도록 주제, 제목 순으로 꽂는다
  const key = (x) => (libThemes(x)[0] || '힣') + (x.t || '');
  $('cases').replaceChildren(...order.map(([name, books]) => el('section', { className:'lib-group shelf' },
    el('div', { className:'shelf-head' }, el('h2', { textContent:name }), el('span', { textContent:`${books.length}권` })),
    el('div', { className:'case' }, [...books].sort((a, b) => key(a).localeCompare(key(b), 'ko')).map(caseBook)))));
  watch('.lib-group.shelf');
}
function libBox(it, w) {
  if (!it) {
    const add = el('button', { className:'btn ghost', type:'button', textContent:'내 서재에 꽂기' });
    add.onclick = () => openLibForm(null, { work:w });
    return el('div', { className:'libbox' }, add);
  }
  const l = openLoan(it);
  const state = it.st === 'in' ? (l ? `빌려 온 책 · ${l.who}에게서` : '빌렸다가 돌려준 책') : l ? `소장 · 지금 ${l.who}에게 빌려줌` : `소장 · ${it.where || DEFAULT_WHERE}`;
  const kids = [el('h3', { className:'sec', textContent:'내 서재' }), el('p', { className:'libstate', textContent:state })];
  it.loans.forEach((x, i) => {
    const fix = el('button', { className:'copy', type:'button', textContent:'고치기' });
    fix.onclick = () => openLoanForm(it, i);
    const text = [x.dir === 'out' ? `${x.who}에게` : `${x.who}에게서`, x.d, x.due ? `${x.due}까지` : '', x.back ? `${x.back} 돌아옴` : ''].filter(Boolean).join(' · ');
    kids.push(el('div', { className:'loanline' + (isLate(x) ? ' late' : '') }, el('span', { textContent:text }), fix));
  });
  const tools = el('div', { className:'actions' });
  if (l) tools.append(backButton(it, it.loans.indexOf(l)));
  else if (it.st === 'own') { const lend = el('button', { className:'copy', type:'button', textContent:'빌려주기' }); lend.onclick = () => openLoanForm(it, -1); tools.append(lend); }
  if (it.st === 'in') {
    const mine = el('button', { className:'copy', type:'button', textContent:'내 책이 됐어요' });
    mine.onclick = () => {
      const loans = it.loans.map((x) => (x.back ? x : { ...x, back:today() }));
      saveLib({ ...it, st:'own', loans }, '내 책으로 옮겼어요').then(reshow).catch(saveFailed);
    };
    tools.append(mine);
  }
  const edit = el('button', { className:'copy', type:'button', textContent:'서재 정보 고치기' });
  edit.onclick = () => openLibForm(it);
  tools.append(edit);
  kids.push(tools);
  return el('div', { className:'libbox' }, kids);
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
  const kids = [field('제목', t, '읽은 책에 있으면 목록에서 골라 주세요. 서평과 이어져요'), pickr.dl, field('저자', a), field('출판사', p)];
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
      if (!confirm(`«${it.t}»을 내 서재에서 뺄까요? 빌린 기록도 함께 지워져요.`)) return;
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
      if (!confirm('이 기록을 지울까요?')) return;
      try { await saveLib({ ...it, loans:it.loans.filter((_, n) => n !== i) }, '기록을 지웠어요'); $('form').close(); reshow(); } catch (e) { saveFailed(e); }
    };
    kids.push(el('div', { className:'memo-foot' }, del));
  }
  showForm(editing ? '빌린 기록 고치기' : `«${it.t}» 빌려주기`, kids, save);
}

/* ---------- 저장 ---------- */
async function write(path, value, how) {
  if (DEMO) { console.info('[demo] 저장 안 함', path); return; }
  if (navigator.onLine === false) throw fail('인터넷이 끊겨 있어요. 연결되면 다시 눌러 주세요.');
  // Firebase 저장은 끊기면 응답 없이 기다리므로 시간을 정해 알린다. 늦게라도 연결되면 저장될 수 있다
  await Promise.race([(how === 'update' ? fb.updatePath : fb.writePath)(path, value), new Promise((_, no) => setTimeout(() => no(fail('응답이 늦어요. 인터넷을 확인해 주세요. 새로 고침해서 저장됐는지 본 뒤 다시 해 주세요.')), 15000))]);
}
const setPriv = (group, key, val) => { D.priv[group] = D.priv[group] || {}; if (val === null) delete D.priv[group][key]; else D.priv[group][key] = val; };
const refreshAll = () => { rebuild(); renderShelf(); renderLibrary(); renderPosts(); renderRecap(); setLede(); };
// 공개 데이터의 책을 처음 고칠 때는 공개 필드를 함께 저장한다
function storedWork(w) {
  const { hay, pub, ...rest } = w;
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

/* ---------- 입력 양식 ---------- */
function field(label, input, hint) { return el('label', { className:'field' }, el('span', { textContent:label }), input, hint ? el('small', { textContent:hint }) : null); }
function showForm(title, kids, onSave, saveLabel = '저장') {
  const close = el('button', { className:'close', type:'button', textContent:'×', ariaLabel:'닫기' });
  close.onclick = () => $('form').close();
  const err = el('p', { className:'form-err', role:'alert', hidden:true });
  const save = el('button', { className:'btn', type:'submit', textContent:saveLabel });
  const form = $('form-body');
  form.replaceChildren(el('div', { className:'sheet-head' }, el('h2', { id:'form-title', textContent:title }), close), ...kids, err, el('div', { className:'actions' }, save));
  form.onsubmit = async (e) => {
    e.preventDefault();
    save.disabled = true; save.textContent = '저장하는 중'; err.hidden = true;
    try { await onSave(); $('form').close(); rehostToast(); }
    catch (ex) { console.error(ex); err.textContent = ex.userMsg || '저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요. 쓴 내용은 그대로 있어요.'; err.hidden = false; }
    save.disabled = false; save.textContent = saveLabel;
  };
  $('form').showModal(); pushDlg('form');
}
const fail = (m) => { const e = new Error(m); e.userMsg = m; return e; };
function themeChecks(selected) {
  const box = el('div', { className:'checks' }, THEMES.map(([t]) => el('label', { className:'check' }, el('input', { type:'checkbox', value:t, checked:selected.includes(t) }), t)));
  box.values = () => [...box.querySelectorAll('input:checked')].map((i) => i.value);
  return box;
}
function ratingSelect(v) {
  const s = el('select', {}, ...[['', '남기지 않음'], ['5','★★★★★'], ['4','★★★★'], ['3','★★★'], ['2','★★'], ['1','★'], ['0','최하']].map(([val, t]) => el('option', { value:val, textContent:t })));
  s.value = v == null ? '' : String(v);
  return s;
}
function openBookForm(w, { pre } = {}) { // pre: 서재에만 있던 책을 읽은 책으로 옮길 때
  const isNew = !w, seed = w || pre || {};
  let newId = ''; // 저장을 다시 눌러도 같은 칸에 쓰여 책이 겹치지 않는다
  const t = el('input', { type:'text', required:true, value:seed.t || '' });
  const a = el('input', { type:'text', value:seed.a || '' });
  const p = el('input', { type:'text', value:seed.p || '' });
  const k = el('select', {}, ...KINDS.filter(([x]) => x !== 'all').map(([x, l]) => el('option', { value:x, textContent:l })));
  k.value = w ? w.k : 'book';
  const th = themeChecks(seed.th || []);
  const kids = [field('제목', t), field('저자', a), field('출판사', p), field('종류', k), field('주제', th)];
  let d, r, l, b;
  if (isNew) {
    d = el('input', { type:'date', value:today() }); r = ratingSelect(null); l = el('input', { type:'text' }); b = el('textarea', { rows:6 });
    kids.push(field('읽은 날', d), field('별점', r), field('한 줄 평', l), field('기록', b));
  }
  const save = async () => {
    const title = t.value.trim();
    if (!title) throw fail('제목을 적어 주세요');
    if (isNew && !newId) newId = DEMO ? `demo${Date.now()}` : await fb.newId();
    const base = isNew ? { id:newId, recs:[], notes:[], known:true } : { ...w };
    Object.assign(base, { t:title, a:a.value.trim(), p:p.value.trim(), k:k.value, th:th.values(), known:true });
    delete base.guess;
    if (isNew) { base.recs = [{ d:d.value, r:r.value === '' ? null : +r.value, l:l.value.trim(), b:b.value.trim() }]; base.y = (d.value || today()).slice(0, 4); base.fd = d.value || today(); }
    await saveWork(base, isNew ? '읽은 책에 꽂았어요' : '고쳤어요');
    if (pre) { await saveLib({ ...pre, w:base.id }, '읽은 책과 이었어요'); S.cur = { lib:pre.id }; }
    if ($('sheet').open) openBook(base.id, $('sheet').returnEl);
    else { // 다른 종류를 보고 있어도 꽂힌 걸 바로 보여 준다. 양식의 기록이 먼저 빠진 뒤 연다
      let tries = 0;
      const go = () => { if (((history.state && history.state.dlg) === 'form' || $('form').open) && ++tries < 40) setTimeout(go, 50); else openBook(base.id, $('addBook')); };
      setTimeout(go, 50);
    }
  };
  const del = w ? el('button', { className:'copy danger', type:'button', textContent:'책장에서 빼기' }) : null;
  if (del) del.onclick = async () => { if (!confirm(`«${titleOf(w)}»을 책장에서 뺄까요?`)) return; try { await saveWork({ ...w, del:true }, '책장에서 뺐어요'); $('form').close(); if ($('sheet').open) $('sheet').close(); } catch (e) { toast('빼지 못했어요'); } };
  if (del) kids.push(el('div', { className:'memo-foot' }, del));
  showForm(isNew ? '책 추가' : '책 정보 고치기', kids, save);
}
function openRecForm(w, i) {
  const r = i >= 0 ? w.recs[i] : {};
  const d = el('input', { type:'date', value:r.d || today() });
  const rt = ratingSelect(r.r);
  const st = el('label', { className:'check' }, el('input', { type:'checkbox', checked:r.st === 'unread' }), ' 아직 다 못 읽음');
  const l = el('input', { type:'text', value:r.l || '' });
  const b = el('textarea', { rows:8, value:r.b || '' });
  const kids = [field('날짜', d), field('별점', rt), st, field('한 줄 평', l), field('기록', b)];
  const save = async () => {
    const next = { ...r, d:d.value, r:rt.value === '' ? null : +rt.value, l:l.value.trim(), b:b.value.trim() };
    if (st.querySelector('input').checked) next.st = 'unread'; else delete next.st;
    const recs = [...w.recs];
    if (i >= 0) recs[i] = next; else recs.push(next);
    await saveWork({ ...w, recs, unread:recs.every((x) => x.st === 'unread') }, '기록을 저장했어요');
    openBook(w.id, $('sheet').returnEl);
  };
  if (i >= 0) {
    const del = el('button', { className:'copy danger', type:'button', textContent:'이 기록 지우기' });
    del.onclick = async () => { if (!confirm('이 기록을 지울까요?')) return; try { const recs = w.recs.filter((_, x) => x !== i); await saveWork({ ...w, recs }, '기록을 지웠어요'); $('form').close(); openBook(w.id, $('sheet').returnEl); } catch (e) { toast('지우지 못했어요'); } };
    kids.push(el('div', { className:'memo-foot' }, del));
  }
  showForm(i >= 0 ? '기록 고치기' : '기록 더하기', kids, save);
}
function bookPicker(required) {
  const opts = list().filter((w) => w.t).sort((a, b) => a.t.localeCompare(b.t, 'ko'));
  const name = (w) => w.t + (w.a ? ` / ${w.a}` : '');
  const dl = el('datalist', { id:'bookNames' }, opts.map((w) => el('option', { value:name(w) })));
  const input = el('input', { type:'text', required, placeholder:'책 제목을 적으면 목록이 나와요' });
  input.setAttribute('list', 'bookNames');
  const pick = () => opts.find((w) => name(w) === input.value || w.t === input.value.trim());
  return { input, dl, pick };
}
function openLinkForm(p) {
  const b = bookPicker(true);
  showForm('이 글을 어느 책과 이을까요?', [field('책', b.input), b.dl], async () => {
    const hit = b.pick();
    if (!hit) throw fail('목록에 있는 책을 골라 주세요. 없는 책이면 «+ 책 추가»로 먼저 꽂아 주세요.');
    await saveLinks(p, [...new Set([...p.w, hit.id])], '이었어요');
  }, '잇기');
}
function openPostForm() {
  const url = el('input', { type:'url', required:true, placeholder:'https://www.instagram.com/p/…' });
  const d = el('input', { type:'date', value:today() });
  const x = el('textarea', { rows:8, required:true });
  const b = bookPicker(false);
  showForm('인스타 서평 추가', [field('글 주소', url), field('올린 날', d), field('글', x, '인스타 글을 복사해 붙여 넣어 주세요'), field('책', b.input, '비워 두면 결산·일상 글로 들어가요'), b.dl], async () => {
    const m = url.value.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel)\/([A-Za-z0-9_-]+)/);
    if (!m) throw fail('인스타 글 주소를 넣어 주세요');
    const c = m[1];
    if (!x.value.trim()) throw fail('글을 넣어 주세요');
    if (D.posts.some((p) => p.c === c)) throw fail('이미 들어 있는 글이에요');
    const hit = b.input.value.trim() ? b.pick() : null;
    if (b.input.value.trim() && !hit) throw fail('목록에 있는 책을 골라 주세요. 없는 책이면 «+ 책 추가»로 먼저 꽂아 주세요.');
    const val = { c, d:d.value || today(), x:x.value.trim(), k:hit ? 'review' : 'etc', w:hit ? [hit.id] : [] };
    await write(`igAdded/${c}`, val);
    setPriv('igAdded', c, val);
    refreshAll();
    toast('서평을 넣었어요');
  });
}

/* ---------- 머리·탭·로그인 ---------- */
function setLede() {
  const books = list().filter((w) => w.k === 'book').length, reviews = D.posts.filter((p) => p.k === 'review').length;
  $('lede').textContent = `책 ${books}권, 인스타 서평 ${reviews}개`;
  $('foot').textContent = S.owner
    ? '내 기록과 메모, 별점은 로그인한 나에게만 보여요. 고친 내용은 바로 저장되고, 공개 화면에는 다음 공개 반영 때 들어가요. 제목을 못 찾은 메모는 점선 책등으로 꽂아 뒀어요.'
    : '@hyonnie_books에 쓴 서평을 책별로 모았어요.';
}
function renderWho() {
  const box = $('who');
  document.querySelectorAll('.owner-only').forEach((n) => { n.hidden = !S.owner; });
  if (S.owner) {
    const out = el('button', { className:'copy', type:'button', textContent:'로그아웃' });
    out.onclick = async () => { if (!DEMO) await fb.signOutOwner(); leaveOwner(); };
    box.replaceChildren(el('span', { className:'me', textContent:DEMO ? '시험 화면' : '내 기록 보는 중' }), out);
  } else {
    const inBtn = el('button', { className:'copy', type:'button', textContent:'주인 로그인' });
    inBtn.onclick = async () => {
      inBtn.disabled = true;
      try {
        const u = await fb.signIn();
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
  if ($('form').open) $('form').close();
  if ($('sheet').open) $('sheet').close();
  $('sheet-body').replaceChildren(); $('form-body').replaceChildren();
  S.owner = false; S.user = null; D.priv = {}; S.cur = null; S.lf = 'all'; S.lq = ''; S.lastWhere = ''; S.pastOpen = false; $('lq').value = '';
  if (S.kind !== 'book') S.kind = 'book';
  if (S.view === 'library') show('shelf');
  renderWho(); refreshAll();
}
function show(v, quiet) {
  if (v === 'library' && !S.owner) return;
  S.view = v;
  VIEWS.forEach((x) => { $(`view-${x}`).hidden = x !== v; $(`tab-${x}`).setAttribute('aria-selected', x === v); });
  $('addBook').textContent = v === 'library' ? '+ 내 서재에 꽂기' : '+ 책 추가';
  if (!quiet) { try { history.replaceState(null, '', `${location.pathname}${location.search}#${v}`); } catch (e) {} }
  if (v === 'posts') watch('.rise');
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
$('hideUnknown').addEventListener('change', (e) => { S.hideUnknown = e.target.checked; renderShelf(); });
$('onlyIg').addEventListener('change', (e) => { S.onlyIg = e.target.checked; renderShelf(); });
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

/* ---------- 시작 ---------- */
async function start() {
  try {
    const r = await fetch('data/public.json', { cache:'no-cache' });
    if (!r.ok) throw new Error(String(r.status));
    D.pub = await r.json();
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
  fb.watchAuth((u) => { if (fb.isOwner(u) && !S.owner) enterOwner(u).then(route); else if (!u && S.owner) leaveOwner(); }).catch((e) => console.error(e));
}
start();
