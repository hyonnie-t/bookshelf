// 다음 달 독서 목표(js/goals.js) 시험. 가짜 데이터만 쓴다. 사용: node tools/test-goals.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const REPO = path.join(__dirname, '..');
const load = (f) => import(`data:text/javascript;base64,${fs.readFileSync(path.join(REPO, f)).toString('base64')}`);
(async () => {
  const G = await load('js/goals.js');
  let n = 0;
  const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.error('실패:', name); throw e; } };
  const W = (id, o) => ({ id, k:'book', known:true, t:id, a:'', th:[], recs:[], notes:[], marks:[], ...o });
  const works = [
    W('a', { a:'김작가', th:['소설'], recs:[{ d:'2026-10-03', r:4 }] }),
    W('b', { a:'김작가', th:['소설'], recs:[{ d:'2026-09-04', r:4 }] }),
    W('c', { a:'이작가', th:['SF·판타지'], recs:[{ d:'2026-11-05', r:5 }] }),
    W('d', { a:'박작가', th:['역사'], recs:[{ d:'2024-03-10', r:3 }] }),
    W('e', { a:'박작가', th:['역사'], recs:[{ d:'2024-02-10', r:3 }] }),
    W('f', { a:'최작가', th:['역사', '여성'], recs:[{ d:'2023-06-10', r:4.5 }] }),
    W('g', { a:'정작가', th:['철학'], recs:[{ d:'2026-08-20', st:'unread' }] }), // 읽는 중, 석 달 넘게 멈춤
    W('h', { a:'한작가', th:['과학·환경'], recs:[{ d:'2026-12-03', r:4 }, { d:'2026-10-01', st:'unread' }], marks:[{ d:'2026-12-04', q:'문장' }] }), // 12월에 다 읽은 비문학, 읽다 멈췄던 책, 쌓인 책
    W('i', { a:'김작가', th:['소설'], recs:[{ d:'2026-12-10' }] }), // 12월, 아는 작가
    W('j', { a:'새작가', th:['역사'], recs:[{ d:'2026-12-11' }, { d:'2020-01-01' }] }), // 다시 읽음 + 역사
    W('k', { a:'미확인', known:false, th:['경제·자기계발'], recs:[{ d:'2026-12-12' }] }), // 제목 미확인은 안 셈
    W('z', { k:'film', th:['역사'], recs:[{ d:'2026-12-13' }] }), // 영화는 안 셈
  ];
  const lib = [
    { id:'L1', t:'h', st:'own', added:'2026-01-01', w:'h', loans:[] },
    { id:'L2', t:'쌓임', st:'own', added:'2025-05-01', loans:[] },
    { id:'L3', t:'빌림', st:'in', added:'2026-07-02', loans:[{ dir:'in', d:'2026-07-02' }] },
    { id:'L4', t:'12월 빌림', st:'in', added:'2026-12-05', loans:[] },
    { id:'L5', t:'12월에 산 책', st:'own', added:'2026-12-08', w:'i', loans:[] },
  ];
  const posts = [{ d:'2026-08-01', k:'review' }, { d:'2026-12-20', k:'review' }, { d:'2026-12-21', k:'review', blog:true }];
  const reading = (w) => !(w.recs || []).some((r) => r.st !== 'unread') && (w.recs || []).some((r) => r.st === 'unread');
  const ctx = { works, lib, posts, today:'2026-11-24', known:(w) => w.known !== false, reading, firstAuthor:(a) => String(a || '').split(',')[0].trim(), libWork:(it) => it.w || '' };

  ok('키 읽기', () => {
    assert.deepStrictEqual(G.parseGoal('th:역사'), { k:'theme', theme:'역사', need:1 });
    assert.deepStrictEqual(G.parseGoal('count:4'), { k:'count', need:4 });
    assert.strictEqual(G.parseGoal('marks').need, 5);
    assert.strictEqual(G.parseGoal('없는목표'), null);
    assert.strictEqual(G.parseGoal('count:0'), null);
    assert.strictEqual(G.goalLabel('th:역사'), '오랜만에 역사 책 한 권');
    assert.ok(G.goalBadge('nonfic').img.endsWith('nonfic.png'));
    assert.strictEqual(G.goalBadge('review').img, '');
  });

  ok('비문학 판정', () => {
    assert.ok(G.isNonfic({ th:['역사'] }));
    assert.ok(!G.isNonfic({ th:['소설', '여성'] }));
    assert.ok(!G.isNonfic({ th:[] }), '주제 없는 책은 모름');
  });

  ok('후보: 빈틈이 큰 목표가 앞', () => {
    const c = G.goalCandidates(ctx, '2026-12');
    const keys = c.map((x) => x.key);
    // 지난 석 달(8/1~11/24) 다 읽은 책 a·b·c 모두 문학 → 비문학 점수 3으로 맨 앞
    assert.strictEqual(keys[0], 'nonfic');
    assert.match(c[0].why, /3권이 다 문학/);
    // 역사 3권(d·e·f), 마지막 2024-03 → 오랜만의 주제
    assert.ok(keys.includes('th:역사'));
    // 쌓인 책: L1(h 안 읽음)·L2·L5(i 안 읽음 상태) = 3권
    assert.match(c.find((x) => x.key === 'pile').why, /3권/);
    // 도서관: 마지막 2026-07 → 4달 → 높은 점수
    assert.strictEqual(c.find((x) => x.key === 'library').score, 2.5);
    // 읽다 멈춘 책 g·h(h는 아직 다 읽은 기록이 12월이라 오늘 기준으로도 다 읽은 기록이 있어 읽는 중 아님) → g 1권
    assert.match(c.find((x) => x.key === 'finish').why, /1권/);
    // 다시 펼치기: f(4.5점, 2023-12, 한 번) 하나
    assert.match(c.find((x) => x.key === 'reread').why, /1권/);
    // 서평: 마지막 2026-12(미래 글)라도 정렬 마지막 → gap 음수 → 낮은 점수. 블로그 글은 안 셈
    assert.ok(keys.some((k) => k.startsWith('count:')));
    // 같은 달이면 같은 순서
    assert.deepStrictEqual(G.goalCandidates(ctx, '2026-12').map((x) => x.key), keys);
  });

  ok('보여 줄 세 개: 주제 목표는 하나만', () => {
    const cands = [{ key:'th:역사', score:3 }, { key:'th:철학', score:2.9 }, { key:'nonfic', score:2 }, { key:'pile', score:1 }];
    assert.deepStrictEqual(G.pickGoals(cands).map((x) => x.key), ['th:역사', 'nonfic', 'pile']);
    assert.strictEqual(G.pickGoals(cands, 1).length, 3, '다른 목표 보기도 세 개');
    assert.deepStrictEqual(G.pickGoals([]), []);
  });

  ok('12월 이룬 정도', () => {
    const p = (k) => G.goalProgress(k, ctx, '2026-12');
    assert.strictEqual(p('nonfic').n, 2); // h(과학), j(역사). k는 미확인, z는 영화
    assert.strictEqual(p('th:역사').n, 1); // j
    assert.strictEqual(p('count:3').n, 3); // h·i·j
    assert.ok(p('count:3').done);
    assert.ok(!p('count:4').done);
    assert.strictEqual(p('pile').n, 1); // h(L1, 1월에 꽂힘). i는 12월에 산 책이라 쌓인 책 아님
    assert.strictEqual(p('newAuthor').n, 1); // h(한작가). j의 새작가는 2020에 읽은 적이 있어 아는 작가
    assert.strictEqual(p('reread').n, 1); // j
    assert.strictEqual(p('finish').n, 1); // h(10월에 읽다 멈춤)
    assert.strictEqual(p('library').n, 1); // L4(12월에 빌려 온 책)
    assert.strictEqual(p('review').n, 1); // 블로그 글은 안 셈
    assert.strictEqual(p('marks').n, 1);
    assert.ok(!p('marks').done);
  });

  ok('결과 한 줄', () => {
    assert.strictEqual(G.goalLine([{ done:true, label:'가' }, { done:true, label:'나' }], '2026-12'), '12월 목표 2개를 다 이뤘다.');
    assert.strictEqual(G.goalLine([{ done:false, label:'가' }], '2026-12'), '12월 목표는 아직 하나도 못 채웠다.');
    assert.strictEqual(G.goalLine([{ done:true, label:'가' }, { done:false, label:'나' }, { done:false, label:'다' }], '2026-01'), '1월 목표 3개 중 1개를 이뤘다. 남은 건 «나», «다».');
    assert.strictEqual(G.goalLine([], '2026-01'), '');
  });

  ok('빈 기록에서도 안 깨짐', () => {
    const c = G.goalCandidates({ works:[], lib:[], posts:[], today:'2026-11-24' }, '2026-12');
    assert.ok(c.length >= 3);
    assert.ok(c.every((x) => x.label && x.why));
    assert.strictEqual(G.goalProgress('pile', { works:[], lib:[], today:'2026-11-24' }, '2026-12').n, 0);
  });

  ok('검토자 지적: 연도만 적힌 기록·오늘 뒤 날짜·지금 읽는 책', () => {
    const ws = [
      W('y', { a:'옛작가', th:['소설'], recs:[{ d:'2023' }] }), // 연도만: 읽은 책
      W('n', { a:'옛작가', th:['역사'], recs:[{ d:'2026-12-02' }] }), // 12월, 아는 작가
      W('fut', { a:'미래', th:['소설'], recs:[{ d:'2026-12-30', r:5 }] }), // 오늘 뒤 날짜만
      W('now', { a:'지금', th:['철학'], recs:[{ d:'2026-11-20', st:'unread' }] }), // 지금 읽는 중
    ];
    const c2 = { ...ctx, works:ws, lib:[{ id:'L', t:'y', st:'own', w:'y', loans:[] }, { id:'M', t:'안 읽음', st:'own', loans:[] }] };
    const cands = G.goalCandidates(c2, '2026-12');
    assert.match(cands.find((x) => x.key === 'pile').why, /1권/); // y는 읽은 책
    assert.ok(!cands.some((x) => x.key === 'reread'), '오늘 뒤 날짜 책은 다시 펼치기 후보 아님');
    assert.ok(!cands.some((x) => x.key === 'finish'), '지금 읽는 책은 멈춘 책 아님');
    assert.strictEqual(G.goalProgress('newAuthor', c2, '2026-12').n, 1); // fut만 새 작가, n은 아는 작가
  });

  ok('말투: ㅎㅎ·(?)·말줄임 없음', () => {
    const texts = G.goalCandidates(ctx, '2026-12').map((x) => x.why + x.label);
    texts.forEach((t) => assert.ok(!/ㅎㅎ|\(\?\)|\.\.\.|…/.test(t), t));
  });

  // 범용판(2026-11-24): 파일 백업·드라이브에서 받은 기록이 목표 칸을 지우지 않고, 이상한 값은 거른다. local.js는 브라우저 모듈이라 .mjs 사본으로
  const os = require('os'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'goals-'));
  fs.copyFileSync(path.join(REPO, 'js/local.js'), path.join(tmp, 'local.mjs'));
  const { parseBackup } = await import('file:///' + path.join(tmp, 'local.mjs').replace(/\\/g, '/'));
  const back = parseBackup(JSON.stringify({ app:'my-bookshelf', version:1, data:{ works:{}, meta:{ goals:{
    '2026-12':{ g:['nonfic', 'th:역사', 'count:3', 'pile'], at:'2026-11-24', hack:1 },
    '2026-13x':{ g:['nonfic'] }, '2027-01':{ g:['<b>', 5] }, '2027-02':'x',
  } } } }));
  fs.rmSync(tmp, { recursive:true, force:true });
  ok('범용판 백업: 목표 칸 남김·거르기', () => {
    assert.deepStrictEqual(back.meta.goals, { '2026-12':{ g:['nonfic', 'th:역사', 'count:3'], at:'2026-11-24' } });
  });

  console.log(`목표 시험 ${n}개 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
