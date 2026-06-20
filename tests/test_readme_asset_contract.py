import json
import re
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "docs" / "theme-preview" / "preview-manifest.json"


class ReadmeAssetContractTests(unittest.TestCase):
    def test_readme_uses_shared_mdpr_preview_outputs(self):
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(manifest["source"], "examples/theme-preview-en/deck.md")
        self.assertGreaterEqual(manifest["styleCount"], 8)
        self.assertGreaterEqual(manifest["slideCount"], 12)
        self.assertEqual(
            manifest.get("styleNames"),
            ["clean", "data", "editorial", "glass", "grid", "magazine", "minimalism", "newmorphism"],
        )

        for readme_name in ["README.md", "README.ko.md", "README.zh.md"]:
            readme = (ROOT / readme_name).read_text(encoding="utf-8")
            self.assertIn("docs/theme-preview/slides/magazine/slide-04.png", readme)
            self.assertIn("docs/theme-preview/slides/grid/slide-10.png", readme)
            self.assertIn("docs/theme-preview/slides/magazine/slide-11.png", readme)
            self.assertNotIn("docs/assets/readme-slides", readme)
            self.assertNotIn("build-readme-slide-assets", readme)

    def test_teaser_source_names_36_plus_decoration_and_layout_patterns(self):
        source = (ROOT / "examples" / "theme-preview-en" / "deck.md").read_text(encoding="utf-8")
        self.assertIn("36+ decoration and layout patterns", source)
        catalog = source.split("## Decoration Pattern Catalog", 1)[1].split("\n## ", 1)[0]
        catalog_items = re.findall(r"`[a-z0-9-]+`", catalog)
        self.assertGreaterEqual(len(set(catalog_items)), 36)

    def test_readme_preview_evaluation_records_visual_fingerprints(self):
        evaluation = json.loads((ROOT / "docs" / "theme-preview" / "readme-preview-evaluation.json").read_text(encoding="utf-8"))
        fingerprints = evaluation["visualFingerprints"]
        self.assertIn("docs/theme-preview/slides/magazine/slide-04.png", fingerprints)
        self.assertIn("docs/theme-preview/slides/grid/slide-23.png", fingerprints)
        for fingerprint in fingerprints.values():
            self.assertRegex(fingerprint["sha256"], re.compile(r"^[0-9a-f]{64}$"))
            self.assertGreater(fingerprint["bytes"], 5000)
            self.assertEqual(fingerprint["size"], [1600, 900])


if __name__ == "__main__":
    unittest.main()
