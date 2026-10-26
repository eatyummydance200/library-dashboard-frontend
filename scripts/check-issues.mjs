import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
  const { IssueList } = await server.ssrLoadModule("/src/Issues.tsx");
  const data = [
    { id: 1, day: "2026-10-26", category: "인계", title: "신문 확인", body: "입고 확인", done: 0 },
    { id: 2, day: "2026-10-26", category: "공지", title: "행사 안내", body: "데스크 정리", done: 0 },
    { id: 3, day: "2026-10-26", category: "인계", title: "정리 완료", body: "정리했습니다", done: 1 },
    { id: 4, day: "2026-10-26", category: "근무 변경", title: "시간 변경", body: "변경 요청", done: 0, shift_id: 1, shift_start: 540, shift_end: 600, shift_role: "desk", shift_name: "근무자" },
  ];
  const render = (props = {}) => renderToStaticMarkup(createElement(IssueList, {
    resource: { data, refresh: async () => {} }, user: { role: "admin" }, filter: "all", groupByCategory: true, ...props,
  }));
  const html = render();
  assert.equal((html.match(/class="issue-group-heading"/g) || []).length, 3);
  assert.equal((html.match(/class="issue-entry"/g) || []).length, 4);
  assert.ok(html.indexOf("신문 확인") < html.indexOf("정리 완료") && html.indexOf("정리 완료") < html.indexOf("행사 안내"));
  assert.doesNotMatch(html, /2026-10-26|<time|issue-title-category/);
  assert.match(html, /완료하기/);
  assert.match(html, /다시 열기/);
  assert.doesNotMatch(render({ filter: "open" }), /정리 완료/);
  assert.doesNotMatch(render({ filter: "done" }), /신문 확인|행사 안내|시간 변경/);
  assert.match(render({ resource: { data: [], refresh: async () => {} } }), /해당하는 이슈가 없습니다/);
  assert.match(render({ groupByCategory: false, titlesOnly: true }), /issue-disclosure/);
  assert.match(render({ groupByCategory: false, compact: true }), /shift-issue-entry/);
  assert.match(render({ groupByCategory: false }), /<time dateTime="2026-10-26"/);
  console.log("PASS: category grouping, hidden dates, status controls, filters, empty list, weekly and compact layouts");
} finally {
  await server.close();
}
