import { today } from "./dates";

// 오늘의 요일 번호(월=0). 주말이면 금요일.
export const todayIndex = () => Math.min((new Date(`${today()}T00:00:00Z`).getUTCDay() + 6) % 7, 4);
