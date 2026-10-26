import { useState } from "react";
import { api, useResource } from "./api";
import type { Shift, User, Week } from "./types";
import { monday, time, today } from "./dates";
import { Field, Form, Loading, Modal, ResourceError, useNotice, value } from "./ui";

export default function ShiftIssueEditor({
  user,
  shift,
  day: initialDay = today(),
  onClose,
  onSaved,
}: {
  user: User;
  shift?: Shift;
  day?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [day, setDay] = useState(shift?.day || initialDay || today());
  const [id, setId] = useState(shift?.id ?? 0);
  const schedule = useResource<Week>(`/schedule?week=${monday(day)}`);
  const notice = useNotice();
  const available = schedule.data?.shifts.filter(
    (entry) => entry.day === day &&
      (user.role === "admin" || entry.staff_id === user.staff_id),
  ) ?? [];
  const selected = available.find((entry) => entry.id === id);
  return (
    <Modal title="근무 변경 요청" onClose={onClose}>
      <Form
        onClose={onClose}
        submit="변경 요청 등록"
        onSave={async (form) => {
          if (!selected) throw new Error("변경할 근무를 선택해주세요.");
          await api("/issues", "POST", {
            day: selected.day,
            category: "근무 변경",
            shift_id: selected.id,
            expected_shift: selected,
            title: value(form, "title"),
            body: value(form, "body"),
          });
          onClose();
          await onSaved();
          notice("변경 요청을 등록했어요.");
        }}
      >
        <Field label="근무 날짜">
          <input type="date" required value={day} onChange={(event) => {
            if (!event.target.value) return;
            setDay(event.target.value);
            setId(0);
          }} />
        </Field>
        {schedule.data ? (
          <>
            <ResourceError error={schedule.error} retry={schedule.refresh} />
            <Field label="변경할 근무">
              <select required value={selected?.id ?? ""} onChange={(event) => setId(Number(event.target.value))}>
                <option value="">근무를 선택해주세요</option>
                {available.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {schedule.data!.staff.find((person) => person.id === entry.staff_id)?.name ?? "근무자"}
                    {` · ${time(entry.start)}–${time(entry.end)} · ${entry.role === "desk" ? "데스크" : "대기"}`}
                  </option>
                ))}
              </select>
            </Field>
            {!available.length && <p className="hint">해당 날짜에 요청할 수 있는 근무가 없습니다.</p>}
          </>
        ) : <Loading error={schedule.error} retry={schedule.refresh} />}
        <Field label="제목">
          <input name="title" required maxLength={80} defaultValue="근무 변경 요청" />
        </Field>
        <Field label="변경 내용">
          <textarea name="body" required maxLength={1500} placeholder="변경할 시간이나 대체 근무자, 변경 사유를 적어주세요." />
        </Field>
      </Form>
    </Modal>
  );
}
