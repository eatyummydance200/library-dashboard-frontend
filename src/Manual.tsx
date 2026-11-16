import { Fragment, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api, message, upload, useResource } from "./api";
import type { ManualData, User } from "./types";
import { Action, Icon, Loading, useMobile, useNotice } from "./ui";
import { Badge, Card, Chevron, ListHeader, ListRow, PageTop } from "./tds";
import { koreaParts } from "./dates";
import { highlight, inline, parse, search, sections, terms } from "./markdown";
import type { Block, Heading, List, Span } from "./markdown";
import "./manual.css";

// 매뉴얼과 규정이 같은 화면을 쓴다. name은 받침 있는 낱말이라 "이/을"을 붙인다.
export interface DocConfig {
  path: string; // API 경로 (GET/PUT)
  name: string;
  hash: string; // #hash, #hash/섹션
  title: string;
  lower: string;
  example: string; // 검색 예시
  shortcuts: readonly (readonly [string, string])[]; // [이름, 섹션 id]
  images: boolean; // 편집기 "이미지 넣기"
}
export const MANUAL: DocConfig = {
  path: "/manual",
  name: "매뉴얼",
  hash: "manual",
  title: "연속간행물실 근로 매뉴얼",
  lower: "업무 순서와 이용자 응대 방법을 장별로 정리했어요",
  example: "택배 반송",
  shortcuts: [
    ["오픈", "2"],
    ["마감", "3"],
    ["전화 왔을 때", "8"],
    ["택배 가방 도착", "5-2"],
    ["잡지 입수", "4-4"],
    ["이용자 문의", "7-1"],
    ["누구에게 물어보지?", "7-4"],
  ],
  images: true,
};

export default function Manual({ user, doc = MANUAL }: { user: User; doc?: DocConfig }) {
  const manual = useResource<ManualData>(doc.path);
  const [editing, setEditing] = useState(false);
  const onEdit = user.role === "admin" && !editing ? () => setEditing(true) : undefined;
  return (
    <section className="view mnl" aria-label={doc.name}>
      {!manual.data ? (
        <Loading error={manual.error} retry={manual.refresh} />
      ) : editing ? (
        <ManualEditor
          doc={doc}
          initial={manual.data.content}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            manual.update(() => saved);
            setEditing(false);
          }}
        />
      ) : (
        <ManualViewer doc={doc} data={manual.data} onEdit={onEdit} />
      )}
    </section>
  );
}

// "11월 3일 관리자가 고쳤어요" (받침에 따라 이/가)
export function updatedLine(at: string | null, by: string | null) {
  if (!at) return undefined;
  const { month, day } = koreaParts(new Date(at));
  const when = `${Number(month)}월 ${Number(day)}일`;
  if (!by) return `${when}에 고쳤어요`;
  const code = by.charCodeAt(by.length - 1) - 0xac00;
  const josa = code >= 0 && code < 11172 ? (code % 28 ? "이" : "가") : "이(가)";
  return `${when} ${by}${josa} 고쳤어요`;
}

function ManualViewer({ doc, data, onEdit }: { doc: DocConfig; data: ManualData; onEdit?: () => void }) {
  const { hash, name } = doc;
  const anchor = (id: string) => `${hash}-${id}`;
  const notice = useNotice();
  const mobile = useMobile();
  const blocks = useMemo(() => parse(data.content), [data.content]);
  const list = useMemo(() => sections(blocks), [blocks]);
  const ids = useMemo(
    () => new Set(blocks.flatMap((block) => (block.type === "heading" ? [block.id] : []))),
    [blocks],
  );
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const words = useMemo(() => terms(deferred), [deferred]);
  const results = useMemo(() => search(list, deferred), [list, deferred]);
  const [current, setCurrent] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // 장(#) 하나가 한 페이지. 장 앞의 내용은 첫 장에 붙인다
  const { pages, pageOf } = useMemo(() => {
    const pages: { id: string; blocks: Block[] }[] = [];
    let hasChapter = false;
    for (const block of blocks) {
      const chapter = block.type === "heading" && block.level === 1;
      if (!pages.length || (chapter && hasChapter)) {
        pages.push({ id: "", blocks: [] });
        hasChapter = false;
      }
      const page = pages[pages.length - 1];
      if (chapter) {
        page.id = block.id;
        hasChapter = true;
      }
      page.blocks.push(block);
    }
    const pageOf = new Map<string, string>();
    for (const page of pages)
      for (const block of page.blocks) if (block.type === "heading") pageOf.set(block.id, page.id);
    return { pages, pageOf };
  }, [blocks]);
  const [pageId, setPageId] = useState("");
  // pageId가 ""이면 홈(목차)
  const pageIndex = pageId ? pages.findIndex((page) => page.id === pageId) : -1;
  const page = pageIndex >= 0 ? pages[pageIndex] : undefined;
  function goHome() {
    setPageId("");
    history.replaceState(null, "", `#${hash}`);
    window.scrollTo({ top: 0 });
  }

  // 스크롤 위치는 html의 scroll-padding-top(상단 바 높이)을 따른다
  // 페이지를 바꾼 뒤 새 DOM에서 스크롤해야 하므로 이동은 layout effect에서 한다
  const [jump, setJump] = useState<{ id: string } | null>(null);
  function go(id: string) {
    const target = pageOf.get(id);
    if (target === undefined) return;
    setPageId(target);
    setJump({ id });
    history.replaceState(null, "", `#${hash}/${id}`);
  }
  useLayoutEffect(() => {
    if (!jump) return;
    if (pageOf.get(jump.id) === jump.id) {
      window.scrollTo({ top: 0 });
      return;
    }
    const element = document.getElementById(anchor(jump.id));
    if (!element) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    element.classList.remove("mnl-flash");
    void element.offsetWidth; // 같은 섹션을 다시 눌러도 강조가 다시 돌게
    element.classList.add("mnl-flash");
  }, [jump, pageOf]);
  async function copy(id: string) {
    const url = `${location.origin}${location.pathname}#${hash}/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      notice("섹션 링크를 복사했어요.");
    } catch {
      history.replaceState(null, "", `#${hash}/${id}`);
      notice("복사하지 못했어요. 주소창의 링크를 써 주세요.");
    }
  }

  useEffect(() => {
    const open = () => {
      const prefix = `#${hash}/`;
      const id = location.hash.startsWith(prefix) ? location.hash.slice(prefix.length) : "";
      if (id) go(decodeURIComponent(id));
      else if (location.hash === `#${hash}`) setPageId("");
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [blocks]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.target as HTMLElement).closest?.("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    // 상단 바 바로 아래를 지난 마지막 장/절이 현재 섹션
    // 현재 페이지의 장/절만 화면에 있으므로 없는 요소는 건너뛴다
    const update = () => {
      let id = page?.id ?? "";
      for (const section of list) {
        const element = document.getElementById(anchor(section.id));
        if (!element) continue;
        if (element.getBoundingClientRect().top > 120) break;
        id = section.id;
      }
      setCurrent(id);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [list, page]);

  const chapters = useMemo(
    () =>
      list
        .filter((section) => section.level === 1)
        .map((chapter) => {
          const heading = blocks.find((b) => b.type === "heading" && b.id === chapter.id) as Heading | undefined;
          const children = list.filter((s) => s.level === 2 && pageOf.get(s.id) === chapter.id);
          const number = heading?.number ?? "";
          const title = heading?.title ?? chapter.label;
          return {
            ...chapter,
            name: number ? `${number}. ${title}` : title,
            children,
            summary: children.map((child) => child.label.replace(/^[\d.]+\s*/, "")).join(" · "),
          };
        }),
    [list, blocks, pageOf],
  );
  const [open, setOpen] = useState(false);
  const link = (id: string, className: string, body: ReactNode) => (
    <a
      href={`#${hash}/${id}`}
      className={className}
      aria-current={current === id ? "location" : undefined}
      onClick={(event) => {
        event.preventDefault();
        // 모바일 접이식 목차는 먼저 닫아야 이동 위치가 맞는다
        event.currentTarget.closest("details")?.removeAttribute("open");
        go(id);
      }}
    >
      {body}
    </a>
  );
  const nav = (
    <nav aria-label={`${name} 목차`}>
      <ol className="mnl-nav">
        <li>
          <a
            href={`#${hash}`}
            className="mnl-nav-chapter"
            onClick={(event) => {
              event.preventDefault();
              event.currentTarget.closest("details")?.removeAttribute("open");
              goHome();
            }}
          >
            {name} 홈
          </a>
        </li>
        {chapters.map((chapter) => (
          <li key={chapter.id} className={page?.id === chapter.id ? "is-active" : undefined}>
            {link(chapter.id, "mnl-nav-chapter", chapter.name)}
            {page?.id === chapter.id && chapter.children.length > 0 && (
              <ol className="mnl-nav-sub">
                {chapter.children.map((child) => (
                  <li key={child.id}>{link(child.id, "", child.label)}</li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );

  const editButton = onEdit && (
    <button type="button" className="btn small weak" onClick={onEdit}>
      {name} 편집
    </button>
  );
  const top = (
    <PageTop
      upper={updatedLine(data.updated_at, data.updated_by)}
      title={doc.title}
      lower={doc.lower}
      actions={editButton}
    />
  );
  if (!data.content.trim())
    return (
      <>
        {top}
        <Card className="mnl-empty">
          <Icon name="book" />
          <p>아직 등록된 {name}이 없어요</p>
          {onEdit ? (
            <button type="button" className="btn primary" onClick={onEdit}>
              {name} 작성하기
            </button>
          ) : (
            <p className="mnl-hint">관리자가 {name}을 올리면 여기에서 볼 수 있어요.</p>
          )}
        </Card>
      </>
    );
  const chips = doc.shortcuts.filter(([, id]) => ids.has(id));
  const pick = (id: string) => {
    setOpen(false);
    input.current?.blur();
    go(id);
  };
  const searchField = (
    <div
      className="mnl-searchbox"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label className="mnl-search">
        <Icon name="search" />
        <span className="sr-only">{name} 검색</span>
        <input
          ref={input}
          type="search"
          value={query}
          placeholder={mobile ? "무엇이 궁금한가요?" : `무엇이 궁금한가요? 예) ${doc.example}`}
          aria-keyshortcuts="/"
          aria-expanded={open && words.length > 0}
          aria-controls={`${hash}-results`}
          enterKeyHint="search"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              if (open && query) setOpen(false);
              else if (query) setQuery("");
              else event.currentTarget.blur();
            }
            if (event.key === "Enter" && results[0]) pick(results[0].section.id);
          }}
        />
        {!query && <kbd aria-hidden="true">/</kbd>}
      </label>
      {open && words.length > 0 && (
        <div className="mnl-results" id={`${hash}-results`} role="region" aria-label="검색 결과">
          {results.length ? (
            <ul>
              {results.map(({ section, snippet }) => (
                <li key={section.id}>
                  <button type="button" onClick={() => pick(section.id)}>
                    <span className="mnl-result-path">
                      <Marked text={section.path} words={words} />
                    </span>
                    {snippet && (
                      <span className="mnl-result-snippet">
                        <Marked text={snippet} words={words} />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mnl-results-empty">일치하는 내용이 없어요. 다른 단어로 찾아보세요.</p>
          )}
        </div>
      )}
    </div>
  );

  if (!page)
    return (
      <>
        {top}
        <Card className="mnl-find" label="찾기">
          {searchField}
          {chips.length > 0 && (
            <>
              <ListHeader title="상황별 바로가기" />
              <div className="tds-chips mnl-chips" role="group" aria-label="상황별 바로가기">
                {chips.map(([label, id]) => (
                  <button key={id} type="button" onClick={() => go(id)}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </Card>
        <Card className="mnl-toc" label="목차">
          <ListHeader title="목차" />
          <ul className="mnl-chapters">
            {chapters.map((chapter) => (
              <li key={chapter.id}>
                <ListRow
                  icon={mobile ? undefined : "book"}
                  title={chapter.name}
                  sub={chapter.summary || undefined}
                  onClick={() => go(chapter.id)}
                  right={chapter.stars >= 3 ? <Badge color="yellow">꼭 읽기</Badge> : <Chevron />}
                />
              </li>
            ))}
          </ul>
        </Card>
      </>
    );

  const currentChapter = chapters.find((chapter) => chapter.id === page.id);
  return (
    <div className="mnl-read">
      <h1 className="sr-only">{doc.title}</h1>
      {!mobile && <aside className="tds-card mnl-side">{nav}</aside>}
      <div className="mnl-main">
        <Card className="mnl-find is-compact" label="찾기">
          {searchField}
        </Card>
        {mobile && (
          <details className="tds-card mnl-fold">
            <summary>
              <span>목차</span>
              <span className="mnl-fold-current">{currentChapter?.name}</span>
            </summary>
            {nav}
          </details>
        )}
        <article className="tds-card mnl-doc">
          <div className="mnl-doc-top">
            <nav className="mnl-crumb" aria-label="현재 위치">
              <a
                href={`#${hash}`}
                onClick={(event) => {
                  event.preventDefault();
                  goHome();
                }}
              >
                {name}
              </a>
              <Icon name="chevron" />
              <span>{currentChapter?.name}</span>
            </nav>
            {editButton}
          </div>
          <ManualDocument blocks={page.blocks} words={words} onCopy={copy} hash={hash} />
          <nav className="mnl-pager" aria-label="장 이동">
            {[pages[pageIndex - 1], pages[pageIndex + 1]].map((target, side) =>
              target ? (
                <button key={side} type="button" className={side ? "is-next" : undefined} onClick={() => go(target.id)}>
                  <small>{side ? "다음 장" : "이전 장"}</small>
                  <strong>{chapters.find((chapter) => chapter.id === target.id)?.name ?? "처음"}</strong>
                </button>
              ) : (
                <span key={side} />
              ),
            )}
          </nav>
        </article>
      </div>
    </div>
  );
}

function Stars({ count }: { count: number }) {
  return count ? (
    <span className="manual-stars" title={`중요도 ${count}`} aria-label={`중요도 ${count}`}>
      {"★".repeat(count)}
    </span>
  ) : null;
}

function Marked({ text, words }: { text: string; words: string[] }) {
  return highlight(text, words).map(([part, hit], index) =>
    hit ? <mark key={index}>{part}</mark> : <Fragment key={index}>{part}</Fragment>,
  );
}

function Inline({ text, words }: { text: string; words: string[] }) {
  const render = (spans: Span[]): ReactNode =>
    spans.map((span, index) => {
      switch (span.type) {
        case "text":
          return <Marked key={index} text={span.text} words={words} />;
        case "bold":
          return <strong key={index}>{render(span.children)}</strong>;
        case "link":
          return (
            <a key={index} href={span.href} target="_blank" rel="noreferrer">
              {render(span.children)}
            </a>
          );
        case "image":
          return (
            <a key={index} className="manual-image" href={span.src} target="_blank" rel="noreferrer" title="원본 크기로 보기">
              <img src={span.src} alt={span.alt} loading="lazy" />
            </a>
          );
      }
    });
  return render(inline(text));
}

export function ManualDocument({
  blocks,
  words = [],
  onCopy,
  hash = "manual",
}: {
  blocks: Block[];
  words?: string[];
  onCopy?: (id: string) => void;
  hash?: string; // 제목 id 접두어
}) {
  const listNode = (list: List, key: number) => {
    const items = list.items.map((item, index) => (
      <li key={index}>
        <Inline text={item.text} words={words} />
        {item.children.map(listNode)}
      </li>
    ));
    return list.ordered ? (
      <ol key={key} start={list.start === 1 ? undefined : list.start}>{items}</ol>
    ) : (
      <ul key={key}>{items}</ul>
    );
  };
  return blocks.map((block, index) => {
    switch (block.type) {
      case "heading": {
        const Tag = (["h2", "h3", "h4"] as const)[block.level - 1];
        return (
          <Tag key={index} id={block.level < 3 ? `${hash}-${block.id}` : undefined} className="manual-heading">
            {block.number && <span className="manual-num">{block.number}</span>}
            <span><Marked text={block.title} words={words} /></span>
            <Stars count={block.stars} />
            {onCopy && block.level < 3 && (
              <button
                type="button"
                className="mnl-copy"
                aria-label={`${[block.number, block.title].filter(Boolean).join(" ")} 링크 복사`}
                title="링크 복사"
                onClick={() => onCopy(block.id)}
              >
                <Icon name="link" />
              </button>
            )}
          </Tag>
        );
      }
      case "paragraph":
        return <p key={index}><Inline text={block.text} words={words} /></p>;
      case "list":
        return listNode(block, index);
      case "callout":
        return (
          <aside key={index} className={`manual-callout${block.warning ? " warning" : ""}`}>
            <ManualDocument blocks={block.blocks} words={words} hash={hash} />
          </aside>
        );
      case "table":
        return (
          <div key={index} className="mnl-table">
            <table>
              <thead>
                <tr>{block.head.map((cell, c) => <th key={c} scope="col"><Inline text={cell} words={words} /></th>)}</tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r}>{row.map((cell, c) => <td key={c}><Inline text={cell} words={words} /></td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  });
}

const imageTypes = "image/png,image/jpeg,image/gif,image/webp";
export function ManualEditor({
  doc,
  initial,
  onClose,
  onSaved,
}: {
  doc: DocConfig;
  initial: string;
  onClose: () => void;
  onSaved: (data: ManualData) => void;
}) {
  const notice = useNotice();
  const [text, setText] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const deferred = useDeferredValue(text);
  const preview = useMemo(() => parse(deferred), [deferred]);
  // 여러 장을 차례로 올린다. 서버가 안전한 파일 이름은 그대로 두므로, 본문이 이미 그 이름을
  // 참조하고 있으면(manual.md를 붙여 넣은 경우) 연결만 되고 새로 삽입하지 않는다.
  async function insertImages(picked: File[]) {
    for (const one of picked) {
      if (!imageTypes.split(",").includes(one.type)) throw new Error(`${one.name}: PNG, JPEG, GIF, WebP 이미지만 올릴 수 있어요.`);
      if (one.size > 5 * 1024 * 1024) throw new Error(`${one.name}: 이미지는 5MB 이하만 올릴 수 있어요.`);
    }
    const element = area.current!;
    const added: string[] = [];
    let linked = 0;
    for (const one of picked) {
      const { name } = await upload<{ name: string }>("/manual/images", one);
      if (element.value.includes(`manual-image:${name})`)) linked++;
      else added.push(`![](manual-image:${name})`);
    }
    if (added.length) {
      const snippet = added.join("\n");
      const at = element.selectionStart;
      setText((old) => old.slice(0, at) + snippet + old.slice(element.selectionEnd));
      requestAnimationFrame(() => {
        element.focus();
        element.setSelectionRange(at + 2, at + 2); // 설명을 바로 쓸 수 있게 첫 [] 안으로
      });
    }
    notice(
      [linked && `${linked}장은 본문에 연결됐어요`, added.length && `${added.length}장을 커서 위치에 넣었어요`]
        .filter(Boolean)
        .join(", ") + ".",
    );
  }
  return (
    <>
      <PageTop
        title={`${doc.name} 편집`}
        lower="왼쪽에 쓰면 오른쪽에서 바로 미리 볼 수 있어요"
        actions={
          <>
            {doc.images && (
              <>
                <input
                  ref={file}
                  type="file"
                  accept={imageTypes}
                  multiple
                  hidden
                  onChange={async (event) => {
                    const picked = [...(event.currentTarget.files ?? [])];
                    event.currentTarget.value = "";
                    if (!picked.length) return;
                    setUploading(true);
                    try {
                      await insertImages(picked);
                    } catch (error) {
                      notice(message(error));
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
                <button type="button" className="btn small" disabled={uploading} onClick={() => file.current?.click()}>
                  <Icon name="plus" />
                  {uploading ? "올리는 중…" : "이미지 넣기"}
                </button>
              </>
            )}
            <button
              type="button"
              className="btn small"
              onClick={() => {
                if (text === initial || confirm("저장하지 않은 내용이 사라져요. 편집을 그만할까요?")) onClose();
              }}
            >
              취소
            </button>
            <Action
              className="btn small primary"
              disabled={uploading}
              run={async () => {
                onSaved(await api<ManualData>(doc.path, "PUT", { content: text }));
                notice(`${doc.name}을 저장했어요.`);
              }}
            >
              저장
            </Action>
          </>
        }
      />
      <Card className="mnl-editor" label={`${doc.name} 원문과 미리보기`}>
        <p className="mnl-hint mnl-syntax">
          # 장 · ## 절 · ### 소제목 · 제목 끝 ★ = 중요도 · - 목록 · 1. 번호 목록 · &gt; 안내 · &gt; ⚠ 경고 · | 표 | · **굵게** · [링크](https://…)
        </p>
        <div className="mnl-editor-grid">
          <label className="mnl-editor-source">
            <span className="sr-only">{doc.name} 원문</span>
            <textarea ref={area} value={text} spellCheck={false} onChange={(event) => setText(event.target.value)} />
          </label>
          <div className="mnl-doc mnl-preview" aria-label="미리보기">
            <ManualDocument blocks={preview} hash={doc.hash} />
          </div>
        </div>
      </Card>
    </>
  );
}
