// 밑줄을 효니노트 볼트로 내보낸다. 웹앱 → 볼트 한 방향이고, 볼트에서 고친 글은 웹앱으로 돌아가지 않는다.
// 준비: npx.cmd firebase-tools database:get /users/<주인uid>/bookshelf --project timetable-af612 -o private.local.json
// 미리보기: node tools/export-obsidian.js private.local.json --dry-run   → 만들 파일 수만 출력하고 아무것도 쓰지 않는다
// 쓰기:     node tools/export-obsidian.js private.local.json             → 끝나면 private.local.json을 지운다
// 다른 볼트로 시험: --vault <폴더>
//
// 쓰는 곳은 <볼트>/4-독서·문화/밑줄/ 뿐이다. 효니가 고치는 책 노트는 읽기만 한다. 파일은 지우지 않고, 이름도 바꾸지 않는다.
//
// 사람이 고친 부분 보존(문장 칸 단위):
// - 칸마다 %%밑줄 id 지문%% ~ %%/밑줄%% 표시가 있고, 지문은 내보낼 때 만든 칸 내용의 해시다.
// - 표시 밖에 쓴 글(제목 아래, 칸 사이)은 그대로 둔다. 칸 사이 글은 바로 앞 칸을 따라다닌다.
// - 칸 안을 고치면 지문이 어긋나므로 그 칸은 덮어쓰지 않고 «손댄칸»으로 센다. 칸을 통째로 지우면 다음 내보내기 때 앱 내용으로 다시 만든다.
// - 앱에서 지운 문장은 손대지 않은 칸만 뺀다. 손댔거나 뒤에 글을 쓴 칸은 맨 뒤로 옮겨 남긴다.
// - 머리말의 낱말과 효니가 더한 속성은 남긴다. 앱에서 오는 속성(OWNED)만 새로 쓴다.
// - 낱말은 사람이 넣는 칸이다. 앱이 찾은 낱말은 따로 자동낱말에 링크로 적고 내보낼 때마다 새로 쓴다. 낱말 칸을 읽지도 고치지도 않는다.
//   링크는 [[4-독서·문화/낱말/기억|기억]]이고 낱말 노트를 만들지는 않는다. 그래프와 백링크에서 같은 낱말의 밑줄 노트가 이어진다.
// - 내 생각 안의 %%는 칸 표시와 헷갈리지 않게 노트에서 % %로 적는다.
// 비공개 내용을 출력하지 않는다. 건수만 찍는다.
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const BOOK_DIR = '4-독서·문화', MARK_DIR = '밑줄', WORD_DIR = '낱말', WORD_LIMIT = 8;
const OWNED = ['type', '책id', '제목', '저자', '책', '밑줄수', '마지막밑줄', '손댄칸', '자동낱말'];
const START = /^%%밑줄 ([A-Za-z0-9-]+) ([0-9a-f]{8})%%$/, END = '%%/밑줄%%';
const HEAD = '%% 책장 웹앱에서 내보낸 노트입니다. 칸 안쪽은 앱 내용이고, 고치면 그 칸은 앱 내용으로 바꾸지 않고 머리말 손댄칸에 셉니다. 칸 밖에 쓴 글은 그대로 남습니다. %%';

const lf = (s) => String(s == null ? '' : s).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
const print = (s) => crypto.createHash('sha1').update(lf(s).trim()).digest('hex').slice(0, 8);
const yamlStr = (s) => JSON.stringify(String(s == null ? '' : s));
const norm = (s) => String(s || '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();

// 파일 이름: 창에서 못 쓰는 글자와 위키링크를 깨는 글자를 뺀다. 경로를 벗어날 수 없다
function safeName(title) {
  let s = String(title || '').replace(/[\\/:*?"<>|#^[\]%\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').replace(/[. ]+$/, '').slice(0, 100).trim();
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(s)) s += ' 책';
  return s;
}
const marksOf = (w) => (Array.isArray(w.marks) ? w.marks : Object.values(w.marks || {})).filter((m) => m && String(m.q || '').trim());
const blockId = (m) => String(m.id || '').replace(/[^A-Za-z0-9-]/g, '-') || `m${print(m.q)}`; // 블록 ID는 영문·숫자·줄표만 된다
const pageNum = (p) => { const m = /\d+/.exec(p || ''); return m ? +m[0] : Infinity; };
const inOrder = (a, b) => pageNum(a.p) - pageNum(b.p) || String(a.d || '').localeCompare(String(b.d || '')) || blockId(a).localeCompare(blockId(b)); // js/app.js marksInOrder와 같은 순서
const pageLabel = (p) => { const s = lf(p).replace(/\s+/g, ' ').trim(); return !s ? '쪽 없음' : /^\d/.test(s) ? `p.${s}` : s; };

// 칸 하나. 문장 줄은 모두 >로 시작하고, 내 생각 안의 %%는 표시와 헷갈리지 않게 벌린다
function renderBlock(m) {
  const lines = [`> [!quote] ${pageLabel(m.p)}`, ...lf(m.q).trim().split('\n').map((l) => (l.trim() ? `> ${l}` : '>')), '', `^${blockId(m)}`];
  const why = lf(m.why).trim().replace(/%%/g, '% %');
  if (why) lines.push('', '**내 생각**', why);
  if (m.d) lines.push('', `— ${String(m.d).replace(/\s+/g, ' ')}`);
  return lines.join('\n');
}

// 기존 파일 읽기. 표시가 어긋나면 null(건드리지 않는다)
function parseNote(text) {
  const t = lf(text);
  const fm = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(t);
  if (!fm) return null;
  const front = [];
  fm[1].split('\n').forEach((line) => {
    const k = /^([^\s:#-][^:]*):/.exec(line);
    if (k) front.push({ key:k[1].trim(), lines:[line] });
    else if (front.length) front[front.length - 1].lines.push(line);
  });
  const head = [], blocks = [];
  let cur = null, inside = false;
  for (const line of t.slice(fm[0].length).split('\n')) {
    const s = START.exec(line);
    if (!inside && s) { cur = { id:s[1], stamp:s[2], body:[], after:[] }; blocks.push(cur); inside = true; }
    else if (inside && line === END) inside = false;
    else if (inside) { if (START.test(line)) return null; cur.body.push(line); }
    else if (line === END) return null;
    else (cur ? cur.after : head).push(line);
  }
  if (inside || new Set(blocks.map((b) => b.id)).size !== blocks.length) return null;
  return { front, head:head.join('\n').trim(), blocks:blocks.map((b) => ({ id:b.id, stamp:b.stamp, body:b.body.join('\n').trim(), after:b.after.join('\n').trim() })) };
}

function buildFront(info, old) {
  const out = OWNED.filter((k) => info[k] !== undefined).map((k) => `${k}: ${info[k]}`);
  const kept = (old || []).filter((e) => !OWNED.includes(e.key));
  if (!kept.some((e) => e.key === '낱말')) out.push('낱말: []');
  kept.forEach((e) => out.push(...e.lines));
  return `---\n${out.join('\n')}\n---`;
}

// 앱의 문장과 기존 파일을 합친다. 돌려주는 값: 새 파일 내용과 건수
function merge(info, marks, old) {
  const had = new Map((old ? old.blocks : []).map((b) => [b.id, b]));
  const stat = { touched:0, kept:0 };
  const blocks = marks.map((m) => {
    const id = blockId(m), body = renderBlock(m), ex = had.get(id);
    had.delete(id);
    if (!ex) return { id, stamp:print(body), body, after:'' };
    if (print(ex.body) !== ex.stamp) { stat.touched++; return ex; } // 손댄 칸은 그대로 두고 지문도 그대로 둔다
    return { id, stamp:print(body), body, after:ex.after };
  });
  for (const b of had.values()) { // 앱에 없어진 문장
    const touched = print(b.body) !== b.stamp;
    if (touched) stat.touched++;
    if (touched || b.after) { stat.kept++; blocks.push(b); }
  }
  const front = buildFront({ ...info, 밑줄수:blocks.length, ...(stat.touched ? { 손댄칸:stat.touched } : {}) }, old && old.front);
  const parts = [front, '', old ? old.head : HEAD];
  blocks.forEach((b) => { parts.push('', `%%밑줄 ${b.id} ${b.stamp}%%`, '', b.body, '', END); if (b.after) parts.push('', b.after); });
  return { text:parts.join('\n').replace(/\n{3,}(?=%%밑줄 )/g, '\n\n') + '\n', stat, count:blocks.length };
}

function listNotes(dir) { try { return fs.readdirSync(dir).filter((f) => f.endsWith('.md')); } catch (e) { return []; } }
function writeAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

// 낱말 뽑기는 웹앱과 같은 파일(js/words.js)을 쓴다. 브라우저 모듈이라 내용을 그대로 불러온다
const loadWords = () => import(`data:text/javascript;base64,${fs.readFileSync(path.join(__dirname, '..', 'js', 'words.js')).toString('base64')}`);

// 책마다 밑줄·내 생각에 나온 낱말. 글 전체(메모·서평 포함)에서 두 권 이상에 나온 낱말만 친다. 그 책에서 많이 나온 순서
function markWords(index, id) {
  return index.map((x) => { const b = x.books.find((y) => y.id === id); return b && b.lines.some((l) => l.src === '밑줄' || l.src === '내 생각') ? { word:x.word, n:b.lines.filter((l) => l.src === '밑줄' || l.src === '내 생각').length } : null; })
    .filter(Boolean).sort((a, b) => b.n - a.n || a.word.localeCompare(b.word, 'ko')).slice(0, WORD_LIMIT).map((x) => x.word);
}
const wordLinks = (words) => (words.length ? `[${words.map((w) => yamlStr(`[[${BOOK_DIR}/${WORD_DIR}/${w}|${w}]]`)).join(', ')}]` : undefined);

async function main(argv) {
  const dry = argv.includes('--dry-run');
  const vi = argv.indexOf('--vault');
  const src = argv.filter((a, i) => !a.startsWith('--') && !(vi >= 0 && i === vi + 1))[0];
  if (!src) throw new Error('사용법: node tools/export-obsidian.js private.local.json [--dry-run] [--vault 폴더]');
  const vault = vi >= 0 ? argv[vi + 1] : path.join(__dirname, '..', '..', '..', '클로드작업', '옵시디언', '효니노트');
  const bookDir = path.join(vault, BOOK_DIR), outDir = path.join(bookDir, MARK_DIR);
  if (!fs.existsSync(bookDir)) throw new Error('볼트를 찾지 못했습니다. --vault로 볼트 폴더를 알려 주세요.');

  const priv = JSON.parse(lf(fs.readFileSync(src, 'utf8')));
  let pub = {}, pubAll = {};
  try { pubAll = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'public.json'), 'utf8')); pub = Object.fromEntries(pubAll.books.map((b) => [b.id, b])); } catch (e) { /* 공개본은 제목 보충·서평용일 뿐이다 */ }
  const { buildWordIndex, wordDoc, WORD_KINDS } = await loadWords();
  const reviews = new Map();
  // 재료는 앱의 낱말 지도와 같다: 공개 책 + 비공개 칸, 공개 서평 + 비공개로 더하거나 고친 서평 연결
  const posts = new Map((pubAll.posts || []).map((p) => [p.c, { ...p }]));
  Object.values(priv.igAdded || {}).forEach((p) => { if (p && p.c) posts.set(p.c, { ...p }); });
  Object.entries(priv.igLinks || {}).forEach(([c, l]) => { const p = posts.get(c); if (p && l) { p.w = l.w || []; if (l.k) p.k = l.k; } });
  posts.forEach((p) => { if (p.k !== 'review') return; (p.w || []).forEach((id) => { if (!reviews.has(id)) reviews.set(id, []); reviews.get(id).push(p.x); }); });
  const allWorks = { ...Object.fromEntries(Object.entries(pub).map(([id, b]) => [id, { ...b, known:true }])), ...priv.works };
  const wordIndex = buildWordIndex(Object.entries(allWorks).filter(([id, w]) => w && !w.del && (w.known || pub[id]) && WORD_KINDS.includes(w.k || 'book')).map(([id, w]) => wordDoc(id, { ...w, t:w.t || (pub[id] || {}).t, a:w.a || (pub[id] || {}).a }, reviews.get(id))));
  const works = Object.entries(priv.works || {}).filter(([, w]) => w && !w.del).map(([id, w]) => ({ id, t:w.t || (pub[id] || {}).t || '', a:w.a || (pub[id] || {}).a || '', marks:marksOf(w).sort(inOrder) }));

  // 이미 있는 밑줄 파일: 제목이 바뀌어도 같은 파일을 쓰도록 책id로 찾는다
  const byId = new Map(), taken = new Set();
  listNotes(outDir).forEach((f) => {
    taken.add(f.toLowerCase());
    const m = /^책id:\s*"?([^"\n]+)"?\s*$/m.exec(lf(fs.readFileSync(path.join(outDir, f), 'utf8')).split(/\n---/)[0]);
    if (m) byId.set(m[1].trim(), f);
  });

  // 책 노트: 이름이 같은 노트, 없으면 머리말 type: 독서의 제목이 같은 노트. 처음 필요할 때 한 번만 훑는다
  let bookIndex = null;
  const bookNames = new Set(listNotes(bookDir));
  function findBook(title) {
    const name = safeName(title);
    if (!name) return '';
    if (bookNames.has(`${name}.md`)) return name;
    if (!bookIndex) {
      bookIndex = new Map();
      bookNames.forEach((f) => {
        let head = '';
        try { const fd = fs.openSync(path.join(bookDir, f), 'r'), b = Buffer.alloc(800), n = fs.readSync(fd, b, 0, 800, 0); fs.closeSync(fd); head = lf(b.slice(0, n).toString('utf8')); } catch (e) { return; }
        if (!/^type:\s*독서\s*$/m.test(head)) return;
        const t = /^제목:\s*"?(.+?)"?\s*$/m.exec(head);
        if (t && !bookIndex.has(norm(t[1]))) bookIndex.set(norm(t[1]), f.slice(0, -3));
      });
    }
    return bookIndex.get(norm(title)) || '';
  }

  const n = { 밑줄있는책:0, 밑줄:0, 새파일:0, 고침:0, 그대로:0, 손댄칸:0, 앱에없어남긴칸:0, 빈파일:0, 건너뜀_형식이상:0, 건너뜀_이름겹침:0, 책노트연결:0, 책노트없음:0 };
  const plan = [];
  function target(w) {
    if (byId.has(w.id)) return byId.get(w.id);
    const base = safeName(w.t) || `제목 미확인 ${w.id.slice(-6)}`;
    for (const name of [base, safeName(`${base} (${w.a})`), `${base} (${w.id.slice(-6)})`]) {
      const f = `${name}.md`;
      if (name && !taken.has(f.toLowerCase())) { taken.add(f.toLowerCase()); return f; }
    }
    return '';
  }
  function plant(w, file) {
    const full = path.join(outDir, file);
    const before = fs.existsSync(full) ? lf(fs.readFileSync(full, 'utf8')) : null;
    const old = before === null ? null : parseNote(before);
    if (before !== null && !old) { n.건너뜀_형식이상++; return; }
    const title = w.t || file.slice(0, -3), found = findBook(title);
    if (w.marks.length) { if (found) n.책노트연결++; else n.책노트없음++; }
    const linkName = found || safeName(title) || file.slice(0, -3), alias = safeName(title) || linkName;
    const days = w.marks.map((m) => String(m.d || '')).filter(Boolean).sort();
    const info = { type:'밑줄', 책id:yamlStr(w.id), 제목:yamlStr(title), 저자:yamlStr(w.a), 책:yamlStr(`[[${BOOK_DIR}/${linkName}|${alias}]]`), 마지막밑줄:days.length ? days[days.length - 1] : '""', 자동낱말:wordLinks(markWords(wordIndex, w.id)) };
    const r = merge(info, w.marks, old);
    n.손댄칸 += r.stat.touched; n.앱에없어남긴칸 += r.stat.kept;
    if (!r.count) n.빈파일++;
    if (before === null) n.새파일++;
    else if (before === r.text) n.그대로++;
    else n.고침++;
    if (before !== r.text) plan.push({ full, text:r.text, before });
  }

  works.filter((w) => w.marks.length).forEach((w) => {
    n.밑줄있는책++; n.밑줄 += w.marks.length;
    const file = target(w);
    if (!file) { n.건너뜀_이름겹침++; return; }
    plant(w, file);
  });
  // 앱에서 밑줄이 없어졌거나 다른 책으로 합쳐진 파일도 맞춰 준다. 파일은 지우지 않는다
  const withMarks = new Set(works.filter((w) => w.marks.length).map((w) => w.id));
  byId.forEach((file, id) => {
    if (withMarks.has(id)) return;
    const w = works.find((x) => x.id === id) || { id, t:'', a:'', marks:[] };
    const fm = /^제목:\s*"(.*)"\s*$/m.exec(lf(fs.readFileSync(path.join(outDir, file), 'utf8')));
    let t = w.t; if (!t && fm) { try { t = JSON.parse(`"${fm[1]}"`); } catch (e) { t = fm[1]; } }
    plant({ ...w, t }, file);
  });

  if (!dry && plan.length) {
    fs.mkdirSync(outDir, { recursive:true });
    plan.forEach(({ full, text, before }) => {
      const now = fs.existsSync(full) ? lf(fs.readFileSync(full, 'utf8')) : null;
      if (now !== before) { n.건너뜀_방금바뀜 = (n.건너뜀_방금바뀜 || 0) + 1; return; } // 합치는 사이에 Obsidian에서 고쳤으면 쓰지 않는다
      writeAtomic(full, text);
    });
  }
  console.log(dry ? '[미리보기] 아무것도 쓰지 않았습니다' : '[내보내기] 끝');
  Object.entries(n).forEach(([k, v]) => console.log(`${k}: ${v}`));
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
module.exports = { parseNote, merge, renderBlock, safeName, print };
