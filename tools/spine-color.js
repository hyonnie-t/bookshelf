// 표지 그림(RGBA 픽셀)에서 책등 색 세 개를 뽑는다. tools/cover-colors.js와 tools/test-spine-color.js가 같이 쓴다.
// 바탕: 표지 가장자리(좌우 6%·위아래 4%)를 뺀 곳에서 가장 넓은 색 덩어리(실제 책등은 대개 표지 바탕색과 같다).
// 글자: 표지 안 다른 덩어리 중 넓이 1% 이상이면서 바탕과 대비 4.5 이상인 첫 색. 없으면 검정·흰색 중 대비가 큰 쪽.
// 강조: 넓이 3% 이상, 바탕과 충분히 다른 색 중 넓고 진한 색(책등 줄 장식에 쓴다). 없으면 빈 값.
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (x, y) => { const a = lum(x), b = lum(y); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
const hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const dist = (x, y) => Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
const sat = ([r, g, b]) => { const M = Math.max(r, g, b), m = Math.min(r, g, b); return M ? (M - m) / M : 0; };
const INK = [17, 17, 17], PAPER = [255, 255, 255];

function pickColors(data, w, h) {
  const mx = Math.round(w * 0.06), my = Math.round(h * 0.04);
  const bins = new Map(); let n = 0;
  for (let y = my; y < h - my; y++) for (let x = mx; x < w - mx; x++) {
    const o = (y * w + x) * 4; if (data[o + 3] < 128) continue;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const k = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
    const e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += r; e.g += g; e.b += b; bins.set(k, e); n++;
  }
  if (!n) return null;
  // 인쇄 망점·압축 때문에 한 색이 여러 칸에 흩어지므로 가까운 칸(거리 40 안)을 넓은 칸부터 합친다
  const list = [...bins.values()].map((e) => ({ c: [e.r / e.n, e.g / e.n, e.b / e.n], n: e.n })).sort((a, b) => b.n - a.n);
  const groups = [];
  for (const e of list) {
    const g = groups.find((g) => dist(g.c, e.c) < 40);
    if (g) { const t = g.n + e.n; g.c = g.c.map((v, i) => (v * g.n + e.c[i] * e.n) / t); g.n = t; } else groups.push({ ...e });
  }
  groups.sort((a, b) => b.n - a.n); groups.forEach((g) => { g.share = g.n / n; });
  const base = groups[0].c;
  const accent = groups.slice(1).filter((g) => g.share > 0.03 && dist(g.c, base) > 80)
    .sort((a, b) => b.share * (0.5 + sat(b.c)) - a.share * (0.5 + sat(a.c)))[0];
  const cand = groups.slice(1).find((g) => g.share > 0.01 && contrast(g.c, base) >= 4.5);
  const text = cand ? cand.c : contrast(INK, base) >= contrast(PAPER, base) ? INK : PAPER;
  return { base: hex(base), text: hex(text), accent: accent ? hex(accent.c) : '', share: groups[0].share };
}

module.exports = { pickColors, contrast, rgb, hex };
