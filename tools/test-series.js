// 시리즈 묶어 보여 주기 판정(js/series.js) 시험. 가짜 데이터·공개된 책 제목 모양만 쓴다. 사용: node tools/test-series.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const REPO = path.join(__dirname, '..');
(async () => {
  const S = await import(`data:text/javascript;base64,${fs.readFileSync(path.join(REPO, 'js/series.js')).toString('base64')}`);
  const M = await import(`data:text/javascript;base64,${fs.readFileSync(path.join(REPO, 'js/merge.js')).toString('base64')}`);
  let n = 0;
  const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.error('실패:', name); throw e; } };
  const K = (t) => { const x = S.seriesKey(t); return x && [x.head, x.vol]; };

  ok('권 표시 떼기', () => {
    assert.deepStrictEqual(K('토지 1'), ['토지', 1]);
    assert.deepStrictEqual(K('토지 1부 4권'), ['토지', 4], '권 표시를 끝에서 되풀이해 뗀다');
    assert.deepStrictEqual(K('35년 1: 1921-1925 의열투쟁, 무장투쟁, 대중투쟁'), ['35년', 1]);
    assert.deepStrictEqual(K('빌레뜨 2'), ['빌레뜨', 2]);
    assert.deepStrictEqual(K('아리랑 제3권'), ['아리랑', 3]);
    assert.deepStrictEqual(K('삼국지 (2)'), ['삼국지', 2]);
    assert.deepStrictEqual(K('난중일기 상'), ['난중일기', 1]);
    assert.deepStrictEqual(K('난중일기 하권'), ['난중일기', 3]);
  });
  ok('여러 권이 한 칸인 책·권 표시 없는 책은 시리즈 판정에서 뺀다', () => {
    for (const t of ['헨치 1,2', '레슨 인 케미스트리(1)(2)', '비밀 1-12권', '태백산맥 전10권', '1984', '토지', '작별하지 않는다']) assert.strictEqual(S.seriesKey(t), null, t);
  });
  const W = (id, t, x = {}) => ({ id, t, k:'book', a:'', known:true, ...x });
  ok('2권 이상만 시리즈, 권 순서', () => {
    const g = S.seriesGroups([W('a', '토지 3', { a:'박경리' }), W('b', '토지 1', { a:'박경리' }), W('c', '토지 1부 4권', { a:'박경리' }), W('d', '작별하지 않는다')]);
    assert.strictEqual(g.length, 1);
    assert.deepStrictEqual(g[0].ids, ['b', 'a', 'c']); assert.strictEqual(g[0].name, '토지');
  });
  ok('짝 없는 끝 숫자·상중하 낱권은 시리즈가 아니다', () => {
    const g = S.seriesGroups([W('a', '프란시스 하', { k:'film' }), W('b', '응답하라 1997', { k:'film' }), W('c', '고고70', { k:'film' }), W('d', '타임슬립 1919'), W('e', '소설 보다 봄 2020')]);
    assert.strictEqual(g.length, 0);
  });
  ok('종류가 다르면 안 묶임(미키7 책 · 미키 17 영화)', () => {
    assert.strictEqual(S.seriesGroups([W('a', '미키7'), W('b', '미키 17', { k:'film' })]).length, 0);
  });
  ok('영화 시리즈(쿵푸팬더 2·3, 시즌)도 묶임', () => {
    const g = S.seriesGroups([W('a', '쿵푸팬더 2', { k:'film' }), W('b', '쿵푸팬더 3', { k:'film' }), W('c', '굿 플레이스 시즌 1', { k:'film' }), W('d', '굿 플레이스 시즌 2', { k:'film' })]);
    assert.strictEqual(g.length, 2);
  });
  ok('첫 저자가 다르면 나눈다, 저자 없는 권은 붙는다', () => {
    const g = S.seriesGroups([W('a', '정의 1', { a:'갑' }), W('b', '정의 2', { a:'을' }), W('c', '정의 3', { a:'갑' }), W('d', '정의 4')]);
    assert.strictEqual(g.length, 1); assert.deepStrictEqual(g[0].ids, ['a', 'c', 'd']);
  });
  ok('손으로: ser 글자는 그 이름으로 묶고, false는 빼고, 지운 칸·미확인 칸은 빼기', () => {
    const g = S.seriesGroups([W('a', '토지 1'), W('b', '토지 2', { ser:false }), W('c', '부제만 있는 권', { ser:'토지' }), W('d', '토지 3', { del:true }), W('e', '토지 4', { known:false })]);
    assert.strictEqual(g.length, 1); assert.deepStrictEqual(g[0].ids.sort(), ['a', 'c']);
  });
  ok('같은 달 선반에서 붙여 꽂기', () => {
    const g = S.seriesGroups([W('a', '토지 1'), W('b', '토지 2'), W('c', '토지 3')]);
    const idx = S.seriesIndex(g);
    const out = S.keepTogether([W('b', '토지 2'), W('x', '다른 책'), W('a', '토지 1')], idx).map((w) => w.id);
    assert.deepStrictEqual(out, ['a', 'b', 'x'], '첫 권 자리에 권 순서로');
  });
  ok('합치기 후보: 같은 시리즈의 다른 권은 seriesPair가 아니다(겹치는 책 고치기에 안 나옴)', () => {
    assert(!M.seriesPair('토지 1', '토지 2'));
    assert(M.seriesPair('토지', '토지 4'), '시리즈 전체 칸 ↔ 한 권은 지금대로');
  });
  const app = fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8');
  ok('앱 연결', () => {
    assert(/from '\.\/series\.js'/.test(app));
    for (const [f, p] of [['sw.js', "'js/series.js'"], ['my/sw.js', "'../js/series.js'"]]) assert(fs.readFileSync(path.join(REPO, f), 'utf8').includes(p), f);
    assert(fs.readFileSync(path.join(REPO, 'tools/publish.js'), 'utf8').includes('o.ser'), '공개 반영이 ser을 옮김');
    assert(/w\.ser === false \|\| typeof w\.ser === 'string'|ser/.test(fs.readFileSync(path.join(REPO, 'js/local.js'), 'utf8')), '범용판 거르기가 ser을 남김');
  });
  console.log(`test-series 통과 ${n}개`);
})().catch((e) => { console.error(e); process.exit(1); });
