// 낱말 지도 시험: 조사·어미 처리, 공개본에 안 나감, 볼트 자동낱말이 사람의 낱말을 덮지 않음. 가짜 데이터만 쓴다.
// 사용: node tools/test-words.js
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), { execFileSync } = require('child_process');
const REPO = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'words-'));
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  통과', name); };

(async () => {
  const { buildWordIndex, layoutGraph, narrowIndex, relatedWords, wordDoc, wordGraph } = await import(`data:text/javascript;base64,${fs.readFileSync(path.join(REPO, 'js/words.js')).toString('base64')}`);
  const doc = (id, ...ts) => ({ id, title:`가짜 책 ${id}`, author:'', texts:ts.map((text) => ({ src:'메모', text })) });
  const docs = [
    doc('a', '슬픔이 오래 남았다. 슬픔을 견디는 고양이가 있었다. 사람들의 기억이 흐려진다.', '기억은 사라지지 않는다.'),
    doc('b', '슬픔은 사람을 바꾼다. 기억을 더듬어 슬픔에 닿았다. 고양이를 키우는 이웃을 만났다.', '살아가는 일은 어렵다.'),
    doc('c', '기억의 무게를 생각했다. 고양이는 창가에 앉았다. 슬픔과 고양이의 하루를 기억했다. 어제 읽었다.', '살아가고 살아가며 살아가기 때문에.'),
    doc('d', '한 권에만 나오는 호랑나비를 봤다. 호랑나비가 날았다. 호랑나비의 날개.'),
  ];
  const index = buildWordIndex(docs);
  const words = index.map((x) => x.word);
  console.log('낱말 뽑기');
  ok('조사를 떼고 한 낱말로 모은다', () => { assert(words.includes('슬픔')); assert(words.includes('기억')); assert(!words.some((w) => /^슬픔.|^기억./.test(w))); });
  ok('«고양이가»를 고양으로 자르지 않는다', () => { assert(words.includes('고양이')); assert(!words.includes('고양')); });
  ok('«기억했다»도 기억으로 센다', () => assert(index.find((x) => x.word === '기억').books.some((b) => b.id === 'c' && b.lines.some((l) => l.text.includes('기억했다')))));
  ok('용언은 낱말이 아니다', () => assert(!words.some((w) => w.startsWith('살아가'))));
  ok('한 권에만 나오는 말은 뺀다', () => assert(!words.includes('호랑나비')));
  ok('낱말마다 이어진 책과 문장이 있다', () => { const b = index.find((x) => x.word === '슬픔').books; assert.strictEqual(b.length, 3); assert(b.every((x) => x.lines.length && x.lines.every((l) => l.text.includes('슬픔')))); });
  ok('제목에 든 말은 그 책의 이어짐으로 치지 않는다', () => { const r = buildWordIndex([{ ...docs[0], title:'슬픔의 책' }, docs[1], docs[2]]); assert(!r.find((x) => x.word === '슬픔').books.some((b) => b.id === 'a')); });
  ok('글이 없어도 깨지지 않는다', () => { assert.deepStrictEqual(buildWordIndex([]), []); assert.deepStrictEqual(buildWordIndex([doc('x')]), []); assert.deepStrictEqual(relatedWords([], '슬픔'), []); });
  ok('해시태그·주소는 세지 않는다', () => { const r = buildWordIndex([doc('a', '#슬픔을 슬픔을 https://x.kr/슬픔은'), doc('b', '#슬픔을')]); assert.deepStrictEqual(r, []); });
  ok('기간으로 좁히면 한 권짜리가 빠진다', () => { const r = narrowIndex(index, new Set(['a', 'b'])); assert(r.find((x) => x.word === '슬픔').books.length === 2); assert(r.every((x) => x.books.length >= 2)); });
  ok('함께 나오는 낱말', () => assert(relatedWords(index, '슬픔').includes('기억')));
  ok('글 묶음: 왓챠 표시·읽고 싶음은 빼고 밑줄을 앞에 둔다', () => {
    const d = wordDoc('x', { t:'책', a:'', marks:[{ q:'밑줄 글', why:'생각 글' }], notes:[{ b:'메모 글' }, { b:'읽고 싶음', s:'want' }], recs:[{ l:'왓챠', b:'기록 글' }, { l:'한 줄 글' }] }, ['서평 글']);
    assert.deepStrictEqual(d.texts.map((t) => t.src), ['밑줄', '내 생각', '메모', '기록', '한 줄 평', '서평']);
  });

  console.log('연결망');
  const fakeIndex = Array.from({ length:40 }, (_, i) => ({ word:`낱말${i}`, n:50 - i, books:Array.from({ length:12 }, (__, b) => ({ id:`b${(i * 3 + b) % 60}`, n:1, lines:[] })) }));
  const graph = wordGraph(fakeIndex, 30);
  const sizes = graph.nodes.map((x, i) => ({ w:70 + (i % 5) * 9, h:i < 5 ? 45 : 40 }));
  const overlap = (l) => { let c = 0; l.points.forEach((p, i) => l.points.forEach((q, j) => { if (j > i && p.x < q.x + sizes[j].w && q.x < p.x + sizes[i].w && p.y < q.y + sizes[j].h && q.y < p.y + sizes[i].h) c++; })); return c; };
  ok('낱말마다 연결은 많아야 몇 개만 남는다', () => { assert(graph.edges.length > 0 && graph.edges.length <= 60); assert(graph.edges.every((e) => e.a < e.b)); });
  ok('겹치는 책이 없으면 잇지 않는다', () => assert.strictEqual(wordGraph([{ word:'가', books:[{ id:'a' }, { id:'b' }] }, { word:'나', books:[{ id:'c' }, { id:'d' }] }], 2).edges.length, 0));
  for (const width of [309, 690, 1150]) ok(`폭 ${width}: 칩이 겹치지 않고 칸 안에 있다`, () => { const l = layoutGraph(sizes, graph.edges, width); assert.strictEqual(overlap(l), 0); assert(l.height < width * 3 + 900, `높이가 너무 크다 ${l.height}`); l.points.forEach((p, i) => { assert(p.x >= -1 && p.x + sizes[i].w <= width + 1 && p.y >= -1 && p.y + sizes[i].h <= l.height + 1); }); });
  ok('같은 입력이면 같은 자리다', () => assert.deepStrictEqual(layoutGraph(sizes, graph.edges, 690), layoutGraph(sizes, graph.edges, 690)));
  ok('낱말이 적거나 없어도 깨지지 않는다', () => { assert.deepStrictEqual(layoutGraph([], [], 300).points, []); assert.strictEqual(layoutGraph([{ w:60, h:40 }], [], 0).height, 0); assert.strictEqual(layoutGraph([{ w:60, h:40 }], [], 300).points.length, 1); const wide = layoutGraph([{ w:400, h:40 }, { w:400, h:40 }], [], 300); assert.strictEqual(wide.points.length, 2); });

  console.log('공개 범위');
  ok('공개 데이터에 낱말 칸이 없다', () => assert(!/"(word|words|낱말|wordIndex)"/.test(fs.readFileSync(path.join(REPO, 'data/public.json'), 'utf8'))));
  ok('공개 반영 도구는 낱말을 만들지 않는다', () => assert(!/words\.js|buildWordIndex/.test(fs.readFileSync(path.join(REPO, 'tools/publish.js'), 'utf8'))));
  ok('앱은 주인 화면에서만 낱말 지도를 그린다', () => { const app = fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8'); const i = app.indexOf("cards.push(foldCard('word'"); assert(i > 0); assert(app.slice(0, i).lastIndexOf('if (S.owner) {') > app.indexOf('function renderRecap')); assert((app.match(/wordCard\(/g) || []).length === 2); });
  ok('레포 파일이 서비스워커 목록에 있다', () => { assert(fs.readFileSync(path.join(REPO, 'sw.js'), 'utf8').includes("'js/words.js'")); assert(fs.readFileSync(path.join(REPO, 'my/sw.js'), 'utf8').includes("'../js/words.js'")); });

  console.log('볼트 자동낱말');
  const vault = path.join(tmp, 'vault'), bookDir = path.join(vault, '4-독서·문화'), outDir = path.join(bookDir, '밑줄');
  fs.mkdirSync(bookDir, { recursive:true });
  const mark = (id, q, why) => ({ id, d:'2026-11-07', p:'1', q, why:why || '' });
  const data = { works:{
    a:{ t:'가짜 책 가', a:'', k:'book', known:true, notes:docs[0].texts.map((x) => ({ b:x.text })), marks:[mark('m1', '슬픔이 고양이를 깨웠다.', '기억이 났다.')] },
    b:{ t:'가짜 책 나', a:'', k:'book', known:true, notes:docs[1].texts.map((x) => ({ b:x.text })) },
    c:{ t:'가짜 책 다', a:'', k:'book', known:true, notes:docs[2].texts.map((x) => ({ b:x.text })), marks:[mark('m2', '아무 낱말도 없다.')] },
    e:{ t:'', k:'book', notes:[{ b:'제목을 모르는 칸의 슬픔이다.' }] },
    f:{ t:'나만 보는 여행', k:'trip', known:true, notes:[{ b:'여행의 슬픔을 슬픔으로 적었다.' }] },
  } };
  const dataFile = path.join(tmp, 'data.json');
  const save = () => fs.writeFileSync(dataFile, JSON.stringify(data));
  const exp = (...a) => execFileSync(process.execPath, [path.join(REPO, 'tools/export-obsidian.js'), dataFile, '--vault', vault, ...a], { encoding:'utf8', cwd:tmp });
  save(); exp();
  const f = path.join(outDir, '가짜 책 가.md'), g = path.join(outDir, '가짜 책 다.md');
  const read = () => fs.readFileSync(f, 'utf8');
  ok('자동낱말이 링크로 들어가고 낱말 칸은 비어 있다', () => { const t = read(); assert(t.includes('"[[4-독서·문화/낱말/슬픔|슬픔]]"')); assert(t.includes('"[[4-독서·문화/낱말/기억|기억]]"')); assert(t.includes('낱말: []')); });
  ok('밑줄에 없는 낱말은 넣지 않는다', () => assert(!/자동낱말:/.test(fs.readFileSync(g, 'utf8'))));
  ok('다시 돌려도 바뀌지 않는다', () => { const before = read(); assert(/고침: 0/.test(exp())); assert.strictEqual(read(), before); });
  fs.writeFileSync(f, read().replace('낱말: []', '낱말:\n  - 내가 넣은 말\n별표: true'));
  data.works.a.marks[0].q = '기억만 남았다.';
  data.works.a.marks[0].why = '';
  save(); exp();
  ok('사람이 넣은 낱말은 그대로 두고 자동낱말만 바뀐다', () => { const t = read(); assert(t.includes('낱말:\n  - 내가 넣은 말')); assert(t.includes('별표: true')); assert(t.includes('"[[4-독서·문화/낱말/기억|기억]]"')); assert(!t.includes('낱말/슬픔')); });
  const out = exp('--dry-run');
  ok('밑줄 없는 칸과 제목 모르는 칸이 있어도 끝까지 돈다', () => assert(/밑줄있는책: 2/.test(out)));
  ok('출력에 낱말이 없다', () => assert(!/슬픔|기억|고양이/.test(out)));

  fs.rmSync(tmp, { recursive:true, force:true });
  console.log(`통과 ${passed}건`);
})().catch((e) => { console.error(e); process.exit(1); });
