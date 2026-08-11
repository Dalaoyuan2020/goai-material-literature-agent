"""Evidence-aware iterative search controller.

Candidate ranking and round-expansion decisions use the audited STEP -> Gemini
-> explicit heuristic fallback in ``llm_client``.  The numerical signal is not
a fitted black box or Bayesian posterior: it reuses ``rules.cosine`` on
DOI-backed core transformations.  MatKG remains weak vector-space context only.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Iterable

from application import find_analogy_source, propose_candidate
from graph import build_graph, load_core_edges, vectorize
from llm_client import AuditedLLMClient
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


def _candidate_id(
    relation_type: str,
    source_pair: tuple[str, str],
    reference_pair: tuple[str, str],
    target: str,
) -> str:
    """Identify the evidence direction as well as the transfer target."""

    return (
        f"{relation_type}|{source_pair[0]}->{source_pair[1]}"
        f"~{reference_pair[0]}->{reference_pair[1]}|{target}"
    )


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
    source_evidence=None,
    source_rank=0,
    exposed_round=1,
    exclude_source_pairs=None,
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
    source = source_evidence
    if source is None:
        ranked_sources = find_analogy_source(
            core_edges,
            materials,
            vecs,
            comp_dims,
            relation_type,
            exclude_pairs=exclude_source_pairs,
            ranked_pairs=True,
        )
        source = ranked_sources[source_rank] if source_rank < len(ranked_sources) else None
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
                "candidate_id": _candidate_id(
                    relation_type, source_pair, reference_pair, target
                ),
                "relation_type": relation_type,
                "family": materials[target]["structure_family"],
                "source_pair": list(source_pair),
                "reference_pair": list(reference_pair),
                "source_rank": source_rank,
                "rank_within_relation_type": source_rank + 1,
                "exposed_round": exposed_round,
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


def propose_next_round(
    scored_candidates,
    history,
    batch_size=4,
    *,
    llm_client=None,
    context=None,
    return_metadata=False,
):
    """Select unseen candidates using audited LLM ranking when configured.

    The hard constraint is enforced locally regardless of provider output: an
    observed candidate ID is never returned again, and invented IDs are ignored.
    """

    observed = _observed_candidate_ids(history)
    unseen = [
        candidate
        for candidate in scored_candidates
        if candidate["candidate_id"] not in observed
    ]
    heuristic_order = sorted(
        unseen,
        key=lambda candidate: (
            -candidate.get("exposed_round", 1),
            -abs(candidate.get("source_cosine_hint", candidate.get("score", 0.0))),
            candidate["candidate_id"],
        ),
    )
    metadata = {
        "provider": "heuristic",
        "mode": HEURISTIC_MODE,
        "real_llm_api_called": False,
        "reason": "deterministic evidence score ordering",
    }
    selected = heuristic_order[:batch_size]
    if llm_client is not None and unseen:
        result = llm_client.rank_candidates(
            unseen,
            context or {"observed_candidate_count": len(observed)},
            batch_size,
        )
        value = result.get("value") if isinstance(result, dict) else None
        ranked_ids = value.get("ranked_candidate_ids", []) if isinstance(value, dict) else []
        allowed = {candidate["candidate_id"]: candidate for candidate in unseen}
        valid_ids = []
        for candidate_id in ranked_ids if isinstance(ranked_ids, list) else []:
            if candidate_id in allowed and candidate_id not in valid_ids:
                valid_ids.append(candidate_id)
        for candidate in heuristic_order:
            if len(valid_ids) >= batch_size:
                break
            if candidate["candidate_id"] not in valid_ids:
                valid_ids.append(candidate["candidate_id"])
        selected = [allowed[candidate_id] for candidate_id in valid_ids[:batch_size]]
        metadata = {
            "provider": result["provider"],
            "model": result.get("model"),
            "mode": result["mode"],
            "real_llm_api_called": result["real_llm_api_called"],
            "call_id": result["call_id"],
            "reason": value.get("reason") if isinstance(value, dict) else None,
            "invalid_or_missing_ids_filled_heuristically": len(valid_ids)
            != len(ranked_ids) if isinstance(ranked_ids, list) else True,
        }
    if return_metadata:
        return selected, metadata
    return selected


def _heuristic_expansion_decision(history, ranked_sources, exposed_depths):
    """Choose one evidence direction to deepen, or switch when it is exhausted.

    This temporary policy is explicit heuristic control.  The LLM integration
    replaces this decision point without changing the round-expansion state
    machine.
    """

    expandable = [
        relation_type
        for relation_type, sources in ranked_sources.items()
        if exposed_depths.get(relation_type, 0) < len(sources)
    ]
    if not expandable:
        return {
            "action": "stop_no_unexposed_source",
            "relation_types": [],
            "mode": HEURISTIC_MODE,
            "reason": "all ranked non-degenerate source pairs are exposed",
        }

    last_candidates = history[-1].get("candidates", []) if history else []
    best_by_relation = {}
    for candidate in last_candidates:
        relation_type = candidate["relation_type"]
        best_by_relation[relation_type] = max(
            best_by_relation.get(relation_type, 0.0), candidate.get("score", 0.0)
        )
    deepenable = [item for item in expandable if item in best_by_relation]
    if deepenable:
        selected = max(
            deepenable,
            key=lambda item: (best_by_relation[item], -exposed_depths[item], item),
        )
        action = "deepen"
        reason = "best scored relation from the completed round still has ranked sources"
    else:
        selected = max(
            expandable,
            key=lambda item: (
                len(ranked_sources[item]) - exposed_depths.get(item, 0),
                item,
            ),
        )
        action = "switch"
        reason = "completed-round relations are exhausted; switch to an unexposed direction"
    return {
        "action": action,
        "relation_types": [selected],
        "mode": HEURISTIC_MODE,
        "reason": reason,
    }


def _expansion_directions(history, ranked_sources, exposed_depths):
    last_candidates = history[-1].get("candidates", []) if history else []
    latest_scores = {}
    for candidate in last_candidates:
        relation_type = candidate["relation_type"]
        latest_scores[relation_type] = max(
            latest_scores.get(relation_type, 0.0), candidate.get("score", 0.0)
        )
    return [
        {
            "relation_type": relation_type,
            "latest_best_score": latest_scores.get(relation_type),
            "exposed_source_count": exposed_depths.get(relation_type, 0),
            "total_ranked_source_count": len(sources),
            "expandable": exposed_depths.get(relation_type, 0) < len(sources),
        }
        for relation_type, sources in sorted(ranked_sources.items())
    ]


def _llm_expansion_decision(history, ranked_sources, exposed_depths, llm_client):
    heuristic = _heuristic_expansion_decision(
        history, ranked_sources, exposed_depths
    )
    if llm_client is None:
        return heuristic
    directions = _expansion_directions(history, ranked_sources, exposed_depths)
    result = llm_client.decide_expansion(
        {
            "round": history[-1]["round"],
            "proposed_count": history[-1]["proposed_count"],
            "new_non_degenerate_count": history[-1]["new_non_degenerate_count"],
            "candidate_scores": [
                {
                    "candidate_id": item["candidate_id"],
                    "relation_type": item["relation_type"],
                    "score": item["score"],
                    "degenerate": item["degenerate"],
                }
                for item in history[-1]["candidates"]
            ],
        },
        directions,
        lambda: dict(heuristic),
    )
    raw = result.get("value") if isinstance(result, dict) else None
    expandable = {
        item["relation_type"] for item in directions if item["expandable"]
    }
    selected = raw.get("relation_types", []) if isinstance(raw, dict) else []
    selected = [
        relation_type
        for relation_type in selected if relation_type in expandable
    ] if isinstance(selected, list) else []
    action = raw.get("action") if isinstance(raw, dict) else None
    valid_action = action in {"deepen", "switch", "stop_no_unexposed_source"}
    if not valid_action or (expandable and action != "stop_no_unexposed_source" and not selected):
        decision = dict(heuristic)
        decision["validation_fallback"] = "provider decision was outside expandable directions"
    else:
        decision = {
            "action": action,
            "relation_types": selected[:1],
            "reason": raw.get("reason", ""),
        }
    decision.update(
        {
            "provider": result["provider"],
            "model": result.get("model"),
            "mode": result["mode"],
            "real_llm_api_called": result["real_llm_api_called"],
            "call_id": result["call_id"],
        }
    )
    return decision


def _candidates_for_source(
    relation_type,
    source_rank,
    ranked_sources,
    materials,
    els,
    families,
    core_edges,
    vecs,
    comp_dims,
    family,
    family_targets,
    exposed_round,
):
    return warmstart_candidates(
        relation_type,
        materials,
        els,
        families,
        core_edges=core_edges,
        vecs=vecs,
        comp_dims=comp_dims,
        family=family,
        target_materials=family_targets,
        source_evidence=ranked_sources[relation_type][source_rank],
        source_rank=source_rank,
        exposed_round=exposed_round,
    )


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
    llm_client=None,
):
    llm_client = AuditedLLMClient() if llm_client is None else llm_client
    first_llm_call_index = len(llm_client.calls)
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

    relation_types = sorted({edge["关系类型"] for edge in core_edges})
    ranked_sources = {
        relation_type: find_analogy_source(
            core_edges,
            materials,
            vecs,
            comp_dims,
            relation_type,
            ranked_pairs=True,
        )
        for relation_type in relation_types
    }
    ranked_sources = {
        relation_type: sources
        for relation_type, sources in ranked_sources.items()
        if sources
    }
    exposed_depths = {relation_type: 1 for relation_type in ranked_sources}
    candidate_pool = []
    for relation_type in ranked_sources:
        candidate_pool.extend(
            _candidates_for_source(
                relation_type,
                0,
                ranked_sources,
                materials,
                els,
                families,
                core_edges,
                vecs,
                comp_dims,
                family,
                family_targets,
                1,
            )
        )
    candidate_pool = list(
        {candidate["candidate_id"]: candidate for candidate in candidate_pool}.values()
    )
    initial_candidate_ids = {candidate["candidate_id"] for candidate in candidate_pool}
    candidate_pool_growth = [
        {"round_available": 1, "candidate_pool_count": len(candidate_pool)}
    ]

    history = []
    consecutive_no_new = 0
    stop_reason = None
    accepted_ids = []
    for round_number in range(1, max_rounds + 1):
        proposed, ranking_decision = propose_next_round(
            candidate_pool,
            history,
            batch_size=batch_size,
            llm_client=llm_client,
            context={
                "run_name": run_name,
                "structure_family": family,
                "round": round_number,
                "observed_candidate_count": len(_observed_candidate_ids(history)),
                "candidate_pool_count": len(candidate_pool),
            },
            return_metadata=True,
        )
        scored = []
        new_non_degenerate = 0
        for candidate in proposed:
            item = dict(candidate)
            details = _score_details(item, vecs, comp_dims)
            item.update(details)
            item["decision_mode"] = ranking_decision["mode"]
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
                "ranking_decision": ranking_decision,
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
        expansion = _llm_expansion_decision(
            history, ranked_sources, exposed_depths, llm_client
        )
        if stop_reason:
            expansion["applied"] = False
            expansion["not_applied_reason"] = stop_reason
            history[-1]["expansion_decision"] = expansion
            break

        new_candidates = []
        for relation_type in expansion["relation_types"]:
            source_rank = exposed_depths[relation_type]
            new_candidates.extend(
                _candidates_for_source(
                    relation_type,
                    source_rank,
                    ranked_sources,
                    materials,
                    els,
                    families,
                    core_edges,
                    vecs,
                    comp_dims,
                    family,
                    family_targets,
                    round_number + 1,
                )
            )
            exposed_depths[relation_type] += 1
            expansion["rank_within_relation_type"] = source_rank + 1
        existing_ids = {candidate["candidate_id"] for candidate in candidate_pool}
        new_candidates = [
            candidate
            for candidate in new_candidates
            if candidate["candidate_id"] not in existing_ids
        ]
        candidate_pool.extend(new_candidates)
        expansion["new_candidate_ids"] = [
            candidate["candidate_id"] for candidate in new_candidates
        ]
        expansion["new_candidate_count"] = len(new_candidates)
        expansion["candidate_pool_count_after_expansion"] = len(candidate_pool)
        expansion["applied"] = True
        history[-1]["expansion_decision"] = expansion
        candidate_pool_growth.append(
            {
                "round_available": round_number + 1,
                "candidate_pool_count": len(candidate_pool),
            }
        )

    report = {
        "run_name": run_name,
        "structure_family": family,
        "method": "llm_guided_iterative_candidate_expansion_and_pruning",
        "llm_integration_mode": (
            "real_llm_api_with_audited_fallback"
            if any(
                call["real_llm_api_called"]
                for call in llm_client.calls[first_llm_call_index:]
            )
            else "heuristic_fallback_llm_unreachable"
        ),
        "real_llm_api_called": any(
            call["real_llm_api_called"]
            for call in llm_client.calls[first_llm_call_index:]
        ),
        "llm_call_count": len(llm_client.calls[first_llm_call_index:]),
        "llm_call_ids": [
            call["call_id"] for call in llm_client.calls[first_llm_call_index:]
        ],
        "llm_provider_availability": llm_client.provider_availability,
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
        "initial_candidate_pool_count": len(initial_candidate_ids),
        "initial_candidate_ids": sorted(initial_candidate_ids),
        "candidate_pool_count": len(candidate_pool),
        "candidate_pool_growth": candidate_pool_growth,
        "pool_growth_by_round": [
            item["candidate_pool_count"] for item in candidate_pool_growth
        ],
        "expansion_source_by_round": [
            {
                "after_round": item["round"],
                "relation_type": item.get("expansion_decision", {}).get(
                    "relation_types", [None]
                )[0]
                if item.get("expansion_decision", {}).get("relation_types")
                else None,
                "rank_within_relation_type": item.get(
                    "expansion_decision", {}
                ).get("rank_within_relation_type"),
                "new_candidate_count": item.get("expansion_decision", {}).get(
                    "new_candidate_count", 0
                ),
                "applied": item.get("expansion_decision", {}).get("applied", False),
            }
            for item in history
        ],
        "ranked_source_counts": {
            relation_type: len(sources)
            for relation_type, sources in ranked_sources.items()
        },
        "exposed_source_depths": exposed_depths,
        "later_round_novel_vs_round1_count": len(
            {
                candidate["candidate_id"]
                for round_item in history[1:]
                for candidate in round_item["candidates"]
            }
            - initial_candidate_ids
        ),
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
    if any(report["real_llm_api_called"] for report in reports):
        print("LLM 声明：至少一个排序/扩张决策成功使用真实 API；逐次结果见 outputs/llm_calls。")
    else:
        print("诚信声明：STEP/Gemini 均未成功调用，本轮使用显式启发式兜底；逐次原因已审计。")
    print("证据声明：核心 DOI 边用于搜索证据；MatKG 仅作弱向量空间背景。")
    return reports


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    run_all()
