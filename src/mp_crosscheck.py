"""Cross-check L4 candidate compositions against Materials Project.

The L4 pipeline currently emits normalized composition-vector deltas rather
than guaranteed-valid chemical formulae.  This module therefore separates
candidate derivation from the database query and refuses to query vectors
that produce negative stoichiometric amounts.

Authentication follows the current official ``mp-api`` client convention:
the API key is sent only in the ``x-api-key`` request header.  It is never
written to the result file or printed.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from graph import parse_composition


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = REPO_ROOT / "outputs" / "pipeline_report.json"
DEFAULT_OUTPUT = REPO_ROOT / "outputs" / "mp_crosscheck.json"
DEFAULT_KEY_FILE = (
    Path.home()
    / "Documents"
    / "Claude_Mini_agent"
    / "_digital_assets"
    / "api_keys.env"
)
API_ENDPOINT = "https://api.materialsproject.org/materials/summary/"
MATCH_TOLERANCE = 1e-3


def load_api_key(path: Path = DEFAULT_KEY_FILE) -> str:
    """Read MP_API_KEY from the process environment or the private key file."""
    value = os.environ.get("MP_API_KEY", "").strip()
    if value:
        return value
    if not path.exists():
        raise RuntimeError(f"未找到密钥文件: {path}")
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, raw_value = line.split("=", 1)
        if name.strip() == "MP_API_KEY":
            value = raw_value.strip().strip('"').strip("'")
            if value:
                return value
    raise RuntimeError("密钥文件中没有可用的 MP_API_KEY")


def derive_candidate_composition(candidate: dict[str, Any]) -> dict[str, Any]:
    """Apply a normalized L4 delta and report whether it is queryable."""
    target_base = candidate["target_base"]
    source_transform = str(candidate.get("source_transform", ""))
    base = parse_composition(target_base)
    assumptions = []
    if "x" in target_base:
        assumptions.append("沿用graph.py雏形约定，将变量x固定为0.5")
    if "+" in source_transform or "/" in source_transform:
        assumptions.append("复合添加/多相表达式暂按单一归一化元素组成查询")
    delta = {
        str(element): float(amount)
        for element, amount in candidate["predicted_composition_delta"].items()
    }
    combined = dict(base)
    for element, amount in delta.items():
        combined[element] = combined.get(element, 0.0) + amount

    negative = {
        element: round(amount, 6)
        for element, amount in combined.items()
        if amount < -MATCH_TOLERANCE
    }
    if negative:
        return {
            "queryable": False,
            "derivation_assumptions": assumptions,
            "base_normalized_composition": rounded_composition(base),
            "derived_normalized_composition": rounded_composition(combined),
            "reason": "向量差分产生负计量数，不能形成有效化学式",
            "negative_components": negative,
        }

    positive = {
        element: max(0.0, amount)
        for element, amount in combined.items()
        if amount > MATCH_TOLERANCE
    }
    total = sum(positive.values())
    if total <= 0:
        return {
            "queryable": False,
            "derivation_assumptions": assumptions,
            "base_normalized_composition": rounded_composition(base),
            "derived_normalized_composition": {},
            "reason": "向量差分没有产生正的有效组成",
        }

    normalized = {element: amount / total for element, amount in positive.items()}
    return {
        "queryable": True,
        "derivation_assumptions": assumptions,
        "base_normalized_composition": rounded_composition(base),
        "derived_normalized_composition": rounded_composition(normalized),
        "query_formula": composition_label(normalized),
        "query_chemsys": "-".join(sorted(normalized)),
        "match_tolerance": MATCH_TOLERANCE,
    }


def rounded_composition(composition: dict[str, float]) -> dict[str, float]:
    return {
        element: round(amount, 6)
        for element, amount in sorted(composition.items())
        if abs(amount) > 1e-9
    }


def composition_label(composition: dict[str, float]) -> str:
    return "".join(
        f"{element}{amount:.6f}" for element, amount in sorted(composition.items())
    )


def normalize_mp_composition(value: Any) -> dict[str, float] | None:
    if not isinstance(value, dict):
        return None
    parsed: dict[str, float] = {}
    for raw_element, raw_amount in value.items():
        element = str(raw_element)
        try:
            amount = float(raw_amount)
        except (TypeError, ValueError):
            return None
        if amount > 0:
            parsed[element] = amount
    total = sum(parsed.values())
    if total <= 0:
        return None
    return {element: amount / total for element, amount in parsed.items()}


def compositions_match(
    expected: dict[str, float], observed: dict[str, float], tolerance: float
) -> bool:
    if set(expected) != set(observed):
        return False
    return all(
        math.isclose(expected[element], observed[element], abs_tol=tolerance)
        for element in expected
    )


def request_chemsys(
    api_key: str,
    chemsys: str,
    *,
    timeout: float = 30.0,
    retries: int = 3,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    fields = (
        "material_id,formula_pretty,composition,composition_reduced,"
        "chemsys,is_stable,energy_above_hull"
    )
    all_docs: list[dict[str, Any]] = []
    skip = 0
    limit = 1000
    last_meta: dict[str, Any] = {}

    while True:
        query = urllib.parse.urlencode(
            {
                "chemsys": chemsys,
                "_fields": fields,
                "_limit": limit,
                "_skip": skip,
            }
        )
        request = urllib.request.Request(
            f"{API_ENDPOINT}?{query}",
            headers={
                "x-api-key": api_key,
                "Accept": "application/json",
                "User-Agent": "goai-track-a-mp-crosscheck/1.0",
            },
        )
        payload = None
        for attempt in range(retries):
            try:
                with urllib.request.urlopen(request, timeout=timeout) as response:
                    payload = json.load(response)
                break
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")[:500]
                if exc.code in {429, 500, 502, 503, 504} and attempt + 1 < retries:
                    time.sleep(2**attempt)
                    continue
                raise RuntimeError(
                    f"Materials Project HTTP {exc.code}: {detail}"
                ) from exc
            except urllib.error.URLError as exc:
                if attempt + 1 < retries:
                    time.sleep(2**attempt)
                    continue
                raise RuntimeError(f"Materials Project连接失败: {exc.reason}") from exc

        if not isinstance(payload, dict):
            raise RuntimeError("Materials Project返回了非JSON对象响应")
        docs = payload.get("data", [])
        if not isinstance(docs, list):
            raise RuntimeError("Materials Project响应缺少data列表")
        all_docs.extend(doc for doc in docs if isinstance(doc, dict))
        last_meta = payload.get("meta", {}) if isinstance(payload.get("meta"), dict) else {}
        total = int(last_meta.get("total_doc", len(all_docs)))
        if len(all_docs) >= total or not docs:
            break
        skip += len(docs)

    return all_docs, last_meta


def crosscheck_candidate(
    candidate: dict[str, Any], api_key: str, *, timeout: float = 30.0
) -> dict[str, Any]:
    derived = derive_candidate_composition(candidate)
    common = {
        "source_transform": candidate.get("source_transform"),
        "target_base": candidate.get("target_base"),
        "relation_type": candidate.get("relation_type"),
        "source_cosine": candidate.get("source_cosine"),
        "predicted_composition_delta": candidate.get("predicted_composition_delta"),
        **derived,
    }
    if not derived["queryable"]:
        return {
            **common,
            "query_status": "not_queried_invalid_composition",
            "mp_gap_status": "无法判定",
            "scientific_status": "需先修正L4组成生成或由材料专家人工规范化",
            "matches": [],
        }

    docs, meta = request_chemsys(
        api_key, derived["query_chemsys"], timeout=timeout
    )
    expected = derived["derived_normalized_composition"]
    matches = []
    records_examined = []
    for doc in docs:
        observed = normalize_mp_composition(doc.get("composition"))
        summary = {
            "material_id": str(doc.get("material_id", "")),
            "formula_pretty": doc.get("formula_pretty"),
            "composition_normalized": rounded_composition(observed or {}),
            "is_stable": doc.get("is_stable"),
            "energy_above_hull": doc.get("energy_above_hull"),
        }
        records_examined.append(summary)
        if observed and compositions_match(expected, observed, MATCH_TOLERANCE):
            matches.append(summary)

    if matches:
        mp_gap_status = "已知材料，非Gap"
        scientific_status = "Materials Project存在精确组成匹配"
    else:
        mp_gap_status = "未见报道，符合Gap定义（仅Materials Project单库范围）"
        scientific_status = "仍需OQMD、NOMAD、文献检索和实验/计算验证"
    return {
        **common,
        "query_status": "completed",
        "mp_records_in_chemsys": len(docs),
        "mp_database_version": meta.get("db_version"),
        "records_examined": records_examined[:50],
        "records_examined_truncated": len(records_examined) > 50,
        "mp_gap_status": mp_gap_status,
        "scientific_status": scientific_status,
        "matches": matches,
    }


def load_candidates(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    candidates = payload.get("L4_application", {}).get("candidates", [])
    if not isinstance(candidates, list) or not candidates:
        raise RuntimeError(f"没有在 {path} 找到 L4_application.candidates")
    return candidates


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--key-file", type=Path, default=DEFAULT_KEY_FILE)
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    candidates = load_candidates(args.input)
    derivations = [derive_candidate_composition(item) for item in candidates]
    if args.dry_run:
        queryable = sum(item["queryable"] for item in derivations)
        print(f"候选组成预检: {queryable}/{len(derivations)} 可查询")
        return 0

    api_key = load_api_key(args.key_file)
    results = [
        crosscheck_candidate(candidate, api_key, timeout=args.timeout)
        for candidate in candidates
    ]
    completed = sum(item["query_status"] == "completed" for item in results)
    known = sum(item["mp_gap_status"] == "已知材料，非Gap" for item in results)
    not_found = sum(item["mp_gap_status"].startswith("未见报道") for item in results)
    invalid = len(results) - completed
    payload = {
        "schema_version": "1.0",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "source": "Materials Project materials/summary API",
        "api_endpoint": API_ENDPOINT,
        "authentication": "x-api-key header (credential omitted)",
        "matching_method": (
            "query exact chemical system, then compare normalized elemental "
            f"fractions with absolute tolerance {MATCH_TOLERANCE}"
        ),
        "limitations": [
            "单库未命中不等同于新材料发现",
            "负计量数候选未发送API查询，不能据此判断Gap",
            "仍需OQMD、NOMAD、原始文献及计算/实验验证",
        ],
        "summary": {
            "candidate_count": len(results),
            "queries_completed": completed,
            "known_materials": known,
            "mp_exact_match_not_found": not_found,
            "invalid_compositions_not_queried": invalid,
        },
        "results": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        "Materials Project交叉验证完成: "
        f"查询{completed}条，已知{known}条，未匹配{not_found}条，无效{invalid}条"
    )
    print(f"结果已写入: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
