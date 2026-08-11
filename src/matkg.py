"""Stream a conservative superconductivity subset out of MatKG.

MatKG's ``SUBRELOBJ.csv`` is an aggregate co-occurrence table with the real
columns ``Subject,Object,Rel,Count``.  ``Rel`` is a pair of NER entity tags,
not a causal relation label, and the aggregation does not retain row-level
DOIs.  This module therefore keeps the selected rows in a separate weak-
evidence file and never invents an R1-R9 mapping.
"""

import argparse
import csv
import json
import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CORE_PATH = REPO_ROOT / "knowledge" / "edges.csv"
DEFAULT_OUTPUT_PATH = REPO_ROOT / "knowledge" / "edges_matkg.csv"
DEFAULT_REPORT_PATH = REPO_ROOT / "outputs" / "matkg_import_report.json"

EXPECTED_COLUMNS = ("Subject", "Object", "Rel", "Count")
OUTPUT_FIELDS = (
    "实体A",
    "实体B",
    "扩展关系类型",
    "扩展关系类型定义",
    "MatKG关系标签",
    "共现文献数",
    "材料匹配依据",
    "关系筛选依据",
    "来源数据集",
    "文献DOI",
    "证据等级",
    "强证据资格",
)

SOURCE_LABEL = "MatKG SUBRELOBJ.csv (Venugopal & Olivetti 2024)"


def normalize_entity(value: str) -> str:
    value = value.casefold().replace("−", "-")
    return re.sub(r"[^a-z0-9]+", "", value)


FAMILY_PATTERNS = (
    ("Fe-based", re.compile(r"\bfe[- ]?based\b|\biron[- ]?(?:based|pnictide|arsenide)s?\b", re.I)),
    ("cuprate", re.compile(r"\bcuprates?\b", re.I)),
    ("pnictide", re.compile(r"\bpnictides?\b", re.I)),
    ("122", re.compile(r"\b122\b|\b(?:ba|sr|ca|eu|k)fe2(?:as|p)2", re.I)),
    ("1111", re.compile(r"\b1111\b|\b(?:la|sm|gd|nd|pr|ce)fe(?:as|p)o", re.I)),
    ("214", re.compile(r"\b214\b|\bla2cuo4\b", re.I)),
    ("MgB2", re.compile(r"\bmgb2\b", re.I)),
    ("FeSe", re.compile(r"\bfese(?=$|[0-9_.()\-])", re.I)),
    ("FeTe", re.compile(r"\bfete(?=$|[0-9_.()\-])", re.I)),
    ("nickelate", re.compile(r"\bnickelates?\b|\bla3ni2o7\b|\bndnio2\b", re.I)),
    ("cuprate-formula", re.compile(r"\byba2cu3o7\b", re.I)),
)

SCOPE_PATTERNS = {
    "DOPING": re.compile(r"\bdop(?:e|ed|ing|ant|ants)\b|\bintercalat", re.I),
    "SUBSTITUTION": re.compile(r"substitut|isoelectronic|\breplac(?:e|ed|ement|ing)\b", re.I),
    "SYNTHESIS": re.compile(
        r"synthes|\bgrow(?:n|th|ing)?\b|anneal|calcina|sinter|solid[- ]state|"
        r"hydrothermal|sol[- ]gel|chemical vapor deposition|pulsed laser deposition|"
        r"flux growth|epitax",
        re.I,
    ),
    "STRUCTURE": re.compile(
        r"structur|crystal|lattice|symmetr|\bphase\b|tetragonal|orthorhombic|"
        r"hexagonal|monoclinic|rhombohedral|space group|\b122\b|\b1111\b|"
        r"\b214\b|infinite[- ]layer",
        re.I,
    ),
}

SCOPE_DEFINITIONS = {
    "DOPING": "MatKG 聚合共现中的掺杂相关弱关系；位点未知，不映射为 R1-R5",
    "SUBSTITUTION": "MatKG 聚合共现中的取代相关弱关系；位点未知，不映射为 R1-R5",
    "SYNTHESIS": "MatKG 聚合共现中的合成/生长相关弱关系；不属于核心 R1-R9 强证据",
    "STRUCTURE": "MatKG 聚合共现中的结构/相标签相关弱关系；不等同于已核验的 R9",
}


def load_core_materials(path: Path) -> dict[str, str]:
    normalized = {}
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"材料A", "材料B"}
        missing = required.difference(reader.fieldnames or ())
        if missing:
            raise ValueError(f"核心集缺少列: {sorted(missing)}")
        for row in reader:
            for column in ("材料A", "材料B"):
                value = row[column].strip()
                if value:
                    normalized[normalize_entity(value)] = value
    return normalized


def material_match(value: str, core_materials: dict[str, str]) -> str | None:
    normalized = normalize_entity(value)
    if normalized in core_materials:
        return f"core:{core_materials[normalized]}"
    for label, pattern in FAMILY_PATTERNS:
        if pattern.search(value):
            return f"family:{label}"
    return None


def classify_relation(subject: str, object_: str, rel: str) -> tuple[str, str] | None:
    text = f"{subject} {object_}"
    tags = {part.upper() for part in rel.split("-")}
    reasons: list[str] = []
    matched_scopes: list[str] = []

    for scope, pattern in SCOPE_PATTERNS.items():
        if pattern.search(text):
            matched_scopes.append(scope)
            reasons.append(f"keyword:{scope.lower()}")

    if "SMT" in tags and "SYNTHESIS" not in matched_scopes:
        matched_scopes.append("SYNTHESIS")
        reasons.append("tag:SMT")
    elif "SMT" in tags:
        reasons.append("tag:SMT")

    if "SPL" in tags and "STRUCTURE" not in matched_scopes:
        matched_scopes.append("STRUCTURE")
        reasons.append("tag:SPL")
    elif "SPL" in tags:
        reasons.append("tag:SPL")

    if not matched_scopes:
        return None

    # Prefer explicit transformation words over broad entity-class tags.
    priority = ("DOPING", "SUBSTITUTION", "SYNTHESIS", "STRUCTURE")
    primary = next(scope for scope in priority if scope in matched_scopes)
    return primary, ";".join(reasons)


def convert_matkg(input_path: Path, core_path: Path, output_path: Path) -> dict:
    core_materials = load_core_materials(core_path)
    stats = {
        "input_path": str(input_path),
        "input_size_bytes": input_path.stat().st_size,
        "output_path": str(output_path),
        "source": SOURCE_LABEL,
        "raw_rows_processed": 0,
        "material_layer_matches": 0,
        "relation_layer_matches": 0,
        "malformed_rows_skipped": 0,
        "selected_rows": 0,
        "selected_by_scope": {scope: 0 for scope in SCOPE_PATTERNS},
        "row_level_doi_available": False,
        "strong_evidence_eligible_rows": 0,
    }
    selected_nodes: set[str] = set()
    matched_material_entities: set[str] = set()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with input_path.open(encoding="utf-8", newline="") as source, output_path.open(
        "w", encoding="utf-8", newline=""
    ) as destination:
        reader = csv.DictReader(source)
        actual_columns = tuple(reader.fieldnames or ())
        missing = set(EXPECTED_COLUMNS).difference(actual_columns)
        if missing:
            raise ValueError(
                f"无法识别 MatKG 格式；实际列={actual_columns!r}，缺少={sorted(missing)!r}"
            )

        writer = csv.DictWriter(destination, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()

        for row in reader:
            stats["raw_rows_processed"] += 1
            if None in row or any(row.get(column) is None for column in EXPECTED_COLUMNS):
                stats["malformed_rows_skipped"] += 1
                continue
            subject = row["Subject"].strip()
            object_ = row["Object"].strip()
            rel = row["Rel"].strip()

            subject_match = material_match(subject, core_materials)
            object_match = material_match(object_, core_materials)
            if not subject_match and not object_match:
                continue
            stats["material_layer_matches"] += 1

            relation = classify_relation(subject, object_, rel)
            if relation is None:
                continue
            stats["relation_layer_matches"] += 1
            scope, relation_reason = relation

            material_reasons = []
            if subject_match:
                material_reasons.append(f"A:{subject_match}")
                matched_material_entities.add(subject)
            if object_match:
                material_reasons.append(f"B:{object_match}")
                matched_material_entities.add(object_)

            writer.writerow(
                {
                    "实体A": subject,
                    "实体B": object_,
                    "扩展关系类型": f"MKG-{scope}",
                    "扩展关系类型定义": SCOPE_DEFINITIONS[scope],
                    "MatKG关系标签": rel,
                    "共现文献数": row["Count"].strip(),
                    "材料匹配依据": ";".join(material_reasons),
                    "关系筛选依据": relation_reason,
                    "来源数据集": SOURCE_LABEL,
                    "文献DOI": "",
                    "证据等级": "matkg_aggregate_weak",
                    "强证据资格": "false",
                }
            )
            stats["selected_rows"] += 1
            stats["selected_by_scope"][scope] += 1
            selected_nodes.update((subject, object_))

    stats["selected_unique_nodes"] = len(selected_nodes)
    stats["matched_material_entities"] = len(matched_material_entities)
    return stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="MatKG SUBRELOBJ.csv")
    parser.add_argument("--core", type=Path, default=DEFAULT_CORE_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT_PATH)
    return parser.parse_args()


def main() -> None:
    import sys

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = parse_args()
    stats = convert_matkg(args.input, args.core, args.output)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    with args.report.open("w", encoding="utf-8") as handle:
        json.dump(stats, handle, ensure_ascii=False, indent=2)
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
