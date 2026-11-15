import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { api, message, useResource } from "./api";
import type { ArchiveData, Assignment, User } from "./types";
import { dateTime } from "./dates";
import { ListHeader, ProgressBar } from "./tds";
import { Action, AdminMenu, Form, Loading, Modal, ResourceError, numeric, useNotice } from "./ui";

export function archiveProgress(data: ArchiveData) {
  // 추첨 전이면 그룹 신문사 전체가 미완료
  if (!data.draw) return { done: 0, total: data.groups.flat().length };
  const tasks = data.assignments.flatMap((row) => row.tasks);
  return {
    done: tasks.filter((task) => task.completed).length,
    total: tasks.length,
  };
}
// 월간 업무 탭 맨 위 진행 카드: "16개 중 8개 끝났어요" + 진행 막대
export function ProgressCard({ label, done, total, unit = "개", note }: {
  label: string;
  done: number;
  total: number;
  unit?: string;
  note?: string;
}) {
  return (
    <section className="tds-card monthly-progress" aria-label={label}>
      <p className="monthly-progress-label">{label}</p>
      <strong aria-live="polite">
        {note ?? (total && done === total ? `${total}${unit} 모두 끝났어요` : `${total}${unit} 중 ${done}${unit} 끝났어요`)}
      </strong>
      <ProgressBar value={done} max={total} label={`${label} 진행률`} />
    </section>
  );
}

const STOP = 7; // 한 조가 멈추는 간격(칸). 7칸 × 80ms ≈ 0.56초
const colors = ["#3182f6", "#ffb331", "#f04452", "#03b26c", "#a234c7", "#18a5a5"];
export default function Archive({ user, month, onLock }: { user: User; month: string; onLock?: (locked: boolean) => void }) {
  const resource = useResource<ArchiveData>(`/archive?month=${month}`);
  const [editing, setEditing] = useState<ArchiveData | null>(null);
  const busy = useRef(new Set<number>());
  const [pending, setPending] = useState<number[]>([]);
  const notice = useNotice();
  const admin = user.role === "admin";
  useEffect(() => {
    onLock?.(pending.length > 0);
    return () => onLock?.(false);
  }, [pending.length > 0]);
  async function draw() {
    if (!confirm(`${month} 담당을 무작위 추첨할까요?`)) return;
    await api("/archive/draw", "POST", { month });
    await resource.refresh();
    notice("담당 추첨 결과를 저장했어요.");
    // 결과는 이미 저장됐다. 여기부터는 보여 주기만: 이름이 돌다가 1조부터 차례로 멈추고 색종이가 내린다.
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) setShow(0);
  }
  // 추첨 연출의 진행 칸(80ms마다 +1). STOP칸마다 한 조씩 멈추고, 다 멈춘 뒤 색종이가 끝나면 null.
  const [show, setShow] = useState<number | null>(null);
  useEffect(() => {
    if (show === null) return;
    const timer = setTimeout(() => setShow(show >= STOP * 7 + 32 ? null : show + 1), 80);
    return () => clearTimeout(timer);
  }, [show]);
  async function toggle(id: number, completed: boolean) {
    if (busy.current.has(id)) return;
    busy.current.add(id);
    setPending([...busy.current]);
    try {
      await api(`/archive/tasks/${id}`, "PUT", { completed });
      resource.update((data) => ({
        ...data,
        assignments: data.assignments.map((assignment) => ({
          ...assignment,
          tasks: assignment.tasks.map((task) =>
            task.id === id
              ? {
                  ...task,
                  completed: Number(completed),
                  completed_at: completed ? new Date().toISOString() : null,
                  completed_by_name: completed ? user.username : null,
                }
              : task,
          ),
        })),
      }));
      notice(
        completed ? "과월호 완료를 저장했어요." : "완료 표시를 해제했어요.",
      );
    } catch (error) {
      notice(message(error));
    } finally {
      busy.current.delete(id);
      setPending([...busy.current]);
    }
  }
  const data = resource.data;
  if (!data) return <Loading error={resource.error} retry={resource.refresh} />;
  const rows: Assignment[] = data.draw
    ? data.assignments
    : data.groups.map((papers, i) => ({
        group_number: i + 1,
        staff_id: null,
        staff_name: "미정",
        tasks: papers.map((newspaper) => ({ newspaper, completed: 0 })),
      }));
  const progress = archiveProgress(data);
  const stopped = show === null ? 7 : Math.floor(show / STOP);
  return (
    <div className="monthly-panel">
      {show !== null && stopped >= 7 && (
        <div className="draw-confetti" aria-hidden="true">
          {Array.from({ length: 90 }, (_, i) => (
            <span
              key={i}
              style={{
                left: `${(i * 37) % 100}%`,
                background: colors[i % colors.length],
                animationDelay: `${(i % 15) * 50}ms`,
                "--drift": `${((i * 53) % 240) - 120}px`,
                "--spin": `${(i * 97) % 900}deg`,
              } as CSSProperties}
            />
          ))}
        </div>
      )}
      <ResourceError error={resource.error} retry={resource.refresh} />
      {admin && (
        <AdminMenu>
          {!data.draw && (
            <Action className="" disabled={data.participants.length !== 7} run={draw}>
              담당 추첨하기
            </Action>
          )}
          <button
            type="button"
            disabled={!!pending.length || (!data.draw && data.participants.length < 7)}
            onClick={() => setEditing(data)}
          >
            {data.draw ? "담당 바꾸기" : "담당 직접 정하기"}
          </button>
          {!data.draw && data.participants.length !== 7 && (
            <p className="menu-hint">추첨은 재직 근무자가 7명일 때 할 수 있어요. 직접 정할 때는 7명을 골라 주세요.</p>
          )}
        </AdminMenu>
      )}
      <ProgressCard
        label={`${Number(month.slice(5))}월 과월호 정리`}
        done={progress.done}
        total={progress.total}
        note={data.draw ? undefined : "아직 담당을 정하지 않았어요"}
      />
      {!admin && !user.staff_id && (
        <p className="monthly-note">
          체크하려면 관리자에게 계정과 근무자 이름을 연결해 달라고 요청해 주세요.
        </p>
      )}
      <div className="monthly-groups" role="list" aria-label={`${month} 과월호 담당자와 신문사 완료 상태`}>
        {rows.map((row, index) => {
          const rolling = index >= stopped;
          const names = data.participants;
          // 권한: 추첨 뒤, 관리자 또는 그 조 담당자만 체크할 수 있다
          const editable = !!data.draw && (admin || user.staff_id === row.staff_id);
          const count = row.tasks.filter((task) => task.completed).length;
          const complete = !!row.tasks.length && count === row.tasks.length;
          return (
            <section key={row.group_number} role="listitem" className={`tds-card monthly-group${show === null ? "" : rolling ? " is-rolling" : " is-won"}`} aria-label={`${row.group_number}조 ${row.staff_name}`}>
              <ListHeader
                level={3}
                title={rolling && names.length ? names[(show! * 3 + index * 2) % names.length].name : row.staff_name}
                tail={<span className={complete ? "is-complete" : "is-count"}>{complete ? "완료" : `${count} / ${row.tasks.length}`}</span>}
              />
              {row.tasks.map((task) => {
                const detail = task.completed
                  ? `${dateTime(task.completed_at)} · ${task.completed_by_name ?? ""}`
                  : data.draw
                    ? "미완료"
                    : "배정 전";
                const saving = task.id !== undefined && pending.includes(task.id);
                return (
                  <label key={task.id ?? task.newspaper} className="check-row" title={detail}>
                    <span>{task.newspaper}</span>
                    <input
                      type="checkbox"
                      className="tds-check"
                      checked={!!task.completed}
                      disabled={!editable}
                      aria-busy={saving || undefined}
                      aria-disabled={saving || undefined}
                      aria-label={`${row.staff_name} ${task.newspaper} 과월호 완료 · ${detail}`}
                      onChange={() => {
                        if (task.id !== undefined) void toggle(task.id, !task.completed);
                      }}
                    />
                  </label>
                );
              })}
            </section>
          );
        })}
      </div>
      <p className="monthly-note">정리를 마친 신문을 누르면 체크돼요.</p>
      {editing && (
        <ArchiveEditor
          data={editing}
          onClose={() => setEditing(null)}
          onSaved={resource.refresh}
        />
      )}
    </div>
  );
}
function ArchiveEditor({
  data,
  onClose,
  onSaved,
}: {
  data: ArchiveData;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const notice = useNotice();
  const people = new Map(
    data.participants.map((person) => [person.id, person]),
  );
  for (const row of data.assignments)
    if (row.staff_id !== null && !people.has(row.staff_id))
      people.set(row.staff_id, {
        id: row.staff_id,
        name: `${row.staff_name} (비활성)`,
      });
  const expected = data.draw
    ? data.assignments.map((row) => row.staff_id)
    : null;
  return (
    <Modal title="과월호 담당자 입력" onClose={onClose}>
      <Form
        onClose={onClose}
        submit="담당자 저장"
        onSave={async (form) => {
          const ids = data.groups.map((_, i) => numeric(form, `person-${i}`));
          if (new Set(ids).size !== 7)
            throw new Error(
              "담당자가 겹쳐요. 7명을 한 번씩 선택해 주세요.",
            );
          await api("/archive/assignments", "PUT", {
            month: data.month,
            staff_ids: ids,
            expected,
          });
          onClose();
          await onSaved();
          notice("담당자를 저장했어요. 완료 기록은 그대로예요.");
        }}
      >
        <p className="hint">
          {data.month} · 담당자를 겹치지 않게 선택해 주세요. 완료 기록은
          그대로 남아요.
        </p>
        {data.groups.map((papers, i) => (
          <label key={i} className="field">
            {i + 1}조 · {papers.join(" · ")}
            <select
              name={`person-${i}`}
              required
              aria-label={`${i + 1}번 담당자`}
              defaultValue={expected?.[i] ?? ""}
            >
              <option value="">담당자 선택</option>
              {[...people.values()].map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </Form>
    </Modal>
  );
}
