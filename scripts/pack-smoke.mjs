import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageNames = [
  "core",
  "layout",
  "override",
  "render-html",
  "render-pdf",
  "render-pptx",
  "validation",
  "cli",
];
const tempRoot = mkdtempSync(join(tmpdir(), "mdpresent-pack-smoke-"));
const packDir = join(tempRoot, "packs");
const smokeDir = join(tempRoot, "smoke");

function commandName(base) {
  return process.platform === "win32" ? `${base}.cmd` : base;
}

function run(command, args, cwd) {
  execFileSync(commandName(command), args, {
    cwd,
    encoding: "utf-8",
    shell: process.platform === "win32",
    stdio: "inherit",
  });
}

try {
  run("corepack", ["pnpm", "-r", "build"], repoRoot);

  for (const dir of [packDir, smokeDir]) {
    await mkdir(dir, { recursive: true });
  }

  for (const packageName of packageNames) {
    run("corepack", [
      "pnpm",
      "--dir",
      join(repoRoot, "packages", packageName),
      "pack",
      "--pack-destination",
      packDir,
    ], repoRoot);
  }

  const tarballs = (await readdir(packDir))
    .filter((name) => name.endsWith(".tgz"))
    .sort()
    .map((name) => join(packDir, name));

  if (tarballs.length !== packageNames.length) {
    throw new Error(`Expected ${packageNames.length} package tarballs, found ${tarballs.length}`);
  }

  writeFileSync(join(smokeDir, "package.json"), JSON.stringify({ private: true, type: "module" }, null, 2));
  writeFileSync(join(smokeDir, "deck.md"), [
    "# Pack Smoke",
    "",
    "## Editable Output",
    "",
    "- Native PPTX output remains installable from packed packages.",
    "- HTML output shares the same build path.",
    "",
  ].join("\n"));

  run("npm", ["install", ...tarballs], smokeDir);
  run("npm", ["exec", "--", "mdpresent", "build", "deck.md", "--to=pptx,html", "--out", "out"], smokeDir);

  const pptxPath = join(smokeDir, "out", "deck.pptx");
  const htmlPath = join(smokeDir, "out", "deck.html");
  if (!existsSync(pptxPath) || !existsSync(htmlPath)) {
    throw new Error("Packed CLI smoke did not generate both PPTX and HTML outputs");
  }

  console.log(`Pack smoke passed: ${pptxPath} and ${htmlPath}`);
} finally {
  if (!process.env.MDPRESENT_KEEP_PACK_SMOKE) {
    rmSync(tempRoot, { recursive: true, force: true });
  } else {
    console.log(`Kept pack smoke workspace: ${tempRoot}`);
  }
}
