import { useEffect, useState } from "react";
import { api, useResource } from "./api";
import type { Issue, User } from "./types";
import { addDays, days, monday, shortDay, today, time, weekLabel } from "./dates";
import ShiftIssueEditor from "./ShiftIssueEditor";
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
  const [adding, setAdding] = useState(false);
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
          <button className="btn primary" onClick={() => setAdding(true)}>
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
                    <h3 className="issue-day-heading">{label}<time dateTime={date}>{shortDay(date)}</time></h3>
                    <IssueList resource={{ ...weekly, error: undefined, data: weekly.data!.filter((issue) => issue.day === date) }} filter={filter} user={user} titlesOnly onChanged={resource.refresh} />
                  </section>
                );
              })}
            </div>
          </>
        ) : <Loading error={weekly.error} retry={weekly.refresh} />}
      </section>
      {adding && (
        <IssueEditor
          user={user}
          day={today() >= week && today() <= addDays(week, 4) ? today() : week}
          onClose={() => setAdding(false)}
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
  if (!resource.data) return <Loading error={resource.error} retry={resource.refresh} />;
  const open = resource.data.filter((issue) => !issue.done).length;
  const done = resource.data.length - open;
  const list = (filter: string) => (
    <IssueList resource={{ ...resource, error: undefined }} user={user} filter={filter} showDate={false} onChanged={onChanged} />
  );
  return (
    <div className="today-issues">
      <ResourceError error={resource.error} retry={resource.refresh} />
      <h3 className="today-issues-heading">진행 중 <span>{open}</span></h3>
      {open ? list("open") : <p className="today-issues-empty">{done ? "오늘의 이슈를 모두 완료했어요." : "오늘 등록된 이슈가 없습니다."}</p>}
      {done > 0 && (
        <section className="today-issues-done" aria-label="완료된 이슈">
          <h3 className="today-issues-heading">완료 <span>{done}</span></h3>
          {list("done")}
        </section>
      )}
    </div>
  );
}
export function IssueList({
  resource,
  filter,
  compact = false,
  onChanged,
  user,
  onSelect,
  onApply,
  titlesOnly = false,
  showDate = true,
}: {
  resource: IssuesResource;
  filter: string;
  compact?: boolean;
  onChanged?: () => Promise<void>;
  user: User;
  onSelect?: (issue: Issue) => void;
  onApply?: (issue: Issue) => void;
  titlesOnly?: boolean;
  showDate?: boolean;
}) {
  if (!resource.data)
    return <Loading error={resource.error} retry={resource.refresh} />;
  const visible = resource.data.filter(
    (issue) => filter === "all" || (filter === "done") === !!issue.done,
  );
  return (
    <>
      <ResourceError error={resource.error} retry={resource.refresh} />
      <div className={compact ? "" : "issue-list"}>
        {visible.map((issue) => {
          const content = (
            <IssueContent
              issue={issue}
              user={user}
              showTitle={!titlesOnly}
              showCategory={!compact}
              showDate={showDate}
              onSelect={onSelect}
              onApply={onApply}
              onChanged={async () => {
                await resource.refresh();
                await onChanged?.();
              }}
            />
          );
          return titlesOnly ? (
            <details key={issue.id} className="issue-disclosure">
              <summary><span><span className="issue-title-category">{issue.category}</span> {issue.title}</span></summary>
              <div className="issue-entry issue-expanded-content">{content}</div>
            </details>
          ) : (
            <article key={issue.id} className={compact ? "shift-issue-entry" : "issue-entry"}>
              {content}
            </article>
          );
        })}
        {!visible.length && (
          <p className="shift-issue-empty">해당하는 이슈가 없습니다.</p>
        )}
      </div>
    </>
  );
}
function IssueContent({
  issue,
  user,
  showTitle,
  showCategory,
  showDate,
  onSelect,
  onApply,
  onChanged,
}: {
  issue: Issue;
  user: User;
  showTitle: boolean;
  showCategory: boolean;
  showDate: boolean;
  onSelect?: (issue: Issue) => void;
  onApply?: (issue: Issue) => void;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const editable = !issue.done && (user.role === "admin" || user.id === issue.author_id);
  return (
    <>
      <div className="issue-body">
        <div className="issue-meta">
          <span className={`issue-status ${issue.done ? "is-done" : "is-open"}`}>
            {issue.done ? "완료" : "진행 중"}
          </span>
          {showDate && <time dateTime={issue.day}>{issue.day}</time>}
        </div>
        {showTitle && <h3>{showCategory && <><span className="issue-title-category">{issue.category}</span>{" "}</>}{issue.title}</h3>}
        {issue.shift_start != null && issue.shift_end != null && (
          <p className="shift-issue-reference">
            {issue.shift_name} · {showDate && `${issue.day} · `}{time(issue.shift_start)}–{time(issue.shift_end)}
            {` · ${issue.shift_role === "desk" ? "데스크" : "대기"}`}
          </p>
        )}
        <p>{issue.body}</p>
        {issue.shift_start != null && issue.shift_id == null && (
          <p className="hint">연결된 근무가 삭제되었습니다.</p>
        )}
        {onSelect && issue.shift_id != null && (
          <button type="button" className="text-btn shift-issue-link" onClick={() => onSelect(issue)}>
            근무표에서 보기
          </button>
        )}
      </div>
      <div className="shift-issue-actions">
        {editable && (
          <button type="button" className="text-btn" onClick={() => setEditing(true)}>
            수정
          </button>
        )}
        {user.role === "admin" && !issue.done && issue.shift_id != null && onApply && (
          <button type="button" className="text-btn" onClick={() => onApply(issue)}>
            변경 반영
          </button>
        )}
        {(issue.shift_start == null || user.role === "admin") && (
          <Action
            className="btn"
            run={async () => {
              if (issue.shift_start != null && !issue.done &&
                !confirm("근무표 반영 여부를 확인했나요? 이 요청을 완료 처리합니다.")) return;
              await api(`/issues/${issue.id}`, "PATCH", { done: !issue.done });
              await onChanged();
            }}
          >
            {issue.done ? "다시 열기" : "완료하기"}
          </Action>
        )}
      </div>
      {editing && <IssueEditor user={user} issue={issue} onClose={() => setEditing(false)} onSaved={onChanged} />}
    </>
  );
}
export function IssueEditor({
  user,
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
  user: User;
  issue?: Issue;
}) {
  const notice = useNotice();
  const [category, setCategory] = useState(issue?.category ?? initialCategory);
  const [selectedDay, setSelectedDay] = useState(issue?.day ?? day);
  // A shift change request keeps its shift, day and category; only its text can be edited.
  const request = issue?.shift_start != null;
  if (!issue && category === "근무 변경") {
    return <ShiftIssueEditor user={user} day={selectedDay} onClose={onClose} onSaved={onSaved} />;
  }
  return (
    <Modal title={issue ? (request ? "근무 변경 요청 수정" : "이슈 수정") : "새 이슈 남기기"} onClose={onClose}>
      <Form
        onClose={onClose}
        submit={issue ? "저장하기" : "등록하기"}
        onSave={async (data) => {
          const body = Object.fromEntries(
            (request ? ["title", "body"] : ["day", "category", "title", "body"]).map((key) => [key, value(data, key)]),
          );
          await (issue ? api(`/issues/${issue.id}`, "PUT", body) : api("/issues", "POST", body));
          onClose();
          await onSaved();
          notice(issue ? "이슈를 수정했어요." : "이슈를 등록했어요.");
        }}
      >
        {request ? (
          <p className="shift-issue-reference">
            {issue.shift_name} · {issue.day}
            {issue.shift_start != null && issue.shift_end != null && ` · ${time(issue.shift_start)}–${time(issue.shift_end)}`}
          </p>
        ) : (
          <>
            <Field label="해당 날짜">
              <input name="day" type="date" required value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)} />
            </Field>
            <Field label="구분">
              <select name="category" value={category} onChange={(event) => setCategory(event.target.value)}>
                {["인계", "공지", "시설", ...(issue ? [] : ["근무 변경"])].map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </Field>
          </>
        )}
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
