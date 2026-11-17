// 책장 시험 한꺼번에 돌리기 (2026-11-17)
// 왜: 병합 전 시험 훅(클로드작업\도구\훅\merge-test.js)은 package.json의 scripts.test만 찾는다.
//     책장 시험은 tools/test-*.js에 13개가 있는데 그 훅이 못 찾아 병합 때 한 번도 자동으로 돌지 않았다.
//     루트 package.json의 "test"가 이 파일을 부른다(npm test).
// 하는 일: tools/test-*.js를 하나씩 node로 돌리고, 하나라도 실패하면 끝 코드 1.
// 흔들리는 시험 규칙(.claude/skills/verify/SKILL.md): 실패한 시험을 «다시 돌려 초록 만들기»로 넘기지 않는다.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => /^test-.*\.js$/.test(f)).sort();
let fail = 0;
const t0 = Date.now();
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8', timeout: 120000 });
  const last = ((r.stdout || '') + (r.stderr || '')).trim().split('\n').pop() || '';
  const ok = r.status === 0;
  if (!ok) fail++;
  console.log(`${ok ? '통과' : '실패'}  ${f}  ${last.slice(0, 80)}`);
  if (!ok) console.log(((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-15).join('\n'));
}
console.log(`\n시험 ${files.length - fail}/${files.length} 통과 (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
process.exit(fail ? 1 : 0);
