// 매뉴얼용 Markdown 부분 집합 파서. 결과는 데이터일 뿐이고 HTML 문자열을 만들지 않는다
// (렌더는 React가 텍스트로 이스케이프한다).
import { base } from "./api";

export interface Heading {
  type: "heading";
  level: 1 | 2 | 3;
  id: string;
  number: string;
  title: string;
  stars: number;
}
export interface ListItem {
  text: string;
  children: List[];
}
export interface List {
  type: "list";
  ordered: boolean;
  start: number;
  items: ListItem[];
}
export type Block =
  | Heading
  | List
  | { type: "paragraph"; text: string }
  | { type: "callout"; warning: boolean; blocks: Block[] }
  | { type: "table"; head: string[]; rows: string[][] };
export type Span =
  | { type: "text"; text: string }
  | { type: "bold"; children: Span[] }
  | { type: "link"; href: string; children: Span[] }
  | { type: "image"; alt: string; src: string };
export interface Section {
  id: string;
  level: 1 | 2;
  label: string;
  stars: number;
  path: string;
  text: string;
}

const headingLine = /^(#{1,3})\s+(.*)$/;
const listLine = /^( *)([-*]|\d+[.)])\s+(.*)$/;
const quoteLine = /^\s*>/;
const tableLine = /^\s*\|/;
const separatorLine = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

export function parse(source: string): Block[] {
  return blocks(source.replace(/\r\n?/g, "\n").replace(/\t/g, "  ").split("\n"), { auto: 0 });
}

function blocks(lines: string[], counter: { auto: number }): Block[] {
  const out: Block[] = [];
  const isTable = (i: number) => tableLine.test(lines[i]) && separatorLine.test(lines[i + 1] ?? "");
  const startsBlock = (i: number) =>
    headingLine.test(lines[i]) || quoteLine.test(lines[i]) || listLine.test(lines[i]) || isTable(i);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = headingLine.exec(line);
    if (heading) {
      out.push(parseHeading(heading[1].length as 1 | 2 | 3, heading[2], counter));
      i++;
    } else if (quoteLine.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && quoteLine.test(lines[i]))
        inner.push(lines[i++].replace(/^\s*> ?/, ""));
      out.push({
        type: "callout",
        warning: inner[0].trimStart().startsWith("⚠"),
        blocks: blocks(inner, counter),
      });
    } else if (isTable(i)) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && tableLine.test(lines[i])) rows.push(cells(lines[i++]));
      out.push({ type: "table", head, rows });
    } else if (listLine.test(line)) {
      const items: Item[] = [];
      while (i < lines.length) {
        const match = listLine.exec(lines[i]);
        if (match) {
          items.push({
            indent: match[1].length,
            ordered: /\d/.test(match[2]),
            start: parseInt(match[2]) || 1,
            text: match[3],
          });
          i++;
        } else if (/^ +\S/.test(lines[i]) && !quoteLine.test(lines[i])) {
          // 들여쓴 이어지는 줄은 앞 항목에 붙인다
          items[items.length - 1].text += "\n" + lines[i++].trim();
        } else if (!lines[i].trim() && listLine.test(lines[i + 1] ?? "")) {
          i++; // 항목 사이 빈 줄은 같은 목록으로 본다
        } else break;
      }
      out.push(...lists(items));
    } else {
      const text: string[] = [];
      do text.push(lines[i++].trim());
      while (i < lines.length && lines[i].trim() && !startsBlock(i));
      out.push({ type: "paragraph", text: text.join("\n") });
    }
  }
  return out;
}

function parseHeading(level: 1 | 2 | 3, rest: string, counter: { auto: number }): Heading {
  const [, number = "", title, stars] = /^(?:(\d+(?:\.\d+)*)\.?\s+)?(.*?)\s*(★*)$/.exec(rest.trim())!;
  return {
    type: "heading",
    level,
    id: number ? number.replaceAll(".", "-") : `section-${++counter.auto}`,
    number,
    title,
    stars: stars.length,
  };
}

function cells(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

interface Item {
  indent: number;
  ordered: boolean;
  start: number;
  text: string;
}
function lists(items: Item[]): List[] {
  const out: List[] = [];
  const indent = Math.min(...items.map((item) => item.indent));
  for (let k = 0; k < items.length; ) {
    let end = k + 1;
    while (end < items.length && items[end].indent > indent) end++;
    const item = items[k];
    const node = { text: item.text, children: end > k + 1 ? lists(items.slice(k + 1, end)) : [] };
    const last = out[out.length - 1];
    if (last && last.ordered === item.ordered) last.items.push(node);
    else out.push({ type: "list", ordered: item.ordered, start: item.start, items: [node] });
    k = end;
  }
  return out;
}

const inlinePattern = /!\[([^\]]*)\]\(([^)\s]*)\)|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*/g;
export function inline(text: string): Span[] {
  const spans: Span[] = [];
  let last = 0;
  for (const match of text.matchAll(inlinePattern)) {
    if (match.index > last) spans.push({ type: "text", text: text.slice(last, match.index) });
    const [, alt, src, label, href, bold] = match;
    if (src !== undefined) {
      const url = imageUrl(src);
      spans.push(url ? { type: "image", alt, src: url } : { type: "text", text: alt });
    } else if (href !== undefined) {
      spans.push(
        /^https?:\/\//i.test(href)
          ? { type: "link", href, children: inline(label) }
          : { type: "text", text: label },
      );
    } else spans.push({ type: "bold", children: inline(bold) });
    last = match.index + match[0].length;
  }
  if (last < text.length) spans.push({ type: "text", text: text.slice(last) });
  return spans;
}

// 배포 CSP가 img-src 'self'라 외부 이미지는 받지 않는다.
export function imageUrl(src: string) {
  const name = /^manual-image:(.+)$/.exec(src)?.[1];
  return name ? `${base}/api/manual/images/${encodeURIComponent(name)}` : "";
}

function spanText(span: Span): string {
  if (span.type === "text") return span.text;
  return span.type === "image" ? span.alt : span.children.map(spanText).join("");
}
export const plain = (text: string) => inline(text).map(spanText).join("");

function blockText(block: Block): string {
  switch (block.type) {
    case "heading":
      return block.title;
    case "paragraph":
      return plain(block.text);
    case "list":
      return block.items
        .map((item) => [plain(item.text), ...item.children.map(blockText)].join("\n"))
        .join("\n");
    case "callout":
      return block.blocks.map(blockText).join("\n");
    case "table":
      return [block.head, ...block.rows].map((row) => row.map(plain).join(" ")).join("\n");
  }
}

// 장(#)·절(##) 단위로 묶는다. 소제목(###)과 본문은 앞선 장/절에 들어간다.
export function sections(list: Block[]): Section[] {
  const out: Section[] = [];
  let chapter: Section | undefined;
  for (const block of list) {
    if (block.type === "heading" && block.level < 3) {
      const label = [block.number, block.title].filter(Boolean).join(" ");
      const section: Section = {
        id: block.id,
        level: block.level as 1 | 2,
        label,
        stars: block.stars,
        path: block.level === 2 && chapter ? `${chapter.label} › ${label}` : label,
        text: "",
      };
      if (block.level === 1) chapter = section;
      out.push(section);
    } else if (out.length) out[out.length - 1].text += blockText(block) + "\n";
  }
  return out;
}

export function terms(query: string) {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

export function search(list: Section[], query: string) {
  const words = terms(query);
  if (!words.length) return [];
  return list
    .filter((section) => {
      const haystack = `${section.path}\n${section.text}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    })
    .map((section) => ({ section, snippet: snippet(section.text, words) }));
}

function snippet(text: string, words: string[]) {
  const flat = text.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  const hits = words.map((word) => lower.indexOf(word)).filter((at) => at >= 0);
  const start = Math.max(0, (hits.length ? Math.min(...hits) : 0) - 30);
  const end = start + 120;
  return (start > 0 ? "…" : "") + flat.slice(start, end) + (end < flat.length ? "…" : "");
}

// [조각, 일치 여부] 목록. 긴 단어를 먼저 맞춰 겹치는 단어도 자연스럽게 칠한다.
export function highlight(text: string, words: string[]): [string, boolean][] {
  if (!words.length) return [[text, false]];
  const pattern = new RegExp(
    `(${[...words].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi",
  );
  return text
    .split(pattern)
    .map((part, index): [string, boolean] => [part, index % 2 === 1])
    .filter(([part]) => part);
}
