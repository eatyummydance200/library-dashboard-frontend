import { useEffect, useRef, useState } from "react";
import { api, message, setCsrf, useResource } from "./api";
import type { Issue, User } from "./types";
import logo from "../static/inu-logo.png";
import {
  Action,
  AdminSlot,
  Field,
  Form,
  Icon,
  Modal,
  NoticeContext,
  useMobile,
  value,
} from "./ui";
import Dashboard from "./Dashboard";
import Schedule from "./Schedule";
import People from "./People";
import Issues from "./Issues";
import Monthly from "./Monthly";
import Manual from "./Manual";
import InquiryDialog from "./Inquiries";

// [키, 탭 이름, 아이콘]. 웹은 탭 이름이 화면 제목 역할을 하고, 모바일은 하단 탭바에 아이콘을 쓴다.
const navigation = [
  ["dashboard", "홈", "home"],
  ["schedule", "시간표", "calendar"],
  ["people", "인적관리", "people"],
  ["issues", "이슈", "message"],
  ["monthly", "월간 업무", "archive"],
  ["manual", "매뉴얼", "book"],
] as const;
type View = (typeof navigation)[number][0];
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
      toast("세션이 만료되었습니다. 다시 로그인해주세요.");
    };
    window.addEventListener("session-expired", expired);
    return () => {
      controller.abort();
      window.removeEventListener("session-expired", expired);
      clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    document.body.classList.toggle("auth-page", !user);
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
function Login({ onLoginStart, onLogin }: {
  onLoginStart: () => void;
  onLogin: (session: Session) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  return (
    <main className="auth-card">
      <img className="auth-logo" src={logo} alt="인천대학교 INU 워드마크" />
      <p className="auth-kicker">연속간행물실 근무 대시보드</p>
      <h1>반가워요!</h1>
      <form
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
          <label>
            아이디
            <input
              name="username"
              required
              maxLength={32}
              autoComplete="username"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="next"
              autoFocus
            />
          </label>
          <label>
            비밀번호
            <input
              name="password"
              type="password"
              required
              maxLength={128}
              autoComplete="current-password"
              enterKeyHint="go"
            />
          </label>
          <button className="btn primary auth-submit" type="submit">
            {busy ? "로그인 중…" : "로그인"}
          </button>
        </fieldset>
        {error && <p className="inline-error" role="alert">{error}</p>}
      </form>
      <p className="auth-note">계정 문의는 관리자에게 해 주세요.</p>
    </main>
  );
}
function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const manualHash = () => window.location.hash.startsWith("#manual");
  const [view, setView] = useState<View>(() => (manualHash() ? "manual" : "dashboard"));
  const [dialog, setDialog] = useState<"account" | "password" | "inquiry" | null>(null);
  const issues = useResource<Issue[]>("/issues");
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    document.body.dataset.page = view;
    if (view !== "manual" && manualHash())
      window.history.replaceState(null, "", window.location.pathname);
    // 탭을 바꾸면 새 화면의 맨 위부터 보여준다 (매뉴얼은 #manual/섹션으로 직접 스크롤)
    window.scrollTo?.(0, 0);
  }, [view]);
  useEffect(() => {
    const open = () => {
      if (manualHash()) setView("manual");
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
  const item = navigation.find((item) => item[0] === view)!;
  const open = issues.data?.filter((issue) => !issue.done).length;
  const mobile = useMobile();
  const badge = !!open && (
    <span className="count-badge" aria-label={`진행 중 ${open}건`}>{open}</span>
  );
  const account = (
    <button
      className="avatar account-avatar"
      aria-label={`내 계정 메뉴 (${user.username})`}
      onClick={() => setDialog("account")}
    >
      {user.username.slice(0, 1)}
    </button>
  );
  return (
    <div className="app">
      {mobile ? (
        <header className="appbar">
          <img className="appbar-logo" src={logo} width={539} height={301} alt="인천대학교" />
          <div className="appbar-title">
            <h1>{view === "dashboard" ? `${user.username}님, 안녕하세요` : item[1]}</h1>
          </div>
          <div className="admin-slot" ref={setSlot} />
          {account}
        </header>
      ) : (
        <header className="topbar">
          <img className="topbar-logo" src={logo} width={539} height={301} alt="인천대학교" />
          <nav className="tabs" aria-label="화면 이동">
            {navigation.map(([key, label]) => (
              <button
                key={key}
                className={view === key ? "active" : ""}
                aria-current={view === key ? "page" : undefined}
                onClick={() => setView(key)}
              >
                {label}
                {key === "issues" && badge}
              </button>
            ))}
          </nav>
          <div className="admin-slot" ref={setSlot} />
          {account}
        </header>
      )}
      <main className="main">
        {!mobile && <h1 className="sr-only">{item[1]}</h1>}
        <AdminSlot.Provider value={slot}>
        {view === "dashboard" && (
          <Dashboard
            user={user}
            issues={issues}
            showIssues={() => setView("issues")}
          />
        )}
        {view === "schedule" && (
          <Schedule user={user} />
        )}
        {view === "people" && <People user={user} />}
        {view === "issues" && <Issues resource={issues} user={user} />}
        {view === "monthly" && <Monthly user={user} />}
        {view === "manual" && <Manual user={user} />}
        </AdminSlot.Provider>
      </main>
      {mobile && (
        <nav className="tabbar" aria-label="화면 이동">
          {navigation.map(([key, label, icon]) => (
            <button
              key={key}
              className={view === key ? "active" : ""}
              aria-current={view === key ? "page" : undefined}
              onClick={() => setView(key)}
            >
              <span className="tab-icon">
                <Icon name={icon} />
                {key === "issues" && badge}
              </span>
              <span className="tab-label">{label}</span>
            </button>
          ))}
        </nav>
      )}
      {dialog === "account" && (
        <Modal title="내 계정" onClose={() => setDialog(null)}>
          <div className="account-summary">
            <span className="avatar">{user.username.slice(0, 1)}</span>
            <div>
              <strong>{user.username}</strong>
              <span>{user.role === "admin" ? "관리자" : "근무자"} 계정</span>
            </div>
          </div>
          <div className="form-actions">
            <button className="btn" onClick={() => setDialog("password")}>
              비밀번호 변경
            </button>
            <Action
              className="btn primary"
              run={async () => {
                await api("/logout", "POST", {});
                onLogout();
              }}
            >
              로그아웃
            </Action>
          </div>
        </Modal>
      )}
      <button className="inquiry-fab" aria-label="개발자에게 문의" onClick={() => setDialog("inquiry")}>
        <Icon name="message" />
        문의
      </button>
      {dialog === "inquiry" && <InquiryDialog onClose={() => setDialog(null)} />}
      {dialog === "password" && (
        <Modal title="비밀번호 변경" onClose={() => setDialog(null)}>
          <Form
            onClose={() => setDialog(null)}
            onSave={async (data) => {
              if (value(data, "password") !== value(data, "confirm"))
                throw new Error("새 비밀번호가 일치하지 않습니다.");
              await api("/password", "POST", {
                current: value(data, "current"),
                password: value(data, "password"),
              });
              onLogout();
            }}
          >
            <Field label="현재 비밀번호">
              <input
                name="current"
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
              />
            </Field>
            <Field label="새 비밀번호 (10자 이상)">
              <input
                name="password"
                type="password"
                required
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
              />
            </Field>
            <Field label="새 비밀번호 확인">
              <input
                name="confirm"
                type="password"
                required
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
              />
            </Field>
            <p className="hint">
              바꾸고 나면 모든 기기에서 다시 로그인해야 해요.
            </p>
          </Form>
        </Modal>
      )}
    </div>
  );
}
