import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { api, useResource } from "./api";
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
import { todayIndex } from "./DayStrip";
import { WeekStepper } from "./Issues";
import { Badge, Card, ListHeader, ListRow, PageTop, Segmented, Tabs } from "./tds";
import "./schedule.css";
import {
  Action,
  Icon,
  Menu,
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
type Editing = {
  editLabel?: string;
  onAdd?: (draft: Draft) => void;
  onEdit?: (shift: Shift) => void;
  onResize?: (event: ReactPointerEvent<HTMLSpanElement>, shift: Shift, edge: "start" | "end") => void;
  onMove?: (event: ReactPointerEvent<HTMLButtonElement>, shift: Shift) => void;
};
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
const roleName = (shift: Shift) => (shift.role === "desk" ? "데스크" : "대기");
const NONE = new Set<number>();
export default function Schedule({ user }: { user: User }) {
  const [week, setWeek] = useState(monday());
  const data = useResource<Week>(`/schedule?week=${week}`);
  const table = useResource<ConfirmedTable>("/schedule/original");
  const original = { ...table, data: table.data && onWeek(table.data, week) };
  const hours = useResource<{ overrides: WeeklyHours[] }>("/schedule/hours");
  const [clock, setClock] = useState(koreaParts());
  const [picked, setPicked] = useState<number[]>([]); // 강조할 근무자(비어 있으면 모두)
  const [editor, setEditor] = useState<{ shift?: Shift; draft?: Draft } | null>(null);
  const [adjust, setAdjust] = useState<{ id: number; day: string; start: number; end: number } | null>(null);
  const dragged = useRef(false); // 블록을 끌어 옮긴 직후의 클릭(수정 창·근무 추가)을 막는다
  const [copying, setCopying] = useState(false);
  const [confirmedEditor, setConfirmedEditor] = useState<{ shift?: Shift; draft?: Draft } | null>(null);
  const [view, setView] = useState<"week" | "confirmed">("week");
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
    if (!data.data || !confirm("지금 보는 주간표를 확정표로 저장할까요?")) return;
    await api("/schedule/original", "PUT", { shifts: data.data.shifts.map(toConfirmed) });
    await savedOriginal();
    notice("확정된 근무 시간표를 저장했어요.");
  }
  const visibleShifts = data.data?.shifts.map((shift) => shift.id === adjust?.id ? { ...shift, day: adjust.day, start: adjust.start, end: adjust.end } : shift) ?? [];
  // Drag a handle to resize a shift. Bounds are checked here so an invalid length can't be produced;
  // the server still validates on save. The new length shows immediately and reverts if saving fails.
  function startResize(event: ReactPointerEvent<HTMLSpanElement>, shift: Shift, edge: "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const grid = handle.closest(".sch-track")!.getBoundingClientRect();
    const others = data.data!.shifts.filter((other) => other.id !== shift.id && other.staff_id === shift.staff_id && other.day === shift.day);
    const min = edge === "start" ? Math.max(540, ...others.filter((other) => other.end <= shift.start).map((other) => other.end)) : shift.start + 30;
    const max = edge === "start" ? shift.end - 30 : Math.min(1320, ...others.filter((other) => other.start >= shift.end).map((other) => other.start));
    let next = { id: shift.id, day: shift.day, start: shift.start, end: shift.end };
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
        notice(error instanceof Error ? error.message : "근무를 저장하지 못했어요.");
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
  const now = dates.includes(todayKey) && minute >= 540 && minute < 1320 ? { minute, clock: `${clock.hour}:${clock.minute}` } : undefined;
  const changedOn = (index: number) => comparing
    ? changes(visibleShifts.filter((shift) => shift.day === dates[index]), table.data!.shifts.filter((entry) => entry.weekday === index + 1))
    : NONE;
  // 블록 몸통을 끌어 다른 시각·요일로 옮긴다(30분 단위, 길이는 그대로). 마우스·펜만: 터치는 스크롤과 겹쳐서 뺐다.
  // 블록이 다른 요일 칸으로 넘어가면 DOM 요소가 새로 만들어지므로 이동 이벤트는 window에서 받는다.
  function startMove(event: ReactPointerEvent<HTMLButtonElement>, shift: Shift) {
    if (event.button !== 0 || event.pointerType === "touch" || (event.target as HTMLElement).closest(".sch-handle")) return;
    const tracks = [...document.querySelectorAll(".sch-board .sch-track")].map((track) => track.getBoundingClientRect());
    const slot = tracks[0].height / 26;
    const from = { x: event.clientX, y: event.clientY };
    const length = shift.end - shift.start;
    let next = { id: shift.id, day: shift.day, start: shift.start, end: shift.end };
    let moving = false;
    const move = (moved: PointerEvent) => {
      if (!moving && Math.hypot(moved.clientX - from.x, moved.clientY - from.y) < 6) return;
      moving = dragged.current = true;
      const start = Math.min(1320 - length, Math.max(540, shift.start + Math.round((moved.clientY - from.y) / slot) * 30));
      const index = tracks.findIndex((rect) => moved.clientX >= rect.left && moved.clientX <= rect.right);
      next = { id: shift.id, day: index < 0 ? next.day : dates[index], start, end: start + length };
      setAdjust(next);
    };
    const finish = async (save: boolean) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      setTimeout(() => { dragged.current = false; });
      if (!moving) return;
      if (!save || (next.day === shift.day && next.start === shift.start)) return setAdjust(null);
      if (overlaps(data.data!.shifts, { staff_id: shift.staff_id, day: next.day, start: next.start, end: next.end }, shift.id)) {
        notice("같은 사람의 근무와 겹쳐서 옮길 수 없어요.");
        return setAdjust(null);
      }
      try {
        await api(`/shifts/${shift.id}`, "PUT", { staff_id: shift.staff_id, day: next.day, start: next.start, end: next.end, role: shift.role });
        await data.refresh();
        notice(`근무를 ${days[dates.indexOf(next.day)]}요일 ${time(next.start)}–${time(next.end)}로 옮겼어요.`);
      } catch (error) {
        notice(error instanceof Error ? error.message : "근무를 저장하지 못했어요.");
      } finally {
        setAdjust(null);
      }
    };
    const up = () => void finish(true);
    const cancel = () => void finish(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  }
  // 화면의 블록은 드래그 중 길이가 바뀐 사본일 수 있어 원본을 찾아 넘긴다.
  const find = (shift: Shift) => data.data!.shifts.find((entry) => entry.id === shift.id)!;
  const confirmedView = view === "confirmed";
  const editing: Editing = !admin ? {} : confirmedView ? (original.error ? {} : {
    editLabel: "확정 근무 수정",
    onAdd: (draft) => setConfirmedEditor({ draft }),
    onEdit: (shift) => setConfirmedEditor({ shift }),
  }) : {
    onAdd: (draft) => { if (!dragged.current) setEditor({ draft }); },
    onEdit: (shift) => { if (!dragged.current) setEditor({ shift: find(shift) }); },
    onResize: (event, shift, edge) => startResize(event, find(shift), edge),
    onMove: (event, shift) => startMove(event, find(shift)),
  };
  // 지금 보는 표: 주간표 또는 이 주 날짜에 얹은 확정표
  const source = confirmedView ? original : data;
  const shifts = confirmedView ? original.data?.shifts ?? [] : visibleShifts;
  const staff = source.data?.staff ?? [];
  // 추가·수정·이동으로 달라진 블록을 잠깐 강조한다. 같은 표(보기·주)의 직전 모습과 비교하므로 주를 넘길 때는 반응하지 않는다.
  const saved = confirmedView ? original.data?.shifts : data.data?.shifts;
  const savedKey = confirmedView ? `confirmed/${week}` : `week/${data.data?.week}`;
  const seen = useRef({ key: "", map: new Map<number, string>() });
  const [flash, setFlash] = useState<number[]>([]);
  useEffect(() => {
    if (!saved) return;
    const map = new Map(saved.map((shift) => [shift.id, `${shift.day}/${shift.start}/${shift.end}/${shift.role}/${shift.staff_id}`]));
    const before = seen.current;
    seen.current = { key: savedKey, map };
    if (before.key !== savedKey) return;
    const ids = [...map].filter(([id, value]) => before.map.get(id) !== value).map(([id]) => id);
    if (!ids.length) return;
    setFlash(ids);
    const timer = setTimeout(() => setFlash([]), 700);
    return () => clearTimeout(timer);
  }, [table.data, data.data, savedKey]);
  const pickedNames = staff.filter((entry) => picked.includes(entry.id)).map((entry) => entry.name);
  const pickedLabel = !pickedNames.length ? "모든 근무자" : pickedNames.length === 1 ? pickedNames[0] : `${pickedNames[0]} 외 ${pickedNames.length - 1}명`;
  const unsaved = confirmedView && original.data && !original.data.saved && (
    <p className="sch-empty-note">
      {admin ? "관리 메뉴에서 확정표에 근무를 추가하거나 이 주간표를 확정표로 저장해 주세요." : "아직 확정표가 없어요."}
    </p>
  );
  const range = `${shortDay(week)} ~ ${shortDay(addDays(week, 4))}`;
  const actions = (
    <>
      <Segmented
        label="시간표 보기"
        items={[{ key: "week", label: "이번 주" }, { key: "confirmed", label: "확정표" }] as const}
        value={view}
        onChange={setView}
      />
      {admin && (
        <AdminMenu>
          <button type="button" disabled={!data.data} onClick={() => setEditor({})}>주간표에 근무 추가</button>
          <button type="button" disabled={!data.data} onClick={() => setCopying(true)}>확정표대로 채우기</button>
          <hr />
          <button type="button" disabled={!original.data || !!original.error} onClick={() => setConfirmedEditor({})}>확정표에 근무 추가</button>
          {original.data && !original.data.saved && (
            <Action disabled={!canSaveFirst} run={saveFirst}>이 주간표를 확정표로 저장</Action>
          )}
          {mobile && <p className="menu-hint">빈 칸을 누르면 근무 추가, 근무를 누르면 수정이에요.{confirmedView ? "" : " 위·아래 끝을 끌면 길이를 바꿔요."}</p>}
        </AdminMenu>
      )}
    </>
  );
  const date = dates[day];
  const dayShifts = shifts.filter((shift) => shift.day === date).sort((a, b) => a.start - b.start || a.id - b.id);
  const dayChanged = confirmedView ? NONE : changedOn(day);
  const mobileBody = (
    <>
      <Tabs
        fluid
        label={confirmedView ? "확정표 요일 선택" : "시간표 요일 선택"}
        value={String(day)}
        onChange={(key) => setDay(Number(key))}
        items={dates.map((entry, index) => ({
          key: String(index),
          label: confirmedView ? days[index] : `${days[index]} ${Number(entry.slice(8))}`,
          aria: confirmedView ? `${days[index]}요일` : `${shortDay(entry)} ${days[index]}요일${entry === todayKey ? " · 오늘" : ""}`,
        }))}
      />
      <div className="sch-day-panel" role="tabpanel" aria-label={confirmedView ? `${days[day]}요일 확정 근무` : `${shortDay(date)} ${days[day]}요일 근무`}>
        <div className="sch-legend">
          <Badge color="blue">데스크</Badge>
          <Badge color="yellow">대기</Badge>
          {!confirmedView && <Badge color="red">확정표와 다름</Badge>}
        </div>
        {source.data ? (
          <>
            <ResourceError error={source.error} retry={source.refresh} />
            {unsaved || (
              <div className="sch-board is-single" style={{ "--slots": 26 } as CSSProperties} aria-label={confirmedView ? "30분 단위 확정 근무 시간표" : "30분 단위 하루 근무 시간표"}>
                <TimeAxis />
                <DayTrack
                  key={date}
                  date={date}
                  shifts={dayShifts}
                  staff={staff}
                  changed={dayChanged}
                  flash={flash}
                  dragging={adjust?.id}
                  template={confirmedView}
                  today={!confirmedView && date === todayKey}
                  now={!confirmedView && date === todayKey ? now : undefined}
                  {...editing}
                />
              </div>
            )}
          </>
        ) : (
          <Loading error={source.error} retry={source.refresh} />
        )}
      </div>
    </>
  );
  const desktopBody = (
    <Card className="sch-card" label={confirmedView ? "확정된 근무 시간표" : "주간 근무 시간표"}>
      <div className="sch-head">
        {confirmedView ? (
          <strong className="sch-title">확정표</strong>
        ) : (
          <div className="sch-week">
            <button type="button" className="sch-nav" aria-label="이전 주" onClick={() => setWeek(addDays(week, -7))}><Icon name="left" /></button>
            <strong className="sch-title" aria-live="polite">{weekLabel(week)}</strong>
            <span className="sch-range">{range}</span>
            <button type="button" className="sch-nav" aria-label="다음 주" onClick={() => setWeek(addDays(week, 7))}><Icon name="chevron" /></button>
            {week !== monday() && <button type="button" className="text-btn sch-today" onClick={() => setWeek(monday())}>이번 주로</button>}
          </div>
        )}
        <div className="sch-legend">
          <Badge color="blue">데스크</Badge>
          <Badge color="yellow">대기</Badge>
          {!confirmedView && <Badge color="red">확정표와 다름</Badge>}
        </div>
        <Menu
          className="admin-menu sch-person"
          label="강조할 근무자 선택 (여러 명)"
          summary={<>{pickedLabel}<Icon name="chevron" /></>}
        >
          {staff.map((entry) => (
            <label key={entry.id} className="check-row">
              <span>{entry.name}</span>
              <input
                type="checkbox"
                className="tds-check"
                checked={picked.includes(entry.id)}
                onChange={() => setPicked(picked.includes(entry.id) ? picked.filter((id) => id !== entry.id) : [...picked, entry.id])}
              />
            </label>
          ))}
          {!!picked.length && <><hr /><button type="button" onClick={() => setPicked([])}>모두 보기</button></>}
        </Menu>
      </div>
      {source.data ? (
        <>
          <ResourceError error={source.error} retry={source.refresh} />
          {unsaved || (
            <div className="sch-scroll">
              <div className="sch-board" style={{ "--slots": 26 } as CSSProperties} aria-label={confirmedView ? "30분 단위 확정 근무 시간표" : "30분 단위 주간 근무 시간표"}>
                <TimeAxis />
                {dates.map((entry, index) => (
                  <DayTrack
                    key={entry}
                    date={entry}
                    shifts={shifts.filter((shift) => shift.day === entry)}
                    staff={staff}
                    changed={confirmedView ? NONE : changedOn(index)}
                    dim={picked}
                    flash={flash}
                    dragging={adjust?.id}
                    template={confirmedView}
                    today={!confirmedView && entry === todayKey}
                    now={!confirmedView && entry === todayKey ? now : undefined}
                    {...editing}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <Loading error={source.error} retry={source.refresh} />
      )}
    </Card>
  );
  return (
    <section className="view schedule-workspace" aria-label={mobile ? "시간표" : "주간 시간표"}>
      <PageTop
        upper={mobile && (confirmedView ? "매주 기본이 되는 표예요" : (
          <WeekStepper
            label={`${weekLabel(week)} · ${range}`}
            current={week === monday()}
            onMove={(offset) => setWeek(addDays(week, offset * 7))}
            onToday={() => {
              setWeek(monday());
              setDay(todayIndex());
            }}
          />
        ))}
        title="시간표"
        lower={!mobile && (confirmedView ? (admin ? "매주 기본이 되는 표예요. 빈 칸을 눌러 추가하고 근무를 눌러 고칠 수 있지만, 이번 주 표처럼 끌어서 옮기거나 길이를 바꿀 수는 없어요." : "매주 기본이 되는 표예요") : admin ? "빈 칸을 누르면 근무 추가, 근무를 누르면 수정, 위·아래 끝을 끌면 길이, 블록을 끌면 자리를 바꿔요." : undefined)}
        actions={actions}
      />
      {mobile ? mobileBody : desktopBody}
      <Card className="sch-card" labelledBy="sch-hours-title">
        <ListHeader id="sch-hours-title" title="이번 주 근무 시간" />
        {original.data?.saved ? (
          hours.data ? <>
            <ResourceError error={original.error} retry={original.refresh} />
            <ResourceError error={hours.error} retry={hours.refresh} />
            <Stats week={original.data} overrides={hours.data.overrides} />
          </> : <Loading error={hours.error} retry={hours.refresh} />
        ) : original.data ? <p className="sch-empty-note">확정된 근무 시간표를 먼저 저장해 주세요.</p> : <Loading error={original.error} retry={original.refresh} />}
      </Card>
      {confirmedEditor && original.data && (
        <ShiftEditor key={`${week}/${confirmedEditor.shift?.id ?? "new"}`} week={original.data} shift={confirmedEditor.shift} draft={confirmedEditor.draft} confirmed onClose={() => setConfirmedEditor(null)} onSaved={savedOriginal} />
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
                if (!confirm(`대상 주에 근무 ${result.existing}개가 있어요. 모두 지우고 확정표로 덮어쓸까요?`)) return;
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
            <p className="hint">확정표의 요일과 시간을 대상 주에 복사해요. 대상 주에 근무가 있으면 덮어쓸지 물어봐요. 퇴직한 근무자의 근무는 빼고 복사해요.</p>
          </Form>
        </Modal>
      )}
    </section>
  );
}
// 왼쪽 시각 눈금 (정시만). 블록마다 시각이 적혀 있어 스크린리더에는 숨긴다.
function TimeAxis() {
  return (
    <div className="sch-axis" aria-hidden="true">
      <div className="sch-day-head" />
      <div className="sch-axis-ticks">
        {Array.from({ length: 14 }, (_, index) => (
          <span key={index} style={{ top: `${(index / 13) * 100}%` }}>{time(540 + index * 60)}</span>
        ))}
      </div>
    </div>
  );
}
// 하루 한 열의 근무 블록 (데스크톱 주간표·확정표). template이면 날짜 없이 요일만 쓴다.
// onAdd/onEdit/onResize가 있으면 빈 칸 클릭 추가, 블록 클릭 편집, 위·아래 끝 드래그 조정을 켠다.
function DayTrack({ date, shifts, staff, changed, dim = [], flash = [], dragging, template = false, today = false, now, editLabel = "근무 수정", onAdd, onEdit, onResize, onMove }: Editing & {
  date: string;
  shifts: Shift[];
  staff: Week["staff"];
  changed: Set<number>;
  dim?: number[];
  flash?: number[];
  dragging?: number;
  template?: boolean;
  today?: boolean;
  now?: { minute: number; clock: string };
}) {
  const weekday = weekdayOf(date) - 1;
  const placed = layout(shifts);
  return (
    <section className={`sch-day${today ? " is-today" : ""}`} aria-label={template ? `${days[weekday]}요일` : `${date} ${days[weekday]}요일${today ? " · 오늘" : ""}`}>
      <h3 className="sch-day-head">
        <small>{days[weekday]}</small>
        {!template && <span className="sch-date">{Number(date.slice(8))}</span>}
      </h3>
      <div
        className={`sch-track${onAdd ? " can-add" : ""}`}
        style={{ "--lanes": placed.lanes } as CSSProperties}
        title={onAdd ? "빈 곳을 눌러 근무 추가" : undefined}
        onClick={onAdd ? (event) => {
          if ((event.target as HTMLElement).closest(".sch-block")) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const start = Math.min(1290, 540 + Math.floor(((event.clientY - rect.top) / rect.height) * 26) * 30);
          onAdd({ day: date, start, end: Math.min(1320, start + 60) });
        } : undefined}
      >
        {placed.entries.map((shift) => {
          const name = staff.find((person) => person.id === shift.staff_id)?.name ?? "근무자";
          const span = (shift.end - shift.start) / 30;
          const label = `${name} · ${time(shift.start)}–${time(shift.end)} · ${roleName(shift)}${changed.has(shift.id) ? " · 확정표와 다름" : ""}`;
          return (
            <button
              key={shift.id}
              type="button"
              data-shift-id={shift.id}
              className={`sch-block ${shift.role === "desk" ? "is-desk" : "is-standby"}${span === 1 ? " is-short" : ""}${dim.length && !dim.includes(shift.staff_id) ? " is-dim" : ""}${changed.has(shift.id) ? " is-changed" : ""}${onEdit ? " is-editable" : ""}${onMove ? " is-movable" : ""}${flash.includes(shift.id) ? " is-flash" : ""}${dragging === shift.id ? " is-dragging" : ""}`}
              style={{ gridRow: `${(shift.start - 540) / 30 + 1}/span ${span}`, gridColumn: shift.lane + 1 }}
              title={label}
              aria-label={`${label}${onEdit ? ` · ${editLabel}` : ""}`}
              onClick={onEdit && (() => onEdit(shift))}
              onPointerDown={onMove && ((event) => onMove(event, shift))}
            >
              <strong>{name}</strong>
              {span > 1 && <small>{time(shift.start)}–{time(shift.end)}</small>}
              {onResize && (["start", "end"] as const).map((edge) => (
                <span
                  key={edge}
                  className={`sch-handle ${edge}`}
                  aria-hidden="true"
                  onPointerDown={(event) => onResize(event, shift, edge)}
                  onClick={(event) => event.stopPropagation()}
                />
              ))}
            </button>
          );
        })}
        {!placed.entries.length && <span className="sch-empty">근무가 없어요</span>}
        {now && (
          <span className="sch-now" style={{ top: `${((now.minute - 540) / 780) * 100}%` }}>
            <span className="sr-only">현재 {now.clock}</span>
          </span>
        )}
      </div>
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
const hoursText = (value: number) => `${Math.round((value / 60) * 10) / 10}시간`;
// 근무자별 주당 시간. 예전에 저장한 조정값이 있으면 확정표 계산 대신 그 값을 보여준다(화면에서 고칠 수는 없다).
function Stats({ week, overrides }: { week: Week; overrides: WeeklyHours[] }) {
  return (
    <>
      {week.staff.map((person) => {
        const override = overrides.find((entry) => entry.staff_id === person.id);
        const result = override ?? originalHours(week, person.id);
        const sub = `데스크 ${hoursText(result.desk_minutes)} · 대기 ${hoursText(result.total_minutes - result.desk_minutes)} · 오픈 ${result.opens}회 · 마감 ${result.closes}회`;
        return (
          <ListRow
            key={person.id}
            title={<>{person.name}{override && <span className="sch-adjusted"><Badge color="grey">조정됨</Badge></span>}</>}
            sub={sub}
            right={<b className="sch-total">{hoursText(result.total_minutes)}</b>}
          />
        );
      })}
    </>
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
          if (entry.end <= entry.start) throw new Error("종료 시각은 시작 시각보다 늦어야 해요.");
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
            <select name="weekday" defaultValue={weekdayOf(shift?.day ?? draft?.day ?? week.week)}>
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
