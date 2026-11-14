// 실물 책등(2026-11-14, 효니 결정): 책마다 예스24 상품 번호를 찾아 data/y24.json에 [번호, 책등 그림 가로/세로 비율, 실물 키 mm]만 쓴다.
// 그림은 저장하지 않는다. 앱이 볼 때 https://image.yes24.com/goods/<번호>/SIDE/XL 을 불러온다(못 받으면 색 책등).
// 짝 맞추기: 예스24 모바일 검색(m.yes24.com/Search, PC 검색은 결과가 스크립트로 붙어 안 읽힘) → 제목·저자 점수 → eBook·중고·세트 빼기
//   → 책등 그림이 있는지(«이미지 없음» 그림은 420x600·4,975바이트) → 상품 쪽의 var realBHeight(mm)로 키.
// 사용: node tools/yes24-spines.js [private.local.json] [--all] [--limit N] [--only id,id]
//   private.local.json을 주면 나만 보기 책도 넣는다. 이미 찾은 책·못 찾은 책은 건너뛴다(--all이면 다시). 제목·저자는 출력하지 않는다.
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'y24.json');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const privPath = args.find((a) => a.endsWith('.json'));
const MUA = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' };
const PUA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
const norm = (s) => strip(s).replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/[^0-9a-z가-힣]/gi, '').toLowerCase();
const mainTitle = (t) => String(t || '').split(/\s+[-:]\s+|\s*:\s*/)[0].trim();
const firstAuthor = (a) => String(a || '').split('/')[0].split(/[,·]/)[0].replace(/\s*(외|지음|저|글|옮김|엮음)$/, '').replace(/\s*(지음|저|글|옮김|엮음).*$/, '').trim();

async function get(url, headers, type = 'text') {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
      return { status: r.status, body: type === 'buf' ? Buffer.from(await r.arrayBuffer()) : await r.text() };
    } catch (e) { if (i === 2) return { status: 0, body: type === 'buf' ? Buffer.alloc(0) : '' }; await sleep(1500); }
  }
}
function items(html) {
  return html.split('<li class="item ').slice(1).map((seg) => {
    const no = (seg.match(/^[^>]*data-goods-no="(\d+)"/) || [])[1];
    const alt = (seg.match(/alt="([^"]*)"/) || [])[1] || '';
    return { no, alt, text: strip(seg.slice(0, 6000)).replace(/\s+/g, ' ') };
  }).filter((x) => x.no);
}
// 책등 그림 크기(JPEG SOF). 그림이 없으면 null
async function side(no) {
  const r = await get(`https://image.yes24.com/goods/${no}/SIDE/XL`, MUA, 'buf');
  const buf = r.body;
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
async function height(no) {
  const r = await get('https://www.yes24.com/Product/Goods/' + no, PUA);
  const mh = +((r.body.match(/var realBHeight\s*=\s*'(\d+)'/) || [])[1] || 0);
  return mh >= 150 && mh <= 320 ? mh : 0; // 이상한 값은 버림(앱이 기본 키를 쓴다)
}
async function find(b) {
  const T = norm(mainTitle(b.t)), A = norm(firstAuthor(b.a));
  if (!T) return { why: 'title' };
  const tries = [`${mainTitle(b.t)} ${firstAuthor(b.a)}`.trim(), mainTitle(b.t)];
  let sawBook = false;
  for (const q of [...new Set(tries)]) {
    const r = await get('https://m.yes24.com/Search?query=' + encodeURIComponent(q), MUA);
    if (!r.status) return { why: 'fetch' };
    const cands = items(r.body).map((x) => {
      const at = norm(x.alt);
      let s = 0;
      if (at === T) s += 3; else if (at.startsWith(T) || T.startsWith(at)) s += 2; else if (T.length >= 4 && at.includes(T.slice(0, 4))) s += 1;
      if (A && norm(x.text).includes(A)) s += 2;
      if (/eBook|전자책|\[중고\]|세트|오디오북|큰글자|리커버|양장 ?특별/.test(x.text.slice(0, 400) + x.alt)) s -= 3;
      return { ...x, s };
    }).filter((x) => x.s >= 3).sort((p, q) => q.s - p.s);
    if (cands.length) sawBook = true;
    for (const c of cands.slice(0, 4)) {
      const sd = await side(c.no);
      if (sd) return { no: c.no, r: +(sd.w / sd.h).toFixed(4), mh: await height(c.no) };
    }
    await sleep(300);
  }
  return { why: sawBook ? 'noside' : 'nomatch' };
}

(async () => {
  const pub = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'public.json'), 'utf8'));
  let books = pub.books.filter((b) => b.k === 'book').map((b) => ({ id: b.id, t: b.t, a: b.a }));
  if (privPath) {
    const have = new Set(books.map((b) => b.id));
    const raw = JSON.parse(fs.readFileSync(path.resolve(privPath), 'utf8'));
    const works = raw.works || raw;
    for (const [id, w] of Object.entries(works)) {
      if (!w || w.del || (w.k || 'book') !== 'book' || have.has(id) || !w.t || w.known === false) continue;
      books.push({ id, t: w.t, a: w.a });
    }
  }
  const only = val('--only'); if (only) { const s = new Set(only.split(',')); books = books.filter((b) => s.has(b.id)); }
  const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  out.y = out.y || {}; out.miss = out.miss || {};
  const todo = books.filter((b) => flag('--all') || only || (!(b.id in out.y) && !(b.id in out.miss))).slice(0, Number(val('--limit')) || Infinity);
  const save = () => {
    for (const id in out.y) delete out.miss[id];
    const ordered = {
      v: 1, at: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10),
      note: '예스24 실물 책등: y[id]=[상품 번호, 책등 그림 가로/세로, 실물 키 mm(모르면 0)]. 그림은 저장하지 않고 앱이 image.yes24.com/goods/<번호>/SIDE/XL 을 불러온다. miss[id]=못 찾은 까닭(nomatch 검색에 맞는 책 없음, noside 책등 그림 없음). tools/yes24-spines.js',
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
