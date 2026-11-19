import type { User } from "./types";
import type { Dialog, View } from "./App";
import { Chevron, Divider, ListHeader, ListRow, PageTop } from "./tds";
import { Icon } from "./ui";

export const roleLabel = (user: User) =>
  user.role === "admin" ? "관리자 계정" : user.role === "viewer" ? "보기 전용 계정" : "공용 계정";

// 모바일 "전체" 화면 (Figma 55086:644). 하단 탭에 없는 화면과 계정·도움 기능을 모은다.
export default function More({ user, open, dialog, logout }: {
  user: User;
  open: (view: View) => void;
  dialog: (dialog: Dialog) => void;
  logout: () => Promise<void>;
}) {
  const viewer = user.role === "viewer";
  return (
    <section className="more">
      <PageTop title="전체" />
      <ListRow
        icon="user"
        title={user.username}
        sub={roleLabel(user)}
        right={<Chevron />}
        ariaLabel={`내 계정 (${user.username})`}
        onClick={() => dialog("account")}
      />
      {!viewer && <button type="button" className="help-link" onClick={() => dialog("inquiry")}>개발자에게 문의하기<Icon name="chevron" /></button>}
      <Divider />
      <ListHeader title="업무" />
      {!viewer && (
        <ListRow icon="people" title="인적관리" sub="근무자·선생님 연락처" right={<Chevron />} onClick={() => open("people")} />
      )}
      <ListRow icon="book" title="매뉴얼" sub="근무 규칙과 업무 방법" right={<Chevron />} onClick={() => open("manual")} />
      <ListRow icon="check-circle" title="규정" sub="이용 규정과 내선번호" right={<Chevron />} onClick={() => open("regulations")} />
      <Divider />
      <ListHeader title="계정·도움" />
      {!viewer && (
        <ListRow icon="lock" title="비밀번호 변경" right={<Chevron />} onClick={() => dialog("password")} />
      )}
      <ListRow icon="exit" title="로그아웃" onClick={() => void logout()} />
    </section>
  );
}
