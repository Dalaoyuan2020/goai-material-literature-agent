"""Evidence-aware Bayesian-optimization-style search controller.

The three LLAMBO positions are represented explicitly, but this run does not
call an LLM API.  Candidate warmstarting, judgement, and sampling are a
deterministic heuristic approximation, not an LLM result.  The surrogate
signal is not a fitted black box: it reuses ``rules.cosine`` on DOI-backed core
transformations.  MatKG remains weak vector-space context only.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Iterable

from application import find_analogy_source, propose_candidate
from graph import build_graph, load_core_edges, vectorize
from rules import cosine, edge_vector, is_degenerate


REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = REPO_ROOT / "outputs" / "search_runs"
FAMILY_RUNS = {
    "122": "122",
    "1111": "1111",
    "11": "11",
    "MgB2": "diboride",
}
HEURISTIC_MODE = "heuristic_approximation_not_real_llm"


def _candidate_id(relation_type: str, source_pair: tuple[str, str], target: str) -> str:
    return f"{relation_type}|{source_pair[0]}->{source_pair[1]}|{target}"


def warmstart_candidates(
    relation_type,
    materials,
    els,
    families,
    *,
    core_edges=None,
    vecs=None,
    comp_dims=None,
    family=None,
    target_materials=None,
):
    """Generate deterministic warmstart candidates from core evidence.

    This is the LLAMBO warmstart position implemented as a transparent
    heuristic approximation, not a real LLM call.  ``find_analogy_source``
    supplies a non-degenerate pair of DOI-backed core transformations.  MatKG
    nodes may be present in ``materials``/``vecs`` for vector-space coverage,
    but candidate targets default to core materials only.
    """

    core_edges = load_core_edges() if core_edges is None else core_edges
    if vecs is None:
        vecs, derived_els, derived_families = vectorize(materials)
        if list(els) != list(derived_els) or list(families) != list(derived_families):
            raise ValueError("els/families do not match materials vectorization")
    comp_dims = len(els) if comp_dims is None else comp_dims
    source = find_analogy_source(core_edges, materials, vecs, comp_dims, relation_type)
    if source is None:
        return []

    core_names = {
        name for edge in core_edges for name in (edge["材料A"], edge["材料B"])
    }
    allowed_targets = core_names if target_materials is None else set(target_materials)
    used = set(source["pair1"]) | set(source["pair2"])
    targets = [
        name
        for name in sorted(allowed_targets)
        if name in materials
        and name in vecs
        and name not in used
        and (family is None or materials[name]["structure_family"] == family)
    ]

    candidates = []
    source_pair = tuple(source["pair1"])
    reference_pair = tuple(source["pair2"])
    for target in targets:
        prediction = propose_candidate(
            vecs, materials, source_pair, target, els, families
        )
        if prediction is None:
            continue
        candidates.append(
            {
                "candidate_id": _candidate_id(relation_type, source_pair, target),
                "relation_type": relation_type,
                "family": materials[target]["structure_family"],
                "source_pair": list(source_pair),
                "reference_pair": list(reference_pair),
                "source_cosine_hint": round(source["cosine"], 4),
                "target_base": target,
                "prediction": prediction,
                "status": "候选假设(未验证)",
                "generation_mode": HEURISTIC_MODE,
                "source_evidence_tier": "core_doi_backed",
                "target_evidence_tier": "core_doi_backed",
                "matkg_role": "vector_space_context_only",
            }
        )
    return candidates


def _score_details(candidate, vecs, comp_dims):
    source_a, source_b = candidate["source_pair"]
    ref_a, ref_b = candidate["reference_pair"]
    source_vec = edge_vector(vecs, source_a, source_b)
    reference_vec = edge_vector(vecs, ref_a, ref_b)
    signed_cosine = cosine(source_vec, reference_vec)
    degenerate = is_degenerate(source_vec, reference_vec, comp_dims)

    penalty_factor = 1.0
    penalty_reasons = []
    if degenerate:
        penalty_factor *= 0.1
        penalty_reasons.append(
            "encoding-degenerate composition delta; alignment is construction-driven"
        )

    pair_text = " ".join(candidate["source_pair"] + candidate["reference_pair"])
    if candidate.get("relation_type") == "R2" and "Co" in pair_text and "Mn" in pair_text:
        penalty_factor *= 0.5
        penalty_reasons.append(
            "known Co/Mn counterexample boundary: composition cosine cannot infer effect direction"
        )

    # Existing L3 treats both parallel and anti-parallel non-degenerate
    # alignments as strong geometric signals, so ranking uses abs(cosine) while
    # retaining the signed value for interpretation.
    score = abs(signed_cosine) * penalty_factor
    return {
        "score": round(score, 4),
        "signed_cosine": round(signed_cosine, 4),
        "absolute_cosine": round(abs(signed_cosine), 4),
        "degenerate": degenerate,
        "penalty_factor": round(penalty_factor, 4),
        "penalty_reasons": penalty_reasons,
        "surrogate": "rules.cosine_core_transform_alignment",
        "black_box_model_used": False,
    }


def score_candidate(candidate, vecs, comp_dims) -> float:
    """Score one hypothesis with the real ``rules.cosine`` surrogate signal."""

    return _score_details(candidate, vecs, comp_dims)["score"]


def _observed_candidate_ids(history: Iterable[dict]) -> set[str]:
    observed = set()
    for item in history:
        if "candidate_id" in item:
            observed.add(item["candidate_id"])
        for candidate in item.get("candidates", []):
            if "candidate_id" in candidate:
                observed.add(candidate["candidate_id"])
    return observed


def propose_next_round(scored_candidates, history, batch_size=4):
    """Select unseen candidates for the LLAMBO sampling position.

    This is deterministic heuristic sampling, not an LLM call.  The hard
    LLAMBO constraint is enforced: an observed candidate ID is never returned
    again.
    """

    observed = _observed_candidate_ids(history)
    unseen = [
        candidate
        for candidate in scored_candidates
        if candidate["candidate_id"] not in observed
    ]
    unseen.sort(
        key=lambda candidate: (
            -abs(candidate.get("source_cosine_hint", candidate.get("score", 0.0))),
            candidate["candidate_id"],
        )
    )
    return unseen[:batch_size]


def convergence_reason(round_number, consecutive_no_new, max_rounds=5):
    if consecutive_no_new >= 2:
        return "converged_two_rounds_without_new_non_degenerate_candidate"
    if round_number >= max_rounds:
        return "max_rounds_reached"
    return None


def run_family_search(
    run_name,
    family,
    *,
    max_rounds=5,
    patience=2,
    batch_size=4,
    output_dir=OUTPUT_DIR,
):
    materials, vector_edges = build_graph(include_extended=True)
    core_edges = load_core_edges()
    vecs, els, families = vectorize(materials)
    comp_dims = len(els)
    core_materials = list(
        dict.fromkeys(
            name for edge in core_edges for name in (edge["材料A"], edge["材料B"])
        )
    )
    family_targets = [
        name
        for name in core_materials
        if materials[name]["structure_family"] == family
    ]

    candidate_pool = []
    relation_types = sorted({edge["关系类型"] for edge in core_edges})
    for relation_type in relation_types:
        candidate_pool.extend(
            warmstart_candidates(
                relation_type,
                materials,
                els,
                families,
                core_edges=core_edges,
                vecs=vecs,
                comp_dims=comp_dims,
                family=family,
                target_materials=family_targets,
            )
        )
    candidate_pool = list(
        {candidate["candidate_id"]: candidate for candidate in candidate_pool}.values()
    )

    history = []
    consecutive_no_new = 0
    stop_reason = None
    accepted_ids = []
    for round_number in range(1, max_rounds + 1):
        proposed = propose_next_round(candidate_pool, history, batch_size=batch_size)
        scored = []
        new_non_degenerate = 0
        for candidate in proposed:
            item = dict(candidate)
            details = _score_details(item, vecs, comp_dims)
            item.update(details)
            item["decision_mode"] = HEURISTIC_MODE
            item["decision"] = "retain_for_external_validation" if details["score"] > 0 else "prune"
            item["status"] = "候选假设(未验证)"
            scored.append(item)
            if not details["degenerate"] and details["score"] > 0:
                new_non_degenerate += 1
                accepted_ids.append(item["candidate_id"])

        consecutive_no_new = (
            consecutive_no_new + 1 if new_non_degenerate == 0 else 0
        )
        history.append(
            {
                "round": round_number,
                "proposed_count": len(proposed),
                "new_non_degenerate_count": new_non_degenerate,
                "consecutive_no_new": consecutive_no_new,
                "candidates": scored,
            }
        )
        stop_reason = convergence_reason(
            round_number,
            consecutive_no_new,
            max_rounds=max_rounds,
        )
        if consecutive_no_new >= patience:
            stop_reason = "converged_two_rounds_without_new_non_degenerate_candidate"
        if stop_reason:
            break

    report = {
        "run_name": run_name,
        "structure_family": family,
        "method": "bayesian_optimization_style_search",
        "llm_integration_mode": HEURISTIC_MODE,
        "real_llm_api_called": False,
        "surrogate_model": "interpretable_rules.cosine_not_black_box",
        "evidence_policy": {
            "source_transformations": "core_doi_backed_only",
            "candidate_targets": "core_doi_backed_only",
            "matkg_extension": "weak_vector_space_context_only",
            "core_edges_count": len(core_edges),
            "matkg_extended_edges_count": len(vector_edges) - len(core_edges),
        },
        "family_core_materials": family_targets,
        "family_core_materials_count": len(family_targets),
        "candidate_pool_count": len(candidate_pool),
        "rounds_run": len(history),
        "round_candidate_counts": [item["proposed_count"] for item in history],
        "retained_candidate_count": len(set(accepted_ids)),
        "stop_reason": stop_reason,
        "converged": stop_reason
        == "converged_two_rounds_without_new_non_degenerate_candidate",
        "status": (
            "data_insufficient_no_candidate"
            if not candidate_pool
            else "completed"
        ),
        "history": history,
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{run_name}.json"
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    return report


def run_all():
    reports = [
        run_family_search(run_name, family)
        for run_name, family in FAMILY_RUNS.items()
    ]
    for report in reports:
        print(
            f"{report['run_name']}: rounds={report['rounds_run']}, "
            f"pool={report['candidate_pool_count']}, "
            f"retained={report['retained_candidate_count']}, "
            f"stop={report['stop_reason']}"
        )
    print("诚信声明：本轮候选生成/判断/采样是启发式近似，非真实 LLM 调用。")
    print("证据声明：核心 DOI 边用于搜索证据；MatKG 仅作弱向量空间背景。")
    return reports


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    run_all()
