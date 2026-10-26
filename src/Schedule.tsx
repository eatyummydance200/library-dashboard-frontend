import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { api, useResource } from "./api";
import type { Issue, OriginalWeek, Shift, User, Week, WeeklyHours } from "./types";
import {
  addDays,
  days,
  koreaParts,
  minutes,
  monday,
  shortDay,
  time,
  today,
  weekLabel,
} from "./dates";
import {
  Action,
  Field,
  Form,
  Icon,
  Loading,
  Modal,
  ResourceError,
  numeric,
  useNotice,
  value,
} from "./ui";
import { IssueList } from "./Issues";
import ShiftIssueEditor from "./ShiftIssueEditor";

function layout(entries: Shift[]) {
  const result: (Shift & { lane: number })[] = [];
  let lanes = 0;
  for (const role of ["desk", "general"]) {
    const ends: number[] = [];
    for (const shift of entries
      .filter((shift) => shift.role === role)
      .sort((a, b) => a.start - b.start || a.end - b.end || a.id - b.id)) {
      let lane = ends.findIndex((end) => end <= shift.start);
      if (lane < 0) lane = ends.length;
      ends[lane] = shift.end;
      result.push({ ...shift, lane: lanes + lane });
    }
    lanes += Math.max(1, ends.length);
  }
  return { entries: result, lanes };
}
export default function Schedule({
  user,
  onIssuesChange,
}: {
  user: User;
  onIssuesChange: () => Promise<void>;
}) {
  const [week, setWeek] = useState(monday());
  const data = useResource<Week>(`/schedule?week=${week}`);
  const original = useResource<OriginalWeek>(`/schedule/original?week=${week}`);
  const hours = useResource<{ overrides: WeeklyHours[] }>(`/schedule/hours?week=${week}`);
  const [editingHours, setEditingHours] = useState<number | null>(null);
  const issues = useResource<Issue[]>(
    `/issues?category=${encodeURIComponent("근무 변경")}&week=${week}`,
  );
  const [clock, setClock] = useState(koreaParts());
  const [day, setDay] = useState(
    Math.min((new Date(`${today()}T00:00:00Z`).getUTCDay() + 6) % 7, 4),
  );
  const [person, setPerson] = useState("");
  const [filter, setFilter] = useState("open");
  const [addingIssue, setAddingIssue] = useState<{ shift?: Shift } | null>(null);
  const [editor, setEditor] = useState<{ shift?: Shift; issue?: Issue } | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [focus, setFocus] = useState<{ id: number } | null>(null);
  const handledFocus = useRef<typeof focus>(null);
  const board = useRef<HTMLDivElement>(null);
  const [copying, setCopying] = useState(false);
  const admin = user.role === "admin";
  const notice = useNotice();
  async function refreshIssues() {
    await Promise.all([issues.refresh(), onIssuesChange()]);
  }
  function locate(issue: Issue) {
    if (issue.shift_id == null) return;
    const date = issue.current_day ?? issue.day;
    setSelectedId(null);
    setWeek(monday(date));
    setDay((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7);
    setPerson("");
    setFocus({ id: issue.shift_id });
  }
  function apply(issue: Issue) {
    const shift = data.data?.shifts.find((entry) => entry.id === issue.shift_id);
    if (!shift) {
      notice("연결된 근무가 현재 주에 없습니다. 근무표에서 위치를 확인해주세요.");
      return;
    }
    setSelectedId(null);
    setEditor({ shift, issue });
  }
  useEffect(() => {
    if (!focus || handledFocus.current === focus) return;
    const target = board.current?.querySelector<HTMLButtonElement>(`[data-shift-id="${focus.id}"]`);
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    target.focus({ preventScroll: true });
    handledFocus.current = focus;
  }, [focus, data.data, day]);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) {
        setClock(koreaParts());
        void data.refresh();
        void issues.refresh();
        void original.refresh();
        void hours.refresh();
      }
    };
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [data.refresh, issues.refresh, original.refresh, hours.refresh]);
  const dates = days.map((_, index) => addDays(week, index));
  const selectedShift = data.data?.shifts.find((shift) => shift.id === selectedId);
  const pending = new Map<number, number>();
  for (const issue of issues.data ?? []) {
    if (!issue.done && issue.shift_id != null) {
      pending.set(issue.shift_id, (pending.get(issue.shift_id) ?? 0) + 1);
    }
  }
  const todayKey = `${clock.year}-${clock.month}-${clock.day}`;
  const minute = Number(clock.hour) * 60 + Number(clock.minute);
  const slot =
    dates.includes(todayKey) && minute >= 540 && minute < 1320
      ? Math.floor((minute - 540) / 30)
      : -1;
  return (
    <section className="view schedule-workspace" aria-label="주간 시간표">
      <div className="schedule-row">
      <div className="compact-schedule">
        <div className="card schedule-only">
          <div className="card-head schedule-head">
            <h2>주간 근무 시간표</h2>
            <div className="week-controls">
              <button
                className="icon-btn"
                aria-label="이전 주"
                onClick={() => setWeek(addDays(week, -7))}
              >
                ‹
              </button>
              <strong className={week === monday() ? "current-week" : undefined}>
                {weekLabel(week)}
              </strong>
              <button
                className="icon-btn"
                aria-label="다음 주"
                onClick={() => setWeek(addDays(week, 7))}
              >
                ›
              </button>
            </div>
          </div>
          <div className="schedule-tools">
            <div className="legend">
              <span className="desk-legend">
                <i />
                데스크
              </span>
              <span className="standby-legend">
                <i />
                대기
              </span>
              <span className="change-legend"><i />변경 요청</span>
            </div>
            <div className="schedule-filters">
              {admin && (
                <>
                  <button
                    className="btn"
                    disabled={!data.data}
                    onClick={() => setEditor({})}
                  >
                    ＋ 근무 추가
                  </button>
                  <button
                    className="btn"
                    disabled={!data.data}
                    onClick={() => setCopying(true)}
                  >
                    주 복사
                  </button>
                </>
              )}
              <select
                className="select"
                aria-label="시간표 근무자 선택"
                value={person}
                onChange={(event) => setPerson(event.target.value)}
              >
                <option value="">전체 근무자</option>
                {data.data?.staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div
            className="day-picker"
            role="group"
            aria-label="시간표 요일 선택"
          >
            {days.map((label, index) => (
              <button
                key={label}
                aria-pressed={day === index}
                onClick={() => setDay(index)}
              >
                {label}
                <small>{shortDay(dates[index])}</small>
              </button>
            ))}
          </div>
          {data.data ? (
            <>
              <ResourceError error={data.error} retry={data.refresh} />
              <div className="table-inset schedule-table">
                <div
                  ref={board}
                  className="week-board"
                  style={{ "--slot-count": 26 } as CSSProperties}
                  aria-label="30분 단위 주간 근무 시간표"
                >
                  <div className="time-axis">
                    <div className="day-heading">시간</div>
                    <div className="time-ticks">
                      {Array.from({ length: 26 }, (_, index) => (
                        <div
                          key={index}
                          className={`time-tick ${index === slot ? "current-row" : ""} ${index % 2 ? "half-hour" : ""}`}
                          aria-current={index === slot ? "time" : undefined}
                        >
                          {time(540 + index * 30)}
                        </div>
                      ))}
                      <div className="time-tick">22:00</div>
                    </div>
                  </div>
                  {dates.map((date, index) => {
                    const placed = layout(
                      data.data!.shifts.filter((shift) => shift.day === date),
                    );
                    return (
                      <section
                        key={date}
                        className={`day-track ${index === day ? "selected-day" : ""} ${date === todayKey ? "today-col" : ""}`}
                        aria-label={`${date} ${days[index]}요일`}
                      >
                        <h3 className="day-heading">
                          {days[index]}
                          <span>
                            {shortDay(date)}
                            {date === todayKey && " · 오늘"}
                          </span>
                        </h3>
                        <div
                          className="track-grid"
                          style={{ "--lanes": placed.lanes } as CSSProperties}
                        >
                          {placed.entries.map((shift) => {
                            const name =
                              data.data!.staff.find(
                                (person) => person.id === shift.staff_id,
                              )?.name ?? "근무자";
                            const span = (shift.end - shift.start) / 30;
                            const requests = pending.get(shift.id) ?? 0;
                            const label = `${name} · ${time(shift.start)}–${time(shift.end)} · ${shift.role === "desk" ? "데스크" : "대기"}`;
                            return (
                              <button
                                key={shift.id}
                                type="button"
                                data-shift-id={shift.id}
                                className={`worker ${shift.role === "desk" ? "desk" : "standby"} ${span === 1 ? "short-shift" : ""} ${person && person !== String(shift.staff_id) ? "dimmed" : ""} ${requests ? "has-change" : ""} ${focus?.id === shift.id ? "is-focused" : ""}`}
                                style={{
                                  gridRow: `${(shift.start - 540) / 30 + 1}/span ${span}`,
                                  gridColumn: shift.lane + 1,
                                }}
                                title={`${label}${requests ? ` · 변경 요청 ${requests}건` : ""}`}
                                aria-label={`${label}${requests ? ` · 변경 요청 ${requests}건` : ""} · 상세 보기`}
                                onClick={() => {
                                  setSelectedId(shift.id);
                                }}
                              >
                                <strong>{name}</strong>
                                {requests > 0 && (
                                  <span className="shift-change-badge">
                                    <span className="change-badge-label">변경 요청</span>
                                    {requests > 1 && <span>{requests}</span>}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                          {!placed.entries.length && (
                            <span className="empty-day">배정 없음</span>
                          )}
                          {date === todayKey && slot >= 0 && (
                            <>
                              <div
                                className="current-band"
                                style={{ top: `${(slot / 26) * 100}%` }}
                              />
                              <span
                                className="now-line"
                                style={{
                                  top: `${((minute - 540) / 780) * 100}%`,
                                }}
                              >
                                <span>
                                  현재 {clock.hour}:{clock.minute}
                                </span>
                              </span>
                            </>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <Loading error={data.error} retry={data.refresh} />
          )}
        </div>
      </div>
        <section className="card shift-issues-card" aria-label="근무 변경 이슈">
          <div className="card-head">
            <h2>근무 변경 이슈</h2>
            <button className="btn" onClick={() => setAddingIssue({})}>
              등록
            </button>
          </div>
          <div className="shift-issue-tools">
            <select
              className="select"
              aria-label="근무 변경 이슈 상태"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="open">진행 중</option>
              <option value="done">완료</option>
              <option value="all">전체</option>
            </select>
            <span className="hint">
              {weekLabel(week)}
            </span>
          </div>
          <IssueList
            user={user}
            resource={issues}
            filter={filter}
            compact
            onChanged={onIssuesChange}
            onSelect={locate}
            onApply={apply}
          />
        </section>
      </div>
      <div className="schedule-row">
        {original.data ? <OriginalSchedule week={original.data} current={data.error ? undefined : data.data} admin={admin} error={original.error} onSaved={original.refresh} /> : (
          <section className="card">
            <div className="card-head"><h2>원본 근무 시간표</h2></div>
            <Loading error={original.error} retry={original.refresh} />
          </section>
        )}
        <section className="card stats-card">
          <div className="card-head">
            <h2>
              주당 근무 시간{" "}
              <small>
                {original.data?.staff.filter((person) => person.active).length ?? "…"}명
              </small>
            </h2>
          </div>
          {original.data?.saved ? (
            hours.data ? <>
              <ResourceError error={original.error} retry={original.refresh} />
              <ResourceError error={hours.error} retry={hours.refresh} />
              <Stats week={original.data} overrides={hours.data.overrides} onEdit={admin ? setEditingHours : undefined} />
            </> : <Loading error={hours.error} retry={hours.refresh} />
          ) : original.data ? <p className="shift-issue-empty">원본 근무 시간표를 먼저 저장해주세요.</p> : <Loading error={original.error} retry={original.refresh} />}
        </section>
      </div>
      {editingHours != null && original.data?.saved && hours.data && (
        <WeeklyHoursEditor
          key={`${week}/${editingHours}`}
          week={original.data}
          person={editingHours}
          override={hours.data.overrides.find((entry) => entry.staff_id === editingHours)}
          onClose={() => setEditingHours(null)}
          onSaved={hours.refresh}
        />
      )}
      {selectedShift && data.data && (
        <Modal title="근무 상세 · 변경 요청" onClose={() => setSelectedId(null)}>
          <p className="shift-detail-summary">
            <strong>{data.data.staff.find((person) => person.id === selectedShift.staff_id)?.name ?? "근무자"}</strong>
            {` · ${selectedShift.day} · ${time(selectedShift.start)}–${time(selectedShift.end)}`}
            {` · ${selectedShift.role === "desk" ? "데스크" : "대기"}`}
          </p>
          <div className="shift-detail-actions">
            {(admin || user.staff_id === selectedShift.staff_id) && (
              <button className="btn primary" onClick={() => {
                setAddingIssue({ shift: selectedShift });
                setSelectedId(null);
              }}>변경 요청 등록</button>
            )}
            {admin && <button className="btn" onClick={() => {
              setEditor({ shift: selectedShift });
              setSelectedId(null);
            }}>근무 수정</button>}
          </div>
          <IssueList
            user={user}
            resource={{ ...issues, data: issues.data?.filter((issue) => issue.shift_id === selectedShift.id) }}
            filter="all"
            compact
            onChanged={onIssuesChange}
            onApply={apply}
          />
        </Modal>
      )}
      {editor && data.data && (
        <ShiftEditor
          key={editor.shift?.id ?? "new"}
          week={data.data}
          shift={editor.shift}
          issue={editor.issue}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            await Promise.all([data.refresh(), refreshIssues()]);
          }}
        />
      )}
      {copying && (
        <Modal title="다른 주에서 복사" onClose={() => setCopying(false)}>
          <Form
            onClose={() => setCopying(false)}
            onSave={async (form) => {
              const result = await api<{ count: number }>(
                "/schedule/copy",
                "POST",
                {
                  source: value(form, "source"),
                  target: value(form, "target"),
                },
              );
              setCopying(false);
              await data.refresh();
              notice(`${result.count}개 근무를 복사했어요.`);
            }}
          >
            <Field label="원본 주에 속한 날짜">
              <input
                name="source"
                type="date"
                required
                defaultValue={addDays(week, -7)}
              />
            </Field>
            <Field label="대상 주에 속한 날짜">
              <input name="target" type="date" required defaultValue={week} />
            </Field>
            <p className="hint">대상 주에 근무가 있으면 복사하지 않습니다.</p>
          </Form>
        </Modal>
      )}
      {addingIssue && (
        <ShiftIssueEditor
          user={user}
          shift={addingIssue.shift}
          day={today() >= week && today() <= dates[4] ? today() : week}
          onClose={() => setAddingIssue(null)}
          onSaved={refreshIssues}
        />
      )}
    </section>
  );
}
function OriginalSchedule({ week, current, admin, error, onSaved }: { week: OriginalWeek; current?: Week; admin: boolean; error?: string; onSaved: () => Promise<void> }) {
  const notice = useNotice();
  const dates = days.map((_, index) => addDays(week.week, index));
  const columns = dates.flatMap((date) => (["desk", "general"] as const).map((role) => ({ date, role })));
  const rows = Array.from({ length: 26 }, (_, index) => {
    const start = 540 + index * 30;
    return [
      `${time(start)}–${time(start + 30)}`,
      ...columns.map(({ date, role }) => week.shifts
        .filter((shift) => shift.day === date && shift.role === role && shift.start <= start && shift.end > start)
        .map((shift) => week.staff.find((person) => person.id === shift.staff_id)?.name ?? "근무자")
        .join(", ")),
    ];
  });
  return (
    <section className="card schedule-copy-card" aria-label="원본 근무 시간표">
      <div className="card-head">
        <h2>원본 근무 시간표</h2>
        <div className="issue-card-actions">
        {admin && <Action disabled={!current?.shifts.length} run={async () => {
          if (!current || !confirm(week.saved ? "합의한 원본을 현재 주간 근무표로 교체할까요? 별도로 조정한 주당 근무 시간은 유지됩니다." : "현재 주간 근무표를 합의한 원본으로 저장할까요?")) return;
          await api("/schedule/original", "PUT", { week: week.week, shifts: current.shifts });
          await onSaved();
          notice("원본 근무 시간표를 저장했어요.");
        }}>{week.saved ? "원본 다시 저장" : "현재 근무표를 원본으로 저장"}</Action>}
        <Action disabled={!week.saved} run={async () => {
          const header = ["시간", ...days.flatMap((day) => [`${day} 데스크`, `${day} 대기`])];
          await navigator.clipboard.writeText([header, ...rows].map((row) => row.join("\t")).join("\n"));
          notice("근무표를 복사했어요. 엑셀이나 시트에 붙여넣으세요.");
        }}><Icon name="copy" />표 복사</Action>
        </div>
      </div>
      <ResourceError error={error} retry={onSaved} />
      {!week.saved ? <p className="shift-issue-empty">합의한 근무표를 원본으로 저장하면 이후 근무 변경과 별개로 유지됩니다.</p> : (
      <div className="table-inset">
        <table className="schedule-copy-table">
          <caption className="sr-only">{weekLabel(week.week)} 근무표</caption>
          <thead>
            <tr>
              <th rowSpan={2} scope="col">시간</th>
              {days.map((day, index) => <th key={day} colSpan={2} scope="colgroup">{day} <small>{shortDay(dates[index])}</small></th>)}
            </tr>
            <tr>{columns.map(({ date, role }) => <th key={`${date}/${role}`} scope="col" className={role === "desk" ? "copy-desk" : "copy-standby"}>{role === "desk" ? "데스크" : "대기"}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(([slot, ...cells]) => (
              <tr key={slot}>
                <th scope="row">{slot}</th>
                {cells.map((name, index) => <td key={index} className={index % 2 === 0 ? "copy-desk" : "copy-standby"}>{name}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </section>
  );
}
function originalHours(week: Week, person: number): WeeklyHours {
  const closing = new Map<string, number>();
  for (const shift of week.shifts)
    closing.set(shift.day, Math.max(closing.get(shift.day) ?? 1260, shift.end));
  const shifts = week.shifts.filter((shift) => shift.staff_id === person);
  return {
    staff_id: person,
    total_minutes: shifts.reduce((sum, shift) => sum + shift.end - shift.start, 0),
    desk_minutes: shifts.filter((shift) => shift.role === "desk").reduce((sum, shift) => sum + shift.end - shift.start, 0),
    opens: new Set(shifts.filter((shift) => shift.start === 540).map((shift) => shift.day)).size,
    closes: new Set(shifts.filter((shift) => shift.end === closing.get(shift.day)).map((shift) => shift.day)).size,
  };
}
function Stats({ week, overrides, onEdit }: { week: Week; overrides: WeeklyHours[]; onEdit?: (person: number) => void }) {
  return (
    <div className="table-inset">
      <div className="stats-columns">
        <span>근무자</span>
        <span>총 시간</span>
        <span className="blue">데스크 시간</span>
        <span>오픈</span>
        <span>마감</span>
      </div>
      <div className="stats-rows">
        {week.staff.map((person) => {
          const override = overrides.find((entry) => entry.staff_id === person.id);
          const result = override ?? originalHours(week, person.id);
          return (
            <div className="staff-row" key={person.id}>
              <div className="staff-name">
                {onEdit ? <button type="button" className="text-btn" aria-label={`${person.name} 주당 근무 시간 조정`} onClick={() => onEdit(person.id)}>{person.name}</button> : person.name}
                {override && <small className="hours-adjusted">조정</small>}
              </div>
              <span>
                {result.total_minutes / 60}
                <small>h</small>
              </span>
              <span className="blue">
                {result.desk_minutes / 60}
                <small>h</small>
              </span>
              <span>
                {result.opens}
                <small>회</small>
              </span>
              <span>
                {result.closes}
                <small>회</small>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function WeeklyHoursEditor({ week, person, override, onClose, onSaved }: {
  week: Week;
  person: number;
  override?: WeeklyHours;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const initial = override ?? originalHours(week, person);
  const notice = useNotice();
  return (
    <Modal title={`${week.staff.find((entry) => entry.id === person)?.name ?? "근무자"} · 주당 근무 시간`} onClose={onClose}>
      <Form onClose={onClose} onSave={async (form) => {
        const total = numeric(form, "total") * 60;
        const desk = numeric(form, "desk") * 60;
        if (desk > total) throw new Error("데스크 시간은 총 근무 시간을 초과할 수 없습니다.");
        await api(`/schedule/hours/${person}`, "PUT", { week: week.week, total_minutes: total, desk_minutes: desk, opens: numeric(form, "opens"), closes: numeric(form, "closes") });
        await onSaved();
        onClose();
        notice("주당 근무 시간을 조정했어요.");
      }}>
        <Field label="총 근무 시간 (h)"><input name="total" type="number" required min={0} max={65} step={0.5} defaultValue={initial.total_minutes / 60} /></Field>
        <Field label="데스크 시간 (h)"><input name="desk" type="number" required min={0} max={65} step={0.5} defaultValue={initial.desk_minutes / 60} /></Field>
        <Field label="오픈 (회)"><input name="opens" type="number" required min={0} max={5} step={1} defaultValue={initial.opens} /></Field>
        <Field label="마감 (회)"><input name="closes" type="number" required min={0} max={5} step={1} defaultValue={initial.closes} /></Field>
        {override && <Action run={async () => {
          await api(`/schedule/hours/${person}?week=${week.week}`, "DELETE");
          await onSaved();
          onClose();
          notice("원본 근무표 기준으로 되돌렸어요.");
        }}>원본 기준으로 되돌리기</Action>}
      </Form>
    </Modal>
  );
}
function ShiftEditor({
  week,
  shift,
  issue,
  onClose,
  onSaved,
}: {
  week: Week;
  shift?: Shift;
  issue?: Issue;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const notice = useNotice();
  return (
    <Modal title={issue ? "변경 반영 및 완료" : shift ? "근무 수정" : "근무 추가"} onClose={onClose}>
      <Form
        onClose={onClose}
        submit={issue ? "변경 반영 및 완료" : "저장하기"}
        onSave={async (form) => {
          await api(
            issue ? `/issues/${issue.id}/apply` : shift ? `/shifts/${shift.id}` : "/shifts",
            issue ? "POST" : shift ? "PUT" : "POST",
            {
              staff_id: numeric(form, "staff_id"),
              day: value(form, "day"),
              start: minutes(value(form, "start")),
              end: minutes(value(form, "end")),
              role: value(form, "role"),
            },
          );
          onClose();
          await onSaved();
          notice(issue ? "근무표에 반영하고 요청을 완료했어요." : "근무를 저장했어요.");
        }}
      >
        {issue && (
          <div className="shift-request-summary">
            <strong>{issue.title}</strong>
            {issue.shift_start != null && issue.shift_end != null && (
              <p className="hint">
                요청 당시: {issue.shift_name} · {issue.day} · {time(issue.shift_start)}–{time(issue.shift_end)}
              </p>
            )}
            <p>{issue.body}</p>
          </div>
        )}
        <Field label="날짜">
          <input
            name="day"
            type="date"
            required
            defaultValue={shift?.day ?? week.week}
          />
        </Field>
        <Field label="근무자">
          <select name="staff_id" required defaultValue={shift?.staff_id}>
            {week.staff
              .filter(
                (person) => person.active || person.id === shift?.staff_id,
              )
              .map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                  {!person.active && " (비활성)"}
                </option>
              ))}
          </select>
        </Field>
        <Field label="구분">
          <select name="role" defaultValue={shift?.role ?? "desk"}>
            <option value="desk">데스크</option>
            <option value="general">대기 근무</option>
          </select>
        </Field>
        <Field label="시작 시각">
          <input
            name="start"
            type="time"
            min="09:00"
            max="21:30"
            step={1800}
            required
            defaultValue={time(shift?.start ?? 540)}
          />
        </Field>
        <Field label="종료 시각">
          <input
            name="end"
            type="time"
            min="09:30"
            max="22:00"
            step={1800}
            required
            defaultValue={time(shift?.end ?? 600)}
          />
        </Field>
        {shift && !issue && (
          <Action
            className="btn danger"
            run={async () => {
              if (!confirm("이 근무를 삭제할까요?")) return;
              await api(`/shifts/${shift.id}`, "DELETE");
              onClose();
              await onSaved();
              notice("근무를 삭제했어요.");
            }}
          >
            삭제
          </Action>
        )}
      </Form>
    </Modal>
  );
}
