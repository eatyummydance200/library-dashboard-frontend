import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
  const { AnswerCard, ChatPanel, FlagNote, chatError } = await server.ssrLoadModule("/src/Chatbot.tsx");
  const { ApiError } = await server.ssrLoadModule("/src/api.ts");
  const { ManualEditor, MANUAL } = await server.ssrLoadModule("/src/Manual.tsx");
  const { REGULATIONS, QuestionRow, summaryLine } = await server.ssrLoadModule("/src/Regulations.tsx");
  // React가 속성 순서를 바꾸므로 태그 단위로 확인한다
  const tags = (html, name) => html.match(new RegExp(`<${name}[^>]*>`, "g")) || [];

  const answer = {
    id: 7, outcome: "answered", answer: "대출은 제2자료실에서 한다고 안내하세요.",
    sections: ["5. 대출·반납 안내 > 대출 방법"], extensions: [{ number: "9416", place: "제2자료실(중앙관 4F)" }],
    today_count: 3, warn: false,
  };
  const card = (over = {}, turn = {}) =>
    renderToStaticMarkup(createElement(AnswerCard, { turn: { question: "휴학생도 빌리나요?", answer: { ...answer, ...over }, ...turn }, onFlagged() {} }));

  // 질문 → 답 → 연결 → 근거 순서, "문제가 있어요" 버튼
  const html = card();
  const order = ["휴학생도 빌리나요?", "대출은 제2자료실에서", "연결: <strong>9416</strong> 제2자료실(중앙관 4F)", "근거: 5. 대출·반납 안내 &gt; 대출 방법", ">문제가 있어요</button>"];
  const at = order.map((text) => html.indexOf(text));
  assert.ok(at.every((i) => i >= 0), `missing: ${order[at.findIndex((i) => i < 0)]}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at);
  assert.doesNotMatch(html, /규정에 없음|평소보다 많아요/);

  // 요약 한 줄 + "- 제목: 내용" 항목은 굵은 요약과 목록으로 그린다
  const structured = card({ answer: "휴학생도 승인을 받으면 대출할 수 있어요.\n- 승인: 중앙관 4층 제2자료실\n- 대출: 3권 · 20일" });
  assert.match(structured, /answer-summary[^>]*>휴학생도 승인을 받으면 대출할 수 있어요\.</);
  assert.match(structured, /<li><b>승인<\/b> 중앙관 4층 제2자료실<\/li><li><b>대출<\/b> 3권 · 20일<\/li>/);

  // not_found·refused는 배지
  assert.match(card({ outcome: "not_found", sections: [], extensions: [] }), /tds-badge[^>]*>규정에 없음</);
  assert.match(card({ outcome: "refused" }), />규정에 없음</);
  // warn은 서버 판단만 본다
  assert.match(card({ warn: true, today_count: 101 }), /오늘 이 계정으로 101번 물어봤어요. 평소보다 많아요./);
  assert.doesNotMatch(card({ warn: false, today_count: 101 }), /평소보다 많아요/);
  // 표시 후에는 감사 문구와 "표시 취소"
  const flagged = card({}, { flagged: true });
  assert.match(flagged, /알려 줘서 고마워요. 관리자가 확인할게요./);
  assert.match(flagged, />표시 취소</);
  assert.doesNotMatch(flagged, /문제가 있어요/);

  // 메모: 선택, 500자
  const note = renderToStaticMarkup(createElement(FlagNote, { onSend: async () => {}, onCancel() {} }));
  const [memo] = tags(note, "textarea");
  assert.match(memo, /maxLength="500"/);
  assert.match(memo, /placeholder="무엇이 틀렸는지 적어 주세요"/);
  assert.doesNotMatch(memo, /required/);
  assert.match(note, />보내기</);

  // 패널: 비모달 대화상자, 질문 입력란 500자·필수, 전송 중 잠금
  const panel = (props = {}) => renderToStaticMarkup(createElement(ChatPanel, {
    turns: [], draft: "", setDraft() {}, busy: false, error: "", onAsk() {}, onFlagged() {}, onClose() {}, ...props,
  }));
  const idle = panel();
  assert.match(tags(idle, "aside")[0], /role="dialog"/);
  assert.match(tags(idle, "aside")[0], /aria-label="전화 응대 도우미"/);
  assert.doesNotMatch(tags(idle, "aside")[0], /aria-modal/);
  assert.match(idle, /aria-label="닫기"/);
  const [question] = tags(idle, "textarea");
  assert.match(question, /maxLength="500"/);
  assert.match(question, /required=""/);
  assert.match(question, /예\) 상호대차는 어디로 문의해\?/);
  // 첫 인사는 프로필과 함께 항상 보이고, 보내기 버튼은 입력이 있을 때만 켜진다
  const empty = panel();
  assert.match(empty, /chatbot-avatar/);
  assert.match(empty, /응대 도우미/);
  assert.match(empty, /전화 응대를 도와드릴게요/);
  assert.match(tags(empty, "button").find((tag) => /aria-label="보내기"/.test(tag)), /disabled=""/);
  assert.doesNotMatch(tags(panel({ draft: "상호대차?" }), "button").find((tag) => /aria-label="보내기"/.test(tag)), /disabled=""/);
  assert.match(tags(panel({ draft: "   " }), "button").find((tag) => /aria-label="보내기"/.test(tag)), /disabled=""/);
  const busy = panel({ busy: true, error: "답을 받지 못했어요. 잠시 후 다시 물어봐 주세요." });
  assert.match(busy, /role="status">생각하는 중/);
  assert.match(tags(busy, "textarea")[0], /disabled=""/);
  assert.match(busy, /role="alert">답을 받지 못했어요/);

  // 오류 문구: 5xx는 상태 코드로, 나머지는 서버 메시지
  assert.equal(chatError(new ApiError("x", 503)), "챗봇이 아직 설정되지 않았어요. 관리자에게 알려 주세요.");
  assert.equal(chatError(new ApiError("x", 502)), "답을 받지 못했어요. 잠시 후 다시 물어봐 주세요.");
  assert.equal(chatError(new ApiError("입력값을 확인해주세요.", 400)), "입력값을 확인해주세요.");
  assert.equal(chatError(new ApiError("서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.", 0)), "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");

  // 규정 편집기에는 "이미지 넣기"가 없고, 매뉴얼 편집기에는 그대로 있다
  const editor = (doc) => renderToStaticMarkup(createElement(ManualEditor, { doc, initial: "# 1. 장", onClose() {}, onSaved() {} }));
  const regulations = editor(REGULATIONS);
  assert.doesNotMatch(regulations, /이미지 넣기|type="file"/);
  assert.match(regulations, /규정 편집/);
  assert.match(editor(MANUAL), /이미지 넣기/);
  assert.match(editor(MANUAL), /매뉴얼 편집/);

  // 질문 기록: 요약 줄과 행
  assert.equal(summaryLine({ today_count: 4, month_count: 52, month_cost_usd: 0.1234 }), "오늘 4건 · 이번 달 52건 · 약 $0.1234");
  assert.equal(summaryLine({ today_count: 0, month_count: 0, month_cost_usd: 0 }), "오늘 0건 · 이번 달 0건 · 약 $0");
  const record = {
    id: 1, username: "worker", question: "외부인 열람?", outcome: "not_found", answer: "대표번호 9410으로 연결하겠다고 안내하세요.",
    sections: ["4. 외부이용자"], extensions: [{ number: "9401", place: "Info U" }],
    created_at: "2026-11-17T05:30:00Z", flagged_at: "2026-11-17T05:31:00Z", flag_note: "시간이 틀림", resolved_at: null,
  };
  const row = (over = {}) => renderToStaticMarkup(createElement(QuestionRow, { item: { ...record, ...over }, refresh: async () => {} }));
  const open = row();
  for (const text of ["외부인 열람?", "규정에 없음", "문제 표시", "대표번호 9410", "14:30", "worker", "근거: 4. 외부이용자", "내선: 9401 Info U", "메모: 시간이 틀림", ">보완 완료<"])
    assert.ok(open.includes(text), `row missing: ${text}`);
  assert.match(row({ resolved_at: "2026-11-17T06:00:00Z" }), />다시 열기</);
  console.log("PASS: chatbot answer card, warn, flag note, panel input, chatError, regulations editor, question log row");
} finally {
  await server.close();
}
