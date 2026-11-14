// 빈 칸 채우기·다시 찾기 판정(js/fill-tool.js) 시험. 가짜 데이터만 쓴다. 사용: node tools/test-fill-tool.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const REPO = path.join(__dirname, '..');
(async () => {
  const F = await import(`data:text/javascript;base64,${fs.readFileSync(path.join(REPO, 'js/fill-tool.js')).toString('base64')}`);
  let n = 0;
  const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.error('실패:', name); throw e; } };
  const err = new Error('limit');

  ok('출처 순서: 효니 책장은 예스24 → 국립중앙도서관 → 카카오, 범용판은 카카오 없음', () => {
    assert.deepStrictEqual(F.relayChain(false), ['y24', 'nl', '']);
    assert.deepStrictEqual(F.relayChain(true), ['y24', 'nl']);
  });
  ok('예스24에 결과가 있으면 다음 출처로 안 넘어감', () => {
    assert(!F.needNext({ src:'y24', rows:[{ t:'가' }] }));
    assert(F.needNext({ src:'y24', rows:[] }), '0건이면 넘어감(쪽지 ④)');
    assert(F.needNext({ src:'y24', err }), '오류면 넘어감');
  });
  ok('pickSource: 결과가 있는 첫 출처', () => {
    const got = F.pickSource([{ src:'y24', rows:[] }, { src:'nl', rows:[{ t:'나' }] }]);
    assert.strictEqual(got.src, 'nl'); assert.strictEqual(got.rows.length, 1);
  });
  ok('pickSource: 하나라도 답했고 모두 0건이면 빈 목록(못 찾음)', () => {
    const got = F.pickSource([{ src:'y24', err }, { src:'nl', rows:[] }, { src:'', rows:[] }]);
    assert.deepStrictEqual(got.rows, []);
  });
  ok('pickSource: 모두 실패면 오류(찾기 실패)', () => {
    assert.throws(() => F.pickSource([{ src:'y24', err }, { src:'nl', err }]));
  });
  ok('judgeFill: 제목·저자가 맞는 첫 결과는 확실', () => {
    const r = F.judgeFill({ t:'작별하지 않는다' }, [{ t:'작별하지 않는다', a:'한강', p:'문학동네' }], '한강');
    assert.strictEqual(r.status, 'sure');
  });
  ok('judgeFill: 첫 결과가 아닌 맞는 책은 확인 필요, 맞는 책 없으면 못 찾음', () => {
    assert.strictEqual(F.judgeFill({ t:'가나다' }, [{ t:'다른 책', a:'갑' }, { t:'가나다', a:'을', p:'P' }], '을').status, 'check');
    assert.strictEqual(F.judgeFill({ t:'가나다' }, [{ t:'라마바', a:'갑' }], '갑').status, 'none');
  });
  ok('judgeFill: 판이 여러 출판사면 확인 필요', () => {
    assert.strictEqual(F.judgeFill({ t:'데미안' }, [{ t:'데미안', a:'헤르만 헤세', p:'민음사' }, { t:'데미안', a:'헤르만 헤세', p:'문학동네' }], '헤르만 헤세').status, 'check');
  });
  ok('권 표시 괄호는 남기고 판 이름 괄호는 뺀다', () => {
    assert.notStrictEqual(F.bareTitle('토지 (1)'), F.bareTitle('토지 (2)'));
    assert.strictEqual(F.bareTitle('데미안 (리커버 특별판)'), F.bareTitle('데미안'));
  });
  ok('결과 묶음 세 칸', () => {
    assert.deepStrictEqual(['sure', 'picked', 'check', 'none', 'fail'].map(F.fillGroup), ['ok', 'ok', 'check', 'miss', 'miss']);
    assert.deepStrictEqual(F.FILL_GROUPS.map((x) => x[1]), ['채울 수 있어요', '확인해 주세요', '못 찾았어요']);
  });
  ok('제목이 다를 때만 «책 제목도 고치기»', () => {
    assert(F.titleDiffers({ t:'작별하지 않는다다' }, { t:'작별하지 않는다' }));
    assert(!F.titleDiffers({ t:'작별하지 않는다' }, { t:'작별하지  않는다' }));
    assert(!F.titleDiffers({ t:'가' }, null));
  });
  // 앱이 같은 판정을 따로 두지 않는지
  const app = fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8');
  ok('앱 연결', () => {
    assert(/from '\.\/fill-tool\.js'/.test(app));
    assert(!/const bareTitle = /.test(app), 'bareTitle가 앱에 따로 남아 있음');
    assert(!/RELAY_BACKUP/.test(app), '옛 예비 출처 한 곳 방식이 남아 있음');
    assert(/rowSearch\(y24Query/.test(app) && /rowSearch\(tidy/.test(app), '다시 찾기가 빈 칸 채우기·책등 다시 찾기 두 곳에');
    for (const [f, p] of [['sw.js', "'js/fill-tool.js'"], ['my/sw.js', "'../js/fill-tool.js'"]]) assert(fs.readFileSync(path.join(REPO, f), 'utf8').includes(p), f);
  });
  console.log(`test-fill-tool 통과 ${n}개`);
})().catch((e) => { console.error(e); process.exit(1); });
