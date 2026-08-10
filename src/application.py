"""
L4 应用层：类比迁移 / 镜像点推断（今晚唯一完全空白、也最具创新性的一层）

思路：已知 A→B 是某种关系变换(如"Ba母体掺Co")，且这条边在同类关系里能找到
"非退化的平行伙伴"(如"Sr母体掺Co")，说明这种变换模式在不同母体上稳定。
那么对一个全新的母体 D(还没人做过这个变换的)，可以把同一个关系向量"搬"过去，
预测 D 做同样变换后的产物 D' 大致长什么样(在成分/结构空间里)。

这一步产出的是"候选假设"，不是"结论"——候选必须再过官方要求的：
  ① 与真实数据库(Materials Project/OQMD/NOMAD)交叉验证
  ② 标注为可证伪的假设，不包装成结论
"""
from graph import build_graph, vectorize, parse_composition, structure_family, all_elements
from rules import edge_vector, cosine, is_degenerate


def find_analogy_source(edges, materials, vecs, comp_dims, relation_type: str):
    """在同类关系里找一组非退化、高平行性的"源变换"，作为迁移的模板"""
    pairs = []
    for e in edges:
        if e["关系类型"] == relation_type:
            pairs.append((e["材料A"], e["材料B"]))
    pairs = list(dict.fromkeys(pairs))

    best = None
    for i in range(len(pairs)):
        for j in range(i + 1, len(pairs)):
            a1, b1 = pairs[i]
            a2, b2 = pairs[j]
            if a1 not in vecs or b1 not in vecs or a2 not in vecs or b2 not in vecs:
                continue
            v1 = edge_vector(vecs, a1, b1)
            v2 = edge_vector(vecs, a2, b2)
            if is_degenerate(v1, v2, comp_dims):
                continue
            cos = cosine(v1, v2)
            if best is None or abs(cos) > abs(best["cosine"]):
                best = {"pair1": (a1, b1), "pair2": (a2, b2), "cosine": cos, "v1": v1, "v2": v2}
    return best


def propose_candidate(vecs, materials, source_pair, target_material: str, els, families):
    """把源变换的边向量，搬到一个新的目标母体上，生成候选产物的向量描述(不生成具体化学式，
    这一步在雏形阶段只做向量层面的预测，具体化学式生成留给复赛接入生成模型)"""
    a, b = source_pair
    v_transform = edge_vector(vecs, a, b)

    if target_material not in vecs:
        return None
    v_target = vecs[target_material]
    v_predicted = [x + y for x, y in zip(v_target, v_transform)]

    n = len(els)
    comp_change = {el: round(v_predicted[i] - v_target[i], 4)
                   for i, el in enumerate(els) if abs(v_predicted[i] - v_target[i]) > 1e-4}

    return {
        "source_transform": f"{a} → {b}",
        "target_base": target_material,
        "predicted_composition_delta": comp_change,
        "predicted_structure_family": materials[target_material]["structure_family"],
        "status": "候选假设(未验证)",
        "next_step_required": "与 Materials Project / OQMD / NOMAD 交叉验证是否已被报道；若未报道，标记为待实验验证的 Research Gap",
    }


def demo_run():
    materials, edges = build_graph()
    vecs, els, families = vectorize(materials)
    comp_dims = len(els)

    print("=" * 60)
    print("L4 应用层演示：类比迁移生成候选假设")
    print("=" * 60)

    source = find_analogy_source(edges, materials, vecs, comp_dims, "R2")
    if not source:
        print("未找到 R2 类型的非退化源变换")
        return

    a1, b1 = source["pair1"]
    a2, b2 = source["pair2"]
    print(f"\n① 源变换(平行性最强的非退化真实证据对):")
    print(f"   模板变换: {a1} → {b1}")
    print(f"   平行伙伴: {a2} → {b2}")
    print(f"   余弦相似度: {round(source['cosine'], 4)} (非退化，真实证据)")

    all_mats = list(materials.keys())
    used = {a1, b1, a2, b2}
    targets = [m for m in all_mats if m not in used and materials[m]["structure_family"] == materials[a1]["structure_family"]]

    if not targets:
        print("\n未找到同结构家族的未用材料作为迁移目标")
        return

    target = targets[0]
    print(f"\n② 迁移目标(同结构家族、尚未做过此变换的母体): {target}")

    candidate = propose_candidate(vecs, materials, (a1, b1), target, els, families)
    print(f"\n③ 生成的候选假设:")
    for k, v in candidate.items():
        print(f"   {k}: {v}")

    print("\n" + "=" * 60)
    print("诚实声明：这是向量层面的候选生成演示，不是最终结论。")
    print("按官方红线②③，此候选必须标注为「假设」，且下一步必须做数据库交叉验证。")
    print("=" * 60)


if __name__ == "__main__":
    demo_run()
