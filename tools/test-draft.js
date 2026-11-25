// 초안 요청 도구 시험(2026-11-25, 가짜 데이터): 기다림/다 씀 판정, 합쳐서 빠진 책 따라가기, 폴더 이름, 재료 파일 덮어쓰지 않기, 출력에 기록 내용이 안 나오기
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const T = require('./draft-requests.js');

const priv = {
  works: {
    a1: { t: '가짜 책: 부제?', a: '가짜 저자', p: '가짜출판', k: 'book', known: true,
      recs: [{ d: '2026-11-20', r: 4.5, l: '비밀한줄평XYZ', b: '비밀본문QWE' }, { d: '2026-11-21', l: '' }],
      marks: [{ id: 'm2', p: '30', q: '두 번째 밑줄 문장입니다' }, { id: 'm1', p: '5', q: '첫 번째 밑줄 문장입니다', why: '비밀생각' }],
      notes: [{ d: '2026-11-01', b: '비밀메모' }] },
    old: { t: '가짜 책', del: true, into: 'a1' },
    b2: { t: '다른 책', recs: [{ d: '2026-10-01', l: '좋다' }] },
    gone: { t: '뺀 책', del: true, recs: [{ l: '뺌' }] },
  },
  meta: { toDraft: {
    old: { t: '가짜 책', a: '가짜 저자', at: '2026-11-22', to: ['blog', 'insta'], memo: '도서 제공' },
    gone: { t: '뺀 책', at: '2026-11-21', to: ['blog'] },
    b2: { t: '다른 책', at: '2026-11-23', to: ['insta'], done: { at: '2026-11-24', dir: '다른 책' } },
  } },
};

// 판정
let rs = T.requests(priv, {});
assert.strictEqual(rs.length, 3);
assert.strictEqual(rs.find((r) => r.key === 'gone').w, null, '책장에서 뺀 책은 재료 없음');
const r1 = rs.find((r) => r.key === 'old');
assert.strictEqual(r1.id, 'a1', '합쳐서 빠진 책의 요청은 남긴 책으로');
assert.strictEqual(r1.done, null);
assert.ok(rs.find((r) => r.key === 'b2').done, 'Firebase done이면 다 씀');
// 이 PC 기록: 같은 요청 날짜면 다 씀, 새로 요청(날짜가 다름)하면 다시 기다림
assert.ok(T.requests(priv, { old: { at: '2026-11-22', doneAt: '2026-11-25', dir: 'x' } }).find((r) => r.key === 'old').done);
assert.strictEqual(T.requests(priv, { old: { at: '2026-11-01', doneAt: '2026-11-02', dir: 'x' } }).find((r) => r.key === 'old').done, null);
// 폴더 이름
assert.strictEqual(T.folderName('가짜 책: 부제?'), '가짜 책 부제');
assert.strictEqual(T.folderName('a/b\\c*'), 'a b c');
assert.strictEqual(T.folderName(''), '제목 없음');
// 재료: 빈 기록은 빼고 밑줄은 쪽 순서
const s = T.stuffOf(priv, r1);
assert.strictEqual(s.recs.length, 1);
assert.deepStrictEqual(s.marks.map((m) => m.id), ['m1', 'm2']);
const text = T.materialText(r1, s);
assert.ok(text.includes('비밀본문QWE') && text.includes('(5쪽)') && text.includes('도서 제공'));
assert.ok(text.indexOf('m1') < 0 && text.indexOf('첫 번째') < text.indexOf('두 번째'));

// CLI: 목록 출력에 기록 내용이 안 나오고, --make는 덮어쓰지 않는다
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'draft-test-'));
const file = path.join(tmp, 'priv.json'), out = path.join(tmp, 'out'), rec = path.join(tmp, 'rec.json');
fs.writeFileSync(file, JSON.stringify(priv));
const run = (...a) => execFileSync(process.execPath, [path.join(__dirname, 'draft-requests.js'), '--file', file, '--out', out, '--record', rec, ...a], { encoding: 'utf8' });
const list = run();
assert.ok(/기다림 2개/.test(list), list);
assert.ok(!/비밀/.test(list), '목록에 기록 내용이 나오면 안 됨');
run('--make'); run('--make');
const made = fs.readdirSync(path.join(out, '가짜 책 부제')).sort();
assert.deepStrictEqual(made.filter((f) => f.startsWith('재료-')).length, 2, '두 번째는 -2로');
assert.ok(made.some((f) => /-2\.md$/.test(f)));
assert.ok(/초안 0개|폴더 있음/.test(run()));
// 다 씀 기록(이 PC만) → 다음 목록에서 빠짐
const d = run('--done', 'a1');
assert.ok(!/비밀/.test(d));
assert.strictEqual(JSON.parse(fs.readFileSync(rec, 'utf8')).old.at, '2026-11-22');
assert.ok(/기다림 1개/.test(run()));
fs.rmSync(tmp, { recursive: true, force: true });
console.log('초안 요청 시험 통과');
