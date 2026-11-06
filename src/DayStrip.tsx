import { addDays, days, monday, shortDay, today, weekLabel } from "./dates";
import { Icon } from "./ui";

// 오늘의 요일 번호(월=0). 주말이면 금요일.
export const todayIndex = () => Math.min((new Date(`${today()}T00:00:00Z`).getUTCDay() + 6) % 7, 4);
// ‹ 월 화 수 목 금 › 한 줄로 날짜 이동을 끝낸다. 시간표·이슈가 함께 쓴다.
export function DayStrip({ week, day, onWeek, onDay, label, counts }: {
  week: string;
  day: number;
  onWeek: (week: string) => void;
  onDay: (day: number) => void;
  label: string;
  counts?: number[];
}) {
  const now = today();
  return (
    <div className="day-strip">
      <div className="day-strip-row">
        <button type="button" className="icon-btn" aria-label="이전 주" onClick={() => onWeek(addDays(week, -7))}>
          <Icon name="left" />
        </button>
        <div className="day-picker" role="group" aria-label={`${label} · ${weekLabel(week)}`}>
          {days.map((name, index) => {
            const date = addDays(week, index);
            const count = counts?.[index];
            return (
              <button
                key={name}
                type="button"
                aria-pressed={day === index}
                aria-label={`${shortDay(date)} ${name}요일${date === now ? " · 오늘" : ""}${count ? ` · 진행 중 ${count}건` : ""}`}
                className={date === now ? "is-today" : undefined}
                onClick={() => onDay(index)}
              >
                {name}
                <small>{date === now ? "오늘" : shortDay(date)}</small>
                {!!count && <span className="day-count" aria-hidden="true">{count}</span>}
              </button>
            );
          })}
        </div>
        <button type="button" className="icon-btn" aria-label="다음 주" onClick={() => onWeek(addDays(week, 7))}>
          <Icon name="chevron" />
        </button>
      </div>
      <p className="sr-only" aria-live="polite">{weekLabel(week)}</p>
      {week !== monday() && (
        <button type="button" className="text-btn today-jump" onClick={() => { onWeek(monday()); onDay(todayIndex()); }}>
          {weekLabel(week)} 보는 중 · 이번 주로
        </button>
      )}
    </div>
  );
}
