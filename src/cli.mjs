import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileKnowledge } from "./wiki.mjs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const v2Root = path.resolve(currentDir, "..");
const projectRoot = path.resolve(v2Root, "..");
const command = process.argv[2] || "audit";
const index = compileKnowledge({ projectRoot, v2Root });

if (command === "build") {
  const output = path.join(v2Root, "data", "knowledge-index.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(index, null, 2), "utf8");
  console.log(`Built ${index.summary.pages} pages -> ${output}`);
} else if (command === "audit") {
  console.log(JSON.stringify(index.summary, null, 2));
  const byCode = Object.entries(
    index.issues.reduce((counts, issue) => {
      counts[issue.code] = (counts[issue.code] || 0) + 1;
      return counts;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
  console.table(byCode.map(([code, count]) => ({ issue: code, count })));
} else {
  console.error("Usage: node src/cli.mjs [audit|build]");
  process.exitCode = 1;
}
