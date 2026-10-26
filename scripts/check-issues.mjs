import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
  const { IssueList, TodayIssues } = await server.ssrLoadModule("/src/Issues.tsx");
  const data = [
    { id: 1, day: "2026-10-26", category: "인계", title: "신문 확인", body: "입고 확인", done: 0 },
    { id: 2, day: "2026-10-26", category: "공지", title: "행사 안내", body: "데스크 정리", done: 0 },
    { id: 3, day: "2026-10-26", category: "인계", title: "정리 완료", body: "정리했습니다", done: 1 },
    { id: 4, day: "2026-10-26", category: "근무 변경", title: "시간 변경", body: "변경 요청", done: 0, shift_id: 1, shift_start: 540, shift_end: 600, shift_role: "desk", shift_name: "근무자" },
  ];
  const render = (props = {}) => renderToStaticMarkup(createElement(IssueList, {
    resource: { data, refresh: async () => {} }, user: { role: "admin" }, filter: "all", ...props,
  }));
  const html = render();
  assert.equal((html.match(/class="issue-entry"/g) || []).length, 4);
  assert.match(html, /issue-title-category/);
  assert.doesNotMatch(render({ showDate: false }), /2026-10-26|<time/);
  assert.match(html, /완료하기/);
  assert.match(html, /다시 열기/);
  assert.doesNotMatch(render({ filter: "open" }), /정리 완료/);
  assert.doesNotMatch(render({ filter: "done" }), /신문 확인|행사 안내|시간 변경/);
  assert.match(render({ resource: { data: [], refresh: async () => {} } }), /해당하는 이슈가 없습니다/);
  assert.match(render({ titlesOnly: true }), /issue-disclosure/);
  assert.match(render({ compact: true }), /shift-issue-entry/);
  assert.match(render(), /<time dateTime="2026-10-26"/);
  const renderToday = (entries = data, role = "admin", error) => renderToStaticMarkup(createElement(TodayIssues, {
    resource: { data: entries, error, refresh: async () => {} }, user: { role }, onChanged: async () => {},
  }));
  const daily = renderToday();
  const [active, completed] = daily.split('<section class="today-issues-done" aria-label="완료된 이슈">');
  assert.match(active, /진행 중 <span>3<\/span>/);
  assert.doesNotMatch(active, /정리 완료/);
  assert.match(completed, /완료 <span>1<\/span>/);
  assert.match(completed, /정리 완료/);
  assert.doesNotMatch(daily, /<details[^>]*\sopen|2026-10-26|<time/);
  assert.match(renderToday([]), /오늘 등록된 이슈가 없습니다/);
  assert.doesNotMatch(renderToday(data.filter((issue) => !issue.done)), /today-issues-done/);
  assert.match(renderToday(data.filter((issue) => issue.done)), /오늘의 이슈를 모두 완료했어요/);
  assert.match(renderToday(undefined, "admin", "연결 오류"), /연결 오류/);
  assert.match(renderToday(null), /불러오는 중/);
  assert.match(renderToday(null, "admin", "연결 오류"), /연결 오류|다시 시도/);
  assert.equal((renderToday(data, "worker").match(/완료하기/g) || []).length, 2);
  console.log("PASS: daily active/completed sections, counts, dates, empty states, errors, permissions, weekly and compact layouts");
} finally {
  await server.close();
}
