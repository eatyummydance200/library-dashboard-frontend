import { useEffect, useState } from "react";
import { api, useResource } from "./api";
import type { Duty, Issue, Staff, Status, Teacher, User } from "./types";
import { koreaParts, today } from "./dates";
import { IssueEditor, TodayIssues } from "./Issues";
import {
  Field,
  Form,
  Icon,
  Loading,
  Modal,
  ResourceError,
  numeric,
  useMobile,
  useNotice,
} from "./ui";

export default function Dashboard({
  user,
  issues,
  showIssues,
}: {
  user: User;
  issues: ReturnType<typeof useResource<Issue[]>>;
  showIssues: () => void;
}) {
  const status = useResource<Status>("/status");
  const duty = useResource<Duty>("/duty");
  const staff = useResource<Staff[]>("/staff");
  const [day, setDay] = useState(today);
  const dailyIssues = useResource<Issue[]>(`/issues?day=${day}`);
  const [addingIssue, setAddingIssue] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) {
        setDay(today());
        void status.refresh();
        void duty.refresh();
        void dailyIssues.refresh();
      }
    };
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [status.refresh, duty.refresh, dailyIssues.refresh]);
  const mobile = useMobile();
  const clock = status.data ? koreaParts(new Date(status.data.at)) : undefined;
  const nameOf = (id: number) =>
    staff.data?.find((person) => person.id === id)?.name ?? "근무자";
  function people(key: "previous" | "current" | "next", role: "desk" | "general") {
    const entries = status.data![key].filter((shift) => shift.role === role);
    return entries.length ? (
      entries.map((shift) => (
        <span className="duty-person" key={shift.id}>
          {nameOf(shift.staff_id)}
        </span>
      ))
    ) : (
      <span className="unassigned">비어 있어요</span>
    );
  }
  // 모바일: 이전·다음 근무를 "다음 15:00 · 김가 · 이나(대기)"처럼 한 줄로
  function neighbor(key: "previous" | "next") {
    const at = status.data![`${key}_at`];
    const parts = at ? koreaParts(new Date(at)) : undefined;
    const names = status.data![key].map(
      (shift) => `${nameOf(shift.staff_id)}${shift.role === "desk" ? "" : "(대기)"}`,
    );
    return (
      <p key={key} className="neighbor-line">
        <b>{key === "previous" ? "이전" : "다음"}</b>
        <time dateTime={at ?? undefined}>{parts ? `${parts.hour}:${parts.minute}` : "예정 없음"}</time>
        {parts && <span>{names.join(" · ") || "비어 있어요"}</span>}
      </p>
    );
  }
  const retryStatus = () => {
    void status.refresh();
    void staff.refresh();
  };
  const nowHead = (
    <div className="card-head">
      <h2 id="now-title">
        <i className="live-dot" aria-hidden="true" />
        지금 근무 중
      </h2>
      <span id="shift-date">
        {clock &&
          `${Number(clock.month)}월 ${Number(clock.day)}일 ${clock.hour}:${clock.minute}`}
      </span>
    </div>
  );
  const nowRoles = () => (
    <>
      <ResourceError error={status.error || staff.error} retry={retryStatus} />
      <div className="now-roles">
        {(["desk", "general"] as const).map((role) => (
          <div
            key={role}
            className={`duty-group ${role === "desk" ? "desk-duty" : "standby-duty"}`}
          >
            <h3>{role === "desk" ? "데스크" : "대기 근무"}</h3>
            <div className="duty-people">{people("current", role)}</div>
          </div>
        ))}
      </div>
    </>
  );
  const dialogs = (
    <>
      {addingIssue && (
        <IssueEditor
          day={day}
          onClose={() => setAddingIssue(false)}
          onSaved={async () => {
            await Promise.all([dailyIssues.refresh(), issues.refresh()]);
          }}
        />
      )}
      {editing && (
        <DutyEditor onClose={() => setEditing(false)} onSaved={duty.refresh} />
      )}
    </>
  );
  if (mobile) return (
    <section id="dashboard" className="view" aria-label="근무 대시보드">
      <section className="card now-card" aria-labelledby="now-title">
        {nowHead}
        {status.data && staff.data ? (
          <>
            {nowRoles()}
            <div className="shift-neighbors">{neighbor("previous")}{neighbor("next")}</div>
          </>
        ) : (
          <Loading error={status.error || staff.error} retry={retryStatus} />
        )}
        <div className="now-duty" aria-label="오늘의 당직">
          {duty.data ? (
            <>
              <ResourceError error={duty.error} retry={duty.refresh} />
              <p>
                <b>당직</b>
                <span>
                  {duty.data.teacher || "아직 정해지지 않았어요"}
                  {duty.data.extension && ` · 내선 ${duty.data.extension}`}
                </span>
              </p>
              {duty.data.phone && (
                <a className="btn call-btn" href={`tel:${duty.data.phone}`} aria-label={`당직 ${duty.data.teacher} 휴대폰 ${duty.data.phone}로 전화`}>
                  <Icon name="phone" />
                  전화
                </a>
              )}
              {user.role === "admin" && (
                <button className="text-btn" aria-label="당직 정보 수정" onClick={() => setEditing(true)}>
                  수정
                </button>
              )}
            </>
          ) : (
            <Loading error={duty.error} retry={duty.refresh} />
          )}
        </div>
      </section>
      <section className="card list-card" aria-labelledby="today-issues-title">
        <div className="card-head">
          <h2 id="today-issues-title">오늘 할 일</h2>
        </div>
        <TodayIssues resource={dailyIssues} user={user} onChanged={issues.refresh} />
      </section>
      {user.role !== "viewer" && (
        <button className="btn primary fab" onClick={() => setAddingIssue(true)}>
          <Icon name="plus" />
          새 이슈
        </button>
      )}
      {dialogs}
    </section>
  );
  return (
    <section id="dashboard" className="view" aria-label="근무 대시보드">
      <div className="dashboard-grid">
        <section className="card now-card" aria-labelledby="now-title">
          {nowHead}
          {status.data && staff.data ? (
            <>
              {nowRoles()}
              <div className="shift-neighbors">
                {(["previous", "next"] as const).map((key) => {
                  const at = status.data![`${key}_at`];
                  const parts = at ? koreaParts(new Date(at)) : undefined;
                  return (
                    <article key={key} className="shift">
                      <div className="shift-head">
                        <h3>{key === "previous" ? "이전 근무" : "다음 근무"}</h3>
                        <time dateTime={at ?? undefined}>
                          {parts ? `${parts.hour}:${parts.minute}` : "예정 없음"}
                        </time>
                      </div>
                      {(["desk", "general"] as const).map((role) => (
                        <p key={role} className={`shift-line ${role === "desk" ? "is-desk" : "is-standby"}`}>
                          <span className="shift-role">{role === "desk" ? "데스크" : "대기"}</span>
                          <span className="duty-people">{people(key, role)}</span>
                        </p>
                      ))}
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <Loading error={status.error || staff.error} retry={retryStatus} />
          )}
        </section>
        <section className="card duty-card" aria-labelledby="duty-title">
          <div className="card-head">
            <h2 id="duty-title">오늘의 당직</h2>
            {user.role === "admin" && (
              <button className="btn small" onClick={() => setEditing(true)}>수정</button>
            )}
          </div>
          {duty.data ? (
            <>
              <ResourceError error={duty.error} retry={duty.refresh} />
              <dl className="duty-contact">
                <div>
                  <dt>담당쌤</dt>
                  <dd className={duty.data.teacher ? undefined : "duty-empty"}>
                    {duty.data.teacher || "아직 정해지지 않았어요"}
                  </dd>
                </div>
                <div>
                  <dt>내선번호</dt>
                  <dd className={duty.data.extension ? undefined : "duty-empty"}>
                    {duty.data.extension || "미등록"}
                  </dd>
                </div>
                <div>
                  <dt>휴대폰</dt>
                  <dd className={duty.data.phone ? "duty-phone" : "duty-empty"}>
                    {duty.data.phone ? (
                      <>
                        {duty.data.phone}
                        <a className="btn call-btn" href={`tel:${duty.data.phone}`}>
                          <Icon name="phone" />
                          전화
                        </a>
                      </>
                    ) : (
                      "미등록"
                    )}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <Loading error={duty.error} retry={duty.refresh} />
          )}
        </section>
      </div>
      <section className="card issues-card" aria-labelledby="today-issues-title">
        <div className="card-head">
          <h2 id="today-issues-title">
            <button className="title-link" onClick={showIssues} aria-label="오늘의 이슈 · 주간 이슈로 이동">
              오늘의 이슈 <Icon name="chevron" />
            </button>
          </h2>
          {user.role !== "viewer" && (
            <button className="btn small" onClick={() => setAddingIssue(true)}>
              <Icon name="plus" />
              새 이슈
            </button>
          )}
        </div>
        <TodayIssues resource={dailyIssues} user={user} onChanged={issues.refresh} />
      </section>
      {dialogs}
    </section>
  );
}
function DutyEditor({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const teachers = useResource<Teacher[]>("/teachers");
  const duty = useResource<Duty>("/duty");
  const notice = useNotice();
  return (
    <Modal title="당직 정보 수정" onClose={onClose}>
      {teachers.data && duty.data ? (
        <DutyForm
          teachers={teachers.data}
          duty={duty.data}
          onClose={onClose}
          onSave={async (id) => {
            await api("/duty", "PUT", { teacher_id: id });
            onClose();
            await onSaved();
            notice("당직 정보를 저장했어요.");
          }}
        />
      ) : (
        <Loading
          error={teachers.error || duty.error}
          retry={() => {
            void teachers.refresh();
            void duty.refresh();
          }}
        />
      )}
    </Modal>
  );
}
function DutyForm({
  teachers,
  duty,
  onClose,
  onSave,
}: {
  teachers: Teacher[];
  duty: Duty;
  onClose: () => void;
  onSave: (id: number | null) => Promise<void>;
}) {
  const [id, setId] = useState(duty.teacher_id || 0);
  const selected = teachers.find((teacher) => teacher.id === id);
  return (
    <Form
      onClose={onClose}
      onSave={(data) => onSave(numeric(data, "teacher_id") || null)}
    >
      <Field label="담당쌤">
        <select
          name="teacher_id"
          value={id}
          onChange={(event) => setId(Number(event.target.value))}
        >
          <option value={0}>미등록</option>
          {teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.name} · {teacher.location}
            </option>
          ))}
        </select>
      </Field>
      <Field label="내선번호">
        <input type="tel" value={selected?.extension ?? ""} readOnly />
      </Field>
      <Field label="휴대폰 번호">
        <input type="tel" value={selected?.phone ?? ""} readOnly />
      </Field>
      <p className="hint">
        연락처는 인적관리에 등록된 정보를 가져와요. 당직은 다음 날(한국 시간)
        자동으로 초기화돼요.
      </p>
    </Form>
  );
}
