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
const INK = [0, 0, 0], PAPER = [255, 255, 255]; // 순수 검정이어야 어떤 바탕에서도 검정·흰색 중 하나가 4.58 이상(#111이면 중간 밝기 빨강·초록에서 4.35~4.48, 검토자 재현)
// 저장된 색이 대비 4.5 미만이면 검정·흰색 중 큰 쪽으로 바꾼다(옛 계산으로 저장된 색 바로잡기)
function fixText(base, text) {
  const b = rgb(base);
  if (contrast(rgb(text), b) >= 4.5) return text;
  return contrast(INK, b) >= contrast(PAPER, b) ? '#000000' : '#ffffff';
}

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

// 표지 세로 색 조각(2026-11-14 2단계): 표지를 위에서 아래로 n칸으로 나눠 칸마다 가장 넓은 색을 뽑는다. 책등에 흐릿한 표지 조각처럼 깐다.
// 가운데 70% 폭만 본다(가장자리 테두리·띠지 그림자 제외). 돌려주는 값은 '#' 없는 6자리 색을 이어 붙인 문자열(색만 저장, 그림·주소는 저장하지 않는다).
function stripes(data, w, h, n = 7) {
  const x0 = Math.round(w * 0.15), x1 = Math.round(w * 0.85), my = Math.round(h * 0.04);
  const out = [];
  for (let i = 0; i < n; i++) {
    const ya = my + Math.floor((h - 2 * my) * i / n), yb = my + Math.floor((h - 2 * my) * (i + 1) / n);
    const bins = new Map();
    for (let y = ya; y < yb; y++) for (let x = x0; x < x1; x++) {
      const o = (y * w + x) * 4; if (data[o + 3] < 128) continue;
      const k = (data[o] >> 5) << 6 | (data[o + 1] >> 5) << 3 | (data[o + 2] >> 5);
      const e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += data[o]; e.g += data[o + 1]; e.b += data[o + 2]; bins.set(k, e);
    }
    const top = [...bins.values()].sort((a, b) => b.n - a.n)[0];
    if (!top) return '';
    out.push(hex([top.r / top.n, top.g / top.n, top.b / top.n]).slice(1));
  }
  return out.join('');
}

module.exports = { pickColors, fixText, stripes, contrast, rgb, hex };
