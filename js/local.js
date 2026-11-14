// 범용판(/my/) 저장소: 기록은 쓰는 사람의 브라우저(IndexedDB)에 둔다. 책장을 만든 사람의 서버로 보내는 곳은 없다(책 찾기는 찾는 말만 구글 도서·오픈 라이브러리로 보낸다).
// 원하는 사람만 «내 구글 드라이브 연결»을 켠다. 그때는 본인 계정에서 돌아가는 앱스크립트(my/drive-sync.gs)를 거쳐 본인 드라이브의 파일 하나와 맞춘다.
// app.js가 쓰는 fb.js의 읽기·쓰기와 같은 모양을 맞췄다. 데이터 모양은 주인 Firebase의 bookshelf 칸과 같다.
const DB = 'my-bookshelf', STORE = 'kv', KEY = 'data', SYNC = 'sync', APP = 'my-bookshelf', VERSION = 1;
const KINDS = new Set(['book', 'film', 'show', 'trip', 'other', 'wishlist']);
let mem = null, memSync = null; // IndexedDB를 못 쓰는 창(일부 사생활 보호 모드)에서만 쓴다. 창을 닫으면 사라진다
let dbp;

const storeErr = (e) => { console.error(e); const x = new Error('save'); x.userMsg = '이 기기에 저장하지 못했어요. 저장 공간을 확인하고 다시 눌러 주세요. 쓴 내용은 그대로 있어요.'; return x; };
function open() {
  if (dbp) return dbp;
  dbp = new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
    r.onblocked = () => no(new Error('blocked'));
  });
  return dbp;
}
export const isVolatile = () => mem !== null;
async function getBoth() {
  if (mem) return [JSON.parse(JSON.stringify(mem)), JSON.parse(JSON.stringify(memSync || {}))];
  const db = await open();
  return await new Promise((ok, no) => {
    const st = db.transaction(STORE).objectStore(STORE), g = st.get(KEY), h = st.get(SYNC);
    h.onsuccess = () => ok([g.result || {}, h.result || {}]);
    h.onerror = g.onerror = () => no(g.error || h.error);
  });
}
export async function readPrivate() {
  try { return (await getBoth())[0]; } catch (e) { console.error(e); mem = {}; memSync = {}; return {}; }
}
const syncState = async () => { try { return (await getBoth())[1]; } catch (e) { return {}; } };

/* ---------- 고친 칸 기록 ---------- */
// 드라이브와 맞출 때 어느 쪽이 나중에 고쳤는지 보려고 칸(works/책id, library/책id, meta/이름 …)마다 고친 때를 남긴다.
// 연결하지 않아도 남긴다. 나중에 연결했을 때 이 기기에서 지운 책이 다시 살아나지 않게.
const keyOf = (path) => path.split('/').filter(Boolean).slice(0, 2).join('/');
function touch(s, keys) {
  const now = Date.now();
  s.touched = s.touched || {};
  keys.forEach((k) => { if (k) s.touched[k] = Math.max(now, (s.touched[k] || 0) + 1); });
  s.ver = (s.ver || 0) + 1;
  if (s.url) s.dirty = true;
}
// 다른 탭에서 고친 내용을 덮어쓰지 않게 한 트랜잭션 안에서 읽고 고쳐 쓴다. fn이 false를 돌려주면 쓰지 않는다
async function mutate(fn, keysOf) {
  if (mem) { memSync = memSync || {}; const keys = keysOf ? keysOf(mem) : null; if (fn(mem, memSync) !== false && keys) touch(memSync, keys); afterWrite(keys); return; }
  let keys = null;
  try {
    const db = await open();
    await new Promise((ok, no) => {
      const tx = db.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE), g = st.get(KEY), h = st.get(SYNC);
      h.onsuccess = () => {
        const d = g.result || {}, s = h.result || {};
        keys = keysOf ? keysOf(d) : null;
        if (fn(d, s) === false) return;
        if (keys) touch(s, keys);
        st.put(d, KEY); st.put(s, SYNC);
      };
      tx.oncomplete = ok;
      tx.onerror = tx.onabort = () => no(tx.error);
    });
    keep();
  } catch (e) { throw storeErr(e); }
  afterWrite(keys);
}
// 브라우저가 공간이 모자랄 때 먼저 지우지 않게 부탁한다(안 들어줘도 저장은 된다)
let asked = false;
function keep() { if (asked) return; asked = true; try { navigator.storage && navigator.storage.persist && navigator.storage.persist().catch(() => {}); } catch (e) {} }

const clone = (v) => (v === null || v === undefined ? null : JSON.parse(JSON.stringify(v)));
function setIn(d, path, value) {
  const parts = path.split('/').filter(Boolean);
  let o = d;
  for (const p of parts.slice(0, -1)) { if (!o[p] || typeof o[p] !== 'object') o[p] = {}; o = o[p]; }
  const last = parts[parts.length - 1];
  if (value === null) delete o[last]; else o[last] = value;
}
export const writePath = (path, value) => { const v = clone(value); return mutate((d) => setIn(d, path, v), () => [keyOf(path)]); };
export const updatePath = (path, value) => { const v = clone(value); return mutate((d) => Object.entries(v).forEach(([k, x]) => setIn(d, `${path}/${k}`, x)), () => Object.keys(v).map((k) => keyOf(`${path}/${k}`))); };
export async function newId() { return 'b' + Date.now().toString(36) + Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join(''); }
const keysIn = (d) => Object.entries(d || {}).flatMap(([g, v]) => (isObj(v) ? Object.keys(v).map((k) => `${g}/${k}`) : [g]));

/* ---------- 파일 백업 ---------- */
export async function exportText() {
  const data = await readPrivate();
  return JSON.stringify({ app:APP, version:VERSION, at:new Date().toISOString(), data });
}
export const markBackup = (day) => writePath('meta/lastBackup', day);

const str = (v) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''); // 저장할 때 제한이 없으니 복원할 때도 자르지 않는다
const day = (v) => { const s = str(v); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v.filter(isObj) : []);
const safeKey = (k) => /^[A-Za-z0-9_-]{1,80}$/.test(k) && !k.startsWith('__');
// 밑줄: 문장이 없는 칸은 버리고, id가 없거나 겹치면 새로 준다(고치기·지우기가 id로 찾는다)
function cleanMarks(list) {
  const seen = new Set();
  return arr(list).filter((m) => str(m.q).trim()).map((m, i) => {
    let id = str(m.id);
    if (!/^[A-Za-z0-9-]{1,40}$/.test(id) || seen.has(id)) id = `m${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 6)}`;
    seen.add(id);
    const o = { id, d:day(m.d), p:str(m.p), q:str(m.q), why:str(m.why) };
    if (m.pub === false) o.pub = false;
    const from = Array.isArray(m.from) ? m.from.filter((x) => typeof x === 'string' && safeKey(x)) : [];
    if (from.length) o.from = from;
    return o;
  });
}
function cleanWork(w) {
  const recs = arr(w.recs).map((r) => { const o = { d:day(r.d), r:typeof r.r === 'number' && Number.isInteger(r.r * 2) && r.r >= 0 && r.r <= 5 ? r.r : null, l:str(r.l), b:str(r.b) }; if (r.st === 'unread') o.st = 'unread'; const from = Array.isArray(r.from) ? r.from.filter((x) => typeof x === 'string' && safeKey(x)) : []; if (from.length) o.from = from; return o; });
  const o = { t:str(w.t), a:str(w.a), p:str(w.p), k:KINDS.has(w.k) ? w.k : 'book', th:Array.isArray(w.th) ? w.th.filter((x) => typeof x === 'string').slice(0, 21) : [], y:str(w.y).slice(0, 4), fd:day(w.fd) || str(w.fd).slice(0, 4), known:true, recs, notes:[] };
  const marks = cleanMarks(w.marks);
  if (marks.length) o.marks = marks;
  if (w.unread === true) o.unread = true;
  if (w.st === 'done') o.st = 'done';
  if (w.del === true) o.del = true;
  // 실물 책등(2026-11-14): [예스24 상품 번호, 책등 그림 가로/세로] 또는 0(색 책등으로)
  if (Array.isArray(w.y24) && /^\d{4,12}$/.test(String(w.y24[0])) && w.y24[1] > 0 && w.y24[1] < 1) o.y24 = [String(w.y24[0]), +w.y24[1]];
  else if (w.y24 === 0) o.y24 = 0;
  if (safeKey(str(w.into))) { // 겹치는 책 합치기 되돌리기용
    o.into = str(w.into);
    o.at = Number.isFinite(w.at) ? w.at : 0;
    if (isObj(w.was)) {
      o.was = { a:str(w.was.a), p:str(w.was.p), th:Array.isArray(w.was.th) ? w.was.th.filter((x) => typeof x === 'string').slice(0, 21) : [], y:str(w.was.y).slice(0, 4), fd:day(w.was.fd) || str(w.was.fd).slice(0, 4), known:true };
      if (w.was.unread === true) o.was.unread = true;
      if (w.was.t === '') o.was.t = '';
    }
  }
  return o;
}
function cleanLib(b) {
  return { t:str(b.t), a:str(b.a), p:str(b.p), w:safeKey(str(b.w)) ? str(b.w) : '', th:Array.isArray(b.th) ? b.th.filter((x) => typeof x === 'string').slice(0, 21) : [], st:b.st === 'in' ? 'in' : 'own', where:str(b.where), added:day(b.added),
    loans:arr(b.loans).map((l) => { const o = { dir:l.dir === 'in' ? 'in' : 'out', who:str(l.who), d:day(l.d), due:day(l.due) }; if (day(l.back)) o.back = day(l.back); return o; }) };
}
const cleanMap = (m, f) => (isObj(m) ? Object.fromEntries(Object.entries(m).filter(([k, v]) => safeKey(k) && isObj(v)).map(([k, v]) => [k, f(v)])) : {});
// 앱이 쓰는 칸만 골라 낸다(파일 불러오기와 드라이브에서 받은 기록이 같이 쓴다)
function cleanData(d) {
  const out = { works:cleanMap(d.works, cleanWork), library:cleanMap(d.library, cleanLib) };
  if (isObj(d.meta)) {
    out.meta = {};
    if (str(d.meta.name)) out.meta.name = str(d.meta.name).slice(0, 40);
    if (day(d.meta.lastBackup)) out.meta.lastBackup = day(d.meta.lastBackup);
    if (isObj(d.meta.notDup)) out.meta.notDup = Object.fromEntries(Object.keys(d.meta.notDup).filter((k) => /^[A-Za-z0-9_~-]{1,170}$/.test(k)).map((k) => [k, true]));
    // 책등 다시 찾기가 «사진 없음·맞는 판 없음»으로 확인해 둔 책(2026-11-14). 다음에 열 때 다시 찾지 않는다
    if (isObj(d.meta.y24tried)) out.meta.y24tried = Object.fromEntries(Object.entries(d.meta.y24tried).filter(([k, v]) => safeKey(k) && (v === 'noside' || v === 'nomatch')));
  }
  return out;
}
// 파일을 읽어 앱이 쓰는 칸만 골라 낸다. 맞는 파일이 아니면 userMsg가 붙은 오류를 던진다
export function parseBackup(text) {
  const bad = () => { const e = new Error('bad'); e.userMsg = '이 책장에서 저장한 파일이 아니에요. «파일로 저장»으로 만든 파일을 골라 주세요.'; return e; };
  let j;
  try { j = JSON.parse(text); } catch (e) { throw bad(); }
  if (!isObj(j) || j.app !== APP || !isObj(j.data)) throw bad();
  return cleanData(j.data);
}
// 파일에서 불러오기: 이 기기의 모든 칸을 새로 고친 것으로 친다(드라이브에 연결돼 있으면 파일 내용이 이긴다)
export const replaceAll = (data) => { const v = clone(data); return mutate((d) => { Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, v); }, (d) => [...new Set([...keysIn(d), ...keysIn(v)])]); };

/* ---------- 내 구글 드라이브와 맞추기 ---------- */
// 본인이 만든 앱스크립트 웹 앱(my/drive-sync.gs)과 기록 전체를 주고받는다. 칸마다 나중에 고친 쪽을 남기고(mergeData), 받은 기록은 파일 불러오기와 같은 기준으로 거른다.
// 서버는 판(rev)이 맞을 때만 받으므로 두 기기가 동시에 올려도 한쪽이 덮이지 않고 다시 합친다.
export const DRIVE_URL = /^https:\/\/script\.google\.com\/(?:a\/macros\/[^/\s]+|macros)\/s\/[A-Za-z0-9_-]{20,}\/exec$/;
const getKey = (d, key) => { const [g, k] = key.split('/'); const v = d ? d[g] : undefined; return k === undefined ? v : isObj(v) ? v[k] : undefined; };
function putKey(d, key, v) { const [g, k] = key.split('/'); if (k === undefined) { d[g] = v; return; } if (!isObj(d[g])) d[g] = {}; d[g][k] = v; }
// 칸마다: 고친 때가 더 늦은 쪽(지운 것도 포함)을 쓴다. 둘 다 기록이 없으면 값이 있는 쪽, 둘 다 있으면 드라이브 쪽
export function mergeData(L, Lt, R, Rt) {
  Lt = Lt || {}; Rt = Rt || {};
  const data = {}, touched = {}, keys = new Set([...keysIn(L), ...keysIn(R), ...Object.keys(Lt), ...Object.keys(Rt)]);
  for (const key of keys) {
    const lt = Lt[key] || 0, rt = Rt[key] || 0;
    let v;
    if (lt > rt) v = getKey(L, key);
    else if (rt > lt) v = getKey(R, key);
    else { v = getKey(R, key); if (v === undefined) v = getKey(L, key); }
    if (v !== undefined && v !== null) putKey(data, key, clone(v));
    if (lt || rt) touched[key] = Math.max(lt, rt);
  }
  return { data, touched };
}
const cleanTouched = (t) => (isObj(t) ? Object.fromEntries(Object.entries(t).filter(([k, v]) => /^[A-Za-z0-9_~-]{1,80}(?:\/[A-Za-z0-9_~-]{1,170})?$/.test(k) && Number.isFinite(v) && v > 0)) : {});
// 키 순서와 상관없이 같은지 본다
const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : isObj(v) ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v));
const dropEmpty = (d) => Object.fromEntries(Object.entries(d || {}).filter(([, v]) => !(isObj(v) && !Object.keys(v).length))); // 빈 칸(library:{})이 있고 없고는 같은 기록이다
const same = (a, b) => stable(dropEmpty(a)) === stable(dropEmpty(b));

let listeners = [], status = { on:false, busy:false, err:'', at:'' }, timer = 0, running = null, again = false;
export const onSync = (fn) => { listeners.push(fn); };
const emit = (ev) => listeners.forEach((fn) => { try { fn(ev, { ...status }); } catch (e) { console.error(e); } });
export const syncStatus = () => ({ ...status });
function afterWrite(keys) { if (keys && status.on) later(1500); }
function later(ms) { clearTimeout(timer); timer = setTimeout(() => { syncNow().catch(() => {}); }, ms); }

const failMsg = (e) => e.userMsg || '드라이브와 맞추지 못했어요. 인터넷을 확인해 주세요. 기록은 이 기기에 그대로 있어요.';
const oops = (m) => { const e = new Error('sync'); e.userMsg = m; return e; };
async function call(url, body) {
  if (navigator.onLine === false) throw oops('인터넷이 끊겨 있어요. 연결되면 알아서 다시 맞춰요.');
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 30000);
  let r;
  try { r = await fetch(url, body ? { method:'POST', body:JSON.stringify(body), signal:ctl.signal } : { signal:ctl.signal, cache:'no-store' }); }
  catch (e) { throw oops(e.name === 'AbortError' ? '드라이브 응답이 늦어요. 잠시 뒤 다시 맞춰 볼게요.' : '드라이브 주소에 닿지 못했어요. 웹 앱 액세스 권한이 «모든 사용자»인지 확인해 주세요.'); }
  finally { clearTimeout(t); }
  let j = null;
  try { j = await r.json(); } catch (e) { /* 로그인 화면 같은 HTML이 오면 여기로 */ }
  const ours = j && (body ? (!j.app || j.app === 'my-bookshelf-sync') : j.app === 'my-bookshelf-sync'); // 받기 답에는 이름표가 있고, 올리기 답에는 없다
  if (!ours) throw oops('나의 책장 연결 코드가 아니에요. 웹 앱 액세스 권한이 «모든 사용자»인지, 코드를 그대로 붙여 넣었는지 확인해 주세요.');
  if (j.ok === false && !j.conflict) throw oops('드라이브에 저장하지 못했어요. 잠시 뒤 다시 맞춰 볼게요.');
  return j;
}
// 한 번 맞추기: 받기 → 합치기 → (바뀌었으면) 이 기기에 쓰기 → (드라이브와 다르면) 올리기
async function syncOnce() {
  let st = await syncState();
  if (!st.url) return false;
  for (let i = 0; i < 4; i++) {
    const remote = await call(st.url);
    const R = remote.payload && isObj(remote.payload.data) ? cleanData(remote.payload.data) : null, Rt = R ? cleanTouched(remote.payload.touched) : {};
    const [L, s] = await getBoth();
    if (s.url !== st.url) return false; // 그사이 연결을 끊었거나 바꿨다
    if (R && remote.rev === s.rev && !s.dirty) return false; // 바뀐 게 없다
    const m = R ? mergeData(cleanData(L), s.touched, R, Rt) : { data:cleanData(L), touched:s.touched || {} };
    const local = !same(m.data, cleanData(L)); // 앱이 저장한 칸에는 기록에 안 쓰는 값(id 등)이 있어, 거른 값끼리 견준다(안 그러면 저장할 때마다 «받은 기록»으로 쳐 책 창이 닫힌다)
    if (local) { // 기록하는 동안 이 기기에서 또 고쳤으면 처음부터 다시
      let moved = false;
      await mutate((d, x) => { if ((x.ver || 0) !== (s.ver || 0)) { moved = true; return false; } Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, clone(m.data)); x.touched = m.touched; });
      if (moved) { st = s; continue; }
      emit('pulled');
    }
    let rev = remote.rev;
    if (!R || !same(m.data, R) || !same(m.touched, Rt)) {
      const put = await call(st.url, { op:'put', base:remote.rev, payload:{ app:APP, version:VERSION, data:m.data, touched:m.touched } });
      if (put.conflict) { st = s; continue; } // 다른 기기가 먼저 올렸다. 다시 받아 합친다
      rev = put.rev;
    }
    let moved = false;
    await mutate((d, x) => { moved = (x.ver || 0) !== (s.ver || 0); x.rev = rev; x.at = new Date().toISOString(); if (!moved) { x.dirty = false; x.touched = m.touched; } });
    if (moved) { st = s; continue; } // 올리는 사이 또 고쳤으면 그것도 마저 올린다
    return true;
  }
  throw oops('다른 기기와 동시에 고치고 있어서 맞추지 못했어요. 잠시 뒤 다시 맞춰 볼게요.');
}
export async function syncNow() {
  if (running) { again = true; return running; }
  status = { ...status, busy:true }; emit('busy');
  running = (async () => {
    try { do { again = false; await syncOnce(); } while (again); status = { ...status, busy:false, err:'', at:new Date().toISOString() }; emit('done'); }
    catch (e) { console.error(e); status = { ...status, busy:false, err:failMsg(e) }; emit('error'); later(60000); throw e; }
    finally { running = null; }
  })();
  return running;
}
// 앱이 열릴 때: 연결돼 있으면 상태를 켜고 맞춘다
let wired = false;
function wire() {
  if (wired) return; wired = true;
  addEventListener('online', () => { if (status.on) later(500); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && status.on) later(300); });
}
export async function initSync() {
  const s = await syncState();
  status = { on:!!s.url, busy:false, err:'', at:s.at || '' };
  if (!s.url) return;
  wire();
  syncNow().catch(() => {});
}
// 주소를 시험하고 저장한 뒤 바로 맞춘다. 드라이브에 이미 기록이 있으면 합친다
export async function connectDrive(url) {
  url = String(url || '').trim();
  if (!DRIVE_URL.test(url)) throw oops('웹 앱 주소가 아니에요. «https://script.google.com/macros/s/…/exec» 모양의 주소를 붙여 넣어 주세요.');
  const probe = await call(url);
  await mutate((d, s) => { s.url = url; s.rev = null; s.dirty = true; });
  status = { on:true, busy:false, err:'', at:'' };
  wire();
  await syncNow();
  const w = probe.payload && isObj(probe.payload.data) && isObj(probe.payload.data.works) ? probe.payload.data.works : {};
  return { had:Object.values(w).filter((x) => isObj(x) && !x.del).length };
}
export const driveUrl = async () => (await syncState()).url || '';
export async function disconnectDrive() {
  clearTimeout(timer);
  await mutate((d, s) => { delete s.url; delete s.rev; delete s.at; s.dirty = false; });
  status = { on:false, busy:false, err:'', at:'' };
  emit('off');
}
