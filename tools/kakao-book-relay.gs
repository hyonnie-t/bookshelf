// 책장 앱의 책 찾기 중계(구글 앱스크립트 웹 앱). 이 파일은 키 없는 사본이고 실행본은 앱스크립트 프로젝트 «책장 책 찾기 중계»에 있다.
// 출처 두 가지: src 없음 = 카카오 책 검색(효니 책장), src=nl = 국립중앙도서관 소장자료 검색(범용판, 2026-11-09 효니 결정).
// 키는 프로젝트 설정 > 스크립트 속성 KAKAO_REST_KEY·NL_API_KEY에만 둔다. 찾는 말과 응답 본문을 로그에 남기지 않는다.
// 배포: 웹 앱, 실행 사용자 «나», 액세스 «모든 사용자»(«Google 계정이 있는 모든 사용자»로 하면 로그인 화면이 와서 앱에서 읽지 못한다).
// 결과를 저장하지 않는다(카카오 운영정책 제5조 제20호 캐시 조항). 호출 허용 IP는 켜지 않는다(앱스크립트 서버 IP가 고정이 아님).
var MAX_QUERY = 100;   // 찾는 말 글자 수 상한
var PAGE_SIZE = 8;     // 후보 수
var DAILY_LIMIT = 3000; // 공개 주소라 출처마다 하루 호출 상한을 둔다(카카오 책 검색 쿼터 30,000건, 앱스크립트 URL Fetch 20,000건보다 훨씬 낮게)

function doGet(e) {
  var p = (e && e.parameter) || {};
  return json_(search_(p.q, p.src));
}

function search_(raw, src) {
  var q = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  if (!q) return { ok: false, error: 'empty' };
  if (q.length > MAX_QUERY) return { ok: false, error: 'too_long' };
  var nl = src === 'nl';
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty(nl ? 'NL_API_KEY' : 'KAKAO_REST_KEY');
  if (!key) return { ok: false, error: 'no_key' };
  if (!underLimit_(props, nl ? 'DAY_COUNT_NL' : 'DAY_COUNT')) return { ok: false, error: 'limit' };
  try {
    return nl ? nlSearch_(q, key) : kakaoSearch_(q, key);
  } catch (err) {
    return { ok: false, error: 'fetch' }; // 예외 메시지에 요청 정보(키 포함 주소)가 섞일 수 있어 돌려주지 않는다
  }
}

function kakaoSearch_(q, key) {
  var res = UrlFetchApp.fetch('https://dapi.kakao.com/v3/search/book?size=' + PAGE_SIZE + '&query=' + encodeURIComponent(q), {
    headers: { Authorization: 'KakaoAK ' + key },
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code !== 200) return { ok: false, error: 'upstream', status: code }; // 응답 본문은 돌려주지 않는다
  return { ok: true, books: (JSON.parse(res.getContentText()).documents || []).map(pick_) };
}

// 필요한 칸만 고른다. 소개글·가격·판매 링크는 내보내지 않는다.
// 표지 미리보기 주소(cover)는 책 창에 그때그때 보여 주는 용도로만 내보낸다(2026-11-14). 앱은 이 주소를 저장하지 않는다(운영정책 제5조 제20호)
function pick_(d) {
  return {
    title: d.title || '',
    authors: d.authors || [],
    translators: d.translators || [],
    publisher: d.publisher || '',
    year: String(d.datetime || '').slice(0, 4),
    isbn: d.isbn || '',
    cover: https_(d.thumbnail),
  };
}
// 표지 주소를 https로 맞춘다(GitHub Pages가 https라 http 그림은 막힌다). «cover.nl.go.kr/…»처럼 앞이 빠진 주소도 받는다
function https_(u) {
  u = String(u == null ? '' : u).trim();
  if (!u) return '';
  if (/^\/\//.test(u)) return 'https:' + u;
  if (!/^https?:/i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
  return u.replace(/^http:/i, 'https:');
}
// 국립중앙도서관 표지는 «/kolis/2022/KMO…_thumbnail.jpg»처럼 호스트 없이 온다(2026-11-14 실측). 그림은 cover.nl.go.kr에 있다
function nlCover_(u) {
  if (/^\/[^\/]/.test(u)) return 'https://cover.nl.go.kr' + u;
  return https_(u);
}

// 국립중앙도서관 소장자료 검색. ISBN(10·13자리)이면 ISBN으로 찾는다
function nlSearch_(q, key) {
  var digits = q.replace(/[\s-]/g, '');
  var isbn = /^(97[89])?\d{9}[\dXx]$/.test(digits);
  var url = 'https://www.nl.go.kr/NL/search/openApi/search.do?key=' + encodeURIComponent(key) + '&apiType=json&pageNum=1&pageSize=' + PAGE_SIZE +
    (isbn ? '&detailSearch=true&isbnOp=isbn&isbnCode=' + encodeURIComponent(digits) : '&category=' + encodeURIComponent('도서') + '&kwd=' + encodeURIComponent(q));
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var code = res.getResponseCode();
  if (code !== 200) return { ok: false, error: 'upstream', status: code };
  var body;
  try { body = JSON.parse(res.getContentText()); } catch (err) { return { ok: false, error: 'upstream' }; } // 키 오류 등은 JSON이 아닌 응답이 온다
  if (!body || !Array.isArray(body.result)) return { ok: false, error: 'upstream' };
  return { ok: true, books: body.result.map(pickNl_) };
}

var tagless_ = function (s) { return String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim(); };

// 국립중앙도서관 칸을 카카오와 같은 모양으로 바꾼다.
// 제목: «작별하지 않는다 : 한강 장편소설»처럼 부제·대등 제목이 붙으므로 « : »·« = »·« / » 앞까지만 쓴다(카카오처럼 부제 없는 제목).
// 저자: «한강 지음», «지은이: 매트 헤이그 ; 옮긴이: 노진선»처럼 역할 말이 붙으므로 사람마다 나눠 역할 말을 떼고, 옮긴 사람은 따로 둔다.
// 칸 이름이 titleInfo(camelCase)인지 title_info인지 몰라도 읽도록 이름 모양으로 찾는다(2026-11-10 실측: title_info로 쓰면 ISBN만 채워졌다)
// 출판사 칸은 «파주 : 문학동네, 20210927»처럼 발행지와 날짜가 붙는다(2026-11-10 실측). 발행지 이름이 앞에 있을 때만 떼고, «다산책방 : 다산북스» 같은 임프린트 표기는 둔다
var PLACE_ = /^(서울특별시|서울|파주|부산|대구|인천|광주|대전|울산|세종|수원|성남|고양|용인|안양|부천|창원|청주|전주|제주|춘천|의정부|김포|남양주|화성|천안|안산|경기도|경기|강원|충북|충남|전북|전남|경북|경남)\s*:\s*/;
function publisher_(s) { return s.replace(PLACE_, '').replace(/\s*,\s*\d{4}(\d{4})?\.?$/, '').trim(); }
function f_(d, re) { for (var k in d) { if (re.test(k)) return d[k]; } return ''; }
function pickNl_(d) {
  var title = tagless_(f_(d, /^title/i)).split(/\s+[:=\/]\s+/)[0].replace(/\s*[:=\/]$/, '');
  var people = splitPeople_(tagless_(f_(d, /^author/i)));
  return {
    title: title,
    authors: people.authors,
    translators: people.translators,
    publisher: publisher_(tagless_(f_(d, /^pub_?(info|lisher)/i))),
    year: (String(f_(d, /^pub_?year/i)).match(/\d{4}/) || [''])[0],
    isbn: tagless_(d.isbn),
    cover: nlCover_(tagless_(f_(d, /^image/i))), // 국립중앙도서관 표지(공공 데이터). 없는 책이 많다
    kdc: kdc_(d),
    kid: /^\s*(유|아)/.test(tagless_(f_(d, /^call_?no/i))), // 청구기호가 «유»·«아»로 시작하면 어린이 자료
  };
}
// 도서관 분류 번호(KDC) 앞부분(예 813.62). 분류 칸이 비면 청구기호 «813.62-23-70»에서 뗀다(2026-11-14, 주제 자동 고르기용)
function kdc_(d) {
  var k = tagless_(f_(d, /^kdc_?code_?1s$/i) || f_(d, /^kdc_?code/i));
  var m = k.match(/\d{3}(\.\d+)?/) || tagless_(f_(d, /^call_?no/i)).match(/\d{3}(\.\d+)?/);
  return m ? m[0] : '';
}

var TRANS_ = /(옮김|옮긴이|번역|역자|\s역$|譯|translated)/i; // «역사문제연구소»처럼 이름 속 «역»은 옮긴이로 치지 않는다
var ROLE_ = /(^|\s)(지은이|지음|저자|저|글쓴이|글|엮은이|엮음|편저|편|著|written by|by)(\s|$|:)/gi;
function splitPeople_(s) {
  var authors = [], translators = [];
  s = s.replace(/(\s)(지음|지은이|옮김|옮긴이|그림|엮음|감수)(\s+)(?=[^\s;,:])/g, '$1$2 ; '); // «A 지음 B 옮김»처럼 구분 없이 이어진 것도 나눈다
  s.split(/\s*;\s*/).forEach(function (part) {
    if (/(감수|해설|기획|추천)\s*$/.test(part)) return; // 감수·해설한 사람은 저자 칸에 넣지 않는다
    var trans = TRANS_.test(part);
    var clean = part.replace(/(옮긴이|지은이|그린이|글쓴이|엮은이|저자|역자)\s*:\s*/g, '')
      .replace(ROLE_, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    clean.split(/\s*,\s*/).forEach(function (n) {
      n = n.replace(/\s+(글·그림|글\/그림|옮긴이|옮김|번역|역|譯|그림|사진|감수|지은이|지음|저|글|엮음|편)$/g, '').trim(); // 띄어 쓴 역할 말만 뗀다(이름 끝 글자는 둔다)
      if (n) (trans ? translators : authors).push(n);
    });
  });
  return { authors: authors, translators: translators };
}

function underLimit_(props, name) {
  var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  var saved = String(props.getProperty(name) || '').split('|');
  var n = saved[0] === today ? Number(saved[1]) || 0 : 0;
  if (n >= DAILY_LIMIT) return false;
  props.setProperty(name, today + '|' + (n + 1));
  return true;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// 편집기에서 한 번 실행해 권한을 주고 키를 시험한다. 키와 책 내용은 찍지 않고 결과 코드와 건수만 찍는다
function 시험() {
  var r = search_('카스트');
  Logger.log(r.ok ? '성공: ' + r.books.length + '건' : '실패: ' + r.error + (r.status ? ' ' + r.status : ''));
}
function 시험_국립중앙도서관() {
  var r = search_('작별하지 않는다', 'nl');
  Logger.log(r.ok ? '성공: ' + r.books.length + '건' : '실패: ' + r.error + (r.status ? ' ' + r.status : ''));
}
