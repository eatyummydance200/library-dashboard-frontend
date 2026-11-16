export interface Staff {
  id: number;
  name: string;
  phone: string;
  active: number;
}
export interface Teacher {
  id: number;
  name: string;
  extension: string;
  phone: string;
  position: string;
  location: string;
}
export interface User {
  id: number;
  username: string;
  role: "admin" | "worker" | "viewer";
  staff_id: number | null;
}
export interface Account extends User {
  active: number;
}
export interface Shift {
  id: number;
  staff_id: number;
  day: string;
  start: number;
  end: number;
  role: "desk" | "general";
}
export interface Week {
  week: string;
  staff: Staff[];
  shifts: Shift[];
}
export interface OriginalWeek extends Week {
  saved: boolean;
}
export interface ConfirmedShift extends Omit<Shift, "day"> {
  weekday: number;
}
export interface ConfirmedTable {
  saved: boolean;
  staff: Staff[];
  shifts: ConfirmedShift[];
}
export interface WeeklyHours {
  staff_id: number;
  total_minutes: number;
  desk_minutes: number;
  opens: number;
  closes: number;
}
export interface Duty {
  teacher_id: number;
  teacher: string;
  extension: string;
  phone: string;
}
export interface Status {
  at: string;
  previous: Shift[];
  current: Shift[];
  next: Shift[];
  previous_at: string | null;
  next_at: string | null;
}
export interface Issue {
  id: number;
  day: string;
  end_day: string;
  category: string;
  title: string;
  body: string;
  author: string;
  author_id: number;
  done: number;
  created_at: string;
}
export interface TaggingData {
  year: number;
  staff: Staff[];
  tags: { staff_id: number; month: number; completed: number }[];
}
export interface ArchiveTask {
  id?: number;
  newspaper: string;
  completed: number;
  completed_at?: string | null;
  completed_by_name?: string | null;
}
export interface Assignment {
  group_number: number;
  staff_id: number | null;
  staff_name: string;
  tasks: ArchiveTask[];
}
export interface ArchiveData {
  month: string;
  draw: null | { created_at: string; created_by_name: string };
  assignments: Assignment[];
  groups: string[][];
  participants: { id: number; name: string }[];
}
export interface CleaningRecord {
  month: string;
  created_by: number;
  username: string;
  created_at: string;
  staff: { id: number; name: string }[];
}
export interface ManualData {
  content: string;
  updated_at: string | null;
  updated_by: string | null;
}
export type RegulationsData = ManualData;
export interface Extension {
  number: string;
  place: string;
}
export interface ChatAnswer {
  id: number;
  outcome: "answered" | "not_found" | "refused";
  answer: string;
  sections: string[];
  extensions: Extension[];
  today_count: number;
  warn: boolean;
}
export interface QuestionRecord {
  id: number;
  username: string;
  question: string;
  outcome: ChatAnswer["outcome"];
  answer: string;
  sections: string[];
  extensions: Extension[];
  created_at: string;
  flagged_at: string | null;
  flag_note: string | null;
  resolved_at: string | null;
}
export interface QuestionLog {
  summary: { today_count: number; month_count: number; month_cost_usd: number };
  items: QuestionRecord[];
}
