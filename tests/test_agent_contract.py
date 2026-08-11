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
        self.assertGreaterEqual(len(workflow["intents"]), 9)
        for name, spec in workflow["intents"].items():
            with self.subTest(intent=name):
                module_name, function_name = spec["function"].rsplit(".", 1)
                function = getattr(importlib.import_module(module_name), function_name)
                self.assertTrue(callable(function))

    def test_agent_rules_reference_machine_contract_and_evidence_boundaries(self):
        text = (REPO_ROOT / "agent" / "CLAUDE.md").read_text(encoding="utf-8")
        self.assertIn("workflow.json", text)
        self.assertIn("MatKG", text)
        self.assertIn("候选假设(未验证)", text)
        self.assertIn("real_llm_api_called", text)


if __name__ == "__main__":
    unittest.main()
