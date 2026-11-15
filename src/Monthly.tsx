import { useState } from "react";
import { useResource } from "./api";
import type { CleaningRecord, User } from "./types";
import { addMonths, today } from "./dates";
import { PageTop, Tabs } from "./tds";
import { Stepper, useMobile } from "./ui";
import Archive from "./Archive";
import Tagging from "./Tagging";
import Cleaning from "./Cleaning";
import "./screens.css";

const tabs = [
  { key: "archive", label: "과월호" },
  { key: "tagging", label: "태깅" },
  { key: "cleaning", label: "청소" },
] as const;
type Tab = (typeof tabs)[number]["key"];

// 기준 월은 여기 하나. 하위 탭이 저장 중(locked)이면 달을 못 바꾼다.
export default function Monthly({ user }: { user: User }) {
  const mobile = useMobile();
  const [tab, setTab] = useState<Tab>("archive");
  const [month, setMonth] = useState(today().slice(0, 7));
  const [locked, setLocked] = useState(false);
  const cleaning = useResource<CleaningRecord[]>("/cleaning");
  const label = `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`;
  const stepper = (
    <Stepper
      label={label}
      prev="이전 달"
      next="다음 달"
      onMove={(offset) => setMonth(addMonths(month, offset))}
      canPrev={month > "2000-01" && !locked}
      canNext={month < "2100-12" && !locked}
    />
  );
  const props = { user, month, onLock: setLocked };
  return (
    <section className="view monthly-view" aria-label="월간 업무">
      {mobile ? (
        <PageTop upper={stepper} title="월간 업무" />
      ) : (
        <PageTop
          title={`${Number(month.slice(5))}월 월간 업무`}
          lower="과월호 정리, 태깅, 청소 담당을 한곳에서 확인해요"
          actions={stepper}
        />
      )}
      <Tabs label="월간 업무 종류" items={tabs} value={tab} onChange={setTab} />
      <div role="tabpanel" aria-label={tabs.find((item) => item.key === tab)!.label}>
        {tab === "archive" && <Archive {...props} />}
        {tab === "tagging" && <Tagging {...props} />}
        {tab === "cleaning" && <Cleaning {...props} records={cleaning} />}
      </div>
    </section>
  );
}
