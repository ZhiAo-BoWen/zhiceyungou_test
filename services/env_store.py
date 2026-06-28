from pathlib import Path

import config

ENV_PATH = config.BASE_DIR / ".env"


def read_env_value(name: str, default: str = "") -> str:
    if not ENV_PATH.exists():
        return default
    prefix = f"{name}="
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        if line.startswith(prefix):
            return line[len(prefix) :].strip()
    return default


def update_env_file(name: str, value: str) -> None:
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
