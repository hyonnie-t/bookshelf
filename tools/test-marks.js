// 밑줄 시험: 공개본에 안 나감, 볼트 내보내기(미리보기·보존), 범용판 복원. 가짜 데이터만 쓴다.
// 사용: node tools/test-marks.js
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), { execFileSync } = require('child_process');
const REPO = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'marks-'));
const SECRET = '비밀문장ZQX', THINK = '비밀생각ZQX';
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  통과', name); };
const run = (args, cwd) => execFileSync(process.execPath, args, { cwd:cwd || tmp, encoding:'utf8' });

// 1. 공개 반영. publish.js가 data/public.json을 고치므로 임시 사본에서 돌린다
console.log('공개 반영');
fs.mkdirSync(path.join(tmp, 'pub', 'tools'), { recursive:true });
fs.mkdirSync(path.join(tmp, 'pub', 'data'));
fs.copyFileSync(path.join(REPO, 'tools/publish.js'), path.join(tmp, 'pub/tools/publish.js'));
fs.writeFileSync(path.join(tmp, 'pub/data/blog.json'), '{"posts":[]}');
fs.writeFileSync(path.join(tmp, 'pub/data/public.json'), JSON.stringify({ at:'2026-01-01', books:[{ id:'b1', t:'공개 책', a:'저자', k:'book', th:[], y:'2026', fd:'2026-01-01' }, { id:'b7', t:'공개본에만 있던 책', a:'저자', k:'book', th:[], y:'2026', fd:'2026-01-01' }], posts:[] }));
const mark = { id:'m1', d:'2026-11-07', p:'129–130', q:SECRET, why:THINK };
const priv = { works:{
  b1:{ t:'공개 책', a:'저자', k:'book', known:true, th:[], y:'2026', fd:'2026-01-01', recs:[{ d:'2026-01-01', r:4, l:'평', b:'기록' }], marks:[mark, { id:'q1', p:'30', q:'공개되는 충분히 긴 필사 문장 하나', why:THINK }, { id:'q2', p:'5', q:'쪽이 앞서는 공개 필사 문장 둘이다', pub:true }, { id:'q3', p:'9', q:'끈 밑줄이라 공개본에 없는 문장이다', pub:false }, { id:'q4', p:'40', q:'네 번째 공개 후보 문장도 충분히 길다' }, { id:'q5', p:'50', q:'다섯 번째 후보는 세 개를 넘어서 잘린다' }, { id:'q6', p:'1', q:'짧은 문장' }, { id:'q7', p:'2 이 쪽 칸에는 내 생각처럼 긴 글이 들어 있다', q:'쪽 칸이 길어도 문장만 공개되는 글이다' }] },
  b2:{ t:'밑줄만 있는 책', a:'저자', k:'book', known:true, th:[], marks:[{ ...mark, id:'m2' }] },
  b7:{ t:'공개본에만 있던 책', a:'저자', k:'book', known:true, th:[], y:'2026', fd:'2026-01-01', marks:[{ ...mark, id:'m7' }] },
  b3:{ t:'보관 메모와 밑줄', a:'저자', k:'book', known:true, th:[], archived:[{ d:'2026-01-01', b:'보관글' }], marks:[{ ...mark, id:'m3' }] },
} };
fs.writeFileSync(path.join(tmp, 'priv.json'), JSON.stringify(priv));
run([path.join(tmp, 'pub/tools/publish.js'), path.join(tmp, 'priv.json')]);
const out = fs.readFileSync(path.join(tmp, 'pub/data/public.json'), 'utf8');
ok('공개본에 marks 칸이 없다', () => assert(!/"marks"|"q"|"why"/.test(out)));
ok('공개본에 생각이 없고 끈 문장도 없다', () => assert(!out.includes(THINK) && !out.includes('끈 밑줄이라') && !out.includes('내 생각처럼')));
ok('공개 밑줄은 쪽 순서로 최대 3개, 짧은 문장은 빠진다', () => { const b = JSON.parse(out).books.find((x) => x.id === 'b1'); assert.deepStrictEqual(b.qs.map((x) => x[1]), ['', '5', '30']); assert(b.qs.every((x) => x.length === 2)); });
ok('밑줄만 있는 책에는 공개 문장 칸이 없다', () => assert(!JSON.parse(out).books.some((b) => b.id === 'b2' && b.qs)));
ok('기록 있는 책은 공개본에 남는다', () => assert(JSON.parse(out).books.some((b) => b.id === 'b1')));
ok('공개된 책에 밑줄만 저장해도 공개본에서 빠지지 않는다', () => assert(JSON.parse(out).books.some((b) => b.id === 'b7')));
ok('밑줄만 있는 책은 공개되지 않는다', () => assert(!JSON.parse(out).books.some((b) => b.id === 'b2' || b.id === 'b3')));
ok('레포의 공개본에 marks가 없다', () => assert(!/"marks"|"why"/.test(fs.readFileSync(path.join(REPO, 'data/public.json'), 'utf8'))));

// 2. 볼트 내보내기
console.log('볼트 내보내기');
const vault = path.join(tmp, 'vault'), bookDir = path.join(vault, '4-독서·문화'), outDir = path.join(bookDir, '밑줄');
fs.mkdirSync(bookDir, { recursive:true });
const bookNote = path.join(bookDir, '공개 책.md'), bookText = '---\ntype: 독서\n제목: 공개 책\n---\n효니가 쓴 책 노트\n';
fs.writeFileSync(bookNote, bookText);
fs.writeFileSync(path.join(bookDir, '다른 이름 노트.md'), '---\ntype: 독서\n제목: "보관 메모와 밑줄"\n---\n');
const data = { works:{
  b1:{ t:'공개 책', a:'저자', marks:[{ id:'m9', d:'2026-11-01', p:'300', q:'뒤쪽 문장', why:'' }, { id:'m1', d:'2026-11-07', p:'129–130', q:'앞쪽 문장\n둘째 줄', why:'내 생각 글' }] },
  b3:{ t:'보관 메모와 밑줄', a:'', marks:[{ id:'m3', d:'', p:'', q:'쪽 없는 문장', why:'' }] },
  b4:{ t:'그냥/이름:*?', a:'', marks:[{ id:'m4', d:'', p:'서문', q:'문장', why:'' }] },
  b5:{ t:'지운 책', del:true, marks:[{ id:'m5', q:'안 나감' }] },
  b6:{ t:'밑줄 없는 책', a:'' },
} };
const dataFile = path.join(tmp, 'data.json');
const save = () => fs.writeFileSync(dataFile, JSON.stringify(data));
const exp = (...a) => run([path.join(REPO, 'tools/export-obsidian.js'), dataFile, '--vault', vault, ...a]);
save();
const dry = exp('--dry-run');
ok('--dry-run은 아무것도 쓰지 않는다', () => assert(!fs.existsSync(outDir)));
ok('--dry-run이 새 파일 수를 알려 준다', () => assert(/새파일: 3/.test(dry) && /밑줄있는책: 3/.test(dry)));
ok('출력에 문장·제목이 없다', () => assert(!/앞쪽 문장|공개 책|내 생각 글/.test(dry)));
exp();
const f1 = path.join(outDir, '공개 책.md');
const read = () => fs.readFileSync(f1, 'utf8');
ok('책마다 파일 하나, 지운 책·밑줄 없는 책은 없다', () => assert.deepStrictEqual(fs.readdirSync(outDir).sort(), ['공개 책.md', '그냥 이름.md', '보관 메모와 밑줄.md'].sort()));
ok('머리말 형식', () => { const t = read(); assert(/^---\ntype: 밑줄\n/.test(t)); assert(t.includes('책: "[[4-독서·문화/공개 책|공개 책]]"')); assert(t.includes('낱말: []')); assert(t.includes('밑줄수: 2')); assert(t.includes('마지막밑줄: 2026-11-07')); });
ok('제목이 같은 독서 노트로 이어진다', () => assert(fs.readFileSync(path.join(outDir, '보관 메모와 밑줄.md'), 'utf8').includes('[[4-독서·문화/다른 이름 노트|보관 메모와 밑줄]]')));
ok('문장 칸·블록 ID·내 생각·쪽 순서', () => { const t = read(); assert(t.includes('> [!quote] p.129–130\n> 앞쪽 문장\n> 둘째 줄\n\n^m1\n')); assert(t.includes('**내 생각**\n내 생각 글')); assert(t.indexOf('^m1') < t.indexOf('^m9')); });
ok('쪽이 글자·빈칸일 때', () => { assert(fs.readFileSync(path.join(outDir, '그냥 이름.md'), 'utf8').includes('> [!quote] 서문\n')); assert(fs.readFileSync(path.join(outDir, '보관 메모와 밑줄.md'), 'utf8').includes('> [!quote] 쪽 없음\n')); });
ok('책 노트는 그대로다', () => assert.strictEqual(fs.readFileSync(bookNote, 'utf8'), bookText));
ok('다시 돌려도 바뀌지 않는다', () => { const before = read(); const o = exp(); assert(/고침: 0/.test(o) && /그대로: 3/.test(o)); assert.strictEqual(read(), before); });

console.log('사람이 고친 부분 보존');
// 효니 글: 칸 사이, 머리 아래, 낱말·새 속성. 칸 안 고침 하나
let t = read();
t = t.replace('낱말: []', '낱말:\n  - 슬픔\n  - 기억\n별표: true');
t = t.replace('%%\n\n%%밑줄', '%%\n\n제목 아래에 쓴 글\n\n%%밑줄');
t = t.replace('\n%%/밑줄%%\n', '\n%%/밑줄%%\n\n칸 뒤에 쓴 내 글 [[다른 노트]]\n');
fs.writeFileSync(f1, t.replace(/\n/g, '\r\n')); // 윈도 줄바꿈이 되어도 손댄 것으로 치지 않는다
ok('줄바꿈만 달라도 칸은 손댄 것이 아니다', () => { assert(/손댄칸: 0/.test(exp('--dry-run'))); });
data.works.b1.marks[1].why = '앱에서 고친 생각';
data.works.b1.marks.push({ id:'m7', d:'2026-11-08', p:'200', q:'새 문장', why:'' });
save();
exp();
ok('낱말과 새 속성이 남는다', () => { const x = read(); assert(x.includes('낱말:\n  - 슬픔\n  - 기억')); assert(x.includes('별표: true')); assert(!x.includes('낱말: []')); });
ok('표시 밖의 글이 남는다', () => { const x = read(); assert(x.includes('제목 아래에 쓴 글')); assert(x.includes('칸 뒤에 쓴 내 글 [[다른 노트]]')); });
ok('손대지 않은 칸은 앱 내용으로 바뀌고 새 문장이 쪽 순서로 들어간다', () => { const x = read(); assert(x.includes('앱에서 고친 생각')); assert(x.indexOf('^m1') < x.indexOf('^m7') && x.indexOf('^m7') < x.indexOf('^m9')); assert(x.includes('밑줄수: 3')); });
fs.writeFileSync(f1, read().replace('> 앞쪽 문장', '> 내가 고친 앞쪽 문장'));
data.works.b1.marks[1].q = '앱에서 또 고친 문장';
save();
const r2 = exp();
ok('칸 안을 고치면 덮어쓰지 않고 센다', () => { const x = read(); assert(x.includes('> 내가 고친 앞쪽 문장')); assert(!x.includes('앱에서 또 고친 문장')); assert(/손댄칸: 1/.test(r2)); assert(x.includes('손댄칸: 1')); });
const r3 = exp();
ok('손댄 칸이 있어도 두 번째 실행은 그대로다', () => assert(/고침: 0/.test(r3)));
// 칸 통째로 지우면 앱 내용으로 다시 만든다
fs.writeFileSync(f1, read().replace(/%%밑줄 m1 [0-9a-f]{8}%%[\s\S]*?%%\/밑줄%%\n/, ''));
exp();
ok('칸을 지우면 앱 내용으로 다시 만든다', () => assert(read().includes('> 앱에서 또 고친 문장')));
// 앱에서 지우기
data.works.b1.marks = data.works.b1.marks.filter((m) => m.id !== 'm9');
save(); exp();
ok('앱에서 지운 문장은 손대지 않은 칸이면 빠진다', () => assert(!read().includes('^m9')));
fs.writeFileSync(f1, read().replace(/(\^m7[\s\S]*?%%\/밑줄%%\n)/, '$1\n이 문장에 남긴 글\n'));
data.works.b1.marks = data.works.b1.marks.filter((m) => m.id !== 'm7');
save();
const r4 = exp();
ok('앱에서 지워도 뒤에 글을 쓴 칸은 남긴다', () => { const x = read(); assert(x.includes('^m7') && x.includes('이 문장에 남긴 글')); assert(/앱에없어남긴칸: 1/.test(r4)); });
// 합치기: 밑줄이 다른 책으로 옮겨 가면 옛 파일은 지우지 않는다
const f3 = path.join(outDir, '보관 메모와 밑줄.md');
data.works.b1.marks.push({ id:'m3', d:'', p:'', q:'쪽 없는 문장', why:'', from:['b3'] });
data.works.b3 = { t:'보관 메모와 밑줄', del:true, into:'b1', marks:[] };
save();
const r5 = exp();
ok('합쳐진 책: 문장은 옮겨 가고 옛 파일은 비어서 남는다', () => { assert(read().includes('^m3')); const x = fs.readFileSync(f3, 'utf8'); assert(!x.includes('^m3') && x.includes('밑줄수: 0')); assert(/빈파일: 1/.test(r5)); });
// 제목이 바뀌어도 같은 파일
data.works.b1.t = '바뀐 제목';
save(); exp();
ok('제목이 바뀌어도 파일 이름은 그대로, 머리말만 바뀐다', () => { assert(fs.existsSync(f1)); assert(!fs.existsSync(path.join(outDir, '바뀐 제목.md'))); assert(read().includes('제목: "바뀐 제목"')); assert(/제목 아래에 쓴 글/.test(read())); });
// 효니가 직접 만든 같은 이름 파일은 건드리지 않는다
const mine = path.join(outDir, '내 파일.md'), mineText = '효니가 만든 파일\n';
fs.writeFileSync(mine, mineText);
data.works.b8 = { t:'내 파일', a:'지은이', marks:[{ id:'m8', q:'문장' }] };
save(); exp();
ok('이름이 겹치면 저자를 붙여 따로 만든다', () => { assert.strictEqual(fs.readFileSync(mine, 'utf8'), mineText); assert(fs.existsSync(path.join(outDir, '내 파일 (지은이).md'))); });
// 표시가 깨진 파일은 건드리지 않는다
const f4 = path.join(outDir, '그냥 이름.md');
const broken = fs.readFileSync(f4, 'utf8').replace('%%/밑줄%%', '');
fs.writeFileSync(f4, broken);
const r6 = exp();
ok('표시가 깨진 파일은 건너뛰고 센다', () => { assert.strictEqual(fs.readFileSync(f4, 'utf8'), broken); assert(/건너뜀_형식이상: 1/.test(r6)); });

// 3. 범용판 복원. local.js는 브라우저 모듈이라 .mjs 사본으로 불러온다
(async () => {
  console.log('범용판 백업');
  fs.copyFileSync(path.join(REPO, 'js/local.js'), path.join(tmp, 'local.mjs'));
  const { parseBackup } = await import('file:///' + path.join(tmp, 'local.mjs').replace(/\\/g, '/'));
  const parsed = parseBackup(JSON.stringify({ app:'my-bookshelf', version:1, data:{ works:{
    a:{ t:'책', k:'book', marks:[{ id:'m1', d:'2026-11-07', p:'12', q:'문장', why:'생각', from:['b'], hack:'x' }, { id:'m1', q:'겹친 id' }, { id:'m3', q:'  ' }, { q:'id 없음' }, 'x'] },
    b:{ t:'밑줄 없음', k:'book' },
  } } }));
  const ms = parsed.works.a.marks;
  ok('백업에서 밑줄이 살아난다', () => assert.deepStrictEqual(ms[0], { id:'m1', d:'2026-11-07', p:'12', q:'문장', why:'생각', from:['b'] }));
  ok('빈 문장은 버리고 id는 겹치지 않게 준다', () => { assert.strictEqual(ms.length, 3); assert.strictEqual(new Set(ms.map((m) => m.id)).size, 3); });
  ok('밑줄 없는 책에는 칸을 만들지 않는다', () => assert(!('marks' in parsed.works.b)));
  fs.rmSync(tmp, { recursive:true, force:true });
  console.log(`통과 ${passed}건`);
})().catch((e) => { console.error(e); process.exit(1); });
