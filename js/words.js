// 낱말 지도: 내 글에서 자주 나오는 낱말을 뽑는다. 사전이나 형태소 분석기 없이 글 자체의 통계로 명사를 가려낸다.
// 어절을 «앞말+조사» 또는 «앞말+어미»로 나눠 보고, 조사가 여러 가지 붙는 앞말만 낱말로 친다.
// 브라우저(js/app.js)와 볼트 내보내기(tools/export-obsidian.js)가 같이 쓴다. 다른 파일을 불러오지 않는다.

const longestFirst = (s) => s.split(' ').sort((a, b) => b.length - a.length);
// 명사 뒤에 붙는 말
const JOSA = longestFirst('이라는 이라고 이라면 이라서 이라도 이라며 이라니 이지만 이었다 이었고 이었던 이었는데 이었지만 이에요 이었어요 입니다 이니까 으로부터 으로서 으로써 으로는 으로도 에서는 에서도 에서의 에서만 에서부터 에게는 에게도 에게서 에게만 한테서 한테는 까지는 까지도 부터는 부터도 처럼 만큼 보다는 보다도 보다 조차 마저 밖에 이나 이며 이고 이면 이다 이란 이랑 으로 에서 에게 한테 께서 까지 부터 라는 라고 라면 라서 라도 라며 였다 였고 였던 였는데 였지만 예요 에는 에도 에의 와는 와도 와의 과는 과도 과의 로는 로도 로서 로써 은 는 이 가 을 를 의 에 와 과 도 만 로 나 랑 란');
// 조사로 끝나는 듯 보이지만 흔히 용언 끝인 것은 낱말 증거로 치지 않는다(«살아가는», «아름다운 것이»)
const WEAK = new Set(['은', '는', '나', '란', '로', '라고', '라며', '라서', '이나', '이고', '이며', '이면', '이다', '이란', '이라고']);
// «하다·되다»가 붙은 꼴: 생각했다 → 생각, 기억되는 → 기억. 앞말이 이미 낱말로 확인됐을 때만 벗긴다
const HA = longestFirst('하다 하는 하고 하며 하면 하게 하기 하지 하니 하여 하던 하자 하나 하기도 하기에 하기로 하기는 하지만 하면서 하려고 하려는 합니다 합니까 했다 했고 했던 했지 했는데 했으나 했지만 했으면 했을 했어 했어요 했습니다 해서 해도 해야 해요 해진 해지는 해졌다 한 할 함 되다 되는 되고 되며 되면 되어 되기 되지 되던 된다 된 될 됐다 됐고 됐던 돼서 시키는 시키고 시킨 스러운 스럽게 스럽다 적인 적으로');
// 용언 어미: 이것이 많이 붙는 앞말은 명사가 아니다
const EOMI = longestFirst('다 고 며 면 서 니 지 게 기 던 네 죠 까 자 요 어 아 음 ㅁ 는데 지만 면서 니까 어서 아서 어도 아도 어요 아요 었다 았다 었고 았고 었던 았던 었어 았어 겠다 는다 습니다 ㅂ니다 려고 려는 도록 다가 다고 다는 다면 다니 으며 으면 으니 으려 을까 을지 을 은데 는지');
const VERBISH = /(하|했|되|됐|돼|같|있|없|않|않았|였|었|았|겠|시키|스럽|롭|답)$/;

// 낱말로 치지 않는 말: 대명사·수·때·자리처럼 뜻이 얕은 말과, 서평이면 어디에나 나오는 말
const STOP = new Set(`
것 수 등 때 곳 쪽 점 중 안 속 위 앞 뒤 옆 밖 간 분 번 년 월 일 개 권 명 살 쯤 뿐 듯 채 줄 데 바 김 측 편 씩 째 건
이것 그것 저것 이거 그거 저거 여기 거기 저기 이곳 그곳 저곳 이런 그런 저런 어떤 무슨 어느 이번 저번 다음 이전 이후 이상 이하 이미 아직 다시 또한 또는 그리고 그러나 하지만 그래서 그런데 그러면 그러니 그래도 그렇게 이렇게 저렇게 어떻게 왜냐하면 따라서 때문 때문에 위해 위한 대해 대한 통해 통한 관해 관한 의해 의한 인해 인한 따라 비해 향해 함께 같이 모두 모든 각각 서로 스스로 자신 자기 우리 저희 나의 내가 네가 제가 누가 누구 무엇 뭔가 무언가 어디 언제 얼마 얼마나 정말 진짜 너무 아주 매우 가장 조금 많이 약간 거의 항상 계속 결국 사실 물론 역시 과연 혹은 만약 아마 아마도 비록 비로소 마치 오히려 차라리 바로 모두가 하나 하나의 둘 셋 넷 다섯 여섯 일곱 여덟 아홉 열 첫째 둘째 셋째 한번 처음 마지막 나중 지금 오늘 어제 내일 요즘 최근 올해 작년 내년 그때 이때 당시 동안 사이 정도 경우 자체 부분 전체 대부분 일부 대로 만큼 나름 나머지 가지 종류 방법 이유 결과 과정 상황 모습 느낌 기분 생각 내용 의미 부족 필요 가능 중요 다양 특히 그냥 이제 먼저 아무 더욱 점점 전혀 굉장히 무척 꽤 다만 단지 오직 게다가 예를 들어 이야기 얘기 말 글 책 소설 작가 저자 독서 독자 서평 리뷰 후기 감상 문장 작품 제목 표지 출판사 번역 옮김 지음 쪽 페이지 주인공 인물 등장인물 사람 사람들 부분 권 한권 일들 전반 세기 사고 키워드 분량 예상 기간 않기 도서 대해서 건지 하기 그들 이들 저들 것들 분들 책들 추천 소개 구성 표현 설명 서평단 독서모임 필사 전문 핵심 있어서 있기 되기 싶지 앞으로 그럼 누군가 에서 관심 역할 입장 인상 덕분 지점 실제 각자 부정 도움 시기 기준 영향 활동 주변 현재 하지 재미 공감 방향 읽기 읽은 읽는 올린 스타그램 책스타그램 북스타그램 시리즈 저서 출간 한국 인간 경험 시작 이해 모르 아니 아닌 아니라 아니다 그렇 그럴 그러 같은 같다 있는 있다 없는 없다 없이 되는 하는 해서 한다 된다 이다 말이 사실은 보면 보니 보고 보는 가지고 나서 받아 살아 들어 알게 만들 만든 만드는
`.trim().split(/\s+/));

const cleanText = (s) => String(s || '').replace(/https?:\S+/g, ' ').replace(/[#@][^\s#@]+/g, ' ');
const eojeols = (s) => cleanText(s).match(/[가-힣]+|[A-Z]{2,}/g) || [];
export const sentencesOf = (s) => cleanText(s).split(/\n+|(?<=[.!?…。])\s+/).map((x) => x.replace(/\s+/g, ' ').trim()).filter((x) => x.length >= 6);

// 어절을 앞말과 뒤에 붙은 말로 나눈 후보들. 앞말은 두 글자 이상
function splits(word, list) {
  const out = [];
  for (const r of list) if (word.length - r.length >= 2 && word.endsWith(r)) out.push([word.slice(0, -r.length), r]);
  return out;
}
const dropPlural = (w) => (w.length >= 3 && /[들님]$/.test(w) ? w.slice(0, -1) : w);
// «나에게»«속에서»처럼 앞말이 한 글자이거나 뺄 말이면 낱말이 아니다. «개인적»처럼 적으로 끝나는 말도 뺀다
const isThin = (w) => STOP.has(w) || w.length < 2 || (w.length >= 3 && w.endsWith('적')) || w.endsWith('으') || JOSA.some((r) => w.endsWith(r) && (w.length - r.length === 1 || STOP.has(w.slice(0, -r.length))));

// 글 전체를 훑어 «이 말 뒤에 무슨 조사·어미가 붙었나»를 센다
function learn(tokens) {
  const josa = new Map(), eomi = new Map(), bare = new Map();
  const bump = (m, k, r) => { if (!m.has(k)) m.set(k, new Map()); const x = m.get(k); x.set(r, (x.get(r) || 0) + 1); };
  for (const [t, c] of tokens) {
    bare.set(t, (bare.get(t) || 0) + c);
    for (const [l, r] of splits(t, JOSA)) { const x = josa.get(l) || new Map(); josa.set(l, x); x.set(r, (x.get(r) || 0) + c); }
    for (const [l, r] of splits(t, EOMI)) bump(eomi, l, r);
  }
  const nouns = new Set();
  const score = new Map();
  for (const [l, rs] of josa) {
    const strong = [...rs.keys()].filter((r) => !WEAK.has(r));
    const hits = [...rs.values()].reduce((a, b) => a + b, 0);
    const verbForms = eomi.has(l) ? eomi.get(l).size : 0;
    if (strong.length < 2 || VERBISH.test(l) || verbForms > strong.length) continue;
    nouns.add(l);
    score.set(l, hits + (bare.get(l) || 0));
  }
  return { nouns, score };
}

// 어절 하나가 어떤 낱말인지. 후보가 여럿이면 조사가 더 많이 확인된 쪽(«고양이가»의 고양이)
function stemOf(t, known) {
  if (/^[A-Z]/.test(t)) return t;
  const { nouns, score } = known;
  let best = nouns.has(t) ? t : '', bestScore = best ? score.get(t) : 0;
  for (const [l] of splits(t, JOSA)) if (nouns.has(l) && score.get(l) > bestScore) { best = l; bestScore = score.get(l); }
  if (!best) for (const [l] of splits(t, HA)) if (nouns.has(l) && score.get(l) > bestScore) { best = l; bestScore = score.get(l); }
  // «존재만으로» → 존재만 → 존재: 찾은 말이 더 굵은 낱말+조사이면 한 번 더 벗긴다
  for (let again = !!best; again;) { again = false; for (const [l] of splits(best, JOSA)) if (nouns.has(l) && score.get(l) > score.get(best)) { best = l; again = true; break; } }
  return best;
}

// 책 한 권의 글 묶음. 앱과 볼트 내보내기가 같은 기준을 쓴다. 밑줄을 먼저 두어 문장을 보여 줄 때 앞에 나온다
export const WORD_KINDS = ['book', 'film', 'show'];
export function wordDoc(id, w, reviews) {
  const list = (v) => (Array.isArray(v) ? v : Object.values(v || {})).filter(Boolean);
  const texts = [];
  list(w.marks).forEach((m) => { texts.push({ src:'밑줄', text:m.q }); if (m.why) texts.push({ src:'내 생각', text:m.why }); });
  list(w.notes).forEach((n) => { if (n.s !== 'want') texts.push({ src:'메모', text:n.b }); });
  list(w.recs).forEach((r) => { if (r.l && r.l !== '왓챠') texts.push({ src:'한 줄 평', text:r.l }); if (r.b) texts.push({ src:'기록', text:r.b }); });
  (reviews || []).forEach((x) => texts.push({ src:'서평', text:x }));
  return { id, title:w.t || '', author:w.a || '', texts:texts.filter((x) => String(x.text || '').trim()) };
}

// 기간으로 좁히기: 그 책들만 남기고 한 권짜리가 된 낱말을 뺀다
export function narrowIndex(index, ids) {
  return index.map((x) => { const books = x.books.filter((b) => ids.has(b.id)); return { ...x, books, n:books.reduce((a, b) => a + b.n, 0) }; })
    .filter((x) => x.books.length >= 2)
    .sort((a, b) => b.books.length - a.books.length || b.n - a.n || a.word.localeCompare(b.word, 'ko'));
}

// docs: [{ id, title, author, texts:[{ src, text }] }]
// 돌려주는 값: [{ word, n(나온 횟수), books:[{ id, n, lines:[{ src, text }] }] }]를 많이 이어진 순서로. 한 책에만 나오는 낱말은 빼고(이름·오타가 대부분이다), 글이 있는 책이 스무 권 이상일 때 40% 넘는 책에 나오는 낱말도 뺀다(어디에나 있어 잇는 힘이 없다)
export function buildWordIndex(docs, opts = {}) {
  const minBooks = opts.minBooks || 2;
  const counts = new Map();
  docs.forEach((d) => d.texts.forEach((x) => eojeols(x.text).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1))));
  const known = learn(counts);
  const cache = new Map();
  const stem = (t) => { if (!cache.has(t)) { const s = dropPlural(stemOf(t, known)); cache.set(t, s && !isThin(s) ? s : ''); } return cache.get(t); };
  const words = new Map();
  docs.forEach((d) => {
    const own = (d.title || '').replace(/\s+/g, '') + (d.author || '').replace(/\s+/g, ''); // 제목·저자에 든 말은 그 책의 이어짐으로 치지 않는다(서평 첫 줄에 늘 적혀서)
    d.texts.forEach((x) => sentencesOf(x.text).forEach((line) => {
      const seen = new Set();
      eojeols(line).forEach((t) => {
        const w = stem(t);
        if (!w || own.includes(w)) return;
        if (!words.has(w)) words.set(w, new Map());
        const books = words.get(w);
        if (!books.has(d.id)) books.set(d.id, { id:d.id, n:0, lines:[] });
        const b = books.get(d.id);
        b.n++;
        if (!seen.has(w)) { seen.add(w); b.lines.push({ src:x.src, text:line }); }
      });
    }));
  });
  const withText = docs.filter((d) => d.texts.length).length;
  const cap = withText >= 20 ? withText * .4 : Infinity;
  return [...words.entries()]
    .map(([word, books]) => ({ word, n:[...books.values()].reduce((a, b) => a + b.n, 0), books:[...books.values()] }))
    .filter((x) => x.books.length >= minBooks && x.books.length <= cap)
    .sort((a, b) => b.books.length - a.books.length || b.n - a.n || a.word.localeCompare(b.word, 'ko'));
}

// 같은 책에 함께 나오는 낱말. 많이 나오는 말이 늘 앞서지 않게 겹치는 비율로 줄 세운다
export function relatedWords(index, word, limit = 6) {
  const me = index.find((x) => x.word === word);
  if (!me) return [];
  const mine = new Set(me.books.map((b) => b.id));
  return index.filter((x) => x.word !== word).map((x) => {
    const both = x.books.filter((b) => mine.has(b.id)).length;
    return { word:x.word, both, rate:both / (mine.size + x.books.length - both) };
  }).filter((x) => x.both >= 2).sort((a, b) => b.rate - a.rate || b.both - a.both).slice(0, limit).map((x) => x.word);
}

// 연결망: 위쪽 낱말끼리 같은 책에 겹치는 비율로 잇는다. 많이 나오는 낱말은 서로 다 이어지므로 낱말마다 가장 강한 연결만 남긴다
export function wordGraph(index, count, perNode = 2) {
  const nodes = index.slice(0, count);
  const sets = nodes.map((x) => new Set(x.books.map((b) => b.id)));
  const edges = new Map();
  nodes.forEach((_, i) => {
    const near = [];
    nodes.forEach((__, j) => {
      if (i === j) return;
      let both = 0;
      sets[i].forEach((id) => { if (sets[j].has(id)) both++; });
      if (both >= 2) near.push({ j, w:both / (sets[i].size + sets[j].size - both) });
    });
    near.sort((a, b) => b.w - a.w || a.j - b.j).slice(0, perNode).forEach(({ j, w }) => edges.set(i < j ? `${i}-${j}` : `${j}-${i}`, { a:Math.min(i, j), b:Math.max(i, j), w }));
  });
  return { nodes, edges:[...edges.values()] };
}

// 낱말 자리 정하기: 이어진 낱말은 당기고 모든 낱말은 밀어낸 뒤, 겹치는 칩을 떼어 놓는다. 무작위를 쓰지 않아 같은 입력이면 같은 자리다
// sizes: [{ w, h }], 돌려주는 값: { height, points:[{ x, y }] }(칩의 왼쪽 위). 칩이 겹치지 않을 때까지 높이를 늘린다
export function layoutGraph(sizes, edges, width, gap = 6) {
  const n = sizes.length;
  if (!n || !(width > 0)) return { height:0, points:sizes.map(() => ({ x:0, y:0 })) };
  const area = sizes.reduce((a, r) => a + (r.w + gap) * (r.h + gap), 0);
  let H = Math.max(n > 1 ? 150 : 0, Math.max(...sizes.map((r) => r.h)) + gap * 2, area * (width < 560 ? 2.2 : 3.2) / width);
  const pos = sizes.map((_, i) => { const r = Math.sqrt((i + .5) / n) * .46, t = i * 2.39996; return { x:width / 2 + r * width * Math.cos(t), y:H / 2 + r * H * Math.sin(t) }; });
  const clamp = (i) => {
    const hw = Math.min(sizes[i].w / 2, width / 2), hh = sizes[i].h / 2;
    pos[i].x = Math.min(width - hw, Math.max(hw, pos[i].x));
    pos[i].y = Math.min(H - hh, Math.max(hh, pos[i].y));
  };
  const k = Math.sqrt(width * H / n);
  for (let step = 0; step < 240; step++) {
    const heat = Math.max(width, H) * .08 * (1 - step / 240) + 1, move = pos.map(() => ({ x:0, y:0 }));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y, d = Math.max(1, Math.hypot(dx, dy)), push = k * k / d / d;
      move[i].x += dx * push; move[i].y += dy * push; move[j].x -= dx * push; move[j].y -= dy * push;
    }
    edges.forEach(({ a, b }) => {
      const dx = pos[a].x - pos[b].x, dy = pos[a].y - pos[b].y, d = Math.max(1, Math.hypot(dx, dy)), pull = d / k;
      move[a].x -= dx * pull; move[a].y -= dy * pull; move[b].x += dx * pull; move[b].y += dy * pull;
    });
    for (let i = 0; i < n; i++) {
      move[i].x += (width / 2 - pos[i].x) * .04; move[i].y += (H / 2 - pos[i].y) * .04;
      const len = Math.max(1, Math.hypot(move[i].x, move[i].y)), by = Math.min(len, heat) / len;
      pos[i].x += move[i].x * by; pos[i].y += move[i].y * by;
      clamp(i);
    }
  }
  // 많이 나온 낱말부터 힘 계산 자리에 놓고, 겹치면 둘레를 나선으로 돌며 가장 가까운 빈자리를 찾는다. 자리가 없으면 세로로 늘려 다시 놓는다
  const start = pos.map((p) => ({ ...p }));
  const free = (i, x, y, done) => {
    const hw = sizes[i].w / 2, hh = sizes[i].h / 2;
    if (x - hw < -.5 && width >= sizes[i].w) return false;
    if (x + hw > width + .5 && width >= sizes[i].w) return false;
    if (y - hh < 0 || y + hh > H) return false;
    return done.every((j) => Math.abs(x - pos[j].x) >= (sizes[i].w + sizes[j].w) / 2 + gap || Math.abs(y - pos[j].y) >= (sizes[i].h + sizes[j].h) / 2 + gap);
  };
  for (let round = 0; round < 60; round++) {
    const done = [];
    let placed = true;
    for (let i = 0; i < n && placed; i++) {
      placed = false;
      const cx = start[i].x, cy = start[i].y, reach = Math.hypot(width, H);
      for (let r = 0; r <= reach && !placed; r += 8) {
        const tries = r ? Math.max(8, Math.round(r / 6)) : 1;
        for (let t = 0; t < tries && !placed; t++) {
          const x = cx + r * Math.cos(t / tries * 6.28318), y = cy + r * Math.sin(t / tries * 6.28318);
          if (free(i, x, y, done)) { pos[i].x = width >= sizes[i].w ? x : sizes[i].w / 2; pos[i].y = y; placed = true; }
        }
      }
      if (placed) done.push(i);
    }
    if (placed) break;
    const grown = H * 1.08;
    start.forEach((p) => { p.y *= grown / H; });
    H = grown;
  }
  return { height:Math.ceil(H), points:pos.map((p, i) => ({ x:Math.round(p.x - sizes[i].w / 2), y:Math.round(p.y - sizes[i].h / 2) })) };
}
