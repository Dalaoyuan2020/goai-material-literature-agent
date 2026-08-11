"""Verify all four iterative-search reports and their LLM audit trail."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SEARCH_DIR = REPO_ROOT / "outputs" / "search_runs"
AUDIT_DIR = REPO_ROOT / "outputs" / "llm_calls"
OUTPUT_PATH = REPO_ROOT / "outputs" / "search_verification.json"
EXPECTED_FAMILIES = {
    "122": "122",
    "1111": "1111",
    "11": "11",
    "MgB2": "diboride",
}
EXPECTED_METHOD = "llm_guided_iterative_candidate_expansion_and_pruning"


def _check(condition, name, details, checks):
    checks.append({"name": name, "passed": bool(condition), "details": details})


def _load_json(path):
    with Path(path).open(encoding="utf-8") as handle:
        return json.load(handle)


def verify_report(report, audit_dir=AUDIT_DIR):
    checks = []
    run_name = report.get("run_name")
    expected_family = EXPECTED_FAMILIES.get(run_name)
    _check(expected_family is not None, "known_family", run_name, checks)
    _check(
        report.get("structure_family") == expected_family,
        "family_mapping",
        f"expected={expected_family}, actual={report.get('structure_family')}",
        checks,
    )
    _check(
        report.get("method") == EXPECTED_METHOD,
        "honest_method_name",
        report.get("method"),
        checks,
    )

    initial_ids = set(report.get("initial_candidate_ids", []))
    initial_count = report.get("initial_candidate_pool_count", 0)
    final_count = report.get("candidate_pool_count", 0)
    _check(
        len(initial_ids) == initial_count,
        "initial_pool_count_matches_ids",
        f"count={initial_count}, ids={len(initial_ids)}",
        checks,
    )
    _check(
        final_count > initial_count,
        "candidate_pool_grew",
        f"{initial_count}->{final_count}",
        checks,
    )
    growth = [
        item.get("candidate_pool_count")
        for item in report.get("candidate_pool_growth", [])
    ]
    _check(
        len(growth) >= 2 and all(b > a for a, b in zip(growth, growth[1:])),
        "pool_growth_is_strict_by_round",
        growth,
        checks,
    )

    history = report.get("history", [])
    observed_ids = [
        candidate.get("candidate_id")
        for round_item in history
        for candidate in round_item.get("candidates", [])
    ]
    _check(
        len(observed_ids) == len(set(observed_ids)),
        "observed_ids_are_unique",
        f"observed={len(observed_ids)}, unique={len(set(observed_ids))}",
        checks,
    )
    later_round_novel = []
    for round_item in history[1:]:
        novel = sorted(
            {
                candidate.get("candidate_id")
                for candidate in round_item.get("candidates", [])
            }
            - initial_ids
        )
        later_round_novel.append(
            {"round": round_item.get("round"), "novel_ids": novel}
        )
    _check(
        bool(later_round_novel)
        and all(item["novel_ids"] for item in later_round_novel),
        "every_later_round_contains_id_impossible_in_round_1",
        [
            {"round": item["round"], "novel_count": len(item["novel_ids"])}
            for item in later_round_novel
        ],
        checks,
    )

    candidates = [
        candidate
        for round_item in history
        for candidate in round_item.get("candidates", [])
    ]
    _check(
        all(item.get("status") == "候选假设(未验证)" for item in candidates),
        "all_outputs_are_unverified_hypotheses",
        f"candidate_count={len(candidates)}",
        checks,
    )
    _check(
        all(
            item.get("source_evidence_tier") == "core_doi_backed"
            and item.get("target_evidence_tier") == "core_doi_backed"
            and item.get("matkg_role") == "vector_space_context_only"
            for item in candidates
        ),
        "evidence_tiers_remain_separate",
        f"candidate_count={len(candidates)}",
        checks,
    )

    call_ids = report.get("llm_call_ids", [])
    rounds_run = report.get("rounds_run", 0)
    _check(
        len(call_ids) == report.get("llm_call_count") == rounds_run * 2,
        "two_audited_llm_decisions_per_round",
        f"rounds={rounds_run}, call_ids={len(call_ids)}",
        checks,
    )
    audits = []
    missing_audits = []
    for call_id in call_ids:
        path = Path(audit_dir) / f"{call_id}.json"
        if not path.is_file():
            missing_audits.append(call_id)
            continue
        audits.append(_load_json(path))
    _check(
        not missing_audits and len(audits) == len(call_ids),
        "all_llm_audits_exist",
        {"missing": missing_audits, "loaded": len(audits)},
        checks,
    )
    task_counts = {
        task: sum(audit.get("task") == task for audit in audits)
        for task in ("candidate_ranking", "round_expansion_decision")
    }
    _check(
        task_counts["candidate_ranking"] == rounds_run
        and task_counts["round_expansion_decision"] == rounds_run,
        "audit_tasks_cover_ranking_and_expansion",
        task_counts,
        checks,
    )
    audit_real = any(
        audit.get("result", {}).get("real_llm_api_called", False)
        for audit in audits
    )
    _check(
        audit_real == bool(report.get("real_llm_api_called")),
        "real_llm_flag_matches_audits",
        f"report={report.get('real_llm_api_called')}, audits={audit_real}",
        checks,
    )
    _check(
        all(
            audit.get("credentials_written_to_audit") is False for audit in audits
        ),
        "audits_declare_no_credentials",
        f"audit_count={len(audits)}",
        checks,
    )
    return {
        "run_name": run_name,
        "passed": all(item["passed"] for item in checks),
        "summary": {
            "initial_candidate_pool_count": initial_count,
            "final_candidate_pool_count": final_count,
            "rounds_run": rounds_run,
            "observed_candidate_count": len(observed_ids),
            "later_round_novel_count": len(set(observed_ids) - initial_ids),
            "llm_call_count": len(call_ids),
            "real_llm_api_called": bool(report.get("real_llm_api_called")),
        },
        "checks": checks,
    }


def verify_all(search_dir=SEARCH_DIR, audit_dir=AUDIT_DIR):
    search_dir = Path(search_dir)
    family_results = []
    missing_reports = []
    for run_name in EXPECTED_FAMILIES:
        path = search_dir / f"{run_name}.json"
        if not path.is_file():
            missing_reports.append(str(path))
            continue
        family_results.append(verify_report(_load_json(path), audit_dir=audit_dir))
    by_name = {item["run_name"]: item for item in family_results}
    flagship = by_name.get("1111")
    flagship_checks = []
    if flagship:
        summary = flagship["summary"]
        _check(
            summary["initial_candidate_pool_count"] >= 49,
            "flagship_1111_meets_or_exceeds_historical_49_baseline",
            summary["initial_candidate_pool_count"],
            flagship_checks,
        )
        _check(
            summary["final_candidate_pool_count"]
            > summary["initial_candidate_pool_count"],
            "flagship_1111_expands_beyond_baseline",
            summary["final_candidate_pool_count"],
            flagship_checks,
        )
        _check(
            summary["later_round_novel_count"] > 0,
            "flagship_1111_has_later_round_novel_ids",
            summary["later_round_novel_count"],
            flagship_checks,
        )
    else:
        _check(False, "flagship_1111_report_exists", "missing", flagship_checks)
    passed = (
        not missing_reports
        and len(family_results) == len(EXPECTED_FAMILIES)
        and all(item["passed"] for item in family_results)
        and all(item["passed"] for item in flagship_checks)
    )
    return {
        "passed": passed,
        "expected_families": list(EXPECTED_FAMILIES),
        "missing_reports": missing_reports,
        "family_results": family_results,
        "flagship_1111_checks": flagship_checks,
    }


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-search", action="store_true")
    parser.add_argument("--search-dir", type=Path, default=SEARCH_DIR)
    parser.add_argument("--audit-dir", type=Path, default=AUDIT_DIR)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    return parser.parse_args()


def main():
    args = parse_args()
    if args.run_search:
        from search import run_all

        run_all()
    result = verify_all(args.search_dir, args.audit_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    for family in result["family_results"]:
        summary = family["summary"]
        print(
            f"{family['run_name']}: {'PASS' if family['passed'] else 'FAIL'}; "
            f"pool={summary['initial_candidate_pool_count']}->"
            f"{summary['final_candidate_pool_count']}; "
            f"later_novel={summary['later_round_novel_count']}; "
            f"llm_calls={summary['llm_call_count']}; "
            f"real_llm={summary['real_llm_api_called']}"
        )
    print(f"overall={'PASS' if result['passed'] else 'FAIL'}")
    print(f"report={args.output}")
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
