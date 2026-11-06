import { useState } from "react";
import type { ReactNode } from "react";
import "./screens.css";
import { api, useResource } from "./api";
import type { Staff, Teacher, User } from "./types";
import {
  Action,
  AdminMenu,
  Field,
  Form,
  Icon,
  Loading,
  Modal,
  ResourceError,
  useMobile,
  useNotice,
  value,
} from "./ui";

type Editor =
  | { kind: "staff"; person?: Staff }
  | { kind: "teacher"; person?: Teacher };
export default function People({ user }: { user: User }) {
  const staff = useResource<Staff[]>("/staff");
  const teachers = useResource<Teacher[]>("/teachers");
  const [editor, setEditor] = useState<Editor | null>(null);
  const admin = user.role === "admin";
  const notice = useNotice();
  const mobile = useMobile();
  const [tab, setTab] = useState<"staff" | "teacher">("staff");
  // 전화 걸기 + 번호 복사. 번호가 없으면 "미등록"
  const contact = (name: string, phone: string, what: string) =>
    phone ? (
      <span className="contact-actions">
        <a className="icon-btn" href={`tel:${phone}`} aria-label={`${name}에게 전화 걸기`}>
          <Icon name="phone" />
        </a>
        <Action className="icon-btn copy-contact" run={async () => {
          await navigator.clipboard.writeText(phone);
          notice("연락처를 복사했어요.");
        }}>
          <Icon name="copy" />
          <span className="sr-only">{name} {what} 복사</span>
        </Action>
      </span>
    ) : null;
  // 이름 줄. 모바일 관리자는 줄을 눌러 수정하고, 웹은 줄 끝의 "수정" 텍스트 버튼(contact 뒤)을 쓴다
  const main = (body: ReactNode, label: string, edit: () => void) =>
    admin && mobile ? (
      <button type="button" className="contact-main" onClick={edit}>{body}<span className="sr-only">{label}</span></button>
    ) : (
      <div className="contact-main">{body}</div>
    );
  const rowEdit = (label: string, edit: () => void) =>
    admin && !mobile && (
      <button className="text-btn row-edit" aria-label={label} onClick={edit}>
        수정
      </button>
    );
  const addRow = (label: string, add: () => void) =>
    admin && mobile && <li><button type="button" className="add-row" onClick={add}>＋ {label}</button></li>;
  return (
    <section className="view" aria-label="인적관리">
      <div className="segment people-switch" role="group" aria-label="연락처 종류">
        <button type="button" aria-pressed={tab === "staff"} onClick={() => setTab("staff")}>
          근로 <small>{staff.data?.filter((person) => person.active).length ?? "…"}</small>
        </button>
        <button type="button" aria-pressed={tab === "teacher"} onClick={() => setTab("teacher")}>
          선생님 <small>{teachers.data?.length ?? "…"}</small>
        </button>
      </div>
      <div className="people-layout">
        <section className={`card list-card people-panel${tab === "staff" ? " is-active" : ""}`} aria-label="근로 연락처">
          {!mobile && (
            <div className="card-head">
              <h2 id="staff-title">
                근로{" "}
                <small>
                  {staff.data?.filter((person) => person.active).length ?? "…"}명
                </small>
              </h2>
            </div>
          )}
          {staff.data ? (
            <>
              <ResourceError error={staff.error} retry={staff.refresh} />
              <ul className="contact-list">
                {staff.data.map((person) => (
                  <li key={person.id} className={`contact${person.active ? "" : " is-inactive"}`}>
                    <span className="avatar" aria-hidden="true">{person.name.slice(0, 1)}</span>
                    {main(
                      <>
                        <strong>
                          {person.name}
                          {!person.active && <small className="badge">비활성</small>}
                        </strong>
                        <span>{person.phone || "전화번호 미등록"}</span>
                      </>,
                      "정보 수정",
                      () => setEditor({ kind: "staff", person }),
                    )}
                    {contact(person.name, person.phone, "연락처")}
                    {rowEdit(`${person.name} 정보 수정`, () => setEditor({ kind: "staff", person }))}
                  </li>
                ))}
                {!staff.data.length && <li className="shift-issue-empty">아직 등록된 근무자가 없어요.</li>}
                {addRow("근무자 추가", () => setEditor({ kind: "staff" }))}
              </ul>
            </>
          ) : (
            <Loading error={staff.error} retry={staff.refresh} />
          )}
        </section>
        <section className={`card list-card people-panel${tab === "teacher" ? " is-active" : ""}`} aria-label="선생님 연락처">
          {!mobile && (
            <div className="card-head">
              <h2 id="teacher-title">
                선생님 <small>{teachers.data?.length ?? "…"}명</small>
              </h2>
            </div>
          )}
          {teachers.data ? (
            <>
              <ResourceError error={teachers.error} retry={teachers.refresh} />
              <ul className="contact-list">
                {teachers.data.map((person) => (
                  <li key={person.id} className="contact">
                    <span className="avatar" aria-hidden="true">{person.name.slice(0, 1)}</span>
                    {main(
                      <>
                        <strong>
                          {person.name}
                          {person.position && <small className="badge">{person.position}</small>}
                        </strong>
                        {mobile ? (
                          <span>
                            {[person.location, person.extension && `내선 ${person.extension}`, person.phone].filter(Boolean).join(" · ") || "연락처 미등록"}
                          </span>
                        ) : (
                          <>
                            <span>{person.location || "근무 장소 미등록"}</span>
                            <span>
                              내선 {person.extension || "미등록"} · 휴대폰 {person.phone || "미등록"}
                            </span>
                          </>
                        )}
                      </>,
                      "선생님 정보 수정",
                      () => setEditor({ kind: "teacher", person }),
                    )}
                    {contact(person.name, person.phone, "휴대폰 번호")}
                    {rowEdit(`${person.name} 선생님 정보 수정`, () => setEditor({ kind: "teacher", person }))}
                  </li>
                ))}
                {!teachers.data.length && <li className="shift-issue-empty">등록된 선생님이 없습니다.</li>}
                {addRow("선생님 추가", () => setEditor({ kind: "teacher" }))}
              </ul>
            </>
          ) : (
            <Loading error={teachers.error} retry={teachers.refresh} />
          )}
        </section>
      </div>
      {admin && !mobile && (
        <AdminMenu>
          <button type="button" onClick={() => setEditor({ kind: "staff" })}>근무자 추가</button>
          <button type="button" onClick={() => setEditor({ kind: "teacher" })}>선생님 추가</button>
        </AdminMenu>
      )}
      {editor?.kind === "staff" && (
        <Modal
          title={editor.person ? "근무자 정보 수정" : "근무자 추가"}
          onClose={() => setEditor(null)}
        >
          <Form
            onClose={() => setEditor(null)}
            onSave={async (data) => {
              await api(
                editor.person ? `/staff/${editor.person.id}` : "/staff",
                editor.person ? "PUT" : "POST",
                {
                  name: value(data, "name").trim(),
                  phone: value(data, "phone").trim(),
                  active: value(data, "active") === "true",
                },
              );
              setEditor(null);
              await staff.refresh();
              notice("근무자 정보를 저장했어요.");
            }}
          >
            <Field label="이름">
              <input
                name="name"
                required
                maxLength={20}
                autoComplete="name"
                defaultValue={editor.person?.name ?? ""}
              />
            </Field>
            <Field label="전화번호">
              <input
                name="phone"
                type="tel"
                maxLength={20}
                pattern="[0-9+() -]{7,20}"
                autoComplete="tel"
                defaultValue={editor.person?.phone ?? ""}
              />
            </Field>
            <Field label="재직 상태">
              <select
                name="active"
                defaultValue={String(
                  editor.person ? !!editor.person.active : true,
                )}
              >
                <option value="true">재직</option>
                <option value="false">비활성</option>
              </select>
            </Field>
            <p className="hint">
              이름을 바꾸면 시간표와 근무 통계에도 함께 바뀌어요.
            </p>
          </Form>
        </Modal>
      )}
      {editor?.kind === "teacher" && (
        <Modal
          title={editor.person ? "선생님 정보 수정" : "선생님 추가"}
          onClose={() => setEditor(null)}
        >
          <Form
            onClose={() => setEditor(null)}
            onSave={async (data) => {
              await api(
                editor.person ? `/teachers/${editor.person.id}` : "/teachers",
                editor.person ? "PUT" : "POST",
                Object.fromEntries(
                  ["name", "position", "extension", "phone", "location"].map(
                    (key) => [key, value(data, key).trim()],
                  ),
                ),
              );
              setEditor(null);
              await teachers.refresh();
              notice("선생님 정보를 저장했어요.");
            }}
          >
            {(
              ["name", "position", "extension", "phone", "location"] as const
            ).map((key, i) => (
              <Field
                key={key}
                label={
                  ["이름", "직급", "내선번호", "휴대폰 번호", "근무 장소"][i]
                }
              >
                <input
                  name={key}
                  type={key === "phone" || key === "extension" ? "tel" : "text"}
                  required={key === "name"}
                  maxLength={
                    key === "location" ? 80 : key === "position" ? 40 : 20
                  }
                  pattern={
                    key === "extension"
                      ? "[0-9+() -]{1,20}"
                      : key === "phone"
                        ? "[0-9+() -]{7,20}"
                        : undefined
                  }
                  defaultValue={editor.person?.[key] ?? ""}
                />
              </Field>
            ))}
          </Form>
        </Modal>
      )}
    </section>
  );
}
