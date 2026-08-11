import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "src"))

from verify_search import verify_all  # noqa: E402


class VerifySearchTests(unittest.TestCase):
    def test_current_four_family_outputs_pass(self):
        result = verify_all()
        self.assertTrue(result["passed"])
        self.assertEqual(len(result["family_results"]), 4)
        flagship = next(
            item for item in result["family_results"] if item["run_name"] == "1111"
        )
        self.assertGreaterEqual(flagship["summary"]["initial_candidate_pool_count"], 49)
        self.assertGreater(
            flagship["summary"]["final_candidate_pool_count"],
            flagship["summary"]["initial_candidate_pool_count"],
        )


if __name__ == "__main__":
    unittest.main()
