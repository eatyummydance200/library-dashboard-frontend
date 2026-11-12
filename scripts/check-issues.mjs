import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
  const { IssueList, TodayIssues, covers } = await server.ssrLoadModule("/src/Issues.tsx");
  const data = [
    { id: 3, day: "2026-10-26", end_day: "2026-10-26", category: "인계", title: "정리 완료", body: "정리했습니다", done: 1, author_id: 1, created_at: "2026-10-25T01:00:00Z" },
    { id: 1, day: "2026-10-26", end_day: "2026-10-26", category: "인계", title: "신문 확인", body: "입고 확인", done: 0, author_id: 1, created_at: "2026-10-26T05:32:00Z" },
    { id: 2, day: "2026-10-26", end_day: "2026-10-26", category: "공지", title: "행사 안내", body: "데스크 정리", done: 0, author_id: 2 },
    { id: 4, day: "2026-10-26", end_day: "2026-10-28", category: "공지", title: "공사 안내", body: "3층 공사", done: 0, author_id: 2 },
  ];
  const render = (props = {}) => renderToStaticMarkup(createElement(IssueList, {
    resource: { data, refresh: async () => {} }, user: { id: 1, role: "admin" }, filter: "all", ...props,
  }));
  const html = render();
  const items = html.split('<article class="issue-item').slice(1);
  assert.equal(items.length, 4);
  // 진행 중이 먼저, 완료는 맨 아래로
  assert.deepEqual(items.map((item) => item.match(/issue-title">([^<]+)/)[1]), ["신문 확인", "행사 안내", "공사 안내", "정리 완료"]);
  // 기간 이슈만 제목 줄에 기간 표시, 하루짜리는 없음
  assert.match(items[2], /<span class="issue-period">10\.26~10\.28<\/span>/);
  for (const index of [0, 1, 3]) assert.doesNotMatch(items[index], /issue-period/);
  // covers: 시작·중간·종료일 포함, 전날·다음날 제외
  const period = data[3];
  for (const date of ["2026-10-26", "2026-10-27", "2026-10-28"]) assert.equal(covers(period, date), true, date);
  for (const date of ["2026-10-25", "2026-10-29"]) assert.equal(covers(period, date), false, date);
  assert.equal(covers(data[0], "2026-10-26"), true);
  assert.equal(covers(data[0], "2026-10-27"), false);
  const done = items[3];
  // 완료 여부는 체크박스 하나로. 완료는 흐리게(is-done) 표시하되 본문은 그대로 보인다
  assert.match(items[0], /type="checkbox"[^>]*aria-label="신문 확인 완료"/);
  assert.match(done, /^ is-done"/);
  assert.match(done, /aria-label="정리 완료 다시 열기" checked=""/);
  assert.match(done, /issue-text">정리했습니다/);
  assert.doesNotMatch(html, /<details class="issue-fold/);
  // 예전 상태 뱃지·완료 버튼·이슈 날짜(2026-10-26)는 없다
  assert.doesNotMatch(html, /issue-status|완료하기|>2026-10-26</);
  // 작성 시각(한국 시간): 같은 날이면 시:분, 다른 날 작성이면 날짜까지. 값이 없으면 생략
  assert.match(items[0], /<time class="issue-time" dateTime="2026-10-26T05:32:00Z">14:32<\/time>/);
  assert.match(done, /issue-time[^>]*>10\. 25\. 10:00</);
  assert.doesNotMatch(items[1], /issue-time/);
  // 수정·삭제는 ⋯ 메뉴 안에. 완료된 이슈는 수정 불가
  assert.match(items[0], /issue-menu[\s\S]*수정[\s\S]*class="danger">삭제/);
  assert.doesNotMatch(done, /수정/);
  assert.match(done, /삭제/);
  // 근무자: 본인 진행 중 이슈만 메뉴, 남의 이슈는 메뉴 없음
  const worker = render({ user: { id: 1, role: "worker" } }).split('<article class="issue-item').slice(1);
  assert.match(worker[0], /issue-menu/);
  assert.doesNotMatch(worker[1], /issue-menu/);
  assert.doesNotMatch(worker[2], /issue-menu/);
  assert.doesNotMatch(worker[3], /issue-menu/);
  assert.doesNotMatch(render({ filter: "open" }), /정리 완료/);
  assert.doesNotMatch(render({ filter: "done" }), /신문 확인|행사 안내|공사 안내/);
  assert.match(render({ resource: { data: [], refresh: async () => {} } }), /해당하는 이슈가 없습니다/);

  const renderToday = (entries = data, role = "admin", error) => renderToStaticMarkup(createElement(TodayIssues, {
    resource: { data: entries, error, refresh: async () => {} }, user: { id: 1, role }, onChanged: async () => {},
  }));
  // 오늘의 이슈: 섹션 나눔 없이 한 목록, 진행 중 먼저
  const daily = renderToday();
  assert.doesNotMatch(daily, /today-issues-done|today-issues-heading/);
  assert.ok(daily.indexOf("행사 안내") < daily.indexOf("정리 완료"));
  assert.match(renderToday([]), /오늘 등록된 이슈가 없습니다/);
  assert.match(renderToday(undefined, "admin", "연결 오류"), /연결 오류/);
  assert.match(renderToday(null), /불러오는 중/);
  assert.match(renderToday(null, "admin", "연결 오류"), /연결 오류|다시 시도/);
  assert.equal((renderToday(data, "worker").match(/type="checkbox"/g) || []).length, 4);
  console.log("PASS: issue order, period label, covers, checkbox status, done body visible, menu permissions, filters, daily sections, empty states, errors");
} finally {
  await server.close();
}
