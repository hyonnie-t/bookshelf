// 범용판(/my/) 저장소: 기록을 쓰는 사람의 브라우저(IndexedDB)에만 둔다. 기록을 서버로 보내는 곳이 없다(책 찾기는 찾는 말만 구글 도서·오픈 라이브러리로 보낸다).
// app.js가 쓰는 fb.js의 읽기·쓰기와 같은 모양을 맞췄다. 데이터 모양은 주인 Firebase의 bookshelf 칸과 같다.
const DB = 'my-bookshelf', STORE = 'kv', KEY = 'data', APP = 'my-bookshelf', VERSION = 1;
const KINDS = new Set(['book', 'film', 'show', 'trip', 'other', 'wishlist']);
let mem = null; // IndexedDB를 못 쓰는 창(일부 사생활 보호 모드)에서만 쓴다. 창을 닫으면 사라진다
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
export async function readPrivate() {
  if (mem) return JSON.parse(JSON.stringify(mem));
  try {
    const db = await open();
    return await new Promise((ok, no) => {
      const g = db.transaction(STORE).objectStore(STORE).get(KEY);
      g.onsuccess = () => ok(g.result || {});
      g.onerror = () => no(g.error);
    });
  } catch (e) { console.error(e); mem = {}; return {}; }
}
// 다른 탭에서 고친 내용을 덮어쓰지 않게 한 트랜잭션 안에서 읽고 고쳐 쓴다
async function mutate(fn) {
  if (mem) { fn(mem); return; }
  try {
    const db = await open();
    await new Promise((ok, no) => {
      const tx = db.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE), g = st.get(KEY);
      g.onsuccess = () => { const d = g.result || {}; fn(d); st.put(d, KEY); };
      tx.oncomplete = ok;
      tx.onerror = tx.onabort = () => no(tx.error);
    });
    keep();
  } catch (e) { throw storeErr(e); }
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
export const writePath = (path, value) => { const v = clone(value); return mutate((d) => setIn(d, path, v)); };
export const updatePath = (path, value) => { const v = clone(value); return mutate((d) => Object.entries(v).forEach(([k, x]) => setIn(d, `${path}/${k}`, x))); };
export async function newId() { return 'b' + Date.now().toString(36) + Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join(''); }

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
  if (w.del === true) o.del = true;
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
// 파일을 읽어 앱이 쓰는 칸만 골라 낸다. 맞는 파일이 아니면 userMsg가 붙은 오류를 던진다
export function parseBackup(text) {
  const bad = () => { const e = new Error('bad'); e.userMsg = '이 책장에서 저장한 파일이 아니에요. «파일로 저장»으로 만든 파일을 골라 주세요.'; return e; };
  let j;
  try { j = JSON.parse(text); } catch (e) { throw bad(); }
  if (!isObj(j) || j.app !== APP || !isObj(j.data)) throw bad();
  const d = j.data, out = { works:cleanMap(d.works, cleanWork), library:cleanMap(d.library, cleanLib) };
  if (isObj(d.meta)) {
    out.meta = { name:str(d.meta.name).slice(0, 40), lastBackup:day(d.meta.lastBackup) };
    if (isObj(d.meta.notDup)) out.meta.notDup = Object.fromEntries(Object.keys(d.meta.notDup).filter((k) => /^[A-Za-z0-9_~-]{1,170}$/.test(k)).map((k) => [k, true]));
  }
  return out;
}
export const replaceAll = (data) => { const v = clone(data); return mutate((d) => { Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, v); }); };
