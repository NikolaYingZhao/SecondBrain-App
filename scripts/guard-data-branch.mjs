import { execFileSync } from "node:child_process";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

const branch = git("branch", "--show-current");
if (!branch || branch === "master") process.exit(0);

const committed = git("diff", "--name-only", "master...HEAD", "--", "brains");
const staged = git("diff", "--cached", "--name-only", "--", "brains");
const changed = [...new Set([...committed.split("\n"), ...staged.split("\n")].filter(Boolean))];

if (changed.length) {
  console.error(`Data guard: ${branch} must not own changes under brains/.`);
  console.error(changed.map((file) => `  - ${file}`).join("\n"));
  console.error("Commit knowledge data on master, then let every application architecture read that same Vault.");
  process.exit(1);
}

console.log(`Data guard: ${branch} has no committed or staged brains/ divergence.`);
