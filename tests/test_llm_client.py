import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "src"))

from llm_client import AuditedLLMClient  # noqa: E402


class _FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class LLMClientTests(unittest.TestCase):
    def test_missing_providers_use_honest_audited_fallback(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            client = AuditedLLMClient(config={}, audit_dir=temp_dir)
            result = client.decide(
                "test",
                "return json",
                {"input": 1},
                lambda: {"choice": "heuristic"},
            )
            audit = json.loads(Path(result["audit_path"]).read_text(encoding="utf-8"))
        self.assertFalse(result["real_llm_api_called"])
        self.assertEqual(result["provider"], "heuristic")
        self.assertEqual(result["value"], {"choice": "heuristic"})
        self.assertEqual(
            [item["status"] for item in audit["attempts"]],
            [
                "skipped_missing_configuration",
                "skipped_missing_configuration",
                "fallback_used",
            ],
        )
        self.assertFalse(audit["credentials_written_to_audit"])

    def test_step_success_is_parsed_and_key_is_not_audited(self):
        payload = {
            "choices": [{"message": {"content": '{"choice":"step"}'}}]
        }
        with tempfile.TemporaryDirectory() as temp_dir, patch(
            "urllib.request.urlopen", return_value=_FakeResponse(payload)
        ):
            client = AuditedLLMClient(
                config={
                    "STEP_API_KEY": "top-secret",
                    "STEP_BASE": "https://step.invalid/v1",
                },
                audit_dir=temp_dir,
            )
            result = client.decide(
                "test", "return json", {"input": 1}, lambda: {"choice": "fallback"}
            )
            audit_text = Path(result["audit_path"]).read_text(encoding="utf-8")
        self.assertTrue(result["real_llm_api_called"])
        self.assertEqual(result["provider"], "step")
        self.assertEqual(result["value"], {"choice": "step"})
        self.assertNotIn("top-secret", audit_text)


if __name__ == "__main__":
    unittest.main()
