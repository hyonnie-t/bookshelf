// 책등 색 규칙 시험: 모든 표지 색 × 에디션 × 밝은·어두운 판에서 글자 대비 4.5 이상인지, 에디션끼리 눈에 띄게 다른지 본다
// 사용: node tools/test-spine-paint.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const REPO = path.join(__dirname, '..');
(async () => {
  const { spineColor, contrast, SPINE_EDITIONS, SAMPLE_COVERS } = await import(`data:text/javascript;base64,${fs.readFileSync(path.join(REPO, 'js/spine.js')).toString('base64')}`);
  const covers = Object.entries(JSON.parse(fs.readFileSync(path.join(REPO, 'data/spines.json'), 'utf8')).c);
  let fail = 0;
  const ok = (name, fn) => { try { fn(); console.log('통과', name); } catch (e) { fail++; console.log('실패', name, '-', e.message); } };
  const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
  const hue = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); const M = Math.max(r, g, b), m = Math.min(r, g, b), d = M - m; if (d < 0.04) return null; return ((M === r ? (g - b) / d + 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60) % 360; };
  const eds = Object.keys(SPINE_EDITIONS);
  const blkOk = (p) => !p.blk || contrast(p.blk, p.ink) >= 4.5;
  ok(`대비 4.5 이상: ${covers.length}권 × 에디션 ${eds.length} × 밝은·어두운 판`, () => {
    let min = 99;
    for (const ed of eds) for (const dark of [false, true]) for (const [id, c] of covers.concat(SAMPLE_COVERS.map((x, i) => ['s' + i, [x]]))) {
      const p = spineColor(c, ed, dark, hash(id)); const k = contrast(p.bg, p.ink); min = Math.min(min, k);
      assert(blkOk(p), 'blk ' + ed + ' ' + id); assert(k >= 4.5, `${ed} ${dark ? '어두운' : '밝은'} 판 ${id}: ${k.toFixed(2)}`);
      assert(/^#[0-9a-f]{6}$/.test(p.bg) && /^#[0-9a-f]{6}$/.test(p.ink), '색 형식');
    }
    console.log('   가장 낮은 대비', min.toFixed(2));
  });
  ok('에디션을 바꾸면 책등 색이 바뀐다(칠한 책의 90% 이상)', () => {
    for (const ed of eds.filter((e) => e !== 'base' && e !== 'night')) {
      const diff = covers.filter(([id, c]) => spineColor(c, ed, false, hash(id)).bg !== spineColor(c, 'base', false, hash(id)).bg).length;
      assert(diff / covers.length > 0.9, `${ed}: ${diff}/${covers.length}`);
    }
  });
  ok('팔레트 에디션은 색상이 한쪽에 모인다(색 있는 책등의 기준 색상에서 60° 안)', () => {
    for (const ed of ['paper', 'forest', 'sea', 'blossom']) {
      const hs = covers.map(([id, c]) => hue(spineColor(c, ed, false, hash(id)).bg)).filter((h) => h != null);
      const mid = hue(spineColor(['#888888'], ed, false, 0).bg) ?? hs[0];
      const far = hs.filter((h) => Math.min(Math.abs(h - mid), 360 - Math.abs(h - mid)) > 60).length;
      assert(far / hs.length < 0.05, `${ed}: 벗어난 책 ${far}/${hs.length}`);
    }
  });
  ok('같은 책은 늘 같은 색', () => { const [id, c] = covers[0]; assert.deepStrictEqual(spineColor(c, 'sea', true, hash(id)), spineColor(c, 'sea', true, hash(id))); });
  ok('레포 파일이 서비스워커 목록에 있다', () => { assert(fs.readFileSync(path.join(REPO, 'sw.js'), 'utf8').includes("'js/spine.js'")); assert(fs.readFileSync(path.join(REPO, 'my/sw.js'), 'utf8').includes("'../js/spine.js'")); });
  console.log(fail ? `실패 ${fail}건` : '모두 통과'); process.exit(fail ? 1 : 0);
})();
