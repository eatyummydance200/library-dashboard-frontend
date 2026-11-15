import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const originalFetch = globalThis.fetch;
try {
  const { default: App } = await server.ssrLoadModule("/src/App.tsx");
  const html = renderToStaticMarkup(createElement(App));
  assert.match(html, /name="username"/);
  assert.match(html, /name="password"/);
  assert.doesNotMatch(html, /서버 연결|다시 시도|role="alert"|disabled|불러오는 중/);
  assert.match(html, /type="password"/);
  assert.match(html, /aria-label="비밀번호 보기"/);

  // 모바일 "전체" 화면: 보기 전용 계정은 인적관리·비밀번호 변경·문의가 없다
  const { default: More } = await server.ssrLoadModule("/src/More.tsx");
  const more = (role) => renderToStaticMarkup(createElement(More, {
    user: { id: 1, username: "serial", role }, open() {}, dialog() {}, logout: async () => {},
  }));
  for (const text of ["인적관리", "매뉴얼", "비밀번호 변경", "개발자에게 문의", "로그아웃", "공용 계정"])
    assert.match(more("worker"), new RegExp(text));
  const viewer = more("viewer");
  assert.match(viewer, /매뉴얼/);
  assert.match(viewer, /로그아웃/);
  assert.doesNotMatch(viewer, /인적관리|비밀번호 변경|개발자에게 문의/);

  const { api, ApiError } = await server.ssrLoadModule("/src/api.ts");
  for (const body of ["Bad Gateway", JSON.stringify({ error: { code: "DNS_HOSTNAME_NOT_FOUND" } })]) {
    globalThis.fetch = async () => new Response(body, { status: 502 });
    await assert.rejects(api("/me"), (error) =>
      error instanceof ApiError && error.status === 502 && error.message.includes("서버에 연결할 수 없습니다"));
  }
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(api("/me"), /서버에 연결할 수 없습니다/);
  const signal = AbortSignal.abort(new DOMException("Timed out", "TimeoutError"));
  globalThis.fetch = async () => { throw signal.reason; };
  await assert.rejects(api("/me", "GET", undefined, signal), /서버에 연결할 수 없습니다/);

  const abort = AbortSignal.abort();
  globalThis.fetch = async () => { throw abort.reason; };
  await assert.rejects(api("/me", "GET", undefined, abort), (error) => error === abort.reason);

  globalThis.fetch = async () => new Response(JSON.stringify({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }), { status: 401 });
  await assert.rejects(api("/auth/login", "POST", {}), (error) => error.status === 401 && error.message === "아이디 또는 비밀번호가 올바르지 않습니다.");
  globalThis.fetch = async () => new Response(JSON.stringify({ user: { username: "test" }, csrf: "test-token" }));
  assert.equal((await api("/me")).user.username, "test");
  console.log("PASS: initial login markup, more screen by role, gateway/network/timeout errors, cancellation, login rejection, successful session response");
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
