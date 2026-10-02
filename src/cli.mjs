import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { CliError, PACKAGE, SKILL_SOURCE } from "./context.mjs";
import { presetList, presetShow, presetValidate } from "./presets.mjs";
import { matchCanvas } from "./canvas.mjs";
import { skillSource, skillStatus, skillInstall, skillRefreshManaged } from "./skill-manager.mjs";
import { autoUpdateOnStart, checkUpdate, globalInstallInfo, installUpdate } from "./update.mjs";
import { installSkillsAfterGlobalNpmInstall } from "./install-lifecycle.mjs";

const HELP = `reference-style-restyler ${PACKAGE.version}

Commands:
  doctor --json
  capabilities --json
  adapter status --platform codex|sealseek --json
  setup [--json]
  preset list|show <id>|validate [id] [--json]
  canvas match --input FILE --generated FILE --output FILE [--mode cover|contain] [--json]
  skill source|status|install|update [--agent auto|all|codex|sealseek] [--adopt] [--mode auto|link|copy] [--json]
  update check|install [--json]
  version

Automatic stable updates run at most once per 24 hours for global npm installs when a business command starts. Set REFERENCE_STYLE_RESTYLER_DISABLE_AUTO_UPDATE=1 to disable them. Source checkouts never self-update. Existing unmanaged Skills require explicit --adopt and are backed up.`;

function option(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}
function print(value, asJson) { console.log(asJson ? JSON.stringify(value, null, 2) : typeof value === "string" ? value : JSON.stringify(value, null, 2)); }

export async function dispatch(args) {
  const [command, action] = args;
  const json = args.includes("--json");
  if (!command || command === "help" || command === "--help" || command === "-h") return print(HELP, false);
  if (command === "version" || command === "--version") return print(PACKAGE.version, false);
  if (command === "setup") {
    const location = await globalInstallInfo();
    if (!location.installed) throw new CliError("SOURCE_CHECKOUT", "Setup requires a global npm installation of this package.");
    const result = await installSkillsAfterGlobalNpmInstall({ global: true });
    print(result, json);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (command === "capabilities") return print(JSON.parse(await fs.readFile(path.join(SKILL_SOURCE, "capabilities.json"), "utf8")), json);
  if (command === "adapter" && action === "status") {
    const platform = option(args, "--platform");
    if (!["codex", "sealseek"].includes(platform)) throw new CliError("INVALID_PLATFORM", "--platform must be codex or sealseek");
    const capability = JSON.parse(await fs.readFile(path.join(SKILL_SOURCE, "capabilities.json"), "utf8"));
    const adapter = JSON.parse(await fs.readFile(path.join(SKILL_SOURCE, "adapters", `${platform}.json`), "utf8"));
    const mappings = capability.capabilities.map(item => {
      const mapping = adapter.mappings.find(candidate => candidate.capability_id === item.id);
      const missingFeatures = item.required_features.filter(feature => !mapping?.features?.includes(feature));
      return { id: item.id, required: item.required, status: mapping?.status || "unresolved", missingFeatures };
    });
    const result = { ok: mappings.every(item => !item.required || (["tested", "implemented"].includes(item.status) && !item.missingFeatures.length)), platform, runtimeTested: mappings.every(item => !item.required || item.status === "tested"), mappings };
    print(result, json);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (command === "preset") {
    if (action === "list") return print(await presetList(), json);
    if (action === "show") return print(await presetShow(args[2]), json);
    if (action === "validate") {
      const result = await presetValidate(args[2]?.startsWith("--") ? "all" : args[2] || "all");
      print(result, json);
      if (!result.ok) process.exitCode = 1;
      return;
    }
  }
  if (command === "canvas" && action === "match") {
    const result = await matchCanvas({ input: option(args, "--input"), generated: option(args, "--generated"), output: option(args, "--output"), mode: option(args, "--mode", "cover") });
    print(result, json);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (command === "skill") {
    const agent = option(args, "--agent", "auto");
    if (action === "source") return print(await skillSource(), json);
    if (action === "status") return print(await skillStatus(agent), json);
    if (action === "install") return print(await skillInstall(agent, { adopt: args.includes("--adopt"), mode: option(args, "--mode", "auto") }), json);
    if (action === "update") return print(await skillRefreshManaged(agent), json);
  }
  if (command === "update") {
    if (action === "check") {
      const result = await checkUpdate({ force: true });
      print(result, json);
      if (!result.ok) process.exitCode = 1;
      return;
    }
    if (action === "install") return print(await installUpdate(), json);
  }
  if (command === "doctor") {
    const preset = await presetValidate();
    const source = await skillSource();
    const global = await globalInstallInfo();
    const status = await skillStatus("auto");
    const result = { ok: preset.ok && source.ok && status.ok, package: PACKAGE.name, version: PACKAGE.version, node: process.version, globalInstall: global.installed, preset, skill: status };
    print(result, json);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  throw new CliError("UNKNOWN_COMMAND", `Unknown command: ${args.join(" ")}`);
}

export async function main(args) {
  try {
    const update = await autoUpdateOnStart(args);
    if (update?.warning) console.error(`reference-style-restyler: ${update.warning}`);
    if (update?.updated && update.entry) {
      const child = spawnSync(process.execPath, [update.entry, ...args], { stdio: "inherit", env: { ...process.env, REFERENCE_STYLE_RESTYLER_UPDATE_GUARD: "1" } });
      process.exitCode = child.status ?? 1;
      return;
    }
    await dispatch(args);
  } catch (error) {
    const payload = { ok: false, error: { code: error.code || "UNEXPECTED_ERROR", message: error.message, details: error.details || {} } };
    if (args.includes("--json")) console.error(JSON.stringify(payload));
    else console.error(`${payload.error.code}: ${payload.error.message}`);
    process.exitCode = 1;
  }
}
