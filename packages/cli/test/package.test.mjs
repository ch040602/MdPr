import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");

test("CLI package metadata exposes an installable mdpresent binary and packed runtime files", () => {
  const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf-8"));

  assert.deepEqual(pkg.bin, { mdpresent: "dist/index.js" });
  assert.equal(pkg.exports["."].default, "./dist/index.js");
  assert.equal(pkg.exports["."].types, "./dist/index.d.ts");
  assert.ok(pkg.files.includes("dist"));
  assert.equal(existsSync(join(packageRoot, "dist/schemas/config.schema.json")), true);

  assert.ok(process.env.npm_execpath);
  const output = execFileSync(process.execPath, [process.env.npm_execpath, "--dir", packageRoot, "pack", "--dry-run", "--json"], {
    cwd: repoRoot,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const parsed = JSON.parse(output);
  const pack = Array.isArray(parsed) ? parsed[0] : parsed;
  const files = new Set(pack.files.map((file) => file.path));

  assert.equal(files.has("dist/index.js"), true);
  assert.equal(files.has("dist/index.d.ts"), true);
  assert.equal(files.has("dist/schemas/config.schema.json"), true);
  assert.equal(files.has("package.json"), true);
});

test("workspace package metadata declares exports and publish files", () => {
  const packageNames = [
    "core",
    "layout",
    "override",
    "render-html",
    "render-pdf",
    "render-pptx",
  ];

  for (const packageName of packageNames) {
    const packageJsonPath = join(repoRoot, "packages", packageName, "package.json");
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

    assert.equal(pkg.exports["."].default, "./dist/index.js", packageName);
    assert.equal(pkg.exports["."].types, "./dist/index.d.ts", packageName);
    assert.ok(pkg.files.includes("dist"), packageName);
  }
});

test("workspace package metadata pins external dependency versions", () => {
  const packageJsonPaths = [
    join(repoRoot, "package.json"),
    ...readdirSync(join(repoRoot, "packages"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(repoRoot, "packages", entry.name, "package.json"))
      .filter((packageJsonPath) => existsSync(packageJsonPath)),
  ];
  const wildcardDependencies = [];

  for (const packageJsonPath of packageJsonPaths) {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    for (const section of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      for (const [name, range] of Object.entries(pkg[section] ?? {})) {
        if (range === "*" && !String(name).startsWith("@mdpresent/")) {
          wildcardDependencies.push(`${pkg.name}:${section}:${name}`);
        }
      }
    }
  }

  assert.deepEqual(wildcardDependencies, []);
});
