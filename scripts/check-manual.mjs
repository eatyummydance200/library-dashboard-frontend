import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
  const { parse, sections, search, highlight, inline } = await server.ssrLoadModule("/src/markdown.ts");
  const { ManualDocument } = await server.ssrLoadModule("/src/Manual.tsx");
  const source = [
    "# 2. 오픈 업무 ★★★",
    "오픈 전 **확인**",
    "",
    "## 2.1 신문 최신화 및 관리 ★",
    "- 신문 교체",
    "  - 지난 신문은 **보관함**",
    "    1. 날짜순",
    "- 비품 확인",
    "",
    "1. 첫째",
    "2. 둘째",
    "",
    "> ⚠ 주의",
    "> - 반드시 사서에게 보고",
    "",
    "> 참고 사항",
    "",
    "| 구분 | 담당 |",
    "| --- | :-: |",
    "| 택배 | 사서 |",
    "",
    "# 5 상호대차 업무",
    "## 5.2 택배 가방 도착",
    "가방을 **반송** 처리 ![SOLAS 화면](manual-image:a1b2.png) [안내](https://inu.ac.kr) [위험](javascript:alert(1)) <b>원문</b>",
    "### 소제목",
  ].join("\r\n");
  const blocks = parse(source);
  const headings = blocks.filter((block) => block.type === "heading");
  assert.deepEqual(headings.map(({ level, id, number, title, stars }) => [level, id, number, title, stars]), [
    [1, "2", "2", "오픈 업무", 3],
    [2, "2-1", "2.1", "신문 최신화 및 관리", 1],
    [1, "5", "5", "상호대차 업무", 0],
    [2, "5-2", "5.2", "택배 가방 도착", 0],
    [3, "section-1", "", "소제목", 0],
  ]);

  // 목록 중첩: - 안에 - 안에 1.
  const [bullets, numbered] = blocks.filter((block) => block.type === "list");
  assert.equal(bullets.ordered, false);
  assert.deepEqual(bullets.items.map((item) => item.text), ["신문 교체", "비품 확인"]);
  const nested = bullets.items[0].children[0];
  assert.equal(nested.items[0].text, "지난 신문은 **보관함**");
  assert.equal(nested.items[0].children[0].ordered, true);
  assert.equal(nested.items[0].children[0].items[0].text, "날짜순");
  assert.equal(numbered.ordered, true);
  assert.equal(numbered.items.length, 2);

  const [warning, info] = blocks.filter((block) => block.type === "callout");
  assert.equal(warning.warning, true);
  assert.equal(warning.blocks[1].type, "list");
  assert.equal(info.warning, false);

  const table = blocks.find((block) => block.type === "table");
  assert.deepEqual(table.head, ["구분", "담당"]);
  assert.deepEqual(table.rows, [["택배", "사서"]]);

  const spans = inline("![SOLAS 화면](manual-image:a1b2.png)");
  assert.equal(spans.length, 1);
  assert.deepEqual(spans[0], { type: "image", alt: "SOLAS 화면", src: "/library-dashboard/api/manual/images/a1b2.png" });
  assert.deepEqual(inline("![x](https://evil.example/a.png)"), [{ type: "text", text: "x" }]);

  const list = sections(blocks);
  assert.deepEqual(list.map((section) => section.path), [
    "2 오픈 업무",
    "2 오픈 업무 › 2.1 신문 최신화 및 관리",
    "5 상호대차 업무",
    "5 상호대차 업무 › 5.2 택배 가방 도착",
  ]);
  // 공백 단어 AND, 대소문자 무시, 장 제목 + 절 본문 조합도 일치
  assert.deepEqual(search(list, "상호대차 반송").map((r) => r.section.id), ["5-2"]);
  assert.deepEqual(search(list, "SOLAS").map((r) => r.section.id), ["5-2"]);
  assert.deepEqual(search(list, "solas 보관함"), []);
  assert.deepEqual(search(list, "보관함 사서").map((r) => r.section.id), ["2-1"]);
  assert.deepEqual(search(list, "  "), []);
  assert.match(search(list, "반송")[0].snippet, /반송/);
  assert.deepEqual(highlight("Solas 반송 solas", ["solas"]), [["Solas", true], [" 반송 ", false], ["solas", true]]);

  const html = renderToStaticMarkup(createElement(ManualDocument, { blocks, words: ["반송"], onCopy() {} }));
  assert.match(html, /<h2 id="manual-2" class="manual-heading"><span class="manual-num">2<\/span><span>오픈 업무<\/span><span class="manual-stars"[^>]*>★★★<\/span>/);
  assert.match(html, /aria-label="2.1 신문 최신화 및 관리 링크 복사"/);
  assert.match(html, /<aside class="manual-callout warning">/);
  assert.match(html, /<aside class="manual-callout">/);
  assert.match(html, /<a class="manual-image" href="\/library-dashboard\/api\/manual\/images\/a1b2.png" target="_blank"[^>]*><img src="\/library-dashboard\/api\/manual\/images\/a1b2.png" alt="SOLAS 화면"/);
  assert.match(html, /<a href="https:\/\/inu.ac.kr" target="_blank" rel="noreferrer">안내<\/a>/);
  assert.doesNotMatch(html, /javascript:|<b>/);
  assert.match(html, /&lt;b&gt;원문&lt;\/b&gt;/);
  assert.match(html, /<strong><mark>반송<\/mark><\/strong>/);
  assert.match(html, /<th scope="col">구분<\/th>/);
  console.log("PASS: manual headings/stars, nested lists, callouts, table, images, safe links, AND search");
} finally {
  await server.close();
}
