import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

import config

STATUS_RUNNING = "running"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"

STATUS_LABELS = {
    STATUS_RUNNING: "进行中",
    STATUS_COMPLETED: "已完成",
    STATUS_FAILED: "已失败",
}


def status_label(status: str) -> str:
    return STATUS_LABELS.get(status, status)


def _task_path(task_id: str) -> Path:
    return config.TASKS_DIR / f"{task_id}.json"


def _write_task(task: dict[str, Any]) -> dict[str, Any]:
    _task_path(task["id"]).write_text(
        json.dumps(task, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return task


def list_tasks() -> list[dict[str, Any]]:
    tasks = []
    for file in sorted(config.TASKS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(file.read_text(encoding="utf-8"))
            status = data.get("status", STATUS_COMPLETED)
            tasks.append(
                {
                    "id": data.get("id", file.stem),
                    "title": data.get("title", "未命名任务"),
                    "created_at": data.get("created_at", ""),
                    "status": status,
                    "status_label": status_label(status),
                    "model": data.get("model", ""),
                }
            )
        except (json.JSONDecodeError, OSError):
            continue
    return tasks


def get_task(task_id: str) -> dict[str, Any] | None:
    path = _task_path(task_id)
    if not path.exists():
        return None
    task = json.loads(path.read_text(encoding="utf-8"))
    task["status_label"] = status_label(task.get("status", STATUS_COMPLETED))
    return task


def create_task(
    form_data: dict[str, Any],
    model: str,
    source: str = "form",
    upload_path: str = "",
) -> dict[str, Any]:
    task_id = str(uuid.uuid4())[:8]
    title = form_data.get("project_name") or "未命名项目"
    task = {
        "id": task_id,
        "title": title,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "status": STATUS_RUNNING,
        "status_label": status_label(STATUS_RUNNING),
        "model": model,
        "source": source,
        "form_data": form_data,
        "result": None,
        "error": "",
        "workspace_path": "",
        "upload_path": upload_path,
    }
    return _write_task(task)


def complete_task(
    task_id: str,
    result: dict[str, Any],
    form_data: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    task = get_task(task_id)
    if not task:
        return None
    if form_data is not None:
        task["form_data"] = form_data
        task["title"] = form_data.get("project_name") or task["title"]
    task["status"] = STATUS_COMPLETED
    task["status_label"] = status_label(STATUS_COMPLETED)
    task["result"] = result
    task["error"] = ""
    return _write_task(task)


def fail_task(task_id: str, error: str) -> dict[str, Any] | None:
    task = get_task(task_id)
    if not task:
        return None
    task["status"] = STATUS_FAILED
    task["status_label"] = status_label(STATUS_FAILED)
    task["error"] = error
    return _write_task(task)


def save_task(
    form_data: dict[str, Any],
    result: dict[str, Any],
    model: str,
    source: str = "form",
) -> dict[str, Any]:
    task = create_task(form_data, model, source)
    return complete_task(task["id"], result, form_data) or task


def delete_task(task_id: str) -> bool:
    path = _task_path(task_id)
    if path.exists():
        path.unlink()
        return True
    return False


def update_task_workspace(task_id: str, workspace_path: str) -> dict[str, Any] | None:
    task = get_task(task_id)
    if not task:
        return None
    task["workspace_path"] = workspace_path
    return _write_task(task)
