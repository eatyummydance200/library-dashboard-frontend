import { useEffect, useRef, useState } from "react";
import { api, message, useResource } from "./api";
import type { TaggingData, User } from "./types";
import { koreaParts } from "./dates";
import { Loading, ResourceError, Stepper, useMobile, useNotice } from "./ui";

// onChanged: 월간 요약 카드의 진행률을 바로 다시 불러온다
export default function Tagging({ user, onChanged }: { user: User; onChanged?: () => Promise<void> }) {
  const mobile = useMobile();
  const [clock, setClock] = useState(koreaParts());
  const currentYear = Number(clock.year),
    month = Number(clock.month);
  const [year, setYear] = useState(currentYear);
  const [selected, setSelected] = useState(month);
  const chips = useRef<HTMLDivElement>(null);
  // 휴대폰에서 고른 달 칩이 가로 스크롤 밖에 있으면 보이게 한다
  useEffect(() => {
    const row = chips.current;
    const chip = row?.querySelector("[aria-pressed=true]");
    if (!row || !chip) return;
    const a = row.getBoundingClientRect(), b = chip.getBoundingClientRect();
    row.scrollLeft += b.left - a.left - (a.width - b.width) / 2;
  }, [selected]);
  const table = useResource<TaggingData>(`/tagging?year=${year}`);
  const current = useResource<TaggingData>(`/tagging?year=${currentYear}`);
  const summary = year === currentYear ? table : current;
  const busy = useRef(new Set<string>());
  const [pending, setPending] = useState<string[]>([]);
  const notice = useNotice();
  useEffect(() => {
    const timer = setInterval(() => setClock(koreaParts()), 60000);
    return () => clearInterval(timer);
  }, []);
  async function toggle(person: number, month: number, completed: boolean) {
    const key = `${person}/${year}/${month}`;
    if (busy.current.has(key)) return;
    busy.current.add(key);
    setPending([...busy.current]);
    try {
      await api(`/tagging/${key}`, "PUT", { completed });
      const change = (data: TaggingData): TaggingData => ({
        ...data,
        tags: [
          ...data.tags.filter(
            (tag) => tag.staff_id !== person || tag.month !== month,
          ),
          { staff_id: person, month, completed: Number(completed) },
        ],
      });
      table.update(change);
      if (year === currentYear) current.update(change);
      void onChanged?.();
      notice("태깅 상태를 저장했습니다.");
    } catch (error) {
      notice(message(error));
    } finally {
      busy.current.delete(key);
      setPending([...busy.current]);
    }
  }
  const active = summary.data?.staff.filter((person) => person.active) ?? [];
  const completed = new Set(
    summary.data?.tags
      .filter((tag) => tag.month === month && tag.completed)
      .map((tag) => tag.staff_id),
  );
  const done = active.filter((person) => completed.has(person.id)).length;
  const percent = active.length ? Math.round((done / active.length) * 100) : 0;
  return (
    <section id="tagging" className="view" aria-label="태깅">
      <section className="card">
        {mobile ? (
          <div className="card-head">
            <Stepper
              label={`${year}년`}
              prev="이전 연도"
              next="다음 연도"
              onMove={(offset) => setYear(year + offset)}
              canPrev={year > 2000 && !pending.length}
              canNext={year < 2100 && !pending.length}
            />
            {user.role !== "admin" && <span className="list-note">조회만 할 수 있어요</span>}
          </div>
        ) : (
        <div className="card-head panel-bar">
          <div className="week-controls">
            <button
              className="icon-btn"
              aria-label="이전 연도"
              disabled={year <= 2000 || !!pending.length}
              onClick={() => setYear(year - 1)}
            >
              ‹
            </button>
            <strong>{year}년</strong>
            <button
              className="icon-btn"
              aria-label="다음 연도"
              disabled={year >= 2100 || !!pending.length}
              onClick={() => setYear(year + 1)}
            >
              ›
            </button>
          </div>
          <div id="tag-status" aria-live="polite">
            {summary.data ? (
              <>
                <span className="tag-status-summary">
                  이번 달({month}월) <strong>{done}</strong> / {active.length}명 완료
                  {percent === 100 && " · 모두 완료했어요!"}
                </span>
                <progress max={active.length || 1} value={done} aria-label={`${month}월 태깅 진행률`}>
                  {percent}%
                </progress>
              </>
            ) : summary.error ? (
              <ResourceError error={summary.error} retry={summary.refresh} />
            ) : "…"}
          </div>
        </div>
        )}
        {summary.data && <ResourceError error={summary.error} retry={summary.refresh} />}
        <div ref={chips} className="month-chips" role="group" aria-label="태깅 월 선택">
          {Array.from({ length: 12 }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={selected === i + 1}
              className={year === currentYear && i + 1 === month ? "this-month" : undefined}
              onClick={() => setSelected(i + 1)}
            >
              {i + 1}월
            </button>
          ))}
        </div>
        {table.data ? (
          <>
            <ResourceError error={table.error} retry={table.refresh} />
            <ul className="tag-list" aria-label={`${year}년 ${selected}월 근무자별 태깅 완료 여부`}>
              {table.data.staff.map((person) => {
                const tags = table.data!.tags.filter((tag) => tag.staff_id === person.id && tag.completed);
                const completed = tags.some((tag) => tag.month === selected);
                const key = `${person.id}/${year}/${selected}`;
                const saving = pending.includes(key);
                return (
                  <li key={person.id} className={`tag-row${completed ? " is-complete" : ""}`}>
                    <span className="tag-name">
                      <strong>{person.name}</strong>
                      {!person.active && <small className="badge">비활성</small>}
                      <small>올해 {tags.length}/12</small>
                    </span>
                    <button
                      className="tag-mark"
                      disabled={user.role !== "admin"}
                      aria-disabled={saving || undefined}
                      aria-busy={saving || undefined}
                      aria-pressed={completed}
                      aria-label={`${person.name} ${year}년 ${selected}월 ${completed ? "완료" : "미완료"}`}
                      onClick={() => void toggle(person.id, selected, !completed)}
                    >
                      {completed ? "✓ 완료" : "미완료"}
                    </button>
                  </li>
                );
              })}
              {!table.data.staff.length && <li className="shift-issue-empty">등록된 근무자가 없습니다.</li>}
            </ul>
          </>
        ) : (
          <Loading error={table.error} retry={table.refresh} />
        )}
      </section>
    </section>
  );
}
