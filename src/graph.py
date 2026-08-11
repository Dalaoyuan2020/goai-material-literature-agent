"""
L2 基本结构：点(材料) + 边(文献关系) + 向量化
点 = 材料，向量 = 成分比例(元素维度) + 结构家族one-hot
边 = 文献报道的关系类型(R1-R9)，边向量 = vec(B) - vec(A)

数据来源：4080机器 proj_3bf4d7811a98 关系图抽取工作的真实产出
(36条边/36材料/20文献全核验，2026-08-09晚)
"""
import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "knowledge"
CORE_EDGES_PATH = DATA_DIR / "edges.csv"
EXTENDED_EDGES_PATH = DATA_DIR / "edges_matkg.csv"

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


def load_core_edges(path: Path = CORE_EDGES_PATH):
    edges = []
    with path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            row["_source"] = "core"
            row["_subject_type"] = "CHM"
            row["_object_type"] = "CHM"
            edges.append(row)
    return edges


def load_extended_edges(path: Path = EXTENDED_EDGES_PATH):
    if not path.exists():
        return []

    edges = []
    with path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        required = {"实体A", "实体B", "扩展关系类型", "MatKG关系标签"}
        missing = required.difference(reader.fieldnames or ())
        if missing:
            raise ValueError(f"MatKG 扩展集缺少列: {sorted(missing)}")
        for row in reader:
            tags = row["MatKG关系标签"].split("-")
            edges.append({
                **row,
                "材料A": row["实体A"],
                "材料B": row["实体B"],
                "关系类型": row["扩展关系类型"],
                "关系类型定义": row.get("扩展关系类型定义", ""),
                "_source": "matkg",
                "_subject_type": tags[0] if tags else "UNKNOWN",
                "_object_type": tags[-1] if tags else "UNKNOWN",
            })
    return edges


def load_edges(
    include_extended: bool = False,
    core_path: Path = CORE_EDGES_PATH,
    extended_path: Path = EXTENDED_EDGES_PATH,
):
    edges = load_core_edges(core_path)
    if include_extended:
        edges.extend(load_extended_edges(extended_path))
    return edges


def build_graph(
    include_extended: bool = False,
    core_path: Path = CORE_EDGES_PATH,
    extended_path: Path = EXTENDED_EDGES_PATH,
):
    """Build the graph used for vectorization.

    The safe default is core-only.  Callers may opt into MatKG's weak,
    heterogeneous extension for vector-space coverage, but evidence code must
    continue to receive ``load_core_edges()`` explicitly.
    """
    edges = load_edges(
        include_extended=include_extended,
        core_path=core_path,
        extended_path=extended_path,
    )
    materials = {}
    for e in edges:
        endpoints = (
            (e["材料A"], e.get("_subject_type", "CHM")),
            (e["材料B"], e.get("_object_type", "CHM")),
        )
        for m, node_type in endpoints:
            if m not in materials:
                is_material = node_type == "CHM"
                materials[m] = {
                    "formula": m,
                    "composition": parse_composition(m) if is_material else {},
                    "structure_family": structure_family(m) if is_material else f"entity:{node_type.lower()}",
                    "node_type": node_type,
                    "is_core_material": e["_source"] == "core",
                }
            elif e["_source"] == "core":
                # Core rows are authoritative when a label also appears in MatKG.
                materials[m].update({
                    "composition": parse_composition(m),
                    "structure_family": structure_family(m),
                    "node_type": "CHM",
                    "is_core_material": True,
                })
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
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    materials, edges = build_graph()
    vecs, els, families = vectorize(materials)
    print(f"点(材料): {len(materials)} 个")
    print(f"边(关系记录): {len(edges)} 条")
    print(f"成分维度: {len(els)} (元素: {', '.join(els)})")
    print(f"结构家族: {families}")
    print(f"向量总维度: {len(next(iter(vecs.values())))}")
