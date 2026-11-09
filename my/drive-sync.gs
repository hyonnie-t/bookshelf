// 나의 책장 · 내 구글 드라이브 연결
// 이 코드는 쓰는 사람 본인의 구글 계정에서 돌아가고, 기록은 본인 드라이브의 파일 하나(«나의 책장 기록.json»)에만 저장돼요.
// 책장을 만든 사람의 서버에는 아무것도 가지 않아요.
// 쓰는 법: 배포 > 새 배포 > 유형 «웹 앱», 실행 사용자 «나», 액세스 권한 «모든 사용자» > 배포 > 나온 웹 앱 주소를 책장에 붙여 넣기.
// 웹 앱 주소가 열쇠예요. 주소를 아는 사람은 기록을 읽고 바꿀 수도 있으니 다른 사람에게 알려 주지 마세요.
// 주소가 새어 나갔다면 배포 관리에서 이 배포를 보관(삭제)하고 새로 배포해 새 주소를 쓰세요.

var FILE_NAME = '나의 책장 기록.json';

function doGet() {
  return reply(read_());
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var cur = read_();
    if (body.op !== 'put' || typeof body.payload !== 'object' || body.payload === null) return reply({ ok: false, error: 'bad' });
    if (body.base !== cur.rev) return reply({ ok: false, conflict: true, rev: cur.rev, at: cur.at, payload: cur.payload });
    var next = { app: 'my-bookshelf-sync', rev: cur.rev + 1, at: new Date().toISOString(), payload: body.payload };
    file_().setContent(JSON.stringify(next));
    return reply({ ok: true, rev: next.rev, at: next.at });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function read_() {
  var text = file_().getBlob().getDataAsString();
  var j = {};
  try { j = JSON.parse(text || '{}'); } catch (err) { j = {}; }
  return { ok: true, app: 'my-bookshelf-sync', rev: typeof j.rev === 'number' ? j.rev : 0, at: j.at || '', payload: j.payload || null };
}

function file_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FILE_ID');
  if (id) {
    try { var f = DriveApp.getFileById(id); if (!f.isTrashed()) return f; } catch (err) {}
  }
  var made = DriveApp.createFile(FILE_NAME, '{}', 'application/json');
  props.setProperty('FILE_ID', made.getId());
  return made;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 편집기에서 이 함수를 한 번 실행하면 드라이브 권한을 미리 허락할 수 있어요(안 해도 배포할 때 물어봐요)
function 처음_한번_실행() {
  Logger.log('준비됐어요: ' + file_().getName());
}
