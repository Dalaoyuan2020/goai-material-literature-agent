import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import ui_bridge


class UiBridgeTests(unittest.TestCase):
    def test_summary_uses_real_pipeline_artifact(self):
        result = ui_bridge.run_skill("material-search")
        report = json.loads((ROOT / "outputs" / "pipeline_report.json").read_text(encoding="utf-8"))
        self.assertTrue(result["ok"])
        self.assertEqual(result["summary"]["nodes"], report["L2_structure"]["materials_count"])
        self.assertEqual(result["summary"]["edges"], report["L2_structure"]["edges_count"])
        self.assertEqual(result["summary"]["candidates"], report["L4_application"]["candidates_generated"])

    def test_unknown_skill_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "unsupported workbench skill"):
            ui_bridge.run_skill("made-up-skill")


if __name__ == "__main__":
    unittest.main()
