import fs from "node:fs";
import path from "node:path";
import { renderMarkdown } from "./markdown.mjs";
import { compileKnowledge, searchKnowledge } from "./wiki.mjs";

export function normalizeVaultPath(candidate) {
  if (!candidate) return null;
  const resolved = path.resolve(candidate);
  if (path.basename(resolved).toLocaleLowerCase("en-US") === "brains") return resolved;
  const nested = path.join(resolved, "brains");
  return fs.existsSync(nested) ? nested : resolved;
}

export function validateVaultPath(candidate) {
  const vaultPath = normalizeVaultPath(candidate);
  if (!vaultPath || !fs.existsSync(vaultPath) || !fs.statSync(vaultPath).isDirectory()) {
    return { valid: false, vaultPath, reason: "所选路径不存在或不是文件夹。" };
  }
  const hasBrains = fs.readdirSync(vaultPath, { withFileTypes: true })
    .some((entry) => entry.isDirectory() && entry.name.endsWith("-brain"));
  if (!hasBrains) {
    return { valid: false, vaultPath, reason: "没有找到任何以 -brain 结尾的脑区目录。" };
  }
  return { valid: true, vaultPath };
}

function timestampParts(now) {
  const pad = (value) => String(value).padStart(2, "0");
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    clock: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    stamp: `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  };
}

export function writeReadingNote({ brainsRoot, page, text, selection = "", now = new Date() }) {
  const note = String(text || "").trim();
  if (!note) throw new Error("想法内容为空。");
  if (!page?.id) throw new Error("缺少目标页面。");
  const quoted = String(selection || "").trim().replace(/\s+/g, " ").slice(0, 200);

  const fragmentsRoot = path.resolve(path.join(brainsRoot, "inbox-brain", "raw", "fragments"));
  const { date, clock, stamp } = timestampParts(now);
  const target = path.join(fragmentsRoot, `想法-${stamp}.md`);
  if (!target.startsWith(fragmentsRoot + path.sep)) throw new Error("写入路径越界。");

  fs.mkdirSync(fragmentsRoot, { recursive: true });
  const content = [
    "---",
    "type: reading-note",
    `created: ${date}`,
    `source: "[[${page.path}]]"`,
    "---",
    `# 阅读想法 · 《${page.title}》 ${clock}`,
    "",
    ...(quoted ? ["原文：", `> ${quoted}`, ""] : []),
    "想法：",
    note,
    ""
  ].join("\n");
  fs.writeFileSync(target, content, "utf8");
  return { saved: true, file: path.relative(brainsRoot, target), path: target };
}

export class KnowledgeService {
  constructor({ v2Root, vaultPath }) {
    this.v2Root = v2Root;
    this.vaultPath = null;
    this.index = null;
    if (vaultPath) this.setVault(vaultPath);
  }

  setVault(candidate) {
    const validation = validateVaultPath(candidate);
    if (!validation.valid) throw new Error(validation.reason);
    this.vaultPath = validation.vaultPath;
    return this.rebuild();
  }

  requireIndex() {
    if (!this.index) throw new Error("尚未选择 SecondBrain 数据文件夹。");
    return this.index;
  }

  rebuild() {
    if (!this.vaultPath) return null;
    this.index = compileKnowledge({
      projectRoot: path.dirname(this.vaultPath),
      brainsRoot: this.vaultPath,
      v2Root: this.v2Root
    });
    return this.dashboard();
  }

  dashboard() {
    const { pages, issues, ...dashboard } = this.requireIndex();
    return {
      ...dashboard,
      issuePreview: issues.filter((issue) => issue.severity !== "info").slice(0, 30)
    };
  }

  search(query) {
    return searchKnowledge(this.requireIndex(), query || "");
  }

  page(id) {
    const page = this.requireIndex().pages.find((item) => item.id === id);
    if (!page) throw new Error("没有找到这篇笔记。");
    return { ...page, html: renderMarkdown(page) };
  }

  addReadingNote(payload = {}) {
    const page = this.requireIndex().pages.find((item) => item.id === payload.pageId);
    if (!page) throw new Error("没有找到这篇笔记。");
    return writeReadingNote({ brainsRoot: this.vaultPath, page, text: payload.text, selection: payload.selection });
  }

  pages(brain = "") {
    return this.requireIndex().pages
      .filter((page) => !brain || page.brain === brain)
      .sort((a, b) => a.path.localeCompare(b.path, "zh-CN"))
      .map(({ body, linkMap, outlinks, backlinks, ...page }) => ({
        ...page,
        links: outlinks.length + backlinks.length
      }));
  }

  issues() {
    return this.requireIndex().issues;
  }

  info() {
    return {
      configured: Boolean(this.vaultPath),
      vaultPath: this.vaultPath,
      pages: this.index?.summary.pages || 0
    };
  }
}
