import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderMarkdown } from "./markdown.mjs";
import { compileKnowledge, searchKnowledge } from "./wiki.mjs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const v2Root = path.resolve(currentDir, "..");
const projectRoot = path.resolve(v2Root, "..");
const publicRoot = path.join(v2Root, "public");
const port = Number(process.env.SECONDBRAIN_V2_PORT || 4173);
let index = compileKnowledge({ projectRoot, v2Root });

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(response, value, status = 200) {
  response.writeHead(status, { "Content-Type": contentTypes[".json"], "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

function dashboardPayload() {
  const { pages, issues, ...dashboard } = index;
  return {
    ...dashboard,
    issuePreview: issues.filter((issue) => issue.severity !== "info").slice(0, 30)
  };
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (url.pathname === "/favicon.ico") {
    response.writeHead(204);
    return response.end();
  }
  if (url.pathname === "/api/dashboard") return sendJson(response, dashboardPayload());
  if (url.pathname === "/api/search") return sendJson(response, searchKnowledge(index, url.searchParams.get("q") || ""));
  if (url.pathname === "/api/page") {
    const page = index.pages.find((item) => item.id === url.searchParams.get("id"));
    return page ? sendJson(response, { ...page, html: renderMarkdown(page) }) : sendJson(response, { error: "Page not found" }, 404);
  }
  if (url.pathname === "/api/pages") {
    const brain = url.searchParams.get("brain") || "";
    const pages = index.pages
      .filter((page) => !brain || page.brain === brain)
      .sort((a, b) => a.path.localeCompare(b.path, "zh-CN"))
      .map(({ body, linkMap, outlinks, backlinks, ...page }) => ({
        ...page,
        links: outlinks.length + backlinks.length
      }));
    return sendJson(response, pages);
  }
  if (url.pathname === "/api/issues") return sendJson(response, index.issues);
  if (url.pathname === "/api/rebuild" && request.method === "POST") {
    index = compileKnowledge({ projectRoot, v2Root });
    return sendJson(response, dashboardPayload());
  }

  const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const filePath = path.resolve(publicRoot, requested);
  if (!filePath.startsWith(publicRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404);
    return response.end("Not found");
  }
  response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`SecondBrain V2: http://127.0.0.1:${port}`);
  console.log(`Indexed ${index.summary.pages} pages from the existing brains/ tree (read-only).`);
});
