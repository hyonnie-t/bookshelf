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
    assert.ok(!/ㅎㅎ|\(\?\)|\.\.\./.test(all), 'ㅎㅎ·(?)·말줄임 흉내 없음(2026-11-17 효니 쪽지)');
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
  ok('그달 내 물음표', () => {
    assert.deepStrictEqual(M.questionsIn('첫 문장이다. 이 사람은 왜 끝까지 버텼을까? 잘 모르겠다(?)\n📌 다음엔 뭘 읽지??\n#해시태그?\n짧다?'), ['이 사람은 왜 끝까지 버텼을까?', '다음엔 뭘 읽지??']);
    assert.deepStrictEqual(M.questionsIn('"정말 그게 최선이었을까?" 그래서 다시 읽었다.'), ['"정말 그게 최선이었을까?"'], '닫는 따옴표 뒤에서 자른다');
    const qs = [
      W('q1', { t:'물음 책', notes:[{ d:'2026-10-03', b:'메모다. 나라면 그때 떠날 수 있었을까?' }, { d:'2026-09-03', b:'지난달 물음은 아닐까?' }],
        marks:[{ d:'2026-10-04', q:'책 문장은 넣지 않는 걸까?', why:'이 말이 왜 계속 남을까?' }],
        recs:[{ d:'2026-10-05', r:4, b:'다 읽었다. 결국 누구의 이야기였을까?' }] }),
      W('q2', { t:'미확인', known:false, notes:[{ d:'2026-10-06', b:'제목 모르는 책의 물음일까?' }] }),
      W('q3', { t:'영화', k:'film', notes:[{ d:'2026-10-06', b:'영화 메모의 물음일까?' }] }),
    ];
    const got = M.monthQuestions(qs, '2026-10', { known });
    assert.deepStrictEqual(got.map((x) => x.q).sort(), ['결국 누구의 이야기였을까?', '나라면 그때 떠날 수 있었을까?', '이 말이 왜 계속 남을까?'].sort(), '책 문장(q)·지난달·미확인·영화는 빠진다');
    assert.deepStrictEqual(got.map((x) => x.src).sort(), ['mark', 'note', 'rec']);
    assert.deepStrictEqual(M.monthQuestions(qs, '2026-10', { known }).map((x) => x.q), got.map((x) => x.q), '달마다 같은 순서');
    assert.deepStrictEqual(M.monthQuestions(qs, '2026-11', { known }), []);
  });
  ok('연말 결산', () => {
    const ys = [
      W('y1', { t:'가책', a:'김작가', th:['역사'], recs:[{ d:'2026-01-05', r:5 }] }),
      W('y2', { t:'나책', a:'김작가', th:['역사'], recs:[{ d:'2026-01-20', r:5 }], only:true }),
      W('y3', { t:'다책', a:'이작가', th:['소설'], recs:[{ d:'2026-03-01', r:4 }], marks:[{ d:'2026-03-02', q:'밑줄' }, { d:'2025-03-02', q:'지난해' }] }),
      W('y4', { t:'라책', a:'김작가', th:['역사', '여성'], recs:[{ d:'2026', r:3 }] }),
    ];
    const re = W('r9', { t:'다시책', a:'박작가', th:['소설'], recs:[{ d:'2022-05-01', r:4 }, { d:'2026-07-01', r:5 }] });
    const re2 = W('r8', { t:'숨긴다시책', only:true, recs:[{ d:'2020', r:4 }, { d:'2026-08-01' }] });
    const only = (w) => !!w.only;
    const cur = M.yearStats(ys, [...ys, re, re2], '2026', { firstAuthor:K.firstAuthorOf, only, thick:(w) => (w.id === 'y1' ? 20 : 0) });
    assert.strictEqual(cur.doneN, 4);
    assert.strictEqual(cur.best, 5);
    assert.deepStrictEqual(cur.top.map((w) => w.id), ['y1', 'y2']);
    assert.deepStrictEqual(cur.shownTop.map((w) => w.id), ['y1'], '나만 보기는 제목 목록에서 빠진다');
    assert.deepStrictEqual(cur.authors, [['김작가', 3]]);
    assert.deepStrictEqual(cur.themes[0], ['역사', 3]);
    assert.deepStrictEqual(cur.again.map((w) => w.id), ['r9', 'r8'], '다시 편 책(연도만 적힌 기록도, 제목순)');
    assert.deepStrictEqual(cur.shownAgain.map((w) => w.id), ['r9']);
    assert.strictEqual(cur.marks, 1);
    assert.deepStrictEqual(cur.bestM, ['01', 2]);
    assert.strictEqual(cur.mm, 20);
    const prev = M.yearStats([ys[0]], ys, '2025', {});
    const v = M.yearVoice(cur, prev, { title:(w) => w.t });
    assert.strictEqual(v.big, '완독한 책 4권 👏');
    const all = [v.head, v.big, ...v.items.map((x) => x.join(' ')), ...v.more].join('\n');
    assert.ok(!all.includes('나책') && !all.includes('숨긴다시책'), '나만 보기 제목 없음');
    assert.ok(all.includes('«가책»') && all.includes('김작가 작가님 책을 3권이나') && all.includes('«다시책» 말고도 1권 더'), all);
    assert.ok(all.includes('2025년보다 3권 더') && all.includes('1월에 제일 많이 읽었어요(2권). 방학 때'), all);
    assert.ok(!/것 같다|것 같아요|—|라는 것\.|정리하면|핵심은/.test(all), 'AI 티 표현 없음');
    assert.ok(!/ㅎㅎ|\(\?\)|\.\.\.|더라구요/.test(all), 'ㅎㅎ·(?)·말줄임 흉내 없음(2026-11-17 효니 쪽지)');
    assert.ok(/요|습니다/.test(v.items[0][1]), '존댓말');
    // 아직 안 끝난 해: 지난해보다 적어도 «덜 읽었다»고 하지 않는다
    const big = M.yearStats(ys.concat(ys.map((w) => ({ ...w, id:w.id + 'x' }))), ys, '2025', {});
    assert.ok(M.yearVoice(cur, big, { ongoing:true }).more[0].includes('2025년엔 8권이었어요'), '진행 중인 해');
    assert.ok(M.yearVoice(cur, prev, { ongoing:true }).more[0].includes('벌써 2025년보다 3권 더'));
    assert.strictEqual(M.yearVoice(M.yearStats([], [], '2027', {}), null, {}).big, '완독한 책은 아직 없어요');
    // 제목 미확인 책은 다시 편 책에서 빠지고, 낮은 별점뿐이면 «가장 높게 준 책» 줄을 안 쓴다
    const unk = W('u1', { t:'모름', known:false, recs:[{ d:'2024-01-01' }, { d:'2026-02-01' }] });
    assert.ok(!M.yearStats(ys, [...ys, unk], '2026', {}).again.some((w) => w.id === 'u1'));
    const low = M.yearStats([W('l1', { t:'낮음', recs:[{ d:'2026-02-01', r:1.5 }] })], [], '2026', {});
    assert.ok(!M.yearVoice(low, null, {}).items.some(([l]) => l === '가장 높게 준 책'));
    assert.deepStrictEqual(M.questionsIn('자료는 https://a.com/x? 보세요'), []);
  });
  ok('앱 성향 문장에도 ㅎㅎ·(?)·말줄임·농담 맺음이 없다(2026-11-17 효니 쪽지)', () => {
    const app = fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8');
    const a = app.indexOf('const THEME_VOICE'), b = app.indexOf('const mon = ', a);
    assert.ok(a > 0 && b > a, 'readerVoice 자리');
    const body = app.slice(a, b).split('\n').filter((l) => !/^\s*(\/\/|\/\*)/.test(l)).join('\n');
    assert.ok(!/ㅎㅎ|\(\?\)|\.\.\.[`']|바빴다고|더라구요/.test(body), body.match(/.{0,30}(ㅎㅎ|\(\?\)|\.\.\.[`']|바빴다고|더라구요)/)?.[0]);
  });
  console.log(`통과 ${n}개`);
})().catch((e) => { console.error(e); process.exit(1); });
