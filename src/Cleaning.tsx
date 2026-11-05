import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { api, useResource } from "./api";
import type { CleaningRecord, Staff, User } from "./types";
import { addMonths, dateTime, today } from "./dates";
import { Action, Form, Loading, Modal, ResourceError, useNotice } from "./ui";

type Records = ReturnType<typeof useResource<CleaningRecord[]>>;
interface Roll {
  month: string;
  names: string[];
  stopped: number;
  tick: number;
}
const colors = ["#03499a", "#f2b632", "#e2574c", "#2f9e6e", "#8a5cf6"];

export const cleaningNames = (record?: CleaningRecord) =>
  record?.staff.map((person) => person.name).join(", ") || "미추첨";

export default function Cleaning({
  user,
  records,
}: {
  user: User;
  records: Records;
}) {
  const [month, setMonth] = useState(today().slice(0, 7));
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

  function move(offset: number) {
    const next = addMonths(month, offset);
    if (next >= "2000-01" && next <= "2100-12") setMonth(next);
  }
  function later(ms: number, run: () => void) {
    timers.current.push(setTimeout(run, ms));
  }
  async function draw(replace: boolean) {
    if (!Number.isInteger(count) || count < 1 || count > active.length)
      throw new Error(`인원은 1~${active.length}명 사이로 입력해주세요.`);
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
  return (
    <section className="card cleaning-panel" aria-label="청소 담당">
      <div className="card-head">
        <h2>청소 담당</h2>
        <div className="archive-month-controls">
          <button
            className="icon-btn"
            aria-label="청소 이전 달"
            onClick={() => move(-1)}
            disabled={month === "2000-01" || rolling}
          >
            ‹
          </button>
          <input
            type="month"
            min="2000-01"
            max="2100-12"
            required
            aria-label="청소 기준 월"
            value={month}
            disabled={rolling}
            onChange={(event) => {
              if (event.target.value && event.target.checkValidity())
                setMonth(event.target.value);
            }}
          />
          <button
            className="icon-btn"
            aria-label="청소 다음 달"
            onClick={() => move(1)}
            disabled={month === "2100-12" || rolling}
          >
            ›
          </button>
        </div>
      </div>
      {records.data ? (
        <>
          <ResourceError error={records.error} retry={records.refresh} />
          <div className="cleaning-result" aria-live="polite">
            {shown ? (
              <div className="cleaning-slots">
                {shown.names.map((name, i) => (
                  <span
                    key={i}
                    className={`cleaning-slot ${i < shown.stopped ? "is-stopped" : ""}`}
                  >
                    {i < shown.stopped
                      ? name
                      : pool[(shown.tick + i * 3) % pool.length]}
                  </span>
                ))}
              </div>
            ) : record ? (
              <div className="duty-people">
                {record.staff.map((person) => (
                  <span className="duty-person" key={person.id}>
                    {person.name}
                  </span>
                ))}
              </div>
            ) : (
              <span className="unassigned">미추첨</span>
            )}
            {record && !rolling && (
              <p className="hint">
                추첨/지정: {record.username} · {dateTime(record.created_at)}
              </p>
            )}
          </div>
          {admin && (
            <div className="cleaning-actions">
              <label className="cleaning-count">
                인원
                <input
                  type="number"
                  min={1}
                  max={active.length || 1}
                  step={1}
                  value={count}
                  disabled={rolling}
                  onChange={(event) => setCount(event.target.valueAsNumber)}
                />
                명
              </label>
              {record ? (
                <button
                  className="btn primary"
                  disabled={rolling || !active.length}
                  onClick={() => setDialog("redraw")}
                >
                  다시 추첨
                </button>
              ) : (
                <Action
                  className="btn primary"
                  disabled={rolling || !active.length}
                  run={() => draw(false)}
                >
                  추첨
                </Action>
              )}
              <button
                className="btn"
                disabled={rolling || !staff.data}
                onClick={() => setDialog("assign")}
              >
                직접 지정
              </button>
            </div>
          )}
          <div className="table-inset">
            <table className="cleaning-table">
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
                    <td colSpan={4}>기록이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <Loading error={records.error} retry={records.refresh} />
      )}
      {staff.error && <ResourceError error={staff.error} retry={staff.refresh} />}
      {confetti && (
        <div className="confetti" aria-hidden="true">
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
      {dialog === "redraw" && (
        <Modal title="다시 추첨" onClose={() => setDialog(null)}>
          <p className="hint">
            {month} 청소 담당({cleaningNames(record)})을 지우고 {count}명을 새로
            추첨할까요?
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
              if (!ids.length) throw new Error("1명 이상 선택해주세요.");
              await api(`/cleaning/${month}`, "PUT", { staff_ids: ids });
              setDialog(null);
              setRoll(null);
              await records.refresh();
              notice("청소 담당을 저장했습니다.");
            }}
          >
            <p className="hint">{month} · 재직 근무자 중에서 선택해주세요.</p>
            <div className="cleaning-pick">
              {active.map((person) => (
                <label key={person.id}>
                  <input
                    type="checkbox"
                    name="staff"
                    value={person.id}
                    defaultChecked={record?.staff.some(
                      (item) => item.id === person.id,
                    )}
                  />
                  {person.name}
                </label>
              ))}
            </div>
          </Form>
        </Modal>
      )}
    </section>
  );
}
