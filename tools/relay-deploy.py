# 책장 중계 프로젝트의 배포 버전만 새 버전으로 바꾼다("배포 관리 > 수정 > 새 버전"과 같은 일, 주소 그대로).
# 사용: python relay_deploy.py check | deploy | rollback N
# history26 포털 배포는 건드리지 않는다. 열쇠는 gas_sync.py의 deploy_credentials()를 그대로 쓴다(내용은 출력하지 않는다).
import sys, json, time, urllib.request, urllib.parse, importlib.util
from pathlib import Path
from googleapiclient.discovery import build

GS = Path(r"D:\OneDrive - 대영중학교\교사업무\웹앱\history26_backend\tools\gas_sync.py")
spec = importlib.util.spec_from_file_location("gas_sync", GS)
gs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gs)

SCRIPT_ID = "1ESJtTuDU2HN6c6sHw_pw-_O3YXcLoGTH8imsCjyYX1metqRCr-nD07Vj"
DEPLOY_ID = "AKfycbyijv6_u2vViI8hsdMvmzFWwLoZXaeEoayBU0WlYdFiCNGHZrpTxpYOZ0qrBwqyFzA7"
EXEC = f"https://script.google.com/macros/s/{DEPLOY_ID}/exec"
sys.stdout.reconfigure(encoding="utf-8")

creds = gs.deploy_credentials()
svc = build("script", "v1", credentials=creds, cache_discovery=False)
print("계정:", gs.current_account(creds))


def current():
    d = svc.projects().deployments().get(scriptId=SCRIPT_ID, deploymentId=DEPLOY_ID).execute()
    return d


def smoke():
    q = urllib.parse.quote("작별하지 않는다")
    with urllib.request.urlopen(f"{EXEC}?src=nl&q={q}", timeout=90) as r:
        body = json.load(r)
    if not body.get("ok") or not body.get("books"):
        return f"응답 이상: ok={body.get('ok')} error={body.get('error')}"
    b = body["books"][0]
    filled = {k: bool(b.get(k)) for k in ("title", "authors", "publisher", "year", "isbn")}
    print("첫 책 칸 채움:", filled, "/ 건수", len(body["books"]))
    return None if filled["title"] and filled["authors"] else "제목·저자 칸이 비어 있다"


def set_version(v, desc):
    svc.projects().deployments().update(
        scriptId=SCRIPT_ID, deploymentId=DEPLOY_ID,
        body={"deploymentConfig": {"scriptId": SCRIPT_ID, "versionNumber": v, "manifestFileName": "appsscript", "description": desc}},
    ).execute()
    for i in range(7):
        if i:
            time.sleep(5)
        if current()["deploymentConfig"].get("versionNumber") == v:
            return
    raise RuntimeError(f"30초 뒤에도 버전이 {v}이 아니다")


cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
d = current()
cfg = d["deploymentConfig"]
prev = cfg.get("versionNumber")
urls = [e.get("uri") for e in d.get("entryPoints", [])]
print("지금 배포 버전:", prev, "/ 주소 일치:", any(u and u.endswith(DEPLOY_ID + "/exec") for u in urls))
files = svc.projects().getContent(scriptId=SCRIPT_ID).execute().get("files", [])
print("편집기 파일:", [f["name"] for f in files])
man = [f for f in files if f["name"] == "appsscript"][0]["source"]
print("매니페스트 webapp:", json.loads(man).get("webapp"))

if cmd == "push":
    # 레포 파일을 편집기 «코드»에 그대로 올린다(appsscript는 그대로)
    src_path = Path(sys.argv[2])
    new_src = src_path.read_bytes().decode("utf-8").replace("\r\n", "\n")
    out = [dict(f, source=new_src) if f["name"] == "코드" else f for f in files]
    svc.projects().updateContent(scriptId=SCRIPT_ID, body={"files": out}).execute()
    print("편집기 «코드» 갱신:", len(new_src), "자")
elif cmd == "deploy":
    v = svc.projects().versions().create(scriptId=SCRIPT_ID, body={"description": "국립중앙도서관 칸 이름 맞춤 2026-11-10"}).execute()["versionNumber"]
    print("새 버전", v, "만듦")
    try:
        set_version(v, f"국립중앙도서관 칸 이름 맞춤 prev={prev}")
        problem = smoke()
    except Exception as ex:
        problem = str(ex)
    if problem:
        print("문제:", problem, "→ 버전", prev, "로 되돌린다")
        set_version(prev, f"되돌림: 버전 {v} 문제")
        sys.exit("배포 실패, 되돌림")
    print(f"배포 완료: 버전 {prev} → {v}, 주소 그대로")
elif cmd == "rollback":
    set_version(int(sys.argv[2]), "되돌림")
    print("되돌림 완료")
