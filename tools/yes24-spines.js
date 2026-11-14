// 실물 책등(2026-11-14, 효니 결정): 책마다 예스24 상품 번호를 찾아 data/y24.json에 [번호, 책등 그림 가로/세로 비율, 실물 키 mm]만 쓴다.
// 그림은 저장하지 않는다. 앱이 볼 때 https://image.yes24.com/goods/<번호>/SIDE/XL 을 불러온다(못 받으면 색 책등).
// 짝 맞추기: 예스24 Open API 상품 검색(책장 중계 src=y24, 2026-11-14부터. 전에는 m.yes24.com 화면 읽기) → 제목·저자 점수 → 세트·큰글자 빼기
//   → 책등 그림이 있는지(«이미지 없음» 그림은 420x600·4,975바이트) → API의 세로(mm)로 키.
// 사용: node tools/yes24-spines.js [private.local.json] [--all] [--miss] [--vol] [--limit N] [--only id,id]   (--vol: 권 번호가 있는 책만 다시)
//   private.local.json을 주면 나만 보기 책도 넣는다. 이미 찾은 책·못 찾은 책은 건너뛴다(--all이면 다시). 제목·저자는 출력하지 않는다.
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'y24.json');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const privPath = args.find((a) => a.endsWith('.json'));
const MUA = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
const norm = (s) => strip(s).replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/[^0-9a-z가-힣]/gi, '').toLowerCase();
const mainTitle = (t) => String(t || '').split(/\s+[-:]\s+|\s*:\s*/)[0].trim();
const firstAuthor = (a) => String(a || '').split('/')[0].split(/[,·]/)[0].replace(/\s*(외|지음|저|글|옮김|엮음)$/, '').replace(/\s*(지음|저|글|옮김|엮음).*$/, '').trim();

// 권 번호: «(1)», «1권», «1부 1권»의 마지막 «n권», 끝의 «상·하»는 1·2. 없으면 ''
const volOf = (t) => { const s = strip(t).trim(); const m = s.match(/(\d+)\s*권(?!.*\d+\s*권)/) || s.match(/\((\d+)\)\s*$/) || s.match(/(?:^|[^\d])(\d{1,2})\s*$/); if (m) return m[1]; const h = s.match(/[\s(]([상중하])\)?\s*$/); return h ? { 상:'1', 중:'2', 하:'3' }[h[1]] : ''; };
const dist = (a, b) => { // 글자 편집 거리
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[b.length];
};
async function get(url, headers, type = 'text') {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
      return { status: r.status, body: type === 'buf' ? Buffer.from(await r.arrayBuffer()) : await r.text() };
    } catch (e) { if (i === 2) return { status: 0, body: type === 'buf' ? Buffer.alloc(0) : '' }; await sleep(1500); }
  }
}
// 예스24 Open API를 책장 중계로 부른다(2026-11-14). 키는 중계 스크립트 속성에만 있어 어느 PC에서나 열쇠 파일 없이 돈다(레포 CLAUDE.md)
const RELAY = 'https://script.google.com/macros/s/AKfycbyijv6_u2vViI8hsdMvmzFWwLoZXaeEoayBU0WlYdFiCNGHZrpTxpYOZ0qrBwqyFzA7/exec';
async function search(q) {
  const r = await get(`${RELAY}?src=y24&q=${encodeURIComponent(q.slice(0, 100))}`, {});
  if (r.status !== 200) return null;
  let j; try { j = JSON.parse(r.body); } catch (e) { return null; }
  if (!j.ok) return null; // 한도·키 없음·예스24 오류는 받기 실패로(기록하지 않음)
  // 화면 읽기 때와 같은 모양으로 맞춘다: alt = 상품 이름, text = 상품 이름·저자·역자·출판사(점수 계산이 그대로 돈다)
  return (j.books || []).filter((b) => b.y24).map((b) => ({ no: String(b.y24), alt: b.title || '', text: [b.title, ...(b.authors || []), ...(b.translators || []), b.publisher].join(' '), mh: (b.size || [])[1] || 0 }));
}
// 책등 그림 크기(JPEG SOF). 그림이 없으면 null, 받지 못하면 'err'
async function side(no) {
  const r = await get(`https://image.yes24.com/goods/${no}/SIDE/XL`, MUA, 'buf');
  const buf = r.body;
  if (!r.status || r.status === 403 || r.status === 429 || r.status >= 500) return 'err';
  if (r.status !== 200 || buf.length === 4975 || buf[0] !== 0xff) return null;
  let w = 0, h = 0;
  for (let k = 2; k < buf.length - 9;) {
    if (buf[k] !== 0xff) break;
    const mk = buf[k + 1], len = buf.readUInt16BE(k + 2);
    if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) { h = buf.readUInt16BE(k + 5); w = buf.readUInt16BE(k + 7); break; }
    k += 2 + len;
  }
  if (!w || !h || (w === 420 && h === 600)) return null;
  const r2 = w / h;
  if (r2 < 0.02 || r2 > 0.35) return null; // 책등이 아닌 그림(앞표지 등)
  return { w, h };
}
async function find(b) {
  const T = norm(mainTitle(b.t)), A = norm(firstAuthor(b.a)), V = volOf(b.t);
  const P = norm(String(b.p || '').replace(/\(.*?\)|\[.*?\]/g, '').replace(/출판사|출판|주식회사|㈜/g, '').split(/\s*[:/]\s*/)[0]).slice(0, 6);
  if (!T) return { why: 'title' };
  const tries = [`${mainTitle(b.t)} ${firstAuthor(b.a)}`.trim(), mainTitle(b.t)];
  let sawBook = false, sawAuthor = false, fetchFail = false;
  for (const q of [...new Set(tries)]) {
    const found = await search(q);
    if (!found) return { why: 'fetch' }; // 중계·예스24 오류는 기록하지 않고 다음에 다시
    const all = found.map((x) => {
      const at = norm(x.alt), tx = norm(x.text);
      // 제목은 같거나 앞이 같아야 한다(«이방인/페스트/시지프 신화» 같은 묶음책이 붙었던 일). 표기 차이(«해방일기/일지», «2025년/2025»)는 글자 1~2개까지, 긴 제목(8자 이상)은 앞에 시리즈 이름이 붙어도(«일상이 고고학, 나 혼자 …») 받는다
      const near = T.length >= 6 && Math.abs(at.length - T.length) <= 2 && dist(at, T) <= (T.length >= 10 ? 2 : 1);
      const ts = at === T ? 3 : at && (at.startsWith(T) || T.startsWith(at) || near || (T.length >= 8 && at.includes(T))) ? 2 : 0;
      let s = ts;
      // 저자 표기 차이(«캐럴라인/캐롤라인», «샬럿/샬롯»)는 이름 끝 세 글자로 본다
      const am = !!A && (tx.includes(A) || (A.length >= 4 && tx.includes(A.slice(-3)))), pm = !!P && tx.includes(P);
      if (am) s += 2;
      if (pm) s += 1; // 같은 책의 여러 판 중 효니 판(출판사)을 먼저
      const cv = volOf(x.alt);
      if (V) { if (cv === V) s += 1; else if (cv) s -= 3; } else if (cv && cv !== '1') s -= 3; // 권 번호 없는 책에 «달러구트 꿈 백화점 0» 같은 다른 권이 붙지 않게 // 권 번호가 다르면 다른 책(레퓨테이션 (1)이 2권에 붙었던 일)
      const head = x.text.slice(0, 120) + x.alt; // [도서]/[eBook] 표시와 상품 이름까지만(뒤쪽 설명엔 다른 상품 광고가 섞인다)
      if (/eBook|전자책|\[중고\]|세트|오디오북|큰글자/.test(head)) s -= 3;
      // 판 이름은 괄호째 지워져 제목이 똑같아 보이므로 깎는다. 다른 판에 사진이 없을 때만 잡히게(달러구트 «합본호»가 1권보다 먼저 잡혔던 일)
      if (/합본|리커버|에디션|특별판|한정판|기념판|양장/.test(x.alt)) s -= 2; // 상품 이름(alt)만 본다. 설명 글에는 다른 상품 광고로 «합본»이 섞여 있다
      if (/[一-鿿぀-ヿ]/.test(x.alt) && !/[一-鿿぀-ヿ]/.test(b.t)) s -= 3; // 중국어·일본어판(한자는 norm이 지워 제목이 같아 보인다)
      return { ...x, s, ts, am, pm, exact: at === T };
    });
    if (all.some((x) => x.am && x.s >= 3)) sawAuthor = true;
    // 저자를 아는 책은 저자가 맞는 후보만 받는다. 저자 표기가 갈려(카뮈/까뮈) 맞는 후보가 하나도 없을 때만 제목이 똑같고 출판사도 맞는 책을 받는다(검토자 재현: 저자 맞는 판에 책등 사진이 없으면 다른 저자의 같은 제목 책으로 넘어갔다)
    const ok = (x) => x.s >= 3 && x.ts >= 2 && (!A || x.am || (!sawAuthor && x.exact && (x.pm || !P)));
    const cands = all.filter(ok).sort((p, q) => q.s - p.s);
    if (cands.length) sawBook = true;
    for (const c of cands.slice(0, 5)) {
      const sd = await side(c.no);
      if (sd === 'err') { fetchFail = true; continue; }
      if (sd) return { no: c.no, r: +(sd.w / sd.h).toFixed(4), mh: c.mh >= 150 && c.mh <= 320 ? c.mh : 0 }; // 키는 API의 세로(mm). 이상한 값은 버림(앱이 기본 키를 쓴다)
    }
    await sleep(300);
  }
  if (fetchFail) return { why: 'fetch' }; // 받기 실패는 기록하지 않아 다음에 다시 찾는다
  return { why: sawBook ? 'noside' : 'nomatch' };
}

(async () => {
  const pub = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'public.json'), 'utf8'));
  let books = pub.books.filter((b) => b.k === 'book').map((b) => ({ id: b.id, t: b.t, a: b.a, p: b.p }));
  if (privPath) {
    const have = new Set(books.map((b) => b.id));
    const raw = JSON.parse(fs.readFileSync(path.resolve(privPath), 'utf8'));
    const works = raw.works || raw;
    for (const [id, w] of Object.entries(works)) {
      if (!w || w.del || (w.k || 'book') !== 'book' || have.has(id) || !w.t || w.known === false) continue;
      books.push({ id, t: w.t, a: w.a, p: w.p });
    }
  }
  const only = val('--only'); if (only) { const s = new Set(only.split(',')); books = books.filter((b) => s.has(b.id)); }
  const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  out.y = out.y || {}; out.miss = out.miss || {};
  if (flag('--vol')) books = books.filter((b) => volOf(b.t)); // 권 번호가 있는 책만 다시(짝 규칙을 고친 뒤)
  // --miss: 못 찾은 책만 다시(예스24 API로 옮긴 뒤 2026-11-14)
  const todo = books.filter((b) => flag('--all') || flag('--vol') || only || (flag('--miss') ? b.id in out.miss : (!(b.id in out.y) && !(b.id in out.miss)))).slice(0, Number(val('--limit')) || Infinity);
  const save = () => {
    for (const id in out.y) delete out.miss[id];
    const ordered = {
      v: 1, at: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10),
      note: '예스24 실물 책등: y[id]=[상품 번호, 책등 그림 가로/세로, 실물 키 mm(모르면 0)]. 그림은 저장하지 않고 앱이 image.yes24.com/goods/<번호>/SIDE/L(화면 배율 2 넘으면 XL)을 불러온다. miss[id]=못 찾은 까닭(nomatch 검색에 맞는 책 없음, noside 책등 그림 없음). tools/yes24-spines.js',
      y: out.y, miss: out.miss,
    };
    fs.writeFileSync(OUT, JSON.stringify(ordered).replace(/,"([A-Za-z0-9_-]+)":\[/g, ',\n"$1":[') + '\n');
  };
  console.log(`대상 ${todo.length}권 (전체 ${books.length}권)`);
  let done = 0, hit = 0, i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const b = todo[i++];
      const r = await find(b);
      if (r.no) { out.y[b.id] = [r.no, r.r, r.mh]; delete out.miss[b.id]; hit++; }
      else if (r.why !== 'fetch') { out.miss[b.id] = r.why; delete out.y[b.id]; }
      done++;
      if (done % 20 === 0) { save(); console.log(`${done}/${todo.length} 찾음 ${hit}`); }
      await sleep(500);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  save();
  const miss = Object.values(out.miss);
  console.log(`끝: 이번 ${done}권 중 ${hit}권 찾음. 전체 찾음 ${Object.keys(out.y).length}, 못 찾음 ${miss.length} (검색 불일치 ${miss.filter((x) => x === 'nomatch').length}, 책등 그림 없음 ${miss.filter((x) => x === 'noside').length})`);
})();
