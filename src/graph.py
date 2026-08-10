"""
L2 基本结构：点(材料) + 边(文献关系) + 向量化
点 = 材料，向量 = 成分比例(元素维度) + 结构家族one-hot
边 = 文献报道的关系类型(R1-R9)，边向量 = vec(B) - vec(A)

数据来源：4080机器 proj_3bf4d7811a98 关系图抽取工作的真实产出
(36条边/36材料/20文献全核验，2026-08-09晚)
"""
import csv
import re
from collections import defaultdict

DATA_DIR = __file__.rsplit("/", 2)[0] + "/data"

# 结构家族识别规则：按化学计量比模式分类（超导材料学界公认的家族命名）
STRUCTURE_FAMILIES = [
    ("122", re.compile(r"^[A-Z][a-z]?(Fe|Ni)2(As|P)2")),      # BaFe2As2 型
    ("1111", re.compile(r"^[A-Z][a-z]?Fe(As|P)O")),             # LaFeAsO 型
    ("11", re.compile(r"^Fe(Se|Te)")),                          # FeSe 型
    ("214", re.compile(r"La3?Ni2O7|La2CuO4")),                  # 层状镍/铜氧化物
    ("diboride", re.compile(r"^MgB2|^[A-Z][a-z]?B2")),          # MgB2 型
]


def structure_family(formula: str) -> str:
    for name, pat in STRUCTURE_FAMILIES:
        if pat.match(formula.strip()):
            return name
    return "other"


def parse_composition(formula: str) -> dict:
    """把化学式解析成 {元素: 化学计量比} 字典。
    只处理基本整数/小数下标，掺杂符号(1-x/x)按占位小数近似(x=0.5)处理——
    这是雏形阶段的简化，精修留给复赛。
    """
    f = formula.strip()
    f = f.replace("−", "-")
    # 去掉掺杂下标里的 x（如 LaFeAsO1-xFx → 用 0.5 近似掺杂比例）
    f = re.sub(r"1-x", "0.5", f)
    f = re.sub(r"(?<![0-9.])x(?![a-zA-Z])", "0.5", f)
    f = f.replace("_mono", "").replace("-STO", "").replace("-BTO", "").replace("_P", "")

    tokens = re.findall(r"([A-Z][a-z]?)(\d*\.?\d*)", f)
    comp = defaultdict(float)
    for el, num in tokens:
        if not el:
            continue
        n = float(num) if num else 1.0
        comp[el] += n
    total = sum(comp.values()) or 1.0
    return {el: n / total for el, n in comp.items()}


def load_edges():
    edges = []
    with open(f"{DATA_DIR}/relations_table.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            edges.append(row)
    return edges


def build_graph():
    edges = load_edges()
    materials = {}
    for e in edges:
        for m in (e["材料A"], e["材料B"]):
            if m not in materials:
                materials[m] = {
                    "formula": m,
                    "composition": parse_composition(m),
                    "structure_family": structure_family(m),
                }
    return materials, edges


def all_elements(materials: dict) -> list:
    els = set()
    for m in materials.values():
        els.update(m["composition"].keys())
    return sorted(els)


def vectorize(materials: dict):
    """点(材料) → 向量。34维成分(按数据集里出现的元素定维度) + 结构家族one-hot + 预留1维性质位(本轮未接入Tc, 置0)"""
    els = all_elements(materials)
    families = sorted({m["structure_family"] for m in materials.values()})
    vecs = {}
    for name, m in materials.items():
        comp_vec = [m["composition"].get(el, 0.0) for el in els]
        fam_vec = [1.0 if fam == m["structure_family"] else 0.0 for fam in families]
        vecs[name] = comp_vec + fam_vec + [0.0]  # 最后1维留给Tc，本轮数据缺失，置0
    return vecs, els, families


if __name__ == "__main__":
    materials, edges = build_graph()
    vecs, els, families = vectorize(materials)
    print(f"点(材料): {len(materials)} 个")
    print(f"边(关系记录): {len(edges)} 条")
    print(f"成分维度: {len(els)} (元素: {', '.join(els)})")
    print(f"结构家族: {families}")
    print(f"向量总维度: {len(next(iter(vecs.values())))}")
