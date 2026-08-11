import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "src"))

from search import convergence_reason, propose_next_round, score_candidate  # noqa: E402


class SearchTests(unittest.TestCase):
    def test_observed_candidate_is_never_recommended_again(self):
        candidates = [
            {"candidate_id": "a", "source_cosine_hint": 0.9},
            {"candidate_id": "b", "source_cosine_hint": 0.8},
            {"candidate_id": "c", "source_cosine_hint": 0.7},
        ]
        history = [{"round": 1, "candidates": [{"candidate_id": "a"}]}]
        proposed = propose_next_round(candidates, history, batch_size=3)
        self.assertEqual([item["candidate_id"] for item in proposed], ["b", "c"])

    def test_two_empty_rounds_trigger_convergence(self):
        self.assertIsNone(convergence_reason(1, 1, max_rounds=5))
        self.assertEqual(
            convergence_reason(2, 2, max_rounds=5),
            "converged_two_rounds_without_new_non_degenerate_candidate",
        )

    def test_score_uses_cosine_and_explicit_comn_penalty(self):
        vecs = {
            "Ba": [0.0, 0.0],
            "BaCo": [1.0, 0.0],
            "Sr": [0.0, 1.0],
            "SrMn": [2.0, 1.0],
        }
        candidate = {
            "relation_type": "R2",
            "source_pair": ["Ba", "BaCo"],
            "reference_pair": ["Sr", "SrMn"],
        }
        self.assertEqual(score_candidate(candidate, vecs, comp_dims=2), 0.5)


if __name__ == "__main__":
    unittest.main()
