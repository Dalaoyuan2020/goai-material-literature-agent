import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "src"))

from mp_crosscheck import (  # noqa: E402
    compositions_match,
    derive_candidate_composition,
    normalize_mp_composition,
)


class MaterialsProjectCrosscheckTests(unittest.TestCase):
    def test_valid_vector_candidate_is_normalized(self):
        result = derive_candidate_composition(
            {
                "target_base": "FeSe1-xSx",
                "predicted_composition_delta": {"Se": -0.25, "Te": 0.25},
            }
        )
        self.assertTrue(result["queryable"])
        self.assertEqual(
            result["derived_normalized_composition"],
            {"Fe": 0.5, "S": 0.25, "Te": 0.25},
        )
        self.assertEqual(result["query_chemsys"], "Fe-S-Te")
        self.assertEqual(
            result["derivation_assumptions"],
            ["沿用graph.py雏形约定，将变量x固定为0.5"],
        )

    def test_negative_stoichiometry_is_not_queried(self):
        result = derive_candidate_composition(
            {
                "target_base": "SrFe2As2",
                "predicted_composition_delta": {"Ba": -0.08, "K": 0.08},
            }
        )
        self.assertFalse(result["queryable"])
        self.assertEqual(result["negative_components"], {"Ba": -0.08})

    def test_mp_composition_is_compared_as_normalized_fractions(self):
        observed = normalize_mp_composition({"Fe": 2, "S": 1, "Te": 1})
        self.assertIsNotNone(observed)
        self.assertTrue(
            compositions_match(
                {"Fe": 0.5, "S": 0.25, "Te": 0.25}, observed, 1e-3
            )
        )
        self.assertFalse(
            compositions_match(
                {"Fe": 0.5, "Se": 0.25, "Te": 0.25}, observed, 1e-3
            )
        )


if __name__ == "__main__":
    unittest.main()
