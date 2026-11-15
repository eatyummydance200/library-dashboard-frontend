import { useEffect, useState } from "react";
import { api, message, useResource } from "./api";
import type { Issue, User } from "./types";
import { addDays, days, koreaParts, monday, shortDay, today, weekLabel } from "./dates";
import { todayIndex } from "./DayStrip";
import { PageTop, Tabs } from "./tds";
import "./screens.css";
import {
  Action,
  Field,
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
// 구분별 아이콘·설명 (목록 행과 이슈 남기기 창이 함께 쓴다)
const categories = [
  { key: "인계", icon: "swap", desc: "다음 근무자에게 넘길 일" },
  { key: "공지", icon: "megaphone", desc: "모두가 알아야 할 소식" },
  { key: "분실물", icon: "search", desc: "주인을 찾고 있는 물건" },
] as const;
// "시설"은 예전 구분. 새로 고를 수는 없고 기존 이슈에만 남아 있다.
const categoryIcon = (category: string) => categories.find((item) => item.key === category)?.icon ?? (category === "시설" ? "gear" : "message");
// 데이터(주간 이슈·필터·추가 창)는 여기 하나. 웹은 5요일 카드, 모바일은 요일 탭 + 하루 목록
export default function Issues({ resource, user }: { resource: IssuesResource; user: User }) {
  const mobile = useMobile();
  const [week, setWeek] = useState(monday());
  const weekly = useResource<Issue[]>(`/issues?week=${week}`);
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
  const now = today();
  // 주간 이슈 = 여러 날에 걸친 이슈. 위에 따로 모으고, 요일별 목록에는 하루짜리만 둔다.
  const spans = weekly.data?.filter((issue) => issue.day !== issue.end_day) ?? [];
  const of = (date: string) => weekly.data?.filter((issue) => issue.day === date && issue.end_day === date) ?? [];
  const list = (data: Issue[], empty: string, icons: boolean) => (
    <IssueList
      resource={{ ...weekly, error: undefined, data }}
      user={user}
      onChanged={resource.refresh}
      empty={empty}
      icons={icons}
    />
  );
  const stepper = (
    <WeekStepper
      label={mobile ? `${weekLabel(week)} · ${shortDay(week)} ~ ${shortDay(dates[4])}` : weekLabel(week)}
      current={week === monday()}
      onMove={(offset) => setWeek(addDays(week, offset * 7))}
      onToday={() => {
        setWeek(monday());
        setDay(todayIndex());
      }}
      unit="주 이슈"
    />
  );
  const canAdd = user.role !== "viewer";
  const left = weekly.data?.filter((issue) => !issue.done).length ?? 0;
  const thisWeek = week === monday() ? "이번 주" : "이 주";
  return (
    <section className="view issues-view" aria-label="이슈">
      {mobile ? (
        <>
          <PageTop
            upper={stepper}
            title="이슈"
            actions={canAdd && (
              <button type="button" className="btn small" onClick={() => setAdding(dates[day])}>
                남기기
              </button>
            )}
          />
          <h2 className="issue-group">주간 이슈</h2>
          {weekly.data && list(spans, "여러 날에 걸친 이슈가 없어요.", true)}
          <h2 className="issue-group">일간 이슈</h2>
          <Tabs
            fluid
            label="이슈 요일 선택"
            value={String(day)}
            onChange={(key) => setDay(Number(key))}
            items={dates.map((date, index) => ({
              key: String(index),
              label: `${days[index]} ${Number(date.slice(8))}`,
              aria: `${shortDay(date)} ${days[index]}요일${date === now ? " · 오늘" : ""}`,
            }))}
          />
          {weekly.data ? (
            <div className="issues-day" role="tabpanel" aria-label={`${shortDay(dates[day])} ${days[day]}요일 이슈`}>
              <ResourceError error={weekly.error} retry={weekly.refresh} />
              {list(of(dates[day]), "이 날은 남겨진 이슈가 없어요.", true)}
            </div>
          ) : <Loading error={weekly.error} retry={weekly.refresh} />}
        </>
      ) : (
        <>
          <PageTop
            title="이슈"
            lower={weekly.data && (left ? `${thisWeek}에 ${left}건이 남아 있어요` : `${thisWeek} 이슈를 모두 마쳤어요`)}
            actions={
              <>
                {stepper}
                {canAdd && (
                  <button type="button" className="btn primary" onClick={() => setAdding(dates.includes(now) ? now : week)}>
                    이슈 남기기
                  </button>
                )}
              </>
            }
          />
          {weekly.data ? (
            <>
              <ResourceError error={weekly.error} retry={weekly.refresh} />
              <section className="tds-card issue-day" aria-label="주간 이슈">
                <header className="issue-day-head">
                  <h2>주간 이슈</h2>
                </header>
                {list(spans, "여러 날에 걸친 이슈가 없어요.", false)}
              </section>
              <div className="issue-week">
                {days.map((label, index) => {
                  const date = dates[index];
                  return (
                    <section key={date} className={`tds-card issue-day${date === now ? " is-today" : ""}`} aria-label={`${date} ${label}요일 이슈`}>
                      <header className="issue-day-head">
                        <h2>{label} {shortDay(date)}</h2>
                        {date === now && <span>오늘</span>}
                      </header>
                      {list(of(date), "이슈가 없어요.", false)}
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
      <IssueList resource={resource} user={user} onChanged={onChanged} empty="오늘 등록된 이슈가 없어요. 조용한 하루예요!" />
    </div>
  );
}
export function IssueList({
  resource,
  onChanged,
  user,
  empty = "해당하는 이슈가 없어요.",
  icons = true,
}: {
  resource: IssuesResource;
  onChanged?: () => Promise<void>;
  user: User;
  empty?: string;
  icons?: boolean;
}) {
  if (!resource.data)
    return <Loading error={resource.error} retry={resource.refresh} />;
  // 진행 중 먼저, 완료는 아래로. sort는 안정 정렬이라 같은 상태끼리는 서버 순서를 유지한다.
  const visible = resource.data
    .slice()
    .sort((a, b) => a.done - b.done);
  return (
    <>
      <ResourceError error={resource.error} retry={resource.refresh} />
      <div className="issue-rows">
        {visible.map((issue) => (
          <IssueItem
            key={issue.id}
            issue={issue}
            user={user}
            icon={icons}
            onChanged={async () => {
              await resource.refresh();
              await onChanged?.();
            }}
          />
        ))}
        {!visible.length && <p className="issue-empty">{empty}</p>}
      </div>
    </>
  );
}
// TDS List Row 모양: 구분 아이콘 · 제목/구분·시각 · ⋯ 메뉴 · 원형 체크. 행을 누르면 내용을 펼친다.
function IssueItem({
  issue,
  user,
  icon,
  onChanged,
}: {
  issue: Issue;
  user: User;
  icon: boolean;
  onChanged: () => Promise<void>;
}) {
  const notice = useNotice();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const viewer = user.role === "viewer";
  const editable = !viewer && !issue.done && (user.role === "admin" || user.id === issue.author_id);
  const deletable = !viewer && (user.role === "admin" || (!issue.done && user.id === issue.author_id));
  return (
    <article className={`issue-row${issue.done ? " is-done" : ""}`}>
      <button type="button" className="issue-row-main" aria-expanded={open} onClick={() => setOpen(!open)}>
        {icon && (
          <span className="list-row-icon" aria-hidden="true">
            <Icon name={categoryIcon(issue.category)} />
          </span>
        )}
        <span className="list-row-text">
          <span className="list-row-title issue-title">{issue.title}</span>
          <span className="list-row-sub">
            {issue.category} ·{" "}
            {issue.end_day !== issue.day ? (
              `${shortDay(issue.day)} ~ ${shortDay(issue.end_day)}`
            ) : issue.created_at ? (
              <time dateTime={issue.created_at}>{createdLabel(issue.created_at)}</time>
            ) : shortDay(issue.day)}
          </span>
          <span className="issue-body" hidden={!open}>{issue.body}</span>
        </span>
      </button>
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
      <label className="issue-check">
        <input
          type="checkbox"
          className="tds-check"
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
      {editing && <IssueEditor issue={issue} onClose={() => setEditing(false)} onSaved={onChanged} />}
    </article>
  );
}
// 작성 시각(한국 시간). 오늘이면 "오늘 14:32", 아니면 "11.3 14:32"
function createdLabel(value: string) {
  const p = koreaParts(new Date(value));
  const day = `${p.year}-${p.month}-${p.day}`;
  return `${day === today() ? "오늘" : shortDay(day)} ${p.hour}:${p.minute}`;
}
function IssueMenu({ onEdit, onDelete }: { onEdit?: () => void; onDelete?: () => Promise<void> }) {
  return (
    <Menu className="issue-menu" label="이슈 메뉴" summary="⋯">
      {onEdit && <button type="button" onClick={onEdit}>수정</button>}
      {onDelete && <Action className="danger" run={onDelete}>삭제</Action>}
    </Menu>
  );
}
const longDay = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일`;
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
  const [period, setPeriod] = useState(false);
  return (
    <Modal className="issue-editor" title={issue ? "이슈를 어떻게 고칠까요?" : "어떤 이슈를 남길까요?"} onClose={onClose}>
      <Form
        onClose={onClose}
        submit={issue ? "저장하기" : `${category} 이슈 남기기`}
        onSave={async (data) => {
          const body = Object.fromEntries(["day", "end_day", "category", "title", "body"].map((key) => [key, value(data, key)]));
          await (issue ? api(`/issues/${issue.id}`, "PUT", body) : api("/issues", "POST", body));
          onClose();
          await onSaved();
          notice(issue ? "이슈를 수정했어요." : "이슈를 등록했어요.");
        }}
      >
        <fieldset className="issue-kinds">
          <legend className="sr-only">구분</legend>
          {(issue?.category === "시설" ? [...categories, { key: "시설", icon: "gear", desc: "예전 구분" } as const] : categories).map((option) => (
            <label key={option.key} className="issue-kind">
              <span className="list-row-icon" aria-hidden="true">
                <Icon name={option.icon} />
              </span>
              <span className="list-row-text">
                <span className="list-row-title">{option.key}</span>
                <span className="list-row-sub">{option.desc}</span>
              </span>
              <input
                type="radio"
                className="tds-check"
                name="category"
                value={option.key}
                checked={category === option.key}
                onChange={() => setCategory(option.key)}
              />
            </label>
          ))}
        </fieldset>
        <Field label="제목">
          <input name="title" required maxLength={80} placeholder="예) 3층 열람석 분실물 보관 중" defaultValue={issue?.title} />
        </Field>
        <Field label="내용">
          <textarea name="body" required maxLength={1500} placeholder="다음 근무자가 알아야 할 내용을 적어 주세요" defaultValue={issue?.body} />
        </Field>
        <div className="issue-period-row">
          <p>
            <strong>{endDay === selectedDay ? `${longDay(selectedDay)} 하루` : `${longDay(selectedDay)} ~ ${longDay(endDay)}`}</strong>
            <span>기간</span>
          </p>
          <button type="button" className="btn small weak" aria-expanded={period} onClick={() => setPeriod(!period)}>
            기간 바꾸기
          </button>
        </div>
        <div className="issue-period-fields" hidden={!period}>
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
        </div>
      </Form>
    </Modal>
  );
}
