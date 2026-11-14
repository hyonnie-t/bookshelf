// 읽는 중 ↔ 다 읽음(2026-11-14 «책 고치기» 한 창). 앱(js/app.js)과 tools/test-reading-form.js가 같이 쓴다. 다른 파일을 불러오지 않는다.
// 다 읽은 기록이 있으면 그 기록이 먼저다(읽는 중이 아님). tools/publish.js의 st:'reading'·다 읽음 판정과 같은 기준이다.
export const hasDoneRec = (w) => (w.recs || []).some((r) => r.st !== 'unread');
export const isReading = (w) => w.k === 'book' && !hasDoneRec(w) && (w.st === 'reading' || !!w.unread || (w.recs || []).some((r) => r.st === 'unread') || (w.notes || []).some((n) => n.s === 'reading'));
// 다 읽은 기록이 없는 책만 읽는 중 표시를 켜고 끌 수 있다
export const canMarkReading = (w) => !!w && (w.k || 'book') === 'book' && !hasDoneRec(w);

// 표시만 바꾼다(기록은 그대로). w를 바로 고친다
export function setReading(w, on) {
  if (on) { w.unread = true; if (w.st === 'done') delete w.st; return; }
  delete w.unread;
  w.st = 'done'; // 다 읽음 표시. 공개본의 st:'reading'은 지워도 rebuild에서 다시 섞이므로 값으로 덮고, tools/publish.js는 이 값을 다 읽은 책으로 친다
  w.notes = (w.notes || []).map((n) => (n.s === 'reading' ? (({ s, ...rest }) => rest)(n) : n));
}

// 가장 최근 미완독 기록의 자리(날짜가 같으면 뒤에 있는 것, 날짜 없는 기록은 날짜 있는 기록보다 옛것으로 친다). 없으면 -1
export function lastUnreadAt(w) {
  let at = -1;
  (w.recs || []).forEach((r, i) => { if (r.st === 'unread' && (at < 0 || (r.d || '') >= (w.recs[at].d || ''))) at = i; });
  return at;
}

// «책 고치기» 창의 읽기 상태를 저장할 칸으로 바꾼다. state: 'reading'|'done', d: 다 읽은 날, r: 별점(null이면 남기지 않음)
// - 다 읽은 기록이 있는 책: 바꾸지 않는다(창에서 «다 읽음» 고정, 다시 읽으면 «기록 더하기»)
// - 미완독 기록이 있는 책 → 다 읽음: 가장 최근 미완독 기록을 다 읽은 기록으로 바꾼다(st 지움, 날짜·별점은 창 값). 새 기록을 더하지 않는다(효니 선택 2026-11-14)
// - 기록 없이 읽는 중 → 다 읽음: 표시만 바꾸고, 다 읽은 날이나 별점을 넣었으면 다 읽은 기록을 하나 더한다
// - 다 읽음 → 읽는 중: 표시만 켠다
export function readingPatch(w, state, { d = '', r = null } = {}) {
  const next = { ...w, recs:[...(w.recs || [])], notes:[...(w.notes || [])] };
  if (w.k !== 'book' || hasDoneRec(w)) return next;
  const now = isReading(w) ? 'reading' : 'done';
  if (state === now) return next;
  if (state === 'reading') { setReading(next, true); return next; }
  const at = lastUnreadAt(w);
  if (at >= 0) {
    const rec = { ...next.recs[at], d:d || next.recs[at].d || '', r };
    delete rec.st;
    next.recs[at] = rec;
  } else if (d || r != null) next.recs.push({ d, r, l:'', b:'' });
  setReading(next, false);
  return next;
}
