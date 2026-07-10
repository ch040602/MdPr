import { rmSync } from "node:fs";
import { join, resolve } from "node:path";

const OWNED_PREVIEW_OUTPUTS = [
  "pptx",
  "slides",
  "index.html",
  "preview-manifest.json",
];

export function resetThemePreviewOutputs(outDir) {
  const resolvedOutDir = resolve(outDir);
  for (const relativePath of OWNED_PREVIEW_OUTPUTS) {
    rmSync(join(resolvedOutDir, relativePath), { recursive: true, force: true });
  }
}
