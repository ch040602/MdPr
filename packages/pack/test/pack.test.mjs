import test from "node:test";
import assert from "node:assert/strict";
import {
  importPackCandidate,
  listBuiltInPacks,
  previewPack,
  themeConfigFromPack,
  validateMdprPack,
} from "../dist/index.js";

test("validateMdprPack accepts approved tokenized packs", () => {
  const pack = {
    schemaVersion: "mdpr-pack-v1",
    kind: "theme-component-pack",
    source: {
      kind: "design-md",
      sourceSha256: "a".repeat(64),
      generatedBy: "mdpr-skill",
      approved: true,
    },
    themeTokens: {
      colors: { accent: "#F97316" },
    },
    componentTokens: {},
    diagramTokens: {},
    components: [],
    pptEffectMappings: [],
    constraints: {
      editablePrimaryContent: true,
      allowRasterBackgroundOnly: true,
      maxAccentRatio: 0.18,
    },
  };

  assert.equal(validateMdprPack(pack).valid, true);
});

test("validateMdprPack rejects unapproved packs and external assets", () => {
  const result = validateMdprPack({
    schemaVersion: "mdpr-pack-v1",
    kind: "theme-component-pack",
    source: {
      kind: "html-analysis",
      sourceSha256: "b".repeat(64),
      generatedBy: "mdpr-skill",
      approved: false,
    },
    themeTokens: {},
    componentTokens: {},
    diagramTokens: {},
    components: [{ id: "logo", assetUrl: "https://example.com/logo.svg" }],
    pptEffectMappings: [],
    constraints: {
      editablePrimaryContent: false,
      allowRasterBackgroundOnly: true,
      maxAccentRatio: 0.4,
    },
  });

  assert.equal(result.valid, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "PACK_APPROVAL_REQUIRED"), true);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "PACK_EXTERNAL_ASSET"), true);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "PACK_PRIMARY_CONTENT_NOT_EDITABLE"), true);
});

test("importPackCandidate converts approved mdpr-skill theme candidates", () => {
  const imported = importPackCandidate({
    candidate: {
      schemaVersion: "mdpr-theme-candidate-v1",
      source: {
        kind: "design-md",
        path: "DESIGN.md",
        sourceSha256: "c".repeat(64),
        generatedBy: "mdpr-skill",
        generatedAt: "2026-06-25T00:00:00Z",
      },
      tokens: {
        colors: { background: "#111827", text: "#F9FAFB", accent: "#F97316" },
        typography: {},
        spacing: {},
        shape: {},
      },
      rationale: { dosDonts: [] },
      requiresApproval: true,
    },
    approved: true,
  });

  assert.equal(imported.diagnostics.length, 0);
  assert.equal(imported.pack.source.approved, true);
  assert.equal(imported.pack.themeTokens.colors.accent, "#F97316");
  assert.equal(validateMdprPack(imported.pack).valid, true);
});

test("previewPack and listBuiltInPacks expose deterministic summaries", () => {
  const packs = listBuiltInPacks();
  assert.equal(packs.some((pack) => pack.id === "default-editable"), true);

  const preview = previewPack({
    schemaVersion: "mdpr-pack-v1",
    kind: "theme-component-pack",
    source: {
      kind: "design-md",
      sourceSha256: "d".repeat(64),
      generatedBy: "mdpr-skill",
      approved: true,
    },
    themeTokens: { colors: { accent: "#F97316" } },
    componentTokens: { radius: { card: 12 } },
    diagramTokens: {},
    components: [{ id: "card", kind: "card" }],
    pptEffectMappings: [{ feasibility: "native-editable" }],
    constraints: {
      editablePrimaryContent: true,
      allowRasterBackgroundOnly: true,
      maxAccentRatio: 0.18,
    },
  });

  assert.equal(preview.themeColorCount, 1);
  assert.equal(preview.componentCount, 1);
  assert.equal(preview.nativeEditableEffectCount, 1);
});

test("themeConfigFromPack only enables provided colors when color tokens exist", () => {
  const basePack = {
    schemaVersion: "mdpr-pack-v1",
    kind: "component-pack",
    source: {
      kind: "manual",
      sourceSha256: "e".repeat(64),
      generatedBy: "user",
      approved: true,
    },
    themeTokens: {},
    componentTokens: { radius: { card: 12 } },
    diagramTokens: {},
    components: [],
    pptEffectMappings: [],
    constraints: {
      editablePrimaryContent: true,
      allowRasterBackgroundOnly: true,
      maxAccentRatio: 0.18,
    },
  };

  assert.deepEqual(themeConfigFromPack(basePack), {});

  assert.deepEqual(themeConfigFromPack({
    ...basePack,
    kind: "theme-component-pack",
    themeTokens: { colors: { background: "#111827", text: "#F9FAFB", accent: "#F97316" } },
  }), {
    backgroundColor: "#111827",
    textColor: "#F9FAFB",
    primaryColor: "#F97316",
    colorSeed: "#F97316",
    useProvidedColors: true,
  });
});
