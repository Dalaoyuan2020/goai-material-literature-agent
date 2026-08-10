"""
总控：L2(结构) → L3(运算规则) → L4(应用) 一次跑完，输出雏形演示报告。
用法: python3 pipeline.py
"""
import json
from graph import build_graph, vectorize
from rules import relation_type_pairs
from application import find_analogy_source, propose_candidate

OUT_DIR = __file__.rsplit("/", 2)[0] + "/outputs"


def run():
    materials, edges = build_graph()
    vecs, els, families = vectorize(materials)
    comp_dims = len(els)

    parallelism = relation_type_pairs(edges, materials, vecs, comp_dims)
    non_degenerate = [r for r in parallelism if not r["degenerate"]]

    candidates = []
    for rtype in {e["关系类型"] for e in edges}:
        source = find_analogy_source(edges, materials, vecs, comp_dims, rtype)
        if not source:
            continue
        a1, b1 = source["pair1"]
        used = set(source["pair1"]) | set(source["pair2"])
        targets = [
            m for m in materials
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
            "edges_count": len(edges),
            "composition_dims": comp_dims,
            "structure_families": families,
        },
        "L3_rules": {
            "total_pairwise_comparisons": len(parallelism),
            "non_degenerate_evidence": len(non_degenerate),
            "top_parallel_evidence": sorted(non_degenerate, key=lambda x: -abs(x["cosine"]))[:5],
        },
        "L4_application": {
            "candidates_generated": len(candidates),
            "candidates": candidates,
        },
    }

    with open(f"{OUT_DIR}/pipeline_report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"点(材料): {report['L2_structure']['materials_count']}")
    print(f"边(关系记录): {report['L2_structure']['edges_count']}")
    print(f"非退化真实平行性证据: {report['L3_rules']['non_degenerate_evidence']} 组")
    print(f"L4 生成候选假设: {report['L4_application']['candidates_generated']} 个")
    print(f"\n完整报告已写入: outputs/pipeline_report.json")


if __name__ == "__main__":
    run()
