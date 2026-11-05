import { useEffect, useRef, useState } from "react";
import { api, message, useResource } from "./api";
import type { Issue, User } from "./types";
import { addDays, dateTime, days, koreaParts, monday, shortDay, today, weekLabel } from "./dates";
import {
  Action,
  Field,
  Form,
  Loading,
  Modal,
  ResourceError,
  useNotice,
  value,
} from "./ui";

type IssuesResource = ReturnType<typeof useResource<Issue[]>>;
export default function Issues({ resource, user }: { resource: IssuesResource; user: User }) {
  const [week, setWeek] = useState(monday());
  const weekly = useResource<Issue[]>(`/issues?week=${week}`);
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState<string | null>(null);
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
  return (
    <section className="view" aria-label="이슈">
      <section className="card wide-card">
        <div className="card-head">
          <h2>이슈</h2>
          <button className="btn primary" onClick={() => setAdding(today() >= week && today() <= addDays(week, 4) ? today() : week)}>
            ＋ 새 이슈
          </button>
        </div>
        <div className="issue-week-tools">
          <div className="week-controls" aria-label="이슈 조회 주간">
            <button type="button" className="icon-btn" aria-label="이전 주 이슈" onClick={() => setWeek(addDays(week, -7))}>‹</button>
            <strong className={week === monday() ? "current-week" : undefined}>{weekLabel(week)}</strong>
            <button type="button" className="icon-btn" aria-label="다음 주 이슈" onClick={() => setWeek(addDays(week, 7))}>›</button>
          </div>
          <select
            className="select"
            aria-label="이슈 상태 필터"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">전체 이슈</option>
            <option value="open">진행 중</option>
            <option value="done">완료</option>
          </select>
        </div>
        {weekly.data ? (
          <>
            <ResourceError error={weekly.error} retry={weekly.refresh} />
            <div className="issue-week-board">
              {days.map((label, index) => {
                const date = addDays(week, index);
                return (
                  <section key={date} className="issue-day-column" aria-label={`${date} ${label}요일 이슈`}>
                    <header className="issue-day-heading">
                      <h3>{label}</h3>
                      <time dateTime={date}>{shortDay(date)}</time>
                      <button type="button" className="issue-day-add" aria-label={`${shortDay(date)} ${label}요일 이슈 추가`} onClick={() => setAdding(date)}>＋</button>
                    </header>
                    <IssueList resource={{ ...weekly, error: undefined, data: weekly.data!.filter((issue) => issue.day === date) }} filter={filter} user={user} onChanged={resource.refresh} />
                  </section>
                );
              })}
            </div>
          </>
        ) : <Loading error={weekly.error} retry={weekly.refresh} />}
      </section>
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
export function TodayIssues({ resource, user, onChanged }: {
  resource: IssuesResource;
  user: User;
  onChanged: () => Promise<void>;
}) {
  return (
    <div className="today-issues">
      <IssueList resource={resource} user={user} filter="all" onChanged={onChanged} empty="오늘 등록된 이슈가 없습니다." />
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
  const editable = !issue.done && (user.role === "admin" || user.id === issue.author_id);
  const deletable = user.role === "admin" || (!issue.done && user.id === issue.author_id);
  return (
    <article className={`issue-item${issue.done ? " is-done" : ""}`}>
      <input
        type="checkbox"
        className="issue-check"
        checked={!!issue.done}
        disabled={busy}
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
      <div className="issue-main">
        <h3 className="issue-heading">
          <span className="issue-title-category">{issue.category}</span>{" "}
          <span className="issue-title">{issue.title}</span>
          {issue.created_at && <time className="issue-time" dateTime={issue.created_at}>{createdLabel(issue)}</time>}
        </h3>
        <p className="issue-text">{issue.body}</p>
      </div>
      {(editable || deletable) && (
        <IssueMenu
          onEdit={editable ? () => setEditing(true) : undefined}
          onDelete={deletable ? async () => {
            if (!confirm("이 이슈를 삭제할까요? 되돌릴 수 없습니다.")) return;
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
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: Event) => {
      const element = menu.current;
      if (!element?.open) return;
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !element.contains(event.target as Node))
        element.open = false;
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  const hide = () => {
    if (menu.current) menu.current.open = false;
  };
  return (
    <details ref={menu} className="issue-menu">
      <summary aria-label="이슈 메뉴">⋯</summary>
      <div className="issue-menu-list">
        {onEdit && <button type="button" onClick={() => { hide(); onEdit(); }}>수정</button>}
        {onDelete && <Action className="danger" run={async () => { hide(); await onDelete(); }}>삭제</Action>}
      </div>
    </details>
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
  return (
    <Modal title={issue ? "이슈 수정" : "새 이슈 남기기"} onClose={onClose}>
      <Form
        onClose={onClose}
        submit={issue ? "저장하기" : "등록하기"}
        onSave={async (data) => {
          const body = Object.fromEntries(["day", "category", "title", "body"].map((key) => [key, value(data, key)]));
          await (issue ? api(`/issues/${issue.id}`, "PUT", body) : api("/issues", "POST", body));
          onClose();
          await onSaved();
          notice(issue ? "이슈를 수정했어요." : "이슈를 등록했어요.");
        }}
      >
        <Field label="해당 날짜">
          <input name="day" type="date" required value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)} />
        </Field>
        <Field label="구분">
          <select name="category" value={category} onChange={(event) => setCategory(event.target.value)}>
            {["인계", "공지", "시설"].map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </Field>
        <Field label="제목">
          <input name="title" required maxLength={80} defaultValue={issue?.title} />
        </Field>
        <Field label="내용">
          <textarea name="body" required maxLength={1500} defaultValue={issue?.body} />
        </Field>
      </Form>
    </Modal>
  );
}
