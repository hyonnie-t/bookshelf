// 책장 앱의 책 찾기 중계(구글 앱스크립트 웹 앱). 이 파일은 키 없는 사본이고 실행본은 앱스크립트 프로젝트 «책장 책 찾기 중계»에 있다.
// 키는 프로젝트 설정 > 스크립트 속성 KAKAO_REST_KEY에만 둔다. 찾는 말과 응답 본문을 로그에 남기지 않는다.
// 배포: 웹 앱, 실행 사용자 «나», 액세스 «모든 사용자»(«Google 계정이 있는 모든 사용자»로 하면 로그인 화면이 와서 앱에서 읽지 못한다).
// 결과를 저장하지 않는다(카카오 운영정책 제5조 제20호 캐시 조항). 호출 허용 IP는 켜지 않는다(앱스크립트 서버 IP가 고정이 아님).
var MAX_QUERY = 100;   // 찾는 말 글자 수 상한
var PAGE_SIZE = 8;     // 후보 수
var DAILY_LIMIT = 3000; // 공개 주소라 하루 호출 상한을 둔다(카카오 책 검색 쿼터 30,000건, 앱스크립트 URL Fetch 20,000건보다 훨씬 낮게)

function doGet(e) {
  return json_(search_(e && e.parameter && e.parameter.q));
}

function search_(raw) {
  var q = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  if (!q) return { ok: false, error: 'empty' };
  if (q.length > MAX_QUERY) return { ok: false, error: 'too_long' };
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('KAKAO_REST_KEY');
  if (!key) return { ok: false, error: 'no_key' };
  if (!underLimit_(props)) return { ok: false, error: 'limit' };
  try {
    var res = UrlFetchApp.fetch('https://dapi.kakao.com/v3/search/book?size=' + PAGE_SIZE + '&query=' + encodeURIComponent(q), {
      headers: { Authorization: 'KakaoAK ' + key },
      muteHttpExceptions: true,
    });
    var code = res.getResponseCode();
    if (code !== 200) return { ok: false, error: 'upstream', status: code }; // 카카오 응답 본문은 돌려주지 않는다
    return { ok: true, books: (JSON.parse(res.getContentText()).documents || []).map(pick_) };
  } catch (err) {
    return { ok: false, error: 'fetch' }; // 예외 메시지에 요청 정보가 섞일 수 있어 돌려주지 않는다
  }
}

// 필요한 칸만 고른다. 소개글·표지·가격·판매 링크는 내보내지 않는다
function pick_(d) {
  return {
    title: d.title || '',
    authors: d.authors || [],
    translators: d.translators || [],
    publisher: d.publisher || '',
    year: String(d.datetime || '').slice(0, 4),
    isbn: d.isbn || '',
  };
}

function underLimit_(props) {
  var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  var saved = String(props.getProperty('DAY_COUNT') || '').split('|');
  var n = saved[0] === today ? Number(saved[1]) || 0 : 0;
  if (n >= DAILY_LIMIT) return false;
  props.setProperty('DAY_COUNT', today + '|' + (n + 1));
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
