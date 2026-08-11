import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "src"))

from application import find_analogy_source  # noqa: E402
from search import (  # noqa: E402
    convergence_reason,
    propose_next_round,
    run_family_search,
    score_candidate,
)


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

    def test_ranked_analogy_sources_preserve_best_source_compatibility(self):
        edges = [
            {"关系类型": "R", "材料A": "a", "材料B": "b"},
            {"关系类型": "R", "材料A": "c", "材料B": "d"},
            {"关系类型": "R", "材料A": "e", "材料B": "f"},
        ]
        vecs = {
            "a": [0.0, 0.0, 1.0],
            "b": [1.0, 0.0, 1.0],
            "c": [0.0, 1.0, 1.0],
            "d": [1.0, 1.0, 1.0],
            "e": [0.0, 0.0, 1.0],
            "f": [0.8, 0.6, 1.0],
        }
        ranked = find_analogy_source(
            edges, {}, vecs, 2, "R", ranked_pairs=True
        )
        best = find_analogy_source(edges, {}, vecs, 2, "R")
        self.assertGreater(len(ranked), 1)
        self.assertEqual(best, ranked[0])
        self.assertGreaterEqual(abs(ranked[0]["cosine"]), abs(ranked[1]["cosine"]))

    def test_round_expansion_exposes_id_impossible_in_first_round(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            report = run_family_search(
                "1111-test",
                "1111",
                max_rounds=3,
                batch_size=4,
                output_dir=Path(temp_dir),
            )
        first_round_possible = set(report["initial_candidate_ids"])
        second_round_ids = {
            candidate["candidate_id"]
            for candidate in report["history"][1]["candidates"]
        }
        self.assertGreater(report["candidate_pool_count"], report["initial_candidate_pool_count"])
        self.assertTrue(second_round_ids - first_round_possible)


if __name__ == "__main__":
    unittest.main()
