import fs from "node:fs";
import path from "node:path";

const SYSTEM_PAGES = new Set(["log.md"]);
const ARCHIVED_STATES = new Set(["archived", "compiled", "done", "skip"]);

export function parseFrontmatter(text) {
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) return { metadata: {}, body: text };

  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 1 || /^\s/.test(line)) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    value = value.replace(/^["']|["']$/g, "");
    metadata[key] = value;
  }
  return { metadata, body: text.slice(match[0].length) };
}

export function extractWikilinks(text) {
  return [...text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function walk(root, predicate = () => true) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (predicate(fullPath)) files.push(fullPath);
    }
  }
  return files;
}

function firstHeading(text, fallback) {
  return text.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback;
}

function cleanSnippet(text, length = 180) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, "$2$1")
    .replace(/[#>*_=`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, length);
}

function normalizeDate(value, fallback) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString();
}

function pathId(brainId, relativePath) {
  return `${brainId}/${relativePath.replace(/\\/g, "/").replace(/\.md$/i, "")}`;
}

function canonical(value) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s_—–\-:：·'"“”‘’《》〈〉()[\]（）【】]/g, "");
}

function findFileByLeaf(root, leaf) {
  const wanted = canonical(path.basename(leaf, path.extname(leaf)));
  const matches = walk(root, (file) => canonical(path.basename(file, path.extname(file))) === wanted);
  return matches.length === 1 ? matches[0] : null;
}

export function resolveLink(link, page, pages, registry, root) {
  const normalized = link.replace(/\\/g, "/").replace(/\.md$/i, "").trim();
  if (!normalized) return { kind: "missing", target: link };

  if (/(^|\/)raw\//.test(normalized)) {
    const directCandidates = [
      path.resolve(path.dirname(page.fullPath), normalized),
      path.resolve(path.dirname(page.fullPath), `${normalized}.md`),
      path.resolve(root, normalized),
      path.resolve(root, `${normalized}.md`)
    ];
    const sourcePath = directCandidates.find((candidate) => fs.existsSync(candidate))
      || findFileByLeaf(path.join(root, "brains"), path.posix.basename(normalized));
    return sourcePath ? { kind: "source", target: sourcePath } : { kind: "missing-source", target: link };
  }

  const labelMatch = normalized.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
  let targetBrain = page.brain;
  let targetPath = normalized;
  if (labelMatch) {
    const requested = labelMatch[1].trim();
    const brain = registry.brains.find((item) =>
      [item.id, item.name, item.short].includes(requested)
    );
    targetBrain = brain?.id || registry.aliases[requested] || requested;
    targetPath = labelMatch[2].trim();
  }

  const embeddedBrain = normalized.match(/(?:^|\/)([^/]+-brain)\/wiki\/(.+)$/);
  if (embeddedBrain) {
    targetBrain = registry.aliases[embeddedBrain[1]] || embeddedBrain[1];
    targetPath = embeddedBrain[2];
  } else if (normalized.startsWith("brains/")) {
    const parts = normalized.split("/");
    targetBrain = registry.aliases[parts[1]] || parts[1];
    const wikiIndex = parts.indexOf("wiki");
    targetPath = wikiIndex >= 0 ? parts.slice(wikiIndex + 1).join("/") : parts.slice(2).join("/");
  } else if (normalized.includes("../")) {
    const absolute = path.resolve(path.dirname(page.fullPath), `${normalized}.md`);
    const relative = path.relative(path.join(root, "brains"), absolute).replace(/\\/g, "/");
    const parts = relative.split("/");
    const wikiIndex = parts.indexOf("wiki");
    if (wikiIndex >= 0) {
      targetBrain = registry.aliases[parts[0]] || parts[0];
      targetPath = parts.slice(wikiIndex + 1).join("/").replace(/\.md$/i, "");
    }
  }

  targetBrain = registry.aliases[targetBrain] || targetBrain;
  const brainTarget = registry.brains.find((brain) =>
    [brain.id, brain.name, brain.short].some((value) => canonical(value) === canonical(normalized))
  );
  if (brainTarget) return { kind: "brain", id: brainTarget.id };

  const exact = `${targetBrain}/${targetPath}`;
  if (pages.has(exact)) return { kind: "page", id: exact };

  const leaf = path.posix.basename(targetPath);
  const inBrain = [...pages.values()].filter(
    (candidate) => candidate.brain === targetBrain
      && [candidate.name, candidate.title].some((value) => canonical(value) === canonical(leaf))
  );
  if (inBrain.length === 1) return { kind: "page", id: inBrain[0].id };

  const global = [...pages.values()].filter((candidate) =>
    [candidate.name, candidate.title].some((value) => canonical(value) === canonical(leaf))
  );
  if (global.length === 1) return { kind: "page", id: global[0].id };
  if (global.length > 1) return { kind: "ambiguous", target: link, candidates: global.map((p) => p.id) };

  const rootResource = [
    path.resolve(path.dirname(page.fullPath), normalized),
    path.resolve(path.dirname(page.fullPath), `${normalized}.md`),
    path.resolve(root, normalized),
    path.resolve(root, `${normalized}.md`)
  ].find((candidate) => fs.existsSync(candidate));
  if (rootResource) return { kind: "source", target: rootResource };

  if (/target-brain|path\/to\/page|示例|example/i.test(normalized)) {
    return { kind: "example", target: link };
  }
  return { kind: "missing", target: link };
}

export function loadRegistry(v2Root) {
  return JSON.parse(fs.readFileSync(path.join(v2Root, "config", "brains.json"), "utf8"));
}

export function compileKnowledge({
  projectRoot,
  brainsRoot = path.join(projectRoot, "brains"),
  v2Root,
  now = new Date()
}) {
  const registry = loadRegistry(v2Root);
  const configured = new Map(registry.brains.map((brain) => [brain.id, brain]));
  const discovered = fs.readdirSync(brainsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith("-brain"))
    .map((entry) => entry.name);

  for (const id of discovered) {
    if (!configured.has(id)) {
      configured.set(id, {
        id,
        name: id.replace(/-brain$/, ""),
        short: id.replace(/-brain$/, ""),
        status: "unregistered",
        color: "#777777",
        domains: []
      });
    }
  }

  const pages = new Map();
  const brainStats = [];
  const issues = [];

  for (const brain of configured.values()) {
    const brainRoot = path.join(brainsRoot, brain.id);
    if (!fs.existsSync(brainRoot)) {
      issues.push({ severity: "warning", code: "brain-missing", brain: brain.id, message: "注册脑区目录不存在" });
      continue;
    }

    const wikiRoot = path.join(brainRoot, "wiki");
    const rawRoot = path.join(brainRoot, "raw");
    const wikiFiles = walk(wikiRoot, (file) => file.endsWith(".md") && !SYSTEM_PAGES.has(path.basename(file)));
    const rawFiles = walk(rawRoot, (file) => file.endsWith(".md"));

    for (const fullPath of wikiFiles) {
      const text = fs.readFileSync(fullPath, "utf8");
      const { metadata, body } = parseFrontmatter(text);
      const relativePath = path.relative(wikiRoot, fullPath).replace(/\\/g, "/");
      const stat = fs.statSync(fullPath);
      const name = path.basename(fullPath, ".md");
      const id = pathId(brain.id, relativePath);
      const missingMetadata = name === "index"
        ? []
        : ["brain", "type", "created", "updated"].filter((key) => !metadata[key]);
      if (missingMetadata.length) {
        issues.push({
          severity: "info",
          code: "metadata",
          brain: brain.id,
          page: id,
          message: `缺少元数据：${missingMetadata.join(", ")}`
        });
      }
      pages.set(id, {
        id,
        brain: brain.id,
        brainName: brain.name,
        color: brain.color,
        path: relativePath.replace(/\.md$/i, ""),
        fullPath,
        name,
        title: metadata.title || firstHeading(body, name),
        type: metadata.type || "page",
        created: metadata.created || "",
        updated: normalizeDate(metadata.updated, stat.mtime),
        metadata,
        body,
        snippet: cleanSnippet(body),
        rawLinks: extractWikilinks(text),
        outlinks: [],
        backlinks: [],
        linkMap: {},
        searchText: `${metadata.title || ""} ${name} ${body}`.toLocaleLowerCase("zh-CN")
      });
    }

    brainStats.push({
      ...brain,
      pages: wikiFiles.length,
      raw: rawFiles.length,
      schema: fs.existsSync(path.join(brainRoot, "schema.md"))
    });
  }

  const incoming = new Map();
  let linkCount = 0;
  for (const page of pages.values()) {
    for (const link of new Set(page.rawLinks)) {
      const resolved = resolveLink(link, page, pages, registry, projectRoot);
      if (resolved.kind === "page") {
        page.outlinks.push(resolved.id);
        page.linkMap[link] = { kind: "page", id: resolved.id };
        if (!incoming.has(resolved.id)) incoming.set(resolved.id, []);
        incoming.get(resolved.id).push(page.id);
        linkCount += 1;
      } else if (resolved.kind === "brain") {
        page.linkMap[link] = { kind: "brain", id: resolved.id };
      } else if (resolved.kind === "missing") {
        issues.push({
          severity: "warning",
          code: "knowledge-gap",
          brain: page.brain,
          page: page.id,
          target: link,
          message: `尚未创建链接目标：${link}`
        });
      } else if (resolved.kind === "ambiguous") {
        issues.push({
          severity: "warning",
          code: "ambiguous",
          brain: page.brain,
          page: page.id,
          target: link,
          message: `链接目标不唯一：${link}`
        });
      } else if (resolved.kind === "missing-source") {
        issues.push({
          severity: "info",
          code: "source-reference",
          brain: page.brain,
          page: page.id,
          target: link,
          message: `原始来源暂不可定位：${link}`
        });
      }
    }
  }

  for (const page of pages.values()) {
    page.backlinks = incoming.get(page.id) || [];
    if (!page.backlinks.length) {
      issues.push({ severity: "info", code: "orphan", brain: page.brain, page: page.id, message: "页面没有入链" });
    }
  }

  const captureQueue = [];
  const inboxRaw = path.join(brainsRoot, "inbox-brain", "raw");
  for (const fullPath of walk(inboxRaw, (file) => file.endsWith(".md"))) {
    const text = fs.readFileSync(fullPath, "utf8");
    const { metadata, body } = parseFrontmatter(text);
    if (ARCHIVED_STATES.has((metadata.status || "").toLowerCase())) continue;
    const stat = fs.statSync(fullPath);
    captureQueue.push({
      id: path.relative(projectRoot, fullPath).replace(/\\/g, "/"),
      title: metadata.title || firstHeading(body, path.basename(fullPath, ".md")),
      updated: stat.mtime.toISOString(),
      ageDays: Math.floor((now - stat.mtime) / 86400000),
      snippet: cleanSnippet(body, 120)
    });
  }

  const pendingRoutes = [...pages.values()]
    .filter((page) => page.brain === "media-brain" && page.metadata.route_status === "pending")
    .map((page) => ({ id: page.id, title: page.title, updated: page.updated }));

  const recent = [...pages.values()]
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, 12)
    .map(({ id, title, brain, brainName, color, updated, snippet }) => ({
      id, title, brain, brainName, color, updated, snippet
    }));

  const resurfacingPool = [...pages.values()]
    .filter((page) => page.type === "synthesis" || page.outlinks.length + page.backlinks.length >= 3)
    .sort((a, b) => a.updated.localeCompare(b.updated));
  const resurfacing = resurfacingPool.length
    ? resurfacingPool[now.getDate() % resurfacingPool.length]
    : [...pages.values()][0];

  const pagePayload = [...pages.values()].map(({ fullPath, searchText, rawLinks, ...page }) => page);
  const summary = {
    generatedAt: now.toISOString(),
    brains: brainStats.length,
    pages: pages.size,
    links: linkCount,
    captures: captureQueue.length,
    pendingRoutes: pendingRoutes.length,
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    knowledgeGaps: issues.filter((issue) => issue.code === "knowledge-gap").length,
    orphans: issues.filter((issue) => issue.code === "orphan").length,
    metadataIssues: issues.filter((issue) => issue.code === "metadata").length
  };

  return {
    summary,
    registry: { brains: brainStats, aliases: registry.aliases },
    queues: { captures: captureQueue, routes: pendingRoutes },
    recent,
    resurfacing: resurfacing ? {
      id: resurfacing.id,
      title: resurfacing.title,
      brain: resurfacing.brain,
      brainName: resurfacing.brainName,
      color: resurfacing.color,
      snippet: resurfacing.snippet,
      updated: resurfacing.updated
    } : null,
    issues,
    pages: pagePayload
  };
}

export function searchKnowledge(index, query, limit = 24) {
  const terms = query.toLocaleLowerCase("zh-CN").split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return index.pages
    .map((page) => {
      const haystack = `${page.title} ${page.name} ${page.body}`.toLocaleLowerCase("zh-CN");
      const score = terms.reduce((total, term) => {
        if (!haystack.includes(term)) return total;
        return total + (page.title.toLocaleLowerCase("zh-CN").includes(term) ? 20 : 3);
      }, 0);
      return { page, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.page.updated.localeCompare(a.page.updated))
    .slice(0, limit)
    .map(({ page, score }) => ({
      id: page.id,
      title: page.title,
      brain: page.brain,
      brainName: page.brainName,
      color: page.color,
      type: page.type,
      updated: page.updated,
      snippet: page.snippet,
      score
    }));
}
