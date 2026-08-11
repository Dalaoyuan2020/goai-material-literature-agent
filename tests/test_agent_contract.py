import importlib
import json
import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "src"))


class AgentContractTests(unittest.TestCase):
    def test_workflow_is_valid_and_every_function_resolves(self):
        workflow_path = REPO_ROOT / "agent" / "workflow.json"
        workflow = json.loads(workflow_path.read_text(encoding="utf-8"))
        self.assertEqual(workflow["schema_version"], "1.0")
        self.assertGreaterEqual(len(workflow["intents"]), 8)
        for spec in workflow["intents"]:
            name = spec["intent"]
            with self.subTest(intent=name):
                module_name, function_name = spec["action"].rsplit(".", 1)
                function = getattr(importlib.import_module(module_name), function_name)
                self.assertTrue(callable(function))

    def test_soul_is_machine_readable_and_preserves_honest_fallback(self):
        soul = json.loads(
            (REPO_ROOT / "agent" / "soul.json").read_text(encoding="utf-8")
        )
        self.assertEqual(
            soul["search_method"],
            "llm_guided_iterative_candidate_expansion_and_pruning",
        )
        self.assertEqual(soul["fallback_mode"], "heuristic_fallback_llm_unreachable")
        self.assertIn("未验证", soul["required_status"])

    def test_agent_rules_reference_machine_contract_and_evidence_boundaries(self):
        text = (REPO_ROOT / "agent" / "CLAUDE.md").read_text(encoding="utf-8")
        self.assertIn("workflow.json", text)
        self.assertIn("MatKG", text)
        self.assertIn("候选假设(未验证)", text)
        self.assertIn("real_llm_api_called", text)


if __name__ == "__main__":
    unittest.main()
