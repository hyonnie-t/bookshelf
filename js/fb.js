// 주인 로그인과 비공개 기록 읽기·쓰기. 시간표 앱과 같은 Firebase 프로젝트의 users/{uid}/bookshelf 만 쓴다.
// 그 경로는 규칙상 본인만 읽고 쓸 수 있다. Firebase는 처음 필요할 때 불러온다(공개 화면은 로그인 없이 빠르게 열리게).
const OWNER_UID = 'uPzJdaRI9JSHxy0IX0PyUMeXR963';
const V = '10.12.0';
const config = {
  apiKey: 'AIzaSyBJnR447EvbToLxtRAHFNtSlhkg61QkdfA',
  authDomain: 'timetable-af612.firebaseapp.com',
  projectId: 'timetable-af612',
  appId: '1:797690266953:web:bfd4ba739900b625090698',
  databaseURL: 'https://timetable-af612-default-rtdb.firebaseio.com',
};
let sdk;
async function load() {
  if (sdk) return sdk;
  const [appM, authM, dbM] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-database.js`),
  ]);
  const app = appM.initializeApp(config, 'bookshelf'); // 이름을 따로 줘 같은 주소의 시간표 앱 로그인과 섞이지 않게 한다
  const auth = authM.initializeAuth(app, {
    persistence: [authM.indexedDBLocalPersistence, authM.browserLocalPersistence],
    popupRedirectResolver: authM.browserPopupRedirectResolver,
  });
  sdk = { authM, dbM, auth, db: dbM.getDatabase(app) };
  return sdk;
}
const root = (s) => s.dbM.ref(s.db, `users/${OWNER_UID}/bookshelf`);
const child = (s, p) => s.dbM.child(root(s), p);

export const isOwner = (user) => !!user && user.uid === OWNER_UID;

// 이미 로그인한 적이 있을 때만 Firebase를 미리 불러온다(방문자는 불러오지 않음)
const FLAG = 'shelf-owner';
const flag = { get() { try { return localStorage.getItem(FLAG) === '1'; } catch (e) { return false; } }, set(v) { try { v ? localStorage.setItem(FLAG, '1') : localStorage.removeItem(FLAG); } catch (e) {} } };

export async function watchAuth(cb) {
  if (!flag.get()) return cb(null);
  const s = await load();
  s.authM.onAuthStateChanged(s.auth, cb);
}
export async function signIn() {
  const s = await load();
  const r = await s.authM.signInWithPopup(s.auth, new s.authM.GoogleAuthProvider());
  if (!isOwner(r.user)) { await s.authM.signOut(s.auth); return null; }
  flag.set(true);
  return r.user;
}
export async function signOutOwner() {
  const s = await load();
  flag.set(false);
  await s.authM.signOut(s.auth);
}
export async function readPrivate() {
  const s = await load();
  const snap = await s.dbM.get(root(s));
  return snap.val() || {};
}
export async function writePath(path, value) {
  const s = await load();
  await s.dbM.set(child(s, path), value);
}
export async function updatePath(path, value) {
  const s = await load();
  await s.dbM.update(child(s, path), value);
}
export async function newId(path = 'works') {
  const s = await load();
  return s.dbM.push(child(s, path)).key;
}
