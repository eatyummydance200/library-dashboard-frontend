import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { api, useResource } from "./api";
import torch from "../static/torch.gif";
import type { ConfirmedShift, ConfirmedTable, OriginalWeek, Shift, User, Week, WeeklyHours } from "./types";
import {
  addDays,
  days,
  koreaParts,
  minutes,
  monday,
  shortDay,
  time,
  weekLabel,
} from "./dates";
import { WeekStepper } from "./Issues";
import { DayStrip, todayIndex } from "./DayStrip";
import "./schedule.css";
import {
  Action,
  AdminMenu,
  Field,
  Form,
  Loading,
  Modal,
  ResourceError,
  numeric,
  useMobile,
  useNotice,
  value,
} from "./ui";

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
// A day's shifts that have no identical confirmed entry (same staff, time and role) are changes.
function changes(shifts: Shift[], confirmed: ConfirmedShift[]) {
  const left = [...confirmed];
  const changed = new Set<number>();
  for (const shift of shifts) {
    const index = left.findIndex((entry) => entry.staff_id === shift.staff_id && entry.start === shift.start && entry.end === shift.end && entry.role === shift.role);
    if (index < 0) changed.add(shift.id);
    else left.splice(index, 1);
  }
  return changed;
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
export default function Schedule({ user }: { user: User }) {
  const [week, setWeek] = useState(monday());
  const data = useResource<Week>(`/schedule?week=${week}`);
  const table = useResource<ConfirmedTable>("/schedule/original");
  const original = { ...table, data: table.data && onWeek(table.data, week) };
  const hours = useResource<{ overrides: WeeklyHours[] }>("/schedule/hours");
  const [editingHours, setEditingHours] = useState<number | null>(null);
  const [clock, setClock] = useState(koreaParts());
  const [person, setPerson] = useState("");
  const [editor, setEditor] = useState<{ shift?: Shift; draft?: Draft } | null>(null);
  const [adjust, setAdjust] = useState<{ id: number; start: number; end: number } | null>(null);
  const [copying, setCopying] = useState(false);
  const [confirmedEditor, setConfirmedEditor] = useState<{ shift?: Shift } | null>(null);
  const [day, setDay] = useState(todayIndex);
  const mobile = useMobile();
  const admin = user.role === "admin";
  const notice = useNotice();
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) {
        setClock(koreaParts());
        void data.refresh();
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
  }, [data.refresh, table.refresh, hours.refresh]);
  const dates = days.map((_, index) => addDays(week, index));
  const savedOriginal = async () => { await Promise.all([table.refresh(), hours.refresh()]); };
  const canSaveFirst = !!data.data?.shifts.length && !data.error && !original.error;
  async function saveFirst() {
    if (!data.data || !confirm("현재 주간 근무표를 최초 확정표로 저장할까요?")) return;
    await api("/schedule/original", "PUT", { shifts: data.data.shifts.map(toConfirmed) });
    await savedOriginal();
    notice("확정된 근무 시간표를 저장했어요.");
  }
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
  // Compare only once the week has shifts; an empty week hasn't been copied from the table yet.
  const comparing = !!table.data?.saved && !!data.data?.shifts.length;
  const todayKey = `${clock.year}-${clock.month}-${clock.day}`;
  const minute = Number(clock.hour) * 60 + Number(clock.minute);
  const slot =
    dates.includes(todayKey) && minute >= 540 && minute < 1320
      ? Math.floor((minute - 540) / 30)
      : -1;
  const now = slot >= 0 ? { slot, minute, clock: `${clock.hour}:${clock.minute}` } : undefined;
  const changedOn = (index: number) => comparing
    ? changes(visibleShifts.filter((shift) => shift.day === dates[index]), table.data!.shifts.filter((entry) => entry.weekday === index + 1))
    : new Set<number>();
  // 화면의 블록은 드래그 중 길이가 바뀐 사본일 수 있어 원본을 찾아 넘긴다.
  const find = (shift: Shift) => data.data!.shifts.find((entry) => entry.id === shift.id)!;
  const editing = admin ? {
    onAdd: (draft: Draft) => setEditor({ draft }),
    onEdit: (shift: Shift) => setEditor({ shift: find(shift) }),
    onResize: (event: ReactPointerEvent<HTMLSpanElement>, shift: Shift, edge: "start" | "end") => startResize(event, find(shift), edge),
  } : {};
  return (
    <section className="view schedule-workspace" aria-label={mobile ? "시간표" : "주간 시간표"}>
      {mobile ? (
        <>
          <DayStrip week={week} day={day} onWeek={setWeek} onDay={setDay} label="시간표 요일 선택" />
          {data.data ? (
            <div className="card schedule-card">
              <ResourceError error={data.error} retry={data.refresh} />
              <div className="legend day-legend">
                <span className="desk-legend"><i />데스크</span>
                <span className="standby-legend"><i />대기</span>
                <span className="changed-legend"><i />변동</span>
              </div>
              <div className="schedule-table">
                <div className="week-board day-board" style={{ "--slot-count": 26 } as CSSProperties} aria-label={`${shortDay(dates[day])} ${days[day]}요일 30분 단위 근무 시간표`}>
                  <TimeAxis slot={dates[day] === todayKey ? slot : -1} />
                  <DayTrack
                    date={dates[day]}
                    shifts={visibleShifts.filter((shift) => shift.day === dates[day])}
                    staff={data.data.staff}
                    changed={changedOn(day)}
                    mine={user.staff_id}
                    today={dates[day] === todayKey}
                    now={dates[day] === todayKey ? now : undefined}
                    {...editing}
                  />
                </div>
              </div>
            </div>
          ) : (
            <section className="card"><Loading error={data.error} retry={data.refresh} /></section>
          )}
        </>
      ) : (
      <div className="card schedule-card">
          <div className="board-head">
            <WeekStepper
              label={weekLabel(week)}
              current={week === monday()}
              onMove={(offset) => setWeek(addDays(week, offset * 7))}
              onToday={() => setWeek(monday())}
            />
            <div className="legend">
              <span className="desk-legend"><i />데스크</span>
              <span className="standby-legend"><i />대기</span>
              <span className="changed-legend"><i />변동</span>
            </div>
            <select
              className="select small"
              aria-label="시간표 근무자 선택"
              value={person}
              onChange={(event) => setPerson(event.target.value)}
            >
              <option value="">모든 근무자</option>
              {data.data?.staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}만 강조
                </option>
              ))}
            </select>
          </div>
          {data.data ? (
            <>
              <ResourceError error={data.error} retry={data.refresh} />
              <div className="table-inset schedule-table">
                <div
                  className="week-board"
                  style={{ "--slot-count": 26 } as CSSProperties}
                  aria-label="30분 단위 주간 근무 시간표"
                >
                  <TimeAxis slot={slot} />
                  {dates.map((date, index) => (
                    <DayTrack
                      key={date}
                      date={date}
                      shifts={visibleShifts.filter((shift) => shift.day === date)}
                      staff={data.data!.staff}
                      changed={changedOn(index)}
                      dim={person}
                      today={date === todayKey}
                      now={date === todayKey ? now : undefined}
                      {...editing}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <Loading error={data.error} retry={data.refresh} />
          )}
      </div>
      )}
      <div className="schedule-row">
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
          ) : original.data ? <p className="shift-issue-empty">확정된 근무 시간표를 먼저 저장해 주세요.</p> : <Loading error={original.error} retry={original.refresh} />}
        </section>
        {original.data ? (
          <ConfirmedSchedule
            week={original.data}
            mobile={mobile}
            admin={admin}
            error={original.error}
            onSaved={savedOriginal}
            onEdit={(shift) => setConfirmedEditor({ shift })}
            actions={mobile && admin && (
              <div className="schedule-actions">
                <button type="button" className="btn small" disabled={!!original.error} onClick={() => setConfirmedEditor({})}>확정 근무 추가</button>
                {original.data.saved
                  ? <button type="button" className="btn small" disabled={!data.data} onClick={() => setCopying(true)}>이번 주에 붙여넣기</button>
                  : <Action className="btn small" disabled={!canSaveFirst} run={saveFirst}>현재 주간표로 최초 확정</Action>}
              </div>
            )}
          />
        ) : (
          <section className="card">
            <div className="card-head"><h2>확정된 근무 시간표</h2></div>
            <Loading error={original.error} retry={original.refresh} />
          </section>
        )}
      </div>
      {admin && !mobile && (
        <AdminMenu>
          <button type="button" disabled={!data.data} onClick={() => setEditor({})}>근무 추가</button>
          <button type="button" disabled={!data.data} onClick={() => setCopying(true)}>확정표 가져오기</button>
          <hr />
          <button type="button" disabled={!original.data || !!original.error} onClick={() => setConfirmedEditor({})}>확정 근무 추가</button>
          {original.data && !original.data.saved && (
            <Action disabled={!canSaveFirst} run={saveFirst}>현재 주간표로 최초 확정</Action>
          )}
          <p className="menu-hint">빈 칸을 누르면 근무 추가, 근무를 누르면 수정, 위·아래 끝을 끌면 길이를 바꿔요.</p>
        </AdminMenu>
      )}
      {confirmedEditor && original.data && (
        <ShiftEditor key={`${week}/${confirmedEditor.shift?.id ?? "new"}`} week={original.data} shift={confirmedEditor.shift} confirmed onClose={() => setConfirmedEditor(null)} onSaved={savedOriginal} />
      )}
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
      {editor && data.data && (
        <ShiftEditor
          key={editor.shift?.id ?? "new"}
          week={data.data}
          shift={editor.shift}
          draft={editor.draft}
          onClose={() => setEditor(null)}
          onSaved={data.refresh}
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
              await data.refresh();
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
    </section>
  );
}
function TimeAxis({ slot }: { slot: number }) {
  return (
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
  );
}
// 하루 한 열의 근무 블록. 웹 주간표는 다섯 번, 모바일 하루 보기·확정표 요일 보기는 한 번 그린다.
// onAdd/onEdit/onResize가 있으면 빈 칸 탭 추가, 블록 탭 편집, 위·아래 끝 드래그 조정을 켠다.
function DayTrack({ date, shifts, staff, changed, dim = "", mine, today = false, now, editLabel = "근무 수정", onAdd, onEdit, onResize }: {
  date: string;
  shifts: Shift[];
  staff: Week["staff"];
  changed: Set<number>;
  dim?: string;
  mine?: number | null;
  today?: boolean;
  now?: { slot: number; minute: number; clock: string };
  editLabel?: string;
  onAdd?: (draft: Draft) => void;
  onEdit?: (shift: Shift) => void;
  onResize?: (event: ReactPointerEvent<HTMLSpanElement>, shift: Shift, edge: "start" | "end") => void;
}) {
  const weekday = weekdayOf(date) - 1;
  const placed = layout(shifts);
  return (
    <section className={`day-track ${today ? "today-col" : ""}`} aria-label={`${date} ${days[weekday]}요일`}>
      <h3 className="day-heading">
        {days[weekday]}
        <span>
          {shortDay(date)}
          {today && " · 오늘"}
        </span>
      </h3>
      <div
        className={`track-grid ${onAdd ? "can-add" : ""}`}
        style={{ "--lanes": placed.lanes } as CSSProperties}
        title={onAdd ? "빈 곳을 눌러 근무 추가" : undefined}
        onClick={onAdd ? (event) => {
          if ((event.target as HTMLElement).closest(".worker")) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const start = Math.min(1290, 540 + Math.floor(((event.clientY - rect.top) / rect.height) * 26) * 30);
          onAdd({ day: date, start, end: Math.min(1320, start + 60) });
        } : undefined}
      >
        {placed.entries.map((shift) => {
          const name = staff.find((person) => person.id === shift.staff_id)?.name ?? "근무자";
          const span = (shift.end - shift.start) / 30;
          const isMine = mine != null && mine === shift.staff_id;
          const label = `${name}${isMine ? "(나)" : ""} · ${time(shift.start)}–${time(shift.end)} · ${shift.role === "desk" ? "데스크" : "대기"}`;
          const position = { gridRow: `${(shift.start - 540) / 30 + 1}/span ${span}`, gridColumn: shift.lane + 1 };
          const differs = changed.has(shift.id) ? " · 변동사항" : "";
          return (
            <button
              key={shift.id}
              type="button"
              data-shift-id={shift.id}
              className={`worker ${shift.role === "desk" ? "desk" : "standby"} ${span === 1 ? "short-shift" : ""} ${dim && dim !== String(shift.staff_id) ? "dimmed" : ""} ${differs ? "changed" : ""} ${isMine ? "mine" : ""}`}
              style={position}
              title={`${label}${differs}`}
              aria-label={`${label}${differs}${onEdit ? ` · ${editLabel}` : ""}`}
              onClick={onEdit && (() => onEdit(shift))}
            >
              <strong>{name}</strong>
              {span > 1 && <small className="worker-time">{time(shift.start)}–{time(shift.end)}</small>}
              {onResize && (["start", "end"] as const).map((edge) => (
                <span
                  key={edge}
                  className={`resize-handle ${edge}`}
                  aria-hidden="true"
                  onPointerDown={(event) => onResize(event, shift, edge)}
                  onClick={(event) => event.stopPropagation()}
                />
              ))}
            </button>
          );
        })}
        {!placed.entries.length && <span className="empty-day">이 날은 근무가 없어요</span>}
        {now && (
          <>
            <div className="current-band" style={{ top: `${(now.slot / 26) * 100}%` }} />
            <span className="now-line" style={{ top: `${((now.minute - 540) / 780) * 100}%` }}>
              <img src={torch} alt="" />
              <span>현재 {now.clock}</span>
            </span>
          </>
        )}
      </div>
    </section>
  );
}
// 모바일: 확정표를 요일 하나씩, 하루 한 열 블록으로 본다.
function ConfirmedDay({ week, admin, error, onEdit }: { week: OriginalWeek; admin: boolean; error?: string; onEdit: (shift: Shift) => void }) {
  const [weekday, setWeekday] = useState(todayIndex);
  const date = addDays(week.week, weekday);
  return (
    <>
      <div className="day-picker" role="group" aria-label="확정표 요일 선택">
        {days.map((name, index) => {
          const count = week.shifts.filter((shift) => shift.day === addDays(week.week, index)).length;
          return (
            <button key={name} type="button" aria-pressed={weekday === index} aria-label={`${name}요일 · 확정 근무 ${count}개`} onClick={() => setWeekday(index)}>
              {name}
              <small>{count}개</small>
            </button>
          );
        })}
      </div>
      <div className="schedule-table">
        <div className="week-board day-board" style={{ "--slot-count": 26 } as CSSProperties} aria-label={`${days[weekday]}요일 확정 근무 시간표`}>
          <TimeAxis slot={-1} />
          <DayTrack
            date={date}
            shifts={week.shifts.filter((shift) => shift.day === date)}
            staff={week.staff}
            changed={new Set()}
            editLabel="확정 근무 수정"
            onEdit={admin && !error ? onEdit : undefined}
          />
        </div>
      </div>
    </>
  );
}
function ConfirmedSchedule({ week, mobile, admin, error, actions, onSaved, onEdit }: { week: OriginalWeek; mobile: boolean; admin: boolean; error?: string; actions?: ReactNode; onSaved: () => Promise<void>; onEdit: (shift: Shift) => void }) {
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
    <section className="card schedule-copy-card">
      <div className="card-head">
        <h2>확정된 근무 시간표</h2>
        <span className="fold-hint">매주 기본이 되는 표예요</span>
      </div>
      {actions}
      <ResourceError error={error} retry={onSaved} />
      {!week.saved ? <p className="shift-issue-empty">{admin ? `${mobile ? "위 버튼으로" : "관리 메뉴에서"} 확정 근무를 추가하거나 현재 주간표를 최초 확정표로 저장해 주세요.` : "아직 확정표가 없어요."}</p> : mobile ? (
        <ConfirmedDay week={week} admin={admin} error={error} onEdit={onEdit} />
      ) : (
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
                        <button key={shift.id} className={`confirmed-entry ${shift.role === "desk" ? "copy-desk" : "copy-standby"}`} style={{ top, height }} disabled={!!error} title={`${name} · ${time(shift.start)}–${time(shift.end)}`} aria-label={`${days[Math.floor(index / lanes)]} ${name} · ${time(shift.start)}–${time(shift.end)} · ${shift.role === "desk" ? "데스크" : "대기"} · 확정 근무 수정`} onClick={() => onEdit(shift)}>{name}</button>
                      ) : <span key={shift.id} className={`confirmed-entry ${shift.role === "desk" ? "copy-desk" : "copy-standby"}`} style={{ top, height }} title={`${name} · ${time(shift.start)}–${time(shift.end)}`}>{name}</span>)}
                    </div>
                  </td>)}
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
    <ul className="stat-list">
      {week.staff.map((person) => {
        const override = overrides.find((entry) => entry.staff_id === person.id);
        const result = override ?? originalHours(week, person.id);
        const metrics: [string, number, string][] = [
          ["총", result.total_minutes / 60, "h"],
          ["데스크", result.desk_minutes / 60, "h"],
          ["오픈", result.opens, "회"],
          ["마감", result.closes, "회"],
        ];
        const body = (
          <>
            <span className="stat-name">
              {person.name}
              {override && <small className="hours-adjusted">조정됨</small>}
            </span>
            <span className="stat-metrics">
              {metrics.map(([label, amount, unit]) => (
                <span key={label} className={label === "데스크" ? "blue" : undefined}>
                  <small className="stat-label">{label}</small>
                  <b>{amount}<small>{unit}</small></b>
                </span>
              ))}
            </span>
          </>
        );
        return (
          <li key={person.id} className="stat-item">
            {onEdit ? (
              <button type="button" className="stat-edit" aria-label={`${person.name} 주당 근무 시간 조정`} onClick={() => onEdit(person.id)}>{body}</button>
            ) : body}
          </li>
        );
      })}
    </ul>
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
  draft,
  confirmed = false,
  onClose,
  onSaved,
}: {
  week: Week;
  shift?: Shift;
  draft?: Draft;
  confirmed?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const notice = useNotice();
  return (
    <Modal title={confirmed ? (shift ? "확정 근무 수정" : "확정 근무 추가") : shift ? "근무 수정" : "근무 추가"} onClose={onClose}>
      <Form
        onClose={onClose}
        submit="저장하기"
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
            await api(shift ? `/shifts/${shift.id}` : "/shifts", shift ? "PUT" : "POST", { ...entry, day });
          }
          onClose();
          await onSaved();
          notice("근무를 저장했어요.");
        }}
      >
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
        {shift && (
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
