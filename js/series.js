// 시리즈 묶어 보여 주기(2026-11-15, 효니 말 «토지 1, 2가 시리즈물이라는 건 타당 … 별도의 책인 것도 맞아», 선택 «묶어 보여 주기»).
// 권마다 따로인 책은 그대로 두고(기록·별점·책등·읽은 권수 모두 권 단위) «이어 주는 표시»만 만든다. 합치지 않는다.
// 앱(js/app.js)·시험(tools/test-series.js)이 같이 쓴다. 다른 파일을 불러오지 않는다.

const norm = (s) => String(s || '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
const firstAuthor = (a) => norm(String(a || '').replace(/[(\[][^)\]]*[)\]]/g, '').split(/[\/,;·]/)[0].replace(/\s+외$/, '')); // js/kdc.js firstAuthorOf와 같은 뜻
const UPDOWN = { 상:1, 중:2, 하:3 };
// 제목 끝의 권 표시 하나: (1) / 1 / 제1권 / 1부 / 2편 / 1,2 / 1-12권 / 전5권 / 상·중·하 / «. 4: 부제»(js/merge.js VOL_TAIL과 같은 모양, 번호를 잡으려고 묶음을 나눴다)
const TAIL = /(?:[\s.:,]*(?:\(\s*(\d+)\s*\)|제?\s*(\d+)(\s*[,~-]\s*\d+)*\s*(권|부|편)?|(전)\s*\d+\s*권)|[\s.:,]+([상중하])(?:권)?)(?:\s*[-:.]\s*.*)?$/;

// 제목 → { head: 시리즈 이름, vol: 권 번호 } 또는 null(권 표시가 없거나 여러 권이 한 칸인 책)
// 권 표시를 끝에서 되풀이해 뗀다(«토지 1부 4권» → «토지», 4). vol은 «n권»의 n, 없으면 마지막 숫자, 상·중·하는 1·2·3
export function seriesKey(title) {
  let t = String(title || '').trim();
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const m = TAIL.exec(t);
    if (!m || m.index === 0 && !m[6]) break; // 제목 전체가 숫자(«1984»)면 권 표시가 아니다
    if (m[3] || m[5]) return null; // «1,2»·«1-12권»·«전5권»: 여러 권이 한 칸인 책
    const num = m[1] || m[2] ? +(m[1] || m[2]) : m[6] ? UPDOWN[m[6]] : null;
    parts.push({ num, unit:m[4] || (m[1] ? '()' : ''), paren:!!m[1] });
    t = t.slice(0, m.index).trim();
  }
  if (!parts.length || !norm(t)) return null;
  if (parts.filter((p) => p.paren).length > 1) return null; // «레슨 인 케미스트리(1)(2)»: 두 권이 한 칸
  const vol = (parts.find((p) => p.unit === '권') || parts[0]).num;
  return { head:t, vol };
}

// 책 목록 → 시리즈 묶음 [{ name, k, ids:[권 순서], vol:{id:번호} }]. 2권 이상일 때만 시리즈
// 같은 시리즈: 이름(정규화)이 같고 · 종류 k가 같고 · 첫 저자가 둘 다 있으면 같아야. 지운 칸·제목 미확인 칸은 뺀다.
// 손으로 고치기 works/{id}.ser: 글자면 «이 이름의 시리즈»(제목이 달라 저절로 안 묶이는 권), false면 «시리즈 아님»
export function seriesGroups(works) {
  const buckets = new Map();
  for (const w of works) {
    if (!w || w.del || w.known === false || !w.t || w.ser === false) continue;
    const auto = seriesKey(w.t);
    const name = typeof w.ser === 'string' && w.ser.trim() ? w.ser.trim() : auto ? auto.head : '';
    if (!name) continue;
    const key = `${w.k || 'book'}|${norm(name)}`;
    if (!buckets.has(key)) buckets.set(key, { name, k:w.k || 'book', rows:[] });
    buckets.get(key).rows.push({ w, vol:auto ? auto.vol : null });
  }
  const out = [];
  for (const b of buckets.values()) {
    // 첫 저자가 다른 책끼리는 나눈다(저자 없는 권은 첫 묶음에 붙는다)
    const byAuthor = new Map();
    b.rows.forEach((r) => { const a = firstAuthor(r.w.a); if (!byAuthor.has(a)) byAuthor.set(a, []); byAuthor.get(a).push(r); });
    const blank = byAuthor.get('') || [];
    byAuthor.delete('');
    const lists = byAuthor.size ? [...byAuthor.values()] : [[]];
    lists[0].push(...blank);
    for (const rows of lists) {
      if (rows.length < 2) continue;
      rows.sort((x, y) => (x.vol == null) - (y.vol == null) || (x.vol || 0) - (y.vol || 0) || String(x.w.t).localeCompare(String(y.w.t), 'ko'));
      out.push({ name:b.name, k:b.k, ids:rows.map((r) => r.w.id), vol:Object.fromEntries(rows.map((r) => [r.w.id, r.vol])) });
    }
  }
  return out;
}
// id → 그 책이 든 묶음
export const seriesIndex = (groups) => new Map(groups.flatMap((g) => g.ids.map((id) => [id, g])));
// 같은 달 선반 안에서 같은 시리즈 권을 권 순서로 붙여 꽂는다: 묶음의 첫 권 자리에 나머지 권을 모은다(다른 달 권은 그대로)
export function keepTogether(items, index) {
  const seen = new Set(), out = [];
  for (const w of items) {
    if (seen.has(w.id)) continue;
    const g = index.get(w.id);
    if (!g) { out.push(w); seen.add(w.id); continue; }
    const here = items.filter((x) => index.get(x.id) === g).sort((x, y) => g.ids.indexOf(x.id) - g.ids.indexOf(y.id));
    here.forEach((x) => { out.push(x); seen.add(x.id); });
  }
  return out;
}
