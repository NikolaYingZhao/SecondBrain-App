import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { KnowledgeService } from "../src/service.mjs";
import { writeReadingNote } from "../src/service.mjs";
import { compileKnowledge } from "../src/wiki.mjs";

function buildMiniVault() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "secondbrain-notes-"));
  const v2Root = path.join(root, "secondbrain-v2");
  const brainsRoot = path.join(root, "brains");
  const brainRoot = path.join(brainsRoot, "cs-brain");
  fs.mkdirSync(path.join(v2Root, "config"), { recursive: true });
  fs.mkdirSync(path.join(brainRoot, "wiki", "concepts"), { recursive: true });
  fs.mkdirSync(path.join(brainRoot, "wiki", "synthesis"), { recursive: true });
  fs.mkdirSync(path.join(brainRoot, "raw"), { recursive: true });
  fs.mkdirSync(path.join(brainsRoot, "inbox-brain", "raw", "fragments"), { recursive: true });
  fs.writeFileSync(path.join(brainRoot, "wiki", "concepts", "A.md"), "---\nbrain: cs\ntype: concept\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\n# A\n内容");
  fs.writeFileSync(path.join(v2Root, "config", "brains.json"), JSON.stringify({
    version: 1,
    aliases: {},
    brains: [
      { id: "cs-brain", name: "CS", short: "CS", status: "active", color: "#000", domains: [] },
      { id: "inbox-brain", name: "收件箱", short: "收件箱", status: "system", color: "#777", domains: [] }
    ]
  }));
  return { root, v2Root, brainsRoot, brainRoot };
}

test("collects quotes from frontmatter and falls back to synthesis pages", () => {
  const { root, v2Root, brainRoot } = buildMiniVault();
  fs.writeFileSync(path.join(brainRoot, "wiki", "concepts", "A.md"),
    "---\nbrain: cs\ntype: concept\ncreated: 2026-01-01\nupdated: 2026-01-03\nquote: 一句话胜过长篇大论。\n---\n# A\n内容");
  fs.writeFileSync(path.join(brainRoot, "wiki", "synthesis", "S.md"),
    "---\nbrain: cs\ntype: synthesis\ncreated: 2026-01-01\nupdated: 2026-01-02\n---\n# S\n第一段里藏着**值得反复品味的重点**，其余不选。");
  fs.writeFileSync(path.join(brainRoot, "wiki", "concepts", "B.md"),
    "---\nbrain: cs\ntype: concept\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\n# B\n普通页面没有金句，不进池子。");

  const index = compileKnowledge({ projectRoot: root, v2Root });
  assert.equal(index.summary.quotes, 2);
  const quotes = index.quotes;
  assert.ok(quotes.some((q) => q.quote === "一句话胜过长篇大论。" && q.id === "cs-brain/concepts/A"));
  const fallback = quotes.find((q) => q.id === "cs-brain/synthesis/S");
  assert.equal(fallback.quote, "值得反复品味的重点");
  assert.ok(!quotes.some((q) => q.id === "cs-brain/concepts/B"));
});

test("writes a reading note into inbox fragments with source link", () => {
  const { root, brainsRoot, brainRoot } = buildMiniVault();
  const page = { id: "cs-brain/concepts/A", path: "concepts/A", title: "A" };
  const result = writeReadingNote({
    brainsRoot,
    page,
    text: "这里让我想到教学场景。",
    selection: "一句话胜过长篇大论。",
    now: new Date("2026-08-08T10:30:00")
  });
  assert.equal(result.saved, true);
  assert.match(result.file, /^inbox-brain[\\/]raw[\\/]fragments[\\/]想法-/);
  const content = fs.readFileSync(result.path, "utf8");
  assert.match(content, /^type: reading-note/m);
  assert.match(content, /^source: "\[\[concepts\/A\]\]"/m);
  assert.match(content, /原文：\n> 一句话胜过长篇大论。/);
  assert.match(content, /想法：\n这里让我想到教学场景。/);
});

test("rejects empty notes and clamps long selections", () => {
  const { brainsRoot } = buildMiniVault();
  const page = { id: "cs-brain/concepts/A", path: "concepts/A", title: "A" };
  assert.throws(() => writeReadingNote({ brainsRoot, page, text: "   " }), /想法内容为空/);
  const long = "字".repeat(500);
  const result = writeReadingNote({ brainsRoot, page, text: "ok", selection: long });
  const content = fs.readFileSync(result.path, "utf8");
  assert.ok(content.split("> ")[1].split("\n")[0].length <= 200);
});

test("service.addReadingNote validates the target page", () => {
  const { v2Root, brainsRoot } = buildMiniVault();
  const service = new KnowledgeService({ v2Root, vaultPath: brainsRoot });
  assert.throws(() => service.addReadingNote({ pageId: "cs-brain/nope", text: "x" }), /没有找到这篇笔记/);
  const result = service.addReadingNote({ pageId: "cs-brain/concepts/A", text: "测试服务层" });
  assert.equal(result.saved, true);
  assert.ok(fs.existsSync(result.path));
});
