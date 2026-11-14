// «책 고치기» 창의 읽기 상태 저장 규칙(js/reading.js readingPatch) 시험. 가짜 데이터만 쓴다. 사용: node tools/test-reading-form.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const REPO = path.join(__dirname, '..');
(async () => {
  const R = await import(`data:text/javascript;base64,${fs.readFileSync(path.join(REPO, 'js/reading.js')).toString('base64')}`);
  const pub = fs.readFileSync(path.join(REPO, 'tools/publish.js'), 'utf8');
  // tools/publish.js의 두 판정(읽는 중 st:'reading', 다 읽은 책)이 이 시험이 흉내 내는 모양 그대로인지 먼저 본다
  assert(pub.includes("!recs.some((r) => r.st !== 'unread') && (w.unread || recs.some((r) => r.st === 'unread') || (w.notes || []).some((n) => n.s === 'reading'))) o.st = 'reading'"), 'publish.js 읽는 중 판정이 바뀜');
  assert(pub.includes("(recs.some((r) => r.st !== 'unread') || w.st === 'done'"), 'publish.js 다 읽음 판정이 바뀜');
  const pubReading = (w) => { const recs = w.recs || []; return !recs.some((r) => r.st !== 'unread') && (w.unread || recs.some((r) => r.st === 'unread') || (w.notes || []).some((n) => n.s === 'reading')); };
  const pubDone = (w) => (w.recs || []).some((r) => r.st !== 'unread') || w.st === 'done';
  let n = 0;
  const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.error('실패:', name); throw e; } };
  const book = (o) => ({ id:'x', k:'book', t:'가짜 책', recs:[], notes:[], ...o });

  ok('기록 없이 읽는 중 → 다 읽음(날짜 없음): 표시만', () => {
    const w = book({ unread:true, notes:[{ b:'가', s:'reading' }] });
    const x = R.readingPatch(w, 'done', { d:'', r:null });
    assert.strictEqual(x.recs.length, 0);
    assert.strictEqual(x.st, 'done'); assert(!x.unread); assert(!x.notes[0].s);
    assert(!R.isReading(x)); assert(pubDone(x)); assert(!pubReading(x));
    assert.strictEqual(w.notes[0].s, 'reading', '원본은 그대로');
  });
  ok('기록 없이 읽는 중 → 다 읽음(날짜·별점): 다 읽은 기록 하나', () => {
    const x = R.readingPatch(book({ unread:true }), 'done', { d:'2026-11-14', r:4.5 });
    assert.deepStrictEqual(x.recs, [{ d:'2026-11-14', r:4.5, l:'', b:'' }]);
    assert(!R.isReading(x)); assert(pubDone(x));
  });
  ok('미완독 기록 → 다 읽음: 가장 최근 미완독 기록을 바꾸고 새로 더하지 않음', () => {
    const w = book({ unread:true, recs:[{ d:'2025-01-01', r:3, st:'unread', l:'옛' }, { d:'2026-03-01', r:2, st:'unread', l:'새' }] });
    const x = R.readingPatch(w, 'done', { d:'2026-11-14', r:4 });
    assert.strictEqual(x.recs.length, 2);
    assert.deepStrictEqual(x.recs[1], { d:'2026-11-14', r:4, l:'새' });
    assert.strictEqual(x.recs[0].st, 'unread', '옛 미완독 기록은 그대로');
    assert(!x.unread); assert(!R.isReading(x)); assert(pubDone(x)); assert(!pubReading(x));
    assert.strictEqual(w.recs[1].st, 'unread', '원본은 그대로');
  });
  ok('미완독 기록 → 다 읽음(날짜 비움): 기록 날짜 그대로, 별점 null이면 지움', () => {
    const x = R.readingPatch(book({ recs:[{ d:'2026-03-01', r:2, st:'unread' }] }), 'done', { d:'', r:null });
    assert.deepStrictEqual(x.recs[0], { d:'2026-03-01', r:null });
  });
  ok('날짜 없는 미완독 기록이 여럿이면 뒤의 것', () => {
    assert.strictEqual(R.lastUnreadAt(book({ recs:[{ st:'unread' }, { st:'unread' }] })), 1);
    assert.strictEqual(R.lastUnreadAt(book({ recs:[{ d:'2026-05-01', st:'unread' }, { d:'2026-01-01', st:'unread' }] })), 0);
    assert.strictEqual(R.lastUnreadAt(book({ recs:[{ d:'2026-05-01' }] })), -1);
  });
  ok('다 읽음 → 읽는 중: 표시만 켬', () => {
    const x = R.readingPatch(book({ st:'done' }), 'reading');
    assert(x.unread); assert(!x.st); assert(R.isReading(x)); assert(pubReading(x));
  });
  ok('다 읽은 기록이 있는 책은 바꾸지 않음', () => {
    const w = book({ recs:[{ d:'2026-01-01', r:5 }] });
    const x = R.readingPatch(w, 'reading');
    assert.deepStrictEqual(x, { ...w, recs:[...w.recs], notes:[] });
    assert(!R.canMarkReading(w));
  });
  ok('상태가 같으면 그대로', () => {
    const w = book({ unread:true });
    assert.deepStrictEqual(R.readingPatch(w, 'reading'), { ...w, recs:[], notes:[] });
  });
  ok('책이 아니면 그대로', () => {
    const w = { id:'f', k:'film', recs:[], notes:[], unread:true };
    assert(!R.readingPatch(w, 'done').st);
  });
  // 앱이 옛 함수 대신 js/reading.js를 쓰는지(같은 기준이 두 곳에 생기지 않게)
  const app = fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8');
  ok('앱이 reading.js를 불러옴', () => {
    assert(/from '\.\/reading\.js'/.test(app));
    assert(!/const isReading = /.test(app) && !/function setReading/.test(app));
    assert(!/visToggle|onlyMeBox/.test(app), '옛 단추 함수가 남아 있음');
  });
  ok('서비스워커 목록', () => {
    for (const f of ['kdc.js', 'reading.js']) {
      assert(fs.readFileSync(path.join(REPO, 'sw.js'), 'utf8').includes(`'js/${f}'`));
      assert(fs.readFileSync(path.join(REPO, 'my/sw.js'), 'utf8').includes(`'../js/${f}'`));
    }
  });
  console.log(`test-reading-form 통과 ${n}개`);
})().catch((e) => { console.error(e); process.exit(1); });
