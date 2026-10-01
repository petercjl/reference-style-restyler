# Style Preset Schema

Each immediate directory under `presets/` is independently discoverable when it contains a valid `preset.yaml`. No central registry is required.

Required manifest fields:

- `schema_version`: currently `1`.
- `id`: lowercase letters, digits, and hyphens; must match the directory name.
- `display_name`: human-facing name.
- `version`: preset version string.
- `description`: concise selection guidance.
- `style_guide`: relative path to the preset's Markdown guide.
- `supported_inputs`: non-empty list of intended image classes.
- `reference_images`: non-empty list of relative image paths and semantic roles.
- `lock_policy`: mapping containing a non-empty `required` list and explicit rules for each locked element class.
- `editable_elements`: non-empty list of elements the preset is expected to reconstruct.
- `composition_policy`: mapping describing whether composition is preserved, adapted, or rebuilt and what spatial method is mandatory.

Each reference entry contains `path`, `role`, and `selection_hints`. All paths must be relative and remain inside the preset directory. A preset must not depend on author-machine paths, private files, or another preset's assets.

Optional fields include `aliases`, `priority_rules`, `avoid`, and `qa`. Do not encode a global assumption that the source composition is locked; each preset declares that boundary.
