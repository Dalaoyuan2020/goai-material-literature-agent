import json
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "src"))

from visualize import generate_all, load_inputs  # noqa: E402


class VisualizationTests(unittest.TestCase):
    def test_machine_report_totals_keep_evidence_tiers_separate(self):
        pipeline, search_runs = load_inputs()
        l2 = pipeline["L2_structure"]
        self.assertEqual(sum(l2["core_relation_counts"].values()), 79)
        self.assertEqual(sum(l2["matkg_relation_counts"].values()), 210)
        self.assertEqual(len(pipeline["L3_rules"]["non_degenerate_evidence_records"]), 313)
        self.assertEqual(len(search_runs), 4)
        self.assertTrue(all(not run["real_llm_api_called"] for run in search_runs))

    def test_generate_all_expected_files(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            paths = generate_all(output_dir=Path(temp_dir))
            self.assertEqual(len(paths), 6)
            self.assertTrue(all(path.exists() and path.stat().st_size > 1000 for path in paths))
            mermaid = paths[0].read_text(encoding="utf-8")
            self.assertIn("51 DOI-backed papers", mermaid)
            self.assertIn("210 aggregate edges", mermaid)
            self.assertIn("57 unique observed hypotheses", mermaid)


if __name__ == "__main__":
    unittest.main()
