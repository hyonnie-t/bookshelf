// 집 서재·학교 서재(2026-11-27, 쪽지 imwyek8kt5lcy)와 읽고 싶은 책 실물 책등의 저장 칸 시험.
//   node tools/test-lib-room.js
// 범용판 파일 불러오기(local.js parseBackup → cleanLib)가 library/{id}.room·y24를 남기는지, 앱이 같은 이름을 쓰는지 본다.
const fs = require('fs'), path = require('path'), assert = require('assert');
const REPO = path.join(__dirname, '..');
(async () => {
  let n = 0;
  const ok = (name, f) => { f(); n++; };
  const L = await import(`data:text/javascript;base64,${fs.readFileSync(path.join(REPO, 'js/local.js')).toString('base64')}`);
  const file = (library) => JSON.stringify({ app:'my-bookshelf', data:{ works:{}, library } });
  ok('학교 서재 칸을 남긴다', () => {
    const d = L.parseBackup(file({ a:{ t:'코스모스', st:'own', room:'school', loans:[] }, b:{ t:'이방인', st:'own', loans:[] }, c:{ t:'토지', st:'own', room:'office', loans:[] } }));
    assert.strictEqual(d.library.a.room, 'school');
    assert.ok(!('room' in d.library.b), '집 서재는 칸을 두지 않는다');
    assert.ok(!('room' in d.library.c), '모르는 값은 버린다(집 서재)');
  });
  ok('읽고 싶은 책의 책등 칸을 남긴다', () => {
    const d = L.parseBackup(file({ w:{ t:'파친코', st:'want', y24:['123456', 0.08], loans:[] }, x:{ t:'토지', st:'want', y24:0, loans:[] } }));
    assert.deepStrictEqual(d.library.w.y24, ['123456', 0.08]);
    assert.strictEqual(d.library.w.st, 'want');
    assert.strictEqual(d.library.x.y24, 0);
  });
  ok('앱 연결', () => {
    const app = fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8');
    for (const k of ["it.room === 'school'", 'function openRoomTool', "libSpineTargets('want')", 'function autoWantSpines', "lib:'want'"]) assert.ok(app.includes(k), k);
    for (const html of ['index.html', 'my/index.html']) {
      const h = fs.readFileSync(path.join(REPO, html), 'utf8');
      assert.ok(h.includes('id="libRooms"') && h.includes('id="libRoomMove"'), html);
    }
  });
  console.log(`서재 나누기·읽고 싶은 책 책등 시험 ${n}개 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
