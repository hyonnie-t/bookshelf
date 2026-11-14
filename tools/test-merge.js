// 겹치는 책 합치기·되돌리기·시리즈 판정(js/merge.js) 시험. 가짜 데이터만 쓴다. 사용: node tools/test-merge.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const REPO = path.join(__dirname, '..');
(async () => {
  const M = await import(`data:text/javascript;base64,${fs.readFileSync(path.join(REPO, 'js/merge.js')).toString('base64')}`);
  let n = 0;
  const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.error('실패:', name); throw e; } };
  const J = (v) => JSON.parse(JSON.stringify(v)); // 저장소를 거친 값(undefined 칸이 빠진다)
  const book = (id, x = {}) => ({ id, t:'', a:'', p:'', th:[], known:true, y:'', fd:'', recs:[], notes:[], archived:[], marks:[], ...x });
  // 합치기 → 되돌리기 하면 두 칸이 합치기 전과 같아야 한다(모든 칸)
  const roundTrip = (keep, drop, opt) => {
    const { next, gone } = M.mergePlan(keep, drop, { now:1, ...opt });
    const { next: k2, back } = M.undoPlan(J(gone), J(next), drop.id);
    assert.deepEqual(J(k2), J(keep), '남은 칸이 합치기 전과 같음');
    assert.deepEqual(J(back), J(drop), '빠진 칸이 합치기 전과 같음');
    return { next, gone };
  };

  ok('같은 기록 판정', () => {
    assert.equal(M.sameRec({ d:'2023-07-24', r:4 }, { d:'2023-07-24', r:4 }), true);
    assert.equal(M.sameRec({ d:'2023-07-24', r:4 }, { d:'2023-07-24' }), true); // 한쪽 별점 비었음
    assert.equal(M.sameRec({ d:'2023-07-24', r:4 }, { d:'2023-07-24', r:3 }), false);
    assert.equal(M.sameRec({ d:'2023-07-24', r:4, st:'unread' }, { d:'2023-07-24', r:4 }), false);
    assert.equal(M.sameRec({ d:'', r:4 }, { d:'', r:4 }), false); // 날짜 없는 기록은 같다고 보지 않는다
  });

  ok('같은 기록 하나만 남기기', () => {
    const keep = book('k', { t:'진이, 지니', a:'정유정', recs:[{ d:'2023-07-24', r:4, l:'짧음' }, { d:'2024-01-01', r:3 }] });
    const drop = book('d', { t:'진이 지니', recs:[{ d:'2023-07-24', b:'더 긴 기록 본문', cd:'2023-07-20' }], notes:[{ d:'2023-07-25', b:'메모', l:'메모' }] });
    const { next, gone, dups } = M.mergePlan(keep, drop, { dedupe:true, now:5 });
    assert.equal(dups, 1);
    assert.equal(next.recs.length, 2);
    const r = next.recs[0];
    assert.equal(r.b, '더 긴 기록 본문'); assert.equal(r.r, 4); assert.equal(r.l, '짧음'); assert.equal(r.cd, '2023-07-20'); // 긴 쪽 바탕, 빈 칸 채움
    assert.deepEqual(r.mix, ['d.0']); assert.equal(r.from, undefined);
    assert.equal(gone.dupRecs.length, 1); assert.equal(gone.at, 5);
    assert.equal(next.notes[0].from[0], 'd');
    roundTrip(keep, drop, { dedupe:true });
    // 끄면 둘 다 남는다(예전 방식)
    assert.equal(M.mergePlan(keep, drop, { dedupe:false }).next.recs.length, 3);
    roundTrip(keep, drop, { dedupe:false });
    assert.equal(M.dupCount(keep.recs, drop.recs), 1);
  });

  ok('공개 여부는 남는 칸 기록을 따른다', () => {
    const keep = book('k', { recs:[{ d:'2023-12-22', r:4 }] }), drop = book('d', { recs:[{ d:'2023-12-22', r:4, b:'공개한 긴 글', pub:true }] });
    const { next } = M.mergePlan(keep, drop, { dedupe:true });
    assert.equal(next.recs[0].pub, undefined);
    roundTrip(keep, drop, { dedupe:true });
  });

  ok('남길 제목·저자 고르기', () => {
    const keep = book('k', { t:'헨치 1,2', a:'나탈리 지나 월쇼츠', p:'A' }), drop = book('d', { t:'헨치', a:'나탈리 월쇼츠', p:'B', recs:[{ d:'2024-02-02', r:5 }] });
    const { next, gone } = M.mergePlan(keep, drop, { t:'drop', a:'keep', p:'drop' });
    assert.equal(next.t, '헨치'); assert.equal(next.a, '나탈리 지나 월쇼츠'); assert.equal(next.p, 'B');
    assert.equal(gone.was.t, '헨치 1,2');
    roundTrip(keep, drop, { t:'drop', p:'drop' });
    const same = M.mergePlan(keep, drop, {});
    assert.equal(same.next.t, '헨치 1,2'); assert.equal(same.gone.was.t, undefined);
  });

  ok('잠긴 칸은 책 정보를 안 옮긴다', () => {
    const keep = book('k', { t:'공개 책' }), drop = book('d', { t:'다른 제목', a:'누구', th:['소설'], notes:[{ d:'2020-01-01', b:'x', l:'x' }] });
    const { next } = M.mergePlan(keep, drop, { lock:true, t:'drop', a:'drop' });
    assert.equal(next.t, '공개 책'); assert.equal(next.a, ''); assert.deepEqual(next.th, []);
    assert.equal(next.notes.length, 1);
    roundTrip(keep, drop, { lock:true });
  });

  ok('책등 이어 주기', () => {
    const keep = book('k', { t:'A' }), drop = book('d', { t:'A', y24:['12345', 0.1] });
    const { next, gone } = M.mergePlan(keep, drop, { spine:['12345', 0.1] });
    assert.deepEqual(next.y24, ['12345', 0.1]); assert.equal(gone.was.y24, 'none');
    roundTrip(keep, drop, { spine:['12345', 0.1] });
    const keep1 = book('k', { t:'A', y24:1 });
    assert.equal(J(M.undoPlan(J(M.mergePlan(keep1, drop, { spine:['9', 0.2] }).gone), J(M.mergePlan(keep1, drop, { spine:['9', 0.2] }).next), 'd').next).y24, 1);
  });

  ok('나만 보기·읽는 중·추정', () => {
    const keep = book('k', { t:'A', guess:true, known:false, recs:[{ d:'2024-01-01', st:'unread' }] });
    const drop = book('d', { t:'A', only:true, recs:[{ d:'2024-03-01', r:4 }], marks:[{ id:'m1', q:'문장', p:'12' }] });
    const { next } = M.mergePlan(keep, drop, {});
    assert.equal(next.only, true); assert.equal(next.unread, undefined); assert.equal(next.guess, undefined); assert.equal(next.known, true);
    assert.equal(next.marks[0].from[0], 'd');
    roundTrip(keep, drop, {});
    const k2 = book('k', { t:'B', unread:true }), d2 = book('d', { t:'B', recs:[{ d:'2024-05-01', st:'unread' }] });
    assert.equal(M.mergePlan(k2, d2, {}).next.unread, true);
    roundTrip(k2, d2, {});
  });

  ok('두 번 합친 뒤 나중 것부터 되돌리기', () => {
    const a = book('a', { t:'X', recs:[{ d:'2020-01-01', r:3 }] }), b = book('b', { t:'X', recs:[{ d:'2020-01-01', r:3, b:'b 글' }] }), c = book('c', { t:'X', recs:[{ d:'2020-01-01', b:'c 글 더 길게' }] });
    const m1 = M.mergePlan(a, b, { dedupe:true, now:1 });
    const m2 = M.mergePlan(J(m1.next), c, { dedupe:true, now:2 });
    assert.equal(m2.next.recs.length, 1); assert.deepEqual(m2.next.recs[0].mix, ['b.0', 'c.0']);
    const u2 = M.undoPlan(J(m2.gone), J(m2.next), 'c');
    assert.deepEqual(J(u2.back), J(c)); assert.deepEqual(J(u2.next), J(m1.next));
    const u1 = M.undoPlan(J(m1.gone), J(u2.next), 'b');
    assert.deepEqual(J(u1.back), J(b)); assert.deepEqual(J(u1.next), J(a));
  });

  ok('옮겨 온 글 수', () => {
    const keep = book('k', { recs:[{ d:'2023-07-24', r:4 }] }), drop = book('d', { recs:[{ d:'2023-07-24', r:4 }], notes:[{ b:'1' }, { b:'2' }], marks:[{ id:'x' }] });
    const { next } = M.mergePlan(keep, drop, { dedupe:true });
    assert.deepEqual(M.movedCounts(next, 'd'), { recs:1, notes:2, marks:1 });
  });

  ok('시리즈 판정', () => {
    const yes = [['토지', '토지 4'], ['토지', '토지 1권 - 1부 1권'], ['아리랑', '아리랑 1'], ['아리랑', '아리랑. 4: 부제'], ['헨치', '헨치 1,2'], ['삼국지', '삼국지 (1)'], ['태백산맥', '태백산맥 상'], ['토지', '토지 제2부'], ['대망', '대망 전12권'], ['해리 포터와 마법사의 돌', '해리 포터와 마법사의 돌 2']];
    yes.forEach(([x, y]) => { assert.equal(M.seriesPair(x, y), true, `${x} / ${y}`); assert.equal(M.seriesPair(y, x), true, `${y} / ${x}`); });
    const no = [['토지', '토지'], ['서울', '서울 1964년 겨울'], ['레슨', '레슨 인 케미'], ['1984', '19'], ['토지 1', '토지 4'], ['파친코', '파친코하'], ['', '토지 4']];
    no.forEach(([x, y]) => assert.equal(M.seriesPair(x, y), false, `${x} / ${y}`));
  });

  ok('앱 연결', () => {
    const app = fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8');
    assert.ok(app.includes("from './merge.js'"));
    for (const sw of ['sw.js', 'my/sw.js']) assert.ok(fs.readFileSync(path.join(REPO, sw), 'utf8').includes('js/merge.js'), sw);
    const local = fs.readFileSync(path.join(REPO, 'js/local.js'), 'utf8');
    assert.ok(local.includes('dupRecs') && local.includes('mix'), '범용판 파일 거르기가 dupRecs·mix를 남긴다');
  });
  console.log(`합치기 시험 ${n}개 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
