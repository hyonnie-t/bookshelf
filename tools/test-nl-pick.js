// 국립중앙도서관 응답 칸을 카카오 모양으로 바꾸는 pickNl_ 시험(가짜 응답, 네트워크·키 없음). 실행: node tools/test-nl-pick.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'kakao-book-relay.gs'), 'utf8'), ctx);

const want = { title: '작별하지 않는다', authors: ['한강'], translators: [], publisher: '문학동네', year: '2021', isbn: '9788954682152' };
// camelCase
assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.pickNl_({ titleInfo: '<span class="searching_txt">작별하지 않는다</span> : 한강 장편소설', authorInfo: '한강 지음', pubInfo: '문학동네', pubYearInfo: '2021', isbn: '9788954682152', typeName: '도서' }))), want);
// snake_case
assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.pickNl_({ title_info: '작별하지 않는다 : 한강 장편소설', author_info: '한강 지음', pub_info: '문학동네', pub_year_info: '2021', isbn: '9788954682152' }))), want);
// 옮긴이
const t = JSON.parse(JSON.stringify(ctx.pickNl_({ titleInfo: '레슨 인 케미스트리', authorInfo: '보니 가머스 지음 ; 이영아 옮김', pubInfo: '문학수첩', pubYearInfo: '2022', isbn: '9791130646985' })));
assert.deepStrictEqual([t.authors, t.translators], [['보니 가머스'], ['이영아']]);
// 칸이 없어도 죽지 않는다
assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.pickNl_({ isbn: '1' }))), { title: '', authors: [], translators: [], publisher: '', year: '', isbn: '1' });
console.log('pickNl_ 시험 통과');
