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
// 로그인 버튼이 보일 때 미리 불러 둔다. 눌린 뒤에 불러오면 사파리가 팝업을 막는다(누름 동작이 끊김).
export function warm() { load().catch(() => {}); }
// 아이폰 홈 화면 앱은 로그인 팝업의 결과를 돌려받지 못한다. 그때는 구글 로그인 페이지로 이동했다가
// 주소 뒤 #id_token 으로 돌아오는 방식을 쓴다(구글 클라우드 콘솔에 아래 REDIRECT 주소를 허용해 둬야 한다).
const CLIENT = '797690266953-4eeq083i7vukr0hgi0kqteni30kbj8k8.apps.googleusercontent.com'; // 공개 값(파이어베이스 웹 클라이언트)
const REDIRECT = 'https://hyonnie-t.github.io/bookshelf/';
const NONCE = 'shelf-nonce';
export const isStandalone = () => navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
export function startRedirect() {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  try { localStorage.setItem(NONCE, nonce); } catch (e) {}
  const q = new URLSearchParams({ client_id: CLIENT, redirect_uri: REDIRECT, response_type: 'id_token', scope: 'openid email profile', nonce, prompt: 'select_account' });
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + q);
}
// 돌아온 주소의 #id_token 을 꺼내고 주소에서 지운다(토큰은 어디에도 출력하지 않는다)
export function takeIdToken() {
  if (!/[#&]id_token=/.test(location.hash)) return '';
  const tok = new URLSearchParams(location.hash.slice(1)).get('id_token') || '';
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  return tok;
}
export async function finishRedirect(idToken) {
  let p = {};
  try { p = JSON.parse(decodeURIComponent(escape(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch (e) { throw new Error('bad token'); }
  let want = ''; try { want = localStorage.getItem(NONCE) || ''; localStorage.removeItem(NONCE); } catch (e) {}
  if (!want || p.nonce !== want || p.aud !== CLIENT) throw new Error('nonce mismatch');
  const s = await load();
  const r = await s.authM.signInWithCredential(s.auth, s.authM.GoogleAuthProvider.credential(idToken));
  if (!isOwner(r.user)) { await s.authM.signOut(s.auth); return null; }
  flag.set(true);
  return r.user;
}
export async function signIn() {
  if (isStandalone()) { startRedirect(); return 'redirect'; }
  const s = sdk || await load();
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
