import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CliError, PACKAGE, SKILL_NAME, SKILL_SOURCE } from "./context.mjs";

const MANIFEST = ".reference-style-restyler-install.json";
const UI_METADATA = path.join("agents", "openai.yaml");
const LEGACY_DEFAULT_PROMPT = "Use $reference-style-restyler to restyle this image with the default preset while preserving its composition and aspect ratio.";

export function targets(agent = "auto", { home = os.homedir(), env = process.env } = {}) {
  const definitions = [
    { agent: "codex", root: env.CODEX_HOME || path.join(home, ".codex") },
    { agent: "sealseek", root: env.SEALSEEK_HOME || path.join(home, ".sealseek") },
  ].map(item => ({ ...item, target: item.agent === "sealseek" ? path.join(item.root, "workspace", "skills", SKILL_NAME) : path.join(item.root, "skills", SKILL_NAME) }));
  if (agent === "auto") return definitions.filter(item => fs.existsSync(item.root));
  if (agent === "all") return definitions;
  const selected = definitions.find(item => item.agent === agent);
  if (!selected) throw new CliError("INVALID_AGENT", "--agent must be auto, all, codex or sealseek");
  return [selected];
}

async function hashSkill(dir, { excludeUi = false } = {}) {
  const hash = crypto.createHash("sha256");
  async function visit(current) {
    for (const entry of (await fsp.readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === MANIFEST || (excludeUi && path.relative(dir, path.join(current, entry.name)) === UI_METADATA)) continue;
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) { hash.update(path.relative(dir, file)); hash.update("\0"); hash.update(await fsp.readFile(file)); hash.update("\0"); }
    }
  }
  await visit(dir);
  return hash.digest("hex");
}

async function hashFile(file) {
  return crypto.createHash("sha256").update(await fsp.readFile(file)).digest("hex");
}

async function lstatOrNull(file) {
  try { return await fsp.lstat(file); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function readManifest(target) {
  try { return JSON.parse(await fsp.readFile(path.join(target, MANIFEST), "utf8")); }
  catch { return null; }
}

export async function skillSource() {
  await fsp.access(path.join(SKILL_SOURCE, "SKILL.md"));
  return { ok: true, package: PACKAGE.name, version: PACKAGE.version, skill: SKILL_NAME, source: SKILL_SOURCE, hash: await hashSkill(SKILL_SOURCE) };
}

export async function skillStatus(agent = "auto", options = {}) {
  const source = await skillSource();
  const items = [];
  for (const item of targets(agent, options)) {
    const stat = await lstatOrNull(item.target);
    if (!stat) { items.push({ ...item, installed: false, managed: false, current: false }); continue; }
    if (stat.isSymbolicLink()) {
      const resolved = await fsp.realpath(item.target).catch(() => null);
      items.push({ ...item, installed: Boolean(resolved), managed: resolved === await fsp.realpath(SKILL_SOURCE), current: resolved === await fsp.realpath(SKILL_SOURCE), mode: "link", resolved });
      continue;
    }
    const manifest = await readManifest(item.target);
    const managed = manifest?.package === PACKAGE.name && manifest?.skill === SKILL_NAME;
    const hash = stat.isDirectory() ? await hashSkill(item.target, { excludeUi: true }) : null;
    const uiPresent = stat.isDirectory() && Boolean(await lstatOrNull(path.join(item.target, UI_METADATA)));
    items.push({ ...item, installed: stat.isDirectory(), managed, current: managed && uiPresent && manifest?.sourceHash === source.hash && hash === await hashSkill(SKILL_SOURCE, { excludeUi: true }), mode: "copy", installedVersion: manifest?.version || null, hash });
  }
  return { ...source, ok: items.some(item => item.current) && items.every(item => !item.managed || item.current), targets: items };
}

function suffix() { return new Date().toISOString().replace(/[:.]/g, "-") + `-${process.pid}`; }

async function stageInstall(target, mode, source) {
  const stage = `${target}.stage-${suffix()}`;
  if (await lstatOrNull(stage)) throw new CliError("STAGE_EXISTS", `Unexpected stage path: ${stage}`);
  if (mode !== "copy") {
    try { await fsp.symlink(source, stage, process.platform === "win32" ? "junction" : "dir"); return { stage, mode: "link" }; }
    catch (error) { if (mode === "link") throw error; }
  }
  await fsp.cp(source, stage, { recursive: true, errorOnExist: true, force: false });
  await fsp.writeFile(path.join(stage, MANIFEST), `${JSON.stringify({ schemaVersion: 2, package: PACKAGE.name, skill: SKILL_NAME, version: PACKAGE.version, sourceHash: await hashSkill(source), uiSourceHash: await hashFile(path.join(source, UI_METADATA)) }, null, 2)}\n`, { flag: "wx" });
  return { stage, mode: "copy" };
}

async function preserveCustomizedUi(target, stage) {
  const oldUi = path.join(target, UI_METADATA);
  const newUi = path.join(stage, UI_METADATA);
  if (!await lstatOrNull(oldUi) || !await lstatOrNull(newUi)) return;
  const manifest = await readManifest(target);
  const oldText = await fsp.readFile(oldUi, "utf8");
  const oldHash = await hashFile(oldUi);
  const isCustomized = manifest?.uiSourceHash
    ? oldHash !== manifest.uiSourceHash
    : !oldText.includes(LEGACY_DEFAULT_PROMPT);
  if (isCustomized) await fsp.copyFile(oldUi, newUi);
}

async function syncStageInPlace(stage, target) {
  for (const entry of await fsp.readdir(stage, { withFileTypes: true })) {
    const from = path.join(stage, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await fsp.mkdir(to, { recursive: true });
      await syncStageInPlace(from, to);
    } else if (entry.isFile()) await fsp.copyFile(from, to);
  }
}

export async function skillInstall(agent = "auto", { adopt = false, mode = "auto", rename = fsp.rename, ...options } = {}) {
  if (!["auto", "link", "copy"].includes(mode)) throw new CliError("INVALID_MODE", "--mode must be auto, link or copy");
  const source = await skillSource();
  const selected = targets(agent, options);
  if (!selected.length) throw new CliError("NO_AGENT_ROOTS", "No Agent roots found; choose --agent codex or sealseek");
  const results = [];
  for (const item of selected) {
    const existing = await lstatOrNull(item.target);
    const current = (await skillStatus(item.agent, options)).targets[0];
    if (existing && !current.managed && !adopt) throw new CliError("UNMANAGED_TARGET_EXISTS", `Existing Skill is user-owned: ${item.target}. Use --adopt after reviewing it; a backup will be retained.`, { target: item.target });
    if (current.current) { results.push({ agent: item.agent, target: item.target, current: true, unchanged: true }); continue; }
    await fsp.mkdir(path.dirname(item.target), { recursive: true });
    const staged = await stageInstall(item.target, mode, source.source);
    let backup = null;
    let inPlace = false;
    try {
      if (existing && current.managed && staged.mode === "copy") await preserveCustomizedUi(item.target, staged.stage);
      if (existing) {
        backup = `${item.target}.backup-${suffix()}`;
        if (await lstatOrNull(backup)) throw new CliError("BACKUP_EXISTS", `Backup target exists: ${backup}`);
        try { await rename(item.target, backup); }
        catch (error) {
          if (!current.managed || staged.mode !== "copy" || !existing.isDirectory() || !["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw error;
          await fsp.cp(item.target, backup, { recursive: true, errorOnExist: true, force: false });
          inPlace = true;
        }
      }
      if (inPlace) await syncStageInPlace(staged.stage, item.target);
      else await rename(staged.stage, item.target);
    } catch (error) {
      if (backup && !await lstatOrNull(item.target)) await fsp.rename(backup, item.target).catch(() => {});
      else if (backup && inPlace) await syncStageInPlace(backup, item.target).catch(() => {});
      await fsp.rm(staged.stage, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
    if (inPlace) await fsp.rm(staged.stage, { recursive: true, force: true });
    results.push({ agent: item.agent, target: item.target, mode: inPlace ? "copy-in-place" : staged.mode, backup, current: true });
  }
  const verified = await skillStatus(agent, options);
  return { ok: verified.ok, package: PACKAGE.name, version: PACKAGE.version, source: source.source, targets: results, verified: verified.targets };
}

export async function skillRefreshManaged(agent = "auto", options = {}) {
  const before = await skillStatus(agent, options);
  const results = [];
  for (const item of before.targets) {
    if (!item.installed || !item.managed) {
      results.push({ agent: item.agent, target: item.target, updated: false, skipped: item.installed ? "unmanaged" : "missing" });
      continue;
    }
    const installed = await skillInstall(item.agent, options);
    results.push({ agent: item.agent, target: item.target, updated: !installed.targets[0].unchanged, current: installed.verified[0].current, backup: installed.targets[0].backup || null });
  }
  return { ok: results.every(item => item.skipped || item.current), package: PACKAGE.name, version: PACKAGE.version, targets: results };
}
