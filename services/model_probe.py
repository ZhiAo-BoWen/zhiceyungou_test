import time
from typing import Any

from openai import OpenAI

import config


def _client() -> OpenAI:
    if not config.DASHSCOPE_API_KEY:
        raise ValueError("请先配置 API Key")
    return OpenAI(api_key=config.DASHSCOPE_API_KEY, base_url=config.DASHSCOPE_BASE_URL)


def check_models_health(model_ids: list[str] | None = None) -> dict[str, Any]:
    """对配置模型做最小连通性探测。"""
    ids = model_ids or [m["id"] for m in config.AVAILABLE_MODELS]
    client = _client()
    results: list[dict[str, Any]] = []

    for model_id in ids:
        started = time.perf_counter()
        try:
            client.chat.completions.create(
                model=model_id,
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=1,
                temperature=0,
            )
            latency_ms = int((time.perf_counter() - started) * 1000)
            results.append(
                {
                    "id": model_id,
                    "name": next((m["name"] for m in config.AVAILABLE_MODELS if m["id"] == model_id), model_id),
                    "ok": True,
                    "latency_ms": latency_ms,
                }
            )
        except Exception as exc:
            latency_ms = int((time.perf_counter() - started) * 1000)
            results.append(
                {
                    "id": model_id,
                    "name": next((m["name"] for m in config.AVAILABLE_MODELS if m["id"] == model_id), model_id),
                    "ok": False,
                    "latency_ms": latency_ms,
                    "error": str(exc),
                }
            )

    ok_count = sum(1 for r in results if r["ok"])
    return {
        "results": results,
        "summary": f"{ok_count}/{len(results)} 个模型连通正常",
    }
