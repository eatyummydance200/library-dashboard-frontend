import { useCallback, useEffect, useRef, useState } from "react";

export const base = "/library-dashboard";
let csrf = "";
// GET 응답 캐시. 화면은 캐시로 바로 그리고 useResource가 뒤에서 다시 받아온다.
const cache = new Map<string, unknown>();
export function setCsrf(value: string) {
  csrf = value;
  cache.clear(); // 세션이 바뀌면 이전 계정 데이터를 보여주지 않는다
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
const pendingWrites = new Set<Promise<unknown>>();
export function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const request = send();
  if (method !== "GET") {
    pendingWrites.add(request);
    void request.then(
      () => pendingWrites.delete(request),
      () => pendingWrites.delete(request),
    );
  }
  return request;
  async function send(): Promise<T> {
    // Read after our pending saves so navigation cannot restore an older checkbox state.
    if (method === "GET") await Promise.allSettled([...pendingWrites]);
    const headers: Record<string, string> = { Accept: "application/json" };
    const form = body instanceof FormData;
    if (body !== undefined && !form) headers["Content-Type"] = "application/json";
    if (method !== "GET") headers["X-CSRF-Token"] = csrf;
    const connectionError = "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.";
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers,
      body: body === undefined || form ? (body as FormData | undefined) : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-cache", // 브라우저 캐시를 ETag로 재검증해 안 바뀐 응답은 304로 받는다
      signal,
    }).catch((error) => {
      if (signal?.aborted && signal.reason?.name !== "TimeoutError") throw error;
      throw new ApiError(connectionError, 0);
    });
    const data = await response
      .json()
      .catch(() => ({ error: "서버 응답을 확인하지 못했습니다." }));
    if (!response.ok) {
      if (
        response.status === 401 &&
        !path.startsWith("/auth/") &&
        path !== "/me"
      ) {
        window.dispatchEvent(new Event("session-expired"));
      }
      throw new ApiError(
        response.status >= 500
          ? connectionError
          : typeof data?.error === "string" && data.error
            ? data.error
            : "요청을 처리하지 못했습니다.",
        response.status,
      );
    }
    return data as T;
  }
}

// multipart 업로드. 브라우저가 boundary를 붙이도록 Content-Type은 비워 둔다.
export function upload<T>(path: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return api<T>(path, "POST", form);
}

export function useResource<T>(path: string) {
  const [state, setState] = useState<{
    path: string;
    data?: T;
    error?: string;
  }>({ path });
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    try {
      const data = await api<T>(path, "GET", undefined, request.signal);
      if (!request.signal.aborted) {
        cache.set(path, data);
        setState({ path, data });
      }
    } catch (error) {
      if (!request.signal.aborted)
        setState((old) => ({
          path,
          data: old.path === path ? old.data : undefined,
          error: message(error),
        }));
    }
  }, [path]);
  useEffect(() => {
    void refresh();
    return () => controller.current?.abort();
  }, [refresh]);
  const update = useCallback(
    (change: (data: T) => T) => {
      controller.current?.abort();
      setState((old) => {
        const current = (old.path === path ? old.data : undefined) ?? (cache.get(path) as T | undefined);
        if (current === undefined) return old;
        const data = change(current);
        cache.set(path, data);
        return { path, data };
      });
    },
    [path],
  );
  return {
    data: (state.path === path ? state.data : undefined) ?? (cache.get(path) as T | undefined),
    error: state.path === path ? state.error : undefined,
    refresh,
    update,
  };
}
export function message(error: unknown) {
  return error instanceof Error ? error.message : "연결을 확인해주세요.";
}
