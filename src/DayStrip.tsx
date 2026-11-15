import { addDays, days, monday, shortDay, today, weekLabel } from "./dates";
import { Icon } from "./ui";
import "./schedule.css";

// 오늘의 요일 번호(월=0). 주말이면 금요일.
export const todayIndex = () => Math.min((new Date(`${today()}T00:00:00Z`).getUTCDay() + 6) % 7, 4);
// ‹ [월 10] [화 11] … › 요일 칩 한 줄로 날짜 이동을 끝낸다. 시간표·이슈가 함께 쓴다.
// onWeek가 없으면 주 이동 없이 요일만 고른다(확정표처럼 날짜가 없는 표).
export function DayStrip({ week, day, onWeek, onDay, label, counts }: {
  week: string;
  day: number;
  onWeek?: (week: string) => void;
  onDay: (day: number) => void;
  label: string;
  counts?: number[];
}) {
  const now = today();
  return (
    <div className="day-strip">
      <div className="day-strip-row">
        {onWeek && (
          <button type="button" className="day-strip-nav" aria-label="이전 주" onClick={() => onWeek(addDays(week, -7))}>
            <Icon name="left" />
          </button>
        )}
        <div className="day-chips" role="group" aria-label={onWeek ? `${label} · ${weekLabel(week)}` : label}>
          {days.map((name, index) => {
            const date = addDays(week, index);
            const isToday = !!onWeek && date === now;
            const count = counts?.[index];
            return (
              <button
                key={name}
                type="button"
                aria-pressed={day === index}
                aria-label={`${onWeek ? `${shortDay(date)} ` : ""}${name}요일${isToday ? " · 오늘" : ""}${count ? ` · 진행 중 ${count}건` : ""}`}
                className={isToday ? "is-today" : undefined}
                onClick={() => onDay(index)}
              >
                {name}
                {onWeek && ` ${Number(date.slice(8))}`}
                {!!count && <span className="day-count" aria-hidden="true">{count}</span>}
              </button>
            );
          })}
        </div>
        {onWeek && (
          <button type="button" className="day-strip-nav" aria-label="다음 주" onClick={() => onWeek(addDays(week, 7))}>
            <Icon name="chevron" />
          </button>
        )}
      </div>
      {onWeek && <p className="sr-only" aria-live="polite">{weekLabel(week)}</p>}
      {onWeek && week !== monday() && (
        <button type="button" className="text-btn today-jump" onClick={() => { onWeek(monday()); onDay(todayIndex()); }}>
          {weekLabel(week)} 보는 중 · 이번 주로
        </button>
      )}
    </div>
  );
}
