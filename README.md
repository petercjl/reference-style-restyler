# reference-style-restyler

An npm-distributed, preset-based raster restyling Skill for Codex and SealSeek. One input image produces one non-destructive output with the same pixel dimensions. The selected preset decides what to lock and what to rebuild.

## Install

```bash
npm install -g @petercjl/reference-style-restyler
reference-style-restyler doctor --json
reference-style-restyler skill install --agent sealseek --json
```

For Codex, use `--agent codex`. An existing unmanaged Skill is never replaced implicitly; review it first, then use `--adopt` to retain a timestamped backup.

## Updates

For a global npm installation, the first preset or canvas command in a 24-hour window checks the `latest` dist-tag and installs a newer stable version automatically. The updater then refreshes managed Skill copies; linked Skills follow the package. An update failure does not block the current image task. Source checkouts never self-update. Set `REFERENCE_STYLE_RESTYLER_DISABLE_AUTO_UPDATE=1` to disable automatic updates.

```bash
reference-style-restyler update check --json
reference-style-restyler update install --json
reference-style-restyler skill status --agent sealseek --json
```

The manual command updates the npm package and managed Skill together. `skill update` refreshes managed copies from the currently installed package without changing the npm version.

## Presets and output

```bash
reference-style-restyler preset list --json
reference-style-restyler preset show quiet-blue-sleep-space --json
reference-style-restyler preset validate --json
reference-style-restyler capabilities --json
reference-style-restyler adapter status --platform sealseek --json
reference-style-restyler canvas match --input original.jpg --generated candidate.png --output final.png --json
```

The default preset, **白场蓝色功能岛**, bundles six approved bedroom and living-room reference images. It keeps the input's people, product and text content while rebuilding the composition as a warm-white borderless space with a muted-blue bed or sofa, one small darker anchoring piece and soft low-contrast light. Presets remain separate folders under `skill/reference-style-restyler/presets/` and can be added in future package releases.

The package does not include credentials, source product photographs or generated outputs. Image generation requires the active Agent's native, user-authorized reference-edit capability; installing this package does not grant access to an image service. The SealSeek adapter is packaged but requires validation in the target SealSeek session before it is described as runtime-tested.
