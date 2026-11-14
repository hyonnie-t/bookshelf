// 책등 색 만들기(2026-11-14): 책마다 표지를 찾아 바탕·글자·강조색을 뽑아 data/spines.json에 쓴다. 표지는 예스24(실물 책등 판을 알면 그 판, 모르면 중계 src=y24 검색), 2026-11-14 전에는 카카오.
// 저장하는 것은 책 id와 색 세 개뿐이다. 표지 주소·ISBN 같은 카카오 결과는 저장하지 않는다(운영정책 제5조 제20·30호, 화면 개선용 캐시).
// 표지가 바뀌었을 수 있으니 가끔 --all로 다시 돌려 최신으로 맞춘다. 책 창 앞표지는 앱이 열 때마다 중계로 받는다.
//
// 준비(PC마다 한 번): npm install --prefix tools   (jpeg-js·pngjs, tools/package.json)
// 사용: node tools/cover-colors.js [private.local.json] [--all] [--miss] [--limit N] [--only id,id]
//   private.local.json(비공개 works, 공개 반영 순서처럼 받은 뒤 지운다)을 주면 나만 보기 책도 넣는다. 제목·저자는 출력하지 않는다.
//   이미 색이 있는 책은 건너뛴다(--all이면 다시). 중계 하루 상한(3,000건)에 걸리면(error: limit) 거기까지 저장하고 멈춘다.
const fs = require('fs'), path = require('path');
const jpeg = require('jpeg-js'), { PNG } = require('pngjs');
const { pickColors, fixText, stripes } = require('./spine-color.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'spines.json');
const RELAY = 'https://script.google.com/macros/s/AKfycbyijv6_u2vViI8hsdMvmzFWwLoZXaeEoayBU0WlYdFiCNGHZrpTxpYOZ0qrBwqyFzA7/exec';
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const privPath = args.find((a) => a.endsWith('.json'));

const norm = (s) => String(s || '').replace(/\(.*?\)|\[.*?\]/g, '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
const mainTitle = (t) => String(t || '').split(/\s+[-:]\s+|\s*:\s*/)[0].trim();
const firstAuthor = (a) => String(a || '').split('/')[0].split(/[,·]/)[0].replace(/\s+외$/, '').trim();
function best(list, b) {
  const t = norm(mainTitle(b.t)), a = norm(firstAuthor(b.a));
  const ok = list.filter((x) => x.cover);
  const au = (x) => !a || norm(x.authors.join()).includes(a);
  return ok.find((x) => norm(x.title) === t && au(x)) || ok.find((x) => norm(x.title).startsWith(t) && au(x)) || ok.find((x) => norm(x.title) === t) || null;
}
async function relay(q) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${RELAY}?src=y24&q=${encodeURIComponent(q.slice(0, 100))}`, { signal: AbortSignal.timeout(30000) }); // 예스24 Open API(2026-11-14, 전에는 카카오)
      return await r.json();
    } catch (e) { if (i === 2) return { ok: false, error: 'fetch' }; await new Promise((s) => setTimeout(s, 2000)); }
  }
}
async function image(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) }); if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const im = buf[0] === 0x89 ? PNG.sync.read(buf) : jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
    if (/yes24\.com/.test(url) && im.width === 280 && im.height === 400) return null; // 예스24 «이미지 준비중»(표지 없는 상품, 앱 coverImage와 같은 기준)
    return im;
  } catch (e) { return null; }
}

(async () => {
  const pub = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'public.json'), 'utf8'));
  let books = pub.books.filter((b) => b.k === 'book').map((b) => ({ id: b.id, t: b.t, a: b.a }));
  if (privPath) {
    const have = new Set(books.map((b) => b.id));
    const raw = JSON.parse(fs.readFileSync(path.resolve(privPath), 'utf8'));
    const works = raw.works || raw; // 공개 반영 순서대로 받은 파일(/bookshelf 전체)과 works만 받은 파일 둘 다
    for (const [id, w] of Object.entries(works)) {
      if (!w || w.del || (w.k || 'book') !== 'book' || have.has(id) || !w.t || w.known === false) continue;
      books.push({ id, t: w.t, a: w.a });
    }
  }
  const only = val('--only'); if (only) { const s = new Set(only.split(',')); books = books.filter((b) => s.has(b.id)); }
  const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  out.c = out.c || {}; out.miss = out.miss || [];
  // --stripes: 색은 있는데 세로 색 조각이 아직 없는 책만 다시(끊겨도 이어서 돌릴 수 있다)
  // --miss: 못 찾은 책만 다시(예스24로 옮긴 뒤 2026-11-14)
  const todo = books.filter((b) => (flag('--stripes') ? (b.id in out.c) && !out.c[b.id][3] : flag('--miss') ? out.miss.includes(b.id) : flag('--all') || only || !(b.id in out.c) && !out.miss.includes(b.id)));
  const y24 = (JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'y24.json'), 'utf8')).y) || {}; // 실물 책등 판을 아는 책은 그 판의 표지를 바로 쓴다
  const limit = Number(val('--limit')) || Infinity;
  let done = 0, miss = 0, calls = 0, stop = '';
  const save = () => {
    out.v = 1; out.at = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 한국 날짜
    out.note = '예스24 표지(2026-11-14 전에 뽑은 책은 카카오 책 검색 표지)에서 계산한 책등 색 [바탕, 글자, 강조, 세로 색 조각 7개(6자리씩 이어 붙임)]. 표지 주소·그림은 저장하지 않는다(tools/cover-colors.js)';
    out.miss = [...new Set(out.miss)].filter((id) => !(id in out.c));
    for (const id in out.c) out.c[id][1] = fixText(out.c[id][0], out.c[id][1]); // 저장할 때마다 모든 책의 글자 대비 4.5 이상을 다시 확인한다
    const ordered = { v: out.v, at: out.at, note: out.note, c: out.c, miss: out.miss };
    fs.writeFileSync(OUT, JSON.stringify(ordered).replace(/,"(w\d+|[A-Za-z0-9_-]+)":\[/g, ',\n"$1":[') + '\n');
  };
  // 중계(앱스크립트)가 한 번에 몇 초씩 걸려 여섯 권씩 같이 받는다
  const queue = todo.slice(0, limit);
  const one = async (b) => {
    const known = y24[b.id] && await image(`https://image.yes24.com/goods/${y24[b.id][0]}/L`);
    if (known) { const c = pickColors(known.data, known.width, known.height); if (c) { out.c[b.id] = [c.base, c.text, c.accent || '', stripes(known.data, known.width, known.height)]; out.miss = out.miss.filter((x) => x !== b.id); done++; return; } }
    let r = await relay(`${mainTitle(b.t)} ${firstAuthor(b.a)}`.trim()); calls++;
    if (!r.ok && r.error === 'limit') { stop = '중계 하루 상한'; return; }
    let m = r.ok ? best(r.books || [], b) : null;
    if (!m && r.ok) { r = await relay(mainTitle(b.t)); calls++; if (!r.ok && r.error === 'limit') { stop = '중계 하루 상한'; return; } m = r.ok ? best(r.books || [], b) : null; }
    const im = m && await image(m.cover);
    const c = im && pickColors(im.data, im.width, im.height);
    if (c) { out.c[b.id] = [c.base, c.text, c.accent || '', stripes(im.data, im.width, im.height)]; out.miss = out.miss.filter((x) => x !== b.id); done++; }
    else { if (!(b.id in out.c) && !out.miss.includes(b.id)) out.miss.push(b.id); miss++; } // 색이 이미 있는 책은 이번에 못 찾아도 옛 색을 둔다
    if ((done + miss) % 25 === 0) { save(); process.stdout.write(`${done + miss}/${todo.length} `); }
  };
  await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length && !stop) await one(queue.shift()); }));
  save();
  console.log(`\n색 ${done}권, 못 찾음 ${miss}권, 중계 호출 ${calls}회${stop ? ', 멈춤: ' + stop : ''} / 전체 색 ${Object.keys(out.c).length}권`);
})();
