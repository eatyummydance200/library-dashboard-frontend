import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { api, useResource } from "./api";
import type { ConfirmedTable, Issue, OriginalWeek, Shift, User, Week, WeeklyHours } from "./types";
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
  Loading,
  Modal,
  ResourceError,
  numeric,
  useNotice,
  value,
} from "./ui";
import { IssueList } from "./Issues";
import ShiftIssueEditor from "./ShiftIssueEditor";

function weekdayOf(day: string) {
  return ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
}
// The confirmed table is one weekday template; render it on the dates of the week being viewed.
function onWeek(table: ConfirmedTable, week: string): OriginalWeek {
  return { week, saved: table.saved, staff: table.staff, shifts: table.shifts.map(({ weekday, ...shift }) => ({ ...shift, day: addDays(week, weekday - 1) })) };
}
function toConfirmed({ staff_id, day, start, end, role }: Shift) {
  return { staff_id, weekday: weekdayOf(day), start, end, role };
}
type Draft = Pick<Shift, "day" | "start" | "end">;
function overlaps(shifts: Shift[], entry: Omit<Shift, "id" | "role">, exclude?: number) {
  return shifts.some((other) => other.id !== exclude && other.staff_id === entry.staff_id &&
    other.day === entry.day && other.start < entry.end && other.end > entry.start);
}
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
  const table = useResource<ConfirmedTable>("/schedule/original");
  const original = { ...table, data: table.data && onWeek(table.data, week) };
  const hours = useResource<{ overrides: WeeklyHours[] }>("/schedule/hours");
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
  const [editor, setEditor] = useState<{ shift?: Shift; issue?: Issue; draft?: Draft } | null>(null);
  const [adjust, setAdjust] = useState<{ id: number; start: number; end: number } | null>(null);
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
        void table.refresh();
        void hours.refresh();
      }
    };
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [data.refresh, issues.refresh, table.refresh, hours.refresh]);
  const dates = days.map((_, index) => addDays(week, index));
  const visibleShifts = data.data?.shifts.map((shift) => shift.id === adjust?.id ? { ...shift, start: adjust.start, end: adjust.end } : shift) ?? [];
  // Drag a handle to resize a shift. Bounds are checked here so an invalid length can't be produced;
  // the server still validates on save. The new length shows immediately and reverts if saving fails.
  function startResize(event: ReactPointerEvent<HTMLSpanElement>, shift: Shift, edge: "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const grid = handle.closest(".track-grid")!.getBoundingClientRect();
    const others = data.data!.shifts.filter((other) => other.id !== shift.id && other.staff_id === shift.staff_id && other.day === shift.day);
    const min = edge === "start" ? Math.max(540, ...others.filter((other) => other.end <= shift.start).map((other) => other.end)) : shift.start + 30;
    const max = edge === "start" ? shift.end - 30 : Math.min(1320, ...others.filter((other) => other.start >= shift.end).map((other) => other.start));
    let next = { id: shift.id, start: shift.start, end: shift.end };
    handle.setPointerCapture(event.pointerId);
    const move = (moved: PointerEvent) => {
      const minute = 540 + Math.round(((moved.clientY - grid.top) / grid.height) * 26) * 30;
      next = { ...next, [edge]: Math.min(max, Math.max(min, minute)) };
      setAdjust(next);
    };
    const finish = async (save: boolean) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", cancel);
      if (!save || (next.start === shift.start && next.end === shift.end)) {
        setAdjust(null);
        return;
      }
      try {
        await api(`/shifts/${shift.id}`, "PUT", { staff_id: shift.staff_id, day: shift.day, start: next.start, end: next.end, role: shift.role });
        await data.refresh();
        notice(`근무 시간을 ${time(next.start)}–${time(next.end)}로 바꿨어요.`);
      } catch (error) {
        notice(error instanceof Error ? error.message : "근무를 저장하지 못했습니다.");
      } finally {
        setAdjust(null);
      }
    };
    const up = () => void finish(true);
    const cancel = () => void finish(false);
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", cancel);
  }
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
                    확정표에서 가져오기
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
                      visibleShifts.filter((shift) => shift.day === date),
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
                          className={`track-grid ${admin ? "can-add" : ""}`}
                          style={{ "--lanes": placed.lanes } as CSSProperties}
                          title={admin ? "빈 곳을 눌러 근무 추가" : undefined}
                          onClick={admin ? (event) => {
                            if ((event.target as HTMLElement).closest(".worker")) return;
                            const rect = event.currentTarget.getBoundingClientRect();
                            const start = Math.min(1290, 540 + Math.floor(((event.clientY - rect.top) / rect.height) * 26) * 30);
                            setEditor({ draft: { day: date, start, end: Math.min(1320, start + 60) } });
                          } : undefined}
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
                                {admin && (["start", "end"] as const).map((edge) => (
                                  <span
                                    key={edge}
                                    className={`resize-handle ${edge}`}
                                    aria-hidden="true"
                                    onPointerDown={(event) => startResize(event, data.data!.shifts.find((entry) => entry.id === shift.id)!, edge)}
                                    onClick={(event) => event.stopPropagation()}
                                  />
                                ))}
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
        {original.data ? <ConfirmedSchedule key={week} week={original.data} current={data.error ? undefined : data.data} admin={admin} error={original.error} onSaved={async () => { await Promise.all([original.refresh(), hours.refresh()]); }} /> : (
          <section className="card">
            <div className="card-head"><h2>확정된 근무 시간표</h2></div>
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
          ) : original.data ? <p className="shift-issue-empty">확정된 근무 시간표를 먼저 저장해주세요.</p> : <Loading error={original.error} retry={original.refresh} />}
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
          draft={editor.draft}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            await Promise.all([data.refresh(), refreshIssues()]);
          }}
        />
      )}
      {copying && (
        <Modal title="확정표를 주간 근무 시간표에 붙여넣기" onClose={() => setCopying(false)}>
          <Form
            submit="주간표에 붙여넣기"
            onClose={() => setCopying(false)}
            onSave={async (form) => {
              type CopyResult = { ok: boolean; existing?: number; count?: number; skipped?: number };
              const target = value(form, "target");
              let result = await api<CopyResult>("/schedule/original/copy", "POST", { target });
              if (!result.ok) {
                if (!confirm(`대상 주에 근무 ${result.existing}개가 있습니다. 모두 지우고 확정표로 덮어쓸까요?`)) return;
                result = await api<CopyResult>("/schedule/original/copy", "POST", { target, overwrite: true });
              }
              setCopying(false);
              await Promise.all([data.refresh(), onIssuesChange()]);
              notice(`${result.count}개 확정 근무를 주간표에 붙여넣었어요.${result.skipped ? ` 퇴직한 근무자의 근무 ${result.skipped}개는 제외했어요.` : ""}`);
            }}
          >
            <Field label="붙여넣을 주에 속한 날짜">
              <input name="target" type="date" required defaultValue={week} />
            </Field>
            <p className="hint">확정표의 요일과 시간을 대상 주에 복사합니다. 대상 주에 근무가 있으면 덮어쓸지 묻습니다. 퇴직한 근무자의 근무는 제외합니다.</p>
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
function ConfirmedSchedule({ week, current, admin, error, onSaved }: { week: OriginalWeek; current?: Week; admin: boolean; error?: string; onSaved: () => Promise<void> }) {
  const notice = useNotice();
  const [editor, setEditor] = useState<{ shift?: Shift } | null>(null);
  const dates = days.map((_, index) => addDays(week.week, index));
  const lanes = 4;
  const rows = Array.from({ length: 13 }, (_, index) => {
    const start = 540 + index * 60;
    return { start, cells: dates.flatMap((date) => {
      const entries = week.shifts.filter((shift) => shift.day === date && shift.start < start + 60 && shift.end > start)
        .sort((a, b) => a.start - b.start || a.id - b.id);
      const desk = entries.filter((shift) => shift.role === "desk");
      const standby = entries.filter((shift) => shift.role === "general");
      return Array.from({ length: lanes }, (_, lane) => (lane === 0 ? desk : standby.slice(lane - 1, lane)).map((shift) => ({
        shift,
        name: week.staff.find((person) => person.id === shift.staff_id)?.name ?? "근무자",
        top: shift.start > start ? "50%" : "0%",
        height: shift.start <= start && shift.end >= start + 60 ? "100%" : "50%",
      })));
    }) };
  });
  return (
    <section className="card schedule-copy-card" aria-label="확정된 근무 시간표">
      <div className="card-head">
        <h2>확정된 근무 시간표</h2>
        <div className="issue-card-actions">
          {admin && <>
            <button className="btn" disabled={!!error} onClick={() => setEditor({})}>추가</button>
            {!week.saved && <Action disabled={!current?.shifts.length || !!error} run={async () => {
              if (!current || !confirm("현재 주간 근무표를 최초 확정표로 저장할까요?")) return;
              await api("/schedule/original", "PUT", { shifts: current.shifts.map(toConfirmed) });
              await onSaved();
              notice("확정된 근무 시간표를 저장했어요.");
            }}>현재 주간표로 최초 확정</Action>}
          </>}
        </div>
      </div>
      <ResourceError error={error} retry={onSaved} />
      {!week.saved ? <p className="shift-issue-empty">근무를 직접 추가하거나 현재 주간표를 최초 확정표로 저장해주세요.</p> : (
        <div className="table-inset">
          <table className="schedule-copy-table confirmed-schedule-table">
            <caption className="sr-only">확정된 근무 시간표</caption>
            <thead>
              <tr>
                <th scope="col">시간</th>
                {days.map((day) => <th key={day} colSpan={lanes} scope="colgroup" className="confirmed-day-start">{day}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ start, cells }) => (
                <tr key={start}>
                  <th scope="row">{start / 60}–{start / 60 + 1}</th>
                  {cells.map((entries, index) => <td key={index} className={index % lanes === 0 ? "confirmed-day-start" : undefined}>
                    <div className="confirmed-hour">
                      {entries.map(({ shift, name, top, height }) => admin ? (
                        <button key={shift.id} className={`confirmed-entry ${shift.role === "desk" ? "copy-desk" : "copy-standby"}`} style={{ top, height }} disabled={!!error} title={`${name} · ${time(shift.start)}–${time(shift.end)}`} aria-label={`${days[Math.floor(index / lanes)]} ${name} · ${time(shift.start)}–${time(shift.end)} · ${shift.role === "desk" ? "데스크" : "대기"} · 확정 근무 수정`} onClick={() => setEditor({ shift })}>{name}</button>
                      ) : <span key={shift.id} className={`confirmed-entry ${shift.role === "desk" ? "copy-desk" : "copy-standby"}`} style={{ top, height }} title={`${name} · ${time(shift.start)}–${time(shift.end)}`}>{name}</span>)}
                    </div>
                  </td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editor && <ShiftEditor key={`${week.week}/${editor.shift?.id ?? "new"}`} week={week} shift={editor.shift} confirmed onClose={() => setEditor(null)} onSaved={onSaved} />}
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
        await api(`/schedule/hours/${person}`, "PUT", { total_minutes: total, desk_minutes: desk, opens: numeric(form, "opens"), closes: numeric(form, "closes") });
        await onSaved();
        onClose();
        notice("주당 근무 시간을 조정했어요.");
      }}>
        <Field label="총 근무 시간 (h)"><input name="total" type="number" required min={0} max={65} step={0.5} defaultValue={initial.total_minutes / 60} /></Field>
        <Field label="데스크 시간 (h)"><input name="desk" type="number" required min={0} max={65} step={0.5} defaultValue={initial.desk_minutes / 60} /></Field>
        <Field label="오픈 (회)"><input name="opens" type="number" required min={0} max={5} step={1} defaultValue={initial.opens} /></Field>
        <Field label="마감 (회)"><input name="closes" type="number" required min={0} max={5} step={1} defaultValue={initial.closes} /></Field>
        {override && <Action run={async () => {
          await api(`/schedule/hours/${person}`, "DELETE");
          await onSaved();
          onClose();
          notice("확정표 기준으로 되돌렸어요.");
        }}>확정표 기준으로 되돌리기</Action>}
      </Form>
    </Modal>
  );
}
// 오전/오후 + 시 + 00·30분 선택. 오전은 9~11시, 오후는 0~10시만 고를 수 있다.
function TimeSelect({ name, label, initial, min, max }: { name: string; label: string; initial: number; min: number; max: number }) {
  const [minute, setMinute] = useState(initial);
  const set = (next: number) => setMinute(Math.min(max, Math.max(min, next)));
  const hour = Math.floor(minute / 60);
  const half = minute % 60;
  const pm = hour >= 12;
  const hours = pm ? Array.from({ length: 11 }, (_, index) => 12 + index) : [9, 10, 11];
  return (
    <div className="field" role="group" aria-label={label}>
      {label}
      <input type="hidden" name={name} value={time(minute)} />
      <div className="time-select">
        <select aria-label={`${label} 오전/오후`} value={pm ? "pm" : "am"} onChange={(event) =>
          set(event.target.value === "pm" ? Math.min(22, hour + 12) * 60 + half : Math.max(9, hour - 12) * 60 + half)}>
          <option value="am">오전</option>
          <option value="pm">오후</option>
        </select>
        <select aria-label={`${label} 시`} value={hour} onChange={(event) => set(Number(event.target.value) * 60 + half)}>
          {hours.map((value) => <option key={value} value={value}>{pm ? value - 12 : value}시</option>)}
        </select>
        <select aria-label={`${label} 분`} value={half} onChange={(event) => set(hour * 60 + Number(event.target.value))}>
          <option value={0}>00분</option>
          <option value={30} disabled={hour * 60 + 30 > max}>30분</option>
        </select>
      </div>
    </div>
  );
}
function ShiftEditor({
  week,
  shift,
  issue,
  draft,
  confirmed = false,
  onClose,
  onSaved,
}: {
  week: Week;
  shift?: Shift;
  issue?: Issue;
  draft?: Draft;
  confirmed?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const notice = useNotice();
  return (
    <Modal title={confirmed ? (shift ? "확정 근무 수정" : "확정 근무 추가") : issue ? "변경 반영 및 완료" : shift ? "근무 수정" : "근무 추가"} onClose={onClose}>
      <Form
        onClose={onClose}
        submit={issue ? "변경 반영 및 완료" : "저장하기"}
        onSave={async (form) => {
          const entry = {
            staff_id: numeric(form, "staff_id"),
            start: minutes(value(form, "start")),
            end: minutes(value(form, "end")),
            role: value(form, "role"),
          };
          const day = confirmed ? addDays(week.week, numeric(form, "weekday") - 1) : value(form, "day");
          if (entry.end <= entry.start) throw new Error("종료 시각은 시작 시각보다 늦어야 합니다.");
          if (overlaps(week.shifts, { ...entry, day }, shift?.id)) throw new Error("같은 사람의 근무 시간이 겹칩니다.");
          if (confirmed) {
            await api("/schedule/original", "PUT", { shifts: [...week.shifts.filter((item) => item.id !== shift?.id).map(toConfirmed), { ...entry, weekday: numeric(form, "weekday") }] });
          } else {
            await api(issue ? `/issues/${issue.id}/apply` : shift ? `/shifts/${shift.id}` : "/shifts", issue || !shift ? "POST" : "PUT", { ...entry, day });
          }
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
        {confirmed ? (
          <Field label="요일">
            <select name="weekday" defaultValue={shift ? weekdayOf(shift.day) : 1}>
              {days.map((day, index) => <option key={day} value={index + 1}>{day}요일</option>)}
            </select>
          </Field>
        ) : (
          <Field label="날짜">
            <input name="day" type="date" required defaultValue={shift?.day ?? draft?.day ?? week.week} />
          </Field>
        )}
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
        <TimeSelect name="start" label="시작 시각" initial={shift?.start ?? draft?.start ?? 540} min={540} max={1290} />
        <TimeSelect name="end" label="종료 시각" initial={shift?.end ?? draft?.end ?? 600} min={570} max={1320} />
        {shift && !issue && (
          <Action
            className="btn danger"
            run={async () => {
              if (!confirm("이 근무를 삭제할까요?")) return;
              if (confirmed) {
                await api("/schedule/original", "PUT", { shifts: week.shifts.filter((entry) => entry.id !== shift.id).map(toConfirmed) });
              } else {
                await api(`/shifts/${shift.id}`, "DELETE");
              }
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
