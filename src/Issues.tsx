import { useEffect, useState } from "react";
import { api, message, useResource } from "./api";
import type { Issue, User } from "./types";
import { addDays, dateTime, days, koreaParts, monday, shortDay, today, weekLabel } from "./dates";
import { DayStrip, todayIndex } from "./DayStrip";
import "./screens.css";
import {
  Action,
  Field,
  Fold,
  Form,
  Icon,
  Loading,
  Menu,
  Modal,
  ResourceError,
  useMobile,
  useNotice,
  value,
} from "./ui";

type IssuesResource = ReturnType<typeof useResource<Issue[]>>;
const filters = [
  ["all", "전체"],
  ["open", "진행 중"],
  ["done", "완료"],
] as const;
// 데이터(주간 이슈·필터·추가 창)는 여기 하나. 웹은 5요일 보드, 모바일은 DayStrip + 하루 리스트
export default function Issues({ resource, user }: { resource: IssuesResource; user: User }) {
  const mobile = useMobile();
  const [week, setWeek] = useState(monday());
  const weekly = useResource<Issue[]>(`/issues?week=${week}`);
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState<string | null>(null);
  const [day, setDay] = useState(todayIndex);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) void weekly.refresh();
    };
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [weekly.refresh]);
  const dates = days.map((_, index) => addDays(week, index));
  const list = (date: string, empty: string) => (
    <IssueList
      resource={{ ...weekly, error: undefined, data: weekly.data!.filter((issue) => covers(issue, date)) }}
      filter={filter}
      user={user}
      onChanged={resource.refresh}
      empty={empty}
    />
  );
  const segment = (
    <div className="segment" role="group" aria-label="이슈 상태 필터">
      {filters.map(([key, label]) => (
        <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
          {label}
        </button>
      ))}
    </div>
  );
  return (
    <section className="view issues-view" aria-label="이슈">
      {mobile ? (
        <>
          <DayStrip
            week={week}
            day={day}
            onWeek={setWeek}
            onDay={setDay}
            label="이슈 요일 선택"
            counts={dates.map((date) => weekly.data?.filter((issue) => covers(issue, date) && !issue.done).length ?? 0)}
          />
          <section className="card list-card" aria-label={`${shortDay(dates[day])} ${days[day]}요일 이슈`}>
            {weekly.data ? (
              <>
                <ResourceError error={weekly.error} retry={weekly.refresh} />
                {list(dates[day], filter === "all" ? "이 날은 남겨진 이슈가 없어요." : "해당하는 이슈가 없어요.")}
              </>
            ) : <Loading error={weekly.error} retry={weekly.refresh} />}
          </section>
          <Fold title={`보기 옵션 · ${filters.find(([key]) => key === filter)![1]}`}>{segment}</Fold>
          {user.role !== "viewer" && (
            <button type="button" className="btn primary fab" onClick={() => setAdding(dates[day])}>
              <Icon name="plus" />
              새 이슈
            </button>
          )}
        </>
      ) : (
        <>
          <div className="view-toolbar">
            <WeekStepper
              label={weekLabel(week)}
              current={week === monday()}
              onMove={(offset) => setWeek(addDays(week, offset * 7))}
              onToday={() => setWeek(monday())}
              unit="주 이슈"
            />
            {segment}
          </div>
          {weekly.data ? (
            <>
              <ResourceError error={weekly.error} retry={weekly.refresh} />
              <div className="issue-week-board">
                {days.map((label, index) => {
                  const date = dates[index];
                  return (
                    <section key={date} className={`issue-day-column${date === today() ? " is-today" : ""}`} aria-label={`${date} ${label}요일 이슈`}>
                      <header className="issue-day-heading">
                        <h3>{label}요일</h3>
                        <time dateTime={date}>{shortDay(date)}{date === today() && " · 오늘"}</time>
                        {user.role !== "viewer" && <button type="button" className="issue-day-add" aria-label={`${shortDay(date)} ${label}요일 이슈 추가`} onClick={() => setAdding(date)}>＋</button>}
                      </header>
                      {list(date, "이 날은 남겨진 이슈가 없어요.")}
                    </section>
                  );
                })}
              </div>
            </>
          ) : <Loading error={weekly.error} retry={weekly.refresh} />}
        </>
      )}
      {adding && (
        <IssueEditor
          day={adding}
          onClose={() => setAdding(null)}
          onSaved={async () => {
            await Promise.all([weekly.refresh(), resource.refresh()]);
          }}
        />
      )}
    </section>
  );
}
// 기간(양끝 포함) 안에 date가 들어가는지. YYYY-MM-DD라 문자열 비교로 충분하다
export function covers(issue: Issue, date: string) {
  return issue.day <= date && date <= issue.end_day;
}
// ‹ 11월 1째주 › + (다른 주를 보고 있으면) "이번 주로" 버튼. 시간표·이슈가 함께 쓴다.
export function WeekStepper({ label, current, onMove, onToday, unit = "주", todayLabel = "이번 주" }: {
  label: string;
  current: boolean;
  onMove: (offset: number) => void;
  onToday: () => void;
  unit?: string;
  todayLabel?: string;
}) {
  return (
    <div className="week-controls">
      <button type="button" className="icon-btn" aria-label={`이전 ${unit}`} onClick={() => onMove(-1)}>
        <Icon name="left" />
      </button>
      <strong className={current ? "current-week" : undefined} aria-live="polite">{label}</strong>
      <button type="button" className="icon-btn" aria-label={`다음 ${unit}`} onClick={() => onMove(1)}>
        <Icon name="chevron" />
      </button>
      {!current && <button type="button" className="text-btn today-jump" onClick={onToday}>{todayLabel}</button>}
    </div>
  );
}
export function TodayIssues({ resource, user, onChanged }: {
  resource: IssuesResource;
  user: User;
  onChanged: () => Promise<void>;
}) {
  return (
    <div className="today-issues">
      <IssueList resource={resource} user={user} filter="all" onChanged={onChanged} empty="오늘 등록된 이슈가 없습니다. 조용한 하루예요!" />
    </div>
  );
}
export function IssueList({
  resource,
  filter,
  onChanged,
  user,
  empty = "해당하는 이슈가 없습니다.",
}: {
  resource: IssuesResource;
  filter: string;
  onChanged?: () => Promise<void>;
  user: User;
  empty?: string;
}) {
  if (!resource.data)
    return <Loading error={resource.error} retry={resource.refresh} />;
  // 진행 중 먼저, 완료는 아래로. sort는 안정 정렬이라 같은 상태끼리는 서버 순서를 유지한다.
  const visible = resource.data
    .filter((issue) => filter === "all" || (filter === "done") === !!issue.done)
    .sort((a, b) => a.done - b.done);
  return (
    <>
      <ResourceError error={resource.error} retry={resource.refresh} />
      <div className="issue-list">
        {visible.map((issue) => (
          <IssueItem
            key={issue.id}
            issue={issue}
            user={user}
            onChanged={async () => {
              await resource.refresh();
              await onChanged?.();
            }}
          />
        ))}
        {!visible.length && (
          <p className="shift-issue-empty">{empty}</p>
        )}
      </div>
    </>
  );
}
function IssueItem({
  issue,
  user,
  onChanged,
}: {
  issue: Issue;
  user: User;
  onChanged: () => Promise<void>;
}) {
  const notice = useNotice();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const viewer = user.role === "viewer";
  const editable = !viewer && !issue.done && (user.role === "admin" || user.id === issue.author_id);
  const deletable = !viewer && (user.role === "admin" || (!issue.done && user.id === issue.author_id));
  return (
    <article className={`issue-item${issue.done ? " is-done" : ""}`}>
      <label className="issue-check-hit">
      <input
        type="checkbox"
        className="issue-check"
        checked={!!issue.done}
        disabled={busy || viewer}
        aria-label={issue.done ? `${issue.title} 다시 열기` : `${issue.title} 완료`}
        onChange={async () => {
          setBusy(true);
          try {
            await api(`/issues/${issue.id}`, "PATCH", { done: !issue.done });
            await onChanged();
          } catch (error) {
            notice(message(error));
          } finally {
            setBusy(false);
          }
        }}
      />
      </label>
      <div className="issue-main">
        <h3 className="issue-heading">
          <span className="issue-title-category">{issue.category}</span>{" "}
          <span className="issue-title">{issue.title}</span>
          {issue.end_day !== issue.day && <span className="issue-period">{shortDay(issue.day)}~{shortDay(issue.end_day)}</span>}
          {issue.created_at && <time className="issue-time" dateTime={issue.created_at}>{createdLabel(issue)}</time>}
        </h3>
        <p className="issue-text">{issue.body}</p>
      </div>
      {(editable || deletable) && (
        <IssueMenu
          onEdit={editable ? () => setEditing(true) : undefined}
          onDelete={deletable ? async () => {
            if (!confirm("이 이슈를 삭제할까요? 삭제하면 되돌릴 수 없어요.")) return;
            await api(`/issues/${issue.id}`, "DELETE");
            await onChanged();
          } : undefined}
        />
      )}
      {editing && <IssueEditor issue={issue} onClose={() => setEditing(false)} onSaved={onChanged} />}
    </article>
  );
}
// 작성 시각. 이슈 날짜와 같은 날 작성했으면 "14:32", 다른 날이면 "11. 3. 14:32"
function createdLabel(issue: Issue) {
  const p = koreaParts(new Date(issue.created_at));
  return `${p.year}-${p.month}-${p.day}` === issue.day ? `${p.hour}:${p.minute}` : dateTime(issue.created_at);
}
function IssueMenu({ onEdit, onDelete }: { onEdit?: () => void; onDelete?: () => Promise<void> }) {
  return (
    <Menu className="issue-menu" label="이슈 메뉴" summary="⋯">
      {onEdit && <button type="button" onClick={onEdit}>수정</button>}
      {onDelete && <Action className="danger" run={onDelete}>삭제</Action>}
    </Menu>
  );
}
export function IssueEditor({
  onClose,
  onSaved,
  day = today(),
  category: initialCategory = "인계",
  issue,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
  day?: string;
  category?: string;
  issue?: Issue;
}) {
  const notice = useNotice();
  const [category, setCategory] = useState(issue?.category ?? initialCategory);
  const [selectedDay, setSelectedDay] = useState(issue?.day ?? day);
  const [endDay, setEndDay] = useState(issue?.end_day ?? issue?.day ?? day);
  return (
    <Modal title={issue ? "이슈 수정" : "새 이슈 남기기"} onClose={onClose}>
      <Form
        onClose={onClose}
        submit={issue ? "저장하기" : "등록하기"}
        onSave={async (data) => {
          const body = Object.fromEntries(["day", "end_day", "category", "title", "body"].map((key) => [key, value(data, key)]));
          await (issue ? api(`/issues/${issue.id}`, "PUT", body) : api("/issues", "POST", body));
          onClose();
          await onSaved();
          notice(issue ? "이슈를 수정했어요." : "이슈를 등록했어요.");
        }}
      >
        <Field label="시작일">
          <input name="day" type="date" required value={selectedDay} onChange={(event) => {
            const start = event.target.value;
            setSelectedDay(start);
            if (start && endDay < start) setEndDay(start);
          }} />
        </Field>
        <Field label="종료일">
          <input name="end_day" type="date" required min={selectedDay} value={endDay} onChange={(event) => setEndDay(event.target.value)} />
        </Field>
        <fieldset className="field choice-chips">
          <legend>구분</legend>
          <div>
            {["인계", "공지", "시설"].map((option) => (
              <label key={option}>
                <input type="radio" name="category" value={option} checked={category === option} onChange={() => setCategory(option)} />
                {option}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="제목">
          <input name="title" required maxLength={80} placeholder="한 줄로 요약해 주세요" defaultValue={issue?.title} />
        </Field>
        <Field label="내용">
          <textarea name="body" required maxLength={1500} placeholder="다음 근무자가 알아야 할 내용을 적어 주세요" defaultValue={issue?.body} />
        </Field>
      </Form>
    </Modal>
  );
}
