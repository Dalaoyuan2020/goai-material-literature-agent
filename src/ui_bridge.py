"""JSON bridge between the desktop workbench and the material-literature agent.

The bridge only exposes actions declared by ``agent/workflow.json``.  It keeps
the Electron/Node layer free of scientific logic and returns a compact summary
that the UI can render without inventing analysis metrics.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = REPO_ROOT / "outputs"


SKILL_ACTIONS = {
    "compile-pipeline": ("compile_knowledge_pipeline", "pipeline"),
    "research-run": ("compile_knowledge_pipeline", "pipeline"),
    "citespace-run": ("compile_knowledge_pipeline", "pipeline"),
    "relation-infer": ("compile_knowledge_pipeline", "pipeline"),
    "search-122": ("search_122_family", "search"),
    "search-1111": ("search_1111_family", "search"),
    "search-11": ("search_11_family", "search"),
    "search-mgb2": ("search_mgb2_family", "search"),
    "run-all-searches": ("run_all_family_searches", "search_all"),
    "material-search": ("read_knowledge_summary", "summary"),
    "report-build": ("read_knowledge_summary", "summary"),
}

SEARCH_PARAMS = {
    "search-122": ("122", "122"),
    "search-1111": ("1111", "1111"),
    "search-11": ("11", "11"),
    "search-mgb2": ("MgB2", "diboride"),
}


def _load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def _pipeline_summary(report: dict, *, search_report: dict | None = None) -> dict:
    structure = report["L2_structure"]
    rules = report["L3_rules"]
    application = report["L4_application"]
    candidates = application.get("candidates", [])
    central_nodes = []
    for candidate in candidates:
        for key in ("target_base", "source_transform"):
            value = str(candidate.get(key, "")).strip()
            if value and value not in central_nodes:
                central_nodes.append(value)
    search_retained = int((search_report or {}).get("retained_candidate_count", 0))
    return {
        "nodes": int(structure.get("materials_count", 0)),
        "edges": int(structure.get("edges_count", 0)),
        "coreMaterials": int(structure.get("core_materials_count", 0)),
        "candidates": int(application.get("candidates_generated", 0)),
        "evidencePairs": int(rules.get("non_degenerate_evidence", 0)),
        "families": len(structure.get("structure_families", [])),
        "searchRetained": search_retained,
        "centralNodes": central_nodes[:8],
    }


def _assert_contract(intent: str) -> None:
    contract = _load_json(REPO_ROOT / "agent" / "workflow.json")
    allowed = {item["intent"] for item in contract.get("intents", [])}
    if intent not in allowed:
        raise ValueError(f"intent is not allowed by agent/workflow.json: {intent}")


def read_knowledge_summary() -> dict:
    """Return a compact view of the current, already-built real artifacts."""

    return _pipeline_summary(_load_json(OUTPUTS / "pipeline_report.json"))


def run_skill(skill_id: str) -> dict:
    if skill_id not in SKILL_ACTIONS:
        raise ValueError(f"unsupported workbench skill: {skill_id}")
    intent, action = SKILL_ACTIONS[skill_id]
    _assert_contract(intent)

    artifact = OUTPUTS / "pipeline_report.json"
    search_report = None
    if action == "pipeline":
        from pipeline import run

        run()
    elif action == "search":
        from search import run_family_search

        run_name, family = SEARCH_PARAMS[skill_id]
        search_report = run_family_search(run_name, family)
        artifact = OUTPUTS / "search_runs" / f"{run_name}.json"
    elif action == "search_all":
        from search import run_all

        run_all()
        artifact = OUTPUTS / "search_runs"

    pipeline_report = _load_json(OUTPUTS / "pipeline_report.json")
    if action == "search_all":
        reports = [
            _load_json(OUTPUTS / "search_runs" / f"{name}.json")
            for name in ("122", "1111", "11", "MgB2")
        ]
        search_report = {
            "retained_candidate_count": sum(
                int(item.get("retained_candidate_count", 0)) for item in reports
            )
        }

    summary = (
        read_knowledge_summary()
        if action == "summary"
        else _pipeline_summary(pipeline_report, search_report=search_report)
    )
    return {
        "ok": True,
        "skillId": skill_id,
        "intent": intent,
        "artifact": str(artifact),
        "summary": summary,
        "message": (
            f"真实工作流已完成：{summary['nodes']} 个知识节点、"
            f"{summary['edges']} 条边、{summary['evidencePairs']} 组非退化证据。"
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skill", required=True)
    args = parser.parse_args()
    try:
        result = run_skill(args.skill)
    except Exception as error:  # surfaced verbatim to the local API caller
        print(
            "BRIDGE_JSON "
            + json.dumps(
                {"ok": False, "skillId": args.skill, "error": str(error)},
                ensure_ascii=False,
            )
        )
        return 1
    print("BRIDGE_JSON " + json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    raise SystemExit(main())
