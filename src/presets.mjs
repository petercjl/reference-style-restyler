import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import YAML from "yaml";
import { CliError, SKILL_SOURCE } from "./context.mjs";

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PRIVATE_PATH_RE = /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)/;
const root = path.join(SKILL_SOURCE, "presets");

async function yamlFile(file) {
  return YAML.parse(await fs.readFile(file, "utf8"));
}

function childPath(base, relative) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative)) throw new CliError("PRESET_INVALID", `Invalid relative path: ${relative}`);
  const resolved = path.resolve(base, relative);
  if (!resolved.startsWith(`${path.resolve(base)}${path.sep}`)) throw new CliError("PRESET_INVALID", `Path escapes preset: ${relative}`);
  return resolved;
}

export async function presetList() {
  const config = await yamlFile(path.join(SKILL_SOURCE, "config.yaml"));
  const entries = await fs.readdir(root, { withFileTypes: true });
  const rows = [];
  for (const entry of entries.filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = path.join(root, entry.name);
    try {
      const data = await yamlFile(path.join(dir, "preset.yaml"));
      rows.push({ id: data.id, display_name: data.display_name, version: data.version, description: data.description, default: data.id === config.default_preset, directory: dir, aliases: data.aliases || [] });
    } catch (error) {
      rows.push({ id: entry.name, default: false, directory: dir, error: error.message });
    }
  }
  return rows;
}

export async function presetShow(query) {
  const rows = await presetList();
  let row = rows.find(item => item.id === query);
  if (!row) {
    const names = rows.filter(item => item.display_name === query || item.aliases.includes(query));
    if (names.length === 1) row = names[0];
  }
  if (!row) throw new CliError("PRESET_NOT_FOUND", `Unknown preset: ${query}`, { available: rows.map(item => item.id) });
  const data = await yamlFile(path.join(row.directory, "preset.yaml"));
  return { ...data, directory: row.directory };
}

export async function presetValidate(query = "all") {
  const rows = await presetList();
  const selected = query === "all" ? rows : rows.filter(item => item.id === query || item.display_name === query || item.aliases.includes(query));
  if (!selected.length) throw new CliError("PRESET_NOT_FOUND", `Unknown preset: ${query}`, { available: rows.map(item => item.id) });
  const results = [];
  for (const row of selected) {
    const errors = [];
    let data;
    try { data = await yamlFile(path.join(row.directory, "preset.yaml")); }
    catch (error) { errors.push(`Cannot read preset.yaml: ${error.message}`); results.push({ id: row.id, errors }); continue; }
    for (const key of ["schema_version", "id", "display_name", "version", "description", "style_guide", "supported_inputs", "reference_images", "lock_policy", "editable_elements", "composition_policy"]) {
      if (data[key] === undefined) errors.push(`Missing field: ${key}`);
    }
    if (data.schema_version !== 1) errors.push("schema_version must be 1");
    if (!ID_RE.test(data.id || "") || data.id !== path.basename(row.directory)) errors.push("Invalid preset id or folder name");
    if (!Array.isArray(data.supported_inputs) || !data.supported_inputs.length) errors.push("supported_inputs must be nonempty");
    if (!Array.isArray(data.lock_policy?.required) || !data.lock_policy.required.length) errors.push("lock_policy.required must be nonempty");
    else for (const name of data.lock_policy.required) if (!data.lock_policy.rules?.[name]) errors.push(`Missing lock rule: ${name}`);
    if (!Array.isArray(data.editable_elements) || !data.editable_elements.length) errors.push("editable_elements must be nonempty");
    if (!["preserve", "adapt", "rebuild"].includes(data.composition_policy?.mode)) errors.push("Invalid composition mode");
    try {
      const style = await fs.readFile(childPath(row.directory, data.style_guide), "utf8");
      if (PRIVATE_PATH_RE.test(style)) errors.push("Style guide contains a private path");
    } catch (error) { errors.push(`Invalid style guide: ${error.message}`); }
    if (!Array.isArray(data.reference_images) || !data.reference_images.length) errors.push("reference_images must be nonempty");
    else {
      const roles = new Set();
      for (const item of data.reference_images) {
        if (!item?.role || roles.has(item.role)) errors.push(`Missing or duplicate reference role: ${item?.role}`);
        roles.add(item?.role);
        try { await sharp(childPath(row.directory, item.path)).metadata(); }
        catch (error) { errors.push(`Invalid reference image ${item?.path}: ${error.message}`); }
      }
    }
    results.push({ id: data.id || row.id, errors });
  }
  const config = await yamlFile(path.join(SKILL_SOURCE, "config.yaml"));
  const configErrors = rows.some(item => item.id === config.default_preset) ? [] : [`Default preset not found: ${config.default_preset}`];
  return { ok: !configErrors.length && results.every(item => !item.errors.length), default_preset: config.default_preset, config_errors: configErrors, presets: results };
}
