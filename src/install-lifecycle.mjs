import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { skillInstall, skillStatus, targets } from "./skill-manager.mjs";

export async function installSkillsAfterGlobalNpmInstall({
  global = process.env.npm_config_global === "true",
  home = os.homedir(),
  env = process.env,
  mode = "auto",
} = {}) {
  if (!global) return { ok: true, skipped: "not-global-install", targets: [] };

  const explicit = env.SEALSEEK_HOME ? "sealseek" : env.CODEX_HOME ? "codex" : null;
  const selected = explicit
    ? targets(explicit, { home, env })
    : targets("auto", { home, env });
  if (!selected.length) return { ok: true, skipped: "no-agent-root", targets: [] };

  const results = [];
  for (const item of selected) {
    if (!fs.existsSync(item.root)) {
      results.push({ agent: item.agent, target: item.target, installed: false, skipped: "agent-root-missing" });
      continue;
    }
    const current = (await skillStatus(item.agent, { home, env })).targets[0];
    if (current.installed && !current.managed) {
      results.push({ agent: item.agent, target: item.target, installed: false, skipped: "unmanaged-skill" });
      continue;
    }
    const installed = await skillInstall(item.agent, { home, env, mode });
    results.push({ agent: item.agent, target: item.target, installed: true, current: installed.verified[0].current, unchanged: Boolean(installed.targets[0].unchanged) });
  }
  return { ok: results.some(item => item.current), targets: results };
}
