// 티스토리 RSS에서 책 글을 data/blog.json으로 모은다. 깃허브 액션이 하루 한 번 돌리고, 손으로 돌려도 된다.
// 대상: «현의 문장들» 카테고리 글, 또는 태그·제목 괄호가 책장의 책 제목과 정확히 같은 글.
// 본문 전체는 넣지 않고 앞부분과 주소만 둔다. RSS에 안 나오는 옛 글은 기존 파일에서 그대로 유지한다.
// 사용: node tools/fetch-blog.js
const fs = require('fs'), path = require('path');
const RSS = 'https://0hyonnie.tistory.com/rss';
const BOOK_CATEGORY = '현의 문장들';
const LEN = 180;
const OUT = path.join(__dirname, '..', 'data', 'blog.json');
const PUB = path.join(__dirname, '..', 'data', 'public.json');

const ENT = { lt:'<', gt:'>', quot:'"', apos:"'", amp:'&', nbsp:' ', mdash:'—', ndash:'–', middot:'·', hellip:'…', lsquo:'‘', rsquo:'’', ldquo:'“', rdquo:'”' };
const decodeOnce = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1); return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
const decode = (s) => { let a = s, b = decodeOnce(a); while (b !== a) { a = b; b = decodeOnce(a); } return a; };
const grab = (s, tag) => { const a = s.indexOf(`<${tag}`); if (a < 0) return ''; const b = s.indexOf('>', a) + 1, e = s.indexOf(`</${tag}>`, b); return e < 0 ? '' : s.slice(b, e).trim(); };
const grabAll = (s, tag) => s.split(`<${tag}>`).slice(1).map((x) => x.slice(0, x.indexOf(`</${tag}>`)).trim());
const norm = (s) => (s || '').normalize('NFC').replace(/[\s·:,.!?'"“”‘’\-–—~()（）\[\]<>《》〈〉『』「」&+_/]/g, '').toLowerCase();
const kst = (d) => new Date(new Date(d).getTime() + 9 * 3600e3).toISOString().slice(0, 10);

function excerpt(html) {
  // 그림과 설명, 책 링크 카드는 figure 안에 있으므로 통째로 뺀다
  const clean = decode(html).replace(/<figure[\s\S]*?<\/figure>/gi, ' ');
  const paras = clean.split(/<\/(?:p|div|h[1-6]|li|blockquote)>/i).map((p) => decode(p.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim());
  // 제공 안내문·그림 설명·링크 줄은 소개로 쓰지 않는다
  const body = paras.filter((p) => p && !/제공받|협찬|원고료|파트너스|^https?:\/\/|이미지(\s*입니다)?\.?$|^(책 정보|제목\s*:|저자\s*:|출판사\s*:)/.test(p));
  const text = body.join(' ');
  return text.length > LEN ? text.slice(0, LEN).trim() + '…' : text;
}
// 제목의 괄호 안 책 이름들
const bracketed = (t) => [...t.matchAll(/[『「《〈<\[]([^』」》〉>\]]{2,40})[』」》〉>\]]/g)].map((m) => norm(m[1]));

async function main() {
  const res = await fetch(RSS, { headers:{ 'User-Agent':'Mozilla/5.0 (bookshelf blog sync)' } });
  if (!res.ok) throw new Error(`RSS 응답 ${res.status}`);
  const xml = await res.text();
  const items = xml.split('<item>').slice(1);
  if (!items.length) throw new Error('RSS에 글이 없습니다');

  const books = new Map(JSON.parse(fs.readFileSync(PUB, 'utf8')).books.filter((b) => norm(b.t).length >= 3).map((b) => [norm(b.t), b.id]));
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')).posts || [] : [];
  const fresh = [];
  let oldest = '9999';
  for (const it of items) {
    const d = kst(grab(it, 'pubDate'));
    if (d < oldest) oldest = d;
    const title = decode(grab(it, 'title'));
    const [cat = '', ...tags] = grabAll(it, 'category').map(decode);
    const keys = [...tags.map(norm), ...bracketed(title)];
    const w = [...new Set(keys.map((k) => books.get(k)).filter(Boolean))];
    if (decode(cat) !== BOOK_CATEGORY && !w.length) continue;
    const id = grab(it, 'guid').split('/').pop();
    if (!/^\d+$/.test(id)) continue;
    fresh.push({ c:`tb${id}`, d, t:title, u:grab(it, 'link'), x:excerpt(grab(it, 'description')), k:w.length ? 'review' : 'etc', w });
  }
  // RSS 범위 안에서 사라진 글은 비공개로 돌린 글로 보고 뺀다. 범위 밖(가장 옛 글과 같은 날 포함)만 남긴다. 범위 밖 글을 비공개로 돌리면 blog.json에서 손으로 지운다
  const seen = new Set(fresh.map((p) => p.c));
  const kept = prev.filter((p) => !seen.has(p.c) && p.d <= oldest);
  const posts = [...fresh, ...kept].sort((a, b) => b.d.localeCompare(a.d));
  const next = JSON.stringify({ posts });
  const old = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (next !== old) fs.writeFileSync(OUT, next);
  console.log({ RSS글:items.length, 책글:posts.length, 책과이어짐:posts.filter((p) => p.w.length).length, 바뀜:next !== old });
}
main().catch((e) => { console.error(e.message); process.exit(1); });
