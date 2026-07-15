from __future__ import annotations

import json
import hashlib
import re
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
THEME_PREVIEW_DIR = ROOT / "docs" / "theme-preview"
README_TEASER_DIR = ROOT / "docs" / "assets" / "readme-teaser"
EXPECTED_MAIN_IMAGE = "docs/assets/readme-teaser/slides/slide-01.png"
SELECTED_THEME_PREVIEW_TITLES = {
    "Pipeline Diagram": "bentogrid",
    "Semantic Blocks": "minimalism",
    "Decoration Pattern Catalog": "minimalism",
    "Editable Proof Objects": "skeuomorphism",
    "Image Safe Frame": "glassmorphism",
    "Mixed Object Packing": "newmorphism",
    "Chart and Table Pair (Cont. 2/2)": "brutalism",
}

README_ROLE_CONTRACTS = {
    "README.md": [
        "[`mdpr-skill`](https://github.com/ch040602/mdpr-skill)",
        "without owning final layout",
        "no API key, model call",
    ],
    "README.ko.md": [
        "[`mdpr-skill`](https://github.com/ch040602/mdpr-skill)",
        "최종 layout을 소유하지 않고",
        "LLM이나 API 키가 필요하지 않습니다",
    ],
    "README.zh.md": [
        "[`mdpr-skill`](https://github.com/ch040602/mdpr-skill)",
        "不拥有最终 layout",
        "不需要 LLM 或 API key",
    ],
}


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


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def selected_preview_images_by_title(manifest: dict[str, object], issues: list[str]) -> dict[str, str]:
    themes = {theme.get("name"): theme for theme in manifest.get("themes", []) if isinstance(theme, dict)}
    selected: dict[str, str] = {}
    for title, preferred_theme in SELECTED_THEME_PREVIEW_TITLES.items():
        theme = themes.get(preferred_theme)
        if not theme:
            issues.append(f"theme-preview:selected-title-theme-missing:{title}:{preferred_theme}")
            continue
        slides = theme.get("slides", [])
        slide = next((item for item in slides if isinstance(item, dict) and item.get("title") == title), None)
        if not slide:
            issues.append(f"theme-preview:selected-title-slide-missing:{title}:{preferred_theme}")
            continue
        selected[title] = f"docs/theme-preview/{slide.get('file')}"
    return selected


def parse_region_styles(html: str) -> dict[str, dict[str, float]]:
    regions: dict[str, dict[str, float]] = {}
    for match in re.finditer(r'<div class="region ([^"]+)" style="([^"]+)"', html):
        classes = match.group(1).split()
        region_id = classes[-1] if classes else ""
        style = match.group(2)
        values: dict[str, float] = {}
        for name in ["left", "top", "width", "height"]:
            value_match = re.search(rf"{name}:([0-9.]+)in", style)
            if value_match:
                values[name] = float(value_match.group(1))
        if region_id and len(values) == 4:
            regions[region_id] = values
    return regions


def pipeline_one_page_teaser_contract(teaser_manifest: dict[str, object], issues: list[str]) -> dict[str, object]:
    html_path = README_TEASER_DIR / "deck.html"
    html = read_text(html_path) if html_path.exists() else ""
    regions = parse_region_styles(html)
    diagram = regions.get("diagram")
    overview = regions.get("feature-summary")
    chart = regions.get("chart")
    table = regions.get("table")
    slide_area = 13.333 * 7.5
    hero_share = (diagram["width"] * diagram["height"] / slide_area) if diagram else 0
    visual_checks = teaser_manifest.get("validation", {}).get("visual", {}).get("checks", {})
    object_regions = {
        item.get("regionId")
        for item in teaser_manifest.get("pptxObjects", [])
        if isinstance(item, dict)
    }
    contract = {
        "checked": True,
        "heroRegionShare": round(hero_share, 3),
        "overviewRegionPresent": overview is not None,
        "overviewBelowHero": bool(diagram and overview and overview["top"] > diagram["top"] + diagram["height"]),
        "evidenceRailObjectCount": int(chart is not None) + int(table is not None),
        "chartTablePresent": chart is not None and table is not None,
        "evidenceRailRightOfHero": bool(diagram and chart and table and chart["left"] > diagram["left"] + diagram["width"] and table["left"] >= chart["left"]),
        "emptyObjectSummaryPresent": "object-summary" in regions or "object-summary" in object_regions,
        "visualEvidenceRailCheck": visual_checks.get("pipelineOnePageEvidenceRail") is True,
    }

    if contract["heroRegionShare"] < 0.16:
        issues.append("readme-teaser:hero-diagram-not-dominant")
    if not contract["overviewRegionPresent"]:
        issues.append("readme-teaser:missing-overview-region")
    if not contract["overviewBelowHero"]:
        issues.append("readme-teaser:overview-not-below-hero")
    if not contract["chartTablePresent"]:
        issues.append("readme-teaser:missing-chart-table-evidence")
    if not contract["evidenceRailRightOfHero"]:
        issues.append("readme-teaser:evidence-rail-not-right-of-hero")
    if contract["emptyObjectSummaryPresent"]:
        issues.append("readme-teaser:empty-object-summary-present")
    if not contract["visualEvidenceRailCheck"]:
        issues.append("readme-teaser:evidence-rail-visual-check-missing")

    return contract


def main() -> None:
    readmes = {
        "README.md": read_text(ROOT / "README.md"),
        "README.ko.md": read_text(ROOT / "README.ko.md"),
        "README.zh.md": read_text(ROOT / "README.zh.md"),
    }
    manifest = json.loads((THEME_PREVIEW_DIR / "preview-manifest.json").read_text(encoding="utf-8"))
    teaser_manifest = json.loads((README_TEASER_DIR / "mdpresent-manifest.json").read_text(encoding="utf-8"))
    evaluation = json.loads((THEME_PREVIEW_DIR / "theme-preview-evaluation.json").read_text(encoding="utf-8"))
    issues: list[str] = []

    if manifest.get("source") != "examples/theme-preview-en/deck.md":
        issues.append("theme-preview:source-not-shared-md")
    if teaser_manifest.get("source", {}).get("path") != "examples/readme-teaser/deck.md":
        issues.append("readme-teaser:source-not-md")
    if teaser_manifest.get("presentationMode") != "pipeline-one-page":
        issues.append("readme-teaser:not-pipeline-one-page")
    if teaser_manifest.get("slideCount") != 1:
        issues.append("readme-teaser:not-single-slide")
    teaser_source_path = teaser_manifest.get("source", {}).get("path")
    teaser_source_text = read_text(ROOT / teaser_source_path) if teaser_source_path else ""
    teaser_source_sha256 = sha256_text(teaser_source_text)
    teaser_manifest_sha256 = teaser_manifest.get("source", {}).get("sha256")
    teaser_source_sha256_matches = teaser_source_sha256 == teaser_manifest_sha256
    if not teaser_source_sha256_matches:
        issues.append("readme-teaser:source-sha256-stale")
    if int(manifest.get("styleCount", 0) or 0) < 5:
        issues.append("theme-preview:too-few-styles")
    if int(manifest.get("slideCount", 0) or 0) < 12:
        issues.append("theme-preview:too-few-slides")
    if evaluation.get("ok") is not True:
        issues.append("theme-preview:evaluation-not-ok")
    selected_images_by_title = selected_preview_images_by_title(manifest, issues)
    pipeline_teaser_contract = pipeline_one_page_teaser_contract(teaser_manifest, issues)
    required_preview_images = [EXPECTED_MAIN_IMAGE, *selected_images_by_title.values()]
    expected_pipeline_image = selected_images_by_title.get("Pipeline Diagram", "")

    for readme_name, content in readmes.items():
        for required_text in README_ROLE_CONTRACTS[readme_name]:
            if required_text not in content:
                issues.append(f"{readme_name}:missing-role-contract:{required_text}")
        if "docs/assets/readme-slides" in content:
            issues.append(f"{readme_name}:uses-retired-readme-assets")
        if EXPECTED_MAIN_IMAGE not in content:
            issues.append(f"{readme_name}:missing-main-preview")
        if expected_pipeline_image and expected_pipeline_image not in content:
            issues.append(f"{readme_name}:missing-pipeline-preview")
        if re.search(r"build-readme-slide-assets|readme-slide-assets-report|mdpr-showcase-teaser|mdpr-pipeline-teaser", content):
            issues.append(f"{readme_name}:mentions-retired-readme-teaser")

    for image in required_preview_images:
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
        "teaserSource": teaser_manifest.get("source", {}).get("path"),
        "teaserSourceSha256": teaser_source_sha256,
        "teaserSourceSha256Matches": teaser_source_sha256_matches,
        "teaserPresentationMode": teaser_manifest.get("presentationMode"),
        "teaserSlideCount": teaser_manifest.get("slideCount"),
        "mainImage": EXPECTED_MAIN_IMAGE,
        "pipelineImage": expected_pipeline_image,
        "pipelineOnePageTeaser": pipeline_teaser_contract,
        "selectedPreviewImagesByTitle": selected_images_by_title,
        "checkedImages": required_preview_images,
        "visualFingerprints": visual_fingerprints(required_preview_images),
        "styleCount": manifest.get("styleCount"),
        "slideCount": manifest.get("slideCount"),
    }
    (THEME_PREVIEW_DIR / "readme-preview-evaluation.json").write_text(f"{json.dumps(output, indent=2)}\n", encoding="utf-8")
    if issues:
        raise SystemExit(f"README preview evaluation failed: {issues}")
    print(f"README preview evaluation passed: {output}")


if __name__ == "__main__":
    main()
