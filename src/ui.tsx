import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import type { FormEvent, ReactNode } from "react";
import icons from "./icons.json";
import { message } from "./api";

// 모바일/웹 분기 기준. CSS도 같은 값(max-width: 899px)을 쓴다.
export const MOBILE_QUERY = "(max-width: 899px)";
function subscribeMobile(onChange: () => void) {
  const media = window.matchMedia(MOBILE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
// SSR(check 스크립트)에서는 false라 웹 화면이 렌더된다.
export function useMobile() {
  return useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}

export const NoticeContext = createContext<(value: string) => void>(() => {});
export const useNotice = () => useContext(NoticeContext);
// 상단 바 오른쪽의 "관리" 자리. 화면이 AdminMenu를 그리면 여기로 옮겨진다(없으면 제자리).
export const AdminSlot = createContext<HTMLElement | null>(null);
// details 기반 드롭다운. 바깥 클릭·Esc로 닫히고, 안의 버튼을 누르면 닫힌다(data-stay 안쪽은 제외).
export function Menu({ summary, label, className = "", children }: {
  summary: ReactNode;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: Event) => {
      const element = menu.current;
      if (!element?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        element.open = false;
        element.querySelector("summary")?.focus();
      } else if (!element.contains(event.target as Node)) element.open = false;
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  return (
    <details ref={menu} className={`menu ${className}`}>
      <summary aria-label={label}>{summary}</summary>
      <div
        className="menu-list"
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("button") && !target.closest("[data-stay]") && menu.current) menu.current.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}
export function AdminMenu({ children }: { children: ReactNode }) {
  const slot = useContext(AdminSlot);
  const menu = (
    <Menu className="admin-menu" label="관리 메뉴" summary={<>관리<Icon name="chevron" /></>}>
      {children}
    </Menu>
  );
  return slot ? createPortal(menu, slot) : menu;
}
export function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icons[name] }}
    />
  );
}
export function Loading({
  error,
  retry,
}: {
  error?: string;
  retry: () => void;
}) {
  return (
    <div className="resource-state" role={error ? "alert" : "status"}>
      {error || "불러오는 중…"}
      {error && (
        <button className="btn" onClick={retry}>
          다시 시도
        </button>
      )}
    </div>
  );
}
export function ResourceError({
  error,
  retry,
}: {
  error?: string;
  retry: () => void;
}) {
  return error ? (
    <p className="inline-error" role="alert">
      {error}{" "}
      <button className="text-btn" onClick={retry}>
        다시 시도
      </button>
    </p>
  ) : null;
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={id}
      onCancel={onClose}
    >
      <div className="dialog-head">
        <h2 id={id}>{title}</h2>
        <button type="button" onClick={onClose} aria-label="닫기">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Form({
  children,
  onSave,
  onClose,
  submit = "저장하기",
}: {
  children: ReactNode;
  onSave: (data: FormData) => Promise<void>;
  onClose: () => void;
  submit?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const data = new FormData(event.currentTarget);
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await onSave(data);
    } catch (error) {
      setError(message(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save}>
      <fieldset disabled={busy} aria-busy={busy}>
        {children}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="btn" type="button" onClick={onClose}>
            취소
          </button>
          <button className="btn primary" type="submit">
            {busy ? "저장 중…" : submit}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      {label}
      {children}
    </label>
  );
}
export const value = (data: FormData, key: string) =>
  String(data.get(key) ?? "");
export const numeric = (data: FormData, key: string) =>
  Number(value(data, key));
export function Action({
  children,
  run,
  className = "btn",
  disabled = false,
}: {
  children: ReactNode;
  run: () => Promise<void>;
  className?: string;
  disabled?: boolean;
}) {
  const notice = useNotice();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={disabled || busy}
      onClick={async () => {
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        try {
          await run();
        } catch (error) {
          notice(message(error));
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      {children}
    </button>
  );
}
// 드물게 쓰는 내용·관리 기능을 접어 두는 목록 줄. 닫혀 있어도 내용은 DOM에 있다.
export function Fold({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="card fold-card">
      <summary className="card-head">
        <h2>{title}</h2>
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}
// ‹ 2026년 11월 › 처럼 값 하나를 앞뒤로 넘기는 작은 컨트롤
export function Stepper({ label, prev, next, onMove, canPrev = true, canNext = true }: {
  label: string;
  prev: string;
  next: string;
  onMove: (offset: number) => void;
  canPrev?: boolean;
  canNext?: boolean;
}) {
  return (
    <div className="week-controls">
      <button type="button" className="icon-btn" aria-label={prev} disabled={!canPrev} onClick={() => onMove(-1)}>
        <Icon name="left" />
      </button>
      <strong aria-live="polite">{label}</strong>
      <button type="button" className="icon-btn" aria-label={next} disabled={!canNext} onClick={() => onMove(1)}>
        <Icon name="chevron" />
      </button>
    </div>
  );
}
