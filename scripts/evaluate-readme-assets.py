from __future__ import annotations

import json
import hashlib
import re
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
THEME_PREVIEW_DIR = ROOT / "docs" / "theme-preview"
EXPECTED_MAIN_IMAGE = "docs/theme-preview/slides/magazine/slide-04.png"
EXPECTED_PIPELINE_IMAGE = "docs/theme-preview/slides/grid/slide-10.png"
REQUIRED_PREVIEW_IMAGES = [
    EXPECTED_MAIN_IMAGE,
    EXPECTED_PIPELINE_IMAGE,
    "docs/theme-preview/slides/grid/slide-09.png",
    "docs/theme-preview/slides/magazine/slide-11.png",
    "docs/theme-preview/slides/data/slide-16.png",
    "docs/theme-preview/slides/glass/slide-22.png",
    "docs/theme-preview/slides/grid/slide-23.png",
    "docs/theme-preview/slides/magazine/slide-15.png",
]


def png_size(path: Path) -> tuple[int, int] | None:
    if not path.exists():
        return None
    with path.open("rb") as handle:
        header = handle.read(24)
    if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return struct.unpack(">II", header[16:24])


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def visual_fingerprints(images: list[str]) -> dict[str, dict[str, object]]:
    fingerprints: dict[str, dict[str, object]] = {}
    for image in images:
        path = ROOT / image
        data = path.read_bytes()
        fingerprints[image] = {
            "sha256": hashlib.sha256(data).hexdigest(),
            "bytes": len(data),
            "size": list(png_size(path) or (0, 0)),
        }
    return fingerprints


def main() -> None:
    readmes = {
        "README.md": read_text(ROOT / "README.md"),
        "README.ko.md": read_text(ROOT / "README.ko.md"),
        "README.zh.md": read_text(ROOT / "README.zh.md"),
    }
    manifest = json.loads((THEME_PREVIEW_DIR / "preview-manifest.json").read_text(encoding="utf-8"))
    evaluation = json.loads((THEME_PREVIEW_DIR / "theme-preview-evaluation.json").read_text(encoding="utf-8"))
    issues: list[str] = []

    if manifest.get("source") != "examples/theme-preview-en/deck.md":
        issues.append("theme-preview:source-not-shared-md")
    if int(manifest.get("styleCount", 0) or 0) < 8:
        issues.append("theme-preview:too-few-styles")
    if int(manifest.get("slideCount", 0) or 0) < 12:
        issues.append("theme-preview:too-few-slides")
    if evaluation.get("ok") is not True:
        issues.append("theme-preview:evaluation-not-ok")

    for readme_name, content in readmes.items():
        if "docs/assets/readme-slides" in content:
            issues.append(f"{readme_name}:uses-retired-readme-assets")
        if EXPECTED_MAIN_IMAGE not in content:
            issues.append(f"{readme_name}:missing-main-preview")
        if EXPECTED_PIPELINE_IMAGE not in content:
            issues.append(f"{readme_name}:missing-pipeline-preview")
        if re.search(r"build-readme-slide-assets|readme-slide-assets-report|mdpr-showcase-teaser|mdpr-pipeline-teaser", content):
            issues.append(f"{readme_name}:mentions-retired-readme-teaser")

    for image in REQUIRED_PREVIEW_IMAGES:
        path = ROOT / image
        if not path.exists() or path.stat().st_size < 5000:
            issues.append(f"{image}:missing-or-too-small")
            continue
        if png_size(path) != (1600, 900):
            issues.append(f"{image}:unexpected-size:{png_size(path)}")

    output = {
        "ok": not issues,
        "issues": issues,
        "source": manifest.get("source"),
        "mainImage": EXPECTED_MAIN_IMAGE,
        "pipelineImage": EXPECTED_PIPELINE_IMAGE,
        "checkedImages": REQUIRED_PREVIEW_IMAGES,
        "visualFingerprints": visual_fingerprints(REQUIRED_PREVIEW_IMAGES),
        "styleCount": manifest.get("styleCount"),
        "slideCount": manifest.get("slideCount"),
    }
    (THEME_PREVIEW_DIR / "readme-preview-evaluation.json").write_text(f"{json.dumps(output, indent=2)}\n", encoding="utf-8")
    if issues:
        raise SystemExit(f"README preview evaluation failed: {issues}")
    print(f"README preview evaluation passed: {output}")


if __name__ == "__main__":
    main()
