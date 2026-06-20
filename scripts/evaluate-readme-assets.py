from __future__ import annotations

import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "assets" / "readme-slides"


def png_size(path: Path) -> tuple[int, int] | None:
    if not path.exists():
        return None
    with path.open("rb") as handle:
        header = handle.read(24)
    if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return struct.unpack(">II", header[16:24])


def main() -> None:
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    manifest = json.loads((ROOT / "docs" / "theme-preview" / "preview-manifest.json").read_text(encoding="utf-8"))
    evaluation = json.loads((ROOT / "docs" / "theme-preview" / "theme-preview-evaluation.json").read_text(encoding="utf-8"))
    report_path = OUT_DIR / "readme-slide-assets-report.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    issues: list[str] = []

    if "docs/assets/readme-slides/mdpr-showcase-teaser.png" not in readme:
        issues.append("README.md:main-image-not-showcase")
    if readme.find("mdpr-showcase-teaser.png") > readme.find("mdpr-pipeline-teaser.png"):
        issues.append("README.md:showcase-must-precede-pipeline")

    required_assets = [
        ("mdpr-showcase-teaser.png", (1600, 900)),
        ("mdpr-showcase-teaser.pptx", None),
        ("mdpr-pipeline-teaser.png", (2600, 1414)),
        ("mdpr-pipeline-teaser.pptx", None),
        ("pipeline.png", (2600, 1414)),
        ("cover.png", (1600, 900)),
        ("semantics.png", (1600, 900)),
        ("decorations.png", (1600, 900)),
    ]
    for name, expected_size in required_assets:
        path = OUT_DIR / name
        if not path.exists() or path.stat().st_size < 5000:
            issues.append(f"{name}:missing-or-too-small")
            continue
        if expected_size:
            actual_size = png_size(path)
            if actual_size != expected_size:
                issues.append(f"{name}:size:{actual_size}:expected:{expected_size}")

    showcase = report.get("showcase", {})
    for source in showcase.get("sources", []):
        source_path = ROOT / source
        if not source_path.exists() or source_path.stat().st_size < 5000:
            issues.append(f"showcase-source:{source}:missing-or-too-small")

    expected_sources = {
        "styleCount": manifest.get("styleCount"),
        "slideCount": manifest.get("slideCount"),
        "compositionCount": len(manifest.get("compositionClasses", [])),
        "surfaceCount": len(evaluation.get("renderedSurfaceVariants") or manifest.get("surfaceVariants", [])),
        "proofCount": len(manifest.get("proofKinds", [])),
    }
    if report.get("showcase", {}).get("metrics") != expected_sources:
        issues.append("showcase:metrics-drift")

    pipeline_report = json.loads((OUT_DIR / "mdpr-pipeline-teaser-report.json").read_text(encoding="utf-8"))
    if pipeline_report.get("layoutValidation", {}).get("overflowCount") != 0:
        issues.append("pipeline:overflow-count")

    output = {
        "ok": not issues,
        "issues": issues,
        "showcaseMetrics": expected_sources,
        "mainImage": "docs/assets/readme-slides/mdpr-showcase-teaser.png",
        "pipelineImage": "docs/assets/readme-slides/mdpr-pipeline-teaser.png",
    }
    (OUT_DIR / "readme-assets-evaluation.json").write_text(f"{json.dumps(output, indent=2)}\n", encoding="utf-8")
    if issues:
        raise SystemExit(f"README asset evaluation failed: {issues}")
    print(f"README asset evaluation passed: {expected_sources}")


if __name__ == "__main__":
    main()
