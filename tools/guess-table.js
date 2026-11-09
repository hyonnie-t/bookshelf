// 제목 미확인 책의 «혹시 이 책?» 후보표(일회성). 메모 내용은 출력하지 않고 후보·근거 코드·건수만 쓴다.
// 사용: node tools/guess-table.js private.local.json 저장할파일.md   (private.local.json은 CLAUDE.md의 Firebase 절차로 받는다)
// 찾는 말(메모의 드문 낱말, 저자)은 앱과 같이 앱스크립트 중계를 거쳐 카카오 책 검색으로 간다.
const fs = require('fs'), path = require('path');
const REPO = path.join(__dirname, '..');
const RELAY = fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8').match(/const BOOK_RELAY = '([^']+)'/)[1];
const [src, dest] = process.argv.slice(2);
if (!src || !dest) { console.error('사용: node tools/guess-table.js private.local.json 저장할파일.md'); process.exit(1); }

const search = async (q) => {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await (await fetch(`${RELAY}?q=${encodeURIComponent(q)}`)).json();
      if (r.ok) return r.books.map((b) => ({ t:b.title.replace(/\s*\((?:반양장|양장)본?.*\)$/, ''), a:(b.authors || []).slice(0, 3).join(', ') + ((b.translators || []).length ? `, ${b.translators.join(', ')} 옮김` : ''), p:b.publisher, y:b.year }));
    } catch (e) { /* 다시 */ }
    await new Promise((r) => setTimeout(r, 800));
  }
  return [];
};

(async () => {
  const { wordStats, suggest, hasText } = await import('file://' + path.join(REPO, 'js/guess.js').replace(/\\/g, '/'));
  const d = JSON.parse(fs.readFileSync(src, 'utf8'));
  const pub = JSON.parse(fs.readFileSync(path.join(REPO, 'data/public.json'), 'utf8'));
  const all = Object.values(d.works).filter((w) => !w.del && (w.k || 'book') === 'book');
  const unk = all.filter((w) => !w.known).sort((a, b) => (a.fd || '').localeCompare(b.fd || ''));
  const seen = new Set();
  const shelf = [...pub.books, ...all.filter((w) => w.known && w.t)].map((b) => ({ id:b.id, t:b.t, a:b.a, p:b.p })).filter((b) => !seen.has(b.id) && seen.add(b.id));
  const ctx = { stats:wordStats(all), posts:pub.posts, shelf, search };
  const KIND = { A:'인스타 근처(약함)', B:'메모 낱말↔제목', C:'저자의 다른 책', D:'추정 제목 확인' };
  const rows = [];
  for (const w of unk) {
    const { top } = await suggest(w, ctx);
    rows.push({ w, top });
    process.stdout.write('.');
  }
  const has = rows.filter((r) => r.top.length).length;
  const strong = rows.filter((r) => r.top.some((c) => c.kind === 'B' || c.kind === 'D')).length;
  const out = [
    '# 제목 미확인 책 «혹시 이 책?» 후보표', '',
    `만든 날 ${new Date().toISOString().slice(0, 10)} · 제목 미확인 ${rows.length}권 · 후보 있음 ${has}권 · 메모 낱말/추정 제목으로 맞춘 것 ${strong}권`,
    '메모 내용은 적지 않았습니다(건수와 코드만). 단서: A 인스타 글이 같은 무렵 적은 책(약함·같은 책일 가능성은 낮고 중복 칸 확인용), B 메모 낱말이 제목·저자에 들어 있음, C 적어 둔 저자의 책(책장에 없는 것), D 추정해 둔 제목이 실제 책인지.',
    '', '| 칸 | 날짜 | 메모(건·글자) | 후보 1 | 후보 2 | 후보 3 |', '|---|---|---|---|---|---|',
  ];
  const cell = (c) => (c ? `${c.t} / ${c.a || '저자 ?'} / ${c.p || ''}${c.y ? ' ' + c.y : ''} [${c.kind}]` : '');
  rows.forEach(({ w, top }) => out.push(`| ${w.id} | ${w.fd || '?'} | ${(w.notes || []).length}건·${(w.notes || []).reduce((s, n) => s + (n.b || n.l || '').length, 0)}자${hasText(w) ? '' : '(글 없음)'}${w.t ? ' · 추정 제목 있음' : ''} | ${[0, 1, 2].map((i) => cell(top[i]).replace(/\|/g, '/')).join(' | ')} |`));
  out.push('', '## 단서 코드', ...Object.entries(KIND).map(([k, v]) => `- ${k}: ${v}`));
  fs.writeFileSync(dest, out.join('\n'), 'utf8');
  console.log(`\n저장: ${dest} · 미확인 ${rows.length} · 후보 있음 ${has} · B/D ${strong}`);
})();
