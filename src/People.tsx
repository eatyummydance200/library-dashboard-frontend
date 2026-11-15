import { useState } from "react";
import "./people.css";
import { api, useResource } from "./api";
import type { Staff, Teacher, User } from "./types";
import { Field, Form, Loading, Modal, ResourceError, useMobile, useNotice, value } from "./ui";
import { Badge, Card, Chevron, ListHeader, ListRow, PageTop, Segmented } from "./tds";

type Kind = "staff" | "teacher";
type Editor = { kind: "staff"; person?: Staff } | { kind: "teacher"; person?: Teacher };

// 인적관리 (Figma 모바일 55088:1258 · 데스크톱 55092:2746). 관리자는 이름 줄을 눌러 고친다.
export default function People({ user }: { user: User }) {
  const staff = useResource<Staff[]>("/staff");
  const teachers = useResource<Teacher[]>("/teachers");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [tab, setTab] = useState<Kind>("staff");
  const admin = user.role === "admin";
  const notice = useNotice();
  const mobile = useMobile();
  const staffCount = staff.data?.filter((person) => person.active).length ?? "…";
  const teacherCount = teachers.data?.length ?? "…";
  const call = (name: string, phone: string) =>
    phone && (
      <a className="btn weak small people-call" href={`tel:${phone}`} aria-label={`${name}에게 전화 (${phone})`}>
        전화
      </a>
    );
  const edit = (label: string, open: () => void) => (admin ? { onClick: open, ariaLabel: label } : {});

  const staffList = staff.data ? (
    <>
      <ResourceError error={staff.error} retry={staff.refresh} />
      {staff.data.map((person) => (
        <ListRow
          key={person.id}
          className="people-row"
          icon="user"
          title={person.name}
          sub={person.phone || "전화번호 미등록"}
          right={person.active ? call(person.name, person.phone) : <Badge color="grey">비활성</Badge>}
          {...edit(`${person.name} 정보 수정`, () => setEditor({ kind: "staff", person }))}
        />
      ))}
      {!staff.data.length && <p className="people-empty">아직 등록된 근무자가 없어요.</p>}
    </>
  ) : (
    <Loading error={staff.error} retry={staff.refresh} />
  );
  const teacherList = teachers.data ? (
    <>
      <ResourceError error={teachers.error} retry={teachers.refresh} />
      {teachers.data.map((person) => (
        <ListRow
          key={person.id}
          className="people-row"
          icon="user"
          title={[person.name, person.position].filter(Boolean).join(" · ")}
          sub={[person.location, person.extension && `내선 ${person.extension}`].filter(Boolean).join(" · ") || "부서·내선 미등록"}
          sub2={`휴대폰 ${person.phone || "미등록"}`}
          right={call(person.name, person.phone)}
          {...edit(`${person.name} 선생님 정보 수정`, () => setEditor({ kind: "teacher", person }))}
        />
      ))}
      {!teachers.data.length && <p className="people-empty">등록된 선생님이 없어요.</p>}
    </>
  ) : (
    <Loading error={teachers.error} retry={teachers.refresh} />
  );
  const addLink = (label: string, kind: Kind) =>
    admin && (
      <button type="button" className="text-btn people-add" onClick={() => setEditor({ kind })}>
        {label}
        <Chevron />
      </button>
    );

  return (
    <section className="view people">
      <PageTop
        title="인적관리"
        lower={!mobile && `근무자와 선생님 연락처예요.${admin ? " 이름을 누르면 정보를 고칠 수 있어요." : ""}`}
        actions={
          admin && mobile && (
            <button
              type="button"
              className="btn small"
              aria-label={tab === "staff" ? "근무자 추가" : "선생님 추가"}
              onClick={() => setEditor({ kind: tab })}
            >
              추가
            </button>
          )
        }
      />
      {mobile ? (
        <>
          <div className="people-switch">
            <Segmented
              label="연락처 종류"
              value={tab}
              onChange={setTab}
              items={[
                { key: "staff", label: `근로 ${staffCount}` },
                { key: "teacher", label: `선생님 ${teacherCount}` },
              ]}
            />
          </div>
          <div className="people-list" aria-label={tab === "staff" ? "근로 연락처" : "선생님 연락처"} role="region">
            {tab === "staff" ? staffList : teacherList}
          </div>
        </>
      ) : (
        <div className="people-grid">
          <Card labelledBy="staff-title">
            <ListHeader id="staff-title" title={`근로 ${staffCount}명`} tail={addLink("근무자 추가", "staff")} />
            {staffList}
          </Card>
          <Card labelledBy="teacher-title">
            <ListHeader id="teacher-title" title={`선생님 ${teacherCount}명`} tail={addLink("선생님 추가", "teacher")} />
            {teacherList}
          </Card>
        </div>
      )}
      {editor?.kind === "staff" && (
        <Modal title={editor.person ? "근무자 정보 수정" : "근무자 추가"} onClose={() => setEditor(null)}>
          <Form
            onClose={() => setEditor(null)}
            onSave={async (data) => {
              await api(editor.person ? `/staff/${editor.person.id}` : "/staff", editor.person ? "PUT" : "POST", {
                name: value(data, "name").trim(),
                phone: value(data, "phone").trim(),
                active: value(data, "active") === "true",
              });
              setEditor(null);
              await staff.refresh();
              notice("근무자 정보를 저장했어요.");
            }}
          >
            <Field label="이름">
              <input name="name" required maxLength={20} autoComplete="name" defaultValue={editor.person?.name ?? ""} />
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
              <select name="active" defaultValue={String(editor.person ? !!editor.person.active : true)}>
                <option value="true">재직</option>
                <option value="false">비활성</option>
              </select>
            </Field>
            <p className="hint">이름을 바꾸면 시간표와 근무 통계에도 함께 바뀌어요.</p>
          </Form>
        </Modal>
      )}
      {editor?.kind === "teacher" && (
        <Modal title={editor.person ? "선생님 정보 수정" : "선생님 추가"} onClose={() => setEditor(null)}>
          <Form
            onClose={() => setEditor(null)}
            onSave={async (data) => {
              await api(
                editor.person ? `/teachers/${editor.person.id}` : "/teachers",
                editor.person ? "PUT" : "POST",
                Object.fromEntries(
                  ["name", "position", "extension", "phone", "location"].map((key) => [key, value(data, key).trim()]),
                ),
              );
              setEditor(null);
              await teachers.refresh();
              notice("선생님 정보를 저장했어요.");
            }}
          >
            {(["name", "position", "extension", "phone", "location"] as const).map((key, i) => (
              <Field key={key} label={["이름", "직급", "내선번호", "휴대폰 번호", "근무 장소"][i]}>
                <input
                  name={key}
                  type={key === "phone" || key === "extension" ? "tel" : "text"}
                  required={key === "name"}
                  maxLength={key === "location" ? 80 : key === "position" ? 40 : 20}
                  pattern={
                    key === "extension" ? "[0-9+() -]{1,20}" : key === "phone" ? "[0-9+() -]{7,20}" : undefined
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
