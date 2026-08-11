"""Audited STEP -> Gemini -> heuristic decision client.

Only the Python standard library is used.  API credentials are read at runtime,
never written to audits, and never added to the repository.  Every logical LLM
decision produces one JSON audit record even when both providers are unavailable
and the caller has to use the explicit heuristic fallback.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_AUDIT_DIR = REPO_ROOT / "outputs" / "llm_calls"
DEFAULT_SECRET_PATHS = (
    REPO_ROOT.parent / "_digital_assets" / "api_keys.env",
    Path.home() / "Documents" / "Claude_Mini_agent" / "_digital_assets" / "api_keys.env",
    Path.home() / ".goai_agent_secrets" / "api_keys.env",
)


def _parse_env_file(path):
    values = {}
    if not path or not Path(path).is_file():
        return values
    for raw_line in Path(path).read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            continue
        values[key] = value.strip().strip("\"'")
    return values


def load_runtime_config(secret_paths=None):
    """Merge known secret files and environment variables without mutating os.environ."""

    paths = []
    explicit = os.environ.get("GOAI_API_KEYS_FILE")
    if explicit:
        paths.append(Path(explicit).expanduser())
    paths.extend(DEFAULT_SECRET_PATHS if secret_paths is None else secret_paths)
    config = {}
    loaded_paths = []
    for path in paths:
        path = Path(path).expanduser()
        if path.is_file():
            config.update(_parse_env_file(path))
            loaded_paths.append(str(path))
    for key in (
        "STEP_API_KEY",
        "STEP_BASE",
        "STEP_MODEL",
        "GEMINI_KEY",
        "GEMINI_MODEL",
    ):
        if os.environ.get(key):
            config[key] = os.environ[key]
    return config, loaded_paths


def _extract_json(text):
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
        stripped = re.sub(r"\s*```$", "", stripped)
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        decoder = json.JSONDecoder()
        for index, char in enumerate(stripped):
            if char not in "[{":
                continue
            try:
                value, _ = decoder.raw_decode(stripped[index:])
                return value
            except json.JSONDecodeError:
                continue
    raise ValueError("LLM response did not contain valid JSON")


class AuditedLLMClient:
    def __init__(self, config=None, *, audit_dir=DEFAULT_AUDIT_DIR, timeout=20):
        if config is None:
            config, loaded_paths = load_runtime_config()
        else:
            config = dict(config)
            loaded_paths = []
        self.config = config
        self.loaded_secret_paths = loaded_paths
        self.audit_dir = Path(audit_dir)
        self.timeout = timeout
        self.calls = []

    @property
    def provider_availability(self):
        return {
            "step": bool(
                self.config.get("STEP_API_KEY") and self.config.get("STEP_BASE")
            ),
            "gemini": bool(self.config.get("GEMINI_KEY")),
        }

    def _post_json(self, url, payload, headers):
        request = urllib.request.Request(
            url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json", **headers},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            return json.loads(response.read().decode("utf-8"))

    def _call_step(self, system_prompt, user_prompt):
        base = self.config["STEP_BASE"].rstrip("/")
        endpoint = base if base.endswith("/chat/completions") else f"{base}/chat/completions"
        model = self.config.get("STEP_MODEL", "step-2-16k")
        payload = {
            "model": model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        raw = self._post_json(
            endpoint,
            payload,
            {"Authorization": f"Bearer {self.config['STEP_API_KEY']}"},
        )
        text = raw["choices"][0]["message"]["content"]
        return _extract_json(text), text, model, endpoint

    def _call_gemini(self, system_prompt, user_prompt):
        model = self.config.get("GEMINI_MODEL", "gemini-3.6-flash")
        endpoint = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent"
        )
        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": {
                "temperature": 0,
                "responseMimeType": "application/json",
            },
        }
        raw = self._post_json(
            endpoint,
            payload,
            {"x-goog-api-key": self.config["GEMINI_KEY"]},
        )
        text = raw["candidates"][0]["content"]["parts"][0]["text"]
        return _extract_json(text), text, model, endpoint

    @staticmethod
    def _safe_error(error):
        if isinstance(error, urllib.error.HTTPError):
            try:
                body = error.read(1000).decode("utf-8", errors="replace")
            except Exception:
                body = ""
            return f"HTTP {error.code}: {body}"[:1200]
        return f"{type(error).__name__}: {error}"[:1200]

    def decide(self, task, system_prompt, payload, heuristic):
        """Return a validated-by-caller JSON decision and persist its audit."""

        call_id = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}-{uuid.uuid4().hex[:8]}"
        user_prompt = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        audit = {
            "call_id": call_id,
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "task": task,
            "request": {
                "system_prompt": system_prompt,
                "payload": payload,
            },
            "secret_paths_loaded": self.loaded_secret_paths,
            "credentials_written_to_audit": False,
            "attempts": [],
        }
        result = None
        for provider in ("step", "gemini"):
            availability = self.provider_availability[provider]
            if not availability:
                audit["attempts"].append(
                    {"provider": provider, "status": "skipped_missing_configuration"}
                )
                continue
            started = time.monotonic()
            try:
                caller = self._call_step if provider == "step" else self._call_gemini
                value, raw_text, model, endpoint = caller(system_prompt, user_prompt)
                attempt = {
                    "provider": provider,
                    "status": "success",
                    "model": model,
                    "endpoint": endpoint,
                    "latency_ms": round((time.monotonic() - started) * 1000),
                    "raw_response": raw_text,
                }
                audit["attempts"].append(attempt)
                result = {
                    "value": value,
                    "provider": provider,
                    "model": model,
                    "mode": "real_llm_api",
                    "real_llm_api_called": True,
                }
                break
            except Exception as error:
                audit["attempts"].append(
                    {
                        "provider": provider,
                        "status": "failed",
                        "latency_ms": round((time.monotonic() - started) * 1000),
                        "error": self._safe_error(error),
                    }
                )
        if result is None:
            result = {
                "value": heuristic(),
                "provider": "heuristic",
                "model": None,
                "mode": "heuristic_fallback_not_real_llm",
                "real_llm_api_called": False,
            }
            audit["attempts"].append(
                {
                    "provider": "heuristic",
                    "status": "fallback_used",
                    "reason": "no configured provider returned valid JSON",
                }
            )
        audit["result"] = result
        self.audit_dir.mkdir(parents=True, exist_ok=True)
        audit_path = self.audit_dir / f"{call_id}.json"
        audit_path.write_text(
            json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        result["call_id"] = call_id
        result["audit_path"] = str(audit_path)
        self.calls.append(result)
        return result

    def rank_candidates(self, candidates, history_summary, batch_size):
        candidate_summaries = [
            {
                "candidate_id": item["candidate_id"],
                "relation_type": item.get("relation_type"),
                "source_rank": item.get("source_rank"),
                "target_base": item.get("target_base"),
                "source_cosine_hint": item.get("source_cosine_hint"),
                "score": item.get("score"),
            }
            for item in candidates
        ]

        def heuristic():
            ordered = sorted(
                candidate_summaries,
                key=lambda item: (
                    -next(
                        candidate.get("exposed_round", 1)
                        for candidate in candidates
                        if candidate["candidate_id"] == item["candidate_id"]
                    ),
                    -abs(item.get("source_cosine_hint") or item.get("score") or 0.0),
                    item["candidate_id"],
                ),
            )
            return {
                "ranked_candidate_ids": [
                    item["candidate_id"] for item in ordered[:batch_size]
                ],
                "reason": "deterministic evidence score ordering",
            }

        return self.decide(
            "candidate_ranking",
            (
                "你是材料类比搜索的候选筛选器。只能返回 JSON。候选都是未验证假设；"
                "不得把 MatKG 弱证据当强证据。兼顾高余弦证据与新开放方向，只能从给定 ID 中排序。"
            ),
            {
                "instruction": f"选出并排序最多 {batch_size} 个候选",
                "history_summary": history_summary,
                "candidates": candidate_summaries,
                "required_schema": {
                    "ranked_candidate_ids": ["candidate_id"],
                    "reason": "string",
                },
            },
            heuristic,
        )

    def decide_expansion(self, round_summary, directions, heuristic):
        return self.decide(
            "round_expansion_decision",
            (
                "你是材料类比搜索的轮次控制器。只能返回 JSON。根据本轮结果决定继续深挖"
                "当前 relation_type，还是换到仍有未开放证据源的方向。只能选择 expandable=true 的方向。"
            ),
            {
                "question": "下一轮继续深挖还是换方向？",
                "round_summary": round_summary,
                "directions": directions,
                "required_schema": {
                    "action": "deepen|switch|stop_no_unexposed_source",
                    "relation_types": ["relation_type"],
                    "reason": "string",
                },
            },
            heuristic,
        )
