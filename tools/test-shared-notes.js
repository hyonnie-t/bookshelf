// 글 하나씩 공개 시험(2026-11-09): publish.js가 pub:true인 메모·기록만 books[].ms로 옮기는지. 가짜 데이터만 쓴다.
// 사용: node tools/test-shared-notes.js
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), { execFileSync } = require('child_process');
const REPO = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-'));
const HIDE = '숨길글ZQX', STAR = '별점칸ZQX';
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  통과', name); };
fs.mkdirSync(path.join(tmp, 'tools'), { recursive:true });
fs.mkdirSync(path.join(tmp, 'data'));
fs.copyFileSync(path.join(REPO, 'tools/publish.js'), path.join(tmp, 'tools/publish.js'));
fs.writeFileSync(path.join(tmp, 'data/blog.json'), '{"posts":[]}');
fs.writeFileSync(path.join(tmp, 'data/public.json'), JSON.stringify({ at:'2026-01-01', books:[{ id:'b1', t:'공개 책', a:'저자', k:'book', th:[], y:'2026', fd:'2026-01-01' }], posts:[] }));
const long = '길'.repeat(1001);
const priv = { works:{
  b1:{ t:'공개 책', a:'저자', k:'book', known:true, th:[], y:'2026', fd:'2026-01-01',
    notes:[{ d:'2026-03-02', b:'공개한 메모 하나', pub:true }, { d:'2026-03-01', b:HIDE }, { d:'메모앱 날짜', l:'날짜 모양이 다른 공개 메모', pub:true }, { d:'2026-03-03', b:long, pub:true }],
    recs:[{ d:'2026-01-01', r:4.5, l:STAR, b:'공개한 기록 본문', pub:true }, { d:'2026-02-01', r:2, b:HIDE }] },
  b2:{ t:'공개 안 된 책', a:'저자', k:'book', known:true, th:[], notes:[{ d:'2026-03-02', b:'책이 공개가 아니면 안 올라가는 메모', pub:true }] },
  b3:{ t:'나만 보기 책', a:'저자', k:'book', known:true, th:[], only:true, y:'2026', recs:[{ d:'2026-01-01', b:'나만 보기 책의 공개 기록', pub:true }] },
} };
fs.writeFileSync(path.join(tmp, 'priv.json'), JSON.stringify(priv));
execFileSync(process.execPath, [path.join(tmp, 'tools/publish.js'), path.join(tmp, 'priv.json')], { cwd:tmp, encoding:'utf8' });
const out = fs.readFileSync(path.join(tmp, 'data/public.json'), 'utf8');
const pub = JSON.parse(out);
const b1 = pub.books.find((b) => b.id === 'b1');
ok('공개한 글만 ms로 올라가고 날짜순이다', () => assert.deepStrictEqual(b1.ms, [['공개한 기록 본문', '2026-01-01'], ['공개한 메모 하나', '2026-03-02'], ['날짜 모양이 다른 공개 메모', '']]));
ok('나만 보기 글·별점·한 줄 평·1000자 넘는 글은 안 올라간다', () => { assert(!out.includes(HIDE) && !out.includes(STAR) && !out.includes(long)); });
ok('공개 안 된 책·나만 보기 책은 글이 있어도 공개본에 없다', () => assert(!pub.books.some((b) => b.id === 'b2' || b.id === 'b3')));
ok('공개본에 notes·recs 칸이 없다', () => assert(!/"notes"|"recs"|"pub"/.test(out)));
console.log(`\n${passed}개 통과`);
fs.rmSync(tmp, { recursive:true, force:true });
