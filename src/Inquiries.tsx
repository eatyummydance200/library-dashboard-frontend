import { api } from "./api";
import { Field, Form, Modal, useNotice, value } from "./ui";

export const INQUIRY_CATEGORIES = [
  ["feature", "새 기능"],
  ["improvement", "기능 개선"],
  ["bug", "오류"],
  ["other", "기타"],
] as const;

// 우측 하단 고정 "문의" 버튼의 팝업. 보내면 닫고 토스트로 알린다(기록은 보여 주지 않는다).
export default function InquiryDialog({ onClose }: { onClose: () => void }) {
  const notice = useNotice();
  return (
    <Modal title="개발자에게 문의" onClose={onClose} className="inquiry-popup">
      <Form
        onClose={onClose}
        submit="보내기"
        onSave={async (data) => {
          await api("/inquiries", "POST", Object.fromEntries(["category", "title", "body"].map((key) => [key, value(data, key)])));
          onClose();
          notice("문의를 보냈어요.");
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
          <textarea name="body" required maxLength={2000} placeholder="어느 화면에서 무엇을 했을 때 어떻게 됐는지, 또는 무엇이 필요한지 적어 주세요" />
        </Field>
        <p className="hint">보내면 개발자에게 바로 알림이 가요.</p>
      </Form>
    </Modal>
  );
}
