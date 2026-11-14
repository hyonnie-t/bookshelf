// 책등 다시 찾기의 판정·묶음 나누기(2026-11-14, 효니 «일괄 다시 찾기를 하고 내가 선택하게 해줘야지 하나씩 언제 누르고 있냐»).
// 앱(js/app.js «책등 다시 찾기»·«책등 바꾸기»)과 시험(tools/test-spine-tool.js)이 같이 쓴다. 다른 파일을 불러오지 않는다.

// 제목·저자 비교용: 괄호 속(판 이름·총서명)과 띄어쓰기·문장부호를 뺀다
export const coverNorm = (s) => String(s || '').replace(/\(.*?\)|\[.*?\]/g, '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
const mainTitle = (t) => String(t || '').split(/\s*:\s*/)[0];
const firstAuthor = (a) => String(a || '').split(/[,·/]/)[0].replace(/\s+외$/, '');

// 예스24 판 b가 책 w와 맞나: 제목이 같거나 한쪽이 다른 쪽으로 시작하고, 책에 저자가 있으면 판의 저자 칸에 첫 저자가 들어 있다
export function spineFit(w, b) {
  const t = coverNorm(mainTitle(w.t)), a = coverNorm(firstAuthor(w.a)), x = coverNorm(b.title);
  if (!t || !x) return false;
  return (x === t || x.startsWith(t) || t.startsWith(x)) && (!a || coverNorm((b.authors || []).join()).includes(a));
}

// 창을 열 때 네트워크 없이 대상을 둘로 나눈다.
// known: 예스24 자동 찾기(data/y24.json miss)가 «책등 사진 없음»으로 확인했거나, 앱의 지난 찾기가 사진 없음·맞는 판 없음으로 남긴(meta/y24tried) 책
// todo: 그 밖의 책. again이 true면 known도 todo에 넣는다(«다시 찾아보기», 예스24에 사진이 새로 올라올 수 있다)
export function splitTargets(targets, miss = {}, tried = {}, again = false) {
  const todo = [], known = [];
  targets.forEach((w) => ((!again && (miss[w.id] === 'noside' || tried[w.id])) ? known : todo).push(w));
  return { todo, known };
}
// 지난번에 찾아본 까닭(앱이 남긴 값이 먼저)
export const triedWhy = (id, miss = {}, tried = {}) => tried[id] || miss[id] || '';

// 한 권을 찾은 결과를 정리한다. books: 예스24 판(상품 번호 y24가 있는 것만), photo: 판 번호 → 책등 비율(사진 없으면 없음).
// status: found(맞는 판에 사진 있음, pick에 미리 고름) / pick(사진은 있는데 제목·저자가 안 맞음, 직접 고르기) / none(why: nomatch 맞는 판 없음, noside 사진 없음)
export function spineResult(w, books, photo) {
  const sorted = [...books].sort((x, y) => spineFit(w, y) - spineFit(w, x)).slice(0, 6);
  if (!sorted.length) return { status:'none', why:'nomatch', cands:[], pick:null };
  const cands = sorted.filter((b) => photo[b.y24]).map((b) => ({ no:String(b.y24), ratio:photo[b.y24], title:b.title, publisher:b.publisher || '', year:b.year || '', fit:spineFit(w, b) }));
  if (!cands.length) return { status:'none', why:'noside', cands:[], pick:null };
  const first = cands.find((c) => c.fit);
  return first ? { status:'found', why:'', cands, pick:first.no } : { status:'pick', why:'', cands, pick:null };
}

// 결과를 세 묶음으로(찾는 동안 실패한 책 fail은 «못 찾았어요»에 넣되 기억하지 않는다)
export function groupResults(results) {
  const g = { found:[], pick:[], none:[] };
  results.forEach((r) => (r.status === 'found' ? g.found : r.status === 'pick' ? g.pick : g.none).push(r));
  return g;
}
// 기억할 값: 사진 없음·맞는 판 없음으로 끝난 책만 {id: 'noside'|'nomatch'}. 받기 실패(fail)는 다음에 다시 찾게 남기지 않는다
export const triedPatch = (results) => Object.fromEntries(results.filter((r) => r.status === 'none' && r.why).map((r) => [r.w.id, r.why]));
// 지난번 기억 가운데 이번에 사진 있는 판을 찾은 책은 지운다(null = 지우기)
export const triedClear = (results, tried = {}) => Object.fromEntries(results.filter((r) => (r.status === 'found' || r.status === 'pick') && tried[r.w.id]).map((r) => [r.w.id, null]));
// 저장할 값: 고른 판이 있는 결과만 {id: [번호, 비율]}. 주소로 넣은 판(manual)이 사진 고르기보다 먼저다
export function pickedSpines(results) {
  const out = {};
  results.forEach((r) => {
    if (r.manual) { out[r.w.id] = r.manual; return; }
    const c = r.pick && r.cands.find((x) => x.no === r.pick);
    if (c && c.ratio) out[r.w.id] = [c.no, c.ratio];
  });
  return out;
}
