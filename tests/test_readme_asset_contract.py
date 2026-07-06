import json
import hashlib
import re
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "docs" / "theme-preview" / "preview-manifest.json"
TEASER_MANIFEST = ROOT / "docs" / "assets" / "readme-teaser" / "mdpresent-manifest.json"
TEASER_SOURCE = ROOT / "examples" / "readme-teaser" / "deck.md"
README_TEASER_URL = "docs/assets/readme-teaser/slides/slide-01.png?v=bentogrid-pipeline-one-page"
THEME_EXAMPLE_IMAGES = [
    "docs/theme-preview/slides/skeuomorphism/slide-01.png",
    "docs/theme-preview/slides/neomorphism/slide-01.png",
    "docs/theme-preview/slides/glassmorphism/slide-01.png",
    "docs/theme-preview/slides/claymorphism/slide-01.png",
    "docs/theme-preview/slides/minimalism/slide-01.png",
    "docs/theme-preview/slides/newmorphism/slide-01.png",
    "docs/theme-preview/slides/brutalism/slide-01.png",
    "docs/theme-preview/slides/liquid-glass/slide-01.png",
    "docs/theme-preview/slides/bentogrid/slide-01.png",
]


class ReadmeAssetContractTests(unittest.TestCase):
    def test_readme_uses_shared_mdpr_preview_outputs(self):
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        teaser_manifest = json.loads(TEASER_MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(manifest["source"], "examples/theme-preview-en/deck.md")
        self.assertEqual(teaser_manifest["source"]["path"], "examples/readme-teaser/deck.md")
        self.assertEqual(teaser_manifest["presentationMode"], "pipeline-one-page")
        self.assertEqual(teaser_manifest["slideCount"], 1)
        self.assertGreaterEqual(manifest["styleCount"], 9)
        self.assertGreaterEqual(manifest["slideCount"], 12)
        self.assertEqual(
            manifest.get("styleNames"),
            ["bentogrid", "brutalism", "claymorphism", "glassmorphism", "liquid-glass", "minimalism", "neomorphism", "newmorphism", "skeuomorphism"],
        )

        for readme_name in ["README.md", "README.ko.md", "README.zh.md"]:
            readme = (ROOT / readme_name).read_text(encoding="utf-8")
            self.assertIn(README_TEASER_URL, readme)
            self.assertIn("docs/theme-preview/slides/bentogrid/slide-11.png", readme)
            self.assertIn("docs/theme-preview/slides/glassmorphism/slide-23.png", readme)
            for image in THEME_EXAMPLE_IMAGES:
                self.assertIn(image, readme)
            self.assertNotIn("docs/assets/readme-slides", readme)
            self.assertNotIn("build-readme-slide-assets", readme)

    def test_readme_preview_script_explicitly_builds_pipeline_teaser(self):
        package_json = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        preview_script = package_json["scripts"]["preview:readme"]
        self.assertIn("examples/readme-teaser/deck.md", preview_script)
        self.assertIn("--pipeline-one-page", preview_script)
        self.assertIn("docs/assets/readme-teaser", preview_script)
        self.assertIn("scripts/export-pptx-pngs.py", preview_script)
        self.assertLess(preview_script.index("--pipeline-one-page"), preview_script.index("scripts/export-pptx-pngs.py"))

    def test_readme_teaser_source_is_compact_and_feature_complete(self):
        source = TEASER_SOURCE.read_text(encoding="utf-8")
        visible_lines = [line for line in source.splitlines() if line.strip()]
        self.assertLessEqual(len(visible_lines), 18)
        for required in [
            "9 themes",
            "36+ patterns",
            "12 object families",
            "PPTX first",
            "No agent runtime",
            "Markdown => Semantic IR => Layout Grammar => Theme Tokens => Editable PPTX",
        ]:
            self.assertIn(required, source)

    def test_theme_gallery_uses_validation_not_qa_wording(self):
        gallery = (ROOT / "docs" / "theme-preview" / "index.html").read_text(encoding="utf-8")
        self.assertIn("PPTX Theme Validation Gallery", gallery)
        self.assertNotIn("PPTX Theme QA Gallery", gallery)

    def test_runtime_docs_use_validation_not_qa_wording(self):
        runtime_docs = [
            ROOT / "docs" / "01-architecture.md",
            ROOT / "docs" / "07-rendering-rules.md",
            ROOT / "docs" / "11-qa-overflow.md",
        ]
        for doc in runtime_docs:
            text = doc.read_text(encoding="utf-8")
            self.assertNotRegex(text, re.compile(r"\bQA\b"))
            self.assertIn("validation", text.lower())

    def test_teaser_source_names_36_plus_decoration_and_layout_patterns(self):
        source = (ROOT / "examples" / "theme-preview-en" / "deck.md").read_text(encoding="utf-8")
        self.assertIn("36+ decoration and layout patterns", source)
        catalog = source.split("## Decoration Pattern Catalog", 1)[1].split("\n## ", 1)[0]
        catalog_items = re.findall(r"`[a-z0-9-]+`", catalog)
        self.assertGreaterEqual(len(set(catalog_items)), 36)

    def test_readme_preview_evaluation_records_visual_fingerprints(self):
        evaluation = json.loads((ROOT / "docs" / "theme-preview" / "readme-preview-evaluation.json").read_text(encoding="utf-8"))
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        teaser_source = TEASER_SOURCE.read_text(encoding="utf-8")
        self.assertEqual(evaluation["teaserSourceSha256"], hashlib.sha256(teaser_source.encode("utf-8")).hexdigest())
        self.assertTrue(evaluation["teaserSourceSha256Matches"])
        self.assertEqual(evaluation["teaserSlideCount"], 1)
        selected_by_title = evaluation["selectedPreviewImagesByTitle"]
        self.assertEqual(selected_by_title["Pipeline Diagram"], "docs/theme-preview/slides/bentogrid/slide-11.png")
        for title, image in selected_by_title.items():
            theme_name = image.split("/")[3]
            manifest_theme = next(theme for theme in manifest["themes"] if theme["name"] == theme_name)
            manifest_slide = next(slide for slide in manifest_theme["slides"] if f"docs/theme-preview/{slide['file']}" == image)
            self.assertEqual(manifest_slide["title"], title)
        fingerprints = evaluation["visualFingerprints"]
        self.assertIn("docs/assets/readme-teaser/slides/slide-01.png", fingerprints)
        self.assertIn("docs/theme-preview/slides/glassmorphism/slide-23.png", fingerprints)
        for fingerprint in fingerprints.values():
            self.assertRegex(fingerprint["sha256"], re.compile(r"^[0-9a-f]{64}$"))
            self.assertGreater(fingerprint["bytes"], 5000)
            self.assertEqual(fingerprint["size"], [1600, 900])


if __name__ == "__main__":
    unittest.main()
