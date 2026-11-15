// TDS(토스 디자인 시스템) 모양을 따른 공통 부품. Figma "근무 대시보드 리디자인" 페이지의 인스턴스와 1:1로 대응한다.
// 스타일은 tds.css. 화면 전용 모양은 각 화면 CSS에 둔다.
import { useContext } from "react";
import type { ReactNode } from "react";
import { AdminOutlet, Icon } from "./ui";
import type icons from "./icons.json";

type IconName = keyof typeof icons;

/** Top: 화면 맨 위 큰 제목. upper(작은 윗줄) · title(h1) · lower(아랫줄) · actions(오른쪽 버튼) */
export function PageTop({ upper, title, lower, brandLower, actions, level = 1 }: {
  upper?: ReactNode;
  title: ReactNode;
  lower?: ReactNode;
  brandLower?: boolean;
  actions?: ReactNode;
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? "h1" : "h2";
  const adminOutlet = useContext(AdminOutlet);
  return (
    <header className="page-top">
      <div className="page-top-text">
        {upper && <div className="page-top-upper">{upper}</div>}
        <Heading className="page-top-title">{title}</Heading>
        {lower && <p className={`page-top-lower${brandLower ? " is-brand" : ""}`}>{lower}</p>}
      </div>
      {(actions || level === 1) && (
        <div className="page-top-actions">
          {level === 1 && <span className="page-top-admin" ref={adminOutlet} />}
          {actions}
        </div>
      )}
    </header>
  );
}

/** 흰 카드 (라운드 20, 그림자 없음) */
export function Card({ children, className = "", label, labelledBy }: {
  children: ReactNode;
  className?: string;
  label?: string;
  labelledBy?: string;
}) {
  return (
    <section className={`tds-card ${className}`} aria-label={label} aria-labelledby={labelledBy}>
      {children}
    </section>
  );
}

/** List Header: 섹션 제목 + 오른쪽 꼬리(텍스트·버튼) */
export function ListHeader({ title, tail, id, size = "s", level = 2 }: {
  title: ReactNode;
  tail?: ReactNode;
  id?: string;
  size?: "s" | "m";
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className={`list-header size-${size}`}>
      <Heading id={id}>{title}</Heading>
      {tail && <div className="list-header-tail">{tail}</div>}
    </div>
  );
}

/** List Row: 왼쪽 아이콘(선택) · 제목/설명 · 오른쪽 액세서리. onClick이 있으면 행 전체가 버튼이다. */
export function ListRow({ icon, iconTone, title, sub, sub2, right, onClick, ariaLabel, className = "", muted }: {
  icon?: IconName;
  iconTone?: "grey" | "blue" | "orange" | "green" | "purple" | "teal";
  title: ReactNode;
  sub?: ReactNode;
  sub2?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
  muted?: boolean;
}) {
  const body = (
    <>
      {icon && (
        <span className={`list-row-icon tone-${iconTone ?? "grey"}`} aria-hidden="true">
          <Icon name={icon} />
        </span>
      )}
      <span className="list-row-text">
        <span className="list-row-title">{title}</span>
        {sub && <span className="list-row-sub">{sub}</span>}
        {sub2 && <span className="list-row-sub">{sub2}</span>}
      </span>
    </>
  );
  const cls = `list-row${muted ? " is-muted" : ""} ${className}`;
  if (onClick)
    return (
      <div className={cls}>
        <button type="button" className="list-row-main" onClick={onClick} aria-label={ariaLabel}>
          {body}
        </button>
        {right && <span className="list-row-right">{right}</span>}
      </div>
    );
  return (
    <div className={cls}>
      <span className="list-row-main">{body}</span>
      {right && <span className="list-row-right">{right}</span>}
    </div>
  );
}

/** 오른쪽 화살표 (ListRow right에 넣는다) */
export function Chevron() {
  return (
    <span className="tds-chevron" aria-hidden="true">
      <Icon name="chevron" />
    </span>
  );
}

/** Badge: 상태·분류 표시. 누르는 용도가 아니다. */
export function Badge({ children, color = "blue", fill = false, label }: {
  children: ReactNode;
  color?: "blue" | "grey" | "red" | "yellow" | "green" | "teal" | "purple";
  fill?: boolean;
  label?: string;
}) {
  return (
    <span className={`tds-badge c-${color}${fill ? " is-fill" : ""}`} aria-label={label}>
      {children}
    </span>
  );
}

/** Tab: 밑줄 탭. 화면 안 보기 전환용 (role=tablist). fluid면 가로 스크롤 */
export function Tabs<K extends string>({ items, value, onChange, label, fluid }: {
  items: readonly { key: K; label: ReactNode; aria?: string }[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  fluid?: boolean;
}) {
  return (
    <div className={`tds-tabs${fluid ? " is-fluid" : ""}`} role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={item.key === value}
          aria-label={item.aria}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Chip: 작은 선택 칩 묶음 (aria-pressed). */
export function Chips<K extends string>({ items, value, onChange, label }: {
  items: readonly { key: K; label: ReactNode }[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div className="tds-chips" role="group" aria-label={label}>
      {items.map((item) => (
        <button key={item.key} type="button" aria-pressed={item.key === value} onClick={() => onChange(item.key)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Segmented Control: 2~3개 보기 전환 (aria-pressed) */
export function Segmented<K extends string>({ items, value, onChange, label }: {
  items: readonly { key: K; label: ReactNode }[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div className="tds-segmented" role="group" aria-label={label}>
      {items.map((item) => (
        <button key={item.key} type="button" aria-pressed={item.key === value} onClick={() => onChange(item.key)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Progress Bar */
export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="tds-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

/** 섹션 사이 굵은 회색 구분선 (흰 배경 화면용) */
export function Divider() {
  return <hr className="tds-divider" />;
}
