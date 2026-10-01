# reference-style-restyler

An npm-distributed, preset-based raster restyling Skill for Codex and SealSeek. One input image produces one non-destructive output with the same pixel dimensions. The selected preset decides what to lock and what to rebuild.

## Install

```bash
npm install -g @petercjl/reference-style-restyler
reference-style-restyler setup --json
reference-style-restyler doctor --json
```

For an Agent given the request “install `@petercjl/reference-style-restyler`”, these commands are the package's installation contract. The user only needs to give the package name. Global installation uses npm's `latest` stable release. Its postinstall hook installs the bundled Skill into detected Agent roots when npm permits package scripts; `setup` performs and verifies that same action explicitly and is safe to repeat when scripts are blocked. When both Codex and SealSeek roots exist without an explicit active root, it checks both. An existing unmanaged Skill is never replaced implicitly; review it first, then use `reference-style-restyler skill install --agent sealseek --adopt --json` to retain a timestamped backup. Use `--agent codex` for a Codex target.

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
