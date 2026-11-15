import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import { Field, Form, Modal, value } from "./ui";
import developer from "../static/developer.png";

export const INQUIRY_CATEGORIES = [
  ["feature", "새 기능"],
  ["improvement", "기능 개선"],
  ["bug", "오류"],
  ["other", "기타"],
] as const;

// 오른쪽 아래 상담 버튼으로 여는 채팅 모양 창. 인사말 → "문의하기" → 가운데 양식 → 보내면 채팅에 내 문의와 감사 답변이 붙는다.
// 보낸 내용은 이 창이 열려 있는 동안만 보인다(기록 조회 API는 없다).
export default function InquiryDialog({ onClose }: { onClose: () => void }) {
  const [writing, setWriting] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  return (
    <>
      <Modal className="inquiry-chat" title="개발자에게 문의" onClose={onClose}>
        <div className="chat-log" aria-live="polite">
          <Reply>안녕하세요, 개발자입니다.<br />문의할 내용이 있으면 남겨 주세요.</Reply>
          {sent.map((title, index) => (
            <Fragment key={index}>
              <p className="chat-bubble is-mine">{title}</p>
              <Reply>문의 감사합니다.<br />확인하고 반영할게요.</Reply>
            </Fragment>
          ))}
        </div>
        <button type="button" className="btn primary chat-write" onClick={() => setWriting(true)}>
          {sent.length ? "또 문의하기" : "문의하기"}
        </button>
      </Modal>
      {writing && <InquiryForm onClose={() => setWriting(false)} onSent={(title) => setSent([...sent, title])} />}
    </>
  );
}
function Reply({ children }: { children: ReactNode }) {
  return (
    <div className="chat-msg">
      <img className="chat-avatar" src={developer} alt="" width={40} height={40} />
      <div>
        <small>개발자</small>
        <p className="chat-bubble">{children}</p>
      </div>
    </div>
  );
}
export function InquiryForm({ onClose, onSent }: { onClose: () => void; onSent: (title: string) => void }) {
  return (
    <Modal title="문의 남기기" onClose={onClose}>
      <Form
        onClose={onClose}
        submit="보내기"
        onSave={async (data) => {
          await api("/inquiries", "POST", Object.fromEntries(["category", "title", "body"].map((key) => [key, value(data, key)])));
          onSent(value(data, "title"));
          onClose();
        }}
      >
        <fieldset className="field choice-chips">
          <legend>유형</legend>
          <div>
            {INQUIRY_CATEGORIES.map(([key, label]) => (
              <label key={key}>
                <input type="radio" name="category" value={key} required />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="제목">
          <input name="title" required maxLength={80} placeholder="한 줄로 요약해 주세요" />
        </Field>
        <Field label="내용">
          <textarea name="body" required maxLength={2000} placeholder="어느 화면에서 무엇을 했더니 어떻게 됐는지 적어 주세요" />
        </Field>
        <p className="hint">보내면 개발자에게 바로 알림이 가요.</p>
      </Form>
    </Modal>
  );
}
