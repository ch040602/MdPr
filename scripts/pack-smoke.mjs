import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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
  "pack",
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

function runExpectFailure(command, args, cwd) {
  try {
    run(command, args, cwd);
  } catch {
    return;
  }
  throw new Error(`${command} ${args.join(" ")} unexpectedly succeeded`);
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
  const deckMarkdown = [
    "# Pack Smoke",
    "",
    "## Editable Output",
    "",
    "- Native PPTX output remains installable from packed packages.",
    "- HTML output shares the same build path.",
    "",
  ].join("\n");
  writeFileSync(join(smokeDir, "deck.md"), deckMarkdown);
  const sourceSha256 = createHash("sha256").update(deckMarkdown).digest("hex");
  writeFileSync(join(smokeDir, "bridge-allowed-hints.json"), JSON.stringify({
    schemaVersion: "mdpr-agent-hint-v1",
    sourceSha256,
    hints: [
      {
        slideId: "editable-output",
        confidence: 0.86,
        workflowIntentCandidate: { intent: "template-fill", confidence: 0.86, evidenceRefs: ["template:hcs-template"] },
        templateUseCandidate: {
          templateSourceRef: "hcs-template",
          masterSlidePolicy: "preserve-existing-master-slides",
          placeholderPolicy: "prefer-existing-placeholders",
          confidence: 0.86,
        },
        mediaPolicyCandidate: {
          imageUse: "no-image",
          imageSearch: "disabled",
          iconUse: "no-new-icons",
          evidenceRefs: ["template:hcs-template"],
        },
      },
    ],
  }, null, 2));
  writeFileSync(join(smokeDir, "bridge-forbidden-hints.json"), JSON.stringify({
    schemaVersion: "mdpr-agent-hint-v1",
    sourceSha256,
    hints: [
      {
        slideId: "editable-output",
        confidence: 0.9,
        imagePath: "assets/generated.png",
        iconPath: "icons/check.svg",
        masterId: "ppt/master-1",
        layoutId: "ppt/layout-2",
        cropRect: { x: 0, y: 0, w: 1, h: 1 },
      },
    ],
  }, null, 2));

  run("npm", ["install", ...tarballs], smokeDir);
  run("npm", ["exec", "--", "mdpresent", "validate", "deck.md", "--hints", "bridge-allowed-hints.json", "--json"], smokeDir);
  runExpectFailure("npm", ["exec", "--", "mdpresent", "validate", "deck.md", "--hints", "bridge-forbidden-hints.json", "--json"], smokeDir);
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
