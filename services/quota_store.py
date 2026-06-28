import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

import config

LOG_CATEGORY_LOGIN = "login"
LOG_CATEGORY_TASK = "task"
LOG_CATEGORY_APPLICATION = "application"
LOG_CATEGORY_ADMIN = "admin"
LOG_CATEGORY_QUOTA = "quota"
LOG_CATEGORY_WORKSPACE = "workspace"

LOG_CATEGORIES = {
    LOG_CATEGORY_LOGIN: "登录访问",
    LOG_CATEGORY_TASK: "任务执行",
    LOG_CATEGORY_APPLICATION: "体验申请",
    LOG_CATEGORY_ADMIN: "管理操作",
    LOG_CATEGORY_QUOTA: "额度变更",
    LOG_CATEGORY_WORKSPACE: "工作空间",
}

APPLICATION_PENDING = "pending"
APPLICATION_APPROVED = "approved"
APPLICATION_REJECTED = "rejected"

USERS_FILE = config.QUOTA_DIR / "users.json"
APPLICATIONS_FILE = config.QUOTA_DIR / "applications.json"
LOGS_FILE = config.QUOTA_DIR / "logs.json"


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except UnicodeDecodeError:
        try:
            text = path.read_bytes().decode("utf-8", errors="ignore")
            return _parse_first_json_object(text, default)
        except (json.JSONDecodeError, OSError, ValueError):
            return default
    except (json.JSONDecodeError, OSError):
        try:
            return _parse_first_json_object(path.read_text(encoding="utf-8", errors="ignore"), default)
        except (json.JSONDecodeError, OSError, ValueError):
            return default


def _parse_first_json_object(text: str, default: Any) -> Any:
    start = text.find("{")
    if start < 0:
        return default
    depth = 0
    for i in range(start, len(text)):
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[start : i + 1])
    return default


def _write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def get_client_ip(remote_addr: str | None, forwarded_for: str | None) -> str:
    if forwarded_for:
        ip = forwarded_for.split(",")[0].strip()
        if ip:
            return ip
    return (remote_addr or "").strip() or "unknown"


def _load_users() -> dict[str, dict[str, Any]]:
    data = _read_json(USERS_FILE, {})
    if isinstance(data, dict) and "users" in data:
        return data["users"]
    return data if isinstance(data, dict) else {}


def _save_users(users: dict[str, dict[str, Any]]) -> None:
    _write_json(USERS_FILE, {"users": users})


def _load_applications() -> list[dict[str, Any]]:
    data = _read_json(APPLICATIONS_FILE, [])
    return data if isinstance(data, list) else []


def _save_applications(items: list[dict[str, Any]]) -> None:
    _write_json(APPLICATIONS_FILE, items)


def _load_logs() -> list[dict[str, Any]]:
    data = _read_json(LOGS_FILE, [])
    return data if isinstance(data, list) else []


def _save_logs(items: list[dict[str, Any]]) -> None:
    _write_json(LOGS_FILE, items)


def append_log(
    category: str,
    ip: str,
    message: str,
    *,
    remaining: int | None = None,
    last_login_at: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    user = get_user(ip)
    entry = {
        "id": str(uuid.uuid4())[:12],
        "category": category,
        "category_label": LOG_CATEGORIES.get(category, category),
        "ip": ip,
        "remaining": remaining if remaining is not None else user.get("remaining", 0),
        "last_login_at": last_login_at or user.get("last_login_at", ""),
        "message": message,
        "created_at": _now(),
    }
    if extra:
        entry.update(extra)
    logs = _load_logs()
    logs.insert(0, entry)
    _save_logs(logs[:2000])
    return entry


def get_user(ip: str) -> dict[str, Any]:
    users = _load_users()
    if ip not in users:
        users[ip] = {
            "ip": ip,
            "remaining": config.DEFAULT_IP_QUOTA,
            "used": 0,
            "last_login_at": "",
            "created_at": _now(),
            "workspace_path": "",
            "workspace_allocated_at": "",
        }
        _save_users(users)
    return users[ip]


def touch_login(ip: str) -> dict[str, Any]:
    users = _load_users()
    user = get_user(ip)
    user["last_login_at"] = _now()
    users[ip] = user
    _save_users(users)
    append_log(LOG_CATEGORY_LOGIN, ip, "用户访问系统", remaining=user["remaining"])
    return user


def get_quota_status(ip: str, *, record_login: bool = False) -> dict[str, Any]:
    user = touch_login(ip) if record_login else get_user(ip)
    return {
        "ip": ip,
        "remaining": user.get("remaining", 0),
        "used": user.get("used", 0),
        "limit": config.DEFAULT_IP_QUOTA,
        "last_login_at": user.get("last_login_at", ""),
        "can_submit": user.get("remaining", 0) > 0,
    }


def require_quota(ip: str) -> dict[str, Any]:
    user = get_user(ip)
    if int(user.get("remaining", 0)) <= 0:
        raise ValueError("体验次数已用完，请申请额外次数")
    return user


def consume_quota(ip: str, message: str = "任务分析完成") -> dict[str, Any]:
    users = _load_users()
    user = get_user(ip)
    remaining = int(user.get("remaining", 0))
    if remaining <= 0:
        raise ValueError("体验次数已用完，请申请额外次数")

    user["remaining"] = remaining - 1
    user["used"] = int(user.get("used", 0)) + 1
    users[ip] = user
    _save_users(users)
    append_log(
        LOG_CATEGORY_TASK,
        ip,
        message,
        remaining=user["remaining"],
        last_login_at=user.get("last_login_at", ""),
    )
    return user


def grant_quota(ip: str, count: int, message: str) -> dict[str, Any]:
    if count <= 0:
        raise ValueError("授予次数必须大于 0")
    users = _load_users()
    user = get_user(ip)
    user["remaining"] = int(user.get("remaining", 0)) + count
    users[ip] = user
    _save_users(users)
    append_log(
        LOG_CATEGORY_QUOTA,
        ip,
        message,
        remaining=user["remaining"],
        last_login_at=user.get("last_login_at", ""),
        extra={"granted": count},
    )
    return user


def list_users() -> list[dict[str, Any]]:
    users = _load_users()
    items = list(users.values())
    items.sort(key=lambda u: u.get("last_login_at", ""), reverse=True)
    return items


def submit_application(ip: str, nickname: str, reason: str) -> dict[str, Any]:
    nickname = (nickname or "").strip()
    reason = (reason or "").strip()
    if not nickname:
        raise ValueError("请填写昵称")
    if not reason:
        raise ValueError("请填写申请理由")

    pending = [
        item
        for item in _load_applications()
        if item.get("ip") == ip and item.get("status") == APPLICATION_PENDING
    ]
    if pending:
        raise ValueError("您已有待处理的申请，请等待管理员审核")

    application = {
        "id": str(uuid.uuid4())[:10],
        "ip": ip,
        "nickname": nickname,
        "reason": reason,
        "status": APPLICATION_PENDING,
        "status_label": "待审核",
        "created_at": _now(),
        "reviewed_at": "",
        "review_note": "",
        "granted": 0,
    }
    items = _load_applications()
    items.insert(0, application)
    _save_applications(items)
    append_log(
        LOG_CATEGORY_APPLICATION,
        ip,
        f"提交体验次数申请：{nickname}",
        extra={"application_id": application["id"], "nickname": nickname},
    )
    return application


def list_applications(status: str | None = None) -> list[dict[str, Any]]:
    items = _load_applications()
    if status:
        items = [item for item in items if item.get("status") == status]
    return items


def review_application(
    application_id: str,
    action: str,
    *,
    granted: int = 2,
    review_note: str = "",
) -> dict[str, Any]:
    items = _load_applications()
    target = next((item for item in items if item.get("id") == application_id), None)
    if not target:
        raise ValueError("申请不存在")
    if target.get("status") != APPLICATION_PENDING:
        raise ValueError("该申请已处理")

    if action == "approve":
        grant_count = max(1, int(granted))
        target["status"] = APPLICATION_APPROVED
        target["status_label"] = "已通过"
        target["granted"] = grant_count
        target["review_note"] = (review_note or "").strip()
        target["reviewed_at"] = _now()
        grant_quota(
            target["ip"],
            grant_count,
            f"管理员批准申请（{target.get('nickname', '')}）+{grant_count}",
        )
        append_log(
            LOG_CATEGORY_ADMIN,
            target["ip"],
            f"批准体验申请 +{grant_count}：{target.get('nickname', '')}",
            extra={"application_id": application_id, "granted": grant_count},
        )
    elif action == "reject":
        target["status"] = APPLICATION_REJECTED
        target["status_label"] = "已拒绝"
        target["review_note"] = (review_note or "").strip()
        target["reviewed_at"] = _now()
        append_log(
            LOG_CATEGORY_ADMIN,
            target["ip"],
            f"拒绝体验申请：{target.get('nickname', '')}",
            extra={"application_id": application_id},
        )
    else:
        raise ValueError("无效操作")

    _save_applications(items)
    return target


def list_logs(category: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
    logs = _load_logs()
    if category:
        logs = [item for item in logs if item.get("category") == category]
    return logs[:limit]
