import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const outDir = join(packageRoot, "dist", "schemas");

mkdirSync(outDir, { recursive: true });
copyFileSync(join(repoRoot, "schemas", "config.schema.json"), join(outDir, "config.schema.json"));
copyFileSync(join(repoRoot, "schemas", "agent-hint.schema.json"), join(outDir, "agent-hint.schema.json"));
copyFileSync(join(repoRoot, "schemas", "mdpr-pack.schema.json"), join(outDir, "mdpr-pack.schema.json"));
copyFileSync(join(repoRoot, "schemas", "diagram-ir.schema.json"), join(outDir, "diagram-ir.schema.json"));
copyFileSync(join(repoRoot, "schemas", "component-ir.schema.json"), join(outDir, "component-ir.schema.json"));
copyFileSync(join(repoRoot, "schemas", "mdpr-pptx-object-map.schema.json"), join(outDir, "mdpr-pptx-object-map.schema.json"));
copyFileSync(join(repoRoot, "schemas", "mdpr-selection-context.schema.json"), join(outDir, "mdpr-selection-context.schema.json"));
copyFileSync(join(repoRoot, "schemas", "mdpr-ppt-selection.schema.json"), join(outDir, "mdpr-ppt-selection.schema.json"));
copyFileSync(join(repoRoot, "schemas", "mdpr-ppt-pack-candidate.schema.json"), join(outDir, "mdpr-ppt-pack-candidate.schema.json"));
copyFileSync(join(repoRoot, "schemas", "mdpr-user-override-candidate.schema.json"), join(outDir, "mdpr-user-override-candidate.schema.json"));
copyFileSync(join(repoRoot, "schemas", "mdpr-theme-candidate.schema.json"), join(outDir, "mdpr-theme-candidate.schema.json"));
copyFileSync(join(repoRoot, "schemas", "mdpr-html-design-analysis.schema.json"), join(outDir, "mdpr-html-design-analysis.schema.json"));
