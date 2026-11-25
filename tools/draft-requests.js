// 블로그·인스타 초안 요청 읽기(2026-11-25, 효니 말 «연동 기능도 넣어 주면 좋겠다» → «책장 기록 → 초안 만들기»)
process.removeAllListeners('warning'); // npx shell 경고(DEP0190) 숨김
// 책장 앱 책 창 «⋯ 더 보기 → 블로그·인스타 초안 요청»이 남긴 비공개 칸 meta/toDraft/{책id} = {t, a, at, to:['blog','insta'], memo?, done?}을 읽고,
// 그 책의 기록·밑줄·메모·인스타 서평을 «재료» 파일 하나로 모은다. 초안은 이 재료로 Claude가 스킬 blog-insta-convert «C. 책장 초안 요청» 절차대로 쓴다.
// 이 도구는 글을 쓰지 않는다. 출력에는 제목·건수·경로만 나오고 기록 내용은 재료 파일에만 들어간다(레포 밖 산출물 폴더).
//
// 쓰는 법(교사업무\웹앱\bookshelf 에서):
//   node tools/draft-requests.js                    기다리는 요청 목록(제목·요청일·쓸 곳·재료 건수·폴더 상태)
//   node tools/draft-requests.js --make [--id 책id]  재료 파일 만들기: <out>\<책 제목>\재료-YYYY-MM-DD.md (있으면 -2, -3 …로, 덮어쓰지 않음)
//   node tools/draft-requests.js --done 책id --dir "폴더 이름" [--mark]
//        다 쓴 요청 기록. 늘 이 PC의 draft-done.local.json에 남기고(같은 요청을 다시 안 집음),
//        --mark를 붙이면 Firebase meta/toDraft/<id>/done = {at, dir}도 쓴다(앱에 «초안 나옴»으로 보임. Firebase 쓰기라 효니 확인 뒤에만)
//   공통: --file 받은.json(Firebase 대신, 시험용) --out 폴더(기본 클로드작업\산출물\블로그글\블로그) --record 기록.json --all(다 쓴 요청도 보기)
// Firebase 읽기는 firebase-tools CLI 로그인(효니 계정)이 필요하다. Git Bash가 아닌 PowerShell/cmd에서 npx.cmd로 돈다.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OWNER_UID = 'uPzJdaRI9JSHxy0IX0PyUMeXR963';
const PROJECT = 'timetable-af612';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const OUT = path.resolve(opt('--out', path.join(ROOT, '..', '..', '클로드작업', '산출물', '블로그글', '블로그')));
const RECORD = path.resolve(opt('--record', path.join(ROOT, 'draft-done.local.json')));
const TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const TO_NAME = { blog: '블로그 서평', insta: '인스타 캡션' };
const win = process.platform === 'win32';

function fbGet() {
  const file = opt('--file');
  if (file) return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')) || {};
  const tmp = path.join(os.tmpdir(), `bookshelf-draft-${process.pid}.json`);
  try {
    execFileSync(win ? 'npx.cmd' : 'npx', ['-y', 'firebase-tools', 'database:get', `/users/${OWNER_UID}/bookshelf`, '--project', PROJECT, '-o', tmp],
      { stdio: ['ignore', 'ignore', 'inherit'], shell: win, env: { ...process.env, NODE_NO_WARNINGS: '1' } });
    return JSON.parse(fs.readFileSync(tmp, 'utf8').replace(/^﻿/, '')) || {};
  } finally { try { fs.unlinkSync(tmp); } catch {} }
}
const readRecord = () => { try { return JSON.parse(fs.readFileSync(RECORD, 'utf8')); } catch { return {}; } };

// 합치기로 빠진 책은 into를 따라 남긴 책으로(앱 movedTo와 같은 뜻)
function movedTo(works, id) { const seen = new Set(); let k = id; while (works[k] && works[k].del && works[k].into && !seen.has(k)) { seen.add(k); k = works[k].into; } return k; }
// 윈도 폴더 이름으로 쓸 수 없는 글자를 뺀다
const folderName = (t) => String(t || '제목 없음').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 60) || '제목 없음';
const tidy = (s) => String(s || '').replace(/\r\n?/g, '\n').trim();
const pageNum = (p) => { const m = /\d+/.exec(p || ''); return m ? +m[0] : Infinity; };
const star = (r) => (r == null || r === '' ? '' : `별점 ${r}`);

// 요청 하나의 상태: 다 씀 = Firebase done이 있거나, 이 PC 기록에 같은 요청 날짜(at)로 남김
const stamp = (d) => (d.n ? `n${d.n}` : `at${d.at || ''}`);
function doneOf(key, d, record) { const rec = record[key]; return d.done ? { at: d.done.at, dir: d.done.dir, where: '앱' } : rec && (rec.stamp ? rec.stamp === stamp(d) : !d.n && rec.at === d.at) ? { at: rec.doneAt, dir: rec.dir, where: '이 PC' } : null; }
// 합쳐서 같은 책이 된 요청은 하나로(쓸 곳 합집합, 덧붙인 말 이어 붙임, 날짜는 늦은 쪽). 다 씀은 모든 요청이 다 썼을 때만
function requests(priv, record) {
  const works = priv.works || {}, list = ((priv.meta || {}).toDraft) || {};
  const by = new Map();
  Object.entries(list).filter(([, d]) => d && typeof d === 'object').forEach(([key, d]) => { const id = movedTo(works, key); if (!by.has(id)) by.set(id, []); by.get(id).push([key, d]); });
  return [...by.entries()].map(([id, kd]) => {
    const w = works[id] && !works[id].del ? works[id] : null; // 책장에서 뺀 책(del, into 없음)은 재료를 만들지 않는다
    const late = kd.reduce((x, y) => (String(y[1].at || '').localeCompare(String(x[1].at || '')) > 0 ? y : x));
    const own = kd.find(([k]) => k === id) || late;
    const memo = [...new Set(kd.map(([, x]) => tidy(x.memo)).filter(Boolean))].join(' / ');
    const d = { ...late[1], to: ['blog', 'insta'].filter((t) => kd.some(([, x]) => (x.to || []).includes(t))), memo };
    const dones = kd.map(([k, x]) => doneOf(k, x, record));
    return { key: own[0], keys: kd.map(([k]) => k), id, w, d, done: dones.every(Boolean) ? dones[0] : null };
  }).sort((a, b) => String(a.d.at || '').localeCompare(String(b.d.at || '')));
}

// 인스타 서평: 공개본 posts + 비공개 igAdded·igLinks(tools/publish.js와 같은 합치기), 책 id는 movedTo로
function igPosts(priv, works, id) {
  let pub = { posts: [] };
  try { pub = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'public.json'), 'utf8')); } catch {}
  const posts = new Map((pub.posts || []).map((p) => [p.c, { ...p, w: p.w || [] }]));
  Object.values(priv.igAdded || {}).forEach((p) => { if (p && p.c) posts.set(p.c, { c: p.c, d: p.d, x: p.x, k: p.k || 'review', w: p.w || [] }); });
  Object.entries(priv.igLinks || {}).forEach(([c, l]) => { const p = posts.get(c); if (p && l) { p.w = l.w || []; if (l.k) p.k = l.k; } });
  return [...posts.values()].filter((p) => (p.w || []).some((x) => movedTo(works, x) === id)).sort((a, b) => String(a.d || '').localeCompare(String(b.d || '')));
}
function blogPosts(works, id) {
  try { return (JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'blog.json'), 'utf8')).posts || []).filter((p) => (p.w || []).some((x) => movedTo(works, x) === id)); } catch { return []; }
}
function stuffOf(priv, r) {
  const w = r.w || {}, works = priv.works || {};
  return {
    recs: (w.recs || []).filter((x) => x && (tidy(x.l) || tidy(x.b))),
    marks: (w.marks || []).filter((m) => m && tidy(m.q)).sort((a, b) => pageNum(a.p) - pageNum(b.p)),
    notes: (w.notes || []).filter((n) => n && tidy(n.b || n.l)),
    ig: igPosts(priv, works, r.id),
    blog: blogPosts(works, r.id),
  };
}
const counts = (s) => `기록 ${s.recs.length} · 밑줄 ${s.marks.length} · 메모 ${s.notes.length} · 인스타 ${s.ig.length} · 블로그 ${s.blog.length}`;
function folderState(dir) {
  if (!fs.existsSync(dir)) return '새 폴더';
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  const drafts = files.filter((f) => /^(초안|인스타-캡션)/.test(f)).length;
  return drafts ? `폴더 있음 · 초안 ${drafts}개(덮어쓰지 말 것)` : '폴더 있음';
}
function freeName(dir, base) { let n = 1, f = `${base}.md`; while (fs.existsSync(path.join(dir, f))) f = `${base}-${++n}.md`; return f; }

function materialText(r, s) {
  const w = r.w || {}, d = r.d;
  const L = [];
  L.push('---', `책장id: ${r.id}`, `요청: ${d.at || ''}`, `쓸곳: [${(d.to || []).map((t) => TO_NAME[t] || t).join(', ')}]`, `만든날: ${TODAY}`, '---', '');
  L.push(`# 재료 — ${w.t || d.t || '제목 없음'}`, '');
  L.push('> 책장 «블로그·인스타 초안 요청»으로 모은 재료. 비공개 기록이 들어 있으니 이 파일은 밖으로 보내지 않는다(제미나이·엑사원 검토에도 넣지 않음).', '> 초안은 스킬 blog-insta-convert «C. 책장 초안 요청» 절차대로 블로그·인스타를 따로 쓴다.', '');
  L.push('## 책 정보(책장에 적힌 것만 — 가격·쪽수는 확인해서)', `- 제목: ${w.t || d.t || ''}`, `- 저자: ${w.a || d.a || ''}`, `- 출판사: ${w.p || '[확인 필요]'}`);
  if ((w.th || []).length) L.push(`- 책장 주제: ${(w.th || []).join(', ')}`);
  L.push('');
  L.push('## 효니가 남긴 요청', `- 쓸 곳: ${(d.to || []).map((t) => TO_NAME[t] || t).join(', ') || '(없음)'}`, `- 덧붙인 말: ${tidy(d.memo) || '(없음)'}`, '');
  L.push(`## 독서 기록 ${s.recs.length}`);
  s.recs.sort((a, b) => String(a.d || '9').localeCompare(String(b.d || '9'))).forEach((x) => {
    L.push(`### ${[x.d || '날짜 없음', x.st === 'unread' ? '읽는 중·미완독' : '', star(x.r), x.pub === true ? '방문자에게 공개한 글' : ''].filter(Boolean).join(' · ')}`);
    if (tidy(x.l)) L.push(`한 줄 평: ${tidy(x.l)}`);
    if (tidy(x.b)) L.push('', tidy(x.b));
    L.push('');
  });
  L.push(`## 밑줄 ${s.marks.length} (쪽 순서)`);
  s.marks.forEach((m) => { L.push(`- ${tidy(m.p) ? `(${tidy(m.p)}쪽) ` : '(쪽 없음) '}${tidy(m.q).replace(/\n+/g, ' / ')}`); if (tidy(m.why)) L.push(`  - 내 생각: ${tidy(m.why).replace(/\n+/g, ' / ')}`); });
  L.push('');
  L.push(`## 아이폰 메모 ${s.notes.length} (사적인 내용이 섞여 있을 수 있음 — 글에 옮기기 전에 거르기)`);
  s.notes.forEach((n) => { L.push(`### ${n.d || '날짜 없음'}${n.s === 'reading' ? ' · 읽는 중' : ''}`, tidy(n.b || n.l), ''); });
  L.push(`## 이미 올린 인스타 서평 ${s.ig.length}`);
  s.ig.forEach((p) => { L.push(`### ${p.d || ''} · https://www.instagram.com/p/${p.c}/`, tidy(p.x), ''); });
  L.push(`## 이미 쓴 블로그 글 ${s.blog.length} (겹치지 않게)`);
  s.blog.forEach((p) => L.push(`- ${p.d || ''} ${p.t || ''} ${p.u || ''}`));
  L.push('');
  return L.join('\n');
}

function fbMarkDone(key, val) {
  const tmp = path.join(os.tmpdir(), `bookshelf-draft-done-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ done: val }));
  try {
    execFileSync(win ? 'npx.cmd' : 'npx', ['-y', 'firebase-tools', 'database:update', `/users/${OWNER_UID}/bookshelf/meta/toDraft/${key}`, tmp, '--project', PROJECT, '--force'],
      { stdio: ['ignore', 'ignore', 'inherit'], shell: win, env: { ...process.env, NODE_NO_WARNINGS: '1' } });
  } finally { try { fs.unlinkSync(tmp); } catch {} }
}

function main() {
  const record = readRecord();
  const doneId = opt('--done');
  if (has('--done')) {
    if (!doneId) throw new Error('--done 뒤에 책id를 주세요');
    const priv = fbGet();
    const r = requests(priv, record).find((x) => x.keys.includes(doneId) || x.id === doneId);
    if (!r) throw new Error('그 책id의 초안 요청이 없어요');
    const dir = opt('--dir', folderName((r.w && r.w.t) || r.d.t));
    const list = (priv.meta || {}).toDraft || {};
    r.keys.forEach((k) => { record[k] = { at: list[k].at, stamp: stamp(list[k]), doneAt: TODAY, dir }; });
    fs.writeFileSync(RECORD, JSON.stringify(record, null, 1));
    if (has('--mark') && !opt('--file')) r.keys.forEach((k) => fbMarkDone(k, { at: TODAY, dir }));
    console.log(`다 씀 기록: ${(r.w && r.w.t) || r.d.t} → ${dir}${has('--mark') ? ' (앱에도 «초안 나옴» 표시)' : ' (이 PC 기록만, 앱 표시는 --mark)'}`);
    return;
  }
  const priv = fbGet();
  const all = requests(priv, record);
  const want = opt('--id');
  const list = all.filter((r) => (has('--all') || !r.done) && (!want || r.keys.includes(want) || r.id === want));
  console.log(`초안 요청 ${all.length}개 · 기다림 ${all.filter((r) => !r.done).length}개${want ? ` · 고른 책 ${list.length}개` : ''}`);
  list.forEach((r, i) => {
    const s = stuffOf(priv, r), name = folderName((r.w && r.w.t) || r.d.t), dir = path.join(OUT, name);
    console.log(`${i + 1}. «${(r.w && r.w.t) || r.d.t}» 책id ${r.id}${r.keys.some((k) => k !== r.id) ? `(합쳐서 빠진 책 요청 포함 ${r.keys.length}개)` : ''} · 요청 ${r.d.at} · ${(r.d.to || []).map((t) => TO_NAME[t] || t).join('·')}${tidy(r.d.memo) ? ' · 덧붙인 말 있음' : ''}${r.done ? ` · 다 씀(${r.done.where} ${r.done.at || ''})` : ''}`);
    console.log(`   재료: ${counts(s)}${r.w ? '' : ' · 책장에 없는 책(지웠을 수 있음)'}`);
    console.log(`   폴더: ${dir} — ${folderState(dir)}`);
    if (has('--make') && r.w) {
      fs.mkdirSync(dir, { recursive: true });
      const f = freeName(dir, `재료-${TODAY}`);
      fs.writeFileSync(path.join(dir, f), materialText(r, s), 'utf8');
      console.log(`   재료 파일: ${path.join(dir, f)}`);
    }
  });
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('실패:', e.message.split('\n')[0]); process.exit(1); }
}
module.exports = { requests, movedTo, folderName, stuffOf, materialText, freeName };
