// 책등 다시 찾기 판정·묶음(js/spine-tool.js) 시험. 가짜 데이터만 쓴다. 사용: node tools/test-spine-tool.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const REPO = path.join(__dirname, '..');
(async () => {
  const T = await import(`data:text/javascript;base64,${fs.readFileSync(path.join(REPO, 'js/spine-tool.js')).toString('base64')}`);
  let n = 0;
  const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.error('실패:', name); throw e; } };
  const w = (id, t, a) => ({ id, t, a });

  ok('판정: 제목·저자', () => {
    const book = w('x', '채식주의자 : 한강 연작소설', '한강');
    assert.equal(T.spineFit(book, { title:'채식주의자', authors:['한강'] }), true);
    assert.equal(T.spineFit(book, { title:'채식주의자 (리커버)', authors:['한강'] }), true); // 괄호는 빼고 비교
    assert.equal(T.spineFit(book, { title:'채식주의자', authors:['다른 사람'] }), false);
    assert.equal(T.spineFit(w('y', '토지', ''), { title:'토지 1', authors:['박경리'] }), true); // 저자가 없으면 제목만
    assert.equal(T.spineFit(w('z', '', '한강'), { title:'채식주의자', authors:['한강'] }), false);
    assert.equal(T.spineFit(w('z', '소년이 온다', '한강, 옮긴이 옮김'), { title:'소년이 온다', authors:['한강'] }), true); // 첫 저자만
  });

  ok('대상 나누기', () => {
    const ts = [w('a', 'A'), w('b', 'B'), w('c', 'C'), w('d', 'D')];
    const miss = { a:'noside', b:'nomatch' }, tried = { c:'nomatch' };
    const s = T.splitTargets(ts, miss, tried);
    assert.deepEqual(s.todo.map((x) => x.id), ['b', 'd']); // y24.json의 nomatch는 다시 찾는다(앱 검색은 다를 수 있음)
    assert.deepEqual(s.known.map((x) => x.id), ['a', 'c']);
    const again = T.splitTargets(ts, miss, tried, true);
    assert.equal(again.todo.length, 4); assert.equal(again.known.length, 0);
    assert.equal(T.triedWhy('a', miss, tried), 'noside'); assert.equal(T.triedWhy('c', miss, tried), 'nomatch');
  });

  ok('한 권 결과', () => {
    const book = w('x', '행성어 서점', '김초엽');
    const books = [{ y24:'1', title:'다른 책', authors:['누구'] }, { y24:'2', title:'행성어 서점', authors:['김초엽'], publisher:'마음산책', year:'2021' }, { y24:'3', title:'행성어 서점 (큰글자도서)', authors:['김초엽'] }];
    assert.deepEqual(T.spineResult(book, [], {}), { status:'none', why:'nomatch', cands:[], pick:null });
    assert.equal(T.spineResult(book, books, {}).why, 'noside');
    const r = T.spineResult(book, books, { 1:0.1, 3:0.08 });
    assert.equal(r.status, 'found'); assert.equal(r.pick, '3'); // 사진이 있는 맞는 판(2는 사진 없음)
    assert.deepEqual(r.cands.map((c) => c.no), ['3', '1']); // 맞는 판이 앞
    const p = T.spineResult(book, books, { 1:0.1 });
    assert.equal(p.status, 'pick'); assert.equal(p.pick, null);
    assert.equal(T.spineResult(book, Array.from({ length:9 }, (_, i) => ({ y24:String(i), title:'행성어 서점', authors:['김초엽'] })), { 8:0.1 }).status, 'none'); // 앞 여섯 판만 본다
  });

  ok('묶음·기억·저장 값', () => {
    const rs = [
      { w:w('f'), status:'found', why:'', cands:[{ no:'9', ratio:0.1 }], pick:'9' },
      { w:w('p'), status:'pick', why:'', cands:[{ no:'8', ratio:0.12 }], pick:null },
      { w:w('s'), status:'none', why:'noside', cands:[], pick:null },
      { w:w('m'), status:'none', why:'nomatch', cands:[], pick:null, manual:['77', 0.09] },
      { w:w('x'), status:'fail', why:'', cands:[], pick:null },
    ];
    const g = T.groupResults(rs);
    assert.deepEqual([g.found.length, g.pick.length, g.none.length], [1, 1, 3]);
    assert.deepEqual(T.triedPatch(rs), { s:'noside', m:'nomatch' }); // 실패는 기억하지 않는다
    assert.deepEqual(T.triedClear(rs, { f:'noside', s:'noside' }), { f:null });
    assert.deepEqual(T.pickedSpines(rs), { f:['9', 0.1], m:['77', 0.09] });
    rs[0].pick = null; rs[1].pick = '8';
    assert.deepEqual(T.pickedSpines(rs), { p:['8', 0.12], m:['77', 0.09] });
  });

  // 앱 연결: 앱이 이 파일을 불러오고, 서비스워커 두 곳이 캐시하고, 범용판 파일 거르기가 y24tried를 남긴다
  ok('앱 연결', () => {
    const app = fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8');
    assert.ok(app.includes("from './spine-tool.js'"));
    assert.ok(!/const coverNorm = /.test(app), 'coverNorm은 spine-tool.js 하나');
    for (const sw of ['sw.js', 'my/sw.js']) assert.ok(fs.readFileSync(path.join(REPO, sw), 'utf8').includes('js/spine-tool.js'), sw);
    assert.ok(fs.readFileSync(path.join(REPO, 'js/local.js'), 'utf8').includes('out.meta.y24tried'));
    assert.ok(!fs.readFileSync(path.join(REPO, 'tools/publish.js'), 'utf8').includes('y24tried'), '공개본에는 안 간다');
  });
  console.log(`책등 다시 찾기 시험 ${n}개 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
