// 겹치는 책 합치기·되돌리기·시리즈 판정(2026-11-14, 효니 «책 기록이 잘못합쳐지는 경우 수정 필요»).
// 앱(js/app.js)은 쓰기·화면만 하고, 무엇이 어떻게 바뀌는지는 여기서 정한다. 시험 tools/test-merge.js. 다른 파일을 불러오지 않는다.
//
// 칸 구조(비공개 works/{id}): recs·notes·archived·marks 글 목록, t a p th known guess unread only y fd y24 책 정보.
// 합치면 옮긴 글에 from:[…빠진 id]를 달고, 빠지는 칸은 del:true, into, at, was:{남는 칸의 합치기 전 값}, dupRecs(같은 기록으로 하나만 남긴 짝)를 갖는다.
// 같은 기록으로 하나만 남긴 기록에는 mix:[…'빠진id.번호']를 달아 되돌릴 때 dupRecs[번호]로 원래 두 기록을 돌려놓는다.

const len = (s) => String(s == null ? '' : s).length;
const blank = (v) => v == null || v === '';
const earliest = (x, y) => [x, y].filter(Boolean).sort()[0] || '';
const byDate = (x, y) => String(x.d || '').localeCompare(String(y.d || ''));
const tagFrom = (id) => (x) => ({ ...x, from:[...(x.from || []), id] });
const clone = (v) => JSON.parse(JSON.stringify(v));

// 같은 독서를 두 칸에 따로 적은 기록: 날짜가 같고(빈 날짜는 아님), 미완독 여부가 같고, 별점이 같거나 한쪽이 비었다
export function sameRec(a, b) {
  if (!a || !b || !a.d || a.d !== b.d) return false;
  if ((a.st === 'unread') !== (b.st === 'unread')) return false;
  return a.r == null || b.r == null || a.r === b.r;
}
// 하나만 남길 때: 글(b)이 더 긴 쪽(같으면 한 줄 평 l이 더 긴 쪽, 그것도 같으면 남는 칸 쪽)을 바탕으로, 빈 칸은 다른 쪽에서 채운다.
// 공개 여부·출처(from)는 남는 칸 기록을 따른다(나만 보기 기록이 합치기로 공개되지 않게)
function combine(k, d, tag) {
  const main = len(d.b) > len(k.b) || (len(d.b) === len(k.b) && len(d.l) > len(k.l)) ? d : k, other = main === k ? d : k;
  const o = { ...main };
  ['r', 'l', 'b', 'cd', 'rd'].forEach((f) => { if (blank(o[f]) && !blank(other[f])) o[f] = other[f]; });
  delete o.pub; if (k.pub) o.pub = k.pub;
  delete o.from; if (k.from) o.from = k.from;
  o.mix = [...(k.mix || []), tag];
  return o;
}
// 기록 합치기: dedupe면 같은 기록 짝을 하나로. dup은 [{k: 남는 칸 원래 기록, d: 빠지는 칸 원래 기록}]
export function mergeRecs(keepRecs, dropRecs, dropId, dedupe) {
  const out = keepRecs.map((r) => ({ ...r })), used = new Set(), dup = [];
  dropRecs.forEach((r) => {
    const j = dedupe ? keepRecs.findIndex((x, i) => !used.has(i) && sameRec(x, r)) : -1;
    if (j < 0) { out.push(tagFrom(dropId)(r)); return; }
    used.add(j);
    out[j] = combine(keepRecs[j], r, `${dropId}.${dup.length}`);
    dup.push({ k:clone(keepRecs[j]), d:clone(r) });
  });
  return { recs:out.sort(byDate), dup };
}
// 같은 기록으로 볼 짝 수(미리보기용)
export const dupCount = (keepRecs, dropRecs) => mergeRecs(keepRecs, dropRecs, '_', true).dup.length;

// 합치기 계획. opt: { t, a, p: 'keep'|'drop'(둘 다 있고 다를 때 고른 쪽), dedupe, lock(빠지는 칸 책 정보를 안 옮김), spine([번호, 비율] 이어 줄 책등), now }
// 돌려주는 것: next(남는 칸), gone(빠지는 칸), dups(하나로 합친 기록 수)
export function mergePlan(keep, drop, opt = {}) {
  const src = opt.lock ? { ...drop, t:'', a:'', p:'', th:[], known:false, guess:false, y:'', fd:'' } : drop;
  const tag = tagFrom(drop.id);
  const { recs, dup } = mergeRecs(keep.recs || [], drop.recs || [], drop.id, !!opt.dedupe);
  const pick = (f) => { const k = keep[f] || '', d = src[f] || ''; return opt[f] === 'drop' && d ? d : (k || d); };
  const next = { ...keep, t:pick('t'), a:pick('a'), p:pick('p'), recs,
    notes:[...(keep.notes || []), ...(drop.notes || []).map(tag)], archived:[...(keep.archived || []), ...(drop.archived || []).map(tag)], marks:[...(keep.marks || []), ...(drop.marks || []).map(tag)],
    th:[...new Set([...(keep.th || []), ...(src.th || [])])], known:!!(keep.known || src.known), y:earliest(keep.y, src.y), fd:earliest(keep.fd, src.fd) };
  if (recs.length) { if (recs.every((r) => r.st === 'unread')) next.unread = true; else delete next.unread; }
  else if (keep.unread || drop.unread) next.unread = true;
  if (keep.guess && src.known && !src.guess) delete next.guess; // 확인된 책과 합쳤으면 더는 추정이 아니다
  if (keep.only || drop.only) next.only = true; // 한쪽이라도 나만 보기로 잠갔으면 합친 뒤에도 잠근다
  const was = { a:keep.a || '', p:keep.p || '', th:keep.th || [], known:keep.known, unread:keep.unread, guess:keep.guess, only:keep.only, y:keep.y || '', fd:keep.fd || '' };
  if (next.t !== (keep.t || '')) was.t = keep.t || '';
  if (opt.spine) { next.y24 = opt.spine; was.y24c = true; was.y24 = keep.y24 === undefined ? 'none' : keep.y24; } // 'none': 합치기 전에 y24 칸이 없었음(null은 저장소가 지운다)
  const gone = { ...drop, recs:[], notes:[], archived:[], marks:[], del:true, into:keep.id, at:opt.now || 0, was };
  if (dup.length) gone.dupRecs = dup;
  return { next, gone, dups:dup.length };
}

const cameFrom = (x, id) => (x.from || []).slice(-1)[0] === id;
const stepBack = ({ from, ...x }) => { const rest = (from || []).slice(0, -1); return rest.length ? { ...x, from:rest } : x; };
const mixOf = (x, id) => { const m = (x.mix || []).slice(-1)[0]; return typeof m === 'string' && m.startsWith(id + '.') ? +m.slice(id.length + 1) : -1; };
// 이 칸에서 옮겨 온 글 수(«합친 책» 줄에 보임)
export function movedCounts(keep, id) {
  const n = (xs) => (xs || []).filter((x) => cameFrom(x, id)).length;
  return { recs:n(keep.recs) + (keep.recs || []).filter((x) => mixOf(x, id) >= 0).length, notes:n(keep.notes) + n(keep.archived), marks:n(keep.marks) };
}
// 되돌리기 계획: stored(빠진 칸, 저장된 값), keep(남은 칸, 저장된 값), id(빠진 칸 id) → next(남은 칸), back(살아나는 칸)
export function undoPlan(stored, keep, id) {
  const { del, into, was, at, dupRecs, ...rest } = stored;
  const dups = Array.isArray(dupRecs) ? dupRecs : [];
  const recs = keep.recs || [], notes = keep.notes || [], archived = keep.archived || [], marks = keep.marks || [];
  const keepRecs = recs.filter((x) => !cameFrom(x, id)).map((x) => { const n = mixOf(x, id); return n >= 0 && dups[n] ? dups[n].k : x; });
  const backRecs = [...recs.filter((x) => cameFrom(x, id)).map(stepBack), ...dups.map((x) => x.d)].sort(byDate);
  const back = clone({ ...rest, recs:backRecs, notes:notes.filter((x) => cameFrom(x, id)).map(stepBack), archived:archived.filter((x) => cameFrom(x, id)).map(stepBack), marks:marks.filter((x) => cameFrom(x, id)).map(stepBack) });
  const { y24c, y24, ...wasRest } = was || {};
  const next = clone({ ...keep, ...wasRest, th:(was && was.th) || [], recs:keepRecs.sort(byDate), notes:notes.filter((x) => !cameFrom(x, id)), archived:archived.filter((x) => !cameFrom(x, id)), marks:marks.filter((x) => !cameFrom(x, id)) });
  ['unread', 'guess', 'known', 'only'].forEach((k) => { if (!was || was[k] === undefined) delete next[k]; }); // 합치기 전에 없던 표시는 지운다
  if (y24c) { if (y24 === 'none') delete next.y24; else next.y24 = y24; }
  return { next, back };
}

// 시리즈 판정: 한쪽 제목이 다른 쪽 제목 + 권 표시(끝의 숫자, n권, (1), 1,2, 상·중·하, n부, 전n권, «. 4: 부제»)일 때
const dupNorm = (s) => (s || '').replace(/[\s:·,.\-()«»"'!?~]/g, '').toLowerCase();
const VOL_TAIL = /(?:[\s.:,]*(?:\(\s*\d+\s*\)|제?\s*\d+(?:\s*[,~-]\s*\d+)*\s*(?:권|부|편)?|전\s*\d+\s*권)|[\s.:,]+[상중하](?:권)?)(?:\s*[-:.]\s*.*)?$/;
export function seriesPair(ta, tb) {
  const a = String(ta || '').trim(), b = String(tb || '').trim();
  if (!a || !b || dupNorm(a) === dupNorm(b)) return false;
  const [short, long] = dupNorm(a).length <= dupNorm(b).length ? [a, b] : [b, a];
  const head = long.replace(VOL_TAIL, '');
  return head !== long && dupNorm(head).length >= 1 && dupNorm(head) === dupNorm(short);
}
