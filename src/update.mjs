import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import semver from "semver";
import { CliError, PACKAGE, PACKAGE_ROOT, SKILL_NAME } from "./context.mjs";
import { skillInstall } from "./skill-manager.mjs";

const INTERVAL = 24 * 60 * 60 * 1000;
const TIMEOUT = 5000;
const DISABLE_ENV = "REFERENCE_STYLE_RESTYLER_DISABLE_AUTO_UPDATE";

export function cachePath({ home = os.homedir(), env = process.env, platform = process.platform } = {}) {
  const base = platform === "win32" ? env.LOCALAPPDATA || path.join(home, "AppData", "Local") : platform === "darwin" ? env.XDG_CACHE_HOME || path.join(home, "Library", "Caches") : env.XDG_CACHE_HOME || path.join(home, ".cache");
  return path.join(base, SKILL_NAME, "update.json");
}

async function readCache(file) {
  try {
    const data = JSON.parse(await fsp.readFile(file, "utf8"));
    return data.package === PACKAGE.name && data.schemaVersion === 1 ? data : null;
  } catch { return null; }
}

async function saveCache(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const existing = await readCache(file);
  if (fs.existsSync(file) && !existing) return false;
  const staged = `${file}.stage-${process.pid}-${Date.now()}`;
  await fsp.writeFile(staged, `${JSON.stringify(data, null, 2)}\n`, { flag: "wx" });
  if (existing) {
    const backup = `${file}.backup-${Date.now()}`;
    await fsp.rename(file, backup);
    try { await fsp.rename(staged, file); }
    catch (error) { await fsp.rename(backup, file).catch(() => {}); throw error; }
  } else await fsp.rename(staged, file);
  return true;
}

export async function checkUpdate({ force = false, fetchImpl = globalThis.fetch, cache = cachePath(), now = Date.now() } = {}) {
  const prior = await readCache(cache);
  if (!force && prior?.currentVersion === PACKAGE.version && now - Date.parse(prior.checkedAt) < INTERVAL) return { ...prior.result, cached: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  let result;
  try {
    const response = await fetchImpl(`https://registry.npmjs.org/${encodeURIComponent(PACKAGE.name)}`, { headers: { accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error(`npm registry HTTP ${response.status}`);
    const metadata = await response.json();
    const latest = metadata?.["dist-tags"]?.latest;
    if (!semver.valid(latest)) throw new Error("npm latest dist-tag is not a semantic version");
    result = { ok: true, package: PACKAGE.name, currentVersion: PACKAGE.version, latestVersion: latest, updateAvailable: semver.gt(latest, PACKAGE.version), checkedAt: new Date(now).toISOString(), cached: false };
  } catch (error) {
    result = { ok: false, package: PACKAGE.name, currentVersion: PACKAGE.version, latestVersion: null, updateAvailable: false, checkedAt: new Date(now).toISOString(), cached: false, warning: error.name === "AbortError" ? "registry timeout" : error.message };
  } finally { clearTimeout(timer); }
  await saveCache(cache, { schemaVersion: 1, package: PACKAGE.name, currentVersion: PACKAGE.version, checkedAt: result.checkedAt, result }).catch(() => {});
  return result;
}

function run(executable, args, { env = process.env, shell = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, shell, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve({ code, stdout, stderr }) : reject(new CliError("NPM_FAILED", `npm exited ${code}: ${stderr.trim() || stdout.trim()}`, { code })));
  });
}

export async function npmRuntime({ home = os.homedir(), platform = process.platform } = {}) {
  if (platform === "win32") {
    const infoPath = path.join(home, ".sealseek", "binaries", "runtime-info.json");
    try {
      const info = JSON.parse(await fsp.readFile(infoPath, "utf8"));
      const node = info.node?.executablePath;
      const npmCli = path.join(info.node?.installPath || "", "node_modules", "npm", "bin", "npm-cli.js");
      if (node && fs.existsSync(node) && fs.existsSync(npmCli)) return { executable: node, argsPrefix: [npmCli], prefix: info.node?.npmGlobalDir || null, shell: false };
    } catch { /* Ordinary Windows npm may still be available. */ }
    return { executable: "npm.cmd", argsPrefix: [], prefix: null, shell: true };
  }
  return { executable: "npm", argsPrefix: [], prefix: null, shell: false };
}

async function npmCommand(runtime, args) { return run(runtime.executable, [...runtime.argsPrefix, ...args], { shell: runtime.shell }); }

export async function globalInstallInfo() {
  const runtime = await npmRuntime();
  let globalRoot;
  try { globalRoot = (await npmCommand(runtime, ["root", "-g"])).stdout.trim(); }
  catch { return { installed: false, runtime, globalRoot: null }; }
  const expected = path.join(globalRoot, "@petercjl", SKILL_NAME);
  const expectedStat = await fsp.lstat(expected).catch(() => null);
  if (expectedStat?.isSymbolicLink()) return { installed: false, runtime, globalRoot, expected, reason: "linked-source-checkout" };
  const actual = await fsp.realpath(PACKAGE_ROOT).catch(() => PACKAGE_ROOT);
  const resolvedExpected = await fsp.realpath(expected).catch(() => expected);
  return { installed: actual === resolvedExpected, runtime, globalRoot, expected };
}

export async function installUpdate({ force = false, knownCheck = null } = {}) {
  const location = await globalInstallInfo();
  if (!location.installed) throw new CliError("SOURCE_CHECKOUT", "This checkout is not a global npm installation; update it through Git and the release workflow.");
  const check = knownCheck || await checkUpdate({ force: true });
  if (!check.ok) throw new CliError("REGISTRY_UNAVAILABLE", check.warning || "Cannot check npm registry");
  if (!check.updateAvailable && !force) return { ok: true, updated: false, ...check };
  const args = ["install", "--global"];
  if (location.runtime.prefix) args.push("--prefix", location.runtime.prefix);
  args.push(`${PACKAGE.name}@${check.latestVersion}`);
  await npmCommand(location.runtime, args);
  const newEntry = path.join(location.expected, "bin", `${SKILL_NAME}.mjs`);
  const verification = await run(process.execPath, [newEntry, "--version"], { env: { ...process.env, [DISABLE_ENV]: "1" } });
  if (verification.stdout.trim() !== check.latestVersion) throw new CliError("VERSION_MISMATCH", `Installed CLI reports ${verification.stdout.trim()}, expected ${check.latestVersion}`);
  const refresh = await run(process.execPath, [newEntry, "skill", "update", "--agent", "auto", "--json"], { env: { ...process.env, [DISABLE_ENV]: "1" } });
  const refreshed = JSON.parse(refresh.stdout);
  if (!refreshed.ok) throw new CliError("SKILL_UPDATE_FAILED", "Package updated but a managed Skill did not refresh", refreshed);
  return { ok: true, updated: true, from: PACKAGE.version, to: check.latestVersion, entry: newEntry, skill: refreshed };
}

export async function autoUpdateOnStart(args) {
  if (process.env[DISABLE_ENV] === "1" || process.env.REFERENCE_STYLE_RESTYLER_UPDATE_GUARD === "1") return null;
  if (["help", "--help", "--version", "version", "doctor", "update", "skill"].includes(args[0])) return null;
  const location = await globalInstallInfo();
  if (!location.installed) return null;
  const check = await checkUpdate();
  if (!check.updateAvailable) return { checked: true, updated: false, warning: check.warning || null };
  try {
    const installed = await installUpdate({ knownCheck: check });
    return { checked: true, ...installed };
  } catch (error) {
    return { checked: true, updated: false, warning: `Automatic update failed: ${error.message}` };
  }
}
