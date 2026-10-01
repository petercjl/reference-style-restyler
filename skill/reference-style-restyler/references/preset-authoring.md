# Authoring A Style Preset

Read this file only when the user asks to add, update, validate, or change the default preset.

## Package

Create one self-contained directory:

```text
presets/<preset-id>/
  preset.yaml
  style.md
  references/
    <reference images>
```

Use `references/preset-schema.md` for required fields. Synthesize current confirmed requirements into `style.md`; do not include correction history, private paths, hidden conversation context, or unsupported claims.

Give each image a semantic role and selection hints. Reference images establish the preset's visual and spatial language; the preset's lock and composition policies define what is retained from the edit target.

## Validation

```bash
reference-style-restyler preset validate <preset-id> --json
reference-style-restyler preset validate --json
```

Fix every error before treating the preset as available. To change the default, obtain explicit confirmation, update the canonical package's `config.yaml`, validate all presets, and release a new npm version. Installed Skill folders are managed targets rather than editing sources.
