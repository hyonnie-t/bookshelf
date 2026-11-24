// 사진 읽기 계산(js/photo.js) 시험. 가짜 데이터·공개된 책 제목만 쓴다. 사용: node tools/test-photo.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const REPO = path.join(__dirname, '..');
(async () => {
  const P = await import(`data:text/javascript;base64,${fs.readFileSync(path.join(REPO, 'js/photo.js')).toString('base64')}`);
  let n = 0;
  const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.error('실패:', name); throw e; } };

  ok('ISBN 검사 숫자', () => {
    assert.ok(P.isbnOk('9788936434120'));
    assert.ok(!P.isbnOk('9788936434121'), '끝자리가 틀리면 거른다');
    assert.ok(!P.isbnOk('8936434128'), '10자리는 받지 않는다');
    assert.ok(!P.isbnOk('97889364341200'));
  });
  ok('찾는 말이 ISBN', () => {
    assert.strictEqual(P.isbnQuery('978-89-364-3412-0'), '9788936434120');
    assert.strictEqual(P.isbnQuery(' 9788936434120 '), '9788936434120');
    assert.strictEqual(P.isbnQuery('소년이 온다'), '');
    assert.strictEqual(P.isbnQuery('1234567890123'), '');
  });
  ok('같은 ISBN', () => {
    assert.ok(P.sameIsbn({ isbn:'8936434128 9788936434120' }, '9788936434120'), '카카오 «10자리 13자리»');
    assert.ok(!P.sameIsbn({ isbn:'' }, '9788936434120'));
    assert.ok(!P.sameIsbn({}, ''));
  });
  ok('읽은 책을 줄에 더하기', () => {
    const books = [{ t:'텅빈 마음 가진 채로', a:'김화진' }, { t:'수치심 탐구 생활', a:'' }, { t:'코스모스', a:'칼 세이건' }, { t:'  ', a:'x' }];
    const r = P.mergeLines(['텅 빈 마음 가진 채로', '수치심 탐구 생활 / 사월날씨'], books, new Set(['코스모스']));
    assert.deepStrictEqual(r.lines, ['텅 빈 마음 가진 채로 / 김화진', '수치심 탐구 생활 / 사월날씨']);
    assert.deepStrictEqual([r.added, r.filled, r.already], [0, 1, 1], '띄어쓰기만 다른 제목은 같은 줄, 서재에 있는 책은 셈만');
    const r2 = P.mergeLines([], [{ t:'이방인', a:'알베르 카뮈' }, { t:'이방인', a:'' }]);
    assert.deepStrictEqual(r2.lines, ['이방인 / 알베르 카뮈'], '같은 사진에 두 번 나와도 한 줄');
  });
  ok('빌린 곳·반납일', () => {
    assert.deepStrictEqual(P.loanGuess([{ lib:'구로도서관', due:'2026-12-14' }, { lib:'구로도서관', due:'2026-12-14' }, { lib:'', due:'2026-12-01' }]), { who:'구로도서관', due:'2026-12-14', mixed:true });
    assert.deepStrictEqual(P.loanGuess([{ t:'a' }]), { who:'', due:'', mixed:false });
    assert.deepStrictEqual(P.loanGuess([]), { who:'', due:'', mixed:false });
  });
  ok('줄인 크기', () => {
    assert.deepStrictEqual(P.fitSize(1170, 2532), { w:739, h:1600 });
    assert.deepStrictEqual(P.fitSize(800, 600), { w:800, h:600 }, '작은 사진은 키우지 않는다');
  });
  ok('오류 말', () => {
    assert.ok(P.seeError('limit').includes('내일'));
    assert.ok(P.seeError('???').includes('다시'));
  });
  console.log(`사진 읽기 시험 ${n}개 통과`);
})().catch((e) => { console.error(e.message); process.exit(1); });
