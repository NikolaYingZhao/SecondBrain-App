import path from "node:path";
import { validateVaultPath } from "./service.mjs";

function uniquePaths(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (!candidate) return false;
    const resolved = path.resolve(candidate);
    const key = resolved.toLocaleLowerCase("en-US");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildVaultCandidates({
  env = process.env,
  saved,
  v2Root,
  documentsPath,
  executablePath,
  platform = process.platform
}) {
  const executableDir = executablePath ? path.dirname(executablePath) : null;
  const candidates = [
    env.SECOND_BRAIN_VAULT,
    env.SECONDBRAIN_VAULT,
    saved,
    v2Root && path.resolve(v2Root, "..", "brains"),
    executableDir && path.join(executableDir, "brains"),
    executableDir && path.resolve(executableDir, "..", "brains"),
    documentsPath && path.join(documentsPath, "SecondBrain", "brains"),
    documentsPath && path.join(documentsPath, "SecondBrain"),
    documentsPath && path.join(documentsPath, "brains")
  ];

  if (platform === "win32") {
    for (let code = "C".charCodeAt(0); code <= "Z".charCodeAt(0); code += 1) {
      const drive = String.fromCharCode(code);
      candidates.push(`${drive}:\\Documents\\SecondBrain\\brains`);
      candidates.push(`${drive}:\\Documents\\SecondBrain`);
    }
  }

  return uniquePaths(candidates);
}

export function findVaultPath(options) {
  return buildVaultCandidates(options)
    .find((candidate) => validateVaultPath(candidate).valid) || null;
}
