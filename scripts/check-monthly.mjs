import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
  const { MonthlySummary } = await server.ssrLoadModule("/src/Monthly.tsx");
  const { default: Cleaning } = await server.ssrLoadModule("/src/Cleaning.tsx");
  const records = [
    { month: "2026-11", created_by: 1, username: "admin", created_at: "2026-11-01T01:00:00Z", staff: [{ id: 1, name: "김가" }, { id: 2, name: "이나" }] },
    { month: "2026-10", created_by: 1, username: "boss", created_at: "2026-10-01T01:00:00Z", staff: [{ id: 3, name: "박다" }] },
  ];
  const archive = {
    month: "2026-11", draw: { created_at: "", created_by_name: "" }, groups: [], participants: [],
    assignments: [{ tasks: [{ newspaper: "A", completed: 1 }, { newspaper: "B", completed: 0 }] }, { tasks: [{ newspaper: "C", completed: 1 }] }],
  };
  const tagging = {
    year: 2026,
    staff: [{ id: 1, active: 1 }, { id: 2, active: 1 }, { id: 3, active: 0 }],
    tags: [{ staff_id: 1, month: 11, completed: 1 }, { staff_id: 2, month: 10, completed: 1 }, { staff_id: 3, month: 11, completed: 1 }],
  };
  const summary = (props) => renderToStaticMarkup(createElement(MonthlySummary, { month: "2026-11", onOpen() {}, ...props }));
  const html = summary({ archive, tagging, cleaning: records });
  assert.match(html, /과월호 진행<\/span><strong>2 \/ 3 완료/);
  // 비활성 근무자와 다른 달 기록은 세지 않는다
  assert.match(html, /태깅 진행<\/span><strong>1 \/ 2명 완료/);
  assert.match(html, /청소 담당<\/span><strong>김가, 이나/);
  // 추첨 전 과월호는 그룹 신문사 전체가 미완료
  assert.match(summary({ archive: { ...archive, draw: null, groups: [["A", "B"], ["C"]] } }), /0 \/ 3 완료/);
  assert.match(summary({ cleaning: [records[1]] }), /청소 담당<\/span><strong>미추첨/);

  const render = (role, data = records) => renderToStaticMarkup(createElement(Cleaning, {
    user: { id: 1, role }, records: { data, refresh: async () => {} },
  }));
  const admin = render("admin");
  // 선택 월은 오늘 기준이라 결과 영역 대신 지난 기록 표로 확인
  assert.match(admin, /<th scope="row">2026-11<\/th><td>김가, 이나<\/td><td>admin<\/td>/);
  assert.match(admin, /<th scope="row">2026-10<\/th><td>박다<\/td><td>boss<\/td>/);
  assert.match(admin, /type="number"[^>]*value="2"/);
  assert.match(admin, /직접 지정/);
  const worker = render("worker");
  assert.doesNotMatch(worker, /추첨<\/button>|직접 지정|type="number"/);
  const empty = render("admin", []);
  assert.match(empty, /기록이 없습니다/);
  assert.match(empty, /unassigned">미추첨/);
  assert.match(empty, />추첨<\/button>/);
  console.log("PASS: monthly summary counts, cleaning history, admin-only draw controls, empty state");
} finally {
  await server.close();
}
