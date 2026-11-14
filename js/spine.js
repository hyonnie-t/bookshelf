// 책등 색 규칙(2026-11-14): 표지에서 뽑은 색(data/spines.json)을 그대로 칠하지 않고, 고른 색 에디션의 범위 안으로 옮겨 칠한다.
// - 표지 색(base): 표지의 색상은 그대로 두고 채도·밝기만 한 범위로 모은다. 흰 표지는 강조색 쪽으로 살짝 물든 종이색이 된다.
// - 나머지 에디션: 색상은 에디션 팔레트에서 고르고, 책마다 표지의 밝기(와 진하기 조금)만 빌려 온다.
// 글자색은 칠한 바탕과 대비 4.5 이상이 될 때까지 바탕 밝기를 밀어 맞춘다(밝은 판·어두운 판 모두, 시험 tools/test-spine-paint.js).
// 브라우저(js/app.js)와 시험이 같이 쓴다. 다른 파일을 불러오지 않는다.

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const hexOf = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0')).join('');

function toLch(hex) {
  const [r, g, b] = rgbOf(hex).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180 / Math.PI + 360) % 360];
}
function linRgb(L, C, H) {
  const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
// 화면에 없는 색이면 진하기를 줄여 가며 맞춘다(밝기·색상은 그대로)
function fromLch(L, C, H) {
  for (let c = C; ; c -= 0.004) {
    const v = linRgb(L, Math.max(0, c), H);
    if (c <= 0 || v.every((x) => x >= -0.0005 && x <= 1.0005)) return hexOf(v.map((x) => gam(Math.max(0, Math.min(1, x)))));
  }
}
const lum = (hex) => { const [r, g, b] = rgbOf(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (x, y) => { const a = lum(x), b = lum(y); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };

// 에디션마다: h 기준 색상(OKLCH), spread 색상이 퍼지는 폭, c 진하기 [옅은 표지, 진한 표지]. base는 표지 색상을 쓰므로 cap(진하기 상한)만 둔다
export const SPINE_EDITIONS = {
  base:    { own:true, cap:0.13, tint:0.02 },
  night:   { own:true, cap:0.16, tint:0.02, band:[0.3, 0.9] }, // 밤 서재: 늘 어두운 배경이라 표지 색을 거의 그대로 둔다
  paper:   { h:72,  spread:22, c:[0.028, 0.075] },
  forest:  { h:150, spread:26, c:[0.03, 0.075] },
  sea:     { h:245, spread:24, c:[0.03, 0.085] },
  blossom: { h:358, spread:22, c:[0.035, 0.09] },
  ink:     { h:80,  spread:0,  c:[0.004, 0.01] },
};
// 밝기 범위: 표지의 밝기(0~1)를 이 사이로 옮긴다. 밝은 판은 종이색~짙은 색, 어두운 판은 한 단 낮춘다
const BAND = { light:[0.36, 0.9], dark:[0.27, 0.74] };
const MID = 0.58; // 이 밝기 근처는 검은 글자도 흰 글자도 대비가 모자라 비운다

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// cover = [바탕, 글자, 강조], seed = 책마다 다른 정수(같은 색 표지끼리 조금씩 달라지게)
export function spineColor(cover, edition, dark, seed = 0) {
  const ed = SPINE_EDITIONS[edition] || SPINE_EDITIONS.base;
  const [cl, cc, ch] = toLch(cover[0]);
  const [lo, hi] = ed.band || (dark ? BAND.dark : BAND.light);
  const j = ((Math.abs(seed) % 7) - 3) / 3; // -1~1
  let L = lo + (hi - lo) * clamp(cl, 0, 1) ** 1.25 + j * 0.012;
  let C, H;
  if (ed.own) {
    H = ch; C = Math.min(cc, ed.cap) * (dark ? 0.85 : 1);
    if (cc < 0.025) { // 흰색·회색·검정 표지: 강조색(없으면 따뜻한 종이색) 쪽으로 아주 조금 물들인다
      const a = cover[2] && toLch(cover[2]);
      if (a && a[1] > 0.04) { H = a[2]; C = ed.tint; } else { H = 85; C = ed.tint * 0.6; }
    }
  } else {
    const u = Math.cos((ch - 30) * Math.PI / 180) * 0.7 + j * 0.3; // 표지 색상에 따라 팔레트 안에서 자리를 정한다
    H = (ed.h + ed.spread * u + 360) % 360;
    C = (ed.c[0] + (ed.c[1] - ed.c[0]) * clamp(cc / 0.14, 0, 1)) * (dark ? 0.85 : 1);
  }
  const inkOf = (lightInk) => fromLch(lightInk ? 0.97 : 0.2, Math.min(C, 0.03) * (lightInk ? 0.4 : 1), H);
  let bg, ink;
  for (let i = 0; i < 40 && !ink; i++) {
    const lightInk = L < MID, k = inkOf(lightInk);
    bg = fromLch(L, C, H);
    if (contrast(bg, k) >= 4.5) ink = k; else L += lightInk ? -0.012 : 0.012;
  }
  if (!ink) { bg = fromLch(L, C, H); ink = contrast(bg, '#000000') >= contrast(bg, '#ffffff') ? '#000000' : '#ffffff'; }
  // 금박 줄: 바탕과 구별될 때만 금색, 아니면 글자색
  const ln = contrast(bg, GOLD) >= 1.7 ? GOLD : ink;
  // 색 덩어리(표지의 두 번째 색 느낌): 강조색의 색상을 빌리되 밝기는 바탕에서 한 단만 옮겨 글자 대비 4.5를 지킨다. 못 지키면 넣지 않는다
  let blk = '';
  const a = cover[2] && toLch(cover[2]);
  if (a && a[1] > 0.04) {
    const bh = ed.own ? a[2] : (ed.h + ed.spread * (Math.cos((a[2] - 30) * Math.PI / 180) * 0.7 - j * 0.3) + 360) % 360;
    const bc = ed.own ? Math.min(a[1], ed.cap + 0.03) : Math.min(ed.c[1] * 1.2, C + 0.03);
    for (const step of [0.1, 0.07, 0.045]) {
      const cand = fromLch(L + (L < MID ? -step : step), bc, bh);
      if (cand !== bg && contrast(cand, ink) >= 4.5) { blk = cand; break; }
    }
  }
  return { bg, ink, ln, blk };
}
const GOLD = '#c8a45a';
// 색 에디션 고르는 창의 견본: 흔한 표지 색 열 가지를 그 에디션으로 칠해 보여 준다
export const SAMPLE_COVERS = ['#f9f7f2', '#183363', '#e9cac0', '#0d0a03', '#c3cdd5', '#b3262e', '#f6f7f7', '#f9c0a4', '#3d6b4f', '#f2d24b'];
