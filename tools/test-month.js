// 이달의 돌아보기(js/month.js) 시험. 가짜 데이터만 쓴다. 사용: node tools/test-month.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const REPO = path.join(__dirname, '..');
const load = (f) => import(`data:text/javascript;base64,${fs.readFileSync(path.join(REPO, f)).toString('base64')}`);
(async () => {
  const M = await load('js/month.js');
  const S = await load('js/series.js');
  const K = await load('js/kdc.js');
  let n = 0;
  const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.error('실패:', name); throw e; } };
  const W = (id, o) => ({ id, k:'book', known:true, t:id, a:'', th:[], recs:[], notes:[], marks:[], ...o });
  const works = [
    W('a', { t:'가', th:['역사'], recs:[{ d:'2026-10-03', r:4.5 }], marks:[{ d:'2026-10-02', q:'열두 글자가 넘는 밑줄 문장입니다', p:'12' }] }),
    W('b', { t:'나', th:['역사'], recs:[{ d:'2026-10-04', r:4 }, { d:'2024-01-01', r:3 }] }),
    W('c', { t:'다', th:['소설'], recs:[{ d:'2026-10-05', r:5 }] }),
    W('d', { t:'라', th:['소설'], recs:[{ d:'2026-09-10', r:3 }] }),
    W('e', { t:'마', recs:[{ d:'2026-10-20', st:'unread' }] }), // 읽는 중
    W('f', { t:'바', known:false, recs:[{ d:'2026-10-07', r:1 }] }), // 제목 미확인: 다 읽은 권수에서 빠짐
    W('g', { t:'사', k:'film', recs:[{ d:'2026-10-08', r:4 }] }), // 영화는 안 셈
    W('h', { t:'아', notes:[{ d:'2026-10-06', b:'메모' }], recs:[{ d:'2026', r:3 }] }), // 연도만 있는 날짜는 안 셈
  ];
  const known = (w) => w.known !== false;
  const cur = M.monthStats(works, '2026-10', { known, thick:(w) => (w.id === 'a' ? 20 : 0) });
  const prev = M.monthStats(works, '2026-09', { known });

  { // 읽다 만 책은 앱의 읽기 상태 판정(js/reading.js isReading)을 따른다
    const R = await load('js/reading.js');
    const xs = [
      W('d1', { t:'다 읽음만 누름', st:'done', marks:[{ d:'2026-11-02', q:'열두 글자가 넘는 밑줄 문장입니다' }] }),
      W('n1', { t:'안 읽음', st:'not', notes:[{ d:'2026-11-03', b:'필사' }] }),
      W('r1', { t:'읽는 중', recs:[{ d:'2026-11-04', st:'unread' }] }),
    ];
    ok('읽다 만 책 판정', () => assert.deepStrictEqual(M.monthStats(xs, '2026-11', { known, reading:R.isReading }).reading.map((w) => w.id), ['r1']));
  }
  ok('달 계산', () => {
    assert.strictEqual(M.prevMonth('2026-01'), '2025-12');
    assert.strictEqual(M.nextMonth('2026-12'), '2027-01');
    assert.strictEqual(M.daysIn('2028-02'), 29);
    assert.deepStrictEqual(M.activeMonths(works), ['2024-01', '2026-09', '2026-10']);
  });
  ok('한 달 숫자', () => {
    assert.deepStrictEqual(cur.done.map((x) => x.w.id), ['a', 'b', 'c'], '제목 미확인·영화·읽는 중은 빠지고 날짜순');
    assert.strictEqual(cur.dayN, 7, '기록·메모·밑줄 날짜(2,3,4,5,6,7,20일, 영화 8일 빼고)');
    assert.strictEqual(cur.run, 6, '2~7일 이어짐');
    assert.strictEqual(cur.marks, 1);
    assert.strictEqual(cur.notes, 1);
    assert.strictEqual(cur.mm, 20); assert.strictEqual(cur.measured, 1);
    assert.deepStrictEqual(cur.again.map((x) => x.w.id), ['b'], '전에도 다 읽은 책');
    assert.deepStrictEqual(cur.reading.map((w) => w.id), ['e']);
    assert.strictEqual(cur.themes[0][0], '역사');
    assert.strictEqual(cur.avg, 4.5);
    assert.strictEqual(prev.doneN, 1);
  });
  ok('효니 말투 한 달 평', () => {
    const v = M.monthVoice(cur, prev, { avgAll:3.6, ratedAll:20, themeVoice:{ 역사:['퇴근해도 옛날로 돌아가는 사람'] }, title:(w) => w.t });
    assert.ok(v.name, '칭호');
    assert.ok(v.change.some((t) => t.includes('9월보다 2권 더 읽었다(1권 → 3권)')), v.change.join('|'));
    assert.ok(v.change.some((t) => t.includes('소설 책이 제일 많았는데') === false), '지난달 1권이면 주제 비교를 안 한다');
    assert.ok(v.habit.some((t) => t.includes('6일은 하루도 안 빼고')), v.habit.join('|'));
    assert.ok(v.habit.some((t) => t.includes('평소보다 후했다(평소 3.6점 → 4.5점)')));
    assert.ok(v.next.includes('«마»'));
    assert.strictEqual(v.quote.w.id, 'a');
    const all = [v.name, ...v.change, ...v.habit, v.next].join('\n');
    assert.ok(!/것 같다|—|라는 것\.|정리하면|핵심은/.test(all), 'AI 티 표현 없음');
    // 별점 차이 0.3 경계(4.5 - 4.2는 소수로 0.2999…)
    assert.ok(M.monthVoice(cur, prev, { avgAll:4.2, ratedAll:20, title:(w) => w.t }).habit.some((t) => t.includes('평소 4.2점 → 4.5점')), '경계 0.3도 말한다');
    assert.ok(!M.monthVoice(cur, prev, { avgAll:4.3, ratedAll:20, title:(w) => w.t }).habit.some((t) => t.includes('평소')), '0.2 차이는 말하지 않는다');
    // 같은 달은 늘 같은 문장
    assert.deepStrictEqual(M.monthVoice(cur, prev, { avgAll:3.6, ratedAll:20, title:(w) => w.t }).change, M.monthVoice(cur, prev, { avgAll:3.6, ratedAll:20, title:(w) => w.t }).change);
    // 기록 없는 달
    const empty = M.monthVoice(M.monthStats(works, '2026-05', { known }), prev, {});
    assert.strictEqual(empty.name, '책을 잠깐 쉬어 간 사람');
    assert.ok(empty.change[0].includes('다 읽은 책이 없다'));
  });
  ok('서재에서 고른 다음 책', () => {
    const read = [
      W('t1', { t:'토지 1', a:'박경리', th:['소설'], recs:[{ d:'2026-05-01', r:5 }] }),
      W('t2', { t:'토지 2', a:'박경리', th:['소설'], recs:[{ d:'2026-06-01', r:4.5 }] }),
      W('h1', { t:'역사책', a:'홍길동', th:['역사'], recs:[{ d:'2026-07-01', r:3 }] }),
      W('h2', { t:'역사책2', a:'김아무', th:['역사'], recs:[{ d:'2026-08-01', r:3 }] }),
      W('r1', { t:'읽다 멈춤', a:'최아무', th:['과학·환경'], recs:[{ d:'2026-08-01', st:'unread' }] }),
    ];
    const lib = [
      { id:'L1', t:'토지 3', a:'박경리', th:['소설'], st:'own', added:'2024-03-01' },
      { id:'L2', t:'다른 역사', a:'이아무', th:['역사'], st:'own' },
      { id:'L3', t:'관계없음', a:'누구', th:['요리'], st:'own' },
      { id:'L4', t:'토지 4', a:'박경리', th:['소설'], st:'in' }, // 빌려 온 책은 안 고름
      { id:'L5', t:'토지 1', a:'박경리', th:['소설'], st:'own', w:'t1' }, // 이미 읽은 책
      { id:'L6', t:'읽다 멈춤', a:'최아무', th:['과학·환경'], st:'own', w:'r1' },
    ];
    const done = (w) => (w.recs || []).some((r) => r.st !== 'unread');
    const got = M.nextBooks(lib, read, { firstAuthor:K.firstAuthorOf, seriesKey:S.seriesKey, done, work:(id) => read.find((w) => w.id === id), since:'2025-11-16', today:'2026-11-16' });
    assert.deepStrictEqual(got.map((x) => x.it.id), ['L1', 'L2', 'L6'], got.map((x) => x.it.id + ':' + x.why.join('/')).join(' '));
    assert.ok(got[0].why[0].includes('«토지» 2권까지 읽었다'));
    assert.ok(got[0].why[1].includes('평균 4.8점'), got[0].why.join('|'));
    assert.ok(got[1].why[0].includes('요즘 자주 읽는 역사'));
  });
  console.log(`통과 ${n}개`);
})().catch((e) => { console.error(e); process.exit(1); });
