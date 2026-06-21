import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const outDir = join(packageRoot, "dist", "schemas");

mkdirSync(outDir, { recursive: true });
copyFileSync(join(repoRoot, "schemas", "config.schema.json"), join(outDir, "config.schema.json"));
