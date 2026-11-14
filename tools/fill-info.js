// 빈 책 정보(저자·출판사·주제) 한 번에 채우기(2026-11-14). 이미 적힌 칸은 절대 덮지 않는다.
// 1) 계획: node tools/fill-info.js private.local.json [--limit N] [--out 미리보기.html]
//    → fill-plan.local.json(gitignore)과 미리보기 HTML. 출력은 건수만(책 제목·메모는 찍지 않음)
// 2) 쓰기: node tools/fill-info.js private.local.json --apply fill-plan.local.json [--only 1,2,3] [--add 4,5] [--skip 6]
//    → «확실» 줄(+ --add 번호, − --skip 번호, --only면 그 번호만)의 빈 칸만 patch.local.json으로 만든다.
//    Firebase 쓰기는 이 도구가 하지 않는다: npx.cmd firebase-tools database:update /users/<uid>/bookshelf/works patch.local.json --project timetable-af612
// 대상: 지운 칸 아님, k:'book', known:true, 저자·출판사·주제 중 빈 칸이 있음. 주제는 js/kdc.js의 pickTheme(같은 저자 → 도서관 분류).
// 찾기: 중계(카카오) «제목 첫저자» → 도서관 분류는 카카오 ISBN으로 중계 src=nl(제목으로 찾으면 다른 판이 먼저 나온다).
const fs = require('fs'), path = require('path');
const REPO = path.join(__dirname, '..');
const RELAY = (fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8').match(/const BOOK_RELAY = '([^']+)'/) || [])[1];
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const nums = (k) => (opt(k) || '').split(',').map((x) => +x).filter(Boolean);
const CACHE = path.join(process.cwd(), 'fill-cache.local.json'); // 중계 응답 임시 보관(끊겨도 이어서). 끝나면 지운다
const PLAN = path.join(process.cwd(), 'fill-plan.local.json');

const tidy = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const squeeze = (s) => String(s || '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
// 판 이름·총서명 괄호는 빼고 비교. 권 표시(숫자·상중하가 든 괄호)는 남긴다(1권 정보가 2권에 들어가지 않게, 제미나이 검토 2026-11-14)
const bare = (s) => squeeze(String(s || '').replace(/\(([^)]*)\)|\[([^\]]*)\]/g, (m, a, b) => (/\d|^\s*[상중하]\s*$/.test(a || b || '') ? m : '')));
// js/app.js의 bookTitle·bookAuthors와 같은 모양(책 찾기로 채운 칸과 같게)
const bookTitle = (s) => tidy(s).replace(/\s*\((?:반?양장본?(?:\s*hard\s*cover)?|hard\s*cover|paperback)\)$/i, '');
const peopleText = (xs) => { const n = (xs || []).map(tidy).filter(Boolean); return n.length > 3 ? `${n[0]} 외` : n.join(', '); };
const bookAuthors = (au, tr) => { const a = peopleText(au), t = peopleText(tr); return t ? (a ? `${a}, ` : '') + `${t} 옮김` : a; };
const blank = (w, k) => (k === 'th' ? !(w.th || []).length : !tidy(w[k]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function relay(qs, cache) {
  if (cache[qs]) return cache[qs];
  for (let i = 0; i < 3; i++) {
    try {
      const r = await (await fetch(`${RELAY}?${qs}`, { redirect:'follow' })).json();
      if (r.ok) { cache[qs] = r.books || []; return cache[qs]; }
      if (r.error === 'limit') throw new Error('중계 하루 상한');
    } catch (e) { if (/상한/.test(e.message)) throw e; }
    await sleep(2000 * (i + 1));
  }
  return null; // 실패(빈 결과와 구분)
}
const isbn13 = (s) => String(s || '').split(/\s+/).find((x) => /^\d{13}$/.test(x)) || String(s || '').split(/\s+/).find(Boolean) || '';

async function plan(data, kdc) {
  const works = Object.entries(data.works || {}).map(([id, w]) => ({ ...w, id }));
  const books = works.filter((w) => !w.del && (w.k || 'book') === 'book' && w.known); // k가 없으면 책(tools/publish.js와 같음)
  const shelf = books.filter((w) => (w.th || []).length);
  let targets = books.filter((w) => blank(w, 'a') || blank(w, 'p') || blank(w, 'th'));
  const limit = +opt('--limit');
  if (limit) targets = targets.filter((w, i) => i % Math.max(1, Math.floor(targets.length / limit)) === 0).slice(0, limit);
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  const rows = [];
  let done = 0;
  const one = async (w) => {
    const fa = kdc.firstAuthorOf(w.a);
    const got = await relay(`q=${encodeURIComponent(tidy(`${w.t} ${fa}`).slice(0, 100))}`, cache);
    let list = got || [];
    if (got && !list.length && fa) list = (await relay(`q=${encodeURIComponent(tidy(w.t).slice(0, 100))}`, cache)) || [];
    const titleOk = (b) => bare(bookTitle(b.title)) === bare(w.t);
    const authorOk = (b) => !fa || [...(b.authors || []), ...(b.translators || [])].some((x) => squeeze(x).includes(squeeze(fa)) || squeeze(fa).includes(squeeze(x)));
    const fits = list.filter((b) => titleOk(b) && authorOk(b));
    // 느슨한 후보(체크 안 함): 제목은 같은데 저자 표기가 다름(영문·한글 이름 등), 또는 한쪽 제목이 다른 쪽 앞부분(부제·권 표시)
    const prefixOk = (b) => { const x = bare(bookTitle(b.title)), y = bare(w.t); return Math.min(x.length, y.length) >= 3 && x !== y && (x.startsWith(y) || y.startsWith(x)); };
    const loose = fits.length ? [] : list.filter((b) => (titleOk(b) && !authorOk(b)) || (prefixOk(b) && authorOk(b)));
    const pick = fits[0] || loose[0];
    let status = got == null ? 'fail' : !pick ? 'none' : fits.length ? 'sure' : 'check';
    const notes = [];
    if (!fits.length && pick) notes.push(titleOk(pick) ? '제목은 같고 저자 표기가 다름' : '제목이 조금 다름(부제·권 표시)');
    if (pick && list[0] !== pick) { status = 'check'; notes.push('첫 결과가 아님'); }
    if (pick && !fa && new Set(fits.map((b) => squeeze((b.authors || [])[0]))).size > 1) { status = 'check'; notes.push('같은 제목 다른 저자'); }
    // 고전·번역서처럼 맞는 판이 여러 출판사에서 나왔으면 효니 판인지 모른다(검토자 재현 2026-11-14: 모비딕 6곳)
    if (status === 'sure' && new Set(fits.map((b) => squeeze(b.publisher))).size > 1) { status = 'check'; notes.push(`판이 여럿(출판사 ${new Set(fits.map((b) => squeeze(b.publisher))).size}곳)`); }
    const fill = {}, why = {};
    if (pick) {
      if (blank(w, 'a')) { const a = bookAuthors(pick.authors, pick.translators); if (a) { fill.a = a; why.a = '카카오'; } }
      if (blank(w, 'p') && tidy(pick.publisher)) { fill.p = tidy(pick.publisher); why.p = '카카오'; }
    }
    if (blank(w, 'th')) {
      const me = { ...w, a:w.a || fill.a || '' };
      let k = '', kid = false;
      if (!kdc.authorTheme(me, shelf) && pick && isbn13(pick.isbn)) {
        const nl = await relay(`src=nl&q=${isbn13(pick.isbn)}`, cache);
        const b = (nl || [])[0];
        if (b) { k = b.kdc || ''; kid = !!b.kid; }
      }
      const t = kdc.pickTheme(me, shelf, k, kid);
      if (t) { fill.th = [t.th]; why.th = t.why; }
    }
    if (status === 'sure' && !Object.keys(fill).length) status = 'none';
    rows.push({ id:w.id, t:w.t, a:w.a || '', blank:['a', 'p', 'th'].filter((k) => blank(w, k)), status, notes, fill, why,
      cand:pick ? { t:bookTitle(pick.title), a:bookAuthors(pick.authors, pick.translators), p:tidy(pick.publisher), y:pick.year || '' } : null,
      firstHit:!pick && list[0] ? { t:bookTitle(list[0].title), a:bookAuthors(list[0].authors, list[0].translators), p:tidy(list[0].publisher) } : null });
    if (++done % 20 === 0) { fs.writeFileSync(CACHE, JSON.stringify(cache)); process.stdout.write(`${done}/${targets.length} `); }
  };
  for (let i = 0; i < targets.length; i += 4) { await Promise.all(targets.slice(i, i + 4).map(one)); await sleep(400); }
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  // 정답 비교: 이미 주제가 있는 대상 책(출판사·저자만 빈 책)에서 주제를 지우고 맞혀 본다
  const evalRows = targets.filter((w) => !blank(w, 'th'));
  let hit = 0, any = 0, tried = 0;
  for (const w of evalRows) {
    const r = rows.find((x) => x.id === w.id), me = { ...w, th:[], a:w.a || (r.fill.a || '') };
    let k = '', kid = false;
    if (!kdc.authorTheme(me, shelf) && r.cand) {
      const raw = (cache[`q=${encodeURIComponent(tidy(`${w.t} ${kdc.firstAuthorOf(w.a)}`).slice(0, 100))}`] || []).find((b) => bare(bookTitle(b.title)) === bare(w.t));
      if (raw && isbn13(raw.isbn)) { const nl = await relay(`src=nl&q=${isbn13(raw.isbn)}`, cache); const b = (nl || [])[0]; if (b) { k = b.kdc || ''; kid = !!b.kid; } }
    }
    const t = kdc.pickTheme(me, shelf, k, kid);
    if (!t) continue;
    tried++;
    if (t.th === w.th[0]) hit++;
    if (w.th.includes(t.th)) any++;
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  rows.sort((x, y) => ['sure', 'check', 'none', 'fail'].indexOf(x.status) - ['sure', 'check', 'none', 'fail'].indexOf(y.status) || x.t.localeCompare(y.t, 'ko'));
  rows.forEach((r, i) => { r.no = i + 1; });
  return { at:new Date().toISOString(), total:books.length, targets:targets.length, rows, evaluation:{ books:evalRows.length, tried, first:hit, any } };
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
function html(p) {
  const c = (s) => p.rows.filter((r) => r.status === s).length;
  const fillN = (k, s) => p.rows.filter((r) => r.fill[k] && (!s || r.status === s)).length;
  const thFrom = (re) => p.rows.filter((r) => r.status === 'sure' && r.why.th && re.test(r.why.th)).length;
  const label = { a:'저자', p:'출판사', th:'주제' }, st = { sure:'확실', check:'확인 필요', none:'못 찾음', fail:'찾기 실패' };
  const row = (r) => `<tr class="${r.status}"><td>${r.no}</td><td><input type="checkbox" data-no="${r.no}" ${r.status === 'sure' ? 'checked' : ''} ${Object.keys(r.fill).length ? '' : 'disabled'} aria-label="${r.no}번 넣기"></td>
<td><b>${esc(r.t)}</b><small>${esc(r.a || '저자 없음')}</small></td>
<td>${Object.keys(r.fill).map((k) => `<span class="f">${label[k]}: <b>${esc([].concat(r.fill[k]).join(', '))}</b> <small>${esc(r.why[k])}</small></span>`).join('') || '<small>채울 것 없음</small>'}</td>
<td><span class="tag">${st[r.status]}</span>${r.notes.map((n) => `<small>${esc(n)}</small>`).join('')}${r.cand ? `<small>찾은 책: ${esc(r.cand.t)} · ${esc(r.cand.a)} · ${esc(r.cand.p)} ${esc(r.cand.y)}</small>` : r.firstHit ? `<small>첫 결과(제목 다름): ${esc(r.firstHit.t)} · ${esc(r.firstHit.a)}</small>` : ''}</td></tr>`;
  const e = p.evaluation;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>책장 빈 칸 채우기 미리보기</title>
<style>:root{--bg:#faf8f3;--fg:#2b2620;--mute:#7a7064;--line:#e4ddd0;--ok:#2f6b45;--warn:#9a5b12;--card:#fff}@media(prefers-color-scheme:dark){:root{--bg:#1d1a16;--fg:#ece5d8;--mute:#a59a8b;--line:#3a342c;--ok:#7cc495;--warn:#e0a85a;--card:#26221d}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,'Pretendard','Apple SD Gothic Neo',sans-serif}main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:22px;margin:0 0 8px}.sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:16px 0 24px}.sum div{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 16px}.sum b{display:block;font-size:22px}
p.lead{color:var(--mute);margin:0 0 8px}table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line)}td,th{padding:8px;border-top:1px solid var(--line);vertical-align:top;text-align:left}td small{display:block;color:var(--mute);font-size:13px}
.f{display:block}.tag{font-size:13px;border-radius:4px;padding:0 8px;border:1px solid var(--line)}tr.sure .tag{color:var(--ok);border-color:var(--ok)}tr.check .tag{color:var(--warn);border-color:var(--warn)}tr.none,tr.fail{opacity:.65}
.bar{position:sticky;top:0;background:var(--bg);padding:8px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-bottom:1px solid var(--line);margin-bottom:16px}button{font:inherit;padding:0 16px;height:40px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg)}
@media(max-width:640px){thead{display:none}td:nth-child(1){display:none}table,tbody,tr,td{display:block}tr{border-top:1px solid var(--line);padding:8px 0}td{border:0;padding:4px 8px}}</style></head><body><main>
<h1>책장 빈 칸 채우기 미리보기</h1>
<p class="lead">이미 적힌 저자·출판사·주제는 그대로 두고 <b>빈 칸만</b> 채워요. 체크된 줄만 넣어요(«확실»은 미리 체크). 고친 뒤 «고른 번호 복사»를 눌러 채팅에 붙여 주면 그대로 넣어요.</p>
<div class="sum"><div>제목 확인된 책<b>${p.total}</b></div><div>빈 칸 있는 책<b>${p.targets}</b></div><div>확실<b>${c('sure')}</b></div><div>확인 필요<b>${c('check')}</b></div><div>못 찾음<b>${c('none') + c('fail')}</b></div>
<div>확실 중 채울 칸<b>${fillN('a', 'sure')}·${fillN('p', 'sure')}·${fillN('th', 'sure')}</b><small>저자·출판사·주제</small></div><div>주제 근거(확실)<b>${thFrom(/저자/)}·${thFrom(/분류/)}</b><small>같은 저자·도서관 분류</small></div></div>
<p class="lead">맞는 비율 시험: 주제가 이미 있는 대상 책 ${e.books}권 중 고를 수 있었던 ${e.tried}권에서, 효니 첫 주제와 같음 <b>${e.first}</b>권, 효니 주제 중 하나와 같음 <b>${e.any}</b>권${e.tried ? `(${Math.round(e.any / e.tried * 100)}%)` : ''}.</p>
<div class="bar"><button type="button" id="copy">고른 번호 복사</button><span id="n"></span></div>
<table><thead><tr><th>번호</th><th>넣기</th><th>책</th><th>채울 칸</th><th>상태·찾은 책</th></tr></thead><tbody>${p.rows.map(row).join('')}</tbody></table>
<script>const boxes=[...document.querySelectorAll('input[data-no]')],n=document.getElementById('n');const pick=()=>boxes.filter(b=>b.checked).map(b=>b.dataset.no);const show=()=>{n.textContent=pick().length+'줄 골랐어요'};boxes.forEach(b=>b.onchange=show);show();
document.getElementById('copy').onclick=async()=>{const t='--only '+pick().join(',');try{await navigator.clipboard.writeText(t);n.textContent='복사했어요: '+pick().length+'줄'}catch(e){prompt('이 글을 복사해 주세요',t)}};</script>
</main></body></html>`;
}

function apply(data, p) {
  const only = nums('--only'), add = nums('--add'), skip = nums('--skip');
  const chosen = p.rows.filter((r) => (only.length ? only.includes(r.no) : (r.status === 'sure' || add.includes(r.no)) && !skip.includes(r.no)));
  const patch = {};
  let n = { a:0, p:0, th:0, kept:0 };
  chosen.forEach((r) => {
    const w = (data.works || {})[r.id];
    if (!w || w.del) return;
    for (const k of Object.keys(r.fill)) {
      if (!blank(w, k)) { n.kept++; continue; } // 그사이 앱에서 채웠으면 덮지 않는다
      patch[`${r.id}/${k}`] = r.fill[k];
      n[k]++;
    }
  });
  fs.writeFileSync(path.join(process.cwd(), 'patch.local.json'), JSON.stringify(patch));
  console.log(`고른 줄 ${chosen.length} · 쓸 칸: 저자 ${n.a} · 출판사 ${n.p} · 주제 ${n.th} · 그사이 채워져 건너뜀 ${n.kept} → patch.local.json`);
}

(async () => {
  const file = args[0];
  if (!file || !fs.existsSync(file)) { console.log('사용: node tools/fill-info.js private.local.json [--limit N] [--out 파일.html] | --apply fill-plan.local.json'); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (opt('--apply')) return apply(data, JSON.parse(fs.readFileSync(opt('--apply'), 'utf8')));
  const kdc = await import(`data:text/javascript;base64,${fs.readFileSync(path.join(REPO, 'js/kdc.js')).toString('base64')}`);
  const p = await plan(data, kdc);
  fs.writeFileSync(PLAN, JSON.stringify(p));
  if (opt('--out')) fs.writeFileSync(opt('--out'), html(p));
  const c = (s) => p.rows.filter((r) => r.status === s).length;
  const th = (re) => p.rows.filter((r) => r.why.th && re.test(r.why.th)).length;
  console.log(`\n대상 ${p.targets} · 확실 ${c('sure')} · 확인 필요 ${c('check')} · 못 찾음 ${c('none')} · 실패 ${c('fail')} · 주제 근거: 저자 ${th(/저자/)} / 분류 ${th(/분류/)}`);
  console.log(`맞는 비율 시험: 대상 ${p.evaluation.books} · 고름 ${p.evaluation.tried} · 첫 주제 같음 ${p.evaluation.first} · 주제 중 하나 같음 ${p.evaluation.any}`);
})().catch((e) => { console.error('실패:', e.message); process.exit(1); });
