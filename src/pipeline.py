"""
总控：L2(结构) → L3(运算规则) → L4(应用) 一次跑完，输出雏形演示报告。
用法: python3 pipeline.py
"""
import json
import random
import statistics
import sys
from collections import Counter
from itertools import combinations
from pathlib import Path

from graph import build_graph, load_core_edges, vectorize
from rules import cosine, edge_vector, is_degenerate, relation_type_pairs
from application import find_analogy_source, propose_candidate

OUT_DIR = Path(__file__).resolve().parents[1] / "outputs"
DISPLAY_FAMILIES = ("122", "1111", "11", "214", "diboride", "other")


def _family_bucket(structure_family):
    return structure_family if structure_family in DISPLAY_FAMILIES[:-1] else "other"


def _filled_counts(counter, labels):
    return {label: counter.get(label, 0) for label in labels}


def _random_cosine_baseline(core_edges, vecs, comp_dims, sample_size, seed=20260811):
    """Build a reproducible random cross-relation baseline from real core edges."""

    pairs = list(dict.fromkeys((edge["材料A"], edge["材料B"]) for edge in core_edges))
    eligible = []
    for pair1, pair2 in combinations(pairs, 2):
        if any(name not in vecs for name in pair1 + pair2):
            continue
        vector1 = edge_vector(vecs, *pair1)
        vector2 = edge_vector(vecs, *pair2)
        if is_degenerate(vector1, vector2, comp_dims):
            continue
        eligible.append(cosine(vector1, vector2))

    rng = random.Random(seed)
    selected = rng.sample(eligible, min(sample_size, len(eligible)))
    return {
        "method": "uniform sample of non-degenerate pairings across unique DOI-backed core edge vectors",
        "seed": seed,
        "eligible_pairings": len(eligible),
        "sample_size": len(selected),
        "cosines": [round(value, 6) for value in selected],
        "mean": round(statistics.fmean(selected), 6) if selected else None,
        "population_std": round(statistics.pstdev(selected), 6) if selected else None,
        "evidence_source": "core_only",
        "matkg_excluded": True,
    }


def run():
    materials, vector_edges = build_graph(include_extended=True)
    core_edges = load_core_edges()
    core_material_order = list(dict.fromkeys(
        material
        for edge in core_edges
        for material in (edge["材料A"], edge["材料B"])
    ))
    core_material_names = set(core_material_order)
    vecs, els, families = vectorize(materials)
    comp_dims = len(els)

    # L3 strong evidence is deliberately computed from the DOI-backed core
    # only.  MatKG expands the vector space but is not citable row-level proof.
    parallelism = relation_type_pairs(core_edges, materials, vecs, comp_dims)
    non_degenerate = [r for r in parallelism if not r["degenerate"]]
    sorted_non_degenerate = sorted(
        non_degenerate, key=lambda item: -abs(item["cosine"])
    )

    core_relation_counts = Counter(edge["关系类型"] for edge in core_edges)
    extended_edges = [edge for edge in vector_edges if edge["_source"] == "matkg"]
    extended_relation_counts = Counter(edge["关系类型"] for edge in extended_edges)
    core_node_counts = Counter(
        _family_bucket(materials[name]["structure_family"])
        for name in core_material_names
    )
    extended_names = set(materials).difference(core_material_names)
    extended_node_counts = Counter(
        _family_bucket(materials[name]["structure_family"])
        for name in extended_names
    )
    core_edge_family_counts = Counter(
        _family_bucket(materials[edge["材料A"]]["structure_family"])
        for edge in core_edges
    )
    extended_edge_family_counts = Counter(
        _family_bucket(materials[edge["材料A"]]["structure_family"])
        for edge in extended_edges
    )

    candidates = []
    for rtype in sorted({e["关系类型"] for e in core_edges}):
        source = find_analogy_source(core_edges, materials, vecs, comp_dims, rtype)
        if not source:
            continue
        a1, b1 = source["pair1"]
        used = set(source["pair1"]) | set(source["pair2"])
        targets = [
            m for m in core_material_order
            if m not in used and materials[m]["structure_family"] == materials[a1]["structure_family"]
        ]
        if not targets:
            continue
        candidate = propose_candidate(vecs, materials, (a1, b1), targets[0], els, families)
        candidate["relation_type"] = rtype
        candidate["source_cosine"] = round(source["cosine"], 4)
        candidates.append(candidate)

    report = {
        "L1_sources": {
            "unique_doi_backed_literature_count": len(
                {
                    edge["文献DOI"].strip()
                    for edge in core_edges
                    if edge.get("文献DOI", "").strip()
                }
            ),
            "core_source": "manual_verification",
            "extended_source": "MatKG_aggregate_without_row_level_doi",
        },
        "L2_structure": {
            "materials_count": len(materials),
            "edges_count": len(vector_edges),
            "core_materials_count": len(core_material_names),
            "core_edges_count": len(core_edges),
            "extended_nodes_count": len(materials) - len(core_material_names),
            "extended_edges_count": len(vector_edges) - len(core_edges),
            "composition_dims": comp_dims,
            "structure_families": families,
            "vector_space_sources": ["core", "matkg"] if len(vector_edges) > len(core_edges) else ["core"],
            "core_relation_counts": _filled_counts(
                core_relation_counts, [f"R{i}" for i in range(1, 10)]
            ),
            "matkg_relation_counts": _filled_counts(
                extended_relation_counts,
                [
                    "MKG-DOPING",
                    "MKG-SUBSTITUTION",
                    "MKG-SYNTHESIS",
                    "MKG-STRUCTURE",
                ],
            ),
            "family_coverage": {
                "families": list(DISPLAY_FAMILIES),
                "node_assignment": "node structure_family; heterogeneous MatKG entity:* nodes collapse to other",
                "edge_assignment": "source endpoint structure_family to avoid double counting",
                "core_nodes": _filled_counts(core_node_counts, DISPLAY_FAMILIES),
                "matkg_extended_nodes": _filled_counts(
                    extended_node_counts, DISPLAY_FAMILIES
                ),
                "core_edges": _filled_counts(core_edge_family_counts, DISPLAY_FAMILIES),
                "matkg_extended_edges": _filled_counts(
                    extended_edge_family_counts, DISPLAY_FAMILIES
                ),
            },
        },
        "L3_rules": {
            "evidence_source": "core_only",
            "total_pairwise_comparisons": len(parallelism),
            "non_degenerate_evidence": len(non_degenerate),
            "top_parallel_evidence": sorted_non_degenerate[:5],
            "non_degenerate_evidence_records": sorted_non_degenerate,
            "random_baseline": _random_cosine_baseline(
                core_edges,
                vecs,
                comp_dims,
                sample_size=len(non_degenerate),
            ),
        },
        "L4_application": {
            "source_edges": "core_only",
            "target_nodes": "core_only",
            "candidates_generated": len(candidates),
            "candidates": candidates,
        },
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with (OUT_DIR / "pipeline_report.json").open("w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"向量空间点: {report['L2_structure']['materials_count']} (核心材料 {report['L2_structure']['core_materials_count']})")
    print(f"向量空间边: {report['L2_structure']['edges_count']} (核心 {report['L2_structure']['core_edges_count']}, MatKG 扩展 {report['L2_structure']['extended_edges_count']})")
    print(f"非退化真实平行性证据: {report['L3_rules']['non_degenerate_evidence']} 组")
    print(f"L4 生成候选假设: {report['L4_application']['candidates_generated']} 个")
    print(f"\n完整报告已写入: {OUT_DIR / 'pipeline_report.json'}")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    run()
