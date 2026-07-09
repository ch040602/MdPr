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
    "test:pack",
    "perf:check",
    "preview:themes",
}

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
        "responsibility": "CommonMark/GFM parsing and deterministic slide splitting",
        "required_terms": {
            "tests/README.md": ["core/parser", "core/split", "bullet and ordered-list parsing", "density thresholds"],
            "docs/06-cli-spec.md": ["parses Markdown", "plans Presentation IR", "plans Layout IR"],
        },
    },
    {
        "id": "readability-source-preservation",
        "responsibility": "Readability, overflow, and source-preserving layout diagnostics",
        "required_terms": {
            "tests/README.md": ["overflow font floors", "render-pptx"],
            "docs/14-quality-performance-roadmap.md": ["no summary generation", "no content rewriting", "overflow", "source"],
        },
    },
    {
        "id": "image-permission",
        "responsibility": "Generated/source image policy stays runtime validated and provenance-bound",
        "required_terms": {
            "docs/06-cli-spec.md": ["generated-assets validate", "full-slide renderer requests", "missing assets"],
            "docs/10-template-and-master-policy.md": ["decorative image assets", "final image crops"],
        },
    },
    {
        "id": "template-master-package-integrity",
        "responsibility": "Template and master slides provide brand evidence while MDPR owns placement",
        "required_terms": {
            "docs/10-template-and-master-policy.md": ["Template controls brand", "Layout engine controls placement", "slide master", "preserve-existing-master-slides"],
        },
    },
    {
        "id": "pptx-editability",
        "responsibility": "PPTX output remains editable with native text/table/chart object contracts",
        "required_terms": {
            "tests/README.md": ["editable text boxes", "native tables and charts", "OpenXML contracts"],
            "docs/14-quality-performance-roadmap.md": ["PPTX XML contract tests", "native text/table/chart objects"],
        },
    },
    {
        "id": "validation-cli",
        "responsibility": "Validation gates fail before rendering on deterministic diagnostics",
        "required_terms": {
            "docs/06-cli-spec.md": ["mdpresent validate", "Build fails before rendering", "polish gate"],
            "docs/14-quality-performance-roadmap.md": ["same error-diagnostic gate", "visual/coherence errors stop output"],
        },
    },
    {
        "id": "package-cli",
        "responsibility": "Clean package smoke proves installed CLI and runtime packages",
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
    preflight = scripts.get("test:preflight", "")
    findings.append({
        "id": "script:test:preflight",
        "status": "pass" if "validate-mdpr-runtime-profile.py" in preflight and "--check" in preflight else "fail",
        "evidence": preflight,
    })
    return findings


def check_gate(gate: dict) -> dict:
    missing = []
    evidence = {}
    for relative_path, terms in gate["required_terms"].items():
        text = " ".join(read_text(relative_path).lower().split())
        path_missing = [term for term in terms if " ".join(term.lower().split()) not in text]
        if path_missing:
            missing.append({"path": relative_path, "terms": path_missing})
        else:
            evidence[relative_path] = terms
    return {
        "id": gate["id"],
        "responsibility": gate["responsibility"],
        "status": "fail" if missing else "pass",
        "missing": missing,
        "evidence": evidence,
    }


def build_report() -> dict:
    package = load_package()
    script_checks = check_scripts(package)
    gates = [check_gate(gate) for gate in GATES]
    forbidden_local = [
        {
            "dependency": dependency,
            "status": "excluded",
            "reason": "The preflight profile is local and static; this dependency remains outside the local gate.",
        }
        for dependency in FORBIDDEN_LOCAL_DEPENDENCIES
    ]
    valid = all(item["status"] == "pass" for item in script_checks) and all(gate["status"] == "pass" for gate in gates)
    return {
        "schemaVersion": "mdpr-runtime-preflight-profile-v1",
        "generatedBy": "scripts/validate-mdpr-runtime-profile.py",
        "valid": valid,
        "releaseProfile": "mdpr-runtime-local",
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
        "gates": gates,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="exit non-zero when the profile is invalid")
    args = parser.parse_args()
    report = build_report()
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if args.check and not report["valid"]:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
