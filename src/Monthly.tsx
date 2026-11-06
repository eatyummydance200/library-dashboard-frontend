import { useState } from "react";
import { useResource } from "./api";
import type { ArchiveData, CleaningRecord, TaggingData, User } from "./types";
import { today } from "./dates";
import Archive from "./Archive";
import Tagging from "./Tagging";
import Cleaning, { cleaningNames } from "./Cleaning";
import "./screens.css";

const tabs = [
  ["archive", "과월호"],
  ["tagging", "태깅"],
  ["cleaning", "청소"],
] as const;
type Tab = (typeof tabs)[number][0];

export function archiveProgress(data: ArchiveData) {
  // 추첨 전이면 그룹 신문사 전체가 미완료 (Archive.tsx와 같은 기준)
  if (!data.draw) return { done: 0, total: data.groups.flat().length };
  const tasks = data.assignments.flatMap((row) => row.tasks);
  return {
    done: tasks.filter((task) => task.completed).length,
    total: tasks.length,
  };
}
export function taggingProgress(data: TaggingData, month: number) {
  const active = data.staff.filter((person) => person.active);
  const completed = new Set(
    data.tags
      .filter((tag) => tag.month === month && tag.completed)
      .map((tag) => tag.staff_id),
  );
  return {
    done: active.filter((person) => completed.has(person.id)).length,
    total: active.length,
  };
}

export function MonthlySummary({
  month,
  archive,
  tagging,
  cleaning,
  onOpen,
  active,
}: {
  month: string;
  archive?: ArchiveData;
  tagging?: TaggingData;
  cleaning?: CleaningRecord[];
  onOpen: (tab: Tab) => void;
  active?: Tab;
}) {
  const a = archive && archiveProgress(archive);
  const t = tagging && taggingProgress(tagging, Number(month.slice(5)));
  // [탭, 이름, 요약, 진행률(0~1, 없으면 막대 없음)]
  const cards: [Tab, string, string, number | undefined][] = [
    ["archive", "과월호 진행", a ? `${a.done} / ${a.total} 완료` : "…", a && a.total ? a.done / a.total : undefined],
    ["tagging", "태깅 진행", t ? `${t.done} / ${t.total}명 완료` : "…", t && t.total ? t.done / t.total : undefined],
    [
      "cleaning",
      "청소 담당",
      cleaning
        ? cleaningNames(cleaning.find((item) => item.month === month))
        : "…",
      undefined,
    ],
  ];
  return (
    <div className="monthly-summary" role="tablist" aria-label={`${month} 월간 업무`}>
      {cards.map(([key, label, text, ratio]) => (
        <button
          key={key}
          role="tab"
          aria-selected={active === key}
          className={`card monthly-card${active === key ? " active" : ""}`}
          onClick={() => onOpen(key)}
        >
          <span>{label}</span>
          <strong>{text}</strong>
          {ratio !== undefined && (
            <i className="mini-bar" aria-hidden="true">
              <i style={{ width: `${Math.round(ratio * 100)}%` }} />
            </i>
          )}
        </button>
      ))}
    </div>
  );
}

export default function Monthly({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>("archive");
  const month = today().slice(0, 7);
  const archive = useResource<ArchiveData>(`/archive?month=${month}`);
  const tagging = useResource<TaggingData>(`/tagging?year=${month.slice(0, 4)}`);
  const cleaning = useResource<CleaningRecord[]>("/cleaning");
  function open(next: Tab) {
    setTab(next);
    // 하위 탭에서 바꾼 내용을 요약에 반영
    void archive.refresh();
    void tagging.refresh();
    void cleaning.refresh();
  }
  return (
    <section className="view" aria-label="월간 업무">
      <h2 className="sr-only">이번 달 요약</h2>
      <MonthlySummary
        month={month}
        archive={archive.data}
        tagging={tagging.data}
        cleaning={cleaning.data}
        onOpen={open}
        active={tab}
      />
      <div role="tabpanel" aria-label={tabs.find(([key]) => key === tab)![1]}>
        {tab === "archive" && <Archive user={user} />}
        {tab === "tagging" && <Tagging user={user} onChanged={tagging.refresh} />}
        {tab === "cleaning" && <Cleaning user={user} records={cleaning} />}
      </div>
    </section>
  );
}
