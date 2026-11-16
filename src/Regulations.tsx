import { useState } from "react";
import { api, useResource } from "./api";
import type { QuestionLog, QuestionRecord, User } from "./types";
import { Action, Loading } from "./ui";
import { Badge, Card, Chips, ListRow, PageTop, Tabs } from "./tds";
import { dateTime } from "./dates";
import Manual from "./Manual";
import "./screens.css";
import type { DocConfig } from "./Manual";

export const REGULATIONS: DocConfig = {
  path: "/regulations",
  name: "규정",
  hash: "regulations",
  title: "도서관 이용 규정",
  lower: "전화 응대에 쓰는 이용 규정과 내선번호를 장별로 정리했어요",
  example: "휴학생 대출",
  shortcuts: [
    ["내선번호 찾기", "0"],
    ["이용자별 안내", "3"],
    ["외부이용자", "4"],
    ["대출·반납", "5"],
    ["운영시간", "7"],
  ],
  images: false,
};

const tabs = [
  { key: "doc", label: "규정 문서" },
  { key: "log", label: "질문 기록" },
] as const;
const filters = [
  { key: "flagged", label: "문제 표시" },
  { key: "not_found", label: "규정에 없음" },
  { key: "all", label: "전체" },
] as const;

// 관리자만 질문 기록 탭이 있다. 다른 역할은 문서만 본다.
export default function Regulations({ user }: { user: User }) {
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("doc");
  if (user.role !== "admin") return <Manual user={user} doc={REGULATIONS} />;
  return (
    <section className="view regulations-view" aria-label="규정">
      <Tabs label="규정 보기" items={tabs} value={tab} onChange={setTab} />
      <div role="tabpanel" aria-label={tabs.find((item) => item.key === tab)!.label}>
        {tab === "doc" ? <Manual user={user} doc={REGULATIONS} /> : <QuestionLogView />}
      </div>
    </section>
  );
}

export function summaryLine({ today_count, month_count, month_cost_usd }: QuestionLog["summary"]) {
  return `오늘 ${today_count}건 · 이번 달 ${month_count}건 · 약 $${Number(month_cost_usd.toFixed(4))}`;
}

function QuestionLogView() {
  const [filter, setFilter] = useState<(typeof filters)[number]["key"]>("flagged");
  const log = useResource<QuestionLog>(`/regulations/questions?filter=${filter}`);
  return (
    <div className="qlog">
      <PageTop title="질문 기록" lower={log.data && summaryLine(log.data.summary)} />
      <Card label="질문 목록">
        <div className="qlog-filters">
          <Chips label="질문 기록 보기" items={filters} value={filter} onChange={setFilter} />
        </div>
        {!log.data ? (
          <Loading error={log.error} retry={log.refresh} />
        ) : log.data.items.length ? (
          <ul className="qlog-list">
            {log.data.items.map((item) => (
              <li key={item.id}>
                <QuestionRow item={item} refresh={log.refresh} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="resource-state">표시된 질문이 없어요.</p>
        )}
      </Card>
    </div>
  );
}

export function QuestionRow({ item, refresh }: { item: QuestionRecord; refresh: () => Promise<void> }) {
  return (
    <ListRow
      muted={!!item.resolved_at}
      title={
        <>
          {item.question}{" "}
          {item.outcome !== "answered" && <Badge color="grey">규정에 없음</Badge>}{" "}
          {item.flagged_at && <Badge color="red">문제 표시</Badge>}
        </>
      }
      sub={<span className="qlog-answer">{item.answer}</span>}
      sub2={
        <>
          <span className="qlog-line">{dateTime(item.created_at)} · {item.username}</span>
          {item.sections.length > 0 && <span className="qlog-line">근거: {item.sections.join(", ")}</span>}
          {item.extensions.length > 0 && (
            <span className="qlog-line">
              내선: {item.extensions.map((extension) => `${extension.number} ${extension.place}`).join(", ")}
            </span>
          )}
          {item.flag_note && <span className="qlog-line">메모: {item.flag_note}</span>}
        </>
      }
      right={
        <Action
          className="btn small"
          run={async () => {
            await api<QuestionRecord>(`/regulations/questions/${item.id}`, "PATCH", { resolved: !item.resolved_at });
            await refresh();
          }}
        >
          {item.resolved_at ? "다시 열기" : "보완 완료"}
        </Action>
      }
    />
  );
}
