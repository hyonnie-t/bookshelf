// 범용판 «내 구글 드라이브 연결» 시험(가짜 데이터).
// my/drive-sync.gs를 가짜 구글 서비스(드라이브 파일·잠금·스크립트 속성) 위에서 그대로 돌리고, js/local.js의 합치기 규칙을 본다.
//   node tools/test-drive-sync.js          시험만
//   node tools/test-drive-sync.js --serve  시험 뒤 가짜 웹 앱을 127.0.0.1:8781에 띄운다(브라우저에서 fetch를 이 주소로 돌려 두 기기를 흉내 낼 때)
const fs = require('fs'), path = require('path'), vm = require('vm'), http = require('http'), assert = require('assert');

function gasServer() {
  const files = {}, props = {};
  let n = 0;
  const file = (id) => ({ getId:() => id, isTrashed:() => !!files[id].trashed, getName:() => files[id].name, setContent:(t) => { files[id].text = t; }, getBlob:() => ({ getDataAsString:() => files[id].text }) });
  const ctx = {
    DriveApp: { getFileById:(id) => { if (!files[id]) throw new Error('no file'); return file(id); }, createFile:(name, text) => { const id = 'f' + (++n); files[id] = { name, text }; return file(id); } },
    PropertiesService: { getScriptProperties:() => ({ getProperty:(k) => props[k] || null, setProperty:(k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock:() => ({ waitLock:() => {}, releaseLock:() => {} }) },
    ContentService: { MimeType:{ JSON:'json' }, createTextOutput:(t) => ({ text:t, setMimeType() { return this; } }) },
    Logger: { log:() => {} },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'my', 'drive-sync.gs'), 'utf8'), ctx);
  return {
    get:() => JSON.parse(ctx.doGet().text),
    post:(body) => JSON.parse(ctx.doPost({ postData:{ contents:typeof body === 'string' ? body : JSON.stringify(body) } }).text),
    files, props,
    trash:() => { Object.values(files).forEach((f) => { f.trashed = true; }); },
  };
}

async function main() {
  let ok = 0;
  const t = (name, fn) => { fn(); ok++; console.log('  통과', name); };

  console.log('서버(drive-sync.gs)');
  const g = gasServer();
  t('처음 읽으면 빈 판 0', () => { const r = g.get(); assert.strictEqual(r.app, 'my-bookshelf-sync'); assert.strictEqual(r.rev, 0); assert.strictEqual(r.payload, null); });
  t('판이 맞으면 저장하고 판을 올림', () => { const r = g.post({ op:'put', base:0, payload:{ data:{ works:{ a:{ t:'가' } } }, touched:{} } }); assert.strictEqual(r.ok, true); assert.strictEqual(r.rev, 1); assert.strictEqual(g.get().payload.data.works.a.t, '가'); });
  t('판이 다르면 받지 않고 지금 기록을 돌려줌', () => { const r = g.post({ op:'put', base:0, payload:{ data:{} } }); assert.strictEqual(r.conflict, true); assert.strictEqual(r.rev, 1); assert.strictEqual(r.payload.data.works.a.t, '가'); assert.strictEqual(g.get().rev, 1); });
  t('모르는 요청·깨진 글은 거절', () => { assert.strictEqual(g.post({ op:'x', base:1, payload:{} }).ok, false); assert.strictEqual(g.post('{깨짐').ok, false); assert.strictEqual(g.post({ op:'put', base:1, payload:null }).ok, false); assert.strictEqual(g.get().rev, 1); });
  t('파일을 휴지통에 넣으면 새 파일로 다시 시작', () => { g.trash(); const r = g.get(); assert.strictEqual(r.rev, 0); assert.strictEqual(r.payload, null); assert.strictEqual(Object.keys(g.files).length, 2); });

  console.log('합치기(local.js mergeData)');
  const { mergeData } = await import('file:///' + path.join(__dirname, '..', 'js', 'local.js').split(path.sep).join('/'));
  const W = (t) => ({ t, a:'', p:'', k:'book', th:[], y:'', fd:'', known:true, recs:[], notes:[] });
  t('서로 다른 책은 모두 남음(처음 연결, 고친 때 기록 없음)', () => { const m = mergeData({ works:{ a:W('가') } }, {}, { works:{ b:W('나') } }, {}); assert.deepStrictEqual(Object.keys(m.data.works).sort(), ['a', 'b']); });
  t('같은 책은 나중에 고친 쪽', () => {
    let m = mergeData({ works:{ a:W('이 기기') } }, { 'works/a':200 }, { works:{ a:W('드라이브') } }, { 'works/a':100 });
    assert.strictEqual(m.data.works.a.t, '이 기기'); assert.strictEqual(m.touched['works/a'], 200);
    m = mergeData({ works:{ a:W('이 기기') } }, { 'works/a':100 }, { works:{ a:W('드라이브') } }, { 'works/a':200 });
    assert.strictEqual(m.data.works.a.t, '드라이브');
  });
  t('고친 때가 같거나 둘 다 없으면 드라이브 쪽', () => { assert.strictEqual(mergeData({ works:{ a:W('기기') } }, {}, { works:{ a:W('드라이브') } }, {}).data.works.a.t, '드라이브'); assert.strictEqual(mergeData({ works:{ a:W('기기') } }, { 'works/a':5 }, { works:{ a:W('드라이브') } }, { 'works/a':5 }).data.works.a.t, '드라이브'); });
  t('나중에 지운 것은 지운 대로(살아나지 않음)', () => {
    const m = mergeData({ works:{} }, { 'works/a':300 }, { works:{ a:W('옛 책') } }, { 'works/a':100 });
    assert.ok(!m.data.works || !m.data.works.a); assert.strictEqual(m.touched['works/a'], 300);
  });
  t('지운 뒤 다른 기기가 더 나중에 고쳤으면 남음', () => { const m = mergeData({ works:{} }, { 'works/a':100 }, { works:{ a:W('고친 책') } }, { 'works/a':300 }); assert.strictEqual(m.data.works.a.t, '고친 책'); });
  t('내 서재·책장 이름도 칸별로', () => {
    const m = mergeData({ library:{ x:{ t:'소장' } }, meta:{ name:'내 이름' } }, { 'meta/name':500 }, { library:{ y:{ t:'빌림' } }, meta:{ name:'옛 이름', lastBackup:'2026-11-01' } }, { 'meta/name':100 });
    assert.deepStrictEqual(Object.keys(m.data.library).sort(), ['x', 'y']); assert.strictEqual(m.data.meta.name, '내 이름'); assert.strictEqual(m.data.meta.lastBackup, '2026-11-01');
  });
  t('원본을 바꾸지 않음', () => { const L = { works:{ a:W('가') } }, R = { works:{ a:W('나') } }; const m = mergeData(L, {}, R, {}); m.data.works.a.t = '바뀜'; assert.strictEqual(R.works.a.t, '나'); assert.strictEqual(L.works.a.t, '가'); });
  console.log('두 기기(local.js 두 벌, IndexedDB 없는 창처럼 메모리 저장)');
  // 같은 가짜 서버를 두 기기가 쓴다. B가 올리기 전에 멈춰 있는 사이 A가 먼저 올리게 해 판이 엇갈리는 경우를 만든다
  const srv = gasServer();
  let holdB = null;
  globalThis.addEventListener = () => {}; globalThis.document = { addEventListener:() => {}, hidden:false };
  globalThis.fetch = async (u, o) => {
    const post = o && o.method === 'POST';
    if (post && holdB && o.body.includes('(B 고침)')) await holdB; // B가 올리는 글에만 걸린다
    const body = post ? srv.post(o.body) : srv.get();
    return { json:async () => JSON.parse(JSON.stringify(body)) };
  };
  const base = 'file:///' + path.join(__dirname, '..', 'js', 'local.js').split(path.sep).join('/');
  const A = await import(base + '?dev=a'), B = await import(base + '?dev=b');
  await A.readPrivate(); await B.readPrivate(); // node에는 IndexedDB가 없어 메모리 저장으로 들어간다(앱도 시작할 때 먼저 읽는다)
  const URL1 = 'https://script.google.com/macros/s/AKfycbTESTtestTESTtestTEST123/exec';
  t('주소 모양 검사', () => { assert.ok(A.DRIVE_URL.test(URL1)); assert.ok(A.DRIVE_URL.test('https://script.google.com/a/macros/school.kr/s/AKfycbTESTtestTESTtestTEST123/exec')); assert.ok(!A.DRIVE_URL.test('https://script.google.com/macros/s/AKfycb/edit')); assert.ok(!A.DRIVE_URL.test('https://evil.com/macros/s/AKfycbTESTtestTESTtestTEST123/exec')); });
  await A.writePath('works/a1', W('A 책'));
  await B.writePath('works/b1', W('B 책'));
  const ra = await A.connectDrive(URL1), rb = await B.connectDrive(URL1);
  await A.syncNow();
  t('처음 연결 알림 숫자(드라이브에 있던 책)', () => { assert.strictEqual(ra.had, 0); assert.strictEqual(rb.had, 1); });
  assert.deepStrictEqual(Object.keys((await A.readPrivate()).works).sort(), ['a1', 'b1']);
  assert.deepStrictEqual(Object.keys((await B.readPrivate()).works).sort(), ['a1', 'b1']);
  let release; holdB = new Promise((r) => { release = r; });
  await B.writePath('works/b1', W('B 책 (B 고침)'));
  const pb = B.syncNow(); // 받기는 끝나고 올리기에서 멈춤
  await new Promise((r) => setTimeout(r, 50));
  await A.writePath('works/a1', W('A 책 (A 고침)'));
  await A.syncNow(); // A가 먼저 올림
  const revA = srv.get().rev;
  release(); holdB = null; await pb; // B 올리기는 판이 엇갈려 거절 → 다시 받아 합쳐 올림
  await A.syncNow();
  const fin = srv.get();
  t('판이 엇갈려도 두 기기 고침이 모두 남음', () => { assert.strictEqual(fin.rev, revA + 1); assert.strictEqual(fin.payload.data.works.a1.t, 'A 책 (A 고침)'); assert.strictEqual(fin.payload.data.works.b1.t, 'B 책 (B 고침)'); });
  t('두 기기 내용이 같아짐', async () => {});
  const [da, db] = [await A.readPrivate(), await B.readPrivate()];
  assert.strictEqual(da.works.b1.t, 'B 책 (B 고침)'); assert.strictEqual(db.works.a1.t, 'A 책 (A 고침)');
  await B.writePath('works/a1', null); await B.syncNow(); await A.syncNow();
  t('한 기기에서 지우면 다른 기기에서도 빠지고 다시 살아나지 않음', () => {});
  assert.ok(!(await A.readPrivate()).works.a1); await A.syncNow(); assert.ok(!srv.get().payload.data.works.a1);
  const before = srv.get().rev; await A.syncNow(); await B.syncNow();
  t('바뀐 게 없으면 올리지 않음', () => { assert.strictEqual(srv.get().rev, before); });
  // 앱이 저장하는 모양(id 칸이 붙음)으로 고쳐도 «받은 기록»으로 치지 않아야 한다(치면 열린 책 창이 닫힌다)
  const evs = []; A.onSync((e) => evs.push(e));
  await A.writePath('works/b1', { ...W('B 책 (A가 창에서 고침)'), id:'b1' });
  await A.syncNow(); await A.syncNow();
  t('앱 모양으로 저장해도 받은 기록 알림이 안 나감', () => { assert.ok(!evs.includes('pulled'), evs.join(',')); assert.strictEqual(srv.get().payload.data.works.b1.t, 'B 책 (A가 창에서 고침)'); });
  const evB = []; B.onSync((e) => evB.push(e));
  await B.syncNow();
  const b1 = (await B.readPrivate()).works.b1;
  t('다른 기기는 고친 책을 받고 받은 기록 알림이 나감', () => { assert.strictEqual(b1.t, 'B 책 (A가 창에서 고침)'); assert.ok(evB.includes('pulled')); });
  console.log(`모두 ${ok}건 통과`);

  if (process.argv.includes('--serve')) {
    const s = gasServer();
    http.createServer((q, r) => {
      r.setHeader('access-control-allow-origin', '*');
      r.setHeader('content-type', 'application/json; charset=utf-8');
      if (q.method === 'OPTIONS') { r.statusCode = 405; return r.end(); } // 앱스크립트도 사전 요청을 받지 않는다. 앱이 단순 요청만 보내는지 같이 본다
      if (q.method === 'GET') { if (q.url.startsWith('/html')) { r.setHeader('content-type', 'text/html'); return r.end('<html>로그인</html>'); } return r.end(JSON.stringify(s.get())); }
      let b = ''; q.on('data', (c) => { b += c; }); q.on('end', () => { const ct = q.headers['content-type'] || ''; if (ct && !/^text\/plain/.test(ct)) { r.statusCode = 415; return r.end('{}'); } r.end(JSON.stringify(s.post(b))); });
    }).listen(8781, '127.0.0.1', () => console.log('가짜 웹 앱: http://127.0.0.1:8781/'));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
