// 주제 저절로 고르기(2026-11-14): 책장에 같은 저자의 책이 있으면 그 책들의 주제, 없으면 도서관 분류(KDC) 대응표.
// 앱(js/app.js, 책 찾기 뒤)과 tools/fill-info.js(빈 칸 한 번에 채우기)가 같이 쓴다. 다른 파일을 불러오지 않는다.
// 시험 근거(2026-11-14, 공개 책 80권): 같은 저자 기준 87%, 도서관 분류 기준 71%. 주제는 1개만 고른다(둘째 주제는 내용 판단이라 못 맞힘).

// 첫 저자: «유발 하라리, 조현욱 옮김»·«A 외 2명»·«A 지음»에서 A만
export const firstAuthorOf = (a) => String(a || '').replace(/[(\[][^)\]]*[)\]]/g, '').split(/[\/,;]/)[0].trim()
  .replace(/\s+(외(\s*\d+\s*(명|인)?)?|지음|지은이|저자|저|글\s*[·,]?\s*그림|글그림|글|그림|옮김|엮음|편저|편|역)$/, '').trim();
const key = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

// 도서관 분류 번호 → 효니 주제. kid: 청구기호가 «유»·«아»(어린이 자료)
export function kdcTheme(kdc, kid) {
  if (kid) return '청소년·그림책';
  const m = String(kdc || '').match(/\d{3}/);
  if (!m) return '';
  const n = +m[0];
  if (n >= 900) return '역사'; // 98x 지리도 효니는 «역사»로 붙였다
  if (n >= 800) {
    if (n <= 809) return '인문';
    const d = n % 10; // 8x1 시, 8x2·8x3 소설(희곡·소설), 8x4·8x5·8x6·8x8 에세이(수필·연설·일기·기행·르포)
    if (d === 1) return '시';
    if (d === 2 || d === 3) return '소설';
    if (d === 4 || d === 5 || d === 6 || d === 8) return '에세이';
    return '소설';
  }
  if (n >= 700) return '인문';
  if (n >= 600) return '예술';
  if (n >= 590) return '기타';
  if (n >= 400) return '과학·환경';
  if (n >= 370 && n <= 379) return '교육';
  if (n >= 360 && n <= 369) return '법';
  if (n === 337) return '여성';
  if (n === 336) return '일·노동';
  if (n >= 320 && n <= 329) return '경제·자기계발';
  if (n >= 380 && n <= 389) return '인문';
  if (n >= 300) return '사회·정치';
  if (n >= 200) return '인문';
  if (n >= 180 && n <= 189) return '심리';
  if (n === 199) return '경제·자기계발';
  if (n >= 100) return '철학';
  return '인문';
}

// 같은 첫 저자의 다른 책들에서 가장 많은 첫 주제. shelf: [{id, a, th}], 자기 자신은 뺀다
export function authorTheme(work, shelf) {
  const me = key(firstAuthorOf(work && work.a));
  if (!me) return null;
  const count = {};
  let n = 0;
  (shelf || []).forEach((x) => {
    if (!x || x === work || (work.id && x.id === work.id)) return;
    const t = (x.th || [])[0];
    if (!t || key(firstAuthorOf(x.a)) !== me) return;
    count[t] = (count[t] || 0) + 1;
    n++;
  });
  const best = Object.entries(count).sort((p, q) => q[1] - p[1])[0];
  return best ? { th:best[0], n } : null;
}

// 고르기: 이미 주제가 있으면 null(건드리지 않음). 결과 {th, why, from:'author'|'kdc'}
export function pickTheme(work, shelf, kdc, kid) {
  if (work && (work.th || []).length) return null;
  const au = authorTheme(work || {}, shelf);
  if (au) return { th:au.th, from:'author', why:`같은 저자 책 ${au.n}권` };
  const t = kdcTheme(kdc, kid);
  if (t) return { th:t, from:'kdc', why:kid ? '도서관 분류(어린이 자료)' : `도서관 분류 ${String(kdc).match(/\d{3}/)[0]}` };
  return null;
}
