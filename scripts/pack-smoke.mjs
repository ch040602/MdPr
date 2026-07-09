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

function runCapture(command, args, cwd) {
  return execFileSync(commandName(command), args, {
    cwd,
    encoding: "utf-8",
    shell: process.platform === "win32",
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
  const bridgeEdgeMarkdown = [
    "# Demo",
    "",
    "## Slide",
    "",
    "-핵심 메시지는 기존 템플릿을 유지한다",
    "– Readability remains semantic, not coordinate-based.",
    "1. First numbered step",
    "2. Second numbered step with Korean/English label",
    "",
    "Short standalone paragraph stays separate.",
    "",
    "| Policy | Expected |",
    "| --- | --- |",
    "| imageUse | no-image |",
    "| iconUse | no-new-icons |",
    "",
    "```text",
    "+-literal marker must stay code",
    "ㆍliteral bullet must stay code",
    "```",
    "",
  ].join("\n");
  writeFileSync(join(smokeDir, "bridge-edge.md"), bridgeEdgeMarkdown);
  const bridgeEdgeSha256 = createHash("sha256").update(bridgeEdgeMarkdown).digest("hex");
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
  writeFileSync(join(smokeDir, "bridge-edge-allowed-hints.json"), JSON.stringify({
    schemaVersion: "mdpr-agent-hint-v1",
    sourceSha256: bridgeEdgeSha256,
    hints: [
      {
        slideId: "slide-slide",
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
  writeFileSync(join(smokeDir, "bridge-edge-conflict-hints.json"), JSON.stringify({
    schemaVersion: "mdpr-agent-hint-v1",
    sourceSha256: bridgeEdgeSha256,
    hints: [
      {
        slideId: "slide-slide",
        confidence: 0.86,
        mediaPolicyCandidate: {
          imageUse: "no-image",
          imageSearch: "disabled",
          iconUse: "no-new-icons",
          evidenceRefs: ["template:hcs-template"],
        },
        iconKeywordCandidates: [{
          keyword: "search",
          elementIds: ["list-1#0"],
          evidenceRefs: ["template:hcs-template"],
          reason: "This synthetic request should be ignored by no-new-icons policy.",
          confidence: 0.8,
        }],
        visualAssetCandidates: [{
          kind: "generated-image",
          trigger: "explicit-generated-asset-request",
          requestRef: "instruction:generated-asset-request",
          semanticPrompt: "Synthetic image request that policy must ignore.",
          confidence: 0.8,
        }],
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
  const bridgeSlides = JSON.parse(runCapture("npm", ["exec", "--", "mdpresent", "inspect", "bridge-edge.md", "--json"], smokeDir));
  const bridgeSlideId = bridgeSlides.find((slide) => slide.title === "Slide")?.id;
  if (!bridgeSlideId) {
    throw new Error("Unable to resolve bridge-edge content slide id from installed CLI inspect output");
  }
  writeFileSync(join(smokeDir, "bridge-edge-allowed-hints.json"), JSON.stringify({
    schemaVersion: "mdpr-agent-hint-v1",
    sourceSha256: bridgeEdgeSha256,
    hints: [
      {
        slideId: bridgeSlideId,
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
  writeFileSync(join(smokeDir, "bridge-edge-conflict-hints.json"), JSON.stringify({
    schemaVersion: "mdpr-agent-hint-v1",
    sourceSha256: bridgeEdgeSha256,
    hints: [
      {
        slideId: bridgeSlideId,
        confidence: 0.86,
        mediaPolicyCandidate: {
          imageUse: "no-image",
          imageSearch: "disabled",
          iconUse: "no-new-icons",
          evidenceRefs: ["template:hcs-template"],
        },
        iconKeywordCandidates: [{
          keyword: "search",
          elementIds: ["block-3"],
          evidenceRefs: ["template:hcs-template"],
          reason: "This synthetic request should be ignored by no-new-icons policy.",
          confidence: 0.8,
        }],
        visualAssetCandidates: [{
          kind: "generated-image",
          trigger: "explicit-generated-asset-request",
          requestRef: "instruction:generated-asset-request",
          semanticPrompt: "Synthetic image request that policy must ignore.",
          confidence: 0.8,
        }],
      },
    ],
  }, null, 2));
  run("npm", ["exec", "--", "mdpresent", "validate", "deck.md", "--hints", "bridge-allowed-hints.json", "--coherence", "--json"], smokeDir);
  run("npm", ["exec", "--", "mdpresent", "validate", "bridge-edge.md", "--hints", "bridge-edge-allowed-hints.json", "--coherence", "--json"], smokeDir);
  const conflictValidation = JSON.parse(runCapture("npm", ["exec", "--", "mdpresent", "validate", "bridge-edge.md", "--hints", "bridge-edge-conflict-hints.json", "--coherence", "--json"], smokeDir));
  if (!conflictValidation.valid || !conflictValidation.diagnostics.some((diagnostic) => diagnostic.code === "AGENT_HINT_POLICY_CONFLICT")) {
    throw new Error("Expected bridge-edge conflict hints to remain valid but emit AGENT_HINT_POLICY_CONFLICT diagnostics");
  }
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
