import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { renderMarkdown } from "../src/markdown.mjs";
import { KnowledgeService, normalizeVaultPath, validateVaultPath } from "../src/service.mjs";
import { compileKnowledge, extractWikilinks, parseFrontmatter, resolveLink, searchKnowledge } from "../src/wiki.mjs";

test("parses frontmatter and wikilinks", () => {
  const source = "---\nbrain: cs\ntype: concept\n---\n# Cache\nSee [[Consistency|一致性]] and [[Other#Part]].";
  const parsed = parseFrontmatter(source);
  assert.equal(parsed.metadata.brain, "cs");
  assert.deepEqual(extractWikilinks(parsed.body), ["Consistency", "Other"]);
});

test("compiles a read-only mini vault and resolves links", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "secondbrain-v2-"));
  const v2Root = path.join(root, "secondbrain-v2");
  const brainRoot = path.join(root, "brains", "cs-brain");
  fs.mkdirSync(path.join(v2Root, "config"), { recursive: true });
  fs.mkdirSync(path.join(brainRoot, "wiki", "concepts"), { recursive: true });
  fs.mkdirSync(path.join(brainRoot, "raw"), { recursive: true });
  fs.writeFileSync(path.join(brainRoot, "schema.md"), "# schema");
  fs.writeFileSync(path.join(v2Root, "config", "brains.json"), JSON.stringify({
    version: 1,
    aliases: {},
    brains: [{ id: "cs-brain", name: "CS", short: "CS", status: "active", color: "#000", domains: [] }]
  }));
  fs.writeFileSync(path.join(brainRoot, "wiki", "concepts", "A.md"), "---\nbrain: cs\ntype: concept\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\n# A\n[[B]]");
  fs.writeFileSync(path.join(brainRoot, "wiki", "concepts", "B.md"), "---\nbrain: cs\ntype: concept\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\n# B");
  fs.writeFileSync(path.join(brainRoot, "wiki", "index.md"), "# CS index\n[[A]]");

  const index = compileKnowledge({ projectRoot: root, v2Root, now: new Date("2026-01-02") });
  assert.equal(index.summary.pages, 3);
  assert.equal(index.summary.links, 2);
  assert.equal(searchKnowledge(index, "A")[0].title, "A");
  assert.equal(index.summary.errors, 0);
});

test("treats brain links as navigation instead of broken pages", () => {
  const registry = {
    aliases: { "计算机脑": "cs-brain" },
    brains: [{ id: "cs-brain", name: "计算机脑", short: "计算机" }]
  };
  const result = resolveLink(
    "计算机脑",
    { brain: "cs-brain", fullPath: "C:\\vault\\brains\\cs-brain\\wiki\\A.md" },
    new Map(),
    registry,
    "C:\\vault"
  );
  assert.deepEqual(result, { kind: "brain", id: "cs-brain" });
});

test("uses an external brains directory as the single data source", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "secondbrain-desktop-"));
  const v2Root = path.join(root, "application");
  const vaultRoot = path.join(root, "shared-vault", "brains");
  const brainRoot = path.join(vaultRoot, "cs-brain");
  fs.mkdirSync(path.join(v2Root, "config"), { recursive: true });
  fs.mkdirSync(path.join(brainRoot, "wiki"), { recursive: true });
  fs.mkdirSync(path.join(brainRoot, "raw"), { recursive: true });
  fs.writeFileSync(path.join(v2Root, "config", "brains.json"), JSON.stringify({
    version: 1,
    aliases: {},
    brains: [{ id: "cs-brain", name: "计算机脑", short: "计算机", status: "active", color: "#2563eb", domains: [] }]
  }));
  fs.writeFileSync(path.join(brainRoot, "wiki", "共享数据.md"), "# 共享数据\n这篇笔记不在应用代码仓库里。");

  assert.equal(normalizeVaultPath(path.dirname(vaultRoot)), vaultRoot);
  assert.equal(validateVaultPath(vaultRoot).valid, true);

  const service = new KnowledgeService({ v2Root, vaultPath: vaultRoot });
  assert.equal(service.info().vaultPath, vaultRoot);
  assert.equal(service.dashboard().summary.pages, 1);
  assert.equal(service.search("不在应用代码仓库")[0].title, "共享数据");
});

test("sanitizes rendered markdown while preserving internal wiki navigation", () => {
  const html = renderMarkdown({
    body: "# 安全页面\n[[下一页]]\n<script>window.pwned = true</script>\n<a href=\"javascript:alert(1)\">危险链接</a>",
    linkMap: { "下一页": { kind: "page", id: "cs-brain/下一页" } }
  });

  assert.match(html, /data-page-id="cs-brain%2F%E4%B8%8B%E4%B8%80%E9%A1%B5"/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /javascript:/i);
});
