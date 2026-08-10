"""
L3 运算规则：边向量 = vec(B) - vec(A)；平行性 = 两条边向量的余弦相似度
这是"发现"的数学核心——同类关系变换在不同材料对上，边向量应该近似平行。

已知边界(2026-08-09晚真实测出，不是假设)：
- 纯成分向量能判断"是否存在类似效应"，判断不了"效应方向"
  (Co/Mn掺杂反例：cos=0.99 但物理效果相反，一个超导一个不超导)
- 编码退化：如果两条边的化学计量比增量完全相同，cos≈1 是构造保证的，不是实测证据
"""
import math
from graph import build_graph, vectorize


def edge_vector(vecs: dict, a: str, b: str):
    va, vb = vecs[a], vecs[b]
    return [y - x for x, y in zip(va, vb)]


def cosine(v1, v2) -> float:
    dot = sum(x * y for x, y in zip(v1, v2))
    n1 = math.sqrt(sum(x * x for x in v1))
    n2 = math.sqrt(sum(x * x for x in v2))
    if n1 == 0 or n2 == 0:
        return 0.0
    return dot / (n1 * n2)


def is_degenerate(v1, v2, comp_dims: int) -> bool:
    """检测编码退化：如果两条边在成分维度上完全相同(只在预留性质位有差异)，
    平行性是构造保证的，不算真实证据。这是2026-08-09晚吃过的教训，写死进规则。"""
    comp1, comp2 = v1[:comp_dims], v2[:comp_dims]
    diff = sum(abs(x - y) for x, y in zip(comp1, comp2))
    return diff < 1e-6


def relation_type_pairs(edges, materials, vecs, comp_dims):
    """按关系类型(R1-R9)分组，组内两两算边向量+平行性，标注退化情况"""
    groups = {}
    for e in edges:
        rtype = e["关系类型"]
        groups.setdefault(rtype, []).append((e["材料A"], e["材料B"]))

    results = []
    for rtype, pairs in groups.items():
        pairs = list(dict.fromkeys(pairs))  # 去重
        if len(pairs) < 2:
            continue
        for i in range(len(pairs)):
            for j in range(i + 1, len(pairs)):
                a1, b1 = pairs[i]
                a2, b2 = pairs[j]
                if a1 not in vecs or b1 not in vecs or a2 not in vecs or b2 not in vecs:
                    continue
                v1 = edge_vector(vecs, a1, b1)
                v2 = edge_vector(vecs, a2, b2)
                cos = cosine(v1, v2)
                degenerate = is_degenerate(v1, v2, comp_dims)
                results.append({
                    "relation_type": rtype,
                    "pair1": f"{a1}→{b1}",
                    "pair2": f"{a2}→{b2}",
                    "cosine": round(cos, 4),
                    "degenerate": degenerate,
                })
    return results


if __name__ == "__main__":
    materials, edges = build_graph()
    vecs, els, families = vectorize(materials)
    comp_dims = len(els)

    results = relation_type_pairs(edges, materials, vecs, comp_dims)
    print(f"共 {len(results)} 组同类关系向量对比\n")

    non_degenerate = [r for r in results if not r["degenerate"]]
    print(f"非退化(真实证据): {len(non_degenerate)} 组")
    for r in sorted(non_degenerate, key=lambda x: -abs(x["cosine"]))[:10]:
        print(f"  [{r['relation_type']}] {r['pair1']}  vs  {r['pair2']}  cos={r['cosine']}")

    degenerate = [r for r in results if r["degenerate"]]
    print(f"\n退化(不计入证据,编码保证): {len(degenerate)} 组")
    for r in degenerate[:5]:
        print(f"  [{r['relation_type']}] {r['pair1']}  vs  {r['pair2']}  cos={r['cosine']} (退化)")
