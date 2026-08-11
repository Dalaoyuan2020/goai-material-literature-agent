import json
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


class WalkthroughTests(unittest.TestCase):
    def test_1111_key_numbers_match_machine_report(self):
        report = json.loads(
            (REPO_ROOT / "outputs" / "search_runs" / "1111.json").read_text(
                encoding="utf-8"
            )
        )
        text = (
            REPO_ROOT / "outputs" / "flagship_case_1111_walkthrough.md"
        ).read_text(encoding="utf-8")
        growth = " → ".join(
            str(item["candidate_pool_count"])
            for item in report["candidate_pool_growth"]
        )
        self.assertIn(growth, text)
        self.assertIn(f"实际观察 {sum(item['proposed_count'] for item in report['history'])} 个", text)
        self.assertIn(f"后续轮观察到 {report['later_round_novel_vs_round1_count']} 个", text)
        self.assertIn(f"{report['llm_call_count']} 次 LLM 逻辑调用", text)
        self.assertIn("0 次真实 API 成功调用", text)
        self.assertFalse(report["real_llm_api_called"])


if __name__ == "__main__":
    unittest.main()
