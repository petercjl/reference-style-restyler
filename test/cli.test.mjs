import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { presetList, presetShow, presetValidate } from "../src/presets.mjs";
import { matchCanvas } from "../src/canvas.mjs";
import { skillInstall, skillStatus, skillRefreshManaged } from "../src/skill-manager.mjs";
import { checkUpdate } from "../src/update.mjs";

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
    const result = await checkUpdate({ force: true, cache: path.join(dir, "update.json"), fetchImpl: async () => ({ ok: true, json: async () => ({ "dist-tags": { latest: "0.1.1" } }) }) });
    assert.equal(result.updateAvailable, true);
    const cached = await checkUpdate({ cache: path.join(dir, "update.json"), fetchImpl: async () => { throw new Error("should use cache"); } });
    assert.equal(cached.cached, true);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
