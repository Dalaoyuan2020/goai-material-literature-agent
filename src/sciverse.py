"""
官方推荐检索源接入：Sciverse API (openDataLab)
docs: https://sciverse.opendatalab.com/docs/sciverse/api/meta-search
官方原话："鼓励通过 Sciverse API 的 MCP/Skill 接入，其调用记录天然构成可审计的证据链"
=> 每次调用都存原始请求+响应到 outputs/sciverse_calls/，这就是"可审计的证据链"

Key 存放：~/Documents/Claude_Mini_agent/_digital_assets/api_keys.env (SCIVERSE_KEY)
不进 git，不进任何会公开的文件。
"""
import os
import json
import time
import hashlib
import urllib.request
import urllib.error

BASE = "https://api.sciverse.space"
CALL_LOG_DIR = __file__.rsplit("/", 2)[0] + "/outputs/sciverse_calls"


def _load_key():
    key = os.environ.get("SCIVERSE_KEY")
    if key:
        return key
    env_path = os.path.expanduser(
        "~/Documents/Claude_Mini_agent/_digital_assets/api_keys.env"
    )
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("SCIVERSE_KEY="):
                    return line.split("=", 1)[1].strip()
    raise RuntimeError("SCIVERSE_KEY 未找到，请检查 api_keys.env")


def meta_search(query: str, year_gte: int = None, page_size: int = 10, fields=None):
    """结构化文献元数据检索，官方 meta-search 端点。
    每次调用自动落盘请求+响应，作为证据链的审计记录。"""
    key = _load_key()
    body = {
        "query": query,
        "fields": fields or [
            "title", "doi", "abstract", "publication_published_year",
            "publication_venue_name_unified", "citation_count",
        ],
        "page": 1,
        "page_size": page_size,
    }
    if year_gte:
        body["filters"] = [
            {"field": "publication_published_year", "operator": "FILTER_OP_GTE", "value": year_gte}
        ]

    req = urllib.request.Request(
        f"{BASE}/meta-search",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    call_id = hashlib.sha256(f"{query}{time.time()}".encode()).hexdigest()[:12]
    os.makedirs(CALL_LOG_DIR, exist_ok=True)

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            status = resp.status
    except urllib.error.HTTPError as e:
        data = {"error": e.code, "message": e.read().decode("utf-8", errors="ignore")}
        status = e.code

    with open(f"{CALL_LOG_DIR}/{call_id}.json", "w", encoding="utf-8") as f:
        json.dump({
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "request": body,
            "status": status,
            "response": data,
        }, f, ensure_ascii=False, indent=2)

    return data, call_id


if __name__ == "__main__":
    data, call_id = meta_search("superconductor cobalt doping iron pnictide", year_gte=2010, page_size=5)
    print(f"证据链记录: outputs/sciverse_calls/{call_id}.json")
    print(f"命中总数: {data.get('total_count', 'N/A')}")
    for r in data.get("results", [])[:5]:
        print(f"  - {r.get('title', '')[:70]}  ({r.get('publication_published_year')})  DOI:{r.get('doi')}")
