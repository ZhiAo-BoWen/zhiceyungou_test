from pathlib import Path

import config

ENV_PATH = config.BASE_DIR / ".env"


def mask_api_key(key: str) -> str:
    key = (key or "").strip()
    if not key:
        return ""
    if len(key) <= 10:
        return "*" * len(key)
    return f"{key[:6]}...{key[-4:]}"


def get_api_key_status() -> dict:
    key = (config.DASHSCOPE_API_KEY or "").strip()
    return {
        "configured": bool(key),
        "masked": mask_api_key(key),
    }


def _update_env_file(name: str, value: str) -> None:
    lines: list[str] = []
    if ENV_PATH.exists():
        lines = ENV_PATH.read_text(encoding="utf-8").splitlines()

    updated: list[str] = []
    found = False
    for line in lines:
        if line.startswith(f"{name}="):
            updated.append(f"{name}={value}")
            found = True
        else:
            updated.append(line)
    if not found:
        updated.append(f"{name}={value}")

    ENV_PATH.write_text("\n".join(updated) + "\n", encoding="utf-8")


def save_api_key(api_key: str) -> dict:
    api_key = (api_key or "").strip()
    if not api_key:
        raise ValueError("API Key 不能为空")

    _update_env_file("DASHSCOPE_API_KEY", api_key)
    config.DASHSCOPE_API_KEY = api_key
    return get_api_key_status()
