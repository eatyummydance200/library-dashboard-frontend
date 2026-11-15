import { useEffect, useState } from "react";
import { api, useResource } from "./api";
import type { Duty, Issue, Shift, Staff, Status, Teacher, User } from "./types";
import { koreaParts, time, today } from "./dates";
import { IssueEditor, TodayIssues } from "./Issues";
import { Badge, Card, Chevron, ListHeader, ListRow, PageTop } from "./tds";
import "./home.css";
import {
  Field,
  Form,
  Loading,
  Modal,
  ResourceError,
  numeric,
  useMobile,
  useNotice,
} from "./ui";

const clockOf = (at: string) => {
  const parts = koreaParts(new Date(at));
  return `${parts.hour}:${parts.minute}`;
};
const dateOf = (at: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long" }).format(new Date(at));
const roleBadge = (role: Shift["role"]) =>
  role === "desk" ? <Badge color="blue">데스크</Badge> : <Badge color="yellow">대기</Badge>;

// 맨 위 문장: 지금 데스크를 맡은 사람과 다음에 바뀌는 시각. next는 다음 경계 시각(next_at)의 근무자들이다.
export function deskHeadline(status: Status, nameOf: (id: number) => string) {
  const desk = (shifts: Shift[]) => shifts.filter((shift) => shift.role === "desk");
  const names = (shifts: Shift[]) => desk(shifts).map((shift) => nameOf(shift.staff_id)).join("·");
  const now = names(status.current);
  const next = names(status.next);
  const at = status.next_at && clockOf(status.next_at);
  const title = now ? `지금 데스크는\n${now}님이 지키고 있어요` : "지금은 데스크\n근무가 없어요";
  let lower: string;
  if (at && now !== next) {
    if (!next) lower = `${at}에 데스크 근무가 끝나요`;
    else lower = now ? `${at}에 ${next}님으로 바뀌어요` : `${at}에 ${next}님이 시작해요`;
  } else if (now) lower = `${time(Math.min(...desk(status.current).map((shift) => shift.end)))}까지 근무해요`;
  else lower = "오늘 남은 근무가 없어요";
  return { title, lower };
}

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
  const nameOf = (id: number) => staff.data?.find((person) => person.id === id)?.name ?? "근무자";
  const ready = status.data && staff.data ? status.data : undefined;
  const retryStatus = () => {
    void status.refresh();
    void staff.refresh();
  };
  const headline = ready && deskHeadline(ready, nameOf);
  // 줄바꿈은 모바일에서만 (데스크톱은 한 줄)
  const title = headline ? (mobile ? headline.title : headline.title.replace("\n", " ")) : "근무 현황";
  const shiftRows = (shifts: Shift[], withTime: boolean) =>
    shifts.map((shift) => (
      <ListRow
        key={shift.id}
        icon="user"
        title={nameOf(shift.staff_id)}
        sub={withTime ? `${time(shift.start)}–${time(shift.end)}` : undefined}
        right={roleBadge(shift.role)}
      />
    ));
  const lineup = (shifts: Shift[]) =>
    shifts.map((shift) => `${nameOf(shift.staff_id)}(${shift.role === "desk" ? "데스크" : "대기"})`).join(" · ");

  const nowCard = (
    <Card className="home-card" labelledBy="now-title">
      <ListHeader id="now-title" title="지금 근무 중" tail={ready && `${clockOf(ready.at)} 기준`} />
      {ready ? (
        <>
          <ResourceError error={status.error || staff.error} retry={retryStatus} />
          {ready.current.length ? shiftRows(ready.current, true) : <p className="home-empty">지금은 근무 중인 사람이 없어요</p>}
          {mobile && ready.next_at && (
            <ListRow title={`다음 근무 ${clockOf(ready.next_at)}`} sub={lineup(ready.next) || "근무자가 없어요"} />
          )}
        </>
      ) : (
        <Loading error={status.error || staff.error} retry={retryStatus} />
      )}
    </Card>
  );
  const nextCard = ready && (
    <Card className="home-card" labelledBy="next-title">
      <ListHeader id="next-title" title="다음 근무" tail={ready.next_at && <span className="home-next-at">{clockOf(ready.next_at)}</span>} />
      {ready.next_at ? (
        ready.next.length ? shiftRows(ready.next, false) : <p className="home-empty">근무자가 없어요</p>
      ) : (
        <p className="home-empty">오늘 남은 근무가 없어요</p>
      )}
      {ready.previous_at && (
        <ListRow title={`이전 근무 ${clockOf(ready.previous_at)}`} sub={lineup(ready.previous) || "근무자가 없어요"} />
      )}
    </Card>
  );
  const d = duty.data;
  const dutyCard = (
    <Card className="home-card" label={mobile ? "오늘의 당직" : undefined} labelledBy={mobile ? undefined : "duty-title"}>
      {!mobile && <ListHeader id="duty-title" title="오늘의 당직" />}
      {d ? (
        <>
          <ResourceError error={duty.error} retry={duty.refresh} />
          <ListRow
            icon="phone"
            title={d.teacher ? `${d.teacher} 선생님` : "아직 정해지지 않았어요"}
            sub={[mobile && "오늘의 당직", d.extension && `내선 ${d.extension}`, !mobile && d.phone].filter(Boolean).join(" · ") || undefined}
            right={d.phone && (
              <a className="btn weak small home-call" href={`tel:${d.phone}`} aria-label={`당직 ${d.teacher} 선생님 휴대폰 ${d.phone}로 전화`}>
                전화
              </a>
            )}
          />
          {user.role === "admin" && (
            <div className="home-card-foot">
              <button type="button" className="btn home-wide" aria-label="당직 정보 수정" onClick={() => setEditing(true)}>
                수정
              </button>
            </div>
          )}
        </>
      ) : (
        <Loading error={duty.error} retry={duty.refresh} />
      )}
    </Card>
  );
  const left = dailyIssues.data?.filter((issue) => !issue.done).length;
  const issuesCard = (
    <Card className="home-card" labelledBy="today-issues-title">
      <ListHeader
        id="today-issues-title"
        title={`오늘 할 일${left ? ` ${left}` : ""}`}
        tail={
          <button type="button" className="home-more" onClick={showIssues} aria-label="주간 이슈로 이동">
            {mobile ? "전체보기" : "주간 이슈"}
            <Chevron />
          </button>
        }
      />
      <TodayIssues resource={dailyIssues} user={user} onChanged={issues.refresh} />
      {user.role !== "viewer" && (
        <div className="home-card-foot">
          <button type="button" className="text-btn home-add" onClick={() => setAddingIssue(true)}>
            + 이슈 남기기
          </button>
        </div>
      )}
    </Card>
  );
  return (
    <section id="dashboard" className="view home" aria-label="근무 대시보드">
      <PageTop upper={ready && dateOf(ready.at)} title={title} lower={headline?.lower} brandLower />
      {mobile ? (
        <div className="home-col">
          {nowCard}
          {dutyCard}
          {issuesCard}
        </div>
      ) : (
        <div className="home-grid">
          <div className="home-col">
            {nowCard}
            {issuesCard}
          </div>
          <div className="home-col">
            {dutyCard}
            {nextCard}
          </div>
        </div>
      )}
      {addingIssue && (
        <IssueEditor
          day={day}
          onClose={() => setAddingIssue(false)}
          onSaved={async () => {
            await Promise.all([dailyIssues.refresh(), issues.refresh()]);
          }}
        />
      )}
      {editing && <DutyEditor onClose={() => setEditing(false)} onSaved={duty.refresh} />}
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
