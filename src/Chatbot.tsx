import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError, message } from "./api";
import type { ChatAnswer, QuestionRecord } from "./types";
import { Action, Icon } from "./ui";
import { Badge } from "./tds";
import avatar from "../static/chatbot.png";

export interface Turn {
  question: string;
  answer: ChatAnswer;
  flagged?: boolean;
}

// api.ts는 5xx 메시지를 버리므로 상태 코드로 문구를 정한다
export function chatError(error: unknown) {
  if (error instanceof ApiError && error.status === 503) return "챗봇이 아직 설정되지 않았어요. 관리자에게 알려 주세요.";
  if (error instanceof ApiError && error.status === 502) return "답을 받지 못했어요. 잠시 후 다시 물어봐 주세요.";
  return message(error);
}

// 떠 있는 버튼 + 패널. Workspace에 계속 붙어 있어 탭을 바꾸거나 패널을 닫아도 대화가 남는다.
export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fab = useRef<HTMLButtonElement>(null);
  async function ask() {
    const question = draft.trim();
    if (!question || busy) return;
    setBusy(true);
    setError("");
    try {
      const answer = await api<ChatAnswer>("/regulations/questions", "POST", { question });
      setTurns((old) => [...old, { question, answer }]);
      setDraft("");
    } catch (error) {
      setError(chatError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        ref={fab}
        type="button"
        className="inquiry-fab is-chatbot"
        aria-label="전화 응대 도우미"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="phone" />
      </button>
      {open && (
        <ChatPanel
          turns={turns}
          draft={draft}
          setDraft={setDraft}
          busy={busy}
          error={error}
          onAsk={() => void ask()}
          onFlagged={(id, flagged) =>
            setTurns((old) => old.map((turn) => (turn.answer.id === id ? { ...turn, flagged } : turn)))
          }
          onClose={() => {
            setOpen(false);
            fab.current?.focus();
          }}
        />
      )}
    </>
  );
}

export function ChatPanel({ turns, draft, setDraft, busy, error, onAsk, onFlagged, onClose }: {
  turns: Turn[];
  draft: string;
  setDraft: (text: string) => void;
  busy: boolean;
  error: string;
  onAsk: () => void;
  onFlagged: (id: number, flagged: boolean) => void;
  onClose: () => void;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  // 열 때와 답을 받은 뒤 입력란으로 돌아온다
  useEffect(() => {
    if (!busy) area.current?.focus();
  }, [busy]);
  useEffect(() => {
    log.current?.scrollTo?.({ top: log.current.scrollHeight });
  }, [turns.length, busy]);
  return (
    <aside
      className="chatbot"
      role="dialog"
      aria-label="전화 응대 도우미"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="dialog-head">
        <h2>전화 응대 도우미</h2>
        <button type="button" onClick={onClose} aria-label="닫기">
          ×
        </button>
      </div>
      <div className="chatbot-log" ref={log} aria-live="polite">
        <Bot>
          <p className="chat-bubble chatbot-answer">{GREETING}</p>
        </Bot>
        {turns.map((turn) => (
          <AnswerCard key={turn.answer.id} turn={turn} onFlagged={(flagged) => onFlagged(turn.answer.id, flagged)} />
        ))}
        {busy && (
          <Bot>
            <p className="chat-bubble chatbot-thinking" role="status">
              생각하는 중
              <span className="chatbot-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </p>
          </Bot>
        )}
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <form
        className="chatbot-form"
        onSubmit={(event) => {
          event.preventDefault();
          onAsk();
        }}
      >
        <label className="sr-only" htmlFor="chatbot-question">이용자 질문</label>
        <textarea
          id="chatbot-question"
          ref={area}
          value={draft}
          maxLength={500}
          required
          rows={2}
          disabled={busy}
          placeholder="예) 상호대차는 어디로 문의해?"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // 한글 조합 중 Enter는 글자 확정이다
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }}
        />
        <button type="submit" className="chatbot-send" aria-label="보내기" disabled={busy || !draft.trim()}>
          <SendIcon />
        </button>
      </form>
    </aside>
  );
}

export function AnswerCard({ turn, onFlagged }: { turn: Turn; onFlagged: (flagged: boolean) => void }) {
  const { question, answer, flagged } = turn;
  const [writing, setWriting] = useState(false);
  const path = `/regulations/questions/${answer.id}`;
  return (
    <article className="chatbot-turn">
      <p className="chat-bubble is-mine">{question}</p>
      <Bot>
      <div className="chat-bubble chatbot-answer">
        {answer.outcome !== "answered" && <Badge color="grey">규정에 없음</Badge>}
        <AnswerBody text={answer.answer} />
        {answer.extensions.map((extension) => (
          <p key={extension.number} className="chatbot-ext">
            <Icon name="phone" />
            연결: <strong>{extension.number}</strong> {extension.place}
          </p>
        ))}
        {answer.sections.length > 0 && <small className="chatbot-src">근거: {answer.sections.join(", ")}</small>}
      </div>
      {answer.warn && (
        <p className="chatbot-warn">오늘 이 계정으로 {answer.today_count}번 물어봤어요. 평소보다 많아요.</p>
      )}
      {flagged ? (
        <p className="chatbot-flag">
          알려 줘서 고마워요. 관리자가 확인할게요.{" "}
          <Action
            className="text-btn"
            run={async () => {
              await api<QuestionRecord>(path, "PATCH", { flagged: false });
              onFlagged(false);
            }}
          >
            표시 취소
          </Action>
        </p>
      ) : writing ? (
        <FlagNote
          onCancel={() => setWriting(false)}
          onSend={async (note) => {
            await api<QuestionRecord>(path, "PATCH", { flagged: true, note });
            setWriting(false);
            onFlagged(true);
          }}
        />
      ) : (
        <button type="button" className="text-btn chatbot-flag-btn" onClick={() => setWriting(true)}>
          문제가 있어요
        </button>
      )}
      </Bot>
    </article>
  );
}

export const GREETING = "전화 응대를 도와드릴게요. 궁금한 걸 물어보면 규정에 맞춰 답해 드려요.";

// 챗봇 쪽 말풍선: 왼쪽 프로필 + 이름 + 내용
function Bot({ children }: { children: ReactNode }) {
  return (
    <div className="chatbot-bot">
      <img className="chatbot-avatar" src={avatar} alt="" width={36} height={36} />
      <div className="chatbot-bot-body">
        <span className="chatbot-name">응대 도우미</span>
        {children}
      </div>
    </div>
  );
}

// 피그마 icon-paper-plane-mono (연속간행물실 대시보드 55139:3969)
function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        transform="translate(1.597 1.37)"
        fill="currentColor"
        stroke="none"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M18.5919 0.0817929L1.05587 5.92879C-0.149126 6.33079 -0.381126 7.93779 0.663874 8.66279L5.49287 12.0238C6.10687 12.4508 6.93887 12.3768 7.46787 11.8478L11.1779 8.13779C11.5399 7.77579 12.1279 7.77479 12.4899 8.13779C12.8519 8.49979 12.8529 9.08779 12.4899 9.44979L8.78087 13.1588C8.25087 13.6878 8.17587 14.5208 8.60387 15.1348L11.9639 19.9658C12.6899 21.0098 14.2969 20.7788 14.6979 19.5718L20.5469 2.03579C20.9509 0.827793 19.8009 -0.320207 18.5919 0.0817929Z"
      />
    </svg>
  );
}

// 서버 답은 "요약 한 줄\n- 제목: 내용\n- …" 형식이다. 예전 문장형 답은 요약 한 줄로만 보인다.
export function AnswerBody({ text }: { text: string }) {
  const [head, ...rest] = text.split("\n");
  const points = rest.map((line) => line.replace(/^-\s*/, "").trim()).filter(Boolean);
  return (
    <>
      <p className="answer-summary">{head}</p>
      {points.length > 0 && (
        <ul className="answer-points">
          {points.map((point, i) => {
            const at = point.indexOf(": ");
            return (
              <li key={i}>
                {at > 0 ? (
                  <>
                    <b>{point.slice(0, at)}</b> {point.slice(at + 2)}
                  </>
                ) : (
                  point
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export function FlagNote({ onSend, onCancel }: { onSend: (note: string) => Promise<void>; onCancel: () => void }) {
  const [note, setNote] = useState("");
  return (
    <div className="chatbot-note">
      <textarea
        aria-label="문제 메모"
        value={note}
        maxLength={500}
        rows={2}
        autoFocus
        placeholder="무엇이 틀렸는지 적어 주세요"
        onChange={(event) => setNote(event.target.value)}
      />
      <div>
        <button type="button" className="btn small" onClick={onCancel}>
          취소
        </button>
        <Action className="btn small primary" run={() => onSend(note)}>
          보내기
        </Action>
      </div>
    </div>
  );
}
