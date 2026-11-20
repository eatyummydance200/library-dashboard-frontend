import { useEffect, useRef, useState } from "react";
import { api, message, useResource } from "./api";
import type { TaggingData, User } from "./types";
import { Badge, ListHeader } from "./tds";
import { Loading, ResourceError, useNotice } from "./ui";
import { ProgressCard } from "./Archive";

export function taggingProgress(data: TaggingData, month: number) {
  const active = data.staff.filter((person) => person.active);
  const completed = new Set(
    data.tags
      .filter((tag) => tag.month === month && tag.completed)
      .map((tag) => tag.staff_id),
  );
  return {
    done: active.filter((person) => completed.has(person.id)).length,
    total: active.length,
  };
}

// month(YYYY-MM)의 근무자별 태깅 완료. 체크는 관리자만 바꿀 수 있다.
export default function Tagging({ user, month: value, onLock }: { user: User; month: string; onLock?: (locked: boolean) => void }) {
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5));
  const table = useResource<TaggingData>(`/tagging?year=${year}`);
  const busy = useRef(new Set<string>());
  const [pending, setPending] = useState<string[]>([]);
  const notice = useNotice();
  const admin = user.role === "admin";
  useEffect(() => {
    onLock?.(pending.length > 0);
    return () => onLock?.(false);
  }, [pending.length > 0]);
  async function toggle(person: number, completed: boolean) {
    const key = `${person}/${year}/${month}`;
    if (busy.current.has(key)) return;
    busy.current.add(key);
    setPending([...busy.current]);
    try {
      await api(`/tagging/${key}`, "PUT", { completed });
      table.update((data) => ({
        ...data,
        tags: [
          ...data.tags.filter((tag) => tag.staff_id !== person || tag.month !== month),
          { staff_id: person, month, completed: Number(completed) },
        ],
      }));
      notice("태깅 상태를 저장했어요.");
    } catch (error) {
      notice(message(error));
    } finally {
      busy.current.delete(key);
      setPending([...busy.current]);
    }
  }
  const data = table.data;
  if (!data) return <Loading error={table.error} retry={table.refresh} />;
  const progress = taggingProgress(data, month);
  return (
    <div className="monthly-panel">
      <ResourceError error={table.error} retry={table.refresh} />
      <ProgressCard label={`${month}월 태깅`} unit="명" done={progress.done} total={progress.total} />
      <section className="tds-card monthly-list" aria-label={`${year}년 ${month}월 근무자별 태깅 완료 여부`}>
        <ListHeader level={3} title="근무자" tail={!admin && "조회만 할 수 있어요"} />
        <div className="tagging-grid">
        {data.staff.map((person) => {
          const tags = data.tags.filter((tag) => tag.staff_id === person.id && tag.completed);
          const completed = tags.some((tag) => tag.month === month);
          const saving = pending.includes(`${person.id}/${year}/${month}`);
          return (
            <label key={person.id} className="check-row">
              <input
                type="checkbox"
                className="tds-check"
                checked={completed}
                disabled={!admin}
                aria-busy={saving || undefined}
                aria-disabled={saving || undefined}
                aria-label={`${person.name} ${year}년 ${month}월 태깅 완료`}
                onChange={() => void toggle(person.id, !completed)}
              />
              <span>
                {person.name}
                {!person.active && <Badge color="grey">비활성</Badge>}
              </span>
            </label>
          );
        })}
        </div>
        {!data.staff.length && <p className="issue-empty">등록된 근무자가 없어요.</p>}
      </section>
    </div>
  );
}
