import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
  const { archiveProgress, ProgressCard } = await server.ssrLoadModule("/src/Archive.tsx");
  const { taggingProgress } = await server.ssrLoadModule("/src/Tagging.tsx");
  const { default: Cleaning, cleaningNames } = await server.ssrLoadModule("/src/Cleaning.tsx");
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
  assert.deepEqual(archiveProgress(archive), { done: 2, total: 3 });
  // 추첨 전 과월호는 그룹 신문사 전체가 미완료
  assert.deepEqual(archiveProgress({ ...archive, draw: null, groups: [["A", "B"], ["C"]] }), { done: 0, total: 3 });
  // 비활성 근무자와 다른 달 기록은 세지 않는다
  assert.deepEqual(taggingProgress(tagging, 11), { done: 1, total: 2 });
  const card = (props) => renderToStaticMarkup(createElement(ProgressCard, { label: "11월 과월호 정리", ...props }));
  assert.match(card({ done: 8, total: 16 }), /<strong[^>]*>16개 중 8개 끝났어요<\/strong>/);
  assert.match(card({ done: 8, total: 16 }), /role="progressbar"[^>]*aria-valuemax="16" aria-valuenow="8"/);
  assert.match(card({ done: 2, total: 2, unit: "명" }), />2명 모두 끝났어요</);
  assert.match(card({ done: 0, total: 16, note: "아직 담당을 정하지 않았어요" }), />아직 담당을 정하지 않았어요</);
  assert.equal(cleaningNames(records[0]), "김가, 이나");
  assert.equal(cleaningNames(undefined), "미추첨");

  const render = (role, data = records, month = "2026-11") => renderToStaticMarkup(createElement(Cleaning, {
    user: { id: 1, role }, records: { data, refresh: async () => {} }, month,
  }));
  const admin = render("admin");
  // 선택 월 담당자 크게 표시 + 지난 기록(월·담당자만)
  assert.match(admin, /<strong>김가<\/strong><strong>이나<\/strong>/);
  assert.match(admin, /<span>2026년 11월<\/span><strong>김가, 이나<\/strong>/);
  assert.match(admin, /<span>2026년 10월<\/span><strong>박다<\/strong>/);
  // 관리자 조작은 관리 메뉴 안에. 이미 뽑은 달은 "다시 추첨하기"
  assert.match(admin, /admin-menu[\s\S]*type="number"[^>]*value="2"[\s\S]*다시 추첨하기[\s\S]*담당 직접 정하기/);
  const worker = render("worker");
  assert.doesNotMatch(worker, /admin-menu|추첨하기<\/button>|담당 직접 정하기|type="number"/);
  const empty = render("admin", []);
  assert.match(empty, /기록이 없어요/);
  assert.match(empty, /clean-none">미추첨/);
  assert.match(empty, />담당 추첨하기<\/button>/);
  console.log("PASS: monthly progress counts and text, cleaning names, history, admin-only menu, empty state");
} finally {
  await server.close();
}
