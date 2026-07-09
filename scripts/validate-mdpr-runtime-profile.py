#!/usr/bin/env python3
"""Validate the local MDPR runtime release preflight profile."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

REQUIRED_SCRIPTS = {
    "test",
    "typecheck",
    "test:preflight",
    "test:pack",
    "perf:check",
    "preview:themes",
}

BROAD_COMMANDS = {"corepack pnpm test", "corepack pnpm -r test", "pnpm test", "npm test"}

FORBIDDEN_LOCAL_DEPENDENCIES = [
    "Office GUI",
    "credentials",
    "paid services",
    "browser automation",
    "external assets",
    "downloaded fonts",
    "manual visual QA",
]

GATES = [
    {
        "id": "parser-splitting",
        "owner": "mdpr-runtime",
        "riskArea": "parser-and-split-planner",
        "responsibility": "CommonMark/GFM parsing and deterministic slide splitting",
        "commands": ["corepack pnpm --filter @mdpresent/core test"],
        "testFiles": ["packages/core/test/core.test.mjs"],
        "assertionTags": [
            "parseMarkdown extracts headings",
            "planPresentation autosplits dense h2 content",
            "planPresentation splits long ordered lists",
        ],
        "required_terms": {
            "tests/README.md": ["parser-splitting", "core/parser", "core/split", "bullet and ordered-list parsing", "density thresholds"],
            "docs/06-cli-spec.md": ["parser-splitting", "parses Markdown", "plans Presentation IR", "plans Layout IR"],
            "docs/14-quality-performance-roadmap.md": ["parser-splitting"],
        },
    },
    {
        "id": "readability-source-preservation",
        "owner": "mdpr-runtime",
        "riskArea": "readability-and-overflow",
        "responsibility": "Readability, overflow, and source-preserving layout diagnostics",
        "commands": ["corepack pnpm --filter @mdpresent/layout test", "corepack pnpm --filter @mdpresent/core test"],
        "testFiles": ["packages/layout/test/layout.test.mjs", "packages/core/test/core.test.mjs"],
        "assertionTags": [
            "overflow validation preserves CJK source evidence without rewrite decisions",
            "planPresentation forces paragraph-heavy sections into continuation slides",
        ],
        "required_terms": {
            "tests/README.md": ["overflow font floors", "render-pptx"],
            "docs/14-quality-performance-roadmap.md": ["no summary generation", "no content rewriting", "overflow", "source"],
        },
    },
    {
        "id": "image-permission",
        "owner": "mdpr-runtime",
        "riskArea": "media-policy",
        "responsibility": "Generated/source image policy stays runtime validated and provenance-bound",
        "commands": ["corepack pnpm --filter @mdpresent/cli test"],
        "testFiles": ["packages/cli/test/orchestrate.test.mjs"],
        "assertionTags": [
            "validateDeck rejects forbidden final-decision fields in agent hints",
            "validateDeck visual validation reports image aspect and connector clearance risks",
        ],
        "required_terms": {
            "docs/06-cli-spec.md": ["generated-assets validate", "full-slide renderer requests", "missing assets"],
            "docs/10-template-and-master-policy.md": ["decorative image assets", "final image crops"],
        },
    },
    {
        "id": "template-master-package-integrity",
        "owner": "mdpr-runtime",
        "riskArea": "template-master-preservation",
        "responsibility": "Template and master slides provide brand evidence while MDPR owns placement",
        "commands": ["corepack pnpm --filter @mdpresent/render-pptx test"],
        "testFiles": ["packages/render-pptx/test/render-pptx.test.mjs"],
        "assertionTags": [
            "template import records master layout and theme parts as preserved template package evidence",
            "template import reuses decorative shapes for matching layout types and preserves theme colors",
        ],
        "required_terms": {
            "docs/10-template-and-master-policy.md": ["Template controls brand", "Layout engine controls placement", "slide master", "preserve-existing-master-slides"],
        },
    },
    {
        "id": "agent-runtime-bridge",
        "owner": "mdpr-runtime",
        "riskArea": "agent-hint-to-renderer-boundary",
        "responsibility": "Agent hints stay declarative while runtime validation owns image/icon/template renderer policy",
        "commands": ["corepack pnpm --filter @mdpresent/cli test", "corepack pnpm test:pack"],
        "testFiles": ["packages/cli/test/orchestrate.test.mjs", "scripts/pack-smoke.mjs"],
        "assertionTags": [
            "validateDeck rejects renderer-owned asset and template fields in agent hints",
            "bridge-allowed-hints.json",
            "bridge-forbidden-hints.json",
        ],
        "required_terms": {
            "tests/README.md": ["agent-runtime-bridge"],
            "docs/06-cli-spec.md": ["agent-runtime-bridge"],
            "docs/14-quality-performance-roadmap.md": ["agent-runtime-bridge"],
        },
    },
    {
        "id": "pptx-editability",
        "owner": "mdpr-runtime",
        "riskArea": "editable-pptx-output",
        "responsibility": "PPTX output remains editable with native text/table/chart object contracts",
        "commands": ["corepack pnpm --filter @mdpresent/render-pptx test"],
        "testFiles": ["packages/render-pptx/test/render-pptx.test.mjs"],
        "assertionTags": [
            "renderPptx writes editable text boxes",
            "renderPptx keeps text tables and charts as native editable PPTX XML objects",
            "renderPptx renders pipeline diagrams as editable nodes and connectors",
        ],
        "required_terms": {
            "tests/README.md": ["editable text boxes", "native tables and charts", "OpenXML contracts"],
            "docs/14-quality-performance-roadmap.md": ["PPTX XML contract tests", "native text/table/chart objects"],
        },
    },
    {
        "id": "validation-cli",
        "owner": "mdpr-runtime",
        "riskArea": "validation-and-cli-gates",
        "responsibility": "Validation gates fail before rendering on deterministic diagnostics",
        "commands": ["corepack pnpm --filter @mdpresent/cli test"],
        "testFiles": ["packages/cli/test/orchestrate.test.mjs"],
        "assertionTags": [
            "buildDeck fails before rendering when config diagnostics contain errors",
            "buildDeck fails visual builds when visual validation reports errors",
            "CLI validate exposes a user-facing acceptance path",
        ],
        "required_terms": {
            "docs/06-cli-spec.md": ["mdpresent validate", "Build fails before rendering", "polish gate"],
            "docs/14-quality-performance-roadmap.md": ["same error-diagnostic gate", "visual/coherence errors stop output"],
        },
    },
    {
        "id": "package-cli",
        "owner": "mdpr-runtime",
        "riskArea": "package-and-installed-cli",
        "responsibility": "Clean package smoke proves installed CLI and runtime packages",
        "commands": ["corepack pnpm test:pack", "corepack pnpm --filter @mdpresent/cli test"],
        "testFiles": ["scripts/pack-smoke.mjs", "packages/cli/test/package.test.mjs"],
        "assertionTags": [
            "Native PPTX output remains installable from packed packages",
            "CLI package metadata exposes an installable mdpresent binary and packed runtime files",
        ],
        "required_terms": {
            "docs/14-quality-performance-roadmap.md": ["test:pack", "clean project", "installed `mdpresent` binary"],
            "tests/README.md": ["Local Runtime Release Preflight", "test:preflight", "test:pack"],
        },
    },
]


def read_text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def load_package() -> dict:
    return json.loads(read_text("package.json"))


def check_scripts(package: dict) -> list[dict]:
    scripts = package.get("scripts", {})
    findings = []
    for name in sorted(REQUIRED_SCRIPTS):
        findings.append({
            "id": f"script:{name}",
            "status": "pass" if name in scripts else "fail",
            "evidence": scripts.get(name),
        })
    return findings


def normalized(value: str) -> str:
    return " ".join(value.lower().split())


def check_executable_evidence(gate: dict) -> tuple[list[dict], dict]:
    missing = []
    evidence = {
        "commands": gate.get("commands", []),
        "testFiles": gate.get("testFiles", []),
        "assertionTags": gate.get("assertionTags", []),
    }
    commands = gate.get("commands", [])
    test_files = gate.get("testFiles", [])
    assertion_tags = gate.get("assertionTags", [])
    if not commands:
        missing.append({"kind": "commands", "reason": "gate has no executable command evidence"})
    if commands and all(normalized(command) in BROAD_COMMANDS for command in commands):
        missing.append({"kind": "commands", "reason": "gate only has broad workspace commands", "commands": commands})
    if not test_files:
        missing.append({"kind": "testFiles", "reason": "gate has no specific test files"})
    if not assertion_tags:
        missing.append({"kind": "assertionTags", "reason": "gate has no specific assertion tags"})
    combined_test_text = ""
    for relative_path in test_files:
        path = ROOT / relative_path
        if not path.exists():
            missing.append({"kind": "testFiles", "path": relative_path, "reason": "test file does not exist"})
            continue
        combined_test_text += f" {normalized(path.read_text(encoding='utf-8'))}"
    if assertion_tags and combined_test_text:
        stale_tags = [tag for tag in assertion_tags if normalized(tag) not in combined_test_text]
        if stale_tags:
            missing.append({"kind": "assertionTags", "terms": stale_tags})
    return missing, evidence


def check_docs(gate: dict) -> tuple[list[dict], dict]:
    missing = []
    evidence = {}
    for relative_path, terms in gate["required_terms"].items():
        text = normalized(read_text(relative_path))
        path_missing = [term for term in terms if normalized(term) not in text]
        if path_missing:
            missing.append({"path": relative_path, "terms": path_missing})
        else:
            evidence[relative_path] = terms
    return missing, evidence


def check_gate(gate: dict) -> dict:
    doc_missing, doc_evidence = check_docs(gate)
    executable_missing, executable_evidence = check_executable_evidence(gate)
    missing = [
        *[{"kind": "docs", **item} for item in doc_missing],
        *[{"kind": "executableEvidence", **item} for item in executable_missing],
    ]
    return {
        "id": gate["id"],
        "owner": gate["owner"],
        "riskArea": gate["riskArea"],
        "responsibility": gate["responsibility"],
        "status": "fail" if missing else "pass",
        "missing": missing,
        "commands": executable_evidence["commands"],
        "testFiles": executable_evidence["testFiles"],
        "assertionTags": executable_evidence["assertionTags"],
        "docEvidence": doc_evidence,
    }


def check_docs_claim_emitted_gates(gates: list[dict]) -> list[dict]:
    emitted = {gate["id"] for gate in gates}
    docs = " ".join(
        normalized(read_text(path))
        for path in ["tests/README.md", "docs/06-cli-spec.md", "docs/14-quality-performance-roadmap.md"]
    )
    findings = []
    for gate_id in emitted:
        findings.append({
            "id": f"doc-claims-gate:{gate_id}",
            "status": "pass" if normalized(gate_id) in docs else "fail",
        })
    return findings


def build_report(gate_specs: list[dict] | None = None) -> dict:
    package = load_package()
    script_checks = check_scripts(package)
    gates = [check_gate(gate) for gate in (gate_specs or GATES)]
    doc_gate_claims = check_docs_claim_emitted_gates(gates)
    forbidden_local = [
        {
            "dependency": dependency,
            "status": "excluded",
            "reason": "The preflight profile is local and static; this dependency remains outside the local gate.",
        }
        for dependency in FORBIDDEN_LOCAL_DEPENDENCIES
    ]
    valid = (
        all(item["status"] == "pass" for item in script_checks)
        and all(gate["status"] == "pass" for gate in gates)
        and all(item["status"] == "pass" for item in doc_gate_claims)
    )
    return {
        "schemaVersion": "mdpr-runtime-preflight-profile-v1",
        "profileId": "mdpr-runtime-local-preflight",
        "generatedBy": "scripts/validate-mdpr-runtime-profile.py",
        "valid": valid,
        "inventoryReleaseProfile": "mdpresent-runtime",
        "runtimePreflightProfile": "mdpr-runtime-preflight-profile-v1",
        "boundaries": {
            "mdprOwns": [
                "parsing",
                "splitting",
                "layout",
                "theme binding",
                "image and icon selection",
                "crop",
                "z-order",
                "PPTX object decisions",
                "validation outcomes",
            ],
            "excludedLocalDependencies": forbidden_local,
        },
        "scriptChecks": script_checks,
        "docGateClaims": doc_gate_claims,
        "gates": gates,
    }


def build_self_test_report() -> dict:
    simulated = []
    for gate in GATES:
        clone = {**gate}
        if gate["id"] == "parser-splitting":
            clone["testFiles"] = []
            clone["assertionTags"] = []
        simulated.append(clone)
    invalid_report = build_report(simulated)
    caught = not invalid_report["valid"] and any(
        gate["id"] == "parser-splitting" and gate["status"] == "fail"
        for gate in invalid_report["gates"]
    )
    return {
        "schemaVersion": "mdpr-runtime-preflight-profile-self-test-v1",
        "valid": caught,
        "simulatedFailure": "parser-splitting missing testFiles and assertionTags",
        "caught": caught,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="exit non-zero when the profile is invalid")
    parser.add_argument("--json", action="store_true", help="emit JSON; accepted for script contract clarity")
    parser.add_argument("--self-test", action="store_true", help="verify a simulated stale gate fails closed")
    args = parser.parse_args()
    report = build_self_test_report() if args.self_test else build_report()
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if args.check and not report["valid"]:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
