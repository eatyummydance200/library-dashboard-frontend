import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api, message, setCsrf, useResource } from "./api";
import type { Issue, User } from "./types";
import type icons from "./icons.json";
import {
  AdminOutlet,
  AdminSlot,
  Field,
  Form,
  Icon,
  Modal,
  NoticeContext,
  useMobile,
  useNotice,
  value,
} from "./ui";
import Dashboard from "./Dashboard";
import Schedule from "./Schedule";
import People from "./People";
import Issues from "./Issues";
import Monthly from "./Monthly";
import Manual from "./Manual";
import Regulations from "./Regulations";
import Chatbot from "./Chatbot";
import More, { roleLabel } from "./More";
import InquiryDialog from "./Inquiries";

// [키, 이름, 아이콘]. 데스크톱 사이드 메뉴와 모바일 하단 탭이 같은 목록을 쓴다.
const primary = [
  ["dashboard", "홈", "home"],
  ["schedule", "시간표", "calendar"],
  ["issues", "이슈", "message"],
  ["monthly", "월간 업무", "archive"],
] as const;
// 사이드 메뉴 "더보기" 아래. 모바일은 "전체" 화면에서 들어간다.
const secondary = [
  ["people", "인적관리", "people"],
  ["manual", "매뉴얼", "book"],
  ["regulations", "규정", "phone"],
] as const;
export type View = (typeof primary)[number][0] | (typeof secondary)[number][0] | "more";
type IconName = keyof typeof icons;
export type Dialog = "account" | "password" | "inquiry";
interface Session {
  user: User;
  csrf: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const sessionCheck = useRef<AbortController | null>(null);
  const [notice, setNotice] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function toast(text: string) {
    clearTimeout(timer.current);
    setNotice(text);
    timer.current = setTimeout(() => setNotice(""), 3500);
  }
  useEffect(() => {
    const controller = new AbortController();
    sessionCheck.current = controller;
    void api<Session>("/me", "GET", undefined,
      AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]))
      .then((session) => {
        if (controller.signal.aborted) return;
        setCsrf(session.csrf);
        setUser(session.user);
      })
      // Session restoration is silent; login attempts show their own errors.
      .catch(() => {});
    const expired = () => {
      controller.abort();
      setUser(null);
      toast("세션이 만료됐어요. 다시 로그인해 주세요.");
    };
    window.addEventListener("session-expired", expired);
    return () => {
      controller.abort();
      window.removeEventListener("session-expired", expired);
      clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    document.body.classList.toggle("login-page", !user);
    const path = user ? "/library-dashboard" : "/login";
    if (window.location.pathname !== path) {
      // #manual/2-1 같은 섹션 링크는 로그인을 거쳐도 유지
      window.history.replaceState(null, "", path + window.location.hash);
    }
  }, [user]);
  return (
    <NoticeContext.Provider value={toast}>
      {user ? (
        <Workspace user={user} onLogout={() => setUser(null)} />
      ) : (
        <Login
          onLoginStart={() => sessionCheck.current?.abort()}
          onLogin={(session) => {
            setCsrf(session.csrf);
            setUser(session.user);
          }}
        />
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </NoticeContext.Provider>
  );
}

// 비밀번호 보기 토글용 눈 아이콘 (icons.json에 없어 여기 둔다)
function Eye({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M1.7 10S4.7 4.2 10 4.2 18.3 10 18.3 10 15.3 15.8 10 15.8 1.7 10 1.7 10Z" />
      <circle cx="10" cy="10" r="2.6" />
      {off && <path d="m3 3 14 14" />}
    </svg>
  );
}

function Login({ onLoginStart, onLogin }: {
  onLoginStart: () => void;
  onLogin: (session: Session) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const lock = useRef(false);
  return (
    <main className="login">
      <header className="login-top">
        <p className="login-kicker">연속간행물실 근무 대시보드</p>
        <h1>반가워요!<br />아이디로 로그인해 주세요</h1>
      </header>
      <form
        className="login-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (lock.current) return;
          onLoginStart();
          const data = new FormData(event.currentTarget);
          lock.current = true;
          setBusy(true);
          setError("");
          try {
            const token = await api<{ csrf: string }>("/auth/csrf", "GET", undefined, AbortSignal.timeout(10000));
            setCsrf(token.csrf);
            const session = await api<{ csrf: string }>("/auth/login", "POST", {
              username: value(data, "username"),
              password: value(data, "password"),
            });
            setCsrf(session.csrf);
            onLogin(await api<Session>("/me"));
          } catch (error) {
            setError(message(error));
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <label className="login-field">
            <span className="login-label">아이디</span>
            <input
              name="username"
              required
              maxLength={32}
              placeholder="아이디를 입력해 주세요"
              autoComplete="username"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="next"
              autoFocus
            />
          </label>
          <div className={`login-field${error ? " is-error" : ""}`}>
            <label className="login-label" htmlFor="login-password">비밀번호</label>
            <div className="login-box">
              <input
                id="login-password"
                name="password"
                type={show ? "text" : "password"}
                required
                maxLength={128}
                placeholder="비밀번호를 입력해 주세요"
                autoComplete="current-password"
                enterKeyHint="go"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "login-error" : undefined}
              />
              <button
                type="button"
                className="login-eye"
                aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}
                onClick={() => setShow(!show)}
              >
                <Eye off={!show} />
              </button>
            </div>
            {error && <p className="login-error" id="login-error" role="alert">{error}</p>}
          </div>
          <div className="login-bottom">
            <button className="btn primary xlarge" type="submit">
              {busy ? "로그인 중…" : "로그인"}
            </button>
            <p className="login-note">계정이 없다면 관리자에게 문의해 주세요.</p>
          </div>
        </fieldset>
      </form>
    </main>
  );
}

// 사이드 메뉴 한 줄: 30px 흰 아이콘 상자 + 이름 (+ 오른쪽 꼬리)
function NavRow({ icon, label, sub, tail, current, onClick, quiet, aria }: {
  icon: IconName;
  label: string;
  sub?: string;
  tail?: ReactNode;
  current?: boolean;
  onClick: () => void;
  quiet?: boolean;
  aria?: string;
}) {
  return (
    <button
      type="button"
      className={`side-row${current ? " is-current" : ""}${quiet ? " is-quiet" : ""}`}
      aria-current={current ? "page" : undefined}
      aria-label={aria}
      onClick={onClick}
    >
      <span className="side-icon"><Icon name={icon} /></span>
      <span className="side-text">
        <span className="side-label">{label}</span>
        {sub && <span className="side-sub">{sub}</span>}
      </span>
      {tail}
    </button>
  );
}

function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  // #manual/2-1, #regulations/5 같은 섹션 링크로 바로 연다
  const docHash = () => /^#(manual|regulations)(?:\/|$)/.exec(window.location.hash)?.[1] as "manual" | "regulations" | undefined;
  const [view, setView] = useState<View>(() => docHash() ?? "dashboard");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const issues = useResource<Issue[]>("/issues");
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const notice = useNotice();
  const mobile = useMobile();
  useEffect(() => {
    document.body.dataset.page = view;
    if (docHash() && docHash() !== view)
      window.history.replaceState(null, "", window.location.pathname);
    // 탭을 바꾸면 새 화면의 맨 위부터 보여준다 (매뉴얼은 #manual/섹션으로 직접 스크롤)
    window.scrollTo?.(0, 0);
  }, [view]);
  useEffect(() => {
    const open = () => {
      const target = docHash();
      if (target) setView(target);
    };
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) void issues.refresh();
    };
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [issues.refresh]);
  // 데스크톱에서 "전체" 화면은 없다 (사이드 메뉴가 대신한다)
  useEffect(() => {
    if (!mobile && view === "more") setView("dashboard");
  }, [mobile, view]);
  const viewer = user.role === "viewer";
  // 보기 전용 계정은 인적관리가 없다
  const more = viewer ? secondary.filter(([key]) => key !== "people") : secondary;
  const open = issues.data?.filter((issue) => !issue.done).length;
  const openLabel = open ? `진행 중 ${open}건` : undefined;
  const lock = useRef(false);
  async function logout() {
    if (lock.current) return;
    lock.current = true;
    try {
      await api("/logout", "POST", {});
      onLogout();
    } catch (error) {
      notice(message(error));
    } finally {
      lock.current = false;
    }
  }
  const inMore = view === "more" || view === "people" || view === "manual" || view === "regulations";
  return (
    <div className="shell">
      {!mobile && (
        <nav className="side" aria-label="화면 이동">
          <div className="side-brand">
            <span>인천대학교</span>
            <strong>연속간행물실</strong>
          </div>
          {primary.map(([key, label, icon]) => (
            <NavRow
              key={key}
              icon={icon}
              label={label}
              current={view === key}
              onClick={() => setView(key)}
              aria={key === "issues" && open ? `${label}, ${openLabel}` : undefined}
              tail={key === "issues" && !!open && <span className="side-badge" aria-hidden="true">{open}</span>}
            />
          ))}
          <p className="side-header">더보기</p>
          {more.map(([key, label, icon]) => (
            <NavRow key={key} icon={icon} label={label} current={view === key} onClick={() => setView(key)} />
          ))}
          <hr className="side-divider" />
          <NavRow
            icon="user"
            label={user.username}
            sub={roleLabel(user)}
            aria={`내 계정 (${user.username})`}
            onClick={() => setDialog("account")}
          />
        </nav>
      )}
      <main className="shell-main">
        {mobile && inMore && view !== "more" && (
          <button type="button" className="shell-back" aria-label="전체로 돌아가기" onClick={() => setView("more")}>
            <Icon name="left" />
          </button>
        )}
        <AdminOutlet.Provider value={setSlot}>
        <AdminSlot.Provider value={slot}>
          {view === "dashboard" && (
            <Dashboard user={user} issues={issues} showIssues={() => setView("issues")} />
          )}
          {view === "schedule" && <Schedule user={user} />}
          {view === "people" && !viewer && <People user={user} />}
          {view === "issues" && <Issues resource={issues} user={user} />}
          {view === "monthly" && <Monthly user={user} />}
          {view === "manual" && <Manual user={user} />}
          {view === "regulations" && <Regulations user={user} />}
          {view === "more" && (
            <More user={user} open={(key) => setView(key)} dialog={setDialog} logout={logout} />
          )}
        </AdminSlot.Provider>
        </AdminOutlet.Provider>
      </main>
      {mobile && (
        <nav className="tabbar" aria-label="화면 이동">
          {[...primary, ["more", "전체", "menu"] as const].map(([key, label, icon]) => {
            const current = key === "more" ? inMore : view === key;
            return (
              <button
                key={key}
                type="button"
                className={current ? "is-current" : ""}
                aria-current={current ? "page" : undefined}
                aria-label={key === "issues" && open ? `${label}, ${openLabel}` : undefined}
                onClick={() => setView(key)}
              >
                <span className="tab-icon">
                  <Icon name={icon} />
                  {key === "issues" && !!open && <i className="tab-dot" />}
                </span>
                <span className="tab-label">{label}</span>
              </button>
            );
          })}
        </nav>
      )}
      {dialog === "account" && (
        <Modal title="내 계정" onClose={() => setDialog(null)}>
          <div className="account-summary">
            <span className="side-icon"><Icon name="user" /></span>
            <div>
              <strong>{user.username}</strong>
              <span>{roleLabel(user)}</span>
            </div>
          </div>
          <div className="form-actions">
            {!viewer && (
              <button className="btn" onClick={() => setDialog("password")}>
                비밀번호 변경
              </button>
            )}
            <button className="btn primary" onClick={() => void logout()}>
              로그아웃
            </button>
          </div>
        </Modal>
      )}
      {!viewer && <Chatbot />}
      {!viewer && (
        <button type="button" className="inquiry-fab" aria-label="개발자에게 문의" onClick={() => setDialog("inquiry")}>
          <Icon name="headset" />
        </button>
      )}
      {dialog === "inquiry" && !viewer && <InquiryDialog onClose={() => setDialog(null)} />}
      {dialog === "password" && !viewer && (
        <Modal title="비밀번호 변경" onClose={() => setDialog(null)}>
          <Form
            submit="변경하기"
            onClose={() => setDialog(null)}
            onSave={async (data) => {
              if (value(data, "password") !== value(data, "confirm"))
                throw new Error("새 비밀번호가 서로 달라요.");
              await api("/password", "POST", {
                current: value(data, "current"),
                password: value(data, "password"),
              });
              onLogout();
            }}
          >
            <Field label="현재 비밀번호">
              <input name="current" type="password" required maxLength={128} autoComplete="current-password" />
            </Field>
            <Field label="새 비밀번호 (10자 이상)">
              <input name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" />
            </Field>
            <Field label="새 비밀번호 확인">
              <input name="confirm" type="password" required minLength={10} maxLength={128} autoComplete="new-password" />
            </Field>
            <p className="hint">바꾸고 나면 모든 기기에서 다시 로그인해야 해요.</p>
          </Form>
        </Modal>
      )}
    </div>
  );
}
