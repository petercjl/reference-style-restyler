import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import semver from "semver";
import { PACKAGE } from "../src/context.mjs";
import { presetList, presetShow, presetValidate } from "../src/presets.mjs";
import { matchCanvas } from "../src/canvas.mjs";
import { skillInstall, skillStatus, skillRefreshManaged } from "../src/skill-manager.mjs";
import { checkUpdate, npmRuntime } from "../src/update.mjs";
import { installSkillsAfterGlobalNpmInstall } from "../src/install-lifecycle.mjs";

test("default preset and all six reference images validate", async () => {
  const rows = await presetList();
  assert.equal(rows.filter(item => item.default).length, 1);
  assert.equal(rows[0].id, "quiet-blue-sleep-space");
  const preset = await presetShow("白场蓝色功能岛");
  assert.equal(preset.reference_images.length, 6);
  assert.equal((await presetValidate()).ok, true);
});

test("canvas output matches oriented input and refuses overwrite", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "restyler-canvas-"));
  try {
    const input = path.join(dir, "input.png"), generated = path.join(dir, "generated.png"), output = path.join(dir, "output.png");
    await sharp({ create: { width: 150, height: 230, channels: 3, background: "white" } }).png().toFile(input);
    await sharp({ create: { width: 300, height: 200, channels: 3, background: "blue" } }).png().toFile(generated);
    const result = await matchCanvas({ input, generated, output });
    assert.deepEqual(result.output_size, [150, 230]);
    await assert.rejects(matchCanvas({ input, generated, output }), error => error.code === "OUTPUT_EXISTS");
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("managed install preserves an unmanaged Skill until explicit adoption", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "restyler-install-"));
  const env = {};
  const target = path.join(home, ".codex", "skills", "reference-style-restyler");
  try {
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, "SKILL.md"), "user-owned\n", { flag: "wx" });
    await assert.rejects(skillInstall("codex", { home, env, mode: "copy" }), error => error.code === "UNMANAGED_TARGET_EXISTS");
    assert.equal(await fs.readFile(path.join(target, "SKILL.md"), "utf8"), "user-owned\n");
    const installed = await skillInstall("codex", { home, env, mode: "copy", adopt: true });
    assert.equal(installed.ok, true);
    assert.ok(installed.targets[0].backup);
    assert.equal(await fs.readFile(path.join(installed.targets[0].backup, "SKILL.md"), "utf8"), "user-owned\n");
    assert.equal((await skillStatus("codex", { home, env })).targets[0].current, true);
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});

test("managed copy is repaired without touching a separate unmanaged target", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "restyler-refresh-"));
  const env = {};
  const codex = path.join(home, ".codex", "skills", "reference-style-restyler");
  const sealseek = path.join(home, ".sealseek", "workspace", "skills", "reference-style-restyler");
  try {
    await fs.mkdir(path.join(home, ".codex"));
    await fs.mkdir(sealseek, { recursive: true });
    await fs.writeFile(path.join(sealseek, "SKILL.md"), "unmanaged\n", { flag: "wx" });
    await skillInstall("codex", { home, env, mode: "copy" });
    await fs.appendFile(path.join(codex, "SKILL.md"), "\nlocal drift\n");
    const refreshed = await skillRefreshManaged("all", { home, env, mode: "copy" });
    assert.equal(refreshed.ok, true);
    assert.equal(refreshed.targets[0].current, true);
    assert.ok(refreshed.targets[0].backup);
    assert.equal(refreshed.targets[1].skipped, "unmanaged");
    assert.equal(await fs.readFile(path.join(sealseek, "SKILL.md"), "utf8"), "unmanaged\n");
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});

test("registry check detects a newer stable version without installing", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "restyler-update-"));
  try {
    const nextVersion = semver.inc(PACKAGE.version, "patch");
    const result = await checkUpdate({ force: true, cache: path.join(dir, "update.json"), fetchImpl: async () => ({ ok: true, json: async () => ({ "dist-tags": { latest: nextVersion } }) }) });
    assert.equal(result.updateAvailable, true);
    const cached = await checkUpdate({ cache: path.join(dir, "update.json"), fetchImpl: async () => { throw new Error("should use cache"); } });
    assert.equal(cached.cached, true);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("global npm install connects an existing SealSeek root and preserves an unmanaged Codex Skill", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "restyler-postinstall-"));
  const codex = path.join(home, ".codex", "skills", "reference-style-restyler");
  const sealseek = path.join(home, ".sealseek", "workspace", "skills", "reference-style-restyler");
  try {
    await fs.mkdir(codex, { recursive: true });
    await fs.mkdir(path.join(home, ".sealseek"));
    await fs.writeFile(path.join(codex, "SKILL.md"), "user-owned\n", { flag: "wx" });
    const local = await installSkillsAfterGlobalNpmInstall({ global: false, home, env: {} });
    assert.equal(local.skipped, "not-global-install");
    await assert.rejects(fs.access(sealseek));
    const installed = await installSkillsAfterGlobalNpmInstall({ global: true, home, env: {}, mode: "copy" });
    assert.equal(installed.ok, true);
    assert.equal(installed.targets.find(item => item.agent === "codex").skipped, "unmanaged-skill");
    assert.equal(installed.targets.find(item => item.agent === "sealseek").current, true);
    assert.equal(await fs.readFile(path.join(codex, "SKILL.md"), "utf8"), "user-owned\n");
    assert.equal((await skillStatus("sealseek", { home, env: {} })).targets[0].current, true);
    const again = await installSkillsAfterGlobalNpmInstall({ global: true, home, env: {}, mode: "copy" });
    assert.equal(again.targets.find(item => item.agent === "sealseek").unchanged, true);
    assert.equal(again.ok, true);
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});

test("installer reports an unresolved unmanaged target without changing it", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "restyler-postinstall-unmanaged-"));
  const sealseek = path.join(home, ".sealseek", "workspace", "skills", "reference-style-restyler");
  try {
    await fs.mkdir(sealseek, { recursive: true });
    await fs.writeFile(path.join(sealseek, "SKILL.md"), "user-owned\n", { flag: "wx" });
    const result = await installSkillsAfterGlobalNpmInstall({ global: true, home, env: { SEALSEEK_HOME: path.join(home, ".sealseek") }, mode: "copy" });
    assert.equal(result.ok, false);
    assert.equal(result.targets[0].skipped, "unmanaged-skill");
    assert.equal(await fs.readFile(path.join(sealseek, "SKILL.md"), "utf8"), "user-owned\n");
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});

test("status and doctor fail when no Agent Skill is installed", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "restyler-doctor-"));
  try {
    const status = await skillStatus("auto", { home, env: {} });
    assert.equal(status.ok, false);
    assert.equal(status.targets.length, 0);
    const result = spawnSync(process.execPath, [path.resolve("bin/reference-style-restyler.mjs"), "doctor", "--json"], {
      encoding: "utf8", env: { ...process.env, CODEX_HOME: path.join(home, ".codex"), SEALSEEK_HOME: path.join(home, ".sealseek") },
    });
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.skill.ok, false);
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});

test("doctor accepts a healthy SealSeek install beside an unmanaged Codex Skill", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "restyler-doctor-mixed-"));
  const codex = path.join(home, ".codex", "skills", "reference-style-restyler");
  try {
    await fs.mkdir(codex, { recursive: true });
    await fs.writeFile(path.join(codex, "SKILL.md"), "user-owned\n");
    await skillInstall("sealseek", { home, env: {}, mode: "copy" });
    const status = await skillStatus("auto", { home, env: {} });
    assert.equal(status.ok, true);
    assert.equal(status.targets.find(item => item.agent === "codex").managed, false);
    assert.equal(status.targets.find(item => item.agent === "sealseek").current, true);
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});

test("copy update preserves customized UI metadata with a recoverable backup", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "restyler-ui-"));
  const target = path.join(home, ".sealseek", "workspace", "skills", "reference-style-restyler");
  try {
    await skillInstall("sealseek", { home, env: {}, mode: "copy" });
    const ui = path.join(target, "agents", "openai.yaml");
    assert.match(await fs.readFile(ui, "utf8"), /default_prompt:/);
    await fs.appendFile(ui, "\n# Customized display metadata\n");
    const before = await fs.readFile(ui, "utf8");
    await fs.appendFile(path.join(target, "SKILL.md"), "\nlocal drift\n");
    const result = await skillInstall("sealseek", { home, env: {}, mode: "copy" });
    assert.equal(result.ok, true);
    assert.ok(result.targets[0].backup);
    assert.equal(await fs.readFile(ui, "utf8"), before);
    assert.equal((await skillStatus("sealseek", { home, env: {} })).ok, true);
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});

test("managed copy refreshes a changed canonical default prompt", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "restyler-ui-migration-"));
  const target = path.join(home, ".sealseek", "workspace", "skills", "reference-style-restyler");
  try {
    await skillInstall("sealseek", { home, env: {}, mode: "copy" });
    const ui = path.join(target, "agents", "openai.yaml");
    const manifestPath = path.join(target, ".reference-style-restyler-install.json");
    await fs.writeFile(ui, 'interface:\n  default_prompt: "Use $reference-style-restyler to restyle this image with the default preset while preserving its composition and aspect ratio."\n');
    const oldManifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    oldManifest.schemaVersion = 1;
    oldManifest.sourceHash = "previous-package-source";
    delete oldManifest.uiSourceHash;
    await fs.writeFile(manifestPath, JSON.stringify(oldManifest));
    assert.equal((await skillStatus("sealseek", { home, env: {} })).ok, false);
    await skillInstall("sealseek", { home, env: {}, mode: "copy" });
    assert.match(await fs.readFile(ui, "utf8"), /functional-island preset/);
    assert.equal((await skillStatus("sealseek", { home, env: {} })).ok, true);
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});

test("locked directory rename uses backed-up in-place sync", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "restyler-locked-"));
  const target = path.join(home, ".sealseek", "workspace", "skills", "reference-style-restyler");
  try {
    await skillInstall("sealseek", { home, env: {}, mode: "copy" });
    await fs.appendFile(path.join(target, "SKILL.md"), "\nlocal drift\n");
    const result = await skillInstall("sealseek", { home, env: {}, mode: "copy", rename: async (from, to) => {
      if (from === target) throw Object.assign(new Error("directory locked"), { code: "EBUSY" });
      return fs.rename(from, to);
    } });
    assert.equal(result.ok, true);
    assert.equal(result.targets[0].mode, "copy-in-place");
    assert.match(await fs.readFile(path.join(result.targets[0].backup, "SKILL.md"), "utf8"), /local drift/);
    assert.equal((await skillStatus("sealseek", { home, env: {} })).ok, true);
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});

test("Windows Agent-managed runtime is discovered without an override", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "restyler-managed-runtime-"));
  try {
    const installPath = path.join(home, "managed-node");
    const node = path.join(installPath, "node.exe");
    const npmCli = path.join(installPath, "node_modules", "npm", "bin", "npm-cli.js");
    await fs.mkdir(path.dirname(npmCli), { recursive: true });
    await fs.mkdir(path.join(home, ".sealseek", "binaries"), { recursive: true });
    await fs.writeFile(node, "node");
    await fs.writeFile(npmCli, "npm");
    await fs.writeFile(path.join(home, ".sealseek", "binaries", "runtime-info.json"), JSON.stringify({ node: { executablePath: node, installPath, npmGlobalDir: path.join(home, "global") } }));
    const runtime = await npmRuntime({ home, platform: "win32" });
    assert.equal(runtime.executable, node);
    assert.deepEqual(runtime.argsPrefix, [npmCli]);
    assert.equal(runtime.shell, false);
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});

test("failed staged update restores the prior managed Skill", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "restyler-rollback-"));
  const target = path.join(home, ".sealseek", "workspace", "skills", "reference-style-restyler");
  try {
    await skillInstall("sealseek", { home, env: {}, mode: "copy" });
    const skillFile = path.join(target, "SKILL.md");
    await fs.appendFile(skillFile, "\nlocal drift\n");
    const previous = await fs.readFile(skillFile, "utf8");
    await assert.rejects(skillInstall("sealseek", { home, env: {}, mode: "copy", rename: async (from, to) => {
      if (from.includes(".stage-")) throw Object.assign(new Error("staged promotion failed"), { code: "EIO" });
      return fs.rename(from, to);
    } }), /staged promotion failed/);
    assert.equal(await fs.readFile(skillFile, "utf8"), previous);
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});
