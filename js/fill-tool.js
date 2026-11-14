// 빈 칸 채우기·다시 찾기의 판정(2026-11-15, 효니 쪽지 «yes24로 못 찾았을 때 대안», «빈 칸 채우기 오탈자로 거기서 다시 재검색»).
// 앱(js/app.js «빈 칸 채우기»·«책등 다시 찾기»·책 찾기)과 시험(tools/test-fill-tool.js)이 같이 쓴다. 다른 파일을 불러오지 않는다.

const squeeze = (s) => (s || '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase(); // js/app.js squeeze와 같다
// 권 표시 괄호는 남긴다(tools/fill-info.js와 같음)
export const bareTitle = (s) => squeeze(String(s || '').replace(/\(([^)]*)\)|\[([^\]]*)\]/g, (m, a, b) => (/\d|^\s*[상중하]\s*$/.test(a || b || '') ? m : '')));

// 책 찾기 출처 순서: 예스24 → 국립중앙도서관 → (효니 책장만) 카카오. 카카오는 2026-11-14 «예비로 1~2주 뒤 빼기» 결정이 있어 맨 뒤
export const relayChain = (local) => (local ? ['y24', 'nl'] : ['y24', 'nl', '']);
export const SRC_NAME = { y24:'예스24 책 검색', nl:'국립중앙도서관 소장자료 검색', '':'카카오 책 검색' };

// 출처마다 물은 결과([{src, rows} 또는 {src, err}], 물은 순서대로)에서 쓸 것을 고른다.
// 결과가 있는 첫 출처 → 없으면(모두 0건이거나 일부 실패) 빈 목록 → 모두 실패면 마지막 오류를 던진다(빈 칸 채우기의 «찾기 실패»)
export function pickSource(tries) {
  const hit = tries.find((x) => !x.err && (x.rows || []).length);
  if (hit) return { rows:hit.rows, src:hit.src };
  const ok = tries.filter((x) => !x.err);
  if (ok.length) return { rows:[], src:ok[ok.length - 1].src };
  throw (tries[tries.length - 1] || {}).err || new Error('relay');
}
// 다음 출처로 넘어가야 하나(결과가 있으면 멈춘다)
export const needNext = (x) => !!x.err || !(x.rows || []).length;

const firstOf = (a) => squeeze(String(a || '').split(',')[0]);
// 한 권의 찾은 결과 판정(빈 칸 채우기 fillRow와 같은 규칙). rows: [{t, a, p}], w: {t}, fa: 첫 저자
// status: sure(제목·저자가 맞는 첫 결과) / check(확인 필요) / none(맞는 책 없음). c: 고른 후보
export function judgeFill(w, rows, fa) {
  const tOk = (b) => bareTitle(b.t) === bareTitle(w.t);
  const aOk = (b) => !fa || (squeeze(b.a).includes(squeeze(fa)) || squeeze(fa).includes(firstOf(b.a)));
  const fits = rows.filter((b) => tOk(b) && aOk(b));
  const pre = (b) => { const x = bareTitle(b.t), y = bareTitle(w.t); return Math.min(x.length, y.length) >= 3 && x !== y && (x.startsWith(y) || y.startsWith(x)); };
  const loose = fits.length ? [] : rows.filter((b) => (tOk(b) && !aOk(b)) || (pre(b) && aOk(b)));
  const c = fits[0] || loose[0];
  let status = !c ? 'none' : fits.length && rows[0] === c ? 'sure' : 'check';
  if (c && !fa && new Set(fits.map((b) => firstOf(b.a))).size > 1) status = 'check';
  if (status === 'sure' && new Set(fits.map((b) => squeeze(b.p))).size > 1) status = 'check'; // 판이 여러 출판사에서 나온 책(고전·번역서)은 효니 판인지 모른다
  return { c, status };
}

// 결과 묶음: 채울 수 있어요(확실·직접 고른 줄) / 확인해 주세요 / 못 찾았어요(못 찾음·찾기 실패)
export const fillGroup = (status) => (status === 'sure' || status === 'picked' ? 'ok' : status === 'check' ? 'check' : 'miss');
export const FILL_GROUPS = [['ok', '채울 수 있어요'], ['check', '확인해 주세요'], ['miss', '못 찾았어요']];

// 다시 찾기로 고른 책의 제목이 책장 제목과 다른가(«책 제목도 고치기» 칸을 보일지)
export const titleDiffers = (w, b) => !!b && !!b.t && bareTitle(b.t) !== bareTitle(w.t);
