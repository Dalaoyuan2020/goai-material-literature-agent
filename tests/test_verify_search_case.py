import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "src"))

from verify_search_case import verify_run  # noqa: E402


class VerifySearchCaseTests(unittest.TestCase):
    def test_flagship_exposes_required_acceptance_fields(self):
        result = verify_run("1111")
        self.assertTrue(result["passed"])
        self.assertTrue(result["structural_search_assertion_passed"])
        self.assertTrue(result["evidence_tier_correct"])
        self.assertTrue(result["candidates_have_next_step"])
        self.assertTrue(result["audit_log_complete"])
        self.assertIn("distinct_source_directions", result["exploration_diversity"])


if __name__ == "__main__":
    unittest.main()
