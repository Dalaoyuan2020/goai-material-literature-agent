"""Verify one family-search artifact using the overnight acceptance fields."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from verify_search import AUDIT_DIR, EXPECTED_FAMILIES, SEARCH_DIR, verify_report


REPO_ROOT = Path(__file__).resolve().parents[1]


def _load_json(path):
    with Path(path).open(encoding="utf-8") as handle:
        return json.load(handle)


def verify_run(run_name, search_dir=SEARCH_DIR, audit_dir=AUDIT_DIR):
    """Return the concise, machine-readable acceptance summary for one run."""

    if run_name not in EXPECTED_FAMILIES:
        raise ValueError(f"unknown run_name: {run_name}")
    report_path = Path(search_dir) / f"{run_name}.json"
    if not report_path.is_file():
        raise FileNotFoundError(report_path)
    report = _load_json(report_path)
    detailed = verify_report(report, audit_dir=audit_dir)
    candidates = [
        candidate
        for round_item in report.get("history", [])
        for candidate in round_item.get("candidates", [])
    ]
    call_ids = report.get("llm_call_ids", [])
    audits = [
        _load_json(Path(audit_dir) / f"{call_id}.json")
        for call_id in call_ids
        if (Path(audit_dir) / f"{call_id}.json").is_file()
    ]
    real_calls = sum(
        bool(item.get("result", {}).get("real_llm_api_called")) for item in audits
    )
    later_ids = {
        candidate.get("candidate_id")
        for round_item in report.get("history", [])[1:]
        for candidate in round_item.get("candidates", [])
    }
    initial_ids = set(report.get("initial_candidate_ids", []))
    source_directions = {
        (
            candidate.get("relation_type"),
            tuple(candidate.get("source_pair", [])),
            tuple(candidate.get("reference_pair", [])),
        )
        for candidate in candidates
    }
    evidence_tier_correct = all(
        candidate.get("source_evidence_tier") == "core_doi_backed"
        and candidate.get("target_evidence_tier") == "core_doi_backed"
        and candidate.get("matkg_role") == "vector_space_context_only"
        for candidate in candidates
    )
    candidates_have_next_step = all(
        bool(candidate.get("prediction", {}).get("next_step_required"))
        for candidate in candidates
    )
    audit_log_complete = (
        len(audits) == len(call_ids) == report.get("llm_call_count")
        and all(item.get("credentials_written_to_audit") is False for item in audits)
    )
    structural_passed = (
        report.get("candidate_pool_count", 0)
        > report.get("initial_candidate_pool_count", 0)
        and bool(later_ids - initial_ids)
        and any(
            (candidate.get("rank_within_relation_type") or 0) >= 2
            for candidate in candidates
        )
    )
    result = {
        "run_name": run_name,
        "passed": bool(
            detailed["passed"]
            and structural_passed
            and evidence_tier_correct
            and candidates_have_next_step
            and audit_log_complete
        ),
        "structural_search_assertion_passed": structural_passed,
        "llm_participation_rate": round(real_calls / len(audits), 4) if audits else 0.0,
        "llm_call_count": len(call_ids),
        "real_llm_call_count": real_calls,
        "evidence_tier_correct": evidence_tier_correct,
        "exploration_diversity": {
            "distinct_relation_types": len(
                {candidate.get("relation_type") for candidate in candidates}
            ),
            "distinct_source_directions": len(source_directions),
            "later_round_novel_ids": len(later_ids - initial_ids),
        },
        "candidates_have_next_step": candidates_have_next_step,
        "audit_log_complete": audit_log_complete,
        "pool_growth_by_round": report.get("pool_growth_by_round", []),
        "expansion_source_by_round": report.get("expansion_source_by_round", []),
        "detailed_verification": detailed,
    }
    return result


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True, choices=list(EXPECTED_FAMILIES))
    parser.add_argument("--search-dir", type=Path, default=SEARCH_DIR)
    parser.add_argument("--audit-dir", type=Path, default=AUDIT_DIR)
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


def main():
    args = parse_args()
    result = verify_run(args.run, args.search_dir, args.audit_dir)
    output = args.output or REPO_ROOT / "outputs" / f"search_verification_{args.run}.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in result.items() if key != "detailed_verification"}, ensure_ascii=False, indent=2))
    print(f"report={output}")
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
