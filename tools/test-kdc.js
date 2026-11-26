// 주제 저절로 고르기(js/kdc.js) 시험. 가짜 데이터만 쓴다. 사용: node tools/test-kdc.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const REPO = path.join(__dirname, '..');
(async () => {
  const { kdcTheme, authorTheme, pickTheme, firstAuthorOf, sameBook } = await import(`data:text/javascript;base64,${fs.readFileSync(path.join(REPO, 'js/kdc.js')).toString('base64')}`);
  const app = fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8');
  const THEMES = JSON.parse(app.match(/const THEMES = (\[.*?\]);/)[1].replace(/'/g, '"')).map((x) => x[0]);
  let n = 0;
  const ok = (name, fn) => { fn(); n++; };

  ok('대응표', () => {
    const want = { '813.7':'소설', '813.62':'소설', '811':'시', '814':'에세이', '818':'에세이', '843':'소설', '911':'역사', '981':'역사', '909':'역사',
      '337':'여성', '336.4':'일·노동', '325':'경제·자기계발', '374':'교육', '362':'법', '331':'사회·정치', '182':'심리', '199':'경제·자기계발',
      '160':'철학', '443.1':'과학·환경', '650':'예술', '599':'기타', '701':'인문', '001':'인문', '800':'인문', '230':'인문' };
    for (const [k, t] of Object.entries(want)) assert.strictEqual(kdcTheme(k), t, k);
    assert.strictEqual(kdcTheme('813.7', true), '청소년·그림책');
    assert.strictEqual(kdcTheme(''), '');
    assert.strictEqual(kdcTheme('abc'), '');
  });
  ok('대응표 결과는 모두 앱 주제 목록 안', () => {
    for (let i = 0; i < 1000; i++) { const t = kdcTheme(String(i).padStart(3, '0')); assert(THEMES.includes(t), i + ' ' + t); }
  });
  ok('첫 저자', () => {
    assert.strictEqual(firstAuthorOf('유발 하라리, 조현욱 옮김'), '유발 하라리');
    assert.strictEqual(firstAuthorOf('김초엽 외 3명'), '김초엽');
    assert.strictEqual(firstAuthorOf('한강 지음'), '한강');
    assert.strictEqual(firstAuthorOf(''), '');
  });
  const shelf = [
    { id:'a1', a:'김초엽', th:['소설', 'SF·판타지'] },
    { id:'a2', a:'김초엽 지음', th:['소설'] },
    { id:'a3', a:'김초엽', th:['에세이'] },
    { id:'b1', a:'다른 사람', th:['역사'] },
    { id:'c1', a:'김초엽', th:[] },
  ];
  ok('같은 저자 우선', () => {
    const r = pickTheme({ id:'new', a:'김초엽, 누구 옮김', th:[] }, shelf, '911');
    assert.deepStrictEqual([r.th, r.from, r.why], ['소설', 'author', '같은 저자 책 3권']);
  });
  ok('자기 자신은 세지 않음', () => {
    assert.strictEqual(authorTheme({ id:'b1', a:'다른 사람' }, shelf), null);
  });
  ok('같은 저자 없으면 분류', () => {
    const r = pickTheme({ id:'new', a:'처음 보는 사람', th:[] }, shelf, '911.05');
    assert.deepStrictEqual([r.th, r.from, r.why], ['역사', 'kdc', '도서관 분류 911']);
    assert.strictEqual(pickTheme({ id:'new', a:'처음', th:[] }, shelf, '813.7', true).th, '청소년·그림책');
  });
  ok('이미 주제가 있으면 안 바꿈', () => {
    assert.strictEqual(pickTheme({ id:'x', a:'김초엽', th:['역사'] }, shelf, '813'), null);
  });
  ok('근거가 없으면 비워 둠', () => {
    assert.strictEqual(pickTheme({ id:'x', a:'', th:[] }, shelf, ''), null);
  });
  ok('제목으로 찾은 결과에서 같은 책 고르기(2026-11-26)', () => {
    const rows = [
      { t:'가나다 라마바', a:'홍길동', isbn:'9780000000001', kdc:'' },
      { t:'하루 한 장 내 삶에 새기는 무엇', a:'다른 사람', isbn:'9780000000002' },
      { t:'내 삶에 새기는 무엇', a:'', isbn:'9780000000003' },
      { t:'메리 제인의 모험', a:'호프 자런', isbn:'9780000000004' },
      { t:'분류도 번호도 없음', a:'누구', isbn:'', kdc:'' },
    ];
    assert.strictEqual(sameBook(rows, '가나다라마바', '홍길동 지음').isbn, '9780000000001'); // 띄어쓰기·«지음»
    assert.strictEqual(sameBook(rows, '가나다 라마바', '김철수'), null); // 저자가 다르면 안 받음
    assert.strictEqual(sameBook(rows, '내 삶에 새기는 무엇', '아서').isbn, '9780000000003'); // 같은 제목이 앞, 저자 빈 결과는 받음
    assert.strictEqual(sameBook(rows, '페리 제인의 모험', '호프 자런').isbn, '9780000000004'); // 사진 읽기 오타 한 글자
    assert.strictEqual(sameBook(rows, '페리 제인의 모험', ''), null); // 저자를 모르면 오타 짝은 안 받음
    assert.strictEqual(sameBook(rows, '분류도 번호도 없음', '누구'), null); // 쓸모없는 결과는 뺌
    assert.strictEqual(sameBook([], '아무 책', ''), null);
    assert.strictEqual(sameBook(rows, '가', ''), null);
  });
  console.log(`test-kdc 통과 ${n}개`);
})().catch((e) => { console.error(e); process.exit(1); });
