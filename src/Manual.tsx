import { Fragment, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api, message, upload, useResource } from "./api";
import type { ManualData, User } from "./types";
import { Action, Fold, Icon, Loading, useMobile, useNotice } from "./ui";
import { highlight, inline, parse, search, sections, terms } from "./markdown";
import type { Block, Heading, List, Span } from "./markdown";
import icons from "./icons.json";

const shortcuts = [
  ["오픈", "2"],
  ["마감", "3"],
  ["전화 왔을 때", "8"],
  ["택배 가방 도착", "5-2"],
  ["잡지 입수", "4-4"],
  ["이용자 문의", "7-1"],
  ["누구에게 물어보지?", "7-4"],
] as const;
const anchor = (id: string) => `manual-${id}`;

export default function Manual({ user }: { user: User }) {
  const manual = useResource<ManualData>("/manual");
  const [editing, setEditing] = useState(false);
  const onEdit = user.role === "admin" && !editing ? () => setEditing(true) : undefined;
  return (
    <section className="view manual" aria-label="매뉴얼">
      {!manual.data ? (
        <Loading error={manual.error} retry={manual.refresh} />
      ) : editing ? (
        <ManualEditor
          initial={manual.data.content}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            manual.update(() => saved);
            setEditing(false);
          }}
        />
      ) : (
        <ManualViewer data={manual.data} onEdit={onEdit} />
      )}
    </section>
  );
}

function ManualViewer({ data, onEdit }: { data: ManualData; onEdit?: () => void }) {
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
  // pageId가 ""이면 홈(장 카드 목록)
  const pageIndex = pageId ? pages.findIndex((page) => page.id === pageId) : -1;
  const page = pageIndex >= 0 ? pages[pageIndex] : undefined;
  function goHome() {
    setPageId("");
    history.replaceState(null, "", "#manual");
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
    history.replaceState(null, "", `#manual/${id}`);
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
    element.classList.remove("flash");
    void element.offsetWidth; // 같은 섹션을 다시 눌러도 강조가 다시 돌게
    element.classList.add("flash");
  }, [jump, pageOf]);
  async function copy(id: string) {
    const url = `${location.origin}${location.pathname}#manual/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      notice("섹션 링크를 복사했어요.");
    } catch {
      history.replaceState(null, "", `#manual/${id}`);
      notice("복사하지 못했어요. 주소창의 링크를 써 주세요.");
    }
  }

  useEffect(() => {
    const open = () => {
      const id = /^#manual\/(.+)$/.exec(location.hash)?.[1];
      if (id) go(decodeURIComponent(id));
      else if (location.hash === "#manual") setPageId("");
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
          return {
            ...chapter,
            number: heading?.number ?? "",
            title: heading?.title ?? chapter.label,
            children,
            summary: children.map((child) => child.label.replace(/^[\d.]+\s*/, "")).join(" · "),
          };
        }),
    [list, blocks, pageOf],
  );
  const [open, setOpen] = useState(false);
  const link = (id: string, className: string, body: ReactNode) => (
    <a
      href={`#manual/${id}`}
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
    <nav aria-label="매뉴얼 목차">
      <ol className="manual-nav">
        <li className={page ? undefined : "active"}>
          <a
            href="#manual"
            className="manual-nav-chapter"
            onClick={(event) => {
              event.preventDefault();
              event.currentTarget.closest("details")?.removeAttribute("open");
              goHome();
            }}
          >
            <span className="manual-tile"><Icon name="home" /></span>
            <span>매뉴얼 홈</span>
          </a>
        </li>
        {chapters.map((chapter) => (
          <li key={chapter.id} className={page?.id === chapter.id ? "active" : undefined}>
            {link(
              chapter.id,
              "manual-nav-chapter",
              <>
                <span className="manual-tile"><Icon name={chapterIcon(chapter.number)} /></span>
                <span>{chapter.title}</span>
                <Stars count={chapter.stars} />
              </>,
            )}
            {chapter.children.length > 0 && (
              <div className="manual-nav-sub">
                <ol>
                  {chapter.children.map((child) => (
                    <li key={child.id}>
                      {link(child.id, current === child.id ? "active" : "", <span>{child.label}</span>)}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );

  if (!data.content.trim())
    return (
      <div className="card manual-empty">
        <Icon name="book" />
        <h2>아직 등록된 매뉴얼이 없습니다</h2>
        {onEdit ? (
          <button className="btn primary" onClick={onEdit}>매뉴얼 작성하기</button>
        ) : (
          <p className="hint">관리자가 매뉴얼을 올리면 여기에서 볼 수 있어요.</p>
        )}
      </div>
    );
  const chips = shortcuts.filter(([, id]) => ids.has(id));
  const pick = (id: string) => {
    setOpen(false);
    input.current?.blur();
    go(id);
  };
  const currentChapter = chapters.find((chapter) => chapter.id === page?.id);
  return (
    <div className="manual-shell">
      {mobile ? <Fold title="목차">{nav}</Fold> : <aside className="manual-side">{nav}</aside>}
      <div className="manual-main">
        <div className="manual-searchrow">
        <div
          className="manual-searchbox"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
          }}
        >
          <label className="manual-search">
            <Icon name="search" />
            <span className="sr-only">매뉴얼 검색</span>
            <input
              ref={input}
              type="search"
              value={query}
              placeholder="매뉴얼에서 찾기 (예: 택배 반송)"
              aria-keyshortcuts="/"
              aria-expanded={open && words.length > 0}
              aria-controls="manual-results"
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
            <div className="manual-results" id="manual-results" role="region" aria-label="검색 결과">
              {results.length ? (
                <ul>
                  {results.map(({ section, snippet }) => (
                    <li key={section.id}>
                      <button type="button" onClick={() => pick(section.id)}>
                        <span className="manual-result-path"><Marked text={section.path} words={words} /></span>
                        {snippet && (
                          <span className="manual-result-snippet"><Marked text={snippet} words={words} /></span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="manual-results-empty">일치하는 내용이 없어요. 다른 단어로 찾아보세요.</p>
              )}
            </div>
          )}
        </div>
        {onEdit && (
          <button type="button" className="btn manual-edit" onClick={onEdit}>매뉴얼 편집</button>
        )}
        </div>
        {!page ? (
          <div className="manual-home">
            <p className="manual-crumb">매뉴얼</p>
            <h1>연속간행물실 근로 매뉴얼</h1>
            <p className="manual-lead">업무 순서와 이용자 응대 방법을 장별로 정리했어요.</p>
            {chips.length > 0 && (
              <div className="manual-chips" role="group" aria-label="상황별 바로가기">
                {chips.map(([label, id]) => (
                  <button key={id} type="button" onClick={() => go(id)}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            <ul className="manual-cards">
              {chapters.map((chapter) => (
                <li key={chapter.id}>
                  <button type="button" className="manual-card" onClick={() => go(chapter.id)}>
                    <Icon name={chapterIcon(chapter.number)} />
                    <strong>
                      {chapter.title}
                      <Stars count={chapter.stars} />
                    </strong>
                    <span>{chapter.summary}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <article className="card manual-doc">
            <nav className="manual-crumb" aria-label="현재 위치">
              <a
                href="#manual"
                onClick={(event) => {
                  event.preventDefault();
                  goHome();
                }}
              >
                매뉴얼
              </a>
              <Icon name="chevron" />
              <span>{currentChapter?.title}</span>
            </nav>
            <ManualDocument blocks={page.blocks} words={words} onCopy={copy} />
            <nav className="manual-pager" aria-label="장 이동">
              {[pages[pageIndex - 1], pages[pageIndex + 1]].map((target, side) =>
                target ? (
                  <button key={side} type="button" className="btn" onClick={() => go(target.id)}>
                    {side ? "" : "← "}
                    {chapters.find((chapter) => chapter.id === target.id)?.title ?? "이전"}
                    {side ? " →" : ""}
                  </button>
                ) : (
                  <span key={side} />
                ),
              )}
            </nav>
          </article>
        )}
      </div>
    </div>
  );
}

const chapterIcons: Record<string, keyof typeof icons> = {
  "1": "people",
  "2": "sun",
  "3": "moon",
  "4": "archive",
  "5": "swap",
  "6": "grid",
  "7": "message",
  "8": "phone",
  "9": "more",
};
function chapterIcon(number: string) {
  return chapterIcons[number] ?? "book";
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
}: {
  blocks: Block[];
  words?: string[];
  onCopy?: (id: string) => void;
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
          <Tag key={index} id={block.level < 3 ? anchor(block.id) : undefined} className="manual-heading">
            {block.number && <span className="manual-num">{block.number}</span>}
            <span><Marked text={block.title} words={words} /></span>
            <Stars count={block.stars} />
            {onCopy && block.level < 3 && (
              <button
                type="button"
                className="manual-copy"
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
            <ManualDocument blocks={block.blocks} words={words} />
          </aside>
        );
      case "table":
        return (
          <div key={index} className="manual-table">
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
function ManualEditor({
  initial,
  onClose,
  onSaved,
}: {
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
  async function insertImage(picked: File) {
    if (!imageTypes.split(",").includes(picked.type)) throw new Error("PNG, JPEG, GIF, WebP 이미지만 올릴 수 있어요.");
    if (picked.size > 5 * 1024 * 1024) throw new Error("이미지는 5MB 이하만 올릴 수 있어요.");
    const { name } = await upload<{ name: string }>("/manual/images", picked);
    const element = area.current!;
    const snippet = `![](manual-image:${name})`;
    const at = element.selectionStart;
    setText((old) => old.slice(0, at) + snippet + old.slice(element.selectionEnd));
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(at + 2, at + 2); // 설명을 바로 쓸 수 있게 [] 안으로
    });
  }
  return (
    <section className="card manual-editor" aria-label="매뉴얼 편집">
      <div className="card-head">
        <h2>매뉴얼 편집</h2>
        <div className="manual-editor-actions">
          <input
            ref={file}
            type="file"
            accept={imageTypes}
            hidden
            onChange={async (event) => {
              const picked = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!picked) return;
              setUploading(true);
              try {
                await insertImage(picked);
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
              onSaved(await api<ManualData>("/manual", "PUT", { content: text }));
              notice("매뉴얼을 저장했어요.");
            }}
          >
            저장
          </Action>
        </div>
      </div>
      <p className="hint manual-syntax">
        # 장 · ## 절 · ### 소제목 · 제목 끝 ★ = 중요도 · - 목록 · 1. 번호 목록 · &gt; 안내 · &gt; ⚠ 경고 · | 표 | · **굵게** · [링크](https://…)
      </p>
      <div className="manual-editor-grid">
        <label className="manual-editor-source">
          <span className="sr-only">매뉴얼 원문</span>
          <textarea
            ref={area}
            value={text}
            spellCheck={false}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <div className="manual-doc manual-preview" aria-label="미리보기">
          <ManualDocument blocks={preview} />
        </div>
      </div>
    </section>
  );
}
