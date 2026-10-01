---
name: reference-style-restyler
description: Rebuild one existing raster image through a selectable bundled visual preset while preserving only the people, products, text, or other elements declared by that preset. Use when the user asks to restyle or reconstruct an existing image with the default preset or a named preset, or asks to list available presets. Do not use for unrelated from-scratch image generation.
---

# Reference Style Restyler

Transform one existing image through a self-contained, selectable style preset. Treat the input image as the source of truth only for the selected preset's locked elements; treat the preset as the source of truth for transformation scope, composition method, spatial language, and visual style.

The canonical Skill is bundled in `@petercjl/reference-style-restyler`. Agent Skill folders are CLI-managed links or copies. At the start of a new task, run `reference-style-restyler doctor --json`; a packaged global installation checks for a stable npm update on its first business command within each 24-hour window and updates the package and managed Skill automatically. Set `REFERENCE_STYLE_RESTYLER_DISABLE_AUTO_UPDATE=1` when automatic updates are not wanted. A source checkout uses its repository workflow and never self-updates. If the CLI is unavailable, report the missing dependency instead of invoking an author-machine script path.

## Contract

**Input**

- Required: one readable raster image.
- Optional: preset ID or display name, output path, and an explicit request to change only part of the image.
- Default preset: resolve from `config.yaml`; never hard-code it in the workflow.

**Strategy**

- Read the selected preset's `lock_policy`, `editable_elements`, and `composition_policy` before analyzing or prompting.
- Preserve locked elements precisely and deliberately reconstruct every element the preset marks editable.
- Apply the selected preset's spatial concept, composition, color, lighting, atmosphere, materials, and graphic language.
- Load only the selected preset. Do not read every preset at startup.
- Use reference-image editing, then deterministically normalize the final canvas.

**Output**

- One non-destructively saved raster image.
- Same aspect ratio as the input; by default the exact same pixel dimensions.
- A short report naming the preset, output path, dimensions, generation route, and any warning.

## Required Capability And Nested Skill

The logical capability contract is in `capabilities.json`; load the current platform mapping from `adapters/<platform>.json`. If the required reference-image editing features are unavailable, return `CAPABILITY_UNAVAILABLE` or `FEATURE_UNSUPPORTED` without substituting a weaker generator.

On Codex, resolve the exact advertised Skill named `imagegen`, read its complete current `SKILL.md`, execute its built-in reference-image editing flow, and return here at **Main Line 7**. Do not use an API key, API runner, or CLI fallback unless the user explicitly asks for that route.

On SealSeek, inspect the active runtime's advertised `sealseek-canvas.generate_image` tool schema before the first generation. Use only a model and reference slots supported by that live schema, and normalize the returned artifact to a local file before Main Line 10. If the tool or a required feature is absent, report the capability gap. The npm package carries no image-service credentials.

## Main Line

1. **Validate the input.** Confirm that exactly one edit target is available and readable. Read width, height, format, alpha state, and orientation without altering it.
2. **Resolve the preset.** Run `reference-style-restyler preset list --json`. Match an explicit ID first, then an exact display name. If the user did not select one, use the default marked by the CLI; do not hard-code it.
3. **Load only the selected preset.** Read its `preset.yaml` and `style.md`. Do not load any other preset. Check its declared supported inputs and reference files.
4. **Orient the analysis.** Before visually analyzing the target, extract the selected preset's locked elements, editable elements, composition policy, transformation goals, reference roles, relative-scale requirements, and QA criteria. Then inspect the input with the platform's image-inspection capability.
5. **Inventory the target.** Separate visible content into two lists: locked elements that must survive unchanged, and editable elements that should be reconstructed. Extract every required text string verbatim. For each locked product, identify at least one stable scale anchor at a similar depth, and prefer two independent relationships when the image provides them: for example bed or sofa width, mattress thickness, an ordinary pillow, a person's body or hand, or a furniture surface. Record the product's apparent width, height, occupied area, contact position, and occlusion relative to those anchors. Do not silently promote the original background, layout, furniture, palette, typography, or camera into a lock.
6. **Choose references and design the new composition.** Select the one or two preset images whose roles best support the target. Before generation, state the intended spatial organization, functional zones, subject placement, negative space, and text hierarchy required by the preset's `composition_policy`.
7. **Build the edit specification.** Label the target image as the source for locked people, products, text content, and product-to-scene scale; label preset images as spatial and style references. Use `style-transfer` when the original composition is retained and `compositing` when locked subjects are re-staged into a new scene. Describe the new spatial logic, layout, environment, lighting, palette, and mood. State the selected scale anchors and require the generated scene to preserve the product's equivalent size, contact, and perspective relationships. If an original anchor is replaced, use a replacement with the same real-world scale. Do not reconstruct a visible person or product through a long textual description.
8. **Generate with selective locking.** Use the preset's exact `lock_policy` language. Preserve only declared invariants. The input canvas orientation and aspect ratio remain fixed, but composition and camera may change when permitted. Text content must remain verbatim while typography and placement may change when declared editable.
9. **Inspect the generated image.** Check locked-element identity, product integrity, product-to-scene relative scale, text accuracy, required spatial logic, preset fidelity, artifacts, and crop safety. Compare the product against the recorded scale anchors; a product that is visibly enlarged or reduced relative to equivalent surroundings fails even when its internal proportions remain correct. A palette-only change fails when the preset requires spatial reconstruction. If there is a clear correctable failure, make at most one targeted corrective generation. Otherwise stop and report the limitation.
10. **Normalize the canvas.** Run `reference-style-restyler canvas match --input INPUT --generated GENERATED --output OUTPUT --json`. This produces the exact input width and height. Use `--mode cover` only after verifying that no essential edge content will be lost; use `--mode contain` only when the user prefers uncropped content and accepts padding.
11. **Verify and deliver.** Re-read output metadata, visually inspect the final file, and report it. Never overwrite the input or an existing output unless the user has explicitly authorized replacement after being told it exists.

## Preset Selection Branches

- **No preset requested:** use `config.yaml` default and return to Main Line 3.
- **Unknown preset:** return `PRESET_NOT_FOUND` and list valid IDs and display names. Do not guess a replacement.
- **Invalid preset:** return `PRESET_INVALID` with the failing files or fields.
- **Input outside the preset's supported scope:** explain the mismatch. If the user still requests execution, apply only the transferable palette, lighting, and texture language; do not force unrelated architecture or objects into the scene.
- **User asks to list presets:** run `reference-style-restyler preset list --json`, report the results, and stop without generating an image.
- **User asks to add or update a preset:** read `references/preset-authoring.md`, follow the schema, validate it with `reference-style-restyler preset validate --json`, and change the canonical package source in a separately authorized release. Do not edit an installed Skill copy.

## Prompt Boundary

The prompt should primarily describe what the references cannot enforce reliably: the selective lock boundary, product-to-scene scale anchors, transformation strength, spatial concept, composition method, text strings, lighting behavior, mood, output use, and concise avoid conditions. Let the input image carry locked identity, product evidence, and relative-scale evidence; let preset references carry space and style. Preserve equivalent real-world scale rather than a raw pixel bounding box when camera or perspective changes. Do not inherit input layout merely because it is visible.

## QA Gate

Pass only when:

- the final file is readable and has the exact input width and height;
- every preset-declared locked element remains recognizable and structurally faithful;
- each locked product preserves its apparent real-world size relative to the recorded same-depth anchors, including contact and occlusion relationships; when comparable measurements are available, key product-to-anchor ratios should remain within about 10 percent;
- editable elements visibly follow the preset's composition and spatial policy instead of receiving only a color grade;
- required text content is verbatim, while its layout follows the preset's declared freedom;
- the selected preset's high-priority color, light, material, and mood rules are visible;
- there are no new interface-like marks, random text, watermarks, malformed objects, or crop damage.

## Evolution Boundary

Preset-specific knowledge belongs inside that preset. General selection, preservation, capability, and output rules belong here. A runtime failure does not authorize self-modification; classify it and update the appropriate layer only in a separately authorized Skill update.
