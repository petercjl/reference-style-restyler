#!/usr/bin/env node
import { installSkillsAfterGlobalNpmInstall } from "../src/install-lifecycle.mjs";

try {
  const result = await installSkillsAfterGlobalNpmInstall();
  if (result.skipped !== "not-global-install") console.log(`reference-style-restyler setup: ${JSON.stringify(result)}`);
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error(`reference-style-restyler setup failed: ${error.code || "ERROR"}: ${error.message}`);
  process.exitCode = 1;
}
