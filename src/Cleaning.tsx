import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { api, useResource } from "./api";
import type { CleaningRecord, Staff, User } from "./types";
import { dateTime } from "./dates";
import { ListHeader } from "./tds";
import { Action, AdminMenu, Form, Loading, Modal, ResourceError, useNotice } from "./ui";

type Records = ReturnType<typeof useResource<CleaningRecord[]>>;
interface Roll {
  month: string;
  names: string[];
  stopped: number;
  tick: number;
}
const colors = ["var(--blue500)", "var(--orange400)", "var(--red600)", "var(--green700)", "var(--purple700)"];

export const cleaningNames = (record?: CleaningRecord) =>
  record?.staff.map((person) => person.name).join(", ") || "미추첨";

export default function Cleaning({
  user,
  records,
  month,
  onLock,
}: {
  user: User;
  records: Records;
  month: string;
  onLock?: (locked: boolean) => void;
}) {
  const staff = useResource<Staff[]>("/staff");
  const [count, setCount] = useState(2);
  const [dialog, setDialog] = useState<"redraw" | "assign" | null>(null);
  const [roll, setRoll] = useState<Roll | null>(null);
  const [confetti, setConfetti] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const notice = useNotice();
  const admin = user.role === "admin";
  const active = staff.data?.filter((person) => person.active) ?? [];
  const record = records.data?.find((item) => item.month === month);
  const rolling = !!roll && roll.stopped < roll.names.length;
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    onLock?.(rolling);
    return () => onLock?.(false);
  }, [rolling]);

  function later(ms: number, run: () => void) {
    timers.current.push(setTimeout(run, ms));
  }
  async function draw(replace: boolean) {
    if (!Number.isInteger(count) || count < 1 || count > active.length)
      throw new Error(`인원은 1~${active.length}명 사이로 입력해 주세요.`);
    const result = await api<CleaningRecord>(
      "/cleaning/draw",
      "POST",
      replace ? { month, count, replace: true } : { month, count },
    );
    setDialog(null);
    const names = result.staff.map((person) => person.name);
    const done = () => {
      void records.refresh();
      notice(`${result.month} 청소 담당: ${names.join(", ")}`);
    };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setRoll(null);
      return done();
    }
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setConfetti(false);
    setRoll({ month: result.month, names, stopped: 0, tick: 0 });
    const spin = setInterval(
      () => setRoll((old) => old && { ...old, tick: old.tick + 1 }),
      70,
    );
    timers.current.push(spin);
    names.forEach((_, i) =>
      later(1200 + i * 600, () =>
        setRoll((old) => old && { ...old, stopped: i + 1 }),
      ),
    );
    later(1200 + (names.length - 1) * 600, () => {
      clearInterval(spin);
      setConfetti(true);
      done();
      later(1600, () => setConfetti(false));
    });
  }

  const pool = active.length ? active.map((person) => person.name) : ["…"];
  const shown = roll?.month === month ? roll : null;
  if (!records.data) return <Loading error={records.error} retry={records.refresh} />;
  return (
    <div className="monthly-panel">
      <ResourceError error={records.error} retry={records.refresh} />
      {staff.error && <ResourceError error={staff.error} retry={staff.refresh} />}
      {admin && (
        <AdminMenu>
          <div className="clean-count" role="group" aria-label="추첨 인원" data-stay>
            <span>추첨 인원</span>
            <button
              type="button"
              className="icon-btn"
              aria-label="인원 줄이기"
              disabled={rolling || !(count > 1)}
              onClick={() => setCount(Math.max(1, (count || 1) - 1))}
            >
              −
            </button>
            <input
              type="number"
              aria-label="추첨 인원(명)"
              min={1}
              max={active.length || 1}
              step={1}
              value={count}
              disabled={rolling}
              onChange={(event) => setCount(event.target.valueAsNumber)}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label="인원 늘리기"
              disabled={rolling || !(count < active.length)}
              onClick={() => setCount(Math.min(active.length, (count || 0) + 1))}
            >
              ＋
            </button>
            <span>명</span>
          </div>
          {record ? (
            <button type="button" disabled={rolling || !active.length} onClick={() => setDialog("redraw")}>
              다시 추첨
            </button>
          ) : (
            <Action className="" disabled={rolling || !active.length} run={() => draw(false)}>
              추첨
            </Action>
          )}
          <button type="button" disabled={rolling || !staff.data} onClick={() => setDialog("assign")}>
            직접 지정
          </button>
        </AdminMenu>
      )}
      <section className="tds-card monthly-progress clean-result" aria-label={`${Number(month.slice(5))}월 청소 담당`}>
        <p className="monthly-progress-label">{Number(month.slice(5))}월 청소 담당</p>
        <div aria-live="polite">
          {shown ? (
            <div className="clean-names">
              {shown.names.map((name, i) => (
                <span key={i} className={`clean-slot${i < shown.stopped ? " is-stopped" : ""}`}>
                  {i < shown.stopped ? name : pool[(shown.tick + i * 3) % pool.length]}
                </span>
              ))}
            </div>
          ) : record ? (
            <div className="clean-names">
              {record.staff.map((person) => (
                <strong key={person.id}>{person.name}</strong>
              ))}
            </div>
          ) : (
            <span className="clean-none">미추첨</span>
          )}
        </div>
        {confetti && (
          <div className="clean-confetti" aria-hidden="true">
            {Array.from({ length: 40 }, (_, i) => (
              <span
                key={i}
                style={{
                  left: `${(i * 37) % 100}%`,
                  background: colors[i % colors.length],
                  animationDelay: `${(i % 8) * 40}ms`,
                  "--drift": `${((i * 53) % 120) - 60}px`,
                  "--spin": `${(i * 97) % 720}deg`,
                } as CSSProperties}
              />
            ))}
          </div>
        )}
      </section>
      <section className="tds-card monthly-list" aria-labelledby="clean-history">
        <ListHeader level={3} id="clean-history" title="지난 기록" />
        <div className="clean-history-scroll">
          <table className="clean-history">
            <caption className="sr-only">청소 담당 지난 기록</caption>
            <thead>
              <tr>
                <th scope="col">월</th>
                <th scope="col">담당자</th>
                <th scope="col">추첨/지정</th>
                <th scope="col">시각</th>
              </tr>
            </thead>
            <tbody>
              {records.data.map((item) => (
                <tr key={item.month}>
                  <th scope="row">{item.month}</th>
                  <td>{cleaningNames(item)}</td>
                  <td>{item.username}</td>
                  <td>{dateTime(item.created_at)}</td>
                </tr>
              ))}
              {!records.data.length && (
                <tr>
                  <td colSpan={4}>기록이 없어요.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {dialog === "redraw" && (
        <Modal title="다시 추첨" onClose={() => setDialog(null)}>
          <p className="hint">
            {month} 청소 담당({cleaningNames(record)})을 지우고 {count}명을 새로
            뽑을까요?
          </p>
          <div className="form-actions">
            <button className="btn" onClick={() => setDialog(null)}>
              취소
            </button>
            <Action className="btn primary" run={() => draw(true)}>
              다시 추첨
            </Action>
          </div>
        </Modal>
      )}
      {dialog === "assign" && (
        <Modal title="청소 담당 직접 지정" onClose={() => setDialog(null)}>
          <Form
            submit="담당 저장"
            onClose={() => setDialog(null)}
            onSave={async (form) => {
              const ids = form.getAll("staff").map(Number);
              if (!ids.length) throw new Error("1명 이상 선택해 주세요.");
              await api(`/cleaning/${month}`, "PUT", { staff_ids: ids });
              setDialog(null);
              setRoll(null);
              await records.refresh();
              notice("청소 담당을 저장했어요.");
            }}
          >
            <p className="hint">{month} · 재직 중인 근무자 가운데 골라 주세요.</p>
            <div className="clean-pick">
              {active.map((person) => (
                <label key={person.id} className="check-row">
                  <span>{person.name}</span>
                  <input
                    type="checkbox"
                    className="tds-check"
                    name="staff"
                    value={person.id}
                    defaultChecked={record?.staff.some(
                      (item) => item.id === person.id,
                    )}
                  />
                </label>
              ))}
            </div>
          </Form>
        </Modal>
      )}
    </div>
  );
}
