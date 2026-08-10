"""
总控：L2(结构) → L3(运算规则) → L4(应用) 一次跑完，输出雏形演示报告。
用法: python3 pipeline.py
"""
import json
import sys
from pathlib import Path

from graph import build_graph, load_core_edges, vectorize
from rules import relation_type_pairs
from application import find_analogy_source, propose_candidate

OUT_DIR = Path(__file__).resolve().parents[1] / "outputs"


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
        },
        "L3_rules": {
            "evidence_source": "core_only",
            "total_pairwise_comparisons": len(parallelism),
            "non_degenerate_evidence": len(non_degenerate),
            "top_parallel_evidence": sorted(non_degenerate, key=lambda x: -abs(x["cosine"]))[:5],
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
