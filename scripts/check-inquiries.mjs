import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
  const { default: InquiryDialog, InquiryForm } = await server.ssrLoadModule("/src/Inquiries.tsx");
  // 채팅 창: 인사말과 "문의하기" 버튼만 있고 양식은 아직 없다
  const chat = renderToStaticMarkup(createElement(InquiryDialog, { onClose: () => {} }));
  assert.match(chat, /안녕하세요, 개발자입니다/);
  assert.match(chat, />문의하기<\/button>/);
  assert.doesNotMatch(chat, /<textarea|문의 감사합니다/);
  // 등록 폼: 유형 라디오 4개(기본 선택 없음), 길이 제한
  const dialog = renderToStaticMarkup(createElement(InquiryForm, { onClose: () => {}, onSent: () => {} }));
  // React가 속성 순서를 바꾸므로 태그 단위로 확인한다
  const tag = (pattern) => (dialog.match(/<(input|textarea)[^>]*>/g) || []).filter((t) => pattern.test(t));
  const radios = tag(/type="radio"/);
  assert.equal(radios.length, 4);
  assert.ok(radios.every((t) => /name="category"/.test(t) && /required=""/.test(t) && !/checked/.test(t)));
  assert.match(tag(/name="title"/)[0], /maxLength="80"/);
  assert.match(tag(/name="body"/)[0], /maxLength="2000"/);
  assert.match(dialog, /보내기/);
  assert.doesNotMatch(dialog, /issue-list/);
  console.log("PASS: inquiry chat greeting, form fields, no history list");
} finally {
  await server.close();
}
