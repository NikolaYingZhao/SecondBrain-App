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
