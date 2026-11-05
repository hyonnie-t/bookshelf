// 왓챠피디아 영화·시리즈 기록을 책장 비공개 칸(works)에 넣을 묶음으로 만든다. Firebase에 직접 쓰지 않는다.
// 입력 폴더: watcha_movies.json watcha_series.json watcha_calendar.json watcha_comments.json (레포 밖 임시 폴더)
// 사용: node tools/import-watcha.js <입력 폴더> <private.local.json> <출력 patch.json>
// 그 뒤: npx.cmd firebase-tools database:update /users/<uid>/bookshelf/works patch.json --project timetable-af612
// 건수만 출력한다. 제목·별점·코멘트 내용은 출력하지 않는다.
const fs = require('fs'), path = require('path');
const [dir, privPath, outPath] = process.argv.slice(2);
if (!outPath) throw new Error('사용법: node tools/import-watcha.js <입력 폴더> <private.local.json> <patch.json>');
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const IN = (n) => J(path.join(dir, `watcha_${n}.json`));
const priv = J(privPath), works = priv.works || {};
const cal = IN('calendar'), comments = IN('comments');
const rows = [...IN('movies'), ...IN('series')];

// 하루에 10건 이상 평가한 날은 몰아서 평가한 날이다. 본 날짜로 보지 않는다
const BULK = 10;
const perDay = {};
cal.forEach((c) => { perDay[c.d] = (perDay[c.d] || 0) + 1; });
const calBy = new Map(cal.map((c) => [c.c, c.d]));
const cmBy = new Map(comments.map((c) => [c.wid, c]));

const norm = (s) => String(s || '').toLowerCase().replace(/[\s:·,.!?'"\-–—()\[\]<>《》「」«»~]/g, '');
const titleCount = {};
rows.forEach((r) => { const n = norm(r.t); titleCount[n] = (titleCount[n] || 0) + 1; });
// 이미 있는 영화 기록(왓챠에서 온 것 제외)과 제목이 하나씩만 맞으면 그 기록에 붙인다. 같은 제목이 여럿이면 새 칸으로 둔다
const films = Object.entries(works).filter(([, w]) => w.k === 'film' && !w.del && !w.wc);
const filmsBy = {};
films.forEach(([id, w]) => { const n = norm(w.t); (filmsBy[n] = filmsBy[n] || []).push(id); });
const already = new Set(Object.values(works).map((w) => w.wc).filter(Boolean));

const recOf = (r) => {
  const day = calBy.get(r.wid) || '';
  const bulk = day && perDay[day] >= BULK;
  const cm = cmBy.get(r.wid);
  const rec = { d:bulk ? '' : day, r:r.r, l:'왓챠' };
  if (bulk) rec.rd = day; // 몰아서 평가한 날은 평가한 날로만 남긴다. d에 넣으면 앱이 연도로 쓴다
  if (cm && cm.b) { rec.b = cm.b; if (cm.d) rec.cd = cm.d; }
  return rec;
};

const patch = {};
const n = { 새칸:0, 기존에붙임:0, 건너뜀:0, 연도있음:0, 연도없음:0, 코멘트:0 };
rows.forEach((r) => {
  if (!r.wid || !r.t || r.r == null) throw new Error('빈 칸이 있는 행');
  if (already.has(r.wid)) { n.건너뜀++; return; }
  const rec = recOf(r);
  if (rec.b) n.코멘트++;
  const key = norm(r.t), hits = filmsBy[key] || [];
  if (hits.length === 1 && titleCount[key] === 1) {
    const w = works[hits[0]];
    patch[hits[0]] = { ...w, known:true, wc:r.wid, recs:[...(w.recs || []), rec] };
    n.기존에붙임++;
    return;
  }
  const id = `wc${r.wid}`;
  if (works[id]) { n.건너뜀++; return; }
  const y = rec.d ? rec.d.slice(0, 4) : '';
  patch[id] = { t:r.t, a:'', k:'film', y, fd:rec.d, known:true, wc:r.wid, recs:[rec] };
  n.새칸++;
  if (y) n.연도있음++; else n.연도없음++;
});
fs.writeFileSync(outPath, JSON.stringify(patch));
console.log({ 입력:rows.length, ...n, 쓸칸:Object.keys(patch).length, 기존칸전체:Object.keys(works).length });
